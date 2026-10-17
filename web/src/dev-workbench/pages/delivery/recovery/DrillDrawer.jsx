import { Drawer } from 'antd'
import { DrillDetail } from './shared.jsx'

export function DrillDrawer({
  customerReady,
  drillTriggerRef,
  loading,
  navigateWithinCustomerScope,
  overview,
  refresh,
  refreshing,
  selectedDrillKey,
  setSelectedDrillKey,
}) {
  return (
    <Drawer
      title={
        overview.drills.find((drill) => drill.key === selectedDrillKey)
          ?.title || '演练要点'
      }
      open={Boolean(selectedDrillKey)}
      width={600}
      onClose={() => setSelectedDrillKey('')}
      afterOpenChange={(open) => {
        if (!open) drillTriggerRef.current?.focus({ preventScroll: true })
      }}
      destroyOnHidden
    >
      {overview.drills
        .filter((drill) => drill.key === selectedDrillKey)
        .map((drill) => (
          <DrillDetail
            key={drill.key}
            drill={drill}
            refreshing={loading || refreshing}
            disabled={!customerReady}
            onRefresh={refresh}
            onNavigate={navigateWithinCustomerScope}
          />
        ))}
    </Drawer>
  )
}
