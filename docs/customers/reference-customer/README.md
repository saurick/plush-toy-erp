# 标准样例客户 / Reference Customer

`reference-customer` 是新增甲方时使用的中性工程参考，不是真实客户。它帮助开发、测试、运维和业务验收人员看清一项客户差异应落在哪一层、如何验证，以及哪些证据仍需在真实环境补齐。

## 当前结论

| 项目 | 当前状态 | 不能据此宣称 |
| --- | --- | --- |
| 客户配置包 | `draft`、`previewOnly=true`，可 lint 和编译受控 manifest | 已发布或已激活 |
| 字段与责任池投影 | Product Core 已有受控合同的工程参考 | 目标客户已经采用 |
| 流程与打印默认值 | 预览/受控投影，仍受 Workflow / Fact 和单据真源约束 | 任务完成等于事实入账、模板默认值等于业务事实 |
| 部署参数 | 复用生产 Compose 的示例 | 已创建生产实例或已有 release evidence |
| 客户资料与导入 | 未提供真实来源，真实导入不在本参考范围 | 客户已确认、已导入或已对账 |

仓库不创建 `deployments/reference-customer/`。参数示例和操作边界统一维护在 `config/private-deployment-template/`；真实客户的发布、备份恢复、浏览器 smoke 和签收证据仍进入该客户受控交付路径。

## 按角色阅读

| 读者 | 先读 | 目的 |
| --- | --- | --- |
| 产品/架构 | [差异与边界.md](差异与边界.md) | 判断 Product Core、客户配置、预览和延期边界 |
| 开发/测试/运维/业务验收 | [实施测试部署验收.md](实施测试部署验收.md) | 使用同一套实现、验证和外部证据口径 |
| 客户配置实现者 | `config/customers/reference-customer/README.md` | 核对可编译内容和禁止项 |
| 部署执行者 | `config/private-deployment-template/README.md` | 从唯一生产 Compose 准备真实环境参数 |

## 固定底线

- 保持一个模块化单体、一个 Product Core、一个后端、一个前端和一套 migration。
- 私有化采用一客户一实例：独立数据库/账号、文件目录、secrets、日志、备份与恢复权限；不增加 `tenant_id`。
- `ERP_CUSTOMER_KEY` 由部署环境固定，请求不能借 customer key 切换实例身份。
- 客户配置只能组合或收窄 Product Core 已有能力，不能增加 RBAC 权限码或绕过服务端权限。
- Workflow task done 不等于库存、采购、质检、出货或财务 Fact posted。
- 真实 Excel、PDF、合同、图片和其他原件应进入客户专属私有仓库或受控对象存储；Product Core 不使用 Git 子模块，也不反向依赖私有资料仓库。
