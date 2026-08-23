// Independent shot-list workspace generated from the persistent inspiration board.
let shotListItems = []
let shotListDragId = null

if (window.PicState) {
  Object.defineProperty(window.PicState, 'shotListItems', {
    enumerable: true,
    configurable: true,
    get: () => shotListItems
  })
}

function shotStatusLabel(status) {
  return status === 'ready' ? '已准备' : status === 'done' ? '已完成' : '待拍摄'
}

function renderShotList() {
  const container = document.getElementById('shotListItems')
  const summary = document.getElementById('shotListSummary')
  if (!container) return
  if (summary) summary.textContent = shotListItems.length > 0
    ? `${shotListItems.length} 个拍摄项 · 可拖动调整现场顺序`
    : '从灵感板生成有顺序的拍摄项。'
  if (shotListItems.length === 0) {
    container.innerHTML = '<div class="shot-list-empty"><i class="fa-solid fa-list-check" aria-hidden="true"></i><p>还没有拍摄清单</p><span>先在灵感板中整理参考样片，再生成拍摄项。</span></div>'
    return
  }

  container.innerHTML = shotListItems.map((shot, index) => {
    const photo = shot.photo || {}
    const status = shot.status || 'planned'
    const deleted = photo.deleted_at ? ' is-deleted' : ''
    return `
      <article class="shot-list-card${deleted}" draggable="true" data-shot-id="${shot.id}">
        <div class="shot-list-card-index">${String(index + 1).padStart(2, '0')}</div>
        <div class="shot-list-card-reference">
          <img src="${escapeHtml(photo.thumbnail_path || photo.filepath || '')}" alt="${escapeHtml(photo.filename || '')}">
          <span>${escapeHtml(photo.filename || '未命名样片')}</span>
          <small>${escapeHtml(shot.chapter || '未分组')}</small>
          ${photo.deleted_at ? '<small class="shot-list-deleted-warning">回收站中的参考样片</small>' : ''}
        </div>
        <div class="shot-list-card-fields">
          <label>拍摄项标题<input class="shot-title" type="text" maxlength="120" value="${escapeHtml(shot.title || '')}"></label>
          <label>拍摄意图<textarea class="shot-intent" rows="2" maxlength="500" placeholder="这张参考图要指导什么？">${escapeHtml(shot.intent || '')}</textarea></label>
          <label>动作 / 构图说明<textarea class="shot-composition" rows="2" maxlength="500" placeholder="动作、机位、构图和取景">${escapeHtml(shot.composition_notes || '')}</textarea></label>
          <label>灯光 / 器材提示<textarea class="shot-lighting" rows="2" maxlength="500" placeholder="灯光、镜头或器材提示">${escapeHtml(shot.lighting_gear_notes || '')}</textarea></label>
        </div>
        <div class="shot-list-card-actions">
          <select class="shot-status" aria-label="拍摄项状态">
            <option value="planned" ${status === 'planned' ? 'selected' : ''}>${shotStatusLabel('planned')}</option>
            <option value="ready" ${status === 'ready' ? 'selected' : ''}>${shotStatusLabel('ready')}</option>
            <option value="done" ${status === 'done' ? 'selected' : ''}>${shotStatusLabel('done')}</option>
          </select>
          <button class="shot-save-btn primary-action" type="button"><i class="fa-solid fa-check" aria-hidden="true"></i><span>保存</span></button>
          <button class="shot-remove-btn secondary-action" type="button"><i class="fa-solid fa-trash" aria-hidden="true"></i><span>移除</span></button>
          <span class="shot-drag-hint"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i>拖动排序</span>
        </div>
      </article>
    `
  }).join('')

  container.querySelectorAll('.shot-list-card').forEach(card => {
    card.addEventListener('dragstart', event => {
      shotListDragId = Number(card.dataset.shotId)
      event.dataTransfer?.setData('text/plain', String(shotListDragId))
      card.classList.add('dragging')
    })
    card.addEventListener('dragend', () => {
      shotListDragId = null
      card.classList.remove('dragging')
    })
    card.addEventListener('dragover', event => {
      event.preventDefault()
      card.classList.add('drag-over')
    })
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'))
    card.addEventListener('drop', event => {
      event.preventDefault()
      card.classList.remove('drag-over')
      const draggedId = Number(event.dataTransfer?.getData('text/plain') || shotListDragId)
      const targetId = Number(card.dataset.shotId)
      if (draggedId && targetId && draggedId !== targetId) void reorderShotList(draggedId, targetId)
    })
  })
}

async function loadShotList(projectId = currentProjectId) {
  shotListItems = []
  if (projectId === null || projectId === undefined) {
    renderShotList()
    return
  }
  try {
    if (window.electronAPI?.shots?.getAll) shotListItems = await window.electronAPI.shots.getAll(projectId)
  } catch (error) {
    console.error('加载拍摄清单失败:', error)
    showToast('拍摄清单加载失败', 'error')
  }
  renderShotList()
}

async function generateShotList() {
  if (currentProjectId === null || selectionTrayItems.length === 0) {
    showToast('请先在灵感板中加入至少一张参考样片', 'warning')
    return
  }
  try {
    const result = await window.electronAPI.shots.generateFromSelections(currentProjectId)
    if (!result.success) throw new Error(result.error || '生成拍摄清单失败')
    shotListItems = result.shots || []
    renderShotList()
    showToast('已从灵感板生成拍摄清单', 'success')
  } catch (error) {
    showToast(`生成拍摄清单失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

function readShotCard(card) {
  return {
    title: card.querySelector('.shot-title')?.value || '',
    intent: card.querySelector('.shot-intent')?.value || '',
    compositionNotes: card.querySelector('.shot-composition')?.value || '',
    lightingGearNotes: card.querySelector('.shot-lighting')?.value || '',
    status: card.querySelector('.shot-status')?.value || 'planned'
  }
}

async function saveShotCard(card) {
  const shotId = Number(card.dataset.shotId)
  if (currentProjectId === null || currentProjectId === undefined || !shotId) return
  try {
    const result = await window.electronAPI.shots.update(currentProjectId, shotId, readShotCard(card))
    if (!result.success) throw new Error(result.error || '保存拍摄项失败')
    const index = shotListItems.findIndex(shot => shot.id === shotId)
    if (index >= 0 && result.shot) shotListItems[index] = result.shot
    renderShotList()
    showToast('拍摄项已保存', 'success')
  } catch (error) {
    showToast(`保存拍摄项失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function removeShotCard(card) {
  const shotId = Number(card.dataset.shotId)
  if (currentProjectId === null || currentProjectId === undefined || !shotId) return
  try {
    const result = await window.electronAPI.shots.remove(currentProjectId, shotId)
    if (!result.success) throw new Error(result.error || '移除拍摄项失败')
    await loadShotList(currentProjectId)
    showToast('拍摄项已移除', 'success')
  } catch (error) {
    showToast(`移除拍摄项失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function reorderShotList(draggedId, targetId) {
  const ids = shotListItems.map(shot => shot.id)
  const from = ids.indexOf(draggedId)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return
  ids.splice(from, 1)
  ids.splice(to, 0, draggedId)
  try {
    const result = await window.electronAPI.shots.reorder(currentProjectId, ids)
    if (!result.success) throw new Error(result.error || '保存拍摄顺序失败')
    shotListItems = result.shots || shotListItems
    renderShotList()
    showToast('拍摄清单顺序已更新', 'success')
  } catch (error) {
    showToast(`保存拍摄顺序失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
  }
}

async function openShotListWorkspace() {
  if (currentProjectId === null || selectionTrayItems.length === 0) {
    showToast('请先在灵感板中加入参考样片', 'warning')
    return
  }
  await loadShotList(currentProjectId)
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.getElementById('cullingWorkspace')?.classList.add('hidden')
  document.getElementById('compareWorkspace')?.classList.add('hidden')
  document.getElementById('deliveryWorkspace')?.classList.add('hidden')
  document.querySelector('.filter-bar')?.classList.add('hidden')
  document.getElementById('shotListWorkspace')?.classList.remove('hidden')
  document.getElementById('statusView')?.replaceChildren(document.createTextNode('拍摄清单'))
  currentPanel = 'shotList'
}

async function closeShotListWorkspace() {
  document.getElementById('shotListWorkspace')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  document.querySelector('.filter-bar')?.classList.remove('hidden')
  currentPanel = 'gallery'
  if (window.electronAPI && typeof loadPhotos === 'function') await loadPhotos(true)
}

function bindShotListEvents() {
  PicEvents?.on('project:selected', project => { void loadShotList(project.id) })
  document.getElementById('generateShotListBtn')?.addEventListener('click', () => { void generateShotList() })
  document.getElementById('shotListExitBtn')?.addEventListener('click', () => { void closeShotListWorkspace() })
  document.getElementById('shotListItems')?.addEventListener('click', event => {
    const target = event.target
    const card = target.closest('.shot-list-card')
    if (!card) return
    if (target.closest('.shot-save-btn')) void saveShotCard(card)
    if (target.closest('.shot-remove-btn')) void removeShotCard(card)
  })
}

bindShotListEvents()