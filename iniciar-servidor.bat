@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM Script para iniciar el servidor API de búsqueda APManager
REM Mantiene el servidor corriendo y lo reinicia automáticamente si falla
REM ═══════════════════════════════════════════════════════════════════════

cd /d "%~dp0"

:INICIO
echo.
echo ═══════════════════════════════════════════════════════════════════════
echo   INICIANDO SERVIDOR API - APManager Widget
echo ═══════════════════════════════════════════════════════════════════════
echo.

node api-servidor.js

echo.
echo ⚠️  El servidor se detuvo inesperadamente
echo 🔄 Reiniciando en 5 segundos...
echo    (Presiona Ctrl+C para cancelar)
echo.
timeout /t 5 /nobreak

goto INICIO
