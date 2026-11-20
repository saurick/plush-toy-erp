import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireValue, privateFile } from "./config.mjs";
import { atomicJSON, digest, now, privateDirectory } from "./storage.mjs";
import { command } from "./process.mjs";
import { quote, SSHSource } from "./transport.mjs";
import { bundleTime, checkBundle, gitlabIndex } from "./gitlab-sync.mjs";

export function parseGitlabManifest(text, bundle) {
  const fields = {};
  for (const line of text.trim().split("\n")) {
    const index = line.indexOf("="),
      key = line.slice(0, index),
      value = line.slice(index + 1);
    requireValue(
      index > 0 &&
        !Object.hasOwn(fields, key) &&
        /^[A-Za-z0-9._:/+-]+$/u.test(value),
      "invalid_gitlab_manifest",
    );
    fields[key] = value;
  }
  requireValue(
    Object.keys(fields).length === 8 &&
      fields.schemaVersion === "plush.gitlab-offsite-backup/v1" &&
      fields.status === "passed" &&
      fields.backupId === bundle.replace("backup-", "gitlab-"),
    "gitlab_manifest_identity_mismatch",
  );
  for (const kind of ["repository", "config"])
    requireValue(
      /^[a-f0-9]{64}$/u.test(fields[`${kind}Sha256`]) &&
        /^[1-9][0-9]*$/u.test(fields[`${kind}SizeBytes`]) &&
        Number.isSafeInteger(Number(fields[`${kind}SizeBytes`])),
      "invalid_gitlab_manifest_digest",
    );
  requireValue(
    Number.isFinite(Date.parse(fields.completedAt)),
    "invalid_gitlab_manifest_date",
  );
  return fields;
}
export function validateRuntime(value) {
  requireValue(
    value.schemaVersion === "plush.gitlab-backup-runtime/v1" &&
      /^gitlab\/gitlab-ce@sha256:[0-9a-f]{64}$/u.test(value.image) &&
      /^[0-9]+\.[0-9]+\.[0-9]+$/u.test(value.version) &&
      value.hostname === "gitlab.saurick.me",
    "invalid_gitlab_restore_runtime",
  );
  return value;
}
export async function verifyGitlab(
  c,
  root,
  state,
  { signal, run = command } = {},
) {
  const index = gitlabIndex(root, c.source.id);
  const name = Object.keys(index).sort(
    (a, b) => bundleTime(b) - bundleTime(a),
  )[0];
  requireValue(name, "gitlab_replica_missing");
  requireValue(
    Date.now() - bundleTime(name) <= c.maxSourceAgeHours * 3600_000,
    "source_backup_stale",
  );
  await checkBundle(root, name, index[name].files, signal);
  privateFile(c.restore.identityFile);
  const temporary = fs.mkdtempSync(
    path.join(privateDirectory(path.join(state, "restore-tmp")), "verify-"),
  );
  const ssh = new SSHSource(
    { ...c, source: { ...c.source, host: c.restore.host } },
    signal,
  ).args();
  ssh[ssh.length - 1] = "bash -s";
  let remote, remoteReceipt;
  const started = Date.now();
  try {
    const decrypt = async (file, output) =>
      run(
        [
          "age",
          "--decrypt",
          "--identity",
          c.restore.identityFile,
          "--output",
          output,
          path.join(root, name, file),
        ],
        { signal, timeout: c.restore.timeoutSeconds * 1000 },
      );
    await decrypt("manifest.env.age", path.join(temporary, "manifest.env"));
    const manifest = parseGitlabManifest(
      fs.readFileSync(path.join(temporary, "manifest.env"), "utf8"),
      name,
    );
    const space = fs.statfsSync(temporary);
    requireValue(
      space.bavail * space.bsize >=
        Number(manifest.repositorySizeBytes) +
          Number(manifest.configSizeBytes) +
          10 * 1024 ** 3,
      "restore_space_insufficient",
    );
    await decrypt(
      "checksums.sha256.age",
      path.join(temporary, "checksums.sha256"),
    );
    const expectedChecksum = `${manifest.repositorySha256}  repository.tar\n${manifest.configSha256}  config.tar.gz\n`;
    requireValue(
      fs.readFileSync(path.join(temporary, "checksums.sha256"), "utf8") ===
        expectedChecksum,
      "gitlab_checksum_manifest_mismatch",
    );
    for (const kind of ["repository", "config"]) {
      const file = kind === "repository" ? "repository.tar" : "config.tar.gz";
      await decrypt(file + ".age", path.join(temporary, file));
      requireValue(
        fs.statSync(path.join(temporary, file)).size ===
          Number(manifest[`${kind}SizeBytes`]) &&
          (await digest(path.join(temporary, file), signal)) ===
            manifest[`${kind}Sha256`],
        "decrypted_checksum_mismatch",
      );
    }
    const archiveList = fs.openSync(
      path.join(temporary, "archive-list.txt"),
      "wx",
      0o600,
    );
    try {
      await run(["tar", "-tf", path.join(temporary, "repository.tar")], {
        output: archiveList,
        signal,
        timeout: 120_000,
      });
    } finally {
      fs.closeSync(archiveList);
    }
    const runtime = validateRuntime(
      JSON.parse(
        (
          await run(
            [
              "tar",
              "-xOzf",
              path.join(temporary, "config.tar.gz"),
              "./plush-backup-runtime.json",
            ],
            { signal },
          )
        ).toString(),
      ),
    );
    remote = (
      await run(ssh, {
        input: `set -euo pipefail\numask 077\nbase=${quote(c.restore.directory)}\n[[ "$base" == /srv/raid5/gitlab/restore-drills ]]\n[[ ! -L "$base" ]]\ninstall -d -m 0700 "$base"\n[[ "$(realpath -e "$base")" == "$base" ]]\nroot=$(mktemp -d "$base/replica-XXXXXXXX")\nprintf '%s\\n' plush.gitlab-replica-drill/v1 > "$root/.plush-replica-drill"\nprintf '%s\\n' "$root"\n`,
        signal,
      })
    )
      .toString()
      .trim();
    requireValue(
      /^\/srv\/raid5\/gitlab\/restore-drills\/replica-[A-Za-z0-9]+$/u.test(
        remote,
      ),
      "invalid_restore_directory",
    );
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const uploads = [
      ["repository.tar", path.join(temporary, "repository.tar")],
      ["config.tar.gz", path.join(temporary, "config.tar.gz")],
      ["inventory.rb", path.join(directory, "gitlab-inventory.rb")],
    ];
    for (const [file, input] of uploads) {
      const args = ssh.slice(0, -1);
      const target = `${remote}/${file}`;
      args.push(
        `umask 077; test -f ${quote(remote + "/.plush-replica-drill")}; test ! -e ${quote(target)}; cat > ${quote(target + ".incoming")} && mv ${quote(target + ".incoming")} ${quote(target)}`,
      );
      await run(args, {
        inputFile: input,
        signal,
        timeout: c.transferTimeoutSeconds * 1000,
      });
    }
    const args = ssh.slice(0, -1);
    args.push(
      `timeout --signal=TERM --kill-after=90s ${Math.max(30, c.restore.timeoutSeconds - 120)} bash -s -- ${[remote, runtime.image, runtime.version, manifest.repositorySha256, manifest.configSha256].map(quote).join(" ")}`,
    );
    const output = await run(args, {
      input: fs.readFileSync(path.join(directory, "gitlab-restore.sh")),
      signal,
      timeout: c.restore.timeoutSeconds * 1000,
    });
    remoteReceipt = JSON.parse(output.toString());
    requireValue(
      remoteReceipt.status === "passed" &&
        remoteReceipt.version === runtime.version &&
        remoteReceipt.image === runtime.image &&
        remoteReceipt.cleanup === "container-and-plaintext-removed",
      "gitlab_restore_failed",
    );
    const result = {
      schemaVersion: "plush.gitlab-replica-restore/v1",
      status: "passed",
      checkedAt: now(),
      sourceId: c.source.id,
      destinationId: c.destination.id,
      volumeUUID: c.destination.volumeUUID,
      backupFile: name,
      repositorySha256: manifest.repositorySha256,
      configSha256: manifest.configSha256,
      version: runtime.version,
      image: runtime.image,
      restoreDurationSeconds: (Date.now() - started) / 1000,
      productionDatabaseWrites: false,
      scope: "full GitLab restore from decrypted external replica",
      inventory: remoteReceipt.inventory,
      cleanup: "temporary-container-and-local-remote-plaintext-removed",
    };
    fs.rmSync(temporary, { recursive: true });
    atomicJSON(path.join(state, "latest-restore.json"), result);
    return result;
  } catch (error) {
    if (remote) {
      const receiptFile = `${c.restore.directory}/receipts/${path.basename(remote)}.json`;
      try {
        const bytes = await run(ssh, {
          input: `test -f ${quote(receiptFile)} && cat ${quote(receiptFile)}\n`,
          timeout: 30_000,
        });
        const receipt = JSON.parse(bytes.toString());
        if (receipt.status === "failed" && /^[a-z_]+$/u.test(receipt.stage))
          error.stage = receipt.stage;
      } catch {
        /* Transport failure remains visible even when the remote receipt is unavailable. */
      }
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (remote && !remoteReceipt) {
      // An interrupted transport may leave only this operation's upload directory.
      // Preserve a running drill for its bounded server-side cleanup; never remove
      // mounted data underneath a container.
      await run(ssh, {
        input: `set -euo pipefail\nroot=${quote(remote)}\nif [[ -d "$root" && ! -L "$root" && "$(cat "$root/.plush-replica-drill")" == plush.gitlab-replica-drill/v1 ]]; then\n  name="plush-gitlab-$(basename "$root")"\n  if ! docker inspect "$name" >/dev/null 2>&1; then find "$root" -xdev -depth -delete; fi\nfi\n`,
        timeout: 30_000,
      }).catch(() => {});
    }
  }
}
