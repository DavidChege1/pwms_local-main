import React from 'react';
import { Lightbulb, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';

const SlittingInsights = ({ typeA, typeB, history }) => {
  const generateInsights = () => {
    const insights = [];
    
    // 1. Check for High Type B Waste
    const totalWaste = typeB.reduce((acc, item) => acc + (item.WasteWeight || 0), 0);
    const avgWastePerJob = typeB.length > 0 ? totalWaste / typeB.length : 0;
    
    if (totalWaste > 500) {
      insights.push({
        type: 'warning',
        icon: <AlertTriangle size={20} color="#ef4444" />,
        title: 'High Process Waste Detected',
        text: `You have lost ${Math.round(totalWaste)}kg of material due to off-spec printing in this period. Planners should investigate why wider reels are being selected for these jobs.`
      });
    }

    // 2. Check for Market Mismatch (Type A Frequency vs Order Vol)
    const recentMonth = history[0]; // History is sorted Desc
    if (recentMonth && recentMonth.TypeA_Count > 10 && recentMonth.OrderVolume === 0) {
      insights.push({
        type: 'info',
        icon: <Lightbulb size={20} color="#6366f1" />,
        title: 'Inventory Mismatch Alert',
        text: `High slitting frequency detected for sizes with zero market demand. This suggests we are buying jumbo sizes purely to slit them. Directly ordering child-reel widths could save significant machine time.`
      });
    }

    // 3. Positive Insight
    if (totalWaste < 50 && typeB.length > 0) {
      insights.push({
        type: 'success',
        icon: <CheckCircle size={20} color="#10b981" />,
        title: 'Excellent Waste Management',
        text: 'Material utilization is currently optimal. Off-spec printing instances are within the "Win Window".'
      });
    }

    return insights;
  };

  const insights = generateInsights();

  if (insights.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      {insights.map((insight, idx) => (
        <div 
          key={idx} 
          className="glass-card" 
          style={{ 
            padding: '1.25rem', 
            borderRadius: '1rem', 
            display: 'flex', 
            gap: '1rem', 
            alignItems: 'flex-start',
            borderLeft: `4px solid ${insight.type === 'warning' ? '#ef4444' : insight.type === 'success' ? '#10b981' : '#6366f1'}`
          }}
        >
          <div style={{ marginTop: '0.25rem' }}>{insight.icon}</div>
          <div>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{insight.title}</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8, lineHeight: 1.5 }}>{insight.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SlittingInsights;
