"""
routes/salesmen.py — Sales staff management and staff authentication.

Endpoints:
  POST   /api/salesman/login   authenticate staff and issue session token
  GET    /api/salesmen         list all staff members
  POST   /api/salesmen         create staff member (Owner only)
  DELETE /api/salesmen/{id}    remove staff member (Owner only)
"""

from fastapi import APIRouter, Request, Response, status

router = APIRouter()


@router.post("/salesman/login")
def login(request: Request, response: Response):
    """Staff accounts removed: return default open access."""
    return {
        "success": True,
        "token": "open-studio-session",
        "salesman": {"id": 1, "name": "Studio", "role": "owner"},
        "user": {"id": 1, "username": "Admin", "role": "owner"},
    }


@router.post("/salesman/quick-login")
def quick_login(request: Request, response: Response):
    """Staff accounts removed: return default open access."""
    return {
        "success": True,
        "token": "open-studio-session",
        "salesman": {"id": 1, "name": "Studio", "role": "owner"},
    }


@router.get("/salesmen")
def list_salesmen():
    """Staff accounts removed: returns empty list."""
    return {"success": True, "salesmen": []}


@router.post("/salesmen", status_code=status.HTTP_200_OK)
def create_salesman():
    """Staff accounts removed."""
    return {"success": True, "message": "Staff functions are disabled."}


@router.delete("/salesmen/{salesman_id}")
def delete_salesman(salesman_id: int):
    """Staff accounts removed."""
    return {"success": True, "message": "Staff functions are disabled."}
