from pydantic import BaseModel
from typing import Optional

class EstimateRequest(BaseModel):
    ProductCode: Optional[str] = None
    JobMeters: float
    NumColors: int = 0
    Microns: float = 0.0
    Width: float = 0.0
    Category: str = "Normal BOPP"

class EstimatedDates(BaseModel):
    BaseShipDate: str
    MaterialAdjustedShipDate: Optional[str] = None

class EstimatorResponse(BaseModel):
    EstimatedTimeHours: float
    SetupTimeHours: float
    ProductionTimeHours: float
    CurrentQueueMeters: float
    AverageSpeedMetersPerHour: float
    MaterialAvailableKg: float
    MaterialRequiredKg: float
    MaterialStatus: str # "In Stock" or "Awaiting Delivery"
    EstimatedDates: EstimatedDates
    PriorityIndex: Optional[int] = None
    ProductionComments: Optional[str] = None
    LineNote: Optional[str] = None

class LiveJob(BaseModel):
    MachineID: str
    LastScan: str # Timestamp
    ProductionOrder: Optional[str] = None
    ItemCode: Optional[str] = None
    ItemDescription: Optional[str] = None
    PlannedQty: float = 0.0
    ProducedQty: float = 0.0
    Status: Optional[str] = None # SAP Status ('R', 'C' etc)
    IsActive: bool # Pulse indicator (last scan < 2 hours)
    PriorityIndex: Optional[int] = None
    ProductionComments: Optional[str] = None

class LiveFloorResponse(BaseModel):
    Machines: list[LiveJob]
    LastUpdated: str
