import React from 'react'
import { Alert, Collapse, Space, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import {
  chainAuditArtifactURL,
  CHAIN_AUDIT_STATES,
} from '../config/devBusinessChainAudit.mjs'

const { Text } = Typography
const text = (value) =>
  value == null
    ? '未记录'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)

export function ChainAuditState({ status, label }) {
  const state = CHAIN_AUDIT_STATES[status] || CHAIN_AUDIT_STATES.not_proven
  return <Tag color={state.color}>{label || state.label}</Tag>
}

export function ChainAuditEvidenceLink({ data, file, label }) {
  const entry = data.files.find((item) => item.path === file)
  if (!entry) return <Text type="secondary">{label || file}（未登记证据）</Text>
  return (
    <a href={chainAuditArtifactURL(data.batch, entry.path)} download>
      {label || entry.path}
    </a>
  )
}

export function ChainAuditEvidenceLinks({ data, items = [] }) {
  return (
    <ul className="erp-dev-chain-audit__evidence-links">
      {items.map((item) => (
        <li key={item.path}>
          <ChainAuditEvidenceLink
            data={data}
            file={item.path}
            label={item.label}
          />
        </li>
      ))}
    </ul>
  )
}

export function ChainAuditFindings({ data }) {
  const { report } = data
  return (
    <div className="erp-dev-chain-audit__stack">
      <Alert
        type="info"
        showIcon
        message="问题与复验均以所选批次的执行证据为准"
        description="保留原始失败。后续代码变化、其他样本通过或人工判断，均不改变本批次结果。"
      />
      {(report.retests || []).map((retest) => (
        <section className="erp-dev-chain-audit__section" key={retest.id}>
          <h2>
            {retest.id} · {retest.title}{' '}
            <ChainAuditState status={retest.status} />
          </h2>
          <p>{retest.summary}</p>
          <Link to={`?${new URLSearchParams({ batch: retest.sourceBatch, view: 'findings' })}`}>
            查看原失败批次
          </Link>
          <ChainAuditEvidenceLinks data={data} items={retest.evidence} />
        </section>
      ))}
      {report.findings.length ? (
        report.findings.map((finding) => (
          <section className="erp-dev-chain-audit__section" key={finding.id}>
            <h2>
              <Tag color={finding.priority === 'P2' ? 'gold' : 'red'}>
                {finding.priority}
              </Tag>
              {finding.id} · {finding.title} <Tag>未复验</Tag>
            </h2>
            <Text type="secondary">{finding.kind}</Text>
            <dl className="erp-dev-chain-audit__details">
              {[
                ['trigger', '触发路径'],
                ['observed', '实际结果'],
                ['impact', '影响范围'],
                ['cause', '报告定位'],
                ['recommendation', '修复与复验建议'],
              ].map(([key, label]) => (
                <React.Fragment key={key}>
                  <dt>{label}</dt>
                  <dd>{finding[key]}</dd>
                </React.Fragment>
              ))}
              {finding.requestId ? (
                <>
                  <dt>请求标识</dt>
                  <dd>
                    <code>{text(finding.requestId)}</code>
                  </dd>
                </>
              ) : null}
            </dl>
            <ChainAuditEvidenceLinks data={data} items={finding.evidence} />
            {Array.isArray(finding.source) ? (
              <details>
                <summary>报告对应的源码位置</summary>
                <ul>
                  {finding.source.map((item) => (
                    <li key={`${item.path}:${item.line}`}>
                      <code>
                        {text(item.path)}:{text(item.line)}
                      </code>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ))
      ) : (
        <Text>本批次没有登记问题；覆盖边界以执行记录为准。</Text>
      )}
    </div>
  )
}

function ReportTable({ columns, rows, rowKey = 'name' }) {
  return (
    <Table
      size="small"
      rowKey={rowKey}
      dataSource={rows}
      columns={columns}
      pagination={
        rows.length > 12 ? { pageSize: 12, showSizeChanger: false } : false
      }
      scroll={{ x: 760 }}
    />
  )
}

export default function DevChainAuditEvidence({ data }) {
  const { report } = data
  const { metrics } = report
  const pdfFile = (name) =>
    data.files.find(
      (file) => file.path === name || file.path.endsWith(`/${name}`)
    )?.path
  const screenshotColumn = {
    title: '证据',
    key: 'evidence',
    width: 160,
    render: (_, row) =>
      row.screenshot ? (
        <ChainAuditEvidenceLink
          data={data}
          file={row.screenshot}
          label="下载截图"
        />
      ) : (
        '未记录截图'
      ),
  }
  const sections = [
    {
      key: 'create',
      label: `创建与编辑 · ${report.createEdit.length} 项`,
      children: (
        <ReportTable
          rows={report.createEdit}
          columns={[
            { title: '实际操作', dataIndex: 'name', render: text },
            {
              title: '结果',
              dataIndex: 'status',
              width: 120,
              render: (status) => <ChainAuditState status={status} />,
            },
            {
              title: '覆盖与清空读回',
              dataIndex: 'evidence',
              render: (value) => <code>{text(value)}</code>,
            },
          ]}
        />
      ),
    },
    {
      key: 'mobile',
      label: `移动协同 · ${report.mobileActions.length} 次实际交互`,
      children: (
        <ReportTable
          rows={report.mobileActions}
          rowKey={(row) => `${row.role}:${row.action}`}
          columns={[
            { title: '岗位', dataIndex: 'role', width: 140, render: text },
            { title: '办理动作', dataIndex: 'action', render: text },
            {
              title: '任务读回',
              dataIndex: 'taskStatus',
              width: 140,
              render: text,
            },
            {
              title: '结果',
              dataIndex: 'status',
              width: 100,
              render: (status) => <ChainAuditState status={status} />,
            },
            screenshotColumn,
          ]}
        />
      ),
    },
    {
      key: 'pages',
      label: `页面补验 · ${report.pages.length} 页`,
      children: (
        <>
          <Alert
            type="warning"
            showIcon
            message={`原浏览器回执：${text(metrics.officialBrowser?.targetPassedCount)} 通过 / ${text(metrics.officialBrowser?.targetFailedCount)} 失败；下面的独立页面补验保留自己的范围。`}
          />
          <ReportTable
            rows={report.pages}
            rowKey="key"
            columns={[
              { title: '页面', dataIndex: 'title', render: text },
              { title: '岗位', dataIndex: 'roleKey', width: 140, render: text },
              {
                title: '核验结果',
                dataIndex: 'status',
                render: (status) =>
                  status === 'rendered-and-current-controls-verified'
                    ? '渲染与指定控件已核对'
                    : text(status),
              },
              screenshotColumn,
            ]}
          />
        </>
      ),
    },
    {
      key: 'database',
      label: '数据库与自动化回执',
      children: (
        <>
          <dl className="erp-dev-chain-audit__details">
            <dt>Go 顶层测试</dt>
            <dd>
              {text(metrics.goTopLevel?.pass)} 通过 /{' '}
              {text(metrics.goTopLevel?.skip)} 跳过
            </dd>
            <dt>真实 PostgreSQL</dt>
            <dd>
              {text(metrics.criticalPostgresRequiredFamilies)} 个必跑族 ·{' '}
              <ChainAuditState status={metrics.criticalPostgresVerdict} />
            </dd>
          </dl>
          <p>
            统计口径独立，不能相加为测试总数；细项与跳过原因查看原始日志和回执。
          </p>
          <ChainAuditEvidenceLinks
            data={data}
            items={report.evidence.filter((item) =>
              /PostgreSQL|Go|RPC|协同任务|事实读回/u.test(item.label)
            )}
          />
        </>
      ),
    },
    {
      key: 'print',
      label: `打印与 PDF · ${report.printing.templates.length} 个模板`,
      children: (
        <>
          <p>
            内容完整性与排版可读性分别判断；本批次的排版问题见“问题与复验”。
          </p>
          <ReportTable
            rows={report.pdfValidation.templates}
            rowKey="file"
            columns={[
              {
                title: '文件',
                dataIndex: 'file',
                render: (file) => (
                  <ChainAuditEvidenceLink
                    data={data}
                    file={pdfFile(file) || file}
                    label={text(file)}
                  />
                ),
              },
              { title: '页数', dataIndex: 'pages', width: 90, render: text },
              {
                title: '缺失预期内容',
                dataIndex: 'missingExpectedTokens',
                render: (tokens) =>
                  Array.isArray(tokens)
                    ? tokens.length
                      ? tokens.join('、')
                      : '未检出'
                    : '未记录',
              },
              { title: '检查结果', dataIndex: 'status', render: text },
            ]}
          />
        </>
      ),
    },
  ]
  return (
    <div className="erp-dev-chain-audit__stack">
      <Space wrap>
        {['report.html', 'report.md', 'report.json'].map((file) => (
          <ChainAuditEvidenceLink
            key={file}
            data={data}
            file={file}
            label={`下载 ${file}`}
          />
        ))}
        {data.files
          .filter((file) => file.path.endsWith('.zip'))
          .map((file) => (
            <ChainAuditEvidenceLink
              key={file.path}
              data={data}
              file={file.path}
              label="下载完整证据包"
            />
          ))}
      </Space>
      <Text type="secondary">
        完整 HTML 报告随证据包解压后打开，保留其中的相对证据链接。
      </Text>
      <Collapse items={sections} defaultActiveKey={['create']} />
      <section className="erp-dev-chain-audit__section">
        <h2>主要执行回执</h2>
        <ChainAuditEvidenceLinks data={data} items={report.evidence} />
      </section>
      <details>
        <summary>可下载证据清单 · {data.files.length} 个文件</summary>
        <ReportTable
          rows={data.files}
          rowKey="path"
          columns={[
            {
              title: '文件',
              dataIndex: 'path',
              render: (file) => (
                <ChainAuditEvidenceLink data={data} file={file} />
              ),
            },
            {
              title: '大小',
              dataIndex: 'bytes',
              width: 100,
              render: (bytes) => `${(bytes / 1024).toFixed(1)} KB`,
            },
            {
              title: 'SHA-256',
              dataIndex: 'sha256',
              render: (hash) => <code>{hash}</code>,
            },
          ]}
        />
      </details>
    </div>
  )
}
