import {
  trimOptional,
  normalizeOptionalNonNegativeInteger,
  compactParams,
} from './sourceDocumentValues.mjs'

function buildCustomerSnapshot(customer = {}) {
  if (!customer?.id) {
    return {}
  }
  return compactParams({
    id: customer.id,
    code: trimOptional(customer.code),
    name: trimOptional(customer.name),
    short_name: trimOptional(customer.short_name),
  })
}

function buildDeliverySnapshot(values = {}) {
  return compactParams({
    country_region: trimOptional(values.delivery_country_region),
    recipient: trimOptional(values.delivery_recipient),
    phone: trimOptional(values.delivery_phone),
    address: trimOptional(values.delivery_address),
  })
}

function deliverySnapshotFormValues(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  return {
    delivery_country_region: trimOptional(source.country_region) || '',
    delivery_recipient: trimOptional(source.recipient) || '',
    delivery_phone: trimOptional(source.phone) || '',
    delivery_address: trimOptional(source.address) || '',
  }
}

function buildSalesOrderCustomerSourceValues(customer = {}) {
  if (!customer?.id) {
    return {
      customer_id: undefined,
      customer_snapshot: {},
      ...deliverySnapshotFormValues(),
    }
  }
  const deliveryValues = {
    delivery_country_region: customer.country_region,
    delivery_recipient: customer.default_delivery_recipient,
    delivery_phone: customer.default_delivery_phone,
    delivery_address: customer.default_delivery_address,
  }
  return {
    customer_id: Number(customer.id || 0) || undefined,
    customer_snapshot: buildCustomerSnapshot(customer),
    ...deliverySnapshotFormValues(buildDeliverySnapshot(deliveryValues)),
  }
}

function buildOrderContactSnapshot(values = {}) {
  return compactParams({
    name: trimOptional(values.contact_name),
    phone: trimOptional(values.contact_phone),
    mobile: trimOptional(values.contact_mobile),
    email: trimOptional(values.contact_email),
    title: trimOptional(values.contact_title),
  })
}

const SUPPLIER_CONTACT_OWNER_TYPE = 'SUPPLIER'

function selectPrimaryContact(contacts = []) {
  const activeContacts = (Array.isArray(contacts) ? contacts : []).filter(
    (contact) => contact?.is_active !== false
  )
  return (
    activeContacts.find((contact) => contact?.is_primary === true) ||
    activeContacts[0] ||
    {}
  )
}

function buildSupplierSnapshot(supplier = {}) {
  if (!supplier?.id) {
    return {}
  }
  const primaryContact =
    supplier.primary_contact && typeof supplier.primary_contact === 'object'
      ? supplier.primary_contact
      : {}
  return compactParams({
    id: supplier.id,
    code: trimOptional(supplier.code),
    name: trimOptional(supplier.name),
    short_name: trimOptional(supplier.short_name),
    contact_id: Number(primaryContact.id || 0) || undefined,
    contact_name:
      trimOptional(supplier.contact_name) ||
      trimOptional(supplier.primary_contact_name) ||
      trimOptional(primaryContact.name),
    contact_phone:
      trimOptional(supplier.contact_phone) ||
      trimOptional(supplier.phone) ||
      trimOptional(supplier.primary_contact_phone) ||
      trimOptional(primaryContact.phone),
    contact_mobile:
      trimOptional(supplier.contact_mobile) ||
      trimOptional(supplier.mobile) ||
      trimOptional(supplier.primary_contact_mobile) ||
      trimOptional(primaryContact.mobile),
    address: trimOptional(supplier.address),
  })
}

function buildPurchaseOrderSupplierDefaults(supplier = {}) {
  return {
    payment_term_days: normalizeOptionalNonNegativeInteger(
      supplier.default_payment_term_days
    ),
    payment_method: trimOptional(supplier.default_payment_method) || '',
    invoice_required:
      typeof supplier.default_invoice_required === 'boolean'
        ? supplier.default_invoice_required
        : undefined,
    invoice_category:
      supplier.default_invoice_required === true
        ? trimOptional(supplier.default_invoice_category) || undefined
        : undefined,
  }
}

function buildSupplierSnapshotWithContacts(supplier = {}, contacts = []) {
  const baseSnapshot = buildSupplierSnapshot(supplier)
  if (!baseSnapshot.id) {
    return {}
  }
  const primaryContact = selectPrimaryContact(contacts)
  return compactParams({
    ...baseSnapshot,
    contact_id: Number(primaryContact.id || 0) || baseSnapshot.contact_id,
    contact_name:
      trimOptional(primaryContact.name) || baseSnapshot.contact_name,
    contact_phone:
      trimOptional(primaryContact.phone) || baseSnapshot.contact_phone,
    contact_mobile:
      trimOptional(primaryContact.mobile) || baseSnapshot.contact_mobile,
  })
}

function buildOutsourcingSupplierSnapshot(
  supplier = {},
  contractSnapshot = {}
) {
  const masterSnapshot = buildSupplierSnapshot(supplier)
  const input =
    contractSnapshot && typeof contractSnapshot === 'object'
      ? contractSnapshot
      : {}
  const identity = masterSnapshot.id ? masterSnapshot : input
  const snapshotValue = (key) =>
    Object.prototype.hasOwnProperty.call(input, key)
      ? input[key]
      : masterSnapshot[key]
  const hasContractContactOverride = [
    'contact_id',
    'contact_name',
    'contact_phone',
    'contact_mobile',
  ].some((key) => Object.prototype.hasOwnProperty.call(input, key))
  const contactValue = (key) =>
    hasContractContactOverride ? input[key] : masterSnapshot[key]
  return compactParams({
    id: identity.id,
    code: trimOptional(identity.code),
    name: trimOptional(identity.name),
    short_name: trimOptional(identity.short_name),
    contact_id: Number(contactValue('contact_id') || 0) || undefined,
    contact_name: trimOptional(contactValue('contact_name')),
    contact_phone: trimOptional(contactValue('contact_phone')),
    contact_mobile: trimOptional(contactValue('contact_mobile')),
    address: trimOptional(snapshotValue('address')),
    signer_name: trimOptional(snapshotValue('signer_name')),
  })
}

function buildContractPartySnapshot(values = {}) {
  return compactParams({
    buyerCompany: trimOptional(values.buyerCompany),
    buyerContact: trimOptional(values.buyerContact),
    buyerPhone: trimOptional(values.buyerPhone),
    buyerAddress: trimOptional(values.buyerAddress),
    buyerSigner: trimOptional(values.buyerSigner),
  })
}

function contractPartySnapshotFromPrintTemplateDefaults(
  printTemplateDefaults = {},
  templateKey = ''
) {
  const directDefaults =
    printTemplateDefaults?.[templateKey] ||
    printTemplateDefaults?.materialPurchaseContract ||
    printTemplateDefaults?.processingContract ||
    null
  const templateDefaults = Array.isArray(printTemplateDefaults?.templates)
    ? printTemplateDefaults.templates.find(
        (item) => item?.template_key === templateKey
      )
    : null
  return buildContractPartySnapshot(
    directDefaults?.partyDefaults ||
      directDefaults?.party_defaults ||
      templateDefaults?.party_defaults ||
      {}
  )
}

export {
  buildDeliverySnapshot,
  buildOrderContactSnapshot,
  buildContractPartySnapshot,
  contractPartySnapshotFromPrintTemplateDefaults,
  buildCustomerSnapshot,
  deliverySnapshotFormValues,
  buildSalesOrderCustomerSourceValues,
  SUPPLIER_CONTACT_OWNER_TYPE,
  buildSupplierSnapshot,
  buildPurchaseOrderSupplierDefaults,
  buildSupplierSnapshotWithContacts,
  buildOutsourcingSupplierSnapshot,
}
