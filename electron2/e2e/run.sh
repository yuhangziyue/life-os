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

# 挂账 #8：dev/e2e 退出时不收子进程，实测积到过 37 个僵尸 vite（最老 7 天），
# 会让下一次 `npm run dev` 的 Electron 去加载几天前的旧服务、而且不报错。
# 这里装一个 trap：本脚本自己起的 vite 与 Electron，退出（含 Ctrl-C / 异常）时一并收掉。
VITE_PID=""
on_exit() {
  local code=$?
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null
  cleanup
  exit $code
}
trap on_exit EXIT INT TERM

case "$MODE" in
  dev)
    if ! curl -s -o /dev/null http://127.0.0.1:5173; then
      echo "[e2e] 启动 vite dev server..."
      npx vite --port 5173 > /tmp/lifeos-vite.log 2>&1 &
      VITE_PID=$!
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
