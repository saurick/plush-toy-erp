export const auditSources = {
  admin_manage: {
    label: '系统管理',
    actions: {
      'admin_user.create': {
        label: '创建员工账号',
        risk: 'warning',
        intent: '确认是否新增了可登录账号',
        next: '核对操作人、账号名、岗位和手机号是否符合公司安排。',
      },
      'admin_user.roles.set': {
        label: '员工岗位变更',
        risk: 'warning',
        intent: '确认员工账号增加或移除了哪些岗位',
        next: '重点核对员工账号的岗位变化，以及是否新增系统管理等重要功能。',
      },
      'admin_user.profile.set': {
        label: '员工资料变更',
        risk: 'normal',
        intent: '确认员工姓名或登录手机号是否被调整',
        next: '核对修改前后的姓名和手机号，确认与实际员工身份一致。',
      },
      'admin_user.disabled.set': {
        label: '账号启用或停用',
        risk: 'high',
        intent: '确认账号是否被禁用或恢复',
        next: '重点核对账号当前状态；如果账号被误禁用，回到权限管理页恢复。',
      },
      'admin_user.revoked': {
        label: '员工账号注销',
        risk: 'high',
        intent: '确认哪个员工账号已被永久注销',
        next: '重点核对操作人和员工账号；已注销账号不能恢复，如需继续使用请创建新账号。',
      },
      'admin_user.password.reset': {
        label: '密码重置',
        risk: 'high',
        intent: '确认谁重置了哪个账号密码',
        next: '核对操作人和员工账号；系统只记录重置操作，不记录密码内容。',
      },
      'admin_user.password.change': {
        label: '自行修改密码',
        risk: 'normal',
        intent: '确认账号本人何时修改了密码',
        next: '修改后旧登录全部失效；系统只记录操作，不记录密码内容。',
      },
      'role.permissions.set': {
        label: '岗位功能变更',
        risk: 'high',
        intent: '确认某个岗位可使用的功能是否变化',
        next: '重点核对修改前后的功能，确认是否新增账号管理等重要功能。',
      },
      'role.settings.set': {
        label: '岗位设置变更',
        risk: 'high',
        intent: '确认岗位功能、数据范围和导航设置的变化',
        next: '核对岗位功能与数据范围是否符合实际职责。',
      },
      'role.navigation.set': { label: '岗位菜单布局变更' },
      'payment_method.create': { label: '新增付款方式' },
      'payment_method.update': { label: '修改付款方式' },
      'payment_method.delete': { label: '删除未使用付款方式' },
      'payment_method.recommendation.set': { label: '付款方式推荐变更' },
      legal_notice_acknowledgement: { label: '隐私与使用规则知悉', byEventType: true },
    },
  },
  customer_config: {
    label: '客户业务设置',
    actions: {
      'customer_config.publish': {
        label: '保存客户业务设置',
        risk: 'high',
        intent: '确认谁保存了一版新的客户业务设置',
        next: '核对操作人和修改时间；保存后还需启用，才会影响员工看到的页面和功能。',
      },
      'customer_config.activate': {
        label: '启用客户业务设置',
        risk: 'high',
        intent: '确认哪版客户业务设置开始生效',
        next: '核对操作人和生效时间，并确认员工看到的页面和功能符合预期。',
      },
      'customer_config.rollback': {
        label: '恢复上一版客户业务设置',
        risk: 'high',
        intent: '确认客户业务设置是否恢复到了上一版',
        next: '核对操作人和恢复时间，并确认员工看到的页面和功能已经恢复。',
      },
    },
  },
  server_bootstrap: {
    label: '系统准备',
    actions: {
      'admin_bootstrap.completed': {
        label: '系统准备完成',
        risk: 'normal',
        intent: '确认系统是否已准备好使用',
        next: '如不是首次启用系统，请联系系统维护人员确认此次操作。',
      },
      'admin_bootstrap.blocked': {
        label: '系统准备未完成',
        risk: 'high',
        intent: '确认系统为何暂时无法使用',
        next: '请联系管理员检查系统设置。',
      },
    },
  },
  workflow: {
    label: '流程与任务',
    actions: {
      process_instance_created: { label: '发起流程', byEventType: true },
      'workflow_task.reassign': { label: '协同任务转交' },
      'workflow_task.break_glass': {
        label: '紧急代办授权',
        risk: 'high',
        intent: '确认谁临时获准处理了原本不属于自己的待办',
        next: '重点核对操作人、待办事项、处理原因和授权时间是否符合公司安排。',
      },
    },
  },
}

export function getAuditActionOptions(source) {
  if (!source) return []
  return [
    { value: '', label: '全部操作' },
    ...Object.entries(auditSources[source].actions).map(([value, { label }]) => ({ value, label })),
  ]
}
