import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

const nativeSelectRestriction = {
  selector: 'JSXOpeningElement[name.name="select"], CallExpression[callee.name="createElement"][arguments.0.value="select"], CallExpression[callee.property.name="createElement"][arguments.0.value="select"]',
  message:
    'Use AppSelect / FilterSelect for consistent clear controls, labels, theme and keyboard interaction.',
}

const nativeDialogRestriction = {
  selector: 'JSXOpeningElement[name.name="dialog"], CallExpression[callee.name="createElement"][arguments.0.value="dialog"], CallExpression[callee.property.name="createElement"][arguments.0.value="dialog"]',
  message: '使用 AppModal / BusinessModal；浏览器顶层原生 dialog 仅用于会话恢复隔离。',
}

const tabListRestriction = {
  selector: 'JSXOpeningElement[name.name=/^[a-z]/]:has(JSXAttribute[name.name="role"][value.value="tablist"])',
  message: 'Use SlidingTabList for custom tabs. The shared component owns selection motion and keyboard navigation.',
}

const nativeTableRestriction = {
  selector: 'JSXOpeningElement[name.name="table"]:not(:has(JSXAttribute[name.name="data-table-lines"][value.value=/^(appearance|fixed)$/])), CallExpression[callee.name="createElement"][arguments.0.value="table"], CallExpression[callee.property.name="createElement"][arguments.0.value="table"]',
  message: '原生数据表使用 data-table-lines="appearance" 跟随账号网格设置；纸面、图解和有固定线框的专用表使用 "fixed"。',
}

const sharedImports = [
  { name: 'Select', entry: 'AppSelect / FilterSelect，业务列表沿用 SelectFilter', owners: ['src/common/components/select/AppSelect.jsx'] },
  { name: 'Pagination', entry: 'AppPagination，表格分页由 AppTable 管理', owners: ['src/common/components/pagination/AppPagination.jsx'] },
  { name: 'Table', entry: 'AppTable', owners: ['src/common/components/table/AppTable.jsx'] },
  { name: 'Modal', entry: 'AppModal / BusinessModal，命令式确认使用 common/utils/antdApp 的 modal', owners: ['src/common/components/modal/AppModal.jsx'] },
  { name: 'Tabs', entry: 'SlidingTabs', owners: ['src/common/components/navigation/SlidingTabs.jsx'] },
  { name: 'Segmented', entry: 'SlidingSegmented', owners: ['src/common/components/navigation/SlidingSegmented.jsx'] },
  { name: 'message', entry: 'common/utils/antdApp 的 message', owners: [] },
  { name: 'notification', entry: 'common/utils/antdApp 的 notification', owners: [] },
]
const antDesignEntrypoints = ['antd', 'antd/es', 'antd/es/index', 'antd/es/index.js', 'antd/lib', 'antd/lib/index', 'antd/lib/index.js']

function sharedImportRestrictions(owner, business = false) {
  const restricted = sharedImports.filter(({ owners }) => !owners.includes(owner))
  return ['error', {
    paths: antDesignEntrypoints.flatMap((moduleName) => [
      { name: moduleName, importNames: ['default'], message: '使用 Ant Design 命名导入与对应共享入口，避免聚合默认导出绕过组件约束。' },
      ...restricted.map(({ name, entry }) => ({ name: moduleName, importNames: [name], message: `统一使用 ${entry}；底层 ${name} 仅供对应共享实现使用。` })),
    ]),
    patterns: [
      ...restricted.map(({ name, entry }) => ({ group: [`antd/es/${name.toLowerCase()}`, `antd/es/${name.toLowerCase()}/**`, `antd/lib/${name.toLowerCase()}`, `antd/lib/${name.toLowerCase()}/**`], message: `统一使用 ${entry}，不绕过共享入口导入 Ant Design 内部模块。` })),
      ...(business && owner !== 'src/erp/components/business-list/BusinessModal.jsx' ? [{ group: ['**/common/components/modal/AppModal', '**/common/components/modal/AppModal.jsx'], message: '业务局部操作使用 BusinessModal / BusinessFormModal，主列表编辑使用 BusinessFormPage；通用系统弹窗由所属 common 组件承载。' }] : []),
    ],
  }]
}

const sharedSyntaxRestrictions = [nativeSelectRestriction, nativeDialogRestriction, tabListRestriction, nativeTableRestriction]

const selectClearExceptionRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { reason: '下拉框默认可清空；仅无合法空态的操作参数可关闭，并在 false 后说明“不可清空：具体原因”。' },
  },
  create(context) {
    const source = context.sourceCode
    const check = (node, value) => {
      if (value?.value !== false) return
      const reason = source.getAllComments().some((comment) =>
        comment.range[0] >= value.range[1] &&
        comment.loc.start.line === value.loc.end.line &&
        /^\s*不可清空：\S.{7,}/u.test(comment.value)
      )
      if (!reason) context.report({ node, messageId: 'reason' })
    }
    return {
      'JSXAttribute[name.name="allowClear"]': (node) => {
        const name = node.parent.name?.name || node.parent.name?.property?.name || ''
        if (/(?:Select|SelectFilter)$/u.test(name)) check(node, node.value?.expression)
      },
      'Property[key.name="allowClear"], Property[key.value="allowClear"]': (node) => check(node, node.value),
    }
  },
}

const selectDuplicateLabelRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { duplicate: '下拉框已有可见标签，不再传入同义 label 前缀；为选中值和清空入口保留空间。' },
  },
  create(context) {
    const normalize = (value) => typeof value === 'string' ? value.replace(/[：:\s]/gu, '') : ''
    const attributeText = (attribute) => attribute?.value?.value ?? attribute?.value?.expression?.value
    return {
      'JSXAttribute[name.name="label"]': (node) => {
        const name = node.parent.name?.name || node.parent.name?.property?.name || ''
        const label = normalize(attributeText(node))
        if (!/(?:Select|SelectFilter)$/u.test(name) || !label) return
        const duplicate = context.sourceCode.getAncestors(node).some((ancestor) => {
          if (ancestor.type !== 'JSXElement') return false
          const tag = ancestor.openingElement.name
          if (tag.name === 'label') {
            return normalize(ancestor.children.filter((child) => child.type === 'JSXText').map((child) => child.value).join('')) === label
          }
          return tag.object?.name === 'Form' && tag.property?.name === 'Item' &&
            normalize(attributeText(ancestor.openingElement.attributes.find((attribute) => attribute.name?.name === 'label'))) === label
        })
        if (duplicate) context.report({ node, messageId: 'duplicate' })
      },
    }
  },
}

export default [
  ...compat.config({
    env: {
      browser: true,
      es2021: true,
      node: true,
      commonjs: true,
    },
    extends: ['plugin:react/recommended', 'airbnb'],
    parserOptions: {
      ecmaFeatures: {
        experimentalObjectRestSpread: true,
        jsx: true,
        arrowFunctions: true,
        classes: true,
        modules: true,
        defaultParams: true,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowImportExportEverywhere: false,
      codeFrame: true,
    },
    plugins: ['react', 'react-hooks', 'tailwindcss'],
    rules: {
      // 个人开发低噪音基线：优先保留会影响稳定性的规则，弱化样式/偏好类规则。
      indent: 0,
      'arrow-body-style': 0,
      'no-plusplus': 0,
      'no-confusing-arrow': 0,
      'no-console': 0,
      'no-const-assign': 2,
      'no-param-reassign': 0,
      'no-shadow': 0,
      'no-return-assign': 0,
      'no-prototype-builtins': 0,
      'no-restricted-syntax': 0,
      'no-restricted-globals': 0,
      'no-use-before-define': 0,
      'no-unused-expressions': 0,
      'no-unused-vars': [
        2,
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-empty': 0,
      'no-nested-ternary': 0,
      'no-continue': 0,
      'no-lonely-if': 0,
      'no-await-in-loop': 0,
      'no-promise-executor-return': 0,
      'no-underscore-dangle': 0,
      'no-multi-assign': 0,
      'object-curly-newline': 0,
      'import/no-unresolved': 0,
      'import/prefer-default-export': 0,
      'import/no-extraneous-dependencies': 0,
      'import/extensions': 0,
      'implicit-arrow-linebreak': 0,
      'function-paren-newline': 0,
      'comma-dangle': 0,
      'consistent-return': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'jsx-a11y/no-static-element-interactions': 0,
      'max-classes-per-file': 0,
      'operator-linebreak': 0,
      'no-mixed-operators': 0,
      'nonblock-statement-body-position': 0,
      'brace-style': 0,
      'generator-star-spacing': 0,
      'max-len': 0,
      'class-methods-use-this': 0,
      camelcase: 0,
      semi: [2, 'never'],
      'semi-style': 0,
      eqeqeq: 'warn',
      'react/function-component-definition': 0,
      'react/jsx-wrap-multilines': 0,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-array-index-key': 0,
      'react/button-has-type': 0,
      'react/react-in-jsx-scope': 0,
      'react/jsx-filename-extension': 0,
      'react/jsx-one-expression-per-line': 0,
      'react/jsx-props-no-spreading': 0,
      'react/prop-types': 0,
      'react/jsx-curly-newline': 0,
      'jsx-a11y/label-has-associated-control': 0,
      'jsx-a11y/control-has-associated-label': 0,
      'tailwindcss/classnames-order': 'warn',
      'tailwindcss/no-custom-classname': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  }),
  {
    files: ['src/**/*.{js,jsx,mjs,ts,tsx}'],
    ignores: ['src/**/*.test.{js,jsx,mjs,ts,tsx}'],
    plugins: { 'select-controls': { rules: { 'clear-exception': selectClearExceptionRule, 'duplicate-label': selectDuplicateLabelRule } } },
    rules: {
      'select-controls/clear-exception': 'error',
      'select-controls/duplicate-label': 'error',
      'no-restricted-imports': sharedImportRestrictions(),
      'no-restricted-syntax': ['error', ...sharedSyntaxRestrictions],
    },
  },
  {
    files: ['src/erp/**/*.{js,jsx,mjs,ts,tsx}'],
    ignores: ['src/**/*.test.{js,jsx,mjs,ts,tsx}'],
    rules: { 'no-restricted-imports': sharedImportRestrictions(undefined, true) },
  },
  ...[...new Set([...sharedImports.flatMap(({ owners }) => owners), 'src/erp/components/business-list/BusinessModal.jsx'])].map((owner) => ({
    files: [owner],
    rules: { 'no-restricted-imports': sharedImportRestrictions(owner, owner.startsWith('src/erp/')) },
  })),
  {
    files: ['src/common/components/navigation/SlidingTabList.jsx'],
    rules: {
      'no-restricted-syntax': ['error', ...sharedSyntaxRestrictions.filter((rule) => rule !== tabListRestriction)],
    },
  },
  {
    files: ['src/erp/components/SessionRecoveryDialog.jsx'],
    rules: { 'no-restricted-syntax': ['error', ...sharedSyntaxRestrictions.filter((rule) => rule !== nativeDialogRestriction)] },
  },
]
