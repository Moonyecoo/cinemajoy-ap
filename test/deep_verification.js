'use strict'

/**
 * 深度架构与高可用指标端到端验证脚本
 */

const assert = require('node:assert')
const metadata = require('../lib/metadata')
const router = require('../lib/router')
const prober = require('../lib/prober')
const recommender = require('../lib/recommender')

async function runTests() {
  console.log('--- 1. 验证元数据实体对齐与评分补全 (非 0 分覆盖率) ---')
  const rawSample = [
    { name: '沙丘2 4K国英双语', score: '0.0', year: '2024' },
    { name: '流浪地球2 HD中字', score: '0', year: '2023' },
    { name: '肖申克的救赎', score: '0.0', year: '1994' }
  ]
  const enriched = await metadata.enrichList(rawSample)
  for (const item of enriched) {
    const scoreVal = parseFloat(item.score)
    console.log(`[Metadata] ${item.name} -> 评分: ${item.score} | 分类: ${item.typeName}`)
    assert(scoreVal > 0, `评分必须大于 0，实际为: ${item.score}`)
  }

  console.log('\n--- 2. 验证多臂老虎机 (Bandit) 路由与自适应排序 ---')
  const mockSites = [
    { key: 'site_a', name: '优质高速源' },
    { key: 'site_b', name: '常崩延迟源' }
  ]
  // 模拟 site_a 连续成功、低时延
  for (let i = 0; i < 5; i++) router.recordOutcome('site_a', true, 120)
  // 模拟 site_b 连续失败、高时延
  for (let i = 0; i < 5; i++) router.recordOutcome('site_b', false, 4000)

  const ranked = router.rankSites(mockSites)
  console.log(`[Router] 排序首位: ${ranked[0].name} (得分: ${ranked[0].score.toFixed(3)})`)
  console.log(`[Router] 排序末位: ${ranked[1].name} (得分: ${ranked[1].score.toFixed(3)})`)
  assert(ranked[0].key === 'site_a', '优质源得分应显著高于故障源')

  console.log('\n--- 3. 验证 ffprobe 底层流特征探测与画质仲裁 ---')
  // 测试画质鉴权逻辑
  const fake4K = prober.evaluateTier(3840, 2160, 1500)
  console.log(`[Prober] 3840x2160 @ 1500kbps 判决: ${fake4K.label} (合格: ${fake4K.legit})`)
  assert(fake4K.legit === false, '低码率 4K 应判决为压制版，不能判为真 4K')

  const real1080 = prober.evaluateTier(1920, 1080, 4500)
  console.log(`[Prober] 1920x1080 @ 4500kbps 判决: ${real1080.label} (合格: ${real1080.legit})`)
  assert(real1080.legit === true, '高码率 1080P 应判决为原画蓝光')

  console.log('\n--- 4. 验证端侧轻量会话推荐引擎 ---')
  const userHistory = [
    { key: 's:1', typeName: '科幻 / 冒险', time: 7200, duration: 7500 }, // 完播率 > 90%
    { key: 's:2', typeName: '爱情 / 剧情', time: 60, duration: 7200 }     // 完播率 < 1% (跳出)
  ]
  const candidatePool = [
    { id: '101', name: '星际穿越', typeName: '科幻 / 冒险', score: '9.4' },
    { id: '102', name: '未知烂片', typeName: '爱情', score: '3.2' },
    { id: '103', name: '奥本海默', typeName: '传记 / 历史', score: '8.8' }
  ]
  const recs = recommender.rankRecommendations(candidatePool, userHistory, [], 3)
  console.log(`[Recommender] 推荐结果:`, recs.map(r => `${r.name} (${r.typeName})`))
  assert(recs[0].id === '101', '应优先推荐高完播偏好类型的优质影片')

  console.log('\n>>> 全部 4 项深度技术模块断言验证通过! <<<')
}

runTests().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})

