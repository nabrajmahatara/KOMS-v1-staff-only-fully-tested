import { Link, useLocation } from "react-router-dom";

const staffPaths = new Set([
  "/dashboard", "/staff", "/tables", "/menu", "/reports", "/orders/new", "/orders", "/orders/customer-review", "/kitchen", "/cashier", "/not-authorized",
]);

export default function BackNavigation() {
  const { pathname } = useLocation();
  if (pathname === "/") return null;

  if (pathname === "/login" || pathname === "/dashboard") {
    return <Link className="global-back-link" to="/">← Back</Link>;
  }

  if (staffPaths.has(pathname)) {
    return <Link className="global-back-link" to="/dashboard">← Back</Link>;
  }

  return <Link className="global-back-link" to={pathname === "/order" ? "/" : "/order"}>← Back</Link>;
}
