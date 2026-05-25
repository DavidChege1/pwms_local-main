import React, { useState, useEffect, useCallback } from 'react';
import { ptsApi } from '../services/api';
import { ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronUp, AlertCircle, Clock } from 'lucide-react';

const STATUS_CONFIG = {
  OK:       { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', icon: <ShieldCheck size={24} /> },
  WARN:     { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', icon: <ShieldAlert size={24} /> },
  CRITICAL: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', icon: <ShieldX size={24} /> },
  UNKNOWN:  { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', icon: <ShieldCheck size={24} /> },
};

export default function MaterialHealthWidget() {
  const [status, setStatus] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await ptsApi.getLiveIntegrity();
      setStatus(data);
    } catch (err) {
      console.error("The Guardian failed to poll integrity status", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading && !status) return <div className="glass-card" style={{ padding: '1rem', color: '#666' }}>Initializing Guardian...</div>;
  if (!status) return null;

  const config = STATUS_CONFIG[status.AlertLevel] || STATUS_CONFIG.OK;
  const mismatches = status.Machines.filter(m => m.Status !== 'OK' && m.Status !== 'UNKNOWN');

  return (
    <div 
      className="glass-card" 
      style={{ 
        marginBottom: '2rem', 
        borderLeft: `6px solid ${config.color}`,
        padding: 0,
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.05)'
      }}
    >
      {/* Header Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          padding: '1.2rem 1.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          cursor: 'pointer',
          background: config.bg
        }}
      >
        <div style={{ color: config.color }}>{config.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b', letterSpacing: '-0.02em' }}>
            Material Integrity Monitor
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {status.AlertLevel === 'OK' 
              ? `All ${status.TotalMachines} active machines matching engineering specs`
              : `${status.MismatchesFound} Mismatch${status.MismatchesFound > 1 ? 'es' : ''} detected across production lines`}
          </div>
        </div>
        
        <div style={{ textAlign: 'right', marginRight: '1rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            <Clock size={12} /> {status.Timestamp.split(' ')[1]}
          </div>
          <div style={{ 
            fontSize: '0.75rem', 
            fontWeight: 700, 
            color: config.color,
            marginTop: '2px'
          }}>
            SYSTEM: {status.AlertLevel}
          </div>
        </div>

        <div style={{ color: '#94a3b8' }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} /> }
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div style={{ padding: '1.5rem', background: 'white' }}>
          {mismatches.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {mismatches.map((m, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '1rem', 
                    borderRadius: '12px', 
                    border: `1px solid ${m.Status === 'CRITICAL' ? '#fecaca' : '#fde68a'}`,
                    background: m.Status === 'CRITICAL' ? '#fff1f2' : '#fffbeb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 800, color: '#1e293b' }}>{m.DisplayName}</span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 800, 
                      padding: '2px 8px', 
                      borderRadius: '10px',
                      background: m.Status === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                      color: 'white'
                    }}>
                      {m.Status}
                    </span>
                  </div>
                  
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
                    <b>Item:</b> {m.ItemCode} ({m.ItemDescription?.slice(0, 30)}...)
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.5)', padding: '6px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748b' }}>MICRON DEV.</div>
                      <div style={{ fontWeight: 700, color: m.MicronDelta > 2 ? '#ef4444' : '#1e293b' }}>
                        {m.MicronDelta > 0 ? `+${m.MicronDelta}` : m.MicronDelta}μ
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.5)', padding: '6px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748b' }}>WIDTH DEV.</div>
                      <div style={{ fontWeight: 700, color: m.WidthDelta < -0.1 ? '#ef4444' : '#1e293b' }}>
                        {m.WidthDelta > 0 ? `+${m.WidthDelta}` : m.WidthDelta}mm
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>
              <ShieldCheck size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <div>No material variances detected across active production lines.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
