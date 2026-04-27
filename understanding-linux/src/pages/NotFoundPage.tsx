import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '70vh', gap: 16, fontFamily: '"Inter", system-ui, sans-serif',
    }}>
      <div style={{
        fontFamily: '"Plus Jakarta Sans", system-ui', fontSize: 88, fontWeight: 800,
        color: '#e5e0d8', letterSpacing: '-0.06em', lineHeight: 1,
      }}>
        404
      </div>
      <p style={{ fontSize: 15, color: '#6b6560', marginTop: -4 }}>This page doesn't exist.</p>
      <Link to="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '10px 22px', borderRadius: 12,
        background: 'linear-gradient(135deg, #e85c2c, #e85c2c)',
        color: '#fff', fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
        boxShadow: '0 4px 12px rgba(232,92,44,.25)',
        marginTop: 8,
      }}>
        <Home size={14} /> Go home
      </Link>
    </div>
  );
}
