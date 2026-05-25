# backend/departments/sleeves/pts/slitting_queries.py
# =============================================================================
# SLITTING ACTIVITY INTELLIGENCE — SQL QUERY DEFINITIONS
# =============================================================================

def _build_where_clause(filters, prefix="o", is_type_b=False):
    """Helper to build dynamic WHERE clauses and extract parameter values."""
    conditions = []
    params = []
    
    if is_type_b:
        conditions.append("(o.Printed = 1 OR (o.Printed = 0 AND g.NumColors > 0))")
    else:
        conditions.append("o.Printed = 0")
        
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")
    if start_date and end_date:
        conditions.append(f"CONVERT(DATE, {prefix}.TransactionDate) BETWEEN ? AND ?")
        params.extend([start_date, end_date])
        
    micron = filters.get("micron")
    if micron is not None and micron != "":
        conditions.append(f"{prefix}.Micron = ?")
        params.append(float(micron))
        
    width = filters.get("width")
    if width is not None and width != "":
        conditions.append(f"{prefix}.Width = ?")
        params.append(float(width))
        
    min_weight = filters.get("min_weight")
    if min_weight is not None and min_weight != "":
        conditions.append(f"{prefix}.WeightIssued >= ?")
        params.append(float(min_weight))
        
    max_weight = filters.get("max_weight")
    if max_weight is not None and max_weight != "":
        conditions.append(f"{prefix}.WeightIssued <= ?")
        params.append(float(max_weight))
        
    job_header = filters.get("job_header")
    if job_header:
        conditions.append(f"CAST({prefix}.JobHeader AS VARCHAR) LIKE ?")
        params.append(f"%{job_header}%")
        
    where_str = " AND ".join(conditions)
    if where_str:
        where_str = "WHERE " + where_str
        
    return where_str, params

# ─────────────────────────────────────────────────────────────────────────────
# QUERY 1 — TYPE A SLITTING (Plain BOPP - MRP Inefficiency)
# ─────────────────────────────────────────────────────────────────────────────
def build_slitting_type_a_sql(filters):
    where_clause, params = _build_where_clause(filters, is_type_b=False)
    
    sql = f"""
    SELECT 
        o.SysID,
        o.JobHeader,
        o.TransactionDate,
        o.Micron,
        o.Width AS InputWidth,
        o.WeightIssued,
        (SELECT SUM(i.Width) FROM [PTK].[dbo].[SPC_SLIT_IN] i WHERE i.ParentID = o.SysID) AS TotalOutputWidth,
        (SELECT SUM(i.WeightReceived) FROM [PTK].[dbo].[SPC_SLIT_IN] i WHERE i.ParentID = o.SysID) AS TotalWeightReceived
    FROM [PTK].[dbo].[SPC_SLIT_OUT] o
    {where_clause}
    ORDER BY o.TransactionDate DESC
    """
    return sql, params

# ─────────────────────────────────────────────────────────────────────────────
# QUERY 2 — TYPE B SLITTING (Printed BOPP - Process Inefficiency)
# ─────────────────────────────────────────────────────────────────────────────
def build_slitting_type_b_sql(filters):
    conditions = ["r.MachineID LIKE 'PR%'", "g.MaterialSize > 0"]
    params = []
    
    start_date = filters.get("start_date")
    end_date = filters.get("end_date")
    if start_date and end_date:
        conditions.append("CONVERT(DATE, r.DateStamp) BETWEEN ? AND ?")
        params.extend([start_date, end_date])
        
    micron = filters.get("micron")
    if micron is not None and micron != "":
        conditions.append("scan.Micron = ?")
        params.append(float(micron))
        
    width = filters.get("width")
    if width is not None and width != "":
        conditions.append("scan.Width = ?")
        params.append(float(width))
        
    min_weight = filters.get("min_weight")
    if min_weight is not None and min_weight != "":
        conditions.append("r.WeightIn >= ?")
        params.append(float(min_weight))
        
    max_weight = filters.get("max_weight")
    if max_weight is not None and max_weight != "":
        conditions.append("r.WeightIn <= ?")
        params.append(float(max_weight))
        
    job_header = filters.get("job_header")
    if job_header:
        conditions.append("CAST(h.ProductionOrder AS VARCHAR) LIKE ?")
        params.append(f"%{job_header}%")
        
    where_str = " AND ".join(conditions)
    if where_str:
        where_str = "WHERE " + where_str
        
    # We add is_off_spec filter directly in Python after execution due to complex logic, 
    # but we could also add it to SQL if needed. Doing it in python keeps the query simple.
    
    sql = f"""
    SELECT 
        r.SysID,
        h.ProductionOrder AS JobHeader,
        r.DateStamp AS TransactionDate,
        scan.Micron,
        scan.Width AS InputWidth,
        r.WeightIn AS WeightIssued,
        g.MaterialSize AS RequiredWidth,
        g.MaterialSize AS TotalOutputWidth,
        (r.WeightIn * (CAST(g.MaterialSize AS FLOAT) / CAST(scan.Width AS FLOAT))) AS TotalWeightReceived
    FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
    INNER JOIN PTK.dbo.SPC_PRODUCTION_INFO_HEADER h ON r.MotherJobID = h.SysID
    LEFT JOIN PTK.dbo.SPC_REELS scan ON LEFT(r.ReelIndex, 7) COLLATE DATABASE_DEFAULT = scan.ReelIndex COLLATE DATABASE_DEFAULT
    LEFT JOIN DKL.dbo.OWOR wo ON h.ProductionOrder = wo.DocNum
    LEFT JOIN PTK.dbo.SPC_GEN g ON wo.ItemCode COLLATE DATABASE_DEFAULT = g.ItemCode COLLATE DATABASE_DEFAULT
    {where_str}
    ORDER BY r.DateStamp DESC
    """
    return sql, params

# ─────────────────────────────────────────────────────────────────────────────
# QUERY 3 — HISTORICAL JOB FREQUENCY (4 Years)
# ─────────────────────────────────────────────────────────────────────────────
def build_slitting_history_sql(filters):
    conditions_a = ["TransactionDate >= DATEADD(year, -4, GETDATE())"]
    params_a = []
    
    conditions_b = ["r.DateStamp >= DATEADD(year, -4, GETDATE())", "r.MachineID LIKE 'PR%'", "g.MaterialSize > 0"]
    params_b = []
    
    is_off_spec = filters.get("is_off_spec")
    if is_off_spec:
        conditions_b.append("scan.Width > g.MaterialSize")
    
    micron = filters.get("micron")
    if micron is not None and micron != "":
        conditions_a.append("Micron = ?")
        params_a.append(float(micron))
        conditions_b.append("scan.Micron = ?")
        params_b.append(float(micron))
        
    width = filters.get("width")
    if width is not None and width != "":
        conditions_a.append("Width = ?")
        params_a.append(float(width))
        conditions_b.append("scan.Width = ?")
        params_b.append(float(width))
        
    job_header = filters.get("job_header")
    if job_header:
        conditions_a.append("CAST(JobHeader AS VARCHAR) LIKE ?")
        params_a.append(f"%{job_header}%")
        conditions_b.append("CAST(h.ProductionOrder AS VARCHAR) LIKE ?")
        params_b.append(f"%{job_header}%")
        
    where_a = " AND ".join(conditions_a)
    where_b = " AND ".join(conditions_b)
    
    sql = f"""
    WITH CombinedActivity AS (
        SELECT 
            TransactionDate,
            SysID,
            WeightIssued,
            'TypeA' as ActivityType
        FROM [PTK].[dbo].[SPC_SLIT_OUT]
        WHERE {where_a}
        
        UNION ALL
        
        SELECT 
            r.DateStamp as TransactionDate,
            r.SysID,
            r.WeightIn as WeightIssued,
            'TypeB' as ActivityType
        FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
        LEFT JOIN PTK.dbo.SPC_REELS scan ON LEFT(r.ReelIndex, 7) COLLATE DATABASE_DEFAULT = scan.ReelIndex COLLATE DATABASE_DEFAULT
        LEFT JOIN PTK.dbo.SPC_PRODUCTION_INFO_HEADER h ON r.MotherJobID = h.SysID
        LEFT JOIN DKL.dbo.OWOR wo ON h.ProductionOrder = wo.DocNum
        LEFT JOIN PTK.dbo.SPC_GEN g ON wo.ItemCode COLLATE DATABASE_DEFAULT = g.ItemCode COLLATE DATABASE_DEFAULT
        WHERE {where_b}
    )
    SELECT 
        YEAR(TransactionDate) as Year,
        MONTH(TransactionDate) as Month,
        COUNT(SysID) as JobCount,
        SUM(CASE WHEN ActivityType = 'TypeA' THEN 1 ELSE 0 END) as TypeA_Count,
        SUM(CASE WHEN ActivityType = 'TypeB' THEN 1 ELSE 0 END) as TypeB_Count,
        SUM(WeightIssued) as TotalWeight,
        SUM(CASE WHEN ActivityType = 'TypeA' THEN WeightIssued ELSE 0 END) as TypeA_Weight,
        SUM(CASE WHEN ActivityType = 'TypeB' THEN WeightIssued ELSE 0 END) as TypeB_Weight
    FROM CombinedActivity
    GROUP BY YEAR(TransactionDate), MONTH(TransactionDate)
    ORDER BY Year DESC, Month DESC
    """
    return sql, params_a + params_b

# ─────────────────────────────────────────────────────────────────────────────
# QUERY 4 — ORDER VOLUMES (4 Years)
# ─────────────────────────────────────────────────────────────────────────────
def build_order_volumes_history_sql(filters):
    conditions = ["o.boDateCreated >= DATEADD(year, -4, GETDATE())"]
    params = []
    
    micron = filters.get("micron")
    if micron is not None and micron != "":
        conditions.append("g.Microns = ?")
        params.append(float(micron))
        
    width = filters.get("width")
    if width is not None and width != "":
        conditions.append("g.PerfectWidth = ?")
        params.append(float(width))
        
    where_str = " AND ".join(conditions)
    
    sql = f"""
    SELECT 
        YEAR(o.boDateCreated) as Year,
        MONTH(o.boDateCreated) as Month,
        SUM(CAST(o.boQntyOrdered AS FLOAT) * CAST(g.PerfectWidth AS FLOAT) * CAST(g.Microns AS FLOAT) * 0.00000091) as TotalOrderQty
    FROM [ELGON].[dbo].[EKL_ORDR] o
    LEFT JOIN [PTK].[dbo].[SPC_GEN] g 
           ON o.boProductCode COLLATE DATABASE_DEFAULT = g.ItemCode COLLATE DATABASE_DEFAULT
    WHERE {where_str}
    GROUP BY YEAR(o.boDateCreated), MONTH(o.boDateCreated)
    ORDER BY Year DESC, Month DESC
    """
    return sql, params
