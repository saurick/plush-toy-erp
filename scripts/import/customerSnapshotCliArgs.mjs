const REQUIRED_INPUTS = ["source", "existing", "out"];

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseSnapshotCliArgs(
  argv,
  { defaults = {}, flags = {}, extraValueKeys = [] } = {},
) {
  const options = { ...defaults, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (Object.hasOwn(flags, token)) {
      options[flags[token]] = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }

    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const value = equalIndex === -1 ? argv[++index] : token.slice(equalIndex + 1);
    if (value === undefined || value.startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    if (!REQUIRED_INPUTS.includes(key) && !extraValueKeys.includes(key)) {
      throw new CliError(`Unknown option: --${key}`, 2);
    }
    options[key] = value;
  }

  if (!options.help) {
    for (const key of REQUIRED_INPUTS) {
      if (!options[key]) throw new CliError(`Missing required --${key}`, 2);
    }
  }
  return options;
}
