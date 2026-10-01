import { Link } from "react-router-dom";

function CustomerLandingPage() {
  return <main className="customer-page customer-welcome"><section className="customer-welcome-card customer-landing-card"><p className="eyebrow">KOMS restaurant</p><h1>Welcome to KOMS restaurant</h1><p>Browse the menu and send your order to a waiter for confirmation.</p><Link className="button customer-start customer-link-button" to="/order">Start ordering</Link><Link className="staff-login-link" to="/login">Staff login</Link></section></main>;
}

export default CustomerLandingPage;
