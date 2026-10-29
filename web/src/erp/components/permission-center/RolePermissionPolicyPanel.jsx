import React, { useState } from 'react'
import { Alert, Button, Checkbox, Tag, Typography } from 'antd'
import { PermissionChecklist } from './PermissionChecklist.jsx'
import {
  readRolePermissionPolicy,
  constrainRolePermissionSelection,
} from '../../utils/rolePermissionPolicy.mjs'
import './role-permission-policy.css'

const { Text } = Typography

export function RolePermissionPolicyPanel({ role, ...checklist }) {
  const [showCore, setShowCore] = useState(false)
  const policy = readRolePermissionPolicy(role)
  if (!policy.registered) return <PermissionChecklist {...checklist} disabled />

  const selected = new Set(checklist.value)
  const saved = new Set(checklist.savedValue)
  const missing = policy.required.filter((key) => !selected.has(key))
  const outside = checklist.value.filter((key) => !policy.allowed.has(key))
  const needsRepair = missing.length > 0 || outside.length > 0
  const coreGroups = checklist.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => policy.required.includes(item.key)),
    }))
    .filter((group) => group.items.length)
  const optionalItems = checklist.groups
    .flatMap((group) => group.items)
    .filter((item) => policy.optional.includes(item.key))

  return (
    <div className="erp-role-policy" aria-label="岗位职责模板">
      {needsRepair ? (
        <Alert
          type="warning"
          showIcon
          message="当前配置与岗位职责不一致"
          description={`缺少 ${missing.length} 项核心功能，含 ${outside.length} 项模板外功能。核对后整理为模板范围，再保存。`}
          action={
            <Button
              disabled={checklist.disabled}
              onClick={() =>
                checklist.onChange(
                  constrainRolePermissionSelection(role, checklist.value)
                )
              }
            >
              按模板整理
            </Button>
          }
        />
      ) : null}
      <section className="erp-role-policy__section" aria-label="核心职责">
        <div className="erp-role-policy__head">
          <div>
            <Text strong>核心职责</Text>
            <Text type="secondary">{policy.required.length} 项必备功能</Text>
          </div>
          <div>
            {checklist.fullscreenAction}
            <Button
              size="small"
              aria-expanded={showCore}
              onClick={() => setShowCore(!showCore)}
            >
              {showCore ? '收起功能明细' : '查看功能明细'}
            </Button>
          </div>
        </div>
        <p>{role.description || '承担该岗位的业务办理及必要查询。'}</p>
        <div className="erp-role-policy__modules">
          {coreGroups.map((group) => (
            <Tag key={group.key}>
              {group.title} · {group.items.length}
            </Tag>
          ))}
        </div>
        <Text type="secondary">
          核心功能随岗位保留；需要承担另一岗位职责时，通过员工兼岗配置。
        </Text>
        {showCore ? (
          <PermissionChecklist
            {...checklist}
            groups={coreGroups}
            value={checklist.value.filter((key) => policy.required.includes(key))}
            savedValue={checklist.savedValue.filter((key) => policy.required.includes(key))}
            fullscreenAction={null}
            disabled
          />
        ) : null}
      </section>
      <section className="erp-role-policy__section" aria-label="可选辅助">
        <div className="erp-role-policy__head">
          <Text strong>可选辅助</Text>
          <Text type="secondary">仅在允许的范围内选择</Text>
        </div>
        <div className="erp-role-policy__options">
          {optionalItems.map((item) => {
            const decision = checklist.access?.permissions?.find(
              (entry) => entry.permission_key === item.key
            )
            const restricted =
              selected.has(item.key) && decision?.effective === false
            return (
              <div key={item.key} className="erp-role-policy__option">
                <Checkbox
                  data-permission-key={item.key}
                  checked={selected.has(item.key)}
                  disabled={checklist.disabled || needsRepair}
                  onChange={(event) =>
                    checklist.onChange(
                      event.target.checked
                        ? [...checklist.value, item.key]
                        : checklist.value.filter((key) => key !== item.key)
                    )
                  }
                >
                  {item.label}
                </Checkbox>
                <Text type={restricted ? 'warning' : 'secondary'}>
                  {selected.has(item.key) !== saved.has(item.key) ? (
                    <Tag color={selected.has(item.key) ? 'processing' : 'warning'}>
                      {selected.has(item.key) ? '待开启' : '待关闭'}
                    </Tag>
                  ) : null}
                  {restricted
                    ? '当前客户启用范围受限'
                    : item.description ||
                      '仅增加辅助入口，具体资料仍按来源权限读取。'}
                </Text>
              </div>
            )
          })}
        </div>
        <Text type="secondary">
          不改变审批、检验、过账条件；实际可用范围同时受客户设置和数据范围约束。
        </Text>
      </section>
    </div>
  )
}
