from pydantic import BaseModel
from typing import Optional, Union

class MaterialTargetItem(BaseModel):
    JobCard: Optional[Union[int, str]] = None
    Customer: Optional[str] = None
    ItemCode: Optional[str] = None
    LabelDescription: Optional[str] = None
    MaterialType: Optional[str] = None
    TransDate: Optional[str] = None
    Production_Sqr_Meters_Target: Optional[float] = 0.0
    Production_Sqr_Meters_Actual: Optional[float] = 0.0
    Production_Waste_Sqr_Mtrs_Target: Optional[float] = 0.0
    Production_Waste_Sqr_Mtrs_Actual: Optional[float] = 0.0
    Production_Pcs_Labels_Target: Optional[float] = 0.0
    Production_Pcs_Labels_Actual: Optional[float] = 0.0
    Department: Optional[str] = None

class MaterialUsageItem(BaseModel):
    ProductionDate: Optional[str] = None
    ProductionMonth: Optional[str] = None
    ProductionYear: Optional[int] = None
    JobCard: Optional[Union[int, str]] = None
    Customer: Optional[str] = None
    ItemCode: Optional[str] = None
    LabelDescription: Optional[str] = None
    MaterialType: Optional[str] = None
    SquareMeters: Optional[float] = 0.0

class WasteByOrderItem(BaseModel):
    JobCard: Optional[Union[int, str]] = None
    ProductCode: Optional[str] = None
    LabelDescription: Optional[str] = None
    ProductionDate: Optional[str] = None
    MachineName: Optional[str] = None
    MachineOperator: Optional[str] = None
    WasteType: Optional[str] = None
    ProductionShift: Optional[str] = None
    ProductionWaste_Kgs: Optional[float] = 0.0
    TrimWaste_Kgs: Optional[float] = 0.0

class SlittingActivityItem(BaseModel):
    SlitDate: Optional[str] = None
    RequestID: Optional[Union[int, str]] = None
    ParentBatchNo: Optional[str] = None
    DocumentID: Optional[str] = None
    ParentWidth: Optional[float] = 0.0
    ParentLength: Optional[float] = 0.0
    ParentSqrMtrs: Optional[float] = 0.0
    MaterialType: Optional[str] = None
    ChildBatchNo: Optional[str] = None
    ChildLength: Optional[float] = 0.0
    ChildSqrMtrs: Optional[float] = 0.0
