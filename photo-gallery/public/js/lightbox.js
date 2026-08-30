// 灯箱查看相关函数
// 与 app.js / grid.js 共享全局状态变量

function openLightbox(photo, index) {
  currentPhotoIndex = index;
  lightboxImage.src = photo.filepath || photo.thumbnail_path || '';
  document.getElementById('lightboxFilename').textContent = photo.filename || '未命名';
  const filePath = photo.filepath || '';
  document.getElementById('lightboxInfo').innerHTML = `<span class="text-blue-400 cursor-pointer hover:text-blue-300">${escapeHtml(filePath)}</span>`;
  const pathSpan = document.querySelector('#lightboxInfo span');
  if (pathSpan) {
    pathSpan.addEventListener('click', () => {
      if (window.electronAPI?.photos?.openInExplorer) {
        window.electronAPI.photos.openInExplorer(filePath).then(result => {
          if (!result.success) {
            showToast('无法打开文件位置: ' + (result.error || '未知错误'), 'error');
          }
        }).catch(() => {
          showToast('无法打开文件位置', 'error');
        });
      } else {
        showToast('功能不可用', 'error');
      }
    });
  }
  lightbox.classList.remove('hidden');
  resetZoom();
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  resetZoom();
}

function resetZoom() {
  zoomScale = 1;
  imageOffset = { x: 0, y: 0 };
  rotateAngle = 0;
  applyLightboxTransform();
  lightboxImage.style.cursor = 'default';
  document.getElementById('zoomLevel').textContent = '100%';
}

function applyLightboxTransform() {
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x / zoomScale}px, ${imageOffset.y / zoomScale}px) rotate(${rotateAngle}deg)`;
}

function rotateImage(direction) {
  if (direction === 'left') {
    rotateAngle -= 90;
  } else {
    rotateAngle += 90;
  }
  applyLightboxTransform();
}
