#!/usr/bin/env bash

project_expected_pnpm_version() {
  local root_dir="$1"
  node -e "const pkg=require(process.argv[1]); const pm=pkg.packageManager || ''; const match=pm.match(/^pnpm@(.+)$/); process.stdout.write(match ? match[1] : '')" "$root_dir/web/package.json"
}

resolve_project_pnpm() {
  local root_dir="$1"
  local expected_pnpm
  expected_pnpm="$(project_expected_pnpm_version "$root_dir")"

  if [[ -z "$expected_pnpm" ]]; then
    echo "[pnpm] web/package.json packageManager 应固定为 pnpm@x.y.z" >&2
    return 1
  fi

  local candidates=()
  if [[ -n "${PNPM_BIN:-}" ]]; then
    candidates+=("$PNPM_BIN")
  fi
  if command -v pnpm >/dev/null 2>&1; then
    candidates+=("$(command -v pnpm)")
  fi
  candidates+=("/usr/local/bin/pnpm" "/opt/homebrew/bin/pnpm")

  local seen=""
  local candidate version
  for candidate in "${candidates[@]}"; do
    [[ -x "$candidate" ]] || continue
    case " $seen " in
    *" $candidate "*) continue ;;
    esac
    seen="${seen} ${candidate}"
    version="$("$candidate" -v 2>/dev/null || true)"
    if [[ "$version" == "$expected_pnpm" ]]; then
      printf "%s\n" "$candidate"
      return 0
    fi
  done

  echo "[pnpm] 未找到匹配 web/package.json 的 pnpm ${expected_pnpm}" >&2
  if command -v pnpm >/dev/null 2>&1; then
    echo "[pnpm] 当前 PATH 命中: $(command -v pnpm) ($(pnpm -v 2>/dev/null || echo unknown))" >&2
  fi
  echo "[pnpm] 可设置 PNPM_BIN=/path/to/pnpm，或调整 PATH 后重试" >&2
  return 1
}
