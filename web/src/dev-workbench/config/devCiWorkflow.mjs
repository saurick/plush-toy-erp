export const CI_WORKFLOW_SECTIONS = Object.freeze([
  {
    key: 'overview',
    label: '从提交到部署',
    description:
      '主路径机制说明；实际通过状态、耗时和发布资格仍读取对应提交与目标的证据。',
    chart: `flowchart TD
      A["本地提交与推送前检查"] --> B["推送 GitLab main"]
      B --> C["plan：确定范围与身份"]
      C --> E["准备依赖并运行质量检查"]
      E --> G["汇总同一提交的证据与 CI Gate"]
      G --> H["显式发布不可变制品"]
      H --> I["准备并确认目标部署"]
      I --> J["执行部署并读回目标证据"]
      B -. "单向镜像" .-> K["GitHub：只读审查"]`,
    points: [
      '推送触发 CI；制品发布和目标部署各有独立入口与确认。',
      'CI 证据绑定同一提交；缓存用于准备依赖，发布制品用于固定已验证版本。',
      '目标环境直接加载制品，运行检查、备份和回滚点分别保留证据。',
    ],
  },
  {
    key: 'parallel',
    label: 'Job 并行、汇总与等待',
    description:
      '按领域展示 main push 的分组机制；具体 Job 和依赖展开本次流水线的真实 DAG 核对。',
    chart: `flowchart TD
      P["plan → prepare"] --> N["Node、资源<br/>静态与安全"]
      P --> W["Web 检查<br/>构建与汇总"]
      P --> S["Server 检查<br/>分片与汇总"]
      W -->|"Web 制品"| B["浏览器执行与汇总"]
      S -->|"两个库任务清理"| B
      N --> A["七个领域回执总聚合"]
      W --> A
      S --> A
      B --> A
      A --> G["CI Gate"]`,
    points: [
      '前置依赖满足后进入就绪队列，实际启动还取决于 Runner 空槽和资源锁。领域完成即可汇总，不要求同阶段所有 Job 一起结束。',
      '浏览器需要同一提交的 Web 构建制品，并等待升级与关键 PostgreSQL Job 清理结束，避免 Docker 网络拆除干扰本机请求。',
      '汇总核对各分片回执、身份和清理结果。并行任务耗时不能相加成流水线总耗时。',
    ],
  },
  {
    key: 'resources',
    label: '四层并发与共享资源',
    description:
      '配置规则说明；当前槽位、参数和资源锁须按对应 Runner 与 CI 配置核对。',
    chart: `flowchart TD
      A["多条 Pipeline"] --> B["共用 Runner 就绪队列"]
      B --> C["Job 槽位：concurrent / limit"]
      C --> D["单个 Job 内部执行"]
      D --> E["Go 运行并发<br/>GOMAXPROCS"]
      D --> F["Go 包构建并发<br/>GOFLAGS -p"]
      D --> G["Node 测试文件<br/>并发"]
      H["资源锁、隔离与清理"] -. "约束执行资格和顺序" .-> D`,
    points: [
      '流水线之间共用总槽位；新提交可取消旧流水线中可中断的任务，清理仍须完成。',
      'Job 槽位控制同时承接的任务数。Go 运行并发、包构建并发和 Node 测试文件并发分别控制内部执行。语言参数不是整台服务器的 CPU 硬配额。',
      '多个 Job 仍共享 CPU、内存和磁盘。提高并发可能缩短等待，也可能增加争用和耗时波动。',
      'prepare 是依赖缓存的唯一写入者，分片只读；数据库、端口、浏览器沙箱与输出按任务隔离，浏览器资源组约束跨流水线重叠。',
    ],
  },
  {
    key: 'delivery',
    label: '制品发布、部署与恢复',
    description:
      '发布和部署的操作顺序说明；本图不表示任一目标已完成发布或运行核验。',
    chart: `flowchart TD
      A["核对同一提交的 CI Gate"] --> B["显式发布：构建一次并冻结制品"]
      B --> C["迁移、运行与备份恢复演练"]
      C --> D["登记不可变 Release"]
      D --> E["选择固定版本与目标"]
      E --> F["准备部署：身份、制品、容量与恢复点"]
      F --> G["确认部署"]
      G --> H["备份、向前迁移、加载制品与启动"]
      H --> I["health / ready 与业务 smoke 读回"]
      I -. "需要恢复时" .-> J["检查并确认正式回滚"]`,
    points: [
      '固定提交的 CI 证据、不可变 Release、目标运行与恢复证据分别核对。',
      '普通部署保留业务数据；测试数据清空重建是独立动作。',
      '发布使用目录资源锁串行保护不可变版本；目标部署沿用各自的备份、附件、数据库与回滚点。',
    ],
  },
])

export function buildCiJobTimeline(jobs = []) {
  const rows = jobs
    .flatMap((job) => {
      if (job.status !== 'completed') {
        return []
      }
      const start =
        typeof job.startedAt === 'string' ? Date.parse(job.startedAt) : NaN
      const end =
        typeof job.finishedAt === 'string' ? Date.parse(job.finishedAt) : NaN
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return []
      }
      return [{ ...job, start, end }]
    })
    .sort((a, b) => a.start - b.start || a.id - b.id)
  if (!rows.length) {
    return { rows: [], excludedCount: jobs.length, spanMs: null, peak: null }
  }
  const origin = Math.min(...rows.map((row) => row.start))
  const end = Math.max(...rows.map((row) => row.end))
  const spanMs = end - origin
  const events = rows
    .filter((row) => row.end > row.start)
    .flatMap((row) => [
      { at: row.start, delta: 1 },
      { at: row.end, delta: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.delta - b.delta)
  let active = 0
  let peak = 0
  for (const event of events) {
    active += event.delta
    peak = Math.max(peak, active)
  }
  return {
    rows: rows.map((row) => ({
      ...row,
      offsetMs: row.start - origin,
      elapsedMs: row.end - row.start,
      leftPercent: spanMs ? ((row.start - origin) / spanMs) * 100 : 0,
      widthPercent: spanMs ? ((row.end - row.start) / spanMs) * 100 : 0,
    })),
    origin: new Date(origin).toISOString(),
    excludedCount: jobs.length - rows.length,
    spanMs,
    peak,
  }
}
