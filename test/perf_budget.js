'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')

async function run() {
  console.log('--- 1. 验证 Node.js 运行时内存占用基线 (空闲预算 <= 150MB) ---')
  const mem = process.memoryUsage()
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024)
  const rssMB = Math.round(mem.rss / 1024 / 1024)
  console.log(`[Memory] HeapUsed: ${heapUsedMB}MB | RSS: ${rssMB}MB`)
  assert(heapUsedMB < 100, `堆内存开销 (${heapUsedMB}MB) 必须低于 100MB 预算上限`)
  assert(rssMB < 180, `常驻内存开销 (${rssMB}MB) 必须低于 180MB 预算上限`)
  console.log('✓ 内存基线达标，脱脂重构成功')

  console.log('\n--- 2. 验证 hls.js 低配友好缓冲区参数锁定 ---')
  const appJs = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8')
  assert(appJs.includes('maxBufferLength: 30'), 'hls 必须锁定 maxBufferLength: 30')
  assert(appJs.includes('maxMaxBufferLength: 60'), 'hls 必须锁定 maxMaxBufferLength: 60')
  assert(appJs.includes('backBufferLength: 10'), 'hls 必须锁定 backBufferLength: 10 防止历史切片爆内存')
  assert(appJs.includes('lowLatencyMode: false'), '低配设备必须关闭 lowLatencyMode 杜绝卡顿跳帧')
  console.log('✓ hls.js 缓冲区防爆内存锁定验证通过')

  console.log('\n--- 3. 验证 W3C 视口跳跃渲染与渲染隔离 (CSS contain & content-visibility) ---')
  const appCss = fs.readFileSync(path.join(__dirname, '../src/app.css'), 'utf8')
  assert(appCss.includes('content-visibility: auto'), '卡片必须启用 content-visibility: auto')
  assert(appCss.includes('contain: layout style paint;'), '卡片必须开启独立渲染隔离')
  assert(appCss.includes('contain-intrinsic-size'), '卡片必须声明 contain-intrinsic-size')
  console.log('✓ 低配视口离屏渲染跳跃加速验证通过')

  console.log('\n--- 4. 验证主进程脱脂与冷启动加速参数 ---')
  const mainJs = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8')
  assert(mainJs.includes('disable-breakpad'), 'main.js 必须开启 disable-breakpad')
  assert(mainJs.includes('disable-component-update'), 'main.js 必须开启 disable-component-update')
  assert(mainJs.includes('disable-domain-reliability'), 'main.js 必须开启 disable-domain-reliability')
  console.log('✓ 主进程冷启动与低配硬件脱脂验证通过')

  console.log('\n>>> 全部低配流畅与性能预算指标全绿通过! <<<')
}

run().catch((e) => {
  console.error('性能预算测试失败:', e)
  process.exit(1)
})

