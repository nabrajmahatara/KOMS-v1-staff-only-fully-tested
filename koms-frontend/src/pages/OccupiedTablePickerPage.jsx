import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getOccupiedPublicTables } from "../api/public.api";

function OccupiedTablePickerPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getOccupiedPublicTables();
        if (!cancelled) setTables(response.data);
      } catch {
        if (!cancelled) setError("We couldn't load tables right now. Please ask a staff member for help.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return <main className="customer-page customer-picker-page"><header className="customer-header"><p className="eyebrow">KOMS restaurant</p><h1>Which table are you at?</h1><p>Select the table where you have been seated.</p></header>{loading ? <p>Loading available tables...</p> : error ? <p className="error">{error}</p> : !tables.length ? <section className="customer-empty"><h2>No tables are open yet</h2><p>Please ask a staff member to seat you before ordering.</p></section> : <section className="customer-table-grid" aria-label="Occupied tables">{tables.map((table) => <button className="customer-table-choice" type="button" key={table._id} onClick={() => navigate(`/order/table/${table._id}`)}>{table.name}</button>)}</section>}<Link className="staff-login-link" to="/login">Staff login</Link></main>;
}

export default OccupiedTablePickerPage;
