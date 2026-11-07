'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('fs')

module.exports = async function checkAllSources() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return

  await new Promise(r => setTimeout(r, 4000))

  const sources = await win.webContents.executeJavaScript(`window.kky.sources.list()`)
  const results = {}

  for (const s of sources) {
    if (!s.enabled) continue
    await win.webContents.executeJavaScript(`(() => {
      const site = state.sources.find(x => x.key === ${JSON.stringify(s.key)});
      if (site) {
        state.site = site;
        store.settings.set({ ...store.settings.get(), site: site.key });
      }
      location.hash = '#/cat/movie';
    })()`)
    await new Promise(r => setTimeout(r, 5000))

    const shot = await win.webContents.capturePage()
    fs.writeFileSync(`/Users/moonyecoo/.gemini/antigravity/brain/ea7ad381-7e5e-487c-aa63-be8be0b9c5b9/source_${s.key}.png`, shot.toPNG())

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
    results[s.name] = stats
    console.log(`[CHECK ${s.name}] total=${stats.total}, loaded=${stats.loaded}, failed=${stats.failed}`);
  }

  console.log('ALL SOURCES STATS:', JSON.stringify(results, null, 2))
  app.exit(0)
}
