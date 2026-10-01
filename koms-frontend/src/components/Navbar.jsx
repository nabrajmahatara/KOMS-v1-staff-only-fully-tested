import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

const links = [["Order", "/order"], ["Menu", "#menu"], ["About", "#about"], ["Hours", "#hours"], ["Contact", "#contact"]];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return <nav className={`restaurant-nav ${isOpen ? "is-open" : ""}`} aria-label="Main navigation">
    <a className="restaurant-mark" href="#top">MAISON KOMS</a>
    <button className="mobile-nav-toggle" type="button" aria-label={isOpen ? "Close navigation" : "Open navigation"} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
      {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
    </button>
    <div className="restaurant-nav-links" onClick={() => setIsOpen(false)}>{links.map(([label, href]) => href.startsWith("/") ? <Link key={label} to={href}>{label}</Link> : <a key={label} href={href}>{label}</a>)}</div>
    <Link className="nav-staff" to="/login">Staff login</Link>
  </nav>;
}
