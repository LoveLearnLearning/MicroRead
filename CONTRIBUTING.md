# Contributing to 阅微 / MicroRead

感谢你帮助改进这个开源本地阅读器。

## 开发环境

- Node.js 24+
- Corepack
- Web 开发不要求 Rust
- Desktop 开发需要 Rust stable、Cargo、系统 WebView2 与 Tauri 2 构建依赖

```powershell
corepack pnpm install
corepack pnpm check
```

启动 Web：

```powershell
.\scripts\dev.ps1 web
```

启动 Desktop：

```powershell
.\scripts\dev.ps1 desktop
```

## 代码边界

- 平台无关规则进入 `packages/domain`、`packages/reader-core` 或 `packages/ai-protocol`。
- Web 页面和 API 位于 `apps/web`。
- Tauri 壳、路由适配和 Rust Command 位于 `apps/desktop`。
- 不在 UI 中复制锚点、引用或备份规则。
- AI、OCR 或索引失败不得破坏基础阅读与本地写入。

## 提交前检查

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @reader/web exec playwright test
corepack pnpm --filter @reader/desktop test:e2e
```

涉及桌面原生层时额外运行：

```powershell
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
corepack pnpm build:desktop
```

提交应保持范围清晰，并说明用户可见行为、数据迁移影响和验证证据。新增文档格式、数据库版本或备份 schema 时必须提供迁移或明确拒绝策略。
