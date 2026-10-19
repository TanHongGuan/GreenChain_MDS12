"""Shared fixtures for S3 Object Lock tests, backed by moto's in-process S3 (no AWS account)."""

from collections.abc import Generator

import boto3
import pytest
from moto import mock_aws

from backend.app.storage.s3 import S3StorageService

TEST_REGION = "ap-southeast-2"
TEST_BUCKET = "greenchain-evidence-test"


@pytest.fixture
def s3_client(monkeypatch) -> Generator:
    # Fake credentials so boto3 can never reach a real AWS account from the test suite.
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    with mock_aws():
        client = boto3.client("s3", region_name=TEST_REGION)
        client.create_bucket(
            Bucket=TEST_BUCKET,
            CreateBucketConfiguration={"LocationConstraint": TEST_REGION},
            ObjectLockEnabledForBucket=True,
        )
        yield client


@pytest.fixture
def s3_storage(s3_client) -> S3StorageService:
    return S3StorageService(s3_client, TEST_BUCKET, lock_mode="GOVERNANCE", retention_days=1)
