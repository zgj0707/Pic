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
  updateLightboxRating(photo.rating || 0);
  renderLightboxTags(photo.tags || []);
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
  lightboxImage.style.transform = 'scale(1) translate(0, 0) rotate(0deg)';
  document.getElementById('zoomLevel').textContent = '100%';
}

function rotateImage(direction) {
  if (direction === 'left') {
    rotateAngle -= 90;
  } else {
    rotateAngle += 90;
  }
  lightboxImage.style.transform = `scale(${zoomScale}) translate(${imageOffset.x}px, ${imageOffset.y}px) rotate(${rotateAngle}deg)`;
}

function updateLightboxRating(rating) {
  document.querySelectorAll('#lightboxRating .star').forEach((star, idx) => {
    const isActive = idx < rating;
    star.classList.toggle('active', isActive);
    star.querySelector('i').className = `fa-${isActive ? 'solid' : 'regular'} fa-star`;
  });
}

function renderLightboxTags(tags) {
  const container = document.getElementById('lightboxTags');
  container.innerHTML = tags.map(tag =>
    `<span class="tag-badge lightbox-tag">${escapeHtml(tag)}<button class="ml-1 hover:text-red-400 tag-delete-btn"><i class="fa-solid fa-xmark text-xs"></i></button></span>`
  ).join('');

  container.querySelectorAll('.tag-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagBadge = e.target.closest('.lightbox-tag');
      const tagName = tagBadge.textContent.trim();
      removeLightboxTag(tagName);
    });
  });
}

async function removeLightboxTag(tagName) {
  if (filteredPhotos.length === 0) {
    showToast('没有可操作的照片', 'warning');
    return;
  }

  if (currentPhotoIndex >= filteredPhotos.length) {
    currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
  }

  const photo = filteredPhotos[currentPhotoIndex];
  if (!photo) {
    showToast('无法获取当前照片信息', 'error');
    return;
  }

  const fullPhoto = photos.find(p => p.id === photo.id);
  if (!fullPhoto) {
    showToast('照片数据已失效，请刷新后重试', 'error');
    await loadPhotos();
    return;
  }

  const newTags = fullPhoto.tags?.filter(t => t !== tagName) || [];

  if (window.electronAPI) {
    await window.electronAPI.photos.updateTags(fullPhoto.id, newTags);
    if (fullPhoto.filepath) await window.electronAPI.exif.writeTags(fullPhoto.filepath, newTags);
  }

  fullPhoto.tags = newTags;
  await loadPhotos();
  showToast(`已移除标签 "${tagName}"`, 'success');
}
