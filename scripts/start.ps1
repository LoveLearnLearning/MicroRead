param(
  [ValidateSet("web", "desktop")]
  [string]$Target = "web",
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "未找到 Node.js。请先安装 Node.js 24 或更高版本。"
}
if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
  throw "未找到 Corepack。请安装包含 Corepack 的 Node.js。"
}

$userApiKey = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "User")
if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY) -and -not [string]::IsNullOrWhiteSpace($userApiKey)) {
  $env:OPENAI_API_KEY = $userApiKey
}

if (-not (Test-Path -LiteralPath (Join-Path $workspace "node_modules"))) {
  corepack pnpm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Target -eq "desktop") {
  $desktopExe = Join-Path $workspace "apps\desktop\src-tauri\target\release\micro-read-desktop.exe"
  if ($Rebuild -or -not (Test-Path -LiteralPath $desktopExe)) {
    corepack pnpm build:desktop
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
  & $desktopExe
  exit $LASTEXITCODE
}

$buildId = Join-Path $workspace "apps\web\.next\BUILD_ID"
if ($Rebuild -or -not (Test-Path -LiteralPath $buildId)) {
  corepack pnpm --filter @reader/web build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
corepack pnpm start:web
