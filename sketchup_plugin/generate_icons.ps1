# PowerShell Script para gerar os ícones oficiais da barra de ferramentas do SketchUp
Add-Type -AssemblyName System.Drawing

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Split-Path -Parent $CurrentDir
$LogoPath = Join-Path $BaseDir "Logo_Oficial_iGUi.png"
if (-not (Test-Path $LogoPath)) {
    $LogoPath = Join-Path $BaseDir "LogoSite.png"
}
$IconsDir = Join-Path $CurrentDir "papasys_paginacao\icons"

if (-not (Test-Path $IconsDir)) {
    New-Item -ItemType Directory -Path $IconsDir -Force | Out-Null
}

function Resize-Image-Fit {
    param(
        [System.Drawing.Image]$Image,
        [int]$Size,
        [string]$OutputPath
    )
    $destImage = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $destImage.SetResolution($Image.HorizontalResolution, $Image.VerticalResolution)

    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Ajusta preservando a proporção exata sem distorção
    $scale = [Math]::Min($Size / $Image.Width, $Size / $Image.Height)
    $w = [Math]::Max(1, [int]($Image.Width * $scale))
    $h = [Math]::Max(1, [int]($Image.Height * $scale))
    $x = [int](($Size - $w) / 2)
    $y = [int](($Size - $h) / 2)

    $destRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
    $graphics.DrawImage($Image, $destRect, 0, 0, $Image.Width, $Image.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()

    $destImage.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImage.Dispose()
}

Write-Host "-> Gerando ícones iGUi a partir de $LogoPath..." -ForegroundColor Cyan
$logoImg = [System.Drawing.Image]::FromFile($LogoPath)

# 1. Ícones principais da barra do SketchUp (icon_16, icon_24, icon_32, icon_48)
Resize-Image-Fit -Image $logoImg -Size 16 -OutputPath (Join-Path $IconsDir "icon_16.png")
Resize-Image-Fit -Image $logoImg -Size 24 -OutputPath (Join-Path $IconsDir "icon_24.png")
Resize-Image-Fit -Image $logoImg -Size 32 -OutputPath (Join-Path $IconsDir "icon_32.png")
Resize-Image-Fit -Image $logoImg -Size 48 -OutputPath (Join-Path $IconsDir "icon_48.png")

# 2. Ícones de Painel (painel_16, painel_24, painel_32, painel_48)
Resize-Image-Fit -Image $logoImg -Size 16 -OutputPath (Join-Path $IconsDir "painel_16.png")
Resize-Image-Fit -Image $logoImg -Size 24 -OutputPath (Join-Path $IconsDir "painel_24.png")
Resize-Image-Fit -Image $logoImg -Size 32 -OutputPath (Join-Path $IconsDir "painel_32.png")
Resize-Image-Fit -Image $logoImg -Size 48 -OutputPath (Join-Path $IconsDir "painel_48.png")

$logoImg.Dispose()

# 3. Ícones de Ajuste Rápido (Raio/Lightning) e Atualização
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

Write-Host "✅ Todos os ícones oficiais iGUi foram gerados com sucesso em $IconsDir" -ForegroundColor Green
