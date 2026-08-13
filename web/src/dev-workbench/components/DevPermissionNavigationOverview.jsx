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
            <article className="erp-permission-navigation__group">
              <div className="erp-permission-navigation__group-head">
                <div>
                  <Text strong>看板中心</Text>
                  <Text type="secondary">每天开始工作的统一入口</Text>
                </div>
                <Tag>{model?.dashboardItems?.length || 0}</Tag>
              </div>
              <MenuItems items={model?.dashboardItems} />
            </article>

            <article className="erp-permission-navigation__group">
              <div className="erp-permission-navigation__group-head">
                <div>
                  <Text strong>常用工作</Text>
                  <Text type="secondary">岗位高频业务，按实际顺序排列</Text>
                </div>
                <Tag color="blue">{model?.primaryItems?.length || 0}</Tag>
              </div>
              <MenuItems items={model?.primaryItems} />
            </article>

            <article className="erp-permission-navigation__group erp-permission-navigation__group--more">
              <div className="erp-permission-navigation__group-head">
                <div>
                  <Text strong>更多功能</Text>
                  <Text type="secondary">
                    沿用正式侧栏分组，岗位帮助固定在最后
                  </Text>
                </div>
                <Tag>{model?.secondaryItemCount || 0}</Tag>
              </div>
              {model?.secondarySections?.length > 0 ? (
                <div className="erp-permission-navigation__sections">
                  {model.secondarySections.map((section) => (
                    <section
                      key={section.key}
                      className="erp-permission-navigation__section"
                    >
                      <div className="erp-permission-navigation__section-title">
                        <Text strong>{section.title}</Text>
                        <Text type="secondary">{section.items.length} 项</Text>
                      </div>
                      <MenuItems items={section.items} />
                    </section>
                  ))}
                </div>
              ) : (
                <Text type="secondary">当前没有更多功能</Text>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
