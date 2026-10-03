import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Select, Space, Tag, Typography } from 'antd'
import {
  MAX_ROLE_PRIMARY_LIMIT,
  ROLE_NAVIGATION_MODES,
} from '../../config/roleGuidedNavigation.mjs'
import { groupSidebarNavigationSections } from '../../utils/businessModuleGroups.mjs'
import {
  buildRoleNavigationModules,
  serializeRoleNavigationModules,
} from '../../utils/permissionNavigation.mjs'

const { Paragraph, Text } = Typography

function RoleNavigationEditor({
  mode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
  options = [],
  disabled = false,
  unavailablePaths = [],
  onModeChange,
  onPrimaryMenuPathsChange,
  onSecondaryMenuPathsChange,
  onViewPageAccess,
}) {
  const [announcement, setAnnouncement] = useState('')
  const editorRef = useRef(null)
  const focusAfterMove = useRef(null)
  useEffect(() => {
    const target = focusAfterMove.current
    if (!target) return
    const row = [
      ...(editorRef.current?.querySelectorAll('[data-navigation-module]') ||
        []),
    ].find((item) => item.dataset.navigationModule === target.key)
    const preferred = row?.querySelector(
      `[data-navigation-action="${target.action}"]`
    )
    const button =
      preferred && !preferred.disabled
        ? preferred
        : row?.querySelector('button:not(:disabled)')
    button?.focus()
    focusAfterMove.current = null
  }, [primaryMenuPaths, secondaryMenuPaths])
  const { primaryItems, secondaryItems } = buildRoleNavigationModules({
    options,
    primaryMenuPaths,
    secondaryMenuPaths,
  })
  const secondarySections = groupSidebarNavigationSections([
    { items: secondaryItems },
  ])
  const update = (primary, secondary, notice) => {
    const next = serializeRoleNavigationModules({
      primaryItems: primary,
      secondaryItems: secondary,
    })
    onPrimaryMenuPathsChange?.(next.primaryMenuPaths)
    onSecondaryMenuPathsChange?.(next.secondaryMenuPaths)
    setAnnouncement(notice)
  }
  const move = (item, primary, offset, groupItems) => {
    const index = groupItems.findIndex((entry) => entry.key === item.key)
    const target = groupItems[index + offset]
    if (!target) return
    const items = [...(primary ? primaryItems : secondaryItems)]
    const from = items.findIndex((entry) => entry.key === item.key)
    const to = items.findIndex((entry) => entry.key === target.key)
    ;[items[from], items[to]] = [items[to], items[from]]
    focusAfterMove.current = {
      key: item.key,
      action: offset < 0 ? 'up' : 'down',
    }
    update(
      primary ? items : primaryItems,
      primary ? secondaryItems : items,
      `${item.label}已${offset < 0 ? '上移' : '下移'}`
    )
  }
  const changePlacement = (item, primary) => {
    if (
      primary
        ? primaryItems.length <= 1
        : primaryItems.length >= MAX_ROLE_PRIMARY_LIMIT
    ) {
      return
    }
    focusAfterMove.current = { key: item.key, action: 'placement' }
    update(
      primary
        ? primaryItems.filter((entry) => entry.key !== item.key)
        : [...primaryItems, item],
      primary
        ? [...secondaryItems, item]
        : secondaryItems.filter((entry) => entry.key !== item.key),
      `${item.label}已移到${primary ? '其他入口' : '常用工作'}`
    )
  }
  const changeDefault = (item, path) => {
    if (
      !item.pages.some(
        (page) => page.value === path && page.effective !== false
      )
    ) {
      return
    }
    const replace = (items) =>
      items.map((entry) =>
        entry.key === item.key ? { ...entry, path } : entry
      )
    update(
      replace(primaryItems),
      replace(secondaryItems),
      `${item.label}的默认页面已调整`
    )
  }
  const renderColumn = (primary) => {
    const items = primary ? primaryItems : secondaryItems
    const sections = primary ? [{ key: 'primary', items }] : secondarySections
    const title = primary ? '常用工作' : '其他入口'
    return (
      <section
        className="erp-role-navigation-editor__column"
        data-navigation-group={primary ? 'primary' : 'secondary'}
        aria-label={title}
      >
        <div className="erp-role-navigation-editor__column-head">
          <div>
            <Text strong>{title}</Text>
            <Text type="secondary">
              {primary
                ? `最多 ${MAX_ROLE_PRIMARY_LIMIT} 个入口`
                : '历史记录与帮助固定保留，其余入口在同一区内排序'}
            </Text>
          </div>
          <Tag>{items.length} 个入口</Tag>
        </div>
        <div className="erp-role-navigation-editor__order">
          {items.length ? (
            sections.map((section) => (
              <div
                className="erp-role-navigation-editor__order-group"
                key={section.key}
                role={section.title ? 'group' : undefined}
                aria-label={section.title}
              >
                {section.title ? (
                  <div className="erp-role-navigation-editor__order-group-title">
                    <Text strong>{section.title}</Text>
                  </div>
                ) : null}
                {section.items.map((item, index) => (
                  <div
                    className="erp-role-navigation-editor__order-item"
                    key={item.key}
                    data-navigation-path={item.path}
                    data-navigation-module={item.key}
                  >
                    <div className="erp-role-navigation-editor__identity">
                      <Text strong>{item.label}</Text>
                      {item.pages.length > 1 ? (
                        <label className="erp-role-navigation-editor__default">
                          <Text type="secondary">默认页面</Text>
                          <Select
                            aria-label={`${item.label}默认页面`}
                            value={item.path}
                            disabled={disabled}
                            options={item.pages.map((page) => ({
                              value: page.value,
                              label: page.label,
                              disabled: page.effective === false,
                            }))}
                            onChange={(path) => changeDefault(item, path)}
                          />
                        </label>
                      ) : (
                        <Text type="secondary">{item.pages[0]?.label}</Text>
                      )}
                    </div>
                    <Space size={4}>
                      <Button
                        size="small"
                        aria-label={`上移 ${item.label}`}
                        data-navigation-action="up"
                        disabled={disabled || index === 0}
                        onClick={() => move(item, primary, -1, section.items)}
                      >
                        上移
                      </Button>
                      <Button
                        size="small"
                        aria-label={`下移 ${item.label}`}
                        data-navigation-action="down"
                        disabled={
                          disabled || index === section.items.length - 1
                        }
                        onClick={() => move(item, primary, 1, section.items)}
                      >
                        下移
                      </Button>
                      <Button
                        size="small"
                        aria-label={`移到${primary ? '其他' : '常用'} ${item.label}`}
                        data-navigation-action="placement"
                        disabled={
                          disabled ||
                          (primary
                            ? primaryItems.length <= 1
                            : primaryItems.length >= MAX_ROLE_PRIMARY_LIMIT) ||
                          !item.pages.some((page) => page.effective !== false)
                        }
                        onClick={() => changePlacement(item, primary)}
                      >
                        移到{primary ? '其他' : '常用'}
                      </Button>
                    </Space>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前没有可排列入口"
            />
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="erp-role-navigation-editor" ref={editorRef}>
      <div className="erp-role-navigation-editor__head">
        <div>
          <Text strong>设置岗位导航</Text>
          <Paragraph type="secondary">
            所有获准入口在侧栏直接显示，每个业务模块只占一个入口；默认页面从已获准页面中选择，再次进入仍会恢复最近访问页。
          </Paragraph>
        </div>
        <Select
          aria-label="岗位导航排列方式"
          value={mode}
          disabled={disabled}
          onChange={onModeChange}
          options={[
            { value: ROLE_NAVIGATION_MODES.RECOMMENDED, label: '系统推荐' },
            {
              value: ROLE_NAVIGATION_MODES.CUSTOM,
              label: '自定义布局',
              disabled: !options.some((option) => option.effective !== false),
            },
          ]}
        />
      </div>
      {mode === ROLE_NAVIGATION_MODES.RECOMMENDED ? (
        <div className="erp-business-inline-note" role="note">
          <Text strong>系统按岗位推荐常用模块：</Text>
          <Text type="secondary">
            工作中心固定在最前，其余入口按业务模块、工具与查询、系统与帮助分类。
          </Text>
        </div>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            常用工作需保留 1–{MAX_ROLE_PRIMARY_LIMIT}{' '}
            个入口；调整位置与默认页面不会增加权限。
          </Text>
          {unavailablePaths.length ? (
            <Alert
              type="warning"
              showIcon
              message="部分已保存页面当前不可进入"
              description="请核对页面访问结果后调整默认页面；不可进入的页面不会成为可用入口。"
              action={
                <Button size="small" onClick={onViewPageAccess}>
                  查看不可进入原因
                </Button>
              }
            />
          ) : null}
          <div className="erp-role-navigation-editor__columns">
            {renderColumn(true)}
            {renderColumn(false)}
          </div>
          <span className="erp-sr-only" aria-live="polite">
            {announcement}
          </span>
        </Space>
      )}
    </div>
  )
}

export { RoleNavigationEditor }
