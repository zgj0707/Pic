// 批量操作相关函数
// 与 app.js / grid.js / tags.js 共享全局状态变量

async function deleteSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要将选中的 ${selectedPhotos.size} 张样片移入回收站吗？\n移入回收站后可在 30 天内恢复。`);
  if (!confirmed) return;

  showProgress('移入回收站', `正在移动 ${selectedPhotos.size} 张样片...`, '');

  try {
    const ids = Array.from(selectedPhotos);

    const result = window.electronAPI
      ? await window.electronAPI.photos.delete(ids)
      : { success: true, moved: ids.length };

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已将 ${result.moved || 0} 张样片移入回收站`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张样片移入回收站失败`, 'error');
    }
    await loadPhotos(true);
  } catch (e) {
    hideProgress();
    showToast('移入回收站失败: ' + e, 'error');
  }
}

async function restoreSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要恢复选中的 ${selectedPhotos.size} 张样片吗？`);
  if (!confirmed) return;

  showProgress('恢复样片', `正在恢复 ${selectedPhotos.size} 张样片...`, '');

  try {
    const ids = Array.from(selectedPhotos);
    const result = await window.electronAPI.photos.restore(ids);

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已恢复 ${result.restored || 0} 张样片`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张样片恢复失败`, 'error');
    }
    await loadPhotos(true);
  } catch (e) {
    hideProgress();
    showToast('恢复失败: ' + e, 'error');
  }
}

async function permanentlyDeleteSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要彻底删除选中的 ${selectedPhotos.size} 张样片吗？\n此操作不可恢复！`);
  if (!confirmed) return;

  showProgress('彻底删除', `正在彻底删除 ${selectedPhotos.size} 张样片...`, '');

  try {
    const ids = Array.from(selectedPhotos);
    const result = await window.electronAPI.photos.deletePermanently(ids);

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已彻底删除 ${result.deleted || 0} 张样片`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张样片删除失败`, 'error');
    }
    await loadPhotos(true);
  } catch (e) {
    hideProgress();
    showToast('彻底删除失败: ' + e, 'error');
  }
}

function applyPhotoFilters() {
  photoFilterState.search = document.getElementById('searchInput').value.toLowerCase().trim();
  photoFilterState.rating = document.getElementById('ratingFilter').value;
  photoFilterState.tag = document.getElementById('tagFilter').value;
  if (window.electronAPI) {
    loadPhotos(true);
  } else {
    renderPhotoGrid();
  }
}

async function applyBatchRating() {
  if (selectedPhotos.size === 0 || batchRatingValue === 0) return;

  showProgress('批量评分', `正在设置 ${batchRatingValue} 星评级...`, '');

  try {
    for (const id of selectedPhotos) {
      const photo = photos.find(p => p.id === id);
      if (photo && window.electronAPI) {
        await window.electronAPI.photos.updateRating(id, batchRatingValue);
        if (photo.filepath) await window.electronAPI.exif.writeRating(photo.filepath, batchRatingValue);
        photo.rating = batchRatingValue;
      }
    }

    hideProgress();
    if (window.electronAPI) await loadPhotos(true);
    else renderPhotoGrid();
    showToast(`已为 ${selectedPhotos.size} 张样片设置 ${batchRatingValue} 星评级`, 'success');
  } catch (e) {
    hideProgress();
    showToast('批量评分失败: ' + e, 'error');
  }
}

async function clearBatchRating() {
  if (selectedPhotos.size === 0) return;

  showProgress('清空评分', '正在清空评分...', '');

  try {
    for (const id of selectedPhotos) {
      const photo = photos.find(p => p.id === id);
      if (photo && window.electronAPI) {
        await window.electronAPI.photos.updateRating(id, 0);
        if (photo.filepath) await window.electronAPI.exif.writeRating(photo.filepath, 0);
        photo.rating = 0;
      }
    }

    batchRatingValue = 0;
    document.querySelectorAll('#batchRating .star').forEach(s => {
      s.classList.remove('active');
      s.querySelector('i').className = 'fa-regular fa-star';
    });

    hideProgress();
    if (window.electronAPI) await loadPhotos(true);
    else renderPhotoGrid();
    showToast(`已清空 ${selectedPhotos.size} 张样片的评分`, 'success');
  } catch (e) {
    hideProgress();
    showToast('清空评分失败: ' + e, 'error');
  }
}

async function copySelectedToDesktop() {
  if (selectedPhotos.size === 0) {
    showToast('请先选择要保存的样片', 'warning');
    return;
  }
  const selectedPhotoObjs = Array.from(selectedPhotos).map(id => photos.find(p => p.id === id)).filter(Boolean);
  const filePaths = selectedPhotoObjs.map(p => p.filepath).filter(Boolean);

  if (filePaths.length === 0) {
    showToast('选中的样片没有可复制的原图', 'error');
    return;
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = String(yyyy) + mm + dd;
  const projectLabel = typeof currentProjectName === 'string' && currentProjectName.trim()
    ? currentProjectName.trim()
    : 'Pic-样片';
  const folderName = projectLabel + '-' + dateStr;

  if (window.electronAPI?.photos?.copyToDesktopFolder) {
    try {
      const result = await window.electronAPI.photos.copyToDesktopFolder(filePaths, folderName);
      if ((result.copied || 0) > 0) {
        const suffix = result.failed > 0 ? '，' + result.failed + ' 张失败' : '';
        showToast('已保存 ' + result.copied + ' 张样片到桌面文件夹「' + folderName + '」' + suffix, result.failed > 0 ? 'warning' : 'success');
      } else {
        showToast('保存失败: ' + (result.error || '没有可复制的原图'), 'error');
      }
    } catch (e) {
      showToast('保存失败: ' + e, 'error');
    }
  } else {
    showToast('桌面保存功能不可用', 'error');
  }
}

async function applyBatchTags() {
  if (selectedPhotos.size === 0 || batchTags.length === 0) return;

  const tagsToAdd = batchTags.length;
  showProgress('批量添加标签', `正在为 ${selectedPhotos.size} 张样片添加 ${tagsToAdd} 个标签...`, '');

  try {
    for (const id of selectedPhotos) {
      const photo = photos.find(p => p.id === id);
      if (photo && window.electronAPI) {
        const currentTags = photo.tags || [];
        const newTags = Array.from(new Set([...currentTags, ...batchTags]));
        await window.electronAPI.photos.updateTags(id, newTags);
        if (photo.filepath) await window.electronAPI.exif.writeTags(photo.filepath, newTags);
        photo.tags = newTags;
      }
    }

    batchTags = [];
    renderBatchTags();
    hideProgress();
    renderPhotoGrid();
    await updateTagFilter();
    showToast(`已为 ${selectedPhotos.size} 张样片添加 ${tagsToAdd} 个标签`, 'success');
    await loadPhotos();
  } catch (e) {
    hideProgress();
    showToast('批量添加标签失败: ' + e, 'error');
  }
}

async function applyRemoveTags() {
  if (selectedPhotos.size === 0 || removeTags.length === 0) return;

  const tagsToRemove = removeTags.length;
  showProgress('批量移除标签', `正在从 ${selectedPhotos.size} 张样片移除 ${tagsToRemove} 个标签...`, '');

  try {
    for (const id of selectedPhotos) {
      const photo = photos.find(p => p.id === id);
      if (photo && window.electronAPI) {
        const currentTags = photo.tags || [];
        const newTags = currentTags.filter(t => !removeTags.includes(t));
        await window.electronAPI.photos.updateTags(id, newTags);
        if (photo.filepath) await window.electronAPI.exif.writeTags(photo.filepath, newTags);
        photo.tags = newTags;
      }
    }

    removeTags = [];
    document.getElementById('removeTags').innerHTML = '';
    hideProgress();
    await loadPhotos();
    showToast(`已从 ${selectedPhotos.size} 张样片移除 ${tagsToRemove} 个标签`, 'success');
  } catch (e) {
    hideProgress();
    showToast('批量移除标签失败: ' + e, 'error');
  }
}
