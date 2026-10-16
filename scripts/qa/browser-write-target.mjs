import { createHash } from "node:crypto";
import { classifyDatabaseName } from "./database-target.mjs";

export function browserWriteOrigin(value) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "browser write target must be loopback HTTP(S) without credentials",
    );
  }
  return url.origin;
}

export async function verifyDatabaseRuntimeIdentity(
  { backendURL, databaseName },
  fetchImpl = fetch,
) {
  const origin = browserWriteOrigin(backendURL);
  const target = classifyDatabaseName(databaseName);
  if (!target.disposable && target.profile !== "development") {
    throw new Error(
      "browser writes require an explicit development or disposable database name",
    );
  }
  const response = await fetchImpl(
    new URL("/readyz/runtime-identity", origin),
    {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        Accept: "text/plain",
        "X-ERP-Runtime-Identity-Scope": "database-v1",
        "X-ERP-Expected-Runtime-Identity-SHA256": createHash("sha256")
          .update(`database-v1\n${databaseName}`)
          .digest("hex"),
      },
    },
  );
  if (
    !response.ok ||
    response.redirected ||
    response.headers.get("X-ERP-Runtime-Identity-Proof") !== "matched-v1" ||
    String(await response.text()).trim() !== "runtime identity matched"
  ) {
    throw new Error("browser write database runtime identity mismatch");
  }
  return { databaseName, proof: "matched-v1", scope: "database-v1" };
}

export function browserRPCURL(backendURL, requestURL) {
  const request = new URL(requestURL);
  return new URL(
    request.pathname + request.search,
    browserWriteOrigin(backendURL),
  ).toString();
}

// Route the browser's writes to the verified backend, independent of a frontend proxy.
export async function bindBrowserWriteBackend(context, backendURL) {
  const origin = browserWriteOrigin(backendURL);
  await context.route("**/rpc/**", async (route) => {
    const response = await route.fetch({
      url: browserRPCURL(origin, route.request().url()),
      maxRedirects: 0,
    });
    if (response.status() >= 300 && response.status() < 400) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ response });
  });
}
