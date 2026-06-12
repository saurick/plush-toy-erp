# yoyoosun 日常运维 / Daily Operations Runbook

## 每日

1. 检查 server `/healthz`、`/readyz`。
2. 检查 web `/healthz`。
3. 检查 `docker compose ps` 是否有异常重启。
4. 检查磁盘使用率。
5. 检查最近备份任务状态。
6. 抽查最近错误日志摘要。
7. 检查登录失败异常和未处理异常任务。

## 每周

1. 汇总最近 7 天错误日志和容器重启次数。
2. 检查备份文件 hash 和保留策略。
3. 抽查恢复演练记录。
4. 检查未处理导入 unresolved queue；当前仅限 dry-run / review。
5. 检查任务积压、库存负数、预留过期和审计日志。
6. 检查证书有效期和磁盘增长趋势。

## 每月

1. 执行完整备份恢复演练到隔离环境。
2. 复核权限矩阵和管理员账号。
3. 禁用离职或无效账号。
4. 更新 known limitations。
5. 归档 release evidence 和巡检报告。
6. 复核安全配置：public register、SMS mock、debug seed、debug cleanup、SQL args tracing。

## 清理边界

发布后可清理未被任何容器使用的旧镜像和 build cache：

```bash
docker image prune -a -f
docker builder prune -f
```

禁止执行会删除 volume 的常规清理命令，禁止删除 `/data`、数据库目录、compose `.env`、上传目录、证书目录或运行中容器依赖的镜像。
