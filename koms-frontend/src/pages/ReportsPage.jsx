import { useEffect, useState } from "react";
import { getTodayReport } from "../api/report.api";

const STATUS_ORDER = ["pending", "confirmed", "preparing", "ready", "served", "paid", "cancelled"];

function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getTodayReport();
      setReport(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load today's report.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadReport(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Owner / manager</p><h1>Today&apos;s report</h1><p>Orders created from server-local midnight until now.</p></div><button type="button" className="button secondary" onClick={loadReport}>Refresh</button></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading today&apos;s report...</p> : report && <><section className="report-summary"><article className="stat-card"><span>Total orders</span><strong>{report.totalOrders}</strong></article><article className="stat-card"><span>Paid revenue</span><strong>NPR {Number(report.totalRevenue).toFixed(2)}</strong></article></section><section className="panel"><h2>Orders by status</h2><div className="status-stat-grid">{STATUS_ORDER.map((status) => <article className="status-stat" key={status}><span>{status}</span><strong>{report.ordersByStatus[status]}</strong></article>)}</div></section></>}
    </main>
  );
}

export default ReportsPage;
