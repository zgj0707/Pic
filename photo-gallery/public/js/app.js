// 应用顶层入口
// 声明全局状态、缓存 DOM 元素、绑定事件监听器并触发初始化

// ─── 全局状态 ───
const photos = [];
let currentPhotoIndex = 0;
let filteredPhotos = [];
let lastClickedIndex = -1;
let batchTags = [];
let removeTags = [];
let zoomScale = 1;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let imageOffset = { x: 0, y: 0 };
let masonryInstance = null;
let imageLoadCount = 0;
let totalImagesToLoad = 0;

// ─── 虚拟滚动状态 ───
let isVirtualScrollEnabled = false;
let gridLayoutItems = [];
let gridTotalHeight = 0;
let gridScrollContainer = null;
let gridScrollListenerAdded = false;
let gridScrollTickPending = false;
const VIRTUAL_BUFFER_RATIO = 1.0; // 上下各预留一屏缓冲区

// ─── 后端分页/按需加载状态 ───
const PAGE_SIZE = 200;
let photoTotalCount = 0;
let photoLoadedCount = 0;
let photoCurrentPage = 0;
let isLoadingPhotos = false;
let photoFilterState = { search: '', rating: '', tag: '' };
let reviewStateCounts = { unreviewed: 0, pick: 0, reject: 0 };

// ─── 其他状态 ───
let batchRatingValue = 0;
let searchDebounceTimer;
let rotateAngle = 0;
let importProgressUnsubscribe = null;

// ─── 项目相关状态 ───

// ─── DOM 缓存 ───
const photoGrid = document.getElementById('photoGrid');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const imageContainer = document.getElementById('imageContainer');
const toastContainer = document.getElementById('toastContainer');
const contextMenu = document.getElementById('contextMenu');
const metadataPanel = document.getElementById('metadataPanel');
const metadataPanelBtn = document.getElementById('metadataPanelBtn');

// ─── 样片数据加载 ───
function buildBackendPhotoFilter() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const rating = document.getElementById('ratingFilter').value;
  const tag = document.getElementById('tagFilter').value;
  const filter = {};

  // 回收站视图不限制项目；普通视图按当前项目筛选
  if (!isRecycleBinView && currentProjectId !== null) {
    filter.projectId = currentProjectId;
  }

  if (search) filter.search = search;
  if (rating) filter.rating = parseInt(rating, 10);
  if (tag) filter.tags = [tag];

  // 智能筛选 chip
  activeSmartFilters.forEach(key => {
    if (key === 'favorite') filter.isFavorite = true;
    if (key === 'unrated') filter.unrated = true;
    if (key === 'rating-5') filter.rating = 5;
    if (key === 'rating-1') filter.rating = 1;
    if (key === 'orientation-landscape') filter.orientation = 'landscape';
    if (key === 'orientation-portrait') filter.orientation = 'portrait';
    if (key === 'source-web') filter.sourceType = 'web';
    if (key === 'source-local') filter.sourceType = 'local';
    if (key.startsWith('camera-')) filter.camera = decodeURIComponent(key.slice(7));
    if (key.startsWith('lens-')) filter.lens = decodeURIComponent(key.slice(5));
    if (key === 'recent') {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      filter.dateFrom = weekAgo;
    }
  });

  const categoryTags = REFERENCE_CATEGORY_PRESETS
    .filter(preset => activeSmartFilters.has(preset.key))
    .map(preset => preset.tag);
  if (categoryTags.length > 0) filter.tagsAll = categoryTags;

  return filter;
}


async function refreshReviewStateCounts() {
  if (isRecycleBinView || currentProjectId === null || !window.electronAPI?.photos?.countByReviewState) {
    reviewStateCounts = { unreviewed: 0, pick: 0, reject: 0 }
  } else {
    try {
      reviewStateCounts = await window.electronAPI.photos.countByReviewState(currentProjectId)
    } catch (error) {
      console.warn('读取初筛统计失败:', error)
    }
  }
  const unprocessed = document.getElementById('projectUnprocessedCount')
  if (unprocessed) unprocessed.textContent = String(reviewStateCounts.unreviewed)
}

async function loadPhotos(reset = true) {
  if (!window.electronAPI) {
    renderPhotoGrid();
    return;
  }

  if (reset) {
    photos.length = 0;
    photoCurrentPage = 0;
    photoLoadedCount = 0;
    photoTotalCount = 0;
    if (gridScrollContainer) gridScrollContainer.scrollTop = 0;
  }
  if (isLoadingPhotos) return;
  isLoadingPhotos = true;

  try {
    let data = [];
    if (isRecycleBinView) {
      if (reset) {
        photoTotalCount = await window.electronAPI.photos.countDeleted();
      }
      data = await window.electronAPI.photos.getDeleted({
        limit: PAGE_SIZE,
        offset: photoCurrentPage * PAGE_SIZE
      });
    } else {
      const filter = buildBackendPhotoFilter();
      if (reset) {
        photoTotalCount = await window.electronAPI.photos.count(filter);
      }
      data = await window.electronAPI.photos.getAll({
        filter,
        limit: PAGE_SIZE,
        offset: photoCurrentPage * PAGE_SIZE
      });
    }

    if (reset) {
      photos.length = 0;
    }
    photos.push(...data);
    photoLoadedCount = photos.length;
    photoCurrentPage++;

    renderPhotoGrid(reset);
    // 重置 currentPhotoIndex 到有效的位置
    if (filteredPhotos.length > 0 && currentPhotoIndex >= filteredPhotos.length) {
      currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
    }
  } catch (e) {
    console.error('加载失败:', e);
  } finally {
    isLoadingPhotos = false;
  }
  if (reset && !isRecycleBinView) await refreshReviewStateCounts()
  if (!isRecycleBinView) {
    await updateTagFilter();
  }
}

async function loadMorePhotos() {
  if (isLoadingPhotos) return;
  if (photoLoadedCount >= photoTotalCount) return;
  await loadPhotos(false);
}

// ─── 智能筛选 chip ───
function updateFilterChipUI() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const key = chip.dataset.filter;
    chip.classList.toggle('active', activeSmartFilters.has(key));
  });
}

function toggleSmartFilter(key) {
  // 部分筛选互斥，保证语义清晰
  const mutuallyExclusive = {
    'rating-5': ['rating-1', 'unrated'],
    'rating-1': ['rating-5', 'unrated'],
    'unrated': ['rating-5', 'rating-1'],
    'orientation-landscape': ['orientation-portrait'],
    'orientation-portrait': ['orientation-landscape'],
    'source-web': ['source-local'],
    'source-local': ['source-web']
  };

  if (activeSmartFilters.has(key)) {
    activeSmartFilters.delete(key);
  } else {
    if (mutuallyExclusive[key]) {
      mutuallyExclusive[key].forEach(k => activeSmartFilters.delete(k));
    }
    activeSmartFilters.add(key);
  }

  updateFilterChipUI();
  applyPhotoFilters();
}

async function loadCameraLensFilters() {
  if (!window.electronAPI) return;
  try {
    const allPhotos = await window.electronAPI.photos.getAll({ limit: 10000, offset: 0 });
    const cameras = new Set();
    const lenses = new Set();

    allPhotos.forEach(photo => {
      if (photo.exif_json) {
        try {
          const exif = JSON.parse(photo.exif_json);
          if (exif.Model || exif.cameraModel) cameras.add(exif.Model || exif.cameraModel);
          if (exif.LensModel || exif.lensModel) lenses.add(exif.LensModel || exif.lensModel);
        } catch {
          // ignore
        }
      }
    });

    const cameraContainer = document.getElementById('cameraFilterChips');
    const lensContainer = document.getElementById('lensFilterChips');
    const categoryContainer = document.getElementById('referenceCategoryFilterChips');
    if (categoryContainer) {
      categoryContainer.innerHTML = REFERENCE_CATEGORY_PRESETS.map(preset =>
        `<span class="filter-chip" data-filter="${preset.key}">${escapeHtml(preset.label)}</span>`
      ).join('');
    }
    if (cameraContainer) {
      cameraContainer.innerHTML = Array.from(cameras).slice(0, 5).map(camera =>
        `<span class="filter-chip" data-filter="camera-${encodeURIComponent(camera)}">${escapeHtml(camera)}</span>`
      ).join('');
    }
    if (lensContainer) {
      lensContainer.innerHTML = Array.from(lenses).slice(0, 5).map(lens =>
        `<span class="filter-chip" data-filter="lens-${encodeURIComponent(lens)}">${escapeHtml(lens)}</span>`
      ).join('');
    }

    // 重新绑定事件
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => toggleSmartFilter(chip.dataset.filter))
      chip.setAttribute('role', 'button')
      chip.setAttribute('tabindex', '0')
      chip.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          chip.click()
        }
      })
    })
  } catch (e) {
    console.error('加载器材筛选失败:', e);
  }
}

// ─── 右侧上下文面板 ───
function updateContextPanel() {
  const singlePanel = document.getElementById('singlePhotoInspector');
  const batchPanel = document.getElementById('batchOperationsPanel');
  const countEl = document.getElementById('selectedCount');
  const panelTitle = document.getElementById('metadataPanelTitle');
  if (!singlePanel || !batchPanel || !countEl || !panelTitle) return;

  if (selectedPhotos.size === 1) {
    const photoId = Array.from(selectedPhotos)[0];
    const photo = photos.find(p => p.id === photoId) || filteredPhotos.find(p => p.id === photoId);
    if (photo) {
      renderSinglePhotoInspector(photo);
      singlePanel.classList.remove('hidden');
      batchPanel.classList.add('hidden');
      panelTitle.textContent = '样片信息';
      countEl.textContent = '已选择 1 张样片';
      return;
    }
  }

  singlePanel.classList.add('hidden');
  batchPanel.classList.remove('hidden');
  panelTitle.textContent = '批量操作';
  countEl.textContent = `已选择 ${selectedPhotos.size} 张样片`;
}

function renderSinglePhotoInspector(photo) {
  const thumb = document.getElementById('inspectorThumb');
  if (thumb) thumb.src = photo.thumbnail_path || photo.filepath || '';

  document.getElementById('inspectorFilename').textContent = photo.filename || '-';
  document.getElementById('inspectorPath').textContent = photo.filepath || '-';
  document.getElementById('inspectorDimensions').textContent =
    photo.width && photo.height ? `${photo.width} × ${photo.height}` : '-';
  document.getElementById('inspectorFilesize').textContent = formatFileSize(photo.filesize);
  document.getElementById('inspectorImportedAt').textContent = formatDateTime(photo.imported_at);
  document.getElementById('inspectorDateTaken').textContent = formatDateTime(photo.created_at);
  document.getElementById('inspectorSourceType').textContent = photo.source_type === 'web' ? '网页采集' : '本地 / 未知';
  document.getElementById('inspectorSourceDomain').textContent = photo.source_domain || '未知';
  document.getElementById('inspectorSourceUrl').textContent = photo.source_url || '无原网页';
  document.getElementById('inspectorSourceNote').value = photo.source_note || '';
  const sourceButton = document.getElementById('inspectorOpenSourceBtn');
  sourceButton.classList.toggle('hidden', !photo.source_url);
  sourceButton.dataset.url = photo.source_url || '';

  let camera = '-';
  let lens = '-';
  if (photo.exif_json) {
    try {
      const exif = JSON.parse(photo.exif_json);
      camera = exif.Model || exif.cameraModel || '-';
      lens = exif.LensModel || exif.lensModel || '-';
    } catch {
      // ignore
    }
  }
  document.getElementById('inspectorCamera').textContent = camera;
  document.getElementById('inspectorLens').textContent = lens;

  document.getElementById('inspectorRating').textContent = photo.rating > 0 ? `${photo.rating} 星` : '未评级';
  document.getElementById('inspectorTags').textContent = (photo.tags || []).join(', ') || '无标签';
}

async function saveInspectorSourceNote() {
  const photoId = Array.from(selectedPhotos)[0];
  const photo = photos.find(candidate => candidate.id === photoId);
  const noteInput = document.getElementById('inspectorSourceNote');
  if (!photo || !noteInput || !window.electronAPI?.photos?.updateSourceNote) return;
  await window.electronAPI.photos.updateSourceNote(photo.id, noteInput.value);
  photo.source_note = noteInput.value.trim() || null;
  showToast('来源备注已保存', 'success');
}

document.getElementById('inspectorOpenSourceBtn')?.addEventListener('click', async () => {
  const url = document.getElementById('inspectorOpenSourceBtn')?.dataset.url;
  if (url && window.electronAPI?.materialBrowser?.openExternal) {
    await window.electronAPI.materialBrowser.openExternal(url);
  }
});
document.getElementById('inspectorSaveSourceNoteBtn')?.addEventListener('click', saveInspectorSourceNote);

// ─── 状态栏 ───
function updateStatusBar() {
  const projectEl = document.getElementById('statusProject');
  const viewEl = document.getElementById('statusView');
  const countEl = document.getElementById('statusCount');
  const backBtn = document.getElementById('statusBackToGallery');
  const project = projects.find(candidate => candidate.id === currentProjectId);
  const projectName = project?.name || currentProjectName || '未选择项目';
  const projectPhotoCount = project?.photo_count ?? (isRecycleBinView ? 0 : photoTotalCount);
  const unprocessedCount = isRecycleBinView ? 0 : (currentProjectId === null ? projectPhotoCount : reviewStateCounts.unreviewed);

  if (projectEl) {
    const span = projectEl.querySelector('span');
    if (span) span.textContent = projectName;
  }
  document.getElementById('headerProjectName')?.replaceChildren(document.createTextNode(projectName));
  document.getElementById('currentProjectTitle')?.replaceChildren(document.createTextNode(projectName));
  if (typeof renderProjectBrief === 'function') renderProjectBrief(project);
  document.getElementById('projectPhotoCount')?.replaceChildren(document.createTextNode(String(projectPhotoCount)));
  document.getElementById('projectUnprocessedCount')?.replaceChildren(document.createTextNode(String(unprocessedCount)));

  if (viewEl) viewEl.textContent = currentViewMode === 'compact' ? '紧凑视图' : '瀑布流';
  if (countEl) {
    countEl.textContent = isRecycleBinView
      ? `${photoLoadedCount}/${photoTotalCount} 张已删除`
      : `${photoLoadedCount}/${photoTotalCount} 张样片`;
  }
  if (backBtn) {
    const browserOpen = document.getElementById('materialBrowserPanel')?.classList.contains('open');
    const settingsOpen = !document.getElementById('settingsModal')?.classList.contains('hidden');
    backBtn.classList.toggle('hidden', !(isRecycleBinView || browserOpen || settingsOpen));
  }
}
function updateToolbarForGallery() {
  const deleteBtn = document.getElementById('deleteBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
  const importFolderBtn = document.getElementById('importFolderBtn');
  const importFilesBtn = document.getElementById('importFilesBtn');
  const searchWrap = document.getElementById('searchInput')?.parentElement;
  const ratingWrap = document.getElementById('ratingFilter')?.parentElement;

  if (isRecycleBinView) {
    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (restoreBtn) restoreBtn.classList.remove('hidden');
    if (permanentDeleteBtn) permanentDeleteBtn.classList.remove('hidden');
    if (importFolderBtn) importFolderBtn.classList.add('hidden');
    if (importFilesBtn) importFilesBtn.classList.add('hidden');
    if (searchWrap) searchWrap.classList.add('hidden');
    if (ratingWrap) ratingWrap.classList.add('hidden');
  } else {
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    if (restoreBtn) restoreBtn.classList.add('hidden');
    if (permanentDeleteBtn) permanentDeleteBtn.classList.add('hidden');
    if (importFolderBtn) importFolderBtn.classList.remove('hidden');
    if (importFilesBtn) importFilesBtn.classList.remove('hidden');
    if (searchWrap) searchWrap.classList.remove('hidden');
    if (ratingWrap) ratingWrap.classList.remove('hidden');
  }
}

// ─── 批量评级事件 ───
document.querySelectorAll('#batchRating .star').forEach(star => {
  star.addEventListener('click', () => {
    const rating = parseInt(star.dataset.rating);
    if (batchRatingValue === rating) batchRatingValue = 0;
    else batchRatingValue = rating;

    document.querySelectorAll('#batchRating .star').forEach((s, idx) => {
      const isActive = idx < batchRatingValue;
      s.classList.toggle('active', isActive);
      s.querySelector('i').className = `fa-${isActive ? 'solid' : 'regular'} fa-star`;
    });
  });
});

document.getElementById('applyBatchRatingBtn').addEventListener('click', applyBatchRating);
document.getElementById('clearBatchRatingBtn').addEventListener('click', clearBatchRating);

// ─── 灯箱交互 ───
document.getElementById('zoomIn').addEventListener('click', () => {
  zoomScale = Math.min(5, zoomScale + 0.25);
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px)`;
  document.getElementById('zoomLevel').textContent = Math.round(zoomScale * 100) + '%';
});
document.getElementById('zoomOut').addEventListener('click', () => {
  zoomScale = Math.max(0.1, zoomScale - 0.25);
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px)`;
  document.getElementById('zoomLevel').textContent = Math.round(zoomScale * 100) + '%';
});
document.getElementById('zoomReset').addEventListener('click', resetZoom);

imageContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY < 0) document.getElementById('zoomIn').click();
  else document.getElementById('zoomOut').click();
});

lightboxImage.addEventListener('mousedown', (e) => {
  if (zoomScale > 1) {
    isDragging = true;
    dragStart = { x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y };
    lightboxImage.style.cursor = 'grabbing';
  }
});
document.addEventListener('mousemove', (e) => {
  if (isDragging) {
    imageOffset = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px)`;
  }
});
document.addEventListener('mouseup', () => {
  isDragging = false;
  lightboxImage.style.cursor = zoomScale > 1 ? 'grab' : 'default';
});

document.getElementById('closeLightbox').addEventListener('click', closeLightbox);
document.getElementById('prevPhoto').addEventListener('click', () => {
  if (currentPhotoIndex > 0) openLightbox(filteredPhotos[--currentPhotoIndex], currentPhotoIndex);
});
document.getElementById('nextPhoto').addEventListener('click', () => {
  if (currentPhotoIndex < filteredPhotos.length - 1) openLightbox(filteredPhotos[++currentPhotoIndex], currentPhotoIndex);
});
document.getElementById('rotateLeft').addEventListener('click', () => rotateImage('left'));
document.getElementById('rotateRight').addEventListener('click', () => rotateImage('right'));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox || e.target === imageContainer) closeLightbox();
});
lightboxImage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const currentPhoto = filteredPhotos[currentPhotoIndex];
  if (currentPhoto) {
    showContextMenu(e.clientX, e.clientY, currentPhoto.filepath || currentPhoto.thumbnail_path || '');
  }
});

document.querySelectorAll('#lightboxRating .star').forEach(star => {
  star.addEventListener('click', async () => {
    if (filteredPhotos.length === 0) {
      showToast('没有可操作的样片', 'warning');
      return;
    }

    if (currentPhotoIndex >= filteredPhotos.length) {
      currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
    }

    const rating = parseInt(star.dataset.rating);
    const photo = filteredPhotos[currentPhotoIndex];
    if (!photo) {
      showToast('无法获取当前样片信息', 'error');
      return;
    }

    const fullPhoto = photos.find(p => p.id === photo.id);
    if (!fullPhoto) {
      showToast('样片数据已失效，请刷新后重试', 'error');
      await loadPhotos();
      return;
    }

    const newRating = fullPhoto.rating === rating ? 0 : rating;

    if (window.electronAPI) {
      await window.electronAPI.photos.updateRating(fullPhoto.id, newRating);
      if (fullPhoto.filepath) await window.electronAPI.exif.writeRating(fullPhoto.filepath, newRating);
    }
    fullPhoto.rating = newRating;
    updateLightboxRating(newRating);
    if (window.electronAPI) await loadPhotos(true);
    else renderPhotoGrid();
    showToast(newRating === 0 ? '已清除评分' : `已设置 ${newRating} 星`, 'success');
  });
});

document.getElementById('addTagBtn').addEventListener('click', handleAddTag);
document.getElementById('tagInputCancel').addEventListener('click', () => document.getElementById('tagInputModal').classList.add('hidden'));
document.getElementById('tagInputConfirm').addEventListener('click', confirmAddTag);
document.getElementById('tagInputField').addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmAddTag(); });
document.getElementById('tagInputModal').addEventListener('click', (e) => { if (e.target === document.getElementById('tagInputModal')) document.getElementById('tagInputModal').classList.add('hidden'); });

// ─── 筛选与搜索 ───
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyPhotoFilters, 300);
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyPhotoFilters();
});
document.getElementById('ratingFilter').addEventListener('change', applyPhotoFilters);
document.getElementById('tagFilter').addEventListener('change', applyPhotoFilters);
document.getElementById('clearFilterBtn').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('ratingFilter').value = '';
  document.getElementById('tagFilter').value = '';
  photoFilterState = { search: '', rating: '', tag: '' };
  activeSmartFilters.clear();
  updateFilterChipUI();
  selectedPhotos.clear();
  document.getElementById('selectedCount').textContent = '已选择 0 张样片';
  document.getElementById('deleteBtn').disabled = true;
  if (typeof updateDesktopSaveButton === 'function') updateDesktopSaveButton();
  metadataPanel.classList.remove('open');
  batchTags = [];
  removeTags = [];
  renderBatchTags();
  document.getElementById('removeTags').innerHTML = '';
  applyPhotoFilters();
});

// ─── 批量操作面板 ───
metadataPanelBtn.addEventListener('click', () => {
  metadataPanel.classList.toggle('open');
  // 侧边栏切换后重新布局瀑布流，适配新的可用宽度
  setTimeout(() => {
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  }, 300); // 等待动画完成
});
document.getElementById('closeMetadataPanel').addEventListener('click', () => {
  metadataPanel.classList.remove('open');
  // 侧边栏关闭后重新布局瀑布流，适配新的可用宽度
  setTimeout(() => {
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  }, 300); // 等待动画完成
});

// 侧边栏宽度拖拽调整功能
let isResizing = false;
let startX = 0;
let startWidth = 0;
const resizeHandle = document.querySelector('.resize-handle');

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  startX = e.clientX;
  startWidth = metadataPanel.offsetWidth;
  resizeHandle.style.background = '#0078d4';
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  // 添加临时事件监听
  const onMouseMove = (moveEvent) => {
    if (!isResizing) return;
    const delta = startX - moveEvent.clientX;
    let newWidth = startWidth + delta;
    newWidth = Math.max(200, Math.min(400, newWidth));
    document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    // 拖拽时实时重新布局瀑布流
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  };

  const onMouseUp = () => {
    isResizing = false;
    resizeHandle.style.background = 'transparent';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

// 同步工具栏图标的选中状态
const observer = new MutationObserver(() => {
  const isOpen = metadataPanel.classList.contains('open');
  if (isOpen) {
    metadataPanelBtn.classList.add('text-accent');
  } else {
    metadataPanelBtn.classList.remove('text-accent');
  }
});
observer.observe(metadataPanel, { attributes: true, attributeFilter: ['class'] });

document.getElementById('deleteBtn').addEventListener('click', deleteSelectedPhotos);
document.getElementById('restoreBtn').addEventListener('click', restoreSelectedPhotos);
document.getElementById('permanentDeleteBtn').addEventListener('click', permanentlyDeleteSelectedPhotos);

// 复制选中图片到桌面文件夹
document.getElementById('copyToDesktopBtn').addEventListener('click', copySelectedToDesktop);
document.getElementById('exportPdfBtn').addEventListener('click', exportSelectedToPdf);
document.getElementById('selectAllBtn')?.addEventListener('click', () => { void toggleSelectAllPhotos(); });

document.getElementById('addBatchTagBtn').addEventListener('click', () => {
  const input = document.getElementById('batchTagInput');
  const tag = input.value.trim();
  if (tag) {
    addBatchTag(tag);
    input.value = '';
    input.focus(); // 添加标签后重新聚焦到输入框
  }
});

document.getElementById('batchTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault(); // 阻止默认行为
    const input = document.getElementById('batchTagInput');
    const tag = input.value.trim();
    if (tag) {
      addBatchTag(tag);
      input.value = '';
    }
  }
});

// 确保输入框可以正常获得焦点
document.getElementById('batchTagInput').addEventListener('focus', (e) => {
  e.target.style.borderColor = '#0078d4';
});

document.getElementById('batchTagInput').addEventListener('blur', (e) => {
  e.target.style.borderColor = '#3a3a3a';
});

document.getElementById('removeTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const input = document.getElementById('removeTagInput');
    const tag = input.value.trim();
    if (tag && !removeTags.includes(tag)) {
      removeTags.push(tag);
      renderRemoveTags();
      input.value = '';
    }
  }
});

document.getElementById('applyBatchTagsBtn').addEventListener('click', applyBatchTags);
document.getElementById('addRemoveTagBtn').addEventListener('click', () => {
  const input = document.getElementById('removeTagInput');
  const tag = input.value.trim();
  if (tag && !removeTags.includes(tag)) {
    removeTags.push(tag);
    renderRemoveTags();
    input.value = '';
  }
});
document.getElementById('applyRemoveTagsBtn').addEventListener('click', applyRemoveTags);

// ─── 设置 ───
document.getElementById('settingsBtn').addEventListener('click', async () => {
  document.getElementById('settingsModal').classList.remove('hidden');
  updateStatusBar();
  const hotkeyValue = document.getElementById('screenshotHotkeyValue');
  const hotkeyStatus = document.getElementById('screenshotHotkeyStatus');
  if (window.electronAPI?.capture?.getHotkeyStatus) {
    const result = await window.electronAPI.capture.getHotkeyStatus();
    const hotkey = result?.data?.hotkey || 'Alt+A';
    if (hotkeyValue) hotkeyValue.textContent = hotkey.replace('+', ' + ');
    if (hotkeyStatus) {
      hotkeyStatus.textContent = result?.data?.registered
        ? '已注册，可全局使用'
        : '注册失败：可能与其他软件快捷键冲突';
      hotkeyStatus.className = result?.data?.registered
        ? 'mt-2 text-xs text-green-400'
        : 'mt-2 text-xs text-red-400';
    }
  }
  if (window.electronAPI?.cache?.getStats) {
    window.electronAPI.cache.getStats().then(stats => {
      document.getElementById('cacheSize').textContent = stats.formattedSize;
      document.getElementById('cacheFileCount').textContent = stats.fileCount + ' 个';
    });
  }
  if (window.electronAPI?.materialBrowser?.getDownloadDir) {
    const downloadDir = await window.electronAPI.materialBrowser.getDownloadDir();
    document.getElementById('downloadPath').value = downloadDir;
  }
});
document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  document.getElementById('settingsModal').classList.add('hidden');
  updateStatusBar();
});
document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('settingsModal')) {
    document.getElementById('settingsModal').classList.add('hidden');
    updateStatusBar();
  }
});

document.getElementById('browseDownloadPath').addEventListener('click', async () => {
  if (window.electronAPI?.dialog?.openDirectory) {
    const dir = await window.electronAPI.dialog.openDirectory();
    if (dir) {
      document.getElementById('downloadPath').value = dir;
      if (window.electronAPI?.materialBrowser?.setDownloadDir) {
        await window.electronAPI.materialBrowser.setDownloadDir(dir);
        showToast('下载目录已更新', 'success');
      }
    }
  }
});

document.getElementById('openDownloadPathLink').addEventListener('click', async (e) => {
  e.preventDefault();
  if (window.electronAPI?.materialBrowser?.openDownloadDir) {
    await window.electronAPI.materialBrowser.openDownloadDir();
  }
});

document.getElementById('clearDownloadCacheBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空下载缓存吗？')) return;
  if (window.electronAPI?.materialBrowser?.clearDownloadCache) {
    await window.electronAPI.materialBrowser.clearDownloadCache();
    showToast('下载缓存已清空', 'success');
  }
});

document.getElementById('clearAllCacheBtn').addEventListener('click', async () => {
  if (!confirm('确定要清空全部缩略图缓存吗？')) return;
  if (window.electronAPI?.cache?.clearAll) {
    const result = await window.electronAPI.cache.clearAll();
    showToast(`已清空 ${result.deleted} 个缓存文件`, 'success');
    await loadPhotos();
  }
});
document.getElementById('cleanOldCacheBtn').addEventListener('click', async () => {
  if (window.electronAPI?.cache?.cleanOld) {
    const result = await window.electronAPI.cache.cleanOld();
    showToast(`已清理 ${result.deleted} 个旧缓存文件`, 'success');
    await loadPhotos();
  }
});

// ─── 全局键盘事件 ───
document.addEventListener('keydown', (e) => {
  const activeElement = document.activeElement;
  if (activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.isContentEditable
  )) {
    return;
  }

  if (e.key === 'Escape') {
    if (!lightbox.classList.contains('hidden')) {
      closeLightbox();
    } else if (!document.getElementById('changelogModal').classList.contains('hidden')) {
      closeChangelogModal();
    } else if (!document.getElementById('aboutModal').classList.contains('hidden')) {
      closeAboutModal();
    } else if (!document.getElementById('settingsModal').classList.contains('hidden')) {
      returnToGallery();
    } else if (document.getElementById('materialBrowserPanel').classList.contains('open')) {
      returnToGallery();
    } else if (metadataPanel.classList.contains('open')) {
      metadataPanel.classList.remove('open');
    }
  }
  if (!lightbox.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') document.getElementById('prevPhoto').click();
    if (e.key === 'ArrowRight') document.getElementById('nextPhoto').click();
  }
});

// ─── 导入 ───
document.getElementById('importFolderBtn').addEventListener('click', importFromFolder);
document.getElementById('importFilesBtn').addEventListener('click', importFromFiles);
document.getElementById('emptyImportFolderBtn2').addEventListener('click', importFromFolder);

// ─── 关于 / 更新公告 ───
document.getElementById('aboutBtn').addEventListener('click', openAboutModal);
document.getElementById('closeAboutBtn').addEventListener('click', closeAboutModal);
document.getElementById('aboutModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('aboutModal')) {
    closeAboutModal();
  }
});

document.getElementById('changelogBtn').addEventListener('click', openChangelogModal);
document.getElementById('closeChangelogBtn').addEventListener('click', closeChangelogModal);
document.getElementById('changelogModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('changelogModal')) {
    closeChangelogModal();
  }
});


// ─── 智能筛选 chip 初始事件 ───
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => toggleSmartFilter(chip.dataset.filter));
  chip.setAttribute('role', 'button')
  chip.setAttribute('tabindex', '0')
  chip.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chip.click()
    }
  })
});

// ─── 导出 PDF / 视图切换 ───

document.getElementById('viewToggleBtn').addEventListener('click', () => {
  setViewMode(currentViewMode === 'masonry' ? 'compact' : 'masonry');
});

function bindCaptureEvents() {
  const capture = window.electronAPI?.capture;
  if (!capture) return;

  capture.onSaved?.(data => {
    void (async () => {
      if (data?.projectId !== currentProjectId) return;
      await loadPhotos(true);
      const project = projects.find(candidate => candidate.id === currentProjectId);
      if (project) project.photo_count = Number(project.photo_count || 0) + 1;
      renderProjectSidebar();
      updateStatusBar();
      if (data?.clipboardCopied === false) {
        showToast('截图已保存到当前项目样片库，但复制到剪贴板失败', 'warning');
      } else {
        showToast('截图已导入当前项目样片库并复制到剪贴板', 'success');
      }
    })();
  });

  capture.onError?.(data => {
    if (data?.error) showToast(data.error, 'warning');
  });
}
// ─── 初始化 ───
async function initializeApp() {
  bindCaptureEvents();
  initContextMenu();
  // Keep legacy persisted browser state compatible, but the material browser
  // now always embeds Xiaohongshu. Douyin is opened in the system browser.
  browserSource = 'xiaohongshu';
  browserMode = 'xiaohongshu';
  localStorage.setItem('browserSource', browserSource);
  localStorage.setItem('browserMode', browserMode);
  updateBrowserModeUI();
  initializeWebview();
  await loadVersionInfo();
  await loadProjects();
  await loadCameraLensFilters();

  // selectProject() already loads the selected project's photos. Only load
  // without a project when no project exists yet.
  if (currentProjectId === null && !isRecycleBinView) {
    await loadPhotos();
  }
}

void initializeApp();
