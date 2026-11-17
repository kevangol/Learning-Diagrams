import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Learning Diagrams",
    short_name: "Diagrams",
    description: "Zoomable viewer for learning diagrams",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0d12",
    theme_color: "#0f1218",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
