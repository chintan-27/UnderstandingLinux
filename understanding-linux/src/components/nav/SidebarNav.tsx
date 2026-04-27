import { NavLink } from 'react-router-dom';
import { Home, Map, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/curriculum', label: 'Curriculum', icon: Map, end: false },
  { to: '/progress', label: 'Progress', icon: TrendingUp, end: false },
];

export function SidebarNav() {
  return (
    <nav className="px-3 pb-2">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors mb-0.5',
              isActive
                ? 'bg-white/10 text-accent'
                : 'text-gray-400 hover:text-white hover:bg-white/8',
            )
          }
        >
          <Icon size={16} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
