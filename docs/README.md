# 文档入口与治理 / docs Guide

先用 [当前真源与交接顺序](当前真源与交接顺序.md) 判断当前能力，再按下表进入主题。README 负责导航，专题文档负责业务和操作合同；实现与运行状态分别回到代码 / migration / 测试和目标证据核对。

## 先读哪几份 / Reader Paths

| 分类 | 要解决的问题 | 入口 |
| --- | --- | --- |
| 上手与项目维护 | 启动项目、判断真源、确定改动范围 | [仓库入口](../README.md)、[当前真源](当前真源与交接顺序.md)、[项目治理地图](项目治理地图.md)、[脚本入口](../scripts/README.md) |
| 业务与领域 | 产品范围、主数据、源单、事实、状态与协作 | [产品与路线](product/README.md)、[架构与领域边界](architecture/README.md)、[工作流](workflow/README.md)、[角色](roles/README.md)、[仓库与品质](warehouse/README.md)、[财务](finance/README.md) |
| 页面与打印 | 页面任务、菜单、移动岗位端、合同与打印实现 | [前端入口](../web/README.md)、[菜单与正式入口](product/菜单与正式入口合同.md)、[页面动作与生命周期](product/业务数据生命周期与页面动作规则.md)、[打印文档](打印模板实现原理.md) |
| 开发测试与运行交付 | API、数据字典、测试、CI、发布、迁移与恢复 | [后端专题](../server/docs/README.md)、[测试策略](product/自动化测试策略.md)、[QA 操作](../scripts/qa/README.md)、[工程与交付](engineering/README.md)、[部署约定](部署约定.md)、[可观测性](observability/README.md) |
| 客户实施与验收 | 客户输入、配置差异、资料、验收与交付 | 完整仓库内的客户资料索引 `customers/README.md`、[实施流程](product/新增甲方客户实施流程.md)、[配置与权限](product/配置与权限策略.md)、[安全与隐私](security/README.md)、[客户交付包](../deployments/README.md) |
| 参考与历史 | 样板、原型、历史决策和过程追溯 | [原型说明](product/prototypes/README.md)、完整仓库内的工程样例 `customers/reference-customer/README.md`、[归档](archive/README.md) |

这些是阅读分类，保留现有主题目录和稳定路径。全量文件、用途与归属查 [文档清单](文档清单.md)；不在多个 README 重复整份清单。

`docs/customers/**` 是仓库内的实施与客户资料，按 `.gitattributes` 排除在 `git archive` 源码包之外。仅持有源码包时，应使用上表随包提供的通用实施、配置与交付文档；客户资料需从完整仓库或对应受控存储取得。

开发环境 `/__dev/docs` 默认展示当前长期文档；“评审与参考”“历史”分开查看，历史正文按需加载。原型是设计输入，归档与 `progress.md` 是历史 / 过程证据，都不证明当前实现。

## 文档地图 / Documentation Map

需要跨层判断时使用 [项目治理地图](项目治理地图.md)，查看表字段使用 [数据库数据字典](../server/docs/database/README.md)，查产品范围使用 [产品能力进度台账](product/产品能力进度台账.md)，规划后续工作使用 [产品完成路线图](product/产品完成路线图.md)。它们各管一类问题，不互相复制当前状态。

## 可视化图索引 / Visual Diagram Index

流程与边界图集中在 [状态 / Workflow / Fact](architecture/状态工作流事实边界.md)、[流程建模](architecture/各类流程建模边界评审.md)、[业务链与轨迹](architecture/业务链与运行轨迹边界.md)、[业务与协同](workflow/业务与协同流程地图.md) 和 [CI/CD 设计](engineering/研发效能工作台与CI-CD设计.md)。图帮助阅读；正式文字、代码与证据仍决定行为。

## 文档写法 / Writing Rules

结论、读者、当前状态和主路径前置。比较用短表格，步骤用编号，规则用短段落；命令写清工作目录、成功信号和失败入口。编号仅用于真实的机器追踪或稳定引用，业务摘要使用可读名称。

同一规则只维护一处，其余文档链接到对应章节。长期工程规则见 [AGENTS](../AGENTS.md)，按需 SOP 见 [项目 Skills](../.agents/skills/README.md)，可机械检查的约束由现有 QA / hook 守住。产品台账只在能力边界、状态或关键阻塞变化时更新；过程记录按 AGENTS 的适用条件更新。

## 索引同步 / Index Sync

新增、删除、重命名、重分类长期 Markdown，或改变标题 / 职责时，同步 [文档清单](文档清单.md)、最近目录 README、引用与实际消费者。仅改正文而职责不变时通常不更新清单。

长期且职责容易混淆的目录保留 README。外部 GPT、其他项目原文和真实客户原件不进入产品文档；采纳结论先回到本项目核实，私密 manifest 与客户原件留在客户专属受控存储。

## 文件名与 metadata / Filenames And Metadata

长期文档使用稳定的中文文件名与中文主体，英文术语用于搜索和稳定 anchor。README / AGENTS / CHANGELOG、归档、生成文件及已有外部稳定路径保留约定名称。

日期按信息用途保留，不给所有文档和配置统一加日期：

| 信息类型 | 日期规则 |
| --- | --- |
| 持续维护的 README、设计、操作说明 | 文件名稳定；Git 记录修改历史，不机械写“最后更新日期” |
| 评估快照、决策、发布、备份、验收回执与归档 | 记录实际发生 / 核验时间，并绑定版本、环境或来源；日期只证明当时状态 |
| 运行配置与模板 | 保留程序实际消费的版本、有效期或时间字段；不为追踪修改而新增日期字段或改配置文件名 |
| 生成文档 | 日期由生成器合同决定，不人工改生成物 |

当前不要求统一 YAML frontmatter。只有 viewer、generator 或 index 实际消费时才增加 metadata；已有 `Doc Type`、`Status`、`Source` 等字段保持语义准确，避免再建一份人工维护的状态表。

## 产品内入口边界 / Runtime Docs Boundary

当前前端只维护面向登录用户的岗位使用帮助，不恢复产品内 Markdown 文档中心、高级文档和开发与验收页面：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- `/erp/help-center` 是当前单一岗位帮助入口，内容真源为 `web/src/erp/config/roleHelpContent.mjs`；它按当前有效岗位投影内容，只展示账号已开放的页面捷径，不设置独立业务权限码。
- 高频业务页的“这页怎么用”和字段问号说明统一来自 `web/src/erp/config/businessUsabilityCatalog.mjs`，用于补充页面任务、完成标准、交接、公式和字段来源，不恢复第二个帮助中心，也不替代权限、岗位责任或业务链真源。`/__dev/business-usability` 只读检查这份目录的覆盖情况，不进入正式菜单或生产构建。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/source-readiness`、`/erp/mobile-workbenches` 和 `/erp/roles/*` 路径不再注册运行时路由、重定向或权限别名。
- 正式文档继续保留在 `docs/`、`server/docs/`、`web/README.md`、`server/README.md` 等仓库文档入口，不复制或镜像到前端运行时页面。
- 本地开发态可通过 `/__dev/governance` 按常见改动只读浏览 [项目治理地图](项目治理地图.md) 的第一份依据、同步检查和误判边界；内部分类与完整关系按需展开。该入口不进入 ERP 正式菜单，也不替代 Markdown 真源。

未来若新增长文档或开发验收入口，必须先设计 registry、导航、权限、路由、渲染代码和测试断言；不要把仓库正式文档镜像进岗位帮助，也不临时恢复旧 docs registry。
