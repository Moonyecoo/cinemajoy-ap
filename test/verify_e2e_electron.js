'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('assert')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = async function run() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.error('No window found!')
    app.quit()
    return
  }
  const wc = win.webContents

  console.log('=== 3. 验证无头 Electron 渲染进程中海报加载 ===')
  await wc.executeJavaScript("location.hash = '#/cat/movie'")
  await sleep(600)
  await wc.executeJavaScript("document.querySelectorAll('img[loading]').forEach(img => img.removeAttribute('loading'))")

  // 轮询等待海报卡片加载完成
  let stats = null
  for (let i = 0; i < 25; i++) {
    await sleep(400)
    stats = await wc.executeJavaScript(`(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      if (cards.length < 10) return null;
      const imgs = cards.map(c => c.querySelector('img')).filter(Boolean);
      const loaded = imgs.filter(img => img.complete && img.naturalWidth > 0 && !img.src.startsWith('data:image/svg'));
      return {
        cardCount: cards.length,
        imgCount: imgs.length,
        loadedCount: loaded.length,
        proxySrcCount: imgs.filter(img => img.src && img.src.startsWith('http://127.0.0.1:')).length,
        samples: imgs.slice(0, 8).map(img => ({
          title: img.dataset.title || img.alt,
          src: img.src ? img.src.slice(0, 60) : '',
          complete: img.complete,
          w: img.naturalWidth,
          h: img.naturalHeight,
          isReal: !img.src.startsWith('data:image/svg')
        }))
      };
    })()`)

    if (stats && stats.loadedCount >= 10) break
  }

  console.log('[E2E Stats]:', JSON.stringify(stats, null, 2))
  assert(stats, '必须成功渲染卡片')
  assert(stats.cardCount >= 10, '卡片数量必须大于等于 10')
  assert(stats.proxySrcCount >= 10, '所有海报必须走本地 127.0.0.1 代理')
  assert(stats.loadedCount >= 10, '成功加载尺寸的海报数量必须大于等于 10')

  const shot = await wc.capturePage()
  fs.mkdirSync('dist/smoke', { recursive: true })
  fs.writeFileSync('dist/smoke/verified_e2e_grid.png', shot.toPNG())
  console.log('\n>>> 真实渲染端到端断言全部通过! 截图已存至 dist/smoke/verified_e2e_grid.png <<<')
  app.quit()
}

