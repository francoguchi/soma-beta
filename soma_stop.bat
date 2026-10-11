@echo off
setlocal
rem Source-development adapter. No PID/port/process-name termination authority.
if not exist "%~dp0.venv\Scripts\python.exe" goto missing
"%~dp0.venv\Scripts\python.exe" -I "%~dp0tools\source_launcher.py" stop
set "soma_exit_code=%errorlevel%"
goto finish
:missing
echo Run soma_setup.bat to prepare the source environment. 1>&2
set "soma_exit_code=10"
:finish
echo SOMA stop finished ^(exit code %soma_exit_code%^). Review the output above.
rem Keep double-click results visible; automation can opt out.
if /i not "%~1"=="--no-pause" pause
exit /b %soma_exit_code%
