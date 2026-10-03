import os from "node:os";

import { getDeploymentTarget } from "./deployment-targets.mjs";

export function readLocalTargetIdentity() {
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    addresses: Object.values(os.networkInterfaces())
      .flat()
      .filter((network) => network?.family === "IPv4")
      .map((network) => network.address),
  };
}

// Only a registered deployment host can run its fixed read-only script locally.
// Remote clients retain the pinned SSH connection; failed SSH never falls back.
export function resolveTargetReadOnlyExecution(
  targetKey,
  { localIdentity = readLocalTargetIdentity() } = {},
) {
  const target = getDeploymentTarget(targetKey);
  const local =
    localIdentity.platform === "linux" &&
    localIdentity.hostname === target.ssh.expectedHostname &&
    localIdentity.username === target.ssh.user &&
    localIdentity.addresses.includes(target.ssh.host);
  return {
    target,
    transport: local ? "local execution" : "SSH",
    command: local ? "bash" : "ssh",
    args: local
      ? ["-s"]
      : [
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=8",
          "-o",
          "StrictHostKeyChecking=yes",
          "-p",
          String(target.ssh.port),
          `${target.ssh.user}@${target.ssh.host}`,
          "bash",
          "-s",
        ],
  };
}
