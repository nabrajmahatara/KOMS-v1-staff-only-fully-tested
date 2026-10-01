const fallbackImage = "/images/menu-placeholder.svg";

const imageBaseUrl = new URL(import.meta.env.VITE_API_URL || '/api', window.location.origin).origin;

export function getMenuImage(item, category) {
  const imagePath = item?.imageUrl || category?.imageUrl || item?.category?.imageUrl;
  return imagePath?.startsWith("/") ? `${imageBaseUrl}${imagePath}` : imagePath || fallbackImage;
}

export function handleImageFallback(event) {
  if (event.currentTarget.src.endsWith(fallbackImage)) return;
  event.currentTarget.src = fallbackImage;
}
