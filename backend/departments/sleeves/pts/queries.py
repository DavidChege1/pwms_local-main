# backend/departments/sleeves/pts/queries.py
# =============================================================================
# PTS BACK ORDER INTELLIGENCE — SQL QUERY DEFINITIONS
# =============================================================================
# Source Table  : ELGON.dbo.EKL_OPEN_ORDERS
#   A PTS mirror of approved SAP Sales Orders that have not been delivered in full.
#   A record here means: Remaining_Qnty > 0 (Open Back Order).
#
# Support Tables:
#   PTK.dbo.SPC_GEN   — Product spec sheet (dimensions, colors, production method)
#   DKL.dbo.OWOR      — SAP Production Orders (planned / in-progress jobs)
#
# ProductionMethod Enum (from legacy C# system):
#   0  = Clear (Plain Sleeve)
#   1  = FrontSingleImage
#   2  = BackSingleImage
#   3  = FoldedOneFaceUp
#   4  = FoldedTwoFaceUp
#   5  = BackOneFaceUpFrontClear
#   6  = BackTwoFaceUpFrontClear
#   7  = BackThreeFaceUpFrontClear
#   8  = Sheet
#   9  = BagType
#   10 = AFLLabel
#   11 = AFLSleeve
#   12 = Plain_Roll
#   13 = Printed_Roll
#   14 = Plain_Sheet
#   15 = Printed_Sheet
#   16 = Plain_Sleeve
#   17 = Front_Back_DoubleWeb
#   18 = Back_ONLY_DoubleWeb
#   19 = Front_ONLY_DoubleWeb
#   20 = Front_DoubleImage_2Ups
#   21 = Back_DoubleImage_2Ups
#
# PLAIN_METHOD_IDS = {0, 12, 14, 16}  — methods with no ink / no color
# All others with NumColors > 0 are treated as "Printed"
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
# QUERY 1 — BACK ORDER AGE ANALYSIS (Dashboard 1)
# ─────────────────────────────────────────────────────────────────────────────
# Returns one flat row per open order line with:
#   - Order identity (DocNum, LpoNo, Customer, Product)
#   - Quantities (ordered, delivered, remaining/open)
#   - Age in days since DocDate
#   - Product spec data (NumColors, ProductionMethod) from SPC_GEN for
#     the Printed / Plain classification slicer
# ─────────────────────────────────────────────────────────────────────────────
PTS_BACKORDER_AGE_SQL = """
SELECT
    o.DocNum                                                    AS DocNum,
    o.[Lpo No] COLLATE DATABASE_DEFAULT                        AS LpoNo,
    CONVERT(varchar(10), o.DocDate, 23)                         AS DocDate,
    o.CUSTOMERID COLLATE DATABASE_DEFAULT                      AS CUSTOMERID,
    o.CUSTOMER COLLATE DATABASE_DEFAULT                        AS CUSTOMER,
    o.ProductCode COLLATE DATABASE_DEFAULT                     AS ProductCode,
    o.ProductDescription COLLATE DATABASE_DEFAULT              AS ProductDescription,
    o.AlsoKnownAs COLLATE DATABASE_DEFAULT                     AS AlsoKnownAs,
    o.Order_Qty,
    o.Delivered_Qnty,
    o.Remaining_Qnty,
    o.Department COLLATE DATABASE_DEFAULT                      AS Department,
    o.LineKey COLLATE DATABASE_DEFAULT                         AS LineKey,
    DATEDIFF(DAY, o.DocDate, GETDATE())                         AS AgeDays,
    ISNULL(g.NumColors,         0)                              AS NumColors,
    ISNULL(g.ProductionMethod,  0)                              AS ProductionMethod,
    ISNULL(g.Microns,           0)                              AS Microns,
    ISNULL(g.PerfectMicron,    0)                              AS PerfectMicron,
    ISNULL(g.TopWidth,          0)                              AS TopWidth,
    ISNULL(g.BottomWidth,       0)                              AS BottomWidth,
    ISNULL(g.PerfectWidth,      0)                              AS PerfectWidth,
    ISNULL(g.ObjectWeight,      0)                              AS ObjectWeight,
    wo.ProdOrderNum                                             AS ProdOrderNum
FROM ELGON.dbo.EKL_OPEN_ORDERS o
LEFT JOIN PTK.dbo.SPC_GEN g
       ON o.ProductCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
LEFT JOIN (
    SELECT SapDocNum, ItemCode, MAX(DocNum) AS ProdOrderNum
    FROM DKL.dbo.OWOR
    WHERE [Status] = 'R'
    GROUP BY SapDocNum, ItemCode
) wo ON wo.SapDocNum = o.DocNum AND wo.ItemCode COLLATE DATABASE_DEFAULT = o.ProductCode COLLATE DATABASE_DEFAULT
WHERE o.Remaining_Qnty > 0
  AND o.Department = 'SLEEVES'

UNION ALL

-- Stock Production Orders (Status='R', No Origin SO)
SELECT
    wo.DocNum                                                   AS DocNum,
    'STOCK' COLLATE DATABASE_DEFAULT                           AS LpoNo,
    CONVERT(varchar(10), wo.PostDate, 23)                       AS DocDate,
    'STOCK' COLLATE DATABASE_DEFAULT                           AS CUSTOMERID,
    'STOCK PRODUCTION' COLLATE DATABASE_DEFAULT                AS CUSTOMER,
    wo.ItemCode COLLATE DATABASE_DEFAULT                        AS ProductCode,
    itm.ItemName COLLATE DATABASE_DEFAULT                       AS ProductDescription,
    '' COLLATE DATABASE_DEFAULT                                 AS AlsoKnownAs,
    wo.PlannedQty                                               AS Order_Qty,
    wo.CmpltQty                                                 AS Delivered_Qnty,
    CASE WHEN wo.PlannedQty > wo.CmpltQty 
         THEN wo.PlannedQty - wo.CmpltQty 
         ELSE 0 END                                             AS Remaining_Qnty,
    'SLEEVES' COLLATE DATABASE_DEFAULT                         AS Department,
    '' COLLATE DATABASE_DEFAULT                                 AS LineKey,
    DATEDIFF(DAY, wo.PostDate, GETDATE())                       AS AgeDays,
    ISNULL(g.NumColors,         0)                              AS NumColors,
    ISNULL(g.ProductionMethod,  0)                              AS ProductionMethod,
    ISNULL(g.Microns,           0)                              AS Microns,
    ISNULL(g.PerfectMicron,     0)                              AS PerfectMicron,
    ISNULL(g.TopWidth,          0)                              AS TopWidth,
    ISNULL(g.BottomWidth,       0)                              AS BottomWidth,
    ISNULL(g.PerfectWidth,      0)                              AS PerfectWidth,
    ISNULL(g.ObjectWeight,      0)                              AS ObjectWeight,
    wo.DocNum                                                   AS ProdOrderNum
FROM DKL.dbo.OWOR wo
INNER JOIN DKL.dbo.OITM itm ON wo.ItemCode = itm.ItemCode
LEFT JOIN PTK.dbo.SPC_GEN g
       ON wo.ItemCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
WHERE wo.Status = 'R' 
  AND wo.OriginNum IS NULL
  AND itm.ItmsGrpCod IN (109, 116)
  AND (wo.PlannedQty - wo.CmpltQty) > 0
  AND NOT (wo.CmpltQty >= wo.PlannedQty AND DATEDIFF(DAY, wo.PostDate, GETDATE()) > 14)

ORDER BY AgeDays DESC
"""


# ─────────────────────────────────────────────────────────────────────────────
# QUERY 2 — MATERIAL REQUIREMENTS (Dashboard 2)
# ─────────────────────────────────────────────────────────────────────────────
# Returns one flat row per open order line with full spec data attached.
# The backend groups these rows by Microns × avg(Width) to produce the
# material summary grid. The raw rows are kept for the drill-down detail view.
#
# Weight estimate formula:
#   EstWeightKg = Remaining_Qnty × ObjectWeight (Kg/piece)
# ObjectWeight is sourced from PTK.dbo.SPC_GEN (per-piece weight in kilograms).
# ─────────────────────────────────────────────────────────────────────────────
PTS_MATERIAL_NEEDS_SQL = """
SELECT
    o.DocNum,
    o.CUSTOMER COLLATE DATABASE_DEFAULT                        AS CUSTOMER,
    o.ProductCode COLLATE DATABASE_DEFAULT                     AS ProductCode,
    o.ProductDescription COLLATE DATABASE_DEFAULT              AS ProductDescription,
    o.Remaining_Qnty,
    ISNULL(g.Microns,       0)                                  AS Microns,
    ISNULL(g.PerfectMicron, 0)                                  AS PerfectMicron,
    ISNULL(g.TopWidth,      0)                                  AS TopWidth,
    ISNULL(g.BottomWidth,   0)                                  AS BottomWidth,
    ISNULL(g.PerfectWidth,  0)                                  AS PerfectWidth,
    ISNULL(g.ObjectWeight,  0)                                  AS ObjectWeight,
    (o.Remaining_Qnty * ISNULL(g.ObjectWeight, 0))             AS EstWeightKg,
    wo.ProdOrderNum                                             AS ProdOrderNum
FROM ELGON.dbo.EKL_OPEN_ORDERS o
LEFT JOIN PTK.dbo.SPC_GEN g
       ON o.ProductCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
LEFT JOIN (
    SELECT SapDocNum, ItemCode, MAX(DocNum) AS ProdOrderNum
    FROM DKL.dbo.OWOR
    WHERE [Status] = 'R'
    GROUP BY SapDocNum, ItemCode
) wo ON wo.SapDocNum = o.DocNum AND wo.ItemCode COLLATE DATABASE_DEFAULT = o.ProductCode COLLATE DATABASE_DEFAULT
WHERE o.Remaining_Qnty > 0
  AND o.Department = 'SLEEVES'

UNION ALL

-- Stock Jobs for Material Requirements
SELECT
    wo.DocNum,
    'STOCK PRODUCTION' COLLATE DATABASE_DEFAULT                AS CUSTOMER,
    wo.ItemCode COLLATE DATABASE_DEFAULT                        AS ProductCode,
    itm.ItemName COLLATE DATABASE_DEFAULT                       AS ProductDescription,
    (wo.PlannedQty - wo.CmpltQty)                               AS Remaining_Qnty,
    ISNULL(g.Microns,       0)                                  AS Microns,
    ISNULL(g.PerfectMicron, 0)                                  AS PerfectMicron,
    ISNULL(g.TopWidth,      0)                                  AS TopWidth,
    ISNULL(g.BottomWidth,   0)                                  AS BottomWidth,
    ISNULL(g.PerfectWidth,  0)                                  AS PerfectWidth,
    ISNULL(g.ObjectWeight,  0)                                  AS ObjectWeight,
    ((wo.PlannedQty - wo.CmpltQty) * ISNULL(g.ObjectWeight, 0)) AS EstWeightKg,
    wo.DocNum                                                   AS ProdOrderNum
FROM DKL.dbo.OWOR wo
INNER JOIN DKL.dbo.OITM itm ON wo.ItemCode = itm.ItemCode
LEFT JOIN PTK.dbo.SPC_GEN g
       ON wo.ItemCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
WHERE wo.Status = 'R' 
  AND wo.OriginNum IS NULL
  AND itm.ItmsGrpCod IN (109, 116)
  AND (wo.PlannedQty - wo.CmpltQty) > 0
  AND NOT (wo.CmpltQty >= wo.PlannedQty AND DATEDIFF(DAY, wo.PostDate, GETDATE()) > 14)

ORDER BY Microns, TopWidth
"""


# ─────────────────────────────────────────────────────────────────────────────
# QUERY 3 — PRODUCTION COVERAGE (Dashboard 3)
# ─────────────────────────────────────────────────────────────────────────────
# Links open back orders to any currently OPEN production orders (Status='R')
# in DKL.dbo.OWOR that share the same ItemCode.
#
# A LEFT JOIN is used so that back orders with no matching production order
# are still returned — those are the UNCOVERED backlog rows.
#
# NumColors is used for the Color Burden metric:
#   Burden = jobs with NumColors >= 5 as a % of total open jobs.
#   Amber threshold: 30%.  Red threshold: 50%.
# ─────────────────────────────────────────────────────────────────────────────
PTS_PRODUCTION_COVERAGE_SQL = """
SELECT
    combined.SalesOrderNum,
    combined.LpoNo,
    combined.CUSTOMER,
    combined.CUSTOMERID,
    combined.ProductCode,
    combined.ProductDescription,
    combined.Order_Qty,
    combined.Delivered_Qnty,
    combined.OpenQty,
    combined.DocDate,
    combined.AgeDays,
    ISNULL(g.NumColors,         0)                              AS NumColors,
    ISNULL(g.ProductionMethod,  0)                              AS ProductionMethod,
    wo.DocNum                                                   AS ProdOrderNum,
    ISNULL(wo.PlannedQty,   0)                                  AS PlannedQty,
    ISNULL(wo.CmpltQty,     0)                                  AS ProducedQty,
    wo.[Status] COLLATE DATABASE_DEFAULT                       AS ProdStatus
FROM (
    -- Branch A: Sales Orders
    SELECT
        o.DocNum                                                AS SalesOrderNum,
        o.[Lpo No] COLLATE DATABASE_DEFAULT                    AS LpoNo,
        o.CUSTOMER COLLATE DATABASE_DEFAULT                    AS CUSTOMER,
        o.CUSTOMERID COLLATE DATABASE_DEFAULT                  AS CUSTOMERID,
        o.ProductCode COLLATE DATABASE_DEFAULT                 AS ProductCode,
        o.ProductDescription COLLATE DATABASE_DEFAULT          AS ProductDescription,
        o.Order_Qty,
        o.Delivered_Qnty,
        o.Remaining_Qnty                                        AS OpenQty,
        o.DocDate,
        DATEDIFF(DAY, o.DocDate, GETDATE())                     AS AgeDays
    FROM ELGON.dbo.EKL_OPEN_ORDERS o
    WHERE o.Remaining_Qnty > 0 AND o.Department = 'SLEEVES'

    UNION ALL

    -- Branch B: Stock Orders (treated as their own coverage)
    SELECT
        wo.DocNum                                               AS SalesOrderNum,
        'STOCK' COLLATE DATABASE_DEFAULT                       AS LpoNo,
        'STOCK PRODUCTION' COLLATE DATABASE_DEFAULT            AS CUSTOMER,
        'STOCK' COLLATE DATABASE_DEFAULT                       AS CUSTOMERID,
        wo.ItemCode COLLATE DATABASE_DEFAULT                    AS ProductCode,
        itm.ItemName COLLATE DATABASE_DEFAULT                   AS ProductDescription,
        wo.PlannedQty                                           AS Order_Qty,
        wo.CmpltQty                                             AS Delivered_Qnty,
        (wo.PlannedQty - wo.CmpltQty)                           AS OpenQty,
        wo.PostDate                                             AS DocDate,
        DATEDIFF(DAY, wo.PostDate, GETDATE())                   AS AgeDays
    FROM DKL.dbo.OWOR wo
    INNER JOIN DKL.dbo.OITM itm ON wo.ItemCode = itm.ItemCode
    WHERE wo.Status = 'R' 
      AND wo.OriginNum IS NULL 
      AND itm.ItmsGrpCod IN (109, 116)
      AND (wo.PlannedQty - wo.CmpltQty) > 0
) combined
LEFT JOIN PTK.dbo.SPC_GEN g
       ON combined.ProductCode COLLATE DATABASE_DEFAULT
        = g.ItemCode   COLLATE DATABASE_DEFAULT
LEFT JOIN (
    SELECT
        SapDocNum,
        ItemCode,
        MAX(DocNum)      AS DocNum,
        SUM(PlannedQty)  AS PlannedQty,
        SUM(CmpltQty)    AS CmpltQty,
        MAX([Status])    AS [Status]
    FROM DKL.dbo.OWOR
    WHERE [Status] = 'R'
      AND NOT (CmpltQty >= PlannedQty AND DATEDIFF(DAY, PostDate, GETDATE()) > 14)
    GROUP BY SapDocNum, ItemCode
) wo ON 
    (combined.CUSTOMERID != 'STOCK' AND wo.SapDocNum = combined.SalesOrderNum AND wo.ItemCode COLLATE DATABASE_DEFAULT = combined.ProductCode COLLATE DATABASE_DEFAULT)
    OR 
    (combined.CUSTOMERID = 'STOCK' AND wo.ItemCode COLLATE DATABASE_DEFAULT = combined.ProductCode COLLATE DATABASE_DEFAULT AND wo.SapDocNum IS NULL)
ORDER BY g.NumColors DESC, combined.OpenQty DESC
"""


# ─────────────────────────────────────────────────────────────────────────────
# QUERY 4 — WAREHOUSE STOCK AVAILABILITY (Stock Ledger Source)
# ─────────────────────────────────────────────────────────────────────────────
# Fetches stock levels from the official Store Ledger (BOPP_STOCK_MOVEMENT).
# This replaces the unreliable 'Expensed' scanner table to avoid ghost stock.
# We pick the MAX(StockDate) to get the most recent daily snapshot.
# ─────────────────────────────────────────────────────────────────────────────
PTS_AVAILABLE_STOCK_SQL = """
SELECT 
    Micron,
    Width,
    CurrentStock AS Weight,
    ItemDescription
FROM [ELGON].[dbo].[BOPP_STOCK_MOVEMENT]
WHERE StockDate = (SELECT MAX(StockDate) FROM [ELGON].[dbo].[BOPP_STOCK_MOVEMENT])
  AND Micron IS NOT NULL
  AND Width > 0
"""
