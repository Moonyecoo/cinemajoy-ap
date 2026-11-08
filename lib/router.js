'use strict'

/**
 * 多臂老虎机 (Multi-Armed Bandit) 自适应多源测速与故障无缝倒换路由
 *
 * 算法原理：
 * 1. Thompson Sampling (Beta-Bernoulli 分布)：动态维护各片源的成功率分布。
 * 2. 衰减因子：近期请求权重更高，自愈恢复后可重新获得流量。
 * 3. 故障秒级倒换：首选源失败后自动无感知切换备选源。
 */

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

let stats = new Map() // key -> { alpha: number, beta: number, latencyEma: number, lastTested: number }
let isLoaded = false

function getStatsPath() {
  try {
    const userData = app ? app.getPath('userData') : path.join(__dirname, '..', 'data')
    return path.join(userData, 'router_stats.json')
  } catch {
    return path.join(__dirname, '..', 'data', 'router_stats.json')
  }
}

function loadStats() {
  if (isLoaded) return
  isLoaded = true
  try {
    const file = getStatsPath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      for (const [k, v] of Object.entries(data)) {
        stats.set(k, v)
      }
    }
  } catch {
    /* 忽略读取错误 */
  }
}

let saveTimer = null
function persistStats() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const file = getStatsPath()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const obj = Object.fromEntries(stats.entries())
      fs.writeFileSync(file, JSON.stringify(obj, null, 2))
    } catch {
      /* 忽略写入错误 */
    }
  }, 1000)
}

function getSiteStats(siteKey) {
  loadStats()
  if (!stats.has(siteKey)) {
    // 初始先验：alpha=3, beta=1 (先验假定大概率可用)
    stats.set(siteKey, {
      alpha: 3,
      beta: 1,
      latencyEma: 400,
      lastTested: 0,
      consecutiveFailures: 0,
      circuitBreakUntil: 0,
    })
  }
  return stats.get(siteKey)
}

function isCircuitBroken(siteKey) {
  loadStats()
  const s = stats.get(siteKey)
  if (!s || !s.circuitBreakUntil) return false
  return Date.now() < s.circuitBreakUntil
}

function resetCircuitBreaker(siteKey) {
  loadStats()
  const s = stats.get(siteKey)
  if (s) {
    s.consecutiveFailures = 0
    s.circuitBreakUntil = 0
    persistStats()
  }
}

/**
 * 工业级综合评分公式：
 * Score = (0.5 * 真实画质) + (0.3 * (1 / 首片TTFB)) + (0.2 * 历史成功率)
 */
function calculateCompositeScore({ qualityScore = 80, ttfbMs = 300, successRate = 1.0 } = {}) {
  const normQuality = Math.min(1, Math.max(0, qualityScore / 100))
  const normTTFB = Math.min(1, Math.max(0, 1000 / Math.max(100, Number(ttfbMs) || 500)))
  const normSuccess = Math.min(1, Math.max(0, Number(successRate) || 0))
  return Number((0.5 * normQuality + 0.3 * normTTFB + 0.2 * normSuccess).toFixed(4))
}

/**
 * Beta 分布采样函数 (利用 Gamma 分布变体或近似采样)
 */
function sampleBeta(alpha, beta) {
  // 当参数较小时用标准累加近似生成
  let u = 0
  let v = 0
  for (let i = 0; i < alpha; i += 1) u += -Math.log(Math.random() + 1e-10)
  for (let i = 0; i < beta; i += 1) v += -Math.log(Math.random() + 1e-10)
  return u / (u + v)
}

let isOfflineFrozen = false

function setOfflineFrozen(frozen) {
  isOfflineFrozen = Boolean(frozen)
}

function isOffline() {
  return isOfflineFrozen || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

/**
 * 记录一次源的请求结果
 * @param {string} siteKey
 * @param {boolean} success
 * @param {number} latencyMs
 */
function recordOutcome(siteKey, success, latencyMs = 500) {
  // 宿主整机离线保护：全局断网时冻结熔断扣分，避免网络恢复后所有正常源全部陷入 5 分钟死锁
  if (!success && isOffline()) {
    return
  }
  const s = getSiteStats(siteKey)
  // 衰减因子：保持历史样本不会无穷膨胀 (滑动窗口效果)
  const decay = 0.98
  s.alpha = s.alpha * decay + (success ? 1 : 0)
  s.beta = s.beta * decay + (success ? 0 : 1)

  if (success) {
    s.consecutiveFailures = 0
    s.circuitBreakUntil = 0
  } else {
    s.consecutiveFailures = (s.consecutiveFailures || 0) + 1
    if (s.consecutiveFailures >= 3) {
      s.circuitBreakUntil = Date.now() + 5 * 60 * 1000 // 连续 3 次失败触发 5 分钟熔断冷却
    }
  }

  // 延迟指数平滑 (EMA)
  if (success && Number.isFinite(latencyMs) && latencyMs > 0) {
    s.latencyEma = Math.round(s.latencyEma * 0.8 + latencyMs * 0.2)
  }
  s.lastTested = Date.now()
  persistStats()
}

/**
 * 计算多源排序（按 Thompson Sampling 抽样得分与延迟衰减综合排序，熔断源自动沉底）
 * @param {Array<{key: string, name: string}>} sites
 * @returns {Array<{key: string, name: string, score: number, latency: number}>}
 */
function rankSites(sites) {
  loadStats()
  const scored = sites.map((site) => {
    const s = getSiteStats(site.key)
    const broken = isCircuitBroken(site.key)
    const successSample = broken ? 0.001 : sampleBeta(Math.max(1, Math.round(s.alpha)), Math.max(1, Math.round(s.beta)))
    // 延迟惩罚：时延越高，权重越低
    const latencyPenalty = 1 / (1 + Math.log10(1 + Math.max(10, s.latencyEma) / 100))
    const score = broken ? 0 : successSample * latencyPenalty
    return {
      ...site,
      score,
      latency: s.latencyEma,
      reliability: s.alpha / (s.alpha + s.beta),
      isCircuitBroken: broken,
    }
  })

  // 按得分降序
  return scored.sort((a, b) => b.score - a.score)
}

/**
 * 单源超轻量探活测速（绝不产生跨模块循环引用）
 * @param {object} site
 * @param {number} timeoutMs
 */
async function probeSite(site, timeoutMs = 2000) {
  if (!site || !site.api) return { key: site?.key, ok: false, ms: timeoutMs }
  const startedAt = Date.now()
  try {
    const sep = site.api.includes('?') ? '&' : '?'
    const probeUrl = `${site.api}${sep}ac=list`
    const res = await fetch(probeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json()
    const ms = Date.now() - startedAt
    const ok = res.ok && data && (Array.isArray(data.class) || Array.isArray(data.list) || Array.isArray(data.data))
    return {
      key: site.key,
      name: site.name,
      ok: Boolean(ok),
      ms,
      classes: Array.isArray(data?.class) ? data.class.length : 0,
    }
  } catch (err) {
    return {
      key: site.key,
      name: site.name,
      ok: false,
      ms: Math.max(timeoutMs, Date.now() - startedAt),
      error: err.message,
    }
  }
}

/**
 * 全源并发受控测速（滑动工作池，最大 4 路并发，杜绝破坏性硬熔断）
 * @param {Array} sites
 * @param {object} options
 */
async function probeAllSites(sites = [], { concurrency = 4, timeoutMs = 2000 } = {}) {
  const activeSites = Array.isArray(sites) ? sites.filter((s) => s.enabled !== false) : []
  if (!activeSites.length) return []

  const results = []
  let index = 0

  const pool = Array.from({ length: Math.min(concurrency, activeSites.length) }, async () => {
    while (index < activeSites.length) {
      const site = activeSites[index++]
      const res = await probeSite(site, timeoutMs)
      results.push(res)
      const s = getSiteStats(site.key)
      if (res.ok) {
        s.latencyEma = Math.round(s.latencyEma * 0.7 + res.ms * 0.3)
        s.alpha = s.alpha * 0.98 + 1
      } else {
        s.beta = s.beta * 0.98 + 0.5
      }
      s.lastTested = Date.now()
    }
  })

  await Promise.all(pool)
  persistStats()

  return rankSites(activeSites).map((r) => {
    const probeRes = results.find((x) => x.key === r.key)
    return {
      ...r,
      probeOk: probeRes ? probeRes.ok : false,
      probeMs: probeRes ? probeRes.ms : r.latency,
      classes: probeRes?.classes || 0,
    }
  })
}

module.exports = {
  recordOutcome,
  rankSites,
  getSiteStats,
  isCircuitBroken,
  resetCircuitBreaker,
  calculateCompositeScore,
  probeSite,
  probeAllSites,
  setOfflineFrozen,
  isOffline,
}

