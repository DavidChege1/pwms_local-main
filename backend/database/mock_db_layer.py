# D:\DAVE\My\pwms_local\backend\database\mock_db_layer.py
import datetime
import random
import re

# --- ANONYMOUS GENERATION UTILITIES ---
CUSTOMERS = [
    "Apex Industries Ltd",
    "Global Beverages Corp",
    "Summit Food Packers",
    "Sunrise Agritech",
    "East African Distributors",
    "Summit Retail Group",
    "Peak Packaging Solutions",
    "Victoria Dairy Ltd",
    "Rift Valley Millers",
    "Equator Confectionery",
    "Kilimanjaro Brews",
    "Serengeti Packers"
]

ITEM_DESCRIPTIONS = [
    "50ml Plain Shrink Sleeve",
    "500ml Branded Soda Sleeve",
    "1L Yogurt Shrink Wrap",
    "2L Cooking Oil Label",
    "Water Bottle Label 500ml",
    "Shampoo Bottle Sleeve 250ml",
    "Juice Bottle Wrapper 300ml",
    "Tomato Sauce Sleeve 400g",
    "Milk Pouch Outer Wrap",
    "Detergent Sleeve 1.5L",
    "Sweets Package Wrapper",
    "Premium Chocolate Band"
]

OPERATORS = [
    "John Doe", "Jane Smith", "Alex Mercer", "Sarah Connor", 
    "David Miller", "Emma Watson", "James Carter", "Grace Hopper"
]

def get_random_customer(seed_val):
    random.seed(hash(str(seed_val)))
    return random.choice(CUSTOMERS)

def get_random_item(seed_val):
    random.seed(hash(str(seed_val)))
    code_idx = random.randint(100, 999)
    dept = "F12" if random.choice([True, False]) else "L44"
    item_code = f"{dept}-S{code_idx}"
    desc = random.choice(ITEM_DESCRIPTIONS)
    return item_code, desc

def get_date_list(start_str, end_str):
    try:
        start_date = datetime.datetime.strptime(start_str, "%Y-%m-%d").date()
        end_date = datetime.datetime.strptime(end_str, "%Y-%m-%d").date()
    except Exception:
        # Fallback to last 7 days if date parsing fails
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=7)
        
    date_list = []
    curr = start_date
    while curr <= end_date:
        date_list.append(curr)
        curr += datetime.timedelta(days=1)
    return date_list

# --- MOCK CONNECTION IMPLEMENTATION ---
class MockConnection:
    def cursor(self):
        return MockCursor()
    def close(self):
        pass
    def raw_connection(self):
        return self

class MockCursor:
    def __init__(self):
        self.description = []
        self.results = []
        self._index = 0

    def execute(self, query, params=None):
        self._index = 0
        q_upper = query.upper()
        
        # 1. LIVE FLOOR snapshot query
        if "LatestReel".upper() in q_upper and "LastScan".upper() in q_upper:
            columns = [
                "MachineID", "LastScan", "ProductionOrder", "ItemCode", 
                "ItemDescription", "PlannedQty", "ProducedQty", "Status", 
                "PriorityIndex", "ProductionComments"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            rows = []
            now = datetime.datetime.now()
            # Printing machines
            for i in range(1, 5):
                m_id = f"PRINTING_{i}"
                po = 102400 + i
                item_code, desc = get_random_item(po)
                planned = random.choice([20000, 35000, 50000])
                produced = random.randint(0, planned)
                scanned_delta = random.randint(10, 180) # minutes ago
                last_scan = now - datetime.timedelta(minutes=scanned_delta)
                status = "R" if produced < planned else "C"
                rows.append((
                    m_id, last_scan, po, item_code, desc, 
                    float(planned), float(produced), status, 
                    random.choice([1, 2, 3]), "Running smooth"
                ))
            # ECO Flex
            last_scan = now - datetime.timedelta(minutes=45)
            po = 102410
            item_code, desc = get_random_item(po)
            rows.append((
                "ECO_FLEX", last_scan, po, item_code, desc, 
                30000.0, 15000.0, "R", 1, "Urgent production order"
            ))
            # Forming machines F1 to F13
            for i in range(1, 14):
                m_id = f"FORMING_{i}"
                po = 102500 + i
                item_code, desc = get_random_item(po)
                planned = random.choice([40000, 60000, 80000])
                produced = random.randint(0, planned)
                scanned_delta = random.randint(5, 300)
                last_scan = now - datetime.timedelta(minutes=scanned_delta)
                status = "R" if produced < planned else "C"
                rows.append((
                    m_id, last_scan, po, item_code, desc, 
                    float(planned), float(produced), status, 
                    random.choice([1, 2, 3, None]), "Reel changeover in progress"
                ))
            self.results = rows
            
        # 2. PRINTING HISTORICAL BENCHMARK QUERIES (6-MONTH ROLLING)
        elif "PRINTING_BENCHMARK_SQL" in query or ("ProdData".upper() in q_upper and "PR%".upper() in q_upper and "WasteRatio".upper() in q_upper):
            columns = ["MachineID", "TotalWeight", "TotalWaste", "WasteRatio"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            rows = [
                ("PRINTING_1", 185000.0, 9250.0, 0.050),
                ("PRINTING_2", 220000.0, 8800.0, 0.040),
                ("PRINTING_3", 290000.0, 17400.0, 0.060),
                ("PRINTING_4", 145000.0, 10150.0, 0.070),
                ("ECO_FLEX", 95000.0, 2850.0, 0.030)
            ]
            self.results = rows

        # 3. PRINTING EFFICIENCY & PLANNED METERS
        elif "PRINTING_EFFICIENCY_SQL" in query or ("DKL.dbo.OWOR".upper() in q_upper and "prod.ItemCode".upper() in q_upper and "ReelWeight".upper() in q_upper):
            columns = [
                "ProductionOrder", "ItemCode", "ProductDescription", "ProductionMethod", 
                "NumColors", "Height", "TopWidth", "BottomWidth", "Microns", 
                "MaterialSize", "ObjectWeight", "OrderDate", "PlannedQty", 
                "MachineID", "ReelIndex", "RawSpec", "ReelWeight", "ProductionDate"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            po_counter = 118000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                # Generate 3-5 jobs per day
                for j in range(random.randint(3, 5)):
                    po_counter += 1
                    item_code, desc = get_random_item(po_counter)
                    colors = random.randint(1, 8)
                    method = random.choice([11, 13, 17]) # Printed Sleeves
                    planned_qty = random.randint(15000, 60000)
                    top_w = random.choice([200, 250, 300, 350])
                    height = random.choice([120, 150, 180, 220])
                    microns = random.choice([30, 35, 40, 45])
                    obj_wght = round(random.uniform(0.001, 0.008), 5)
                    
                    # Reels produced for this job
                    num_reels = random.randint(1, 4)
                    for r_idx in range(num_reels):
                        reel_id = f"R{po_counter}-{r_idx+1}"
                        spec = f"{microns}*{top_w}*{random.randint(2500, 4000)}"
                        reel_weight = random.uniform(80.0, 150.0)
                        
                        rows.append((
                            po_counter, item_code, desc, method, 
                            colors, float(height), float(top_w), float(top_w), float(microns),
                            float(top_w), obj_wght, d_str, float(planned_qty),
                            f"PRINTING_{random.randint(1, 4)}", reel_id, spec, reel_weight, d_str
                        ))
            self.results = rows

        # 4. BOPP MONITOR SQL
        elif "BOPP_MONITOR_SQL" in query or ("WeightIn".upper() in q_upper and "DateStamp".upper() in q_upper and "BoppWeight".upper() in q_upper):
            columns = [
                "TransactionDate", "ProductionTime", "ProductionShift", "MachineID", 
                "ProductionOrder", "ItemCode", "ItemDescription", "ReelIndex", 
                "BoppWeight", "Spec"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            po_counter = 129000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for m_idx in range(1, 5):
                    machine = f"PRINTING_{m_idx}"
                    # Day & Night shift records
                    for shift in ["Day", "Night"]:
                        for r_idx in range(random.randint(2, 4)):
                            po_counter += 1
                            item_code, desc = get_random_item(po_counter)
                            bopp_weight = random.uniform(120.0, 260.0)
                            width = random.choice([250, 300, 350, 400, 450])
                            mic = random.choice([30, 35, 40])
                            spec = f"{mic}*{width}*{random.randint(2000, 3500)}"
                            time_str = f"{d_str} 10:15:30" if shift == "Day" else f"{d_str} 22:45:00"
                            rows.append((
                                d_str, time_str, shift, machine,
                                po_counter, item_code, desc, f"R{po_counter}-{r_idx}",
                                bopp_weight, spec
                            ))
            self.results = rows

        # 5. FORMING PRODUCTION SQL
        elif "Machines".upper() in q_upper and "DAY_PCS".upper() in q_upper:
            columns = ["PROD_DATE", "MACHINE", "DAY_PCS", "DAY_WEIGHT", "NIGHT_PCS", "NIGHT_WEIGHT"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for f_idx in range(1, 14):
                    machine = f"F{f_idx}"
                    day_pcs = random.randint(12000, 35000)
                    day_weight = round(day_pcs * random.uniform(0.002, 0.006), 1)
                    night_pcs = random.randint(8000, 25000)
                    night_weight = round(night_pcs * random.uniform(0.002, 0.006), 1)
                    rows.append((d_str, machine, day_pcs, day_weight, night_pcs, night_weight))
            self.results = rows

        # 6. FORMING & SLEEVES WASTE SQL
        elif "daily_waste".upper() in q_upper and "RECYCLER_WASTE".upper() in q_upper:
            columns = ["PROD_DATE", "MACHINE", "daily_waste"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            # Forming machine wastes
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for f_idx in range(1, 14):
                    if random.random() > 0.3: # 70% chance of waste
                        rows.append((d_str, f"F{f_idx}", round(random.uniform(1.5, 12.0), 1)))
                for p_idx in range(1, 5):
                    if random.random() > 0.4:
                        rows.append((d_str, f"PRINTING_{p_idx}", round(random.uniform(5.0, 35.0), 1)))
            self.results = rows

        # 7. FORMING VARIANCE ANALYSIS (PROD DATA)
        elif "SleevesProducedQty".upper() in q_upper and "SleevesTotalWeight".upper() in q_upper:
            columns = [
                "TransactionDate", "MachineName", "ProductionOrder", "ProductCode", 
                "ProductDescription", "DayShift", "SleevesProducedQty", "SleevesTotalWeight"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            po_counter = 135000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for f_idx in range(1, 8):
                    po_counter += 1
                    item_code, desc = get_random_item(po_counter)
                    for shift in ["DAY", "NIGHT"]:
                        produced_qty = random.randint(18000, 45000)
                        weight = round(produced_qty * random.uniform(0.003, 0.005), 0)
                        rows.append((
                            d_str, f"FORMING_{f_idx}", po_counter, item_code, 
                            desc, shift, produced_qty, weight
                        ))
            self.results = rows

        # 8. VIRTUAL STOCK RECEIPT SQL (FORMING VARIANCE CTE)
        elif "OrderVStock".upper() in q_upper or "EKL_VS_ROWS".upper() in q_upper:
            columns = [
                "ExactDate", "ProductionOrder", "ProductID", "ProductDesc", "OrderStatus", 
                "TargetQnty_Pcs", "TargetWght_kgs", "CompletedQnty_Pcs", "CompletedWght_kgs", 
                "VStockReceipt_Pcs", "VStockWght_kgs", "ItemCode", "PostDate"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            # Start and End Date will be final 2 parameters
            start_date_str = params[-2] if params else "2026-05-18"
            end_date_str = params[-1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            po_counter = 145000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for j in range(random.randint(2, 4)):
                    po_counter += 1
                    item_code, desc = get_random_item(po_counter)
                    target_pcs = random.choice([50000, 80000, 120000])
                    target_wght = int(target_pcs * random.uniform(0.003, 0.005))
                    completed_pcs = int(target_pcs * random.uniform(0.98, 1.02))
                    completed_wght = int(completed_pcs * random.uniform(0.003, 0.005))
                    vstock_pcs = completed_pcs
                    vstock_wght = completed_wght
                    
                    rows.append((
                        d_str, po_counter, item_code, desc, "CLOSED", 
                        target_pcs, target_wght, completed_pcs, completed_wght,
                        vstock_pcs, vstock_wght, item_code, d_str
                    ))
            self.results = rows

        # 9. FORMING MACHINE BENCHMARKS
        elif "MACHINE_BENCHMARK_SQL" in query or ("REPLACE(p.MachineID, 'FORMING_', 'F')".upper() in q_upper and "TotalWeight".upper() in q_upper):
            columns = ["MachineID", "MACHINE", "TotalWeight", "TotalWaste", "WasteRatio"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            rows = []
            for i in range(1, 14):
                weight = random.uniform(35000.0, 95000.0)
                waste = weight * random.uniform(0.015, 0.038)
                rows.append((f"FORMING_{i}", f"F{i}", weight, waste, waste/weight))
            self.results = rows

        # 10. MATERIAL DISPATCH / DELIVERIES FETCH
        elif "SAP_ODLN_DLN1_DATA_5YRS" in q_upper:
            columns = ["ItemCode", "DocDate", "Quantity"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            item_codes_match = re.findall(r"'(F12-S\d+|L44-P\d+)'", query)
            start_date_str = params[0] if params else "2026-05-18"
            dates = get_date_list(start_date_str, "2026-05-25")
            
            rows = []
            if item_codes_match:
                for item in item_codes_match:
                    for d in dates:
                        if random.random() > 0.4:
                            rows.append((item, d.strftime("%Y-%m-%d"), float(random.randint(5000, 25000))))
            self.results = rows

        # 11. LABELS MATERIAL TARGETS SQL
        elif "Production_Sqr_Meters_Target".upper() in q_upper and "SPL_Job_Card".upper() in q_upper:
            columns = [
                "JobCard", "Customer", "ItemCode", "LabelDescription", "MaterialType", "TransDate", 
                "Production_Sqr_Meters_Target", "Production_Sqr_Meters_Actual", 
                "Production_Waste_Sqr_Mtrs_Target", "Production_Waste_Sqr_Mtrs_Actual", 
                "Production_Pcs_Labels_Target", "Production_Pcs_Labels_Actual", "Department"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            jc_counter = 8000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for j in range(random.randint(2, 4)):
                    jc_counter += 1
                    item_code, desc = get_random_item(jc_counter)
                    cust = get_random_customer(jc_counter)
                    substrate = random.choice(["BOPP White", "BOPP Clear", "BOPP Silver", "Semi-Gloss"])
                    
                    target_sqm = random.uniform(1500.0, 5000.0)
                    actual_sqm = target_sqm * random.uniform(0.97, 1.03)
                    waste_tgt = target_sqm * random.uniform(0.04, 0.08)
                    waste_act = actual_sqm * random.uniform(0.03, 0.09)
                    
                    target_pcs = random.randint(40000, 150000)
                    actual_pcs = int(target_pcs * random.uniform(0.98, 1.01))
                    
                    rows.append((
                        jc_counter, cust, item_code, desc, substrate, d_str,
                        target_sqm, actual_sqm, waste_tgt, waste_act,
                        float(target_pcs), float(actual_pcs), "Labels"
                    ))
            self.results = rows

        # 12. LABELS MATERIAL USAGE
        elif "SPL_REELS_ISSUES".upper() in q_upper and "SquareMeters".upper() in q_upper:
            columns = [
                "ProductionDate", "ProductionMonth", "ProductionYear", "JobCard", 
                "Customer", "ItemCode", "LabelDescription", "MaterialType", "SquareMeters"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            jc_counter = 9000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for j in range(random.randint(2, 4)):
                    jc_counter += 1
                    item_code, desc = get_random_item(jc_counter)
                    cust = get_random_customer(jc_counter)
                    substrate = random.choice(["BOPP White", "BOPP Clear", "BOPP Silver", "Semi-Gloss"])
                    rows.append((
                        d_str, d.strftime("%B"), d.year, jc_counter, 
                        cust, item_code, desc, substrate, random.uniform(800.0, 3200.0)
                    ))
            self.results = rows

        # 13. LABELS WASTE BY ORDER
        elif "SPL_JOB_CARD_WASTE".upper() in q_upper and "TrimWaste_Kgs".upper() in q_upper:
            columns = [
                "JobCard", "ProductCode", "LabelDescription", "ProductionDate", "MachineName", 
                "MachineOperator", "WasteType", "ProductionShift", "ProductionWaste_Kgs", "TrimWaste_Kgs"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            jc_counter = 10000
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for j in range(random.randint(1, 3)):
                    jc_counter += 1
                    item_code, desc = get_random_item(jc_counter)
                    machine = f"LABEL_PRESS_{random.randint(1, 3)}"
                    op = random.choice(OPERATORS)
                    w_type = random.choice(["PRODUCTION WASTE", "TRIM WASTE"])
                    shift = random.choice(["DAY", "NIGHT"])
                    p_waste = random.uniform(2.0, 15.0) if w_type == "PRODUCTION WASTE" else 0.0
                    t_waste = random.uniform(1.0, 8.0) if w_type == "TRIM WASTE" else 0.0
                    
                    rows.append((
                        jc_counter, item_code, desc, d_str, machine,
                        op, w_type, shift, p_waste, t_waste
                    ))
            self.results = rows

        # 14. LABELS SLITTING ACTIVITY
        elif "SPL_SLIT_INPUTS".upper() in q_upper and "ChildSqrMtrs".upper() in q_upper:
            columns = [
                "SlitDate", "RequestID", "ParentBatchNo", "DocumentID", 
                "ParentWidth", "ParentLength", "ParentSqrMtrs", "MaterialType", 
                "ChildBatchNo", "ChildLength", "ChildSqrMtrs"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            start_date_str = params[0] if params else "2026-05-18"
            end_date_str = params[1] if params else "2026-05-25"
            dates = get_date_list(start_date_str, end_date_str)
            
            rows = []
            req_counter = 4400
            for d in dates:
                d_str = d.strftime("%Y-%m-%d")
                for j in range(random.randint(1, 3)):
                    req_counter += 1
                    p_width = random.choice([600, 800, 1000])
                    p_len = random.randint(2000, 4000)
                    p_sqm = (p_width * p_len) / 1000.0
                    sub = random.choice(["BOPP White", "BOPP Clear", "Polyester", "Semi-Gloss"])
                    
                    # Outputs
                    num_cuts = random.randint(2, 4)
                    for cut in range(num_cuts):
                        c_width = p_width / num_cuts
                        c_sqm = (c_width * p_len) / 1000.0
                        rows.append((
                            d_str, req_counter, f"PB-{req_counter}", req_counter + 20,
                            p_width, p_len, p_sqm, sub,
                            f"CB-{req_counter}-{cut+1}", p_len, c_sqm
                        ))
            self.results = rows

        # 15. PTS BACKORDER AGE SQL & PRODUCTION COVERAGE COMBINED DATA
        elif "EKL_OPEN_ORDERS".upper() in q_upper and "Remaining_Qnty".upper() in q_upper:
            # Check if this is the Coverage query (contains TargetWght_kgs or combined)
            is_coverage = "combined".upper() in q_upper or "SalesOrderNum".upper() in q_upper
            is_needs = "EstWeightKg".upper() in q_upper
            
            if is_coverage:
                columns = [
                    "SalesOrderNum", "LpoNo", "CUSTOMER", "CUSTOMERID", "ProductCode", 
                    "ProductDescription", "Order_Qty", "Delivered_Qnty", "OpenQty", 
                    "DocDate", "AgeDays", "NumColors", "ProductionMethod", 
                    "ProdOrderNum", "PlannedQty", "ProducedQty", "ProdStatus"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                now = datetime.datetime.now()
                for i in range(1, 26):
                    po = 30200 + i
                    item_code, desc = get_random_item(po)
                    cust = get_random_customer(po)
                    order_qty = random.choice([25000, 50000, 100000])
                    delivered = random.choice([0, order_qty * 0.2, order_qty * 0.5])
                    open_qty = order_qty - delivered
                    age = random.randint(3, 40)
                    doc_date = (now - datetime.timedelta(days=age)).strftime("%Y-%m-%d")
                    colors = random.randint(0, 8)
                    
                    # Production coverage details
                    covered = random.choice([True, False])
                    prod_order = 90800 + i if covered else None
                    planned = open_qty * 1.05 if covered else 0.0
                    produced = planned * random.choice([0, 0.4, 0.9]) if covered else 0.0
                    prod_status = "R" if covered else None
                    
                    rows.append((
                        po, f"LPO-{po}", cust, f"CUST-{po}", item_code, desc,
                        float(order_qty), float(delivered), float(open_qty),
                        doc_date, age, colors, random.choice([0, 11, 13]),
                        prod_order, planned, produced, prod_status
                    ))
                self.results = rows
                
            elif is_needs:
                columns = [
                    "DocNum", "CUSTOMER", "ProductCode", "ProductDescription", 
                    "Remaining_Qnty", "Microns", "PerfectMicron", "TopWidth", 
                    "BottomWidth", "PerfectWidth", "ObjectWeight", "EstWeightKg", "ProdOrderNum"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                for i in range(1, 20):
                    po = 30300 + i
                    item_code, desc = get_random_item(po)
                    cust = get_random_customer(po)
                    rem = float(random.choice([15000, 30000, 75000]))
                    microns = float(random.choice([30, 35, 40]))
                    width = float(random.choice([180, 240, 320, 410]))
                    obj_w = round(random.uniform(0.002, 0.006), 5)
                    est_kg = rem * obj_w
                    
                    rows.append((
                        po, cust, item_code, desc, rem,
                        microns, microns, width, width, width,
                        obj_w, est_kg, 90800 + i
                    ))
                self.results = rows
                
            else: # Standard PTS_BACKORDER_AGE_SQL
                columns = [
                    "DocNum", "LpoNo", "DocDate", "CUSTOMERID", "CUSTOMER", 
                    "ProductCode", "ProductDescription", "AlsoKnownAs", "Order_Qty", 
                    "Delivered_Qnty", "Remaining_Qnty", "Department", "LineKey", "AgeDays", 
                    "NumColors", "ProductionMethod", "Microns", "PerfectMicron", 
                    "TopWidth", "BottomWidth", "PerfectWidth", "ObjectWeight", "ProdOrderNum"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                now = datetime.datetime.now()
                for i in range(1, 25):
                    po = 30400 + i
                    item_code, desc = get_random_item(po)
                    cust = get_random_customer(po)
                    order_qty = random.choice([20000, 40000, 80000])
                    delivered = random.choice([0, order_qty * 0.3])
                    rem = order_qty - delivered
                    age = random.randint(2, 45)
                    doc_date = (now - datetime.timedelta(days=age)).strftime("%Y-%m-%d")
                    mic = float(random.choice([30, 35, 40]))
                    width = float(random.choice([200, 280, 350, 420]))
                    obj_w = round(random.uniform(0.002, 0.006), 5)
                    
                    rows.append((
                        po, f"LPO-{po}", doc_date, f"CUST-{po}", cust,
                        item_code, desc, "", float(order_qty), float(delivered), float(rem),
                        "SLEEVES", f"LK-{po}", age, random.randint(0, 8), random.choice([0, 11, 13]),
                        mic, mic, width, width, width, obj_w, 90800 + i
                    ))
                self.results = rows

        # 16. PTS AVAILABLE STOCK SQL (BOPP_STOCK_MOVEMENT)
        elif "BOPP_STOCK_MOVEMENT".upper() in q_upper:
            columns = ["Micron", "Width", "CurrentStock", "ItemDescription"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            rows = []
            # Generate stock sheets for standard dimensions
            for mic in [28.0, 30.0, 35.0, 40.0, 50.0]:
                for w in [200.0, 250.0, 300.0, 350.0, 400.0, 450.0, 500.0, 600.0, 800.0]:
                    weight = random.uniform(500.0, 8000.0)
                    desc = f"BOPP film {mic} micron / {w} mm wide"
                    rows.append((mic, w, weight, desc))
            self.results = rows

        # 17. ESTIMATOR QUEUE METERS / WEIGHTS SQL
        elif "ESTWEIGHTKG" in q_upper and "MICRONS" in q_upper and "EKL_OPEN_ORDERS" in q_upper:
            columns = ["NumColors", "Microns", "Width", "EstWeightKg"]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            rows = []
            for i in range(25):
                rows.append((
                    random.choice([0, 2, 4, 6, 8]), 
                    float(random.choice([30, 35, 40])),
                    float(random.choice([200, 300, 400])),
                    random.uniform(50.0, 1800.0)
                ))
            self.results = rows

        # 18. DYNAMIC AVERAGE SPEEDS (ESTIMATOR)
        elif "SPC_PRODUCTION_INFO_REELS".upper() in q_upper and "DATEADD(DAY, -30" in q_upper:
            # We return a single tuple containing a heavy total weight so average speed looks fast/healthy
            self.description = [("TotalWeight", None, None, None, None, None, None)]
            self.results = [(245000.0,)]


        # 19. ESTIMATOR HUMAN CONTEXT FETCH
        elif "boLineText".upper() in q_upper and "EKL_ORDR".upper() in q_upper:
            self.description = [
                ("PriorityIndex", None, None, None, None, None, None),
                ("ProductionComments", None, None, None, None, None, None),
                ("boLineText", None, None, None, None, None, None)
            ]
            self.results = [(
                random.choice([1, 2, 3]),
                "Produce as high priority, client requested fast-track.",
                "Confirmed: partial stock reserved."
            )]

        # 20. MATERIAL INTEGRITY GUARDIAN LIVE STATUS
        elif "SPC_SCANREELS_ROWS".upper() in q_upper or "LIVE_MISMATCH_SQL" in query:
            columns = [
                "MachineID", "ItemCode", "ItemDescription", "LastProdTime", 
                "PerfectMicron", "PerfectWidth", "ScannedMicron", "ScannedWidth", 
                "ScanTime", "ScanMachineName"
            ]
            self.description = [(col, None, None, None, None, None, None) for col in columns]
            
            now = datetime.datetime.now()
            rows = []
            # Printing presses - some match perfectly, some fail to demo warn/critical states
            rows.append((
                "PRINTING_1", "F12-S001", "500ml Soda Bottle Sleeve", 
                now - datetime.timedelta(minutes=15), 35.0, 320.0, 35.0, 320.0, 
                now - datetime.timedelta(minutes=10), "PRINTING_1"
            ))
            rows.append((
                "PRINTING_2", "F12-S002", "1L Yogurt Sleeve", 
                now - datetime.timedelta(minutes=45), 30.0, 240.0, 32.5, 240.0, # Micron Warning (delta 2.5)
                now - datetime.timedelta(minutes=40), "PRINTING_2"
            ))
            rows.append((
                "PRINTING_3", "F12-S003", "2L Cooking Oil Band", 
                now - datetime.timedelta(minutes=25), 40.0, 450.0, 44.2, 449.0, # Critical Warning (delta 4.2)
                now - datetime.timedelta(minutes=20), "PRINTING_3"
            ))
            rows.append((
                "PRINTING_4", "F12-S004", "Premium Chocolate sleeve", 
                now - datetime.timedelta(minutes=90), 30.0, 200.0, 30.0, 199.2, # Width Warning (delta -0.8)
                now - datetime.timedelta(minutes=85), "PRINTING_4"
            ))
            
            # Forming lines - generating standard F1 to F6
            for f in range(1, 7):
                po = 20500 + f
                item_code, desc = get_random_item(po)
                rows.append((
                    f"FORMING_{f}", item_code, desc, 
                    now - datetime.timedelta(minutes=30), 35.0, 300.0, 35.0, 300.0, 
                    now - datetime.timedelta(minutes=22), f"FORMING_{f}"
                ))
            self.results = rows

        # 21. SLITTING GRAPH & SUMMARY HISTORIES (PTS SLITTING ACTIVITY)
        elif "SPL_SLIT_INPUTS" in q_upper or "TOTALWEIGHTRECEIVED" in q_upper or "TYPEA_COUNT" in q_upper or "TOTALORDERQTY" in q_upper:
            # We determine which of the slitting queries was run by columns:
            is_type_a = "TOTALWEIGHTRECEIVED" in q_upper and "REQUIREDWIDTH" not in q_upper
            is_type_b = "REQUIREDWIDTH" in q_upper
            is_hist = "TYPEA_COUNT" in q_upper or "JOBCOUNT" in q_upper
            is_vol = "TOTALORDERQTY" in q_upper or "ORDERVOLUME" in q_upper or ("DOCDATE" in q_upper and "SAP_ODLN_DLN1_DATA_5YRS" in q_upper)

            
            if is_type_a:
                columns = [
                    "SysID", "JobHeader", "TransactionDate", "Micron", "InputWidth", 
                    "WeightIssued", "TotalOutputWidth", "TotalWeightReceived"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                now = datetime.datetime.now()
                for i in range(1, 15):
                    rows.append((
                        i, f"JH-A-{100+i}", now - datetime.timedelta(days=i),
                        float(random.choice([30, 35, 40])), float(random.choice([600, 800, 1000])),
                        random.uniform(200.0, 950.0), float(random.choice([598, 796, 995])),
                        random.uniform(195.0, 948.0)
                    ))
                self.results = rows
                
            elif is_type_b:
                columns = [
                    "SysID", "JobHeader", "TransactionDate", "Micron", "InputWidth", 
                    "WeightIssued", "RequiredWidth", "TotalOutputWidth", "TotalWeightReceived"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                now = datetime.datetime.now()
                for i in range(1, 10):
                    req_w = float(random.choice([550, 750, 950]))
                    # Type B is off-spec, meaning input width is higher than required width
                    input_w = req_w + random.choice([20.0, 50.0])
                    rows.append((
                        i, f"JH-B-{200+i}", now - datetime.timedelta(days=i),
                        float(random.choice([30, 35, 40])), input_w,
                        random.uniform(400.0, 1200.0), req_w, req_w,
                        random.uniform(390.0, 1180.0)
                    ))
                self.results = rows
                
            elif is_hist:
                columns = [
                    "Year", "Month", "JobCount", "TypeA_Count", "TypeB_Count", 
                    "TotalWeight", "TypeA_Weight", "TypeB_Weight"
                ]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                # Return past 6 months
                year = 2026
                months = [5, 4, 3, 2, 1]
                for m in months:
                    rows.append((
                        year, m, random.randint(25, 45), random.randint(18, 30), random.randint(5, 15),
                        random.uniform(12000.0, 32000.0), random.uniform(8000.0, 22000.0), random.uniform(4000.0, 10000.0)
                    ))
                # Add one from late last year
                rows.append((2025, 12, 38, 28, 10, 28000.0, 20000.0, 8000.0))
                self.results = rows
                
            else: # Order volume history
                columns = ["Year", "Month", "OrderVolume"]
                self.description = [(col, None, None, None, None, None, None) for col in columns]
                
                rows = []
                year = 2026
                for m in [5, 4, 3, 2, 1]:
                    rows.append((year, m, random.uniform(18000.0, 48000.0)))
                rows.append((2025, 12, 42000.0))
                self.results = rows

        # 22. Generic fallback - returns empty results to prevent app crashing on unknown checks
        else:
            print(f"[MOCK DB WARNING] Unmatched mock query: {query[:120]}...")
            self.description = [("Dummy", None, None, None, None, None, None)]
            self.results = []
            
        return self

    def fetchall(self):
        return self.results

    def fetchone(self):
        if self._index < len(self.results):
            row = self.results[self._index]
            self._index += 1
            return row
        return None

    def close(self):
        pass
