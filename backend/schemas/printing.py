from pydantic import BaseModel
from typing import Optional, Union, List

class BoppMonitorItem(BaseModel):
    TransactionDate: Optional[str] = None
    ProductionTime: Optional[str] = None
    ProductionShift: Optional[str] = None
    MachineID: Optional[str] = None
    ProductionOrder: Optional[Union[int, str]] = None
    ItemCode: Optional[str] = None
    ItemDescription: Optional[str] = None
    ReelIndex: Optional[str] = None
    BoppWeight: Optional[float] = 0.0
    RunMeters: Optional[float] = 0.0
    daily_waste: Optional[float] = 0.0

class EfficiencyDetailedItem(BaseModel):
    ProductionOrder: str
    ItemCode: str
    ProductDescription: Optional[str] = None
    ProductionMethod: Optional[int] = None
    NumColors: int
    OrderDate: str
    PlannedQty: float
    PlannedMeters: float
    ActualRunMeters: float
    ActualWeight: float
    MachineID: Optional[str] = None
    VarianceMeters: float
    VariancePercent: float
    EstSetupTimeMins: int
    IsPlain: bool

class EfficiencySummary(BaseModel):
    TotalPlannedMeters: float
    TotalActualMeters: float
    TotalChangeovers: int
    AvgMetersPerJob: float
    Details: List[EfficiencyDetailedItem]

