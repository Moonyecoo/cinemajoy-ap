'use strict'

/**
 * 源管理
 *
 * 支持两种东西：
 *   1. 单个媒体采集接口地址（标准 HTTP JSON 源）
 *   2. 一份源订阅配置 JSON（含 sites 数组），会自动挑出其中「纯 HTTP」的源导入
 *      —— type 3 的 spider 源需要 jar，这个应用跑不了，直接跳过。
 */

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')
const { requestJson } = require('./api')

const SEED_FILE = path.join(__dirname, '..', 'data', 'sources.json')
const storeFile = () =>
  app && typeof app.getPath === 'function'
    ? path.join(app.getPath('userData'), 'sources.json')
    : path.join(__dirname, '..', 'data', 'sources.user.json')

const CURRENT_SEED_VERSION = 10

let cache = null
let removedKeys = null // 用户删掉的内置源，不再复活

function readSeed() {
  try {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
    return (seed.sites || []).map((s) => ({ ...s, builtin: true, enabled: s.enabled !== false }))
  } catch {
    return []
  }
}

/**
 * 合并内置源与用户改动。
 *
 * 规则（四条都要满足，不然升级一次列表就乱）：
 *   1. 内置源的名称/地址/备注始终以出厂文件为准 —— 不然旧版本留下的死源删不掉。
 *   2. 用户改过的「启用/停用」状态保留。
 *   3. 用户自己加的源原样保留，排在后面。
 *   4. 用户删掉的内置源记在 removed 里，不再复活。
 *   5. 版本跃迁升级（如版本 < 6）时，彻底清除旧版 HTTPS 阻断/死源，重置为国内免翻墙 HTTP 直连专线源，保留用户自定义源。
 */
function load() {
  if (cache) return cache

  let store = null
  try {
    store = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
  } catch {
    store = null
  }

  const seed = readSeed()
  const seedKeys = new Set(seed.map((s) => s.key))

  if (!store || !Array.isArray(store.sites) || !store.sites.length || (store.version || 0) < CURRENT_SEED_VERSION) {
    const userCustom = Array.isArray(store?.sites)
      ? store.sites.filter((s) => !s.builtin && !seedKeys.has(s.key))
      : []
    cache = [...seed, ...userCustom]
    removedKeys = new Set()
    save()
    return cache
  }

  const removed = new Set(Array.isArray(store.removed) ? store.removed : [])
  removedKeys = removed
  const userByKey = new Map(store.sites.map((s) => [s.key, s]))

  const merged = []
  for (const item of seed) {
    if (removed.has(item.key)) continue
    const prev = userByKey.get(item.key)
    merged.push(prev ? { ...item, enabled: prev.enabled !== false } : item)
  }
  // 用户自建的源（不在出厂列表里）保留
  for (const item of store.sites) {
    if (item.builtin || seedKeys.has(item.key)) continue // 内置源一律以出厂值为准，上面已经合并过
    merged.push(item)
  }

  cache = merged
  // 合并结果和磁盘上不一致就落盘，免得文件一直停在旧版本的样子
  if (JSON.stringify(store.sites) !== JSON.stringify(merged)) save()
  return cache
}

function save() {
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true })
    fs.writeFileSync(
      storeFile(),
      JSON.stringify({ version: CURRENT_SEED_VERSION, sites: cache || [], removed: [...(removedKeys || [])] }, null, 2)
    )
  } catch {
    /* 写不进去不影响使用 */
  }
}

function resetDefault() {
  const seed = readSeed()
  let store = null
  try {
    store = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
  } catch {
    store = null
  }
  const seedKeys = new Set(seed.map((s) => s.key))
  const userCustom = Array.isArray(store?.sites)
    ? store.sites.filter((s) => !s.builtin && !seedKeys.has(s.key))
    : []
  cache = [...seed, ...userCustom]
  removedKeys = new Set()
  save()
  return cache
}

function list() {
  return load()
}

function enabled() {
  return load().filter((s) => s.enabled !== false)
}

function get(key) {
  return load().find((s) => s.key === key) || null
}

function slugify(name, api) {
  const base = String(name || api)
    .replace(/[^\w\u4e00-\u9fa5]+/g, '')
    .slice(0, 10)
  return `${base || 'site'}-${Math.random().toString(36).slice(2, 6)}`
}

function normalizeApi(api) {
  let value = String(api || '').trim()
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = 'http://' + value
  return value
}

function addSite({ name, api, note }) {
  const cleanApi = normalizeApi(api)
  if (!cleanApi) throw new Error('接口地址为空')
  const exists = load().find((s) => s.api === cleanApi)
  if (exists) return exists
  const site = {
    key: slugify(name, cleanApi),
    name: String(name || '自定义源').trim() || '自定义源',
    api: cleanApi,
    type: 1,
    enabled: true,
    note: note || '',
    builtin: false,
  }
  cache = [...load(), site]
  save()
  return site
}

function removeSite(key) {
  const target = load().find((s) => s.key === key)
  if (target && target.builtin) {
    if (!removedKeys) removedKeys = new Set()
    removedKeys.add(key)
  }
  cache = load().filter((s) => s.key !== key)
  save()
  return cache
}

function toggleSite(key, value) {
  cache = load().map((s) => (s.key === key ? { ...s, enabled: !!value } : s))
  save()
  return cache
}

/** 从源订阅配置里挑出能直接跑的源 */
async function importSources(configUrlOrJson) {
  let config = null
  const text = String(configUrlOrJson || '').trim()
  if (!text) throw new Error('地址为空')

  if (text.startsWith('{')) {
    config = JSON.parse(text)
  } else {
    config = await requestJson(text, 25000)
  }

  const rawSites = Array.isArray(config.sites) ? config.sites : []
  const picked = []
  let spider = 0
  let other = 0
  for (const site of rawSites) {
    const type = Number(site.type)
    const api = String(site.api || '')
    if (type === 3) {
      spider += 1
      continue
    }
    if (type !== 0 && type !== 1) {
      other += 1
      continue
    }
    if (!/^https?:\/\//i.test(api)) {
      other += 1
      continue
    }
    picked.push({ name: String(site.name || '未命名').trim(), api })
  }

  if (!picked.length) {
    if (spider) {
      throw new Error(
        `这份配置里 ${spider} 个源均需要专用自定义爬虫环境，本应用仅收录标准 HTTP 接口采集源。` +
          `换一份标着「采集」「直连」的配置试试。`
      )
    }
    throw new Error(`这份配置里没有找到 HTTP 接口源（共 ${rawSites.length} 条）`)
  }

  const added = []
  for (const item of picked) {
    try {
      added.push(addSite({ name: item.name, api: item.api, note: '订阅导入' }))
    } catch {
      /* 重复的跳过 */
    }
  }
  return {
    added: added.length,
    total: picked.length,
    skipped: spider + other,
    spider,
    sites: added,
  }
}

const importSourceConfig = importSources
const importTvbox = importSources

module.exports = { list, enabled, get, addSite, removeSite, toggleSite, importSources, importSourceConfig, importTvbox, resetDefault }
