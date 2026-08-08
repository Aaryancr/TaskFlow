import {useEffect,useState} from "react";

function App() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
useEffect(()=>{async function fetchTasks(){
const response = await fetch("http://localhost:8000/tasks");
const data=await response.json();
console.log(data);
setTasks(data);
}
fetchTasks();
},[]);
    async function addTask(){
     if (newTask===""){
    return;
  }
   const response=await fetch("http://localhost:8000/tasks",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({title:newTask})
  });
  const task=await response.json();

  setTasks([...tasks,task])
  setNewTask("");}
  async function deleteTask(id) {
    await fetch(`http://localhost:8000/tasks/${id}`, {
      method: "DELETE"
    });
    setTasks(tasks.filter(task => task.id !== id));
  }
  async function updateTask(id) {
    const response = await fetch(`http://localhost:8000/tasks/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: editTitle })
    });
    const updatedTask = await response.json();
    setTasks(tasks.map(task => task.id === id ? updatedTask : task));
    setEditingId(null);
    setEditTitle("");
  }
    
     return (
   <div>
  <h1>TaskFlow</h1>

  <input
   value={newTask}
  onChange={(event) => setNewTask(event.target.value)} />
  <button onClick={addTask}>Add Task</button>


  <ul>
  {tasks.map((task) => (
    <li key={task.id}>
      {editingId === task.id ? (
        <>
          <input
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
          />

          <button onClick={() => updateTask(task.id)}>
            Save
          </button>
        </>
      ) : (
        <>
          {task.title}

          <button
            onClick={() => {
              setEditingId(task.id);
              setEditTitle(task.title);
            }}
          >
            Edit
          </button>
        </>
      )}

      <button onClick={() => deleteTask(task.id)}>
        Delete
      </button>
    </li>
  ))}
</ul>
</div>
  );
}

export default App;

