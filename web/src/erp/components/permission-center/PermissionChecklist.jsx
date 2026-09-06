import { Typography, Button, Checkbox, Empty, Select, Switch, Tag } from 'antd'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MenuOutlined, SettingOutlined } from '@ant-design/icons'
import {
  normalizeStringList,
  getPermissionLabel,
} from '../../utils/permissionCenterAccess.mjs'
import { menuRequirementsSatisfied } from '../../utils/permissionMenuProjection.mjs'

function isHighRiskPermission(permission = {}) {
  if (!permission?.key) {
    return false
  }
  if (permission.module === 'system' || permission.module === 'mobile') {
    return true
  }
  if (permission.module === 'debug') {
    return true
  }
  return [
    'activate',
    'approve',
    'cancel',
    'clear',
    'cleanup',
    'confirm',
    'disable',
    'handle',
    'manage',
    'reject',
    'seed',
    'ship',
  ].includes(permission.action)
}

function getMenuEntryPermissionKeys(menu = {}) {
  return [
    ...new Set([
      ...normalizeStringList(menu.requiredAny),
      ...normalizeStringList(menu.requiredAll),
    ]),
  ]
}

function getPermissionEntryMenu(item = {}) {
  return (item.menuLinks || []).find((menu) =>
    getMenuEntryPermissionKeys(menu).includes(item.key)
  )
}

function describeMenuDependency(menu, permissionDetailMap) {
  const requiredAnyLabels = normalizeStringList(menu?.requiredAny).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requiredAllLabels = normalizeStringList(menu?.requiredAll).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  if (requiredAnyLabels.length > 0 && requiredAllLabels.length > 0) {
    return `需先开启：${requiredAnyLabels.join(' / ')}（任选一项），以及 ${requiredAllLabels.join('、')}`
  }
  if (requiredAnyLabels.length > 1) {
    return `需先开启：${requiredAnyLabels.join(' / ')}（任选一项）`
  }
  const labels = [...requiredAnyLabels, ...requiredAllLabels]
  return labels.length > 0 ? `需先开启：${labels.join('、')}` : ''
}

function describeMenuEntryCondition(menu, permissionDetailMap) {
  const requiredAnyLabels = normalizeStringList(menu?.requiredAny).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requiredAllLabels = normalizeStringList(menu?.requiredAll).map(
    (permissionKey) => getPermissionLabel(permissionDetailMap, permissionKey)
  )
  const requirementCount = requiredAnyLabels.length + requiredAllLabels.length
  if (requirementCount <= 1) {
    return ''
  }
  const requiredAnyDescription =
    requiredAnyLabels.length > 1
      ? `${requiredAnyLabels.join(' / ')}（任选一项）`
      : requiredAnyLabels[0] || ''
  const descriptions = [
    requiredAnyDescription,
    requiredAllLabels.length > 0 ? requiredAllLabels.join('、') : '',
  ].filter(Boolean)
  return `入口条件：${descriptions.join('，并开启 ')}`
}

function getPermissionOtherMenuLabels(item = {}, primaryMenu = null) {
  return [
    ...new Set(
      (item.menuLinks || [])
        .filter((menu) => menu?.key && menu.key !== primaryMenu?.key)
        .map((menu) => menu.label)
        .filter(Boolean)
    ),
  ]
}

function PermissionRow({
  item,
  permissionKeys,
  permissionDetailMap,
  accessPageByKey,
  placementByPath,
}) {
  const entryMenu = getPermissionEntryMenu(item)
  const primaryMenu = entryMenu || item.menuLinks?.[0] || null
  const detail = permissionDetailMap.get(item.key) || item
  const otherMenuLabels = getPermissionOtherMenuLabels(item, primaryMenu)

  if (entryMenu) {
    const locallyVisible = menuRequirementsSatisfied(entryMenu, permissionKeys)
    const accessPage = accessPageByKey.get(entryMenu.key)
    const effective =
      locallyVisible &&
      (accessPage ? accessPage.effective === true : locallyVisible)
    const placement = effective
      ? placementByPath.get(entryMenu.path) || '可从导航进入'
      : ''
    const placementColor =
      placement === '常用工作'
        ? 'blue'
        : placement === '看板中心'
          ? 'purple'
          : undefined
    const entryCondition = describeMenuEntryCondition(
      entryMenu,
      permissionDetailMap
    )
    const rowNotes = [
      entryCondition,
      otherMenuLabels.length > 0 ? `另影响：${otherMenuLabels.join('、')}` : '',
    ].filter(Boolean)

    return (
      <span
        className="erp-permission-row__content"
        data-menu-key={entryMenu.key}
        data-permission-key={item.key}
        data-permission-kind="menu"
      >
        <span className="erp-permission-row__main">
          <MenuOutlined
            className="erp-permission-row__icon"
            aria-hidden="true"
          />
          <span className="erp-permission-row__label">{item.label}</span>
          <span className="erp-permission-row__tags">
            <Tag>菜单入口</Tag>
            <Tag color={effective ? 'green' : undefined}>
              {entryMenu.label}
              {effective ? '显示' : '不显示'}
            </Tag>
            {placement ? <Tag color={placementColor}>{placement}</Tag> : null}
          </span>
        </span>
        {rowNotes.length > 0 ? (
          <span className="erp-permission-row__note">
            {rowNotes.join('；')}
          </span>
        ) : null}
      </span>
    )
  }

  const dependencyDescription = primaryMenu
    ? describeMenuDependency(primaryMenu, permissionDetailMap)
    : ''

  return (
    <span
      className="erp-permission-row__content"
      data-permission-key={item.key}
      data-permission-kind="action"
    >
      <span className="erp-permission-row__main">
        <SettingOutlined
          className="erp-permission-row__icon"
          aria-hidden="true"
        />
        <span className="erp-permission-row__label">{item.label}</span>
        <span className="erp-permission-row__tags">
          <Tag>页内操作</Tag>
          {isHighRiskPermission(detail) ? <Tag>敏感操作</Tag> : null}
        </span>
      </span>
      {dependencyDescription || otherMenuLabels.length > 0 ? (
        <span className="erp-permission-row__note">
          {dependencyDescription}
          {dependencyDescription && otherMenuLabels.length > 0 ? '；' : ''}
          {otherMenuLabels.length > 0
            ? `另影响：${otherMenuLabels.join('、')}`
            : ''}
        </span>
      ) : null}
    </span>
  )
}

function PermissionChecklist({
  groups,
  access = null,
  accessLoading = false,
  placementByPath = new Map(),
  permissionDetailMap = new Map(),
  value = [],
  onChange,
  disabled = false,
}) {
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [activeGroupKey, setActiveGroupKey] = useState('')
  const sectionNodesRef = useRef(new Map())
  const navigationLockUntilRef = useRef(0)
  const normalizedValue = useMemo(() => normalizeStringList(value), [value])
  const selectedKeySet = useMemo(
    () => new Set(normalizedValue),
    [normalizedValue]
  )
  const accessPageByKey = useMemo(
    () =>
      new Map(
        (Array.isArray(access?.pages) ? access.pages : []).map((page) => [
          String(page?.key || '').trim(),
          page,
        ])
      ),
    [access]
  )
  const visibleGroups = useMemo(() => {
    if (!showSelectedOnly) {
      return groups
    }
    return groups
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => selectedKeySet.has(item.key)),
      }))
      .filter((section) => section.items.length > 0)
  }, [groups, selectedKeySet, showSelectedOnly])
  const categoryItems = useMemo(
    () =>
      visibleGroups.map((section) => {
        const originalSection =
          groups.find((item) => item.key === section.key) || section
        const permissionKeys = originalSection.items.map((item) => item.key)
        return {
          key: section.key,
          title: section.title,
          selectedCount: permissionKeys.filter((item) =>
            selectedKeySet.has(item)
          ).length,
          total: permissionKeys.length,
        }
      }),
    [groups, selectedKeySet, visibleGroups]
  )

  useEffect(() => {
    const visibleKeys = new Set(categoryItems.map((item) => item.key))
    setActiveGroupKey((current) =>
      visibleKeys.has(current) ? current : categoryItems[0]?.key || ''
    )
  }, [categoryItems])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.IntersectionObserver !== 'function'
    ) {
      return undefined
    }
    const visibleEntries = new Map()
    const observer = new window.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const key = String(entry.target?.dataset?.permissionModule || '')
          if (!key) return
          if (entry.isIntersecting) {
            visibleEntries.set(key, entry)
          } else {
            visibleEntries.delete(key)
          }
        })
        if (Date.now() < navigationLockUntilRef.current) {
          return
        }
        const nextEntry = [...visibleEntries.values()].sort(
          (left, right) =>
            Math.abs(left.boundingClientRect.top - 24) -
              Math.abs(right.boundingClientRect.top - 24) ||
            left.boundingClientRect.left - right.boundingClientRect.left
        )[0]
        const nextKey = String(
          nextEntry?.target?.dataset?.permissionModule || ''
        )
        if (nextKey) {
          setActiveGroupKey((current) =>
            current === nextKey ? current : nextKey
          )
        }
      },
      {
        root: null,
        rootMargin: '-320px 0px -25% 0px',
        threshold: [0, 0.01],
      }
    )
    categoryItems.forEach((item) => {
      const node = sectionNodesRef.current.get(item.key)
      if (node) observer.observe(node)
    })
    return () => observer.disconnect()
  }, [categoryItems])

  const jumpToGroup = useCallback((groupKey) => {
    const normalizedKey = String(groupKey || '').trim()
    const target = sectionNodesRef.current.get(normalizedKey)
    if (!target) return
    navigationLockUntilRef.current = Date.now() + 1600
    setActiveGroupKey(normalizedKey)
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = [
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ]
    onChange?.([...new Set(next)])
  }

  return (
    <div className="erp-permission-checklist-shell" aria-busy={accessLoading}>
      <nav className="erp-permission-category-nav" aria-label="功能分类导航">
        <div className="erp-permission-category-nav__head">
          <span className="erp-permission-category-nav__title">
            <Text strong className="erp-permission-category-nav__label">
              功能分类
            </Text>
            <Text className="erp-permission-category-nav__selected">
              已选 {normalizedValue.length} 项
            </Text>
          </span>
          <label className="erp-permission-checklist-filter">
            <Switch
              size="small"
              checked={showSelectedOnly}
              onChange={setShowSelectedOnly}
            />
            <span>只看已选</span>
          </label>
        </div>
        {categoryItems.length > 0 ? (
          <>
            <div className="erp-permission-category-nav__desktop">
              {categoryItems.map((item) => {
                const active = activeGroupKey === item.key
                return (
                  <button
                    type="button"
                    className={`erp-permission-category-nav__item${
                      active ? ' erp-permission-category-nav__item--active' : ''
                    }`}
                    aria-current={active ? 'location' : undefined}
                    key={item.key}
                    onClick={() => jumpToGroup(item.key)}
                  >
                    <span>{item.title}</span>
                    <span className="erp-permission-category-nav__count">
                      {item.selectedCount}/{item.total}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="erp-permission-category-nav__mobile">
              <Select
                aria-label="跳到功能分类"
                value={activeGroupKey || undefined}
                options={categoryItems.map((item) => ({
                  value: item.key,
                  label: `${item.title} ${item.selectedCount}/${item.total}`,
                }))}
                onChange={jumpToGroup}
                placeholder="跳到功能分类"
                style={{ width: '100%' }}
              />
            </div>
          </>
        ) : null}
      </nav>
      <div className="erp-permission-checklist">
        {visibleGroups.map((section) => {
          const originalSection =
            groups.find((item) => item.key === section.key) || section
          const sectionKeys = section.items.map((item) => item.key)
          const originalSectionKeys = originalSection.items.map(
            (item) => item.key
          )
          const selectedKeys = normalizedValue.filter((item) =>
            sectionKeys.includes(item)
          )
          const selectedOriginalKeys = normalizedValue.filter((item) =>
            originalSectionKeys.includes(item)
          )
          const allOriginalSelected =
            originalSectionKeys.length > 0 &&
            originalSectionKeys.every((item) => selectedKeySet.has(item))
          return (
            <section
              className="erp-permission-checklist__section"
              data-permission-module={section.key}
              key={section.key}
              ref={(node) => {
                if (node) {
                  sectionNodesRef.current.set(section.key, node)
                } else {
                  sectionNodesRef.current.delete(section.key)
                }
              }}
            >
              <div className="erp-permission-checklist__header">
                <span className="erp-permission-checklist__title">
                  <Text strong>{section.title}</Text>
                  <Text type="secondary">
                    {showSelectedOnly
                      ? `显示 ${section.items.length}/${originalSection.items.length}，已选 ${selectedOriginalKeys.length}`
                      : `${selectedOriginalKeys.length}/${originalSection.items.length}`}
                  </Text>
                </span>
                <span className="erp-permission-checklist__actions">
                  <Button
                    size="small"
                    type="text"
                    disabled={disabled || allOriginalSelected}
                    onClick={() =>
                      handleSectionChange(
                        originalSectionKeys,
                        originalSectionKeys
                      )
                    }
                  >
                    全选本组
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    disabled={disabled || selectedOriginalKeys.length === 0}
                    onClick={() => handleSectionChange(originalSectionKeys, [])}
                  >
                    清空
                  </Button>
                </span>
              </div>
              <Checkbox.Group
                value={selectedKeys}
                disabled={disabled}
                onChange={(nextValues) =>
                  handleSectionChange(sectionKeys, nextValues)
                }
                className="erp-permission-list"
              >
                {section.items.map((item) => (
                  <Checkbox
                    className="erp-permission-row"
                    key={item.key}
                    value={item.key}
                  >
                    <PermissionRow
                      item={item}
                      permissionKeys={normalizedValue}
                      permissionDetailMap={permissionDetailMap}
                      accessPageByKey={accessPageByKey}
                      placementByPath={placementByPath}
                    />
                  </Checkbox>
                ))}
              </Checkbox.Group>
            </section>
          )
        })}
      </div>
      {visibleGroups.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            showSelectedOnly ? '当前岗位暂无已选功能' : '暂无可配置功能'
          }
        />
      ) : null}
    </div>
  )
}

export { PermissionChecklist }

const { Text } = Typography
