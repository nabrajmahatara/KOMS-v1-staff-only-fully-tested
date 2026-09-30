import { useEffect, useState } from "react";
import { listOrders, updateOrderStatus } from "../api/order.api";
import { useSocket } from "../context/SocketContext";

function CashierPage() {
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState("");
  const [error, setError] = useState("");

  const upsertServedOrder = (order) => {
    setOrders((previous) => {
      if (order.status !== "served") return previous.filter((current) => current._id !== order._id);
      const existing = previous.some((current) => current._id === order._id);
      return existing ? previous.map((current) => current._id === order._id ? order : current) : [order, ...previous];
    });
  };

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listOrders({ status: "served" });
      setOrders(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load orders awaiting payment.");
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
    const handleOrderUpdated = (order) => upsertServedOrder(order);
    socket.on("order:updated", handleOrderUpdated);
    return () => socket.off("order:updated", handleOrderUpdated);
  }, [socket]);

  const handlePayment = async (orderId) => {
    setPayingId(orderId);
    setError("");
    try {
      const response = await updateOrderStatus(orderId, "paid");
      upsertServedOrder(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to mark this order as paid.");
    } finally {
      setPayingId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Cashier</p><h1>Orders awaiting payment</h1><p>{socket ? "Live updates connected" : "Connecting to live updates..."}</p></div><button type="button" className="button secondary" onClick={loadOrders}>Refresh</button></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading served orders...</p> : orders.length === 0 ? <section className="panel"><p>No served orders are awaiting payment.</p></section> : <div className="cashier-order-list">{orders.map((order) => <section className="panel cashier-order-card" key={order._id}><div className="section-heading"><div><p className="eyebrow">{order.table?.name || "Table"}</p><h2>Served order</h2></div><strong className="cashier-total">NPR {Number(order.totalAmount).toFixed(2)}</strong></div><ul className="payment-item-list">{order.items.map((item) => <li key={item._id}><span>{item.quantity} × {item.nameSnapshot}</span><span>NPR {Number(item.unitPrice).toFixed(2)} each</span><strong>NPR {(item.quantity * item.unitPrice).toFixed(2)}</strong>{item.notes && <small>Note: {item.notes}</small>}</li>)}</ul><div className="payment-footer"><strong>Total: NPR {Number(order.totalAmount).toFixed(2)}</strong><button type="button" className="button" disabled={payingId === order._id} onClick={() => handlePayment(order._id)}>{payingId === order._id ? "Marking paid..." : "Mark as paid"}</button></div></section>)}</div>}
    </main>
  );
}

export default CashierPage;
