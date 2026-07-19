import React from 'react'
import {
  AppstoreOutlined,
  BarChartOutlined,
  DashboardOutlined,
  PrinterOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { commandCenterGroups } from '../config/commandCenter.mjs'

const { Text } = Typography

const COMMAND_CENTER_ICON_MAP = Object.freeze({
  workbench: DashboardOutlined,
  'task-board': UnorderedListOutlined,
  'business-board': BarChartOutlined,
  'print-center': PrinterOutlined,
})

export default function CommandCenterNav({ activeKey, onSelect }) {
  const navigate = useNavigate()

  const handleSelect = (item) => {
    if (typeof onSelect === 'function') {
      onSelect(item)
      return
    }
    navigate(item.path)
  }

  return (
    <aside className="erp-command-center-rail" aria-label="后台运营导航">
      <div className="erp-command-center-rail-brand">
        <span className="erp-command-center-rail-brand-icon">
          <AppstoreOutlined />
        </span>
        <div>
          <Text strong>运营中枢</Text>
          <Text type="secondary">工作台 / 看板 / 工具</Text>
        </div>
      </div>
      <nav className="erp-command-center-rail-nav">
        {commandCenterGroups.map((group) => (
          <div className="erp-command-center-rail-group" key={group.title}>
            <Text className="erp-command-center-rail-group-title">
              {group.title}
            </Text>
            {group.items.map((item) => {
              const Icon = COMMAND_CENTER_ICON_MAP[item.key] || AppstoreOutlined
              const active = item.key === activeKey
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`erp-command-center-rail-btn${
                    active ? ' erp-command-center-rail-btn--active' : ''
                  }`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleSelect(item)}
                >
                  <span className="erp-command-center-rail-btn-icon">
                    <Icon />
                  </span>
                  <span className="erp-command-center-rail-btn-copy">
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
