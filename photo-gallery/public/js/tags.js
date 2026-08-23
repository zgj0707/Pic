// 标签管理相关函数
// 与 app.js / grid.js 共享全局状态变量

async function updateTagFilter() {
  const select = document.getElementById('tagFilter');
  select.innerHTML = '<option value="">全部标签</option>';
  let tags = [];
  if (window.electronAPI) {
    try {
      const allTags = await window.electronAPI.tags.getAll();
      tags = allTags.map(t => t.name).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    } catch (e) {
      console.error('加载标签失败:', e);
    }
  } else {
    tags = [...new Set(photos.flatMap(p => p.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }
  tags.forEach(tag => { const opt = document.createElement('option'); opt.value = tag; opt.textContent = tag; select.appendChild(opt); });
  // 恢复当前选中的标签
  if (photoFilterState.tag) select.value = photoFilterState.tag;

  const existingTags = document.getElementById('existingTags');
  existingTags.innerHTML = tags.map(tag => `<span class="tag-badge cursor-pointer hover:bg-accent/30" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('');

  existingTags.querySelectorAll('[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      if (!batchTags.includes(tag)) {
        addBatchTag(tag);
      }
    });
  });
}

function renderReferenceCategoryPresets(currentTags = []) {
  const container = document.getElementById('referenceCategoryPresets');
  if (!container) return;
  container.innerHTML = REFERENCE_CATEGORY_PRESETS.map(preset => `
    <button type="button" class="tag-badge cursor-pointer hover:bg-accent/30 ${currentTags.includes(preset.tag) ? 'opacity-40' : ''}" data-reference-tag="${escapeHtml(preset.tag)}" ${currentTags.includes(preset.tag) ? 'disabled' : ''}>${escapeHtml(preset.label)}</button>
  `).join('');
  container.querySelectorAll('[data-reference-tag]').forEach(button => {
    button.addEventListener('click', () => {
      document.getElementById('tagInputField').value = button.dataset.referenceTag || '';
      document.getElementById('tagInputField').focus();
    });
  });
}

async function handleAddTag() {
  if (filteredPhotos.length === 0) {
    showToast('没有可操作的样片', 'warning');
    return;
  }

  // 优先使用选中的样片，如果有多个选中则使用第一个
  let targetPhoto = null;
  if (selectedPhotos.size > 0) {
    const firstSelectedId = Array.from(selectedPhotos)[0];
    targetPhoto = filteredPhotos.find(p => p.id === firstSelectedId);
    if (!targetPhoto) {
      targetPhoto = photos.find(p => p.id === firstSelectedId);
    }
  }

  // 如果没有选中的样片，使用 currentPhotoIndex 指向的样片
  if (!targetPhoto) {
    if (currentPhotoIndex >= filteredPhotos.length) {
      currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
    }
    targetPhoto = filteredPhotos[currentPhotoIndex];
  }

  if (!targetPhoto) {
    showToast('无法获取当前样片信息', 'error');
    return;
  }

  const fullPhoto = photos.find(p => p.id === targetPhoto.id);
  if (!fullPhoto) {
    showToast('样片数据已失效，请刷新后重试', 'error');
    await loadPhotos();
    return;
  }

  // 更新 currentPhotoIndex 到目标样片
  const targetIndex = filteredPhotos.findIndex(p => p.id === targetPhoto.id);
  if (targetIndex > -1) {
    currentPhotoIndex = targetIndex;
  }

  const usedTags = document.getElementById('usedTagsList');
  renderReferenceCategoryPresets(fullPhoto.tags || []);
  const allTags = [...new Set(photos.flatMap(p => p.tags || []))].sort();
  usedTags.innerHTML = allTags.filter(t => !(fullPhoto.tags || []).includes(t)).map(tag =>
    `<span class="tag-badge cursor-pointer hover:bg-accent/30" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`
  ).join('') || '<span class="text-textDisabled text-sm">没有可用标签</span>';

  usedTags.querySelectorAll('[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      document.getElementById('tagInputField').value = tag;
    });
  });

  document.getElementById('tagInputField').value = '';
  document.getElementById('tagInputModal').classList.remove('hidden');
  document.getElementById('tagInputField').focus();
}

async function confirmAddTag() {
  const tagName = document.getElementById('tagInputField').value.trim();
  if (!tagName) {
    showToast('请输入标签名称', 'warning');
    return;
  }

  if (filteredPhotos.length === 0) {
    showToast('没有可操作的样片', 'warning');
    document.getElementById('tagInputModal').classList.add('hidden');
    return;
  }

  // 使用与 handleAddTag 相同的逻辑找到目标样片
  let targetPhoto = null;
  if (selectedPhotos.size > 0) {
    const firstSelectedId = Array.from(selectedPhotos)[0];
    targetPhoto = filteredPhotos.find(p => p.id === firstSelectedId);
    if (!targetPhoto) {
      targetPhoto = photos.find(p => p.id === firstSelectedId);
    }
  }

  if (!targetPhoto) {
    if (currentPhotoIndex >= filteredPhotos.length) {
      currentPhotoIndex = Math.max(0, filteredPhotos.length - 1);
    }
    targetPhoto = filteredPhotos[currentPhotoIndex];
  }

  if (!targetPhoto) {
    showToast('无法获取当前样片信息', 'error');
    document.getElementById('tagInputModal').classList.add('hidden');
    return;
  }

  const fullPhoto = photos.find(p => p.id === targetPhoto.id);
  if (!fullPhoto) {
    showToast('样片数据已失效，请刷新后重试', 'error');
    document.getElementById('tagInputModal').classList.add('hidden');
    await loadPhotos();
    return;
  }

  // 更新 currentPhotoIndex 到目标样片
  const targetIndex = filteredPhotos.findIndex(p => p.id === targetPhoto.id);
  if (targetIndex > -1) {
    currentPhotoIndex = targetIndex;
  }

  const uniqueTags = Array.from(new Set([...(fullPhoto.tags || []), tagName]));
  // 必须 await 两个写入，否则 loadPhotos 可能在写入完成前读取，导致标签不显示（竞态）
  if (window.electronAPI?.photos.updateTags) {
    await window.electronAPI.photos.updateTags(fullPhoto.id, uniqueTags);
  }
  if (fullPhoto.filepath && window.electronAPI?.exif.writeTags) {
    await window.electronAPI.exif.writeTags(fullPhoto.filepath, uniqueTags);
  }
  fullPhoto.tags = uniqueTags;

  document.getElementById('tagInputModal').classList.add('hidden');
  await loadPhotos();
  showToast(`标签 "${tagName}" 添加成功`, 'success');
}

function renderRemoveTags() {
  const container = document.getElementById('removeTags');
  container.innerHTML = removeTags.map((tag, idx) =>
    `<span class="tag-badge bg-red-600/30" data-idx="${idx}">
      ${escapeHtml(tag)}
      <button class="ml-1 hover:text-red-400 remove-tag-btn"><i class="fa-solid fa-xmark text-xs"></i></button>
    </span>`
  ).join('');

  container.querySelectorAll('.remove-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.closest('[data-idx]').dataset.idx);
      removeTags.splice(idx, 1);
      renderRemoveTags();
    });
  });

  updateApplyButtons();
}
