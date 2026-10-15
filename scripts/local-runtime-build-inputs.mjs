import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packageFiles = [
  "GoFiles",
  "CgoFiles",
  "CFiles",
  "CXXFiles",
  "MFiles",
  "HFiles",
  "FFiles",
  "SFiles",
  "SwigFiles",
  "SwigCXXFiles",
  "SysoFiles",
  "EmbedFiles",
];
const goEnvironment = [
  "GOVERSION",
  "GOOS",
  "GOARCH",
  "GOAMD64",
  "GOARM",
  "GOARM64",
  "GOEXPERIMENT",
  "GOFLAGS",
  "CGO_ENABLED",
  "CC",
  "CXX",
  "CGO_CFLAGS",
  "CGO_CPPFLAGS",
  "CGO_CXXFLAGS",
  "CGO_LDFLAGS",
  "GOTOOLCHAIN",
  "GOWORK",
];

export function runtimeGoBuildArgs(version) {
  return [
    "build",
    "-trimpath",
    "-buildvcs=false",
    "-ldflags",
    `-X main.Version=${version}`,
  ];
}

function addFile(hash, file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`构建输入不是普通文件：${label}`);
  hash.update(label).update("\0").update(fs.readFileSync(file)).update("\0");
}

export async function readRuntimeBuildInputs(
  root,
  source,
  execute = exec,
  { scope = "backend", webDependencyRoot = root } = {},
) {
  root = fs.realpathSync(root);
  const options = {
    cwd: path.join(root, "server"),
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  };
  const { stdout: environmentJSON } = await execute(
    "go",
    ["env", "-json", ...goEnvironment],
    options,
  );
  const environment = JSON.parse(environmentJSON);
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  if (environment.GOOS !== process.platform || environment.GOARCH !== arch)
    throw new Error(
      "本地服务需要当前平台的 Go 制品；请检查 GOOS / GOARCH，原后端保持运行",
    );
  const targets =
    scope === "full"
      ? ["./cmd/server", "./cmd/attachment-storage"]
      : ["./cmd/server"];
  const { stdout } = await execute(
    "go",
    ["list", "-deps", "-json", ...targets],
    options,
  );
  const packages = JSON.parse(
    `[${stdout.trim().replace(/\n\}\n(?=\{)/gu, "\n},\n")}]`,
  );
  const byImport = new Map(packages.map((pkg) => [pkg.ImportPath, pkg]));
  const fingerprint = (target) => {
    const main = packages.find(
      (pkg) => pkg.Dir === path.join(root, "server", target),
    );
    if (!main) throw new Error(`无法确认 Go 构建入口：${target}`);
    const included = new Set();
    const visit = (pkg) => {
      if (!pkg || included.has(pkg.ImportPath)) return;
      included.add(pkg.ImportPath);
      for (const imported of pkg.Imports || []) visit(byImport.get(imported));
    };
    visit(main);
    const hash = createHash("sha256").update(
      JSON.stringify({
        environment,
        flags: runtimeGoBuildArgs("<artifact-version>"),
      }),
    );
    for (const file of ["go.mod", "go.sum"])
      if (fs.existsSync(path.join(root, "server", file)))
        addFile(hash, path.join(root, "server", file), file);
    for (const name of [...included].sort()) {
      const pkg = byImport.get(name);
      if (pkg.Standard) continue;
      if (pkg.Error || pkg.Incomplete)
        throw new Error(`Go 依赖未就绪：${name}`);
      const files = [
        ...new Set(packageFiles.flatMap((key) => pkg[key] || [])),
      ].sort();
      for (const file of files)
        addFile(hash, path.join(pkg.Dir, file), `${name}/${file}`);
    }
    return hash.digest("hex");
  };
  const inputFiles = new Set();
  for (const pkg of packages) {
    if (!pkg.Dir || pkg.Standard) continue;
    for (const key of packageFiles)
      for (const file of pkg[key] || []) {
        const relative = path.relative(root, path.join(pkg.Dir, file));
        if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
          inputFiles.add(relative.split(path.sep).join("/"));
      }
  }
  const result = {
    backend: fingerprint("cmd/server"),
    files: [...inputFiles].sort(),
  };
  if (scope === "full") {
    result.attachment = fingerprint("cmd/attachment-storage");
    const hash = createHash("sha256").update(
      JSON.stringify({
        node: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        environment: Object.fromEntries(
          Object.entries(process.env)
            .filter(
              ([key]) => key.startsWith("VITE_") || key === "NODE_OPTIONS",
            )
            .sort(),
        ),
        customer: source.environment.ERP_CUSTOMER_KEY,
      }),
    );
    for (const file of source.files.filter(
      (file) =>
        file.startsWith("web/") ||
        file.startsWith("config/") ||
        file.startsWith("scripts/build/"),
    ))
      addFile(hash, path.join(root, file), file);
    const dependencies = createHash("sha256");
    for (const file of [
      "web/node_modules/.modules.yaml",
      "web/node_modules/.pnpm/lock.yaml",
    ]) {
      if (fs.existsSync(path.join(webDependencyRoot, file))) {
        addFile(hash, path.join(webDependencyRoot, file), file);
        addFile(dependencies, path.join(webDependencyRoot, file), file);
      }
    }
    result.webDependencies = dependencies.digest("hex");
    result.web = hash.digest("hex");
  }
  return result;
}
