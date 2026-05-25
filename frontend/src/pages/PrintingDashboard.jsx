import React, { useState, useMemo } from 'react';
import { printingApi, mlApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Printer, Zap, Layers, AlertCircle, Database, TrendingUp, Filter as FilterIcon, Brain } from 'lucide-react';
import MaterialHealthWidget from '../components/MaterialHealthWidget';
import InfoTooltip from '../components/InfoTooltip';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const MACHINE_NAMES = {
  "PRINTING_1": "Printing_1 (Uflex)",
  "PRINTING_2": "Printing_2 (G1)",
  "PRINTING_3": "Printing_3 (G2)",
  "PRINTING_4": "Printing_4 (Roto)",
  "ECO_FLEX": "ECO FLEX"
};

const getMachineName = (id) => MACHINE_NAMES[id] || id;

export default function PrintingDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('analytics');
  const [selectedMachine, setSelectedMachine] = useState('All');

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
      const result = await printingApi.getBoppReport(startDate, endDate);
      setData(result);
    } catch (e) {
      console.error("Failed to fetch printing data", e);
      setError(e.message || "Could not connect to the backend.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const machines = useMemo(() => {
    return ['All', ...new Set(data.map(r => r.MachineID))].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    if (selectedMachine === 'All') return data;
    return data.filter(r => r.MachineID === selectedMachine);
  }, [data, selectedMachine]);

  const stats = useMemo(() => {
    return {
      totalWeight: filteredData.reduce((sum, r) => sum + (r.BoppWeight || 0), 0),
      totalMeters: filteredData.reduce((sum, r) => sum + (r.RunMeters || 0), 0),
      reelsCount: filteredData.length
    };
  }, [filteredData]);

  // Historical Benchmark Logic (Replaces ML)
  // Currently uses a standard 2% historical average until per-machine SQL benchmarks are fully hooked up.
  const benchmarkWaste = useMemo(() => {
    return stats.totalWeight * 0.02;
  }, [stats.totalWeight]);

  const analytics = useMemo(() => {
    const machineMap = {};
    const shiftMap = { Day: { name: 'Day', value: 0 }, Night: { name: 'Night', value: 0 } };

    filteredData.forEach(row => {
      // Machine Aggregation
      if (!machineMap[row.MachineID]) {
        machineMap[row.MachineID] = {
          id: row.MachineID,
          name: getMachineName(row.MachineID),
          meters: 0,
          weight: 0
        };
      }
      machineMap[row.MachineID].weight += (row.BoppWeight || 0);
      machineMap[row.MachineID].meters += (row.RunMeters || 0);

      // Shift Aggregation
      const shift = row.ProductionShift || 'Day';
      if (shiftMap[shift]) {
        shiftMap[shift].value += (row.BoppWeight || 0);
      }
    });

    return {
      machines: Object.values(machineMap).sort((a, b) => b.meters - a.meters),
      shifts: Object.values(shiftMap).filter(s => s.value > 0)
    };
  }, [filteredData]);

  const topMachine = analytics.machines[0] || { name: 'N/A', meters: 0 };

  return (
    <div className="printing-dashboard">
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
            <FilterIcon size={14} style={{ marginRight: '4px' }} /> Machine Filter
          </label>
          <select
            value={selectedMachine}
            onChange={(e) => setSelectedMachine(e.target.value)}
            style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd' }}
          >
            {machines.map(m => <option key={m} value={m}>{getMachineName(m)}</option>)}
          </select>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="nav-tab active"
          style={{ height: '48px', border: 'none', padding: '0 2rem' }}
        >
          {loading ? 'Fetching...' : 'Update Report'}
        </button>
      </div>

      {error && (
        <div className="alert-error" style={{ background: '#fff5f5', color: '#c53030', padding: '1rem', borderRadius: '10px', marginBottom: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={20} /> {error}
        </div>
      )}

      <MaterialHealthWidget />

      <div className="summary-grid">
        <div className="stat-card prod" style={{ background: 'var(--primary-grad)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Total BOPP Weight
                <InfoTooltip title="Total BOPP Weight" text="The total gross weight of material consumed by the printing machines during the selected timeframe." iconSize={14} />
              </h3>
              <div className="value">{stats.totalWeight.toLocaleString()} Kg</div>
            </div>
            <Printer size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>
        <div className="stat-card prod" style={{ background: 'var(--secondary-grad)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Total Running Meters
                <InfoTooltip title="Running Meters" text="Total linear meters fed through the machines. High meters with low weight indicates thin material jobs." iconSize={14} />
              </h3>
              <div className="value">{stats.totalMeters.toLocaleString()} m</div>
            </div>
            <Zap size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center' }}>
                Historical Waste Target
                <InfoTooltip title="SQL Benchmark" text="Theoretical standard waste allowance for this volume, calculated from historical performance baselines. Currently at 2.0%." iconSize={14} />
              </h3>
              <div className="value">
                {benchmarkWaste.toFixed(1)} Kg
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '4px' }}>
                <Database size={12} style={{ display: 'inline', marginRight: '4px' }} />
                SQL Benchmark (2.0%)
              </div>
            </div>
            <Database size={32} style={{ opacity: 0.3 }} />
          </div>
        </div>
      </div>

      <div className="sub-tabs">
        <div className={`sub-tab ${activeSubTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveSubTab('analytics')}>
          <TrendingUp size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Printing Analytics
        </div>
        <div className={`sub-tab ${activeSubTab === 'data' ? 'active' : ''}`} onClick={() => setActiveSubTab('data')}>
          <Database size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Activity Data
        </div>
      </div>

      {activeSubTab === 'analytics' ? (
        <div className="analytics-view" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

          <div className="chart-card" style={{ gridColumn: '1 / -1', height: '600px' }}>
            <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-main)', fontSize: '1.2rem' }}>Machine Performance: Meters & Consumption</h4>
            <ResponsiveContainer width="100%" height="90%">
              <MemoizedBarChart data={analytics.machines} />
            </ResponsiveContainer>
            <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '1rem', textAlign: 'center' }}>
              Note: This graph uses independent scales for Meters and Kilograms to allow side-by-side comparison.
            </p>
          </div>

          <div className="chart-card">
            <h4 style={{ marginBottom: '1.5rem' }}>Shift Productivity Distribution</h4>
            <ResponsiveContainer width="100%" height="85%">
              <MemoizedPieChart data={analytics.shifts} />
            </ResponsiveContainer>
          </div>

          <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--primary-grad)', color: 'white' }}>
            <h2 style={{ fontSize: '3rem', margin: 0 }}>{stats.totalWeight > 0 ? (stats.totalMeters / stats.totalWeight).toFixed(1) : 0}</h2>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Meters per Kg (Efficiency)</p>
            <div style={{ marginTop: '2rem', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }}>
              <div style={{ width: '75%', height: '100%', background: 'white' }}></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="table-wrapper glass-card" style={{ padding: '0' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Shift</th><th>Machine</th><th>Order #</th><th>Item Description</th><th>Reel Index</th><th>Weight (Kg)</th><th>Meters</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.TransactionDate}</td>
                    <td><span className={`badge-shift ${row.ProductionShift}`}>{row.ProductionShift}</span></td>
                    <td style={{ fontWeight: 'bold' }}>{row.MachineID}</td>
                    <td>{row.ProductionOrder}</td>
                    <td style={{ textAlign: 'left', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.ItemDescription}</td>
                    <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{row.ReelIndex}</td>
                    <td style={{ fontWeight: '700' }}>{row.BoppWeight.toLocaleString()}</td>
                    <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{row.RunMeters ? row.RunMeters.toLocaleString() : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8" style={{ padding: '3rem', color: 'var(--text-secondary)' }}>{loading ? 'Fetching activity records...' : 'No printing records found.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const MemoizedBarChart = React.memo(({ data }) => (
  <BarChart data={data} layout="vertical" margin={{ left: 40, right: 40, top: 20 }}>
    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />

    {/* Meter Axis (Scale 0 - 100k+) */}
    <XAxis type="number" xAxisId="meters" hide />

    {/* Weight Axis (Scale 0 - 2k+) */}
    <XAxis type="number" xAxisId="weight" hide />

    <YAxis dataKey="name" type="category" width={100} tick={{ fontWeight: 'bold' }} />

    <Tooltip
      cursor={{ fill: 'rgba(0,0,0,0.05)' }}
      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}
      formatter={(value, name) => {
        if (name === 'meters') return [`${value.toLocaleString()} m`, 'Run Meters'];
        if (name === 'weight') return [`${value.toLocaleString()} Kg`, 'BOPP Consumption'];
        return [value, name];
      }}
    />

    <Legend verticalAlign="top" height={36} />

    {/* Run Meters Bar (Indigo) */}
    <Bar
      dataKey="meters"
      name="Run Meters (m)"
      xAxisId="meters"
      fill="#6366f1"
      radius={[0, 4, 4, 0]}
      barSize={20}
      isAnimationActive={false}
    />

    {/* BOPP Weight Bar (Emerald) */}
    <Bar
      dataKey="weight"
      name="BOPP Weight (Kg)"
      xAxisId="weight"
      fill="#10b981"
      radius={[0, 4, 4, 0]}
      barSize={10}
      isAnimationActive={false}
    />
  </BarChart>
));

const MemoizedPieChart = React.memo(({ data }) => (
  <PieChart>
    <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} isAnimationActive={false}>
      {data.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
    </Pie>
    <Tooltip formatter={(v) => [`${v.toLocaleString()} Kg`, 'Shift Weight']} />
    <Legend verticalAlign="bottom" />
  </PieChart>
));
