# 阅微 / MicroRead

一个开源、本地优先、证据优先的 AI 原生阅读器。它把原文、稳定锚点、用户标注、AI 引用和知识卡片放进同一条阅读链路，而不是只在 PDF 旁边放一个聊天框。

![阶段](https://img.shields.io/badge/stage-local_reader-1f6b55)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Tauri](https://img.shields.io/badge/Tauri-2-24c8db)
![tests](https://img.shields.io/badge/tests-26_unit_%2B_Web_Desktop_E2E-5f84a8)

## 已完成的体验

- 无需注册，直接进入本地工作区
- PDF 拖拽导入、内容去重、渐进渲染和后台文本提取
- 公开网页导入与净化阅读，包含 SSRF/体积/类型边界
- 资料库搜索、筛选、标签、专题、归档与可恢复回收站
- PDF/网页阅读器、缩放、全文搜索、三栏折叠和专注模式
- 精确选区、高亮、批注、书签和原文回跳
- DeepSeek `deepseek-v4-flash` 选区解释与文档问答
- 英文文献全文翻译：双栏同步对照、连续译文阅读、点击段落回看原文
- 分批渐进翻译、暂停/续传、本地缓存，并随完整备份迁移
- 结构化事实/归纳/推断标记，由系统校验并生成可点击引用
- 知识卡编辑、Markdown 导出和包含 PDF 原件的完整备份
- IndexedDB 离线持久化、PWA 应用壳和本地操作日志
- Token/成本账本、限流、功能开关与健康状态

当前产品目标见 [开源本地 Reader 目标](docs/23-open-source-local-reader.md)，实现映射见 [本地 MVP 实现与验收](docs/22-mvp-implementation.md)。

## 运行

要求 Node.js 24+。仓库固定使用 pnpm 11.9.0；没有全局 `pnpm` 时可直接通过 Corepack 运行。

```powershell
corepack pnpm install
corepack pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可进入本地工作区。仓库会自动加入一篇可用于选区、高亮和问答的示例文章。

日常本地使用建议运行已经构建好的生产版本，启动更快，也不会加载开发工具：

```powershell
.\scripts\start.ps1 web
```

修改代码时使用开发脚本：

```powershell
.\scripts\dev.ps1 web
```

## Desktop

桌面版使用 Tauri 2 与系统 WebView，共享 Web 客户端的资料库、PDF 阅读、标注、卡片和完整备份代码，不捆绑 Node/Next sidecar。

开发运行：

```powershell
.\scripts\dev.ps1 desktop
```

生成 Windows release 可执行文件：

```powershell
corepack pnpm build:desktop
```

产物位于 `apps/desktop/src-tauri/target/release/micro-read-desktop.exe`。桌面版没有内置 Node/Next 服务：阅读、标注与备份保存在本地 WebView 数据库中，AI 和网页导入由轻量的 Rust Tauri Command 直接完成。

生成过一次后，可用轻量启动脚本直接打开；传入 `-Rebuild` 可强制重新构建：

```powershell
.\scripts\start.ps1 desktop
```

当前 Windows 验收机上的 release EXE 为 13.34 MiB；实测首次启动到窗口可响应约 500 ms，随后启动约 105–108 ms。该数字是本机基线，不是对所有硬件的承诺。

## AI 配置

应用使用 DeepSeek 的 OpenAI-compatible Chat Completions API。密钥从服务端进程的 `OPENAI_API_KEY` 读取，绝不会返回浏览器或写入 IndexedDB。

```powershell
$env:OPENAI_API_KEY = '<your-deepseek-api-key>'
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com' # 可省略
$env:AI_MODEL = 'deepseek-v4-flash'                 # 可省略
corepack pnpm dev
```

没有密钥或 AI 服务失败时，阅读、导入、搜索、标注、卡片和导出仍然可用。

## 验证

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @reader/web exec playwright test
corepack pnpm --filter @reader/desktop test:e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
corepack pnpm build
```

端到端测试覆盖两条核心链路：

1. 创建本地空间 → 打开网页资料 → 选区 → 高亮 → 刷新后恢复。
2. 导入 PDF → 首屏可读 → 后台文本提取 → 进入可搜索/问答状态。

首次运行 Playwright 时如本机没有对应 Chromium，可执行：

```powershell
corepack pnpm --filter @reader/web exec playwright install chromium
```

## 仓库结构

```text
apps/web/                 Next.js Web/PWA、阅读器和服务端 API
apps/desktop/             Vite 静态客户端、Tauri 2 原生壳与桌面路由适配
packages/domain/          Source/Anchor/Annotation/Card 等领域模型
packages/reader-core/     锚点、分块与本地检索规则
packages/ai-protocol/     AI 请求、结构化回答与 SSE 协议
docs/                     产品目标、实现映射与参考
adr/                      架构决策记录
templates/                Feature/RFC/Incident 模板
```

## 重要边界

OCR、EPUB、多文档比较和可选本地模型属于后续阅读能力，不在当前 L1 范围内。
