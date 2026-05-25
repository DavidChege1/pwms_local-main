import React, { useState, useEffect, useRef } from 'react';
import { Info, X } from 'lucide-react';

export default function InfoTooltip({ title, text, children, iconSize = 16, inline = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const popoverStyle = {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    width: 'max-content',
    maxWidth: '320px',
    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(226, 232, 240, 0.8)',
    boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15), 0 4px 10px -5px rgba(0,0,0,0.1)',
    borderRadius: '12px',
    padding: '1rem',
    color: '#334155',
    textAlign: 'left',
    fontSize: '0.85rem',
    lineHeight: '1.5',
    pointerEvents: 'auto',
    cursor: 'default',
    fontWeight: 'normal',
    textTransform: 'none'
  };

  const arrowStyle = {
    position: 'absolute',
    top: '-6px',
    left: '50%',
    transform: 'translateX(-50%) rotate(45deg)',
    width: '12px',
    height: '12px',
    background: '#ffffff',
    borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
    zIndex: -1
  };

  return (
    <span 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        display: inline ? 'inline-flex' : 'flex', 
        alignItems: 'center',
        verticalAlign: 'middle',
        marginLeft: '6px',
        cursor: 'pointer'
      }}
    >
      <span 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{ color: isOpen ? '#6366f1' : '#cbd5e1', transition: 'color 0.2s', display: 'flex' }}
      >
        <Info size={iconSize} />
      </span>

      {isOpen && (
        <div style={popoverStyle} onClick={(e) => e.stopPropagation()}>
          <div style={arrowStyle} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
            <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{title || 'Explanation'}</strong>
            <X size={16} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setIsOpen(false)} />
          </div>
          
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {text}
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
