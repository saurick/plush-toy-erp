# web 前端说明

## 当前结构

当前前端不是“一个桌面站点 + 一个通用移动壳层”，而是：

- 桌面后台：单入口
- 移动端：按角色拆成六个入口
- 仍然共享同一个 React 项目、同一个 common / ui / api / 文档层

## 目录结构（简版）

| 路径          | 职责                                                                |
| ------------- | ------------------------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数                         |
| `src/erp/`    | 毛绒 ERP 桌面后台、移动端入口、角色工作台、流程页、帮助中心、文档页 |
| `src/pages/`  | 公共首页、登录、注册、管理员登录                                    |
| `scripts/`    | 浏览器级样式回归脚本                                                |
| `build/`      | 构建产物，不作为业务真源                                            |

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

- 公共首页
- 管理员登录
- 未登录访问桌面后台的重定向
- 桌面全局驾驶舱
- 桌面角色工作台
- 帮助中心
- 移动端多入口总览
- 资料与字段真源页

## 当前前端边界

- 桌面后台继续只保留一个入口
- 移动端按角色拆入口和端口，但不拆第二个仓库
- 拍照扫码、PDA、条码枪、图片识别继续 deferred
- 当前先做角色页面、文档、帮助中心和信息结构，尚未接真实业务保存链路
