// 键盘优先的样片初筛工作区
// 与 state.js / app.js / grid.js 共享全局状态变量。

let cullingMode = false
let cullingView = 'grid'
let cullingPhotos = []
let cullingIndex = 0
let cullingZoomed = false
let cullingHistory = []

const REVIEW_STATE_LABELS = {
  unreviewed: '未处理',
  pick: '保留',
  reject: '拒绝'
}

function cullingPhotoSource(photo) {
  return photo?.thumbnail_path || photo?.filepath || ''
}

function isCullingEditableTarget(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function currentCullingPhoto() {
  return cullingPhotos[cullingIndex] || null
}

function syncCullingPhoto(photo) {
  if (!photo) return
  const collections = [photos, filteredPhotos]
  for (const collection of collections) {
    const match = collection.find(item => item.id === photo.id)
    if (match) {
      match.review_state = photo.review_state
      match.rating = photo.rating
    }
  }
}

function updateCullingProgress() {
  const progress = document.getElementById('cullingProgress')
  if (!progress) return
  if (cullingPhotos.length === 0) {
    progress.textContent = '当前项目没有可初筛的样片'
    return
  }
  const counts = cullingPhotos.reduce((result, photo) => {
    const state = photo.review_state || 'unreviewed'
    result[state] = (result[state] || 0) + 1
    return result
  }, { unreviewed: 0, pick: 0, reject: 0 })
  progress.textContent = `${cullingIndex + 1} / ${cullingPhotos.length} · 未处理 ${counts.unreviewed} · 保留 ${counts.pick} · 拒绝 ${counts.reject}`
}

function setCullingLastAction(message) {
  const element = document.getElementById('cullingLastAction')
  if (element) element.textContent = `最近操作：${message}`
  const undo = document.getElementById('cullingUndoBtn')
  if (undo) undo.disabled = cullingHistory.length === 0
}

function renderCullingGrid() {
  const grid = document.getElementById('cullingGrid')
  if (!grid) return
  grid.innerHTML = ''
  cullingPhotos.forEach((photo, index) => {
    const state = photo.review_state || 'unreviewed'
    const card = document.createElement('button')
    card.type = 'button'
    card.className = `culling-card culling-state-${state}${index === cullingIndex ? ' active' : ''}${selectedPhotos.has(photo.id) ? ' selected' : ''}`
    card.dataset.id = String(photo.id)
    card.dataset.index = String(index)
    card.setAttribute('aria-label', `${photo.filename || '样片'}，${REVIEW_STATE_LABELS[state]}，${photo.rating || 0} 星`)
    card.innerHTML = `
      <span class="culling-card-image"><img src="${escapeHtml(cullingPhotoSource(photo))}" alt="${escapeHtml(photo.filename || '')}" loading="lazy"></span>
      <span class="culling-card-footer"><strong>${escapeHtml(photo.filename || '未命名')}</strong><span>${REVIEW_STATE_LABELS[state]} · ${photo.rating || 0} 星</span></span>
      <span class="culling-card-state" aria-hidden="true">${REVIEW_STATE_LABELS[state]}</span>
    `
    card.addEventListener('click', () => setCullingIndex(index))
    card.addEventListener('dblclick', () => {
      setCullingIndex(index)
      setCullingView('immersive')
    })
    grid.appendChild(card)
  })
  updateCullingProgress()
}

function renderCullingImmersive() {
  const photo = currentCullingPhoto()
  const image = document.getElementById('cullingImmersiveImage')
  const filename = document.getElementById('cullingImmersiveFilename')
  const meta = document.getElementById('cullingImmersiveMeta')
  if (!photo || !image || !filename || !meta) {
    if (image) image.removeAttribute('src')
    if (filename) filename.textContent = '未选择样片'
    if (meta) meta.textContent = ''
    return
  }
  image.src = cullingPhotoSource(photo)
  image.alt = photo.filename || ''
  image.classList.toggle('is-zoomed', cullingZoomed)
  filename.textContent = photo.filename || '未命名'
  meta.textContent = `${cullingIndex + 1} / ${cullingPhotos.length} · ${REVIEW_STATE_LABELS[photo.review_state || 'unreviewed']} · ${photo.rating || 0} 星`
  updateCullingProgress()
}

function setCullingIndex(index) {
  if (cullingPhotos.length === 0) return
  cullingIndex = Math.max(0, Math.min(index, cullingPhotos.length - 1))
  renderCullingGrid()
  renderCullingImmersive()
  const card = document.querySelector(`#cullingGrid .culling-card[data-index="${cullingIndex}"]`)
  card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function moveCullingIndex(delta) {
  if (cullingPhotos.length === 0) return
  setCullingIndex(cullingIndex + delta)
}

function setCullingView(view) {
  cullingView = view
  const grid = document.getElementById('cullingGrid')
  const immersive = document.getElementById('cullingImmersive')
  document.getElementById('cullingGridViewBtn')?.classList.toggle('active', view === 'grid')
  document.getElementById('cullingImmersiveViewBtn')?.classList.toggle('active', view === 'immersive')
  grid?.classList.toggle('hidden', view !== 'grid')
  immersive?.classList.toggle('hidden', view !== 'immersive')
  renderCullingGrid()
  renderCullingImmersive()
}

function toggleCullingZoom() {
  cullingZoomed = !cullingZoomed
  renderCullingImmersive()
  setCullingLastAction(cullingZoomed ? '放大预览' : '适配窗口')
}

async function loadCullingPhotos() {
  if (window.electronAPI?.photos?.getAll) {
    const filter = currentProjectId !== null ? { projectId: currentProjectId } : {}
    cullingPhotos = await window.electronAPI.photos.getAll({ filter, limit: 10000, offset: 0 })
  } else {
    cullingPhotos = photos.slice()
  }
  cullingIndex = 0
  cullingHistory = []
  cullingZoomed = false
  renderCullingGrid()
  renderCullingImmersive()
  setCullingLastAction('无')
}

async function enterCullingMode() {
  if (cullingMode) return
  cullingMode = true
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.querySelector('.filter-bar')?.classList.add('hidden')
  document.getElementById('cullingWorkspace')?.classList.remove('hidden')
  document.getElementById('cullingModeBtn')?.classList.add('active')
  const statusView = document.getElementById('statusView')
  if (statusView) statusView.textContent = '样片初筛'
  await loadCullingPhotos()
  document.getElementById('cullingGrid')?.focus()
}

async function exitCullingMode() {
  if (!cullingMode) return
  cullingMode = false
  document.getElementById('cullingWorkspace')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  document.querySelector('.filter-bar')?.classList.remove('hidden')
  document.getElementById('cullingModeBtn')?.classList.remove('active')
  const statusView = document.getElementById('statusView')
  if (statusView) statusView.textContent = currentViewMode === 'compact' ? '紧凑视图' : '瀑布流'
  if (typeof loadPhotos === 'function' && window.electronAPI) await loadPhotos(true)
}

async function persistCullingState(photo, nextState) {
  if (window.electronAPI?.photos?.setReviewState) {
    await window.electronAPI.photos.setReviewState(photo.id, nextState)
  }
}

async function applyCullingState(nextState) {
  const photo = currentCullingPhoto()
  if (!photo || !REVIEW_STATE_LABELS[nextState]) return
  const previousState = photo.review_state || 'unreviewed'
  try {
    await persistCullingState(photo, nextState)
    photo.review_state = nextState
    syncCullingPhoto(photo)
    cullingHistory.push({ id: photo.id, previousState, nextState })
    setCullingLastAction(`${REVIEW_STATE_LABELS[nextState]} · ${photo.filename || '未命名'}`)
    renderCullingGrid()
    renderCullingImmersive()
    if (cullingIndex < cullingPhotos.length - 1) setCullingIndex(cullingIndex + 1)
  } catch (error) {
    showToast(`保存初筛状态失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function applyCullingRating(rating) {
  const photo = currentCullingPhoto()
  if (!photo) return
  try {
    if (window.electronAPI?.photos?.updateRating) await window.electronAPI.photos.updateRating(photo.id, rating)
    photo.rating = rating
    syncCullingPhoto(photo)
    setCullingLastAction(`${rating} 星 · ${photo.filename || '未命名'}`)
    renderCullingGrid()
    renderCullingImmersive()
    if (cullingIndex < cullingPhotos.length - 1) setCullingIndex(cullingIndex + 1)
  } catch (error) {
    showToast(`保存评级失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function undoCullingAction() {
  const action = cullingHistory.pop()
  if (!action) return
  const photo = cullingPhotos.find(item => item.id === action.id)
  if (!photo) return
  try {
    await persistCullingState(photo, action.previousState)
    photo.review_state = action.previousState
    syncCullingPhoto(photo)
    setCullingIndex(cullingPhotos.findIndex(item => item.id === action.id))
    setCullingLastAction(`撤销：${REVIEW_STATE_LABELS[action.previousState]} · ${photo.filename || '未命名'}`)
  } catch (error) {
    cullingHistory.push(action)
    showToast(`撤销失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

function toggleCullingSelection() {
  const photo = currentCullingPhoto()
  if (!photo) return
  if (typeof toggleSelectionTray === 'function') {
    void toggleSelectionTray(photo)
    return
  }
  if (selectedPhotos.has(photo.id)) selectedPhotos.delete(photo.id)
  else selectedPhotos.add(photo.id)
  updateSelectedCount()
  renderCullingGrid()
  setCullingLastAction(`${selectedPhotos.has(photo.id) ? '加入选择' : '移出选择'} · ${photo.filename || '未命名'}`)
}

function handleCullingKeydown(event) {
  if (!cullingMode || isCullingEditableTarget(event.target)) return
  const key = event.key
  if (key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    void exitCullingMode()
    return
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    moveCullingIndex(key === 'ArrowLeft' ? -1 : 1)
    return
  }
  if (key === 'p' || key === 'P') {
    event.preventDefault()
    event.stopPropagation()
    void applyCullingState('pick')
    return
  }
  if (key === 'x' || key === 'X') {
    event.preventDefault()
    event.stopPropagation()
    void applyCullingState('reject')
    return
  }
  if (key === 'u' || key === 'U') {
    event.preventDefault()
    event.stopPropagation()
    void applyCullingState('unreviewed')
    return
  }
  if (/^[1-5]$/.test(key)) {
    event.preventDefault()
    event.stopPropagation()
    void applyCullingRating(Number(key))
    return
  }
  if (key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    if (cullingView === 'grid') setCullingView('immersive')
    else toggleCullingZoom()
    return
  }
  if (key === 'c' || key === 'C') {
    event.preventDefault()
    event.stopPropagation()
    toggleCullingSelection()
  }
}

function bindCullingEvents() {
  document.getElementById('cullingModeBtn')?.addEventListener('click', () => { void enterCullingMode() })
  document.getElementById('cullingExitBtn')?.addEventListener('click', () => { void exitCullingMode() })
  document.getElementById('statusBackToGallery')?.addEventListener('click', () => { void exitCullingMode() })
  document.getElementById('cullingGridViewBtn')?.addEventListener('click', () => setCullingView('grid'))
  document.getElementById('cullingImmersiveViewBtn')?.addEventListener('click', () => setCullingView('immersive'))
  document.getElementById('cullingPreviousBtn')?.addEventListener('click', () => moveCullingIndex(-1))
  document.getElementById('cullingNextBtn')?.addEventListener('click', () => moveCullingIndex(1))
  document.getElementById('cullingUndoBtn')?.addEventListener('click', () => { void undoCullingAction() })
  document.getElementById('cullingUnreviewedBtn')?.addEventListener('click', () => { void applyCullingState('unreviewed') })
  document.getElementById('cullingPickBtn')?.addEventListener('click', () => { void applyCullingState('pick') })
  document.getElementById('cullingRejectBtn')?.addEventListener('click', () => { void applyCullingState('reject') })
  document.addEventListener('keydown', handleCullingKeydown)
}

bindCullingEvents()