# backend/departments/sleeves/pts/router.py
# =============================================================================
# PTS BACK ORDER INTELLIGENCE — FASTAPI ROUTER
# =============================================================================
# Mounts under: /api/sleeves/pts  (registered in backend/main.py)
#
# Endpoints:
#   GET /backorder-age        → Dashboard 1: flat list of all open order lines
#                               with age, customer, product, and spec data.
#   GET /material-needs       → Dashboard 2: grouped by Micron×Width with
#                               per-spec totals and drill-down item lists.
#   GET /production-coverage  → Dashboard 3: back orders linked to any open
#                               production orders; includes colour burden score.
#
# Plain/Printed classification logic (shared across all endpoints):
#   PLAIN_METHOD_IDS = {0, 12, 14, 16}
#   IsPlain = (ProductionMethod in PLAIN_METHOD_IDS) AND (NumColors == 0)
#
# Color Burden thresholds (Dashboard 3):
#   AMBER: HighColorPct >= 30 %
#   RED  : HighColorPct >= 50 %
# =============================================================================

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from typing import List
import json
import os

from backend.database.sql_server import get_sql_conn
from backend.departments.sleeves.pts.queries import (
    PTS_BACKORDER_AGE_SQL,
    PTS_MATERIAL_NEEDS_SQL,
    PTS_PRODUCTION_COVERAGE_SQL,
    PTS_AVAILABLE_STOCK_SQL,
)
from backend.database.local_db import get_daily_queue, save_daily_queue
from backend.schemas.pts import (
    BackOrderItem,
    MaterialGroup,
    MaterialDetailItem,
    CoverageItem,
    CoverageSummary,
    DailyPlan,
)
from cachetools import cached, TTLCache

# Cache configurations
backorder_age_cache = TTLCache(maxsize=1, ttl=30)
material_needs_cache = TTLCache(maxsize=1, ttl=30)
production_coverage_cache = TTLCache(maxsize=1, ttl=30)

router = APIRouter()

# Production methods that produce a plain (unprinted) sleeve/roll/sheet.
# Source: legacy C# ProductionMethodEnum.
PLAIN_METHOD_IDS = {0, 12, 14, 16}

# High-colour threshold — jobs at or above this colour count drive the burden alert.
HIGH_COLOR_THRESHOLD = 5
BURDEN_AMBER_PCT = 30.0
BURDEN_RED_PCT   = 50.0

PLAN_FILE = os.path.join("backend", "data", "daily_plan.json")


# ─────────────────────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _is_plain(production_method: int, num_colors: int) -> bool:
    """
    Returns True when the job is wholly unprinted.
    """
    return production_method in PLAIN_METHOD_IDS and num_colors == 0


def _classify_material(desc: str) -> str:
    """
    Categorizes the material based on keywords in the product description.
    Matches the categories provided in the user's reference image.
    """
    d = (desc or "").upper()
    
    # Kraft Paper
    if "KRAFT" in d or "PAPER" in d or "GSM" in d:
        return "Kraft Paper"
    
    # CPP
    if "CPP" in d:
        return "CPP Material"
    
    # Heat Sealable
    if "SEALABLE" in d:
        return "Heat Sealable"
    
    # Recycled BOPP variants
    if "70%" in d and ("RECY" in d or "%R" in d):
        return "70% Recycled Bopp"
    if "30%" in d and ("RECY" in d or "%R" in d):
        return "30% Recycled Bopp"
    
    # Default to Normal BOPP
    return "Normal BOPP"


def _run_query(sql: str, params=None) -> list[dict]:
    """Execute a SQL query and return results as a list of dicts."""
    conn = None
    try:
        conn = get_sql_conn()
        cursor = conn.cursor()
        try:
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            columns = [col[0] for col in cursor.description]
            rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return rows
        finally:
            cursor.close()
    finally:
        if conn:
            conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1 — Back Order Age
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/backorder-age", response_model=List[BackOrderItem])
async def get_backorder_age():
    """
    Returns all open SLEEVES back order lines with age-in-days calculated from
    the original booking date (DocDate).

    Frontend responsibilities:
      - Group by ProductCode for the 'By Item' slicer.
      - Group by CUSTOMER for the 'By Customer' slicer.
      - Filter by IsPlain for the 'Printed / Plain' slicer.
      - Filter by ProductCode/ProductDescription for the 'Single Item' slicer.
    """
    return await run_in_threadpool(_get_backorder_age)


@cached(cache=backorder_age_cache)
def _get_backorder_age() -> List[dict]:
    try:
        rows = _run_query(PTS_BACKORDER_AGE_SQL)
        result = []
        for r in rows:
            # Convert datetime to string for Pydantic
            if r.get("DocDate") and hasattr(r["DocDate"], "isoformat"):
                r["DocDate"] = r["DocDate"].strftime("%Y-%m-%d")

            r["IsPlain"] = _is_plain(
                int(r.get("ProductionMethod") or 0),
                int(r.get("NumColors") or 0),
            )
            result.append(r)
        return result
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2 — Material Requirements
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/material-needs", response_model=List[MaterialGroup])
async def get_material_needs():
    """
    Groups all open back order lines by their BOPP material specification
    (Microns × average Width) and returns rolled-up totals per group.

    Each group includes a drill-down 'Items' list of all specific products
    that consume that material, with their individual open quantities and
    estimated weights.

    Weight estimate: Remaining_Qnty × ObjectWeight(kg) = Total Kg
    Width          : average of (TopWidth + BottomWidth) ÷ 2 per item,
                     then averaged across all items in the group.
    """
    return await run_in_threadpool(_get_material_needs)


@cached(cache=material_needs_cache)
def _get_material_needs() -> List[dict]:
    """
    Groups open orders by material spec and matches against warehouse stock.
    Optimized with dictionary lookups to avoid O(N*M) performance issues.
    """
    try:
        rows = _run_query(PTS_MATERIAL_NEEDS_SQL)
        stock_rows = _run_query(PTS_AVAILABLE_STOCK_SQL)

        # 1. Pre-process and categorize warehouse stock
        # We assign a unique StockID to each row to allow the frontend to 
        # accurately sum "Total in Warehouse" without double-counting overlaps.
        categorized_stock = []
        stock_by_spec: dict[tuple, list] = {}

        for idx, s in enumerate(stock_rows):
            s["StockID"] = f"stock_{idx}"
            cat = _classify_material(s.get("ItemDescription", ""))
            micron = float(s.get("Micron") or 0)
            s["Category"] = cat
            s["Micron"] = micron
            s["Width"] = float(s.get("Width") or 0)
            s["Weight"] = float(s.get("Weight") or 0)
            
            categorized_stock.append(s)
            
            # Index by (Cat, Micron) for fast lookup in the requirements loop
            spec_key = (cat, micron)
            if spec_key not in stock_by_spec:
                stock_by_spec[spec_key] = []
            stock_by_spec[spec_key].append(s)

        # 2. Group Requirement Rows by (Category, PerfectMicron, PerfectWidth)
        groups: dict[tuple, dict] = {}
        for r in rows:
            microns   = float(r.get("Microns") or 0)
            top_w     = float(r.get("TopWidth") or 0)
            bot_w     = float(r.get("BottomWidth") or 0)
            avg_width = (top_w + bot_w) / 2.0 if (top_w + bot_w) > 0 else top_w or bot_w

            perf_micron = float(r.get("PerfectMicron") or 0)
            perf_width  = float(r.get("PerfectWidth") or 0)
            
            category = _classify_material(r.get("ProductDescription", ""))
            key = (category, perf_micron, perf_width)

            if key not in groups:
                groups[key] = {
                    "Category":         category,
                    "Microns":          perf_micron,
                    "PerfectMicron":    perf_micron,
                    "AvgWidth":         0.0,
                    "PerfectWidth":     perf_width,
                    "_width_sum":       0.0,
                    "_width_count":     0,
                    "TotalOpenQty":     0.0,
                    "TotalEstWeightKg": 0.0,
                    "AvailableKg":      0.0,
                    "OrderLines":       0,
                    "Items":            [],
                    "MatchedStockIDs":  [], # Track IDs to prevent double-counting in frontend
                }

            groups[key]["TotalOpenQty"]     += float(r.get("Remaining_Qnty") or 0)
            groups[key]["TotalEstWeightKg"] += float(r.get("EstWeightKg") or 0)
            groups[key]["OrderLines"]       += 1
            groups[key]["_width_sum"]       += avg_width
            groups[key]["_width_count"]     += 1
            groups[key]["Items"].append({
                "DocNum":           int(r["DocNum"]),
                "CUSTOMER":         r.get("CUSTOMER"),
                "ProductCode":      r.get("ProductCode"),
                "ProductDescription": r.get("ProductDescription"),
                "Remaining_Qnty":   float(r.get("Remaining_Qnty") or 0),
                "EstWeightKg":      float(r.get("EstWeightKg") or 0),
                "ProdOrderNum":     r.get("ProdOrderNum")
            })

        # 3. Match Stock to Requirement Groups
        matched_stock_indices = set()
        for key, g in groups.items():
            perf_micron = g["PerfectMicron"]
            perf_width  = g["PerfectWidth"]
            perf_cat    = g["Category"]
            
            # Use the pre-indexed stock for O(1) micron lookup
            candidate_stock = stock_by_spec.get((perf_cat, perf_micron), [])
            
            group_stock = []
            for s in candidate_stock:
                # 2mm width tolerance matching
                if abs(s["Width"] - perf_width) <= 2.0:
                    group_stock.append(s)
                    # Mark this specific stock item as "Matched" (referenced in logic)
                    idx = int(s["StockID"].split('_')[1])
                    matched_stock_indices.add(idx)
            
            g["AvailableKg"] = sum(s["Weight"] for s in group_stock)
            # Include both ID and Weight for accurate KPI summing in frontend
            g["MatchedStock"] = [{"id": s["StockID"], "weight": s["Weight"]} for s in group_stock]
            
            breakdown = {}
            for s in group_stock:
                desc = s.get("ItemDescription") or "Unknown"
                breakdown[desc] = breakdown.get(desc, 0) + s["Weight"]
            g["StockBreakdown"] = breakdown

        # 4. Add unmatched stock as "Idle Inventory" groups
        for idx, s in enumerate(categorized_stock):
            if idx in matched_stock_indices:
                continue
            
            cat = s["Category"]
            micron = s["Micron"]
            width = s["Width"]
            # Unique key for idle stock to prevent React key collisions
            key = (cat, micron, width, "IDLE") 

            if key not in groups:
                groups[key] = {
                    "Category":         cat,
                    "Microns":          micron,
                    "PerfectMicron":    micron,
                    "AvgWidth":         width,
                    "PerfectWidth":     width,
                    "TotalOpenQty":     0.0,
                    "TotalEstWeightKg": 0.0,
                    "AvailableKg":      0.0,
                    "OrderLines":       0,
                    "Items":            [],
                    "StockBreakdown":   {},
                    "MatchedStock":     [{"id": s["StockID"], "weight": s["Weight"]}],
                    "is_idle":         True
                }
            
            groups[key]["AvailableKg"] += s["Weight"]
            desc = s.get("ItemDescription") or "Unknown"
            groups[key]["StockBreakdown"][desc] = groups[key]["StockBreakdown"].get(desc, 0) + s["Weight"]

        # 5. Final Processing and Sorting
        result = []
        # Sort: Requirements first (by weight desc), then Idle Stock (by available weight desc)
        sorted_groups = sorted(
            groups.values(), 
            key=lambda x: (x.get("is_idle", False), -x["TotalEstWeightKg"], -x["AvailableKg"])
        )

        for g in sorted_groups:
            if "_width_sum" in g:
                avg_w = g["_width_sum"] / g["_width_count"] if g["_width_count"] > 0 else 0.0
                g["AvgWidth"] = round(avg_w, 1)
                del g["_width_sum"], g["_width_count"]
            
            g["TotalOpenQty"]     = round(g["TotalOpenQty"], 0)
            g["TotalEstWeightKg"] = round(g["TotalEstWeightKg"], 1)
            g["AvailableKg"]      = round(g["AvailableKg"], 1)
            result.append(g)

        print(f"DEBUG: Found {len(result)} groups")
        if result:
            print(f"DEBUG Sample MatchedStock: {result[0].get('MatchedStock')}")

        return result
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 3 — Production Coverage
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/production-coverage", response_model=CoverageSummary)
async def get_production_coverage():
    """
    Matches open back order lines against currently open production orders
    (DKL.dbo.OWOR where Status='R') via ProductCode = ItemCode.

    Returns:
      - Full item list with coverage status (IsCovered flag).
      - Aggregate summary fields including the colour burden score.

    Colour Burden:
      HighColorLines = lines where NumColors >= 5
      BurdenPct      = (HighColorLines / TotalOpenLines) × 100
      BurdenLevel    = "OK" | "AMBER" (≥30%) | "RED" (≥50%)
    """
    return await run_in_threadpool(_get_production_coverage)


@cached(cache=production_coverage_cache)
def _get_production_coverage() -> dict:
    try:
        rows = _run_query(PTS_PRODUCTION_COVERAGE_SQL)

        items = []
        for r in rows:
            prod_order = r.get("ProdOrderNum")
            num_colors = int(r.get("NumColors") or 0)
            prod_method = int(r.get("ProductionMethod") or 0)
            
            # Convert datetime to string for Pydantic
            doc_date = r.get("DocDate")
            if doc_date and hasattr(doc_date, "isoformat"):
                doc_date = doc_date.strftime("%Y-%m-%d")

            items.append({
                "SalesOrderNum":    int(r["SalesOrderNum"]),
                "LpoNo":            r.get("LpoNo"),
                "CUSTOMER":         r.get("CUSTOMER"),
                "CUSTOMERID":       r.get("CUSTOMERID"),
                "ProductCode":      r.get("ProductCode"),
                "ProductDescription": r.get("ProductDescription"),
                "Order_Qty":        float(r.get("Order_Qty") or 0),
                "Delivered_Qnty":   float(r.get("Delivered_Qnty") or 0),
                "OpenQty":          float(r.get("OpenQty") or 0),
                "DocDate":          doc_date,
                "AgeDays":          int(r.get("AgeDays") or 0),
                "NumColors":        num_colors,
                "ProductionMethod": prod_method,
                "IsPlain":          _is_plain(prod_method, num_colors),
                "ProdOrderNum":     int(prod_order) if prod_order else None,
                "PlannedQty":       float(r.get("PlannedQty") or 0),
                "ProducedQty":      float(r.get("ProducedQty") or 0),
                "ProdStatus":       r.get("ProdStatus"),
                "IsCovered":        prod_order is not None,
            })

        total       = len(items)
        covered     = sum(1 for i in items if i["IsCovered"])
        high_color  = sum(1 for i in items if i["NumColors"] >= HIGH_COLOR_THRESHOLD)
        burden_pct  = round((high_color / total * 100), 1) if total > 0 else 0.0

        if burden_pct >= BURDEN_RED_PCT:
            burden_level = "RED"
        elif burden_pct >= BURDEN_AMBER_PCT:
            burden_level = "AMBER"
        else:
            burden_level = "OK"

        return {
            "TotalOpenLines":  total,
            "CoveredLines":    covered,
            "UncoveredLines":  total - covered,
            "HighColorLines":  high_color,
            "ColorBurdenPct":  burden_pct,
            "BurdenLevel":     burden_level,
            "Items":           items,
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 4 — Daily Planning Persistence
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/daily-plan", response_model=DailyPlan)
async def get_daily_plan():
    """
    Retrieves the current daily assignments from the local SQLite store.
    """
    try:
        queue = await run_in_threadpool(get_daily_queue)
        return {"queue": queue}
    except Exception as e:
        print(f"Error getting daily plan: {e}")
        return {"queue": []}

@router.post("/daily-plan")
async def save_daily_plan(plan: DailyPlan):
    """
    Saves the entire machine assignment schedule to the local SQLite store.
    """
    try:
        # Convert Pydantic model to list of dicts for the DB helper
        jobs = [j.dict() for j in plan.queue]
        await run_in_threadpool(save_daily_queue, jobs)
        return {"status": "success"}
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
