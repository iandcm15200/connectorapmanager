$ErrorActionPreference = "SilentlyContinue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "SERVICIO AUTOMATICO - APManager API" -ForegroundColor Cyan
Write-Host "Monitoreando servidor en puerto 3001..." -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    $puertoEnUso = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    
    if (-not $puertoEnUso) {
        $tiempo = Get-Date -Format "HH:mm:ss"
        Write-Host "[$tiempo] Servidor detenido. Iniciando..." -ForegroundColor Yellow
        
        Start-Process -FilePath "node" -ArgumentList "api-servidor.js" -WindowStyle Hidden
        
        Start-Sleep -Seconds 3
        
        $verificar = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
        if ($verificar) {
            $tiempo = Get-Date -Format "HH:mm:ss"
            Write-Host "[$tiempo] Servidor iniciado correctamente" -ForegroundColor Green
        }
    }
    
    Start-Sleep -Seconds 5
}
