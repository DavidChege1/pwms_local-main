import React, { useState, useEffect } from 'react';
import { labelsApi } from '../services/api';
import { Target, Scissors, Trash2, Search, Download, Brain } from 'lucide-react';
import PredictionCard from '../components/PredictionCard';

function LabelsDashboard() {
  const [activeTab, setActiveTab] = useState('efficiency');
  
  const todayObj = new Date();
  const y = todayObj.getFullYear();
  const m = String(todayObj.getMonth() + 1).padStart(2, '0');
  const d = String(todayObj.getDate()).padStart(2, '0');
  
  const todayStr = `${y}-${m}-${d}`;
  const firstOfMonth = `${y}-${m}-01`;
  
  const [dateRange, setDateRange] = useState({
    start: firstOfMonth,
    end: todayStr
  });
  
  const [data, setData] = useState({ efficiency: [], slitting: [], waste: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, [dateRange, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'efficiency') {
        const res = await labelsApi.getMaterialTargets(dateRange.start, dateRange.end);
        res.sort((a, b) => {
          const tA = a.TransDate ? new Date(a.TransDate).getTime() : 0;
          const tB = b.TransDate ? new Date(b.TransDate).getTime() : 0;
          return tB - tA;
        });
        setData(prev => ({ ...prev, efficiency: res }));
      } else if (activeTab === 'slitting') {
        const res = await labelsApi.getSlittingActivity(dateRange.start, dateRange.end);
        res.sort((a, b) => {
          const tA = a.SlitDate ? new Date(a.SlitDate).getTime() : 0;
          const tB = b.SlitDate ? new Date(b.SlitDate).getTime() : 0;
          return tB - tA;
        });
        setData(prev => ({ ...prev, slitting: res }));
      } else if (activeTab === 'waste') {
        const res = await labelsApi.getWasteByOrder(dateRange.start, dateRange.end);
        res.sort((a, b) => {
          const tA = a.ProductionDate ? new Date(a.ProductionDate).getTime() : 0;
          const tB = b.ProductionDate ? new Date(b.ProductionDate).getTime() : 0;
          return tB - tA;
        });
        setData(prev => ({ ...prev, waste: res }));
      }
    } catch (err) {
      console.error('Failed to fetch labels data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = (data[activeTab] || []).filter(row => {
    const matchesSearch = Object.values(row).some(val => 
      String(val).toLowerCase().includes(search.toLowerCase())
    );
    
    if (activeTab === 'waste') {
      const matchesShift = shiftFilter === 'ALL' || row.ProductionShift === shiftFilter;
      return matchesSearch && matchesShift;
    }
    
    return matchesSearch;
  });

  const calculateSummary = () => {
    if (activeTab !== 'efficiency') return null;
    const totals = filteredData.reduce((acc, row) => ({
      target: acc.target + (row.Production_Sqr_Meters_Target || 0),
      actual: acc.actual + (row.Production_Sqr_Meters_Actual || 0),
      waste: acc.waste + (row.Production_Waste_Sqr_Mtrs_Actual || 0)
    }), { target: 0, actual: 0, waste: 0 });
    
    const efficiency = (totals.actual / totals.target) * 100 || 0;
    return { totals, efficiency };
  };

  const summary = calculateSummary();

  return (
    <div className="labels-dashboard">
      <div className="dashboard-controls glass-card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', opacity: 0.7 }}>Search Orders</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
            <input 
              type="text" 
              placeholder="Filter results..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '35px' }}
            />
          </div>
        </div>

        {activeTab === 'waste' && (
          <div style={{ minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', opacity: 0.7 }}>Shift Filter</label>
            <select 
              value={shiftFilter} 
              onChange={(e) => setShiftFilter(e.target.value)}
              style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd' }}
            >
              <option value="ALL">All Shifts</option>
              <option value="DAY">Day Shift</option>
              <option value="NIGHT">Night Shift</option>
            </select>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', opacity: 0.7 }}>From</label>
          <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', opacity: 0.7 }}>To</label>
          <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
        </div>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="nav-tab active"
          style={{ height: '44px', border: 'none', padding: '0 2rem', whiteSpace: 'nowrap' }}
        >
          {loading ? 'Fetching...' : 'Update Report'}
        </button>
        <button className="nav-tab" onClick={() => {/* TODO: Export CSV */}} style={{ padding: '0.8rem' }} title="Export CSV">
          <Download size={18} />
        </button>
      </div>

      <div className="sub-tabs">
        <button className={`sub-tab ${activeTab === 'efficiency' ? 'active' : ''}`} onClick={() => setActiveTab('efficiency')}>
          <Target size={16} style={{ marginBottom: '-3px', marginRight: '6px' }} /> Material Efficiency
        </button>
        <button className={`sub-tab ${activeTab === 'slitting' ? 'active' : ''}`} onClick={() => setActiveTab('slitting')}>
          <Scissors size={16} style={{ marginBottom: '-3px', marginRight: '6px' }} /> Slitting Activity
        </button>
        <button className={`sub-tab ${activeTab === 'waste' ? 'active' : ''}`} onClick={() => setActiveTab('waste')}>
          <Trash2 size={16} style={{ marginBottom: '-3px', marginRight: '6px' }} /> Process Waste
        </button>
      </div>

      {activeTab === 'efficiency' && summary && (
        <div className="summary-grid">
          <div className="stat-card prod">
            <h3>Actual Output</h3>
            <div className="value">{Math.round(summary.totals.actual).toLocaleString()} <small>Sqm</small></div>
          </div>
          <div className="stat-card prod" style={{ filter: 'brightness(0.9)' }}>
            <h3>Target Output</h3>
            <div className="value">{Math.round(summary.totals.target).toLocaleString()} <small>Sqm</small></div>
          </div>
          <div className="stat-card waste">
            <h3>Material Waste</h3>
            <div className="value">{Math.round(summary.totals.waste).toLocaleString()} <small>Kg</small></div>
          </div>
          <div className="stat-card percent">
            <h3>Production Efficiency</h3>
            <div className="value">{summary.efficiency.toFixed(1)}%</div>
          </div>

          {/* --- MACHINE LEARNING PREDICTION --- */}
          {summary.totals.actual > 0 && (
            <PredictionCard 
              title="Predicted Waste"
              features={{
                Department: 'LABELS',
                ProducedSqm: summary.totals.actual,
                TargetEfficiency: summary.efficiency
              }} 
            />
          )}
        </div>
      )}

      <div className="table-wrapper">
        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>Loading data from PTL database...</div>
        ) : (
          <table>
            <thead>
              {activeTab === 'efficiency' && (
                <tr>
                  <th>Date</th>
                  <th>Job Card</th>
                  <th>Customer</th>
                  <th>Label Description</th>
                  <th>Substrate</th>
                  <th>Target (Sqm)</th>
                  <th>Actual (Sqm)</th>
                  <th>Waste (Sqm)</th>
                  <th>Target (Pcs)</th>
                  <th>Actual (Pcs)</th>
                </tr>
              )}
              {activeTab === 'slitting' && (
                <tr>
                  <th>Slit Date</th>
                  <th>Parent Batch</th>
                  <th>Parent Len</th>
                  <th>Parent Width</th>
                  <th>Parent Sqm</th>
                  <th>Substrate</th>
                  <th>Child Batch</th>
                  <th>Child Len</th>
                  <th>Child Sqm</th>
                </tr>
              )}
              {activeTab === 'waste' && (
                <tr>
                  <th>Production Date</th>
                  <th>Job Card</th>
                  <th>Product</th>
                  <th>Machine</th>
                  <th>Operator</th>
                  <th>Shift</th>
                  <th>Prod Waste (Kg)</th>
                  <th>Trim Waste (Kg)</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr><td colSpan="12" style={{ padding: '3rem', opacity: 0.5 }}>No records found for the selected period.</td></tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr key={idx}>
                    {activeTab === 'efficiency' && (
                      <>
                        <td>{row.TransDate?.split(' ')[0]}</td>
                        <td style={{ fontWeight: 700 }}>{row.JobCard}</td>
                        <td style={{ fontSize: '0.8rem' }}>{row.Customer}</td>
                        <td style={{ color: 'var(--secondary-color)', fontWeight: 600 }}>{row.LabelDescription}</td>
                        <td>{row.MaterialType}</td>
                        <td>{row.Production_Sqr_Meters_Target?.toFixed(1)}</td>
                        <td style={{ fontWeight: 700 }}>{row.Production_Sqr_Meters_Actual?.toFixed(1)}</td>
                        <td style={{ color: 'var(--accent)' }}>{row.Production_Waste_Sqr_Mtrs_Actual?.toFixed(1)}</td>
                        <td>{row.Production_Pcs_Labels_Target?.toLocaleString()}</td>
                        <td>{row.Production_Pcs_Labels_Actual?.toLocaleString()}</td>
                      </>
                    )}
                    {activeTab === 'slitting' && (
                      <>
                        <td>{row.SlitDate}</td>
                        <td style={{ fontWeight: 700 }}>{row.ParentBatchNo}</td>
                        <td>{row.ParentLength}</td>
                        <td>{row.ParentWidth}</td>
                        <td>{row.ParentSqrMtrs?.toFixed(1)}</td>
                        <td style={{ color: 'var(--secondary-color)' }}>{row.MaterialType}</td>
                        <td style={{ fontWeight: 700 }}>{row.ChildBatchNo}</td>
                        <td>{row.ChildLength}</td>
                        <td>{row.ChildSqrMtrs?.toFixed(1)}</td>
                      </>
                    )}
                    {activeTab === 'waste' && (
                      <>
                        <td>{row.ProductionDate}</td>
                        <td style={{ fontWeight: 700 }}>{row.JobCard}</td>
                        <td>{row.LabelDescription}</td>
                        <td style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{row.MachineName}</td>
                        <td>{row.MachineOperator}</td>
                        <td>{row.ProductionShift}</td>
                        <td style={{ color: 'var(--secondary-color)', fontWeight: 700 }}>{row.ProductionWaste_Kgs?.toFixed(1)}</td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{row.TrimWaste_Kgs?.toFixed(1)}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default LabelsDashboard;
