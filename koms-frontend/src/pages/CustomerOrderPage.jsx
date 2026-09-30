import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicMenu, getPublicTable, submitPublicOrder } from "../api/public.api";

function createCustomerSessionId() {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function getCustomerSessionId(tableToken) {
  const key = `koms:customer-session:${tableToken}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const sessionId = createCustomerSessionId();
  localStorage.setItem(key, sessionId);
  return sessionId;
}

function CustomerOrderPage() {
  const { token } = useParams();
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [invalidToken, setInvalidToken] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setInvalidToken(false);
      setError("");
      setConfirmation("");
      setCart([]);
      try {
        const tableResponse = await getPublicTable(token);
        const menuResponse = await getPublicMenu();
        if (cancelled) return;
        setTable(tableResponse.data);
        setCategories(menuResponse.data.categories);
        setItems(menuResponse.data.items);
        setSessionId(getCustomerSessionId(token));
      } catch (requestError) {
        if (cancelled) return;
        if (requestError.response?.status === 404) setInvalidToken(true);
        else setError("We couldn't load the menu right now. Please try again shortly.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [token]);

  const total = useMemo(() => cart.reduce((sum, entry) => sum + entry.price * entry.quantity, 0), [cart]);

  const addToCart = (item) => {
    setConfirmation("");
    setCart((previous) => {
      const existing = previous.find((entry) => entry.menuItem === item._id);
      if (existing) return previous.map((entry) => entry.menuItem === item._id ? { ...entry, quantity: entry.quantity + 1 } : entry);
      return [...previous, { menuItem: item._id, name: item.name, price: item.price, quantity: 1, notes: "" }];
    });
  };

  const updateCart = (menuItem, changes) => setCart((previous) => previous.map((entry) => entry.menuItem === menuItem ? { ...entry, ...changes } : entry));
  const removeFromCart = (menuItem) => setCart((previous) => previous.filter((entry) => entry.menuItem !== menuItem));

  const handleSubmit = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    setError("");
    setConfirmation("");
    try {
      await submitPublicOrder(token, {
        customerSessionId: sessionId,
        // Prices above are display-only. The backend loads real MenuItem prices and calculates the authoritative total.
        items: cart.map(({ menuItem, quantity, notes }) => ({ menuItem, quantity, notes })),
      });
      setCart([]);
      setConfirmation("Your order has been sent to your waiter for confirmation.");
    } catch (requestError) {
      if (requestError.response?.status === 409) {
        setError("Please wait for a staff member to seat you before ordering.");
      } else {
        setError(requestError.response?.data?.message || "We couldn't send your order. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="customer-page"><p>Loading your table and menu...</p></main>;
  if (invalidToken) return <main className="customer-page customer-message"><h1>This QR code isn&apos;t valid</h1><p>Please ask a member of staff for the correct table QR code.</p></main>;
  if (error && !table) return <main className="customer-page customer-message"><h1>Menu unavailable</h1><p className="error">{error}</p></main>;

  return (
    <main className="customer-page">
      <header className="customer-header"><p className="eyebrow">KOMS restaurant</p><h1>Ordering for {table?.name}</h1><p>Choose from the available menu and send your selections to your waiter.</p></header>
      {error && <p className="error" role="alert">{error}</p>}
      {confirmation && <p className="success" role="status">{confirmation}</p>}

      <section className="customer-menu" aria-label="Menu">
        {categories.map((category) => {
          const categoryItems = items.filter((item) => (typeof item.category === "string" ? item.category : item.category?._id) === category._id);
          if (!categoryItems.length) return null;
          return <section className="customer-category" key={category._id}><h2>{category.name}</h2><div className="customer-menu-grid">{categoryItems.map((item) => <article className="customer-menu-item" key={item._id}><div><h3>{item.name}</h3>{item.description && <p>{item.description}</p>}{item.prepTimeMinutes && <small>About {item.prepTimeMinutes} min</small>}</div><footer><strong>NPR {Number(item.price).toFixed(2)}</strong><button type="button" className="button" onClick={() => addToCart(item)}>Add</button></footer></article>)}</div></section>;
        })}
        {!items.length && <p>No menu items are available right now. Please ask a staff member for help.</p>}
      </section>

      <aside className="customer-cart" aria-label="Your order cart">
        <div className="section-heading"><h2>Your order</h2><span>{cart.reduce((count, entry) => count + entry.quantity, 0)} items</span></div>
        {!cart.length ? <p>Your order is empty. Tap <strong>Add</strong> on a menu item to begin.</p> : <ul className="cart-list">{cart.map((entry) => <li key={entry.menuItem}><div className="cart-item-heading"><strong>{entry.name}</strong><button type="button" className="text-button" onClick={() => removeFromCart(entry.menuItem)}>Remove</button></div><label>Quantity<input type="number" inputMode="numeric" min="1" value={entry.quantity} onChange={(event) => updateCart(entry.menuItem, { quantity: Math.max(1, Number(event.target.value) || 1) })} /></label><label>Special request (optional)<textarea value={entry.notes} placeholder="e.g. no onions" onChange={(event) => updateCart(entry.menuItem, { notes: event.target.value })} /></label><span>NPR {(entry.price * entry.quantity).toFixed(2)}</span></li>)}</ul>}
        <div className="cart-total"><strong>Estimated total</strong><strong>NPR {total.toFixed(2)}</strong></div>
        <button type="button" className="button customer-submit" disabled={!cart.length || submitting} onClick={handleSubmit}>{submitting ? "Sending..." : "Send order to waiter"}</button>
      </aside>
    </main>
  );
}

export default CustomerOrderPage;
