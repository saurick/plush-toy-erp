# 毛绒 ERP 初始化框架

状态：in_progress
创建日期：2026-04-20
最后更新：2026-04-20

相关会话索引（至少填一个可复制的入口）：
- deeplink / link：当前本地 Codex 线程

推荐续做指令：
- 会话中断了，继续处理 `docs/changes/plush-erp-bootstrap-init.md` 这次复杂变更，按变更文档续做，并先按 `AGENTS.md` 约定收敛上下文后再实施。

## 1. 背景

- 目标是参考 `trade-erp` 的信息架构，先初始化 `plush-toy-erp` 的项目专属 ERP 框架。
- 用户明确说明：合同、Excel 和更多资料还没到齐；拍照扫码本轮先不做；流程、帮助中心、文档和移动端角色工作台要先放进项目。

## 2. 当前正式真源

- `/Users/simon/projects/plush-toy-erp/AGENTS.md`
- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/system-init.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/operation-playbook.md`

## 3. 本次目标

- 初始化毛绒 ERP 的后台壳层、角色工作台、流程总览、帮助中心、文档页和移动端页面。
- 把管理员登录后的默认入口切换到 ERP 主路由。
- 收口端口口径：后端 `8200`，数据库宿主机映射改到不与 `trade-erp` 冲突的新端口。
- 把已收到的合同、Excel、PDF 和截图先挂到资料准备页，等待后续正式接入。

## 4. 明确不改

- 不引入 `trade-erp` 的外贸业务表与字段联动规则。
- 不实现拍照扫码、PDA、条码枪、图片识别。
- 不实现正式 Excel 导入、合同打印模板与 PDF 坐标填充。
- 不补完整权限矩阵、审批流和利润口径。

## 5. 影响范围

- 前端：`web/src/App.jsx`、`web/src/pages/*`、新增 `web/src/erp/*`
- 后端：`server/configs/*`、`server/deploy/compose/prod/*`、`server/docs/*`、`server/Dockerfile`
- 文档：根 `README.md`、`docs/*`、`web/README.md`、`progress.md`
- 浏览器回归：`web/scripts/styleL1.mjs`

## 6. 风险与边界

- 残值风险：旧的 `/admin-menu` 与“后台说明页”若继续保留，容易被误认成真源；本轮已从路由移除并删除过期页面文件。
- 缺值风险：更多合同和 Excel 尚未到齐，本轮只能初始化资料入口与文档，不能假装正式导入已可用。
- 上下游门禁风险：当前还没落真实业务实体，角色工作台与流程页以静态信息架构为主。
- 旧数据 / 测试数据风险：现有登录与管理员账号链路保留不动，仅改变管理员登录后的默认落点。
- 打印或导出偏移风险：本轮未接打印模板，不存在模板坐标回归。
- 本轮未覆盖盲区：正式 Excel 导入、合同打印、扫码链路、真实业务 CRUD。

## 7. 实施方案

- 方案：
  - 在现有 React + Tailwind 基础上新增 `web/src/erp/`，做项目专属 ERP 壳层。
  - 保留现有登录与鉴权后端，只切换管理员登录后的前端主路由。
  - 通过 `docs/` 与 `web/src/erp/docs/` 同步沉淀正式文档。
  - 统一数据库宿主机端口到 `5435`，避免与 `trade-erp` 冲突。
- 为什么选这个方案：
  - 复杂度最低，且不把 `trade-erp` 的外贸业务模型硬塞到毛绒 ERP。
  - 先把信息架构、文档与移动端入口立住，后续接真实资料更稳。
- 不选其他方案的原因：
  - 直接复制 `trade-erp` 全量前后端会把错误业务真源一并带进来，维护成本高。

## 8. 验收标准

- 功能结果：
  - 管理员登录后进入 ERP 初始化看板。
  - 能访问流程总览、帮助中心、文档页、资料准备页和移动端工作台。
  - 首页和登录页文案已切换到毛绒 ERP 口径。
- 文档同步：
  - README、project-status、web README、changes slug 与新增正式文档同步更新。
- 回归标准：
  - `pnpm style:l1` 覆盖公共首页、管理员登录、ERP 看板、帮助中心、移动端工作台和资料准备页。

## 9. 验证命令

```bash
cd /Users/simon/projects/plush-toy-erp/web && pnpm lint
cd /Users/simon/projects/plush-toy-erp/web && pnpm css
cd /Users/simon/projects/plush-toy-erp/web && pnpm test
cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1
cd /Users/simon/projects/plush-toy-erp/server && go test ./...
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

## 10. 回写目标

- `progress.md`
- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- `/Users/simon/projects/plush-toy-erp/web/README.md`

## 11. 当前进展

- 已完成：
  - 新增 ERP 主路由、流程页、帮助中心、文档页、移动端工作台和资料准备页。
  - 管理员登录后的默认入口改到 `/erp/dashboard`。
  - 新增正式文档与 changes slug。
- 下一步：
  - 完成 README / project-status / web README / runtime 文档同步。
  - 统一后端与数据库端口口径。
  - 跑浏览器回归和最小测试。
- 阻塞 / 风险：
  - 真实合同模板和 Excel 还没到齐，当前只能做结构初始化，不能补正式导入或打印。

## 12. 结果归档

- 最终状态：in_progress
- 实际修改文件：进行中
- 实际执行验证：进行中
- 未验证项：进行中
- 后续待办：
  - 等资料到位后补导入、打印与真实业务保存链路。

