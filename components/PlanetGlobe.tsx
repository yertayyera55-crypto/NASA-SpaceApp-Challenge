"use client";

import { useEffect, useRef } from "react";
import type { Planet } from "@/lib/types";

export default function PlanetGlobe({ planet }: { planet: Planet | "earth" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const target = canvas.current;
      const context = target?.getContext("2d");
      if (!target || !context) return;
      const raster = document.createElement("canvas");
      raster.width = image.width;
      raster.height = image.height;
      const source = raster.getContext("2d");
      if (!source) return;
      source.drawImage(image, 0, 0);
      const surface = source.getImageData(0, 0, raster.width, raster.height).data;
      const size = target.width;
      const frame = context.createImageData(size, size);
      const longitude = planet === "mars" ? 24 : planet === "earth" ? 20 : 12;
      const tint = planet === "mars" ? [1.16, .94, .77] : planet === "moon" ? [.92, .99, 1.12] : [1, 1, 1];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const x = (col + .5) / (size / 2 - 1) - 1;
          const y = 1 - (row + .5) / (size / 2 - 1);
          const r = Math.hypot(x, y);
          if (r >= 1) continue;
          const z = Math.sqrt(1 - r * r);
          const u = Math.floor(((Math.atan2(x, z) / (2 * Math.PI) + .5 + longitude / 360) % 1) * raster.width);
          const v = Math.floor((.5 - Math.asin(y) / Math.PI) * raster.height);
          const src = (v * raster.width + u) * 4;
          const out = (row * size + col) * 4;
          const light = .11 + .97 * Math.max(0, -.55 * x + .32 * y + .71 * z);
          for (let channel = 0; channel < 3; channel++) frame.data[out + channel] = surface[src + channel] * light * tint[channel];
          frame.data[out + 3] = Math.min(255, (1 - r) * size * 145);
        }
      }
      context.putImageData(frame, 0, 0);
    };
    image.src = planet === "earth" ? "/images/earth.png" : `/images/${planet}.jpg`;
    return () => { image.onload = null; };
  }, [planet]);
  return <canvas width={660} height={660} ref={canvas} aria-hidden="true" />;
}
