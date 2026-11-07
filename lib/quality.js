'use strict'

/**
 * 画质测量
 *
 * 免费片源普遍把 1080p 压到 300–800 kbps，光看分辨率会被骗——1920×1080 也可能糊成一团。
 * 所以这里按「码率」判断画质：拉清单里最前面几个分片，用 字节数 / 时长 算出 kbps。
 *
 * 注意：分片可能是 AES-128 加密的，但加密只改变内容不改变体积，
 * 量大小照样能估码率，不需要解密。
 */

const { net } = require('electron')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const SEGMENT_SAMPLES = 3
const TIMEOUT = 9000

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : net.fetch
    const res = await fetchFn(url, { headers: { 'User-Agent': UA }, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchSize(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : net.fetch
    const res = await fetchFn(url, { headers: { 'User-Agent': UA }, signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    return buf.byteLength
  } finally {
    clearTimeout(timer)
  }
}

/** 相对地址补全 */
function resolveUrl(base, uri) {
  try {
    return new URL(uri, base).toString()
  } catch {
    return uri
  }
}

/** 主清单里挑带宽最高的一档 */
function pickBestVariant(text, baseUrl) {
  const lines = text.split(/\r?\n/)
  let best = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue
    const bw = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0)
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/)
    let uri = ''
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j].trim() && !lines[j].startsWith('#')) {
        uri = lines[j].trim()
        break
      }
    }
    if (!uri) continue
    if (!best || bw > best.bandwidth) {
      best = {
        bandwidth: bw,
        height: res ? Number(res[2]) : 0,
        url: resolveUrl(baseUrl, uri),
      }
    }
  }
  return best
}

/**
 * 量一条 m3u8 的码率。
 * @returns {Promise<{kbps:number, height:number, segments:number}>}
 */
async function measure(url, depth = 0) {
  const text = await fetchText(url)

  if (text.includes('#EXT-X-STREAM-INF') && depth < 2) {
    const best = pickBestVariant(text, url)
    if (best) {
      const inner = await measure(best.url, depth + 1)
      return { ...inner, height: best.height || inner.height, kbps: inner.kbps || best.bandwidth / 1000 }
    }
  }

  const lines = text.split(/\r?\n/)
  const durations = []
  const segments = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#EXTINF:')) {
      const value = Number(trimmed.slice(8).split(',')[0])
      if (Number.isFinite(value)) durations.push(value)
    } else if (trimmed && !trimmed.startsWith('#')) {
      segments.push(resolveUrl(url, trimmed))
    }
  }

  if (!durations.length || !segments.length) throw new Error('清单里没有分片')

  let bytes = 0
  let duration = 0
  const pairs = durations.slice(0, SEGMENT_SAMPLES).map((d, i) => [d, segments[i]])
  // 并行拉，失败的不计入
  const sizes = await Promise.all(
    pairs.map(async ([d, seg]) => {
      try {
        return [d, await fetchSize(seg)]
      } catch {
        return [d, 0]
      }
    })
  )
  for (const [d, size] of sizes) {
    if (size > 0) {
      bytes += size
      duration += d
    }
  }
  if (!duration) throw new Error('分片取不到')

  return { kbps: Math.round((bytes * 8) / duration / 1000), height: 0, segments: segments.length }
}

/** 按码率给个中文说法，别让用户看数字猜 */
function label(kbps) {
  if (!kbps) return '未知'
  if (kbps >= 4500) return '原画蓝光'
  if (kbps >= 2800) return '真高清1080P'
  if (kbps >= 1500) return '普通高清'
  if (kbps >= 900) return '一般'
  return '压缩低码'
}

/** 真高清仲裁与智能分级 */
function classifyQuality(kbps) {
  const rate = Number(kbps) || 0
  if (rate >= 4500) {
    return { tier: '原画蓝光', isTrueHD: true, tag: '4K/蓝光', score: 100 }
  }
  if (rate >= 2800) {
    return { tier: '真高清1080P', isTrueHD: true, tag: '1080P', score: 85 }
  }
  if (rate >= 1500) {
    return { tier: '普通高清', isTrueHD: false, tag: '720P', score: 60 }
  }
  return { tier: '压缩低码', isTrueHD: false, tag: '压缩版', score: 30 }
}

/** 片名相似度：同名最高，严格过滤解说/衍生科教/同名微短剧 */
function nameScore(a, b) {
  const rawA = String(a || '').trim()
  const rawB = String(b || '').trim()
  if (!rawA || !rawB) return 0
  if (!/解说|科学|花絮|预告/.test(rawB) && /解说|中的科学|花絮|预告/.test(rawA)) return 0
  if (!/短剧|修真|假千金|综艺/.test(rawB) && /修真|假千金|霸总|第\d+-\d+集|[（(\[【]综艺[）)\]】]/.test(rawA)) return 0

  const x = rawA.replace(/\s+/g, '').toLowerCase()
  const y = rawB.replace(/\s+/g, '').toLowerCase()
  if (x === y) return 100

  const strippedX = x.replace(/[（(\[【](原声|国语|粤语|英语|中字|双语|未删减|完整|修复|重映|4k|1080p|hd|bd)[^）)\]】]*[）)\]】]/gi, '')
  if (strippedX === y) return 95
  if (strippedX.startsWith(y) && strippedX.length <= y.length + 3) return 75
  if (x.startsWith(y) || y.startsWith(x)) return 60
  if (x.includes(y) || y.includes(x)) return 30
  return 0
}

/**
 * 片名变体
 *
 * 资源站的片名写法五花八门：有的带年份（小小的我2024），有的带季数（庆余年第二季），
 * 有的带副标题。只按全名搜，往往一个源都匹配不上，画质面板就只剩当前这一行。
 * 这里把常见的后缀拆掉，多搜几次。
 */
function titleVariants(title) {
  const raw = String(title || '').trim()
  if (!raw) return []
  const out = [raw]
  const push = (v) => {
    const t = String(v || '').trim()
    if (t && t.length >= 2 && !out.includes(t)) out.push(t)
  }
  // 结尾年份：小小的我2024 / 小小的我(2024)
  push(raw.replace(/[（(]?\s*(19|20)\d{2}\s*[)）]?$/, ''))
  // 括号里的副标题：封神第二部：战火西岐(2025)
  push(raw.replace(/[（(][^)）]*[)）]/g, ''))
  // 第 X 季
  push(raw.replace(/第[一二三四五六七八九十\d]+季/g, ''))
  return out.slice(0, 3)
}

/** 拿所有变体里最像的那个分数 */
function bestNameScore(name, variants) {
  let best = 0
  for (const v of variants) best = Math.max(best, nameScore(name, v))
  return best
}

/**
 * 在一部片的所有片源/线路里找画质最好的。
 * 只量每个源的第一条 m3u8 线路——量全部会太慢，而同一部片的第一集足以代表编码质量。
 */
async function findBestForTitle({ title, sites, currentSite, onProgress }) {
  const { fetchList, fetchDetail } = require('./api')
  const targets = sites.filter((s) => s.enabled !== false)
  const variants = titleVariants(title)
  const results = []
  let done = 0

  const runOne = async (site) => {
    try {
      // 先用全名搜；搜到的太少再退到变体，避免每个源都发三次请求
      let items = []
      for (let i = 0; i < variants.length; i += 1) {
        try {
          const list = await fetchList(site, { keyword: variants[i], page: 1, skipEnrich: true })
          items = items.concat((list.items || []).filter((x) => x.name))
        } catch {
          /* 这个变体搜不到就换下一个 */
        }
        if (items.length >= 6) break
      }
      if (!items.length) return

      let best = items[0]
      let bestScore = bestNameScore(best.name, variants)
      for (const item of items.slice(0, 10)) {
        const score = bestNameScore(item.name, variants)
        if (score > bestScore) {
          best = item
          bestScore = score
        }
      }
      if (bestScore < 60) return // 名字差太多，不当成同一部

      const detailLines = Array.isArray(best._lines) && best._lines.length ? best._lines : (await fetchDetail(site, best.id)).lines
      const lineIdx = (detailLines || []).findIndex((l) => l.episodes.some((e) => /\.m3u8(\?|$)/i.test(e.url)))
      if (lineIdx < 0) return
      const line = detailLines[lineIdx]
      const epIdx = line.episodes.findIndex((e) => /\.m3u8(\?|$)/i.test(e.url))
      if (epIdx < 0) return

      const { kbps } = await measure(line.episodes[epIdx].url)
      results.push({
        site: site.key,
        siteName: site.name,
        id: best.id,
        name: best.name,
        lineIdx,
        epIdx,
        lineName: line.name,
        kbps,
        isCurrent: site.key === currentSite,
      })
    } catch {
      /* 这个源不行就跳过 */
    } finally {
      done += 1
      if (onProgress) onProgress(done, targets.length)
    }
  }

  await Promise.all(targets.map(runOne))
  return results.sort((a, b) => b.kbps - a.kbps)
}

/**
 * 解析 m3u8 文本中的流特征 (RESOLUTION, BANDWIDTH)
 */
function parseMasterPlaylist(text, baseUrl = '') {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\r?\n/)
  const variants = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXT-X-STREAM-INF')) continue
    const bw = Number((line.match(/BANDWIDTH=(\d+)/i) || [])[1] || 0)
    const res = line.match(/RESOLUTION=(\d+)x(\d+)/i)
    const width = res ? Number(res[1]) : 0
    const height = res ? Number(res[2]) : 0

    let uri = ''
    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j].trim()
      if (nextLine && !nextLine.startsWith('#')) {
        uri = nextLine
        break
      }
    }
    if (uri) {
      variants.push({
        bandwidth: bw,
        kbps: Math.round(bw / 1000),
        width,
        height,
        url: resolveUrl(baseUrl, uri),
      })
    }
  }
  return variants.sort((a, b) => b.bandwidth - a.bandwidth)
}

/**
 * 依据底层流特征给出权威画质判定（拒绝任何源站文字标签）
 */
function judgeStreamQuality({ width = 0, height = 0, kbps = 0 }) {
  const w = Number(width || 0)
  const h = Number(height || 0)
  const b = Number(kbps || 0)

  // 1. 4K
  if (w >= 3840 || h >= 2160) {
    if (b >= 8000) {
      return { tier: '4K', label: '真 4K 原画', height: h || 2160, width: w || 3840, kbps: b, isTrueHD: true, legit: true, tag: '4K', verified: true }
    }
    return { tier: '4K-low', label: '4K 压制版', height: h || 2160, width: w || 3840, kbps: b, isTrueHD: false, legit: false, tag: '4K压制', verified: true }
  }

  // 2. 1080P: 真实高 >= 1080 且码率 >= 2500kbps 为真原画，1200-2500 为普通，< 1200 为低码伪高清
  if (w >= 1920 || h >= 1080) {
    if (b >= 2500) {
      return { tier: '1080P-high', label: '1080P 原画蓝光', height: h || 1080, width: w || 1920, kbps: b, isTrueHD: true, legit: true, tag: '1080P', verified: true }
    }
    if (b >= 1200) {
      return { tier: '1080P', label: '1080P 高清', height: h || 1080, width: w || 1920, kbps: b, isTrueHD: true, legit: true, tag: '1080P', verified: true }
    }
    return { tier: '1080P-low', label: '1080P 压缩低码', height: h || 1080, width: w || 1920, kbps: b, isTrueHD: false, legit: false, tag: '压缩版', verified: true }
  }

  // 3. 720P: 真实高 >= 720
  if (w >= 1280 || h >= 720) {
    if (b >= 1000) {
      return { tier: '720P', label: '720P 高清', height: h || 720, width: w || 1280, kbps: b, isTrueHD: false, legit: true, tag: '720P', verified: true }
    }
    return { tier: '720P-low', label: '720P 标清', height: h || 720, width: w || 1280, kbps: b, isTrueHD: false, legit: false, tag: '标清', verified: true }
  }

  // 4. 480P / SD
  return { tier: 'SD', label: '标清 480P', height: h || 480, width: w || 854, kbps: b, isTrueHD: false, legit: true, tag: '480P', verified: true }
}

module.exports = {
  measure,
  label,
  classifyQuality,
  judgeStreamQuality,
  parseMasterPlaylist,
  findBestForTitle,
  titleVariants,
  resolveUrl,
}
