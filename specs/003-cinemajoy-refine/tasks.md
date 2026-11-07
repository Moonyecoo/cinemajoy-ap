# Implementation Tasks: 影悦纯净体验与高光短视频分享 (003-cinemajoy-refine)

## Phase 1: 品牌与纯净界面重塑 (Tasks 1-3)
- [x] **Task 1**: 重绘 `assets/icon.html`，以「影悦 · CinemaJoy」现代流光蓝紫渐变与立体播放徽标替换「看看鸭」，并运行 `./scripts/make-icon.sh` 生成 `icon-1024.png` 与 `AppIcon.icns`。
- [x] **Task 2**: 彻底移除 `src/app.js` 中的 `openAiCompanionPanel`、`#aiCompanionDrawer`、`#btnAiCompanion` 及快捷键 `A`，并移除 `src/app.css` 中对应的伴影抽屉样式。
- [x] **Task 3**: 界面黑话彻底清除：
  - 在 `src/index.html` 中移除底部 `● AVFoundation 硬件加速`。
  - 在 `src/app.js` 中新增 `friendlyLineName(name, index)` 转换，过滤 `(需解析)` 线路，将 `ffm3u8` 等杂乱字符转化为「极速专线」「备用专线 N」。
  - 清除播放器副标题中的 `ffm3u8 · 1080P 高清 · 秒开缓冲 · 硬件加速`，改为清爽的影视分类与年份。

## Phase 2: 高光截取分享与 Web Audio 影院音效 (Tasks 4-5)
- [x] **Task 4**: 实现高光短视频截取、台词评论与品牌水印社交分享模块：
  - 播放器底栏增加 `#btnClipShare`（高光截取）。
  - 实现基于 Canvas + MediaRecorder 的 5-10s 高光短视频捕获与即时截图。
  - 叠加右上角「影悦 · CinemaJoy」高清品牌水印与底部半透明台词评语卡片。
  - 支持一键保存短视频、一键复制带水印名场面截图、一键复制社交分享文案。
- [x] **Task 5**: 实现 Web Audio `AudioEnhancer` 引擎：
  - 接入 `AudioContext` 并创建 `BiquadFilterNode` 与 `DynamicsCompressorNode`。
  - 播放器底栏增加 `#btnAudioFx`，支持一键轮换「原音」「清晰人声」「影院重低音」「纯净夜间」。

## Phase 3: 安全加固与自动化测试验收 (Tasks 6-7)
- [x] **Task 6**: 加固主进程 IPC 安全机制与文件操作防护（URL 协议过滤、路径规范化）。
- [x] **Task 7**: 更新并增加 `test/test_user_fixes.js` 验证套件，运行 `npm test` 确保 14 项测试全绿，打包并安装至系统验证。

## Phase 4: 播放顶栏提顶纯净化与严格竖版海报自愈 (Tasks 8-9)
- [x] **Task 8**: 播放器顶栏全面提顶纯净化：
  - 将播放器悬浮顶栏提顶至窗口头部统一接管，呈现「[ < 返回 ] 电影名 —— 一句话电影看点」。
  - 彻底移除播放器画面内部的悬浮重复顶栏，杜绝双层标题与无意义技术信息干扰。
  - 实现 `getMovieHighlight` 智能提取提炼一句话黄金看点。
- [x] **Task 9**: 严格竖版海报算法与历史记录自动洗白：
  - 调整国内海报抓取引擎，应用严格竖版比例过滤 (`height / width >= 1.18`)，优先采纳 360/百度高清竖版海报，杜绝横版小说封面居中裁剪导致的切字露怯。
  - 清理本地损坏的横版海报缓存，修复观看记录页面海报自动补全逻辑。
