import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET_KEY", "test-only-taskflow-secret")
os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from models import Base, Task, User


@pytest.fixture(scope="session")
def test_session_factory():
    # This schema exists only in an in-memory test database; app startup remains migration-only.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    yield session_factory

    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def isolated_database(monkeypatch, test_session_factory):
    monkeypatch.setattr(main, "SessionLocal", test_session_factory)
    session = test_session_factory()
    session.query(Task).delete(synchronize_session=False)
    session.query(User).delete(synchronize_session=False)
    session.commit()
    session.close()

    yield

    cleanup_session = test_session_factory()
    cleanup_session.query(Task).delete(synchronize_session=False)
    cleanup_session.query(User).delete(synchronize_session=False)
    cleanup_session.commit()
    cleanup_session.close()


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client
