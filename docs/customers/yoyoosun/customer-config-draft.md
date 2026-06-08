# 客户配置草案 / Customer Config Draft

本文件记录 yoyoosun 未来可能的配置项。它不是 runtime tenant 配置，不要求新增 `tenant_id`，当前也不创建 runtime loader。

当前配置包状态：

| 配置文件 | 状态 | 边界 |
| --- | --- | --- |
| `config/customers/yoyoosun/menuConfig.mjs` | 已接入前端桌面菜单 loader | 只控制前端菜单分组、排序、隐藏和文案；不替代后端 RBAC |
| `config/customers/yoyoosun/fieldNumberingConfig.mjs` | Draft / 草案 | 只作为字段显示和编号规则评审清单；`runtimeEnabled=false`，不接运行时、不改 schema、不执行导入 |

| 配置项 | 示例 | 当前状态 |
| --- | --- | --- |
| 公司名 | 永绅 yoyoosun 客户正式名称 | 待确认 |
| logo | 客户 logo | 待确认 |
| 主题色 | 客户后台主题色 | 待确认 |
| 菜单开关 | 是否启用委外、质检、财务等模块 | 待评审 |
| 模块开关 | plush industry template 默认模块 + yoyoosun 差异 | 待评审 |
| 字段显示 | 客户编码、客户简称、税号、供应商分类、客户订单号、交期、款式编号、颜色 / 尺寸 | 已进入 `fieldNumberingConfig.mjs` 草案，仍待客户确认 |
| 字段必填 | 订单、采购、入库、出货关键字段 | 待确认 |
| 编号规则 | 客户编码、供应商编码、销售订单编号、客户订单号、产品编号、款式编号、采购订单号 | 已进入 `fieldNumberingConfig.mjs` 草案，仍待客户确认 |
| 打印样本记录 | 采购合同、加工合同、出货单样式和字段来源 | 仅记录，不做通用模板内核 |
| 角色模板 | 老板、业务、采购、仓库、品质、财务、PMC、生产 | 待评审 |
| 权限模板 | 当前 RBAC 权限码组合 | 待评审 |
| 初始化数据 | 默认单位、仓库、角色、菜单 | 待整理 |
| 默认仓库 | 原料仓、成品仓等 | 待确认 |
| 默认单位 | 只、件、米、公斤等 | 待确认 |

## 字段和编号评审原则

- 客户样本字段不能自动升级为 Product Core 必填字段。
- 编号缺失时不得伪造，重复或冲突进入 unresolved queue。
- 销售订单编号、客户订单号、产品编号、款式编号和未来 SKU 编号必须分层确认。
- 销售订单只表示客户订单承诺，交期或出货日期不代表已经出货。
- 款式、颜色、尺寸和包装版本当前只作为 SKU / product / industry template 评审线索，不自动创建 `product_skus`。
- 采购订单号当前只作为 V2 purchase order 候选线索，不生成采购入库、库存或应付事实。
