import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function Dashboard() {
  const { user, logout } = useAuth();
  const canManageRestaurant = ["owner", "manager"].includes(user?.role);
  const isWaiter = user?.role === "waiter";
  const canViewKitchen = ["kitchen_staff", "owner"].includes(user?.role);
  const canTakePayment = ["cashier", "owner"].includes(user?.role);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">KOMS</p>
          <h1>KOMS Dashboard</h1>
          <p>Signed in as {user?.username} ({user?.role}).</p>
        </div>
        <button type="button" className="button secondary" onClick={logout}>
          Log out
        </button>
      </header>

      {canManageRestaurant && (
        <nav className="dashboard-nav" aria-label="Management">
          <Link className="nav-card" to="/staff">Manage staff</Link>
          <Link className="nav-card" to="/tables">Manage tables</Link>
          <Link className="nav-card" to="/menu">Manage menu</Link>
          <Link className="nav-card" to="/reports">View today&apos;s report</Link>
        </nav>
      )}
      {isWaiter && (
        <nav className="dashboard-nav" aria-label="Waiter actions">
          <Link className="nav-card" to="/orders/new">Take a new order</Link>
          <Link className="nav-card" to="/orders">My active orders</Link>
          <Link className="nav-card" to="/orders/customer-review">Review customer orders</Link>
        </nav>
      )}
      {canViewKitchen && (
        <nav className="dashboard-nav" aria-label="Kitchen">
          <Link className="nav-card" to="/kitchen">Open kitchen board</Link>
        </nav>
      )}
      {canTakePayment && (
        <nav className="dashboard-nav" aria-label="Cashier">
          <Link className="nav-card" to="/cashier">Take payments</Link>
        </nav>
      )}
    </main>
  );
}

export default Dashboard;
