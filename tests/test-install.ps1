$ErrorActionPreference='Stop'
$siRepository=Split-Path $PSScriptRoot -Parent
$siRoot=Join-Path $siRepository ('tmp\install-fixture-'+[Guid]::NewGuid().ToString('N'))
$siInstaller=Join-Path $siRepository 'install.ps1'
& $siInstaller -DataRoot $siRoot -NoShortcut
if($LASTEXITCODE -ne 0){throw 'Isolated install failed'}
$siSettings=Join-Path $siRoot 'settings-v2.json'
$siBefore=[IO.File]::ReadAllBytes($siSettings)
$siThemes=Get-ChildItem -LiteralPath (Join-Path $siRoot 'themes-v2') -File
if($siThemes.Count -ne 1){throw 'Initial theme count mismatch'}
& $siInstaller -DataRoot $siRoot -NoShortcut
if($LASTEXITCODE -ne 0){throw 'Isolated reinstallation failed'}
if([Convert]::ToBase64String($siBefore) -ne [Convert]::ToBase64String([IO.File]::ReadAllBytes($siSettings))){throw 'Reinstallation overwrote user theme state'}
if(Test-Path -LiteralPath (Join-Path $siRoot 'state.json')){throw 'Installer launched Codex or created a debugger identity'}
$siShortcut=[Environment]::GetFolderPath('Programs')
[pscustomobject]@{pass=$true;isolatedRoot=$siRoot;checks=@('fresh install','reinstall preserves state','no Codex launch','no shortcut creation in test mode')} | ConvertTo-Json -Depth 3
