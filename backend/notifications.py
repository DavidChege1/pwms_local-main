from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from backend.auth import verify_token
from fastapi.responses import JSONResponse
import sqlite3
from typing import List, Dict, Optional
import json
from backend.database import local_db
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/notifications")

class ConnectionManager:
    def __init__(self):
        # Active connections: { "client_id": [list of websockets] }
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Message history (volatile for now)
        self.messages: List[Dict] = []

    async def connect(self, websocket: WebSocket, client_id: str):
        print(f"[DEBUG] Incoming WS connection attempt for client: {client_id}")
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = []
        self.active_connections[client_id].append(websocket)
        print(f"Client {client_id} connected. Total active: {len(self.active_connections[client_id])}")

    def disconnect(self, websocket: WebSocket, client_id: str):
        if client_id in self.active_connections:
            self.active_connections[client_id].remove(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]
        print(f"Client {client_id} disconnected.")

    async def broadcast_to_client(self, client_id: str, message: dict):
        """Send message only to a specific group (e.g. 'dispatch')"""
        if client_id in self.active_connections:
            for connection in self.active_connections[client_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Error broadcasting to {client_id}: {e}")

manager = ConnectionManager()

@router.websocket("/ws/dispatch")
@router.websocket("/ws/dispatch/")
@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str = "dispatch"):
    # Early debug log
    print(f"[WS] Connection request received on path: {websocket.url.path}")
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client-side heartbeat or generic pings if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket, client_id)

# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL MESSAGING
# ─────────────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    sender: str
    recipient: str  # 'all', 'dispatch', or specific user_id
    content: str
    timestamp: Optional[str] = None

@router.get("/messages", dependencies=[Depends(verify_token)])
async def get_messages(recipient: Optional[str] = None):
    if not recipient:
        return manager.messages
    return [m for m in manager.messages if m['recipient'] in [recipient, 'all']]

@router.post("/messages", dependencies=[Depends(verify_token)])
async def send_message(msg: ChatMessage):
    msg_dict = msg.dict()
    msg_dict['timestamp'] = datetime.now().strftime("%H:%M")
    manager.messages.append(msg_dict)
    
    # Trim history to last 100
    if len(manager.messages) > 100:
        manager.messages.pop(0)

    # Broadcast to recipient
    payload = {
        "type": "MESSAGE",
        "title": f"Message from {msg.sender}",
        "message": msg.content,
        "data": msg_dict
    }
    await manager.broadcast_to_client(msg.recipient, payload)
    if msg.recipient != 'all':
        # Also broadcast to 'all' for monitoring if needed, or just let it be
        pass
        
    return {"status": "sent", "timestamp": msg_dict['timestamp']}

# ─────────────────────────────────────────────────────────────────────────────
# DISPATCH FLOW
# ─────────────────────────────────────────────────────────────────────────────

class DispatchSignal(BaseModel):
    DocNum: int
    Customer: str
    ProductCode: str
    Description: str
    Quantity: float
    Recipient: Optional[str] = "dispatch"

class DispatchUpdate(BaseModel):
    status: str
    comments: Optional[str] = ""

@router.get("/dispatch", dependencies=[Depends(verify_token)])
async def get_signals():
    return local_db.get_dispatch_signals()

@router.post("/dispatch", dependencies=[Depends(verify_token)])
async def send_dispatch_signal(data: dict):
    """Sends a new dispatch signal and notifies agents."""
    signal_id = local_db.save_dispatch_signal(data)
    if not signal_id:
        return JSONResponse(status_code=409, content={"message": "Duplicate signal: DocNum is already pending."})
    
    # Notify agents
    data['id'] = signal_id
    await manager.broadcast_to_client("dispatch", {"type": "NEW_ORDER", "data": data})
    return {"status": "success", "id": signal_id}

@router.post("/dispatch-bulk", dependencies=[Depends(verify_token)])
async def send_dispatch_bulk(payload: dict):
    """Sends multiple signals at once and broadcasts a single 'BULK_ORDER' event."""
    items = payload.get("items", [])
    if not items:
        return {"status": "error", "message": "No items provided"}
    
    saved_ids = []
    for item in items:
        sid = local_db.save_dispatch_signal(item)
        if sid:
            saved_ids.append(sid)
            
    if saved_ids:
        # Broadcast a single event for the entire batch
        await manager.broadcast_to_client("dispatch", {
            "type": "BULK_ORDER", 
            "data": {
                "DocNum": items[0].get("DocNum"),
                "Customer": items[0].get("Customer"),
                "Count": len(items)
            }
        })
        return {"status": "success", "count": len(saved_ids)}
    return JSONResponse(status_code=409, content={"message": "No new signals added (all duplicates)."})

@router.patch("/dispatch/{signal_id}", dependencies=[Depends(verify_token)])
async def patch_dispatch_signal(signal_id: int, update: dict):
    """Updates the status of a signal and notifies all agents."""
    success = local_db.update_dispatch_status(signal_id, update.get("status"), update.get("comments"))
    if success:
        # Fetch the updated signal to send it back
        updated_signals = local_db.get_dispatch_signals()
        signal = next((s for s in updated_signals if s['id'] == signal_id), None)
        
        # Broadcast to all agents that a status has changed
        if signal:
            await manager.broadcast_to_client("dispatch", {
                "type": "STATUS_UPDATE",
                "data": signal
            })
        return {"status": "success"}
    return JSONResponse(status_code=409, content={"message": "Update failed: Order may have already been processed by another station."})

@router.post("/archive", dependencies=[Depends(verify_token)])
async def archive_dispatches(payload: dict = None):
    user_name = payload.get("user", "Unknown User") if payload else "Unknown User"
    success = local_db.archive_all_dispatches(user_name)
    if success:
        # Notify all clients to refresh their empty list
        await manager.broadcast_to_client("dispatch", {"type": "STATUS_UPDATE", "data": "REFRESH_ALL"})
        return {"status": "success", "message": "All dispatches archived."}
    return JSONResponse(status_code=500, content={"message": "Archiving failed."})

@router.get("/export-archive")
async def export_archive():
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    conn = sqlite3.connect(local_db.DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM dispatch_archive ORDER BY ArchivedAt DESC")
        rows = cursor.fetchall()
        
        if not rows:
            return JSONResponse(status_code=404, content={"message": "No archived data found."})
            
        from datetime import timedelta
        processed_rows = []
        for row in rows:
            d = dict(row)
            # Convert UTC strings to EAT (UTC+3) for the CSV log
            for field in ['TimeSent', 'ArchivedAt']:
                if d.get(field):
                    try:
                        # SQLite stores as YYYY-MM-DD HH:MM:SS
                        dt = datetime.strptime(d[field], "%Y-%m-%d %H:%M:%S")
                        d[field] = (dt + timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S") + " (EAT)"
                    except: pass
            processed_rows.append(d)
            
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=processed_rows[0].keys())
        writer.writeheader()
        writer.writerows(processed_rows)
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=dispatch_archive_log.csv"}
        )
    finally:
        conn.close()

@router.post("/send", dependencies=[Depends(verify_token)])
async def send_generic_notification(payload: dict):
    recipient = payload.get("recipient", "dispatch")
    await manager.broadcast_to_client(recipient, payload)
    return {"status": "sent", "recipient": recipient}

@router.get("/whoami")
async def whoami():
    import socket
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    return {
        "hostname": hostname,
        "ip": ip_address,
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
