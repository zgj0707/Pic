# Pic v6.0「导演台」前端重构落地计划

> 依据：v3 交互原型 `docs/ui-redesign/prototype-v3-portrait.html`（已确认方向）
> 基线：main @ 2f0d3cc（v5.0.0），工作区另有 14 个未提交改动文件
> 原则：分阶段顺序交付，每阶段独立 commit + tag，可单独回滚；每阶段结束跑全量测试

---

## 现状盘点（阅读即规划的结论）

**数据层（electron/services/database.ts, 699 行）**
- `photos` 表已有：`project_id`、`review_state`（'unreviewed'|'pick'|'reject'）、`source_type`、`deleted_at` → 收集箱可直接扩展 `review_state` 加 `'inbox'` 值（TEXT 无 CHECK 约束，迁移成本≈0，只改类型联合与筛选）。
- `project_shots` 表已有 `chapter`（TEXT，分组名）+ `position` + `status('planned'|'ready'|'done')` → **五景别可直接复用 `chapter` 字段**（值域：远景/中景/近景/特写/空镜 + 迁移期"待归类"），无需新表。
- `shot_groups` / `shot_items` 双表是 v5 自由分组结构，固定景别后弃用写入（保留表与读取兼容，避免破坏旧数据）。
- 约束注意：`photos.filepath` UNIQUE、`project_shots` UNIQUE(project_id, photo_id)、`photos.project_id` 单值 → 跨项目复制的照片归属是 Phase 4 的关键决策点。

**服务层（electron/services/projectShots.ts, 559 行）**
- 已有：`createProjectShot / updateProjectShot / reorderProjectShots / removeProjectShot / moveProjectShotsForPhotos`（移动语义）。
- 缺：跨项目**复制**（copy 语义）函数。
- `assertPhotoBelongsToProject`（:214）限制 photo 必须属于目标项目 → 复制 shot 前先解决照片归属。

**前端（public/js，13 个模块）**
- `state.js`(76) 全局状态；`navigation.js`(299) 视图切换；`planning.js`(474) 拍摄清单；`projects.js`(252) 项目列表。
- 静态护栏测试 `tests/uiux/performance.static.test.ts` 含守卫计数，结构改动必须同步更新。

**未提交改动（14 文件 +183/-21 + 新文件 electron/ipc/pdfExport.ts）**
- 内容为截图/导入/批量/PDF 的功能性修改，与本次重构无冲突但混在一起会污染回滚点 → Phase 0 先封存。

---

## Phase 0 · 基线封存（前置，约 10 分钟）

| 项 | 内容 |
|---|---|
| 动作 | 将 14 个未提交改动提交为独立 commit：`wip: pending screenshot/import/batch/pdf changes before v6 refactor`；新文件 `electron/ipc/pdfExport.ts` 一并纳入 |
| tag | `v5.0.0-baseline`（打在该 commit 上） |
| 回滚 | 此后任何阶段 `git reset --hard v5.0.0-baseline` |

**验收**：`git status` 干净；`npm.cmd run test` 144 用例通过。

---

## Phase 1 · 设计令牌与浅色主题（换肤，不动结构）

**目标**：落地「画廊纸感」令牌，全应用换肤但布局/组件 DOM 不变，先让视觉独立可验收。

改动文件：
1. `public/styles/tokens.css` — 整体重写 `:root`：纸面色阶 `--paper:#FAF8F4 / --paper-sunk:#F1EDE6 / --card:#FFFFFF`、墨色 `--ink:#201C16 / --ink-2:#6B645A / --ink-3:#A39B8E`、品牌陶土 `--clay:#C75B39 / --clay-strong:#A8492B / --clay-soft:#F6E3DB`、场景五色 `--sc-far:#2F6F6A / --sc-mid:#C75B39 / --sc-near:#B08A2E / --sc-close:#5B5F97 / --sc-empty:#7A8B6F`；保留旧变量名（`--accent → var(--clay)`、`--bg-* → paper 映射`）做兼容别名，避免一次性改所有引用。
2. `public/styles/layout.css` / `components.css` — 仅替换硬编码色值为新令牌引用，不动选择器结构；暗色 `color-scheme` 改 light。
3. `tailwind.config.js` — bg/text 语义色指向新令牌。

**验收**：应用启动后为浅色纸感主题；`npm.cmd run test` 通过（重点 tests/uiux 快照/静态用例）。
**commit/tag**：`refactor(phase1): paper-light design tokens` + `v6.0.0-alpha.1`

---

## Phase 2 · 布局骨架：Icon Rail + 项目分区（结构变更第一步）

**目标**：三栏骨架 `64px rail | 236px 项目分区 | 主区`，空间切换机制落地。

改动文件：
1. `public/index.html` — ① `app-shell` 改三列 grid（原 `workspace-frame` 两列）；② 原 `.project-sidebar` 拆为 rail（空间图标×5）+ `.project-panel`（项目分区列表，渲染逻辑仍在 projects.js）；③ 新增 `#space-inbox` 空 section 占位（Phase 5 填充）；④ 原「辅助空间」按钮组移入 rail。
2. `public/styles/layout.css` — 三栏 grid、rail/panel 样式（从原型 v3 移植对应段落）。
3. `public/js/navigation.js` — 空间切换从"视图二态（gallery/planning）"改为"空间五态（inbox/board/recycle/browser + 板内布局）"；`showView()` 重构为 `showSpace()`，保留 `statusBackToGallery` 行为兼容。
4. `public/js/state.js` — 增加 `space`、`activeProjectId` 字段。
5. `public/js/projects.js` — 项目分区卡片渲染（封面缩略图/镜头数/已拍数，数据来自 shots 统计）；点击切换项目触发全量刷新。
6. `tests/uiux/performance.static.test.ts` — 更新守卫计数与选择器断言。

**验收**：五空间可切换；项目点击切换后顶栏/简报/列表联动；旧视图入口无残留死链。
**commit/tag**：`refactor(phase2): rail + project zones layout` + `v6.0.0-alpha.2`

---

## Phase 3 · 五景别分镜板（核心，chapter 复用）

**目标**：拍摄清单重写为五条固定景别轨道，支持轨内拖拽排序、跨轨移动、轨内独立编号。

数据与服务层：
1. `electron/services/database.ts` — 新增幂等迁移 `migrateShotChapters()`：`project_shots.chapter` 不在 {'远景','中景','近景','特写','空镜'} 的值 → 统一改写为 `'待归类'`（v5 自由分组数据一次性收敛，不丢行）。
2. `electron/types/index.ts` — 新增 `export type ShotLane = '远景'|'中景'|'近景'|'特写'|'空镜'|'待归类'`；`ProjectShot.chapter: ShotLane`。
3. `electron/services/projectShots.ts` — ① `normalizeGroupName` 改为景别白名单校验（非法值拒绝）；② `createProjectShot` 默认 chapter='远景'；③ `reorderProjectShots` 保持（position 在 chapter 内排序）；④ 新增 `listShotsByLane(projectId)` 返回按景别分组的有序结果（一次查询，前端不再自行分组）。
4. `shot_groups` 写路径全部改道 chapter（`createShotGroup/renameShotGroup/reorderShotGroups/removeShotGroup` 标记 deprecated，内部 no-op 兼容旧 IPC 调用）。

前端：
5. `public/js/planning.js` — 按 `prototype-v3-portrait.html` 重写：五轨横向布局渲染（`--lane-c` 场景色）、HTML5 DnD（轨内插入位置按卡片中点判定、跨轨 drop 调 `shots.update` 改 chapter + `shots.reorder`）、编号/计数/进度条（done 统计）由 `listShotsByLane` 驱动。
6. `public/index.html` — `planningPanel` 替换为 board 结构（lane 列表 + brief-strip 进度条）。
7. `public/styles/components.css` — 移植原型 lane/shot 卡片样式。

**验收**：① 旧库启动自动迁移，原镜头全部出现在"待归类"轨；② 拖拽换位/跨轨后刷新页面顺序保持；③ 空轨显示引导占位；④ `npm.cmd run test` 全绿（新增 `tests/services/shotLanes.test.ts` 覆盖迁移与白名单）。
**commit/tag**：`feat(phase3): five-lane storyboard board` + `v6.0.0-alpha.3`

---

## Phase 4 · 跨项目拖拽复制（关键决策：照片归属）

**决策点**（实现前需你拍板，默认推荐 A）：
- **方案 A（推荐）**：复制镜头时，若照片不属于目标项目，则在目标项目创建**照片引用副本行**（复制 photos 行：`filepath` 指向原文件路径不变 → 需将 filepath 唯一约束改为允许多项目引用，或新增 `photo_references(project_id, photo_id)` 引用表）。A 方案优点：原文件不复制、两个项目共享同一磁盘文件；缺点：photos 查询需改为 join 引用表（改动面大）。
- **方案 B**：镜头副本指向同一 photo_id，但放宽 `assertPhotoBelongsToProject`——`project_shots` 本就是 project_id+photo_id 关联表，**直接允许同一照片的 shot 出现在多个项目**，图库列表仍按 `photos.project_id` 归属显示。改动最小：副本仅是另一项目的一条 shot 记录，图库互不干扰。缺点：目标项目图库里看不到这张图（但分镜板可见，符合"复制的是镜头而非文件"的直觉）。

> 倾向 **B**：v4.2 复制项目时"不重复照片原文件"的既有语义一致，且不碰 photos 表结构。若选 B，跨项目拖拽 = `copyProjectShot(shotId, toProjectId)` 一条 INSERT。

改动文件：
1. `electron/services/projectShots.ts` — 新增 `copyProjectShot(shotId, toProjectId, opts?: { lane?: ShotLane })`：读源 shot → INSERT 到目标项目（保留 title/notes/tags，copy 标记见下）；唯一约束冲突（目标已有同照片同景别）时返回明确错误码。
2. `electron/types/index.ts` — `ProjectShot` 增加 `copiedFrom?: number`（来源 shotId，用于"副本"标签溯源）；迁移加列。
3. `electron/ipc/projectShots.ts` + `electron/preload.ts` — 暴露 `shots.copy(shotId, toProjectId)`。
4. `public/js/projects.js` — 项目分区项作为 drop 目标：dragover 高亮 + "松开复制"提示，drop 调 `shots.copy`，toast 反馈落点。
5. `public/js/planning.js` — shot 卡片 dragstart 携带 shotId；副本卡片渲染「副本」tag。

**验收**：拖 A 项目镜头到 B 项目 → B 分镜板同景别出现副本、A 不变、重启后持久；重复复制同一镜头到同项目同景别被拦截并提示。
**commit/tag**：`feat(phase4): cross-project shot copy` + `v6.0.0-alpha.4`

---

## Phase 5 · 收集箱（inKeyBox = review_state 扩展）

**目标**：截图/导入/网页收藏先落收集箱，hover 拍板到当前项目五景别。

改动文件：
1. `electron/types/index.ts` — `ReviewState = 'inbox' | 'unreviewed' | 'pick' | 'reject'`。
2. `electron/services/database.ts` — 无需 DDL（TEXT 无约束）；确认 `idx_photos_review_state` 已存在（:571）。
3. 截图落点：`electron/services/`（截图保存服务，v4.3 引入）与 `electron/ipc/import.ts` — 新导入/截图默认 `review_state='inbox'`（不直接进图库）。
4. `public/js/import.js` / `batch.js` — 导入结果 toast 指向收集箱。
5. `public/index.html` + `public/js/inbox.js`（新文件）— 收集箱空间：网格 + dropzone + 卡片 hover 拍板条（远景/中景/近景/特写/空镜/X 六按钮，键位 1-5/X 全局监听仅在该空间激活时生效）；拍板 = `review_state→'pick'` + `shots.create(chapter=…)` + 可选 `selections.add`。
6. `public/js/app.js` / `navigation.js` — 图库筛选默认排除 inbox 状态；状态栏计数纳入 inbox。
7. `tests/services/` — 新增收件箱拍板回归用例。

**验收**：Alt+A 截图 → 只出现在收集箱；拍板到"特写"后分镜板对应轨即时出现、收集箱减一；旧照片（unreviewed/pick）不受影响。
**commit/tag**：`feat(phase5): inbox triage space` + `v6.0.0-alpha.5`

---

## Phase 6 · 导出顺序 + 回收站/浏览器收尾 + 全量回归

1. `electron/services/planningExports.ts` — PDF 生成顺序改为固定 `远景→中景→近景→特写→空镜`，轨道内按 position；"待归类"轨条目在导出前校验并提示。
2. `public/js/navigation.js` + 回收站/素材浏览器视图 — 迁入 rail 空间体系，行为不变。
3. `electron/changelog.json` + `photo-gallery/CHANGELOG.md` — v6.0.0 条目（五景别分镜板 / 项目分区与跨项目复制 / 收集箱拍板 / 纸感新视觉）。
4. 全量回归：`npm.cmd run test`（21 文件 144+ 用例）→ `npm.cmd run build` → `test-smoke.cjs` → 启动 `启动.bat` 人工过一遍主流程（导入→收集箱拍板→分镜拖拽→跨项目复制→导出 PDF）。
**commit/tag**：`release: v6.0.0-beta` + `v6.0.0-beta`

---

## Phase 7 · 打包发布

- `npm.cmd run dist`（electron-builder）产出 `dist-pkg` 便携版；冒烟通过后 `v6.0.0` 正式 tag，push main。

---

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| chapter 迁移误伤旧分组数据 | 迁移只改写 chapter 值不删行；"待归类"轨保底；Phase 3 tag 可整体回滚 |
| 跨项目复制与 photos 归属冲突 | Phase 4 前置决策（A/B 方案），B 方案不触碰 photos 表 |
| 静态护栏测试计数漂移 | 每个 Phase 同步更新 performance.static.test.ts，杜绝"改测试凑绿"以外的静默放宽 |
| 拖拽 DnD 在 Electron 渲染层的兼容 | 原型已在浏览器验证；实机验证点写入 Phase 3 验收 |

每阶段回滚：`git reset --hard <上一阶段 tag>`；数据回滚仅 Phase 3/4 涉及 DB（均为幂等迁移 + 加列，无删列）。

## 需要你确认的 3 个点

1. **Phase 0**：未提交的 14 个文件改动，按上述方案封存为独立 commit（还是你希望先人工过一遍再提交？）
2. **Phase 4 方案 A/B**：跨项目复制用 B（镜头副本、不动照片归属，改动最小）还是 A（照片引用副本表，改动大但图库也可见）？
3. **节奏**：按 alpha.1→beta 顺序推进，每阶段结束我汇报验收结果再继续，还是连续执行到 beta？
