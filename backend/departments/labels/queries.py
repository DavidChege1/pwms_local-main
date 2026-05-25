# backend/departments/labels/queries.py

MATERIAL_TARGETS_SQL = """
SELECT 
j.DocNum as JobCard, j.Customer, j.ItemCode, j.LabelDescription, j.Substrate as MaterialType, j.TransDate,
(SELECT AVG(tgs.MaterialTotal) FROM [PTL].[dbo].[SPL_JOB_CARD_MATERIAL_TARGETS] tgs where tgs.JobCard = j.SysID) as Production_Sqr_Meters_Target,
Sum(i.InputReelSqrMtrs) as Production_Sqr_Meters_Actual,
(SELECT SUM(tgs.MaterialSettings+tgs.MaterialWaste) FROM [PTL].[dbo].[SPL_JOB_CARD_MATERIAL_TARGETS] tgs where tgs.JobCard = j.SysID) as Production_Waste_Sqr_Mtrs_Target,
(SELECT SUM(w.WasteKgs*6) from  PTL.DBO.SPL_JOB_CARD_WASTE w where w.CardID = j.SysID) as Production_Waste_Sqr_Mtrs_Actual,
avg(j.PlannedQty) Production_Pcs_Labels_Target,
(SELECT SUM(info.GoodLabels) from  PTL.dbo.SPL_PRODUCTION_INFO info where info.DocNum = j.DocNum and info.ActivityID = 1) as Production_Pcs_Labels_Actual,
'Labels' as Department
FROM PTL.dbo.SPL_PRODUCTION_INFO i
 INNER JOIN PTL.dbo.SPL_Job_Card j ON i.DocNum = j.DocNum
 WHERE i.ActivityID = 0 AND (j.TransDate BETWEEN ? AND ?) 
 Group By j.DocNum,j.Customer,j.ItemCode,j.LabelDescription,j.Substrate,j.SysID,j.TransDate
 ORDER BY j.TransDate DESC
"""

MATERIAL_USAGE_SQL = """
SELECT 
i.TransactionDate AS ProductionDate, DATENAME(month,i.TransactionDate) as 'ProductionMonth', Year(i.TransactionDate) as 'ProductionYear',
j.DocNum as JobCard, j.Customer, j.ItemCode, j.LabelDescription, c.Substrate as MaterialType,
Sum(i.ReelSquareMeters) as SquareMeters
FROM PTL.dbo.SPL_REELS_ISSUES i
 INNER JOIN PTL.dbo.SPL_REELS_CHILDREN c ON i.ReelBatchNo = c.ChildReelIndex
 INNER JOIN PTL.dbo.SPL_Job_Card j ON i.JobCard = j.sysid
 WHERE i.TransactionDate between ? and ?
 Group By i.TransactionDate,DATENAME(month,i.TransactionDate),c.Substrate,Year(i.TransactionDate), j.DocNum, j.Customer, j.ItemCode, j.LabelDescription
"""

WASTE_BY_ORDER_SQL = """
SELECT jc.DocNum as JobCard,jc.ItemCode as ProductCode,jc.LabelDescription,  w.TransactionDate as ProductionDate,w.MachineName,w.MachineOperator,w.WasteType,
(cASE w.ShiftID WHEN 0 THEN 'DAY' ELSE 'NIGHT' end) AS ProductionShift,
(Case w.WasteType when 'PRODUCTION WASTE' then sum(w.WasteKgs) else 0 end) as ProductionWaste_Kgs,
(Case w.WasteType when 'TRIM WASTE' then sum(w.WasteKgs) else 0 end) as TrimWaste_Kgs
  FROM PTL.DBO.SPL_JOB_CARD_WASTE w  inner join PTL.DBO.SPL_JOB_CARD jc on w.CardID = jc.SysID
WHERE (w.TransactionDate BETWEEN ? AND ?)
  Group By jc.DocNum,jc.ItemCode,jc.LabelDescription,  w.TransactionDate,w.MachineName,w.MachineOperator,w.WasteType,w.ShiftID
  ORDER BY w.TransactionDate DESC
"""

SLITTING_ACTIVITY_SQL = """
SELECT 
i.TransactionDate as SlitDate,i.RequestID,i.ParentBatchNo,i.DocumentID,
i.ParentWidth,i.ParentLength, ((i.ParentWidth * i.ParentLength)/1000) AS ParentSqrMtrs,i.MaterialType,
o.ChildBatchNo,o.ChildLength,o.ChildSqrMtrs
FROM [PTL].[dbo].[SPL_SLIT_INPUTS] i
INNER JOIN [PTL].[dbo].[SPL_SLIT_OUTPUTS] o ON i.SysID = o.ParentReelID
WHERE (i.TransactionDate BETWEEN ? AND ?)
ORDER BY i.TransactionDate DESC
"""
