#!/usr/bin/env bash

read_initialization_sms_provider() {
  local provider_file="$1"
  local provider_result_name="$2"
  [[ "$provider_result_name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || return 1
  [[ -f "$provider_file" && ! -L "$provider_file" ]] || return 1
  local provider_parent
  provider_parent="$(CDPATH='' cd -P -- "$(dirname -- "$provider_file")" && pwd -P)" || return 1
  [[ "$provider_file" == "$provider_parent/$(basename -- "$provider_file")" ]] || return 1
  local provider_metadata
  if ! provider_metadata="$(stat -c '%u:%a' "$provider_file" 2>/dev/null)"; then
    provider_metadata="$(stat -f '%u:%Lp' "$provider_file" 2>/dev/null)" || return 1
  fi
  [[ "$provider_metadata" == "$(id -u):600" ]] || return 1
  local provider_bytes provider_text_bytes
  provider_bytes="$(wc -c <"$provider_file")" || return 1
  provider_text_bytes="$(LC_ALL=C tr -d '\000' <"$provider_file" | wc -c)" || return 1
  [[ "$provider_bytes" -eq "$provider_text_bytes" ]] || return 1

  local -n provider_result="$provider_result_name"
  provider_result=()
  local provider_line provider_key provider_value
  while IFS= read -r provider_line || [[ -n "$provider_line" ]]; do
    [[ -n "$provider_line" && "$provider_line" != \#* ]] || continue
    [[ "$provider_line" == *=* && "$provider_line" != *$'\r'* ]] || return 1
    provider_key="${provider_line%%=*}"
    provider_value="${provider_line#*=}"
    case "$provider_key" in
    APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID | APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET | APP_AUTH_SMS_ALIYUN_SIGN_NAME | APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE) ;;
    *) return 1 ;;
    esac
    [[ -n "$provider_value" && -z "${provider_result[$provider_key]+x}" ]] || return 1
    [[ "$provider_value" != [[:space:]]* && "$provider_value" != *[[:space:]] && "$provider_value" != *$'\t'* ]] || return 1
    case "$provider_value" in
    '<'*'>' | change-this* | replace-* | placeholder) return 1 ;;
    esac
    printf -v "provider_result[$provider_key]" '%s' "$provider_value"
  done <"$provider_file"
  [[ "${#provider_result[@]}" -eq 4 ]]
}
