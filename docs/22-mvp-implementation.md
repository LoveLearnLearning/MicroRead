# 22. 本地 MVP 实现与验收

> 实现基线：2026-07-31  
> 交付形态：可运行的 Web/PWA + Windows Tauri 本地 Reader  
> 默认 AI Provider：DeepSeek OpenAI-compatible Chat Completions  
> 默认模型：`deepseek-v4-flash`

## 1. 本次交付边界

本次实现的目标是让一个新用户可以完成：

```text
创建本地空间 → 导入 PDF/网页 → 阅读与全文搜索 → 选区高亮/批注
→ 选区解释或文档问答 → 点击引用回到原文 → 保存知识卡 → 导出
```

数据默认保存在浏览器 IndexedDB。它不是生产云服务，也没有用前端假状态冒充跨设备同步或服务端备份。

## 2. 已实现需求

| 需求 | 实现 | 验收方式 |
|---|---|---|
| FR-AUTH-001（本地产品边界） | 无需注册，直接进入设备本地工作区 | Web/Desktop 启动 E2E |
| FR-INGEST-001/005/006 | PDF 拖拽/选择、SHA-256 去重、原件先保存、页面渐进显示、后台文本提取 | Playwright PDF 流程 |
| FR-INGEST-002 | 公开网页 URL 导入；Readability 正文提取；私网/本机地址与非 HTML 拒绝 | URL 安全单元测试 |
| FR-LIB-001/003/005 | 网格/列表、类型筛选、搜索、标签、专题、归档、回收站、恢复与永久删除 | 浏览器交互 |
| FR-READ-001/002/004/005/006 | PDF.js 连续阅读、网页净化阅读、缩放、全文搜索、选区 Anchor、阅读现场 | 浏览器 E2E |
| FR-NOTE-001/002/003 | 高亮、批注、书签、颜色模型、原文回跳、知识卡 | 浏览器 E2E + IndexedDB |
| FR-AI-001/002/003/004 | 选区解释、文档问答、阅读地图、术语/语境解释 | Web API Route + Desktop Rust Command |
| 全文翻译 | 英文文献分段渐进翻译；双栏同步滚动；译文模式点击段落切换原文；暂停续传与本地缓存 | Web/Desktop E2E + DeepSeek 原生冒烟测试 |
| Desktop 自动更新 | 启动静默检查、设置页手动检查、可选自动安装；GitHub Release 元数据与 minisign 验签 | 发布契约测试 + 签名 NSIS 构建 |
| AI 输出规范 | 结构化 Claim、系统生成 Citation、引用 ID 白名单、事实/归纳/推断/不确定标记 | 协议单元测试 |
| FR-SYNC-001/002/006 | IndexedDB 离线读取与写入、本地操作日志、LOCAL ONLY 可见状态 | 刷新恢复 E2E |
| FR-EXPORT-001/002 | 知识卡 Markdown、包含 PDF 原件的版本化 `.anr-backup` 备份与恢复 | 单元测试 |
| FR-OPS-001/002/003 | 本地小时限流、Token/成本账本、功能开关、健康状态页 | 设置页面与 API |
| 可访问性基础 | 语义标签、键盘焦点、快捷键、减少动画、响应式阅读面板 | ESLint + 浏览器检查 |

## 3. 关键实现

### 3.1 来源和锚点

- 原始 `Source`、`Anchor`、`Annotation`、`KnowledgeCard`、`Citation` 分离存储。
- Anchor 保存 exact/prefix/suffix、页码或段落索引、字符偏移。
- 回跳先匹配 exact，失败后用 prefix/suffix 包围范围重定位。
- PDF 页面和文本分层渲染，页面进入附近视口时才加载。

### 3.2 AI 证据边界

- 客户端只发送词法检索命中的最多 8 个片段；选区解释只发送当前选区上下文。
- 来源内容使用明确的数据边界包裹，文档内指令不获得系统权限。
- 模型只能返回输入中存在的 `passageId`；服务端丢弃未知引用。
- 没有有效引用的 `SOURCE_FACT` 会降级为 `UNCERTAIN`。
- AI 故障、限流或凭据错误不会影响阅读、搜索、标注和导出。

### 3.3 网页导入安全

- 只允许 HTTP/HTTPS 与标准端口。
- 拒绝含凭据 URL、本机名、`.local`、私网、链路本地、保留和组播地址。
- 每一次重定向都重新校验目标地址。
- 15 秒超时、最多 4 次重定向、最多读取 5 MB、只接受 HTML。

## 4. 尚未冒充完成的生产能力

以下项目需要独立服务、第三方配置或多设备环境，不属于本地 MVP：

- PostgreSQL/pgvector 混合检索、Embedding、Reranker
- 对象存储、Temporal 摄取工作流、OCR、EPUB
- 真正的 Push/Pull 云同步、设备游标与冲突合并
- 多文档比较、浏览器扩展和移动端

仓库已经为这些能力保留领域对象、AI 协议和 `sync_operations` 操作日志；接入时不应把 IndexedDB 数据层直接扩写成一个隐式云后端。

## 5. 验证命令

```powershell
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @reader/web exec playwright test
corepack pnpm --filter @reader/desktop test:e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
corepack pnpm build
```

当前自动化覆盖：31 个 Web/协议/安全测试、3 个 Desktop 发布契约测试、11 个默认 Rust 测试、2 个显式 DeepSeek 原生冒烟测试、3 条 Web Chromium 端到端流程和 1 条 Desktop 静态壳端到端流程。

Windows 验收机基线：加入全文翻译后的 release EXE 13.34 MiB；首次启动到可响应窗口约 500 ms，随后两次约 105–108 ms。Web E2E 覆盖完整阅读/高亮恢复、PDF 渐进导入，以及全文翻译的双向同步、原文切换和缓存恢复。
