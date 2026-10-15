import React, { forwardRef, useCallback } from 'react'
import { Tabs } from 'antd'
import useSlidingIndicator from './useSlidingIndicator'

const ANT_TABS_MOTION_DISABLED = Object.freeze({
  inkBar: false,
  tabPane: false,
})

const SlidingTabs = forwardRef(
  ({ className = '', style, ...props }, forwardedRef) => {
    const rootRef = useSlidingIndicator({
      containerSelector: '.ant-tabs-nav-list',
      itemSelector: '.ant-tabs-tab',
      selectedSelector: '.ant-tabs-tab-active',
    })
    const setRef = useCallback(
      (instance) => {
        rootRef.current = instance?.nativeElement || instance
        if (typeof forwardedRef === 'function') forwardedRef(instance)
        else if (forwardedRef) forwardedRef.current = instance
      },
      [forwardedRef, rootRef]
    )

    return (
      <Tabs
        {...props}
        ref={setRef}
        animated={ANT_TABS_MOTION_DISABLED}
        className={`erp-sliding-tabs ${className}`.trim()}
        style={style}
      />
    )
  }
)

SlidingTabs.displayName = 'SlidingTabs'

export default SlidingTabs
