import React, { useEffect, useState } from 'react'
import { Button, Progress, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Tabs from '@/common/components/navigation/SlidingTabs'
import DevPageHeader from './DevPageHeader.jsx'
import Select from '@/common/components/select/AppSelect'
import SearchInput from '@/common/components/SearchInput'
import Table from '@/common/components/table/AppTable'
import {
  WorkbenchEmpty,
  WorkbenchFacts,
  WorkbenchNotice,
  WorkbenchReading,
  WorkbenchSection,
  WorkbenchToolbar,
} from './WorkbenchPattern.jsx'
import '../styles/dev-workbench-standards.css'
import BusinessFlowDiagram from './flow-state/BusinessFlowDiagram.jsx'

import { WorkflowTaskDiscoveryCatalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { buildFulfillmentSubflow } from '../config/devFulfillmentSubflow.mjs'

const PATTERNS = [
  {
    key: 'directory',
    label: '目录与检索',
    task: '找到需要的条目，并查看判断依据。',
    composition: '范围与筛选 → 结果表 → 行内详情',
    acceptance:
      '输入关键词、清除筛选、展开一项；工具栏不跳动，关闭详情后仍在原结果中。',
  },
  {
    key: 'execution',
    label: '执行与诊断',
    task: '明确执行范围，处理阻断，再核对运行结果。',
    composition: '范围与主动作 → 当前结果 / 第一失败 → 阶段与历史',
    acceptance:
      '范围与执行按钮同组；运行中不能重复启动，失败原因常显，修复后可主动重试。',
  },
  {
    key: 'evidence',
    label: '结果与核验',
    task: '比较各项结果，找出缺口，追溯对应证据。',
    composition: '来源与时间 → 分项结果 → 对应依据与后续动作',
    acceptance:
      '区分通过、未采集、历史和读取失败；刷新时不把上次结果当成本次通过，缺口有处理入口。',
  },
  {
    key: 'reading',
    label: '阅读与关系',
    task: '理解当前主题与关联关系。',
    composition: '主题选择 → 当前解释 → 关联关系',
    acceptance:
      '目录持续可选，正文与短说明在相邻位置查看；当前主题保留，正文无需跨页拼接。',
  },
]
const STATES = [
  { value: 'ready', label: '正常' },
  { value: 'loading', label: '首次读取' },
  { value: 'empty', label: '无数据' },
  { value: 'error', label: '读取失败' },
  { value: 'stale', label: '历史 / 待核实' },
]
const GATES = [
  {
    key: 'web',
    name: '页面与浏览器',
    risk: '按钮不可用、切换丢失上下文',
    trigger: '页面或共享组件变化',
    evidence: '默认、操作、恢复与边界场景；对应版本和浏览器实测记录。',
  },
  {
    key: 'data',
    name: '数据库合同',
    risk: '迁移失败、历史数据不一致',
    trigger: '数据库结构或数据规则变化',
    evidence: '隔离库升级、实际存量审计与迁移回执，不能用空库测试代替。',
  },
  {
    key: 'security',
    name: '权限与安全',
    risk: '越权操作、敏感资料外露',
    trigger: '权限、接口或数据范围变化',
    evidence: '允许与拒绝路径、脱敏与审计记录；前端隐藏不构成授权。',
  },
]

function ReadState({ state, onRecover }) {
  if (state === 'loading') {
    return (
      <WorkbenchNotice
        tone="loading"
        title="正在读取当前范围"
        description="范围和操作位置保持不变，取得结果后原位显示。"
      />
    )
  }
  if (state === 'error') {
    return (
      <WorkbenchNotice
        tone="error"
        title="读取失败，当前结果尚未核实"
        description="检查连接后重新读取；失败不会自动触发执行。"
        action={<Button onClick={onRecover}>重新读取</Button>}
      />
    )
  }
  if (state === 'stale') {
    return (
      <WorkbenchNotice
        tone="warning"
        title="这是上次记录，不能证明当前状态"
        action={<Button onClick={onRecover}>重新核对</Button>}
      />
    )
  }
  return null
}

function renderDirectoryEvidence(row) {
  return <span>{row.evidence}</span>
}

function DirectoryExample({ state, onRecover }) {
  const [query, setQuery] = useState('')
  const rows = ['loading', 'empty', 'error'].includes(state)
    ? []
    : GATES.filter((row) => `${row.name}${row.risk}`.includes(query))
  return (
    <WorkbenchSection
      title="门禁目录"
      description="按改动风险找到应运行的检查。"
    >
      <WorkbenchToolbar actions={<span>{rows.length} 项</span>}>
        <SearchInput
          value={query}
          allowClear
          placeholder="搜索门禁或风险"
          searchHint="搜索样板门禁"
          onSearch={setQuery}
        />
      </WorkbenchToolbar>
      <ReadState state={state} onRecover={onRecover} />
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: '门禁', dataIndex: 'name', width: 160 },
          { title: '防什么问题', dataIndex: 'risk' },
          { title: '什么时候运行', dataIndex: 'trigger' },
        ]}
        expandable={{ expandedRowRender: renderDirectoryEvidence }}
        locale={{
          emptyText: (
            <WorkbenchEmpty
              title={
                state === 'error' || state === 'loading'
                  ? '尚未取得目录'
                  : query
                    ? '没有匹配结果'
                    : '当前范围暂无记录'
              }
              description={
                query ? '调整关键词或清除搜索后继续查找。' : undefined
              }
            />
          ),
        }}
      />
    </WorkbenchSection>
  )
}

function ExecutionExample({ state, onRecover }) {
  const [scope, setScope] = useState('strict')
  const [run, setRun] = useState('idle')
  const [failure, setFailure] = useState(true)
  useEffect(() => {
    setRun('idle')
  }, [state])
  const running = run === 'running'
  return (
    <WorkbenchSection
      title="本机诊断"
      footer="本地诊断、固定提交的 CI、部署读回和客户验收各自留证。"
    >
      <WorkbenchToolbar
        actions={
          <>
            <Button
              type="primary"
              disabled={running || ['loading', 'error'].includes(state)}
              onClick={() => setRun('running')}
            >
              运行演示诊断
            </Button>
            {running ? (
              <Button onClick={() => setRun('cancelled')}>取消运行</Button>
            ) : null}
          </>
        }
      >
        <Select
          aria-label="样板诊断范围"
          label="诊断范围"
          value={scope}
          allowClear={false /* 不可清空：执行必须指定诊断范围。 */}
          disabled={running}
          onChange={setScope}
          options={[
            { value: 'strict', label: '严格诊断' },
            { value: 'full', label: '完整诊断' },
          ]}
        />
      </WorkbenchToolbar>
      <ReadState state={state} onRecover={onRecover} />
      {['loading', 'error'].includes(state) ? null : running ? (
        <>
          <WorkbenchNotice
            tone="loading"
            title="正在检查页面与浏览器"
            description="执行范围已锁定；可取消或继续查看本次记录。"
          />
          <Progress percent={60} aria-label="演示诊断进度" />
          <Button onClick={() => setRun(failure ? 'failed' : 'passed')}>
            模拟本阶段完成
          </Button>
        </>
      ) : run === 'failed' ? (
        <WorkbenchNotice
          tone="error"
          title="第一失败：浏览器检查未通过"
          description="页面在读取失败后没有重试入口。修正后需要重新运行，旧记录不会自动变成通过。"
          action={
            <Button
              onClick={() => {
                setFailure(false)
                setRun('idle')
              }}
            >
              模拟修正问题
            </Button>
          }
        />
      ) : run === 'passed' ? (
        <WorkbenchNotice
          tone="success"
          title="本次演示诊断通过"
          description="对应当前演示范围；未推断服务器 CI 或目标环境已通过。"
        />
      ) : (
        <WorkbenchEmpty
          title={
            run === 'cancelled'
              ? '运行已取消'
              : state === 'empty'
                ? '尚无诊断记录'
                : '已就绪，等待执行'
          }
          description="选择范围后运行；这里只改变演示状态。"
        />
      )}
      <WorkbenchFacts
        items={[
          {
            label: '执行范围',
            value: scope === 'strict' ? '严格诊断' : '完整诊断',
          },
          { label: '运行位置', value: '本机 · 演示数据' },
        ]}
      />
    </WorkbenchSection>
  )
}

function EvidenceExample({ state, onRecover }) {
  const [expanded, setExpanded] = useState(false)
  const rows = [
    { key: 'ci', name: '固定提交 CI', value: '检查完成', result: '通过' },
    {
      key: 'runtime',
      name: '目标环境运行',
      value: '目标版本待读回',
      result: '未核实',
    },
    {
      key: 'acceptance',
      name: '客户验收',
      value: '尚未取得签收',
      result: '未采集',
    },
  ]
  const pending = ['loading', 'error', 'empty', 'stale'].includes(state)
  return (
    <WorkbenchSection
      title="服务器证据核验"
      tools={
        <Button disabled={state === 'loading'} onClick={onRecover}>
          重新核对
        </Button>
      }
      footer="每项结论只适用于对应来源和版本；CI 通过不等于已部署或已验收。"
    >
      <WorkbenchFacts
        items={[
          { label: '来源', value: '演示服务' },
          { label: '版本', value: '示例版本 A' },
          { label: '证据时效', value: pending ? '待核实' : '本次读取' },
        ]}
      />
      <ReadState state={state} onRecover={onRecover} />
      <Table
        rowKey="key"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: '检查项', dataIndex: 'name', width: 160 },
          {
            title: '当前结果',
            key: 'status',
            width: 120,
            render: (_, row) => (
              <Tag
                color={
                  !pending && row.result === '通过' ? 'success' : undefined
                }
              >
                {pending
                  ? state === 'stale'
                    ? '历史记录'
                    : '未取得'
                  : row.result}
              </Tag>
            ),
          },
          {
            title: '依据与缺口',
            key: 'value',
            render: (_, row) =>
              pending ? '当前证据尚未取得或重新核实' : row.value,
          },
        ]}
      />
      <Button
        type="link"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '收起证据说明' : '查看证据说明'}
      </Button>
      {expanded ? (
        <WorkbenchSection
          flat
          title="证据说明"
          headingLevel={3}
          description="固定提交的检查回执、目标环境版本和客户签收是三种独立证据。缺少哪一项，就回到对应入口补齐。"
        />
      ) : null}
    </WorkbenchSection>
  )
}

function ReadingExample({ state, onRecover }) {
  const [topic, setTopic] = useState('ci')
  const [graphNode, setGraphNode] = useState('inspect')
  const businessFlow = buildFulfillmentSubflow(
    WorkflowTaskDiscoveryCatalog.fulfillment_flow.find(
      (step) => step.stage === 'shell_quality'
    )
  )
  const topics = {
    ci: {
      title: 'CI 证明什么',
      body: 'CI 检查固定提交的代码与合同。需要同时核对提交版本、必需检查和完整回执。',
      relation: '提交版本 → 必需检查 → 对应回执',
      next: '目标环境读回',
    },
    deploy: {
      title: '目标环境读回',
      body: '部署后读取目标实际版本、迁移状态和冒烟结果；版本与运行状态须相互对应。',
      relation: '部署制品 → 目标运行版本 → 运行核验',
      next: 'CI 证明什么',
    },
  }
  const current = topics[topic]
  return (
    <WorkbenchSection title="证据边界说明">
      <WorkbenchReading
        label="阅读主题"
        value={topic}
        onChange={setTopic}
        items={Object.entries(topics).map(([value, item]) => ({ value, label: item.title }))}
      >
        <ReadState state={state} onRecover={onRecover} />
        {state === 'empty' ? (
          <WorkbenchEmpty
            title="此主题暂无资料"
            action={<Button onClick={onRecover}>返回已有主题</Button>}
          />
      ) : ['loading', 'error'].includes(state) ? null : (
        <WorkbenchSection
          flat
          title={current.title}
          headingLevel={3}
          description={current.body}
        >
          <p className="erp-workbench-standards__relation">
            {current.relation}
          </p>
          <Button
            type="link"
            onClick={() => setTopic(topic === 'ci' ? 'deploy' : 'ci')}
          >
            关联阅读：{current.next}
          </Button>
          <details className="erp-dev-disclosure">
            <summary>共享业务图样板</summary>
            <BusinessFlowDiagram
              flow={businessFlow}
              label="共享皮套检验样板"
              selectedKey={graphNode}
              onSelect={setGraphNode}
            />
            <p>
              {businessFlow.nodes.find((node) => node.key === graphNode)?.label}
              ：节点点击只选中；跨环节查看使用明确入口。
            </p>
          </details>

        </WorkbenchSection>
      )}
      </WorkbenchReading>
    </WorkbenchSection>
  )
}

const EXAMPLES = {
  directory: DirectoryExample,
  execution: ExecutionExample,
  evidence: EvidenceExample,
  reading: ReadingExample,
}

export default function DevWorkbenchStandards() {
  const [params, setParams] = useSearchParams()
  const pattern =
    PATTERNS.find((item) => item.key === params.get('pattern')) || PATTERNS[0]
  const state = STATES.some((item) => item.value === params.get('sampleState'))
    ? params.get('sampleState')
    : 'ready'
  const Example = EXAMPLES[pattern.key]
  const update = (key, value) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set(key, value)
      if (key === 'pattern') next.delete('sampleState')
      return next
    })
  return (
    <section
      className="erp-workbench-standards"
      aria-label="效能工作台统一设计"
    >
      <DevPageHeader
        title={<h2>页面样板</h2>}
        navigation={
          <Tabs
            aria-label="工作台页面类型"
            activeKey={pattern.key}
            onChange={(value) => update('pattern', value)}
            items={PATTERNS.map(({ key, label }) => ({ key, label }))}
          />
        }
      >
        <span className="erp-workbench-standards__note">仅改变演示状态</span>
      </DevPageHeader>
      <WorkbenchToolbar
        actions={
          <Select
            aria-label="样板状态"
            label="状态"
            value={state}
            allowClear={false /* 不可清空：状态演示必须指定一种状态。 */}
            options={STATES}
            onChange={(value) => update('sampleState', value)}
          />
        }
      >
        <span>{pattern.task}</span>
      </WorkbenchToolbar>
      <div className="erp-workbench-standards__body">
        <section
          className="erp-workbench-standards__example"
          aria-label={`${pattern.label}样板`}
        >
          <Example
            key={pattern.key}
            state={state}
            onRecover={() => update('sampleState', 'ready')}
          />
        </section>
        <aside
          className="erp-workbench-standards__guide"
          aria-label="样板使用与验收"
        >
          <WorkbenchSection
            flat
            title="组织顺序"
            headingLevel={3}
            description={pattern.composition}
          />
          <WorkbenchSection
            flat
            title="核对任务是否能完成"
            headingLevel={3}
            description={pattern.acceptance}
          />
          <details className="erp-dev-disclosure">
            <summary>共享实现与设计约定</summary>
            <p>
              WorkbenchSection 组织标题、动作与结果；WorkbenchToolbar
              将范围与任务动作靠左成组，刷新与收起等工具放右侧；WorkbenchFacts 表达身份；WorkbenchNotice
              表达结果、阻断与恢复；WorkbenchEmpty 区分空结果。
            </p>
          </details>
        </aside>
      </div>
    </section>
  )
}
