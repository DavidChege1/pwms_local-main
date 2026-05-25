import React, { useState } from 'react';
import { ptsApi } from '../services/api';
import { Truck, Calculator, Loader2, Package, Clock, Box, Activity, ListOrdered, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import InfoTooltip from '../components/InfoTooltip';
import LiveFloorMonitor from '../components/LiveFloorMonitor';

const CATEGORIES = [
  'Normal BOPP',
  'CPP Material',
  'Heat Sealable',
  '30% Recycled Bopp',
  '70% Recycled Bopp',
  'Kraft Paper'
];

export default function SalesEstimator() {
  // Sidebar is now permanently locked in place to prevent layout bugs.
  const [formData, setFormData] = useState({
    ProductCode: '',
    JobMeters: 50000,
    NumColors: 0,
    Microns: 35,
    Width: 960,
    Category: 'Normal BOPP',
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await ptsApi.getEstimate(formData);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to calculate estimate. Please check the backend connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: 'calc(100vh - 120px)', 
      background: '#f8fafc', 
      margin: '-1rem', // Counteract page padding
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* SIDEBAR: QUOTE ESTIMATOR (Locked at 420px) */}
      <div style={{
        width: '420px',
        minWidth: '420px',
        background: 'white',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{ 
          padding: '1.5rem', 
          overflowY: 'auto', 
          height: '100%',
          width: '420px'
        }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem', color: '#1e293b', fontSize: '1.1rem' }}>
            <Calculator size={22} color="#6366f1" /> Quote Simulator
          </h3>

          <form onSubmit={handleCalculate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  Job Meters
                </label>
                <input
                  type="number" name="JobMeters" value={formData.JobMeters} onChange={handleInputChange} required min="1"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ width: '100px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  Colors
                  <InfoTooltip text="Machine Capacities: G1 (3), Roto (6), G2 (6), Uflex (10)" />
                </label>
                <input
                  type="number" name="NumColors" value={formData.NumColors} onChange={handleInputChange} required min="0" max="10"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  Microns
                </label>
                <input
                  type="number" name="Microns" value={formData.Microns} onChange={handleInputChange} required min="5" step="0.5"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                  Width (mm)
                </label>
                <input
                  type="number" name="Width" value={formData.Width} onChange={handleInputChange} required min="100"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                Category
              </label>
              <select
                name="Category" value={formData.Category} onChange={handleInputChange}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '0.5rem', width: '100%' }}>
              {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Calculate Lead Time'}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          {/* Results Section inside Sidebar */}
          {result && (
            <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                borderRadius: '12px', padding: '1.25rem', color: 'white'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TARGET SHIP DATE</div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.25rem 0', color: '#c7d2fe' }}>
                  {result.EstimatedDates.MaterialAdjustedShipDate || result.EstimatedDates.BaseShipDate}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: '1rem' }}>
                  <span>{result.EstimatedTimeHours} Hrs Est.</span>
                  <span>{result.CurrentQueueMeters.toLocaleString()}m Queue</span>
                </div>
              </div>

              {/* Material Alert */}
              <div style={{
                padding: '1rem', borderRadius: '12px', 
                background: result.MaterialAvailableKg >= result.MaterialRequiredKg ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${result.MaterialAvailableKg >= result.MaterialRequiredKg ? '#bbf7d0' : '#fde68a'}`,
                fontSize: '0.8rem'
              }}>
                <div style={{ fontWeight: 700, color: result.MaterialAvailableKg >= result.MaterialRequiredKg ? '#166534' : '#92400e' }}>
                  {result.MaterialStatus}
                </div>
                <div style={{ color: result.MaterialAvailableKg >= result.MaterialRequiredKg ? '#15803d' : '#b45309' }}>
                  Requires {result.MaterialRequiredKg.toFixed(0)}kg / Stock: {result.MaterialAvailableKg.toFixed(0)}kg
                </div>
              </div>

              {/* Human Context (Priority & Notes) */}
              {(result.PriorityIndex !== null || result.ProductionComments || result.LineNote) && (
                <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {result.PriorityIndex !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ListOrdered size={14} color="#1d4ed8" />
                      <strong>Priority Rank #{result.PriorityIndex}</strong>
                    </div>
                  )}
                  {result.ProductionComments && (
                    <div style={{ display: 'flex', gap: '0.5rem', color: '#92400e' }}>
                      <MessageSquare size={14} />
                      <span style={{ fontStyle: 'italic' }}>{result.ProductionComments}</span>
                    </div>
                  )}
                  {result.LineNote && (
                    <div style={{ display: 'flex', gap: '0.5rem', opacity: 0.7 }}>
                      <FileText size={14} />
                      <span>{result.LineNote}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* MAIN CONTENT: LIVE FLOOR MONITOR */}
      <div style={{ 
        flex: 1, 
        minWidth: 0, // CRITICAL: Allows flex child to shrink/re-calculate Grid correctly
        overflowY: 'auto', 
        padding: '2rem',
        background: '#f8fafc'
      }}>
        <LiveFloorMonitor />
      </div>
    </div>
  );
}
