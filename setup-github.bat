@echo off
chcp 65001 >nul
echo ========================================
echo   SMS Sync - GitHub Auto Build APK
echo ========================================
echo.
echo This script will push your project to GitHub.
echo Then auto build APK for download.
echo.
echo Requirements:
echo   1. Git installed
echo   2. GitHub account
echo.
pause

cd /d "%~dp0"

echo.
echo [1/4] Initializing Git...
git init
git add .
git commit -m "Initial commit: SMS Sync project"

echo.
echo [2/4] Please create a GitHub repo:
echo   - Open https://github.com/new
echo   - Repo name: sms-sync
echo   - Choose Public/Private
echo   - DO NOT check README/gitignore/license
echo   - Click Create repository
echo.

set "REPO_URL=https://github.com/putao-lw/sms-sync.git"

echo.
echo [3/4] Pushing to GitHub...
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main

echo.
echo Push completed!
pause