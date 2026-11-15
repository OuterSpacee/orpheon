// Published formant measurements: what the vowels are fitted to and tested against.
//
// H95  Hillenbrand, Getty, Clark & Wheeler (1995), "Acoustic characteristics of American English
//      vowels", J. Acoust. Soc. Am. 97: averages over 45 men, 48 women and 46 children (ages
//      10 to 12) saying heed, hid, hayed, head, had, hod, hawed, hoed, hood, who'd, hud, heard.
// PB52 Peterson & Barney (1952), "Control methods used in a study of the vowels", J. Acoust.
//      Soc. Am. 24: averages over 33 men, 28 women and 15 children.
//
// Each row is [F1, F2, F3] in Hz for a man, a woman and a child.
import type { Body, PhoneSymbol } from "../../src/contract.ts";

export type Trio = [number, number, number];
export interface Measured {
  man: Trio;
  woman: Trio;
  child: Trio;
  source: string;
}

const H95: Record<string, Measured> = {
  heed: { man: [342, 2322, 3000], woman: [437, 2761, 3372], child: [452, 3081, 3702], source: "H95 heed" },
  hid: { man: [427, 2034, 2684], woman: [483, 2365, 3053], child: [511, 2552, 3403], source: "H95 hid" },
  hayed: { man: [476, 2089, 2691], woman: [536, 2530, 3047], child: [564, 2656, 3323], source: "H95 hayed" },
  head: { man: [580, 1799, 2605], woman: [731, 2058, 2979], child: [749, 2267, 3310], source: "H95 head" },
  had: { man: [588, 1952, 2601], woman: [669, 2349, 2972], child: [717, 2501, 3289], source: "H95 had" },
  hod: { man: [768, 1333, 2522], woman: [936, 1551, 2815], child: [1002, 1688, 2950], source: "H95 hod" },
  hawed: { man: [652, 997, 2538], woman: [781, 1136, 2824], child: [803, 1210, 2982], source: "H95 hawed" },
  hoed: { man: [497, 910, 2459], woman: [555, 1035, 2828], child: [597, 1137, 2987], source: "H95 hoed" },
  hood: { man: [469, 1122, 2434], woman: [519, 1225, 2827], child: [568, 1490, 3072], source: "H95 hood" },
  whod: { man: [378, 997, 2343], woman: [459, 1105, 2735], child: [494, 1345, 2988], source: "H95 who'd" },
  hud: { man: [623, 1200, 2550], woman: [753, 1426, 2933], child: [749, 1546, 3145], source: "H95 hud" },
  heard: { man: [474, 1379, 1710], woman: [523, 1588, 1929], child: [586, 1719, 2143], source: "H95 heard" },
};

const PB52: Record<string, Measured> = {
  heed: { man: [270, 2290, 3010], woman: [310, 2790, 3310], child: [370, 3200, 3730], source: "PB52 heed" },
  hid: { man: [390, 1990, 2550], woman: [430, 2480, 3070], child: [530, 2730, 3600], source: "PB52 hid" },
  head: { man: [530, 1840, 2480], woman: [610, 2330, 2990], child: [690, 2610, 3570], source: "PB52 head" },
  had: { man: [660, 1720, 2410], woman: [860, 2050, 2850], child: [1010, 2320, 3320], source: "PB52 had" },
  hod: { man: [730, 1090, 2440], woman: [850, 1220, 2810], child: [1030, 1370, 3170], source: "PB52 hod" },
  hawed: { man: [570, 840, 2410], woman: [590, 920, 2710], child: [680, 1060, 3180], source: "PB52 hawed" },
  hood: { man: [440, 1020, 2240], woman: [470, 1160, 2680], child: [560, 1410, 3310], source: "PB52 hood" },
  whod: { man: [300, 870, 2240], woman: [370, 950, 2670], child: [430, 1170, 3260], source: "PB52 who'd" },
  hud: { man: [640, 1190, 2390], woman: [760, 1400, 2780], child: [850, 1590, 3360], source: "PB52 hud" },
  heard: { man: [490, 1350, 1690], woman: [500, 1640, 1960], child: [560, 1820, 2160], source: "PB52 heard" },
};

/** Average ratio of the women's and children's formants to the men's over the twelve H95 vowels. */
function ratio(who: "woman" | "child", formant: number): number {
  const rows = Object.values(H95);
  return Math.exp(rows.reduce((sum, r) => sum + Math.log(r[who][formant] / r.man[formant]), 0) / rows.length);
}

/**
 * A vowel neither paper measured (English lacks it): a representative man's formants from the
 * phonetics literature (the cardinal vowel values in Catford 1988; front rounded vowels sit by
 * their unrounded partners with F2 and F3 pulled down by the lips, Stevens 1998), scaled to a
 * woman and a child by the average H95 ratios. These are stand-ins, not measurements of a
 * population.
 */
function derived(man: Trio): Measured {
  const scale = (who: "woman" | "child") => man.map((hz, i) => Math.round(hz * ratio(who, i))) as Trio;
  return { man, woman: scale("woman"), child: scale("child"), source: "derived" };
}

/**
 * The target for each vowel in PHONES. Where both papers measured a vowel the choice is noted:
 * H95 by default; PB52 where H95's Michigan speakers had moved away from the vowel the IPA
 * symbol names (their "had" was raised almost to "head", their "hod" fronted, their "who'd"
 * fronted).
 */
export const VOWEL_TARGETS: Partial<Record<PhoneSymbol, Measured>> = {
  i: H95.heed,
  ɪ: H95.hid,
  e: H95.hayed,
  ɛ: H95.head,
  æ: PB52.had,
  a: H95.hod,
  ɑ: PB52.hod,
  ɒ: H95.hawed,
  ɔ: PB52.hawed,
  o: H95.hoed,
  ʊ: H95.hood,
  u: PB52.whod,
  ʌ: H95.hud,
  ɚ: H95.heard,
  y: derived([280, 1850, 2250]),
  ø: derived([400, 1600, 2300]),
  œ: derived([550, 1500, 2400]),
  ɨ: derived([320, 1550, 2450]),
  ɯ: derived([330, 1300, 2400]),
  ə: derived([500, 1500, 2500]),
  ɜ: derived([560, 1450, 2500]),
};

/**
 * The three bodies the vowels are fitted for. The tract lengths are the ones whose neutral tube
 * has the average third formant of each H95 group; BODIES in the contract are singers, not
 * these averages.
 */
export const FIT_BODIES: Record<"man" | "woman" | "child", Body> = {
  man: { tract: 17.0, folds: 0.85 },
  woman: { tract: 14.6, folds: 0.35 },
  child: { tract: 13.3, folds: 0.1 },
};
