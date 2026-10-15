import React, { useMemo } from 'react'
import { Alert, Button, Select, Tag } from 'antd'
import { BusinessChainProjectionContext } from './FlowTaskContext.jsx'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  Text,
  Title,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  EvidenceDisclosure,
  KeyValue,
  GuidanceDisclosure,
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
      <GuidanceDisclosure
        guidanceKey="facts"
        title="Fact / Ledger 管“账”"
        summary="流程完成不能替代事实凭证"
        description="它回答什么业务结果已经正式生效、权威真源在哪里、凭证和纠正方式是什么。Workflow 或 ProcessRuntime 的完成状态都不能替代事实凭证。"
      />
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <Alert
        showIcon
        type="warning"
        message={catalog.factRuntimeQuery.label}
        description={catalog.factRuntimeQuery.reason}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-fact-select">选择事实定义</label>
        <Select
          id="dev-flow-fact-select"
          aria-label="选择事实定义"
          showSearch
          virtual={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的事实定义"
          value={fact.factKey}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFact}
        />
        <Text type="secondary">
          只展示当前代码核实的定义；不提供 mock 运行凭证或伪造凭证搜索。
        </Text>
      </section>
      <section
        className="erp-dev-flow-fact-detail"
        data-selected-fact={fact.factKey}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text className="erp-dev-flow-eyebrow">Fact / Ledger 定义</Text>
            <Title level={2}>{fact.label}</Title>
            <KeyValue value={fact.factKey} />
          </div>
          <Tag color="red">定义证据</Tag>
        </div>
        <dl>
          <div>
            <dt>正式发生条件</dt>
            <dd>{fact.occurrenceCondition}</dd>
          </div>
          <div>
            <dt>来源单据</dt>
            <dd>{fact.sourceDocument}</dd>
          </div>
          <div>
            <dt>权威真源</dt>
            <dd>{fact.authority}</dd>
          </div>
          <div>
            <dt>业务影响</dt>
            <dd>{fact.businessImpact}</dd>
          </div>
          <div>
            <dt>事实凭证</dt>
            <dd>{fact.voucher}</dd>
          </div>
          <div>
            <dt>幂等规则</dt>
            <dd>{fact.idempotencyRule}</dd>
          </div>
          <div>
            <dt>纠正方式</dt>
            <dd>{fact.correction}</dd>
          </div>
        </dl>
        <Button onClick={() => onOpenState(fact.machineKey)}>
          查看对应状态规则
        </Button>
        <EvidenceDisclosure value={fact} />
      </section>
    </div>
  )
}

export { FactsView }
