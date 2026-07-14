# 中性 demo 客户配置 / Demo Customer Config

本目录保存中性演示客户配置包，用于验证客户配置包 lint、compile、runtime manifest 和构建期品牌 overlay 不是永绅 `yoyoosun` 单客户硬编码。

当前边界：

- `demo` 只用于本地 / dev / test 的配置包结构验证和预览。
- 不代表真实生产客户，不是 SaaS tenant，不新增 `tenant_id`。
- 不包含真实客户原始资料、secret、SQL、Go、JavaScript 或业务数据行。
- 不 publish、不 activate、不 rollback，不执行真实导入，不写数据库。
- 不改变后端 RBAC、Workflow / Fact usecase、schema、migration 或 release evidence。

## 当前文件

| 文件 | 用途 | 边界 |
| --- | --- | --- |
| `customerPackage.mjs` | 中性 demo 客户配置包草案，覆盖 4 条 preview workflow、4 条业务流、3 个状态机和 3 个流程策略；可选 `moduleStates` 仅用于编译后端 `module_states` 输入并校验 catalog / reason 边界 | 只服务 `customer-package-lint` 与 `customer-config-runtime-manifest` 本地验证；不执行模块安装 / 卸载，不代表完整模块关闭已 ready |
| `customer-config.example.js` / `public-assets/` | 中性构建 overlay smoke | 不承载客户业务差异，不替代后端 effective session |

## 校验命令

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer demo
node scripts/qa/customer-package-lint.mjs --customer demo --mode compile
node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode preview
```
