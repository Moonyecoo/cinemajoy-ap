'use strict'

const { app, BrowserWindow, session } = require('electron')

module.exports = async function runCheck() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  const wc = win.webContents

  session.defaultSession.webRequest.onErrorOccurred((details) => {
    if (details.resourceType === 'image') {
      console.log('>>> [RENDERER IMG ERROR]', details.error, details.url)
    }
  })

  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.resourceType === 'image') {
      console.log('>>> [RENDERER IMG OK]', details.statusCode, details.url.slice(0, 70))
    }
  })

  await new Promise((r) => setTimeout(r, 6000))

  const results = await wc.executeJavaScript(`(() => {
    const cards = [...document.querySelectorAll('.card')];
    return cards.slice(0, 5).map(c => {
      const img = c.querySelector('img');
      return {
        title: c.getAttribute('title'),
        imgSrc: img ? img.src.slice(0, 80) : null,
        imgComplete: img ? img.complete : null,
        imgNaturalWidth: img ? img.naturalWidth : null,
        imgDataset: img ? { ...img.dataset } : null
      };
    });
  })()`)

  console.log('>>> DOM CARDS CHECK:', JSON.stringify(results, null, 2))
  app.exit(0)
}

