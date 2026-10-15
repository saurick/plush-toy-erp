const defaultAPIOrigin = "http://127.0.0.1:8300";

export function normalizeAPIOrigin(raw = defaultAPIOrigin) {
  const value = String(raw || "").trim();
  if (!value) {
    throw new Error("API_ORIGIN 不能为空");
  }
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API_ORIGIN 只允许 http 或 https");
  }
  if (url.username || url.password) {
    throw new Error("API_ORIGIN 不得包含账号或密码");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "API_ORIGIN 只允许协议、主机和端口，不得包含路径、查询或片段",
    );
  }
  return url.origin;
}

export function isLoopbackAPIOrigin(raw) {
  const { hostname: rawHostname } = new URL(normalizeAPIOrigin(raw));
  const hostname = rawHostname
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
    .toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::" ||
    hostname === "::1"
  ) {
    return true;
  }

  const ipv4 = hostname.split(".").map(Number);
  if (
    ipv4.length === 4 &&
    ipv4.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 255,
    )
  ) {
    return ipv4[0] === 127 || ipv4.every((part) => part === 0);
  }

  const mapped = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  return mapped ? (Number.parseInt(mapped[1], 16) >> 8) === 127 : false;
}

export function evaluateMigrationStatus(status) {
  const available = Array.isArray(status?.Available) ? status.Available : [];
  const applied = Array.isArray(status?.Applied) ? status.Applied : [];
  const latestVersion = String(available.at(-1)?.Version || "");
  const currentVersion = String(status?.Current || "");
  const pendingFiles = Math.max(available.length - applied.length, 0);
  const ok =
    status?.Status === "OK" &&
    available.length > 0 &&
    pendingFiles === 0 &&
    currentVersion === latestVersion &&
    String(status?.Next || "") === "Already at latest version";

  return {
    ok,
    currentVersion,
    latestVersion,
    appliedFiles: applied.length,
    availableFiles: available.length,
    pendingFiles,
  };
}

export { defaultAPIOrigin };
