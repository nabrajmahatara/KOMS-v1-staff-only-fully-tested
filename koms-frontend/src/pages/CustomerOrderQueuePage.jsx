import { useEffect, useState } from "react";
import { listAwaitingConfirmationOrders, reviewCustomerOrder } from "../api/order.api";
import { useSocket } from "../context/SocketContext";

function CustomerOrderQueuePage() {
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const upsertAwaitingOrder = (order) => {
    setOrders((previous) => {
      if (order.status !== "awaiting_confirmation") {
        return previous.filter((current) => current._id !== order._id);
      }
      const exists = previous.some((current) => current._id === order._id);
      return exists ? previous.map((current) => current._id === order._id ? order : current) : [order, ...previous];
    });
  };

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listAwaitingConfirmationOrders();
      setOrders(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load customer orders awaiting confirmation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadOrders(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const handleAwaitingOrder = (order) => upsertAwaitingOrder(order);
    const handleConfirmationUpdate = (order) => upsertAwaitingOrder(order);
    socket.on("order:awaitingConfirmation", handleAwaitingOrder);
    socket.on("order:confirmationUpdated", handleConfirmationUpdate);
    return () => {
      socket.off("order:awaitingConfirmation", handleAwaitingOrder);
      socket.off("order:confirmationUpdated", handleConfirmationUpdate);
    };
  }, [socket]);

  const handleReview = async (order, action) => {
    setUpdatingId(order._id);
    setError("");
    try {
      const response = await reviewCustomerOrder(order._id, action, reasons[order._id] || "");
      upsertAwaitingOrder(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to review customer order.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Waiter</p><h1>Customer order review</h1><p>{socket ? "Live updates connected" : "Connecting to live updates..."}</p></div><button type="button" className="button secondary" onClick={loadOrders}>Refresh</button></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading customer orders...</p> : orders.length === 0 ? <section className="panel"><p>No customer orders are awaiting confirmation.</p></section> : <div className="order-card-list">{orders.map((order) => <section className="panel order-card" key={order._id}><div className="section-heading"><div><p className="eyebrow">{order.table?.name || "Table"}</p><h2>Customer order</h2></div><strong>NPR {Number(order.totalAmount).toFixed(2)}</strong></div><ul className="order-item-list">{order.items.map((item) => <li key={item._id}><span>{item.quantity} × {item.nameSnapshot}</span><span>NPR {(item.quantity * item.unitPrice).toFixed(2)}</span>{item.notes && <small>Note: {item.notes}</small>}</li>)}</ul><label>Rejection reason (optional)<input value={reasons[order._id] || ""} onChange={(event) => setReasons((previous) => ({ ...previous, [order._id]: event.target.value }))} placeholder="Optional note for staff" /></label><div className="review-actions"><button type="button" className="button" disabled={updatingId === order._id} onClick={() => handleReview(order, "confirm")}>{updatingId === order._id ? "Updating..." : "Confirm and send to kitchen"}</button><button type="button" className="button danger" disabled={updatingId === order._id} onClick={() => handleReview(order, "reject")}>Reject</button></div></section>)}</div>}
    </main>
  );
}

export default CustomerOrderQueuePage;
