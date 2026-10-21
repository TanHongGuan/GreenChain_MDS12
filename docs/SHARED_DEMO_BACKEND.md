# Shared demo backend: every upload goes to S3 Object Lock

One machine (the host) runs PostgreSQL, the API and nginx in Docker. Everyone else opens the
host's address in a browser. Uploads from any laptop are received by the host's API and stored as
locked versions in the S3 evidence bucket. Only the host needs AWS credentials.

```
teammate browser ──http──▶ host:8080 nginx ──/api──▶ api (STORAGE_BACKEND=s3) ──▶ S3 bucket (Object Lock)
                                         └── /  ──▶ built React app            └──▶ PostgreSQL (Docker volume)
```

## Host: one-time setup

1. Docker Desktop installed and running; AWS CLI profile `greenchain-dev` configured with the
   least-privilege policy (`docs/STORAGE_S3_OBJECT_LOCK.md` section 6).
2. `cp deploy/demo.env.example deploy/.env.demo` and fill it in:
   * Generate passwords and secrets with the commands in the file.
   * `FRONTEND_ORIGIN=http://<host Wi-Fi IP>:8080` (`ipconfig getifaddr en0` on macOS).
   * `AWS_CONFIG_DIR=/Users/<you>/.aws`.
   `deploy/.env.demo` is Git-ignored. Never commit it.

## Host: start / stop / reset

```bash
./deploy/demo_up.sh        # build, start, migrate, seed, verify bucket, print URL
./deploy/demo_up.sh down   # stop; database volume and S3 evidence are kept
./deploy/demo_up.sh reset  # stop and EMPTY the demo database + local evidence volume (type RESET)
```

`reset` reads the stack's volume names from the resolved Compose configuration, lists them, and
only removes those two after you type `RESET`. It never touches S3: locked evidence stays until its
retention ends, so give the fresh deployment a new `S3_KEY_PREFIX` in `deploy/.env.demo`.

### Demo data (`DEMO_SEED_DATA=true`)

Startup then also runs `python -m backend.app.scripts.seed_demo_monosh`, which loads the Monosh
demonstration: **Monosh Science Building** (2026-Q1, Q2, Q3) and **Monosh Engineering Hall**
(2026-Q1, Q2), five quarterly submissions, all approved, under the `monosh@greenchain.test` company.

* The five workbooks are in `backend/app/demo/files/` with their SHA-256 pinned in
  `backend/app/demo/monosh.py`. **Synthetic data**: every figure was generated from a fixed seed.
* The seeder drives the application's own API in-process: the company creates the buildings and
  uploads each workbook with a fixed, hand-written confirmed column mapping (no model is called),
  so the deterministic ETL, evidence storage and SHA-256 recording run exactly as for a manual upload.
* Each submission gets one auditor from a fixed seed (Aisyah 1, Daniel 2, Priya 2), and that
  auditor signs in and approves it with the reason "Simulated approval ... not independent
  sustainability assurance". **These approvals are simulated for the demo.**
* Idempotent: a restart reuses what exists and changes no approval or appointment. Refused when
  `ENVIRONMENT=production`.

The readiness check must report `{"database":"ok","evidence_storage":"ok"}`. `evidence_storage`
confirms the bucket is reachable with versioning and Object Lock enabled.

If the host's Wi-Fi IP changes (new network), update `FRONTEND_ORIGIN` and rerun `demo_up.sh`.

## Teammates

Open `http://<host IP>:8080`, choose an account (viewer, uploader or auditor) from the dropdown and
press **Log In**. No password, setup, AWS account or repo checkout is needed.

## Verifying an upload is locked

* In the app: Project → submission → evidence shows `storage_backend: s3`, a version ID,
  `GOVERNANCE`, retain-until and integrity `MATCH` (`STORAGE_CHECKSUM`).
* From the host: `aws s3api head-object --bucket <bucket> --key <key> --version-id <id>`
  shows `ObjectLockMode`/`ObjectLockRetainUntilDate`; `delete-object` with that version ID is
  `AccessDenied ... protected by object lock`.

## Limits (be honest in the demo)

* **HTTP on a LAN only.** `docker-compose.lan.yml` runs the API in development mode with non-Secure
  cookies because browsers do not send Secure cookies over `http://`. It is for a trusted network.
  A real deployment needs HTTPS and the unmodified `docker-compose.prod.yml` checks.
* **Passwordless login.** `docker-compose.lan.yml` sets `ACCOUNT_SELECT_LOGIN=true`, so anyone who
  can reach the address can sign in as any account, including the auditor. The backend refuses this
  setting when `ENVIRONMENT=production`.
* **Demo data is synthetic.** With `DEMO_SEED_DATA=true` the Monosh buildings, figures and approvals
  are generated demonstration data, not real measurements or real assurance. Set it to `false` for a
  stack that starts with accounts only.
* **Same network required.** University and guest Wi-Fi often block device-to-device traffic
  (client isolation). If teammates cannot reach the host, use a phone hotspot or present from the
  host machine.
* **The host must stay awake and online** for the duration; evidence is in S3 but the database lives
  in the host's Docker volume.
* Verified on 2026-10-19: `deploy/smoke_test.sh http://<host IP>:8080/api` passed 22/22 through
  nginx. The resulting submission's original and processed files were stored in S3 as GOVERNANCE-locked
  versions with integrity `MATCH`, and the AWS CLI delete of the original version returned `AccessDenied`.
