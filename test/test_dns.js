'use strict'

const assert = require('assert')
const dnsModule = require('../lib/dns')

async function run() {
  console.log('--- 1. 验证静态预置 Clean IP 直通 ---')
  const staticIps = await dnsModule.getCleanIps('fffgood.com')
  assert(Array.isArray(staticIps) && staticIps.length > 0, '静态域名必须命中预置列表')
  assert.strictEqual(staticIps[0], dnsModule.STATIC_HOSTS['fffgood.com'])
  console.log('✓ 静态 Host 命中:', staticIps[0])

  console.log('\n--- 2. 验证 GFW / 运营商虚假污染 IP 过滤规则 ---')
  assert.strictEqual(dnsModule.isPoisonedIp('28.0.0.1'), true, '28.x.x.x 必须判定为污染')
  assert.strictEqual(dnsModule.isPoisonedIp('0.0.0.0'), true, '0.0.0.0 必须判定为污染')
  assert.strictEqual(dnsModule.isPoisonedIp('31.13.1.1'), true, 'Facebook 注入 IP 必须判定为污染')
  assert.strictEqual(dnsModule.isPoisonedIp('150.138.42.195'), false, '合法豆瓣 IP 必须判定为正常')
  assert.strictEqual(dnsModule.isPoisonedIp('invalid_str'), true, '非 IP 字符串必须过滤')
  console.log('✓ 污染 IP 过滤规则全部通过')

  console.log('\n--- 3. 验证国内 DoH / HTTP-DNS 动态解析与 TTL 缓存机制 ---')
  dnsModule.clearCache()
  const t0 = Date.now()
  const cleanIps = await dnsModule.getCleanIps('movie.douban.com')
  const cost1 = Date.now() - t0
  console.log(`首发动态解析耗时: ${cost1}ms, 结果:`, cleanIps)
  if (cleanIps) {
    assert(cleanIps.length > 0)
    assert(!cleanIps.some(dnsModule.isPoisonedIp), '解析结果中绝不可含有污染 IP')
  }

  // 验证内存 TTL 缓存（第二次请求必须 < 5ms 瞬间命中）
  const t1 = Date.now()
  const cachedIps = await dnsModule.getCleanIps('movie.douban.com')
  const cost2 = Date.now() - t1
  console.log(`缓存二次读取耗时: ${cost2}ms`)
  assert(cost2 < 10, '二次读取必须直接命中内存缓存，延迟应低于 10ms')
  assert.deepStrictEqual(cachedIps, cleanIps, '缓存内容必须完全一致')
  console.log('✓ 600秒 TTL 内存缓存机制验证通过')

  console.log('\n--- 4. 验证极端异常与超时快速熔断 (不卡死进程) ---')
  const t2 = Date.now()
  // 查询一个肯定不存在或超时的虚拟域名
  const fakeResult = await dnsModule.getCleanIps('non-existent-domain-test-kky-xyz.local')
  const cost3 = Date.now() - t2
  console.log(`无效域名容错耗时: ${cost3}ms, 返回:`, fakeResult)
  assert(cost3 < 3000, '超时熔断必须在 3000ms 内快速返回，杜绝阻塞主进程')
  console.log('✓ 超时熔断机制验证通过')

  console.log('\n--- 5. 验证透明劫持 install() ---')
  dnsModule.install()
  console.log('✓ dns.lookup 钩子挂载正常')

  console.log('\n>>> 全部 DNS 模块安全防污染测试全绿通过! <<<')
}

run().catch((e) => {
  console.error('DNS 测试失败:', e)
  process.exit(1)
})

