import React, { useMemo } from 'react'
import { Button, Empty } from 'antd'
import { WorkbenchFacts, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import { DEFINITION_SELECT_CLASS_NAMES, useDefinitionSelectSearch, renderDefinitionSelectOption } from './FlowStateShared.jsx'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildFactDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'

function FactsView({
  catalog,
  projection,
  fact,
  onSelectFact,
  onOpenState,
  ruleTools,
}) {
  const definitions = projection
    ? projection.factDefinitions
    : catalog.factDefinitions
  const scopedCatalog = useMemo(
    () => ({ ...catalog, factDefinitions: definitions }),
    [catalog, definitions]
  )
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildFactDefinitionSelectOptions(scopedCatalog),
    [scopedCatalog]
  )
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(scopedCatalog, 'facts'),
    [scopedCatalog]
  )
  return (
    <div className="erp-dev-flow-view-stack">
      <WorkbenchToolbar className="erp-dev-flow-definition-selector">
        <Select
          placeholder="选择事实定义"
          id="dev-flow-fact-select"
          aria-label="选择事实定义"
          showSearch
          virtual={false}
          popupMatchSelectWidth={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的事实定义"
          value={fact?.factKey}
          labelRender={() => fact?.label}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFact}
        />
        {ruleTools}
        {fact ? <Button onClick={() => onOpenState(fact.machineKey)}>查看状态规则</Button> : null}
      </WorkbenchToolbar>
      {fact ? (
        <WorkbenchSection
          flat
          className="erp-dev-flow-fact-detail"
          data-selected-fact={fact.factKey}
          aria-label={fact.label}
        >
          <h2 className="erp-dev-flow-print-title">{fact.label}</h2>
          <WorkbenchFacts items={[
            { label: '何时生效', value: fact.occurrenceCondition },
            { label: '业务影响', value: fact.businessImpact },
            { label: '来源单据', value: fact.sourceDocument },
            { label: '结果凭证', value: fact.voucher },
            { label: '如何纠正', value: fact.correction },
            { label: '防止重复', value: fact.idempotencyRule },
          ]}
          />

        </WorkbenchSection>
      ) : <Empty description="请选择事实定义" />}
    </div>
  )
}

export { FactsView }
