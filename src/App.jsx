import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const API_BASE = "/api";
const API_LABEL = API_BASE.startsWith("http")
    ? new URL(API_BASE).host
    : window.location.host;

const CATEGORIES = [
  { id: "work", label: "Work", color: "#6366f1" },
  { id: "personal", label: "Personal", color: "#f59e0b" },
  { id: "urgent", label: "Urgent", color: "#ef4444" },
  { id: "health", label: "Health", color: "#10b981" },
];

const PRIORITY_CONFIG = {
  high:   { label: "High",   color: "#ef4444", bg: "#fef2f2", dot: "#ef4444" },
  medium: { label: "Medium", color: "#f59e0b", bg: "#fffbeb", dot: "#f59e0b" },
  low:    { label: "Low",    color: "#10b981", bg: "#ecfdf5", dot: "#10b981" },
};

const isOverdue = (deadline, completed) => !completed && deadline && deadline < new Date().toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

const IMPORTABLE_FIELDS = ["title", "description", "priority", "category", "deadline"];

const sanitizeTaskForImport = (task) => {
  const clean = {};
  IMPORTABLE_FIELDS.forEach(field => {
    if (task[field] !== undefined && task[field] !== null) clean[field] = task[field];
  });

  clean.title = String(clean.title || "").trim();
  clean.description = String(clean.description || "");
  const priority = String(clean.priority || "").toLowerCase();
  const category = String(clean.category || "").toLowerCase();
  clean.priority = ["high", "medium", "low"].includes(priority)
      ? priority
      : "medium";
  clean.category = CATEGORIES.some(c => c.id === category) ? category : "work";
  clean.deadline = clean.deadline ? String(clean.deadline).slice(0, 10) : today();
  return clean;
};

const parseImportedTasks = (text) => {
  const parsed = JSON.parse(text);
  const rawTasks = Array.isArray(parsed) ? parsed : parsed.todos || parsed.tasks;

  if (!Array.isArray(rawTasks)) {
    throw new Error("Import file must contain an array of tasks or an object with a todos array.");
  }

  const tasks = rawTasks.map(sanitizeTaskForImport).filter(task => task.title);

  if (tasks.length === 0) {
    throw new Error("No valid tasks found in import file.");
  }

  return tasks;
};

const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const readErrorMessage = async (response) => {
  const text = await response.text();
  if (!text) return `Request failed with status ${response.status}`;

  try {
    const data = JSON.parse(text);
    return data.message || data.error || text;
  } catch {
    return text;
  }
};

// ─── API SERVICE ──────────────────────────────────────────────────────────────
const ApiService = {
  normalizeTodo(todo) {
    return {
      ...todo,
      priority: String(todo.priority || "medium").toLowerCase(),
      category: String(todo.category || "work").toLowerCase(),
      completed: false
    };
  },

  async getTodos() {
    const r = await fetch(`${API_BASE}/todos/all`);
    if (!r.ok) throw new Error(await r.text());

    const data = await r.json();

    return Array.isArray(data) ? data.map(ApiService.normalizeTodo) : [];
  },

  async createTodo(data) {
    const r = await fetch(`${API_BASE}/todos/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizeTaskForImport(data))
    });
    if (!r.ok) throw new Error(await readErrorMessage(r));
    return ApiService.normalizeTodo(await r.json());
  },

  async deleteTodo(id) {
    const r = await fetch(`${API_BASE}/todos/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await readErrorMessage(r));
    return true;
  },

  async exportTodos() {
    const r = await fetch(`${API_BASE}/todos/export`);
    if (!r.ok) throw new Error(await readErrorMessage(r));
    return r.json();
  },

  async importTodos(todos) {
    const r = await fetch(`${API_BASE}/todos/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos: todos.map(sanitizeTaskForImport) })
    });
    if (!r.ok) throw new Error(await readErrorMessage(r));
    return r.json();
  }
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }) {
  return (
      <div style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", flex: 1, minWidth: 0, border: "1.5px solid #f1f5f9" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</p>
            <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 700, color: color || "#1e293b", fontFamily: "'DM Serif Display', serif" }}>{value}</p>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: color ? color + "18" : "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</div>
        </div>
      </div>
  );
}

function TaskCard({ task, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const cat = CATEGORIES.find(c => c.id === task.category);
  // Handles potential case mismatches seamlessly (e.g. "medium" vs "MEDIUM")
  const p = PRIORITY_CONFIG[task.priority?.toLowerCase()] || PRIORITY_CONFIG.medium;
  const overdue = isOverdue(task.deadline, task.completed);

  return (
      <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "16px 18px",
            border: `1.5px solid ${overdue ? "#fecdd3" : hovering ? "#e0e7ff" : "#f1f5f9"}`,
            transition: "all .18s",
            opacity: task.completed ? .65 : 1,
            transform: hovering ? "translateY(-1px)" : "none",
            boxShadow: hovering ? "0 4px 16px rgba(99,102,241,.08)" : "none",
          }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ marginTop: 2, width: 22, height: 22, borderRadius: 6, border: "2px solid #cbd5e1", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", textDecoration: task.completed ? "line-through" : "none", fontFamily: "'Fraunces', serif" }}>{task.title}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: p.bg, color: p.color }}>{p.label}</span>
              {overdue && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#fef2f2", color: "#ef4444" }}>Overdue</span>}
            </div>
            {task.description && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{task.description}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              {cat && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "3px 9px", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
                    {cat.label}
              </span>
              )}
              {task.deadline && (
                  <span style={{ fontSize: 12, color: overdue ? "#ef4444" : "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}>
                📅 {task.deadline}
              </span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, opacity: hovering ? 1 : 0, transition: "opacity .15s" }}>
            <button onClick={() => onDelete(task.id)} style={{ padding: "5px 8px", borderRadius: 8, border: "1.5px solid #fecdd3", background: "#fff5f5", cursor: "pointer", fontSize: 13, color: "#ef4444" }}>✕</button>
          </div>
        </div>
      </div>
  );
}

function TaskModal({ task, onSave, onClose }) {
  const isEdit = !!task?.id;
  const [form, setForm] = useState(task || { title: "", description: "", priority: "medium", category: "work", deadline: today() });
  const s = k => v => setForm(f => ({ ...f, [k]: v }));

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#1e293b", background: "#fafbfc" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 6 };

  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "28px 28px 24px", width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,.15)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b", fontFamily: "'Fraunces', serif" }}>{isEdit ? "Edit task" : "New task"}</h2>
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#64748b" }}>✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input value={form.title} onChange={e => s("title")(e.target.value)} placeholder="What needs to be done?" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e => s("description")(e.target.value)} placeholder="Add more details..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={form.priority} onChange={e => s("priority")(e.target.value)} style={inputStyle}>
                  <option value="high">🔴 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={form.category} onChange={e => s("category")(e.target.value)} style={inputStyle}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Deadline</label>
              <input type="date" value={form.deadline} onChange={e => s("deadline")(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#64748b", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={() => form.title.trim() && onSave(form)} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#fff", fontFamily: "inherit" }}>
              {isEdit ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sort, setSort] = useState("deadline");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState(null);
  const importInputRef = useRef(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await ApiService.getTodos());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadAll, 380);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const handleDelete = async (id) => { try { await ApiService.deleteTodo(id); setPage(1); loadAll(); } catch (e) { setError(e.message); } };
  const handleSave = async (form) => {
    try {
      await ApiService.createTodo(form);
      setModal(null);
      loadAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = tasks.filter(task => {
      const matchesSearch = !needle || [task.title, task.description]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(needle));
      const matchesCategory = !filterCategory || task.category === filterCategory;

      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      const direction = order === "asc" ? 1 : -1;
      const priorityRank = { high: 3, medium: 2, low: 1 };
      const aValue = sort === "priority" ? priorityRank[a.priority] : (a[sort] || "");
      const bValue = sort === "priority" ? priorityRank[b.priority] : (b[sort] || "");

      return String(aValue).localeCompare(String(bValue), undefined, { numeric: true }) * direction;
    });
  }, [tasks, search, filterCategory, sort, order]);

  const totalPages = Math.max(1, Math.ceil(visibleTasks.length / 6));
  const pagedTasks = visibleTasks.slice((page - 1) * 6, page * 6);
  const stats = {
    total: tasks.length,
    active: tasks.length,
    overdue: tasks.filter(task => isOverdue(task.deadline, false)).length
  };

  const handleExport = async () => {
    try {
      setError(null);
      setNotice(null);
      const payload = await ApiService.exportTodos();
      const exportedCount = Array.isArray(payload.todos) ? payload.todos.length : 0;

      downloadJson(`focus-todo-${new Date().toISOString().slice(0, 10)}.json`, payload);
      setNotice(`Exported ${exportedCount} todo${exportedCount === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e.message || "Could not export tasks.");
    }
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setNotice(null);

      const importedTasks = parseImportedTasks(await file.text());
      await ApiService.importTodos(importedTasks);

      setPage(1);
      await loadAll();
      setNotice(`Imported ${importedTasks.length} todo${importedTasks.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setError(e.message || "Could not import tasks.");
    } finally {
      setLoading(false);
    }
  };

  return (
      <>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #f8faff; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
        input:focus, select:focus, textarea:focus { border-color: #6366f1 !important; outline: none; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
      `}</style>

        <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#f0f4ff 0%,#fafbff 60%)" }}>
          {/* HEADER */}
          <header style={{ borderBottom: "1.5px solid #f1f5f9", background: "rgba(255,255,255,.85)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 62, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontSize: 16 }}>✦</span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", fontFamily: "'Fraunces', serif" }}>Focus</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#6366f1", background: "#ede9fe", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}>⚡ {API_LABEL}</span>
                <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
                <button onClick={handleExport} disabled={loading} title="Export visible tasks" style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: loading ? "default" : "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading ? .6 : 1 }}>
                  ⇩
                </button>
                <button onClick={() => importInputRef.current?.click()} disabled={loading} title="Import tasks from JSON" style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: loading ? "default" : "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading ? .6 : 1 }}>
                  ⇧
                </button>
                <button onClick={() => setModal({ task: null })} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New task
                </button>
              </div>
            </div>
          </header>

          <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
            {/* STATS */}
            <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
              <StatCard label="Total" value={stats.total} icon="📋" />
              <StatCard label="Active" value={stats.active} color="#6366f1" icon="⚡" />
              <StatCard label="Overdue" value={stats.overdue} color="#ef4444" icon="⚠️" />
            </div>

            {/* FILTERS BAR */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 18, border: "1.5px solid #f1f5f9", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {/* Search */}
              <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }}>⌕</span>
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search tasks…" style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", color: "#1e293b", background: "#f8fafc", outline: "none" }} />
              </div>
              {/* Category */}
              <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", color: "#1e293b", background: "#f8fafc", cursor: "pointer", outline: "none" }}>
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              {/* Sort */}
              <select value={`${sort}-${order}`} onChange={e => { const [s, o] = e.target.value.split("-"); setSort(s); setOrder(o); setPage(1); }} style={{ padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", color: "#1e293b", background: "#f8fafc", cursor: "pointer", outline: "none" }}>
                <option value="deadline-asc">Deadline first</option>
                <option value="deadline-desc">Deadline last</option>
                <option value="priority-desc">Priority high first</option>
                <option value="priority-asc">Priority low first</option>
                <option value="title-asc">Title A-Z</option>
              </select>
            </div>

            {/* ERROR BANNER */}
            {error && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fecdd3", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: "#ef4444", fontWeight: 500 }}>⚠️ {error}</span>
                  <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>
            )}

            {/* NOTICE BANNER */}
            {notice && (
                <div style={{ background: "#ecfdf5", border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: "#059669", fontWeight: 500 }}>✓ {notice}</span>
                  <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "#059669", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>
            )}

            {/* TASK LIST */}
            {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[1, 2, 3].map(i => (
                      <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "20px", border: "1.5px solid #f1f5f9", animation: "pulse 1.4s ease-in-out infinite" }}>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: "#f1f5f9" }} />
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ height: 14, background: "#f1f5f9", borderRadius: 6, width: `${[60, 80, 70][i - 1]}%` }} />
                            <div style={{ height: 12, background: "#f8fafc", borderRadius: 6, width: "45%" }} />
                          </div>
                        </div>
                      </div>
                  ))}
                  <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.55 } }`}</style>
                </div>
            ) : pagedTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✦</div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#64748b", margin: "0 0 6px", fontFamily: "'Fraunces', serif" }}>No tasks found</p>
                  <p style={{ fontSize: 14, margin: 0 }}>Try a different filter or create a new task</p>
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pagedTasks.map(task => (
                      <TaskCard key={task.id} task={task} onDelete={handleDelete} />
                  ))}
                </div>
            )}

            {/* PAGINATION */}
            {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 24, alignItems: "center" }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "8px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: page === 1 ? "#f8fafc" : "#fff", cursor: page === 1 ? "default" : "pointer", fontSize: 13, fontWeight: 600, color: page === 1 ? "#cbd5e1" : "#64748b", fontFamily: "inherit" }}>← Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => setPage(p)} style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid " + (page === p ? "#6366f1" : "#e2e8f0"), background: page === p ? "#6366f1" : "#fff", color: page === p ? "#fff" : "#64748b", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "8px 16px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: page === totalPages ? "#f8fafc" : "#fff", cursor: page === totalPages ? "default" : "pointer", fontSize: 13, fontWeight: 600, color: page === totalPages ? "#cbd5e1" : "#64748b", fontFamily: "inherit" }}>Next →</button>
                </div>
            )}
          </main>
        </div>

        {modal && (
            <TaskModal task={modal.task} onSave={handleSave} onClose={() => setModal(null)} />
        )}
      </>
  );
}
