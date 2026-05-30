# Rewrite Roadmap

## 原则

0 到 1 重构按可验证阶段推进，不把 schema、runtime、前端接入、部署和产品化交付混在同一轮。

## 路线

| 阶段 | 范围 | 不做 |
| --- | --- | --- |
| Phase 0 | 文档、目录骨架、边界、release gates | runtime、schema、migration、docs registry |
| Phase 1 | 主数据、订单源单据、BOM 和采购前置模型评审；产出 schema draft、migration readiness 和小 goal 拆分 | runtime、Ent schema、migration、API、UI、完整库存 / 出货 / 财务自动化 |
| Phase 2 | schema final review 与 V1 implementation cutline；采购、来料、质检、库存事实闭环继续按独立事实层评审推进 | 直接从 workflow done 落账；把 draft-only 对象顺手落 Ent schema |
| Phase 3 | 生产、委外、成品入库事实 | 前端本地派生事实 |
| Phase 4 | 出货事实、库存预留、实际出库 | 把 `shipping_released` 当 `shipped` |
| Phase 5 | 财务对账、应收、应付、发票、收付款 | 未 shipped 即自动应收或开票 |
| Phase 6 | 产品化交付和私有化部署包 | SaaS 多租户和 `tenant_id` |

每一阶段必须先确认唯一真源、禁止补丁层和验收命令。
