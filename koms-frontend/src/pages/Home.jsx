import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import ImageGallery from "../components/ImageGallery";
import About from "../components/About";
import MenuIntro from "../components/MenuIntro";
import FoodMenu from "../components/FoodMenu";
import DrinksMenu from "../components/DrinksMenu";
import WineMenu from "../components/WineMenu";
import OpeningHours from "../components/OpeningHours";
import Contact from "../components/Contact";
import Footer from "../components/Footer";
import "./Home.css";

export default function Home() { return <main id="top" className="restaurant-site min-h-screen"><Navbar /><Hero /><ImageGallery /><About /><MenuIntro /><FoodMenu /><DrinksMenu /><WineMenu /><OpeningHours /><Contact /><Footer /></main>; }
