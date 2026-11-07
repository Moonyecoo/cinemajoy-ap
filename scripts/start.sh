#!/usr/bin/env bash
#
# 启动「影悦 · 独立版」
#   ./scripts/start.sh
#   KKY_NO_SANDBOX=1 ./scripts/start.sh    # 当前 shell 本身在受限沙箱里时用这个

set -u

# 宿主环境可能带 ELECTRON_RUN_AS_NODE=1，会让 Electron 退化成纯 Node
unset ELECTRON_RUN_AS_NODE

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="$HERE/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"

EXTRA_ARGS=()
if [ "${KKY_NO_SANDBOX:-0}" = "1" ]; then
  EXTRA_ARGS+=(--no-sandbox --disable-gpu)
fi

if [ ! -x "$ELECTRON" ]; then
  echo "✗ 找不到 Electron 运行时：$ELECTRON"
  echo "  先执行：cd \"$HERE\" && npm install"
  exit 1
fi

exec "$ELECTRON" "$HERE" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} "$@"
