import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, Form, Input, Space } from 'antd'
import useBusinessLineItemGroups from '../business-list/useBusinessLineItemGroups.js'
import BusinessLineItemGroupControls from '../business-list/BusinessLineItemGroupControls.jsx'
import { BusinessLineItemGroupHeading } from '../business-list/BusinessLineItemsTable.jsx'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import { BOMQuantityInput } from './BOMSourceValue.jsx'
import { bomSourceColumnLabel, formatBOMSourceNumber, sumBOMSourceNumbers, parseBOMSourceNumber } from '../../utils/bomSourceValues.mjs'
import Select from '@/common/components/select/AppSelect'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import { BusinessLineItemsEmpty } from '../business-list/BusinessCompactFieldTable.jsx'
import { message } from '@/common/utils/antdApp'
import BOMMaterialCreateModal from './BOMMaterialCreateModal.jsx'
import BOMMaterialSelect from './BOMMaterialSelect.jsx'
import { bomMaterialConflictText, buildBOMMaterialCreateDefaults, readBOMMaterialSource } from '../../utils/bomMaterialMatching.mjs'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessLineItemsFooter from '../business-list/BusinessLineItemsFooter.jsx'
import '../business-list/businessLineItemGroups.css'
import '../business-list/businessFormSections.css'
import {
  BOM_PART_FIELDS,
  groupBOMMaterials,
  bindBOMMaterialReference,
  getBOMUsage,
  bomLossRateToPercent,
  bomPercentToLossRate,
  parseBOMPartsPaste,
} from '../../utils/bomMaterialGroups.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { getBOMImportLineIssues } from '../../utils/bomXlsxImport.mjs'
import BOMImportLineStatus from './BOMImportLineStatus.jsx'
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
        {({ getFieldValue }) => {
          const item = getFieldValue(['items', index]) || {}
          const usage = getBOMUsage(item, getFieldValue('quantity_text'))
          return <span>{formatBOMSourceNumber(usage, item.source_snapshot?.total_format) || '—'}</span>
        }}
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
            {sumBOMSourceNumbers(items.map((item) => item?.quantity)) ||
              '—'}
            {' · '}总用量：
            {usages.every(Boolean)
              ? `${formatBOMSourceNumber(sumBOMSourceNumbers(usages), items[0]?.source_snapshot?.total_format)} ${unit}`
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
          >
            <span className="erp-bom-import-line-status__source">Excel 第 {item?._import_source?.rowNumber} 行</span>
            <BOMImportLineStatus issues={issues} rowNumber={item?._import_source?.rowNumber} />
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
  actions,
  notice,
  onItemsChange,
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
  const disclosure = useBusinessLineItemGroups({ form, groups: groups.map((group) => ({ id: group.key, indexes: group.indexes })) })
  const materials = useMemo(() => [...materialByID.values()], [materialByID])
  const [creatingFor, setCreatingFor] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const rowRefs = useRef(new Map())
  const materialGroupSequence = useRef(0)

  useLayoutEffect(() => {
    if (!focusRequest) return
    const row = rowRefs.current.get(focusRequest.index)
    const selector = focusRequest.material
      ? 'input[role="combobox"]'
      : `textarea[aria-label="部位 ${focusRequest.index + 1}"]`
    row?.querySelector(selector)?.focus({ preventScroll: true })
    requestLineItemScroll?.(focusRequest.index)
  }, [focusRequest, items.length, requestLineItemScroll])

  const updateMaterialGroup = (indexes, changes = {}) => {
    onItemsChange?.()
    const next = [...(form.getFieldValue('items') || [])]
    // Preserve draft/source groups when adding parts or clearing material.
    const groupKey =
      next[indexes[0]]?._material_group_key ||
      `draft-${++materialGroupSequence.current}`
    indexes.forEach((index) => {
      next[index] = {
        ...next[index],
        ...(typeof changes === 'function' ? changes(next[index]) : changes),
        _material_group_key: next[index]?._material_group_key || groupKey,
      }
    })
    form.setFieldsValue({ items: next })
    return next
  }

  const materialConflict = (indexes, material) => indexes
    .map((index) => bomMaterialConflictText(form.getFieldValue(['items', index]), material, unitOptions))
    .find(Boolean) || ''

  const changeMaterial = (indexes, material) => {
    const conflict = materialConflict(indexes, material)
    if (conflict) {
      message.warning(`${conflict}，请先核对物料和用量。`)
      return
    }
    updateMaterialGroup(indexes, (item) => bindBOMMaterialReference(item, material))
    setFocusRequest({ index: indexes[0], material: true })
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
      const group = groups.find((entry) => entry.indexes.includes(index))
      const source = updateMaterialGroup(group.indexes)[index]
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
    <section className="erp-bom-material-groups" aria-label="材料分析明细表" ref={disclosure.rootRef} onFocusCapture={disclosure.onFocusCapture}>
      <div className="erp-business-form-heading erp-bom-material-groups__heading">
        <h2>材料分析明细表</h2>
        {actions || (canEdit ? <span>Tab 换格 · 支持粘贴部位数据</span> : null)}
      </div>
      {notice}
      {groups.length > 1 ? <BusinessLineItemGroupControls controller={disclosure} form={form} label="材料分析明细表" groupCount={groups.length} /> : null}
      <Form.List name="items">
        {(fields, { add, remove }) => (
          <>
            {fields.length === 0 ? (
              <BusinessLineItemsEmpty>
                先添加一种物料，再填写它的部位和用量
              </BusinessLineItemsEmpty>
            ) : (
              <TableScrollRegion
                className="erp-bom-parts-scroll"
                role="region"
                aria-label="物料和部位明细"
                tabIndex={0}
              >
                <table className={`erp-bom-parts-table${items.some((item) => item?.source_snapshot) ? ' erp-bom-parts-table--source' : ''}`} data-table-lines="fixed">
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
                        bomSourceColumnLabel(items, 'quantity', '单位用量'),
                        '损耗 %',
                        bomSourceColumnLabel(items, 'total', '总用量含损耗'),
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
                      .map((itemIndex) => readBOMMaterialSource(items[itemIndex]))
                      .find(Boolean)
                    const unit = referenceLabel(
                      unitOptions,
                      items[index]?.unit_id,
                      '单位'
                    )
                    const rowSpan = group.indexes.length + 1
                    const collapsed = groups.length > 1 && disclosure.isCollapsed(group.key)
                    const materialName = material?.name || importSource?.materialName || '待选物料'
                    return (
                      <React.Fragment key={field.key}>
                        {groups.length > 1 ? (
                          <BusinessLineItemGroupHeading
                            columnCount={canEdit ? 13 : 12}
                            collapsed={collapsed}
                            onToggle={() => disclosure.toggle(group.key)}
                            label={materialName}
                            count={group.indexes.length}
                            countLabel="个部位"
                            controller={disclosure}
                            groupId={group.key}
                          >
                            {materialName} · {unit}
                          </BusinessLineItemGroupHeading>
                      ) : null}
                        <tbody
                          key="parts"
                          hidden={collapsed}
                          data-line-item-collapsed={collapsed ? 'true' : undefined}
                          className="erp-bom-material-group erp-editable-line-group"
                          aria-label={`${material?.name || importSource?.materialName || '待选物料'}的部位`}
                        >
                          {group.indexes.map((itemIndex, partIndex) => {
                          const partField = fields[itemIndex]
                          const source = items[itemIndex]?._import_source
                          return (
                            <tr
                              key={partField.key}
                              data-bom-part-index={itemIndex}
                              data-line-item-index={itemIndex}
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
                                        materialByID={materialByID}
                                        sourceItem={items[index]}
                                        unitOptions={unitOptions}
                                        placeholder={
                                          importSource && !material
                                            ? '选择对应材料档案'
                                            : '搜索并选择物料'
                                        }
                                        onChange={(id, option) =>
                                          changeMaterial(
                                            group.indexes,
                                            option?.record || materialByID.get(Number(id))
                                          )
                                        }
                                      />
                                    </Form.Item>
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
                                    className="erp-bom-material-cell erp-bom-center-cell"
                                  >
                                    {(material
                                      ? material.spec
                                      : importSource?.materialSpec) || '—'}
                                  </td>
                                  <td
                                    rowSpan={rowSpan}
                                    className="erp-bom-material-cell erp-bom-center-cell"
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
                                        showSearch
                                        optionFilterProp="searchText"
                                        placeholder="选择单位"
                                        popupMatchSelectWidth={180}
                                        onChange={(unitID) => {
                                          onItemsChange?.()
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
                                  <td
                                    className={
                                      key === 'quantity' || key === 'loss_rate'
                                        ? 'erp-bom-number-input-cell'
                                        : key === 'note'
                                          ? undefined
                                          : 'erp-bom-center-cell'
                                    }
                                  >
                                    <Form.Item
                                      name={[partField.name, key]}
                                      rules={
                                        key === 'quantity' ||
                                        key === 'loss_rate'
                                          ? [
                                              {
                                                validator: async (_, value) => {
                                                  if (
                                                    parseBOMSourceNumber(
                                                      value
                                                    ) === null ||
                                                    (key === 'quantity' &&
                                                      !parseBOMSourceNumber(value)?.units)
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
                                      ) : key === 'quantity' ? (
                                        <BOMQuantityInput
                                          source={items[itemIndex]?.source_snapshot}
                                          disabled={!canEdit}
                                          aria-label={`${PART_LABELS[column]} ${itemIndex + 1}`}
                                          inputMode="decimal"
                                          onPaste={(event) => pasteParts(event, itemIndex, column, add)}
                                        />
                                      ) : key === 'position' || column >= 4 ? (
                                        <BusinessTextArea
                                          minRows={key === 'note' ? 2 : 1}
                                          disabled={!canEdit}
                                          aria-label={`${PART_LABELS[column]} ${itemIndex + 1}`}
                                          maxLength={key === 'note' ? BusinessTextPolicy.noteMaxCharacters : 128}
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
                                    size="small"
                                    className="erp-line-items-form__add-button"
                                    disabled={fields.length >= MAX_PARTS}
                                    onClick={() => {
                                      const copy = {
                                        ...updateMaterialGroup(group.indexes)[
                                          itemIndex
                                        ],
                                      }
                                      delete copy.id
                                      delete copy._import_source
                                      delete copy.source_snapshot
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
                                      size="small"
                                      className="erp-line-items-form__add-button"
                                      disabled={fields.length >= MAX_PARTS}
                                      onClick={() => {
                                      const nextIndex = group.indexes.at(-1) + 1
                                      const source = updateMaterialGroup(
                                        group.indexes
                                      )[index]
                                      add(blankPart(source), nextIndex)
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
                      </React.Fragment>
                    )
                  })}
                </table>
              </TableScrollRegion>
            )}
            <BusinessLineItemsFooter
              addLabel="添加物料"
              addDisabled={fields.length >= MAX_PARTS}
              onAdd={
                canEdit
                  ? () => {
                      add(blankPart())
                      setFocusRequest({ index: fields.length, material: true })
                    }
                  : undefined
              }
              stats={[
                { key: 'materials', value: groups.length, suffix: '种物料' },
                { key: 'parts', value: fields.length, suffix: '个部位' },
              ]}
            />
          </>
        )}
      </Form.List>
      <BOMMaterialCreateModal
        open={creatingFor !== null}
        materials={materials}
        unitOptions={unitOptions}
        initialValues={buildBOMMaterialCreateDefaults(creatingFor ? items[creatingFor[0]] : undefined, unitOptions)}
        validateMaterial={(material) => creatingFor ? materialConflict(creatingFor, material) : ''}
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
