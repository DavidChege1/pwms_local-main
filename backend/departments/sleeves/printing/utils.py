# backend/departments/sleeves/printing/utils.py

def calculate_planned_meters(job_data: dict) -> float:
    """
    Replicates the legacy C# PrintMeters() logic to calculate 
    the target meters for a printing job.
    Includes a 2% per color inbuilt waste buffer to account for the
    increased complexity and time of high-color jobs.
    """
    method = job_data.get('ProductionMethod')
    qty = float(job_data.get('PlannedQty') or 0)
    colors = int(job_data.get('NumColors') or 0)
    tw = float(job_data.get('TopWidth') or 0)
    bw = float(job_data.get('BottomWidth') or 0)
    height = float(job_data.get('Height') or 0)
    
    # --- 1. Make-Ready (Setup) Meters ---
    # Case: 0-1 colors use 50m fixed. >1 colors use 200m/color.
    def get_make_ready_meters():
        if colors <= 1:
            return 50.0
        return 200.0 * colors

    mr_meters = get_make_ready_meters()

    # --- 2. Inbuilt Production Waste Multiplier ---
    # 2% per color (e.g. 10 colors = 20% waste buffer)
    waste_multiplier = 1.0 + (colors * 0.02)

    # --- 3. Base Net Meters Calculation ---
    net_meters = 0.0

    # Mapping ProductionMethod (integers) to Categories
    # Clear / Plain
    if method in [0, 12, 14, 16]:
        # mts = ((((tw + bw) / 100.0) / 2.0) * QuantityOrdered)
        net_meters = (((tw + bw) / 100.0) / 2.0) * qty

    # Printed Sheet
    elif method in [15, 8]:
        # base = (Height / 100.0) * QuantityOrdered
        net_meters = (height / 100.0) * qty

    # P1_printed_1_side (Single Image or Folded 1 Face Up)
    elif method in [1, 3, 5]:
        slength = (tw / 100.0) + (bw / 100.0)
        if height < 61:
            # numaccross = 2; SleevesPerUnit = 4
            net_meters = (qty / 4.0) * slength
        else:
            # numaccross = 1; SleevesPerUnit = 1; divided by 2 as per legacy code
            net_meters = (qty / 2.0) * slength

    # P2_printed_Form_2_sides
    elif method in [4, 6, 17, 20]:
        slength = (tw / 100.0) + (bw / 100.0)
        if height <= 60:
            # SleevesPerUnit = 2
            net_meters = (qty / 2.0) * slength
        else:
            # res = QuantityOrdered * slength
            net_meters = qty * (slength / 2.0) * 2.0

    else:
        # Fallback (average formula)
        net_meters = (((tw + bw) / 100.0) / 2.0) * qty

    # --- 4. Final Aggregated Target ---
    # Total Planned = (Net Product * Waste Multiplier) + Setup Meters
    return (net_meters * waste_multiplier) + mr_meters

def calculate_kg_from_meters(meters: float, reel_width: float, micron: float) -> float:
    """
    Replicates legacy ReelWeight logic:
    t = meters * (((reelWidth / 1000f) * GSM) / 1000f)
    GSM = Micron * 0.91 (as per user's standard)
    """
    if not meters or not reel_width:
        return 0.0
    
    gsm = micron * 0.91
    weight = meters * (((reel_width / 1000.0) * gsm) / 1000.0)
    return weight
