@echo off
title DevicePassport Tester V4 Installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-device-passport-tester.ps1" -Launch
if errorlevel 1 pause
