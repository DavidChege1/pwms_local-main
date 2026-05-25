# backend/ml/ml_service.py

import os
import glob
import joblib
import pandas as pd
from datetime import datetime
from cachetools import cached, TTLCache

# Cache the model for 1 hour to avoid repeated disk reads
# But allows for updates when a new file is dropped in
model_cache = TTLCache(maxsize=1, ttl=3600)

from .inference_service import WastePredictor

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Singleton instance for the predictor to avoid reloading the model on every request
_predictor_instance = None

def get_predictor():
    global _predictor_instance
    if _predictor_instance is None:
        try:
            _predictor_instance = WastePredictor()
        except Exception as e:
            print(f"Failed to initialize WastePredictor: {e}")
            return None
    return _predictor_instance

def log_debug(message):
    try:
        with open("ml_debug_log.txt", "a") as f:
            f.write(f"{datetime.now().isoformat()} - {message}\n")
    except:
        pass

class MLService:
    @staticmethod
    def predict_waste(data: dict):
        """
        Predicts waste based on input features using the WastePredictor.
        Expected keys in data: machine_id, shift, item_code, description, weight_kg, qty, prev_item_code
        """
        predictor = get_predictor()
        log_debug(f"Predict request received: {data}")
        
        if not predictor:
            log_debug("Predictor not found!")
            return {"error": "ML Model not initialized or not found."}

        try:
            # Map frontend/API keys to WastePredictor arguments
            prediction = predictor.predict_job(
                machine_id=data.get('machine_id', 'Unknown'),
                shift=data.get('shift', 'DAY'),
                item_code=data.get('item_code', 'Unknown'),
                description=data.get('description', ''),
                weight_kg=float(data.get('weight_kg', 0)),
                qty=float(data.get('qty', 0)),
                prev_item_code=data.get('prev_item_code')
            )
            
            log_debug(f"Prediction result: {prediction}")
            
            # Get latest model file for metadata
            models = glob.glob(os.path.join(MODELS_DIR, "*.joblib"))
            model_name = os.path.basename(max(models, key=os.path.getmtime)) if models else "Unknown"

            return {
                "prediction": round(float(prediction), 4),
                "unit": "Kg",
                "model_info": {
                    "filename": model_name,
                    "timestamp": datetime.now().isoformat()
                }
            }
        except Exception as e:
            log_debug(f"Prediction error: {str(e)}")
            return {"error": f"Prediction failed: {str(e)}"}

    @staticmethod
    def get_status():
        """Returns the status of the ML service."""
        predictor = get_predictor()
        
        models = glob.glob(os.path.join(MODELS_DIR, "*.joblib"))
        if not models:
            return {
                "status": "waiting",
                "model_loaded": False,
                "message": "No model files found in backend/ml/models/"
            }
        
        latest_model = max(models, key=os.path.getmtime)
        return {
            "status": "active" if predictor else "error",
            "model_loaded": predictor is not None,
            "current_model": os.path.basename(latest_model),
            "last_modified": datetime.fromtimestamp(os.path.getmtime(latest_model)).isoformat()
        }
