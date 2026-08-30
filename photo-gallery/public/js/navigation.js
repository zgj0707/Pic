// Workspace and auxiliary-page navigation.
// navigation.js is loaded before ui.js in index.html, so keep the material
// browser base URL next to the code that uses it. Defining it in ui.js caused
// a top-level ReferenceError during startup and prevented loadProjects() from
// ever running.
const XHS_URL = 'https://www.xiaohongshu.com';

function navigateToWorkspace(workspace) {
  switch (workspace) {
    case 'gallery':
      return switchToGallery();
    case 'recycle':
      return switchToRecycleBin();
    case 'browser':
      return openMaterialBrowserPanel();
    case 'planning':
      return openPlanningPanel();
    case 'settings':
      currentPanel = 'settings';
      document.getElementById('settingsBtn')?.click();
      return;
    default:
      console.warn('Unknown workspace:', workspace);
  }
}

function getSavedXiaohongshuUrl() {
  const savedUrl = browserSourceUrls?.xiaohongshu;
  return isAllowedMaterialSourceUrl('xiaohongshu', savedUrl) ? savedUrl : XHS_URL;
}

let materialBrowserViewState = {
  url: XHS_URL,
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  error: ''
};

function materialBrowserViewApi() {
  return window.electronAPI?.materialBrowser;
}

function applyMaterialBrowserViewState(state) {
  if (!state || typeof state !== 'object') return;
  materialBrowserViewState = { ...materialBrowserViewState, ...state };
  const urlInput = document.getElementById('browserUrl');
  if (urlInput && materialBrowserViewState.url) urlInput.value = materialBrowserViewState.url;
  if (isAllowedMaterialSourceUrl('xiaohongshu', materialBrowserViewState.url) && typeof rememberBrowserSourceUrl === 'function') {
    rememberBrowserSourceUrl('xiaohongshu', materialBrowserViewState.url);
  }
  const back = document.getElementById('browserBack');
  const forward = document.getElementById('browserForward');
  if (back) back.disabled = !materialBrowserViewState.canGoBack;
  if (forward) forward.disabled = !materialBrowserViewState.canGoForward;
  if (materialBrowserViewState.error) showToast(`小红书页面加载失败：${materialBrowserViewState.error}`, 'warning');
}

function syncMaterialBrowserViewBounds() {
  const host = document.getElementById('materialWebview');
  const api = materialBrowserViewApi();
  if (!host || !api?.setBounds) return;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  void api.setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

function ensureEmbeddedWebviewLoaded() {
  const api = materialBrowserViewApi();
  if (!api?.navigate) return;
  const currentUrl = materialBrowserViewState.url || '';
  const targetUrl = getSavedXiaohongshuUrl();
  const isBaseUrl = currentUrl.replace(/\/+$/, '') === XHS_URL.replace(/\/+$/, '');
  if (currentUrl === targetUrl || (isBaseUrl && targetUrl.replace(/\/+$/, '') === XHS_URL.replace(/\/+$/, ''))) return;
  if (isAllowedMaterialSourceUrl('xiaohongshu', currentUrl) && !isBaseUrl) return;

  void api.navigate(targetUrl).then(result => {
    if (result?.state) applyMaterialBrowserViewState(result.state);
    if (!result?.success) showToast(result?.error || '无法打开小红书', 'warning');
  });
}

function initializeMaterialBrowserView() {
  const api = materialBrowserViewApi();
  if (!api) return;
  const unsubscribe = api.onViewState?.(applyMaterialBrowserViewState);
  window.addEventListener('beforeunload', () => unsubscribe?.(), { once: true });
  void api.viewState?.().then(applyMaterialBrowserViewState);
  ensureEmbeddedWebviewLoaded();
  window.addEventListener('resize', syncMaterialBrowserViewBounds);

  window.electronAPI?.materialBrowser?.onDownloadComplete?.(async data => {
    if (currentProjectId === null) {
      showToast('样片已下载，请先创建或选择拍摄方案后再导入', 'warning');
      return;
    }
    const sourceUrl = data.sourceUrl || materialBrowserViewState.url;
    const result = await window.electronAPI.materialBrowser.importToLibrary(data.filePath, sourceUrl, [], currentProjectId);
    if (result.success) {
      if (typeof recordBrowserCollection === 'function') {
        recordBrowserCollection(result, { fileName: data.fileName, filePath: data.filePath, sourceUrl });
      }
      await loadPhotos(true);
      showToast('网页样片已加入当前拍摄方案', 'success');
    } else {
      showToast('网页样片导入失败: ' + (result.error || '未知错误'), 'warning');
    }
  });
}
function openMaterialBrowserPanel() {
  if (typeof ensureCurrentProjectForImport === 'function' && !ensureCurrentProjectForImport()) return;
  const panel = document.getElementById('materialBrowserPanel');
  const projectContext = document.getElementById('browserProjectContext');
  if (projectContext) projectContext.textContent = currentProjectName ? '保存到：' + currentProjectName : '当前拍摄方案';
  if (panel) panel.classList.add('open');
  void materialBrowserViewApi()?.setVisible?.(true);
  syncMaterialBrowserViewBounds();
  window.setTimeout(syncMaterialBrowserViewBounds, 320);
  ensureEmbeddedWebviewLoaded();
  if (typeof updateBrowserModeUI === 'function') updateBrowserModeUI();
  if (typeof renderBrowserCollection === 'function') renderBrowserCollection();
  currentPanel = 'browser';
  updateStatusBar();
  PicEvents.emit('workspace:changed', 'browser');
}
function closeMaterialBrowserPanel() {
  const panel = document.getElementById('materialBrowserPanel');
  if (panel) panel.classList.remove('open');
  void materialBrowserViewApi()?.setVisible?.(false);
  updateStatusBar();
}

function returnToGallery() {
  closeMaterialBrowserPanel();
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.add('hidden');
  switchToGallery();
}

function resetToolbarForGallery() {
  document.getElementById('deleteBtn').classList.remove('hidden');
  document.getElementById('restoreBtn').classList.add('hidden');
  document.getElementById('permanentDeleteBtn').classList.add('hidden');
  document.getElementById('importFolderBtn').classList.remove('hidden');
  document.getElementById('importFilesBtn').classList.remove('hidden');
  document.getElementById('searchInput').parentElement.classList.remove('hidden');
}

function setEmptyStateForGallery() {
  const title = document.getElementById('emptyStateTitle');
  const subtitle = document.getElementById('emptyStateSubtitle');
  const createButton = document.getElementById('emptyCreateProjectBtn');
  const importButton = document.getElementById('emptyImportFolderBtn2');
  const clearButton = document.getElementById('emptyClearFilterBtn');
  const hasFilter = Boolean(photoFilterState?.search);
  const noProject = currentProjectId === null;

  if (noProject) {
    if (title) title.textContent = '还没有拍摄方案';
    if (subtitle) subtitle.textContent = '创建一个拍摄方案开始搜集样片';
  } else if (hasFilter) {
    if (title) title.textContent = '没有符合条件的样片';
    if (subtitle) subtitle.textContent = '尝试清除筛选条件，或换一个关键词继续查找';
  } else {
    if (title) title.textContent = '方案里还没有样片';
    if (subtitle) subtitle.textContent = '导入文件夹或文件，开始搜集本次拍摄的样片';
  }

  createButton?.classList.toggle('hidden', !noProject);
  importButton?.classList.toggle('hidden', noProject || hasFilter);
  clearButton?.classList.toggle('hidden', !hasFilter);
}

function setEmptyStateForRecycleBin() {
  document.getElementById('emptyStateTitle').textContent = '回收站为空';
  document.getElementById('emptyStateSubtitle').textContent = '删除的样片会在这里保留 30 天';
  document.getElementById('emptyCreateProjectBtn')?.classList.add('hidden');
  document.getElementById('emptyImportFolderBtn2')?.classList.add('hidden');
  document.getElementById('emptyClearFilterBtn')?.classList.add('hidden');
}

function switchToGallery() {
  closeMaterialBrowserPanel();
  if (typeof closePlanningPanel === 'function') {
    document.getElementById('planningPanel')?.classList.add('hidden');
  }
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.add('hidden');
  isRecycleBinView = false;
  currentPanel = 'gallery';

  document.getElementById('galleryPanel')?.classList.remove('hidden');
  const searchWrap = document.getElementById('searchInput')?.parentElement;
  if (searchWrap) searchWrap.classList.remove('hidden');

  resetToolbarForGallery();
  setEmptyStateForGallery();
  updateStatusBar();
  updateSelectedCount();
  updateContextPanel();
  PicEvents.emit('workspace:changed', 'gallery');
  if (window.electronAPI) loadPhotos(true);
  else renderPhotoGrid();
}

function switchToRecycleBin() {
  isRecycleBinView = true;
  currentPanel = 'recycle';
  selectedPhotos.clear();
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) selectedCountEl.textContent = '已选择 0 张样片';
  const deleteBtn = document.getElementById('deleteBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
  const importFolderBtn = document.getElementById('importFolderBtn');
  const importFilesBtn = document.getElementById('importFilesBtn');
  if (deleteBtn) deleteBtn.classList.add('hidden');
  if (restoreBtn) {
    restoreBtn.classList.remove('hidden');
    restoreBtn.disabled = true;
  }
  if (permanentDeleteBtn) {
    permanentDeleteBtn.classList.remove('hidden');
    permanentDeleteBtn.disabled = true;
  }
  if (importFolderBtn) importFolderBtn.classList.add('hidden');
  if (importFilesBtn) importFilesBtn.classList.add('hidden');
  const searchWrap = document.getElementById('searchInput')?.parentElement;
  if (searchWrap) searchWrap.classList.add('hidden');
  setEmptyStateForRecycleBin();
  updateStatusBar();
  updateContextPanel();
  PicEvents.emit('workspace:changed', 'recycle');
  if (window.electronAPI) loadPhotos(true);
  else renderPhotoGrid();
}

function navigateBrowserToUrl() {
  const rawUrl = document.getElementById('browserUrl')?.value.trim();
  const api = materialBrowserViewApi();
  if (!rawUrl || !api?.navigate) return;
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (!isAllowedMaterialSourceUrl('xiaohongshu', parsed.toString())) {
      showToast('素材浏览器只允许打开小红书地址', 'warning');
      return;
    }
    void api.navigate(parsed.toString()).then(result => {
      if (result?.state) applyMaterialBrowserViewState(result.state);
      if (!result?.success) showToast(result?.error || '无法打开地址', 'warning');
    });
  } catch {
    // Invalid URL — keep the current page.
  }
}

function bindNavigationEvents() {
  document.getElementById('statusBrowserBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('materialBrowserPanel');
    if (panel?.classList.contains('open')) closeMaterialBrowserPanel();
    else navigateToWorkspace('browser');
  });
  document.getElementById('statusPlanningBtn')?.addEventListener('click', () => navigateToWorkspace('planning'));
  document.getElementById('statusRecycleBtn')?.addEventListener('click', () => navigateToWorkspace('recycle'));
  document.getElementById('statusSettingsBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('settingsModal');
    if (modal?.classList.contains('hidden')) navigateToWorkspace('settings');
    else document.getElementById('closeSettingsBtn')?.click();
  });
  document.getElementById('statusProject')?.addEventListener('click', () => {
    if (isRecycleBinView || currentPanel === 'planning') navigateToWorkspace('gallery');
  });
  document.getElementById('statusBackToGallery')?.addEventListener('click', returnToGallery);
  document.getElementById('backToGalleryFromBrowser')?.addEventListener('click', returnToGallery);
  document.getElementById('backToGalleryFromSettings')?.addEventListener('click', returnToGallery);
  document.getElementById('closeMaterialBrowserBtn')?.addEventListener('click', closeMaterialBrowserPanel);
  document.getElementById('browserBack')?.addEventListener('click', () => {
    void materialBrowserViewApi()?.back?.();
  });
  document.getElementById('browserForward')?.addEventListener('click', () => {
    void materialBrowserViewApi()?.forward?.();
  });
  document.getElementById('browserRefresh')?.addEventListener('click', () => {
    void materialBrowserViewApi()?.reload?.();
  });
  document.getElementById('browserGo')?.addEventListener('click', navigateBrowserToUrl);
  document.getElementById('browserUrl')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') navigateBrowserToUrl();
  });
  document.getElementById('openDouyinBtn')?.addEventListener('click', () => { void openDouyinExternal(); });
}

bindNavigationEvents();
