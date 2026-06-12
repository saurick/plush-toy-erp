#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <version> --output deployments/yoyoosun/evidence/releases/<date>

作用:
  生成 release evidence 草稿文件。该脚本不采集 secret、不复制 .env、不复制备份文件。
USAGE
}

release_version=""
output_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --release-version)
    release_version="${2:-}"
    shift 2
    ;;
  --output)
    output_dir="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[collect-evidence] 不支持的参数: $1"
    print_help
    exit 1
    ;;
  esac
done

if [[ -z "$release_version" || -z "$output_dir" ]]; then
  print_help
  exit 1
fi

mkdir -p "$output_dir"

git_commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat >"$output_dir/release-evidence.md" <<EOF
# yoyoosun Release Evidence

## 基本信息

- customerCode: yoyoosun
- releaseVersion: $release_version
- generatedAt: $generated_at
- gitCommit: $git_commit
- operatorRole:
- environment:

## 配置指纹

- envFingerprint:
- customerConfigFingerprint:
- menuConfigFingerprint:
- permissionConfigFingerprint:

## 执行结果

- preflight:
- backup:
- migration:
- seed:
- import:
- smoke:
- security scan:
- backup restore:

## 已知限制

-

## 回滚信息

- previousReleaseVersion:
- backupId:
- rollbackRunbook: deployments/yoyoosun/runbooks/03-rollback.md
EOF

cat >"$output_dir/known-limitations.md" <<'EOF'
# yoyoosun Known Limitations

- 当前记录为模板草稿，发布者必须补齐本次 release 的正式能力、模拟能力、不承诺能力、风险和客户验收步骤。
EOF

cp deployments/yoyoosun/checklists/smoke-test-checklist.md "$output_dir/acceptance-checklist.md"

echo "[collect-evidence] draft evidence: $output_dir"
