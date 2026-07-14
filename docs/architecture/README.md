# 架构评审 / Architecture Reviews

本目录回答“系统边界怎么分、某个 usecase 或 schema 是否适合进入实现”的问题。评审文档是设计和边界入口，不直接替代当前代码、Ent schema、Atlas migration 或测试。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 设计状态顶层架构，或分别查询目标状态、实现证据和未来方向 | `状态字典与生命周期索引.md` | 对应代码、Schema、migration、tests 与正式演进评审 |
| 判断 Workflow / Fact 边界 | `状态工作流事实边界.md` | `状态字典与生命周期索引.md`、`../workflow/业务与协同流程地图.md`、对应 usecase / tests |
| 判断各类“流”如何按 plush 实际建模 | `各类流程建模边界评审.md` | `状态工作流事实边界.md`、`../workflow/业务与协同流程地图.md`、`业务主链路数据流向与字段来源规则.md` |
| 判断 MasterData / Source Document / Fact 分层 | `主数据源单据事实边界评审.md` | `docs/product/领域模型第一版.md`、当前 schema / repo |
| 做库存、BOM、采购、质检相关实现 | `材料成品物料清单与库存专表模型评审.md`、`产品款号物料清单边界评审.md`、`订单采购边界评审.md` | Ent schema、Atlas migration、data / biz tests |
| 做出货或放行相关实现 | `状态工作流事实边界.md` | `OperationalFactUsecase`、Inventory usecase、RBAC、UI 回归 |
| 做业务事实扩展 | `业务事实扩展总评审.md` | operational fact usecase、target evidence、产品能力台账 |
| 设计生产订单源单 | `生产订单源单边界评审.md` | 销售订单、BOM、production facts、库存事实和产品能力台账 |
| 做附件上传、现场证据或单据留档 | `业务附件证据边界评审.md` | attachment JSON-RPC、所属业务对象权限、页面接入回归 |

## 文档分组 / Document Groups

| 分组 | 文档 |
| --- | --- |
| 总边界 | `状态字典与生命周期索引.md`、`状态工作流事实边界.md`、`各类流程建模边界评审.md`、`主数据源单据事实边界评审.md`、`行业专表模型评审.md` |
| Workflow usecase | `仓库入库工作流用例评审.md`、`成品入库工作流用例评审.md`；通用编排以 `状态工作流事实边界.md` 和 workflow/product 专文为准 |
| MasterData / Source Document | `客户供应商主数据评审.md`、`订单采购边界评审.md`、`生产订单源单边界评审.md` |
| Inventory / BOM / Quality | `材料成品物料清单与库存专表模型评审.md`、`产品款号物料清单边界评审.md` |
| Shipment / Operational Fact | `状态工作流事实边界.md`、`业务事实扩展总评审.md` |
| Reporting / Audit / Integration | `业务附件证据边界评审.md` |

## 真源边界 / Source Boundary

架构评审写清设计边界、可实现路径和禁区；是否已经落地，以 `docs/当前真源与交接顺序.md`、当前代码、migration、测试和目标环境 evidence 为准。若评审文档与代码冲突，先复核当前代码，再决定修正文档或实现。

## 更新规则 / Maintenance

新增、删除、重命名本目录长期维护文档，或改变某篇文档是否属于活跃架构入口时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 相关产品路线、能力台账和测试策略。
