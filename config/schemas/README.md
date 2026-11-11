# 客户配置 Schema / Customer Package Schemas

本目录保存客户配置包的声明结构和校验规则。它只服务 lint、preview 和人工评审，不是 Ent schema、Atlas migration、JSON-RPC contract 或 runtime loader。

## 当前文件

| 文件 | 用途 | 边界 |
| --- | --- | --- |
| `customerPackageSchema.mjs` | 定义客户包必备 section、允许节点类型、禁止目标和 preview 输出形态 | 不生成数据库结构，不接后端，不接真实导入 |
| `customerPackageFieldGuide.mjs` | 供工作台读取的通用字段说明，复用 Schema 已声明的枚举、默认和必填项 | 不参与清单内容、版本指纹或运行时校验 |
| `customerPackageFieldTrace.mjs` | 字段、流程选择、策略草案及扩展候选的产物路径和使用位置 | 只供查阅；区分发布 JSON、评审记录、前端部署 JS 和只在源码保留 |

已支持的可配置字段写明用途、取值、缺值行为和影响。通用说明在这里维护一次；客户包只声明自身配置，工作台分别展示默认、候选及其来源。用于预览和控制发布的字段说明使用边界，系统生成的字段标明只读。新增字段时同时核对所属校验和实际消费者。

字段说明需要同时有追溯记录。路径中的 `[]` 表示数组条目，`[*]` 表示按配置标识索引的对象键。清单测试用编译结果和部署 JS 核对路径；清单中有评审记录不表示后端会执行它。修改说明或追溯元数据不会改变清单或配置版本。

## 校验入口

```bash
cd "$(git rev-parse --show-toplevel)"
node scripts/qa/customer-package-lint.mjs --customer yoyoosun
```

如果后续需要把外部上传包改成 JSON/YAML 文件，应先在这里扩展 schema，再补 lint 和 preview；不要让客户包携带 JS/Go/SQL/secret 或原始客户资料。
