// Workspace and auxiliary-page navigation.
// Legacy function names remain available for existing callers during the split.
function setActiveWorkflowStage(stage) {
  const stages = {
    gallery: document.getElementById('galleryModeBtn'),
    culling: document.getElementById('cullingModeBtn'),
  }
  Object.entries(stages).forEach(([key, button]) => {
    const active = key === stage
    button?.classList.toggle('active', active)
    if (active) button?.setAttribute('aria-current', 'step')
    else button?.removeAttribute('aria-current')
  })
}

function navigateToWorkspace(workspace) {
  switch (workspace) {
    case 'gallery':
      return switchToGallery();
    case 'recycle':
      return switchToRecycleBin();
    case 'browser':
      return openMaterialBrowserPanel();
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

function ensureEmbeddedWebviewLoaded() {
  const webview = document.getElementById('materialWebview');
  if (!webview || typeof webview.loadURL !== 'function') return;

  const currentUrl = webview.getURL?.() || '';
  if (isAllowedMaterialSourceUrl('xiaohongshu', currentUrl)) return;

  try {
    if (typeof webview.setUserAgent === 'function') webview.setUserAgent(XHS_USER_AGENT);
    webview.loadURL(getSavedXiaohongshuUrl());
  } catch (error) {
    console.error('[material-browser] Failed to load Xiaohongshu:', error);
  }
}

function initializeWebview() {
  const webview = document.getElementById('materialWebview');
  if (!webview) return;

  webview.addEventListener('did-attach', () => {
    if (typeof webview.setUserAgent === 'function') webview.setUserAgent(XHS_USER_AGENT);
    ensureEmbeddedWebviewLoaded();
  });
  webview.addEventListener('did-finish-load', () => {
    if (typeof webview.setUserAgent === 'function') {
      webview.setUserAgent(XHS_USER_AGENT);
    }
    if (typeof updateBrowserModeUI === 'function') updateBrowserModeUI();
  });
  webview.addEventListener('did-navigate', () => {
    const urlInput = document.getElementById('browserUrl');
    if (urlInput) urlInput.value = webview.getURL();
    if (typeof rememberBrowserSourceUrl === 'function') rememberBrowserSourceUrl('xiaohongshu', webview.getURL());
  });
  webview.addEventListener('did-navigate-in-page', () => {
    const urlInput = document.getElementById('browserUrl');
    if (urlInput) urlInput.value = webview.getURL();
    if (typeof rememberBrowserSourceUrl === 'function') rememberBrowserSourceUrl('xiaohongshu', webview.getURL());
  });

  if (typeof webview.setUserAgent === 'function') webview.setUserAgent(XHS_USER_AGENT);
  ensureEmbeddedWebviewLoaded();

  window.electronAPI?.materialBrowser?.onDownloadComplete?.(async data => {
    if (currentProjectId === null) {
      showToast('样片已下载，请先创建或选择项目后再导入', 'warning');
      return;
    }
    const sourceUrl = data.sourceUrl || webview.getURL();
    const result = await window.electronAPI.materialBrowser.importToLibrary(data.filePath, sourceUrl, [], currentProjectId);
    if (result.success) {
      if (typeof recordBrowserCollection === 'function') {
        recordBrowserCollection(result, { fileName: data.fileName, filePath: data.filePath, sourceUrl });
      }
      await loadPhotos(true);
      showToast('网页样片已加入当前项目', 'success');
    } else {
      showToast('网页样片导入失败: ' + (result.error || '未知错误'), 'warning');
    }
  });
}
function openMaterialBrowserPanel() {
  if (typeof ensureCurrentProjectForImport === 'function' && !ensureCurrentProjectForImport()) return;
  const panel = document.getElementById('materialBrowserPanel');
  const projectContext = document.getElementById('browserProjectContext');
  if (projectContext) projectContext.textContent = currentProjectName ? '保存到：' + currentProjectName : '当前项目';
  if (panel) panel.classList.add('open');
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
  clearEmbeddedWebview();
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
  document.getElementById('ratingFilter').parentElement.classList.remove('hidden');
}

function setEmptyStateForGallery() {
  const title = document.getElementById('emptyStateTitle');
  const subtitle = document.getElementById('emptyStateSubtitle');
  const createButton = document.getElementById('emptyCreateProjectBtn');
  const importButton = document.getElementById('emptyImportFolderBtn2');
  const clearButton = document.getElementById('emptyClearFilterBtn');
  const hasFilter = Boolean(
    photoFilterState?.search || photoFilterState?.rating || photoFilterState?.tag ||
    Array.from(activeSmartFilters).some(key => key !== 'all')
  );
  const noProject = currentProjectId === null;

  if (noProject) {
    if (title) title.textContent = '还没有项目';
    if (subtitle) subtitle.textContent = '创建一个项目开始收集和整理样片';
  } else if (hasFilter) {
    if (title) title.textContent = '没有符合条件的样片';
    if (subtitle) subtitle.textContent = '尝试清除筛选条件，或换一个关键词继续查找';
  } else {
    if (title) title.textContent = '项目里还没有样片';
    if (subtitle) subtitle.textContent = '导入文件夹或文件，开始建立当前项目的素材收件箱';
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
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.add('hidden');
  isRecycleBinView = false;
  if (typeof cullingMode !== 'undefined') cullingMode = false;
  currentPanel = 'gallery';

  document.getElementById('galleryPanel')?.classList.remove('hidden');
  document.getElementById('cullingWorkspace')?.classList.add('hidden');
  document.querySelector('.filter-bar')?.classList.remove('hidden');
  setActiveWorkflowStage('gallery');

  const searchWrap = document.getElementById('searchInput')?.parentElement;
  const ratingWrap = document.getElementById('ratingFilter')?.parentElement;
  if (searchWrap) searchWrap.classList.remove('hidden');
  if (ratingWrap) ratingWrap.classList.remove('hidden');

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
  const ratingWrap = document.getElementById('ratingFilter')?.parentElement;
  if (searchWrap) searchWrap.classList.add('hidden');
  if (ratingWrap) ratingWrap.classList.add('hidden');
  setEmptyStateForRecycleBin();
  updateStatusBar();
  updateContextPanel();
  PicEvents.emit('workspace:changed', 'recycle');
  if (window.electronAPI) loadPhotos(true);
  else renderPhotoGrid();
}

function navigateBrowserToUrl() {
  const rawUrl = document.getElementById('browserUrl')?.value.trim();
  const webview = document.getElementById('materialWebview');
  if (!rawUrl || !webview) return;
  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    webview.loadURL(parsed.toString());
  } catch {
    // Invalid URL — keep the current page.
  }
}

function bindNavigationEvents() {
  document.getElementById('galleryModeBtn')?.addEventListener('click', switchToGallery);
  document.getElementById('statusBrowserBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('materialBrowserPanel');
    if (panel?.classList.contains('open')) closeMaterialBrowserPanel();
    else navigateToWorkspace('browser');
  });
  document.getElementById('statusRecycleBtn')?.addEventListener('click', () => navigateToWorkspace('recycle'));
  document.getElementById('statusSettingsBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('settingsModal');
    if (modal?.classList.contains('hidden')) navigateToWorkspace('settings');
    else document.getElementById('closeSettingsBtn')?.click();
  });
  document.getElementById('statusProject')?.addEventListener('click', () => {
    if (isRecycleBinView) navigateToWorkspace('gallery');
  });
  document.getElementById('statusBackToGallery')?.addEventListener('click', returnToGallery);
  document.getElementById('backToGalleryFromBrowser')?.addEventListener('click', returnToGallery);
  document.getElementById('backToGalleryFromSettings')?.addEventListener('click', returnToGallery);
  document.getElementById('closeMaterialBrowserBtn')?.addEventListener('click', closeMaterialBrowserPanel);
  document.getElementById('browserBack')?.addEventListener('click', () => {
    const webview = document.getElementById('materialWebview');
    if (webview?.canGoBack) webview.goBack();
  });
  document.getElementById('browserForward')?.addEventListener('click', () => {
    const webview = document.getElementById('materialWebview');
    if (webview?.canGoForward) webview.goForward();
  });
  document.getElementById('browserRefresh')?.addEventListener('click', () => {
    document.getElementById('materialWebview')?.reload();
  });
  document.getElementById('browserGo')?.addEventListener('click', navigateBrowserToUrl);
  document.getElementById('browserUrl')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') navigateBrowserToUrl();
  });
  document.getElementById('openDouyinBtn')?.addEventListener('click', () => { void openDouyinExternal(); });
}

bindNavigationEvents();
