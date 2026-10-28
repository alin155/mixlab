#!/bin/bash
# MixLab 双端通信看板 —— 停止服务（双击运行）
set -u
if pkill -f "mail-server.mjs --port 8791" >/dev/null 2>&1; then
  osascript -e 'display notification "通信看板已停止" with title "MixLab"' >/dev/null 2>&1 || true
else
  osascript -e 'display notification "看板未在运行" with title "MixLab"' >/dev/null 2>&1 || true
fi
