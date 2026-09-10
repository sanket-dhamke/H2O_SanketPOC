// Bundled thumbs for every home-service category. Remote Unsplash/Pexels URLs
// 404 or stay blank on web, so the UI always prefers these local files.

export const SERVICE_THUMBS = {
  instant: require("../../assets/services/instant.jpg"),
  cleaning: require("../../assets/services/cleaning.jpg"),
  movers: require("../../assets/services/movers.jpg"),
  ac: require("../../assets/services/ac.jpg"),
  trades: require("../../assets/services/trades.jpg"),
  painting: require("../../assets/services/painting.jpg"),
  legal: require("../../assets/services/legal.jpg"),
  interiors: require("../../assets/services/interiors.jpg"),
  salon: require("../../assets/services/salon.jpg"),
  pest: require("../../assets/services/pest.jpg"),
  laundry: require("../../assets/services/laundry.jpg"),
  cab: require("../../assets/services/cab.jpg"),
};

export function toImageSource(img) {
  if (img === 0) return 0;
  if (!img) return null;
  if (typeof img === "number") return img;
  if (typeof img === "string") return { uri: img };
  if (typeof img === "object") {
    if (img.default != null) return toImageSource(img.default);
    if (img.src) return toImageSource(img.src);
    if (img.uri || img.width || img.height) return img;
  }
  return null;
}

export function withLocalThumbs(services) {
  return (services || []).map((s) => {
    const local = SERVICE_THUMBS[s.slug];
    return local ? { ...s, image: local } : s;
  });
}

export function imageForService(serviceOrSlug, fallback) {
  const slug = typeof serviceOrSlug === "string" ? serviceOrSlug : serviceOrSlug?.slug;
  const raw = SERVICE_THUMBS[slug] || fallback || (typeof serviceOrSlug === "object" ? serviceOrSlug?.image : undefined);
  return toImageSource(raw);
}
