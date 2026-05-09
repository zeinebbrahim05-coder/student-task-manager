/**
 * TaskFlow — Student Task Manager
 * script.js
 *
 * Architecture:
 *  - State:   Plain JS array of task objects, persisted to localStorage
 *  - Render:  Full re-render on every state mutation (simple & reliable)
 *  - Events:  Event delegation on the task list for performance
 */

'use strict';

/* ═══════════════════════════════════════════════
   1.  STATE & STORAGE
═══════════════════════════════════════════════ */

const STORAGE_KEY = 'taskflow_tasks_v1';

/** @type {Task[]} In-memory task array */
let tasks = [];

/**
 * @typedef {Object} Task
 * @property {string}  id        - Unique identifier (timestamp-based)
 * @property {string}  title     - Task description
 * @property {string}  subject   - Subject / course label
 * @property {string}  dueDate   - ISO date string (YYYY-MM-DD) or ''
 * @property {'high'|'medium'|'low'} priority
 * @property {boolean} completed
 * @property {number}  createdAt - Unix timestamp
 */

/** Load tasks from localStorage (with graceful fallback) */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
}

/** Persist tasks to localStorage */
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/** Generate a simple unique ID */
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ═══════════════════════════════════════════════
   2.  DOM REFERENCES
═══════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const taskList       = $('task-list');
const emptyState     = $('empty-state');
const addTaskForm    = $('add-task-form');
const taskInput      = $('task-input');
const subjectInput   = $('subject-input');
const dueDateInput   = $('due-date-input');
const formError      = $('form-error');
const searchInput    = $('search-input');
const sortSelect     = $('sort-select');
const clearDoneBtn   = $('clear-completed-btn');
const menuToggle     = $('menu-toggle');
const sidebar        = $('sidebar');
const pageDate       = $('page-date');
const progressPct    = $('progress-pct');
const ringFill       = $('ring-fill');
const badgeAll       = $('badge-all');
const badgeActive    = $('badge-active');
const badgeCompleted = $('badge-completed');
const toastContainer = $('toast-container');

/* Track active filter and selected priority */
let activeFilter   = 'all';     // 'all' | 'active' | 'completed'
let activePriority = 'medium';  // 'high' | 'medium' | 'low'

/* ═══════════════════════════════════════════════
   3.  RENDERING
═══════════════════════════════════════════════ */

/**
 * Main render function — call after any state change.
 * Filters, sorts, then builds the task list DOM.
 */
function render() {
  const query = searchInput.value.trim().toLowerCase();
  const sort  = sortSelect.value;

  /* ── Filter ── */
  let visible = tasks.filter(t => {
    if (activeFilter === 'active'    && t.completed) return false;
    if (activeFilter === 'completed' && !t.completed) return false;
    if (query && !t.title.toLowerCase().includes(query)
              && !t.subject.toLowerCase().includes(query)) return false;
    return true;
  });

  /* ── Sort ── */
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  visible.sort((a, b) => {
    switch (sort) {
      case 'due':
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      case 'priority':
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      case 'alpha':
        return a.title.localeCompare(b.title);
      default: // 'created'
        return b.createdAt - a.createdAt;
    }
  });

  /* ── Build DOM ── */
  taskList.innerHTML = '';

  if (visible.length === 0) {
    emptyState.classList.add('visible');
  } else {
    emptyState.classList.remove('visible');
    const frag = document.createDocumentFragment();
    visible.forEach(task => frag.appendChild(buildTaskCard(task)));
    taskList.appendChild(frag);
  }

  updateMetrics();
}

/**
 * Build a single task card <li> element.
 * @param {Task} task
 * @returns {HTMLLIElement}
 */
function buildTaskCard(task) {
  const li = document.createElement('li');
  li.className = `task-card${task.completed ? ' completed' : ''}`;
  li.dataset.id       = task.id;
  li.dataset.priority = task.priority;

  /* ── Due date formatting & overdue check ── */
  let dueMeta = '';
  if (task.dueDate) {
    const today    = new Date(); today.setHours(0,0,0,0);
    const due      = new Date(task.dueDate + 'T00:00:00'); // force local TZ
    const isOverdue = !task.completed && due < today;
    const label    = formatDate(due);
    dueMeta = `
      <span class="meta-pill ${isOverdue ? 'overdue' : ''}">
        <i class="ph-bold ph-calendar-blank"></i>
        ${isOverdue ? '⚠ ' : ''}${label}
      </span>`;
  }

  /* ── Subject pill ── */
  const subjectMeta = task.subject
    ? `<span class="meta-pill"><i class="ph-bold ph-book-open"></i>${escHtml(task.subject)}</span>`
    : '';

  /* ── Priority badge ── */
  const priorityLabel = { high: 'High', medium: 'Med', low: 'Low' }[task.priority];
  const priorityBadge = `
    <span class="task-priority-badge ${task.priority}">
      <span class="dot dot-${task.priority}"></span>${priorityLabel}
    </span>`;

  li.innerHTML = `
    <!-- Toggle complete -->
    <button class="task-checkbox" data-action="toggle" aria-label="Mark complete" aria-pressed="${task.completed}"></button>

    <!-- Body -->
    <div class="task-body">
      <p class="task-title">${escHtml(task.title)}</p>
      <div class="task-meta">
        ${priorityBadge}
        ${subjectMeta}
        ${dueMeta}
      </div>
    </div>

    <!-- Actions -->
    <div class="task-actions">
      <button class="icon-btn delete" data-action="delete" aria-label="Delete task" title="Delete">
        <i class="ph-bold ph-trash"></i>
      </button>
    </div>
  `;

  return li;
}

/**
 * Format a Date object to a friendly string.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff  = Math.round((date - today) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Escape HTML special characters */
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Update sidebar metrics, badges, progress ring ── */
function updateMetrics() {
  const total     = tasks.length;
  const done      = tasks.filter(t => t.completed).length;
  const active    = total - done;
  const pct       = total === 0 ? 0 : Math.round((done / total) * 100);

  /* Badges */
  badgeAll.textContent       = total;
  badgeActive.textContent    = active;
  badgeCompleted.textContent = done;

  /* Progress ring — circumference = 2π × 32 ≈ 201 */
  const circumference = 2 * Math.PI * 32;
  const offset        = circumference - (pct / 100) * circumference;
  ringFill.style.strokeDasharray  = circumference;
  ringFill.style.strokeDashoffset = offset;
  progressPct.textContent = `${pct}%`;
}

/* ── Set today's date in the topbar ── */
function setPageDate() {
  const opts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  pageDate.textContent = new Date().toLocaleDateString('en-US', opts);
}

/* ═══════════════════════════════════════════════
   4.  TASK OPERATIONS
═══════════════════════════════════════════════ */

/**
 * Add a new task to the array.
 * @param {string} title
 * @param {string} subject
 * @param {string} dueDate
 * @param {string} priority
 */
function addTask(title, subject, dueDate, priority) {
  /** @type {Task} */
  const task = {
    id:        uid(),
    title:     title.trim(),
    subject:   subject.trim(),
    dueDate:   dueDate,
    priority:  priority,
    completed: false,
    createdAt: Date.now(),
  };
  tasks.unshift(task); // most-recent-first by default
  saveTasks();
  render();
  showToast(`Task added`, 'success', 'ph-check-circle');
}

/**
 * Toggle the completed state of a task.
 * @param {string} id
 */
function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
  showToast(
    task.completed ? 'Marked as done!' : 'Marked as active',
    task.completed ? 'success' : 'info',
    task.completed ? 'ph-check-circle' : 'ph-circle-dashed'
  );
}

/**
 * Delete a task by id.
 * @param {string} id
 */
function deleteTask(id) {
  const card = taskList.querySelector(`[data-id="${id}"]`);

  /* Animate card out before removing from state */
  if (card) {
    card.style.transition = 'opacity .2s, transform .2s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(20px)';
    setTimeout(() => {
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      render();
    }, 200);
  } else {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }
  showToast('Task deleted', 'danger', 'ph-trash');
}

/** Remove all completed tasks */
function clearCompleted() {
  const count = tasks.filter(t => t.completed).length;
  if (count === 0) {
    showToast('No completed tasks to clear', 'info', 'ph-info');
    return;
  }
  tasks = tasks.filter(t => !t.completed);
  saveTasks();
  render();
  showToast(`Cleared ${count} completed task${count > 1 ? 's' : ''}`, 'success', 'ph-trash');
}

/* ═══════════════════════════════════════════════
   5.  TOAST NOTIFICATIONS
═══════════════════════════════════════════════ */

/**
 * Display a transient toast notification.
 * @param {string} message
 * @param {'success'|'danger'|'info'} type
 * @param {string} icon  - Phosphor icon class suffix (e.g. 'ph-check-circle')
 */
function showToast(message, type = 'info', icon = 'ph-info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="ph-bold ${icon}"></i> ${message}`;
  toastContainer.appendChild(toast);

  /* Auto-dismiss after 2.8 s */
  setTimeout(() => {
    toast.classList.add('exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

/* ═══════════════════════════════════════════════
   6.  EVENT LISTENERS
═══════════════════════════════════════════════ */

/* ── Form submission — add task ── */
addTaskForm.addEventListener('submit', e => {
  e.preventDefault();
  formError.textContent = '';

  const title = taskInput.value.trim();
  if (!title) {
    formError.textContent = 'Please enter a task title.';
    taskInput.focus();
    return;
  }

  addTask(title, subjectInput.value, dueDateInput.value, activePriority);

  /* Reset form */
  taskInput.value   = '';
  subjectInput.value = '';
  dueDateInput.value = '';
  taskInput.focus();
});

/* ── Priority buttons in the form ── */
document.querySelectorAll('.priority-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.priority-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    activePriority = btn.dataset.priority;
  });
});

/* ── Event delegation on the task list ── */
/* Handles toggle + delete without attaching listeners to each card */
taskList.addEventListener('click', e => {
  const card   = e.target.closest('.task-card');
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!card) return;
  const id = card.dataset.id;

  if (action === 'toggle') toggleTask(id);
  if (action === 'delete') deleteTask(id);
});

/* ── Filter navigation ── */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    render();
  });
});

/* ── Search (live filter) ── */
let searchTimeout;
searchInput.addEventListener('input', () => {
  /* Debounce so render doesn't fire on every keystroke */
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(render, 180);
});

/* ── Sort ── */
sortSelect.addEventListener('change', render);

/* ── Clear completed ── */
clearDoneBtn.addEventListener('click', clearCompleted);

/* ── Mobile sidebar toggle ── */
menuToggle.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

/* Close sidebar when clicking outside on mobile */
document.addEventListener('click', e => {
  if (window.innerWidth <= 768
      && sidebar.classList.contains('open')
      && !sidebar.contains(e.target)
      && !menuToggle.contains(e.target)) {
    sidebar.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

/* ── Keyboard shortcut: Ctrl/Cmd + K to focus search ── */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
});

/* ═══════════════════════════════════════════════
   7.  INITIALISATION
═══════════════════════════════════════════════ */
(function init() {
  setPageDate();
  loadTasks();
  render();
})();
