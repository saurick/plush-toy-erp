# 首批正式数据模型

## 为什么当前不直接建表

当前真实资料已经足够设计表结构，但还不足以直接改 Ent schema。  
原因：

1. 编号体系还没完全稳定
2. 客户 / 供应商主档样本还不够
3. 结算单 / 对账单样本还没到

## 首批建议表

| 表                                | 作用                                 |
| --------------------------------- | ------------------------------------ |
| `erp_partners`                    | 客户、加工厂、辅包材供应商主档       |
| `erp_styles`                      | 款式主档                             |
| `erp_materials`                   | 主料 / 辅材 / 包材主档               |
| `erp_bom_headers`                 | BOM 版本头                           |
| `erp_bom_lines`                   | BOM 明细行                           |
| `erp_processing_contract_headers` | 加工合同头                           |
| `erp_processing_contract_lines`   | 加工合同行                           |
| `erp_production_orders`           | 生产 / 排单头                        |
| `erp_production_progress_logs`    | 进度 / 延期 / 返工 / 异常日志        |
| `erp_inventory_moves`             | 收发 / 入库 / 待出货记录             |
| `erp_settlements`                 | 加工费 / 辅包材费用结算入口          |
| `erp_attachments`                 | 合同图样、色卡、作业指导书、图片附件 |

## 当前决定

- 本轮先停在文档、页面和导入映射
- 不开始改 Ent schema
- 等字段稳定后再决定 migration
