window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({
  customerKey: "yoyoosun",
  label: "永绅 yoyoosun",
  brand: Object.freeze({
    brandMark: "永",
    companyName: "东莞市永绅玩具有限公司",
    systemName: "业务管理",
    faviconHref: "/customer-assets/yoyoosun/favicon-yoyoosun.svg",
  }),
  legalNotice: Object.freeze({
    noticeVersion: "2026-08-11.1",
    effectiveDate: "2026-08-11",
    controllerName: "东莞市永绅玩具有限公司",
    contactChannel: "请联系本单位系统管理员或人事、信息化负责人。",
    storageLocation: "本单位指定的中国境内私有化部署环境。",
    crossBorderRule:
      "默认不向中华人民共和国境外提供个人信息；确需跨境时，由本单位另行履行评估、告知和必要授权程序。",
    processors: Object.freeze([
      Object.freeze({
        name: "阿里云短信服务",
        purpose: "发送登录验证码",
        dataCategories: "手机号、验证码发送状态",
        condition: "仅在本单位启用短信登录且用户主动获取验证码时",
      }),
    ]),
  }),
  desktopMenu: Object.freeze({
    presentation: "role_guided",
    hiddenItemKeys: Object.freeze([]),
    sections: Object.freeze([
      Object.freeze({
        title: "看板中心",
        items: Object.freeze([
          "global-dashboard",
          "task-board",
          "business-dashboard",
        ]),
      }),
      Object.freeze({
        title: "基础资料",
        items: Object.freeze([
          "customers",
          "suppliers",
          "products",
          "materials",
        ]),
      }),
      Object.freeze({
        title: "销售管理",
        items: Object.freeze(["sales-orders"]),
      }),
      Object.freeze({
        title: "产品工程",
        items: Object.freeze(["material-bom", "processes"]),
      }),
      Object.freeze({
        title: "采购管理",
        items: Object.freeze(["accessories-purchase"]),
      }),
      Object.freeze({
        title: "质检管理",
        items: Object.freeze(["quality-inspections"]),
      }),
      Object.freeze({
        title: "库存管理",
        items: Object.freeze(["inbound", "inventory"]),
      }),
      Object.freeze({
        title: "委外管理",
        items: Object.freeze(["processing-contracts"]),
      }),
      Object.freeze({
        title: "生产管理",
        items: Object.freeze([
          "production-orders",
          "production-scheduling",
          "production-progress",
          "production-exceptions",
        ]),
      }),
      Object.freeze({
        title: "出货管理",
        items: Object.freeze(["shipping-release", "outbound", "shipments"]),
      }),
      Object.freeze({
        title: "财务管理",
        items: Object.freeze([
          "reconciliation",
          "receivables",
          "payables",
          "finance-payments",
          "invoices",
        ]),
      }),
      Object.freeze({
        title: "运营工具",
        items: Object.freeze(["print-center"]),
      }),
      Object.freeze({
        title: "系统管理",
        items: Object.freeze(["permission-center", "system-audit-logs"]),
      }),
    ]),
  }),
});
