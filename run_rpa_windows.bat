@echo off
chcp 65001 > nul
title ANTIGRAVITY RPA - Runner
color 0B

cd /d "%~dp0"

echo ========================================================
echo   🤖 EXECUTANDO RPA (TIRO CURTO)
echo   %date% %time%
echo ========================================================

:: REMOVIDO --production para não quebrar ambiente de dev
echo [1/2] Verificando dependencias...
call npm install --no-audit --no-fund --quiet > nul 2>&1

:: Executa apenas o script de automação e fecha quando terminar
echo [2/2] Executando Runner...
node server/rpa_runner.js

if %errorlevel% neq 0 (
    echo.
    echo ❌ Ocorreu um erro na execucao.
    timeout /t 10
) else (
    echo.
    echo ✅ Concluido com sucesso.
    timeout /t 5
)
