// Pic 4.1 workspace enhancements.
const APP_UNDO_LIMIT = 30
const appUndoStack = []
let appUndoBusy = false
let browserCollectedPhotos = []
let browserCollectedReferences = []
let browserCollectionProjectId = null
let projectBriefDraftCoverPhotoId = null
function updateGlobalUndoButton() {
  const button = document.getElementById('globalUndoBtn')
  const label = document.getElementById('globalUndoLabel')
  const action = appUndoStack[appUndoStack.length - 1]
  if (button) button.disabled = !action || appUndoBusy
  if (label) label.textContent = action ? `撤销：${action.label}` : '没有可撤销操作'
}

function pushAppUndo(label, undo) {
  if (!label || typeof undo !== 'function') return
  appUndoStack.push({ label, undo })
  if (appUndoStack.length > APP_UNDO_LIMIT) appUndoStack.shift()
  updateGlobalUndoButton()
}

async function performAppUndo() {
  if (appUndoBusy || appUndoStack.length === 0) return
  const action = appUndoStack.pop()
  appUndoBusy = true
  updateGlobalUndoButton()
  try {
    await action.undo()
    showToast(`已撤销：${action.label}`, 'success')
  } catch (error) {
    appUndoStack.push(action)
    showToast(`撤销失败：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    appUndoBusy = false
    updateGlobalUndoButton()
  }
}

async function restoreDeletedPhotoIds(ids) {
  if (window.electronAPI?.photos?.restore) await window.electronAPI.photos.restore(ids)
  await loadPhotos(true)
}

function clearPhotoSelection() {
  selectedPhotos.clear()
  document.querySelectorAll('.photo-item.selected').forEach(item => item.classList.remove('selected'))
  updateSelectedCount()
}

function updateSelectionActionBar() {
  const bar = document.getElementById('selectionActionBar')
  if (!bar) return
  const count = selectedPhotos.size
  const visibleWorkspace = currentPanel === 'gallery' || isRecycleBinView
  bar.classList.toggle('hidden', count === 0 || !visibleWorkspace)
  document.getElementById('selectionActionCount')?.replaceChildren(document.createTextNode(`已选 ${count} 张`))
  const addToShotList = document.getElementById('addToShotListBtn')
  if (addToShotList) addToShotList.disabled = count === 0 || currentProjectId === null || isRecycleBinView
  const coverButton = document.getElementById('selectionActionCoverBtn')
  if (coverButton) coverButton.disabled = count !== 1 || currentProjectId === null || isRecycleBinView
  if (!document.getElementById('projectBriefEditor')?.classList.contains('hidden')) renderBriefCoverPicker()
}

function currentProjectRecord() {
  return projects.find(project => project.id === currentProjectId) || null
}

function localImageUrl(path) {
  if (!path) return ''
  if (/^(data:|https?:|file:)/i.test(path)) return path
  return /^[a-zA-Z]:[\\/]/.test(path) ? 'file:///' + path.replace(/\\/g, '/') : path
}

function renderProjectBrief(project = currentProjectRecord()) {
  const edit = document.getElementById('projectBriefEditBtn')
  if (edit) edit.disabled = !project
  const cover = document.getElementById('projectCoverButton')
  if (!project) {
    if (cover) {
      cover.classList.remove('has-cover')
      cover.style.backgroundImage = ''
    }
    return
  }
  const setText = (id, value) => document.getElementById(id)?.replaceChildren(document.createTextNode(value))
  setText('currentProjectDescription', project.description || '未添加项目说明')
  setText('currentProjectClient', project.client_name || '未填写客户')
  setText('currentProjectDate', project.shoot_date || '尚未设置拍摄日期')
  setText('currentProjectLocation', project.location || '未填写场地')
  setText('currentProjectOwner', project.owner || '未填写负责人')
  setText('currentProjectGoal', project.deliverable_goal || '尚未填写交付目标')
  const coverPath = project.cover_thumbnail_path || project.cover_filepath || ''
  if (cover) {
    cover.classList.toggle('has-cover', Boolean(coverPath))
    cover.style.backgroundImage = coverPath ? `linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.08)), url("${localImageUrl(coverPath).replace(/"/g, '%22')}")` : ''
  }
}

function fillProjectBriefEditor() {
  const project = currentProjectRecord()
  if (!project) return false
  document.getElementById('briefNameInput').value = project.name || ''
  document.getElementById('briefClientInput').value = project.client_name || ''
  document.getElementById('briefShootDateInput').value = project.shoot_date || ''
  document.getElementById('briefLocationInput').value = project.location || ''
  document.getElementById('briefOwnerInput').value = project.owner || ''
  document.getElementById('briefDescriptionInput').value = project.description || ''
  document.getElementById('briefGoalInput').value = project.deliverable_goal || ''
  projectBriefDraftCoverPhotoId = project.cover_photo_id ?? null
  return true
}

function briefCoverCandidates() {
  const project = currentProjectRecord()
  const prioritizedIds = [projectBriefDraftCoverPhotoId, ...Array.from(selectedPhotos)]
    .filter(id => Number.isInteger(Number(id)))
    .map(Number)
  const ordered = [
    ...prioritizedIds.map(id => photos.find(photo => photo.id === id)).filter(Boolean),
    ...photos.filter(photo => !photo.deleted_at)
  ]
  const seen = new Set()
  const candidates = ordered.filter(photo => {
    if (!photo || seen.has(photo.id)) return false
    seen.add(photo.id)
    return true
  }).slice(0, 30)
  if (projectBriefDraftCoverPhotoId && !seen.has(Number(projectBriefDraftCoverPhotoId))) {
    const coverPath = project?.cover_thumbnail_path || project?.cover_filepath
    if (coverPath) {
      candidates.unshift({
        id: Number(projectBriefDraftCoverPhotoId),
        filename: '当前项目封面',
        thumbnail_path: coverPath,
        filepath: coverPath
      })
    }
  }
  return candidates
}

function setBriefDraftCover(photoId) {
  const normalizedId = Number(photoId)
  if (!Number.isInteger(normalizedId) || !photos.some(photo => photo.id === normalizedId && !photo.deleted_at)) {
    showToast('这张样片不可用，请重新选择', 'warning')
    return
  }
  projectBriefDraftCoverPhotoId = normalizedId
  renderBriefCoverPicker()
}

function renderBriefCoverPicker() {
  const choices = document.getElementById('briefCoverChoices')
  const status = document.getElementById('briefCoverStatus')
  const useSelected = document.getElementById('briefUseSelectedCoverBtn')
  if (!choices || !status || !useSelected) return
  const selectedId = selectedPhotos.size === 1 ? Number(Array.from(selectedPhotos)[0]) : null
  const selectedAvailable = selectedId !== null && photos.some(photo => photo.id === selectedId && !photo.deleted_at)
  useSelected.disabled = !selectedAvailable
  const candidates = briefCoverCandidates()
  const current = candidates.find(photo => photo.id === Number(projectBriefDraftCoverPhotoId))
  status.textContent = current
    ? `保存后使用「${current.filename || '未命名样片'}」`
    : '保存后不使用项目封面'
  if (candidates.length === 0) {
    choices.innerHTML = '<span class="brief-cover-empty">当前项目还没有可用样片，请先导入照片</span>'
    return
  }
  choices.innerHTML = candidates.map(photo => {
    const path = localImageUrl(photo.thumbnail_path || photo.filepath || '')
    const selected = photo.id === Number(projectBriefDraftCoverPhotoId)
    return `
      <button class="brief-cover-choice${selected ? ' is-selected' : ''}" type="button"
        data-cover-photo-id="${photo.id}" role="option" aria-selected="${selected}"
        title="设为封面：${escapeHtml(photo.filename || '未命名样片')}">
        <img src="${escapeHtml(path)}" alt="${escapeHtml(photo.filename || '')}">
      </button>
    `
  }).join('')
  choices.querySelectorAll('[data-cover-photo-id]').forEach(button => {
    button.addEventListener('click', () => setBriefDraftCover(Number(button.dataset.coverPhotoId)))
  })
}

function openProjectBriefEditor() {
  if (!fillProjectBriefEditor()) return
  document.getElementById('projectBriefEditor')?.classList.remove('hidden')
  document.querySelector('.project-titlebar')?.classList.add('is-editing')
  renderBriefCoverPicker()
  document.getElementById('briefNameInput')?.focus()
}

function closeProjectBriefEditor() {
  document.getElementById('projectBriefEditor')?.classList.add('hidden')
  document.querySelector('.project-titlebar')?.classList.remove('is-editing')
  projectBriefDraftCoverPhotoId = null
}

function readProjectBriefForm() {
  return {
    name: document.getElementById('briefNameInput')?.value.trim() || '',
    clientName: document.getElementById('briefClientInput')?.value.trim() || null,
    shootDate: document.getElementById('briefShootDateInput')?.value || null,
    location: document.getElementById('briefLocationInput')?.value.trim() || null,
    owner: document.getElementById('briefOwnerInput')?.value.trim() || null,
    description: document.getElementById('briefDescriptionInput')?.value.trim() || null,
    deliverableGoal: document.getElementById('briefGoalInput')?.value.trim() || null,
    coverPhotoId: projectBriefDraftCoverPhotoId
  }
}

async function refreshProjectAfterBriefSave(projectId) {
  if (window.electronAPI?.projects?.getAll) {
    projects = await window.electronAPI.projects.getAll()
    renderProjectSidebar()
  }
  const project = projects.find(item => item.id === projectId)
  if (project) {
    currentProjectName = project.name
    updateStatusBar()
    renderProjectBrief(project)
  }
}

async function saveProjectBriefPayload(input, options = {}) {
  if (currentProjectId === null || !input.name) {
    showToast('项目名称不能为空', 'warning')
    return false
  }
  const projectId = currentProjectId
  const previous = currentProjectRecord() ? { ...currentProjectRecord() } : null
  try {
    let result
    if (window.electronAPI?.projects?.updateBrief) {
      result = await window.electronAPI.projects.updateBrief(projectId, input)
    } else {
      result = { success: true }
      Object.assign(currentProjectRecord() || {}, {
        name: input.name, description: input.description, client_name: input.clientName,
        shoot_date: input.shootDate, location: input.location, owner: input.owner,
        deliverable_goal: input.deliverableGoal, cover_photo_id: input.coverPhotoId
      })
    }
    if (!result?.success) throw new Error(result?.error || '保存失败')
    await refreshProjectAfterBriefSave(projectId)
    if (!options.skipUndo && previous) {
      pushAppUndo('修改拍摄简报', async () => {
        await saveProjectBriefPayload({
          name: previous.name, description: previous.description, clientName: previous.client_name,
          shootDate: previous.shoot_date, location: previous.location, owner: previous.owner,
          deliverableGoal: previous.deliverable_goal, coverPhotoId: previous.cover_photo_id
        }, { skipUndo: true })
      })
    }
    if (!options.silent) showToast('拍摄简报已保存', 'success')
    return true
  } catch (error) {
    showToast(`保存拍摄简报失败：${error instanceof Error ? error.message : String(error)}`, 'error')
    return false
  }
}

async function saveProjectBrief(event) {
  event?.preventDefault()
  const button = document.getElementById('briefSaveBtn')
  if (button) {
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
  }
  try {
    const success = await saveProjectBriefPayload(readProjectBriefForm())
    if (success) closeProjectBriefEditor()
  } finally {
    if (button) {
      button.disabled = false
      button.removeAttribute('aria-busy')
    }
  }
}

async function setSelectedAsProjectCover() {
  if (selectedPhotos.size !== 1) {
    showToast('请选择 1 张样片作为项目封面', 'warning')
    return
  }
  const project = currentProjectRecord()
  if (!project) return
  await saveProjectBriefPayload({
    name: project.name, description: project.description, clientName: project.client_name,
    shootDate: project.shoot_date, location: project.location, owner: project.owner,
    deliverableGoal: project.deliverable_goal, coverPhotoId: Array.from(selectedPhotos)[0]
  })
}

function resetBrowserCollection(projectId = currentProjectId) {
  browserCollectionProjectId = projectId
  browserCollectedPhotos = []
  browserCollectedReferences = []
  renderBrowserCollection()
  if (projectId !== null && window.electronAPI?.projectReferences?.getAll) {
    void window.electronAPI.projectReferences.getAll(projectId).then(references => {
      if (browserCollectionProjectId !== projectId) return
      browserCollectedReferences = Array.isArray(references) ? references.slice(0, 10) : []
      renderBrowserCollection()
    }).catch(error => console.warn('读取远程参考失败:', error))
  }
}

function recordBrowserCollection(result, fallback = {}) {
  if (browserCollectionProjectId !== currentProjectId) resetBrowserCollection(currentProjectId)
  const data = result?.data || result || {}
  const photoId = Number(data.photoId || data.photo?.id)
  if (!photoId) return
  const photo = data.photo || photos.find(item => item.id === photoId) || {
    id: photoId, filename: fallback.fileName || '网页样片',
    filepath: fallback.filePath || '', thumbnail_path: fallback.filePath || '', source_url: fallback.sourceUrl || ''
  }
  const existingIndex = browserCollectedPhotos.findIndex(item => item.id === photoId)
  if (existingIndex >= 0) browserCollectedPhotos.splice(existingIndex, 1)
  browserCollectedPhotos.unshift(photo)
  browserCollectedPhotos = browserCollectedPhotos.slice(0, 10)
  renderBrowserCollection()
}

function recordBrowserReference(reference) {
  if (!reference) return
  if (browserCollectionProjectId !== currentProjectId) resetBrowserCollection(currentProjectId)
  const existingIndex = browserCollectedReferences.findIndex(item => item.id === reference.id)
  if (existingIndex >= 0) browserCollectedReferences.splice(existingIndex, 1)
  browserCollectedReferences.unshift(reference)
  browserCollectedReferences = browserCollectedReferences.slice(0, 10)
  renderBrowserCollection()
}

function renderBrowserCollection() {
  const count = browserCollectedPhotos.length + browserCollectedReferences.length
  const text = document.getElementById('browserCollectionText')
  const items = document.getElementById('browserCollectionItems')
  const open = document.getElementById('browserOpenCollectedBtn')
  if (text) text.textContent = count > 0 ? `已保存到「${currentProjectName}」：${count} 项` : '还没有保存样片'
  if (open) open.disabled = count === 0
  if (items) {
    const photoItems = browserCollectedPhotos.map((photo, index) => `
      <button class="browser-collection-thumb" type="button" data-photo-id="${photo.id}" title="${escapeHtml(photo.filename || '网页样片')}">
        <img src="${escapeHtml(photo.thumbnail_path || photo.filepath || '')}" alt="">
        <span>${String(index + 1).padStart(2, '0')}</span>
      </button>
    `).join('')
    const referenceItems = browserCollectedReferences.map(reference => `
      <button class="browser-collection-reference" type="button" data-reference-url="${escapeHtml(reference.original_url)}" title="${escapeHtml(reference.title || '远程参考')}">
        <i class="fa-solid fa-link" aria-hidden="true"></i>
        <span>${escapeHtml(reference.title || '远程参考')}</span>
      </button>
    `).join('')
    items.innerHTML = photoItems + referenceItems
  }
  if (typeof updateDesktopSaveButton === 'function') updateDesktopSaveButton()
}

function openCollectedPhotosInGallery() {
  const ids = browserCollectedPhotos.map(photo => photo.id)
  if (ids.length === 0) return
  closeMaterialBrowserPanel()
  switchToGallery()
  selectedPhotos.clear()
  ids.forEach(id => selectedPhotos.add(id))
  renderPhotoGrid(true)
  updateSelectedCount()
}

function bindEnhancementEvents() {
  document.getElementById('globalUndoBtn')?.addEventListener('click', () => { void performAppUndo() })
  document.getElementById('headerMoreBtn')?.addEventListener('click', event => {
    event.stopPropagation()
    const menu = document.getElementById('headerOverflowMenu')
    const open = menu?.classList.toggle('hidden') === false
    document.getElementById('headerMoreBtn')?.setAttribute('aria-expanded', String(open))
  })
  document.getElementById('headerOverflowMenu')?.addEventListener('click', () => {
    document.getElementById('headerOverflowMenu')?.classList.add('hidden')
    document.getElementById('headerMoreBtn')?.setAttribute('aria-expanded', 'false')
  })
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.header-overflow')) {
      document.getElementById('headerOverflowMenu')?.classList.add('hidden')
      document.getElementById('headerMoreBtn')?.setAttribute('aria-expanded', 'false')
    }
  })
  document.getElementById('selectionActionCoverBtn')?.addEventListener('click', () => { void setSelectedAsProjectCover() })
  document.getElementById('selectionActionCancelBtn')?.addEventListener('click', clearPhotoSelection)
  document.getElementById('projectBriefEditBtn')?.addEventListener('click', openProjectBriefEditor)
  const briefEditor = document.getElementById('projectBriefEditor')
  briefEditor?.addEventListener('submit', event => { void saveProjectBrief(event) })
  briefEditor?.addEventListener('pointerdown', event => event.stopPropagation())
  briefEditor?.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Escape') closeProjectBriefEditor()
  })
  document.getElementById('briefCancelBtn')?.addEventListener('click', closeProjectBriefEditor)
  document.getElementById('briefUseSelectedCoverBtn')?.addEventListener('click', () => {
    if (selectedPhotos.size === 1) setBriefDraftCover(Array.from(selectedPhotos)[0])
  })
  document.getElementById('briefClearCoverBtn')?.addEventListener('click', () => {
    projectBriefDraftCoverPhotoId = null
    renderBriefCoverPicker()
  })
  document.getElementById('projectCoverButton')?.addEventListener('click', () => {
    if (selectedPhotos.size === 1) void setSelectedAsProjectCover()
    else openProjectBriefEditor()
  })
  document.getElementById('browserOpenCollectedBtn')?.addEventListener('click', openCollectedPhotosInGallery)
  document.getElementById('browserCollectionItems')?.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null
    const photoButton = target?.closest('[data-photo-id]')
    if (photoButton) {
      const id = Number(photoButton.dataset.photoId)
      const photo = photos.find(item => item.id === id) || browserCollectedPhotos.find(item => item.id === id)
      if (photo && typeof openLightbox === 'function') openLightbox(photo, 0)
      return
    }
    const referenceButton = target?.closest('[data-reference-url]')
    const url = referenceButton?.getAttribute('data-reference-url')
    if (url) void window.electronAPI?.materialBrowser?.openExternal(url)
  })
  document.addEventListener('keydown', event => {
    const editingTarget = event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editingTarget) {
      event.preventDefault()
      void performAppUndo()
    }
  })
  PicEvents?.on('project:selected', project => {
    renderProjectBrief(project)
    resetBrowserCollection(project.id)
    closeProjectBriefEditor()
  })
  PicEvents?.on('workspace:changed', () => updateSelectionActionBar())
  updateGlobalUndoButton()
  updateSelectionActionBar()
  renderBrowserCollection()
}

bindEnhancementEvents()
