Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile((Join-Path $PSScriptRoot '..\assets\mycinema-icon.png'))
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = [System.Collections.Generic.List[byte[]]]::new()

foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($source, 0, 0, $size, $size)
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames.Add($stream.ToArray())
  $stream.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$source.Dispose()
$destination = [System.IO.File]::Create((Join-Path $PSScriptRoot '..\assets\mycinema.ico'))
$writer = [System.IO.BinaryWriter]::new($destination)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count

for ($index = 0; $index -lt $sizes.Count; $index++) {
  $dimension = if ($sizes[$index] -eq 256) { [byte]0 } else { [byte]$sizes[$index] }
  $writer.Write($dimension)
  $writer.Write($dimension)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$frames[$index].Length)
  $writer.Write([UInt32]$offset)
  $offset += $frames[$index].Length
}

foreach ($frame in $frames) { $writer.Write($frame) }
$writer.Dispose()
$destination.Dispose()
