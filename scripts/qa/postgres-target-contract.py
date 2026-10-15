#!/usr/bin/env python3
import re
import secrets
import sys
import urllib.parse


def emit(*values: str) -> None:
    payload = b"\0".join(value.encode("utf-8") for value in values)
    sys.stdout.buffer.write(payload + b"\0")


def parse_url(raw: str) -> urllib.parse.ParseResult:
    url = urllib.parse.urlparse(raw)
    if url.scheme not in {"postgres", "postgresql"}:
        raise SystemExit(
            "ERROR: PURCHASE_RECEIPT_PG_DB_URL must use postgres/postgresql scheme"
        )
    return url


def emit_base(profile: str, raw: str, command: str) -> None:
    url = parse_url(raw)
    host = url.hostname or ""
    database_name = (url.path or "").lstrip("/")
    service_hosts = {
        "purchase-receipt": {
            "purchase-receipt-postgres",
            "plush-toy-erp-purchase-receipt-postgres",
        },
        "purchase-return": {
            "purchase-return-postgres",
            "plush-toy-erp-purchase-return-postgres",
        },
        "inventory": {
            "inventory-postgres",
            "plush-toy-erp-inventory-postgres",
        },
        "bom-lot": {
            "bom-lot-postgres",
            "plush-toy-erp-bom-lot-postgres",
        },
    }
    if profile not in service_hosts:
        raise SystemExit("ERROR: unsupported PostgreSQL target profile")
    allowed_hosts = {
        "localhost",
        "127.0.0.1",
        "::1",
        "postgres",
        "host.docker.internal",
        *service_hosts[profile],
    }
    if host not in allowed_hosts:
        raise SystemExit("ERROR: refuse non-local PURCHASE_RECEIPT_PG_DB_URL host")
    if not database_name:
        raise SystemExit("ERROR: PURCHASE_RECEIPT_PG_DB_URL missing database name")
    owns_disposable_lifecycle = profile == "purchase-receipt" and command in {
        "test-critical-disposable",
        "test-populated-upgrade",
    }
    if not re.fullmatch(r"plush_erp_ci_[a-z0-9_]+", database_name) and not (
        owns_disposable_lifecycle and database_name == "postgres"
    ):
        raise SystemExit(
            "ERROR: database name must match the disposable PostgreSQL contract"
        )
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise SystemExit("ERROR: database name must be alphanumeric/underscore only")

    port = url.port or 5432
    user = urllib.parse.unquote(url.username or "")
    host_port = f"[{host}]:{port}" if ":" in host and not host.startswith("[") else f"{host}:{port}"
    safe_netloc = f"{user}@{host_port}" if user else host_port
    safe_url = urllib.parse.urlunparse(
        (url.scheme, safe_netloc, "/" + database_name, "", url.query, "")
    )
    admin_url = urllib.parse.urlunparse(url._replace(path="/postgres"))
    emit(host, database_name, safe_url, admin_url, "ok")


def emit_critical(raw: str, process_id: str) -> None:
    url = parse_url(raw)
    base_name = (url.path or "").lstrip("/")
    suffix = f"_critical_{process_id}_{secrets.token_hex(4)}"
    database_name = base_name[: 63 - len(suffix)] + suffix
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise SystemExit("ERROR: unsafe disposable critical database name")
    database_url = urllib.parse.urlunparse(url._replace(path="/" + database_name))
    emit(database_name, database_url, "ok")


def emit_populated(raw: str, base_name: str, process_id: str, random_value: str) -> None:
    url = parse_url(raw)
    if base_name == "postgres":
        base_name = "plush_erp_ci"
    suffix = f"_populated_{process_id}_{random_value}"
    database_name = base_name[: 63 - len(suffix)] + suffix
    if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
        raise SystemExit("ERROR: unsafe populated-upgrade database name")
    database_url = urllib.parse.urlunparse(url._replace(path="/" + database_name))
    emit(database_name, database_url, "ok")


def main() -> None:
    mode, *arguments = sys.argv[1:]
    if mode == "base" and len(arguments) == 3:
        emit_base(*arguments)
        return
    if mode == "critical" and len(arguments) == 2:
        emit_critical(*arguments)
        return
    if mode == "populated" and len(arguments) == 4:
        emit_populated(*arguments)
        return
    raise SystemExit("ERROR: invalid PostgreSQL target contract invocation")


if __name__ == "__main__":
    main()
