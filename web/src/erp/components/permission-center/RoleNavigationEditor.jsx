import React, { useState } from 'react'
import { Alert, Button, Empty, Select, Space, Tag, Typography } from 'antd'
import { message } from '@/common/utils/antdApp'
import {
  buildRoleGuidedSecondarySections,
  MAX_ROLE_PRIMARY_LIMIT,
  ROLE_NAVIGATION_MODES,
} from '../../config/roleGuidedNavigation.mjs'

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
  const optionMap = new Map(options.map((option) => [option.value, option]))
  const customDisabled = disabled || mode !== ROLE_NAVIGATION_MODES.CUSTOM
  const [announcement, setAnnouncement] = useState('')
  const buildSecondaryItem = (path) => {
    const option = optionMap.get(path)
    return {
      ...(option?.menuItem || {}),
      path,
      label: option?.label || path,
    }
  }
  const buildSecondaryPathGroups = (paths = []) =>
    buildRoleGuidedSecondarySections(paths.map(buildSecondaryItem)).map(
      (section) => ({
        ...section,
        paths: section.items.map((item) => item.path),
      })
    )
  const secondaryPathGroups = buildSecondaryPathGroups(secondaryMenuPaths)
  const normalizeSecondaryPaths = (paths = []) =>
    buildSecondaryPathGroups(paths).flatMap((section) => section.paths)
  const updateSecondaryPaths = (paths = []) =>
    onSecondaryMenuPathsChange?.(normalizeSecondaryPaths(paths))

  const moveWithin = (
    paths,
    onChange,
    path,
    offset,
    groupLabel,
    groupPaths = paths
  ) => {
    const currentGroupIndex = groupPaths.indexOf(path)
    const nextGroupIndex = currentGroupIndex + offset
    if (
      currentGroupIndex < 0 ||
      nextGroupIndex < 0 ||
      nextGroupIndex >= groupPaths.length
    ) {
      return
    }
    const targetPath = groupPaths[nextGroupIndex]
    const currentIndex = paths.indexOf(path)
    const targetIndex = paths.indexOf(targetPath)
    if (currentIndex < 0 || targetIndex < 0) {
      return
    }
    const nextPaths = [...paths]
    ;[nextPaths[currentIndex], nextPaths[targetIndex]] = [
      nextPaths[targetIndex],
      nextPaths[currentIndex],
    ]
    onChange?.(nextPaths)
    const label = optionMap.get(path)?.label || path
    setAnnouncement(`${label}已在${groupLabel}${offset < 0 ? '上移' : '下移'}`)
  }

  const moveToSecondary = (path) => {
    if (primaryMenuPaths.length <= 1) {
      return
    }
    onPrimaryMenuPathsChange?.(primaryMenuPaths.filter((item) => item !== path))
    updateSecondaryPaths([...secondaryMenuPaths, path])
    setAnnouncement(`${optionMap.get(path)?.label || path}已移到更多功能`)
  }

  const moveToPrimary = (path) => {
    if (primaryMenuPaths.length >= MAX_ROLE_PRIMARY_LIMIT) {
      message.warning(`常用工作最多选择 ${MAX_ROLE_PRIMARY_LIMIT} 个页面`)
      return
    }
    updateSecondaryPaths(secondaryMenuPaths.filter((item) => item !== path))
    onPrimaryMenuPathsChange?.([...primaryMenuPaths, path])
    setAnnouncement(`${optionMap.get(path)?.label || path}已移到常用工作`)
  }

  const renderOrderedList = ({
    key,
    title,
    description,
    paths,
    onChange,
    moveLabel,
    onMove,
    moveDisabled,
    pathGroups = [],
  }) => {
    const renderedGroups =
      pathGroups.length > 0
        ? pathGroups
        : [{ key: `${key}-all`, title: '', paths }]
    return (
      <section
        className="erp-role-navigation-editor__column"
        data-navigation-group={key}
        aria-label={title}
      >
        <div className="erp-role-navigation-editor__column-head">
          <div>
            <Text strong>{title}</Text>
            <Text type="secondary">{description}</Text>
          </div>
          <Tag>{paths.length} 项</Tag>
        </div>
        <div className="erp-role-navigation-editor__order">
          {paths.length > 0 ? (
            renderedGroups.map((pathGroup) => (
              <div
                key={pathGroup.key}
                className="erp-role-navigation-editor__order-group"
                role={pathGroup.title ? 'group' : undefined}
                aria-label={pathGroup.title || undefined}
              >
                {pathGroup.title ? (
                  <div className="erp-role-navigation-editor__order-group-title">
                    <Text strong>{pathGroup.title}</Text>
                    <Text type="secondary">{pathGroup.paths.length} 项</Text>
                  </div>
                ) : null}
                {pathGroup.paths.map((path, index) => {
                  const option = optionMap.get(path)
                  const label = option?.label || path
                  return (
                    <div
                      key={path}
                      className="erp-role-navigation-editor__order-item"
                      data-navigation-path={path}
                    >
                      <span>
                        <Text strong>{index + 1}</Text>
                        <Text>{label}</Text>
                        {option?.effective === false ? (
                          <Tag color="orange">当前不可进入</Tag>
                        ) : null}
                      </span>
                      <Space size={4}>
                        <Button
                          size="small"
                          disabled={customDisabled || index === 0}
                          aria-label={`上移 ${label}`}
                          onClick={() =>
                            moveWithin(
                              paths,
                              onChange,
                              path,
                              -1,
                              pathGroup.title || title,
                              pathGroup.paths
                            )
                          }
                        >
                          上移
                        </Button>
                        <Button
                          size="small"
                          disabled={
                            customDisabled ||
                            index === pathGroup.paths.length - 1
                          }
                          aria-label={`下移 ${label}`}
                          onClick={() =>
                            moveWithin(
                              paths,
                              onChange,
                              path,
                              1,
                              pathGroup.title || title,
                              pathGroup.paths
                            )
                          }
                        >
                          下移
                        </Button>
                        <Button
                          size="small"
                          disabled={
                            customDisabled ||
                            option?.effective === false ||
                            moveDisabled
                          }
                          aria-label={`${moveLabel} ${label}`}
                          onClick={() => onMove(path)}
                        >
                          {moveLabel}
                        </Button>
                      </Space>
                    </div>
                  )
                })}
              </div>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前没有页面"
            />
          )}
        </div>
      </section>
    )
  }

  return (
    <div className="erp-role-navigation-editor">
      <div className="erp-role-navigation-editor__head">
        <div>
          <Text strong>设置岗位菜单布局</Text>
          <Paragraph type="secondary">
            页面和操作权限决定“能不能用”；这里把每个最终可进入页面放入常用工作或更多功能，更多功能与管理员菜单使用相同模块分组。
          </Paragraph>
        </div>
        <Select
          aria-label="岗位导航排列方式"
          value={mode}
          disabled={disabled}
          onChange={onModeChange}
          options={[
            {
              value: ROLE_NAVIGATION_MODES.RECOMMENDED,
              label: '系统推荐',
            },
            {
              value: ROLE_NAVIGATION_MODES.CUSTOM,
              label: '自定义布局',
            },
          ]}
        />
      </div>
      {mode === ROLE_NAVIGATION_MODES.RECOMMENDED ? (
        <div className="erp-business-inline-note" role="note">
          <Text strong>系统按岗位推荐高频页面：</Text>
          <Text type="secondary">
            高频页面放在“常用工作”，其余放进“更多功能”；看板在最前，岗位帮助在最后。
          </Text>
        </div>
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            常用工作需保留 1–{MAX_ROLE_PRIMARY_LIMIT}{' '}
            项；使用按钮可仅靠键盘完成跨区移动，更多功能只调整同一菜单分组内的顺序。
          </Text>
          {unavailablePaths.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message="有菜单入口已不在当前最终权限中"
              description="请移除标记为“当前不可进入”的页面后再保存；系统运行时也不会显示这些入口。"
              action={
                <Button size="small" onClick={onViewPageAccess}>
                  查看不可进入原因
                </Button>
              }
            />
          ) : null}
          <div className="erp-role-navigation-editor__columns">
            {renderOrderedList({
              key: 'primary',
              title: '常用工作',
              description: `最多 ${MAX_ROLE_PRIMARY_LIMIT} 项`,
              paths: primaryMenuPaths,
              onChange: onPrimaryMenuPathsChange,
              moveLabel: '移到更多',
              onMove: moveToSecondary,
              moveDisabled: primaryMenuPaths.length <= 1,
            })}
            {renderOrderedList({
              key: 'secondary',
              title: '更多功能',
              description: '其余页面沿用管理员菜单分组',
              paths: secondaryMenuPaths,
              onChange: updateSecondaryPaths,
              moveLabel: '移到常用',
              onMove: moveToPrimary,
              moveDisabled: primaryMenuPaths.length >= MAX_ROLE_PRIMARY_LIMIT,
              pathGroups: secondaryPathGroups,
            })}
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
