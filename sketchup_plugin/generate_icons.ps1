# PowerShell Script para gerar os ícones oficiais da barra de ferramentas do SketchUp
Add-Type -AssemblyName System.Drawing

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogoPath = Join-Path (Split-Path -Parent $CurrentDir) "LogoSite.png"
$IconsDir = Join-Path $CurrentDir "papasys_paginacao\icons"

if (-not (Test-Path $IconsDir)) {
    New-Item -ItemType Directory -Path $IconsDir -Force | Out-Null
}

function Resize-Image {
    param(
        [System.Drawing.Image]$Image,
        [int]$Width,
        [int]$Height,
        [string]$OutputPath
    )
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $destImage = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $destImage.SetResolution($Image.HorizontalResolution, $Image.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $wrapMode = New-Object System.Drawing.Imaging.ImageAttributes
    $wrapMode.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $graphics.DrawImage($Image, $destRect, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel, $wrapMode)
    $graphics.Dispose()

    $destImage.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImage.Dispose()
}

# 1. Ícones do Painel PapaSys (Baseados no LogoSite)
$logoImg = [System.Drawing.Image]::FromFile($LogoPath)
Resize-Image -Image $logoImg -Width 24 -Height 24 -OutputPath (Join-Path $IconsDir "painel_24.png")
Resize-Image -Image $logoImg -Width 32 -Height 32 -OutputPath (Join-Path $IconsDir "painel_32.png")
Resize-Image -Image $logoImg -Width 48 -Height 48 -OutputPath (Join-Path $IconsDir "painel_48.png")
$logoImg.Dispose()

# 2. Ícones de Ajuste Rápido (Raio/Lightning) e Atualização
function Draw-Icon {
    param(
        [int]$Size,
        [string]$Type,
        [string]$OutputPath
    )
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $orangeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(234, 88, 12))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))

    if ($Type -eq "quick") {
        $rect = New-Object System.Drawing.Rectangle(1, 1, ($Size - 2), ($Size - 2))
        $g.FillEllipse($orangeBrush, $rect)

        $pt1 = New-Object System.Drawing.Point([int]($Size * 0.55), [int]($Size * 0.16))
        $pt2 = New-Object System.Drawing.Point([int]($Size * 0.26), [int]($Size * 0.52))
        $pt3 = New-Object System.Drawing.Point([int]($Size * 0.48), [int]($Size * 0.52))
        $pt4 = New-Object System.Drawing.Point([int]($Size * 0.42), [int]($Size * 0.84))
        $pt5 = New-Object System.Drawing.Point([int]($Size * 0.74), [int]($Size * 0.46))
        $pt6 = New-Object System.Drawing.Point([int]($Size * 0.52), [int]($Size * 0.46))

        [System.Drawing.Point[]]$points = @($pt1, $pt2, $pt3, $pt4, $pt5, $pt6)
        $g.FillPolygon($whiteBrush, $points)
    }
    elseif ($Type -eq "update") {
        $rect = New-Object System.Drawing.Rectangle(1, 1, ($Size - 2), ($Size - 2))
        $g.FillEllipse($darkBrush, $rect)

        $penOrange = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(249, 115, 22), [Math]::Max(2, [int]($Size * 0.08)))
        $g.DrawArc($penOrange, [float]($Size * 0.2), [float]($Size * 0.2), [float]($Size * 0.6), [float]($Size * 0.6), 45, 250)

        $ptA = New-Object System.Drawing.Point([int]($Size * 0.62), [int]($Size * 0.14))
        $ptB = New-Object System.Drawing.Point([int]($Size * 0.84), [int]($Size * 0.32))
        $ptC = New-Object System.Drawing.Point([int]($Size * 0.48), [int]($Size * 0.32))

        [System.Drawing.Point[]]$arrowPoints = @($ptA, $ptB, $ptC)
        $g.FillPolygon($orangeBrush, $arrowPoints)
        $penOrange.Dispose()
    }

    $orangeBrush.Dispose()
    $whiteBrush.Dispose()
    $darkBrush.Dispose()
    $g.Dispose()

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Draw-Icon -Size 24 -Type "quick" -OutputPath (Join-Path $IconsDir "rapido_24.png")
Draw-Icon -Size 32 -Type "quick" -OutputPath (Join-Path $IconsDir "rapido_32.png")
Draw-Icon -Size 48 -Type "quick" -OutputPath (Join-Path $IconsDir "rapido_48.png")

Draw-Icon -Size 24 -Type "update" -OutputPath (Join-Path $IconsDir "update_24.png")
Draw-Icon -Size 32 -Type "update" -OutputPath (Join-Path $IconsDir "update_32.png")
Draw-Icon -Size 48 -Type "update" -OutputPath (Join-Path $IconsDir "update_48.png")

Write-Host "Todos os icones foram gerados com sucesso em $IconsDir" -ForegroundColor Green
