import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';

interface HealthStatus {
    status: 'success' | 'failure';
    timestamp: string;
}

export const HealthBadge: React.FC = () => {
    const [status, setStatus] = useState<'success' | 'failure' | 'loading'>('loading');
    const navigate = useNavigate();

    const checkHealth = async () => {
        try {
            const response = await fetchWithAuth('/api/health/latest');
            if (response.ok) {
                const data: HealthStatus | null = await response.json();
                // If no data, assume neutral/loading, otherwise use status
                if (data) {
                    setStatus(data.status);
                } else {
                    setStatus('loading'); // Or 'success' if we assume default healthy
                }
            } else {
                setStatus('failure');
            }
        } catch (error) {
            console.error('Failed to fetch health status:', error);
            setStatus('failure');
        }
    };

    useEffect(() => {
        checkHealth();
        const interval = setInterval(checkHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const getBadgeColor = () => {
        switch (status) {
            case 'success':
                return 'bg-green-500';
            case 'failure':
                return 'bg-red-500';
            case 'loading':
                return 'bg-yellow-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'success':
                return 'System Healthy';
            case 'failure':
                return 'Critical Error';
            case 'loading':
                return 'Checking...';
            default:
                return 'Unknown';
        }
    }

    return (
        <button
            onClick={() => navigate('/health')}
            className="flex items-center space-x-2 px-3 py-1 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700"
            title="Click for full health report"
        >
            <div className={`w-2.5 h-2.5 rounded-full ${getBadgeColor()} animate-pulse`} />
            <span className="text-xs font-medium text-gray-300">
                {getStatusText()}
            </span>
        </button>
    );
};
