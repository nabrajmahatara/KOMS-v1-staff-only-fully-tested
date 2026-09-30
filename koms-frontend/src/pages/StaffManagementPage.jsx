import { useEffect, useState } from "react";
import CreateStaffForm from "../components/CreateStaffForm";
import { deactivateStaff, listStaff, reactivateStaff } from "../api/auth.api";

function StaffManagementPage() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState("");
  const [error, setError] = useState("");

  const loadStaff = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listStaff();
      setStaff(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load staff.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadStaff();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const changeActiveState = async (member) => {
    setChangingId(member._id);
    setError("");
    try {
      if (member.isActive) await deactivateStaff(member._id);
      else await reactivateStaff(member._id);
      await loadStaff();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update staff account.");
    } finally {
      setChangingId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Restaurant setup</p><h1>Staff management</h1></div><button type="button" className="button secondary" onClick={loadStaff}>Refresh</button></header>
      <section className="management-layout">
        <div className="panel"><CreateStaffForm onCreated={loadStaff} /></div>
        <section className="panel">
          <h2>Staff accounts</h2>
          {error && <p className="error" role="alert">{error}</p>}
          {loading ? <p>Loading staff...</p> : staff.length === 0 ? <p>No staff accounts yet.</p> : <div className="table-wrap"><table><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{staff.map((member) => <tr key={member._id}><td>{member.username}</td><td>{member.email}</td><td>{member.role}</td><td>{member.isActive ? "Active" : "Inactive"}</td><td><button type="button" className="button secondary" disabled={changingId === member._id} onClick={() => changeActiveState(member)}>{changingId === member._id ? "Updating..." : member.isActive ? "Deactivate" : "Reactivate"}</button></td></tr>)}</tbody></table></div>}
        </section>
      </section>
    </main>
  );
}

export default StaffManagementPage;
