// 通用工具函数
// 注意：此文件为纯浏览器 JavaScript，不使用 ES module 语法

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = 'info-circle', iconColor = '#0078d4';
  if (type === 'success') { icon = 'check-circle'; iconColor = '#10b981'; }
  if (type === 'error') { icon = 'exclamation-circle'; iconColor = '#ef4444'; }
  if (type === 'warning') { icon = 'exclamation-triangle'; iconColor = '#f59e0b'; }
  toast.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-${icon}" style="color: ${iconColor}"></i><span>${escapeHtml(message)}</span></div>`;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'slideOut 0.3s ease-out forwards'; setTimeout(() => toast.remove(), 300); }, duration);
}

function showProgress(title, text, status = '') {
  document.getElementById('progressTitle').textContent = title;
  document.getElementById('progressText').textContent = text;
  document.getElementById('progressStatus').textContent = status;
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressOverlay').classList.remove('hidden');
}

function updateProgress(percent, status = '') {
  document.getElementById('progressBar').style.width = percent + '%';
  if (status) document.getElementById('progressStatus').textContent = status;
}

function hideProgress() {
  document.getElementById('progressOverlay').classList.add('hidden');
  setTimeout(() => {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      activeElement.focus();
    }
  }, 50);
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

let contextMenuFilePath = '';

function showContextMenu(x, y, filePath) {
  const contextMenu = document.getElementById('contextMenu');
  if (!contextMenu) return;
  contextMenuFilePath = filePath;
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.remove('hidden');
  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
  }
}

function hideContextMenu() {
  const contextMenu = document.getElementById('contextMenu');
  if (!contextMenu) return;
  contextMenu.classList.add('hidden');
  contextMenuFilePath = '';
}

function initContextMenu() {
  const contextMenu = document.getElementById('contextMenu');
  if (!contextMenu) return;
  document.addEventListener('click', (e) => {
    if (!contextMenu.classList.contains('hidden') && !contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
  });
  contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const action = e.currentTarget.dataset.action;
      if (action === 'copyImage' && contextMenuFilePath) {
        if (window.electronAPI?.photos?.copyImageToClipboard) {
          try {
            const result = await window.electronAPI.photos.copyImageToClipboard(contextMenuFilePath);
            if (result.success) {
              showToast('图片已复制到剪贴板', 'success');
            } else {
              showToast('复制失败: ' + (result.error || '未知错误'), 'error');
            }
          } catch (err) {
            showToast('复制失败: ' + err, 'error');
          }
        } else {
          showToast('功能不可用', 'error');
        }
      }
      hideContextMenu();
    });
  });
}
