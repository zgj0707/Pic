// 应用顶层入口
// 声明全局状态、缓存 DOM 元素、绑定事件监听器并触发初始化

// ─── 全局状态 ───
const photos = [];
let selectedPhotos = new Set();
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

// ─── 其他状态 ───
let batchRatingValue = 0;
let searchDebounceTimer;
let rotateAngle = 0;
let importProgressUnsubscribe = null;
let currentPanel = 'gallery';
let browserMode = localStorage.getItem('browserMode') || 'xiaohongshu';
let currentViewMode = localStorage.getItem('photoViewMode') || 'masonry';
let isRecycleBinView = false;
let projects = [];
let currentProjectId = null;
let currentProjectName = '';
let activeSmartFilters = new Set();

// ─── DOM 缓存 ───
const photoGrid = document.getElementById('photoGrid');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const imageContainer = document.getElementById('imageContainer');
const toastContainer = document.getElementById('toastContainer');
const contextMenu = document.getElementById('contextMenu');
const metadataPanel = document.getElementById('metadataPanel');
const metadataPanelBtn = document.getElementById('metadataPanelBtn');

// ─── 照片数据加载 ───
function buildBackendPhotoFilter() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const rating = document.getElementById('ratingFilter').value;
  const tag = document.getElementById('tagFilter').value;
  const filter = {};
  if (!isRecycleBinView && currentProjectId !== null) {
    filter.projectId = currentProjectId;
  }
  if (search) filter.search = search;
  if (rating) filter.rating = parseInt(rating, 10);
  if (tag) filter.tags = [tag];

  // 智能筛选 chip
  activeSmartFilters.forEach(key => {
    if (key === 'favorite') filter.isFavorite = true;
    if (key === 'unrated') filter.rating = 0;
    if (key === 'rating-5') filter.rating = 5;
    if (key === 'rating-1') filter.rating = 1;
    if (key === 'orientation-landscape') filter.orientation = 'landscape';
    if (key === 'orientation-portrait') filter.orientation = 'portrait';
    if (key.startsWith('camera-')) filter.camera = decodeURIComponent(key.slice(7));
    if (key.startsWith('lens-')) filter.lens = decodeURIComponent(key.slice(5));
    if (key === 'recent') {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      filter.dateFrom = weekAgo;
    }
  });

  return filter;
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
  if (!isRecycleBinView) {
    await updateTagFilter();
  }
  updateDynamicFilterChips();
}

async function loadMorePhotos() {
  if (isLoadingPhotos) return;
  if (photoLoadedCount >= photoTotalCount) return;
  await loadPhotos(false);
}

// ─── 项目相关 ───
async function loadProjects() {
  if (!window.electronAPI?.projects?.getAll) return;
  try {
    projects = await window.electronAPI.projects.getAll();
    renderProjectSelector();
    renderProjectSidebar();
    const savedProjectId = localStorage.getItem('currentProjectId');
    const savedId = savedProjectId ? parseInt(savedProjectId, 10) : null;
    const targetProject = projects.find(p => p.id === savedId);
    if (targetProject) {
      await selectProject(targetProject.id);
    } else if (projects.length > 0 && currentProjectId === null) {
      await selectProject(projects[0].id);
    }
  } catch (e) {
    console.error('加载项目失败:', e);
  }
}

function renderProjectSelector() {
  const selector = document.getElementById('projectSelector');
  if (!selector) return;
  selector.innerHTML = projects.map(p =>
    `<option value="${p.id}" ${p.id === currentProjectId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');
}

function renderProjectSidebar() {
  const list = document.getElementById('projectList');
  if (!list) return;
  list.innerHTML = projects.map(p => `
    <div class="project-item ${p.id === currentProjectId ? 'active' : ''}" data-id="${p.id}" title="${escapeHtml(p.description || '')}">
      <span class="truncate">${escapeHtml(p.name)}</span>
      <span class="count">${p.photo_count || 0}</span>
    </div>
  `).join('');
  list.querySelectorAll('.project-item').forEach(item => {
    item.onclick = () => selectProject(parseInt(item.dataset.id, 10));
  });
}

async function selectProject(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;
  currentProjectId = id;
  currentProjectName = project.name;
  localStorage.setItem('currentProjectId', String(id));
  renderProjectSelector();
  renderProjectSidebar();
  updateStatusBar();
  if (isRecycleBinView) {
    isRecycleBinView = false;
    resetToolbarForGallery();
    setEmptyStateForGallery();
  }
  await loadPhotos(true);
}

async function createNewProject() {
  const name = prompt('请输入项目名称:');
  if (!name || !name.trim()) return;
  if (!window.electronAPI?.projects?.create) return;
  const result = await window.electronAPI.projects.create(name.trim());
  if (result.success && result.id) {
    await loadProjects();
    await selectProject(result.id);
    showToast('项目创建成功', 'success');
  } else {
    showToast('项目创建失败: ' + (result.error || ''), 'error');
  }
}

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
      panelTitle.textContent = '照片信息';
      countEl.textContent = '已选择 1 张照片';
      return;
    }
  }

  singlePanel.classList.add('hidden');
  batchPanel.classList.remove('hidden');
  panelTitle.textContent = '批量操作';
  countEl.textContent = `已选择 ${selectedPhotos.size} 张照片`;
}

function renderSinglePhotoInspector(photo) {
  document.getElementById('inspectFilename').textContent = photo.filename || '-';
  document.getElementById('inspectDimensions').textContent = photo.width && photo.height ? `${photo.width} × ${photo.height}` : '-';
  document.getElementById('inspectFilesize').textContent = formatFileSize(photo.filesize);
  document.getElementById('inspectDate').textContent = photo.created_at ? new Date(photo.created_at * 1000).toLocaleString('zh-CN') : '-';

  let exif = {};
  if (photo.exif_json) {
    try { exif = JSON.parse(photo.exif_json); } catch { /* ignore */ }
  }
  document.getElementById('inspectCamera').textContent = exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : (exif.Model || '-');
  document.getElementById('inspectLens').textContent = exif.LensModel || '-';
  document.getElementById('inspectAperture').textContent = exif.FNumber ? `f/${exif.FNumber}` : '-';
  document.getElementById('inspectISO').textContent = exif.ISO || '-';
  document.getElementById('inspectShutter').textContent = exif.ExposureTime ? `${exif.ExposureTime}s` : '-';
  document.getElementById('inspectFocal').textContent = exif.FocalLength ? `${exif.FocalLength}mm` : '-';

  const tagsContainer = document.getElementById('inspectTags');
  tagsContainer.innerHTML = (photo.tags || []).map(tag =>
    `<span class="tag-badge">${escapeHtml(tag)}</span>`
  ).join('') || '<span class="text-textDisabled text-xs">无标签</span>';
}

function updateStatusBar() {
  const projectEl = document.getElementById('statusProject');
  const viewEl = document.getElementById('statusView');
  const countEl = document.getElementById('statusCount');
  if (projectEl) projectEl.textContent = currentProjectName || '未选择项目';
  if (viewEl) viewEl.textContent = isRecycleBinView ? '回收站' : (currentViewMode === 'masonry' ? '瀑布流' : '紧凑视图');
  if (countEl) countEl.textContent = `${photoLoadedCount}/${photoTotalCount} 张照片`;
}

// ─── 批量评级事件 ───
document.querySelectorAll('#batchRating .star').forEach(star => {
  star.onclick = () => {
    const rating = parseInt(star.dataset.rating);
    if (batchRatingValue === rating) batchRatingValue = 0;
    else batchRatingValue = rating;

    document.querySelectorAll('#batchRating .star').forEach((s, idx) => {
      const isActive = idx < batchRatingValue;
      s.classList.toggle('active', isActive);
      s.querySelector('i').className = `fa-${isActive ? 'solid' : 'regular'} fa-star`;
    });
  };
});

document.getElementById('applyBatchRatingBtn').onclick = applyBatchRating;
document.getElementById('clearBatchRatingBtn').onclick = clearBatchRating;

// ─── 灯箱交互 ───
document.getElementById('zoomIn').onclick = () => {
  zoomScale = Math.min(5, zoomScale + 0.25);
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px)`;
  document.getElementById('zoomLevel').textContent = Math.round(zoomScale * 100) + '%';
};
document.getElementById('zoomOut').onclick = () => {
  zoomScale = Math.max(0.1, zoomScale - 0.25);
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px)`;
  document.getElementById('zoomLevel').textContent = Math.round(zoomScale * 100) + '%';
};
document.getElementById('zoomReset').onclick = resetZoom;

imageContainer.onwheel = (e) => {
  e.preventDefault();
  if (e.deltaY < 0) document.getElementById('zoomIn').click();
  else document.getElementById('zoomOut').click();
};

lightboxImage.onmousedown = (e) => {
  if (zoomScale > 1) {
    isDragging = true;
    dragStart = { x: e.clientX - imageOffset.x, y: e.clientY - imageOffset.y };
    lightboxImage.style.cursor = 'grabbing';
  }
};
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

document.getElementById('closeLightbox').onclick = closeLightbox;
document.getElementById('prevPhoto').onclick = () => {
  if (currentPhotoIndex > 0) openLightbox(filteredPhotos[--currentPhotoIndex], currentPhotoIndex);
};
document.getElementById('nextPhoto').onclick = () => {
  if (currentPhotoIndex < filteredPhotos.length - 1) openLightbox(filteredPhotos[++currentPhotoIndex], currentPhotoIndex);
};
document.getElementById('rotateLeft').onclick = () => rotateImage('left');
document.getElementById('rotateRight').onclick = () => rotateImage('right');
lightbox.onclick = (e) => {
  if (e.target === lightbox || e.target === imageContainer) closeLightbox();
};
lightboxImage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const currentPhoto = filteredPhotos[currentPhotoIndex];
  if (currentPhoto) {
    showContextMenu(e.clientX, e.clientY, currentPhoto.filepath || currentPhoto.thumbnail_path || '');
  }
});

document.querySelectorAll('#lightboxRating .star').forEach(star => {
  star.onclick = async () => {
    if (filteredPhotos.length === 0) {
      showToast('没有可操作的照片', 'warning');
      return;
    }

    if (currentPhotoIndex >= filteredPhotos.length) {
      currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
    }

    const rating = parseInt(star.dataset.rating);
    const photo = filteredPhotos[currentPhotoIndex];
    if (!photo) {
      showToast('无法获取当前照片信息', 'error');
      return;
    }

    const fullPhoto = photos.find(p => p.id === photo.id);
    if (!fullPhoto) {
      showToast('照片数据已失效，请刷新后重试', 'error');
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
  };
});

document.getElementById('addTagBtn').onclick = handleAddTag;
document.getElementById('tagInputCancel').onclick = () => document.getElementById('tagInputModal').classList.add('hidden');
document.getElementById('tagInputConfirm').onclick = confirmAddTag;
document.getElementById('tagInputField').onkeydown = (e) => { if (e.key === 'Enter') confirmAddTag(); };
document.getElementById('tagInputModal').onclick = (e) => { if (e.target === document.getElementById('tagInputModal')) document.getElementById('tagInputModal').classList.add('hidden'); };

// ─── 筛选与搜索 ───
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyPhotoFilters, 300);
});
document.getElementById('searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyPhotoFilters();
});
document.getElementById('ratingFilter').onchange = applyPhotoFilters;
document.getElementById('tagFilter').onchange = applyPhotoFilters;

function handleFilterChipClick(chip) {
  const key = chip.dataset.filter;
  if (key === 'all') {
    activeSmartFilters.clear();
  } else {
    // 同类筛选互斥：评级、构图、相机、镜头
    if (key.startsWith('rating-') || key === 'unrated') {
      activeSmartFilters.forEach(k => {
        if (k.startsWith('rating-') || k === 'unrated') activeSmartFilters.delete(k);
      });
    }
    if (key.startsWith('orientation-')) {
      activeSmartFilters.forEach(k => {
        if (k.startsWith('orientation-')) activeSmartFilters.delete(k);
      });
    }
    if (key.startsWith('camera-')) {
      activeSmartFilters.forEach(k => {
        if (k.startsWith('camera-')) activeSmartFilters.delete(k);
      });
    }
    if (key.startsWith('lens-')) {
      activeSmartFilters.forEach(k => {
        if (k.startsWith('lens-')) activeSmartFilters.delete(k);
      });
    }
    if (activeSmartFilters.has(key)) activeSmartFilters.delete(key);
    else activeSmartFilters.add(key);
  }
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === 'all' ? activeSmartFilters.size === 0 : activeSmartFilters.has(c.dataset.filter));
  });
  applyPhotoFilters();
}

function updateDynamicFilterChips() {
  const cameraContainer = document.getElementById('cameraFilterChips');
  const lensContainer = document.getElementById('lensFilterChips');
  if (!cameraContainer || !lensContainer) return;

  const cameras = new Set();
  const lenses = new Set();
  photos.forEach(photo => {
    if (!photo.exif_json) return;
    try {
      const exif = JSON.parse(photo.exif_json);
      if (exif.Model) cameras.add(exif.Make && exif.Model ? `${exif.Make} ${exif.Model}` : exif.Model);
      if (exif.LensModel) lenses.add(exif.LensModel);
    } catch { /* ignore */ }
  });

  renderChipGroup(cameraContainer, 'camera', Array.from(cameras).slice(0, 5));
  renderChipGroup(lensContainer, 'lens', Array.from(lenses).slice(0, 5));
}

function renderChipGroup(container, prefix, items) {
  container.innerHTML = '';
  items.forEach(item => {
    const key = `${prefix}-${encodeURIComponent(item)}`;
    const chip = document.createElement('span');
    chip.className = `filter-chip ${activeSmartFilters.has(key) ? 'active' : ''}`;
    chip.dataset.filter = key;
    chip.textContent = item;
    chip.addEventListener('click', () => handleFilterChipClick(chip));
    container.appendChild(chip);
  });
}

// 智能筛选 chip
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => handleFilterChipClick(chip));
});

// 项目选择器
document.getElementById('projectSelector').onchange = (e) => {
  const id = parseInt(e.target.value, 10);
  if (!isNaN(id)) selectProject(id);
};
document.getElementById('newProjectBtn').onclick = createNewProject;

// 点击 Logo 返回样片库视图
document.querySelector('header .text-accent')?.addEventListener('click', () => {
  if (isRecycleBinView) switchToGallery();
});

// 浏览器面板开关
document.getElementById('browserToggleBtn').onclick = () => {
  const panel = document.getElementById('browserPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) currentPanel = 'browser';
};
document.getElementById('closeBrowserPanel').onclick = () => {
  document.getElementById('browserPanel').classList.remove('open');
};

// 浏览器面板宽度拖拽
let isBrowserResizing = false;
const browserResizeHandle = document.querySelector('.browser-resize-handle');
if (browserResizeHandle) {
  browserResizeHandle.addEventListener('mousedown', (e) => {
    isBrowserResizing = true;
    const panel = document.getElementById('browserPanel');
    const startX = e.clientX;
    const startWidth = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent) => {
      if (!isBrowserResizing) return;
      const delta = startX - moveEvent.clientX;
      let newWidth = startWidth + delta;
      newWidth = Math.max(400, Math.min(900, newWidth));
      panel.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      isBrowserResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// 状态栏
document.getElementById('statusRecycleBtn').onclick = switchToRecycleBin;
document.getElementById('statusSettingsBtn').onclick = () => document.getElementById('settingsBtn').click();
document.getElementById('clearFilterBtn').onclick = () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('ratingFilter').value = '';
  document.getElementById('tagFilter').value = '';
  photoFilterState = { search: '', rating: '', tag: '' };
  activeSmartFilters.clear();
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
  selectedPhotos.clear();
  document.getElementById('selectedCount').textContent = '已选择 0 张照片';
  document.getElementById('deleteBtn').disabled = true;
  document.getElementById('exportPdfBtn').disabled = true;
  document.getElementById('copyToDesktopBtn').disabled = true;
  metadataPanel.classList.remove('open');
  batchTags = [];
  removeTags = [];
  renderBatchTags();
  document.getElementById('removeTags').innerHTML = '';
  applyPhotoFilters();
};

// ─── 批量操作面板 ───
metadataPanelBtn.onclick = () => {
  metadataPanel.classList.toggle('open');
  // 侧边栏切换后重新布局瀑布流，适配新的可用宽度
  setTimeout(() => {
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  }, 300); // 等待动画完成
};
document.getElementById('closeMetadataPanel').onclick = () => {
  metadataPanel.classList.remove('open');
  // 侧边栏关闭后重新布局瀑布流，适配新的可用宽度
  setTimeout(() => {
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  }, 300); // 等待动画完成
};

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

document.getElementById('deleteBtn').onclick = deleteSelectedPhotos;
document.getElementById('restoreBtn').onclick = restoreSelectedPhotos;
document.getElementById('permanentDeleteBtn').onclick = permanentlyDeleteSelectedPhotos;

// 复制选中图片到桌面文件夹
document.getElementById('copyToDesktopBtn').onclick = copySelectedToDesktop;

document.getElementById('addBatchTagBtn').onclick = () => {
  const input = document.getElementById('batchTagInput');
  const tag = input.value.trim();
  if (tag) {
    addBatchTag(tag);
    input.value = '';
    input.focus(); // 添加标签后重新聚焦到输入框
  }
};

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

document.getElementById('applyBatchTagsBtn').onclick = applyBatchTags;
document.getElementById('addRemoveTagBtn').onclick = () => {
  const input = document.getElementById('removeTagInput');
  const tag = input.value.trim();
  if (tag && !removeTags.includes(tag)) {
    removeTags.push(tag);
    renderRemoveTags();
    input.value = '';
  }
};
document.getElementById('applyRemoveTagsBtn').onclick = applyRemoveTags;

// ─── 设置 ───
document.getElementById('settingsBtn').onclick = async () => {
  document.getElementById('settingsModal').classList.remove('hidden');
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
};
document.getElementById('closeSettingsBtn').onclick = () => document.getElementById('settingsModal').classList.add('hidden');
document.getElementById('settingsModal').onclick = (e) => { if (e.target === document.getElementById('settingsModal')) document.getElementById('settingsModal').classList.add('hidden'); };

document.getElementById('browseDownloadPath').onclick = async () => {
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
};

document.getElementById('openDownloadPathLink').onclick = async (e) => {
  e.preventDefault();
  if (window.electronAPI?.materialBrowser?.openDownloadDir) {
    await window.electronAPI.materialBrowser.openDownloadDir();
  }
};

document.getElementById('clearDownloadCacheBtn').onclick = async () => {
  if (!confirm('确定要清空下载缓存吗？')) return;
  if (window.electronAPI?.materialBrowser?.clearDownloadCache) {
    await window.electronAPI.materialBrowser.clearDownloadCache();
    showToast('下载缓存已清空', 'success');
  }
};

document.getElementById('clearAllCacheBtn').onclick = async () => {
  if (!confirm('确定要清空全部缩略图缓存吗？')) return;
  if (window.electronAPI?.cache?.clearAll) {
    const result = await window.electronAPI.cache.clearAll();
    showToast(`已清空 ${result.deleted} 个缓存文件`, 'success');
    await loadPhotos();
  }
};
document.getElementById('cleanOldCacheBtn').onclick = async () => {
  if (window.electronAPI?.cache?.cleanOld) {
    const result = await window.electronAPI.cache.cleanOld();
    showToast(`已清理 ${result.deleted} 个旧缓存文件`, 'success');
    await loadPhotos();
  }
};

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
    } else if (!metadataPanel.classList.contains('open')) {
      // do nothing
    } else {
      metadataPanel.classList.remove('open');
    }
  }
  if (!lightbox.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft') document.getElementById('prevPhoto').click();
    if (e.key === 'ArrowRight') document.getElementById('nextPhoto').click();
  }
});

// ─── 导入 ───
document.getElementById('importFolderBtn').onclick = importFromFolder;
document.getElementById('importFilesBtn').onclick = importFromFiles;
document.getElementById('emptyImportFolderBtn2').onclick = importFromFolder;

// ─── 关于 / 更新公告 ───
document.getElementById('aboutBtn').onclick = openAboutModal;
document.getElementById('closeAboutBtn').onclick = closeAboutModal;
document.getElementById('aboutModal').onclick = (e) => {
  if (e.target === document.getElementById('aboutModal')) {
    closeAboutModal();
  }
};

document.getElementById('changelogBtn').onclick = openChangelogModal;
document.getElementById('closeChangelogBtn').onclick = closeChangelogModal;
document.getElementById('changelogModal').onclick = (e) => {
  if (e.target === document.getElementById('changelogModal')) {
    closeChangelogModal();
  }
};

// ─── 视图切换 ───
document.getElementById('statusRecycleBtn').onclick = switchToRecycleBin;

// ─── 浏览器控制 ───
document.getElementById('browserBack').onclick = () => {
  const webview = document.getElementById('materialWebview');
  if (webview && webview.canGoBack) webview.goBack();
};
document.getElementById('browserForward').onclick = () => {
  const webview = document.getElementById('materialWebview');
  if (webview && webview.canGoForward) webview.goForward();
};
document.getElementById('browserRefresh').onclick = () => {
  const webview = document.getElementById('materialWebview');
  if (webview) webview.reload();
};
document.getElementById('browserGo').onclick = () => {
  const rawUrl = document.getElementById('browserUrl').value.trim();
  const webview = document.getElementById('materialWebview');
  if (!rawUrl || !webview) return;
  // 仅允许 http/https，阻止 file://、javascript: 等危险协议
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    webview.loadURL(parsed.toString());
  } catch {
    // invalid URL — ignore
  }
};
document.getElementById('browserUrl').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('browserGo').click();
};

document.getElementById('browserModeToggle').onclick = () => {
  setBrowserMode(browserMode === 'xiaohongshu' ? 'normal' : 'xiaohongshu');
};

document.getElementById('takeScreenshot').onclick = takeBrowserScreenshot;

// 下载目录功能
document.getElementById('openDownloadDir').onclick = openBrowserDownloadDir;
document.getElementById('clearDownloadCache').onclick = clearBrowserDownloadCache;

// 下载进度监听
if (window.electronAPI?.materialBrowser?.onDownloadStarted) {
  window.electronAPI.materialBrowser.onDownloadStarted((data) => {
    document.getElementById('downloadProgressBar').classList.remove('hidden');
    showToast(`开始下载: ${data.fileName}`, 'info');
  });
}

if (window.electronAPI?.materialBrowser?.onDownloadProgress) {
  window.electronAPI.materialBrowser.onDownloadProgress((data) => {
    document.getElementById('downloadProgressInner').style.width = `${data.percent || 0}%`;
  });
}

if (window.electronAPI?.materialBrowser?.onDownloadComplete) {
  window.electronAPI.materialBrowser.onDownloadComplete(async (data) => {
    document.getElementById('downloadProgressBar').classList.add('hidden');
    document.getElementById('downloadProgressInner').style.width = '0%';

    try {
      showProgress('导入照片', '正在导入...', '准备中');

      const result = await window.electronAPI.materialBrowser.importToLibrary(
        data.filePath,
        data.url || window.location.href,
        [],
        currentProjectId || undefined
      );

      hideProgress();

      if (result.success) {
        if (result.alreadyImported) {
          showToast('该照片已在样片库中', 'info');
        } else {
          showToast('已成功导入样片库', 'success');
        }

        // 只刷新照片数据，不跳转页面
        await new Promise(resolve => setTimeout(resolve, 200));
        await loadPhotos();
      } else {
        showToast('导入失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (e) {
      hideProgress();
      showToast('导入失败: ' + e, 'error');
    }
  });
}

if (window.electronAPI?.materialBrowser?.onDownloadFailed) {
  window.electronAPI.materialBrowser.onDownloadFailed((data) => {
    document.getElementById('downloadProgressBar').classList.add('hidden');
    document.getElementById('downloadProgressInner').style.width = '0%';
    showToast(`下载失败: ${data.fileName}`, 'error');
  });
}

// ─── 导出 PDF / 视图切换 ───
document.getElementById('exportPdfBtn').onclick = exportSelectedToPdf;

document.getElementById('viewToggleBtn').onclick = () => {
  setViewMode(currentViewMode === 'masonry' ? 'compact' : 'masonry');
};

// ─── 初始化 ───
let appInitialized = false;
function initApp() {
  if (appInitialized) return;
  appInitialized = true;
  initContextMenu();
  updateBrowserModeUI();
  initializeWebview();
  loadVersionInfo();
  loadProjects();
}

document.addEventListener('DOMContentLoaded', initApp);
initApp();
