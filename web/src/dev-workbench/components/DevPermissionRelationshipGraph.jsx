import React from 'react'
import { Button, Space, Tag } from 'antd'
import FilterSelect from '@/common/components/select/FilterSelect'
import { MermaidDiagram } from '@/common/components/markdown'
import { WorkbenchEmpty } from './WorkbenchPattern.jsx'
import { PERMISSION_RELATIONSHIP_ALL_MODULES } from '../config/devPermissionRelationshipGraph.mjs'

export default function DevPermissionRelationshipGraph({
  model,
  moduleKey,
  moduleOptions,
  targetLabel,
  onChangeModule,
}) {
  const emptyModule =
    Boolean(moduleKey) &&
    moduleKey !== PERMISSION_RELATIONSHIP_ALL_MODULES &&
    model.summary.permissions === 0
  const moduleLabel =
    moduleOptions.find((item) => item.value === moduleKey)?.label || '所选模块'

  return (
    <div className="erp-permission-relationship__tab-panel">
      <div className="erp-permission-relationship__tab-toolbar">
        <FilterSelect
          emptyValue=""
          label="功能范围"
          placeholder="选择功能范围"
          aria-label="选择关系图功能范围"
          value={moduleKey}
          options={moduleOptions}
          onChange={onChangeModule}
        />
        <Space wrap size={[6, 6]} aria-label="权限关系图例">
          <Tag color="blue">账号</Tag>
          <Tag color="purple">岗位</Tag>
          <Tag color="green">最终可用</Tag>
          <Tag color="orange">岗位已选但受限</Tag>
          <Tag color="cyan">数据范围</Tag>
          <Tag color="gold">审批责任</Tag>
        </Space>
      </div>
      <section
        className="erp-permission-relationship__graph"
        aria-label="权限生效关系图"
      >
        {!moduleKey ? (
          <WorkbenchEmpty title="请选择功能范围" />
        ) : emptyModule ? (
          <WorkbenchEmpty
            title={`${targetLabel}未授予“${moduleLabel}”模块权限`}
            action={
              <Button
                onClick={() =>
                  onChangeModule(PERMISSION_RELATIONSHIP_ALL_MODULES)
                }
              >
                查看权限总览
              </Button>
            }
          />
        ) : (
          <MermaidDiagram
            chart={model.chart}
            label="权限生效关系图"
            showSourceOnError={false}
          />
        )}
      </section>
    </div>
  )
}
