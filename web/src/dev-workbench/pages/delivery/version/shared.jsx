import { Alert, Tag, Typography } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import DevCiWorkflowGuide from '../../../components/DevCiWorkflowGuide.jsx'

const { Paragraph, Text, Title } = Typography

export const GIT_INDEX_LOCK_RECOVERY_FLOW = `flowchart TD
  B{"准备暂存或提交：index.lock 是否存在"}
  B -->|否| C["按精确文件或 hunk 写入 index<br/>启用 PID 旁车"]
  B -->|是| D["只读检查 HEAD、当前 index、锁与 PID 旁车"]
  D --> E{"有活动 owner、仓库 Git 进程<br/>或打开句柄吗"}
  E -->|有| F["保留现场<br/>只停止 Git 动作"]
  E -->|没有| G{"现场复核稳定<br/>当前 index 可解析吗"}
  G -->|否| F
  G -->|是| H["识别候选：空、相同、不同或损坏"]
  H --> I["备份当前 index<br/>同盘隔离锁与 PID 旁车<br/>写入恢复回执"]
  I --> J{"HEAD 与当前 index<br/>读回未变吗"}
  J -->|否| F
  J -->|是| K{"候选不同或损坏吗"}
  K -->|是| L["复核隔离候选<br/>与本任务精确暂存范围"]
  K -->|否| C
  L --> C
  C --> M["继续原授权的暂存、提交与推送"]`

export const AUTOMATION_EXECUTION_HANDOFF_FLOW = `flowchart TD
  A["等待其他项目会话结束"] --> B["心跳每 10 分钟只读重查会话与后台 writer"]
  B --> C{"全部结束且写入已停止？"}
  C -->|否| B
  C -->|是| D["先删除本次等待心跳"]
  D --> E{"删除结果已读回为 deleted？"}
  E -->|否| F["停止执行阶段<br/>报告自动化生命周期阻塞"]
  E -->|是| G["同一次续办进入实现、验证、造数与部署"]
  G --> H["执行期间不重建同目的心跳"]
  H --> I["完成后报告结果"]
  I --> J["只有用户再次要求等待<br/>才创建新的心跳"]`

export const MANUAL_TAKEOVER_STEPS = [
  {
    title: '在 Codex 或本地终端固定代码版本',
    description:
      '先完成必要验证与中文提交，再推送 GitLab main，并由镜像任务同步 GitHub；确认工作区干净，且本地 HEAD、GitLab main 都是同一个完整 40 位 SHA。',
    boundary: '本页不创建 commit、不 push，也不代替代码审查。',
  },
  {
    title: '等待 GitLab CI 证明这个 exact SHA',
    description:
      '在 GitLab Pipelines 核对同一 SHA 的 CI Gate 成功；失败、取消、仍在运行或来源不可信时都必须停止。',
    boundary: '本地通过不能替代远端 CI，旧 SHA 的绿色结果也不能复用。',
  },
  {
    title: '生成不可变 Release',
    description:
      '优先回到版本发布页使用“发布当前版本制品”；页面不可用时，才在 GitLab 手动运行受保护的 release pipeline，并填写同一 exact SHA 和新版本号。GitHub 只保留历史 Release 读取，不提供发布入口。',
    boundary: '不要手工创建、移动或覆盖 tag，也不要上传自行拼装的制品。',
  },
  {
    title: '在版本发布页部署已发布版本',
    description:
      '先选择 demo 项目演练造数环境或 test 甲方测试验收环境，再选择已发布版本，依次执行“准备部署”和“确认部署”；系统沿用既有制品校验、备份、数据库迁移、服务启动和公网读回。',
    boundary:
      '两个固定目标都只加载已构建制品，不在目标服务器构建镜像；普通部署默认保留现有业务数据。',
  },
  {
    title: '需要时独立清空并重建 test 数据',
    description:
      '切换到 test 目标，使用“清空并重建测试数据”；该动作固定当前运行的 exact SHA，先独立检查资格，再要求输入完整破坏性确认文本。它不要求先发布新版本。',
    boundary:
      '该动作不嵌入普通部署，也不自动重试；必须保留可恢复备份、恢复校验、旧物理数据代和精确回滚身份。',
  },
  {
    title: '核对结果，必要时走正式回滚',
    description:
      '在操作记录中核对操作 ID、版本、镜像摘要、数据库迁移、服务健康状态、公网 SHA 和浏览器资源；需要恢复时只使用版本行的“检查回滚”和“确认回滚”。',
    boundary:
      'failed、blocked 或 not_proven 先查明回执，不直接重复执行同一写操作。',
  },
]

export const MANUAL_GUIDE_CI_SECTION_PREFIX = 'dev-version-guide-ci-'

export function ManualTakeoverGuide() {
  return (
    <div className="erp-dev-version-takeover-guide">
      <div id="dev-version-guide-ci">
        <DevCiWorkflowGuide
          documentMode
          sectionIdPrefix={MANUAL_GUIDE_CI_SECTION_PREFIX}
        />
      </div>
      <Alert
        type="info"
        showIcon
        message="手动操作仍走同一套固定版本流程"
        description="适用于 AI 暂时不可用或你选择亲自操作；它只解释现有入口，不新增绕过门禁的一键发布、第二套流水线或后台任务。"
      />

      <section aria-labelledby="dev-version-takeover-scope-title">
        <Title level={2} id="dev-version-takeover-scope-title">
          四处操作各管什么
        </Title>
        <div className="erp-dev-version-takeover-scope">
          <article>
            <Text strong>Codex / 本地终端</Text>
            <Text type="secondary">检查改动、运行测试、提交并推送代码</Text>
          </article>
          <article>
            <Text strong>GitLab 代码与 CI</Text>
            <Text type="secondary">代码真源、质量门禁和不可变 Release</Text>
          </article>
          <article>
            <Text strong>GitHub 只读镜像</Text>
            <Text type="secondary">
              供 GPT Review 和外部代码浏览，不重复跑主链 CI
            </Text>
          </article>
          <article>
            <Text strong>版本发布页面</Text>
            <Text type="secondary">看状态、发布制品、部署、回滚和查回执</Text>
          </article>
        </div>
      </section>

      <section aria-labelledby="dev-version-takeover-conditions-title">
        <Title level={2} id="dev-version-takeover-conditions-title">
          先判断能不能继续
        </Title>
        <div className="erp-dev-version-takeover-conditions">
          <article>
            <Tag color="success">可以继续</Tag>
            <ul>
              <li>工作区干净，本地与 origin/main 的完整 SHA 一致</li>
              <li>版本发布页刚刷新且状态真源可读，没有其他未结束操作</li>
              <li>当前 SHA 的 CI、Release 或目标预检已明确通过</li>
            </ul>
          </article>
          <article>
            <Tag color="warning">必须停止</Tag>
            <ul>
              <li>存在未提交改动、SHA 不一致或远端结果属于其他提交</li>
              <li>CI 失败、取消或未完成，manifest、checksum、digest 不完整</li>
              <li>已有操作仍在执行，或结果为 failed、blocked、not_proven</li>
            </ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="dev-version-takeover-automation-title">
        <Title level={2} id="dev-version-takeover-automation-title">
          自动续办怎么交接
        </Title>
        <Paragraph type="secondary">
          等待心跳只负责只读观察。条件满足后，必须先删除并读回本次心跳，再在同一次续办中进入执行阶段，避免等待任务与主执行并发或重复消耗。
        </Paragraph>
        <div className="erp-dev-version-takeover-automation-flow">
          <MermaidDiagram
            chart={AUTOMATION_EXECUTION_HANDOFF_FLOW}
            label="等待心跳移除与执行阶段交接流程"
          />
        </div>
        <Text type="secondary">
          本页只解释生命周期规则，不创建、删除或调度 Codex
          会话与自动化；删除失败时不得开始写入、Git 或部署动作。
        </Text>
      </section>

      <section aria-labelledby="dev-version-takeover-lock-title">
        <Title level={2} id="dev-version-takeover-lock-title">
          Git 索引锁怎么处理
        </Title>
        <Paragraph type="secondary">
          锁是否为空不能判断它还在使用。先识别活动 owner，再保全当前 index
          和旧候选；只有现场稳定且读回未变，才继续原来的 Git 收口。
        </Paragraph>
        <div className="erp-dev-version-takeover-lock-flow">
          <MermaidDiagram
            chart={GIT_INDEX_LOCK_RECOVERY_FLOW}
            label="Git index.lock 检查与恢复流程"
          />
        </div>
        <Text type="secondary">
          候选与当前 index 不同或不可解析时，隔离文件仍会保留；复核精确文件或
          hunk 后沿用已有授权继续，不因“非空锁”重复请求确认。
        </Text>
      </section>

      <section aria-labelledby="dev-version-takeover-steps-title">
        <Title level={2} id="dev-version-takeover-steps-title">
          手动操作顺序
        </Title>
        <ol className="erp-dev-version-takeover-steps">
          {MANUAL_TAKEOVER_STEPS.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <Text strong>{step.title}</Text>
                <Paragraph>{step.description}</Paragraph>
                <Text type="secondary">{step.boundary}</Text>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="dev-version-guide-boundary" aria-label="应急边界与交接">
        <Alert
          type="warning"
          showIcon
          message="应急不等于绕过"
          description="禁止 force push、跳过质量门禁、手工覆盖 tag 或目标页面文件、在目标服务器构建镜像、直接执行结构性 SQL、删除数据库或 volume、全局 prune，以及在结果未证明时盲目重试。"
        />
        <Paragraph type="secondary">
          AI 恢复后，把最终 exact SHA、GitLab pipeline、Release version 和操作 ID
          交给 Codex，即可从现有回执继续核验，无需重做已被可信证明的步骤。
        </Paragraph>
      </section>
    </div>
  )
}
