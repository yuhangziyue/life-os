#!/bin/bash
# 生命之花 · 操作测试入口
#
#   ./e2e/run.sh          开发模式（vite dev server + Electron）
#   ./e2e/run.sh prod     生产渲染路径（vite build + file:// 加载 dist/）
#   ./e2e/run.sh packaged 打包产物（release/mac-arm64/生命之花.app）
#
# 三种模式跑的是同一套用例，差别只在被测对象是哪一层。
set -u
cd "$(dirname "$0")/.."
MODE="${1:-dev}"

# ⚠️ ELECTRON_RUN_AS_NODE 若被外部环境设成 1，Electron 会退化成纯 Node、永远不开窗口。
# 下面每处启动都用 env -u 摘掉它。
ELECTRON=node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
PACKAGED="release/mac-arm64/生命之花.app/Contents/MacOS/生命之花"

cleanup() {
  pkill -f "MacOS/Electron \." 2>/dev/null
  pkill -f "生命之花.app" 2>/dev/null
  sleep 2
}

case "$MODE" in
  dev)
    if ! curl -s -o /dev/null http://127.0.0.1:5173; then
      echo "[e2e] 启动 vite dev server..."
      (npx vite --port 5173 > /tmp/lifeos-vite.log 2>&1 &)
      sleep 5
    fi
    cleanup
    echo "[e2e] 开发模式启动 Electron"
    (env -u ELECTRON_RUN_AS_NODE "$ELECTRON" . \
       --remote-debugging-port=9333 --inspect=9339 > /tmp/lifeos-electron.log 2>&1 &)
    MATCH=localhost:5173
    ;;
  prod)
    echo "[e2e] vite build..."
    ./node_modules/.bin/vite build > /tmp/lifeos-build.log 2>&1 || { tail -20 /tmp/lifeos-build.log; exit 1; }
    cleanup
    echo "[e2e] 生产渲染路径启动（LIFEOS_FORCE_PROD=1，走 file://）"
    (env -u ELECTRON_RUN_AS_NODE LIFEOS_FORCE_PROD=1 "$ELECTRON" . \
       --remote-debugging-port=9333 --inspect=9339 > /tmp/lifeos-electron.log 2>&1 &)
    MATCH=index.html
    ;;
  packaged)
    [ -x "$PACKAGED" ] || { echo "找不到打包产物，请先跑：npm run build:mac 或 npx electron-builder --dir"; exit 1; }
    cleanup
    echo "[e2e] 启动打包产物"
    (env -u ELECTRON_RUN_AS_NODE "$PACKAGED" \
       --remote-debugging-port=9333 --inspect=9339 > /tmp/lifeos-electron.log 2>&1 &)
    MATCH=index.html
    ;;
  *)
    echo "用法: ./e2e/run.sh [dev|prod|packaged]"; exit 1 ;;
esac

CDP_URL_MATCH=$MATCH node e2e/operation-test.mjs
