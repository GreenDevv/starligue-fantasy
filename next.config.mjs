import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Deux jeux, un seul code (ARCHITECTURE.md §35.7) :
// - jeu LBE : servi sous /lbe (NEXT_PUBLIC_BASE_PATH="/lbe", fixé au build) ;
// - jeu Starligue : à la racine, et c'est lui qui reçoit starliguefantasy.fr —
//   s'il connaît l'adresse du service LBE (LBE_ORIGIN, ex. son URL privée
//   Railway), il lui transfère tout /lbe/* (rewrite = proxy, l'URL affichée ne
//   change pas).
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
const lbeOrigin = (process.env.LBE_ORIGIN ?? "").trim().replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Dossier de build configurable pour faire tourner les deux jeux côte à côte en
  // local (sinon ils se partagent .next et se marchent dessus). Défaut inchangé.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  ...(basePath ? { basePath } : {}),
  experimental: {
    // three.js + @react-three/drei sont volumineux et n'alimentent que le
    // chunk dynamique de KitViewer3D (jamais le bundle principal) — cette
    // optimisation réduit surtout le temps de compilation en dev.
    optimizePackageImports: ["@react-three/drei", "three"],
  },
  async rewrites() {
    if (basePath || !lbeOrigin) return [];
    return [
      { source: "/lbe", destination: `${lbeOrigin}/lbe` },
      { source: "/lbe/:path*", destination: `${lbeOrigin}/lbe/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
