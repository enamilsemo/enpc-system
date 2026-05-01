"""
ENPC Official Communication System - Main API
FastAPI entry point with all routes, schemas, and startup logic
"""

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import uuid, os, shutil

from models import get_db, init_db, User, UserRole, Announcement, Comment, Message, Notification, Attachment, UPLOAD_DIR
from auth import (
    authenticate_user, create_token, get_current_user,
    require_admin, require_super_admin
)
import services

# ─── APP INIT ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ENPC Official Communication System",
    description="University communication platform with role-based access",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def on_startup():
    init_db()
    _seed_super_admin()


def _seed_super_admin():
    from models import SessionLocal
    from auth import hash_password
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == "slimane").first()
        if not existing:
            admin = User(
                username="slimane",
                email="slimane@enpc.dz",
                hashed_password=hash_password("slimane.2007"),
                full_name="Slimane Super Admin",
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("✅ Super Admin seeded: slimane / slimane.2007")
    finally:
        db.close()


# ─── SCHEMAS ──────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: str

class LoginRequest(BaseModel):
    username: str
    password: str

class PromoteRequest(BaseModel):
    role: UserRole

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    category: str = "General"
    is_pinned: bool = False

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    is_pinned: Optional[bool] = None

class CommentCreate(BaseModel):
    content: str

class MessageCreate(BaseModel):
    content: str
    receiver_id: int

class UserOut(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class AttachmentOut(BaseModel):
    id: int
    filename: str
    stored_name: str
    file_type: str
    file_size: int
    announcement_id: int
    uploaded_at: datetime
    class Config:
        from_attributes = True

class AnnouncementOut(BaseModel):
    id: int
    title: str
    content: str
    category: str
    is_pinned: bool
    author_id: int
    created_at: datetime
    updated_at: datetime
    author: UserOut
    attachments: List[AttachmentOut] = []
    class Config:
        from_attributes = True

class CommentOut(BaseModel):
    id: int
    content: str
    is_hidden: bool
    author_id: int
    announcement_id: int
    created_at: datetime
    author: UserOut
    class Config:
        from_attributes = True

class MessageOut(BaseModel):
    id: int
    content: str
    sender_id: int
    receiver_id: int
    is_read: bool
    created_at: datetime
    sender: UserOut
    receiver: UserOut
    class Config:
        from_attributes = True

class NotificationOut(BaseModel):
    id: int
    title: str
    body: str
    type: str
    is_read: bool
    ref_id: Optional[int]
    user_id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserOut, tags=["Auth"])
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    return services.create_user(
        db, req.username, req.email, req.password, req.full_name
    )

@app.post("/auth/login", tags=["Auth"])
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    token = create_token({"sub": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        }
    }

@app.get("/auth/me", response_model=UserOut, tags=["Auth"])
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ─── USER ROUTES ──────────────────────────────────────────────────────────────

@app.get("/users", response_model=List[UserOut], tags=["Users"])
def list_users(
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return services.list_users(db, skip, limit)

@app.get("/users/{user_id}", response_model=UserOut, tags=["Users"])
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.get_user_by_id(db, user_id)

@app.put("/users/{user_id}/promote", response_model=UserOut, tags=["Users"])
def promote_user(
    user_id: int,
    req: PromoteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    return services.promote_user(db, user_id, req.role)

@app.put("/users/{user_id}/deactivate", response_model=UserOut, tags=["Users"])
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    return services.deactivate_user(db, user_id)


# ─── ANNOUNCEMENT ROUTES ──────────────────────────────────────────────────────

@app.get("/announcements", response_model=List[AnnouncementOut], tags=["Announcements"])
def list_announcements(
    skip: int = 0,
    limit: int = 20,
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.list_announcements(db, skip, limit, category)

@app.get("/announcements/{ann_id}", response_model=AnnouncementOut, tags=["Announcements"])
def get_announcement(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.get_announcement(db, ann_id)

@app.post("/announcements", response_model=AnnouncementOut, tags=["Announcements"])
async def create_announcement(
    title: str = Form(...),
    content: str = Form(...),
    category: str = Form("General"),
    is_pinned: bool = Form(False),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    ann = services.create_announcement(
        db, title, content, category, is_pinned, current_user.id
    )
    # Save uploaded files
    for file in files:
        if not file.filename:
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, stored_name)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        size = os.path.getsize(dest)
        ftype = _detect_type(ext)
        attachment = Attachment(
            filename=file.filename,
            stored_name=stored_name,
            file_type=ftype,
            file_size=size,
            announcement_id=ann.id
        )
        db.add(attachment)
    db.commit()
    db.refresh(ann)
    return ann


def _detect_type(ext: str) -> str:
    if ext in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    if ext in (".doc", ".docx"):
        return "doc"
    if ext in (".xls", ".xlsx"):
        return "sheet"
    if ext in (".ppt", ".pptx"):
        return "ppt"
    return "other"


@app.post("/announcements/{ann_id}/attachments", tags=["Announcements"])
async def upload_attachments(
    ann_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Upload additional files to an existing announcement."""
    services.get_announcement(db, ann_id)
    added = []
    for file in files:
        if not file.filename:
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, stored_name)
        with open(dest, "wb") as f:
            shutil.copyfileobj(file.file, f)
        size = os.path.getsize(dest)
        att = Attachment(
            filename=file.filename,
            stored_name=stored_name,
            file_type=_detect_type(ext),
            file_size=size,
            announcement_id=ann_id
        )
        db.add(att)
        added.append(att)
    db.commit()
    for a in added:
        db.refresh(a)
    return added


@app.delete("/attachments/{att_id}", tags=["Announcements"])
def delete_attachment(
    att_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    att = db.query(Attachment).filter(Attachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    # Remove file from disk
    path = os.path.join(UPLOAD_DIR, att.stored_name)
    if os.path.exists(path):
        os.remove(path)
    db.delete(att)
    db.commit()
    return {"message": "Attachment deleted"}

@app.put("/announcements/{ann_id}", response_model=AnnouncementOut, tags=["Announcements"])
def update_announcement(
    ann_id: int,
    req: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return services.update_announcement(
        db, ann_id,
        title=req.title, content=req.content,
        category=req.category, is_pinned=req.is_pinned
    )

@app.delete("/announcements/{ann_id}", tags=["Announcements"])
def delete_announcement(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    services.delete_announcement(db, ann_id)
    return {"message": "Announcement deleted"}


# ─── COMMENT ROUTES ───────────────────────────────────────────────────────────

@app.get("/announcements/{ann_id}/comments", response_model=List[CommentOut], tags=["Comments"])
def list_comments(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    include_hidden = current_user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN)
    return services.list_comments(db, ann_id, include_hidden)

@app.post("/announcements/{ann_id}/comments", response_model=CommentOut, tags=["Comments"])
def create_comment(
    ann_id: int,
    req: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.create_comment(db, req.content, current_user.id, ann_id)

@app.put("/comments/{comment_id}/hide", tags=["Comments"])
def moderate_comment(
    comment_id: int,
    hide: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    return services.moderate_comment(db, comment_id, hide)

@app.delete("/comments/{comment_id}", tags=["Comments"])
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    services.delete_comment(db, comment_id)
    return {"message": "Comment deleted"}


# ─── MESSAGE ROUTES ───────────────────────────────────────────────────────────

@app.post("/messages", response_model=MessageOut, tags=["Messages"])
def send_message(
    req: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.send_message(db, req.content, current_user.id, req.receiver_id)

@app.get("/messages/inbox", tags=["Messages"])
def get_inbox(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    msgs = services.get_inbox(db, current_user.id)
    result = []
    for m in msgs:
        other_id = m.receiver_id if m.sender_id == current_user.id else m.sender_id
        other = services.get_user_by_id(db, other_id)
        result.append({
            "user": {"id": other.id, "username": other.username, "full_name": other.full_name, "role": other.role},
            "last_message": {"content": m.content, "created_at": m.created_at, "is_read": m.is_read},
            "unread": not m.is_read and m.receiver_id == current_user.id
        })
    return result

@app.get("/messages/conversation/{other_user_id}", response_model=List[MessageOut], tags=["Messages"])
def get_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.get_conversation(db, current_user.id, other_user_id)


# ─── NOTIFICATION ROUTES ──────────────────────────────────────────────────────

@app.get("/notifications", response_model=List[NotificationOut], tags=["Notifications"])
def get_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.get_notifications(db, current_user.id, unread_only)

@app.get("/notifications/count", tags=["Notifications"])
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"count": services.get_unread_count(db, current_user.id)}

@app.put("/notifications/{notif_id}/read", response_model=NotificationOut, tags=["Notifications"])
def mark_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return services.mark_notification_read(db, notif_id, current_user.id)

@app.put("/notifications/read-all", tags=["Notifications"])
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    count = services.mark_all_read(db, current_user.id)
    return {"marked": count}


# ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "system": "ENPC Communication System", "version": "1.0.0"}
