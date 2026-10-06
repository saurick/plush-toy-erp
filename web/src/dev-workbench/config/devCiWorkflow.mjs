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
    key: 'commit',
    label: '提交前：快照与检查',
    description:
      '提交检查读取暂存快照；开发期 affected 读取所选改动范围。下表描述当前脚本职责，未读取本机 hooks 配置或执行回执，不能据此判定已启用、已执行或通过。',
    chart: `flowchart TD
      A["核对 HEAD、index 与改动范围"] --> B["核对 hooks 配置"]
      B --> C["选择验证并完成精确暂存"]
      C --> D["提交触发 pre-commit"]
      D --> E["导出同一份 index 快照"]
      E --> F["基础合同与敏感信息检查"]
      F --> G["按暂存路径检查 Shell、Go、YAML 等"]
      G --> H{"检查通过？"}
      H -->|"否"| I["修复后重新暂存和验证"]
      H -->|"是"| J["commit-msg 校验后形成提交"]`,
    points: [
      '先读取 HEAD、index、index.lock 与 scoped diff，区分本轮改动、其他改动和未跟踪文件。活动或归属不明的锁保留现场。',
      'core.hooksPath 应指向 .githooks，文件还必须存在且可执行。仓库有 hook 文件不等于当前 checkout 已启用；缺失时按 scripts/setup-git-hooks.sh 修复配置并重新核对。',
      '开发阶段按 affected 计划完成同名测试及 required follow-ups。计划只表示要检查什么，生成计划不代表已执行；full 推荐也不能用短检查绿色代替。',
      'pre-commit 在一次性 index 快照中检查，未暂存的修复不属于提交。失败后核对暂存内容，避免工作区通过而实际提交仍旧。',
      '当前提交 hook 没有 Web ESLint / Stylelint。修改前端时应在开发验证中补齐相关 lint；这个缺口不会因流程图存在而消失。',
    ],
    table: {
      headers: ['顺序 / 输入', '实际检查与成功信号', '失败时先查'],
      rows: [
        ['暂存 diff', 'git diff --cached --check；检查空白和补丁格式', '错误位置是否属于暂存版本，是否混入其他改动'],
        ['index 快照', 'checkout-index 后执行 gate-profiles 的 index-transition 校验', '必需文件是否遗漏、删除或丢失可执行位'],
        ['数据库与公共错误码', 'db-guard、error-code-sync、暂存错误码检查', 'schema / migration / atlas.sum / 生成码是否同步；静态 guard 不证明存量升级'],
        ['敏感信息', '严格扫描暂存内容；工具缺失也阻断', '脱敏定位后修正源文件；不得用关闭扫描通过'],
        ['按路径选中', 'DEV 页面合同、shfmt、ShellCheck、go vet、golangci-lint、YAML lint', '是否命中触发路径、工具版本和实际检查范围'],
        ['提交消息', 'commit-msg 校验项目提交格式', 'type(scope): 中文摘要；提交授权与推送授权分别核对'],
      ],
    },
    commands: [
      'GIT_OPTIONAL_LOCKS=0 git config --show-origin --get core.hooksPath',
      'GIT_OPTIONAL_LOCKS=0 git -c diff.autoRefreshIndex=false diff --cached --check',
      'GIT_OPTIONAL_LOCKS=0 bash scripts/qa/affected.sh --plan --staged',
    ],
    sources: ['scripts/git-hooks/pre-commit.sh', 'scripts/git-hooks/commit-msg.sh', 'scripts/setup-git-hooks.sh', 'scripts/qa/affected.mjs'],
  },
  {
    key: 'coverage',
    label: '提交前与 CI 覆盖对照',
    description:
      '配置职责对照，不是本次执行结果。默认推送目标为单一 origin/main；非标准目标和显式 --full 使用各自正式合同。实际清单来自 affected，实际结果来自同一快照或 SHA 的回执。',
    points: [
      '区分未选中、选中未运行、运行失败、证据过期、仅 CI 执行和当前有效。没有记录不能显示为通过，不适用必须有触发条件依据。',
      '提交 hook、开发期 affected、prepare-push 和 CI 是不同入口。尤其不能把开发期 full 计划当作默认推送前实际执行了 full。',
      '公共契约、权限码、生成文件或源码扫描器变化时，同时核对生产消费者与检测器消费者；同名测试通过不证明相关检查全部被选中。',
      '测试数量只说明本次实际执行规模。缺 summary、零执行或意外 skip 不能变成成功；计划新增检查后旧回执不能继续覆盖。',
    ],
    table: {
      headers: ['检查项', '提交 hook', '默认推送准备', 'GitLab main CI'],
      rows: [
        ['范围 / 源码完整性', '暂存 diff、index 快照与 required 文件', 'clean HEAD/tree、remote/ref/range、gate 指纹', '可信 diff、source archive、同 SHA / plan 身份'],
        ['敏感信息', '严格扫描暂存内容', '严格扫描真实推送历史；hook 再读回', 'plan 可信基线扫描 + Node 领域收口'],
        ['Shell / YAML / Go 静态', '按暂存路径选择相关检查', '短 Node 检查不等价于这些 lint', 'static、shared 与 Server 正式检查'],
        ['Web ESLint / Stylelint', '当前未包含', '当前未包含', 'quality_web_checks 执行'],
        ['Node / Web 单元与合同', '仅命中时执行 DEV 页面治理', '受影响 fast、改动 / 同名 Web 测试和固定边界合同', 'Node 各分组与 Web 全部登记测试'],
        ['权限 / 跨层消费者', '错误码同步等局部合同', '取决于 affected 选测映射；需核对具体清单', 'shared / Node / Web 按正式分组检查'],
        ['schema / migration', 'db-guard 静态预检', '范围与数据库 guard；不执行真实升级', 'make data 零漂移、合成存量升级与关键 PostgreSQL'],
        ['生产构建 / DEV 隔离', '按路径的治理合同', '前端变化补 DEV 边界合同；不构建', 'Web / Server 构建与生产边界'],
        ['真实浏览器 / PDF', '不运行', '不运行', '固定 Chromium、根入口与打印等正式场景；DEV 页面按开发期影响验证'],
        ['资源 / 漏洞 / 最终证据', '不构成完整证据', '不运行高成本分组；只签短期回执', '资源隔离与清理、govulncheck、七领域汇总与 CI Gate'],
      ],
    },
    sources: ['scripts/qa/README.md', 'scripts/qa/affected.mjs', 'scripts/qa/pre-push-receipt.mjs', '.gitlab-ci.yml'],
  },
  {
    key: 'push',
    label: '推送前：短期回执与放行',
    description: 'prepare-push 在连接建立前做准备；pre-push 在 Git 建立连接后按真实 stdin 复核。准备回执只允许推送，不授予 CI 通过或发布资格。',
    chart: `flowchart TD
      A["已授权推送与 clean HEAD"] --> B["fetch 并核对远端 main"]
      B --> C["prepare-push 计算实际范围"]
      C --> D["源码、数据库 guard、历史与 secrets"]
      D --> E["执行选中的短 Node 检查"]
      E --> F["读回身份并签发短期回执"]
      F --> G["普通 push 触发 pre-push"]
      G --> H["真实 stdin、签名、TTL 与指纹复核"]
      H --> I["实时历史与 secrets 检查"]
      I --> J["推送成功后查同 SHA 的 CI"]`,
    points: [
      '远端新增提交必须先处理，不能强推覆盖。脏工作区、混合来源或共享 writer 未结束时，先解决受影响范围，不能用旧候选直接推送。',
      '默认 server-ci 模式保留 affected 风险计划和短 Node 清单，但不运行数据库、浏览器、构建、发布或资源敏感分组。短检查最多 4 个文件并发、整批 120 秒截止；失败或超时不自动重跑。',
      '回执有效期 30 分钟，并绑定 HEAD/tree、remote URL/ref/range、计划、检查清单、工具环境与 gate 指纹。任何身份漂移都需要重新准备。',
      '远端 ref 读取每次最多 20 秒；仅明确瞬态网络错误最多尝试 3 次，权限、仓库与 ref 错误直接失败。不能通过跳过 hook 解决。',
      'pre-push 只消费真实 push stdin，复核有效回执并重跑实时 git-log / secrets；同一有效回执的短 Node 测试不重复执行。新 remote ref、多 ref、其他目标按保守 affected/full 合同处理。',
      '回执失败先记录 reason，再判断修复对象是代码、环境、远端变化或回执过期。不要把重新 prepare、重试失败 Job、修复后新提交混为一件事。',
    ],
    commands: ['bash scripts/qa/prepare-push.sh --help', 'bash scripts/qa/prepare-push.sh'],
    sources: ['scripts/qa/prepare-push.sh', 'scripts/qa/pre-push-receipt.mjs', 'scripts/git-hooks/pre-push.sh'],
  },
  {
    key: 'ci-entry',
    label: '进入 CI：触发、准备与执行',
    description: '普通 protected main push 的路径。MR 使用 plan-driven affected/full；release 和定时打印监测是独立触发分支，不要拿它们的绿色替代普通 push CI。',
    chart: `flowchart TD
      A["GitLab 收到提交"] --> B["workflow 与 Job rules"]
      B --> C["Runner 标签、槽位与资源锁"]
      C --> D["检出源码与 before_script"]
      D --> E["plan：范围、信任与计划"]
      E --> F["prepare：工具条件、依赖与缓存"]
      F --> G["按真实 needs 运行各领域"]
      G --> H["领域回执与清理读回"]
      H --> I["quality_aggregate"]
      I --> J["CI Gate 固化证据包"]`,
    points: [
      '找不到流水线时先核对 remote、ref、SHA 和 pipeline source，再看 workflow.rules；有流水线但没有某 Job 时看该 Job rules。不要直接按测试失败处理。',
      'pending 先看 Runner online、plush / isolated / amd64 标签、protected 资格、空槽与 resource_group。排队时长和执行时长分开判断。',
      '每个 Job 的 before_script 都会核对仓库、默认分支及 Node / Go / pnpm / Docker / Atlas / gitleaks 版本；在 script 前退出属于工具链或环境前置失败。',
      'plan：main push 根据 before SHA 建范围，首次推送用 empty-tree；运行 diff/log 和可信基线 secrets，产出 plan.json、range.txt、trust.json。main 使用 full，MR 按可信 base 使用 affected。',
      'prepare：读 Runner 容量，核对 Chromium sandbox helper 与 sudo policy；锁定 pnpm 依赖、准备受校验 Playwright ZIP、下载 Go 依赖。它是缓存唯一写入者，不代表任何测试通过。',
      '质量执行：各 Job 先核对 exact SHA、计划和所需制品，再执行自己的 lane；分片只读缓存。数据库、端口、浏览器沙箱和输出必须按任务隔离，成功与失败都要清理。',
      '领域汇总核对所有必要分片；quality_aggregate 汇总七类证据、实际执行数、零 skip、构建身份和清理，不靠“某几个 Job 绿了”推断完整覆盖。',
      'CI Gate 将 terminal.json、receipt.json、evidence-manifest.json 固化到 pipeline / job / SHA 对应的 plush-ci-evidence Package。上传失败仍是失败；发布链还要重新读回验证。',
    ],
    table: {
      headers: ['卡住的位置', '应看到的证据', '优先排查'],
      rows: [
        ['未创建 / skipped', '准确的 source、ref、protected 资格及匹配 rules', '.gitlab-ci.yml 的 workflow 与 Job rules；是否误查 release / MR'],
        ['pending / 等待', 'Runner、排队时长、前置 needs、资源锁', 'Runner 标签、protected 限制、空槽；上游失败引起的下游未运行'],
        ['before_script', '工具版本检查逐项通过', '首次失败命令、PATH、工具版本、checkout；测试可能尚未开始'],
        ['plan', 'output/ci/plan.json、range.txt、trust.json', 'before/base SHA 可读、可信扫描配置、diff/log、secrets'],
        ['prepare', 'runner-capacity-observation.json 与 cache=prepared', 'sandbox helper、sudo、锁文件、包源、Playwright Package / 冷种子'],
        ['质量执行 / 汇总', '对应 lane / shard JSON 及同 SHA 产物', '首个实际失败子步骤、缺失回执、执行数、skip、清理结果'],
        ['CI Gate', '同 pipeline/job/SHA 的三个证据资产', 'aggregate 是否完整、Package 权限和上传响应；不可跳过证据上传'],
      ],
    },
    sources: ['.gitlab-ci.yml', 'scripts/qa/ci-plan.mjs', 'scripts/qa/ci-quality-aggregate.mjs'],
  },
  {
    key: 'parallel',
    label: 'Job 并行、汇总与等待',
    description:
      '按领域展示 main push 的分组机制；具体 Job 和依赖展开本次流水线的真实 DAG 核对。',
    chart: `flowchart TD
      P["plan → prepare"] --> N["Node、静态与安全"]
      P --> W["Web 检查<br/>构建与汇总"]
      P --> S["Server 检查<br/>分片与汇总"]
      W -->|"Web 制品"| B["浏览器执行与汇总"]
      S -->|"两个库任务清理"| B
      W --> R["资源合同与运行检查"]
      S --> R
      N --> A["七个领域回执总聚合"]
      W --> A
      S --> A
      B --> A
      R --> A
      A --> G["CI Gate"]`,
    points: [
      '前置依赖满足后进入就绪队列，实际启动还取决于 Runner 空槽和资源锁。领域完成即可汇总，不要求同阶段所有 Job 一起结束。',
      '浏览器需要同一提交的 Web 构建制品，并等待升级与关键 PostgreSQL Job 清理结束，避免 Docker 网络拆除干扰本机请求。',
      '资源敏感 lane 等待 Web 与 Server 领域汇总。四条 Server lane 共用 quality-server-heavy 资源组，图中分支就绪不代表能够同时执行。',
      '汇总核对各分片回执、身份和清理结果。并行任务耗时不能相加成流水线总耗时。',
    ],
  },
  {
    key: 'diagnosis',
    label: '失败排查与 AI 交接',
    description: '先定位真实失败，再修根因和回归检查。当前页只复制已读取的结构化信息；完整日志仍从 GitLab 对应 Job 获取，缺失信息明确保留。',
    chart: `flowchart TD
      A["固定 SHA、Pipeline 与 Job"] --> B["区分未运行与执行失败"]
      B --> C["读取首个实际失败子步骤"]
      C --> D{"失败类型"}
      D --> E["代码、断言或检查漏选"]
      D --> F["工具、网络或资源环境"]
      D --> G["回执、身份或清理不完整"]
      E --> H["最小复现并修复根因"]
      F --> H
      G --> H
      H --> I["补相关回归与前置覆盖"]
      I --> J["新证据复验并保留失败记录"]`,
    points: [
      '同时记录首轮结果、失败 Job 的所有 attempt 和最终结果。修复代码产生新 SHA，不是旧 SHA 重试；最终绿色不能证明第一次就成功，取消也不计为通过。',
      '下游 skipped 往往是上游失败的结果。沿真实 needs 找到首先失败的执行节点；有多个独立失败时分别记录，不能只修最后一行错误。',
      '日志先看首个失败子步骤、退出码、断言的 expected / actual 和附近上下文。超时、OOM、端口冲突与断言失败分别诊断，重试成功不能单独证明根因已修复。',
      '本地复现使用正式的同名测试或 affected 入口。CI 专用 runner 会校验 GitLab 身份，不在本机伪造 CI 环境变量运行。涉及数据库时使用正式隔离生命周期。',
      '可提前发现的确定性错误，需要补选测关系或相关检查。保持权限、安全与数据完整性断言；不要通过删断言、放宽扫描、提高超时或自动重试来隐藏失败。',
    ],
    table: {
      headers: ['现象', '核对证据', '处理与复验'],
      rows: [
        ['普通 commit / push 没有 hook 输出', 'core.hooksPath、hook 可执行位、调用参数', '启用现有 hooks 并读回；单次显式 -c 不保证下次普通命令受保护'],
        ['本地通过、CI lint 失败', '实际暂存 / 提交 SHA、lint 命令及文件范围', '同配置执行受影响 lint；配置变化扩大范围，源码与测试文件一起核对'],
        ['权限 / 生成合同在 CI 才失败', 'affected 短检查清单、生成物及所有消费者', '修选测映射和检测器，新增能在推送前失败的反例'],
        ['数量 / 文案 / digest 断言不一致', '正式目录、行为、锁定版本和 expected / actual', '从真源推导清单；明确必须固定的版本与权限要求仍严格核对'],
        ['浏览器或数据库初始化失败', '同 SHA 构建、运行包、migration、端口和启动日志', '先修初始化与隔离；复验场景和成功 / 失败清理，不能拿静态测试代替'],
        ['超时 / OOM / 子进程未退出', '运行时间窗、Runner 资源、进程组与清理证据', '区分慢检查、争用和泄漏；按实测修资源边界，保留原失败日志'],
        ['汇总失败但测试看起来都绿', '缺失 / 旧 SHA 回执、plan digest、实际执行数、skip 与清理', '修产生错误证据的上游；汇总不补造通过回执，不手改 JSON'],
        ['需要交给 Codex 或人工继续', '本机 HEAD/dirty、CI SHA、Pipeline / Job URL、attempt、来源与缺口', '复制本页排查信息，再补脱敏的完整错误上下文、已复现命令及其结果'],
      ],
    },
    sources: ['scripts/qa/README.md', 'scripts/qa/ci-job-guide.mjs', 'scripts/qa/affected.mjs'],
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

export function formatCiWorkflowSection(section) {
  return [
    section.label,
    section.description,
    ...(section.points || []).map((point, index) => `${index + 1}. ${point}`),
    ...(section.table
      ? [
          section.table.headers.join(' | '),
          ...section.table.rows.map((row) => row.join(' | '))
        ]
      : []),
    ...(section.commands || []),
    `定义来源：${(section.sources || ['.gitlab-ci.yml', 'scripts/qa/README.md']).join('、')}`
  ].join('\n')
}

// Only copy the normalized public projection; raw logs and credential-bearing data stay outside it.
export function buildCiDiagnosticText({ repository, evidence, job } = {}) {
  const pipeline = evidence?.pipeline
  const selectedJobs = job ? [job] : evidence?.jobs || []
  const guides = new Map(
    (evidence?.jobGuides || []).map((guide) => [guide.name, guide])
  )
  const lines = [
    'CI 排查信息（页面已读取证据，非完整日志）',
    `本机 HEAD：${repository?.commit || '未读取'}`,
    `本机工作区：${typeof repository?.dirty === 'boolean' ? (repository.dirty ? '存在未提交改动' : '干净') : '未读取'}`,
    `CI SHA：${evidence?.gitSha || '未读取'}`,
    `CI 证据：${evidence?.status || '未读取'}；覆盖工作区：${evidence?.coversWorkingTree === true ? '是' : '否'}`,
    `Pipeline：${pipeline ? `${pipeline.id} / ${pipeline.status} / ${pipeline.conclusion || '无终态'}` : '无可读记录'}`,
    ...(pipeline?.url ? [`Pipeline URL：${pipeline.url}`] : []),
    '以下命令和说明来自当前工作区；历史 CI 按对应 SHA 的配置与完整日志核对。'
  ]
  for (const item of selectedJobs) {
    const guide = guides.get(item.name)
    const dependencies =
      evidence?.topology?.status === 'available'
        ? evidence.topology.jobs.find(
            (definition) => definition.name === item.name
          )?.needs
        : null
    lines.push(
      '',
      `Job：${item.name} / ${item.id} / ${item.status} / ${item.conclusion || '无终态'}`,
      `执行次数：${item.attemptCount ?? '未读取'}；运行 ms：${item.durationMs ?? '未读取'}；排队 ms：${item.queueMs ?? '未读取'}`,
      `前置依赖：${dependencies ? dependencies.join('、') || '无' : '未读取'}`,
      `日志 URL：${item.url || '未读取'}`,
      ...(guide?.diagnostics
        ? [
            `定义入口：${guide.diagnostics.entry}`,
            `环境要求：${guide.diagnostics.environment}`,
            `证据路径：${guide.diagnostics.evidence.join('、')}`,
            ...guide.diagnostics.triage.map(
              (step, index) => `排查 ${index + 1}：${step}`
            )
          ]
        : ['详细说明：尚未登记'])
    )
  }
  lines.push(
    '',
    '待补证据：首个失败子步骤、退出码、脱敏错误上下文、所有重试 attempt、本地复现命令与结果。',
    '当前终态和已读取的执行次数不能单独推导首次通过率；取消、未运行、缺日志和旧证据不能记为通过。',
    '修复后核对同一候选的相关检查；提交、推送、发布与部署仍按当前任务授权分别执行。'
  )
  return lines.join('\n')
}

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
