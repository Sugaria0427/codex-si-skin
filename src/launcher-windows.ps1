[CmdletBinding()]
param([ValidateSet('Inventory','Owner')][string]$Action='Inventory',[Parameter(Mandatory=$true)][string]$Root,[int]$Port=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$skinNative=@'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SkinCommandLine {
  [DllImport("shell32.dll",SetLastError=true)] static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)]string cmd,out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  public static string[] Parse(string command){int count;var memory=CommandLineToArgvW(command,out count);if(memory==IntPtr.Zero)throw new Exception("Unable to parse process arguments");try{var result=new string[count];for(int i=0;i<count;i++)result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory,i*IntPtr.Size));return result;}finally{LocalFree(memory);}}
}
'@
if($Action -eq 'Owner'){
  $skinOwners=@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess)
  ConvertTo-Json -InputObject $skinOwners -Compress
  exit 0
}
if(-not ('SkinCommandLine' -as [type])){Add-Type -TypeDefinition $skinNative}
$skinPackage=Get-AppxPackage -Name OpenAI.Codex | Sort-Object {[version]$_.Version} -Descending | Select-Object -First 1
if(-not $skinPackage -or $skinPackage.IsDevelopmentMode -or $skinPackage.SignatureKind -ne 'Store' -or $skinPackage.PackageFamilyName -ne 'OpenAI.Codex_2p2nqsd0c76g0'){throw '未找到当前用户安装的官方 Codex。请先从 Microsoft Store 安装或修复 Codex。'}
$skinManifest=Get-AppxPackageManifest -Package $skinPackage.PackageFullName
$skinApplication=@($skinManifest.Package.Applications.Application | Where-Object {$_.Executable.Replace('/','\') -eq 'app\ChatGPT.exe'}) | Select-Object -First 1
if(-not $skinApplication){throw 'Codex 的启动入口已变更，需要更新换肤启动器。'}
$skinExecutable=Join-Path $skinPackage.InstallLocation 'app\ChatGPT.exe'
if(-not (Test-Path -LiteralPath $skinExecutable -PathType Leaf)){throw '官方 Codex 启动文件不存在。'}
$skinProgramFiles=[Environment]::GetFolderPath('ProgramFiles')
$skinTrustedPattern='^'+[regex]::Escape((Join-Path $skinProgramFiles 'WindowsApps\OpenAI.Codex_'))+'[^\\]+__2p2nqsd0c76g0\\app\\ChatGPT\.exe$'
$skinCodex=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {$_.ExecutablePath -match $skinTrustedPattern -and $_.CommandLine -notmatch '\s--type='} | ForEach-Object {
  [pscustomobject]@{pid=[int]$_.ProcessId;exe=$_.ExecutablePath;args=@([SkinCommandLine]::Parse($_.CommandLine) | Select-Object -Skip 1)}
})
$skinService=Join-Path $Root 'v2\skin-service.mjs'
$skinServices=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($skinService)} | ForEach-Object {
  $skinArguments=[SkinCommandLine]::Parse($_.CommandLine)
  if($skinArguments.Length -eq 3 -and $skinArguments[1] -eq $skinService -and $skinArguments[2] -eq $Root){[pscustomobject]@{pid=[int]$_.ProcessId;exe=$_.ExecutablePath}}
})
[pscustomobject]@{package=[pscustomobject]@{root=$skinPackage.InstallLocation;exe=$skinExecutable;fullName=$skinPackage.PackageFullName;family=$skinPackage.PackageFamilyName;version=[string]$skinPackage.Version};codex=$skinCodex;services=$skinServices} | ConvertTo-Json -Depth 6 -Compress
