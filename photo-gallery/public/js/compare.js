// 2–4 photo comparison workspace for persistent delivery candidates.
let comparePhotos = []
let compareCandidatePhotos = []
let compareZoom = 1

function comparePhotoSource(photo) {
  return photo?.filepath || photo?.thumbnail_path || ''
}

function compareExifSummary(photo) {
  let exif = {}
  try {
    exif = photo?.exif_json ? JSON.parse(photo.exif_json) : {}
  } catch { /* malformed EXIF should not block comparison */ }
  const camera = exif.Model || exif.cameraModel || exif.CameraModel
  const lens = exif.LensModel || exif.lensModel
  const details = [camera, lens, exif.ISO ? `ISO ${exif.ISO}` : null, exif.Aperture ? `f/${exif.Aperture}` : null]
    .filter(Boolean)
  return details.length > 0 ? details.join(' · ') : '暂无 EXIF 摘要'
}

function comparePhotoMeta(photo) {
  const tags = photo.tags?.length ? photo.tags.join('、') : '无标签'
  return `${photo.width || 0} × ${photo.height || 0} · ${photo.rating || 0} 星 · ${tags}`
}

function applyCompareZoom() {
  document.querySelectorAll('#compareGrid .compare-image').forEach(image => {
    image.style.transform = `scale(${compareZoom})`
  })
  const output = document.getElementById('compareZoomValue')
  if (output) output.textContent = `${Math.round(compareZoom * 100)}%`
}

function renderCompareWorkspace() {
  const grid = document.getElementById('compareGrid')
  const summary = document.getElementById('compareSummary')
  if (!grid) return
  if (summary) summary.textContent = `${comparePhotos.length} 张照片 · 同步缩放 ${Math.round(compareZoom * 100)}%`
  grid.innerHTML = comparePhotos.map(photo => {
    const candidates = compareCandidatePhotos.filter(candidate => !selectionTrayIds.includes(candidate.id) && candidate.id !== photo.id)
    const options = candidates.map(candidate => `<option value="${candidate.id}">${escapeHtml(candidate.filename || '未命名')}</option>`).join('')
    return `
      <article class="compare-card${photo.deleted_at ? ' is-deleted' : ''}" data-photo-id="${photo.id}">
        <div class="compare-image-frame"><img class="compare-image" src="${escapeHtml(comparePhotoSource(photo))}" alt="${escapeHtml(photo.filename || '')}"><span class="compare-deleted-badge">${photo.deleted_at ? '回收站文件' : ''}</span></div>
        <div class="compare-card-body">
          <h3 title="${escapeHtml(photo.filename || '')}">${escapeHtml(photo.filename || '未命名')}</h3>
          <p>${escapeHtml(comparePhotoMeta(photo))}</p>
          <p class="compare-exif">${escapeHtml(compareExifSummary(photo))}</p>
          <div class="compare-actions" role="group" aria-label="${escapeHtml(photo.filename || '照片')}操作">
            <div class="compare-rating-actions">${[1, 2, 3, 4, 5].map(rating => `<button class="compare-rating-btn${rating <= (photo.rating || 0) ? ' active' : ''}" type="button" data-rating="${rating}" aria-label="${rating} 星">★</button>`).join('')}</div>
            <button class="compare-reject-btn" type="button"><i class="fa-solid fa-xmark" aria-hidden="true"></i><span>淘汰</span></button>
          </div>
          <label class="compare-replace-label">替换精选<select class="compare-replace-select" aria-label="替换 ${escapeHtml(photo.filename || '未命名')}"><option value="">选择照片…</option>${options}</select></label>
        </div>
      </article>
    `
  }).join('')
  applyCompareZoom()
}

async function loadCompareCandidates() {
  if (window.electronAPI?.photos?.getAll && currentProjectId !== null) {
    compareCandidatePhotos = await window.electronAPI.photos.getAll({ filter: { projectId: currentProjectId }, limit: 10000, offset: 0 })
  } else {
    compareCandidatePhotos = photos.slice()
  }
}

async function openCompareWorkspace() {
  if (selectionTrayItems.length < 2) {
    showToast('至少选择 2 张精选照片才能对比', 'warning')
    return
  }
  comparePhotos = selectionTrayItems.slice(0, 4).map(selection => selection.photo)
  compareZoom = 1
  await loadCompareCandidates()
  if (typeof cullingMode !== 'undefined') cullingMode = false
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.getElementById('cullingWorkspace')?.classList.add('hidden')
  document.querySelector('.filter-bar')?.classList.add('hidden')
  document.getElementById('compareWorkspace')?.classList.remove('hidden')
  document.getElementById('statusView')?.replaceChildren(document.createTextNode('精选对比'))
  currentPanel = 'compare'
  renderCompareWorkspace()
}

async function closeCompareWorkspace() {
  document.getElementById('compareWorkspace')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  document.querySelector('.filter-bar')?.classList.remove('hidden')
  currentPanel = 'gallery'
  document.getElementById('statusView')?.replaceChildren(document.createTextNode(currentViewMode === 'compact' ? '紧凑视图' : '瀑布流'))
  if (window.electronAPI && typeof loadPhotos === 'function') await loadPhotos(true)
}

async function updateCompareRating(photoId, rating) {
  const photo = comparePhotos.find(item => item.id === photoId)
  if (!photo) return
  try {
    if (window.electronAPI?.photos?.updateRating) await window.electronAPI.photos.updateRating(photoId, rating)
    photo.rating = rating
    const selection = selectionTrayItems.find(item => item.photo_id === photoId)
    if (selection) selection.photo.rating = rating
    renderCompareWorkspace()
    renderSelectionTray()
  } catch (error) {
    showToast(`保存评级失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function rejectComparePhoto(photoId) {
  const photo = comparePhotos.find(item => item.id === photoId)
  if (!photo) return
  try {
    if (window.electronAPI?.photos?.setReviewState) await window.electronAPI.photos.setReviewState(photoId, 'reject')
    await removeSelectionTray(photoId)
    if (selectionTrayItems.length < 2) {
      await closeCompareWorkspace()
      showToast('精选照片少于 2 张，已退出对比', 'warning')
      return
    }
    comparePhotos = selectionTrayItems.slice(0, 4).map(selection => selection.photo)
    renderCompareWorkspace()
    showToast('照片已淘汰并移出精选篮', 'success')
  } catch (error) {
    showToast(`淘汰失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function replaceComparePhoto(oldPhotoId, newPhotoId) {
  const replacement = compareCandidatePhotos.find(photo => photo.id === newPhotoId)
  if (!replacement || oldPhotoId === newPhotoId) return
  try {
    const oldIndex = selectionTrayIds.indexOf(oldPhotoId)
    const nextPhotoId = oldIndex >= 0 ? selectionTrayIds[oldIndex + 1] : undefined
    const added = await addSelectionTray(replacement)
    if (!added) return
    await removeSelectionTray(oldPhotoId)
    if (nextPhotoId && typeof reorderSelectionTray === 'function') {
      await reorderSelectionTray(replacement.id, nextPhotoId)
    }
    comparePhotos = selectionTrayItems.slice(0, 4).map(selection => selection.photo)
    renderCompareWorkspace()
    showToast('精选照片已替换', 'success')
  } catch (error) {
    showToast(`替换精选失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

function bindCompareEvents() {
  document.getElementById('compareExitBtn')?.addEventListener('click', () => { void closeCompareWorkspace() })
  document.getElementById('compareZoomRange')?.addEventListener('input', event => {
    compareZoom = Number(event.target.value)
    applyCompareZoom()
  })
  document.getElementById('compareGrid')?.addEventListener('click', event => {
    const target = event.target
    const card = target.closest('.compare-card')
    if (!card) return
    const photoId = Number(card.dataset.photoId)
    const ratingButton = target.closest('.compare-rating-btn')
    if (ratingButton) {
      void updateCompareRating(photoId, Number(ratingButton.dataset.rating))
      return
    }
    if (target.closest('.compare-reject-btn')) void rejectComparePhoto(photoId)
  })
  document.getElementById('compareGrid')?.addEventListener('change', event => {
    const target = event.target
    if (!target.matches('.compare-replace-select') || !target.value) return
    const card = target.closest('.compare-card')
    if (card) void replaceComparePhoto(Number(card.dataset.photoId), Number(target.value))
  })
}

bindCompareEvents()