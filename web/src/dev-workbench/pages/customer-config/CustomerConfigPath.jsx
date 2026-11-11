export function CustomerConfigPath({ label, items }) {
  return (
    <ol className="erp-dev-customer-operation-line" aria-label={label}>
      {items.map((item) => (
        <li key={item.title}>
          <strong>{item.title}</strong>
          {item.detail ? <span>：{item.detail}</span> : null}
        </li>
      ))}
    </ol>
  )
}
