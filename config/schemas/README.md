# 客户配置 Schema / Customer Package Schemas

本目录保存客户配置包的声明结构和校验规则。它只服务 lint、preview 和人工评审，不是 Ent schema、Atlas migration、JSON-RPC contract 或 runtime loader。

## 当前文件

| 文件 | 用途 | 边界 |
| --- | --- | --- |
| `customerPackageSchema.mjs` | 定义客户包必备 section、允许节点类型、禁止目标和 preview 输出形态 | 不生成数据库结构，不接后端，不接真实导入 |

## 校验入口

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
```

如果后续需要把外部上传包改成 JSON/YAML 文件，应先在这里扩展 schema，再补 lint 和 preview；不要让客户包携带 JS/Go/SQL/secret 或原始客户资料。
