# backend/departments/sleeves/forming/queries.py

PRODUCTION_SQL = """
DECLARE @startDate DATE = ?;
DECLARE @endDate   DATE = ?;

WITH Machines AS
(
    SELECT 'FORMING_1'  MachineName UNION ALL
    SELECT 'FORMING_2'  UNION ALL
    SELECT 'FORMING_3'  UNION ALL
    SELECT 'FORMING_4'  UNION ALL
    SELECT 'FORMING_5'  UNION ALL
    SELECT 'FORMING_6'  UNION ALL
    SELECT 'FORMING_7'  UNION ALL
    SELECT 'FORMING_8'  UNION ALL
    SELECT 'FORMING_9'  UNION ALL
    SELECT 'FORMING_10' UNION ALL
    SELECT 'FORMING_11' UNION ALL
    SELECT 'FORMING_12' UNION ALL
    SELECT 'FORMING_13'
),
Dates AS
(
    SELECT @startDate TransactionDate
    UNION ALL
    SELECT DATEADD(DAY,1,TransactionDate)
    FROM Dates
    WHERE TransactionDate < @endDate
)
SELECT
    d.TransactionDate AS PROD_DATE,
    REPLACE(m.MachineName, 'FORMING_', 'F') as MACHINE,
    ISNULL(SUM(CASE WHEN r.JobShift = 0 THEN r.GoodSleeves ELSE 0 END),0) AS DAY_PCS,
    ISNULL(ROUND(SUM(CASE WHEN r.JobShift = 0 THEN r.SleeveWeight ELSE 0 END),0),0) AS DAY_WEIGHT,
    ISNULL(SUM(CASE WHEN r.JobShift <> 0 THEN r.GoodSleeves ELSE 0 END),0) AS NIGHT_PCS,
    ISNULL(ROUND(SUM(CASE WHEN r.JobShift <> 0 THEN r.SleeveWeight ELSE 0 END),0),0) AS NIGHT_WEIGHT
FROM Dates d
CROSS JOIN Machines m
LEFT JOIN PTK.dbo.SPC_PRODUCTION_INFO_REELS r
       ON m.MachineName = r.MachineID
       AND CONVERT(date,r.DateStamp) = d.TransactionDate
       AND r.GoodSleeves > 0
LEFT JOIN PTK.dbo.SPC_PRODUCTION_INFO_HEADER h
       ON h.SysID = r.MotherJobID AND r.GoodSleeves > 0
LEFT JOIN PTK.dbo.SPC_GEN sp 
      ON sp.ItemCode COLLATE DATABASE_DEFAULT = h.ItemCode
GROUP BY d.TransactionDate, m.MachineName
ORDER BY d.TransactionDate, CAST(REPLACE(m.MachineName,'FORMING_','') AS INT)
OPTION (MAXRECURSION 400);
"""

WASTE_SQL = """
SELECT 
    x.ProductionDate AS PROD_DATE,
    REPLACE(x.MachineID, 'FORMING_', 'F') AS MACHINE,
    SUM(x.WasteKgs) AS daily_waste
FROM PTK.dbo.RECYCLER_WASTE x 
WHERE x.DepartmentName = 'SLEEVES' 
  AND (CAST(x.ProductionDate AS DATE) BETWEEN ? AND ?)
GROUP BY CAST(x.ProductionDate AS DATE), x.MachineID
"""

# --- VARIANCE ANALYSIS QUERIES ---

VARIANCE_PROD_SQL = """
SELECT
    CONVERT(date, r.DateStamp) as TransactionDate,
    r.MachineID as MachineName,
    h.ProductionOrder,
    h.ItemCode as ProductCode,
    h.ItemDescription as ProductDescription,
    (Case r.JobShift WHEN 0 THEN 'DAY' ELSE 'NIGHT' END) AS DayShift,
    sum(r.GoodSleeves) as SleevesProducedQty,
    Round(sum(r.SleeveWeight),0) as SleevesTotalWeight
FROM PTK.dbo.SPC_PRODUCTION_INFO_HEADER h
INNER JOIN PTK.dbo.SPC_PRODUCTION_INFO_REELS r ON h.SysID = r.MotherJobID
WHERE (CONVERT(date, r.DateStamp) Between ? and ?) 
  AND r.GoodSleeves > 0 
  AND r.MachineID like 'FORM%'
GROUP BY CONVERT(date, r.DateStamp), h.ProductionOrder, h.ItemCode, h.ItemDescription, r.MachineID, r.JobShift
"""

def get_vs_sql(vs_scope: str):
    """
    Returns the Virtual Stock query optimized with a CTE to avoid the N+1 performance bottleneck.
    'period'   : only VS receipts within the selected date window.
    'lifetime' : full lifetime VS receipts for qualifying orders.
    """
    vs_date_filter = ""
    if vs_scope == "period":
        vs_date_filter = "AND (r2.TransactionDate between ? and ?)"
        
    return f"""
    WITH OrderVStock AS (
        SELECT 
            h2.ProductionOrder,
            SUM(r2.LineQuantity) as VStockReceipt_Pcs,
            CAST(SUM(r2.Lineweight) as int) as VStockWght_kgs
        FROM ELGON.dbo.EKL_VS_ROWS r2 
        JOIN ELGON.dbo.EKL_VS_HEADER h2 on h2.SysID = r2.Header 
        WHERE 1=1 {vs_date_filter}
        GROUP BY h2.ProductionOrder
    )
    SELECT 
        CONVERT(varchar(10), H.TransactionDate, 23) as ExactDate,
        h.ProductionOrder as ProductionOrder,
        h.ProductID as ProductID,
        H.ProductDesc as ProductDesc,
        (CASE ord.[Status] when 'R' Then 'OPEN' ELSE 'CLOSED' END) AS OrderStatus,
        MAX(CAST(ord.PlannedQty AS INT)) as TargetQnty_Pcs,
        MAX(CAST(ord.ProductTargetWeight AS int)) as TargetWght_kgs,
        MAX(cast(ord.CmpltQty as int)) as CompletedQnty_Pcs,
        MAX(round(ord.ProductActualWeight,0)) as CompletedWght_kgs,
        ISNULL(MAX(ovs.VStockReceipt_Pcs), 0) as VStockReceipt_Pcs,
        ISNULL(MAX(ovs.VStockWght_kgs), 0) as VStockWght_kgs,
        ord.ItemCode,
        ord.PostDate
    FROM Elgon.dbo.EKL_VS_ROWS r 
    JOIN Elgon.dbo.EKL_VS_HEADER H on H.SysID = r.Header
    JOIN DKL.dbo.OWOR ord on ord.DocNum = H.ProductionOrder
    LEFT JOIN OrderVStock ovs ON ovs.ProductionOrder = H.ProductionOrder
    Where (CONVERT(DATE, H.TransactionDate) between ? and ?)
    group by 
        CONVERT(varchar(10), H.TransactionDate, 23),
        H.ProductionOrder, H.ProductID, H.ProductDesc, ord.[Status], ord.DocNum, ord.ItemCode, ord.CardCode, ord.PostDate
    """

# --- HISTORICAL BENCHMARK QUERIES (6-MONTH ROLLING) ---

MACHINE_BENCHMARK_SQL = """
WITH ProdData AS (
    SELECT 
        r.MachineID,
        SUM(r.SleeveWeight) as TotalWeight
    FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
    WHERE r.DateStamp >= DATEADD(month, -6, GETDATE())
      AND r.GoodSleeves > 0
    GROUP BY r.MachineID
),
WasteData AS (
    SELECT 
        w.MachineID,
        SUM(w.WasteKgs) as TotalWaste
    FROM PTK.dbo.RECYCLER_WASTE w
    WHERE w.ProductionDate >= DATEADD(month, -6, GETDATE())
      AND w.DepartmentName = 'SLEEVES'
    GROUP BY w.MachineID
)
SELECT 
    p.MachineID,
    REPLACE(p.MachineID, 'FORMING_', 'F') as MACHINE,
    p.TotalWeight,
    ISNULL(w.TotalWaste, 0) as TotalWaste,
    CASE 
        WHEN p.TotalWeight > 0 THEN (ISNULL(w.TotalWaste, 0) / p.TotalWeight)
        ELSE 0 
    END as WasteRatio
FROM ProdData p
LEFT JOIN WasteData w ON p.MachineID = w.MachineID
WHERE p.MachineID LIKE 'FORM%'
"""

DELIVERIES_FETCH_SQL = """
-- NOTE: We multiply d.Quantity by 1000 because deliveries are currently stored in thousands.
-- This is a temporary fix. We are adjusting the SSMS data to include the deliveries in thousands,
-- so this multiplier may need to be reverted in the future.
SELECT 
    d.ItemCode COLLATE SQL_Latin1_General_CP1_CI_AS as ItemCode,
    CONVERT(date, d.DocDate) as DocDate,
    SUM(d.Quantity * 1000) as Quantity
FROM [ELGON].[dbo].[SAP_ODLN_DLN1_DATA_5YRS] d
WHERE d.ItemCode COLLATE SQL_Latin1_General_CP1_CI_AS IN ({item_codes_placeholder})
  AND d.DocDate >= ?
GROUP BY d.ItemCode COLLATE SQL_Latin1_General_CP1_CI_AS, CONVERT(date, d.DocDate)
ORDER BY CONVERT(date, d.DocDate) ASC
"""
