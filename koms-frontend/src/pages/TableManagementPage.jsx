import { useEffect, useState } from "react";
import { createTable, listTables, updateTableStatus } from "../api/table.api";

const TABLE_STATUSES = ["free", "occupied", "reserved"];

function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [formData, setFormData] = useState({ name: "", capacity: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const loadTables = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listTables();
      setTables(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load tables.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadTables();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await createTable({ name: formData.name, capacity: Number(formData.capacity) });
      setFormData({ name: "", capacity: "" });
      await loadTables();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create table.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id);
    setError("");
    try {
      await updateTableStatus(id, status);
      await loadTables();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update table status.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Restaurant setup</p>
          <h1>Table management</h1>
        </div>
      </header>

      <section className="management-layout">
        <form className="panel form-panel" onSubmit={handleCreate}>
          <h2>Add table</h2>
          <label htmlFor="table-name">Number or name</label>
          <input id="table-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} placeholder="e.g. Table 1" required />
          <label htmlFor="table-capacity">Capacity</label>
          <input id="table-capacity" type="number" min="1" value={formData.capacity} onChange={(event) => setFormData({ ...formData, capacity: event.target.value })} required />
          <button className="button" type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add table"}</button>
        </form>

        <section className="panel" aria-live="polite">
          <div className="section-heading"><h2>All tables</h2><button type="button" className="button secondary" onClick={loadTables}>Refresh</button></div>
          {error && <p className="error" role="alert">{error}</p>}
          {loading ? <p>Loading tables...</p> : tables.length === 0 ? <p>No tables yet. Add your first table.</p> : (
            <div className="table-wrap"><table><thead><tr><th>Table</th><th>Capacity</th><th>Status</th></tr></thead><tbody>
              {tables.map((table) => <tr key={table._id}><td>{table.name}</td><td>{table.capacity}</td><td><select aria-label={`Status for ${table.name}`} value={table.status} disabled={updatingId === table._id} onChange={(event) => handleStatusChange(table._id, event.target.value)}>{TABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td></tr>)}
            </tbody></table></div>
          )}
        </section>
      </section>
    </main>
  );
}

export default TableManagementPage;
