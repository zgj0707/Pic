# Pic 素材浏览器接入抖音执行规划

> 目标执行模型：Luna，reasoning effort = xhigh
> 项目目录：`E:\Pic\photo-gallery`
> 文档性质：可执行工程规划，不代表已经完成代码改动
> 核心原则：保留现有未提交工作；一次只完成、验证并提交一个阶段

## 执行记录（2026-08-27）

- 阶段 0：已完成真实源码审计；当前抖音决策为 `visible_browser`，未提供抖音开放平台凭证。
- 阶段 1：已完成来源适配契约和来源 URL 白名单。
- 阶段 2：已完成独立远程引用表、幂等写入、项目删除迁移和桌面链接导出。
- 阶段 3：已完成小红书/抖音来源切换、可见浏览入口和“收藏当前页面到项目”。
- 阶段 4：已接入现有“保存到桌面”，远程引用输出为 `参考链接.html`。
- 阶段 5：已完成内容模块构建、smoke 和隔离打包态 CDP；portable 发布构建仍需明确发布意图后执行（需递增版本）。
- 本轮明确未实现：抖音官方 API 搜索、视频批量下载、自动截图、尺寸识别、裁切和关键帧提取。

## 1. 最终目标

在 Pic 的“素材浏览器”中，将抖音作为小红书之外的第二个素材来源接入，使用户可以：

1. 在“小红书 / 抖音”之间明确切换。
2. 使用关键词浏览抖音内容。
3. 查看封面、标题、作者、内容类型和可用的公开信息。
4. 预览内容或在抖音原页面中打开。
5. 将抖音内容作为“远程参考”加入当前项目。
6. 在现有整理、选择和“保存到桌面”工作流中识别这些远程参考。
7. 在抖音能力不可用、登录失效或网络失败时，不影响本地图库和小红书功能。

本项目的核心工作流保持不变：

```text
收集参考素材 -> 在项目中组织/筛选 -> 选择参考 -> 保存到桌面
```

抖音是新的素材来源，不得引入 PDF、Shot List、客户交付或另一套竞争性的导出流程。

## 2. 本期范围与非目标

### 2.1 本期必须完成

- 将素材来源从“小红书特例”抽象为可扩展的来源适配层。
- 保证现有小红书行为不发生无意变化。
- 增加抖音来源入口、加载态、空态和错误态。
- 实现一种经过决策门确认的抖音浏览方式：
  - 优先：抖音官方 OpenAPI 搜索。
  - 降级：用户可见的抖音网页浏览与当前链接收藏。
- 将抖音条目作为远程参考加入项目。
- 对旧数据库执行显式、幂等、安全的迁移。
- 让“保存到桌面”正确处理远程参考，不把链接误报为本地照片。
- 完成源码测试、旧数据验证和打包运行验证。

### 2.2 本期明确不做

- 不实现抖音视频批量下载。
- 不实现自动截图、自动识别图片尺寸、自动裁切或关键帧提取。
- 不调用抖音未公开接口，不复制第三方签名算法。
- 不采用无头爬虫、网络请求劫持或 DOM 批量抓取作为正式数据通道。
- 不把远程封面 URL 伪装成本地原图路径。
- 不混排小红书与抖音的搜索结果。
- 不增加自动发布、点赞、评论、关注等社交操作。
- 不擅自改变项目复制、项目删除或原始照片的安全语义。

自动截图和尺寸识别属于后续独立阶段。执行本规划时只能预留扩展点，不得顺手实现。

## 3. 不可违反的执行约束

Luna xhigh 执行本规划时必须遵守以下规则：

1. 先阅读仓库内所有适用的 `AGENTS.md`、项目说明和脚本，再修改代码。
2. 先执行 `git status --short`，记录已有修改。现有修改全部视为用户工作，不得 reset、checkout、覆盖或删除。
3. 使用 `rg` 定位代码；不能根据本规划猜测实际文件名。
4. 先追踪完整的小红书链路，再设计抽象：
   - UI 入口与来源切换。
   - 搜索请求。
   - Electron preload / IPC。
   - 主进程网络或浏览器会话。
   - 结果标准化。
   - 加入项目。
   - SQLite 落库与迁移。
   - 项目复制、删除和选择迁移。
   - 保存到桌面。
5. 不允许在完成真实链路审计前进行大规模重构。
6. 每个阶段必须依次执行：实现 -> 静态检查 -> 自动测试 -> 针对性运行验证 -> `git diff --check` -> 审查 diff -> 独立提交。
7. 一个阶段没有验证通过时，不得进入下一阶段。
8. `CREATE TABLE IF NOT EXISTS` 不能代替旧数据库迁移。必须使用 `PRAGMA table_info(...)` 或等价方式检查旧表字段并显式 `ALTER TABLE` / 回填。
9. 不复制原始照片；远程参考也不能触发原始文件删除。
10. 如果 UI 自动化层不可用，必须报告实际使用的降级验证方法，不得声称完成了未执行的 UI 验收。
11. 在 Windows PowerShell 中执行 npm 脚本时使用 `npm.cmd`。
12. 需要便携包验收时，必须递增版本、同步版本元数据、生成新的 portable 包并验证新产物；不能复用旧包冒充新验证。

## 4. 阶段 0：源码审计与接入决策门

### 4.1 审计任务

只读检查并形成简短证据记录：

```powershell
git status --short
rg --files -g "AGENTS.md" -g "package.json" -g "*.ts" -g "*.js" -g "*.html" -g "*.css"
rg -n "小红书|xiaohongshu|xhs|素材浏览器|material|source|provider|保存到桌面|desktop" .
rg -n "CREATE TABLE|ALTER TABLE|PRAGMA table_info|migration|project.*selection|export" .
```

根据搜索结果画出真实调用链，至少回答：

- 小红书是 API、内嵌网页、自动化浏览器还是其他方式接入？
- 登录态存在哪里？
- 搜索结果在哪一层转成 UI 卡片？
- “保存/采集”当前保存的是文件、URL 还是两者都有？
- 项目素材表的真实 schema 是什么？旧数据库可能缺哪些列？
- 项目复制和删除如何迁移 selection / shot / export 数据？
- “保存到桌面”的输入模型和失败报告是什么？
- 当前测试框架、构建脚本和 portable 打包命令是什么？

不得只检查新安装创建的数据库；必须准备一份旧 schema 测试数据库。

### 4.2 抖音能力决策门

在写完整抖音功能前确认以下事实：

- 是否已有抖音开放平台应用、`client_key` 和可申请的搜索权限。
- 控制台是否实际允许申请视频搜索或图文搜索能力。
- 测试应用能否获得有效 token。
- 搜索响应是否包含满足卡片展示所需的字段。
- 返回内容能否通过官方 iframe 或原始链接预览。
- 当前额度和平台展示规范是否满足 Pic 的使用场景。

输出二选一结论：

```text
DOUYIN_MODE=official_api
```

或：

```text
DOUYIN_MODE=visible_browser
原因：权限未开放 / 尚未审批 / 凭证未提供 / 实际接口不可用
```

没有凭证时不得硬编码模拟 token，也不得转向私有接口。此时继续实现来源抽象和可见浏览降级模式。

### 4.3 阶段出口

- 已记录工作树基线。
- 已找到真实小红书、项目存储和桌面导出链路。
- 已选定 `official_api` 或 `visible_browser`。
- 尚未修改业务代码。

阶段 0 不提交代码；若生成审计文档，可单独提交：

```text
docs: audit material source integration paths
```

## 5. 目标架构

不要复制一套抖音专属素材浏览器。建立最小的来源边界：

```text
素材浏览器 UI
    |
    v
MaterialSourceRegistry
    |-- XiaohongshuAdapter
    `-- DouyinAdapter
           |-- OfficialApiProvider
           `-- VisibleBrowserProvider

统一 MaterialItem
    |
    |-- 临时搜索结果（不等于本地文件）
    `-- ProjectMaterialReference
           |-- local asset
           `-- remote reference
```

以下接口是逻辑要求，不要求照搬命名。执行者应适配仓库现有代码风格：

```ts
type MaterialSource = 'xiaohongshu' | 'douyin';

interface SourceCapabilities {
  structuredSearch: boolean;
  preview: 'image' | 'iframe' | 'external' | 'browser';
  canPersistBinary: boolean;
  supportedMediaTypes: Array<'image' | 'gallery' | 'video'>;
  supportedSorts: string[];
}

interface MaterialSearchRequest {
  source: MaterialSource;
  keyword: string;
  cursor?: string;
  sort?: string;
  publishTime?: string;
  signalId?: string;
}

interface MaterialItem {
  source: MaterialSource;
  sourceItemId: string;
  mediaType: 'image' | 'gallery' | 'video';
  title: string;
  author?: string;
  previewUrl?: string;
  originalUrl: string;
  publishedAt?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  stats?: {
    likes?: number;
    comments?: number;
  };
  rawVersion: number;
}

interface MaterialSearchPage {
  items: MaterialItem[];
  nextCursor?: string;
  hasMore: boolean;
}

interface MaterialSourceAdapter {
  getCapabilities(): SourceCapabilities;
  search(request: MaterialSearchRequest): Promise<MaterialSearchPage>;
  getPreview(item: MaterialItem): Promise<PreviewDescriptor>;
  openOriginal(item: MaterialItem): Promise<void>;
}
```

### 5.1 兼容原则

- 若现有小红书对象字段不同，在 adapter 边界进行转换；不要一次性重写所有旧调用者。
- 若当前代码是原生 JavaScript 和全局对象结构，保持经典 script / global 兼容，不要为本功能引入全新的前端框架。
- 新的 registry 只管理来源能力，不拥有项目状态。
- 搜索结果与项目引用必须是两种不同状态，不能靠“是否有 URL”隐式判断。

## 6. UI 与交互规格

### 6.1 来源切换

素材浏览器顶部增加清晰的文字来源切换：

```text
[小红书] [抖音]
```

- 不使用只有图标的来源入口。
- 当前来源必须有明确选中态。
- 切换来源后保留各自最近一次关键词、结果、分页位置和错误状态；这些可以仅保存在当前运行会话。
- 第一版不提供跨平台混排。

### 6.2 抖音结构化搜索模式

当 `DOUYIN_MODE=official_api`：

- 搜索框沿用现有素材浏览器的主搜索交互。
- 只展示接口真实支持的筛选：综合、最多点赞、最新、发布时间。
- 卡片必须明确显示“来自抖音”。
- 卡片可展示：封面、标题、作者、视频时长/图集标识和允许展示的互动数。
- 主要动作沿用现有采集动作的清晰文字标签，例如“加入项目”。
- 次要动作：“预览”“在抖音打开”。
- 分页使用服务端 cursor 和首刷返回的 search ID；不得自行拼页码。

### 6.3 可见浏览模式

当 `DOUYIN_MODE=visible_browser`：

- 在受限的 Electron 浏览容器中打开抖音官方页面。
- 用户自行登录、搜索和浏览。
- Pic 提供“收藏当前页面到项目”和“在系统浏览器打开”。
- 如果不能稳定、合规地读取标题/作者，则只保存 URL 和用户可编辑标题，不做 DOM 批量抓取。
- 必须显示当前模式说明，例如“当前为网页浏览模式”。
- 不伪装成结构化 API 搜索结果。

### 6.4 状态设计

必须覆盖：

- 初始状态。
- 搜索中。
- 无结果。
- 网络失败。
- 权限未开放。
- token / 登录失效。
- 请求限流。
- 内容已删除或不可见。
- 预览不支持，但原始链接可打开。
- 切换来源时旧请求返回，不能覆盖新来源结果。

## 7. Electron 与安全边界

### 7.1 主进程职责

- token 获取、刷新和 API 请求。
- 抖音 session 管理。
- URL 校验和外链打开。
- 将外部响应转换成最小、稳定的数据结构后再发给 renderer。
- 超时、取消、限流和错误分类。

### 7.2 Renderer 职责

- 发送搜索意图。
- 渲染标准化卡片。
- 管理当前来源和视图状态。
- 不持有 `client_secret`、access token 或完整 Cookie。

### 7.3 IPC 要求

沿用项目现有命名风格，逻辑能力至少包括：

```text
materials:get-capabilities
materials:search
materials:open-original
materials:add-reference
douyin:auth-status          # 仅模式需要时
douyin:open-login           # 仅模式需要时
```

- preload 只暴露参数明确的方法，不能暴露通用 `ipcRenderer.send`。
- 所有 IPC 输入必须校验 source、URL、cursor、关键词长度和项目 ID。
- 错误返回稳定错误码和用户可读信息，不把秘密或完整响应泄漏到 renderer。

### 7.4 浏览容器要求

如果使用可见浏览或 iframe：

- `nodeIntegration: false`。
- `contextIsolation: true`。
- 启用 sandbox；若现有架构暂不允许，必须说明原因和风险。
- 抖音使用独立持久 session，例如 `persist:pic-douyin`。
- 限制允许导航和弹窗的域名。
- 拒绝任意 `file:`、`javascript:` 和未知自定义协议。
- 外部打开前规范化 URL，并再次检查 host。
- 不在日志中打印 Cookie、token 或带秘密参数的完整 URL。

## 8. 数据库与旧数据迁移

先根据真实 schema 决定是扩展现有素材表还是新增引用表。推荐逻辑字段：

```text
id
project_id
source_type        local / xiaohongshu / douyin
source_item_id     nullable
media_type         image / gallery / video / link
title              nullable
author             nullable
original_url       nullable
local_path         nullable
preview_path       nullable
metadata_json      nullable, versioned
created_at
```

迁移要求：

1. 查询旧表实际列。
2. 缺列时逐一增加。
3. 将旧的本地照片回填为 `source_type='local'`。
4. 为远程引用允许 `local_path IS NULL`。
5. 唯一约束不能阻止同一远程内容被加入不同项目。
6. 同一项目重复加入同一来源条目时，必须给出确定行为：推荐幂等返回已有记录并提示“已在项目中”。
7. `metadata_json` 必须带版本，不依赖第三方完整原始响应。
8. 迁移可重复启动，不得重复破坏或重复回填。

必须增加测试：

- 全新数据库创建。
- 真实旧 schema 启动迁移。
- 已迁移数据库再次启动。
- 本地素材读写不变。
- 远程引用可创建、读取和删除引用记录。
- 删除引用不访问或删除原始照片。

## 9. 项目复制、删除与选择状态

逐项检查并验证：

- 复制项目时，远程引用记录作为引用复制，不下载或复制远程二进制。
- 删除项目时，远程引用跟随 selection / shot / export 等相关记录安全迁移或清理。
- 删除项目永远不删除远程源内容，也不删除原始照片。
- 删除仅有的项目时，沿用现有安全 fallback 项目逻辑。
- 如果选择表需要记录来源引用 ID，迁移查询必须包含主键，确保重复项清理正确。

禁止为了抖音功能重写整套项目管理。

## 10. “保存到桌面”行为

继续使用现有唯一主动作“保存到桌面”。不增加第二套抖音导出按钮。

导出规则：

- `local_path` 存在且文件有效：沿用现有图片复制逻辑。
- 远程参考只有 URL：写入本次导出的统一参考链接文件。
- 推荐输出文件名：`参考链接.html`；如果现有项目更适合纯文本，可使用 `参考链接.txt`，但必须可读并保留原链接。
- 链接条目至少包含：标题、来源、作者（若有）、原始 URL。
- 不静默下载抖音视频或远程封面。
- 完成提示分别报告本地文件数、参考链接数和失败数。
- 单条失败不能中断其余本地文件和链接导出。
- 继续使用现有名称清理、防覆盖和逐项失败报告逻辑。

示例完成提示：

```text
已保存 18 张图片和 4 条参考链接；1 项失败。
```

## 11. 分阶段实现与提交

### 阶段 1：来源抽象，不改变现有行为

任务：

- 建立 `MaterialSourceAdapter` / registry 或仓库风格等价物。
- 用小红书 adapter 包装现有行为。
- UI 暂时仍默认小红书。
- 增加 adapter 单元测试。

验收：

- 小红书搜索、预览、采集行为与改造前一致。
- 没有抖音 UI 半成品暴露给用户。
- 相关测试、lint/typecheck、`git diff --check` 通过。

提交建议：

```text
refactor: introduce material source adapters
```

### 阶段 2：远程参考数据模型

任务：

- 增加幂等旧数据库迁移。
- 区分本地素材与远程参考。
- 更新项目读取、复制、删除和选择迁移。
- 增加旧 schema 测试。

验收：

- 旧项目和本地照片零丢失。
- 同一项目重复加入远程引用行为确定。
- 项目复制不复制二进制。
- 项目删除不触碰原图。

提交建议：

```text
feat: support remote project references
```

### 阶段 3：抖音来源 UI 与 Provider

任务：

- 增加来源切换和来源独立状态。
- 根据阶段 0 决策实现 official API 或 visible browser。
- 增加卡片来源标识、预览和打开原链接。
- 增加加载、空、权限、登录和限流状态。
- 加入当前项目。

验收：

- 小红书与抖音可以明确切换。
- 抖音内容可以形成远程项目引用。
- 旧请求不能污染当前来源。
- 抖音失败不影响小红书和本地图库。
- 安全配置经过实际检查。

提交建议：

```text
feat: add Douyin material source
```

### 阶段 4：桌面导出闭环

任务：

- 在现有桌面导出中处理远程引用。
- 生成统一参考链接文件。
- 更新完成提示和逐项失败报告。
- 增加本地、远程、混合和失败用例。

验收：

- 混合项目只需点击一次“保存到桌面”。
- 本地文件正确复制。
- 抖音引用以链接形式存在。
- 没有自动下载第三方视频。

提交建议：

```text
feat: export remote material references
```

### 阶段 5：运行态验证与 portable 发布

只有阶段 1–4 均验证通过后执行。

任务：

- 更新版本号，并检查所有版本元数据同步。
- 执行完整测试、构建和 `git diff --check`。
- 使用 `npm.cmd run build:win` 或仓库真实等价命令生成新 portable 包。
- 检查产物名称、版本、时间、大小和打包清单。
- 使用临时 `--user-data-dir` 启动新包，避免污染真实用户数据。
- 使用项目现有 CDP/UI 自动化能力验证关键路径。
- 仅清理由本轮创建且路径已核实的 `.qa-*` 临时资源。

关键运行路径：

1. 启动旧数据库。
2. 打开素材浏览器。
3. 小红书搜索回归。
4. 切换到抖音。
5. 搜索或可见网页浏览。
6. 预览 / 打开原页面。
7. 加入当前项目。
8. 重启后引用仍存在。
9. 在项目中选择本地素材和抖音引用。
10. 保存到桌面。
11. 验证图片、参考链接和失败报告。

提交建议：

```text
chore: release Pic <new-version>
```

## 12. 测试矩阵

| 范围 | 必测场景 |
| --- | --- |
| 来源 registry | 已知来源、未知来源、能力读取 |
| 小红书回归 | 搜索、分页、预览、采集、错误态 |
| 抖音搜索 | 首刷、加载更多、排序、无结果、取消、重复请求 |
| 抖音权限 | 无 token、token 过期、权限拒绝、限流 |
| 来源切换 | A 请求未结束时切到 B、快速往返、状态恢复 |
| URL 安全 | 合法抖音 URL、相似恶意域名、危险协议、重定向 |
| 数据迁移 | 新库、旧库、重复迁移、缺列、空字段 |
| 项目引用 | 新增、重复新增、重启读取、删除引用 |
| 项目管理 | 复制、删除、唯一项目、选择迁移 |
| 导出 | 仅本地、仅链接、混合、同名、单项失败 |
| 打包运行 | 开发态、打包态、临时用户目录、真实旧 schema |

## 13. 完成定义

只有以下条件全部满足，才能报告本规划完成：

- 每个阶段有独立、可审查的提交。
- 没有覆盖用户原有未提交修改。
- 小红书回归通过。
- 抖音入口、浏览、预览/外链和加入项目在选择的模式下可用。
- 旧数据库迁移通过真实旧 schema 测试。
- 项目复制、删除和原图安全语义不变。
- 混合项目可以通过现有“保存到桌面”完成一次性导出。
- 自动测试和 `git diff --check` 通过。
- 新 portable 包已生成，版本元数据同步。
- 至少完成一次打包应用的关键路径运行验证。
- 报告中明确区分：自动测试、源码检查、开发态验证、打包态验证。

## 14. 阻塞与停止条件

遇到以下情况必须停止当前阶段，保留现场并向用户报告，不得擅自扩大范围：

- 需要覆盖或丢弃用户未提交修改。
- 现有小红书实现无法在不改变行为的情况下抽象，且需要产品取舍。
- 真实旧数据库 schema 与预期严重不同，迁移可能丢数据。
- 抖音官方权限不可用，同时可见浏览模式也被当前安全架构阻止。
- 完成需要调用私有接口、绕过风控或实现签名逆向。
- 需要自动下载、截图或保存第三方二进制才能继续。
- 项目删除或复制的安全语义不明确。
- portable 构建或运行验证反复失败，无法形成可信验收结论。

权限不可用本身不是整个任务的阻塞：应按决策门降级到 `visible_browser`。只有安全可见浏览也无法实现时才停止。

## 15. Luna xhigh 最终报告格式

执行完成后使用以下结构汇报，禁止只说“已完成”：

```markdown
## 结果
- 实际采用模式：official_api / visible_browser
- 用户现在可以完成：...
- 明确未实现：自动下载、自动截图、尺寸识别、关键帧提取

## 分阶段提交
- <commit> 阶段 1：...
- <commit> 阶段 2：...
- <commit> 阶段 3：...
- <commit> 阶段 4：...
- <commit> 阶段 5：...

## 数据安全
- 使用的旧 schema：...
- 迁移结果：...
- 原始照片验证：...

## 验证证据
- 自动测试：命令 + 结果
- 静态检查：命令 + 结果
- 开发态验证：步骤 + 结果
- 打包态验证：步骤 + 结果
- portable 产物：绝对路径、版本、大小、时间

## 已知限制
- ...
```

## 16. 给执行模型的首条指令

将本文件交给 Luna xhigh 时，使用下面的提示词：

```text
请在 E:\Pic\photo-gallery 中严格执行
DOUYIN_MATERIAL_BROWSER_INTEGRATION_PLAN.md。

先完成阶段 0 的只读审计并核对仓库内 AGENTS.md。保护全部现有未提交工作，
不要 reset 或覆盖用户修改。不要猜测文件名；以真实调用链和真实旧数据库 schema
为准。一次只执行一个阶段，每个阶段实现后完成验证、审查 diff 并独立提交，确认通过
后再继续下一阶段。

抖音搜索权限必须经过真实控制台或凭证验证。权限不可用时按文档降级到可见浏览模式，
不得调用私有接口、逆向签名、无头抓取或批量下载。自动截图、尺寸识别、裁切和关键帧
提取不属于本期范围。

持续执行直到满足文档的完成定义，或者命中明确停止条件。最终按文档第 15 节提供带命令、
测试结果、提交号、数据库迁移证据和 portable 产物路径的报告。
```
