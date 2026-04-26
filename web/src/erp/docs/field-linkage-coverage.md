# 字段联动覆盖

> 目的：说明字段真源、快照、残值、缺值和打印取值当前如何验收。正式业务口径仍以 `ERP 字段联动口径` 为准。

## 1. 当前结论

- `字段联动覆盖` 已从静态说明升级为覆盖看板，页面读取 `web/public/qa/erp-field-linkage-coverage.latest.json`。
- 覆盖目录真源是 `web/src/erp/qa/fieldLinkageCatalog.mjs`，字段、场景和用例在这里统一登记。
- 生成命令是 `node scripts/qa/erp-field-linkage.mjs`，会运行字段联动专项测试并刷新 latest JSON。
- 当前不开放后端一键执行本地脚本入口，避免把 QA runner 直接暴露成服务端执行能力；需要重跑时在本地命令行执行。

## 2. 当前覆盖重点

| 覆盖方向            | 当前检查方式                                     | 重点风险                                 |
| ------------------- | ------------------------------------------------ | ---------------------------------------- |
| 业务记录保存转换    | `businessRecordForm.test.mjs` + 字段联动 catalog | 明细金额派生、表头合计、状态流转清空字段 |
| 采购 / 加工合同金额 | 合同编辑器测试 + 字段联动 catalog                | 手工金额快照被数量 / 单价变化覆盖        |
| 合并单元格与空白行  | 采购合同、加工合同编辑器测试                     | 被覆盖单元格残值继续参与打印             |
| 打印窗口快照        | `printWorkspace.test.mjs`                        | 刷新或 PDF 输出读取旧窗口状态            |
| 默认样例清值        | 打印模板测试                                     | 未确认的供应商 / 加工商资料被伪造成真值  |

## 3. 当前必跑命令

字段联动专项：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/erp-field-linkage.mjs
```

前端基础回归：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm test
pnpm style:l1
```

涉及错误码时额外执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-code-sync.sh
bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-codes.sh
```

涉及 schema 或迁移时按后端规范执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make print_db_url
make data
make migrate_status
```

## 4. 判断覆盖是否够用

字段链路改动至少回答：

1. 当前唯一真源字段是谁？
2. 是否存在快照字段？
3. 列表、详情、打印、导出、搜索是否读取派生值？
4. 来源切换或清空后旧值是否会残留？
5. 当前表单清空或切换来源后旧输入值是否会残留？
6. 本轮改动是否需要新增 `FL_...` 用例并登记到 `fieldLinkageCatalog.mjs`？

## 5. 当前边界

- latest 报告只代表最近一次本地专项执行结果，不替代业务口径文档。
- 当前字段目录会显式展示未覆盖字段，未覆盖不等于已通过。
- 当前只结构化了字段联动专项；业务链路调试、协同任务调试、运行记录和专项报告其余维度仍按各自页面说明执行。
- 若后续要接后端一键运行，必须先补安全边界和正式文档，再开放服务端 runner。
