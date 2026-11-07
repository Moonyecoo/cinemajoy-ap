'use strict'

/**
 * 两个 UI bug 的回归验证
 *   KKY_SMOKE=1 KKY_SMOKE_MOD=./test/uibug npm start
 *
 * 1. 分类页自动加载——滚到底部必须自己续页（不用点按钮），
 *    追加的卡片必须还在 .grid 里，否则海报失去网格约束会变形
 * 2. 播放页遮罩——已经在播了就必须收掉，不能因为 CSS 的 display:flex 压住 [hidden]
 */

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = function runUiBug() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  const wc = win.webContents
  const outDir = path.join(__dirname, '..', 'dist', 'smoke')
  fs.mkdirSync(outDir, { recursive: true })
  const shot = async (name) => {
    const image = await wc.capturePage()
    fs.writeFileSync(path.join(outDir, name + '.png'), image.toPNG())
  }

  const js = (code) => wc.executeJavaScript(code, true).catch((e) => ({ error: String(e) }))

  ;(async () => {
    try {
      // ---------------- bug 1：滚动自动加载 ----------------
      await sleep(9000)
      await js(`location.hash = '#/cat/movie'`)
      await sleep(9000)

      const snap = `(() => {
        const list = document.getElementById('catList')
        const grid = list && list.querySelector('.grid')
        const covers = [...(grid ? grid.querySelectorAll('.card-cover') : [])]
        const uniq = (a) => [...new Set(a)]
        const more = document.getElementById('catMore')
        return {
          cards: document.querySelectorAll('#catList .card').length,
          inGrid: document.querySelectorAll('#catList .grid .card').length,
          bare: document.querySelectorAll('#catList > .card').length,
          grids: document.querySelectorAll('#catList .grid').length,
          coverW: uniq(covers.map((c) => Math.round(c.getBoundingClientRect().width))),
          coverH: uniq(covers.map((c) => Math.round(c.getBoundingClientRect().height))),
          hasBtn: !!document.querySelector('#catMore button'),
          moreText: more ? more.textContent.trim() : '',
          docH: Math.round(document.documentElement.scrollHeight),
          viewH: window.innerHeight
        }
      })()`

      const first = await js(snap)
      console.log('[ui] 首屏', JSON.stringify(first))

      // 关键断言：页面上不该再有任何「加载更多」按钮
      const noButton = first.hasBtn === false

      // 反复滚到底部，看它自己是不是一直在续页
      const counts = [first.cards]
      for (let i = 0; i < 4; i++) {
        await js(`window.scrollTo(0, document.documentElement.scrollHeight)`)
        await sleep(5000)
        const s = await js(snap)
        counts.push(s.cards)
        console.log(`[ui] 第 ${i + 1} 次滚到底 -> 卡片 ${s.cards} 张 / ${s.moreText || '(空)'}`)
      }

      const second = await js(snap)
      console.log('[ui] 滚动加载后', JSON.stringify(second))

      const grew = second.cards > first.cards
      const ok1 =
        noButton &&
        grew &&
        second.bare === 0 &&
        second.grids === 1 &&
        second.inGrid === second.cards &&
        second.coverW.length === 1 // 所有海报宽度一致，说明网格约束还在
      console.log(`[ui] bug1 自动加载海报布局: ${ok1 ? 'PASS' : 'FAIL'}  (无按钮=${noButton} 增长=${first.cards}→${second.cards} 裸卡片=${second.bare} 网格数=${second.grids} 宽度种类=${second.coverW.length})`)
      await shot('08-loadmore')

      // ---------------- bug 2：播放遮罩 ----------------
      await js(`location.hash = '#/play/ry/31453/0/0'`)
      // 给足时间：详情 → kind 探测 → hls 起播
      await sleep(16000)

      const play = await js(`(() => {
        const v = document.getElementById('video')
        const msg = document.getElementById('stageMsg')
        const cs = msg ? getComputedStyle(msg) : null
        return {
          hash: location.hash,
          hasVideo: !!v,
          readyState: v ? v.readyState : -1,
          currentTime: v ? Number(v.currentTime.toFixed(2)) : -1,
          paused: v ? v.paused : null,
          duration: v ? Number((v.duration || 0).toFixed(1)) : -1,
          msgHidden: msg ? msg.hidden : null,
          msgDisplay: cs ? cs.display : '',
          msgText: msg ? msg.textContent.trim().slice(0, 40) : '',
          spinnerVisible: msg ? cs.display !== 'none' : null
        }
      })()`)
      console.log('[ui] 播放 16s 后', JSON.stringify(play))

      const ok2 = play.readyState >= 3 && play.msgDisplay === 'none' && play.spinnerVisible === false
      console.log(`[ui] bug2 播放遮罩: ${ok2 ? 'PASS' : 'FAIL'}`)

      // 再等 6 秒，确认不是「刚好这一帧」
      await sleep(6000)
      const play2 = await js(`(() => {
        const v = document.getElementById('video')
        const msg = document.getElementById('stageMsg')
        return {
          currentTime: v ? Number(v.currentTime.toFixed(2)) : -1,
          msgDisplay: msg ? getComputedStyle(msg).display : '',
          paused: v ? v.paused : null
        }
      })()`)
      console.log('[ui] 再等 6s', JSON.stringify(play2))
      const ok2b = play2.msgDisplay === 'none' && play2.currentTime > play.currentTime
      console.log(`[ui] bug2 持续播放无遮罩: ${ok2b ? 'PASS' : 'FAIL'}`)

      console.log(`\n[ui] 结论：bug1=${ok1 ? 'PASS' : 'FAIL'}  bug2=${ok2 && ok2b ? 'PASS' : 'FAIL'}`)
    } catch (e) {
      console.log('[ui] 出错', String(e))
    } finally {
      app.exit(0)
    }
  })()
}
