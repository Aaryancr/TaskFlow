import os
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.exc import IntegrityError

from database import SessionLocal
from models import Task, User

class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["todo", "in_progress", "completed"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["todo", "in_progress", "completed"] | None = None
    priority: Literal["low", "medium", "high"] | None = None
    due_date: date | None = None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_update_title(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Title cannot be null")
        if not isinstance(value, str):
            raise ValueError("Title must be a string")
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value

    @field_validator("description")
    @classmethod
    def normalize_update_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("status", "priority", mode="before")
    @classmethod
    def reject_null_choice(cls, value: str | None, info) -> str:
        if value is None:
            raise ValueError(f"{info.field_name} cannot be null")
        return value


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: datetime


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    status: Literal["todo", "in_progress", "completed"]
    priority: Literal["low", "medium", "high"]
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    user_id: int


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "30"))
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: int) -> str:
    if not JWT_SECRET_KEY:
        raise HTTPException(status_code=500, detail="JWT secret is not configured")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def authentication_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None or not JWT_SECRET_KEY:
        raise authentication_error()

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        subject = payload.get("sub")
        user_id = int(subject)
    except (JWTError, TypeError, ValueError):
        raise authentication_error()

    db = SessionLocal()
    try:
        current_user = db.query(User).filter(User.id == user_id).first()
        if current_user is None:
            raise authentication_error()
        return current_user
    finally:
        db.close()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/tasks", response_model=list[TaskResponse])
def get_tasks(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        return db.query(Task).filter(Task.user_id == current_user.id).all()
    finally:
        db.close()

@app.get("/")
def home():
    return {
        "message": "TaskFlow API is running"
    }


@app.post("/auth/register", response_model=UserResponse, status_code=201)
def register(user: UserRegister):
    db = SessionLocal()

    try:
        existing_user = db.query(User).filter(User.email == user.email).first()
        if existing_user is not None:
            raise HTTPException(status_code=400, detail="Email already registered")

        new_user = User(
            email=user.email,
            password_hash=pwd_context.hash(user.password),
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return new_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    finally:
        db.close()


@app.post("/auth/login")
def login(credentials: UserLogin):
    db = SessionLocal()

    try:
        user = db.query(User).filter(User.email == credentials.email).first()
        if user is None or not pwd_context.verify(credentials.password, user.password_hash):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return {
            "access_token": create_access_token(user.id),
            "token_type": "bearer",
        }
    finally:
        db.close()


@app.post("/tasks", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        new_task = Task(
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
            user_id=current_user.id,
        )

        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        return new_task
    finally:
        db.close()


@app.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task: TaskUpdate,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        taskupdate = db.query(Task).filter(
            Task.id == task_id,
            Task.user_id == current_user.id,
        ).first()
        if taskupdate is None:
            raise HTTPException(status_code=404, detail="Task not found")
        updates = task.model_dump(exclude_unset=True)
        for field_name, value in updates.items():
            setattr(taskupdate, field_name, value)
        db.commit()
        db.refresh(taskupdate)
        return taskupdate
    finally:
        db.close()


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        taskdelete = db.query(Task).filter(
            Task.id == task_id,
            Task.user_id == current_user.id,
        ).first()
        if taskdelete is None:
            raise HTTPException(status_code=404, detail="Task not found")
        db.delete(taskdelete)
        db.commit()
        return {"message": "Task deleted successfully"}
    finally:
        db.close()
