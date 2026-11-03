import { createContext, useContext } from 'react'

export const BusinessSplitContext = createContext(null)

export function useBusinessSplit() {
  return useContext(BusinessSplitContext)
}
