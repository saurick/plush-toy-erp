import React from 'react'
import Tabs from '@/common/components/navigation/SlidingTabs'
import { restoreBusinessModuleTabPath } from '../utils/businessModuleGroups.mjs'
import './businessModuleTabs.css'

export default function BusinessModuleTabs({ workspace, cache, onNavigate }) {
  if (!workspace || workspace.tabs.length === 0) return null
  return (
    <Tabs
      className="erp-business-module-tabs"
      aria-label={`${workspace.group.label}页面`}
      activeKey={workspace.activeKey}
      items={workspace.tabs.map(({ key, label }) => ({ key, label }))}
      onChange={(key) => {
        const tab = workspace.tabs.find((item) => item.key === key)
        if (tab) onNavigate(restoreBusinessModuleTabPath(tab.path, cache))
      }}
    />
  )
}
