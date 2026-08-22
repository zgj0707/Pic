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
  if (search) filter.search = search;
  if (rating) filter.rating = parseInt(rating, 10);
  if (tag) filter.tags = [tag];
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
    const filter = buildBackendPhotoFilter();
    if (reset) {
      photoTotalCount = await window.electronAPI.photos.count(filter);
    }

    const data = await window.electronAPI.photos.getAll({
      filter,
      limit: PAGE_SIZE,
      offset: photoCurrentPage * PAGE_SIZE
    });

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
  await updateTagFilter();
}

async function loadMorePhotos() {
  if (isLoadingPhotos) return;
  if (photoLoadedCount >= photoTotalCount) return;
  await loadPhotos(false);
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
document.getElementById('clearFilterBtn').onclick = () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('ratingFilter').value = '';
  document.getElementById('tagFilter').value = '';
  photoFilterState = { search: '', rating: '', tag: '' };
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
document.getElementById('nav-gallery').onclick = switchToGallery;
document.getElementById('nav-browser').onclick = switchToBrowser;

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
        []
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
document.addEventListener('DOMContentLoaded', () => {
  initContextMenu();
  updateBrowserModeUI();
  initializeWebview();
});

updateBrowserModeUI();
initializeWebview();
loadVersionInfo();
loadPhotos();
