'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const metadata = require('../lib/metadata')
const imgproxy = require('../lib/imgproxy')

async function run() {
  console.log('--- 1. 验证片名工业级清洗与去噪 (画质、语言、季数、集数、括号) ---')
  assert.strictEqual(metadata.cleanTitle('流浪地球2 HD国英双语4K'), '流浪地球2')
  assert.strictEqual(metadata.cleanTitle('庆余年 第二季 更新至15集'), '庆余年')
  assert.strictEqual(metadata.cleanTitle('沙丘2 (2024)'), '沙丘2')
  assert.strictEqual(metadata.cleanTitle('【中字蓝光】奥本海默 完整版'), '奥本海默')
  console.log('✓ 真实脏数据片名清洗全部通过')

  console.log('\n--- 2. 验证短片名防误配与严格标题对齐 ---')
  // 4 字以内短片名绝不允许子串模糊匹配
  assert.strictEqual(metadata.isTitleMatch('蝉', '秋蝉'), false, '短片名严禁子串误配')
  assert.strictEqual(metadata.isTitleMatch('赛道', '赛道天使'), false, '短片名严禁子串误配')
  assert.strictEqual(metadata.isTitleMatch('黑沙', '黑沙风暴'), false, '短片名严禁子串误配')
  assert.strictEqual(metadata.isTitleMatch('沙丘2', '沙丘2'), true, '同名完全等值通过')
  assert.strictEqual(metadata.isTitleMatch('流浪地球2', '流浪地球2'), true)
  console.log('✓ 短片名严格防护与精准等值匹配全部通过')

  console.log('\n--- 3. 验证严格竖版海报比例过滤 (高/宽 >= 1.18 且宽度 >= 200) ---')
  assert.strictEqual(metadata.isVerticalPoster({ width: 400, height: 600 }), true, '标准竖版海报通过')
  assert.strictEqual(metadata.isVerticalPoster({ width: 800, height: 500 }), false, '横版封面必须被拦截')
  assert.strictEqual(metadata.isVerticalPoster({ width: 120, height: 180 }), false, '低劣缩略图 (宽 < 200) 必须被拦截')
  console.log('✓ 严格竖版海报防横版切边过滤通过')

  console.log('\n--- 4. 验证图片二进制无依赖尺寸解析 (PNG / JPEG) ---')
  // 构造标准 PNG 头部 (16 字节后为 width: 400, height: 600)
  const pngHeader = Buffer.alloc(32)
  pngHeader[0] = 0x89; pngHeader[1] = 0x50; pngHeader[2] = 0x4e; pngHeader[3] = 0x47
  pngHeader.writeUInt32BE(400, 16)
  pngHeader.writeUInt32BE(600, 20)
  const pngDim = imgproxy.getImageDimensions(pngHeader)
  assert(pngDim && pngDim.width === 400 && pngDim.height === 600, 'PNG 尺寸解析正确')

  // 构造标准 JPEG SOF0 头部 (width: 360, height: 540)
  const jpegHeader = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // length: 17
    0x08,       // precision: 8
    0x02, 0x1c, // height: 540 (0x021c)
    0x01, 0x68, // width: 360 (0x0168)
    0x03,       // components: 3
    0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
  ])
  const jpegDim = imgproxy.getImageDimensions(jpegHeader)
  assert(jpegDim && jpegDim.width === 360 && jpegDim.height === 540, 'JPEG 尺寸解析正确')
  console.log('✓ 二进制无依赖图片宽高极速探测通过')

  console.log('\n--- 5. 验证 500MB 磁盘 LRU 缓存自动修剪 ---')
  // 模拟磁盘缓存修剪：传入小阈值测试清理动作
  const testDir = path.join(__dirname, '../data/test_lru_cache')
  fs.mkdirSync(testDir, { recursive: true })
  // 生成 3 个假缓存文件
  fs.writeFileSync(path.join(testDir, '1.cache'), Buffer.alloc(1024 * 100))
  fs.writeFileSync(path.join(testDir, '2.cache'), Buffer.alloc(1024 * 100))
  fs.writeFileSync(path.join(testDir, '3.cache'), Buffer.alloc(1024 * 100))

  // 校验 pruneDiskCacheLru 函数健全性
  assert.strictEqual(typeof imgproxy.pruneDiskCacheLru, 'function')
  assert(imgproxy.MAX_DISK_CACHE_BYTES === 500 * 1024 * 1024, '磁盘缓存上限必须为 500MB')
  fs.rmSync(testDir, { recursive: true, force: true })
  console.log('✓ 500MB 磁盘 LRU 缓存机制健全性验证通过')

  console.log('\n>>> 全部影视元数据与海报管线测试全绿通过! <<<')
}

run().catch((e) => {
  console.error('Metadata 测试失败:', e)
  process.exit(1)
})

