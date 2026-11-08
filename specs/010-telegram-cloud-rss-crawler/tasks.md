# Implementation Tasks: Telegram 网盘分享自动爬取、链接真伪自我校验与 24 小时 RSS 高清源引擎 (010-telegram-cloud-rss-crawler)

## Phase 1: 域名白名单与核心爬取模块 (Tasks 1-3)
- [x] **Task 1: 在 `data/domain-whitelist.json` 注册合规域名**
  - 追加 `t.me` 与 `telegram.org` 至 `allowedDomains`；
  - 运行 `node scripts/audit-domains.js` 确保域名审计 100% 通过。
- [x] **Task 2: 实现 `lib/telegram_crawler.js` 消息解析与链接抽取**
  - 实现 `parseTelegramChannelMessages(htmlContent)` 提取消息列表；
  - 实现 `extractShareFromText(text)` 正则抽取 `pwdId`、`passcode` 与剧名；
  - 定义 `TIMEOUT_MS = 3000` 与 `MAX_CONCURRENCY = 5`。
- [x] **Task 3: 实现 `lib/telegram_crawler.js` 两段式真伪自我校验**
  - 实现 `validateShareEntry(entry, options)`：
    - Phase 1: 校验 Token 与链接存活；
    - Phase 2: 校验文件树，支持对 1 级子文件夹穿透探测；
    - 过滤死链 (`INVALID_TOKEN`) 与无视频引流包 (`NO_VIDEO`)，健康返回 `valid: true`；
    - 支持 `options.stubProbe` 供自动化测试解耦注入。

## Phase 2: 并发调度、聚合 RSS 发生器与巡检守护 (Tasks 4-5)
- [x] **Task 4: 实现 `crawlAndValidateChannel` 批处理与并发控制**
  - 支持 `options.mirrorBaseUrl`（默认 `https://t.me/s/`，可配置镜像）；
  - 控制并发量 <= 5，网络超时/阻断返回 `{ ok: false, error: 'NETWORK_TIMEOUT', items: [] }`。
- [x] **Task 5: 实现 `exportAggregatedRssFeed` 与生命周期管理**
  - 实现 `exportAggregatedRssFeed(entries, feedTitle)` 输出合规 W3C RSS 2.0 XML；
  - 实现 `startDailyCrawler`、`stopDailyCrawler`、`hasActiveCrawler` 与 `destroy`。

## Phase 3: IPC 通信总线与设置面板 UI 看板 (Tasks 6-7)
- [x] **Task 6: 在 `main.js` 与 `preload.js` 注册 IPC 与生命周期销毁**
  - 注册 `telegram:crawl`、`telegram:getFeed`、`telegram:exportRss`、`telegram:toggleDailyCrawler`；
  - 在 `app.on('before-quit')` 钩子中强制调用 `tg.stopDailyCrawler()`；
  - 在 `preload.js` 暴露对应 API。
- [x] **Task 7: 在 `src/app.css` 与 `src/app.js` 实现看板交互**
  - 在「源管理」面板追加「Telegram 网盘分享 24h 自动巡检与 RSS 高清源」卡片；
  - 支持配置频道与镜像端点 (Mirror Base URL)；
  - 实时展示健康指标（抓取量 / 有效数 / 淘汰数 / 上次巡检时间）；
  - 提供「立即抓取与全量自检」按钮与「导出聚合 RSS」按钮。

## Phase 4: 质量门禁与 5 大断言测试 (Task 8)
- [x] **Task 8: 在 `test/test_user_fixes.js` 扩充验证 38 ~ 验证 42 并通过 `npm test`**
  - 验证 38: Telegram HTML 消息 DOM 解析与网盘链接抽取；
  - 验证 39: 两段式真伪自我校验（死链过滤、无视频淘汰及合法剧集通过）；
  - 验证 40: 聚合多片源 W3C RSS 2.0 XML 规范结构与全标签断言；
  - 验证 41: 3000ms 超时熔断保护与并发限制 (`MAX_CONCURRENCY === 5`)；
  - 验证 42: 定时器生命周期真实激活与销毁断言；
  - 执行 `npm test` 确保 42 项测试全绿通过。

## Phase 5: 本地打包交付与 Git 提交 (Task 9)
- [x] **Task 9: 构建最新应用与 Git 提交**
  - 运行 `npm run pack` 编译最新应用并同步至 `/Applications/影悦.app`；
  - 提交 Git 变更并推送至远端 `main` 分支。
