import React, { useMemo } from 'react'
import { Alert, Typography } from 'antd'
import { Link } from 'react-router-dom'
import {
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  parseDevTestingStrategyGuide,
} from '../config/devTesting.mjs'
import { DEV_DOCS_ROUTE } from '../config/devRoutes.mjs'
import '../styles/dev-testing-strategy-guide.css'

function StrategyTable({ table, label }) {
  if (!table.rows.length) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`${label}暂不可读，请查看正式测试策略。`}
      />
    )
  }
  return (
    <div className="erp-dev-tool-table-wrap">
      <table
        data-table-lines="appearance"
        className="erp-dev-tool-table"
        aria-label={label}
      >
        <thead>
          <tr>
            {table.headers.map((header) => (
              <th key={header} scope="col">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map(([labelCell, ...cells]) => (
            <tr key={labelCell}>
              <th scope="row">{labelCell}</th>
              {cells.map((cell, index) => (
                <td key={table.headers[index + 1]}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DevTestingStrategyGuide({ source, evidence = false, topic = 'methods' }) {
  const tables = useMemo(() => parseDevTestingStrategyGuide(source), [source])
  const sourceLink = `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(DEV_TESTING_STRATEGY_SOURCE_PATH)}`
  const topics = {
    methods: { label: '自动化测试方式', anchor: 'test-methods', note: '按改动选择测试方式；入口说明不代表执行结果。' },
    devices: { label: '真机回归场景范围', anchor: 'real-device-regression', note: '手机视口与 WebKit 检查不能代替真实设备结果。' },
    growth: { label: '增长、并发与事务验证', anchor: 'growth-and-correctness', note: '按影响选择验证；容量结论绑定实际数据、负载、资源和源码。' },
  }
  if (!evidence) {
    const selected = topics[topic]
    return (
      <section className="erp-dev-testing-strategy-guide erp-dev-testing-strategy-guide--topic">
        <Typography.Paragraph type="secondary">{selected.note}</Typography.Paragraph>
        <StrategyTable table={tables[topic]} label={selected.label} />
        <Typography.Paragraph>
          <Link to={`${sourceLink}#${selected.anchor}`}>查看正式依据</Link>
          {topic === 'growth' ? <>{' · '}<Link to="?view=coverage&coverage=rules">查看关键规则证据</Link>{' · '}<Link to="?view=pressure">查看规模与压力报告</Link></> : null}
        </Typography.Paragraph>
      </section>
    )
  }

  return (
    <details className="erp-dev-disclosure erp-dev-testing-disclosure erp-dev-testing-strategy-guide">
      <summary>如何区分证据环境</summary>
      <Typography.Paragraph>
        分类说明不代表执行结果。报告须明确实际环境；未记录的范围保留未证明。
      </Typography.Paragraph>
      <StrategyTable table={tables.evidence} label="测试证据分类" />
      <Typography.Paragraph>
        <Link to={`${sourceLink}#evidence-categories`}>查看分类依据与证据边界</Link>
      </Typography.Paragraph>
    </details>
  )
}
