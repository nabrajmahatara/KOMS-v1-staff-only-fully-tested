import { useEffect, useState } from "react";
import { listOrders, updateOrderItemStatus } from "../api/order.api";
import { useSocket } from "../context/SocketContext";

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];
const COLUMNS = [
  { key: "new", label: "New", statuses: ["pending", "confirmed"] },
  { key: "preparing", label: "Preparing", statuses: ["preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
];
const NEXT_ITEM_ACTION = {
  pending: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "served", label: "Mark served" },
};

function timeAgo(createdAt) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min ago";
  return `${minutes} min ago`;
}

function KitchenDisplayPage() {
  const socket = useSocket();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingItemId, setUpdatingItemId] = useState("");
  const [error, setError] = useState("");

  const upsertOrder = (order) => {
    setOrders((previous) => {
      if (!ACTIVE_STATUSES.includes(order.status)) return previous.filter((current) => current._id !== order._id);
      const existing = previous.some((current) => current._id === order._id);
      return existing ? previous.map((current) => current._id === order._id ? order : current) : [order, ...previous];
    });
  };

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await listOrders({ status: ACTIVE_STATUSES.join(",") });
      setOrders(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load kitchen orders.");
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
    const handleNewOrder = (order) => upsertOrder(order);
    const handleOrderUpdated = (order) => upsertOrder(order);
    socket.on("order:new", handleNewOrder);
    socket.on("order:updated", handleOrderUpdated);
    return () => {
      socket.off("order:new", handleNewOrder);
      socket.off("order:updated", handleOrderUpdated);
    };
  }, [socket]);

  const handleItemStatus = async (orderId, itemId, itemStatus) => {
    setUpdatingItemId(itemId);
    setError("");
    try {
      const response = await updateOrderItemStatus(orderId, itemId, itemStatus);
      upsertOrder(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update item status.");
    } finally {
      setUpdatingItemId("");
    }
  };

  return (
    <main className="page-shell kitchen-page">
      <header className="page-header"><div><p className="eyebrow">Kitchen</p><h1>Live order board</h1><p>{socket ? "Live updates connected" : "Connecting to live updates..."}</p></div><button type="button" className="button secondary" onClick={loadOrders}>Refresh</button></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading kitchen orders...</p> : <div className="kitchen-board">{COLUMNS.map((column) => {
        const columnOrders = orders.filter((order) => column.statuses.includes(order.status));
        return <section className="kitchen-column" key={column.key}><h2>{column.label} <span>{columnOrders.length}</span></h2>{columnOrders.length === 0 ? <p className="muted">No orders.</p> : columnOrders.map((order) => {
          const delayed = Date.now() - new Date(order.createdAt).getTime() >= 10 * 60 * 1000;
          return <article className={`kitchen-order-card ${delayed ? "delayed" : ""}`} key={order._id}><div className="order-card-top"><div><h3>{order.table?.name || "Table"}</h3><p>{timeAgo(order.createdAt)}</p></div>{delayed && <span className="delay-badge">10+ min</span>}</div><ul className="kitchen-items">{order.items.map((item) => {
            const action = NEXT_ITEM_ACTION[item.itemStatus];
            return <li key={item._id}><div><strong>{item.quantity} × {item.nameSnapshot}</strong><span>{item.itemStatus}</span>{item.notes && <small>Note: {item.notes}</small>}</div>{action && <button type="button" className="button" disabled={updatingItemId === item._id} onClick={() => handleItemStatus(order._id, item._id, action.status)}>{updatingItemId === item._id ? "Updating..." : action.label}</button>}</li>;
          })}</ul></article>;
        })}</section>;
      })}</div>}
    </main>
  );
}

export default KitchenDisplayPage;
