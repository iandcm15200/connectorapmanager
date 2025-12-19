@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM SERVICIO AUTOMÁTICO - Mantiene el servidor API siempre activo
REM Se ejecuta en segundo plano y reinicia el servidor si se detiene
REM ═══════════════════════════════════════════════════════════════════════

cd /d "%~dp0"

:LOOP
REM Verificar si el servidor ya está corriendo
netstat -ano | findstr ":3001" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    timeout /t 5 /nobreak >nul
    goto LOOP
)

REM Servidor no está corriendo, iniciarlo
echo [%date% %time%] Iniciando servidor API...
start /B node api-servidor.js

REM Esperar 5 segundos antes de verificar nuevamente
timeout /t 5 /nobreak >nul
goto LOOP
