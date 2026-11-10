@echo off
rem Compile Ronin.exe dans dist\
cd /d "%~dp0"
python -m PyInstaller --noconfirm --clean --onefile --windowed --name Ronin --icon assets\ronin.ico --add-data "ui;ui" app.py
echo.
echo Fini : dist\Ronin.exe
