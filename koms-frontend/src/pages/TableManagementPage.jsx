import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createTable, listTables, regenerateTableToken, updateTableStatus } from "../api/table.api";

const TABLE_STATUSES = ["free", "occupied", "reserved"];

function TableManagementPage() {
  const [tables, setTables] = useState([]);
  const [formData, setFormData] = useState({ name: "", capacity: "" });
  const [selectedTable, setSelectedTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const getPublicOrderUrl = (table) => `${import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}/order/${table.publicToken}`;

  const loadTables = async () => {
    setLoading(true); setError("");
    try {
      const response = await listTables();
      setTables(response.data);
      setSelectedTable((current) => current ? response.data.find((table) => table._id === current._id) || null : null);
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to load tables."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTables(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault(); setSubmitting(true); setError("");
    try { await createTable({ name: formData.name, capacity: Number(formData.capacity) }); setFormData({ name: "", capacity: "" }); await loadTables(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to create table."); }
    finally { setSubmitting(false); }
  };
  const handleStatusChange = async (id, status) => {
    setUpdatingId(id); setError("");
    try { await updateTableStatus(id, status); await loadTables(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Unable to update table status."); }
    finally { setUpdatingId(""); }
  };
  const handleCopyUrl = async (table) => {
    setError(""); setNotice("");
    try { await navigator.clipboard.writeText(getPublicOrderUrl(table)); setNotice(`Customer ordering link for ${table.name} copied.`); }
    catch { setError("Unable to copy automatically. Copy the link from the QR panel instead."); }
  };
  const handleRegenerateToken = async (table) => {
    if (!window.confirm(`Regenerate ${table.name}'s QR link? Existing printed QR codes will stop working.`)) return;
    setUpdatingId(table._id); setError(""); setNotice("");
    try {
      const response = await regenerateTableToken(table._id);
      setTables((current) => current.map((entry) => entry._id === table._id ? response.data : entry));
      setSelectedTable(response.data);
      setNotice(`A new QR link was generated for ${table.name}. Reprint the code.`);
    } catch (requestError) { setError(requestError.response?.data?.message || "Unable to regenerate the QR link."); }
    finally { setUpdatingId(""); }
  };

  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Restaurant setup</p><h1>Table management</h1></div></header>
    <section className="management-layout">
      <form className="panel form-panel" onSubmit={handleCreate}><h2>Add table</h2><label htmlFor="table-name">Number or name</label><input id="table-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} placeholder="e.g. Table 1" required /><label htmlFor="table-capacity">Capacity</label><input id="table-capacity" type="number" min="1" value={formData.capacity} onChange={(event) => setFormData({ ...formData, capacity: event.target.value })} required /><button className="button" type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add table"}</button></form>
      <section className="panel" aria-live="polite"><div className="section-heading"><h2>All tables</h2><button type="button" className="button secondary" onClick={loadTables}>Refresh</button></div>{error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}{loading ? <p>Loading tables...</p> : tables.length === 0 ? <p>No tables yet. Add your first table.</p> : <div className="table-wrap"><table><thead><tr><th>Table</th><th>Capacity</th><th>Status</th><th>Customer QR</th></tr></thead><tbody>{tables.map((table) => <tr key={table._id}><td>{table.name}</td><td>{table.capacity}</td><td><select aria-label={`Status for ${table.name}`} value={table.status} disabled={updatingId === table._id} onChange={(event) => handleStatusChange(table._id, event.target.value)}>{TABLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td className="table-actions"><button type="button" className="button secondary" onClick={() => setSelectedTable(table)}>View QR</button><button type="button" className="text-button" onClick={() => handleCopyUrl(table)}>Copy link</button></td></tr>)}</tbody></table></div>}</section>
    </section>
    {selectedTable && <section className="panel qr-panel" aria-live="polite"><div className="section-heading"><div><p className="eyebrow">Customer ordering</p><h2>{selectedTable.name} QR code</h2></div><button type="button" className="text-button no-print" onClick={() => setSelectedTable(null)}>Close</button></div><div className="qr-content"><QRCodeSVG value={getPublicOrderUrl(selectedTable)} size={220} level="M" includeMargin /><div><p>Customers scan this code to browse the menu and send items to their waiter.</p><label>Customer ordering URL<input readOnly value={getPublicOrderUrl(selectedTable)} onFocus={(event) => event.target.select()} /></label><div className="review-actions no-print"><button type="button" className="button secondary" onClick={() => handleCopyUrl(selectedTable)}>Copy link</button><button type="button" className="button" onClick={() => window.print()}>Print QR</button><button type="button" className="button danger" disabled={updatingId === selectedTable._id} onClick={() => handleRegenerateToken(selectedTable)}>{updatingId === selectedTable._id ? "Regenerating..." : "Regenerate QR link"}</button></div><p className="muted">Regeneration invalidates every previously printed QR code for this table.</p></div></div></section>}
  </main>;
}

export default TableManagementPage;
