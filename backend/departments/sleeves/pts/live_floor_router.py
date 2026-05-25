import datetime
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.database.sql_server import get_sql_conn
from backend.schemas.estimator import LiveJob, LiveFloorResponse

router = APIRouter()

# ─────────────────────────────────────────────────────────────────────────────
# SQL DEFINITION: Live Floor Pulse
# ─────────────────────────────────────────────────────────────────────────────
# Finds the most recent reel scan for every machine (PR% and FORM%).
# Cross-references the MotherJobID with SAP OWOR to show what job is running.
# ─────────────────────────────────────────────────────────────────────────────
PTS_LIVE_FLOOR_SQL = """
WITH LatestReel AS (
    SELECT 
        MachineID, 
        MAX(DateStamp) as LastScan,
        MAX(MotherJobID) as LastSysID
    FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS
    WHERE DateStamp >= DATEADD(day, -3, GETDATE())
    GROUP BY MachineID
)
SELECT 
    lr.MachineID,
    lr.LastScan,
    h.ProductionOrder,
    h.ItemCode,
    h.ItemDescription,
    ISNULL(CAST(o.PlannedQty AS FLOAT), 0.0) as PlannedQty,
    ISNULL(CAST(o.CmpltQty AS FLOAT), 0.0) as ProducedQty,
    o.[Status],
    r.PriorityIndex,
    r.ProductionComments
FROM LatestReel lr
LEFT JOIN PTK.dbo.SPC_PRODUCTION_INFO_HEADER h ON lr.LastSysID = h.SysID
LEFT JOIN DKL.dbo.OWOR o ON h.ProductionOrder = o.DocNum
LEFT JOIN ELGON.dbo.EKL_ORUN r ON h.ProductionOrder = r.BackOrderRef
ORDER BY lr.LastScan DESC
"""

@router.get("/status", response_model=LiveFloorResponse)
async def get_live_floor():
    """
    Returns a snapshot of the factory floor based on the latest reel scans.
    """
    return await run_in_threadpool(_get_live_floor)

def _get_live_floor() -> dict:
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(PTS_LIVE_FLOOR_SQL)
            columns = [column[0] for column in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch live floor data: {str(e)}")
    finally:
        if conn:
            conn.close()

    now = datetime.datetime.now()
    machine_list = []

    for r in rows:
        last_scan = r["LastScan"]
        # A machine is considered "Active" if it scanned a reel in the last 2 hours
        is_active = (now - last_scan).total_seconds() < (2 * 3600) if last_scan else False

        machine_list.append({
            "MachineID": r["MachineID"],
            "LastScan": last_scan.isoformat() if last_scan else "Never",
            "ProductionOrder": str(r["ProductionOrder"]) if r["ProductionOrder"] else "Idle",
            "ItemCode": r["ItemCode"] or "N/A",
            "ItemDescription": r["ItemDescription"] or "No Job Active",
            "PlannedQty": r["PlannedQty"],
            "ProducedQty": r["ProducedQty"],
            "Status": r["Status"] or "Unknown",
            "IsActive": is_active,
            "PriorityIndex": r["PriorityIndex"],
            "ProductionComments": r["ProductionComments"]
        })

    return {
        "Machines": machine_list,
        "LastUpdated": now.isoformat()
    }
