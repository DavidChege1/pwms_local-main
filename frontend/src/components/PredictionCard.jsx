import React, { useState, useEffect } from 'react';
import { mlApi } from '../services/api';
import { Brain, AlertCircle, CheckCircle } from 'lucide-react';

const PredictionCard = ({ features, title = "Waste Prediction" }) => {
    const [status, setStatus] = useState('loading');
    const [prediction, setPrediction] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPrediction = async () => {
            if (!features) return;
            
            setStatus('loading');
            try {
                const result = await mlApi.predictWaste(features);
                setPrediction(result);
                setStatus('success');
            } catch (err) {
                setError(err.message || "Failed to fetch prediction");
                setStatus('error');
            }
        };

        fetchPrediction();
    }, [JSON.stringify(features)]);

    if (status === 'loading') {
        return (
            <div className="stat-card glass-card" style={{ borderLeft: '4px solid #3498db' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Brain size={20} color="#3498db" />
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{title}</h3>
                </div>
                <div className="value">...</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Analyzing patterns...</div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="stat-card glass-card" style={{ borderLeft: '4px solid #e74c3c' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertCircle size={20} color="#e74c3c" />
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{title}</h3>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#e74c3c' }}>{error}</div>
                <div style={{ fontSize: '0.7rem', marginTop: '8px', opacity: 0.6 }}>
                    Check backend/ml/models/
                </div>
            </div>
        );
    }

    return (
        <div className="stat-card glass-card" style={{ borderLeft: '4px solid #9b59b6', background: 'rgba(155, 89, 182, 0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Brain size={20} color="#9b59b6" />
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{title}</h3>
                <CheckCircle size={14} color="#27ae60" style={{ marginLeft: 'auto' }} />
            </div>
            <div className="value" style={{ color: '#8e44ad' }}>{prediction.prediction} {prediction.unit}</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Predicted based on {features.Machine || 'current'} performance</div>
            <div style={{ fontSize: '0.6rem', marginTop: '4px', opacity: 0.5 }}>
                Model: {prediction.model_info.filename}
            </div>
        </div>
    );
};

export default PredictionCard;
