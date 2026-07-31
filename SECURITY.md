# Security Policy

## Supported versions

项目仍处于早期开发阶段，目前只为最新主分支提供安全修复。

## Reporting a vulnerability

请不要在公开 Issue 中提交包含真实 API Key、私人文档、完整本地路径或可直接利用细节的报告。仓库建立公开安全联系方式后，应优先使用对应的私密报告渠道；在此之前，请创建不包含敏感信息的简短 Issue，请维护者提供私密联系方式。

## Local security model

- 文档、标注、知识卡和备份默认保存在用户设备。
- Web AI 密钥由本地服务进程环境变量读取，不发送到浏览器存储。
- 文档内容是不可信数据，不能覆盖系统提示或获得工具权限。
- 网页导入必须持续执行 SSRF、重定向、类型、体积和超时检查。
- `.anr-backup` 在替换工作区前必须校验应用标识、schema、文件清单和引用关系。
- Desktop 不捆绑 Node sidecar；新增 Tauri Command 时遵循最小权限并声明 capability。
