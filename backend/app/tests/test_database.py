import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from backend.app.auth.dependencies import require_roles
from backend.app.auth.models import AuthUser, UserRole
from backend.app.auth.schemas import UserResponse
from backend.app.auth.security import hash_password
from backend.app.core.config import get_settings
from backend.app.main import create_app
from backend.app.models.organisation import Organisation
from backend.app.models.organisation_member import OrganisationMember
from backend.app.models.user import User
from backend.app.repositories.users import SQLAlchemyUserRepository, get_user_repository, normalize_email
from backend.app.tests.db_fixtures import build_session_factory, install_repository_override, seed_test_auth_users


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()


@pytest.fixture
def session_factory(tmp_path):
    return build_session_factory(tmp_path / "database-tests.sqlite3")


@pytest.fixture
def db(session_factory):
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


def make_user(email: str, role: UserRole = UserRole.VIEWER, active: bool = True) -> User:
    return User(
        name=f"{role.value.title()} User",
        email=normalize_email(email),
        role=role.value,
        password_hash=hash_password("password"),
        is_active=active,
    )


def test_organisation_can_be_created(db) -> None:
    organisation = Organisation(name="GreenChain Demo Organisation")
    db.add(organisation)
    db.commit()

    assert organisation.id
    assert organisation.created_at is not None
    assert organisation.updated_at is not None


@pytest.mark.parametrize(
    ("role", "email"),
    [
        (UserRole.VIEWER, "viewer@greenchain.test"),
        (UserRole.UPLOADER, "uploader@greenchain.test"),
        (UserRole.AUDITOR, "auditor@greenchain.test"),
    ],
)
def test_role_users_can_be_created(db, role: UserRole, email: str) -> None:
    user = make_user(email, role)
    db.add(user)
    db.commit()

    assert user.id
    assert user.role == role.value
    assert user.password_hash != "password"


def test_duplicate_email_is_rejected(db) -> None:
    db.add(make_user("viewer@greenchain.test"))
    db.commit()

    db.add(make_user(" VIEWER@GREENCHAIN.TEST "))
    with pytest.raises(IntegrityError):
        db.commit()


def test_invalid_role_is_rejected(db) -> None:
    db.add(User(name="Invalid Role", email="invalid@greenchain.test", role="ADMIN", password_hash=hash_password("password")))

    with pytest.raises(IntegrityError):
        db.commit()


def test_organisation_membership_can_be_created(db) -> None:
    organisation = Organisation(name="GreenChain Demo Organisation")
    user = make_user("uploader@greenchain.test", UserRole.UPLOADER)
    db.add_all([organisation, user])
    db.flush()

    membership = OrganisationMember(user_id=user.id, organisation_id=organisation.id)
    db.add(membership)
    db.commit()

    assert membership.id
    assert membership.user_id == user.id
    assert membership.organisation_id == organisation.id


def test_user_cannot_receive_duplicate_mvp_memberships(db) -> None:
    first = Organisation(name="First Organisation")
    second = Organisation(name="Second Organisation")
    user = make_user("uploader@greenchain.test", UserRole.UPLOADER)
    db.add_all([first, second, user])
    db.flush()
    db.add(OrganisationMember(user_id=user.id, organisation_id=first.id))
    db.commit()

    db.add(OrganisationMember(user_id=user.id, organisation_id=second.id))
    with pytest.raises(IntegrityError):
        db.commit()


def test_repository_get_user_by_email_returns_correct_user(db) -> None:
    seed_test_auth_users(db)
    repository = SQLAlchemyUserRepository(db)

    user = repository.get_user_by_email(" UPLOADER@GREENCHAIN.TEST ")

    assert user is not None
    assert user.email == "uploader@greenchain.test"
    assert user.role == UserRole.UPLOADER


def test_repository_get_user_by_id_returns_correct_user(db) -> None:
    users = seed_test_auth_users(db)
    repository = SQLAlchemyUserRepository(db)

    user = repository.get_user_by_id(users["auditor"].id)

    assert user is not None
    assert user.email == "auditor@greenchain.test"
    assert user.role == UserRole.AUDITOR


def test_repository_returns_organisation_id_correctly(db) -> None:
    seed_test_auth_users(db)
    repository = SQLAlchemyUserRepository(db)

    uploader = repository.get_user_by_email("uploader@greenchain.test")
    viewer = repository.get_user_by_email("viewer@greenchain.test")

    assert uploader is not None
    assert uploader.organisation_id is not None
    assert viewer is not None
    assert viewer.organisation_id is None


def test_password_hash_is_stored_without_plaintext(db) -> None:
    user = make_user("viewer@greenchain.test")
    db.add(user)
    db.commit()

    stored_hash = db.scalars(select(User.password_hash).where(User.email == "viewer@greenchain.test")).one()
    assert stored_hash
    assert stored_hash != "password"
    assert "password" not in stored_hash


def test_inactive_user_is_hidden_from_repository(db) -> None:
    user = make_user("viewer@greenchain.test", active=False)
    db.add(user)
    db.commit()
    repository = SQLAlchemyUserRepository(db)

    assert repository.get_user_by_email("viewer@greenchain.test") is None
    assert repository.get_user_by_id(user.id) is None


def test_authentication_login_succeeds_against_sqlalchemy_repository(session_factory) -> None:
    with session_factory() as db:
        seed_test_auth_users(db)
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)
    client = TestClient(app)

    response = client.post("/auth/login", json={"email": "uploader@greenchain.test", "password": "password"})

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "UPLOADER"


def test_me_works_using_sqlalchemy_authenticated_user(session_factory) -> None:
    with session_factory() as db:
        seed_test_auth_users(db)
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)
    client = TestClient(app)

    client.post("/auth/login", json={"email": "auditor@greenchain.test", "password": "password"})
    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "auditor@greenchain.test"


def test_invalid_credentials_continue_returning_401(session_factory) -> None:
    with session_factory() as db:
        seed_test_auth_users(db)
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)
    client = TestClient(app)

    response = client.post("/auth/login", json={"email": "viewer@greenchain.test", "password": "wrong"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_rbac_still_works_with_sqlalchemy_repository(session_factory) -> None:
    with session_factory() as db:
        seed_test_auth_users(db)
    app = create_app()
    install_repository_override(app, get_user_repository, session_factory)

    @app.get("/rbac/uploader", response_model=UserResponse)
    def uploader_route(current_user: AuthUser = Depends(require_roles(UserRole.UPLOADER))) -> AuthUser:
        return current_user

    client = TestClient(app)
    client.post("/auth/login", json={"email": "uploader@greenchain.test", "password": "password"})

    response = client.get("/rbac/uploader")

    assert response.status_code == 200
    assert response.json()["role"] == "UPLOADER"
