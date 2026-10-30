import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selectorParser from 'postcss-selector-parser'
import stylelint from 'stylelint'
import postcss from 'postcss'

const ruleName = 'erp/style-boundaries'
const messages = stylelint.utils.ruleMessages(ruleName, {
  scope: (selector) => `模块选择器缺少自身作用域: ${selector}`,
  repeated: (name) => `不要重复 .${name} 提高优先级；应消除竞争规则`,
  focus: '输入控件的焦点边框、阴影和 outline 由 control-focus.css 维护',
  radius:
    'AntD 输入控件圆角由 control-foundation.css 维护；组合接缝通过 --erp-control-radius 表达',
  geometry:
    '输入控件的高度、内层行高与纵向 padding 由 business-control-rhythm.css 维护；模块只定义布局或尺寸变量',
  selectedText:
    '单选值的裁剪与换行由 control-foundation.css 维护；选项浮层与多选标签独立处理',
  singleLine: '单选值必须保持单行省略；完整名称通过标题或展开选项读取',
  page: '模块打印必须使用命名 @page，避免修改其他页面的纸张设置',
  controls:
    'Tab、筛选与移动搜索的外观由 control-affordance.css 维护；页面只定义布局和尺寸',
  thickSelection:
    '内容页签统一使用共享的 2px 指示线；页面与筛选不得自行覆盖指示线',
  sideAccent:
    '页面强调使用浅底色、细边框或步骤标记，不使用粗单侧色条；岗位与状态须有文字',
})

function pixels(value) {
  const match = String(value).match(/^(-?\d*\.?\d+)(px|pt|rem|em)?$/u)
  if (!match) return null
  return Number(match[1]) * ({ pt: 4 / 3, rem: 16, em: 16 }[match[2]] || 1)
}

function hasThickSideAccent(decl) {
  if (/^border-(?:left|right|inline-start|inline-end)(?:-width)?$/u.test(decl.prop)) {
    return postcss.list.space(decl.value).some((value) => pixels(value) >= 3)
  }
  if (!/shadow$/u.test(decl.prop)) return false
  return postcss.list.comma(decl.value).some((shadow) => {
    const parts = postcss.list.space(shadow)
    if (!parts.includes('inset')) return false
    const lengths = parts.map(pixels).filter((value) => value !== null)
    return Math.abs(lengths[0]) >= 3 && lengths[1] === 0 &&
      (lengths[2] || 0) === 0 && (lengths[3] || 0) === 0
  })
}

// 这些文件维护应用级基线；业务页面和按需加载的组件不进入此列表。
const sharedFiles = new Set([
  'src/erp/styles/app/design-tokens.css',
  'src/erp/styles/app/control-foundation.css',
  'src/erp/styles/app/business-control-rhythm.css',
  'src/erp/styles/app/control-focus.css',
  'src/erp/styles/app/control-affordance.css',
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
  /^ant-(?:input|input-affix-wrapper|input-textarea-affix-wrapper|input-number|input-number-affix-wrapper|select-selector|picker)$/u
const geometryControlClass =
  /^ant-(?:input|input-affix-wrapper|input-textarea-affix-wrapper|input-number|input-number-affix-wrapper|input-number-input|input-number-input-wrap|select|select-single|select-multiple|select-selector|select-selection-item|select-selection-placeholder|select-selection-search|select-selection-search-input|select-selection-wrap|select-selection-overflow|picker|picker-input)$/u
const controlGeometry =
  /^(?:(?:min-|max-)?(?:height|block-size)|line-height|padding(?:-block(?:-start|-end)?|-top|-bottom)?)$/u
const selectedTextProperties =
  /^(?:white-space|text-overflow|overflow(?:-x|-y)?|overflow-wrap|word-break)$/u
const rhythmFile = 'src/erp/styles/app/business-control-rhythm.css'
const foundationFile = 'src/erp/styles/app/control-foundation.css'

function targetsNode(selector, matches) {
  const lastCompound = selector.nodes.slice(
    selector.nodes.findLastIndex((node) => node.type === 'combinator') + 1
  )
  return lastCompound.some(
    (node) =>
      matches(node) ||
      (node.type === 'pseudo' &&
        [':is', ':where'].includes(node.value) &&
        node.nodes.some((child) => targetsNode(child, matches)))
  )
}

function targetsClass(selector, classPattern) {
  return targetsNode(selector, (node) => node.type === 'class' && classPattern.test(node.value))
}

function hasPositiveClass(selector, classPattern) {
  return selector.nodes.some((node) =>
    (node.type === 'class' && classPattern.test(node.value)) ||
    (node.type === 'pseudo' && [':is', ':where'].includes(node.value) &&
      node.nodes.length > 0 && node.nodes.every((child) => hasPositiveClass(child, classPattern)))
  )
}

function targetsControlGeometry(selector) {
  if (targetsClass(selector, geometryControlClass)) return true
  return targetsNode(selector, (node) => node.type === 'tag' && ['input', 'textarea'].includes(node.value)) &&
    hasPositiveClass(selector, /^ant-(?:input-affix-wrapper|input-textarea-affix-wrapper|input-number|input-number-affix-wrapper|input-number-input-wrap|select|select-selection-search|picker|picker-input)$/u)
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

  root.walkDecls((decl) => {
    if (hasThickSideAccent(decl)) report(decl, messages.sideAccent)
  })

  const appearanceOwner =
    relative === 'src/erp/styles/app/control-affordance.css'
  root.walkDecls('--erp-slider-shadow', (decl) => {
    const contentTabSelectors = new Set([
      '.erp-sliding-tabs.ant-tabs > .ant-tabs-nav .ant-tabs-nav-list',
      '.erp-sliding-tab-list.erp-navigation-tabs',
    ])
    const sharedUnderline = appearanceOwner &&
      decl.parent.selectors.every((selector) => contentTabSelectors.has(selector)) &&
      decl.value === 'inset 0 -2px 0 var(--erp-control-accent)'
    if (sharedUnderline) return
    if (/inset\s+0\s+-[2-9]\d*px\s+0/u.test(decl.value)) {
      report(decl, messages.thickSelection)
    }
  })
  if (!appearanceOwner) {
    root.walkDecls(
      /^--erp-(segmented-|control-(surface|track|border|tab-border|text|muted|on-accent|accent|selected|hover|disabled))/u,
      (decl) => report(decl, messages.controls)
    )
  }

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
    let mobileControl = false
    selectors.walkClasses((part) => {
      if (
        !/^erp-(?:mobile-search(?:__clear)?|control-field)$/u.test(part.value)
      ) {
        return
      }
      let { parent } = part
      while (parent) {
        if (parent.type === 'pseudo' && parent.value === ':not') return
        parent = parent.parent
      }
      mobileControl = true
    })
    if (
      !appearanceOwner &&
      ((mobileControl && relative !== focusFile) ||
        /erp-sliding-(?:tabs|segmented|tab-list)|erp-filter-chip|ant-(?:segmented(?:-item(?:-label|-selected)?)?|tabs-tab(?:-btn|-active)?|tabs-ink-bar)(?![\w-])|erp-segmented-item-selected/u.test(
          node.selector
        ))
    ) {
      node.walkDecls(
        /^(?:background(?:-color)?|color|box-shadow|border(?:-.+)?|outline)$/u,
        (decl) => report(decl, messages.controls)
      )
    }
    if (
      relative !== 'src/erp/styles/app/control-foundation.css' &&
      selectors.nodes.some((selector) => targetsClass(selector, outerControlClass))
    ) {
      node.walkDecls(/^border-.*radius$/u, (decl) =>
        report(decl, messages.radius)
      )
    }
    if (
      relative !== rhythmFile &&
      selectors.nodes.some(targetsControlGeometry)
    ) {
      node.walkDecls(controlGeometry, (decl) => report(decl, messages.geometry))
    }
    if (selectors.nodes.some((selector) => targetsClass(selector, /^ant-select-selection-item$/u))) {
      if (relative !== foundationFile) {
        node.walkDecls(selectedTextProperties, (decl) => report(decl, messages.selectedText))
      }
      // 多选标签可以换行；单选值不能因所在页面、表格或只读状态改变合同。
      if (selectors.nodes.some((selector) =>
        targetsClass(selector, /^ant-select-selection-item$/u) &&
        !hasPositiveClass(selector, /^ant-select-multiple$/u)
      )) {
        node.walkDecls('white-space', (decl) => {
          if (decl.value !== 'nowrap') report(decl, messages.singleLine)
        })
        node.walkDecls('text-overflow', (decl) => {
          if (decl.value !== 'ellipsis') report(decl, messages.singleLine)
        })
      }
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
