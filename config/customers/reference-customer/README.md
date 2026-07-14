# 标准样例客户配置 / Reference Customer Config

本目录是新增甲方时使用的中性工程参考，不是真实客户配置、生产部署实例或可直接激活的默认 revision。

## 当前接入

| 内容 | 当前层级 | 边界 |
| --- | --- | --- |
| `customerPackage.mjs` | 可 lint、可编译为受控 runtime manifest | raw package 保持 draft / preview-only；不直接 publish、activate 或写业务事实 |
| `fieldPolicyOverrides` | 正式字段投影合同 | 仅隐藏供应商列表和 CSV 中的低风险“供应商类型”；不改变表单、后端校验或数据真源 |
| `workPoolRoleOverrides` | 正式责任池投影合同 | 展示小团队可把销售评审责任交给既有业务角色；不能增加后端权限 |
| 采购 / 加工合同抬头 | effective session 投影 | 只提供虚构买方默认值；供应商、明细和金额仍来自业务单据快照 |
| `customer-config.example.js` / `public-assets/` | 构建期品牌 overlay | 不作为后端授权、菜单权限或业务事实真源 |

所有示例名称、地址和岗位均为虚构内容；本目录不保存真实 Excel、PDF、联系方式、secret、evidence 或业务数据。

## 验证

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer reference-customer
node scripts/qa/customer-config-runtime-manifest.mjs --customer reference-customer --mode preview
node --test scripts/build/apply-customer-web-config.test.mjs
```

后端发布、激活和回滚必须继续走 `customer_config.*` 权限、固定 `ERP_CUSTOMER_KEY`、不可变 revision 和目标环境发布证据门禁。
