import React from 'react';
import { AdherenceDashboard } from '../../modules/gerenciamento-estoque/analytics/components/AdherenceDashboard';

export default function DashboardPage() {
  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
  };

  return (
    <div style={containerStyle}>
      <AdherenceDashboard />
    </div>
  );
}