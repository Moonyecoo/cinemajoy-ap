#!/usr/bin/env bash
#
# 打包成可双击的 影悦.app
#   npm run pack

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_APP="$HERE/node_modules/electron/dist/Electron.app"
DIST="$HERE/dist"
APP="$DIST/影悦.app"
PLIST="$APP/Contents/Info.plist"
PB=/usr/libexec/PlistBuddy
BUNDLE_ID="com.cinemajoy.app"
VERSION="$(node -p "require('$HERE/package.json').version" 2>/dev/null || echo 2.0.0)"

[ -d "$SRC_APP" ] || { echo "✗ 找不到 Electron 运行时，先 npm install"; exit 1; }

echo "→ 复制运行时…"
rm -rf "$APP"; mkdir -p "$DIST"
ditto "$SRC_APP" "$APP"

echo "→ 放入应用代码…"
APPDIR="$APP/Contents/Resources/app"
mkdir -p "$APPDIR"
for item in main.js preload.js package.json lib src data assets; do
  [ -e "$HERE/$item" ] && ditto "$HERE/$item" "$APPDIR/$item"
done

if [ -d "$HERE/node_modules" ]; then
  echo "→ 打包依赖模块（已开启体积深度脱脂减负）…"
  rsync -a \
    --exclude='electron' \
    --exclude='@xenova/transformers/.cache' \
    --exclude='sharp' \
    --exclude='electron-winstaller' \
    --exclude='app-builder-lib' \
    --exclude='postject' \
    --exclude='onnxruntime-web' \
    --exclude='onnxruntime-node/bin/napi-v3/win32' \
    --exclude='onnxruntime-node/bin/napi-v3/linux' \
    --exclude='@electron' \
    --exclude='hls.js' \
    --exclude='lodash' \
    --exclude='bare-url' \
    --exclude='tar' \
    --exclude='@types' \
    --exclude='ajv' \
    --exclude='*.map' \
    --exclude='*.md' \
    --exclude='*.ts' \
    --exclude='test' \
    --exclude='tests' \
    --exclude='docs' \
    "$HERE/node_modules/" "$APPDIR/node_modules/"
fi

# 打包体积优化：vendor 里的 sourcemap、图标源文件不需要
rm -f "$APPDIR"/src/vendor/*.map "$APPDIR"/assets/icon.html "$APPDIR"/assets/icon-1024.png 2>/dev/null || true

echo "→ 改写 Info.plist…"
set_plist() { "$PB" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 string $2" "$PLIST"; }
set_plist CFBundleName               "影悦"
set_plist CFBundleDisplayName        "影悦"
set_plist CFBundleIdentifier         "$BUNDLE_ID"
set_plist CFBundleShortVersionString "$VERSION"
set_plist CFBundleVersion            "$VERSION"
set_plist CFBundleExecutable         "Electron"
set_plist CFBundleIconFile           "AppIcon"
set_plist CFBundleIconName           "AppIcon"
set_plist NSHumanReadableCopyright   "影悦 独立版"
set_plist LSApplicationCategoryType  "public.app-category.entertainment"

echo "→ 安装图标…"
if [ -f "$HERE/assets/AppIcon.icns" ]; then
  ditto "$HERE/assets/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
  ditto "$HERE/assets/AppIcon.icns" "$APP/Contents/Resources/electron.icns"
  ditto "$HERE/assets/AppIcon.icns" "$APP/Contents/Resources/app.icns"
  touch "$APP"
  echo "  已应用 AppIcon.icns"
fi

echo "→ 处理签名…"
if codesign -dv "$SRC_APP" >/dev/null 2>&1; then
  while IFS= read -r nested; do
    codesign --force --deep --sign - --preserve-metadata=entitlements,requirements,flags,runtime "$nested" >/dev/null 2>&1 || true
  done < <(find "$APP/Contents/Frameworks" -maxdepth 1 \( -name '*.app' -o -name '*.framework' \) -print)
  codesign --force --sign - --preserve-metadata=entitlements,requirements,flags,runtime "$APP" >/dev/null 2>&1 || echo "  (重签失败，本机通常仍可运行)"
else
  echo "  源运行时未签名 → 跳过重签"
fi
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo
echo "✓ 打包完成：$APP"
du -sh "$APP" | awk '{print "  体积：" $1}'
