import BusinessProgressSummary from '../../components/business-visualizations/BusinessProgressSummary.jsx'
import MobileProgressRecentRecords from './MobileProgressRecentRecords.jsx'

export default function MobileProgressSummary({ data, onSelectSection }) {
  const { row, access, sections } = data
  const task = access.tasks
    ? sections.tasks?.find((item) => item.label === row.attention_task) ||
      sections.tasks?.[0]
    : null
  return (
    <>
      <BusinessProgressSummary
        row={row}
        access={access}
        sections={sections}
        onSelectSection={onSelectSection}
      />
      <MobileProgressRecentRecords task={task} canRead={access.tasks} />
    </>
  )
}
