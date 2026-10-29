import React, { useMemo } from 'react'
import { Button, Tag } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import AppSelect from '@/common/components/select/AppSelect'
import FilterSelect from '@/common/components/select/FilterSelect'
import {
  WorkbenchFacts,
  WorkbenchSection,
  WorkbenchToolbar,
} from '../WorkbenchPattern.jsx'
import { WORKFLOW_TASK_COLLABORATION_ACTIONS } from '../../../erp/utils/workflowTaskActionFlow.mjs'
import { TASK_HANDLING_KINDS } from '../../../erp/utils/taskHandlingPolicy.mjs'
import { getRoleDisplayName } from '../../../erp/utils/roleKeys.mjs'
import BusinessActionRelations from './BusinessActionRelations.jsx'

import { PermissionLabel } from '../../../common/consts/permissions.generated.mjs'
import {
  MOBILE_HANDLING_LABELS,
  TASK_HANDLING_ROWS,
  TASK_HANDLING_ROLE_KEYS,
  readTaskHandlingSearch,
  patchTaskHandlingSearch,
  taskHandlingActions,
} from '../../config/devTaskHandling.mjs'
import './taskHandlingMatrix.css'

export default function TaskHandlingMatrix({ businessCatalog, onOpenRules }) {
  const [params, setParams] = useSearchParams()
  const { role, kind, mobile, stage, action } = readTaskHandlingSearch(params)
  const rows = TASK_HANDLING_ROWS
  const selected = rows.find((row) => row.key === stage)
  const filtered = rows.filter(
    (row) =>
      (!role || row.roleKeys.includes(role)) &&
      (!kind || row.kind === kind) &&
      (!mobile || row.mobile === mobile)
  )
  const patch = (key, value) =>
    setParams((before) =>
      patchTaskHandlingSearch(before, {
        [key]: value,
        ...(!['stage', 'action'].includes(key) ? { stage: null } : {}),
        ...(key !== 'action' ? { action: null } : {}),
      })
    )
  const actions = useMemo(
    () => taskHandlingActions(businessCatalog, stage),
    [businessCatalog, stage]
  )
  const selectedAction =
    actions.find((item) => item.key === action) ||
    (action === undefined ? actions[0] : null)
  const details = selected ? (
    <WorkbenchSection
      title={selected.label}
      tools={<Button onClick={() => patch('stage', '')}>收起</Button>}
    >
      <p>
        {selected.scope ||
          (selected.mobile === 'desktop'
            ? '电脑可编制与修改，手机仅查看资料和结果。'
            : '电脑可完成本次办理；手机提供相同规则下的适用操作。')}
      </p>
      <WorkbenchFacts
        aria-label="本项操作分工"
        items={[
          { label: '业务办理', value: selected.operationLabels?.length ? selected.operationLabels.join(' / ') : selected.input },
          { label: '提交结果', value: selected.handoff },
          { label: '任务协作', value: '按当前任务状态与后端权限显示；不代替本项业务提交。' },
        ]}
      />
      {selected.processRefs ? (
        <WorkbenchFacts
          aria-label="当前任务节点"
          items={[
              {
                label: '办理岗位',
                value:
                  selected.roleKeys
                    .map((key) => getRoleDisplayName(key))
                    .join('、') || '按任务分派',
              },
              {
                label: '所属流程',
                value: [
                  ...new Set(
                    selected.processRefs.map(
                      ({ definition }) => definition.label
                    )
                  ),
                ].join(' / '),
              },
              {
                label: '所需权限',
                value: [
                  ...new Set(
                    selected.processRefs.flatMap(({ node }) => node.permission)
                  ),
                ]
                  .map((key) => PermissionLabel[key] || '对应业务权限')
                  .join('、'),
              },
              {
                label: '下一环节',
                value: [
                  ...new Set(
                    selected.processRefs.flatMap(({ definition, node }) =>
                      definition.edges
                        .filter((edge) => edge.from === node.key)
                        .map(
                          (edge) =>
                            definition.nodes.find(
                              (next) => next.key === edge.to
                            ).label
                        )
                    )
                  ),
                ].join(' / '),
              },
            ]}
        />
      ) : actions.length ? (
        <>
          {actions.length > 1 ? (
            <AppSelect
              label="关联动作"
              aria-label="关联动作"
              placeholder="选择关联动作"
              value={selectedAction?.key}
              virtual={false}
              options={actions.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
              onChange={(value) => patch('action', value ?? '')}
            />
          ) : null}
          {selectedAction ? (
            <BusinessActionRelations
              actions={[selectedAction]}
              onOpenRules={onOpenRules}
            />
          ) : null}
        </>
      ) : (
        <p>具体责任与完成条件以实际任务为准。</p>
      )}
    </WorkbenchSection>
  ) : null
  return (
    <section className="erp-dev-task-matrix" aria-label="任务清单">
      <WorkbenchToolbar>
        <FilterSelect
          label="办理岗位"
          aria-label="办理岗位"
          placeholder="选择办理岗位"
          virtual={false}
          value={role}
          onChange={(value) => patch('role', value)}
          options={TASK_HANDLING_ROLE_KEYS.map((key) => ({
            value: key,
            label: getRoleDisplayName(key),
          }))}
        />
        <FilterSelect
          label="办理类型"
          aria-label="办理类型"
          placeholder="选择办理类型"
          value={kind}
          onChange={(value) => patch('kind', value)}
          options={Object.entries(TASK_HANDLING_KINDS)
            .filter(([key]) => key !== 'automatic')
            .map(([value, item]) => ({ value, label: item.label }))}
        />
        <FilterSelect
          label="手机支持"
          aria-label="手机支持"
          placeholder="选择手机支持范围"
          value={mobile}
          onChange={(value) => patch('mobile', value)}
          options={Object.entries(MOBILE_HANDLING_LABELS)
            .filter(([key]) => key !== 'observe')
            .map(([value, label]) => ({ value, label }))}
        />
        <Button
          onClick={() =>
            setParams((before) =>
              patchTaskHandlingSearch(before, {
                role: null,
                kind: null,
                mobile: null,
                stage: null,
                action: null,
              })
            )
          }
        >
          重置
        </Button>
      </WorkbenchToolbar>
      <p className="erp-dev-task-matrix__scope" role="status">
        {filtered.length} / {rows.length} 项办理 ·
        按本项办理责任筛选；可配置审批列示流程默认岗位，实际以生效配置和任务分派为准。
      </p>
      <Table
        size="small"
        rowKey="key"
        dataSource={filtered}
        pagination={false}
        expandable={{
          showExpandColumn: false,
          expandedRowKeys: selected ? [selected.key] : [],
          expandedRowRender: () => details,
        }}
        tableLayout="fixed"
        scroll={{ x: 1000 }}
        columns={[
          {
            title: '办理事项',
            key: 'stage',
            width: '19%',
            render: (_, row) => (
              <>
                <Button
                  type="link"
                  onClick={() => patch('stage', row.key)}
                  aria-expanded={selected?.key === row.key}
                >
                  {row.label}
                </Button>
                <small className="erp-dev-task-matrix__stage-group">{row.group}</small>
              </>
            ),
          },
          {
            title: '办理岗位',
            key: 'roles',
            width: '9%',
            render: (_, row) => (
              <>
                {row.roleKeys.map((key) => getRoleDisplayName(key)).join('、') || '按任务分派'}
                {row.roleNote ? <small>{row.roleNote}</small> : null}
              </>
            ),
          },
          {
            title: '办理类型',
            dataIndex: 'kindLabel',
            key: 'kind',
            width: 128,
          },
          {
            title: '本次办理',
            dataIndex: 'input',
            key: 'input',
            render: (input, row) => row.operationLabels?.length ? <><strong>{row.operationLabels.join(' / ')}</strong><small>{input}</small></> : input,
          },
          { title: '审批与交接', dataIndex: 'handoff', key: 'handoff' },
          {
            title: '电脑',
            key: 'desktop',
            width: 84,
            render: (_, row) => (
              <Tag>{row.kind === 'automatic' ? '仅查看结果' : '可办理'}</Tag>
            ),
          },
          {
            title: '手机',
            key: 'mobile',
            width: 112,
            render: (_, row) => <Tag>{MOBILE_HANDLING_LABELS[row.mobile]}</Tag>,
          },
        ]}
      />
      <WorkbenchSection title="操作分组与显示条件">
        <p>第二步底部将通用任务协作与当前业务办理分开。业务办理使用原编辑器的保存、提交、审批或执行动作；当前对象、状态及权限决定具体按钮。附件作为资料入口保留，复制操作放在页头。</p>
        <dl className="erp-dev-task-matrix__collaboration" aria-label="通用任务协作条件">
          {Object.entries(WORKFLOW_TASK_COLLABORATION_ACTIONS).map(([key, item]) => (
            <div key={key}><dt>{item.label}</dt><dd>{item.condition}</dd></div>
          ))}
        </dl>
        <p>审批通过、审批退回、退回工程、实际发货、入库过账等属于本项业务。标记任务受阻只记录协作卡点，解除任务阻塞只恢复任务办理；两者都不能替代业务退回、冲正或过账。</p>
      </WorkbenchSection>
    </section>
  )
}
