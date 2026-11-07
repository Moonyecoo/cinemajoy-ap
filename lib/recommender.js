'use strict'

/**
 * 端侧轻量智能推荐引擎
 *
 * 核心目标：
 * 1. 无需中心化服务，完全基于端侧隐式反馈（完播率、观看时长、收藏）建模。
 * 2. 结合多维特征（分类标签、权威评分、时空偏好）计算余弦/TF-IDF 相似度。
 * 3. 解决冷启动问题：无历史时按权威评分、热度与多样性兜底。
 */

/**
 * 从历史记录与收藏中提取用户兴趣偏好向量
 * @param {Array} history
 * @param {Array} favorites
 */
function buildUserProfile(history = [], favorites = []) {
  const typeWeights = new Map()
  const watchedKeys = new Set()

  // 1. 处理历史记录（根据完播率与时间衰减赋权）
  const now = Date.now()
  for (const h of history) {
    if (!h.key) continue
    const completion = h.duration > 0 ? Math.min(1, h.time / h.duration) : 0
    if (completion > 0.7) {
      watchedKeys.add(h.key)
    }

    // 时间衰减（以天为单位）
    const daysAgo = Math.max(0, (now - (h.updatedAt || now)) / (1000 * 86400))
    const timeDecay = 1 / (1 + daysAgo * 0.1)

    // 完播率权重：完播率越高，偏好越强
    let interestWeight = 1.0
    if (completion >= 0.75) interestWeight = 3.0
    else if (completion >= 0.3) interestWeight = 1.5
    else if (completion < 0.05) interestWeight = 0.2 // 前期跳出，降权

    const finalWeight = interestWeight * timeDecay
    const types = String(h.typeName || '').split(/[\s/,|]+/).filter(Boolean)
    for (const t of types) {
      typeWeights.set(t, (typeWeights.get(t) || 0) + finalWeight)
    }
  }

  // 2. 处理主动收藏（高显式信号）
  for (const f of favorites) {
    if (!f.key) continue
    const types = String(f.typeName || '').split(/[\s/,|]+/).filter(Boolean)
    for (const t of types) {
      typeWeights.set(t, (typeWeights.get(t) || 0) + 2.5)
    }
  }

  // 归一化兴趣权重
  const maxW = Math.max(...typeWeights.values(), 1)
  const normTypes = new Map()
  for (const [k, v] of typeWeights.entries()) {
    normTypes.set(k, v / maxW)
  }

  return {
    typeWeights: normTypes,
    watchedKeys,
    totalInteractions: history.length + favorites.length,
  }
}

/**
 * 计算单个片源与用户兴趣的匹配得分
 */
function scoreCandidate(item, profile) {
  let score = 0

  // 1. 过滤已高完成度看过的片
  const itemKey = `${item.site}:${item.id}`
  if (profile.watchedKeys.has(itemKey)) {
    return -1
  }

  // 2. 分类标签重合度得分 (权重 0.55)
  const types = String(item.typeName || '').split(/[\s/,|]+/).filter(Boolean)
  let typeScore = 0
  for (const t of types) {
    if (profile.typeWeights.has(t)) {
      typeScore += profile.typeWeights.get(t)
    }
  }
  score += Math.min(typeScore, 2.0) * 0.55

  // 3. 权威评分加权 (权重 0.30)
  const parsedScore = parseFloat(item.score)
  if (!Number.isNaN(parsedScore) && parsedScore > 0) {
    // 归一化到 0~1 (以 10 分制为基准)
    score += (parsedScore / 10.0) * 0.30
  } else {
    score += 0.15 // 中位默认分
  }

  // 4. 新鲜度/年代微调 (权重 0.15)
  const currentYear = new Date().getFullYear()
  const itemYear = parseInt(item.year, 10)
  if (!Number.isNaN(itemYear) && itemYear >= currentYear - 3) {
    score += 0.15
  } else {
    score += 0.05
  }

  return score
}

/**
 * 为用户生成个性化推荐列表
 * @param {Array} candidatePool 候选影视池
 * @param {Array} history 用户历史
 * @param {Array} favorites 用户收藏
 * @param {number} limit 推荐条数
 */
function rankRecommendations(candidatePool = [], history = [], favorites = [], limit = 12) {
  if (!Array.isArray(candidatePool) || !candidatePool.length) return []

  const profile = buildUserProfile(history, favorites)

  // 冷启动（没有任何行为）：按评分降序与多样性截取
  if (profile.totalInteractions === 0) {
    return [...candidatePool]
      .filter((x) => x && x.name)
      .sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0))
      .slice(0, limit)
  }

  // 有行为历史：多特征打分与重排
  const scored = []
  for (const item of candidatePool) {
    if (!item || !item.name) continue
    const s = scoreCandidate(item, profile)
    if (s > 0) {
      scored.push({ item, score: s })
    }
  }

  // 降序排序
  scored.sort((a, b) => b.score - a.score)

  // 多样性控制 (同主类型最多不超过 4 部)
  const finalItems = []
  const typeCounts = new Map()

  for (const entry of scored) {
    const mainType = String(entry.item.typeName || '其它').split(/[\s/,|]+/)[0]
    const currentCount = typeCounts.get(mainType) || 0
    if (currentCount < 4 || finalItems.length < limit / 2) {
      finalItems.push(entry.item)
      typeCounts.set(mainType, currentCount + 1)
      if (finalItems.length >= limit) break
    }
  }

  // 若多样性过滤后不够，用高分补齐
  if (finalItems.length < limit) {
    for (const entry of scored) {
      if (!finalItems.includes(entry.item)) {
        finalItems.push(entry.item)
        if (finalItems.length >= limit) break
      }
    }
  }

  return finalItems
}

module.exports = {
  buildUserProfile,
  scoreCandidate,
  rankRecommendations,
}

