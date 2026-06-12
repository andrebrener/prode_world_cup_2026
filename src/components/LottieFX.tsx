"use client";

// Reproductor liviano para los Lottie propios (public/lottie/*.json),
// generados con la skill text-to-lottie. Decorativo: sin interacción.

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export default function LottieFX({
  src,
  className,
  loop = true,
}: {
  src: string;
  className?: string;
  loop?: boolean;
}) {
  return (
    <div className={className} aria-hidden>
      <DotLottieReact src={src} loop={loop} autoplay />
    </div>
  );
}
