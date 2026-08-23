import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const publicRoot = join(process.cwd(), 'public')
const gridSource = readFileSync(join(publicRoot, 'js', 'grid.js'), 'utf8')
const selectionTraySource = readFileSync(join(publicRoot, 'js', 'selectionTray.js'), 'utf8')
const batchSource = readFileSync(join(publicRoot, 'js', 'batch.js'), 'utf8')
const appSource = readFileSync(join(publicRoot, 'js', 'app.js'), 'utf8')
const htmlSource = readFileSync(join(publicRoot, 'index.html'), 'utf8')

describe('UI/UX refactor guardrails', () => {
  it('keeps paged data loading and virtual grid rendering for large projects', () => {
    expect(appSource).toContain('const PAGE_SIZE = 200')
    expect(appSource).toContain('async function loadMorePhotos')
    expect(gridSource).toContain('function renderVisibleGridItems')
    expect(gridSource).toContain('requestAnimationFrame')
    expect(gridSource).toContain('isVirtualScrollEnabled = true')
  })

  it('updates selection-tray indicators without rebuilding the photo grid', () => {
    expect(selectionTraySource).toContain('refreshGridSelectionTrayIndicators')
    expect(selectionTraySource).not.toContain('photoGrid.innerHTML')
    expect(selectionTraySource).not.toContain('renderPhotoGrid(')
  })

  it('keeps desktop folder export as the single visible result action', () => {
    expect(htmlSource).toContain('id="copyToDesktopBtn"')
    expect(htmlSource).toContain('<span>保存到桌面</span>')
    expect(batchSource).toContain('copySelectedToDesktop')
    expect(batchSource).toContain('copyToDesktopFolder')
    expect(htmlSource).not.toContain('exportPdfBtn')
    expect(htmlSource).not.toContain('deliveryModeBtn')
    expect(htmlSource).not.toContain('shotListWorkspace')
    expect(htmlSource).not.toContain('deliveryWorkspace')
    expect(htmlSource).not.toContain('planningExport.js')
  })

  it('exposes comparison, keyboard and reduced-motion hooks for the core workflow', () => {
    expect(htmlSource).toContain('id="selectionCompareBtn"')
    expect(selectionTraySource).toContain('updateSelectionTrayMeta')
    expect(htmlSource).toContain('aria-label="关闭样片详情"')
    const tokens = readFileSync(join(publicRoot, 'styles', 'tokens.css'), 'utf8')
    expect(tokens).toContain(':focus-visible')
    expect(tokens).toContain('prefers-reduced-motion: reduce')
  })
})