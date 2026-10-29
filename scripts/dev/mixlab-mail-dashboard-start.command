#!/bin/bash
# MixLab 双端通信看板 —— 一键启动（双击运行）
# 已运行则直接打开页面；未运行则后台启动服务并打开浏览器。
set -u

REPO="$HOME/Documents/mixlab"
PORT=8791
URL="http://127.0.0.1:$PORT"
LOG_DIR="$HOME/Library/Logs/MixLab"
LOG="$LOG_DIR/mail-dashboard.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

alert() {
  osascript -e "display alert \"$1\"" >/dev/null 2>&1 || echo "$1" >&2
}

open_page() {
  open "$URL" >/dev/null 2>&1 || echo "请手动打开 $URL"
}

if ! command -v node >/dev/null 2>&1; then
  alert "找不到 node，请先安装 Node.js（推荐 24 LTS）"
  exit 1
fi

if [ ! -d "$REPO" ]; then
  alert "找不到仓库目录：$REPO"
  exit 1
fi

mkdir -p "$LOG_DIR"

# Codex 顾问 watcher（只读 agent；与看板一起常驻）
if [ -x "$REPO/scripts/dev/advisor.mjs" ] && ! pgrep -f "scripts/dev/advisor.mjs watch" >/dev/null 2>&1; then
  cd "$REPO" || exit 1
  nohup node scripts/dev/advisor.mjs watch --interval 60 >>"$LOG_DIR/advisor.log" 2>&1 &
  disown
fi

# 已在运行：直接打开页面
if curl -s --max-time 2 "$URL/health" >/dev/null 2>&1; then
  open_page
  exit 0
fi
cd "$REPO" || exit 1
nohup node scripts/dev/mail-server.mjs --port "$PORT" --refresh 3000 --fetch 20000 >>"$LOG" 2>&1 &
disown

# 等待服务可用（最多约 20 秒）
for _ in $(seq 1 40); do
  sleep 0.5
  if curl -s --max-time 1 "$URL/health" >/dev/null 2>&1; then
    open_page
    exit 0
  fi
done

alert "看板启动失败，请查看日志：$LOG"
exit 1
