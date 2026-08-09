# 架构边界 / Architecture Boundaries

本目录维护稳定的领域分层、状态、流程、事实和数据 owner 合同。具体字段、状态、表结构和已实现范围以当前 schema、migration、repository、usecase、API 与测试为准。

## 按任务阅读

| 要回答的问题 | 先读 | 再核对 |
| --- | --- | --- |
| 状态目标、实现证据和生命周期入口 | [状态字典与生命周期索引](状态字典与生命周期索引.md) | 当前代码、schema、migration 和 tests |
| Workflow / ProcessRuntime / Fact 如何分 | [状态、Workflow 与 Fact 边界](状态工作流事实边界.md) | [业务链与运行轨迹边界](业务链与运行轨迹边界.md)、workflow 文档与 usecase |
| 业务流、审批流、任务流、异常流如何建模 | [各类流程建模边界评审](各类流程建模边界评审.md) | 状态边界、当前流程注册表和测试 |
| Master Data、Source Document、Fact 如何分 | [主数据、源单据与事实边界](主数据源单据事实边界评审.md) | 当前 schema / repo / usecase |
| 客户、供应商与联系人如何维护 | [客户、供应商与联系人主数据合同](客户供应商主数据评审.md) | 主数据 schema、API、页面和测试 |
| 订单、采购和生产源单如何分 | [订单与采购边界](订单采购边界评审.md)、[生产订单源单边界](生产订单源单边界评审.md) | 对应 Source Document usecase 和事实触发 |
| 产品、SKU、BOM、工艺与 WIP 如何分 | [产品 / SKU / BOM 边界](产品款号物料清单边界评审.md)、[生产路线与 WIP 边界](生产工艺路线与在制品边界评审.md) | schema、生产 / 委外 / 质量 / 库存事实 |
| 库存、采购、质检、生产、出货和财务事实 | [业务事实边界](业务事实扩展总评审.md) | 对应 fact usecase、权限、事务和一致性测试 |
| 附件、现场证据和留档 | [业务附件证据边界](业务附件证据边界评审.md) | attachment API、对象权限与页面回归 |

## 维护原则

- 架构文档记录稳定 owner 与边界，不保存阶段计划、一次测试计数或目标环境状态。
- 相近对象先复用既有真源；新增表、字段或配置前检查别名、双写、历史数据和所有下游投影。
- Workflow task done、ProcessRuntime completed 和 Fact posted 始终分层。
- 架构结论变化时同步相关产品 / workflow 文档、代码测试和 `docs/文档清单.md`；正文措辞调整通常不更新清单。
