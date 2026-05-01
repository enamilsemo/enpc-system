import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";

// ─── API LAYER ────────────────────────────────────────────────────────────────

const BASE = "http://localhost:8000";

const api = {
  _token: null,
  setToken(t) { this._token = t; localStorage.setItem("enpc_token", t); },
  loadToken() { this._token = localStorage.getItem("enpc_token"); },
  clearToken() { this._token = null; localStorage.removeItem("enpc_token"); localStorage.removeItem("enpc_user"); },

  async req(method, path, body = null) {
    const headers = { "Content-Type": "application/json" };
    if (this._token) headers["Authorization"] = `Bearer ${this._token}`;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    return data;
  },

  login: (u, p) => api.req("POST", "/auth/login", { username: u, password: p }),
  register: (d) => api.req("POST", "/auth/register", d),
  me: () => api.req("GET", "/auth/me"),

  getAnnouncements: (cat) => api.req("GET", `/announcements${cat ? `?category=${cat}` : ""}`),
  getAnnouncement: (id) => api.req("GET", `/announcements/${id}`),
  createAnnouncement: async (data, files) => {
    const form = new FormData();
    form.append("title", data.title);
    form.append("content", data.content);
    form.append("category", data.category);
    form.append("is_pinned", data.is_pinned);
    if (files) for (const f of files) form.append("files", f);
    const headers = {};
    if (api._token) headers["Authorization"] = `Bearer ${api._token}`;
    const res = await fetch(`${BASE}/announcements`, { method: "POST", headers, body: form });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || "Failed");
    return d;
  },
  uploadAttachments: async (annId, files) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const headers = {};
    if (api._token) headers["Authorization"] = `Bearer ${api._token}`;
    const res = await fetch(`${BASE}/announcements/${annId}/attachments`, { method: "POST", headers, body: form });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || "Failed");
    return d;
  },
  deleteAttachment: (id) => api.req("DELETE", `/attachments/${id}`),
  updateAnnouncement: (id, d) => api.req("PUT", `/announcements/${id}`, d),
  deleteAnnouncement: (id) => api.req("DELETE", `/announcements/${id}`),

  getComments: (aid) => api.req("GET", `/announcements/${aid}/comments`),
  createComment: (aid, content) => api.req("POST", `/announcements/${aid}/comments`, { content }),
  hideComment: (cid, hide) => api.req("PUT", `/comments/${cid}/hide?hide=${hide}`),
  deleteComment: (cid) => api.req("DELETE", `/comments/${cid}`),

  getInbox: () => api.req("GET", "/messages/inbox"),
  getConversation: (uid) => api.req("GET", `/messages/conversation/${uid}`),
  sendMessage: (receiver_id, content) => api.req("POST", "/messages", { receiver_id, content }),

  getNotifications: () => api.req("GET", "/notifications"),
  getUnreadCount: () => api.req("GET", "/notifications/count"),
  markRead: (id) => api.req("PUT", `/notifications/${id}/read`),
  markAllRead: () => api.req("PUT", "/notifications/read-all"),

  getUsers: () => api.req("GET", "/users"),
  promoteUser: (id, role) => api.req("PUT", `/users/${id}/promote`, { role }),
  deactivateUser: (id) => api.req("PUT", `/users/${id}/deactivate`),
};

api.loadToken();

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────

const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("enpc_user")); } catch { return null; }
  });

  const login = async (username, password) => {
    const data = await api.login(username, password);
    api.setToken(data.access_token);
    localStorage.setItem("enpc_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, setUser, login, logout }}>{children}</AuthCtx.Provider>;
}

// ─── DESIGN TOKENS & GLOBALS ──────────────────────────────────────────────────

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0e0e0e;
    --ink2: #2c2c2c;
    --ink3: #5a5a5a;
    --paper: #f5f3ef;
    --paper2: #edeae3;
    --paper3: #e2ddd4;
    --accent: #c8392b;
    --accent2: #e85d4a;
    --gold: #b8860b;
    --green: #2d6a4f;
    --blue: #1a4a7a;
    --border: #d4cfc6;
    --shadow: 0 2px 12px rgba(14,14,14,0.08);
    --shadow-lg: 0 8px 40px rgba(14,14,14,0.14);
    --radius: 3px;
    --font-serif: 'DM Serif Display', Georgia, serif;
    --font-sans: 'DM Sans', system-ui, sans-serif;
  }

  body {
    font-family: var(--font-sans);
    background: var(--paper);
    color: var(--ink);
    line-height: 1.6;
    min-height: 100vh;
  }

  /* ── LAYOUT ── */
  .app-shell { display: flex; min-height: 100vh; }
  .sidebar {
    width: 260px; min-height: 100vh; background: var(--ink);
    color: #fff; display: flex; flex-direction: column;
    position: fixed; left: 0; top: 0; z-index: 100;
    border-right: 1px solid #1a1a1a;
  }
  .sidebar-logo {
    padding: 28px 24px 20px;
    border-bottom: 1px solid #222;
  }
  .logo-badge {
    font-family: var(--font-serif); font-size: 22px; color: #fff;
    letter-spacing: 0.02em; line-height: 1.1;
  }
  .logo-sub { font-size: 10px; color: #888; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 4px; }
  .sidebar-nav { flex: 1; padding: 16px 0; }
  .nav-section-label {
    font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
    color: #555; padding: 16px 24px 6px; font-weight: 500;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 24px; color: #aaa; font-size: 13.5px;
    cursor: pointer; transition: all 0.15s; border: none;
    background: none; width: 100%; text-align: left;
    font-family: var(--font-sans); letter-spacing: 0.01em;
    position: relative;
  }
  .nav-item:hover { color: #fff; background: rgba(255,255,255,0.04); }
  .nav-item.active { color: #fff; background: rgba(200,57,43,0.18); }
  .nav-item.active::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px; background: var(--accent);
  }
  .nav-badge {
    margin-left: auto; background: var(--accent); color: #fff;
    font-size: 10px; font-weight: 600; padding: 1px 6px;
    border-radius: 10px; min-width: 18px; text-align: center;
  }
  .sidebar-user {
    padding: 16px 24px; border-top: 1px solid #222;
    display: flex; align-items: center; gap: 12px;
  }
  .avatar {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 13px; flex-shrink: 0;
  }
  .avatar-sm { width: 28px; height: 28px; font-size: 11px; }
  .avatar-lg { width: 42px; height: 42px; font-size: 16px; }
  .role-super { background: linear-gradient(135deg, #b8860b, #daa520); color: #000; }
  .role-admin { background: linear-gradient(135deg, #1a4a7a, #2563eb); color: #fff; }
  .role-student { background: linear-gradient(135deg, #2d6a4f, #40916c); color: #fff; }
  .user-info { flex: 1; min-width: 0; }
  .user-name { font-size: 13px; font-weight: 500; color: #fff; truncate: true; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user-role { font-size: 10px; color: #666; letter-spacing: 0.08em; text-transform: uppercase; }
  .logout-btn {
    background: none; border: none; color: #555; cursor: pointer;
    padding: 4px; border-radius: 3px; transition: color 0.15s; font-size: 16px;
  }
  .logout-btn:hover { color: var(--accent); }

  .main-content {
    margin-left: 260px; flex: 1; min-height: 100vh;
    display: flex; flex-direction: column;
  }

  .topbar {
    padding: 20px 36px; border-bottom: 1px solid var(--border);
    background: var(--paper); display: flex; align-items: center;
    justify-content: space-between; position: sticky; top: 0; z-index: 50;
  }
  .page-title { font-family: var(--font-serif); font-size: 26px; color: var(--ink); }
  .page-subtitle { font-size: 12px; color: var(--ink3); margin-top: 1px; }

  .content-area { padding: 32px 36px; flex: 1; }

  /* ── CARDS ── */
  .card {
    background: #fff; border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .card-header {
    padding: 20px 24px 16px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-title { font-family: var(--font-serif); font-size: 18px; }
  .card-body { padding: 24px; }

  /* ── ANNOUNCEMENT CARD ── */
  .ann-card {
    background: #fff; border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); margin-bottom: 16px; overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s; cursor: pointer;
  }
  .ann-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }
  .ann-card.pinned { border-left: 3px solid var(--gold); }
  .ann-card-top { padding: 20px 24px 14px; }
  .ann-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .badge {
    font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 2px;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .badge-category { background: var(--paper2); color: var(--ink3); }
  .badge-pinned { background: #fef3c7; color: #92400e; }
  .badge-admin { background: #dbeafe; color: #1e40af; }
  .badge-super { background: #fef9c3; color: #713f12; }
  .badge-student { background: #dcfce7; color: #166534; }
  .ann-time { font-size: 11px; color: var(--ink3); }
  .ann-title { font-family: var(--font-serif); font-size: 20px; margin-bottom: 8px; line-height: 1.3; }
  .ann-excerpt { font-size: 13.5px; color: var(--ink2); line-height: 1.65; }
  .ann-card-bottom {
    padding: 12px 24px; border-top: 1px solid var(--paper2);
    background: var(--paper); display: flex; align-items: center;
    justify-content: space-between;
  }
  .ann-author { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink3); }

  /* ── DETAIL VIEW ── */
  .detail-header { padding: 0 0 24px; border-bottom: 1px solid var(--border); margin-bottom: 28px; }
  .detail-title { font-family: var(--font-serif); font-size: 32px; line-height: 1.25; margin-bottom: 12px; }
  .detail-content { font-size: 15px; line-height: 1.8; color: var(--ink2); white-space: pre-wrap; }

  /* ── COMMENTS ── */
  .comment-item {
    padding: 14px 0; border-bottom: 1px solid var(--paper2);
    display: flex; gap: 12px;
  }
  .comment-body { flex: 1; }
  .comment-author { font-size: 12px; font-weight: 600; color: var(--ink); }
  .comment-time { font-size: 11px; color: var(--ink3); margin-left: 8px; }
  .comment-text { font-size: 13.5px; color: var(--ink2); margin-top: 4px; }
  .comment-hidden { opacity: 0.4; font-style: italic; }

  /* ── MESSAGES ── */
  .chat-shell { display: flex; height: calc(100vh - 140px); border: 1px solid var(--border); background: #fff; border-radius: var(--radius); overflow: hidden; }
  .inbox-panel { width: 280px; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
  .inbox-header { padding: 18px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 13px; }
  .inbox-search { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .inbox-list { flex: 1; overflow-y: auto; }
  .inbox-item {
    padding: 14px 16px; cursor: pointer; border-bottom: 1px solid var(--paper2);
    transition: background 0.12s; display: flex; gap: 10px; align-items: flex-start;
  }
  .inbox-item:hover { background: var(--paper); }
  .inbox-item.active { background: var(--paper2); }
  .inbox-item-info { flex: 1; min-width: 0; }
  .inbox-name { font-size: 13px; font-weight: 600; }
  .inbox-preview { font-size: 11.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .inbox-unread-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-top: 5px; flex-shrink: 0; }

  .chat-panel { flex: 1; display: flex; flex-direction: column; }
  .chat-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .chat-messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .chat-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ink3); font-size: 13px; flex-direction: column; gap: 8px; }
  .msg-bubble {
    max-width: 70%; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.5;
  }
  .msg-bubble.mine { background: var(--ink); color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
  .msg-bubble.theirs { background: var(--paper2); color: var(--ink); align-self: flex-start; border-bottom-left-radius: 3px; }
  .msg-time { font-size: 10px; color: #999; margin-top: 4px; }
  .mine .msg-time { text-align: right; }
  .chat-input-row { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 10px; }

  /* ── NOTIFICATIONS ── */
  .notif-item {
    padding: 16px 20px; border-bottom: 1px solid var(--paper2);
    display: flex; gap: 14px; cursor: pointer; transition: background 0.12s;
  }
  .notif-item:hover { background: var(--paper); }
  .notif-item.unread { background: #fff8f6; }
  .notif-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .notif-ann { background: #fef3c7; }
  .notif-msg { background: #dbeafe; }
  .notif-title { font-size: 13px; font-weight: 600; }
  .notif-body { font-size: 12px; color: var(--ink3); margin-top: 2px; }
  .notif-time { font-size: 10.5px; color: var(--ink3); margin-top: 4px; }
  .notif-unread-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-top: 6px; flex-shrink: 0; }

  /* ── FORMS & INPUTS ── */
  .input, .textarea, .select {
    width: 100%; padding: 10px 13px; border: 1px solid var(--border);
    border-radius: var(--radius); font-family: var(--font-sans);
    font-size: 13.5px; color: var(--ink); background: #fff;
    transition: border-color 0.15s, box-shadow 0.15s; outline: none;
  }
  .input:focus, .textarea:focus, .select:focus {
    border-color: var(--ink); box-shadow: 0 0 0 3px rgba(14,14,14,0.06);
  }
  .textarea { resize: vertical; min-height: 100px; }
  .form-group { margin-bottom: 18px; }
  .label { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--ink3); margin-bottom: 6px; }

  /* ── BUTTONS ── */
  .btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px;
    border-radius: var(--radius); font-family: var(--font-sans); font-size: 13px;
    font-weight: 500; cursor: pointer; border: none; transition: all 0.15s;
    letter-spacing: 0.01em; text-decoration: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--ink); color: #fff; }
  .btn-primary:hover:not(:disabled) { background: var(--ink2); }
  .btn-accent { background: var(--accent); color: #fff; }
  .btn-accent:hover:not(:disabled) { background: var(--accent2); }
  .btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--border); }
  .btn-ghost:hover:not(:disabled) { background: var(--paper2); }
  .btn-danger { background: transparent; color: var(--accent); border: 1px solid #fca5a5; }
  .btn-danger:hover:not(:disabled) { background: #fef2f2; }
  .btn-sm { padding: 5px 11px; font-size: 12px; }
  .btn-icon { padding: 7px; width: 34px; height: 34px; justify-content: center; }

  /* ── AUTH ── */
  .auth-shell {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--paper);
    background-image: radial-gradient(circle at 20% 50%, rgba(200,57,43,0.04) 0%, transparent 50%),
                      radial-gradient(circle at 80% 20%, rgba(184,134,11,0.04) 0%, transparent 50%);
  }
  .auth-card {
    width: 420px; background: #fff; border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow-lg); overflow: hidden;
  }
  .auth-header {
    padding: 36px 36px 24px;
    border-bottom: 1px solid var(--paper2);
    background: var(--ink);
  }
  .auth-logo { font-family: var(--font-serif); font-size: 28px; color: #fff; }
  .auth-tagline { font-size: 12px; color: #888; margin-top: 4px; letter-spacing: 0.04em; }
  .auth-body { padding: 32px 36px; }
  .auth-title { font-family: var(--font-serif); font-size: 22px; margin-bottom: 6px; }
  .auth-sub { font-size: 13px; color: var(--ink3); margin-bottom: 28px; }
  .auth-switch { text-align: center; margin-top: 20px; font-size: 13px; color: var(--ink3); }
  .auth-link { color: var(--accent); cursor: pointer; text-decoration: underline; }

  /* ── ADMIN PANEL ── */
  .users-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .users-table th {
    text-align: left; font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--ink3); padding: 10px 16px;
    border-bottom: 2px solid var(--border); background: var(--paper);
  }
  .users-table td { padding: 12px 16px; border-bottom: 1px solid var(--paper2); vertical-align: middle; }
  .users-table tr:hover td { background: var(--paper); }

  /* ── MODAL ── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center; z-index: 200;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    background: #fff; border-radius: var(--radius); width: 560px; max-width: 95vw;
    max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-lg);
    animation: slideUp 0.2s ease;
  }
  .modal-header { padding: 20px 24px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .modal-title { font-family: var(--font-serif); font-size: 20px; }
  .modal-body { padding: 24px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 10px; }

  /* ── MISC ── */
  .error-msg { color: var(--accent); font-size: 12.5px; margin-top: 6px; padding: 8px 12px; background: #fef2f2; border-radius: var(--radius); border: 1px solid #fecaca; }
  .empty-state { text-align: center; padding: 60px 20px; color: var(--ink3); }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-text { font-size: 14px; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  .flex { display: flex; }
  .flex-center { display: flex; align-items: center; justify-content: center; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .text-sm { font-size: 12.5px; }
  .text-xs { font-size: 11px; }
  .text-muted { color: var(--ink3); }
  .font-serif { font-family: var(--font-serif); }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 8px; }
  .mb-4 { margin-bottom: 16px; }
  .mb-6 { margin-bottom: 24px; }
  .loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--ink3); gap: 10px; font-size: 13px; }
  .spinner { width: 18px; height: 18px; border: 2px solid var(--border); border-top-color: var(--ink); border-radius: 50%; animation: spin 0.7s linear infinite; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
    border-radius: 2px; font-size: 11px; font-weight: 500; border: 1px solid var(--border);
    background: var(--paper); color: var(--ink3); cursor: pointer;
    transition: all 0.12s;
  }
  .chip:hover, .chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .tag-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .new-msg-panel { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); }

  /* ── ATTACHMENTS ── */
  .attachments-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  .attach-thumb {
    position: relative; border-radius: var(--radius); overflow: hidden;
    border: 1px solid var(--border); background: var(--paper);
    cursor: pointer; transition: box-shadow 0.15s;
  }
  .attach-thumb:hover { box-shadow: var(--shadow-lg); }
  .attach-img { width: 120px; height: 100px; object-fit: cover; display: block; }
  .attach-file {
    width: 120px; height: 100px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 6px;
    font-size: 11px; color: var(--ink3); padding: 10px; text-align: center;
  }
  .attach-file-icon { font-size: 28px; }
  .attach-name { font-size: 10px; word-break: break-all; line-height: 1.3; }
  .attach-size { font-size: 9px; color: var(--ink3); }
  .attach-del {
    position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.6);
    color: #fff; border: none; border-radius: 50%; width: 20px; height: 20px;
    font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s;
  }
  .attach-thumb:hover .attach-del { opacity: 1; }

  /* Upload drop zone */
  .upload-zone {
    border: 2px dashed var(--border); border-radius: var(--radius);
    padding: 24px; text-align: center; cursor: pointer;
    transition: all 0.15s; color: var(--ink3); font-size: 13px;
    background: var(--paper);
  }
  .upload-zone:hover, .upload-zone.drag { border-color: var(--ink); background: var(--paper2); color: var(--ink); }
  .upload-zone-icon { font-size: 26px; margin-bottom: 6px; }

  /* Image lightbox */
  .lightbox-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.88);
    display: flex; align-items: center; justify-content: center; z-index: 300;
    animation: fadeIn 0.15s ease; cursor: zoom-out;
  }
  .lightbox-img { max-width: 90vw; max-height: 90vh; border-radius: 4px; box-shadow: var(--shadow-lg); }
  .lightbox-close {
    position: absolute; top: 20px; right: 24px; background: none; border: none;
    color: #fff; font-size: 28px; cursor: pointer; line-height: 1;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Scrollbars */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--ink3); }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const roleColor = (role) => {
  if (role === "SUPER_ADMIN") return "role-super";
  if (role === "ADMIN") return "role-admin";
  return "role-student";
};

const roleBadge = (role) => {
  if (role === "SUPER_ADMIN") return <span className="badge badge-super">Super Admin</span>;
  if (role === "ADMIN") return <span className="badge badge-admin">Admin</span>;
  return <span className="badge badge-student">Student</span>;
};

const initials = (name) => name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";

const fmtDate = (d) => {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtTime = (d) => {
  const date = new Date(d);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

function Loading() {
  return <div className="loading"><div className="spinner" />Loading…</div>;
}

function EmptyState({ icon, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-text">{text}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

const fileIcon = (type) => {
  if (type === "image") return "🖼️";
  if (type === "pdf") return "📄";
  if (type === "doc") return "📝";
  if (type === "sheet") return "📊";
  if (type === "ppt") return "📑";
  return "📎";
};

const fmtSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function Lightbox({ src, onClose }) {
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      <img className="lightbox-img" src={src} alt="preview" onClick={e => e.stopPropagation()} />
    </div>
  );
}

function AttachmentsGrid({ attachments, onDelete }) {
  const [lightbox, setLightbox] = useState(null);
  if (!attachments?.length) return null;

  return (
    <>
      <div className="attachments-grid">
        {attachments.map(att => {
          const url = `${BASE}/uploads/${att.stored_name}`;
          const isImg = att.file_type === "image";
          return (
            <div key={att.id} className="attach-thumb"
              onClick={() => isImg ? setLightbox(url) : window.open(url, "_blank")}>
              {isImg ? (
                <img className="attach-img" src={url} alt={att.filename} />
              ) : (
                <div className="attach-file">
                  <span className="attach-file-icon">{fileIcon(att.file_type)}</span>
                  <span className="attach-name">{att.filename}</span>
                  <span className="attach-size">{fmtSize(att.file_size)}</span>
                </div>
              )}
              {onDelete && (
                <button className="attach-del" onClick={e => { e.stopPropagation(); onDelete(att.id); }}>✕</button>
              )}
            </div>
          );
        })}
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

function UploadZone({ files, setFiles }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const addFiles = (newFiles) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name + f.size));
      const filtered = Array.from(newFiles).filter(f => !existing.has(f.name + f.size));
      return [...prev, ...filtered];
    });
  };

  return (
    <div>
      <div
        className={`upload-zone ${drag ? "drag" : ""}`}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
      >
        <div className="upload-zone-icon">📎</div>
        <div>اسحب الملفات هنا أو <strong>اضغط للاختيار</strong></div>
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--ink3)" }}>صور، PDF، Word، Excel — حتى 10MB لكل ملف</div>
        <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="attachments-grid" style={{ marginTop: 10 }}>
          {files.map((f, i) => {
            const isImg = f.type.startsWith("image/");
            const previewUrl = isImg ? URL.createObjectURL(f) : null;
            return (
              <div key={i} className="attach-thumb">
                {isImg ? (
                  <img className="attach-img" src={previewUrl} alt={f.name} />
                ) : (
                  <div className="attach-file">
                    <span className="attach-file-icon">{fileIcon(f.type.includes("pdf") ? "pdf" : "other")}</span>
                    <span className="attach-name">{f.name}</span>
                    <span className="attach-size">{fmtSize(f.size)}</span>
                  </div>
                )}
                <button className="attach-del" style={{ opacity: 1 }}
                  onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── AUTH SCREENS ──────────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", email: "", full_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") {
        await login(form.username, form.password);
      } else {
        await api.register(form);
        await login(form.username, form.password);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => e.key === "Enter" && submit();

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">ENPC</div>
          <div className="auth-tagline">Official Communication System</div>
        </div>
        <div className="auth-body">
          <div className="auth-title">{mode === "login" ? "Welcome back" : "Create account"}</div>
          <div className="auth-sub">
            {mode === "login" ? "Sign in to your ENPC account" : "Register with your student information"}
          </div>

          {mode === "register" && (
            <div className="form-group">
              <label className="label">Full Name</label>
              <input className="input" placeholder="Your full name" value={form.full_name} onChange={set("full_name")} onKeyDown={onKey} />
            </div>
          )}
          {mode === "register" && (
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="your@enpc.dz" value={form.email} onChange={set("email")} onKeyDown={onKey} />
            </div>
          )}
          <div className="form-group">
            <label className="label">Username</label>
            <input className="input" placeholder="username" value={form.username} onChange={set("username")} onKeyDown={onKey} />
          </div>
          <div className="form-group">
            <label className="label">Password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={set("password")} onKeyDown={onKey} />
          </div>

          {error && <div className="error-msg">{error}</div>}

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8, padding: "11px" }} onClick={submit} disabled={loading}>
            {loading ? <><div className="spinner" /> Processing…</> : (mode === "login" ? "Sign In" : "Create Account")}
          </button>

          <div className="auth-switch">
            {mode === "login" ? (
              <>Don't have an account? <span className="auth-link" onClick={() => { setMode("register"); setError(""); }}>Register</span></>
            ) : (
              <>Already have an account? <span className="auth-link" onClick={() => { setMode("login"); setError(""); }}>Sign In</span></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

function Sidebar({ page, setPage, unread }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const navItem = (id, icon, label, badge) => (
    <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => setPage(id)}>
      <span>{icon}</span>
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </button>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-badge">ENPC</div>
        <div className="logo-sub">Communication System</div>
      </div>

      <div className="sidebar-nav">
        <div className="nav-section-label">Main</div>
        {navItem("announcements", "📢", "Announcements")}
        {navItem("messages", "✉️", "Messages", unread.msgs)}
        {navItem("notifications", "🔔", "Notifications", unread.notifs)}

        {isAdmin && (
          <>
            <div className="nav-section-label">Administration</div>
            {navItem("create-ann", "✏️", "New Announcement")}
            {isSuperAdmin && navItem("users", "👥", "Manage Users")}
          </>
        )}
      </div>

      <div className="sidebar-user">
        <div className={`avatar ${roleColor(user?.role)}`}>{initials(user?.full_name)}</div>
        <div className="user-info">
          <div className="user-name">{user?.full_name}</div>
          <div className="user-role">{user?.role?.replace("_", " ")}</div>
        </div>
        <button className="logout-btn" title="Sign out" onClick={logout}>⇥</button>
      </div>
    </div>
  );
}

// ─── ANNOUNCEMENTS LIST ───────────────────────────────────────────────────────

const CATEGORIES = ["All", "General", "Academic", "Events", "Urgent", "Administrative"];

function AnnouncementsPage({ setPage, setDetailId }) {
  const { user } = useAuth();
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("All");
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAnnouncements(cat === "All" ? null : cat);
      setAnns(data);
    } catch { } finally { setLoading(false); }
  }, [cat]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this announcement?")) return;
    await api.deleteAnnouncement(id);
    load();
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Announcements</div>
          <div className="page-subtitle">Official university communications</div>
        </div>
        {isAdmin && (
          <button className="btn btn-accent" onClick={() => setPage("create-ann")}>
            + New Announcement
          </button>
        )}
      </div>
      <div className="content-area">
        <div className="tag-row">
          {CATEGORIES.map(c => (
            <div key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</div>
          ))}
        </div>

        {loading ? <Loading /> : anns.length === 0 ? (
          <EmptyState icon="📢" text="No announcements yet." />
        ) : anns.map(ann => (
          <div key={ann.id} className={`ann-card ${ann.is_pinned ? "pinned" : ""}`}
            onClick={() => { setDetailId(ann.id); setPage("detail"); }}>
            <div className="ann-card-top">
              <div className="ann-meta">
                <span className="badge badge-category">{ann.category}</span>
                {ann.is_pinned && <span className="badge badge-pinned">📌 Pinned</span>}
                <span className="ann-time">{fmtDate(ann.created_at)}</span>
              </div>
              <div className="ann-title">{ann.title}</div>
              <div className="ann-excerpt">{ann.content.slice(0, 180)}{ann.content.length > 180 ? "…" : ""}</div>
            </div>
            <div className="ann-card-bottom">
              <div className="ann-author">
                <div className={`avatar avatar-sm ${roleColor(ann.author.role)}`}>{initials(ann.author.full_name)}</div>
                <span>{ann.author.full_name}</span>
                {roleBadge(ann.author.role)}
                {ann.attachments?.length > 0 && (
                  <span className="badge badge-category">📎 {ann.attachments.length}</span>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setDetailId(ann.id); setPage("edit-ann"); }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={e => handleDelete(e, ann.id)}>Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── ANNOUNCEMENT DETAIL ──────────────────────────────────────────────────────

function AnnouncementDetail({ annId, setPage }) {
  const { user } = useAuth();
  const [ann, setAnn] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([api.getAnnouncement(annId), api.getComments(annId)]);
      setAnn(a); setComments(c);
    } catch { } finally { setLoading(false); }
  }, [annId]);

  useEffect(() => { load(); }, [load]);

  const submitComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await api.createComment(annId, newComment);
      setNewComment("");
      load();
    } catch { } finally { setSubmitting(false); }
  };

  const hideComment = async (cid, hidden) => {
    await api.hideComment(cid, !hidden);
    load();
  };
  const deleteComment = async (cid) => {
    if (!confirm("Delete this comment?")) return;
    await api.deleteComment(cid);
    load();
  };

  if (loading) return <Loading />;
  if (!ann) return null;

  return (
    <>
      <div className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setPage("announcements")}>← Back</button>
      </div>
      <div className="content-area" style={{ maxWidth: 820 }}>
        <div className="card">
          <div className="card-body">
            <div className="detail-header">
              <div className="ann-meta" style={{ marginBottom: 14 }}>
                <span className="badge badge-category">{ann.category}</span>
                {ann.is_pinned && <span className="badge badge-pinned">📌 Pinned</span>}
                <span className="ann-time">{fmtTime(ann.created_at)}</span>
              </div>
              <div className="detail-title">{ann.title}</div>
              <div className="ann-author" style={{ marginTop: 12 }}>
                <div className={`avatar avatar-sm ${roleColor(ann.author.role)}`}>{initials(ann.author.full_name)}</div>
                <span className="text-sm text-muted">Posted by <strong>{ann.author.full_name}</strong></span>
                {roleBadge(ann.author.role)}
              </div>
            </div>
            <div className="detail-content">{ann.content}</div>

            {/* Attachments */}
            {ann.attachments?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <hr className="divider" />
                <div className="label" style={{ marginBottom: 10 }}>
                  📎 Attachments ({ann.attachments.length})
                </div>
                <AttachmentsGrid attachments={ann.attachments} />
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header">
            <span className="card-title">Comments ({comments.filter(c => !c.is_hidden).length})</span>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {comments.length === 0 ? (
              <div className="text-sm text-muted" style={{ padding: "16px 0" }}>No comments yet. Be the first!</div>
            ) : comments.map(c => (
              <div key={c.id} className={`comment-item ${c.is_hidden ? "comment-hidden" : ""}`}>
                <div className={`avatar avatar-sm ${roleColor(c.author.role)}`}>{initials(c.author.full_name)}</div>
                <div className="comment-body">
                  <div>
                    <span className="comment-author">{c.author.full_name}</span>
                    {roleBadge(c.author.role)}
                    <span className="comment-time">{fmtTime(c.created_at)}</span>
                    {c.is_hidden && <span className="badge" style={{ background: "#fef2f2", color: "#991b1b", marginLeft: 6 }}>Hidden</span>}
                  </div>
                  <div className="comment-text">{c.content}</div>
                  {isAdmin && (
                    <div className="flex gap-2" style={{ marginTop: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => hideComment(c.id, c.is_hidden)}>
                        {c.is_hidden ? "Unhide" : "Hide"}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteComment(c.id)}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div style={{ marginTop: 20 }}>
              <textarea
                className="textarea"
                placeholder="Write a comment…"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                style={{ minHeight: 72 }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={submitting || !newComment.trim()}>
                  {submitting ? "Posting…" : "Post Comment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── CREATE / EDIT ANNOUNCEMENT ───────────────────────────────────────────────

function AnnouncementForm({ annId, setPage }) {
  const isEdit = !!annId;
  const [form, setForm] = useState({ title: "", content: "", category: "General", is_pinned: false });
  const [files, setFiles] = useState([]);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEdit) {
      api.getAnnouncement(annId).then(a => {
        setForm({ title: a.title, content: a.content, category: a.category, is_pinned: a.is_pinned });
        setExistingAttachments(a.attachments || []);
        setLoading(false);
      });
    }
  }, [annId, isEdit]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const deleteExisting = async (attId) => {
    await api.deleteAttachment(attId);
    setExistingAttachments(prev => prev.filter(a => a.id !== attId));
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) { setError("Title and content are required."); return; }
    setSaving(true); setError("");
    try {
      if (isEdit) {
        await api.updateAnnouncement(annId, form);
        if (files.length > 0) await api.uploadAttachments(annId, files);
      } else {
        await api.createAnnouncement(form, files);
      }
      setPage("announcements");
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">{isEdit ? "Edit Announcement" : "New Announcement"}</div>
          <div className="page-subtitle">{isEdit ? "Update the announcement details" : "Publish to all students"}</div>
        </div>
      </div>
      <div className="content-area" style={{ maxWidth: 720 }}>
        <div className="card">
          <div className="card-body">
            <div className="form-group">
              <label className="label">Title</label>
              <input className="input" placeholder="Announcement title…" value={form.title} onChange={set("title")} />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="label">Category</label>
                <select className="select" value={form.category} onChange={set("category")}>
                  {["General", "Academic", "Events", "Urgent", "Administrative"].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Options</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={form.is_pinned} onChange={e => setForm(f => ({ ...f, is_pinned: e.target.checked }))} />
                  📌 Pin this announcement
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Content</label>
              <textarea className="textarea" style={{ minHeight: 200 }} placeholder="Announcement content…" value={form.content} onChange={set("content")} />
            </div>

            {/* Existing attachments (edit mode) */}
            {isEdit && existingAttachments.length > 0 && (
              <div className="form-group">
                <label className="label">Current Attachments</label>
                <AttachmentsGrid attachments={existingAttachments} onDelete={deleteExisting} />
              </div>
            )}

            {/* Upload zone */}
            <div className="form-group">
              <label className="label">{isEdit ? "Add New Files" : "Attachments (optional)"}</label>
              <UploadZone files={files} setFiles={setFiles} />
            </div>

            {error && <div className="error-msg">{error}</div>}
            <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setPage("announcements")}>Cancel</button>
              <button className="btn btn-accent" onClick={submit} disabled={saving}>
                {saving ? "Saving…" : (isEdit ? "Update Announcement" : "Publish Announcement")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

function MessagesPage() {
  const { user } = useAuth();
  const [inbox, setInbox] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [newTarget, setNewTarget] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const messagesEndRef = useRef(null);

  const loadInbox = useCallback(async () => {
    const data = await api.getInbox();
    setInbox(data);
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  const openConv = async (otherUser) => {
    setActiveConv(otherUser);
    const data = await api.getConversation(otherUser.id);
    setMessages(data);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    loadInbox();
  };

  const sendMsg = async () => {
    if (!newMsg.trim() || !activeConv) return;
    setSending(true);
    try {
      await api.sendMessage(activeConv.id, newMsg);
      setNewMsg("");
      const data = await api.getConversation(activeConv.id);
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } finally { setSending(false); }
  };

  const loadUsers = async () => {
    try { const u = await api.getUsers(); setAllUsers(u); } catch { }
  };

  const startNew = async (targetUser) => {
    setShowNewMsg(false);
    setActiveConv(targetUser);
    const data = await api.getConversation(targetUser.id);
    setMessages(data);
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Messages</div>
          <div className="page-subtitle">Direct communication</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowNewMsg(true); loadUsers(); }}>
          + New Message
        </button>
      </div>
      <div style={{ padding: "0 36px 36px" }}>
        <div className="chat-shell">
          {/* Inbox Panel */}
          <div className="inbox-panel">
            <div className="inbox-header">Conversations</div>
            <div className="inbox-list">
              {inbox.length === 0 ? (
                <div style={{ padding: 24, color: "var(--ink3)", fontSize: 13, textAlign: "center" }}>No conversations yet</div>
              ) : inbox.map((item, i) => (
                <div key={i} className={`inbox-item ${activeConv?.id === item.user.id ? "active" : ""}`}
                  onClick={() => openConv(item.user)}>
                  <div className={`avatar avatar-sm ${roleColor(item.user.role)}`}>{initials(item.user.full_name)}</div>
                  <div className="inbox-item-info">
                    <div className="inbox-name">{item.user.full_name}</div>
                    <div className="inbox-preview">{item.last_message.content}</div>
                  </div>
                  {item.unread && <div className="inbox-unread-dot" />}
                </div>
              ))}
            </div>
          </div>

          {/* Chat Panel */}
          <div className="chat-panel">
            {!activeConv ? (
              <div className="chat-empty">
                <span style={{ fontSize: 36 }}>✉️</span>
                <span>Select a conversation or start a new one</span>
              </div>
            ) : (
              <>
                <div className="chat-header">
                  <div className={`avatar ${roleColor(activeConv.role)}`}>{initials(activeConv.full_name)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{activeConv.full_name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink3)" }}>{activeConv.role?.replace("_", " ")}</div>
                  </div>
                </div>
                <div className="chat-messages">
                  {messages.length === 0 ? (
                    <div className="chat-empty">
                      <span>No messages yet. Say hello!</span>
                    </div>
                  ) : messages.map(m => {
                    const mine = m.sender_id === user.id;
                    return (
                      <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                        <div className={`msg-bubble ${mine ? "mine" : "theirs"}`}>{m.content}</div>
                        <div className={`msg-time ${mine ? "mine" : ""}`}>{fmtTime(m.created_at)}</div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="chat-input-row">
                  <input
                    className="input" placeholder="Type a message…" value={newMsg}
                    onChange={e => setNewMsg(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMsg()}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={sendMsg} disabled={sending || !newMsg.trim()}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showNewMsg && (
        <Modal title="New Message" onClose={() => setShowNewMsg(false)}>
          <div className="form-group">
            <label className="label">Search Users</label>
            <input className="input" placeholder="Type name…" value={newTarget}
              onChange={e => setNewTarget(e.target.value)} />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {allUsers.filter(u => u.id !== user.id &&
              u.full_name.toLowerCase().includes(newTarget.toLowerCase())).map(u => (
              <div key={u.id} className="inbox-item" onClick={() => startNew(u)} style={{ borderRadius: 4 }}>
                <div className={`avatar avatar-sm ${roleColor(u.role)}`}>{initials(u.full_name)}</div>
                <div>
                  <div className="inbox-name">{u.full_name}</div>
                  <div className="text-xs text-muted">{u.role?.replace("_", " ")}</div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function NotificationsPage({ onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setNotifs(await api.getNotifications()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const markRead = async (n) => {
    if (!n.is_read) { await api.markRead(n.id); onRead(); load(); }
  };

  const markAll = async () => { await api.markAllRead(); onRead(); load(); };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-subtitle">{unreadCount} unread</div>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all as read</button>
        )}
      </div>
      <div className="content-area" style={{ maxWidth: 700 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          {loading ? <Loading /> : notifs.length === 0 ? (
            <EmptyState icon="🔔" text="No notifications yet." />
          ) : notifs.map(n => (
            <div key={n.id} className={`notif-item ${!n.is_read ? "unread" : ""}`} onClick={() => markRead(n)}>
              <div className={`notif-icon ${n.type === "announcement" ? "notif-ann" : "notif-msg"}`}>
                {n.type === "announcement" ? "📢" : "✉️"}
              </div>
              <div style={{ flex: 1 }}>
                <div className="notif-title">{n.title}</div>
                <div className="notif-body">{n.body}</div>
                <div className="notif-time">{fmtTime(n.created_at)}</div>
              </div>
              {!n.is_read && <div className="notif-unread-dot" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── USER MANAGEMENT ──────────────────────────────────────────────────────────

function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(null);
  const [selectedRole, setSelectedRole] = useState("ADMIN");

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.getUsers()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const promote = async (uid) => {
    await api.promoteUser(uid, selectedRole);
    setPromoting(null); load();
  };

  const deactivate = async (uid) => {
    if (!confirm("Deactivate this user?")) return;
    await api.deactivateUser(uid);
    load();
  };

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">User Management</div>
          <div className="page-subtitle">Manage roles and access — Super Admin only</div>
        </div>
        <div className="badge badge-super" style={{ padding: "6px 12px", fontSize: 11 }}>
          {users.length} Users Total
        </div>
      </div>
      <div className="content-area">
        <div className="card" style={{ overflow: "hidden" }}>
          {loading ? <Loading /> : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className={`avatar avatar-sm ${roleColor(u.role)}`}>{initials(u.full_name)}</div>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{u.full_name}</span>
                      </div>
                    </td>
                    <td className="text-muted text-sm">@{u.username}</td>
                    <td className="text-muted text-sm">{u.email}</td>
                    <td>{roleBadge(u.role)}</td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-student" : "badge-super"}`} style={!u.is_active ? { background: "#fef2f2", color: "#991b1b" } : {}}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="text-muted text-sm">{fmtDate(u.created_at)}</td>
                    <td>
                      {u.role !== "SUPER_ADMIN" && u.id !== me?.id && (
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => setPromoting(u)}>
                            Promote
                          </button>
                          {u.is_active && (
                            <button className="btn btn-danger btn-sm" onClick={() => deactivate(u.id)}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {promoting && (
        <Modal title={`Promote ${promoting.full_name}`} onClose={() => setPromoting(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPromoting(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => promote(promoting.id)}>Apply Role</button>
            </>
          }>
          <p style={{ fontSize: 13, color: "var(--ink2)", marginBottom: 20 }}>
            Change role for <strong>{promoting.full_name}</strong> (@{promoting.username}).
            Current role: {roleBadge(promoting.role)}
          </p>
          <div className="form-group">
            <label className="label">New Role</label>
            <select className="select" value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
              <option value="STUDENT">Student</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function App() {
  const { user } = useAuth();
  const [page, setPage] = useState("announcements");
  const [detailId, setDetailId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [unread, setUnread] = useState({ notifs: 0, msgs: 0 });

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await api.getUnreadCount();
      setUnread(u => ({ ...u, notifs: count }));
    } catch { }
  }, []);

  useEffect(() => {
    if (user) {
      refreshUnread();
      const interval = setInterval(refreshUnread, 30000);
      return () => clearInterval(interval);
    }
  }, [user, refreshUnread]);

  if (!user) return <AuthScreen />;

  const goPage = (p) => { setPage(p); setDetailId(null); setEditId(null); };
  const goDetail = (id) => { setDetailId(id); setPage("detail"); };
  const goEdit = (id) => { setEditId(id); setPage("edit-ann"); };

  const renderPage = () => {
    switch (page) {
      case "announcements": return <AnnouncementsPage setPage={setPage} setDetailId={setDetailId} />;
      case "detail": return <AnnouncementDetail annId={detailId} setPage={setPage} />;
      case "create-ann": return <AnnouncementForm setPage={goPage} />;
      case "edit-ann": return <AnnouncementForm annId={detailId || editId} setPage={goPage} />;
      case "messages": return <MessagesPage />;
      case "notifications": return <NotificationsPage onRead={refreshUnread} />;
      case "users": return <UsersPage />;
      default: return <AnnouncementsPage setPage={setPage} setDetailId={setDetailId} />;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={goPage} unread={unread} />
      <div className="main-content">{renderPage()}</div>
    </div>
  );
}

export default function Root() {
  return (
    <>
      <style>{styles}</style>
      <AuthProvider>
        <App />
      </AuthProvider>
    </>
  );
}
