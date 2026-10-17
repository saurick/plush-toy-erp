import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Drawer, Empty, Select, Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import Table from '@/common/components/table/AppTable'
import { Markdown } from '@/common/components/markdown'
import {
  RpcMethod,
  RpcTransport,
} from '@/common/consts/rpcMethods.generated.mjs'
import apiSource from '../../../../server/docs/api.md?raw'
import DevPageNav from '../components/DevPageNav.jsx'
import DevProjectGraphView from '../components/DevProjectGraphView.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import { buildProjectGraph } from '../config/devProjectGraph.mjs'
import { readPermissionRelationshipSnapshot } from '../config/devPermissionRelationshipApi.mjs'
import { createDevQualityGateClient } from '../config/devQualityGates.mjs'
import { qualityGateViewStatus } from '../config/qualityGatePresentation.mjs'
import { DEV_QUALITY_GATES_ROUTE } from '../config/devRoutes.mjs'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import {
  INTEGRATION_PAGE_SIZE,
  buildIntegrationEntries,
  filterIntegrationEntries,
  integrationContractLocation,
  integrationPermissions,
  parseIntegrationSearch,
} from '../config/devIntegration.mjs'
import '../styles/dev-integration.css'

const graph = buildProjectGraph('integration')
const entries = buildIntegrationEntries(RpcMethod, apiSource)
const emptyPermissions = new Map()
const domains = Object.keys(RpcMethod)
  .sort()
  .map((domain) => ({ label: domain, value: domain }))
const contractLabel = (contract) =>
  contract?.kind === 'detail' ? '明细合同' : '章节说明'

export default function DevIntegrationPage() {
  const [params, setParams] = useSearchParams()
  const query = parseIntegrationSearch(params)
  const pendingParams = useRef(params)
  const [permissionState, setPermissionState] = useState({
    loading: true,
    data: null,
    error: false,
  })
  const [permissionReload, setPermissionReload] = useState(0)
  const [gateState, setGateState] = useState({
    loading: false,
    data: null,
    error: false,
  })
  const [gateReload, setGateReload] = useState(0)
  const [graphOpen, setGraphOpen] = useState(Boolean(query.node))
  const gateClient = useMemo(() => createDevQualityGateClient(), [])

  useEffect(() => {
    pendingParams.current = params
  }, [params])

  useEffect(() => {
    const controller = new AbortController()
    setPermissionState({ loading: true, data: null, error: false })
    readPermissionRelationshipSnapshot({ signal: controller.signal })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setPermissionState({
            loading: false,
            error: false,
            data: {
              associations: integrationPermissions(snapshot.permissions),
              readAt: snapshot.read_at,
            },
          })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPermissionState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [permissionReload])

  useEffect(() => {
    if (!gateReload) return undefined
    const controller = new AbortController()
    setGateState({ loading: true, data: null, error: false })
    gateClient
      .summary({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setGateState({ loading: false, data, error: false })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setGateState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [gateClient, gateReload])

  useEffect(() => {
    if (query.node) setGraphOpen(true)
  }, [query.node])

  const updateQuery = useCallback(
    (values, replace = false) => {
      // Router search updates do not queue; merge rapid filter changes before
      // the preceding navigation has rendered. The URL remains the saved state.
      const next = new URLSearchParams(pendingParams.current)
      for (const [key, value] of Object.entries(values)) {
        next.delete(key)
        if (value) next.set(key, String(value))
      }
      pendingParams.current = next
      setParams(next, { replace })
    },
    [setParams]
  )
  const selectNode = useCallback((node) => updateQuery({ node }), [updateQuery])
  const permissionMap = permissionState.data?.associations || emptyPermissions
  const filtered = filterIntegrationEntries(entries, query)
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(filtered.length / INTEGRATION_PAGE_SIZE))
  )
  const selected = entries.find((entry) => entry.key === query.rpc)
  const selectedPermissions = selected
    ? permissionMap.get(selected.key) || []
    : []
  const gateStatus = gateState.data
    ? qualityGateViewStatus(gateState.data, 'server', '')
    : null
  const permissionText = (entry) => {
    if (permissionState.loading) return '正在读取'
    if (permissionState.error) return '读取失败'
    const values = permissionMap.get(entry.key) || []
    return values.length
      ? values
          .slice(0, 2)
          .map((item) => item.name)
          .join('、') + (values.length > 2 ? ` 等 ${values.length} 项` : '')
      : '未登记'
  }
  const columns = [
    { title: '业务域', dataIndex: 'domain', width: 145 },
    {
      title: '方法',
      dataIndex: 'method',
      width: 300,
      render: (method, entry) => (
        <Button type="link" onClick={() => updateQuery({ rpc: entry.key })}>
          {method}
        </Button>
      ),
    },
    {
      title: '关联权限',
      key: 'permissions',
      width: 230,
      render: (_, entry) => permissionText(entry),
    },
    {
      title: '正式合同',
      key: 'contract',
      width: 120,
      render: (_, entry) =>
        entry.contract ? (
          <Link to={integrationContractLocation(entry.contract)}>
            {contractLabel(entry.contract)}
          </Link>
        ) : (
          '未逐项登记'
        ),
    },
    {
      title: '验证来源',
      key: 'evidence',
      width: 150,
      render: (_, entry) =>
        entry.contract?.references.length ? (
          <Button type="link" onClick={() => updateQuery({ rpc: entry.key })}>
            {entry.contract.references.length} 项回归来源
          </Button>
        ) : (
          '未关联回归来源'
        ),
    },
  ]

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page erp-dev-integration">
      <DevPageNav sourcePath="server/docs/api.md" />
      <header className="erp-dev-hub-header">
        <Typography.Title level={1}>接口与集成</Typography.Title>
      </header>
      <main className="erp-dev-integration__main">
        <nav
          className="erp-dev-project-relationships__links"
          aria-label="合同与验证入口"
        >
          {graph.destinations.map((destination) => (
            <Link key={destination.route} to={destination.route}>
              {destination.label}
            </Link>
          ))}
        </nav>
        <p className="erp-dev-integration__note">
          {RpcTransport.method} {RpcTransport.path} ·
          当前内部接口；权限登记供核对，回归来源与整体门禁不能证明逐接口验证通过。
        </p>
        <div className="erp-dev-integration__filters">
          <Select
            aria-label="筛选业务域"
            showSearch
            virtual={false}
            optionFilterProp="label"
            value={query.domain}
            options={[{ label: '全部业务域', value: '' }, ...domains]}
            onChange={(domain) => updateQuery({ domain, page: '', rpc: '' })}
          />
          <SearchInput
            aria-label="搜索业务域或方法"
            placeholder="搜索业务域或方法"
            allowClear
            value={query.q}
            onChange={(event) =>
              updateQuery({ q: event.target.value, page: '', rpc: '' }, true)
            }
          />
          <span role="status">
            {filtered.length} / {entries.length} 个接口
          </span>
          {query.domain || query.q ? (
            <Button
              onClick={() =>
                updateQuery({ domain: '', q: '', page: '', rpc: '' })
              }
            >
              清除筛选
            </Button>
          ) : null}
        </div>
        <div className="erp-dev-integration__source" aria-label="权限来源">
          {permissionState.loading ? (
            <span>正在读取登记开发库的权限关联，接口清单仍可查询。</span>
          ) : null}
          {permissionState.error ? (
            <span role="alert">权限关联读取失败，当前不能判断是否已登记。</span>
          ) : null}
          {permissionState.data ? (
            <DevTimestamp
              value={permissionState.data.readAt}
              action="权限登记读取于"
            />
          ) : null}
          <Button
            size="small"
            loading={permissionState.loading}
            onClick={() => setPermissionReload((value) => value + 1)}
          >
            {permissionState.error ? '重试权限读取' : '刷新权限关联'}
          </Button>
        </div>
        <section aria-label="接口清单" className="erp-dev-integration__table">
          <Table
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={filtered}
            scroll={{ x: 945 }}
            pagination={{
              ...DEV_PAGINATION,
              current: page,
              pageSize: INTEGRATION_PAGE_SIZE,
              showSizeChanger: false,
              onChange: (nextPage) =>
                updateQuery({ page: nextPage === 1 ? '' : nextPage }),
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有匹配的接口，请调整或清除筛选"
                />
              ),
            }}
          />
        </section>
        {query.rpc && !selected ? (
          <p role="status">
            该接口未在当前生成物中登记。
            <Button type="link" onClick={() => updateQuery({ rpc: '' })}>
              清除选择
            </Button>
          </p>
        ) : null}
        <section
          className="erp-dev-integration__source"
          aria-label="门禁整体证据"
        >
          <strong>门禁整体证据</strong>
          {!gateState.data && !gateState.error ? (
            <span>{gateState.loading ? '正在读取' : '尚未读取'}</span>
          ) : null}
          {gateState.error ? (
            <span role="alert">门禁证据读取失败，结果未验证。</span>
          ) : null}
          {gateStatus ? (
            <span>
              {gateStatus.title} ·{' '}
              {gateState.data.serverEvidence.gitSha
                ? `证据提交 ${gateState.data.serverEvidence.gitSha.slice(0, 12)}`
                : '缺少证据提交'}
              {!gateState.data.serverEvidence.current
                ? ' · 未匹配当前提交'
                : ''}
              {!gateState.data.serverEvidence.coversWorkingTree
                ? ' · 未覆盖当前工作区'
                : ''}
              {gateState.data.repository.dirty ? ' · 工作区有未提交改动' : ''}
            </span>
          ) : null}
          {gateState.data ? (
            <DevTimestamp value={gateState.data.generatedAt} action="读取于" />
          ) : null}
          <Button
            size="small"
            loading={gateState.loading}
            onClick={() => setGateReload((value) => value + 1)}
          >
            {gateReload ? '刷新门禁证据' : '读取门禁证据'}
          </Button>
          <Link to={DEV_QUALITY_GATES_ROUTE}>到质量门禁核对</Link>
        </section>
        <details
          className="erp-dev-integration__graph"
          open={graphOpen}
          onToggle={(event) => setGraphOpen(event.currentTarget.open)}
        >
          <summary>接入边界图</summary>
          {graphOpen ? (
            <div className="erp-dev-project-relationships">
              <DevProjectGraphView
                graph={graph}
                selectedNodeId={query.node}
                onNodeSelect={selectNode}
              />
            </div>
          ) : null}
        </details>
      </main>
      <Drawer
        title={
          selected ? `${selected.domain} / ${selected.method}` : '接口依据'
        }
        open={Boolean(selected)}
        width={680}
        onClose={() => updateQuery({ rpc: '' })}
      >
        {selected ? (
          <div className="erp-dev-integration__detail">
            <section>
              <h2>权限登记</h2>
              <p>{permissionText(selected)}</p>
              {selectedPermissions.map((permission) => (
                <div key={permission.key}>
                  <code>{permission.key}</code>
                  {permission.conditions.length ? (
                    <p>{permission.conditions.join('；')}</p>
                  ) : null}
                </div>
              ))}
            </section>
            <section>
              <h2>正式合同</h2>
              {selected.contract ? (
                <Link to={integrationContractLocation(selected.contract)}>
                  打开{contractLabel(selected.contract)}：
                  {selected.contract.heading.title}
                </Link>
              ) : (
                <p>未逐项登记，需回到所属 handler 与领域合同核对。</p>
              )}
              {selected.contract?.kind === 'detail' ? (
                <>
                  <h3>入参与边界</h3>
                  <Markdown source={selected.contract.fields} />
                  <h3>授权与结果</h3>
                  <Markdown source={selected.contract.authorization} />
                  <h3>并发与重试</h3>
                  <Markdown source={selected.contract.retry} />
                </>
              ) : selected.contract ? (
                <p>当前仅关联方法所在章节，不能据此认定字段合同完整。</p>
              ) : null}
            </section>
            <section>
              <h2>验证依据</h2>
              {selected.contract?.references.length ? (
                <ul>
                  {selected.contract.references.map((reference) => (
                    <li key={reference}>
                      <code>{reference}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>未关联回归来源。</p>
              )}
              <p>未关联逐接口运行回执，当前接口验证结果为未验证。</p>
              <Link to={DEV_QUALITY_GATES_ROUTE}>核对原始门禁与源码身份</Link>
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
