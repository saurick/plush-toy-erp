# architecture 历史评审归档 / Architecture History Archive

本目录保存已经退出活跃 `docs/architecture/` 入口的旧阶段实现评审文档。

这些文件只用于追溯当时的设计过程和阶段性取舍，不作为当前 runtime、schema、migration、API、UI、测试或产品路线真源。当前实现状态必须回到：

- `docs/current-source-of-truth.md`
- 当前代码、Ent schema、Atlas migration 和测试
- 活跃 `docs/architecture/` 下的长期边界评审文档
- `docs/product/product-completion-roadmap.md`
- `docs/product/product-delivery-ledgers.md`

## 已归档文件

| 文件 | 原活跃用途 | 当前处理 |
| --- | --- | --- |
| `phase-2b-bom-lot-schema-review.md` | BOM 与库存批次阶段评审 | 历史实现评审归档 |
| `phase-2c-purchase-receipt-review.md` | 采购入库最小闭环阶段评审 | 历史实现评审归档 |
| `phase-2d-purchase-return-quality-review.md` | 采购退货 / 入库差异 / 来料质检入口阶段评审 | 历史实现评审归档 |
| `phase-2d-purchase-receipt-adjustment-review.md` | 采购入库差异 / 入库后更正阶段评审 | 历史实现评审归档 |
| `phase-2d-quality-inspection-entry-review.md` | 来料质检入口 / 批次状态 / 冻结库存边界阶段评审 | 历史实现评审归档 |
| `phase-2d-quality-inspection-schema-review.md` | `quality_inspections` 最小主表阶段评审 | 历史实现评审归档 |

## 使用规则

- 新任务不应把本目录文件当作当前架构入口。
- 若需要追溯旧阶段决策，可读取本目录文件，但结论必须再与当前代码和 `docs/current-source-of-truth.md` 复核。
- 如果归档文件中的某条结论仍需长期使用，应先抽到活跃边界文档或当前真源索引，再继续执行。
