import React from 'react'
import Tabs from '@/common/components/navigation/SlidingTabs'
import { restoreBusinessModuleTabPath } from '../utils/businessModuleGroups.mjs'
import { PageHeaderCard } from './business-list/BusinessListLayout.jsx'
import './businessModuleTabs.css'

export default function BusinessModuleTabs({ workspace, cache, onNavigate, helpKey }) {
  if (!workspace || workspace.tabs.length === 0) return null
  return (
    <PageHeaderCard
      compact
      className="erp-business-module-header"
      title={workspace.group.label}
      helpKey={helpKey || workspace.activeKey}
      viewSwitch={
        workspace.tabs.length > 1 || workspace.group.key !== 'production' ? <Tabs
          className="erp-business-module-tabs"
          aria-label={`${workspace.group.label}页面`}
          activeKey={workspace.activeKey}
          items={workspace.tabs.map(({ key, label }) => ({ key, label }))}
          onChange={(key) => {
            const tab = workspace.tabs.find((item) => item.key === key)
            if (tab && key !== workspace.activeKey) onNavigate(restoreBusinessModuleTabPath(tab, cache))
          }}
        /> : null
      }
    />
  )
}
