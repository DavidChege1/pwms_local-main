import joblib
import pandas as pd
import re
import os
import glob
from datetime import datetime

class WastePredictor:
    """
    Production Inference Service for PWMS Waste Prediction.
    Loads a V2 model and extracts features from raw production strings.
    """
    
    def __init__(self, model_path=None):
        if model_path is None:
            # Automatically find the latest V2 model in the 'models' subdirectory
            models_dir = os.path.join(os.path.dirname(__file__), "models")
            models = glob.glob(os.path.join(models_dir, "waste_model_v2_*.joblib"))
            if not models:
                # Fallback to current directory for backward compatibility/dev testing
                models = glob.glob("waste_model_v2_*.joblib")
                
            if not models:
                raise FileNotFoundError("No V2 waste model found in models/ or current directory.")
            
            model_path = max(models, key=os.path.getmtime) # Gets the latest by modification time
            
        print(f"Loading Waste Prediction Model: {model_path}")
        self.pipeline = joblib.load(model_path)

    def _extract_features(self, machine_id, shift, item_code, description, weight_kg, qty, prev_item_code=None):
        """
        Mirrors the feature extraction logic used in V2 training.
        """
        # 1. Clean Machine ID
        machine = str(machine_id).replace("FORMING_", "F")
        
        # 2. Time-based features
        day_of_week = datetime.now().weekday() + 1 # 1-7 for Mon-Sun (matches SQL DATEPART)
        
        # 3. Regex from Description
        def get_microns(text):
            if not text: return 40.0
            match = re.search(r'(\d+)\s*(mic|micron)', text, re.I)
            return float(match.group(1)) if match else 40.0

        def get_dims(text):
            if not text: return 0.0, 0.0, 0.0
            match = re.search(r'(\d+)x(\d+)x(\d+\.?\d*)', text)
            if match:
                return float(match.group(1)), float(match.group(2)), float(match.group(3))
            return 0.0, 0.0, 0.0

        def get_ah(text):
            if not text: return 0
            match = re.search(r'(\d+)AH', text, re.I)
            return int(match.group(1)) if match else 0

        def get_colors(text):
            if not text: return 1
            match = re.search(r'(\d+)\s*[Cc]lr', text)
            return int(match.group(1)) if match else 1

        microns = get_microns(description)
        w, h, d = get_dims(description)
        ah = get_ah(description)
        colors = get_colors(description)
        
        # 4. Changeover logic
        is_changeover = 0
        if prev_item_code is not None:
            is_changeover = 1 if str(item_code) != str(prev_item_code) else 0
        else:
            # If previous job context is missing, we assume 1 to be conservative on waste
            is_changeover = 1
            
        # 5. Build features payload (Must match training order and names)
        # Numerical features: ['ProducedPcs', 'ProducedWeight_Kg', 'DayOfWeek', 'Microns', 'Width', 'Height', 'Depth', 'AH_Count', 'Color_Count', 'Is_Changeover']
        # Categorical features: ['Machine', 'JobShift', 'ItemCode']
        
        data = {
            'Machine': [machine],
            'JobShift': [shift],
            'ItemCode': [item_code],
            'ProducedPcs': [qty],
            'ProducedWeight_Kg': [weight_kg],
            'DayOfWeek': [day_of_week],
            'Microns': [microns],
            'Width': [w],
            'Height': [h],
            'Depth': [d],
            'AH_Count': [ah],
            'Color_Count': [colors],
            'Is_Changeover': [is_changeover]
        }
        
        return pd.DataFrame(data)

    def predict_job(self, machine_id, shift, item_code, description, weight_kg, qty, prev_item_code=None):
        """
        Predicts waste in Kg for a single job.
        """
        X = self._extract_features(machine_id, shift, item_code, description, weight_kg, qty, prev_item_code)
        prediction = self.pipeline.predict(X)[0]
        return max(0, float(prediction)) # Waste cannot be negative

# --- DEMO / USAGE EXAMPLE ---
if __name__ == "__main__":
    try:
        predictor = WastePredictor()
        
        # Mock production data for a new job
        prediction = predictor.predict_job(
            machine_id="FORMING_1",
            shift="DAY",
            item_code="TEST-001",
            description="50x40x11.5 6AH 40 mic 4Clr",
            weight_kg=500.0,
            qty=10000,
            prev_item_code="OLD-042" # Changeover detected!
        )
        
        print("-" * 30)
        print(f"PREDICTED WASTE: {prediction:.2f} kg")
        print("-" * 30)
        
    except Exception as e:
        print(f"Error: {e}")
