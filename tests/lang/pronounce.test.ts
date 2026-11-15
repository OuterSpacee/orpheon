/**
 * Text to phones, per language: word lists with the syllables and stress each should come out
 * with (as IPA from transcribe(): dots between syllables, ˈ and ˌ before stressed ones, ː for
 * length), including the awkward cases each set of rules has to get right.
 */
import { describe, expect, test } from "bun:test";
import { statSync, readFileSync } from "node:fs";
import { PHONES } from "../../src/contract.ts";
import { Dictionary, derive, packDictionary, unpackDictionary } from "../../src/lang/en-dict.ts";
import { letterToSound } from "../../src/lang/en-rules.ts";
import { arpaToSyllables } from "../../src/lang/en.ts";
import { type Lang, ready, transcribe, words } from "../../src/lang/index.ts";

await ready("en");

/** each [text, IPA] pair, sung style (no speech reductions) unless said */
function table(lang: Lang, pairs: [string, string][], style: "song" | "speech" = "song") {
  for (const [text, ipa] of pairs) test(`${text} → ${ipa}`, () => expect(transcribe(text, lang, style)).toBe(ipa));
}

describe("English: the dictionary", () => {
  table("en", [
    ["cat", "ˈkæt"],
    ["water", "ˈwɔ.tɚ"],
    ["singing", "ˈsɪŋ.ɪŋ"],
    ["string", "ˈstɹɪŋ"],
    ["extra", "ˈɛk.stɹə"],
    ["beautiful", "ˈbju.tə.fəl"],
    ["music", "ˈmju.zɪk"],
    ["choir", "ˈkwaɪ.ɚ"],
    ["hour", "ˈaʊ.ɚ"],
    ["thought", "ˈθɔt"],
    ["judge", "ˈdʒʌdʒ"],
    ["measure", "ˈmɛ.ʒɚ"],
    ["though", "ˈðoʊ"],
    ["one", "ˈwʌn"],
    ["colonel", "ˈkɚ.nəl"],
    ["iron", "ˈaɪ.ɚn"],
    ["queue", "ˈkju"],
    ["psychology", "saɪ.ˈkɑ.lə.dʒi"],
    ["knight", "ˈnaɪt"],
    ["rhythm", "ˈɹɪ.ðəm"],
    ["o'clock", "ə.ˈklɑk"],
    ["don't", "ˈdoʊnt"],
    ["hello", "hə.ˈloʊ"],
    ["world", "ˈwɚld"],
    ["people", "ˈpi.pəl"],
    ["button", "ˈbʌ.tən"],
    ["naïve", "ˌnaɪ.ˈiv"],
    // the reading of a word spelt two ways is the common one
    ["read", "ˈɹid"],
    ["live", "ˈlɪv"],
    ["wind", "ˈwɪnd"],
    // made from a shorter word and a regular ending (not stored in the file)
    ["walked", "ˈwɔkt"],
    ["wanted", "ˈwɔn.tɪd"],
    ["dancing", "ˈdæn.sɪŋ"],
    // the consonants between two vowels start the second syllable where English allows it
    ["quickly", "ˈkwɪ.kli"],
  ]);
});

describe("English: speech", () => {
  table(
    "en",
    [
      // the American flap, only before an unstressed vowel
      ["water city better", "ˈwɔ.ɾɚ ˈsɪ.ɾi ˈbɛ.ɾɚ"],
      ["attack", "ə.ˈtæk"],
      // function words in their weak forms, never stressed; "the" before a vowel
      ["I want to go to the store and get a cup of tea", "aɪ ˈwɑnt tə ˈgoʊ tə ðə ˈstɔɹ ənd ˈgɛt ə ˈkʌp əv ˈti"],
      ["the apple", "ði ˈæ.pəl"],
      // punctuation is a pause; an abbreviation's dot is not
      ["Hi! The end.", "ˈhaɪ | ði ˈɛnd |"],
      ["Dr. Who", "ˈdɑk.tɚ hu"],
      ["e.g. this", "fɚ ɪg.ˈzæm.pəl ˈðɪs"],
      ["the U.S.A.", "ðə ˌju.ˌɛs.ˈeɪ |"],
      ["XYZ", "ˌɛks.ˌwaɪ.ˈzi"],
      ["well-known", "ˈwɛl ˈnoʊn"],
    ],
    "speech",
  );
});

describe("English: numbers and symbols", () => {
  const said = (text: string) =>
    words(text, "en", "speech")
      .map((t) => (t.kind === "word" ? t.word.text : "|"))
      .join(" ");
  const cases: [string, string][] = [
    ["7", "seven"],
    ["42", "forty two"],
    ["1,234", "one thousand two hundred thirty four"],
    ["1000000", "one million"],
    ["1999", "nineteen ninety nine"],
    ["1905", "nineteen oh five"],
    ["2005", "two thousand five"],
    ["2024", "twenty twenty four"],
    ["3.14", "three point one four"],
    ["21st", "twenty first"],
    ["12th", "twelfth"],
    ["-5", "minus five"],
    ["5-10", "five to ten"],
    ["$1", "one dollar"],
    ["$20", "twenty dollars"],
    ["100%", "one hundred percent"],
    ["rock & roll", "rock and roll"],
    ["3 km", "three kilometers"],
  ];
  for (const [text, expected] of cases) test(`${text} → ${expected}`, () => expect(said(text)).toBe(expected));
});

describe("English: letter-to-sound rules for words the dictionary lacks", () => {
  const lts = (w: string) =>
    arpaToSyllables(letterToSound(w))
      .map((s) => (s.stress === 1 ? "ˈ" : "") + [...s.onset, ...s.nucleus, ...s.coda].map((g) => g.ph).join(""))
      .join(".");
  const cases: [string, string][] = [
    ["blorf", "ˈblɔɹf"],
    ["snibbet", "ˈsnɪ.bət"],
    ["flimbo", "ˈflɪm.boʊ"],
    ["zantor", "ˈzæn.tɚ"],
    ["plake", "ˈpleɪk"],
    ["gromish", "ˈgɹɑ.mɪʃ"],
    ["spleet", "ˈsplit"],
    ["thrank", "ˈθɹæŋk"],
    ["nation", "ˈneɪ.ʃən"],
    ["kight", "ˈkaɪt"],
    ["phlunt", "ˈflʌnt"],
    ["chadwicks", "ˈtʃæ.dwɪks"],
    ["quome", "ˈkwoʊm"],
    ["unblick", "ən.ˈblɪk"],
  ];
  for (const [w, ipa] of cases) test(`${w} → ${ipa}`, () => expect(lts(w)).toBe(ipa));

  test("a word missing from the dictionary still gets sounds, stress and syllables", () => {
    const [t] = words("Xylotrombulator", "en");
    expect(t.kind).toBe("word");
    if (t.kind !== "word") return;
    expect(t.word.syls.length).toBeGreaterThanOrEqual(4);
    expect(t.word.syls.filter((s) => s.stress === 1)).toHaveLength(1);
  });
});

describe("English: the shipped dictionary", () => {
  test("is under 1.5 MB, with the CMU license beside it", () => {
    expect(statSync("public/lang/en-dict.txt").size).toBeLessThan(1.5 * 1024 * 1024);
    expect(readFileSync("public/lang/cmudict-LICENSE.txt", "utf8")).toContain("Carnegie Mellon University");
  });

  test("packs and unpacks, and makes regular forms from their base word", () => {
    const entries: [string, string[]][] = [
      ["dog", ["D", "AO1", "G"]],
      ["dogged", ["D", "AO1", "G", "IH0", "D"]],
      ["kiss", ["K", "IH1", "S"]],
    ];
    const back = unpackDictionary(packDictionary(entries));
    expect([...back.entries()]).toEqual(entries);
    const d = new Dictionary(back);
    expect(d.lookup("dogs")).toEqual(["D", "AO1", "G", "Z"]);
    expect(d.lookup("kisses")).toEqual(["K", "IH1", "S", "IH0", "Z"]);
    expect(d.lookup("kissed")).toEqual(["K", "IH1", "S", "T"]);
    expect(d.lookup("dog's")).toEqual(["D", "AO1", "G", "Z"]);
    expect(derive("cat", () => undefined)).toBeNull();
  });
});

describe("Spanish", () => {
  table("es", [
    ["hola", "ˈo.la"],
    ["casa", "ˈka.sa"],
    ["perro", "ˈpe.ro"],
    ["caro", "ˈka.ɾo"],
    ["rosa", "ˈro.sa"],
    ["ciudad", "sju.ˈðað"],
    ["guerra", "ˈge.ra"],
    ["pingüino", "piŋ.ˈgwi.no"],
    ["llamar", "ja.ˈmaɾ"],
    ["niño", "ˈni.ɲo"],
    ["chico", "ˈtʃi.ko"],
    ["queso", "ˈke.so"],
    ["jamón", "xa.ˈmon"],
    ["gente", "ˈxen.te"],
    ["hoy", "ˈoi"],
    ["muy", "ˈmwi"],
    ["aire", "ˈai.ɾe"],
    ["tiene", "ˈtje.ne"],
    ["país", "pa.ˈis"],
    ["día", "ˈdi.a"],
    ["lápiz", "ˈla.pis"],
    ["canción", "kan.ˈsjon"],
    ["examen", "ek.ˈsa.men"],
    ["México", "ˈme.xi.ko"],
    ["árbol", "ˈaɾ.βol"],
    ["hablar", "a.ˈβlaɾ"],
    ["mismo", "ˈmiz.mo"],
    ["tango", "ˈtaŋ.go"],
    ["agua", "ˈa.ɣwa"],
    ["Europa", "eu.ˈɾo.pa"],
    ["hielo", "ˈje.lo"],
    ["cuidado", "kwi.ˈða.ðo"],
    ["oído", "o.ˈi.ðo"],
    ["21", "bein.ˈtju.no"],
    ["100", "ˈsjen"],
  ]);
});

describe("Italian", () => {
  table("it", [
    ["casa", "ˈka.za"],
    ["cena", "ˈtʃe.na"],
    ["chiesa", "ˈkje.za"],
    ["gatto", "ˈga.tːo"],
    ["giorno", "ˈdʒoɾ.no"],
    ["gelato", "dʒe.ˈla.to"],
    ["ghiaccio", "ˈgja.tʃːo"],
    ["famiglia", "fa.ˈmi.ʎːa"],
    ["gnocchi", "ˈɲo.kːi"],
    ["scena", "ˈʃe.na"],
    ["pizza", "ˈpi.tsːa"],
    ["zero", "ˈdze.ɾo"],
    ["acqua", "ˈa.kːwa"],
    ["buono", "ˈbwo.no"],
    ["perché", "peɾ.ˈke"],
    ["città", "tʃi.ˈtːa"],
    ["pasta", "ˈpa.sta"],
    ["anche", "ˈaŋ.ke"],
    ["amore", "a.ˈmo.ɾe"],
    ["notte", "ˈno.tːe"],
    ["uomo", "ˈwo.mo"],
    ["Italia", "i.ˈta.lja"],
    ["è", "ˈɛ"],
    ["sbaglio", "ˈzba.ʎːo"],
    ["ventuno", "ven.ˈtu.no"],
  ]);
});

describe("Latin, as sung in church", () => {
  table("la", [
    ["Kyrie", "ˈki.ɾi.e"],
    ["eleison", "e.ˈle.i.zon"],
    ["Christe", "ˈkɾi.ste"],
    ["Gloria", "ˈglo.ɾi.a"],
    ["excelsis", "ek.ˈʃel.sis"],
    ["Deo", "ˈde.o"],
    ["pax", "ˈpaks"],
    ["caeli", "ˈtʃɛ.li"],
    ["coelum", "ˈtʃɛ.lum"],
    ["gratia", "ˈgɾa.tsi.a"],
    ["Agnus", "ˈa.ɲːus"],
    ["Dei", "ˈde.i"],
    ["Sanctus", "ˈsaŋk.tus"],
    ["Hosanna", "o.ˈza.nːa"],
    ["Maria", "ma.ˈɾi.a"],
    ["peccata", "pe.ˈkːa.ta"],
    ["Iesu", "ˈje.zu"],
    ["alleluia", "a.lːe.ˈlu.ja"],
    ["mihi", "ˈmi.ki"],
    ["laudamus", "lau.ˈda.mus"],
    ["Dominus", "ˈdo.mi.nus"],
    ["benedictus", "be.ne.ˈdik.tus"],
    ["suscipe", "ˈsu.ʃi.pe"],
    ["eius", "ˈe.jus"],
    ["sanguis", "ˈsaŋ.gwis"],
    ["Dóminum", "ˈdo.mi.num"],
  ]);
});

describe("Japanese", () => {
  table("ja", [
    ["さくら", "sa.kɯ.ɾa"],
    ["きょう", "kjo.o"],
    ["がっこう", "ga.kːo.o"],
    ["しんぶん", "ɕi.m.bɯ.n"],
    ["ちいさい", "tʃi.i.sa.i"],
    ["つき", "tsɯ.ki"],
    ["ふじさん", "ɸɯ.dʒi.sa.n"],
    ["コーヒー", "ko.o.çi.i"],
    ["ティー", "ti.i"],
    ["ありがとう", "a.ɾi.ga.to.o"],
    ["は", "wa"],
    ["こんにちは", "ko.n.ɲi.tʃi.wa"],
    ["kitte", "ki.tːe"],
    ["matcha", "ma.tʃːa"],
    ["shinbun", "ɕi.m.bɯ.n"],
    ["tsunami", "tsɯ.na.mi"],
    ["fuji", "ɸɯ.dʒi"],
    ["ryokou", "ɾjo.ko.o"],
    ["Tōkyō", "to.o.kjo.o"],
    ["kon'ya", "ko.n.ja"],
    ["sensei", "se.n.se.e"],
    ["si tu", "ɕi tsɯ"],
  ]);

  test("kanji are skipped; the kana around them are read", () => {
    expect(transcribe("東京 は", "ja")).toBe("wa");
  });

  test("i and u between voiceless sounds, and a final -su, are faint", () => {
    const [desu] = words("desu", "ja");
    const [kita] = words("kita", "ja");
    if (desu.kind !== "word" || kita.kind !== "word") throw new Error("not words");
    expect(desu.word.syls[1].nucleus[0].faint).toBe(true);
    expect(kita.word.syls[0].nucleus[0].faint).toBe(true);
    expect(kita.word.syls[1].nucleus[0].faint).toBeUndefined();
  });
});

describe("IPA", () => {
  table("ipa", [
    ["ˈhɛ.loʊ", "ˈhɛ.loʊ"],
    ["wɝld", "ˈwɚld"],
    ["aɪˈpiːeɪ", "aɪ.ˈpiː.eɪ"],
    ["t͡ʃaɪ", "ˈtʃaɪ"],
    ["bãŋ", "ˈbaŋ"],
    ["ˈwɔːtɚ", "ˈwɔː.tɚ"],
    ["ˌɪn.təˈnæ.ʃə.nəl", "ˌɪn.tə.ˈnæ.ʃə.nəl"],
    ["ˈɡʊt.ən", "ˈgʊt.ən"],
    ["a.i", "a.i"],
    ["ɪç", "ˈɪç"],
    ["ʁuʒ", "ˈɣuʒ"],
    ["ʧiːz", "ˈtʃiːz"],
    ["kæt, dɔg.", "ˈkæt | ˈdɔg |"],
    ["[ˈsʌm.θɪŋ]", "ˈsʌm.θɪŋ"],
  ]);
});

describe("every language emits only the inventory's symbols", () => {
  const known = new Set<string>(PHONES);
  const samples: [Lang, string][] = [
    ["en", "The quick brown fox jumps over the lazy dog; 12 quixotic zephyrs vexed Bjørk's naïve façade!"],
    ["es", "El veloz murciélago hindú comía feliz cardillo y kiwi; la cigüeña tocaba el saxofón."],
    ["it", "Quel vituperabile xenofobo zelante assaggia il whisky ed esclama: alleluja!"],
    ["la", "Gaudete, gaudete! Christus est natus ex Maria virgine, gaudete. Quoniam tu solus sanctus."],
    ["ja", "いろはにほへと ちりぬるを わかよたれそ つねならむ ヴァイオリン チェロ ジェット kyakkya"],
    ["ipa", "ðə kwɪk bɹaʊn fɑks ʤʌmps oʊvɚ ðə leɪzi dɔɡ ʁɛ̃ ɬa ʕa ħa ɮa ʙa"],
  ];
  for (const [lang, text] of samples) {
    test(lang, () => {
      const ts = words(text, lang);
      expect(ts.length).toBeGreaterThan(3);
      for (const t of ts) if (t.kind === "word") for (const s of t.word.syls) for (const g of [...s.onset, ...s.nucleus, ...s.coda]) expect(known.has(g.ph)).toBe(true);
    });
  }
});
