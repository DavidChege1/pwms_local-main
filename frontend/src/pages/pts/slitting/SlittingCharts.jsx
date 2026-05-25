import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Area
} from 'recharts';

const SlittingCharts = ({ history, typeB = [] }) => {
  // Format data for the trend charts
  const chartData = history.map(item => ({
    name: `${item.Year}-${String(item.Month).padStart(2, '0')}`,
    TypeA_Count: item.TypeA_Count,
    TypeB_Count: item.TypeB_Count,
    TypeA_Weight: item.TypeA_Weight,
    TypeB_Weight: item.TypeB_Weight,
    TotalWeight: item.TotalWeight,
    OrderVolume: item.OrderVolume
  })).reverse();

  // Calculate Top 5 Offenders by Waste Weight
  // This logic aggregates waste weight from all Type B records by their JobHeader,
  // then sorts them to identify the production runs with the highest material loss.
  const offenderData = React.useMemo(() => {
    const jobWaste = {};
    typeB.forEach(item => {
      if (item.IsOffSpec) {
        jobWaste[item.JobHeader] = (jobWaste[item.JobHeader] || 0) + item.WasteWeight;
      }
    });
    
    // Convert the map to an array of objects suitable for Recharts horizontal bar chart
    return Object.entries(jobWaste)
      .map(([name, waste]) => ({ name, waste: Math.round(waste) }))
      .sort((a, b) => b.waste - a.waste)
      .slice(0, 5);
  }, [typeB]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '2rem' }}>
      {/* 1. Main Trend Chart (Full Width) */}
      <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Slitting Frequency vs. Order Volumes (4 Year Trend)</h3>
        <ResponsiveContainer width="100%" height={450}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="name" fontSize={10} tick={{fill: '#888'}} />
            <YAxis yAxisId="left" fontSize={10} tick={{fill: '#888'}} label={{ value: 'Frequency (Jobs)', angle: -90, position: 'insideLeft', style: {textAnchor: 'middle'} }} />
            <YAxis yAxisId="right" orientation="right" fontSize={10} tick={{fill: '#888'}} label={{ value: 'Market Demand (kg)', angle: 90, position: 'insideRight', style: {textAnchor: 'middle'} }} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="TypeA_Count" stackId="a" name="Plain Slitting (MRP Inefficiency)" fill="#6366f1" barSize={35} />
            <Bar yAxisId="left" dataKey="TypeB_Count" stackId="a" name="Off-Spec Printing (Process Waste)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={35} />
            <Line yAxisId="right" type="monotone" dataKey="OrderVolume" name="Market Order Volume" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 2. Tonnage Analysis Chart (Full Width) */}
      <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Tonnage Analysis (kg)</h3>
        <ResponsiveContainer width="100%" height={450}>
          <AreaChart data={chartData}>
             <defs>
              <linearGradient id="colorWeightA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorWeightB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Area type="monotone" dataKey="TypeA_Weight" stackId="1" name="Plain Slitting Tonnage" stroke="#6366f1" fillOpacity={1} fill="url(#colorWeightA)" />
            <Area type="monotone" dataKey="TypeB_Weight" stackId="1" name="Off-Spec Printing Tonnage" stroke="#ef4444" fillOpacity={1} fill="url(#colorWeightB)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 3. Top Offenders Chart (Full Width, at the bottom) */}
      <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Top 5 Off-Spec Jobs by Waste (kg)</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={offenderData} layout="vertical" margin={{ left: 60, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
            <XAxis type="number" fontSize={10} tick={{fill: '#888'}} />
            <YAxis dataKey="name" type="category" fontSize={10} tick={{fill: '#888'}} width={100} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Bar dataKey="waste" name="Waste (kg)" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Helper since AreaChart wasn't imported directly
const AreaChart = ({ children, data }) => {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data}>
        {children}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default SlittingCharts;
