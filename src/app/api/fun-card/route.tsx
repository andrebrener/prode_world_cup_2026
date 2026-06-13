// Imagen compartible de una carta del Modo Diversión (reemplaza el screenshot
// manual que se mandan al grupo de WhatsApp). Genera un PNG branded con
// ImageResponse (satori): emoji grande, borde/glow según rareza, nombre y
// descripción. El contenido depende 100% de los query params, así que es
// cacheable por URL en el CDN.

import { ImageResponse } from "next/og";
import { RARITY_LABEL, type CardRarity } from "@/lib/cardCatalog";

const RARITY_HEX: Record<CardRarity, { ring: string; text: string; glow: string }> = {
  comun: { ring: "#00e5ff", text: "#7ee7f4", glow: "rgba(0,229,255,0.35)" },
  rara: { ring: "#8b3cff", text: "#c9a2ff", glow: "rgba(139,60,255,0.45)" },
  legendaria: { ring: "#ffd24a", text: "#ffd24a", glow: "rgba(255,210,74,0.55)" },
  maldicion: { ring: "#39ff5a", text: "#7dff96", glow: "rgba(57,255,90,0.45)" },
};

const RARITIES: CardRarity[] = ["comun", "rara", "legendaria", "maldicion"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const name = (searchParams.get("name") ?? "Carta del día").slice(0, 40);
  const emoji = (searchParams.get("emoji") ?? "🃏").slice(0, 8);
  const rarityParam = searchParams.get("rarity") ?? "comun";
  const rarity: CardRarity = RARITIES.includes(rarityParam as CardRarity)
    ? (rarityParam as CardRarity)
    : "comun";
  const curse = searchParams.get("curse") === "1";
  const desc = (searchParams.get("desc") ?? "").slice(0, 160);
  const by = (searchParams.get("by") ?? "").slice(0, 40);

  const r = RARITY_HEX[rarity];
  const label = curse ? "☠️ Maldición" : RARITY_LABEL[rarity];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#0a0e0a",
          padding: "56px 48px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            color: "#8aa088",
            textTransform: "uppercase",
          }}
        >
          Zona de cartas 🃏
        </div>

        {/* Carta */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 560,
            padding: "48px 40px",
            borderRadius: 40,
            border: `6px solid ${r.ring}`,
            backgroundColor: "#121a12",
            boxShadow: `0 0 90px ${r.glow}`,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              color: "#8aa088",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            {by ? `De ${by}` : "Carta del día"}
          </div>
          <div style={{ display: "flex", fontSize: 200, lineHeight: 1 }}>{emoji}</div>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 900,
              color: "#eafbe7",
              textAlign: "center",
              marginTop: 28,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 4,
              color: r.text,
              textTransform: "uppercase",
              marginTop: 14,
            }}
          >
            {label}
          </div>
        </div>

        {/* Descripción */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "#8aa088",
            textAlign: "center",
            maxWidth: 640,
            lineHeight: 1.35,
          }}
        >
          {desc}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: 3,
            color: "#ffd24a",
            textTransform: "uppercase",
          }}
        >
          Prode Mundial 2026 🏆
        </div>
      </div>
    ),
    {
      width: 800,
      height: 1000,
      headers: {
        "cache-control": "public, max-age=86400, immutable",
      },
    },
  );
}
