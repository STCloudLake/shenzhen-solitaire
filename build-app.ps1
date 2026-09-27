# ============================================================================
# 组装并打包桌面版：生成 dist\SHENZHEN SOLITAIRE\（单文件夹、含音乐与音效）
#   .\build-app.ps1              正常打包（音乐/音效已存在就跳过复制）
#   .\build-app.ps1 -Refresh     强制重新复制音乐与音效
# ============================================================================
param(
  [switch]$Refresh,
  [string]$ElectronVersion = '44.4.5'
)
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$app   = Join-Path $root 'app'
$dist  = Join-Path $root 'dist'
$build = Join-Path $root 'build'
$src   = Join-Path $root 'src'

$GameContent = 'F:\SteamLibrary\steamapps\common\SHENZHEN IO\Content'
$GameMusic   = Join-Path $GameContent 'music'
$GameSounds  = Join-Path $GameContent 'sounds'

# 用到的原版音效（其余不复制，省体积）
$sfxFiles = @(
  'card_deal.wav','card_pickup.wav','card_place.wav','card_sweep.wav',
  'button.wav','button_up.wav','sim_tick.wav',
  'os_beep.wav','os_beep_success.wav','os_beep_failure.wav',
  'fanfare_solving1.wav'
)

function Copy-Assets {
  param([string]$From, [string]$To, [string[]]$Filter, [string]$Label)

  if (-not (Test-Path -LiteralPath $From)) { Write-Warning "找不到 $Label 目录：$From（跳过）"; return 0 }
  New-Item -ItemType Directory -Force -Path $To | Out-Null

  $files = Get-ChildItem -LiteralPath $From -File | Where-Object {
    (-not $Filter) -or ($Filter -contains $_.Name)
  }
  $n = 0; $copied = 0
  foreach ($f in $files) {
    $dst = Join-Path $To $f.Name
    $n++
    if ((Test-Path -LiteralPath $dst) -and -not $Refresh) {
      if ((Get-Item -LiteralPath $dst).Length -eq $f.Length) { continue }
    }
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    $copied++
  }
  Write-Host ("  {0}: {1} 个文件（新复制 {2}）" -f $Label, $n, $copied)
  return $n
}

Write-Host "[1/5] 构建网页版单文件 ..."
& (Join-Path $root 'build.ps1') | Out-Host

Write-Host "[2/5] 复制音乐与音效到程序目录 ..."
$musicCount = Copy-Assets -From $GameMusic   -To (Join-Path $app 'music') -Label '音乐'
$sfxCount   = Copy-Assets -From $GameSounds  -To (Join-Path $app 'sfx')   -Filter $sfxFiles -Label '音效'
# 网页版旁边也放一份音效，浏览器里同样能听到原版音效
Copy-Assets -From $GameSounds -To (Join-Path $root 'sfx') -Filter $sfxFiles -Label '音效(网页版)' | Out-Null

Write-Host "[3/5] 生成图标 ..."
New-Item -ItemType Directory -Force -Path $build | Out-Null
$png = Join-Path $build 'icon.png'
$ico = Join-Path $build 'icon.ico'
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
# 深绿底 + 奶油色牌面 + 红色「中」
$g.Clear([System.Drawing.Color]::FromArgb(255, 2, 60, 38))
$card = New-Object System.Drawing.Rectangle 42, 26, 172, 204
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 22
$path.AddArc($card.X, $card.Y, $r, $r, 180, 90)
$path.AddArc($card.Right - $r, $card.Y, $r, $r, 270, 90)
$path.AddArc($card.Right - $r, $card.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($card.X, $card.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()
$brushCard = New-Object System.Drawing.Drawing2D.LinearGradientBrush $card, ([System.Drawing.Color]::FromArgb(255,247,246,238)), ([System.Drawing.Color]::FromArgb(255,222,219,204)), 60
$g.FillPath($brushCard, $path)
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255,170,164,148)), 3), $path)
$font = New-Object System.Drawing.Font 'SimSun', 132, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('中', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,168,38,14))), (New-Object System.Drawing.RectangleF 42, 34, 172, 196), $fmt)
$g.Dispose()
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
# 打包 ICO（256x256 PNG 负载，Vista+ 支持）
$pngBytes = [System.IO.File]::ReadAllBytes($png)
$fs = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1)
$bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([Byte]0)
$bw.Write([UInt16]1); $bw.Write([UInt16]32)
$bw.Write([UInt32]$pngBytes.Length); $bw.Write([UInt32]22)
$bw.Write($pngBytes)
$bw.Close(); $fs.Close()
Write-Host "  build\icon.ico 生成完毕"

Write-Host "[4/5] 组装 app\ 目录 ..."
Copy-Item -LiteralPath (Join-Path $root 'shenzhen-solitaire.html') -Destination (Join-Path $app 'index.html') -Force
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination (Join-Path $app 'README.md') -Force

Write-Host "[5/5] 组装桌面程序（Electron 运行时 + 游戏本体）..."
$runtime = Join-Path $build 'electron-runtime'   # 构建缓存（不放进 dist）
$appDir  = Join-Path $dist 'SHENZHEN SOLITAIRE'
$appName = 'SHENZHEN SOLITAIRE'
$zipName = "electron-v$ElectronVersion-win32-x64.zip"

# 5.1 运行时压缩包：先用本地缓存，没有就从 GitHub 下
if (-not (Test-Path (Join-Path $runtime 'electron.exe'))) {
  New-Item -ItemType Directory -Force -Path $runtime | Out-Null
  $cache = Join-Path $env:LOCALAPPDATA 'electron\Cache'
  $zip = $null
  if (Test-Path $cache) {
    $zip = (Get-ChildItem $cache -Recurse -Filter $zipName -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
  }
  if (-not $zip) {
    $zip = Join-Path $env:TEMP $zipName
    Write-Host "  下载 Electron $ElectronVersion 运行时（约 150MB，仅首次）..."
    Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/v$ElectronVersion/$zipName" `
      -OutFile $zip -TimeoutSec 1800 -UserAgent 'Mozilla/5.0'
  } else {
    Write-Host "  使用本地缓存的运行时：$zip"
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $runtime)
}

# 5.2 首次组装可执行文件（之后只更新资源，省得反复搬 200MB）
if (-not (Test-Path (Join-Path $appDir "$appName.exe"))) {
  New-Item -ItemType Directory -Force -Path $appDir | Out-Null
  Copy-Item -Path (Join-Path $runtime '*') -Destination $appDir -Recurse -Force
  Move-Item -LiteralPath (Join-Path $appDir 'electron.exe') -Destination (Join-Path $appDir "$appName.exe")
  Remove-Item -LiteralPath (Join-Path $appDir 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue

  $rcedit = Join-Path $root 'tools\pack\rcedit-x64.exe'
  if (-not (Test-Path $rcedit)) {
    Write-Host "  获取 rcedit（写入 exe 图标与版本信息）..."
    Invoke-WebRequest -Uri 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe' `
      -OutFile $rcedit -TimeoutSec 300 -UserAgent 'Mozilla/5.0'
  }
  & $rcedit (Join-Path $appDir "$appName.exe") `
    --set-icon $ico `
    --set-version-string 'ProductName' $appName `
    --set-version-string 'FileDescription' 'SHENZHEN SOLITAIRE - 麻将接龙' `
    --set-version-string 'CompanyName' '非商业复刻' `
    --set-version-string 'LegalCopyright' '游戏音乐与音效版权归 Zachtronics 所有，仅供个人游玩' `
    --set-file-version '1.0.0.0' --set-product-version '1.0.0.0' | Out-Null
  Write-Host "  已写入图标与版本信息"
}

# 5.3 把游戏本体放进 resources\app（不打包 asar，音乐音效保持为可替换的真实文件）
$resApp = Join-Path $appDir 'resources\app'
New-Item -ItemType Directory -Force -Path $resApp | Out-Null
Copy-Item -LiteralPath (Join-Path $app 'index.html')   -Destination $resApp -Force
Copy-Item -LiteralPath (Join-Path $app 'main.js')      -Destination $resApp -Force
Copy-Item -LiteralPath (Join-Path $app 'package.json') -Destination $resApp -Force
Copy-Item -LiteralPath (Join-Path $app 'README.md')    -Destination $resApp -Force
Copy-Item -LiteralPath $ico -Destination (Join-Path $resApp 'icon.png') -Force -ErrorAction SilentlyContinue
if (-not (Test-Path (Join-Path $resApp 'icon.png'))) { Copy-Item -LiteralPath $png -Destination (Join-Path $resApp 'icon.png') -Force }
Copy-Assets -From $GameMusic  -To (Join-Path $resApp 'music') -Label '音乐(程序目录)' | Out-Null
Copy-Assets -From $GameSounds -To (Join-Path $resApp 'sfx')   -Filter $sfxFiles -Label '音效(程序目录)' | Out-Null

# 5.4 只保留中英文语言包（其余 40 多个语种用不到，省约 47MB）
$loc = Join-Path $appDir 'locales'
if (Test-Path $loc) {
  $keep = @('en-US.pak', 'zh-CN.pak')
  $removed = 0
  Get-ChildItem $loc -File | Where-Object { $keep -notcontains $_.Name } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force; $removed++
  }
  Write-Host "  清理多余语言包 $removed 个"
}

$exe = Join-Path $appDir "$appName.exe"
if (Test-Path -LiteralPath $exe) {
  $mb = [math]::Round(((Get-ChildItem -LiteralPath $appDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 0)
  Write-Host ""
  Write-Host "打包完成：$appDir"
  Write-Host "  可执行文件 : $appName.exe"
  Write-Host "  整包体积   : $mb MB（音乐 $musicCount 首 · 音效 $sfxCount 个）"
  Write-Host "  资源位置   : resources\app\{index.html, music\, sfx\}"
} else {
  throw "打包失败：没有找到 $exe"
}
