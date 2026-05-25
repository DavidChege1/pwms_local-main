import React from 'react';
import { Search, ChevronRight, AlertTriangle } from 'lucide-react';

const SlittingTables = ({ data, type }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [showOffSpecOnly, setShowOffSpecOnly] = React.useState(false);

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    return data.filter(item => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (item.JobHeader && item.JobHeader.toLowerCase().includes(search)) ||
        (item.Micron && item.Micron.toString().includes(search)) ||
        (item.InputWidth && item.InputWidth.toString().includes(search));
      
      const matchesOffSpec = !showOffSpecOnly || (type === 'B' && (item.IsOffSpec === true || item.IsOffSpec === 1));
      
      return matchesSearch && matchesOffSpec;
    });
  }, [data, searchTerm, showOffSpecOnly, type]);

  return (
    <div className="table-container" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="search-bar glass-card" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0.5rem 1rem', 
          borderRadius: '0.5rem',
          gap: '0.5rem',
          flex: 1,
          minWidth: '300px',
          background: 'white',
          border: '1px solid #ddd',
          boxShadow: 'none'
        }}>
          <Search size={18} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Search by Job, Micron, or Width..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-main)', 
              width: '100%', 
              outline: 'none',
              fontSize: '0.9rem'
            }}
          />
        </div>

        {type === 'B' && (
          <button
            onClick={() => setShowOffSpecOnly(!showOffSpecOnly)}
            style={{
              padding: '0.7rem 1.2rem',
              borderRadius: '10px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              background: showOffSpecOnly ? '#ef4444' : 'rgba(239, 68, 68, 0.05)',
              color: showOffSpecOnly ? 'white' : '#ef4444',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              boxShadow: showOffSpecOnly ? '0 4px 12px rgba(239, 68, 68, 0.3)' : 'none'
            }}
          >
            <AlertTriangle size={16} />
            {showOffSpecOnly ? 'Showing Off-Spec Only' : 'Show Off-Spec Only'}
          </button>
        )}
      </div>

      <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '1rem', background: 'white', border: '1px solid #eee' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #f1f5f9', background: '#f8fafc' }}>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job Header</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dimensions</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input Width</th>
              {type === 'B' && <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Req. Width</th>}
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weight Issued</th>
              {type === 'B' && <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Waste (kg)</th>}
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, i) => {
              const wastePct = item.WeightIssued > 0 ? (item.WasteWeight / item.WeightIssued) * 100 : 0;
              
              return (
                <tr key={i} style={{ 
                  borderBottom: '1px solid #f1f5f9',
                  background: type === 'B' && item.IsOffSpec ? 'rgba(239, 68, 68, 0.03)' : 'none',
                  borderLeft: type === 'B' && item.IsOffSpec ? '4px solid #ef4444' : '4px solid transparent'
                }}>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{item.TransactionDate}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{item.JobHeader}</div>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-main)' }}>{item.Micron}μm</td>
                  <td style={{ padding: '1rem', color: 'var(--text-main)', fontWeight: '600' }}>{item.InputWidth}mm</td>
                  {type === 'B' && (
                    <td style={{ padding: '1rem', color: 'var(--text-main)' }}>
                      {item.RequiredWidth}mm
                      {item.IsOffSpec && (
                        <AlertTriangle size={14} color="#ef4444" style={{ marginLeft: '0.5rem', display: 'inline' }} title="Off-Spec Reel Used" />
                      )}
                    </td>
                  )}
                  <td style={{ padding: '1rem', color: 'var(--text-main)', fontWeight: '600' }}>{item.WeightIssued.toLocaleString()} kg</td>
                  {type === 'B' && (
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span style={{ color: item.WasteWeight > 0 ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>
                            {item.WasteWeight.toLocaleString()} kg
                          </span>
                          <span style={{ opacity: 0.6 }}>{wastePct.toFixed(1)}%</span>
                        </div>
                        <div style={{ width: '100px', height: '4px', background: '#eee', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${Math.min(100, wastePct * 5)}%`, 
                            height: '100%', 
                            background: wastePct > 10 ? '#ef4444' : wastePct > 5 ? '#f59e0b' : '#10b981' 
                          }} />
                        </div>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No slitting records found for this criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default SlittingTables;
