// v5 拍摄清单工作台。
// 样片（Reference）和拍摄条目（ShotItem）分离：同一张样片可以加入多个分组，
// 分组本身也可以为空。保持经典脚本兼容，不向 renderer 暴露底层权限。

let planningShots = []
let planningGroupsState = []
let planningActiveGroup = '__all__'
let planningBusy = false

function planningProjectId() {
  return Number.isInteger(Number(currentProjectId)) && Number(currentProjectId) > 0 ? Number(currentProjectId) : null
}

function planningGroupId(shot) {
  const value = Number(shot?.group_id)
  return Number.isInteger(value) && value > 0 ? value : null
}

function planningGroupName(shot) {
  return String(shot?.chapter || '未分组').trim() || '未分组'
}

function planningGroups() {
  const groups = Array.isArray(planningGroupsState) ? planningGroupsState.slice() : []
  const known = new Set(groups.map(group => String(group.name)))
  planningShots.forEach(shot => {
    const name = planningGroupName(shot)
    if (!known.has(name)) {
      known.add(name)
      groups.push({ id: planningGroupId(shot) || 0, name, position: groups.length })
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
  const shotsByGroup = new Map()
  planningShots.forEach(shot => {
    const id = planningGroupId(shot)
    const key = id ? String(id) : planningGroupName(shot)
    if (!shotsByGroup.has(key)) shotsByGroup.set(key, [])
    shotsByGroup.get(key).push(shot)
  })
  return planningGroups().map(group => [group, shotsByGroup.get(String(group.id)) || shotsByGroup.get(group.name) || []])
}

function planningGroupKey(group) {
  return group?.id ? String(group.id) : String(group?.name || '')
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
    ${groups.map((group, index) => {
      const key = planningGroupKey(group)
      const active = planningActiveGroup === key
      const entries = planningGroupEntries().find(([item]) => planningGroupKey(item) === key)?.[1] || []
      return `<div class="planning-group-row">
        <button type="button" class="planning-group-item${active ? ' is-active' : ''}" data-planning-group="${planningEscape(key)}">
          <span><i class="fa-solid fa-folder-tree" aria-hidden="true"></i>${planningEscape(group.name)}</span><strong>${entries.length}</strong>
        </button>
        <div class="planning-group-row-actions">
          <button type="button" class="planning-icon-button planning-move-group-up" data-group-id="${Number(group.id)}" ${Number(group.id) > 0 && index > 0 ? '' : 'disabled'} title="分组上移" aria-label="分组上移"><i class="fa-solid fa-chevron-up"></i></button>
          <button type="button" class="planning-icon-button planning-move-group-down" data-group-id="${Number(group.id)}" ${Number(group.id) > 0 && index < groups.length - 1 ? '' : 'disabled'} title="分组下移" aria-label="分组下移"><i class="fa-solid fa-chevron-down"></i></button>
          <button type="button" class="planning-icon-button planning-rename-group" data-group-id="${Number(group.id)}" ${Number(group.id) > 0 ? '' : 'disabled'} title="重命名分组" aria-label="重命名分组"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="planning-icon-button planning-delete-group" data-group-id="${Number(group.id)}" ${Number(group.id) > 0 ? '' : 'disabled'} title="删除分组" aria-label="删除分组"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
    }).join('')}
  `
  list.querySelectorAll('[data-planning-group]').forEach(button => {
    button.addEventListener('click', () => {
      planningActiveGroup = button.dataset.planningGroup || '__all__'
      renderPlanning()
    })
  })
  list.querySelectorAll('.planning-move-group-up').forEach(button => {
    button.addEventListener('click', () => { void movePlanningGroup(Number(button.dataset.groupId), -1) })
  })
  list.querySelectorAll('.planning-move-group-down').forEach(button => {
    button.addEventListener('click', () => { void movePlanningGroup(Number(button.dataset.groupId), 1) })
  })
  list.querySelectorAll('.planning-rename-group').forEach(button => {
    button.addEventListener('click', () => { void renamePlanningGroup(Number(button.dataset.groupId)) })
  })
  list.querySelectorAll('.planning-delete-group').forEach(button => {
    button.addEventListener('click', () => { void removePlanningGroup(Number(button.dataset.groupId)) })
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
      <div class="planning-shot-image-wrap"><img class="planning-shot-image" src="${image}" alt="${filename}" loading="lazy"></div>
      <div class="planning-shot-main">
        <div class="planning-shot-heading">
          <div><span class="planning-shot-group">${group}</span><strong>${filename}</strong></div>
          <button type="button" class="planning-icon-button planning-remove-shot" data-shot-id="${Number(shot.id)}" title="从此分组移除" aria-label="从此分组移除"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <label class="planning-note-label">拍摄备注
          <textarea class="planning-note" data-shot-id="${Number(shot.id)}" rows="2" maxlength="500" placeholder="例如：参考姿势和机位；右侧窗光；准备白色椅子">${note}</textarea>
        </label>
        <div class="planning-shot-actions">
          <button type="button" class="secondary-action planning-move-up" data-shot-id="${Number(shot.id)}" ${canMoveUp ? '' : 'disabled'}><i class="fa-solid fa-arrow-up"></i><span>上移</span></button>
          <button type="button" class="secondary-action planning-move-down" data-shot-id="${Number(shot.id)}" ${canMoveDown ? '' : 'disabled'}><i class="fa-solid fa-arrow-down"></i><span>下移</span></button>
        </div>
      </div>
    </article>`
}

function renderPlanningItems() {
  const container = document.getElementById('planningItems')
  const empty = document.getElementById('planningEmpty')
  if (!container || !empty) return
  const entries = planningGroupEntries().filter(([group]) => planningActiveGroup === '__all__' || planningGroupKey(group) === planningActiveGroup)
  empty.classList.toggle('hidden', planningShots.length > 0 || entries.some(([, shots]) => shots.length > 0))
  container.classList.toggle('hidden', planningShots.length === 0 && entries.every(([, shots]) => shots.length === 0))
  if (entries.length === 0 || entries.every(([, shots]) => shots.length === 0)) {
    container.innerHTML = ''
    return
  }
  container.innerHTML = entries.filter(([, shots]) => shots.length > 0).map(([group, shots]) => `
    <section class="planning-group-section" data-planning-group-section="${planningEscape(planningGroupKey(group))}">
      <div class="planning-group-section-header">
        <div><span class="planning-group-index">${String(planningGroups().findIndex(item => planningGroupKey(item) === planningGroupKey(group)) + 1).padStart(2, '0')}</span><h3>${planningEscape(group.name)}</h3><span class="planning-group-size">${shots.length} 个拍摄条目</span></div>
        <div class="planning-group-section-actions">
          <button type="button" class="secondary-action planning-rename-group" data-group-id="${Number(group.id)}"><i class="fa-solid fa-pen"></i><span>重命名</span></button>
          <button type="button" class="secondary-action planning-delete-group" data-group-id="${Number(group.id)}"><i class="fa-solid fa-trash"></i><span>删除分组</span></button>
        </div>
      </div>
      <div class="planning-shot-list">${shots.map((shot, index) => planningItemMarkup(shot, index, shots)).join('')}</div>
    </section>`).join('')
  bindPlanningItemEvents(container)
}

function renderPlanning() {
  renderPlanningGroups()
  renderPlanningItems()
  const summary = document.getElementById('planningSummary')
  if (summary) {
    const groupCount = planningGroups().length
    summary.textContent = groupCount > 0 ? `${groupCount} 个拍摄分组 · ${planningShots.length} 个拍摄条目` : '把样片编排成可以照着拍的顺序'
  }
  if (typeof updateSelectionActionBar === 'function') updateSelectionActionBar()
}

async function loadPlanning() {
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.getAll) {
    planningShots = []
    planningGroupsState = []
    renderPlanning()
    return
  }
  try {
    const [groupsResult, shotsResult] = await Promise.all([
      window.electronAPI.shots.getGroups ? window.electronAPI.shots.getGroups(projectId) : Promise.resolve([]),
      window.electronAPI.shots.getAll(projectId)
    ])
    planningGroupsState = Array.isArray(groupsResult) ? groupsResult : []
    planningShots = Array.isArray(shotsResult) ? shotsResult : []
    if (planningActiveGroup !== '__all__' && !planningGroups().some(group => planningGroupKey(group) === planningActiveGroup)) planningActiveGroup = '__all__'
    renderPlanning()
  } catch (error) {
    planningShots = []
    planningGroupsState = []
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
  const result = await window.electronAPI.shots.reorder(projectId, planningFlattenedIds())
  if (!result?.success) throw new Error(result?.error || '拍摄顺序保存失败')
  planningShots = Array.isArray(result.shots) ? result.shots : planningShots
  return true
}

async function movePlanningShot(shotId, delta) {
  if (planningBusy) return
  const index = planningShots.findIndex(shot => Number(shot.id) === Number(shotId))
  if (index < 0) return
  const groupId = planningGroupId(planningShots[index])
  const indices = planningShots.map((shot, i) => planningGroupId(shot) === groupId ? i : -1).filter(i => i >= 0)
  const targetLocalIndex = indices.indexOf(index) + delta
  if (targetLocalIndex < 0 || targetLocalIndex >= indices.length) return
  const [item] = planningShots.splice(index, 1)
  planningShots.splice(indices[targetLocalIndex], 0, item)
  planningBusy = true
  try { await persistPlanningOrder(); renderPlanning() } catch (error) { await loadPlanning(); showToast(`保存顺序失败：${error instanceof Error ? error.message : String(error)}`, 'error') } finally { planningBusy = false }
}

async function movePlanningGroup(groupId, delta) {
  if (planningBusy || !window.electronAPI?.shots?.reorderGroups) return
  const groups = planningGroups().filter(group => Number(group.id) > 0)
  const index = groups.findIndex(group => Number(group.id) === Number(groupId))
  const target = index + delta
  if (index < 0 || target < 0 || target >= groups.length) return
  const [group] = groups.splice(index, 1)
  groups.splice(target, 0, group)
  planningBusy = true
  try {
    const result = await window.electronAPI.shots.reorderGroups(planningProjectId(), groups.map(item => Number(item.id)))
    if (!result?.success) throw new Error(result?.error || '分组顺序保存失败')
    planningGroupsState = Array.isArray(result.groups) ? result.groups : planningGroupsState
    renderPlanning()
  } catch (error) { showToast(`保存分组顺序失败：${error instanceof Error ? error.message : String(error)}`, 'error'); await loadPlanning() } finally { planningBusy = false }
}

async function savePlanningNote(shotId, value) {
  const projectId = planningProjectId()
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || projectId === null || !window.electronAPI?.shots?.update) return
  const result = await window.electronAPI.shots.update(projectId, Number(shotId), { chapter: planningGroupName(shot), title: shot.title, intent: shot.intent, compositionNotes: value.trim() || null, lightingGearNotes: shot.lighting_gear_notes, status: shot.status })
  if (!result?.success) throw new Error(result?.error || '备注保存失败')
  if (result.shot) Object.assign(shot, result.shot)
}

async function createPlanningGroup() {
  const projectId = planningProjectId()
  if (projectId === null || !window.electronAPI?.shots?.createGroup) return
  const name = window.prompt('新建拍摄分组', '未分组')
  if (name === null || !name.trim()) return
  planningBusy = true
  try {
    const result = await window.electronAPI.shots.createGroup(projectId, name.trim())
    if (!result?.success) throw new Error(result?.error || '分组创建失败')
    if (result.group) planningActiveGroup = planningGroupKey(result.group)
    await loadPlanning()
  } catch (error) { showToast(`新建分组失败：${error instanceof Error ? error.message : String(error)}`, 'error') } finally { planningBusy = false }
}

async function renamePlanningGroup(groupId) {
  const group = planningGroups().find(item => Number(item.id) === Number(groupId))
  const projectId = planningProjectId()
  if (!group || projectId === null || !window.electronAPI?.shots?.renameGroup) return
  const next = window.prompt('重命名拍摄分组', group.name)
  if (next === null || !next.trim() || next.trim() === group.name) return
  try {
    const result = await window.electronAPI.shots.renameGroup(projectId, group.id, next.trim())
    if (!result?.success) throw new Error(result?.error || '分组保存失败')
    planningActiveGroup = String(group.id)
    await loadPlanning()
  } catch (error) { showToast(`重命名分组失败：${error instanceof Error ? error.message : String(error)}`, 'error') }
}

async function removePlanningGroup(groupId) {
  const group = planningGroups().find(item => Number(item.id) === Number(groupId))
  const projectId = planningProjectId()
  if (!group || projectId === null || !window.electronAPI?.shots?.removeGroup) return
  if (!window.confirm(`删除拍摄分组「${group.name}」？\n只会移除该组中的拍摄条目，样片仍保留在样片池中。`)) return
  const result = await window.electronAPI.shots.removeGroup(projectId, group.id)
  if (!result?.success) { showToast(result?.error || '删除分组失败', 'error'); return }
  planningActiveGroup = '__all__'
  await loadPlanning()
}

async function removePlanningShot(shotId) {
  const shot = planningShots.find(item => Number(item.id) === Number(shotId))
  if (!shot || planningProjectId() === null || !window.electronAPI?.shots?.remove) return
  if (!window.confirm(`从此分组移除「${shot.photo?.filename || '这张样片'}」？\n样片仍会保留在拍摄方案和样片池中。`)) return
  const result = await window.electronAPI.shots.remove(planningProjectId(), Number(shotId))
  if (!result?.success) { showToast(result?.error || '移除失败', 'error'); return }
  await loadPlanning()
}

async function addSelectedPhotosToPlanning() {
  const projectId = planningProjectId()
  const ids = Array.from(selectedPhotos).map(Number).filter(id => Number.isInteger(id) && id > 0)
  if (projectId === null) { showToast('请先创建或选择一个拍摄方案', 'warning'); return }
  if (ids.length === 0) { showToast('请先选择要加入拍摄清单的样片', 'warning'); return }
  const active = planningGroups().find(group => planningGroupKey(group) === planningActiveGroup)
  const chapter = window.prompt('加入哪个拍摄分组？', active?.name || '未分组')
  if (chapter === null || !window.electronAPI?.shots?.create) return
  const group = chapter.trim() || '未分组'
  planningBusy = true
  let added = 0
  try {
    for (const photoId of ids) {
      const result = await window.electronAPI.shots.create(projectId, photoId, { chapter: group })
      if (result?.success && result.shot && !planningShots.some(shot => Number(shot.id) === Number(result.shot.id))) added += 1
    }
    clearPhotoSelection()
    await loadPlanning()
    const currentGroup = planningGroups().find(item => item.name === group)
    planningActiveGroup = currentGroup ? planningGroupKey(currentGroup) : '__all__'
    showToast(added > 0 ? `已加入 ${added} 个拍摄条目` : '选中的样片已在该拍摄分组中', 'success')
    openPlanningPanel()
  } catch (error) { showToast(`加入拍摄清单失败：${error instanceof Error ? error.message : String(error)}`, 'error') } finally { planningBusy = false }
}

async function exportPlanningPdf() {
  const projectId = planningProjectId()
  if (projectId === null || planningShots.length === 0) { showToast('请先把样片加入拍摄清单', 'warning'); return }
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
    showToast(`已按分组和拍摄顺序导出 ${result.exported} 张样片${suffix}，备注已写入 PDF。`, result.failed > 0 ? 'warning' : 'success')
    if (window.electronAPI?.delivery?.openFolder && result.filePath) void window.electronAPI.delivery.openFolder(result.filePath.replace(/[\\/][^\\/]+$/, ''))
  } catch (error) { showToast(`导出拍摄方案失败：${error instanceof Error ? error.message : String(error)}`, 'error') }
}

function bindPlanningItemEvents(container) {
  container.querySelectorAll('.planning-move-up').forEach(button => button.addEventListener('click', () => { void movePlanningShot(Number(button.dataset.shotId), -1) }))
  container.querySelectorAll('.planning-move-down').forEach(button => button.addEventListener('click', () => { void movePlanningShot(Number(button.dataset.shotId), 1) }))
  container.querySelectorAll('.planning-remove-shot').forEach(button => button.addEventListener('click', () => { void removePlanningShot(Number(button.dataset.shotId)) }))
  container.querySelectorAll('.planning-rename-group').forEach(button => button.addEventListener('click', () => { void renamePlanningGroup(Number(button.dataset.groupId)) }))
  container.querySelectorAll('.planning-delete-group').forEach(button => button.addEventListener('click', () => { void removePlanningGroup(Number(button.dataset.groupId)) }))
  container.querySelectorAll('.planning-note').forEach(textarea => {
    let timer = null
    textarea.addEventListener('input', () => {
      clearTimeout(timer)
      timer = setTimeout(() => { void savePlanningNote(Number(textarea.dataset.shotId), textarea.value).catch(error => showToast(`备注保存失败：${error instanceof Error ? error.message : String(error)}`, 'error')) }, 400)
    })
  })
  container.querySelectorAll('.planning-shot-card').forEach(card => {
    card.addEventListener('dragstart', event => { card.classList.add('is-dragging'); event.dataTransfer?.setData('text/plain', card.dataset.shotId || ''); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move' })
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'))
    card.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move' })
    card.addEventListener('drop', event => {
      event.preventDefault()
      const sourceId = Number(event.dataTransfer?.getData('text/plain'))
      const targetId = Number(card.dataset.shotId)
      const sourceIndex = planningShots.findIndex(shot => Number(shot.id) === sourceId)
      const targetIndex = planningShots.findIndex(shot => Number(shot.id) === targetId)
      if (!sourceId || !targetId || sourceIndex < 0 || targetIndex < 0 || planningGroupId(planningShots[sourceIndex]) !== planningGroupId(planningShots[targetIndex])) return
      const [item] = planningShots.splice(sourceIndex, 1)
      planningShots.splice(targetIndex, 0, item)
      planningBusy = true
      void persistPlanningOrder().then(() => renderPlanning()).catch(error => { void loadPlanning(); showToast(`保存顺序失败：${error instanceof Error ? error.message : String(error)}`, 'error') }).finally(() => { planningBusy = false })
    })
  })
}

function bindPlanningEvents() {
  document.getElementById('openPlanningBtn')?.addEventListener('click', openPlanningPanel)
  document.getElementById('statusPlanningBtn')?.addEventListener('click', openPlanningPanel)
  document.getElementById('planningBackBtn')?.addEventListener('click', closePlanningPanel)
  document.getElementById('planningAddGroupBtn')?.addEventListener('click', () => { void createPlanningGroup() })
  document.getElementById('planningExportBtn')?.addEventListener('click', () => { void exportPlanningPdf() })
  document.getElementById('addToShotListBtn')?.addEventListener('click', () => { void addSelectedPhotosToPlanning() })
  PicEvents?.on('project:selected', () => { planningActiveGroup = '__all__'; if (currentPanel === 'planning') void loadPlanning() })
  window.electronAPI?.capture?.onSaved?.(() => { if (currentPanel === 'planning') void loadPlanning() })
}

bindPlanningEvents()
