import React from 'react';
import { Package, RefreshCw,ShieldCheck, ChevronRight } from 'lucide-react';

const DEPARTMENTS = [
  {
    id: 'sleeves',
    name: 'Sleeves Department',
    description: 'Forming and printing process monitoring, production metrics, and stock variance analysis.',
    icon: Package,
    color: '#6366f1',
    bgSoft: '#eef2ff',
    bgGrad: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    active: true
  },
  {
    id: 'recycling',
    name: 'Recycling Department',
    description: 'Waste material recovery, pelleting efficiency, and recycled stock management.',
    icon: RefreshCw,
    color: '#10b981',
    bgSoft: '#ecfdf5',
    bgGrad: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    active: false
  },
  {
    id: 'labels',
    name: 'Labels Department',
    description: 'Material efficiency tracking, slitting and rewinding activity, and order-level waste monitoring.',
    icon: ShieldCheck, // Using ShieldCheck or similar
    color: '#f43f5e',
    bgSoft: '#fff1f2',
    bgGrad: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
    active: true
  },
  {
    id: 'recycling',
    name: 'Recycling Department',
    description: 'Waste material recovery, pelleting efficiency, and recycled stock management.',
    icon: RefreshCw,
    color: '#10b981',
    bgSoft: '#ecfdf5',
    bgGrad: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    active: false
  }
];

function DepartmentHub({ onSelect }) {
  return (
    <div className="hub-container">
      <header style={{ marginBottom: '3rem' }}>
        <h1>Company Portal</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '600px' }}>
          Welcome to the Optimized Production System. Select a department to access its specific process monitoring and analytics.
        </p>
      </header>

      <div className="hub-grid">
        {DEPARTMENTS.map((dept) => (
          <div 
            key={dept.id} 
            className="dept-card"
            style={{ 
              '--bg': dept.bgGrad, 
              '--bg-soft': dept.bgSoft, 
              '--color': dept.color,
              opacity: dept.active ? 1 : 0.7
            }}
            onClick={() => dept.active && onSelect(dept.id)}
          >
            {!dept.active && <span className="badge">Coming Soon</span>}
            <div className="icon-box">
              <dept.icon size={40} />
            </div>
            <h2>{dept.name}</h2>
            <p>{dept.description}</p>
            {dept.active && (
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: dept.color }}>
                Enter Dashboard <ChevronRight size={18} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DepartmentHub;
