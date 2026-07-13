export const yoyoosunMenuConfig = Object.freeze({
  customerKey: "yoyoosun",
  label: "永绅 yoyoosun",
  brand: {
    brandMark: "永",
    companyName: "东莞市永绅玩具有限公司",
    systemName: "毛绒 ERP 管理后台",
    faviconHref: "/customer-assets/yoyoosun/favicon-yoyoosun.svg",
  },
  desktopMenu: {
    hiddenItemKeys: [
      "business-dashboard",
      "shipping-release",
      "exception-flow",
    ],
    sections: [
      {
        title: "看板中心",
        items: ["global-dashboard", "task-board", "business-dashboard"],
      },
      {
        title: "主数据",
        items: ["customers", "suppliers", "products", "materials"],
      },
      {
        title: "销售管理",
        items: ["sales-orders"],
      },
      {
        title: "产品工程",
        items: ["material-bom", "processes"],
      },
      {
        title: "采购管理",
        items: ["accessories-purchase"],
      },
      {
        title: "质检管理",
        items: ["quality-inspections"],
      },
      {
        title: "库存管理",
        items: ["inbound", "inventory"],
      },
      {
        title: "委外管理",
        items: ["processing-contracts"],
      },
      {
        title: "生产管理",
        items: [
          "production-scheduling",
          "production-progress",
          "production-exceptions",
        ],
      },
      {
        title: "出货管理",
        items: ["shipping-release", "outbound", "shipments"],
      },
      {
        title: "财务业务",
        items: ["reconciliation", "payables", "receivables", "invoices"],
      },
      {
        title: "运营工具",
        items: ["print-center", "exception-flow"],
      },
      {
        title: "系统管理",
        items: ["permission-center", "system-audit-logs"],
      },
    ],
  },
});
