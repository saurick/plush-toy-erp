import fs from "node:fs";
import { command } from "./process.mjs";
import { requireValue } from "./config.mjs";

export const databaseFile =
  /^plush_erp-([0-9]{8}T[0-9]{6}Z)-[0-9]+\.dump\.age$/u;
export const encryptedFile = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.age$/u;
export const quote = (value) =>
  "'" + String(value).replaceAll("'", "'\\''") + "'";
export function prelude(c) {
  return `set -eu\nroot=${quote(c.source.directory)}\nsource_id=${quote(c.source.id)}
[ -d "$root" ] && [ ! -L "$root" ] && [ "$(realpath -e -- "$root")" = "$root" ]
marker="$root/.plush-backup-source"
[ -f "$marker" ] && [ ! -L "$marker" ]
[ "$(cat "$marker")" = "plush.backup-source/v1:$source_id" ]
`;
}
export function inventoryScript(c) {
  return (
    prelude(c) +
    `printf 'plush.backup-inventory/v1\\t%s\\n' "$source_id"
for file in "$root"/*.age; do
  [ -e "$file" ] || continue
  [ -f "$file" ] && [ ! -L "$file" ]
  name="$(basename "$file")"
  case "$name" in *[!A-Za-z0-9._-]*) exit 2;; esac
  case "$name" in
    *.dump.age)
      checksum="$root/\${name%.dump.age}.sha256"
      [ -e "$checksum" ] || continue
      [ -f "$checksum" ] && [ ! -L "$checksum" ]
      read -r hash recorded extra < "$checksum"
      [ -z "$extra" ] && [ "\${recorded#\\*}" = "$name" ]
      [ "\${#hash}" = 64 ]
      case "$hash" in *[!0-9a-f]*) exit 2;; esac
      ;;
    *) hash="$(sha256sum -- "$file")"; hash="\${hash%% *}";;
  esac
  size="$(stat -c %s -- "$file")"
  fingerprint="$(stat -c '%s:%i:%y' -- "$file")"
  printf 'file\\t%s\\t%s\\t%s\\t%s\\n' "$name" "$size" "$hash" "$fingerprint"
done\n`
  );
}
export function parseInventory(text, sourceId) {
  const [header, ...lines] = text.trimEnd().split("\n");
  requireValue(
    header === `plush.backup-inventory/v1\t${sourceId}`,
    "inventory_identity_mismatch",
  );
  const files = lines.filter(Boolean).map((line) => {
    const fields = line.split("\t");
    requireValue(
      fields.length === 5 && fields[0] === "file",
      "invalid_inventory",
    );
    return {
      name: fields[1],
      sizeBytes: Number(fields[2]),
      sha256: fields[3],
      fingerprint: fields[4],
    };
  });
  validateInventory(files);
  return files;
}
export function validateInventory(files) {
  requireValue(
    Array.isArray(files) && files.length > 0 && files.length <= 2000,
    "invalid_inventory",
  );
  const names = new Set();
  for (const item of files) {
    requireValue(
      typeof item.name === "string" &&
        encryptedFile.test(item.name) &&
        !names.has(item.name),
      "unsafe_inventory_name",
    );
    requireValue(
      !item.name.endsWith(".dump.age") || databaseFile.test(item.name),
      "invalid_backup_name",
    );
    requireValue(
      Number.isSafeInteger(item.sizeBytes) &&
        item.sizeBytes > 0 &&
        item.sizeBytes <= 1024 ** 4 &&
        /^[a-f0-9]{64}$/u.test(item.sha256),
      "invalid_inventory_digest",
    );
    requireValue(
      typeof item.fingerprint === "string" &&
        /^[-0-9:. +]{1,160}$/u.test(item.fingerprint),
      "invalid_inventory_stat",
    );
    names.add(item.name);
  }
}
export class SSHSource {
  constructor(c, signal) {
    this.config = c;
    this.signal = signal;
  }
  args() {
    return [
      "ssh",
      "-oBatchMode=yes",
      "-oStrictHostKeyChecking=yes",
      "-oForwardAgent=no",
      "-oClearAllForwardings=yes",
      "-oPermitLocalCommand=no",
      "-oConnectTimeout=10",
      "-oServerAliveInterval=15",
      "-oServerAliveCountMax=2",
      "--",
      this.config.source.host,
      "sh -s",
    ];
  }
  async inventory() {
    const value = await command(this.args(), {
      input: inventoryScript(this.config),
      signal: this.signal,
      timeout: this.config.transferTimeoutSeconds * 1000,
    });
    return parseInventory(value.toString(), this.config.source.id);
  }
  async download(item, output) {
    const script =
      prelude(this.config) +
      `file="$root/"${quote(item.name)}\n[ -f "$file" ] && [ ! -L "$file" ]\n[ "$(stat -c '%s:%i:%y' -- "$file")" = ${quote(item.fingerprint)} ]\nhead -c ${item.sizeBytes + 1} -- "$file"\n[ "$(stat -c '%s:%i:%y' -- "$file")" = ${quote(item.fingerprint)} ]\n`;
    const fd = fs.openSync(output, "wx", 0o600);
    try {
      await command(this.args(), {
        input: script,
        output: fd,
        signal: this.signal,
        timeout: this.config.transferTimeoutSeconds * 1000,
      });
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
}
