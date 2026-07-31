# Desktop 发布与自动更新

## 用户能力

- 设置页可以手动检查、下载并安装更新。
- 桌面版默认在启动约两秒后静默检查更新；离线或 GitHub 暂不可用时不阻塞启动。
- “自动安装并重启”默认关闭。用户显式开启后，新版本会在启动检查到后自动下载、验签、安装并重启。
- 安装包必须通过内置 minisign 公钥验证，校验失败时不会安装。

首个包含 updater 的版本仍需手动安装一次。早期不含 updater 的安装包和独立 EXE 无法被远程补上更新能力；从该版本开始，后续稳定版本可以在软件内升级。

## 维护者一次性配置

更新私钥已生成在本机：

```text
C:\Users\Lenovo\.tauri\microread-updater.key
```

私钥不得提交到仓库。进入 GitHub 仓库的 `Settings → Secrets and variables → Actions`，新建 Repository secret：

```text
Name: TAURI_SIGNING_PRIVATE_KEY
Value: 上述文件的完整内容
```

当前密钥没有密码，因此无需创建密码 Secret。请离线备份私钥；丢失私钥后，已经安装的客户端将无法验证任何新更新。

## 发布稳定版本

workflow 只接受 SemVer tag，并用 tag 同步 Tauri 与 Rust 包版本：

```powershell
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions 会构建 Windows NSIS 安装器、签名文件和 `latest.json`，并发布到同一个 GitHub Release。客户端读取：

```text
https://github.com/LoveLearnLearning/MicroRead/releases/latest/download/latest.json
```

不要单独发布 target 目录中的裸 EXE。Tauri 不把它视为受支持的 portable 分发格式，它也无法保持可靠的安装路径和更新语义。

## 签名轮换

不要直接替换已发布客户端所信任的公钥。需要轮换时，先发布一个同时信任旧链并内置新公钥的过渡版本，确认用户完成迁移后再更换发布私钥。
