#!/usr/bin/env python3
"""Fail-closed policy for this Pages config; parses actual TOML, not text patterns.

Static checks only: Wrangler/Cloudflare may change semantics and existing hosted
previews do not update retroactively. Requires Python 3.11+ for tomllib.
"""
import copy
from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[2]
PROD_DB_ID = "50a6448b-1f12-466c-a28a-10544bedf750"


def validate(config):
    assert config.get("name") == "prontera-grind", "unexpected project"
    assert config.get("pages_build_output_dir") == "dist", "unexpected build output"
    # No production override: preserve the existing production binding configuration.
    assert set(config.get("env", {})) == {"preview"}, "missing preview or unexpected environment"
    assert config.get("d1_databases") == [{"binding": "DB", "database_name": "pg", "database_id": PROD_DB_ID}], "production D1 changed"
    assert config.get("durable_objects") == {"bindings": [{"name": "SOCIAL", "class_name": "Social", "script_name": "prontera-social"}]}, "production social changed"
    preview = config["env"]["preview"]
    # Reject ALL added preview settings rather than just known production IDs.
    # If a staging binding is needed later, deliberately review and change this policy.
    assert set(preview) == {"d1_databases", "durable_objects"}, "unexpected preview configuration"
    assert preview["d1_databases"] == [], "preview must have no D1 binding"
    assert preview["durable_objects"] == {"bindings": []}, "preview must have no DO binding"


def must_reject(config, message):
    try:
        validate(config)
    except (AssertionError, KeyError, TypeError):
        return
    raise AssertionError("unsafe mutation accepted: " + message)


def main():
    config = tomllib.loads((ROOT / "wrangler.toml").read_text(encoding="utf-8"))
    validate(config)
    for name, mutate in [
        ("missing preview", lambda c: c.pop("env")),
        ("production D1", lambda c: c["env"]["preview"].update(d1_databases=copy.deepcopy(c["d1_databases"]))),
        ("another D1", lambda c: c["env"]["preview"].update(d1_databases=[{"binding": "OTHER", "database_id": "not-production"}])),
        ("production social", lambda c: c["env"]["preview"].update(durable_objects=copy.deepcopy(c["durable_objects"]))),
        ("service binding", lambda c: c["env"]["preview"].update(services=[{"binding": "S", "service": "live"}])),
        ("R2 binding", lambda c: c["env"]["preview"].update(r2_buckets=[{"binding": "ASSETS", "bucket_name": "live"}])),
        ("variable", lambda c: c["env"]["preview"].update(vars={"key": "value"})),
        ("production override", lambda c: c["env"].update(production={"d1_databases": []})),
        ("changed production DB", lambda c: c["d1_databases"][0].update(database_id="other")),
        ("changed production social", lambda c: c["durable_objects"]["bindings"][0].update(script_name="other")),
    ]:
        altered = copy.deepcopy(config)
        mutate(altered)
        must_reject(altered, name)
    print("PASS: preview binding policy and 10 unsafe configuration mutations")


if __name__ == "__main__":
    main()
