from fastapi import FastAPI, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
from backend.database import local_db

from backend.departments.sleeves.forming import router as forming_router
from backend.departments.sleeves.printing import router as printing_router
from backend.departments.sleeves.pts import router as pts_router
from backend.departments.sleeves.pts import integrity_router
from backend.departments.labels import router as labels_router
from backend.ml import router as ml_router
from backend.departments.sleeves.pts import live_floor_router
from backend.departments.sleeves.pts import slitting_router
from backend import notifications
from backend.auth import router as auth_router, verify_token

async def janitor_loop():
    """Starts the background janitor to auto-archive old records."""
    while True:
        try:
            print("[SYSTEM] Janitor running: Auto-archiving dispatches older than 3 days...")
            local_db.auto_archive_old_dispatches(days=3)
        except Exception as e:
            print(f"[ERROR] Janitor failed: {e}")
        await asyncio.sleep(3600) # Run every hour

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[SYSTEM] Starting background janitor task...")
    janitor_task = asyncio.create_task(janitor_loop())
    yield
    print("[SYSTEM] Stopping background janitor task...")
    janitor_task.cancel()
    try:
        await janitor_task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Sleeves Department Production System API", lifespan=lifespan)

# Setup CORS for local frontend execution
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to deployed frontend IP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public Security & Auth Endpoints
app.include_router(auth_router, prefix="/api/auth", tags=["Security & Authentication"])

# Unified Sleeves Department Route Mounting (Protected)
app.include_router(forming_router.router, prefix="/api/sleeves/forming", tags=["Sleeves - Forming"], dependencies=[Depends(verify_token)])
app.include_router(printing_router.router, prefix="/api/sleeves/printing", tags=["Sleeves - Printing"], dependencies=[Depends(verify_token)])
# PTS Back Order Intelligence — standalone module, do not merge with printing router
app.include_router(pts_router.router, prefix="/api/sleeves/pts", tags=["PTS - Back Order Intelligence"], dependencies=[Depends(verify_token)])
from backend.departments.sleeves.pts import estimator_router
app.include_router(estimator_router.router, prefix="/api/sleeves/pts/estimator", tags=["Production Estimator"], dependencies=[Depends(verify_token)])
app.include_router(live_floor_router.router, prefix="/api/sleeves/pts/live-floor", tags=["Live Floor Monitor"], dependencies=[Depends(verify_token)])
app.include_router(integrity_router.router, prefix="/api/sleeves/pts/integrity", tags=["Material Integrity (The Guardian)"], dependencies=[Depends(verify_token)])
app.include_router(slitting_router.router, prefix="/api/sleeves/pts/slitting", tags=["Slitting Activity Intelligence"], dependencies=[Depends(verify_token)])
app.include_router(labels_router.router, prefix="/api/labels", tags=["Labels Department"], dependencies=[Depends(verify_token)])
app.include_router(ml_router.router, prefix="/api/ml", tags=["Machine Learning"], dependencies=[Depends(verify_token)])
app.include_router(notifications.router, tags=["System Notifications"])

@app.websocket("/api/notifications/ws/dispatch")
@app.websocket("/api/notifications/ws/dispatch/")
@app.websocket("/ws/dispatch")
async def top_level_ws(websocket: WebSocket):
    """Absolute top-level WebSocket route to bypass router issues."""
    from backend.notifications import websocket_endpoint
    await websocket_endpoint(websocket, "dispatch")

# Background janitor task is managed dynamically by the lifespan handler.

@app.get("/")
def root():
    return {"status": "Sleeves Department API is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=9092,
        reload=True,
        reload_excludes=["desktop_notifier/dist/*", "desktop_notifier/build/*", "*.log"]
    )
