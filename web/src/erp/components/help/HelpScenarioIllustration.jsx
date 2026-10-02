import React from 'react'

const letters = ['A', 'B', 'C']

function ExampleTable({ headings, rows }) {
  return (
    <div className="erp-help-example__table">
      <table>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HelpScenarioIllustration({
  scenarioKey,
  visual,
  point,
  onSelect,
  roleKey,
}) {
  const area = (index, children) => (
    <div className="erp-help-example__area" data-active={point === index}>
      <button
        type="button"
        className="erp-help-point"
        aria-label={`图解 ${letters[index]}：${visual.points[index][0]}`}
        aria-pressed={point === index}
        onClick={() => onSelect(index)}
      >
        {letters[index]}
      </button>
      <div className="erp-help-example__content">{children}</div>
    </div>
  )
  let content
  switch (scenarioKey) {
    case 'engineering-material-request':
      content = (
        <>
          {area(
            0,
            <>
              <div className="erp-help-example__row">
                <strong>订单 SO-DEMO-001</strong>
                <span className="erp-help-example__status">教学示例</span>
              </div>
              <p>示例公仔 · BOM V1 · 示例布料厂</p>
              <span className="erp-help-muted">
                订单已生效 · 样品已确认 · BOM 已启用
              </span>
            </>
          )}
          {area(
            1,
            <>
              <strong>短毛绒 · 单位：米</strong>
              <ExampleTable
                headings={['生产数量', '单位用量', '损耗', '总用数量']}
                rows={[['1,020 件', '0.20 米', '5%', '214.2 米']]}
              />
              <div className="erp-help-example__row">
                <span>当前库存参考 30 米</span>
                <strong>采购数量 214.2 米</strong>
              </div>
              <p className="erp-help-muted">库存仅供参考，不自动抵扣。</p>
            </>
          )}
          {area(
            2,
            <div className="erp-help-example__row">
              <span className="erp-help-muted">按本岗位核对并办理</span>
              <span className="erp-help-example__action">
                {{
                  engineering: '提交老板审核',
                  boss: '确认通过，交财务',
                  finance: '批准并生成采购订单',
                  purchase: '查看生成的采购订单',
                }[roleKey] || '查看本轮申请'}
              </span>
            </div>
          )}
        </>
      )
      break
    case 'finished-goods':
      content = (
        <>
          {area(
            0,
            <>
              <div className="erp-help-example__row">
                <strong>完工报告 PF-DEMO-001</strong>
                <span className="erp-help-example__status">待入库</span>
              </div>
              <p>示例公仔 · 18 cm</p>
              <span className="erp-help-muted">报告数量 100 件</span>
            </>
          )}
          {area(
            1,
            <>
              <div className="erp-help-example__fields">
                <span>
                  入库仓库<strong>成品仓</strong>
                </span>
                <span>
                  批次<strong>LOT-DEMO-001</strong>
                </span>
              </div>
              <div className="erp-help-example__quantity">
                <span>
                  本次实收
                  <strong>
                    100 <small>件</small>
                  </strong>
                </span>
                <span className="erp-help-muted">与报告数量一致</span>
              </div>
            </>
          )}
          {area(
            2,
            <div className="erp-help-example__row">
              <span className="erp-help-muted">核对无误后办理</span>
              <span className="erp-help-example__action">确认成品入库</span>
            </div>
          )}
        </>
      )
      break
    case 'finance-payments':
      content = (
        <>
          {area(
            0,
            <>
              <div className="erp-help-example__row">
                <strong>收款 · 示例客户</strong>
                <span className="erp-help-example__status">草稿</span>
              </div>
              <div className="erp-help-example__quantity">
                <span>
                  本次收款
                  <strong>
                    1,000 <small>元</small>
                  </strong>
                </span>
                <span className="erp-help-muted">人民币 CNY</span>
              </div>
            </>
          )}
          {area(
            1,
            <>
              <strong>核销分配</strong>
              <ExampleTable
                headings={['来源单据', '未核销', '本次分配']}
                rows={[
                  ['AR-DEMO-001', '1,000', '600'],
                  ['AR-DEMO-002', '500', '400'],
                ]}
              />
              <div className="erp-help-example__row">
                <span className="erp-help-muted">分配合计</span>
                <strong>1,000 元</strong>
              </div>
            </>
          )}
          {area(
            2,
            <div className="erp-help-example__sequence">
              <span>保存</span>
              <span aria-hidden="true">→</span>
              <span>按配置审批</span>
              <span aria-hidden="true">→</span>
              <strong>确认过账</strong>
            </div>
          )}
        </>
      )
      break
    case 'material-bom':
      content = (
        <>
          {area(
            0,
            <>
              <div className="erp-help-example__row">
                <strong>示例公仔 · 18 cm</strong>
                <span className="erp-help-example__status">草稿</span>
              </div>
              <p>BOM 版本 V2</p>
            </>
          )}
          {area(
            1,
            <>
              <strong>短毛绒 · 米色</strong>
              <ExampleTable
                headings={['部位', '单位', '单件用量', '损耗']}
                rows={[
                  ['头部', '米', '0.12', '3%'],
                  ['身体', '米', '0.18', '3%'],
                  ['手脚', '米', '0.08', '3%'],
                ]}
              />
            </>
          )}
          {area(
            2,
            <div className="erp-help-example__row">
              <span className="erp-help-muted">核对用量与损耗</span>
              <span className="erp-help-example__action">激活版本</span>
            </div>
          )}
        </>
      )
      break
    case 'inventory-query':
      content = (
        <>
          {area(
            0,
            <>
              <strong>库存查询</strong>
              <div className="erp-help-example__filters">
                <span>示例公仔</span>
                <span>成品仓</span>
                <span>全部批次</span>
              </div>
            </>
          )}
          {area(
            1,
            <div className="erp-help-example__bars">
              {[
                ['库存余额', 340],
                ['已预留', 80],
                ['可用量', 260],
              ].map(([label, quantity]) => (
                <div key={label}>
                  <span>{label}</span>
                  <span className="erp-help-example__track">
                    <span style={{ width: `${(quantity / 340) * 100}%` }} />
                  </span>
                  <strong>{quantity}</strong>
                </div>
              ))}
            </div>
          )}
          {area(
            2,
            <div className="erp-help-example__row">
              <span className="erp-help-muted">从库存变动追查</span>
              <span className="erp-help-example__link">查看来源单据 →</span>
            </div>
          )}
        </>
      )
      break
    default:
      return null
  }
  return (
    <figure
      className="erp-help-example"
      aria-label={`${visual.title}操作位置示意`}
    >
      <figcaption>
        <strong>{visual.entry}</strong>
        <span>操作位置示意 · 示例数据</span>
      </figcaption>
      {content}
    </figure>
  )
}
