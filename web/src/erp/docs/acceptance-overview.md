# 验收结果总览

> 目的：把当前可执行的验收入口、可读取的结构化产物、已知盲区和下一步排查路径集中到一个研发 / 测试入口，避免把帮助中心、脚本和临时聊天结论混在一起。

## 1. 当前结论

- `/erp/qa/acceptance-overview` 已从 Markdown 说明页升级为 React 状态总览页。
- 页面会读取字段联动 latest 报告，并用打印模板目录识别当前打印专项范围。
- 没有稳定 latest 摘要的专项必须显示为待生成或说明边界，不能伪装成通过。
- 业务链路调试仍然是只读排查页，不提供一键造数或链路重建。
- 运行记录和专项报告当前仍以文档、命令和 latest 摘要为主，后续等专项产物稳定后再继续升级为状态卡片。

## 2. 当前总览页读取哪些来源

| 来源                                                   | 当前用途                         | 当前边界                               |
| ------------------------------------------------------ | -------------------------------- | -------------------------------------- |
| `web/public/qa/erp-field-linkage-coverage.latest.json` | 展示字段、场景和失败状态覆盖摘要 | 只代表最近一次本地字段联动专项执行结果 |
| `web/src/erp/config/printTemplates.mjs`                | 识别当前启用的打印模板范围       | 模板存在不等于打印专项已经跑完         |
| `/qa/erp-print.latest.json`                            | 预留打印专项 latest 摘要入口     | 当前不存在时必须显示为待生成           |
| `web/src/erp/utils/businessChainDebug.mjs`             | 提供业务链路调试入口和排查边界   | 只读查询，不造数                       |
| `web/src/erp/docs/qa-run-records.md` / `qa-reports.md` | 承接命令、产物、专项边界         | 当前仍是聚合说明，不替代真实执行结果   |

## 3. 当前推荐验收顺序

1. 先跑前端基础检查：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
```

2. 若改了页面、菜单、表单、打印或布局，再跑浏览器回归：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
```

3. 若改了字段联动、保存转换、合同金额、打印快照或默认样例清值，先刷新字段联动报告：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/erp-field-linkage.mjs
```

4. 若改了合同工作台、在线预览或真实登录链路，再启动后端并跑合同 smoke：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

5. 若改了后端、错误码、迁移、脚本或发布链路，再按影响范围执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

## 4. 当前已知盲区

- 还没有毛绒业务专用的一键调试造数。
- 除字段联动专项外，还没有统一的 `public/qa/*.latest.json` 结构化验收摘要。
- 打印模板当前能识别模板范围，但还没有稳定打印专项 latest 报告。
- 还没有正式 Excel 导入落库、打印留档回写和细分业务专表全链路验收。

## 5. 后续升级条件

满足下列条件后，再把更多专项接成状态卡片：

- 专项能稳定产出结构化摘要，而不是只靠终端日志。
- 摘要能说明通过、失败、跳过和盲区。
- 页面能直接引导到排查入口或重跑命令。
- 结果不会替代帮助中心的正式业务口径。
