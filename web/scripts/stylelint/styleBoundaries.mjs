import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selectorParser from 'postcss-selector-parser'
import stylelint from 'stylelint'

const ruleName = 'erp/style-boundaries'
const messages = stylelint.utils.ruleMessages(ruleName, {
  scope: (selector) => `模块选择器缺少自身作用域: ${selector}`,
  repeated: (name) => `不要重复 .${name} 提高优先级；应消除竞争规则`,
  focus: '输入控件的焦点边框、阴影和 outline 由 control-focus.css 维护',
  radius:
    'AntD 输入控件圆角由 control-foundation.css 维护；组合接缝通过 --erp-control-radius 表达',
  page: '模块打印必须使用命名 @page，避免修改其他页面的纸张设置',
})

// 这些文件维护应用级基线；业务页面和按需加载的组件不进入此列表。
const sharedFiles = new Set([
  'src/erp/styles/app/control-foundation.css',
  'src/erp/styles/app/business-control-rhythm.css',
  'src/erp/styles/app/control-focus.css',
  'src/erp/styles/app/theme-overrides.css',
  'src/erp/styles/app/tabs-motion.css',
  'src/erp/styles/app/print-responsive.css',
])
const focusFile = 'src/erp/styles/app/control-focus.css'
const controlClass =
  /^ant-(?:input(?:-|$)|select(?:-|$)|picker(?:-|$)|checkbox-inner$)/u
const focusPaint =
  /^(?:border(?:-.+)?|box-shadow|outline(?:-.+)?|--tw-ring.*)$/u
const outerControlClass =
  /^ant-(?:input|input-affix-wrapper|input-number|input-number-affix-wrapper|select-selector|picker)$/u

function targetsOuterControl(selector) {
  const lastCompound = selector.nodes.slice(
    selector.nodes.findLastIndex((node) => node.type === 'combinator') + 1
  )
  return lastCompound.some(
    (node) =>
      (node.type === 'class' && outerControlClass.test(node.value)) ||
      (node.type === 'pseudo' &&
        [':is', ':where'].includes(node.value) &&
        node.nodes.some(targetsOuterControl))
  )
}

function hasScope(selector) {
  return selector.nodes.some((node) => {
    if (node.type === 'class') {
      return !/^(?:ant-|anticon$|rc-|form-|is-|has-)/u.test(node.value)
    }
    if (node.type === 'attribute') {
      return (
        node.attribute.startsWith('data-') &&
        node.attribute !== 'data-erp-theme'
      )
    }
    // :not(.page) does not scope a rule to .page. Every alternative must be scoped.
    return (
      node.type === 'pseudo' &&
      [':is', ':where', ':has'].includes(node.value) &&
      node.nodes.length > 0 &&
      node.nodes.every(hasScope)
    )
  })
}

const rule = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, ruleName, { actual: enabled })) {
    return
  }
  const filename = root.source?.input.file || ''
  const relative = path
    .relative(fileURLToPath(new URL('../../', import.meta.url)), filename)
    .split(path.sep)
    .join('/')
  const shared = sharedFiles.has(relative)
  const report = (node, message) =>
    stylelint.utils.report({ ruleName, result, node, message })

  root.walkAtRules('page', (node) => {
    if (!shared && (!node.params || node.params.startsWith(':'))) {
      report(node, messages.page)
    }
  })
  root.walkRules((node) => {
    if (
      node.parent.type === 'atrule' &&
      node.parent.name.endsWith('keyframes')
    ) {
      return
    }
    const selectors = selectorParser().astSync(node.selector)
    if (
      relative !== 'src/erp/styles/app/control-foundation.css' &&
      selectors.nodes.some(targetsOuterControl)
    ) {
      node.walkDecls(/^border-.*radius$/u, (decl) =>
        report(decl, messages.radius)
      )
    }
    for (const selector of selectors.nodes) {
      if (!shared && !hasScope(selector)) {
        report(node, messages.scope(selector.toString().trim()))
      }
    }
    selectors.walk((selector) => {
      if (selector.type !== 'selector') return
      const seen = new Set()
      for (const part of selector.nodes) {
        if (part.type === 'combinator') seen.clear()
        if (part.type !== 'class') continue
        if (seen.has(part.value)) report(node, messages.repeated(part.value))
        seen.add(part.value)
      }
    })
    if (relative === focusFile) return
    let hasControl = false
    let hasFocus = false
    selectors.walkClasses((part) => {
      if (controlClass.test(part.value)) hasControl = true
      if (/^ant-.*-(?:focused|open)$/u.test(part.value)) hasFocus = true
    })
    selectors.walkPseudos((part) => {
      if ([':focus', ':focus-within', ':focus-visible'].includes(part.value)) {
        hasFocus = true
      }
    })
    if (hasControl && hasFocus) {
      node.walkDecls((decl) => {
        if (focusPaint.test(decl.prop)) report(decl, messages.focus)
      })
    }
  })
}
rule.ruleName = ruleName
rule.messages = messages
export default stylelint.createPlugin(ruleName, rule)
