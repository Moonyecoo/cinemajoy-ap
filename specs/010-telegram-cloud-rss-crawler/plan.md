# Implementation Plan: Telegram 网盘分享自动爬取、链接真伪自我校验与 24 小时 RSS 高清源引擎 (010-telegram-cloud-rss-crawler)

**Branch**: `010-telegram-cloud-rss-crawler` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

---

## 1. 架构目标与设计原则 (Architecture Principles)

- **免登录自动化与镜像容灾 (Zero-Credential Public Scraping with Mirror Fallback)**：依托公开 Web 预览接口 `https://t.me/s/:channel`，同时支持用户自定义第三方反代或镜像（`options.mirrorBaseUrl`），网络阻断/超时优雅返回 `{ ok: false, error: 'NETWORK_TIMEOUT', items: [] }`，绝不卡死主进程。
- **链接真伪严格自我校验与子目录探测 (Strict Self-Validation & Subfolder Probing)**：
  - Phase 1: `fetchShareToken(pwdId, passcode)` 检查链接可用性（排除 404 / 41006 / 密码错）；
  - Phase 2: `fetchShareFiles(pwdId, stoken)` 检查根目录，若根目录下无直接视频但存在子文件夹（如常见的“剧集季目录”），自动下钻探测第 1 层子文件夹；
  - 只有根目录及子目录均无有效视频文件（纯 `.txt`/`.apk`/空文件夹）时，方可裁决为 `NO_VIDEO` 淘汰，杜绝误杀正规剧集。
- **高画质 RSS 汇聚流 (Aggregated True-HD Feed)**：将校验通过的高清资源统一封装为标准 W3C RSS 2.0 XML，并作为内置高清源平滑接入影悦分类与点播体系。
- **24 小时自动巡检与生命周期治理 (24h Autonomous Lifecycle & Zero-Leak)**：守护进程每日定时巡检增量更新与淘汰失效链接，单请求强制 3000ms 超时熔断，批处理并发量锁定 <= 5，提供显式生命周期方法 `startDailyCrawler` / `stopDailyCrawler` / `destroy`，并在 `main.js` 退出时安全注销。

---

## 2. 模块改造与涉及文件 (Module Impact Analysis)

### 模块 A: Telegram 爬虫与健康自检核心引擎 (`lib/telegram_crawler.js`)
新建 `lib/telegram_crawler.js`：
1. `parseTelegramChannelMessages(htmlContent)`：
   - 解析 Telegram 网页版 HTML 结构中的消息列表，提取 `msgId`、`datetime`、消息文本与图片；
2. `extractShareFromText(text)`：
   - 正则提取影视标题、网盘公开分享 URL（`pan.quark.cn/s/...`）、提取码；
3. `validateShareEntry(entry, options)`：
   - 两段式校验，支持 `options.stubProbe`（测试桩注入）：
     - 阶段 1: 探测 Token 与存活状态；
     - 阶段 2: 探测文件树，支持对 1 级子文件夹深度下钻；
   - 过滤判定：404/失效返回 `{ valid: false, reason: 'INVALID_TOKEN' }`；无视频文件返回 `{ valid: false, reason: 'NO_VIDEO' }`；健康返回 `{ valid: true, files, title, updatedAt }`；
4. `crawlAndValidateChannel(channelName, options)`：
   - 支持 `options.mirrorBaseUrl`，批量拉取并控制并发量（`MAX_CONCURRENCY = 5`）执行自我校验，产出健康片源池；
5. `exportAggregatedRssFeed(entries, feedTitle)`：
   - 生成聚合多部影视剧的 W3C RSS 2.0 XML 字符串（必须包含 `<channel>`, `<item>`, `<enclosure>`, `<lastBuildDate>`）；
6. `startDailyCrawler(intervalMs, taskFn)`、`stopDailyCrawler()`、`hasActiveCrawler()` 与 `destroy()`：
   - 定时巡检生命周期函数，保证退出时无定时器残留。

### 模块 B: 域名合规白名单 (`data/domain-whitelist.json`)
- 追加 `t.me` 与 `telegram.org` 至 `allowedDomains`；
- 执行 `node scripts/audit-domains.js` 保证 100% 通过域名安全审计。

### 模块 C: IPC 通信总线与主进程生命周期 (`main.js` & `preload.js`)
- 在 `main.js` 注册 IPC 处理程序：
  - `telegram:crawl`: 触发爬取与自检；
  - `telegram:getFeed`: 获取当前健康片源列表；
  - `telegram:exportRss`: 导出聚合 RSS 字符串；
  - `telegram:toggleDailyCrawler`: 开启/关闭后台 24h 自动巡检；
- 在 `main.js` 的 `app.on('before-quit', ...)` 钩子中强制执行 `tg.stopDailyCrawler()`，杜绝进程退出后的后台定时器逃逸；
- 在 `preload.js` 暴露对应 API 至 `window.kky.telegram`。

### 模块 D: 设置中心 UI 看板与操作面板 (`src/app.js` & `src/app.css`)
- 在「源管理」面板追加「Telegram 网盘分享 24h 自动巡检与 RSS 高清源」卡片：
  - 配置频道列表与「Telegram 镜像端点 (Mirror Base URL)」；
  - 实时展示健康指标（抓取量 / 有效数 / 淘汰数 / 上次巡检时间）；
  - 提供「立即抓取与全量自检」按钮与「导出聚合 RSS」按钮。

### 模块 E: 自动化质量门禁与断言测试 (`test/test_user_fixes.js`)
- 在 `test/test_user_fixes.js` 扩充验证 38 ~ 验证 42：
  - 验证 38: Telegram HTML 消息 DOM 解析结构与网盘链接/提取码正则抽取；
  - 验证 39: 两段式真伪自我校验（死链淘汰、无视频淘汰及合法剧集正向断言）；
  - 验证 40: 聚合多片源 W3C RSS 2.0 XML 规范结构与全标签断言；
  - 验证 41: 3000ms 超时熔断保护与并发限制 (`MAX_CONCURRENCY === 5`)；
  - 验证 42: 定时器生命周期真实激活与销毁断言。

---

## 3. 测试断言契约 (Test Assertions Specification)

```javascript
// 验证 38: Telegram HTML 消息 DOM 解析与网盘链接提取
const tg = require('../lib/telegram_crawler.js')
const mockHtml = `
  <div class="tgme_widget_message_wrap">
    <div class="tgme_widget_message" data-post="test_ch/101">
      <div class="tgme_widget_message_text">【今日热播】庆余年 第二季 4K 原画 https://pan.quark.cn/s/abcd9988 提取码: 7788</div>
      <time datetime="2026-11-08T12:00:00Z"></time>
    </div>
  </div>
`
const parsedMsgs = tg.parseTelegramChannelMessages(mockHtml)
assert.strictEqual(parsedMsgs.length, 1)
assert.strictEqual(parsedMsgs[0].msgId, '101')
assert.strictEqual(parsedMsgs[0].pwdId, 'abcd9988')
assert.strictEqual(parsedMsgs[0].passcode, '7788')
assert(parsedMsgs[0].title.includes('庆余年'))

// 验证 39: 两段式真伪自我校验 (三路断言：死链过滤、无视频淘汰与有效剧集通过)
// 1) 死链测试
const valRes1 = await tg.validateShareEntry({ pwdId: 'invalid_404_test' }, {
  stubProbe: async () => ({ ok: false, error: 'ERR_41006' })
})
assert.strictEqual(valRes1.valid, false)
assert.strictEqual(valRes1.reason, 'INVALID_TOKEN')

// 2) 无视频广告包测试
const valRes2 = await tg.validateShareEntry({ pwdId: 'test_no_vid' }, {
  stubProbe: async () => ({
    ok: true,
    tokenRes: { ok: true, stoken: 'tok123' },
    filesRes: { ok: true, files: [{ name: '宣传引流.txt', isVideo: false }] }
  })
})
assert.strictEqual(valRes2.valid, false)
assert.strictEqual(valRes2.reason, 'NO_VIDEO')

// 3) 正规高清剧集正向测试 (含视频与子目录穿透)
const valRes3 = await tg.validateShareEntry({ pwdId: 'test_legit_4k' }, {
  stubProbe: async () => ({
    ok: true,
    tokenRes: { ok: true, stoken: 'tok123', title: '庆余年2 4K' },
    filesRes: { ok: true, files: [{ name: '第01集.4K.mp4', isVideo: true, epName: '第01集', size: 1048576 }] }
  })
})
assert.strictEqual(valRes3.valid, true)
assert.strictEqual(valRes3.files.length, 1)

// 验证 40: 聚合 W3C RSS 2.0 规范结构与全标签断言
const xml = tg.exportAggregatedRssFeed([
  { title: '剧目A', link: 'https://pan.quark.cn/s/a1', files: [{ name: '第1集.mp4', epName: '第01集', size: 1024 }] },
  { title: '剧目B', link: 'https://pan.quark.cn/s/b2', files: [{ name: '第1集.mp4', epName: '第01集', size: 2048 }] }
], '影悦 24h 自动化网盘高清片源')
assert(xml.includes('<rss version="2.0">'))
assert(xml.includes('<channel>') && xml.includes('</channel>'))
assert(xml.includes('<item>') && xml.includes('</item>'))
assert(xml.includes('<enclosure') && xml.includes('type="video/mp4"'))
assert(xml.includes('<lastBuildDate>'))
assert(xml.includes('剧目A') && xml.includes('剧目B'))

// 验证 41: 超时熔断参数与并发限制门禁
assert.strictEqual(tg.TIMEOUT_MS, 3000)
assert.strictEqual(tg.MAX_CONCURRENCY, 5)

// 验证 42: 定时器生命周期真实激活与销毁断言
tg.startDailyCrawler(60000, () => {})
assert.strictEqual(tg.hasActiveCrawler(), true)
tg.stopDailyCrawler()
assert.strictEqual(tg.hasActiveCrawler(), false)
```
