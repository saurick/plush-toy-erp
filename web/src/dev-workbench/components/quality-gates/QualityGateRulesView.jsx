import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Space, Tag, Typography } from 'antd'
import Table from '@/common/components/table/AppTable'
import Select from '@/common/components/select/AppSelect.jsx'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import DevTaskNav from '../DevTaskNav.jsx'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  WorkbenchEmpty,
  WorkbenchNotice,
  WorkbenchSection,
  WorkbenchToolbar,
} from '../WorkbenchPattern.jsx'
import {
  QUALITY_GATE_FLOWS,
  QUALITY_GATE_HOOK_GROUPS,
  QUALITY_GATE_HOOK_FILES,
  QUALITY_GATE_RULE_VIEWS,
} from '../../config/devQualityGateGuide.mjs'
import {
  QUALITY_GATE_TEST_GROUP_LABELS,
  QUALITY_GATE_TEST_PAGE_SIZE,
  readQualityGateTestDirectory,
  selectQualityGateTests,
} from '../../config/devQualityGateDirectory.mjs'
import { CI_WORKFLOW_SECTIONS } from '../../config/devCiWorkflow.mjs'
import '../../styles/dev-quality-guide.css'

const { Text, Paragraph } = Typography
const DEFAULT_HOOK = 'scripts/git-hooks/pre-commit.sh'

function Sources({ paths }) {
  return (
    <details className="erp-dev-disclosure">
      <summary>查看代码依据</summary>
      <ul>
        {paths.map((source) => (
          <li key={source}>
            <Text code copyable>
              {source}
            </Text>
          </li>
        ))}
      </ul>
    </details>
  )
}

function FlowReader({ flowKey, selectedNode, onFlow, onNode }) {
  const flow = QUALITY_GATE_FLOWS[flowKey]
  const nodeId = Object.hasOwn(flow.nodes, selectedNode)
    ? selectedNode
    : flow.default
  const node = flow.nodes[nodeId]
  const charts = flow.charts || [{ label: flow.title, chart: flow.chart }]
  const interactiveNodes = useMemo(
    () =>
      Object.entries(flow.nodes).map(([id, item]) => ({
        id,
        label: item.label,
        description: `触发：${item.trigger} 结果：${item.result} 失败处理：${item.failure}`,
      })),
    [flow]
  )
  return (
    <div>
      <DevTaskNav
        compact
        ariaLabel="门禁流程专题"
        items={Object.entries(QUALITY_GATE_FLOWS).map(([value, item]) => ({
          value,
          label: item.label,
        }))}
        value={flowKey}
        onChange={onFlow}
        idPrefix="quality-flow-topic"
      />
      <div
        role="tabpanel"
        id={`quality-flow-topic-panel-${flowKey}`}
        aria-labelledby={`quality-flow-topic-tab-${flowKey}`}
      >
        <WorkbenchSection
          title={flow.title}
          description={flow.description}
          flat
        >
          {charts.map(({ label, chart }) => (
            <div key={label} className="erp-dev-quality-guide__diagram">
              {charts.length > 1 ? <Text type="secondary">{label}</Text> : null}
              <MermaidDiagram
                chart={chart}
                label={label}
                flowchartHtmlLabels={false}
                showSourceOnError={false}
                interactiveNodes={interactiveNodes}
                selectedNodeId={nodeId}
                onNodeSelect={onNode}
              />
            </div>
          ))}
          <section
            className="erp-dev-quality-guide__detail"
            aria-label="门禁节点说明"
            aria-live="polite"
          >
            <div className="erp-dev-quality-guide__detail-heading">
              <Text strong>{node.label}</Text>
              {node.more ? (
                <Button type="link" onClick={() => onFlow(node.more)}>
                  深入查看此流程
                </Button>
              ) : null}
            </div>
            <dl className="erp-dev-quality-guide__fields">
              <div>
                <dt>什么时候运行 / 输入</dt>
                <dd>{node.trigger}</dd>
              </div>
              <div>
                <dt>检查什么</dt>
                <dd>
                  <ul>
                    {node.checks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>结果与失败处理</dt>
                <dd>
                  {node.result}
                  <Paragraph type="secondary">{node.failure}</Paragraph>
                </dd>
              </div>
            </dl>
            <Sources paths={[...new Set([...flow.source, ...node.sources])]} />
          </section>
        </WorkbenchSection>
      </div>
    </div>
  )
}

function HookIndex({ selectedFile, onFile, onFlow, onTest }) {
  const entry = QUALITY_GATE_HOOK_FILES[selectedFile]
  const renderFile = (file) => (
    <Button
      type="link"
      data-quality-hook-file={file}
      aria-pressed={selectedFile === file}
      onClick={() => onFile(file)}
    >
      <code>{file}</code>
    </Button>
  )
  const helpers = Object.keys(QUALITY_GATE_HOOK_FILES).filter(
    (file) =>
      !QUALITY_GATE_HOOK_GROUPS.some((hook) => hook.files.includes(file))
  )
  return (
    <WorkbenchSection
      title="Hook 入口与调用关系"
      description="按文件查职责，按完整过程读流程；这里不表示本机已经启用 Hook 或检查已通过。"
      flat
    >
      <Table
        rowKey="name"
        size="small"
        pagination={false}
        dataSource={QUALITY_GATE_HOOK_GROUPS}
        scroll={{ x: 850 }}
        columns={[
          {
            title: 'Hook / 触发时机',
            key: 'name',
            width: 150,
            render: (_, row) => (
              <>
                <Text strong>{row.name}</Text>
                <div>{row.when}</div>
              </>
            ),
          },
          {
            title: '入口 → 执行文件',
            key: 'files',
            width: 300,
            render: (_, row) => (
              <div className="erp-dev-quality-guide__file-chain">
                {renderFile(row.files[0])}
                <Text type="secondary">↓ 调用</Text>
                {renderFile(row.files[1])}
              </div>
            ),
          },
          {
            title: '检查对象与目的',
            key: 'purpose',
            render: (_, row) => (
              <>
                {row.purpose}
                <div>
                  <Text type="secondary">输入：{row.input}</Text>
                </div>
              </>
            ),
          },
          {
            title: '流程',
            key: 'flow',
            width: 120,
            render: (_, row) => (
              <Button type="link" onClick={() => onFlow(row.files[1])}>
                {row.action}
              </Button>
            ),
          },
        ]}
      />
      <section
        className="erp-dev-quality-guide__detail"
        aria-label="Hook 文件说明"
        aria-live="polite"
      >
        <div className="erp-dev-quality-guide__detail-heading">
          <Text strong>
            <code>{selectedFile}</code>
          </Text>
          {entry.flow ? (
            <Button onClick={() => onFlow(selectedFile)}>进入对应流程</Button>
          ) : null}
        </div>
        <Paragraph>{entry.purpose}</Paragraph>
        <dl className="erp-dev-quality-guide__fields">
          <div>
            <dt>输入与职责</dt>
            <dd>
              {entry.input}
              <Paragraph type="secondary">{entry.kind}</Paragraph>
            </dd>
          </div>
          <div>
            <dt>关键动作</dt>
            <dd>
              <ol>
                {entry.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </dd>
          </div>
          <div>
            <dt>阻断与恢复</dt>
            <dd>{entry.failure}</dd>
          </div>
        </dl>
        {entry.test ? (
          <Space wrap>
            <Text type="secondary">验证该入口本身的测试</Text>
            <Button type="link" onClick={() => onTest(entry.test)}>
              {entry.test} · 定位
            </Button>
          </Space>
        ) : null}
      </section>
      <details
        className="erp-dev-disclosure"
        open={helpers.includes(selectedFile) || undefined}
      >
        <summary>相关准备、范围核验与安装脚本</summary>
        <Table
          rowKey="file"
          size="small"
          pagination={false}
          dataSource={helpers.map((file) => ({
            file,
            ...QUALITY_GATE_HOOK_FILES[file],
          }))}
          columns={[
            { title: '文件', dataIndex: 'file', render: renderFile },
            { title: '职责', dataIndex: 'purpose' },
          ]}
        />
      </details>
    </WorkbenchSection>
  )
}

function TestDirectory({ active, filters, onFilters, selectedFile, onFile }) {
  const { query, group, page } = filters
  const [directory, setDirectory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    readQualityGateTestDirectory({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setDirectory(data)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [active, refresh])
  const groups = useMemo(() => {
    const counts = new Map()
    for (const file of directory?.files || []) {
      counts.set(file.group, (counts.get(file.group) || 0) + 1)
    }
    return [
      {
        value: 'all',
        label: directory
          ? `全部登记与文件（${directory.files.length}）`
          : '全部测试分组',
      },
      ...Array.from(counts, ([value, count]) => ({
        value,
        label: `${QUALITY_GATE_TEST_GROUP_LABELS[value] || `待说明分组：${value}`}（${count}）`,
      })),
    ]
  }, [directory])
  const selection = selectQualityGateTests(directory, { query, group, page })
  const selected = directory?.files.find((file) => file.path === selectedFile)
  return (
    <WorkbenchSection
      title="测试结构与文件目录"
      description="脚本复用正式 Node 分组，Web 复用测试发现器，Go 按 _test.go 文件读取。文件数不是用例数、覆盖率或执行结果。"
      flat
    >
      <WorkbenchToolbar
        actions={
          <Button
            loading={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            刷新测试目录
          </Button>
        }
      >
        <SearchInput
          value={query}
          allowClear
          placeholder="搜索测试名称或路径"
          searchHint="搜索测试名称或路径"
          onSearch={(value) =>
            onFilters((current) => ({ ...current, query: value, page: 1 }))
          }
        />
        <Select
          showSearch
          optionFilterProp="label"
          aria-label="测试分组"
          value={group}
          options={groups}
          onChange={(value) =>
            onFilters((current) => ({ ...current, group: value, page: 1 }))
          }
          className="erp-dev-quality-guide__group"
        />
      </WorkbenchToolbar>
      {error ? (
        <WorkbenchNotice
          tone="error"
          title="测试目录读取失败"
          description={
            directory
              ? '以下为上次读取，当前文件状态尚未核实。'
              : '请确认当前执行端保留可读的源码与测试目录。'
          }
        />
      ) : null}
      {loading && directory ? (
        <WorkbenchNotice tone="loading" title="正在刷新，以下为上次读取。" />
      ) : null}
      {directory?.missingRoots.length ? (
        <WorkbenchNotice
          tone="info"
          title="当前执行端的测试源码不完整"
          description={`缺少 ${directory.missingRoots.join('、')}；未发现不能解释成已经通过。`}
        />
      ) : null}
      {directory ? (
        <Text type="secondary">
          <DevTimestamp value={directory.readAt} action="目录读取于" /> ·
          浏览器场景、构建条件与真实数据库证据按正式 runner 另行核对。
        </Text>
      ) : null}
      <Table
        rowKey="path"
        size="small"
        loading={loading && !directory}
        dataSource={selection.rows}
        scroll={{ x: 640 }}
        pagination={{
          current: selection.page,
          pageSize: QUALITY_GATE_TEST_PAGE_SIZE,
          total: selection.total,
          onChange: (value) =>
            onFilters((current) => ({ ...current, page: value })),
          showSizeChanger: false,
        }}
        locale={{
          emptyText:
            loading || error ? (
              '尚未取得当前测试目录'
            ) : (
              <WorkbenchEmpty
                title="当前范围没有匹配的测试文件"
                action={
                  <Button
                    type="link"
                    onClick={() =>
                      onFilters({ query: '', group: 'all', page: 1 })
                    }
                  >
                    清除筛选
                  </Button>
                }
              />
            ),
        }}
        columns={[
          {
            title: '测试文件',
            dataIndex: 'path',
            render: (file) => (
              <Button type="link" onClick={() => onFile(file)}>
                <code>{file}</code>
              </Button>
            ),
          },
          {
            title: '正式分组',
            dataIndex: 'group',
            width: 160,
            render: (value) =>
              QUALITY_GATE_TEST_GROUP_LABELS[value] || `待说明：${value}`,
          },
          {
            title: '目录核对',
            key: 'present',
            width: 130,
            render: (_, file) => (
              <Tag
                color={
                  error || loading
                    ? 'default'
                    : !file.present ||
                        ['duplicate', 'unregistered'].includes(file.group)
                      ? 'warning'
                      : 'default'
                }
              >
                {error || loading
                  ? '上次读取'
                  : !file.present
                    ? '未找到文件'
                    : file.group === 'unregistered'
                      ? '未登记分组'
                      : file.group === 'duplicate'
                        ? '重复登记'
                        : '已发现文件'}
              </Tag>
            ),
          },
        ]}
      />
      {selectedFile ? (
        <section
          className="erp-dev-quality-guide__detail"
          aria-label="测试文件说明"
        >
          <Text strong>
            <code>{selectedFile}</code>
          </Text>
          <Paragraph>
            {error && !directory
              ? '测试目录读取失败，暂不能核对该文件。'
              : selected && (error || loading)
                ? '该文件来自上次读取，当前归属和存在状态尚未核实。'
                : selected
                  ? `归属：${QUALITY_GATE_TEST_GROUP_LABELS[selected.group] || selected.group}。${selected.present ? '当前目录已发现此文件；本页没有执行其中的测试。' : '当前执行端尚未发现此文件。'}`
                  : loading
                    ? '正在读取文件归属。'
                    : '当前目录没有此文件，请核对名称与执行端源码。'}
          </Paragraph>
          <Text type="secondary">
            具体断言与测试目的以同名测试为准；不自动从文件名推导业务覆盖。
          </Text>
        </section>
      ) : null}
      <Sources
        paths={[
          'scripts/qa/node-test-groups.mjs',
          'scripts/qa/run-node-tests.mjs',
          'web/scripts/runUnitTests.mjs',
          'server/Makefile',
          'docs/product/自动化测试策略.md',
        ]}
      />
    </WorkbenchSection>
  )
}

export default function QualityGateRulesView({
  active,
  guide = 'catalog',
  onGuide,
  children,
}) {
  const [selectedFile, setSelectedFile] = useState(DEFAULT_HOOK)
  const [flowKey, setFlowKey] = useState('overview')
  const [nodes, setNodes] = useState({})
  const [testFilters, setTestFilters] = useState({
    query: '',
    group: 'all',
    page: 1,
  })
  const [testFile, setTestFile] = useState('')
  const [returnToHook, setReturnToHook] = useState(false)
  const root = useRef(null)
  const selectFlow = (key) => {
    setFlowKey(key)
  }
  const openHookFlow = (file) => {
    const entry = QUALITY_GATE_HOOK_FILES[file]
    setSelectedFile(file)
    setFlowKey(entry.flow)
    setNodes((current) => ({ ...current, [entry.flow]: entry.node }))
    setReturnToHook(true)
    onGuide('flows')
  }
  const back = () => {
    setReturnToHook(false)
    onGuide('hooks')
    window.requestAnimationFrame(() =>
      root.current
        ?.querySelector(`[data-quality-hook-file="${selectedFile}"]`)
        ?.focus()
    )
  }
  const coverage = CI_WORKFLOW_SECTIONS.find(
    (section) => section.key === 'coverage'
  )
  return (
    <div ref={root} hidden={!active} className="erp-dev-quality-guide">
      <DevTaskNav
        compact
        ariaLabel="门禁规则内容"
        items={QUALITY_GATE_RULE_VIEWS}
        value={guide}
        onChange={(value) => {
          setReturnToHook(false)
          onGuide(value)
        }}
        idPrefix="quality-rules"
      />
      {returnToHook && guide !== 'hooks' ? (
        <WorkbenchToolbar>
          <Button type="link" onClick={back}>
            返回 Hook 入口
          </Button>
          <Text type="secondary">{selectedFile}</Text>
        </WorkbenchToolbar>
      ) : null}
      <div
        role="tabpanel"
        id={`quality-rules-panel-${guide}`}
        aria-labelledby={`quality-rules-tab-${guide}`}
      >
        <div hidden={guide !== 'catalog'}>{children}</div>
        {guide === 'hooks' ? (
          <HookIndex
            selectedFile={selectedFile}
            onFile={setSelectedFile}
            onFlow={openHookFlow}
            onTest={(file) => {
              setTestFilters({ query: file, group: 'all', page: 1 })
              setTestFile(file)
              setReturnToHook(true)
              onGuide('tests')
            }}
          />
        ) : null}
        {guide === 'flows' ? (
          <>
            <FlowReader
              flowKey={flowKey}
              selectedNode={nodes[flowKey]}
              onFlow={selectFlow}
              onNode={(id) =>
                setNodes((current) => ({ ...current, [flowKey]: id }))
              }
            />
            <details className="erp-dev-disclosure">
              <summary>提交前与完整 CI 覆盖对照</summary>
              <Table
                rowKey={(row) => row[0]}
                size="small"
                pagination={false}
                dataSource={coverage.table.rows}
                columns={coverage.table.headers.map((title, index) => ({
                  title,
                  key: title,
                  render: (_, row) => row[index],
                }))}
                scroll={{ x: 800 }}
              />
              <Text type="secondary">{coverage.description}</Text>
            </details>
          </>
        ) : null}
        <div hidden={guide !== 'tests'}>
          <TestDirectory
            active={active && guide === 'tests'}
            filters={testFilters}
            onFilters={setTestFilters}
            selectedFile={testFile}
            onFile={setTestFile}
          />
        </div>
      </div>
    </div>
  )
}
