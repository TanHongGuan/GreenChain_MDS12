"""Produce verifiable evidence that S3 Object Lock (WORM) protects stored evidence versions.

Run against an isolated test bucket only:

    STORAGE_BACKEND=s3 S3_BUCKET=<test-bucket> AWS_PROFILE=<profile> \
        python -m backend.app.scripts.worm_evidence_check --output var/worm-check.json

Steps performed, each recorded in the JSON report:

1. Confirm the bucket has versioning and Object Lock enabled.
2. Upload a small synthetic file through the application's S3StorageService (locked version).
3. Read back the version's lock mode, retain-until date and S3-recorded SHA-256.
4. Attempt to permanently delete that exact version without any bypass header (expect AccessDenied).
5. Upload different bytes to the same key, then retrieve the ORIGINAL version and re-hash it.
6. Run the application's integrity verification against the original version and against a
   deliberately wrong digest (expect MATCH and MISMATCH respectively).

The script never sends BypassGovernanceRetention, never deletes anything that is not locked, and
uses a synthetic file containing no real data. The locked test objects remain until retention
expires (S3_RETENTION_DAYS); in GOVERNANCE mode an administrator with
s3:BypassGovernanceRetention can remove them early.
"""

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from backend.app.core.config import get_settings
from backend.app.integrity.verification import verify_stored_evidence
from backend.app.storage.dependencies import build_s3_storage
from backend.app.storage.exceptions import ObjectLocked, StorageError

SYNTHETIC_FILE = (
    b"metric_name,value,unit,category\n"
    b"electricity_consumption,1000,kWh,Energy\n"
    b"water_consumption,10,m3,Water\n"
    b"carbon_emissions,0.5,tCO2e,Emissions\n"
)


def run_check() -> dict:
    settings = get_settings()
    if settings.storage_backend.lower().strip() != "s3":
        raise SystemExit("Set STORAGE_BACKEND=s3 and S3_BUCKET=<isolated test bucket> to run this check.")
    if settings.s3_object_lock_mode == "NONE":
        raise SystemExit("S3_OBJECT_LOCK_MODE is NONE; there is no retention to verify.")

    storage = build_s3_storage(settings)
    report: dict = {
        "check": "GreenChain S3 Object Lock evidence check",
        "run_at": datetime.now(UTC).isoformat(),
        "bucket": settings.s3_bucket,
        "region": settings.aws_region,
        "configured_lock_mode": settings.s3_object_lock_mode,
        "configured_retention_days": settings.s3_retention_days,
        "steps": [],
    }

    def step(name: str, passed: bool, **details) -> None:
        report["steps"].append({"step": name, "passed": passed, **details})

    storage.initialise()
    step("bucket has versioning and Object Lock enabled", True)

    stored = storage.store_original(BytesIO(SYNTHETIC_FILE), "worm-check-synthetic.csv", "text/csv")
    expected = hashlib.sha256(SYNTHETIC_FILE).hexdigest()
    step(
        "upload synthetic evidence as a locked version",
        bool(stored.version_id) and stored.retention_mode is not None,
        storage_key=stored.storage_key,
        version_id=stored.version_id,
        sha256=stored.sha256,
    )

    info = storage.describe(stored.storage_key, stored.version_id)
    step(
        "S3 reports retention and its own SHA-256 for that version",
        info.retention_mode == settings.s3_object_lock_mode and info.sha256 == expected,
        retention_mode=info.retention_mode,
        retain_until=info.retain_until.isoformat() if info.retain_until else None,
        s3_checksum_sha256=info.sha256,
    )

    try:
        storage.delete_if_allowed(stored.storage_key, stored.version_id)
        step("permanent delete of the locked version is denied", False, outcome="DELETE SUCCEEDED")
    except ObjectLocked as exc:
        step("permanent delete of the locked version is denied", True, outcome=str(exc.__cause__ or exc))
    except StorageError as exc:
        step("permanent delete of the locked version is denied", False, outcome=f"unexpected error: {exc}")

    overwrite = storage.client.put_object(
        Bucket=storage.bucket,
        Key=stored.storage_key,
        Body=b"overwritten content",
        ChecksumAlgorithm="SHA256",
    )
    original_bytes = storage.retrieve(stored.storage_key, stored.version_id)
    step(
        "overwriting the key creates a new version; the locked version is unchanged",
        overwrite.get("VersionId") != stored.version_id and hashlib.sha256(original_bytes).hexdigest() == expected,
        new_version_id=overwrite.get("VersionId"),
        original_version_sha256=hashlib.sha256(original_bytes).hexdigest(),
    )

    match = verify_stored_evidence(storage, stored.storage_key, stored.version_id, expected)
    step(
        "application integrity verification of the locked version",
        match.status == "MATCH",
        status=match.status.value,
        trusted_reference=match.trusted_reference.value if match.trusted_reference else None,
    )

    forged = verify_stored_evidence(storage, stored.storage_key, stored.version_id, hashlib.sha256(b"forged").hexdigest())
    step(
        "a forged database digest is detected",
        forged.status == "MISMATCH",
        status=forged.status.value,
        reason=forged.reason,
    )

    report["all_passed"] = all(item["passed"] for item in report["steps"])
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output", type=Path, help="Write the JSON report to this path as well as stdout.")
    args = parser.parse_args()

    report = run_check()
    rendered = json.dumps(report, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    sys.exit(0 if report["all_passed"] else 1)


if __name__ == "__main__":
    main()
