# RENOVADOR AUTOMÁTICO - Ejecutar como servicio de Windows
# 
# Este script mantiene la sesión de APManager activa renovándola cada 2 horas
#
# INSTALACIÓN:
# 1. Abre PowerShell como Administrador
# 2. Ejecuta: powershell -ExecutionPolicy Bypass -File "iniciar-renovador.ps1"
#
# Para detener: Presiona Ctrl+C en la ventana de PowerShell

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔄 RENOVADOR AUTOMÁTICO DE SESIÓN - APManager                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Iniciando renovador en segundo plano..." -ForegroundColor Yellow
Write-Host ""

# Cambiar al directorio del proyecto
Set-Location -Path $PSScriptRoot

# Ejecutar el renovador
try {
    npx ts-node src/renovar-sesion-auto.ts
} catch {
    Write-Host ""
    Write-Host "❌ Error al iniciar renovador: $_" -ForegroundColor Red
    Write-Host ""
    Read-Host "Presiona Enter para salir"
    exit 1
}
