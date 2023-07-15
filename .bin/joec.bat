@echo off

rem Get the directory of the current script
set "SCRIPT_DIR=%~dp0"

node %SCRIPT_DIR%/joec %*
