import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { addOrderItem, listOrders, updateOrderStatus } from "../api/order.api";
import { listMenuItems } from "../api/menu.api";

const ACTIVE_STATUSES = "pending,confirmed,preparing,ready";
const EDITABLE_STATUSES = ["pending", "confirmed"];

function WaiterOrdersPage() {
  const location = useLocation();
  const [orders, setOrders] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [addForms, setAddForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const loadOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const [orderResponse, itemResponse] = await Promise.all([
        listOrders({ status: ACTIVE_STATUSES }),
        listMenuItems(),
      ]);
      setOrders(orderResponse.data);
      setAvailableItems(itemResponse.data.filter((item) => item.isAvailable));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load your active orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadOrders(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const getAddForm = (orderId) => addForms[orderId] || { menuItem: "", quantity: "1", notes: "" };
  const updateAddForm = (orderId, changes) => setAddForms((previous) => ({
    ...previous,
    [orderId]: { ...(previous[orderId] || { menuItem: "", quantity: "1", notes: "" }), ...changes },
  }));

  const handleAddItem = async (event, order) => {
    event.preventDefault();
    const form = getAddForm(order._id);
    if (!form.menuItem) {
      setError("Choose an available menu item to add.");
      return;
    }
    setUpdatingId(order._id);
    setError("");
    try {
      const response = await addOrderItem(order._id, { ...form, quantity: Number(form.quantity) });
      setOrders((previous) => previous.map((current) => current._id === order._id ? response.data : current));
      setAddForms((previous) => ({ ...previous, [order._id]: { menuItem: "", quantity: "1", notes: "" } }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to add item to the order.");
    } finally {
      setUpdatingId("");
    }
  };

  const handleCancel = async (order) => {
    setUpdatingId(order._id);
    setError("");
    try {
      await updateOrderStatus(order._id, "cancelled");
      setOrders((previous) => previous.filter((current) => current._id !== order._id));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to cancel order.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Waiter</p><h1>My active orders</h1></div><button type="button" className="button secondary" onClick={loadOrders}>Refresh</button></header>
      {location.state?.success && <p className="success" role="status">{location.state.success}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading orders...</p> : orders.length === 0 ? <section className="panel"><p>You have no active orders.</p></section> : <div className="order-card-list">{orders.map((order) => {
        const editable = EDITABLE_STATUSES.includes(order.status);
        return <section className="panel order-card" key={order._id}><div className="section-heading"><div><h2>{order.table?.name || "Table"}</h2><p className="status-label">{order.status}</p></div><strong>NPR {Number(order.totalAmount).toFixed(2)}</strong></div><ul className="order-item-list">{order.items.map((item) => <li key={item._id}><span>{item.quantity} × {item.nameSnapshot}</span>{item.notes && <small>Note: {item.notes}</small>}</li>)}</ul>{editable && <form className="add-item-form" onSubmit={(event) => handleAddItem(event, order)}><h3>Add an item</h3><select value={getAddForm(order._id).menuItem} onChange={(event) => updateAddForm(order._id, { menuItem: event.target.value })}><option value="">Select available item</option>{availableItems.map((item) => <option key={item._id} value={item._id}>{item.name} — NPR {Number(item.price).toFixed(2)}</option>)}</select><input aria-label="Quantity" type="number" min="1" value={getAddForm(order._id).quantity} onChange={(event) => updateAddForm(order._id, { quantity: event.target.value })} /><input aria-label="Note" placeholder="Optional note" value={getAddForm(order._id).notes} onChange={(event) => updateAddForm(order._id, { notes: event.target.value })} /><button className="button" disabled={updatingId === order._id} type="submit">Add item</button></form>}{order.status !== "served" && <button type="button" className="button danger" disabled={updatingId === order._id} onClick={() => handleCancel(order)}>{updatingId === order._id ? "Updating..." : "Cancel order"}</button>}{!editable && <p className="muted">Items can only be changed while an order is pending or confirmed.</p>}</section>;
      })}</div>}
    </main>
  );
}

export default WaiterOrdersPage;
