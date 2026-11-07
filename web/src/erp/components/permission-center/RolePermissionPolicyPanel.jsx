import React from 'react'
import { Alert, Button } from 'antd'
import { PermissionChecklist } from './PermissionChecklist.jsx'
import {
  readRolePermissionPolicy,
  constrainRolePermissionSelection,
} from '../../utils/rolePermissionPolicy.mjs'
import './role-permission-policy.css'

export function RolePermissionPolicyPanel({ role, ...checklist }) {
  const policy = readRolePermissionPolicy(role)
  const outside = checklist.value.filter((key) => !policy.allowed.has(key))

  return (
    <div className="erp-role-policy" aria-label="岗位功能设置">
      {policy.registered && outside.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="当前配置包含不可分配的功能"
          description={`有 ${outside.length} 项功能超出业务权限范围，移除后才能保存。`}
          action={
            <Button
              disabled={checklist.disabled}
              onClick={() =>
                checklist.onChange(
                  constrainRolePermissionSelection(role, checklist.value)
                )
              }
            >
              移除不可分配功能
            </Button>
          }
        />
      ) : null}
      <PermissionChecklist
        {...checklist}
        disabled={checklist.disabled || !policy.registered}
      />
    </div>
  )
}
