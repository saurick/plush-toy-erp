import React from 'react'
import { Loading } from '@/common/components/loading'
import { BusinessViewPanel } from './business-visualizations/BusinessVisualizationFrame.jsx'
import './businessSwitchContent.css'

export default function BusinessSwitchContent({ pending, scopeKey = 'content', children }) {
  return (
    <div className="erp-business-switch-content" aria-busy={pending || undefined}>
      {pending ? <Loading className="erp-business-switch-content__feedback" title="正在切换…" description={null} /> : null}
      <BusinessViewPanel active viewKey={scopeKey} markView={false} pending={pending}>{children}</BusinessViewPanel>
    </div>
  )
}
