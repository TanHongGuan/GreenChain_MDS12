"""Seed the Monosh demonstration: 2 buildings, 5 approved quarterly submissions.

    python -m backend.app.scripts.seed_demo_monosh

SYNTHETIC DATA, SIMULATED APPROVALS. See backend/app/demo/monosh.py.

Everything goes through the running application's own HTTP routes, in-process,
exactly as the website would drive them: the company signs in, creates its two
buildings, uploads each workbook with its confirmed column mapping (so the
deterministic ETL, evidence storage and SHA-256 recording all run as normal),
appoints one auditor per submission, and that auditor signs in and approves it.
Nothing is written to the database directly, so nothing here can produce a
record the application itself would have refused.

Safe to run repeatedly. A building or quarter that already exists is reused
rather than created again, an approved submission is left exactly as it is, and
an unfinished one (uploaded but not yet approved) is completed. Auditor
appointments come from a fixed seed, so every fresh deployment gets the same
ones.

Refuses to run with ENVIRONMENT=production.
"""

from __future__ import annotations

import random
from io import BytesIO

from fastapi.testclient import TestClient

from backend.app.core.config import get_settings
from backend.app.demo.monosh import (
    APPROVAL_REASON, AUDITOR_SEED, BUILDINGS, COMPANY_EMAIL, SUBMISSIONS, DemoSubmission,
)
from backend.app.integrity.hashing import calculate_sha256
from backend.app.scripts.seed_auth import AUDITORS

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class DemoSeedError(RuntimeError):
    pass


def auditor_plan(auditor_emails: list[str] | None = None) -> dict[tuple[str, str], str]:
    """Which auditor reviews which submission. Fixed seed, every auditor used.

    The first three submissions in the shuffled order get one auditor each, so
    nobody is left out; the remaining two are drawn at random from all three.
    The result depends only on the seed and the two fixed lists, so it is the
    same on every deployment and every restart.
    """
    emails = sorted(auditor_emails or [email for _, email in AUDITORS])
    keys = [(item.building, item.reporting_period) for item in SUBMISSIONS]
    if len(emails) > len(keys):
        raise DemoSeedError("More auditors than submissions; every auditor could not get one.")
    rng = random.Random(AUDITOR_SEED)
    order = keys[:]
    rng.shuffle(order)
    distinct = emails[:]
    rng.shuffle(distinct)
    plan = dict(zip(order, distinct))
    for key in order[len(distinct):]:
        plan[key] = rng.choice(emails)
    return plan


def _check(response, what: str) -> dict:
    if response.status_code >= 400:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        raise DemoSeedError(f"{what} failed with HTTP {response.status_code}: {detail}")
    return response.json() if response.content else {}


def _signed_in(app, email: str, password: str) -> TestClient:
    # https so a Secure session cookie is still sent back; harmless when it is not Secure.
    client = TestClient(app, base_url="https://testserver")
    _check(client.post("/auth/login", json={"email": email, "password": password}), f"Sign-in as {email}")
    return client


def _verify_files() -> None:
    for item in SUBMISSIONS:
        if not item.path.exists():
            raise DemoSeedError(f"Demo workbook missing: {item.path}")
        actual = calculate_sha256(BytesIO(item.path.read_bytes()))
        if actual != item.sha256:
            raise DemoSeedError(f"{item.filename} has changed (SHA-256 {actual}); refusing to seed it.")


def _history(company: TestClient, project_id: int) -> list[dict]:
    return _check(company.get(f"/submissions/projects/{project_id}"), "Reading submission history")["submissions"]


def seed_demo(app=None) -> list[str]:
    settings = get_settings()
    if settings.is_production:
        raise DemoSeedError("Demo seeding is disabled when ENVIRONMENT=production.")
    if not settings.dev_seed_password:
        raise DemoSeedError("DEV_SEED_PASSWORD is required; it is the demo accounts' password.")
    _verify_files()

    if app is None:
        from backend.app.main import create_app
        app = create_app()

    notes: list[str] = []
    password = settings.dev_seed_password
    company = _signed_in(app, COMPANY_EMAIL, password)

    # --- buildings ---------------------------------------------------------------
    owned = {item["project_name"]: item for item in _check(company.get("/projects/owned"), "Listing buildings")["buildings"]}
    project_ids: dict[str, int] = {}
    for building in BUILDINGS:
        if building.name in owned:
            project_ids[building.name] = owned[building.name]["project_id"]
            notes.append(f"{building.name}: already exists (project {project_ids[building.name]})")
            continue
        created = _check(company.post("/projects/owned", json={
            "name": building.name, "location": building.location,
            "country": building.country, "property_type": building.property_type,
        }), f"Creating {building.name}")["building"]
        project_ids[building.name] = created["project_id"]
        notes.append(f"{building.name}: created (project {created['project_id']})")

    # --- uploads -----------------------------------------------------------------
    submission_ids: dict[tuple[str, str], int] = {}
    for item in SUBMISSIONS:
        key = (item.building, item.reporting_period)
        project_id = project_ids[item.building]
        existing = [record for record in _history(company, project_id)
                    if record["reporting_period"] == item.reporting_period and record["status"] != "REJECTED"]
        if existing:
            submission_ids[key] = existing[0]["submission_id"]
            notes.append(f"{item.building} {item.reporting_period}: already uploaded "
                         f"(submission {submission_ids[key]}, {existing[0]['status']})")
            continue
        result = _upload(company, item, project_id)
        submission_ids[key] = result["submission_id"]
        notes.append(f"{item.building} {item.reporting_period}: uploaded {item.filename} "
                     f"as submission {result['submission_id']} ({result.get('monthly_record_count')} months)")

    # --- auditor appointment and approval -----------------------------------------
    auditors = {entry["email"]: entry for entry in
                _check(company.get("/projects/auditors"), "Listing auditors")["auditors"]}
    expected = [email for _, email in AUDITORS]
    missing = [email for email in expected if email not in auditors]
    if missing:
        raise DemoSeedError(f"Auditor accounts missing: {', '.join(missing)}. Run seed_auth first.")
    plan = auditor_plan(expected)

    signed_in_auditors: dict[str, TestClient] = {}
    for item in SUBMISSIONS:
        key = (item.building, item.reporting_period)
        submission_id = submission_ids[key]
        email = plan[key]
        auditor = auditors[email]
        record = next(entry for entry in _history(company, project_ids[item.building])
                      if entry["submission_id"] == submission_id)

        if record["status"] == "APPROVED":
            review = record.get("review") or {}
            notes.append(f"{item.building} {item.reporting_period}: already approved by "
                         f"{review.get('reviewer_email') or 'an auditor'}; left unchanged")
            continue
        if record["status"] != "UNREVIEWED":
            notes.append(f"{item.building} {item.reporting_period}: status {record['status']}; left unchanged")
            continue

        assigned = [entry.get("id") for entry in record.get("auditors") or []]
        if assigned != [auditor["id"]]:
            _check(company.put(f"/submissions/{submission_id}/auditors", json={"auditor_ids": [auditor["id"]]}),
                   f"Appointing {email} to submission {submission_id}")

        if email not in signed_in_auditors:
            signed_in_auditors[email] = _signed_in(app, email, password)
        _check(signed_in_auditors[email].post(f"/reviews/submissions/{submission_id}/decision",
                                              json={"decision": "APPROVED", "reason": APPROVAL_REASON}),
               f"Approval of submission {submission_id} by {email}")
        notes.append(f"{item.building} {item.reporting_period}: submission {submission_id} "
                     f"approved by {auditor['name']} ({email})")

    return notes


def _upload(company: TestClient, item: DemoSubmission, project_id: int) -> dict:
    return _check(company.post(
        "/submissions",
        data={
            "project_id": str(project_id),
            "reporting_period": item.reporting_period,
            "confirmed_mapping": item.confirmed_mapping().model_dump_json(),
        },
        files={"file": (item.filename, item.path.read_bytes(), XLSX)},
    ), f"Uploading {item.filename}")


def main() -> None:
    print("Seeding the Monosh demo (synthetic data, simulated approvals):")
    for note in seed_demo():
        print(f"  {note}")
    print("Seeded Monosh demo data.")


if __name__ == "__main__":
    main()
