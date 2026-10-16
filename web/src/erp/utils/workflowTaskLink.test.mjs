import test from 'node:test'
import assert from 'node:assert/strict'
import { ENTRY_TARGET, getEntryConfig } from '../config/entryConfig.mjs'
import { isWorkflowTaskLinkPath, singleTaskLinkAction, taskLinkID, workflowTaskLinkDestination, workflowTaskLinkPath } from './workflowTaskLink.mjs'
import { resolveAdminPostLoginPath } from '../../pages/AdminLogin/adminLoginRouting.mjs'

test('task links carry a bounded task identity and never a redirect or role grant', () => {
  for (const id of ['', '0', '-1', '1.2', '1e3', '01', ' 1', '9007199254740992', '../1']) assert.equal(taskLinkID(id), null)
  assert.equal(workflowTaskLinkPath(41), '/task-link/41')
  for (const path of ['https://evil/task-link/41', '//evil/task-link/41', '/task-link/41?role=boss', '/task-link/41#anything']) assert.equal(isWorkflowTaskLinkPath(path), false)
})

test('the same shared link resumes after login and chooses the recipients available device entry', () => {
  const profile = { id: 7, is_super_admin: true }
  const config = getEntryConfig()
  for (const entryTarget of Object.values(ENTRY_TARGET)) {
    assert.equal(resolveAdminPostLoginPath({ adminProfile: profile, entryConfig: config, entryTarget, redirectTo: '/task-link/41', shouldRemember: false }), '/task-link/41')
  }
  assert.equal(workflowTaskLinkDestination(41, profile, config, ENTRY_TARGET.DESKTOP), '/erp/task-board?link_task=41')
  assert.match(workflowTaskLinkDestination(41, profile, config, ENTRY_TARGET.MOBILE_TASKS), /^\/m\/[^/]+\/tasks\?link_task=41$/u)
  assert.equal(workflowTaskLinkDestination(41, { id: 8, permissions: [], menus: [] }, config, ENTRY_TARGET.DESKTOP), '')
  assert.equal(workflowTaskLinkDestination(41, { id: 8, permissions: [], menus: ['/erp/dashboard'] }, config, ENTRY_TARGET.DESKTOP), '')
  assert.equal(workflowTaskLinkDestination(41, { id: 8, permissions: ['mobile.engineering.access'], menus: ['/erp/dashboard'] }, config, ENTRY_TARGET.DESKTOP), '/m/engineering/tasks?link_task=41')
  assert.equal(workflowTaskLinkDestination(41, profile, { ...config, desktop: false, mobileTasks: false }, ENTRY_TARGET.DESKTOP), '')
})

test('only one current authorized task can auto-open; incomplete, ended and multiple candidates remain on the chain', () => {
  const own = { id: 2, task_status_key: 'ready', can_handle: true }
  const old = { id: 1, task_status_key: 'done', can_handle: false }
  const other = { id: 3, task_status_key: 'ready', can_handle: false }
  assert.equal(singleTaskLinkAction({ items: [old, own, other], truncated: false }), own)
  assert.equal(singleTaskLinkAction({ items: [own], truncated: true }), null)
  assert.equal(singleTaskLinkAction({ items: [old, other], truncated: false }), null)
  assert.equal(singleTaskLinkAction({ items: [own, { ...own, id: 4 }], truncated: false }), null)
  assert.equal(singleTaskLinkAction({ items: [{ ...own, task_status_key: 'withdrawn' }], truncated: false }), null)
})

test('expired sessions resume the shared task even when the next account has a different mobile role', () => {
  for (const redirectTo of ['/m/warehouse/tasks?link_task=41', '/erp/task-board?link_task=41']) {
    assert.equal(resolveAdminPostLoginPath({ adminProfile: { id: 8 }, entryConfig: getEntryConfig(), entryTarget: ENTRY_TARGET.MOBILE_TASKS, fromMobileRoleKey: 'warehouse', redirectTo, shouldRemember: false }), '/task-link/41')
  }
})
