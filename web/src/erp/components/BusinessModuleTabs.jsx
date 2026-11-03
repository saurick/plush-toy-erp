import React from 'react'
import Tabs from '@/common/components/navigation/SlidingTabs'
import TabList from '@/common/components/navigation/SlidingTabList'
import { restoreBusinessModuleTabPath } from '../utils/businessModuleGroups.mjs'
import { PageHeaderCard } from './business-list/BusinessListLayout.jsx'
import { warehouseViewPath } from '../utils/warehouseViews.mjs'
import './businessModuleTabs.css'

export default function BusinessModuleTabs({ workspace, cache, onNavigate, helpKey }) {
  if (!workspace || workspace.tabs.length === 0) return null
  const secondary = workspace.secondaryNavigation
  return (
    <PageHeaderCard
      compact
      className="erp-business-module-header"
      title={workspace.group.label}
      helpKey={helpKey || workspace.activeKey}
      viewSwitch={
        <>
          {workspace.tabs.length > 1 || workspace.group.key !== 'production' ? <Tabs
            className="erp-business-module-tabs"
            aria-label={`${workspace.group.label}页面`}
            activeKey={workspace.activeKey}
            items={workspace.tabs.map(({ key, label }) => ({ key, label }))}
            onChange={(key) => {
            const tab = workspace.tabs.find((item) => item.key === key)
            if (tab && key !== workspace.activeKey) onNavigate(restoreBusinessModuleTabPath(tab, cache))
          }}
          /> : null}
          {secondary?.items.length > 0 ? (
            <div className="erp-business-module-subnavigation">
              <TabList
                appearance="chips"
                className="erp-business-module-view-tabs"
                aria-label={secondary.label}
                value={secondary.activeKey}
                options={secondary.items.map(({ key, label }) => ({ value: key, label }))}
                onChange={(key) => {
                const target = warehouseViewPath(secondary, key)
                if (target) onNavigate(target)
              }}
              />
            </div>
        ) : null}
        </>
      }
    />
  )
}
