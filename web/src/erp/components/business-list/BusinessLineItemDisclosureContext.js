import { createContext, useContext } from 'react'
import { Form } from 'antd'

export const BusinessLineItemDisclosureContext = createContext(null)

export function useBusinessLineItemDisclosure() {
  const disclosure = useContext(BusinessLineItemDisclosureContext)
  const form = Form.useFormInstance()
  return disclosure?.form === form ? disclosure : null
}
