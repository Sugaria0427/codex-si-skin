[CmdletBinding()]
param([string]$DataRoot='', [string]$NodePath='', [switch]$NoShortcut)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
if(-not $DataRoot){
  if($env:CODEX_SKIN_HOME){$DataRoot=$env:CODEX_SKIN_HOME}else{$siCodexHome=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'};$DataRoot=Join-Path $siCodexHome 'codex-si-skin'}
}
$DataRoot=[IO.Path]::GetFullPath($DataRoot)
function Assert-SiPlainPath([string]$siTarget){
  for($siCurrent=$siTarget;$siCurrent;){
    if(Test-Path -LiteralPath $siCurrent){$siItem=Get-Item -LiteralPath $siCurrent -Force;if($siItem.Attributes -band [IO.FileAttributes]::ReparsePoint){throw ('安装目录包含链接，请选择普通目录：'+$siCurrent)}}
    $siParent=[IO.Path]::GetDirectoryName($siCurrent);if($siParent -eq $siCurrent){break};$siCurrent=$siParent
  }
}
Assert-SiPlainPath $DataRoot
$siPayload=Join-Path $PSScriptRoot 'payload'
if(-not (Test-Path -LiteralPath $siPayload)){
  $siPackage=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json
  $siPayload=Join-Path $PSScriptRoot ('dist\codex-si-skin-'+$siPackage.version+'-windows-x64\payload')
}
if(-not (Test-Path -LiteralPath (Join-Path $siPayload 'manifest.json'))){throw '未找到发行文件。源码用户请先运行 npm run build。'}
$siManifest=Get-Content -LiteralPath (Join-Path $siPayload 'manifest.json') -Raw | ConvertFrom-Json
if($siManifest.name -ne 'codex-si-skin' -or $siManifest.platform -ne 'windows-x64'){throw '发行包标识无效。'}
foreach($siProperty in $siManifest.files.PSObject.Properties){
  if($siProperty.Name -match '(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)' ){throw '发行清单包含无效路径。'}
  $siFile=Join-Path $siPayload $siProperty.Name
  $siSha=[Security.Cryptography.SHA256]::Create()
  try{$siDigest=[BitConverter]::ToString($siSha.ComputeHash([IO.File]::ReadAllBytes($siFile))).Replace('-','').ToLowerInvariant()}finally{$siSha.Dispose()}
  if($siDigest -ne $siProperty.Value){throw ('发行文件校验失败：'+$siProperty.Name)}
}
if(-not $NodePath){$siNodeCommand=Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1;if($siNodeCommand){$NodePath=$siNodeCommand.Source}}
if(-not $NodePath -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)){throw '需要先安装 Node.js 22 或更新的 LTS 版本，也可使用 -NodePath 指定 node.exe。'}
$NodePath=[IO.Path]::GetFullPath($NodePath)
$siNodeVersion=& $NodePath --version
if($LASTEXITCODE -ne 0 -or $siNodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22){throw '需要 Node.js 22 或更新版本。'}
$siRuntime=Join-Path $DataRoot 'v2';$siServiceFile=Join-Path $siRuntime 'skin-service.mjs'
$siHelpers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($siServiceFile)})
if($siHelpers.Count){throw '这个数据目录的换肤后台正在运行。请先自行退出对应的 Codex，后台自然结束后再安装。当前窗口已保留。'}
$siInventory=$null
if(-not $NoShortcut){$siInventory=(& (Join-Path $siPayload 'v2\launcher-windows.ps1') -Root $DataRoot) | ConvertFrom-Json}
# Back up only program files. Account/profile and user themes are never replaced.
$siBackup=$null
if(Test-Path -LiteralPath $siRuntime){
  $siBackup=Join-Path $DataRoot ('backups\install-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff'))
  [IO.Directory]::CreateDirectory($siBackup) | Out-Null
  foreach($siFolder in @('v2','engine','bundled-themes')){if(Test-Path -LiteralPath (Join-Path $DataRoot $siFolder)){Copy-Item -LiteralPath (Join-Path $DataRoot $siFolder) -Destination $siBackup -Recurse}}
}
[IO.Directory]::CreateDirectory($DataRoot) | Out-Null
foreach($siProperty in $siManifest.files.PSObject.Properties){
  $siTarget=Join-Path $DataRoot $siProperty.Name;Assert-SiPlainPath $siTarget
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($siTarget)) | Out-Null
  Copy-Item -LiteralPath (Join-Path $siPayload $siProperty.Name) -Destination $siTarget -Force
}
$siUtf8=New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $siRuntime 'launcher-config.json'),(@{nodePath=$NodePath}|ConvertTo-Json),$siUtf8)
& $NodePath (Join-Path $siRuntime 'initialize-data.mjs') $DataRoot
if($LASTEXITCODE -ne 0){throw '主题初始化失败。已有用户资料已保留，请检查错误信息。'}
[IO.File]::WriteAllText((Join-Path $DataRoot 'installation.json'),(@{name=$siManifest.name;version=$siManifest.version;installedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json),$siUtf8)
$siShortcutPath=$null
if(-not $NoShortcut){
  $siIcon=Join-Path $siRuntime 'si-skin.ico'
  # Official artwork is read from this computer only; it is absent from releases.
  $siOfficialPng=Join-Path $siInventory.package.root 'assets\Square44x44Logo.targetsize-256_altform-unplated.png'
  if(Test-Path -LiteralPath $siOfficialPng){
    $siBytes=[IO.File]::ReadAllBytes($siOfficialPng);$siMemory=New-Object IO.MemoryStream;$siBinary=New-Object IO.BinaryWriter($siMemory)
    try{$siBinary.Write([uint16]0);$siBinary.Write([uint16]1);$siBinary.Write([uint16]1);$siBinary.Write([byte]0);$siBinary.Write([byte]0);$siBinary.Write([byte]0);$siBinary.Write([byte]0);$siBinary.Write([uint16]1);$siBinary.Write([uint16]32);$siBinary.Write([uint32]$siBytes.Length);$siBinary.Write([uint32]22);$siBinary.Write([byte[]]$siBytes);$siIcon=Join-Path $siRuntime 'codex-local.ico';[IO.File]::WriteAllBytes($siIcon,$siMemory.ToArray())}finally{$siBinary.Dispose();$siMemory.Dispose()}
  }
  $siShortcutPath=Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex（祀）.lnk'
  $siShell=New-Object -ComObject WScript.Shell;$siShortcut=$siShell.CreateShortcut($siShortcutPath)
  $siShortcut.TargetPath=Join-Path $siRuntime 'CodexSkin.exe';$siShortcut.Arguments='';$siShortcut.WorkingDirectory=$siRuntime;$siShortcut.IconLocation=$siIcon+',0'
  $siShortcut.Description='启动 Codex 并应用祀皮肤；已运行时复用窗口';$siShortcut.Save()
}
[pscustomobject]@{Installed=$true;Version=$siManifest.version;DataRoot=$DataRoot;Shortcut=$siShortcutPath;Backup=$siBackup;StartedCodex=$false} | ConvertTo-Json -Depth 3
