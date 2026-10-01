import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BackNavigation from './BackNavigation';
import NotificationBell from './NotificationBell';

const destinations = [
  ['/dashboard', 'Overview', ['owner', 'manager', 'waiter', 'cashier', 'kitchen_staff']],
  ['/staff', 'Staff', ['owner', 'manager']],
  ['/tables', 'Tables', ['owner', 'manager']],
  ['/menu', 'Menu', ['owner', 'manager']],
  ['/reports', 'Reports', ['owner', 'manager']],
  ['/orders/new', 'New order', ['waiter']],
  ['/orders', 'My orders', ['waiter']],
  ['/orders/customer-review', 'Review orders', ['waiter']],
  ['/kitchen', 'Kitchen', ['owner', 'kitchen_staff']],
  ['/cashier', 'Payments', ['owner', 'cashier']],
];

export default function AppNavigation() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (pathname === '/') return null;
  const isStaff = destinations.some(([path]) => path === pathname) || pathname === '/not-authorized';
  return <header className="app-navigation">
    <div className="app-navigation-inner">
      <BackNavigation />
      <NavLink to={isStaff ? '/dashboard' : '/'} className="app-brand">MAISON KOMS</NavLink>
      {isStaff && user ? <NotificationBell /> : <span className="app-context">Welcome to the table</span>}
    </div>
    {isStaff && user && <nav className="staff-navigation" aria-label="Staff navigation">
      {destinations.filter(([, , roles]) => roles.includes(user.role)).map(([path, label]) => <NavLink key={path} to={path} end>{label}</NavLink>)}
    </nav>}
  </header>;
}
