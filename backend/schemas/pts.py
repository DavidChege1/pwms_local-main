# backend/schemas/pts.py
# =============================================================================
# PTS BACK ORDER INTELLIGENCE — PYDANTIC RESPONSE SCHEMAS
# =============================================================================
# These models define the contract between the FastAPI backend and the
# React frontend for all three PTS dashboards.
# =============================================================================

from pydantic import BaseModel
from typing import Optional, List


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard 1 — Back Order Age
# ─────────────────────────────────────────────────────────────────────────────

class BackOrderItem(BaseModel):
    """
    One flat row per open sales order line.
    Used for Dashboard 1 (Age Analysis).
    The frontend aggregates these into By-Item, By-Customer,
    Printed/Plain, and Single-Item views.
    """
    DocNum: int
    LpoNo: Optional[str] = None
    DocDate: Optional[str] = None
    CUSTOMERID: Optional[str] = None
    CUSTOMER: Optional[str] = None
    ProductCode: Optional[str] = None
    ProductDescription: Optional[str] = None
    AlsoKnownAs: Optional[str] = None
    Order_Qty: Optional[float] = 0.0
    Delivered_Qnty: Optional[float] = 0.0
    Remaining_Qnty: Optional[float] = 0.0
    Department: Optional[str] = None
    LineKey: Optional[str] = None
    AgeDays: Optional[int] = 0
    NumColors: Optional[int] = 0
    ProductionMethod: Optional[int] = 0
    Microns: Optional[float] = 0.0
    PerfectMicron: Optional[float] = 0.0
    TopWidth: Optional[float] = 0.0
    BottomWidth: Optional[float] = 0.0
    PerfectWidth: Optional[float] = 0.0
    ObjectWeight: Optional[float] = 0.0
    # Computed by router: True if ProductionMethod in {0,12,14,16} AND NumColors == 0
    IsPlain: Optional[bool] = False
    ProdOrderNum: Optional[int] = None   # NULL = no production planned


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard 2 — Material Requirements
# ─────────────────────────────────────────────────────────────────────────────

class MaterialDetailItem(BaseModel):
    """
    One specific product item that belongs to a material group.
    Used in the drill-down expansion of Dashboard 2.
    """
    DocNum: int
    CUSTOMER: Optional[str] = None
    ProductCode: Optional[str] = None
    ProductDescription: Optional[str] = None
    Remaining_Qnty: Optional[float] = 0.0
    EstWeightKg: Optional[float] = 0.0
    ProdOrderNum: Optional[int] = None


class MatchedStockItem(BaseModel):
    """
    Identifies a specific warehouse roll and its current weight.
    Used for accurate inventory summing in the frontend to prevent 
    double-counting if a roll matches multiple requirement buckets.
    """
    id: str
    weight: float

class MaterialGroup(BaseModel):
    """
    A rolled-up material specification group (Micron × Width).
    Dashboard 2 primary grid.
    The 'Items' list is the drill-down: all product lines within this group.
    """
    Category: Optional[str] = None
    Microns: float
    PerfectMicron: Optional[float] = 0.0
    AvgWidth: float          # average of (TopWidth + BottomWidth) / 2 across items
    PerfectWidth: Optional[float] = 0.0
    TotalOpenQty: float      # sum of Remaining_Qnty
    TotalEstWeightKg: float  # sum of EstWeightKg
    AvailableKg: Optional[float] = 0.0 # Matching warehouse stock
    StockBreakdown: Optional[dict] = {} # Detail of which rolls make up the stock
    MatchedStock: List[MatchedStockItem] = [] # List of unique roll IDs and weights
    OrderLines: int          # count of distinct order lines
    Items: List[MaterialDetailItem] = []
    is_idle: Optional[bool] = False # True if no active orders require this stock


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard 3 — Production Coverage
# ─────────────────────────────────────────────────────────────────────────────

class CoverageItem(BaseModel):
    """
    One row per open back order line, showing whether a production order
    is already planned against it.
    ProdOrderNum = None means NO production is planned → uncovered backlog.
    """
    SalesOrderNum: int
    LpoNo: Optional[str] = None
    CUSTOMER: Optional[str] = None
    CUSTOMERID: Optional[str] = None
    ProductCode: Optional[str] = None
    ProductDescription: Optional[str] = None
    Order_Qty: Optional[float] = 0.0
    Delivered_Qnty: Optional[float] = 0.0
    OpenQty: Optional[float] = 0.0
    DocDate: Optional[str] = None
    AgeDays: Optional[int] = 0
    NumColors: Optional[int] = 0
    ProductionMethod: Optional[int] = 0
    IsPlain: Optional[bool] = False
    ProdOrderNum: Optional[int] = None   # NULL = no production planned
    PlannedQty: Optional[float] = 0.0
    ProducedQty: Optional[float] = 0.0
    ProdStatus: Optional[str] = None
    IsCovered: Optional[bool] = False    # True if ProdOrderNum is not None


class CoverageSummary(BaseModel):
    """
    Top-level response for Dashboard 3.
    Includes all coverage rows and a computed color burden score.
    """
    TotalOpenLines: int
    CoveredLines: int
    UncoveredLines: int
    HighColorLines: int       # lines with NumColors >= 5
    ColorBurdenPct: float     # (HighColorLines / TotalOpenLines) * 100
    BurdenLevel: str          # "OK" | "AMBER" | "RED"
    Items: List[CoverageItem] = []
# ─────────────────────────────────────────────────────────────────────────────
# Material Integrity (The Guardian)
# ─────────────────────────────────────────────────────────────────────────────

class MaterialIntegrityItem(BaseModel):
    """
    Real-time comparison between the 'Perfect' spec and a 'Scanned' reel
    at a specific machine.
    """
    MachineID: str
    DisplayName: str          # e.g. "Printing_1 (Uflex)"
    ItemCode: str
    ItemDescription: Optional[str] = None
    PerfectMicron: float
    ScannedMicron: Optional[float] = None
    MicronDelta: Optional[float] = 0.0
    PerfectWidth: float
    ScannedWidth: Optional[float] = None
    WidthDelta: Optional[float] = 0.0
    Status: str              # "OK" | "WARN" | "CRITICAL" | "UNKNOWN"
    LastScanTime: Optional[str] = None

class MaterialIntegrityStatus(BaseModel):
    """
    Top-level response for the live Mismatch Alert widget.
    """
    TotalMachines: int
    MismatchesFound: int
    CriticalCount: int
    WarningCount: int
    AlertLevel: str           # "OK" | "WARN" | "CRITICAL"
    Timestamp: str
    Machines: List[MaterialIntegrityItem]


# ─────────────────────────────────────────────────────────────────────────────
# Daily Production Planning (Planner Store)
# ─────────────────────────────────────────────────────────────────────────────

class PlannedJob(BaseModel):
    """
    Representation of an order assigned to a specific machine for today's run.
    The order of these items in the machine's list defines the 'Shuffle' sequence.
    """
    DocNum: int
    LpoNo: Optional[str] = None
    Customer: Optional[str] = None
    ProductCode: Optional[str] = None
    Description: Optional[str] = None
    Remaining_Qnty: Optional[float] = 0.0
    Priority: int

class DailyPlan(BaseModel):
    """
    The full daily schedule for all machines.
    Stored in daily_plan.json.
    Now follows a 'Global Queue' model.
    """
    queue: List[PlannedJob] = []
