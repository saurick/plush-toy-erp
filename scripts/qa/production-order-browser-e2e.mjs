import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function localURL(raw, name) {
  const url = new URL(String(raw || ""));
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error(`${name} 只允许本机隔离验收地址`);
  }
  return url;
}

function rpcMethod(response, method) {
  return (
    response.url().includes("/rpc/production_order") &&
    response.request().postData()?.includes(`"method":"${method}"`)
  );
}

async function login(page, frontend, username, password) {
  await page.goto(new URL("/admin-login", frontend).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("账号").fill(username);
  await page.locator("input[type=password]").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/admin-login", {
      timeout: 15_000,
    }),
    page.locator("button[type=submit]").click(),
  ]);
}

async function resetLogin(page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function openProductionOrders(page, frontend) {
  await page.goto(new URL("/erp/production/orders", frontend).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "生产订单" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

async function selectProduct(modal, page, productCode) {
  const productField = modal
    .locator(".ant-form-item")
    .filter({ has: page.getByText("产品", { exact: true }) })
    .first();
  await productField.locator(".ant-select-selector").click();
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: productCode })
    .first()
    .click();
}

async function createDraft(page, orderNo, productCode) {
  const createButton = page
    .locator("button:visible")
    .filter({ hasText: /^新建生产订单$/u })
    .first();
  await createButton.click();
  const modal = page
    .locator(".ant-modal:visible")
    .filter({ hasText: "新建生产订单" });
  await modal.getByLabel("生产单号").fill(orderNo);
  await selectProduct(modal, page, productCode);
  const unitField = modal
    .locator(".ant-form-item")
    .filter({ has: page.getByText("单位", { exact: true }) })
    .first();
  await unitField.locator(".ant-select-selection-item").waitFor({
    state: "visible",
    timeout: 10_000,
  });
  const [response] = await Promise.all([
    page.waitForResponse((item) => rpcMethod(item, "create_production_order")),
    modal.getByRole("button", { name: "创建草稿" }).click(),
  ]);
  const body = await response.json();
  if (response.status() !== 200 || body?.result?.code !== 0) {
    throw new Error(`创建生产订单失败 code=${body?.result?.code}`);
  }
  await modal.waitFor({ state: "hidden", timeout: 15_000 });
  await page.locator("tr").filter({ hasText: orderNo }).first().waitFor({
    state: "visible",
    timeout: 15_000,
  });
  return {
    aggregate: body.result.data,
    authorization: response.request().headers().authorization,
  };
}

function saveParams(aggregate, note) {
  const order = aggregate.production_order;
  return {
    production_order_id: order.id,
    expected_version: order.version,
    order_no: order.order_no,
    planned_start_at: order.planned_start_at,
    planned_end_at: order.planned_end_at,
    note,
    items: aggregate.production_order_items.map((item) => ({
      line_no: item.line_no,
      product_id: item.product_id,
      product_sku_id: item.product_sku_id,
      unit_id: item.unit_id,
      planned_quantity: item.planned_quantity,
      sales_order_item_id: item.sales_order_item_id,
      bom_header_id: item.bom_header_id,
      note: item.note,
    })),
    idempotency_key: globalThis.crypto.randomUUID(),
  };
}

async function externalSave(page, authorization, aggregate, note) {
  return page.evaluate(
    async ({ authorization, params }) => {
      const response = await fetch("/rpc/production_order", {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "production-order-browser-stale-winner",
          method: "save_production_order",
          params,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { authorization, params: saveParams(aggregate, note) },
  );
}

async function completeProductionSchedulingTask(
  page,
  authorization,
  productionOrderID,
) {
  return page.evaluate(
    async ({ authorization, productionOrderID }) => {
      const call = async (method, params) => {
        const response = await fetch("/rpc/workflow", {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: `production-order-browser-${method}`,
            method,
            params,
          }),
        });
        return { status: response.status, body: await response.json() };
      };
      const listed = await call("list_tasks", {
        task_group: "production_scheduling",
        source_type: "production-orders",
        source_id: productionOrderID,
        limit: 20,
        offset: 0,
      });
      const tasks = listed.body?.result?.data?.tasks || [];
      const task = tasks.find(
        (item) =>
          item?.task_code ===
            `source-production-scheduling-${productionOrderID}` &&
          item?.owner_role_key === "pmc" &&
          item?.source_id === productionOrderID &&
          item?.payload?.production_order_id === productionOrderID &&
          item?.payload?.source_task_contract === "workflow.source-task/v1" &&
          item?.payload?.source_task_producer === "production_order.release" &&
          /^[0-9a-f]{64}$/u.test(
            String(item?.payload?.source_task_intent_hash || ""),
          ),
      );
      if (
        listed.status !== 200 ||
        listed.body?.result?.code !== 0 ||
        tasks.length !== 1 ||
        !task ||
        task.task_status_key !== "ready"
      ) {
        return { listed, task, completed: null };
      }
      const completed = await call("complete_task_action", {
        task_id: task.id,
        expected_version: task.version,
        idempotency_key: globalThis.crypto.randomUUID(),
        action_key: "complete",
        payload: { feedback: "浏览器验收确认生产排程" },
      });
      return { listed, task, completed };
    },
    { authorization, productionOrderID },
  );
}

async function selectOrder(page, orderNo) {
  let row = page.locator("tr").filter({ hasText: orderNo }).first();
  if (!(await row.isVisible().catch(() => false))) {
    await page.getByPlaceholder("搜索生产单号或备注").fill(orderNo);
    row = page.locator("tr").filter({ hasText: orderNo }).first();
  }
  await row.waitFor({ state: "visible", timeout: 15_000 });
  await row.click();
  return row;
}

export async function runProductionOrderBrowserE2E({
  baseURL,
  backendURL,
  password,
  pmcUsername = "demo_pmc",
  productionUsername = "demo_production",
  bossUsername = "demo_boss",
  noPermissionUsername = "demo_sales",
  superAdminUsername = "admin",
  customerKey,
  productCode,
  runKey = Date.now().toString(36),
}) {
  const frontend = localURL(baseURL, "baseURL");
  const backend = localURL(backendURL, "backendURL");
  if (!password || !customerKey || !productCode) {
    throw new Error("缺少本地验收账号密码、客户运行上下文或模拟产品编号");
  }
  const requireFromWeb = createRequire(path.join(repoRoot, "web/package.json"));
  const { chromium } = requireFromWeb("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    ({ runtimeCustomerKey }) => {
      window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({
        customerKey: runtimeCustomerKey,
      });
    },
    { runtimeCustomerKey: customerKey },
  );
  const page = await context.newPage();
  const blocking = [];
  page.on("console", (message) => {
    if (message.type() === "error") blocking.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => blocking.push(`pageerror:${error.message}`));
  await page.route("**/rpc/**", async (route) => {
    const url = new URL(route.request().url());
    url.protocol = backend.protocol;
    url.hostname = backend.hostname;
    url.port = backend.port;
    await route.continue({ url: url.toString() });
  });
  const lifecycleOrderNo = `MO-BROWSER-LIFECYCLE-${runKey}`;
  const cancelOrderNo = `MO-BROWSER-CANCEL-${runKey}`;
  const roleOrderNo = `MO-BROWSER-ROLE-${runKey}`;
  try {
    await login(page, frontend, pmcUsername, password);
    await openProductionOrders(page, frontend);
    const created = await createDraft(page, lifecycleOrderNo, productCode);

    const lifecycleRow = await selectOrder(page, lifecycleOrderNo);
    await lifecycleRow.dblclick();
    const editModal = page
      .locator(".ant-modal:visible")
      .filter({ hasText: "编辑生产订单" });
    await editModal.waitFor({ state: "visible" });
    const external = await externalSave(
      page,
      created.authorization,
      created.aggregate,
      "另一位处理人已保存的恢复态备注",
    );
    if (external.status !== 200 || external.body?.result?.code !== 0) {
      throw new Error("无法构造真实版本竞争");
    }
    await editModal
      .getByLabel("备注", { exact: true })
      .fill("当前页面保留的未提交草稿");
    await editModal.getByRole("button", { name: "保存草稿" }).click();
    await page
      .getByText("记录已被其他操作更新，请刷新后重试", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    if (
      (await editModal.getByLabel("备注", { exact: true }).inputValue()) !==
      "当前页面保留的未提交草稿"
    ) {
      throw new Error("版本冲突后页面草稿未保留");
    }
    await editModal
      .locator(".ant-modal-footer button:not(.ant-btn-primary)")
      .click();
    await page
      .getByRole("main")
      .getByRole("button", { name: "刷新当前页" })
      .click();
    await selectOrder(page, lifecycleOrderNo);
    await page
      .locator("tr")
      .filter({ hasText: lifecycleOrderNo })
      .first()
      .dblclick();
    const recoveredModal = page
      .locator(".ant-modal:visible")
      .filter({ hasText: "编辑生产订单" });
    const recoveredNote = recoveredModal.getByLabel("备注", { exact: true });
    await recoveredNote.waitFor({ state: "visible" });
    if (
      (await recoveredNote.inputValue()) !== "另一位处理人已保存的恢复态备注"
    ) {
      throw new Error("刷新后未恢复服务端最新生产订单内容");
    }
    await recoveredModal
      .locator(".ant-modal-footer button:not(.ant-btn-primary)")
      .click();

    await selectOrder(page, lifecycleOrderNo);
    const releaseButton = page.getByRole("button", {
      name: /^发\s*布$/u,
    });
    if (!(await releaseButton.count())) {
      const visibleButtons = await page
        .locator("button:visible")
        .allTextContents();
      throw new Error(
        `生产订单发布动作不可见 url=${page.url()} buttons=${visibleButtons.join("|")}`,
      );
    }
    await releaseButton.click();
    await page.getByRole("button", { name: "确认发布" }).click();
    await page
      .getByText("生产订单已发布，排程任务已进入 PMC 待办", {
        exact: true,
      })
      .waitFor({ state: "visible" });
    const scheduling = await completeProductionSchedulingTask(
      page,
      created.authorization,
      created.aggregate.production_order.id,
    );
    if (
      scheduling.completed?.status !== 200 ||
      scheduling.completed?.body?.result?.code !== 0 ||
      scheduling.completed?.body?.result?.data?.task?.task_status_key !== "done"
    ) {
      throw new Error(
        `生产排程任务未完成 list_code=${scheduling.listed?.body?.result?.code} complete_code=${scheduling.completed?.body?.result?.code}`,
      );
    }
    await selectOrder(page, lifecycleOrderNo);
    await page.getByRole("button", { name: /^关\s*闭$/u }).click();
    const closeModal = page
      .locator(".ant-modal:visible")
      .filter({ hasText: "关闭生产订单" });
    await closeModal.getByRole("button", { name: "确认关闭" }).click();
    await page
      .getByText("生产数量尚未全部完成，请填写短关闭原因", { exact: true })
      .waitFor({ state: "visible" });
    await closeModal
      .getByLabel("短关闭原因（未完成时必填）")
      .fill("客户调整本期生产计划，剩余数量不再生产");
    await closeModal.getByRole("button", { name: "确认关闭" }).click();
    await page
      .getByText("生产订单关闭成功", { exact: true })
      .waitFor({ state: "visible" });

    await createDraft(page, cancelOrderNo, productCode);
    await selectOrder(page, cancelOrderNo);
    await page.getByRole("button", { name: "取消订单" }).click();
    const cancelModal = page
      .locator(".ant-modal:visible")
      .filter({ hasText: "取消生产订单" });
    await cancelModal.getByRole("button", { name: "确认取消" }).click();
    await page
      .getByText("请填写取消原因", { exact: true })
      .waitFor({ state: "visible" });
    await cancelModal.getByLabel("取消原因").fill("客户取消本次生产需求");
    await cancelModal.getByRole("button", { name: "确认取消" }).click();
    await page
      .getByText("生产订单取消成功", { exact: true })
      .waitFor({ state: "visible" });

    await createDraft(page, roleOrderNo, productCode);
    await resetLogin(page);
    await login(page, frontend, productionUsername, password);
    await openProductionOrders(page, frontend);
    await page
      .getByText(roleOrderNo, { exact: true })
      .waitFor({ state: "visible" });
    if (await page.getByRole("button", { name: "新建生产订单" }).count()) {
      throw new Error("生产岗位不应看到新建生产订单动作");
    }
    await selectOrder(page, roleOrderNo);
    const productionEditButton = page
      .locator("button:visible")
      .filter({ hasText: /^编辑$/u });
    if (await productionEditButton.isDisabled()) {
      throw new Error("生产岗位应可编辑已有草稿");
    }

    await resetLogin(page);
    await login(page, frontend, bossUsername, password);
    await openProductionOrders(page, frontend);
    await selectOrder(page, roleOrderNo);
    const bossEditButton = page
      .locator("button:visible")
      .filter({ hasText: /^编辑$/u });
    if (!(await bossEditButton.isDisabled())) {
      throw new Error("老板只读角色不应编辑生产订单");
    }

    await resetLogin(page);
    await login(page, frontend, noPermissionUsername, password);
    await page.goto(new URL("/erp/production/orders", frontend).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    if (page.url().includes("/erp/production/orders")) {
      const heading = page.getByRole("heading", { name: "生产订单" });
      if (
        (await heading.count()) &&
        (await page.getByText(roleOrderNo, { exact: true }).count())
      ) {
        throw new Error("无权限角色直达生产订单后读取到了业务数据");
      }
    }

    await resetLogin(page);
    await login(page, frontend, superAdminUsername, password);
    await openProductionOrders(page, frontend);
    await page
      .getByText(roleOrderNo, { exact: true })
      .waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "新建生产订单" })
      .waitFor({ state: "visible" });

    if (blocking.length > 0) throw new Error(blocking.join("\n"));
  } finally {
    await browser.close();
  }
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  runProductionOrderBrowserE2E({
    baseURL: process.env.PRODUCTION_ORDER_E2E_BASE_URL,
    backendURL: process.env.PRODUCTION_ORDER_E2E_BACKEND_URL,
    password: process.env.PRODUCTION_ORDER_E2E_PASSWORD,
    pmcUsername: process.env.PRODUCTION_ORDER_E2E_PMC_USERNAME,
    productionUsername: process.env.PRODUCTION_ORDER_E2E_PRODUCTION_USERNAME,
    bossUsername: process.env.PRODUCTION_ORDER_E2E_BOSS_USERNAME,
    noPermissionUsername:
      process.env.PRODUCTION_ORDER_E2E_NO_PERMISSION_USERNAME,
    superAdminUsername: process.env.PRODUCTION_ORDER_E2E_SUPER_ADMIN_USERNAME,
    customerKey: process.env.PRODUCTION_ORDER_E2E_CUSTOMER_KEY,
    productCode: process.env.PRODUCTION_ORDER_E2E_PRODUCT_CODE,
    runKey: process.env.PRODUCTION_ORDER_E2E_RUN_KEY,
  })
    .then(() => console.log("production order real-backend browser e2e passed"))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
