# 部署真源约定

## 当前口径

- 当前唯一部署真源：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前仓库只保留 `docker compose` 这一路径，未初始化 `lab-ha`、Kubernetes 和 dashboard
- 如果后续确实需要第二套部署方式，先补文档和目录，再补脚本和发布流程

## 目录职责

### `server/deploy/compose/prod`

- 单机或单宿主机部署入口
- 保留 PostgreSQL、可选 Jaeger、业务容器和线上迁移脚本
- 所有运行时参数优先通过 `.env` 覆盖，不要直接硬改 `compose.yml`

## 单一真源规则

1. 同一环境只保留一条主路径，不额外再并存另一套同级部署脚本
2. 发布、迁移、烟测、文档都围绕 `server/deploy/compose/prod` 收口
3. 若引入新的部署方式，必须同步更新：
   - `README.md`
   - `docs/current-source-of-truth.md`
   - `server/deploy/README.md`
   - 对应脚本和验证命令

## 变更流程

涉及部署改动时，按这个顺序做：

1. 先确认改动是否属于 `server/deploy/compose/prod`
2. 优先修改 `.env.example`、`compose.yml`、发布脚本和对应 README
3. 再执行最小校验
4. 最后同步更新文档

## 最小校验

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml config

cd /Users/simon/projects/plush-toy-erp
bash scripts/project-scan.sh --strict
```

如改动触达发布脚本或应用运行配置，再补：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

## 不要做的事

- 不要在没有明确需求时补回 K8s、Helm 或 `lab-ha`
- 不要把真实密码、JWT 密钥或远端主机写死进仓库
- 不要只改 live 机器或手工命令，而不回收脚本和文档
