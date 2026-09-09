// v6 收集箱：截图、拖入与网页收藏的样片统一先落在这里。
// hover 卡片一键拍板到当前项目的五景别轨道（键位 1-5 / X 丢弃）。

const INBOX_LANES = ['远景', '中景', '近景', '特写', '空镜']

let inboxPhotos = []
let inboxHoveredPhotoId = null
let inboxBusy = false

function inboxProjectId() {
  return Number.isInteger(Number(currentProjectId)) && Number(currentProjectId) > 0 ? Number(currentProjectId) : null
}

function inboxPhotoSrc(photo) {
  return localImageUrl(photo?.thumbnail_path || photo?.filepath || '')
}

function inboxEscape(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value == null ? '' : String(value)) : String(value == null ? '' : value)
}

async function loadInbox() {
  const projectId = inboxProjectId()
  if (projectId === null || !window.electronAPI?.photos?.getAll) {
    inboxPhotos = []
    renderInbox()
    return
  }
  try {
    const [count, data] = await Promise.all([
      window.electronAPI.photos.count({ projectId, reviewState: 'inbox' }),
      window.electronAPI.photos.getAll({ filter: { projectId, reviewState: 'inbox' }, limit: 400 })
    ])
    inboxPhotos = Array.isArray(data) ? data : []
    updateInboxBadge(Number(count) || inboxPhotos.length)
    renderInbox()
  } catch (error) {
    inboxPhotos = []
    renderInbox()
    showToast(`加载收集箱失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function updateInboxBadge(count) {
  const badge = document.querySelector('.space-rail .rail-btn[data-space="inbox"] .rail-badge')
  if (!badge) return
  badge.textContent = String(count)
  badge.classList.toggle('hidden', !(count > 0))
}

function renderInbox() {
  const grid = document.getElementById('inboxGrid')
  if (!grid) return
  const summary = document.getElementById('inboxSummary')
  if (summary) {
    summary.textContent = inboxProjectId() === null
      ? '请先创建或选择一个拍摄方案'
      : `当前 ${inboxPhotos.length} 张待拍板 · 拍板后样片进入「${inboxEscape(currentProjectName)}」的分镜板`
  }
  grid.innerHTML = inboxPhotos.length === 0
    ? `<div class="inbox-empty">收集箱是空的<br><span>Alt+A 截图、拖入文件或从小红书收藏的样片会先落在这里</span></div>`
    : inboxPhotos.map(photo => `
      <div class="inbox-card" data-photo-id="${Number(photo.id)}">
        <img class="inbox-thumb" src="${inboxEscape(inboxPhotoSrc(photo))}" alt="${inboxEscape(photo.filename || '样片')}" loading="lazy" draggable="false">
        <span class="inbox-src">${inboxEscape(photo.source_type === 'web' ? '网页收藏' : '截图 / 导入')}</span>
        <div class="inbox-triage">
          ${INBOX_LANES.map((lane, index) => `<button type="button" data-inbox-lane="${inboxEscape(lane)}"><span class="inbox-key">${index + 1}</span>${inboxEscape(lane)}</button>`).join('')}
          <button type="button" class="inbox-discard" data-inbox-discard="1" title="移入回收站"><span class="inbox-key">X</span></button>
        </div>
      </div>`).join('')
  bindInboxCardEvents(grid)
}

function bindInboxCardEvents(grid) {
  grid.querySelectorAll('.inbox-card').forEach(card => {
    const photoId = Number(card.dataset.photoId)
    card.addEventListener('mouseenter', () => { inboxHoveredPhotoId = photoId })
    card.addEventListener('mouseleave', () => {
      if (inboxHoveredPhotoId === photoId) inboxHoveredPhotoId = null
    })
    card.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation()
        if (button.dataset.inboxDiscard) { void discardInboxPhoto(photoId); return }
        void sendInboxPhotoToLane(photoId, button.dataset.inboxLane)
      })
    })
  })
}

async function sendInboxPhotoToLane(photoId, lane) {
  const projectId = inboxProjectId()
  const photo = inboxPhotos.find(item => Number(item.id) === Number(photoId))
  if (!photo || projectId === null || inboxBusy) return
  if (!window.electronAPI?.shots?.create || !window.electronAPI?.photos?.setReviewState) {
    showToast('拍板功能当前不可用，请重启应用后重试', 'error')
    return
  }
  inboxBusy = true
  try {
    const shotResult = await window.electronAPI.shots.create(projectId, Number(photoId), { chapter: lane })
    if (!shotResult?.success) throw new Error(shotResult?.error || '加入分镜板失败')
    await window.electronAPI.photos.setReviewState(Number(photoId), 'pick')
    inboxPhotos = inboxPhotos.filter(item => Number(item.id) !== Number(photoId))
    updateInboxBadge(inboxPhotos.length)
    renderInbox()
    showToast(`「${photo.filename || '样片'}」已拍板到「${lane}」`, 'success')
    if (currentPanel === 'planning' && typeof loadPlanning === 'function') await loadPlanning()
    if (typeof updateStatusBar === 'function') updateStatusBar()
  } catch (error) {
    showToast(`拍板失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    inboxBusy = false
  }
}

async function discardInboxPhoto(photoId) {
  const photo = inboxPhotos.find(item => Number(item.id) === Number(photoId))
  if (!photo || inboxBusy) return
  if (!window.electronAPI?.photos?.delete) {
    showToast('回收站功能当前不可用，请重启应用后重试', 'error')
    return
  }
  inboxBusy = true
  try {
    const result = await window.electronAPI.photos.delete([Number(photoId)])
    if (!result?.success) throw new Error(result?.error || '移入回收站失败')
    inboxPhotos = inboxPhotos.filter(item => Number(item.id) !== Number(photoId))
    updateInboxBadge(inboxPhotos.length)
    renderInbox()
    showToast(`「${photo.filename || '样片'}」已移入回收站，30 天内可恢复`, 'info')
  } catch (error) {
    showToast(`移入回收站失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    inboxBusy = false
  }
}

function openInboxPanel() {
  if (inboxProjectId() === null) {
    showToast('请先创建或选择一个拍摄方案', 'warning')
    return false
  }
  closeMaterialBrowserPanel?.()
  document.getElementById('settingsModal')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.getElementById('planningPanel')?.classList.add('hidden')
  document.getElementById('inboxPanel')?.classList.remove('hidden')
  currentPanel = 'inbox'
  PicEvents.emit('workspace:changed', 'inbox')
  updateStatusBar()
  void loadInbox()
  return true
}

function closeInboxPanel() {
  document.getElementById('inboxPanel')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  currentPanel = 'gallery'
  updateStatusBar()
  PicEvents.emit('workspace:changed', 'gallery')
}

addEventListener('keydown', event => {
  if (currentPanel !== 'inbox' || inboxHoveredPhotoId === null) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  const laneIndex = ['1', '2', '3', '4', '5'].indexOf(event.key)
  if (laneIndex >= 0) { event.preventDefault(); void sendInboxPhotoToLane(inboxHoveredPhotoId, INBOX_LANES[laneIndex]) }
  if (event.key === 'x' || event.key === 'X') { event.preventDefault(); void discardInboxPhoto(inboxHoveredPhotoId) }
})

PicEvents?.on('project:selected', () => { if (currentPanel === 'inbox') void loadInbox() })
window.electronAPI?.capture?.onSaved?.(() => {
  updateInboxBadge((Number(document.querySelector('.space-rail .rail-badge')?.textContent) || 0) + 1)
  if (currentPanel === 'inbox') void loadInbox()
})
