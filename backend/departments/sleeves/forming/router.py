from typing import List
from collections import deque
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
import pandas as pd
import numpy as np

from backend.database.sql_server import get_sql_conn
from backend.departments.sleeves.forming.queries import (
    PRODUCTION_SQL, 
    WASTE_SQL, 
    VARIANCE_PROD_SQL, 
    get_vs_sql,
    MACHINE_BENCHMARK_SQL,
    DELIVERIES_FETCH_SQL
)
from backend.schemas.forming import FormingReportItem, FormingVarianceResponse
from cachetools import cached, TTLCache

# Cache configurations
forming_report_cache = TTLCache(maxsize=50, ttl=30)
forming_variance_cache = TTLCache(maxsize=50, ttl=30)
benchmark_cache = TTLCache(maxsize=10, ttl=3600) # 1 hour

import warnings
warnings.filterwarnings('ignore', 'pandas only supports SQLAlchemy connectable')

router = APIRouter()

@router.get("/report", response_model=List[FormingReportItem])
async def get_report(start_date: str, end_date: str):
    """
    Fetches the combined production and waste report for the Forming department.
    
    Args:
        start_date: The start date in YYYY-MM-DD format.
        end_date: The end date in YYYY-MM-DD format.
        
    Returns:
        A list of FormingReportItem objects containing production and waste metrics.
    """
    return await run_in_threadpool(_get_report, start_date, end_date)

@router.get("/variance", response_model=FormingVarianceResponse)
async def get_variance(start_date: str, end_date: str, vs_scope: str = "period", order_no: str = None):
    """
    Calculates the variance between production orders and virtual stock receipts.
    
    Args:
        start_date: The start date in YYYY-MM-DD format.
        end_date: The end date in YYYY-MM-DD format.
        vs_scope: Either 'period' (data within window) or 'lifetime' (all data for the order).
        order_no: Optional specific production order to lookup.
        
    Returns:
        A FormingVarianceResponse containing production details, virtual stock, and calculated variance.
    """
    return await run_in_threadpool(_get_variance, start_date, end_date, vs_scope, order_no)

@router.get("/benchmarks")
async def get_benchmarks():
    """
    Returns the 6-month historical waste benchmarks for forming machines.
    """
    return await run_in_threadpool(_get_benchmarks)

@cached(cache=benchmark_cache)
def _get_benchmarks():
    conn = None
    try:
        conn = get_sql_conn()
        df = pd.read_sql(MACHINE_BENCHMARK_SQL, conn)
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()


@cached(cache=forming_report_cache)
def _get_report(start_date: str, end_date: str) -> List[dict]:
    """
    Internal logic to fetch and merge production/waste data using Pandas.
    """
    conn = None
    try:
        conn = get_sql_conn()
        prod_df = pd.read_sql(PRODUCTION_SQL, conn, params=[start_date, end_date])
        waste_df = pd.read_sql(WASTE_SQL, conn, params=[start_date, end_date])
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()
        
    prod_df['PROD_DATE'] = prod_df['PROD_DATE'].astype(str)
    waste_df['PROD_DATE'] = waste_df['PROD_DATE'].astype(str)
    
    merged = pd.merge(prod_df, waste_df, on=['MACHINE', 'PROD_DATE'], how='outer')
    merged['daily_waste'] = merged['daily_waste'].fillna(0)
    
    for col in ['DAY_PCS', 'NIGHT_PCS', 'DAY_WEIGHT', 'NIGHT_WEIGHT']:
        if col in merged.columns:
            merged[col] = merged[col].fillna(0)
            
    merged['TOTAL_PCS'] = merged['DAY_PCS'] + merged['NIGHT_PCS']
    merged['TOTAL_WEIGHT'] = pd.to_numeric(merged['DAY_WEIGHT'] + merged['NIGHT_WEIGHT'], errors='coerce').fillna(0)
    
    return merged.replace({pd.NA: None, float('nan'): None, float('inf'): None, float('-inf'): None}).to_dict(orient="records")


@cached(cache=forming_variance_cache)
def _get_variance(start_date: str, end_date: str, vs_scope: str = "period", order_no: str = None) -> dict:
    """
    Internal logic to fetch production and virtual stock data and calculate variance.
    """
    conn = None
    try:
        conn = get_sql_conn()
        
        # 1. Fetch Virtual Stock Details First
        vs_sql = get_vs_sql(vs_scope)
        
        local_start = "2020-01-01" if (order_no or vs_scope == "lifetime") else start_date
        local_end = "2030-12-31" if (order_no or vs_scope == "lifetime") else end_date
        
        if vs_scope == "lifetime":
            vs_params = [local_start, local_end]
        else:
            vs_params = [start_date, end_date, start_date, end_date]
            
        if order_no:
            # Inject order filter
            vs_sql = vs_sql.replace("Where (CONVERT(DATE, H.TransactionDate) between ? and ?)", f"Where h.ProductionOrder = ?")
            if vs_scope == "lifetime":
                vs_params = [order_no]
            else:
                vs_params = [start_date, end_date, order_no]

        vs_df = pd.read_sql(vs_sql, conn, params=vs_params)
        
        # 2. Fetch Production & Delivery Details (Only if we have Virtual Stock data)
        prod_df = pd.DataFrame()
        deliv_df = pd.DataFrame()
        
        if not vs_df.empty:
            # Extract unique production orders to selectively target
            orders = vs_df['ProductionOrder'].dropna().unique().tolist()
            if order_no and order_no not in orders:
                try:
                    orders.append(int(order_no))
                except ValueError:
                    orders.append(order_no)
            
            # Fetch production details only for these specific orders!
            if orders:
                placeholders = ','.join(['?'] * len(orders))
                p_sql = VARIANCE_PROD_SQL.replace(
                    "AND r.MachineID like 'FORM%'",
                    f"AND r.MachineID like 'FORM%' AND h.ProductionOrder IN ({placeholders})"
                )
                p_params = [local_start, local_end] + orders
                prod_df = pd.read_sql(p_sql, conn, params=p_params)
            
            # 2b. Fetch Deliveries independently with chunked IN clause
            item_codes = vs_df['ItemCode'].dropna().unique().tolist()
            if item_codes:
                # We need all deliveries after the earliest order's PostDate in the dataset
                earliest_post_date = vs_df['PostDate'].min()
                if pd.isna(earliest_post_date):
                    earliest_post_date = start_date
                
                # Chunk to maximum of 1,000 parameters to protect against 2,100 SQL parameter limits
                chunk_size = 1000
                deliv_dfs = []
                for i in range(0, len(item_codes), chunk_size):
                    chunk = item_codes[i:i + chunk_size]
                    placeholders = ','.join(['?'] * len(chunk))
                    deliv_sql = DELIVERIES_FETCH_SQL.format(item_codes_placeholder=placeholders)
                    deliv_params = chunk + [earliest_post_date]
                    chunk_df = pd.read_sql(deliv_sql, conn, params=deliv_params)
                    deliv_dfs.append(chunk_df)
                
                if deliv_dfs:
                    deliv_df = pd.concat(deliv_dfs, ignore_index=True)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

    # 3. Calculate Variance
    variance_list = []
    if not vs_df.empty:
        # Aggregate to order level for variance calculation
        agg_df = vs_df.groupby('ProductionOrder').agg({
            'ProductDesc': 'first',
            'OrderStatus': 'first',
            'TargetQnty_Pcs': 'first',
            'TargetWght_kgs': 'first',
            'CompletedQnty_Pcs': 'first',   # from OWOR.CmpltQty
            'CompletedWght_kgs': 'first',   # from OWOR.ProductActualWeight
            'VStockReceipt_Pcs': 'sum',     # sum across all receipt dates in range
            'VStockWght_kgs':    'sum',     # sum across all receipt dates in range
            'ItemCode': 'first',
            'PostDate': 'first'
        }).reset_index()

        # Calculate Floor Production per Order for "Physical Yield"
        floor_agg = pd.DataFrame(columns=['ProductionOrder', 'SleevesProducedQty'])
        if not prod_df.empty:
            floor_agg = prod_df.groupby('ProductionOrder').agg({'SleevesProducedQty': 'sum'}).reset_index()
        
        agg_df = pd.merge(agg_df, floor_agg, on='ProductionOrder', how='left').fillna(0)

        for col in ['CompletedQnty_Pcs', 'CompletedWght_kgs', 'VStockReceipt_Pcs', 'VStockWght_kgs', 'SleevesProducedQty']:
            agg_df[col] = pd.to_numeric(agg_df[col], errors='coerce').fillna(0)
            
        # --- FIFO Delivery Allocation ---
        agg_df['Delivered_Pcs'] = 0
        
        if not deliv_df.empty:
            # Group deliveries by ItemCode, keeping them sorted by DocDate
            # Use deque for O(1) performance during FIFO allocation
            deliv_dict = {}
            for _, row in deliv_df.iterrows():
                item = row['ItemCode']
                if item not in deliv_dict:
                    deliv_dict[item] = deque()
                deliv_dict[item].append({
                    'DocDate': pd.to_datetime(row['DocDate']),
                    'Quantity': row['Quantity']
                })
            
            # Sort orders chronologically to apply FIFO correctly
            agg_df = agg_df.sort_values(by=['ItemCode', 'PostDate'])
            
            for idx, order in agg_df.iterrows():
                item = order['ItemCode']
                post_date = pd.to_datetime(order['PostDate'])
                # CAP LOGIC: Use physical warehouse receipt (VS) as the source of truth for capacity.
                # Previously this was capped at min(SAP, VS), which caused "Ghost Stock" when SAP lagged.
                remaining_capacity = order['VStockReceipt_Pcs']
                
                if item in deliv_dict and remaining_capacity > 0:
                    deliveries = deliv_dict[item]
                    delivered_for_this_order = 0
                    
                    while remaining_capacity > 0 and len(deliveries) > 0:
                        deliv = deliveries[0]
                        # Only apply delivery if it happened ON or AFTER the order's PostDate
                        if deliv['DocDate'] < post_date:
                            # Delivery is from before this order existed
                            deliveries.popleft()
                            continue
                            
                        if deliv['Quantity'] <= remaining_capacity:
                            delivered_for_this_order += deliv['Quantity']
                            remaining_capacity -= deliv['Quantity']
                            deliveries.popleft()
                        else:
                            delivered_for_this_order += remaining_capacity
                            deliv['Quantity'] -= remaining_capacity
                            remaining_capacity = 0
                            
                    agg_df.at[idx, 'Delivered_Pcs'] = int(round(delivered_for_this_order))
        
        # --------------------------------

        agg_df['VarianceQty'] = agg_df['CompletedQnty_Pcs'] - agg_df['VStockReceipt_Pcs']
        agg_df['VarianceWeight'] = agg_df['CompletedWght_kgs'] - agg_df['VStockWght_kgs']
        agg_df['DeliveredVariance'] = agg_df['VStockReceipt_Pcs'] - agg_df['Delivered_Pcs']
        
        # Warehouse Yield: How much of physical production reached the warehouse?
        agg_df['WarehouseYield'] = (agg_df['VStockReceipt_Pcs'] / agg_df['SleevesProducedQty'] * 100).replace([np.inf, -np.inf], 0).fillna(0)

        def diagnosis_helper(row):
            v_qty = row['VarianceQty']
            sap_qty = row['CompletedQnty_Pcs']
            vs_qty = row['VStockReceipt_Pcs']
            del_qty = row['Delivered_Pcs']
            
            # 1. Orphaned Stock (Admin Closure)
            if sap_qty == 0 and vs_qty > 0:
                return "Orphaned Stock (Admin Closure)", "#ef4444", "ORPHAN"
            # 2. In Stock (Pending Delivery) - Prioritized for operational visibility
            elif (vs_qty - del_qty) > 500:
                return "In Stock (Pending Delivery)", "#3b82f6", "PENDING_DELIVERY"
            # 3. Scanning Failure
            elif v_qty > 100:
                return "Scanning Failure", "#f97316", "SCAN_FAILURE"
            # 4. SAP Completion Lag
            elif v_qty < -100:
                return "SAP Completion Lag", "#f59e0b", "SAP_LAG"
            # 5. Perfectly Synchronized
            elif abs(v_qty) <= 100:
                return "Perfectly Synchronized", "#10b981", "SYNCED"
            return "Unknown Discrepancy", "#6b7280", "UNKNOWN"

        agg_df[['Diagnosis', 'DiagnosisColor', 'SyncStatus']] = agg_df.apply(
            lambda r: pd.Series(diagnosis_helper(r)), axis=1
        )
        
        variance_list = agg_df.replace({pd.NA: None, float('nan'): None}).to_dict(orient="records")

    # 4. Final Data Prep
    if 'TransactionDate' in prod_df.columns:
        prod_df['TransactionDate'] = prod_df['TransactionDate'].astype(str)

    return {
        "production": [],
        "virtual_stock": [],
        "variance": variance_list
    }


