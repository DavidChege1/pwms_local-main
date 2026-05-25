import React, { useState } from 'react';
import { Lock, User, AlertCircle, Check } from 'lucide-react';
import { authApi } from '../services/api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [guestActive, setGuestActive] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(username, password);
      localStorage.setItem('pwms_auth_token', response.access_token);
      onLoginSuccess();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestActive(true);
    setLoading(true);
    setError('');
    
    // Simulate natural credentials typing/fill delay
    setTimeout(async () => {
      setUsername('admin');
      setPassword('pwms2026');
      try {
        const response = await authApi.login('admin', 'pwms2026');
        localStorage.setItem('pwms_auth_token', response.access_token);
        onLoginSuccess();
      } catch (err) {
        setError('Guest login failed. Please ensure the backend is running.');
      } finally {
        setLoading(false);
        setGuestActive(false);
      }
    }, 600);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 12% 24%, #f8fafc 0%, #e2e8f0 100%)',
      padding: '2rem',
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      overflowY: 'auto'
    }}>
      {/* Visual background lights */}
      <div style={{
        position: 'absolute', width: '350px', height: '350px',
        background: 'rgba(99, 102, 241, 0.08)', borderRadius: '50%',
        filter: 'blur(80px)', top: '15%', left: '10%'
      }}></div>
      <div style={{
        position: 'absolute', width: '450px', height: '450px',
        background: 'rgba(14, 165, 233, 0.06)', borderRadius: '50%',
        filter: 'blur(100px)', bottom: '15%', right: '5%'
      }}></div>

      <div className="login-card" style={{
        background: 'rgba(255, 255, 255, 0.75)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        padding: '3rem 2.5rem',
        borderRadius: '24px',
        width: '450px',
        maxWidth: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04), 0 0 1px 1px rgba(0, 0, 0, 0.01)',
        color: '#1e293b',
        zIndex: 1,
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
            padding: '1rem',
            borderRadius: '16px',
            marginBottom: '1.25rem',
            boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.2)',
            color: 'white'
          }}>
            <Lock size={32} />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, letterSpacing: '-0.75px', color: '#0f172a' }}>PWMS Portal</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem', fontWeight: 600 }}>
            Optimized Production & Waste Management System
          </p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fee2e2',
            color: '#ef4444',
            padding: '1rem',
            borderRadius: '12px',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            fontWeight: 600
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem 0.85rem 2.75rem',
                  borderRadius: '12px',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                className="login-input"
                disabled={loading}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.5px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem 0.85rem 2.75rem',
                  borderRadius: '12px',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                className="login-input"
                disabled={loading}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
                color: 'white',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
              }}
              className="login-submit-btn"
            >
              {loading && !guestActive ? 'Authenticating...' : 'Sign In'}
            </button>

            {/* Guest Login Divider */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0', opacity: 0.8, color: '#94a3b8' }}>
              <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0 0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#cbd5e1' }}></div>
            </div>

            {/* Guest Login Button */}
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                background: '#f0f9ff',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              className="login-guest-btn"
            >
              {guestActive ? 'Generating Session...' : (
                <>
                  <Check size={18} /> One-Click Guest Access
                </>
              )}
            </button>
          </div>
        </form>

        {/* Helper Note for Deployed Environment Cold Starts */}
        <div style={{
          marginTop: '1.5rem',
          padding: '0.75rem 1rem',
          background: 'rgba(240, 249, 255, 0.5)',
          border: '1px dashed #bae6fd',
          borderRadius: '12px',
          fontSize: '0.78rem',
          color: '#0369a1',
          lineHeight: '1.4',
          textAlign: 'center',
          fontWeight: 600
        }}>
          💡 <b>Showcase Note:</b> Our free-tier backend sleeps when inactive. If logging in for the first time, please allow up to <b>50–90 seconds</b> for the cloud server to spin up!
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', opacity: 0.6, fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
          Secured Offline Local Demonstration &copy; 2026
        </div>
      </div>

      {/* Styled Focus Customizations */}
      <style>{`
        .login-input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15) !important;
        }
        .login-submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 15px rgba(99, 102, 241, 0.35) !important;
        }
        .login-submit-btn:active {
          transform: translateY(0);
        }
        .login-guest-btn:hover {
          background: #e0f2fe !important;
          border-color: #7dd3fc !important;
          color: #0369a1 !important;
        }
      `}</style>
    </div>
  );
}
