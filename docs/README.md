# 文档入口与治理 / docs Guide

按当前任务选择入口。操作手册用于学习使用，专题文档用于查规则，代码与目标证据用于确认实际状态。

## 先读哪几份 / Reader Paths

| 你要做什么 | 从这里开始 |
| --- | --- |
| 学习业务操作、培训员工 | [业务使用手册](manuals/业务使用手册.md) |
| 配置账号、岗位和客户环境 | [管理员与实施手册](manuals/管理员与实施手册.md) |
| 接手开发、部署或排查故障 | [技术维护与运维手册](manuals/技术维护与运维手册.md) |
| 启动本地项目 | [仓库 README](../README.md#本地启动) |
| 判断当前能力与证据 | [当前真源与交接顺序](当前真源与交接顺序.md) |
| 修改功能，查应同步的规则 | [项目治理地图](项目治理地图.md) |

## 文档地图 / Documentation Map

| 主题 | 查阅入口 |
| --- | --- |
| 产品与业务规则 | [产品与路线](product/README.md)、[架构与领域边界](architecture/README.md) |
| 岗位与业务协作 | [工作流](workflow/README.md)、[角色权限](roles/README.md)、[仓库与品质](warehouse/README.md)、[财务](finance/README.md) |
| 页面与打印 | [前端实现约定](engineering/前端实现与交互约定.md)、[交互设计](product/ui-design/README.md)、[打印模板](打印模板实现原理.md) |
| 开发、验证与交付 | [工程入口](engineering/README.md)、[后端专题](../server/docs/README.md)、[测试策略](product/自动化测试策略.md)、[部署约定](部署约定.md) |
| 运维与保护 | [日志与审计](observability/README.md)、[安全与隐私](security/README.md) |
| 客户实施 | [实施流程](product/新增甲方客户实施流程.md)、[配置与权限](product/配置与权限策略.md)、[交付包](../deployments/README.md) |

查全部文件用[文档清单](文档清单.md)，查历史用[归档索引](archive/README.md)。完整仓库的 `customers/README.md` 提供客户资料入口；`docs/customers/**` 不随源码包分发，客户原件留在客户专属受控存储。

## 可视化图索引 / Visual Diagram Index

按问题查看：[业务与协同](workflow/业务与协同流程地图.md)、[状态与事实](architecture/状态工作流事实边界.md)、[流程建模](architecture/各类流程建模边界评审.md)、[业务链与轨迹](architecture/业务链与运行轨迹边界.md)、[CI/CD](engineering/研发效能工作台与CI-CD设计.md)。

## 文档写法 / Writing Rules

README 只管导航，专题说明规则和操作，`progress.md` 与归档保留过程。先写结论和适用任务，再展开细则；比较用短表格，步骤用编号，命令注明工作目录、成功信号与失败入口。同一规则集中维护，其余地方直接链接。

长期约定见 [AGENTS](../AGENTS.md)，按需操作流程见[项目 Skills](../.agents/skills/README.md)。外部建议先按本项目代码、正式文档和测试复核，再写入项目；外部原文与真实客户原件不进入产品文档。

## 索引同步 / Index Sync

新增、删除、改名或调整文档职责时，更新[文档清单](文档清单.md)、最近目录 README、引用和实际消费者；只改正文通常不动清单。归档逐文件登记在最近的归档 README。能力台账、客户矩阵和过程记录按 [AGENTS](../AGENTS.md) 的适用条件更新。

## 文件名与 metadata / Filenames And Metadata

长期文档使用稳定中文文件名；README、AGENTS、CHANGELOG、归档、生成文件和外部稳定路径沿用现有约定。英文术语用于检索和稳定锚点，只有工具实际消费时才新增 metadata。

| 内容 | 如何追踪 |
| --- | --- |
| 持续维护的设计与操作说明 | Git 记录修改历史，不逐篇补“最后更新日期” |
| 评估、发布、备份、验收与归档 | 保留实际日期，并绑定版本、环境或来源 |
| 配置与生成文档 | 遵循程序、生成器实际使用的版本和时间合同 |

## 产品内入口边界 / Runtime Docs Boundary

员工从 `/erp/help-center` 阅读操作图解和获准的三册手册；书目、正文、搜索与下载均受当前账号权限限制。内容来源、在线纠错、企业补充和导出见[手册维护](manuals/README.md)。业务页的“这页怎么用”继续复用 `businessUsabilityCatalog.mjs`。

开发文档从 `/__dev/docs` 阅读当前工作区 Markdown，新访客先进入本页；可搜索、按目录查找、置顶和跳转章节。“当前”“评审与参考”“历史”分开查看，正文按需加载。原型、归档和过程记录不证明当前实现。

普通仓库专题保留在仓库与 DEV 查看器；不恢复旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/source-readiness`、`/erp/mobile-workbenches`、`/erp/roles/*` 路由或前端 `docRegistry`。受控三册只开放固定书目与章节，不开放任意仓库文件读取。
