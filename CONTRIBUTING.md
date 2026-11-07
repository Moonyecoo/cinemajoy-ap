# 贡献指南 (Contributing to CinemaJoy)

感谢关注并参与「影悦 · 独立版」(CinemaJoy) 的开源建设！为维护项目工程规范与社区协作效率，请在提交代码前遵循以下标准：

## 1. 工程宪章与规范 (Code Standards)

1. **唯一品牌标识**：应用唯一名称为「影悦 · 独立版」(CinemaJoy)。
2. **零商业竞品注记**：严禁在代码、注释、提交信息或 UI 中提及任何第三方商业软件名称。一律采用标准技术术语（如「通用媒体采集接口」、「订阅配置」）。
3. **架构先于代码**：重大改动须遵循 `AGENTS.md` 规范，先明确技术方案与变更范围再行动。

## 2. 本地开发与质量门禁 (Local Development & Quality Gate)

```bash
# 1. 克隆代码仓库
git clone https://github.com/your-username/cinemajoy-app.git
cd cinemajoy-app

# 2. 安装工程依赖
npm install

# 3. 运行全套 21 项技术模块与自动化测试 (必须 100% 全绿)
npm test

# 4. 启动本地开发实例
npm start
```

## 3. Pull Request 提交要求

- **测试前置**：所有功能修改或缺陷修复均须通过 `npm test`（涵盖网络自治域名审计、流特征画质仲裁、内存预算、影视圈状态流转等）。
- **规范提交信息**：遵循 Conventional Commits 规范，例如：
  - `feat: add widescreen 16:9 hd billboard hero`
  - `fix: prevent pin moment modal propagation leak`
  - `docs: update architecture overview in readme`
- **精准补丁**：避免格式化非相关文件，保持 diff 纯净紧凑。

