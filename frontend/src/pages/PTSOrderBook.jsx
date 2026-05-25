/**
 * PTSOrderBook.jsx
 * =============================================================================
 * PTS BACK ORDER INTELLIGENCE — Main Dashboard Component
 * =============================================================================
 * Contains 3 sub-tab dashboards. Data is the live SLEEVES order book from
 * ELGON.dbo.EKL_OPEN_ORDERS (SAP mirror). No date filter — always shows
 * the current open position.
 *
 * Sub-tabs:
 *   1. "Back Order Age"        — Age analysis with 4 slicer modes
 *   2. "Material Requirements" — BOPP material needs grouped by Micron × Width
 *   3. "Production Coverage"   — Open orders vs. planned production + colour burden
 *
 * Plain/Printed classification:
 *   PLAIN_METHOD_IDS = {0, 12, 14, 16} AND NumColors === 0
 *   (Mirrors the backend _is_plain() helper)
 *
 * Colour Burden thresholds:
 *   AMBER: ≥ 30% of open lines have NumColors ≥ 5
 *   RED  : ≥ 50%
 * =============================================================================
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ptsApi } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Clock, Layers, Target, AlertTriangle, Package,
  Users, Filter as FilterIcon, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle, XCircle, TrendingUp, Database,
  Activity, X, RotateCw
} from 'lucide-react';
import InfoTooltip from '../components/InfoTooltip';

// ─── Colour palette ────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const AGE_COLOR = (days) => {
  if (days <= 7)  return '#10b981';   // green
  if (days <= 30) return '#f59e0b';   // amber
  return '#ef4444';                    // red
};

const AGE_BG = (days) => {
  if (days <= 7)  return '#f0fdf4';
  if (days <= 30) return '#fffbeb';
  return '#fef2f2';
};

// Plain production method IDs (matches backend PLAIN_METHOD_IDS)
const PLAIN_METHOD_IDS = new Set([0, 12, 14, 16]);
const isPlain = (method, colors) => PLAIN_METHOD_IDS.has(method) && colors === 0;

// ─── Shared number formatter ───────────────────────────────────────────────
const fmt = (n, dec = 0) =>
  (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec });


// =============================================================================
// DASHBOARD 1 — BACK ORDER AGE
// =============================================================================
function BackOrderAge({ data, loading }) {
  const [slicerMode, setSlicerMode]   = useState('item');     // 'item' | 'customer' | 'type' | 'search'
  const [typeFilter, setTypeFilter]   = useState('all');       // 'all' | 'printed' | 'plain'
  const [intentFilter, setIntentFilter] = useState('customer'); // 'all' | 'customer' | 'stock'
  const [searchTerm, setSearchTerm]   = useState('');
  const [custFilter, setCustFilter]   = useState('All');

  const customers = useMemo(() => ['All', ...new Set(data.map(r => r.CUSTOMER).filter(Boolean))].sort(), [data]);

  // ACTIVE DATA: applies structural filters (customer dropdown & intent)
  const activeData = useMemo(() => {
    let rows = data;
    
    if (intentFilter === 'customer') {
      rows = rows.filter(r => r.CUSTOMERID !== 'STOCK');
    } else if (intentFilter === 'stock') {
      rows = rows.filter(r => r.CUSTOMERID === 'STOCK');
    }

    if (slicerMode === 'customer' && custFilter !== 'All') {
      rows = rows.filter(r => r.CUSTOMER === custFilter);
    }
    return rows;
  }, [data, slicerMode, custFilter, intentFilter]);

  // ── KPI Summaries ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!activeData.length) return { totalLines: 0, totalOpenQty: 0, oldestDays: 0, avgAge: 0 };
    const totalQty = activeData.reduce((s, r) => s + (r.Remaining_Qnty || 0), 0);
    return {
      totalLines:   activeData.length,
      totalOpenQty: totalQty,
      oldestDays:   Math.max(...activeData.map(r => r.AgeDays || 0)),
      // FIX (Issue 4): Quantity-weighted average so that a large-volume order
      // contributes proportionally more weight than a single-piece back order.
      // Formula: Σ(AgeDays × Remaining_Qnty) / Σ(Remaining_Qnty)
      avgAge: totalQty > 0
        ? Math.round(
            activeData.reduce((s, r) => s + (r.AgeDays || 0) * (r.Remaining_Qnty || 0), 0) / totalQty
          )
        : 0,
    };
  }, [activeData]);

  // ── Filtered / Grouped rows ────────────────────────────────────────────
  const chartData = useMemo(() => {
    let rows = [...activeData];

    // Type filter (applies across all modes)
    if (typeFilter === 'printed') rows = rows.filter(r => !isPlain(r.ProductionMethod, r.NumColors));
    if (typeFilter === 'plain')   rows = rows.filter(r => isPlain(r.ProductionMethod, r.NumColors));

    if (slicerMode === 'item') {
      // Group by ProductCode — show max age per item
      const map = {};
      rows.forEach(r => {
        const k = r.ProductCode;
        if (!map[k]) map[k] = { name: r.ProductDescription || r.ProductCode, qty: 0, maxAge: 0, lines: 0, isPlain: isPlain(r.ProductionMethod, r.NumColors) };
        map[k].qty    += r.Remaining_Qnty || 0;
        map[k].maxAge  = Math.max(map[k].maxAge, r.AgeDays || 0);
        map[k].lines  += 1;
      });
      return Object.values(map)
        .sort((a, b) => b.maxAge - a.maxAge)
        .slice(0, 20)
        .map(g => ({ ...g, name: g.name.length > 35 ? g.name.slice(0, 35) + '…' : g.name }));
    }

    if (slicerMode === 'customer') {
      if (custFilter !== 'All') {
        const map = {};
        rows.forEach(r => {
          const k = r.ProductCode;
          if (!map[k]) map[k] = { name: r.ProductDescription || r.ProductCode, qty: 0, maxAge: 0, lines: 0, isPlain: isPlain(r.ProductionMethod, r.NumColors) };
          map[k].qty    += r.Remaining_Qnty || 0;
          map[k].maxAge  = Math.max(map[k].maxAge, r.AgeDays || 0);
          map[k].lines  += 1;
        });
        return Object.values(map)
          .sort((a, b) => b.maxAge - a.maxAge)
          .slice(0, 20)
          .map(g => ({ ...g, name: g.name.length > 35 ? g.name.slice(0, 35) + '…' : g.name }));
      } else {
        const map = {};
        rows.forEach(r => {
          const k = r.CUSTOMER;
          if (!map[k]) map[k] = { name: k, qty: 0, maxAge: 0, lines: 0 };
          map[k].qty    += r.Remaining_Qnty || 0;
          map[k].maxAge  = Math.max(map[k].maxAge, r.AgeDays || 0);
          map[k].lines  += 1;
        });
        return Object.values(map).sort((a, b) => b.maxAge - a.maxAge).slice(0, 20);
      }
    }

    if (slicerMode === 'type') {
      return [
        { name: 'Printed', isPlain: false, maxAge: Math.max(0, ...rows.filter(r => !isPlain(r.ProductionMethod, r.NumColors)).map(r => r.AgeDays || 0)),
          qty: rows.filter(r => !isPlain(r.ProductionMethod, r.NumColors)).reduce((s, r) => s + r.Remaining_Qnty, 0), lines: rows.filter(r => !isPlain(r.ProductionMethod, r.NumColors)).length },
        { name: 'Plain',   isPlain: true, maxAge: Math.max(0, ...rows.filter(r => isPlain(r.ProductionMethod, r.NumColors)).map(r => r.AgeDays || 0)),
          qty: rows.filter(r => isPlain(r.ProductionMethod, r.NumColors)).reduce((s, r) => s + r.Remaining_Qnty, 0),   lines: rows.filter(r => isPlain(r.ProductionMethod, r.NumColors)).length },
      ];
    }

    if (slicerMode === 'search') {
      const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      return rows
        .filter(r => {
          const searchStr = [
            r.ProductCode || '',
            r.ProductDescription || '',
            String(r.DocNum || ''),
            String(r.LpoNo || ''),
            String(r.ProdOrderNum || '')
          ].join(' ').toLowerCase();
          return tokens.every(token => searchStr.includes(token));
        })
        .map(r => ({ name: r.ProductDescription || r.ProductCode, maxAge: r.AgeDays, qty: r.Remaining_Qnty, lines: 1, customer: r.CUSTOMER, isPlain: isPlain(r.ProductionMethod, r.NumColors) }));
    }

    return [];
  }, [activeData, slicerMode, typeFilter, searchTerm, custFilter, intentFilter]);

  const SLICER_MODES = [
    { id: 'item',     label: 'By Item',     icon: <Package size={14} /> },
    { id: 'customer', label: 'By Customer', icon: <Users   size={14} /> },
    { id: 'type',     label: 'Printed / Plain', icon: <Layers size={14} /> },
    { id: 'search',   label: 'Search Item', icon: <FilterIcon size={14} /> },
  ];

  return (
    <div>
      {/* KPI Cards */}
      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Remaining Order Lines', value: fmt(kpis.totalLines), grad: 'linear-gradient(135deg,#6366f1,#a855f7)', icon: <Package size={28} style={{opacity:.3}} />, tooltip: "The total number of distinct product lines that customers are waiting for." },
          { label: 'Total Remaining Qty (Pcs)', value: fmt(kpis.totalOpenQty), grad: 'linear-gradient(135deg,#f59e0b,#fbbf24)', icon: <Layers size={28} style={{opacity:.3}} />, tooltip: "The sum of all pieces owed to customers minus the pieces already delivered." },
          { label: 'Oldest Back Order', value: `${fmt(kpis.oldestDays)} Days`, grad: 'linear-gradient(135deg,#ef4444,#f87171)', icon: <Clock size={28} style={{opacity:.3}} />, tooltip: "Calendar days since the oldest active sales order was booked." },
          { label: 'Avg Age (Qty-Weighted)', value: `${fmt(kpis.avgAge)} Days`, grad: 'linear-gradient(135deg,#10b981,#34d399)', icon: <TrendingUp size={28} style={{opacity:.3}} />, tooltip: "Weighted average age. A 500,000-piece order holds more weight in this average than a 1-piece order, reflecting your true volume backlog." },
        ].map(k => (
          <div key={k.label} className="stat-card" style={{ background: k.grad, color: 'white' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center' }}>
                  {k.label}
                  {k.tooltip && <InfoTooltip title={k.label} text={k.tooltip} iconSize={14} />}
                </h3>
                <div className="value">{k.value}</div>
              </div>
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Slicer Control Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {SLICER_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => {
              setSlicerMode(m.id);
              if (m.id !== 'customer') setCustFilter('All');
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.85rem',
              background: slicerMode === m.id ? '#6366f1' : '#f1f5f9',
              color: slicerMode === m.id ? 'white' : '#475569',
            }}
          >{m.icon} {m.label}</button>
        ))}

        {slicerMode === 'customer' && (
          <select value={custFilter} onChange={e=>setCustFilter(e.target.value)}
            style={{padding:'8px 14px',borderRadius:'10px',border:'1px solid #e2e8f0',fontSize:'0.85rem',fontWeight:600}}>
            {customers.map(c=><option key={c}>{c}</option>)}
          </select>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {/* Intent Filter */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '20px' }}>
            {[
              { id: 'customer', label: 'Customers Only' },
              { id: 'stock', label: 'Stock Only' },
              { id: 'all', label: 'All Orders' }
            ].map(f => (
              <button key={f.id}
                onClick={() => setIntentFilter(f.id)}
                style={{
                  padding: '6px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600,
                  background: intentFilter === f.id ? 'white' : 'transparent',
                  color: intentFilter === f.id ? '#6366f1' : '#64748b',
                  boxShadow: intentFilter === f.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.2s'
                }}
              >{f.label}</button>
            ))}
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['all', 'printed', 'plain'].map(t => (
              <button key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  padding: '6px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600,
                  background: typeFilter === t ? '#0f172a' : '#f1f5f9',
                  color: typeFilter === t ? 'white' : '#475569',
                }}
              >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Search input (only in search mode) */}
      {slicerMode === 'search' && (
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text" placeholder="Search by product code or description…"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
          />
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="chart-card" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem' }}>
            {slicerMode === 'item' ? 'Top 20 Items by Age (Days)' :
             slicerMode === 'customer' ? (custFilter === 'All' ? 'Top 20 Customers by Oldest Back Order Age' : `Top 20 Items for ${custFilter}`) :
             slicerMode === 'type' ? 'Printed vs. Plain Comparison' :
             `Search Results — ${chartData.length} item(s)`}
          </h4>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 60, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" unit=" days" />
              <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => name === 'maxAge' ? [`${v} days`, 'Max Age'] : [fmt(v), 'Open Qty']}
                contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.1)' }}
              />
              <Bar dataKey="maxAge" name="maxAge" radius={[0, 4, 4, 0]} maxBarSize={40}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.isPlain ? '#facc15' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail Table */}
      <div className="table-wrapper glass-card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>LPO #</th><th>Customer</th><th>Prod Order</th><th>Product Code</th>
              <th style={{textAlign:'left'}}>Description</th>
              <th>Ordered</th><th>Delivered</th><th>Remaining Qty</th>
              <th>Age</th><th>Colors</th><th>Type</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{padding:'3rem',color:'#999'}}>Loading back order data…</td></tr>
            ) : activeData.length === 0 ? (
              <tr><td colSpan={10} style={{padding:'3rem',color:'#999'}}>No open back orders found.</td></tr>
            ) : (
              activeData
                .filter(r => {
                  if (typeFilter === 'printed') return !isPlain(r.ProductionMethod, r.NumColors);
                  if (typeFilter === 'plain')   return isPlain(r.ProductionMethod, r.NumColors);
                  if (slicerMode === 'search') {
                    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                    const searchStr = [
                      r.ProductCode || '',
                      r.ProductDescription || '',
                      String(r.DocNum || ''),
                      String(r.LpoNo || ''),
                      String(r.ProdOrderNum || '')
                    ].join(' ').toLowerCase();
                    return tokens.every(token => searchStr.includes(token));
                  }
                  return true;
                })
                .map((r, i) => (
                  <tr key={i}>
                    <td style={{fontSize:'0.8rem'}}>{r.LpoNo}</td>
                    <td style={{fontSize:'0.82rem'}}>{r.CUSTOMER}</td>
                    <td style={{fontWeight:600, color:'#475569'}}>{r.ProdOrderNum || '—'}</td>
                    <td style={{fontWeight:600,fontSize:'0.82rem'}}>{r.ProductCode}</td>
                    <td style={{textAlign:'left',fontSize:'0.82rem'}}>{r.ProductDescription}</td>
                    <td>{fmt(r.Order_Qty)}</td>
                    <td>{fmt(r.Delivered_Qnty)}</td>
                    <td style={{fontWeight:700,color:'#6366f1'}}>{fmt(r.Remaining_Qnty)}</td>
                    <td>
                      <span style={{
                        padding:'3px 10px', borderRadius:'12px', fontWeight:700, fontSize:'0.8rem',
                        background: AGE_BG(r.AgeDays), color: AGE_COLOR(r.AgeDays),
                      }}>{r.AgeDays}d</span>
                    </td>
                    <td style={{textAlign:'center'}}>{r.NumColors === 0 ? '—' : r.NumColors}</td>
                    <td>
                      <span style={{
                        padding:'2px 8px', borderRadius:'8px', fontSize:'0.75rem', fontWeight:600,
                        background: isPlain(r.ProductionMethod,r.NumColors) ? '#f0f9ff' : '#faf5ff',
                        color: isPlain(r.ProductionMethod,r.NumColors) ? '#0369a1' : '#7c3aed',
                      }}>
                        {isPlain(r.ProductionMethod,r.NumColors) ? 'Plain' : 'Printed'}
                      </span>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// =============================================================================
// DASHBOARD 3 — PRODUCTION COVERAGE
// =============================================================================
function ProductionCoverage({ data, loading }) {
  const summary = data.summary || {};
  const items   = data.items || [];

  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'covered' | 'shortage'
  const [typeFilter, setTypeFilter]     = useState('all');   // 'all' | 'printed' | 'plain'
  const [intentFilter, setIntentFilter] = useState('customer'); // 'all' | 'customer' | 'stock'

  // ── Filtered & Sorted Items ──────────────────────────────────────────────
  const activeItems = useMemo(() => {
    let rows = [...items];
    
    // 0. Intent filter (Customer vs Stock)
    if (intentFilter === 'customer') {
      rows = rows.filter(r => r.CUSTOMERID !== 'STOCK');
    } else if (intentFilter === 'stock') {
      rows = rows.filter(r => r.CUSTOMERID === 'STOCK');
    }

    // 1. Search filter
    if (searchTerm) {
      const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter(r => {
        const searchStr = [
          r.ProductCode || '',
          r.ProductDescription || '',
          r.CUSTOMER || '',
          String(r.SalesOrderNum || ''),
          String(r.LpoNo || ''),
          String(r.ProdOrderNum || '')
        ].join(' ').toLowerCase();
        return tokens.every(token => searchStr.includes(token));
      });
    }

    // 2. Status filter
    if (statusFilter === 'covered')  rows = rows.filter(r => r.IsCovered);
    if (statusFilter === 'shortage') rows = rows.filter(r => !r.IsCovered);

    // 3. Type filter
    if (typeFilter === 'printed') rows = rows.filter(r => !r.IsPlain);
    if (typeFilter === 'plain')   rows = rows.filter(r => r.IsPlain);

    // 4. Default Sort: Age (Oldest First)
    return rows.sort((a, b) => (b.AgeDays || 0) - (a.AgeDays || 0));
  }, [items, searchTerm, statusFilter, typeFilter, intentFilter]);

  // ── Dynamic Summary for KPI Cards ─────────────────────────────────────────
  const dynamicSummary = useMemo(() => {
    const total = activeItems.length;
    const covered = activeItems.filter(r => r.IsCovered).length;
    const uncovered = total - covered;
    const highColor = activeItems.filter(r => (r.NumColors || 0) >= 5).length;
    const pct = total > 0 ? (highColor / total) * 100 : 0;
    
    let level = 'OK';
    if (pct >= 50) level = 'RED';
    else if (pct >= 30) level = 'AMBER';
    
    return {
      TotalOpenLines: total,
      CoveredLines: covered,
      UncoveredLines: uncovered,
      ColorBurdenPct: pct,
      BurdenLevel: level
    };
  }, [activeItems]);

  // ── Prepare Chart 1: Open Qty vs. Planned (Top 15 Filtered) ──────────────
  const topItemsData = useMemo(() => {
    const groups = {};
    activeItems.forEach(r => {
      const name = r.ProductDescription || r.ProductCode;
      if (!groups[name]) groups[name] = { name, open: 0, planned: 0 };
      groups[name].open += r.OpenQty || 0;
      groups[name].planned += r.PlannedQty || 0;
    });

    return Object.values(groups)
      .sort((a, b) => b.open - a.open)
      .slice(0, 15)
      .map(g => ({
        ...g,
        displayName: g.name.length > 40 ? g.name.slice(0, 40) + '...' : g.name
      }));
  }, [activeItems]);

  // ── Prepare Chart 2: Color Complexity ───────────────────────────────────
  const colorData = useMemo(() => {
    const bins = { '0 (Plain)': 0, '1-2 Clrs': 0, '3-4 Clrs': 0, '5+ Clrs': 0 };
    activeItems.forEach(r => {
      const c = r.NumColors || 0;
      if (c === 0) bins['0 (Plain)']++;
      else if (c <= 2) bins['1-2 Clrs']++;
      else if (c <= 4) bins['3-4 Clrs']++;
      else bins['5+ Clrs']++;
    });
    const total = activeItems.length || 1;
    return Object.entries(bins).map(([name, count]) => ({
      name, value: count, percentage: Math.round((count / total) * 100)
    }));
  }, [activeItems]);

  const PIE_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#6366f1'];

  return (
    <div>
      {/* KPI Cards */}
      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Remaining Order Lines', value: fmt(dynamicSummary.TotalOpenLines), grad: 'linear-gradient(135deg,#6366f1,#a855f7)', icon: <Package size={28} style={{opacity:.3}} />, tooltip: "Total distinct product lines currently on backorder." },
          { label: 'Total Covered Lines', value: fmt(dynamicSummary.CoveredLines), grad: 'linear-gradient(135deg,#10b981,#34d399)', icon: <Target size={28} style={{opacity:.3}} />, tooltip: "Number of backorders that already have a matching Production Order open on the floor." },
          { label: 'Uncovered Backlog', value: fmt(dynamicSummary.UncoveredLines), grad: 'linear-gradient(135deg,#ef4444,#f87171)', icon: <AlertCircle size={28} style={{opacity:.3}} />, tooltip: "Orders that have no production planned yet. These represent your true manufacturing shortage." },
          { 
            label: 'Color Burden Score', 
            value: `${fmt(dynamicSummary.ColorBurdenPct, 1)}%`, 
            grad: dynamicSummary.BurdenLevel === 'RED' ? 'linear-gradient(135deg,#991b1b,#ef4444)' : 
                  dynamicSummary.BurdenLevel === 'AMBER' ? 'linear-gradient(135deg,#92400e,#f59e0b)' : 
                  'linear-gradient(135deg,#065f46,#10b981)', 
            icon: <Activity size={28} style={{opacity:.3}} />, 
            tooltip: "Percentage of orders with 5+ colors. High scores indicate a setup-heavy schedule that will likely miss targets if not managed carefully." 
          },
        ].map(k => (
          <div key={k.label} className="stat-card" style={{ background: k.grad, color: 'white' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center' }}>
                  {k.label}
                  <InfoTooltip title={k.label} text={k.tooltip} iconSize={14} />
                </h3>
                <div className="value">{k.value}</div>
                {k.label === 'Color Burden Score' && (
                  <div style={{fontSize:'0.75rem', fontWeight:800, marginTop:'4px', opacity:0.9}}>
                    STATUS: {dynamicSummary.BurdenLevel}
                  </div>
                )}
              </div>
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Control Bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
          <FilterIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by Product or Customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 38px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'covered', label: 'Covered' },
            { id: 'shortage', label: 'Shortage' }
          ].map(f => (
            <button key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '6px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                background: statusFilter === f.id ? 'white' : 'transparent',
                color: statusFilter === f.id ? '#6366f1' : '#64748b',
                boxShadow: statusFilter === f.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Type Filter */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
          {[
            { id: 'all', label: 'All Types' },
            { id: 'printed', label: 'Printed' },
            { id: 'plain', label: 'Plain' }
          ].map(f => (
            <button key={f.id}
              onClick={() => setTypeFilter(f.id)}
              style={{
                padding: '6px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                background: typeFilter === f.id ? '#0f172a' : 'transparent',
                color: typeFilter === f.id ? 'white' : '#64748b',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Intent Filter */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
          {[
            { id: 'customer', label: 'Customers Only' },
            { id: 'stock', label: 'Stock Only' },
            { id: 'all', label: 'All Orders' }
          ].map(f => (
            <button key={f.id}
              onClick={() => setIntentFilter(f.id)}
              style={{
                padding: '6px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                background: intentFilter === f.id ? 'white' : 'transparent',
                color: intentFilter === f.id ? '#6366f1' : '#64748b',
                boxShadow: intentFilter === f.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Charts Row */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Bar Chart */}
          <div className="chart-card">
            <h4 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              Open Qty vs. Planned Production (Top 15 Products)
            </h4>
            <div style={{ height: 450 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItemsData} layout="vertical" margin={{ left: 40, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="displayName" type="category" width={180} tick={{fontSize: 10, fontWeight: 500}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                  />
                  <Legend verticalAlign="top" align="right" height={36} iconType="rect"/>
                  <Bar dataKey="open" name="Open (Back Order)" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="planned" name="Planned Production" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="chart-card">
            <h4 style={{ marginBottom: '1.5rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              Color Complexity Breakdown
            </h4>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={colorData}
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {colorData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    formatter={(value, entry) => (
                      <span style={{ color: '#475569', fontSize: '0.85rem', fontWeight: 600 }}>
                        {value} ({entry.payload.percentage}%)
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrapper glass-card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Sales Order</th>
              <th>Customer</th>
              <th>Product Code</th>
              <th style={{textAlign:'left'}}>Description</th>
              <th style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Open Qty
                <InfoTooltip title="Open Quantity" text="Remaining units owed to the customer. Source: ELGON.dbo.EKL_OPEN_ORDERS (Sales Backlog)." iconSize={14} />
              </th>
              <th>Age</th>
              <th>Status</th>
              <th>Prod Order</th>
              <th style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Planned
                <InfoTooltip title="Planned Quantity" text="Total units authorized on current open Job Cards for this item. Source: DKL.dbo.OWOR (Released Production Orders)." iconSize={14} />
              </th>
              <th style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Produced
                <InfoTooltip title="Produced Quantity" text="Total units already finished and scanned against the current open Job Cards." iconSize={14} />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{padding:'3rem',color:'#999'}}>Loading coverage data…</td></tr>
            ) : activeItems.length === 0 ? (
              <tr><td colSpan={10} style={{padding:'3rem',color:'#999'}}>No data available.</td></tr>
            ) : (
              activeItems.map((r, i) => (
                <tr key={i}>
                  <td style={{fontSize:'0.8rem'}}>{r.SalesOrderNum}</td>
                  <td style={{fontSize:'0.82rem'}}>{r.CUSTOMER}</td>
                  <td style={{fontWeight:600,fontSize:'0.82rem'}}>{r.ProductCode}</td>
                  <td style={{textAlign:'left',fontSize:'0.82rem'}}>{r.ProductDescription}</td>
                  <td style={{fontWeight:700,color:'#6366f1'}}>{fmt(r.OpenQty)}</td>
                  <td>
                    <span style={{
                      padding:'3px 10px', borderRadius:'12px', fontWeight:700, fontSize:'0.8rem',
                      background: AGE_BG(r.AgeDays), color: AGE_COLOR(r.AgeDays),
                    }}>{r.AgeDays}d</span>
                  </td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:'4px', justifyContent:'center'}}>
                      {r.IsCovered ? (
                        <CheckCircle size={14} color="#10b981" />
                      ) : (
                        <XCircle size={14} color="#ef4444" />
                      )}
                      <span style={{
                        fontSize:'0.7rem', fontWeight:800,
                        color: r.IsCovered ? '#10b981' : '#ef4444'
                      }}>
                        {r.IsCovered ? 'COVERED' : 'SHORTAGE'}
                      </span>
                    </div>
                  </td>
                  <td style={{fontWeight:600, color:'#475569'}}>{r.ProdOrderNum || '—'}</td>
                  <td>{r.ProdOrderNum ? fmt(r.PlannedQty) : '—'}</td>
                  <td style={{color:'#10b981', fontWeight:600}}>{r.ProdOrderNum ? fmt(r.ProducedQty) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// =============================================================================
// DASHBOARD 2 — MATERIAL REQUIREMENTS
// =============================================================================
export default function PTSOrderBook() {
  const [activeTab, setActiveTab]         = useState('age');
  const [ageData,   setAgeData]           = useState([]);
  const [covData,   setCovData]           = useState({ summary: {}, items: [] });
  const [loading,   setLoading]           = useState({ age: false, cov: false });
  const [errors,    setErrors]            = useState({ age: null, cov: null });

  const fetchAll = useCallback(async () => {
    setLoading({ age: true, cov: true });
    setErrors({ age: null, cov: null });

    // Fire all in parallel
    const [ageRes, covRes] = await Promise.allSettled([
      ptsApi.getBackorderAge(),
      ptsApi.getProductionCoverage(),
    ]);

    setLoading({ age: false, cov: false });

    if (ageRes.status === 'fulfilled') setAgeData(ageRes.value);
    else setErrors(e => ({ ...e, age: ageRes.reason?.message }));

    if (covRes.status === 'fulfilled') {
      setCovData({ summary: covRes.value, items: covRes.value.Items || [] });
    } else {
      setErrors(e => ({ ...e, cov: covRes.reason?.message }));
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const TABS = [
    { id: 'age',      label: 'Back Order Age',         icon: <Clock    size={16}/>, tooltip: "Analyzes old orders vs new ones. Uses QTY-weighted averages to prevent micro-orders from skewing data." },
    { id: 'coverage', label: 'Production Coverage',    icon: <Target   size={16}/>, tooltip: "Cross-checks Sales Backlog against the Floor Production Orders to reveal shortages." },
  ];

  const currentError = errors[activeTab === 'age' ? 'age' : 'cov'];
  const currentLoading = loading[activeTab === 'age' ? 'age' : 'cov'];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h2 style={{ margin:0, fontSize:'1.4rem', color:'#1e293b', display: 'flex', alignItems: 'center' }}>
              PTS Back Order Intelligence
              <InfoTooltip title="Order Book" text="Live view of ELGON.dbo.EKL_OPEN_ORDERS where Remaining Qty > 0. Replaces the legacy manual reporting." />
            </h2>
            <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:'0.9rem' }}>
              Live SLEEVES order book from ELGON.dbo.EKL_OPEN_ORDERS · Open orders only
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="nav-tab active"
            style={{ height:'44px', border:'none', padding:'0 1.5rem', fontSize:'0.9rem' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {currentError && (
        <div style={{ background:'#fff5f5', color:'#c53030', padding:'1rem', borderRadius:'10px',
          marginBottom:'1.5rem', display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <AlertCircle size={20}/> {currentError}
        </div>
      )}

      {/* Sub-Tab Nav */}
      <div className="sub-tabs" style={{ marginBottom: '2rem' }}>
        {TABS.map(t => (
          <div
            key={t.id}
            className={`sub-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:'8px' }}
          >
            {t.icon} {t.label}
            {activeTab === t.id && <InfoTooltip title={t.label} text={t.tooltip} iconSize={14} inline={true} />}
          </div>
        ))}
      </div>

      {/* Dashboard Content */}
      {activeTab === 'age'      && <BackOrderAge         data={ageData}   loading={currentLoading}/>}
      {activeTab === 'coverage' && <ProductionCoverage   data={covData}   loading={currentLoading}/>}
    </div>
  );
}
