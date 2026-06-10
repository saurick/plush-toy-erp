# 客户配置草案 / Customer Config Draft

本文件记录 yoyoosun 未来可能的配置项。它不是 runtime tenant 配置，不要求新增 `tenant_id`，当前也不创建 runtime loader。

当前配置包状态：

| 配置文件 | 状态 | 边界 |
| --- | --- | --- |
| `config/customers/yoyoosun/menuConfig.mjs` | 已接入前端桌面菜单 loader | 只控制前端菜单分组、排序、隐藏和文案；不替代后端 RBAC |
| `config/customers/yoyoosun/fieldNumberingConfig.mjs` | Draft / 草案 | 只作为字段显示和编号规则评审清单；`runtimeEnabled=false`，不接运行时、不改 schema、不执行导入 |
| `config/customers/yoyoosun/importConfig.mjs` | Draft / 草案 | 根据已提取 Excel evidence 和产品核心边界收口导入 / 客户差异配置项；`runtimeEnabled=false`，不嵌入 raw rows，不接 loader，不执行真实导入 |

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

## 全局扫描后的配置项 / Config Items After Global Scan

本轮按提取结果、产品核心、行业模板候选、客户交付矩阵和客户差异台账做全局扫描后，新增 `config/customers/yoyoosun/importConfig.mjs` 作为导入与客户差异配置草案。它只记录统计、配置分组、评审队列和禁止项；不把 `output/` 中 5800 行 source rows 写进 git，也不把永绅样本字段升级为 Product Core。

扫描 evidence：

| 来源 | 结论 |
| --- | --- |
| `source-snapshot.extracted.json` | 5 个 workbook / 20 个 sheet / 5800 条 source rows；只作为本地 evidence，不纳入 git |
| `dry-run-preview/validation-summary.json` | `canExecuteRealImport=false`；create 818、review 1751、defer 3231、blockerCount 969、forbiddenCount 6 |
| `freeze-check/freeze-check-summary.json` | `valid=true`；sourceCount 5800、blockerCount 0、sensitiveFieldCount 4417 |
| Product Core / Capability Ledger | 已有主数据、销售订单、部分事实层；客户样本字段不能反向改 schema / migration / RBAC / Workflow / Fact |
| Industry Template / Private Package Template | 行业模板和私有化复制包仍是 candidate / template；不因单客户样本进入 runtime loader |

配置项归类：

| 配置项 | 落点 | 当前状态 | 处理边界 |
| --- | --- | --- | --- |
| 品牌与桌面菜单展示 | `menuConfig.mjs` | Runtime active display config | 只控制前端品牌 / 菜单展示；不替代 RBAC |
| 字段显示 | `fieldNumberingConfig.mjs` | Draft / review required | 客户确认前不接 runtime，不改 Product Core 必填 |
| 编号规则 | `fieldNumberingConfig.mjs` | Draft / review required | 编号缺失不得伪造；采购订单号仍 deferred |
| Excel 来源提取与字段映射 | `importConfig.mjs` | Draft / data import adapter | 只记录映射分组和顺序；不嵌入 raw rows |
| 主数据导入顺序 | `importConfig.mjs` | Draft / review required | units -> products/materials/suppliers -> contacts -> BOM；全部需人工 review |
| 采购与委外源单据 | `importConfig.mjs` | Deferred runtime | 只保留 source snapshot 和字段线索，不生成 purchase order / outsourcing runtime |
| 采购合同 / 加工合同打印样本 | `importConfig.mjs` | Deferred print template input | 只作客户样本，不建立通用打印模板引擎 |
| 角色、权限、岗位任务模板候选 | `importConfig.mjs` | Draft / review required | 只作为客户核对清单，不改后端 RBAC 真源 |
| 禁止自动导入目标 | `importConfig.mjs` | Forbidden auto import | `tenant_id`、`business_records`、SKU、采购订单 runtime、出货、预留、库存、财务和 Workflow/Fact 混淆全部禁止 |

## 导入配置候选 / Import Config Candidate

`scripts/import/customerSourceExtract.mjs` 可从 `docs/customers/yoyoosun/raw-source-files/*.xlsx` 生成本地 `output/customers/yoyoosun/source-extract/customer-import-config.candidate.json`。该文件只作为导入前 evidence 和人工 review 配置候选，不放入运行时，不进入 `config/customers/yoyoosun/`，也不代表真实 import approval。

`config/customers/yoyoosun/importConfig.mjs` 是从上述 candidate、dry-run/freeze 输出、产品核心边界和客户台账中人工收口后的 tracked 配置草案。它只保留配置级别的统计、字段分组、导入顺序、review queue 和 forbidden targets，不保留 raw rows，也不改变 `customer-import-config.candidate.json` 仍在 `output/` 下作为本地 evidence 的边界。

当前输出边界：

- `runtimeEnabled=false`。
- `createsTenant=false`，不新增 `tenant_id`。
- `executesImport=false`，不写 DB、不写 `business_records`。
- PDF / 图片仍作为人工来源引用，不做 OCR。
- `existing-v1.empty-preview.json` 只是 dry-run preview 占位；真实 sign-off 前必须替换为已 review 的 existing V1 / formal model snapshot。

## 字段和编号评审原则

- 客户样本字段不能自动升级为 Product Core 必填字段。
- 编号缺失时不得伪造，重复或冲突进入 unresolved queue。
- 销售订单编号、客户订单号、产品编号、款式编号和未来 SKU 编号必须分层确认。
- 销售订单只表示客户订单承诺，交期或出货日期不代表已经出货。
- 款式、颜色、尺寸和包装版本当前只作为 SKU / product / industry template 评审线索，不自动创建 `product_skus`。
- 采购订单号当前只作为 V2 purchase order 候选线索，不生成采购入库、库存或应付事实。
