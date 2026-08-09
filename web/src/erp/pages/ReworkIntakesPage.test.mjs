import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./ReworkIntakesPage.jsx', import.meta.url),
  'utf8'
)

test('rework intake create and edit share one field tree with DRAFT-only action', () => {
  const draftEditor = source.match(
    /<BusinessFormModal\s+title=\{editingDraft\?\.id[\s\S]*?<\/BusinessFormModal>/u
  )?.[0]
  assert.ok(draftEditor, '应有创建和编辑共用的返工回厂草稿弹窗')
  assert.match(
    source,
    /hasActionPermission\(adminProfile, 'rework_intake\.update'\)/u
  )
  assert.match(source, /data-business-action-key="rework-intake-edit"/u)
  assert.match(source, /selected\?\.status !== 'DRAFT'/u)
  assert.match(
    source,
    /title=\{editingDraft\?\.id \? '编辑返工回厂草稿' : '新建返工回厂'\}/u
  )
  assert.equal(
    (draftEditor.match(/<Form\.List name="items">/gu) || []).length,
    1
  )
})

test('rework intake edit fails closed until detail and source candidates load', () => {
  const openEdit = source.match(
    /const openEdit = useCallback\(([\s\S]*?)\n {2}const closeDraftEditor/u
  )?.[1]
  assert.ok(openEdit, '应有独立的返工草稿加载入口')
  assert.match(openEdit, /await getReworkIntake\(\{ id: record\.id \}\)/u)
  assert.match(
    openEdit,
    /await listAllReworkIntakeSourceCandidates\(\{\s*rework_intake_id: latest\.id,/u
  )
  assert.match(openEdit, /latest\.status !== 'DRAFT'/u)
  assert.match(openEdit, /latest\.items\.length === 0/u)
  assert.match(openEdit, /editableItems\.some\(\(item\) => !item\)/u)
  assert.match(
    openEdit,
    /setEditingDraft\(latest\)[\s\S]*setCreateOpen\(true\)/u
  )
  assert.doesNotMatch(openEdit, /setCreateOpen\(true\)[\s\S]*getReworkIntake/u)
})

test('rework intake draft save uses optimistic CAS without replacing create idempotency', () => {
  const submitDraft = source.match(
    /const submitCreate = useCallback\(([\s\S]*?)\n {2}const runReceive/u
  )?.[1]
  assert.ok(submitDraft, '应有创建和编辑共用的提交入口')
  assert.match(submitDraft, /saveReworkIntakeDraft/u)
  assert.match(submitDraft, /id: editingDraft\.id/u)
  assert.match(submitDraft, /expected_version: editingDraft\.version/u)
  assert.match(
    submitDraft,
    /idempotency_key: buildIdempotencyKey\('rework-intake'\)/u
  )
  assert.doesNotMatch(
    submitDraft.match(/saveReworkIntakeDraft\(\{([\s\S]*?)\}\)/u)?.[1] || '',
    /idempotency_key/u
  )
})

test('rework intake forms preserve programmatic defaults while fields mount', () => {
  assert.doesNotMatch(source, /preserve=\{false\}/u)

  const openCreate = source.match(
    /const openCreate = useCallback\((.*?)\n {2}const openEdit/su
  )?.[1]
  assert.ok(openCreate, '应有返工回厂新建表单初始化入口')
  assert.match(
    openCreate,
    /createForm\.resetFields\(\)[\s\S]*createForm\.setFieldsValue\(/u
  )

  const closeDraftEditor = source.match(
    /const closeDraftEditor = useCallback\((.*?)\n {2}const watchedCandidateIDs/su
  )?.[1]
  assert.ok(closeDraftEditor, '应有返工回厂草稿表单关闭入口')
  assert.match(closeDraftEditor, /createForm\.resetFields\(\)/u)

  const openRework = source.match(
    /const openRework = useCallback\((.*?)\n {2}const submitRework/su
  )?.[1]
  assert.ok(openRework, '应有生产返工表单初始化入口')
  assert.match(
    openRework,
    /reworkForm\.setFieldsValue\([\s\S]*setReworkOpen\(true\)/u
  )

  const openReship = source.match(
    /const openReship = useCallback\((.*?)\n {2}const submitReship/su
  )?.[1]
  assert.ok(openReship, '应有补发表单初始化入口')
  assert.match(
    openReship,
    /reshipForm\.setFieldsValue\([\s\S]*setReshipOpen\(true\)/u
  )
})
