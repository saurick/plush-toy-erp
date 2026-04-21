import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import MobileAppLayout from './MobileAppLayout'
import MobileRoleGuidePage from './pages/MobileRoleGuidePage'
import MobileRoleHomePage from './pages/MobileRoleHomePage'
import MobileRoleTasksPage from './pages/MobileRoleTasksPage'

export default function MobileRoleRouter() {
  return (
    <Routes>
      <Route path="/" element={<MobileAppLayout />}>
        <Route index element={<MobileRoleHomePage />} />
        <Route path="tasks" element={<MobileRoleTasksPage />} />
        <Route path="guide" element={<MobileRoleGuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
