#!/bin/bash
# MixLab 双端通信看板 —— 停止服务（双击运行）
set -u
pkill -f "scripts/dev/advisor.mjs watch" >/dev/null 2>&1 || true
pkill -f "scripts/dev/mail-liveness.mjs watch" >/dev/null 2>&1 || true
if pkill -f "scripts/dev/mail-server.mjs" >/dev/null 2>&1; then
  osascript -e 'display notification "通信看板已停止" with title "MixLab"' >/dev/null 2>&1 || true
else
  osascript -e 'display notification "看板未在运行" with title "MixLab"' >/dev/null 2>&1 || true
fi
