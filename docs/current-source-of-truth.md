# 当前真源与交接顺序

本文档只解决一件事：当前这份仓库到底应该先读哪里，才能避免把历史占位、现场猜测或过期文档误当成真源。

## 真源原则

- 运行时行为的最终真源始终是代码。
- 仓库级约定、部署边界和项目基线，以当前文档为索引，再分流到对应子目录文档。
- 当前部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。
- 当前仓库没有 `lab-ha`、Kubernetes 和 dashboard 主路径；不要按不存在的目录做推断。

## 按任务分流

### 1. 日常开发或代码修改

先读：

- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/AGENTS.md`
- `/Users/simon/projects/plush-toy-erp/server/README.md`
- `/Users/simon/projects/plush-toy-erp/scripts/README.md`

### 2. 部署、运行或配置问题

先读：

- `/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/README.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/README.md`

### 3. 收口、改名或默认配置清理

先读：

- `/Users/simon/projects/plush-toy-erp/docs/project-status.md`
- `/Users/simon/projects/plush-toy-erp/scripts/README.md`

然后执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

## 新开对话最小交接格式

```text
先读：
- /Users/simon/projects/plush-toy-erp/README.md
- [本轮必须先读的正式文档]
- [本轮必须先读的代码]

任务：
[一句话说明目标]

当前唯一真源：
[哪个文件 / 哪段实现 / 哪份文档才是当前真源]

不要碰：
[过期实现 / 临时脚本 / 非当前主路径]

验收：
1. [结果]
2. [边界状态]
3. [必须执行的命令]
```
