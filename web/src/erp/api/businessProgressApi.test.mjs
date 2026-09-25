import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import * as contract from '../utils/businessProgress.mjs'
import { progressFixtureData } from '../../../scripts/style-l1/businessProgressFixtures.mjs'

async function load(call) {
  globalThis.__progressApiContract = contract
  globalThis.__progressApiCall = call
  const source = readFileSync(
    new URL('./businessProgressApi.mjs', import.meta.url),
    'utf8'
  )
    .replace(
      "import { AUTH_SCOPE } from '@/common/auth/auth'",
      "const AUTH_SCOPE={ADMIN:'admin'}"
    )
    .replace(
      "import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'",
      "const ADMIN_BASE_PATH='/admin'"
    )
    .replace(
      "import { JsonRpc } from '@/common/utils/jsonRpc'",
      'class JsonRpc { call(...args) { return globalThis.__progressApiCall(...args) } }'
    )
    .replace(
      /import \{[\s\S]*?\} from '\.\.\/utils\/businessProgress\.mjs'/u,
      'const {requireProgressBoard,requireProgressDetail}=globalThis.__progressApiContract'
    )
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`
  )
}
test('progress API forwards cancellation and filters to authoritative list/detail reads', async () => {
  const calls = []
  const api = await load(async (method, params, options) => {
    calls.push({ method, params, options })
    return {
      data: progressFixtureData(params, { detail: method === 'get_progress' }),
    }
  })
  const { signal } = new AbortController()
  await api.listBusinessProgress({ view: 'production', offset: 20 }, { signal })
  await api.getBusinessProgress({ view: 'orders', id: 3 }, { signal })
  assert.deepEqual(calls, [
    {
      method: 'list_progress',
      params: { view: 'production', offset: 20 },
      options: { signal },
    },
    {
      method: 'get_progress',
      params: { view: 'orders', id: 3 },
      options: { signal },
    },
  ])
})
test('progress API never turns failure or incomplete envelopes into empty results', async () => {
  let api = await load(async () => ({ data: { rows: [] } }))
  await assert.rejects(api.listBusinessProgress(), /进度数据暂不可用/)
  const failure = new Error('network unavailable')
  api = await load(async () => {
    throw failure
  })
  await assert.rejects(
    api.getBusinessProgress({ id: 1 }),
    (error) => error === failure
  )
})
