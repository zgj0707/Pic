let deliveryTargetDir = localStorage.getItem('deliveryTargetDir') || ''
let deliveryFolderPath = ''
let deliveryLastResult = null

function deliveryDateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

function deliveryCurrentFolderName() {
  const projectName = typeof currentProjectName === 'string' && currentProjectName ? currentProjectName : 'Pic'
  return projectName + '-拍摄方案-' + deliveryDateStamp()
}

function deliverySafeExtension(photo) {
  const filename = String(photo?.filename || photo?.filepath || '')
  const match = filename.match(/\.[^./\\]{1,12}$/)
  return match ? match[0] : '.jpg'
}

function deliveryFilename(photo, index) {
  const prefix = document.getElementById('deliveryPrefix')?.value.trim() || 'PIC-'
  return prefix + String(index + 1).padStart(3, '0') + deliverySafeExtension(photo)
}

function deliveryItems() {
  return Array.isArray(selectionTrayItems) ? selectionTrayItems.map(selection => selection.photo).filter(Boolean) : []
}

function deliveryWarnings(items) {
  const warnings = []
  const paths = new Map()
  items.forEach(photo => {
    if (photo.deleted_at) warnings.push((photo.filename || '未命名') + ' 位于回收站，导出时会跳过')
    if (!photo.filepath) warnings.push((photo.filename || '未命名') + ' 没有关联原图路径')
    const filepath = photo.filepath || ''
    if (filepath) {
      const count = (paths.get(filepath) || 0) + 1
      paths.set(filepath, count)
      if (count === 2) warnings.push((photo.filename || '未命名') + ' 与另一张参考样片使用相同原图路径')
    }
  })
  return warnings
}

function renderDeliveryWorkspace() {
  const items = deliveryItems()
  const targetInput = document.getElementById('deliveryTargetDir')
  const folderInput = document.getElementById('deliveryFolderName')
  const prefixInput = document.getElementById('deliveryPrefix')
  if (targetInput) targetInput.value = deliveryTargetDir
  if (folderInput && !folderInput.value) folderInput.value = deliveryCurrentFolderName()
  if (prefixInput && !prefixInput.value) prefixInput.value = 'PIC-'

  const summary = document.getElementById('deliverySummary')
  if (summary) summary.textContent = items.length + ' 张参考样片 · 按灵感板顺序复制并重命名，原图保持不变'
  const count = document.getElementById('deliveryPreviewCount')
  if (count) count.textContent = items.length + ' 个文件'
  const warnings = document.getElementById('deliveryWarnings')
  const warningItems = deliveryWarnings(items)
  if (warnings) {
    warnings.classList.toggle('hidden', warningItems.length === 0)
    warnings.innerHTML = warningItems.length
      ? '<strong>生成方案前请确认</strong><ul>' + warningItems.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
      : ''
  }

  const list = document.getElementById('deliveryPreviewList')
  if (list) {
    list.innerHTML = items.length
      ? items.map((photo, index) => {
        const deleted = photo.deleted_at ? ' is-deleted' : ''
        return '<article class="delivery-preview-item' + deleted + '">' +
          '<span class="delivery-preview-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<div class="delivery-preview-thumb"><img src="' + escapeHtml(photo.thumbnail_path || photo.filepath || '') + '" alt=""></div>' +
          '<div class="delivery-preview-source"><strong title="' + escapeHtml(photo.filename || '') + '">' + escapeHtml(photo.filename || '未命名') + '</strong><span>' + escapeHtml(photo.filepath || '无原图路径') + '</span></div>' +
          '<div class="delivery-preview-target"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i><strong>' + escapeHtml(deliveryFilename(photo, index)) + '</strong><span>' + escapeHtml((folderInput?.value || '方案目录')) + '</span></div>' +
          '</article>'
      }).join('')
      : '<div class="delivery-empty">灵感板为空，请先从图库或初筛中加入参考样片。</div>'
  }

  const exportButton = document.getElementById('deliveryExportBtn')
  if (exportButton) exportButton.disabled = items.length === 0 || !deliveryTargetDir
  const contactButton = document.getElementById('deliveryContactSheetBtn')
  if (contactButton) contactButton.disabled = items.length === 0
  const openButton = document.getElementById('deliveryOpenFolderBtn')
  if (openButton) openButton.disabled = !deliveryFolderPath
}

function deliveryShowResult(result) {
  const box = document.getElementById('deliveryResult')
  if (!box) return
  const failed = result.results?.filter(item => !item.success) || []
  box.classList.remove('hidden')
  box.classList.toggle('is-error', failed.length > 0)
  box.innerHTML = '<strong>' + (result.success ? '方案已生成' : '方案已生成但存在失败文件') + '</strong>' +
    '<span>成功复制 ' + (result.copied || 0) + ' 个，失败 ' + (result.failed || 0) + ' 个。</span>' +
    (result.folderPath ? '<span>方案目录：' + escapeHtml(result.folderPath) + '</span>' : '') +
    (failed.length ? '<ul>' + failed.map(item => '<li>' + escapeHtml(item.filename) + '：' + escapeHtml(item.error || '复制失败') + '</li>').join('') + '</ul>' : '')
}

async function chooseDeliveryDirectory() {
  if (!window.electronAPI?.dialog?.openDirectory) {
    showToast('当前环境不支持选择目录', 'error')
    return
  }
  const selected = await window.electronAPI.dialog.openDirectory()
  if (selected) {
    deliveryTargetDir = selected
    localStorage.setItem('deliveryTargetDir', selected)
    renderDeliveryWorkspace()
  }
}

async function exportDelivery() {
  const items = deliveryItems()
  const folderName = document.getElementById('deliveryFolderName')?.value.trim() || deliveryCurrentFolderName()
  const prefix = document.getElementById('deliveryPrefix')?.value.trim() || 'PIC-'
  if (!deliveryTargetDir || !items.length || currentProjectId === null) {
    showToast('请先选择目标目录并确认灵感板不为空', 'warning')
    return
  }
  const expected = deliveryTargetDir + '\\' + folderName
  const confirmed = window.confirm('将创建方案目录：' + expected + '\n复制并重命名 ' + items.length + ' 个文件，原图不会被修改。继续吗？')
  if (!confirmed) return
  const button = document.getElementById('deliveryExportBtn')
  if (button) button.disabled = true
  try {
    const result = await window.electronAPI.delivery.export(currentProjectId, selectionTrayIds.slice(), deliveryTargetDir, folderName, prefix)
    deliveryLastResult = result
    deliveryFolderPath = result.folderPath || ''
    renderDeliveryWorkspace()
    deliveryShowResult(result)
    if (result.success) showToast('方案已生成：已复制 ' + result.copied + ' 个文件', 'success')
    else showToast('方案部分生成：有 ' + result.failed + ' 个文件失败', 'warning')
  } catch (error) {
    showToast('方案失败：' + (error instanceof Error ? error.message : '未知错误'), 'error')
  } finally {
    if (button) button.disabled = false
    renderDeliveryWorkspace()
  }
}

function deliveryImageData(filePath) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('无法创建图片画布'))
        return
      }
      context.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => reject(new Error('图片无法读取'))
    image.src = filePath
  })
}

async function generateDeliveryContactSheet() {
  const items = deliveryItems()
  if (!items.length) {
    showToast('请先加入参考样片', 'warning')
    return
  }
  if (!window.jspdf?.jsPDF || !window.electronAPI?.pdf?.saveToDesktop) {
    showToast('当前环境不支持生成 Moodboard', 'error')
    return
  }
  const button = document.getElementById('deliveryContactSheetBtn')
  if (button) button.disabled = true
  try {
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = 297
    const pageHeight = 210
    const margin = 10
    const cellWidth = 135
    const cellHeight = 57
    const gapX = 7
    const gapY = 8
    const title = 'Pic Moodboard · ' + (typeof currentProjectName === 'string' ? currentProjectName : '')
    let placed = 0
    let skipped = 0
    for (let index = 0; index < items.length; index += 1) {
      const photo = items[index]
      if (placed > 0 && placed % 6 === 0) doc.addPage()
      const slot = placed % 6
      const column = slot % 2
      const row = Math.floor(slot / 2)
      const x = margin + column * (cellWidth + gapX)
      const y = margin + 10 + row * (cellHeight + gapY)
      try {
        const data = await deliveryImageData(photo.filepath || photo.thumbnail_path)
        if (slot === 0) doc.setFontSize(12)
        doc.addImage(data, 'JPEG', x, y, cellWidth, cellHeight - 9, undefined, 'FAST')
        doc.setFontSize(8)
        doc.text(String(index + 1).padStart(2, '0') + '  ' + (photo.filename || '未命名'), x, y + cellHeight - 4, { maxWidth: cellWidth })
        if (slot === 0) {
          doc.setFontSize(12)
          doc.text(title, margin, 10)
        }
        placed += 1
      } catch {
        skipped += 1
      }
    }
    if (placed === 0) throw new Error('没有可读取的样片')
    const pdfData = doc.output('datauristring')
    const filename = 'Pic-Moodboard_' + deliveryDateStamp() + '.pdf'
    const result = await window.electronAPI.pdf.saveToDesktop(pdfData, filename)
    if (result.success) showToast('Moodboard已保存到桌面' + (skipped ? '，跳过 ' + skipped + ' 张无法读取的样片' : ''), 'success')
    else showToast('保存 Moodboard失败：' + (result.error || '未知错误'), 'error')
  } catch (error) {
    showToast('生成 Moodboard失败：' + (error instanceof Error ? error.message : '未知错误'), 'error')
  } finally {
    if (button) button.disabled = false
  }
}

async function openDeliveryWorkspace() {
  if (!selectionTrayItems.length) {
    showToast('请先加入至少 1 张参考样片', 'warning')
    return
  }
  if (typeof cullingMode !== 'undefined') cullingMode = false
  document.getElementById('galleryPanel')?.classList.add('hidden')
  document.getElementById('cullingWorkspace')?.classList.add('hidden')
  document.getElementById('compareWorkspace')?.classList.add('hidden')
  document.getElementById('shotListWorkspace')?.classList.add('hidden')
  document.querySelector('.filter-bar')?.classList.add('hidden')
  document.getElementById('deliveryWorkspace')?.classList.remove('hidden')
  document.getElementById('statusView')?.replaceChildren(document.createTextNode('方案工作区'))
  currentPanel = 'delivery'
  renderDeliveryWorkspace()
}

async function closeDeliveryWorkspace() {
  document.getElementById('deliveryWorkspace')?.classList.add('hidden')
  document.getElementById('galleryPanel')?.classList.remove('hidden')
  document.querySelector('.filter-bar')?.classList.remove('hidden')
  currentPanel = 'gallery'
  document.getElementById('statusView')?.replaceChildren(document.createTextNode(currentViewMode === 'compact' ? '紧凑视图' : '瀑布流'))
  if (window.electronAPI && typeof loadPhotos === 'function') await loadPhotos(true)
}

function bindDeliveryEvents() {
  document.getElementById('deliveryModeBtn')?.addEventListener('click', () => { void openDeliveryWorkspace() })
  document.getElementById('deliveryBtn')?.addEventListener('click', () => { void openDeliveryWorkspace() })
  document.getElementById('deliveryExitBtn')?.addEventListener('click', () => { void closeDeliveryWorkspace() })
  document.getElementById('deliveryChooseDirBtn')?.addEventListener('click', () => { void chooseDeliveryDirectory() })
  document.getElementById('deliveryExportBtn')?.addEventListener('click', () => { void exportDelivery() })
  document.getElementById('deliveryContactSheetBtn')?.addEventListener('click', () => { void generateDeliveryContactSheet() })
  document.getElementById('deliveryOpenFolderBtn')?.addEventListener('click', async () => {
    if (deliveryFolderPath) await window.electronAPI.delivery.openFolder(deliveryFolderPath)
  })
  ;['deliveryFolderName', 'deliveryPrefix'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderDeliveryWorkspace)
  })
  PicEvents?.on('project:selected', () => {
    deliveryFolderPath = ''
    deliveryLastResult = null
  })
}

bindDeliveryEvents()