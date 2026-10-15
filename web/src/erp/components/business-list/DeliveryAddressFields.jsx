import React, { useState } from 'react'
import { Cascader, Form, Input, Select } from 'antd'
import BusinessTextArea from './BusinessTextArea.jsx'
import { optionalContactPhoneRule } from '../../utils/contactValidation.mjs'
import {
  DELIVERY_COUNTRY_OPTIONS,
  MAINLAND_DELIVERY_REGIONS,
  deliveryAddressRule,
  deliveryRegionPrefix,
  isMainlandDeliveryCountry,
  joinDeliveryAddress,
  splitDeliveryAddress,
} from '../../utils/deliveryAddress.mjs'
import './delivery-address.css'

function DeliveryAddressInput({ value = '', onChange, country, disabled, id }) {
  const text = String(value ?? '')
  const [draft, setDraft] = useState(() => ({
    text,
    country,
    ...splitDeliveryAddress(text, country),
  }))
  // External form replacement (customer/source change, reset, reopening) must
  // replace the draft; our own keystrokes must not be parsed while typing.
  if (draft.text !== text || draft.country !== country) {
    setDraft({ text, country, ...splitDeliveryAddress(text, country) })
  }
  const mainland = isMainlandDeliveryCountry(country)
  const update = (path, detail) => {
    const next = joinDeliveryAddress(path, detail)
    setDraft({ text: next, country, path, detail })
    onChange?.(next)
  }
  const regionID = `${id}-region`

  return (
    <div
      className={`erp-delivery-address${mainland ? ' erp-delivery-address--mainland' : ''}`}
    >
      {mainland ? (
        <Form.Item
          label="所在地区"
          htmlFor={regionID}
          className="erp-delivery-address__part"
        >
          <Cascader
            id={regionID}
            aria-label="所在地区"
            allowClear
            disabled={disabled}
            options={MAINLAND_DELIVERY_REGIONS}
            value={draft.path}
            placeholder="选择省 / 市 / 区县"
            showSearch={{
              filter: (input, path) =>
                path
                  .map(({ label }) => label)
                  .join('')
                  .includes(input.trim()),
              matchInputWidth: true,
            }}
            onChange={(path = []) => update(path, draft.detail)}
          />
        </Form.Item>
      ) : null}
      <Form.Item
        label={mainland && draft.path.length ? '详细地址' : '完整地址'}
        htmlFor={id}
        className="erp-delivery-address__part"
      >
        <BusinessTextArea
          id={id}
          allowClear
          disabled={disabled}
          autoComplete="street-address"
          maxLength={512 - deliveryRegionPrefix(draft.path).length}
          minRows={mainland ? 1 : 3}
          showCount
          value={draft.detail}
          placeholder={
            mainland && draft.path.length
              ? '街道、园区、楼栋、门牌或仓库名称'
              : '可粘贴完整地址，包含街道门牌、城市、州 / 省及邮编（如适用）'
          }
          onChange={(event) => update(draft.path, event.target.value)}
        />
      </Form.Item>
    </div>
  )
}

export default function DeliveryAddressFields({
  form,
  customer = false,
  disabled,
  extra,
}) {
  const countryField = customer ? 'country_region' : 'delivery_country_region'
  const recipientField = customer
    ? 'default_delivery_recipient'
    : 'delivery_recipient'
  const phoneField = customer ? 'default_delivery_phone' : 'delivery_phone'
  const addressField = customer
    ? 'default_delivery_address'
    : 'delivery_address'
  const countries = Form.useWatch(
    (values) => [values.country_region, values.delivery_country_region],
    form
  )
  const country = countries?.[customer ? 0 : 1] || ''
  const options =
    country && !DELIVERY_COUNTRY_OPTIONS.some(({ value }) => value === country)
      ? [
          { value: country, label: country, searchText: country.toLowerCase() },
          ...DELIVERY_COUNTRY_OPTIONS,
        ]
      : DELIVERY_COUNTRY_OPTIONS

  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="收货人"
        name={recipientField}
      >
        <Input
          allowClear
          disabled={disabled}
          autoComplete="off"
          maxLength={128}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="收货电话"
        name={phoneField}
        rules={[optionalContactPhoneRule()]}
      >
        <Input
          allowClear
          disabled={disabled}
          autoComplete="off"
          maxLength={64}
          placeholder="支持手机、座机及国际区号"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="国家 / 地区"
        name={countryField}
      >
        <Select
          allowClear
          showSearch
          disabled={disabled}
          options={options}
          placeholder="搜索国家 / 地区"
          filterOption={(input, option) =>
            option.searchText.includes(input.trim().toLowerCase())
          }
          onChange={(next) => {
            if ((next || '') !== country) {
              form.setFieldsValue({ [addressField]: '' })
            }
          }}
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        name={addressField}
        dependencies={[countryField]}
        rules={[deliveryAddressRule(country)]}
        extra={extra}
      >
        <DeliveryAddressInput country={country} disabled={disabled} />
      </Form.Item>
    </>
  )
}
