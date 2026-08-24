#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🌸 生命之花 · Life-OS 启动中..."
echo ""

# Kill any existing processes
kill $(lsof -ti :5173) 2>/dev/null || true
sleep 0.5

# Start Vite dev server in background
echo "[1/2] 启动 Vite 开发服务器..."
npx vite --port 5173 &
VITE_PID=$!
sleep 2

# Wait for Vite to be ready
for i in {1..10}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "       ✅ Vite 就绪 (http://localhost:5173)"
    break
  fi
  sleep 1
done

# Start Electron
echo "[2/2] 启动 Electron..."
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . &
ELECTRON_PID=$!

echo ""
echo "✅ 生命之花已启动！"
echo "   Vite PID: $VITE_PID"
echo "   Electron PID: $ELECTRON_PID"
echo ""
echo "关闭方式: kill $VITE_PID $ELECTRON_PID"
echo ""

# Wait for Electron to exit
wait $ELECTRON_PID 2>/dev/null
kill $VITE_PID 2>/dev/null
