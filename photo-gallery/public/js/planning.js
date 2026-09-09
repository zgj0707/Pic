// v6 五景别分镜板。
// 固定轨道：远景 → 中景 → 近景 → 特写 → 空镜；v5 自由分组数据由服务层
// 迁移到「待归类」轨道，用户拖入景别后即从待归类消失。
// 保持经典脚本兼容，不向 renderer 暴露底层权限。

const PLANNING_LANES = [
  { name: '远景', en: 'WIDE', color: 'var(--sc-far)' },
  { name: '中景', en: 'MEDIUM', color: 'var(--sc-mid)' },
  { name: '近景', en: 'MEDIUM CLOSE', color: 'var(--sc-near)' },
  { name: '特写', en: 'CLOSE-UP', color: 'var(--sc-close)' },
  { name: '空镜', en: 'INSERT', color: 'var(--sc-empty)' }
]
const PLANNING_UNFILED = '待归类'

let planningShots = []
let planningBusy = false

function planningProjectId() {
  return Number.isInteger(Number(currentProjectId)) && Number(currentProjectId) > 0 ? Number(currentProjectId) : null
}

function planningPhotoForShot(shot) {
  return shot?.photo || photos.find(photo => Number(photo.id) === Number(shot?.photo_id)) || null
}

function planningPhotoSrc(photo) {
  return localImageUrl(photo?.thumbnail_path || photo?.filepath || '')
}

function planningEscape(value) {
  return typeof escapeHtml === 'function' ? escapeHtml(value == null ? '' : String(value)) : String(value == null ? '' : value)
}

function planningLanes() {
  const lanes = PLANNING_LANES.map(lane => ({ ...lane, shots: planningShots.filter(shot => shot.chapter === lane.name) }))
  const unfiled = planningShots.filter(shot => shot.chapter === PLANNING_UNFILED)
  if (unfiled.length > 0) lanes.push({ name: PLANNING_UNFILED, en: 'UNFILED', color: 'var(--text-muted)', shots: unfiled })
  return lanes
}

function planningShotMarkup(shot, laneName, index) {
  const photo = planningPhotoForShot(shot)
  const image = planningEscape(planningPhotoSrc(photo))
  const filename = planningEscape(photo?.filename || '未命名样片')
  const note = planningEscape(shot.composition_notes || shot.intent || '')
  const done = shot.status === 'done'
  return `
    <article class="planning-shot-card${done ? ' is-done' : ''}" draggable="true" data-shot-id="${Number(shot.id)}" data-lane="${planningEscape(laneName)}">
      <div class="planning-shot-order${done ? ' done' : ''}">${done ? '✓' : index + 1}</div>
      <div class="planning-shot-image-wrap"><img class="planning-shot-image" src="${image}" alt="${filename}" loading="lazy" draggable="false"></div>
      <div class="planning-shot-main">
        <div class="planning-shot-heading">
          <strong title="${filename}">${filename}</strong>
          <button type="button" class="planning-icon-button planning-remove-shot" data-shot-id="${Number(shot.id)}" title="移出分镜板" aria-label="移出分镜板"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <textarea class="planning-note" data-shot-id="${Number(shot.id)}" rows="2" maxlength="500" placeholder="拍摄备注，例如：35mm f/2.0，东侧窗光">${note}</textarea>
        <div class="planning-shot-actions">
          <button type="button" class="planning-done-toggle" data-shot-id="${Number(shot.id)}" title="标记拍摄状态">${done ? '取消已拍' : '标记已拍'}</button>
        </div>
      </div>
    </article>`
}

function renderPlanningBoard() {
  const board = document.getElementById('planningBoard')
  if (!board) return
  const lanes = planningLanes()
  const total = planningShots.length
  const done = planningShots.filter(shot => shot.status === 'done').length
  board.innerHTML = lanes.map(lane => `
    <section class="planning-lane" data-lane="${planningEscape(lane.name)}" style="--lane-color:${lane.color}">
      <header class="planning-lane-head">
        <span class="planning-lane-dot" aria-hidden="true"></span>
        <span class="planning-lane-title">${planningEscape(lane.name)}</span>
        <span class="planning-lane-en">${planningEscape(lane.en)}</span>
        <span class="planning-lane-count">${lane.shots.length} 镜</span>
      </header>
      <div class="planning-lane-strip" data-lane="${planningEscape(lane.name)}">
        ${lane.shots.length > 0
          ? lane.shots.map((shot, index) => planningShotMarkup(shot, lane.name, index)).join('')
          : `<div class="planning-lane-empty">拖入样片或从收集箱拍板到「${planningEscape(lane.name)}」</div>`}
      </div>
    </section>`).join('') + `
    <footer class="planning-board-progress">
      <span>拍摄进度</span>
      <div class="planning-progress-track"><div class="planning-progress-fill" style="width:${total > 0 ? Math.round(done / total * 100) : 0}%"></div></div>
      <span><strong>${done}</strong>/${total}</span>
    </footer>`
  bindPlanningItemEvents(board)
}

function renderPlanning() {
  renderPlanningBoard()
  const summary = document.getElementById('planningSummary')
  if (summary) summary.textContent = '远景 → 中景 → 近景 → 特写 → 空镜 · 导出 PDF 按此顺序成稿'
  if (typeof updateSelectionActionBar === 'function') updateSelectionActionBar()
}

async function loadPlanning() {
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.getAll) {
    planningShots = []
    renderPlanning()
    return
  }
  try {
    const shotsResult = await window.electronAPI.shots.getAll(projectId)
    planningShots = Array.isArray(shotsResult) ? shotsResult : []
    renderPlanning()
  } catch (error) {
    planningShots = []
    renderPlanning()
    showToast(`加载分镜板失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function openPlanningPanel() {
  if (planningProjectId() === null) {
    showToast('请先创建或选择一个拍摄方案', 'warning')
    return false
  }
  closeMaterialBrowserPanel?.()
  document.getElementById('settingsModal')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.getElementById('planningPanel')?.classList.remove('hidden')
  currentPanel = 'planning'
  if (typeof updateToolbarForGallery === 'function') updateToolbarForGallery()
  updateStatusBar()
  void loadPlanning()
  PicEvents.emit('workspace:changed', 'planning')
  return true
}

function closePlanningPanel() {
  document.getElementById('planningPanel')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  currentPanel = 'gallery'
  if (typeof updateToolbarForGallery === 'function') updateToolbarForGallery()
  updateStatusBar()
  if (typeof updateSelectionActionBar === 'function') updateSelectionActionBar()
  PicEvents.emit('workspace:changed', 'gallery')
}

async function persistPlanningOrder() {
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.reorder) return false
  const result = await window.electronAPI.shots.reorder(projectId, planningShots.map(shot => Number(shot.id)))
  if (!result?.success) throw new Error(result?.error || '拍摄顺序保存失败')
  planningShots = Array.isArray(result.shots) ? result.shots : planningShots
  return true
}

async function persistShotChapter(shot, nextLane) {
  const projectId = planningProjectId()
  if (!window.electronAPI?.shots?.update) throw new Error('分镜板接口不可用')
  const result = await window.electronAPI.shots.update(projectId, Number(shot.id), {
    chapter: nextLane,
    title: shot.title,
    intent: shot.intent,
    compositionNotes: shot.composition_notes,
    lightingGearNotes: shot.lighting_gear_notes,
    status: shot.status
  })
  if (!result?.success) throw new Error(result?.error || '景别调整保存失败')
  if (result.shot) Object.assign(shot, result.shot)
}

async function movePlanningShotToLane(shotId, targetLane, beforeShotId = null) {
  if (planningBusy) return
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot) return
  const sourceLane = shot.chapter
  const fromIndex = planningShots.indexOf(shot)
  const [item] = planningShots.splice(fromIndex, 1)
  shot.chapter = targetLane
  let targetIndex = beforeShotId === null
    ? planningShots.length
    : planningShots.findIndex(item => Number(item.id) === Number(beforeShotId))
  if (targetIndex < 0) targetIndex = planningShots.length
  planningShots.splice(targetIndex, 0, item)
  planningBusy = true
  try {
    if (sourceLane !== targetLane) await persistShotChapter(shot, targetLane)
    await persistPlanningOrder()
    renderPlanning()
    if (sourceLane !== targetLane) showToast(`「${shot.photo?.filename || '样片'}」已移入「${targetLane}」`, 'success')
  } catch (error) {
    await loadPlanning()
    showToast(`保存分镜失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    planningBusy = false
  }
}

async function savePlanningNote(shotId, value) {
  const projectId = planningProjectId()
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || projectId === null || !window.electronAPI?.shots?.update) return
  const result = await window.electronAPI.shots.update(projectId, Number(shotId), { chapter: shot.chapter, title: shot.title, intent: shot.intent, compositionNotes: value.trim() || null, lightingGearNotes: shot.lighting_gear_notes, status: shot.status })
  if (!result?.success) throw new Error(result?.error || '备注保存失败')
  if (result.shot) Object.assign(shot, result.shot)
}

async function togglePlanningShotStatus(shotId) {
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || planningBusy) return
  const next = shot.status === 'done' ? 'planned' : 'done'
  shot.status = next
  planningBusy = true
  try {
    await persistShotChapter(shot, shot.chapter)
    renderPlanning()
  } catch (error) {
    shot.status = next === 'done' ? 'planned' : 'done'
    showToast(`状态保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    planningBusy = false
  }
}

async function removePlanningShot(shotId) {
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || planningProjectId() === null || !window.electronAPI?.shots?.remove) return
  if (!window.confirm(`从分镜板移除「${shot.photo?.filename || '这张样片'}」？\n样片仍会保留在拍摄方案和样片池中。`)) return
  const result = await window.electronAPI.shots.remove(planningProjectId(), Number(shotId))
  if (!result?.success) { showToast(result?.error || '移除失败', 'error'); return }
  await loadPlanning()
}

function openPlanningLanePicker(onPick) {
  const picker = document.getElementById('planningLanePicker')
  if (!picker) {
    onPick('远景')
    return
  }
  picker.innerHTML = `
    <div class="planning-picker-card" role="dialog" aria-label="选择景别">
      <h4>把选中的样片加入哪个景别？</h4>
      <div class="planning-picker-lanes">
        ${PLANNING_LANES.map(lane => `<button type="button" data-lane="${planningEscape(lane.name)}" style="--lane-color:${lane.color}"><span class="planning-lane-dot" aria-hidden="true"></span>${planningEscape(lane.name)}</button>`).join('')}
      </div>
      <div class="planning-picker-actions">
        <button type="button" class="secondary-action" data-picker-cancel>取消</button>
      </div>
    </div>`
  picker.classList.remove('hidden')
  picker.querySelectorAll('[data-lane]').forEach(button => {
    button.addEventListener('click', () => {
      picker.classList.add('hidden')
      onPick(button.dataset.lane)
    })
  })
  picker.querySelector('[data-picker-cancel]')?.addEventListener('click', () => picker.classList.add('hidden'))
  picker.addEventListener('click', event => {
    if (event.target === picker) picker.classList.add('hidden')
  }, { once: true })
}

async function addSelectedPhotosToPlanning(lane = null) {
  const projectId = planningProjectId()
  const ids = Array.from(selectedPhotos).map(Number).filter(id => Number.isInteger(id) && id > 0)
  if (projectId === null) { showToast('请先创建或选择一个拍摄方案', 'warning'); return }
  if (ids.length === 0) { showToast('请先选择要加入分镜板的样片', 'warning'); return }
  const pickLane = lane => {
    if (!window.electronAPI?.shots?.create) return
    void (async () => {
      planningBusy = true
      let added = 0
      try {
        for (const photoId of ids) {
          const result = await window.electronAPI.shots.create(projectId, photoId, { chapter: lane })
          if (result?.success && result.shot && !planningShots.some(shot => Number(shot.id) === Number(result.shot.id))) added += 1
        }
        clearPhotoSelection()
        await loadPlanning()
        showToast(added > 0 ? `已把 ${added} 个样片加入「${lane}」轨道` : '选中的样片已在该轨道中', added > 0 ? 'success' : 'info')
        openPlanningPanel()
      } catch (error) { showToast(`加入分镜板失败：${error instanceof Error ? error.message : String(error)}`, 'error') } finally { planningBusy = false }
    })()
  }
  if (lane) { pickLane(lane); return }
  openPlanningLanePicker(pickLane)
}

async function importPhotosIntoPlanning(importAction) {
  const projectId = planningProjectId()
  if (projectId === null) {
    showToast('请先创建或选择一个拍摄方案', 'warning')
    return
  }
  if (planningBusy || typeof importAction !== 'function') return

  planningBusy = true
  try {
    const result = await importAction()
    if (!result?.success) return

    const photoIds = Array.from(new Set((result.importedPhotoIds || [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)))
    if (photoIds.length === 0) {
      await loadPlanning()
      return
    }

    let added = 0
    for (const photoId of photoIds) {
      const created = await window.electronAPI?.shots?.create?.(projectId, photoId, { chapter: PLANNING_UNFILED })
      if (created?.success && created.shot) added += 1
    }
    await loadPlanning()
    showToast(added > 0 ? `已把 ${added} 张新导入样片放入「待归类」，拖到景别轨道即可` : '新导入样片未能加入分镜板', added > 0 ? 'success' : 'warning')
  } catch (error) {
    showToast(`导入分镜板失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    await loadPlanning()
  } finally {
    planningBusy = false
  }
}

async function exportPlanningPdf() {
  const projectId = planningProjectId()
  if (projectId === null) { showToast('请先创建或选择一个拍摄方案', 'warning'); return }
  if (window.electronAPI?.shots?.getAll) await loadPlanning()
  if (planningShots.length === 0) { showToast('请先把样片加入分镜板', 'warning'); return }
  const unfiled = planningShots.filter(shot => shot.chapter === PLANNING_UNFILED)
  if (unfiled.length > 0 && !window.confirm(`还有 ${unfiled.length} 个条目在「待归类」轨道，导出将排在最后。\n是否继续导出？`)) return
  const project = typeof currentProjectRecord === 'function' ? currentProjectRecord() : null
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const name = `${project?.name || currentProjectName || 'Pic-拍摄方案'}-${date}`
  try {
    if (window.electronAPI?.planningExports?.preflight) {
      const preflight = await window.electronAPI.planningExports.preflight(projectId)
      if (!preflight?.success && (preflight?.ready || 0) === 0) throw new Error(preflight?.error || '没有可导出的有效样片')
      if ((preflight?.missing || 0) > 0) {
        const missingNames = (preflight.items || []).filter(item => !item.ready).slice(0, 5).map(item => item.filename).join('、')
        const suffix = (preflight.missing || 0) > 5 ? '等' : ''
        if (!window.confirm(`有 ${preflight.missing} 张样片无法读取，将跳过后导出。\n${missingNames}${suffix}\n\n是否继续？`)) return
      }
    }
    const result = await window.electronAPI?.planningExports?.exportPdf?.(projectId, name)
    if (!result?.filePath) throw new Error(result?.error || 'PDF 生成失败')
    const suffix = result.failed > 0 ? `，${result.failed} 张样片失败` : ''
    showToast(`已按景别和拍摄顺序导出 ${result.exported} 张样片${suffix}，备注已写入 PDF。`, result.failed > 0 ? 'warning' : 'success')
    if (window.electronAPI?.delivery?.openFolder && result.filePath) void window.electronAPI.delivery.openFolder(result.filePath.replace(/[\\/][^\\/]+$/, ''))
  } catch (error) { showToast(`导出拍摄方案失败：${error instanceof Error ? error.message : String(error)}`, 'error') }
}

function bindPlanningItemEvents(board) {
  board.querySelectorAll('.planning-remove-shot').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation()
    void removePlanningShot(Number(button.dataset.shotId))
  }))
  board.querySelectorAll('.planning-done-toggle').forEach(button => button.addEventListener('click', () => { void togglePlanningShotStatus(Number(button.dataset.shotId)) }))
  board.querySelectorAll('.planning-note').forEach(textarea => {
    let timer = null
    textarea.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => { void savePlanningNote(Number(textarea.dataset.shotId), textarea.value).catch(error => showToast(`备注保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')) }, 400)
    })
  })
  board.querySelectorAll('.planning-shot-card').forEach(card => {
    card.addEventListener('dragstart', event => {
      card.classList.add('is-dragging')
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', String(card.dataset.shotId || ''))
        event.dataTransfer.setData('application/x-pic-shot-lane', card.dataset.lane || '')
        event.dataTransfer.effectAllowed = 'move'
      }
    })
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'))
  })
  board.querySelectorAll('.planning-lane').forEach(lane => {
    const targetLane = lane.dataset.lane
    lane.addEventListener('dragover', event => {
      if (planningBusy) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      lane.classList.add('is-drag-over')
      const strip = lane.querySelector('.planning-lane-strip')
      const dragging = board.querySelector('.planning-shot-card.is-dragging')
      if (!strip || !dragging) return
      strip.querySelector('.planning-lane-empty')?.remove()
      const cards = [...strip.querySelectorAll('.planning-shot-card:not(.is-dragging)')]
      const after = cards.find(item => {
        const rect = item.getBoundingClientRect()
        return event.clientY < rect.top + rect.height / 2
      })
      if (after) strip.insertBefore(dragging, after)
      else strip.appendChild(dragging)
    })
    lane.addEventListener('dragleave', event => {
      if (!lane.contains(event.relatedTarget)) lane.classList.remove('is-drag-over')
    })
    lane.addEventListener('drop', event => {
      event.preventDefault()
      lane.classList.remove('is-drag-over')
      if (planningBusy) return
      const shotId = Number(event.dataTransfer?.getData('text/plain'))
      if (!shotId) return
      const strip = lane.querySelector('.planning-lane-strip')
      const dragging = board.querySelector('.planning-shot-card.is-dragging')
      const nextCard = dragging?.nextElementSibling?.classList.contains('planning-shot-card')
        ? Number(dragging.nextElementSibling.dataset.shotId)
        : null
      void movePlanningShotToLane(shotId, targetLane, nextCard)
    })
  })
}

function bindPlanningEvents() {
  document.getElementById('openPlanningBtn')?.addEventListener('click', openPlanningPanel)
  document.getElementById('planningBackBtn')?.addEventListener('click', closePlanningPanel)
  document.getElementById('planningImportFolderBtn')?.addEventListener('click', () => { void importPhotosIntoPlanning(importFromFolder) })
  document.getElementById('planningImportFilesBtn')?.addEventListener('click', () => { void importPhotosIntoPlanning(importFromFiles) })
  document.getElementById('planningExportBtn')?.addEventListener('click', () => { void exportPlanningPdf() })
  document.getElementById('addToShotListBtn')?.addEventListener('click', () => { void addSelectedPhotosToPlanning() })
  PicEvents?.on('workspace:changed', updateGalleryExportButtonVisibility)
  PicEvents?.on('project:selected', () => { if (currentPanel === 'planning') void loadPlanning() })
  window.electronAPI?.capture?.onSaved?.(() => { if (currentPanel === 'planning') void loadPlanning() })
  updateGalleryExportButtonVisibility()
}

function updateGalleryExportButtonVisibility() {
  const button = document.getElementById('galleryExportBtn')
  button?.classList.toggle('hidden', currentPanel !== 'gallery' || isRecycleBinView)
}

bindPlanningEvents()
