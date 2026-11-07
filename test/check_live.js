'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

module.exports = async function checkLiveApp() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  await new Promise(r => setTimeout(r, 6000))

  await win.webContents.executeJavaScript(`window.scrollTo(0, 700)`)
  await new Promise(r => setTimeout(r, 2000))

  const shot = await win.webContents.capturePage()
  fs.writeFileSync('/Users/moonyecoo/.gemini/antigravity/brain/ea7ad381-7e5e-487c-aa63-be8be0b9c5b9/scrolled_screen.png', shot.toPNG())
  console.log('Saved scrolled screenshot')
  app.exit(0)
}
