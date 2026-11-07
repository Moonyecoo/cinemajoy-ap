# AI Agent Development Guidelines (GitHub Spec-Kit + Google EGM Enforcement)

本项目已正式接入 **GitHub Spec Kit (`github/spec-kit`)** 与 **Google Elephant-Goldfish Model (`google/elephant-goldfish-model`, EGM)** 双轨驱动开发体系。每次开发任务均须严格按以下规范执行：

## 1. 规范先于代码与双轨 EGM 机制 (Spec First & EGM Protocol)
- **拒绝盲目动手**：接收新需求或重大重构时，严禁未经规划直接大面积修改代码。
- **大象与金鱼双轨制**：
  - **大象 (The Elephant)**：主智能体维护全量对话记忆与架构全景，负责需求梳理、方案草拟（`spec.md` / `plan.md`）。**大象阶段严禁直接编写业务代码**。
  - **金鱼 (The Goldfish)**：草案完成后，启动独立零上下文子代理（Subagent），仅依据设计文稿进行无偏见“找茬”审查（网络自治、低配防爆、自愈机制、竞品合规），审查通过后方可转入实施。
- **开发六步法**：
  1. `/speckit-constitution`：遵循项目工程宪章（纯净原版、零外部竞品注解、测试驱动）。
  2. `/speckit-specify`：明确需求范围、输入输出与明确的验收标准。
  3. `/speckit-plan`：制定架构设计方案，厘清涉及模块与潜在风险。
  4. `/egm-goldfish`：派生零上下文子代理进行刺猬盲审，排除盲区。
  5. `/speckit-tasks`：输出清晰的编号任务列表（每步可独立验证）。
  6. `/speckit-implement`：按任务列表逐一实施，并运行 `npm test` 验证。

## 2. 极致 Token 节约准则 (Token Optimization)
- **精准局部补丁**：必须优先使用 `edit_file` 精准替换目标代码块，严禁全量重写非必要大文件。
- **高信息密度响应**：
  - 严格遵守 ADHD 风格：结论/命令/代码置顶，无寒暄废话，步骤单步编号，结束于 2 分钟内可操作的具体动作。
  - 避免无意义发散，当前问题未解决严禁引入新话题。
- **按需加载上下文**：优先通过精确匹配查找关键文件，不将无关目录与大型资产读入上下文。

## 3. 代码原创性与第三方注解隔离
- 应用唯一品牌名称为「影悦 · 独立版」(CinemaJoy)。
- 代码、注释及 UI 中严禁提及外部商业竞品名称（如微看、TVBox、苹果CMS等），统一使用标准技术名词（如通用流媒体采集 JSON 接口、源订阅配置）。

## 4. 自动化测试与质量门禁
- 任何功能开发与 Bug 修复，在交付前均必须执行并通过：
  ```bash
  npm test
  ```
  确保 11 项核心技术模块与端侧 AI 自动化测试全绿。

