@echo off
setlocal
rem Foreground source adapter. Uses the real Foundation host and trusted runtime control.
if not exist "%~dp0.venv\Scripts\python.exe" goto missing
"%~dp0.venv\Scripts\python.exe" -I "%~dp0tools\source_launcher.py" console
set "soma_exit_code=%errorlevel%"
goto finish
:missing
echo Run soma_setup.bat to prepare the source environment. 1>&2
set "soma_exit_code=10"
:finish
if "%soma_exit_code%"=="0" exit /b 0
echo SOMA console failed ^(exit code %soma_exit_code%^). Review the error above. 1>&2
if /i not "%~1"=="--no-pause" pause
exit /b %soma_exit_code%
