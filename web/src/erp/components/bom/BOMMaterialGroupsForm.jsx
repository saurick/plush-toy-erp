import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Form, Input, Select, Space, Tag } from 'antd'
import { message } from '@/common/utils/antdApp'
import BusinessLineItemsSection from '../business-list/BusinessLineItemsSection.jsx'
import BOMMaterialCreateModal from './BOMMaterialCreateModal.jsx'
import {
  BOM_PART_FIELDS,
  groupBOMMaterials,
  calculateBOMUsage,
  bomLossRateToPercent,
  bomPercentToLossRate,
  parseBOMPartsPaste,
} from '../../utils/bomMaterialGroups.mjs'
import {
  numeric20Scale6Units,
  sumNumeric20Scale6Values,
} from '../../utils/numeric20Scale6.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

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
  const items = Form.useWatch('items', form) || []
  const productionQuantity = Form.useWatch('quantity_text', form)
  const groups = groupBOMMaterials(items)
  const materials = useMemo(() => [...materialByID.values()], [materialByID])
  const [creatingFor, setCreatingFor] = useState(null)
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
    event.preventDefault()
    try {
      const pasted = parseBOMPartsPaste(text, column)
      const all = form.getFieldValue('items') || []
      if (all.length + pasted.length - 1 > 200) {
        throw new Error('一份材料明细最多 200 个部位，请拆分版本')
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
    <>
      <BusinessLineItemsSection
        scrollWithinSection={false}
        className="erp-bom-material-groups"
        title="材料分析明细表"
        description="每种物料选一次，下面连续填写各部位；支持 Tab 换格，也可从 Excel 粘贴部位数据。"
        emptyDescription="先添加一种物料，再填写它的部位和用量"
        renderRow={({ field, index, fields, add, remove }) => {
          const group = groups.find((entry) => entry.indexes[0] === index)
          if (!group) return null
          const material = materialByID.get(Number(group.materialID))
          const usages = group.indexes.map((i) =>
            calculateBOMUsage(
              items[i]?.quantity,
              items[i]?.loss_rate,
              productionQuantity
            )
          )
          return (
            <section
              className="erp-bom-material-group"
              key={field.key}
              ref={(node) => registerLineItemRow?.(index, node)}
            >
              <div className="erp-bom-material-group__header">
                <Form.Item
                  label="物料名称 / 厂商料号"
                  name={[field.name, 'material_id']}
                  rules={[{ required: true, message: '请选择或新建物料' }]}
                >
                  <Select
                    disabled={!canEdit}
                    showSearch
                    allowClear
                    optionFilterProp="label"
                    options={materialOptions}
                    placeholder="搜索物料、厂商、料号或色号"
                    onChange={(id) =>
                      changeMaterial(
                        group.indexes,
                        materialByID.get(Number(id))
                      )
                    }
                  />
                </Form.Item>
                <div className="erp-bom-material-group__identity">
                  <span>厂商：{material?.supplier_name || '待补充'}</span>
                  <span>料号：{material?.supplier_item_no || '—'}</span>
                  <span>色号 / 颜色：{material?.color || '—'}</span>
                  <span>规格：{material?.spec || '—'}</span>
                  <span>
                    单位：
                    {referenceLabel(unitOptions, items[index]?.unit_id, '单位')}
                  </span>
                </div>
                <Space>
                  {canEdit && canCreateMaterial ? (
                    <Button onClick={() => setCreatingFor(group.indexes)}>
                      新建物料
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button danger onClick={() => remove(group.indexes)}>
                      移除物料
                    </Button>
                  ) : null}
                </Space>
              </div>
              <div
                className="erp-bom-parts-scroll"
                role="region"
                aria-label={`${material?.name || '待选物料'}的部位明细`}
              >
                <table className="erp-bom-parts-table">
                  <thead>
                    <tr>
                      {PART_LABELS.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                      <th>含损耗总用量</th>
                      {canEdit ? <th>操作</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {group.indexes.map((itemIndex, partIndex) => {
                      const partField = fields[itemIndex]
                      return (
                        <tr key={partField.key}>
                          {BOM_PART_FIELDS.map((key, col) => (
                            <td key={key}>
                              <Form.Item
                                name={[partField.name, key]}
                                rules={
                                  key === 'quantity'
                                    ? [
                                        {
                                          validator: async (_, value) => {
                                            if (
                                              numeric20Scale6Units(value) ===
                                                null ||
                                              Number(value) <= 0
                                            ) {
                                              throw new Error('填写正数用量')
                                            }
                                          },
                                        },
                                      ]
                                    : key === 'loss_rate'
                                      ? [
                                          {
                                            validator: async (_, value) => {
                                              if (
                                                numeric20Scale6Units(value) ===
                                                null
                                              ) {
                                                throw new Error('填写有效损耗')
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
                                    aria-label={`${PART_LABELS[col]} ${itemIndex + 1}`}
                                    onPaste={(event) =>
                                      pasteParts(event, itemIndex, col, add)
                                    }
                                  />
                                ) : (
                                  <Input
                                    disabled={!canEdit}
                                    aria-label={`${PART_LABELS[col]} ${itemIndex + 1}`}
                                    maxLength={key === 'note' ? 255 : 128}
                                    onPaste={(event) =>
                                      pasteParts(event, itemIndex, col, add)
                                    }
                                  />
                                )}
                              </Form.Item>
                              {col === 0 ? (
                                <>
                                  <Form.Item
                                    name={[partField.name, 'id']}
                                    hidden
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Form.Item
                                    name={[partField.name, 'unit_id']}
                                    hidden
                                  >
                                    <Input />
                                  </Form.Item>
                                  {partIndex > 0 ? (
                                    <Form.Item
                                      name={[partField.name, 'material_id']}
                                      hidden
                                    >
                                      <Input />
                                    </Form.Item>
                                  ) : null}
                                </>
                              ) : null}
                            </td>
                          ))}
                          <td>{usages[partIndex] || '—'}</td>
                          {canEdit ? (
                            <td>
                              <Space>
                                <Button
                                  size="small"
                                  onClick={() => {
                                    const copy = { ...items[itemIndex] }
                                    delete copy.id
                                    delete copy._import_source
                                    add(copy, itemIndex + 1)
                                  }}
                                >
                                  复制
                                </Button>
                                <Button
                                  size="small"
                                  danger
                                  disabled={group.indexes.length === 1}
                                  onClick={() => remove(itemIndex)}
                                >
                                  移除
                                </Button>
                              </Space>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="erp-bom-material-group__footer">
                {canEdit ? (
                  <Button
                    onClick={() =>
                      add(blankPart(items[index]), group.indexes.at(-1) + 1)
                    }
                  >
                    添加同料部位
                  </Button>
                ) : null}
                <Tag>{group.indexes.length} 个部位</Tag>
                <span>
                  物料合计：
                  {usages.every(Boolean)
                    ? sumNumeric20Scale6Values(usages)
                    : '填写生产数量和用量后计算'}
                </span>
              </div>
            </section>
          )
        }}
        footerProps={({ add, fields }) => ({
          addLabel: '添加物料',
          addDisabled: !canEdit || fields.length >= 200,
          onAdd: () => {
            add(blankPart())
            requestLineItemScroll?.(fields.length)
          },
          stats: [
            {
              key: 'materials',
              label: '物料',
              value: groups.length,
              suffix: '种',
            },
            { key: 'parts', label: '部位', value: fields.length, suffix: '项' },
          ],
        })}
      />
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
    </>
  )
}
