# Pic 文件夹说明

本文档说明 `E:\Pic` 下各文件夹和主要文件的用途。Pic 的实际应用目录是：

```text
E:\Pic\photo-gallery
```

## 快速启动

在 `E:\Pic` 下双击 `启动.bat`，即可启动当前源码版本。启动脚本会进入 `photo-gallery`，先构建当前源码，再使用 Electron 启动应用。

也可以直接运行：

```text
E:\Pic\photo-gallery\start.bat
```

## Pic 根目录

| 文件夹/文件 | 作用 | 是否可以直接删除 |
|---|---|---|
| `.git` | Git 版本库的提交记录、分支和配置。用于版本管理。 | 不要删除 |
| `.github` | GitHub Actions 等自动化配置，目前主要用于持续集成。 | 不建议删除 |
| `.workbuddy` | 本地开发工具的辅助记忆/配置，不属于 Pic 的运行源码。 | 不确定时保留 |
| `photo-gallery` | Pic 应用的源码、依赖、测试和构建结果，是最重要的目录。 | 不要删除 |
| `.gitignore` | 告诉 Git 哪些依赖、日志和构建产物不需要纳入版本管理。 | 不要删除 |
| `启动.bat` | 根目录快捷启动入口，转调 `photo-gallery\start.bat`。 | 不建议删除 |
| `package.json` | 根目录的历史/辅助依赖声明；当前 Pic 应用实际使用的是 `photo-gallery\package.json`。 | 不建议删除 |

根目录中如果出现 `node_modules` 或 `package-lock.json`，通常是根级辅助依赖产生的内容，不是当前 Pic 启动所需的应用依赖。当前应用的依赖位于 `photo-gallery\node_modules`。

## `photo-gallery` 应用目录

| 文件夹 | 作用 | 说明 |
|---|---|---|
| `electron` | Electron 主进程、预加载脚本、IPC 通信、应用服务、类型和工具代码。 | 应用运行逻辑所在的源码目录。 |
| `electron\content` | Electron 侧与内容模块相关的代码。 | 属于源码的一部分。 |
| `electron\ipc` | 主进程与页面之间的 IPC 接口处理。 | 修改时要同步考虑前端调用方。 |
| `electron\services` | 文件、项目、照片、导出等应用服务。 | 属于核心业务代码。 |
| `electron\icons` | 应用图标资源。 | 打包时会使用。 |
| `public` | 页面入口、前端 JavaScript、样式和静态资源。 | Pic 的界面源码主要在这里。 |
| `public\js` | 页面交互、状态管理、项目和照片相关前端代码。 | 属于前端源码。 |
| `public\styles` | 页面样式、布局、组件和设计变量。 | 属于前端源码。 |
| `public\vendor` | 由脚本复制生成的第三方前端资源。 | 可通过构建脚本重新生成，不要手工修改。 |
| `scripts` | 构建辅助脚本，例如复制第三方资源、整理内容模块。 | `npm run build` 会调用其中的脚本。 |
| `tests` | 自动化测试。 | 按服务、UI/UX 和工具分组。 |
| `tests\services` | 服务层测试。 | 验证文件、项目、数据库等业务逻辑。 |
| `tests\uiux` | UI/UX 和交互流程测试。 | 验证界面行为和用户流程。 |
| `tests\utils` | 工具函数测试。 | 验证可复用的辅助逻辑。 |
| `docs` | 开发计划、设计规范、截图规范和其他项目文档。 | 修改产品或界面前先查看相关文档。 |
| `node_modules` | npm 安装的 Electron、构建工具和运行依赖。 | 运行/构建需要；损坏时可用 `npm.cmd install` 重建。 |
| `dist-app` | 当前源码构建输出，包含 `main`、`preload`、`renderer` 和 `content`。 | `start.bat` 启动前会重新生成；不要当作源码修改。 |
| `dist-pkg` | Windows 打包输出，包含当前便携版或解包后的应用文件。 | 仅打包/发布需要，可重新生成；保留最新版本即可。 |

### `dist-app` 内部目录

| 文件夹 | 作用 |
|---|---|
| `dist-app\main` | 编译后的 Electron 主进程代码。 |
| `dist-app\preload` | 编译后的预加载脚本。 |
| `dist-app\renderer` | 编译后的渲染层资源。 |
| `dist-app\content` | 构建后供应用加载的页面内容模块。 |

### `dist-pkg` 内部目录

| 文件夹 | 作用 |
|---|---|
| `dist-pkg\win-unpacked` | Windows 解包后的应用目录，便于检查或调试打包结果。 |
| `dist-pkg` 根部的 `.exe`、`.7z`、`.yml` 文件 | 便携版安装包、压缩产物和 electron-builder 构建信息。 |

## `photo-gallery` 中的主要文件

| 文件 | 作用 |
|---|---|
| `package.json` | Pic 应用版本、npm 命令、依赖和 Windows 打包配置。 |
| `package-lock.json` | 锁定依赖版本，保证安装结果稳定。 |
| `start.bat` | 实际启动脚本：检查项目、构建当前源码并启动 Electron。 |
| `启动.bat`、`启动应用.bat` | `start.bat` 的中文别名入口。 |
| `CHANGELOG.md` | 版本变更记录。 |
| `test-smoke.cjs` | 构建后的快速冒烟检查。 |
| `electron.vite.config.ts` | Electron/Vite 的构建配置。 |
| `tsconfig.json` | TypeScript 配置。 |
| `eslint.config.mjs` | 代码检查配置。 |
| `vitest.config.ts` | Vitest 测试配置。 |
| `tailwind.config.js` | Tailwind CSS 配置。 |
| `DOUYIN_MATERIAL_BROWSER_INTEGRATION_PLAN.md` | 抖音素材浏览器集成计划。 |
| `code-review-report.html` | 代码审查报告。 |
| `phase1-refactor-report.html` | 第一阶段重构报告。 |

## 清理时的注意事项

1. 不要删除 `.git`、`photo-gallery\electron`、`photo-gallery\public`、`photo-gallery\scripts`、`photo-gallery\tests` 或 `photo-gallery\docs`。
2. `node_modules`、`dist-app` 和 `dist-pkg` 都是可重新生成的目录，但应用运行或构建时需要相应目录存在。
3. 删除或移动构建产物前先关闭 Pic；如果只是暂时不确定，优先移入 Windows 回收站，不要永久删除。
4. 修改源码后，使用 `E:\Pic\启动.bat` 启动，脚本会重新构建当前源码。
5. 项目数据库和用户照片属于用户数据，清理项目文件夹时不要把原始照片当作构建产物处理。

