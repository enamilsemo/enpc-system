"""
ENPC Official Communication System - Business Logic Services
All domain operations: users, announcements, comments, messages, notifications
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models import User, Announcement, Comment, Message, Notification, UserRole
from auth import hash_password


# ─── USER SERVICES ────────────────────────────────────────────────────────────

def create_user(db: Session, username: str, email: str, password: str,
                full_name: str, role: UserRole = UserRole.STUDENT) -> User:
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def promote_user(db: Session, target_id: int, new_role: UserRole) -> User:
    user = db.query(User).filter(User.id == target_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot modify Super Admin role")
    user.role = new_role
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session, skip: int = 0, limit: int = 50) -> List[User]:
    return db.query(User).offset(skip).limit(limit).all()


def get_user_by_id(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def deactivate_user(db: Session, target_id: int) -> User:
    user = get_user_by_id(db, target_id)
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot deactivate Super Admin")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


# ─── ANNOUNCEMENT SERVICES ────────────────────────────────────────────────────

def create_announcement(db: Session, title: str, content: str,
                        category: str, is_pinned: bool, author_id: int) -> Announcement:
    ann = Announcement(
        title=title,
        content=content,
        category=category,
        is_pinned=is_pinned,
        author_id=author_id
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)

    # Notify all active students
    students = db.query(User).filter(
        User.role == UserRole.STUDENT,
        User.is_active == True
    ).all()
    for student in students:
        notif = Notification(
            title=f"New Announcement: {title}",
            body=content[:100] + ("..." if len(content) > 100 else ""),
            type="announcement",
            ref_id=ann.id,
            user_id=student.id
        )
        db.add(notif)
    db.commit()
    return ann


def list_announcements(db: Session, skip: int = 0, limit: int = 20,
                       category: Optional[str] = None) -> List[Announcement]:
    q = db.query(Announcement)
    if category:
        q = q.filter(Announcement.category == category)
    return q.order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc()) \
            .offset(skip).limit(limit).all()


def get_announcement(db: Session, ann_id: int) -> Announcement:
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return ann


def update_announcement(db: Session, ann_id: int, **kwargs) -> Announcement:
    ann = get_announcement(db, ann_id)
    for key, value in kwargs.items():
        if value is not None:
            setattr(ann, key, value)
    db.commit()
    db.refresh(ann)
    return ann


def delete_announcement(db: Session, ann_id: int) -> bool:
    ann = get_announcement(db, ann_id)
    db.delete(ann)
    db.commit()
    return True


# ─── COMMENT SERVICES ─────────────────────────────────────────────────────────

def create_comment(db: Session, content: str, author_id: int,
                   announcement_id: int) -> Comment:
    get_announcement(db, announcement_id)  # validate exists
    comment = Comment(
        content=content,
        author_id=author_id,
        announcement_id=announcement_id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def list_comments(db: Session, announcement_id: int,
                  include_hidden: bool = False) -> List[Comment]:
    q = db.query(Comment).filter(Comment.announcement_id == announcement_id)
    if not include_hidden:
        q = q.filter(Comment.is_hidden == False)
    return q.order_by(Comment.created_at.asc()).all()


def moderate_comment(db: Session, comment_id: int, hide: bool) -> Comment:
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.is_hidden = hide
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment_id: int) -> bool:
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    db.delete(comment)
    db.commit()
    return True


# ─── MESSAGE SERVICES ─────────────────────────────────────────────────────────

def send_message(db: Session, content: str, sender_id: int,
                 receiver_id: int) -> Message:
    # Validate receiver exists
    get_user_by_id(db, receiver_id)

    msg = Message(
        content=content,
        sender_id=sender_id,
        receiver_id=receiver_id
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    sender = get_user_by_id(db, sender_id)
    notif = Notification(
        title=f"New message from {sender.full_name}",
        body=content[:80] + ("..." if len(content) > 80 else ""),
        type="message",
        ref_id=msg.id,
        user_id=receiver_id
    )
    db.add(notif)
    db.commit()
    return msg


def get_conversation(db: Session, user_id: int,
                     other_user_id: int) -> List[Message]:
    msgs = db.query(Message).filter(
        ((Message.sender_id == user_id) & (Message.receiver_id == other_user_id)) |
        ((Message.sender_id == other_user_id) & (Message.receiver_id == user_id))
    ).order_by(Message.created_at.asc()).all()

    # Mark unread messages as read
    for m in msgs:
        if m.receiver_id == user_id and not m.is_read:
            m.is_read = True
    db.commit()
    return msgs


def get_inbox(db: Session, user_id: int) -> list:
    """Get all unique conversations for a user with latest message preview."""
    messages = db.query(Message).filter(
        (Message.sender_id == user_id) | (Message.receiver_id == user_id)
    ).order_by(Message.created_at.desc()).all()

    seen = {}
    for m in messages:
        other_id = m.receiver_id if m.sender_id == user_id else m.sender_id
        if other_id not in seen:
            seen[other_id] = m
    return list(seen.values())


# ─── NOTIFICATION SERVICES ────────────────────────────────────────────────────

def get_notifications(db: Session, user_id: int,
                      unread_only: bool = False) -> List[Notification]:
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).limit(50).all()


def mark_notification_read(db: Session, notif_id: int, user_id: int) -> Notification:
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == user_id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_read(db: Session, user_id: int) -> int:
    count = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return count


def get_unread_count(db: Session, user_id: int) -> int:
    return db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False
    ).count()
