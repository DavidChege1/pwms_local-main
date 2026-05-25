import React from 'react';
import { Filter, Search, Calendar, Maximize2, Scale, X, Layers } from 'lucide-react';

const SlittingSlicers = ({ filters, setFilters, onApply, isTypeB }) => {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFilters(prev => ({
      ...prev,
      [name]: newValue
    }));
  };

  const handleClear = () => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    setFilters({
      start_date: startOfMonth,
      end_date: endOfMonth,
      micron: '',
      width: '',
      min_weight: '',
      max_weight: '',
      job_header: '',
      is_off_spec: false
    });
    // Let the parent component handle re-fetching, it can call onApply right after.
    setTimeout(onApply, 0); 
  };

  return (
    <div className="dashboard-controls" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      
      {/* Date Range */}
      <div style={{ flex: 1, minWidth: '150px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Calendar size={14} style={{ marginRight: '4px' }} /> Start Date
        </label>
        <input 
          type="date" 
          name="start_date" 
          value={filters.start_date} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>
      
      <div style={{ flex: 1, minWidth: '150px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Calendar size={14} style={{ marginRight: '4px' }} /> End Date
        </label>
        <input 
          type="date" 
          name="end_date" 
          value={filters.end_date} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>

      {/* Micron */}
      <div style={{ flex: 1, minWidth: '120px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Layers size={14} style={{ marginRight: '4px' }} /> Micron
        </label>
        <input 
          type="number" 
          name="micron" 
          placeholder="e.g. 35"
          value={filters.micron} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>

      {/* Width */}
      <div style={{ flex: 1, minWidth: '120px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Maximize2 size={14} style={{ marginRight: '4px' }} /> Width (mm)
        </label>
        <input 
          type="number" 
          name="width" 
          placeholder="e.g. 1000"
          value={filters.width} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>

      {/* Weight Min */}
      <div style={{ flex: 1, minWidth: '140px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Scale size={14} style={{ marginRight: '4px' }} /> Min Weight (kg)
        </label>
        <input 
          type="number" 
          name="min_weight" 
          placeholder="e.g. 50"
          value={filters.min_weight} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>

      {/* Job Header */}
      <div style={{ flex: 1, minWidth: '180px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          <Search size={14} style={{ marginRight: '4px' }} /> Job Search
        </label>
        <input 
          type="text" 
          name="job_header" 
          placeholder="Search Jobs..."
          value={filters.job_header} 
          onChange={handleChange}
          style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #ddd', background: 'white' }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={handleClear}
          className="nav-tab"
          style={{ height: '48px', border: 'none', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <X size={16} /> Clear
        </button>
        
        <button 
          onClick={onApply}
          className="nav-tab active"
          style={{ height: '48px', border: 'none', padding: '0 2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Filter size={16} /> Update
        </button>
      </div>
    </div>
  );
};

export default SlittingSlicers;
