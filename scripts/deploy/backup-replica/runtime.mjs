import { requireValue } from "./config.mjs";

export function requireCompatibleNode(minimum, actual = process.version) {
  const parse = (value) =>
    /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(value)?.slice(1).map(Number);
  const expected = parse(minimum),
    running = parse(actual);
  requireValue(expected && running, "runtime_node_version_invalid");
  requireValue(
    running[0] === expected[0] &&
      (running[1] > expected[1] ||
        (running[1] === expected[1] && running[2] >= expected[2])),
    "runtime_node_version_unsupported",
  );
}
