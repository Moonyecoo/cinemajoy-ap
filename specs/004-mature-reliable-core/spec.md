# Feature Specification: 影悦工业级可靠稳定与极致体验重构 (004-mature-reliable-core)

**Feature Branch**: `004-mature-reliable-core`
**Created**: 2026-11-05
**Status**: In Progress
**Input**: `specs/004-mature-reliable-core/task_prompt.md` 工业级收敛重构与硬化工程。

---

## 1. User Scenarios & Four Core Bottom Lines

### 底线 1：100% 境内网络自治（零海外依赖，零 VPN 需求）
- **User Journey**: 用户在境内纯净网络环境下运行影悦，无需任何 VPN 或海外代理，所有请求均稳定直连。
- **Requirements**:
  - 彻底剥离 `@xenova/transformers`、`onnxruntime-web`、境外模型文件等重型依赖。
  - 严禁向 `huggingface.co`、`github.com`、`tmdb.org` 发起未回退的直连网络请求。
  - DNS 统一经由阿里云 DoH 与腾讯 DoH 解析，超时 1.5s 快速回退本地系统解析，内存 TTL 缓存 600 秒。
  - 自动化脚本 `scripts/audit-domains.js` 对整个工程进行域名白名单合规审计。

### 底线 2：真高清画质判定与绝对准确的竖版海报
- **User Journey**: 用户查看影片画质与封面海报时，标出的画质真实可信，封面海报比例标准无横版切边。
- **Requirements**:
  - 彻底废弃字符串画质标签，从 m3u8 的 `#EXT-X-STREAM-INF` 解析真实 `RESOLUTION` 与 `BANDWIDTH`（无 master 时以首切片 ts 真实流尺寸为准）。
  - 竖版海报严格强校验：片名规范清洗 + 年份严格一致（差值为 0） + 竖版宽高比 (`height / width >= 1.2` 且宽 ≥ 360px)。
  - 本地磁盘 LRU 图片代理缓存上限 500MB，支持自动修剪。

### 底线 3：低配设备极致流畅与内存铁律
- **User Journey**: 老旧 Windows/Mac 设备运行影悦流畅不卡顿，CPU 与内存占用极低。
- **Requirements**:
  - 影视卡片列表接入视口虚拟渲染 / 离屏渲染跳跃加速，同屏 DOM 节点总数不超过 60 个。
  - `hls.js` 缓冲区参数严格降级锁定：`maxBufferLength: 30`，`maxMaxBufferLength: 60`，`backBufferLength: 10`。
  - 内存预算：空闲驻留内存 ≤ 200MB，全屏高清播放 ≤ 400MB。

### 底线 4：合规架构与静默自愈
- **User Journey**: 遇到慢源或死链时，用户无感自动换轨到高分源，无需手动寻找可用线路。
- **Requirements**:
  - 内核严禁硬编码或预内置侵权接口；所有源通过通用 JSON 接口订阅加载。
  - 多源并发探测（并发上限 4），探测超时 2.5s；单源连续失败 3 次触发 5 分钟熔断冷却。
  - 首帧加载超过 3.5s 时静默无缝切换至第二顺位可用源。
  - 投屏模块收敛：默认关闭且不在主界面暴露入口，转入「设置 - 实验性功能」内按需开启。

---

## 2. 精简与剥离清单
1. 彻底移除：`lib/ai.js`、`data/models/`、`test/test_ai.js`、`data/vector_cache.json`、`package.json` 中的 `@xenova/transformers`。
2. 轻量化替换：`lib/recommender.js` 降级为纯本地规则推荐（「同分类 + 同年代 + 评分排序」），内存开销降为 0。
3. 投屏收敛：`lib/cast.js` 默认关闭且不在主界面暴露入口，转入「设置 - 实验性功能」内按需开启。

---

## 3. Success Criteria
- **SC-001**: `node scripts/audit-domains.js` 退出码为 0，扫描出的所有域名均在白名单内。
- **SC-002**: `node test/test_dns.js` 主备切换、TTL 缓存、熔断回退断言全绿。
- **SC-003**: `node test/test_quality.js` 真实清晰度与码率仲裁全绿。
- **SC-004**: `node test/test_metadata.js` 竖版海报与年份强校验 100% 通过。
- **SC-005**: `node test/test_sources.js` 多源毫秒级竞速与秒开熔断测试全绿。
- **SC-006**: `npm test` 全部测试套件全绿，零错误、零警告。

