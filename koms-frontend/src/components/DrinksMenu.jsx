import { drinkGroups } from "../data/drinks";
import { MenuRows } from "./FoodMenu";
import { Reveal } from "./Reveal";
export default function DrinksMenu() { return <section className="drinks-section"><Reveal><p className="section-index">03 Drinks</p><h2>VERY<br />COLD.</h2></Reveal>{drinkGroups.map((group, index) => <Reveal key={group.title} delay={index * 0.03} className="drink-group"><h3>{group.title}</h3><MenuRows items={group.items} /></Reveal>)}</section>; }
