import { ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Typography } from 'antd'
import DevDeliveryTimestamp from '../../../components/DevDeliveryTimestamp.jsx'

const { Paragraph, Text } = Typography

export const RECOVERY_VIEWS = [
  { value: 'security', label: '安全核验' },
  { value: 'drills', label: '恢复演练' },
  { value: 'emergency', label: '应急指引' },
]

export function DrillAction({
  action,
  refreshing,
  disabled = false,
  onRefresh,
  onNavigate,
}) {
  if (action.type === 'refresh') {
    return (
      <Button
        icon={<ReloadOutlined aria-hidden="true" />}
        loading={refreshing}
        disabled={disabled}
        onClick={onRefresh}
      >
        {action.label}
      </Button>
    )
  }
  if (action.type === 'route') {
    return (
      <Button
        icon={<RightOutlined aria-hidden="true" />}
        disabled={disabled}
        onClick={() => onNavigate(action.route)}
      >
        {action.label}
      </Button>
    )
  }
  return <Button disabled>{action.label}</Button>
}

export function DrillRow({ drill, recommended, onOpen }) {
  return (
    <tr className="erp-dev-recovery-row" data-priority={drill.priority}>
      <td>
        <Tag>{drill.priority}</Tag>
      </td>
      <th scope="row">
        <strong>{drill.title}</strong>
        {recommended ? <Tag color="blue">当前建议</Tag> : null}
        <small>{drill.objective}</small>
      </th>
      <td>
        <Tag color={drill.statusPresentation.color}>
          {drill.statusPresentation.label}
        </Tag>
        <Tag color={drill.riskPresentation.color}>
          {drill.riskPresentation.label}
        </Tag>
      </td>
      <td>{drill.cadence}</td>
      <td>
        <Button
          aria-label={`查看${drill.title}要点`}
          onClick={(event) => onOpen(drill.key, event.currentTarget)}
        >
          查看要点
        </Button>
      </td>
    </tr>
  )
}

export function DrillDetail({
  drill,
  refreshing,
  disabled,
  onRefresh,
  onNavigate,
}) {
  return (
    <div className="erp-dev-recovery-row__detail">
      <Space wrap>
        <Tag>{drill.priority}</Tag>
        <Tag color={drill.statusPresentation.color}>
          {drill.statusPresentation.label}
        </Tag>
        <Tag color={drill.riskPresentation.color}>
          {drill.riskPresentation.label}
        </Tag>
      </Space>
      <div className="erp-dev-recovery-row__purpose">
        <Text strong>目的</Text>
        <Paragraph>{drill.objective}</Paragraph>
      </div>
      <Text strong>变化时触发</Text>
      <Paragraph>{drill.trigger}</Paragraph>
      <Text strong>完成证据</Text>
      <ol>
        {drill.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <Paragraph type="secondary">{drill.boundary}</Paragraph>
      <Text strong>最近证据</Text>
      <Paragraph>{drill.evidenceState.note}</Paragraph>
      {drill.evidenceState.at ? (
        <DevDeliveryTimestamp
          value={drill.evidenceState.at}
          action="核验于"
          missing="时间未证明"
        />
      ) : null}
      <DrillAction
        action={drill.action}
        refreshing={refreshing}
        disabled={disabled}
        onRefresh={onRefresh}
        onNavigate={onNavigate}
      />
    </div>
  )
}
