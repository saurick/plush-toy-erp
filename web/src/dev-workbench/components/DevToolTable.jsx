import React from 'react'
import { Button, Empty, Tooltip } from 'antd'
import {
  PushpinFilled,
  PushpinOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import {
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../config/devRoutes.mjs'

export default function DevToolTable({
  items,
  ariaLabel = '开发工具清单',
  showGroup = false,
  pinnedRoutes = [],
  onTogglePinned,
  onReset,
  emptyDescription = '没有匹配的工具',
}) {
  if (!items.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={emptyDescription}
      >
        {onReset ? <Button onClick={onReset}>清除筛选</Button> : null}
      </Empty>
    )
  }
  return (
    <div className="erp-dev-tool-table-wrap erp-dev-tool-directory">
      <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col">工具</th>
            {showGroup ? <th scope="col">所属领域</th> : null}
            <th scope="col">用来做什么</th>
            {onTogglePinned ? (
              <th scope="col" className="erp-dev-tool-table__pin">
                常用
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const title = DEV_PAGE_TITLE_BY_ROUTE[item.route] || item.title
            const pinned = pinnedRoutes.includes(item.route)
            return (
              <tr key={item.key} data-tool-key={item.key}>
                <th scope="row">
                  <div className="erp-dev-tool-table__identity">
                    <Link to={item.route}>{title}</Link>
                  </div>
                </th>
                {showGroup ? (
                  <td className="erp-dev-tool-table__group">
                    {
                      DEV_WORKSPACE_NAV_ITEMS.find(
                        (area) => area.key === item.areaKey
                      )?.label
                    }
                  </td>
                ) : null}
                <td>{item.description}</td>
                {onTogglePinned ? (
                  <td className="erp-dev-tool-table__pin">
                    <Tooltip title={pinned ? '取消置顶' : '置顶入口'}>
                      <Button
                        size="small"
                        type="text"
                        icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
                        aria-label={`${pinned ? '取消置顶' : '置顶'}${title}`}
                        aria-pressed={pinned}
                        onClick={() => onTogglePinned(item.route)}
                      />
                    </Tooltip>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
