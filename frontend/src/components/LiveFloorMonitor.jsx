import React, { useState, useEffect } from 'react';
import { ptsApi } from '../services/api';
import { Activity, Clock, Package, CheckCircle2, AlertCircle, RefreshCw, Layers, MessageSquare, ListOrdered } from 'lucide-react';

const MachineCard = ({ machine }) => {
  const progress = machine.PlannedQty > 0 ? (machine.ProducedQty / machine.PlannedQty) * 100 : 0;
  
  return (
    <div className="glass-card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Background Status Pulse for Active Machines */}
      {machine.IsActive && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: '4px', height: '100%',
          background: '#22c55e', boxShadow: '0 0 10px #22c55e'
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>{machine.MachineID}</h4>
            {machine.PriorityIndex !== null && (
              <span style={{ 
                fontSize: '0.65rem', fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', 
                padding: '2px 6px', borderRadius: '4px', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: '2px'
              }}>
                <ListOrdered size={10} /> RANK #{machine.PriorityIndex}
              </span>
            )}
          </div>
          <span style={{ 
            fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
            background: machine.IsActive ? '#f0fdf4' : '#f1f5f9',
            color: machine.IsActive ? '#16a34a' : '#64748b',
            display: 'inline-block', marginTop: '4px', textTransform: 'uppercase'
          }}>
            {machine.IsActive ? '● Running' : '○ Idle / Setup'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Last Scan</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>{machine.LastScan.split(' ')[0]}</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>{machine.LastScan.split(' ')[1]}</div>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>PRODUCTION ORDER</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4f46e5' }}>{machine.ProductionOrder}</div>
        <div style={{ 
          fontSize: '0.85rem', color: '#475569', fontWeight: 500, marginTop: '2px', 
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
        }}>
          {machine.ItemDescription}
        </div>
      </div>

      {machine.ProductionComments && (
        <div style={{ 
          padding: '0.6rem', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px',
          fontSize: '0.8rem', color: '#92400e', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'flex-start'
        }}>
          <MessageSquare size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>{machine.ProductionComments}</span>
        </div>
      )}

      {/* Progress Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', fontWeight: 700 }}>
          <span style={{ color: '#64748b' }}>PROGRESS</span>
          <span style={{ color: '#1e293b' }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', width: `${Math.min(progress, 100)}%`, 
            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
            transition: 'width 0.5s ease-out'
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.75rem' }}>
            <span style={{ color: '#94a3b8' }}>Produced: <strong>{machine.ProducedQty.toLocaleString()}</strong></span>
            <span style={{ color: '#94a3b8' }}>Target: <strong>{machine.PlannedQty.toLocaleString()}</strong></span>
        </div>
      </div>
    </div>
  );
};

export default function LiveFloorMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const result = await ptsApi.getLiveFloor();
      setData(result);
      setLastRefreshed(new Date().toLocaleTimeString());
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to sync with factory floor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto refresh every 2 minutes
    const interval = setInterval(fetchStatus, 120000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) return (
    <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#64748b' }}>
      <RefreshCw size={32} className="animate-spin" />
      <p>Synchronizing with machine production logs...</p>
    </div>
  );

  return (
    <div style={{ padding: '0.5rem' }}>
      {/* KPI RIBBON */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ padding: '0.5rem', background: '#f0fdf4', color: '#16a34a', borderRadius: '8px' }}>
              <Activity size={20} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Active Machines</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
            {data?.Machines.filter(m => m.IsActive).length || 0} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>/ {data?.Machines.length || 0} Online</span>
          </div>
        </div>

        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ padding: '0.5rem', background: '#eff6ff', color: '#3b82f6', borderRadius: '8px' }}>
              <RefreshCw size={20} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Fleet Efficiency</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>
            {Math.round(data?.Machines.reduce((acc, m) => acc + (m.PlannedQty > 0 ? (m.ProducedQty / m.PlannedQty) * 100 : 0), 0) / (data?.Machines.length || 1))}% <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Avg Progress</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end' }}>
          <button 
            onClick={fetchStatus}
            disabled={loading}
            style={{ 
              padding: '0.6rem 1rem', borderRadius: '8px', background: 'white', border: '1px solid #e2e8f0',
              fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync Floor
          </button>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '6px' }}>Last Data Pulse: {lastRefreshed}</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', borderRadius: '12px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* Printing Units */}
      <div style={{ marginBottom: '3rem' }}>
        <h4 style={{ fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} /> Printing Section
        </h4>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '1.25rem',
          width: '100%'
        }}>
          {data?.Machines.filter(m => m.MachineID.startsWith('PR')).map(m => (
            <MachineCard key={m.MachineID} machine={m} />
          ))}
        </div>
      </div>

      {/* Forming Units */}
      <div>
        <h4 style={{ fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={14} /> Forming Section
        </h4>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '1.25rem',
          width: '100%'
        }}>
          {data?.Machines.filter(m => m.MachineID.startsWith('FORM')).map(m => (
            <MachineCard key={m.MachineID} machine={m} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: '3rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', fontSize: '0.85rem', color: '#64748b', border: '1px dashed #e2e8f0' }}>
         <strong>Logic Note:</strong> Machines are marked as 🟢 Running if a production reel was scanned within the last 2 hours. 
         Machines not scanning reels for &gt; 2 hours are marked as Idle/Setup, which may indicate a changeover, breakdown, or shift transition.
      </div>
    </div>
  );
}
