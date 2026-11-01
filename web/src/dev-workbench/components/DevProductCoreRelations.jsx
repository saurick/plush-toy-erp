import React, { useEffect, useMemo, useState } from 'react'
import { Button, Space, Typography } from 'antd'
import {
  buildProductCoreChainRelations,
  PRODUCT_CORE_RELEASE_EVIDENCE_URL,
  productCapabilitiesForChain,
  productCoreCapabilityURL,
  productCoreChainURL,
} from '../config/devProductCoreRelations.mjs'
import { chainStepAuditURL } from '../config/devBusinessChainVerification.mjs'
import { DevReadingLink } from './DevReadingNavigation.jsx'

const { Title } = Typography

export function ChainCapabilityLinks({ chainKey, fromLabel = '业务专题', report = false }) {
  const names = productCapabilitiesForChain(chainKey)
  if (!names.length) return null
  return (
    <section aria-label="关联产品能力" data-chain-capabilities={chainKey}>
      <Title level={4}>{report ? '当前定义关联的产品能力' : '关联产品能力'}</Title>
      <Space wrap>
        {names.map((name) => (
          <DevReadingLink key={name} to={productCoreCapabilityURL(name)} fromLabel={fromLabel}>{name}</DevReadingLink>
        ))}
      </Space>
      {report ? <p><DevReadingLink to={productCoreChainURL(chainKey)} fromLabel={fromLabel}>查看当前业务专题</DevReadingLink>；本批次是否覆盖该链路，以报告记录为准。</p> : null}
    </section>
  )
}

export function ChainEvidenceLinks({ chainKey, fromLabel = '业务专题' }) {
  return (
    <>
      <Space wrap>
        <DevReadingLink to={chainStepAuditURL(chainKey, '')} fromLabel={fromLabel}>链路实测报告</DevReadingLink>
        <DevReadingLink to={PRODUCT_CORE_RELEASE_EVIDENCE_URL} fromLabel={fromLabel}>版本发布记录</DevReadingLink>
      </Space>
      <p>实测报告核对所选链路，发布记录按版本与目标环境核对；二者都不代表客户验收。</p>
    </>
  )
}

export default function DevProductCoreRelations({ capability, capabilities }) {
  const [catalogState, setCatalogState] = useState({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setCatalogState({ status: 'loading' })
    import('../config/devFlowStateCatalog.mjs').then((module) => {
      if (active) setCatalogState({ status: 'ready', catalog: module.DEV_FLOW_STATE_CATALOG })
    }).catch(() => {
      if (active) setCatalogState({ status: 'error' })
    })
    return () => { active = false }
  }, [revision])
  const relations = useMemo(() => {
    if (catalogState.status !== 'ready') return null
    try {
      return buildProductCoreChainRelations(capabilities, catalogState.catalog)
    } catch {
      return null
    }
  }, [capabilities, catalogState])
  const failed = catalogState.status === 'error' || (catalogState.status === 'ready' && !relations)
  const chains = relations?.get(capability) || []
  return (
    <section aria-label="关联业务与证据" aria-busy={catalogState.status === 'loading'}>
      <Title level={3}>关联业务与证据</Title>
      {catalogState.status === 'loading' ? <p role="status">正在读取关联业务链路…</p> : failed ? (
        <div role="alert">
          <p>关联业务链路不可用，可重新读取；能力范围仍以本页台账为准。</p>
          <Button onClick={() => setRevision((value) => value + 1)}>重新读取关联</Button>
        </div>
      ) : chains.length ? (
        <>
          <ul>
            {chains.map((chain) => (
              <li key={chain.key}>
                <Space wrap>
                  <DevReadingLink to={chain.definitionURL} fromLabel="产品能力">{chain.label}</DevReadingLink>
                  <DevReadingLink to={chain.evidenceURL} fromLabel="产品能力" aria-label={`${chain.label}实测报告`}>实测报告</DevReadingLink>
                </Space>
              </li>
            ))}
          </ul>
          <p><DevReadingLink to={PRODUCT_CORE_RELEASE_EVIDENCE_URL} fromLabel="产品能力">版本发布记录</DevReadingLink>按版本与目标环境核对；关联入口不证明已发布或客户已验收。</p>
        </>
      ) : <p>当前能力没有登记关联的业务链路，按现有可用范围与边界核对。</p>}
    </section>
  )
}
