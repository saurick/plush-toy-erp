import { Tag } from 'antd'

const labels = {
  finish: '已验证',
  process: '进行中',
  error: '需处理',
  wait: '待执行',
}
const colors = { finish: 'success', process: 'processing', error: 'error' }

export function DeliveryTaskPath({
  title,
  items,
  columns = 3,
  ariaLabel = title,
}) {
  return (
    <section
      className="erp-dev-delivery-path"
      aria-label={ariaLabel}
      data-columns={columns}
    >
      {title ? <h2>{title}</h2> : null}
      <ol>
        {items.map((item, index) => (
          <li
            key={item.title}
            data-status={item.status || 'guide'}
            aria-current={item.status === 'process' ? 'step' : undefined}
          >
            <span className="erp-dev-delivery-path__number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <div className="erp-dev-delivery-path__title">
                <strong>{item.title}</strong>
                {item.status ? (
                  <Tag color={colors[item.status]}>
                    {labels[item.status] || '待核对'}
                  </Tag>
                ) : null}
              </div>
              <p>{item.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
