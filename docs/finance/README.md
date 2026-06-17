# 财务文档 / Finance Docs

本目录回答“财务方向准备怎么做、与出货 / 采购 / 委外事实如何衔接”的问题。它不表示完整财务事实已经实现。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 看财务 V1 范围 | `财务第一版.md` | `docs/当前真源与交接顺序.md`、产品能力台账 |
| 判断出货后财务门禁 | `docs/architecture/状态工作流事实边界.md` | Shipment status、finance usecase 和测试 |
| 评审财务事实实现 | `docs/architecture/业务事实扩展总评审.md` | Ent schema、operational fact / finance usecase、RBAC |

## 真源边界 / Source Boundary

财务事实必须基于真实出货、采购入库、委外结算或对账等事实评审后落地。订单、出货放行或 workflow task 本身不能直接生成应收、应付、发票、付款或核销事实。

## 更新规则 / Maintenance

新增、删除、重命名财务文档，或改变财务事实边界时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/product/产品完成路线图.md`。
- `docs/product/产品能力进度台账.md`。
- `docs/当前真源与交接顺序.md`。
