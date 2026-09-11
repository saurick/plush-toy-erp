#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { getDeploymentTarget } from "./deployment-targets.mjs";

export function parseArgs(argv) {
  const options = { target: "", port: 23646, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--help") options.help = true;
    else if (argv[i] === "--target") options.target = argv[++i];
    else if (argv[i] === "--port") {
      const value = argv[++i] || "";
      if (!/^[1-9][0-9]{3,4}$/u.test(value))
        throw new Error("本机端口必须为 1024–65535");
      options.port = Number(value);
    } else throw new Error(`未知参数: ${argv[i]}`);
  }
  if (options.port < 1024 || options.port > 65535)
    throw new Error("本机端口必须为 1024–65535");
  if (!options.help) getDeploymentTarget(options.target);
  return options;
}

export function buildProbe(target) {
  const project = target.compose.projectName;
  // Values come from the validated fixed target registry, never shell input.
  return `set -eu
[ "$(hostname -s)" = '${target.ssh.expectedHostname}' ] || { echo '目标主机身份不符' >&2; exit 1; }
ids=$(docker ps --filter 'label=com.docker.compose.project=${project}' --filter 'label=com.docker.compose.service=attachment-store' --format '{{.ID}}')
[ "$(printf '%s\\n' "$ids" | awk 'NF {n++} END {print n+0}')" = 1 ] || { echo '附件存储尚未启动或容器不唯一' >&2; exit 1; }
[ "$(docker inspect --format '{{.State.Health.Status}}' "$ids")" = healthy ] || { echo '附件存储尚未就绪' >&2; exit 1; }
[ -z "$(docker port "$ids")" ] || { echo '附件存储不应发布宿主机端口' >&2; exit 1; }
status=$(docker exec "$ids" curl --silent --max-time 3 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:23646/)
[ "$status" = 307 ] || { echo '管理界面未开启或登录保护不符' >&2; exit 1; }
docker inspect --format '{{with index .NetworkSettings.Networks "${project}_attachment-private"}}{{.IPAddress}}{{end}}' "$ids"
`;
}

export function buildTunnel(options, runCommand = spawnSync) {
  const target = getDeploymentTarget(options.target);
  const common = [
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "ConnectTimeout=10",
    "-p",
    String(target.ssh.port),
  ];
  const destination = `${target.ssh.user}@${target.ssh.host}`;
  const result = runCommand("ssh", [...common, destination, "sh", "-s"], {
    input: buildProbe(target),
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      "无法核对目标存储界面；请确认该目标已部署、SSH 可用且管理界面要求登录",
    );
  const address = String(result.stdout || "").trim();
  if (isIP(address) !== 4) throw new Error("附件容器私有地址无效");
  return [
    ...common,
    "-o",
    "ExitOnForwardFailure=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-N",
    "-T",
    "-L",
    `127.0.0.1:${options.port}:${address}:23646`,
    destination,
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "用法: node scripts/deploy/attachment-console.mjs --target demo-133|customer-test-133 [--port 23646]\n仅建立本机 SSH 查看通道；Ctrl+C 关闭，不启动、部署或修改远端服务。",
    );
    return;
  }
  const args = buildTunnel(options);
  const child = spawn("ssh", args, { stdio: "inherit" });
  console.log(
    `查看地址: http://127.0.0.1:${options.port}（账号 viewer，密码取自该目标受控凭据；Ctrl+C 关闭）`,
  );
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0 || signal === "SIGTERM" || signal === "SIGINT")
          resolve();
        else
          reject(
            new Error("SSH 查看通道已退出；请检查连接及本机端口是否被占用"),
          );
      });
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
