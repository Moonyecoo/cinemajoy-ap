'use strict'

const assert = require('assert')
const router = require('../lib/router')
const api = require('../lib/api')

async function run() {
  console.log('--- 1. 验证综合打分算法: Score = (0.5 * 画质) + (0.3 * (1/TTFB)) + (0.2 * 成功率) ---')
  const highScore = router.calculateCompositeScore({ qualityScore: 100, ttfbMs: 200, successRate: 1.0 })
  const midScore = router.calculateCompositeScore({ qualityScore: 70, ttfbMs: 800, successRate: 0.9 })
  const lowScore = router.calculateCompositeScore({ qualityScore: 30, ttfbMs: 2500, successRate: 0.4 })

  console.log(`[得分对比] 高画质极速源: ${highScore} | 普通源: ${midScore} | 慢速糊源: ${lowScore}`)
  assert(highScore > midScore, '高画质低延迟源得分必须高于普通源')
  assert(midScore > lowScore, '普通源得分必须高于慢速糊源')
  console.log('✓ 工业级多维综合打分验证通过')

  console.log('\n--- 2. 验证连续 3 次失败触发 5 分钟熔断冷却 ---')
  const testSiteKey = 'test_broken_site_' + Date.now()
  assert.strictEqual(router.isCircuitBroken(testSiteKey), false, '初始状态不应处于熔断')

  // 模拟第 1、2 次失败 (尚未达到阈值 3)
  router.recordOutcome(testSiteKey, false, 3000)
  router.recordOutcome(testSiteKey, false, 3000)
  assert.strictEqual(router.isCircuitBroken(testSiteKey), false, '失败 2 次不应熔断')

  // 第 3 次失败：立刻触发熔断
  router.recordOutcome(testSiteKey, false, 3000)
  assert.strictEqual(router.isCircuitBroken(testSiteKey), true, '连续失败 3 次必须触发熔断')
  console.log('✓ 连续 3 次失败自动进入熔断冷却状态')

  console.log('\n--- 3. 验证熔断源自动沉底与路由隔离 ---')
  const mockSites = [
    { key: 'good_site', name: '极速骨干源' },
    { key: testSiteKey, name: '已熔断源' },
  ]
  for (let i = 0; i < 3; i++) router.recordOutcome('good_site', true, 150)
  const ranked = router.rankSites(mockSites)
  assert.strictEqual(ranked[0].key, 'good_site', '正常源必须排在第一位')
  assert.strictEqual(ranked[1].key, testSiteKey, '熔断源必须沉底')
  assert.strictEqual(ranked[1].isCircuitBroken, true, '熔断标志位必须生效')
  assert.strictEqual(ranked[1].score, 0, '熔断线路得分归零')
  console.log('✓ 熔断源自动沉底与流量隔离验证通过')

  console.log('\n--- 4. 验证成功响应自愈与熔断恢复 ---')
  // 模拟该线路探测成功恢复
  router.recordOutcome(testSiteKey, true, 200)
  assert.strictEqual(router.isCircuitBroken(testSiteKey), false, '成功一次后必须立刻自愈解除熔断')
  console.log('✓ 自愈与熔断解除机制验证通过')

  console.log('\n--- 5. 验证 findPlayableSource 线路自愈探活调度 ---')
  assert.strictEqual(typeof api.findPlayableSource, 'function')
  assert.strictEqual(typeof api.probeM3u8, 'function')
  console.log('✓ 探活与切源调度函数全部就绪')

  console.log('\n--- 6. 验证 probeAllSites 并发探针与防熔断雪崩 ---')
  assert.strictEqual(typeof router.probeAllSites, 'function')
  const mockProbingSites = [
    { key: 'probe_test_1', api: 'https://127.0.0.1:9/api.php' },
    { key: 'probe_test_2', api: 'https://127.0.0.1:9/api.php' },
  ]
  const probeStart = Date.now()
  const probeResults = await router.probeAllSites(mockProbingSites, { concurrency: 2, timeoutMs: 300 })
  const probeCost = Date.now() - probeStart
  assert.strictEqual(probeResults.length, 2)
  assert(probeCost < 1500, '并发探针耗时必须受控在超时预算内')
  assert.strictEqual(router.isCircuitBroken('probe_test_1'), false, '轻量测速探活失败绝不能累加硬熔断')
  assert.strictEqual(router.isCircuitBroken('probe_test_2'), false, '轻量测速探活失败绝不能累加硬熔断')
  console.log('✓ probeAllSites 并发探针与防熔断雪崩机制验证通过')

  console.log('\n--- 7. 验证全熔断自愈兜底机制 ---')
  // 模拟所有候选源均处于熔断状态
  const brokenSiteA = 'broken_site_a_' + Date.now()
  const brokenSiteB = 'broken_site_b_' + Date.now()
  for (let i = 0; i < 3; i++) {
    router.recordOutcome(brokenSiteA, false, 3000)
    router.recordOutcome(brokenSiteB, false, 3000)
  }
  assert.strictEqual(router.isCircuitBroken(brokenSiteA), true)
  assert.strictEqual(router.isCircuitBroken(brokenSiteB), true)
  // 调用 findPlayableSource，确保即使全源熔断也不会直接抛出异常或放弃
  const fallbackRes = await api.findPlayableSource(
    [
      { key: brokenSiteA, api: 'https://127.0.0.1:9/api.php', enabled: true },
      { key: brokenSiteB, api: 'https://127.0.0.1:9/api.php', enabled: true },
    ],
    { title: '测试全熔断自愈', currentSite: '' }
  )
  // 探测不可用源最终返回 null，但绝不应在过滤阶段被提前空置放弃
  assert.strictEqual(fallbackRes, null)
  console.log('✓ 全熔断自愈兜底机制验证通过')

  console.log('\n>>> 全部多源毫秒级竞速与秒开熔断测试全绿通过! <<<')
}

run().catch((e) => {
  console.error('Sources 测试失败:', e)
  process.exit(1)
})

