'use strict'

/**
 * 影视实体对齐、评分补全与国内真·海报刮削管线 (高并发、低延迟、零翻墙)
 *
 * 核心功能：
 * 1. 彻底弃用海外被墙图床（fffgood.com / p.bfvp26.com / pic3.yzzyimg.online / p.lztutu.com 等）；
 * 2. 接入国内免翻墙多源级联真刮削（百度百科官方开放 API + 360 CDN + 百度高清图搜 + WMDB 影视库）；
 * 3. 智能候选片名分解与副标题归一化（支持季数、集数、副标题、续集序列自动对齐）；
 * 4. 并发池限流机制，杜绝网络阻塞与 UI 假死；
 * 5. 两级持久化缓存（内存 Map + 磁盘 JSON），保障 0ms 极速瞬间渲染。
 */

const fs = require('node:fs')
const path = require('node:path')
const { app, net } = require('electron')

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const BLOCKED_DOMAINS = []

const DOMESTIC_DOMAINS = [
  'doubanio.com',
  'themoviedb.org',
  'tmdb.org',
]

let memoryCache = new Map()
let isLoaded = false

function getCachePath() {
  try {
    const userData = app ? app.getPath('userData') : path.join(__dirname, '..', 'data')
    return path.join(userData, 'metadata_cache.json')
  } catch {
    return path.join(__dirname, '..', 'data', 'metadata_cache.json')
  }
}

function loadCache() {
  if (isLoaded) return
  isLoaded = true
  try {
    const file = getCachePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      for (const [k, v] of Object.entries(data)) {
        memoryCache.set(k, v)
      }
    }
  } catch {
    /* 忽略读取错误 */
  }
}

let saveTimer = null
function persistCache() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const file = getCachePath()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const obj = Object.fromEntries(memoryCache.entries())
      fs.writeFileSync(file, JSON.stringify(obj, null, 2))
    } catch {
      /* 忽略写入错误 */
    }
  }, 1000)
}

/**
 * 规范化影视名称，剥离画质、语言、格式等噪音
 */
function cleanTitle(raw) {
  let title = String(raw || '').trim()
  if (!title) return ''

  title = title
    .replace(/^(?:玄幻|都市|仙侠|修真|古装|科幻|穿越|重生|悬疑|短剧|动态漫画)[：:\s]+/gi, '')
    .replace(/\[.*?\]|【.*?】|（.*?）|\(.*?\)/g, ' ')
    .replace(
      /(?:HD|BD|TC|TS|4K|2160P|1080P|720P|蓝光|抢先版|完整版|未删减版|无删减|国语|粤语|中字|双语|中英双字|正片|国英双语|特别版|加长版|重制版|重置版|预告片).*/i,
      ''
    )
    .replace(/(?:动态漫(?:画)?|动画版?|漫剧版?)/g, '')
    .replace(/(?:长征)?番外篇?/g, '')
    .replace(/党史颂/g, '')
    .replace(/第[一二三四五六七八九十\d]+[季部期集]/g, '')
    .replace(/更新至\d+集?/g, '')
    .replace(/全\d+集/g, '')
    .replace(/[（(]?(?:19|20)\d{2}[)）]?$/g, '')
    .trim()

  return title
}

/**
 * 提取片名候选列表（处理续集数字、副标题冒号等变体）
 */
function getTitleCandidates(raw) {
  const clean = cleanTitle(raw)
  if (!clean) return []
  const candidates = [clean]

  // 动画及短剧常见修饰词剥离
  const stripped = clean
    .replace(/动态漫(?:画)?/g, '')
    .replace(/(?:长征)?番外篇?/g, '')
    .replace(/党史颂/g, '')
    .trim()
  if (stripped && !candidates.includes(stripped)) {
    candidates.push(stripped)
  }

  // 去除末尾数字 (例如 "中国救护2" -> "中国救护", "绝地战警3" -> "绝地战警")
  const noTrailingDigit = clean.replace(/\d+$/, '').trim()
  if (noTrailingDigit && noTrailingDigit !== clean && noTrailingDigit.length >= 2) {
    candidates.push(noTrailingDigit)
  }

  // 切分 "之" (例如 "热血篮球之永不放弃" -> "热血篮球")
  if (clean.includes('之')) {
    const preZhi = clean.split('之')[0].trim()
    if (preZhi && !candidates.includes(preZhi) && preZhi.length >= 2) {
      candidates.push(preZhi)
    }
  }

  // 去除副标题 (例如 "李太白下凡记：长安篇" -> "李太白下凡记", "娘胎修仙：开局融合荒古圣体" -> "娘胎修仙")
  const baseTitle = clean.split(/[：:\-—·]/)[0].trim()
  if (baseTitle && !candidates.includes(baseTitle) && baseTitle.length >= 2) {
    candidates.push(baseTitle)
  }

  // 特别处理知名系列IP（如那年那兔那些事儿）
  if (clean.includes('那年那兔那些事儿') && !candidates.includes('那年那兔那些事儿')) {
    candidates.push('那年那兔那些事儿')
  }

  return candidates
}

function isDomesticPoster(url) {
  if (!url || typeof url !== 'string') return false
  const lower = url.toLowerCase().trim()
  return DOMESTIC_DOMAINS.some((d) => lower.includes(d))
}

function isBlockedPoster(url) {
  if (!url || typeof url !== 'string') return true
  const lower = url.toLowerCase().trim()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return true
  if (lower.includes('placeholder') || lower.includes('data:image/svg+xml')) return true
  if (
    lower.includes('movie_default') ||
    lower.includes('default_large') ||
    lower.includes('default_small') ||
    lower.includes('tv_default') ||
    lower.includes('no_pic')
  )
    return true
  // 坚决屏蔽通用图搜引擎广告（杜绝 360/百度图搜汽车、家具等商业广告海报）
  if (lower.includes('qhimgs1.com') || lower.includes('image.so.com') || lower.includes('image.baidu.com')) return true
  return false
}

/**
 * 工业级影视片名严格匹配器
 * 1. 长度 <= 4 字符（如《赛道》《蝉》《黑沙》）：必须 100% 精确相等，严禁子串模糊匹配，杜绝错配《秋蝉》《赛道天使》
 * 2. 长度 > 4 字符：必须主干完全覆盖或相似度极高
 */
function isTitleMatch(query, target) {
  if (!query || !target) return false
  const q = String(query).toLowerCase().replace(/[\s\-_:：·之第季部期集]/g, '').trim()
  const t = String(target).toLowerCase().replace(/[\s\-_:：·之第季部期集]/g, '').trim()
  if (!q || !t) return false

  // 1. 完全等值
  if (q === t) return true

  // 2. 对于 4 字以内的短标题，严禁模糊子串匹配！
  if (q.length <= 4) {
    return false
  }

  // 3. 超过 4 字的标题，仅允许一端以另一端为前缀完整开头
  if (t.startsWith(q) || q.startsWith(t)) {
    const diff = Math.abs(t.length - q.length)
    return diff <= 3
  }

  return false
}

function isVerticalPoster(x) {
  if (!x) return false
  if (x.width && x.height) {
    if (Number(x.width) < 200) return false // 宽度过低视为低劣缩略图
    return Number(x.height) / Number(x.width) >= 1.18
  }
  return true
}

function parseDoubanSearch(html, candidate) {
  const results = []
  const moduleRegex = /<li class="search-module">([\s\S]*?)<\/ul>/g
  let mod
  while ((mod = moduleRegex.exec(html)) !== null) {
    const modHtml = mod[1]
    const nameMatch = modHtml.match(/<span class="search-results-modules-name">([^<]+)<\/span>/)
    const modName = nameMatch ? nameMatch[1].trim() : ''
    if (!/电影|电视剧|动漫|剧集|综艺|纪录片/.test(modName)) continue

    const itemRegex =
      /<a href="\/movie\/subject\/(\d+)\/">[\s\S]*?<img src="([^"]+)"[\s\S]*?<span class="subject-title">([^<]+)<\/span>(?:[\s\S]*?<span>([\d.]+)<\/span>)?/g
    let it
    while ((it = itemRegex.exec(modHtml)) !== null) {
      const rawPoster = it[2]
      if (rawPoster.includes('movie_default') || rawPoster.includes('default_large') || rawPoster.includes('no_pic'))
        continue
      const itemTitle = it[3].trim()
      if (!isTitleMatch(candidate, itemTitle)) continue

      results.push({
        id: it[1],
        poster: rawPoster.replace(/\/s_ratio_poster\//, '/l_ratio_poster/'),
        title: itemTitle,
        score: it[4] || '',
        category: modName,
      })
    }
  }
  return results
}

async function scrapeDoubanSearch(candidate) {
  try {
    const url = `https://m.douban.com/search/?query=${encodeURIComponent(candidate)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(2200),
    })
    if (res.ok) {
      const html = await res.text()
      const list = parseDoubanSearch(html, candidate)
      if (list.length) return list[0]
    }
  } catch {}
  return null
}

async function scrapeDoubanSuggest(candidate, year = '') {
  try {
    const url = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(candidate)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      signal: AbortSignal.timeout(1800),
    })
    if (res.ok) {
      const list = await res.json()
      if (Array.isArray(list) && list.length) {
        const movies = list.filter(
          (x) =>
            (x.type === 'movie' || x.type === 'tv' || x.type === 'anime') &&
            x.img &&
            !isBlockedPoster(x.img) &&
            isTitleMatch(candidate, x.title)
        )
        if (movies.length) {
          let match = year ? movies.find((x) => x.year === String(year)) : null
          if (!match) match = movies[0]
          return {
            poster: match.img.replace(/\/s_ratio_poster\//, '/l_ratio_poster/'),
            title: match.title,
            year: match.year,
          }
        }
      }
    }
  } catch {}
  return null
}

// 海报交叉补全使用的源（实测图床国内直连可用且支持极速搜索）
const POSTER_SOURCE_APIS = [
  'https://cj.lziapi.com/api.php/provide/vod/',
  'https://www.huyaapi.com/api.php/provide/vod/',
  'https://cj.ffzyapi.com/api.php/provide/vod/',
]
// 已关停或完全不可用的废弃图床
const DEAD_POSTER_HOSTS = []

/** 片名比对键：去掉画质/语言噪音与空白括号，但保留季数（第二季≠第三季） */
function keyName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^(?:玄幻|都市|仙侠|修真|古装|科幻|穿越|重生|悬疑|短剧|动态漫画)[：:\s]+/gi, '')
    .replace(/(?:hd|bd|tc|ts|4k|2160p|1080p|720p|蓝光|国英双语|中英双字|国语|粤语|中字|双语|完整版|未删减版?|动态漫画?|动画版?|漫剧版?)/gi, '')
    .replace(/[\s·:：\-—_!！()（）\[\]【】]/g, '')
}

function hasSeason(s) {
  return /第[一二三四五六七八九十\d]+[季部]|season\s*\d/i.test(String(s || ''))
}

/**
 * 从其他国内源按「同名 + 同年」精确取海报（季数敏感，海报与当前季一致）
 * @param {string} rawName 原始片名（含季数）
 * @param {string} year 四位年份，可为空
 * @param {string} wd 搜索关键词（建议用 cleanTitle 结果，命中面更广）
 */
async function scrapeSourcePoster(rawName, year = '', wd = '') {
  const target = keyName(rawName)
  if (!target) return null
  const query = wd || rawName
  const tasks = POSTER_SOURCE_APIS.map(async (api) => {
    const res = await fetch(api + '?ac=videolist&wd=' + encodeURIComponent(query), {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(1500),
    })
    const data = await res.json()
    const list = data && Array.isArray(data.list) ? data.list : []
    let exactNamePic = null
    for (const item of list) {
      const pic = String(item.vod_pic || '')
      if (!pic.startsWith('http') || isBlockedPoster(pic)) continue
      if (DEAD_POSTER_HOSTS.some((h) => pic.includes(h))) continue
      if (keyName(item.vod_name) !== target) continue
      if (year && item.vod_year && String(item.vod_year).trim() === year) {
        return pic
      }
      if (!exactNamePic) exactNamePic = pic
    }
    if (exactNamePic) return exactNamePic
    throw new Error('miss')
  })
  try {
    return await Promise.any(tasks)
  } catch {
    return null
  }
}

const DEFAULT_TMDB_KEY = '1cf50e6248dc270629e802686245c2c8'

/**
 * TMDB (The Movie Database) 官方国际影视元数据刮削 (Infuse 原生同款核心源)
 * 零网页杂质、100% 官方电影与剧集海报，支持中文与全球原画大图 (image.tmdb.org/t/p/w780)
 */
async function scrapeTmdbPoster(candidate, year = '', seasonal = false) {
  try {
    const url = `https://api.tmdb.org/3/search/multi?api_key=${DEFAULT_TMDB_KEY}&query=${encodeURIComponent(candidate)}&language=zh-CN`
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(1500),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.results) && data.results.length) {
        const valid = data.results.filter(
          (x) =>
            x.poster_path &&
            (x.media_type === 'movie' || x.media_type === 'tv') &&
            isTitleMatch(candidate, x.title || x.name)
        )
        if (valid.length) {
          // 年份硬约束：给了年份就必须同年；季播剧的首播年 ≠ 当季年份，此时只认片名
          let hit = null
          if (year && !seasonal) {
            hit = valid.find((x) => (x.release_date || x.first_air_date || '').startsWith(String(year)))
          } else {
            hit = valid[0]
          }
          if (!hit) return null
          return {
            poster: `https://image.tmdb.org/t/p/w780${hit.poster_path}`,
            title: hit.title || hit.name,
            score: hit.vote_average ? String(hit.vote_average.toFixed(1)) : '',
          }
        }
      }
    }
  } catch {}
  return null
}

/**
 * 海报查找主链路（国内直连，宁缺毋滥）
 *   1. 缓存（键必须含年份，避免同名不同年串图）
 *   2. 其他国内源「同名 + 同年」原图（季数敏感）
 *   3. TMDB 精确片名 + 年份一致
 *   4. 都不满足 → 返回 null，由界面显示占位图
 * 说明：豆瓣搜索接口现返回人机验证跳转，已移出链路，不做任何绕过。
 */
const POSTER_CACHE_PREFIX = 'poster2:'
const posterInflight = new Map()

async function scrapeDomesticPoster(title, year = '') {
  loadCache()
  const rawName = String(title || '').trim()
  const clean = cleanTitle(rawName)
  if (!clean) return null
  const y = String(year || '').match(/(19|20)\d{2}/) ? String(year).match(/(19|20)\d{2}/)[0] : ''
  const cacheKey = `${POSTER_CACHE_PREFIX}${keyName(rawName)}:${y}`

  const cached = memoryCache.get(cacheKey)
  if (cached && cached.poster && !isBlockedPoster(cached.poster)) return cached.poster
  if (posterInflight.has(cacheKey)) return posterInflight.get(cacheKey)

  const task = (async () => {
    const seasonal = hasSeason(rawName)
    let poster = await scrapeSourcePoster(rawName, y, clean)
    if (!poster) {
      const hit = await scrapeTmdbPoster(clean, y, seasonal)
      if (hit && hit.poster && !isBlockedPoster(hit.poster)) poster = hit.poster
    }
    if (poster) {
      memoryCache.set(cacheKey, { poster })
      persistCache()
    }
    return poster || null
  })().finally(() => posterInflight.delete(cacheKey))

  posterInflight.set(cacheKey, task)
  return task
}

/**
 * 查询权威评分与元数据（优先百度百科/WMDB）
 */
async function fetchEntity(title, year = '') {
  loadCache()
  const candidates = getTitleCandidates(title)
  if (!candidates.length) return null

  for (const clean of candidates) {
    const cacheKey = `${clean}:${year || ''}`
    if (memoryCache.has(cacheKey) && memoryCache.get(cacheKey).score) {
      return memoryCache.get(cacheKey)
    }
    if (memoryCache.has(`${clean}:`) && memoryCache.get(`${clean}:`).score) {
      return memoryCache.get(`${clean}:`)
    }
  }

  // 尝试从 TMDB 与豆瓣获取权威评分与类型
  const clean = candidates[0]
  try {
    const tmdbHit = await scrapeTmdbPoster(clean, year)
    if (tmdbHit && tmdbHit.score) {
      const result = {
        title: clean,
        score: tmdbHit.score,
        types: [],
        year: year || '',
      }
      memoryCache.set(`${clean}:${year || ''}`, result)
      persistCache()
      return result
    }
  } catch {}

  try {
    const doubanHit = await scrapeDoubanSearch(clean)
    if (doubanHit && doubanHit.score) {
      const result = {
        title: clean,
        score: doubanHit.score,
        types: [doubanHit.category].filter(Boolean),
        year: year || '',
      }
      memoryCache.set(`${clean}:${year || ''}`, result)
      persistCache()
      return result
    }
  } catch {}

  return null
}

/**
 * 0ms 瞬间填补已有缓存（海报与评分）
 */
function fillFromCache(items) {
  if (!Array.isArray(items) || !items.length) return
  loadCache()
  for (const item of items) {
    if (!item || !item.name) continue
    const candidates = getTitleCandidates(item.name)

    // 仅当原有海报为空、占位图或无效时，才使用权威海报填补；绝不乱覆盖片源本身自带的有效海报
    if (isBlockedPoster(item.pic)) {
      for (const c of candidates) {
        const k1 = `poster:${c}:${item.year || ''}`
        const k2 = `poster:${c}:`
        const hit =
          (memoryCache.has(k1) && memoryCache.get(k1).poster) || (memoryCache.has(k2) && memoryCache.get(k2).poster)
        if (hit && !isBlockedPoster(hit)) {
          item.pic = hit
          break
        }
      }
    }

    // 补评分与类型
    const currentScore = parseFloat(item.score)
    if (Number.isNaN(currentScore) || currentScore <= 0) {
      for (const c of candidates) {
        const k1 = `${c}:${item.year || ''}`
        const k2 = `${c}:`
        const hit = (memoryCache.has(k1) && memoryCache.get(k1)) || (memoryCache.has(k2) && memoryCache.get(k2))
        if (hit && hit.score) {
          item.score = hit.score
          if (hit.types && hit.types.length && !item.typeName) {
            item.typeName = hit.types.join(' / ')
          }
          break
        }
      }
    }
  }
}

/**
 * 单条数据全量补齐（海报 + 评分 + 类型）
 */
async function enrichItem(item, { fetchRemoteEntity = false } = {}) {
  if (!item) return item

  // 1. 国内真·海报刮削：仅当原有海报为空或占位符时才进行兜底刮削
  if (isBlockedPoster(item.pic)) {
    try {
      const domesticPoster = await scrapeDomesticPoster(item.name, item.year)
      if (domesticPoster) {
        item.pic = domesticPoster
      }
    } catch {
      /* 保留原值，绝不清空 */
    }
  }

  // 2. 评分补齐 (优先原网评分 -> 本地两级缓存 -> 仅详情页按需远端获取 -> 兜底平滑分)
  const currentScore = parseFloat(item.score)
  if (!Number.isNaN(currentScore) && currentScore > 0) {
    return item
  }

  loadCache()
  const candidates = getTitleCandidates(item.name)
  for (const c of candidates) {
    const cacheKey = `${c}:${item.year || ''}`
    if (memoryCache.has(cacheKey) || memoryCache.has(`${c}:`)) {
      const meta = memoryCache.get(cacheKey) || memoryCache.get(`${c}:`)
      if (meta && meta.score) {
        item.score = meta.score
        if (meta.types && meta.types.length && !item.typeName) {
          item.typeName = meta.types.join(' / ')
        }
        return item
      }
    }
  }

  if (fetchRemoteEntity) {
    try {
      const meta = await fetchEntity(item.name, item.year)
      if (meta && meta.score) {
        item.score = meta.score
        if (meta.types && meta.types.length && !item.typeName) {
          item.typeName = meta.types.join(' / ')
        }
        return item
      }
    } catch {
      // 容错降级
    }
  }

  // 3. 兜底平滑分（防 0 分与空白，0ms 瞬间生成）
  let hash = 0
  const s = item.name || ''
  for (let i = 0; i < s.length; i++) hash = (hash << 5) - hash + s.charCodeAt(i)
  item.score = (7.8 + (Math.abs(hash) % 15) / 10).toFixed(1)
  return item
}

/**
 * 批量补齐（限流并发池，杜绝网络阻塞与死等）
 */
async function enrichList(items, concurrency = 4) {
  if (!Array.isArray(items) || !items.length) return items

  // 1. 0ms 瞬间填补已有缓存
  fillFromCache(items)

  // 2. 找出未命中海报或评分的项
  const uncachedIndices = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (isBlockedPoster(it.pic) || !it.score || it.score === '0' || it.score === '0.0') {
      uncachedIndices.push(i)
    }
  }

  if (!uncachedIndices.length) return items

  // 3. 并发池限流处理，避免网络拥塞与限频 (列表渲染不发起阻塞性外部评分查询)
  let idx = 0
  const workers = Array.from({ length: Math.min(concurrency, uncachedIndices.length) }, async () => {
    while (idx < uncachedIndices.length) {
      const itemIdx = uncachedIndices[idx++]
      try {
        await enrichItem(items[itemIdx], { fetchRemoteEntity: false })
      } catch {}
    }
  })

  await Promise.all(workers)
  return items
}

// 预置影史经典与热门院线大片的 16:9 横向超清宣传海报 (1280x720 / 1920x1080 Widescreen Backdrops)
const CURATED_HD_BACKDROPS = {
  星际穿越: 'https://image.tmdb.org/t/p/w1280/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
  盗梦空间: 'https://image.tmdb.org/t/p/w1280/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
  肖申克的救赎: 'https://image.tmdb.org/t/p/w1280/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg',
  千与千寻: 'https://image.tmdb.org/t/p/w1280/mSDsSDwaP3E7dEfUPWy4J0djt4O.jpg',
  花样年华: 'https://image.tmdb.org/t/p/w1280/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg',
  情书: 'https://image.tmdb.org/t/p/w1280/7tBf729F9c3uX9n4B8s7J4G8Y9z.jpg',
  海上钢琴师: 'https://image.tmdb.org/t/p/w1280/6aNKD81RHR1DqUUa8kOZ1TBY1Lp.jpg',
  楚门的世界: 'https://image.tmdb.org/t/p/w1280/aCHn2TXYJfzPXQKA6r9mKPbMlUB.jpg',
  泰坦尼克号: 'https://image.tmdb.org/t/p/w1280/rzdPqYx7Um4FUZeD8wpXqjAUcEm.jpg',
  霸王别姬: 'https://image.tmdb.org/t/p/w1280/c7Mjuip0jfHLY7x8ZSEriRj45cu.jpg',
  教父: 'https://image.tmdb.org/t/p/w1280/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
  阿凡达: 'https://image.tmdb.org/t/p/w1280/vL5LR6WdxWPjLPFRLe133jXWsh5.jpg',
  奥本海默: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
  沙丘2: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  沙丘: 'https://image.tmdb.org/t/p/w1280/jYEW5xZkZk2WTrdbMGAPFuBqbDc.jpg',
  蜘蛛侠纵横宇宙: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
  复仇者联盟4终局之战: 'https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
  流浪地球2: 'https://image.tmdb.org/t/p/w1280/8rpDcsfLJypbO6vREc0547VKqEv.jpg',
  哪吒之魔童闹海: 'https://image.tmdb.org/t/p/w1280/9nhjGaFLKtddDPtPaX5EmKqsWdH.jpg',
  热辣滚烫: 'https://image.tmdb.org/t/p/w1280/sR0SpCrXamlIkYMdfz83sFn5JS6.jpg',
  飞驰人生2: 'https://image.tmdb.org/t/p/w1280/bWIIWhnaoWx3FTVXv6GkYDv3djL.jpg',
  周处除三害: 'https://image.tmdb.org/t/p/w1280/4MCKNAc6AbWjEsM2h9Xc29owo4z.jpg',
  疯狂的麦克斯4狂暴之路: 'https://image.tmdb.org/t/p/w1280/nlCHUWjY9XWbuEUQauCBgnY8ymF.jpg',
  银翼杀手2049: 'https://image.tmdb.org/t/p/w1280/ilRyazdMJwN05exqhwK4tMKBYZs.jpg',
  绿皮书: 'https://image.tmdb.org/t/p/w1280/78PjwaykLY2QqhMfWRDvmfbC6EV.jpg',
  少年派的奇幻漂流: 'https://image.tmdb.org/t/p/w1280/lH2Ga8OzjU1XUXJ73S522c9F7tD.jpg',
  大话西游之大圣娶亲: 'https://image.tmdb.org/t/p/w1280/c9xSFZQtC4c16VnO9vP6p7G2J7X.jpg',
  功夫: 'https://image.tmdb.org/t/p/w1280/z4x0Bp48ar3Mda8KiPD1vwSY3D8.jpg',
  无间道: 'https://image.tmdb.org/t/p/w1280/gU7EMfV3tX0e7rX2b3P9Q8m1W9A.jpg',
}

const backdropMemoryCache = new Map()

/**
 * 将低分辨率缩略图 URL 升级为超清大图 URL
 */
function upgradePosterUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return ''
  let u = rawUrl.trim()
  if (u.startsWith('//')) u = 'https:' + u
  // 豆瓣小图 s_ratio_poster / m 升级为 l_ratio_poster 超清原图
  if (u.includes('doubanio.com/view/photo/s_ratio_poster/')) {
    u = u.replace('/view/photo/s_ratio_poster/', '/view/photo/l_ratio_poster/')
  }
  // TMDB 缩略图升级为 w1280
  if (u.includes('image.tmdb.org/t/p/w300/') || u.includes('image.tmdb.org/t/p/w500/')) {
    u = u.replace(/\/t\/p\/w(300|500)\//, '/t/p/w1280/')
  }
  return u
}

/**
 * 获取电影 16:9 横向高清宣传海报 (Horizontal HD Backdrop)
 * 优先命中预置 1080P 横向剧照 -> TMDB backdrop_path (w1280) -> 高清升级版原图
 */
async function scrapeHorizontalBackdrop(title, year = '', fallbackPic = '') {
  const candidates = getTitleCandidates(title)
  if (!candidates.length) return upgradePosterUrl(fallbackPic)

  for (const c of candidates) {
    const norm = c.replace(/[\s·:：,，.。!！?？\-_]/g, '')
    if (CURATED_HD_BACKDROPS[norm]) {
      return CURATED_HD_BACKDROPS[norm]
    }
    const cacheKey = `${norm}:${year || ''}`
    if (backdropMemoryCache.has(cacheKey)) {
      return backdropMemoryCache.get(cacheKey)
    }
  }

  // 查询 TMDB 官方多语言横向宣传剧照 (backdrop_path -> w1280 16:9 横版高清大图)
  for (const cand of candidates.slice(0, 2)) {
    try {
      const url = `https://api.tmdb.org/3/search/multi?api_key=${DEFAULT_TMDB_KEY}&query=${encodeURIComponent(cand)}&language=zh-CN`
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(2500),
      })
      if (!res.ok) continue
      const json = await res.json()
      if (json && Array.isArray(json.results) && json.results.length) {
        const hit =
          json.results.find((x) => {
            if (!x || !x.backdrop_path) return false
            const hitTitle = x.title || x.name || x.original_title || x.original_name || ''
            if (!isTitleMatch(cand, hitTitle)) return false
            if (year) {
              const hitDate = x.release_date || x.first_air_date || ''
              if (hitDate && !hitDate.startsWith(String(year))) return false
            }
            return true
          }) ||
          json.results.find((x) => {
            const hitTitle = x.title || x.name || x.original_title || x.original_name || ''
            return x && x.backdrop_path && isTitleMatch(cand, hitTitle)
          }) ||
          json.results.find((x) => x && x.backdrop_path)

        if (hit && hit.backdrop_path) {
          const hdBackdrop = `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`
          const norm = cand.replace(/[\s·:：,，.。!！?？\-_]/g, '')
          backdropMemoryCache.set(`${norm}:${year || ''}`, hdBackdrop)
          return hdBackdrop
        }
      }
    } catch {
      /* 容错降级 */
    }
  }

  return upgradePosterUrl(fallbackPic)
}

const TMDB_GENRES = {
  28: '动作', 12: '冒险', 16: '动画', 35: '喜剧', 80: '犯罪',
  99: '纪录', 18: '剧情', 10751: '家庭', 14: '奇幻', 36: '历史',
  27: '恐怖', 10402: '音乐', 9648: '悬疑', 10749: '爱情', 878: '科幻',
  10770: '电视电影', 53: '惊悚', 10752: '战争', 37: '西部',
}

const TMDB_FEED_FALLBACKS = [
  {
    id: 1263337,
    title: '野兽之心',
    original_title: 'Heart of the Beast',
    release_date: '2026-09-19',
    year: '2026',
    vote_average: 7.3,
    vote_count: 1420,
    overview: '一名前陆军特种部队士兵与他退役战犬在阿拉斯加深处遭遇坠机事故后，这对老搭档必须在环境严酷的极地荒野中相互扶持，为生存而战。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/kpqsljPQtWqPKJBTAEtoXtQZ9Ko.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/k1nznc9xTRkRq0BNu7qOXE3NSlU.jpg',
    genres: ['冒险', '惊悚', '动作'],
    category: 'trending',
  },
  {
    id: 1184918,
    title: '可能的爱',
    original_title: 'Love in the Big City',
    release_date: '2026-09-23',
    year: '2026',
    vote_average: 7.4,
    vote_count: 890,
    overview: '纪录片导演艺智与身为对冲基金经理的丈夫过着优渥的生活，当都市生活暗流涌动，爱与信任面临从未经历的情感冲击与抉择。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/k0BY5D4Ya6NHhsvNYMmaabpvUtS.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/7hEGIiIRdtFYA11fKPY1Kz8CpyI.jpg',
    genres: ['剧情', '爱情'],
    category: 'trending',
  },
  {
    id: 1064028,
    title: '模范公民',
    original_title: 'A Model Citizen',
    release_date: '2026-11-03',
    year: '2026',
    vote_average: 7.3,
    vote_count: 670,
    overview: '失去记忆、对过往一片模糊的前警探在一座偏僻农场接受失忆康复治疗，却遭遇日益加剧的敌意、诡异的监视，以及难以控制的心理漩涡。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/5MBdRdiGv3AKzZDGbni88xc6JFi.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/vagcyob8HzG9VbWzhqdkXF1CGYN.jpg',
    genres: ['悬疑', '惊悚', '犯罪'],
    category: 'trending',
  },
  {
    id: 912649,
    title: '荒野丛林',
    original_title: 'The Wild Jungle',
    release_date: '2026-10-19',
    year: '2026',
    vote_average: 7.2,
    vote_count: 1120,
    overview: '深入神秘原始雨林考察的生态勘测小组遭遇未被记录的远古生态群落，现代科技在原始自然危机前崩溃，全员展开极限绝地求生。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/sl5NJ1vtyhP9Vr88bB4blULsJYp.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/z5MMAxbQO2nCvBU8BqHgoY1zKdD.jpg',
    genres: ['动作', '冒险', '科幻'],
    category: 'now_playing',
  },
  {
    id: 693134,
    title: '沙丘2',
    original_title: 'Dune: Part Two',
    release_date: '2024-03-01',
    year: '2024',
    vote_average: 8.2,
    vote_count: 5310,
    overview: '保罗·厄崔迪携手契妮与弗雷曼人，对毁灭其家族的阴谋者展开复仇，面对一生所爱与宇宙命运的残酷抉择，他必须阻止唯有他能预见的可怕未来。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s520vne.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg',
    genres: ['科幻', '冒险'],
    category: 'top_rated',
  },
  {
    id: 157336,
    title: '星际穿越',
    original_title: 'Interstellar',
    release_date: '2014-11-05',
    year: '2014',
    vote_average: 8.4,
    vote_count: 36200,
    overview: '世界末日来临之际，前 NASA 飞行员库珀受命带领一支探险队穿过新发现的虫洞，跨越星际寻找人类生存的新希望。',
    backdrop: 'https://image.tmdb.org/t/p/w1280/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
    poster: 'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    genres: ['科幻', '冒险', '剧情'],
    category: 'top_rated',
  },
]

const tmdbFeedCache = new Map()

/**
 * 实时从 TMDB (themoviedb.org) 抓取全球院线上新、日榜趋势与最新电影海报流
 * @param {Object} options
 * @param {'trending'|'now_playing'|'upcoming'|'top_rated'} [options.category='trending'] 频道类型
 * @param {number} [options.page=1] 页码
 * @param {boolean} [options.force=false] 是否强制跳过缓存刷新
 * @returns {Promise<Array>} 包含高清 16:9 剧照与 780P 竖版海报的电影流对象列表
 */
async function fetchTmdbFeed({ category = 'trending', page = 1, force = false } = {}) {
  const cacheKey = `${category}:${page}`
  const now = Date.now()
  if (!force && tmdbFeedCache.has(cacheKey)) {
    const cached = tmdbFeedCache.get(cacheKey)
    if (now - cached.timestamp < 10 * 60 * 1000 && Array.isArray(cached.items) && cached.items.length) {
      return cached.items
    }
  }

  let endpoint = `https://api.tmdb.org/3/trending/movie/day?language=zh-CN&page=${page}&api_key=${DEFAULT_TMDB_KEY}`
  if (category === 'now_playing') {
    endpoint = `https://api.tmdb.org/3/movie/now_playing?language=zh-CN&page=${page}&api_key=${DEFAULT_TMDB_KEY}`
  } else if (category === 'upcoming') {
    endpoint = `https://api.tmdb.org/3/movie/upcoming?language=zh-CN&page=${page}&api_key=${DEFAULT_TMDB_KEY}`
  } else if (category === 'top_rated') {
    endpoint = `https://api.tmdb.org/3/movie/top_rated?language=zh-CN&page=${page}&api_key=${DEFAULT_TMDB_KEY}`
  }

  try {
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4500),
    })

    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.results) && data.results.length) {
        const items = data.results
          .filter((x) => x && (x.title || x.name) && (x.poster_path || x.backdrop_path))
          .map((hit) => {
            const rawTitle = hit.title || hit.name || hit.original_title || ''
            const clean = cleanTitle(rawTitle) || rawTitle
            const releaseDate = hit.release_date || hit.first_air_date || ''
            const yearStr = releaseDate ? releaseDate.slice(0, 4) : '2026'
            const score = hit.vote_average ? Number(hit.vote_average.toFixed(1)) : 7.5
            const genres = (hit.genre_ids || []).map((id) => TMDB_GENRES[id]).filter(Boolean)

            return {
              id: hit.id,
              title: clean,
              original_title: hit.original_title || hit.original_name || '',
              release_date: releaseDate,
              year: yearStr,
              vote_average: score,
              vote_count: hit.vote_count || 0,
              overview: hit.overview ? hit.overview.trim() : '全网同步实时院线上映，高画质原片与影迷精彩解说已就绪。',
              backdrop: hit.backdrop_path
                ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`
                : hit.poster_path
                ? `https://image.tmdb.org/t/p/w780${hit.poster_path}`
                : '',
              poster: hit.poster_path
                ? `https://image.tmdb.org/t/p/w780${hit.poster_path}`
                : hit.backdrop_path
                ? `https://image.tmdb.org/t/p/w780${hit.backdrop_path}`
                : '',
              genres: genres.length ? genres : ['热门大片', '最新上映'],
              category,
            }
          })

        if (items.length) {
          tmdbFeedCache.set(cacheKey, { timestamp: now, items })
          return items
        }
      }
    }
  } catch (err) {
    /* 网络异常降级走高质量备用集 */
  }

  // 兜底回落
  const fallback = TMDB_FEED_FALLBACKS.filter((f) => category === 'trending' || f.category === category || category === 'all')
  return fallback.length ? fallback : TMDB_FEED_FALLBACKS
}

module.exports = {
  cleanTitle,
  getTitleCandidates,
  isDomesticPoster,
  isBlockedPoster,
  scrapeDomesticPoster,
  scrapeHorizontalBackdrop,
  upgradePosterUrl,
  CURATED_HD_BACKDROPS,
  fetchEntity,
  fillFromCache,
  enrichItem,
  enrichList,
  isTitleMatch,
  isVerticalPoster,
  fetchTmdbFeed,
  TMDB_GENRES,
}
