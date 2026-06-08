export const yoyoosunMenuConfig = Object.freeze({
  customerKey: "yoyoosun",
  label: "永绅 yoyoosun",
  desktopMenu: {
    sections: [
      {
        title: "看板中心",
        items: ["global-dashboard", "business-dashboard"],
      },
      {
        title: "基础资料",
        items: ["customers", "suppliers", "products"],
      },
      {
        title: "销售链路",
        items: ["sales-orders"],
      },
      {
        title: "采购/仓储",
        items: [
          "material-bom",
          "accessories-purchase",
          "processing-contracts",
          "inbound",
          "inventory",
          "shipping-release",
          "outbound",
        ],
      },
      {
        title: "生产环节",
        items: [
          "production-scheduling",
          "production-progress",
          "production-exceptions",
          "quality-inspections",
        ],
      },
      {
        title: "财务环节",
        items: ["reconciliation", "payables", "receivables", "invoices"],
      },
      {
        title: "单据模板",
        items: ["print-center"],
      },
      {
        title: "系统管理",
        items: ["permission-center"],
      },
    ],
  },
});
