import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const portKeys = Object.freeze([
  "DEV_WEB_PORT",
  "DEV_HTTP_PORT",
  "DEV_GRPC_PORT",
  "DEV_STYLE_PORT",
  "DEV_AUX_PORT_START",
]);
const auxPortRangeSize = 100;

function auxPortBounds(devPorts) {
  const start = Number(devPorts?.auxStart);
  if (!Number.isInteger(start) || start < 1024 || start > 65535) {
    throw new Error("development port bundle has an invalid auxStart");
  }
  return { start, end: start + auxPortRangeSize - 1 };
}

export function validateDevAuxPort(
  devPorts,
  rawPort,
  label = "development auxiliary port",
) {
  const port = Number(rawPort);
  const bounds = auxPortBounds(devPorts);
  if (!Number.isInteger(port) || port < bounds.start || port > bounds.end) {
    throw new Error(
      `${label} must be inside ${bounds.start}-${bounds.end}; received ${rawPort}`,
    );
  }
  return port;
}

export function resolveDevAuxPort(
  devPorts,
  offset,
  label = "development auxiliary port offset",
) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= auxPortRangeSize) {
    throw new Error(`${label} must be an integer between 0 and 99`);
  }
  const bounds = auxPortBounds(devPorts);
  return validateDevAuxPort(devPorts, bounds.start + offset, label);
}

function isWildcardPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE" || error?.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host: "0.0.0.0", port, exclusive: true }, () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  });
}

export async function findAvailableDevAuxPort(
  devPorts,
  {
    startOffset = 0,
    endOffset = auxPortRangeSize - 1,
    isPortAvailable = isWildcardPortAvailable,
  } = {},
) {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset >= auxPortRangeSize ||
    startOffset > endOffset
  ) {
    throw new Error("auxiliary port scan offsets must stay inside 0-99");
  }
  if (typeof isPortAvailable !== "function") {
    throw new Error("isPortAvailable must be a function");
  }

  for (let offset = startOffset; offset <= endOffset; offset += 1) {
    const port = resolveDevAuxPort(devPorts, offset);
    if (await isPortAvailable(port)) return port;
  }

  const bounds = auxPortBounds(devPorts);
  throw new Error(
    `no available development auxiliary port inside ${bounds.start + startOffset}-${bounds.start + endOffset}`,
  );
}

function parseEnvFile(filePath) {
  const values = {};
  const source = readFileSync(filePath, "utf8");

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) {
      throw new Error(`${filePath}:${index + 1}: expected KEY=value`);
    }
    const [, key, rawValue] = match;
    if (Object.hasOwn(values, key)) {
      throw new Error(`${filePath}:${index + 1}: duplicate key ${key}`);
    }
    values[key] = rawValue.trim();
  }

  return values;
}

function parsePort(key, value, sourceLabel) {
  if (!/^\d+$/u.test(String(value || ""))) {
    throw new Error(`${sourceLabel}: ${key} must be an integer port`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${sourceLabel}: ${key} must be between 1024 and 65535`);
  }
  return port;
}

export function loadDevPorts(projectRoot, env = process.env) {
  const manifestPath = path.join(projectRoot, "config", "dev-ports.env");
  const localPath = path.join(projectRoot, "config", "dev-ports.local.env");
  if (!existsSync(manifestPath)) {
    throw new Error(`development port manifest is missing: ${manifestPath}`);
  }

  const base = parseEnvFile(manifestPath);
  const local = existsSync(localPath) ? parseEnvFile(localPath) : {};
  if (Object.keys(local).length > 0) {
    const missing = portKeys.filter((key) => !Object.hasOwn(local, key));
    if (missing.length > 0) {
      throw new Error(
        `${localPath}: local override must contain the complete port bundle; missing ${missing.join(", ")}`,
      );
    }
  }

  const merged = { ...base, ...local };
  for (const key of ["DEV_PROJECT_ID", ...portKeys]) {
    const override = String(env[key] || "").trim();
    if (override) merged[key] = override;
  }

  const projectId = String(merged.DEV_PROJECT_ID || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(projectId)) {
    throw new Error(`${manifestPath}: invalid DEV_PROJECT_ID`);
  }

  const parsed = Object.fromEntries(
    portKeys.map((key) => [key, parsePort(key, merged[key], manifestPath)]),
  );
  const reservations = [];
  for (const [key, port] of Object.entries(parsed)) {
    const end =
      key === "DEV_AUX_PORT_START" ? port + auxPortRangeSize - 1 : port;
    if (end > 65535) {
      throw new Error(
        `${manifestPath}: ${key} must reserve a complete ${auxPortRangeSize}-port range`,
      );
    }
    const current = { key, start: port, end };
    const previous = reservations.find(
      (reservation) =>
        current.start <= reservation.end && reservation.start <= current.end,
    );
    if (previous) {
      throw new Error(
        `${manifestPath}: ${key} range ${current.start}-${current.end} overlaps ${previous.key} range ${previous.start}-${previous.end}`,
      );
    }
    reservations.push(current);
  }

  return Object.freeze({
    projectId,
    web: parsed.DEV_WEB_PORT,
    http: parsed.DEV_HTTP_PORT,
    grpc: parsed.DEV_GRPC_PORT,
    style: parsed.DEV_STYLE_PORT,
    auxStart: parsed.DEV_AUX_PORT_START,
    manifestPath,
    localPath: existsSync(localPath) ? localPath : "",
  });
}

function parseCLIArgs(argv) {
  const options = {
    command: "check",
    projectRoot: path.resolve(import.meta.dirname, ".."),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.command = "check";
      continue;
    }
    if (arg === "--find-free-aux-port") {
      options.command = "find-free-aux-port";
      continue;
    }
    if (arg === "--project-root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--project-root requires a path value");
      }
      options.projectRoot = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function runCLI(argv) {
  const options = parseCLIArgs(argv);
  const ports = loadDevPorts(options.projectRoot);
  if (options.command === "find-free-aux-port") {
    const port = await findAvailableDevAuxPort(ports);
    process.stdout.write(`${port}\n`);
    return;
  }
  process.stdout.write(
    `[dev-ports] ${ports.projectId}: web=${ports.web} http=${ports.http} grpc=${ports.grpc} style=${ports.style} aux-start=${ports.auxStart}\n`,
  );
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  runCLI(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`[dev-ports] ${error.message}\n`);
    process.exit(1);
  });
}
