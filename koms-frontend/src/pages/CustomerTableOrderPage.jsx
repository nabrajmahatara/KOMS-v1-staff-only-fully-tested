import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CustomerOrderExperience from "../components/CustomerOrderExperience";
import { getOccupiedPublicTables, submitPublicTableOrder } from "../api/public.api";

function CustomerTableOrderPage() {
  const { tableId } = useParams();
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await getOccupiedPublicTables();
        const matched = response.data.find((entry) => entry._id === tableId);
        if (!cancelled) setTable(matched || null);
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [tableId]);

  if (loading) return <main className="customer-page"><p>Loading your table...</p></main>;
  if (!table) return <main className="customer-page customer-message"><h1>This table isn&apos;t open for ordering</h1><p>Please ask a staff member to seat you, then choose your table again.</p></main>;
  return <CustomerOrderExperience tableName={table.name} sessionKey={`table:${tableId}`} showWelcome={false} submitOrder={(body) => submitPublicTableOrder(tableId, body)} />;
}

export default CustomerTableOrderPage;
