// Desktop/file import and photo-to-project drag and drop.

const PIC_PHOTO_DRAG_TYPE = 'application/x-pic-photo-ids';
const PIC_SHOT_COPY_DRAG_TYPE = 'application/x-pic-shot-copy';
window.PIC_PHOTO_DRAG_TYPE = PIC_PHOTO_DRAG_TYPE;
window.picPhotoDragActive = false;

function hasPicPhotoPayload(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes(PIC_PHOTO_DRAG_TYPE));
}

function hasShotCopyPayload(dataTransfer) {
  return Boolean(dataTransfer?.types?.includes(PIC_SHOT_COPY_DRAG_TYPE));
}

function readShotCopyPayload(dataTransfer) {
  if (!hasShotCopyPayload(dataTransfer)) return null;
  try {
    const payload = JSON.parse(dataTransfer.getData(PIC_SHOT_COPY_DRAG_TYPE));
    if (!payload || !Number.isInteger(Number(payload.sourceProjectId)) || !Number.isInteger(Number(payload.shotId))) return null;
    return {
      sourceProjectId: Number(payload.sourceProjectId),
      shotId: Number(payload.shotId),
      lane: typeof payload.lane === 'string' ? payload.lane : '',
      shotName: typeof payload.shotName === 'string' ? payload.shotName : ''
    };
  } catch {
    return null;
  }
}

async function copyShotToProject(payload, targetProjectId) {
  if (!payload) return;
  if (Number(payload.sourceProjectId) === Number(targetProjectId)) {
    showToast('镜头已经在这个项目中', 'info');
    return;
  }
  if (!window.electronAPI?.shots?.copy) {
    showToast('跨项目复制功能当前不可用，请重启应用后重试', 'error');
    return;
  }
  try {
    const result = await window.electronAPI.shots.copy(payload.sourceProjectId, payload.shotId, targetProjectId, { lane: payload.lane || undefined });
    if (!result?.success) throw new Error(result?.error || '复制镜头失败');
    const targetName = projects.find(project => project.id === Number(targetProjectId))?.name || '目标项目';
    showToast(`已复制「${payload.shotName || '镜头'}」到「${targetName}」· ${payload.lane || '原景别'}（原镜头保留）`, 'success');
    if (Number(currentProjectId) === Number(targetProjectId) && currentPanel === 'planning' && typeof loadPlanning === 'function') {
      await loadPlanning();
    }
  } catch (error) {
    showToast('复制镜头失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  }
}

function readPicPhotoPayload(dataTransfer) {
  if (!hasPicPhotoPayload(dataTransfer)) return null;
  try {
    const raw = dataTransfer.getData(PIC_PHOTO_DRAG_TYPE);
    const payload = JSON.parse(raw);
    if (!payload || !Number.isInteger(Number(payload.sourceProjectId)) || !Array.isArray(payload.photoIds)) return null;
    const photoIds = Array.from(new Set(payload.photoIds.map(Number).filter(id => Number.isInteger(id) && id > 0)));
    return photoIds.length > 0
      ? { sourceProjectId: Number(payload.sourceProjectId), photoIds }
      : null;
  } catch {
    return null;
  }
}

function hasExternalFiles(dataTransfer) {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length > 0) return true;
  return Array.from(dataTransfer.items || []).some(item => item.kind === 'file');
}

function getDroppedPaths(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []);
  const itemFiles = Array.from(dataTransfer?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile?.())
    .filter(Boolean);
  const allFiles = [...files, ...itemFiles];
  const paths = allFiles.map(file => {
    try {
      return window.electronAPI?.path?.getPathForFile?.(file) || file.path || '';
    } catch {
      return file.path || '';
    }
  });
  return Array.from(new Set(paths.filter(path => typeof path === 'string' && path.trim())));
}

function setDropTargetState(element, active) {
  element?.classList.toggle('drag-over', active);
}

function clearDropTargetStates() {
  document.querySelectorAll('.project-item.drag-over, #photoGridContainer.drag-over')
    .forEach(element => element.classList.remove('drag-over'));
}

async function importDroppedPaths(paths, projectId) {
  if (!window.electronAPI?.import?.fromDroppedPaths || projectId === null || projectId === undefined) {
    showToast('请先创建或选择一个拍摄方案', 'warning');
    return;
  }
  if (paths.length === 0) {
    showToast('没有读取到可导入的文件或文件夹', 'warning');
    return;
  }

  showProgress('导入样片', '正在导入拖入的文件...', '');
  startImportProgressListener();
  try {
    const result = await window.electronAPI.import.fromDroppedPaths(paths, projectId);
    if (!result.success) {
      showToast('导入失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    let message = '成功导入 ' + result.imported + ' 张样片';
    if (result.skipped > 0) message += '（跳过 ' + result.skipped + ' 张重复）';
    showToast(message, result.imported > 0 ? 'success' : 'info');
    await loadProjects(projectId);
    if (currentProjectId === projectId) await loadPhotos(true);
  } catch (error) {
    showToast('导入失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  } finally {
    stopImportProgressListener();
    hideProgress();
  }
}

async function refreshAfterPhotoMove(projectId) {
  await loadProjects(projectId);
  if (currentProjectId === projectId) await loadPhotos(true);
}

async function movePicPhotosToProject(payload, targetProjectId) {
  if (!payload || targetProjectId === payload.sourceProjectId) {
    if (payload) showToast('样片已经在这个方案中', 'info');
    return;
  }
  if (!window.electronAPI?.projects?.movePhotos) {
    showToast('跨方案移动功能当前不可用，请重启应用后重试', 'error');
    return;
  }

  try {
    const result = await window.electronAPI.projects.movePhotos(
      payload.sourceProjectId,
      targetProjectId,
      payload.photoIds
    );
    if (!result?.success) throw new Error(result?.error || '移动样片失败');
    const movedIds = Array.isArray(result.movedPhotoIds) ? result.movedPhotoIds.map(Number) : [];
    if (movedIds.length === 0) {
      showToast('没有可移动的样片，可能已被删除或已移入其他方案', 'info');
      return;
    }

    movedIds.forEach(id => selectedPhotos.delete(id));
    updateSelectedCount();
    updateContextPanel();
    await refreshAfterPhotoMove(targetProjectId);
    showToast('已将 ' + movedIds.length + ' 张样片移动到「' + (currentProjectName || '目标方案') + '」', 'success');

    if (typeof pushAppUndo === 'function') {
      pushAppUndo('移动 ' + movedIds.length + ' 张样片', async () => {
        const undoResult = await window.electronAPI.projects.movePhotos(
          targetProjectId,
          payload.sourceProjectId,
          movedIds
        );
        if (!undoResult?.success) throw new Error(undoResult?.error || '恢复样片位置失败');
        await refreshAfterPhotoMove(payload.sourceProjectId);
      });
    }
  } catch (error) {
    showToast('移动样片失败: ' + (error instanceof Error ? error.message : String(error)), 'error');
  }
}

function handleExternalDrop(event, targetProjectId, targetElement) {
  if (!hasExternalFiles(event.dataTransfer)) return false;
  event.preventDefault();
  event.stopPropagation();
  setDropTargetState(targetElement, false);
  void importDroppedPaths(getDroppedPaths(event.dataTransfer), targetProjectId);
  return true;
}

function bindProjectDropTargets() {
  const list = document.getElementById('projectList');
  if (!list) return;

  list.addEventListener('dragover', event => {
    const target = event.target.closest('.project-item');
    if (!target) return;
    if (hasPicPhotoPayload(event.dataTransfer) || hasShotCopyPayload(event.dataTransfer) || hasExternalFiles(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = hasPicPhotoPayload(event.dataTransfer) ? 'move' : 'copy';
      clearDropTargetStates();
      setDropTargetState(target, true);
    }
  });

  list.addEventListener('dragleave', event => {
    const target = event.target.closest('.project-item');
    if (target && !target.contains(event.relatedTarget)) setDropTargetState(target, false);
  });

  list.addEventListener('drop', event => {
    const target = event.target.closest('.project-item');
    if (!target) return;
    clearDropTargetStates();
    const targetProjectId = Number(target.dataset.projectId);
    const shotPayload = readShotCopyPayload(event.dataTransfer);
    if (shotPayload) {
      event.preventDefault();
      event.stopPropagation();
      void copyShotToProject(shotPayload, targetProjectId);
      return;
    }
    const payload = readPicPhotoPayload(event.dataTransfer);
    if (payload) {
      event.preventDefault();
      event.stopPropagation();
      void movePicPhotosToProject(payload, targetProjectId);
      return;
    }
    handleExternalDrop(event, targetProjectId, target);
  });
}

function bindGalleryDropTarget() {
  const gridContainer = document.getElementById('photoGridContainer');
  if (!gridContainer) return;

  gridContainer.addEventListener('dragover', event => {
    if (hasPicPhotoPayload(event.dataTransfer)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
      setDropTargetState(gridContainer, false);
      return;
    }
    if (!hasExternalFiles(event.dataTransfer) || currentProjectId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropTargetState(gridContainer, true);
  });
  gridContainer.addEventListener('dragleave', event => {
    if (!gridContainer.contains(event.relatedTarget)) setDropTargetState(gridContainer, false);
  });
  gridContainer.addEventListener('drop', event => {
    if (hasPicPhotoPayload(event.dataTransfer)) {
      event.preventDefault();
      event.stopPropagation();
      setDropTargetState(gridContainer, false);
      return;
    }
    setDropTargetState(gridContainer, false);
    handleExternalDrop(event, currentProjectId, gridContainer);
  });
}

document.addEventListener('dragend', () => {
  window.picPhotoDragActive = false;
  clearDropTargetStates();
});
document.addEventListener('drop', clearDropTargetStates);
bindProjectDropTargets();
bindGalleryDropTarget();
