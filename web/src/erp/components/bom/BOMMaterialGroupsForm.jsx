/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The horizontal table region needs keyboard scrolling. */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, Empty, Form, Input, Select, Space } from 'antd'
import { message } from '@/common/utils/antdApp'
import BOMMaterialCreateModal from './BOMMaterialCreateModal.jsx'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import {
  BOM_PART_FIELDS,
  groupBOMMaterials,
  getBOMUsage,
  bomLossRateToPercent,
  bomPercentToLossRate,
  parseBOMPartsPaste,
} from '../../utils/bomMaterialGroups.mjs'
import {
  numeric20Scale6Units,
  sumNumeric20Scale6Values,
} from '../../utils/numeric20Scale6.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { getBOMImportLineIssues } from '../../utils/bomXlsxImport.mjs'
import '../../styles/app/bom-editor.css'

const MAX_PARTS = 200
const PART_LABELS = [
  '部位',
  '片数',
  '单位用量',
  '损耗 %',
  '加工基础',
  '加工方式',
  '备注',
]
const blankPart = (source = {}) => ({
  _material_group_key: source._material_group_key,
  material_id: source.material_id,
  unit_id: source.unit_id,
  quantity: '',
  loss_rate: '0',
  position: '',
  piece_count: '',
  process_base: '',
  process_method: '',
  note: '',
})

function BOMMaterialSelect({ canCreateMaterial, onCreateMaterial, ...props }) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef(null)
  const createRef = useRef(null)
  const renderPopup = useCallback(
    (menu) => (
      <>
        {menu}
        {canCreateMaterial ? (
          <Button
            ref={createRef}
            type="link"
            block
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (
                event.key === 'Escape' ||
                (event.key === 'Tab' && event.shiftKey)
              ) {
                event.preventDefault()
                selectRef.current?.focus()
                if (event.key === 'Escape') setOpen(false)
              }
            }}
            onClick={() => {
              selectRef.current?.focus()
              setOpen(false)
              onCreateMaterial()
            }}
          >
            新建物料并使用
          </Button>
        ) : null}
      </>
    ),
    [canCreateMaterial, onCreateMaterial]
  )
  return (
    <Select
      {...props}
      ref={selectRef}
      open={open}
      onOpenChange={setOpen}
      onInputKeyDown={(event) => {
        if (
          open &&
          canCreateMaterial &&
          event.key === 'Tab' &&
          !event.shiftKey
        ) {
          event.preventDefault()
          createRef.current?.focus()
        }
      }}
      popupRender={renderPopup}
    />
  )
}

function LossRateInput({ value, onChange, ...props }) {
  const [text, setText] = useState(() => bomLossRateToPercent(value))
  const emitted = useRef()
  useEffect(() => {
    if (value !== emitted.current) setText(bomLossRateToPercent(value))
  }, [value])
  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => {
        const raw = event.target.value
        setText(raw)
        const rate = bomPercentToLossRate(raw)
        emitted.current = rate ?? `invalid:${raw}`
        onChange(emitted.current)
      }}
    />
  )
}

function usageChanged(previous, current, index) {
  return (
    previous.quantity_text !== current.quantity_text ||
    previous.items?.[index]?.quantity !== current.items?.[index]?.quantity ||
    previous.items?.[index]?.loss_rate !== current.items?.[index]?.loss_rate ||
    previous.items?.[index]?.total_usage_snapshot !==
      current.items?.[index]?.total_usage_snapshot
  )
}

function BOMUsageCell({ index }) {
  return (
    <td className="erp-bom-number-cell">
      <Form.Item
        noStyle
        shouldUpdate={(previous, current) =>
          usageChanged(previous, current, index)
        }
      >
        {({ getFieldValue }) =>
          getBOMUsage(
            getFieldValue(['items', index]),
            getFieldValue('quantity_text')
          ) || '—'
        }
      </Form.Item>
    </td>
  )
}

function BOMMaterialTotals({ indexes, unit }) {
  return (
    <Form.Item
      noStyle
      shouldUpdate={(previous, current) =>
        indexes.some((index) => usageChanged(previous, current, index))
      }
    >
      {({ getFieldValue }) => {
        const items = indexes.map((index) => getFieldValue(['items', index]))
        const usages = items.map((item) =>
          getBOMUsage(item, getFieldValue('quantity_text'))
        )
        return (
          <span>
            {indexes.length} 个部位
            {' · '}单位用量合计：
            {sumNumeric20Scale6Values(items.map((item) => item?.quantity)) ||
              '—'}
            {' · '}总用量：
            {usages.every(Boolean)
              ? `${sumNumeric20Scale6Values(usages)} ${unit}`
              : '填写生产数量和用量后计算'}
          </span>
        )
      }}
    </Form.Item>
  )
}

function BOMImportRowStatus({ index }) {
  return (
    <Form.Item
      noStyle
      shouldUpdate={(previous, current) =>
        previous.items?.[index] !== current.items?.[index]
      }
    >
      {({ getFieldValue }) => {
        const item = getFieldValue(['items', index])
        const issues = getBOMImportLineIssues(item)
        return (
          <small
            className="erp-bom-import-line-status"
            data-bom-import-row-status={
              issues.length ? 'unresolved' : 'matched'
            }
            title={issues.map((issue) => issue.message).join('；')}
          >
            原表第 {item?._import_source?.rowNumber} 行 ·{' '}
            {issues.length ? '待补全' : '已匹配'}
          </small>
        )
      }}
    </Form.Item>
  )
}

export default function BOMMaterialGroupsForm({
  canEdit,
  canCreateMaterial,
  form,
  materialByID,
  materialOptions,
  unitOptions,
  onMaterialCreated,
  registerLineItemRow,
  requestLineItemScroll,
}) {
  // Group structure changes on material/unit selection or row insertion/removal.
  Form.useWatch(
    (values) =>
      (values.items || []).map((item) => [
        item?.material_id,
        item?.unit_id,
        item?._material_group_key,
      ]),
    form
  )
  const items = form.getFieldValue('items') || []
  const groups = groupBOMMaterials(items)
  const materials = useMemo(() => [...materialByID.values()], [materialByID])
  const [creatingFor, setCreatingFor] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const rowRefs = useRef(new Map())

  useLayoutEffect(() => {
    if (!focusRequest) return
    const row = rowRefs.current.get(focusRequest.index)
    const selector = focusRequest.material
      ? 'input[role="combobox"]'
      : `textarea[aria-label="部位 ${focusRequest.index + 1}"]`
    row?.querySelector(selector)?.focus({ preventScroll: true })
    requestLineItemScroll?.(focusRequest.index)
  }, [focusRequest, items.length, requestLineItemScroll])

  const changeMaterial = (indexes, material) => {
    const next = [...(form.getFieldValue('items') || [])]
    indexes.forEach((index) => {
      next[index] = {
        ...next[index],
        material_id: material?.id,
        unit_id: material?.default_unit_id,
        total_usage_snapshot: undefined,
      }
    })
    form.setFieldsValue({ items: next })
  }

  const pasteParts = (event, index, column, add) => {
    const text = event.clipboardData.getData('text/plain')
    if (!canEdit || (!text.includes('\t') && !text.includes('\n'))) return
    // A multiline instruction pasted into one text field remains one value.
    if (column >= 4 && !text.includes('\t')) return
    event.preventDefault()
    try {
      const pasted = parseBOMPartsPaste(text, column)
      const all = form.getFieldValue('items') || []
      if (all.length + pasted.length - 1 > MAX_PARTS) {
        throw new Error('Too many parts')
      }
      const source = all[index]
      form.setFieldValue(['items', index], {
        ...source,
        ...pasted[0],
        total_usage_snapshot: undefined,
      })
      pasted
        .slice(1)
        .forEach((part, offset) =>
          add({ ...blankPart(source), ...part }, index + offset + 1)
        )
    } catch {
      message.error(
        '请按部位、片数、单位用量、损耗百分比、加工基础、加工方式、备注的列顺序粘贴；用量须为正数，最多 200 行。'
      )
    }
  }

  return (
    <section className="erp-bom-material-groups" aria-label="材料分析明细表">
      <div className="erp-bom-material-groups__heading">
        <h2>材料分析明细表</h2>
        {canEdit ? <span>Tab 换格 · 支持粘贴部位数据</span> : null}
      </div>
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            {fields.length === 0 ? (
              <Empty description="先添加一种物料，再填写它的部位和用量" />
            ) : (
              <div
                className="erp-bom-parts-scroll"
                role="region"
                aria-label="物料和部位明细"
                tabIndex={0}
              >
                <table className="erp-bom-parts-table">
                  <colgroup>
                    <col className="erp-bom-col-material" />
                    <col className="erp-bom-col-supplier-item" />
                    <col className="erp-bom-col-spec" />
                    <col className="erp-bom-col-unit" />
                    <col className="erp-bom-col-position" />
                    <col className="erp-bom-col-pieces" />
                    <col className="erp-bom-col-quantity" />
                    <col className="erp-bom-col-loss" />
                    <col className="erp-bom-col-total" />
                    <col className="erp-bom-col-process" />
                    <col className="erp-bom-col-process" />
                    <col className="erp-bom-col-note" />
                    {canEdit ? <col className="erp-bom-col-actions" /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      {[
                        '物料名称',
                        '厂商料号',
                        '规格',
                        '单位',
                        '组装部位',
                        '片数',
                        '单位用量',
                        '损耗 %',
                        '总用量含损耗',
                        '加工基础',
                        '加工方式',
                        '备注',
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                      {canEdit ? (
                        <th scope="col" className="erp-bom-part-actions">
                          操作
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  {groups.map((group) => {
                    const index = group.indexes[0]
                    const field = fields[index]
                    if (!field) return null
                    const material = materialByID.get(Number(group.materialID))
                    const importSource = group.indexes
                      .map((itemIndex) => items[itemIndex]?._import_source)
                      .find(Boolean)
                    const unit = referenceLabel(
                      unitOptions,
                      items[index]?.unit_id,
                      '单位'
                    )
                    const rowSpan = group.indexes.length + 1
                    return (
                      <tbody
                        key={field.key}
                        className="erp-bom-material-group"
                        aria-label={`${material?.name || importSource?.materialName || '待选物料'}的部位`}
                      >
                        {group.indexes.map((itemIndex, partIndex) => {
                          const partField = fields[itemIndex]
                          const source = items[itemIndex]?._import_source
                          return (
                            <tr
                              key={partField.key}
                              data-bom-part-index={itemIndex}
                              ref={(node) => {
                                if (node) rowRefs.current.set(itemIndex, node)
                                else rowRefs.current.delete(itemIndex)
                                registerLineItemRow?.(itemIndex, node)
                              }}
                            >
                              {partIndex === 0 ? (
                                <>
                                  <td
                                    rowSpan={rowSpan}
                                    className="erp-bom-material-cell"
                                  >
                                    {!material && importSource ? (
                                      <div>
                                        {importSource.materialName ||
                                          '原表未填写物料名称'}
                                      </div>
                                    ) : null}
                                    <Form.Item
                                      name={[field.name, 'material_id']}
                                      rules={[
                                        {
                                          required: true,
                                          message: '请选择或新建物料',
                                        },
                                      ]}
                                    >
                                      <BOMMaterialSelect
                                        aria-label={`物料名称 ${index + 1}`}
                                        disabled={!canEdit}
                                        canCreateMaterial={
                                          canEdit && canCreateMaterial
                                        }
                                        onCreateMaterial={() =>
                                          setCreatingFor(group.indexes)
                                        }
                                        showSearch
                                        allowClear
                                        optionFilterProp="label"
                                        options={materialOptions}
                                        labelRender={({ value }) =>
                                          materialByID.get(Number(value))
                                            ?.name || '材料已关联'
                                        }
                                        placeholder={
                                          importSource && !material
                                            ? '选择对应材料档案'
                                            : '搜索并选择物料'
                                        }
                                        onChange={(id) =>
                                          changeMaterial(
                                            group.indexes,
                                            materialByID.get(Number(id))
                                          )
                                        }
                                      />
                                    </Form.Item>
                                    {material?.supplier_name ||
                                    material?.color ? (
                                      <span className="erp-bom-material-cell__context">
                                        {[
                                          material.supplier_name,
                                          material.color,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </span>
                                    ) : null}
                                    {!material && importSource ? (
                                      <span className="erp-bom-material-cell__context">
                                        原表物料 · 待匹配
                                        {importSource.color
                                          ? ` · ${importSource.color}`
                                          : ''}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td
                                    rowSpan={rowSpan}
                                    className="erp-bom-material-cell"
                                  >
                                    {(material
                                      ? material.supplier_item_no
                                      : importSource?.supplierItemNo) || '—'}
                                  </td>
                                  <td
                                    rowSpan={rowSpan}
                                    className="erp-bom-material-cell"
                                  >
                                    {(material
                                      ? material.spec
                                      : importSource?.materialSpec) || '—'}
                                  </td>
                                  <td
                                    rowSpan={rowSpan}
                                    className="erp-bom-material-cell"
                                  >
                                    <Form.Item
                                      name={[field.name, 'unit_id']}
                                      rules={[
                                        {
                                          required: true,
                                          message: '请选择单位',
                                        },
                                      ]}
                                    >
                                      <Select
                                        aria-label={`单位 ${index + 1}`}
                                        disabled={!canEdit}
                                        options={unitOptions}
                                        placeholder="单位"
                                        popupMatchSelectWidth={180}
                                        onChange={(unitID) => {
                                          const next = [
                                            ...form.getFieldValue('items'),
                                          ]
                                          group.indexes.forEach((i) => {
                                            next[i] = {
                                              ...next[i],
                                              unit_id: unitID,
                                              total_usage_snapshot: undefined,
                                            }
                                          })
                                          form.setFieldsValue({ items: next })
                                        }}
                                      />
                                    </Form.Item>
                                  </td>
                                </>
                              ) : null}
                              {BOM_PART_FIELDS.map((key, column) => (
                                <React.Fragment key={key}>
                                  {key === 'process_base' ? (
                                    <BOMUsageCell index={itemIndex} />
                                  ) : null}
                                  <td>
                                    <Form.Item
                                      name={[partField.name, key]}
                                      rules={
                                        key === 'quantity' ||
                                        key === 'loss_rate'
                                          ? [
                                              {
                                                validator: async (_, value) => {
                                                  if (
                                                    numeric20Scale6Units(
                                                      value
                                                    ) === null ||
                                                    (key === 'quantity' &&
                                                      Number(value) <= 0)
                                                  ) {
                                                    throw new Error(
                                                      key === 'quantity'
                                                        ? '填写正数用量'
                                                        : '填写有效损耗'
                                                    )
                                                  }
                                                },
                                              },
                                            ]
                                          : undefined
                                      }
                                    >
                                      {key === 'loss_rate' ? (
                                        <LossRateInput
                                          disabled={!canEdit}
                                          aria-label={`${PART_LABELS[column]} ${
                                            itemIndex + 1
                                          }`}
                                          inputMode="decimal"
                                          onPaste={(event) =>
                                            pasteParts(
                                              event,
                                              itemIndex,
                                              column,
                                              add
                                            )
                                          }
                                        />
                                      ) : key === 'position' || column >= 4 ? (
                                        <BusinessTextArea
                                          disabled={!canEdit}
                                          aria-label={`${PART_LABELS[column]} ${itemIndex + 1}`}
                                          maxLength={key === 'note' ? 255 : 128}
                                          onPaste={(event) =>
                                            pasteParts(
                                              event,
                                              itemIndex,
                                              column,
                                              add
                                            )
                                          }
                                        />
                                      ) : (
                                        <Input
                                          disabled={!canEdit}
                                          aria-label={`${PART_LABELS[column]} ${
                                            itemIndex + 1
                                          }`}
                                          inputMode={
                                            key === 'quantity'
                                              ? 'decimal'
                                              : undefined
                                          }
                                          maxLength={128}
                                          onPaste={(event) =>
                                            pasteParts(
                                              event,
                                              itemIndex,
                                              column,
                                              add
                                            )
                                          }
                                        />
                                      )}
                                    </Form.Item>
                                    {column === 0 ? (
                                      <>
                                        <Form.Item
                                          name={[partField.name, 'id']}
                                          hidden
                                        >
                                          <Input />
                                        </Form.Item>
                                        {partIndex > 0 ? (
                                          <Form.Item
                                            name={[partField.name, 'unit_id']}
                                            hidden
                                          >
                                            <Input />
                                          </Form.Item>
                                        ) : null}
                                        {partIndex > 0 ? (
                                          <Form.Item
                                            name={[
                                              partField.name,
                                              'material_id',
                                            ]}
                                            hidden
                                          >
                                            <Input />
                                          </Form.Item>
                                        ) : null}
                                      </>
                                    ) : null}
                                    {column === 0 && source ? (
                                      <BOMImportRowStatus index={itemIndex} />
                                    ) : null}
                                  </td>
                                </React.Fragment>
                              ))}
                              {canEdit ? (
                                <td className="erp-bom-part-actions">
                                  <Button
                                    type="link"
                                    size="small"
                                    disabled={fields.length >= MAX_PARTS}
                                    onClick={() => {
                                      const copy = {
                                        ...form.getFieldValue([
                                          'items',
                                          itemIndex,
                                        ]),
                                      }
                                      delete copy.id
                                      delete copy._import_source
                                      delete copy.total_usage_snapshot
                                      add(copy, itemIndex + 1)
                                      setFocusRequest({ index: itemIndex + 1 })
                                    }}
                                  >
                                    复制
                                  </Button>
                                  <Button
                                    type="link"
                                    size="small"
                                    danger
                                    disabled={group.indexes.length === 1}
                                    onClick={() => remove(itemIndex)}
                                  >
                                    移除
                                  </Button>
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                        <tr className="erp-bom-material-group__summary">
                          <td colSpan={canEdit ? 9 : 8}>
                            <div className="erp-bom-material-group__footer">
                              {canEdit ? (
                                <Space size={8}>
                                  <Button
                                    type="link"
                                    size="small"
                                    disabled={fields.length >= MAX_PARTS}
                                    onClick={() => {
                                      const nextIndex = group.indexes.at(-1) + 1
                                      add(blankPart(items[index]), nextIndex)
                                      setFocusRequest({ index: nextIndex })
                                    }}
                                  >
                                    ＋ 添加部位
                                  </Button>
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    onClick={() => remove(group.indexes)}
                                  >
                                    移除物料
                                  </Button>
                                </Space>
                              ) : null}
                              <BOMMaterialTotals
                                indexes={group.indexes}
                                unit={unit}
                              />
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    )
                  })}
                </table>
              </div>
            )}
            {canEdit ? (
              <Button
                block
                type="dashed"
                className="erp-bom-add-material"
                disabled={fields.length >= MAX_PARTS}
                onClick={() => {
                  add(blankPart())
                  setFocusRequest({ index: fields.length, material: true })
                }}
              >
                ＋ 添加物料
              </Button>
            ) : null}
            <div className="erp-bom-material-groups__count">
              {groups.length} 种物料 · {fields.length} 个部位
            </div>
          </>
        )}
      </Form.List>
      <BOMMaterialCreateModal
        open={creatingFor !== null}
        materials={materials}
        unitOptions={unitOptions}
        onCancel={() => setCreatingFor(null)}
        onCreated={(material) => {
          onMaterialCreated(material)
          changeMaterial(creatingFor, material)
          setCreatingFor(null)
        }}
      />
    </section>
  )
}
