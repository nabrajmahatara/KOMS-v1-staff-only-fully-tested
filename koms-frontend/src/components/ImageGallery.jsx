import { ImageReveal } from "./Reveal";

export default function ImageGallery() {
  return (
    <section className="editorial-gallery" aria-label="A glimpse of Maison KOMS">
      <ImageReveal className="gallery-wide" src="/images/hero-terrace.png" alt="Warm evening at a European restaurant terrace" />
      <ImageReveal className="gallery-tall" src="/images/interior.png" alt="Intimate wine bar interior" />
      <ImageReveal className="gallery-small" src="/images/food.png" alt="Shared small plates at Maison KOMS" />
    </section>
  );
}
