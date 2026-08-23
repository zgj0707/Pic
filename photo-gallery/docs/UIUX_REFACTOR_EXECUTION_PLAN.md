# Pic UI/UX 重构执行方案

> 目标执行模型：5.6luna  
> 当前基线：Pic 3.2.4  
> 核心用户：需要收集参考素材、管理拍摄项目、快速筛片和导出交付的独立摄影师

## 1. 执行前提

1. 保留当前工作区所有修改，不得使用 `git reset --hard`、`git checkout --` 或覆盖未提交文件。
2. 先确认 3.2.4 的项目数据库迁移、导航修复和图标调整都在工作区中。
3. 先执行：
   - `npm.cmd run typecheck`
   - `npm.cmd test`
   - `npm.cmd run lint`
4. 当前完整测试基线应为 96 个测试通过；lint 允许现有 12 条 `any` 警告，不允许新增错误。
5. 不在本轮同时迁移 React/Vue/Svelte。保留现有 Electron + 原生 JavaScript 架构，先完成信息架构和工作流重构。
6. 每个阶段独立提交；不得把数据库迁移、布局重写和大规模交互变更塞进同一个提交。
7. 任何必须通过重新打包才能验证的阶段，都要递增版本号、更新应用内公告并生成新的 portable 包。
8. GitHub 默认只推送源码分支，不上传 portable 包，除非用户另行明确要求。

## 2. 产品目标

将 Pic 从“照片工具功能集合”重构为围绕项目推进的摄影工作台：

```text
建立项目 → 收集素材 → 快速初筛 → 对比精选 → 排序交付
```

必须达到的体验目标：

- 用户始终知道当前项目和当前工作阶段。
- 新建项目、导入素材、开始初筛三个入口无需寻找。
- 初筛可全程使用键盘完成。
- 精选结果跨搜索、筛选和应用重启保持。
- 素材浏览器、设置、回收站属于辅助空间，始终能返回当前项目。
- 照片信息、批量编辑和精选篮不再挤在同一个上下文面板。
- 删除可恢复；交付必须从明确的精选集合发起。

## 3. 新信息架构

### 3.1 一级结构

- 项目工作区
  - 收件箱：刚导入、尚未处理的照片。
  - 全部照片：当前项目全部有效照片。
  - 初筛：只显示未处理、保留或淘汰状态。
  - 精选集：有顺序、可持久化的候选照片。
  - 交付：从精选集生成客户文件夹、PDF 或副本。
- 素材来源
  - 本地文件夹。
  - 本地文件。
  - 素材浏览器与下载记录。
- 辅助功能
  - 回收站。
  - 设置。
  - 更新公告和关于。

### 3.2 桌面布局

- 左侧 200–240px：项目和工作区导航。
- 顶部：当前项目名称、拍摄日期、照片统计、当前阶段和阶段主操作。
- 中间：照片网格、沉浸式初筛或并排对比；同一时间只保留一种主任务。
- 右侧 240–300px：精选篮；没有精选时默认收起。
- 照片详情改为按需抽屉或浮层，不常驻占用工作空间。
- 底部状态栏只显示加载数量、选中数量、后台任务和快捷键提示，不承担主要导航。

## 4. 状态模型

先建立单一 UI 状态源，避免继续扩散全局变量。

建议新增 `public/js/state.js`：

```js
window.PicState = {
  currentProjectId: null,
  currentProject: null,
  workspace: 'library',
  workflowStage: 'collect',
  activePhotoId: null,
  selectedPhotoIds: new Set(),
  selectionTrayIds: [],
  filters: {
    search: '',
    rating: null,
    tag: null,
    reviewState: 'all',
    orientation: null,
    favorite: false
  },
  view: {
    mode: 'masonry',
    detailsOpen: false,
    selectionTrayOpen: false
  }
}
```

要求：

- 所有 workspace 切换都经过统一的 `navigateToWorkspace()`。
- 所有项目切换都经过统一的 `selectProject()`。
- 渲染函数读取状态，不在渲染过程中隐式修改其他状态。
- localStorage 只保存界面偏好；业务状态进入数据库。
- 建议使用轻量事件总线 `PicEvents.emit/on`，不引入新框架。

## 5. 数据模型与 IPC

### 5.1 照片初筛状态

给 `photos` 增加：

```sql
review_state TEXT NOT NULL DEFAULT 'unreviewed'
```

允许值：

- `unreviewed`
- `pick`
- `reject`

不要复用 `rating` 表示淘汰；评级和初筛结论是两个维度。

新增 IPC：

- `photos:setReviewState(id, state)`
- `photos:batchSetReviewState(ids, state)`
- `photos:countByReviewState(projectId)`

同时扩展 `PhotoFilter`、`PhotoQueryOptions` 和 preload 类型。

### 5.2 持久精选篮

新增表：

```sql
CREATE TABLE IF NOT EXISTS project_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  photo_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER,
  UNIQUE(project_id, photo_id)
);
```

新增 IPC：

- `selections:get(projectId)`
- `selections:add(projectId, photoIds)`
- `selections:remove(projectId, photoIds)`
- `selections:reorder(projectId, orderedPhotoIds)`
- `selections:clear(projectId)`

照片被永久删除时同步清理精选关系；进入回收站时精选关系保留，恢复后继续可见。

### 5.3 项目阶段

给 `projects` 增加：

```sql
workflow_stage TEXT NOT NULL DEFAULT 'collect'
shoot_date INTEGER
delivered_at INTEGER
```

新增 `projects:setWorkflowStage()`。阶段只用于导航和恢复工作现场，不应限制用户访问其他空间。

### 5.4 迁移规则

- 每个新增列先检查 `PRAGMA table_info`，不得假设旧表结构完整。
- 所有迁移必须幂等，重复启动不报错。
- 为真实旧结构添加专门测试文件，不能只测试全新数据库。
- 不删除 `client_id/date/album_id` 等旧字段；只兼容，不破坏旧数据。

## 6. 分阶段实施

### 阶段 0：冻结基线

目标：确保 3.2.4 修复成为可回退基线。

操作：

- 检查并提交当前项目创建迁移、3.2.4 公告、导航和图标修改。
- 记录测试结果和 portable 路径。
- 从该提交创建 `codex/uiux-workflow-refactor` 分支。
- 不修改任何功能。

完成标准：工作区干净，96 个测试通过，3.2.4 portable 可启动。

### 阶段 1：前端结构拆分，不改变功能

目标：先降低 `index.html` 和 `app.js` 的耦合。

操作：

- 将 `public/index.html` 内联样式迁到：
  - `public/styles/tokens.css`
  - `public/styles/layout.css`
  - `public/styles/components.css`
- 新增：
  - `public/js/state.js`
  - `public/js/navigation.js`
  - `public/js/projects.js`
- 将项目加载、创建、切换从 `app.js` 移入 `projects.js`。
- 将 gallery/recycle/settings/browser 导航统一到 `navigation.js`。
- 保留原有脚本加载顺序和全局 API，不在此阶段切 ES modules。
- 为所有 DOM 事件使用 `addEventListener`，避免覆盖已有处理器。

完成标准：界面和行为与阶段前一致；项目创建、导入、回收站、素材浏览器均可使用。

### 阶段 2：项目工作台和新导航

目标：建立新的应用外壳和信息层级。

操作：

- 重写 `public/index.html` 的主布局：项目侧栏、项目标题栏、工作阶段栏、主内容区、精选篮。
- 将设置、素材浏览器和回收站从底部主导航降级为辅助入口。
- 项目侧栏提供带文字的“新建项目”按钮，不能只显示图标。
- 当前项目标题区显示：名称、描述/日期、照片数、未处理数、精选数。
- 为没有项目、没有照片、筛选无结果、精选为空分别设计空状态。
- 所有辅助页面保留“返回当前项目”按钮，并支持 `Escape` 返回。

完成标准：用户从启动到新建项目不超过两次点击；当前项目在所有界面可见或可一键返回。

### 阶段 3：键盘优先初筛

目标：支持摄影师连续处理大量照片。

操作：

- 完成 `review_state` 数据库迁移和 IPC。
- 新增 `public/js/culling.js`。
- 初筛支持两种视图：网格初筛、单张沉浸式初筛。
- 默认快捷键：
  - `←/→`：上一张/下一张。
  - `P`：保留。
  - `X`：淘汰。
  - `U`：恢复未处理。
  - `1–5`：评级。
  - `Space`：放大/适配。
  - `C`：加入/移出精选篮。
- 输入框、文本域和可编辑区域聚焦时禁用全局快捷键。
- 操作后自动前进，并在界面显示最近操作和撤销入口。
- 初筛状态必须立即持久化，重启后恢复。

完成标准：不使用鼠标即可连续完成 100 张照片的保留、淘汰和评级。

### 阶段 4：精选篮与并排对比

目标：把“选中照片”和“最终候选”分开。

操作：

- 完成 `project_selections` 表和 IPC。
- 新增 `public/js/selectionTray.js`、`public/js/compare.js`。
- 普通临时选中仍使用 `selectedPhotoIds`；精选篮使用持久化 `selectionTrayIds`。
- 精选篮跨筛选、分页、视图切换和重启保持。
- 支持拖动调整交付顺序。
- 支持 2–4 张并排比较；同步显示缩放后的构图、评分、标签和 EXIF 摘要。
- 对比界面支持直接淘汰、评级、替换精选。

完成标准：从任意筛选结果加入精选，切换页面或重启后顺序不丢失。

### 阶段 5：交付工作流

目标：从精选结果直接产生客户可用输出。

操作：

- 新增 `public/js/delivery.js`。
- 交付页以精选顺序为准，显示缺失文件、重复文件和回收站照片警告。
- 支持：
  - 复制原图到命名文件夹。
  - 按顺序重命名副本。
  - 生成联系表 PDF。
  - 打开交付文件夹。
- 导出前明确显示目标目录、数量和预计操作。
- 导出失败必须报告具体文件；成功后记录 `delivered_at`。
- 不修改原始文件名和原始文件位置。

完成标准：精选集可一次生成可交付文件夹；部分文件失败不会导致整体状态被误报为成功。

### 阶段 6：视觉、无障碍与性能收尾

目标：形成稳定的 3.3.0 UI 版本。

操作：

- 统一设计 token：背景层级、文字层级、强调色、危险色、间距、圆角、焦点态。
- 所有图标配可见文字或 `aria-label`，不能依赖 tooltip 才能理解。
- 焦点顺序、键盘操作、对比度和 100%/125%/150% 缩放均需检查。
- 1000、5000、10000 张照片项目测试滚动和筛选性能。
- 保留虚拟滚动；右侧精选篮不得触发整个网格重绘。
- 避免为装饰添加大面积动画，尊重 `prefers-reduced-motion`。

完成标准：无新增控制台错误；核心操作在 10000 张照片项目中保持可用；发布 3.3.0 portable。

## 7. 组件和文件职责

- `public/index.html`：只保留语义结构、模态框和脚本入口。
- `public/styles/tokens.css`：颜色、文字、间距和层级 token。
- `public/styles/layout.css`：应用外壳、侧栏、主区、精选篮和响应式规则。
- `public/styles/components.css`：按钮、筛选、照片卡片、空状态、模态框。
- `public/js/state.js`：唯一 UI 状态和事件总线。
- `public/js/navigation.js`：workspace 和辅助页面切换。
- `public/js/projects.js`：项目 CRUD、项目标题和项目列表。
- `public/js/culling.js`：初筛状态和快捷键。
- `public/js/selectionTray.js`：持久精选篮。
- `public/js/compare.js`：并排对比。
- `public/js/delivery.js`：交付流程。
- `public/js/grid.js`：仅负责照片网格、虚拟滚动和单元格交互。
- `public/js/lightbox.js`：单张查看、缩放和旋转。
- `public/js/batch.js`：普通临时选中的批量编辑，不管理精选篮。

## 8. 测试清单

### 自动测试

- 旧 `projects` 表迁移后可创建项目。
- `review_state` 迁移、查询和批量更新。
- 精选篮新增、去重、删除、重排和项目隔离。
- 删除、恢复、永久删除与精选关系的一致性。
- 项目切换不会混入其他项目照片。
- 筛选组合不会丢失精选篮。
- 导出部分失败时返回准确成功/失败数量。

### 手工验证

- 全新数据库首次启动。
- 从 3.1.x/3.2.x 真实旧数据库升级。
- 新建项目后立即导入文件夹和文件。
- 素材浏览器下载进入当前项目。
- 回收站恢复后回到原项目和原路径。
- 键盘初筛时输入框不会触发快捷键。
- 精选篮重启后保持。
- portable 从无 `modules` 目录的空文件夹启动。
- portable 同目录存在旧 `modules` 时显示实际加载模块版本；建议后续改为只加载版本不低于内置模块的外部模块。

## 9. 版本、打包与提交规则

每个需要 portable 验证的阶段：

1. 递增版本号；不要覆盖已有版本文件。
2. 同步修改：
   - `package.json`
   - `package-lock.json`
   - `electron/content/index.ts`
   - `electron/changelog.json`
   - `CHANGELOG.md`
3. 执行 `npm.cmd test`、`npm.cmd run lint`、`npm.cmd run build:win`。
4. 核对 `dist-pkg/Pic-<version>-portable.exe` 的文件名、大小和时间。
5. 每阶段一个清晰提交，例如：
   - `refactor(ui): split state and navigation foundations`
   - `feat(workflow): add keyboard culling`
   - `feat(selection): add persistent selection tray and compare view`
   - `feat(delivery): add ordered delivery workspace`
6. 推送 `codex/uiux-workflow-refactor` 源码分支；不上传 portable 包。

## 10. 禁止事项

- 不得在没有迁移测试时改数据库结构。
- 不得删除或重建用户数据库。
- 不得用评级值隐式表示淘汰状态。
- 不得把精选篮继续实现为临时 `Set`。
- 不得在一个阶段同时迁移框架、数据库和全部 UI。
- 不得删除现有虚拟滚动后以完整 DOM 渲染替代。
- 不得让设置、素材浏览器、回收站成为与项目工作区平级的主流程。
- 不得只靠图标表达新建项目、导入、精选、交付等核心动作。

## 11. 最终验收场景

使用一套真实旧数据库和至少 1000 张照片完成以下流程：

1. 启动旧版本数据升级后的新包。
2. 新建项目并立即进入该项目。
3. 导入本地照片与素材浏览器下载文件。
4. 仅用键盘完成初筛、评级和加入精选。
5. 从不同筛选结果继续补充精选集。
6. 并排对比候选照片并调整顺序。
7. 重启应用，确认项目阶段、初筛状态和精选顺序保持。
8. 生成交付文件夹与联系表 PDF。
9. 删除、恢复一张精选照片，确认项目和精选关系正确。
10. 检查设置、素材浏览器、回收站都能一键返回当前项目。

以上全部通过后，才将重构版本标记为 3.3.0。
