# Implementation Plan: 通用流媒体盒子聚合痛点根治与体验重塑 (007-user-painpoints-remedy)

**Branch**: `007-user-painpoints-remedy` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

---

## 1. 架构目标与设计原则 (Architecture Principles)
- **零配置开箱即用 (Zero-Config Reliability)**：彻底消灭“找接口导入”的技术门槛，依赖安全 DoH + 动态自愈源池实现免翻墙原生可用，断网时自动冻结探针避免全源死锁。
- **真实硬指标防欺诈 (Truth in Stream Quality)**：通过底层 prober 提取真实带宽与分辨率，用算法杜绝“低码伪 4K/伪 1080P”，保护用户视力。
- **播放智能看门狗无感接力 (Seamless Auto-Failover Watchdog)**：播放器内置状态看门狗，卡顿停滞超 3.5s 毫秒级静默切源并无缝续播，配备 60s 防抖、单集上限 2 次与 HLS 实例安全销毁机制。
- **实体聚类与选集归一化 (Entity Dedup & Ep Ordering)**：多源搜索按权威元数据对齐合并，杜绝 20 个同名条目轰炸；选集严格标准化升序。
- **桌面原生视听流与域名白名单 (Desktop-Native Visuals & Domain Isolation)**：严格锁定 16:9 与 2:3 黄金比例；海报仅走 Clean IP/DoH 闭环，100% 遵守 `audit-domains.js`；支持全量快捷键。

---

## 2. 模块改造与涉及文件 (Module Impact Analysis)

### 模块 A: 源健康度探针与自愈池 (`lib/sources.js`)
- 维护内存与本地持久化的源健康度评分表 `sourceHealthRecords`；
- 提供 `checkSourceHealth()`，包含延迟 (TTFB)、成功率、连续失败计数器；
- 宿主离线保护：捕获 `navigator.onLine === false` 或 DNS 探测全阻断时，冻结探针与熔断扣分，防止网络恢复后全源进入 5 分钟死锁；
- 失败 3 次自动熔断 5 分钟，主源熔断时毫秒级透明降级至最高分备用源；
- 开放 `api.probeAllSourcesHealth()` 供设置页与自动任务调用。

### 模块 B: 底层流特征画质仲裁 (`lib/prober.js`)
- 严格解析 `EXT-X-STREAM-INF` 中的 `BANDWIDTH` 与 `RESOLUTION`；
- 硬指标规则：
  - `4K 原画`：width >= 3840 且 kbps >= 15000；
  - `1080P 蓝光原画`：width >= 1920 且 height >= 1080 且 kbps >= 2500；
  - `1080P 压缩低码`：width >= 1920 但 kbps < 1200（明确标注 `tier: '1080P-low', isTrueHD: false, legit: false`）；
  - `720P / 标清`：依次向下分级。

### 模块 C: 播放器看门狗与无感自动切源 (`src/app.js` & `src/app.css`)
- 播放器启动时挂载 `watchdog`:
  - 监听 `waiting`、`stalled` 事件与 HLS `ERROR`；
  - 计时器持续检测卡顿时长；若卡顿停滞 >= 3.5 秒且无法恢复：
    - 检查防抖门禁：距离上次切源时间需 >= 60 秒，当前集累计切源次数 <= 2 次；
    - 并发探测其他备用源同一集数的直链（TTFB < 500ms 优先，无此集数则自动顺延探测下一个源）；
    - 记录当前播放秒数 `curTime = video.currentTime`；
    - 安全销毁旧 HLS 实例：调用 `hls.destroy()`，释放媒体解码缓冲区；
    - 初始化新 HLS 实例，严格继承缓冲区锁定参数：
      ```javascript
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 10,
      lowLatencyMode: false
      ```
    - 新流加载就绪后自动 seek 回 `curTime`，屏幕顶部呈现轻量 Toast 胶囊：`✦ 智能接力：已无感切至线路 2 (延迟 98ms)`。
- 页面销毁与路由跳转（如退出播放器时）：强制 `clearInterval` 注销看门狗定时器与全局事件监听，杜绝内存泄漏。
- 线路切换抽屉：增加各线路当前延迟与画质等级（如 `🟢 110ms · 1080P原画`）。

### 模块 D: 搜索聚合去重与正倒序校准 (`lib/metadata.js` & `src/app.js`)
- 搜索结果聚类函数 `clusterSearchResults(rawItems)`：
  - 提取规范化片名（过滤季数、画质等杂质）；
  - 聚类同名条目，只保留 1 个主条目，内部挂载 `sources: [...]`；
- 选集校准函数 `normalizeEpisodeList(episodes)`：
  - 识别集号序列（例如逆序 40..1），自动转换为标准 1..40 升序；
  - 提供正序/倒序一键切换开关。

### 模块 E: 桌面视听规范与海报自愈 (`src/app.css` & `src/app.js`)
- 样式层面强化所有卡片与海报容器：
  - `.movie-card`, `.stream-feed-card`, `.poster-img` 统一锁定 `aspect-ratio` 与 `object-fit: cover`；
- 海报加载事件监听：若图片加载失败，自动替换为 TMDB 国内镜像（经由白名单内 Clean IP 直通）或本地优雅占位海报，严禁引入未审计白名单外的第三方外部域名。

---

## 3. 测试断言契约与验证定义 (Test Assertions Specification)

在 `test/test_user_fixes.js` 扩展 5 组确定性断言（验证 23 ~ 验证 27）：
1. **验证 23: 零配置开箱即用与全局离线探针冻结保护**：
   - 验证无任何本地自定义源配置时，`findPlayableSource` 正常返回最高分官方源；
   - 模拟 `isOnline = false`，连续探测失败不递增熔断计数，不进入 5 分钟冷却死锁。
2. **验证 24: 真伪 1080P/4K 画质硬指标仲裁与低码率打标**：
   - 断言低码流（750kbps, 1080p）：`tier === '1080P-low' && isTrueHD === false`；
   - 断言原画流（3800kbps, 1080p）：`tier === '1080P-high' && isTrueHD === true`。
3. **验证 25: 播放卡顿看门狗状态机、60s 冷静防抖与集数缺失跳过**：
   - 模拟卡顿 3.6 秒，看门狗触发 `onFailover` 并记录切源时间戳；
   - 60 秒内再次触发卡顿，被防抖拦截；
   - 模拟备选源 1 缺失当前第 20 集，自动跳至包含第 20 集的备选源 2。
4. **验证 26: 搜索结果同名强聚类去重与逆序选集自动升序校准**：
   - 输入 10 个混杂同名数据，聚类输出恰好 1 个聚合主条目；
   - 输入倒序集数 `['第40集', '第39集', ..., '第1集']`，`normalizeEpisodeList` 输出标准 1..40 升序。
5. **验证 27: 16:9 / 2:3 黄金视听比例锁定与海报白名单安全穿透**：
   - 断言海报回退逻辑只请求 `data/domain-whitelist.json` 覆盖的合法 Host；
   - 断言快捷键映射表完整包含空格、方向键、F、M、[ / ]。
