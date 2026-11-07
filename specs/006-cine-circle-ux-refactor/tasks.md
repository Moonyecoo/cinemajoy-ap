# Implementation Tasks: 影视圈情感影单生态、纯净设计系统收敛与个人中心 (006-cine-circle-ux-refactor)

## Phase 1: 核心引擎与安全管线 (Tasks 1-2)
- [x] **Task 1**: 创建 `lib/circles.js` 影视圈核心引擎：
  - 预设 6 大官方心情主题圈子（深夜治愈、雨天悬疑、华语怀旧、赛博朋克、催泪经典、热血燃向）；
  - 实现自建圈子 CRUD 与单圈 ≤ 100 部影片硬上限；
  - 集成于主进程或渲染层数据流中。
- [x] **Task 2**: 在 `lib/circles.js` 实现 5 步安全便携分享编解码管线：
  - 密令 ≤ 16KB 长度预检与 `CJ_CIRCLE_V1:` 引导符严格匹配；
  - `try...catch` 安全 Base64 解码与防原型污染校验；
  - 不可信文本字段全量 HTML 转义清洗。

## Phase 2: Design Tokens、弹窗标准化与 UI 减法清理 (Tasks 3-4)
- [x] **Task 3**: 在 `src/app.css` 定义统合的 Design Tokens、`.cinemajoy-modal` 模态框与 `content-visibility: auto` 低配保护样式。
- [x] **Task 4**: 导航栏重构与设置页技术黑话清洗：
  - 侧边栏「热播榜」升级替换为「影视圈」，底部追加「个人中心」导航入口；
  - 审计并移除设置页冗余的调试项与过载网络描述。

## Phase 3: 影视圈广场、圈子主页与自建分享界面 (Tasks 5-6)
- [x] **Task 5**: 实现影视圈主页 `renderCineCircles()`：
  - 心境主题筛选标签（全部 / 治愈心情 / 独处时光 / 怀旧岁月 / 高分必看）；
  - 圈子卡片流（首屏 20 部平滑加载）、新建圈子弹窗与导入密令弹窗。
- [x] **Task 6**: 实现圈子详情页 `renderCircleDetail(circleId)`：
  - 沉浸式情绪 Banner、圈内影片网格、点击直达播放、自建圈子管理与一键生成分享密令；
  - 影视详情与播放器增加「加入圈子」交互。

## Phase 4: 纯本地去中心化个人中心 (Tasks 7-8)
- [x] **Task 7**: 实现个人中心 `renderProfile()`：
  - 艺术名片展示、6 款内置静态头像挑选器、昵称与座右铭修改、我的圈子与收藏列表。
- [x] **Task 8**: 实现数据冷备份与恢复：
  - 一键导出包含自建圈子、观看历史与收藏配置的 `.cinemajoy.backup.json`，支持一键无损导入恢复。

## Phase 5: 确定性自动化测试套件与打包交付 (Tasks 9-10)
- [x] **Task 9**: 在 `test/test_user_fixes.js` 补充 5 大确定性测试断言：
  - 畸形/超长密令防御与熔断；
  - 不可信输入 XSS 实体转义过滤；
  - 分享密令编解码无损幂等性；
  - CineCircleEngine CRUD 与 100 部硬上限；
  - 个人中心冷备份与恢复幂等性。
- [x] **Task 10**: 执行 `npm test` 确保 100% 测试全绿，执行 `./scripts/pack.sh` 打包并部署至 `/Applications/影悦.app`。

