// UI 初始化与视图切换相关函数
// 与 app.js 共享全局状态变量

const XHS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHANGELOG_COLOR_MAP = {
  accent: 'text-accent',
  blue: 'text-blue-500',
  green: 'text-green-500',
  purple: 'text-purple-500',
  orange: 'text-orange-500',
  red: 'text-red-500'
};

function initializeWebview() {
  const webview = document.getElementById('materialWebview');
  if (webview) {
    webview.addEventListener('did-finish-load', () => {
      webview.setUserAgent(browserMode === 'xiaohongshu' ? XHS_USER_AGENT : NORMAL_USER_AGENT);
    });

    webview.addEventListener('did-navigate', () => {
      const urlInput = document.getElementById('browserUrl');
      if (urlInput) {
        urlInput.value = webview.getURL();
      }
    });
  }
}

function openMaterialBrowserPanel() {
  const panel = document.getElementById('materialBrowserPanel');
  if (panel) panel.classList.add('open');
  updateStatusBar();
}

function closeMaterialBrowserPanel() {
  const panel = document.getElementById('materialBrowserPanel');
  if (panel) panel.classList.remove('open');
  updateStatusBar();
}

function returnToGallery() {
  closeMaterialBrowserPanel();
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.add('hidden');

  if (isRecycleBinView) {
    switchToGallery();
  } else {
    currentPanel = 'gallery';
    updateStatusBar();
  }
}

function resetToolbarForGallery() {
  document.getElementById('deleteBtn').classList.remove('hidden');
  document.getElementById('restoreBtn').classList.add('hidden');
  document.getElementById('permanentDeleteBtn').classList.add('hidden');
  document.getElementById('importFolderBtn').classList.remove('hidden');
  document.getElementById('importFilesBtn').classList.remove('hidden');
  document.getElementById('searchInput').parentElement.classList.remove('hidden');
  document.getElementById('ratingFilter').parentElement.parentElement.classList.remove('hidden');
}

function setEmptyStateForGallery() {
  document.getElementById('emptyStateTitle').textContent = '还没有导入任何照片';
  document.getElementById('emptyStateSubtitle').textContent = '点击下方按钮开始导入您的样片';
  document.getElementById('emptyStateActions').classList.remove('hidden');
}

function setEmptyStateForRecycleBin() {
  document.getElementById('emptyStateTitle').textContent = '回收站为空';
  document.getElementById('emptyStateSubtitle').textContent = '删除的照片会在这里保留 30 天';
  document.getElementById('emptyStateActions').classList.add('hidden');
}

function switchToGallery() {
  closeMaterialBrowserPanel();
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.classList.add('hidden');
  isRecycleBinView = false;
  currentPanel = 'gallery';
  selectedPhotos.clear();
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) selectedCountEl.textContent = '已选择 0 张照片';
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const copyToDesktopBtn = document.getElementById('copyToDesktopBtn');
  if (exportPdfBtn) exportPdfBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;
  if (copyToDesktopBtn) copyToDesktopBtn.disabled = true;

  // 恢复回收站视图隐藏的控件
  const searchWrap = document.getElementById('searchInput')?.parentElement;
  const ratingWrap = document.getElementById('ratingFilter')?.parentElement;
  if (searchWrap) searchWrap.classList.remove('hidden');
  if (ratingWrap) ratingWrap.classList.remove('hidden');

  resetToolbarForGallery();
  setEmptyStateForGallery();
  updateStatusBar();
  updateContextPanel();
  if (window.electronAPI) loadPhotos(true);
  else renderPhotoGrid();
}

function switchToRecycleBin() {
  isRecycleBinView = true;
  currentPanel = 'recycle';
  selectedPhotos.clear();
  const selectedCountEl = document.getElementById('selectedCount');
  if (selectedCountEl) selectedCountEl.textContent = '已选择 0 张照片';
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
  if (window.electronAPI) loadPhotos(true);
  else renderPhotoGrid();
}

function updateBrowserModeUI() {
  const btn = document.getElementById('browserModeToggle');
  const icon = document.getElementById('browserModeIcon');
  if (browserMode === 'xiaohongshu') {
    btn.title = '当前: 小红书模式 - 点击切换普通浏览器';
    btn.classList.remove('text-accent');
    btn.classList.add('text-textSecondary');
    icon.className = 'fa-solid fa-heart';
  } else {
    btn.title = '当前: 普通浏览器模式 - 点击切换小红书';
    btn.classList.remove('text-textSecondary');
    btn.classList.add('text-accent');
    icon.className = 'fa-solid fa-globe';
  }
}

function setBrowserMode(mode) {
  browserMode = mode;
  localStorage.setItem('browserMode', mode);

  const webview = document.getElementById('materialWebview');
  if (webview) {
    const currentUrl = webview.getURL();
    webview.setUserAgent(mode === 'xiaohongshu' ? XHS_USER_AGENT : NORMAL_USER_AGENT);
    webview.loadURL(currentUrl);
  }

  updateBrowserModeUI();
  showToast(mode === 'xiaohongshu' ? '已切换到小红书模式' : '已切换到普通浏览器模式', 'success');
}

function updateViewToggleButton() {
  const btn = document.getElementById('viewToggleBtn');
  const icon = document.getElementById('viewToggleIcon');

  if (currentViewMode === 'compact') {
    btn.title = '切换到瀑布流';
    icon.className = 'fa-solid fa-th';
  } else {
    btn.title = '切换到紧凑视图';
    icon.className = 'fa-solid fa-th-large';
  }
}

function setViewMode(mode) {
  currentViewMode = mode;
  localStorage.setItem('photoViewMode', mode);

  if (mode === 'compact') {
    isVirtualScrollEnabled = false;
    photoGrid.classList.add('compact-view');
    photoGrid.style.height = 'auto';
    photoGrid.innerHTML = '';
    filteredPhotos.forEach((photo, index) => {
      const item = createPhotoItem(photo, index);
      photoGrid.appendChild(item);
    });
    restoreSelectedState();
  } else {
    photoGrid.classList.remove('compact-view');
    renderPhotoGrid(true);
  }

  updateViewToggleButton();
  updateStatusBar();
}

async function loadVersionInfo() {
  if (window.electronAPI?.app?.getVersionInfo) {
    try {
      const info = await window.electronAPI.app.getVersionInfo();
      document.getElementById('aboutAppName').textContent = info.name || 'PhotoGallery';
      document.getElementById('aboutVersion').textContent = `版本 ${info.version || '1.0.0'}`;
      document.getElementById('aboutElectronVersion').textContent = info.electronVersion || '-';
      document.getElementById('aboutChromeVersion').textContent = info.chromeVersion || '-';
      document.getElementById('aboutNodeVersion').textContent = info.nodeVersion || '-';
    } catch (e) {
      console.error('Failed to load version info:', e);
    }
  }
}

function openAboutModal() {
  document.getElementById('aboutModal').classList.remove('hidden');
}

function closeAboutModal() {
  document.getElementById('aboutModal').classList.add('hidden');
}

function renderChangelog(entries) {
  const container = document.getElementById('changelogContent');
  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="text-center text-textSecondary py-8 text-sm">暂无更新记录</div>';
    return;
  }
  container.innerHTML = entries.map(entry => {
    const categoriesHtml = (entry.categories || []).map(cat => {
      const colorClass = CHANGELOG_COLOR_MAP[cat.color] || 'text-accent';
      const itemsHtml = (cat.items || []).map(item =>
        `<li class="flex items-start"><i class="fa-solid ${cat.icon} ${colorClass} mr-2 mt-0.5 shrink-0"></i><span>${escapeHtml(item)}</span></li>`
      ).join('');
      return `<ul class="text-sm text-textSecondary space-y-1">${itemsHtml}</ul>`;
    }).join('');
    return `
      <div class="bg-bgPrimary rounded-lg p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold text-accent">v${escapeHtml(entry.version)}</span>
          <span class="text-xs text-textSecondary">${escapeHtml(entry.date)}</span>
        </div>
        ${entry.title ? `<p class="text-xs text-textSecondary mb-2">${escapeHtml(entry.title)}</p>` : ''}
        ${categoriesHtml}
      </div>`;
  }).join('');
}

async function openChangelogModal() {
  document.getElementById('changelogModal').classList.remove('hidden');
  const container = document.getElementById('changelogContent');
  container.innerHTML = '<div class="text-center text-textSecondary py-8 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>加载中...</div>';
  try {
    const entries = await window.electronAPI.app.getChangelog();
    renderChangelog(entries);
  } catch (e) {
    container.innerHTML = '<div class="text-center text-red-500 py-8 text-sm">加载失败：' + escapeHtml(e.message || String(e)) + '</div>';
  }
}

function closeChangelogModal() {
  document.getElementById('changelogModal').classList.add('hidden');
}

async function takeBrowserScreenshot() {
  const webview = document.getElementById('materialWebview');
  if (!webview) {
    showToast('浏览器未就绪', 'error');
    return;
  }

  try {
    showProgress('截图', '正在截取页面...', '准备中');

    const image = await webview.capturePage();
    showProgress('截图', '正在保存...', '50%');

    const screenshotData = image.toPNG ? image.toPNG() : image;
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.jpg`;

    const result = await window.electronAPI.materialBrowser.saveScreenshot(screenshotData, filename);

    hideProgress();

    if (result.success) {
      showProgress('截图', '正在导入...', '75%');
      const importResult = await window.electronAPI.materialBrowser.importToLibrary(result.filePath, webview.getURL(), []);
      hideProgress();

      if (importResult.success) {
        showToast('截图已保存并导入样片库', 'success');
      } else {
        showToast('截图已保存，但导入失败: ' + (importResult.error || ''), 'warning');
      }
    } else {
      hideProgress();
      showToast('截图保存失败: ' + (result.error || ''), 'error');
    }
  } catch (e) {
    hideProgress();
    showToast('截图失败: ' + e, 'error');
  }
}

function openBrowserDownloadDir() {
  if (window.electronAPI?.materialBrowser?.openDownloadDir) {
    window.electronAPI.materialBrowser.openDownloadDir();
  }
}

async function clearBrowserDownloadCache() {
  if (!confirm('确定要清空下载缓存吗？')) return;
  if (window.electronAPI?.materialBrowser?.clearDownloadCache) {
    await window.electronAPI.materialBrowser.clearDownloadCache();
    showToast('下载缓存已清空', 'success');
  }
}
