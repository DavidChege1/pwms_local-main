import datetime
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from backend.database.sql_server import get_sql_conn
from backend.schemas.estimator import EstimateRequest, EstimatorResponse, EstimatedDates

# Import existing PTS queries to reuse logic internally
from backend.departments.sleeves.pts.queries import (
    PTS_AVAILABLE_STOCK_SQL,
)
from backend.departments.sleeves.pts.router import _classify_material

router = APIRouter()

# =============================================================================
# MODULAR CONFIGURATION
# =============================================================================
class EstimatorConfig:
    # 5 weekdays @ 24hrs + 2 weekend days @ 12hrs = 144 hours/week = 20.57 hrs/day average
    AVERAGE_ACTIVE_HOURS_PER_DAY = 144.0 / 7.0

    # Fallback speeds if dynamic SQL fails
    DEFAULT_PRINT_SPEED_METERS_PER_HOUR = 3000.0
    DEFAULT_FORM_SPEED_KG_PER_HOUR = 80.0

    # Standard lead time added if materials are out of stock (Days)
    MATERIAL_PROCUREMENT_LEAD_TIME_DAYS = 14

    # Setup time taken per color (Hours)
    SETUP_TIME_PER_COLOR_HOURS = 15.0 / 60.0  # 15 minutes

    # Safety buffer applied to total estimated hours to prevent over-promising.
    # Matches the "Safety Buffer (e.g. 10%)" documented in planning_documentation.md §2.A.
    # Set to 1.0 to disable.
    SAFETY_BUFFER_FACTOR = 1.10

    # NOTE — Forming throughput is measured at FLEET level (all FORM% machines combined).
    # The queue is also measured at fleet level, so the two are internally consistent.
    # Implication: if only one forming line handles the requested material, the estimate
    # will be optimistic.  Revisit if per-machine routing data becomes available.
    FORMING_SPEED_IS_FLEET_LEVEL = True
# =============================================================================

def _get_dynamic_average_speed(is_plain: bool, req: EstimateRequest) -> dict:
    """
    Returns {'fleet_speed': float, 'machine_speed': float} in Meters/Hr.
    Calculates the 30-day average speed based on reliable Weight data, NOT spec parsing.
    """
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            # 617.14 hours per month per active line (144 hrs/week * 4.28 weeks)
            HOURS_PER_MONTH = (30.0 / 7.0) * 144.0

            if is_plain:
                # Plain sleeves go to Forming directly.
                query = """
                SELECT SUM(r.SleeveWeight) as TotalWeight
                FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
                WHERE r.MachineID LIKE 'FORM%'
                  AND r.DateStamp >= DATEADD(day, -30, GETDATE())
                  AND r.GoodSleeves > 0
                """
                cursor.execute(query)
                row = cursor.fetchone()
                total_weight = float(row[0] or 0.0)
                
                avg_fleet_kg_per_hr = total_weight / HOURS_PER_MONTH if HOURS_PER_MONTH > 0 else 0
                if avg_fleet_kg_per_hr <= 0:
                    avg_fleet_kg_per_hr = EstimatorConfig.DEFAULT_FORM_SPEED_KG_PER_HOUR * 13.0
                
                # Convert Kg/Hr to Meters/Hr
                if req.Width > 0 and req.Microns > 0:
                    fleet_speed = (avg_fleet_kg_per_hr * 1000 * 1000) / (req.Width * req.Microns * 0.91)
                else:
                    fleet_speed = EstimatorConfig.DEFAULT_PRINT_SPEED_METERS_PER_HOUR * 13.0
                    
                machine_speed = fleet_speed / 13.0 # Approx 13 active forming machines

            else:
                # Printed sleeves go to Printing
                machine_filter = "r.MachineID LIKE 'PR%'"
                num_machines = 4.0
                
                if req.NumColors > 6:
                    # Uflex only
                    machine_filter = "r.MachineID = 'PRINTING_1'"
                    num_machines = 1.0
                elif req.NumColors > 3:
                    # Exclude G1 (Assuming PRINTING_1 handles Uflex, Roto=3, G2=4)
                    machine_filter = "r.MachineID IN ('PRINTING_1', 'PRINTING_2', 'PRINTING_3', 'PRINTING_4')"
                    num_machines = 4.0
                
                query = f"""
                SELECT SUM(r.WeightIn)
                FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
                WHERE {machine_filter}
                  AND r.DateStamp >= DATEADD(day, -30, GETDATE())
                """
                cursor.execute(query)
                row = cursor.fetchone()
                total_weight = float(row[0] or 0.0)
                
                avg_fleet_kg_per_hr = total_weight / HOURS_PER_MONTH if HOURS_PER_MONTH > 0 else 0

                # Convert weight to meters
                if req.Width > 0 and req.Microns > 0:
                    fleet_speed = (avg_fleet_kg_per_hr * 1000 * 1000) / (req.Width * req.Microns * 0.91)
                else:
                    fleet_speed = EstimatorConfig.DEFAULT_PRINT_SPEED_METERS_PER_HOUR * num_machines

                # Failsafe
                if fleet_speed <= 0:
                    fleet_speed = EstimatorConfig.DEFAULT_PRINT_SPEED_METERS_PER_HOUR * num_machines

                machine_speed = fleet_speed / num_machines
                    
            return {'fleet_speed': fleet_speed, 'machine_speed': machine_speed}
        finally:
            cursor.close()

    except Exception as e:
        print(f"Warning: Failed to calculate dynamic speed, using default. Error: {str(e)}")
        return {'fleet_speed': EstimatorConfig.DEFAULT_PRINT_SPEED_METERS_PER_HOUR * 4, 'machine_speed': EstimatorConfig.DEFAULT_PRINT_SPEED_METERS_PER_HOUR}
    finally:
        if conn:
            conn.close()


# SQL to compute the open backlog queue in kilograms using per-piece weight from SPC_GEN.
# EstWeightKg = Remaining_Qnty × ObjectWeight (Kg/piece) — same formula as PTS_MATERIAL_NEEDS_SQL.
# We also pull Microns and PerfectWidth so the caller can convert Kg → linear meters
# using the standard density formula: M = (Kg × 1,000,000) / (Width_mm × Microns × 0.91)
_QUEUE_KG_SQL = """
SELECT
    ISNULL(g.NumColors, 0)                                      AS NumColors,
    ISNULL(g.Microns,   0)                                      AS Microns,
    ISNULL(g.PerfectWidth, ISNULL(g.TopWidth, 0))               AS Width,
    (o.Remaining_Qnty * ISNULL(g.ObjectWeight, 0))              AS EstWeightKg
FROM ELGON.dbo.EKL_OPEN_ORDERS o
LEFT JOIN PTK.dbo.SPC_GEN g
       ON o.ProductCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
WHERE o.Remaining_Qnty > 0
  AND o.Department = 'SLEEVES'
"""


def _get_current_queue_meters(is_plain: bool, req: EstimateRequest = None, fallback_width: float = 0.0, fallback_microns: float = 0.0) -> float:
    """
    Returns the current backlog queue in linear meters for either the plain (forming)
    or printed (printing) pipeline.

    Conversion path:
        OpenQty (pieces) × ObjectWeight (Kg/piece) = EstWeightKg
        EstWeightKg × 1,000,000 / (Width_mm × Microns × 0.91) = Linear Meters

    Per-row dimensions from SPC_GEN are used where available.  When a row has
    zero dimensions (no spec registered), fallback_width / fallback_microns from
    the active EstimateRequest are substituted so the estimate degrades gracefully
    rather than silently dropping those orders from the queue total.
    """
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(_QUEUE_KG_SQL)
            columns = [column[0] for column in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    except Exception as e:
        import traceback
        traceback.print_exc()
        return 0.0
    finally:
        if conn:
            conn.close()

    total_queue_meters = 0.0
    for row in rows:
        num_colors = int(row.get('NumColors') or 0)
        row_is_plain = (num_colors == 0)
        if row_is_plain != is_plain:
            continue

        est_kg = float(row.get('EstWeightKg') or 0.0)
        if est_kg <= 0:
            continue

        width = float(row.get('Width') or 0.0) or fallback_width
        microns = float(row.get('Microns') or 0.0) or fallback_microns

        if width > 0 and microns > 0:
            # Density formula: Kg = M × W(m) × Microns × 0.91 / 1000
            # Rearranged: M = Kg × 1,000,000 / (Width_mm × Microns × 0.91)
            row_meters = (est_kg * 1_000_000) / (width * microns * 0.91)
            
            # Intelligent Queue Slicing: Only include jobs that are valid for the eligible machines
            if req and not is_plain:
                if req.NumColors > 6:
                    # Job requires UFlex. Enforce that UFlex must clear its exclusive >6 jobs,
                    # plus a proportional share (e.g. 25%) of the <=6 jobs it balances.
                    if num_colors > 6:
                        total_queue_meters += row_meters
                    else:
                        total_queue_meters += (row_meters * 0.25)
                elif req.NumColors > 3:
                    # Cannot use G1. So we sum all queue items, but ignore jobs that explicitly map ONLY to G1 (none exist since G1 isn't exclusive).
                    total_queue_meters += row_meters
                else:
                    total_queue_meters += row_meters
            else:
                total_queue_meters += row_meters
        # If still no valid dimensions, the row is silently skipped (conservative —
        # better to under-count than invent meters from thin air).

    return total_queue_meters


def _check_material_availability(req: EstimateRequest) -> float:
    if req.Microns <= 0 or req.Width <= 0:
        return 0.0

    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            cursor.execute(PTS_AVAILABLE_STOCK_SQL)
            columns = [column[0] for column in cursor.description]
            stock_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        finally:
            cursor.close()
    except Exception as e:
        print(f"Warning: Failed to check materials: {str(e)}")
        return 0.0
    finally:
        if conn:
            conn.close()

    try:
        matching_rows = [
            s for s in stock_rows 
            if float(s["Micron"] or 0) == req.Microns 
            and abs(float(s["Width"] or 0) - req.Width) <= 2.0
            and _classify_material(s.get("ItemDescription", "")) == req.Category
        ]

        if not matching_rows:
            # The combo of Category + Dimension does not exist in the ledger at all
            raise ValueError(f"Material Error: {req.Category} at {req.Microns}μm / {req.Width}mm does not exist in the warehouse catalog. Please verify your selection.")

        available_kg = sum(float(s["Weight"] or 0) for s in matching_rows)
        return available_kg
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as e:
        print(f"Warning: Failed to process stock rows: {str(e)}")
        return 0.0


def _fetch_human_context(product_code: str) -> dict:
    """
    Fetches priority and planner comments from EKL_ORUN and EKL_ORDR
    based on the latest active backorder for the Given Product Code.
    """
    if not product_code:
        return {"PriorityIndex": None, "ProductionComments": None, "LineNote": None}

    conn = None
    row = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            # We look for the most recently created active order for this item
            query = """
            SELECT TOP 1
                r.PriorityIndex,
                r.ProductionComments,
                ord.boLineText
            FROM ELGON.dbo.EKL_OPEN_ORDERS o
            LEFT JOIN ELGON.dbo.EKL_ORUN r ON o.DocNum = r.BackOrderRef
            LEFT JOIN ELGON.dbo.EKL_ORDR ord ON o.DocNum = ord.boDocEntry
            WHERE o.ItemCode = ?
            ORDER BY o.DocDate DESC
            """
            cursor.execute(query, product_code)
            row = cursor.fetchone()
        finally:
            cursor.close()
    except Exception as e:
        print(f"Warning: Human context fetch failed: {str(e)}")
    finally:
        if conn:
            conn.close()

    if row:
        return {
            "PriorityIndex": row[0],
            "ProductionComments": row[1],
            "LineNote": row[2]
        }
    
    return {"PriorityIndex": None, "ProductionComments": None, "LineNote": None}


@router.post("/estimate", response_model=EstimatorResponse)
async def calculate_estimate(request: EstimateRequest):
    return await run_in_threadpool(_calculate_estimate, request)


def _calculate_estimate(req: EstimateRequest) -> dict:
    if req.NumColors > 10:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot estimate: Machine capacity exceeded. Maximum allowed is 10 colors (Uflex). Requested: {req.NumColors} colors."
        )

    is_plain = (req.NumColors == 0)

    # --- FORMING PHASE (Final phase for ALL sleeves) ---
    form_speeds = _get_dynamic_average_speed(True, req)
    form_fleet_speed = form_speeds['fleet_speed']
    form_machine_speed = form_speeds['machine_speed']

    # Pass job dimensions so rows without registered specs fall back to current job values
    form_queue_meters = _get_current_queue_meters(True, req, fallback_width=req.Width, fallback_microns=req.Microns)
    
    # 1. Math Fix: Queues are worked collectively by the eligible fleet.
    form_queue_time = form_queue_meters / form_fleet_speed if form_fleet_speed > 0 else 0
    # 2. Math Fix: A specific roll runs on ONE given machine.
    form_prod_time = req.JobMeters / form_machine_speed if form_machine_speed > 0 else 0

    if is_plain:
        # Plain jobs only go through forming
        raw_total_hours = form_queue_time + form_prod_time
        setup_time_hours = 0.0

        display_queue_meters = form_queue_meters
        display_avg_speed = form_machine_speed
        display_prod_time = form_prod_time
    else:
        # Printed jobs go through printing FIRST, then forming.
        # Calculate the "Buffered Target" to estimate true production time per efficiency logic.
        mr_meters = 50.0 if req.NumColors <= 1 else 200.0 * req.NumColors
        waste_multiplier = 1.0 + (req.NumColors * 0.02)
        true_print_target_meters = (req.JobMeters * waste_multiplier) + mr_meters

        print_speeds = _get_dynamic_average_speed(False, req)
        print_fleet_speed = print_speeds['fleet_speed']
        print_machine_speed = print_speeds['machine_speed']

        print_queue_meters = _get_current_queue_meters(False, req, fallback_width=req.Width, fallback_microns=req.Microns)
        
        print_queue_time = print_queue_meters / print_fleet_speed if print_fleet_speed > 0 else 0
        print_prod_time = true_print_target_meters / print_machine_speed if print_machine_speed > 0 else 0

        setup_time_hours = req.NumColors * EstimatorConfig.SETUP_TIME_PER_COLOR_HOURS

        raw_total_hours = print_queue_time + setup_time_hours + print_prod_time + form_queue_time + form_prod_time

        # Aggregate metrics for the UI result card
        display_queue_meters = print_queue_meters + form_queue_meters
        display_avg_speed = true_print_target_meters / ((print_prod_time + form_prod_time) or 1)
        display_prod_time = print_prod_time + form_prod_time

    # Apply safety buffer to avoid over-promising (per planning_documentation.md §2.A).
    # The buffer inflates the total estimate by SAFETY_BUFFER_FACTOR (default 10%).
    total_hours = raw_total_hours * EstimatorConfig.SAFETY_BUFFER_FACTOR

    # Convert absolute hours to working days using the normalized calendar
    days_to_produce = total_hours / EstimatorConfig.AVERAGE_ACTIVE_HOURS_PER_DAY
    
    # Dates
    now = datetime.datetime.now()
    base_ship_date = now + datetime.timedelta(days=days_to_produce)
    
    # Material Verification
    available_kg = _check_material_availability(req)
    required_kg = (req.JobMeters * (req.Width / 1000.0) * req.Microns * 0.91) / 1000.0
    
    material_status = "In Stock"
    material_adjusted_date = None
    
    if available_kg < required_kg:
        material_status = "Awaiting Delivery (Procurement Required)"
        adjusted_date = base_ship_date + datetime.timedelta(days=EstimatorConfig.MATERIAL_PROCUREMENT_LEAD_TIME_DAYS)
        material_adjusted_date = adjusted_date.strftime("%Y-%m-%d")

    # Fetch Human Context (Priority, Comments, Notes)
    human_context = _fetch_human_context(req.ProductCode)

    return {
        "EstimatedTimeHours": round(total_hours, 1),
        "SetupTimeHours": round(setup_time_hours, 1),
        "ProductionTimeHours": round(display_prod_time, 1),
        "CurrentQueueMeters": round(display_queue_meters, 0),
        "AverageSpeedMetersPerHour": round(display_avg_speed, 1),
        "MaterialAvailableKg": round(available_kg, 1),
        "MaterialRequiredKg": round(required_kg, 1),
        "MaterialStatus": material_status,
        "EstimatedDates": {
            "BaseShipDate": base_ship_date.strftime("%Y-%m-%d"),
            "MaterialAdjustedShipDate": material_adjusted_date
        },
        **human_context
    }
