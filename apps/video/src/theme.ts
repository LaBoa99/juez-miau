import { loadFont as loadStencil } from "@remotion/google-fonts/BigShouldersStencil";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Easing, interpolate } from "remotion";

// Mismos tokens que site/styles.css (tema claro).
export const c = {
  kraft: "#C99A5E",
  kraftDark: "#A87C45",
  kraftIn: "#7A5630",
  floor: "#3B2C1C",
  ink: "#1E1A16",
  tape: "#1A43BF",
  sticker: "#BE2018",
  label: "#FFFFFF",
  labelInk: "#141210",
  labelDim: "#57514A",
  ok: "#0F7140",
  bad: "#C2261E",
  warn: "#8A5A00",
};

export const font = {
  stencil: loadStencil("normal", { weights: ["800"], subsets: ["latin"] }).fontFamily,
  sans: loadInter("normal", { weights: ["400", "600", "800"], subsets: ["latin"] }).fontFamily,
  mono: loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily,
};

// --ease de la página
export const ease = Easing.bezier(0.16, 1, 0.3, 1);

// interpolate con clamp en ambos lados
export const ramp = (
  f: number,
  [a, b]: readonly [number, number],
  [from, to]: readonly [number, number],
  easing: (t: number) => number = ease,
) =>
  interpolate(f, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
