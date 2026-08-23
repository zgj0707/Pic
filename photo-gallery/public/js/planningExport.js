// Stage 4 planning exports: Moodboard and Shot List PDFs.
function planningExportSelections() {
  return Array.isArray(selectionTrayItems) ? selectionTrayItems.filter(selection => selection?.photo) : []
}

function planningExportShortText(value, fallback = '未填写') {
  const text = String(value || '').trim()
  return text || fallback
}

function planningExportSourceLabel(photo) {
  if (photo?.source_domain) return photo.source_domain
  if (photo?.source_type === 'web') return '网页样片'
  return '本地样片'
}

function planningExportStatusLabel(status) {
  return typeof shotStatusLabel === 'function' ? shotStatusLabel(status) : (status || '待拍摄')
}

function planningExportProjectDescription() {
  return window.PicState?.currentProject?.description || ''
}

function updateShotListExportStatus() {
  const status = document.getElementById('shotListExportStatus')
  if (!status) return
  const shots = planningExportShotItems()
  if (!shots.length) {
    status.textContent = '导出前会检查参考图可用性。'
    return
  }
  const unavailable = shots.filter(shot => shot.photo?.deleted_at || !(shot.photo?.filepath || shot.photo?.thumbnail_path)).length
  status.textContent = unavailable > 0
    ? `${shots.length} 个拍摄项 · ${unavailable} 个参考图位于回收站或缺少文件，导出时会保留警告`
    : `${shots.length} 个拍摄项 · 参考图均可读取`
}
async function recordPlanningExport(kind, targetPath, itemCount) {
  if (!window.electronAPI?.planningExports?.record || currentProjectId === null) return
  try {
    await window.electronAPI.planningExports.record(currentProjectId, kind, targetPath, itemCount)
  } catch (error) {
    console.warn('记录方案导出失败:', error)
  }
}

async function generatePlanningMoodboard() {
  const selections = planningExportSelections()
  if (!selections.length) {
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
    const margin = 10
    const cellWidth = 135
    const cellHeight = 56
    const imageHeight = 32
    const gapX = 7
    const gapY = 5
    const title = 'Pic Moodboard · ' + (typeof currentProjectName === 'string' ? currentProjectName : '')
    const description = planningExportProjectDescription()
    let missing = 0

    const drawHeader = () => {
      doc.setTextColor(35, 35, 35)
      doc.setFontSize(12)
      doc.text(title, margin, 9)
      if (description) {
        doc.setFontSize(6)
        doc.text(String(description), margin, 13, { maxWidth: pageWidth - margin * 2 })
      }
    }

    drawHeader()
    for (let index = 0; index < selections.length; index += 1) {
      const selection = selections[index]
      const photo = selection.photo
      const slot = index % 6
      if (index > 0 && slot === 0) {
        doc.addPage()
        drawHeader()
      }
      const column = slot % 2
      const row = Math.floor(slot / 2)
      const x = margin + column * (cellWidth + gapX)
      const y = 17 + row * (cellHeight + gapY)
      doc.setDrawColor(205, 205, 205)
      doc.setTextColor(35, 35, 35)
      doc.rect(x, y, cellWidth, imageHeight)
      try {
        const imageData = await deliveryImageData(photo.filepath || photo.thumbnail_path)
        doc.addImage(imageData, 'JPEG', x, y, cellWidth, imageHeight, undefined, 'FAST')
      } catch {
        missing += 1
        doc.setFontSize(7)
        doc.setTextColor(180, 70, 70)
        doc.text(photo.deleted_at ? '回收站中的参考样片' : '原图无法读取', x + 4, y + imageHeight / 2, { maxWidth: cellWidth - 8 })
        doc.setTextColor(35, 35, 35)
      }
      doc.setFontSize(6)
      doc.text(String(index + 1).padStart(2, '0') + '  ' + planningExportShortText(photo.filename, '未命名样片'), x, y + imageHeight + 5, { maxWidth: cellWidth })
      doc.text(planningExportShortText(selection.chapter, '未分组') + ' · ' + planningExportSourceLabel(photo), x, y + imageHeight + 10, { maxWidth: cellWidth })
      doc.text('备注：' + planningExportShortText(selection.note, '未填写'), x, y + imageHeight + 15, { maxWidth: cellWidth })
      doc.text('来源：' + planningExportShortText(photo.source_url, planningExportSourceLabel(photo)), x, y + imageHeight + 20, { maxWidth: cellWidth })
    }
    const pdfData = doc.output('datauristring')
    const filename = 'Pic-Moodboard_' + deliveryDateStamp() + '.pdf'
    const result = await window.electronAPI.pdf.saveToDesktop(pdfData, filename)
    if (result.success) {
      await recordPlanningExport('moodboard', result.data?.path || filename, selections.length - missing)
      showToast('Moodboard已保存到桌面' + (missing ? '，有 ' + missing + ' 张参考样片缺少可读取文件' : ''), missing ? 'warning' : 'success')
    } else {
      showToast('保存 Moodboard失败：' + (result.error || '未知错误'), 'error')
    }
  } catch (error) {
    showToast('生成 Moodboard失败：' + (error instanceof Error ? error.message : '未知错误'), 'error')
  } finally {
    if (button) button.disabled = false
  }
}

function planningExportShotItems() {
  return window.PicState?.shotListItems || []
}

async function generateShotListPdf() {
  const shots = planningExportShotItems()
  if (!shots.length) {
    showToast('请先从灵感板生成拍摄清单', 'warning')
    return
  }
  if (!window.jspdf?.jsPDF || !window.electronAPI?.pdf?.saveToDesktop) {
    showToast('当前环境不支持生成 Shot List PDF', 'error')
    return
  }
  const button = document.getElementById('shotListPdfBtn')
  if (button) button.disabled = true
  try {
    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = 210
    const margin = 12
    const cardHeight = 53
    const title = 'Pic Shot List · ' + (typeof currentProjectName === 'string' ? currentProjectName : '')
    const description = planningExportProjectDescription()
    let missing = 0

    const drawHeader = () => {
      doc.setTextColor(35, 35, 35)
      doc.setFontSize(15)
      doc.text(title, margin, 13)
      if (description) {
        doc.setFontSize(7)
        doc.text(String(description), margin, 18, { maxWidth: pageWidth - margin * 2 })
      }
      doc.setFontSize(7)
      doc.text(new Date().toLocaleDateString(), pageWidth - margin, 13, { align: 'right' })
    }

    drawHeader()
    for (let index = 0; index < shots.length; index += 1) {
      if (index > 0 && index % 4 === 0) {
        doc.addPage()
        drawHeader()
      }
      const shot = shots[index]
      const photo = shot.photo || {}
      const y = 24 + (index % 4) * cardHeight
      const imageX = margin
      const imageWidth = 60
      const imageHeight = 42
      doc.setDrawColor(205, 205, 205)
      doc.setTextColor(35, 35, 35)
      doc.rect(imageX, y, imageWidth, imageHeight)
      try {
        const imageData = await deliveryImageData(photo.filepath || photo.thumbnail_path)
        doc.addImage(imageData, 'JPEG', imageX, y, imageWidth, imageHeight, undefined, 'FAST')
      } catch {
        missing += 1
        doc.setFontSize(7)
        doc.setTextColor(180, 70, 70)
        doc.text(photo.deleted_at ? '回收站中的参考样片' : '原图无法读取', imageX + 3, y + 21, { maxWidth: imageWidth - 6 })
        doc.setTextColor(35, 35, 35)
      }
      doc.setFontSize(10)
      doc.text(String(index + 1).padStart(2, '0') + '  ' + planningExportShortText(shot.title, '未命名拍摄项'), 78, y + 5, { maxWidth: 120 })
      doc.setFontSize(7)
      doc.text('章节：' + planningExportShortText(shot.chapter, '未分组') + '    状态：' + planningExportStatusLabel(shot.status), 78, y + 11, { maxWidth: 120 })
      doc.text('意图：' + planningExportShortText(shot.intent), 78, y + 18, { maxWidth: 120 })
      doc.text('动作 / 构图：' + planningExportShortText(shot.composition_notes), 78, y + 26, { maxWidth: 120 })
      doc.text('灯光 / 器材：' + planningExportShortText(shot.lighting_gear_notes), 78, y + 34, { maxWidth: 120 })
      doc.rect(183, y + 38, 5, 5)
    }
    const pdfData = doc.output('datauristring')
    const filename = 'Pic-Shot-List_' + deliveryDateStamp() + '.pdf'
    const result = await window.electronAPI.pdf.saveToDesktop(pdfData, filename)
    if (result.success) {
      await recordPlanningExport('shot-list', result.data?.path || filename, shots.length - missing)
      showToast('Shot List 已保存到桌面' + (missing ? '，有 ' + missing + ' 个拍摄项缺少可读取参考图' : ''), missing ? 'warning' : 'success')
    } else {
      showToast('保存 Shot List 失败：' + (result.error || '未知错误'), 'error')
    }
  } catch (error) {
    showToast('生成 Shot List 失败：' + (error instanceof Error ? error.message : '未知错误'), 'error')
  } finally {
    if (button) button.disabled = false
  }
}

document.getElementById('shotListPdfBtn')?.addEventListener('click', () => { void generateShotListPdf() })
window.updateShotListExportStatus = updateShotListExportStatus
PicEvents?.on('project:selected', () => updateShotListExportStatus())
updateShotListExportStatus()