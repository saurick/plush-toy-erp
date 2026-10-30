import React, { useEffect, useMemo, useState } from 'react'
import { BusinessFormSectionContext } from './BusinessFormSectionContext.js'

export default function BusinessFormSectionScope({ open, loading, disabled, children }) {
  const [activeSectionID, setActiveSectionID] = useState('')
  useEffect(() => {
    if (!open) setActiveSectionID('')
  }, [open])
  const value = useMemo(() => ({
    activeSectionID: open && !loading ? activeSectionID : '',
    activateSection: open && !loading && !disabled ? setActiveSectionID : null,
  }), [activeSectionID, disabled, loading, open])
  return <BusinessFormSectionContext.Provider value={value}>{children}</BusinessFormSectionContext.Provider>
}
