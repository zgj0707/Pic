// 样片网格、虚拟滚动与选择
// 与 index.html 共享全局状态变量

function createPhotoItem(photo, index, layout = null) {
  const item = document.createElement('div');
  item.className = 'photo-item' + (selectedPhotos.has(photo.id) ? ' selected' : '');
  item.draggable = true;
  item.dataset.id = photo.id;
  item.dataset.index = index;

  // 存储原始宽高比，用于瀑布流布局的初始计算
  const aspectRatio = photo.width && photo.height ? photo.height / photo.width : 0.75;
  item.dataset.aspectRatio = aspectRatio;

  // 虚拟滚动模式下直接应用预计算位置与尺寸
  if (layout) {
    item.style.position = 'absolute';
    item.style.left = `${layout.left}px`;
    item.style.top = `${layout.top}px`;
    item.style.width = `${layout.width}px`;
    item.style.height = `${layout.height}px`;
  }

  const imgSrc = photo.thumbnail_path || photo.filepath || '';

  item.innerHTML = `
    <div class="skeleton"></div>
    <div class="photo-content">
      <img data-src="${escapeHtml(imgSrc)}" alt="${escapeHtml(photo.filename)}" loading="lazy">
    </div>
  `;

  const img = item.querySelector('img');
  img.draggable = false;
  img.onload = () => {
    img.classList.add('loaded');
    const skeleton = item.querySelector('.skeleton');
    if (skeleton) skeleton.remove();
    imageLoadCount++;
    // 用真实尺寸更新 photo 对象，保证后续布局使用正确宽高比
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      photo.width = img.naturalWidth;
      photo.height = img.naturalHeight;
      item.dataset.aspectRatio = img.naturalHeight / img.naturalWidth;
    }
    // 图片加载后使用实际宽高比重新布局（瀑布流/虚拟滚动模式下尤为重要）
    scheduleLayout();
  };

  img.onerror = () => {
    const skeleton = item.querySelector('.skeleton');
    if (skeleton) skeleton.remove();
    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%233a3a3a" width="200" height="200"/%3E%3Ctext fill="%23666" font-family="sans-serif" font-size="14" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3E图片加载失败%3C/text%3E%3C/svg%3E';
    img.classList.add('loaded');
    imageLoadCount++;
  };

  img.src = imgSrc;

  item.addEventListener('dragstart', event => {
    const dragIds = selectedPhotos.has(photo.id)
      ? Array.from(selectedPhotos)
      : [photo.id];
    const payload = {
      sourceProjectId: currentProjectId,
      photoIds: dragIds
    };
    if (currentProjectId === null || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(window.PIC_PHOTO_DRAG_TYPE || 'application/x-pic-photo-ids', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', 'Pic 样片 ' + dragIds.length + ' 张');
    window.picPhotoDragActive = true;
    item.classList.add('is-dragging');
  });
  item.addEventListener('dragend', () => {
    window.picPhotoDragActive = false;
    item.classList.remove('is-dragging');
  });

  // 没有缩略图时，按需从后端生成并替换为更小的缩略图
  if (!photo.thumbnail_path && photo.filepath && window.electronAPI?.photos?.getThumbnail) {
    window.electronAPI.photos.getThumbnail(photo.id, 'grid').then(result => {
      if (result.success && result.data?.path && item.isConnected) {
        photo.thumbnail_path = result.data.path;
        img.src = result.data.path;
      }
    }).catch(() => {});
  }

  item.addEventListener('click', (e) => handlePhotoClick(e, photo, index));
  item.addEventListener('dblclick', (e) => { e.preventDefault(); openLightbox(photo, index); });
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, photo.filepath || photo.thumbnail_path || '');
  });

  return item;
}

function renderPhotoGrid(resetScroll = false) {
  // 在 Electron 环境下，筛选与分页由后端完成；浏览器演示模式仍保留本地筛选
  if (window.electronAPI) {
    filteredPhotos = photos.slice();
  } else {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();

    filteredPhotos = photos.filter(photo => {
      if (searchQuery) {
        const matchName = photo.filename?.toLowerCase().includes(searchQuery);
        const matchPath = photo.filepath?.toLowerCase().includes(searchQuery);
        if (!matchName && !matchPath) return false;
      }
      return true;
    });
  }

  if (isRecycleBinView) setEmptyStateForRecycleBin();
  else setEmptyStateForGallery();
  document.getElementById('emptyState').classList.toggle('hidden', filteredPhotos.length > 0);

  photoGrid.innerHTML = '';
  if (resetScroll && gridScrollContainer) gridScrollContainer.scrollTop = 0;
  isVirtualScrollEnabled = false;

  imageLoadCount = 0;
  totalImagesToLoad = filteredPhotos.length;

  updateStatusBar();
  restoreSelectedState();

  if (!gridScrollListenerAdded) {
    gridScrollContainer = document.getElementById('photoGridContainer');
    gridScrollContainer.addEventListener('scroll', onGridScroll, { passive: true });
    gridScrollListenerAdded = true;
  }

  if (currentViewMode === 'compact') {
    photoGrid.classList.add('compact-view');
    photoGrid.style.height = 'auto';
    filteredPhotos.forEach((photo, index) => {
      const item = createPhotoItem(photo, index);
      photoGrid.appendChild(item);
    });
  } else {
    photoGrid.classList.remove('compact-view');
    isVirtualScrollEnabled = true;
    computeGridLayout();
    renderVisibleGridItems();
  }
}

// 虚拟滚动：计算所有样片的瀑布流位置
function computeGridLayout() {
  const containerWidth = photoGrid.clientWidth - 32;
  const gap = 12;

  // 根据实际可用宽度调整列数（模拟窗口宽度变化的效果）
  let columns = 5;
  if (containerWidth < 600) columns = 2;
  else if (containerWidth < 900) columns = 3;
  else if (containerWidth < 1200) columns = 4;

  const itemWidth = (containerWidth - (columns - 1) * gap) / columns;

  const columnHeights = new Array(columns).fill(16);
  gridLayoutItems = filteredPhotos.map((photo, index) => {
    // 使用 photo 对象中的宽高比（加载后会用真实尺寸更新），失败则用默认比例
    const aspectRatio = photo.width && photo.height ? photo.height / photo.width : 0.75;
    const itemHeight = itemWidth * aspectRatio;

    let shortestColumn = 0;
    let minHeight = columnHeights[0];
    for (let i = 1; i < columns; i++) {
      if (columnHeights[i] < minHeight) {
        minHeight = columnHeights[i];
        shortestColumn = i;
      }
    }

    const left = 16 + shortestColumn * (itemWidth + gap);
    const top = columnHeights[shortestColumn];
    columnHeights[shortestColumn] += itemHeight + gap;

    return {
      index,
      photo,
      column: shortestColumn,
      left,
      top,
      width: itemWidth,
      height: itemHeight
    };
  });

  gridTotalHeight = Math.max(...columnHeights);
  photoGrid.style.height = `${gridTotalHeight}px`;
}

// 虚拟滚动：仅渲染可视区及缓冲区内的 DOM 节点
function renderVisibleGridItems() {
  if (!isVirtualScrollEnabled || !gridScrollContainer || gridLayoutItems.length === 0) return;

  const scrollTop = gridScrollContainer.scrollTop;
  const viewportHeight = gridScrollContainer.clientHeight;
  const buffer = viewportHeight * VIRTUAL_BUFFER_RATIO;
  const minTop = scrollTop - buffer;
  const maxTop = scrollTop + viewportHeight + buffer;

  const visibleIndices = new Set();
  gridLayoutItems.forEach(item => {
    if (item.top + item.height >= minTop && item.top <= maxTop) {
      visibleIndices.add(item.index);
    }
  });

  // 移除不在可视区的节点
  photoGrid.querySelectorAll('.photo-item').forEach(el => {
    const idx = parseInt(el.dataset.index, 10);
    if (!visibleIndices.has(idx)) {
      el.remove();
    }
  });

  // 更新已有节点的位置与尺寸，并创建新节点
  visibleIndices.forEach(idx => {
    const layout = gridLayoutItems[idx];
    const existing = photoGrid.querySelector(`.photo-item[data-index="${idx}"]`);
    if (existing) {
      existing.style.left = `${layout.left}px`;
      existing.style.top = `${layout.top}px`;
      existing.style.width = `${layout.width}px`;
      existing.style.height = `${layout.height}px`;
      existing.dataset.aspectRatio = layout.photo.height / layout.photo.width;
      return;
    }
    const item = createPhotoItem(layout.photo, layout.index, layout);
    photoGrid.appendChild(item);
  });
}

function onGridScroll() {
  if (gridScrollTickPending) return;
  gridScrollTickPending = true;
  requestAnimationFrame(() => {
    gridScrollTickPending = false;
    renderVisibleGridItems();
    // 接近当前已加载内容底部时，触发后端分页加载
    if (gridScrollContainer && photoLoadedCount < photoTotalCount) {
      const contentHeight = currentViewMode === 'compact'
        ? gridScrollContainer.scrollHeight
        : gridTotalHeight;
      const nearBottom = gridScrollContainer.scrollTop + gridScrollContainer.clientHeight >= contentHeight - gridScrollContainer.clientHeight * VIRTUAL_BUFFER_RATIO;
      if (nearBottom) loadMorePhotos();
    }
  });
}

// 保留旧函数名作为虚拟布局的兼容入口
function layoutMasonry() {
  if (!isVirtualScrollEnabled) return;
  computeGridLayout();
  renderVisibleGridItems();
}

// 使用 requestAnimationFrame 合并多次布局请求，避免频繁重排
let layoutPending = false;
function scheduleLayout() {
  if (layoutPending) return;
  layoutPending = true;
  requestAnimationFrame(() => {
    layoutPending = false;
    layoutMasonry();
  });
}

let resizeDebounceTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    if (currentViewMode !== 'compact' && filteredPhotos.length > 0) {
      computeGridLayout();
      renderVisibleGridItems();
    }
  }, 200);
});

function restoreSelectedState() {
  selectedPhotos.forEach(id => {
    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) item.classList.add("selected");
  });
}

function handlePhotoClick(e, photo, index) {
  const item = e.currentTarget;


  if (e.shiftKey && lastClickedIndex >= 0) {
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
      const photoId = filteredPhotos[i].id;
      const photoItem = document.querySelector(`[data-id="${photoId}"]`);
      if (photoItem) {
        selectedPhotos.add(photoId);
        photoItem.classList.add("selected");
      }
    }
    updateSelectedCount();
  } else {
    togglePhotoSelection(photo.id, item);
  }

  lastClickedIndex = index;
}

function togglePhotoSelection(photoId, item) {
  if (selectedPhotos.has(photoId)) {
    selectedPhotos.delete(photoId);
    item.classList.remove('selected');
  } else {
    selectedPhotos.add(photoId);
    item.classList.add('selected');
  }
  updateSelectedCount();
}

function updateDesktopSaveButton() {
  const count = typeof selectedPhotos !== 'undefined' ? selectedPhotos.size : 0;
  const referenceCount = typeof browserCollectedReferences !== 'undefined' ? browserCollectedReferences.length : 0;
  const copyButton = document.getElementById('copyToDesktopBtn');
  const copyLabel = document.getElementById('saveDesktopLabel');
  const pdfButton = document.getElementById('exportPdfBtn');
  const pdfLabel = document.getElementById('exportPdfLabel');
  if (copyButton) copyButton.disabled = count === 0 && referenceCount === 0;
  if (pdfButton) pdfButton.disabled = count === 0;
  if (copyLabel) {
    copyLabel.textContent = count > 0 && referenceCount > 0
      ? '保存已选与参考'
      : count > 0
        ? '保存已选'
        : referenceCount > 0
          ? '保存参考'
          : '保存到桌面';
  }
  if (pdfLabel) pdfLabel.textContent = count > 0 ? '导出已选 PDF' : '导出 PDF';
}

function updateSelectAllButton() {
  const button = document.getElementById('selectAllBtn');
  if (!button) return;
  const candidates = Array.isArray(filteredPhotos) ? filteredPhotos.filter(photo => photo && photo.id != null) : [];
  const selectedCount = candidates.filter(photo => selectedPhotos.has(photo.id)).length;
  const allSelected = candidates.length > 0 && selectedCount === candidates.length;
  button.disabled = candidates.length === 0;
  button.setAttribute('aria-pressed', String(allSelected));
  button.title = allSelected ? '取消选择当前筛选结果' : '选择当前筛选结果';
  const label = button.querySelector('span');
  if (label) label.textContent = allSelected ? '取消全选' : '全选';
}

async function toggleSelectAllPhotos() {
  const button = document.getElementById('selectAllBtn');
  if (button) button.disabled = true;
  try {
    if (window.electronAPI && photoLoadedCount < photoTotalCount) {
      while (photoLoadedCount < photoTotalCount) {
        const before = photoLoadedCount;
        await loadMorePhotos();
        if (photoLoadedCount <= before) break;
      }
    }
    const ids = (Array.isArray(filteredPhotos) ? filteredPhotos : []).filter(photo => photo && photo.id != null).map(photo => photo.id);
    if (ids.length === 0) return;
    const allSelected = ids.every(id => selectedPhotos.has(id));
    ids.forEach(id => {
      if (allSelected) selectedPhotos.delete(id);
      else selectedPhotos.add(id);
    });
    document.querySelectorAll('.photo-item[data-id]').forEach(item => {
      const id = Number(item.dataset.id);
      if (ids.includes(id)) item.classList.toggle('selected', !allSelected);
    });
    updateSelectedCount();
  } finally {
    updateSelectAllButton();
  }
}
function updateSelectedCount() {
  const count = selectedPhotos.size;
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) selectedCountEl.textContent = `已选择 ${count} 张样片`;
  if (isRecycleBinView) {
    const restoreBtn = document.getElementById('restoreBtn');
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    if (restoreBtn) restoreBtn.disabled = count === 0;
    if (permanentDeleteBtn) permanentDeleteBtn.disabled = count === 0;
  } else {
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) deleteBtn.disabled = count === 0;
  }
  updateDesktopSaveButton();
  updateSelectAllButton();
  updateContextPanel();
  if (typeof updateSelectionActionBar === 'function') updateSelectionActionBar();
}
