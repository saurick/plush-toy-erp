const samples = (() => {
  const clients = [
    ['晨星礼品', 10, 3, 2, 4],
    ['海棠商贸', 8, 3, 2, 3],
    ['远帆玩具', 7, 3, 1, 2],
    ['麦芽文创', 6, 2, 1, 1],
    ['星河礼品', 5, 2, 0, 1],
    ['晴川商贸', 4, 2, 0, 1],
    ['青鸟文创', 3, 1, 0, 0],
    ['山间礼物', 2, 1, 0, 0],
    ['时光百货', 2, 1, 0, 0],
    ['鹿鸣玩具', 1, 0, 0, 0],
  ]
  const products = [
    '坐姿小熊',
    '长耳兔',
    '企鹅公仔',
    '南瓜抱枕',
    '围巾熊',
    '小象公仔',
  ]
  const orders = []
  let serial = 101
  clients.forEach(([customer, total, done, overdue, soon], ci) => {
    for (let i = 0; i < total; i++) {
      const status =
        i < done ? 'done' : i < done + overdue ? 'overdue' : 'pending'
      const near = status === 'pending' && i < done + overdue + soon
      const quantity = (3 + ((ci + i) % 6)) * 500
      const shipped =
        status === 'done'
          ? quantity
          : (ci + i) % 3 === 0
            ? 0
            : (quantity / 5) * ((ci + i) % 3)
      const due =
        status === 'overdue'
          ? '2026-10-01'
          : near
            ? `2026-10-${String(3 + ((ci + i) % 6)).padStart(2, '0')}`
            : `2026-10-${String(10 + ((ci * 2 + i) % 20)).padStart(2, '0')}`
      const price = 900 + ((ci + i) % 7) * 125
      orders.push({
        no: `SO-2609-${String(serial++).padStart(4, '0')}`,
        customer,
        product: products[(ci + i) % products.length],
        variant: [
          '棕色 / 25cm',
          '米白 / 30cm',
          '黑白 / 18cm',
          '橙色 / 35cm',
          '灰色 / 20cm',
          '蓝色 / 22cm',
        ][(ci + i) % 6],
        status,
        due,
        near,
        quantity,
        shipped,
        unit: '只',
        amount: quantity * price,
        shippedAmount: shipped * price,
        owner: ['陈敏', '李静', '周林', '刘芳'][ci % 4],
        attention:
          status === 'done'
            ? '已实际交齐'
            : status === 'overdue'
              ? ci % 2
                ? '尾批待包装'
                : '面料未到齐'
              : near
                ? '按交期跟进'
                : '按计划执行',
      })
    }
  })
  const financeCustomers = clients.map(([name], ci) => ({
    name,
    records: 3 + (ci % 3),
    notDue: 1800000 + ci * 110000,
    late7: [2800000, 3600000, 1200000, 800000, 600000, 0, 0, 0, 0, 0][ci],
    late30: [1400000, 0, 1260000, 0, 0, 0, 0, 0, 0, 0][ci],
    late60: ci === 0 ? 1200000 : 0,
    lateMore: 0,
    owner: ['陈敏', '李静', '李悦'][ci % 3],
  }))
  financeCustomers.forEach((c) => {
    c.records =
      ['notDue', 'late7', 'late30', 'late60', 'lateMore'].filter(
        (k) => c[k] > 0
      ).length + 2
  })
  return { orders, financeCustomers }
})()
const money = (value) =>
  `${Math.floor(value / 100)}${value % 100 ? `.${String(value % 100).padStart(2, '0')}` : ''}`
const matches = (row, status) =>
  status === 'all' ||
  (status === 'done' && row.status === 'done') ||
  (status === 'pending' && row.status !== 'done') ||
  (status === 'overdue' &&
    (row.status === 'overdue' || row.status.startsWith('late_'))) ||
  (status === 'pending_not_late' && row.status === 'pending') ||
  (status === 'soon' && row.near) ||
  row.status === status
const blankMetrics = () => ({
  count: 0,
  done: 0,
  pending: 0,
  closed: 0,
  unknown: 0,
  overdue: 0,
  soon: 0,
  undated: 0,
  missing_amount: 0,
  missing_shipment_amount: 0,
  amount: null,
  shipped_amount: null,
  balance: null,
  not_due: null,
  late_7: null,
  late_30: null,
  late_60: null,
  late_more: null,
  unknown_due: null,
})
const ageKeys = [
  'not_due',
  'late_7',
  'late_30',
  'late_60',
  'late_more',
  'unknown_due',
]
function metrics(rows, ages, restricted) {
  const result = blankMetrics()
  result.count = rows.length
  result.overdue = rows.filter((row) => matches(row, 'overdue')).length
  if (ages) {
    for (const key of ageKeys)
      { result[key] = money(
        rows
          .filter((row) => row.status === key)
          .reduce((sum, row) => sum + row.amount, 0)
      ) }
    result.balance = money(rows.reduce((sum, row) => sum + row.amount, 0))
  } else {
    result.done = rows.filter((row) => row.status === 'done').length
    result.pending = result.count - result.done
    result.soon = rows.filter((row) => row.near).length
    result.amount = money(rows.reduce((sum, row) => sum + row.amount, 0))
    result.shipped_amount = money(
      rows.reduce((sum, row) => sum + row.shippedAmount, 0)
    )
  }
  if (restricted) {
    delete result.amount
    delete result.shipped_amount
    delete result.missing_amount
    delete result.missing_shipment_amount
  }
  return result
}
export function statisticsFixtureData(
  params = {},
  { sources = false, ages = false, restricted = false } = {}
) {
  const group = params.group_by || 'customer'
  const period = params.period || 'month'
  const date_from =
    ages || period === 'all'
      ? ''
      : period === 'soon'
        ? '2026-10-02'
        : period === 'custom'
          ? params.date_from || ''
          : '2026-10-01'
  const date_to =
    ages || period === 'all'
      ? ''
      : period === 'soon'
        ? '2026-10-08'
        : period === 'custom'
          ? params.date_to || ''
          : '2026-10-31'
  let rows = ages
    ? samples.financeCustomers.flatMap((customer, ci) =>
        ['notDue', 'late7', 'late30', 'late60', 'lateMore']
          .filter((key) => customer[key] > 0)
          .map((key, index) => ({
            id: ci * 5 + index + 1,
            no: `AR-2610-${String(ci * 5 + index + 1).padStart(4, '0')}`,
            customer: customer.name,
            amount: customer[key],
            status: {
              notDue: 'not_due',
              late7: 'late_7',
              late30: 'late_30',
              late60: 'late_60',
              lateMore: 'late_more',
            }[key],
            due: key === 'notDue' ? '2026-10-15' : '2026-09-25',
            source: `SHP-2609-${ci * 5 + index + 1}`,
          }))
      )
    : samples.orders.map((row, index) => ({ ...row, id: index + 1 }))
  rows = rows.filter(
    (row) =>
      (!params.keyword ||
        (group === 'product' ? row.product : row.customer).includes(
          params.keyword
        )) &&
      (ages ||
        ((!date_from || row.due >= date_from) &&
          (!date_to || row.due <= date_to))) &&
      (params.currency || 'CNY') === 'CNY'
  )
  const counts = metrics(rows, ages, restricted)
  rows = rows.filter((row) => matches(row, params.status || 'all'))
  const meta = {
    snapshot_at: '2026-10-02T01:30:00Z',
    access: {
      sales: true,
      sales_amounts: !restricted,
      receivables: !restricted,
    },
    date_from,
    date_to,
  }
  const keyOf = (row) =>
    group === 'product'
      ? `p:${samples.orders.findIndex((item) => item.product === row.product) + 1}`
      : `c:${samples.financeCustomers.findIndex((item) => item.name === row.customer) + 1}`
  if (sources) {
    const selected = rows.filter((row) => keyOf(row) === params.group_key)
    const filtered = selected.filter((row) =>
      matches(row, params.source_status || 'all')
    )
    return {
      ...meta,
      group_name:
        group === 'product'
          ? selected[0]?.product || ''
          : selected[0]?.customer || '',
      total: filtered.length,
      rows: filtered
        .slice(params.offset || 0, (params.offset || 0) + (params.limit || 10))
        .map((row) => ({
          id: row.id,
          number: row.no,
          customer: row.customer,
          product: row.product || '',
          product_count: ages ? 0 : 1,
          due_date: row.due,
          status: row.status,
          owner: row.owner || '',
          unit: row.unit || '',
          ordered_quantity: ages ? null : String(row.quantity),
          shipped_quantity: ages ? null : String(row.shipped),
          ...(!restricted ? { amount: money(row.amount) } : {}),
          source_number: row.source || '',
        })),
    }
  }
  const grouped = [...new Set(rows.map(keyOf))]
    .map((key) => {
      const records = rows.filter((row) => keyOf(row) === key)
      return {
        key,
        name: group === 'product' ? records[0].product : records[0].customer,
        ...metrics(records, ages, restricted),
      }
    })
    .sort((a, b) =>
      params.sort === 'name'
        ? a.name.localeCompare(b.name, 'zh-CN')
        : b[
            params.sort === 'amount'
              ? ages
                ? 'balance'
                : 'amount'
              : params.sort || 'count'
          ] -
          a[
            params.sort === 'amount'
              ? ages
                ? 'balance'
                : 'amount'
              : params.sort || 'count'
          ]
    )
  return {
    ...meta,
    report: ages ? 'receivables' : 'delivery',
    group_by: group,
    ...(!restricted ? { currency: params.currency || 'CNY' } : {}),
    counts,
    totals: metrics(rows, ages, restricted),
    total: grouped.length,
    groups: grouped.slice(
      params.offset || 0,
      (params.offset || 0) + (params.limit || 10)
    ),
  }
}
