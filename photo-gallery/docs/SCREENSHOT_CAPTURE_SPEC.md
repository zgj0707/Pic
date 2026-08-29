# Pic 微信式智能截图 Spec

> 文档状态：Draft
>
> 适用平台：Windows / Electron
>
> Spec 版本：1.0
>
> 编写日期：2026-08-28

## 1. 背景

Pic 已具备全局 `Alt+A` 截图入口、截图编辑器、素材库导入和剪贴板复制能力，但当前截图启动过程仍然是：

```text
按下 Alt+A
→ 创建截图 BrowserWindow
→ 加载 screenshot-overlay.html
→ 渲染器请求截图配置
→ 渲染器请求显示器截图
→ Image 解码
→ 显示遮罩层
```

这会带来两个体验问题：

- 截图响应有短暂停顿，遮罩层出现时比较突兀。
- 当前默认根据鼠标所在显示器截图，用户仍需手动框选焦点窗口。

本 Spec 将“焦点窗口优先选择”和“无感快速响应”合并为一套完整的截图体验：用户按下 `Alt+A` 后，Pic 在不打断当前操作的情况下冻结当前桌面，自动识别并选中当前前台窗口，用户可以直接完成，也可以继续调整选区。

## 2. 产品目标

### 2.1 必须实现

- `Alt+A` 继续作为唯一截图快捷键。
- 软件未获得焦点时，`Alt+A` 仍然可以触发截图。
- 截图触发瞬间读取 Windows 当前前台窗口。
- 默认自动选择前台窗口区域。
- 前台窗口识别失败时回退到普通区域截图。
- 遮罩层出现前完成屏幕快照，避免先出现空白、黑屏或旧画面。
- 截图底图出现后直接进入可操作状态，不显示中间加载状态。
- 用户可以覆盖自动选区，重新拖动选择任意区域。
- 完成后同时将 PNG 导入当前 Pic 项目素材库，并将同一张 PNG 写入系统剪贴板。
- 取消时不导入素材、不覆盖剪贴板。
- 继续支持现有标注工具、撤销、重做和编辑流程。

### 2.2 体验目标

| 指标 | 目标 |
| --- | ---: |
| `Alt+A` 到开始处理 | < 10 ms |
| 读取前台窗口信息 | < 20 ms |
| 屏幕捕获完成 | 50–120 ms |
| 遮罩层显示 | ≤ 150 ms |
| 自动选区可见 | ≤ 200 ms |
| 空白窗口或黑屏闪现 | 0 次 |
| 截图过程中遮罩层淡入/缩放动画 | 0 次 |

### 2.3 非目标

本期不要求：

- 滚动长截图。
- 浏览器网页 DOM 截图。
- DRM、受保护视频或安全桌面的绕过。
- 跨显示器虚拟桌面拼接。
- 自动上传、OCR、AI 识别或云端处理。
- 将可执行安装包提交到源码 PR。

## 3. 当前实现

当前相关代码：

- [`electron/services/screenCapture.ts`](../electron/services/screenCapture.ts)
  - `beginCapture()` 当前通过鼠标位置选择显示器。
  - `capture:get-screen` 当前获取整块显示器截图。
  - 全局快捷键已经使用 `globalShortcut.register('Alt+A')`。
  - 现有 IPC 已验证调用方为截图遮罩层。
- [`public/screenshot-overlay.html`](../public/screenshot-overlay.html)
  - 当前页面加载后再请求截图配置和截图数据。
  - 当前首次选区由用户拖动产生。
  - 当前编辑、复制、取消和完成导入流程可复用。
- [`electron/preload.ts`](../electron/preload.ts)
  - 当前已暴露截图、取消、保存、复制和快捷键状态接口。

本期不重写现有编辑器和素材库导入链路，重点改造截图会话的准备和初始选区。

## 4. 目标用户流程

```text
Pic 启动
  ↓
后台预加载隐藏的截图遮罩层
  ↓
用户在 Chrome / 文件管理器 / Pic 等窗口中按 Alt+A
  ↓
主进程立即读取前台窗口句柄和窗口边界
  ↓
主进程捕获前台窗口所在显示器的完整画面
  ↓
主进程计算窗口相对当前显示器的初始选区
  ↓
遮罩层收到截图和选区，并在隐藏状态完成绘制
  ↓
遮罩层一次性显示：全屏暗化，焦点窗口保持高亮
  ↓
用户直接完成，或拖动调整选区
  ↓
进入现有编辑器
  ↓
完成：导入素材库 + 复制剪贴板
```

## 5. 交互规范

### 5.1 快捷键触发

- `Alt+A` 是唯一默认截图快捷键。
- 触发时先记录当前前台窗口，再创建或显示截图遮罩层。
- 截图准备中再次按 `Alt+A`：忽略重复触发，避免多窗口和多会话。
- 截图编辑中再次按 `Alt+A`：不创建新会话，仅保持当前编辑状态。
- `Esc` 按优先级处理：关闭文字输入/工具状态 → 取消当前选区操作 → 取消截图会话。
- `Enter` 确认当前选区并进入编辑器。

### 5.2 自动选区

识别到有效前台窗口时：

- 默认选中窗口可见区域。
- 选区边框立即显示。
- 选区外显示半透明暗化层。
- 选区内保持原始亮度。
- 显示宽度 × 高度提示。
- 提示文案为“已自动选择当前窗口，可拖动调整区域”。

用户在其他位置按下鼠标并拖动时，自动选区被替换为普通手动选区，仍然使用现有的拖动、尺寸提示和编辑流程。

### 5.3 焦点为 Pic 自身时

默认规则：如果按下 `Alt+A` 时 Pic 主窗口是前台窗口，则自动选择 Pic 主窗口。

如果未来需要“从 Pic 触发时自动截取 Pic 背后的窗口”，另行增加“忽略 Pic 自身窗口”设置。本期不改变默认语义，避免用户无法截图 Pic 自己的界面。

### 5.4 完成和取消

- 完成按钮沿用现有流程。
- 完成时将最终编辑结果编码为 PNG。
- 主进程负责写入剪贴板和素材库。
- 复制按钮只复制，不创建素材。
- 取消不会写文件，不写数据库，不修改剪贴板。

## 6. 技术架构

### 6.1 模块划分

新增：

```text
electron/services/foregroundWindow.ts
```

职责：

- 读取 Windows 当前前台窗口。
- 读取窗口可见边界和所属进程。
- 过滤无效、隐藏、最小化和系统壳层窗口。
- 将 Windows 坐标转换为截图流程可用的安全数据。

修改：

```text
electron/services/screenCapture.ts
electron/preload.ts
public/screenshot-overlay.html
tests/services/foregroundWindow.test.ts
tests/services/screenCapture.test.ts
tests/uiux/performance.static.test.ts
```

### 6.2 截图会话状态

```ts
type CaptureState =
  | 'idle'
  | 'preparing'
  | 'visible'
  | 'selecting'
  | 'editing'
  | 'saving'
```

每次截图生成一个 `sessionId`，主进程和渲染器只处理当前会话的数据。旧会话的异步结果不得覆盖新会话。

### 6.3 前台窗口数据结构

```ts
interface ForegroundWindowSnapshot {
  hwnd: string
  processId: number | null
  title: string
  bounds: {
    left: number
    top: number
    right: number
    bottom: number
  }
  visible: boolean
  minimized: boolean
  displayId: string | null
  valid: boolean
  invalidReason?: string
}
```

渲染器不接收也不决定 `hwnd`，只接收经过主进程校验的选区矩形。

### 6.4 截图会话数据结构

```ts
interface CaptureSession {
  sessionId: string
  displayId: string
  physicalWidth: number
  physicalHeight: number
  imageData: Uint8Array
  initialSelection: {
    left: number
    top: number
    width: number
    height: number
  } | null
  selectionSource: 'foreground-window' | 'screen-fallback'
}
```

建议将目前的 Base64 Data URL 改为 `Uint8Array` 或 `ArrayBuffer`，减少 Base64 体积膨胀、字符串复制和 Data URL 解析开销。

渲染器使用 `Blob` 和 `createImageBitmap()` 解码：

```js
const bitmap = await createImageBitmap(
  new Blob([imageData], { type: 'image/png' })
)
context.drawImage(bitmap, 0, 0)
```

## 7. Windows 前台窗口识别

### 7.1 识别顺序

1. 调用 `GetForegroundWindow()` 获取当前前台窗口句柄。
2. 使用 `GetAncestor(hwnd, GA_ROOT)` 归并子窗口和拥有的弹窗。
3. 使用 `IsWindowVisible()` 检查窗口可见性。
4. 使用 `IsIconic()` 排除最小化窗口。
5. 使用 `GetWindowThreadProcessId()` 获取进程信息。
6. 使用 `DwmGetWindowAttribute(..., DWMWA_EXTENDED_FRAME_BOUNDS)` 获取可见窗口边界。
7. 使用 `screen.getDisplayMatching(bounds)` 选择窗口主要所在显示器。
8. 将窗口边界转换为当前显示器内部坐标。

Windows 官方定义 `GetForegroundWindow()` 为获取用户当前正在使用的前台窗口句柄；`GetWindowRect()` 返回窗口在屏幕坐标系中的边界。DWM 扩展边界用于减少不可见缩放边框被包含在截图中的情况。

### 7.2 无效窗口过滤

以下情况不进行自动选区，回退到普通区域截图：

- 句柄为空或窗口已经失效。
- 窗口不可见或最小化。
- 窗口是桌面、任务栏或系统壳层。
- 窗口边界无法取得或宽高小于最小截图尺寸。
- 窗口无法映射到当前显示器。
- 系统处于安全桌面或捕获结果为空。
- 前台窗口已经是 Pic 截图遮罩层。

### 7.3 不采用 PowerShell 作为默认热路径

每次按下快捷键启动 PowerShell 会引入进程启动和脚本编译延迟，容易破坏“无感快速响应”。生产实现优先采用直接 Win32 bridge；PowerShell 只作为开发诊断或异常回退方案。

如果直接引入原生 Node 模块，需要同步验证 Electron ABI、`npm install` 和 `electron-builder` 打包流程；不能依赖开发机已有的本地编译产物。

## 8. 截图与遮罩层时序

### 8.1 预热

应用启动完成后：

- 创建一个隐藏的截图 BrowserWindow。
- 加载 `screenshot-overlay.html` 一次。
- 建立 preload IPC 通道。
- 保持窗口隐藏，不显示任务栏图标。
- 取消或完成后只隐藏并重置会话，不销毁窗口。
- 应用退出时统一销毁。

### 8.2 热键路径

```ts
async function beginCapture(): Promise<void> {
  if (captureState !== 'idle') return

  captureState = 'preparing'
  const sessionId = createSessionId()
  const foreground = getForegroundWindowSnapshot()
  const display = chooseDisplay(foreground)
  const screenshot = await captureDisplay(display)
  const initialSelection = calculateInitialSelection(foreground, display)

  sendCaptureSession({
    sessionId,
    display,
    screenshot,
    initialSelection
  })

  await waitForOverlayRender(sessionId)
  overlayWindow.show()
  overlayWindow.focus()
  captureState = 'visible'
}
```

遮罩层必须在底图和初始选区绘制完成后才显示。窗口可以继续使用 `show: false`、透明背景、置顶和无边框配置，避免 `about:blank` 或中间页面闪现。

### 8.3 底图策略

推荐保留“整块显示器底图 + 自动选区”策略，而不是第一版直接只捕获窗口源：

- 用户仍可以扩大选区到窗口外。
- 可以重新选择任意区域。
- 保留桌面合成、阴影和浮层信息。
- 最大程度复用当前裁剪和编辑流程。
- 受保护窗口失败时仍可以给出统一回退提示。

窗口源直接捕获可以作为后续“只截取活动窗口”模式，不作为本期默认路径。

## 9. 多显示器与 DPI

### 9.1 坐标类型

必须明确区分三套坐标：

```text
Windows 前台窗口坐标：屏幕坐标
Electron BrowserWindow 坐标：DIP
截图图片坐标：物理像素
```

转换过程：

```text
Windows 窗口边界
  ↓
转换为 Electron DIP
  ↓
减去当前 display.bounds 的 x / y
  ↓
转换为截图图片物理像素
```

Electron 的显示器 `bounds` 和鼠标位置使用 DIP，而 `desktopCapturer` 返回的图像实际尺寸可能受显示器缩放影响，因此必须以返回图像的真实宽高计算最终裁剪比例。

### 9.2 显示器选择

- 优先使用前台窗口边界选择显示器。
- 使用 `screen.getDisplayMatching(windowBounds)`。
- 前台窗口跨显示器时，选择相交面积最大的显示器。
- 第一版将窗口边界裁剪到目标显示器范围内。
- 如果前台窗口识别失败，再使用鼠标位置选择显示器。
- 如果鼠标位置也不可用，使用主显示器。

### 9.3 验证矩阵

- 单显示器 100% DPI。
- 单显示器 125% DPI。
- 单显示器 150% DPI。
- 双显示器，缩放比例不同。
- 右侧显示器坐标为正值。
- 左侧显示器坐标为负值。
- 前台窗口跨两个显示器。
- 最大化、贴边和部分超出屏幕的窗口。

## 10. 快速响应和无感显示

### 10.1 必做优化

- 复用预热后的截图 BrowserWindow。
- 前台窗口识别放在主进程热路径最前面。
- 截图在遮罩层显示前完成。
- 主进程一次性发送截图和初始选区。
- 使用二进制图片数据，避免 Base64。
- 使用 `createImageBitmap()` 解码。
- 遮罩层关闭后隐藏并重置，不销毁。
- 禁用截图遮罩层的淡入、缩放和布局动画。
- `fetchWindowIcons: false`，不请求无关窗口图标。
- 为截图会话增加超时和取消机制。

### 10.2 视觉优化

- 整屏立即暗化。
- 自动选区保持原始亮度。
- 选区边框、控制点和尺寸提示同步出现。
- 工具栏根据选区位置自动避让屏幕边缘。
- 不显示“正在加载截图”的中间页面。
- 不在截图页面加载后再显示旧底图。

### 10.3 性能埋点

开发模式记录以下时间点：

```text
capture:start
foreground-window:ready
display-selected
screen-captured
session-sent
overlay-rendered
overlay-shown
```

正式版只保留失败和超时日志，不记录窗口标题、进程路径等可能包含隐私的信息。

## 11. 回退和错误处理

| 场景 | 行为 |
| --- | --- |
| 前台窗口识别成功 | 自动选中前台窗口 |
| 前台窗口句柄为空 | 使用鼠标所在显示器，等待手动拖选 |
| 窗口已最小化 | 使用鼠标所在显示器，等待手动拖选 |
| 前台为桌面/任务栏 | 使用鼠标所在显示器，等待手动拖选 |
| 窗口跨显示器 | 选择相交面积最大显示器并裁剪选区 |
| 截图数据为空 | 显示失败提示并关闭截图会话 |
| 受保护窗口黑屏 | 保留现有限制提示，不尝试绕过 |
| 快捷键注册失败 | 设置中显示冲突，保留手动截图入口 |
| 截图准备超时 | 取消当前会话并恢复 idle |
| 连续快速触发 | 忽略第二次触发 |

## 12. 安全要求

- 只有主进程可以读取前台窗口句柄和窗口边界。
- 渲染器不能提交任意 HWND 要求主进程截图。
- 所有截图 IPC 继续验证调用方是否为当前截图遮罩层。
- 所有截图操作绑定 `sessionId`，拒绝过期会话。
- 窗口标题只用于开发诊断，不默认传给渲染器或写入素材元数据。
- 不读取或上传截图之外的窗口内容。
- 不绕过 Windows 安全桌面、DRM 或受保护内容限制。
- 原图和截图数据继续只保存在用户本机，除非用户主动使用其他上传功能。

## 13. GitHub 开源方案调研

以下项目用于借鉴架构和交互，不直接复制代码。引入第三方代码前必须单独核对许可证和依赖兼容性。

### 13.1 Electron Capture

项目：[cinc101/electron-capture](https://github.com/cinc101/electron-capture)

可借鉴：

- Electron 截图窗口预创建 `prepareCaptureWindow()`，减少每次创建窗口的延迟。
- 多显示器截图。
- 矩形、椭圆、箭头、画笔、文字、马赛克等标注工具。
- 截图完成后自动复制剪贴板。

适配 Pic：只借鉴“窗口预热 + 会话复用”的思路，保留 Pic 自己的素材库导入和安全 IPC。

### 13.2 ShareX

项目：[ShareX/ShareX](https://github.com/ShareX/ShareX)

可借鉴：

- 活动窗口、活动显示器、区域和滚动截图分离为不同捕获模式。
- 捕获完成后的复制、保存、编辑、OCR 等动作可配置。
- 区域标注支持箭头、形状、文字、模糊、像素化、聚光灯等。
- “捕获”和“捕获后处理”分离，便于维持核心截图路径的稳定性。

适配 Pic：本期不扩展多种快捷键，只保留 `Alt+A`，将“导入素材库 + 复制剪贴板”作为固定的捕获后处理。

### 13.3 ksnip

项目：[ksnip/ksnip](https://github.com/ksnip/ksnip)

可借鉴：

- 支持焦点窗口、鼠标所在窗口、当前屏幕、全部屏幕和区域截图。
- 失败或平台限制时有明确的捕获模式边界。
- 标注支持画笔、矩形、椭圆、文字和像素化。
- 具备最后区域复用和剪贴板导入能力。

适配 Pic：将“焦点窗口优先、当前屏幕回退、手动区域兜底”作为 Pic 的捕获决策树。

### 13.4 ScreenShotTool

项目：[snjo/ScreenShotTool](https://github.com/snjo/ScreenShotTool)

可借鉴：

- 活动窗口捕获和区域捕获分开处理。
- 区域 UI 使用帧率上限避免鼠标移动时过度重绘。
- `Enter` 确认、`C` 复制、`E` 进入编辑器、`Esc` 取消的键盘流程清晰。

适配 Pic：自动选区阶段保持轻量，只在拖动时更新边框；编辑阶段才启用完整工具栏。

### 13.5 Lumia / TerminalShot / WinShot

项目：

- [novapizza/lumia](https://github.com/novapizza/lumia)
- [crossps/TerminalShot](https://github.com/crossps/TerminalShot)
- [mrgoonie/winshot](https://github.com/mrgoonie/winshot)

可借鉴：

- 热键触发瞬间冻结屏幕，避免菜单、提示框和浮层在遮罩层出现时消失。
- 将注释保存为可编辑对象，最后再导出图片。
- 将窗口截图、区域截图、全屏截图和标注工具明确分层。
- 聚光灯/暗化周围区域，帮助用户确认当前选区。

适配 Pic：当前 Pic 使用 Canvas 编辑器，第一阶段保持现有数据结构，不引入完整矢量对象系统；只采用“先冻结、后显示、自动聚焦”的核心体验。

### 13.6 Greenshot

项目：[greenshot/greenshot](https://github.com/greenshot/greenshot)

可借鉴：

- Windows 上长期验证的区域、窗口和全屏捕获模式。
- 标注、模糊和遮挡敏感信息。
- 复制到剪贴板、保存文件、打开编辑器等捕获后动作。

适配 Pic：将剪贴板和素材库导入作为一个明确的结果动作，不新增复杂的上传目的地配置。

## 14. 分阶段实施

### 阶段 1：前台窗口探测和坐标转换

目标：可靠返回焦点窗口边界，并完成显示器/DPI 转换。

- 新增前台窗口服务。
- 增加窗口过滤和无效回退。
- 增加单元测试。
- 不改变截图页面视觉行为。

完成标准：可以在 100%、125%、150% DPI 和双显示器环境下得到正确的前台窗口矩形。

### 阶段 2：自动选区接入

目标：截图遮罩层首次出现时自动选择前台窗口。

- 扩展 `capture:get-config` 或新增截图会话 IPC。
- 传递 `initialSelection` 和 `selectionSource`。
- 自动绘制选区和暗化效果。
- 保留手动拖选覆盖逻辑。

完成标准：Chrome、文件管理器、Pic 等普通窗口均可自动选中，失败时可手动拖选。

### 阶段 3：截图窗口预热和快速响应

目标：消除截图窗口启动时的停顿和空白闪现。

- 应用启动时预加载遮罩层。
- 取消/完成后复用并重置窗口。
- 主进程提前捕获屏幕。
- 截图和初始选区一次性发送。
- 二进制图片传输和 `createImageBitmap()` 解码。

完成标准：遮罩层显示前没有黑屏、空白页或闪烁，P95 达到 200 ms 内可操作。

### 阶段 4：真实环境验证和回归

目标：确保快速路径不破坏现有素材库流程。

- 验证截图完成后导入素材库。
- 验证剪贴板内容可粘贴。
- 验证取消不产生文件和素材。
- 验证全局快捷键冲突提示。
- 验证多显示器和 DPI。
- 更新静态测试、服务测试和 Electron/CDP 验证。

完成标准：所有验收场景通过后独立提交。

## 15. 测试和验收

### 15.1 单元测试

- 前台窗口句柄为空时返回无效结果。
- 隐藏和最小化窗口被过滤。
- 弹窗可以归并到根窗口。
- 窗口边界与显示器边界交集计算正确。
- 多显示器负坐标计算正确。
- 100%、125%、150% DPI 转换误差在 1 px 以内。
- 初始选区小于最小尺寸时回退。
- 过期 `sessionId` 被拒绝。

### 15.2 Electron 集成测试

- 焦点在 Chrome 时按 `Alt+A`，自动选中 Chrome 窗口。
- 焦点在文件管理器时按 `Alt+A`，自动选中文件管理器窗口。
- 焦点在 Pic 时按 `Alt+A`，自动选中 Pic 主窗口。
- 遮罩层显示前没有 `about:blank`、黑屏或闪烁。
- 自动选区出现后可以重新手动框选。
- 箭头、撤销、重做、完成流程保持正常。
- 完成后素材库出现新截图，剪贴板可粘贴同一张 PNG。
- 取消后素材库和剪贴板均不发生变化。

### 15.3 人工验收矩阵

| 场景 | 期望结果 |
| --- | --- |
| 普通窗口 | 自动选择窗口可见区域 |
| 最大化窗口 | 自动选择最大化区域 |
| 窗口部分超出屏幕 | 选区裁剪到当前显示器 |
| 双显示器 | 选择焦点窗口所在显示器 |
| 不同 DPI | 边界不偏移、不缩放错位 |
| 桌面/任务栏 | 回退到手动区域截图 |
| 最小化窗口 | 回退到手动区域截图 |
| 受保护内容 | 显示现有限制提示 |
| 快捷键冲突 | 设置中显示未注册和冲突 |
| 连续按两次 Alt+A | 只创建一个截图会话 |

## 16. 完成定义

满足以下条件才算本 Spec 完成：

- 焦点窗口识别在 Windows 正常窗口中稳定工作。
- 自动选区与图片裁剪坐标一致。
- 截图遮罩层可复用，且不存在中间空白/黑屏闪现。
- `Alt+A` 到可操作选区达到目标响应时间。
- 手动区域截图仍然可用。
- 截图编辑、剪贴板复制和素材库导入均保持可用。
- 失败场景均有安全回退。
- 代码、测试和文档均提交到源码 PR；不提交 `node_modules`、`dist-app` 或安装包。

## 17. 参考资料

- [Electron globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut/)
- [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer/)
- [Electron DesktopCapturerSource](https://www.electronjs.org/docs/latest/api/structures/desktop-capturer-source)
- [Electron screen](https://www.electronjs.org/docs/latest/api/screen)
- [Windows GetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow)
- [Windows GetWindowRect](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect)
- [Windows DWM composition and extended frame bounds](https://learn.microsoft.com/en-us/windows/win32/dwm/composition-ovw)
