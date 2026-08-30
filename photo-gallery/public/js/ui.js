// UI 初始化与视图切换相关函数
// 与 app.js 共享全局状态变量

const XHS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const XHS_URL = 'https://www.xiaohongshu.com';
const DOUYIN_URL = 'https://www.douyin.com/';

const CHANGELOG_COLOR_MAP = {
  accent: 'text-accent',
  blue: 'text-blue-500',
  green: 'text-green-500',
  purple: 'text-purple-500',
  orange: 'text-orange-500',
  red: 'text-red-500'
};

async function openDouyinExternal() {
  if (!window.electronAPI?.materialBrowser?.openExternal) {
    showToast('当前版本不支持打开系统浏览器', 'error');
    return false;
  }
  const result = await window.electronAPI.materialBrowser.openExternal(DOUYIN_URL);
  if (!result?.success) {
    showToast(result?.error || '无法打开系统浏览器', 'error');
    return false;
  }
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
  const notice = document.getElementById('browserModeNotice');
  const webview = document.getElementById('materialWebview');
  if (notice) notice.textContent = '小红书内嵌浏览 · Alt+A 截图';
  webview?.classList.remove('hidden');
}

function isAllowedMaterialSourceUrl(source, rawUrl) {
  if (source !== 'xiaohongshu') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com') || host === 'xhslink.com' || host.endsWith('.xhslink.com');
  } catch {
    return false;
  }
}

function rememberBrowserSourceUrl(source, rawUrl) {
  if (source !== 'xiaohongshu') return;
  if (!isAllowedMaterialSourceUrl(source, rawUrl)) return;
  browserSourceUrls[source] = rawUrl;
  localStorage.setItem('browserSourceUrls', JSON.stringify(browserSourceUrls));
}

async function saveCurrentBrowserReference() {
  if (currentProjectId === null) {
    showToast('请先创建或选择一个拍摄方案', 'warning');
    return;
  }
  const webview = document.getElementById('materialWebview');
  const url = webview?.getURL?.() || '';
  if (!isAllowedMaterialSourceUrl('xiaohongshu', url)) {
    showToast('请先打开小红书内容页面', 'warning');
    return;
  }
  if (!window.electronAPI?.projectReferences?.add) {
    showToast('当前版本不支持保存远程参考', 'error');
    return;
  }
  const title = typeof webview.getTitle === 'function' ? webview.getTitle() : '';
  const result = await window.electronAPI.projectReferences.add({
    projectId: currentProjectId,
    source: 'xiaohongshu',
    sourceItemId: url,
    mediaType: 'link',
    title: title || '小红书参考',
    originalUrl: url
  });
  if (!result?.success && !result?.reference) {
    showToast('保存远程参考失败: ' + (result?.error || '未知错误'), 'warning');
    return;
  }
  if (typeof recordBrowserReference === 'function') recordBrowserReference(result.reference);
  showToast(result.alreadyExists ? '该页面已在当前方案中' : '远程参考已加入当前方案', result.alreadyExists ? 'info' : 'success');
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
