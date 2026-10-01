import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CustomerOrderExperience from "../components/CustomerOrderExperience";
import { getPublicTable, submitPublicOrder } from "../api/public.api";

function CustomerOrderPage() {
  const { token } = useParams();
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invalidToken, setInvalidToken] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setInvalidToken(false); setError("");
      try {
        const response = await getPublicTable(token);
        if (!cancelled) setTable(response.data);
      } catch (requestError) {
        if (!cancelled && requestError.response?.status === 404) setInvalidToken(true);
        else if (!cancelled) setError("We couldn't load this table right now. Please try again shortly.");
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <main className="customer-page"><p>Loading your table...</p></main>;
  if (invalidToken) return <main className="customer-page customer-message"><h1>This QR code isn&apos;t valid</h1><p>Please ask a member of staff for the correct table QR code.</p></main>;
  if (error) return <main className="customer-page customer-message"><h1>Table unavailable</h1><p className="error">{error}</p></main>;
  return <CustomerOrderExperience tableName={table.name} sessionKey={`token:${token}`} submitOrder={(body) => submitPublicOrder(token, body)} />;
}

export default CustomerOrderPage;
