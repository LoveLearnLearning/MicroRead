# ADR-0001：共享 Reader 核心，分别交付 Web 与 Tauri Desktop

- 状态：Accepted
- 日期：2026-07-31

## 背景

Reader 需要同时提供本地 Web 与可安装桌面版，并保持轻量和快速启动。当前 Web 实现使用 Next.js API Route、IndexedDB 和浏览器能力。如果直接把完整 Next/Node 服务作为桌面 sidecar 打包，会增加安装体积、进程数量、冷启动时间和故障面。

## 决策

采用一个共享产品、两个运行时壳：

```text
共享领域与 UI
├─ Web Runtime：IndexedDB + Next 本地 API
└─ Desktop Runtime：WebView IndexedDB + Tauri 2 Command
```

- `packages/domain`、`packages/reader-core`、`packages/ai-protocol` 保持平台无关。
- 首个桌面版本复用 WebView IndexedDB 和完整备份格式，以尽快获得轻量、无 Node sidecar 的可用版本。
- 文件、AI 和网页导入逐步通过运行时适配器访问；大文件存储迁移到桌面文件系统时保持领域模型和备份格式不变。
- Web 版本继续支持浏览器访问和 PWA。
- 桌面版本使用系统 WebView，不内置 Node/Next 服务。
- 完整备份格式在两个运行时之间保持兼容。
- Windows 是第一个桌面验收平台，工程结构保留 macOS/Linux 构建能力。

## 启动策略

- 应用框架同步显示，存储打开、示例数据、PDF 引擎和 AI 状态在后台初始化。
- 路由切换不等待健康检查。
- PDF.js、AI 面板和导入解析器按需加载。
- 任何初始化失败必须显示局部、可重试状态，不得永久停留在全屏加载页。

## 后果

- 需要逐步把 `apps/web/lib/db.ts` 和 API Route 背后的能力抽成运行时接口。
- 初期会同时维护 Web 与 Rust 适配器，但避免了沉重 sidecar 和两套业务规则。
- 桌面端后续可以迁移到真实文件路径、SQLite 和操作系统安全存储，同时不改变 Web 的零安装优势或首版数据可迁移性。
