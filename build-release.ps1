# ============================================================================
# 生成 Release 附件：
#   1) SHENZHEN-SOLITAIRE-<版本>-win64.zip   桌面程序（不含原版音乐音效，需自备）
#   2) shenzhen-solitaire.html               网页版单文件（纯代码，无素材）
# 用法: .\build-release.ps1 [-Version 1.0.0]
# ============================================================================
param([string]$Version = '1.0.0')

$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$appDir = Join-Path $root 'dist\SHENZHEN SOLITAIRE'
$rel   = Join-Path $root 'release'
$stage = Join-Path $rel '_stage'
$stageApp = Join-Path $stage 'SHENZHEN SOLITAIRE'

if (-not (Test-Path (Join-Path $appDir 'SHENZHEN SOLITAIRE.exe'))) {
  throw "找不到打包好的程序，先运行 .\build-app.ps1"
}

Write-Host "[1/4] 准备干净的暂存目录（剔除原版音乐与音效）..."
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageApp | Out-Null
# 复制程序目录，但跳过 music 与 sfx（原版素材不随 Release 分发）
robocopy $appDir $stageApp /E /XD music sfx /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 失败，退出码 $LASTEXITCODE" }

foreach ($d in @('music', 'sfx')) {
  $p = Join-Path $stageApp "resources\app\$d"
  New-Item -ItemType Directory -Force -Path $p | Out-Null
  @"
把你自己那份 SHENZHEN I/O 的原声放进这个文件夹（.ogg / .mp3 / .m4a / .wav 都行），
游戏启动时会自动扫描并列出曲目；也可以随时用界面上的「选择音乐…」临时挑文件夹。

默认会循环播放 Solitaire.ogg（原作里这个小游戏用的就是这首）。
本程序不附带任何游戏原版素材。
"@ | Set-Content -Path (Join-Path $p '把音乐放这里.txt') -Encoding UTF8
}

$sizeMb = [math]::Round(((Get-ChildItem $stageApp -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
Write-Host "      暂存完成：$sizeMb MB"

Write-Host "[2/4] 压缩程序包（约需一两分钟）..."
$zip = Join-Path $rel "SHENZHEN-SOLITAIRE-$Version-win64.zip"
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $stage, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $true)
$zipMb = [math]::Round((Get-Item $zip).Length / 1MB, 0)
Write-Host "      $zip  ($zipMb MB)"

Write-Host "[3/4] 复制网页版单文件..."
$html = Join-Path $rel 'shenzhen-solitaire.html'
Copy-Item -LiteralPath (Join-Path $root 'shenzhen-solitaire.html') -Destination $html -Force
Write-Host "      $html  ($([math]::Round((Get-Item $html).Length/1KB,1)) KB)"

Write-Host "[4/4] 校验值..."
Get-ChildItem $rel -File | ForEach-Object {
  $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()
  "{0}  {1}`n  SHA256 {2}" -f $_.Name, ("{0:N1} MB" -f ($_.Length / 1MB)), $h
}
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Host ""
Write-Host "Release 附件已就绪（release\ 目录），源码归档由 GitHub 自动生成。"
