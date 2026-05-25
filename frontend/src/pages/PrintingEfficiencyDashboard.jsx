import React, { useState, useMemo, useEffect } from 'react';
import { printingApi } from '../services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, ScatterChart, Scatter, ZAxis, Cell
} from 'recharts';
import { 
  Zap, Layers, AlertCircle, TrendingUp, 
  Filter as FilterIcon, Target, Gauge, Clock, ArrowRightLeft, 
  Printer
} from 'lucide-react';
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

export default function PrintingEfficiencyDashboard() {
  const [efficiencyData, setEfficiencyData] = useState({ Details: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState('All');
  const [orderFilter, setOrderFilter] = useState('');
  const [benchmarks, setBenchmarks] = useState([]);
  
  const todayObj = new Date();
  const y = todayObj.getFullYear();
  const m = String(todayObj.getMonth() + 1).padStart(2, '0');
  const d = String(todayObj.getDate()).padStart(2, '0');
  
  const todayStr = `${y}-${m}-${d}`;
  const firstOfMonth = `${y}-${m}-01`;

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await printingApi.getEfficiencyReport(startDate, endDate);
      setEfficiencyData(result);
    } catch (e) {
      console.error("Failed to fetch printing efficiency", e);
      setError(e.message || "Could not connect to the backend.");
      setEfficiencyData({ Details: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, []);

  const machines = useMemo(() => {
    return ['All', ...new Set(efficiencyData.Details.map(r => r.MachineID))].sort();
  }, [efficiencyData.Details]);

  const filteredEfficiency = useMemo(() => {
    let details = efficiencyData.Details || [];
    
    // Machine Filter
    if (selectedMachine !== 'All') {
      details = details.filter(r => r.MachineID === selectedMachine);
    }
    
    // Order Filter
    if (orderFilter.trim() !== '') {
      details = details.filter(r => 
        String(r.ProductionOrder).toLowerCase().includes(orderFilter.toLowerCase())
      );
    }
    
    return details;
  }, [efficiencyData.Details, selectedMachine, orderFilter]);

  const stats = useMemo(() => {
    const activeJobs = filteredEfficiency.filter(d => d.ActualRunMeters > 0);
    return {
      plannedMeters: filteredEfficiency.reduce((sum, r) => sum + (r.PlannedMeters || 0), 0),
      actualMeters: filteredEfficiency.reduce((sum, r) => sum + (r.ActualRunMeters || 0), 0),
      actualWeight: filteredEfficiency.reduce((sum, r) => sum + (r.ActualWeight || 0), 0),
      changeovers: new Set(activeJobs.map(d => d.ProductionOrder)).size,
    };
  }, [filteredEfficiency]);

  // Fetch Benchmarks for "Standard Waste" reference
  useEffect(() => {
    const fetchBenchmarks = async () => {
      try {
        const res = await printingApi.getBenchmarks();
        setBenchmarks(res);
      } catch (e) {
        console.error("Failed to fetch benchmarks", e);
      }
    };
    fetchBenchmarks();
  }, []);

  const benchmarkWaste = useMemo(() => {
    if (!benchmarks.length || stats.actualWeight === 0) return 0;
    
    let ratio = 0;
    if (selectedMachine === 'All') {
      const totalHWeight = benchmarks.reduce((sum, b) => sum + (b.TotalWeight || 0), 0);
      const totalHWaste = benchmarks.reduce((sum, b) => sum + (b.TotalWaste || 0), 0);
      ratio = totalHWeight > 0 ? totalHWaste / totalHWeight : 0;
    } else {
      const b = benchmarks.find(b => b.MachineID === selectedMachine);
      ratio = b ? b.WasteRatio : 0;
    }
    return stats.actualWeight * ratio;
  }, [benchmarks, selectedMachine, stats.actualWeight]);

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
      .map(g => ({
        ...g,
        avgMeters: g.meters / g.count
      }))
      .sort((a, b) => a.colors - b.colors);
  }, [filteredEfficiency]);

  return (
    <div className="printing-efficiency-dashboard">
      <div className="dashboard-controls" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            <Printer size={14} style={{ marginRight: '4px' }} /> Order #
          </label>
          <input 
            type="text" 
            placeholder="Search Order..." 
            value={orderFilter}
            onChange={(e) => setOrderFilter(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            <FilterIcon size={14} style={{ marginRight: '4px' }} /> Machine Filter
          </label>
          <select 
            value={selectedMachine} 
            onChange={(e) => setSelectedMachine(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd' }}
          >
            <option value="All">All Machines</option>
            {machines.filter(m => m !== 'All').map(m => <option key={m} value={m}>{getMachineName(m)}</option>)}
          </select>
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="nav-tab active"
          style={{ height: '48px', border: 'none', padding: '0 2rem' }}
        >
          {loading ? 'Analyzing...' : 'Refresh Efficiency'}
        </button>
      </div>

      {error && (
        <div className="alert-error" style={{ background: '#fff5f5', color: '#c53030', padding: '1rem', borderRadius: '10px', marginBottom: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <div className="summary-grid">
        <div className="stat-card prod" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Total Running Meters</h3>
              <div className="value">{stats.actualMeters.toLocaleString(undefined, {maximumFractionDigits:0})} m</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Targets: {stats.plannedMeters.toLocaleString(undefined, {maximumFractionDigits:0})} m</div>
            </div>
            <Printer size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>
        
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Actual Change-overs
                <InfoTooltip title="Actual Changeover" text="The distinct number of production orders processed by the machine, representing a real physical setup change." iconSize={14} />
              </h3>
              <div className="value">{stats.changeovers} Jobs</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Based on recorded output</div>
            </div>
            <ArrowRightLeft size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>

        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Meters/Kg (Yield)
                <InfoTooltip title="Yield Efficiency" text="The linear meters produced per kilogram of BOPP material consumed. Influenced by material thickness (Microns)." iconSize={14} />
              </h3>
              <div className="value">{stats.actualWeight > 0 ? (stats.actualMeters / stats.actualWeight).toFixed(1) : 0}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>Running Efficiency Index</div>
            </div>
            <Zap size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>

        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #64748b 0%, #334155 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Benchmark Waste</h3>
              <div className="value">{benchmarkWaste.toFixed(0)} Kg</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>
                <Target size={12} style={{ display: 'inline', marginRight: '4px' }} />
                6-Month Rolling Standard
              </div>
            </div>
            <Target size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>
      </div>

      <div className="efficiency-view" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Complexity Chart */}
          <div className="chart-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <Layers size={20} color="#6366f1" />
              <h4 style={{ margin: 0 }}>Complexity vs. Throughput</h4>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1.5rem' }}>
              Setup complexity ($n \times 15$ mins) affects throughput. Bubbles represent job volume.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="colors" type="number" name="Colors" unit=" clr" label={{ value: 'Number of Colors', position: 'bottom', offset: 0 }} />
                <YAxis dataKey="avgMeters" type="number" name="Avg Meters" unit=" m" label={{ value: 'Avg Meters/Job', angle: -90, position: 'left' }} />
                <ZAxis dataKey="count" range={[50, 400]} name="Orders" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Jobs" data={complexityData} fill="#6366f1">
                  {complexityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Planned vs. Actual Performance */}
          <div className="chart-card">
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <Gauge size={20} color="#f59e0b" />
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                Planned vs. Actual Achievement
                <InfoTooltip title="Production Waste Gap" text="Compares scheduled meters against actual run meters. The target (Planned) incorporates an inbuilt 2% Production Waste allowance per color, plus setup meters." />
              </h4>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[{ name: 'Overall', planned: stats.plannedMeters, actual: stats.actualMeters }]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v) => `${v.toLocaleString()} m`} />
                <Legend />
                <Bar dataKey="planned" name="Target (Planned)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Achieved (Run)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: stats.actualMeters > stats.plannedMeters ? '#ef4444' : '#10b981' }}>
                {stats.plannedMeters > 0 ? ((stats.actualMeters / stats.plannedMeters) * 100).toFixed(1) : 0}%
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Target Achievement</div>
            </div>
          </div>
        </div>

        <div className="table-wrapper glass-card" style={{ padding: '0' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>Job Performance Drill-down</h4>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Standard Setup: 15 mins / color</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Product Details</th>
                <th>Colors</th>
                <th>Order Date</th>
                <th>Planned (m)</th>
                <th>Actual (m)</th>
                <th>Variance %</th>
                <th>Est. Setup</th>
              </tr>
            </thead>
            <tbody>
              {filteredEfficiency.length > 0 ? (
                filteredEfficiency.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.ProductionOrder}</td>
                    <td style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{row.ItemCode}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{row.ProductDescription}</div>
                    </td>
                    <td>
                      <span style={{ 
                        padding: '4px 10px', 
                        background: row.NumColors > 7 ? '#fef2f2' : row.NumColors > 4 ? '#fffbeb' : '#f0f9ff', 
                        color: row.NumColors > 7 ? '#991b1b' : row.NumColors > 4 ? '#92400e' : '#0369a1',
                        borderRadius: '12px', 
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        border: `1px solid ${row.NumColors > 7 ? '#fee2e2' : row.NumColors > 4 ? '#fef3c7' : '#e0f2fe'}`
                      }}>
                        {row.NumColors} {row.NumColors === 0 ? 'Plain' : 'Clr'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{row.OrderDate}</td>
                    <td style={{ fontWeight: 600, cursor: 'help' }} title="Target includes Setup Meters (50-200m/clr) + 2% per color Production Waste.">
                      {row.PlannedMeters.toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, color: '#6366f1' }}>{row.ActualRunMeters.toLocaleString()}</td>
                    <td>
                      <span style={{ 
                        color: row.VariancePercent > 2 ? '#ef4444' : row.VariancePercent < -2 ? '#10b981' : '#f59e0b',
                        background: row.VariancePercent > 2 ? '#fef2f2' : row.VariancePercent < -2 ? '#f0fdf4' : '#fffbeb',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '0.85rem'
                      }}>
                        {row.VariancePercent > 0 ? '+' : ''}{row.VariancePercent}%
                      </span>
                    </td>
                    <td>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#666' }} title="Standard allocation: 15 mins per color setup.">
                          <Clock size={12} /> {row.EstSetupTimeMins} min
                       </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ padding: '3rem', color: '#999' }}>
                    {loading ? 'Analyzing performance data...' : 'No efficient data for selected period.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
