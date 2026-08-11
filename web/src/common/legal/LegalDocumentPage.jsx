import React, { useMemo } from 'react'
import { ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Button, Tag } from 'antd'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getStoredAdminProfile } from '@/common/auth/auth'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import { getActiveERPBrand } from '@/common/consts/brand'
import { getLegalNoticeBundle } from './legalNoticeConfig.mjs'
import './legal.css'

const PRIVACY_PATH = '/legal/privacy'
const SYSTEM_RULES_PATH = '/legal/system-rules'

function LegalPageHeader({ activeDocument, bundle }) {
  const activeBrand = getActiveERPBrand()
  const navigate = useNavigate()
  const location = useLocation()
  const configuredFrom =
    typeof location.state?.from === 'string' ? location.state.from : ''
  const preservedLocationState = configuredFrom
    ? { from: configuredFrom }
    : undefined
  const fallbackPath = getStoredAdminProfile() ? '/entry' : '/admin-login'

  return (
    <header className="legal-document-header">
      <div className="legal-document-toolbar">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(configuredFrom || fallbackPath)}
        >
          返回系统
        </Button>
        <ERPThemeToggle variant="menu" />
      </div>
      <div className="legal-document-brand">
        <span className="legal-document-brand__mark" aria-hidden="true">
          {activeBrand.brandMark}
        </span>
        <div>
          <div className="legal-document-eyebrow">公开告知与使用边界</div>
          <h1>
            {activeDocument === 'privacy' ? '个人信息处理规则' : '系统使用规则'}
          </h1>
          <p>{bundle.controllerName}</p>
        </div>
      </div>
      <nav className="legal-document-tabs" aria-label="规则文档">
        <Link
          to={PRIVACY_PATH}
          state={preservedLocationState}
          className={activeDocument === 'privacy' ? 'is-active' : ''}
          aria-current={activeDocument === 'privacy' ? 'page' : undefined}
        >
          个人信息处理规则
        </Link>
        <Link
          to={SYSTEM_RULES_PATH}
          state={preservedLocationState}
          className={activeDocument === 'system-rules' ? 'is-active' : ''}
          aria-current={activeDocument === 'system-rules' ? 'page' : undefined}
        >
          系统使用规则
        </Link>
      </nav>
    </header>
  )
}

function RuleSection({ children, title }) {
  return (
    <section className="legal-document-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function PrivacyDocument({ bundle }) {
  return (
    <>
      <div className="legal-document-lead">
        <SafetyCertificateOutlined aria-hidden="true" />
        <div>
          <strong>这是一份面向内部授权账号的处理告知。</strong>
          <p>
            本系统不是面向公众注册的消费产品。本页说明系统为登录、授权、办理业务和保障安全会处理哪些信息；“已阅读并知悉”只证明告知已送达，不把所有处理统一解释为基于个人同意。
          </p>
        </div>
      </div>

      <RuleSection title="1. 谁负责处理，以及如何联系">
        <dl className="legal-document-facts">
          <div>
            <dt>个人信息处理者</dt>
            <dd>{bundle.controllerName}</dd>
          </div>
          <div>
            <dt>联系和权利请求渠道</dt>
            <dd>{bundle.contactChannel}</dd>
          </div>
          <div>
            <dt>主要存储位置</dt>
            <dd>{bundle.storageLocation}</dd>
          </div>
        </dl>
      </RuleSection>

      <RuleSection title="2. 处理的信息、目的和方式">
        <div className="legal-document-table-wrap">
          <table>
            <thead>
              <tr>
                <th>信息类别</th>
                <th>主要内容</th>
                <th>用途与处理方式</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>账号与登录</td>
                <td>
                  账号名、手机号、密码哈希、短信发送状态、登录时间和会话状态
                </td>
                <td>
                  核验身份、维持登录、找回或注销账号、防止冒用；密码明文不写入业务日志
                </td>
              </tr>
              <tr>
                <td>岗位与权限</td>
                <td>岗位、权限、菜单、数据范围、任务处理责任</td>
                <td>只展示和允许办理当前账号被授权的工作</td>
              </tr>
              <tr>
                <td>业务操作</td>
                <td>创建、修改、审批、打印、导出、附件和异常处理记录</td>
                <td>
                  完成业务、保留责任链和支持差错恢复；业务记录可能同时包含客户、供应商或联系人的必要信息
                </td>
              </tr>
              <tr>
                <td>运行与安全</td>
                <td>
                  时间、请求标识、浏览器或设备环境、网络地址、错误、审计和安全事件
                </td>
                <td>
                  排查故障、防止未授权访问、追溯敏感操作和履行网络安全义务
                </td>
              </tr>
              <tr>
                <td>本机浏览器存储</td>
                <td>登录令牌、主题、工作入口和短信登录短期状态</td>
                <td>
                  维持当前设备登录和界面偏好；退出登录后清理认证信息，不用于广告画像
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          处理依据按实际场景分别包括：履行合同或依法制定的人力资源管理规则所必需、履行法定义务、保障网络和数据安全、处理已公开或依法可处理的信息，以及在确有必要的可选场景中取得的有效授权。系统不设置广告跟踪或面向公众的营销画像。
        </p>
      </RuleSection>

      <RuleSection title="3. 短信登录与受托处理方">
        <p>
          只有在部署单位启用短信登录且你主动获取验证码时，系统才把发送所必需的信息交给配置的短信服务方。服务方只能按约定目的处理，不得自行用于营销。
        </p>
        {bundle.processors.length > 0 ? (
          <div className="legal-document-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>处理方</th>
                  <th>用途</th>
                  <th>信息</th>
                  <th>触发条件</th>
                </tr>
              </thead>
              <tbody>
                {bundle.processors.map((processor) => (
                  <tr key={`${processor.name}-${processor.purpose}`}>
                    <td>
                      {processor.privacyURL ? (
                        <a
                          href={processor.privacyURL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {processor.name}
                        </a>
                      ) : (
                        processor.name
                      )}
                    </td>
                    <td>{processor.purpose}</td>
                    <td>{processor.dataCategories}</td>
                    <td>{processor.condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="legal-document-empty">
            当前客户配置未登记外部个人信息处理方；如后续启用短信或其他外部服务，部署单位应先更新本页。
          </p>
        )}
      </RuleSection>

      <RuleSection title="4. 保存期限">
        <ul>
          <li>账号与授权信息：{bundle.accountRetention}</li>
          <li>网络运行与安全日志：{bundle.securityLogRetention}</li>
          <li>业务与操作审计：{bundle.auditRetention}</li>
        </ul>
        <p>
          已过账、审批、财务、库存或其他承担证明责任的业务记录，不会因为账号注销就直接物理删除；达到保存目的或法定期限后，由部署单位按记录类别删除或匿名化。
        </p>
      </RuleSection>

      <RuleSection title="5. 你的权利和账号注销">
        <p>
          你可以通过上方联系渠道申请查阅、复制、更正或补充与你有关的信息；在符合法律和业务记录边界时申请删除、限制处理、解释处理规则或注销账号。管理员应核验申请人身份，并在合理期限内反馈处理结果。
        </p>
        <p>
          停止使用系统或离岗时，应联系管理员停用或正式注销账号。账号注销会终止后续登录，但不会抹去依法应保留的业务责任和审计记录。
        </p>
      </RuleSection>

      <RuleSection title="6. 安全、跨境和事件处置">
        <p>
          系统采用身份认证、后端权限校验、数据范围、操作审计、传输与部署保护等措施。任何账号都不得绕过权限边界；发现疑似泄露、冒用、异常导出或设备遗失时，应立即联系管理员。
        </p>
        <p>{bundle.crossBorderRule}</p>
        <p>
          发生或可能发生泄露、篡改、丢失时，处理者将采取补救措施，并按适用法律评估是否通知相关个人和主管部门。
        </p>
      </RuleSection>

      <RuleSection title="7. 业务联系人、未成年人和规则更新">
        <p>
          获得系统权限不等于可以任意录入他人信息。录入客户、供应商、员工或其他联系人的姓名、电话、邮箱、证件、账户或附件前，必须确认与当前业务直接相关、来源合法并控制在最小范围。
        </p>
        <p>
          本系统面向获得单位授权的工作人员，不以未成年人为目标用户。规则内容、处理目的、信息类别、处理方或保存方式发生实质变化时，系统将更新版本并再次提示知悉；依法需要单独同意的事项将另行处理。
        </p>
      </RuleSection>
    </>
  )
}

function SystemRulesDocument({ bundle }) {
  return (
    <>
      <div className="legal-document-lead">
        <SafetyCertificateOutlined aria-hidden="true" />
        <div>
          <strong>账号只代表被授予的工作责任，不代表数据所有权。</strong>
          <p>
            使用系统即应遵守本单位的岗位、保密、数据和设备管理要求。页面是否显示不是最终权限边界，后端授权、业务状态和审计规则始终有效。
          </p>
        </div>
      </div>

      <RuleSection title="1. 账号与设备">
        <ul>
          <li>只使用分配给本人的账号，不共享密码、验证码、令牌或登录设备。</li>
          <li>
            使用足够安全的密码；设备遗失、账号疑似冒用或岗位变化时立即联系管理员。
          </li>
          <li>
            离开公共或共享设备前退出登录，不通过浏览器插件、脚本或抓包工具绕过系统限制。
          </li>
        </ul>
      </RuleSection>

      <RuleSection title="2. 按授权办理业务">
        <ul>
          <li>只查看、创建、修改、审批、打印或导出岗位职责所需的数据。</li>
          <li>
            不得借用他人账号、越权调用接口、伪造来源单据或把任务完成误当成事实已过账。
          </li>
          <li>
            发现权限过大、状态异常或错误数据时先停止敏感动作并报告，不用重复提交掩盖问题。
          </li>
        </ul>
      </RuleSection>

      <RuleSection title="3. 数据质量与保密">
        <ul>
          <li>
            录入前核对来源，避免残值、缺值、重复记录和未经确认的个人信息。
          </li>
          <li>
            客户资料、价格、合同、财务、员工、供应商和生产信息只能用于授权业务。
          </li>
          <li>
            不得把数据复制到私人网盘、个人聊天、未批准的 AI
            服务或其他不受控位置。
          </li>
          <li>
            打印、下载和截图后仍需按相同保密级别保管；用途结束后安全销毁。
          </li>
        </ul>
      </RuleSection>

      <RuleSection title="4. 审计、异常与责任">
        <p>
          系统会记录登录、权限、敏感操作、业务状态和异常处理等审计信息，用于安全、差错恢复和责任核对。不得删除、篡改或诱导他人规避审计。
        </p>
        <p>
          误操作时应保留现场并按业务规则撤销、冲正、调整或联系管理员，不直接修改数据库，不把真实业务错误改写成测试数据。
        </p>
      </RuleSection>

      <RuleSection title="5. 账号停用、注销和离岗交接">
        <p>
          岗位变化时由管理员及时调整权限；暂停工作可停用账号，确认不再使用时正式注销。注销前应完成待办交接，但不得借交接复制超出接任人权限的数据。
        </p>
      </RuleSection>

      <RuleSection title="6. 规则解释和联系">
        <p>{bundle.contactChannel}</p>
        <p>
          “已阅读并知悉”表示当前账号看到了本版本规则，不代替劳动合同、保密协议、客户合同、个人信息委托处理协议或依法需要的单独同意。具体岗位制度与本规则不一致时，应先联系管理人员确认，不自行选择更宽松的口径。
        </p>
      </RuleSection>
    </>
  )
}

export default function LegalDocumentPage({ documentKey = 'privacy' }) {
  const activeDocument =
    documentKey === 'system-rules' ? 'system-rules' : 'privacy'
  const bundle = useMemo(() => getLegalNoticeBundle(), [])
  const pageTitle =
    activeDocument === 'privacy' ? '个人信息处理规则' : '系统使用规则'

  return (
    <div className="legal-document-page" data-testid="legal-document-page">
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>
      <div className="legal-document-shell">
        <LegalPageHeader activeDocument={activeDocument} bundle={bundle} />
        <main className="legal-document-content">
          {activeDocument === 'privacy' ? (
            <PrivacyDocument bundle={bundle} />
          ) : (
            <SystemRulesDocument bundle={bundle} />
          )}
        </main>
        <footer className="legal-document-footer">
          <span>版本 {bundle.noticeVersion}</span>
          <span>生效日期 {bundle.effectiveDate}</span>
          <Tag color="green">便于查阅和保存</Tag>
        </footer>
      </div>
    </div>
  )
}
