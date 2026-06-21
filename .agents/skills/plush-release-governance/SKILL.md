---
name: plush-release-governance
description: Project-specific release, deployment, version, migration, rollback, and release-evidence governance for plush-toy-erp. Use when Codex plans, performs, reviews, or explains plush-toy-erp releases, deploys, version tags, image tags, migrations, release notes, changelog, rollback, production preflight, health checks, post-deploy verification, or target environment delivery.
---

# Plush Release Governance

Use this skill for plush-toy-erp release, deployment, and lightweight version governance. Version management is part of release evidence unless the project later needs a standalone customer-facing release program.

## Truth Chain

- Read project `AGENTS.md`, `README.md`, deployment docs, test strategy, and changed release scripts before action.
- Check worktree and upstream before commit/push/deploy.

## Project Rules

- 低配服务器只加载本地/CI 构建产物，不在目标机执行 docker build / pnpm build / go build。
- 当前唯一部署真源是 `server/deploy/compose/prod`；Atlas 线上 migration 使用宿主机 `/usr/local/bin/atlas` 和 `flock`。
- 版本证据至少绑定 commit hash、image tag、migration 状态、目标环境、健康检查和回滚点。

## Workflow

1. Define scope: target branch, target host/environment, service/container, migration, config/env, and rollback point.
2. Bind version: commit hash, image/package tag, migration status, config/env version, and release note/changelog need.
3. Run local/CI validation appropriate to changed surfaces before touching a target environment.
4. Build artifacts off low-spec targets unless project docs explicitly allow target-side build.
5. Deploy using the documented path; confirm the target is running the new version from runtime evidence.
6. Check health/ready, logs, smoke/browser/API evidence, migration state, and disk/image cleanup boundaries.
7. Update progress/docs when release behavior, versioning, deployment, config, or operational truth changes.

## Output

Report commit/tag/image, target environment, migration status, commands, health/smoke evidence, rollback point, cleanup, docs/progress updates, and remaining blind spots.
