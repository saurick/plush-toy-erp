import React, { useCallback, useRef, useState } from 'react'
import { Button } from 'antd'
import RemoteReferenceSelect from '../RemoteReferenceSelect.jsx'
import { materialOption } from '../../utils/referenceSelectOptions.mjs'
import { bomMaterialConflictText } from '../../utils/bomMaterialMatching.mjs'
import './bomMaterialMatching.css'

export default function BOMMaterialSelect({
  canCreateMaterial,
  onCreateMaterial,
  sourceItem,
  unitOptions,
  materialByID,
  options = [],
  onChange,
  disabled,
  ...props
}) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef(null)
  const createRef = useRef(null)
  const optionFor = useCallback(
    (material) => ({
      ...materialOption(material),
      identity: {
        name: `${material.name || '物料名称未填写'}${material.is_active === false ? '（已停用）' : ''}`,
      },
      disabled: Boolean(
        bomMaterialConflictText(sourceItem, material, unitOptions)
      ),
      record: material,
    }),
    [sourceItem, unitOptions]
  )
  const focusSelect = useCallback(() => selectRef.current?.focus(), [])
  const popupKeys = useCallback(
    (event) => {
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        focusSelect()
      } else if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault()
        focusSelect()
      }
    },
    [focusSelect]
  )
  const apply = (material, option) => {
    if (
      !disabled &&
      !bomMaterialConflictText(sourceItem, material, unitOptions)
    ) {
      setOpen(false)
      onChange?.(material?.id, option)
    }
  }
  const renderOption = useCallback(
    (option) => {
      const material = option.data.record
      if (!material) return option.label
      const conflict = bomMaterialConflictText(
        sourceItem,
        material,
        unitOptions
      )
      return (
        <div className="erp-bom-material-option">
          <span className="erp-bom-material-option__identity">
            <span>
              {material.name} · {material.code}
            </span>
            <small>
              {[
                material.supplier_name,
                material.supplier_item_no,
                material.spec,
                material.color,
                unitOptions.find(
                  (unit) =>
                    Number(unit.value) === Number(material.default_unit_id)
                )?.label,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
            {conflict ? (
              <small className="erp-bom-material-option__conflict">
                {conflict}
              </small>
            ) : null}
          </span>
        </div>
      )
    },
    [sourceItem, unitOptions]
  )
  const renderPopup = useCallback(
    (menu) => (
      <div className="erp-bom-material-popup">
        {menu}
        {canCreateMaterial ? (
          <Button
            ref={createRef}
            type="link"
            block
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={popupKeys}
            onClick={() => {
              focusSelect()
              setOpen(false)
              onCreateMaterial()
            }}
          >
            新建物料并使用
          </Button>
        ) : null}
      </div>
    ),
    [canCreateMaterial, popupKeys, focusSelect, onCreateMaterial]
  )
  return (
    <div className="erp-bom-material-reference">
      <RemoteReferenceSelect
        referenceType="materials"
        presentation="reference"
        {...props}
        disabled={disabled}
        ref={selectRef}
        open={open}
        onOpenChange={setOpen}
        options={options.map((option) => {
        const material = materialByID.get(Number(option.value))
        return material ? { ...option, ...optionFor(material) } : option
      })}
        mapOption={optionFor}
        onChange={(id, option) =>
        apply(option?.record || materialByID.get(Number(id)), option)
      }
        onInputKeyDown={(event) => {
        if (open && canCreateMaterial && event.key === 'Tab' && !event.shiftKey) {
          // Tab 进入建档按钮，避免候选列表同时执行选中。
          event.preventDefault()
          event.stopPropagation()
          createRef.current?.focus()
        }
      }}
        optionRender={renderOption}
        popupRender={renderPopup}
        emptyDescription="暂无可选物料"
        filteredEmptyDescription="未找到对应物料"
      />
      {canCreateMaterial ? <Button type="link" disabled={disabled} aria-label="新建物料" data-bom-material-create-trigger onClick={() => { setOpen(false); onCreateMaterial() }}>＋ 新建物料</Button> : null}
    </div>
  )
}
