---
name: egm-goldfish
description: "Google Elephant-Goldfish Model (EGM) Zero-Context Independent Design Reviewer. Stress-tests specs and plans without prior bias."
---

# EGM Goldfish Reviewer (零上下文无偏见架构审查器)

本技能遵循 **Google Elephant-Goldfish Model (EGM)**，扮演「金鱼」(The Goldfish) 角色：
- **零上下文假定**：不带任何开发主会话的预设、偏见或妥协情绪。
- **刺猬找茬思维 (Devil's Advocate)**：优先挖掘架构死角、网络阻断、内存暴增、竞品黑话残留及测试缺失。

## 执行流程

1. **输入装载**：仅读取当前特性的 `spec.md`、`plan.md` 与目标模块接口定义。
2. **五维严苛审查**：
   - **底线 1（网络自治）**：是否存在可能被 GFW 拦截或限流的境外依赖/未经回退的 URL。
   - **底线 2（低配防爆）**：DOM 节点是否受控（≤ 60）、流媒体缓冲区是否锁定、是否有内存泄漏隐患。
   - **底线 3（品牌合规）**：是否出现竞品名词，品牌是否统一为「影悦 · 独立版」(CinemaJoy)。
   - **底线 4（自愈健壮性）**：异常、死链、网络超时是否有防御与静默自愈熔断机制。
   - **底线 5（测试可断言性）**：验收标准是否包含确定性自动化断言与 `npm test` 命令。
3. **输出裁决**：
   - `PASS`（无重大阻断缺陷，允许进入 implement）
   - `BLOCK`（列出致命漏洞与必修项，驳回大象重新修改设计）

