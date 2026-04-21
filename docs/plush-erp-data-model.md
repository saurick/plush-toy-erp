# 毛绒 ERP 数据模型草案

## 当前结论

当前仓库里的数据库结构还只是登录基线，不是毛绒 ERP 的正式业务模型。

现状真源：

- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/user.go`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/admin_user.go`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/migrate/20260315161316_migrate.sql`

当前只有两张表：

- `users`
- `admin_users`

这两张表只够支撑账号登录，不能直接拿来承接毛绒工厂的客户、款式、BOM、加工合同、排单、入库和结算链路。

## 开发库命名建议

建议正式统一为：

- 数据库：`plush_erp`
- 本地开发默认地址：`192.168.0.106:5432/plush_erp`

这样比 `plush_toy_erp` 更短，也和现有 `trade_erp` 命名风格一致；后续无论是 PG 客户端、迁移脚本还是数据库标签展示，都更容易和其他项目并排识别。

## 为什么你在 `192.168.0.106` 看不到这个库

当前最可能只有两种原因：

1. `192.168.0.106` 上还没有创建 `plush_erp`
2. 你当前登录的账号还没有该库的 `CONNECT` 权限，所以客户端不会显示

这轮我只能确认到连接阶段会报 `fe_sendauth: no password supplied`，说明网络和端口没问题，但当前会话没有共享 PG 的账号密码，无法继续只读验证库列表或权限。

如果你要让当前 PG 客户端账号可见，至少要满足下面任一条件：

```sql
CREATE DATABASE plush_erp OWNER zos_test_user;
```

或者库已存在时：

```sql
GRANT CONNECT ON DATABASE plush_erp TO zos_test_user;
GRANT ALL PRIVILEGES ON DATABASE plush_erp TO zos_test_user;
```

如果实际联调账号不是 `zos_test_user`，把上面的用户名替换成你的真实账号即可。

## 表设计建议

当前阶段不建议直接照搬 `trade-erp` 的外销、出运、结汇主表。毛绒工厂的主路径应围绕“款式 -> BOM -> 加工合同 -> 生产进度 -> 仓库 -> 结算”来建模。

首批更合理的业务实体建议如下：

- `admin_users`
  - 后台管理员
- `users`
  - 员工或移动端账号
- `erp_partners`
  - 客户、加工厂、辅料供应商统一主档
- `erp_product_styles`
  - 款式主档，承接客户款号、内部款号、图片、颜色、尺码、交期
- `erp_materials`
  - 主料、辅料、包材、吊牌等物料主档
- `erp_boms`
  - 某个款式某个版本的 BOM 头
- `erp_bom_items`
  - BOM 明细行，记录材料、单位用量、损耗、替代料
- `erp_processing_contracts`
  - 加工合同头，记录加工厂、合同号、交期、结算条款
- `erp_processing_contract_items`
  - 加工合同明细，记录款式、数量、单价、应付金额
- `erp_production_orders`
  - 生产单 / 排单头
- `erp_production_order_items`
  - 生产单明细，记录款式、数量、计划节点
- `erp_production_progress_logs`
  - 每日进度、延期原因、返工、异常记录
- `erp_inventory_receipts`
  - 收货 / 入库头
- `erp_inventory_receipt_items`
  - 收货 / 入库明细
- `erp_settlements`
  - 加工费、辅料费、包材费结算单
- `erp_attachments`
  - 合同、Excel、图片、工艺单等附件元数据

## 当前不建议的设计

- 不要把 `trade-erp` 的 `erp_export_sales / erp_shipment_details / erp_settlements` 那套外贸链路直接搬过来。
- 不要在需求还没稳定前先建一个 `erp_module_records(payload jsonb)` 这种泛表，把所有业务真值都塞进 JSON。
- 不要在打印、导出、列表、详情各处再维护一套独立真值；核心字段应有明确真源，快照只用于打印或审计。

## 下一步建议

1. 先在 `192.168.0.106` 上创建 `plush_erp` 并授予当前联调账号权限。
2. 等你把更多合同、材料明细和辅材包材 Excel 发来后，再按上面的首批实体收口 Ent schema。
3. schema 真要落库时，只改 `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/*.go`，然后执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make data
make migrate_apply
```
