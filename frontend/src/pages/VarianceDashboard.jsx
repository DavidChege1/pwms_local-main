import React, { useState, useEffect, useMemo } from 'react';
import { sleevesApi } from '../services/api';
import { 
  Search, Filter, Download, AlertCircle, Info, CheckCircle2, 
  Package, TrendingUp, AlertTriangle, X, ChevronRight, BarChart3, Layers
} from 'lucide-react';

export default function VarianceDashboard() {
  const [data, setData] = useState({ production: [], virtual_stock: [], variance: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [activeTab, setActiveTab] = useState('variance'); // 'variance' or 'inventory'
  
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = `${today.substring(0, 7)}-01`;
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [vsScope, setVsScope] = useState('lifetime');
  const [searchQuery, setSearchQuery] = useState('');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sleevesApi.getVarianceReport(
        startDate, 
        endDate, 
        vsScope, 
        null
      );
      setData(result);
    } catch (e) {
      console.error("Failed to fetch variance data", e);
      setError(e.message || "Could not connect to the backend.");
      setData({ production: [], virtual_stock: [], variance: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getDiagnosisColor = (row) => {
    if (row.SyncStatus) {
      switch (row.SyncStatus) {
        case 'ORPHAN': return '#ef4444';
        case 'PENDING_DELIVERY': return '#3b82f6';
        case 'SCAN_FAILURE': return '#f97316';
        case 'SAP_LAG': return '#f59e0b';
        case 'SYNCED': return '#10b981';
        default: return '#6b7280';
      }
    }
    return row.DiagnosisColor || '#6b7280';
  };

  const filteredVariance = useMemo(() => {
    return data.variance.filter(row => {
      const matchesSearch = 
        String(row.ProductionOrder).toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(row.ProductDesc).toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || row.OrderStatus === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [data.variance, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    // Deduplicate by ProductionOrder to prevent double-counting order-level totals (like CompletedQnty_Pcs)
    const orderMap = new Map();
    
    filteredVariance.forEach(row => {
      const orderId = row.ProductionOrder;
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          CompletedQnty_Pcs: row.CompletedQnty_Pcs || 0,
          VStockReceipt_Pcs: row.VStockReceipt_Pcs || 0,
          Delivered_Pcs: row.Delivered_Pcs || 0,
          SleevesProducedQty: row.SleevesProducedQty || 0
        });
      }
    });

    const dedupedData = Array.from(orderMap.values());
    
    const totalProd = dedupedData.reduce((sum, r) => sum + r.CompletedQnty_Pcs, 0);
    const totalVs = dedupedData.reduce((sum, r) => sum + r.VStockReceipt_Pcs, 0);
    const totalDelivered = dedupedData.reduce((sum, r) => sum + r.Delivered_Pcs, 0);
    const totalFloor = dedupedData.reduce((sum, r) => sum + r.SleevesProducedQty, 0);
    
    // Weighted Average Yield
    const avgYield = totalFloor > 0 ? (totalVs / totalFloor) * 100 : 0;
    const criticalCount = dedupedData.filter(r => Math.abs(r.CompletedQnty_Pcs - r.VStockReceipt_Pcs) > 1000).length;

    return {
      totalProd,
      totalVs,
      totalDelivered,
      totalFloor,
      avgYield,
      criticalCount,
      netVariance: totalProd - totalVs
    };
  }, [filteredVariance]);

  const inventoryList = useMemo(() => {
    const inventoryMap = {};
    
    // filteredVariance is already aggregated by ProductionOrder in the backend.
    // We just need to aggregate these orders by ItemCode for the Inventory view.
    filteredVariance.forEach(row => {
      const pendingStock = (row.VStockReceipt_Pcs || 0) - (row.Delivered_Pcs || 0);
      if (pendingStock > 0) {
        // Robust key selection: handle varying property casing from different backend versions
        const itemCode = row.ItemCode || row.itemCode || row.ProductID || row.productID || row.ProductDesc || 'UNKNOWN';
        if (!inventoryMap[itemCode]) {
          inventoryMap[itemCode] = {
             itemCode: itemCode,
             product: row.ProductDesc || 'Unknown Product',
             quantity: 0,
             floorQty: 0,
             sapQty: 0,
             vstockQty: 0,
             deliveredQty: 0
          };
        }
        inventoryMap[itemCode].quantity += pendingStock;
        inventoryMap[itemCode].floorQty += (row.SleevesProducedQty || 0);
        inventoryMap[itemCode].sapQty += (row.CompletedQnty_Pcs || 0);
        inventoryMap[itemCode].vstockQty += (row.VStockReceipt_Pcs || 0);
        inventoryMap[itemCode].deliveredQty += (row.Delivered_Pcs || 0);
      }
    });

    let result = Object.values(inventoryMap);
    
    if (inventorySearchQuery.trim()) {
      const q = inventorySearchQuery.toLowerCase();
      result = result.filter(item => 
        item.product.toLowerCase().includes(q) || 
        item.itemCode.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.quantity - a.quantity);
  }, [filteredVariance, inventorySearchQuery]);

  const exportCSV = () => {
    if (!filteredVariance.length) return;
    
    const headers = ["Order #", "Status", "Description", "Prod (Pcs)", "VS Receipt", "Delivered Total", "Variance", "Floor Qty", "Yield %", "Diagnosis"];
    const rows = filteredVariance.map(r => [
      r.ProductionOrder,
      r.OrderStatus,
      r.ProductDesc,
      r.CompletedQnty_Pcs,
      r.VStockReceipt_Pcs,
      r.Delivered_Pcs,
      r.VarianceQty,
      r.SleevesProducedQty,
      r.WarehouseYield.toFixed(1) + '%',
      r.Diagnosis
    ]);

    const content = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Variance_Report_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="variance-dashboard animate-in">
      {/* Header & Help Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Production Variance Analysis
          </h2>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Comparing official SAP completions with trusted Virtual Stock receipts.</p>
        </div>
      </div>

      {/* Controls Section */}
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label className="input-label">Date Range</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="modern-input" />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="modern-input" />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '180px' }}>
          <label className="input-label">Scanned Scope</label>
          <select value={vsScope} onChange={(e) => setVsScope(e.target.value)} className="modern-input">
            <option value="period">Current Window Only</option>
            <option value="lifetime">Full Order History</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <label className="input-label">Order Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="modern-input">
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open Orders</option>
            <option value="CLOSED">Closed Orders</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button onClick={() => fetchData()} disabled={loading} className="btn-primary" style={{ minWidth: '140px' }}>
            {loading ? 'Analyzing...' : 'Run Report'}
          </button>
          <button onClick={exportCSV} disabled={!filteredVariance.length} className="btn-secondary" title="Export to CSV">
            <Download size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2rem', borderBottom: '2px solid #e2e8f0', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('variance')}
          style={{ padding: '0.5rem 0.5rem 1rem 0.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'variance' ? '3px solid #6366f1' : '3px solid transparent', color: activeTab === 'variance' ? '#4338ca' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}>
          Variance Analysis
        </button>
        <button 
          onClick={() => setActiveTab('inventory')}
          style={{ padding: '0.5rem 0.5rem 1rem 0.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'inventory' ? '3px solid #0ea5e9' : '3px solid transparent', color: activeTab === 'inventory' ? '#0369a1' : '#64748b', fontWeight: 800, cursor: 'pointer', fontSize: '1rem', transition: 'all 0.2s' }}>
          Live Warehouse Inventory
        </button>
      </div>

      {activeTab === 'variance' ? (
        <>
          {/* Search & Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <div className="search-container" style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={22} />
          <input 
            type="text" 
            placeholder="Search by Order ID or Product... (e.g. 55621)" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="stat-pill" style={{ background: stats.avgYield >= 98 ? '#ecfdf5' : '#fff7ed', border: stats.avgYield >= 98 ? '1px solid #10b98133' : '1px solid #f9731633' }}>
           <BarChart3 size={20} style={{ color: stats.avgYield >= 98 ? '#059669' : '#d97706' }} />
           <span style={{ fontWeight: 700, color: '#1e293b' }}>{stats.avgYield.toFixed(1)}%</span>
           <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Warehouse Yield</span>
        </div>
      </div>

      {/* Analytics Summary Cards */}
      {filteredVariance.length > 0 && (
        <div className="pipeline-container animate-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', background: 'white', padding: '2rem 2.5rem', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
          {/* Stage 1 */}
          <div className="pipeline-stage" style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <TrendingUp size={16} /> 1. Floor Prod
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{stats.totalFloor.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem', fontWeight: 600 }}>Physical pieces made</div>
          </div>

          <div className="pipeline-arrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.5 }}>
            <ChevronRight size={32} style={{ color: '#cbd5e1' }} />
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: stats.avgYield >= 98 ? '#10b981' : '#f59e0b', marginTop: '0.2rem', backgroundColor: stats.avgYield >= 98 ? '#ecfdf5' : '#fff7ed', padding: '0.2rem 0.6rem', borderRadius: '99px' }}>
              {stats.avgYield.toFixed(1)}% Yield
            </div>
          </div>

          {/* Stage 2 */}
          <div className="pipeline-stage" style={{ flex: 1, paddingLeft: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0ea5e9', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <Package size={16} /> 2. V-Stock Scans
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0369a1', lineHeight: 1 }}>{stats.totalVs.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem', fontWeight: 600 }}>Trusted warehouse receipts</div>
          </div>

          <div className="pipeline-arrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.5 }}>
            <ChevronRight size={32} style={{ color: '#cbd5e1' }} />
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: stats.netVariance === 0 ? '#10b981' : '#ef4444', marginTop: '0.2rem', backgroundColor: stats.netVariance === 0 ? '#ecfdf5' : '#fef2f2', padding: '0.2rem 0.6rem', borderRadius: '99px' }}>
              {stats.netVariance === 0 ? 'Synced' : `${Math.abs(stats.netVariance).toLocaleString()} Gap`}
            </div>
          </div>

          {/* Stage 3 */}
          <div className="pipeline-stage" style={{ flex: 1, paddingLeft: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#8b5cf6', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <CheckCircle2 size={16} /> 3. SAP Completion
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#5b21b6', lineHeight: 1 }}>{stats.totalProd.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem', fontWeight: 600 }}>Official financial record</div>
          </div>

          <div className="pipeline-arrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 0.5 }}>
            <ChevronRight size={32} style={{ color: '#cbd5e1' }} />
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6366f1', marginTop: '0.2rem', backgroundColor: '#eef2ff', padding: '0.2rem 0.6rem', borderRadius: '99px' }}>
              {Math.max(0, stats.totalVs - stats.totalDelivered).toLocaleString()} In Whs
            </div>
          </div>

          {/* Stage 4 */}
          <div className="pipeline-stage" style={{ flex: 1, paddingLeft: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              <Download size={16} /> 4. Delivered
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#047857', lineHeight: 1 }}>{stats.totalDelivered.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem', fontWeight: 600 }}>Actual shipments out</div>
          </div>
        </div>
      )}

      {/* Main Data Table */}
      <div className="premium-table-container">
        <table>
          <thead>
            <tr>
              <th>Order Details</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>SAP Prod</th>
              <th style={{ textAlign: 'right' }}>VS Scan</th>
              <th style={{ textAlign: 'right' }}>Delivered</th>
              <th style={{ textAlign: 'right' }}>Variance</th>
              <th style={{ textAlign: 'center' }}>Yield %</th>
              <th>Diagnosis / Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredVariance.length > 0 ? (
              filteredVariance.map((row, i) => (
                <tr key={i} className="table-row-hover">
                  <td>
                    <div style={{ fontWeight: 800, color: '#1e293b' }}>#{row.ProductionOrder}</div>
                    <div className="truncated-text" style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '280px' }} title={row.ProductDesc}>
                      {row.ProductDesc}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${row.OrderStatus === 'OPEN' ? 'status-open' : 'status-closed'}`}>
                      {row.OrderStatus}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                    {row.CompletedQnty_Pcs?.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#4338ca' }}>
                    {row.VStockReceipt_Pcs?.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#6366f1' }}>
                    {row.Delivered_Pcs?.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: row.VarianceQty < -100 ? '#dc2626' : (row.VarianceQty > 100 ? '#ea580c' : '#10b981') }}>
                    {row.VarianceQty > 0 ? '+' : ''}{row.VarianceQty?.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="yield-mini-chart">
                      <div className="yield-fill" style={{ width: `${Math.min(row.WarehouseYield, 100)}%`, background: row.WarehouseYield >= 98 && row.WarehouseYield <= 102 ? '#10b981' : (row.WarehouseYield > 102 ? '#6366f1' : (row.WarehouseYield > 80 ? '#f59e0b' : '#ef4444')) }}></div>
                      <span className="yield-text">{row.WarehouseYield.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: getDiagnosisColor(row), fontWeight: 700, fontSize: '0.85rem' }}>
                       {row.Diagnosis === 'Perfectly Synchronized' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                       {row.Diagnosis}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: '6rem 2rem', textAlign: 'center' }}>
                   {loading ? (
                     <div className="loader-container">
                        <div className="loader-spinner"></div>
                        <p style={{ color: '#64748b', marginTop: '1rem' }}>Calculating variances across records...</p>
                     </div>
                   ) : (
                     <div style={{ opacity: 0.5 }}>
                        <Package size={48} style={{ margin: '0 auto 1rem' }} />
                        <p>No production orders found for the selected filters.</p>
                     </div>
                   )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>
      ) : (
      /* Live Warehouse Inventory Tab Content */
      <div className="animate-in" style={{ background: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: '#e0f2fe', padding: '0.75rem', borderRadius: '12px', color: '#0ea5e9' }}>
              <Layers size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>Live Warehouse Inventory</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                Total Unshipped: <strong style={{ color: '#0369a1' }}>{inventoryList.reduce((sum, i) => sum + i.quantity, 0).toLocaleString()}</strong> pcs
              </p>
            </div>
          </div>
          <div className="search-container" style={{ position: 'relative', minWidth: '300px' }}>
            <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
            <input 
              type="text" 
              placeholder="Filter specific product..." 
              value={inventorySearchQuery}
              onChange={(e) => setInventorySearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        {vsScope !== 'lifetime' && (
          <div style={{ marginBottom: '2rem', padding: '1rem 1.5rem', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#b45309' }}>Partial Data Scope Active</h4>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#92400e', lineHeight: 1.4 }}>
                You are currently viewing inventory produced between <strong>{startDate}</strong> and <strong>{endDate}</strong>. To perform a complete warehouse audit, please change the Scanned Scope above to "Full Order History".
              </p>
            </div>
          </div>
        )}

        {inventoryList.length > 0 ? (
          <div className="premium-table-container">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '1rem 1.5rem' }}>Product Description</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>Total Floor Pcs</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>Total SAP Pcs</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem' }}>Total Delivered</th>
                  <th style={{ textAlign: 'center', padding: '1rem 1.5rem' }}>Shipment Progress</th>
                  <th style={{ textAlign: 'right', padding: '1rem 1.5rem', background: '#f0f9ff', color: '#0369a1' }}>Live In-Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {inventoryList.map((item) => {
                  const deliveryPct = item.vstockQty > 0 ? Math.min((item.deliveredQty / item.vstockQty) * 100, 100) : 0;
                  return (
                    <tr key={item.itemCode} className="table-row-hover" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1rem 1.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>{item.product}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{item.floorQty.toLocaleString()}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>{item.sapQty.toLocaleString()}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>{item.deliveredQty.toLocaleString()}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                        <div style={{ position: 'relative', width: '100px', height: '14px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', margin: '0 auto' }}>
                          <div style={{ height: '100%', width: `${deliveryPct}%`, background: deliveryPct >= 100 ? '#10b981' : '#6366f1', transition: 'width 0.5s' }}></div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>{deliveryPct.toFixed(0)}% Shipped</div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', background: '#f8fafc' }}>
                        <span style={{ display: 'inline-block', padding: '0.4rem 0.8rem', background: '#e0f2fe', color: '#0284c7', borderRadius: '8px', fontWeight: 800, fontSize: '1rem', fontFamily: 'monospace' }}>
                          {item.quantity.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: '#f8fafc' }}>
                  <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'right', fontWeight: 700, color: '#64748b', fontSize: '1rem' }}>Total Unshipped Stock</td>
                  <td style={{ padding: '1.5rem', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '1.4rem' }}>
                    {inventoryList.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px' }}>
            <Package size={64} style={{ opacity: 0.2, margin: '0 auto 1.5rem' }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>No unshipped inventory found matching criteria.</p>
          </div>
        )}
      </div>
      )}

      {/* Custom Styles */}
      <style>{`
        .animate-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 20px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
        }

        .input-label { display: block; margin-bottom: 0.6rem; font-size: 0.85rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .modern-input {
          width: 100%;
          padding: 0.8rem 1rem;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: white;
          font-size: 0.95rem;
          color: #1e293b;
          transition: border-color 0.2s;
        }
        .modern-input:focus { border-color: #6366f1; outline: none; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }

        .btn-primary {
          background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%);
          color: white; border: none; padding: 0.8rem 2rem; border-radius: 12px;
          font-weight: 700; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4); }
        .btn-secondary {
          background: #f8fafc; border: 1px solid #e2e8f0; color: #475569;
          padding: 0.8rem; border-radius: 12px; cursor: pointer;
        }

        .search-input {
          width: 100%; padding: 1.2rem 1.2rem 1.2rem 3.5rem;
          background: white; border: 1px solid #e2e8f0; border-radius: 16px;
          font-size: 1.05rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }

        .stat-pill {
          display: flex; align-items: center; gap: 1rem; padding: 0 1.5rem;
          border-radius: 16px; min-width: 200px;
        }

        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
        .analytic-card {
          padding: 1.5rem; background: white; border-radius: 20px; border: 1px solid #f1f5f9;
          display: flex; gap: 1.2rem; align-items: center; transition: transform 0.2s;
        }
        .analytic-card:hover { transform: translateY(-3px); }
        .card-icon { padding: 1rem; border-radius: 14px; }
        .card-content .label { display: block; font-size: 0.85rem; color: #64748b; font-weight: 600; }
        .card-content .value { display: block; font-size: 1.5rem; font-weight: 800; color: #1e293b; margin: 0.2rem 0; }
        .card-content .value small { font-size: 0.9rem; color: #94a3b8; }
        .card-content .subtext { display: block; font-size: 0.75rem; color: #94a3b8; }

        .premium-table-container { background: white; border-radius: 24px; border: 1px solid #f1f5f9; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8fafc; padding: 1.2rem 1.5rem; text-align: left; font-size: 0.8rem; font-weight: 800; color: #64748b; text-transform: uppercase; }
        td { padding: 1.2rem 1.5rem; border-bottom: 1px solid #f1f5f9; }
        .table-row-hover:hover { background: #fdfdff; }

        .status-badge { padding: 0.4rem 1rem; border-radius: 99px; font-size: 0.75rem; font-weight: 800; }
        .status-open { background: #fffbeb; color: #b45309; border: 1px solid #fef3c7; }
        .status-closed { background: #f0fdf4; color: #15803d; border: 1px solid #dcfce7; }

        .yield-mini-chart { position: relative; width: 100px; height: 18px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin: 0 auto; }
        .yield-fill { height: 100%; transition: width 0.6s ease-out; }
        .yield-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 900; color: #1e293b; mix-blend-mode: multiply; }

        .modal-overlay { 
          position: fixed; 
          inset: 0; 
          background: rgba(15, 23, 42, 0.4); 
          backdrop-filter: blur(8px); 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 9999; 
        }
        .modal-content { 
          background: white; 
          border-radius: 28px; 
          width: 90%; 
          max-width: 650px; 
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); 
          border: 1px solid rgba(255, 255, 255, 0.2);
          position: relative;
          z-index: 10000;
        }
        .shadow-premium { box-shadow: 0 20px 40px rgba(0,0,0,0.2) !important; }
        .modal-header { padding: 1.5rem 2rem; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 1.4rem; font-weight: 800; }
        .close-btn { background: none; border: none; cursor: pointer; color: #94a3b8; }
        .modal-body { padding: 2rem; }
        .modal-body section { margin-bottom: 2rem; }
        .modal-body h4 { font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; color: #1e293b; }
        .modal-body p { color: #64748b; line-height: 1.6; }
        .modal-body ul li { color: #64748b; margin-bottom: 0.5rem; }

        .diagnosis-grid { border-top: 1px solid #f1f5f9; padding-top: 1.5rem; display: flex; flex-direction: column; gap: 1.2rem; }
        .diag-item { display: flex; gap: 1rem; }
        .diag-item .dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }

        .loader-spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
