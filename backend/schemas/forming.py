from pydantic import BaseModel
from typing import List, Optional, Union

class FormingReportItem(BaseModel):
    PROD_DATE: Optional[str] = None
    MACHINE: Optional[str] = None
    DAY_PCS: Optional[float] = 0.0
    DAY_WEIGHT: Optional[float] = 0.0
    NIGHT_PCS: Optional[float] = 0.0
    NIGHT_WEIGHT: Optional[float] = 0.0
    daily_waste: Optional[float] = 0.0
    TOTAL_PCS: Optional[float] = 0.0
    TOTAL_WEIGHT: Optional[float] = 0.0

class FormingVarianceProduction(BaseModel):
    TransactionDate: Optional[str] = None
    MachineName: Optional[str] = None
    ProductionOrder: Optional[Union[int, str]] = None
    ProductCode: Optional[str] = None
    ProductDescription: Optional[str] = None
    DayShift: Optional[str] = None
    SleevesProducedQty: Optional[float] = 0.0
    SleevesTotalWeight: Optional[float] = 0.0

class FormingVarianceVS(BaseModel):
    ExactDate: Optional[str] = None
    ProductionOrder: Optional[Union[int, str]] = None
    ProductID: Optional[str] = None
    ProductDesc: Optional[str] = None
    OrderStatus: Optional[str] = None
    TargetQnty_Pcs: Optional[float] = 0.0
    TargetWght_kgs: Optional[float] = 0.0
    CompletedQnty_Pcs: Optional[float] = 0.0
    CompletedWght_kgs: Optional[float] = 0.0
    VStockReceipt_Pcs: Optional[float] = 0.0
    VStockWght_kgs: Optional[float] = 0.0
    Delivered_Pcs: Optional[float] = 0.0

class FormingVarianceCalculation(BaseModel):
    ProductionOrder: Optional[Union[int, str]] = None
    ItemCode: Optional[str] = None
    ProductDesc: Optional[str] = None
    OrderStatus: Optional[str] = None
    TargetQnty_Pcs: Optional[float] = 0.0
    TargetWght_kgs: Optional[float] = 0.0
    CompletedQnty_Pcs: Optional[float] = 0.0
    CompletedWght_kgs: Optional[float] = 0.0
    VStockReceipt_Pcs: Optional[float] = 0.0
    VStockWght_kgs: Optional[float] = 0.0
    Delivered_Pcs: Optional[float] = 0.0
    SleevesProducedQty: Optional[float] = 0.0
    VarianceQty: Optional[float] = 0.0
    VarianceWeight: Optional[float] = 0.0
    DeliveredVariance: Optional[float] = 0.0
    WarehouseYield: Optional[float] = 0.0
    SyncStatus: Optional[str] = "Unknown"
    Diagnosis: Optional[str] = ""
    DiagnosisColor: Optional[str] = "#6b7280"

class FormingVarianceResponse(BaseModel):
    production: List[FormingVarianceProduction]
    virtual_stock: List[FormingVarianceVS]
    variance: List[FormingVarianceCalculation]
