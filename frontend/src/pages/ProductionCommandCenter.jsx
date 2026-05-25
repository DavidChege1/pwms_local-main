import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ptsApi, notificationsApi } from '../services/api';
import { 
  ListOrdered, Package, Target, Search, Plus, ChevronUp, ChevronDown, 
  Trash2, RefreshCw, LayoutDashboard, Calendar, CheckCircle2, Timer, Play,
  Filter, X, Send, History, CheckCircle, XCircle, Clock, Download, Loader2, PlusCircle, Archive
} from 'lucide-react';

const fmt = (n, dec = 0) =>
  (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: dec, minimumFractionDigits: dec });

// =============================================================================
// VIEW 1: BACKLOG & ESTIMATION
// =============================================================================
function BacklogEstimationView({ data, loading, onAddToPlan, onAddBulkToPlan, queue }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [customerFilter, setCustomerFilter] = useState('All Customers');
  const [backlogType, setBacklogType] = useState('customers'); // 'customers' | 'stock' | 'all'
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

  const toggleGroup = (docNum) => {
    const key = String(docNum);
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const customers = useMemo(() => {
    // Only show customers relevant to the current type
    const baseData = data.filter(r => {
      const isStock = r.CUSTOMERID === 'STOCK' || r.CUSTOMER?.toLowerCase().includes('stock');
      if (backlogType === 'customers') return !isStock;
      if (backlogType === 'stock') return isStock;
      return true;
    });
    const list = [...new Set(baseData.map(r => r.CUSTOMER))].filter(Boolean).sort();
    return ['All Customers', ...list];
  }, [data, backlogType]);

  const filteredData = useMemo(() => {
    let result = [...data];

    // 1. Filter by Type (Customers vs Stock)
    if (backlogType === 'customers') {
      result = result.filter(r => r.CUSTOMERID !== 'STOCK' && !r.CUSTOMER?.toLowerCase().includes('stock'));
    } else if (backlogType === 'stock') {
      result = result.filter(r => r.CUSTOMERID === 'STOCK' || r.CUSTOMER?.toLowerCase().includes('stock'));
    }

    // 2. Default sort by Date (descending - recent first)
    result.sort((a, b) => {
      if (!a.DocDate && !b.DocDate) return 0;
      if (!a.DocDate) return 1;
      if (!b.DocDate) return -1;
      return b.DocDate.localeCompare(a.DocDate);
    });

    // 3. Filter by Customer Dropdown
    if (customerFilter !== 'All Customers') {
      result = result.filter(r => r.CUSTOMER === customerFilter);
    }

    // 4. Filter by Search Term
    if (!searchTerm) return result;
    const tokens = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
    return result.filter(r => {
      const searchStr = [
        r.DocNum?.toString() || '',
        r.LpoNo || '',
        r.CUSTOMER || '',
        r.ProductCode || '',
        r.ProductDescription || ''
      ].join(' ').toLowerCase();
      
      return tokens.every(token => searchStr.includes(token));
    });
  }, [data, searchTerm, customerFilter, backlogType]);

  // 5. Compute all possible selectable items (for selection logic)
  const allPossibleItems = useMemo(() => {
    if (!isGrouped) {
      return filteredData.map(r => ({ 
        ...r, 
        type: 'row', 
        uniqueId: r.uniqueId || `back-row-${r.DocNum}-${r.ProductCode}-${r.DocDate}` 
      }));
    }

    const items = [];
    const docMap = new Map();
    
    filteredData.forEach(r => {
      const docKey = String(r.DocNum || 'No Doc');
      if (!docMap.has(docKey)) docMap.set(docKey, new Map());
      const groupMap = docMap.get(docKey);
      const code = r.ProductCode || 'Unknown';
      
      if (!groupMap.has(code)) {
        groupMap.set(code, { 
          ...r, 
          type: 'child', 
          originalItems: [r],
          Remaining_Qnty: r.Remaining_Qnty || 0,
          Order_Qty: r.Order_Qty || 0,
          uniqueId: `back-cons-${docKey}-${code}`
        });
      } else {
        const existing = groupMap.get(code);
        existing.originalItems.push(r);
        existing.Remaining_Qnty += (r.Remaining_Qnty || 0);
        existing.Order_Qty += (r.Order_Qty || 0);
      }
    });

    docMap.forEach(groupMap => groupMap.forEach(item => items.push(item)));
    return items;
  }, [filteredData, isGrouped]);

  const displayData = useMemo(() => {
    if (!isGrouped) return allPossibleItems;

    const groups = [];
    const map = new Map();

    filteredData.forEach(r => {
      const docKey = String(r.DocNum || 'No Doc');
      if (!map.has(docKey)) {
        map.set(docKey, {
          type: 'group',
          DocNum: r.DocNum,
          docKey: docKey,
          DocDate: r.DocDate,
          CUSTOMER: r.CUSTOMER,
          items: [],
          totalRem: 0
        });
        groups.push(map.get(docKey));
      }
      const group = map.get(docKey);
      group.items.push(r);
      group.totalRem += (r.Remaining_Qnty || 0);
    });

    const final = [];
    groups.forEach(g => {
      final.push(g);
      if (expandedGroups.has(g.docKey)) {
        const groupItems = allPossibleItems.filter(item => item.uniqueId.startsWith(`back-cons-${g.docKey}-`));
        final.push(...groupItems);
      }
    });
    return final;
  }, [filteredData, isGrouped, expandedGroups, allPossibleItems]);

  const handleRowClick = (order) => {
    setSelectedOrder(order);
  };

  const toggleSelect = (order) => {
    const id = order.uniqueId;
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSelect = (group) => {
    const consolidated = new Map();
    group.items.forEach(item => consolidated.set(item.ProductCode, true));
    const groupIds = Array.from(consolidated.keys()).map(code => `back-cons-${group.docKey}-${code}`);
    
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      const allSelected = groupIds.every(id => next.has(id));
      groupIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const getSelectedOrders = () => {
    return allPossibleItems.filter(r => selectedRowIds.has(r.uniqueId));
  };

  return (
    <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.7)', 
          backdropFilter: 'blur(10px)',
          padding: '0.75rem 1rem', 
          borderRadius: '16px', 
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem'
        }}>
          {/* Backlog Type Slicers */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            <button 
              onClick={() => { setBacklogType('customers'); setCustomerFilter('All Customers'); }}
              style={{ 
                padding: '0.6rem 1rem', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.2s',
                background: backlogType === 'customers' ? 'white' : 'transparent',
                color: backlogType === 'customers' ? '#6366f1' : '#64748b',
                boxShadow: backlogType === 'customers' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Customers
            </button>
            <button 
              onClick={() => { setBacklogType('stock'); setCustomerFilter('All Customers'); }}
              style={{ 
                padding: '0.6rem 1rem', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.2s',
                background: backlogType === 'stock' ? 'white' : 'transparent',
                color: backlogType === 'stock' ? '#6366f1' : '#64748b',
                boxShadow: backlogType === 'stock' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Stock
            </button>
          </div>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>

          <button 
            onClick={() => setIsGrouped(prev => !prev)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: isGrouped ? '#6366f1' : 'white',
              color: isGrouped ? 'white' : '#64748b',
              fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {isGrouped ? <XCircle size={16}/> : <Plus size={16}/>}
            {isGrouped ? 'Ungroup' : 'Group by Doc No'}
          </button>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" placeholder="Search Customer, Description, Doc No, or LPO..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.75rem 1rem 0.75rem 2.5rem', 
                borderRadius: '12px', 
                border: '1px solid #e2e8f0', 
                fontSize: '0.9rem',
                background: 'white',
                transition: 'all 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
          
          <div style={{ position: 'relative', width: '250px' }}>
            <select 
              value={customerFilter} 
              onChange={e => setCustomerFilter(e.target.value)}
              style={{ 
                width: '100%', padding: '0.75rem 1rem', borderRadius: '12px', 
                border: '1px solid #e2e8f0', fontSize: '0.9rem', appearance: 'none',
                background: 'white', cursor: 'pointer',
                paddingRight: '2.5rem'
              }}
            >
              {customers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          </div>

          {(searchTerm || customerFilter !== 'All Customers') && (
            <button 
              onClick={() => { setSearchTerm(''); setCustomerFilter('All Customers'); }}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '6px', 
                padding: '0.6rem 1rem', borderRadius: '10px', border: 'none',
                background: '#fef2f2', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <X size={14} /> Clear
            </button>
          )}

          <div style={{ 
            padding: '0.5rem 0.75rem', 
            background: '#f1f5f9', 
            borderRadius: '10px', 
            fontSize: '0.75rem', 
            fontWeight: 800, 
            color: '#64748b',
            whiteSpace: 'nowrap'
          }}>
            {filteredData.length} <span style={{ fontWeight: 500 }}>{filteredData.length === 1 ? 'Order' : 'Orders'}</span>
          </div>

          {selectedRowIds.size > 0 && (
            <button 
              onClick={() => {
                const selected = getSelectedOrders();
                onAddBulkToPlan(selected);
                setSelectedRowIds(new Set());
              }}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                background: '#4f46e5', color: 'white', fontSize: '0.85rem', fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
              }}
            >
              <PlusCircle size={16} /> Add Selected ({selectedRowIds.size}) to Queue
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <th style={{ width: '40px', padding: '12px 8px', borderBottom: '2px solid #e2e8f0' }}></th>
                <th style={{ width: '40px', padding: '12px 8px', borderBottom: '2px solid #e2e8f0' }}></th>
                <th style={{ width: '80px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Doc No</th>
                <th style={{ width: '100px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Date</th>
                <th style={{ width: '200px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Customer</th>
                <th style={{ width: '110px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Item No</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Description</th>
                <th style={{ width: '85px', textAlign: 'right', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Qty</th>
                <th style={{ width: '95px', textAlign: 'right', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Rem Qty</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: '4rem' }}>
                    <div className="loading-container" style={{ height: 'auto' }}>
                      <Loader2 className="animate-spin" size={40} color="#6366f1" />
                      <p className="loading-text">Syncing Backlog Intelligence...</p>
                    </div>
                  </td>
                </tr>
              ) : displayData.map((r, i) => {
                if (r.type === 'group') {
                  const isExpanded = expandedGroups.has(String(r.DocNum || 'No Doc'));
                  const allInQueue = r.items.every(item => queue.some(q => String(q.DocNum) === String(item.DocNum) && q.ProductCode === item.ProductCode));
                  const someInQueue = r.items.some(item => queue.some(q => String(q.DocNum) === String(item.DocNum) && q.ProductCode === item.ProductCode));

                  return (
                    <tr key={`group-${r.docKey}`} style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <td style={{ width: '40px', padding: '12px 8px' }}>
                        {isExpanded && (
                          <input 
                            type="checkbox" 
                            checked={r.items.length > 0 && Array.from(new Set(r.items.map(item => item.ProductCode))).map(code => `back-cons-${r.docKey}-${code}`).every(id => selectedRowIds.has(id))}
                            onChange={() => toggleGroupSelect(r)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        )}
                      </td>
                      <td style={{ width: '40px', padding: '12px 8px' }}>
                        <button 
                          disabled={allInQueue}
                          onClick={() => {
                            const toAdd = r.items.filter(item => !queue.some(q => String(q.DocNum) === String(item.DocNum) && q.ProductCode === item.ProductCode));
                            if (toAdd.length > 0) onAddBulkToPlan(toAdd);
                          }}
                          style={{ 
                            padding: '6px', borderRadius: '10px', border: 'none', 
                            background: allInQueue ? '#f1f5f9' : '#e0e7ff', 
                            color: allInQueue ? '#94a3b8' : '#4f46e5', cursor: allInQueue ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          {allInQueue ? <CheckCircle2 size={16}/> : <Plus size={16}/>}
                        </button>
                      </td>
                      <td 
                        onClick={() => toggleGroup(r.DocNum)}
                        colSpan={2} 
                        style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', padding: '12px 8px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronDown size={14}/> : <ChevronUp size={14} style={{ transform: 'rotate(90deg)' }}/>}
                          DOC #{r.DocNum} <span style={{ fontWeight: 500, opacity: 0.6 }}>· {r.DocDate}</span>
                        </div>
                      </td>
                      <td colSpan={1} style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700, padding: '12px 8px' }}>{r.CUSTOMER}</td>
                      <td colSpan={3} style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, padding: '12px 8px' }}>
                        {r.items.length} Product Lines {someInQueue && <span style={{ color: '#10b981', marginLeft: '10px' }}>• {r.items.filter(item => queue.some(q => q.DocNum === item.DocNum && q.ProductCode === item.ProductCode)).length} Already in Queue</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#4f46e5', fontSize: '0.85rem', padding: '12px 8px' }}>{fmt(r.totalRem)}</td>
                    </tr>
                  );
                }

                const isInQueue = r.originalItems ? r.originalItems.every(oi => queue.some(j => String(j.DocNum) === String(oi.DocNum) && j.ProductCode === oi.ProductCode)) : queue.some(j => String(j.DocNum) === String(r.DocNum) && j.ProductCode === r.ProductCode);
                const someInQueue = r.originalItems ? r.originalItems.some(oi => queue.some(j => String(j.DocNum) === String(oi.DocNum) && j.ProductCode === oi.ProductCode)) : isInQueue;
                const isRepeatProduct = queue.some(q => q.Customer === r.CUSTOMER && q.ProductCode === r.ProductCode);
                const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                const isChild = r.type === 'child';

                return (
                  <tr 
                    key={r.uniqueId} 
                    onClick={() => handleRowClick(r)} 
                    onMouseEnter={e => {
                      if (String(selectedOrder?.DocNum) !== String(r.DocNum) || selectedOrder?.ProductCode !== r.ProductCode) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={e => {
                      if (String(selectedOrder?.DocNum) !== String(r.DocNum) || selectedOrder?.ProductCode !== r.ProductCode) e.currentTarget.style.background = 'transparent';
                    }}
                    style={{ 
                      cursor: 'pointer', 
                      background: (String(selectedOrder?.DocNum) === String(r.DocNum) && selectedOrder?.ProductCode === r.ProductCode) ? '#f1f5f9' : 'transparent',
                      transition: 'background 0.2s',
                      opacity: isChild ? 0.9 : 1
                    }}
                  >
                    <td onClick={e => e.stopPropagation()} style={{ width: '40px', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <input 
                        type="checkbox" 
                        disabled={isInQueue}
                        checked={selectedRowIds.has(r.uniqueId)}
                        onChange={() => toggleSelect(r)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ width: '40px', padding: '12px 8px', borderBottom: '1px solid #f1f5f9', paddingLeft: isChild ? '24px' : '8px' }}>
                      <button 
                        disabled={isInQueue}
                        onClick={() => onAddToPlan(r)}
                        style={{ 
                          padding: '6px', borderRadius: '10px', 
                          background: isInQueue ? '#f1f5f9' : someInQueue ? '#fef3c7' : isRepeatProduct ? '#fff7ed' : '#f0fdf4', 
                          color: isInQueue ? '#94a3b8' : someInQueue ? '#92400e' : isRepeatProduct ? '#ea580c' : '#16a34a', cursor: isInQueue ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                          border: (isRepeatProduct || someInQueue) && !isInQueue ? '1px dashed #fdba74' : 'none'
                        }}
                        title={isInQueue ? "Fully Planned" : someInQueue ? "Partially Planned" : isRepeatProduct ? "Same product already in queue for this customer!" : ""}
                      >
                        {isInQueue ? <CheckCircle2 size={16}/> : someInQueue ? <Clock size={16}/> : isRepeatProduct ? <RefreshCw size={16}/> : <Plus size={16}/>}
                      </button>
                    </td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{r.DocNum}</td>
                    <td style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{r.DocDate}</td>
                    <td style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700, padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.CUSTOMER}>{r.CUSTOMER}</td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4f46e5', padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.ProductCode}>{r.ProductCode}</td>
                    <td style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600, padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.ProductDescription}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {r.ProductDescription}
                        {isRepeatProduct && !isInQueue && <span style={{ fontSize: '0.6rem', color: '#ea580c', fontWeight: 800, background: '#fff7ed', padding: '1px 5px', borderRadius: '4px' }}>BATCH POTENTIAL</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.75rem', color: '#475569', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{fmt(r.Order_Qty)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, color: '#4f46e5', fontSize: '0.85rem', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{fmt(r.Remaining_Qnty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// VIEW 2: DAILY QUEUE (GLOBAL SHUFFLER)
// =============================================================================
function DailyQueueView({ queue, machines, backlogData, onShuffle, onDelete }) {
  // 1. Group Queue items by (Customer, ProductCode)
  const groupedQueue = useMemo(() => {
    const blocks = [];
    const map = new Map();

    queue.forEach((job, index) => {
      const key = `${job.Customer}-${job.ProductCode}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          Customer: job.Customer,
          ProductCode: job.ProductCode,
          Description: job.Description,
          jobs: [],
          totalRem: 0,
          originalIndices: [],
          firstIndex: index
        });
        blocks.push(map.get(key));
      }
      const block = map.get(key);
      
      // Push each job individually
      block.jobs.push({ 
        ...job, 
        originalIndex: index
      });
      
      block.totalRem += (job.Remaining_Qnty || 0);
      block.originalIndices.push(index);
    });

    // Sort blocks by their first appearance in the queue to maintain relative priority
    return blocks.sort((a, b) => a.firstIndex - b.firstIndex);
  }, [queue]);

  const getLiveStatus = (productCode) => {
    return machines.find(m => 
      m.ItemCode === productCode || 
      (m.ItemDescription || '').toLowerCase().includes((productCode || '').toLowerCase())
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. LIVE FLOOR RIBBON (TOP) */}
      <div className="glass-card" style={{ padding: '1.25rem', background: 'rgba(255, 255, 255, 0.4)' }}>
        <h4 style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }}></div>
          Live Floor Intelligence
        </h4>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
          gap: '1rem',
          maxHeight: '200px',
          overflowY: 'auto',
          paddingRight: '10px'
        }}>
          {machines.map(m => (
            <MachineCard key={m.MachineID} machine={m} isCompact={true} />
          ))}
        </div>
      </div>

      {/* 2. PRODUCTION QUEUE GRID (MAIN) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ListOrdered size={22} color="#6366f1" /> Production Command Blocks
            <span style={{ fontSize: '0.8rem', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '10px' }}>
              {groupedQueue.length} Batches
            </span>
          </h3>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
            {queue.length} Total Orders in Pipeline
          </div>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
          gap: '1.5rem' 
        }}>
          {groupedQueue.map((block, bIdx) => {
            const m = getLiveStatus(block.ProductCode);
            const isLive = m && m.IsActive;
            
            // Calculate progress based on all jobs in block
            const totalOriginal = block.jobs.reduce((acc, j) => acc + (j.Remaining_Qnty || 0), 0);
            const currentRemTotal = block.jobs.reduce((acc, j) => {
              const liveEntry = backlogData.find(b => String(b.DocNum) === String(j.DocNum) && b.ProductCode === j.ProductCode);
              return acc + (liveEntry ? liveEntry.Remaining_Qnty : 0);
            }, 0);
            
            const isFinished = currentRemTotal <= 0;
            const progress = totalOriginal > 0 ? Math.min(100, Math.max(0, ((totalOriginal - currentRemTotal) / totalOriginal) * 100)) : 100;

            return (
              <div key={block.key} className="glass-card" style={{ 
                padding: '1.25rem',
                border: isLive ? '2px solid #10b981' : '1px solid #e2e8f0',
                background: isLive ? '#f0fdf4' : 'white',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}>
                {/* Header: Product & Machine */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>{block.Customer}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#1e293b' }}>{block.ProductCode}</div>
                  </div>
                  {isLive && (
                    <div style={{ 
                      background: '#10b981', color: 'white', padding: '4px 10px', borderRadius: '8px', 
                      fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px',
                      animation: 'pulse 2s infinite'
                    }}>
                      <Play size={10} fill="white" /> LIVE ON {m.MachineID}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, minHeight: '2.4em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {block.Description}
                </div>

                {/* Orders List */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {block.jobs.map((job, jIdx) => {
                    return (
                      <div key={jIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 700, color: '#64748b' }}>#{job.DocNum}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: '#4f46e5' }}>{fmt(job.Remaining_Qnty)}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); onDelete(job.originalIndex); }}
                            style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Progress & Total */}
                <div style={{ marginTop: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 900, color: isFinished ? '#10b981' : '#4f46e5' }}>
                        {fmt(currentRemTotal)}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Batch Remaining</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>
                      {Math.round(progress)}%
                    </div>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: isFinished ? '#10b981' : '#6366f1', transition: 'width 1s ease' }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button 
                    onClick={() => onShuffle(block.originalIndices, 'up')} 
                    disabled={bIdx === 0}
                    style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px', cursor: 'pointer', color: '#64748b' }}
                  >
                    <ChevronUp size={16} style={{ margin: '0 auto' }} />
                  </button>
                  <button 
                    onClick={() => onShuffle(block.originalIndices, 'down')} 
                    disabled={bIdx === groupedQueue.length - 1}
                    style={{ flex: 1, padding: '8px', border: '1px solid #e2e8f0', background: 'white', borderRadius: '8px', cursor: 'pointer', color: '#64748b' }}
                  >
                    <ChevronDown size={16} style={{ margin: '0 auto' }} />
                  </button>
                </div>
              </div>
            );
          })}

          {queue.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '16px' }}>
              <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
              <p>Your production pipeline is empty. Start adding orders from the backlog.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Enhanced Machine Card with Health Check
 */
function MachineCard({ machine, isCompact = false }) {
  const lastScanTime = machine.LastScan !== 'Never' ? new Date(machine.LastScan) : null;
  const now = new Date();
  const diffMins = lastScanTime ? Math.floor((now - lastScanTime) / 60000) : null;
  
  // Health Logic
  let healthColor = '#94a3b8'; // Default/Never
  let healthLabel = 'Offline';
  let pulse = false;

  if (diffMins !== null) {
    if (diffMins < 15) {
      healthColor = '#10b981'; // Green
      healthLabel = 'Live';
      pulse = true;
    } else if (diffMins < 120) {
      healthColor = '#f59e0b'; // Amber
      healthLabel = 'Idle';
    } else {
      healthColor = '#ef4444'; // Red
      healthLabel = 'Inactive';
    }
  }

  return (
    <div style={{ 
      padding: isCompact ? '0.6rem 0.85rem' : '1rem', 
      background: 'white', 
      border: '1px solid #e2e8f0', 
      borderRadius: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      transition: 'all 0.2s ease',
      minWidth: isCompact ? '180px' : 'auto'
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = '#6366f1';
      e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = '#e2e8f0';
      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e293b' }}>{machine.MachineID}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {pulse && (
            <div style={{ 
              width: '6px', height: '6px', borderRadius: '50%', background: healthColor,
              animation: 'pulse 1.5s infinite'
            }}></div>
          )}
          <span style={{ 
            fontSize: '0.6rem', 
            fontWeight: 800, 
            background: `${healthColor}15`, 
            color: healthColor,
            padding: '2px 8px',
            borderRadius: '6px',
            textTransform: 'uppercase'
          }}>
            {healthLabel}
          </span>
        </div>
      </div>
      
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {machine.ProductionOrder !== 'Idle' ? `PO: ${machine.ProductionOrder}` : 'No Active Job'}
        {isCompact && machine.ItemDescription && machine.ItemDescription !== 'Idle' && (
          <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.65rem', marginLeft: '5px' }}>
            · {machine.ItemDescription.substring(0, 10)}...
          </span>
        )}
      </div>
      
      {machine.DocNum && (
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>
          Doc: {machine.DocNum}
        </div>
      )}
      
      {!isCompact && (
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
          {machine.ItemDescription || 'Idle'}
        </div>
      )}
      
      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {!isCompact && (
          <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>
            {diffMins !== null ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Timer size={10} /> {diffMins < 1 ? 'Just now' : `${diffMins}m ago`}
              </span>
            ) : 'No scans found'}
          </div>
        )}
        <div style={{ fontSize: '0.7rem', color: '#1e293b', fontWeight: 800 }}>
          {machine.ProducedQty.toLocaleString()} / {machine.PlannedQty.toLocaleString()}
        </div>
      </div>
      
      {/* Mini Progress Bar */}
      {machine.PlannedQty > 0 && (
        <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', 
            width: `${Math.min(100, (machine.ProducedQty / machine.PlannedQty) * 100)}%`, 
            background: healthColor,
            transition: 'width 0.5s ease'
          }} />
        </div>
      )}
    </div>
  );
}

function PlanningAdjustmentModal({ isOpen, items, onConfirm, onCancel }) {
  const [qtys, setQtys] = useState({});

  useEffect(() => {
    const initial = {};
    items.forEach(item => {
      const id = item.uniqueId || `${item.DocNum}-${item.ProductCode}`;
      initial[id] = item.Remaining_Qnty;
    });
    setQtys(initial);
  }, [items]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white', padding: '2rem', borderRadius: '16px', width: '600px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Production Planning Adjustment</h3>
          <button onClick={onCancel} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20}/></button>
        </div>
        
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Set the target production quantity for these items.</p>

        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item, idx) => {
            const id = item.uniqueId || `${item.DocNum}-${item.ProductCode}`;
            return (
              <div key={id || idx} style={{ 
                  padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>{item.CUSTOMER}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{item.ProductCode}</div>
                  <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>{item.ProductDescription}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>Backlog: {fmt(item.Remaining_Qnty)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginBottom: '4px' }}>PLAN QTY</div>
                  <input 
                    type="number" 
                    value={qtys[id] || ''} 
                    onChange={e => setQtys(prev => ({ ...prev, [id]: e.target.value }))}
                    style={{ 
                      width: '100px', padding: '0.5rem', borderRadius: '8px', border: '2px solid #10b981',
                      fontSize: '0.9rem', fontWeight: 800, textAlign: 'right'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button 
            onClick={() => {
              const adjusted = items.map(item => {
                const id = item.uniqueId || `${item.DocNum}-${item.ProductCode}`;
                const parsedVal = parseFloat(qtys[id]);
                return {
                  ...item,
                  Remaining_Qnty: !isNaN(parsedVal) ? parsedVal : item.Remaining_Qnty
                };
              });
              onConfirm(adjusted);
            }} 
            style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: 'none', background: '#10b981', color: 'white', fontWeight: 800, cursor: 'pointer' }}
          >
            Confirm & Add to Queue
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MODAL: DISPATCH QUANTITY ADJUSTMENT
// =============================================================================
function DispatchAdjustmentModal({ isOpen, items, onConfirm, onCancel }) {
  const [qtys, setQtys] = useState({});

  useEffect(() => {
    const initial = {};
    items.forEach(item => {
      initial[item.uniqueId] = item.Remaining_Qnty;
    });
    setQtys(initial);
  }, [items]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white', padding: '2rem', borderRadius: '16px', width: '600px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Dispatch Adjustment</h3>
          <button onClick={onCancel} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20}/></button>
        </div>
        
        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Review and adjust total quantities for the consolidated items.</p>

        <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map(item => (
            <div key={item.uniqueId} style={{ 
                padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>{item.CUSTOMER}</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b' }}>{item.ProductCode}</div>
                <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>{item.ProductDescription}</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>Doc #{item.DocNum}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginBottom: '4px' }}>DISPATCH QTY</div>
                <input 
                  type="number" 
                  value={qtys[item.uniqueId] || ''} 
                  onChange={e => setQtys(prev => ({ ...prev, [item.uniqueId]: e.target.value }))}
                  style={{ 
                    width: '100px', padding: '0.5rem', borderRadius: '8px', border: '2px solid #6366f1',
                    fontSize: '0.9rem', fontWeight: 800, textAlign: 'right'
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button 
            onClick={() => {
              const adjusted = items.map(item => {
                const parsedVal = parseFloat(qtys[item.uniqueId]);
                return {
                  ...item,
                  Quantity: !isNaN(parsedVal) ? parsedVal : item.Remaining_Qnty
                };
              });
              onConfirm(adjusted);
            }} 
            style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: 'none', background: '#6366f1', color: 'white', fontWeight: 800, cursor: 'pointer' }}
          >
            Confirm & Send Signal
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// VIEW 3: DISPATCH HUB (SIGNALLING & APPROVALS)
// =============================================================================
function DispatchHubView({ backlogData }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dispatchQtys, setDispatchQtys] = useState({});
  const [isGrouped, setIsGrouped] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [backlogType, setBacklogType] = useState('customers');
  const [customerFilter, setCustomerFilter] = useState('All Customers');
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [adjustmentModal, setAdjustmentModal] = useState({ open: false, items: [] });

  const fetchHistory = useCallback(async () => {
    try {
      const data = await notificationsApi.getDispatchHistory();
      setHistory(data);
    } catch (e) { console.error("History fetch failed", e); }
  }, []);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000); 
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const toggleGroup = (docNum) => {
    const key = String(docNum);
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const customers = useMemo(() => {
    const baseData = backlogData.filter(r => {
      const isStock = r.CUSTOMERID === 'STOCK' || r.CUSTOMER?.toLowerCase().includes('stock');
      if (backlogType === 'customers') return !isStock;
      if (backlogType === 'stock') return isStock;
      return true;
    });
    const list = [...new Set(baseData.map(r => r.CUSTOMER))].filter(Boolean).sort();
    return ['All Customers', ...list];
  }, [backlogData, backlogType]);

  const toggleSelect = (order) => {
    const id = order.uniqueId;
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSelect = (group) => {
    // We need to select the consolidated IDs for this group
    const consolidated = new Map();
    group.items.forEach(item => consolidated.set(item.ProductCode, true));
    const groupIds = Array.from(consolidated.keys()).map(code => `cons-${group.docKey}-${code}`);
    
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      const allSelected = groupIds.every(id => next.has(id));
      groupIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const getSelectedOrders = () => {
    return allPossibleItems.filter(r => selectedRowIds.has(r.uniqueId));
  };

  const filteredBacklog = useMemo(() => {
    let result = [...backlogData];
    if (backlogType === 'customers') {
      result = result.filter(r => r.CUSTOMERID !== 'STOCK' && !r.CUSTOMER?.toLowerCase().includes('stock'));
    } else if (backlogType === 'stock') {
      result = result.filter(r => r.CUSTOMERID === 'STOCK' || r.CUSTOMER?.toLowerCase().includes('stock'));
    }

    if (customerFilter !== 'All Customers') {
      result = result.filter(r => r.CUSTOMER === customerFilter);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      result = result.filter(r => {
        const searchStr = `${r.DocNum} ${r.CUSTOMER} ${r.ProductCode} ${r.ProductDescription}`.toLowerCase();
        return tokens.every(t => searchStr.includes(t));
      });
    }
    return result.sort((a, b) => b.DocDate.localeCompare(a.DocDate));
  }, [backlogData, searchTerm, backlogType, customerFilter]);

  // Helper to compute all possible selectable items
  const allPossibleItems = useMemo(() => {
    if (!isGrouped) {
      return filteredBacklog.map(r => ({ 
        ...r, 
        type: 'row', 
        uniqueId: r.uniqueId || `dispatch-row-${r.DocNum}-${r.ProductCode}-${r.DocDate}` 
      }));
    }

    const items = [];
    const docMap = new Map();
    
    filteredBacklog.forEach(r => {
      const docKey = String(r.DocNum || 'No Doc');
      if (!docMap.has(docKey)) docMap.set(docKey, new Map());
      const groupMap = docMap.get(docKey);
      const code = r.ProductCode || 'Unknown';
      
      if (!groupMap.has(code)) {
        groupMap.set(code, { 
          ...r, 
          type: 'child', 
          originalItems: [r],
          Remaining_Qnty: r.Remaining_Qnty || 0,
          uniqueId: `cons-${docKey}-${code}`
        });
      } else {
        const existing = groupMap.get(code);
        existing.originalItems.push(r);
        existing.Remaining_Qnty += (r.Remaining_Qnty || 0);
      }
    });

    docMap.forEach(groupMap => groupMap.forEach(item => items.push(item)));
    return items;
  }, [filteredBacklog, isGrouped]);

  const displayData = useMemo(() => {
    if (!isGrouped) return allPossibleItems;
    const groups = [];
    const map = new Map();
    filteredBacklog.forEach(r => {
      const docKey = String(r.DocNum || 'No Doc');
      if (!map.has(docKey)) {
        map.set(docKey, {
          type: 'group', DocNum: r.DocNum, docKey: docKey,
          DocDate: r.DocDate, CUSTOMER: r.CUSTOMER, items: [], totalRem: 0
        });
        groups.push(map.get(docKey));
      }
      const group = map.get(docKey);
      group.items.push(r);
      group.totalRem += (r.Remaining_Qnty || 0);
    });

    const final = [];
    groups.forEach(g => {
      final.push(g);
      if (expandedGroups.has(g.docKey)) {
        const groupItems = allPossibleItems.filter(item => item.uniqueId.startsWith(`cons-${g.docKey}-`));
        final.push(...groupItems);
      }
    });
    return final;
  }, [filteredBacklog, isGrouped, expandedGroups, allPossibleItems]);

  const filteredHistory = useMemo(() => {
    if (!historySearch) return history;
    const q = historySearch.toLowerCase();
    return history.filter(sig => 
        String(sig.DocNum).includes(q) || 
        sig.Customer?.toLowerCase().includes(q) || 
        sig.ProductCode?.toLowerCase().includes(q) ||
        sig.Description?.toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  const handleSendSignal = async (order, customQty) => {
    setLoading(true);
    try {
      await notificationsApi.createDispatchSignal({
        DocNum: order.DocNum,
        Customer: order.CUSTOMER,
        ProductCode: order.ProductCode,
        Description: order.ProductDescription,
        Quantity: parseFloat(customQty) || order.Remaining_Qnty
      });
      fetchHistory();
    } catch (e) { alert("Failed to send: " + e.message); }
    finally { setLoading(false); }
  };

  const handleBulkDispatch = (orders) => {
    setAdjustmentModal({ open: true, items: orders });
  };

  const confirmBulkDispatch = async (adjustedItems) => {
    const items = adjustedItems.map(item => {
      return {
        DocNum: item.DocNum,
        Customer: item.CUSTOMER,
        ProductCode: item.ProductCode,
        Description: item.ProductDescription,
        Quantity: item.Quantity ?? item.Remaining_Qnty
      };
    });

    setLoading(true);
    setAdjustmentModal({ open: false, items: [] });
    try {
      const resp = await fetch(`http://${window.location.hostname}:9092/api/notifications/dispatch-bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      if (resp.ok) { 
        fetchHistory(); 
        setSelectedRowIds(new Set());
      } else {
        alert("Failed to send items to dispatch.");
      }
    } catch (e) { alert("Failed: " + e.message); }
    finally { setLoading(false); }
  };

  const handleRecallSignal = async (signalId) => {
    if (!window.confirm("Are you sure you want to recall this dispatch signal?")) return;
    try {
      await notificationsApi.updateDispatchStatus(signalId, 'CANCELLED', 'Recalled by Planner');
      fetchHistory();
    } catch (e) { alert("Failed to recall: " + e.message); }
  };

  const handleDownloadLog = () => {
    window.open(`http://${window.location.hostname}:9092/api/notifications/export-archive`, '_blank');
  };

  const handleArchiveAll = async () => {
    if (!window.confirm("Are you sure you want to archive all signals? This will clear the current list.")) return;
    try {
      const resp = await fetch(`http://${window.location.hostname}:9092/api/notifications/archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'Planner' })
      });
      if (resp.ok) fetchHistory();
    } catch (e) { alert("Failed to archive: " + e.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', minHeight: 0 }}>
      {/* 1. STATUS HUB RIBBON (TOP - COMPACT) */}
      <div className="glass-card" style={{ padding: '0.75rem 1rem', background: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={14} color="#6366f1" /> Status Hub Ribbon
          </h4>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleDownloadLog}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', border: 'none', background: '#f0fdf4', color: '#16a34a', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer' }}
            >
              <Download size={10} /> Log
            </button>
            <button onClick={handleArchiveAll}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer' }}
            >
              <Archive size={10} /> Archive
            </button>
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '4px', scrollSnapType: 'x mandatory',
          scrollbarWidth: 'thin'
        }}>
          {filteredHistory.slice(0, 15).map(sig => (
            <div key={sig.id} className="glass-card" style={{ 
              minWidth: '160px', padding: '8px 10px', background: 'white', border: '1px solid #e2e8f0',
              scrollSnapAlign: 'start', position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#1e293b' }}>#{sig.DocNum}</span>
                <span style={{ 
                  fontSize: '0.55rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                  background: sig.Status === 'APPROVED' ? '#dcfce7' : sig.Status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                  color: sig.Status === 'APPROVED' ? '#166534' : sig.Status === 'REJECTED' ? '#991b1b' : '#92400e'
                }}>
                  {sig.Status}
                </span>
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sig.Customer}</div>
              <div style={{ fontSize: '0.55rem', color: '#94a3b8', fontWeight: 700, marginTop: '2px' }}>{new Date(sig.TimeSent).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              
              {sig.Status === 'PENDING' && (
                <button onClick={() => handleRecallSignal(sig.id)}
                  style={{ position: 'absolute', right: '6px', bottom: '6px', background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '2px' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                >
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
          {filteredHistory.length === 0 && (
            <div style={{ padding: '0.5rem', color: '#94a3b8', fontSize: '0.7rem', fontStyle: 'italic' }}>No recent activity.</div>
          )}
        </div>
      </div>

      {/* 2. DISPATCH TABLE (BOTTOM) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* FILTERS */}
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)',
          padding: '0.75rem 1rem', borderRadius: '16px', border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1.25rem'
        }}>
          {/* Backlog Type Slicers */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            <button onClick={() => { setBacklogType('customers'); setCustomerFilter('All Customers'); }}
              style={{ 
                padding: '0.6rem 1rem', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                background: backlogType === 'customers' ? 'white' : 'transparent', color: backlogType === 'customers' ? '#6366f1' : '#64748b',
                boxShadow: backlogType === 'customers' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Customers
            </button>
            <button onClick={() => { setBacklogType('stock'); setCustomerFilter('All Customers'); }}
              style={{ 
                padding: '0.6rem 1rem', border: 'none', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s',
                background: backlogType === 'stock' ? 'white' : 'transparent', color: backlogType === 'stock' ? '#6366f1' : '#64748b',
                boxShadow: backlogType === 'stock' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              Stock
            </button>
          </div>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>

          <button onClick={() => setIsGrouped(prev => !prev)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0',
              background: isGrouped ? '#6366f1' : 'white', color: isGrouped ? 'white' : '#64748b',
              fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {isGrouped ? <XCircle size={16}/> : <Plus size={16}/>}
            {isGrouped ? 'Ungroup' : 'Group by Doc No'}
          </button>

          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }}></div>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input type="text" placeholder="Search Customer, Description, Doc No, or LPO..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ 
                width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem',
                background: 'white', transition: 'all 0.2s'
              }}
            />
          </div>
          
          <div style={{ position: 'relative', width: '250px' }}>
            <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}
              style={{ 
                width: '100%', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.9rem', appearance: 'none',
                background: 'white', cursor: 'pointer', paddingRight: '2.5rem'
              }}
            >
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          </div>

          {(searchTerm || customerFilter !== 'All Customers') && (
            <button onClick={() => { setSearchTerm(''); setCustomerFilter('All Customers'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1rem', borderRadius: '10px', border: 'none', background: '#fef2f2', color: '#ef4444', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <X size={14} /> Clear
            </button>
          )}

          <div style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>
            {filteredBacklog.length} <span style={{ fontWeight: 500 }}>{filteredBacklog.length === 1 ? 'Order' : 'Orders'}</span>
          </div>

          {selectedRowIds.size > 0 && (
            <button onClick={() => handleBulkDispatch(getSelectedOrders())}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '8px', padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none',
                background: '#10b981', color: 'white', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.2)'
              }}
            >
              <Send size={16} /> Send Selected ({selectedRowIds.size})
            </button>
          )}
        </div>

        {/* TABLE */}
        <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', background: 'white' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <th style={{ width: '40px', padding: '12px 8px', borderBottom: '2px solid #e2e8f0' }}></th>
                <th style={{ width: '80px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Doc No</th>
                <th style={{ width: '100px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Date</th>
                <th style={{ width: '200px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Customer</th>
                <th style={{ width: '110px', textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Item No</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Description</th>
                <th style={{ width: '95px', textAlign: 'right', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Rem Qty</th>
                <th style={{ width: '100px', textAlign: 'right', padding: '12px 8px', fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>Dispatch</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((r, i) => {
                if (r.type === 'group') {
                  const isExpanded = expandedGroups.has(String(r.DocNum || 'No Doc'));
                  return (
                    <tr key={`group-${r.docKey}`} style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <td style={{ width: '40px', padding: '12px 8px' }}>
                        {isExpanded && (
                          <input 
                            type="checkbox" 
                            checked={r.items.length > 0 && Array.from(new Set(r.items.map(item => item.ProductCode))).map(code => `cons-${r.docKey}-${code}`).every(id => selectedRowIds.has(id))}
                            onChange={() => toggleGroupSelect(r)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        )}
                      </td>
                      <td onClick={() => toggleGroup(r.DocNum)} colSpan={2} style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', padding: '12px 8px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronDown size={14}/> : <ChevronUp size={14} style={{ transform: 'rotate(90deg)' }}/>}
                          DOC #{r.DocNum} <span style={{ fontWeight: 500, opacity: 0.6 }}>· {r.DocDate}</span>
                        </div>
                      </td>
                      <td colSpan={1} style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700, padding: '12px 8px' }}>{r.CUSTOMER}</td>
                      <td colSpan={2} style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, padding: '12px 8px' }}>
                        {r.items.length} Product Lines
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#6366f1', fontSize: '0.85rem', padding: '12px 8px' }}>{fmt(r.totalRem)}</td>
                      <td style={{ padding: '12px 8px' }}></td>
                    </tr>
                  );
                }

                const rowId = r.uniqueId;
                const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                const isChild = r.type === 'child';

                return (
                  <tr key={rowId} style={{ 
                    borderBottom: '1px solid #f1f5f9', background: selectedRowIds.has(rowId) ? '#f0fdf4' : 'transparent',
                    transition: 'background 0.2s', opacity: isChild ? 0.9 : 1
                  }}>
                    <td style={{ width: '40px', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <input type="checkbox" checked={selectedRowIds.has(rowId)} onChange={() => toggleSelect(r)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    </td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{!isChild && r.DocNum}</td>
                    <td style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{!isChild && r.DocDate}</td>
                    <td style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700, padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.CUSTOMER}>{r.CUSTOMER}</td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4f46e5', padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.ProductCode}>{r.ProductCode}</td>
                    <td style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 600, padding: '12px 8px', borderBottom: '1px solid #f1f5f9', ...ellipsis }} title={r.ProductDescription}>{r.ProductDescription}</td>
                    <td style={{ textAlign: 'right', fontWeight: 900, color: '#4f46e5', fontSize: '0.85rem', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>{fmt(r.Remaining_Qnty)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>Auto-Sum</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DispatchAdjustmentModal 
          isOpen={adjustmentModal.open} 
          items={adjustmentModal.items} 
          onConfirm={confirmBulkDispatch} 
          onCancel={() => setAdjustmentModal({ open: false, items: [] })} 
        />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function ProductionCommandCenter() {
  const [activeTab, setActiveTab] = useState('backlog');
  const [backlogData, setBacklogData] = useState([]);
  const [floorData, setFloorData] = useState([]);
  const [dailyPlan, setDailyPlan] = useState({ queue: [] });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [planningModal, setPlanningModal] = useState({ open: false, items: [] });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [backlog, floor, plan] = await Promise.all([
        ptsApi.getBackorderAge(),
        ptsApi.getLiveFloor(),
        ptsApi.getDailyPlan()
      ]);
      setBacklogData(backlog.map((item, idx) => ({ ...item, uniqueId: `${String(item.DocNum)}-${item.ProductCode}-${idx}` })));
      setFloorData(floor.Machines || []);
      setDailyPlan(plan);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const savePlan = async (updatedPlan) => {
    setIsSaving(true);
    try {
      await ptsApi.saveDailyPlan(updatedPlan);
      setDailyPlan(updatedPlan);
    } catch (err) { alert("Save failed"); }
    finally { setIsSaving(false); }
  };

  const handleAddToPlan = (order) => {
    setPlanningModal({ open: true, items: [order] });
  };
  
  const handleBulkAddToPlan = (orders) => {
    setPlanningModal({ open: true, items: orders });
  };

  const confirmAddToPlan = (adjustedItems) => {
    const newJobs = adjustedItems.map((order, idx) => ({
      DocNum: order.DocNum,
      LpoNo: order.LpoNo,
      Customer: order.CUSTOMER,
      ProductCode: order.ProductCode,
      Description: order.ProductDescription,
      Order_Qty: order.Order_Qty,
      Delivered_Qnty: order.Delivered_Qnty,
      Remaining_Qnty: order.Remaining_Qnty,
      Priority: dailyPlan.queue.length + idx + 1
    }));
    savePlan({ ...dailyPlan, queue: [...dailyPlan.queue, ...newJobs] });
    setPlanningModal({ open: false, items: [] });
  };

  const handleShuffle = (indices, direction) => {
    const queue = [...dailyPlan.queue];
    if (indices.length === 0) return;
    
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    
    if (direction === 'up') {
      if (minIdx === 0) return;
      
      const targetJob = queue[minIdx - 1];
      let ptr = minIdx - 1;
      while (ptr >= 0 && queue[ptr].Customer === targetJob.Customer && queue[ptr].ProductCode === targetJob.ProductCode) {
        ptr--;
      }
      
      const prefix = queue.slice(0, ptr + 1);
      const blockSelected = queue.slice(minIdx, maxIdx + 1);
      const blockAbove = queue.slice(ptr + 1, minIdx);
      const suffix = queue.slice(maxIdx + 1);
      
      const newQueue = [...prefix, ...blockSelected, ...blockAbove, ...suffix];
      savePlan({ ...dailyPlan, queue: newQueue.map((j, i) => ({ ...j, Priority: i + 1 })) });
      
    } else if (direction === 'down') {
      if (maxIdx === queue.length - 1) return;
      
      const targetJob = queue[maxIdx + 1];
      let ptr = maxIdx + 1;
      while (ptr < queue.length && queue[ptr].Customer === targetJob.Customer && queue[ptr].ProductCode === targetJob.ProductCode) {
        ptr++;
      }
      
      const prefix = queue.slice(0, minIdx);
      const blockSelected = queue.slice(minIdx, maxIdx + 1);
      const blockBelow = queue.slice(maxIdx + 1, ptr);
      const suffix = queue.slice(ptr);
      
      const newQueue = [...prefix, ...blockBelow, ...blockSelected, ...suffix];
      savePlan({ ...dailyPlan, queue: newQueue.map((j, i) => ({ ...j, Priority: i + 1 })) });
    }
  };

  const handleDelete = (indices) => {
    const indicesSet = new Set(Array.isArray(indices) ? indices : [indices]);
    const list = dailyPlan.queue.filter((_, i) => !indicesSet.has(i));
    savePlan({ ...dailyPlan, queue: list.map((j, i) => ({ ...j, Priority: i + 1 })) });
  };

  if (loading && backlogData.length === 0) return (
    <div className="loading-container">
      <Loader2 className="animate-spin" size={48} color="#6366f1" />
      <p className="loading-text">Synchronizing Command Center Intelligence...</p>
    </div>
  );

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Production Command Center</h2>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1.25rem' }}>
            <button onClick={() => setActiveTab('backlog')} style={{ background: 'none', border: 'none', padding: '0 0 0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, color: activeTab === 'backlog' ? '#6366f1' : '#94a3b8', borderBottom: `3px solid ${activeTab === 'backlog' ? '#6366f1' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} /> Backlog & Estimation
            </button>
            <button onClick={() => setActiveTab('schedule')} style={{ background: 'none', border: 'none', padding: '0 0 0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, color: activeTab === 'schedule' ? '#6366f1' : '#94a3b8', borderBottom: `3px solid ${activeTab === 'schedule' ? '#6366f1' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LayoutDashboard size={18} /> Daily Production Queue
            </button>
            <button onClick={() => setActiveTab('dispatch')} style={{ background: 'none', border: 'none', padding: '0 0 0.5rem', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, color: activeTab === 'dispatch' ? '#6366f1' : '#94a3b8', borderBottom: `3px solid ${activeTab === 'dispatch' ? '#6366f1' : 'transparent'}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={18} /> Dispatch Hub
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {dailyPlan.LastUpdated && (
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
              Synced: {new Date(dailyPlan.LastUpdated).toLocaleTimeString()}
            </span>
          )}
          {isSaving && <span style={{ fontSize: '0.8rem', color: '#6366f1' }}>Auto-saving...</span>}
          <button onClick={fetchData} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Sync
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeTab === 'backlog' ? (
          <BacklogEstimationView 
            data={backlogData} 
            loading={loading} 
            onAddToPlan={handleAddToPlan} 
            onAddBulkToPlan={handleBulkAddToPlan}
            queue={dailyPlan.queue} 
          />
        ) : activeTab === 'schedule' ? (
          <DailyQueueView 
            queue={dailyPlan.queue} 
            machines={floorData} 
            backlogData={backlogData}
            onShuffle={handleShuffle} 
            onDelete={handleDelete} 
          />
        ) : (
          <DispatchHubView backlogData={backlogData} />
        )}

        <PlanningAdjustmentModal 
          isOpen={planningModal.open} 
          items={planningModal.items} 
          onConfirm={confirmAddToPlan} 
          onCancel={() => setPlanningModal({ open: false, items: [] })} 
        />
      </div>
    </div>
  );
}
