// v5 拍摄清单工作台。
// 该模块把现有 project_selections/project_shots 服务组织成三个明确动作：
// 搜集样片（图库）、编排拍摄（本页）、导出方案（PDF）。
// 保持经典脚本兼容，不向 renderer 暴露新的底层权限。

let planningShots = []
let planningActiveGroup = '__all__'
let planningBusy = false

function planningProjectId() {
  return Number.isInteger(Number(currentProjectId)) && Number(currentProjectId) > 0
    ? Number(currentProjectId)
    : null
}

function planningGroupName(shot) {
  return String(shot?.chapter || '未分组').trim() || '未分组'
}

function planningGroups() {
  const groups = []
  const seen = new Set()
  planningShots.forEach(shot => {
    const group = planningGroupName(shot)
    if (!seen.has(group)) {
      seen.add(group)
      groups.push(group)
    }
  })
  return groups
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

function planningGroupEntries() {
  const map = new Map()
  planningShots.forEach(shot => {
    const group = planningGroupName(shot)
    if (!map.has(group)) map.set(group, [])
    map.get(group).push(shot)
  })
  return Array.from(map.entries())
}

function renderPlanningGroups() {
  const list = document.getElementById('planningGroupList')
  const count = document.getElementById('planningGroupCount')
  if (!list) return
  const groups = planningGroups()
  if (count) count.textContent = String(groups.length)
  const allActive = planningActiveGroup === '__all__'
  list.innerHTML = `
    <button type="button" class="planning-group-item${allActive ? ' is-active' : ''}" data-planning-group="__all__">
      <span><i class="fa-solid fa-layer-group" aria-hidden="true"></i>全部拍摄</span><strong>${planningShots.length}</strong>
    </button>
    ${groups.map(group => {
      const active = planningActiveGroup === group
      const entries = planningShots.filter(shot => planningGroupName(shot) === group)
      return `<button type="button" class="planning-group-item${active ? ' is-active' : ''}" data-planning-group="${planningEscape(group)}">
        <span><i class="fa-solid fa-folder-tree" aria-hidden="true"></i>${planningEscape(group)}</span><strong>${entries.length}</strong>
      </button>`
    }).join('')}
  `
  list.querySelectorAll('[data-planning-group]').forEach(button => {
    button.addEventListener('click', () => {
      planningActiveGroup = button.dataset.planningGroup || '__all__'
      renderPlanning()
    })
  })
}

function planningItemMarkup(shot, index, groupEntries) {
  const photo = planningPhotoForShot(shot)
  const image = planningEscape(planningPhotoSrc(photo))
  const filename = planningEscape(photo?.filename || '未命名样片')
  const note = planningEscape(shot.composition_notes || shot.intent || '')
  const group = planningEscape(planningGroupName(shot))
  const canMoveUp = index > 0
  const canMoveDown = index < groupEntries.length - 1
  return `
    <article class="planning-shot-card" draggable="true" data-shot-id="${Number(shot.id)}">
      <div class="planning-shot-order">${String(index + 1).padStart(2, '0')}</div>
      <div class="planning-shot-image-wrap">
        <img class="planning-shot-image" src="${image}" alt="${filename}" loading="lazy">
      </div>
      <div class="planning-shot-main">
        <div class="planning-shot-heading">
          <div><span class="planning-shot-group">${group}</span><strong>${filename}</strong></div>
          <button type="button" class="planning-icon-button planning-remove-shot" data-shot-id="${Number(shot.id)}" title="从拍摄清单移除" aria-label="从拍摄清单移除"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <label class="planning-note-label">拍摄备注
          <textarea class="planning-note" data-shot-id="${Number(shot.id)}" rows="2" maxlength="500" placeholder="例如：参考姿势和机位；右侧窗光；准备白色椅子">${note}</textarea>
        </label>
        <div class="planning-shot-actions">
          <button type="button" class="secondary-action planning-move-up" data-shot-id="${Number(shot.id)}" ${canMoveUp ? '' : 'disabled'}><i class="fa-solid fa-arrow-up"></i><span>上移</span></button>
          <button type="button" class="secondary-action planning-move-down" data-shot-id="${Number(shot.id)}" ${canMoveDown ? '' : 'disabled'}><i class="fa-solid fa-arrow-down"></i><span>下移</span></button>
        </div>
      </div>
    </article>
  `
}

function renderPlanningItems() {
  const container = document.getElementById('planningItems')
  const empty = document.getElementById('planningEmpty')
  if (!container || !empty) return
  const entries = planningGroupEntries()
    .filter(([group]) => planningActiveGroup === '__all__' || group === planningActiveGroup)
  empty.classList.toggle('hidden', planningShots.length > 0)
  container.classList.toggle('hidden', planningShots.length === 0)
  if (planningShots.length === 0) {
    container.innerHTML = ''
    return
  }
  container.innerHTML = entries.map(([group, shots]) => `
    <section class="planning-group-section" data-planning-group-section="${planningEscape(group)}">
      <div class="planning-group-section-header">
        <div><span class="planning-group-index">${String(planningGroups().indexOf(group) + 1).padStart(2, '0')}</span><h3>${planningEscape(group)}</h3><span class="planning-group-size">${shots.length} 个拍摄条目</span></div>
        <div class="planning-group-section-actions">
          <button type="button" class="secondary-action planning-rename-group" data-group="${planningEscape(group)}"><i class="fa-solid fa-pen"></i><span>重命名</span></button>
        </div>
      </div>
      <div class="planning-shot-list">
        ${shots.map((shot, index) => planningItemMarkup(shot, index, shots)).join('')}
      </div>
    </section>
  `).join('')
  bindPlanningItemEvents(container)
}

function renderPlanning() {
  renderPlanningGroups()
  renderPlanningItems()
  const summary = document.getElementById('planningSummary')
  if (summary) {
    const groupCount = planningGroups().length
    summary.textContent = planningShots.length > 0
      ? `${groupCount} 个拍摄分组 · ${planningShots.length} 个拍摄条目`
      : '把样片编排成可以照着拍的顺序'
  }
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
    const result = await window.electronAPI.shots.getAll(projectId)
    planningShots = Array.isArray(result) ? result : []
    if (planningActiveGroup !== '__all__' && !planningGroups().includes(planningActiveGroup)) planningActiveGroup = '__all__'
    renderPlanning()
  } catch (error) {
    planningShots = []
    renderPlanning()
    showToast(`加载拍摄清单失败：${error instanceof Error ? error.message : String(error)}`, 'error')
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
  updateStatusBar()
  void loadPlanning()
  PicEvents.emit('workspace:changed', 'planning')
  return true
}

function closePlanningPanel() {
  document.getElementById('planningPanel')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  currentPanel = 'gallery'
  updateStatusBar()
  if (typeof updateSelectionActionBar === 'function') updateSelectionActionBar()
  PicEvents.emit('workspace:changed', 'gallery')
}

function planningFlattenedIds(groups = planningGroupEntries()) {
  return groups.flatMap(([, shots]) => shots.map(shot => Number(shot.id)))
}

async function persistPlanningOrder() {
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.reorder) return false
  const ids = planningFlattenedIds()
  const result = await window.electronAPI.shots.reorder(projectId, ids)
  if (!result?.success) throw new Error(result?.error || '拍摄顺序保存失败')
  planningShots = Array.isArray(result.shots) ? result.shots : planningShots
  return true
}

async function movePlanningShot(shotId, delta) {
  if (planningBusy) return
  const index = planningShots.findIndex(shot => Number(shot.id) === Number(shotId))
  if (index < 0) return
  const group = planningGroupName(planningShots[index])
  const indices = planningShots.map((shot, i) => planningGroupName(shot) === group ? i : -1).filter(i => i >= 0)
  const localIndex = indices.indexOf(index)
  const targetLocalIndex = localIndex + delta
  if (targetLocalIndex < 0 || targetLocalIndex >= indices.length) return
  const targetIndex = indices[targetLocalIndex]
  const [item] = planningShots.splice(index, 1)
  planningShots.splice(targetIndex, 0, item)
  planningBusy = true
  try {
    await persistPlanningOrder()
    renderPlanning()
  } catch (error) {
    await loadPlanning()
    showToast(`保存顺序失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    planningBusy = false
  }
}

async function savePlanningNote(shotId, value) {
  const projectId = planningProjectId()
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || projectId === null || !window.electronAPI?.shots?.update) return
  const result = await window.electronAPI.shots.update(projectId, Number(shotId), {
    chapter: planningGroupName(shot),
    title: shot.title,
    intent: shot.intent,
    compositionNotes: value.trim() || null,
    lightingGearNotes: shot.lighting_gear_notes,
    status: shot.status
  })
  if (!result?.success) throw new Error(result?.error || '备注保存失败')
  if (result.shot) Object.assign(shot, result.shot)
}

async function renamePlanningGroup(group) {
  const next = window.prompt('重命名拍摄分组', group)
  if (next === null) return
  const normalized = next.trim()
  if (!normalized || normalized === group) return
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.update) return
  const entries = planningShots.filter(shot => planningGroupName(shot) === group)
  planningBusy = true
  try {
    for (const shot of entries) {
      const result = await window.electronAPI.shots.update(projectId, Number(shot.id), {
        chapter: normalized,
        title: shot.title,
        intent: shot.intent,
        compositionNotes: shot.composition_notes,
        lightingGearNotes: shot.lighting_gear_notes,
        status: shot.status
      })
      if (!result?.success) throw new Error(result?.error || '分组保存失败')
    }
    planningActiveGroup = normalized
    await loadPlanning()
  } catch (error) {
    showToast(`重命名分组失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    await loadPlanning()
  } finally {
    planningBusy = false
  }
}

async function removePlanningShot(shotId) {
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || planningProjectId() === null || !window.electronAPI?.shots?.remove) return
  if (!window.confirm(`从拍摄清单移除「${shot.photo?.filename || '这张样片'}」？\n样片仍会保留在样片池中。`)) return
  const result = await window.electronAPI.shots.remove(planningProjectId(), Number(shotId))
  if (!result?.success) {
    showToast(result?.error || '移除失败', 'error')
    return
  }
  await loadPlanning()
}

async function addSelectedPhotosToPlanning() {
  const projectId = planningProjectId()
  const ids = Array.from(selectedPhotos).map(Number).filter(id => Number.isInteger(id) && id > 0)
  if (projectId === null) {
    showToast('请先创建或选择一个拍摄方案', 'warning')
    return
  }
  if (ids.length === 0) {
    showToast('请先选择要加入拍摄清单的样片', 'warning')
    return
  }
  const chapter = window.prompt('加入哪个拍摄分组？', planningActiveGroup !== '__all__' ? planningActiveGroup : '未分组')
  if (chapter === null) return
  const group = chapter.trim() || '未分组'
  if (!window.electronAPI?.shots?.create) return
  planningBusy = true
  let added = 0
  try {
    for (const photoId of ids) {
      const result = await window.electronAPI.shots.create(projectId, photoId, { chapter: group })
      if (result?.success && result.shot) {
        if (!planningShots.some(shot => Number(shot.id) === Number(result.shot.id))) added += 1
      }
    }
    planningActiveGroup = group
    clearPhotoSelection()
    await loadPlanning()
    showToast(added > 0 ? `已加入 ${added} 个拍摄条目` : '选中的样片已在拍摄清单中', 'success')
    openPlanningPanel()
  } catch (error) {
    showToast(`加入拍摄清单失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    planningBusy = false
  }
}

async function addGroupFromSelection() {
  await addSelectedPhotosToPlanning()
}

async function exportPlanningPdf() {
  const projectId = planningProjectId()
  if (projectId === null || planningShots.length === 0) {
    showToast('请先把样片加入拍摄清单', 'warning')
    return
  }
  const paths = planningShots.map(shot => planningPhotoForShot(shot)?.filepath).filter(Boolean)
  if (paths.length === 0) {
    showToast('拍摄清单中没有可导出的本地样片', 'warning')
    return
  }
  const project = typeof currentProjectRecord === 'function' ? currentProjectRecord() : null
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const name = `${project?.name || currentProjectName || 'Pic-拍摄方案'}-${date}`
  try {
    const result = await window.electronAPI?.photos?.exportToPdf?.(paths, name)
    if (!result?.filePath) throw new Error(result?.error || 'PDF 生成失败')
    if (window.electronAPI?.planningExports?.record) {
      await window.electronAPI.planningExports.record(projectId, 'shot-list', result.filePath, planningShots.length)
    }
    const suffix = result.failed > 0 ? `，${result.failed} 张样片失败` : ''
    showToast(`已按拍摄顺序导出 ${result.exported} 张样片${suffix}。备注仍保存在拍摄清单中。`, result.failed > 0 ? 'warning' : 'success')
    if (window.electronAPI?.delivery?.openFolder && result.filePath) {
      const folder = result.filePath.replace(/[\\/][^\\/]+$/, '')
      void window.electronAPI.delivery.openFolder(folder)
    }
  } catch (error) {
    showToast(`导出拍摄方案失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

function bindPlanningItemEvents(container) {
  container.querySelectorAll('.planning-move-up').forEach(button => {
    button.addEventListener('click', () => { void movePlanningShot(Number(button.dataset.shotId), -1) })
  })
  container.querySelectorAll('.planning-move-down').forEach(button => {
    button.addEventListener('click', () => { void movePlanningShot(Number(button.dataset.shotId), 1) })
  })
  container.querySelectorAll('.planning-remove-shot').forEach(button => {
    button.addEventListener('click', () => { void removePlanningShot(Number(button.dataset.shotId)) })
  })
  container.querySelectorAll('.planning-rename-group').forEach(button => {
    button.addEventListener('click', () => { void renamePlanningGroup(button.dataset.group || '未分组') })
  })
  container.querySelectorAll('.planning-note').forEach(textarea => {
    let timer = null
    textarea.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void savePlanningNote(Number(textarea.dataset.shotId), textarea.value).catch(error => {
          showToast(`备注保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')
        })
      }, 400)
    })
  })
  container.querySelectorAll('.planning-shot-card').forEach(card => {
    card.addEventListener('dragstart', event => {
      card.classList.add('is-dragging')
      event.dataTransfer?.setData('text/plain', card.dataset.shotId || '')
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    })
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'))
    card.addEventListener('dragover', event => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    })
    card.addEventListener('drop', event => {
      event.preventDefault()
      const sourceId = Number(event.dataTransfer?.getData('text/plain'))
      const targetId = Number(card.dataset.shotId)
      if (!sourceId || !targetId || sourceId === targetId) return
      const sourceIndex = planningShots.findIndex(shot => Number(shot.id) === sourceId)
      const targetIndex = planningShots.findIndex(shot => Number(shot.id) === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || planningGroupName(planningShots[sourceIndex]) !== planningGroupName(planningShots[targetIndex])) return
      const [item] = planningShots.splice(sourceIndex, 1)
      planningShots.splice(targetIndex, 0, item)
      planningBusy = true
      void persistPlanningOrder().then(() => renderPlanning()).catch(error => {
        void loadPlanning()
        showToast(`保存顺序失败：${error instanceof Error ? error.message : String(error)}`, 'error')
      }).finally(() => { planningBusy = false })
    })
  })
}

function bindPlanningEvents() {
  document.getElementById('openPlanningBtn')?.addEventListener('click', openPlanningPanel)
  document.getElementById('statusPlanningBtn')?.addEventListener('click', openPlanningPanel)
  document.getElementById('planningBackBtn')?.addEventListener('click', closePlanningPanel)
  document.getElementById('planningAddGroupBtn')?.addEventListener('click', addGroupFromSelection)
  document.getElementById('planningExportBtn')?.addEventListener('click', () => { void exportPlanningPdf() })
  document.getElementById('addToShotListBtn')?.addEventListener('click', () => { void addSelectedPhotosToPlanning() })
  PicEvents?.on('project:selected', () => {
    planningActiveGroup = '__all__'
    if (currentPanel === 'planning') void loadPlanning()
  })
  window.electronAPI?.capture?.onSaved?.(() => {
    if (currentPanel === 'planning') void loadPlanning()
  })
}

bindPlanningEvents()
