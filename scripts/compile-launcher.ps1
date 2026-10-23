[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SourceFile,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$siIconMemory=New-Object IO.MemoryStream
$siWriter=New-Object IO.BinaryWriter($siIconMemory)
$siImages=New-Object 'Collections.Generic.List[byte[]]'
$siSizes=@(16,24,32,48,64,128,256)
try {
  foreach($siSize in $siSizes){
    $siBitmap=New-Object Drawing.Bitmap($siSize,$siSize)
    $siGraphics=[Drawing.Graphics]::FromImage($siBitmap)
    $siPng=New-Object IO.MemoryStream
    $siDark=New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#102823'))
    $siGreen=New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#7CDAC1'))
    $siLight=New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#B5EACF'),14)
    $siLeaf=New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#B8D790'))
    $siWave=New-Object Drawing.Drawing2D.GraphicsPath
    try {
      $siGraphics.SmoothingMode='AntiAlias';$siGraphics.ScaleTransform($siSize/256.0,$siSize/256.0)
      $siGraphics.FillEllipse($siDark,8,8,240,240)
      $siWave.AddBezier(40,120,84,64,84,64,128,112);$siWave.AddBezier(128,112,172,160,172,160,216,104)
      $siWave.AddLine(216,104,216,146);$siWave.AddBezier(216,146,172,194,172,194,128,146);$siWave.AddBezier(128,146,84,98,84,98,40,154);$siWave.CloseFigure()
      $siGraphics.FillPath($siGreen,$siWave)
      $siGraphics.DrawBezier($siLight,40,162,84,114,84,114,128,162);$siGraphics.DrawBezier($siLight,128,162,172,210,172,210,216,154)
      $siGraphics.FillEllipse($siLeaf,156,47,47,35)
      $siBitmap.Save($siPng,[Drawing.Imaging.ImageFormat]::Png);$siImages.Add($siPng.ToArray())
    } finally { $siWave.Dispose();$siLeaf.Dispose();$siLight.Dispose();$siGreen.Dispose();$siDark.Dispose();$siPng.Dispose();$siGraphics.Dispose();$siBitmap.Dispose() }
  }
  $siWriter.Write([uint16]0);$siWriter.Write([uint16]1);$siWriter.Write([uint16]$siSizes.Count)
  $siOffset=6+16*$siSizes.Count
  for($siIndex=0;$siIndex -lt $siSizes.Count;$siIndex++){
    $siDimension=if($siSizes[$siIndex] -eq 256){0}else{$siSizes[$siIndex]}
    $siWriter.Write([byte]$siDimension);$siWriter.Write([byte]$siDimension);$siWriter.Write([byte]0);$siWriter.Write([byte]0)
    $siWriter.Write([uint16]1);$siWriter.Write([uint16]32);$siWriter.Write([uint32]$siImages[$siIndex].Length);$siWriter.Write([uint32]$siOffset)
    $siOffset+=$siImages[$siIndex].Length
  }
  foreach($siImage in $siImages){$siWriter.Write([byte[]]$siImage)}
  $siIcon=Join-Path $OutputDirectory 'si-skin.ico';[IO.File]::WriteAllBytes($siIcon,$siIconMemory.ToArray())
} finally {$siWriter.Dispose();$siIconMemory.Dispose()}
$siCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $siCompiler -PathType Leaf)){throw 'Windows .NET Framework C# compiler is required.'}
& $siCompiler /nologo /target:winexe /codepage:65001 ('/out:'+(Join-Path $OutputDirectory 'CodexSkin.exe')) ('/win32icon:'+$siIcon) /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll $SourceFile
if($LASTEXITCODE -ne 0){throw 'Launcher compilation failed.'}
