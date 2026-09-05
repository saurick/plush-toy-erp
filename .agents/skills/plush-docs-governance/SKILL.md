---
name: plush-docs-governance
description: 项目文档治理（plush-toy-erp）。Use to review or maintain plush Markdown, README, docs indexes, AGENTS rules, and progress records.
---

# Plush Docs Governance

维护 plush 文档的真源、读者路径和项目命名。按目标选择分支，不把普通文案修订扩展为业务或运行改造。

## Scope and Truth

- 读取项目 `AGENTS.md`、`docs/当前真源与交接顺序.md` 及相关目录 README；使用 `GIT_OPTIONAL_LOCKS=0` 核对当前 diff 并保护外部改动。已读且未变化的入口无需重复加载。
- 正式 docs 描述合同；当前实现核对代码、Ent schema、Atlas migration 和测试；目标交付需运行证据。`progress.md`、`docs/archive/**`、外部规划和客户样本不能替代当前真源。
- 外部 GPT / 其他项目原文不进入产品仓；采纳结论先核实，再写成项目自身合同。客户原件与私密 manifest 继续留受控私有存储。
- 普通文档维护不编辑 AGENTS；用户明确要求治理长期规则时直接在授权范围内完成，保留 Workflow / Fact、RBAC、迁移、隐私、Git 与恢复门禁。
- 本次目标确实需要行为修改时，切换对应领域、页面或 operations 分支并继续已授权工作；只对新增范围或缺少授权的动作暂停。

## Writing and Organization

- 结论、读者、范围、当前状态和主路径前置。业务文档用岗位语言；T0-T8 是验证层级，L/内部状态键不作普通业务摘要。
- README 管导航，专题管业务 / 操作，progress 管过程；同一规则集中一处，用稳定章节链接关联。对比 / 清单用表格，操作用编号，命令用代码块，复杂关系才用 Mermaid。
- 不新增重模板、平行 metadata、过程目录或重复负面清单。frontmatter 仅在真实 viewer / generator / index 消费时使用；命令注明工作目录和有用的成功信号。
- 长期文档默认中文文件名、中文主体及 English anchor；README / AGENTS / CHANGELOG、archive、生成和外部稳定路径例外，不机械改名。
- AGENTS 留长期项目特例，业务事实进专题，机械门禁留现有 QA，按需 SOP 进 Skills。删改规则须有具体影响依据，授权语义变化单列说明；体积治理不删除有效保护。

## Conditional Sync

- 新增、删除、重命名、重分类长期 Markdown 或改变标题 / 职责时，同步 `docs/文档清单.md`、目录 README、入口、锚点与引用；仅改正文通常不动清单。
- 一级目录 / 长期子系统变化才同步相关结构导航。行为、配置、接口、使用方式变化时同步对应专题；普通缺陷、样式或测试补强不更新能力台账。
- 能力边界 / 产品状态 / 关键阻塞实质变化才更新能力台账；客户启用、发布或验收状态变化才更新客户矩阵；主路径入口变化才更新当前真源索引。
- progress 严格按 AGENTS 的跨会话、阻塞 / 风险、schema / migration、发布 / 回滚、重大决策或用户要求条件更新；先检查 600 行 / 80 KiB，达到后显式归档并保留活跃事项和索引。
- 文档被 DEV viewer、帮助页、原型索引或生成脚本消费时，同步实际消费者与必要测试，不建第二份真源。

## Validation and Output

运行 `git diff --check` 和定向路径 / 锚点 / 旧术语扫描；改 Skills 运行 `node scripts/qa/skill-health.mjs` 和 validator，改文档清单或消费者时运行对应检查。Mermaid 变化检查语法与标签。纯治理不执行 migration 或无关全量 QA。

报告关键修改、AGENTS 是否变化、必要同步、验证及盲区；未涉及的图表、metadata、目录或运行层不逐项填报。
