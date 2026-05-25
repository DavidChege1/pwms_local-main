# backend/departments/sleeves/pts/integrity_router.py
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from datetime import datetime
from typing import List

from backend.database.sql_server import get_sql_conn
from backend.departments.sleeves.pts.mismatch_queries import LIVE_MISMATCH_SQL, MACHINE_MAPPING
from backend.schemas.pts import MaterialIntegrityStatus, MaterialIntegrityItem

router = APIRouter()

# Thresholds defined in architecture
MICRON_WARN_LIMIT = 2.0
MICRON_CRITICAL_LIMIT = 3.0
WIDTH_HARD_LIMIT = -0.5  # Material too narrow is critical

def _get_live_mismatches() -> dict:
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(LIVE_MISMATCH_SQL)
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    finally:
        if conn:
            conn.close()

    mismatch_items = []
    critical_count = 0
    warning_count = 0

    for r in rows:
        # Determine Display Name with bracketed format
        # If not in mapping (e.g. Forming), use MachineID
        display_name = MACHINE_MAPPING.get(r["ScanMachineName"], r["MachineID"])
        if r["ScanMachineName"] in MACHINE_MAPPING:
            # We want both names as requested: "Printing_1 (Uflex)"
            # Note: MACHINE_MAPPING already contains the "(Uflex)" part from our config
            display_name = MACHINE_MAPPING[r["ScanMachineName"]]
        
        perfect_m = float(r["PerfectMicron"] or 0)
        scanned_m = float(r["ScannedMicron"]) if r["ScannedMicron"] is not None else None
        
        perfect_w = float(r["PerfectWidth"] or 0)
        scanned_w = float(r["ScannedWidth"]) if r["ScannedWidth"] is not None else None

        micron_delta = abs(scanned_m - perfect_m) if scanned_m is not None else 0.0
        width_delta = (scanned_w - perfect_w) if scanned_w is not None else 0.0

        status = "OK"
        if scanned_m is None:
            status = "UNKNOWN"
        elif micron_delta >= MICRON_CRITICAL_LIMIT or width_delta <= WIDTH_HARD_LIMIT:
            status = "CRITICAL"
            critical_count += 1
        elif micron_delta >= MICRON_WARN_LIMIT:
            status = "WARN"
            warning_count += 1

        mismatch_items.append({
            "MachineID":       r["MachineID"],
            "DisplayName":     display_name,
            "ItemCode":        r["ItemCode"],
            "ItemDescription": r["ItemDescription"],
            "PerfectMicron":   perfect_m,
            "ScannedMicron":   scanned_m,
            "MicronDelta":     round(micron_delta, 2),
            "PerfectWidth":    perfect_w,
            "ScannedWidth":    scanned_w,
            "WidthDelta":      round(width_delta, 2),
            "Status":          status,
            "LastScanTime":    r["ScanTime"].strftime("%Y-%m-%d %H:%M:%S") if r["ScanTime"] else None
        })

    mismatches_found = critical_count + warning_count
    
    alert_level = "OK"
    if critical_count > 0:
        alert_level = "CRITICAL"
    elif warning_count > 0:
        alert_level = "WARN"

    return {
        "TotalMachines":     len(rows),
        "MismatchesFound":   mismatches_found,
        "CriticalCount":     critical_count,
        "WarningCount":      warning_count,
        "AlertLevel":        alert_level,
        "Timestamp":         datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "Machines":          mismatch_items
    }

@router.get("/live-status", response_model=MaterialIntegrityStatus)
async def get_live_status():
    """
    Returns the real-time material health across all active machines.
    Used by the 'Material Health' dashboard widget.
    """
    try:
        return await run_in_threadpool(_get_live_mismatches)
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
