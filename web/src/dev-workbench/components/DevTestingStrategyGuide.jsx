import React, { useMemo } from 'react'
import { Alert, Button, Typography } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  parseDevTestingStrategyGuide,
} from '../config/devTesting.mjs'
import '../styles/dev-testing-strategy-guide.css'

function StrategyTable({ table, label, topic }) {
  const [params, setParams] = useSearchParams()
  const { state } = useLocation()
  const choose = (id) => {
    const next = new URLSearchParams(params)
    if (params.get('testingDetail') === id) next.delete('testingDetail')
    else next.set('testingDetail', id)
    setParams(next, { replace: true, state })
  }
  if (!table.rows.length) {
    return (
      <Alert
        type="warning"
        showIcon
        message={`${label}暂不可读，请查看正式测试策略。`}
      />
    )
  }
  if (topic) {
    return (
      <table data-table-lines="appearance" className="erp-dev-tool-table erp-dev-testing-simple-table" aria-label={label}>
        <thead><tr><th scope="col">{table.headers[0]}</th><th scope="col">{table.headers[1]}</th></tr></thead>
        <tbody>
          {table.rows.map(([name, ...cells], index) => {
            const id = `guide-${topic}-${name}`
            const open = params.get('testingDetail') === id
            const regionId = `guide-${topic}-${index}`
            return (
              <React.Fragment key={name}>
                <tr>
                  <th scope="row"><Button type="link" aria-expanded={open} aria-controls={regionId} onKeyDown={(event) => { if (open && event.key === 'Escape') { event.stopPropagation(); choose(id) } }} onClick={() => choose(id)}>{name}</Button></th>
                  <td>{cells[0]}</td>
                </tr>
                {open ? (
                  <tr>
                    <td colSpan={2} className="erp-dev-testing-guide-expanded">
                      <div id={regionId} role="region" aria-label={`${name}详情`}>
                        <dl className="erp-dev-testing-guide-facts">
                          {cells.slice(1).map((cell, cellIndex) => (
                            <React.Fragment key={table.headers[cellIndex + 2]}><dt>{table.headers[cellIndex + 2]}</dt><dd>{cell}</dd></React.Fragment>
                          ))}
                        </dl>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
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
        <StrategyTable table={tables[topic]} label={selected.label} topic={topic} />
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
    </details>
  )
}
