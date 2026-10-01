import React from 'react'
import { Alert, Skeleton, Space, Tag, Typography } from 'antd'
import { PERMISSION_NAVIGATION_STATE } from '../config/devPermissionNavigation.mjs'

const { Text, Title } = Typography

function modeTagColor(mode = '') {
  if (mode === 'custom') return 'purple'
  if (mode === 'merged') return 'geekblue'
  return 'green'
}

function MenuItems({ items = [], emptyText = '当前没有可显示入口' }) {
  if (items.length === 0) {
    return <Text type="secondary">{emptyText}</Text>
  }
  return (
    <ol className="erp-permission-navigation__items">
      {items.map((item) => (
        <li key={item.path || item.key}>
          <span className="erp-permission-navigation__order" aria-hidden="true">
            {item.order}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ol>
  )
}

export default function DevPermissionNavigationOverview({
  model,
  loading = false,
}) {
  const unavailable = model?.state === PERMISSION_NAVIGATION_STATE.UNAVAILABLE
  const blocked = model?.state === PERMISSION_NAVIGATION_STATE.BLOCKED
  const groups = [
    {
      key: 'work',
      title: '工作中心',
      items: model?.dashboardItems || [],
    },
    {
      key: 'primary',
      title: '常用工作',
      items: model?.primaryItems || [],
    },
    ...(model?.secondarySections || []),
  ].filter((group) => group.items.length > 0)

  return (
    <section
      className="erp-permission-navigation"
      aria-labelledby="permission-navigation-title"
      aria-busy={loading}
    >
      <div className="erp-permission-relationship__section-head">
        <div>
          <Title id="permission-navigation-title" level={5}>
            实际侧栏 / 可用菜单
          </Title>
          <Text type="secondary">
            完整展示当前选择登录后如何找到页面；不会随“功能范围”筛选缩小。
          </Text>
        </div>
        <Space wrap size={[6, 6]}>
          <Tag color="blue">完整导航</Tag>
          {model?.modeLabel ? (
            <Tag color={unavailable ? 'orange' : modeTagColor(model?.mode)}>
              {model.modeLabel}
            </Tag>
          ) : null}
        </Space>
      </div>

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : unavailable ? (
        <Alert
          type="warning"
          showIcon
          message="暂不能生成可用菜单"
          description={model?.message}
        />
      ) : (
        <>
          <div className="erp-permission-navigation__context">
            <div>
              <Text strong>{model?.contextLabel}</Text>
              <Text type="secondary">
                {model?.effectivePageCount || 0} 个最终可进入页面
              </Text>
            </div>
            <Text type="secondary">
              菜单位置只影响查找顺序，不增加页面或操作权限。
            </Text>
          </div>

          {blocked ? (
            <Alert
              type="warning"
              showIcon
              message="当前不可实际使用"
              description={model?.notice}
            />
          ) : null}

          <div className="erp-permission-navigation__grid">
            {groups.map((group) => (
              <article
                key={group.key}
                className="erp-permission-navigation__group"
              >
                <div className="erp-permission-navigation__group-head">
                  <Text strong>{group.title}</Text>
                  <Tag color={group.key === 'primary' ? 'blue' : undefined}>
                    {group.items.length}
                  </Tag>
                </div>
                <MenuItems items={group.items} />
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
