import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export class ReplicaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function requireValue(condition, code) {
  if (!condition) throw new ReplicaError(code);
}
export function closed(value, keys, code) {
  requireValue(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify([...keys].sort()),
    code,
  );
}
export function absolute(value) {
  requireValue(
    typeof value === "string" &&
      path.isAbsolute(value) &&
      value !== "/" &&
      !/[\0\r\n]/u.test(value) &&
      !value.split("/").some((x) => x === "." || x === ".."),
    "invalid_absolute_path",
  );
  return value;
}
export function privateFile(file) {
  const stat = fs.lstatSync(file);
  requireValue(
    stat.isFile() &&
      stat.uid === process.getuid() &&
      [0o400, 0o600].includes(stat.mode & 0o777),
    "unsafe_private_file",
  );
  return file;
}
export function plainDirectory(directory) {
  requireValue(
    fs.statSync(directory).isDirectory() &&
      fs.realpathSync(directory) === directory,
    "unsafe_directory",
  );
  return directory;
}
export function loadConfig(file) {
  const c = JSON.parse(fs.readFileSync(privateFile(file), "utf8"));
  const gitlab = c.source?.kind === "gitlab";
  closed(
    c,
    [
      "schemaVersion",
      "source",
      "destination",
      "stateDirectory",
      ...(gitlab ? ["retentionCount", "minimumFreeBytes"] : ["retentionDays"]),
      "maxSourceAgeHours",
      "transferTimeoutSeconds",
      "restore",
      "schedule",
    ],
    "invalid_config_fields",
  );
  requireValue(c.schemaVersion === "plush.backup-replica/v1", "invalid_schema");
  closed(
    c.source,
    ["id", "transport", "host", "directory", ...(gitlab ? ["kind"] : [])],
    "invalid_source_fields",
  );
  requireValue(c.source.transport === "ssh-directory", "unsupported_transport");
  requireValue(
    typeof c.source.host === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(c.source.host),
    "invalid_ssh_alias",
  );
  absolute(c.source.directory);
  closed(
    c.destination,
    ["id", "volumeUUID", "relativeDirectory"],
    "invalid_destination_fields",
  );
  requireValue(
    typeof c.destination.volumeUUID === "string" &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(
        c.destination.volumeUUID,
      ),
    "invalid_volume_uuid",
  );
  const relative = c.destination.relativeDirectory;
  requireValue(
    typeof relative === "string" &&
      relative &&
      !path.isAbsolute(relative) &&
      !/[\0\r\n]/u.test(relative) &&
      !relative.split("/").some((x) => ["", ".", ".."].includes(x)),
    "invalid_relative_directory",
  );
  for (const id of [c.source.id, c.destination.id])
    requireValue(
      typeof id === "string" && /^[a-z0-9][a-z0-9._-]{2,63}$/u.test(id),
      "invalid_identity",
    );
  absolute(c.stateDirectory);
  for (const [name, min, max] of [
    ...(gitlab
      ? [
          ["retentionCount", 2, 31],
          ["minimumFreeBytes", 1024 ** 3, 1024 ** 4],
        ]
      : [["retentionDays", 35, 366]]),
    ["maxSourceAgeHours", 1, 168],
    ["transferTimeoutSeconds", 30, 14400],
  ]) {
    requireValue(
      Number.isInteger(c[name]) && c[name] >= min && c[name] <= max,
      `invalid_${name}`,
    );
  }
  closed(
    c.restore,
    [
      "identityFile",
      ...(gitlab ? ["host", "directory"] : ["postgresImage"]),
      "everyDays",
      "timeoutSeconds",
    ],
    "invalid_restore_fields",
  );
  absolute(c.restore.identityFile);
  requireValue(
    Number.isInteger(c.restore.timeoutSeconds) &&
      c.restore.timeoutSeconds >= 60 &&
      c.restore.timeoutSeconds <= (gitlab ? 14400 : 5400),
    "invalid_restore_timeout",
  );
  if (gitlab) {
    requireValue(
      typeof c.restore.host === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(c.restore.host),
      "invalid_restore_host",
    );
    requireValue(
      c.restore.directory === "/srv/raid5/gitlab/restore-drills",
      "invalid_restore_directory",
    );
  } else
    requireValue(
      c.restore.postgresImage === "postgres:18.6",
      "unsupported_postgres_image",
    );
  requireValue(
    Number.isInteger(c.restore.everyDays) &&
      c.restore.everyDays >= 1 &&
      c.restore.everyDays <= 35,
    "invalid_restore_frequency",
  );
  closed(c.schedule, ["hour", "minute"], "invalid_schedule_fields");
  for (const [key, max] of [
    ["hour", 23],
    ["minute", 59],
  ])
    requireValue(
      Number.isInteger(c.schedule[key]) &&
        c.schedule[key] >= 0 &&
        c.schedule[key] <= max,
      "invalid_schedule",
    );
  return c;
}
export function resolveVolume(c, infoProvider) {
  let info;
  try {
    if (infoProvider) info = infoProvider(c.destination.volumeUUID);
    else {
      const plist = execFileSync(
        "/usr/sbin/diskutil",
        ["info", "-plist", c.destination.volumeUUID],
        { timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] },
      );
      info = JSON.parse(
        execFileSync(
          "/usr/bin/plutil",
          ["-convert", "json", "-o", "-", "--", "-"],
          { input: plist, timeout: 15_000 },
        ),
      );
    }
  } catch {
    throw new ReplicaError("volume_not_mounted");
  }
  requireValue(
    info.VolumeUUID?.toUpperCase() === c.destination.volumeUUID.toUpperCase(),
    "volume_identity_mismatch",
  );
  requireValue(
    info.Internal === false && info.Writable === true,
    "volume_not_external_writable",
  );
  requireValue(
    typeof info.MountPoint === "string" &&
      info.MountPoint.startsWith("/Volumes/"),
    "volume_not_mounted",
  );
  const mount = plainDirectory(info.MountPoint);
  requireValue(
    fs.statSync(mount).dev !== fs.statSync(path.dirname(mount)).dev,
    "volume_not_mounted",
  );
  return mount;
}
