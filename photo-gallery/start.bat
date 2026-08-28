@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Pic source launcher. Builds and runs the current source (hot update).
set "APP_ROOT=%~dp0"
pushd "%APP_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo [Pic] Cannot enter app directory: %APP_ROOT%
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [Pic] package.json not found. Keep this launcher in the project root.
  pause
  popd
  exit /b 1
)

if /I "%~1"=="/check" goto :check
if /I "%~1"=="-check" goto :check

for /f "delims=" %%V in ('node -p "require(""./package.json"").version" 2^>nul') do set "APP_VERSION=%%V"
if not defined APP_VERSION set "APP_VERSION=unknown"

echo [Pic] Source version: %APP_VERSION%
echo [Pic] Building current source...
call npm.cmd run build
set "BUILD_CODE=%ERRORLEVEL%"
if not "%BUILD_CODE%"=="0" (
  echo [Pic] Build failed with exit code %BUILD_CODE%
  pause
  popd
  exit /b %BUILD_CODE%
)

if not exist "node_modules\.bin\electron.cmd" (
  echo [Pic] Electron is not installed. Run npm.cmd install first.
  pause
  popd
  exit /b 1
)

echo [Pic] Starting current source build...
call "node_modules\.bin\electron.cmd" .
set "APP_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %APP_CODE%

:check
for /f "delims=" %%V in ('node -p "require(""./package.json"").version" 2^>nul') do set "APP_VERSION=%%V"
if not defined APP_VERSION set "APP_VERSION=unknown"
echo [Pic] Project: %APP_ROOT%
echo [Pic] package.json version: %APP_VERSION%
if exist "node_modules\.bin\electron.cmd" (
  echo [Pic] Electron: installed
) else (
  echo [Pic] Electron: missing
)
echo [Pic] Mode: current source (hot update)
popd
endlocal & exit /b 0