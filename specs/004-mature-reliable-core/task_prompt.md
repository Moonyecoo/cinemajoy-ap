# 影悦 · 独立版：工业级可靠稳定与极致体验重构任务规范书 (Prompt for Coding LLMs)

> **给执行模型的系统级元指令**：
> 你不是在写新功能，你是在做「收敛重构与硬化工程」。严禁扩大功能范围，严禁引入未指定的第三方 npm 依赖，严禁在代码与注释中提及竞品名称。所有变更必须通过静态扫描、单元测试与自动化断言。不确定时立即报错终止，禁止推测。

---

## 一、四大交付底线（违反任何一条即判定交付失败）

1. **底线 1：100% 境内网络自治（零海外依赖，零 VPN 需求）**
   - 彻底移除 `@xenova/transformers`、`onnxruntime-web` 等运行时下载境外模型的重型依赖。
   - 运行环境内严禁向 `huggingface.co`、`github.com`、`tmdb.org` 发起未回退的直连网络请求。
   - DNS 统一经由阿里云 DoH (`https://dns.alidns.com/dns-query`) 与腾讯 DoH (`https://doh.pub/dns-query`)，超时 1.5s 快速回退系统本地解析。

2. **底线 2：真高清画质判定与绝对准确的竖版海报**
   - **视频画质**：严禁采用源站 API 返回的「1080P/4K」文本标签。必须从 m3u8 的 `#EXT-X-STREAM-INF` 解析真实 `RESOLUTION` 和 `BANDWIDTH`；无 master 时以首个分片 ts 的真实流尺寸为准。
   - **海报匹配**：
     - 数据源优先级：豆瓣国内直连（带 Referer） > 源站自带高清海报 > 本地缺省占位图。
     - 强校验规则：清洗片名（去版本与噪点） + 年份严格一致（差值为 0） + 竖版宽高比（`height / width >= 1.2`）。不满足直接显示默认占位，严禁错配。
   - **图片性能**：磁盘 LRU 缓存上限 500MB，列表页仅加载宽 240px 缩略图，详情页加载 720px 高清图。

3. **底线 3：低配设备极致流畅与内存铁律**
   - 首页网格必须采用虚拟滚动（Virtual Scroll），同屏 DOM 节点总数不得超过 60 个。
   - `hls.js` 缓冲区深度严格限制：`maxBufferLength: 30`，`maxMaxBufferLength: 60`，`backBufferLength: 10`。
   - 内存预算：空闲状态驻留内存 ≤ 200MB，全屏高清播放 ≤ 400MB；超限自动触发缓存驱逐。

4. **底线 4：合规架构与静默自愈**
   - 软件内核严禁硬编码或预内置第三方侵权采集接口。所有资源源通过用户自定义「通用 JSON 接口订阅」加载。
   - 多源并发探测（并发上限 4），探测超时设为 2.5s；单源连续失败 3 次触发 5 分钟熔断降级。
   - 首帧加载超过 3.5s 时，静默无感无缝切换至第二顺位可用源。

---

## 二、精简与剥离清单（必须删除的代码）

1. **彻底移除**：`lib/ai.js`、`data/models/`、`test/test_ai.js`、`package.json` 中的 `@xenova/transformers`。
2. **轻量化替换**：`lib/recommender.js` 降级为纯本地规则推荐（「同分类 + 同年代 + 评分排序」），内存开销降为 0。
3. **投屏收敛**：`lib/cast.js` 默认关闭且不在主界面暴露入口，转入「设置 - 实验性功能」内按需开启。

---

## 三、按序实施任务列表（每步可独立运行并验证）

### 任务 1：境内域名白名单审计与境外依赖切除
- **目标文件**：新增 `scripts/audit-domains.js`、`data/domain-whitelist.json`；修改 `package.json`。
- **动作**：
  1. 编写 AST/正则扫描脚本，提取 `src/`、`lib/`、`main.js` 中所有网络请求的 Host。
  2. 卸载 `@xenova/transformers`，删除 `lib/ai.js`、`test/test_ai.js`。
  3. `data/domain-whitelist.json` 仅收录合法境内 API 与 CDN 域名。
- **验收指令**：
  ```bash
  node scripts/audit-domains.js
  ```
  *断言：退出码为 0，扫描出的所有域名均在白名单内。*

### 任务 2：国内高可用 DoH 域名解析与超时熔断
- **目标文件**：`lib/dns.js`、`test/test_dns.js`。
- **动作**：
  1. 主通道 `https://dns.alidns.com/dns-query`，备用通道 `https://doh.pub/dns-query`。
  2. 超时时间 1500ms，失败直接回退 Node.js `dns.lookup`。
  3. 内存 TTL 缓存 600 秒。
- **验收指令**：
  ```bash
  node test/test_dns.js
  ```
  *断言：主备切换正常，TTL 缓存命中有效，异常时不阻塞系统。*

### 任务 3：基于 m3u8 底层流特征的真实清晰度判定
- **目标文件**：`lib/quality.js`、`lib/prober.js`、`test/test_quality.js`。
- **动作**：
  1. 废弃一切基于字符串的画质标签推断（如 `item.type = "1080P"` 直接废弃）。
  2. 实现解析 master playlist 的 `RESOLUTION`（高 ≥ 1080 且带宽 ≥ 2500kbps 判为 1080P；高 ≥ 720 判为 720P）。
  3. 若无 master playlist，取首个 `.ts` 切片前 512KB 解析 SPS 宽高度与码率。
- **验收指令**：
  ```bash
  node test/test_quality.js
  ```
  *断言：标准 1080P、伪 1080P 低码率流、720P 测试用例均被准确归类。*

### 任务 4：片名洗炼、年份强校验与严格竖版海报管线
- **目标文件**：`lib/metadata.js`、`lib/imgproxy.js`、`test/test_metadata.js`。
- **动作**：
  1. 片名规范化：去除 `HD/BD/4K/国语/中字/TC/第X季`，繁简归一。
  2. 豆瓣直连接口查询，要求命中项年份必须等于目标年份（差值 = 0）。
  3. 过滤图片尺寸：`height / width < 1.2` 或宽度 `< 360px` 的一律放弃，回退到清晰占位图。
  4. `lib/imgproxy.js` 实现 500MB 本地磁盘 LRU 缓存。
- **验收指令**：
  ```bash
  node test/test_metadata.js
  ```
  *断言：利用现有数据样本断言，准确率 100%，无错配截断图。*

### 任务 5：多源毫秒级竞速与秒开熔断机制
- **目标文件**：`lib/sources.js`、`lib/router.js`。
- **动作**：
  1. 订阅源解析，启动时对可用线路并发 HEAD/首片探测（并发数 ≤ 4）。
  2. 综合打分公式：`Score = (0.5 * 真实画质) + (0.3 * (1 / 首片TTFB)) + (0.2 * 历史成功率)`。
  3. 播放器接入：首片加载时间超过 3.5s 时无缝换轨至备选源；若连续失败 3 次，该线路进入 5 分钟冷却。
- **验收指令**：
  ```bash
  node test/test_sources.js
  ```
  *断言：坏源/慢源在 3.5s 内自动弃用，高分源优先命中。*

### 任务 6：低配渲染优化与全局自动化测试全绿
- **目标文件**：`src/app.js`、`src/index.html`、`package.json`。
- **动作**：
  1. 影视卡片列表接入视口虚拟渲染，隐藏离屏节点，保持活动 DOM 节点 ≤ 60。
  2. `hls.js` 缓冲区配置降级锁定。
  3. 调整 `package.json` 中的 `test` 脚本，移除已废弃的 AI 测试，接入 `scripts/audit-domains.js` 与新增测试。
- **验收指令**：
  ```bash
  npm test
  ```
  *断言：全部测试项全绿通过，无报错、无警告。*

