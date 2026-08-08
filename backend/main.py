from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import engine,SessionLocal
from models import Base,Task
from fastapi import  HTTPException

class TaskCreate(BaseModel):
    title: str

app = FastAPI()
Base.metadata.create_all(bind=engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# tasks=[
            # {
                # "id": 1,
                # "title": "TaskFlow",
            # },
            # {
                # "id": 2,
                # "title": "TaskFlow2",
            # },
            # {
                # "id": 3,
                # "title": "TaskFlow3",
            # }
        # ]
@app.get("/tasks")
def get_tasks():
    db=SessionLocal()
    tasks = db.query(Task).all()
    db.close()
    return tasks

@app.get("/")
def home():
    return {
        "message": "TaskFlow API is running"
    }
@app.post("/tasks")
def create_task(task: TaskCreate):
    db = SessionLocal()

    new_task = Task(
        title=task.title
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    db.close()

    return new_task
@app.patch("/tasks/{task_id}")
def update_task(task_id: int, task: TaskCreate):
    db=SessionLocal()
    taskupdate=db.query(Task).filter(Task.id==task_id).first()
    if taskupdate is None:
        db.close()
        raise HTTPException(status_code=404, detail="Task not found")
    taskupdate.title=task.title
    db.commit()
    db.refresh(taskupdate)
    db.close()
    return taskupdate

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    db=SessionLocal()
    taskdelete=db.query(Task).filter(Task.id==task_id).first()
    if taskdelete is None:
        db.close()
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(taskdelete)
    db.commit()
    db.close()
    return {"message": "Task deleted successfully"}
    