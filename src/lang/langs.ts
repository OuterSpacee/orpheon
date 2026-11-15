/** The languages, by their codes. */
import { english } from "./en.ts";
import { spanish } from "./es.ts";
import { italian } from "./it.ts";
import { ipa } from "./ipa.ts";
import { japanese } from "./ja.ts";
import { latin } from "./la.ts";
import type { Language } from "./language.ts";

export type Lang = "en" | "es" | "it" | "ja" | "la" | "ipa";

export const LANGS: Record<Lang, Language> = { en: english, es: spanish, it: italian, ja: japanese, la: latin, ipa };
