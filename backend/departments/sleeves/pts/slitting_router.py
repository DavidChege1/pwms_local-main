from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import date
from backend.database.sql_server import get_sql_conn
from backend.departments.sleeves.pts.slitting_queries import (
    build_slitting_type_a_sql,
    build_slitting_type_b_sql,
    build_slitting_history_sql,
    build_order_volumes_history_sql
)
from backend.schemas.slitting import (
    SlittingTypeAItem,
    SlittingTypeBItem,
    SlittingHistoryItem,
    SlittingDashboardResponse
)

router = APIRouter()

@router.get("/summary", response_model=SlittingDashboardResponse)
async def get_slitting_summary(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    micron: Optional[str] = Query(None, description="Micron filter"),
    width: Optional[str] = Query(None, description="Width filter"),
    min_weight: Optional[str] = Query(None, description="Minimum weight issued"),
    max_weight: Optional[str] = Query(None, description="Maximum weight issued"),
    job_header: Optional[str] = Query(None, description="Job Header search"),
    is_off_spec: Optional[bool] = Query(False, description="Filter only off-spec records (Type B)")
):
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            filters = {
                "start_date": start_date,
                "end_date": end_date,
                "micron": micron,
                "width": width,
                "min_weight": min_weight,
                "max_weight": max_weight,
                "job_header": job_header,
                "is_off_spec": is_off_spec
            }
            
            # 1. Fetch Type A
            type_a_sql, type_a_params = build_slitting_type_a_sql(filters)
            cursor.execute(type_a_sql, type_a_params)
            type_a_rows = cursor.fetchall()
            type_a_data = []
            for row in type_a_rows:
                type_a_data.append(SlittingTypeAItem(
                    SysID=row[0],
                    JobHeader=str(row[1]),
                    TransactionDate=row[2].date() if hasattr(row[2], 'date') else row[2],
                    Micron=float(row[3] or 0),
                    InputWidth=float(row[4] or 0),
                    WeightIssued=float(row[5] or 0),
                    TotalOutputWidth=float(row[6] or 0),
                    TotalWeightReceived=float(row[7] or 0)
                ))
                
            # 2. Fetch Type B
            type_b_sql, type_b_params = build_slitting_type_b_sql(filters)
            cursor.execute(type_b_sql, type_b_params)
            type_b_rows = cursor.fetchall()
            type_b_data = []
            for row in type_b_rows:
                input_w = float(row[4] or 0)
                weight = float(row[5] or 0)
                req_w = float(row[6] or 0)
                output_w = float(row[7] or 0)
                
                # Waste Calculation
                slit_width = max(0.0, input_w - output_w)
                waste_weight = 0.0
                if input_w > 0:
                    waste_weight = weight * (slit_width / input_w)
                
                job_is_off_spec = input_w > req_w if req_w > 0 else False
                
                # Apply off-spec toggle filter
                if is_off_spec and not job_is_off_spec:
                    continue
                
                type_b_data.append(SlittingTypeBItem(
                    SysID=row[0],
                    JobHeader=str(row[1]),
                    TransactionDate=row[2].date() if hasattr(row[2], 'date') else row[2],
                    Micron=float(row[3] or 0),
                    InputWidth=input_w,
                    WeightIssued=weight,
                    RequiredWidth=req_w,
                    TotalOutputWidth=output_w,
                    TotalWeightReceived=float(row[8] or 0),
                    WasteWeight=round(waste_weight, 2),
                    IsOffSpec=job_is_off_spec
                ))
                
            # 3. Fetch History (Slitting)
            hist_sql, hist_params = build_slitting_history_sql(filters)
            cursor.execute(hist_sql, hist_params)
            hist_rows = cursor.fetchall()
            hist_map = {}
            for row in hist_rows:
                key = (row[0], row[1]) # (Year, Month)
                hist_map[key] = {
                    "Year": row[0],
                    "Month": row[1],
                    "JobCount": row[2],
                    "TypeA_Count": row[3],
                    "TypeB_Count": row[4],
                    "TotalWeight": float(row[5] or 0),
                    "TypeA_Weight": float(row[6] or 0),
                    "TypeB_Weight": float(row[7] or 0),
                    "OrderVolume": 0.0
                }
                
            # 4. Fetch Order Volumes
            ord_sql, ord_params = build_order_volumes_history_sql(filters)
            cursor.execute(ord_sql, ord_params)
            ord_rows = cursor.fetchall()
            for row in ord_rows:
                key = (row[0], row[1])
                if key in hist_map:
                    hist_map[key]["OrderVolume"] = float(row[2] or 0)
                else:
                    # Still include months with orders but no slitting
                    hist_map[key] = {
                        "Year": row[0],
                        "Month": row[1],
                        "JobCount": 0,
                        "TypeA_Count": 0,
                        "TypeB_Count": 0,
                        "TotalWeight": 0.0,
                        "TypeA_Weight": 0.0,
                        "TypeB_Weight": 0.0,
                        "OrderVolume": float(row[2] or 0)
                    }
            
            history_data = [SlittingHistoryItem(**val) for val in hist_map.values()]
            # Sort history chronologically
            history_data.sort(key=lambda x: (x.Year, x.Month), reverse=True)
        finally:
            cursor.close()
        
        return SlittingDashboardResponse(
            TypeA=type_a_data,
            TypeB=type_b_data,
            History=history_data
        )
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
