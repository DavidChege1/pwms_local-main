import React, { useState, useEffect } from 'react';
import SlittingMetrics from './SlittingMetrics';
import SlittingCharts from './SlittingCharts';
import SlittingTables from './SlittingTables';
import SlittingSlicers from './SlittingSlicers';
import SlittingInsights from './SlittingInsights';
import { Loader2, Scissors, Info, TrendingUp, Database, FileSpreadsheet } from 'lucide-react';
import { ptsApi } from '../../../services/api';

const SlittingDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [showBrief, setShowBrief] = useState(false);
  
  // Calculate default dates: Start of current month to Today (Local Time)
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  
  const todayStr = `${y}-${m}-${d}`;
  const startOfMonth = `${y}-${m}-01`;

  const [filters, setFilters] = useState({
    start_date: startOfMonth,
    end_date: todayStr,
    micron: '',
    width: '',
    min_weight: '',
    max_weight: '',
    job_header: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Clean up empty filters
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== '')
      );
      
      const result = await ptsApi.getSlittingSummary(activeFilters);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) return (
    <div className="loading-container">
      <Loader2 className="animate-spin" size={48} color="#6366f1" />
      <p className="loading-text">Analyzing slitting activity data...</p>
    </div>
  );

  if (error) return (
    <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
      <p>Error: {error}</p>
      <button onClick={fetchData} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#ef4444', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}>
        Retry
      </button>
    </div>
  );

  return (
    <div className="slitting-dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scissors size={28} color="#6366f1" /> Slitting Activity Intelligence
          </h2>
          <p style={{ opacity: 0.6, fontSize: '0.9rem' }}>Tracking MRP inefficiencies and post-printing waste</p>
        </div>
      </div>

      {/* Global Slicers Control Panel */}
      <SlittingSlicers 
        filters={filters} 
        setFilters={setFilters} 
        onApply={fetchData} 
        isTypeB={activeTab === 'TypeB'}
      />

      {/* Tab Navigation */}
      <div className="sub-tabs">
        <div 
          className={`sub-tab ${activeTab === 'Overview' ? 'active' : ''}`} 
          onClick={() => setActiveTab('Overview')}
        >
          <TrendingUp size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Intelligence Overview
        </div>
        <div 
          className={`sub-tab ${activeTab === 'TypeA' ? 'active' : ''}`} 
          onClick={() => setActiveTab('TypeA')}
        >
          <Database size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Raw Data: Type A (Plain BOPP)
        </div>
        <div 
          className={`sub-tab ${activeTab === 'TypeB' ? 'active' : ''}`} 
          onClick={() => setActiveTab('TypeB')}
        >
          <FileSpreadsheet size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} /> Raw Data: Type B (Printed BOPP)
        </div>
      </div>

      {loading && data && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <Loader2 className="animate-spin" size={24} color="#6366f1" />
        </div>
      )}

      {/* Tab Content Rendering */}
      {activeTab === 'Overview' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
             <div />
             <button 
               onClick={() => setShowBrief(!showBrief)}
               style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
             >
               <Info size={16} /> {showBrief ? 'Hide Intelligence Brief' : 'Show Intelligence Brief'}
             </button>
          </div>

          {showBrief && (
            <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem', marginBottom: '2rem', borderLeft: '4px solid #6366f1' }}>
                <p style={{ opacity: 0.8, lineHeight: 1.6, marginTop: 0 }}>
                  <strong>Type A Slitting:</strong> Represents Plain BOPP. This is often an inefficiency related to Material Resource Planning (MRP) where the required width was not available in stock, forcing production to slit larger parent reels to create child reels.
                </p>
                <p style={{ opacity: 0.8, lineHeight: 1.6 }}>
                  <strong>Type B Slitting:</strong> Represents Printed BOPP. This occurs when jobs are printed on reels wider than the specification demands (Off-Spec). The excess is trimmed post-printing, resulting in material waste.
                </p>
                <p style={{ opacity: 0.8, lineHeight: 1.6, marginBottom: 0 }}>
                  Use the Slicers above to filter this data by material dimensions to identify which specific widths/microns are driving these inefficiencies.
                </p>
            </div>
          )}

          <SlittingMetrics 
            typeA={data?.TypeA || []} 
            typeB={data?.TypeB || []} 
          />

          {/* Dynamic Insights Engine: Provides automated warnings and inventory mismatch alerts */}
          <SlittingInsights 
            typeA={data?.TypeA || []} 
            typeB={data?.TypeB || []} 
            history={data?.History || []}
          />

          {/* Graphical Trends & Pareto Analysis */}
          <div style={{ marginBottom: '2rem' }}>
            <SlittingCharts 
              history={data?.History || []} 
              typeB={data?.TypeB || []}
            />
          </div>
        </>
      )}

      {activeTab === 'TypeA' && (
        <SlittingTables 
          data={data?.TypeA || []} 
          type="A" 
        />
      )}

      {activeTab === 'TypeB' && (
        <SlittingTables 
          data={data?.TypeB || []} 
          type="B" 
        />
      )}
    </div>
  );
};

export default SlittingDashboard;
