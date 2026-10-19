import pytest

from backend.app.core.config import get_settings
from backend.app.scripts.worm_evidence_check import run_check
from backend.app.tests.s3_fixtures import TEST_BUCKET, TEST_REGION, s3_client  # noqa: F401


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_worm_evidence_check_passes_on_object_lock_bucket(s3_client, monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", TEST_BUCKET)
    monkeypatch.setenv("AWS_REGION", TEST_REGION)
    monkeypatch.setenv("S3_KEY_PREFIX", "worm-check")

    report = run_check()

    assert report["all_passed"] is True, report
    names = [step["step"] for step in report["steps"]]
    assert "permanent delete of the locked version is denied" in names
    assert "a forged database digest is detected" in names


def test_worm_evidence_check_refuses_local_backend(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "local")

    with pytest.raises(SystemExit):
        run_check()
