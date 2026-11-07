'use strict'

/** 画质面板调试：打开面板后每 3 秒探一次，看它到底什么时候消失、是谁点了切换 */

const { app, BrowserWindow } = require('electron')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = function runQDebug() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  const wc = win.webContents

  const probe = () =>
    wc
      .executeJavaScript(
        `(() => ({
          hash: location.hash,
          source: document.getElementById('sourceName')?.textContent || '',
          modal: !!document.getElementById('qualityModal'),
          rows: document.querySelectorAll('#qualityModal .qrow').length,
          empty: document.querySelector('#qualityModal .qmodal-empty')?.textContent || '',
          loading: document.querySelector('#qProgress')?.textContent || '',
          btnQuality: !!document.getElementById('btnQuality'),
          badge: document.getElementById('qualityBadge')?.textContent || ''
        }))()`,
        true
      )
      .catch((e) => ({ error: String(e) }))

  ;(async () => {
    try {
      await sleep(9000)
      console.log('[q] 首页', JSON.stringify(await probe()))

      await wc.executeJavaScript(`location.hash = '#/play/js/40439/0/0'`, true).catch(() => {})
      await sleep(12000)
      console.log('[q] 播放页', JSON.stringify(await probe()))

      const clicked = await wc
        .executeJavaScript(
          `(() => { const b = document.getElementById('btnQuality'); if (!b) return 'no-button'; b.click(); return 'clicked' })()`,
          true
        )
        .catch((e) => 'err ' + e)
      console.log('[q] 点击画质 ->', clicked)

      for (let i = 1; i <= 16; i += 1) {
        await sleep(3000)
        const p = await probe()
        console.log(`[q] +${i * 3}s`, JSON.stringify(p))
        if (p.rows > 0) break
      }

      // 点最后一行的「切换」，验证换源这条路径真的能走通
      const before = await probe()
      const switched = await wc
        .executeJavaScript(
          `(() => {
            const btns = [...document.querySelectorAll('#qualityModal [data-go]')]
            if (!btns.length) return 'no-button'
            const b = btns[btns.length - 1]
            const target = b.dataset.go
            b.click()
            return target
          })()`,
          true
        )
        .catch((e) => 'err ' + e)
      console.log('[q] 点切换 ->', switched, '| 之前:', before.source, before.hash)
      await sleep(14000)
      const after = await probe()
      console.log('[q] 切换后', JSON.stringify(after))
    } catch (e) {
      console.log('[q] 出错', String(e))
    } finally {
      app.exit(0)
    }
  })()
}
