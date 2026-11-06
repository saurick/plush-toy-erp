import React from 'react'
import { useNavigate } from 'react-router-dom'
import Tabs from '@/common/components/navigation/SlidingTabs'
import TabList from '@/common/components/navigation/SlidingTabList'
import { restoreBusinessModuleTabPath } from '../utils/businessModuleGroups.mjs'
import { PageHeaderCard } from './business-list/BusinessListLayout.jsx'
import { warehouseViewPath } from '../utils/warehouseViews.mjs'
import './businessModuleTabs.css'

export function BusinessModuleViewTabs({ navigation }) {
  const navigate = useNavigate()
  if (!navigation?.items.length) return null
  return (
    <TabList
      appearance="chips"
      className="erp-business-module-view-tabs"
      aria-label={navigation.label}
      value={navigation.activeKey}
      options={navigation.items.map(({ key, label }) => ({ value: key, label }))}
      onChange={(key) => {
        const target = warehouseViewPath(navigation, key)
        if (target) navigate(target)
      }}
    />
  )
}

export default function BusinessModuleTabs({ workspace, cache, onNavigate, helpKey }) {
  if (!workspace || workspace.tabs.length === 0) return null
  return (
    <PageHeaderCard
      compact
      className="erp-business-module-header"
      title={workspace.group.label}
      helpKey={helpKey || workspace.activeKey}
      viewSwitch={
        workspace.tabs.length > 1 || workspace.group.key !== 'production' ? (
          <Tabs
            className="erp-business-module-tabs"
            aria-label={`${workspace.group.label}页面`}
            activeKey={workspace.activeKey}
            items={workspace.tabs.map(({ key, label }) => ({ key, label }))}
            onChange={(key) => {
              const tab = workspace.tabs.find((item) => item.key === key)
              if (tab && key !== workspace.activeKey) onNavigate(restoreBusinessModuleTabPath(tab, cache))
            }}
          />
        ) : null
      }
    />
  )
}
