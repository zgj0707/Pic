// UI 初始化与视图切换相关函数
// 与 app.js 共享全局状态变量

const XHS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NORMAL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BROWSER_SOURCE_URLS = {
  xiaohongshu: 'https://www.xiaohongshu.com',
  douyin: 'https://www.douyin.com'
};

const CHANGELOG_COLOR_MAP = {
  accent: 'text-accent',
  blue: 'text-blue-500',
  green: 'text-green-500',
  purple: 'text-purple-500',
  orange: 'text-orange-500',
  red: 'text-red-500'
};

let douyinExternalOpened = false;

async function openDouyinExternal(force = false) {
  if (!force && douyinExternalOpened) return true;
  if (!window.electronAPI?.materialBrowser?.openExternal) {
    showToast('当前版本不支持打开系统浏览器', 'error');
    return false;
  }
  const result = await window.electronAPI.materialBrowser.openExternal(BROWSER_SOURCE_URLS.douyin);
  if (!result?.success) {
    showToast(result?.error || '无法打开系统浏览器', 'error');
    return false;
  }
  douyinExternalOpened = true;
  return true;
}

function clearEmbeddedWebview() {
  const webview = document.getElementById('materialWebview');
  if (!webview) return;
  try {
    webview.stop?.();
    if (typeof webview.loadURL === 'function' && webview.getURL?.() !== 'about:blank') {
      webview.loadURL('about:blank');
    }
  } catch { /* best effort */ }
}

function updateBrowserModeUI() {
  const btn = document.getElementById('browserModeToggle');
  const icon = document.getElementById('browserModeIcon');
  const notice = document.getElementById('browserModeNotice');
  const externalNotice = document.getElementById('douyinExternalNotice');
  const webview = document.getElementById('materialWebview');
  const isDouyin = browserSource === 'douyin';
  const embeddedControls = ['browserBack', 'browserForward', 'browserRefresh', 'browserUrl', 'browserGo', 'browserModeToggle'];

  if (isDouyin) {
    btn.title = '当前：抖音使用系统浏览器';
    btn.classList.remove('text-textSecondary');
    btn.classList.add('text-accent');
    icon.className = 'fa-solid fa-arrow-up-right-from-square';
    if (notice) notice.textContent = '当前为系统浏览器模式 · 抖音';
    if (externalNotice) {
      externalNotice.classList.remove('hidden');
      externalNotice.classList.add('flex');
    }
    webview?.classList.add('hidden');
  } else {
    btn.title = '当前：小红书内嵌浏览';
    btn.classList.remove('text-accent');
    btn.classList.add('text-textSecondary');
    icon.className = 'fa-solid fa-heart';
    if (notice) notice.textContent = '当前为内嵌网页模式 · 小红书';
    if (externalNotice) {
      externalNotice.classList.add('hidden');
      externalNotice.classList.remove('flex');
    }
    webview?.classList.remove('hidden');
  }

  embeddedControls.forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', isDouyin);
  });
}
function updateBrowserSourceUI() {
  const sources = [
    ['xiaohongshu', document.getElementById('browserSourceXhs')],
    ['douyin', document.getElementById('browserSourceDouyin')]
  ];
  sources.forEach(([source, button]) => {
    if (!button) return;
    const active = source === browserSource;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function isAllowedMaterialSourceUrl(source, rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (source === 'douyin') return host === 'douyin.com' || host.endsWith('.douyin.com');
    return host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com') || host === 'xhslink.com' || host.endsWith('.xhslink.com');
  } catch {
    return false;
  }
}

function rememberBrowserSourceUrl(source, rawUrl) {
  if (!isAllowedMaterialSourceUrl(source, rawUrl)) return;
  browserSourceUrls[source] = rawUrl;
  localStorage.setItem('browserSourceUrls', JSON.stringify(browserSourceUrls));
}

function setBrowserSource(source, announce = true) {
  if (source !== 'xiaohongshu' && source !== 'douyin') return;
  const previousSource = browserSource;
  const webview = document.getElementById('materialWebview');

  if (previousSource === 'xiaohongshu' && webview) {
    const currentUrl = webview.getURL?.() || '';
    rememberBrowserSourceUrl(previousSource, currentUrl);
  }

  browserSource = source;
  browserMode = source === 'xiaohongshu' ? 'xiaohongshu' : 'external';
  localStorage.setItem('browserSource', source);
  localStorage.setItem('browserMode', browserMode);

  if (source === 'douyin') {
    clearEmbeddedWebview();
    if (announce || previousSource !== source) void openDouyinExternal();
  } else if (webview) {
    const currentUrl = webview.getURL?.() || '';
    const targetUrl = isAllowedMaterialSourceUrl(source, currentUrl)
      ? currentUrl
      : (browserSourceUrls[source] || BROWSER_SOURCE_URLS[source]);
    if (typeof webview.setUserAgent === 'function') webview.setUserAgent(XHS_USER_AGENT);
    if (targetUrl !== currentUrl && typeof webview.loadURL === 'function') webview.loadURL(targetUrl);
  }

  updateBrowserSourceUI();
  updateBrowserModeUI();
  if (announce) {
    showToast(source === 'douyin'
      ? '已切换到抖音，系统浏览器已打开；按 Ctrl + Alt + Shift + S 截图'
      : '已切换到小红书浏览', 'success');
  }
}
async function saveCurrentBrowserReference() {
  if (browserSource === 'douyin') {
    showToast('抖音模式不保存链接，请使用全局截图快捷键', 'info');
    return;
  }
  if (currentProjectId === null) {
    showToast('请先创建或选择一个拍摄项目', 'warning');
    return;
  }
  const webview = document.getElementById('materialWebview');
  const url = webview?.getURL?.() || '';
  if (!isAllowedMaterialSourceUrl(browserSource, url)) {
    showToast(browserSource === 'douyin' ? '请先打开抖音内容页面' : '请先打开小红书内容页面', 'warning');
    return;
  }
  if (!window.electronAPI?.projectReferences?.add) {
    showToast('当前版本不支持保存远程参考', 'error');
    return;
  }
  const title = typeof webview.getTitle === 'function' ? webview.getTitle() : '';
  const result = await window.electronAPI.projectReferences.add({
    projectId: currentProjectId,
    source: browserSource,
    sourceItemId: url,
    mediaType: 'link',
    title: title || (browserSource === 'douyin' ? '抖音参考' : '小红书参考'),
    originalUrl: url
  });
  if (!result?.success && !result?.reference) {
    showToast('保存远程参考失败: ' + (result?.error || '未知错误'), 'warning');
    return;
  }
  if (typeof recordBrowserReference === 'function') recordBrowserReference(result.reference);
  showToast(result.alreadyExists ? '该页面已在当前项目中' : '远程参考已加入当前项目', result.alreadyExists ? 'info' : 'success');
}

function setBrowserMode(mode) {
  browserMode = mode;
  localStorage.setItem('browserMode', mode);

  const webview = document.getElementById('materialWebview');
  if (webview) {
    const currentUrl = webview.getURL();
    if (typeof webview.setUserAgent === 'function') {
      webview.setUserAgent(mode === 'xiaohongshu' ? XHS_USER_AGENT : NORMAL_USER_AGENT);
    }
    if (typeof webview.loadURL === 'function') webview.loadURL(currentUrl);
  }

  updateBrowserModeUI();
  showToast(mode === 'xiaohongshu' ? '已切换到小红书模式' : '已切换到普通浏览器模式', 'success');
}

function updateViewToggleButton() {
  const btn = document.getElementById('viewToggleBtn');
  const icon = document.getElementById('viewToggleIcon');
  const label = document.getElementById('viewToggleLabel');

  if (currentViewMode === 'compact') {
    btn.title = '切换到瀑布流';
    icon.className = 'fa-solid fa-th';
    if (label) label.textContent = '切换到瀑布流';
  } else {
    btn.title = '切换到紧凑视图';
    icon.className = 'fa-solid fa-th-large';
    if (label) label.textContent = '切换到紧凑视图';
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
  if (browserSource === 'douyin') {
    if (!window.electronAPI?.capture?.trigger) {
      showToast('当前版本不支持全局截图，请重新构建 Pic', 'error');
      return;
    }
    const result = await window.electronAPI.capture.trigger();
    if (!result?.success) showToast(result?.error || '无法启动截图', 'warning');
    return;
  }

  if (!ensureCurrentProjectForImport()) return;
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
    const filename = 'screenshot_' + timestamp + '.jpg';
    const result = await window.electronAPI.materialBrowser.saveScreenshot(screenshotData, filename);
    hideProgress();

    if (result.success) {
      showProgress('截图', '正在导入...', '75%');
      const importResult = await window.electronAPI.materialBrowser.importToLibrary(result.filePath, webview.getURL(), [], currentProjectId);
      hideProgress();

      if (importResult.success) {
        if (typeof recordBrowserCollection === 'function') {
          recordBrowserCollection(importResult, { fileName: filename, filePath: result.filePath, sourceUrl: webview.getURL() });
        }
        await loadPhotos(true);
        showToast('截图已保存并加入当前项目', 'success');
      } else {
        showToast('截图已保存，但导入失败: ' + (importResult.error || ''), 'warning');
      }
    } else {
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
