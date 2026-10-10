@echo off
setlocal
rem Explicit source-development database reset. Requires interactive RESET confirmation.
if not exist "%~dp0.venv\Scripts\python.exe" goto missing
"%~dp0.venv\Scripts\python.exe" -I "%~dp0tools\source_launcher.py" reset
set "soma_exit_code=%errorlevel%"
goto finish
:missing
echo Run soma_setup.bat to prepare the source environment. 1>&2
set "soma_exit_code=10"
:finish
echo SOMA development reset finished ^(exit code %soma_exit_code%^). Review the output above.
rem --no-pause suppresses this final pause, never the destructive RESET confirmation.
if /i not "%~1"=="--no-pause" pause
exit /b %soma_exit_code%
