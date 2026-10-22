import { ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Space, Tag, Typography } from 'antd'
import DevTimestamp from '../../../components/DevTimestamp.jsx'

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
  return <Text type="secondary">{action.label}</Text>
}

export function DrillRow({ drill, recommended, onOpen }) {
  return (
    <tr className="erp-dev-recovery-row" data-priority={drill.priority}>
      <td>
        <Tag>{drill.priority}</Tag>
      </td>
      <th scope="row">
        <Button
          type="link"
          className="erp-dev-recovery-drill-link"
          aria-label={`查看${drill.title}要点`}
          onClick={(event) => onOpen(drill.key, event.currentTarget)}
        >
          {drill.title}
        </Button>
        {recommended ? <Tag color="blue">当前建议</Tag> : null}
      </th>
      <td>
        <Tag color={drill.statusPresentation.color}>
          {drill.statusPresentation.label}
        </Tag>
        <Tag color={drill.riskPresentation.color}>
          {drill.riskPresentation.label}
        </Tag>
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
      <Text strong>建议频率</Text>
      <Paragraph>{drill.cadence}</Paragraph>
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
      {drill.evidenceState.operationId ? (
        <Paragraph type="secondary">
          回执：{drill.evidenceState.operationId}
        </Paragraph>
      ) : null}
      {drill.evidenceState.at ? (
        <DevTimestamp
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
