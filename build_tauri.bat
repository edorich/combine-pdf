@echo off
echo ===================================================
echo   Building PDF Combiner Pro (Tauri v2) for Windows
echo ===================================================
echo.
echo Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo Error: npm install failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Compiling Tauri Windows executable...
call npx @tauri-apps/cli build
if %ERRORLEVEL% neq 0 (
    echo.
    echo Error: Tauri build process failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo   Build completed! Executables are in "src-tauri\target\release\bundle\"
echo ===================================================
pause
