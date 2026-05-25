# backend/ml/router.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from .ml_service import MLService

router = APIRouter()

class PredictionRequest(BaseModel):
    features: Dict[str, Any]

@router.get("/status")
def get_ml_status():
    """Returns the current state of the ML model."""
    return MLService.get_status()

@router.post("/predict/waste")
def predict_waste(request: PredictionRequest):
    """
    Receives production features and returns a waste prediction.
    Features should match those used during training on the dev server.
    """
    result = MLService.predict_waste(request.features)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
