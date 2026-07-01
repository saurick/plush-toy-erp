import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const trialRoles = Object.freeze([
  ["boss", "demo_boss", "mobile.boss.access", "/m/boss/tasks"],
  ["sales", "demo_sales", "mobile.sales.access", "/m/sales/tasks"],
  ["purchase", "demo_purchase", "mobile.purchase.access", "/m/purchase/tasks"],
  ["production", "demo_production", "mobile.production.access", "/m/production/tasks"],
  ["warehouse", "demo_warehouse", "mobile.warehouse.access", "/m/warehouse/tasks"],
  ["quality", "demo_quality", "mobile.quality.access", "/m/quality/tasks"],
  ["finance", "demo_finance", "mobile.finance.access", "/m/finance/tasks"],
  ["pmc", "demo_pmc", "mobile.pmc.access", "/m/pmc/tasks"],
  ["engineering", "demo_engineering", "mobile.engineering.access", "/m/engineering/tasks"],
]);

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, token, context) {
  assert(
    source.includes(token),
    `${context} must include ${token}`,
  );
}

test("trial role docs cover all current role demo accounts and mobile task paths", () => {
  const scriptReadme = read("scripts/README.md");
  const webReadme = read("web/README.md");
  const serverConfigDoc = read("server/docs/config.md");
  const testStrategyDoc = read("docs/product/自动化测试策略.md");
  const fastQa = read("scripts/qa/fast.sh");
  const strictQa = read("scripts/qa/strict.sh");
  const trialAccountAuditTest = read("scripts/qa/trial-account-rbac.test.mjs");
  const trialBrowserSmokeTest = read("web/scripts/trialDemoAccountBrowserSmoke.test.mjs");
  const trialAccountAudit = read("scripts/qa/trial-account-rbac.mjs");
  const trialBrowserSmoke = read("web/scripts/trialDemoAccountBrowserSmoke.mjs");
  const seedSource = read("server/internal/data/admin_role_demo_seed.go");
  const rbacSource = read("server/internal/biz/rbac.go");

  for (const [roleKey, username, permissionKey, mobilePath] of trialRoles) {
    assertIncludes(seedSource, username, "admin role demo seed");
    assertIncludes(trialAccountAudit, username, "trial account RBAC audit");
    assertIncludes(trialAccountAudit, roleKey, "trial account RBAC audit");
    assertIncludes(rbacSource, permissionKey, "RBAC permission registry");

    assertIncludes(scriptReadme, username, "scripts README role demo account table");
    assertIncludes(scriptReadme, roleKey, "scripts README role demo account table");
    assertIncludes(serverConfigDoc, username, "server config role demo account docs");
    assertIncludes(webReadme, mobilePath, "web README single-port mobile task entry list");
    assertIncludes(trialBrowserSmoke, `username: '${username}'`, "trial browser smoke desktop accounts");
    assertIncludes(
      trialBrowserSmoke,
      `['${username}', '${roleKey}']`,
      "trial browser smoke mobile accounts",
    );
  }

  const rootReadme = read("README.md");
  assertIncludes(rootReadme, "/m/<role>/tasks", "root README mobile task route contract");
  assertIncludes(rootReadme, "pnpm start:mobile:engineering", "root README mobile debug commands");
  assertIncludes(rootReadme, "工程岗位任务端", "root README mobile debug port matrix");

  assertIncludes(scriptReadme, "demo_admin", "scripts README role demo account table");
  assertIncludes(serverConfigDoc, "demo_admin", "server config role demo account docs");
  assertIncludes(seedSource, "demo_admin", "admin role demo seed");
  assertIncludes(trialAccountAudit, "demo_admin", "trial account RBAC audit");
  assertIncludes(
    trialAccountAudit,
    "backend URL must not contain username or password",
    "trial account RBAC audit credentialed backend URL guard",
  );
  assertIncludes(
    trialAccountAudit,
    "--print-input-template",
    "trial account RBAC audit input template mode",
  );
  assertIncludes(
    trialAccountAudit,
    "writesDatabase: false",
    "trial account RBAC audit input template no-write boundary",
  );
  assertIncludes(
    trialAccountAudit,
    "writesReport: false",
    "trial account RBAC audit input template no-report boundary",
  );
  assertIncludes(
    trialAccountAudit,
    "buildVerificationReport",
    "trial account RBAC audit sanitized report builder",
  );
  assertIncludes(trialBrowserSmoke, "username: 'demo_admin'", "trial browser smoke admin account");
  assertIncludes(trialBrowserSmoke, "expectSuccess: false", "trial browser smoke admin denial");
  assertIncludes(trialBrowserSmoke, "forbiddenMenus", "trial browser smoke forbidden menu assertions");
  assertIncludes(trialBrowserSmoke, "'权限管理'", "trial browser smoke non-admin forbidden menus");
  assertIncludes(trialBrowserSmoke, "'工作台'", "trial browser smoke admin forbidden business menus");
  assertIncludes(trialBrowserSmoke, "不应看到菜单", "trial browser smoke forbidden menu assertion message");
  assertIncludes(
    trialBrowserSmoke,
    "URL must not contain username or password",
    "trial browser smoke credentialed URL guard",
  );
  assertIncludes(
    trialBrowserSmoke,
    "--print-input-template",
    "trial browser smoke input template mode",
  );
  assertIncludes(
    trialBrowserSmoke,
    "startsBrowser: false",
    "trial browser smoke input template browser boundary",
  );
  assertIncludes(
    trialBrowserSmoke,
    "startsDevServer: false",
    "trial browser smoke input template dev server boundary",
  );
  assertIncludes(
    trialBrowserSmoke,
    "readsCustomerConfigScript: false",
    "trial browser smoke input template customer config script boundary",
  );
  assertIncludes(
    trialBrowserSmoke,
    "该账号暂无当前入口权限，请联系管理员。",
    "trial browser smoke admin denial",
  );
  assertIncludes(
    scriptReadme,
    "高频快速检查，包含多甲方角色能力优先级审计、正式前端客户配置投影边界、角色菜单 / seedData 配置合同、开发入口配置合同、试用账号 RBAC 单测 / 浏览器 smoke 输入模板边界测试",
    "scripts README fast QA summary",
  );
  assertIncludes(
    scriptReadme,
    "严格检查，包含多甲方角色能力优先级审计、正式前端客户配置投影边界、角色菜单 / seedData 配置合同、开发入口配置合同、试用账号 RBAC 单测 / 浏览器 smoke 输入模板边界测试",
    "scripts README strict QA summary",
  );
  assertIncludes(
    scriptReadme,
    "无后端单测锁住试用账号 RBAC 检查脚本必须拒绝多角色、多 mobile 权限、admin mobile 泄漏、debug 权限、super admin 和 disabled 账号",
    "scripts README trial account RBAC test entry",
  );
  assertIncludes(
    scriptReadme,
    "非 admin 不应看到权限管理，`demo_admin` 不应看到业务主入口",
    "scripts README trial browser forbidden menu scope",
  );
  assertIncludes(
    scriptReadme,
    "--report output/trial-account-rbac/report.json",
    "scripts README trial account RBAC sanitized report command",
  );
  assertIncludes(
    scriptReadme,
    "不保存密码、access token 或 Authorization header",
    "scripts README trial account RBAC report redaction boundary",
  );
  assertIncludes(
    scriptReadme,
    "试用账号真实 RBAC 无后端边界单测、RBAC / 浏览器 smoke 脚本语法检查、真实登录 smoke 共享 URL 边界单测；不触发真实登录",
    "scripts README fast QA detail",
  );
  assertIncludes(
    fastQa,
    "realLoginSmokeShared.test.mjs",
    "fast QA real login smoke shared URL guard",
  );
  assertIncludes(
    strictQa,
    "realLoginSmokeShared.test.mjs",
    "strict QA real login smoke shared URL guard",
  );
  assertIncludes(
    testStrategyDoc,
    "它只证明本地 RBAC 检查形状、输入模板 / preflight no-write 边界、静态角色投影和入口脚本语法未损坏",
    "automation test strategy trial account syntax guard",
  );
  assertIncludes(
    testStrategyDoc,
    "不执行真实登录、不调用本地后端",
    "automation test strategy trial account syntax guard",
  );
  assertIncludes(
    testStrategyDoc,
    "同样包含上述无凭据单测和脚本语法守卫",
    "automation test strategy trial account real smoke boundary",
  );
  assertIncludes(
    testStrategyDoc,
    "仍需在本地后端与演示账号密码可用时单独运行",
    "automation test strategy trial account real smoke boundary",
  );
  assertIncludes(
    testStrategyDoc,
    "只打印所需环境变量、账号清单、可选报告路径和真实核对命令",
    "automation test strategy trial account input template boundary",
  );
  assertIncludes(
    testStrategyDoc,
    "不读密码、不登录、不调用后端、不启动浏览器、不启动 Vite、不读取客户配置脚本、不写报告、不写数据库",
    "automation test strategy trial account input template no-write boundary",
  );
  assertIncludes(
    testStrategyDoc,
    "trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json",
    "automation test strategy trial account browser preflight command",
  );
  assertIncludes(
    testStrategyDoc,
    "不读密码、不登录、不调用 JSON-RPC、不启动浏览器、不启动 Vite、不读取客户配置脚本、不创建任务、不写数据库",
    "automation test strategy trial account browser preflight no-write boundary",
  );
  assertIncludes(
    scriptReadme,
    "如果还没有本地演示账号密码，先打印输入模板",
    "scripts README trial account input template",
  );
  assertIncludes(
    scriptReadme,
    "trialDemoAccountBrowserSmoke.mjs --print-input-template",
    "scripts README trial browser input template",
  );
  for (const [scriptSource, context] of [
    [fastQa, "qa fast trial account syntax check"],
    [strictQa, "qa strict trial account syntax check"],
  ]) {
    assertIncludes(scriptSource, "trial-account-rbac.test.mjs", context);
    assertIncludes(scriptSource, "trialDemoAccountBrowserSmoke.test.mjs", context);
    assertIncludes(scriptSource, "trial-account-rbac.mjs", context);
    assertIncludes(scriptSource, "trialDemoAccountBrowserSmoke.mjs", context);
    assertIncludes(scriptSource, "node --check", context);
  }
  assertIncludes(trialAccountAuditTest, "expected single role", "trial account RBAC unit test");
  assertIncludes(trialAccountAuditTest, "expected single mobile permission", "trial account RBAC unit test");
  assertIncludes(trialAccountAuditTest, "unexpected debug permissions", "trial account RBAC unit test");
  assertIncludes(trialBrowserSmokeTest, "CLI input template is no-write", "trial browser smoke unit test");
  assertIncludes(trialBrowserSmokeTest, "CLI preflight writes sanitized report", "trial browser smoke unit test");
  assertIncludes(trialBrowserSmokeTest, "startsDevServer", "trial browser smoke unit test");
});
