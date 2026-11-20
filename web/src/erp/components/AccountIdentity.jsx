import React from 'react'
import {
  getAdminAvatar,
  getAdminAccountName,
  getAdminRoleNames,
} from '../utils/adminIdentity.mjs'
import './accountIdentity.css'

export default function AccountIdentity({ profile, compact = false }) {
  const name = getAdminAccountName(profile)
  const username = String(profile?.username || '').trim()
  const avatar = getAdminAvatar(profile)
  const roles = getAdminRoleNames(profile)
  const roleLabel = `所属岗位：${roles.join('、') || (Array.isArray(profile?.roles) ? '未分配岗位' : '待确认')}`
  const superAdmin = profile?.is_super_admin === true
  const showAuthority = superAdmin && name !== '超级管理员'
  const summary = compact && showAuthority ? `超级管理员 · ${roleLabel}` : roleLabel

  return (
    <span className={`erp-account-identity${compact ? ' erp-account-identity--compact' : ''}`} data-testid="account-identity">
      <span className="erp-account-avatar" data-tone={avatar.tone} aria-hidden="true">
        {avatar.text}
      </span>
      <span className="erp-account-identity__copy">
        <strong className="erp-account-identity__name" title={name}>{name}</strong>
        {!compact && username && username !== name ? (
          <span className="erp-account-identity__username">账号：{username}</span>
        ) : null}
        {!compact && showAuthority ? (
          <span className="erp-account-identity__authority">超级管理员</span>
        ) : null}
        <span className="erp-account-identity__roles" title={summary}>{summary}</span>
      </span>
    </span>
  )
}
