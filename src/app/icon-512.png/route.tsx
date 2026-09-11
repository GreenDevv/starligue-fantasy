import { ImageResponse } from "next/og";

// Icône PWA 512×512 — voir icon-192.png/route.tsx.
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
          fontSize: 256,
          fontWeight: 800,
        }}
      >
        SF
      </div>
    ),
    { width: 512, height: 512 }
  );
}
