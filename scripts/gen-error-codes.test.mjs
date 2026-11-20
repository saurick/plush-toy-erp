import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { loadDefinitions, parseCliArgs } from './gen-error-codes.mjs'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const scriptPath = path.join(repoRoot, 'scripts/gen-error-codes.mjs')
const generatedPath = path.join(
  repoRoot,
  'web/src/common/consts/errorCodes.generated.js',
)

function catalog(declarations, registry) {
  return `package sample

type Definition struct {
  Name string
  Code int32
  Message string
}

${declarations}

var definitions = []Definition{${registry}}
`
}

test('gen-error-codes rejects unknown and conflicting CLI arguments', () => {
  assert.throws(() => parseCliArgs(['--bogus']), /未知参数：--bogus/)
  assert.throws(
    () => parseCliArgs(['--check', '--stdout']),
    /不能同时使用/,
  )
})

test('gen-error-codes parses valid Go declarations and registry order', () => {
  const source = catalog(`var (
  Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}
  Bar Definition = Definition{Name: "Bar", Code: 40002, Message: "bar"}
); var Baz = Definition{Name: "Baz", Code: 40003, Message: "baz"}`, 'Bar, Foo, Baz')
  assert.deepEqual(loadDefinitions(source), [
    { ident: 'Bar', key: 'BAR', code: 40002 },
    { ident: 'Foo', key: 'FOO', code: 40001 },
    { ident: 'Baz', key: 'BAZ', code: 40003 },
  ])
})

test('gen-error-codes ignores comment and raw-string lookalikes', () => {
  const source = catalog(`// Ghost = Definition{Name: "Ghost", Code: 49998, Message: "ghost"}
/* Shadow = Definition{Name: "Shadow", Code: 49997, Message: "shadow"} */
var note = \`Phantom = Definition{Name: "Phantom", Code: 49996, Message: "phantom"}\`
var Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}`, 'Foo')
  assert.deepEqual(loadDefinitions(source), [
    { ident: 'Foo', key: 'FOO', code: 40001 },
  ])
})

test('gen-error-codes rejects incomplete declarations and registry drift', () => {
  assert.throws(
    () => loadDefinitions(catalog(
      'var Foo = Definition{Name: "Foo", Code: 40001}',
      'Foo',
    )),
    /must contain exactly Name, Code, and Message/,
  )
  assert.throws(
    () => loadDefinitions(catalog(
      'var Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}\nvar Alias = Foo',
      'Foo, Alias',
    )),
    /registry and Definition declarations differ/,
  )
  assert.throws(
    () => loadDefinitions(catalog(
      'var Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}\nvar Bar = Definition{Name: "Bar", Code: 40002, Message: "bar"}',
      'Foo, Foo',
    )),
    /repeats identifier/,
  )
  for (const arrayType of ['[1]Definition', '[...]Definition']) {
    const source = catalog(
      'var Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}',
      'Foo',
    ).replace('[]Definition', arrayType)
    assert.throws(
      () => loadDefinitions(source),
      /registry must be a \[\]Definition composite literal/,
    )
  }
})

test('gen-error-codes rejects duplicate codes and frontend keys', () => {
  assert.throws(
    () => loadDefinitions(catalog(`var (
  Foo = Definition{Name: "Foo", Code: 40001, Message: "foo"}
  Bar = Definition{Name: "Bar", Code: 40001, Message: "bar"}
)`, 'Foo, Bar')),
    /重复 code：40001/,
  )
  assert.throws(
    () => loadDefinitions(catalog(`var (
  HTTPFoo = Definition{Name: "HTTPFoo", Code: 40001, Message: "foo"}
  HttpFoo = Definition{Name: "HttpFoo", Code: 40002, Message: "bar"}
)`, 'HTTPFoo, HttpFoo')),
    /重复 frontend key：HTTP_FOO/,
  )
})

test('gen-error-codes unknown CLI argument is no-write', () => {
  const before = fs.readFileSync(generatedPath)
  const result = spawnSync(process.execPath, [scriptPath, '--bogus'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /未知参数：--bogus/)
  assert.deepEqual(fs.readFileSync(generatedPath), before)
})
