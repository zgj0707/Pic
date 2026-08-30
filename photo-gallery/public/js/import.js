// 导入逻辑相关函数
// 与 app.js 共享全局状态变量

function startImportProgressListener() {
  stopImportProgressListener();
  if (window.electronAPI?.import?.onProgress) {
    const handler = (prog) => {
      if (prog.status === 'importing' && prog.total > 0) {
        const percent = Math.round((prog.current / prog.total) * 100);
        document.getElementById('progressTitle').textContent = '导入样片';
        document.getElementById('progressText').textContent = prog.message;
        updateProgress(percent, `${prog.current}/${prog.total}`);
      } else if (prog.status === 'scanning') {
        document.getElementById('progressTitle').textContent = '导入样片';
        document.getElementById('progressText').textContent = prog.message;
        updateProgress(0, '扫描中...');
      }
    };
    importProgressUnsubscribe = window.electronAPI.import.onProgress(handler);
  }
}

function stopImportProgressListener() {
  if (importProgressUnsubscribe) {
    importProgressUnsubscribe();
    importProgressUnsubscribe = null;
  }
}

function ensureCurrentProjectForImport() {
  if (currentProjectId !== null) return true;
  showToast('请先创建或选择一个拍摄方案，再收集参考样片', 'warning');
  createNewProject();
  return false;
}

async function importFromFolder() {
  if (!ensureCurrentProjectForImport() || !window.electronAPI) return;
  const dir = await window.electronAPI.dialog.openDirectory();
  if (!dir) return;
  showProgress('导入样片', '正在扫描...', '');
  startImportProgressListener();
  const result = await window.electronAPI.import.fromDirectory(dir, currentProjectId);
  stopImportProgressListener();
  hideProgress();
  if (result.success) {
    let message = `成功导入 ${result.imported} 张样片`;
    if (result.skipped > 0) {
      message += ` (跳过 ${result.skipped} 张重复)`;
    }
    if (result.thumbnailsGenerated > 0) {
      message += `，生成 ${result.thumbnailsGenerated} 张缩略图`;
    }
    showToast(message, result.imported > 0 ? 'success' : 'info');
    await loadPhotos();
    if (photos.length > 0) {
      currentPhotoIndex = 0;
    }
  } else {
    showToast('导入失败: ' + (result.error || '未知错误'), 'error');
  }
}

async function importFromFiles() {
  if (!ensureCurrentProjectForImport() || !window.electronAPI) return;
  const files = await window.electronAPI.dialog.openFile();
  if (!files || files.length === 0) return;
  showProgress('导入样片', '正在导入...', '');
  startImportProgressListener();
  const result = await window.electronAPI.import.fromFiles(files, currentProjectId);
  stopImportProgressListener();
  hideProgress();
  if (result.success) {
    let message = `成功导入 ${result.imported} 张样片`;
    if (result.skipped > 0) {
      message += ` (跳过 ${result.skipped} 张重复)`;
    }
    if (result.thumbnailsGenerated > 0) {
      message += `，生成 ${result.thumbnailsGenerated} 张缩略图`;
    }
    showToast(message, result.imported > 0 ? 'success' : 'info');
    await loadPhotos();
    if (photos.length > 0) {
      currentPhotoIndex = 0;
    }
  } else {
    showToast('导入失败: ' + (result.error || '未知错误'), 'error');
  }
}
