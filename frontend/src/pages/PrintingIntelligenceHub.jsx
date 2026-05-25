import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { printingApi, notificationsApi } from '../services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, ScatterChart, Scatter, ZAxis, Cell, PieChart, Pie, ReferenceLine
} from 'recharts';
import { 
  Printer, Zap, Layers, AlertCircle, Database, TrendingUp, 
  Filter as FilterIcon, Target, Gauge, Clock, ArrowRightLeft,
  Activity, BarChart3, Trash2, AlertTriangle, Send, Bell
} from 'lucide-react';
import MaterialHealthWidget from '../components/MaterialHealthWidget';
import InfoTooltip from '../components/InfoTooltip';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const MACHINE_NAMES = {
  "PRINTING_1": "Printing_1 (Uflex)",
  "PRINTING_2": "Printing_2 (G1)",
  "PRINTING_3": "Printing_3 (G2)",
  "PRINTING_4": "Printing_4 (Roto)",
  "ECO_FLEX": "ECO FLEX"
};

const getMachineName = (id) => MACHINE_NAMES[id] || id;

export default function PrintingIntelligenceHub() {
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'efficiency', 'waste'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [reelSearchQuery, setReelSearchQuery] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('All');
  
  // Data States
  const [boppData, setBoppData] = useState([]);
  const [efficiencyData, setEfficiencyData] = useState({ Details: [] });
  const [benchmarks, setBenchmarks] = useState([]);

  // Date Filters
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = `${today.substring(0, 7)}-01`;
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bopp, eff, bench] = await Promise.all([
        printingApi.getBoppReport(startDate, endDate),
        printingApi.getEfficiencyReport(startDate, endDate),
        printingApi.getBenchmarks()
      ]);
      setBoppData(bopp);
      setEfficiencyData(eff);
      setBenchmarks(bench);
    } catch (e) {
      console.error("Failed to fetch printing intelligence data", e);
      setError(e.message || "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Computed Stats ---
  
   const filteredBopp = useMemo(() => {
    let data = boppData;
    if (selectedMachine !== 'All') {
      data = data.filter(r => r.MachineID === selectedMachine);
    }
    if (reelSearchQuery.trim()) {
      const q = reelSearchQuery.toLowerCase();
      data = data.filter(r => 
        String(r.ProductionOrder || '').toLowerCase().includes(q) ||
        String(r.ItemDescription || '').toLowerCase().includes(q) ||
        String(r.ItemCode || '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [boppData, selectedMachine, reelSearchQuery]);

  const filteredEfficiency = useMemo(() => {
    let details = efficiencyData.Details || [];
    if (selectedMachine !== 'All') {
      details = details.filter(r => r.MachineID === selectedMachine);
    }
    if (jobSearchQuery.trim()) {
      const q = jobSearchQuery.toLowerCase();
      details = details.filter(r => 
        String(r.ProductionOrder || '').toLowerCase().includes(q) ||
        String(r.ProductDescription || '').toLowerCase().includes(q) ||
        String(r.ItemCode || '').toLowerCase().includes(q)
      );
    }
    return details;
  }, [efficiencyData.Details, selectedMachine, jobSearchQuery]);

  const stats = useMemo(() => {
    const totalWeight = filteredBopp.reduce((sum, r) => sum + (r.BoppWeight || 0), 0);
    const totalMeters = filteredBopp.reduce((sum, r) => sum + (r.RunMeters || 0), 0);
    const totalWaste = filteredBopp.reduce((sum, r, idx, arr) => {
        // Only count waste once per machine per day (already aggregated in backend usually, but be safe)
        // Actually, daily_waste is attached to every reel of that machine/day in the current router logic.
        // We need to sum uniquely.
        const key = `${r.TransactionDate}_${r.MachineID}`;
        const isFirst = arr.findIndex(x => `${x.TransactionDate}_${x.MachineID}` === key) === idx;
        return sum + (isFirst ? (r.daily_waste || 0) : 0);
    }, 0);

    const activeJobs = filteredEfficiency.filter(d => d.ActualRunMeters > 0);
    
    return {
      totalWeight,
      totalMeters,
      totalWaste,
      plannedMeters: filteredEfficiency.reduce((sum, r) => sum + (r.PlannedMeters || 0), 0),
      actualMeters: filteredEfficiency.reduce((sum, r) => sum + (r.ActualRunMeters || 0), 0),
      changeovers: new Set(activeJobs.map(d => d.ProductionOrder)).size,
    };
  }, [filteredBopp, filteredEfficiency]);

  const benchmarkWaste = useMemo(() => {
    if (!benchmarks.length || stats.totalWeight === 0) return 0;
    
    let ratio = 0;
    if (selectedMachine === 'All') {
      const totalHWeight = benchmarks.reduce((sum, b) => sum + (b.TotalWeight || 0), 0);
      const totalHWaste = benchmarks.reduce((sum, b) => sum + (b.TotalWaste || 0), 0);
      ratio = totalHWeight > 0 ? totalHWaste / totalHWeight : 0;
    } else {
      const b = benchmarks.find(b => b.MachineID === selectedMachine);
      ratio = b ? b.WasteRatio : 0;
    }
    return stats.totalWeight * ratio;
  }, [benchmarks, selectedMachine, stats.totalWeight]);

  // --- Chart Data ---

  const wasteAnalyticsData = useMemo(() => {
    const machineMap = {};
    
    // Initialize with all known machines from benchmarks to ensure coverage
    benchmarks.forEach(b => {
        machineMap[b.MachineID] = {
            id: b.MachineID,
            name: getMachineName(b.MachineID),
            weight: 0,
            meters: 0,
            waste: 0,
            benchRatio: b.WasteRatio,
            isEco: b.MachineID === 'ECO_FLEX'
        };
    });

    // Add consumption and meters from BoppData
    filteredBopp.forEach(r => {
        if (!machineMap[r.MachineID]) {
            machineMap[r.MachineID] = { id: r.MachineID, name: getMachineName(r.MachineID), weight: 0, meters: 0, waste: 0, benchRatio: 0.02 };
        }
        machineMap[r.MachineID].weight += (r.BoppWeight || 0);
        machineMap[r.MachineID].meters += (r.RunMeters || 0);
    });

    // Add waste uniquely
    const seenWasteKeys = new Set();
    boppData.forEach(r => {
        const key = `${r.TransactionDate}_${r.MachineID}`;
        if (!seenWasteKeys.has(key)) {
            seenWasteKeys.add(key);
            if (machineMap[r.MachineID]) {
                machineMap[r.MachineID].waste += (r.daily_waste || 0);
            }
        }
    });

    return Object.values(machineMap).map(m => ({
        ...m,
        benchValue: m.weight * m.benchRatio,
        goalValue: m.weight * 0.02,
        efficiency: m.weight > 0 ? (m.waste / m.weight) * 100 : 0
    })).sort((a, b) => b.waste - a.waste);
  }, [filteredBopp, benchmarks, boppData]);

  const complexityData = useMemo(() => {
    const colorGroups = {};
    filteredEfficiency.forEach(item => {
      if (item.ActualRunMeters <= 0) return;
      const c = item.NumColors;
      if (!colorGroups[c]) {
        colorGroups[c] = { colors: c, meters: 0, count: 0, avgMeters: 0 };
      }
      colorGroups[c].meters += item.ActualRunMeters;
      colorGroups[c].count += 1;
    });

    return Object.values(colorGroups)
      .map(g => ({ ...g, avgMeters: g.meters / g.count }))
      .sort((a, b) => a.colors - b.colors);
  }, [filteredEfficiency]);

  const shiftData = useMemo(() => {
    const shiftMap = { Day: { name: 'Day', value: 0 }, Night: { name: 'Night', value: 0 } };
    filteredBopp.forEach(row => {
      const shift = row.ProductionShift || 'Day';
      if (shiftMap[shift]) shiftMap[shift].value += (row.BoppWeight || 0);
    });
    return Object.values(shiftMap).filter(s => s.value > 0);
  }, [filteredBopp]);

  return (
    <div className="printing-intelligence-hub">
      {/* Header & Main Controls */}
      <div className="dashboard-header" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity color="var(--primary-color)" /> Printing Intelligence Hub
            </h1>
            <p style={{ margin: '5px 0 0 0', opacity: 0.6 }}>Unified Material & Performance Analytics</p>
          </div>
          
          <div className="dashboard-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Range</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd' }} />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd' }} />
              </div>
            </div>
            <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Machine</label>
                <select 
                    value={selectedMachine} 
                    onChange={(e) => setSelectedMachine(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd', minWidth: '150px' }}
                >
                    <option value="All">All Machines</option>
                    {Object.entries(MACHINE_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </div>
            <button onClick={fetchData} disabled={loading} className="nav-tab active" style={{ height: '38px', padding: '0 1.5rem', border: 'none' }}>
              {loading ? 'Syncing...' : 'Update Data'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert-error" style={{ background: '#fff5f5', color: '#c53030', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <MaterialHealthWidget />

      {/* Unified Stats Grid */}
      <div className="summary-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card prod" style={{ background: 'var(--primary-grad)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Total Production
                <InfoTooltip title="Total Production" text="Total linear meters produced across all machines. This is the 'Actual' output recorded by the floor pulse sensors." iconSize={14} />
            </h3>
            <div className="value">{stats.totalMeters.toLocaleString()} m</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Achievement: {stats.plannedMeters > 0 ? ((stats.actualMeters / stats.plannedMeters) * 100).toFixed(1) : 0}%
                <InfoTooltip title="Target Achievement" text="Measures how well we performed against the planned targets. Target meters include setup allowances and estimated waste buffers." iconSize={12} />
            </div>
        </div>
        <div className="stat-card" style={{ background: 'var(--secondary-grad)', color: 'white' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>
                BOPP Consumption
                <InfoTooltip title="Material Consumption" text="The total gross weight of BOPP material consumed during the production process." iconSize={14} />
            </h3>
            <div className="value">{stats.totalWeight.toLocaleString()} Kg</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Yield: {stats.totalWeight > 0 ? (stats.totalMeters / stats.totalWeight).toFixed(1) : 0} m/Kg
                <InfoTooltip title="Yield Efficiency" text="Linear meters produced per 1 Kg of material consumed. A high yield indicates thinner material or more efficient production." iconSize={12} />
            </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', color: 'white' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Recorded Waste
                <InfoTooltip title="Recorded Waste" text="Actual scrap weight captured and weighed at the Recycler station for the selected machines and dates." iconSize={14} />
            </h3>
            <div className="value">{stats.totalWaste.toLocaleString()} Kg</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Target: {benchmarkWaste.toFixed(0)} Kg (6-Mo Avg)
                <InfoTooltip title="Historical Benchmark" text="Calculated target based on the specific machine's actual historical waste ratio over the last 6 months. This is your 'realistic' performance target." iconSize={12} />
            </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #64748b 0%, #334155 100%)', color: 'white' }}>
            <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Change Overs
                <InfoTooltip title="Job Count" text="The number of distinct production orders processed. Each new order represents a setup/changeover event." iconSize={14} />
            </h3>
            <div className="value">{stats.changeovers} Jobs</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Avg {stats.changeovers > 0 ? (stats.actualMeters / stats.changeovers).toFixed(0) : 0} m/job
                <InfoTooltip title="Average Run Length" text="Average meters produced per setup. Longer runs are generally more efficient as setup time is spread across more meters." iconSize={12} />
            </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
       <div className="sub-tabs" style={{ marginBottom: '2rem' }}>
        <div className={`sub-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
          <Activity size={16} style={{ marginRight: '8px' }} /> Live Activity
        </div>
        <div className={`sub-tab ${activeTab === 'changeovers' ? 'active' : ''}`} onClick={() => setActiveTab('changeovers')}>
          <ArrowRightLeft size={16} style={{ marginRight: '8px' }} /> Production Log
        </div>
        <div className={`sub-tab ${activeTab === 'efficiency' ? 'active' : ''}`} onClick={() => setActiveTab('efficiency')}>
          <BarChart3 size={16} style={{ marginRight: '8px' }} /> Performance Analysis
        </div>
        <div className={`sub-tab ${activeTab === 'waste' ? 'active' : ''}`} onClick={() => setActiveTab('waste')}>
          <Trash2 size={16} style={{ marginRight: '8px' }} /> Waste Analytics
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'live' && (
          <div className="live-view">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', marginBottom: '2rem' }}>
                <div className="chart-card" style={{ height: '400px' }}>
                    <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                        Machine Output vs Consumption
                    </h4>
                    <ResponsiveContainer width="100%" height="90%">
                        <BarChart data={wasteAnalyticsData.filter(m => !m.isEco)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis yAxisId="left" orientation="left" stroke="#6366f1" />
                            <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                            <Tooltip />
                            <Legend />
                            <Bar yAxisId="left" dataKey="weight" name="Consumption (Kg)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="right" dataKey="meters" name="Production (m)" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card">
                    <h4 style={{ marginBottom: '1.5rem' }}>Shift Distribution</h4>
                    <ResponsiveContainer width="100%" height="80%">
                        <PieChart>
                            <Pie data={shiftData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                                {shiftData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v) => [`${v.toLocaleString()} Kg`, 'Consumption']} />
                            <Legend verticalAlign="bottom" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="table-wrapper glass-card" style={{ padding: 0 }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Layers size={18} color="#10b981" />
                        <h4 style={{ margin: 0 }}>Live Reel Scan Log</h4>
                    </div>
                    <div style={{ position: 'relative', width: '300px' }}>
                        <FilterIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input 
                            type="text" 
                            placeholder="Search Order #, Reel ID..."
                            value={reelSearchQuery}
                            onChange={(e) => setReelSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 35px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                        />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr><th>Date</th><th>Shift</th><th>Machine</th><th>Order #</th><th>Item Description</th><th>Reel ID</th><th>Weight</th><th>Meters</th></tr>
                    </thead>
                    <tbody>
                        {filteredBopp.map((row, i) => (
                            <tr key={i}>
                                <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{row.TransactionDate}</td>
                                <td>{row.ProductionShift}</td>
                                <td style={{ fontWeight: 600 }}>{getMachineName(row.MachineID)}</td>
                                <td style={{ fontWeight: 700 }}>{row.ProductionOrder}</td>
                                <td style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{row.ItemCode}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{row.ItemDescription}</div>
                                </td>
                                <td style={{ fontFamily: 'monospace' }}>{row.ReelIndex}</td>
                                <td style={{ fontWeight: 700 }}>{row.BoppWeight} Kg</td>
                                <td style={{ fontWeight: 700, color: '#6366f1' }}>{row.RunMeters?.toLocaleString()} m</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
        )}

        {activeTab === 'changeovers' && (
          <div className="changeovers-view">
             <div className="table-wrapper glass-card" style={{ padding: 0 }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                   <div>
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Database size={20} color="#6366f1" /> Master Production Log
                        </h4>
                   </div>
                   <div style={{ position: 'relative', width: '350px' }}>
                        <FilterIcon size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
                        <input 
                            type="text" 
                            placeholder="Filter Jobs (Order #, Item Code)..."
                            value={jobSearchQuery}
                            onChange={(e) => setJobSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '10px 15px 10px 40px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th><th>Machine</th><th>Order #</th><th style={{textAlign:'left'}}>Product</th>
                            <th>Target (m)</th><th>Actual (m)</th><th>Variance</th><th>Setup Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEfficiency.map((row, i) => (
                            <tr key={i}>
                                <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.85rem' }}>{row.OrderDate}</td>
                                <td style={{ fontWeight: 600 }}>
                                    {row.ActualRunMeters > 0 ? (
                                        getMachineName(row.MachineID)
                                    ) : (
                                        <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 800 }}>
                                            PLANNED / NO SCANS
                                        </span>
                                    )}
                                </td>
                                <td style={{ fontWeight: 700 }}>{row.ProductionOrder}</td>
                                <td style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {row.ItemCode}
                                        {row.NumColors === 0 && !row.IsPlain && (
                                            <span style={{ 
                                                backgroundColor: '#fff7ed', 
                                                color: '#c2410c', 
                                                border: '1px solid #fdba74',
                                                padding: '2px 6px', 
                                                borderRadius: '4px', 
                                                fontSize: '0.65rem', 
                                                fontWeight: 800,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <AlertTriangle size={10} /> FIX MASTER DATA
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{row.ProductDescription}</div>
                                </td>
                                <td>{row.PlannedMeters.toLocaleString()}</td>
                                <td style={{ fontWeight: 700, color: row.ActualRunMeters > 0 ? '#6366f1' : '#cbd5e1' }}>
                                    {row.ActualRunMeters > 0 ? row.ActualRunMeters.toLocaleString() : '---'}
                                </td>
                                <td>
                                    {row.ActualRunMeters > 0 ? (
                                        <span style={{ color: row.VariancePercent > 5 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                                            {row.VariancePercent}%
                                        </span>
                                    ) : (
                                        <span style={{ color: '#cbd5e1' }}>---</span>
                                    )}
                                </td>
                                <td style={{ fontWeight: 700, color: row.ActualRunMeters > 0 ? '#f59e0b' : '#cbd5e1' }}>
                                    {row.ActualRunMeters > 0 ? `${row.EstSetupTimeMins} min` : '---'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>
        )}

        {activeTab === 'efficiency' && (
          <div className="efficiency-view">
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="chart-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                        <Layers size={20} color="#6366f1" />
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                            Complexity vs. Throughput
                            <InfoTooltip title="Complexity Scatter Plot" text="Compares job complexity (number of colors) against achievement meters. Ideally, bubbles should be higher for low-color jobs." iconSize={14} />
                        </h4>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="colors" type="number" name="Colors" unit=" clr" />
                            <YAxis dataKey="avgMeters" type="number" name="Avg Meters" unit=" m" />
                            <ZAxis dataKey="count" range={[50, 400]} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                            <Scatter name="Jobs" data={complexityData} fill="#6366f1">
                                {complexityData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
                <div className="chart-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                        <Gauge size={20} color="#f59e0b" />
                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                            Achievement vs. Plan
                            <InfoTooltip title="Achievement Gap" text="Compares actual linear output against the target set during planning. Target incorporates the 2% per color waste allowance." iconSize={14} />
                        </h4>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={[{ name: 'Overall', planned: stats.plannedMeters, actual: stats.actualMeters }]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="planned" name="Target" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'waste' && (
          <div className="waste-view">
            <div className="chart-card" style={{ height: '500px', marginBottom: '2rem' }}>
                <h4 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
                    Actual Waste vs. 6-Month Benchmarks
                    <InfoTooltip title="Waste Comparison" text="Red bar = Actual waste recorded at the recycler. Orange bar = Expected waste based on that machine's historical average." iconSize={14} />
                </h4>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={wasteAnalyticsData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" label={{ value: 'Kilograms (Kg)', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" label={{ value: 'Meters (m)', angle: 90, position: 'insideRight' }} stroke="#10b981" />
                        <Tooltip />
                        <Legend verticalAlign="top" height={36} />
                        
                        {/* 2.0% Goal Line (Reference for every machine) */}
                        <ReferenceLine yAxisId="left" y={0} stroke="#000" />
                        
                        <Bar yAxisId="left" dataKey="waste" name="Actual Waste (Kg)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
                        <Bar yAxisId="left" dataKey="benchValue" name="6-Month Average Target" fill="#f59e0b" opacity={0.5} radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar yAxisId="right" dataKey="meters" name="Production (m)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                    </BarChart>
                </ResponsiveContainer>
                <div style={{ textAlign: 'center', fontSize: '0.85rem', opacity: 0.6, marginTop: '1rem' }}>
                    Note: The light orange bars show your typical historical waste for the volume processed.
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                {wasteAnalyticsData.map((m, idx) => (
                    <div key={idx} className="glass-card" style={{ borderLeft: `6px solid ${m.efficiency > (m.benchRatio * 100) ? '#ef4444' : '#10b981'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0 }}>{m.name}</h4>
                            <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{m.efficiency.toFixed(1)}%</div>
                        </div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '1rem' }}>Waste Ratio</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>ACTUAL</div>
                                <div style={{ fontWeight: 700 }}>{m.waste.toFixed(1)} Kg</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: 700 }}>6-MO AVG</div>
                                <div style={{ fontWeight: 700 }}>{m.benchValue.toFixed(1)} Kg</div>
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem', height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ 
                                width: `${Math.min(100, (m.efficiency / (m.benchRatio * 100)) * 100)}%`, 
                                height: '100%', 
                                background: m.efficiency > (m.benchRatio * 100) ? '#ef4444' : '#10b981' 
                            }} />
                        </div>
                        <div style={{ fontSize: '0.7rem', marginTop: '4px', textAlign: 'right', opacity: 0.6 }}>
                            Performance vs. History
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
