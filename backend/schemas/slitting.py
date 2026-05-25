from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class SlittingTypeAItem(BaseModel):
    SysID: int
    JobHeader: str
    TransactionDate: date
    Micron: float
    InputWidth: float
    WeightIssued: float
    TotalOutputWidth: Optional[float]
    TotalWeightReceived: Optional[float]

class SlittingTypeBItem(BaseModel):
    SysID: int
    JobHeader: str
    TransactionDate: date
    Micron: float
    InputWidth: float
    WeightIssued: float
    RequiredWidth: float
    TotalOutputWidth: Optional[float]
    TotalWeightReceived: Optional[float]
    WasteWeight: float
    IsOffSpec: bool

class SlittingHistoryItem(BaseModel):
    Year: int
    Month: int
    JobCount: int
    TypeA_Count: int
    TypeB_Count: int
    TotalWeight: float
    TypeA_Weight: float
    TypeB_Weight: float
    OrderVolume: float

class SlittingDashboardResponse(BaseModel):
    TypeA: List[SlittingTypeAItem]
    TypeB: List[SlittingTypeBItem]
    History: List[SlittingHistoryItem]
