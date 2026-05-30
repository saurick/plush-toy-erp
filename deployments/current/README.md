# current Deployment

本目录记录 current 私有化部署实例资料。

当前 Phase 0 不修改 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`，不新增多租户部署，不改变发布流程。

未来可放：

- env 样例和填写说明。
- compose override。
- 备份恢复。
- 发布清单。
- 巡检清单。
- 客户培训和交付记录。

部署边界：

- 当前唯一部署真源仍是 `server/deploy/compose/prod`。
- 低配服务器只负责加载已构建产物、启动服务、执行 migration 和部署后检查。
- Atlas migration 仍使用宿主机 `/usr/local/bin/atlas`。
