import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import NotAuthorized from "./pages/NotAuthorized";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import TableManagementPage from "./pages/TableManagementPage";
import MenuManagementPage from "./pages/MenuManagementPage";
import StaffManagementPage from "./pages/StaffManagementPage";
import NewOrderPage from "./pages/NewOrderPage";
import WaiterOrdersPage from "./pages/WaiterOrdersPage";
import KitchenDisplayPage from "./pages/KitchenDisplayPage";
import CashierPage from "./pages/CashierPage";
import ReportsPage from "./pages/ReportsPage";
import CustomerOrderQueuePage from "./pages/CustomerOrderQueuePage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/not-authorized" element={<NotAuthorized />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["owner", "manager"]} />}>
          <Route path="/staff" element={<StaffManagementPage />} />
          <Route path="/tables" element={<TableManagementPage />} />
          <Route path="/menu" element={<MenuManagementPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["waiter"]} />}>
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders" element={<WaiterOrdersPage />} />
          <Route path="/orders/customer-review" element={<CustomerOrderQueuePage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["kitchen_staff", "owner"]} />}>
          <Route path="/kitchen" element={<KitchenDisplayPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={["cashier", "owner"]} />}>
          <Route path="/cashier" element={<CashierPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
