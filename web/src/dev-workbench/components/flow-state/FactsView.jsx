import React, { useMemo } from 'react'
import { Button, Empty } from 'antd'
import { WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import { BusinessChainProjectionContext } from './FlowTaskContext.jsx'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  EvidenceDisclosure,
  KeyValue,
} from './FlowStateShared.jsx'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildFactDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'

function FactsView({
  catalog,
  projection,
  fact,
  onSelectFact,
  onOpenState,
  onBackToChain,
  onClearChainContext,
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
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-fact-select">选择事实定义</label>
        <Select
          placeholder="选择事实定义"
          id="dev-flow-fact-select"
          aria-label="选择事实定义"
          showSearch
          virtual={false}
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
      </section>
      {fact ? (
        <WorkbenchSection
          flat
          className="erp-dev-flow-fact-detail"
          data-selected-fact={fact.factKey}
          title={fact.label}
          description="定义说明；当前不支持按凭证查询实际结果。"
          actions={<Button onClick={() => onOpenState(fact.machineKey)}>查看状态规则</Button>}
        >
          <WorkbenchFacts items={[
            { label: '何时生效', value: fact.occurrenceCondition },
            { label: '业务影响', value: fact.businessImpact },
            { label: '来源单据', value: fact.sourceDocument },
            { label: '结果凭证', value: fact.voucher },
            { label: '如何纠正', value: fact.correction },
          ]}
          />
          <EvidenceDisclosure value={fact} label="规则与代码依据">
            <WorkbenchFacts items={[
              { label: '定义标识', value: <KeyValue value={fact.factKey} /> },
              { label: '权威真源', value: fact.authority },
              { label: '幂等规则', value: fact.idempotencyRule },
              { label: '查询范围', value: catalog.factRuntimeQuery.reason },
            ]}
            />
          </EvidenceDisclosure>
        </WorkbenchSection>
      ) : <Empty description="请选择事实定义" />}
    </div>
  )
}

export { FactsView }
