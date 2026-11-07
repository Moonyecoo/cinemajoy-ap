'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

module.exports = async function checkCats() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  const out = {}
  const cats = ['movie', 'tv', 'anime', 'variety', '4k']

  for (const cat of cats) {
    await win.webContents.executeJavaScript(`location.hash = '#/cat/${cat}'`)
    await new Promise(r => setTimeout(r, 4000))
    const shot = await win.webContents.capturePage()
    fs.writeFileSync(`/Users/moonyecoo/.gemini/antigravity/brain/ea7ad381-7e5e-487c-aa63-be8be0b9c5b9/cat_${cat}.png`, shot.toPNG())

    const stats = await win.webContents.executeJavaScript(`(() => {
      const imgs = [...document.querySelectorAll('.card img')];
      let loaded = 0, failed = 0, pending = 0;
      const failedUrls = [];
      imgs.forEach(img => {
        if (img.naturalWidth > 0) loaded++;
        else if (img.complete && img.naturalWidth === 0) {
          failed++;
          failedUrls.push(img.src);
        } else pending++;
      });
      return { total: imgs.length, loaded, failed, pending, failedUrls: failedUrls.slice(0, 5) };
    })()`)
    out[cat] = stats
  }

  console.log('ALL CATS STATS:', JSON.stringify(out, null, 2))
  app.exit(0)
}

