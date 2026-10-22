import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { RpcError } from '../../web/src/common/utils/rpcError.js'
import { JsonRpc } from '../../web/src/common/utils/jsonRpc.js'
import { getActionErrorMessage } from '../../web/src/common/utils/errorMessage.js'
import { isAuthFailureCode } from '../../web/src/common/consts/errorCodes.js'

test('actual Go errors retain business guidance through the RPC envelope and frontend presentation', async (t) => {
  const run = spawnSync('go', [
    'test', '-json', '-count=1', '-p=2', './internal/service',
    '-run', '^TestJSONRPCErrorPresentationContract$',
  ], {
    cwd: path.resolve(import.meta.dirname, '../../server'),
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(run.error, undefined)
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  const events = run.stdout.trim().split('\n').map((line) => JSON.parse(line))
  const output = events.map((event) => event.Output || '').join('')
  const marker = output.match(/ERROR_PRESENTATION_CONTRACT:(\[[^\n]+\])/u)
  assert.ok(marker, 'Go mapping test must execute and emit actual responses')
  const samples = JSON.parse(marker[1])
  const guidance = new Map([
    ['inventory version', '库存作业已被其他人处理'],
    ['inventory stale count', '重新盘点'],
    ['inventory self approval', '另一位有权人员审批'],
    ['process self approval', '另一位有权人员审批'],
    ['task self approval', '另一位有权人员审批'],
    ['image referenced', '不能替换或清空'],
    ['attachment withdrawn', '附件已撤销'],
    ['finance duplicate', '已生成同类型的有效财务记录'],
    ['finance prerequisite', '缺少有效业务来源'],
    ['reconciliation prerequisite', '请确认已过账且往来方和金额完整'],
    ['WIP count mismatch', '请先与业务及加工厂核对'],
    ['quality duplicate', '已存在未取消的质检单'],
    ['purchase duplicate', '已生成未取消的采购退货单'],
    ['material duplicate', '请选择已有物料'],
    ['task version', '任务已被其他人更新'],
    ['task settled', '不能再次变更状态'],
    ['task missing', '任务不存在'],
    ['material request changed', '订单、材料或审批资料已变化'],
    ['material request missing', '用料审批不存在'],
    ['material review order', '当前审批条件不满足'],
    ['material rejection reason', '请填写退回原因'],
    ['sales state', '销售订单当前状态不允许'],
    ['purchase state', '采购订单当前状态不允许'],
    ['outsourcing state', '委外合同当前状态不允许'],
    ['process source state', '单据当前状态不允许'],
    ['sales missing', '销售订单不存在'],
    ['customer missing', '客户不存在'],
    ['customer inactive', '客户已停用'],
    ['stock shortage', '库存不足'],
    ['shipment prerequisite', '财务审批尚未通过'],
    ['idempotency', '重复请求内容与首次提交不一致'],
    ['input invalid', '请检查填写内容后重试'],
    ['quantity precision', '整数数量'],
    ['sales readiness', '税率'],
    ['config changed', '当前激活版本已变化'],
    ['config blocked', '先查看切换检查结果'],
    ['config module disabled', '所需功能尚未开启'],
    ['config module read only', '当前功能仅可查看'],
    ['task module disabled', '所需功能尚未开启'],
    ['task module read only', '当前功能仅可查看'],
    ['process missing', '流程或办理步骤不存在'],
    ['process handler missing', '请联系管理员'],
    ['login rejected', '登录信息不正确或账号不可用'],
    ['SMS unavailable', '暂时无法发送验证码'],
    ['unknown failure', '办理失败，请稍后重试'],
  ])
  assert.deepEqual(new Set(samples.map(({ name }) => name)), new Set(guidance.keys()))
  let response
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Response(
    JSON.stringify({ ...response, id: JSON.parse(options.body).id }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'contract-request' } },
  ))
  const rpc = new JsonRpc({ url: 'contract', withAuth: false })
  for (const { name, reply } of samples) {
    response = reply
    await assert.rejects(rpc.call('execute'), (error) => {
      assert.ok(error instanceof RpcError)
      assert.equal(error.code, reply.result.code)
      const message = getActionErrorMessage(error, '办理')
      assert.ok(message.includes(guidance.get(name)), `${name}: ${message}`)
      assert.doesNotMatch(message, /private|password|数据库|\/srv\//u)
      assert.equal(error.requestId, 'contract-request')
      assert.equal(isAuthFailureCode(error.code), false, `${name} must preserve the session`)
      return true
    })
  }
})
