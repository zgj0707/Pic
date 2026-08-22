// 照片网格、虚拟滚动、选择与批量标签显示
// 与 index.html 共享全局状态变量

function createPhotoItem(photo, index, layout = null) {
  const item = document.createElement('div');
  item.className = `photo-item ${selectedPhotos.has(photo.id) ? 'selected' : ''}`;
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

  const ratingHtml = photo.rating > 0
    ? Array(5).fill().map((_, i) =>
        `<i class="fa-${i < photo.rating ? 'solid' : 'regular'} fa-star text-xs ${i < photo.rating ? 'text-yellow-400' : 'text-gray-500'}"></i>`
      ).join('')
    : '';

  const tagsHtml = photo.tags?.map(tag =>
    `<span class="tag-badge">${escapeHtml(tag)}</span>`
  ).join('') || '';

  item.innerHTML = `
    <div class="skeleton"></div>
    <div class="photo-content">
      <img data-src="${escapeHtml(imgSrc)}" alt="${escapeHtml(photo.filename)}" loading="lazy">
    </div>
    <div class="selection-indicator">
      <i class="fa-solid ${selectedPhotos.has(photo.id) ? 'fa-check' : 'fa-plus'}"></i>
    </div>
    <div class="rating-overlay">${ratingHtml}</div>
    <div class="tags-overlay">${tagsHtml}</div>
  `;

  const img = item.querySelector('img');
  img.onload = () => {
    img.classList.add('loaded');
    const skeleton = item.querySelector('.skeleton');
    if (skeleton) skeleton.remove();
    imageLoadCount++;
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
    const ratingFilterVal = document.getElementById('ratingFilter').value;
    const tagFilterVal = document.getElementById('tagFilter').value;

    filteredPhotos = photos.filter(photo => {
      if (ratingFilterVal && (photo.rating || 0) < parseInt(ratingFilterVal)) return false;
      if (tagFilterVal && !photo.tags?.some(t => t === tagFilterVal)) return false;
      if (searchQuery) {
        const matchName = photo.filename?.toLowerCase().includes(searchQuery);
        const matchTags = photo.tags?.some(t => t.toLowerCase().includes(searchQuery));
        if (!matchName && !matchTags) return false;
      }
      return true;
    });
  }

  document.getElementById('emptyState').classList.toggle('hidden', photos.length > 0);

  photoGrid.innerHTML = '';
  if (resetScroll && gridScrollContainer) gridScrollContainer.scrollTop = 0;
  isVirtualScrollEnabled = false;

  imageLoadCount = 0;
  totalImagesToLoad = filteredPhotos.length;

  updatePhotoCount();
  restoreSelectedState();

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
    if (!gridScrollListenerAdded) {
      gridScrollContainer = document.getElementById('photoGridContainer');
      gridScrollContainer.addEventListener('scroll', onGridScroll, { passive: true });
      gridScrollListenerAdded = true;
    }
    renderVisibleGridItems();
  }
}

// 虚拟滚动：计算所有照片的瀑布流位置
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
    // 优先使用数据库存储的宽高比；若照片已加载且自然尺寸可用，则使用实际值
    const existing = photoGrid.querySelector(`.photo-item[data-index="${index}"] img`);
    let aspectRatio = photo.width && photo.height ? photo.height / photo.width : 0.75;
    if (existing && existing.complete && existing.naturalHeight > 0 && existing.naturalWidth > 0) {
      aspectRatio = existing.naturalHeight / existing.naturalWidth;
    }
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

  // 创建/补充可视区节点
  visibleIndices.forEach(idx => {
    if (photoGrid.querySelector(`.photo-item[data-index="${idx}"]`)) return;
    const layout = gridLayoutItems[idx];
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
      const nearBottom = gridScrollContainer.scrollTop + gridScrollContainer.clientHeight >= gridTotalHeight - gridScrollContainer.clientHeight * VIRTUAL_BUFFER_RATIO;
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
    if (item) {
      item.classList.add('selected');
      const indicator = item.querySelector('.selection-indicator i');
      if (indicator) indicator.className = 'fa-solid fa-check';
    }
  });
}

function handlePhotoClick(e, photo, index) {
  const item = e.currentTarget;

  if (e.target.closest('.selection-indicator')) {
    e.stopPropagation();
    togglePhotoSelection(photo.id, item);
    return;
  }

  if (e.shiftKey && lastClickedIndex >= 0) {
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
      const photoId = filteredPhotos[i].id;
      const photoItem = document.querySelector(`[data-id="${photoId}"]`);
      if (photoItem) {
        selectedPhotos.add(photoId);
        photoItem.classList.add('selected');
        const indicator = photoItem.querySelector('.selection-indicator i');
        if (indicator) indicator.className = 'fa-solid fa-check';
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
    const indicator = item.querySelector('.selection-indicator i');
    if (indicator) indicator.className = 'fa-solid fa-plus';
  } else {
    selectedPhotos.add(photoId);
    item.classList.add('selected');
    const indicator = item.querySelector('.selection-indicator i');
    if (indicator) indicator.className = 'fa-solid fa-check';
  }
  updateSelectedCount();
}

function updatePhotoCount() {
  const hasMore = window.electronAPI && photoTotalCount > 0 && photoLoadedCount < photoTotalCount;
  if (isRecycleBinView) {
    const base = window.electronAPI
      ? `${photoLoadedCount}/${photoTotalCount} 张已删除照片`
      : `${photos.length} 张已删除照片`;
    document.getElementById('photoCount').textContent = hasMore ? `${base}（加载中…）` : base;
    return;
  }
  const base = window.electronAPI
    ? `${photoLoadedCount}/${photoTotalCount} 张照片`
    : (filteredPhotos.length === photos.length
        ? `${photos.length} 张照片`
        : `${filteredPhotos.length}/${photos.length} 张照片`);
  document.getElementById('photoCount').textContent = hasMore ? `${base}（加载中…）` : base;
}

function updateSelectedCount() {
  const count = selectedPhotos.size;
  document.getElementById('selectedCount').textContent = `已选择 ${count} 张照片`;
  if (isRecycleBinView) {
    const restoreBtn = document.getElementById('restoreBtn');
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    if (restoreBtn) restoreBtn.disabled = count === 0;
    if (permanentDeleteBtn) permanentDeleteBtn.disabled = count === 0;
  } else {
    document.getElementById('deleteBtn').disabled = count === 0;
    document.getElementById('exportPdfBtn').disabled = count === 0;
    document.getElementById('copyToDesktopBtn').disabled = count === 0;
  }
  updateApplyButtons();
}

function updateApplyButtons() {
  document.getElementById('applyBatchTagsBtn').disabled = batchTags.length === 0 || selectedPhotos.size === 0;
  document.getElementById('applyRemoveTagsBtn').disabled = removeTags.length === 0 || selectedPhotos.size === 0;
}

function addBatchTag(tag) {
  if (!tag || batchTags.includes(tag)) return;
  batchTags.push(tag);
  renderBatchTags();
}

function removeBatchTag(tag) {
  const idx = batchTags.indexOf(tag);
  if (idx > -1) {
    batchTags.splice(idx, 1);
    renderBatchTags();
  }
}

function renderBatchTags() {
  const container = document.getElementById('batchTags');
  container.innerHTML = batchTags.map(tag => `
    <span class="tag-badge bg-accent/30">
      ${escapeHtml(tag)}
      <button class="ml-1 hover:text-red-400" onclick="removeBatchTag('${escapeHtml(tag).replace(/'/g, "\\'")}')">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </span>
  `).join('');
  updateApplyButtons();
}
