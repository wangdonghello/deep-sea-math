# dsm2001 · 第二版：年级与兴趣个性化

**change-id**: DSM2001
**状态**: 规格已定义（spec-in-progress），等待设计评审
**基线**: 第一版 `dsm1234`（已交付）

## 本变更要交付什么

- 孩子档案增加年级（1–3）与主兴趣主题（深海/恐龙/太空）；
- 按年级硬过滤题库，1–3 年级各 216 题，新增四选一选择题与更多应用题；
- 三个主题包各 8 个收藏条目，通用四阶段探索，完成每日任务推进；
- 错题按当前筛选打印，含孩子原答案、正确答案与解析，答案单独成页。

## 规格索引

- [`proposal.md`](proposal.md)：背景、范围、非目标与影响
- [`specs/grade-personalization/spec.md`](specs/grade-personalization/spec.md)：年级/主题档案、任务生成与生效边界
- [`specs/grade-question-bank/spec.md`](specs/grade-question-bank/spec.md)：分年级题库、选择题、应用题与校验
- [`specs/theme-collection/spec.md`](specs/theme-collection/spec.md)：主题包、四阶段、收藏解锁、素材许可
- [`specs/mistake-print/spec.md`](specs/mistake-print/spec.md)：错题打印范围、内容、分页与降级

## 明确不做

4–6 年级、未授权 IP、全主题 3D、运行时 AI 生成、账号云同步、整套主题换肤、判断题/填空题。

## 下一步

运行 `/sdd-plan dsm2001` 产出 `design.md` 与 `tasks.md`，再进入实现。
