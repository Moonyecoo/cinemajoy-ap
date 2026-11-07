'use strict'

/**
 * 批量探测流媒体片源服务 v3
 * 修复：measureTs 支持 master playlist 递归
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const TIMEOUT_MS = 15000

function buildUrl(base, params) {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

function safeJsonParse(text) {
  text = text.replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('空响应')
  const m = text.match(/^\s*([\w$]+)\s*\((.*)\)\s*;?\s*$/s)
  if (m) text = m[2]
  const m2 = text.match(/^\s*var\s+\w+\s*=\s*(\{.*\})\s*;?\s*$/s)
  if (m2) text = m2[1]
  if (text[0] !== '{' && text[0] !== '[') {
    const start = text.search(/[[{]/)
    if (start > 0) text = text.slice(start)
  }
  return JSON.parse(text)
}

async function fetchJson(url) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' }, signal: ac.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    return safeJsonParse(text)
  } finally {
    clearTimeout(t)
  }
}

async function fetchText(url) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

function parsePlay(raw) {
  const froms = String(raw.vod_play_from || '').split('$$$')
  const blobs = String(raw.vod_play_url || '').split('$$$')
  const lines = []
  blobs.forEach((blob, index) => {
    if (!blob || !blob.trim()) return
    const episodes = blob.split('#').map((seg) => {
      const cut = seg.indexOf('$')
      return { name: cut >= 0 ? seg.slice(0, cut).trim() : seg.trim(), url: cut >= 0 ? seg.slice(cut + 1).trim() : '' }
    }).filter((ep) => ep.url)
    if (episodes.length) {
      lines.push({ name: (froms[index] || `线路${index + 1}`).trim(), episodes })
    }
  })
  const kindOf = (url) => {
    if (/\.m3u8(\?|$)/i.test(url)) return 0
    if (/\.mp4(\?|$)/i.test(url)) return 1
    return 2
  }
  lines.sort((a, b) => {
    const ka = Math.min(...a.episodes.map((e) => kindOf(e.url)))
    const kb = Math.min(...b.episodes.map((e) => kindOf(e.url)))
    return ka - kb
  })
  return lines
}

async function ffprobeBitrate(m3u8Url) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=bit_rate -of csv=p=0 "${m3u8Url}"`,
      { timeout: 15000, env: { ...process.env, HTTP_USER_AGENT: UA } }
    )
    const n = Number(stdout.trim())
    if (Number.isFinite(n) && n > 0) return Math.round(n / 1000)
  } catch {
    /* ignore */
  }
  return 0
}

function resolveUrl(base, uri) {
  try { return new URL(uri, base).toString() } catch { return uri }
}

async function measureTs(m3u8Url, depth = 0) {
  const text = await fetchText(m3u8Url)

  // 如果是 master playlist，递归进内层
  if (text.includes('#EXT-X-STREAM-INF') && depth < 2) {
    const lines = text.split(/\r?\n/)
    let bestUri = ''
    let bestBw = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bw = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0)
        let uri = ''
        for (let j = i + 1; j < lines.length; j++) {
          const t = lines[j].trim()
          if (t && !t.startsWith('#')) { uri = t; break }
        }
        if (uri && bw > bestBw) { bestBw = bw; bestUri = uri }
      }
    }
    if (bestUri) {
      const inner = await measureTs(resolveUrl(m3u8Url, bestUri), depth + 1)
      return inner
    }
  }

  const lines = text.split(/\r?\n/)
  const durations = []
  const segments = []
  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('#EXTINF:')) {
      const v = Number(t.slice(8).split(',')[0])
      if (Number.isFinite(v)) durations.push(v)
    } else if (t && !t.startsWith('#')) {
      segments.push(resolveUrl(m3u8Url, t))
    }
  }

  if (!durations.length || !segments.length) throw new Error('清单里没有分片')

  let bytes = 0, duration = 0
  const pairs = durations.slice(0, 3).map((d, i) => [d, segments[i]])
  const sizes = await Promise.all(
    pairs.map(async ([d, seg]) => {
      try {
        const r = await fetch(seg, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
        if (!r.ok) return [d, 0]
        const buf = await r.arrayBuffer()
        return [d, buf.byteLength]
      } catch { return [d, 0] }
    })
  )
  for (const [d, size] of sizes) {
    if (size > 0) { bytes += size; duration += d }
  }
  if (!duration) throw new Error('分片取不到')
  return Math.round((bytes * 8) / duration / 1000)
}

async function probeOne(source) {
  const result = { ...source, apiOk: false, items: 0, hasM3u8: false, kbps: 0, error: '', rawType: '' }
  try {
    let listJson
    const attempts = [
      buildUrl(source.api, { ac: 'videolist', pg: 1 }),
      buildUrl(source.api, { ac: 'list', pg: 1 }),
    ]
    let lastErr = ''
    for (const url of attempts) {
      try { listJson = await fetchJson(url); break }
      catch (e) { lastErr = String(e.message || e).slice(0, 80) }
    }
    if (!listJson) { result.error = lastErr; return result }
    const list = listJson.list || listJson.data || []
    if (!Array.isArray(list) || !list.length) { result.error = '列表为空'; result.apiOk = true; return result }
    result.apiOk = true
    result.items = list.length

    const first = list[0]
    const id = String(first.vod_id ?? first.id ?? '')
    if (!id) { result.error = '无id'; return result }
    const detailJson = await fetchJson(buildUrl(source.api, { ac: 'detail', ids: id }))
    const raw = (detailJson.list || [])[0]
    if (!raw) { result.error = '详情为空'; return result }
    const lines = parsePlay(raw)
    const m3u8Line = lines.find((l) => l.episodes.some((e) => /\.m3u8(\?|$)/i.test(e.url)))
    if (!m3u8Line) { result.error = '无m3u8线路'; result.rawType = String(raw.vod_play_from || '').slice(0, 40); return result }
    result.hasM3u8 = true
    const ep = m3u8Line.episodes.find((e) => /\.m3u8(\?|$)/i.test(e.url))

    result.kbps = await ffprobeBitrate(ep.url)
    if (!result.kbps) {
      try { result.kbps = await measureTs(ep.url) }
      catch (e) { result.error = `码率失败: ${e.message}` }
    }
  } catch (err) {
    result.error = String(err.message || err).slice(0, 120)
  }
  return result
}

// ------------------------------------------------------------------ 候选源

const candidates = [
  { key: 'yk',  name: '优质资源库',     api: 'http://api.1080zyku.com/inc/api.php/provide/vod' },
  { key: '39',  name: '39影视',         api: 'http://39kan.com/api.php/provide/vod' },
  { key: 'tt',  name: '天堂资源',       api: 'http://vipmv.cc/api.php/provide/vod' },
  { key: 'lh',  name: '乐活影视',       api: 'http://lehootv.com/api.php/provide/vod' },
  { key: 'trj', name: '唐人街',         api: 'http://tangrenjie.tv/api.php/provide/vod' },
  { key: 'kd',  name: '酷点资源',       api: 'http://api.kuapi.cc/api.php/provide/vod' },
  { key: 'wl',  name: '卧龙资源',       api: 'http://collect.wolongzyw.com/api.php/provide/vod' },
  { key: 'sl',  name: '森林资源',       api: 'http://slapibf.com/api.php/provide/vod' },
  { key: 'yk2', name: '影库资源网',     api: 'http://api.ykapi.net/api.php/provide/vod' },
  { key: 'kc',  name: '快车资源',       api: 'http://caiji.kczyapi.com/api.php/provide/vod/from/kcm3u8' },
  { key: 'tt2', name: '探探资源',       api: 'http://apittzy.com/api.php/provide/vod' },
  { key: 'sd',  name: '闪电资源',       api: 'http://sdzyapi.com/api.php/provide/vod/from/sdm3u8' },
  { key: 'gs',  name: '光速资源',       api: 'http://api.guangsuapi.com/api.php/provide/vod/from/gsm3u8' },
  { key: 'ask', name: '奥斯卡资源网',   api: 'http://aosikazy.com/api.php/provide/vod' },
  { key: 'ly',  name: '老鸭资源采集',   api: 'http://api.apilyzy.com/api.php/provide/vod' },
  { key: 'uk',  name: 'U酷资源',        api: 'http://api.ukuapi.com/api.php/provide/vod' },
  { key: 'bdx', name: '北斗星资源',     api: 'http://m3u8.bdxzyapi.com/api.php/provide/vod' },
  { key: 'yh',  name: '樱花资源网',     api: 'http://m3u8.apiyhzy.com/api.php/provide/vod' },
  { key: 'fs',  name: '飞速资源',       api: 'http://feisuzy.com/api.php/provide/vod' },
  { key: 'kb',  name: '快播资源',       api: 'http://www.kuaibozy.com/api.php/provide/vod' },
  { key: 'bd',  name: '百度资源',       api: 'http://api.apibdzy.com/api.php/provide/vod' },
  { key: 'ad',  name: '艾旦影视',       api: 'http://lovedan.net/api.php/provide/vod' },
  { key: 'ph',  name: '飘花电影',       api: 'http://www.zzrhgg.com/api.php/provide/vod' },
  { key: 'wm',  name: '网民电影',       api: 'http://prinevillesda.org/api.php/provide/vod' },
  { key: 'tk',  name: '天空资源',       api: 'http://m3u8.tiankongapi.com/api.php/provide/vod/from/tkm3u8' },
  { key: 'hw',  name: '海外看资源',     api: 'http://haiwaikan.com/api.php/provide/vod' },
  { key: '360', name: '360资源',        api: 'https://360zy.com/api.php/provide/vod/' },
  { key: 'hem', name: '黑木耳',         api: 'https://www.heimuer.tv/api.php/provide/vod' },
  { key: 'ct',  name: '刺桐资源',       api: 'http://ys9.cttv.vip/api.php/provide/vod/' },
  { key: 'gw',  name: '官网资源',       api: 'http://gwcms.cttv.vip/api.php/provide/vod/' },
  { key: 'yy',  name: '业余资源',       api: 'https://yyff.540734621.xyz/api.php/provide/vod/' },
  { key: 'hwb', name: '华为吧',         api: 'https://hw8.live/api.php/provide/vod/' },
  { key: 'xhr', name: '小黄人',         api: 'https://iqyi.xiaohuangrentv.com/api.php/provide/vod/' },
  { key: 'nn',  name: '牛牛资源',       api: 'https://api.niuniuzy.me/api.php/provide/vod/' },
  { key: 'ya',  name: '丫丫资源',       api: 'https://cj.yayazy.net/api.php/provide/vod/' },
  { key: '49',  name: '四九资源',       api: 'https://49zyw.com/api.php/provide/vod/' },
  { key: 'ik',  name: 'ikun资源',       api: 'https://ikunzyapi.com/api.php/provide/vod/' },
  { key: 'kk',  name: '快看资源',       api: 'https://www.kuaikan-api.com/api.php/provide/vod/' },
  { key: 'xz',  name: '熊掌资源',       api: 'https://xzcjz.com/api.php/provide/vod/' },
  { key: 'ty',  name: '天翼资源',       api: 'https://www.911ysw.top/tianyi.php/provide/vod/' },
  { key: 'pl',  name: '飘零资源',       api: 'https://p2100.net/api.php/provide/vod/' },
  { key: 'wj',  name: '无尽资源',       api: 'https://api.wujinapi.com/api.php/provide/vod/' },
  { key: 'sb',  name: '速博资源',       api: 'https://subocaiji.com/api.php/provide/vod/' },
  { key: 'md',  name: '魔都资源',       api: 'https://caiji.moduapi.cc/api.php/provide/vod/' },
  { key: 'zd',  name: '最大资源',       api: 'http://zuidazy.me/api.php/provide/vod/' },
  { key: 'qh',  name: '奇虎资源',       api: 'https://caiji.qhzyapi.com/api.php/provide/vod/' },
  { key: 'xl',  name: '新浪资源',       api: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod/' },
  { key: 'ky',  name: '快云资源',       api: 'https://www.kuaiyunzy.com/api.php/provide/vod/' },
]

async function main() {
  console.log(`开始探测 ${candidates.length} 个候选源...`)
  const concurrency = 8
  const results = []
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map((s) => probeOne(s)))
    results.push(...batchResults)
    for (const r of batchResults) {
      const status = r.error ? `❌ ${r.error}` : (r.kbps ? `✅ ${r.kbps} kbps` : (r.hasM3u8 ? '⚠️ 无码率' : '⚠️ 无m3u8'))
      console.log(`[${String(i + batch.indexOf(r) + 1).padStart(2, '0')}/${candidates.length}] ${r.name.padEnd(10)} ${status}`)
    }
  }

  const ok = results.filter((r) => r.apiOk && r.hasM3u8 && r.kbps > 0)
  ok.sort((a, b) => b.kbps - a.kbps)
  console.log('\n========== 可用且可播的源（按码率排序）==========')
  for (const r of ok) {
    console.log(`${r.name.padEnd(10)} ${String(r.kbps).padStart(5)} kbps  items=${r.items}  ${r.api}`)
  }

  const apiOkNoM3u8 = results.filter((r) => r.apiOk && !r.hasM3u8)
  console.log('\n========== API正常但无m3u8 ==========')
  for (const r of apiOkNoM3u8) console.log(`${r.name} — ${r.error}  type=${r.rawType}`)

  const dead = results.filter((r) => !r.apiOk)
  console.log('\n========== API无响应 ==========')
  for (const r of dead) console.log(`${r.name} — ${r.error}`)

  const fs = require('fs')
  fs.writeFileSync('probe-results.json', JSON.stringify({ ok, apiOk: apiOkNoM3u8.map((r) => ({ name: r.name, error: r.error })), dead: dead.map((r) => ({ name: r.name, error: r.error })) }, null, 2))
  console.log('\n结果已写入 probe-results.json')
}

main().catch(console.error)
