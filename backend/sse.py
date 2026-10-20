"""
sse.py — Server-Sent Events broadcaster.

Keeps a set of asyncio Queues (one per connected client).
broadcast() puts a message on every queue.
The /api/events endpoint in system.py drains its queue as an async generator.
"""

import asyncio
import json
from typing import Any

# All currently connected SSE clients
_clients: set[asyncio.Queue] = set()


def client_count() -> int:
    return len(_clients)


def add_client(q: asyncio.Queue) -> None:
    _clients.add(q)


def remove_client(q: asyncio.Queue) -> None:
    _clients.discard(q)


# Aliases for routes/system.py
add_listener = add_client
remove_listener = remove_client


async def broadcast(event: str, data: Any) -> None:
    """Send an SSE event to every connected client."""
    payload = f"event: {event}\ndata: {json.dumps(data)}\n\n"
    dead: list[asyncio.Queue] = []
    for q in list(_clients):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        except Exception:
            dead.append(q)
    for q in dead:
        _clients.discard(q)
