from datetime import date

import pytest


def register_user(client, email="owner@example.com", password="correct-password"):
    response = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()


def login_user(client, email="owner@example.com", password="correct-password"):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def create_task(client, token, payload=None):
    response = client.post(
        "/tasks",
        headers=auth_headers(token),
        json=payload or {"title": "Test task"},
    )
    assert response.status_code == 200
    return response.json()


def test_registration_success_duplicate_and_invalid_data(client):
    user = register_user(client)

    assert user["email"] == "owner@example.com"
    assert user["id"] > 0
    assert user["created_at"]
    assert "password_hash" not in user

    duplicate = client.post(
        "/auth/register",
        json={"email": "owner@example.com", "password": "another-password"},
    )
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Email already registered"

    invalid = client.post(
        "/auth/register",
        json={"email": "new@example.com", "password": "password", "unexpected": True},
    )
    assert invalid.status_code == 422

    short_password = client.post(
        "/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert short_password.status_code == 422


def test_login_success_wrong_password_and_unknown_user(client):
    register_user(client)

    valid = client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "correct-password"},
    )
    assert valid.status_code == 200
    assert valid.json()["token_type"] == "bearer"
    assert valid.json()["access_token"].count(".") == 2

    wrong_password = client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "wrong-password"},
    )
    assert wrong_password.status_code == 401

    unknown_user = client.post(
        "/auth/login",
        json={"email": "unknown@example.com", "password": "correct-password"},
    )
    assert unknown_user.status_code == 401


def test_protected_task_routes_require_authentication(client):
    get_response = client.get("/tasks")
    assert get_response.status_code == 401

    invalid_token = client.get("/tasks", headers=auth_headers("not-a-jwt"))
    assert invalid_token.status_code == 401

    create_response = client.post("/tasks", json={"title": "Unauthenticated task"})
    assert create_response.status_code == 401


def test_create_title_only_uses_backend_defaults_and_returns_all_fields(client):
    register_user(client)
    token = login_user(client)
    task = create_task(client, token)

    assert task["title"] == "Test task"
    assert task["description"] is None
    assert task["status"] == "todo"
    assert task["priority"] == "medium"
    assert task["due_date"] is None
    assert task["created_at"]
    assert task["updated_at"]
    assert task["user_id"] > 0
    assert set(task) == {
        "id",
        "title",
        "description",
        "status",
        "priority",
        "due_date",
        "created_at",
        "updated_at",
        "user_id",
    }


def test_create_rich_task_returns_supplied_values(client):
    register_user(client)
    token = login_user(client)
    payload = {
        "title": "Plan the next release",
        "description": "Write the checklist and share it with the team.",
        "status": "in_progress",
        "priority": "high",
        "due_date": "2030-05-17",
    }

    task = create_task(client, token, payload)

    assert task["title"] == payload["title"]
    assert task["description"] == payload["description"]
    assert task["status"] == payload["status"]
    assert task["priority"] == payload["priority"]
    assert task["due_date"] == payload["due_date"]


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "   "},
        {"title": "x" * 201},
        {"title": "Valid title", "description": "x" * 2001},
        {"title": "Valid title", "status": "blocked"},
        {"title": "Valid title", "priority": "urgent"},
        {"title": "Valid title", "due_date": "not-a-date"},
    ],
)
def test_task_validation_rejects_invalid_inputs(client, payload):
    register_user(client)
    token = login_user(client)
    response = client.post("/tasks", headers=auth_headers(token), json=payload)
    assert response.status_code == 422


def test_owner_can_update_all_fields_and_clear_nullable_values(client):
    register_user(client)
    token = login_user(client)
    task = create_task(
        client,
        token,
        {
            "title": "Original title",
            "description": "Original description",
            "status": "todo",
            "priority": "low",
            "due_date": "2030-05-17",
        },
    )

    updated = client.patch(
        f"/tasks/{task['id']}",
        headers=auth_headers(token),
        json={
            "title": "Updated title",
            "description": "Updated description",
            "status": "completed",
            "priority": "high",
            "due_date": "2031-06-18",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated title"
    assert updated.json()["description"] == "Updated description"
    assert updated.json()["status"] == "completed"
    assert updated.json()["priority"] == "high"
    assert updated.json()["due_date"] == "2031-06-18"
    assert updated.json()["updated_at"]

    partial = client.patch(
        f"/tasks/{task['id']}",
        headers=auth_headers(token),
        json={"status": "in_progress"},
    )
    assert partial.status_code == 200
    assert partial.json()["status"] == "in_progress"
    assert partial.json()["title"] == "Updated title"
    assert partial.json()["priority"] == "high"

    cleared = client.patch(
        f"/tasks/{task['id']}",
        headers=auth_headers(token),
        json={"description": None, "due_date": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["description"] is None
    assert cleared.json()["due_date"] is None


def test_owner_retrieves_tasks_and_non_owner_cannot_access_them(client):
    register_user(client, "a@example.com")
    token_a = login_user(client, "a@example.com")
    task_a = create_task(client, token_a, {"title": "A private task"})

    register_user(client, "b@example.com")
    token_b = login_user(client, "b@example.com")
    task_b = create_task(client, token_b, {"title": "B private task"})

    own_tasks = client.get("/tasks", headers=auth_headers(token_a))
    assert own_tasks.status_code == 200
    assert [task["id"] for task in own_tasks.json()] == [task_a["id"]]

    other_tasks = client.get("/tasks", headers=auth_headers(token_b))
    assert other_tasks.status_code == 200
    assert [task["id"] for task in other_tasks.json()] == [task_b["id"]]

    forbidden_update = client.patch(
        f"/tasks/{task_a['id']}",
        headers=auth_headers(token_b),
        json={"title": "Tampered task"},
    )
    assert forbidden_update.status_code == 404

    forbidden_delete = client.delete(
        f"/tasks/{task_a['id']}",
        headers=auth_headers(token_b),
    )
    assert forbidden_delete.status_code == 404

    owner_delete = client.delete(
        f"/tasks/{task_b['id']}",
        headers=auth_headers(token_b),
    )
    assert owner_delete.status_code == 200
    remaining_tasks = client.get("/tasks", headers=auth_headers(token_b))
    assert remaining_tasks.status_code == 200
    assert remaining_tasks.json() == []


def test_task_dates_are_returned_as_api_dates(client):
    register_user(client)
    token = login_user(client)
    task = create_task(client, token, {"title": "Date task", "due_date": "2030-05-17"})

    assert task["due_date"] == date(2030, 5, 17).isoformat()
    assert isinstance(task["created_at"], str)
    assert isinstance(task["updated_at"], str)
