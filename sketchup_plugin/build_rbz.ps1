# PowerShell Script para compilar o Plugin SketchUp (.rbz) para PapaSys
# Uso: .\build_rbz.ps1

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Compilando PapaSys Paginação para SketchUp    " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = $CurrentDir
$ZipPath = Join-Path $OutputDir "papasys_paginacao.zip"
$RbzPath = Join-Path $OutputDir "papasys_paginacao.rbz"
$BaseDir = Split-Path -Parent $CurrentDir
$SistemaWebPluginDir = Join-Path $BaseDir "sistema_web\plugin"

# Extrai a versão de version.rb
$VersionContent = Get-Content (Join-Path $CurrentDir "papasys_paginacao\version.rb") -Raw
if ($VersionContent -match "VERSION\s*=\s*'([^']+)'") {
    $PluginVersion = $matches[1]
} else {
    $PluginVersion = "1.0.0"
}
Write-Host "-> Versão PapaSys detectada: v$PluginVersion" -ForegroundColor Green

# Limpa compilações anteriores
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
if (Test-Path $RbzPath) { Remove-Item $RbzPath -Force }

# Cria pasta temporária limpa para empacotar
$TempStage = Join-Path $OutputDir "stage_rbz"
if (Test-Path $TempStage) { Remove-Item $TempStage -Recurse -Force }
New-Item -ItemType Directory -Path $TempStage | Out-Null

Write-Host "1. Copiando arquivos fonte do PapaSys..." -ForegroundColor Yellow
Copy-Item (Join-Path $CurrentDir "papasys_paginacao.rb") -Destination $TempStage
Copy-Item (Join-Path $CurrentDir "papasys_paginacao") -Destination (Join-Path $TempStage "papasys_paginacao") -Recurse

Write-Host "2. Compactando arquivos (.zip)..." -ForegroundColor Yellow
Compress-Archive -Path "$TempStage\*" -DestinationPath $ZipPath -Force

Write-Host "3. Convertendo para pacote oficial SketchUp (.rbz)..." -ForegroundColor Yellow
Rename-Item -Path $ZipPath -NewName "papasys_paginacao.rbz"

# Copia para o sistema web
if (-not (Test-Path $SistemaWebPluginDir)) {
    New-Item -ItemType Directory -Path $SistemaWebPluginDir -Force | Out-Null
}
Copy-Item $RbzPath -Destination (Join-Path $SistemaWebPluginDir "papasys_paginacao.rbz") -Force

# Atualiza version.json
$VersionJson = @{
    version = $PluginVersion
    download_url = "plugin/papasys_paginacao.rbz"
    changelog = "Versao PapaSys v${PluginVersion}: snap de centro sem recortes, calculo de m2 e borda linear, e auto-atualizacao integrada."
    mandatory = $false
} | ConvertTo-Json
Set-Content -Path (Join-Path $SistemaWebPluginDir "version.json") -Value $VersionJson -Encoding UTF8

# Limpeza
Remove-Item $TempStage -Recurse -Force

Write-Host "=================================================" -ForegroundColor Green
Write-Host " [SUCESSO] Pacote PapaSys gerado com sucesso!" -ForegroundColor Green
Write-Host " - Arquivo local: $RbzPath" -ForegroundColor White
Write-Host " - Arquivo Web:   $SistemaWebPluginDir\papasys_paginacao.rbz" -ForegroundColor White
Write-Host " - Versão Web:    $SistemaWebPluginDir\version.json" -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Green
