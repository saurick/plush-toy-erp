import { spawn } from "node:child_process";
import { ReplicaError } from "./config.mjs";

export async function command(
  args,
  { input, output, signal, timeout = 120_000, env } = {},
) {
  const child = spawn(args[0], args.slice(1), {
    stdio: ["pipe", output ?? "pipe", "pipe"],
    signal,
    env,
  });
  let stdout = Buffer.alloc(0);
  let stderrBytes = 0;
  child.stdout?.on("data", (chunk) => {
    stdout = Buffer.concat([stdout, chunk]);
    if (stdout.length > 2 * 1024 * 1024) child.kill("SIGTERM");
  });
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
  const outcome = await new Promise((resolve) => {
    let failure;
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", (code, exitSignal) =>
      resolve({ code, exitSignal, error: failure }),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
  clearTimeout(timer);
  if (outcome.error || outcome.code !== 0) {
    const error = new ReplicaError(
      signal?.aborted ? "interrupted" : "command_failed",
    );
    error.stage =
      args[0] === "docker"
        ? args.includes("pg_restore")
          ? "database_import"
          : args[1]
        : args[0];
    error.exitCode = outcome.code;
    error.stderrBytes = stderrBytes;
    throw error;
  }
  return stdout;
}
