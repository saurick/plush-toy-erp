import { assertSeedBusinessValues } from "./seed-business-values.mjs";

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

export async function manualAcceptanceFactRPCCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (domain !== "auth" && !/^(?:get_|list_|check_|explain_)/u.test(method)) {
    assertSeedBusinessValues(params, `${domain}.${method}`);
  }
  const request = {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `manual-acceptance-facts-${domain}-${method}`,
      method,
      params,
    }),
  };
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetchImpl(rpcURL(backendURL, domain), request);
    if (response.status !== 429 || attempt === 5) break;
    const retryAfterSeconds = Number(response.headers?.get?.("retry-after"));
    const fallbackMilliseconds = Math.min(2000, 250 * 2 ** attempt);
    const retryMilliseconds =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(5000, Math.max(100, retryAfterSeconds * 1000))
        : fallbackMilliseconds;
    await sleep(retryMilliseconds);
  }
  if (!response?.ok || response.redirected) {
    throw new CliError(
      `${domain}.${method} HTTP ${response?.status || "unavailable"}`,
    );
  }
  const payload = await response.json();
  if (payload?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${payload?.result?.code} message=${payload?.result?.message}`,
    );
  }
  return payload.result.data || {};
}

export function manualAcceptanceFactRole(domain, method, params = {}) {
  if (domain === "purchase") {
    return /purchase_return|receipt_adjustment/u.test(method)
      ? "admin"
      : "warehouse";
  }
  if (domain === "quality") return "quality";
  if (domain === "inventory") return "warehouse";
  if (
    domain === "operational_fact" &&
    ["create_shipment_with_items", "get_shipment", "ship_shipment"].includes(
      method,
    )
  )
    return "sales";
  if (domain === "production_wip") {
    if (params.action === "CONFIRM_PACKAGING_MATERIAL") return "sales";
    if (params.action === "RECEIVE_OUTSOURCING_RETURN") return "warehouse";
    return "production";
  }
  if (domain === "workflow") {
    if (method === "get_task_process_context") return "finance";
    const surfaceKey = String(
      params?.task_group || params?.payload?.surface_key || "",
    ).toLowerCase();
    if (
      surfaceKey.includes("shipment_release") ||
      surfaceKey.includes("shipment-release")
    )
      return "sales";
    if (
      surfaceKey.includes("shipment_finance_approval") ||
      surfaceKey.includes("shipment-finance-approval")
    ) {
      return "finance";
    }
    if (
      surfaceKey.includes("production_scheduling") ||
      surfaceKey.includes("production-scheduling")
    ) {
      return "pmc";
    }
    if (
      surfaceKey.includes("production_exception_decision_approval") ||
      surfaceKey.includes("production-exception-decision-approval") ||
      surfaceKey.includes("production-exception-approval")
    ) {
      return "boss";
    }
    if (
      surfaceKey.includes("production_exception") ||
      surfaceKey.includes("production-exception")
    ) {
      return "production";
    }
    return "warehouse";
  }
  if (domain === "customer_config") {
    if (method === "start_finished_goods_delivery_process") {
      return "sales";
    }
  }
  // This runner prepares one cross-domain acceptance dataset. Production orders
  // and Facts use the independently verified super admin so an existing editable
  // business-role selection is never overwritten just to manufacture fixtures.
  // Role-facing access remains a separate browser/readiness assertion.
  if (
    domain === "purchase_order" ||
    domain === "production_order" ||
    domain === "operational_fact"
  )
    return "admin";
  return "sales";
}
