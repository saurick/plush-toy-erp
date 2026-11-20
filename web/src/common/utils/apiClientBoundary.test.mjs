import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const webRoot = path.resolve(import.meta.dirname, '../../..')

test('api client boundary: 前端运行时只保留 JSON-RPC 请求主路径', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8')
  )
  const removedLegacyFiles = [
    'src/common/utils/request.js',
    'src/common/utils/setData.js',
    'src/common/consts/http.js',
    'src/common/stores/crypto.js',
  ]

  for (const file of removedLegacyFiles) {
    assert.equal(
      fs.existsSync(path.join(webRoot, file)),
      false,
      `${file} 不应继续作为旧请求栈残留保留`
    )
  }

  for (const dependency of ['axios', 'crypto-js', 'qs', 'react-cookies']) {
    assert.equal(
      Object.hasOwn(packageJson.dependencies || {}, dependency),
      false,
      `前端运行时请求主路径已是 JsonRpc + fetch，不应继续依赖 ${dependency}`
    )
  }
})
