import fs from 'node:fs'
import path from 'node:path'
import {
  parseOpenAIYaml,
  parseSkillFrontmatter,
  validateSkillRoot,
} from '../../scripts/qa/skill-health.mjs'
import {
  markdownLinkTargets,
  resolveLocalMarkdownLink,
  stripFencedCode,
} from '../../scripts/qa/lib/markdown-links.mjs'
import { DEV_PROJECT_SKILLS_API } from '../src/dev-workbench/config/devProjectSkills.mjs'
import {
  isDevWorkbenchRequest,
  isSameOriginRequest,
} from './devServerSecurity.mjs'

const SKILLS_ROOT = '.agents/skills'

export function readProjectSkills(projectRoot) {
  const root = path.resolve(projectRoot)
  const validation = validateSkillRoot(root)
  const errors = validation.errors.map((error) =>
    error.replaceAll(`${root}/`, '')
  )
  const read = (file) =>
    fs.existsSync(path.join(root, file))
      ? fs.readFileSync(path.join(root, file), 'utf8')
      : ''
  const index = read(`${SKILLS_ROOT}/README.md`)
  const skills = validation.skills.map((name) => {
    const sourcePath = `${SKILLS_ROOT}/${name}/SKILL.md`
    const metadataPath = `${SKILLS_ROOT}/${name}/agents/openai.yaml`
    const source = read(sourcePath)
    let frontmatter = {}
    let metadata = {}
    // Invalid entries stay visible with the validator's original diagnostics.
    try {
      frontmatter = parseSkillFrontmatter(source, sourcePath)
    } catch {
      /* Reported by validator. */
    }
    try {
      metadata = parseOpenAIYaml(read(metadataPath), metadataPath)
    } catch {
      /* Reported by validator. */
    }
    const instructions = stripFencedCode(
      source.replace(/^---\r?\n[\s\S]*?\r?\n---/u, '')
    )
    const relatedSkills = [
      ...new Set(
        [...instructions.matchAll(/\$(plush-[a-z0-9-]+)/gu)]
          .map((match) => match[1])
          .filter(
            (target) => target !== name && validation.skills.includes(target)
          )
      ),
    ]
    const references = [...new Set(markdownLinkTargets(instructions))].flatMap(
      (target) => {
        const resolved = resolveLocalMarkdownLink({
          rootDir: root,
          sourceFile: sourcePath,
          rawTarget: target,
        })
        if (!resolved) return []
        const relative = path.relative(root, resolved).split(path.sep).join('/')
        if (
          relative.startsWith('../') ||
          path.isAbsolute(relative) ||
          !relative.endsWith('.md')
        ) {
          return []
        }
        const rawFragment = target.split('#').slice(1).join('#')
        let headingId = rawFragment
        try {
          headingId = decodeURIComponent(rawFragment)
        } catch {
          /* Preserve malformed fragments for inspection. */
        }
        return [{ path: relative, headingId }]
      }
    )
    const indexRow = index
      .split(/\r?\n/u)
      .find((line) => line.includes(`\`$${name}\``))
    const scope =
      indexRow?.split('|')[2]?.trim() || frontmatter.description || ''
    return {
      name,
      title: (frontmatter.description || name)
        .split(/[。，；]/u)[0]
        .replace(/（plush-toy-erp）|\s*\(plush-toy-erp\)/gu, '')
        .replace(/^项目/u, ''),
      scope,
      summary: metadata.short_description || '',
      sourcePath,
      references,
      relatedSkills,
      issues: errors.filter((error) =>
        error.includes(`${SKILLS_ROOT}/${name}/`)
      ),
    }
  })
  return {
    source: SKILLS_ROOT,
    checkedAt: new Date().toISOString(),
    health: { status: errors.length ? 'failed' : 'ok', errors },
    skills,
  }
}

export function createDevProjectSkillsPlugin({
  projectRoot,
  readSnapshot = () => readProjectSkills(projectRoot),
} = {}) {
  return {
    name: 'plush-dev-project-skills',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost')
        if (url.pathname !== DEV_PROJECT_SKILLS_API) return next()
        const reply = (status, value) => {
          response.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          })
          response.end(JSON.stringify(value))
        }
        if (
          !isDevWorkbenchRequest(request) ||
          (request.headers.origin && !isSameOriginRequest(request)) ||
          (request.headers['sec-fetch-site'] &&
            !['same-origin', 'none'].includes(
              request.headers['sec-fetch-site']
            ))
        ) {
          return reply(403, {
            message: '请从受控的开发工作台入口查看项目 Skill',
          })
        }
        if (request.method !== 'GET') {
          response.setHeader('allow', 'GET')
          return reply(405, { message: '项目 Skill 仅支持读取' })
        }
        if (
          url.search ||
          request.headers['transfer-encoding'] ||
          (request.headers['content-length'] &&
            request.headers['content-length'] !== '0')
        ) {
          return reply(400, {
            message: '项目 Skill 查询不接受路径、命令或目标参数',
          })
        }
        try {
          return reply(200, await readSnapshot())
        } catch {
          return reply(503, {
            message: '项目 Skill 暂时无法读取，请检查工作区文件后重试',
          })
        }
      })
    },
  }
}
