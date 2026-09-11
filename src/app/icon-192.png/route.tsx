import { ImageResponse } from "next/og";

// Icône PWA 192×192 — mêmes couleurs que icon.tsx (favicon 32×32), taille requise
// par le manifest pour qu'iOS/Android proposent "Ajouter à l'écran d'accueil"
// (prérequis des notifications Web Push sur iOS 16.4+, voir manifest.ts).
export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0E1116",
          color: "#2DD4BF",
          fontSize: 96,
          fontWeight: 800,
        }}
      >
        SF
      </div>
    ),
    { width: 192, height: 192 }
  );
}
