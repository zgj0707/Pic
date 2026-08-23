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
    item.innerHTML = `
      <span class="project-name">${escapeHtml(project.name)}</span>
      <span class="photo-count">${project.photo_count || 0}</span>
    `;
    item.addEventListener('click', () => selectProject(project.id));
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
  document.getElementById('ratingFilter').value = '';
  document.getElementById('tagFilter').value = '';
  photoFilterState = { search: '', rating: '', tag: '' };
  activeSmartFilters.clear();
  updateFilterChipUI();
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

function bindProjectEvents() {
  document.getElementById('createProjectBtn')?.addEventListener('click', createNewProject);
  document.getElementById('projectInputCancel')?.addEventListener('click', closeProjectInputModal);
  document.getElementById('projectInputConfirm')?.addEventListener('click', confirmCreateProject);
  document.getElementById('projectInputField')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') confirmCreateProject();
    if (event.key === 'Escape') closeProjectInputModal();
  });
  document.getElementById('projectInputModal')?.addEventListener('click', event => {
    if (event.target.id === 'projectInputModal') closeProjectInputModal();
  });
}

bindProjectEvents();
