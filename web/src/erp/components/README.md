# ERP 组件 / ERP Components

本文是 `web/src/erp/components/` 的目录入口。前端整体结构、登录、主题和构建说明仍先看 [web/README.md](../../../README.md)；业务对象、状态和事实边界仍以当前代码、后端 usecase、JSON-RPC、正式产品 / 架构文档和测试为准。

## 目录职责

`web/src/erp/components/` 放 ERP 桌面后台的共享壳层、业务列表组件、领域表单 / 列配置、打印工作台和 Workflow 动作抽屉。组件负责展示、收集输入、调用既有 action 或 hook；不在前端补造库存、出货、质检、财务或 Workflow 事实。

## 主要分组

| 分组             | 典型路径                                                                       | 职责                                                           |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 页面壳和通用展示 | `ERPLayout.jsx`、`CommandCenterNav.jsx`、`PageHero.jsx`、`StatusPill.jsx`      | 布局、导航、页头和状态展示                                     |
| 业务列表共享层   | `business-list/*`                                                              | 列表壳、表单弹窗、附件、明细行、列顺序、协同任务面板和来源选择 |
| 主数据和源单据   | `master-data/*`、`sales-orders/*`、`purchase-orders/*`、`outsourcing-orders/*` | 领域列配置、表单、业务动作面板和来源生成入口                   |
| 事实和质量       | `operational-facts/*`、`quality-inspections/*`、`shipments/*`                  | Operational Fact、质检、出货相关展示和表单入口                 |
| 工程资料和打印   | `bom/*`、`print/*`                                                             | BOM 头 / 明细、打印模板工作台和纸面预览                        |
| Workflow 动作    | `workflow/*`                                                                   | 任务动作抽屉和提交前解释合同消费                               |

## 边界

- 共享组件改动默认按影响面评估：触达 `business-list/*`、`ERPLayout.jsx`、打印壳或通用状态展示时，至少检查受影响页面和 `style:l1` 场景。
- 领域组件可以隐藏未完成入口，但不能在前端本地补造后端事实、状态流转或权限结论。
- 列配置、表单默认值、来源选择、导出 / 打印字段涉及业务字段链路时，必须检查新建、编辑、切换来源、清空来源、列表、详情、打印 / 导出和旧数据回补路径。
- 打印组件只负责预览和模板渲染；打印留档、合同事实、采购 / 委外 / 出货 / 财务状态仍由后端和正式文档定义。
- Workflow 组件只消费 `explain_action_access`、`explain_task_assignment` 和受控 action API；不能重新直连 raw workflow 写入口或把 task done 当成 Fact posted。

## 修改后验证

按影响面选择最小命令：

```bash
node --test web/src/erp/components/operational-facts/OperationalFactForms.test.mjs
node --test web/src/erp/utils/businessLineItems.test.mjs
node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs
pnpm --dir web css
git diff --check
```

如果改动共享列表、表单弹窗、打印壳、移动可见入口或布局样式，应补对应浏览器级回归，例如：

```bash
STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1
```
