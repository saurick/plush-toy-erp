import { BUSINESS_USABILITY_CATALOG } from './businessUsabilityCatalog.mjs'
import { ENGINEERING_MATERIAL_HELP } from './engineeringMaterialHelp.mjs'
import { ROLE_HELP_GUIDES } from './roleHelpContent.mjs'
import { getBusinessModule } from './businessModules.mjs'

export const BUSINESS_HANDBOOK_TITLE = '业务使用手册'

const section = (key, title, paragraphs, extra = {}) => ({
  key,
  title,
  paragraphs,
  ...extra,
})
const chapter = (key, title, summary, sections) => ({
  id: `handbook:${key}`,
  kind: 'chapter',
  title,
  summary,
  sectionTitle: '通用操作与岗位交接',
  sections,
})

const generalChapters = [
  chapter(
    'start',
    '开始使用',
    '从登录、工作台到第一次办理，先认识资料、单据和业务结果。',
    [
      section('scope', '这本手册怎样用', [
        '本手册说明当前产品已经提供的操作。公司启用范围、账号岗位、数据范围和当前业务状态共同决定实际可见内容与可用动作。',
        '需要马上办事时，在帮助首页按岗位找操作图解；需要系统学习时，按手册目录阅读。业务页的“这页怎么用”和字段问号可直接进入对应图解、章节或词条。',
        '在线手册只包含当前账号可阅读的帮助。下载的是当前可阅读范围的离线 HTML，可直接用浏览器阅读、查找和打印为 PDF。',
      ]),
      section('login', '登录与找到入口', [], {
        steps: [
          '使用管理员已开通的账号登录；遇到账号停用、密码或验证码提示时，按页面提示处理。',
          '先在工作台查看当前重点，再从任务管理进入需要自己处理的事项。',
          '按业务模块打开资料或单据；菜单中没有入口时，联系管理员核对公司启用范围和账号权限。',
          '办理后回到原记录重新查看状态与结果。退出账号后，不把其他账号的数据当作当前账号的工作内容。',
        ],
      }),
      section('objects', '先分清资料、单据和事实', [], {
        rows: [
          [
            '基础资料',
            '客户、供应商、产品、材料和加工环节等资料提供业务引用；先搜索已有资料，确认后再新建。',
          ],
          [
            '来源单据',
            '销售、采购、委外和生产订单表达本次业务需求或承诺。草稿、提交、批准和生效含义分别核对。',
          ],
          [
            '业务结果',
            '入库、库存、检验、实际出货、应收应付和实际收付款，须在对应正式业务记录中核对。',
          ],
          [
            '协同任务',
            '记录谁办理、何时交接和处理结论；任务完成不能替代对应业务结果。',
          ],
        ],
      }),
    ]
  ),
  chapter(
    'work',
    '工作台、任务与进度',
    '找到当前工作，判断轮到谁，办理后回来源核对结果。',
    [
      section('workbench', '工作台与任务管理', [
        '工作台用于查看当前重点；任务管理按当前账号权限查看待处理与历史事项。先核对单据、环节、办理人、时间和受阻原因，再进入实际办理页面。',
        '审批前核对来源、数量或金额、交期和必要附件。资料不完整时写清退回原因与补充要求，不替来源岗位补造资料。',
        '完成任务后检查处理记录和交接结果，再回来源单据核对状态；任务显示完成不表示订单已生效或库存、出货、财务已经完成。',
      ]),
      section('tracking', '跟踪进度与异常', [
        '进度看板用于查询订单及生产交付进度。结合筛选范围、当前阶段、阻塞原因和办理人阅读，不能把没有关联的任务当作同一条前后依赖。',
        '查看任务或业务记录中的流程、异常与历史记录，核对同一来源和本次对象。有差异时保留来源单号，交对应责任岗位处理。',
      ]),
      section('mobile', '手机办理', [
        '公司和账号已开放手机岗位入口时，可进入对应岗位的手机待办。是否允许办理仍取决于同一套账号权限、业务状态和服务端校验。',
        '手机中先找任务，再查看详情、来源、追踪和可用动作。无入口、加载失败或无权限时按明确提示处理，不能把空列表当作业务已经结束。',
      ]),
    ]
  ),
  chapter(
    'entry',
    '填写、保存与状态',
    '理解自动带值、金额数量、草稿、提交和受控更正。',
    [
      section('fields', '自动带入的资料仍需核对', [
        '选择客户、供应商、产品、规格、材料或来源单据后，核对本单带出的联系人、地址、单位、数量、价格和交易条件。切换或清空来源时，重新检查原值是否仍适用。',
        '已有订单和已冻结资料按该记录保存的内容办理；修改档案不表示旧单据已重新确认。来源缺失时先核实，不把空值当作零或默认事实。',
      ]),
      section('quantities', '数量、金额和日期', [
        '数量按对应单位允许的精度填写，金额按当前单据币种核对；不同币种不直接相加。页面展示的公式、来源和变更影响可从字段问号查阅。',
        '销售订单每行金额由订购数量与单价计算；运费和计税条件另行核对。账期与到期日按来源单据冻结条件计算，缺失条件不能当作 0 天。具体计算见对应业务章节。',
      ]),
      section('save', '草稿、提交与生效', [], {
        steps: [
          '先核对必填项与来源，保存后重新查看当前记录。',
          '需要审批的单据按页面提交，检查提交状态和对应任务。',
          '被退回时先查看原因，再按当前允许动作修改或重建并重新提交。',
          '只有来源单据达到相应业务状态，才向下游交接；不能把保存成功、提交成功或任务完成当作全部业务已完成。',
        ],
      }),
      section('correction', '取消、停用与更正', [
        '主数据通常使用启用或停用；来源单据使用当前允许的取消、关闭或归档。已生效、已过账或被引用的记录不能按普通草稿随意删除。',
        '已过账业务使用对应页面提供的取消、冲正、调整或受控更正，保留原记录与追踪。不要重复建单或直接改余额来掩盖差异。',
      ]),
    ]
  ),
  chapter(
    'tools',
    '打印、附件与历史记录',
    '在业务办理之外核对输出、文件和可追踪记录。',
    [
      section('print', '模板与打印', [], {
        steps: [
          '从业务记录或模板打印中心进入对应打印工作区，核对当前单据、模板、内容及可用资料。',
          '在预览中核对明细、分页、签字区和必要图片；有缺值或输出提示时先回来源核实。',
          '按当前工作区提供的打印或 PDF 动作输出；多份、批量和模板编辑以该工作区实际提供的功能为准。',
          '打印后仍以正式业务记录判断是否已批准、出货或收付；打印和导出本身不改变业务状态。',
        ],
      }),
      section('attachments', '附件和图片', [
        '仅在对应页面提供附件入口时上传业务所需资料，遵守页面提示的类型、大小和数量限制。上传后确认列表或预览可重新打开。',
        '不要把暂时上传、预览缓存或本机文件当作业务已保存；保存后重新查看关联记录。上传失败时保留当前输入并按提示重试。',
      ]),
      section('history', '业务历史与系统操作记录', [
        '历史记录中心用于查看已提供的业务历史；任务事件、来源记录和业务审计应结合单号与对象核对。',
        '系统操作记录供获授权人员查询系统动作。操作日志帮助排查问题，不能代替入库、出货、财务等正式业务记录。',
      ]),
    ]
  ),
  chapter(
    'problems',
    '常见问题与恢复',
    '遇到看不到、不能操作、失败或结果不确定时，知道下一步找谁。',
    [
      section('access', '看不到菜单或按钮', [
        '先确认当前账号、公司启用范围和页面位置，再请管理员核对岗位、菜单、数据范围和敏感操作权限。能阅读帮助不表示有权办理对应业务。',
        '按钮不可用时查看当前状态、来源、余额或数量、审批、检验、包装等前置条件。切换设备和刷新页面不会绕过这些条件。',
      ]),
      section('uncertain', '点击后失败或没有明确结果', [], {
        steps: [
          '保留当前输入、来源单号与页面提示，不连续重复提交。',
          '重新查询同一记录，核对状态、明细和任务，确认操作是否已经成功。',
          '确认未成功且页面允许时再重试；仍无法确定时交管理员或对应责任岗位核对。',
          '恢复后回同一来源和本次对象继续，检查是否出现重复单据或重复办理。',
        ],
      }),
      section('report', '怎样提供有效的问题信息', [
        '说明当前页面、来源单号、本次对象、想做的动作、页面提示和已查询到的结果；截图只保留问题相关内容。',
        '不要提供密码、完整令牌或无关客户隐私。涉及业务差异先找来源责任岗位，涉及账号、运行或文件不可用再找管理员。',
      ]),
    ]
  ),
]

export function getBusinessHandbookIntroductions(guides = ROLE_HELP_GUIDES) {
  const roleChapter = chapter(
    'roles',
    '岗位责任与交接',
    '按当前帮助岗位核对工作顺序、完成标准、交接与异常责任。',
    guides.map((guide) =>
      section(
        guide.key,
        guide.label,
        [guide.headline, guide.completion, guide.handoff, guide.caution].filter(
          Boolean
        ),
        {
          steps: guide.workflow,
          rows: guide.exception
            ? [
                ['遇到异常', guide.exception.trigger],
                ['交给谁', guide.exception.returnTo],
                ['怎样恢复', guide.exception.doneWhen],
                ...guide.exception.steps.map((text, index) => [
                  `处理 ${index + 1}`,
                  text,
                ]),
              ].filter(([, value]) => value)
            : [],
        }
      )
    )
  )
  return [
    generalChapters[0],
    generalChapters[1],
    roleChapter,
    ...generalChapters.slice(2),
  ]
}

export function getBusinessPageHandbookSections(page) {
  const module = getBusinessModule(page.key)
  const scope =
    module?.currentScope?.map((text) =>
      text
        .replaceAll('原子生成', '生成')
        .replaceAll('并发版本校验', '记录版本校验')
        .replaceAll('财务放行锚点', '财务放行结果')
    ) || []
  const excel =
    page.key === 'sales-orders'
      ? [
          section('excel-drafts', '从 Excel 辅助新建订单草稿', [
            '在销售订单页面选择支持的 .xlsx 汇总表，按订单编号分组，选择本次要处理的候选订单，核对客户、产品需求、数量、单位、币种及原表行证据和嵌入图片。',
            '确认后逐单保存为新草稿。出现部分成功时保留已保存结果，核对失败项后再继续，不重复建立已经保存的订单。',
            '辅助录入不覆盖已有订单，不自动新建产品或 SKU，不自动审批、工程分配或形成出货与财务事实。客户真实资料仍遵循授权和受控保存要求，不等于通用客户数据批量导入。',
          ]),
        ]
      : page.key === 'material-bom'
        ? [
            section('excel-drafts', '从 Excel 材料分析表辅助新建 BOM 草稿', [
              '在 BOM 页面选择支持的 .xlsx 材料分析表，先复核内容，再使用系统中已有产品、规格、材料和单位完成映射。未识别项先核实，不按名称猜测。',
              '确认后只新建 BOM 草稿，不创建主数据或 SKU，不覆盖或启用已有版本，不自动写采购、生产或库存事实。',
            ]),
          ]
        : []
  return [
    section('task', '本页要做什么', [page.task]),
    ...(scope.length
      ? [
          section(
            'capabilities',
            '当前办理范围',
            ['实际可用动作还须满足当前账号权限、来源与业务状态。'],
            { rows: [['可办理内容', scope.join('；')]] }
          ),
        ]
      : []),
    section('steps', '办理顺序', [], { steps: page.flowSteps }),
    ...excel,
    section('completion', '完成标准与交接', [page.completion, page.handoff]),
    ...page.items.map((item) =>
      section(item.key, item.title, [item.explanation], {
        rows: [
          ['数据来源', item.source],
          ['变化时注意', item.updateRule],
          ['举个例子', item.example],
          ['会影响什么', item.effect],
        ].filter(([, value]) => value),
      })
    ),
    ...(page.upstreamLabels?.length || page.downstreamLabels?.length
      ? [
          section(
            'relations',
            '相关资料与后续业务',
            [
              '以下是相关业务范围，实际办理仍须核对本次对象的真实关联和允许动作。',
            ],
            {
              rows: [
                ...(page.upstreamLabels?.length
                  ? [['相关来源', page.upstreamLabels.join('、')]]
                  : []),
                ...(page.downstreamLabels?.length
                  ? [['后续业务', page.downstreamLabels.join('、')]]
                  : []),
              ],
            }
          ),
        ]
      : []),
    section('boundary', '业务边界', [page.boundary]),
  ]
}

export function renderBusinessHandbookMarkdown({
  guides = ROLE_HELP_GUIDES,
  pages = [...BUSINESS_USABILITY_CATALOG, ENGINEERING_MATERIAL_HELP],
} = {}) {
  const chapters = [
    ...getBusinessHandbookIntroductions(guides),
    ...pages.map((page) => ({
      id: page.key,
      title: page.title,
      sectionTitle: page.sectionTitle,
      sections: getBusinessPageHandbookSections(page),
    })),
  ]
  const lines = [
    `# ${BUSINESS_HANDBOOK_TITLE} / Business Handbook`,
    '',
    '本手册由当前岗位说明和业务帮助内容生成。在线图解、页面说明、字段词条与本手册共用业务内容；正式业务能力以对应页面、服务端规则和当前发布版本为准。',
    '',
    '<!-- Generated by scripts/docs/project-manuals.mjs from the shared business help sources. -->',
    '',
    '## 阅读目录 / Contents',
    '',
    ...chapters.map((c) => `- [${c.title}](#${c.id.replaceAll(':', '-')})`),
    '',
  ]
  for (const c of chapters) {
    lines.push(
      `<a id="${c.id.replaceAll(':', '-')}"></a>`,
      '',
      `## ${c.title}`,
      ''
    )
    for (const s of c.sections) {
      lines.push(
        `### ${s.title}`,
        '',
        ...(s.paragraphs || []).flatMap((p) => [p, ''])
      )
      if (s.steps?.length) {
        lines.push(...s.steps.map((text, index) => `${index + 1}. ${text}`), '')
      }
      if (s.rows?.length) {
        const cell = (value) =>
          String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
        lines.push(
          '| 事项 | 说明 |',
          '| --- | --- |',
          ...s.rows.map(
            ([label, value]) => `| ${cell(label)} | ${cell(value)} |`
          ),
          ''
        )
      }
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}
