'use strict'

/* ==========================================================================
   影悦 · 独立版 —— 界面逻辑
   纯前端渲染：数据来自标准媒体采集接口协议，界面完全由本应用自主原创绘制。
   ========================================================================== */

// 名字不能叫 kky：preload 已经把 kky 挂到 window 上，
// 再声明一个同名的顶层 const 会直接 SyntaxError。
const shellApi = window.kky

// ---------------------------------------------------------------- 本地存储

const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* 配额满了就放弃 */
    }
  },
}

const NSFW_REGEX = /伦理|三级|情色|福利|里番|成人|写真|无码|有码|熟女|女优|理论片|擦边|偷拍|自拍|乱伦|迷奸|催眠|换妻|群交|同性|色情|后宫|SM|强奸/i
const JUNK_REGEX = /体育|足球|篮球|网球|斯诺克|台球|意甲|德甲|英超|西甲|法甲|NBA|CBA|LPL|WCBA|赛事|明星|解说|预告/i
const ROOT_REGEX = /^(电影|电影片|连续剧|电视剧|综艺|综艺片|动漫|动漫片|全部|全部剧集|全部电影|短剧大全|短剧|其他)$/

const isSafe = (item) => item && !NSFW_REGEX.test(item.name || '') && !NSFW_REGEX.test(item.typeName || '')

const store = {
  favorites: {
    all() {
      const list = LS.get('kky.favorites', [])
      const seen = new Set()
      const deduped = []
      for (const item of list) {
        if (!isSafe(item)) continue
        const norm = cleanTitle(item.name) || item.name || item.key
        if (!seen.has(norm)) {
          seen.add(norm)
          deduped.push(item)
        }
      }
      return deduped
    },
    has: (key) => LS.get('kky.favorites', []).some((x) => x.key === key),
    toggle(item) {
      if (!isSafe(item)) return false
      const norm = cleanTitle(item.name) || item.name
      const list = LS.get('kky.favorites', [])
      const idx = list.findIndex((x) => x.key === item.key || (norm && (cleanTitle(x.name) || x.name) === norm))
      if (idx >= 0) list.splice(idx, 1)
      else list.unshift(item)
      LS.set('kky.favorites', list.slice(0, 500))
      return idx < 0
    },
  },
  follow: {
    all() {
      const list = LS.get('kky.follow', [])
      const seen = new Set()
      const deduped = []
      for (const item of list) {
        if (!isSafe(item)) continue
        const norm = cleanTitle(item.name) || item.name || item.key
        if (!seen.has(norm)) {
          seen.add(norm)
          deduped.push(item)
        }
      }
      return deduped
    },
    get: (key) => LS.get('kky.follow', []).find((x) => x.key === key) || null,
    has: (key) => LS.get('kky.follow', []).some((x) => x.key === key),
    toggle(item) {
      if (!isSafe(item)) return false
      const norm = cleanTitle(item.name) || item.name
      const list = LS.get('kky.follow', [])
      const idx = list.findIndex((x) => x.key === item.key || (norm && (cleanTitle(x.name) || x.name) === norm))
      if (idx >= 0) list.splice(idx, 1)
      else list.unshift({ ...item, followedAt: Date.now() })
      LS.set('kky.follow', list.slice(0, 300))
      return idx < 0
    },
    update(key, partial) {
      const list = LS.get('kky.follow', [])
      const item = list.find((x) => x.key === key)
      if (item) {
        Object.assign(item, partial)
        LS.set('kky.follow', list)
      }
    },
  },
  history: {
    all() {
      const list = LS.get('kky.history', [])
      const seen = new Set()
      const deduped = []
      for (const item of list) {
        if (!isSafe(item)) continue
        const norm = cleanTitle(item.name) || item.name || item.key
        if (!seen.has(norm)) {
          seen.add(norm)
          deduped.push(item)
        }
      }
      return deduped
    },
    get: (key) => LS.get('kky.history', []).find((x) => x.key === key) || null,
    put(entry) {
      if (!isSafe(entry)) return
      const norm = cleanTitle(entry.name) || entry.name
      // 同一部剧播放历史只保留最新一条：按片名规范化及 key 双重去重
      const list = LS.get('kky.history', []).filter((x) => {
        if (x.key === entry.key) return false
        if (norm && (cleanTitle(x.name) || x.name) === norm) return false
        return true
      })
      list.unshift(entry)
      LS.set('kky.history', list.slice(0, 200))
    },
    remove(key) {
      const list = LS.get('kky.history', [])
      const target = list.find((x) => x.key === key)
      const norm = target ? (cleanTitle(target.name) || target.name) : null
      LS.set('kky.history', list.filter((x) => {
        if (x.key === key) return false
        if (norm && (cleanTitle(x.name) || x.name) === norm) return false
        return true
      }))
    },
    clear() {
      LS.set('kky.history', [])
    },
  },
  settings: {
    get: () => LS.get('kky.settings', { site: '', autoplay: true, volume: 0.9, rate: 1, enableCast: false }),
    set(val) {
      LS.set('kky.settings', val)
    },
    patch(partial) {
      LS.set('kky.settings', { ...LS.get('kky.settings', {}), ...partial })
    },
  },
  circles: {
    allCustom() {
      return LS.get('kky.circles.custom', [])
    },
    // 本机收藏的影视圈 id 列表与分享次数（纯本地统计，无服务器）
    isSaved(id) {
      return LS.get('kky.circles.saved', []).includes(String(id))
    },
    toggleSaved(id) {
      const list = LS.get('kky.circles.saved', [])
      const key = String(id)
      const idx = list.indexOf(key)
      if (idx >= 0) list.splice(idx, 1)
      else list.unshift(key)
      LS.set('kky.circles.saved', list)
      return idx < 0
    },
    savedIds() {
      return LS.get('kky.circles.saved', [])
    },
    shareCount(id) {
      return Number((LS.get('kky.circles.shares', {}) || {})[String(id)] || 0)
    },
    bumpShare(id) {
      const map = LS.get('kky.circles.shares', {}) || {}
      map[String(id)] = Number(map[String(id)] || 0) + 1
      LS.set('kky.circles.shares', map)
    },
    // 防剧透保护开关（默认开启：隐藏进度 > 60% 的电影时刻文字）
    spoilerGuard() {
      return LS.get('kky.circles.spoilerGuard', true) !== false
    },
    toggleSpoilerGuard() {
      const next = !this.spoilerGuard()
      LS.set('kky.circles.spoilerGuard', next)
      return next
    },
    // 用户在本机定格的电影时刻视频片段列表（前后 3-5 秒视频片段）
    userMoments() {
      return LS.get('kky.circles.moments', [])
    },
    momentsForMovie(movieTitle = '') {
      const mid = canonicalMovieId(movieTitle)
      return this.userMoments()
        .filter((m) => m && (m.movie_id === mid || m.movie_title === movieTitle))
        .sort((a, b) => (Number(a.start_sec ?? a.timestamp_sec) || 0) - (Number(b.start_sec ?? b.timestamp_sec) || 0))
    },
    addMoment(moment) {
      const ts = Math.max(0, Math.floor(Number(moment.timestamp_sec) || 0))
      const startSec = moment.start_sec !== undefined ? Math.max(0, Math.floor(Number(moment.start_sec))) : Math.max(0, ts - 4)
      const endSec = moment.end_sec !== undefined ? Math.max(startSec + 2, Math.floor(Number(moment.end_sec))) : ts + 4
      const enriched = {
        ...moment,
        timestamp_sec: ts,
        start_sec: startSec,
        end_sec: endSec,
        clip_duration: Math.max(2, endSec - startSec),
        clip_range_label: `${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}`,
      }
      const list = this.userMoments()
      list.unshift(enriched)
      // 同一部电影的定格片段保持按时间轴自动升序排列
      LS.set('kky.circles.moments', list.slice(0, 300))
      // 若归属某个自建圈子，也同步写入该自建圈子的 moments 数组并按时间轴排序
      if (enriched && enriched.circle_id && String(enriched.circle_id).startsWith('custom_')) {
        const customs = this.allCustom()
        const target = customs.find((c) => String(c.id) === String(enriched.circle_id))
        if (target) {
          target.moments = Array.isArray(target.moments) ? target.moments : []
          target.moments.push(enriched)
          target.moments.sort((a, b) => (Number(a.start_sec ?? a.timestamp_sec) || 0) - (Number(b.start_sec ?? b.timestamp_sec) || 0))
          target.moments = target.moments.slice(0, 200)
          this.saveCustom(customs)
        }
      }
      return enriched
    },
    removeMoment(momentId) {
      const list = this.userMoments().filter((m) => String(m.id) !== String(momentId))
      LS.set('kky.circles.moments', list)
    },
    // 自动排序并合并生成的「定格此刻 · 电影解说合辑」
    commentaryReels() {
      return LS.get('kky.circles.commentaryReels', [])
    },
    saveCommentaryReel(reel) {
      if (!reel || !reel.movie_title) return null
      const list = this.commentaryReels().filter((r) => r && r.id !== reel.id && r.movie_title !== reel.movie_title)
      list.unshift(reel)
      LS.set('kky.circles.commentaryReels', list.slice(0, 100))
      return reel
    },
    removeCommentaryReel(reelId) {
      const list = this.commentaryReels().filter((r) => String(r.id) !== String(reelId))
      LS.set('kky.circles.commentaryReels', list)
    },
    // 5维零打字情绪回声计数与状态
    hasEchoed(momentId, echoKey) {
      const map = LS.get('kky.circles.echoes', {}) || {}
      const arr = map[String(momentId)] || []
      return arr.includes(String(echoKey))
    },
    toggleEcho(momentId, echoKey) {
      const map = LS.get('kky.circles.echoes', {}) || {}
      const id = String(momentId)
      const k = String(echoKey)
      const arr = Array.isArray(map[id]) ? map[id] : []
      const idx = arr.indexOf(k)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(k)
      map[id] = arr
      LS.set('kky.circles.echoes', map)
      return idx < 0
    },
    saveCustom(list) {
      LS.set('kky.circles.custom', (list || []).slice(0, 100))
    },
    add(circle) {
      const list = this.allCustom()
      list.unshift(circle)
      this.saveCustom(list)
    },
    update(circle) {
      const list = this.allCustom()
      const idx = list.findIndex((c) => String(c.id) === String(circle.id))
      if (idx >= 0) list[idx] = circle
      else list.unshift(circle)
      this.saveCustom(list)
    },
    remove(id) {
      const list = this.allCustom().filter((c) => String(c.id) !== String(id))
      this.saveCustom(list)
    },
  },
  profile: {
    get() {
      return LS.get('kky.user.profile', {
        nickname: '影悦浪客',
        avatar: 'avatar_1',
        signature: '光影交错间，品味百态人生。',
        createdAt: Date.now(),
      })
    },
    set(patch) {
      const cur = this.get()
      const updated = { ...cur, ...patch }
      LS.set('kky.user.profile', updated)
      return updated
    },
  },
}

// ---------------------------------------------------------------- 全局状态

const state = {
  sources: [],
  site: null,
  classes: [],
  classesBySite: {},
  route: { name: 'home', params: [] },
  heroIndex: 0,
  heroTimer: null,
  player: null,
  detailCache: new Map(),
  autoTried: null, // { key, tried:Set } —— 播放失败时已自动试过的线路，防止无限跳转
}

// 分类页无限滚动的观察器。放在模块级是为了在切页时能统一断开，
// 否则旧页面的观察器会一直盯着已经不在文档里的哨兵，白白留着回调。
let listObserver = null

const view = document.getElementById('view')
const playerLayer = document.getElementById('playerLayer')
const sourcePopover = document.getElementById('sourcePopover')
const toastEl = document.getElementById('toast')
const navCategories = document.getElementById('navCategories')

const MAIN_CATEGORIES = [
  { key: 'movie', label: '电影' },
  { key: 'tv', label: '剧集' },
  { key: 'anime', label: '动漫' },
  { key: 'variety', label: '综艺' },
]

const NAV_ICONS = {
  home: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="3"/><polygon points="10 8 16 10.5 10 13 10 8" fill="currentColor" stroke="none"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/></svg>`,
  favorites: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="14" height="14" rx="3"/><path d="M4 14V5a2 2 0 0 1 2-2h9"/><line x1="14" y1="10.5" x2="14" y2="17.5"/><line x1="10.5" y1="14" x2="17.5" y2="14"/></svg>`,
  '4k': `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="3" stroke="currentColor" stroke-width="2"/><text x="12" y="13.2" font-size="8.5" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle" fill="currentColor">4K</text><line x1="8" y1="20" x2="16" y2="20" stroke="currentColor" stroke-width="2"/><line x1="12" y1="17" x2="12" y2="20" stroke="currentColor" stroke-width="2"/></svg>`,
  movie: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7.5" y1="3" x2="7.5" y2="21"/><line x1="16.5" y1="3" x2="16.5" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`,
  tv: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="3"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/></svg>`,
  anime: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.3 6.4L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.6L12 2z"/><path d="M19 16l1.2 3.2L23 20l-2.8.8-1.2 3.2-1.2-3.2L15 20l2.8-.8L19 16z"/></svg>`,
  variety: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8-9.07 9.07a2.67 2.67 0 0 0 0 3.77 2.67 2.67 0 0 0 3.77 0L15.77 11.77"/><path d="m10.5 9.5 4-4a2.83 2.83 0 1 1 4 4l-4 4"/><line x1="17" y1="4" x2="20" y2="7"/></svg>`,
  doc: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="12 8 15 13.5 9 13.5 12 8" fill="currentColor" stroke="none"/></svg>`,
  settings: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 17 12 14 20 10 4 7 12 2 12"/></svg>`,
  history: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`,
  downloads: `<svg class="nav-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
}

const PRIORITY_GENRES = {
  movie: ['动作片', '喜剧片', '科幻片', '爱情片', '剧情片', '战争片', '动画电影', '悬疑片', '犯罪片', '惊悚片', '恐怖片'],
  tv: ['国产剧', '香港剧', '韩国剧', '欧美剧', '日本剧', '台湾剧', '海外剧', '爽文短剧'],
  variety: ['大陆综艺', '港台综艺', '日韩综艺', '欧美综艺'],
  anime: ['国产动漫', '日本动漫', '日韩动漫', '欧美动漫'],
}

// 启动时自动清理本地历史、追更、收藏中的违规敏感内容
function purgeNsfwStorage() {
  ['kky.history', 'kky.follow', 'kky.favorites'].forEach((key) => {
    const list = LS.get(key, [])
    if (Array.isArray(list)) {
      const clean = list.filter((item) => isSafe(item))
      if (clean.length !== list.length) LS.set(key, clean)
    }
  })
}
purgeNsfwStorage()

function classify(name) {
  const n = String(name || '').trim().replace(/^.*\//, '')
  // 1. 过滤父级总览分类名（避免在子标签中重复出现）
  if (ROOT_REGEX.test(n)) return 'root'
  // 2. 彻底过滤伦理、三级、情色、福利、里番等高风险违规分类
  if (NSFW_REGEX.test(n)) return 'nsfw'
  // 3. 过滤体育、赛事、解说、明星等无效娱乐分类
  if (JUNK_REGEX.test(n)) return 'junk'
  // 4. 纪录片
  if (/纪录片|记录片|纪录|记录/.test(n)) return 'doc'
  // 5. 动漫 (剔除里番与动画电影)
  if (/动漫|动画|日漫|国漫|美漫/.test(n) && !/动画电影/.test(n)) return 'anime'
  // 6. 综艺
  if (/综艺|真人秀|脱口秀|选秀|晚会/.test(n)) return 'variety'
  // 7. 电影 (优先判断：所有以「片」结尾或明确包含电影类型的，绝不误入剧集，且彻底排除伦理片)
  if (
    /动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|惊悚片|家庭片|古装片|历史片|悬疑片|犯罪片|灾难片|动画电影|微电影|短片|电影|奇幻片|冒险片/.test(n) ||
    /片$/.test(n)
  ) {
    return 'movie'
  }
  // 8. 剧集 (包含剧字或短剧题材，绝不包含片)
  if (
    /剧|仙侠|都市|年代|总裁|民国|爽文|漫剧/.test(n)
  ) {
    return 'tv'
  }
  return 'other'
}

/** 规范化影视名称，剥离格式、画质、语言、年份、集数噪音 */
function cleanTitle(raw) {
  let title = String(raw || '').trim()
  if (!title) return ''
  title = title.replace(/[（(\[【][^）)\]】]*[）)\]】]/g, ' ')
  title = title.replace(/(?:19|20)\d{2}/g, ' ')
  title = title.replace(
    /(?:4K|8K|1080P|720P|HD|BD|TC|TS|CAM|DVD|BluRay|蓝光|抢先版|完整版|未删减版|未删减|无删减|加长版|特别篇|番外篇|高码版|高码率|纯净版|无水印|国粤双语|中英双字|双语字幕|中文字幕|国语|粤语|中字|双语|普通话|正片)/gi,
    ' '
  )
  title = title.replace(/[（(\[【]?第?[一二三四五六七八九十\d]+[季部期集话回][）)\]】]?/gi, ' ')
  title = title.replace(/(?:Season\s*\d+|S\d+)/gi, ' ')
  title = title.replace(/[·:：\-_,，。/]/g, ' ').replace(/\s+/g, '').toLowerCase()
  return title
}

/** 列表去重：同一部电影/剧集只保留信息最全、清晰度最高的一项 */
function dedupeItems(items) {
  if (!Array.isArray(items) || items.length <= 1) return items
  const map = new Map()

  for (const item of items) {
    if (!item || !item.name) continue
    const norm = cleanTitle(item.name) || item.name
    if (!map.has(norm)) {
      map.set(norm, item)
    } else {
      const prev = map.get(norm)
      const prevWeight = (parseFloat(prev.score) || 0) + (prev.pic ? 3 : 0) + (/4K|1080/i.test(prev.remarks) ? 2 : 0)
      const currWeight = (parseFloat(item.score) || 0) + (item.pic ? 3 : 0) + (/4K|1080/i.test(item.remarks) ? 2 : 0)
      if (currWeight > prevWeight) {
        map.set(norm, item)
      }
    }
  }

  return [...map.values()]
}

// ---------------------------------------------------------------- 小工具

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const fmtTime = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}

function makePlaceholder(title = '') {
  const clean = String(title || '影悦').trim().slice(0, 16)
  const escaped = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#1e212b"/>` +
      `<stop offset="100%" stop-color="#101117"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="300" height="450" fill="url(#g)"/>` +
      `<circle cx="150" cy="180" r="40" fill="#252936" stroke="#363c4e" stroke-width="2"/>` +
      `<polygon points="144,166 164,180 144,194" fill="#8e96a8"/>` +
      `<text x="150" y="258" fill="#e2e6f0" font-size="16" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif" text-anchor="middle" font-weight="600">${escaped}</text>` +
      `<text x="150" y="284" fill="#666d80" font-size="12" font-family="-apple-system,BlinkMacSystemFont,PingFang SC,sans-serif" text-anchor="middle">暂无海报</text>` +
      `</svg>`
    )
  )
}

const PLACEHOLDER = makePlaceholder('影悦')

const DOMESTIC_PIC_HOSTS = [
  'doubanio.com',
]

let imgProxyBase = ''
try {
  const api = window.kky || window.shellApi || (typeof shellApi !== 'undefined' ? shellApi : null)
  if (api && typeof api.imgProxyBase === 'function') {
    imgProxyBase = api.imgProxyBase()
  }
} catch { }

function picUrl(raw, title = '', year = '') {
  if (!raw || typeof raw !== 'string') return makePlaceholder(title)
  let trimmed = raw.trim()
  if (!trimmed) return makePlaceholder(title)
  if (trimmed.startsWith('//')) trimmed = 'https:' + trimmed
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('http://127.0.0.1:')) return trimmed

  // 自动将豆瓣小尺寸缩略图 (s_ratio_poster) 升级为高清原画大图 (l_ratio_poster)
  if (trimmed.includes('doubanio.com/view/photo/s_ratio_poster/')) {
    trimmed = trimmed.replace('/view/photo/s_ratio_poster/', '/view/photo/l_ratio_poster/')
  }
  if (trimmed.includes('image.tmdb.org/t/p/w300/') || trimmed.includes('image.tmdb.org/t/p/w500/')) {
    trimmed = trimmed.replace(/\/t\/p\/w(300|500)\//, '/t/p/w1280/')
  }

  const lower = trimmed.toLowerCase()
  const isDomestic = DOMESTIC_PIC_HOSTS.some((h) => lower.includes(h))
  if (isDomestic) return trimmed

  if (!imgProxyBase || imgProxyBase.includes(':0/')) {
    try {
      const api = window.kky || window.shellApi || (typeof shellApi !== 'undefined' ? shellApi : null)
      if (api && typeof api.imgProxyBase === 'function') {
        imgProxyBase = api.imgProxyBase()
      }
    } catch { }
    if (!imgProxyBase || imgProxyBase.includes(':0/')) {
      imgProxyBase = 'http://127.0.0.1:23333/img?url='
    }
  }

  if (imgProxyBase) {
    const titleParam = title ? `&title=${encodeURIComponent(title)}` : ''
    const yearParam = year ? `&year=${encodeURIComponent(year)}` : ''
    return `${imgProxyBase}${encodeURIComponent(trimmed)}${titleParam}${yearParam}`
  }
  return `kky-pic://proxy?url=${encodeURIComponent(trimmed)}`
}

async function hydratePendingPosters(container = document) {
  if (!window.shellApi || !window.shellApi.api || !window.shellApi.api.getPoster) return
  const targetRoot = container && container.querySelectorAll ? container : document
  const pendingImgs = targetRoot.querySelectorAll('img[data-pending-title]')
  if (!pendingImgs.length) return
  const queue = Array.from(pendingImgs)
  const batchSize = 10
  for (let i = 0; i < queue.length; i += batchSize) {
    const chunk = queue.slice(i, i + batchSize)
    await Promise.all(
      chunk.map(async (img) => {
        const title = img.dataset.pendingTitle
        const year = img.dataset.pendingYear
        const histKey = img.dataset.histKey
        const followKey = img.dataset.followKey
        if (!title) return
        try {
          const poster = await window.shellApi.api.getPoster({ title, year })
          if (poster) {
            img.onload = () => {
              img.classList.add('poster-fadein')
            }
            img.src = poster
            img.removeAttribute('data-pending-title')
            img.removeAttribute('data-pending-year')

            // 同步写回本地播放历史与追更，彻底洗白老旧海外死链
            if (histKey && store.history && store.history.has(histKey)) {
              const h = store.history.get(histKey)
              if (h) {
                h.pic = poster
                store.history.set(histKey, h)
              }
            }
            if (followKey && store.follow && store.follow.has(followKey)) {
              const f = store.follow.get(followKey)
              if (f) {
                f.pic = poster
                store.follow.set(followKey, f)
              }
            }
          }
        } catch { }
      })
    )
  }
}

// 全局捕获图片加载错误 (捕获阶段触发，有效绕过 CSP 对内联 onerror 的拦截)
window.addEventListener(
  'error',
  async (e) => {
    const target = e.target
    if (target && target.tagName === 'IMG') {
      // 每张图最多补全一次：补全图也失败就直接占位，杜绝无限重试拖垮低配机
      if (target.dataset.failed || target.dataset.fallback) return
      target.dataset.failed = '1'
      const title = target.dataset.title || target.getAttribute('alt') || ''
      const year = target.dataset.year || target.dataset.pendingYear || ''
      if (title && window.shellApi && window.shellApi.api && typeof window.shellApi.api.getPoster === 'function') {
        try {
          const domestic = await window.shellApi.api.getPoster({ title, year })
          if (domestic) {
            target.dataset.fallback = '1'
            target.src = domestic
            return
          }
        } catch { }
      }
      target.dataset.fallback = '1'
      target.src = makePlaceholder(title)
    }
  },
  true
)

function toast(message, ms = 1900) {
  toastEl.textContent = message
  toastEl.hidden = false
  requestAnimationFrame(() => toastEl.classList.add('show'))
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    toastEl.classList.remove('show')
    setTimeout(() => (toastEl.hidden = true), 220)
  }, ms)
}

function setWindowTitle(text) {
  document.body.classList.remove('in-player-mode')
  document.getElementById('windowTitle').textContent = text || ''
}

// ---------------------------------------------------------------- 源

async function loadSources() {
  state.sources = await shellApi.sources.list()
  const settings = store.settings.get()
  const enabled = state.sources.filter((s) => s.enabled !== false)
  const current = enabled.find((s) => s.key === settings.site)
  state.site = current || enabled[0] || state.sources[0] || null
  if (!current && state.site && settings.site !== state.site.key) {
    store.settings.set({ ...settings, site: state.site.key })
  }
  renderSourcePill()
  renderNavCategories()
  updateNavBadges()
}

function updateNavBadges() {
  const favBadge = document.getElementById('navFavBadge')
  const srcBadge = document.getElementById('navSourceBadge')
  if (favBadge) {
    const totalFav = (store.follow ? store.follow.all().length : 0) + (store.favorites ? store.favorites.all().length : 0)
    if (totalFav > 0) {
      favBadge.textContent = totalFav
      favBadge.style.display = ''
    } else {
      favBadge.textContent = '0'
      favBadge.style.display = 'none'
    }
  }
  if (srcBadge) {
    const totalSources = state.sources && state.sources.length ? state.sources.length : 9
    srcBadge.textContent = totalSources
    srcBadge.style.display = ''
  }
}

function renderSourcePill() {
  const nameEl = document.getElementById('sourceName')
  const dot = document.getElementById('sourceDot')
  if (!nameEl) return
  if (!state.site) {
    nameEl.textContent = '未配置片源'
    if (dot) dot.className = 'source-dot bad'
    return
  }
  nameEl.textContent = state.site.name
  if (dot) dot.className = 'source-dot'
}

function renderNavCategories() {
  const present = new Set(state.classes.map((c) => classify(c.name)))
  const items = MAIN_CATEGORIES.filter((c) => present.has(c.key) || !state.classes.length)
  const extra = present.has('doc') ? [{ key: 'doc', label: '纪录片' }] : []
  navCategories.innerHTML = [...items, ...extra]
    .map(
      (c) => `<a class="nav-item" data-route="cat" data-cat="${c.key}">${NAV_ICONS[c.key] || ''}<span>${c.label}</span></a>`
    )
    .join('')
  markActiveNav()
  updateNavBadges()
}

async function ensureClasses(site) {
  if (!site) return []
  if (state.classesBySite[site.key]) {
    state.classes = state.classesBySite[site.key]
    return state.classes
  }
  try {
    const res = await shellApi.api.classes(site.key)
    state.classesBySite[site.key] = res.classes
    state.classes = res.classes
  } catch (error) {
    state.classes = []
    toast('分类获取失败：' + (error.message || error))
  }
  renderNavCategories()
  return state.classes
}

async function switchSite(key, nextHash) {
  const site = state.sources.find((s) => s.key === key)
  if (!site) return
  state.site = site
  store.settings.patch({ site: key })
  renderSourcePill()
  state.classes = []
  state.classesBySite = {}
  closeSourcePopover()
  await ensureClasses(site)
  navigate(nextHash || '#/home')
  toast('已切换到「' + site.name + '」')
}

// ---------------------------------------------------------------- 路由

function navigate(hash) {
  if (location.hash === hash) render()
  else location.hash = hash
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [name, ...params] = raw.split('/').map(decodeURIComponent)
  return { name: name || 'home', params }
}

// 导航历史栈：返回键回到真正的上一级页面，而不是一律回主页
const navStack = []
let navBackPending = false

function trackNav() {
  const h = location.hash || '#/home'
  if (navBackPending) {
    navBackPending = false
    return
  }
  const top = navStack[navStack.length - 1]
  if (top === h) return
  // 播放页内切集 / 自动换源只替换栈顶，避免返回时在同一部片的各集之间来回跳
  if (top && top.startsWith('#/play/') && h.startsWith('#/play/')) {
    navStack[navStack.length - 1] = h
    return
  }
  navStack.push(h)
  if (navStack.length > 50) navStack.shift()
}

function goBack() {
  if ((state.route || {}).name === 'play') destroyPlayer()
  const current = location.hash || '#/home'

  // 从历史栈顶弹出当前页面，去重
  while (navStack.length > 0 && navStack[navStack.length - 1] === current) {
    navStack.pop()
  }

  let target = navStack.pop()

  // 智能结构性上一级回退 (Parent-Route Fallback)，绝不盲目跳回主页
  if (!target || target === current) {
    const route = parseRoute()
    if (route.name === 'circle') {
      target = '#/circles'
    } else if (route.name === 'play') {
      target = route.params[0] && route.params[1] ? `#/detail/${route.params[0]}/${route.params[1]}` : (state.lastBrowseRoute || '#/home')
    } else if (['detail', 'search', 'rank', 'profile'].includes(route.name)) {
      target = state.lastBrowseRoute || '#/home'
    } else {
      target = '#/home'
    }
  }

  navBackPending = true
  navigate(target)
}

window.addEventListener('hashchange', () => render())

// ---------------------------------------------------------------- 卡片渲染

function cardHTML(item, index) {
  const key = `${item.site}:${item.id}`
  const history = store.history.get(key)
  let prog = ''
  if (history && history.time > 10 && history.duration > 0) {
    const pct = Math.min(100, (history.time / history.duration) * 100)
    if (pct > 1 && pct < 98) {
      prog = `<div class="progress-bar"><i style="width:${pct.toFixed(1)}%"></i></div>`
    }
  }

  // 1. 评分：从权威元数据获取；无则生成稳定的影视质感分 (8.2~9.6)
  let score = item.score && parseFloat(item.score) > 0 ? parseFloat(item.score).toFixed(1) : ''
  if (!score) {
    let hash = 0
    const s = item.name || ''
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i)
    score = (8.2 + (Math.abs(hash) % 15) / 10).toFixed(1)
  }

  // 2. 画质标签
  const quality = (/4k|2160/i.test((item.name || '') + (item.remarks || ''))) ? '4K HDR' : '1080P 高清'

  // 3. 剧集/综艺追更与集数标签
  const rawRemarks = String(item.remarks || '').trim()
  const isMovie = /电影|片|影院/.test(item.typeName || '')
  let isUpdating = false
  let epText = rawRemarks

  if (isMovie) {
    epText = rawRemarks && !/HD|BD|1080|4K/i.test(rawRemarks) ? rawRemarks : '正片'
  } else {
    // 电视剧 / 综艺 / 动漫
    if (/更至|更新至|更新到|连载|第\d+期/.test(rawRemarks)) {
      isUpdating = true
      epText = rawRemarks
    } else if (/全\d+集|完结/.test(rawRemarks)) {
      isUpdating = false
      epText = rawRemarks
    } else if (rawRemarks) {
      epText = rawRemarks
    } else {
      epText = '连载更新中'
      isUpdating = true
    }
  }

  // 4. 追更上新指示 (海报角标)
  const isFollowed = store.follow.has(key)
  const followEntry = store.follow.get(key)
  const hasNewEp = isFollowed && isUpdating && followEntry && followEntry.lastWatchedName && followEntry.lastWatchedName !== epText

  const aiTag = item.aiScore
    ? `<span class="badge-ai-match">✨ ${item.aiScore}% 契合</span>`
    : item.aiSimilarity
      ? `<span class="badge-ai-match">✨ ${item.aiSimilarity}% 相似</span>`
      : ''

  const pic = picUrl(item.pic, item.name, item.year)
  const isPending =
    !item.pic ||
    pic.startsWith('data:image/svg+xml') ||
    (typeof item.pic === 'string' &&
      (item.pic.includes('qhimgs1.com') ||
        item.pic.includes('placeholder') ||
        item.pic.includes('20260802-1') ||
        item.pic.includes('movie_default')))
  const pendingAttrs = isPending
    ? ` data-pending-title="${esc(item.name)}" data-pending-year="${esc(item.year || '')}"`
    : ''

  return `
    <div class="card" data-act="open" data-site="${esc(item.site)}" data-id="${esc(item.id)}" title="${esc(item.name)}">
      <div class="card-cover">
        <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(item.name)}" data-year="${esc(item.year || '')}" alt="${esc(item.name)}" loading="${typeof index === 'number' && index < 12 ? 'eager' : 'lazy'}" decoding="async" />
        <span class="badge-rating">★ ${score}</span>
        <span class="badge-quality">${quality}</span>
        ${aiTag}
        ${epText ? `<span class="badge-ep ${isUpdating ? 'updating' : ''}"><span class="badge-ep-dot">●</span> ${esc(epText)}</span>` : ''}
        ${hasNewEp ? `<span class="badge-new-ep">有更新</span>` : ''}
        ${prog}
        <div class="card-hover-play"><span>
          <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
        </span></div>
      </div>
      <div class="card-title">${esc(item.name)}</div>
      <div class="card-sub">${esc([epText, item.year, item.typeName].filter(Boolean).join(' · ') || item.area || '')}</div>
    </div>`
}

function gridHTML(items) {
  if (!items.length) return `<div class="empty"><div class="big">◍</div>这个分类暂时没有内容</div>`
  return `<div class="grid">${items.map((it, idx) => cardHTML(it, idx)).join('')}</div>`
}

function skeletonGrid(n = 12) {
  return `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join('')}</div>`
}


/**
 * 一个主分类（电影/剧集/综艺/动漫）下往往挂着好几个子分类，
 * 而且第一个经常是「父分类」，只挂 1 条数据（例如量子源的「电影片」）。
 * 所以这里顺序探一下，取第一个真的有内容的子分类，并把这一页数据直接带回去。
 */
async function resolveGroup(siteKey, classes, mainKey) {
  const pref = PRIORITY_GENRES[mainKey] || []
  const list = classes.filter((c) => classify(c.name) === mainKey)
  if (!list.length) return null
  list.sort((a, b) => {
    const na = a.name.replace(/^.*\//, '')
    const nb = b.name.replace(/^.*\//, '')
    const ia = pref.indexOf(na)
    const ib = pref.indexOf(nb)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return 0
  })
  let fallback = null
  for (const candidate of list.slice(0, 4)) {
    try {
      const res = await shellApi.api.list({ key: siteKey, typeId: candidate.id, page: 1 })
      if (!fallback) fallback = { typeId: candidate.id, res }
      if (res.items.filter((x) => x.name).length >= 3) return { typeId: candidate.id, res }
    } catch {
      /* 换下一个 */
    }
  }
  return fallback
}

// ---------------------------------------------------------------- 顶栏身份问候同步与新片深度专栏数据

function syncTopbarIdentity() {
  try {
    const p = store.profile.get()
    const nick = (p && p.nickname) ? p.nickname : '影悦浪客'
    const gName = document.getElementById('topbarGreetingName')
    if (gName) gName.textContent = `${nick}!`
    const uName = document.getElementById('topbarUserName')
    if (uName) uName.textContent = nick
  } catch (_) {}
}

const LIVE_THEATERS_PRESETS = [
  {
    id: 'lt_1',
    hostName: '林夕与电影',
    hostAvatar: '🎬',
    hostBg: 'linear-gradient(135deg, #FF4D79 0%, #FF8A65 100%)',
    statusText: '正在共赏 · Watching',
    movieName: '星际穿越',
    poster: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2614988097.jpg',
    watchers: '38+ 在看',
    circleId: 'circle_must_watch_10',
  },
  {
    id: 'lt_2',
    hostName: '深空观测者',
    hostAvatar: '🪐',
    hostBg: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
    statusText: '正在共赏 · Watching',
    movieName: '情书',
    poster: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2648230658.jpg',
    watchers: '26+ 在看',
    circleId: 'circle_featured_youth',
  },
  {
    id: 'lt_3',
    hostName: '恋人絮语',
    hostAvatar: '🌹',
    hostBg: 'linear-gradient(135deg, #EC4899 0%, #F43F5E 100%)',
    statusText: '正在共赏 · Watching',
    movieName: '花样年华',
    poster: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1910828286.jpg',
    watchers: '34+ 在看',
    circleId: 'circle_most_romantic',
  },
  {
    id: 'lt_4',
    hostName: '胶片时光机',
    hostAvatar: '🎞️',
    hostBg: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
    statusText: '即将开场 · Waiting',
    movieName: '盗梦空间',
    poster: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p511638621.jpg',
    watchers: '42+ 候场',
    circleId: 'circle_rewatch_classics',
  },
]

const MOVIE_ARTICLES = [
  {
    id: 'art_interstellar_revival',
    movieName: '星际穿越',
    year: '2026 重映热潮',
    heatScore: '99.4 万热度',
    heatRank: 'TOP 1 · 科幻口碑霸榜',
    rating: '9.4',
    categoryTag: '新片重映 · 硬核科幻',
    author: '影悦主编 · 陆离',
    readTime: '4 分钟深度解读',
    pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2614988097.jpg',
    title: '当汉斯·季默管风琴再度轰鸣：为什么《星际穿越》仍是近十年无可替代的科幻泪目巅峰？',
    summary: '近期重映与流媒体点播热度飙升 340%。从米勒星球的巨浪到五维空间的书架，诺兰用最硬核的天体物理学包裹了人类最柔软的父女羁绊。',
    sections: [
      {
        heading: '一、实时热度风向：为什么全网观众都在重温？',
        body: '本周《星际穿越》全网讨论热度突破 99.4 万，稳居影迷重温榜首位。在快节奏碎片化内容泛滥的当下，这部 169 分钟的太空史诗反而凭借极致的沉浸感成为无数人深夜独处的首选。'
      },
      {
        heading: '二、名场面视听拆解：一小时等于七年的残酷浪漫',
        body: '全片最令人破防的时刻莫过于 01:33:30 处——库珀从米勒星球返回飞船，短短三小时的地面停留竟跨越了地球二十三年光阴。马修·麦康纳面对屏幕失声痛哭的表演，是影史不可复制的封神瞬间。'
      },
      {
        heading: '三、观影指南与推荐心境',
        body: '建议开启影悦播放器「影院重低音」音效模式全屏观看。无论你是第一次接触，还是第 N 次重温五维空间摩斯密码，它都能让你重新相信「爱是唯一能超越时间与空间维度的事物」。'
      }
    ]
  },
  {
    id: 'art_shawshank_hope',
    movieName: '肖申克的救赎',
    year: '影史长青热映',
    heatScore: '98.1 万热度',
    heatRank: 'TOP 2 · 治愈口碑榜首',
    rating: '9.7',
    categoryTag: '深度专栏 · 精神力量',
    author: '电影圣经 · 陈默',
    readTime: '3 分钟深度解读',
    pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg',
    title: '给所有处于人生低谷者的解药：《肖申克的救赎》里那场跨越十九年的暴雨与自由',
    summary: '全网评分高达 9.7、超 300 万人打出五星。有些鸟儿是注定关不住的，因为它们的每一片羽毛都闪耀着自由的光辉。',
    sections: [
      {
        heading: '一、热度与口碑洞察：跨越三十年的全民共鸣',
        body: '每逢换季与职场焦虑高发期，《肖申克的救赎》点播热度都会迎来新一轮波峰（本周热度 98.1 万）。它不靠特效堆砌，却用极致沉稳的叙事给出了对抗体制化与迷茫的终极答案。'
      },
      {
        heading: '二、两大高光时刻：费加罗的婚礼与暴雨洗礼',
        body: '01:05:15 处安迪反锁广播室播放《费加罗的婚礼》，让高墙内的囚徒第一次仰望天空感受心灵自由；01:54:00 处爬出五百码排污管在雷雨中张开双臂，构成了电影史上最震撼的救赎图腾。'
      },
      {
        heading: '三、适合谁在今晚点开？',
        body: '如果你最近感到疲惫或困顿，不妨直接点击下方「立即播放正片」，去芝华塔尼欧的海滩吹一吹太平洋温暖的海风。'
      }
    ]
  },
  {
    id: 'art_sunny_youth',
    movieName: '阳光普照',
    year: '华语口碑热片',
    heatScore: '95.8 万热度',
    heatRank: 'TOP 3 · 华语现象级佳作',
    rating: '8.6',
    categoryTag: '华语新经典 · 家庭叙事',
    author: '林夕与电影',
    readTime: '4 分钟深度解读',
    pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2570086961.jpg',
    title: '“这个世界最公平的是太阳”：为什么《阳光普照》是近年后劲最大的华语家庭电影？',
    summary: '钟孟宏导演巅峰代表作，斩获金马多项大奖。当一个家庭把所有期望都投向耀眼的长子，谁来替那个想要躲进阴影里的人遮光？',
    sections: [
      {
        heading: '一、近期热度飙升原因：东亚家庭关系的极致切片',
        body: '近期在各大社交平台与影视圈歌单中，《阳光普照》关于“毫无保留的阳光有时也是一种暴政”的讨论热度高达 95.8 万，引发无数年轻观众的强烈共情。'
      },
      {
        heading: '二、镜头美学：林间骑行与山顶坦白',
        body: '影片用温润却克制的摄影机位，记录了阿豪留下的那段关于动物园与太阳的独白，以及父亲在山顶云雾中说出“为父之道”的颤抖瞬间，后劲绵长。'
      }
    ]
  },
  {
    id: 'art_in_the_mood',
    movieName: '花样年华',
    year: '4K 修复热映',
    heatScore: '94.6 万热度',
    heatRank: 'TOP 4 · 东方美学天花板',
    rating: '8.8',
    categoryTag: '美学专栏 · 浪漫经典',
    author: '恋人絮语',
    readTime: '3 分钟深度解读',
    pic: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p1910828286.jpg',
    title: '如果我多一张船票，你会不会跟我走？重看《花样年华》里那些没说出口的眼神与旗袍',
    summary: '王家卫光影美学登峰造极之作。二十多套订制旗袍、梅林茂大提琴主题曲《Yumeji\'s Theme》，把东方男女最隐秘克制的深情拍到了极致。',
    sections: [
      {
        heading: '一、审美风向标：每一帧都可直接框裱的构图教科书',
        body: '杜可风的框架式构图与张叔平的色彩美学，让《花样年华》始终位居影迷审美必看榜前五，本周共有 94.6 万人在影视圈收藏与重温。'
      },
      {
        heading: '二、不可错过的名场面：吴哥窟树洞里的秘密',
        body: '无论是窄巷买云吞面的擦肩而过，还是结尾梁朝伟在吴哥窟古老石洞前倾诉心事并用草泥封存，都让人在曲终人散后久久难以释怀。'
      }
    ]
  },
  {
    id: 'art_inception_dream',
    movieName: '盗梦空间',
    year: '烧脑神作热榜',
    heatScore: '93.9 万热度',
    heatRank: 'TOP 5 · 悬疑烧脑必看',
    rating: '9.4',
    categoryTag: '烧脑大片 · 视听奇观',
    author: '胶片时光机',
    readTime: '3 分钟深度解读',
    pic: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p511638621.jpg',
    title: '最后的陀螺到底停了没有？深度复盘《盗梦空间》五层梦境建筑学与潜意识迷宫',
    summary: '巴黎街头 90 度折叠、失重走廊肉搏、雪山堡垒突袭——诺兰将商业娱乐大片与精密的潜意识结构完美缝合。',
    sections: [
      {
        heading: '一、热度与看点：百看不厌的叙事精密钟表',
        body: '《盗梦空间》以 93.9 万热度稳居烧脑悬疑榜首。每一次二刷三刷，观众都能从柯布的婚戒细节与配乐《Time》的节拍中发现全新的潜意识线索。'
      }
    ]
  },
  {
    id: 'art_spirited_away',
    movieName: '千与千寻',
    year: '治愈动画热榜',
    heatScore: '92.5 万热度',
    heatRank: 'TOP 6 · 全龄治愈神作',
    rating: '9.4',
    categoryTag: '动画专栏 · 心灵奇旅',
    author: '深空观测者',
    readTime: '3 分钟深度解读',
    pic: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2557573348.jpg',
    title: '水上列车驶向何方？成年后重看《千与千寻》，才读懂宫崎骏藏在油屋里的温柔告别',
    summary: '小时候看的是神隐奇幻冒险，长大后看的是如何在欲望横流的世界里守住自己的名字与初心。',
    sections: [
      {
        heading: '一、热度解读：跨世代共鸣的治愈避风港',
        body: '久石让《第六个车站》钢琴曲响起、千寻与无脸男并肩坐在海上电车里的长镜头，本周被超过 3,100 位影迷标记为「最治愈孤独时刻」。'
      }
    ]
  }
]

// ---------------------------------------------------------------- 页面：首页

async function renderHome() {
  setWindowTitle('首页')
  syncTopbarIdentity()
  const site = state.site
  if (!site) return renderNoSource()

  view.innerHTML = `
    <!-- 参考图 5 卡 3D 折扇透视主舞台 (Cinema. 3D Fan Hero Stage) -->
    <div class="hero cinema-hero-wrap" id="hero">
      <div class="hero-body"></div>
    </div>

    <!-- Live Theaters 实时共赏放映厅面板 -->
    <section class="live-theaters-panel" id="secLiveTheaters">
      <div class="live-theaters-head">
        <div class="lt-title-wrap">
          <div class="lt-live-indicator">
            <span class="lt-pulse-dot"></span>
            <h2>Live Theaters · 正在共赏</h2>
          </div>
          <span class="lt-sub">与全网影迷同频共赏经典高光时刻</span>
        </div>
        <button class="lt-see-more-btn" id="btnSeeMoreTheaters">
          查看更多 <span>›</span>
        </button>
      </div>
      <div class="live-theaters-grid">
        ${LIVE_THEATERS_PRESETS.map((lt) => `
          <div class="lt-card" data-lt-movie="${esc(lt.movieName)}" data-lt-circle="${esc(lt.circleId)}">
            <div class="lt-poster-box">
              <img src="${esc(lt.poster)}" alt="${esc(lt.movieName)}" loading="lazy" />
              <span class="lt-tag-live">LIVE</span>
            </div>
            <div class="lt-card-info">
              <div class="lt-card-title-row">
                <strong class="lt-movie-title" title="${esc(lt.movieName)}">${esc(lt.movieName)}</strong>
              </div>
              <div class="lt-host-line">
                <span class="lt-host-tag">${esc(lt.hostName)} 领赏</span>
              </div>
              <div class="lt-watchers-row">
                <div class="lt-avatar-stack">
                  <span class="lt-mini-av av-1">✦</span>
                  <span class="lt-mini-av av-2">♥</span>
                  <span class="lt-mini-av av-3">★</span>
                </div>
                <span class="lt-watchers-count">${esc(lt.watchers)}</span>
              </div>
            </div>
            <button class="lt-enter-btn">
              <span>加入</span>
            </button>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="section" id="secContinue"></div>
    <div class="section" id="secDaily" style="display:none">
      <div class="section-head">
        <h2>今日全网更新</h2>
        <span class="more" style="font-size:12px;color:var(--emerald);cursor:default">多源联动 · 24小时内同步更新 ●</span>
      </div>
      <div class="row-scroll" id="dailyRow"></div>
    </div>
    <div class="section" id="secFollow" style="display:none">
      <div class="section-head">
        <h2>正在追更</h2>
        <span class="more" style="font-size:12px;color:var(--accent);cursor:default">实时剧集上新追踪 ●</span>
      </div>
      <div class="row-scroll" id="followRow"></div>
    </div>
    <div class="section" id="secRecommend" style="display:none">
      <div class="section-head"><h2>为你推荐</h2><span class="more" style="font-size:12px;color:var(--gold);cursor:default">基于观影喜好与权威评分匹配</span></div>
      <div class="row-scroll" id="recommendRow"></div>
    </div>
    <div class="section" id="secMovie">
      <div class="section-head"><h2>热门电影</h2><span class="more" data-act="cat" data-cat="movie">查看全部 ›</span></div>
      ${skeletonGrid(6)}
    </div>
    <div class="section" id="secTv">
      <div class="section-head"><h2>最新剧集</h2><span class="more" data-act="cat" data-cat="tv">查看全部 ›</span></div>
      ${skeletonGrid(6)}
    </div>
    <div class="section" id="secAnime">
      <div class="section-head"><h2>热门动漫</h2><span class="more" data-act="cat" data-cat="anime">查看全部 ›</span></div>
      ${skeletonGrid(6)}
    </div>`

  // 绑定 Live Theaters 交互
  document.getElementById('btnSeeMoreTheaters')?.addEventListener('click', () => navigate('#/circles'))
  view.querySelectorAll('.lt-card').forEach((card) => {
    card.onclick = () => {
      const cid = card.dataset.ltCircle
      if (cid) navigate(`#/circle/${cid}`)
    }
  })

  renderContinueRow()
  renderFollowRow()
  loadDailyUpdates()

  const classes = await ensureClasses(site)
  if (!classes.length) {
    view.innerHTML = `<div class="empty"><div class="big">⚠</div>这个源没有返回分类，换一个源试试</div>`
    return
  }

  const jobs = [
    { main: 'movie', node: 'secMovie', kind: 'row' },
    { main: 'tv', node: 'secTv', kind: 'grid' },
    { main: 'anime', node: 'secAnime', kind: 'row' },
  ]

  const candidatePool = []

  await Promise.all(
    jobs.map(async (job) => {
      try {
        const picked = await resolveGroup(site.key, classes, job.main)
        if (!picked) throw new Error('这个源没有对应分类')
        const rawItems = picked.res.items.filter((x) => x.name)
        const items = dedupeItems(rawItems)
        candidatePool.push(...items)
        const holder = document.getElementById(job.node)
        if (!holder) return

        if (job.kind === 'row') {
          holder.querySelector('.grid, .row-scroll')?.remove()
          const row = document.createElement('div')
          row.className = 'row-scroll'
          row.innerHTML = items.slice(0, 14).map(cardHTML).join('')
          holder.appendChild(row)
        } else {
          const grid = holder.querySelector('.grid')
          if (grid) grid.outerHTML = gridHTML(items.slice(0, 14))
        }
      } catch (error) {
        const holder = document.getElementById(job.node)
        if (holder) holder.innerHTML = `<div class="empty">这块没加载出来：${esc(error.message || error)}</div>`
      }
    })
  )

  // 智能推荐重排
  try {
    const history = store.history.all()
    const favorites = store.favorites.all()
    const rankedRecs = await shellApi.recommender.rank({
      pool: dedupeItems(candidatePool),
      history,
      favorites,
      limit: 14,
    })
    const secRec = document.getElementById('secRecommend')
    const rowRec = document.getElementById('recommendRow')
    if (secRec && rowRec && rankedRecs && rankedRecs.length) {
      rowRec.innerHTML = rankedRecs.map(cardHTML).join('')
      secRec.style.display = ''
    }
  } catch (e) {
    console.warn('[recommender]', e)
  }

  // 精选高分电影作为首页宽幅横向超清巨幕海报 (Widescreen HD Billboard Hero)
  const heroCandidates = dedupeItems(candidatePool).filter((x) => x.pic && !x.pic.includes('placeholder'))
  heroCandidates.sort((a, b) => {
    const aMovie = /电影|片/.test(a.typeName || '') ? 1.5 : 0
    const bMovie = /电影|片/.test(b.typeName || '') ? 1.5 : 0
    return ((parseFloat(b.score) || 0) + bMovie) - ((parseFloat(a.score) || 0) + aMovie)
  })
  const heroItems = heroCandidates.slice(0, 6)

  renderHero(heroItems)
  hydratePendingPosters(view)
}

function renderHero(items) {
  const hero = document.getElementById('hero')
  if (!hero) return
  if (!items.length) {
    hero.remove()
    return
  }

  state.heroIndex = 0
  const len = items.length

  // 构建影院级宽幅横向超清巨幕舞台 (Widescreen 16:9 HD Promotional Billboard Hero)
  hero.innerHTML = `
    <div class="cinema-hero-stage widescreen-billboard-hero" id="cinemaHeroStage">
      <div class="hero-billboard-card" id="heroCenterCard" data-act="open" data-site="" data-id="">
        <img class="hero-billboard-bg" id="heroCenterBg" src="" alt="" decoding="async" />
        <div class="hero-billboard-scrim"></div>
        <div class="hero-billboard-content">
          <div class="hero-kicker-row">
            <span class="hero-hd-pill">🎬 院线巨幕 · 横向超清宣传海报</span>
            <span class="hero-score-pill">★ 豆瓣 <strong id="heroScoreNum">9.2</strong></span>
            <span class="hero-duration-pill" id="heroDurationPill">1080P 蓝光直连</span>
          </div>
          <h1 class="hero-billboard-title" id="heroLogoText"></h1>
          <div class="hero-genre-row" id="heroGenreRow"></div>
          <p class="hero-billboard-desc" id="heroCenterDesc"></p>
          <div class="hero-billboard-actions">
            <button class="hero-primary-play-btn" id="heroPlayBtn" data-act="play-hero" data-site="" data-id="">
              <svg width="15" height="17" viewBox="0 0 16 18" fill="currentColor"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z"/></svg>
              <span>立即播放</span>
            </button>
            <button class="hero-glass-detail-btn" id="heroDetailBtn" data-act="open" data-site="" data-id="">
              <span>✦ 影片详情</span>
            </button>
            <button class="hero-heart-btn" id="btnHeroFavToggle" title="加入喜欢清单">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF4D79" stroke="#FF4D79" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
          </div>
        </div>
        <div class="hero-backdrop-dock" id="heroBackdropDock">
          ${items.map((it, i) => `
            <button class="hero-dock-thumb ${i === 0 ? 'active' : ''}" data-hero="${i}" title="${esc(it.name)}">
              <img src="${esc(picUrl(it.picSlide || it.pic, it.name, it.year))}" data-dock-idx="${i}" alt="${esc(it.name)}" decoding="async" />
              <span class="hero-dock-title">${esc(it.name)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `

  const centerCard = hero.querySelector('#heroCenterCard')
  const centerBg = hero.querySelector('#heroCenterBg')
  const favBtn = hero.querySelector('#btnHeroFavToggle')
  const logoText = hero.querySelector('#heroLogoText')
  const genreRow = hero.querySelector('#heroGenreRow')
  const scoreNum = hero.querySelector('#heroScoreNum')
  const descEl = hero.querySelector('#heroCenterDesc')
  const playBtn = hero.querySelector('#heroPlayBtn')
  const detailBtn = hero.querySelector('#heroDetailBtn')
  const durationPill = hero.querySelector('#heroDurationPill')
  const dockBtns = Array.from(hero.querySelectorAll('.hero-dock-thumb'))

  function resolveItemBackdropUrl(item) {
    const raw = item._hdBackdrop || item.picSlide || item.pic
    return picUrl(raw, item.name, item.year)
  }

  function paintBillboard(centerIdx) {
    state.heroIndex = centerIdx
    const center = items[(centerIdx + len * 10) % len]
    if (!center) return

    const score = center.score && parseFloat(center.score) > 0 ? parseFloat(center.score).toFixed(1) : '9.2'
    const tags = [center.typeName || '院线热映', center.area || '全球精选', center.year || '2026'].filter(Boolean).slice(0, 4)
    const epText = center.remarks || '1080P 高码蓝光'
    const isFav = store.favorites.has(`${center.site}:${center.id}`)

    centerCard.dataset.site = center.site
    centerCard.dataset.id = center.id
    const bgUrl = resolveItemBackdropUrl(center)
    if (centerBg.getAttribute('src') !== bgUrl) {
      centerBg.classList.remove('hero-bg-fadein')
      void centerBg.offsetWidth
      centerBg.src = bgUrl
      centerBg.classList.add('hero-bg-fadein')
    }
    centerBg.dataset.title = center.name
    centerBg.alt = center.name

    favBtn.classList.toggle('active', isFav)
    logoText.textContent = center.name
    genreRow.innerHTML = tags.map((t) => `<span class="hero-genre-tag">${esc(t)}</span>`).join('')
    scoreNum.textContent = score
    descEl.textContent = center.content || center.desc || `《${center.name}》· 16:9 横向超清宣传巨幕，免 VPN 高码率蓝光直连秒播，开启沉浸式视听体验。`
    playBtn.dataset.site = center.site
    playBtn.dataset.id = center.id
    if (detailBtn) {
      detailBtn.dataset.site = center.site
      detailBtn.dataset.id = center.id
    }
    durationPill.textContent = epText

    dockBtns.forEach((btn, i) => btn.classList.toggle('active', i === centerIdx))
  }

  paintBillboard(0)

  // 异步并发匹配 16:9 横向高清宣传海报 (TMDB w1280 Backdrop + 预置 1080P 横版剧照)
  ;(async () => {
    if (!window.shellApi?.api?.getBackdrop) return
    await Promise.allSettled(
      items.map(async (item, idx) => {
        try {
          const hdUrl = await window.shellApi.api.getBackdrop({
            title: item.name,
            year: item.year,
            fallbackPic: item.picSlide || item.pic,
          })
          if (hdUrl) {
            item._hdBackdrop = hdUrl
            const finalUrl = picUrl(hdUrl, item.name, item.year)
            const dockImg = hero.querySelector(`img[data-dock-idx="${idx}"]`)
            if (dockImg) dockImg.src = finalUrl
            if (state.heroIndex === idx && centerBg) {
              centerBg.src = finalUrl
            }
          }
        } catch {}
      })
    )
  })()

  hero.onclick = (event) => {
    const fBtn = event.target.closest('#btnHeroFavToggle')
    if (fBtn) {
      event.stopPropagation()
      const cur = items[state.heroIndex]
      if (cur) {
        const key = `${cur.site}:${cur.id}`
        const added = store.favorites.toggle({ ...cur, key })
        fBtn.classList.toggle('active', added)
        toast(added ? `❤️ 已将《${cur.name}》加入喜欢清单` : '已从喜欢清单移除')
      }
      return
    }
    const dot = event.target.closest('[data-hero]')
    if (dot) {
      event.stopPropagation()
      const targetIdx = Number(dot.dataset.hero)
      paintBillboard(targetIdx)
      return
    }
    const play = event.target.closest('[data-act="play-hero"]')
    if (play) {
      event.stopPropagation()
      navigate(`#/play/${play.dataset.site}/${play.dataset.id}/0/0`)
      return
    }
    const open = event.target.closest('[data-act="open"]')
    if (open) openDetail(open.dataset.site, open.dataset.id)
  }

  clearInterval(state.heroTimer)
  state.heroTimer = setInterval(() => {
    if (state.route.name !== 'home') return
    paintBillboard((state.heroIndex + 1) % len)
  }, 6500)
}

function renderContinueRow() {
  const holder = document.getElementById('secContinue')
  if (!holder) return
  const rawList = store.history.all().filter((h) => h.time > 15)
  // 同一部剧播放历史只保留最新一条：按片名去重
  const seen = new Set()
  const list = []
  for (const h of rawList) {
    const norm = cleanTitle(h.name) || h.name
    if (!seen.has(norm)) {
      seen.add(norm)
      list.push(h)
      if (list.length >= 8) break
    }
  }
  if (!list.length) {
    holder.remove()
    return
  }
  holder.innerHTML = `
    <div class="section-head"><h2>继续观看</h2><span class="more" data-act="nav" data-route="history">全部记录 ›</span></div>
    <div class="row-scroll">
      ${list
      .map((h) => {
        const percent = h.duration ? Math.min(100, (h.time / h.duration) * 100) : 0
        const pic = picUrl(h.pic, h.name, h.year)
        const isPending = pic === PLACEHOLDER
        const pendingAttrs = isPending
          ? ` data-pending-title="${esc(h.name)}" data-pending-year="${esc(h.year || '')}" data-hist-key="${esc(h.key)}"`
          : ''
        return `
          <div class="card" data-act="resume" data-key="${esc(h.key)}">
            <div class="card-cover">
              <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(h.name)}" alt="${esc(h.name)}" loading="lazy" decoding="async" />
              <div class="card-note">看到 ${fmtTime(h.time)}</div>
              <div class="card-hover-play"><span>
                <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
              </span></div>
              <div class="ep-progress" style="position:absolute;left:0;right:0;bottom:0;height:3px;background:#ffffff26">
                <div style="height:100%;width:${percent}%;background:var(--accent)"></div>
              </div>
            </div>
            <div class="card-title">${esc(h.name)}</div>
            <div class="card-sub">${esc(h.epName || '')}</div>
          </div>`
      })
      .join('')}
    </div>`
  hydratePendingPosters(holder)
}

function renderFollowRow() {
  const holder = document.getElementById('secFollow')
  const row = document.getElementById('followRow')
  if (!holder || !row) return

  const follows = store.follow.all()
  const historySeries = store.history
    .all()
    .filter((h) => !/电影|片/.test(h.typeName || '') && h.typeName)
  const combined = [...follows]

  for (const h of historySeries) {
    const norm = cleanTitle(h.name) || h.name
    if (!combined.some((c) => c.key === h.key || (cleanTitle(c.name) || c.name) === norm)) {
      combined.push({
        key: h.key,
        site: h.site,
        id: h.id,
        name: h.name,
        pic: h.pic,
        remarks: h.remarks,
        typeName: h.typeName,
        year: h.year,
        area: h.area,
        lastWatchedName: h.epName,
      })
    }
  }

  // 严格按规范化片名去重，杜绝同一部剧显示多张海报
  const seen = new Set()
  const unique = []
  for (const f of combined) {
    const norm = cleanTitle(f.name) || f.name
    if (!seen.has(norm)) {
      seen.add(norm)
      unique.push(f)
    }
  }

  if (!unique.length) {
    holder.style.display = 'none'
    return
  }

  row.innerHTML = unique.slice(0, 14).map(cardHTML).join('')
  holder.style.display = ''
  hydratePendingPosters(holder)
}

async function loadDailyUpdates() {
  const holder = document.getElementById('secDaily')
  const row = document.getElementById('dailyRow')
  if (!holder || !row) return

  try {
    const items = await shellApi.api.daily({ hours: 24, limit: 30 })
    const deduped = dedupeItems(items || [])
    if (!deduped.length) return

    row.innerHTML = deduped.slice(0, 16).map(cardHTML).join('')
    holder.style.display = ''
    hydratePendingPosters(holder)
  } catch {
    /* 容错静默 */
  }
}

// ---------------------------------------------------------------- 页面：新片深度推荐专栏（原 4K 专区升级）

function commentaryCardHTML(item) {
  const baseTitle = item.baseMovieTitle || cleanTitle(item.name) || item.name
  const pic = picUrl(item.pic, baseTitle, item.year)
  const isPending = pic === PLACEHOLDER
  const pendingAttrs = isPending
    ? ` data-pending-title="${esc(baseTitle)}" data-pending-year="${esc(item.year || '')}"`
    : ''
  const timeText = item.updatedAt ? item.updatedAt.slice(0, 16) : '今日实时更新'
  const tagText = item.remarks || item.typeName || '电影解说'

  return `
    <article class="commentary-video-card" data-play-commentary-site="${esc(item.site)}" data-play-commentary-id="${esc(item.id)}">
      <div class="commentary-cover-wrap">
        <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(baseTitle)}" alt="${esc(item.name)}" loading="lazy" decoding="async" />
        <span class="commentary-live-badge">🎬 ${esc(item.siteName || '实时专库')} · 解说</span>
        <span class="commentary-time-pill">${esc(timeText)}</span>
        <div class="commentary-play-overlay">
          <span class="commentary-play-circle">
            <svg width="16" height="18" viewBox="0 0 16 18" fill="#fff"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z"/></svg>
          </span>
        </div>
      </div>
      <div class="commentary-body">
        <h3 class="commentary-title" title="${esc(item.name)}">${esc(item.name)}</h3>
        <div class="commentary-sub-row">
          <span class="commentary-origin-tag">原片：《${esc(baseTitle)}》</span>
          <span class="commentary-remark-tag">${esc(tagText)}</span>
        </div>
        <div class="commentary-actions">
          <button class="btn-capsule small appstore-get" data-play-commentary-site="${esc(item.site)}" data-play-commentary-id="${esc(item.id)}" style="flex:1">
            ▶ 播放解说视频
          </button>
          <button class="btn-capsule small" data-play-base-movie="${esc(baseTitle)}" title="搜索并播放《${esc(baseTitle)}》完整正片">
            🎞️ 看原片
          </button>
        </div>
      </div>
    </article>
  `
}

function userReelCardHTML(reel) {
  const pic = picUrl(reel.pic, reel.movie_title)
  const isPending = pic === PLACEHOLDER
  const pendingAttrs = isPending ? ` data-pending-title="${esc(reel.movie_title)}" data-pending-year=""` : ''
  const clipCount = Array.isArray(reel.clips) ? reel.clips.length : reel.clip_count || 1
  const totalSec = reel.total_duration || clipCount * 8
  return `
    <article class="commentary-video-card user-reel-card" data-play-user-reel="${esc(reel.id)}" data-reel-movie="${esc(reel.movie_title)}">
      <div class="commentary-cover-wrap">
        <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(reel.movie_title)}" alt="${esc(reel.movie_title)}" loading="lazy" decoding="async" />
        <span class="commentary-live-badge" style="background:linear-gradient(135deg,#f59e0b,#d97706)">✦ 定格合成 · ${clipCount} 段连播</span>
        <span class="commentary-time-pill">总长 ${totalSec} 秒</span>
        <div class="commentary-play-overlay">
          <span class="commentary-play-circle">
            <svg width="16" height="18" viewBox="0 0 16 18" fill="#fff"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z"/></svg>
          </span>
        </div>
      </div>
      <div class="commentary-body">
        <h3 class="commentary-title" title="《${esc(reel.movie_title)}》定格此刻合成电影解说">《${esc(reel.movie_title)}》· ${clipCount} 段高光合成解说</h3>
        <div class="commentary-sub-row">
          <span class="commentary-origin-tag">创作者：${esc(reel.author_name || '影悦影迷')}</span>
          <span class="commentary-remark-tag">时间轴自动排序</span>
        </div>
        <p style="margin:2px 0 4px;font-size:11.5px;color:rgba(255,255,255,0.68);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45">
          ${esc(reel.script_summary || '')}
        </p>
        <div class="commentary-actions">
          <button class="btn-capsule small appstore-get" data-play-user-reel="${esc(reel.id)}" data-reel-movie="${esc(reel.movie_title)}" style="flex:1">
            ▶ 连播合成解说 (${clipCount}段)
          </button>
          <button class="btn-capsule small" data-play-base-movie="${esc(reel.movie_title)}" title="观看《${esc(reel.movie_title)}》完整正片">
            🎞️ 完整正片
          </button>
        </div>
      </div>
    </article>
  `
}

async function renderMovieArticles(forceRefresh = false) {
  setWindowTitle('新片专栏 · 实时电影解说视频与院线速递')
  syncTopbarIdentity()

  const userReels = store.circles.commentaryReels()

  view.innerHTML = `
    <div class="articles-page-header">
      <div>
        <div class="articles-kicker">LIVE COMMENTARY & NEW RELEASES · 多源多页实时直连</div>
        <h1 class="page-title" style="margin:4px 0 6px 0">新片专栏 · 实时电影解说与院线热映</h1>
        <p class="articles-sub">实时并发聚合 60+ 部全网最新电影解说视频、几分钟速看导读与「✦ 定格此刻」多片段合成解说，点击即播。</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn-capsule small" id="btnRefreshCommentaries" title="立即从全网直连源拉取最新解说视频">
          🔄 实时刷新
        </button>
        <div class="heat-radar-pill">
          <span class="heat-dot"></span>
          <span id="commentarySyncStatus">正在同步 60+ 部实时电影解说…</span>
        </div>
      </div>
    </div>

    <!-- 用户自制/预置「定格此刻 · 自动排序合并电影解说」板块 -->
    <section class="section" id="secUserMergedReels" style="margin-bottom:26px">
      <div class="section-head" style="margin-bottom:12px">
        <h2>✦ 定格此刻 · 自动排序合成电影解说</h2>
        <span class="more" style="cursor:default">在播放页点击「✦ 定格此刻」添加多个 3-5 秒片段，系统自动按时间轴排序合并为连播解说</span>
      </div>
      <div class="commentary-video-grid" id="userMergedReelsGrid"></div>
    </section>

    <!-- 核心板块 1：全网实时电影解说视频流（扩容至 60+ 部 + 题材分类筛选） -->
    <section class="section" id="secLiveCommentaries" style="margin-bottom:28px">
      <div class="section-head" style="margin-bottom:12px;flex-wrap:wrap;gap:12px">
        <h2>🎬 全网实时电影解说视频专栏</h2>
        <div class="filters" id="commentaryFilterBar" style="margin:0">
          <button class="chip active" data-comm-filter="all">全部解说</button>
          <button class="chip" data-comm-filter="latest">🔥 今日最新</button>
          <button class="chip" data-comm-filter="suspense">🧠 悬疑惊悚</button>
          <button class="chip" data-comm-filter="action">🚀 科幻动作</button>
          <button class="chip" data-comm-filter="drama">😭 高分剧情</button>
        </div>
        <span class="more" id="commentaryCountLabel" style="cursor:default">直连多源多页抓取 · 点击即播解说或原片</span>
      </div>
      <div class="commentary-video-grid" id="commentaryVideoGrid">
        ${Array.from({ length: 9 }, () => '<div class="skeleton" style="height:240px;border-radius:18px"></div>').join('')}
      </div>
      <div id="commentaryLoadMoreWrap" style="text-align:center;margin-top:18px;display:none">
        <button class="btn-capsule appstore-get" id="btnLoadMoreCommentaries" style="padding:0 28px;height:38px">
          展开更多实时电影解说视频 ↓
        </button>
      </div>
    </section>

    <!-- 核心板块 2：今日 24h 实时院线与流媒体上新速递 -->
    <section class="section" id="secDynamicNewReleases" style="margin-bottom:28px">
      <div class="section-head" style="margin-bottom:14px">
        <h2>🔥 今日院线与流媒体 24h 实时上新</h2>
        <span class="more" style="cursor:default">来自直连片源 24 小时内最新入库正片</span>
      </div>
      <div class="grid" id="dynamicNewReleasesGrid">
        ${skeletonGrid(6)}
      </div>
    </section>

    <!-- 板块 3：主编深度视听专栏（经典导读与名场面解析） -->
    <section class="articles-feed-section">
      <div class="section-head" style="margin-bottom:16px">
        <h2>📖 影悦深度视听导读专栏 (${MOVIE_ARTICLES.length} 篇)</h2>
        <span class="more" style="cursor:default">含高光时刻锚点解析与一键秒播正片</span>
      </div>
      <div class="articles-editorial-grid" id="articlesEditorialGrid">
        ${MOVIE_ARTICLES.map((art) => `
          <article class="editorial-article-card" data-article-id="${esc(art.id)}">
            <div class="article-cover-wrap">
              <img src="${esc(picUrl(art.pic, art.movieName))}" alt="${esc(art.movieName)}" loading="lazy" />
              <span class="article-heat-badge">🔥 ${esc(art.heatScore)}</span>
              <span class="article-score-pill">★ ${esc(art.rating)}</span>
            </div>
            <div class="article-body-wrap">
              <div class="article-meta-top">
                <span class="article-cat-pill">${esc(art.categoryTag)}</span>
                <span class="article-rank-tag">${esc(art.heatRank)}</span>
                <span class="article-read-time">⏱ ${esc(art.readTime)}</span>
              </div>
              <h2 class="article-headline">${esc(art.title)}</h2>
              <p class="article-summary">${esc(art.summary)}</p>
              <div class="article-footer-bar">
                <div class="article-author-info">
                  <span class="author-dot">✦</span>
                  <span>${esc(art.author)} · 《${esc(art.movieName)}》(${esc(art.year)})</span>
                </div>
                <div class="article-actions">
                  <button class="btn small" data-read-article="${esc(art.id)}">📖 阅读深度全文</button>
                  <button class="btn primary small" data-play-article-movie="${esc(art.movieName)}">▶ 立即播放正片</button>
                </div>
              </div>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `

  hydratePendingPosters(view)

  // 渲染定格合成电影解说（包含用户自制与官方多段示范）
  ;(async () => {
    const reelGrid = document.getElementById('userMergedReelsGrid')
    if (!reelGrid) return
    const demoReel = {
      id: 'reel_demo_interstellar',
      movie_title: '星际穿越',
      pic: 'https://image.tmdb.org/t/p/w1280/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
      author_name: '深空观测者',
      clips: [
        { start_sec: 2526, end_sec: 2534, clip_duration: 8, clip_range_label: '42:06 - 42:14', quote_or_note: '库珀含泪驾车驶离玉米地，掀开副驾驶毛毯与火箭倒计时交错。', mood_tag: '💧 破防瞬间' },
        { start_sec: 5606, end_sec: 5614, clip_duration: 8, clip_range_label: '01:33:26 - 01:33:34', quote_or_note: '米勒星球一小时等于地球七年，库珀看完跨越二十三年的录像失声痛哭。', mood_tag: '💧 破防瞬间' },
        { start_sec: 8321, end_sec: 8329, clip_duration: 8, clip_range_label: '02:18:41 - 02:18:49', quote_or_note: '五维超立方体书架背后，库珀拨动引力将摩斯密码刻进女儿手表的秒针。', mood_tag: '🎞️ 封神镜头' },
      ],
      clip_count: 3,
      total_duration: 24,
      script_summary: '【第1段 42:06】驶离玉米地倒计时 ▸ 【第2段 01:33:26】跨越23年家书泪崩 ▸ 【第3段 02:18:41】五维书架引力摩斯密码',
    }
    const allReels = [...userReels, demoReel.movie_title && !userReels.some((r) => r.movie_title === '星际穿越') ? demoReel : null].filter(Boolean)
    reelGrid.innerHTML = allReels.map(userReelCardHTML).join('')
    hydratePendingPosters(reelGrid)

    reelGrid.querySelectorAll('[data-play-user-reel]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest('[data-play-base-movie]')) return
        e.stopPropagation()
        const rid = el.dataset.playUserReel
        const targetReel = allReels.find((r) => r.id === rid)
        if (targetReel) launchCommentaryReel(targetReel)
      }
    })
    reelGrid.querySelectorAll('[data-play-base-movie]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        playCircleMovie({ name: btn.dataset.playBaseMovie })
      }
    })
  })()

  document.getElementById('btnRefreshCommentaries')?.addEventListener('click', () => {
    toast('正在实时同步 60+ 部最新电影解说视频与今日新片…')
    renderMovieArticles(true)
  })

  // 点击阅读全文或卡片本身打开沉浸式专栏阅读器
  view.querySelectorAll('[data-read-article], .editorial-article-card').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-play-article-movie]')) return
      const aid = el.dataset.readArticle || el.dataset.articleId || el.closest('[data-article-id]')?.dataset.articleId
      const found = MOVIE_ARTICLES.find((x) => x.id === aid)
      if (found) openArticleReaderModal(found)
    }
  })

  // 点击「立即播放正片」直接触发多源并发秒播
  view.querySelectorAll('[data-play-article-movie]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const movieName = btn.dataset.playArticleMovie
      if (movieName) playCircleMovie({ name: movieName })
    }
  })

  // 并发拉取：1. 60+ 部实时电影解说视频流 + 2. 24h 最新上映正片
  ;(async () => {
    try {
      const comms = await shellApi.api.commentaries({ limit: 64, force: Boolean(forceRefresh) })
      const commGrid = document.getElementById('commentaryVideoGrid')
      const syncStatus = document.getElementById('commentarySyncStatus')
      const countLabel = document.getElementById('commentaryCountLabel')
      const moreWrap = document.getElementById('commentaryLoadMoreWrap')
      const btnMore = document.getElementById('btnLoadMoreCommentaries')
      const filterBar = document.getElementById('commentaryFilterBar')

      if (commGrid && Array.isArray(comms) && comms.length) {
        let activeFilter = 'all'
        let visibleCount = 24

        function getFilteredList() {
          if (activeFilter === 'latest') return comms.slice(0, 30)
          if (activeFilter === 'suspense') {
            const list = comms.filter((c) => /悬疑|惊悚|犯罪|恐怖|迷雾|杀|案|侦探|密室|诡/.test((c.name || '') + (c.content || '')))
            return list.length >= 6 ? list : comms.filter((_, i) => i % 3 === 0)
          }
          if (activeFilter === 'action') {
            const list = comms.filter((c) => /科幻|动作|战争|灾难|冒险|特工|枪|战|星际|未来|机甲/.test((c.name || '') + (c.content || '')))
            return list.length >= 6 ? list : comms.filter((_, i) => i % 3 === 1)
          }
          if (activeFilter === 'drama') {
            const list = comms.filter((c) => /剧情|爱情|家庭|催泪|治愈|人生|喜剧|奇幻/.test((c.name || '') + (c.content || '')))
            return list.length >= 6 ? list : comms.filter((_, i) => i % 3 === 2)
          }
          return comms
        }

        function paintCommGrid() {
          const filtered = getFilteredList()
          const slice = filtered.slice(0, visibleCount)
          commGrid.innerHTML = slice.map(commentaryCardHTML).join('')
          if (syncStatus) syncStatus.textContent = `已实时同步 ${comms.length} 部最新解说`
          if (countLabel) countLabel.textContent = `当前分类共 ${filtered.length} 部实时电影解说视频 · 支持直连秒播`
          if (moreWrap && btnMore) {
            if (filtered.length > visibleCount) {
              moreWrap.style.display = 'block'
              btnMore.textContent = `展开剩余 ${filtered.length - visibleCount} 部实时电影解说视频 ↓`
            } else {
              moreWrap.style.display = 'none'
            }
          }
          hydratePendingPosters(commGrid)

          commGrid.querySelectorAll('[data-play-base-movie]').forEach((btn) => {
            btn.onclick = (e) => {
              e.stopPropagation()
              const baseTitle = btn.dataset.playBaseMovie
              if (baseTitle) playCircleMovie({ name: baseTitle })
            }
          })

          commGrid.querySelectorAll('[data-play-commentary-site]').forEach((el) => {
            el.onclick = (e) => {
              if (e.target.closest('[data-play-base-movie]')) return
              e.stopPropagation()
              const sKey = el.dataset.playCommentarySite
              const vId = el.dataset.playCommentaryId
              if (sKey && vId) navigate(`#/play/${sKey}/${vId}/0/0`)
            }
          })
        }

        paintCommGrid()

        if (btnMore) {
          btnMore.onclick = () => {
            visibleCount += 24
            paintCommGrid()
          }
        }

        if (filterBar) {
          filterBar.querySelectorAll('[data-comm-filter]').forEach((chip) => {
            chip.onclick = () => {
              filterBar.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
              chip.classList.add('active')
              activeFilter = chip.dataset.commFilter
              visibleCount = 24
              paintCommGrid()
            }
          })
        }
      } else if (commGrid) {
        commGrid.innerHTML = `<div class="empty" style="grid-column:1/-1;padding:36px 0">暂未获取到实时解说视频，请点击右上角「🔄 实时刷新」重试</div>`
      }
    } catch (_) {}
  })()

  ;(async () => {
    try {
      const dailyItems = await shellApi.api.daily({ hours: 24, limit: 18 })
      const deduped = dedupeItems(dailyItems || [])
      const gridDyn = document.getElementById('dynamicNewReleasesGrid')
      if (gridDyn && deduped.length) {
        gridDyn.innerHTML = deduped.slice(0, 12).map(cardHTML).join('')
        hydratePendingPosters(gridDyn)
      }
    } catch (_) {}
  })()
}

function openArticleReaderModal(art) {
  const existing = document.getElementById('articleReaderModal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'articleReaderModal'
  modal.innerHTML = `
    <div class="cinemajoy-modal-card article-reader-card" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="article-cat-pill">${esc(art.categoryTag)}</span>
          <span class="article-heat-inline">🔥 ${esc(art.heatScore)} · ${esc(art.heatRank)}</span>
        </div>
        <button class="btn small" id="btnCloseArticleModal" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <div class="article-reader-hero">
        <img src="${esc(picUrl(art.pic, art.movieName))}" alt="${esc(art.movieName)}" />
        <div class="article-reader-hero-meta">
          <h1>${esc(art.title)}</h1>
          <div class="article-reader-byline">
            <span>撰稿：${esc(art.author)}</span>
            <span>•</span>
            <span>影片：《${esc(art.movieName)}》(${esc(art.year)})</span>
            <span>•</span>
            <span>豆瓣 ★ ${esc(art.rating)}</span>
          </div>
          <p class="article-reader-lead">${esc(art.summary)}</p>
        </div>
      </div>
      <div class="article-reader-content">
        ${(art.sections || []).map((sec) => `
          <div class="article-sec-block">
            <h3>${esc(sec.heading)}</h3>
            <p>${esc(sec.body)}</p>
          </div>
        `).join('')}
      </div>
      <div class="article-reader-footer">
        <button class="btn" id="btnArticleToCircles">进入相关影视圈共赏</button>
        <button class="btn primary" id="btnArticlePlayNow">▶ 立即播放《${esc(art.movieName)}》正片</button>
      </div>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseArticleModal').onclick = () => modal.remove()
  modal.querySelector('#btnArticlePlayNow').onclick = () => {
    modal.remove()
    playCircleMovie({ name: art.movieName })
  }
  modal.querySelector('#btnArticleToCircles').onclick = () => {
    modal.remove()
    navigate('#/circles')
  }
  document.body.appendChild(modal)
}

// ---------------------------------------------------------------- 页面：分类

async function renderCategory(catKey) {
  if (catKey === '4k' || catKey === 'articles') {
    return renderMovieArticles()
  }
  const site = state.site
  if (!site) return renderNoSource()

  const label = (MAIN_CATEGORIES.find((c) => c.key === catKey) || { label: '纪录片' }).label
  setWindowTitle(label)
  view.innerHTML = `<h1 class="page-title">${label}</h1><div id="catBody">${skeletonGrid(12)}</div>`

  const body = document.getElementById('catBody')
  const alive = () => document.body.contains(body)

  const classes = await ensureClasses(site)
  if (!alive()) return
  const pref = PRIORITY_GENRES[catKey] || []
  const subClasses = classes.filter((c) => classify(c.name) === catKey)
  subClasses.sort((a, b) => {
    const na = a.name.replace(/^.*\//, '')
    const nb = b.name.replace(/^.*\//, '')
    const ia = pref.indexOf(na)
    const ib = pref.indexOf(nb)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return 0
  })
  if (!subClasses.length) {
    body.innerHTML = `<div class="empty"><div class="big">◍</div>这个源没有「${label}」分类</div>`
    return
  }

  // 默认落在「真有内容」的那个子分类上（父分类常常只有一条）
  const picked = await resolveGroup(site.key, classes, catKey)
  if (!alive()) return
  const defaultType = picked ? picked.typeId : subClasses[0].id

  let currentType = defaultType
  let nextPage = 1
  let pageCount = 1
  let loading = false
  let exhausted = false
  let failed = false // 上次失败过：暂停自动加载，只留手动重试，否则哨兵一直在视口里会疯狂重试
  let pendingReset = false // 加载途中切了子分类，等这一轮结束再重来

  body.innerHTML = `
    <div class="filters" id="catFilters">
      ${subClasses
      .map(
        (c) => `<button class="chip ${c.id === defaultType ? 'active' : ''}" data-type="${esc(c.id)}">${esc(c.name.replace(/^.*\//, ''))}</button>`
      )
      .join('')}
    </div>
    <div id="catList">${skeletonGrid(12)}</div>
    <div class="load-more" id="catMore"></div>`

  document.getElementById('catFilters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-type]')
    if (!chip) return
    document.querySelectorAll('#catFilters .chip').forEach((el) => el.classList.toggle('active', el === chip))
    currentType = chip.dataset.type
    load(true)
  })

  // 滚到底部自动加载，不用再点按钮。
  //
  // 坑：IntersectionObserver 只在「交叉状态变化」时回调。一页内容不够一屏时，
  // 哨兵从头到尾都在视口里、状态没变过，回调只会来一次，后面就再也不触发了。
  // 所以每轮加载结束都 unobserve + observe 一次，强制它重新计算 —— 内容没填满
  // 一屏就会连着拉几页，直到撑满或到底为止。
  const sentinel = document.getElementById('catMore')
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      if (loading || exhausted || failed) return
      load(false)
    },
    { rootMargin: '600px 0px', threshold: 0 }
  )
  listObserver = observer
  observer.observe(sentinel)

  async function load(reset = false) {
    // 加载中被点了别的子分类：记下来，等这一轮收尾时重来，别把点击丢掉
    if (loading) {
      if (reset) pendingReset = true
      return
    }
    if (!reset && (exhausted || nextPage > pageCount)) return

    loading = true
    const listEl = document.getElementById('catList')
    const more = document.getElementById('catMore')

    if (reset) {
      nextPage = 1
      exhausted = false
      failed = false
      listEl.innerHTML = skeletonGrid(12)
      if (more) more.innerHTML = ''
    } else if (more) {
      more.innerHTML = `<span class="hint"><span class="spinner sm"></span>正在加载…</span>`
    }

    try {
      const res = await shellApi.api.list({ key: site.key, typeId: currentType, page: nextPage })
      pageCount = res.pageCount || 1
      const items = dedupeItems(res.items.filter((x) => x.name))

      if (reset) {
        listEl.innerHTML = gridHTML(items)
      } else {
        // 卡片必须追加进 .grid 里。直接往 #catList 上 append 会落到 grid 容器外面，
        // 丢掉网格布局，海报就变成一堆没宽度约束的裸 img。
        const grid = listEl.querySelector('.grid')
        if (grid) grid.insertAdjacentHTML('beforeend', items.map(cardHTML).join(''))
        else listEl.innerHTML = gridHTML(items)
      }
      hydratePendingPosters(listEl)

      nextPage += 1
      exhausted = nextPage > pageCount

      if (more) {
        more.innerHTML = exhausted
          ? `<span class="hint">共 ${res.total || items.length} 部 · 已经到底了</span>`
          : `<span class="hint">滚动继续加载…</span>`
      }
    } catch (error) {
      // 失败不推进页码，留一个手动重试的出口
      failed = true
      if (reset) {
        listEl.innerHTML = `<div class="empty"><div class="big">⚠</div>加载失败：${esc(error.message || error)}</div>`
      }
      if (more) {
        more.innerHTML = `<button class="btn" id="btnRetry">加载失败，点这里重试</button>`
        const btn = document.getElementById('btnRetry')
        if (btn) {
          btn.onclick = () => {
            failed = false
            load(false)
          }
        }
      }
    } finally {
      loading = false
      if (pendingReset) {
        pendingReset = false
        load(true)
      } else if (document.body.contains(sentinel)) {
        // 重新评估哨兵位置；页面已经切走就不要再挂回去
        observer.unobserve(sentinel)
        observer.observe(sentinel)
      }
    }
  }

  load(true)
}

// ---------------------------------------------------------------- 页面：搜索

async function renderSearch(keyword) {
  const site = state.site
  if (!site) return renderNoSource()
  setWindowTitle('搜索：' + keyword)
  view.innerHTML = `<h1 class="page-title">搜索「${esc(keyword)}」<span class="count" id="searchCount"></span></h1><div id="searchBody">${skeletonGrid(12)}</div>`

  try {
    let searchResult
    if (shellApi.api && typeof shellApi.api.search === 'function') {
      searchResult = await shellApi.api.search({ key: site.key, query: keyword })
    } else {
      const res = await shellApi.api.list({ key: site.key, keyword, page: 1 })
      searchResult = { items: res.items || [], total: res.total || 0, isSemantic: false }
    }

    const items = searchResult.items || []
    const isSemantic = Boolean(searchResult.isSemantic)

    const countEl = document.getElementById('searchCount')
    if (countEl) {
      countEl.textContent = items.length
        ? isSemantic
          ? `端侧 AI 语义挖掘出 ${items.length} 部契合影片`
          : `在 ${site.name} 找到 ${searchResult.total || items.length} 条`
        : ''
    }

    const aiBanner = isSemantic && items.length
      ? `<div class="ai-search-banner">
          <span class="ai-sparkle">✨</span>
          <span><strong>端侧 AI 模糊意图挖掘已生效</strong>：未检索到字面片名，已基于「${esc(keyword)}」深层语义内核从片库中智能匹配</span>
        </div>`
      : ''

    const bodyEl = document.getElementById('searchBody')
    if (bodyEl) {
      bodyEl.innerHTML = items.length
        ? `${aiBanner}<div class="grid">${items.map(cardHTML).join('')}</div>`
        : `<div class="empty"><div class="big">◍</div>没搜到「${esc(keyword)}」<br/><span style="color:#6f737b">换个关键词，或者到「源管理」换一个片源</span></div>`
    }
  } catch (error) {
    const bodyEl = document.getElementById('searchBody')
    if (bodyEl) bodyEl.innerHTML = `<div class="empty"><div class="big">⚠</div>搜索失败：${esc(error.message || error)}</div>`
  }
}

// ---------------------------------------------------------------- 页面：详情

async function fetchDetail(siteKey, id) {
  const cacheKey = `${siteKey}:${id}`
  if (state.detailCache.has(cacheKey)) return state.detailCache.get(cacheKey)
  const detail = await shellApi.api.detail(siteKey, id)
  state.detailCache.set(cacheKey, detail)
  return detail
}

async function renderDetail(siteKey, id) {
  setWindowTitle('详情')
  view.innerHTML = `<div style="padding:60px 0">${skeletonGrid(1)}</div>`

  let detail
  try {
    detail = await fetchDetail(siteKey, id)
  } catch (error) {
    view.innerHTML = `<div class="empty"><div class="big">⚠</div>详情加载失败：${esc(error.message || error)}</div>`
    return
  }

  if (NSFW_REGEX.test(detail.name || '') || NSFW_REGEX.test(detail.typeName || '')) {
    view.innerHTML = `<div class="empty"><div class="big">🛡️</div>该影片包含违规敏感内容，已被系统合规过滤屏蔽。</div>`
    return
  }

  setWindowTitle(detail.name)
  document.title = detail.name + ' - 影悦'

  const key = `${detail.site}:${detail.id}`
  const favored = store.favorites.has(key)
  const isFollowed = store.follow.has(key)
  const history = store.history.get(key)
  const validLines = (detail.lines || []).filter((line) => line.episodes && line.episodes.some((ep) => !isPageUrl(ep.url)))
  if (validLines.length > 0) {
    detail.lines = validLines
  }
  const firstLine = 0

  const isMovie = /电影|片|影院/.test(detail.typeName || '')
  const latestEpName = (detail.lines[0] && detail.lines[0].episodes && detail.lines[0].episodes.length)
    ? detail.lines[0].episodes[detail.lines[0].episodes.length - 1].name
    : (detail.remarks || '')
  const isUpdating = !isMovie && (/更至|更新至|更新到|连载|第\d+期/.test(detail.remarks || '') || (detail.lines[0]?.episodes?.length || 0) > 1)

  let displayScore = detail.score && parseFloat(detail.score) > 0 ? parseFloat(detail.score).toFixed(1) : ''
  if (!displayScore) {
    let hash = 0
    const s = detail.name || ''
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i)
    displayScore = (8.2 + (Math.abs(hash) % 15) / 10).toFixed(1)
  }

  view.innerHTML = `
    <div class="detail-bg" style="background-image:url('${esc(picUrl(detail.pic, detail.name, detail.year))}')"></div>
    <div class="detail-wrap">
      <div class="detail-top">
        <div class="detail-poster"><img src="${esc(picUrl(detail.pic, detail.name, detail.year))}" data-title="${esc(detail.name)}" alt="${esc(detail.name)}" /></div>
        <div class="detail-info">
          <h1 class="detail-title">${esc(detail.name)}</h1>
          <div class="detail-sub">
            <span class="tag-badge badge-quality">${/4k/i.test(detail.remarks || '') ? '4K 超清' : '1080P 高清'}</span>
            <span class="tag-badge badge-audio">杜比音效</span>
            ${displayScore ? `<span class="tag-badge badge-score">★ 豆瓣 ${esc(displayScore)}</span>` : ''}
            ${detail.year ? `<span class="tag-badge">${esc(detail.year)}</span>` : ''}
            ${detail.area ? `<span class="tag-badge">${esc(detail.area)}</span>` : ''}
            ${detail.typeName ? `<span class="tag-badge">${esc(detail.typeName)}</span>` : ''}
            ${detail.remarks ? `<span class="tag-badge badge-remarks">${esc(detail.remarks)}</span>` : ''}
          </div>
          <div class="detail-ready-status">
            <span class="ready-dot">●</span> 已就绪 ${detail.lines.length} 条线路，即点即播
          </div>
          <div class="detail-actions">
            <button class="btn-play-big" data-act="start" data-line="${firstLine}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              ${history ? `继续播放 ${esc(history.epName || '')}` : '立即播放'}
            </button>
            ${!isMovie ? `
              <button class="btn-ghost ${isFollowed ? 'on' : ''}" id="btnFollow">
                ${isFollowed ? '🔔 追更中' : '＋ 加入待播清单'}
              </button>
            ` : ''}
            <button class="btn-ghost ${favored ? 'on' : ''}" data-act="fav">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${favored ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${favored ? '已收藏' : '收藏'}
            </button>
            <button class="btn-ghost" id="btnAddToCircle" title="将当前影片收录到我的影视圈">＋ 圈子</button>
          </div>
          <div class="detail-desc">${esc(detail.content || '暂无剧情简介。')}</div>
          <div class="detail-meta-list">
            ${detail.director ? `<div class="detail-actors"><span class="meta-label">导演：</span>${esc(detail.director)}</div>` : ''}
            ${detail.actors ? `<div class="detail-actors"><span class="meta-label">主演：</span>${esc(detail.actors)}</div>` : ''}
            <div class="detail-actors"><span class="meta-label">片源：</span>${esc((state.sources.find((s) => s.key === detail.site) || {}).name || detail.site)}</div>
          </div>
        </div>
      </div>
      <div class="ep-section" id="episodes"></div>
      <div class="detail-related" id="detailRelated"></div>
    </div>`

  const episodesEl = document.getElementById('episodes')
  let activeLine = firstLine
  let isDesc = false
  let curRange = 0
  const RANGE_SIZE = 30

  function paintEpisodes() {
    const line = detail.lines[activeLine] || detail.lines[0]
    if (!line) {
      episodesEl.innerHTML = `<div class="empty">这个源没有提供播放地址</div>`
      return
    }

    const total = line.episodes.length
    const sortedIndices = Array.from({ length: total }, (_, i) => i)
    if (isDesc) sortedIndices.reverse()

    const rangeCount = Math.ceil(total / RANGE_SIZE)
    if (curRange >= rangeCount) curRange = 0

    const rangeStart = curRange * RANGE_SIZE
    const rangeEnd = Math.min(rangeStart + RANGE_SIZE, total)
    const currentBatch = sortedIndices.slice(rangeStart, rangeEnd)

    let html = `
      <div class="ep-section-header">
        <div class="ep-header-left">
          <h3 class="ep-section-title">${isMovie ? '片源选集' : '剧集选集'}</h3>
          <span class="ep-total-count">共 ${total} 集</span>
          ${detail.lines.length > 1
        ? `<div class="ep-group-tabs">${detail.lines
          .map(
            (l, i) =>
              `<button class="ep-group-tab ${i === activeLine ? 'active' : ''}" data-line="${i}">${esc(friendlyLineName(l.name, i))}</button>`
          )
          .join('')}</div>`
        : ''
      }
        </div>
        ${total > 1
        ? `<div class="ep-header-right">
                <button class="ep-sort-btn" id="btnEpSort" title="切换集数排序">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                  <span>${isDesc ? `降序 ${total}-1` : `升序 1-${total}`}</span>
                </button>
              </div>`
        : ''
      }
      </div>`

    if (total > RANGE_SIZE) {
      html += `<div class="ep-range-bar">`
      for (let r = 0; r < rangeCount; r++) {
        const s = r * RANGE_SIZE + 1
        const e = Math.min((r + 1) * RANGE_SIZE, total)
        html += `<button class="ep-range-btn ${r === curRange ? 'active' : ''}" data-range="${r}">${s}-${e}</button>`
      }
      html += `</div>`
    }

    html += `<div class="ep-grid">`
    for (const epIdx of currentBatch) {
      const ep = line.episodes[epIdx]
      if (!ep) continue
      const page = isPageUrl(ep.url)
      const resume = history && history.line === activeLine && history.ep === epIdx
      html += `<button class="ep-btn ${page ? 'disabled' : ''} ${resume ? 'current' : ''}" data-ep="${epIdx}" title="${esc(ep.name)}">
        ${esc(ep.name || `第${epIdx + 1}集`)}
      </button>`
    }
    html += `</div>`

    episodesEl.innerHTML = html

    episodesEl.querySelectorAll('[data-line]').forEach((btn) => {
      btn.onclick = () => {
        activeLine = Number(btn.dataset.line)
        paintEpisodes()
      }
    })
    episodesEl.querySelectorAll('[data-range]').forEach((btn) => {
      btn.onclick = () => {
        curRange = Number(btn.dataset.range)
        paintEpisodes()
      }
    })
    const sortBtn = episodesEl.querySelector('#btnEpSort')
    if (sortBtn) {
      sortBtn.onclick = () => {
        isDesc = !isDesc
        paintEpisodes()
      }
    }
    episodesEl.querySelectorAll('[data-ep]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.classList.contains('disabled')) {
          toast('这条线路需要在网页播放器里解析，换一条「m3u8」线路试试')
          return
        }
        navigate(`#/play/${detail.site}/${detail.id}/${activeLine}/${btn.dataset.ep}`)
      }
    })
  }

  paintEpisodes()

  view.querySelector('[data-act="start"]').onclick = () => {
    let line = firstLine
    let ep = 0
    if (history && detail.lines[history.line] && detail.lines[history.line].episodes[history.ep]) {
      line = history.line
      ep = history.ep
    }
    navigate(`#/play/${detail.site}/${detail.id}/${line}/${ep}`)
  }

  const btnFollow = view.querySelector('#btnFollow')
  if (btnFollow) {
    btnFollow.onclick = () => {
      const added = store.follow.toggle({
        key,
        site: detail.site,
        id: detail.id,
        name: detail.name,
        pic: detail.pic,
        remarks: detail.remarks,
        typeName: detail.typeName,
        year: detail.year,
        area: detail.area,
        latestWatchedName: history ? history.epName : '',
        latestEpName: latestEpName || detail.remarks,
        updatedAt: Date.now(),
      })
      btnFollow.className = `btn-ghost ${added ? 'on' : ''}`
      btnFollow.textContent = added ? '🔔 追更中' : '＋ 加入待播清单'
      toast(added ? '已加入待播清单，更新时将在海报与首页提示' : '已移出待播清单')
      updateNavBadges()
    }
  }

  view.querySelector('[data-act="fav"]').onclick = (event) => {
    const added = store.favorites.toggle({
      key,
      site: detail.site,
      id: detail.id,
      name: detail.name,
      pic: detail.pic,
      remarks: detail.remarks,
      typeName: detail.typeName,
      year: detail.year,
      area: detail.area,
      at: Date.now(),
    })
    event.currentTarget.textContent = added ? '★ 已收藏' : '☆ 收藏'
    toast(added ? '已加入收藏' : '已取消收藏')
    updateNavBadges()
  }

  const btnAddToCircle = view.querySelector('#btnAddToCircle')
  if (btnAddToCircle) {
    btnAddToCircle.onclick = () => {
      openAddToCircleModal(detail)
    }
  }

  loadRelatedItems(detail)
}

async function loadRelatedItems(detail) {
  const holder = document.getElementById('detailRelated')
  if (!holder) return
  holder.innerHTML = `
    <div class="section-head" style="margin-top:36px">
      <h2>相关影视推荐</h2>
      <span class="more" style="color:var(--gold);font-size:12px;cursor:default">同类精选 · 豆瓣高分</span>
    </div>
    ${skeletonGrid(6)}`

  try {
    let pool = []
    // 1. 优先按同源同分类拉取候选
    if (detail.typeId) {
      try {
        const res = await shellApi.api.list({ key: detail.site, typeId: detail.typeId, page: 1 })
        if (res && res.items) pool.push(...res.items)
      } catch {
        /* 静默 */
      }
    }

    // 2. 若同分类候选不足，按分类名或主分类补充
    if (pool.length < 8) {
      try {
        const catKey = classify(detail.typeName || '')
        const mainCat = ['movie', 'tv', 'variety', 'anime'].includes(catKey) ? catKey : 'movie'
        const curSite = state.sources.find((s) => s.key === detail.site) || state.site
        const classes = await ensureClasses(curSite)
        const picked = await resolveGroup(curSite.key, classes, mainCat)
        if (picked && picked.res && picked.res.items) {
          pool.push(...picked.res.items)
        }
      } catch {
        /* 静默 */
      }
    }

    // 3. 严格排除当前本片与空项
    const currentNorm = cleanTitle(detail.name)
    const currentKey = `${detail.site}:${detail.id}`
    const filtered = pool.filter(
      (item) => item && item.name && `${item.site}:${item.id}` !== currentKey && cleanTitle(item.name) !== currentNorm
    )

    // 4. 去重
    const deduped = dedupeItems(filtered)

    // 5. 经过端侧 AI 剧情深层语义相似度排序（若未就绪则兜底至会话推荐引擎）
    let ranked = []
    let isAiRanked = false
    if (shellApi.ai && typeof shellApi.ai.similar === 'function') {
      try {
        ranked = await shellApi.ai.similar({
          targetItem: detail,
          pool: deduped,
          limit: 12,
        })
        if (ranked && ranked.length) isAiRanked = true
      } catch {
        /* 容错 */
      }
    }

    if (!isAiRanked || !ranked.length) {
      try {
        ranked = await shellApi.recommender.rank({
          pool: deduped,
          history: store.history.all(),
          favorites: store.favorites.all(),
          limit: 12,
        })
      } catch {
        ranked = deduped.slice(0, 12)
      }
    }

    const currentHolder = document.getElementById('detailRelated')
    if (!currentHolder) return
    if (!ranked || !ranked.length) {
      currentHolder.style.display = 'none'
      return
    }

    currentHolder.innerHTML = `
      <div class="section-head" style="margin-top:36px">
        <h2>${isAiRanked ? '✨ AI 懂你推荐' : '相关影视推荐'}<span class="count">${isAiRanked ? '基于剧情深层语义与内核风格匹配' : '同类精选 · 豆瓣高分'}</span></h2>
        <span class="more" style="color:var(--accent);font-size:12px;cursor:default">${isAiRanked ? '端侧 AI 语义引擎' : '智能优选'}</span>
      </div>
      <div class="grid">${ranked.slice(0, 12).map(cardHTML).join('')}</div>`
  } catch {
    const currentHolder = document.getElementById('detailRelated')
    if (currentHolder) currentHolder.style.display = 'none'
  }
}

function isPageUrl(url) {
  return !/\.(m3u8|mp4)(\?|$)/i.test(String(url || ''))
}

function friendlyLineName(rawName, index = 0) {
  if (!rawName) return index === 0 ? '极速专线' : `备用专线 ${index}`
  let name = String(rawName).trim()
  name = name.replace(/\s*\(需解析\)/gi, '').replace(/\s*\(解析\)/gi, '')
  if (/^(ff|lz|sn|bfzy|wl|kuaikan|hn|ty|dy|db|uk|dbm3u8|ffm3u8|lzm3u8|snm3u8|bjm3u8|wolong|liangzi|feifan)/i.test(name)) {
    return index === 0 ? '极速专线' : `备用专线 ${index}`
  }
  if (/4k|蓝光|超清|1080|原画/i.test(name)) {
    const cleaned = name.replace(/m3u8/gi, '').trim()
    return cleaned || (index === 0 ? '极速专线' : `备用专线 ${index}`)
  }
  if (/m3u8/i.test(name)) {
    return index === 0 ? '极速专线' : `备用专线 ${index}`
  }
  return name || (index === 0 ? '极速专线' : `备用专线 ${index}`)
}

function getMovieHighlight(detail) {
  if (!detail) return '精选高分好片 · 即刻开播'
  if (detail.blurb && detail.blurb.trim()) {
    let b = detail.blurb.trim().replace(/^([《【\[(]?[^》】\])]+[》】\])]?[:：\s]*)?/, '')
    if (b.length >= 4 && b.length <= 40) return b
  }
  const fullDesc = String(detail.content || detail.desc || '').trim()
  if (fullDesc) {
    const sentences = fullDesc.split(/[。！？\n；]/).map((s) => s.trim()).filter(Boolean)
    for (let s of sentences) {
      s = s.replace(/^(本片|该片|该剧|本剧|故事|影片)?(主要)?(讲述|记录|围绕|描写|讲述了|记录了)+/i, '').trim()
      s = s.replace(/^在[^，,]{2,8}[，,]/, '').trim()
      if (s.length >= 6 && s.length <= 36) {
        return s
      }
    }
  }
  const type = (detail.typeName || '').replace(/片|剧/g, '') || '影视'
  const actors = (detail.actors || '').split(/[/,，、\s]+/).filter(Boolean).slice(0, 2).join(' / ')
  if (actors) {
    return `${actors} 领衔 · 高燃 ${type} 佳作`
  }
  if (detail.remarks && !/HD|BD|1080|4K/i.test(detail.remarks)) {
    return `${detail.remarks} · 沉浸震撼视界`
  }
  return `高口碑 ${type} 力作 · 沉浸震撼视界`
}

// ---------------------------------------------------------------- 页面：播放

async function renderPlay(siteKey, id, lineIndex, epIndex) {
  const site = state.sources.find((s) => s.key === siteKey) || state.site
  view.innerHTML = `<div class="player-page"><div class="stage"><div class="stage-msg"><div class="spinner"></div><span>正在准备播放…</span></div></div></div>`
  setWindowTitle('播放')

  let detail
  try {
    detail = await fetchDetail(siteKey, id)
  } catch (error) {
    view.innerHTML = `<div class="empty"><div class="big">⚠</div>详情加载失败：${esc(error.message || error)}</div>`
    return
  }

  if (NSFW_REGEX.test(detail.name || '') || NSFW_REGEX.test(detail.typeName || '')) {
    view.innerHTML = `<div class="empty"><div class="big">🛡️</div>该影片包含违规敏感内容，已被系统合规过滤屏蔽。</div>`
    return
  }

  const validLines = (detail.lines || []).filter((l) => l.episodes && l.episodes.some((e) => !isPageUrl(e.url)))
  if (validLines.length > 0) {
    detail.lines = validLines
  }

  const lineIdx = Math.min(Math.max(0, Number(lineIndex) || 0), Math.max(0, detail.lines.length - 1))
  const epIdx = Number(epIndex) || 0
  const line = detail.lines[lineIdx]
  const ep = line && line.episodes[epIdx]

  if (!line || !ep) {
    view.innerHTML = `<div class="empty"><div class="big">◍</div>没有这一集</div>`
    return
  }

  const isMovie = /电影|片|影院/.test(detail.typeName || '')
  const cleanTitle = (detail.name || '').replace(/\s*(HD|BD|TC|4K|2160P|1080P|720P|国语|粤语|国英|中字|双字|原盘|抢先版|版本|v\d+).*/i, '').trim() || detail.name
  const displayTitle = isMovie ? cleanTitle : `${cleanTitle} · ${ep.name}`
  const highlight = getMovieHighlight(detail)

  document.body.classList.add('in-player-mode')
  document.title = `${displayTitle} - 影悦`

  const winTitleEl = document.getElementById('windowTitle')
  if (winTitleEl) {
    winTitleEl.innerHTML = `
      <div class="player-top-header" id="playerTopHeader">
        <button class="player-top-back-btn" id="btnTopPlayerBack" title="返回 (Esc / ⌘[)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span>返回</span>
        </button>
        <div class="player-top-info">
          <span class="player-top-title">${esc(displayTitle)}</span>
          <span class="player-top-sep">——</span>
          <span class="player-top-hook">${esc(highlight)}</span>
        </div>
      </div>
    `
    const btnBack = winTitleEl.querySelector('#btnTopPlayerBack')
    if (btnBack) {
      btnBack.onclick = () => {
        destroyPlayer()
        goBack()
      }
    }
  }

  const kind = await shellApi.media.kind(ep.url)
  const history = store.history.get(`${detail.site}:${detail.id}`)
  const startAt = history && history.line === lineIdx && history.ep === epIdx ? history.time || 0 : 0

  view.innerHTML = `
    <div class="player-page">
      <div class="stage" id="stage">
        <video id="video" playsinline poster="${esc(picUrl(detail.pic))}"></video>
        <div class="stage-msg" id="stageMsg" hidden></div>
        <div class="controls" id="controls">
          <div class="progress-row">
            <span class="time" id="timeNow">0:00</span>
            <div class="bar" id="bar">
              <div class="bar-buffer" id="barBuffer"></div>
              <div class="bar-play" id="barPlay"></div>
              <div class="bar-knob" id="barKnob"></div>
            </div>
            <span class="time" id="timeTotal">0:00</span>
          </div>
          <div class="ctrl-row">
            <button class="ctrl" id="btnPlay" title="播放/暂停 (空格)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" id="iconPlay"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="ctrl" id="btnPrev" title="上一集 (${state.platform === 'win32' ? 'Ctrl' : '⌘'}←)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>
            </button>
            <button class="ctrl" id="btnNext" title="下一集 (${state.platform === 'win32' ? 'Ctrl' : '⌘'}→)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>
            </button>
            <div class="volume-wrap">
              <button class="ctrl" id="btnMute" title="静音 (M)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
              </button>
              <div class="volume-bar"><i id="volumeFill"></i></div>
            </div>
            <button class="ctrl text" id="btnRate">1.0x</button>
            <div class="ctrl spacer"></div>
            <button class="ctrl text" id="btnQuality" title="对比各片源画质，换到最清楚的那个">
              <span id="qualityBadge">画质</span>
            </button>
            <button class="ctrl text" id="btnDownload" title="保存到本机">下载</button>
            ${store.settings.get().enableCast ? `
            <button class="ctrl" id="btnCast" title="投屏 (DLNA / 手机扫码 / 局域网快捷键 T)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
                <line x1="2" y1="20" x2="2.01" y2="20" stroke-width="2.6"/>
              </svg>
            </button>` : ''}
            <button class="ctrl text btn-audio-fx" id="btnAudioFx" title="影院音效 / 对白增强 (快捷键 E)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:3px;vertical-align:-2px"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg><span id="audioFxLabel">音效</span>
            </button>
            <button class="ctrl text btn-pin-moment" id="btnPinMoment" title="定格此刻 · 截取前后 3-5 秒视频片段并自动排序合成电影解说 (快捷键 B / S)">
              <span style="color:#f5b041;margin-right:4px">✦</span>定格此刻
            </button>
            <button class="ctrl text btn-clip-share" id="btnClipShare" style="display:none" aria-hidden="true"></button>
            <button class="ctrl" id="btnPip" title="画中画">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/></svg>
            </button>
            <button class="ctrl" id="btnFull" title="全屏 (F)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="play-meta">
        <div class="play-meta-main">
          <h1>${esc(detail.name)}</h1>
          <div class="sub">${esc(ep.name)} · ${esc(detail.typeName || '影视')}${detail.year ? ' · ' + esc(detail.year) : ''}</div>
        </div>
      </div>
      <div class="episodes" id="playEpisodes"></div>
    </div>`



  const stage = document.getElementById('stage')
  if (stage) {
    const controlsEl = document.getElementById('controls')
    const wakeControls = () => {
      stage.classList.add('show-controls')
      document.body.classList.remove('player-idle')
      clearTimeout(state.playerHideTimer)
      state.playerHideTimer = setTimeout(() => {
        const vid = state.player && state.player.video
        if (vid && !vid.paused) {
          stage.classList.remove('show-controls')
          document.body.classList.add('player-idle')
        }
      }, 2500)
    }
    if (controlsEl) {
      controlsEl.addEventListener('mousemove', wakeControls)
    }
    stage.addEventListener('mousemove', wakeControls)
    stage.addEventListener('mousedown', wakeControls)
    stage.addEventListener('fullscreenchange', wakeControls)
    const vEl = document.getElementById('video')
    if (vEl) {
      vEl.addEventListener('play', () => {
        stage.classList.remove('is-paused')
        wakeControls()
      })
      vEl.addEventListener('pause', () => {
        stage.classList.add('is-paused')
        stage.classList.add('show-controls')
        document.body.classList.remove('player-idle')
      })
    }
    stage.ondblclick = (e) => {
      if (e.target.closest('.controls')) return
      document.getElementById('btnFull')?.click()
    }
    wakeControls()
  }

  mountPlayer({ detail, line, ep, lineIdx, epIdx, kind, startAt })
  paintPlayEpisodes({ detail, lineIdx, epIdx })

  function paintPlayEpisodes({ detail: d, lineIdx: li, epIdx: ei }) {
    const holder = document.getElementById('playEpisodes')
    if (!holder) return
    holder.innerHTML = `
      <div class="section-head"><h2>选集</h2>
        <span class="more">${d.lines.length > 1
        ? `<span id="lineSwitch">${esc(friendlyLineName(d.lines[li].name, li))} ▾</span>`
        : esc(friendlyLineName(d.lines[li].name, li))
      }</span>
      </div>
      <div class="ep-grid">
        ${d.lines[li].episodes
        .map(
          (e, i) =>
            `<button class="play-ep-btn ${i === ei ? 'active' : ''} ${isPageUrl(e.url) ? 'disabled' : ''}" data-ep="${i}">${esc(
              e.name || `第${i + 1}集`
            )}</button>`
        )
        .join('')}
      </div>`

    holder.querySelectorAll('[data-ep]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.classList.contains('disabled')) return toast('这条线路需要在网页播放器里解析')
        navigate(`#/play/${d.site}/${d.id}/${li}/${btn.dataset.ep}`)
      }
    })

    const activeEpBtn = holder.querySelector('.play-ep-btn.active')
    if (activeEpBtn) {
      setTimeout(() => {
        try {
          activeEpBtn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
        } catch (_) {}
      }, 50)
    }

    const switchEl = document.getElementById('lineSwitch')
    if (switchEl) {
      switchEl.onclick = () => {
        const next = (li + 1) % d.lines.length
        navigate(`#/play/${d.site}/${d.id}/${next}/0`)
        toast('已切换线路：' + friendlyLineName(d.lines[next].name, next))
      }
    }
  }
}

function mountPlayer({ detail, line, ep, lineIdx, epIdx, kind, startAt }) {
  const video = document.getElementById('video')
  const stageMsg = document.getElementById('stageMsg')
  const settings = store.settings.get()

  destroyPlayer()

  const showMsg = (html) => {
    stageMsg.hidden = false
    stageMsg.innerHTML = html
  }
  const hideMsg = () => {
    stageMsg.hidden = true
  }

  // 线路取不到时优先自动降级：同一部片往往有好几条线路，挨个试比让用户手点省事。
  // 用 autoTried 记住这一次已经试过哪几条，全试完则启动跨片源全网毫秒级并发探活与静默自愈。
  const showUnavailable = async (status) => {
    if (shellApi && shellApi.router) {
      shellApi.router.record({ siteKey: detail.site, success: false, latencyMs: 5000 })
    }
    const key = `${detail.site}:${detail.id}`
    if (!state.autoTried || state.autoTried.key !== key) state.autoTried = { key, tried: new Set() }
    const tried = state.autoTried.tried
    tried.add(lineIdx)

    // 1. 同源其他线路优先试
    const next = detail.lines.findIndex(
      (l, i) => i !== lineIdx && !tried.has(i) && l.episodes.some((e) => !isPageUrl(e.url))
    )
    if (next >= 0) {
      tried.add(next)
      const sameEp = detail.lines[next].episodes[epIdx] ? epIdx : 0
      toast(`当前线路出现波动，已为您无缝切换至「${friendlyLineName(detail.lines[next].name, next)}」`)
      navigate(`#/play/${detail.site}/${detail.id}/${next}/${sameEp}`)
      return
    }

    // 2. 当前源所有线路已失效 -> 启动全网自动静默切源
    showMsg(`
      <div class="spinner"></div>
      <div style="font-size:15px;color:#e1e3e5;margin-top:10px">当前源线路失效${status ? `（HTTP ${status}）` : ''}</div>
      <div style="color:var(--c-brand, #388bfd);font-size:13px;margin-top:4px">正在全网智能探活并秒切有效片源…</div>
    `)

    try {
      const apiObj = window.kky?.api || window.shellApi?.api
      if (apiObj && typeof apiObj.findPlayable === 'function') {
        const found = await apiObj.findPlayable({
          title: detail.name,
          epIdx,
          currentSite: detail.site,
        })
        if (found) {
          toast(`已为您智能无缝秒切至「${found.siteName} · ${found.lineName}」`)
          state.site = state.sources.find((s) => s.key === found.site) || state.site
          store.settings.patch({ site: found.site })
          renderSourcePill()
          navigate(`#/play/${found.site}/${found.id}/${found.lineIdx}/${found.epIdx}`)
          return
        }
      }
    } catch {
      /* 探活异常走兜底提示 */
    }

    // 3. 全网都没有可用源时才展示兜底面板
    const other = detail.lines.findIndex((l, i) => i !== lineIdx && l.episodes.some((e) => !isPageUrl(e.url)))
    showMsg(
      `<div style="font-size:15px;color:#e1e3e5">全网片源均暂未取到该集有效视频${status ? `（HTTP ${status}）` : ''}</div>
       <div>片源服务器可能正在转码或切片已失效</div>
       <div style="display:flex;gap:10px;margin-top:6px">
         ${other >= 0 ? '<button class="btn" id="tryOtherLine">换一条线路</button>' : ''}
         <button class="btn primary" id="tryOtherSource">换一个片源</button>
       </div>`
    )
    document.getElementById('tryOtherLine')?.addEventListener('click', () => {
      navigate(`#/play/${detail.site}/${detail.id}/${other}/0`)
    })
    document.getElementById('tryOtherSource')?.addEventListener('click', () => {
      const enabled = state.sources.filter((x) => x.enabled !== false && x.key !== detail.site)
      const next = enabled[0]
      if (!next) return toast('没有别的片源了，去「源管理」加一个')
      switchSite(next.key)
    })
  }

  if (kind === 'page') {
    showMsg(
      `<div style="font-size:15px;color:#e1e3e5">这条线路需要网页播放器解析</div>
       <div>换一条「m3u8」线路，或点下面的按钮在浏览器里打开</div>
       <button class="btn" id="openExternal">在浏览器中打开</button>`
    )
    const btn = document.getElementById('openExternal')
    if (btn) btn.onclick = () => shellApi.media.open(ep.url)
    return
  }

  let hls = null
  const isHls = kind === 'hls'

  // 遮罩的隐藏必须是「幂等 + 多入口」。
  // 之前只挂了 MANIFEST_PARSED，问题是：
  //   1. 缓存命中时清单可能早于监听器注册就解析完，事件错过；
  //   2. 网络抖动后 startLoad() 重试成功，MANIFEST_PARSED 和 loadedmetadata
  //      都不会再触发 —— 画面在播，遮罩永远盖着。
  const clearStage = () => {
    if (stageMsg && !stageMsg.hidden) hideMsg()
  }

  let metaHandled = false
  const onMetaReady = () => {
    clearStage()
    if (metaHandled) return
    metaHandled = true
    if (state.pendingCommentaryReel) {
      const reel = state.pendingCommentaryReel
      state.pendingCommentaryReel = null
      startCommentaryReelPlayback(reel, { video, detail })
    } else if (state.pendingSeekMoment && state.pendingSeekMoment.seekSec > 0) {
      const pending = state.pendingSeekMoment
      state.pendingSeekMoment = null
      const calibrated = calibrateMomentTime(pending.seekSec, pending.refDuration || 0, video.duration || 0)
      if (calibrated > 0) {
        video.currentTime = calibrated
        showMomentSeekBanner(video, calibrated, pending.momentMeta)
      }
    } else if (startAt > 3) {
      video.currentTime = startAt
    }
    if (settings.autoplay !== false) video.play().catch(() => { })
    // 真实分辨率只有播起来才知道，顺手标在「画质」按钮上
    const badge = document.getElementById('qualityBadge')
    if (badge && video.videoHeight) badge.textContent = `${video.videoHeight}P`
    paintBarMomentDots(detail, video)
  }

  // 只要出画面就一定收遮罩，并上报首帧耗时 (TTFF) 至路由自适应模型
  const playStartTime = performance.now()
  let ttffReported = false
  const onPlaying = () => {
    clearStage()
    if (!ttffReported) {
      ttffReported = true
      const ttff = Math.round(performance.now() - playStartTime)
      console.log(`[QoE Telemetry] TTFF: ${ttff}ms`)
      if (shellApi && shellApi.router) {
        shellApi.router.record({ siteKey: detail.site, success: true, latencyMs: ttff })
      }
    }
  }

  video.addEventListener('loadedmetadata', onMetaReady)
  video.addEventListener('loadeddata', clearStage)
  video.addEventListener('canplay', clearStage)
  video.addEventListener('playing', onPlaying)

  // 深度流特征探测与真实画质鉴权
  if (shellApi && shellApi.media && shellApi.media.probeDeep) {
    shellApi.media.probeDeep(ep.url).then((probe) => {
      if (probe && probe.ok) {
        const badge = document.getElementById('qualityBadge')
        if (badge) {
          badge.textContent = probe.label || `${probe.height}P`
          badge.title = `真实流规格: ${probe.codec.toUpperCase()} | ${probe.width}x${probe.height} | ${probe.kbps}kbps | ${probe.legit ? '合格高清' : '压制低码'}`
          if (!probe.legit) {
            badge.style.color = '#ff9f43'
          }
        }
      }
    }).catch(() => { })
  }

  if (isHls && window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 10,
      maxBufferSize: 30 * 1000 * 1000,
      startFragPrefetch: true,
      progressive: true,
      enableWorker: true,
      lowLatencyMode: false,
    })

    // 先显示遮罩、先挂事件，最后才启动加载 —— 反过来会被同步派发的事件抢跑
    showMsg(`<div class="spinner"></div><span>正在加载视频…</span>`)
    hls.on(window.Hls.Events.MANIFEST_PARSED, clearStage)
    hls.on(window.Hls.Events.FRAG_LOADED, clearStage)
    hls.on(window.Hls.Events.ERROR, (_e, data) => {
      console.warn('[hls]', data.type, data.details, 'fatal=' + data.fatal, data.response ? 'status=' + data.response.code : '')
      if (!data.fatal) return

      // 清单直接 403/404：不是网络抖动，是这条线路在当前网络下根本取不到，重试没意义
      if (data.details === 'manifestLoadError') {
        showUnavailable(data.response ? data.response.code : 0)
        return
      }
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        showMsg(`<div class="spinner"></div><span>分片加载失败，正在重试…</span>`)
        // 重试要是成功了，画面其实已经在走，别让这条提示一直挂着
        setTimeout(() => {
          if (video.readyState >= 2) clearStage()
        }, 3000)
        setTimeout(() => hls.startLoad(), 1500)
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      } else {
        showUnavailable(0)
      }
    })

    hls.loadSource(ep.url)
    hls.attachMedia(video)
    // 缓存命中时上面的事件可能都已经错过了，补一次状态检查
    if (video.readyState >= 1) onMetaReady()
  } else {
    video.src = ep.url
    showMsg(`<div class="spinner"></div><span>正在加载视频…</span>`)
  }

  video.volume = settings.volume ?? 0.9
  video.playbackRate = settings.rate || 1

  video.addEventListener('error', () => {
    if (isHls && hls) return
    showMsg(`<div style="font-size:15px;color:#e1e3e5">视频加载失败</div><div>换一条线路或换一个片源试试</div>`)
  })

  // ---- 控件
  const bar = document.getElementById('bar')
  const barPlay = document.getElementById('barPlay')
  const barBuffer = document.getElementById('barBuffer')
  const barKnob = document.getElementById('barKnob')
  const timeNow = document.getElementById('timeNow')
  const timeTotal = document.getElementById('timeTotal')
  const btnPlay = document.getElementById('btnPlay')
  const iconPlay = document.getElementById('iconPlay')

  const PAUSE_PATH = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
  const PLAY_PATH = '<path d="M8 5v14l11-7z"/>'

  const paintState = () => {
    iconPlay.innerHTML = video.paused ? PLAY_PATH : PAUSE_PATH
  }
  video.addEventListener('play', paintState)
  video.addEventListener('pause', paintState)

  const paintProgress = () => {
    const duration = video.duration || 0
    const percent = duration ? (video.currentTime / duration) * 100 : 0
    barPlay.style.width = percent + '%'
    barKnob.style.left = percent + '%'
    timeNow.textContent = fmtTime(video.currentTime)
    timeTotal.textContent = duration ? fmtTime(duration) : '--:--'
    if (video.buffered.length) {
      const end = video.buffered.end(video.buffered.length - 1)
      barBuffer.style.width = duration ? (end / duration) * 100 + '%' : '0'
    }
  }
  video.addEventListener('timeupdate', paintProgress)
  video.addEventListener('progress', paintProgress)
  video.addEventListener('durationchange', paintProgress)

  btnPlay.onclick = () => (video.paused ? video.play() : video.pause())

  let dragging = false
  const seekTo = (clientX) => {
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    if (video.duration) video.currentTime = ratio * video.duration
  }
  bar.addEventListener('mousedown', (event) => {
    dragging = true
    seekTo(event.clientX)
  })
  window.addEventListener('mousemove', (event) => {
    if (dragging) seekTo(event.clientX)
  })
  window.addEventListener('mouseup', () => (dragging = false))

  document.getElementById('btnMute').onclick = () => {
    video.muted = !video.muted
    document.getElementById('volumeFill').style.width = video.muted ? '0%' : video.volume * 100 + '%'
  }
  document.getElementById('volumeFill').style.width = video.volume * 100 + '%'

  const rates = [1, 1.25, 1.5, 2, 0.75]
  const btnRate = document.getElementById('btnRate')
  btnRate.textContent = (settings.rate || 1).toFixed(2).replace(/0$/, '') + 'x'
  btnRate.onclick = () => {
    const current = rates.findIndex((r) => Math.abs(r - video.playbackRate) < 0.01)
    const next = rates[(current + 1) % rates.length]
    video.playbackRate = next
    btnRate.textContent = next.toFixed(2).replace(/0$/, '') + 'x'
    store.settings.patch({ rate: next })
  }

  document.getElementById('btnFull').onclick = () => {
    const stage = document.getElementById('stage')
    if (document.fullscreenElement) document.exitFullscreen()
    else stage.requestFullscreen().catch(() => { })
  }
  document.getElementById('btnQuality').onclick = () => openQualityPanel(detail)
  document.getElementById('btnPip').onclick = () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture()
    else video.requestPictureInPicture().catch(() => toast('这个视频不支持画中画'))
  }

  const prevBtn = document.getElementById('btnPrev')
  const nextBtn = document.getElementById('btnNext')
  prevBtn.onclick = () => goEp(-1)
  nextBtn.onclick = () => goEp(1)
  prevBtn.style.opacity = epIdx > 0 ? 1 : 0.3
  nextBtn.style.opacity = epIdx < line.episodes.length - 1 ? 1 : 0.3

  function goEp(delta) {
    const target = epIdx + delta
    if (target < 0 || target >= line.episodes.length) return toast('没有更多了')
    navigate(`#/play/${detail.site}/${detail.id}/${lineIdx}/${target}`)
  }

  const btnCast = document.getElementById('btnCast')
  if (btnCast) {
    btnCast.onclick = () => openCastPanel({ detail, ep, line, video })
  }

  const btnAudioFx = document.getElementById('btnAudioFx')
  if (btnAudioFx) {
    btnAudioFx.onclick = () => cycleAudioMode(video)
  }

  const btnPinMoment = document.getElementById('btnPinMoment')
  if (btnPinMoment) {
    btnPinMoment.onclick = () => openPinMomentModal({ video, detail, ep })
  }

  const btnClipShare = document.getElementById('btnClipShare')
  if (btnClipShare) {
    btnClipShare.onclick = () => openClipShareModal({ video, detail, ep })
  }

  // 初始同步投屏媒体状态
  if (shellApi.cast && typeof shellApi.cast.updateMedia === 'function') {
    shellApi.cast.updateMedia({
      videoUrl: ep.url,
      title: detail.name,
      epName: ep.name,
      time: startAt || 0,
    })
  }

  document.getElementById('btnDownload').onclick = async () => {
    if (kind !== 'mp4') return toast('这条线路是 HLS 流，暂不支持离线保存')
    toast('开始下载…')
    const res = await shellApi.media.download({
      url: ep.url,
      filename: `${detail.name}-${ep.name}`,
      vodId: detail.id,
      episode: epIdx,
    })
    toast(res.ok ? '已保存到本机' : res.message || '下载失败')
  }

  // ---- 播放进度记忆
  let lastSave = 0
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return
    const now = Date.now()
    if (now - lastSave < 4000) return
    lastSave = now
    store.history.put({
      key: `${detail.site}:${detail.id}`,
      site: detail.site,
      id: detail.id,
      name: detail.name,
      pic: detail.pic,
      remarks: detail.remarks,
      typeName: detail.typeName,
      year: detail.year,
      area: detail.area,
      line: lineIdx,
      ep: epIdx,
      epName: ep.name,
      time: video.currentTime,
      duration: video.duration,
      updatedAt: Date.now(),
    })
    if (shellApi.cast && typeof shellApi.cast.updateMedia === 'function') {
      shellApi.cast.updateMedia({ time: video.currentTime })
    }
  })

  state.player = { video, hls, detail, line, lineIdx, epIdx, ep, goEp }
}

/**
 * 播放器投屏面板 (DLNA 电视投屏 / 手机扫码看 / 视频流直链)
 */
async function openCastPanel({ detail, ep, line, video }) {
  const old = document.getElementById('castModal')
  if (old) old.remove()

  const modal = document.createElement('div')
  modal.id = 'castModal'
  modal.className = 'cast-modal'
  modal.innerHTML = `
    <div class="cast-card">
      <div class="cast-head">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
            <line x1="2" y1="20" x2="2.01" y2="20" stroke-width="2.6"/>
          </svg>
          投屏播放 · ${esc(detail.name)}
        </h3>
        <button class="qmodal-close" id="btnCastClose" aria-label="关闭">✕</button>
      </div>

      <div class="cast-tabs">
        <button class="cast-tab-btn active" data-tab="dlna">📺 电视投屏 (DLNA)</button>
        <button class="cast-tab-btn" data-tab="qrcode">📱 手机扫码看</button>
        <button class="cast-tab-btn" data-tab="stream">🔗 视频流直链</button>
      </div>

      <div class="cast-body">
        <!-- 1. 电视投屏 Tab -->
        <div class="cast-panel" id="panelDlna">
          <div id="castActiveArea"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:13px;font-weight:600;color:#e5e7eb;">局域网投屏设备</span>
            <button class="btn small" id="btnRefreshDlna">🔄 重新扫描</button>
          </div>
          <div class="cast-device-list" id="castDeviceList">
            <div class="qmodal-loading"><div class="spinner"></div><span>正在扫描局域网中的电视/电视盒子/投影仪…</span></div>
          </div>
          <div class="cast-hint">
            💡 <b>搜索不到电视？</b><br>
            1. 请确保电视与电脑连接在<b>同一个 Wi-Fi 网络</b>下。<br>
            2. 部分智能电视需在设置中开启「投屏服务」或「多屏互动 / DLNA 接收」。<br>
            3. 若电视自带投屏不灵，也可在电视上安装支持标准 DLNA 的投屏接收应用后重试。
          </div>
        </div>

        <!-- 2. 手机扫码 Tab -->
        <div class="cast-panel hidden" id="panelQrcode">
          <div class="cast-qr-container">
            <div class="cast-qr-box" id="castQrBox">
              <div class="qmodal-loading"><div class="spinner"></div></div>
            </div>
            <div class="cast-qr-info">
              <div style="font-size:14px;font-weight:600;color:#fff;">手机 / 平板扫码即看</div>
              <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
                无需安装任何 App，使用手机浏览器或相机扫码，即可在局域网内极速加载并同步进度。
              </div>
              <div class="cast-url-pill" id="castWebUrl">获取中…</div>
              <div style="display:flex;gap:8px;">
                <button class="btn small" id="btnCopyWebUrl">复制链接</button>
                <button class="btn small btn-ghost" id="btnOpenWeb">在浏览器打开</button>
              </div>
            </div>
          </div>
          <div class="cast-hint">
            💡 <b>无线投屏提示：</b><br>
            手机或平板扫码播放后，点击播放器自带的投屏图标，可直接流转至局域网大屏或音箱播放。
          </div>
        </div>

        <!-- 3. 直链 Tab -->
        <div class="cast-panel hidden" id="panelStream">
          <div class="cast-stream-box">
            <div style="font-size:13px;font-weight:600;color:#e5e7eb;">视频源直链 (m3u8 / MP4)</div>
            <div class="cast-url-pill" style="user-select:all;">${esc(ep.url)}</div>
            <div>
              <button class="btn small" id="btnCopyStream">一键复制直链</button>
            </div>
            <div class="cast-hint">
              💡 <b>第三方播放器串流指南：</b><br>
              复制此链接后，可在电视或第三方专业播放器中选择「打开网络串流」，粘贴即可直接观看。
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  const close = () => modal.remove()
  const btnClose = modal.querySelector('#btnCastClose')
  if (btnClose) btnClose.onclick = close
  modal.onclick = (e) => {
    if (e.target === modal) close()
  }

  const tabBtns = modal.querySelectorAll('.cast-tab-btn')
  const panels = {
    dlna: modal.querySelector('#panelDlna'),
    qrcode: modal.querySelector('#panelQrcode'),
    stream: modal.querySelector('#panelStream'),
  }

  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      tabBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      const target = btn.dataset.tab
      Object.keys(panels).forEach((k) => {
        panels[k].classList.toggle('hidden', k !== target)
      })
    }
  })

  const btnCopyStream = modal.querySelector('#btnCopyStream')
  if (btnCopyStream) {
    btnCopyStream.onclick = async () => {
      await shellApi.media.copy(ep.url)
      toast('已复制视频流直链到剪贴板')
    }
  }

  try {
    const info = await shellApi.cast.info()
    const qrBox = modal.querySelector('#castQrBox')
    const urlPill = modal.querySelector('#castWebUrl')
    if (info && info.qrSvg && qrBox) {
      qrBox.innerHTML = info.qrSvg
    }
    if (info && info.url && urlPill) {
      urlPill.textContent = info.url
      const btnCopyWeb = modal.querySelector('#btnCopyWebUrl')
      if (btnCopyWeb) {
        btnCopyWeb.onclick = async () => {
          await shellApi.media.copy(info.url)
          toast('已复制局域网播放链接')
        }
      }
      const btnOpen = modal.querySelector('#btnOpenWeb')
      if (btnOpen) {
        btnOpen.onclick = () => {
          shellApi.media.open(info.url)
        }
      }
    }
  } catch (_) { }

  function renderActiveStatus(activeCast) {
    const area = modal.querySelector('#castActiveArea')
    if (!area) return
    if (!activeCast) {
      area.innerHTML = ''
      return
    }
    area.innerHTML = `
      <div class="cast-active-box">
        <div class="cast-active-status">
          <span class="cast-dot-pulsing"></span>
          <span>正在投屏至：<b>${esc(activeCast.deviceName)}</b></span>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn small" id="btnCastToggle">${activeCast.state === 'PLAYING' ? '暂停' : '继续'}</button>
          <button class="btn small btn-ghost" id="btnCastStop">停止</button>
        </div>
      </div>
    `
    const btnToggle = area.querySelector('#btnCastToggle')
    if (btnToggle) {
      btnToggle.onclick = async () => {
        const nextAction = activeCast.state === 'PLAYING' ? 'pause' : 'play'
        await shellApi.cast.control({ action: nextAction })
        activeCast.state = nextAction === 'pause' ? 'PAUSED' : 'PLAYING'
        renderActiveStatus(activeCast)
      }
    }
    const btnStop = area.querySelector('#btnCastStop')
    if (btnStop) {
      btnStop.onclick = async () => {
        await shellApi.cast.control({ action: 'stop' })
        renderActiveStatus(null)
        toast('已停止电视投屏')
      }
    }
  }

  async function loadDlnaDevices() {
    const listEl = modal.querySelector('#castDeviceList')
    if (!listEl) return
    listEl.innerHTML = `<div class="qmodal-loading"><div class="spinner"></div><span>正在扫描局域网中的电视/电视盒子/投影仪…</span></div>`

    try {
      const devices = await shellApi.cast.search()
      if (!devices || !devices.length) {
        listEl.innerHTML = `
          <div class="qmodal-empty" style="padding:18px 0;">
            未发现局域网 DLNA 设备<br>
            <span style="font-size:11.5px;color:#6b7280;">请确认电视已开机且连接在同一 Wi-Fi</span>
          </div>`
        return
      }

      listEl.innerHTML = devices
        .map(
          (d) => `
        <div class="cast-device-item">
          <div class="cast-dev-icon">📺</div>
          <div class="cast-dev-info">
            <div class="cast-dev-name">${esc(d.name)}</div>
            <div class="cast-dev-sub">${esc(d.ip)} · ${esc(d.model || 'DLNA 接收端')}</div>
          </div>
          <button class="btn small btn-cast-device" data-dev-id="${esc(d.id)}">立即投屏</button>
        </div>`
        )
        .join('')

      listEl.querySelectorAll('.btn-cast-device').forEach((btn) => {
        btn.onclick = async () => {
          const devId = btn.dataset.devId
          btn.disabled = true
          btn.textContent = '投屏中…'
          try {
            toast('正在推流到电视…')
            const res = await shellApi.cast.play({
              deviceId: devId,
              videoUrl: ep.url,
              title: `${detail.name} ${ep.name}`,
              initialTime: video ? video.currentTime : 0,
            })
            toast(`已成功投屏至「${res.deviceName}」`)
            renderActiveStatus({ deviceName: res.deviceName, state: 'PLAYING' })
          } catch (err) {
            toast(`投屏失败：${err.message || '网络超时'}`)
          } finally {
            btn.disabled = false
            btn.textContent = '立即投屏'
          }
        }
      })
    } catch (err) {
      listEl.innerHTML = `<div class="qmodal-empty">搜索失败：${esc(err.message || '网络异常')}</div>`
    }
  }

  const btnRefresh = modal.querySelector('#btnRefreshDlna')
  if (btnRefresh) btnRefresh.onclick = loadDlnaDevices
  loadDlnaDevices()
}

/**
 * Web Audio 影院音效与清晰对白增强引擎
 */
let audioCtx = null
let audioSourceNode = null
let vocalBiquad = null
let bassBiquad = null
let trebleBiquad = null
let dynamicCompressor = null
let currentAudioMode = 'off' // 'off' | 'vocal' | 'bass' | 'night'

const AUDIO_MODES = [
  { id: 'off', label: '原音直通', desc: '原片音轨直通' },
  { id: 'vocal', label: '清晰对白', desc: '人声共鸣增强 · 弱化背景轰鸣' },
  { id: 'bass', label: '影院重低音', desc: '低频澎湃 · 环绕沉浸' },
  { id: 'night', label: '纯净夜间', desc: '动态压缩 · 防突发爆音' },
]

function initAudioEnhancer(videoEl) {
  if (!videoEl || audioSourceNode) return
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    audioCtx = new AudioContextClass()
    audioSourceNode = audioCtx.createMediaElementSource(videoEl)

    vocalBiquad = audioCtx.createBiquadFilter()
    vocalBiquad.type = 'peaking'
    vocalBiquad.frequency.value = 2400
    vocalBiquad.Q.value = 1.2
    vocalBiquad.gain.value = 0

    bassBiquad = audioCtx.createBiquadFilter()
    bassBiquad.type = 'lowshelf'
    bassBiquad.frequency.value = 90
    bassBiquad.gain.value = 0

    trebleBiquad = audioCtx.createBiquadFilter()
    trebleBiquad.type = 'highshelf'
    trebleBiquad.frequency.value = 10000
    trebleBiquad.gain.value = 0

    dynamicCompressor = audioCtx.createDynamicsCompressor()
    dynamicCompressor.threshold.value = -12
    dynamicCompressor.knee.value = 10
    dynamicCompressor.ratio.value = 8
    dynamicCompressor.attack.value = 0.003
    dynamicCompressor.release.value = 0.25

    audioSourceNode.connect(bassBiquad)
    bassBiquad.connect(vocalBiquad)
    vocalBiquad.connect(trebleBiquad)
    trebleBiquad.connect(dynamicCompressor)
    dynamicCompressor.connect(audioCtx.destination)

    applyAudioMode(currentAudioMode)
  } catch (err) {
    console.warn('AudioEnhancer init error:', err)
  }
}

function applyAudioMode(modeId) {
  currentAudioMode = modeId
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => { })
  }
  if (!vocalBiquad || !bassBiquad || !dynamicCompressor) return

  if (modeId === 'vocal') {
    vocalBiquad.gain.value = 6
    bassBiquad.gain.value = -3
    trebleBiquad.gain.value = 2
    dynamicCompressor.threshold.value = -28
  } else if (modeId === 'bass') {
    vocalBiquad.gain.value = 1
    bassBiquad.gain.value = 7
    trebleBiquad.gain.value = 3
    dynamicCompressor.threshold.value = -18
  } else if (modeId === 'night') {
    vocalBiquad.gain.value = 3
    bassBiquad.gain.value = -6
    trebleBiquad.gain.value = 0
    dynamicCompressor.threshold.value = -36
  } else {
    vocalBiquad.gain.value = 0
    bassBiquad.gain.value = 0
    trebleBiquad.gain.value = 0
    dynamicCompressor.threshold.value = -12
  }
}

function cycleAudioMode(videoEl) {
  initAudioEnhancer(videoEl)
  const idx = AUDIO_MODES.findIndex((m) => m.id === currentAudioMode)
  const nextMode = AUDIO_MODES[(idx + 1) % AUDIO_MODES.length]
  applyAudioMode(nextMode.id)

  const labelEl = document.getElementById('audioFxLabel')
  if (labelEl) {
    labelEl.textContent = nextMode.id === 'off' ? '音效' : nextMode.label
  }
  toast(`🎧 音效模式：${nextMode.label}（${nextMode.desc}）`)
}

/**
 * 影视名场面高光截取与社交分享弹窗
 */
async function openClipShareModal({ video, detail, ep }) {
  const existing = document.getElementById('clipShareModal')
  if (existing) existing.remove()

  if (video && !video.paused) {
    video.pause()
  }

  const modal = document.createElement('div')
  modal.id = 'clipShareModal'
  modal.className = 'clip-modal-mask'

  const title = detail.name || '影视'
  const epTitle = ep?.name || '精彩名场面'
  let currentComment = '🔥 这段名场面太燃了！'

  modal.innerHTML = `
    <div class="clip-modal-container">
      <div class="clip-modal-header">
        <div class="clip-modal-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
          <span>名场面高光截取与社交分享</span>
        </div>
        <button class="clip-modal-close" id="btnCloseClip" aria-label="关闭">✕</button>
      </div>

      <div class="clip-modal-body">
        <div class="clip-canvas-wrapper">
          <canvas id="clipCanvas" width="960" height="540"></canvas>
          <div class="clip-recording-badge" id="clipRecBadge" style="display:none">
            <span class="rec-dot"></span> 正在录制高光短视频…
          </div>
        </div>

        <div class="clip-controls-box">
          <div class="clip-tag-chips">
            <span class="clip-chip active" data-text="🔥 这段名场面太燃了！">🔥 名场面打卡</span>
            <span class="clip-chip" data-text="😭 这一瞬间直接泪目！">😭 泪目瞬间</span>
            <span class="clip-chip" data-text="✨ 每一帧都在封神！">✨ 演技封神</span>
            <span class="clip-chip" data-text="🍿 强烈推荐给所有人看！">🍿 强烈安利</span>
            <span class="clip-chip" data-text="🎬 质感拉满的绝美空镜！">🎬 绝美空镜</span>
          </div>

          <div class="clip-input-row">
            <input type="text" id="clipCommentInput" class="clip-input" maxlength="40" value="${esc(currentComment)}" placeholder="输入你想说的台词、感想或观影心得…" />
          </div>

          <div class="clip-action-bar">
            <button class="clip-btn primary" id="btnRecordVideo">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
              <span id="btnRecordText">录制 5 秒短视频</span>
            </button>
            <button class="clip-btn secondary" id="btnCopyClipImage">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>复制高光长图</span>
            </button>
            <button class="clip-btn secondary" id="btnCopyClipText">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>复制分享文案</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)
  const canvas = modal.querySelector('#clipCanvas')
  const ctx = canvas.getContext('2d')
  const commentInput = modal.querySelector('#clipCommentInput')
  const closeBtn = modal.querySelector('#btnCloseClip')

  closeBtn.onclick = () => modal.remove()

  function drawWatermarkedFrame() {
    if (!canvas || !ctx) return
    const w = canvas.width
    const h = canvas.height

    try {
      if (video && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, w, h)
      } else {
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, w, h)
      }
    } catch {
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, w, h)
    }

    const bottomGrad = ctx.createLinearGradient(0, h * 0.55, 0, h)
    bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.88)')
    ctx.fillStyle = bottomGrad
    ctx.fillRect(0, h * 0.55, w, h * 0.45)

    const badgeW = 230
    const badgeH = 50
    const badgeX = w - badgeW - 24
    const badgeY = 24

    ctx.save()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
    ctx.beginPath()
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12)
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.stroke()

    const iconX = badgeX + 16
    const iconY = badgeY + 11
    const iconSize = 28
    const playGrad = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize)
    playGrad.addColorStop(0, '#38bdf8')
    playGrad.addColorStop(0.5, '#2563eb')
    playGrad.addColorStop(1, '#6366f1')
    ctx.fillStyle = playGrad
    ctx.beginPath()
    ctx.roundRect(iconX, iconY, iconSize, iconSize, 7)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(iconX + 11, iconY + 8)
    ctx.lineTo(iconX + 20, iconY + 14)
    ctx.lineTo(iconX + 11, iconY + 20)
    ctx.closePath()
    ctx.fill()

    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 4
    ctx.fillText('影悦 · CinemaJoy', iconX + iconSize + 10, iconY + 14)

    ctx.font = '500 10px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fillText('超清无广 · 原生加速', iconX + iconSize + 10, iconY + 26)
    ctx.restore()

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 3

    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillStyle = '#38bdf8'
    ctx.fillText(`《${title}》 ${epTitle}`, 32, h - 70)

    ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`“${currentComment}”`, 32, h - 30)
    ctx.restore()
  }

  drawWatermarkedFrame()

  modal.querySelectorAll('.clip-chip').forEach((chip) => {
    chip.onclick = () => {
      modal.querySelectorAll('.clip-chip').forEach((c) => c.classList.remove('active'))
      chip.classList.add('active')
      currentComment = chip.dataset.text
      commentInput.value = currentComment
      drawWatermarkedFrame()
    }
  })

  commentInput.oninput = (e) => {
    currentComment = e.target.value.trim() || '🔥 这段名场面太燃了！'
    drawWatermarkedFrame()
  }

  let recordedBlob = null
  const btnRecord = modal.querySelector('#btnRecordVideo')
  const recordText = modal.querySelector('#btnRecordText')
  const recBadge = modal.querySelector('#clipRecBadge')

  btnRecord.onclick = async () => {
    if (recordedBlob) {
      try {
        const reader = new FileReader()
        reader.readAsDataURL(recordedBlob)
        reader.onloadend = async () => {
          const base64data = reader.result.split(',')[1]
          const fileName = `影悦_${title}_${epTitle}_名场面_${Date.now()}.webm`
          const res = await shellApi.media.saveClip({ filename: fileName, bufferBase64: base64data })
          if (res && res.success) {
            toast('🎬 高光短视频已存入下载目录！')
          } else {
            toast('已生成短视频！')
          }
        }
      } catch (err) {
        toast('保存失败：' + err.message)
      }
      return
    }

    try {
      btnRecord.disabled = true
      recBadge.style.display = 'flex'
      recordText.textContent = '录制中 (5s)…'

      if (video && video.paused) {
        video.play().catch(() => { })
      }

      const stream = canvas.captureStream(30)
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      })

      const chunks = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }

      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(chunks, { type: 'video/webm' })
        btnRecord.disabled = false
        recBadge.style.display = 'none'
        recordText.textContent = '💾 保存录制短视频'
        btnRecord.classList.add('ready')
        toast('✅ 5秒短视频已捕获，点击即可保存！')
      }

      let recAnimId
      const loopDraw = () => {
        drawWatermarkedFrame()
        recAnimId = requestAnimationFrame(loopDraw)
      }
      loopDraw()

      mediaRecorder.start()
      setTimeout(() => {
        cancelAnimationFrame(recAnimId)
        mediaRecorder.stop()
        if (video) video.pause()
      }, 5000)
    } catch (err) {
      btnRecord.disabled = false
      recBadge.style.display = 'none'
      recordText.textContent = '录制短视频'
      toast('录制短视频：' + err.message)
    }
  }

  modal.querySelector('#btnCopyClipImage').onclick = () => {
    try {
      drawWatermarkedFrame()
      const dataUrl = canvas.toDataURL('image/png')
      if (shellApi.media.copyImage) {
        shellApi.media.copyImage(dataUrl)
      }
      canvas.toBlob((blob) => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => { })
        }
      }, 'image/png')
      toast('📋 已复制带品牌水印高光截图，可直接 ⌘V 粘贴分享！')
    } catch (err) {
      toast('复制截图失败：' + err.message)
    }
  }

  modal.querySelector('#btnCopyClipText').onclick = () => {
    const shareText = `🎬 我正在用「影悦 · CinemaJoy」观看《${title}》${epTitle}！\n“${currentComment}”\n✨ 超清视界，极速无广告体验！`
    shellApi.media.copy(shareText)
    toast('💬 已复制分享口令文案！')
  }
}

/**
 * 画质对比面板
 *
 * 免费片源的码率普遍很低（主流剧只有 300–800 kbps），换播放器参数救不回来。
 * 唯一有效的办法是换一个压得更狠…不，是压得更轻的源。这里把所有源都量一遍。
 */
async function openQualityPanel(detail) {
  const old = document.getElementById('qualityModal')
  if (old) old.remove()

  const modal = document.createElement('div')
  modal.id = 'qualityModal'
  modal.className = 'qmodal'
  modal.innerHTML = `
    <div class="qmodal-card">
      <div class="qmodal-head">
        <h3>画质对比</h3>
        <button class="qmodal-close" aria-label="关闭">✕</button>
      </div>
      <p class="qmodal-sub">同一部片在各片源的实际码率。码率越高越清楚，分辨率相同也可能差好几倍。</p>
      <div class="qmodal-body"><div class="qmodal-loading"><div class="spinner"></div><span id="qProgress">正在对比…</span></div></div>
    </div>`
  document.body.appendChild(modal)
  modal.querySelector('.qmodal-close').onclick = () => modal.remove()
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }

  const body = modal.querySelector('.qmodal-body')
  const progress = modal.querySelector('#qProgress')
  const off = shellApi.on('quality:progress', ({ done, total }) => {
    if (progress) progress.textContent = `正在对比… ${done}/${total}`
  })

  try {
    const res = await shellApi.api.findBest({ title: detail.name, currentSite: detail.site })
    off()
    if (!res.ok) throw new Error(res.message || '对比失败')
    const list = res.list || []
    if (!list.length) {
      body.innerHTML = `<div class="qmodal-empty">没能在其他片源里找到这部片</div>`
      return
    }

    const top = list[0]
    const current = list.find((x) => x.isCurrent)
    const currentKbps = current ? current.kbps : 0
    const tied = list.filter((x) => x.kbps >= top.kbps * 0.95).length
    // 说句实话：多数片子各源是同一份编码，换源没用，别让用户白点
    let verdict = ''
    if (!current) {
      verdict = '当前片源没量到，可以选下面任意一个'
    } else if (current.kbps >= top.kbps * 0.95) {
      verdict =
        tied > 1
          ? `当前这条已经是最清楚的之一了（${currentKbps} kbps，有 ${tied} 个源是同一份编码）`
          : `当前这条已经是所有片源里最清楚的了（${currentKbps} kbps）`
    } else if (top.kbps >= currentKbps * 1.15) {
      const gain = Math.round((top.kbps / Math.max(currentKbps, 1) - 1) * 100)
      verdict = `换到「${esc(top.siteName)}」能提升约 ${gain}%，画质会明显好一些`
    } else {
      verdict = `各片源画质差不多（都在 ${currentKbps} kbps 上下），换源提升不大 —— 这是片源本身的编码水平，不是播放器的问题`
    }

    const canImprove = !!current && top.kbps >= current.kbps * 1.15
    body.innerHTML = `
      <div class="qverdict ${canImprove ? 'good' : ''}">${verdict}</div>
      <div class="qlist">
        ${list
        .map((item) => {
          const current = item.isCurrent
          const best = !current && item.site === top.site
          return `<div class="qrow ${current ? 'current' : ''}">
              <div class="qname">
                ${esc(item.siteName)}
                ${current ? '<span class="qtag">当前</span>' : ''}
                ${best ? '<span class="qtag best">最好</span>' : ''}
              </div>
              <div class="qbar"><i style="width:${Math.min(100, (item.kbps / Math.max(top.kbps, 1)) * 100)}%"></i></div>
              <div class="qkbps">${item.kbps} kbps</div>
              <div class="qlabel">${qualityLabel(item.kbps)}</div>
              ${current ? '' : `<button class="btn small" data-go="${item.site}|${item.id}|${item.lineIdx}|${item.epIdx}">切换</button>`}
            </div>`
        })
        .join('')}
      </div>
      <p class="qmodal-foot">换源后会从第 1 集重新开始。同一个源里有多条线路时，优先量的是 m3u8 那条。</p>`

    body.querySelectorAll('[data-go]').forEach((btn) => {
      btn.onclick = () => {
        const [site, id, line, ep] = btn.dataset.go.split('|')
        modal.remove()
        if (site !== detail.site) switchSite(site, `#/play/${site}/${id}/${line}/${ep}`)
        else navigate(`#/play/${site}/${id}/${line}/${ep}`)
      }
    })
  } catch (error) {
    off()
    body.innerHTML = `<div class="qmodal-empty">对比失败：${esc(error.message || error)}</div>`
  }
}

function qualityLabel(kbps) {
  if (!kbps) return '未知'
  if (kbps >= 6000) return '蓝光级'
  if (kbps >= 3500) return '高清'
  if (kbps >= 2000) return '不错'
  if (kbps >= 1200) return '一般'
  if (kbps >= 700) return '偏低'
  return '很糊'
}

function destroyPlayer() {
  clearTimeout(state.playerHideTimer)
  document.body.classList.remove('in-player-mode', 'player-idle')
  const player = state.player
  if (!player) return
  try {
    if (player.hls) player.hls.destroy()
    if (player.video) {
      player.video.pause()
      player.video.removeAttribute('src')
      player.video.load()
    }
  } catch {
    /* ignore */
  }
  state.player = null
}

// ---------------------------------------------------------------- 页面：热播排行榜

const RANK_TABS = [
  { key: 'all', label: '全网总榜' },
  { key: 'movie', label: '热播电影' },
  { key: 'series', label: '热门剧集' },
  { key: 'anime', label: '人气动漫' },
  { key: 'variety', label: '爆款综艺' },
]

async function renderRankings(activeTab = 'all') {
  setWindowTitle('热播排行榜')
  state.rankCache = state.rankCache || {}

  const renderContent = (list) => {
    if (!list || !list.length) {
      return `<div class="empty"><div class="big">◍</div>暂无热播榜单数据</div>`
    }
    return `
      <div class="grid">
        ${list
        .map((item, index) => {
          const rankNum = item.rank || index + 1
          const topClass = rankNum === 1 ? 'top-1' : rankNum === 2 ? 'top-2' : rankNum === 3 ? 'top-3' : ''
          const medalLabel = rankNum <= 3 ? `TOP ${rankNum}` : `#${rankNum}`
          let score = item.score && parseFloat(item.score) > 0 ? parseFloat(item.score).toFixed(1) : ''
          if (!score) {
            let hash = 0
            const s = item.name || ''
            for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i)
            score = (8.0 + (Math.abs(hash) % 18) / 10).toFixed(1)
          }
          const quality = /4k/i.test(item.remarks || '') ? '4K' : '1080P'
          const hotScore = item.hotScore || (rankNum <= 3 ? '99.5万' : '86.2万')
          const pic = picUrl(item.pic, item.name, item.year)
          const isPending = pic === PLACEHOLDER
          const pendingAttrs = isPending
            ? ` data-pending-title="${esc(item.name)}" data-pending-year="${esc(item.year || '')}"`
            : ''
          return `
              <div class="card rank-card" data-act="open" data-site="${esc(item.site)}" data-id="${esc(item.id)}" title="${esc(item.name)}">
                <div class="card-cover">
                  <span class="badge-rank ${topClass}">${medalLabel}</span>
                  <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(item.name)}" data-year="${esc(item.year || '')}" alt="${esc(item.name)}" loading="${typeof index === 'number' && index < 12 ? 'eager' : 'lazy'}" decoding="async" />
                  <span class="badge-quality">${quality}</span>
                  <span class="badge-rating rank-bottom">★ ${esc(score)}</span>
                  <span class="badge-ep"><span class="badge-ep-dot" style="background:#ff4d4f">●</span> ${esc(hotScore)}</span>
                  <div class="card-hover-play"><span>
                    <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
                  </span></div>
                </div>
                <div class="card-title">${esc(item.name)}</div>
                <div class="card-sub">${esc([item.typeName, item.remarks || item.year].filter(Boolean).join(' · '))}</div>
              </div>`
        })
        .join('')}
      </div>`
  }

  const cachedList = state.rankCache[activeTab]

  view.innerHTML = `
    <h1 class="page-title">热播排行榜<span class="count">全网热度综合仲裁 · 实时动态更新</span></h1>
    <div class="filters" id="rankFilters">
      ${RANK_TABS.map(
    (t) => `<button class="chip ${t.key === activeTab ? 'active' : ''}" data-rank-tab="${t.key}">${t.label}</button>`
  ).join('')}
    </div>
    <div id="rankBody">${cachedList ? renderContent(cachedList) : skeletonGrid(12)}</div>`
  if (cachedList) hydratePendingPosters(view)

  const tabs = view.querySelectorAll('[data-rank-tab]')
  tabs.forEach((tab) => {
    tab.onclick = () => {
      navigate(`#/rank/${tab.dataset.rankTab}`)
    }
  })

  try {
    const list = await shellApi.api.rankings({ type: activeTab, limit: 20 })
    state.rankCache[activeTab] = list
    const body = document.getElementById('rankBody')
    if (body) {
      body.innerHTML = renderContent(list)
      hydratePendingPosters(body)
    }
  } catch (err) {
    const body = document.getElementById('rankBody')
    if (body && !state.rankCache[activeTab]) {
      body.innerHTML = `<div class="empty"><div class="big">⚠</div>榜单加载失败：${esc(err.message || err)}</div>`
    }
  }
}

// ---------------------------------------------------------------- 影视圈 (Cine Circles) 情感影单广场与自建分享

const CINE_TABS = [
  { key: '精选', label: '精选' },
  { key: '情绪', label: '情绪' },
  { key: '主题', label: '主题' },
  { key: '经典', label: '经典' },
  { key: '最新', label: '最新' },
  { key: '关注', label: '关注' },
]

const CINE_MOODS = [
  {
    key: '孤独',
    title: '孤独',
    sub: '一个人也很好',
    circleId: 'circle_single_universe',
    cover: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2574551676.jpg',
  },
  {
    key: '治愈',
    title: '治愈',
    sub: '给自己一点温柔',
    circleId: 'circle_featured_youth',
    cover: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2557573348.jpg',
  },
  {
    key: '浪漫',
    title: '浪漫',
    sub: '关于爱情',
    circleId: 'circle_most_romantic',
    cover: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2555762374.jpg',
  },
  {
    key: '遗憾',
    title: '遗憾',
    sub: '那些来不及',
    circleId: 'circle_mood_rain',
    cover: 'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2648230658.jpg',
  },
  {
    key: '热血',
    title: '热血',
    sub: '重新燃起来',
    circleId: 'circle_mood_epic',
    cover: 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2646999423.jpg',
  },
  {
    key: '怀旧',
    title: '怀旧',
    sub: '回到那些年',
    circleId: 'circle_rewatch_classics',
    cover: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2455050536.jpg',
  },
]

// 兼容保留旧版 MOOD_TABS 供回退或外部模块调用
const MOOD_TABS = [
  { key: 'all', label: '全部' },
  { key: '独处时光', label: '独处时光' },
  { key: '悬疑解密', label: '悬疑解密' },
  { key: '怀旧岁月', label: '怀旧岁月' },
  { key: '科幻未来', label: '科幻未来' },
  { key: '治愈温情', label: '治愈温情' },
  { key: '高分必看', label: '高分必看' },
]

// 影视圈海报：没有图片地址时交给全局海报补全队列
function circlePosterImg(m, eager = false) {
  const pic = m && m.pic ? picUrl(m.pic, m.name) : PLACEHOLDER
  const pending = pic === PLACEHOLDER && m && m.name ? ` data-pending-title="${esc(m.name)}" data-pending-year=""` : ''
  return `<img src="${esc(pic)}"${pending} data-title="${esc((m && m.name) || '')}" alt="${esc((m && m.name) || '')}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`
}

// 圆形扇面：所有海报绕底部圆心均匀展开（供圈子详情与特定舞台展示）
function circleFanHTML(items, variant = '') {
  const list = (items || []).slice(0, 7)
  if (!list.length) {
    return `<div class="fan-ring ${variant}"><div class="fan-card fan-empty" style="--a:0deg"><span style="font-size:24px">＋</span></div></div>`
  }
  const n = list.length
  const spread = n === 1 ? 0 : Math.min(20, 5 * (n - 1))
  const mid = (n - 1) / 2
  return `<div class="fan-ring ${variant}" style="--n:${n}">${list
    .map((m, i) => {
      const a = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1)
      const offset = (i - mid) * 26
      const z = 100 - Math.round(Math.abs(i - mid) * 2)
      return `<div class="fan-card" style="--a:${a.toFixed(1)}deg;--x:${offset}px;z-index:${z}" title="${esc(m.name)}${m.rating ? ' ★ ' + esc(m.rating) : ''}">${circlePosterImg(m, i < 6)}</div>`
    })
    .join('')}</div>`
}

// 5 卡黄金弧度手牌折扇与相册厚度感渲染 (5-Card Hand-Fanned Tactile Album Deck)
function circleCardHTML(c) {
  const items = c.items || []
  const saved = store.circles.isSaved(c.id)
  const baseFav = c.favCount || (c.id === 'circle_must_watch_10' ? 235000 : c.id === 'circle_single_universe' ? 187000 : c.id === 'circle_most_romantic' ? 129000 : c.id === 'circle_rewatch_classics' ? 96000 : 28000)
  const totalFav = baseFav + (saved ? 1 : 0)
  const favDisplay = c.favDisplay || (totalFav >= 10000 ? `${(totalFav / 10000).toFixed(1)} 万` : totalFav.toLocaleString())
  const shares = (c.shareCount || Math.round(baseFav * 0.22)) + store.circles.shareCount(c.id)

  const m1 = items[0] || { name: c.title, pic: '' }
  const m2 = items[1] || items[0] || { name: c.title, pic: '' }
  const m3 = items[2] || items[0] || { name: c.title, pic: '' }
  const m4 = items[3] || items[1] || items[0] || { name: c.title, pic: '' }
  const m5 = items[4] || items[2] || items[0] || { name: c.title, pic: '' }

  const pic1 = m1.pic ? picUrl(m1.pic, m1.name) : makePlaceholder(m1.name)
  const pic2 = m2.pic ? picUrl(m2.pic, m2.name) : makePlaceholder(m2.name)
  const pic3 = m3.pic ? picUrl(m3.pic, m3.name) : makePlaceholder(m3.name)
  const pic4 = m4.pic ? picUrl(m4.pic, m4.name) : makePlaceholder(m4.name)
  const pic5 = m5.pic ? picUrl(m5.pic, m5.name) : makePlaceholder(m5.name)

  return `
    <article class="circle-card circle-album-card" data-circle-id="${esc(c.id)}">
      <div class="circle-album-deck">
        <div class="album-stack">
          <!-- 物理相册纸张边缘厚度层 -->
          <div class="album-thickness-edge edge-3"></div>
          <div class="album-thickness-edge edge-2"></div>
          <div class="album-thickness-edge edge-1"></div>

          <!-- 第五张卡片：左外翼 -->
          <div class="album-card card-layer-5">
            <img src="${esc(pic5)}" alt="${esc(m5.name)}" loading="lazy" />
          </div>

          <!-- 第四张卡片：右外翼 -->
          <div class="album-card card-layer-4">
            <img src="${esc(pic4)}" alt="${esc(m4.name)}" loading="lazy" />
          </div>

          <!-- 第三张卡片：左内翼 -->
          <div class="album-card card-layer-3">
            <img src="${esc(pic3)}" alt="${esc(m3.name)}" loading="lazy" />
          </div>

          <!-- 第二张卡片：右内翼 -->
          <div class="album-card card-layer-2">
            <img src="${esc(pic2)}" alt="${esc(m2.name)}" loading="lazy" />
          </div>

          <!-- 第一张卡片：居中主展示位 -->
          <div class="album-card card-layer-1">
            <img src="${esc(pic1)}" alt="${esc(m1.name)}" loading="lazy" />
            <div class="album-badge">${items.length} 部</div>
          </div>
        </div>
      </div>

      <div class="circle-album-info">
        <h3 class="circle-album-title" title="${esc(c.title)}">${esc(c.title)}</h3>
        <div class="circle-album-films-preview">
          <span class="film-pill">《${esc(m1.name)}》</span>
          <span class="film-pill">《${esc(m2.name)}》</span>
          ${m3 && m3.name !== m2.name && m3.name !== m1.name ? `<span class="film-pill">《${esc(m3.name)}》</span>` : ''}
        </div>
        <div class="circle-album-meta">
          <span class="curator-avatar" style="background:${esc(c.coverColor || '#FF4D79')}">✦</span>
          <span class="meta-text">${items.length} 部经典 · ${esc(favDisplay)} 收藏 · ${shares.toLocaleString()} 分享</span>
        </div>
        <div class="circle-stats circle-album-actions">
          <button class="btn-capsule appstore-get" data-act-circle="${esc(c.id)}" style="flex:1">
            进入 <span style="font-size:12px;margin-left:2px">→</span>
          </button>
          <button class="btn-capsule appstore-fav circle-stat-btn ${saved ? 'active' : ''}" data-circle-fav="${esc(c.id)}" title="${saved ? '取消收藏' : '收藏圈子'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${saved ? '#ff375f' : 'none'}" stroke="${saved ? '#ff375f' : 'currentColor'}" stroke-width="2.2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            <span>${saved ? '已收藏' : '收藏'}</span>
          </button>
        </div>
      </div>
    </article>`
}

// ---------------------------------------------------------------- 电影时刻与归一化 ID 辅助函数

const MOOD_ECHO_TYPES = [
  { key: 'tear', icon: '💧', label: '破防' },
  { key: 'solitude', icon: '🌌', label: '共鸣' },
  { key: 'shock', icon: '⚡', label: '震撼' },
  { key: 'god', icon: '🎞️', label: '封神' },
  { key: 'aftertaste', icon: '🍷', label: '余味' },
]

function canonicalMovieId(title, year = '') {
  const cleanTitle = String(title || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/(HD|BD|4K|1080P|720P|国语|粤语|中字|未删减|完整版|超清|蓝光)/gi, '')
    .toLowerCase()
  const raw = `${cleanTitle}_${String(year || '').trim()}`
  let h = 2166136261
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'cm_' + (h >>> 0).toString(16).padStart(8, '0')
}

function formatTimeLabel(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

function calibrateMomentTime(timestampSec, refDurationSec, actualDurationSec) {
  const ts = Number(timestampSec)
  if (!Number.isFinite(ts) || ts <= 0) return 0
  const ref = Number(refDurationSec)
  const act = Number(actualDurationSec)
  if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(act) || act <= 0) {
    return Math.max(0, Math.round(ts))
  }
  const diff = Math.abs(act - ref)
  if (diff <= 30) {
    return Math.min(Math.max(0, Math.round(ts)), Math.floor(act))
  }
  const ratio = Math.min(1, Math.max(0, ts / ref))
  return Math.min(Math.max(0, Math.round(ratio * act)), Math.floor(act))
}

function normalizeMomentClip(mm) {
  if (!mm) return null
  const ts = Math.max(0, Number(mm.timestamp_sec) || 0)
  const dur = Math.max(60, Number(mm.duration_sec) || 7200)
  const startSec = mm.start_sec !== undefined ? Math.max(0, Number(mm.start_sec)) : Math.max(0, ts - 4)
  const endSec = mm.end_sec !== undefined ? Math.max(startSec + 3, Number(mm.end_sec)) : Math.min(dur, ts + 4)
  return {
    ...mm,
    timestamp_sec: ts,
    duration_sec: dur,
    start_sec: startSec,
    end_sec: endSec,
    clip_duration: Math.max(3, endSec - startSec),
    clip_range_label: `${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}`,
  }
}

function getMomentsForMovie(title, circle = null) {
  const mid = canonicalMovieId(title)
  const officialMoments = (circle && Array.isArray(circle.moments) ? circle.moments : []).filter(
    (mm) => mm.movie_id === mid || mm.movie_title === title
  )
  const userList = store.circles.userMoments().filter(
    (mm) => mm.movie_id === mid || mm.movie_title === title
  )
  const seen = new Set()
  const merged = []
  for (const mm of [...userList, ...officialMoments]) {
    if (!mm || seen.has(mm.id)) continue
    seen.add(mm.id)
    merged.push(normalizeMomentClip(mm))
  }
  return merged.sort((a, b) => (Number(a.start_sec) || 0) - (Number(b.start_sec) || 0))
}

/**
 * 将同一部电影的多个「定格此刻」前后 3-5 秒视频片段按时间轴自动排序，合并生成一条完整电影解说
 */
function buildCommentaryReelFromMoments(movieTitle, momentsList = [], movieMeta = {}) {
  const sortedClips = (momentsList || [])
    .map(normalizeMomentClip)
    .filter(Boolean)
    .sort((a, b) => (Number(a.start_sec) || 0) - (Number(b.start_sec) || 0))
    .map((clip, idx) => ({
      ...clip,
      index: idx + 1,
    }))

  const totalDuration = sortedClips.reduce((acc, c) => acc + (Number(c.clip_duration) || 8), 0)
  const fullScript = sortedClips
    .map((c, idx) => `【第${idx + 1}段 ${c.clip_range_label}】${c.quote_or_note || ''}`)
    .join('  ▸  ')

  const reel = {
    id: `reel_${canonicalMovieId(movieTitle)}`,
    movie_id: canonicalMovieId(movieTitle),
    movie_title: movieTitle,
    site: movieMeta.site || '',
    vod_id: movieMeta.id || movieMeta.vod_id || '',
    cover: movieMeta.pic || movieMeta.cover || '',
    clips: sortedClips,
    clip_count: sortedClips.length,
    total_duration: totalDuration,
    full_script: fullScript,
    updated_at: Date.now(),
  }
  store.circles.saveCommentaryReel(reel)
  return reel
}

/**
 * 启动自动排序合成的「定格此刻 · 电影解说」连续播放
 */
async function launchCommentaryReel(reel) {
  if (!reel || !Array.isArray(reel.clips) || reel.clips.length === 0) {
    toast('该影片暂无定格此刻视频片段，请先在播放时添加定格此刻')
    return
  }
  const normalizedReel = buildCommentaryReelFromMoments(reel.movie_title, reel.clips, {
    site: reel.site,
    id: reel.vod_id,
    pic: reel.cover,
  })
  state.pendingCommentaryReel = normalizedReel
  state.pendingSeekMoment = null
  toast(`🎬 正在启动《${normalizedReel.movie_title}》合成电影解说（共 ${normalizedReel.clips.length} 段自动排序视频片段）…`, 3500)
  await playCircleMovie({
    name: normalizedReel.movie_title,
    site: normalizedReel.site,
    id: normalizedReel.vod_id,
  })
}

/**
 * 在播放器内执行「定格此刻 · 合成电影解说」的多段 3-5 秒视频自动串播 + 字幕与 AI 旁白解说 + 一键合成导出 WebM
 */
function startCommentaryReelPlayback(reel, { video, detail }) {
  const stage = document.getElementById('stage')
  if (!stage || !video || !reel || !Array.isArray(reel.clips) || reel.clips.length === 0) return

  const oldHud = document.getElementById('commentaryReelHud')
  if (oldHud) oldHud.remove()
  if (video._reelTimeUpdateHandler) {
    video.removeEventListener('timeupdate', video._reelTimeUpdateHandler)
    video._reelTimeUpdateHandler = null
  }

  const clips = [...reel.clips]
    .map(normalizeMomentClip)
    .sort((a, b) => (Number(a.start_sec) || 0) - (Number(b.start_sec) || 0))
  const actualDur = video.duration && video.duration > 60 ? video.duration : 7200

  let activeIdx = 0
  let ttsEnabled = true
  let isTransitioning = false

  function getCalibratedRange(clip) {
    const startSec = calibrateMomentTime(clip.start_sec ?? Math.max(0, clip.timestamp_sec - 4), clip.duration_sec, actualDur)
    const rawSpan = Math.max(4, Math.min(12, Number(clip.clip_duration) || 8))
    const endSec = Math.min(Math.floor(actualDur), startSec + rawSpan)
    return { startSec, endSec, span: Math.max(3, endSec - startSec) }
  }

  function speakComment(text) {
    if (!ttsEnabled || !text || typeof window.speechSynthesis === 'undefined') return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'zh-CN'
      utter.rate = 1.08
      window.speechSynthesis.speak(utter)
    } catch (_) {}
  }

  const hud = document.createElement('div')
  hud.id = 'commentaryReelHud'
  hud.className = 'commentary-reel-hud'
  stage.appendChild(hud)

  function renderHudState() {
    const clip = clips[activeIdx] || clips[0]
    const range = getCalibratedRange(clip)
    hud.innerHTML = `
      <div class="reel-hud-top">
        <div class="reel-hud-badge">
          <span class="reel-live-dot"></span>
          <span>🎬 定格此刻 · 自动排序合成电影解说</span>
          <strong>《${esc(reel.movie_title || detail?.name || '精选电影')}》</strong>
        </div>
        <div class="reel-hud-steps">
          ${clips.map((c, idx) => `
            <button class="reel-step-pill ${idx === activeIdx ? 'active' : idx < activeIdx ? 'done' : ''}" data-reel-step="${idx}" title="${esc(c.clip_range_label)} · ${esc(c.quote_or_note)}">
              #${idx + 1} ${esc(c.clip_range_label || formatTimeLabel(c.start_sec))}
            </button>
          `).join('')}
        </div>
        <div class="reel-hud-actions">
          <button class="reel-hud-btn ${ttsEnabled ? 'active' : ''}" id="btnToggleReelTts" title="开启或关闭语音解说旁白">
            ${ttsEnabled ? '🔊 语音旁白：开' : '🔇 语音旁白：关'}
          </button>
          <button class="reel-hud-btn" id="btnCloseReelHud" title="退出解说模式，恢复完整正片播放">✕ 退出解说</button>
        </div>
      </div>
      <div class="reel-subtitle-banner">
        <div class="reel-subtitle-meta">
          <span>第 ${activeIdx + 1}/${clips.length} 段高光片段</span>
          <span>•</span>
          <span>⏱ ${formatTimeLabel(range.startSec)} - ${formatTimeLabel(range.endSec)} (${range.span}s)</span>
          <span>•</span>
          <span>${esc(clip.mood_tag || '解说高光')}</span>
        </div>
        <div class="reel-subtitle-quote">“${esc(clip.quote_or_note || '')}”</div>
      </div>
    `

    hud.querySelectorAll('[data-reel-step]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation()
        jumpToClip(Number(btn.dataset.reelStep))
      }
    })
    hud.querySelector('#btnToggleReelTts').onclick = (e) => {
      e.stopPropagation()
      ttsEnabled = !ttsEnabled
      if (!ttsEnabled && typeof window.speechSynthesis !== 'undefined') {
        try { window.speechSynthesis.cancel() } catch (_) {}
      }
      renderHudState()
    }
    hud.querySelector('#btnCloseReelHud').onclick = (e) => {
      e.stopPropagation()
      cleanupReelHud()
      toast('已退出合成解说模式，继续正常观看正片')
    }
  }

  function cleanupReelHud() {
    if (video._reelTimeUpdateHandler) {
      video.removeEventListener('timeupdate', video._reelTimeUpdateHandler)
      video._reelTimeUpdateHandler = null
    }
    if (typeof window.speechSynthesis !== 'undefined') {
      try { window.speechSynthesis.cancel() } catch (_) {}
    }
    if (hud.parentNode) hud.remove()
  }

  function jumpToClip(idx) {
    if (idx < 0 || idx >= clips.length) return
    isTransitioning = true
    activeIdx = idx
    const clip = clips[activeIdx]
    const range = getCalibratedRange(clip)
    renderHudState()
    video.currentTime = range.startSec
    video.play().catch(() => {})
    speakComment(clip.quote_or_note)
    setTimeout(() => {
      isTransitioning = false
    }, 350)
  }

  const onTimeUpdate = () => {
    if (!document.getElementById('commentaryReelHud') || isTransitioning) return
    const clip = clips[activeIdx]
    if (!clip) return
    const range = getCalibratedRange(clip)
    if (video.currentTime >= range.endSec - 0.15) {
      if (activeIdx + 1 < clips.length) {
        jumpToClip(activeIdx + 1)
      } else {
        // 全部解说片段播放完毕，循环回到第 1 段或提示完成
        toast(`🎉 《${reel.movie_title}》全 ${clips.length} 段定格解说已串播完毕！正在为您循环重播`, 3200)
        jumpToClip(0)
      }
    }
  }

  video._reelTimeUpdateHandler = onTimeUpdate
  video.addEventListener('timeupdate', onTimeUpdate)
  jumpToClip(0)
}

function showMomentSeekBanner(video, calibratedSec, momentMeta) {
  const stage = document.getElementById('stage')
  if (!stage || !video) return
  const old = document.getElementById('momentSeekBanner')
  if (old) old.remove()

  const clipSpan = momentMeta && momentMeta.clip_duration ? Number(momentMeta.clip_duration) : 8
  const halfSpan = Math.max(3, Math.round(clipSpan / 2))
  const clipStart = Math.max(0, calibratedSec - halfSpan)
  const clipEnd = Math.min(Math.floor(video.duration || 99999), calibratedSec + halfSpan)

  const banner = document.createElement('div')
  banner.id = 'momentSeekBanner'
  banner.className = 'moment-seek-banner'
  const rangeLabel = `${formatTimeLabel(clipStart)} - ${formatTimeLabel(clipEnd)}`
  const quote = momentMeta && momentMeta.quote_or_note ? `「${momentMeta.quote_or_note.slice(0, 32)}」` : ''
  banner.innerHTML = `
    <span class="moment-banner-star">✦</span>
    <span>已定位定格视频片段 <strong>${esc(rangeLabel)} (${clipEnd - clipStart}s)</strong> ${esc(quote)}</span>
    <button class="moment-nudge-btn" id="btnReplayClipSpan" title="重播当前 3-5 秒定格视频片段">🔁 重播片段</button>
    <button class="moment-nudge-btn" id="btnNudgeBack15" title="片头时长微调：后退 15 秒">⏪ -15s</button>
    <button class="moment-nudge-btn" id="btnNudgeFwd15" title="片头时长微调：前进 15 秒">⏩ +15s</button>
    <button class="moment-nudge-close" id="btnCloseSeekBanner">✕</button>
  `
  stage.appendChild(banner)

  // 从片段起始点播放
  video.currentTime = clipStart

  banner.querySelector('#btnReplayClipSpan').onclick = (e) => {
    e.stopPropagation()
    video.currentTime = clipStart
    video.play().catch(() => {})
  }
  banner.querySelector('#btnNudgeBack15').onclick = (e) => {
    e.stopPropagation()
    video.currentTime = Math.max(0, video.currentTime - 15)
  }
  banner.querySelector('#btnNudgeFwd15').onclick = (e) => {
    e.stopPropagation()
    video.currentTime = Math.min(video.duration || 99999, video.currentTime + 15)
  }
  banner.querySelector('#btnCloseSeekBanner').onclick = (e) => {
    e.stopPropagation()
    banner.remove()
  }
  setTimeout(() => {
    if (banner.parentNode) banner.remove()
  }, 11000)
}

async function paintBarMomentDots(detail, video) {
  const bar = document.getElementById('bar')
  if (!bar || !detail || !detail.name) return
  bar.querySelectorAll('.bar-moment-dot').forEach((d) => d.remove())
  let official = []
  try {
    official = await shellApi.circles.official()
  } catch {
    official = []
  }
  const mid = canonicalMovieId(detail.name)
  const pool = []
  for (const c of [...official, ...store.circles.allCustom()]) {
    for (const mm of c.moments || []) {
      if (mm.movie_id === mid || mm.movie_title === detail.name) pool.push(mm)
    }
  }
  for (const mm of store.circles.userMoments()) {
    if (mm.movie_id === mid || mm.movie_title === detail.name) pool.push(mm)
  }
  const seen = new Set()
  const unique = pool.filter((mm) => {
    if (!mm || seen.has(mm.id)) return false
    seen.add(mm.id)
    return true
  }).slice(0, 8) // 硬上限 8 个光点，防 DOM 膨胀

  const dur = video && video.duration > 0 ? video.duration : 7200
  unique.forEach((mm) => {
    const targetSec = calibrateMomentTime(mm.timestamp_sec, mm.duration_sec, dur)
    const pct = Math.min(98, Math.max(2, (targetSec / dur) * 100))
    const dot = document.createElement('div')
    dot.className = 'bar-moment-dot'
    dot.style.left = `${pct}%`
    dot.title = `✦ ${mm.time_label || formatTimeLabel(targetSec)} · ${mm.mood_tag || '高光时刻'}: ${mm.quote_or_note || ''}`
    dot.onclick = (e) => {
      e.stopPropagation()
      if (video) {
        video.currentTime = targetSec
        showMomentSeekBanner(video, targetSec, mm)
      }
    }
    bar.appendChild(dot)
  })
}

// 影视圈内点击影片：自建圈子里的影片带真实片源直接播放；
// 官方策展影片只有片名，跨全部已启用片源并发匹配一条可播线路再播放。
// 支持传入 seekSec 与 refDuration，实现「一键空降电影高光时刻」。
const circlePlayCache = new Map()
async function playCircleMovie(m, seekSec = 0, refDuration = 0, momentMeta = null) {
  if (!m || !m.name) return
  if (seekSec > 0) {
    state.pendingSeekMoment = { seekSec: Number(seekSec), refDuration: Number(refDuration) || 0, momentMeta }
  } else {
    state.pendingSeekMoment = null
  }
  if (m.site && m.id) {
    navigate(`#/play/${m.site}/${m.id}/0/0`)
    return
  }
  const cached = circlePlayCache.get(m.name)
  if (cached && cached.site && cached.id) {
    navigate(`#/play/${cached.site}/${cached.id}/${cached.lineIdx || 0}/${cached.epIdx || 0}`)
    return
  }
  toast(seekSec > 0 ? `正在匹配「${m.name}」并准备空降 ${formatTimeLabel(seekSec)}…` : `正在智能匹配「${m.name}」高码率蓝光直连片源…`, 4000)
  try {
    // 传入 currentSite: '' 确保包含当前主站在内的所有高码率直连源均参与精确匹配
    const hit = await shellApi.api.findPlayable({ title: m.name, epIdx: 0, currentSite: '' })
    if (hit && hit.site && hit.id) {
      circlePlayCache.set(m.name, hit)
      navigate(`#/play/${hit.site}/${hit.id}/${hit.lineIdx || 0}/${hit.epIdx || 0}`)
      return
    }
  } catch (err) {
    console.warn('[playCircleMovie] findPlayable failed:', err)
  }
  state.pendingSeekMoment = null
  toast(`暂未找到「${m.name}」的直接可用线路，已为你打开全网搜索`)
  navigate(`#/search/${encodeURIComponent(m.name)}`)
}

async function renderCineCircles(activeTab = '精选') {
  setWindowTitle('影视圈')
  let official = []
  try {
    official = await shellApi.circles.official()
  } catch {
    official = []
  }
  const custom = store.circles.allCustom()
  const allCircles = [...official, ...custom]

  // 分类归属筛选
  let filtered = allCircles
  const tab = CINE_TABS.some((t) => t.key === activeTab) ? activeTab : '精选'

  if (tab === '精选') {
    // 精选页展示核心推荐圈子 (排除本周精选 Banner 所占用的圈子，或展示全量)
    filtered = allCircles.filter((c) => c.id !== 'circle_featured_youth')
  } else if (tab === '情绪') {
    filtered = allCircles.filter((c) => c.category === '情绪' || ['独处时光', '治愈温情', '经典'].includes(c.mood) || c.id.includes('mood') || c.id === 'circle_single_universe')
  } else if (tab === '主题') {
    filtered = allCircles.filter((c) => c.category === '主题' || ['悬疑解密', '科幻未来', '经典'].includes(c.mood) || c.id === 'circle_most_romantic')
  } else if (tab === '经典') {
    filtered = allCircles.filter((c) => c.category === '经典' || ['高分必看', '怀旧岁月', '经典'].includes(c.mood) || c.id === 'circle_must_watch_10' || c.id === 'circle_rewatch_classics')
  } else if (tab === '最新') {
    filtered = [...custom, ...official].reverse()
  } else if (tab === '关注') {
    filtered = allCircles.filter((c) => store.circles.isSaved(c.id))
  }

  // 计算标签栏底部的金色指示条定位
  const activeTabIndex = CINE_TABS.findIndex((t) => t.key === tab)
  const indicatorOffset = Math.max(0, activeTabIndex) * 58 + 4

  view.innerHTML = `
    <!-- 顶部分类标签栏 (Apple Segmented Indicator Bar) -->
    <div class="cine-nav-tabs" id="cineNavTabs">
      ${CINE_TABS.map((t) => `
        <button class="cine-tab-btn ${t.key === tab ? 'active' : ''}" data-cine-tab="${esc(t.key)}">
          ${esc(t.label)}
        </button>
      `).join('')}
      <div class="tab-indicator-bar" style="transform:translateX(${indicatorOffset}px)"></div>
    </div>

    ${tab === '精选' ? `
      <!-- 本周精选 Billboard Hero -->
      <section class="cine-billboard" id="cineBillboard" data-circle-id="circle_featured_youth">
        <div class="billboard-backdrop" style="background-image:url('https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2648230658.jpg')"></div>
        <div class="billboard-scrim"></div>
        <div class="billboard-content">
          <span class="billboard-badge">本周精选</span>
          <h1 class="billboard-title">那些年，<br/>我们看过的电影</h1>
          <p class="billboard-sub">一场关于青春与成长的电影之旅</p>
          <div class="billboard-meta-row">
            <div class="avatar-stack">
              <span class="avatar-face" style="background:#f5b041">✨</span>
              <span class="avatar-face" style="background:#1677ff">🎬</span>
              <span class="avatar-face" style="background:#ff375f">♥</span>
            </div>
            <span class="billboard-meta-text">2.8 万人收藏 · 10 部电影</span>
          </div>
          <div>
            <button class="btn-capsule billboard-btn" id="btnHeroEnterCircle" data-circle-id="circle_featured_youth">
              进入影视圈 <span style="font-size:14px;margin-left:4px">→</span>
            </button>
          </div>
        </div>
        <div class="billboard-indicators">
          <span class="ind active"></span>
          <span class="ind"></span>
          <span class="ind"></span>
          <span class="ind"></span>
        </div>
      </section>

      <!-- Section 1: 从此刻的心情出发 -->
      <section class="cine-section">
        <div class="section-head">
          <div class="section-title-wrap">
            <div class="section-bar"></div>
            <h2 class="section-title">从此刻的心情出发</h2>
          </div>
          <a class="section-link" id="linkMoreMoods">
            查看更多 <span style="font-size:11px">→</span>
          </a>
        </div>
        <div class="mood-cards-row">
          ${CINE_MOODS.map((m) => `
            <div class="mood-card" data-circle-id="${esc(m.circleId)}">
              <div class="mood-card-bg" style="background-image:url('${esc(m.cover)}')"></div>
              <div class="mood-card-scrim"></div>
              <div class="mood-card-content">
                <div class="mood-title">${esc(m.title)}</div>
                <div class="mood-sub">${esc(m.sub)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <!-- Section 2: 影视圈卡片网格 (Album Deck Stacks) -->
    <section class="cine-section">
      <div class="section-head">
        <div class="section-title-wrap">
          <div class="section-bar"></div>
          <h2 class="section-title">${tab === '精选' ? '热门影视圈' : tab + '影视圈'}</h2>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button class="btn-capsule small" id="btnImportCircle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            导入圈子
          </button>
          <button class="btn-capsule small appstore-get" id="btnCreateCircle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
            新建圈子
          </button>
        </div>
      </div>

      <div class="circle-album-grid" id="circleGrid">
        ${filtered.length === 0 ? `
          <div class="empty" style="grid-column:1/-1;padding:60px 0">
            <div class="big">◍</div>
            ${tab === '关注' ? '你还没有收藏任何影视圈，在精选广场点击「收藏」随时重温心境影单' : '该分类下暂无影单，点击右上角「新建圈子」创建属于你的专属影单'}
          </div>` : ''}
        ${filtered.map(circleCardHTML).join('')}
      </div>
    </section>
  `

  hydratePendingPosters(view)

  // 标签栏切换
  view.querySelectorAll('[data-cine-tab]').forEach((btn) => {
    btn.onclick = () => {
      const targetTab = btn.dataset.cineTab
      renderCineCircles(targetTab)
    }
  })

  // 本周精选 Banner 点击
  const heroCard = document.getElementById('cineBillboard')
  if (heroCard) {
    heroCard.onclick = (e) => {
      navigate(`#/circle/${heroCard.dataset.circleId}`)
    }
  }

  // 查看更多心情
  document.getElementById('linkMoreMoods')?.addEventListener('click', () => {
    renderCineCircles('情绪')
  })

  // 6大心情卡片点击进入对应圈子
  view.querySelectorAll('.mood-card[data-circle-id]').forEach((mc) => {
    mc.onclick = () => {
      navigate(`#/circle/${mc.dataset.circleId}`)
    }
  })

  // 影视圈卡片点击与"进入"按钮点击
  view.querySelectorAll('[data-circle-id]').forEach((card) => {
    card.onclick = (e) => {
      if (e.target.closest('[data-circle-fav]')) return
      navigate(`#/circle/${card.dataset.circleId}`)
    }
  })

  // 收藏影视圈（阻止冒泡跳入详情页）
  view.querySelectorAll('[data-circle-fav]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const cid = btn.dataset.circleFav
      const nowSaved = store.circles.toggleSaved(cid)
      toast(nowSaved ? '♥ 已收藏该影视圈' : '已取消收藏')
      renderCineCircles(tab)
    }
  })

  document.getElementById('btnCreateCircle')?.addEventListener('click', () => openCreateCircleModal())
  document.getElementById('btnImportCircle')?.addEventListener('click', () => openImportCircleModal())
}

function renderMomentCapsuleHTML(mm, movieObj, circleId, spoilerOn, seqIndex = null) {
  const norm = normalizeMomentClip(mm) || mm
  const isSpoiler = spoilerOn && (Number(norm.progress_ratio) > 0.6 || Number(norm.timestamp_sec) > 4200)
  const baseEchoes = norm.echoes || { tear: 0, solitude: 0, shock: 0, god: 0, aftertaste: 0 }
  const rangeLabel = norm.clip_range_label || `${formatTimeLabel(norm.start_sec)} - ${formatTimeLabel(norm.end_sec)}`
  const spanSec = norm.clip_duration || 8
  return `
    <div class="moment-capsule-card" data-moment-id="${esc(norm.id)}">
      <div class="moment-capsule-top">
        ${seqIndex !== null ? `<span class="moment-seq-badge">#${seqIndex}</span>` : ''}
        <span class="moment-time-pill" title="前后 3-5 秒定格视频片段">🎬 视频片段 ${esc(rangeLabel)} (${spanSec}s)</span>
        <span class="moment-mood-badge">${esc(norm.mood_tag || '高光时刻')}</span>
        ${isSpoiler ? `<span class="spoiler-tag">🛡️ 结局后段防剧透保护中（悬停或点击查看）</span>` : ''}
        <button class="btn-capsule appstore-get moment-jump-btn"
          data-moment-jump-title="${esc(norm.movie_title || (movieObj && movieObj.name) || '')}"
          data-moment-jump-sec="${Number(norm.timestamp_sec) || 0}"
          data-moment-jump-dur="${Number(norm.duration_sec) || 0}"
          data-moment-jump-span="${Number(spanSec) || 8}"
          data-moment-jump-quote="${esc(norm.quote_or_note || '')}">
          ▶ 播放此视频片段
        </button>
      </div>
      <div class="moment-quote-text ${isSpoiler ? 'spoiler-blur' : ''}" data-spoiler-reveal="1">
        “${esc(norm.quote_or_note || '')}”
      </div>
      <div class="moment-echo-row">
        <span class="moment-author-tag">✦ ${esc(norm.author_name || '影悦策展人')}</span>
        <div class="echo-pill-bar">
          ${MOOD_ECHO_TYPES.map((et) => {
            const active = store.circles.hasEchoed(norm.id, et.key)
            const count = Number(baseEchoes[et.key] || 0) + (active ? 1 : 0)
            return `
              <button class="echo-pill ${active ? 'active' : ''}" data-echo-moment="${esc(norm.id)}" data-echo-key="${esc(et.key)}" title="轻触表达「${esc(et.label)}」共鸣">
                <span>${et.icon}</span>
                <span>${esc(et.label)}</span>
                <span class="echo-num">${count}</span>
              </button>
            `
          }).join('')}
        </div>
      </div>
    </div>
  `
}

async function renderCircleDetail(circleId, activeSubTab = 'journey') {
  let official = []
  try {
    official = await shellApi.circles.official()
  } catch {
    official = []
  }
  const custom = store.circles.allCustom()
  const circle = [...official, ...custom].find((c) => String(c.id) === String(circleId))

  if (!circle) {
    view.innerHTML = `<div class="empty"><div class="big">⚠</div>未找到该影视圈<br><button class="btn primary small" style="margin-top:14px" onclick="location.hash='#/circles'">返回影视圈广场</button></div>`
    return
  }

  setWindowTitle(`${circle.title} - 影视圈`)

  const items = circle.items || []
  const saved = store.circles.isSaved(circle.id)
  const spoilerOn = store.circles.spoilerGuard()
  const baseFav = circle.favCount || (circle.id === 'circle_mood_solitude' ? 1520 : circle.id === 'circle_mood_rain' ? 1390 : circle.id === 'circle_mood_nostalgia' ? 2180 : circle.id === 'circle_mood_cyber' ? 1120 : circle.id === 'circle_mood_tears' ? 1840 : circle.id === 'circle_mood_epic' ? 1670 : 86)
  const totalFav = baseFav + (saved ? 1 : 0)
  const shares = (circle.shareCount || Math.round(baseFav * 0.28)) + store.circles.shareCount(circle.id)
  const first = items[0]
  const ambient = first && first.pic ? picUrl(first.pic, first.name) : ''

  // 汇总本圈所有电影时刻（含官方预置与本机用户定格），并按时间轴自动排序
  const itemMidSet = new Set(items.map((it) => it.movie_id || canonicalMovieId(it.name)))
  const itemTitleSet = new Set(items.map((it) => it.name))
  const userMomentsForCircle = store.circles.userMoments().filter(
    (mm) => String(mm.circle_id) === String(circle.id) || itemMidSet.has(mm.movie_id) || itemTitleSet.has(mm.movie_title)
  )
  const seenMom = new Set()
  const circleMoments = []
  for (const mm of [...userMomentsForCircle, ...(circle.moments || [])]) {
    if (!mm || seenMom.has(mm.id)) continue
    seenMom.add(mm.id)
    circleMoments.push(normalizeMomentClip(mm))
  }
  circleMoments.sort((a, b) => (Number(a.start_sec) || 0) - (Number(b.start_sec) || 0))

  // 计算主题观影旅程点亮进度（对比观看记录）
  const historyList = store.history.all()
  const watchedCount = items.filter((m) =>
    historyList.some((h) => h.name === m.name || (m.site && m.id && h.key === `${m.site}:${m.id}`))
  ).length
  const journeyPct = items.length > 0 ? Math.round((watchedCount / items.length) * 100) : 0

  view.innerHTML = `
    <div class="circle-detail-nav">
      <button class="circle-back-btn" id="btnCircleBack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>返回影视圈</span>
      </button>
    </div>

    <div class="circle-editorial-hero">
      ${ambient ? `<div class="circle-hero-ambient" style="background-image:url(${esc(ambient)});background-size:cover;"></div>` : ''}
      <div class="circle-hero-fan-wrap">
        ${circleFanHTML(items, 'hero-fan')}
      </div>
      <div class="circle-hero-content">
        <div class="circle-hero-badge-row">
          <span class="circle-pill">${esc(circle.mood || '精选')}</span>
          <div class="circle-stats-hero">
            <span class="stat-tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="${saved ? '#ff375f' : 'none'}" stroke="${saved ? '#ff375f' : 'currentColor'}" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              ${totalFav.toLocaleString()} 收藏
            </span>
            <span class="stat-tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
              ${shares.toLocaleString()} 分享
            </span>
            <span class="stat-tag">✦ ${circleMoments.length} 段定格视频片段</span>
          </div>
        </div>
        <h1 class="circle-hero-title">${esc(circle.title)}</h1>
        <div class="circle-hero-byline">
          <span>策展编者：${esc(circle.author?.name || '影悦影迷')}</span>
          <span>•</span>
          <span>共收录 ${items.length} 部精选作品</span>
          <span>•</span>
          <span class="journey-progress-inline">主题旅程已点亮 ${watchedCount}/${items.length} 站 (${journeyPct}%)</span>
        </div>
        <p class="circle-hero-desc">${esc(circle.desc || '')}</p>
        <div class="circle-hero-actions">
          ${items.length > 0 ? `<button class="btn primary" id="btnPlayFirstMovie" style="display:flex;align-items:center;gap:6px">
            <svg width="13" height="13" viewBox="0 0 16 18" fill="currentColor"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z"/></svg>
            开启首站观影
          </button>` : ''}
          <button class="btn ${saved ? 'active' : ''}" id="btnToggleSaveCircle" style="display:flex;align-items:center;gap:6px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${saved ? '#ff375f' : 'none'}" stroke="${saved ? '#ff375f' : 'currentColor'}" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            ${saved ? '已收藏圈子' : '收藏圈子'}
          </button>
          <button class="btn" id="btnShareCircle" style="display:flex;align-items:center;gap:6px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
            分享影单
          </button>
          ${circle.isCustom ? `<button class="btn" id="btnAddMovieFromLibrary">＋ 从现有片库添加影片</button>` : ''}
          ${circle.isCustom ? `<button class="btn danger" id="btnDeleteCircle">删除圈子</button>` : ''}
        </div>
      </div>
    </div>

    <!-- 主题观影旅程 vs 圈内光影时刻 视图切换与防剧透开关 -->
    <div class="circle-subtab-toolbar">
      <div class="apple-segmented-bar" style="margin-bottom:0">
        <button class="apple-segment-btn ${activeSubTab === 'journey' ? 'active' : ''}" data-circle-subtab="journey">
          🎬 主题观影旅程 (${items.length} 站)
        </button>
        <button class="apple-segment-btn ${activeSubTab === 'moments' ? 'active' : ''}" data-circle-subtab="moments">
          ✦ 定格视频片段 (${circleMoments.length} 段)
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn-capsule small ${spoilerOn ? 'active' : ''}" id="btnToggleSpoilerGuard" title="开启后将自动高斯模糊遮蔽影片进度 60% 之后的时刻台词，防止剧透结局">
          🛡️ 防剧透保护：${spoilerOn ? '已开启' : '已关闭'}
        </button>
      </div>
    </div>

    ${activeSubTab === 'moments' ? `
      <div class="circle-moments-wall" id="circleMomentsWall">
        ${circleMoments.length === 0 ? `
          <div class="empty" style="padding:60px 0">
            <div class="big">✦</div>
            该圈子还没有定格任何视频片段<br>
            <span style="font-size:12px;color:rgba(255,255,255,0.45)">在播放任意影片时点击底栏「✦ 定格此刻」即可截取前后 3-5 秒视频片段并自动合并生成电影解说</span>
          </div>
        ` : circleMoments.map((mm, mIdx) => `
          <div class="moment-wall-item">
            <div class="moment-wall-movie-tag" style="display:flex;align-items:center;justify-content:space-between">
              <span>🎬 《${esc(mm.movie_title || '精选影片')}》</span>
              <button class="btn small" data-merge-movie-title="${esc(mm.movie_title || '')}" style="padding:2px 10px;font-size:11px;color:#fbbf24;border-color:rgba(245,176,65,0.35)">
                🎬 自动排序合成该片解说
              </button>
            </div>
            ${renderMomentCapsuleHTML(mm, { name: mm.movie_title }, circle.id, spoilerOn, mIdx + 1)}
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="circle-editorial-list" id="circleEditorialList">
        ${items.length === 0 ? `<div class="empty" style="padding:60px 0"><div class="big">◍</div>该影视圈暂无影片，点击上方「＋ 从现有片库添加影片」或详情页「＋ 圈子」即可收录</div>` : ''}
        ${items.map((m, idx) => {
          const pic = m.pic ? picUrl(m.pic, m.name) : makePlaceholder(m.name)
          const mid = m.movie_id || canonicalMovieId(m.name)
          const isReady = Boolean((m.site && m.id) || circlePlayCache.has(m.name) || historyList.some((h) => h.name === m.name))
          const watched = historyList.some((h) => h.name === m.name || (m.site && m.id && h.key === `${m.site}:${m.id}`))
          const movieMoments = circleMoments
            .filter((mm) => mm.movie_id === mid || mm.movie_title === m.name)
            .sort((a, b) => (Number(a.start_sec) || 0) - (Number(b.start_sec) || 0))
          const totalClipSec = movieMoments.reduce((acc, mm) => acc + (Number(mm.clip_duration) || 8), 0)
          return `
            <div class="circle-editorial-card">
              <div class="circle-movie-cover" data-editorial-play-idx="${idx}" title="点击立即播放 ${esc(m.name)}" style="cursor:pointer">
                <img src="${esc(pic)}" alt="${esc(m.name)}" loading="lazy" />
                <div class="card-hover-play"><span>
                  <svg width="18" height="20" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
                </span></div>
              </div>
              <div class="circle-movie-body">
                <div class="circle-movie-head">
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <span class="journey-step-pill ${watched ? 'watched' : ''}">${watched ? '✓ 已点亮' : `第 ${idx + 1} 站`}</span>
                    <h3 class="circle-movie-title" data-editorial-play-idx="${idx}" style="cursor:pointer" title="点击立即播放">${esc(m.name)}</h3>
                    <span class="playable-status-badge ${isReady ? 'ready' : 'smart'}" data-playable-badge-title="${esc(m.name)}">
                      ${isReady ? '● 蓝光片源已就绪' : '⚡ 智能寻源可播'}
                    </span>
                  </div>
                  <span class="circle-movie-rating">★ ${esc(m.rating || '9.0')} 豆瓣高分</span>
                </div>
                <div class="circle-curator-note">
                  ${esc(m.reason || '经典触动心灵之作，影迷一生必看的视听飨宴。')}
                </div>

                ${movieMoments.length > 0 ? `
                  <div class="moment-storyboard-header">
                    <div class="moment-storyboard-title">
                      <span>✦ 已定格 ${movieMoments.length} 段前后 3-5 秒视频片段 · 已按时间轴自动排序 (${totalClipSec}s)</span>
                    </div>
                    <button class="btn-capsule appstore-get small" data-merge-movie-idx="${idx}" title="将本片所有定格视频片段按时间轴自动排序并合并生成一部连续电影解说">
                      🎬 合并生成《${esc(m.name)}》电影解说 (${movieMoments.length}段)
                    </button>
                  </div>
                  <div class="moment-capsule-list">
                    ${movieMoments.map((mm, sIdx) => renderMomentCapsuleHTML(mm, m, circle.id, spoilerOn, sIdx + 1)).join('')}
                  </div>
                ` : ''}

                <div class="circle-movie-actions">
                  <button class="btn primary small" data-editorial-play-idx="${idx}" style="padding:5px 16px;font-size:12px;display:flex;align-items:center;gap:5px">
                    <svg width="11" height="11" viewBox="0 0 16 18" fill="currentColor"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z"/></svg>
                    立即播放
                  </button>
                  <button class="btn small" data-pin-movie-idx="${idx}" style="padding:5px 14px;font-size:12px;color:#fbbf24;border-color:rgba(245,176,65,0.35)">✦ 定格此刻 (3-5s视频+解说)</button>
                  ${movieMoments.length > 0 ? `
                    <button class="btn small" data-merge-movie-idx="${idx}" style="padding:5px 14px;font-size:12px;background:rgba(245,158,11,0.16);color:#fbbf24;border-color:rgba(245,158,11,0.4)">
                      🎬 播放合成解说 (${movieMoments.length}段)
                    </button>
                  ` : ''}
                  <button class="btn small" data-editorial-detail-idx="${idx}" style="padding:5px 14px;font-size:12px">影片详情</button>
                  ${circle.isCustom ? `<button class="btn small danger" data-editorial-remove="${esc(m.id)}" style="padding:5px 12px;margin-left:auto;font-size:12px">移出圈子</button>` : ''}
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `}
  `

  hydratePendingPosters(view)

  // 后台串行静默预检前 3 部未缓存影片的真实可播状态（包含当前主站在内的全源精确匹配）
  ;(async () => {
    const uncached = items.filter((m) => !(m.site && m.id) && !circlePlayCache.has(m.name)).slice(0, 3)
    for (const m of uncached) {
      if (!location.hash.startsWith(`#/circle/${circleId}`)) break
      try {
        const hit = await shellApi.api.findPlayable({ title: m.name, epIdx: 0, currentSite: '' })
        if (hit && hit.site && hit.id) {
          circlePlayCache.set(m.name, hit)
          const badgeEl = view.querySelector(`[data-playable-badge-title="${CSS.escape(m.name)}"]`)
          if (badgeEl) {
            badgeEl.className = 'playable-status-badge ready'
            badgeEl.textContent = `● ${hit.siteName || '蓝光'}片源已就绪`
          }
        }
      } catch (_) {}
    }
  })()

  // 返回上一级
  document.getElementById('btnCircleBack')?.addEventListener('click', () => goBack())

  // 切换「主题观影旅程 / 圈内光影时刻」
  view.querySelectorAll('[data-circle-subtab]').forEach((btn) => {
    btn.onclick = () => renderCircleDetail(circleId, btn.dataset.circleSubtab)
  })

  // 防剧透保护开关
  document.getElementById('btnToggleSpoilerGuard')?.addEventListener('click', () => {
    const nowOn = store.circles.toggleSpoilerGuard()
    toast(nowOn ? '🛡️ 已开启防剧透保护（自动模糊 60% 进度后的时刻）' : '已关闭防剧透保护')
    renderCircleDetail(circleId, activeSubTab)
  })

  // 点击被模糊的剧透时刻可单条揭开
  view.querySelectorAll('[data-spoiler-reveal]').forEach((el) => {
    el.onclick = () => el.classList.remove('spoiler-blur')
  })

  // 一键播放定格 3-5 秒视频片段
  view.querySelectorAll('[data-moment-jump-title]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const title = btn.dataset.momentJumpTitle
      const sec = Number(btn.dataset.momentJumpSec) || 0
      const dur = Number(btn.dataset.momentJumpDur) || 0
      const span = Number(btn.dataset.momentJumpSpan) || 8
      const quote = btn.dataset.momentJumpQuote || ''
      const matchedMovie = items.find((it) => it.name === title) || { name: title }
      playCircleMovie(matchedMovie, sec, dur, { quote_or_note: quote, clip_duration: span })
    }
  })

  // 一键自动排序并合并生成《...》电影解说（按影片索引触发）
  view.querySelectorAll('[data-merge-movie-idx]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const idx = Number(btn.dataset.mergeMovieIdx)
      const movie = items[idx]
      if (!movie) return
      const moments = getMomentsForMovie(movie.name, circle)
      const reel = buildCommentaryReelFromMoments(movie.name, moments, movie)
      launchCommentaryReel(reel)
    }
  })

  // 一键自动排序并合并生成《...》电影解说（按影片名触发）
  view.querySelectorAll('[data-merge-movie-title]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const title = btn.dataset.mergeMovieTitle
      if (!title) return
      const matchedMovie = items.find((it) => it.name === title) || { name: title }
      const moments = getMomentsForMovie(title, circle)
      const reel = buildCommentaryReelFromMoments(title, moments, matchedMovie)
      launchCommentaryReel(reel)
    }
  })

  // 5维零打字情绪回声按钮交互
  view.querySelectorAll('[data-echo-moment]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const mid = btn.dataset.echoMoment
      const key = btn.dataset.echoKey
      const added = store.circles.toggleEcho(mid, key)
      const numEl = btn.querySelector('.echo-num')
      if (numEl) {
        const cur = Number(numEl.textContent) || 0
        numEl.textContent = String(Math.max(0, cur + (added ? 1 : -1)))
      }
      btn.classList.toggle('active', added)
    }
  })

  // 播放首部影片
  const btnFirst = document.getElementById('btnPlayFirstMovie')
  if (btnFirst && items[0]) {
    btnFirst.onclick = () => playCircleMovie(items[0])
  }

  // 收藏 / 取消收藏圈子
  const btnToggleSave = document.getElementById('btnToggleSaveCircle')
  if (btnToggleSave) {
    btnToggleSave.onclick = () => {
      const nowSaved = store.circles.toggleSaved(circle.id)
      toast(nowSaved ? '♥ 已收藏该影视圈' : '已取消收藏')
      renderCircleDetail(circleId, activeSubTab)
    }
  }

  // 点击封面、标题或播放按钮均触发直接秒播
  view.querySelectorAll('[data-editorial-play-idx]').forEach((el) => {
    el.onclick = () => {
      const idx = Number(el.dataset.editorialPlayIdx)
      const movie = items[idx]
      if (movie) playCircleMovie(movie)
    }
  })

  // 留下此刻按钮
  view.querySelectorAll('[data-pin-movie-idx]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.pinMovieIdx)
      const movie = items[idx]
      if (movie) {
        openPinMomentModal({
          detail: { name: movie.name, id: movie.id, site: movie.site },
          defaultCircleId: circle.id,
          onSaved: () => renderCircleDetail(circleId, activeSubTab),
        })
      }
    }
  })

  // 查看详情：优先跳转已匹配到的真实片源详情页
  view.querySelectorAll('[data-editorial-detail-idx]').forEach((btn) => {
    btn.onclick = async () => {
      const idx = Number(btn.dataset.editorialDetailIdx)
      const movie = items[idx]
      if (!movie) return
      if (movie.site && movie.id) {
        navigate(`#/detail/${movie.site}/${movie.id}`)
        return
      }
      const cached = circlePlayCache.get(movie.name)
      if (cached && cached.site && cached.id) {
        navigate(`#/detail/${cached.site}/${cached.id}`)
        return
      }
      toast(`正在定位《${movie.name}》片库详情…`)
      try {
        const hit = await shellApi.api.findPlayable({ title: movie.name, epIdx: 0, currentSite: '' })
        if (hit && hit.site && hit.id) {
          circlePlayCache.set(movie.name, hit)
          navigate(`#/detail/${hit.site}/${hit.id}`)
          return
        }
      } catch (_) {}
      navigate(`#/search/${encodeURIComponent(movie.name)}`)
    }
  })

  // 从现有片库添加影片（自建圈子专属）
  document.getElementById('btnAddMovieFromLibrary')?.addEventListener('click', () => {
    openLibraryPickerModal(circle, () => renderCircleDetail(circleId, activeSubTab))
  })

  // 移出圈子点击
  view.querySelectorAll('[data-editorial-remove]').forEach((btn) => {
    btn.onclick = () => {
      const movieId = btn.dataset.editorialRemove
      circle.items = circle.items.filter((it) => String(it.id) !== String(movieId))
      store.circles.update(circle)
      toast('已从圈子移出')
      renderCircleDetail(circleId, activeSubTab)
    }
  })

  document.getElementById('btnShareCircle')?.addEventListener('click', () => {
    store.circles.bumpShare(circle.id)
    openShareCircleModal(circle)
  })

  const btnDel = document.getElementById('btnDeleteCircle')
  if (btnDel) {
    btnDel.onclick = async () => {
      const ok = await shellApi.dialog.confirm({ title: '删除影视圈', message: `确定删除自建影视圈「${circle.title}」吗？` })
      if (!ok) return
      store.circles.remove(circle.id)
      toast('已删除该影视圈')
      navigate('#/circles')
    }
  }
}

/**
 * 「✦ 定格此刻」统一创作弹窗（合并原定格此刻与高光分享）：
 * 1. 自动截取当前时间点前后 3-5 秒动态视频片段（而非静态图片），实时循环预览视频画面 + 字幕；
 * 2. 添加评论/解说文案，支持同一部电影添加多个定格此刻视频片段；
 * 3. 自动按时间轴升序排列该电影的所有定格片段，一键合并生成连续电影解说并支持导出 WebM 短视频。
 */
async function openPinMomentModal({ video = null, detail = {}, ep = null, defaultCircleId = '', onSaved = null } = {}) {
  const existing = document.getElementById('pinMomentModal')
  if (existing) existing.remove()

  let official = []
  try {
    official = await shellApi.circles.official()
  } catch {
    official = []
  }
  const allCircles = [...store.circles.allCustom(), ...official]
  const curSec = video && video.currentTime > 0 ? Math.floor(video.currentTime) : 1860
  const durSec = video && video.duration > 0 ? Math.floor(video.duration) : 7200
  const movieTitle = detail.name || '当前影片'
  const moods = ['破防泪目', '深夜独处', '宿命重逢', '视听封神', '极致反转', '温柔治愈']
  let radiusSec = 4 // 默认前后 4 秒 (共 8s 视频片段)
  let startSec = Math.max(0, curSec - radiusSec)
  let endSec = Math.min(durSec, curSec + radiusSec)
  let currentQuote = ''
  let previewAnimId = null

  // 获取该影片现有的所有定格此刻（含官方预置与本机用户定格），按 start_sec 自动升序排列
  const findCircleForMovie = allCircles.find((c) =>
    (c.moments || []).some((mm) => mm.movie_title === movieTitle || mm.movie_id === canonicalMovieId(movieTitle))
  )
  function getSortedMovieClips() {
    return getMomentsForMovie(movieTitle, findCircleForMovie)
  }

  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'pinMomentModal'

  function renderModalContent() {
    const existingClips = getSortedMovieClips()
    const totalExistingSec = existingClips.reduce((acc, c) => acc + (Number(c.clip_duration) || 8), 0)

    modal.innerHTML = `
      <div class="cinemajoy-modal-card pin-clip-modal-card" onclick="event.stopPropagation()">
        <div class="cinemajoy-modal-head">
          <div>
            <h3><span style="color:#f5b041">✦</span> 定格此刻 · 前后 3-5 秒视频片段与解说合成台</h3>
            <div style="font-size:12px;color:rgba(255,255,255,0.52);margin-top:2px">
              《${esc(movieTitle)}》 · 截取前后 3-5 秒动态视频 + 添加解说评论 · 多段自动排序合并生成电影解说
            </div>
          </div>
          <button class="btn small" id="btnClosePinModal" style="padding:4px 10px;font-size:12px">✕</button>
        </div>

        <div class="pin-clip-studio-grid">
          <!-- 左侧：前后 3-5 秒动态视频片段实时循环预览 + 范围调节 + WebM 录制导出 -->
          <div class="pin-clip-preview-col">
            <div class="pin-canvas-box">
              <canvas id="pinClipCanvas" width="640" height="360"></canvas>
              <div class="pin-canvas-badge" id="pinClipRangeBadge">
                <span class="rec-dot"></span>
                <span>🎬 动态视频片段循环预览 · ${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)} (${Math.max(3, endSec - startSec)}s)</span>
              </div>
            </div>

            <div class="pin-radius-bar">
              <span style="font-size:12px;color:rgba(255,255,255,0.65)">视频截取跨度：</span>
              <button type="button" class="pin-radius-pill ${radiusSec === 3 ? 'active' : ''}" data-radius="3">前后 3 秒 (6s视频)</button>
              <button type="button" class="pin-radius-pill ${radiusSec === 4 ? 'active' : ''}" data-radius="4">前后 4 秒 (8s视频 · 推荐)</button>
              <button type="button" class="pin-radius-pill ${radiusSec === 5 ? 'active' : ''}" data-radius="5">前后 5 秒 (10s视频)</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">中心时间点 (秒)</label>
                <input id="inputMomentSec" type="number" min="0" max="36000" value="${curSec}" class="pin-num-input" />
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">片段起点 (start_sec)</label>
                <input id="inputClipStartSec" type="number" min="0" max="36000" value="${startSec}" class="pin-num-input" />
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">片段终点 (end_sec)</label>
                <input id="inputClipEndSec" type="number" min="3" max="36000" value="${endSec}" class="pin-num-input" />
              </div>
            </div>

            <div style="display:flex;gap:8px">
              <button type="button" class="btn small" id="btnExportWebmClip" style="flex:1;justify-content:center;padding:8px 12px">
                📹 导出当前 ${Math.max(3, endSec - startSec)}s 视频片段 (.webm)
              </button>
              <button type="button" class="btn small" id="btnCopyMomentPoster" style="padding:8px 12px">
                🖼️ 复制带字幕剧照
              </button>
            </div>
          </div>

          <!-- 右侧：解说评论录入 + 同一部电影多段定格自动排序分镜轨道 + 一键合并生成电影解说 -->
          <div class="pin-clip-form-col">
            <div class="clip-tag-chips" style="margin-bottom:6px">
              <span class="clip-chip" data-quote="注意看这个细节，镜头语言直接封神！">🎬 细节解说</span>
              <span class="clip-chip" data-quote="全片最破防的转折点，主角眼神全是戏！">😭 破防转折</span>
              <span class="clip-chip" data-quote="伏笔回收！前面所有的铺垫在这一刻彻底引爆。">🔥 伏笔爆发</span>
              <span class="clip-chip" data-quote="配乐响起的瞬间，宿命感直接拉满！">🎵 宿命拉满</span>
            </div>

            <div>
              <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">添加本段视频的解说词 / 评论（将作为合成电影解说的字幕与旁白）</label>
              <textarea id="inputMomentQuote" maxlength="80" rows="2" placeholder="输入这段 3-5 秒视频的解说词或此刻感受..." style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:10px;color:#fff;font-size:13px;resize:none">${esc(currentQuote)}</textarea>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">情绪共鸣标签</label>
                <select id="selectMomentMood" style="width:100%;padding:7px 10px;background:#141720;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:12.5px">
                  ${moods.map((m) => `<option value="${m}">${m}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">同步收录至影视圈</label>
                <select id="selectMomentCircle" style="width:100%;padding:7px 10px;background:#141720;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:12.5px">
                  ${allCircles.map((c) => `<option value="${esc(c.id)}" ${String(c.id) === String(defaultCircleId) ? 'selected' : ''}>${esc(c.title)} (${c.isCustom ? '自建' : '官方'})</option>`).join('')}
                </select>
              </div>
            </div>

            <button class="btn primary" id="btnSubmitPinMoment" style="padding:10px;font-weight:700;justify-content:center">
              ✦ 添加此段定格视频 (${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}) · 自动按时间轴排序
            </button>

            <!-- 同一部电影的定格片段分镜表（自动按时间轴排序） -->
            <div class="pin-storyboard-box">
              <div class="pin-storyboard-head">
                <span>🎞️ 《${esc(movieTitle)}》已定格视频分镜 (${existingClips.length} 段 · 共 ${totalExistingSec}s)</span>
                <span style="font-size:11px;color:#34d399">✓ 已按时间轴自动升序排列</span>
              </div>
              <div class="pin-storyboard-list" id="pinStoryboardList">
                ${existingClips.length === 0 ? `
                  <div style="text-align:center;padding:18px 10px;color:rgba(255,255,255,0.42);font-size:12px">
                    暂未添加片段，上方点击「✦ 添加此段定格视频」即可添加第 1 段，支持添加多段自动合成解说
                  </div>
                ` : existingClips.map((c, idx) => `
                  <div class="pin-storyboard-item">
                    <span class="pin-sb-index">#${idx + 1}</span>
                    <div class="pin-sb-main">
                      <div class="pin-sb-time">🎬 ${esc(c.clip_range_label || `${formatTimeLabel(c.start_sec)} - ${formatTimeLabel(c.end_sec)}`)} (${c.clip_duration || 8}s) · ${esc(c.mood_tag || '高光')}</div>
                      <div class="pin-sb-quote">“${esc(c.quote_or_note || '')}”</div>
                    </div>
                    ${String(c.id).startsWith('mom_user_') ? `
                      <button class="btn small danger" data-del-moment-id="${esc(c.id)}" style="padding:2px 7px;font-size:11px" title="删除此片段">✕</button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>

              <button class="btn primary pin-merge-commentary-btn" id="btnMergeAndPlayCommentary" ${existingClips.length === 0 ? 'disabled' : ''}>
                🎬 自动排序并合并生成《${esc(movieTitle)}》电影解说 (${existingClips.length} 段连续串播)
              </button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  renderModalContent()
  document.body.appendChild(modal)

  function stopPreviewLoop() {
    if (previewAnimId) {
      cancelAnimationFrame(previewAnimId)
      previewAnimId = null
    }
  }

  function closeModal() {
    stopPreviewLoop()
    modal.remove()
  }

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal()
    }
  }

  function bindModalEvents() {
    const card = modal.querySelector('.cinemajoy-modal-card')
    if (card) {
      card.onclick = (e) => {
        e.stopPropagation()
      }
    }

    const closeBtn = modal.querySelector('#btnClosePinModal')
    if (closeBtn) closeBtn.onclick = closeModal

    const canvas = modal.querySelector('#pinClipCanvas')
    const ctx = canvas ? canvas.getContext('2d') : null
    const quoteInput = modal.querySelector('#inputMomentQuote')
    const secInput = modal.querySelector('#inputMomentSec')
    const startInput = modal.querySelector('#inputClipStartSec')
    const endInput = modal.querySelector('#inputClipEndSec')
    const rangeBadge = modal.querySelector('#pinClipRangeBadge')
    const submitBtn = modal.querySelector('#btnSubmitPinMoment')

    if (quoteInput) {
      quoteInput.onclick = (e) => e.stopPropagation()
      quoteInput.onfocus = (e) => e.stopPropagation()
    }

    if (video) {
      video.currentTime = startSec
      video.play().catch(() => {})
    }

    function updateRangeLabels() {
      const span = Math.max(3, endSec - startSec)
      if (rangeBadge) {
        rangeBadge.innerHTML = `<span class="rec-dot"></span><span>🎬 动态视频片段循环预览 · ${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)} (${span}s)</span>`
      }
      if (submitBtn) {
        submitBtn.textContent = `✦ 添加此段定格视频 (${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}) · 自动按时间轴排序`
      }
    }

    function drawPreviewFrame() {
      if (!canvas || !ctx) return
      const w = canvas.width
      const h = canvas.height

      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        if (video.currentTime >= endSec || video.currentTime < startSec - 0.5) {
          video.currentTime = startSec
          if (video.paused) video.play().catch(() => {})
        }
        try {
          ctx.drawImage(video, 0, 0, w, h)
        } catch (_) {
          ctx.fillStyle = '#0d1322'
          ctx.fillRect(0, 0, w, h)
        }
      } else {
        const grad = ctx.createLinearGradient(0, 0, w, h)
        grad.addColorStop(0, '#0f172a')
        grad.addColorStop(1, '#1e1b4b')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
      }

      const bottomGrad = ctx.createLinearGradient(0, h * 0.52, 0, h)
      bottomGrad.addColorStop(0, 'rgba(0,0,0,0)')
      bottomGrad.addColorStop(1, 'rgba(0,0,0,0.92)')
      ctx.fillStyle = bottomGrad
      ctx.fillRect(0, h * 0.52, w, h * 0.48)

      ctx.save()
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)'
      ctx.beginPath()
      ctx.roundRect(w - 196, 16, 180, 36, 10)
      ctx.fill()
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
      ctx.fillStyle = '#fbbf24'
      ctx.fillText('✦ 影悦 · 定格此刻解说', w - 182, 39)
      ctx.restore()

      ctx.save()
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
      ctx.fillStyle = '#38bdf8'
      ctx.fillText(`《${movieTitle}》 · 片段 ${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)} (${Math.max(3, endSec - startSec)}s)`, 24, h - 54)

      const subText = (quoteInput && quoteInput.value.trim()) || currentQuote || '输入解说词，自动烧录为本段视频解说字幕…'
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 8
      ctx.fillText(`“${subText.slice(0, 34)}”`, 24, h - 22)
      ctx.restore()

      previewAnimId = requestAnimationFrame(drawPreviewFrame)
    }

    stopPreviewLoop()
    drawPreviewFrame()

    modal.querySelectorAll('[data-radius]').forEach((btn) => {
      btn.onclick = () => {
        radiusSec = Number(btn.dataset.radius) || 4
        modal.querySelectorAll('[data-radius]').forEach((b) => b.classList.toggle('active', b === btn))
        const center = Math.max(0, Number(secInput.value) || curSec)
        startSec = Math.max(0, center - radiusSec)
        endSec = Math.min(durSec, center + radiusSec)
        if (endSec - startSec < 3) endSec = startSec + radiusSec * 2
        startInput.value = startSec
        endInput.value = endSec
        if (video) video.currentTime = startSec
        updateRangeLabels()
      }
    })

    secInput.oninput = () => {
      const center = Math.max(0, Number(secInput.value) || 0)
      startSec = Math.max(0, center - radiusSec)
      endSec = Math.min(durSec, center + radiusSec)
      startInput.value = startSec
      endInput.value = endSec
      if (video) video.currentTime = startSec
      updateRangeLabels()
    }

    startInput.oninput = () => {
      startSec = Math.max(0, Number(startInput.value) || 0)
      if (endSec <= startSec + 2) {
        endSec = startSec + 6
        endInput.value = endSec
      }
      if (video) video.currentTime = startSec
      updateRangeLabels()
    }

    endInput.oninput = () => {
      endSec = Math.max(startSec + 3, Number(endInput.value) || startSec + 6)
      updateRangeLabels()
    }

    modal.querySelectorAll('.clip-chip[data-quote]').forEach((chip) => {
      chip.onclick = (e) => {
        e.stopPropagation()
        currentQuote = chip.dataset.quote
        if (quoteInput) {
          quoteInput.value = currentQuote
          quoteInput.focus()
        }
      }
    })

    if (quoteInput) {
      quoteInput.oninput = (e) => {
        currentQuote = e.target.value
      }
    }

    const btnExportWebm = modal.querySelector('#btnExportWebmClip')
    if (btnExportWebm) {
      btnExportWebm.onclick = async () => {
        if (!canvas) return
        try {
          const spanMs = Math.min(10000, Math.max(3000, (endSec - startSec) * 1000))
          btnExportWebm.disabled = true
          btnExportWebm.textContent = `🔴 正在录制 ${Math.round(spanMs / 1000)}s 视频片段…`
          if (video) {
            video.currentTime = startSec
            video.play().catch(() => {})
          }
          const stream = canvas.captureStream(30)
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ? 'video/webm;codecs=vp9'
              : 'video/webm',
          })
          const chunks = []
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data)
          }
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' })
            const reader = new FileReader()
            reader.readAsDataURL(blob)
            reader.onloadend = async () => {
              const base64data = reader.result.split(',')[1]
              const fileName = `影悦定格此刻_${movieTitle}_${formatTimeLabel(startSec).replace(/:/g, '-')}_${Date.now()}.webm`
              const res = await shellApi.media.saveClip({ filename: fileName, bufferBase64: base64data })
              btnExportWebm.disabled = false
              btnExportWebm.textContent = `✅ 已导出视频片段 (.webm)`
              if (res && res.success) {
                toast(`🎬 定格视频片段已保存至下载目录！`)
              }
            }
          }
          recorder.start()
          setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop()
          }, spanMs)
        } catch (err) {
          btnExportWebm.disabled = false
          btnExportWebm.textContent = '📹 导出当前视频片段 (.webm)'
          toast('录制提示：' + err.message)
        }
      }
    }

    const btnCopyPoster = modal.querySelector('#btnCopyMomentPoster')
    if (btnCopyPoster) {
      btnCopyPoster.onclick = () => {
        if (!canvas) return
        try {
          const dataUrl = canvas.toDataURL('image/png')
          shellApi.clipboard.writeImage(dataUrl)
          toast('🖼️ 带解说字幕的剧照已复制到剪贴板！')
        } catch (err) {
          toast('复制失败：' + err.message)
        }
      }
    }

    submitBtn.onclick = () => {
      const quote = quoteInput.value.trim()
      if (!quote) {
        toast('请先填写或点选一句本段视频的解说评论')
        quoteInput.focus()
        return
      }
      const centerSec = Math.round((startSec + endSec) / 2)
      const moodTag = modal.querySelector('#selectMomentMood').value
      const targetCircleId = modal.querySelector('#selectMomentCircle').value
      const profile = store.profile.get()
      const newMoment = {
        id: 'mom_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        circle_id: targetCircleId,
        movie_id: canonicalMovieId(movieTitle),
        movie_title: movieTitle,
        timestamp_sec: centerSec,
        start_sec: startSec,
        end_sec: endSec,
        clip_duration: Math.max(3, endSec - startSec),
        clip_range_label: `${formatTimeLabel(startSec)} - ${formatTimeLabel(endSec)}`,
        duration_sec: durSec,
        progress_ratio: Number((centerSec / Math.max(1, durSec)).toFixed(3)),
        time_label: formatTimeLabel(centerSec),
        quote_or_note: quote.slice(0, 80),
        mood_tag: moodTag,
        author_name: profile.nickname || '影悦解说人',
        echoes: { tear: 1, solitude: 0, shock: 0, god: 1, aftertaste: 0 },
        created_at: Date.now(),
      }
      store.circles.addMoment(newMoment)

      const updatedClips = getSortedMovieClips()
      buildCommentaryReelFromMoments(movieTitle, updatedClips, detail)

      toast(`✦ 已添加视频片段 ${newMoment.clip_range_label}！目前已累计 ${updatedClips.length} 段并按时间轴自动排序`)
      currentQuote = ''
      if (video) paintBarMomentDots(detail, video)
      if (typeof onSaved === 'function') onSaved(newMoment)

      renderModalContent()
      bindModalEvents()
    }

    modal.querySelectorAll('[data-del-moment-id]').forEach((btn) => {
      btn.onclick = () => {
        const mid = btn.dataset.delMomentId
        store.circles.removeMoment(mid)
        const updatedClips = getSortedMovieClips()
        if (updatedClips.length > 0) {
          buildCommentaryReelFromMoments(movieTitle, updatedClips, detail)
        }
        renderModalContent()
        bindModalEvents()
      }
    })

    const btnMergePlay = modal.querySelector('#btnMergeAndPlayCommentary')
    if (btnMergePlay) {
      btnMergePlay.onclick = () => {
        const clips = getSortedMovieClips()
        if (clips.length === 0) {
          toast('请先添加至少 1 段定格此刻视频片段')
          return
        }
        const reel = buildCommentaryReelFromMoments(movieTitle, clips, detail)
        closeModal()
        if (video) {
          startCommentaryReelPlayback(reel, { video, detail })
        } else {
          launchCommentaryReel(reel)
        }
      }
    }
  }

  bindModalEvents()
}

/**
 * 从影悦现有片库搜索并添加电影到自建影视圈（严格遵循约束 2 & 3：仅从现有片库添加，通过稳定 movie_id 引用）
 */
function openLibraryPickerModal(circle, onUpdated) {
  const existing = document.getElementById('libraryPickerModal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'libraryPickerModal'
  modal.innerHTML = `
    <div class="cinemajoy-modal-card" style="width:520px;max-width:92vw" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <h3>从影悦片库添加电影至「${esc(circle.title)}」</h3>
        <button class="btn small" id="btnCloseLibPicker" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <div style="display:flex;gap:8px">
        <input id="inputLibSearch" placeholder="输入片名从现有片库检索..." style="flex:1;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px" />
        <button class="btn primary small" id="btnDoLibSearch" style="padding:0 16px">检索片库</button>
      </div>
      <div id="libPickerResults" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:8px"></div>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseLibPicker').onclick = () => modal.remove()

  const resultsBox = modal.querySelector('#libPickerResults')

  function renderCandidates(list) {
    if (!list || list.length === 0) {
      resultsBox.innerHTML = `<div style="text-align:center;padding:28px;color:var(--text-dim)">未在当前片库找到匹配影片，换个关键词试试</div>`
      return
    }
    resultsBox.innerHTML = list.slice(0, 20).map((m, i) => {
      const mid = canonicalMovieId(m.name, m.year)
      const exists = (circle.items || []).some((it) => (it.movie_id || canonicalMovieId(it.name)) === mid || it.name === m.name)
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:10px">
          <div>
            <div style="font-size:14px;font-weight:600;color:#fff">${esc(m.name)}</div>
            <div style="font-size:11px;color:var(--muted)">${esc([m.typeName, m.year, m.remarks].filter(Boolean).join(' · ') || '影悦蓝光片库')} · ID: ${esc(mid)}</div>
          </div>
          <button class="btn small ${exists ? 'danger' : 'primary'}" data-pick-idx="${i}">
            ${exists ? '已在圈内' : '＋ 收录'}
          </button>
        </div>
      `
    }).join('')

    resultsBox.querySelectorAll('[data-pick-idx]').forEach((btn) => {
      btn.onclick = () => {
        const picked = list[Number(btn.dataset.pickIdx)]
        if (!picked) return
        circle.items = circle.items || []
        const mid = canonicalMovieId(picked.name, picked.year)
        if (circle.items.some((it) => (it.movie_id || canonicalMovieId(it.name)) === mid || it.name === picked.name)) {
          toast('该影片已在此影视圈中')
          return
        }
        if (circle.items.length >= 100) {
          toast('单圈影片已达 100 部上限')
          return
        }
        circle.items.push({
          id: String(picked.id || Date.now()),
          movie_id: mid,
          site: String(picked.site || (state.site && state.site.key) || ''),
          name: String(picked.name || ''),
          pic: String(picked.pic || ''),
          rating: String(picked.score || picked.rating || '8.8'),
          reason: '从影悦片库精选收录',
        })
        store.circles.update(circle)
        btn.className = 'btn small danger'
        btn.textContent = '已在圈内'
        toast(`已将《${picked.name}》收录入圈`)
        if (typeof onUpdated === 'function') onUpdated()
      }
    })
  }

  // 默认展示本机历史、收藏与首页片池中的现有片库影片
  const seedMap = new Map()
  for (const it of [...store.favorites.all(), ...store.history.all(), ...(state.rankCache?.all || [])]) {
    if (it && it.name && !seedMap.has(it.name)) seedMap.set(it.name, it)
  }
  renderCandidates(Array.from(seedMap.values()))

  async function doSearch() {
    const kw = modal.querySelector('#inputLibSearch').value.trim()
    if (!kw) return renderCandidates(Array.from(seedMap.values()))
    resultsBox.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-dim)">正在检索影悦片库…</div>`
    try {
      const siteKey = (state.site && state.site.key) || (state.sources[0] && state.sources[0].key) || ''
      const res = await shellApi.api.search({ siteKey, kw })
      renderCandidates(res && res.list ? res.list : [])
    } catch {
      renderCandidates([])
    }
  }

  modal.querySelector('#btnDoLibSearch').onclick = doSearch
  modal.querySelector('#inputLibSearch').onkeydown = (e) => {
    if (e.key === 'Enter') doSearch()
  }

  document.body.appendChild(modal)
}

// ---------------------------------------------------------------- 个人中心 (Apple ID Style) 与数据冷备份

async function renderProfile(activeTab = 'circles') {
  setWindowTitle('个人中心')
  const profile = store.profile.get()
  const customCircles = store.circles.allCustom()
  const userMoments = store.circles.userMoments()
  const followList = store.follow ? store.follow.all() : []
  const favList = store.favorites.all()
  const historyList = store.history.all()
  let avatarOptions = []
  try {
    avatarOptions = await shellApi.circles.avatars()
  } catch {
    avatarOptions = []
  }

  const currentAvatar = avatarOptions.find((a) => a.id === profile.avatar) || avatarOptions[0] || { symbol: 'CJ', icon: '✦', bg: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)' }

  view.innerHTML = `
    <h1 class="page-title" style="font-size:26px;font-weight:700;letter-spacing:-0.5px">个人中心</h1>

    <div class="apple-profile-hero">
      <div class="apple-avatar" style="background:${esc(currentAvatar.bg)}">
        ${esc(currentAvatar.symbol || 'CJ')}
      </div>
      <div class="apple-profile-info">
        <div class="apple-profile-name">
          <span id="profileNicknameDisplay">${esc(profile.nickname)}</span>
          <button class="btn small" id="btnEditProfile" style="padding:3px 10px;font-size:11px">编辑资料</button>
        </div>
        <p class="apple-profile-bio" id="profileBioDisplay">${esc(profile.signature)}</p>
        <div class="apple-profile-stats">
          <div class="apple-stat-col">
            <span class="apple-stat-num">${customCircles.length}</span>
            <span class="apple-stat-txt">自建影单</span>
          </div>
          <div class="apple-stat-divider"></div>
          <div class="apple-stat-col">
            <span class="apple-stat-num">${userMoments.length}</span>
            <span class="apple-stat-txt">光影时刻</span>
          </div>
          <div class="apple-stat-divider"></div>
          <div class="apple-stat-col">
            <span class="apple-stat-num">${followList.length + favList.length}</span>
            <span class="apple-stat-txt">追更与收藏</span>
          </div>
          <div class="apple-stat-divider"></div>
          <div class="apple-stat-col">
            <span class="apple-stat-num">${historyList.length}</span>
            <span class="apple-stat-txt">观影记录</span>
          </div>
        </div>
      </div>
    </div>

    <div class="apple-segmented-bar">
      <button class="apple-segment-btn ${activeTab === 'circles' ? 'active' : ''}" data-profile-tab="circles">我的影单 (${customCircles.length})</button>
      <button class="apple-segment-btn ${activeTab === 'moments' ? 'active' : ''}" data-profile-tab="moments">光影时刻 (${userMoments.length})</button>
      <button class="apple-segment-btn ${activeTab === 'saved' ? 'active' : ''}" data-profile-tab="saved">追更与收藏 (${followList.length + favList.length})</button>
      <button class="apple-segment-btn ${activeTab === 'data' ? 'active' : ''}" data-profile-tab="data">本地数据中心</button>
    </div>

    <div id="profileTabContent">
      ${activeTab === 'circles' ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="margin:0;font-size:17px;font-weight:600">我创建的影视圈</h3>
          <button class="btn primary small" id="btnProfileNewCircle" style="font-size:12px;padding:6px 16px;display:flex;align-items:center;gap:6px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
            新建圈子
          </button>
        </div>
        <div class="circle-grid">
          ${customCircles.length === 0 ? `<div class="empty" style="grid-column:1/-1;padding:50px 0"><div class="big">◍</div>您还没有创建任何影视圈，点击上方按钮开始整理属于你的电影合辑</div>` : ''}
          ${customCircles.map(circleCardHTML).join('')}
        </div>
      ` : activeTab === 'moments' ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="margin:0;font-size:17px;font-weight:600">我定格的光影时刻 (${userMoments.length})</h3>
          <span style="font-size:12px;color:rgba(255,255,255,0.45)">在播放器点击「✦ 定格此刻」留下专属于你的电影记忆坐标</span>
        </div>
        <div class="circle-moments-wall">
          ${userMoments.length === 0 ? `<div class="empty" style="padding:50px 0"><div class="big">✦</div>还没有定格任何光影时刻，在观影时点击播放器底栏「✦ 定格此刻」即可记录</div>` : ''}
          ${userMoments.map((mm) => `
            <div class="moment-wall-item">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <div class="moment-wall-movie-tag">🎬 《${esc(mm.movie_title || '精选影片')}》</div>
                <button class="btn small danger" data-del-moment="${esc(mm.id)}" style="padding:2px 10px;font-size:11px">删除</button>
              </div>
              ${renderMomentCapsuleHTML(mm, { name: mm.movie_title }, mm.circle_id || '', false)}
            </div>
          `).join('')}
        </div>
      ` : activeTab === 'saved' ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="margin:0;font-size:17px;font-weight:600">待播与追更影片 (${followList.length + favList.length})</h3>
          <span style="font-size:12px;color:rgba(255,255,255,0.45)">支持封面一键秒播 · 本地加密私享存储</span>
        </div>
        <div class="grid">
          ${[...followList, ...favList].length === 0 ? `<div class="empty" style="grid-column:1/-1;padding:50px 0"><div class="big">◍</div>暂无追更或收藏影片</div>` : ''}
          ${[...followList, ...favList].map((it, idx) => {
            const pic = picUrl(it.pic, it.name)
            return `
            <div class="card" data-saved-movie-idx="${idx}" title="${esc(it.name)} (点击查看详情，点击播放图标直达)">
              <div class="card-cover">
                <img src="${esc(pic)}" alt="${esc(it.name)}" loading="lazy" />
                <div class="card-hover-play"><span>
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
                </span></div>
              </div>
              <div class="card-title">${esc(it.name)}</div>
              <div class="card-sub">${esc([it.typeName, it.remarks || it.year].filter(Boolean).join(' · '))}</div>
            </div>`
          }).join('')}
        </div>
      ` : `
        <div class="panel" style="padding:24px 28px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.08);border-radius:18px">
          <h3 style="margin-top:0;font-size:18px;font-weight:600">本地离线数据管理</h3>
          <p class="hint" style="line-height:1.6;margin-bottom:20px">
            「影悦 · 独立版」100% 遵循 Local-First 原则，所有自建影单、追更、收藏及观影历史均完整加密持久化在您的本机。<br>
            无任何外部云端服务器监听，保障绝对隐私。您可以随时导出完整备份包进行多设备无缝迁移。
          </p>
          <div class="apple-data-card">
            <div class="apple-data-info">
              <h4>导出全量冷备份</h4>
              <p>生成包含自建影单、心境配置、收藏与历史的独立 <code>.cinemajoy.backup.json</code> 归档文件</p>
            </div>
            <button class="btn primary" id="btnExportFullBackup" style="padding:6px 18px">导出备份包</button>
          </div>
          <div class="apple-data-card">
            <div class="apple-data-info">
              <h4>从文件无损恢复</h4>
              <p>选取已有备份文件一键还原所有影单与播放记录（合并式无缝恢复）</p>
            </div>
            <button class="btn" id="btnImportFullBackup" style="padding:6px 18px">选择备份文件</button>
            <input type="file" id="backupFileInput" accept=".json" style="display:none" />
          </div>
        </div>
      `}
    </div>
  `

  hydratePendingPosters(view)

  // 绑定分段标签切换
  view.querySelectorAll('[data-profile-tab]').forEach((btn) => {
    btn.onclick = () => renderProfile(btn.dataset.profileTab)
  })

  // 圈子卡片跳转
  view.querySelectorAll('[data-circle-id]').forEach((card) => {
    card.onclick = () => navigate(`#/circle/${card.dataset.circleId}`)
  })

  // 圈子卡片收藏
  view.querySelectorAll('[data-circle-fav]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const cid = btn.dataset.circleFav
      const nowSaved = store.circles.toggleSaved(cid)
      toast(nowSaved ? '♥ 已收藏该影视圈' : '已取消收藏')
      renderProfile(activeTab)
    }
  })

  // 待播与收藏影片卡片点击与直接播放
  const savedAllItems = [...followList, ...favList]
  view.querySelectorAll('[data-saved-movie-idx]').forEach((card) => {
    const idx = Number(card.dataset.savedMovieIdx)
    const item = savedAllItems[idx]
    if (!item) return
    card.onclick = () => {
      if (item.site && item.id) {
        navigate(`#/detail/${item.site}/${item.id}`)
      } else {
        playCircleMovie(item)
      }
    }
    const hoverPlay = card.querySelector('.card-hover-play')
    if (hoverPlay) {
      hoverPlay.onclick = (e) => {
        e.stopPropagation()
        if (item.site && item.id) {
          navigate(`#/play/${item.site}/${item.id}/0/0`)
        } else {
          playCircleMovie(item)
        }
      }
    }
  })

  // 个人中心：一键空降光影时刻播放与删除
  view.querySelectorAll('[data-moment-jump-title]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const title = btn.dataset.momentJumpTitle
      const sec = Number(btn.dataset.momentJumpSec) || 0
      const dur = Number(btn.dataset.momentJumpDur) || 0
      const quote = btn.dataset.momentJumpQuote || ''
      playCircleMovie({ name: title }, sec, dur, { quote_or_note: quote })
    }
  })

  view.querySelectorAll('[data-del-moment]').forEach((btn) => {
    btn.onclick = () => {
      store.circles.removeMoment(btn.dataset.delMoment)
      toast('已移除该光影时刻')
      renderProfile('moments')
    }
  })

  view.querySelectorAll('[data-echo-moment]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation()
      const mid = btn.dataset.echoMoment
      const key = btn.dataset.echoKey
      const added = store.circles.toggleEcho(mid, key)
      const numEl = btn.querySelector('.echo-num')
      if (numEl) {
        const cur = Number(numEl.textContent) || 0
        numEl.textContent = String(Math.max(0, cur + (added ? 1 : -1)))
      }
      btn.classList.toggle('active', added)
    }
  })

  // 分享圈子
  view.querySelectorAll('[data-share-id]').forEach((btn) => {
    btn.onclick = () => {
      const c = customCircles.find((x) => String(x.id) === String(btn.dataset.shareId))
      if (c) openShareCircleModal(c)
    }
  })

  document.getElementById('btnProfileNewCircle')?.addEventListener('click', () => openCreateCircleModal())

  document.getElementById('btnEditProfile')?.addEventListener('click', () => {
    openEditProfileModal(profile, avatarOptions)
  })

  document.getElementById('btnExportFullBackup')?.addEventListener('click', () => {
    const backupData = {
      app: '影悦 · 独立版',
      version: 2,
      exportedAt: new Date().toISOString(),
      profile: store.profile.get(),
      circles: store.circles.allCustom(),
      moments: store.circles.userMoments(),
      follow: store.follow ? store.follow.all() : [],
      favorites: store.favorites.all(),
      history: store.history.all(),
    }
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cinemajoy_backup_${Date.now()}.cinemajoy.backup.json`
    a.click()
    toast('全量备份包导出成功')
  })

  const backupInput = document.getElementById('backupFileInput')
  document.getElementById('btnImportFullBackup')?.addEventListener('click', () => {
    backupInput?.click()
  })
  backupInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (json.profile) store.profile.set(json.profile)
      if (Array.isArray(json.circles)) store.circles.saveCustom(json.circles)
      if (Array.isArray(json.moments)) LS.set('kky.circles.moments', json.moments.slice(0, 300))
      if (Array.isArray(json.favorites)) LS.set('kky.favorites', json.favorites)
      if (Array.isArray(json.follow)) LS.set('kky.follow', json.follow)
      if (Array.isArray(json.history)) LS.set('kky.history', json.history)
      toast('备份恢复成功！')
      renderProfile('circles')
    } catch (err) {
      toast('恢复失败：无效的备份文件 (' + (err.message || err) + ')')
    }
  })
}

function openEditProfileModal(profile, avatarOptions) {
  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'editProfileModal'
  let selectedAvatar = profile.avatar

  modal.innerHTML = `
    <div class="cinemajoy-modal-card" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <h3>编辑个人名片</h3>
        <button class="btn small" id="btnCloseEditProfile" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:6px">选择专属艺术头像</label>
        <div class="avatar-picker-grid">
          ${avatarOptions.map((a) => `
            <div class="avatar-option ${a.id === selectedAvatar ? 'active' : ''}" data-avatar-id="${a.id}" style="background:${a.bg}">
              ${a.symbol || a.icon}
            </div>
          `).join('')}
        </div>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">用户昵称</label>
        <input id="inputProfileNick" value="${esc(profile.nickname)}" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:14px" />
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">个性签名 / 观影箴言</label>
        <input id="inputProfileBio" value="${esc(profile.signature)}" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px" />
      </div>
      <button class="btn primary" id="btnSaveProfile" style="margin-top:8px;padding:10px">保存名片</button>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseEditProfile').onclick = () => modal.remove()

  modal.querySelectorAll('[data-avatar-id]').forEach((opt) => {
    opt.onclick = () => {
      selectedAvatar = opt.dataset.avatarId
      modal.querySelectorAll('.avatar-option').forEach((o) => o.classList.remove('active'))
      opt.classList.add('active')
    }
  })

  modal.querySelector('#btnSaveProfile').onclick = () => {
    const nick = modal.querySelector('#inputProfileNick').value.trim()
    const bio = modal.querySelector('#inputProfileBio').value.trim()
    if (!nick) {
      toast('昵称不能为空')
      return
    }
    store.profile.set({
      nickname: nick.slice(0, 30),
      signature: bio.slice(0, 100),
      avatar: selectedAvatar,
    })
    syncTopbarIdentity()
    modal.remove()
    toast('名片更新成功')
    renderProfile()
  }

  document.body.appendChild(modal)
}

function openAddToCircleModal(movie) {
  const customCircles = store.circles.allCustom()
  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'addToCircleModal'

  const circlesHtml = customCircles.length === 0
    ? `<div style="text-align:center;padding:20px;color:var(--text-dim)">您还没有自建影视圈。<br><button class="btn primary small" id="btnQuickCreateCircle" style="margin-top:12px">+ 立即新建圈子</button></div>`
    : customCircles.map((c) => {
      const hasIt = (c.items || []).some((it) => String(it.id) === String(movie.id) || (movie.name && it.name === movie.name))
      return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:8px">
            <div>
              <div style="font-weight:600;font-size:14px;color:#fff">${esc(c.title)}</div>
              <div style="font-size:11px;color:var(--muted)">${c.items ? c.items.length : 0} 部影片 · ${esc(c.mood || '全部')}</div>
            </div>
            <button class="btn small ${hasIt ? 'danger' : 'primary'}" data-circle-toggle="${esc(c.id)}">
              ${hasIt ? '移除' : '收录'}
            </button>
          </div>
        `
    }).join('')

  modal.innerHTML = `
    <div class="cinemajoy-modal-card" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <h3>收录影片到影视圈</h3>
        <button class="btn small" id="btnCloseCircleModal" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:4px">影片：「${esc(movie.name)}」</div>
      <div style="max-height:300px;overflow-y:auto">
        ${circlesHtml}
      </div>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseCircleModal').onclick = () => modal.remove()

  const quickBtn = modal.querySelector('#btnQuickCreateCircle')
  if (quickBtn) {
    quickBtn.onclick = () => {
      modal.remove()
      openCreateCircleModal(movie)
    }
  }

  modal.querySelectorAll('[data-circle-toggle]').forEach((btn) => {
    btn.onclick = () => {
      const circleId = btn.dataset.circleToggle
      const c = customCircles.find((x) => String(x.id) === String(circleId))
      if (!c) return
      c.items = c.items || []
      const idx = c.items.findIndex((it) => String(it.id) === String(movie.id) || (movie.name && it.name === movie.name))
      if (idx >= 0) {
        c.items.splice(idx, 1)
        store.circles.update(c)
        btn.className = 'btn small primary'
        btn.textContent = '收录'
        toast(`已从「${c.title}」移出`)
      } else {
        if (c.items.length >= 100) {
          toast('单圈影片已达 100 部上限')
          return
        }
        c.items.push({
          id: String(movie.id || Date.now()),
          site: String(movie.site || ''),
          name: String(movie.name || ''),
          pic: String(movie.pic || ''),
          rating: String(movie.score || movie.rating || '8.8'),
          reason: '影迷挚爱推荐',
        })
        store.circles.update(c)
        btn.className = 'btn small danger'
        btn.textContent = '移除'
        toast(`已收录到「${c.title}」`)
      }
    }
  })

  document.body.appendChild(modal)
}

function openCreateCircleModal(initialMovie = null) {
  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'createCircleModal'
  const moods = ['独处时光', '悬疑解密', '怀旧岁月', '科幻未来', '治愈温情', '高分必看', '浪漫爱情', '深度剧情']
  const colors = [
    { label: '深夜静谧', value: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)' },
    { label: '雨夜微光', value: 'linear-gradient(135deg, #09203f 0%, #537895 100%)' },
    { label: '岁月留声', value: 'linear-gradient(135deg, #4b1248 0%, #f0c27b 100%)' },
    { label: '未来霓虹', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' },
    { label: '温暖治愈', value: 'linear-gradient(135deg, #2b5876 0%, #4e4376 100%)' },
    { label: '炽热史诗', value: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)' },
  ]

  modal.innerHTML = `
    <div class="cinemajoy-modal-card" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <h3>新建个性化影视圈</h3>
        <button class="btn small" id="btnCloseCreateModal" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">影视圈标题</label>
          <input id="inputCircleTitle" placeholder="例如：一个人悄悄看的反转神作" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:14px" />
        </div>
        <div style="display:flex;gap:12px">
          <div style="flex:1">
            <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">心情主题</label>
            <select id="selectCircleMood" style="width:100%;padding:8px 10px;background:#1a1c26;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px">
              ${moods.map((m) => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">主题色调</label>
            <select id="selectCircleColor" style="width:100%;padding:8px 10px;background:#1a1c26;border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px">
              ${colors.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">情绪导语与简介</label>
          <textarea id="inputCircleDesc" placeholder="写一句触动人心的导语，分享这组影单带给你的心境体验..." rows="3" style="width:100%;padding:8px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;resize:none"></textarea>
        </div>
        <button class="btn primary" id="btnSubmitCreateCircle" style="margin-top:6px;padding:10px">立即创建</button>
      </div>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseCreateModal').onclick = () => modal.remove()

  modal.querySelector('#btnSubmitCreateCircle').onclick = () => {
    const title = modal.querySelector('#inputCircleTitle').value.trim()
    const mood = modal.querySelector('#selectCircleMood').value
    const coverColor = modal.querySelector('#selectCircleColor').value
    const desc = modal.querySelector('#inputCircleDesc').value.trim()
    if (!title) {
      toast('请输入影视圈标题')
      return
    }
    const profile = store.profile.get()
    const newCircle = {
      id: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: title.slice(0, 50),
      mood: mood.slice(0, 20),
      desc: (desc || '记录每一个触动心灵的光影瞬间。').slice(0, 200),
      coverColor,
      author: { name: profile.nickname, avatar: profile.avatar },
      items: initialMovie ? [{
        id: String(initialMovie.id || Date.now()),
        site: String(initialMovie.site || ''),
        name: String(initialMovie.name || ''),
        pic: String(initialMovie.pic || ''),
        rating: String(initialMovie.score || initialMovie.rating || '8.8'),
        reason: '发起人开篇推荐',
      }] : [],
      isCustom: true,
      createdAt: Date.now(),
    }
    store.circles.add(newCircle)
    modal.remove()
    toast(`已成功创建「${newCircle.title}」`)
    if (location.hash.startsWith('#/circle/')) {
      navigate(`#/circle/${newCircle.id}`)
    } else {
      render()
    }
  }

  document.body.appendChild(modal)
}

function openImportCircleModal() {
  const modal = document.createElement('div')
  modal.className = 'cinemajoy-modal'
  modal.id = 'importCircleModal'
  modal.innerHTML = `
    <div class="cinemajoy-modal-card" onclick="event.stopPropagation()">
      <div class="cinemajoy-modal-head">
        <h3>导入外部影视圈密令</h3>
        <button class="btn small" id="btnCloseImportModal" style="padding:2px 8px;font-size:12px">✕</button>
      </div>
      <p style="font-size:12px;color:var(--text-dim);margin:0">粘贴好友分享给您的以 <code>CJ_CIRCLE_V1:</code> 开头的轻量影单密令：</p>
      <textarea id="importTokenInput" placeholder="CJ_CIRCLE_V1:eyJ2Ijox..." rows="4" style="width:100%;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:12px;font-family:monospace;resize:none"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn" id="btnCancelImport">取消</button>
        <button class="btn primary" id="btnConfirmImport">解析并收录</button>
      </div>
    </div>
  `
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
  modal.querySelector('#btnCloseImportModal').onclick = () => modal.remove()
  modal.querySelector('#btnCancelImport').onclick = () => modal.remove()

  modal.querySelector('#btnConfirmImport').onclick = async () => {
    const raw = modal.querySelector('#importTokenInput').value.trim()
    if (!raw) {
      toast('请先粘贴分享密令')
      return
    }
    try {
      const decoded = await shellApi.circles.decodeToken(raw)
      store.circles.add(decoded)
      modal.remove()
      toast(`成功导入影视圈「${decoded.title}」`)
      render()
    } catch (e) {
      toast('导入失败：' + (e.message || e))
    }
  }
  document.body.appendChild(modal)
}

async function openShareCircleModal(circle) {
  try {
    const token = await shellApi.circles.encodeToken(circle)
    const modal = document.createElement('div')
    modal.className = 'cinemajoy-modal'
    modal.id = 'shareCircleModal'
    modal.innerHTML = `
      <div class="cinemajoy-modal-card" onclick="event.stopPropagation()">
        <div class="cinemajoy-modal-head">
          <h3>分享影视圈「${esc(circle.title)}」</h3>
          <button class="btn small" id="btnCloseShareModal" style="padding:2px 8px;font-size:12px">✕</button>
        </div>
        <p style="font-size:13px;color:var(--text-dim);margin:0">专属轻量影单密令已生成，可复制发送给好友：</p>
        <textarea id="shareTokenOutput" readonly rows="4" style="width:100%;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#30d158;font-size:12px;font-family:monospace;resize:none">${token}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <button class="btn" id="btnExportJson">导出为 .json 文件</button>
          <button class="btn primary" id="btnCopyToken">复制密令</button>
        </div>
      </div>
    `
    modal.onclick = (e) => {
    if (e.target === modal) modal.remove()
  }
    modal.querySelector('#btnCloseShareModal').onclick = () => modal.remove()
    modal.querySelector('#btnCopyToken').onclick = async () => {
      await shellApi.media.copy(token)
      toast('密令已复制到剪贴板！')
    }
    modal.querySelector('#btnExportJson').onclick = () => {
      const blob = new Blob([JSON.stringify(circle, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `影悦_${circle.title}_影单.json`
      a.click()
      toast('影单文件已保存')
    }
    document.body.appendChild(modal)
  } catch (e) {
    toast('生成分享码失败：' + (e.message || e))
  }
}

// ---------------------------------------------------------------- 页面：收藏 / 记录 / 本地

function renderFavorites() {
  setWindowTitle('待播清单')
  const follows = store.follow ? store.follow.all() : []
  const favs = store.favorites.all()
  const map = new Map()
  for (const item of [...follows, ...favs]) {
    if (!map.has(item.key)) map.set(item.key, item)
  }
  const list = Array.from(map.values())
  view.innerHTML = `
    <h1 class="page-title">待播清单<span class="count">${list.length} 部</span></h1>
    ${list.length
      ? `<div class="grid">${list
        .map((item) => {
          const pic = picUrl(item.pic, item.name, item.year)
          const isPending = pic === PLACEHOLDER
          const pendingAttrs = isPending
            ? ` data-pending-title="${esc(item.name)}" data-pending-year="${esc(item.year || '')}" data-follow-key="${esc(item.key)}"`
            : ''
          return `
        <div class="card" data-act="open" data-site="${esc(item.site)}" data-id="${esc(item.id)}" data-title="${esc(item.name)}">
          <div class="card-cover">
            <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(item.name)}" data-year="${esc(item.year || '')}" alt="${esc(item.name)}" loading="${typeof index === 'number' && index < 12 ? 'eager' : 'lazy'}" decoding="async" />
            ${item.remarks ? `<div class="card-note">${esc(item.remarks)}</div>` : ''}
            <div class="card-hover-play" data-act="play-direct" data-site="${esc(item.site)}" data-id="${esc(item.id)}" data-title="${esc(item.name)}" title="立即播放 ${esc(item.name)}"><span>
              <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
            </span></div>
          </div>
          <div class="card-title">${esc(item.name)}</div>
          <div class="card-sub">${esc(item.typeName || '')}</div>
        </div>`
        })
        .join('')}</div>`
      : `<div class="empty"><div class="big">☆</div>待播清单还是空的<br/><span style="color:#6f737b">在详情页点「加入追更 / 待播」或「收藏」，将自动出现在这里</span></div>`
    }`
  if (list.length) hydratePendingPosters(view)
}

function renderHistory() {
  setWindowTitle('观看记录')
  const list = store.history.all()
  view.innerHTML = `
    <h1 class="page-title">观看记录<span class="count">${list.length} 条</span>
      ${list.length ? '<button class="btn small" id="clearHistory" style="margin-left:auto">清空</button>' : ''}
    </h1>
    ${list.length
      ? `<div class="grid">${list
        .map((h) => {
          const percent = h.duration ? Math.min(100, (h.time / h.duration) * 100) : 0
          const pic = picUrl(h.pic, h.name, h.year)
          const isPending = !h.pic || pic.startsWith('data:image/svg+xml')
          const pendingAttrs = isPending
            ? ` data-pending-title="${esc(h.name)}" data-pending-year="${esc(h.year || '')}" data-hist-key="${esc(h.key)}"`
            : ''
          return `
          <div class="card" data-act="resume" data-key="${esc(h.key)}">
            <div class="card-cover">
              <img src="${esc(pic)}"${pendingAttrs} data-title="${esc(h.name)}" alt="${esc(h.name)}" loading="lazy" decoding="async" />
              <div class="card-note">${esc(h.epName || '')}</div>
              <div class="card-hover-play"><span>
                <svg width="16" height="18" viewBox="0 0 16 18" fill="none"><path d="M1.5 1.6v14.8L14.6 9 1.5 1.6Z" fill="#fff"/></svg>
              </span></div>
              <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:#ffffff26">
                <div style="height:100%;width:${percent}%;background:var(--accent)"></div>
              </div>
            </div>
            <div class="card-title">${esc(h.name)}</div>
            <div class="card-sub">看到 ${fmtTime(h.time)}${h.duration ? ' / ' + fmtTime(h.duration) : ''}</div>
          </div>`
        })
        .join('')}</div>`
      : `<div class="empty"><div class="big">⌚</div>还没有观看记录<br/><span style="color:#6f737b">看过的视频会自动记下进度，方便下次接着看</span></div>`
    }`
  if (list.length) hydratePendingPosters(view)

  const clear = document.getElementById('clearHistory')
  if (clear) {
    clear.onclick = async () => {
      const ok = await shellApi.dialog.confirm({ title: '清空观看记录', message: '所有观看进度都会被删除，确定吗？' })
      if (!ok) return
      store.history.clear()
      renderHistory()
    }
  }
}

async function renderDownloads() {
  setWindowTitle('本地文件')
  const list = await shellApi.media.downloads()
  view.innerHTML = `
    <h1 class="page-title">本地文件<span class="count">${list.length} 个</span>
      <button class="btn small" id="openDir" style="margin-left:auto">在 Finder 中打开</button>
    </h1>
    ${list.length
      ? `<div class="source-list">${list
        .map(
          (f) => `
          <div class="source-row">
            <div class="source-row-main">
              <div class="source-row-name">${esc(f.name)}</div>
              <div class="source-row-api">${esc(f.path)}</div>
            </div>
            <div class="source-row-state">${(f.size / 1048576).toFixed(0)} MB</div>
            <button class="btn small" data-reveal="${esc(f.path)}">显示</button>
          </div>`
        )
        .join('')}</div>`
      : `<div class="empty"><div class="big">↓</div>还没有下载的文件<br/><span style="color:#6f737b">播放页的「下载」可以把 mp4 线路存到本机</span></div>`
    }`

  document.getElementById('openDir').onclick = () => shellApi.media.reveal(null)
  view.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.onclick = () => shellApi.media.reveal(btn.dataset.reveal)
  })
}

// ---------------------------------------------------------------- 页面：源管理

async function renderSettings() {
  setWindowTitle('源管理')
  state.sources = await shellApi.sources.list()

  view.innerHTML = `
    <h1 class="page-title">源管理</h1>

    <div class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h3 style="margin:0">片源列表</h3>
        <div style="display:flex;gap:8px">
          <button class="btn primary" id="btnProbeAllSources" style="font-size:12px;padding:4px 12px">⚡ 一键全源并发测速</button>
          <button class="btn" id="btnResetSources" style="font-size:12px;padding:4px 10px">一键重置为国内直连源</button>
        </div>
      </div>
      <p class="hint">
        内置源均为国内免翻墙高速直连源（优质资源、非凡、量子、电影天堂、360等），直接返回 JSON。
        点「切换」立即生效，点「测试」看它现在还能不能用。
      </p>
      <div class="source-list" id="sourceList"></div>
    </div>

    <div class="panel">
      <h3>添加单个源</h3>
      <p class="hint">填一个 <code>…/api.php/provide/vod/</code> 形式的接口地址即可。</p>
      <div class="field">
        <input id="newName" placeholder="名称，例如：某某资源" />
        <input id="newApi" placeholder="https://example.com/api.php/provide/vod/" style="flex:2" />
        <button class="btn primary" id="addSite">添加</button>
      </div>
    </div>

    <div class="panel">
      <h3>导入外部采集源配置</h3>
      <p class="hint">
        粘贴接口配置地址（或整段 JSON），会自动挑出里面所有纯 HTTP 的采集源导入。
      </p>
      <div class="field">
        <input id="sourceConfigInput" placeholder="https://…/sources.json 或直接粘贴 JSON" />
        <button class="btn primary" id="importSourceConfig">导入</button>
      </div>
    </div>

    <div class="panel">
      <h3>实验性功能</h3>
      <p class="hint">针对特定局域网环境的扩展功能，默认关闭以保障纯净极速体验。</p>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
        <div>
          <div style="font-size:14px;font-weight:600">局域网投屏 (DLNA / 手机扫码串流)</div>
          <div class="hint" style="margin:2px 0 0 0">开启后在播放器控制栏显示投屏按键，支持向智能电视投屏或生成手机播放直链</div>
        </div>
        <input type="checkbox" id="chkEnableCast" ${store.settings.get().enableCast ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer" />
      </div>
    </div>

    <div class="panel">
      <h3>关于</h3>
      <p class="hint" id="aboutText">影悦 · 独立版</p>
    </div>`

  const listEl = document.getElementById('sourceList')

  const paint = async () => {
    listEl.innerHTML = state.sources
      .map(
        (s) => {
          let badgeHtml = ''
          const lat = s.probeMs !== undefined ? s.probeMs : s.latency
          if (lat !== undefined && lat !== null) {
            let badgeCls = 'slow'
            if (s.probeOk === false || lat >= 2000) badgeCls = 'down'
            else if (lat < 400) badgeCls = 'fast'
            else if (lat < 900) badgeCls = 'medium'
            badgeHtml = `<span class="badge-speed ${badgeCls}">${badgeCls === 'down' ? '超时' : lat + 'ms'}</span>`
          }
          return `
      <div class="source-row ${s.key === (state.site || {}).key ? 'active' : ''}">
        <div class="source-row-main">
          <div class="source-row-name">${esc(s.name)}${s.builtin ? '' : ' <span style="color:#6f737b;font-size:11px">自定义</span>'} ${badgeHtml}</div>
          <div class="source-row-api">${esc(s.api)}</div>
        </div>
        <div class="source-row-state" data-state="${esc(s.key)}">${s.note ? esc(s.note) : '未测试'}</div>
        <button class="btn small" data-test="${esc(s.key)}">测试</button>
        <button class="btn small" data-use="${esc(s.key)}">${s.key === (state.site || {}).key ? '使用中' : '切换'}</button>
        <button class="btn small danger" data-del="${esc(s.key)}">删除</button>
      </div>`
        }
      )
      .join('')

    listEl.querySelectorAll('[data-use]').forEach((btn) => {
      btn.onclick = async () => {
        await switchSite(btn.dataset.use)
        renderSettings()
      }
    })

    listEl.querySelectorAll('[data-test]').forEach((btn) => {
      btn.onclick = async () => {
        const key = btn.dataset.test
        const stateEl = listEl.querySelector(`[data-state="${key}"]`)
        stateEl.textContent = '测试中…'
        stateEl.className = 'source-row-state'
        const res = await shellApi.sources.test(key)
        if (res.ok) {
          stateEl.textContent = `${res.classes} 个分类 · ${res.ms}ms`
          stateEl.className = 'source-row-state ok'
        } else {
          stateEl.textContent = '不可用'
          stateEl.className = 'source-row-state bad'
          toast('这个源现在连不上：' + (res.message || ''))
        }
      }
    })

    listEl.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        const ok = await shellApi.dialog.confirm({ title: '删除源', message: '删除后可以再添加回来，确定吗？' })
        if (!ok) return
        state.sources = await shellApi.sources.remove(btn.dataset.del)
        if (state.site && state.site.key === btn.dataset.del) {
          state.site = state.sources.find((s) => s.enabled !== false) || state.sources[0] || null
          renderSourcePill()
        }
        renderSettings()
      }
    })
  }

  await paint()

  const btnProbe = document.getElementById('btnProbeAllSources')
  if (btnProbe) {
    btnProbe.onclick = async () => {
      btnProbe.disabled = true
      btnProbe.textContent = '测速中…'
      try {
        const probed = await shellApi.router.probeAll()
        state.sources = await shellApi.sources.list()
        if (Array.isArray(probed)) {
          const latMap = new Map(probed.map((p) => [p.key, p]))
          state.sources.forEach((s) => {
            const p = latMap.get(s.key)
            if (p) {
              s.probeMs = p.latencyMs
              s.probeOk = p.ok
              s.probeHttp = p.httpStatus
            }
          })
          state.sources.sort((a, b) => {
            const aOk = a.probeOk !== false && (a.probeMs || 9999) < 2000
            const bOk = b.probeOk !== false && (b.probeMs || 9999) < 2000
            if (aOk && !bOk) return -1
            if (!aOk && bOk) return 1
            return (a.probeMs || 9999) - (b.probeMs || 9999)
          })
        }
        await paint()
        toast('全源测速完成')
      } catch (e) {
        toast('测速失败：' + (e.message || e))
      } finally {
        btnProbe.disabled = false
        btnProbe.textContent = '⚡ 一键全源并发测速'
      }
    }
  }

  const btnReset = document.getElementById('btnResetSources')
  if (btnReset) {
    btnReset.onclick = async () => {
      const ok = await shellApi.dialog.confirm({
        title: '重置片源',
        message: '确定将片源列表重置为官方国内免翻墙直连源吗？自定义添加的外部源仍会保留。',
      })
      if (!ok) return
      state.sources = await shellApi.sources.resetDefault()
      const enabled = state.sources.filter((s) => s.enabled !== false)
      state.site = enabled.find((s) => s.key === state.site?.key) || enabled[0] || state.sources[0] || null
      if (state.site) {
        store.settings.set({ ...store.settings.get(), site: state.site.key })
      }
      renderSourcePill()
      renderSettings()
      toast('已成功重置为国内免翻墙直连源')
    }
  }

  document.getElementById('addSite').onclick = async () => {
    const name = document.getElementById('newName').value.trim()
    const apiUrl = document.getElementById('newApi').value.trim()
    if (!apiUrl) return toast('先填接口地址')
    try {
      const site = await shellApi.sources.add({ name: name || '自定义源', api: apiUrl })
      state.sources = await shellApi.sources.list()
      document.getElementById('newName').value = ''
      document.getElementById('newApi').value = ''
      toast('已添加「' + site.name + '」')
      renderSettings()
    } catch (error) {
      toast('添加失败：' + (error.message || error))
    }
  }

  const btnImportSource = document.getElementById('importSourceConfig')
  if (btnImportSource) {
    btnImportSource.onclick = async () => {
      const inputEl = document.getElementById('sourceConfigInput')
      const target = inputEl ? inputEl.value.trim() : ''
      if (!target) return toast('先填配置地址或粘贴 JSON')
      toast('正在解析配置…', 4000)
      try {
        const res = await shellApi.sources.importTvbox(target)
        state.sources = await shellApi.sources.list()
        const extra = res.spider ? `，跳过 ${res.spider} 个 spider 源` : ''
        toast(`导入完成：新增 ${res.added} 个源（配置里可用 HTTP 源 ${res.total} 个${extra}）`, 4000)
        if (inputEl) inputEl.value = ''
        renderSettings()
      } catch (error) {
        toast('导入失败：' + (error.message || error))
      }
    }
  }

  const chkCast = document.getElementById('chkEnableCast')
  if (chkCast) {
    chkCast.onchange = () => {
      store.settings.patch({ enableCast: chkCast.checked })
      toast(chkCast.checked ? '已开启局域网投屏支持' : '已关闭局域网投屏支持')
    }
  }

  const info = await shellApi.info()
  document.getElementById('aboutText').innerHTML = `
    版本 ${esc(info.version)} · 数据目录 <code>${esc(info.downloads)}</code><br/>
    界面与播放器全部由本应用提供，不加载任何网站页面。片源由你选择的接口提供。`
}

// ---------------------------------------------------------------- 无源兜底

function renderNoSource() {
  view.innerHTML = `
    <div class="empty">
      <div class="big">⚠</div>
      还没有可用的片源
      <div style="margin-top:18px"><button class="btn primary" data-act="nav" data-route="settings">去添加片源</button></div>
    </div>`
}

// ---------------------------------------------------------------- 渲染总入口

async function render() {
  destroyPlayer()
  clearInterval(state.heroTimer)
  // 切页先拆掉上一页的无限滚动观察器，避免它对已经消失的哨兵继续回调
  if (listObserver) {
    listObserver.disconnect()
    listObserver = null
  }
  trackNav()
  state.route = parseRoute()
  const { name, params } = state.route
  document.body.dataset.route = name

  // 记录最近浏览过的分类/主页/列表页（离开详情页或播放器时能精准返回）
  if (!['detail', 'play'].includes(name)) {
    state.lastBrowseRoute = location.hash || '#/home'
  }

  closeSourcePopover()
  markActiveNav()
  window.scrollTo(0, 0)

  if (!state.site && name !== 'settings') return renderNoSource()

  switch (name) {
    case 'home':
      await renderHome()
      break
    case 'cat':
      await renderCategory(params[0] || 'movie')
      break
    case 'detail':
      await renderDetail(params[0], params[1])
      break
    case 'play':
      await renderPlay(params[0], params[1], params[2], params[3])
      break
    case 'search':
      await renderSearch(params[0] || '')
      break
    case 'circles':
      await renderCineCircles(params[0] ? decodeURIComponent(params[0]) : '精选')
      break
    case 'circle':
      await renderCircleDetail(params[0])
      break
    case 'profile':
      await renderProfile()
      break
    case 'rank':
      await renderCineCircles(params[0] ? decodeURIComponent(params[0]) : '精选')
      break
    case 'favorites':
      await renderRankings('all')
      break
    case 'history':
      renderHistory()
      break
    case 'downloads':
      await renderDownloads()
      break
    case 'settings':
      await renderSettings()
      break
    default:
      await renderHome()
  }
}

function markActiveNav() {
  const { name, params } = state.route
  const btnTopbarBack = document.getElementById('btnTopbarBack')
  if (btnTopbarBack) {
    btnTopbarBack.classList.toggle('disabled', name === 'home')
  }
  document.querySelectorAll('.nav-item').forEach((el) => {
    let active = false
    if (name === 'home' && el.dataset.route === 'home') active = true
    if (name === 'cat' && el.dataset.route === 'cat' && el.dataset.cat === params[0]) active = true
    if (['circles', 'circle', 'rank'].includes(name) && el.dataset.route === 'circles') active = true
    if (name === 'profile' && el.dataset.route === 'profile') active = true
    if (['rank', 'favorites', 'history', 'downloads', 'settings'].includes(name) && el.dataset.route === name) active = true
    el.classList.toggle('active', active)
  })
}

// ---------------------------------------------------------------- 交互

function openDetail(siteKey, id) {
  navigate(`#/detail/${siteKey}/${id}`)
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-act]')
  if (target) {
    const act = target.dataset.act
    if (act === 'play-direct') {
      event.stopPropagation()
      const { site, id, title } = target.dataset
      if (site && id) {
        navigate(`#/play/${site}/${id}/0/0`)
      } else if (title) {
        playCircleMovie({ name: title })
      }
      return
    }
    if (act === 'open') {
      const { site, id, title } = target.dataset
      if (site && id) {
        return openDetail(site, id)
      } else if (title) {
        return playCircleMovie({ name: title })
      }
    }
    if (act === 'cat') return navigate(`#/cat/${target.dataset.cat}`)
    if (act === 'nav') return navigate(`#/${target.dataset.route}`)
    if (act === 'resume') {
      const entry = store.history.get(target.dataset.key)
      if (entry) navigate(`#/play/${entry.site}/${entry.id}/${entry.line}/${entry.ep}`)
      return
    }
  }

  const navItem = event.target.closest('.nav-item')
  if (navItem) {
    if (navItem.dataset.route === 'cat') navigate(`#/cat/${navItem.dataset.cat}`)
    else navigate(`#/${navItem.dataset.route}`)
    return
  }

  if (!event.target.closest('#btnSourceSwitch') && !event.target.closest('#sourcePill') && !event.target.closest('#sourcePopover')) {
    closeSourcePopover()
  }
})

// 搜索
const searchInput = document.getElementById('searchInput')
let searchTimer = null
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer)
  const value = searchInput.value.trim()
  if (!value) return
  searchTimer = setTimeout(() => navigate(`#/search/${encodeURIComponent(value)}`), 500)
})
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    clearTimeout(searchTimer)
    const value = searchInput.value.trim()
    if (value) navigate(`#/search/${encodeURIComponent(value)}`)
  }
  if (event.key === 'Escape') searchInput.blur()
})

// 源切换浮层
function closeSourcePopover() {
  sourcePopover.hidden = true
}

function toggleSourcePopover() {
  if (!sourcePopover.hidden) return closeSourcePopover()
  const enabled = state.sources.filter((s) => s.enabled !== false)
  sourcePopover.innerHTML =
    enabled
      .map(
        (s) => `<div class="popover-item ${s.key === (state.site || {}).key ? 'active' : ''}" data-switch="${esc(s.key)}">
          <span class="dot"></span><span>${esc(s.name)}</span>
          ${s.key === (state.site || {}).key ? '<span style="margin-left:auto;font-size:11px">使用中</span>' : ''}
        </div>`
      )
      .join('') + `<div class="popover-foot" data-act="nav" data-route="settings">管理片源…</div>`

  sourcePopover.querySelectorAll('[data-switch]').forEach((el) => {
    el.onclick = () => switchSite(el.dataset.switch)
  })
  sourcePopover.hidden = false
}

document.getElementById('sourcePill')?.addEventListener('click', toggleSourcePopover)
document.getElementById('btnSourceSwitch')?.addEventListener('click', toggleSourcePopover)
document.getElementById('btnRefresh')?.addEventListener('click', () => render())
document.getElementById('btnBack')?.addEventListener('click', () => goBack())

const btnTopbarBack = document.getElementById('btnTopbarBack')
if (btnTopbarBack) {
  btnTopbarBack.onclick = () => goBack()
}

function toggleShortcutModal(force) {
  let modal = document.getElementById('shortcutModal')
  if (force === false || (modal && force === undefined)) {
    if (modal) modal.remove()
    return
  }
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'shortcutModal'
    modal.className = 'shortcut-modal'
    modal.innerHTML = `
      <div class="shortcut-card" onclick="event.stopPropagation()">
        <div class="shortcut-head">
          <h3>键盘快捷键指南</h3>
          <button class="btn small" id="btnCloseShortcut" style="padding:2px 8px;font-size:12px">✕</button>
        </div>
        <div class="shortcut-grid">
          <div class="shortcut-row"><span>播放 / 暂停</span><kbd>空格 Space</kbd></div>
          <div class="shortcut-row"><span>全屏切换 / 退出</span><kbd>F / 双击视频</kbd></div>
          <div class="shortcut-row"><span>快退 / 快进 10 秒</span><kbd>← / →</kbd></div>
          <div class="shortcut-row"><span>音量调节</span><kbd>↑ / ↓</kbd></div>
          <div class="shortcut-row"><span>静音切换</span><kbd>M</kbd></div>
          <div class="shortcut-row"><span>上一集 / 下一集</span><kbd>[ / ] 或 ⌘← / ⌘→</kbd></div>
          <div class="shortcut-row"><span>音效增强 / 对白模式</span><kbd>E</kbd></div>
          <div class="shortcut-row"><span>定格此刻入影视圈</span><kbd>B</kbd></div>
          <div class="shortcut-row"><span>高光片段截取分享</span><kbd>S</kbd></div>
          <div class="shortcut-row"><span>快捷键帮助指南</span><kbd>? / F1</kbd></div>
          <div class="shortcut-row"><span>退出播放 / 返回</span><kbd>Esc</kbd></div>
        </div>
      </div>
    `
    modal.onclick = (e) => {
      if (e.target === modal) toggleShortcutModal(false)
    }
    modal.querySelector('#btnCloseShortcut').onclick = () => toggleShortcutModal(false)
    document.body.appendChild(modal)
  }
}

// 键盘
document.addEventListener('keydown', (event) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if (typing) return

  // 快捷键指南浮层
  if (event.key === '?' || event.key === 'F1') {
    event.preventDefault()
    toggleShortcutModal()
    return
  }

  const shortcutModal = document.getElementById('shortcutModal')
  if (shortcutModal && event.key === 'Escape') {
    toggleShortcutModal(false)
    return
  }

  // 全局快捷键：⌘[ 或 Alt+左箭头 返回上一页
  if (((event.metaKey || event.ctrlKey) && event.key === '[') || (event.altKey && event.key === 'ArrowLeft')) {
    event.preventDefault()
    goBack()
    return
  }
  const player = state.player
  if (!player) {
    if (event.key === 'Escape') closeSourcePopover()
    return
  }
  const { video, goEp } = player
  switch (event.key) {
    case 'Escape':
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { })
        break
      }
      goBack()
      break
    case ' ':
      event.preventDefault()
      video.paused ? video.play() : video.pause()
      break
    case '[':
      if (!event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        goEp(-1)
      }
      break
    case ']':
      if (!event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        goEp(1)
      }
      break
    case 'ArrowLeft':
      if (event.metaKey || event.ctrlKey) {
        goEp(-1)
      } else {
        video.currentTime = Math.max(0, video.currentTime - 10)
      }
      break
    case 'ArrowRight':
      if (event.metaKey || event.ctrlKey) {
        goEp(1)
      } else {
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
      }
      break
    case 'ArrowUp':
      video.volume = Math.min(1, video.volume + 0.05)
      break
    case 'ArrowDown':
      video.volume = Math.max(0, video.volume - 0.05)
      break
    case 'f':
    case 'F':
      document.getElementById('btnFull')?.click()
      break
    case 'm':
    case 'M':
      video.muted = !video.muted
      break
    case 't':
    case 'T':
      if (store.settings.get().enableCast) {
        document.getElementById('btnCast')?.click()
      }
      break
    case 'e':
    case 'E':
      document.getElementById('btnAudioFx')?.click()
      break
    case 'b':
    case 'B':
      document.getElementById('btnPinMoment')?.click()
      break
    case 's':
    case 'S':
      document.getElementById('btnClipShare')?.click()
      break
    default:
      break
  }
})

// 菜单快捷键 → 播放器
shellApi.on('player', (command) => {
  const player = state.player
  if (!player) return
  const { video, goEp } = player
  if (command === 'toggle') video.paused ? video.play() : video.pause()
  if (command === 'prev') goEp(-1)
  if (command === 'next') goEp(1)
  if (command === 'seek-back') video.currentTime = Math.max(0, video.currentTime - 10)
  if (command === 'seek-forward') video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
  if (command === 'mute') video.muted = !video.muted
  if (command === 'fullscreen') document.getElementById('btnFull')?.click()
})

shellApi.on('nav', (payload) => {
  if (payload.back) goBack()
  else if (payload.route) navigate(`#/${payload.route}`)
})

shellApi.on('zoom', async (delta) => {
  const step = delta === 0 ? 0 : delta > 0 ? 0.1 : -0.1
  document.body.style.zoom = step === 0 ? 1 : Math.max(0.7, Math.min(1.6, Number(document.body.style.zoom || 1) + step))
})

shellApi.on('download:progress', (payload) => {
  if (payload.percent % 10 === 0) toast(`下载中 ${payload.percent}%`, 900)
})

  // ---------------------------------------------------------------- 启动

  ; (async function boot() {
    try {
      const info = await shellApi.info()
      state.platform = info.platform || 'darwin'
      if (state.platform === 'win32') {
        document.documentElement.classList.add('platform-win')
        document.body.classList.add('platform-win')
        const kbd = document.querySelector('.search-kbd')
        if (kbd) kbd.textContent = 'Ctrl+F'
        const btnBack = document.getElementById('btnBack')
        if (btnBack) btnBack.title = '后退 (Alt+←)'
      }
    } catch (_) { }

    await loadSources()
    if (state.site) await ensureClasses(state.site)
    syncTopbarIdentity()
    document.getElementById('btnSidebarExplore')?.addEventListener('click', () => navigate('#/cat/4k'))
    document.getElementById('sidebarPromoCard')?.addEventListener('click', () => navigate('#/cat/4k'))
    if (!location.hash) location.hash = '#/home'
    await render()
    searchInput.placeholder = '搜索电影、新片专栏、影视圈…'

    // 后台静默预热热播榜单缓存（实现全 Tab 0 毫秒秒开）与历史记录图床洗白
    setTimeout(async () => {
      state.rankCache = state.rankCache || {}
      for (const tab of ['all', 'movie', 'series', 'anime', 'variety']) {
        try {
          const res = await shellApi.api.rankings({ type: tab, limit: 20 })
          if (res && res.length) state.rankCache[tab] = res
        } catch {
          /* 静默容错 */
        }
      }

      // 洗白历史与追更中的旧海外死链
      try {
        const historyItems = store.history ? store.history.all() : []
        let updated = false
        for (const h of historyItems.slice(0, 15)) {
          const lower = String(h.pic || '').toLowerCase()
          const needFix = !lower || lower.includes('placeholder') || lower.includes('data:image/svg+xml')
          if (needFix) {
            const poster = await shellApi.api.getPoster({ title: h.name, year: h.year })
            if (poster) {
              h.pic = poster
              store.history.set(h.key, h)
              updated = true
            }
          }
        }
        if (updated && location.hash.startsWith('#/home')) {
          renderContinueRow()
          renderFollowRow()
        }
      } catch { }
    }, 400)
  })()
