import { stripVTControlCharacters } from "node:util";

const TONE_COLORS = {
  info: "36",
  success: "1;32",
  warning: "1;33",
  error: "1;31",
  detail: "1;36",
  muted: "90",
};

export function redactPostgresCredentials(value) {
  return String(value)
    .replace(
      /\bpostgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(
      /\bpassword\s*=\s*(?:'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|[^\s&]+)/giu,
      "password=<redacted>",
    );
}

export function terminalColorEnabled({
  stream = process.stdout,
  env = process.env,
} = {}) {
  return (
    Boolean(stream.isTTY) &&
    env.TERM !== "dumb" &&
    !Object.hasOwn(env, "NO_COLOR") &&
    env.FORCE_COLOR !== "0"
  );
}

export function highlightTerminalText(value, tone, { color = false } = {}) {
  const text = String(value);
  const code = TONE_COLORS[tone];
  return color && code ? `\u001b[${code}m${text}\u001b[0m` : text;
}

export function formatTerminalMessage(
  value,
  { tone = "info", color = false } = {},
) {
  const text = redactPostgresCredentials(
    stripVTControlCharacters(String(value)),
  );
  if (!color) return text;
  if (tone !== "info") return highlightTerminalText(text, tone, { color });
  // Progress stays readable; only the source label and access URLs stand out.
  return text
    .replace(/^\[[^\]\n]+\]/gmu, (label) =>
      highlightTerminalText(label, "info", { color }),
    )
    .replace(/https?:\/\/[^\s；，、）]+/gu, (url) =>
      highlightTerminalText(url, "detail", { color }),
    );
}

export function writeTerminalMessage(
  value,
  { tone = "info", stream = process.stdout, env = process.env } = {},
) {
  stream.write(
    `${formatTerminalMessage(value, {
      tone,
      color: terminalColorEnabled({ stream, env }),
    })}\n`,
  );
}
