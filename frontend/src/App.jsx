import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { clearToken, hasToken, saveToken } from "./auth.js";

const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const TASK_STATUS_VALUES = new Set(TASK_STATUS_OPTIONS.map((option) => option.value));
const TASK_PRIORITY_VALUES = new Set(TASK_PRIORITY_OPTIONS.map((option) => option.value));

const TASK_DUE_FILTER_OPTIONS = [
  { value: "all", label: "All due dates" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "none", label: "No due date" },
];

function getTaskDateKey(value) {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
}

function getTodayDateKey() {
  const today = new Date();
  return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
}

function formatTaskDueDate(value) {
  const dateKey = getTaskDateKey(value);
  if (!dateKey) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getDueDateState(task) {
  const dueDateKey = getTaskDateKey(task.due_date);
  const todayKey = getTodayDateKey();

  return {
    isToday: dueDateKey === todayKey,
    isOverdue: Boolean(dueDateKey && dueDateKey < todayKey && task.status !== "completed"),
  };
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesDueDateFilter(task, filter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "none") {
    return !task.due_date;
  }

  const dueDateKey = getTaskDateKey(task.due_date);
  if (!dueDateKey) {
    return false;
  }

  const todayKey = getTodayDateKey();
  if (filter === "today") {
    return dueDateKey === todayKey;
  }

  if (filter === "upcoming") {
    return dueDateKey > todayKey;
  }

  return filter === "overdue" && dueDateKey < todayKey && task.status !== "completed";
}

function AuthShell({ children, eyebrow, title, description }) {
  return (
    <main className="auth-shell">
      <section className="auth-frame">
        <aside className="auth-intro">
          <div className="brand-mark">TF</div>
          <p className="eyebrow">TaskFlow workspace</p>
          <h1>Make room for the work that matters.</h1>
          <p className="intro-copy">
            A clear, focused home for the tasks moving your next idea forward.
          </p>
          <div className="intro-note">
            <span className="note-dot" />
            Simple task management, built to stay out of your way.
          </div>
        </aside>

        <section className="auth-card" aria-labelledby="auth-title">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="auth-title">{title}</h2>
          <p className="card-description">{description}</p>
          {children}
        </section>
      </section>
    </main>
  );
}

function LoginForm({ notice, onLogin, onShowRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await apiRequest("/auth/login", {
        method: "POST",
        body: { email: normalizedEmail, password },
      });

      if (!response?.access_token) {
        throw new Error("Login did not return an access token.");
      }

      onLogin(response.access_token);
    } catch (requestError) {
      setError(requestError.message || "Unable to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error-message" role="alert">{error}</div>}

      <label htmlFor="login-email">Email</label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
      />

      <label htmlFor="login-password">Password</label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Enter your password"
        required
      />

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log in"}
      </button>

      <p className="switch-prompt">
        New to TaskFlow?{" "}
        <button className="text-button" type="button" onClick={onShowRegister}>
          Create an account
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onRegistered, onShowLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password || !confirmPassword) {
      setError("Complete all fields to create your account.");
      return;
    }

    if (!normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: { email: normalizedEmail, password },
      });
      onRegistered();
    } catch (requestError) {
      setError(requestError.message || "Unable to register. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && <div className="error-message" role="alert">{error}</div>}

      <label htmlFor="register-email">Email</label>
      <input
        id="register-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
      />

      <label htmlFor="register-password">Password</label>
      <input
        id="register-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Create a password"
        required
      />

      <label htmlFor="register-confirm-password">Confirm password</label>
      <input
        id="register-confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        placeholder="Repeat your password"
        required
      />

      <button className="primary-button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>

      <p className="switch-prompt">
        Already have an account?{" "}
        <button className="text-button" type="button" onClick={onShowLogin}>
          Log in
        </button>
      </p>
    </form>
  );
}

function TaskDialog({
  mode,
  value,
  descriptionValue,
  status,
  priority,
  dueDate,
  error,
  isSubmitting,
  onChange,
  onDescriptionChange,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onClose,
  onSubmit,
}) {
  const inputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(isSubmitting);
  const isEditing = mode === "edit";
  const title = isEditing ? "Edit task" : "Add a task";
  const description = isEditing
    ? "Make a small adjustment to keep this task clear."
    : "Give your next useful step a short, clear title.";

  useEffect(() => {
    onCloseRef.current = onClose;
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting, onClose]);

  useEffect(() => {
    const previousActiveElement = document.activeElement;

    inputRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        onCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, []);

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        aria-describedby="task-dialog-description"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Task details</p>
            <h2 id="task-dialog-title">{title}</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close dialog">
            Close
          </button>
        </div>
        <p className="dialog-description" id="task-dialog-description">{description}</p>

        <form className="dialog-form" onSubmit={onSubmit}>
          <div className="dialog-field">
            <div className="dialog-label-row">
              <label htmlFor="dialog-task-title">Task title</label>
              <span className="field-hint">{value.length}/200</span>
            </div>
            <input
              ref={inputRef}
              id="dialog-task-title"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="e.g. Prepare project notes"
              maxLength={200}
              disabled={isSubmitting}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "dialog-task-error" : undefined}
            />
          </div>
          <div className="dialog-field">
            <div className="dialog-label-row">
              <label htmlFor="dialog-task-description">Description</label>
              <span className="field-hint">{descriptionValue.length}/2000</span>
            </div>
            <textarea
              id="dialog-task-description"
              value={descriptionValue}
              onChange={(event) => onDescriptionChange(event.target.value)}
              placeholder="Add a little context (optional)"
              maxLength={2000}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className="dialog-field-grid">
            <div className="dialog-field">
              <label htmlFor="dialog-task-status">Status</label>
              <select
                id="dialog-task-status"
                value={status}
                onChange={(event) => onStatusChange(event.target.value)}
                disabled={isSubmitting}
              >
                {!status && <option value="" disabled>Select status</option>}
                {TASK_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="dialog-field">
              <label htmlFor="dialog-task-priority">Priority</label>
              <select
                id="dialog-task-priority"
                value={priority}
                onChange={(event) => onPriorityChange(event.target.value)}
                disabled={isSubmitting}
              >
                {!priority && <option value="" disabled>Select priority</option>}
                {TASK_PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="dialog-field">
            <label htmlFor="dialog-task-due-date">Due date <span className="field-optional">Optional</span></label>
            <input
              id="dialog-task-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => onDueDateChange(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          {error && <p className="dialog-error" id="dialog-task-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? "Saving..." : "Adding...") : (isEditing ? "Save changes" : "Add task")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DeleteDialog({ task, error, isDeleting, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  const isDeletingRef = useRef(isDeleting);

  useEffect(() => {
    onCancelRef.current = onCancel;
    isDeletingRef.current = isDeleting;
  }, [isDeleting, onCancel]);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    cancelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isDeletingRef.current) {
        onCancelRef.current();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <section
        className="task-dialog delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow danger-eyebrow">Permanent action</p>
            <h2 id="delete-dialog-title">Delete this task?</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onCancel} disabled={isDeleting} aria-label="Close dialog">
            Close
          </button>
        </div>
        <p className="dialog-description" id="delete-dialog-description">
          <strong>&quot;{task.title}&quot;</strong> will be removed from your task list. This action cannot be easily undone.
        </p>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button ref={cancelRef} className="secondary-button" type="button" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete task"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TaskRow({ task, savingId, deletingId, onEdit, onDelete }) {
  const isSaving = savingId === task.id;
  const isDeleting = deletingId === task.id;
  const isBusy = isSaving || isDeleting;
  const statusLabel = TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label || task.status;
  const priorityLabel = TASK_PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label || task.priority;
  const statusMarker = task.status === "completed" ? "C" : task.status === "in_progress" ? "I" : "T";
  const priorityMarker = task.priority === "high" ? "H" : task.priority === "low" ? "L" : "M";
  const { isToday, isOverdue } = getDueDateState(task);
  const rowClassName = `task-row${task.status === "completed" ? " completed" : ""}${isOverdue ? " overdue" : ""}`;

  return (
    <li className={rowClassName}>
      <div className="task-copy">
        <span className="task-title">{task.title}</span>
        {task.description && <p className="task-description" title={task.description}>{task.description}</p>}
        <div className="task-meta" aria-label="Task details">
          <span className={`task-meta-pill status-${task.status}`}>
            <span className="task-meta-marker" aria-hidden="true">{statusMarker}</span>
            {statusLabel}
          </span>
          <span className={`task-meta-pill priority-${task.priority}`}>
            <span className="task-meta-marker" aria-hidden="true">{priorityMarker}</span>
            {priorityLabel}
          </span>
          {task.due_date && (
            <span className={`task-meta-pill due-pill${isOverdue ? " overdue" : ""}${isToday ? " due-today" : ""}`}>
              <span className="task-meta-marker" aria-hidden="true">{isOverdue ? "!" : "D"}</span>
              {isOverdue ? `Overdue: ${formatTaskDueDate(task.due_date)}` : isToday ? "Due today" : `Due ${formatTaskDueDate(task.due_date)}`}
            </span>
          )}
        </div>
      </div>
      <div className="task-actions">
        <button className="task-action" type="button" onClick={() => onEdit(task)} disabled={isBusy} aria-label={`Edit task: ${task.title}`}>
          Edit
        </button>
        <button className="task-action danger" type="button" onClick={() => onDelete(task)} disabled={isBusy} aria-label={`Delete task: ${task.title}`}>
          <span className="task-action-marker" aria-hidden="true">!</span>
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </li>
  );
}

function DashboardSidebar({ onLogout }) {
  return (
    <aside className="dashboard-sidebar" aria-label="Primary navigation">
      <div>
        <div className="sidebar-brand">
          <div className="brand-mark small">TF</div>
          <span>TaskFlow</span>
        </div>

        <nav className="sidebar-nav">
          <a className="sidebar-nav-item active" href="#overview" aria-current="page">
            <span className="nav-icon">D</span>
            Dashboard
          </a>
          <a className="sidebar-nav-item" href="#tasks">
            <span className="nav-icon">T</span>
            Tasks
          </a>
        </nav>
      </div>

      <div className="sidebar-footer">
        <p>Small steps add up.</p>
        <button className="sidebar-logout" type="button" onClick={onLogout}>
          <span className="nav-icon">&gt;</span>
          Log out
        </button>
      </div>
    </aside>
  );
}

function DashboardHeader({ onLogout }) {
  return (
    <header className="dashboard-header">
      <div>
        <p className="eyebrow">Dashboard</p>
        <h1>Good to see you.</h1>
        <p className="header-context">A clear view of the work in your personal workspace.</p>
      </div>

      <div className="account-area">
        <div className="account-avatar" aria-hidden="true">TF</div>
        <div className="account-copy">
          <strong>My workspace</strong>
          <span>Signed in</span>
        </div>
        <button className="header-logout" type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

function SummaryCard({ label, value, detail, tone = "default", featured = false, marker }) {
  return (
    <article className={`summary-card tone-${tone}${featured ? " featured" : ""}`}>
      <div className="summary-card-topline">
        <span>{label}</span>
        <span className="summary-mark" aria-hidden="true">{marker}</span>
      </div>
      <strong className="summary-value">{value}</strong>
      <span className="summary-detail">{detail}</span>
    </article>
  );
}

function TaskFilters({
  searchQuery,
  statusFilter,
  priorityFilter,
  dueDateFilter,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onClear,
}) {
  return (
    <div className="task-filters" role="search" aria-label="Search and filter tasks">
      <div className="task-search-field">
        <label className="sr-only" htmlFor="task-search">Search tasks</label>
        <input
          id="task-search"
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search title or description"
        />
      </div>

      <div className="task-filter-field">
        <label htmlFor="task-status-filter">Status</label>
        <select id="task-status-filter" value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="all">All statuses</option>
          {TASK_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="task-filter-field">
        <label htmlFor="task-priority-filter">Priority</label>
        <select id="task-priority-filter" value={priorityFilter} onChange={(event) => onPriorityChange(event.target.value)}>
          <option value="all">All priorities</option>
          {TASK_PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="task-filter-field">
        <label htmlFor="task-due-filter">Due date</label>
        <select id="task-due-filter" value={dueDateFilter} onChange={(event) => onDueDateChange(event.target.value)}>
          {TASK_DUE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <button className="clear-filters-button" type="button" onClick={onClear} disabled={!hasActiveFilters}>
        Clear filters
      </button>
    </div>
  );
}

function AuthenticatedTaskWorkspace({ onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStatus, setCreateStatus] = useState("todo");
  const [createPriority, setCreatePriority] = useState("medium");
  const [createDueDate, setCreateDueDate] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editError, setEditError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");

  const normalizedQuery = normalizeSearchText(searchQuery);
  const taskMetrics = tasks.reduce(
    (counts, task) => {
      counts.total += 1;
      if (task.status === "todo") counts.todo += 1;
      if (task.status === "in_progress") counts.inProgress += 1;
      if (task.status === "completed") counts.completed += 1;
      if (getDueDateState(task).isOverdue) counts.overdue += 1;
      return counts;
    },
    { total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0 },
  );
  const filteredTasks = tasks.filter((task) => {
    const searchableText = normalizeSearchText(`${task.title} ${task.description || ""}`);
    const matchesSearch = !normalizedQuery || searchableText.includes(normalizedQuery);
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesDueDateFilter(task, dueDateFilter);
  });
  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    dueDateFilter !== "all",
  );

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    let isCurrent = true;

    async function loadTasks() {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await apiRequest("/tasks", {
          authenticated: true,
          onUnauthorized: onLogout,
        });
        if (isCurrent) {
          setTasks(Array.isArray(response) ? response : []);
        }
      } catch (requestError) {
        if (requestError.status === 401) {
          return;
        }
        if (isCurrent) {
          setLoadError(requestError.message || "Unable to load your tasks.");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadTasks();
    return () => {
      isCurrent = false;
    };
  }, [onLogout, reloadKey]);

  function openCreateDialog() {
    setCreateTitle("");
    setCreateDescription("");
    setCreateStatus("todo");
    setCreatePriority("medium");
    setCreateDueDate("");
    setCreateError("");
    setIsCreateOpen(true);
  }

  function resetCreateForm() {
    setCreateTitle("");
    setCreateDescription("");
    setCreateStatus("todo");
    setCreatePriority("medium");
    setCreateDueDate("");
    setCreateError("");
  }

  function retryLoading() {
    setReloadKey((currentKey) => currentKey + 1);
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setDueDateFilter("all");
  }

  function startEditing(task) {
    setEditError("");
    setNotice("");
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status ?? "");
    setEditPriority(task.priority ?? "");
    setEditDueDate(task.due_date ?? "");
  }

  function cancelEditing() {
    setEditingTask(null);
    setEditTitle("");
    setEditDescription("");
    setEditStatus("");
    setEditPriority("");
    setEditDueDate("");
    setEditError("");
  }

  function openDeleteDialog(task) {
    setDeleteError("");
    setDeletingTask(task);
  }

  async function handleCreate(event) {
    event.preventDefault();
    const title = createTitle.trim();
    const description = createDescription.trim();

    if (!title) {
      setCreateError("Enter a task title before adding a task.");
      return;
    }

    if (title.length > 200) {
      setCreateError("Task titles must be 200 characters or fewer.");
      return;
    }

    if (description.length > 2000) {
      setCreateError("Descriptions must be 2,000 characters or fewer.");
      return;
    }

    if (!TASK_STATUS_VALUES.has(createStatus)) {
      setCreateError("Choose a valid task status.");
      return;
    }

    if (!TASK_PRIORITY_VALUES.has(createPriority)) {
      setCreateError("Choose a valid task priority.");
      return;
    }

    setIsCreating(true);
    setCreateError("");
    setNotice("");

    try {
      const payload = {
        title,
        status: createStatus,
        priority: createPriority,
      };

      if (description) {
        payload.description = description;
      }

      if (createDueDate) {
        payload.due_date = createDueDate;
      }

      const task = await apiRequest("/tasks", {
        method: "POST",
        authenticated: true,
        onUnauthorized: onLogout,
        body: payload,
      });
      setTasks((currentTasks) => [task, ...currentTasks]);
      resetCreateForm();
      setIsCreateOpen(false);
      setNotice("Task added.");
    } catch (requestError) {
      if (requestError.status !== 401) {
        setCreateError(requestError.message || "Unable to add the task.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();
    if (!editingTask) {
      return;
    }

    const taskId = editingTask.id;
    const title = editTitle.trim();

    if (!title) {
      setEditError("A task title cannot be empty.");
      return;
    }

    const description = editDescription.trim();

    if (title.length > 200) {
      setEditError("Task titles must be 200 characters or fewer.");
      return;
    }

    if (description.length > 2000) {
      setEditError("Descriptions must be 2,000 characters or fewer.");
      return;
    }

    if (!TASK_STATUS_VALUES.has(editStatus)) {
      setEditError("Choose a valid task status.");
      return;
    }

    if (!TASK_PRIORITY_VALUES.has(editPriority)) {
      setEditError("Choose a valid task priority.");
      return;
    }

    setSavingId(taskId);
    setEditError("");
    setNotice("");

    try {
      const payload = {
        title,
        description: description || null,
        status: editStatus,
        priority: editPriority,
        due_date: editDueDate || null,
      };
      const updatedTask = await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        authenticated: true,
        onUnauthorized: onLogout,
        body: payload,
      });
      setTasks((currentTasks) =>
        currentTasks.map((task) => (task.id === taskId ? updatedTask : task)),
      );
      cancelEditing();
      setNotice("Task updated.");
    } catch (requestError) {
      if (requestError.status !== 401) {
        setEditError(requestError.message || "Unable to update the task.");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete() {
    if (!deletingTask) {
      return;
    }

    const taskId = deletingTask.id;
    setDeletingId(taskId);
    setDeleteError("");
    setNotice("");

    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "DELETE",
        authenticated: true,
        onUnauthorized: onLogout,
      });
      setTasks((currentTasks) => currentTasks.filter((item) => item.id !== taskId));
      setDeletingTask(null);
      setNotice("Task deleted.");
    } catch (requestError) {
      if (requestError.status !== 401) {
        setDeleteError(requestError.message || "Unable to delete the task.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="dashboard-shell">
      <DashboardSidebar onLogout={onLogout} />

      <main className="dashboard-main">
        <DashboardHeader onLogout={onLogout} />

        <div className="dashboard-content" id="overview">
          <section className="summary-grid" aria-label="Task summary">
            <SummaryCard
              label="Total tasks"
              value={taskMetrics.total}
              detail="All loaded tasks"
              marker="A"
              featured
            />
            <SummaryCard
              label="Todo"
              value={taskMetrics.todo}
              detail="Ready to start"
              marker="T"
              tone="todo"
            />
            <SummaryCard
              label="In progress"
              value={taskMetrics.inProgress}
              detail="Currently moving"
              marker="I"
              tone="in-progress"
            />
            <SummaryCard
              label="Completed"
              value={taskMetrics.completed}
              detail="Finished tasks"
              marker="C"
              tone="completed"
            />
            <SummaryCard
              label="Overdue"
              value={taskMetrics.overdue}
              detail="Active past due"
              marker="!"
              tone="overdue"
            />
          </section>

          <section className="tasks-panel" id="tasks" aria-labelledby="tasks-heading">
            <div className="tasks-panel-header">
              <div>
                <p className="eyebrow">Your workspace</p>
                <h2 id="tasks-heading">Task list</h2>
                <p className="panel-description">
                  Search and filter this list; the metrics above reflect all loaded tasks.
                </p>
              </div>
              <button className="primary-button panel-add-button" type="button" onClick={openCreateDialog}>
                Add task
              </button>
            </div>

            {loadError && (
              <div className="dashboard-error" role="alert">
                <span>{loadError}</span>
                <button className="retry-button" type="button" onClick={retryLoading}>
                  Try again
                </button>
              </div>
            )}
            {notice && <div className="notice" role="status">{notice}</div>}

            {!isLoading && tasks.length > 0 && (
              <>
                <TaskFilters
                  searchQuery={searchQuery}
                  statusFilter={statusFilter}
                  priorityFilter={priorityFilter}
                  dueDateFilter={dueDateFilter}
                  hasActiveFilters={hasActiveFilters}
                  onSearchChange={setSearchQuery}
                  onStatusChange={setStatusFilter}
                  onPriorityChange={setPriorityFilter}
                  onDueDateChange={setDueDateFilter}
                  onClear={clearFilters}
                />
                <p className="results-summary" role="status" aria-live="polite">
                  Showing {filteredTasks.length} of {tasks.length} tasks
                </p>
              </>
            )}

            {isLoading ? (
              <div className="loading-state" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                Loading your tasks...
              </div>
            ) : tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" aria-hidden="true">+</div>
                <h3>Your list is ready.</h3>
                <p>No tasks yet. Add the first useful step to get started.</p>
                <button className="primary-button empty-action" type="button" onClick={openCreateDialog}>
                  Add your first task
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="no-results-state">
                <h3>No tasks match your filters.</h3>
                <p>Try a different search or reset the filters to see your full list.</p>
                <button className="secondary-button" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="task-list">
                {filteredTasks.map((task) => (
                  <TaskRow
                  key={task.id}
                  task={task}
                  savingId={savingId}
                  deletingId={deletingId}
                  onEdit={startEditing}
                  onDelete={openDeleteDialog}
                />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      {isCreateOpen && (
        <TaskDialog
          mode="create"
          value={createTitle}
          descriptionValue={createDescription}
          status={createStatus}
          priority={createPriority}
          dueDate={createDueDate}
          error={createError}
          isSubmitting={isCreating}
          onChange={setCreateTitle}
          onDescriptionChange={setCreateDescription}
          onStatusChange={setCreateStatus}
          onPriorityChange={setCreatePriority}
          onDueDateChange={setCreateDueDate}
          onClose={() => {
            if (!isCreating) {
              setIsCreateOpen(false);
              resetCreateForm();
            }
          }}
          onSubmit={handleCreate}
        />
      )}

      {editingTask && (
        <TaskDialog
          mode="edit"
          value={editTitle}
          descriptionValue={editDescription}
          status={editStatus}
          priority={editPriority}
          dueDate={editDueDate}
          error={editError}
          isSubmitting={savingId === editingTask.id}
          onChange={setEditTitle}
          onDescriptionChange={setEditDescription}
          onStatusChange={setEditStatus}
          onPriorityChange={setEditPriority}
          onDueDateChange={setEditDueDate}
          onClose={cancelEditing}
          onSubmit={handleUpdate}
        />
      )}

      {deletingTask && (
        <DeleteDialog
          task={deletingTask}
          error={deleteError}
          isDeleting={deletingId === deletingTask.id}
          onCancel={() => {
            if (!deletingId) {
              setDeletingTask(null);
              setDeleteError("");
            }
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasToken);
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");

  function handleLogin(token) {
    saveToken(token);
    setNotice("");
    setIsAuthenticated(true);
  }

  function handleLogout() {
    clearToken();
    setNotice("");
    setMode("login");
    setIsAuthenticated(false);
  }

  function showRegister() {
    setNotice("");
    setMode("register");
  }

  function showLogin(message = "") {
    setNotice(message);
    setMode("login");
  }

  if (isAuthenticated) {
    return <AuthenticatedTaskWorkspace onLogout={handleLogout} />;
  }

  if (mode === "register") {
    return (
      <AuthShell
        eyebrow="Start simply"
        title="Create your workspace"
        description="Set up your TaskFlow account in a few seconds."
      >
        <RegisterForm
          onRegistered={() => showLogin("Account created. You can log in now.")}
          onShowLogin={() => showLogin()}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Keep your next move clear"
      description="Log in to continue to your TaskFlow workspace."
    >
      <LoginForm
        notice={notice}
        onLogin={handleLogin}
        onShowRegister={showRegister}
      />
    </AuthShell>
  );
}

export default App;
