# Implementation Tasks: 网盘分享无感解析、W3C 标准 RSS 24小时追更与原画直链流引擎 (009-cloud-share-rss-engine)

## Phase 1: 域名白名单与核心解析模块 (Tasks 1-3)
- [x] **Task 1: 在 `data/domain-whitelist.json` 注册网盘官方域名**
  - 追加 `drive.quark.cn` 与 `pan.quark.cn` 至 `allowedDomains`；
  - 运行 `node scripts/audit-domains.js` 确保域名审计 100% 通过。
- [x] **Task 2: 实现 `lib/cloudshare.js` 分享链接提取与剧集去噪**
  - 实现 `parseShareUrl(rawUrl)`：提取 `pwdId` 与 `passcode`；
  - 实现 `cleanEpisodeTitle(rawFilename)`：过滤广告营销词，规范化提取集数与标题；
  - 定义 `TIMEOUT_MS = 3000`。
- [x] **Task 3: 实现 `lib/cloudshare.js` 官方端点免登录通信**
  - 实现 `fetchShareToken(pwdId, passcode)`：带有 3000ms 超时与 AbortController，异常返回 `{ ok: false, error: ... }`；
  - 实现 `fetchShareFiles(pwdId, stoken, pdir_fid)`：获取文件树并过滤仅保留视频文件。

## Phase 2: 增量差异比对与 RSS 发生器 (Tasks 4-5)
- [x] **Task 4: 实现 `diffShareUpdates` 与定时器生命周期**
  - 基于 `Set` 的 `O(N)` 哈希算法比对新老文件列表，提取增量新增剧集；
  - 导出 `clearWatcher()` / `destroy()`，确保无内存泄漏。
- [x] **Task 5: 实现 `exportToRssFeed` W3C RSS 2.0 XML 发生器**
  - 根据分享剧集元数据生成带有 `<channel>`, `<item>`, `<title>`, `<pubDate>`, `<enclosure>` 的规范 XML。

## Phase 3: 源管理界面网盘订阅卡片 (Tasks 6-7)
- [x] **Task 6: 在 `src/app.css` 定义网盘分享订阅卡片样式**
  - 定义 `.cloud-share-card`、输入字段、订阅列表徽标及追更开关视觉。
- [x] **Task 7: 在 `src/app.js` 实现网盘分享订阅卡片交互**
  - 在 `renderSettings()` 增加「网盘分享订阅与 24 小时自动追更」卡片；
  - 支持一键解析、本地持久化 `kky.cloud_shares`、直达播放与一键刷新。

## Phase 4: 质量门禁与 5 大断言测试 (Task 8)
- [x] **Task 8: 在 `test/test_user_fixes.js` 扩充验证 33 ~ 验证 37 并通过 `npm test`**
  - 验证 33: 分享 URL 规范化解析；
  - 验证 34: 文件名去噪与剧集标准化；
  - 验证 35: 增量差异 O(N) Set 检测；
  - 验证 36: W3C RSS 2.0 格式规范；
  - 验证 37: 3000ms 超时熔断与自愈对象；
  - 执行 `npm test` 确保 37 项测试全绿通过。

## Phase 5: 本地打包交付与 Git 提交 (Task 9)
- [x] **Task 9: 构建最新应用与 Git 提交**
  - 运行 `npm run pack` 编译最新应用并同步至 `/Applications/影悦.app`；
  - 提交 Git 变更并推送至远端 `main` 分支。
