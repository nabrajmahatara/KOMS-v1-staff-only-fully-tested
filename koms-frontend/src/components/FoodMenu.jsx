import { foodMenu } from "../data/food";
import { Reveal } from "./Reveal";
const MenuRows = ({ items }) => <div className="menu-rows">{items.map((item) => <div className="menu-row" key={item.name}><div><h4>{item.name}</h4><p>{item.description}</p></div><strong>€{item.price}</strong></div>)}</div>;
export { MenuRows };
export default function FoodMenu() { return <section className="food-section"><Reveal><div className="split-heading"><div><p className="section-index">Food</p><h2>FOR THE<br />MIDDLE.</h2></div><p>Our food moves with the market. A few things to share, one or two you will want all to yourself.</p></div><MenuRows items={foodMenu} /></Reveal></section>; }
