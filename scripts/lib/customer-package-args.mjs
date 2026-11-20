export function parseCustomerPackageArgs(argv = process.argv.slice(2)) {
  const args = {
    customer: "yoyoosun",
    customers: [],
    all: false,
    mode: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--all") {
      args.all = true;
    } else if (flag === "--help" || flag === "-h") {
      args.help = true;
    } else if (["--customer", "--mode", "--out"].includes(flag)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${flag} requires a value`);
      }
      index += 1;
      if (flag === "--customer") {
        args.customer = value;
        args.customers.push(value);
      } else {
        args[flag.slice(2)] = value;
      }
    } else {
      throw new Error(`unsupported argument: ${flag}`);
    }
  }
  if (args.all && args.customers.length > 0) {
    throw new Error("--all and --customer are mutually exclusive");
  }
  if (!args.all && args.customers.length === 0) {
    args.customers = [args.customer];
  }
  return args;
}
