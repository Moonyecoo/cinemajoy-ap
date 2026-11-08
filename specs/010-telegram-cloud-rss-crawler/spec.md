# Feature Specification: Telegram 网盘分享自动爬取、链接真伪自我校验与 24 小时 RSS 高清源引擎 (010-telegram-cloud-rss-crawler)

**Feature Branch**: `010-telegram-cloud-rss-crawler`  
**Created**: 2026-11-08  
**Status**: Draft for EGM Goldfish Review  
**Input**: 用户指令：“我要的是能自动爬取网盘链接并汇成 rss，然后作为高清源。必须能自我验证链接有效性，从 telegram 上抓取最新分享，每日自动更新”  
**品牌规范**: 仅使用「影悦 · 独立版」(CinemaJoy)，杜绝商业竞品名词。

---

## 1. 背景与技术破局点 (Problem & Breakthrough Architecture)

在高清片源破局方案中，单纯依赖用户手动复制粘贴网盘链接依然存在门槛与时效性滞后。互联网上最活跃、最高清的网盘原画（4K / Remux / 杜比视界 / 高码无损）分享主要集散在 Telegram 公开分享频道与聚合社群中。然而，直接抓取 Telegram 存在两大痛点：
1. **死链与失效泛滥**：公开分享链接容易在数天或数小时内失效、被举报取消、或包含仅有文本/无视频的虚假广告链接；
2. **网络可达性与格式异构**：Telegram 消息排版混乱，夹杂引流广告，且国内直连环境下需要依赖免翻墙公开端点或镜像（如 `https://t.me/s/{channel}` 公开网页预览或镜像 RSS 管道）。

为此，「影悦 · 独立版」构建 **Telegram 网盘全自动抓取、多层真伪自我验证与 24 小时 RSS 高清源引擎**：
1. **Telegram 公开频道免登录抓取器（`lib/telegram_crawler.js`）**：
   - 利用公开 Web 预览接口（`https://t.me/s/{channel}`）或用户自定义代理/镜像地址，无需 Telegram 账号、无需 Bot Token、无需安装额外软件；
   - 提取最新消息中的影视标题、海报/配图、发布时间戳与网盘公开分享链接（`pan.quark.cn/s/...` 及提取码）。
2. **链接真伪与健康度自我校验管道（Self-Validation Pipeline）**：
   - 爬取到的链接严禁直接入库，必须立即进入异步探针队列；
   - 调用 `cloudshare.fetchShareToken` 验证分享存活状态（排除 404、已取消、提取码错误）；
   - 调用 `cloudshare.fetchShareFiles` 深度检验内部文件树，严格确认包含 `.mp4`, `.mkv` 等真实视频文件且非空；
   - 自动丢弃所有死链、空包与虚假引流链接，有效率达 100%。
3. **W3C RSS 2.0 聚合流与应用内原画源直连（Aggregated HD Feed & Source Provider）**：
   - 将所有健康校验通过的网盘影视动态汇聚为标准的 RSS 2.0 XML 订阅源；
   - 在应用内部直接注册为「网盘原画专区 / 24h 自动追更」源，用户可直接在首页或分类中浏览、搜索并点播播放；
   - 提供标准 RSS URL / XML 复制导出功能。
4. **24 小时每日定时自动化更新（24h Scheduled Refresh）**：
   - 后台静默守护进程支持每日定时（24h）增量抓取最新消息并淘汰过期失效链接；
   - 具备 3000ms 单请求超时熔断保护，防风控防雪崩，定时器提供显式生命周期销毁机制。

---

## 2. User Scenarios & Acceptance Criteria (验收场景与准则)

### User Story 1 - Telegram 公开频道消息免登录自动爬取 (Priority: P1)
系统能够从配置的 Telegram 公开频道中批量提取最新的影视网盘分享信息。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 预设或自定义的 Telegram 公开频道标识（如 `alyp_4K_remux` 或完整地址 `https://t.me/s/channel`），**When** 爬虫任务触发，**Then** 系统能在 3000ms 超时控制内获取网页消息流，并提取消息文本、时间戳与消息 ID。
  2. **Given** 消息文本中夹杂自然语言介绍、剧名、网盘链接（`pan.quark.cn/s/...`）及提取码，**When** 抽取器运行，**Then** 正则精准解析出 `pwdId`、`passcode` 与清洗后的影视剧名，剔除广告话术。
  3. **Given** 目标频道不可达或网络中断，**When** 抓取失败，**Then** 优雅捕获异常并返回统一自愈对象 `{ ok: false, error: ... }`，不导致主进程崩溃。

---

### User Story 2 - 网盘分享链接真伪与有效性自我验证 (Priority: P1)
对爬取到的所有候选网盘链接，系统在入库前自动发起端侧探针，杜绝任何死链或虚假广告进入片源列表。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 批量提取到的候选分享链接列表，**When** 校验管道启动，**Then** 异步并发逐个调用网盘官方端点探测 `stoken` 与文件列表。
  2. **Given** 某链接已被作者取消分享或分享不存在（HTTP 404 / 41006），**When** 校验程序收到错误响应，**Then** 标记为 `INVALID` 并自动过滤淘汰，绝不呈现在用户界面中。
  3. **Given** 某分享链接根目录下无直接视频文件但包含剧集子文件夹（如 `[文件夹] 庆余年 第二季 4K`），**When** 校验程序扫描，**Then** 自动下钻探测第 1 层子文件夹；若子文件夹内含有视频切片，则判定为有效剧集。唯有在根目录与子文件夹内均无视频文件（纯 `.txt`/`.apk`/空文件夹）时，方可裁决为 `NO_VIDEO` 并丢弃。

---

### User Story 3 - 聚合汇聚为 W3C RSS 2.0 规范源并作为内置高清片源 (Priority: P1)
将所有经过真伪验证的高清片源聚合成单一高可用 RSS 2.0 订阅源，并作为影悦独立版的高清片源呈现。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 一批已校验有效的网盘影视条目，**When** 调用 `buildAggregatedRssFeed()`，**Then** 输出完全合规的 W3C RSS 2.0 XML 字符串，包含 `<title>`, `<link>`, `<description>`, `<lastBuildDate>` 及每个影视剧集的 `<item>` 与 `<enclosure>` 媒体标记。
  2. **Given** 汇聚的高清片源库，**When** 用户在影悦主页或分类页面中切换到「网盘高清」源，**Then** 能直接加载出该 RSS 汇聚的影视卡片列表，点击可展开选集并即时播放。

---

### User Story 4 - 24 小时每日自动巡检与生命周期治理 (Priority: P1)
系统支持每日后台自动巡检，确保片源库 24 小时持续保持最新状态，同时释放无效资源。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 每日巡检定时器启用，**When** 到达 24 小时周期（或用户手动点击立即更新），**Then** 自动拉取频道最新条目并对历史缓存链接进行再校验，淘汰失效死链。
  2. **Given** 巡检过程，**When** 发送网络探测，**Then** 全程仅消耗几 KB 纯文本元数据，**下行视频流量消耗严格为 0**。
  3. **Given** 页面卸载或应用退出，**When** 销毁方法触发，**Then** 显式清除后台巡检定时器，无定时器逃逸或内存泄露。

---

### User Story 5 - 设置中心可视化爬虫与健康看板交互 (Priority: P2)
在「源管理」面板提供直观的爬虫配置面板与健康状态看板。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 用户打开「源管理」面板，**When** 浏览到「Telegram 网盘自动抓取与 24h 校验」卡片，**Then** 展示频道输入框、Telegram 镜像端点输入框 (Mirror Base URL，支持默认及自定义反代)、上次抓取时间、以及「已抓取 / 有效入库 / 失效淘汰」三项统计数据徽标。
  2. **Given** 用户点击「立即全量抓取与健康检测」，**When** 任务执行中，**Then** 按钮展示加载状态，遇到网络不可达或超时时安全返回 `{ ok: false, error: 'NETWORK_TIMEOUT', items: [] }` 并弹出友好提示，绝不卡死主进程；成功时汇报最新有效片源数量。
  3. **Given** 用户点击「复制全量 RSS 订阅」，**When** 执行复制，**Then** 将完整的 W3C RSS 2.0 XML 订阅地址/内容写入系统剪贴板。

---

## 3. 非功能性需求与架构约束 (Non-Functional Requirements)
- **网络合规与域名白名单**：新增合规端点（如 `t.me`, `telegram.org`）需注册进 `data/domain-whitelist.json`，且执行 `node scripts/audit-domains.js` 100% 审计通过。
- **性能与超时熔断**：单条网络探测严格遵循 `3000ms` 超时控制，禁止任何长时间挂起的请求。
- **并发控制**：批量自我验证需使用限制并发（Concurrency <= 5）的队列或 Promise 批处理，避免触发网盘端频控。
- **纯净原创与零商业竞品**：所有展示与说明均标注「影悦 · 独立版」(CinemaJoy)。

