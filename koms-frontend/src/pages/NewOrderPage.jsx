import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTables } from "../api/table.api";
import { listCategories, listMenuItems } from "../api/menu.api";
import { createOrder } from "../api/order.api";
import { getMenuImage, handleImageFallback } from "../utils/menuImage";

function NewOrderPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const [tableResponse, categoryResponse, itemResponse] = await Promise.all([
        listTables(), listCategories(), listMenuItems(),
      ]);
      setTables(tableResponse.data);
      setCategories([...categoryResponse.data].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)));
      setItems(itemResponse.data.filter((item) => item.isAvailable));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load tables and menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadSetup(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, entry) => sum + entry.price * entry.quantity, 0),
    [cart]
  );

  const addToCart = (item) => {
    setCart((previous) => {
      const existing = previous.find((entry) => entry.menuItem === item._id);
      if (existing) return previous.map((entry) => entry.menuItem === item._id ? { ...entry, quantity: entry.quantity + 1 } : entry);
      return [...previous, { menuItem: item._id, name: item.name, price: item.price, quantity: 1, notes: "" }];
    });
  };

  const updateCartItem = (id, changes) => setCart((previous) => previous.map((entry) => entry.menuItem === id ? { ...entry, ...changes } : entry));
  const removeFromCart = (id) => setCart((previous) => previous.filter((entry) => entry.menuItem !== id));

  const handleSubmit = async () => {
    if (!selectedTableId) {
      setError("Select a free table before submitting the order.");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one menu item before submitting.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await createOrder({
        table: selectedTableId,
        items: cart.map(({ menuItem, quantity, notes }) => ({ menuItem, quantity, notes })),
      });
      setCart([]);
      setSelectedTableId("");
      navigate("/orders", { state: { success: `Order for ${response.data.table.name} was sent to the kitchen.` } });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create order.");
      await loadSetup();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header"><div><p className="eyebrow">Waiter</p><h1>New order</h1><p>Select a free table, then add available menu items.</p></div></header>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p>Loading order setup...</p> : <div className="order-layout">
        <section className="panel order-main">
          <h2>1. Select table</h2>
          <div className="table-selector">{tables.map((table) => <button type="button" key={table._id} className={`table-choice ${table.status} ${selectedTableId === table._id ? "selected" : ""}`} disabled={table.status !== "free"} onClick={() => setSelectedTableId(table._id)}><strong>{table.name}</strong><span>{table.capacity} seats · {table.status}</span></button>)}</div>
          {tables.length === 0 && <p>No tables have been configured.</p>}

          <h2>2. Add menu items</h2>
          <nav className="category-navigation" aria-label="Menu categories">
            <button type="button" aria-pressed={selectedCategory === "all"} onClick={() => setSelectedCategory("all")}>All dishes</button>
            {categories.map(category => <button type="button" key={category._id} aria-pressed={selectedCategory === category._id} onClick={() => setSelectedCategory(category._id)}>{category.name}</button>)}
          </nav>
          {categories.filter(category => selectedCategory === "all" || category._id === selectedCategory).map((category) => {
            const categoryItems = items.filter((item) => (typeof item.category === "string" ? item.category : item.category?._id) === category._id);
            return categoryItems.length > 0 && <section className="menu-picker" key={category._id}><h3>{category.name}</h3><div className="menu-picker-grid">{categoryItems.map((item) => <button type="button" key={item._id} className="menu-choice" onClick={() => addToCart(item)}><img className="menu-choice-image" src={getMenuImage(item, category)} alt="" onError={handleImageFallback} /><strong>{item.name}</strong><span>NPR {Number(item.price).toFixed(2)}</span>{item.description && <small>{item.description}</small>}</button>)}</div></section>;
          })}
          {items.length === 0 && <p>No available menu items right now.</p>}
        </section>

        <aside className="panel cart-panel">
          <h2>3. Order cart</h2>
          {cart.length === 0 ? <p>Your cart is empty.</p> : <ul className="cart-list">{cart.map((entry) => <li key={entry.menuItem}><div className="cart-item-heading"><strong>{entry.name}</strong><button type="button" className="text-button" onClick={() => removeFromCart(entry.menuItem)}>Remove</button></div><label>Quantity<input type="number" min="1" value={entry.quantity} onChange={(event) => updateCartItem(entry.menuItem, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></label><label>Note<textarea placeholder="e.g. no onions" value={entry.notes} onChange={(event) => updateCartItem(entry.menuItem, { notes: event.target.value })} /></label><span>NPR {(entry.price * entry.quantity).toFixed(2)}</span></li>)}</ul>}
          <div className="cart-total"><strong>Total</strong><strong>NPR {total.toFixed(2)}</strong></div>
          <button type="button" className="button" disabled={submitting || !selectedTableId || cart.length === 0} onClick={handleSubmit}>{submitting ? "Sending order..." : "Submit order"}</button>
        </aside>
      </div>}
    </main>
  );
}

export default NewOrderPage;
