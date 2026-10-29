@echo off
echo ===================================================
echo   Building PDF Combiner Pro for Windows
echo ===================================================
echo.
echo Installing npm dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo Warning: First npm install failed due to node_modules/cache corruption.
    echo Attempting clean install...
    echo Deleting node_modules and package-lock.json...
    if exist node_modules rmdir /s /q node_modules
    if exist package-lock.json del /f /q package-lock.json
    echo.
    echo Clearing npm cache...
    call npm cache clean --force
    echo.
    echo Retrying npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo.
        echo Error: Clean npm install failed.
        pause
        exit /b %ERRORLEVEL%
    )
)

echo.
echo Compiling Windows executable...
call npm run build:win
if %ERRORLEVEL% neq 0 (
    echo.
    echo Error: Build process failed.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo   Build completed! Executables are in "dist\" folder.
echo ===================================================
pause
