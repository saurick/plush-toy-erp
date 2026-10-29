import React from 'react'
import { Alert, Skeleton, Space, Tag, Typography } from 'antd'
import { PERMISSION_NAVIGATION_STATE } from '../config/devPermissionNavigation.mjs'

const { Text, Title } = Typography

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
  const groups = model?.sections || []

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
            {blocked
              ? '账号或岗位当前不可使用；已保存的分配关系可在权限依据中核对。'
              : model?.projectionOnly
                ? '按各岗位生成菜单合并参考，实际菜单以账号登录结果为准。'
                : '显示当前对象的完整侧栏入口。'}
          </Text>
        </div>
        <Space wrap size={[6, 6]}>
          <Tag color={unavailable || blocked ? 'warning' : undefined} className={unavailable || blocked ? undefined : 'erp-dev-accent-tag'}>
            {unavailable
              ? '待核对'
              : blocked
                ? '访问受限'
                : model?.projectionOnly
                  ? '岗位参考'
                  : '完整导航'}
          </Tag>
          {model?.modeLabel ? (
            <Tag
              color={unavailable || blocked ? 'warning' : undefined}
              className={unavailable || blocked ? undefined : 'erp-dev-accent-tag'}
            >
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
                {model?.effectivePageCount || 0} 个
                {model?.projectionOnly ? '岗位合并参考页面' : '获准页面'}
                {' · '}
                {model?.totalItemCount || 0} 个侧栏入口
              </Text>
            </div>
            <Text type="secondary">
              同一业务模块合并为一个入口；历史记录与帮助中心为登录后入口。
            </Text>
          </div>

          {model?.notice ? (
            <Alert
              type="warning"
              showIcon
              message={blocked ? '当前不可实际使用' : '岗位合并参考'}
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
                  <Tag className={group.key === 'primary' ? 'erp-dev-accent-tag' : undefined}>
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
