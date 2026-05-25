import React, { useState, useMemo, useEffect } from 'react';
import { sleevesApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Database, TrendingUp, Filter as FilterIcon, Download, Target } from 'lucide-react';
import MaterialHealthWidget from '../components/MaterialHealthWidget';
import InfoTooltip from '../components/InfoTooltip';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const MACHINE_LIST = Array.from({ length: 13 }, (_, i) => `F${i + 1}`);

export default function SleevesDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('data');
  const [selectedMachine, setSelectedMachine] = useState('All');
  const [benchmarks, setBenchmarks] = useState([]);
  const [benchmarkWaste, setBenchmarkWaste] = useState({ value: 0, loading: false });
  
  const todayObj = new Date();
  const y = todayObj.getFullYear();
  const m = String(todayObj.getMonth() + 1).padStart(2, '0');
  const d = String(todayObj.getDate()).padStart(2, '0');
  
  const todayStr = `${y}-${m}-${d}`;
  const firstOfMonth = `${y}-${m}-01`;

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  // Fetch Benchmarks on mount
  useEffect(() => {
    const fetchBenchmarks = async () => {
      try {
        const res = await sleevesApi.getBenchmarks();
        setBenchmarks(res);
      } catch (e) {
        console.error("Failed to fetch forming benchmarks", e);
      }
    };
    fetchBenchmarks();
  }, []);

  const fetchData = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await sleevesApi.getReport(startDate, endDate);
      setData(result);
    } catch (e) {
      console.error("Failed to fetch sleeve data", e);
      setError("Could not connect to the backend.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [startDate, endDate]);

  const filteredRawData = useMemo(() => {
    if (selectedMachine === 'All') return data;
    return data.filter(r => r.MACHINE === selectedMachine);
  }, [data, selectedMachine]);

  const totals = useMemo(() => {
    return filteredRawData.reduce((acc, row) => ({
      pcs: acc.pcs + (row.TOTAL_PCS || 0),
      weight: acc.weight + (row.TOTAL_WEIGHT || 0),
      waste: acc.waste + (row.daily_waste || 0)
    }), { pcs: 0, weight: 0, waste: 0 });
  }, [filteredRawData]);
  // --- CALC BENCHMARK FROM HISTORICAL DATA ---
  useEffect(() => {
    if (!benchmarks.length || totals.weight === 0) {
      setBenchmarkWaste({ value: 0, loading: false });
      return;
    }

    let ratio = 0;
    if (selectedMachine === 'All') {
      const totalHWeight = benchmarks.reduce((sum, b) => sum + (b.TotalWeight || 0), 0);
      const totalHWaste = benchmarks.reduce((sum, b) => sum + (b.TotalWaste || 0), 0);
      ratio = totalHWeight > 0 ? totalHWaste / totalHWeight : 0;
    } else {
      const b = benchmarks.find(b => b.MACHINE === selectedMachine);
      ratio = b ? b.WasteRatio : 0;
    }

    setBenchmarkWaste({
       value: totals.weight * ratio,
       loading: false
    });
  }, [benchmarks, selectedMachine, totals.weight]);

  // --- PIVOT LOGIC FOR MATRIX TABLE ---
  const matrixData = useMemo(() => {
    if (filteredRawData.length === 0) return { dates: [], rows: [] };

    const uniqueDates = [...new Set(filteredRawData.map(r => r.PROD_DATE))].sort();
    const machinesToShow = selectedMachine === 'All' ? MACHINE_LIST : [selectedMachine];

    const rows = machinesToShow.map(machine => {
      let cumPcs = 0;
      let cumWeight = 0;
      
      const machineDates = {};
      uniqueDates.forEach(date => {
        const record = filteredRawData.find(r => r.MACHINE === machine && r.PROD_DATE === date) || {};
        
        const dayPcs = record.DAY_PCS || 0;
        const nightPcs = record.NIGHT_PCS || 0;
        const dayWeight = record.DAY_WEIGHT || 0;
        const nightWeight = record.NIGHT_WEIGHT || 0;
        const totalPcs = dayPcs + nightPcs;
        const totalWeight = dayWeight + nightWeight;
        
        cumPcs += totalPcs;
        cumWeight += totalWeight;
        
        machineDates[date] = {
          dayPcs, nightPcs, totalPcs, cumPcs,
          dayWeight, nightWeight, totalWeight, cumWeight
        };
      });
      
      return { machine, dates: machineDates };
    });

    return { dates: uniqueDates, rows };
  }, [filteredRawData, selectedMachine]);

  const machineStatsInfo = useMemo(() => {
    const stats = {};
    filteredRawData.forEach(row => {
      if (!stats[row.MACHINE]) {
        stats[row.MACHINE] = { name: row.MACHINE, production: 0, waste: 0 };
      }
      stats[row.MACHINE].production += (row.TOTAL_WEIGHT || 0);
      stats[row.MACHINE].waste += (row.daily_waste || 0);
    });
    
    return Object.values(stats)
      .filter(s => s.production > 0 || s.waste > 0)
      .map(s => ({
        ...s,
        wastePercent: s.production > 0 ? ((s.waste / (s.production + s.waste)) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.waste - a.waste);
  }, [filteredRawData]);

  const topWaster = machineStatsInfo[0] || { name: 'N/A', waste: 0 };

  const exportToExcel = () => {
    if (matrixData.dates.length === 0) return;
    
    const excelStyles = `
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #cbd5e0; padding: 8px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 9pt; text-align: center; }
        .m-hdr { background-color: #f8fafc; font-weight: bold; }
        .d-hdr { background-color: #f1f5f9; font-weight: bold; }
        .col-day { background-color: #e3f2fd; }
        .col-night { background-color: #f3e5f5; }
        .col-daily { background-color: #e8f5e9; font-weight: bold; }
        .col-cum { background-color: #fff3e0; font-weight: bold; }
        .col-total { background-color: #fffbe6; font-weight: bold; }
        .machine-cell { background-color: #f8fafc; font-weight: bold; text-align: left; }
      </style>
    `;

    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8" />${excelStyles}</head>
      <body>
        <table>
          <thead>
            <tr>
              <th rowspan="3" class="m-hdr">MACHINE</th>
              <th rowspan="3" class="col-total">TOTAL KG</th>
              ${matrixData.dates.map(date => `<th colspan="8" class="d-hdr">${date}</th>`).join('')}
            </tr>
            <tr>
              ${matrixData.dates.map(() => `
                <th colspan="2" class="col-day">DAY</th>
                <th colspan="2" class="col-night">NIGHT</th>
                <th colspan="2" class="col-daily">DAILY TOTAL</th>
                <th colspan="2" class="col-cum">CU. TOTAL</th>
              `).join('')}
            </tr>
            <tr>
              ${matrixData.dates.map(() => `
                <th class="col-day">PCS</th><th class="col-day">KG</th>
                <th class="col-night">PCS</th><th class="col-night">KG</th>
                <th class="col-daily">PCS</th><th class="col-daily">KG</th>
                <th class="col-cum">PCS</th><th class="col-cum">KG</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    matrixData.rows.forEach(row => {
      const machineTotalWeight = matrixData.dates.reduce((sum, date) => sum + (row.dates[date]?.totalWeight || 0), 0);
      tableHtml += `
        <tr>
          <td class="machine-cell">${row.machine}</td>
          <td class="col-total">${machineTotalWeight.toLocaleString()}</td>
          ${matrixData.dates.map(date => {
            const d = row.dates[date];
            return `
              <td class="col-day">${d.dayPcs || '-'}</td><td class="col-day">${d.dayWeight || '-'}</td>
              <td class="col-night">${d.nightPcs || '-'}</td><td class="col-night">${d.nightWeight || '-'}</td>
              <td class="col-daily">${d.totalPcs || '-'}</td><td class="col-daily">${d.totalWeight || '-'}</td>
              <td class="col-cum">${d.cumPcs.toLocaleString()}</td><td class="col-cum">${d.cumWeight.toLocaleString()}</td>
            `;
          }).join('')}
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `forming_matrix_${startDate}_to_${endDate}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-content">
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
            <option value="All">All Machines (F1-F13)</option>
            {MACHINE_LIST.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={fetchData} disabled={loading} className="nav-tab active" style={{ height: '48px', border: 'none', padding: '0 1.5rem' }}>
            {loading ? '...' : 'Update'}
          </button>
          <button 
            onClick={exportToExcel} 
            disabled={filteredRawData.length === 0} 
            className="nav-tab" 
            style={{ height: '48px', border: 'none', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#27ae60', color: 'white' }}
          >
            <Download size={18} /> Export
          </button>
        </div>
      </div>
      
      <MaterialHealthWidget />

      <div className="summary-grid">
        <div className="stat-card prod">
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            Total Production
            <InfoTooltip title="Total Production" text="The sum of all good sleeves produced (in pieces), translated to Kg using the engineered weight of each sleeve." iconSize={14} />
          </h3>
          <div className="value">{totals.pcs.toLocaleString()} Pcs</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>({totals.weight.toLocaleString()} Kg)</div>
        </div>
        <div className="stat-card waste">
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            Recorded Waste
            <InfoTooltip title="Recorded Waste" text="The raw physical scrap weighed at the machine scale at the end of a shift." iconSize={14} />
          </h3>
          <div className="value">{totals.waste.toLocaleString()} Kg</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: 'white' }}>
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            Overall Efficiency
            <InfoTooltip title="Yield Efficiency" text="Calculated as (Total Valid Production Kg) ÷ (Total Valid Production Kg + Total Waste Kg). Higher is better." iconSize={14} />
          </h3>
          <div className="value">
            {totals.weight > 0 ? ((totals.weight / (totals.weight + totals.waste)) * 100).toFixed(2) : '100'}%
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Yield Rate</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', color: 'white' }}>
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            Top Waster
            <InfoTooltip title="Top Waster" text="The specific machine that contributed the highest volume of physical waste during this timeframe." iconSize={14} />
          </h3>
          <div className="value">{topWaster.name}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{topWaster.waste.toLocaleString()} Kg</div>
        </div>

        {totals.weight > 0 && (
          <div className="stat-card" style={{ borderLeft: '4px solid #9b59b6', background: 'rgba(155, 89, 182, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Target size={20} color="#9b59b6" />
              <h3 style={{ margin: 0, color: '#444', display: 'flex', alignItems: 'center' }}>
                Historical Benchmark
                <InfoTooltip title="SQL Benchmark" text="Calculated using a stable 6-month historical average of machine performance. Currently fixed at 2.0% until live." iconSize={14} />
              </h3>
              <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#666' }}>6-Month Rolling Avg</div>
            </div>
            
            <div className="value" style={{ color: '#8e44ad' }}>
                {benchmarkWaste.loading ? 'Updating...' : `${benchmarkWaste.value.toLocaleString(undefined, {maximumFractionDigits: 1})} Kg`}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>
                Standard waste for {totals.weight.toLocaleString()} Kg production
            </div>
          </div>
        )}
      </div>

      <div className="sub-tabs">
        <div className={`sub-tab ${activeSubTab === 'data' ? 'active' : ''}`} onClick={() => setActiveSubTab('data')}>
          <Database size={16} className="mr-2" style={{ verticalAlign: 'middle' }} /> Production Movement
        </div>
        <div className={`sub-tab ${activeSubTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveSubTab('analytics')}>
          <TrendingUp size={16} className="mr-2" style={{ verticalAlign: 'middle' }} /> Waste Analytics
        </div>
      </div>

      {activeSubTab === 'data' ? (
        <div className="matrix-container glass-card" style={{ overflowX: 'auto', padding: '1rem' }}>
           <div className="matrix-scroll-wrapper" style={{ overflowX: 'auto' }}>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th rowSpan="3" style={{ position: 'sticky', left: 0, zIndex: 10, background: '#f8f9fa' }}>Machine</th>
                    <th rowSpan="3" style={{ background: '#fffbe6', fontWeight: 'bold' }}>Total Kg</th>
                    {matrixData.dates.map(date => (
                      <th key={date} colSpan="8" style={{ textAlign: 'center', borderLeft: '2px solid #ddd' }}>{date}</th>
                    ))}
                  </tr>
                  <tr>
                    {matrixData.dates.map(date => (
                      <React.Fragment key={date}>
                        <th colSpan="2" style={{ borderLeft: '2px solid #ddd', background: '#e3f2fd' }}>Day</th>
                        <th colSpan="2" style={{ background: '#f3e5f5' }}>Night</th>
                        <th colSpan="2" style={{ background: '#e8f5e9' }}>Daily Total</th>
                        <th colSpan="2" style={{ background: '#fff3e0' }}>Cu. Total</th>
                      </React.Fragment>
                    ))}
                  </tr>
                  <tr style={{ fontSize: '0.7rem' }}>
                    {matrixData.dates.map(date => (
                      <React.Fragment key={date}>
                        <th style={{ borderLeft: '2px solid #ddd' }}>Pcs</th><th>Kg</th>
                        <th>Pcs</th><th>Kg</th>
                        <th style={{ fontWeight: '800' }}>Pcs</th><th style={{ fontWeight: '800' }}>Kg</th>
                        <th style={{ fontWeight: '800' }}>Pcs</th><th style={{ fontWeight: '800' }}>Kg</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixData.rows.length > 0 ? (
                    matrixData.rows.map(row => {
                      const machineTotalWeight = matrixData.dates.reduce((sum, date) => sum + (row.dates[date]?.totalWeight || 0), 0);
                      return (
                        <tr key={row.machine}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 5, background: '#fff', fontWeight: 'bold' }}>{row.machine}</td>
                          <td style={{ background: '#fffbe6', fontWeight: 'bold' }}>{machineTotalWeight.toLocaleString()}</td>
                          {matrixData.dates.map(date => {
                            const d = row.dates[date];
                            return (
                              <React.Fragment key={date}>
                                <td style={{ borderLeft: '2px solid #ddd' }}>{d.dayPcs || '-'}</td>
                                <td>{d.dayWeight || '-'}</td>
                                <td>{d.nightPcs || '-'}</td>
                                <td>{d.nightWeight || '-'}</td>
                                <td style={{ background: '#f1f8f1', fontWeight: 'bold' }}>{d.totalPcs || '-'}</td>
                                <td style={{ background: '#f1f8f1', fontWeight: 'bold' }}>{d.totalWeight || '-'}</td>
                                <td style={{ background: '#fffbe6', fontWeight: 'bold', color: '#856404' }}>{d.cumPcs.toLocaleString()}</td>
                                <td style={{ background: '#fffbe6', fontWeight: 'bold', color: '#856404' }}>{d.cumWeight.toLocaleString()}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={2 + (matrixData.dates.length * 8)} style={{ padding: '3rem', color: '#999' }}>
                        {loading ? 'Calculating matrix...' : 'No production records found for the selected period.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="analytics-view" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
          <div className="chart-card">
            <h4>Waste per Machine (Kg)</h4>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={machineStatsInfo} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} />
                <Tooltip formatter={(value) => [`${value.toLocaleString()} Kg`, 'Waste']} />
                <Bar dataKey="waste" fill="#f43f5e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <h4>Waste Distribution</h4>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={machineStatsInfo.filter(s => s.waste > 0)} dataKey="waste" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                  {machineStatsInfo.map((e, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
