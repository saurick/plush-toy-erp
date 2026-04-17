# QA 脚本说明

本文档只说明当前仓库还在使用的本地脚本和推荐执行顺序。

## 总览

| 脚本 | 主要作用 | 建议时机 |
| --- | --- | --- |
| `scripts/bootstrap.sh` | 安装依赖、启用 hooks、跑快速自检 | 新机器 / 首次拉仓库 |
| `scripts/init-project.sh` | 扫描项目名、默认密钥、部署地址和页面标题残留 | 首次收口后 / 大规模改名后 |
| `scripts/doctor.sh` | 检查本机依赖和 hooks 是否齐全 | 环境初始化 / 异常排查 |
| `scripts/qa/fast.sh` | 高频快速检查 | 日常开发 |
| `scripts/qa/full.sh` | 全量检查 | 提交前 / 推送前 |
| `scripts/qa/strict.sh` | 严格检查 | 发版前 |
| `scripts/qa/db-guard.sh` | 约束 schema 变更必须带 migration | 改数据模型后 |
| `scripts/qa/error-code-sync.sh` | 校验前后端错误码同步 | 改错误码后 |
| `scripts/qa/error-codes.sh` | 阻止业务代码裸写已注册错误码 | 改接口 / 鉴权 / 前端错误处理后 |
| `scripts/qa/shellcheck.sh` | 检查 shell 脚本 | 调整脚本后 |
| `scripts/qa/shfmt.sh` | 统一 shell 格式 | 调整脚本后 |
| `scripts/qa/go-vet.sh` | 执行 Go vet | 改 Go 代码后 |
| `scripts/qa/golangci-lint.sh` | 执行 golangci-lint | 改 Go 代码后 |
| `scripts/qa/yamllint.sh` | 检查 YAML 语法与风格 | 改 YAML 后 |
| `scripts/qa/govulncheck.sh` | 扫描 Go 可达漏洞 | 推送前 / 发版前 |

前端浏览器级样式回归不在 `scripts/qa` 下，统一执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
```

## 推荐顺序

### 1. 初始化环境

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
```

### 2. 清理默认占位

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/init-project.sh
bash /Users/simon/projects/plush-toy-erp/scripts/init-project.sh --project --strict
```

### 3. 日常开发检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

前端样式任务额外执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

### 4. 提交前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

## 关键说明

### `bootstrap.sh`

- 安装 `web` 和 `server` 依赖
- 安装 Git hooks
- 默认执行一次 `scripts/qa/fast.sh`

### `init-project.sh`

- 检查项目名、服务名、镜像名、页面标题
- 检查默认密码、JWT 密钥、数据库名、远端主机等占位值
- 检查当前仓库是否误引入不需要的部署目录

### `doctor.sh`

- 检查 `git`、`node`、`pnpm`、`go`
- 检查 `gitleaks`、`shellcheck`、`golangci-lint`、`yamllint`、`shfmt`、`govulncheck`
- 检查 hooks 和关键脚本是否可执行

### `fast.sh`

- 前端：`pnpm lint && pnpm css`
- 后端：优先执行 `go test ./internal/... ./pkg/...`
- 错误码同步和魔法数字检查

### `full.sh`

- 包含 `fast.sh`
- 补充更完整的 shell、Go、YAML 和 secrets 检查

## Hook 对应关系

- `pre-commit` -> `scripts/git-hooks/pre-commit.sh`
- `pre-push` -> `scripts/git-hooks/pre-push.sh`
- `commit-msg` -> `scripts/git-hooks/commit-msg.sh`
bash scripts/qa/full.sh
```

- pre-push 默认以 `SECRETS_STRICT=1` 执行此脚本
- 若定义了前端 `test`，会在 `full` 中一并执行，但它仍然属于仓库级 QA 全量检查，不替代样式/布局任务的浏览器级回归。

## 16) loadtest

```bash
bash scripts/loadtest/run.sh mixed
```

- 提供最小 `k6` 压测能力，覆盖 `health`、`system`、`auth`、`mixed` 四类场景。
- 默认结果落到 `server/deploy/lab-ha/artifacts/loadtest/<run-id>/`。
- 详细用法见 `/Users/simon/projects/plush-toy-erp/scripts/loadtest/README.md` 与 `/Users/simon/projects/plush-toy-erp/server/deploy/lab-ha/docs/LOAD_TEST.md`。
- 执行顺序：
  - `db-guard` -> `error-code-sync` -> `error-codes` -> `secrets` -> `govulncheck`（默认提示模式）
  - web：`lint -> css -> (若定义 test 则执行) -> build`
  - server：`go test ./... -> make build`
- 适合在提交前/推送前做最终兜底检查。
- 若本轮确实触达前端样式链路，应在 `full` 之外补跑 `cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1`，因为 `full` 不会自动打开浏览器验证 box 模型与重定向页面。

## 16) strict

```bash
bash scripts/qa/strict.sh
```

- 在 `full` 基础上追加严格规则：
  - `eslint --max-warnings=0`
  - `stylelint --max-warnings=0`
  - 默认运行 `shellcheck + shfmt(check) + govulncheck(strict)`
- 适合发版前或主分支合并前执行。

## 17) commit-msg

```bash
printf "chore(hooks): 校验提交信息\n" > /tmp/commit-msg.txt
bash scripts/git-hooks/commit-msg.sh /tmp/commit-msg.txt
```

- 标题模式：
  - `type(scope): subject`
  - 或 `type: subject`
- 允许类型：
  - `feat|fix|chore|docs|refactor|test|ci|build|perf|style`
- 自动放行：`Merge`、`Revert`、`fixup!`、`squash!`

## 版本锁定

- 根目录 `.n-node-version` 用于约束 Node 版本（`n auto` 会优先读取）。
- 建议执行：`n auto` 后再运行 QA 脚本。

## `-h/--help`

上述脚本均支持 `-h/--help`，可直接在终端查看脚本说明。

示例：

```bash
bash scripts/qa/strict.sh --help
```
