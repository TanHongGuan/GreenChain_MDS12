# Evidence storage: S3 Object Lock (WORM) and SHA-256 integrity

Owner: Hui Zern (database, storage and integrity). Related RTM: **RTM-04** (evidence preservation,
SHA-256 integrity, tamper-resistant retained evidence); supports RTM-05 and RTM-08.
Audit plan items: #2 DB policy, #6 evidence/integrity, #7 WORM decision/config
(`docs/handover/GREENCHAIN_TECHNICAL_IMPLEMENTATION_AUDIT.md` §13).

## 1. Status

| Capability | Status | Evidence |
|---|---|---|
| S3 storage provider (`STORAGE_BACKEND=s3`) | Implemented, tested against moto | `backend/app/storage/s3.py`, `tests/test_s3_storage.py` |
| Exact version pinning (S3 `VersionId` persisted per submission) | Implemented, tested | migration `20261019_0007`, `tests/test_s3_submission_flow.py` |
| Object Lock retention on originals and processed files | Implemented, tested against moto | `tests/test_s3_storage.py::test_locked_version_cannot_be_deleted` |
| Trusted digest independent of PostgreSQL (S3 `ChecksumSHA256`) | Implemented, tested | `backend/app/integrity/verification.py`, `tests/test_integrity_verification.py` |
| Verify-before-download for the public evidence route | Implemented, tested | `GET /submissions/{id}/evidence/original` returns 409 on mismatch |
| Migration up/down on PostgreSQL 16 | Verified locally on 2026-10-19 (disposable container, legacy row backfilled) | Section 9 |
| Real AWS bucket with Object Lock | **NOT VERIFIED.** Needs an AWS account and team approval | Section 6, `scripts/worm_evidence_check.py` |
| Frontend display of version/retention fields | **NOT IMPLEMENTED.** API fields exist; UI belongs to Hong Guan | Section 4 |

moto is an in-process S3 emulator. Passing moto tests shows the code issues the correct S3 calls and
handles S3's responses. It is **not** evidence that a real AWS bucket enforces retention; that is
what `worm_evidence_check` is for.

## 2. Trust model

* **PostgreSQL** holds structured records, including the SHA-256 recorded at upload and the S3
  `storage_key` + `version_id` that pin each submission to one exact object version.
* **S3 versioning** means a key is never overwritten in place. Uploading to the same key creates a new
  version, and the pinned version is unchanged.
* **S3 Object Lock** prevents the pinned version from being deleted or overwritten until its
  retain-until date (GOVERNANCE or COMPLIANCE mode, Section 7).
* **S3 `ChecksumSHA256`**: every PUT sends a SHA-256 that S3 validates on receipt and records with the
  version. It cannot be edited through the application database, so it is the **trusted reference**.
* **Verification** (`integrity/verification.py`) recomputes SHA-256 over the retrieved bytes of the
  pinned version and requires agreement with the PostgreSQL digest **and** the S3 checksum. A digest
  edited only in PostgreSQL is reported as `MISMATCH` (reason: "Recorded database digest does not
  match the storage provider checksum").
* On the local backend there is no provider checksum. Results are labelled
  `trusted_reference: DATABASE_ONLY`. That detects a changed file but not a coordinated edit of file
  and database.

What this does **not** prove: that the measurements in an uploaded file are accurate, that the
data is sustainable, or that a reviewer's approval is correct. Object Lock protects stored file
versions. It does not make PostgreSQL rows (metrics, statuses) immutable. The processed CSV is
also locked (`S3_LOCK_PROCESSED=true`) so database metrics can be checked against a protected
canonical snapshot.

## 3. Upload flow (`submissions/service.py`)

1. Validate and parse the file (ETL); compute SHA-256 of the original bytes.
2. Store the original → `StoredFile{storage_key, version_id, sha256, retention_mode, retain_until}`.
   Abort if the stored digest differs from the uploaded bytes' digest.
3. Store the processed CSV the same way.
4. Insert the submission row (keys, version IDs, both digests, retention) and metrics in one transaction.
5. If step 3 or 4 fails, attempt to delete the stored versions. Locally they are removed. On S3 under
   Object Lock the delete is refused by design: the unreferenced versions remain until retention
   expires and a `WARNING Unreferenced evidence retained after failed submission` log line records
   key and version for reconciliation. No submission row ever references them.

## 4. Contract changes

**Storage interface (`storage/base.py`):** `retrieve`, `exists`, `describe` and `delete_if_allowed`
take an optional `version_id`. `describe` returns `StoredObjectInfo` (provider checksum, retention).
`delete_if_allowed` on S3 requires an exact `version_id` (a version-less delete would only add a
delete marker) and never sends `BypassGovernanceRetention`.

**Database (`submissions`, migration `20261019_0007`):** `storage_backend` (default `local`),
`original_version_id`, `original_retention_mode`, `original_retain_until`, `processed_version_id`,
`processed_sha256`, `processed_retention_mode`, `processed_retain_until`. All additive; existing rows
are backfilled as `local` with NULL version fields.

**API (additive, no field removed):**

* `GET /submissions/{id}` and `/submissions/projects/{id}`: each `evidence.original|processed` gains
  `version_id`, `retention_mode`, `retain_until`. `integrity` gains `algorithm`, `storage_sha256`,
  `trusted_reference` (`STORAGE_CHECKSUM` | `DATABASE_ONLY`), `version_id`, `checked_at`, `reason`.
  Processed evidence now also carries an integrity result.
* `GET /submissions/{id}/evidence/{original|processed}`: verifies before serving. Mismatch →
  `409 EVIDENCE_INTEGRITY_MISMATCH`. Success adds `X-Evidence-Integrity`, `X-Evidence-SHA256`, and
  `X-Evidence-Version-Id` headers.
* `GET /reviews/submissions/{id}`: `integrity` gains `actual_sha256`, `storage_sha256`,
  `trusted_reference`, `version_id`, `reason`. Auditor evidence downloads are **not** blocked on
  mismatch so the auditor can inspect a suspect file; the integrity status is shown alongside.

Contract owner (Hong Guan) and backend owner (Bradley) to review before the contract is frozen.

## 5. Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_BACKEND` | `local` | `s3` enables this provider |
| `S3_BUCKET` | (none) | Bucket created with Object Lock enabled |
| `AWS_REGION` | `ap-southeast-1` | Singapore |
| `S3_KEY_PREFIX` | empty | e.g. `demo/` to separate environments in one bucket |
| `S3_OBJECT_LOCK_MODE` | `GOVERNANCE` | `GOVERNANCE`, `COMPLIANCE` (needs opt-in) or `NONE` |
| `S3_RETENTION_DAYS` | `1` | Per-version retention applied at upload |
| `S3_LOCK_PROCESSED` | `true` | Also lock the processed CSV snapshot |
| `S3_ALLOW_COMPLIANCE_MODE` | `false` | Guard against accidentally selecting irreversible COMPLIANCE |
| `S3_ENDPOINT_URL` | empty | Only for an S3-compatible emulator |

Credentials are **never** set in `.env` or Git. boto3 uses the standard chain: `AWS_PROFILE` (from
`aws configure --profile` or `aws configure sso`) locally, or an IAM role when deployed.

## 6. Setting up an isolated AWS test bucket (requires team approval)

Do this in a test/sandbox account, not one holding real evidence. Object Lock can only be enabled
when the bucket is created and **cannot be disabled afterwards**. Locked versions cannot be deleted
before retain-until without bypass permission (GOVERNANCE) or at all (COMPLIANCE). Keep
`S3_RETENTION_DAYS` short for testing.

```bash
aws configure sso --profile greenchain-dev          # or: aws configure --profile greenchain-dev
export AWS_PROFILE=greenchain-dev AWS_REGION=ap-southeast-1
BUCKET=greenchain-evidence-test-<unique-suffix>

aws s3api create-bucket --bucket "$BUCKET" --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1 \
  --object-lock-enabled-for-bucket
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api get-bucket-versioning --bucket "$BUCKET"              # expect "Status": "Enabled"
aws s3api get-object-lock-configuration --bucket "$BUCKET"      # expect "ObjectLockEnabled": "Enabled"
```

No bucket-level default retention is required: the application sets retention per version.

**Least-privilege application policy** (attach to the identity the backend runs as; replace the bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EvidenceReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectRetention",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetObjectRetention",
        "s3:GetObjectVersionAttributes",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::BUCKET/*"
    },
    {
      "Sid": "BucketChecks",
      "Effect": "Allow",
      "Action": ["s3:GetBucketVersioning", "s3:GetBucketObjectLockConfiguration", "s3:ListBucket", "s3:ListBucketVersions"],
      "Resource": "arn:aws:s3:::BUCKET"
    },
    {
      "Sid": "NeverBypassRetention",
      "Effect": "Deny",
      "Action": ["s3:BypassGovernanceRetention", "s3:PutBucketObjectLockConfiguration"],
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"]
    }
  ]
}
```

`s3:DeleteObjectVersion` is only effective for unlocked versions; Object Lock refuses it for locked
ones, which is exactly what the denial test demonstrates. Expected cost for a test bucket holding a
few KB is effectively zero (S3 Standard storage and request pricing), but confirm against the account's
billing and any AWS Academy/Learner Lab restrictions before starting.

## 7. GOVERNANCE vs COMPLIANCE

| | GOVERNANCE | COMPLIANCE |
|---|---|---|
| Delete/overwrite a locked version | Denied, unless the caller has `s3:BypassGovernanceRetention` **and** sends the bypass header | Denied for everyone, including the root user |
| Shorten or remove retention | Possible with bypass permission | Impossible until retain-until |
| Suitable for | Development, testing, the FYP demo | Regulated production retention |
| This repo | Default | Requires `S3_ALLOW_COMPLIANCE_MODE=true` |

The demo can honestly claim: "evidence versions are WORM-protected in GOVERNANCE mode; the
application identity is explicitly denied the bypass permission." It must not claim regulatory
COMPLIANCE-mode immutability unless that mode is deliberately approved and configured.

## 8. Producing RTM-04 evidence

```bash
STORAGE_BACKEND=s3 S3_BUCKET="$BUCKET" S3_KEY_PREFIX=worm-check \
  .venv/bin/python -m backend.app.scripts.worm_evidence_check --output var/worm-check.json
```

The JSON report records the following. The script exits non-zero if any step fails.
* That versioning and Object Lock are enabled.
* The locked version ID, mode and retain-until date.
* S3's own SHA-256.
* The **denied** delete of that version.
* That an overwrite created a new version while the original hash was unchanged.
* MATCH for the original and MISMATCH for a forged digest.

Screenshots for slides: the report, `aws s3api head-object --bucket $BUCKET --key <key> --version-id <id> --checksum-mode ENABLED`,
and the app's submission detail. Redact the account ID and never capture credentials.

## 9. Verification performed on this branch

* `pytest`: full backend suite passes (S3 behaviour via moto; see the PR description for the count).
* Migration on PostgreSQL 16 (disposable Docker container, 2026-10-19): `upgrade 0006`, insert a
  legacy submission, `upgrade head`. The legacy row has `storage_backend='local'` and NULL version fields.
  `downgrade -1` removed the columns and kept the row; `upgrade head` again reached `20261019_0007`.

## 10. Decisions for the team (do not treat as agreed)

1. Retention mode and duration for the demo and for any longer-lived environment (proposal: GOVERNANCE, 1–7 days for testing).
2. Whether processed CSV snapshots are locked (proposal: yes, to anchor approved metrics to protected canonical data).
3. Whether the audit report should also be generated once at decision time and stored as a locked object (currently generated on request; not protected).
4. Which AWS account (personal free tier vs AWS Academy) and who holds admin access.
5. Contract review of the additive API fields and the new 409 on the public evidence route.
6. Interaction with the open access-control gap (audit §10): evidence reads currently only require
   authentication. Object Lock protects bytes, not who can download them; Bradley's organisation and
   status policy still applies.

## 11. Known limitations

* Listing a project's history verifies every original by downloading it; acceptable for small demo
  files, but S3 request volume grows with history size.
* Multipart uploads are not used (files ≤ `MAX_UPLOAD_SIZE_MB`); a multipart checksum would not be a
  full-object SHA-256 and is treated as unavailable.
* Rows created before this change have no version IDs and verify as `DATABASE_ONLY`.
* moto's `GetObjectRetention` is broken (HTTP 500), so retention is read via `HeadObject`, which
  returns the same `ObjectLockMode`/`ObjectLockRetainUntilDate` on real S3.
