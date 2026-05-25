# backend/departments/sleeves/pts/mismatch_queries.py

# Machine Mapping configuration as requested by user
# { ScanMachineName: DisplayName(LegacyName) }
MACHINE_MAPPING = {
    "PRINTING_1":  "Printing_1 (Uflex)",
    "PRINTING_2":  "Printing_2 (G1)",
    "PRINTING_3":  "Printing_3 (G2)",
    "PRINTING_4":  "Printing_4 (Roto)",
    "PRINTING-G4": "Printing_G4 (G2-Legacy)",
    # Forming machines automatic mapping F1 -> FORMING_1
}

LIVE_MISMATCH_SQL = """
WITH ActiveJobs AS (
    -- Get the most recent item processed on each machine in the last 12 hours
    SELECT 
        r.MachineID,
        h.ItemCode,
        h.ItemDescription,
        MAX(r.DateStamp) as LastProdTime
    FROM PTK.dbo.SPC_PRODUCTION_INFO_REELS r
    JOIN PTK.dbo.SPC_PRODUCTION_INFO_HEADER h ON r.MotherJobID = h.SysID
    WHERE r.DateStamp >= DATEADD(hour, -12, GETDATE())
    GROUP BY r.MachineID, h.ItemCode, h.ItemDescription
),
LatestScans AS (
    -- Get the last scanned reel for each machine
    SELECT 
        rows.MachineName,
        rows.Micron as ScannedMicron,
        rows.width as ScannedWidth,
        rows.Timestamp as ScanTime
    FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY MachineName ORDER BY Timestamp DESC) as rn
        FROM PTK.dbo.SPC_SCANREELS_ROWS
        WHERE Timestamp >= DATEADD(day, -1, GETDATE())
    ) rows
    WHERE rows.rn = 1
)
SELECT 
    aj.MachineID,
    aj.ItemCode,
    aj.ItemDescription,
    aj.LastProdTime,
    g.PerfectMicron,
    g.PerfectWidth,
    ls.ScannedMicron,
    ls.ScannedWidth,
    ls.ScanTime,
    ls.MachineName as ScanMachineName
FROM ActiveJobs aj
JOIN PTK.dbo.SPC_GEN g ON aj.ItemCode COLLATE DATABASE_DEFAULT = g.ItemCode COLLATE DATABASE_DEFAULT
LEFT JOIN LatestScans ls ON 
    (
        -- Map PR1 to PRINTING_1, PR2 to PRINTING_2 etc
        (aj.MachineID LIKE 'PR%' AND ls.MachineName = 'PRINTING_' + SUBSTRING(aj.MachineID, 3, 2))
        OR 
        -- Map F1 to FORMING_1, F2 to FORMING_2 etc
        (aj.MachineID LIKE 'F%' AND aj.MachineID NOT LIKE 'PR%' AND ls.MachineName = 'FORMING_' + SUBSTRING(aj.MachineID, 2, 2))
        OR
        -- Handle specific legacy mappings if needed (e.g. G1/G2)
        (aj.MachineID = 'G1' AND ls.MachineName = 'PRINTING_2')
        OR
        (aj.MachineID = 'G2' AND ls.MachineName = 'PRINTING_3')
    )
ORDER BY aj.MachineID
"""
