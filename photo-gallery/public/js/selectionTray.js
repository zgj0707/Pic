// Persistent delivery candidates. This is intentionally separate from selectedPhotos,
// which remains the temporary batch-selection set used by grid.js and batch.js.
let selectionTrayIds = []
let selectionTrayItems = []
let selectionTrayProjectId = null
let selectionTrayDragId = null

if (window.PicState) {
  Object.defineProperty(window.PicState, 'selectionTrayIds', {
    enumerable: true,
    configurable: true,
    get: () => selectionTrayIds
  })
}

function selectionTrayStorageKey(projectId) {
  return `selectionTray:${projectId}`
}

function updateSelectionTrayCounts() {
  const count = selectionTrayItems.length
  document.getElementById('selectionTrayCount')?.replaceChildren(document.createTextNode(String(count)))
  document.getElementById('projectSelectionCount')?.replaceChildren(document.createTextNode(String(count)))
  const compareButton = document.getElementById('selectionCompareBtn')
  if (compareButton) compareButton.disabled = count < 2
  const deliveryButton = document.getElementById('deliveryBtn')
  if (deliveryButton) deliveryButton.disabled = count === 0
}

function refreshGridSelectionTrayIndicators() {
  document.querySelectorAll('.photo-item[data-id]').forEach(item => {
    const photoId = Number(item.dataset.id)
    const inTray = selectionTrayIds.includes(photoId)
    item.classList.toggle('in-selection-tray', inTray)
    const button = item.querySelector('.selection-tray-indicator')
    if (button) {
      button.setAttribute('aria-label', inTray ? '移出灵感板' : '加入灵感板')
    }
  })
}

function renderSelectionTray() {
  const empty = document.getElementById('selectionTrayEmpty')
  const items = document.getElementById('selectionTrayItems')
  if (!empty || !items) return
  updateSelectionTrayCounts()
  refreshGridSelectionTrayIndicators()
  empty.classList.toggle('hidden', selectionTrayItems.length > 0)
  items.classList.toggle('hidden', selectionTrayItems.length === 0)
  items.innerHTML = ''

  selectionTrayItems.forEach((selection, index) => {
    const photo = selection.photo
    const item = document.createElement('article')
    item.className = `selection-tray-item${photo.deleted_at ? ' is-deleted' : ''}`
    item.draggable = true
    item.dataset.photoId = String(selection.photo_id)
    item.dataset.position = String(index)
    item.innerHTML = `
      <button class="selection-tray-drag" type="button" title="拖动调整顺序" aria-label="拖动调整顺序"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></button>
      <button class="selection-tray-preview" type="button" aria-label="预览 ${escapeHtml(photo.filename || '样片')}">
        <img src="${escapeHtml(photo.thumbnail_path || photo.filepath || '')}" alt="${escapeHtml(photo.filename || '')}">
      </button>
      <div class="selection-tray-item-info">
        <strong title="${escapeHtml(photo.filename || '')}">${escapeHtml(photo.filename || '未命名')}</strong>
        <span>${photo.deleted_at ? '文件在回收站' : `${photo.rating || 0} 星 · ${photo.tags?.length || 0} 标签`}</span>
      </div>
      <button class="selection-tray-remove" type="button" aria-label="移出灵感板"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    `
    item.querySelector('.selection-tray-preview')?.addEventListener('click', () => {
      if (typeof openLightbox === 'function') openLightbox(photo, index)
    })
    item.querySelector('.selection-tray-remove')?.addEventListener('click', () => {
      void removeSelectionTray(photo.id)
    })
    item.addEventListener('dragstart', event => {
      selectionTrayDragId = photo.id
      event.dataTransfer?.setData('text/plain', String(photo.id))
      item.classList.add('dragging')
    })
    item.addEventListener('dragend', () => {
      selectionTrayDragId = null
      item.classList.remove('dragging')
    })
    item.addEventListener('dragover', event => {
      event.preventDefault()
      item.classList.add('drag-over')
    })
    item.addEventListener('dragleave', () => item.classList.remove('drag-over'))
    item.addEventListener('drop', event => {
      event.preventDefault()
      item.classList.remove('drag-over')
      const draggedId = Number(event.dataTransfer?.getData('text/plain') || selectionTrayDragId)
      if (draggedId && draggedId !== photo.id) void reorderSelectionTray(draggedId, photo.id)
    })
    items.appendChild(item)
  })
}

async function loadSelectionTray(projectId = currentProjectId) {
  selectionTrayProjectId = projectId
  selectionTrayItems = []
  selectionTrayIds = []
  if (projectId === null || projectId === undefined) {
    renderSelectionTray()
    return
  }

  try {
    if (window.electronAPI?.selections?.getAll) {
      selectionTrayItems = await window.electronAPI.selections.getAll(projectId)
    } else {
      const ids = JSON.parse(localStorage.getItem(selectionTrayStorageKey(projectId)) || '[]')
      selectionTrayItems = ids
        .map(id => photos.find(photo => photo.id === id))
        .filter(Boolean)
        .map((photo, position) => ({ id: position + 1, project_id: projectId, photo_id: photo.id, position, created_at: 0, photo }))
    }
    selectionTrayIds = selectionTrayItems.map(selection => selection.photo_id)
  } catch (error) {
    console.error('加载灵感板失败:', error)
    showToast('灵感板加载失败', 'error')
  }
  renderSelectionTray()
}

async function addSelectionTray(photo) {
  if (!photo || selectionTrayProjectId === null) return false
  if (selectionTrayIds.includes(photo.id)) return true
  try {
    if (window.electronAPI?.selections?.add) {
      const result = await window.electronAPI.selections.add(selectionTrayProjectId, photo.id)
      if (!result.success) throw new Error(result.error || '写入灵感板失败')
    } else {
      const ids = [...selectionTrayIds, photo.id]
      localStorage.setItem(selectionTrayStorageKey(selectionTrayProjectId), JSON.stringify(ids))
    }
    await loadSelectionTray(selectionTrayProjectId)
    return true
  } catch (error) {
    showToast(`加入灵感板失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
    return false
  }
}

async function removeSelectionTray(photoId) {
  if (selectionTrayProjectId === null) return false
  try {
    if (window.electronAPI?.selections?.remove) {
      const result = await window.electronAPI.selections.remove(selectionTrayProjectId, photoId)
      if (!result.success) throw new Error(result.error || '移出灵感板失败')
    } else {
      const ids = selectionTrayIds.filter(id => id !== photoId)
      localStorage.setItem(selectionTrayStorageKey(selectionTrayProjectId), JSON.stringify(ids))
    }
    await loadSelectionTray(selectionTrayProjectId)
    return true
  } catch (error) {
    showToast(`移出灵感板失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
    return false
  }
}

async function toggleSelectionTray(photo) {
  if (!photo) return false
  const removed = selectionTrayIds.includes(photo.id)
  const success = removed ? await removeSelectionTray(photo.id) : await addSelectionTray(photo)
  if (success) {
    if (typeof setCullingLastAction === 'function') setCullingLastAction(`${removed ? '移出灵感板' : '加入灵感板'} · ${photo.filename || '未命名'}`)
  }
  return success
}

async function reorderSelectionTray(draggedPhotoId, targetPhotoId) {
  const ids = selectionTrayIds.slice()
  const from = ids.indexOf(draggedPhotoId)
  const to = ids.indexOf(targetPhotoId)
  if (from < 0 || to < 0 || from === to) return
  ids.splice(from, 1)
  ids.splice(to, 0, draggedPhotoId)
  try {
    if (window.electronAPI?.selections?.reorder) {
      const result = await window.electronAPI.selections.reorder(selectionTrayProjectId, ids)
      if (!result.success) throw new Error(result.error || '保存灵感板顺序失败')
    } else {
      localStorage.setItem(selectionTrayStorageKey(selectionTrayProjectId), JSON.stringify(ids))
    }
    await loadSelectionTray(selectionTrayProjectId)
    showToast('灵感板顺序已更新', 'success')
  } catch (error) {
    showToast(`保存灵感板顺序失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

function bindSelectionTrayEvents() {
  PicEvents?.on('project:selected', project => { void loadSelectionTray(project.id) })
  document.getElementById('selectionCompareBtn')?.addEventListener('click', () => {
    if (typeof openCompareWorkspace === 'function') openCompareWorkspace()
  })
  document.getElementById('deliveryBtn')?.addEventListener('click', () => {
    if (typeof openDeliveryWorkspace === 'function') openDeliveryWorkspace()
  })
}

bindSelectionTrayEvents()