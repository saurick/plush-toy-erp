import React, { useEffect, useRef, useState } from 'react'
import { Dropdown } from 'antd'
import { CheckOutlined, DownOutlined } from '@ant-design/icons'
import {
  MOBILE_TASK_SORT_OPTIONS,
  MOBILE_TASK_STATUS_OPTIONS,
} from '../../utils/mobileTaskQueries.mjs'

export default function MobileTaskListOptions({
  sortKey,
  statusKey,
  onChange,
  onReset,
  resetDisabled,
  onOpenChange,
}) {
  const [openKey, setOpenKey] = useState(null)
  const triggerRefs = useRef({})
  useEffect(() => {
    onOpenChange?.(openKey !== null)
  }, [openKey, onOpenChange])
  const controls = [
    {
      key: 'sortKey',
      title: '任务排序',
      value: sortKey,
      options: MOBILE_TASK_SORT_OPTIONS,
    },
    {
      key: 'statusKey',
      title: '任务状态',
      value: statusKey,
      options: MOBILE_TASK_STATUS_OPTIONS,
    },
  ]
  return (
    <div
      className="mobile-task-list-options mx-4 mt-3"
      data-testid="mobile-task-list-options"
    >
      {controls.map((control) => {
        // 菜单焦点依赖非空 key，全部状态的查询值仍保持为空。
        const options = control.options.map((option) => ({
          ...option,
          key: `${control.key}:${option.value}`,
        }))
        const selectedOption = options.find(
          (option) => option.value === control.value
        )
        return (
          <Dropdown
            key={control.key}
            overlayClassName="mobile-task-options-dropdown"
            trigger={['click']}
            placement={control.key === 'sortKey' ? 'bottomLeft' : 'bottomRight'}
            autoFocus
            open={openKey === control.key}
            onOpenChange={(open) =>
              setOpenKey((current) =>
                open ? control.key : current === control.key ? null : current
              )
            }
            menu={{
              'aria-label': control.title,
              selectable: true,
              selectedKeys: [selectedOption?.key],
              items: options.map((option) => ({
                key: option.key,
                role: 'menuitemradio',
                'aria-checked': option.value === control.value,
                label: (
                  <span className="mobile-task-options-dropdown__label">
                    <span>{option.label}</span>
                    {option.value === control.value && (
                      <CheckOutlined aria-hidden="true" />
                    )}
                  </span>
                ),
              })),
              onClick: ({ key }) => {
                const option = options.find((item) => item.key === key)
                setOpenKey(null)
                triggerRefs.current[control.key]?.focus({ preventScroll: true })
                if (option && option.value !== control.value) {
                  onChange({ [control.key]: option.value })
                }
              },
            }}
          >
            <button
              ref={(node) => {
                triggerRefs.current[control.key] = node
              }}
              type="button"
              className="mobile-task-list-options__trigger"
              data-testid={`mobile-task-${control.key}-trigger`}
              aria-label={`${control.title}：${selectedOption?.label}`}
              aria-haspopup="menu"
              aria-expanded={openKey === control.key}
            >
              <span>{selectedOption?.label}</span>
              <DownOutlined
                className={
                  openKey === control.key
                    ? 'mobile-task-list-options__arrow--open'
                    : undefined
                }
                aria-hidden="true"
              />
            </button>
          </Dropdown>
        )
      })}
      <button
        type="button"
        className="mobile-task-list-options__reset"
        disabled={resetDisabled}
        onClick={onReset}
      >
        重置
      </button>
    </div>
  )
}
