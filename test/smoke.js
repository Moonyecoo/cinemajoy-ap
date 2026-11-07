'use strict'

/**
 * 冒烟测试：KKY_SMOKE=1 npm run smoke
 * 依次打开 首页 / 分类 / 详情 / 播放，各截一张图，并记录渲染状态。
 * 目的是证明「数据真的拿到了、界面真的画出来了、视频真的能播」，而不是只看代码。
 */

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = function runSmoke() {
  const outDir = path.join(__dirname, '..', 'dist', 'smoke')
  fs.mkdirSync(outDir, { recursive: true })

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  const wc = win.webContents

  const report = {}

  const shot = async (name) => {
    const image = await wc.capturePage()
    fs.writeFileSync(path.join(outDir, name + '.png'), image.toPNG())
  }

  const probe = () =>
    wc.executeJavaScript(
      `(() => ({
        hash: location.hash,
        title: document.getElementById('windowTitle')?.textContent || '',
        cards: document.querySelectorAll('.card').length,
        hero: !!document.querySelector('.hero-slide'),
        navs: document.querySelectorAll('.nav-item').length,
        source: document.getElementById('sourceName')?.textContent || '',
        empty: document.querySelector('.empty')?.textContent?.trim().slice(0, 60) || '',
        video: (() => { const v = document.querySelector('video'); return v ? { src: (v.currentSrc || '').slice(0, 60), readyState: v.readyState, duration: Number((v.duration || 0).toFixed(1)) } : null })()
      }))()`,
      true
    )
    .catch((e) => ({ error: String(e) }))

  const go = async (hash, wait) => {
    await wc.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`, true).catch(() => {})
    await sleep(wait)
  }

  ;(async () => {
    try {
      await sleep(9000) // 等首页数据回来
      report.home = await probe()
      await shot('01-home')
      console.log('[smoke] home', JSON.stringify(report.home))

      await go('#/cat/movie', 6000)
      report.category = await probe()
      await shot('02-category')
      console.log('[smoke] category', JSON.stringify(report.category))

      // 点第一张卡片进详情
      const clicked = await wc
        .executeJavaScript(
          `(() => { const c = document.querySelector('.card'); if (!c) return null; c.click(); return { site: c.dataset.site, id: c.dataset.id } })()`,
          true
        )
        .catch(() => null)
      await sleep(6000)
      report.detail = { clicked, ...(await probe()) }
      await shot('03-detail')
      console.log('[smoke] detail', JSON.stringify(report.detail))

      // 点「立即播放」
      const started = await wc
        .executeJavaScript(
          `(() => { const b = document.querySelector('[data-act="start"]'); if (!b) return false; b.click(); return true })()`,
          true
        )
        .catch(() => false)
      await sleep(14000)
      report.play = { started, ...(await probe()) }
      await shot('04-play')
      console.log('[smoke] play', JSON.stringify(report.play))

      // 可选：指定一个确认可播的目标再验一次，用来区分「片源链接已失效」和「播放器坏了」
      // 用法：KKY_SMOKE_PLAY=bf/155683/0/0 npm run smoke
      const forced = process.env.KKY_SMOKE_PLAY
      if (forced) {
        await go('#/play/' + forced, 16000)
        report.playForced = { target: forced, ...(await probe()) }
        await shot('06-play-forced')
        console.log('[smoke] playForced', JSON.stringify(report.playForced))
      }

      // 画质对比：点「画质」按钮，等各源量完码率
      const qualityOpened = await wc
        .executeJavaScript(
          `(() => { const b = document.getElementById('btnQuality'); if (!b) return false; b.click(); return true })()`,
          true
        )
        .catch(() => false)
      if (qualityOpened) {
        await sleep(42000)
        report.quality = await wc
          .executeJavaScript(
            `(() => {
              const rows = [...document.querySelectorAll('#qualityModal .qrow')]
              return {
                opened: !!document.getElementById('qualityModal'),
                rows: rows.length,
                detail: rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60)),
                error: document.querySelector('#qualityModal .qmodal-empty')?.textContent || ''
              }
            })()`,
            true
          )
          .catch((e) => ({ error: String(e) }))
        await shot('07-quality')
        console.log('[smoke] quality', JSON.stringify(report.quality))
        await wc.executeJavaScript(`document.getElementById('qualityModal')?.remove()`, true).catch(() => {})
      }

      await go('#/settings', 3000)
      report.settings = await probe()
      await shot('05-settings')
      console.log('[smoke] settings', JSON.stringify(report.settings))

      fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
      console.log('[smoke] 完成 →', outDir)
    } catch (error) {
      console.log('[smoke] 出错', String(error))
    } finally {
      app.exit(0)
    }
  })()
}
