# Implementation Plan: 网盘分享无感解析、W3C 标准 RSS 24小时追更与原画直链流引擎 (009-cloud-share-rss-engine)

**Branch**: `009-cloud-share-rss-engine` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

---

## 1. 架构目标与设计原则 (Architecture Principles)

- **真实高清破局 (True HD from Cloud Shares)**：跳出公共采集站不可逆压缩低码的泥潭，从互联网真实高质量资源载体（网盘公开分享）直接获取高清原画。
- **免登录 0 门槛 (Frictionless Public Share Parsing)**：针对公开分享利用标准 API 探测，无需强制用户输入账号密码，做到开箱即用。
- **零下载虚拟流化 (Zero-Storage Virtual Streaming)**：只做元数据与直链解析，24 小时后台增量巡检只消耗几 KB 纯文本，视频流量开销严格为 0。
- **网络合规与网络自治 (Network Autonomy & White-listing)**：域名严格纳入 `data/domain-whitelist.json` 白名单审计，带有 3000ms 超时与断网自愈保护。

---

## 2. 模块改造与涉及文件 (Module Impact Analysis)

### 模块 A: 网盘公开分享解析与差异比对引擎 (`lib/cloudshare.js`)
新建 `lib/cloudshare.js`，实现高内聚纯净核心模块：
1. `parseShareUrl(rawUrl)`：
   - 兼容提取全量 URL（如 `https://pan.quark.cn/s/abcd1234efgh`）、短码（`abcd1234efgh`）及提取码（`提取码: 1234` 或 `pwd=1234`）；
2. `cleanEpisodeTitle(rawFilename)`：
   - 正则剔除：公众号广告、压制组标记、4K/HDR/1080P、音频规格等杂质；
   - 提取规范集数（如 `第01集`、`第02集`、`正片`）；
3. `fetchShareToken(pwd_id, passcode)` 与 `fetchShareFiles(pwd_id, stoken, pdir_fid)`：
   - 封装带 3000ms 超时熔断保护（AbortController）的 HTTP 通信管道，网络异常或无效分享时返回统一自愈对象 `{ ok: false, error: ... }`，不抛未捕获异常；
4. `diffShareUpdates(cachedFiles, latestFiles)`：
   - 基于 `Set` 的 `O(N)` 高性能哈希比对算法，杜绝大目录双层循环遍历卡死主线程；
5. `exportToRssFeed({ title, link, files, updatedAt })`：
   - 输出符合 W3C 标准的 RSS 2.0 XML 字符串；
6. `clearWatcher()` / `destroy()`：
   - 显式导出定时巡检定时器销毁方法，彻底杜绝定时器逃逸与内存泄漏。

### 模块 B: 域名合规白名单扩充 (`data/domain-whitelist.json`)
- 将官方合法端点 `drive.quark.cn` 与 `pan.quark.cn` 注册进 `allowedDomains`；
- 执行 `node scripts/audit-domains.js` 确保 100% 通过域名安全审计。

### 模块 C: 设置中心网盘分享订阅卡片 (`src/app.js` & `src/app.css`)
- 在「源管理」面板追加「网盘分享订阅与 24 小时自动追更」卡片；
- 支持输入分享链接并一键解析选集；
- 存储订阅至 `kky.cloud_shares` 本地存储，支持一键直达播放与一键刷新。

### 模块 D: 自动化测试与指标验证 (`test/test_user_fixes.js`)
- 在 `test/test_user_fixes.js` 扩充验证 33 ~ 验证 37：
  - 验证 33: `lib/cloudshare.js` 分享 URL 规范化提取；
  - 验证 34: 视频文件名工业级去噪与剧集归一化；
  - 验证 35: 24 小时增量差异比对与 0 视频下载开销门禁；
  - 验证 36: W3C RSS 2.0 XML 结构合法性校验；
  - 验证 37: 3000ms 超时熔断与离线探针保护。

---

## 3. 测试断言契约 (Test Assertions Specification)

```javascript
// 验证 33: 分享 URL 规范化
const cs = require('../lib/cloudshare.js')
assert.strictEqual(cs.parseShareUrl('https://pan.quark.cn/s/8a8b8c8d').pwdId, '8a8b8c8d')

// 验证 34: 剧集去噪清洗
assert.strictEqual(cs.cleanEpisodeTitle('【关注公众号看全集】庆余年2.2024.4K.S02E05.mp4').epName, '第05集')

// 验证 35: 增量差异检测 (O(N) Set 哈希比对与独立断言)
const diff = cs.diffShareUpdates([{ fid: '1', name: 'ep1.mp4' }], [{ fid: '1', name: 'ep1.mp4' }, { fid: '2', name: 'ep2.mp4' }])
assert.strictEqual(diff.length, 1)
assert.strictEqual(diff[0].fid, '2')

// 验证 36: W3C RSS 2.0 格式与时间戳
const xml = cs.exportToRssFeed({ title: '测试剧', files: [{ fid: '1', name: '第1集' }] })
assert(xml.includes('<rss version="2.0">') && xml.includes('<channel>') && xml.includes('<item>'))

// 验证 37: 3000ms 超时熔断参数与优雅自愈对象
assert.strictEqual(cs.TIMEOUT_MS, 3000)
assert(typeof cs.clearWatcher === 'function' || typeof cs.destroy === 'function')
const failRes = await cs.fetchShareToken('invalid_pwd_not_exist_9999')
assert.strictEqual(failRes.ok, false)
assert(failRes.error)
```

