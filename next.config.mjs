import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    // three.js + @react-three/drei sont volumineux et n'alimentent que le
    // chunk dynamique de KitViewer3D (jamais le bundle principal) — cette
    // optimisation réduit surtout le temps de compilation en dev.
    optimizePackageImports: ["@react-three/drei", "three"],
  },
};

export default withNextIntl(nextConfig);
