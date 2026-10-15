import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  formatTerminalMessage,
  writeTerminalMessage,
} from "./terminal-log.mjs";

test("startup highlighting preserves messages and distinguishes progress from verified results", () => {
  const message = "[start-web] 本地开发：http://127.0.0.1:5175/";
  const progress = formatTerminalMessage(message, { color: true });
  assert.match(progress, /\u001b\[1;36mhttp:\/\/127\.0\.0\.1:5175\//u);
  assert(!progress.includes("\u001b[1;32m"));
  assert.equal(stripVTControlCharacters(progress), message);
  for (const [tone, code] of [
    ["success", "1;32"],
    ["warning", "1;33"],
    ["error", "1;31"],
  ]) {
    const formatted = formatTerminalMessage(message, { tone, color: true });
    assert(formatted.startsWith(`\u001b[${code}m`));
    assert.equal(stripVTControlCharacters(formatted), message);
  }
  assert.equal(
    formatTerminalMessage(`\u001b]52;c;clipboard\u0007${message}`),
    message,
  );
});

test("each output stream honors non-terminal output and explicit color opt-outs", () => {
  const message = "[local-runtime] health=passed ready=passed business=passed";
  const output = (isTTY, env) => {
    let written = "";
    writeTerminalMessage(message, {
      tone: "success",
      stream: {
        isTTY,
        write: (text) => {
          written += text;
        },
      },
      env,
    });
    return written;
  };
  assert(output(true, {}).includes("\u001b[1;32m"));
  for (const [isTTY, env] of [
    [false, {}],
    [false, { FORCE_COLOR: "1" }],
    [true, { NO_COLOR: "" }],
    [true, { NO_COLOR: "1", FORCE_COLOR: "1" }],
    [true, { FORCE_COLOR: "0" }],
    [true, { TERM: "dumb" }],
  ]) {
    assert.equal(output(isTTY, env), `${message}\n`);
  }
});
