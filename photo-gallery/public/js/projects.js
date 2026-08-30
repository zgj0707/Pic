// Project loading, selection, and creation.
// This module intentionally keeps the existing renderer globals until later phases
// can migrate consumers to PicState one workflow at a time.
async function loadProjects(preferredProjectId = null) {
  if (!window.electronAPI?.projects?.getAll) return;
  try {
    projects = await window.electronAPI.projects.getAll();
    renderProjectSidebar();

    const savedProjectId = localStorage.getItem('currentProjectId');
    const savedId = savedProjectId ? parseInt(savedProjectId, 10) : null;
    const targetProject = projects.find(project => project.id === preferredProjectId)
      || projects.find(project => project.id === savedId);
    if (targetProject) {
      await selectProject(targetProject.id);
    } else if (projects.length > 0 && currentProjectId === null) {
      await selectProject(projects[0].id);
    }
  } catch (e) {
    console.error('加载项目失败:', e);
  }
}

function renderProjectSidebar() {
  const list = document.getElementById('projectList');
  if (!list) return;
  list.innerHTML = '';

  projects.forEach(project => {
    const item = document.createElement('div');
    item.className = `project-item ${project.id === currentProjectId ? 'active' : ''}`;
    item.dataset.projectId = project.id;
    item.tabIndex = 0;
    item.setAttribute('aria-label', `${project.name}，${project.photo_count || 0} 张照片，右键打开项目菜单`);
    item.title = '右键：复制或删除项目';
    item.innerHTML = `
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span class="project-item-meta">
        <span class="photo-count">${project.photo_count || 0}</span>
        <i class="fa-solid fa-ellipsis project-item-menu-hint" aria-hidden="true"></i>
      </span>
    `;
    item.addEventListener('click', () => {
      hideProjectContextMenu();
      void selectProject(project.id);
    });
    item.addEventListener('contextmenu', event => openProjectContextMenu(event, project));
    item.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const rect = item.getBoundingClientRect();
        openProjectContextMenu(event, project, rect.right - 8, rect.top + 12);
      }
    });
    list.appendChild(item);
  });
}

async function selectProject(projectId) {
  if (currentProjectId === projectId && !isRecycleBinView) return;

  const project = projects.find(candidate => candidate.id === projectId);
  if (!project) return;

  currentProjectId = projectId;
  currentProjectName = project.name;
  PicState.currentProjectId = projectId;
  void window.electronAPI?.capture?.setTargetProject?.(projectId);
  localStorage.setItem('currentProjectId', String(projectId));

  isRecycleBinView = false;
  currentPanel = 'gallery';
  selectedPhotos.clear();
  updateSelectedCount();
  updateContextPanel();
  renderProjectSidebar();
  updateStatusBar();
  updateToolbarForGallery();

  document.getElementById('searchInput').value = '';
  photoFilterState = { search: '' };
  PicEvents.emit('project:selected', project);

  await loadPhotos(true);
}

function openProjectInputModal() {
  const modal = document.getElementById('projectInputModal');
  const input = document.getElementById('projectInputField');
  const descInput = document.getElementById('projectDescField');
  if (!modal || !input) return;
  input.value = '';
  if (descInput) descInput.value = '';
  modal.classList.remove('hidden');
  input.focus();
}

function closeProjectInputModal() {
  const modal = document.getElementById('projectInputModal');
  if (modal) modal.classList.add('hidden');
}

async function confirmCreateProject() {
  const input = document.getElementById('projectInputField');
  const descInput = document.getElementById('projectDescField');
  const confirmBtn = document.getElementById('projectInputConfirm');
  const name = input?.value.trim() || '';
  const description = descInput?.value.trim() || '';

  if (!name) {
    showToast('请输入项目名称', 'error');
    input?.focus();
    return;
  }
  if (!window.electronAPI?.projects?.create) {
    showToast('项目功能当前不可用，请重启应用后重试', 'error');
    return;
  }

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  try {
    const result = await window.electronAPI.projects.create(name, description);
    if (result?.success && result.id != null) {
      closeProjectInputModal();
      await loadProjects(result.id);
      showToast('项目创建成功', 'success');
    } else {
      showToast('项目创建失败: ' + (result?.error || '未返回项目编号'), 'error');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    showToast('项目创建失败: ' + message, 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

function createNewProject() {
  openProjectInputModal();
}

let projectContextTargetId = null;

function hideProjectContextMenu() {
  const menu = document.getElementById('projectContextMenu');
  menu?.classList.add('hidden');
  projectContextTargetId = null;
}

function openProjectContextMenu(event, project, anchorX = event.clientX, anchorY = event.clientY) {
  event.preventDefault();
  event.stopPropagation();
  const menu = document.getElementById('projectContextMenu');
  if (!menu || !project) return;
  projectContextTargetId = project.id;
  document.getElementById('projectContextTitle')?.replaceChildren(document.createTextNode(project.name));
  menu.classList.remove('hidden');
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const padding = 8;
  const left = Math.max(padding, Math.min(anchorX, window.innerWidth - rect.width - padding));
  const top = Math.max(padding, Math.min(anchorY, window.innerHeight - rect.height - padding));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  document.getElementById('projectDuplicateBtn')?.focus();
}

async function duplicateContextProject() {
  const projectId = projectContextTargetId;
  const project = projects.find(candidate => candidate.id === projectId);
  hideProjectContextMenu();
  if (!project || !window.electronAPI?.projects?.duplicate) return;
  try {
    const result = await window.electronAPI.projects.duplicate(projectId);
    if (!result?.success || result.id == null) throw new Error(result?.error || '复制项目失败');
    await loadProjects(result.id);
    showToast(`已创建「${result.name || project.name + ' 副本'}」，拍摄简报已复制，照片原文件未重复占用空间`, 'success');
  } catch (error) {
    showToast(`复制项目失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

async function deleteContextProject() {
  const projectId = projectContextTargetId;
  const project = projects.find(candidate => candidate.id === projectId);
  hideProjectContextMenu();
  if (!project || !window.electronAPI?.projects?.delete) return;
  const photoCount = Number(project.photo_count || 0);
  const detail = photoCount > 0
    ? `项目内 ${photoCount} 张照片及相关记录将转移到其他项目，原图文件不会被删除。`
    : '这个项目没有照片。';
  const confirmed = confirm(`确定删除项目「${project.name}」吗？\n\n${detail}\n项目本身和拍摄简报将被删除，此操作不可撤销。`);
  if (!confirmed) return;

  try {
    const result = await window.electronAPI.projects.delete(projectId);
    if (!result?.success) throw new Error(result?.error || '删除项目失败');
    currentProjectId = null;
    currentProjectName = '';
    void window.electronAPI?.capture?.setTargetProject?.(null);
    localStorage.removeItem('currentProjectId');
    await loadProjects(result.targetProjectId ?? null);
    const moved = Number(result.movedPhotos || 0);
    const suffix = moved > 0
      ? `，${moved} 张照片已转移到「${result.targetProjectName || '其他项目'}」`
      : '';
    showToast(`已删除项目「${project.name}」${suffix}`, 'success');
  } catch (error) {
    showToast(`删除项目失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function bindProjectEvents() {
  document.getElementById('createProjectBtn')?.addEventListener('click', createNewProject);
  document.getElementById('emptyCreateProjectBtn')?.addEventListener('click', createNewProject);
  document.getElementById('projectInputCancel')?.addEventListener('click', closeProjectInputModal);
  document.getElementById('projectInputConfirm')?.addEventListener('click', confirmCreateProject);
  document.getElementById('projectInputField')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') confirmCreateProject();
    if (event.key === 'Escape') closeProjectInputModal();
  });
  document.getElementById('projectInputModal')?.addEventListener('click', event => {
    if (event.target.id === 'projectInputModal') closeProjectInputModal();
  });
  document.getElementById('projectDuplicateBtn')?.addEventListener('click', () => { void duplicateContextProject(); });
  document.getElementById('projectDeleteBtn')?.addEventListener('click', () => { void deleteContextProject(); });
  document.getElementById('projectContextMenu')?.addEventListener('click', event => event.stopPropagation());
  document.getElementById('projectList')?.addEventListener('scroll', hideProjectContextMenu);
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#projectContextMenu')) hideProjectContextMenu();
  });
  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.project-item')) hideProjectContextMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('projectContextMenu')?.classList.contains('hidden')) {
      event.preventDefault();
      hideProjectContextMenu();
    }
  });
  window.addEventListener('blur', hideProjectContextMenu);
}

bindProjectEvents();
