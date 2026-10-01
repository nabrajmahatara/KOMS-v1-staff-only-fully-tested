import { motion } from "framer-motion";

export function Reveal({ children, className = "", delay = 0 }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: 0.72, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

export function ImageReveal({ src, alt, className = "" }) {
  return <motion.figure className={`image-reveal ${className}`} initial={{ clipPath: "inset(0 0 100% 0)", opacity: 0 }} whileInView={{ clipPath: "inset(0 0 0% 0)", opacity: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}><motion.img src={src} alt={alt} whileHover={{ scale: 1.018 }} transition={{ duration: 0.45 }} /></motion.figure>;
}
