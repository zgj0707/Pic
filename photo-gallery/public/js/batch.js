// 批量操作相关函数
// 与 app.js / grid.js / tags.js 共享全局状态变量

async function deleteSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要将选中的 ${selectedPhotos.size} 张照片移入回收站吗？\n移入回收站后可在 30 天内恢复。`);
  if (!confirmed) return;

  showProgress('移入回收站', `正在移动 ${selectedPhotos.size} 张照片...`, '');

  try {
    const ids = Array.from(selectedPhotos);

    const result = window.electronAPI
      ? await window.electronAPI.photos.delete(ids)
      : { success: true, moved: ids.length };

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已将 ${result.moved || 0} 张照片移入回收站`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张照片移入回收站失败`, 'error');
    }
    await loadPhotos(true);
  } catch (e) {
    hideProgress();
    showToast('移入回收站失败: ' + e, 'error');
  }
}

async function restoreSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要恢复选中的 ${selectedPhotos.size} 张照片吗？`);
  if (!confirmed) return;

  showProgress('恢复照片', `正在恢复 ${selectedPhotos.size} 张照片...`, '');

  try {
    const ids = Array.from(selectedPhotos);
    const result = await window.electronAPI.photos.restore(ids);

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已恢复 ${result.restored || 0} 张照片`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张照片恢复失败`, 'error');
    }
    await loadPhotos(true);
  } catch (e) {
    hideProgress();
    showToast('恢复失败: ' + e, 'error');
  }
}

async function permanentlyDeleteSelectedPhotos() {
  if (selectedPhotos.size === 0) return;

  const confirmed = confirm(`确定要彻底删除选中的 ${selectedPhotos.size} 张照片吗？\n此操作不可恢复！`);
  if (!confirmed) return;

  showProgress('彻底删除', `正在彻底删除 ${selectedPhotos.size} 张照片...`, '');

  try {
    const ids = Array.from(selectedPhotos);
    const result = await window.electronAPI.photos.deletePermanently(ids);

    selectedPhotos.clear();
    updateSelectedCount();
    hideProgress();
    if (result.success) {
      showToast(`已彻底删除 ${result.deleted || 0} 张照片`, 'success');
    } else {
      showToast(result.error || `有 ${result.failed || 0} 张照片删除失败`, 'error');
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
    showToast(`已为 ${selectedPhotos.size} 张照片设置 ${batchRatingValue} 星评级`, 'success');
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
    showToast(`已清空 ${selectedPhotos.size} 张照片的评分`, 'success');
  } catch (e) {
    hideProgress();
    showToast('清空评分失败: ' + e, 'error');
  }
}

async function copySelectedToDesktop() {
  if (selectedPhotos.size === 0) {
    showToast('请先选择要复制的照片', 'warning');
    return;
  }
  const selectedPhotoObjs = Array.from(selectedPhotos).map(id => photos.find(p => p.id === id)).filter(Boolean);
  const filePaths = selectedPhotoObjs.map(p => p.filepath).filter(Boolean);

  if (filePaths.length === 0) {
    showToast('没有可复制的照片', 'error');
    return;
  }

  // 找占比最大的标签
  const tagCounts = {};
  let totalTags = 0;
  for (const photo of selectedPhotoObjs) {
    if (photo.tags && photo.tags.length > 0) {
      for (const tag of photo.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        totalTags++;
      }
    }
  }
  let folderTag = '未分类';
  if (totalTags > 0) {
    let maxCount = 0;
    for (const [tag, count] of Object.entries(tagCounts)) {
      if (count > maxCount) {
        maxCount = count;
        folderTag = tag;
      }
    }
  }

  // 格式化日期 YYYYMMDD
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const folderName = `${folderTag}-${dateStr}`;

  if (window.electronAPI?.photos?.copyToDesktopFolder) {
    try {
      const result = await window.electronAPI.photos.copyToDesktopFolder(filePaths, folderName);
      if (result.success) {
        if (result.failed > 0) {
          showToast(`已复制 ${result.copied} 张照片到桌面 ${folderName}，${result.failed} 张失败`, 'success');
        } else {
          showToast(`已复制 ${result.copied} 张照片到桌面 ${folderName}`, 'success');
        }
      } else {
        showToast('复制失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (e) {
      showToast('复制失败: ' + e, 'error');
    }
  } else {
    showToast('功能不可用', 'error');
  }
}

async function applyBatchTags() {
  if (selectedPhotos.size === 0 || batchTags.length === 0) return;

  const tagsToAdd = batchTags.length;
  showProgress('批量添加标签', `正在为 ${selectedPhotos.size} 张照片添加 ${tagsToAdd} 个标签...`, '');

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
    showToast(`已为 ${selectedPhotos.size} 张照片添加 ${tagsToAdd} 个标签`, 'success');
    await loadPhotos();
  } catch (e) {
    hideProgress();
    showToast('批量添加标签失败: ' + e, 'error');
  }
}

async function applyRemoveTags() {
  if (selectedPhotos.size === 0 || removeTags.length === 0) return;

  const tagsToRemove = removeTags.length;
  showProgress('批量移除标签', `正在从 ${selectedPhotos.size} 张照片移除 ${tagsToRemove} 个标签...`, '');

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
    showToast(`已从 ${selectedPhotos.size} 张照片移除 ${tagsToRemove} 个标签`, 'success');
  } catch (e) {
    hideProgress();
    showToast('批量移除标签失败: ' + e, 'error');
  }
}

async function exportSelectedToPdf() {
  if (selectedPhotos.size === 0) {
    showToast('请先选择要导出的照片', 'warning');
    return;
  }

  showProgress('导出PDF', '正在生成PDF...', '准备中');

  try {
    const { jsPDF } = window.jspdf;

    const selectedPhotoList = [];
    for (const id of selectedPhotos) {
      const photo = photos.find(p => p.id === id);
      if (photo) {
        selectedPhotoList.push(photo);
      }
    }

    let doc = null;

    for (let i = 0; i < selectedPhotoList.length; i++) {
      const photo = selectedPhotoList[i];
      updateProgress(((i + 1) / selectedPhotoList.length) * 100, `正在处理第 ${i + 1}/${selectedPhotoList.length} 张照片`);

      const imgData = await getImageData(photo.filepath || photo.thumbnail_path);

      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imgData;
      });

      const imgWidth = img.width;
      const imgHeight = img.height;

      const mmWidth = imgWidth * 0.264583;
      const mmHeight = imgHeight * 0.264583;

      if (i === 0) {
        const orientation = mmWidth > mmHeight ? 'landscape' : 'portrait';
        doc = new jsPDF({
          orientation: orientation,
          unit: 'mm',
          format: [mmWidth, mmHeight]
        });
      } else {
        doc.addPage([mmWidth, mmHeight], mmWidth > mmHeight ? 'landscape' : 'portrait');
      }

      doc.addImage(imgData, 'JPEG', 0, 0, mmWidth, mmHeight);
    }

    const pdfData = doc.output('datauristring');
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `照片集_${timestamp}_${Date.now()}.pdf`;

    if (window.electronAPI?.pdf?.saveToDesktop) {
      const result = await window.electronAPI.pdf.saveToDesktop(pdfData, filename);
      hideProgress();
      if (result.success) {
        showToast(`PDF已保存到桌面: ${filename}`, 'success');
      } else {
        showToast('保存PDF失败: ' + result.error, 'error');
      }
    }
  } catch (e) {
    hideProgress();
    showToast('导出PDF失败: ' + e, 'error');
  }
}

function getImageData(filePath) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = reject;
    img.src = filePath;
  });
}
