# 毛绒 ERP 初始化框架

状态：in_progress  
创建日期：2026-04-20  
最后更新：2026-04-21

相关会话索引：

- 当前本地 Codex 线程

## 1. 本轮目标

这一轮不再停留在初始化壳层，而是开始根据真实 PDF、Excel、报表截图内容，把毛绒工厂 ERP 的桌面后台、移动端、流程、字段真源、数据模型、导入设计和帮助中心做实。

## 2. 当前正式真源

- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/config/seedData.mjs`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/*`

## 3. 本轮新增引用的真实资料

- `/Users/simon/Downloads/永绅erp/原文件/9.3加工合同-子淳.pdf`
- `/Users/simon/Downloads/永绅erp/原文件/26029#夜樱烬色才料明细表2026-1-19.xlsx`
- `/Users/simon/Downloads/永绅erp/原文件/26204#抱抱猴子材料明细表2026-4-10.xlsx`
- `/Users/simon/Downloads/永绅erp/原文件/加工 成慧怡.xlsx`
- `/Users/simon/Downloads/永绅erp/原文件/辅材、包材 成慧怡.xlsx`
- `/Users/simon/Downloads/永绅erp/原文件/plush_factory_formal_report_v3_mobile.pdf`
- `/Users/simon/Downloads/永绅erp/原文件/Weixin Image_20260420164444_2155_288.png`

## 4. 本轮已确认的关键结论

1. 当前至少存在四层编号体系：
   - 客户 / 订单编号
   - 产品订单编号 / 客户订单号
   - 款式编号（26029# / 26204#）
   - 产品编号 / SKU（24594 / 25481 等）
2. 当前数据库虽然已经存在 `plush_erp` 并执行过迁移，但正式业务表仍未开始，只能视为账号基线。
3. 主料 BOM 真源来自 `材料分析明细表`，辅材 / 包材是真正独立的采购导入源。
4. 加工合同 PDF 是业务单据 + 打印快照 + 条款快照 + 附件图样的组合，不是普通采购单替代。
5. 桌面后台必须继续保持一个入口；移动端必须按角色拆六个入口和六个端口。
6. 拍照扫码、PDA、条码枪、图片识别虽然在汇报材料里出现过，但本轮统一标记 deferred。

## 5. 本轮明确不改

- 不照搬 `trade-erp` 的外贸业务表
- 不把未确认字段直接固化进 Ent schema
- 不拆多个仓库
- 不把桌面后台拆成多个站点
- 不假装拍照扫码已经完成

## 6. 实施结果

### 文档

- 基于真实资料重写主流程文档
- 输出字段真源对照表
- 输出首批正式数据模型建议
- 输出 Excel / PDF 导入映射草案

### 前端

- 桌面后台继续保持一个入口，但新增角色切换、角色默认工作台、角色过滤菜单和角色化帮助中心
- 新增 6 个角色移动端入口与端口矩阵：
  - 老板 `5186`
  - 跟单 `5187`
  - 采购 `5188`
  - 生产 `5189`
  - 仓库 `5190`
  - 财务 `5191`
- 共享层继续复用同一个 React 项目、同一个 Vite 仓库、同一个后端 `8200`

### 数据库

- 本轮没有开始改 Ent schema
- 原因：编号体系、客户主档和结算单据样本仍未稳定

## 7. 影响范围

- 根文档：`README.md`、`docs/plush-erp-initialization.md`、`docs/plush-erp-operation-flow.md`、`docs/plush-erp-data-model.md`
- 前端文档：`web/README.md`、`web/src/erp/docs/*`
- 前端配置：`web/src/erp/config/seedData.mjs`、`web/src/erp/config/docs.mjs`、`web/src/erp/config/appRegistry.mjs`
- 前端页面：`web/src/erp/pages/*`、`web/src/erp/mobile/*`、`web/src/pages/Home/index.jsx`
- 构建入口：`web/vite.config.mjs`、`web/vite.mobile-*.config.mjs`、`web/vite.shared.mjs`、`web/package.json`

## 8. 风险与盲区

- `订单编号 / 产品订单编号 / 客户订单号` 的层级关系仍待继续确认
- `产品名称 / 款式名称 / 部件名称` 仍需要更多样本确认分层
- 当前还没有正式结算单 / 对账单样本
- `partner` 主档里的客户编码和供应商敏感字段还没稳定
- 移动端虽然拆出多入口，但当前仍是前端静态 / 半静态角色页，尚未接真实接口

## 9. 下一步建议

1. 继续补客户订单、出货单、结算单样本。
2. 先确认编号关系，再决定是否开始 Ent schema 与 migration。
3. 再把桌面角色页和移动端入口逐步接到真实接口与保存链路。

## 10. 验证命令

```bash
cd /Users/simon/projects/plush-toy-erp/web && pnpm lint
cd /Users/simon/projects/plush-toy-erp/web && pnpm css
cd /Users/simon/projects/plush-toy-erp/web && pnpm test
cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1
```
