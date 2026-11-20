import React from 'react'
import {
  ApartmentOutlined,
  BranchesOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FilterOutlined,
  FlagOutlined,
  FormOutlined,
  LockOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons'
import './diagramSemantics.css'

const icons = {
  task: UnorderedListOutlined,
  business_action: FormOutlined,
  document: FileTextOutlined,
  record: FileDoneOutlined,
  master: DatabaseOutlined,
  group: ApartmentOutlined,
  result: FlagOutlined,
  rule: BranchesOutlined,
  system: SettingOutlined,
  account: UserOutlined,
  role: TeamOutlined,
  scope: FilterOutlined,
  permission: LockOutlined,
}

export default function DiagramNodeIcon({ type }) {
  const Icon = icons[type]
  if (!Icon) throw new Error(`Unknown diagram icon: ${type}`)
  return <Icon className="erp-diagram-node-icon" data-node-type-icon={type} aria-hidden="true" />
}
