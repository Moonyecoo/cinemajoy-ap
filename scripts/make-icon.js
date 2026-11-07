'use strict'

/**
 * 用 Electron 自己把 assets/icon.html 渲染成 1024×1024 的透明 PNG。
 * 这样生成图标不依赖本机装没装 Chrome。
 */

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const OUT = path.join(__dirname, '..', 'assets', 'icon-1024.png')
const SIZE = 1024

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  })

  await win.loadFile(path.join(__dirname, '..', 'assets', 'icon.html'))
  await new Promise((r) => setTimeout(r, 1200))

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const png = image.toPNG()
  if (!png || png.length < 5000) {
    console.error('✗ 渲染结果为空')
    app.exit(1)
    return
  }
  fs.writeFileSync(OUT, png)
  console.log('✓ 已生成', OUT, `(${(png.length / 1024).toFixed(0)} KB)`)
  app.exit(0)
})
