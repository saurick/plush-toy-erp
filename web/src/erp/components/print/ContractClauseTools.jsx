import React, { useLayoutEffect, useRef } from 'react'
import Select from '@/common/components/select/AppSelect'
import {
  CONTRACT_CLAUSE_GROUPS_MAX,
  CONTRACT_CLAUSES_PER_GROUP_MAX,
  editContractClauseGroup,
  editContractClauseGroups,
} from '../../utils/contractClauseEditor.mjs'
import { PrintWorkspaceToolSection } from './PrintWorkspaceShell.jsx'
import { PrintToolButton } from './PrintWorkspaceTools.jsx'

export default function ContractClauseTools({
  clauses,
  selection,
  onSelect,
  onAction,
  onGroupAction,
  onReturnToEdit,
  paperRef,
  contractKey = '',
  contractLabel = '',
  disabled = false,
  feedback,
  reportFeedback,
}) {
  const group = selection.groupKey === null ? null :
    clauses.find(({ key }) => key === selection.groupKey) || clauses[0]
  const groupKey = group?.key || ''
  const items = group?.items || []
  const groupIndex = clauses.indexOf(group)
  const nameInputRef = useRef(null)
  const index = items.length && selection.index !== null
    ? Math.min(Math.max(0, selection.index ?? 0), items.length - 1)
    : null
  const focusFrameRef = useRef(null)
  const selectedGroupRef = useRef({ groupKey, contractKey })
  useLayoutEffect(() => {
    selectedGroupRef.current = { groupKey, contractKey }
  }, [groupKey, contractKey])
  useLayoutEffect(() => () => cancelAnimationFrame(focusFrameRef.current), [])
  const queueFocus = (targetGroupKey, focus) => {
    cancelAnimationFrame(focusFrameRef.current)
    const documentLike = paperRef.current?.ownerDocument
    const previousActive = documentLike?.activeElement
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null
      if (
        selectedGroupRef.current.groupKey !== targetGroupKey ||
        selectedGroupRef.current.contractKey !== contractKey
      ) {
        return
      }
      const active = documentLike?.activeElement
      // 用户已主动切换编辑位置时，不再执行旧定位。
      if (
        active &&
        active !== previousActive &&
        active !== documentLike.body &&
        active !== documentLike.documentElement
      )
        { return }
      focus()
    })
  }
  const locate = (nextIndex) => {
    queueFocus(groupKey, () => {
      let root = paperRef.current
      if (contractKey) {
        root = Array.from(
          root?.querySelectorAll('[data-contract-key]') || []
        ).find((node) => node.dataset.contractKey === contractKey)
      }
      const group = Array.from(
        root?.querySelectorAll('[data-print-clause-group]') || []
      ).find((node) => node.dataset.printClauseGroup === groupKey)
      const item = group
        ?.querySelectorAll('[data-print-clause-index]')
        .item(nextIndex)
      const editor = item?.querySelector('[contenteditable="true"]')
      editor?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      editor?.focus({ preventScroll: true })
    })
  }
  const actGroup = (action) => {
    const request = {
      groupKey,
      action,
      ...(action === 'insert'
        ? { newGroupKey: `group-${crypto.randomUUID()}` }
        : {}),
    }
    const result = editContractClauseGroups(clauses, request)
    if (!result.ok) {
      reportFeedback?.('clauses', result.message, 'error')
      return
    }
    onGroupAction(request)
    onReturnToEdit?.()
    onSelect({ groupKey: result.selectedGroupKey, index: 0 })
    reportFeedback?.('clauses', result.message)
    if (action === 'insert') {
      queueFocus(result.selectedGroupKey, () => nameInputRef.current?.focus())
    }
  }
  const act = (action, position) => {
    const request = { groupKey, index, action, position }
    const result = editContractClauseGroup(clauses, request)
    if (!result.ok) {
      reportFeedback?.('clauses', result.message, 'error')
      return
    }
    onAction(request)
    onReturnToEdit?.()
    onSelect({ groupKey, index: result.selectedIndex })
    reportFeedback?.('clauses', result.message)
    if (result.selectedIndex !== null) locate(result.selectedIndex)
  }
  return (
    <PrintWorkspaceToolSection
      title="条款编辑"
      tool="clauses"
      collapsible
      feedback={feedback?.area === 'clauses' ? feedback : null}
    >
      {contractLabel ? (
        <p className="erp-print-shell__counter">当前合同：{contractLabel}</p>
      ) : null}
      <label className="erp-print-clause-tools__field">
        <span>条款分组</span>
        <Select
          aria-label="条款分组"
          virtual={false}
          data-value={groupKey || undefined}
          value={groupKey || undefined}
          disabled={disabled || clauses.length === 0}
          placeholder={clauses.length ? '选择条款分组' : '暂无分组'}
          onChange={(value) => {
            cancelAnimationFrame(focusFrameRef.current)
            onSelect({ groupKey: value ?? null, index: value === undefined ? null : 0 })
          }}
          options={clauses.map(({ key, label, items: groupItems }) => ({
            value: key,
            label: `${label.trim() || '未命名分组'}（${groupItems.length} 条）`,
            'data-select-value': key,
          }))}
        />
      </label>
      {group ? (
        <label className="erp-print-clause-tools__field">
          <span>分组名称</span>
          <input
            ref={nameInputRef}
            aria-label="分组名称"
            placeholder="填写分组名称"
            value={group.label}
            disabled={disabled}
            onChange={(event) =>
              onGroupAction({
                groupKey,
                action: 'rename',
                label: event.target.value,
              })
            }
          />
        </label>
      ) : null}
      <div className="erp-print-shell__toolbar-group">
        <PrintToolButton
          icon="note"
          disabled={disabled || clauses.length >= CONTRACT_CLAUSE_GROUPS_MAX}
          data-print-structure-action
          onClick={() => actGroup('insert')}
        >
          新增分组
        </PrintToolButton>
        <PrintToolButton
          icon="remove"
          disabled={disabled || !group}
          data-print-structure-action
          onClick={() => actGroup('remove')}
        >
          删除分组
        </PrintToolButton>
        <PrintToolButton
          icon="up"
          disabled={disabled || groupIndex <= 0}
          data-print-structure-action
          onClick={() => actGroup('up')}
        >
          上移分组
        </PrintToolButton>
        <PrintToolButton
          icon="down"
          disabled={
            disabled || groupIndex < 0 || groupIndex >= clauses.length - 1
          }
          data-print-structure-action
          onClick={() => actGroup('down')}
        >
          下移分组
        </PrintToolButton>
      </div>
      <p className="erp-print-shell__counter">
        条款分组：{clauses.length}/{CONTRACT_CLAUSE_GROUPS_MAX}
      </p>
      <label className="erp-print-clause-tools__field">
        <span>当前条目</span>
        <Select
          aria-label="当前条目"
          virtual={false}
          data-value={index ?? undefined}
          value={index ?? undefined}
          disabled={disabled || items.length === 0}
          placeholder={items.length ? '选择当前条目' : '本组暂无条目'}
          onChange={(nextIndex) => {
            cancelAnimationFrame(focusFrameRef.current)
            onSelect({ groupKey, index: nextIndex ?? null })
            if (nextIndex !== undefined) locate(nextIndex)
          }}
          options={items.map((item, itemIndex) => ({
            value: itemIndex,
            label: `第 ${itemIndex + 1} 条：${String(item).trim().slice(0, 18) || '留白'}`,
            'data-select-value': String(itemIndex),
          }))}
        />
      </label>
      <div className="erp-print-shell__toolbar-group">
        {!group ? null : index === null ? (
          <PrintToolButton
            icon="text"
            wide
            disabled={disabled}
            data-print-structure-action
            onClick={() => act('insert')}
          >
            新增条目
          </PrintToolButton>
        ) : (
          <>
            <PrintToolButton
              icon="up"
              disabled={
                disabled || items.length >= CONTRACT_CLAUSES_PER_GROUP_MAX
              }
              data-print-structure-action
              onClick={() => act('insert', 'before')}
            >
              上插一条
            </PrintToolButton>
            <PrintToolButton
              icon="down"
              disabled={
                disabled || items.length >= CONTRACT_CLAUSES_PER_GROUP_MAX
              }
              data-print-structure-action
              onClick={() => act('insert', 'after')}
            >
              下插一条
            </PrintToolButton>
            <PrintToolButton
              icon="up"
              disabled={disabled || index === 0}
              data-print-structure-action
              onClick={() => act('up')}
            >
              上移一条
            </PrintToolButton>
            <PrintToolButton
              icon="down"
              disabled={disabled || index === items.length - 1}
              data-print-structure-action
              onClick={() => act('down')}
            >
              下移一条
            </PrintToolButton>
            <PrintToolButton
              icon="clear"
              disabled={disabled}
              data-print-structure-action
              onClick={() => act('clear')}
            >
              清空当前条
            </PrintToolButton>
            <PrintToolButton
              icon="remove"
              disabled={disabled}
              data-print-structure-action
              onClick={() => act('remove')}
            >
              删除当前条
            </PrintToolButton>
          </>
        )}
      </div>
    </PrintWorkspaceToolSection>
  )
}
