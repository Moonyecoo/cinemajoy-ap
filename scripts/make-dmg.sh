#!/usr/bin/env bash
#
# 打包生成 影悦 macOS DMG 安装镜像文件
#   npm run dmg
#

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$HERE/dist"
APP="$DIST/影悦.app"
VERSION="$(node -p "require('$HERE/package.json').version" 2>/dev/null || echo 2.4.0)"
DMG_NAME="影悦-${VERSION}.dmg"
DMG_PATH="$DIST/$DMG_NAME"
STAGE="$DIST/dmg_stage"

# 1. 始终确保是最新的 .app
echo "→ 正在构建最新应用程序包…"
"$HERE/scripts/pack.sh"

echo "→ 准备 DMG 挂载区…"
rm -rf "$STAGE" "$DMG_PATH"
mkdir -p "$STAGE"

# 2. 复制应用与应用程序替身软链接
echo "  复制应用文件…"
ditto "$APP" "$STAGE/影悦.app"

echo "  创建 Applications 快捷安装软链接…"
ln -s /Applications "$STAGE/Applications"

# 3. 使用 macOS 原生 hdiutil 压缩生成 UDZO 格式的 DMG 镜像
echo "→ 正在生成 DMG 镜像 ($DMG_NAME)…"
hdiutil create \
  -volname "影悦" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH"

# 4. 清理临时目录
rm -rf "$STAGE"

# 5. 自动同步更新到本机的 /Applications/影悦.app，并强制刷新 macOS 图标与缓存
if [ -d "/Applications" ]; then
  echo "→ 正在同步安装至 /Applications/影悦.app…"
  rm -rf "/Applications/影悦.app"
  ditto "$APP" "/Applications/影悦.app"
  touch "/Applications/影悦.app"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -r "/Applications/影悦.app" 2>/dev/null || true
  qlmanage -r cache 2>/dev/null || true
  qlmanage -r 2>/dev/null || true
  defaults write com.apple.dock ResetLaunchPad -bool true 2>/dev/null || true
  killall Dock 2>/dev/null || true
  killall Finder 2>/dev/null || true
fi

echo
echo "✓ DMG 打包成功！"
echo "  安装包位置：$DMG_PATH"
du -sh "$DMG_PATH" | awk '{print "  压缩后体积：" $1}'

