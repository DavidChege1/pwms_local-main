import React from 'react';
import { Scissors, Trash2, AlertTriangle, Weight } from 'lucide-react';

const SlittingMetrics = ({ typeA, typeB }) => {
  const totalSlitWeight = typeA.reduce((sum, item) => sum + item.WeightIssued, 0) + 
                          typeB.reduce((sum, item) => sum + item.WeightIssued, 0);
  
  const totalWaste = typeB.reduce((sum, item) => sum + item.WasteWeight, 0);
  const offSpecCount = typeB.filter(item => item.IsOffSpec).length;
  const wastePercentage = totalSlitWeight > 0 ? (totalWaste / totalSlitWeight) * 100 : 0;

  const metrics = [
    {
      title: 'Total Throughput (kg)',
      value: `${totalSlitWeight.toLocaleString()} kg`,
      icon: <Scissors size={24} />,
      color: '#6366f1'
    },
    {
      title: 'Post-Print Waste',
      value: `${totalWaste.toLocaleString()} kg`,
      icon: <Trash2 size={24} />,
      color: '#ef4444',
      subtitle: `${wastePercentage.toFixed(1)}% of total slitting`
    },
    {
      title: 'Off-Spec Usage',
      value: offSpecCount,
      icon: <AlertTriangle size={24} />,
      color: '#f59e0b',
      subtitle: 'Jobs using wider reels'
    },
    {
      title: 'Avg. Reel Weight',
      value: `${(totalSlitWeight / ((typeA.length + typeB.length) || 1)).toFixed(1)} kg`,
      icon: <Weight size={24} />,
      color: '#10b981'
    }
  ];

  return (
    <div className="metrics-grid" style={{ 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
      gap: '1.5rem',
      marginBottom: '2rem' 
    }}>
      {metrics.map((m, i) => (
        <div key={i} className="metric-card glass-card" style={{ 
          padding: '1.5rem', 
          borderRadius: '1rem',
          borderLeft: `4px solid ${m.color}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>{m.title}</span>
            <div style={{ color: m.color }}>{m.icon}</div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{m.value}</div>
          {m.subtitle && <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '0.2rem' }}>{m.subtitle}</div>}
        </div>
      ))}
    </div>
  );
};

export default SlittingMetrics;
