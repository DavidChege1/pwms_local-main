from typing import List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
import pandas as pd
from backend.database.sql_server import get_sql_conn
from backend.departments.labels.queries import (
    MATERIAL_TARGETS_SQL,
    MATERIAL_USAGE_SQL,
    WASTE_BY_ORDER_SQL,
    SLITTING_ACTIVITY_SQL
)
from backend.schemas.labels import (
    MaterialTargetItem,
    MaterialUsageItem,
    WasteByOrderItem,
    SlittingActivityItem
)
from cachetools import cached, TTLCache

# Cache configurations
targets_cache = TTLCache(maxsize=50, ttl=30)
usage_cache = TTLCache(maxsize=50, ttl=30)
waste_cache = TTLCache(maxsize=50, ttl=30)
slitting_activity_cache = TTLCache(maxsize=50, ttl=30)

router = APIRouter()
LABEL_DB = "PTL"

@router.get("/material-targets", response_model=List[MaterialTargetItem])
async def get_material_targets(start_date: str, end_date: str):
    """
    Fetches material production targets vs actuals for the Labels department.
    """
    return await run_in_threadpool(_get_material_targets_cached, start_date, end_date)

@cached(cache=targets_cache)
def _get_material_targets_cached(start_date: str, end_date: str):
    return _fetch_data(MATERIAL_TARGETS_SQL, [start_date, end_date], date_cols=['TransDate'])

@router.get("/material-usage", response_model=List[MaterialUsageItem])
async def get_material_usage(start_date: str, end_date: str):
    """
    Tracks raw material usage (square meters) over a given period.
    """
    return await run_in_threadpool(_get_material_usage_cached, start_date, end_date)

@cached(cache=usage_cache)
def _get_material_usage_cached(start_date: str, end_date: str):
    return _fetch_data(MATERIAL_USAGE_SQL, [start_date, end_date], date_cols=['ProductionDate'])

@router.get("/waste-by-order", response_model=List[WasteByOrderItem])
async def get_waste_by_order(start_date: str, end_date: str):
    """
    Provides a breakdown of production and trim waste keyed by job order.
    """
    return await run_in_threadpool(_get_waste_by_order_cached, start_date, end_date)

@cached(cache=waste_cache)
def _get_waste_by_order_cached(start_date: str, end_date: str):
    return _fetch_data(WASTE_BY_ORDER_SQL, [start_date, end_date], date_cols=['ProductionDate'])

@router.get("/slitting-activity", response_model=List[SlittingActivityItem])
async def get_slitting_activity(start_date: str, end_date: str):
    """
    Monitors parent-to-child reel conversion activity in the slitting section.
    """
    return await run_in_threadpool(_get_slitting_activity_cached, start_date, end_date)

@cached(cache=slitting_activity_cache)
def _get_slitting_activity_cached(start_date: str, end_date: str):
    return _fetch_data(SLITTING_ACTIVITY_SQL, [start_date, end_date], date_cols=['SlitDate'])

def _fetch_data(sql: str, params: list, date_cols: Optional[List[str]] = None) -> List[dict]:
    """
    Generic internal helper to fetch SQL data into a list of dictionaries via Pandas.
    
    Args:
        sql: The SQL string to execute.
        params: List of parameters for the SQL query.
        date_cols: Optional list of columns to convert to strings.
        
    Returns:
        List of records.
    """
    conn = None
    try:
        conn = get_sql_conn(database=LABEL_DB)
        df = pd.read_sql(sql, conn, params=params)
        
        if date_cols and not df.empty:
            for col in date_cols:
                if col in df.columns:
                    df[col] = df[col].astype(str)
                    
        return df.replace({pd.NA: None, float('nan'): None}).to_dict(orient="records")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

