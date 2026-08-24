# TaskFlow

TaskFlow is a focused task-management application with JWT authentication, user-owned tasks, rich task details, and a responsive React dashboard.

## Features

- User registration, login, and logout
- JWT authentication with protected API routes
- Secure user-specific task ownership
- Task creation, editing, and deletion
- Task descriptions
- Todo, in-progress, and completed statuses
- Low, medium, and high priorities
- Optional due dates with overdue display
- Client-side search and filtering
- Dashboard task metrics
- Responsive UI with loading, error, and empty states
- PostgreSQL persistence
- Alembic database migrations
- Docker Compose development environment
- Automated backend API tests

## Tech Stack

### Frontend

- React
- Vite
- CSS

### Backend

- FastAPI
- SQLAlchemy
- Pydantic
- `python-jose` for JWT signing and validation
- Passlib with bcrypt password hashing

### Database

- PostgreSQL
- Alembic

### Infrastructure

- Docker
- Docker Compose

### Testing

- pytest
- FastAPI TestClient
- Isolated in-memory SQLite test database

## Project Structure

```text
frontend/
  src/
    App.jsx          React application and dashboard UI
    api.js           Centralized API request helper
    auth.js          Token storage helpers
    index.css        Application styles
  Dockerfile
  package.json

backend/
  main.py            FastAPI routes, schemas, and authentication
  models.py          SQLAlchemy User and Task models
  database.py        Environment-configured SQLAlchemy engine
  entrypoint.sh      Runs Alembic before starting Uvicorn
  Dockerfile
  requirements.txt
  requirements-test.txt
  tests/
    conftest.py      Isolated test database fixtures
    test_api.py      Authentication, CRUD, validation, and ownership tests
  alembic/
    env.py
    versions/        Versioned database migrations

compose.yaml         PostgreSQL, backend, and frontend services
.env.example         Environment variable template
README.md            Project documentation
```

## Environment Variables

Copy the example file and replace the placeholders with local values:

```bash
cp .env.example .env
```

The Compose workflow uses:

- `POSTGRES_USER`: PostgreSQL username
- `POSTGRES_PASSWORD`: PostgreSQL password
- `POSTGRES_DB`: PostgreSQL database name
- `POSTGRES_PORT`: Host port mapped to PostgreSQL, default `5432`
- `DATABASE_URL`: Backend SQLAlchemy URL; use the Docker service name `postgres` as the host
- `JWT_SECRET_KEY`: Secret used to sign JWTs; use a long random value
- `JWT_ALGORITHM`: JWT algorithm, default `HS256`
- `JWT_EXPIRE_MINUTES`: JWT lifetime in minutes, default `30`
- `CORS_ORIGINS`: Comma-separated allowed frontend origins
- `VITE_API_URL`: Backend URL embedded into the frontend production build
- `BACKEND_PORT`: Host port mapped to the backend, default `8000`
- `FRONTEND_PORT`: Host port mapped to the frontend, default `5173`

Do not commit `.env`. The repository includes placeholders only in `.env.example`.

## Local Development

1. Clone the repository and enter the project directory.
2. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `DATABASE_URL`, and `JWT_SECRET_KEY`.
3. Start the development environment:

   ```bash
   docker compose up --build
   ```

4. The PostgreSQL service becomes healthy before the backend starts.
5. The backend container automatically runs `alembic upgrade head` before starting Uvicorn.
6. Open the frontend at [http://localhost:5173](http://localhost:5173).
7. The backend root endpoint is available at [http://localhost:8000](http://localhost:8000).

## Manual Migration

Compose applies migrations automatically during backend startup. To apply migrations manually while developing:

```bash
docker compose run --rm backend alembic upgrade head
```

The current migration head is `0002`.

## Testing

Install the test-only dependency set:

```bash
python3 -m pip install -r backend/requirements-test.txt
```

Run the backend suite:

```bash
python3 -m pytest -q backend
```

The suite currently contains 14 tests covering authentication, protected routes, task validation, CRUD behavior, timestamps, and ownership isolation. Tests use a disposable in-memory database and do not modify the development PostgreSQL database.

## Frontend Checks

Run from `frontend/`:

```bash
npm ci
npm run lint
npm run build
npm audit
```

## API Overview

- `GET /`: backend health message
- `POST /auth/register`: register a user with email and password
- `POST /auth/login`: return a bearer JWT
- `GET /tasks`: list tasks owned by the authenticated user
- `POST /tasks`: create a task owned by the authenticated user
- `PATCH /tasks/{task_id}`: update an owned task
- `DELETE /tasks/{task_id}`: delete an owned task

Task requests support `title`, `description`, `status`, `priority`, and `due_date`. Ownership, IDs, and timestamps are controlled by the backend.

## Security Notes

- Passwords are hashed with bcrypt and plaintext passwords are not returned by the API.
- JWTs are signed with an environment-provided secret and include an expiration time.
- Protected task routes derive ownership from the authenticated JWT user, not the request body.
- Database credentials and JWT secrets are supplied through environment variables.
- CORS allows configured origins only; the local default is `http://localhost:5173`.
- The frontend stores the bearer token in browser localStorage for this deliberately simple portfolio architecture.

## Deployment

The current deployment workflow is Docker Compose oriented rather than cloud-provider specific. Compose builds the backend and frontend images, starts PostgreSQL with a persistent volume, waits for PostgreSQL readiness, runs Alembic migrations, starts FastAPI on `0.0.0.0:8000`, and serves the frontend on port `5173`.

For a production deployment, provide strong environment-specific secrets, configure `CORS_ORIGINS` and `VITE_API_URL` for the deployed origins, protect the PostgreSQL volume, and review whether application-startup migrations should remain enabled in a multi-instance deployment.
