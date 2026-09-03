import { sanitizeTheme, type Theme, type ThemeStyleTokens, type ThemeTokens } from "@domain/index";

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";
export type AppearanceDensity = "compact" | "comfortable" | "spacious";
export type InterfaceStyle = "studio" | "garden";

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface RgbaColor extends RgbColor {
  alpha: number;
}

type ColorVector = readonly [number, number, number];
type ColorMatrix = readonly [ColorVector, ColorVector, ColorVector];

export interface AppearanceVariables {
  "--lb-accent": string;
  "--lb-accent-2": string;
  "--lb-on-accent": string;
  "--lb-accent-soft": string;
  "--lb-background": string;
  "--lb-surface": string;
  "--lb-surface-strong": string;
  "--lb-text": string;
  "--lb-muted": string;
  "--lb-radius": string;
  "--lb-radius-sm": string;
  "--lb-radius-md": string;
  "--lb-radius-lg": string;
  "--lb-density": string;
  "--lb-heading-font": string;
  "--lb-body-font": string;
  "--print-accent": string;
  "--print-muted": string;
  "--print-paper": string;
  "--print-text": string;
}

export interface DerivedAppearance {
  resolved: ResolvedAppearance;
  variables: Readonly<AppearanceVariables>;
  dataset: Readonly<{
    appearance: AppearanceMode;
    resolvedAppearance: ResolvedAppearance;
    density: AppearanceDensity;
    themeSurface: ThemeStyleTokens["surface"];
    themeElevation: ThemeStyleTokens["elevation"];
    themeOrnament: ThemeStyleTokens["ornament"];
  }>;
}

export interface PrintPalette {
  accent: string;
  muted: string;
  paper: string;
  text: string;
}

export const APPEARANCE_STORAGE_KEY = "lyricbook-appearance";
export const DEFAULT_INTERFACE_STYLE: InterfaceStyle = "studio";
export const INTERFACE_STYLE_STORAGE_KEY = "lyricbook-interface-style";

export const THEME_FONT_STACKS = {
  serif:
    '"Iowan Old Style", "Songti SC", STSong, "Noto Serif CJK SC", "Times New Roman", ui-serif, Georgia, serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans CJK SC", ui-sans-serif, system-ui, sans-serif',
} as const;

const COLOR_FALLBACKS = {
  accent: "#795548",
  accent2: "#8d6e63",
  darkBackground: "#17132b",
  darkSurface: "#25203a",
  darkSurfaceStrong: "#30294b",
  darkText: "#f9f7ff",
  darkMuted: "#bbb5cf",
  paper: "#fffdf8",
  printAccent: "#694e98",
  printText: "#18161a",
} as const;

const SAFE_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const SAFE_PERCENT = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)%$/i;
const DANGEROUS_COLOR_CONTENT = /(?:url|var|env|attr|image-set)\s*\(/i;

const XYZ_D65_TO_LINEAR_SRGB: ColorMatrix = [
  [3.240_969_941_904_522_6, -1.537_383_177_570_094, -0.498_610_760_293_003_4],
  [-0.969_243_636_280_879_6, 1.875_967_501_507_720_2, 0.041_555_057_407_175_59],
  [0.055_630_079_696_993_66, -0.203_976_958_888_976_52, 1.056_971_514_242_878_6],
];
const LINEAR_DISPLAY_P3_TO_XYZ_D65: ColorMatrix = [
  [0.486_570_948_648_216_2, 0.265_667_693_169_093_06, 0.198_217_285_234_362_5],
  [0.228_974_564_069_748_8, 0.691_738_521_836_506_4, 0.079_286_914_093_745],
  [0, 0.045_113_381_858_902_64, 1.043_944_368_900_976],
];
const LINEAR_A98_TO_XYZ_D65: ColorMatrix = [
  [0.576_669_042_910_130_5, 0.185_558_237_906_546_3, 0.188_228_646_234_994_7],
  [0.297_344_975_250_536_05, 0.627_363_566_255_466_1, 0.075_291_458_493_997_88],
  [0.027_031_361_386_412_34, 0.070_688_852_535_827_23, 0.991_337_536_837_638_8],
];
const LINEAR_PROPHOTO_TO_XYZ_D50: ColorMatrix = [
  [0.797_766_644_900_642_3, 0.135_181_297_400_533_08, 0.031_347_734_128_392_2],
  [0.288_074_828_819_401_3, 0.711_835_234_241_873, 0.000_089_936_938_725_64],
  [0, 0, 0.825_104_602_510_460_1],
];
const XYZ_D50_TO_D65: ColorMatrix = [
  [0.955_473_452_704_218_2, -0.023_098_536_874_261_423, 0.063_259_308_661_021_7],
  [-0.028_369_706_963_208_136, 1.009_995_458_005_822_6, 0.021_041_398_966_943_008],
  [0.012_314_001_688_319_899, -0.020_507_696_433_477_912, 1.330_365_936_608_075_3],
];
const LINEAR_REC2020_TO_XYZ_D65: ColorMatrix = [
  [0.636_958_048_301_291_4, 0.144_616_903_586_208_32, 0.168_880_975_164_172_1],
  [0.262_700_212_011_267_1, 0.677_998_071_518_870_8, 0.059_301_716_469_861_96],
  [0, 0.028_072_693_049_087_428, 1.060_985_057_710_791],
];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseHexColor(value: string): RgbaColor | undefined {
  const match = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (!match) return undefined;
  const hex = match[1];
  if (!hex) return undefined;
  if (hex.length === 3 || hex.length === 4) {
    return {
      red: Number.parseInt(`${hex.charAt(0)}${hex.charAt(0)}`, 16),
      green: Number.parseInt(`${hex.charAt(1)}${hex.charAt(1)}`, 16),
      blue: Number.parseInt(`${hex.charAt(2)}${hex.charAt(2)}`, 16),
      alpha: hex.length === 4 ? Number.parseInt(`${hex.charAt(3)}${hex.charAt(3)}`, 16) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  return undefined;
}

function parseRgbChannel(value: string): number | undefined {
  if (value.toLowerCase() === "none") return 0;
  const percent = SAFE_PERCENT.exec(value);
  if (percent) return clamp((Number(percent[1] ?? 0) / 100) * 255, 0, 255);
  if (!SAFE_NUMBER.test(value)) return undefined;
  return clamp(Number(value), 0, 255);
}

function parseAlpha(value: string | undefined): number | undefined {
  if (value === undefined) return 1;
  if (value.toLowerCase() === "none") return 0;
  const percent = SAFE_PERCENT.exec(value);
  if (percent) return clamp(Number(percent[1] ?? 0) / 100, 0, 1);
  if (!SAFE_NUMBER.test(value)) return undefined;
  return clamp(Number(value), 0, 1);
}

function splitFunctionComponents(
  body: string,
): { channels: string[]; alpha: string | undefined } | undefined {
  const slashParts = body.trim().split("/");
  if (slashParts.length > 2) return undefined;
  const channels = (slashParts[0] ?? "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const alphaParts = (slashParts[1] ?? "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length === 2 && alphaParts.length !== 1) return undefined;
  return { channels, alpha: alphaParts[0] };
}

function parseRgbColor(value: string): RgbaColor | undefined {
  const match = /^rgba?\((.*)\)$/i.exec(value);
  if (!match) return undefined;
  const body = match[1];
  if (!body) return undefined;
  const components = splitFunctionComponents(body);
  if (!components) return undefined;
  const channels = [...components.channels];
  const alphaValue = components.alpha ?? (channels.length === 4 ? channels.pop() : undefined);
  if (channels.length !== 3) return undefined;
  const [red, green, blue] = channels.slice(0, 3).map(parseRgbChannel);
  const alpha = parseAlpha(alphaValue);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    return undefined;
  }
  return { red, green, blue, alpha };
}

function hueToRgb(p: number, q: number, hue: number): number {
  let normalized = hue;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function parseHue(value: string): number | undefined {
  if (value.toLowerCase() === "none") return 0;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|grad|rad|turn)?$/i.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === "grad") return amount * 0.9;
  if (unit === "rad") return (amount * 180) / Math.PI;
  if (unit === "turn") return amount * 360;
  return amount;
}

function parseHslColor(value: string): RgbaColor | undefined {
  const match = /^hsla?\((.*)\)$/i.exec(value);
  if (!match) return undefined;
  const body = match[1];
  if (!body) return undefined;
  const components = splitFunctionComponents(body);
  if (!components) return undefined;
  const channels = [...components.channels];
  const alphaValue = components.alpha ?? (channels.length === 4 ? channels.pop() : undefined);
  if (channels.length !== 3) return undefined;
  const [rawHue, rawSaturation, rawLightness] = channels;
  if (!rawHue || !rawSaturation || !rawLightness) return undefined;
  const hueDegrees = parseHue(rawHue);
  const saturation = SAFE_PERCENT.exec(rawSaturation);
  const lightness = SAFE_PERCENT.exec(rawLightness);
  const alpha = parseAlpha(alphaValue);
  if (hueDegrees === undefined || !saturation || !lightness || alpha === undefined) {
    return undefined;
  }

  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  const sat = Math.max(0, Math.min(1, Number(saturation[1] ?? 0) / 100));
  const light = Math.max(0, Math.min(1, Number(lightness[1] ?? 0) / 100));
  if (sat === 0) {
    const gray = clampByte(light * 255);
    return { red: gray, green: gray, blue: gray, alpha };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return {
    red: clampByte(hueToRgb(p, q, hue + 1 / 3) * 255),
    green: clampByte(hueToRgb(p, q, hue) * 255),
    blue: clampByte(hueToRgb(p, q, hue - 1 / 3) * 255),
    alpha,
  };
}

function parseUnitChannel(value: string, percentageScale = 1): number | undefined {
  if (value.toLowerCase() === "none") return 0;
  const percent = SAFE_PERCENT.exec(value);
  if (percent) return (Number(percent[1] ?? 0) / 100) * percentageScale;
  if (!SAFE_NUMBER.test(value)) return undefined;
  return Number(value);
}

function multiplyMatrix(matrix: ColorMatrix, vector: ColorVector): ColorVector {
  const product = (row: ColorVector) =>
    row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2];
  return [product(matrix[0]), product(matrix[1]), product(matrix[2])];
}

function mapVector(vector: ColorVector, transform: (value: number) => number): ColorVector {
  return [transform(vector[0]), transform(vector[1]), transform(vector[2])];
}

function decodeSrgb(value: number): number {
  const sign = Math.sign(value);
  const absolute = Math.abs(value);
  return sign * (absolute <= 0.04045 ? absolute / 12.92 : ((absolute + 0.055) / 1.055) ** 2.4);
}

function encodeSrgb(value: number): number {
  const sign = Math.sign(value);
  const absolute = Math.abs(value);
  return (
    sign * (absolute <= 0.003_130_8 ? 12.92 * absolute : 1.055 * absolute ** (1 / 2.4) - 0.055)
  );
}

function linearSrgbToColor(channels: ColorVector, alpha: number): RgbaColor {
  const [red, green, blue] = channels.map((channel) => clamp(encodeSrgb(channel), 0, 1) * 255);
  return { red: red ?? 0, green: green ?? 0, blue: blue ?? 0, alpha };
}

function xyzD65ToColor(xyz: ColorVector, alpha: number): RgbaColor {
  return linearSrgbToColor(multiplyMatrix(XYZ_D65_TO_LINEAR_SRGB, xyz), alpha);
}

function parseOklchColor(value: string): RgbaColor | undefined {
  const match = /^oklch\((.*)\)$/i.exec(value);
  if (!match?.[1]) return undefined;
  const components = splitFunctionComponents(match[1]);
  if (!components) return undefined;
  if (components.channels.length !== 3) return undefined;
  const [rawLightness, rawChroma, rawHue] = components.channels;
  if (!rawLightness || !rawChroma || !rawHue) return undefined;
  const lightness = parseUnitChannel(rawLightness);
  const chroma = parseUnitChannel(rawChroma, 0.4);
  const hue = parseHue(rawHue);
  const alpha = parseAlpha(components.alpha);
  if (lightness === undefined || chroma === undefined || hue === undefined || alpha === undefined) {
    return undefined;
  }

  const normalizedLightness = clamp(lightness, 0, 1);
  const normalizedChroma = Math.max(0, chroma);
  const hueRadians = (hue * Math.PI) / 180;
  const a = normalizedChroma * Math.cos(hueRadians);
  const b = normalizedChroma * Math.sin(hueRadians);
  const lRoot = normalizedLightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const mRoot = normalizedLightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const sRoot = normalizedLightness - 0.089_484_177_5 * a - 1.291_485_548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return linearSrgbToColor(
    [
      4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
      -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
      -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
    ],
    alpha,
  );
}

function decodeA98(value: number): number {
  return Math.sign(value) * Math.abs(value) ** (563 / 256);
}

function decodeProPhoto(value: number): number {
  const absolute = Math.abs(value);
  return Math.sign(value) * (absolute <= 16 / 512 ? absolute / 16 : absolute ** 1.8);
}

function decodeRec2020(value: number): number {
  const absolute = Math.abs(value);
  const alpha = 1.099_296_826_809_44;
  const beta = 0.018_053_968_510_807;
  return (
    Math.sign(value) *
    (absolute < beta * 4.5 ? absolute / 4.5 : ((absolute + alpha - 1) / alpha) ** (1 / 0.45))
  );
}

function colorProfileToXyzD65(profile: string, channels: ColorVector): ColorVector | undefined {
  if (profile === "display-p3") {
    return multiplyMatrix(LINEAR_DISPLAY_P3_TO_XYZ_D65, mapVector(channels, decodeSrgb));
  }
  if (profile === "a98-rgb") {
    return multiplyMatrix(LINEAR_A98_TO_XYZ_D65, mapVector(channels, decodeA98));
  }
  if (profile === "prophoto-rgb") {
    const xyzD50 = multiplyMatrix(LINEAR_PROPHOTO_TO_XYZ_D50, mapVector(channels, decodeProPhoto));
    return multiplyMatrix(XYZ_D50_TO_D65, xyzD50);
  }
  if (profile === "rec2020") {
    return multiplyMatrix(LINEAR_REC2020_TO_XYZ_D65, mapVector(channels, decodeRec2020));
  }
  if (profile === "xyz" || profile === "xyz-d65") return channels;
  if (profile === "xyz-d50") return multiplyMatrix(XYZ_D50_TO_D65, channels);
  return undefined;
}

function parseColorFunction(value: string): RgbaColor | undefined {
  const match = /^color\((.*)\)$/i.exec(value);
  if (!match?.[1]) return undefined;
  const components = splitFunctionComponents(match[1]);
  if (!components) return undefined;
  if (components.channels.length !== 4) return undefined;
  const [rawProfile, ...rawChannels] = components.channels;
  if (!rawProfile) return undefined;
  const [rawRed, rawGreen, rawBlue] = rawChannels;
  if (!rawRed || !rawGreen || !rawBlue) return undefined;
  const red = parseUnitChannel(rawRed);
  const green = parseUnitChannel(rawGreen);
  const blue = parseUnitChannel(rawBlue);
  const alpha = parseAlpha(components.alpha);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    return undefined;
  }
  const channels: ColorVector = [red, green, blue];
  const profile = rawProfile.toLowerCase();
  if (profile === "srgb") {
    const [red, green, blue] = channels.map((channel) => clamp(channel, 0, 1) * 255);
    return { red: red ?? 0, green: green ?? 0, blue: blue ?? 0, alpha };
  }
  if (profile === "srgb-linear") return linearSrgbToColor(channels, alpha);
  const xyz = colorProfileToXyzD65(profile, channels);
  return xyz ? xyzD65ToColor(xyz, alpha) : undefined;
}

function parseColor(value: string): RgbaColor | undefined {
  return (
    parseHexColor(value) ??
    parseRgbColor(value) ??
    parseHslColor(value) ??
    parseOklchColor(value) ??
    parseColorFunction(value)
  );
}

function composite(foreground: RgbaColor, background: RgbColor): RgbColor {
  return {
    red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
    green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
    blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
  };
}

function color(value: string | undefined, fallback: string, backdrop?: RgbColor): RgbColor {
  const opaqueBlack = { red: 0, green: 0, blue: 0 };
  const fallbackColor = parseHexColor(fallback) ?? { ...opaqueBlack, alpha: 1 };
  const fallbackRgb = composite(fallbackColor, opaqueBlack);
  if (!value || DANGEROUS_COLOR_CONTENT.test(value)) return fallbackRgb;
  const parsed = parseColor(value.trim()) ?? fallbackColor;
  return composite(parsed, backdrop ?? fallbackRgb);
}

function toHex({ red, green, blue }: RgbColor): string {
  return `#${[red, green, blue]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Returns a six-digit sRGB preview for the native color input without changing the saved token. */
export function themeColorPreview(value: string): string | undefined {
  if (DANGEROUS_COLOR_CONTENT.test(value)) return undefined;
  const parsed = parseColor(value.trim());
  if (!parsed) return undefined;
  return toHex(composite(parsed, { red: 255, green: 255, blue: 255 }));
}

function quantizeColor({ red, green, blue }: RgbColor): RgbColor {
  return { red: clampByte(red), green: clampByte(green), blue: clampByte(blue) };
}

function mix(first: RgbColor, second: RgbColor, secondWeight: number): RgbColor {
  const weight = Math.max(0, Math.min(1, secondWeight));
  return {
    red: first.red * (1 - weight) + second.red * weight,
    green: first.green * (1 - weight) + second.green * weight,
    blue: first.blue * (1 - weight) + second.blue * weight,
  };
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(value: RgbColor): number {
  return (
    0.2126 * linearChannel(value.red) +
    0.7152 * linearChannel(value.green) +
    0.0722 * linearChannel(value.blue)
  );
}

function contrast(first: RgbColor, second: RgbColor): number {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function minimumContrast(foreground: RgbColor, backgrounds: readonly RgbColor[]): number {
  return Math.min(...backgrounds.map((background) => contrast(foreground, background)));
}

function bestContrastForeground(backgrounds: readonly RgbColor[]): RgbColor {
  const black = { red: 0, green: 0, blue: 0 };
  const white = { red: 255, green: 255, blue: 255 };
  return minimumContrast(black, backgrounds) >= minimumContrast(white, backgrounds) ? black : white;
}

function ensureContrast(
  candidate: RgbColor,
  backgrounds: readonly RgbColor[],
  minimum: number,
  resolved: ResolvedAppearance,
): RgbColor {
  const opaqueCandidate = quantizeColor(candidate);
  const opaqueBackgrounds = backgrounds.map(quantizeColor);
  if (minimumContrast(opaqueCandidate, opaqueBackgrounds) >= minimum) return opaqueCandidate;
  const target = quantizeColor(color(resolved === "light" ? "#000000" : "#ffffff", "#000000"));
  for (let step = 1; step <= 100; step += 1) {
    const adjusted = quantizeColor(mix(candidate, target, step / 100));
    if (minimumContrast(adjusted, opaqueBackgrounds) >= minimum) return adjusted;
  }
  return target;
}

function ensureLightBackground(candidate: RgbColor): RgbColor {
  const opaqueCandidate = quantizeColor(candidate);
  if (luminance(opaqueCandidate) >= 0.72) return opaqueCandidate;
  const white = color("#ffffff", "#ffffff");
  for (let step = 1; step <= 100; step += 1) {
    const adjusted = quantizeColor(mix(candidate, white, step / 100));
    if (luminance(adjusted) >= 0.72) return adjusted;
  }
  return white;
}

function ensureDarkBackground(candidate: RgbColor): RgbColor {
  const opaqueCandidate = quantizeColor(candidate);
  if (luminance(opaqueCandidate) <= 0.12) return opaqueCandidate;
  const black = color("#000000", "#000000");
  for (let step = 1; step <= 100; step += 1) {
    const adjusted = quantizeColor(mix(candidate, black, step / 100));
    if (luminance(adjusted) <= 0.12) return adjusted;
  }
  return black;
}

function safeTheme(theme: Theme): Theme {
  const unsafeTokens = (theme as Partial<Theme>).tokens as Partial<ThemeTokens> | undefined;
  const finiteDensity = Number.isFinite(unsafeTokens?.density) ? unsafeTokens?.density : 1;
  return sanitizeTheme({
    ...theme,
    tokens: {
      accent:
        typeof unsafeTokens?.accent === "string" ? unsafeTokens.accent : COLOR_FALLBACKS.accent,
      accent2:
        typeof unsafeTokens?.accent2 === "string" ? unsafeTokens.accent2 : COLOR_FALLBACKS.accent2,
      background:
        typeof unsafeTokens?.background === "string"
          ? unsafeTokens.background
          : COLOR_FALLBACKS.darkBackground,
      surface:
        typeof unsafeTokens?.surface === "string"
          ? unsafeTokens.surface
          : COLOR_FALLBACKS.darkSurface,
      surfaceStrong:
        typeof unsafeTokens?.surfaceStrong === "string"
          ? unsafeTokens.surfaceStrong
          : COLOR_FALLBACKS.darkSurfaceStrong,
      text: typeof unsafeTokens?.text === "string" ? unsafeTokens.text : COLOR_FALLBACKS.darkText,
      muted:
        typeof unsafeTokens?.muted === "string" ? unsafeTokens.muted : COLOR_FALLBACKS.darkMuted,
      radius: typeof unsafeTokens?.radius === "string" ? unsafeTokens.radius : "22px",
      density: finiteDensity,
      headingFont:
        unsafeTokens?.headingFont === "serif" || unsafeTokens?.headingFont === "sans"
          ? unsafeTokens.headingFont
          : undefined,
      bodyFont:
        unsafeTokens?.bodyFont === "serif" || unsafeTokens?.bodyFont === "sans"
          ? unsafeTokens.bodyFont
          : undefined,
    },
    style: theme.style,
  } as Theme);
}

function radiusScale(radius: string, scale: number): string {
  const match = /^(\d+(?:\.\d+)?)(px|rem|em|%)$/.exec(radius);
  if (!match) return radius;
  const [, number, unit] = match;
  if (!number || !unit) return radius;
  const value = Number(number) * scale;
  const rounded = Number(value.toFixed(3));
  return `${rounded}${unit}`;
}

function densityName(density: number): AppearanceDensity {
  if (density <= 0.92) return "compact";
  if (density >= 1.12) return "spacious";
  return "comfortable";
}

function safeStyle(theme: Theme): ThemeStyleTokens {
  const style = theme.style;
  return {
    surface: !style || style.surface === "glass" ? "glass" : "solid",
    elevation: style?.elevation === "flat" ? "flat" : "soft",
    ornament:
      style?.ornament === "ink-wash" || style?.ornament === "porcelain-line"
        ? style.ornament
        : "none",
  };
}

export function themeFontStack(
  kind: ThemeTokens["headingFont"] | ThemeTokens["bodyFont"],
  fallbackKind: keyof typeof THEME_FONT_STACKS = "serif",
): string {
  return THEME_FONT_STACKS[kind === "serif" || kind === "sans" ? kind : fallbackKind];
}

export function storedAppearance(storage: Pick<Storage, "getItem"> = localStorage): AppearanceMode {
  const value = storage.getItem(APPEARANCE_STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function normalizedInterfaceStyle(value: unknown): InterfaceStyle {
  return value === "garden" || value === "studio" ? value : DEFAULT_INTERFACE_STYLE;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function storedInterfaceStyle(storage?: Pick<Storage, "getItem">): InterfaceStyle {
  try {
    return normalizedInterfaceStyle(
      (storage ?? browserStorage())?.getItem(INTERFACE_STYLE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_INTERFACE_STYLE;
  }
}

export function persistInterfaceStyle(
  value: InterfaceStyle,
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    const target = storage ?? browserStorage();
    if (!target) return false;
    target.setItem(INTERFACE_STYLE_STORAGE_KEY, normalizedInterfaceStyle(value));
    return true;
  } catch {
    return false;
  }
}

export function applyInterfaceStyle(value: InterfaceStyle, target?: HTMLElement): InterfaceStyle {
  const next = normalizedInterfaceStyle(value);
  const root = target ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (root) root.dataset.interfaceStyle = next;
  return next;
}

export function initializeInterfaceStyle(
  storage?: Pick<Storage, "getItem">,
  target?: HTMLElement,
): InterfaceStyle {
  return applyInterfaceStyle(storedInterfaceStyle(storage), target);
}

export function resolveAppearance(mode: AppearanceMode, systemDark: boolean): ResolvedAppearance {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}

export function nextAppearance(mode: AppearanceMode): AppearanceMode {
  if (mode === "system") return "light";
  if (mode === "light") return "dark";
  return "system";
}

function printPaletteFromSafeTheme(theme: Theme | undefined): Readonly<PrintPalette> {
  const paper = ensureLightBackground(color(theme?.print?.paper, COLOR_FALLBACKS.paper));
  const text = ensureContrast(
    color(theme?.print?.text, COLOR_FALLBACKS.printText, paper),
    [paper],
    7,
    "light",
  );
  const accent = ensureContrast(
    color(theme?.print?.accent ?? theme?.tokens.accent, COLOR_FALLBACKS.printAccent, paper),
    [paper],
    4.5,
    "light",
  );
  const muted = ensureContrast(mix(paper, text, 0.72), [paper], 7, "light");
  return { accent: toHex(accent), muted: toHex(muted), paper: toHex(paper), text: toHex(text) };
}

/** Returns inert, opaque sRGB print colors with WCAG-safe text and accent contrast. */
export function derivePrintPalette(theme: Theme | undefined): Readonly<PrintPalette> {
  return printPaletteFromSafeTheme(theme ? safeTheme(theme) : undefined);
}

export function deriveAppearance(
  theme: Theme,
  mode: AppearanceMode,
  systemDark: boolean,
): DerivedAppearance {
  const safe = safeTheme(theme);
  const resolved = resolveAppearance(mode, systemDark);
  const printPalette = printPaletteFromSafeTheme(safe);
  const paper = color(printPalette.paper, COLOR_FALLBACKS.paper);
  const darkBackgroundSeed = color(safe.tokens.background, COLOR_FALLBACKS.darkBackground);
  const surfaceSeed = color(safe.tokens.surface, COLOR_FALLBACKS.darkSurface);
  const strongSeed = color(
    safe.tokens.surfaceStrong ?? safe.tokens.surface,
    COLOR_FALLBACKS.darkSurfaceStrong,
  );

  const background =
    resolved === "dark"
      ? ensureDarkBackground(darkBackgroundSeed)
      : ensureLightBackground(mix(paper, darkBackgroundSeed, 0.08));
  const surface =
    resolved === "dark"
      ? ensureDarkBackground(surfaceSeed)
      : ensureLightBackground(mix(paper, surfaceSeed, 0.035));
  const surfaceStrong =
    resolved === "dark"
      ? ensureDarkBackground(strongSeed)
      : ensureLightBackground(mix(paper, strongSeed, 0.12));
  const surfaces = [background, surface, surfaceStrong] as const;
  const text = ensureContrast(
    color(
      resolved === "light" ? safe.print?.text : safe.tokens.text,
      resolved === "light" ? COLOR_FALLBACKS.printText : COLOR_FALLBACKS.darkText,
    ),
    surfaces,
    7,
    resolved,
  );
  const muted = ensureContrast(
    color(safe.tokens.muted, COLOR_FALLBACKS.darkMuted),
    surfaces,
    7,
    resolved,
  );
  const accent = ensureContrast(
    color(safe.tokens.accent, COLOR_FALLBACKS.accent),
    surfaces,
    4.5,
    resolved,
  );
  const accent2 = ensureContrast(
    color(safe.tokens.accent2 ?? safe.tokens.accent, COLOR_FALLBACKS.accent2),
    surfaces,
    4.5,
    resolved,
  );
  const onAccent = bestContrastForeground([accent, accent2]);
  const accentSoft = mix(surface, accent, resolved === "dark" ? 0.22 : 0.12);
  const density = Number.isFinite(safe.tokens.density) ? (safe.tokens.density ?? 1) : 1;
  const style = safeStyle(safe);

  return {
    resolved,
    variables: {
      "--lb-accent": toHex(accent),
      "--lb-accent-2": toHex(accent2),
      "--lb-on-accent": toHex(onAccent),
      "--lb-accent-soft": toHex(accentSoft),
      "--lb-background": toHex(background),
      "--lb-surface": toHex(surface),
      "--lb-surface-strong": toHex(surfaceStrong),
      "--lb-text": toHex(text),
      "--lb-muted": toHex(muted),
      "--lb-radius": safe.tokens.radius,
      "--lb-radius-sm": radiusScale(safe.tokens.radius, 0.55),
      "--lb-radius-md": safe.tokens.radius,
      "--lb-radius-lg": radiusScale(safe.tokens.radius, 1.35),
      "--lb-density": String(density),
      "--lb-heading-font": themeFontStack(safe.tokens.headingFont, "serif"),
      "--lb-body-font": themeFontStack(safe.tokens.bodyFont, "sans"),
      "--print-accent": printPalette.accent,
      "--print-muted": printPalette.muted,
      "--print-paper": printPalette.paper,
      "--print-text": printPalette.text,
    },
    dataset: {
      appearance: mode,
      resolvedAppearance: resolved,
      density: densityName(density),
      themeSurface: style.surface,
      themeElevation: style.elevation,
      themeOrnament: style.ornament,
    },
  };
}

export function applyAppearance(
  theme: Theme,
  mode: AppearanceMode,
  systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
  target: HTMLElement = document.documentElement,
): ResolvedAppearance {
  const appearance = deriveAppearance(theme, mode, systemDark);
  for (const [key, value] of Object.entries(appearance.variables)) {
    target.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(appearance.dataset)) {
    target.dataset[key] = value;
  }
  target.style.colorScheme = appearance.resolved;

  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.content = appearance.variables["--lb-background"] ?? COLOR_FALLBACKS.darkBackground;
  }

  return appearance.resolved;
}
