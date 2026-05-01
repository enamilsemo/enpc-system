# ENPC Official Communication System

A full-stack university communication platform with role-based access control,
announcements, comments, private messaging, and notifications.

---

## 📁 Project Structure

```
enpc/
├── backend/                  ← FastAPI (4 files)
│   ├── main.py               # API entry, all routes & schemas
│   ├── models.py             # SQLAlchemy ORM + DB init
│   ├── auth.py               # JWT, bcrypt, role guards
│   ├── services.py           # All business logic
│   └── requirements.txt
│
└── frontend/                 ← React + Vite (4 files)
    ├── App.jsx               # Full UI: auth, all screens, API layer
    ├── index.html            # HTML entry
    ├── vite.config.js        # Vite config
    ├── package.json
    └── src/
        └── main.jsx          # React root mount
```

---

## 👤 Roles & Credentials

| Role        | Username  | Password      | Capabilities                          |
|-------------|-----------|---------------|---------------------------------------|
| SUPER_ADMIN | `slimane` | `slimane.2007`| Full control, promote users, delete all |
| ADMIN       | (promoted)| —             | Create announcements, moderate comments |
| STUDENT     | (register)| —             | View, comment, send messages          |

> **Super Admin is auto-created on first server startup.**

---

## 🚀 Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm

---

### 1. Backend Setup

```bash
cd enpc/backend

# Create virtual environment
python -m venv venv

# Activate it
# On Linux/macOS:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --port 8000
```

The backend will start at: **http://localhost:8000**  
API docs available at: **http://localhost:8000/docs**

---

### 2. Frontend Setup

```bash
cd enpc/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

The frontend will start at: **http://localhost:5173**

---

## 🗄️ Database

SQLite is used automatically — no configuration needed.  
The file `enpc.db` is created in the `backend/` directory on first run.

### Schema Overview

```sql
users          → id, username, email, hashed_password, full_name, role, is_active, created_at
announcements  → id, title, content, category, is_pinned, author_id, created_at, updated_at
comments       → id, content, is_hidden, author_id, announcement_id, created_at
messages       → id, content, sender_id, receiver_id, is_read, created_at
notifications  → id, title, body, type, is_read, ref_id, user_id, created_at
```

---

## 🔐 API Authentication

All protected endpoints require JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_token>
```

Token is returned on login and stored in `localStorage` by the frontend.

---

## 📡 API Endpoints Summary

### Auth
| Method | Path              | Access  | Description          |
|--------|-------------------|---------|----------------------|
| POST   | /auth/register    | Public  | Register new student |
| POST   | /auth/login       | Public  | Login, get JWT       |
| GET    | /auth/me          | Auth    | Get current user     |

### Announcements
| Method | Path                   | Access | Description            |
|--------|------------------------|--------|------------------------|
| GET    | /announcements         | Auth   | List all               |
| GET    | /announcements/{id}    | Auth   | Get one                |
| POST   | /announcements         | Admin  | Create new             |
| PUT    | /announcements/{id}    | Admin  | Update                 |
| DELETE | /announcements/{id}    | Admin  | Delete                 |

### Comments
| Method | Path                              | Access  | Description       |
|--------|-----------------------------------|---------|-------------------|
| GET    | /announcements/{id}/comments      | Auth    | List comments     |
| POST   | /announcements/{id}/comments      | Auth    | Add comment       |
| PUT    | /comments/{id}/hide               | Admin   | Hide/unhide       |
| DELETE | /comments/{id}                    | Admin   | Delete            |

### Messages
| Method | Path                          | Access | Description       |
|--------|-------------------------------|--------|-------------------|
| POST   | /messages                     | Auth   | Send message      |
| GET    | /messages/inbox               | Auth   | Get inbox         |
| GET    | /messages/conversation/{uid}  | Auth   | Get conversation  |

### Notifications
| Method | Path                       | Access | Description         |
|--------|----------------------------|--------|---------------------|
| GET    | /notifications             | Auth   | Get all             |
| GET    | /notifications/count       | Auth   | Unread count        |
| PUT    | /notifications/{id}/read   | Auth   | Mark one as read    |
| PUT    | /notifications/read-all    | Auth   | Mark all as read    |

### Users (Super Admin only)
| Method | Path                      | Access      | Description        |
|--------|---------------------------|-------------|--------------------|
| GET    | /users                    | Admin       | List all users     |
| GET    | /users/{id}               | Auth        | Get user           |
| PUT    | /users/{id}/promote       | Super Admin | Change role        |
| PUT    | /users/{id}/deactivate    | Super Admin | Deactivate         |

---

## 🌐 Frontend Features

- **Announcements Feed** — filterable by category, pinned items at top
- **Announcement Detail** — full content + comments with moderation
- **Create/Edit Announcements** — admin-only form with rich options
- **Messages** — real-time-style inbox + conversation view
- **Notifications** — live badge counter, mark read, mark all read
- **User Management** — role promotion table (Super Admin only)
- **Role-aware UI** — navigation and actions adapt to user role

---

## 🔔 Notification Triggers

| Event                    | Who Gets Notified   |
|--------------------------|---------------------|
| New announcement posted  | All active students |
| New message received     | Message recipient   |

---

## 🏗️ Build for Production

```bash
# Backend: use gunicorn
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Frontend: build static files
cd frontend
npm run build
# Output in dist/ — serve with nginx or any static host
```

---

## ⚙️ Environment Configuration

For production, update these values in `backend/auth.py`:

```python
SECRET_KEY = "your-secure-random-secret-key-here"
ACCESS_TOKEN_EXPIRE_HOURS = 24
```

And in `frontend/App.jsx`:
```javascript
const BASE = "https://your-api-domain.com";
```

---

## 🔒 Security Notes

- Passwords are hashed with bcrypt (cost factor 12)
- JWT tokens expire after 24 hours
- Role checks enforced server-side on every request
- Super Admin account protected from demotion/deactivation
- CORS configured (restrict origins in production)
