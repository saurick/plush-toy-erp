import React, { useState } from 'react'
import { Input, InputNumber, Space } from 'antd'
import {
  FINANCE_RULES,
  financeRule,
  illustrateChinaMonthEnd,
} from '../../config/devFinanceWorkbench.mjs'
import { WorkbenchEmpty, WorkbenchFacts, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import './financeWorkbench.css'

export default function FinanceRulesView({
  ruleKey,
  onSelectRule,

}) {
  const rule = ruleKey === '' ? null : financeRule(ruleKey)
  const [date, setDate] = useState('2026-10-01')
  const [days, setDays] = useState(30)
  const example = illustrateChinaMonthEnd(date, days)
  return (
    <div className="erp-dev-finance" data-finance-rules>
      <WorkbenchToolbar className="erp-dev-flow-definition-selector">
        <Select
          aria-label="财务口径类型"
          placeholder="选择财务口径"
          showSearch
          virtual={false}
          optionFilterProp="label"
          options={FINANCE_RULES.map(({ key, label }) => ({ value: key, label }))}
          value={rule?.key}
          onChange={(key) => onSelectRule(key ?? '')}
        />

      </WorkbenchToolbar>
      {rule ? (
        <WorkbenchSection
          aria-label={rule.label}
          flat
        >
          <h2 className="erp-dev-flow-print-title">{rule.label}</h2>
          <WorkbenchFacts
            items={rule.facts.map(([label, value]) => ({ label, value }))}
          />
          {rule.key === 'terms' ? (
            <div className="erp-dev-finance__date-example">
              <h3>日期示例</h3>
              <Space wrap align="end">
                <label>
                  中国业务日期
                  <Input
                    type="date"
                    aria-label="中国业务日期"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label>
                  约定天数
                  <InputNumber
                    aria-label="约定天数"
                    min={1}
                    precision={0}
                    value={days}
                    onChange={setDays}
                  />
                </label>
              </Space>
              <p aria-live="polite">
                {example
                ? `${example.monthEnd} 月末 + ${days} 天 = ${example.dueDate}`
                : '请输入有效日期和正整数天数。'}
              </p>
              <p>
                这里只演示日期。真实账款保留发生时刻，到期时间以服务端冻结记录为准。
              </p>
            </div>
        ) : null}
        </WorkbenchSection>
      ) : <WorkbenchEmpty title="请选择财务口径" />}
    </div>
  )
}
