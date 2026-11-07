'use strict'

const assert = require('assert')
const quality = require('../lib/quality')

async function run() {
  console.log('--- 1. 验证 master m3u8 多码率流特征解析 ---')
  const sampleMasterM3u8 = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=8500000,RESOLUTION=3840x2160
4k/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3800000,RESOLUTION=1920x1080
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=1920x1080
1080p_low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=854x480
480p/index.m3u8
`.trim()

  const variants = quality.parseMasterPlaylist(sampleMasterM3u8, 'https://cdn.example.com/live/')
  console.log('解析出清晰度分档数:', variants.length)
  assert.strictEqual(variants.length, 5, '必须提取全部 5 档码率')
  assert.strictEqual(variants[0].width, 3840, '首位必须为最高码率档 (4K)')
  assert.strictEqual(variants[0].url, 'https://cdn.example.com/live/4k/index.m3u8')
  console.log('✓ master m3u8 多分辨率与带宽解析正确')

  console.log('\n--- 2. 验证真 1080P 原画蓝光 vs 伪 1080P 低码糊源仲裁 ---')
  const real1080 = quality.judgeStreamQuality({ width: 1920, height: 1080, kbps: 3800 })
  console.log('[1080P 原画]', real1080)
  assert.strictEqual(real1080.tier, '1080P-high')
  assert.strictEqual(real1080.isTrueHD, true)
  assert.strictEqual(real1080.legit, true)

  const fake1080 = quality.judgeStreamQuality({ width: 1920, height: 1080, kbps: 700 })
  console.log('[1080P 伪高清]', fake1080)
  assert.strictEqual(fake1080.tier, '1080P-low')
  assert.strictEqual(fake1080.isTrueHD, false)
  assert.strictEqual(fake1080.legit, false)
  console.log('✓ 1080P 真伪画质仲裁通过 (低码率不再被误认为真高清)')

  console.log('\n--- 3. 验证真 4K 原画 vs 4K 压制版仲裁 ---')
  const real4K = quality.judgeStreamQuality({ width: 3840, height: 2160, kbps: 12000 })
  assert.strictEqual(real4K.tier, '4K')
  assert.strictEqual(real4K.isTrueHD, true)

  const fake4K = quality.judgeStreamQuality({ width: 3840, height: 2160, kbps: 1800 })
  assert.strictEqual(fake4K.tier, '4K-low')
  assert.strictEqual(fake4K.isTrueHD, false)
  assert.strictEqual(fake4K.legit, false)
  console.log('✓ 4K 真伪画质仲裁通过')

  console.log('\n--- 4. 验证 720P 高清与标清分级 ---')
  const q720 = quality.judgeStreamQuality({ width: 1280, height: 720, kbps: 1600 })
  assert.strictEqual(q720.tier, '720P')
  assert.strictEqual(q720.legit, true)

  const q480 = quality.judgeStreamQuality({ width: 854, height: 480, kbps: 600 })
  assert.strictEqual(q480.tier, 'SD')
  console.log('✓ 720P / 标清分级验证通过')

  console.log('\n--- 5. 验证片名变体拆解与去噪 ---')
  const variants1 = quality.titleVariants('小小的我2024')
  assert(variants1.includes('小小的我'), '必须剥离尾部年份')
  const variants2 = quality.titleVariants('庆余年第二季')
  assert(variants2.includes('庆余年'), '必须剥离季数')
  console.log('✓ 片名变体规范化通过')

  console.log('\n>>> 全部底层流特征画质仲裁测试全绿通过! <<<')
}

run().catch((e) => {
  console.error('Quality 测试失败:', e)
  process.exit(1)
})

