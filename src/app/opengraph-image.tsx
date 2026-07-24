import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Starligue Fantasy — le jeu de fantasy handball";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0E1116",
          backgroundImage:
            "radial-gradient(ellipse 90% 60% at 50% 8%, rgba(45,212,191,0.18), transparent 60%), radial-gradient(ellipse 70% 60% at 85% 95%, rgba(245,158,11,0.14), transparent 60%)",
        }}
      >
        <div
          style={{
            fontSize: 34,
            letterSpacing: 6,
            color: "#F59E0B",
            border: "2px solid rgba(245,158,11,0.5)",
            padding: "10px 28px",
            marginBottom: 28,
          }}
        >
          FANTASY HANDBALL
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 128,
            fontWeight: 800,
            color: "#F1F5F9",
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          STARLIGUE&nbsp;<span style={{ color: "#2DD4BF" }}>FANTASY</span>
        </div>
        <div style={{ fontSize: 32, color: "#94A3B8", marginTop: 26 }}>
          Compose ton équipe. Marque sur le réel. Défie tes amis.
        </div>
      </div>
    ),
    { ...size }
  );
}
