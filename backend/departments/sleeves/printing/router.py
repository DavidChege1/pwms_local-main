from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.database.sql_server import get_sql_conn
from backend.departments.sleeves.printing.queries import BOPP_MONITOR_SQL, PRINTING_BENCHMARK_SQL, PRINTING_EFFICIENCY_SQL
from backend.departments.sleeves.printing.utils import calculate_planned_meters
from backend.schemas.printing import BoppMonitorItem, EfficiencySummary, EfficiencyDetailedItem
from cachetools import cached, TTLCache

# Cache configurations
efficiency_cache = TTLCache(maxsize=50, ttl=30) # 30 seconds (micro-cache)
benchmark_cache = TTLCache(maxsize=10, ttl=3600) # 1 hour
bopp_cache = TTLCache(maxsize=50, ttl=30) # 30 seconds (micro-cache)

router = APIRouter()

@router.get("/bopp-monitor", response_model=List[BoppMonitorItem])
async def get_bopp_monitor(start_date: str, end_date: str):
    """
    Monitors BOPP weight and run meters for the Printing department.
    """
    return await run_in_threadpool(_get_bopp_monitor, start_date, end_date)

@router.get("/efficiency", response_model=EfficiencySummary)
async def get_efficiency(start_date: str, end_date: str):
    """
    Calculates Print Machine efficiency comparing Planned vs Actual meters.
    Includes complexity metrics (colors) and change-over stats.
    """
    return await run_in_threadpool(_get_efficiency, start_date, end_date)

@router.get("/benchmarks")
async def get_benchmarks():
    """
    Returns the 6-month historical waste benchmarks for printing machines.
    """
    return await run_in_threadpool(_get_benchmarks)

@cached(cache=benchmark_cache)
def _get_benchmarks():
    conn = None
    try:
        conn = get_sql_conn()
        import pandas as pd
        df = pd.read_sql(PRINTING_BENCHMARK_SQL, conn)
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@cached(cache=efficiency_cache)
def _get_efficiency(start_date: str, end_date: str) -> dict:
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            # Params: (reel_start, reel_end, order_start, order_end)
            cursor.execute(PRINTING_EFFICIENCY_SQL, (start_date, end_date, start_date, end_date))
            columns = [column[0] for column in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

    # Group reels by ProductionOrder, deduplicating by ReelIndex globally
    order_map = {}
    global_seen_reels = set()  # Global tracker — no reel counted twice across any order
    for row in results:
        po = row['ProductionOrder']
        if po not in order_map:
            order_map[po] = {
                'info': row,
                'actual_meters': 0.0,
                'actual_weight': 0.0,
                'machine_id': 'PRINTING_3' if row.get('MachineID') == 'PRINTING-G4' else row.get('MachineID'),
            }
        elif not order_map[po]['machine_id'] and row.get('MachineID'):
            # Update machine_id if the first row processed was missing it (e.g., due to an empty header join)
            order_map[po]['machine_id'] = 'PRINTING_3' if row.get('MachineID') == 'PRINTING-G4' else row.get('MachineID')
        
        # Only count each reel once across the ENTIRE dataset
        reel_id = row.get('ReelIndex')
        if reel_id and reel_id not in global_seen_reels:
            global_seen_reels.add(reel_id)
            
            # Aggregate Weight
            order_map[po]['actual_weight'] += float(row.get('ReelWeight') or 0.0)
            
            # Aggregate Meters (Parse Spec: "35*960*3500" -> 3500)
            raw_spec = row.get('RawSpec', '')
            if raw_spec:
                parts = str(raw_spec).split('*')
                if parts:
                    try:
                        order_map[po]['actual_meters'] += float(parts[-1].strip())
                    except:
                        pass



    detailed_items = []
    total_planned = 0.0
    total_actual = 0.0
    unique_orders_with_actuals = set()

    for po, data in order_map.items():
        row = data['info']
        actual_m = data['actual_meters']
        actual_w = data['actual_weight']
        
        # Apply Legacy Logic for Planned Meters
        planned_m = calculate_planned_meters(row)
        
        # Change-over tracking (Jobs with recorded production)
        if actual_m > 0:
            unique_orders_with_actuals.add(po)

        # Variance Calculation
        variance = actual_m - planned_m
        variance_pct = (variance / planned_m * 100) if planned_m > 0 else 0
        
        # Setup Time Estimate (15 mins per color)
        colors = int(row.get('NumColors') or 0)
        est_setup = colors * 15

        # Identify "Ghost" plain jobs (Missing color data)
        prod_method = int(row.get('ProductionMethod') or 0)
        # Method 1 = Plain, anything else (like 13 RVR or 11 Surface) is Printed
        is_plain = True if prod_method == 1 else False

        item = EfficiencyDetailedItem(
            ProductionOrder=str(po),
            ItemCode=row['ItemCode'],
            ProductDescription=row.get('ProductDescription'),
            ProductionMethod=prod_method,
            NumColors=colors,
            OrderDate=row['OrderDate'],
            PlannedQty=float(row.get('PlannedQty') or 0.0),
            PlannedMeters=round(planned_m, 1),
            ActualRunMeters=round(actual_m, 1),
            ActualWeight=round(actual_w, 1),
            MachineID=data['machine_id'],
            VarianceMeters=round(variance, 1),
            VariancePercent=round(variance_pct, 1),
            EstSetupTimeMins=est_setup,
            IsPlain=is_plain
        )
        detailed_items.append(item)
        
        total_planned += planned_m
        total_actual += actual_m

    # Aggregated Summary
    summary = {
        "TotalPlannedMeters": round(total_planned, 1),
        "TotalActualMeters": round(total_actual, 1),
        "TotalChangeovers": len(unique_orders_with_actuals),
        "AvgMetersPerJob": round(total_actual / len(unique_orders_with_actuals), 1) if unique_orders_with_actuals else 0.0,
        "Details": detailed_items
    }
    
    return summary





@cached(cache=bopp_cache)
def _get_bopp_monitor(start_date: str, end_date: str) -> List[dict]:
    """
    Internal logic to fetch and process BOPP monitoring data.
    Merges with actual recorded waste from RECYCLER_WASTE.
    """
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            # 1. Fetch Production
            cursor.execute(BOPP_MONITOR_SQL, (start_date, end_date))
            prod_columns = [column[0] for column in cursor.description]
            prod_results = [dict(zip(prod_columns, row)) for row in cursor.fetchall()]
            
            # 2. Fetch Waste
            from backend.departments.sleeves.forming.queries import WASTE_SQL
            cursor.execute(WASTE_SQL, (start_date, end_date))
            waste_columns = [column[0] for column in cursor.description]
            waste_results = [dict(zip(waste_columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

    # Machine Name Mapping (Waste Table Name -> Production Table ID)
    PRINTING_MAPPING = {
        'U FLEX': 'PRINTING_1',
        'G1': 'PRINTING_2',
        'G2': 'PRINTING_3',
        'ROTO FLEX': 'PRINTING_4',
        'ECO FLEX': 'ECO_FLEX'
    }

    # Index waste by (Date, MachineID)
    waste_map = {}
    for w in waste_results:
        # Map waste name to production ID if exists
        machine = w['MACHINE']
        mapped_machine = PRINTING_MAPPING.get(machine, machine)
        key = (str(w['PROD_DATE']), mapped_machine)
        waste_map[key] = waste_map.get(key, 0) + (w['daily_waste'] or 0)

    # Process Production Records
    final_results = []
    for row in prod_results:
        # Normalize MachineID (Consolidate G4 into G2)
        if row.get('MachineID') == 'PRINTING-G4':
            row['MachineID'] = 'PRINTING_3'
        
        # Safe float conversion for weight
        weight = row.get('BoppWeight')
        row['BoppWeight'] = float(weight) if weight is not None else 0.0
        
        # Parse Meters from SPEC (e.g. "35*960*3500" -> 3500)
        spec = row.get('Spec', '')
        meters = 0.0
        if spec:
            parts = spec.split('*')
            if parts:
                try:
                    meters = float(parts[-1].strip())
                except ValueError:
                    pass
        row['RunMeters'] = meters
        
        # Merge Waste
        date_str = str(row['TransactionDate'])
        row['daily_waste'] = waste_map.get((date_str, row['MachineID']), 0)

        # Remove raw Spec to save bandwidth
        if 'Spec' in row:
            del row['Spec']
            
        final_results.append(row)
        
    return final_results



