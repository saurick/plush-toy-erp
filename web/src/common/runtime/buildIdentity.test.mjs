import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildIdentitySupportText,
  compareBuildIdentities,
  parseServerBuildIdentity,
  readEmbeddedBuildIdentity,
} from './buildIdentity.mjs'

const gitSHA = '20c96d3819429361a35d2551b63b211f055de37e'
const releaseVersion = 'yoyoosun-20260810.1'

test('formal Web and server identities match on version and exact SHA', () => {
  const web = readEmbeddedBuildIdentity({
    VITE_RELEASE_VERSION: releaseVersion,
    VITE_GIT_SHA: gitSHA.toUpperCase(),
  })
  const server = parseServerBuildIdentity({
    data: {
      release_version: releaseVersion,
      git_sha: gitSHA,
    },
  })
  const status = compareBuildIdentities({ web, server })

  assert.equal(web.gitSHAShort, '20c96d38')
  assert.equal(status.key, 'matched')
  assert.equal(status.systemVersion, releaseVersion)
  assert.match(
    buildIdentitySupportText({ web, server, status }),
    new RegExp(gitSHA, 'u')
  )
})

test('a different server build is reported as a mismatch', () => {
  const web = readEmbeddedBuildIdentity({
    VITE_RELEASE_VERSION: releaseVersion,
    VITE_GIT_SHA: gitSHA,
  })
  const server = parseServerBuildIdentity({
    data: {
      version: releaseVersion,
      git_sha: '31c96d3819429361a35d2551b63b211f055de37e',
    },
  })
  assert.equal(compareBuildIdentities({ web, server }).key, 'mismatch')
})

test('development and unavailable states do not invent formal release evidence', () => {
  const web = readEmbeddedBuildIdentity({ DEV: true })
  assert.equal(web.local, true)
  assert.equal(
    compareBuildIdentities({
      web,
      server: parseServerBuildIdentity({ data: { version: 'local' } }),
    }).key,
    'local'
  )
  assert.equal(
    compareBuildIdentities({ web, unavailable: true }).key,
    'unavailable'
  )
})

test('unsafe or incomplete values are discarded', () => {
  const web = readEmbeddedBuildIdentity({
    VITE_RELEASE_VERSION: '<script>',
    VITE_GIT_SHA: 'not-a-sha',
  })
  const server = parseServerBuildIdentity({
    data: { release_version: 'release with spaces', git_sha: gitSHA },
  })
  assert.equal(web.releaseVersion, '')
  assert.equal(web.gitSHA, '')
  assert.equal(compareBuildIdentities({ web, server }).key, 'incomplete')
})
