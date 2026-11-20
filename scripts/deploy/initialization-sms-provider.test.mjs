import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = new URL("./initialization-sms-provider.sh", import.meta.url).pathname;
const values = {
  APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID: "fixture-access-id",
  APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET: "fixture-access-secret",
  APP_AUTH_SMS_ALIYUN_SIGN_NAME: "验证签名",
  APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE: "SMS_12345678",
};
const contents = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";

function fixture(t, text = contents) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "initialization-sms-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "provider.env");
  fs.writeFileSync(file, text, { mode: 0o600 });
  return { file, directory };
}

function readProvider(file) {
  return spawnSync("bash", ["-c", 'set -euo pipefail\nsource "$1"\ndeclare -A fixture_provider=()\nread_initialization_sms_provider "$2" fixture_provider\nprintf "%s" "${#fixture_provider[@]}"', "fixture", helper, file], { encoding: "utf8", cwd: path.dirname(file) });
}

test("initialization provider reads only the protected data file and never prints credentials", (t) => {
  const { file } = fixture(t, "# Initialization provider\n\n" + contents);
  const result = readProvider(file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "4");
  for (const value of Object.values(values)) assert(!`${result.stdout}${result.stderr}`.includes(value));
});

for (const [name, input] of [
  ["missing key", contents.split("\n").slice(1).join("\n")],
  ["duplicate key", contents + "APP_AUTH_SMS_ALIYUN_SIGN_NAME=duplicate\n"],
  ["unknown key", contents + "UNRELATED_SECRET=unrelated\n"],
  ["empty value", contents.replace("=fixture-access-id", "=")],
  ["placeholder", contents.replace("fixture-access-id", "<access-id>")],
  ["carriage return", contents.replace("fixture-access-id", "fixture-access-id\r")],
  ["NUL value", contents.replace("fixture-access-id", "fixture-access-id\0")],
  ["padded value", contents.replace("fixture-access-id", " fixture-access-id ")],
]) {
  test(`initialization provider rejects ${name} without leaking credentials`, (t) => {
    const { file } = fixture(t, input);
    const result = readProvider(file);
    assert.notEqual(result.status, 0);
    for (const value of Object.values(values)) assert(!`${result.stdout}${result.stderr}`.includes(value));
  });
}

test("initialization provider rejects readable permissions and symlink aliases", (t) => {
  const { file, directory } = fixture(t);
  fs.chmodSync(file, 0o644);
  assert.notEqual(readProvider(file).status, 0);
  fs.chmodSync(file, 0o600);
  const link = path.join(directory, "linked.env");
  fs.symlinkSync(file, link);
  assert.notEqual(readProvider(link).status, 0);
  const linkedDirectory = directory + "-alias";
  fs.symlinkSync(directory, linkedDirectory);
  t.after(() => fs.rmSync(linkedDirectory));
  assert.notEqual(readProvider(path.join(linkedDirectory, "provider.env")).status, 0);
});

test("initialization provider treats shell syntax as data", (t) => {
  const { file, directory } = fixture(t, contents.replace("fixture-access-id", "$(touch should-not-execute)"));
  const result = readProvider(file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "4");
  assert(!fs.existsSync(path.join(directory, "should-not-execute")));
});
