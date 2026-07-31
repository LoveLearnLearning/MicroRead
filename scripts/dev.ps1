param(
  [ValidateSet("web", "desktop")]
  [string]$Target = "web"
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

if (-not (Test-Path -LiteralPath (Join-Path $workspace "node_modules"))) {
  corepack pnpm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Target -eq "desktop") {
  corepack pnpm dev:desktop
} else {
  corepack pnpm dev:web
}
