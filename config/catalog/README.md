# 客户配置目录索引 / Customer Package Catalog

本目录登记客户配置包允许引用的稳定 key。它是配置包校验和预览的输入，不是运行时 loader，也不替代后端 RBAC、Workflow / Fact usecase、schema 或 migration。

## 当前文件

| 文件 | 用途 | 边界 |
| --- | --- | --- |
| `customerPackageCatalog.mjs` | 登记模块、能力、页面、字段、责任池、策略和命令 key | 只做配置包 lint / preview；不写数据库、不派生权限、不驱动流程 |

## 使用方式

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
```

新增客户配置包前，应先把可复用 key 登记到 catalog，再让客户包引用这些 key；不要在客户包里临时发明 runtime、schema、permission 或 fact 语义。
