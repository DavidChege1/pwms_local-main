# backend/departments/sleeves/printing/queries.py

BOPP_MONITOR_SQL = """
SELECT
    CONVERT(varchar(10), r.DateStamp, 23)   AS TransactionDate,
    CONVERT(varchar(19), r.DateStamp, 120)  AS ProductionTime,
    CASE
        WHEN DATEPART(HOUR, r.DateStamp) >= 6
         AND DATEPART(HOUR, r.DateStamp) < 18 THEN 'Day'
        ELSE 'Night'
    END                                      AS ProductionShift,
    r.MachineID,
    h.ProductionOrder,
    h.ItemCode,
    h.ItemDescription,
    r.ReelIndex,
    r.WeightIn                               AS BoppWeight,
    scan.SPEC                                AS Spec
FROM  [PTK].[dbo].[SPC_PRODUCTION_INFO_REELS] r
INNER JOIN [PTK].[dbo].[SPC_PRODUCTION_INFO_HEADER] h
        ON r.MotherJobID = h.SysID
LEFT  JOIN [PTK].[dbo].[SPC_REELS] scan
        ON LEFT(r.ReelIndex, 7) COLLATE DATABASE_DEFAULT = scan.ReelIndex COLLATE DATABASE_DEFAULT
WHERE (CONVERT(DATE, r.DateStamp) BETWEEN ? AND ?)
  AND r.MachineID LIKE 'PR%'
ORDER BY r.DateStamp DESC, r.MachineID, r.ReelIndex
"""

# --- HISTORICAL BENCHMARK QUERIES (6-MONTH ROLLING) ---

PRINTING_BENCHMARK_SQL = """
WITH ProdData AS (
    SELECT 
        CASE 
            WHEN r.MachineID = 'PRINTING-G4' THEN 'PRINTING_3'
            ELSE r.MachineID 
        END as MachineID,
        SUM(r.WeightIn) as TotalWeight
    FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
    WHERE r.DateStamp >= DATEADD(month, -6, GETDATE())
      AND r.MachineID LIKE 'PR%'
    GROUP BY 
        CASE 
            WHEN r.MachineID = 'PRINTING-G4' THEN 'PRINTING_3'
            ELSE r.MachineID 
        END
),
WasteData AS (
    SELECT 
        CASE 
            WHEN w.MachineID = 'U FLEX' THEN 'PRINTING_1'
            WHEN w.MachineID = 'G1' THEN 'PRINTING_2'
            WHEN w.MachineID = 'G2' THEN 'PRINTING_3'
            WHEN w.MachineID = 'ROTO FLEX' THEN 'PRINTING_4'
            WHEN w.MachineID = 'ECO FLEX' THEN 'ECO_FLEX'
            ELSE w.MachineID 
        END as MappedMachineID,
        SUM(w.WasteKgs) as TotalWaste
    FROM PTK.dbo.RECYCLER_WASTE w
    WHERE w.ProductionDate >= DATEADD(month, -6, GETDATE())
      AND w.DepartmentName = 'SLEEVES'
    GROUP BY 
        CASE 
            WHEN w.MachineID = 'U FLEX' THEN 'PRINTING_1'
            WHEN w.MachineID = 'G1' THEN 'PRINTING_2'
            WHEN w.MachineID = 'G2' THEN 'PRINTING_3'
            WHEN w.MachineID = 'ROTO FLEX' THEN 'PRINTING_4'
            WHEN w.MachineID = 'ECO FLEX' THEN 'ECO_FLEX'
            ELSE w.MachineID 
        END
)
SELECT 
    p.MachineID,
    p.TotalWeight,
    ISNULL(w.TotalWaste, 0) as TotalWaste,
    CASE 
        WHEN p.TotalWeight > 0 THEN (ISNULL(w.TotalWaste, 0) / p.TotalWeight)
        ELSE 0 
    END as WasteRatio
FROM ProdData p
LEFT JOIN WasteData w ON p.MachineID = w.MappedMachineID
"""

# --- EFFICIENCY & PLANNED METERS QUERIES ---
# BUG FIX (BUG-20260417-01, 2026-04-18): Date filters below MUST use
# CONVERT(DATE, ...) to truncate datetime to date-only before comparison.
# Without this, passing end_date='2026-04-17' is interpreted as
# '2026-04-17 00:00:00', silently excluding every reel produced after
# midnight on the last day. The BOPP_MONITOR_SQL already does this correctly.
# Diagnosed gap: 20 reels / 122,000 m lost on boundary day.

PRINTING_EFFICIENCY_SQL = """
SELECT 
    prod.DocNum as ProductionOrder,
    prod.ItemCode,
    spec.ProductDescription,
    spec.ProductionMethod,
    spec.NumColors,
    spec.Height,
    spec.TopWidth,
    spec.BottomWidth,
    spec.Microns,
    spec.MaterialSize,
    spec.ObjectWeight,
    CONVERT(varchar(10), prod.CreateDate, 23) as OrderDate,
    prod.PlannedQty,
    r.MachineID,
    r.ReelIndex,
    scan.SPEC as RawSpec,
    CAST(ISNULL(r.WeightIn, 0) AS FLOAT) as ReelWeight,
    CONVERT(varchar(10), r.DateStamp, 23) as ProductionDate
FROM DKL.dbo.OWOR prod
LEFT JOIN [PTK].[dbo].[SPC_GEN] spec 
    ON prod.ItemCode COLLATE DATABASE_DEFAULT = spec.ItemCode COLLATE DATABASE_DEFAULT
LEFT JOIN [PTK].[dbo].[SPC_PRODUCTION_INFO_HEADER] h
    ON prod.DocNum = h.ProductionOrder
LEFT JOIN [PTK].[dbo].[SPC_PRODUCTION_INFO_REELS] r
    ON h.SysID = r.MotherJobID
    AND r.MachineID LIKE 'PR%'
    AND CONVERT(DATE, r.DateStamp) BETWEEN ? AND ?
LEFT JOIN [PTK].[dbo].[SPC_REELS] scan 
    ON LEFT(r.ReelIndex, 7) COLLATE DATABASE_DEFAULT = scan.ReelIndex COLLATE DATABASE_DEFAULT
WHERE (CONVERT(DATE, prod.CreateDate) BETWEEN ? AND ? OR r.ReelIndex IS NOT NULL)
  AND (prod.ItemCode LIKE 'F12%' OR r.MachineID LIKE 'PR%')
ORDER BY prod.CreateDate DESC
"""

