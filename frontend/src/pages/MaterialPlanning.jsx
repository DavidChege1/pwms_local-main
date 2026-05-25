import React, { useState, useMemo, useEffect } from 'react';
import { ptsApi } from '../services/api';
import { Layers, Package, Target, Database, ChevronDown, ChevronRight, X, RotateCw, AlertCircle } from 'lucide-react';
import InfoTooltip from '../components/InfoTooltip';

// ─── Shared number formatter ───────────────────────────────────────────────
const fmt = (n, dec = 0) =>
  (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec });

// =============================================================================
// MATERIAL PLANNING DASHBOARD
// =============================================================================
function MaterialPlanning() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ptsApi.getMaterialNeeds();
      setData(res);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch material requirements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [expandedKeys, setExpandedKeys] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(['Normal BOPP']);
  const [slicerMode, setSlicerMode] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [custFilter, setCustFilter] = useState('All');

  const customers = useMemo(() => {
    const list = [];
    data.forEach(g => g.Items.forEach(i => { if(i.CUSTOMER) list.push(i.CUSTOMER); }));
    return ['All', ...new Set(list)].sort();
  }, [data]);

  const activeData = useMemo(() => {
    let filteredGroups = [];
    data.forEach(g => {
      let filteredItems = [...g.Items];
      if (slicerMode === 'customer' && custFilter !== 'All') {
        filteredItems = filteredItems.filter(i => i.CUSTOMER === custFilter);
      }
      if (slicerMode === 'search' && searchTerm) {
        const q = searchTerm.toLowerCase();
        filteredItems = filteredItems.filter(i => 
          (i.ProductDescription || '').toLowerCase().includes(q) ||
          (i.ProductCode || '').toLowerCase().includes(q) ||
          String(i.DocNum || '').includes(q) ||
          String(i.ProdOrderNum || '').includes(q)
        );
      }

      if (filteredItems.length > 0 || g.is_idle) {
        const openQty = filteredItems.reduce((s, i) => s + (i.Remaining_Qnty || 0), 0);
        const estWeight = filteredItems.reduce((s, i) => s + (i.EstWeightKg || 0), 0);
        filteredGroups.push({
          ...g,
          TotalOpenQty: openQty,
          TotalEstWeightKg: estWeight,
          OrderLines: filteredItems.length,
          Items: filteredItems
        });
      }
    });
    return filteredGroups;
  }, [data, slicerMode, custFilter, searchTerm]);

  const kpis = useMemo(() => {
    if (!activeData.length) return { specs: 0, totalQty: 0, totalWeight: 0, matchedStock: 0 };
    
    // Accurate stock summing: Collect all unique Stock IDs across all visible groups
    const uniqueStock = new Map();
    activeData.forEach(g => {
      if (g.MatchedStock) {
        g.MatchedStock.forEach(s => {
          uniqueStock.set(s.id, s.weight);
        });
      }
    });

    const totalWeight = activeData.reduce((s, g) => s + g.TotalEstWeightKg, 0);
    const totalQty = activeData.reduce((s, g) => s + g.TotalOpenQty, 0);
    const matchedStock = Array.from(uniqueStock.values()).reduce((s, w) => s + w, 0);

    return {
      specs:       activeData.filter(g => !g.is_idle).length,
      totalQty,
      totalWeight,
      matchedStock
    };
  }, [activeData]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleKey = (key) => {
    setExpandedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Group data by Category for the sections
  const categorizedData = useMemo(() => {
    const cats = {};
    activeData.forEach(g => {
      const c = g.Category || 'Normal BOPP';
      if (!cats[c]) cats[c] = [];
      cats[c].push(g);
    });
    // Define ordering to match user reference image
    const order = ['Normal BOPP', 'CPP Material', 'Heat Sealable', '30% Recycled Bopp', '70% Recycled Bopp', 'Kraft Paper'];
    return Object.entries(cats).sort((a, b) => {
      const idxA = order.indexOf(a[0]);
      const idxB = order.indexOf(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [activeData]);

  const CATEGORY_STYLES = {
    'Normal BOPP':          { border: '#6366f1', bg: '#f5f7ff', text: '#4338ca' },
    '30% Recycled Bopp':    { border: '#8b5cf6', bg: '#f5f3ff', text: '#5b21b6' },
    '70% Recycled Bopp':    { border: '#a855f7', bg: '#faf5ff', text: '#6b21a8' },
    'CPP Material':         { border: '#10b981', bg: '#f0fdf4', text: '#059669' },
    'Heat Sealable':        { border: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
    'Kraft Paper':          { border: '#78350f', bg: '#fff7ed', text: '#92400e' },
  };

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
        <AlertCircle size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
        <h2>Failed to load Material Requirements</h2>
        <p>{error}</p>
        <button 
          onClick={fetchData} 
          style={{ marginTop: '1rem', padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Package size={24} color="#6366f1" /> Material Planning &amp; Procurement
        </h2>
        <p style={{ color: '#64748b', margin: '0.5rem 0 0' }}>
          Consolidated view of required master rolls needed to fulfill current open backorders.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Distinct Material Specs',  value: fmt(kpis.specs),       grad:'linear-gradient(135deg,#6366f1,#a855f7)', icon:<Layers size={28} style={{opacity:.3}} /> },
          { label: 'Total Remaining Qty (Pcs)',      value: fmt(kpis.totalQty),    grad:'linear-gradient(135deg,#f59e0b,#fbbf24)', icon:<Package size={28} style={{opacity:.3}} /> },
          { label: 'Est. Total Requirement',    value: `${fmt(kpis.totalWeight, 1)} Kg`, grad:'linear-gradient(135deg,#ef4444,#f87171)', icon:<Target size={28} style={{opacity:.3}} />, tooltip: 'Total estimated weight of master rolls required to complete the backorders.' },
          { label: 'Total in Warehouse',      value: `${fmt(kpis.matchedStock, 1)} Kg`, grad:'linear-gradient(135deg,#10b981,#34d399)', icon:<Database size={28} style={{opacity:.3}} />, tooltip: 'Total physical warehouse stock across all material specs matched in your current search. Note that BOPP variants (Plain, 30% Recy, 70% Recy) are consolidated.' },
        ].map(k => (
          <div key={k.label} className="stat-card" style={{ background: k.grad, color: 'white' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center' }}>
                  {k.label}
                  {k.tooltip && <InfoTooltip title={k.label} text={k.tooltip} iconSize={14} />}
                </h3>
                <div className="value">{k.value}</div>
              </div>
              {k.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Slicer Bar */}
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'center'}}>
        {[{id:'overview', label:'100% Overview'}, {id:'customer', label:'By Customer'}, {id:'search', label:'Search Product'}].map(m=>(
          <button key={m.id} onClick={()=>setSlicerMode(m.id)} style={{
            padding:'8px 16px',borderRadius:'20px',border:'none',cursor:'pointer',
            fontWeight:600,fontSize:'0.85rem',
            background: slicerMode===m.id?'#6366f1':'#f1f5f9',
            color: slicerMode===m.id?'white':'#475569',
          }}>{m.label}</button>
        ))}

        {slicerMode === 'customer' && (
          <select value={custFilter} onChange={e=>setCustFilter(e.target.value)}
            style={{padding:'8px 14px',borderRadius:'10px',border:'1px solid #e2e8f0',fontSize:'0.85rem',fontWeight:600}}>
            {customers.map(c=><option key={c}>{c}</option>)}
          </select>
        )}
        {slicerMode === 'search' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexGrow: 1, alignItems: 'center' }}>
            <div style={{ position: 'relative', flexGrow: 1 }}>
              <input 
                type="text" 
                placeholder="Search by product description…"
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '8px 40px 8px 14px', 
                  borderRadius: '10px', 
                  border: '1px solid #e2e8f0', 
                  fontSize: '0.85rem' 
                }}
              />
              {searchTerm && (
                <button 
                  onClick={() => { setSearchTerm(''); fetchData(); }}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4px', borderRadius: '50%', transition: 'color 0.2s'
                  }}
                  title="Clear & Refresh"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        )}
        
        <button 
          onClick={fetchData}
          style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0',
            background: 'white', color: '#475569', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
          }}
          title="Sync with Server"
        >
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
          Sync
        </button>
      </div>

      {loading && data.length === 0 ? (
        <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>Loading material requirements…</div>
      ) : categorizedData.length === 0 ? (
        <div style={{padding:'3rem',textAlign:'center',color:'#999'}}>No material data found.</div>
      ) : (
        categorizedData.map(([category, groups]) => {
          const style = CATEGORY_STYLES[category] || { border: '#94a3b8', bg: '#f8fafc', text: '#475569' };
          const isCatOpen = expandedCategories.includes(category);
          return (
            <div key={category} style={{ marginBottom: '1rem' }}>
              <div 
                onClick={() => toggleCategory(category)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer', padding: '10px 16px', borderRadius: '10px',
                  background: style.bg, borderLeft: `5px solid ${style.border}`,
                  marginBottom: isCatOpen ? '1rem' : '0.5rem',
                  transition: 'margin 0.2s ease',
                  userSelect: 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: style.border, display: 'flex', alignItems: 'center' }}>
                    {isCatOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </span>
                  <h3 style={{ fontSize: '1.05rem', color: style.text, margin: 0, fontWeight: 700 }}>
                    {category}
                  </h3>
                  <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 500, color: style.text }}>
                    ({groups.length} spec{groups.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: style.text, opacity: 0.8, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6, fontWeight: 400 }}>EST. TOTAL REQUIREMENT</div>
                  <div>{fmt(groups.reduce((s, g) => s + g.TotalEstWeightKg, 0), 1)} Kg</div>
                </div>
                <div style={{ width: '1px', height: '24px', background: style.border, opacity: 0.2, margin: '0 10px' }}></div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: style.text, opacity: 0.8, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6, fontWeight: 400 }}>TOTAL IN WAREHOUSE</div>
                  <div style={{ color: groups.reduce((s, g) => s + g.AvailableKg, 0) >= groups.reduce((s, g) => s + g.TotalEstWeightKg, 0) ? '#10b981' : '#f59e0b' }}>
                    {fmt(groups.reduce((s, g) => s + g.AvailableKg, 0), 1)} Kg
                  </div>
                </div>
              </div>

              {isCatOpen && (
                <div style={{ paddingLeft: '8px', borderLeft: '1px solid #e2e8f0', marginLeft: '12px' }}>
                  {groups.map((group, gi) => {
                    const key  = `${group.Microns}-${group.AvgWidth}-${category}-${group.is_idle ? 'idle' : 'req'}`;
                    const open = expandedKeys.includes(key);
                    
                    // Build breakdown tooltip content
                    let breakdownText = "No physical stock matches found.";
                    if (group.StockBreakdown && Object.keys(group.StockBreakdown).length > 0) {
                      breakdownText = Object.entries(group.StockBreakdown)
                        .map(([desc, weight]) => `• ${desc}: ${fmt(weight, 1)} Kg`)
                        .join('\n');
                    }

                    return (
                      <div key={key} className="glass-card" style={{ marginBottom: '0.75rem', overflow:'hidden', padding:0 }}>
                        {/* Group Header — click to expand */}
                        <div
                          onClick={() => toggleKey(key)}
                          style={{
                            display:'flex', alignItems:'center', gap:'1rem', padding:'1rem 1.5rem',
                            cursor:'pointer', background: open ? '#f8faff' : 'white',
                            borderBottom: open ? '1px solid #e2e8f0' : 'none',
                          }}
                        >
                          <span style={{color: style.border, flexShrink:0}}>
                            {open ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                          </span>
                          <div style={{flex:1,display:'grid',gridTemplateColumns:'120px 140px 140px 140px 140px 120px',gap:'1rem',alignItems:'center'}}>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600}}>MICRONS</div>
                              <div style={{fontWeight:700,fontSize:'1.1rem',color:'#1e293b'}}>{group.Microns} μ</div>
                            </div>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600, display:'flex', alignItems:'center'}}>
                                REEL WIDTH (mm)
                                <InfoTooltip title="Master Reel Width" text={`The exact width of the master reel required to run these products, pulled from the PerfectWidth spec. The bucket also contains a sub-average sleeve width of ${fmt(group.AvgWidth)}mm.`} iconSize={12} inline={true} />
                              </div>
                              <div style={{fontWeight:700,fontSize:'1.1rem',color:'#1e293b'}}>{fmt(group.PerfectWidth,1)}</div>
                            </div>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600}}>EST. REQUIREMENT</div>
                              <div style={{fontWeight:600,color:'#6366f1'}}>{fmt(group.TotalEstWeightKg,1)} Kg</div>
                            </div>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600, display:'flex', alignItems:'center'}}>
                                IN WAREHOUSE
                                <InfoTooltip title="Stock Breakdown" text={breakdownText} iconSize={12} inline={true} />
                              </div>
                              <div style={{fontWeight:700,color: group.AvailableKg >= group.TotalEstWeightKg ? '#10b981' : group.AvailableKg > 0 ? '#f59e0b' : '#ef4444'}}>
                                {fmt(group.AvailableKg,1)} Kg
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600}}>STOCK STATUS</div>
                              <span style={{
                                padding:'3px 8px', borderRadius:'10px', fontSize:'0.7rem', fontWeight:800,
                                background: group.is_idle ? '#f1f5f9' : group.AvailableKg >= group.TotalEstWeightKg ? '#f0fdf4' : group.AvailableKg > 0 ? '#fffbeb' : '#fef2f2',
                                color: group.is_idle ? '#475569' : group.AvailableKg >= group.TotalEstWeightKg ? '#166534' : group.AvailableKg > 0 ? '#92400e' : '#991b1b',
                              }}>
                                {group.is_idle ? 'IDLE STOCK' : group.AvailableKg >= group.TotalEstWeightKg ? 'STOCK READY' : group.AvailableKg > 0 ? 'PARTIAL' : 'NO STOCK'}
                              </span>
                            </div>
                            <div>
                              <div style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:600}}>ORDER LINES</div>
                              <div style={{fontWeight:600}}>{group.OrderLines}</div>
                            </div>
                          </div>
                        </div>

                        {/* Drill-down Table */}
                        {open && (
                          <table style={{width:'100%',borderCollapse:'collapse'}}>
                            <thead>
                              <tr style={{background:'#f8faff'}}>
                                <th style={{padding:'10px 16px',textAlign:'left',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>SAP Doc #</th>
                                <th style={{padding:'10px 16px',textAlign:'left',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Prod Order</th>
                                <th style={{padding:'10px 16px',textAlign:'left',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Customer</th>
                                <th style={{padding:'10px 16px',textAlign:'left',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Product Code</th>
                                <th style={{padding:'10px 16px',textAlign:'left',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Description</th>
                                <th style={{padding:'10px 16px',textAlign:'right',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Remaining Qty</th>
                                <th style={{padding:'10px 16px',textAlign:'right',fontSize:'0.78rem',color:'#64748b',fontWeight:700}}>Est. Kg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.Items.map((item, ii) => (
                                <tr key={ii} style={{borderTop:'1px solid #f1f5f9'}}>
                                  <td style={{padding:'9px 16px',fontSize:'0.82rem',color:'#64748b'}}>{item.DocNum}</td>
                                  <td style={{padding:'9px 16px',fontSize:'0.82rem',fontWeight:600,color:'#475569'}}>{item.ProdOrderNum || '—'}</td>
                                  <td style={{padding:'9px 16px',fontSize:'0.82rem'}}>{item.CUSTOMER}</td>
                                  <td style={{padding:'9px 16px',fontSize:'0.82rem',fontWeight:600}}>{item.ProductCode}</td>
                                  <td style={{padding:'9px 16px',fontSize:'0.82rem'}}>{item.ProductDescription}</td>
                                  <td style={{padding:'9px 16px',textAlign:'right',fontWeight:700,color:'#6366f1'}}>{fmt(item.Remaining_Qnty)}</td>
                                  <td style={{padding:'9px 16px',textAlign:'right',color:'#10b981'}}>{fmt(item.EstWeightKg,1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default MaterialPlanning;
