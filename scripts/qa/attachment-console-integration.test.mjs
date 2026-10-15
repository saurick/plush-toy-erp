import assert from "node:assert/strict";
import test from "node:test";
import { consoleFixtureNetworks } from "./attachment-console-integration.mjs";

test("console fixture can use two small private networks without changing the production network", () => {
  assert.deepEqual(consoleFixtureNetworks(), { "console-fixture": {} });
  for (const prefix of ["10.254.243", "172.20.1", "192.168.254"]) {
    assert.deepEqual(consoleFixtureNetworks(`${prefix}.32/27`), {
      "attachment-private": {
        ipam: { config: [{ subnet: `${prefix}.32/28` }] },
      },
      "console-fixture": { ipam: { config: [{ subnet: `${prefix}.48/28` }] } },
    });
  }
});

test("console fixture rejects public, malformed, unaligned and broad network ranges", () => {
  for (const subnet of [
    "8.8.8.0/27",
    "172.15.1.0/27",
    "10.254.243.16/27",
    "10.254.243.0/16",
    "10.999.1.0/27",
    "10.1.1.256/27",
    "10.1.1.0/27\n",
    "10.1.1.0/27;id",
  ]) {
    assert.throws(
      () => consoleFixtureNetworks(subnet),
      /aligned private IPv4/u,
    );
  }
});
