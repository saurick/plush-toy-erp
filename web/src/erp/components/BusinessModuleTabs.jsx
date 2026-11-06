import React, { useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Tabs from '@/common/components/navigation/SlidingTabs'
import TabList from '@/common/components/navigation/SlidingTabList'
import { restoreBusinessModuleTabPath } from '../utils/businessModuleGroups.mjs'
import { PageHeaderCard } from './business-list/BusinessListLayout.jsx'
import { warehouseViewPath } from '../utils/warehouseViews.mjs'
import { useBusinessSplit } from './business-list/BusinessSplitContext.jsx'
import './businessModuleTabs.css'
import useResponsiveSwitch from '@/common/components/navigation/useResponsiveSwitch.js'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'

export function BusinessModuleViewTabs({ navigation, onPendingChange }) {
  const navigate = useNavigate()
  const context = useBusinessPageContext()
  const split = useBusinessSplit()
  const viewSwitch = useResponsiveSwitch(navigation?.activeKey, navigation ? `${navigation.pathname}${navigation.search}` : '')
  useLayoutEffect(() => { onPendingChange?.(viewSwitch.pending) }, [onPendingChange, viewSwitch.pending])
  if (!navigation?.items.length) return null
  const changeView = (key) => {
    if (key === navigation.activeKey && !viewSwitch.pending) {
      viewSwitch.cancel()
      return
    }
    const target = warehouseViewPath({ ...navigation, activeKey: null }, key)
    if (!target) return
    if (!onPendingChange || split?.open) {
      navigate(target)
      return
    }
    viewSwitch.request(key, () => navigate(target), { before: context?.confirmPageLeave })
  }
  return (
    <TabList
      appearance="chips"
      className="erp-business-module-view-tabs"
      aria-label={navigation.label}
      value={viewSwitch.selected}
      options={navigation.items.map(({ key, label }) => ({ value: key, label }))}
      onChange={changeView}
      onReselect={changeView}
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
            onTabClick={(key) => {
              const tab = workspace.tabs.find((item) => item.key === key)
              if (tab) onNavigate(restoreBusinessModuleTabPath(tab, cache))
            }}
          />
        ) : null
      }
    />
  )
}
