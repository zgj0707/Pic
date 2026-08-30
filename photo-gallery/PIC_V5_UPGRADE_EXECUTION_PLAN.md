# PIC v5.0.0 升级执行方案

> 面向执行者：Luna xhigh 及后续代码审查者  
> 产品类型：Windows 本地桌面应用  
> 技术方向：保留 Electron，升级为模块化单体架构  
> 目标版本：5.0.0  
> 文档性质：实施计划，不是需求讨论稿  
> 默认工作目录：`E:\Pic\photo-gallery`

---

## 0. 执行摘要

PIC v5.0.0 只服务一个用途：

> 摄影师在拍摄前搜集参考样片，把样片编排成有顺序、有备注、可导出的拍摄方案，并在拍摄时照着执行。

v5 不把 PIC 扩展为照片管理软件、客户交付平台、图片编辑器、社交收藏工具或通用知识库。所有产品与工程决策都必须服务以下唯一闭环：

```text
新建拍摄方案
  -> 从小红书、抖音、本地文件或任意屏幕搜集样片
  -> 查看未编排样片
  -> 将样片编排进拍摄分组
  -> 调整分组与样片的拍摄顺序
  -> 为样片记录简短拍摄备注
  -> 导出按顺序排列、可以照着拍的 PDF
```

本次升级同时完成两类工作：

1. **产品收束**：把现有“项目/图库/选择/导出”重新组织为“拍摄方案/样片池/拍摄清单/方案 PDF”。
2. **架构升级**：保留 Electron，但将桌面权限、应用用例、领域模型、数据访问和界面交互分离，建立窄 IPC 和可回归测试的业务边界。

v5 的成功不以代码重写量、框架新旧或功能数量衡量，而以下列结果衡量：

- 用户能明确知道当前样片会进入哪个拍摄方案；
- 用户能连续搜集样片，不被整理步骤频繁打断；
- 用户能把样片组织成拍摄分组和顺序；
- 关闭并重新打开 PIC 后，分组、顺序和备注完整保留；
- PDF 与界面中的拍摄顺序一致；
- 旧版本项目和图片不丢失、不覆盖、不删除原文件；
- 小红书远程内容不能获得 PIC 的本地权限；
- 全局 `Alt+A` 截图继续同时支持“加入当前方案”和“复制到剪贴板”，并分别报告结果。

---

## 1. 不可违反的产品原则

### 1.1 唯一判断问题

每一个准备新增或保留的功能都必须回答：

> 它是否让摄影师更快形成一份可以照着拍的方案？

不能明确回答“是”的功能，不得进入 v5。

### 1.2 三个核心动作

PIC 的一级产品语言统一为：

1. **搜集样片**
2. **编排拍摄**
3. **导出方案**

界面、空状态、按钮、快捷入口、帮助文字和 PDF 文案都应围绕这三个动作组织。

### 1.3 样片不是摄影资产库

PIC 保存的是某次拍摄策划使用的参考样片，不承担长期照片资产管理。v5 不引入：

- RAW 工作流；
- EXIF 管理中心；
- 星级评分；
- 跨方案收藏库；
- 全局标签知识库；
- 成片管理；
- 客户交付图库；
- 云同步；
- 团队权限；
- 图片编辑器；
- 社区或关注系统。

### 1.4 原文件安全

任何“移除样片”“删除方案”“删除分组”操作默认只影响 PIC 的策划关系和 PIC 自己管理的副本，不得删除用户原始文件。

如果现有实现存在复制到应用数据目录和直接引用外部文件两种模式，Phase 0 必须确认实际语义，Phase 2 必须将其封装为统一资产接口，并在界面中避免误导。

### 1.5 远程平台只是输入渠道

- 小红书：保留内嵌浏览，作为主要素材入口之一。
- 抖音：保留受控外部打开，不恢复内嵌抖音。
- 其他网站和应用：通过全局截图覆盖，不逐个平台开发浏览器集成。
- 不开发平台切换器，不开发自动下载或绕过平台限制的功能。

---

## 2. v5 范围

### 2.1 必须交付

- 将用户可见的“项目”语义统一为“拍摄方案”；
- 新建、复制、删除、切换拍摄方案；
- 当前方案始终清晰可见；
- 三阶段导航：搜集样片、编排拍摄、导出方案；
- 本地导入样片；
- 全局 `Alt+A` 截图加入当前方案；
- 截图写入剪贴板；
- 内嵌小红书继续可用；
- 受控外部打开抖音；
- 未编排样片视图；
- 拍摄分组的新增、重命名、排序、删除；
- 样片加入一个或多个拍摄分组；
- 分组内样片排序；
- 每个拍摄条目的简短备注；
- 关闭重启后的完整持久化；
- 按分组和条目顺序导出 PDF；
- PDF 可选显示来源、备注和拍摄勾选框；
- 导出前预检、部分失败明细、导出后打开位置；
- 旧数据安全迁移；
- Electron IPC、远程网页和外部链接安全加固；
- 当前源码级构建、测试和真实 Electron 运行验证。

### 2.2 明确非目标

- 不迁移到 Tauri、Wails、WinUI、React、Vue 或其他框架；
- 不全面重写 renderer；
- 不加入自由画布；
- 不加入复杂模板设计器；
- 不加入全局收藏、评分和标签体系；
- 不加入 AI 分类、相似图或自动生成策划；
- 不加入云同步、登录和多人协作；
- 不加入图片编辑能力；
- 不下载小红书或抖音原始媒体；
- 不恢复被产品方向淘汰的内嵌抖音或素材来源切换器；
- 不默认生成 Windows 安装包或便携 `.exe`；
- 不推送远程仓库，除非用户之后明确授权提交范围和目标。

### 2.3 兼容性目标

- 现有 SQLite 数据库原地升级后可继续使用；
- 现有项目继续出现，并以“拍摄方案”展示；
- 现有项目图片全部成为该方案的样片；
- 现有图片文件路径和用户原文件不被移动或删除；
- 现有项目复制、删除、选择导出等安全行为不得回退；
- 如果旧数据没有可恢复的分组、排序或备注，则迁移为“未编排样片”，不得猜测分组；
- 数据迁移必须幂等，可在应用重复启动时安全执行。

---

## 3. 目标用户流程

### 3.1 新建方案

最小必填字段只有方案名称。可选字段：

- 拍摄日期；
- 客户或模特；
- 一行主题说明。

创建成功后直接进入“搜集样片”，不得先跳入设置页面。

空方案主区域显示：

```text
开始为本次拍摄搜集样片

[小红书找样片]  [从电脑导入]  [Alt+A 截取样片]
                                      [打开抖音]
```

### 3.2 搜集样片

所有采集渠道统一产出一个 `Reference`：

- 本地导入；
- 全局截图；
- 由远程浏览内容产生的截图；
- 现有项目中的历史图片；
- 未来可能加入的纯 URL 引用，但 v5 不以此替代本地图像。

采集成功后应：

1. 将样片加入明确的当前方案；
2. 默认保持在“未编排”状态；
3. 更新当前方案的样片数量；
4. 给出低干扰结果反馈；
5. 允许用户继续搜集，不自动强制进入编排页。

### 3.3 编排拍摄

“编排拍摄”页面至少包含：

- 未编排样片；
- 拍摄分组列表；
- 当前分组内容；
- 新建分组；
- 拖动排序；
- 样片备注；
- 将样片加入分组；
- 从分组移除条目，但保留样片本身。

业务语义：

- `Reference` 是被搜集的样片资产；
- `ShotItem` 是某个拍摄分组中对该样片的一次使用；
- 同一个 `Reference` 可以被不同 `ShotItem` 引用，因此可用于多个分组而无需复制图片文件；
- “未编排”表示该 `Reference` 没有任何 `ShotItem`；
- 从一个分组移除 `ShotItem` 不等于删除 `Reference`；
- 从方案移除 `Reference` 时，如果仍被拍摄条目使用，必须清楚提示影响并在同一事务中处理关系。

### 3.4 导出方案

PDF 顺序必须完全由以下顺序决定：

```text
拍摄方案
  -> shot_groups.position
      -> shot_items.position
```

导出配置保持有限：

- 每页样片数量；
- 是否显示样片备注；
- 是否显示来源；
- 是否显示可打印勾选框；
- 输出位置。

导出前必须显示：

- 分组数量；
- 拍摄条目数量；
- 将跳过的丢失图片；
- 输出路径；
- 当前配置摘要。

导出结果分别显示：

- 成功生成；
- 已输出条目数；
- 跳过条目数；
- 每个失败或跳过原因；
- 打开 PDF；
- 打开所在文件夹。

---

## 4. 目标领域模型

### 4.1 核心实体

#### ShootPlan

代表一次拍摄策划。可继续复用现有 `projects` 表及其稳定主键，避免无收益的物理表重命名；代码和 UI 对外使用 `ShootPlan` 语义。

建议字段：

```ts
interface ShootPlan {
  id: string | number;
  name: string;
  shootDate: string | null;
  clientName: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
```

#### Reference

代表加入某个拍摄方案的参考样片。

```ts
type ReferenceSourceKind =
  | 'local_import'
  | 'screen_capture'
  | 'xiaohongshu_capture'
  | 'douyin_capture'
  | 'legacy'
  | 'unknown';

interface Reference {
  id: string | number;
  planId: string | number;
  assetId: string | number;
  sourceKind: ReferenceSourceKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  capturedAt: string | null;
  createdAt: string;
}
```

`assetId` 应引用现有照片/文件实体；不得因 v5 重复复制全部历史图片。

#### ShotGroup

代表一段拍摄流程、场景或布光组合。

```ts
interface ShotGroup {
  id: string | number;
  planId: string | number;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}
```

#### ShotItem

代表在拍摄清单中对某张样片的一次引用。

```ts
interface ShotItem {
  id: string | number;
  groupId: string | number;
  referenceId: string | number;
  position: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 数据不变量

以下不变量必须由应用服务、数据库约束或二者共同保证：

- `ShotGroup.planId` 必须指向存在的方案；
- `Reference.planId` 必须指向存在的方案；
- `ShotItem.groupId` 和 `ShotItem.referenceId` 必须属于同一方案；
- 同一分组内 `position` 排序稳定；
- 同一方案内分组 `position` 排序稳定；
- 删除分组只删除该分组的 `ShotItem`，不删除 `Reference` 或原始文件；
- 删除 `Reference` 时必须删除其 `ShotItem` 关系，但不得删除用户原文件；
- 复制方案必须复制 Reference 关系、分组、顺序和备注；底层图片是否复用或复制，沿用现有安全资产策略，并由 Phase 0 查明后记录；
- 删除方案必须处理所有关系数据，但不删除用户原始文件；
- 空分组合法；
- 同一 Reference 可出现在多个分组；
- 未编排状态为派生状态，不单独存布尔字段，避免状态漂移。

### 4.3 推荐数据库变更

执行者必须先读取真实 schema，再决定现有表复用关系。逻辑上需要：

```sql
-- 名称仅为目标建议；如现有命名更适合，保留现有命名并在实现记录中映射。

CREATE TABLE shot_groups (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE plan_references (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  asset_id INTEGER NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'unknown',
  source_url TEXT,
  source_title TEXT,
  captured_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, asset_id)
);

CREATE TABLE shot_items (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  reference_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES shot_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_id) REFERENCES plan_references(id) ON DELETE CASCADE
);
```

索引至少覆盖：

- `shot_groups(project_id, position)`；
- `plan_references(project_id, created_at)`；
- `shot_items(group_id, position)`；
- `shot_items(reference_id)`。

实际主键类型、时间格式和外键策略必须与当前数据库保持一致，不得盲目复制上述 SQL。

### 4.4 旧数据迁移规则

1. 使用 `PRAGMA table_info(...)` 检查真实旧表字段；不得认为 `CREATE TABLE IF NOT EXISTS` 会补充旧表缺失列。
2. 所有 schema 变更放在显式迁移中，并记录 schema version。
3. 迁移在事务中执行；失败时回滚并保留原数据库。
4. 每个现有项目中的现有照片关系生成对应 Reference。
5. 无可验证来源的旧照片标记为 `legacy` 或 `unknown`。
6. 旧截图若能从现有字段可靠识别，可回填 `screen_capture`；不能可靠识别时不得猜测。
7. 如果现有选择状态是持久数据，可创建一个“原有已选样片”分组并按可恢复顺序迁移；如果只是 renderer 内存状态，则不迁移、不猜测。
8. 所有旧 Reference 默认未编排，除非存在可靠的持久关系可迁移。
9. 重复运行迁移不得产生重复 Reference、分组或条目。
10. 必须新增针对真实旧 schema 形状的回归测试。

---

## 5. 目标 Electron 架构

### 5.1 总体结构

```text
Renderer
  拍摄方案 UI / 样片池 / 分组 / 排序 / 备注 / 导出设置
        |
        | 仅调用语义化 window.pic API
        v
Preload
  参数校验 / 窄 IPC / 事件订阅释放
        |
        v
Application Services
  createPlan / importReferences / addShotItem / reorder / exportPlan
        |
        +-------------------------+
        v                         v
Domain                       Platform Services
  不变量与业务语义             Capture / Clipboard / Browser / Shell
        |
        v
Infrastructure
  SQLite repositories / file assets / thumbnails / PDF
```

### 5.2 主进程职责

主进程只负责需要桌面权限、进程生命周期或可信资源访问的操作：

- 窗口生命周期；
- `Alt+A` 注册和释放；
- 屏幕源获取；
- 截图遮罩窗口；
- 截图保存；
- 剪贴板写图；
- 文件选择和受控文件访问；
- SQLite 连接和迁移；
- PDF 文件写入；
- 小红书远程浏览容器；
- 外部 URL 验证和打开；
- IPC handler 注册；
- 应用日志和可诊断错误。

主进程不得包含 DOM 状态、当前卡片展开状态或拖动视觉逻辑。

### 5.3 Preload 边界

renderer 不得直接获得以下对象：

- `ipcRenderer`；
- `fs`；
- `path`；
- SQLite 连接；
- `shell.openExternal`；
- `desktopCapturer`；
- 任意执行 SQL 的通用函数。

目标 API 使用业务语义，例如：

```ts
window.pic.plans.list()
window.pic.plans.create(input)
window.pic.plans.update(planId, patch)
window.pic.plans.duplicate(planId)
window.pic.plans.remove(planId)

window.pic.references.importFiles(planId)
window.pic.references.remove(planId, referenceId)
window.pic.references.list(planId)

window.pic.shotGroups.create(planId, input)
window.pic.shotGroups.rename(planId, groupId, name)
window.pic.shotGroups.reorder(planId, orderedGroupIds)
window.pic.shotGroups.remove(planId, groupId)

window.pic.shotItems.add(planId, groupId, referenceId)
window.pic.shotItems.updateNote(planId, itemId, note)
window.pic.shotItems.reorder(planId, groupId, orderedItemIds)
window.pic.shotItems.remove(planId, itemId)

window.pic.capture.start()
window.pic.capture.onCompleted(listener)

window.pic.export.preflight(planId, options)
window.pic.export.pdf(planId, options)

window.pic.materialBrowser.showXiaohongshu()
window.pic.materialBrowser.hide()
window.pic.external.openDouyin()
```

API 名称应按真实代码风格调整，但必须保持窄、可验证、不可用来执行任意底层操作。

### 5.4 应用服务

应用服务协调事务和平台能力。至少应形成以下用例边界：

- `CreateShootPlan`
- `DuplicateShootPlan`
- `DeleteShootPlan`
- `ImportReferences`
- `SaveCapturedReference`
- `CreateShotGroup`
- `RenameShotGroup`
- `ReorderShotGroups`
- `AddReferenceToGroup`
- `ReorderShotItems`
- `UpdateShotItemNote`
- `RemoveShotItem`
- `RemoveReference`
- `BuildPlanExportModel`
- `ExportPlanPdf`

renderer 不得跨多个 IPC 自行拼装一个需要原子性的业务事务。例如“删除样片并删除所有拍摄条目”必须是一个应用服务调用。

### 5.5 Renderer 策略

- 保留现有技术栈，分阶段拆模块；
- 不以 v5 为理由改用 React/Vue；
- 保持经典脚本兼容，除非 Phase 0 证明当前构建已完整支持模块化并且迁移风险可控；
- 将状态更新与 DOM 更新分离；
- 建立单一的当前方案状态；
- 拖动排序先更新 UI，再调用持久化；失败必须回滚 UI 并提示；
- 所有事件订阅在视图销毁或重新初始化时释放，防止重复绑定；
- 不把数据库记录结构直接当作界面状态结构。

### 5.6 小红书远程内容隔离

目标是将小红书从本地 PIC 页面权限中完全隔离。

安全要求：

- `nodeIntegration: false`；
- `contextIsolation: true`；
- `sandbox: true`；
- 不向远程网页暴露 PIC preload；
- 独立持久 session，仅用于小红书；
- 只允许 `https:`；
- 允许域名使用明确 allowlist；
- 拒绝任意 `window.open`；
- 非允许导航受控外部打开或拒绝；
- 权限请求默认拒绝，除非 v5 明确需要；
- 禁止远程内容直接触达截图、数据库、文件系统或剪贴板；
- 外部 URL 在调用 `shell.openExternal` 前解析并验证协议和域名。

Electron 官方已不建议长期依赖 `<webview>`。v5 目标架构使用由主进程托管的 `WebContentsView`。但迁移必须作为独立阶段执行，先建立静态与真实 Electron 回归证据，再删除旧 `<webview>` 路径；不得长期保留双实现或隐藏开关。

### 5.7 长任务与性能

以下操作不得长时间阻塞 renderer：

- 批量缩略图生成；
- 大量图片尺寸读取；
- PDF 生成；
- 大批量导入；
- 数据库迁移。

优先将工作放在主进程的异步服务；只有通过测量证明主进程阻塞明显时，再引入 `utilityProcess` 或 worker。不得为架构形式提前增加进程复杂度。

---

## 6. 目标界面与交互

### 6.1 一级信息架构

```text
拍摄方案
  最近方案
  新建方案
  已归档方案（仅在现有数据支持或本阶段明确实现时出现）

当前拍摄方案
  1 搜集样片
  2 编排拍摄
  3 导出方案
```

若 v5 不实现归档，不得显示不可用的“已归档方案”。

### 6.2 顶部上下文

所有主要页面必须明显显示：

- 当前拍摄方案名称；
- 可选拍摄日期；
- 当前样片数量；
- 未编排数量；
- 当前三阶段位置。

尤其在素材浏览和截图反馈中，必须显示当前方案名称，降低样片进入错误方案的风险。

### 6.3 搜集样片页

主要入口：

- 小红书找样片；
- 从电脑导入；
- `Alt+A` 截取样片。

次要入口：

- 打开抖音。

页面可同时显示最近加入的样片，但不得把用户自动带离搜集流程。

### 6.4 编排拍摄页

推荐桌面布局：

```text
+----------------+-----------------------------------------+
| 未编排 8       | 当前分组：窗边逆光                     |
| 白墙自然光 6   |                                         |
| 窗边逆光 5     | [样片卡] [样片卡] [样片卡]             |
| 夜景闪光 4     | 拖动排序 / 编辑拍摄备注                 |
|                |                                         |
| + 新建分组     |                                         |
+----------------+-----------------------------------------+
```

必须支持：

- 选择“未编排”；
- 选择分组；
- 创建和重命名分组；
- 分组排序；
- 多选样片加入分组；
- 单张或多张加入分组；
- 组内排序；
- 编辑条目备注；
- 从分组移除条目；
- 从方案移除样片；
- 明确区分“从分组移除”和“从方案移除”。

不要求 v5 支持任意二维自由排版。

### 6.5 样片卡片

最小信息：

- 缩略图；
- 是否已编排；
- 所在分组数量或名称摘要；
- 可编辑拍摄备注（在 ShotItem 上）；
- 来源图标或来源摘要，可弱化显示。

不得在卡片上堆叠大量长期资产字段。

### 6.6 备注

v5 使用自由文本备注，不建立标签数据库。可提供轻量提示文字：

```text
例如：参考人物姿势和机位；右侧窗光；准备白色椅子。
```

备注写入规则：

- 失焦或显式保存时持久化；
- 对快速连续输入做 debounce；
- 窗口关闭前仍有未完成写入时必须 flush；
- 保存失败时不得静默丢失，保留文本并提示重试。

### 6.7 删除语义

使用清晰的中文动作：

- “从此分组移除”：删除 ShotItem；
- “从拍摄方案移除”：删除 Reference 及其所有 ShotItem 关系；
- “删除拍摄分组”：删除该组条目，样片继续保留在方案中；
- “删除拍摄方案”：删除 PIC 内的方案关系，不删除用户原文件。

确认对话框必须描述影响，不使用模糊的“确定删除吗”。

---

## 7. 截图与采集架构

### 7.1 `Alt+A` 不得回退

`Alt+A` 是 v5 核心功能，必须：

- 应用运行时全局可用；
- 在主进程只注册一次；
- 应用退出时注销；
- 避免重复注册和多次触发；
- 正确处理多显示器和 DPI；
- 截图遮罩不被捕获进最终图像；
- 取消截图不创建空记录；
- 成功后分别执行方案导入和剪贴板写入；
- 两个结果分别报告，不能用一个布尔值掩盖部分失败。

目标结果结构：

```ts
interface CaptureCompletion {
  captureCreated: boolean;
  importedToPlan: {
    success: boolean;
    planId: string | number | null;
    referenceId?: string | number;
    error?: string;
  };
  copiedToClipboard: {
    success: boolean;
    error?: string;
  };
}
```

### 7.2 无当前方案

不得把截图默默导入一个用户不知情的方案。

优先行为：

1. 截图完成后先安全保存临时结果；
2. 显示最近方案选择；
3. 允许创建新方案；
4. 用户取消方案选择时，仍报告剪贴板结果；
5. 临时文件按明确策略清理，不留下无限垃圾。

如果现有产品保证始终存在当前方案，执行者仍必须测试启动、删除最后一个方案、数据库为空等边界。

### 7.3 来源记录

- 本地导入：`local_import`；
- 普通全局截图：`screen_capture`；
- 从 PIC 内嵌小红书页面发起且能可靠关联当前 URL 时：`xiaohongshu_capture` + URL；
- 用户从外部抖音页面截图时，除非存在可靠上下文，不得猜测为 `douyin_capture`，可以保存为普通屏幕截图；
- 来源信息是辅助，不应阻碍采集。

---

## 8. PDF 方案规格

### 8.1 内容顺序

1. 可选封面；
2. 方案名称；
3. 拍摄日期、客户/模特和主题说明（有值才显示）；
4. 分组名称；
5. 按 position 排列的 ShotItem；
6. 对应样片；
7. 可选备注；
8. 可选来源；
9. 可选打印勾选框。

### 8.2 缺失素材

导出前扫描所有条目：

- 文件存在且可读：正常；
- 文件丢失：列入 preflight；
- 图片损坏：列入 preflight；
- 不支持格式：列入 preflight；
- 重复使用同一 Reference：按 ShotItem 正常重复出现在对应位置。

默认不得在用户不知情时生成缺页 PDF。若用户明确选择“跳过并继续”，结果中必须列出跳过项。

### 8.3 版式

- 优先清晰和打印可读，不做模板设计器；
- 横竖图使用统一容器和 `contain` 逻辑，禁止拉伸变形；
- 备注不得覆盖图片；
- 分组标题不可孤立在页尾；
- 中文字体必须在目标环境中稳定；
- 长备注要截断、换页或限制输入长度，行为必须确定；
- PDF 页码可选，但若实现必须稳定。

### 8.4 文件命名

推荐：

```text
{安全化方案名称}-{YYYY-MM-DD}-拍摄方案.pdf
```

必须过滤 Windows 非法字符，并处理同名文件；不得静默覆盖，除非用户在保存对话框中明确确认。

---

## 9. 分阶段执行计划

每个阶段必须：

1. 开始前确认 `git status --short`；
2. 不重置、不覆盖用户已有未提交工作；
3. 只处理本阶段范围；
4. 完成本阶段验证；
5. 检查 `git diff --check`；
6. 审查 diff；
7. 独立提交；
8. 报告提交 SHA、验证结果和遗留问题；
9. 验证失败时停止，不得带着未知失败进入下一阶段。

### Phase 0：真实基线盘点与执行锁定

#### 目标

建立 v5 改造的可信基线，不修改产品行为。

#### 必做检查

- 读取仓库级指令文件；
- `git status --short`、当前分支、最近提交；
- `package.json`、锁文件、Electron 版本、构建和测试脚本；
- 主进程入口、preload、renderer 入口；
- 当前数据库初始化、迁移、项目/图片/选择/引用相关表；
- `PRAGMA table_info(...)` 和关键索引；
- 当前项目复制、删除及图片迁移逻辑；
- 当前 `Alt+A` 注册、截图窗口、保存、剪贴板和事件反馈；
- 当前小红书 `<webview>`、session、导航和外部链接处理；
- 当前 PDF 和桌面复制入口及选择语义；
- 当前测试布局；
- 当前真实 Electron 启动方式；
- 当前未提交改动与本计划可能重叠的位置。

#### 产物

在实施记录或本次任务报告中列出：

- 真实文件映射；
- 真实数据库映射；
- 现有行为与目标行为差异；
- 需保留的未提交工作；
- 每个后续阶段将修改的确切文件；
- 预计新增文件；
- 当前基线测试结果。

#### 验证

- 运行现有快速测试；
- 运行类型检查/静态检查；
- 运行当前源码构建；
- 能安全启动真实 Electron 时，验证主窗口、现有项目、小红书和一次截图基本路径；
- 不运行 `build:win` 或 `electron-builder`。

#### 停止条件

- 工作区存在与 v5 冲突且无法安全绕开的用户改动；
- 数据库真实结构无法确认；
- 基线测试存在与本任务无关但阻止后续判断的失败；
- 当前数据备份或迁移回滚策略无法建立。

#### 提交

通常不提交；如果只新增审计记录，可提交：

```text
docs: record PIC v5 implementation baseline
```

### Phase 1：领域模型与安全数据库迁移

#### 目标

在不改变主要 UI 的前提下，建立 ShootPlan、Reference、ShotGroup、ShotItem 的数据能力。

#### 工作项

- 引入 schema version 或接入现有迁移机制；
- 创建/扩展 v5 所需表和索引；
- 将现有项目照片迁移为 Reference；
- 加入字段和约束兼容迁移；
- 建立 repositories；
- 建立领域类型和数据映射；
- 建立排序规范化函数；
- 建立事务化的分组、条目和删除操作；
- 保持现有 UI 暂时可使用旧入口，但底层不得形成两套互相漂移的数据真相。

#### 必测场景

- 空数据库首次创建；
- 真实旧 schema 升级；
- 缺少时间字段的旧 schema；
- 重复启动迁移；
- 迁移中途失败回滚；
- 现有项目照片全部生成 Reference；
- 同一项目不产生重复 Reference；
- 创建、重命名、排序、删除分组；
- 同一 Reference 加入多个分组；
- 删除分组后 Reference 保留；
- 删除 Reference 后 ShotItem 关系删除；
- 删除/复制方案保持原有安全语义；
- 排序 position 在增删移动后连续或可稳定排序。

#### 停止条件

- 需要破坏性重建用户数据库才能继续；
- 无法证明旧数据完整保留；
- 项目删除或复制回归；
- 迁移不是幂等的。

#### 提交

```text
feat: add PIC v5 shoot planning data model
```

### Phase 2：应用服务与窄 IPC

#### 目标

把 v5 业务用例放入可测试应用服务，通过 preload 暴露语义化 API。

#### 工作项

- 建立计划、样片、分组、条目和导出应用服务；
- IPC handler 只做输入验证、调用服务和错误映射；
- preload 只暴露允许的 API；
- 建立共享输入/输出契约；
- 验证 IPC sender；
- 事件订阅 API 返回 unsubscribe 或提供可靠释放方式；
- 将截图完成结果改为方案导入与剪贴板分别报告；
- 逐步替换 renderer 对通用 IPC 或底层 API 的依赖；
- 删除已完全替代的旧 IPC，不保留无调用的旁路。

#### 错误模型

至少区分：

- validation error；
- not found；
- conflict；
- filesystem error；
- database error；
- platform error；
- partial capture completion；
- export preflight error。

UI 文案不得直接展示原始堆栈，但日志保留可诊断上下文。

#### 验证

- 应用服务单元测试；
- IPC 输入校验测试；
- sender 验证；
- preload 暴露面快照或契约测试；
- 重复初始化不重复注册 handler；
- 旧功能通过新服务仍可工作。

#### 停止条件

- renderer 仍需通用 SQL、fs 或 shell 权限才能完成核心流程；
- 同一业务写操作存在新旧两条并行实现；
- IPC 错误无法稳定映射。

#### 提交

```text
refactor: establish PIC v5 application and IPC boundaries
```

### Phase 3：v5 产品外壳与语言收束

#### 目标

把界面明确收束为拍摄前策划工具，但暂不完成全部编排细节。

#### 工作项

- 用户可见“项目”统一改为“拍摄方案”；
- 用户可见“照片/图库”在策划上下文中改为“样片/样片池”；
- 建立三阶段导航；
- 强化当前方案名称和样片数量；
- 新建方案字段和流程；
- 空方案直接显示采集入口；
- 复制、删除和切换方案文案更新；
- 删除旧的、与唯一用途冲突的 UI；
- 不保留重复入口、隐藏模式或旧产品方向开关；
- 保持已存在且仍在 v5 范围内的功能可达。

#### 验证场景

- 首次启动无方案；
- 新建第一个方案；
- 切换多个方案；
- 复制方案；
- 删除非当前方案；
- 删除当前方案；
- 删除最后一个方案；
- 重启恢复当前方案；
- 每个页面都能识别当前方案；
- 旧术语不再出现在主要界面和主要提示中。

#### 停止条件

- 改名造成数据库物理迁移或旧数据损坏；
- 用户无法判断当前样片的导入目标；
- 旧入口和新入口同时存在且语义重复。

#### 提交

```text
feat: refocus PIC on pre-shoot sample planning
```

### Phase 4：统一样片采集

#### 目标

让本地导入、截图和远程素材采集都形成统一 Reference，并进入当前方案。

#### 工作项

- 本地导入走 `ImportReferences`；
- 截图走 `SaveCapturedReference`；
- 现有历史图片通过 Reference 展示；
- 来源元数据按可靠信息写入；
- 新样片默认未编排；
- 搜集页显示最近加入和总数；
- 截图反馈包含方案名称；
- 导入失败逐项报告；
- 文件重复策略明确，不能无意无限复制；
- 保留原文件安全语义；
- 实现无当前方案的截图处理。

#### `Alt+A` 必测矩阵

- PIC 主窗口前台；
- PIC 主窗口后台；
- 小红书内容获得焦点；
- 外部浏览器获得焦点；
- 单显示器；
- 多显示器；
- 不同 DPI；
- 取消截图；
- 保存成功 + 剪贴板成功；
- 保存成功 + 剪贴板失败；
- 保存失败 + 剪贴板成功；
- 无当前方案；
- 连续截图；
- 应用重启后只触发一次。

#### 验证证据

- 数据库中 Reference 记录；
- 实际图片文件；
- UI 中当前方案新增样片；
- 剪贴板可粘贴图片；
- 两个结果独立提示；
- 重启后样片存在。

仅凭 `{ success: true }` 或 IPC 返回值不算真实 Electron 验证。

#### 停止条件

- 任何路径可能导入错误方案而不提示；
- 截图回归；
- 原文件可能被修改或删除；
- 导入和截图仍形成不兼容的数据模型。

#### 提交

```text
feat: unify sample collection into shoot plans
```

### Phase 5：拍摄分组、排序和备注

#### 目标

交付 v5 的核心差异：把样片变成可以照着拍的清单。

#### 工作项

- 未编排样片视图；
- 创建、重命名、删除分组；
- 分组排序；
- 单选和多选样片加入分组；
- 同一样片加入多个分组；
- 分组内条目排序；
- 从分组移除；
- 从方案移除；
- 拍摄备注编辑与可靠保存；
- 分组和条目数量；
- 空分组、空未编排视图和错误状态；
- 键盘可达的非拖动排序替代方式，至少提供上移/下移；
- 在操作失败时回滚乐观 UI。

#### 交互约束

- 拖动目标清晰；
- 不能因点击拖动把样片误删；
- 删除动作不与排序手势重叠；
- 分组删除明确说明样片仍保留；
- 备注写入失败不丢文本；
- 重新切换分组不会重复绑定事件；
- 大量快速排序最终以最后一次用户顺序为准。

#### 必测场景

- 0/1/多个分组；
- 0/1/大量样片；
- 同一样片进入两个分组；
- 跨分组移动与复制语义；
- 组内首位、中间、末尾排序；
- 删除分组后样片回到未编排派生状态；
- Reference 仍在其他分组时不显示为未编排；
- 长中文备注、空备注和快速输入；
- 切换方案时状态完全隔离；
- 关闭重启后顺序和备注一致；
- 复制方案后分组、条目和备注完整且新旧方案互不影响。

#### 停止条件

- 排序只在 UI 中生效、重启后丢失；
- 删除分组会删除图片文件；
- 同一 Reference 多分组产生文件副本或数据冲突；
- 备注可能静默丢失。

#### 提交

```text
feat: add ordered shot groups and planning notes
```

### Phase 6：拍摄方案 PDF

#### 目标

将现有“选中照片导出 PDF”升级为按拍摄清单生成的方案 PDF。

#### 工作项

- 建立 `BuildPlanExportModel`；
- PDF 只读取稳定的导出模型，不直接读取 DOM；
- 按分组和条目 position 排序；
- 导出前 preflight；
- 支持有限配置；
- 横竖图不变形；
- 备注、来源和勾选框可选；
- 文件名安全化；
- 部分失败需用户确认；
- 导出结果可打开 PDF 和所在文件夹；
- 旧选择型 PDF 入口被替代后删除，不保留重复主要入口；
- “复制样片到桌面”若保留，应明确复制的是拍摄清单样片或当前选择，并使用清楚文案。

#### PDF 验证

- 自动测试导出模型顺序；
- 生成 PDF 后检查页数、文本、图片数量；
- 渲染 PDF 为图片并目视检查；
- 检查中文、横图、竖图、长备注、空分组；
- 检查丢失文件的 preflight 和跳过结果；
- 检查 Windows 非法文件名；
- 检查同一 Reference 在不同组中正确重复出现；
- 对比 UI 顺序和 PDF 顺序。

#### 停止条件

- PDF 顺序与 UI 不一致；
- 存在静默跳过；
- 图片被拉伸；
- 旧导出入口与新入口语义冲突；
- 生成成功提示不能证明文件实际存在且可打开。

#### 提交

```text
feat: export executable shoot-plan PDFs
```

### Phase 7：小红书 WebContentsView 与安全加固

#### 目标

把小红书远程内容迁移到主进程托管、严格隔离的 `WebContentsView`，删除旧 `<webview>` 路径。

#### 工作项

- 盘点现有 `<webview>` 生命周期和真实登录行为；
- 建立独立 session partition；
- 创建/销毁 WebContentsView；
- 与本地界面布局同步 bounds；
- 处理窗口缩放、最小化、页面切换和 DPI；
- 只允许小红书目标域名；
- 限制导航、重定向、新窗口和下载；
- 受控外部链接；
- 默认拒绝权限请求；
- 处理加载、错误、崩溃和重试状态；
- 继续确保初始页面实际加载而非停留 `about:blank`；
- 迁移验证通过后删除 `<webview>`、`webviewTag` 和相关旧代码；
- 不恢复抖音内嵌。

#### 真实 Electron 验证

- 页面从真实启动进入小红书目标页；
- 登录 session 重启后按预期保留；
- 本地 PIC UI 和远程页面边界正确；
- 页面切换后 view 隐藏，不能遮挡本地 UI；
- 调整窗口大小后 bounds 正确；
- 外部非允许链接不在 PIC 权限环境打开；
- 弹窗受控；
- 小红书无 Node/PIC API；
- 远程 renderer 崩溃后本地策划数据不受影响；
- `Alt+A` 在远程视图获得焦点时仍有效；
- 无 `about:blank` 回归。

#### 停止条件

- 真实登录或关键页面无法工作；
- WebContentsView 遮挡或焦点问题破坏核心流程；
- 无法证明远程内容隔离；
- 旧新实现必须长期并存才能工作。

如果本阶段遇到 Electron 当前版本的明确阻塞，停止并提交证据，不得用降低安全配置绕过。v5 其他阶段可以保持已验证的安全 `<webview>` 实现，但必须如实报告未完成的迁移；不得声称完整达到目标架构。

#### 提交

```text
refactor: isolate Xiaohongshu in WebContentsView
```

### Phase 8：韧性、性能与可访问性

#### 目标

处理 v5 新工作流中的故障恢复和明显性能问题，不扩张产品范围。

#### 工作项

- 缺失图片的稳定占位和说明；
- 导出前文件检查；
- 缩略图错误不拖垮整个页面；
- 图片加载并发限制；
- 必要时虚拟化样片列表；
- 项目切换取消过期异步结果；
- 重复事件监听检查；
- 键盘焦点、按钮名称和对话框焦点；
- 拖动操作提供按钮替代；
- 高 DPI 和窗口缩放检查；
- 数据库写失败的可恢复提示；
- 日志不记录敏感 cookie、页面凭证或完整用户隐私内容。

#### 性能基线

至少测量：

- 100 张样片方案首次打开；
- 100 张样片方案再次打开；
- 1,000 张样片方案打开；
- 未编排视图滚动；
- 100 个拍摄条目 PDF 生成；
- 连续导入 50 张图片。

记录机器环境和测量方法。只有测量证明需要时才引入虚拟列表或 worker。

#### 停止条件

- 优化改变图片或条目顺序；
- 缓存成为新的数据真相；
- 为性能引入大范围框架迁移；
- 错误恢复可能删除用户数据。

#### 提交

```text
fix: harden PIC v5 planning workflows
```

### Phase 9：版本、清理与最终验收

#### 目标

移除被替代路径，统一版本为 5.0.0，完成源码级验收。

#### 工作项

- 删除无引用旧代码、旧按钮、旧 CSS 和旧 IPC；
- 搜索旧产品术语和被淘汰功能；
- 检查所有版本来源；
- 更新 `package.json`、锁文件和应用显示版本；
- 更新必要的用户说明；
- 检查数据库迁移版本；
- 检查新安装与旧数据升级；
- 完整执行测试、静态检查和源码构建；
- 完整真实 Electron 走查；
- 汇总每阶段提交；
- 确认没有生成 `.exe` 或发布产物。

#### 全流程验收

至少完成以下真实流程：

```text
1. 从旧数据库启动 PIC
2. 打开一个迁移后的旧拍摄方案
3. 新建一个拍摄方案
4. 从本地导入样片
5. 打开内嵌小红书并确认真实页面
6. 在小红书或其他应用前台按 Alt+A
7. 选区截图
8. 确认截图进入当前方案
9. 确认图片可从剪贴板粘贴
10. 创建三个拍摄分组
11. 将样片加入分组
12. 同一样片加入另一个分组
13. 调整分组和组内顺序
14. 添加中文拍摄备注
15. 关闭并重启应用
16. 确认方案、样片、分组、顺序、备注全部恢复
17. 执行 PDF preflight
18. 导出 PDF
19. 打开并目视核对 PDF
20. 确认 PDF 顺序与 UI 一致
21. 复制方案并确认新旧方案互不影响
22. 删除分组并确认样片仍存在
23. 删除方案并确认用户原文件仍存在
```

#### 最终提交

```text
chore: release PIC 5.0.0 source
```

不得在没有实际生成并验证发布包的情况下声称“portable 已验证”或“安装包已验证”。默认只报告当前源码 Electron 验证。

---

## 10. 测试策略

### 10.1 单元测试

- 领域不变量；
- 排序规范化；
- 删除影响范围；
- 同一 Reference 多分组；
- 导出模型排序；
- 文件名安全化；
- URL allowlist；
- IPC 参数校验；
- 错误映射；
- 截图部分成功结果。

### 10.2 数据库测试

- clean install；
- 真实 legacy schema；
- 缺列 schema；
- 重复迁移；
- 迁移回滚；
- foreign key 和 cascade；
- 复制方案；
- 删除方案；
- 项目切换隔离；
- 顺序持久化。

测试数据库必须使用临时目录，不修改用户真实数据库。

### 10.3 应用服务集成测试

- 新建方案到 Reference；
- Reference 到 ShotItem；
- 分组和条目排序；
- 删除事务；
- 复制完整方案；
- preflight 到 PDF；
- 文件缺失错误；
- 截图保存与方案写入结果组合。

### 10.4 Renderer 测试

按当前项目测试能力选择 DOM 测试或真实 Electron 自动化，不为测试而更换框架。至少覆盖：

- 三阶段导航；
- 当前方案上下文；
- 空状态；
- 分组创建和切换；
- 排序后的 UI；
- 备注保存失败；
- 删除语义；
- 导出 preflight。

### 10.5 真实 Electron 验证

以下能力不能仅靠单元测试或静态代码宣称完成：

- 小红书实际加载；
- WebContentsView bounds、焦点和 session；
- 全局 `Alt+A`；
- 真实屏幕截图；
- 真实剪贴板图像；
- 文件选择器；
- PDF 实际生成和打开；
- 关闭重启后的数据恢复。

验证优先使用当前源码 Electron，不使用旧 portable 包代替源码验证。

### 10.6 每阶段标准命令

Phase 0 必须从 `package.json` 确认真实脚本，之后记录确切命令。默认使用 Windows PowerShell 下的 `npm.cmd`。典型集合可能是：

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
git diff --check
```

不得假定所有脚本都存在；不得因某脚本不存在而临时创造无关工具链。经典脚本缺少 `type="module"` 的 Vite 警告在构建成功且针对性验证通过时不自动视为失败，但必须记录。

---

## 11. 安全清单

- 本地 renderer 使用 context isolation；
- 不向 renderer 暴露 Node；
- preload API 最小化；
- IPC 校验参数和 sender；
- 所有文件路径在可信侧解析；
- SQL 参数化；
- 不允许 renderer 执行任意 SQL；
- 小红书远程内容无 Node、无 PIC preload；
- 小红书独立 session；
- 导航和新窗口 allowlist；
- `shell.openExternal` 只接受解析并验证后的 `https:` URL；
- 不打开 `file:`、`javascript:`、`data:` 等不受信任外部链接；
- 默认拒绝远程权限请求；
- 截图临时文件有明确生命周期；
- 日志不记录 cookie、认证数据或图片二进制；
- 删除操作不删除用户原文件；
- 数据迁移事务化且可回滚；
- 使用当前受支持 Electron 版本时，升级作为独立、可回归的依赖阶段，不能与所有功能改造混在同一提交。

---

## 12. Git 与变更纪律

### 12.1 未提交工作

- 所有既有修改都视为用户工作；
- 不使用 `git reset --hard`；
- 不使用 `git checkout --` 丢弃文件；
- 不覆盖与本阶段无关的改动；
- 如与目标文件重叠，先理解并融合；无法安全融合时停止并报告。

### 12.2 提交边界

- 每个 Phase 独立提交；
- 不把无关格式化混入功能提交；
- 不一次提交完整 v5；
- 提交前查看 diff 和状态；
- 提交后记录 SHA；
- 测试失败不得提交为完成；
- 不擅自 push。

### 12.3 建议提交序列

```text
feat: add PIC v5 shoot planning data model
refactor: establish PIC v5 application and IPC boundaries
feat: refocus PIC on pre-shoot sample planning
feat: unify sample collection into shoot plans
feat: add ordered shot groups and planning notes
feat: export executable shoot-plan PDFs
refactor: isolate Xiaohongshu in WebContentsView
fix: harden PIC v5 planning workflows
chore: release PIC 5.0.0 source
```

根据真实实现可微调措辞，但不得合并阶段边界。

---

## 13. 执行者决策规则

### 13.1 可以自行决定

- 与现有代码风格一致的文件名；
- 模块内部函数拆分；
- 测试文件位置；
- 数据库物理表名，只要逻辑模型、迁移和兼容性满足要求；
- 小范围 CSS 实现；
- 错误类型的具体 TypeScript 表达；
- 不改变产品行为的重构细节。

### 13.2 必须停止并请求方向

- 需要删除、覆盖或不可逆迁移用户数据；
- 需要更换 Electron 或前端框架；
- 需要新增云服务、登录或第三方账户；
- 需要绕过小红书或抖音平台安全限制；
- 需要恢复已明确淘汰的功能；
- 需要默认打包或发布 `.exe`；
- 需要推送远程仓库；
- 真实需求与本计划唯一产品目标冲突；
- 现有未提交工作无法安全保留；
- WebContentsView 只能通过降低安全配置才能工作；
- 数据库迁移无法证明安全。

### 13.3 不得擅自扩张

执行过程中发现“顺便可以做”的功能，记录为后续建议，不纳入当前 Phase。特别禁止顺便加入：

- AI；
- 云同步；
- 更多平台；
- 自由画布；
- 标签系统；
- 图片编辑；
- 复杂主题；
- 新的打包体系；
- 全面状态管理框架；
- 前端框架重写。

---

## 14. Definition of Done

PIC v5.0.0 只有同时满足以下条件才能宣布完成：

### 产品

- [ ] 用户可以创建拍摄方案；
- [ ] 主界面明确围绕“搜集、编排、导出”；
- [ ] 用户能通过本地导入、小红书、抖音外部浏览配合截图、任意屏幕截图搜集样片；
- [ ] 新样片进入明确的当前方案；
- [ ] 用户能创建和排序拍摄分组；
- [ ] 用户能把样片加入一个或多个分组；
- [ ] 用户能排序拍摄条目；
- [ ] 用户能记录拍摄备注；
- [ ] 状态重启后恢复；
- [ ] 用户能导出顺序一致的拍摄方案 PDF；
- [ ] 删除不会伤害用户原文件。

### 架构

- [ ] Electron 保留；
- [ ] renderer 无 Node、fs、任意 SQL 和通用 shell 权限；
- [ ] preload 仅暴露窄业务 API；
- [ ] 业务事务位于应用服务；
- [ ] 数据访问封装在 repository/infrastructure；
- [ ] 小红书远程内容与 PIC 本地权限隔离；
- [ ] 旧 `<webview>` 已在 WebContentsView 验证成功后删除，或阻塞被如实记录且未声称完成；
- [ ] 无重复新旧业务路径；
- [ ] 无被淘汰 UI 的 dormant switch。

### 数据

- [ ] clean install 正常；
- [ ] 真实旧数据库迁移正常；
- [ ] 迁移幂等；
- [ ] 迁移失败可回滚；
- [ ] 项目复制和删除无回归；
- [ ] 原文件不被删除；
- [ ] 分组、排序和备注持久化可靠。

### 验证

- [ ] 单元测试通过；
- [ ] 数据库迁移测试通过；
- [ ] 应用服务集成测试通过；
- [ ] 静态检查通过；
- [ ] 当前源码构建通过；
- [ ] `git diff --check` 通过；
- [ ] 真实 Electron 主流程验证通过；
- [ ] `Alt+A` 的方案导入和剪贴板结果分别验证；
- [ ] 小红书真实页面验证；
- [ ] PDF 已实际生成、打开并目视检查；
- [ ] 未运行或未声称运行 portable 验证，除非用户另行明确要求。

### 版本与仓库

- [ ] 版本统一为 5.0.0；
- [ ] 每阶段独立提交；
- [ ] 工作区没有意外生成物；
- [ ] 用户原有未提交工作被保留；
- [ ] 未擅自 push。

---

## 15. 最终报告模板

执行完成后，Luna xhigh 必须使用以下结构报告，不得只说“已完成”：

```markdown
# PIC v5.0.0 实施报告

## 完成结果
- 产品主流程：
- 架构升级：
- 数据迁移：
- 小红书隔离：
- Alt+A：
- PDF：

## 阶段提交
| Phase | Commit | 主要变更 | 验证 |
|---|---|---|---|
| 1 | <sha> | ... | ... |

## 数据兼容
- 测试的旧 schema：
- 迁移结果：
- 回滚/失败测试：
- 原文件安全验证：

## 自动验证
- `<exact command>`：通过/失败
- `<exact command>`：通过/失败

## 真实 Electron 验证
- 新建方案：
- 本地导入：
- 小红书实际页面：
- Alt+A 截图加入方案：
- 剪贴板图片：
- 分组/排序/备注重启恢复：
- PDF 实际打开：

## 未完成或限制
- 明确列出，不得隐藏；
- 区分代码问题、环境问题和工具问题；
- 说明是否影响 v5 Definition of Done。

## 工作区状态
- `git status --short`：
- 是否存在用户原有改动：
- 是否生成安装包：否（除非用户明确要求）
- 是否 push：否（除非用户明确要求）
```

---

## 16. 给 Luna xhigh 的最终执行指令

1. 从 Phase 0 开始，不跳过真实仓库、数据库和 Electron 页面盘点。
2. 把本计划视为范围和验收合同，不把示例路径视为未经核实的事实。
3. 先保护现有用户数据和未提交工作，再实施功能。
4. 每次只完成一个 Phase，验证后独立提交。
5. 不迁移 Electron，不重写前端框架。
6. 不加入本计划明确排除的功能。
7. 任何数据库修改必须兼容旧数据、幂等、可回归测试。
8. 任何远程网页不得获得本地 PIC 权限。
9. `Alt+A` 必须真实验证导入和剪贴板两个独立结果。
10. 真实运行行为不能由静态代码或 API 成功对象代替。
11. 默认不运行 `electron-builder`、`build:win`，不生成 `.exe`。
12. 遇到工具故障时区分工具失败与项目失败，使用安全替代验证并如实报告。
13. WebContentsView 迁移失败时不得降低安全设置，不得保留未经说明的双实现。
14. 完成后按第 15 节模板交付证据化报告。

PIC v5.0.0 的最终形态应当非常明确：

> 打开一个拍摄方案，快速搜集样片，把样片排成拍摄清单，写下要模仿的重点，然后导出一份可以照着拍的 PDF。

除此之外，不扩张。

---

## 17. 当前执行记录（2026-08-30）

本工作区已经按本计划落地一轮可运行的 v5 核心闭环，供后续执行者直接接续。以下状态是源码实际状态，不等同于“所有 Phase 已完成”。

### 已落地

- 用户界面主要术语已收束为“拍摄方案 / 样片池 / 拍摄清单”。
- 新增拍摄清单工作台：按 `chapter` 分组、组内上下移动和拖动排序、分组重命名、拍摄备注 debounce 保存、从清单移除但保留样片。
- 选中样片的主要入口改为“加入拍摄清单”，图库顶部重复的选择型“复制到桌面 / 导出 PDF”入口已删除。
- 修复 `project_shots` 更新时 `chapter` 未持久化的问题；从选择生成拍摄条目时会带入原有备注。
- 增加主进程拍摄方案 PDF 导出：主进程读取方案数据，按分组和顺序生成 A4 打印页面，包含样片、文件名、拍摄意图、构图/动作、灯光/器材、现场勾选框。
- 增加导出前文件预检、缺失文件确认、部分失败结果和导出记录；PDF 输出后仍可打开所在文件夹。
- 删除旧的 `photos:exportToPdf` renderer IPC 入口，避免与拍摄方案 PDF 形成两套主要导出路径。
- 版本已统一为 `5.0.0`，并更新 `electron/changelog.json`。
- 拍摄清单已从单表 `project_shots` 规范化为 `shot_groups / plan_references / shot_items`：空分组合法、同一参考样片可进入多个分组，组与条目顺序分别持久化。
- 为旧数据库增加显式事务迁移、幂等回归测试和惰性兼容迁移；旧调用方在启动后直接写入 `project_shots` 时，读取路径也会自动补齐规范化关系。
- 项目复制、完整删除迁移和选中样片跨项目移动会保留分组、参考来源、备注及空分组；目标项目不复制底层图片文件。
- 分组新增了创建、重命名、删除、上下移动的语义化 IPC 和空分组可操作入口；UI 静态守护测试覆盖这些入口。
- 小红书浏览器已改为主进程托管的 `WebContentsView`：独立持久化 partition、sandbox/contextIsolation、HTTPS 域名 allowlist、导航/重定向/弹窗/权限拦截、加载错误状态、下载转发、renderer bounds/visibility IPC；旧 `<webview>` 与 `webviewTag` 已删除。

### 当前提交

| Commit | 内容 |
|---|---|
| `7e38a35` | 拍摄方案主流程、工作台 UI、旧术语收束 |
| `87de62f` | v5.0.0 版本号、锁文件和变更日志 |
| `13b8b98` | 带备注的拍摄方案 PDF、预检、旧选择型导出入口清理 |
| `bd38629` | preload 暴露 `chapter` 更新字段 |
| `dc57dc4` | 规范化 `ShotGroup / Reference / ShotItem`、迁移兼容、分组 UI 与复制/移动回归 |
| `04178dd` | 小红书 `WebContentsView`、独立 session、安全导航和 bounds/visibility IPC |

### 尚未完成，接续时必须处理

1. `WebContentsView` 源码迁移已完成，但本机 Electron 二进制安装不完整（`node_modules/electron` 缺少可执行文件，安装缓存写入返回 `EPERM`），尚未完成真实窗口中的登录 session、bounds、缩放、焦点、崩溃恢复和 Alt+A 走查；不得把源码构建描述成完整运行验收。
2. 同一 Electron 环境阻塞了真实截图、剪贴板、小红书页面和 PDF 实际打开走查。
3. PDF HTML 模型和缺失文件预检已有自动测试；真实 Chromium `printToPDF` 输出、中文字体、长备注分页、横竖图视觉质量仍需在 Electron 可启动环境中验收。

### 本轮验证证据

- `npm.cmd run typecheck`：通过。
- `npm.cmd run lint`：通过，保留仓库原有 11 条 `no-explicit-any` warning，无 error。
- `npm.cmd run build`：通过；经典脚本缺少 `type="module"` 的 Vite 提示属于既有兼容策略。
- `npm.cmd test -- tests/services/projectShots.test.ts tests/services/databaseMigration.test.ts tests/services/projectManagement.test.ts`：10/10 通过（规范化模型、旧 schema、复制/删除/移动）。
- `npm.cmd test -- tests/uiux/performance.static.test.ts`：19/19 通过。
- `npm.cmd test -- tests/services/planningPdfExport.test.ts tests/services/databaseMigration.test.ts`：5/5 通过。
- `npm.cmd test`：19 个测试文件通过，134 个测试通过；`cacheManager.test.ts` 和 `import.test.ts` 因 `node_modules/electron` 缺少可执行文件而无法收集（2 个环境阻塞 suite），没有断言失败。
- 未运行 `electron-builder` / `build:win`，未生成 `.exe`，未 push 远程仓库。
