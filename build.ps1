# 把 src/ 下的 html / css / js 内联成单个可双击运行的文件
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$src  = Join-Path $root 'src'
$out  = Join-Path $root 'shenzhen-solitaire.html'

$shell = Get-Content -Raw -Encoding UTF8 (Join-Path $src 'shell.html')
$css   = Get-Content -Raw -Encoding UTF8 (Join-Path $src 'styles.css')
$js    = @('engine.js','art.js','music.js','sfx.js','ui.js') | ForEach-Object {
  "/* ===== $_ ===== */`n" + (Get-Content -Raw -Encoding UTF8 (Join-Path $src $_))
} | Join-String -Separator "`n"

# --- 音乐清单：扫描 music/（可以是目录联接），并记下真实路径作为备用绝对路径 ---
$musicDir = Join-Path $root 'music'
$tracks = @()
$musicBase = ''
$extRe = '^\.(ogg|oga|mp3|m4a|aac|wav|flac|opus|webm)$'
if (Test-Path -LiteralPath $musicDir) {
  $tracks = @(Get-ChildItem -LiteralPath $musicDir -File |
    Where-Object { $_.Extension -match $extRe } |
    Sort-Object Name | Select-Object -ExpandProperty Name)
  $real = (Resolve-Path -LiteralPath $musicDir).Path
  $item = Get-Item -LiteralPath $musicDir -Force
  if ($item.LinkType -and $item.Target) {
    $t = $item.Target
    if ($t -is [array]) { $t = $t[0] }
    if ($t) { $real = $t }
  }
  $musicBase = 'file:///' + ($real -replace '\\','/' -replace ' ','%20') + '/'
}
$musicJs = 'window.SZ_MUSIC = ' + (@{ tracks = $tracks; base = $musicBase } | ConvertTo-Json -Compress -Depth 3) + ';'

$html = $shell.Replace('/*__CSS__*/', $css).Replace('/*__JS__*/', $js).Replace('/*__MUSIC__*/', $musicJs)
Set-Content -Path $out -Value $html -Encoding UTF8 -NoNewline

# GitHub Pages 在线试玩入口：让 docs/index.html 始终与网页版一致
$docs = Join-Path $root 'docs'
if (Test-Path $docs) {
  Set-Content -Path (Join-Path $docs 'index.html') -Value $html -Encoding UTF8 -NoNewline
  New-Item -ItemType File -Force -Path (Join-Path $docs '.nojekyll') | Out-Null
}

$kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "built: $out  ($kb KB)"
Write-Host ("music: {0} 首曲目{1}" -f $tracks.Count, $(if ($musicBase) { " · 备用路径 $musicBase" } else { " · 未找到 music/ 目录" }))
