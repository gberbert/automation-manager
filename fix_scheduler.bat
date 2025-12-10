@echo off
chcp 65001 > nul
echo ========================================================
echo   🛠️ CORRIGINDO AGENDAMENTO DO WINDOWS
echo ========================================================

:: 1. Define caminhos absolutos
set "PROJECT_DIR=%~dp0"
:: Remove trailing backslash if present
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "BAT_FILE=%PROJECT_DIR%\run_rpa_windows.bat"
set "TASK_NAME=AntigravityRPA_Auto"

echo.
echo [1/3] Caminhos detectados:
echo   - Pasta: %PROJECT_DIR%
echo   - Script: %BAT_FILE%

:: 2. Remove tarefa antiga (se existir)
echo.
echo [2/3] Removendo agendamento antigo (se houver)...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 3. Cria nova tarefa
echo.
echo [3/3] Criando novo agendamento...
:: Executa a cada 5 minutos
:: IMPORTANTE: Usa cmd /c para garantir execução correta do bat
schtasks /create /tn "%TASK_NAME%" /tr "cmd.exe /c \"\"%BAT_FILE%\"\"" /sc MINUTE /mo 5 /f

if %errorlevel% neq 0 (
    echo.
    echo ❌ ERRO AO CRIAR TAREFA. Tente rodar como Administrador.
    pause
    exit /b
)

echo.
echo ✅ AGENDAMENTO CORRIGIDO COM SUCESSO!
echo    Nome da Tarefa: %TASK_NAME%
echo    Frequencia: A cada 5 minutos
echo.
echo Pressione qualquer tecla para testar a execucao imediata (ou feche para sair)...
pause > nul

echo.
echo 🚀 Testando execucao manual...
schtasks /run /tn "%TASK_NAME%"

echo.
echo Verifique se uma janela preta abriu e fechou rapidamente.
pause
