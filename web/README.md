# web 前端说明

## 当前结构

当前前端不是“一个桌面站点 + 一个通用移动壳层”，而是：

- 桌面后台：单入口
- 移动端：按角色拆成六个端口
- 仍然共享同一个 React 项目、同一个 common / ui / api / 文档层

## 目录结构（简版）

| 路径          | 职责                                                            |
| ------------- | --------------------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数                     |
| `src/erp/`    | 毛绒 ERP 桌面后台、业务页、移动端页面、流程页、帮助中心、文档页 |
| `src/pages/`  | 根路由重定向、登录、注册、管理员登录                            |
| `scripts/`    | 浏览器级样式回归脚本                                            |
| `build/`      | 构建产物，不作为业务真源                                        |

## 启动命令

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认端口：`5175`

### 角色移动端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:all
```

或按角色单独启动：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:boss
pnpm start:mobile:merchandiser
pnpm start:mobile:purchasing
pnpm start:mobile:production
pnpm start:mobile:warehouse
pnpm start:mobile:finance
```

端口矩阵：

| 入口       | 端口   | 说明                                            |
| ---------- | ------ | ----------------------------------------------- |
| 老板移动端 | `5186` | 交期风险、异常、待结算、本周重点                |
| 跟单移动端 | `5187` | 客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警 |
| 采购移动端 | `5188` | 缺料、到料、单价确认、回签、辅材包材确认        |
| 生产移动端 | `5189` | 今日排产、进度回填、延期原因、返工、异常        |
| 仓库移动端 | `5190` | 收货、备料、成品入库、待出货、异常件处理        |
| 财务移动端 | `5191` | 待对账、待付款、异常费用、结算提醒              |

## 构建命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:desktop
pnpm build:mobile:boss
pnpm build:mobile:merchandiser
pnpm build:mobile:purchasing
pnpm build:mobile:production
pnpm build:mobile:warehouse
pnpm build:mobile:finance
```

说明：

- 桌面后台默认输出到 `build/`
- 移动端按入口输出到 `build/mobile-*`
- 后续如果需要不同域名，可以直接绑定不同构建产物

## 当前回归命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 未登录访问桌面后台的重定向
- 桌面任务看板
- 权限管理
- 帮助中心
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台
- 移动端端口说明页
- 资料与字段真源页

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单
- 桌面后台管理员已接入权限管理页；普通管理员按 `menu_permissions` 裁剪桌面菜单可见范围
- 桌面后台已补齐基础资料、销售链路、采购/仓储、生产和财务业务页入口，但当前仍以页面骨架、真源口径和流程说明为主
- 移动端按角色拆端口访问，但不拆第二个仓库
- 模板打印当前统一走一个打印中心，不把合同和汇总模板散在不同页面
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- 当前业务页、移动端页面、文档、帮助中心和模板预览已经齐入口，但尚未接真实业务保存链路
