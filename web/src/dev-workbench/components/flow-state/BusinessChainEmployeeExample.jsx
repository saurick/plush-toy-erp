import React, { useState } from 'react'
import { Button, Input, Steps } from 'antd'
import SlidingTabList from '@/common/components/navigation/SlidingTabList.jsx'
import { WorkbenchFacts } from '../WorkbenchPattern.jsx'

const examples = [
  { key: 'A', label: 'A 行 · 待检', stateKey: 'SUBMITTED', state: '已提交', next: '品质记录本行检查结果，通过后交仓库确认入库。' },
  { key: 'B', label: 'B 行 · 检验通过', stateKey: 'PASSED', state: '已通过', next: '等待仓库确认本行实收入库；检验通过没有增加库存。' },
]

export default function BusinessChainEmployeeExample({ library, onLocate }) {
  const [key, setKey] = useState('A')
  const [notes, setNotes] = useState({ A: '', B: '' })
  const [saved, setSaved] = useState({ A: '', B: '' })
  const example = examples.find((item) => item.key === key)
  const node = library.nodes.find((item) => !item.representedBy && !item.splitInto &&
    item.chainKey === 'purchase_to_inventory' && item.source.key === 'purchase_quality:posts_fact:purchase_accepted')
  return (
    <section className="erp-chain-employee-example" aria-label="员工定位示例">
      <header><h2>品质岗位 · 本次到货</h2><span className="erp-chain-employee-example__caption">模拟数据 · 收货示例-02</span></header>
      <SlidingTabList
        aria-label="选择模拟收货行"
        value={key}
        onChange={setKey}
        options={examples.map((item) => ({ value: item.key, label: item.label }))}
      />
      <WorkbenchFacts items={[
        { label: '我在哪一环', value: '来料检验 · 品质' },
        { label: '本行当前结果', value: `${example.state}，尚未入库` },
        { label: '下一步', value: example.next },
      ]}
      />
      <Steps
        current={2}
        items={[
          { title: '采购批准', description: '已批准', status: 'finish' },
          { title: '到货实点', description: '已登记', status: 'finish' },
          { title: '本行检验', description: example.state, status: key === 'B' ? 'finish' : 'process' },
          { title: '仓库入库', description: '尚未入库', status: 'wait' },
        ]}
      />
      <p>同批 A 行待检，B 行已通过但未入库，分别查看各行记录。本示例没有提供账款记录。</p>
      <div>
        <Button
          type="primary"
          disabled={!node}
          onClick={() => onLocate({
            chainKey: node.chainKey,
            nodeId: node.id,
            preview: { machineKey: 'fact.quality_inspection', stateKey: example.stateKey },
          })}
        >在规则图定位此环
        </Button>
      </div>
      <label htmlFor="chain-example-notes">检查备注（模拟草稿）</label>
      <Input.TextArea
        id="chain-example-notes"
        value={notes[key]}
        maxLength={500}
        autoSize={{ minRows: 3, maxRows: 6 }}
        onChange={(event) => setNotes((previous) => ({ ...previous, [key]: event.target.value }))}
      />
      <div className="erp-chain-design__actions">
        <Button onClick={() => setSaved((previous) => ({ ...previous, [key]: notes[key] }))}>保存示例草稿</Button>
        <span role="status">{saved[key] && saved[key] === notes[key] ? '示例草稿已保存' : '草稿仅在本页保留，不改变检验或库存事实。'}</span>
      </div>
    </section>
  )
}
