import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';

export function RootLayout() {
  return (
    <div style={{ minHeight: '100vh', background: '#faf7f2' }}>
      <TopNav />
      <main style={{ paddingTop: 48 }}>
        <Outlet />
      </main>
    </div>
  );
}
