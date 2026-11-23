# 标准样例客户配置 / Reference Customer Config

[客户草稿 JSON 模板](customer-draft.template.json)维护新客户的默认配置。模板中的空数组、空对象表示沿用产品默认值，`hiddenItemKeys: []` 表示沿用产品默认菜单。此目录的工程样例另外保留了几个可测试的客户差异。

<a id="new-customer-draft"></a>

## 新建客户草稿 / New Customer Draft

1. 在本机开发服务打开「交付运维 → 客户配置」，点页头「从模板新建草稿」。
2. 弹窗可下载当前 JSON 模板。只填写客户标识和客户名称，标识最多 32 个字符，由小写字母、数字和连字符组成。点击「创建并检查」后生成 `config/customers/<customer-key>/customerPackage.json` 并登记到 `customerPackageEntries`。名称、客户配置和菜单默认值均存入这份 JSON。
3. 在新草稿的「检查配置」核对包结构，再打开「核对变化」和「预览界面」。已使用的客户标识会保留原文件。提交结果不明确时，可以用相同的标识和名称重试，已完成的相同草稿会直接打开。

### 在仓库维护草稿 / Workspace Files

后续差异维护在该客户的 `customerPackage.json`，确认依据记在同目录的 `README.md`。检查脚本和工作台通过同一登记读取草稿。

| 配置 | 有客户差异时 | 默认值 |
| --- | --- | --- |
| 客户与包身份 | 新建时填客户标识和名称。生成器从标识派生目录名和 `<customer-key>-package`。 | 草稿沿用样例的预览保护。 |
| 品牌与菜单 | 菜单隐藏项在 JSON 的 `desktopMenu.hiddenItemKeys` 中记录。 | `label` 用作品牌名称。其他品牌样式和菜单使用产品默认。 |
| 个人信息告知 | 正式交付前核对并填写客户确认的主体、联系渠道、存储、适用版本、日期及服务商。 | 草稿使用通用告知预览。 |
| 模块、岗位与列表 / CSV 列 | 按确认结果填写 `moduleStates`、`roleProfiles`、`fieldPolicyOverrides`。只读或关闭模块时填写原因。 | 模块按目录默认启用，岗位能力和列可见性沿用产品默认。 |
| 责任与流程 | 从 `runtimeProcessSelections` 选择已登记的流程变体，可用 `workPoolRoleOverrides` 设置有差异的责任归属。 | 沿用既有责任配置。客户流程变体按显式选择编译。 |
| 合同打印默认方 | 使用采购或委外合同抬头时，在 `printTemplateDefaults` 填已确认的甲方名称及适用的公开联络信息。 | 按业务单据取供应商、明细和金额。 |

1. 在仓库根目录执行原有检查，把 `acme-toys` 换成实际客户标识。输出应显示该客户的 `customer package validate ok` 和 `customer config runtime manifest preview ok`。

   ```bash
   customer=acme-toys
   GIT_OPTIONAL_LOCKS=0 node scripts/qa/customer-package-lint.mjs --customer "$customer"
   GIT_OPTIONAL_LOCKS=0 node scripts/qa/customer-config-runtime-manifest.mjs --customer "$customer" --mode preview
   ```

2. 在「预览界面」查阅 JSON 草稿的客户名称、菜单和字段。如需在 ERP 前端查看品牌与菜单，可按下列命令启动同一客户的独立预览服务。正式配置按发布门禁生效。

   ```bash
   GIT_OPTIONAL_LOCKS=0 BROWSER=none ERP_DEV_CUSTOMER_KEY="$customer" pnpm --dir web start:frontend-only --isolated
   ```

## 工程样例的配置差异

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
cd "$(git rev-parse --show-toplevel)"
node scripts/qa/customer-package-lint.mjs --customer reference-customer
node scripts/qa/customer-config-runtime-manifest.mjs --customer reference-customer --mode preview
node --test scripts/build/apply-customer-web-config.test.mjs
```

后端发布、激活和回滚必须继续走 `customer_config.*` 权限、固定 `ERP_CUSTOMER_KEY`、不可变 revision 和目标环境发布证据门禁。
