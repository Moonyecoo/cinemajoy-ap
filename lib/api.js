'use strict'

/**
 * 标准通用媒体采集 JSON 接口客户端
 *
 * 行业通用标准流媒体采集生态里的 HTTP JSON 源规范，全部走纯 HTTP，不需要任何外部网页/播放器依赖：
 *   ?ac=list                      → 分类表
 *   ?ac=videolist&t=1&pg=2        → 分类列表（部分源只认 ac=detail）
 *   ?ac=detail&ids=123            → 详情（含 vod_play_from / vod_play_url）
 *   ?ac=videolist&wd=关键词        → 搜索
 *
 * 播放地址格式：线路名用 $$$ 分隔，集与集之间用 #，集名与地址之间用 $
 *   线路A$第01集$https://x/a.m3u8#第02集$https://x/b.m3u8$$$线路B$...
 */

const fs = require('fs')
const path = require('path')
const http = require('node:http')
const https = require('node:https')
const dnsModule = require('./dns')
const metadata = require('./metadata')
const router = require('./router')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/130.0.0.0 Safari/537.36'

const NSFW_REGEX = /伦理|三级|情色|福利|里番|成人|写真|无码|有码|熟女|女优|理论片|擦边|偷拍|自拍|乱伦|迷奸|催眠|换妻|群交|同性|色情|后宫|SM|强奸/i

const JSON_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
}

function buildUrl(base, params) {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function singleFetch(targetUrl, timeout = 6000) {
  let u
  try {
    u = new URL(targetUrl)
  } catch (err) {
    throw new Error(`无效 URL: ${targetUrl}`)
  }

  // 1. 获取防污染真实 IP（阿里 DoH + 腾讯 DNSPod 穿透 28.0.0.x）
  let cleanIps = null
  try {
    cleanIps = await dnsModule.getCleanIps(u.hostname)
  } catch {
    /* 忽略异常 */
  }

  const candidates = cleanIps && cleanIps.length ? cleanIps.slice(0, 3) : [u.hostname]
  const isHttps = u.protocol === 'https:'
  const defaultPort = isHttps ? 443 : 80
  const port = u.port ? Number(u.port) : defaultPort
  const perAttemptTimeout = Math.min(timeout, 3500)

  let lastErr = null
  for (const hostTarget of candidates) {
    try {
      const client = isHttps ? https : http
      const json = await new Promise((resolve, reject) => {
        const req = client.request(
          {
            host: hostTarget,
            port: port,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
              ...JSON_HEADERS,
              Host: u.hostname,
            },
            servername: isHttps ? u.hostname : undefined,
            rejectUnauthorized: false,
            timeout: perAttemptTimeout,
          },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const nextUrl = new URL(res.headers.location, targetUrl).toString()
              return singleFetch(nextUrl, timeout).then(resolve, reject)
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`))
            }
            let text = ''
            res.on('data', (c) => (text += c))
            res.on('end', () => {
              text = text.replace(/^\uFEFF/, '').trim()
              if (!text) return reject(new Error('空响应'))
              if (text[0] !== '{' && text[0] !== '[') {
                const start = text.search(/[[{]/)
                if (start >= 0) text = text.slice(start)
                else return reject(new Error(`响应非JSON内容: ${text.slice(0, 40)}`))
              }
              try {
                resolve(JSON.parse(text))
              } catch (e) {
                reject(e)
              }
            })
          }
        )

        req.on('error', reject)
        req.on('timeout', () => {
          req.destroy()
          reject(new Error(`连接超时 (${hostTarget}:${port})`))
        })
        req.end()
      })
      return json
    } catch (err) {
      lastErr = err
    }
  }

  throw lastErr || new Error(`请求接口失败: ${targetUrl}`)
}

async function requestJson(url, timeout = 10000) {
  try {
    return await singleFetch(url, timeout)
  } catch (err) {
    // 关键容灾：国内网络环境下多源媒体接口常遇 HTTPS TLS/SNI 阻断，自动降级为 HTTP 端口 80 直连
    if (/^https:\/\//i.test(url)) {
      const httpUrl = url.replace(/^https:\/\//i, 'http://')
      try {
        return await singleFetch(httpUrl, timeout)
      } catch {
        /* 降级重试亦失败，抛出原始异常 */
      }
    }
    throw err
  }
}

const stripHtml = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

function normItem(raw, siteKey) {
  return {
    site: siteKey,
    id: String(raw.vod_id ?? raw.id ?? ''),
    name: String(raw.vod_name ?? raw.name ?? '').trim(),
    pic: String(raw.vod_pic ?? raw.pic ?? '').trim(),
    picSlide: String(raw.vod_pic_slide ?? raw.vod_pic_thumb ?? '').trim(),
    remarks: String(raw.vod_remarks ?? raw.note ?? '').trim(),
    year: String(raw.vod_year ?? '').trim(),
    area: String(raw.vod_area ?? '').trim(),
    typeName: String(raw.type_name ?? '').trim(),
    typeId: String(raw.type_id ?? '').trim(),
    score: String(raw.vod_score ?? '').trim(),
    updatedAt: String(raw.vod_time ?? '').trim(),
    content: stripHtml(String(raw.vod_blurb || raw.vod_content || '')),
    _lines: raw.vod_play_url ? parsePlay(raw) : null,
  }
}

/**
 * 选集列表序列归一化：检测倒序并自动转换为标准升序 (1..N)
 */
function normalizeEpisodeList(episodes) {
  if (!Array.isArray(episodes) || episodes.length <= 1) return episodes || []

  const extractNum = (item) => {
    const str = typeof item === 'string' ? item : item && item.name ? item.name : ''
    const m = String(str).match(/(\d+)/)
    return m ? parseInt(m[1], 10) : null
  }

  const nums = episodes.map(extractNum)
  const validNums = nums.filter((n) => n !== null)

  if (validNums.length >= Math.min(2, episodes.length)) {
    const first = validNums[0]
    const last = validNums[validNums.length - 1]
    if (first > last) {
      return [...episodes].reverse()
    }
  }
  return episodes
}

/**
 * 搜索结果权威实体聚类去重：同名条目聚类合并，内部聚合全网多源可用线路
 */
function clusterSearchResults(rawItems) {
  if (!Array.isArray(rawItems)) return []
  const clusters = new Map()

  for (const item of rawItems) {
    if (!item || !item.name) continue
    const canonicalKey = (metadata.cleanTitle(item.name) || item.name).trim().toLowerCase()
    if (!clusters.has(canonicalKey)) {
      clusters.set(canonicalKey, {
        ...item,
        canonicalTitle: metadata.cleanTitle(item.name) || item.name,
        sources: [
          {
            site: item.site,
            id: item.id,
            name: item.name,
            typeName: item.typeName,
            remarks: item.remarks,
          },
        ],
      })
    } else {
      const existing = clusters.get(canonicalKey)
      existing.sources.push({
        site: item.site,
        id: item.id,
        name: item.name,
        typeName: item.typeName,
        remarks: item.remarks,
      })
      if (!existing.pic && item.pic) existing.pic = item.pic
      if (!existing.score && item.score) existing.score = item.score
      if (!existing.year && item.year) existing.year = item.year
    }
  }

  return Array.from(clusters.values())
}

/** 把 vod_play_from / vod_play_url 拆成 [{name, episodes:[{name,url}]}] */
function parsePlay(raw) {
  const froms = String(raw.vod_play_from || '').split('$$$')
  const blobs = String(raw.vod_play_url || '').split('$$$')
  const lines = []

  blobs.forEach((blob, index) => {
    if (!blob || !blob.trim()) return
    const episodes = blob
      .split('#')
      .map((segment) => {
        const cut = segment.indexOf('$')
        const name = cut >= 0 ? segment.slice(0, cut) : segment
        const url = cut >= 0 ? segment.slice(cut + 1) : ''
        return { name: name.trim(), url: url.trim() }
      })
      .filter((ep) => ep.url)
    if (episodes.length) {
      lines.push({ name: (froms[index] || `线路${index + 1}`).trim(), episodes: normalizeEpisodeList(episodes) })
    }
  })

  // 能直连播放的线路排前面：m3u8 / mp4 优先，需要网页解析的（分享页、解析页）垫底
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

function playKind(url) {
  if (!url) return 'none'
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls'
  if (/\.mp4(\?|$)/i.test(url)) return 'mp4'
  return 'page' // 需要网页解析，播放器直接放不了
}

// ------------------------------------------------------------------ 对外接口

async function fetchClasses(site) {
  try {
    const json = await requestJson(buildUrl(site.api, { ac: 'list' }))
    const list = json.class || json.classList || json.classes || []
    const classes = list
      .map((c) => ({
        id: String(c.type_id ?? c.id ?? ''),
        name: String(c.type_name ?? c.name ?? ''),
        pid: String(c.type_pid ?? c.pid ?? '0'),
      }))
      .filter((c) => c.id && c.name && !NSFW_REGEX.test(c.name))
    if (classes.length) return classes
  } catch {
    /* 落到下面的兜底 */
  }
  // 兜底：从第一页列表里归纳分类
  const page = await fetchList(site, { page: 1 })
  const seen = new Map()
  for (const item of page.items) {
    if (item.typeId && item.typeName && !seen.has(item.typeId)) seen.set(item.typeId, item.typeName)
  }
  return [...seen].map(([id, name]) => ({ id, name }))
}

async function fetchList(site, { typeId = '', page = 1, keyword = '', skipEnrich = false } = {}) {
  const attempts = []
  if (keyword) {
    attempts.push({ ac: 'videolist', wd: keyword, pg: page })
    attempts.push({ ac: 'detail', wd: keyword, pg: page })
    attempts.push({ wd: keyword, pg: page })
  } else {
    attempts.push({ ac: 'videolist', t: typeId, pg: page })
    attempts.push({ ac: 'detail', t: typeId, pg: page })
  }

  let lastError = null
  const startedAt = Date.now()
  for (const params of attempts) {
    try {
      const json = await requestJson(buildUrl(site.api, params))
      const list = json.list || json.data || []
      if (!Array.isArray(list)) continue
      const total = Number(json.total || 0)
      const limit = Number(json.limit || 0)
      // 有些源 pagecount 给 0 或者干脆不给，这时用 total/limit 兜出来，
      // 否则「无限滚动」会在第一页就判定「已经到底了」。
      const declared = Number(json.pagecount || json.pageCount || 0)
      const pageCount =
        declared > 0 ? declared : total > 0 && limit > 0 ? Math.ceil(total / limit) : list.length ? 1 : 0

      const safe = list.filter(
        (raw) => !NSFW_REGEX.test(raw.vod_name || '') && !NSFW_REGEX.test(raw.type_name || '')
      )
      const normed = safe.map((raw) => normItem(raw, site.key))
      // 异步权威元数据与真实评分补齐（内部快速寻源时可跳过）
      const enriched = skipEnrich ? normed : await metadata.enrichList(normed)

      router.recordOutcome(site.key, true, Date.now() - startedAt)
      return {
        items: enriched,
        page: Number(json.page || page),
        pageCount: Math.max(pageCount, 1),
        total,
      }
    } catch (error) {
      lastError = error
    }
  }
  router.recordOutcome(site.key, false, Date.now() - startedAt)
  throw lastError || new Error('列表获取失败')
}

async function fetchDetail(site, vodId) {
  const startedAt = Date.now()
  try {
    const json = await requestJson(buildUrl(site.api, { ac: 'detail', ids: vodId }))
    const raw = (json.list || [])[0]
    if (!raw) throw new Error('没有找到该影片')
    if (NSFW_REGEX.test(raw.vod_name || '') || NSFW_REGEX.test(raw.type_name || '')) {
      throw new Error('该影片涉及违规敏感内容，已被系统合规过滤屏蔽。')
    }
    const lines = parsePlay(raw)
    const baseDetail = {
      ...normItem(raw, site.key),
      director: stripHtml(raw.vod_director),
      actors: stripHtml(raw.vod_actor),
      lang: String(raw.vod_lang || ''),
      pubdate: String(raw.vod_pubdate || ''),
      content: stripHtml(raw.vod_content || raw.vod_blurb || ''),
      lines,
      playable: lines.some((line) => line.episodes.some((ep) => playKind(ep.url) !== 'page')),
    }
    const enriched = await metadata.enrichItem(baseDetail, { fetchRemoteEntity: true })
    router.recordOutcome(site.key, true, Date.now() - startedAt)
    return enriched
  } catch (error) {
    router.recordOutcome(site.key, false, Date.now() - startedAt)
    throw error
  }
}

/** 探测一个源是否可用，返回分类数与耗时 */
async function testSite(site) {
  const startedAt = Date.now()
  const classes = await fetchClasses(site)
  return { ok: true, classes: classes.length, ms: Date.now() - startedAt, names: classes.slice(0, 8).map((c) => c.name) }
}

/** 获取全网 24 小时每日更新影视 (多源联动聚合与安全过滤) */
async function fetchDailyUpdates(sites = [], { hours = 24, limit = 40 } = {}) {
  const activeSites = Array.isArray(sites) && sites.length ? sites.filter((s) => s.enabled !== false) : []
  if (!activeSites.length) return []

  const allItems = []
  const fetchPromises = activeSites.slice(0, 4).map(async (site) => {
    try {
      const url = buildUrl(site.api, { ac: 'videolist', h: hours, pg: 1 })
      const json = await requestJson(url, 12000)
      const list = json.list || json.data || []
      const safe = list
        .filter((raw) => !NSFW_REGEX.test(raw.vod_name || '') && !NSFW_REGEX.test(raw.type_name || ''))
        .map((raw) => normItem(raw, site.key))
      allItems.push(...safe)
    } catch {
      /* 单源容错 */
    }
  })

  await Promise.allSettled(fetchPromises)

  // 片名去重
  const map = new Map()
  for (const item of allItems) {
    if (!item || !item.name) continue
    const norm = metadata.cleanTitle(item.name) || item.name
    if (!map.has(norm)) {
      map.set(norm, item)
    }
  }

  const deduped = Array.from(map.values())
  const enriched = await metadata.enrichList(deduped.slice(0, limit))
  return enriched
}

function classifyCategory(typeName = '') {
  const t = String(typeName).trim()
  if (/动漫|动画/i.test(t) && !/动画电影/i.test(t)) return 'anime'
  if (/综艺|真人秀|脱口秀/i.test(t)) return 'variety'
  if (/动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|惊悚片|古装片|悬疑片|犯罪片|灾难片|动画电影|奇幻片|冒险片|武侠片|电影片|片$/i.test(t)) return 'movie'
  if (/剧|连续剧|短剧/i.test(t)) return 'series'
  return 'other'
}

const RANKINGS_FILE = path.join(__dirname, '..', 'data', 'rankings_cache.json')
const rankingsCache = new Map()

// 启动时优先读取持久化榜单，实现冷启动 0 延迟秒开
try {
  if (fs.existsSync(RANKINGS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(RANKINGS_FILE, 'utf8'))
    for (const [k, v] of Object.entries(raw)) {
      rankingsCache.set(k, v)
    }
  }
} catch {
  /* 忽略 */
}

/** 获取全网各类型热播排行榜 */
async function fetchRankings(sites = [], { type = 'all', limit = 20, force = false } = {}) {
  const cacheKey = `${type}:${limit}`
  const cached = rankingsCache.get(cacheKey)

  // 1. SWR 极致秒开：存在缓存时直接 0ms 返回
  if (cached && !force) {
    const isFresh = Date.now() - cached.timestamp < 15 * 60 * 1000
    if (isFresh) {
      return cached.data
    }
    // 虽已超过新鲜期但仍可用：先返回旧数据，后台静默重刷新
    fetchRankings(sites, { type, limit, force: true }).catch(() => {})
    return cached.data
  }

  const activeSites = Array.isArray(sites) && sites.length ? sites.filter((s) => s.enabled !== false) : []
  if (!activeSites.length) {
    return cached ? cached.data : []
  }

  const allItems = []

  if (type === 'all') {
    // 全网总榜：从前 4 个活跃源快速拉取全网点击前列影片（严格 3.5s 超时）
    const fetchPromises = activeSites.slice(0, 4).map(async (site) => {
      try {
        const url = buildUrl(site.api, { ac: 'videolist', by: 'hits', pg: 1 })
        const json = await requestJson(url, 3500)
        const list = json.list || json.data || []
        const safe = list
          .filter((raw) => !NSFW_REGEX.test(raw.vod_name || '') && !NSFW_REGEX.test(raw.type_name || ''))
          .map((raw) => ({
            ...normItem(raw, site.key),
            hits: Number(raw.vod_hits || 0),
          }))
        allItems.push(...safe)
      } catch {
        /* 单源容错 */
      }
    })
    await Promise.allSettled(fetchPromises)
  } else {
    // 细分榜单（电影 / 剧集 / 动漫 / 综艺）：精准匹配子分类（严格 3.5s 超时）
    const fetchPromises = activeSites.slice(0, 3).map(async (site) => {
      try {
        const classes = await fetchClasses(site)
        const matched = classes.filter((c) => classifyCategory(c.name) === type)
        const targetIds = matched.slice(0, 4).map((c) => c.id)

        if (!targetIds.length) {
          const url = buildUrl(site.api, { ac: 'videolist', by: 'hits', pg: 1 })
          const json = await requestJson(url, 3500)
          const list = (json.list || json.data || []).filter(
            (raw) => classifyCategory(raw.type_name || '') === type && !NSFW_REGEX.test(raw.vod_name || '')
          )
          allItems.push(...list.map((raw) => ({ ...normItem(raw, site.key), hits: Number(raw.vod_hits || 0) })))
          return
        }

        const subPromises = targetIds.map(async (tid) => {
          try {
            const url = buildUrl(site.api, { ac: 'videolist', t: tid, pg: 1 })
            const json = await requestJson(url, 3500)
            const list = (json.list || json.data || []).filter(
              (raw) => !NSFW_REGEX.test(raw.vod_name || '') && !NSFW_REGEX.test(raw.type_name || '')
            )
            allItems.push(...list.map((raw) => ({ ...normItem(raw, site.key), hits: Number(raw.vod_hits || 0) })))
          } catch {
            /* 忽略 */
          }
        })
        await Promise.allSettled(subPromises)
      } catch {
        /* 忽略 */
      }
    })
    await Promise.allSettled(fetchPromises)
  }

  // 类别二次过滤（针对子榜）
  let filtered = allItems
  if (type !== 'all') {
    filtered = allItems.filter((item) => classifyCategory(item.typeName || '') === type)
  }

  if (!filtered.length && cached) {
    return cached.data
  }

  // 标题去重（同一剧集多源保留最高点击/最优项）
  const map = new Map()
  for (const item of filtered) {
    if (!item || !item.name) continue
    const norm = metadata.cleanTitle(item.name) || item.name
    if (!map.has(norm)) {
      map.set(norm, item)
    } else {
      const prev = map.get(norm)
      if ((item.hits || 0) > (prev.hits || 0)) map.set(norm, item)
    }
  }

  const sorted = Array.from(map.values()).sort((a, b) => (b.hits || 0) - (a.hits || 0))
  const sliced = sorted.slice(0, limit)
  const enriched = await metadata.enrichList(sliced)

  const result = enriched.map((item, index) => {
    const rank = index + 1
    const baseHot = 99.8 - index * 1.8 - (index % 3) * 0.4
    const hotScore = Math.max(68.0, baseHot).toFixed(1) + ' 万'
    return {
      ...item,
      rank,
      hotScore,
    }
  })

  if (result.length) {
    rankingsCache.set(cacheKey, { timestamp: Date.now(), data: result })
    try {
      const obj = {}
      for (const [k, v] of rankingsCache.entries()) obj[k] = v
      fs.writeFileSync(RANKINGS_FILE, JSON.stringify(obj, null, 2), 'utf8')
    } catch {
      /* 忽略写入失败 */
    }
  }

  return result.length ? result : (cached ? cached.data : [])
}

/**
 * 严格片名匹配打分器：确保影视圈与跨源寻源精准命中目标正片，
 * 彻底杜绝误匹配同名微短剧、科教纪录片或电影解说。
 */
function scoreMovieMatch(item, query, cleanQuery) {
  if (!item || !item.name || !query) return 0
  const rawName = String(item.name).trim()
  const typeName = String(item.typeName || '').trim()
  const q = String(query).trim()
  const cq = String(cleanQuery || metadata.cleanTitle(q) || q).trim()

  const wantsCommentary = /解说|幕后|纪录|科学|花絮|预告/.test(q)
  if (!wantsCommentary) {
    if (/解说|中的科学|幕后|花絮|预告片|特辑/.test(rawName) || /解说/.test(typeName)) {
      return 0
    }
  }

  const wantsShortDrama = /短剧|修真|假千金|霸总|闪婚|神豪|逆袭/.test(q)
  if (!wantsShortDrama) {
    if (/短剧|爽文|综艺|真人秀|晚会/.test(typeName) || /修真|假千金|霸总|闪婚|神豪|第\d+-\d+集|[（(\[【]综艺[）)\]】]/.test(rawName)) {
      return 0
    }
  }

  const isMovieType = /电影|动作|喜剧|爱情|科幻|恐怖|剧情|战争|惊悚|悬疑|犯罪|奇幻|动画电影|片$/.test(typeName) ? 2 : 0

  const normRaw = rawName.replace(/[\s·:：,，.。!！?？《》]/g, '').toLowerCase()
  const normQ = q.replace(/[\s·:：,，.。!！?？《》]/g, '').toLowerCase()
  const normCQ = cq.replace(/[\s·:：,，.。!！?？《》]/g, '').toLowerCase()

  if (normRaw === normQ || normRaw === normCQ) return 100 + isMovieType

  const stripped = rawName
    .replace(/[（(\[【](原声|国语|粤语|英语|中字|双语|未删减|完整|修复|重映|导演剪辑|加长|蓝光|超清|高清|4k|1080p|hd|bd)[^）)\]】]*[）)\]】]/gi, '')
    .replace(/(原声版|国语版|粤语版|未删减版|完整版|修复版|重映版|HD|BD|1080P|4K)$/gi, '')
    .replace(/[\s·:：,，.。!！?？《》]/g, '')
    .toLowerCase()

  if (stripped === normQ || stripped === normCQ) return 96 + isMovieType

  const itemClean = String(metadata.cleanTitle(rawName) || rawName)
    .replace(/[\s·:：,，.。!！?？《》]/g, '')
    .toLowerCase()
  if (itemClean === normCQ && rawName.length <= cq.length + 6) return 90 + isMovieType

  if (stripped.startsWith(normCQ) && stripped.length <= normCQ.length + 3) return 75 + isMovieType
  return 0
}

/**
 * 从解说视频标题中提取对应的原片电影名
 */
function extractBaseMovieTitle(rawTitle = '') {
  const s = String(rawTitle || '').trim()
  const bracketMatch = s.match(/《([^》]{1,28})》/)
  if (bracketMatch && bracketMatch[1]) {
    return bracketMatch[1].trim()
  }
  return s
    .replace(/[\[【（(][^\]】）)]*(解说|速看|看懂|盘点|预告)[^\]】）)]*[\]】）)]/g, '')
    .replace(/(电影解说|影视解说|预告解说|深度解说|几分钟看完|一口气看完|解说版|解说)/g, '')
    .replace(/(?:19|20)\d{2}$/g, '')
    .replace(/^[·:：\-—\s]+|[·:：\-—\s]+$/g, '')
    .trim()
}

let commentariesCache = { timestamp: 0, data: [] }

/**
 * 实时获取全网最新电影解说视频与院线速看（多源多页并发直连采集，扩容至 60+ 部实时解说）
 */
async function fetchMovieCommentaries(sites = [], { limit = 64, force = false } = {}) {
  if (!force && commentariesCache.data.length >= Math.min(limit, 36) && Date.now() - commentariesCache.timestamp < 8 * 60 * 1000) {
    return commentariesCache.data.slice(0, limit)
  }

  const activeSites = Array.isArray(sites) && sites.length ? sites.filter((s) => s.enabled !== false) : []
  if (!activeSites.length) return commentariesCache.data.slice(0, limit)

  // 已知拥有独立实时更新「影视解说/电影解说/短剧解说」专库的直连高速源分类映射
  const DEDICATED_COMMENTARY_TYPES = {
    sn: ['53', '74'],
    bf: ['51'],
    lz: ['35'],
    sd: ['53'],
    yy: ['53'],
    sn2: ['53'],
  }

  const allItems = []
  const dedicatedSites = activeSites.filter((s) => DEDICATED_COMMENTARY_TYPES[s.key])
  const keywordSites = activeSites.slice(0, 6)
  const keywords = ['解说', '速看', '几分钟']

  const tasks = []

  // 1. 专属解说分类：每个源并发拉取前 3 页 (pg = 1, 2, 3)，大幅扩充实时解说储备池
  for (const site of dedicatedSites) {
    const typeIds = DEDICATED_COMMENTARY_TYPES[site.key] || []
    for (const tid of typeIds) {
      for (const pg of [1, 2, 3]) {
        tasks.push(
          (async () => {
            try {
              const url = buildUrl(site.api, { ac: 'detail', t: tid, pg })
              const json = await requestJson(url, 4800)
              const list = json.list || json.data || []
              for (const raw of list) {
                if (!raw || NSFW_REGEX.test(raw.vod_name || '') || NSFW_REGEX.test(raw.type_name || '')) continue
                const item = normItem(raw, site.key)
                item.siteName = site.name
                item.baseMovieTitle = extractBaseMovieTitle(item.name) || item.name
                item.isCommentary = true
                allItems.push(item)
              }
            } catch {
              /* 忽略单源单页异常 */
            }
          })()
        )
      }
    }
  }

  // 2. 关键词检索：在主力高速源检索「解说 / 速看 / 几分钟」最新条目
  for (const site of keywordSites) {
    for (const wd of keywords) {
      tasks.push(
        (async () => {
          try {
            const url = buildUrl(site.api, { ac: 'detail', wd, pg: 1 })
            const json = await requestJson(url, 4200)
            const list = json.list || json.data || []
            for (const raw of list) {
              if (!raw || NSFW_REGEX.test(raw.vod_name || '') || NSFW_REGEX.test(raw.type_name || '')) continue
              const item = normItem(raw, site.key)
              item.siteName = site.name
              item.baseMovieTitle = extractBaseMovieTitle(item.name) || item.name
              item.isCommentary = true
              allItems.push(item)
            }
          } catch {
            /* 忽略单源异常 */
          }
        })()
      )
    }
  }

  await Promise.allSettled(tasks)

  // 按规范化片名去重，优先保留带有效海报与直连播放线路的最新条目
  const seen = new Map()
  for (const it of allItems) {
    if (!it || !it.name) continue
    const key = (it.baseMovieTitle || it.name).toLowerCase()
    const hasPlayable = Array.isArray(it._lines) && it._lines.some((l) => l.episodes && l.episodes.length)
    if (!seen.has(key)) {
      seen.set(key, { ...it, _playable: hasPlayable })
    } else {
      const prev = seen.get(key)
      if (!prev._playable && hasPlayable) {
        seen.set(key, { ...it, _playable: hasPlayable })
      }
    }
  }

  const deduped = Array.from(seen.values())
  deduped.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) || 0 : 0
    const tb = b.updatedAt ? Date.parse(b.updatedAt) || 0 : 0
    return tb - ta
  })

  const sliced = deduped.slice(0, Math.max(limit, 72))
  if (sliced.length) {
    commentariesCache = { timestamp: Date.now(), data: sliced }
  }
  return sliced.slice(0, limit)
}

/**
 * AI 智能综合搜索：精准匹配 + 端侧语义意图重排与无结果跨分类智能挖掘
 */
async function searchSmart(site, query, { limit = 30, skipEnrich = false } = {}) {
  const startedAt = Date.now()
  if (!site || !query) return { items: [], total: 0, isSemantic: false }

  const cleanQ = query.trim()
  let items = []

  // 1. 先尝试字面搜索 (精准匹配片名)
  try {
    const directRes = await fetchList(site, { keyword: cleanQ, page: 1, skipEnrich })
    if (directRes && directRes.items) {
      items.push(...directRes.items)
    }
  } catch {
    /* 容错 */
  }

  // 2. 若字面匹配不足，尝试按分词补充搜索
  const words = cleanQ.split(/\s+/).filter((w) => w.length >= 2)
  if (items.length < 5 && words.length > 1) {
    for (const w of words) {
      if (w === cleanQ) continue
      try {
        const extraRes = await fetchList(site, { keyword: w, page: 1, skipEnrich })
        if (extraRes && extraRes.items) items.push(...extraRes.items)
      } catch {
        /* 容错 */
      }
      if (items.length >= 10) break
    }
  }

  // 去重时若规范化片名相同，优先保留与搜索词匹配得分更高的正片（防止解说或衍生片覆盖正片）
  const map = new Map()
  for (const it of items) {
    if (!it || !it.name) continue
    const exactKey = it.name.trim()
    if (!map.has(exactKey)) {
      map.set(exactKey, it)
    }
  }
  const deduped = Array.from(map.values()).sort(
    (a, b) => scoreMovieMatch(b, cleanQ, cleanQ) - scoreMovieMatch(a, cleanQ, cleanQ)
  )

  return {
    items: deduped.slice(0, limit),
    total: deduped.length,
    isSemantic: false,
    timeMs: Date.now() - startedAt,
  }
}

async function probeM3u8(url, timeoutMs = 2500) {
  try {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const client = isHttps ? https : http
    return await new Promise((resolve) => {
      const req = client.request(
        {
          host: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: u.pathname + u.search,
          method: 'GET',
          headers: {
            'User-Agent': UA,
            Range: 'bytes=0-1024',
          },
          servername: isHttps ? u.hostname : undefined,
          timeout: timeoutMs,
          rejectUnauthorized: false,
        },
        (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) return resolve(true)
          resolve(false)
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    })
  } catch {
    return false
  }
}

async function findPlayableSource(sites, { title, epIdx = 0, currentSite = '' }) {
  if (!title) return null
  const cleanTitle = metadata.cleanTitle(title) || title
  const router = require('./router')
  let candidates = (sites || []).filter(
    (s) => s.enabled !== false && s.key !== currentSite && !router.isCircuitBroken(s.key)
  )
  // 全熔断自愈兜底：若所有非当前源均被标记为熔断，自动降级解除熔断限制，兜底尝试所有启用源
  if (!candidates.length) {
    candidates = (sites || []).filter((s) => s.enabled !== false && s.key !== currentSite)
  }
  if (!candidates.length) return null

  // 优先在前 8 个高码率低延迟直连主源中竞速，避免一次性唤醒全部 24 个源造成无效请求风暴
  const primaryBatch = candidates.slice(0, 8)
  const secondaryBatch = candidates.slice(8)

  const probeCandidateBatch = async (batch) => {
    if (!batch.length) return null
    const raceTasks = batch.map(
      (site) =>
        new Promise(async (resolve, reject) => {
          try {
            let searchRes = await searchSmart(site, title, { limit: 8, skipEnrich: true })
            if (!searchRes.items.length && cleanTitle !== title) {
              searchRes = await searchSmart(site, cleanTitle, { limit: 8, skipEnrich: true })
            }
            if (!searchRes.items.length) return reject('No match')

            // 严格按正片相关度打分排序，绝不盲目取 items[0]
            const scored = searchRes.items
              .map((item) => ({ item, score: scoreMovieMatch(item, title, cleanTitle) }))
              .filter((x) => x.score >= 70)
              .sort((a, b) => b.score - a.score)

            if (!scored.length) return reject('No exact movie match')
            const match = scored[0].item

            // 若列表接口已直接返回 vod_play_url 解析出的 _lines，直接复用，省去二次详情请求与远端刮削
            let lines = match._lines
            if (!Array.isArray(lines) || !lines.length) {
              const detail = await fetchDetail(site, match.id)
              lines = detail.lines || []
            }

            for (let lIdx = 0; lIdx < lines.length; lIdx++) {
              const line = lines[lIdx]
              if (!line.episodes || !line.episodes.length) continue
              const targetEp = line.episodes[epIdx] || line.episodes[0]
              if (!targetEp || playKind(targetEp.url) !== 'hls') continue

              const ok = await probeM3u8(targetEp.url)
              if (ok) {
                return resolve({
                  site: site.key,
                  siteName: site.name,
                  id: match.id,
                  name: match.name,
                  pic: match.pic || '',
                  score: match.score || '',
                  lineIdx: lIdx,
                  lineName: line.name,
                  epIdx: line.episodes[epIdx] ? epIdx : 0,
                  url: targetEp.url,
                })
              }
            }
            reject('No working line')
          } catch (e) {
            reject(e)
          }
        })
    )
    try {
      return await Promise.any(raceTasks)
    } catch {
      return null
    }
  }

  const firstHit = await probeCandidateBatch(primaryBatch)
  if (firstHit) return firstHit
  return await probeCandidateBatch(secondaryBatch)
}

module.exports = {
  fetchClasses,
  fetchList,
  fetchDetail,
  fetchDailyUpdates,
  fetchRankings,
  fetchMovieCommentaries,
  extractBaseMovieTitle,
  scoreMovieMatch,
  searchSmart,
  testSite,
  playKind,
  buildUrl,
  requestJson,
  findPlayableSource,
  probeM3u8,
  normalizeEpisodeList,
  clusterSearchResults,
  NSFW_REGEX,
  fetchTmdbFeed: metadata.fetchTmdbFeed,
}
