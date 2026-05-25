import React, { useState } from 'react';
import { Home, LogOut } from 'lucide-react';
import DepartmentHub from './pages/DepartmentHub';
import SleevesDashboard from './pages/SleevesDashboard';
import VarianceDashboard from './pages/VarianceDashboard';
import PrintingIntelligenceHub from './pages/PrintingIntelligenceHub';
import PTSOrderBook from './pages/PTSOrderBook';
import LabelsDashboard from './pages/LabelsDashboard';
import ProductionCommandCenter from './pages/ProductionCommandCenter';
import MaterialPlanning from './pages/MaterialPlanning';
import SlittingDashboard from './pages/pts/slitting/SlittingDashboard';
import Login from './components/Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('pwms_auth_token'));
  const [activeDepartment, setActiveDepartment] = useState(null); // null = Home/Hub
  const [activeTab, setActiveTab] = useState('sleeves');

  const handleLogout = () => {
    localStorage.removeItem('pwms_auth_token');
    setIsAuthenticated(false);
  };

  const renderDepartmentContent = () => {
    switch (activeDepartment) {
      case 'sleeves':
        return (
          <div className="department-view">
            <header>
              <button className="home-btn" onClick={() => setActiveDepartment(null)}>
                <Home size={18} /> Back to Departments
              </button>
              <h1>Sleeves Department System</h1>
              <div className="nav-tabs">
                <button 
                  className={`nav-tab ${activeTab === 'sleeves' ? 'active' : ''}`}
                  onClick={() => setActiveTab('sleeves')}
                >
                  Forming Process
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'printing-hub' ? 'active' : ''}`}
                  onClick={() => setActiveTab('printing-hub')}
                  style={activeTab === 'printing-hub' ? {} : { borderColor: '#6366f1', color: '#4f46e5' }}
                >
                  📈 Printing Intelligence
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'pts-orderbook' ? 'active' : ''}`}
                  onClick={() => setActiveTab('pts-orderbook')}
                  style={activeTab === 'pts-orderbook' ? {} : { borderColor: '#f59e0b', color: '#92400e' }}
                >
                  📋 Backlog Analysis
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'material-planning' ? 'active' : ''}`}
                  onClick={() => setActiveTab('material-planning')}
                  style={activeTab === 'material-planning' ? {} : { borderColor: '#10b981', color: '#059669' }}
                >
                  📦 Material Planning
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'planning-center' ? 'active' : ''}`}
                  onClick={() => setActiveTab('planning-center')}
                  style={activeTab === 'planning-center' ? {} : { borderColor: '#8b5cf6', color: '#6d28d9' }}
                >
                  🏗️ Production Command Center
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'variance' ? 'active' : ''}`}
                  onClick={() => setActiveTab('variance')}
                >
                  Variance Analysis
                </button>
                <button 
                  className={`nav-tab ${activeTab === 'slitting' ? 'active' : ''}`}
                  onClick={() => setActiveTab('slitting')}
                  style={activeTab === 'slitting' ? {} : { borderColor: '#ec4899', color: '#db2777' }}
                >
                  ✂️ Slitting Activity
                </button>
              </div>
            </header>

            <main>
              <div className="glass-card">
                {activeTab === 'sleeves' && <SleevesDashboard />}
                {activeTab === 'printing-hub' && <PrintingIntelligenceHub />}
                {activeTab === 'pts-orderbook' && <PTSOrderBook />}
                {activeTab === 'material-planning' && <MaterialPlanning />}
                {activeTab === 'variance' && <VarianceDashboard />}
                {activeTab === 'planning-center' && <ProductionCommandCenter />}
                {activeTab === 'slitting' && <SlittingDashboard />}
              </div>
            </main>
          </div>
        );
      
      case 'labels':
        return (
          <div className="department-view">
             <header>
              <button className="home-btn" onClick={() => setActiveDepartment(null)}>
                <Home size={18} /> Back to Departments
              </button>
              <h1>Labels Department System</h1>
            </header>
            <main>
              <div className="glass-card">
                <LabelsDashboard />
              </div>
            </main>
          </div>
        );
      
      default:
        return <DepartmentHub onSelect={setActiveDepartment} />;
    }
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="container">
      {/* Session Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 0', gap: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>Active Session: Admin</span>
        <button onClick={handleLogout} className="home-btn" style={{ borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', padding: '0.4rem 0.8rem', borderRadius: '8px' }}>
          <LogOut size={14} /> Logout
        </button>
      </div>

      {renderDepartmentContent()}

      <footer style={{ marginTop: '4rem', textAlign: 'center', opacity: 0.5, fontSize: '0.8rem' }}>
        <p>Optimized Production and Waste Management System &copy; 2026</p>
      </footer>
    </div>
  )
}

export default App;
