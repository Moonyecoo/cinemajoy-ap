#!/usr/bin/env bash
#
# 生成应用图标：icon.html → icon-1024.png → AppIcon.icns
#   npm run make-icon

set -euo pipefail

# 某些环境（例如被宿主进程拉起的 shell）会带 ELECTRON_RUN_AS_NODE=1，
# 它会让 Electron 以纯 Node 模式启动，表现为 require("electron") 为 undefined。
unset ELECTRON_RUN_AS_NODE

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="$HERE/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
SRC="$HERE/assets/icon-1024.png"
ICONSET="$HERE/assets/AppIcon.iconset"

if [ ! -x "$ELECTRON" ]; then
  echo "✗ 找不到 Electron 运行时，先执行：npm install"
  exit 1
fi

echo "→ 渲染 1024 底图…"
EXTRA_ARGS=()
if [ "${KKY_NO_SANDBOX:-0}" = "1" ]; then
  EXTRA_ARGS+=(--no-sandbox --disable-gpu)
fi
"$ELECTRON" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} "$HERE/scripts/make-icon.js"

if [ ! -f "$SRC" ]; then
  echo "✗ 底图未生成：$SRC"
  exit 1
fi

echo "→ 生成 iconset…"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size"            "$SRC" --out "$ICONSET/icon_${size}x${size}.png"      >/dev/null
  sips -z "$((size*2))" "$((size*2))" "$SRC" --out "$ICONSET/icon_${size}x${size}@2x.png"   >/dev/null
done

echo "→ 打包 icns…"
iconutil -c icns "$ICONSET" -o "$HERE/assets/AppIcon.icns"
rm -rf "$ICONSET"

echo "✓ 图标完成：assets/AppIcon.icns"
sips -g pixelWidth -g pixelHeight "$HERE/assets/AppIcon.icns" 2>/dev/null | tail -2 || true
