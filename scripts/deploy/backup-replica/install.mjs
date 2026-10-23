import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { command } from "./process.mjs";
import { privateFile, requireValue } from "./config.mjs";
import { atomicBytes, atomicJSON, now, privateDirectory } from "./storage.mjs";
import { requireCompatibleNode } from "./runtime.mjs";

export function requireIdleAgent(status) {
  requireValue(
    !/^\s*(?:pid = [1-9][0-9]*|state = running)\s*$/mu.test(status),
    "backup_job_running",
  );
}
export function agentValue(c, configFile, release, logs) {
  return {
    Label: `me.saurick.plush-backup-replica.${c.destination.id}`,
    ProgramArguments: [
      process.execPath,
      path.join(release, "cli.mjs"),
      "run",
      "--config",
      configFile,
    ],
    RunAtLoad: true,
    StartOnMount: true,
    StartCalendarInterval: { Hour: c.schedule.hour, Minute: c.schedule.minute },
    ProcessType: "Background",
    LowPriorityIO: true,
    Nice: 10,
    ThrottleInterval: 300,
    EnvironmentVariables: {
      PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      GIT_OPTIONAL_LOCKS: "0",
    },
    StandardOutPath: path.join(logs, "replica.stdout.log"),
    StandardErrorPath: path.join(logs, "replica.stderr.log"),
  };
}
// Preparation runs under the same kernel lock as sync / restore. Bootstrap
// follows after releasing it so RunAtLoad can acquire the lock itself.
export async function prepareInstallation(
  c,
  configFile,
  state,
  { signal } = {},
) {
  requireValue(process.platform === "darwin", "launchd_requires_macos");
  const directory = path.dirname(fileURLToPath(import.meta.url)),
    repository = path.resolve(directory, "../../..");
  const sha = (
    await command(["git", "-C", repository, "rev-parse", "HEAD"], {
      signal,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    })
  )
    .toString()
    .trim();
  const nodeMinimum = fs
    .readFileSync(path.join(repository, ".n-node-version"), "utf8")
    .trim();
  requireCompatibleNode(nodeMinimum);
  const files = fs
    .readdirSync(directory)
    .filter((name) => /\.(?:mjs|sh|rb)$/u.test(name))
    .sort();
  const hash = createHash("sha256");
  const contents = new Map();
  let committedSource = true;
  for (const name of files) {
    const content = fs.readFileSync(path.join(directory, name));
    contents.set(name, content);
    try {
      const committed = await command(
        [
          "git",
          "-C",
          repository,
          "show",
          `${sha}:${path.relative(repository, path.join(directory, name))}`,
        ],
        { signal, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } },
      );
      if (!committed.equals(content)) committedSource = false;
    } catch (error) {
      if (error.code !== "command_failed") throw error;
      committedSource = false;
    }
    hash.update(name + "\0");
    hash.update(content);
  }
  const identity = hash.digest("hex"),
    releases = privateDirectory(
      path.join(path.dirname(state), "runtime/releases"),
    );
  const release = path.join(releases, identity.slice(0, 16));
  if (!fs.existsSync(release)) {
    privateDirectory(release);
    for (const name of files)
      atomicBytes(path.join(release, name), contents.get(name));
    atomicJSON(path.join(release, "artifact.json"), {
      gitSha: sha,
      sha256: identity,
      nodeVersion: `v${nodeMinimum}`,
      sourceState: committedSource ? "committed" : "content-snapshot",
      files,
    });
  }
  for (const name of files)
    requireValue(
      fs.readFileSync(path.join(release, name)).equals(contents.get(name)),
      "runtime_artifact_drift",
    );
  const agents = path.join(os.homedir(), "Library/LaunchAgents");
  fs.mkdirSync(agents, { recursive: true });
  requireValue(
    fs.realpathSync(agents) === agents &&
      fs.statSync(agents).uid === process.getuid(),
    "unsafe_launchagents",
  );
  const logs = privateDirectory(path.join(path.dirname(state), "logs"));
  const value = agentValue(c, configFile, release, logs),
    plist = path.join(agents, value.Label + ".plist"),
    domain = `gui/${process.getuid()}`;
  let oldBytes = null,
    oldLoaded = false;
  if (fs.existsSync(plist)) {
    oldBytes = fs.readFileSync(privateFile(plist));
    const old = JSON.parse(
      (
        await command(["plutil", "-convert", "json", "-o", "-", "--", "-"], {
          input: oldBytes,
          signal,
        })
      ).toString(),
    );
    requireValue(
      old.Label === value.Label &&
        old.ProgramArguments?.some(
          (x) => typeof x === "string" && x.startsWith(releases + "/"),
        ),
      "foreign_launchagent",
    );
    try {
      const status = await command(
        ["launchctl", "print", `${domain}/${value.Label}`],
        { signal },
      );
      requireIdleAgent(status.toString());
      oldLoaded = true;
    } catch (error) {
      if (error.code !== "command_failed") throw error;
    }
    if (oldLoaded)
      await command(["launchctl", "bootout", domain, plist], { signal });
  }
  const xml = await command(
    ["plutil", "-convert", "xml1", "-o", "-", "--", "-"],
    { input: JSON.stringify(value), signal },
  );
  atomicBytes(plist, xml);
  await command(["plutil", "-lint", plist], { signal });
  return {
    status: "prepared",
    plist,
    domain,
    label: value.Label,
    oldBytes: oldBytes?.toString("base64"),
    oldLoaded,
    receipt: {
      status: "passed",
      installedAt: now(),
      sourceCommit: committedSource ? sha : undefined,
      baseCommit: sha,
      sourceState: committedSource ? "committed" : "content-snapshot",
      runtimeSha256: identity,
      runtimeDirectory: release,
      nodeVersion: process.version,
      schedule: c.schedule,
      scheduleTimezone: "local macOS timezone",
      runAtLogin: true,
      runOnMount: true,
      wakeComputer: false,
      destinationId: c.destination.id,
      label: value.Label,
    },
  };
}
export async function finishInstallation(plan, state, { signal } = {}) {
  try {
    await command(["launchctl", "bootstrap", plan.domain, plan.plist], {
      signal,
    });
    await command(["launchctl", "print", `${plan.domain}/${plan.label}`], {
      signal,
    });
  } catch (error) {
    if (plan.oldBytes) {
      try {
        await command(["launchctl", "bootout", plan.domain, plan.plist]);
      } catch {
        /* The new trigger may not have loaded. */
      }
      atomicBytes(plan.plist, Buffer.from(plan.oldBytes, "base64"));
      if (plan.oldLoaded)
        await command(["launchctl", "bootstrap", plan.domain, plan.plist]);
    }
    throw error;
  }
  atomicJSON(path.join(state, "installation.json"), plan.receipt);
  return plan.receipt;
}
