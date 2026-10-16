import { Typography, Button, Checkbox, Empty, Popover, Switch } from 'antd'

import React, { useEffect, useMemo, useState } from 'react'
import { DownOutlined, RightOutlined } from '@ant-design/icons'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import {
  normalizeStringList,
  getPermissionLabel,
} from '../../utils/permissionCenterAccess.mjs'
import { menuRequirementsSatisfied } from '../../utils/permissionMenuProjection.mjs'
import { filterPermissionGroups } from '../../utils/permissionCenterSearch.mjs'

import {
  buildPermissionMatrixRows,
  isSensitivePermission,
  PERMISSION_MATRIX_COLUMNS,
} from '../../utils/permissionMatrix.mjs'

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

function describePermission({
  item,
  permissionKeys,
  permissionDetailMap,
  accessPageByKey,
  accessVerified,
  placementByPath,
}) {
  const entryMenu = getPermissionEntryMenu(item)
  const primaryMenu = entryMenu || item.menuLinks?.[0] || null
  const otherMenuLabels = getPermissionOtherMenuLabels(item, primaryMenu)
  const detail = permissionDetailMap.get(item.key) || item
  let summary = isSensitivePermission(detail)
    ? '页内操作 · 敏感操作'
    : '页内操作'
  let note = primaryMenu
    ? describeMenuDependency(primaryMenu, permissionDetailMap)
    : ''
  if (entryMenu) {
    const locallyVisible = menuRequirementsSatisfied(entryMenu, permissionKeys)
    const accessPage = accessPageByKey.get(entryMenu.key)
    const effective =
      accessVerified && locallyVisible && accessPage?.effective === true
    const placement = effective
      ? placementByPath.get(entryMenu.path) || '可从导航进入'
      : ''
    summary = [
      '菜单入口',
      entryMenu.label + (!accessVerified ? '待核对' : effective ? '显示' : '不显示'),
      placement,
    ]
      .filter(Boolean)
      .join(' · ')
    note = describeMenuEntryCondition(entryMenu, permissionDetailMap)
  }
  const description = [
    summary,
    note,
    otherMenuLabels.length ? `另影响：${otherMenuLabels.join('、')}` : '',
  ]
    .filter(Boolean)
    .join('；')
  return { description, entryMenu, sensitive: isSensitivePermission(detail) }
}

function PermissionRow({ item, presentation, compact = false, change = '' }) {
  const { description, entryMenu, sensitive } = presentation
  return (
    <span
      className={`erp-permission-row__content${compact ? ' erp-permission-row__content--compact' : ''}`}
      data-menu-key={entryMenu?.key}
      data-permission-key={item.key}
      data-permission-kind={entryMenu ? 'menu' : 'action'}
      title={`${item.label}：${description}`}
    >
      <span className="erp-permission-row__label" title={item.label}>
        {item.label}
      </span>
      {!compact && sensitive ? (
        <span className="erp-permission-row__note">敏感操作</span>
      ) : null}
      {change ? (
        <span className="erp-permission-row__change">{change}</span>
      ) : null}
    </span>
  )
}

function PermissionChecklist({
  groups,
  searchKeyword = '',
  access = null,
  accessLoading = false,
  placementByPath = new Map(),
  permissionDetailMap = new Map(),
  value = [],
  savedValue = value,
  onChange,
  disabled = false,
}) {
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const normalizedValue = useMemo(() => normalizeStringList(value), [value])
  const selectedKeySet = useMemo(
    () => new Set(normalizedValue),
    [normalizedValue]
  )
  const savedKeySet = useMemo(
    () => new Set(normalizeStringList(savedValue)),
    [savedValue]
  )
  const changedItems = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter(
          (item) => selectedKeySet.has(item.key) !== savedKeySet.has(item.key)
        ),
    [groups, selectedKeySet, savedKeySet]
  )
  const addedCount = changedItems.filter((item) =>
    selectedKeySet.has(item.key)
  ).length
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
    const matchingGroups = filterPermissionGroups(groups, searchKeyword)
    if (!showSelectedOnly) {
      return matchingGroups
    }
    return matchingGroups
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => selectedKeySet.has(item.key)),
      }))
      .filter((section) => section.items.length > 0)
  }, [groups, searchKeyword, selectedKeySet, showSelectedOnly])
  useEffect(() => setCollapsedGroups(new Set()), [searchKeyword])

  const handleSectionChange = (sectionKeys, nextSectionValues) => {
    const next = [
      ...normalizedValue.filter((item) => !sectionKeys.includes(item)),
      ...(nextSectionValues || []),
    ]
    onChange?.([...new Set(next)])
  }

  const renderPermission = (item, compact = false) => {
    const presentation = describePermission({
      item,
      permissionKeys: normalizedValue,
      permissionDetailMap,
      accessPageByKey,
      accessVerified: !accessLoading && access?.is_final === true,
      placementByPath,
    })
    return (
      <Checkbox
        key={item.key}
        className={`erp-permission-row${compact ? ' erp-permission-row--compact' : ''}`}
        aria-label={item.label}
        aria-description={presentation.description}
        title={`${item.label}：${presentation.description}`}
        checked={selectedKeySet.has(item.key)}
        disabled={disabled}
        onChange={(event) =>
          onChange?.(
            event.target.checked
              ? [...new Set([...normalizedValue, item.key])]
              : normalizedValue.filter((key) => key !== item.key)
          )
        }
      >
        <PermissionRow
          item={item}
          presentation={presentation}
          compact={compact}
          change={
            selectedKeySet.has(item.key) !== savedKeySet.has(item.key)
              ? selectedKeySet.has(item.key)
                ? '新增'
                : '撤销'
              : ''
          }
        />
      </Checkbox>
    )
  }

  return (
    <div className="erp-permission-checklist-shell" aria-busy={accessLoading}>
      <div className="erp-permission-capability-toolbar">
        <div className="erp-permission-capability-summary">
          <span>
            <strong>{normalizedValue.length}</strong> /{' '}
            {groups.reduce((sum, group) => sum + group.items.length, 0)}{' '}
            项功能已授权 · {groups.length} 个业务域
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
        {changedItems.length > 0 ? (
          <Popover
            trigger="click"
            title="本次功能调整"
            content={
              <ul className="erp-permission-changes">
                {changedItems.map((item) => (
                  <li key={item.key}>
                    <strong>
                      {selectedKeySet.has(item.key) ? '新增' : '撤销'}
                    </strong>{' '}
                    {item.label}
                  </li>
                ))}
              </ul>
            }
          >
            <Button type="link" size="small">
              新增 {addedCount} 项 · 撤销 {changedItems.length - addedCount} 项
            </Button>
          </Popover>
        ) : null}
        <div className="erp-permission-expand-actions">
          <Button
            type="text"
            size="small"
            onClick={() => setCollapsedGroups(new Set())}
          >
            全部展开
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() =>
              setCollapsedGroups(new Set(groups.map((group) => group.key)))
            }
          >
            全部收起
          </Button>
        </div>
      </div>
      <TableScrollRegion className="erp-permission-checklist">
        {visibleGroups.length > 0 ? (
          <table className="erp-permission-matrix" aria-label="岗位功能权限">
            <colgroup>
              <col className="erp-permission-matrix__object-column" />
              {PERMISSION_MATRIX_COLUMNS.map((column) => (
                <col
                  key={column.key}
                  className={
                    column.key === 'other'
                      ? ''
                      : 'erp-permission-matrix__action-column'
                  }
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">业务对象</th>
                {PERMISSION_MATRIX_COLUMNS.map((column) => (
                  <th scope="col" key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            {visibleGroups.map((section) => {
              const originalSection =
                groups.find((item) => item.key === section.key) || section
              const sectionKeys = section.items.map((item) => item.key)
              const selectedKeys = sectionKeys.filter((key) =>
                selectedKeySet.has(key)
              )
              const selectedCount = originalSection.items.filter((item) =>
                selectedKeySet.has(item.key)
              ).length
              const expanded = !collapsedGroups.has(section.key)
              const filtered = showSelectedOnly || Boolean(searchKeyword.trim())
              const rows = buildPermissionMatrixRows(
                section.items,
                originalSection.items
              )
              return (
                <tbody
                  className="erp-permission-checklist__section"
                  data-permission-module={section.key}
                  key={section.key}
                >
                  <tr className="erp-permission-matrix__group">
                    <td colSpan={5}>
                      <div className="erp-permission-checklist__header">
                        <span className="erp-permission-checklist__title">
                          <Button
                            type="text"
                            size="small"
                            className="erp-permission-checklist__toggle"
                            icon={
                              expanded ? <DownOutlined /> : <RightOutlined />
                            }
                            aria-expanded={expanded}
                            onClick={() =>
                              setCollapsedGroups((current) => {
                                const next = new Set(current)
                                if (next.has(section.key)) {
                                  next.delete(section.key)
                                } else {
                                  next.add(section.key)
                                }
                                return next
                              })
                            }
                          >
                            <Text strong>{section.title}</Text>
                          </Button>
                          <Text type="secondary">
                            {filtered
                              ? `显示 ${section.items.length}/${originalSection.items.length}，已选 ${selectedCount}`
                              : `${selectedCount}/${originalSection.items.length}`}
                          </Text>
                        </span>
                        <span className="erp-permission-checklist__actions">
                          <Checkbox
                            aria-label={`${section.title}${filtered ? '当前结果' : '全部功能'}`}
                            checked={selectedKeys.length === sectionKeys.length}
                            indeterminate={
                              selectedKeys.length > 0 &&
                              selectedKeys.length < sectionKeys.length
                            }
                            disabled={disabled}
                            onChange={(event) =>
                              handleSectionChange(
                                sectionKeys,
                                event.target.checked ? sectionKeys : []
                              )
                            }
                          >
                            {filtered ? '全选结果' : '全选本组'}
                          </Checkbox>
                          <Button
                            type="text"
                            size="small"
                            disabled={disabled || selectedKeys.length === 0}
                            onClick={() => handleSectionChange(sectionKeys, [])}
                          >
                            {filtered ? '清空结果' : '清空'}
                          </Button>
                        </span>
                      </div>
                    </td>
                  </tr>
                  {expanded && section.key === 'field' ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="erp-permission-field-list">
                          {section.items.map((item) => renderPermission(item))}
                        </div>
                      </td>
                    </tr>
                  ) : expanded ? (
                    rows.map((row) => (
                      <tr
                        key={row.key}
                        className="erp-permission-matrix__row"
                        data-permission-resource={row.key}
                      >
                        <th scope="row">{row.label}</th>
                        {PERMISSION_MATRIX_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            data-label={column.label}
                            data-empty={row.cells[column.key].length === 0}
                            data-filtered={
                              row.cells[column.key].length === 0 &&
                              row.availableColumns.includes(column.key)
                            }
                          >
                            {row.cells[column.key].length > 0 ? (
                              <div
                                className={`erp-permission-list erp-permission-list--${column.key}`}
                              >
                                {row.cells[column.key].map((item) =>
                                  renderPermission(item, column.key !== 'other')
                                )}
                              </div>
                            ) : (
                              <span
                                className="erp-permission-matrix__empty"
                                aria-label={
                                  row.availableColumns.includes(column.key)
                                    ? '当前筛选已隐藏该操作'
                                    : '无此项权限'
                                }
                                title={
                                  row.availableColumns.includes(column.key)
                                    ? '当前筛选已隐藏该操作'
                                    : '无此项权限'
                                }
                              >
                                {row.availableColumns.includes(column.key)
                                  ? '…'
                                  : '—'}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : null}
                </tbody>
              )
            })}
          </table>
        ) : null}
      </TableScrollRegion>
      {visibleGroups.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            searchKeyword.trim()
              ? '没有匹配的功能，请调整搜索或关闭只看已选'
              : showSelectedOnly
                ? '当前岗位暂无已选功能'
                : '暂无可配置功能'
          }
        />
      ) : null}
    </div>
  )
}

export { PermissionChecklist }

const { Text } = Typography
