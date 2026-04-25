import React from 'react'
import { Link } from 'react-router-dom'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import HelpCenterDocLinks from '../components/HelpCenterDocLinks'
import HelpCenterSectionDirectory from '../components/HelpCenterSectionDirectory'
import PageHero from '../components/PageHero'
import {
  businessMainlineDocGroups,
  documentationCards,
  helpCenterAdvancedDocItems,
  helpCenterPrimaryNavItems,
  helpCenterQaDocItems,
  helpCenterReadingPath,
  helpCenterRoleNavGroups,
  portMatrix,
} from '../config/seedData.mjs'

const helpQuickStartRows = [
  {
    key: 'flow',
    intent: '查看整体流程',
    entry: 'ERP 流程图总览',
    docKey: 'help-operation-flow-overview',
  },
  {
    key: 'guide',
    intent: '学怎么操作',
    entry: 'ERP 操作教程',
    docKey: 'help-operation-guide',
  },
  {
    key: 'role',
    intent: '查角色怎么协作',
    entry: '角色协同链路',
    docKey: 'help-role-collaboration-guide',
  },
  {
    key: 'mobile',
    intent: '手机端处理任务',
    entry: '手机端角色流程',
    docKey: 'help-mobile-role-guide',
  },
]

const helpFaqItems = [
  {
    key: 'mobile-no-task',
    question: '手机端看不到任务怎么办？',
    answer:
      '先确认登录账号有没有勾选当前移动端角色权限，再看任务是不是分配给这个角色池。仍然看不到时，让管理员用业务链路调试核对 owner_role_key、任务状态和是否已完成。',
  },
  {
    key: 'cannot-finish-for-others',
    question: '为什么我不能替别人点完成？',
    answer:
      '任务代表“现在轮到谁处理”。跨角色代点会让责任、时间和异常原因失真，所以只能由当前角色池处理；需要转交时应阻塞或退回，再由对应角色接住。',
  },
  {
    key: 'blocked-reason',
    question: '任务阻塞要填什么？',
    answer:
      '填写能让下一位同事继续处理的信息：卡在哪、缺什么资料、等谁回复、预计什么时候能继续。不要只写“有问题”或“待确认”。',
  },
  {
    key: 'shipment-finance',
    question: '出货后为什么还要财务登记？',
    answer:
      '出货完成只说明货物动作完成，财务还要登记应收、开票和对账状态，老板才能看到发货后的回款风险。',
  },
  {
    key: 'inbound-not-balance',
    question: '入库完成为什么不等于库存余额已经准确？',
    answer:
      '当前 v1 先记录入库、检验和业务状态，还没有独立库存余额和库存流水专表。入库完成能说明流程走到仓库节点，但不代表已经做完整库存核算。',
  },
  {
    key: 'deferred',
    question: '为什么有些功能显示 deferred？',
    answer:
      'deferred 表示当前明确先不做，常见于 PDA、条码枪、图片识别、完整财务专表等。这样写是为了避免把还没上线的能力误当成可用功能。',
  },
  {
    key: 'pmc-or-boss',
    question: '什么时候找 PMC，什么时候找老板？',
    answer:
      '流程卡点、排产、催办、缺料和跨部门推进先找 PMC；优先级、重大延期、费用风险和是否放行这类决策问题再找老板。',
  },
  {
    key: 'print-field',
    question: '打印模板字段不对应该看哪里？',
    answer:
      '先看“打印 / 合同 / 快照口径”，确认字段来自业务真源还是打印快照；如果是字段带值、残值或缺值问题，再看“ERP 字段联动口径”。',
  },
]

function findPrimaryDoc(docKey) {
  return helpCenterPrimaryNavItems.find((item) => item.key === docKey)
}

function DocInlineLinks({ items = [] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.filter(Boolean).map((item) => (
        <Link
          key={item.key}
          to={item.path}
          className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/20"
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}

function HelpTable({ minWidth = 'min-w-[760px]', columns = [], children }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10">
      <table className={`${minWidth} w-full border-collapse text-left text-sm`}>
        <thead className="bg-white/[0.06] text-xs uppercase tracking-[0.16em] text-slate-300">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-slate-200">
          {children}
        </tbody>
      </table>
    </div>
  )
}

function HelpQuickStartSection() {
  return (
    <SurfacePanel className="p-5" id="help-quick-start">
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-50">新手先看</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            普通业务用户先从这 4 个入口理解系统，不需要先看
            Schema、状态字典或调试报告。
          </div>
        </div>
        <HelpTable columns={['你想做什么', '去哪里', '推荐文档']}>
          {helpQuickStartRows.map((row) => {
            const doc = findPrimaryDoc(row.docKey)

            return (
              <tr key={row.key} className="align-top">
                <td className="px-4 py-3 font-semibold text-slate-50">
                  {row.intent}
                </td>
                <td className="px-4 py-3">{row.entry}</td>
                <td className="px-4 py-3">
                  <DocInlineLinks items={doc ? [doc] : []} />
                </td>
              </tr>
            )
          })}
        </HelpTable>
      </div>
    </SurfacePanel>
  )
}

function HelpReadingPathSection() {
  return (
    <SurfacePanel className="p-5" id="help-reading-path">
      <div className="space-y-4">
        <div className="text-lg font-semibold text-slate-50">推荐阅读路径</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {helpCenterReadingPath.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className="hover:bg-cyan-300/8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40"
            >
              <div className="text-base font-semibold text-slate-50">
                {item.title}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {item.summary}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SurfacePanel>
  )
}

function HelpRoleWorkSection() {
  return (
    <SurfacePanel className="p-5" id="help-role-work">
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-50">
            按角色找工作
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            先按自己的角色看“主要工作”和“任务来源”，再进入对应业务页或手机端处理。
          </div>
        </div>
        <HelpTable
          minWidth="min-w-[1080px]"
          columns={[
            '角色',
            '主要工作',
            '任务来源',
            '推荐入口',
            '推荐文档',
            '端侧说明',
          ]}
        >
          {helpCenterRoleNavGroups.map((row) => (
            <tr key={row.key} className="align-top">
              <td className="px-4 py-3 font-semibold text-slate-50">
                {row.role}
              </td>
              <td className="px-4 py-3">{row.mainWork}</td>
              <td className="px-4 py-3">{row.taskSource}</td>
              <td className="px-4 py-3">{row.recommendedEntry}</td>
              <td className="px-4 py-3">
                <DocInlineLinks items={row.docs} />
              </td>
              <td className="px-4 py-3 text-slate-300">{row.endpointNote}</td>
            </tr>
          ))}
        </HelpTable>
      </div>
    </SurfacePanel>
  )
}

function HelpBusinessFlowSection() {
  return (
    <SurfacePanel className="p-5" id="help-business-flow">
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-50">
            按业务主线查
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            这里保留 6 条 v1
            主干闭环，帮助业务角色快速判断谁发起、谁处理、完成后去哪。
          </div>
        </div>
        <HelpTable
          minWidth="min-w-[1040px]"
          columns={[
            '业务主线',
            '发起',
            '处理角色',
            '完成后去哪',
            '当前边界',
            '相关文档',
          ]}
        >
          {businessMainlineDocGroups.map((group) => (
            <tr key={group.key} className="align-top">
              <td className="px-4 py-3 font-semibold text-slate-50">
                {group.title}
              </td>
              <td className="px-4 py-3">{group.initiator}</td>
              <td className="px-4 py-3">{group.handlers}</td>
              <td className="px-4 py-3">
                <div>{group.nextStep}</div>
                <div className="mt-1 text-xs text-slate-400">
                  异常找：{group.exceptionOwner}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-300">{group.boundary}</td>
              <td className="px-4 py-3">
                <DocInlineLinks items={group.items} />
              </td>
            </tr>
          ))}
        </HelpTable>
      </div>
    </SurfacePanel>
  )
}

function HelpFaqSection() {
  return (
    <SurfacePanel className="p-5" id="help-faq">
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-50">常见问题</div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            先按业务动作排查，确实需要查字段、状态或验收记录时再进入高级文档。
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {helpFaqItems.map((item) => (
            <div
              key={item.key}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="text-base font-semibold text-slate-50">
                {item.question}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SurfacePanel>
  )
}

function HelpDocGroup({ title, summary, items = [], defaultOpen = false }) {
  return (
    <details
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-base font-semibold text-slate-50">
        {title}
      </summary>
      <div className="mt-2 text-sm leading-6 text-slate-300">{summary}</div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.path}
            className="rounded-2xl border border-white/10 bg-slate-950/20 px-3 py-2 text-sm leading-6 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
          >
            <span className="font-semibold text-slate-50">{item.label}</span>
            <span className="ml-2 text-slate-400">{item.description}</span>
          </Link>
        ))}
      </div>
    </details>
  )
}

function HelpAdvancedDocsSection() {
  return (
    <SurfacePanel className="p-5" id="help-advanced-docs">
      <div className="space-y-4">
        <div>
          <div className="text-lg font-semibold text-slate-50">
            高级文档 / 管理员 / 开发验收
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            给管理员、实施、开发和验收人员使用；普通业务角色建议先看上方新手、角色和业务主线。
          </div>
        </div>
        <HelpDocGroup
          title="全部正式文档"
          summary="保留完整文档入口，但降低视觉权重，避免普通业务用户一进首页就被技术目录淹没。"
          items={[
            ...helpCenterPrimaryNavItems,
            ...documentationCards.map((card) => ({
              key: card.key,
              label: card.title,
              path: card.path,
              description: card.summary,
            })),
          ]}
          defaultOpen
        />
        <HelpDocGroup
          title="管理员 / 高级文档"
          summary="字段口径、状态字典、Schema 草案、打印快照和当前边界仍保留，只从高级区域进入。"
          items={helpCenterAdvancedDocItems}
        />
        <HelpDocGroup
          title="开发与验收入口"
          summary="验收总览、业务链路调试、协同任务调试、字段联动覆盖、运行记录和专项报告仍归开发与验收模块管理。"
          items={helpCenterQaDocItems}
        />
      </div>
    </SurfacePanel>
  )
}

export default function HelpCenterPage() {
  const mobileAppCount = portMatrix.filter(
    (app) => app.kind === 'mobile'
  ).length
  const desktopUsageNotes = [
    '普通业务用户先看新手、角色和业务主线，不需要先读 Schema、SQL 或调试文档。',
    `${mobileAppCount} 个移动端角色按端口直接访问，手机端只处理任务、阻塞、完成和反馈。`,
    '管理员、实施、开发和验收人员再进入高级文档，正式文档仍完整保留。',
  ]
  const headings = [
    { id: 'help-quick-start', title: '新手先看' },
    { id: 'help-reading-path', title: '推荐阅读路径' },
    { id: 'help-role-work', title: '按角色找工作' },
    { id: 'help-business-flow', title: '按业务主线查' },
    { id: 'help-faq', title: '常见问题' },
    { id: 'help-advanced-docs', title: '高级文档 / 开发验收' },
  ]

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="帮助中心"
        title="业务操作导航"
        description="帮助中心优先回答我是谁、我要做什么、在哪个端处理、单据怎么流转和异常找谁；技术口径和验收资料保留在高级区域。"
        actions={
          <>
            <Link className="erp-primary-button" to="/erp/docs/operation-guide">
              先看操作教程
            </Link>
            <Link
              className="erp-secondary-button"
              to="/erp/docs/operation-flow-overview"
            >
              查看流程总览
            </Link>
            <a className="erp-secondary-button" href="#help-role-work">
              按角色找工作
            </a>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <HelpCenterSectionDirectory headings={headings} />
          <SurfacePanel className="p-5">
            <div className="space-y-3">
              <div className="text-lg font-semibold text-slate-50">
                首页使用原则
              </div>
              <div className="space-y-2">
                {desktopUsageNotes.map((item) => (
                  <div
                    key={item}
                    className="bg-cyan-300/8 rounded-3xl border border-cyan-300/20 px-4 py-3 text-sm leading-6 text-cyan-50"
                  >
                    {item}
                  </div>
                ))}
              </div>
              <HelpCenterDocLinks currentPath="/erp/help-center" />
            </div>
          </SurfacePanel>
        </div>

        <div className="grid gap-4">
          <HelpQuickStartSection />
          <HelpReadingPathSection />
          <HelpRoleWorkSection />
          <HelpBusinessFlowSection />
          <HelpFaqSection />
          <HelpAdvancedDocsSection />
        </div>
      </div>
    </div>
  )
}
