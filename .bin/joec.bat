@echo off

rem Get the directory of the current script
set "SCRIPT_DIR=%~dp0"

rem Remove trailing backslash from the script directory
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

rem Reference a file in the parent directory of the script
for %%i in ("%SCRIPT_DIR%\..") do set "PARENT_DIR=%%~dpi"

node %PARENT_DIR%_build/compile.js %*
