// 批量操作相关函数
// 与 app.js / grid.js 共享全局状态变量

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
      if (typeof pushAppUndo === 'function' && typeof restoreDeletedPhotoIds === 'function') {
        pushAppUndo(`将 ${result.moved || ids.length} 张样片移入回收站`, () => restoreDeletedPhotoIds(ids));
      }
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

async function exportSelectedPhotosToPdf() {
  const selectedPhotoObjs = Array.from(selectedPhotos)
    .map(id => photos.find(photo => photo.id === id))
    .filter(photo => photo && !photo.deleted_at && photo.filepath);

  if (selectedPhotoObjs.length === 0) {
    showToast('请先选择有原图文件的样片', 'warning');
    return;
  }
  if (!window.electronAPI?.photos?.exportToPdf) {
    showToast('PDF 导出功能不可用', 'error');
    return;
  }

  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('');
  const projectLabel = typeof currentProjectName === 'string' && currentProjectName.trim()
    ? currentProjectName.trim()
    : 'Pic-样片';
  const fileBaseName = projectLabel + '-' + date;
  showProgress('导出 PDF', '正在处理 ' + selectedPhotoObjs.length + ' 张选中样片...', '');

  try {
    const result = await window.electronAPI.photos.exportToPdf(
      selectedPhotoObjs.map(photo => photo.filepath),
      fileBaseName
    );
    if ((result.exported || 0) > 0) {
      const suffix = result.failed > 0 ? '，' + result.failed + ' 张失败' : '';
      const fileLabel = result.filePath ? result.filePath.split(/[\\/]/).pop() : fileBaseName + '.pdf';
      showToast('已将 ' + result.exported + ' 张选中样片导出为 PDF「' + fileLabel + '」' + suffix, result.failed > 0 ? 'warning' : 'success');
      if (result.filePath && window.electronAPI.delivery?.openFolder) {
        void window.electronAPI.delivery.openFolder(result.filePath.replace(/[\\/][^\\/]+$/, ''));
      }
    } else {
      showToast('PDF 导出失败: ' + (result.error || '没有可导出的原图'), 'error');
    }
  } catch (error) {
    showToast('PDF 导出失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  } finally {
    hideProgress();
  }
}

function applyPhotoFilters() {
  photoFilterState.search = document.getElementById('searchInput').value.toLowerCase().trim();
  if (window.electronAPI) {
    loadPhotos(true);
  } else {
    renderPhotoGrid();
  }
}
