import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

// Display face for signs, page titles and large numbers. latin-ext carries the
// dotless i used by the wordmark.
export const displayFont = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--kb-font-display",
  display: "swap",
});

export const sansFont = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--kb-font-sans",
  display: "swap",
});

export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--kb-font-mono",
  display: "swap",
});
