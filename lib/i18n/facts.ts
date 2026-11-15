/**
 * Turns the engine's language-free facts (lib/engine Fact) into English or Urdu sentences.
 * Every fact key the engine can emit has both translations (checked by tests/i18n.test.ts).
 */
import type { Fact } from "@/lib/engine/types";
import { cropName, DICTS, fmtDate, fmtInt, fmtNum, listJoin, rotationName, type Lang } from "./index";

// facts are heterogeneous records produced by the engine; templates read their fields by name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type F = Fact & Record<string, any>;
type R = (f: F, L: Lang) => string;

const n = (L: Lang, x: number, d = 0) => fmtNum(L, x, d);
const crop = (L: Lang, f: F) => cropName(L, f.crop);
const crops = (L: Lang, ids: string[]) => listJoin(L, ids.map((c) => cropName(L, c)));
const stage = (L: Lang, s: string) => (DICTS[L].stages as Record<string, string>)[s] ?? s;
const zone = (L: Lang, z: string) => (DICTS[L].zones as Record<string, string>)[z] ?? z;
const month = (L: Lang, m: number) => DICTS[L].months[m - 1];
const span = (L: Lang, a: number, b: number) => `${fmtDate(L, a, { year: false })} – ${fmtDate(L, b, { year: false })}`;
const tex = (L: Lang, t: string) => (DICTS[L].textures as Record<string, string>)[t] ?? t;

export const FACTS: Record<string, { en: R; ur: R }> = {
  // ---------------------------------------------------------------- rotation validity
  rotation_too_short: { en: () => "A rotation needs at least two crops.", ur: () => "فصلی چکر میں کم از کم دو فصلیں ہونی چاہئیں۔" },
  rotation_unknown_crop: { en: (f, L) => `Unknown crop: ${crops(L, f.crops)}.`, ur: (f, L) => `نامعلوم فصل: ${crops(L, f.crops)}۔` },
  rotation_repeat: {
    en: (f, L) => `${crops(L, f.crops)} appears more than once. Each crop has one sowing window per year, so a one-year rotation can include it only once.`,
    ur: (f, L) => `${crops(L, f.crops)} ایک سے زیادہ بار ہے۔ ہر فصل کا سال میں ایک ہی کاشت کا وقت ہوتا ہے، اس لیے ایک سالہ چکر میں وہ صرف ایک بار آ سکتی ہے۔`,
  },
  // ---------------------------------------------------------------- calendar
  late_sowing: {
    en: (f, L) => `${crop(L, f)} would be sown about ${n(L, f.days)} days after its recommended window (${span(L, f.from, f.to)}) because the previous crop is still in the field.`,
    ur: (f, L) => `${crop(L, f)} اپنے موزوں وقت (${span(L, f.from, f.to)}) سے تقریباً ${n(L, f.days)} دن دیر سے کاشت ہوگی کیونکہ پچھلی فصل ابھی کھیت میں ہوگی۔`,
  },
  does_not_fit: {
    en: (f, L) => `The sequence needs about ${n(L, f.days)} days — it does not fit into one year without moving ${crop(L, f)} far outside its sowing window.`,
    ur: (f, L) => `اس ترتیب کو تقریباً ${n(L, f.days)} دن چاہئیں — ${crop(L, f)} کو اس کے وقت سے بہت ہٹائے بغیر یہ ایک سال میں پوری نہیں آتی۔`,
  },
  first_crop_late: {
    en: (f, L) => `Next year's ${crop(L, f)} would start about ${n(L, f.days)} days after its recommended window.`,
    ur: (f, L) => `اگلے سال ${crop(L, f)} اپنے موزوں وقت سے تقریباً ${n(L, f.days)} دن دیر سے شروع ہوگی۔`,
  },
  // ---------------------------------------------------------------- water
  water_over_supply: {
    en: (f, L) => `Estimated irrigation need (~${n(L, f.need)} mm/yr) is more than ${f.availability === "Rainfed" ? "rain alone can provide" : `a '${DICTS.en.availability[f.availability]}' water supply usually delivers (~${n(L, f.supply)} mm/yr)`}.`,
    ur: (f, L) => `اندازاً پانی کی ضرورت (سالانہ تقریباً ${n(L, f.need)} ملی میٹر) ${f.availability === "Rainfed" ? "صرف بارش سے پوری نہیں ہو سکتی" : `«${DICTS.ur.availability[f.availability]}» والے پانی (سالانہ تقریباً ${n(L, f.supply)} ملی میٹر) سے زیادہ ہے`}۔`,
  },
  water_less: {
    en: (f, L) => `Needs about ${n(L, f.mm)} mm less irrigation per year than ${rotationName(L, f.current)} (${n(L, -f.pct)}% less) — about ${n(L, f.irrigations)} fewer 3-inch irrigations.`,
    ur: (f, L) => `${rotationName(L, f.current)} کے مقابلے میں سالانہ تقریباً ${n(L, f.mm)} ملی میٹر کم پانی (${n(L, -f.pct)}% کم) — تقریباً ${n(L, f.irrigations)} پانی کم۔`,
  },
  water_more: {
    en: (f, L) => `Needs about ${n(L, f.mm)} mm more irrigation per year than ${rotationName(L, f.current)} (${n(L, f.pct)}% more).`,
    ur: (f, L) => `${rotationName(L, f.current)} کے مقابلے میں سالانہ تقریباً ${n(L, f.mm)} ملی میٹر زیادہ پانی (${n(L, f.pct)}% زیادہ)۔`,
  },
  ev_water: {
    en: (f, L) => `${crop(L, f)}: crop water use ≈ ${n(L, f.etc)} mm, NASA POWER rain in season ≈ ${n(L, f.rain)} mm → net irrigation ≈ ${n(L, f.irrigation)} mm (range ${n(L, f.lo)}–${n(L, f.hi)}).`,
    ur: (f, L) => `${crop(L, f)}: فصل کا پانی کا استعمال تقریباً ${n(L, f.etc)} ملی میٹر، موسم میں ناسا پاور بارش تقریباً ${n(L, f.rain)} ملی میٹر ← خالص آبپاشی تقریباً ${n(L, f.irrigation)} ملی میٹر (${n(L, f.lo)} تا ${n(L, f.hi)})۔`,
  },
  // ---------------------------------------------------------------- soil
  legume: {
    en: (f, L) => `Includes ${crops(L, f.crops)}, a legume that adds natural nitrogen to the soil and breaks cereal pest and disease cycles.`,
    ur: (f, L) => `اس میں ${crops(L, f.crops)} شامل ہے، ایک پھلی دار فصل جو زمین میں قدرتی نائٹروجن بڑھاتی ہے اور غلہ دار فصلوں کے کیڑوں اور بیماریوں کا چکر توڑتی ہے۔`,
  },
  covered: {
    en: (f, L) => `Keeps the field covered most of the year (only about ${n(L, f.days)} bare days).`,
    ur: (f, L) => `کھیت سال کا زیادہ حصہ فصل سے ڈھکا رہتا ہے (صرف تقریباً ${n(L, f.days)} دن خالی)۔`,
  },
  more_cover: {
    en: (f, L) => `Covers about ${n(L, f.days)} more days of otherwise bare soil than ${rotationName(L, f.current)}.`,
    ur: (f, L) => `${rotationName(L, f.current)} کے مقابلے میں تقریباً ${n(L, f.days)} دن زیادہ زمین ڈھانپتا ہے۔`,
  },
  ndvi_cover: {
    en: (f, L) => `MODIS shows a recurring bare-field period here; this rotation puts a crop on ${n(L, f.pct)}% of it (current: ${n(L, f.currentPct)}%).`,
    ur: (f, L) => `موڈس یہاں ہر سال خالی کھیت کا ایک وقت دکھاتا ہے؛ یہ چکر اس کے ${n(L, f.pct)}% حصے پر فصل رکھتا ہے (موجودہ: ${n(L, f.currentPct)}%)۔`,
  },
  puddled: {
    en: () => "Puddled rice can form a hard plough pan that makes the following wheat harder to establish.",
    ur: () => "کدو والے چاول سے زمین میں سخت تہہ بن سکتی ہے جس سے بعد والی گندم مشکل سے اگتی ہے۔",
  },
  burning: {
    en: () => "Burning rice straw removes organic matter and adds to the smog — mix it into the soil, mulch it or use a happy seeder instead.",
    ur: () => "چاول کی پرالی جلانے سے نامیاتی مادہ ختم ہوتا ہے اور سموگ بڑھتی ہے — اسے زمین میں ملائیں، ملچ کریں یا ہیپی سیڈر استعمال کریں۔",
  },
  // ---------------------------------------------------------------- climate
  heat: {
    en: (f, L) => `${crop(L, f)}: maximum temperature ≥ ${n(L, f.t)} °C on ${n(L, f.days, 1)} of ${n(L, f.of)} days during ${stage(L, f.stage)} (${span(L, f.from, f.to)}). Heat at this stage can reduce grain or pod set.`,
    ur: (f, L) => `${crop(L, f)}: ${stage(L, f.stage)} کے وقت (${span(L, f.from, f.to)}) ${n(L, f.of)} میں سے ${n(L, f.days, 1)} دن درجہ حرارت ${n(L, f.t)} ڈگری یا زیادہ۔ اس مرحلے پر گرمی دانے یا پھلیاں کم کر سکتی ہے۔`,
  },
  ev_heat: {
    en: (f, L) => `NASA POWER — ${crop(L, f)}: maximum temperature ≥ ${n(L, f.t)} °C on ${n(L, f.days, 1)} of ${n(L, f.of)} days during ${stage(L, f.stage)} (${span(L, f.from, f.to)}).`,
    ur: (f, L) => `ناسا پاور — ${crop(L, f)}: ${stage(L, f.stage)} کے وقت (${span(L, f.from, f.to)}) ${n(L, f.of)} میں سے ${n(L, f.days, 1)} دن درجہ حرارت ${n(L, f.t)} ڈگری یا زیادہ۔`,
  },
  heavyrain: {
    en: (f, L) => `${crop(L, f)}: about ${n(L, f.days, 1)} heavy-rain days (≥ ${n(L, f.mm)} mm) per season during ${stage(L, f.stage)} (${span(L, f.from, f.to)}).`,
    ur: (f, L) => `${crop(L, f)}: ${stage(L, f.stage)} کے وقت (${span(L, f.from, f.to)}) ہر موسم تقریباً ${n(L, f.days, 1)} دن تیز بارش (${n(L, f.mm)} ملی میٹر یا زیادہ)۔`,
  },
  ev_heavyrain: {
    en: (f, L) => `NASA POWER — ${crop(L, f)}: ${n(L, f.days, 1)} heavy-rain days (≥ ${n(L, f.mm)} mm) per season during ${stage(L, f.stage)}.`,
    ur: (f, L) => `ناسا پاور — ${crop(L, f)}: ${stage(L, f.stage)} کے وقت ہر موسم ${n(L, f.days, 1)} دن تیز بارش۔`,
  },
  frost: {
    en: (f, L) => `${crop(L, f)}: about ${n(L, f.days, 1)} frost nights per season at a sensitive stage.`,
    ur: (f, L) => `${crop(L, f)}: حساس مرحلے پر ہر موسم تقریباً ${n(L, f.days, 1)} راتیں کہر۔`,
  },
  heattrend: {
    en: (f, L) => `Hot days in this rotation's sensitive stages have been rising (about +${n(L, f.slope, 1)} days per decade since ${fmtInt(L, f.since)}).`,
    ur: (f, L) => `اس چکر کے حساس مرحلوں میں گرم دن بڑھ رہے ہیں (${fmtInt(L, f.since)} سے ہر دہائی تقریباً ${n(L, f.slope, 1)} دن زیادہ)۔`,
  },
  // ---------------------------------------------------------------- soil fit
  waterlog: {
    en: (f, L) => `${crop(L, f)} does not tolerate standing water, and you said water stands in your field after heavy rain.`,
    ur: (f, L) => `${crop(L, f)} کھڑا پانی برداشت نہیں کرتی، اور آپ کے کھیت میں بارش کے بعد پانی کھڑا رہتا ہے۔`,
  },
  salt: {
    en: (f, L) => `At soil salinity ECe ≈ ${n(L, f.ece)} dS/m, ${crop(L, f)} may lose about ${n(L, f.loss)}% of its potential yield (FAO-29 threshold ${n(L, f.threshold, 1)} dS/m).`,
    ur: (f, L) => `زمین کے کلر (ای سی ای تقریباً ${n(L, f.ece)}) پر ${crop(L, f)} کی پیداوار تقریباً ${n(L, f.loss)}% کم ہو سکتی ہے (ایف اے او-۲۹ حد ${n(L, f.threshold, 1)})۔`,
  },
  zone: {
    en: (f, L) => `${crop(L, f)} is not normally grown in the ${zone(L, f.zone)} — local climate, pests, ginning or milling and buyers may be missing.`,
    ur: (f, L) => `${crop(L, f)} عام طور پر ${zone(L, f.zone)} میں کاشت نہیں ہوتی — مقامی موسم، کیڑے، جننگ یا ملیں اور خریدار نہ ہونے کا امکان ہے۔`,
  },
  gate_zone: {
    en: (f, L) => `${crop(L, f)} is outside its recommended zone (${zone(L, f.zone)}).`,
    ur: (f, L) => `${crop(L, f)} اپنے موزوں علاقے (${zone(L, f.zone)}) سے باہر ہے۔`,
  },
  gate_no_fit: { en: () => "The crop sequence does not fit into one year.", ur: () => "فصلوں کی یہ ترتیب ایک سال میں پوری نہیں آتی۔" },
  no_market: {
    en: (f, L) => `You said there is no reliable local market for ${crop(L, f)}.`,
    ur: (f, L) => `آپ کے مطابق ${crop(L, f)} کی قریب کوئی قابلِ بھروسہ منڈی نہیں۔`,
  },
  // ---------------------------------------------------------------- gaps
  gap_salinity: {
    en: () => "Soil salinity has not been tested, so a normal value was assumed. A lab soil test would make the soil-fit score reliable.",
    ur: () => "زمین کے کلر کا ٹیسٹ نہیں ہوا، اس لیے نارمل مقدار فرض کی گئی۔ لیبارٹری ٹیسٹ سے زمین کی مطابقت کا اسکور قابلِ بھروسہ ہوگا۔",
  },
  gap_zone: {
    en: () => "Your agro-ecological zone is unknown (custom location), so regional crop suitability was not checked.",
    ur: () => "آپ کا زرعی علاقہ معلوم نہیں (اپنی چنی ہوئی جگہ)، اس لیے علاقائی موزونیت نہیں جانچی گئی۔",
  },
  gap_market: {
    en: (f, L) => `Market access for ${crop(L, f)} is unknown — check buyers or procurement before switching.`,
    ur: (f, L) => `${crop(L, f)} کی منڈی کا علم نہیں — تبدیلی سے پہلے خریدار یا سرکاری خریداری معلوم کریں۔`,
  },
  gap_smap: {
    en: () => "Soil moisture comes from the POWER/MERRA-2 model here; NASA SMAP satellite data covers the six study districts.",
    ur: () => "یہاں زمین کی نمی پاور ماڈل سے ہے؛ ناسا سمیپ سیٹلائٹ ڈیٹا چھ مطالعاتی اضلاع کے لیے ہے۔",
  },
  gap_imerg: {
    en: () => "Rainfall comes from NASA POWER only; it has not been cross-checked against GPM IMERG satellite rainfall for this location.",
    ur: () => "بارش صرف ناسا پاور سے ہے؛ اس جگہ کے لیے جی پی ایم سیٹلائٹ بارش سے جانچ نہیں ہوئی۔",
  },
  gap_imerg_bias: {
    en: (f, L) => `NASA POWER rainfall here is ${n(L, Math.abs(f.bias))}% ${f.bias > 0 ? "higher" : "lower"} than GPM IMERG satellite rainfall, so irrigation estimates may be ${f.bias > 0 ? "too low" : "too high"}.`,
    ur: (f, L) => `یہاں ناسا پاور کی بارش جی پی ایم سیٹلائٹ سے ${n(L, Math.abs(f.bias))}% ${f.bias > 0 ? "زیادہ" : "کم"} ہے، اس لیے پانی کے اندازے ${f.bias > 0 ? "کم" : "زیادہ"} ہو سکتے ہیں۔`,
  },
  gap_percolation: {
    en: (f, L) => `Rice water need depends strongly on seepage; Field Shift assumed ${n(L, f.mm, 1)} mm/day for ${tex(L, f.texture).toLowerCase()} soil.`,
    ur: (f, L) => `چاول کی پانی کی ضرورت رساؤ پر بہت منحصر ہے؛ ${tex(L, f.texture)} زمین کے لیے روزانہ ${n(L, f.mm, 1)} ملی میٹر فرض کیا گیا۔`,
  },
  gap_regional: {
    en: () => "Crop calendars and thresholds are regional guidance — confirm them with your local agriculture extension officer for your variety.",
    ur: () => "کاشت کے اوقات اور حدیں علاقائی رہنمائی ہیں — اپنی قسم کے لیے مقامی زراعت افسر سے تصدیق کریں۔",
  },
  // ---------------------------------------------------------------- factor notes (score breakdown)
  note_water: {
    en: (f, L) => `≈ ${n(L, f.water)} mm net irrigation per year (≈ ${n(L, f.irrigations)} irrigations of 3 inches); range ${n(L, f.lo)}–${n(L, f.hi)} mm over ${n(L, f.years)} years.`,
    ur: (f, L) => `سالانہ تقریباً ${n(L, f.water)} ملی میٹر خالص آبپاشی (۳ انچ کے تقریباً ${n(L, f.irrigations)} پانی)؛ ${n(L, f.years)} سالوں میں ${n(L, f.lo)} تا ${n(L, f.hi)} ملی میٹر۔`,
  },
  note_legume: { en: () => "+ legume fixes nitrogen", ur: () => "+ پھلی دار فصل نائٹروجن بناتی ہے" },
  note_families: { en: (f, L) => `+ ${n(L, f.n)} crop families`, ur: (f, L) => `+ ${n(L, f.n)} فصلی خاندان` },
  note_cereals_only: { en: () => "− cereals only", ur: () => "− صرف غلہ دار فصلیں" },
  note_puddling: { en: () => "− puddling damages soil structure", ur: () => "− کدو زمین کی ساخت خراب کرتا ہے" },
  note_burning: { en: () => "− residue burning", ur: () => "− پرالی جلانا" },
  note_residue_kept: { en: () => "residue kept (no burning)", ur: () => "پرالی محفوظ (نہیں جلائی)" },
  note_bare_days: { en: (f, L) => `− ${n(L, f.days)} bare days`, ur: (f, L) => `− ${n(L, f.days)} خالی دن` },
  note_heat: { en: (f, L) => `${crop(L, f)} heat ${n(L, f.days)}/${n(L, f.of)} days`, ur: (f, L) => `${crop(L, f)} گرمی ${n(L, f.of)} میں ${n(L, f.days)} دن` },
  note_heavyrain: { en: (f, L) => `${crop(L, f)} heavy rain ${n(L, f.days, 1)} days`, ur: (f, L) => `${crop(L, f)} تیز بارش ${n(L, f.days, 1)} دن` },
  note_frost: { en: (f, L) => `${crop(L, f)} frost ${n(L, f.days, 1)} days`, ur: (f, L) => `${crop(L, f)} کہر ${n(L, f.days, 1)} دن` },
  note_heat_rising: { en: (f, L) => `heat days rising +${n(L, f.slope, 1)}/decade`, ur: (f, L) => `گرم دن ہر دہائی ${n(L, f.slope, 1)} بڑھ رہے ہیں` },
  note_few_stress: { en: () => "Few stress days in sensitive stages", ur: () => "حساس مرحلوں میں دباؤ کے دن کم" },
  note_fit: {
    en: (f, L) => `${crop(L, f)}: ${tex(L, f.texture).toLowerCase()} soil is ${({ good: "well suited", ok: "acceptable", poor: "poorly suited" } as Record<string, string>)[f.fit]}, salinity yield potential ${n(L, f.yp)}%${f.outOfZone ? `, not a recommended crop in the ${zone(L, f.zone)}` : ""}`,
    ur: (f, L) => `${crop(L, f)}: ${tex(L, f.texture)} زمین ${({ good: "بہت موزوں", ok: "قابلِ قبول", poor: "کم موزوں" } as Record<string, string>)[f.fit]}، کلر کے ساتھ پیداوار ${n(L, f.yp)}%${f.outOfZone ? `، ${zone(L, f.zone)} میں تجویز کردہ فصل نہیں` : ""}`,
  },
  note_no_fit: { en: () => "Does not fit into one year", ur: () => "ایک سال میں پورا نہیں آتا" },
  note_late: { en: (f, L) => `${n(L, f.days)} days of late sowing in total`, ur: (f, L) => `کل ${n(L, f.days)} دن دیر سے کاشت` },
  note_on_time: { en: () => "All crops sown inside recommended windows", ur: () => "تمام فصلیں موزوں وقت پر کاشت" },
  note_market: {
    en: (f, L) => `${crop(L, f)}: ${DICTS.en.marketAnswers[f.answer].toLowerCase()}`,
    ur: (f, L) => `${crop(L, f)}: ${DICTS.ur.marketAnswers[f.answer]}`,
  },
  // ---------------------------------------------------------------- soil health
  pest_grasses_only: {
    en: () => "Only grasses in the rotation, so cereal pests, diseases and grassy weeds carry over from one crop to the next.",
    ur: () => "اس چکر میں صرف گھاس خاندان کی فصلیں ہیں، اس لیے غلہ دار فصلوں کے کیڑے، بیماریاں اور گھاس نما جڑی بوٹیاں ایک فصل سے دوسری میں منتقل ہوتی ہیں۔",
  },
  pest_phalaris: {
    en: () => "Rice → wheat is known to build up the weed Phalaris minor (dumbi sitti) in wheat.",
    ur: () => "چاول ← گندم سے گندم میں دمبی سٹی (فیلیرس مائنر) جڑی بوٹی بڑھتی ہے۔",
  },
  pest_maize_not_flooded: {
    en: () => "Replacing flooded rice with maize removes the flooded conditions rice pests and puddling depend on, but maize is still a grass.",
    ur: () => "پانی میں کھڑے چاول کی جگہ مکئی سے چاول کے کیڑوں اور کدو کی شرائط ختم ہوتی ہیں، مگر مکئی بھی گھاس خاندان سے ہے۔",
  },
  pest_break: {
    en: (f, L) => `${crops(L, f.crops)} is not a grass, so it breaks the cycle of cereal pests, diseases and grassy weeds.`,
    ur: (f, L) => `${crops(L, f.crops)} گھاس خاندان سے نہیں، اس لیے غلہ دار فصلوں کے کیڑوں، بیماریوں اور جڑی بوٹیوں کا چکر توڑتی ہے۔`,
  },
  pest_whitefly: {
    en: () => "Cotton and mungbean both host whitefly (leaf-curl and yellow-mosaic viruses): plan spraying and resistant varieties with your extension officer.",
    ur: () => "کپاس اور مونگ دونوں پر سفید مکھی آتی ہے (پتا مروڑ اور زرد موزیک وائرس): اسپرے اور قوتِ مدافعت والی اقسام کا منصوبہ زراعت افسر سے بنائیں۔",
  },
  ero_slope_unknown: { en: () => "Slope unknown (SRTM elevation not loaded).", ur: () => "ڈھلوان معلوم نہیں (ایس آر ٹی ایم بلندی دستیاب نہیں)۔" },
  ero_slope: {
    en: (f, L) => `NASA SRTM slope around the farm is about ${n(L, f.slope, 1)}% (${({ flat: "flat plain, low water-erosion risk", gentle: "gentle slope", sloping: "sloping land, runoff can carry soil away" } as Record<string, string>)[f.cls]}).`,
    ur: (f, L) => `ناسا ایس آر ٹی ایم کے مطابق فارم کے اردگرد ڈھلوان تقریباً ${n(L, f.slope, 1)}% ہے (${({ flat: "ہموار میدان، پانی سے کٹاؤ کا خطرہ کم", gentle: "ہلکی ڈھلوان", sloping: "ڈھلوانی زمین، بہتا پانی مٹی بہا سکتا ہے" } as Record<string, string>)[f.cls]})۔`,
  },
  ero_bare: {
    en: (f, L) => `The field is bare for about ${n(L, f.days)} days a year, exposing soil to hot dry wind and the first monsoon storms.`,
    ur: (f, L) => `کھیت سال میں تقریباً ${n(L, f.days)} دن خالی رہتا ہے، جس سے مٹی گرم خشک ہوا اور مون سون کے پہلے طوفانوں کی زد میں آتی ہے۔`,
  },
  ero_wind: { en: () => "Light sandy soil left bare blows away easily (wind erosion).", ur: () => "ہلکی ریتلی زمین خالی رہے تو آسانی سے اُڑ جاتی ہے (ہوا سے کٹاؤ)۔" },
  ero_covered: {
    en: (f, L) => `Only about ${n(L, f.days)} bare days a year: the soil stays covered most of the time.`,
    ur: (f, L) => `سال میں صرف تقریباً ${n(L, f.days)} خالی دن: مٹی زیادہ تر ڈھکی رہتی ہے۔`,
  },
  ero_burning: {
    en: () => "Burning crop residue leaves the surface unprotected and removes organic matter.",
    ur: () => "فصل کی باقیات جلانے سے سطح غیر محفوظ ہوتی ہے اور نامیاتی مادہ ختم ہوتا ہے۔",
  },
  forage_use: {
    en: (f, L) => `${crop(L, f)}: ${({ rice: "rice straw (pual) is a poor-quality dry fodder", wheat: "wheat straw (bhusa) is the main dry fodder for livestock in Punjab", maize: "green fodder and silage; stover after grain harvest", mungbean: "haulm and leaves are fed to livestock after picking", cotton: "little on-farm fodder; cottonseed cake is a purchased feed" } as Record<string, string>)[f.crop] ?? ""}`,
    ur: (f, L) => `${crop(L, f)}: ${({ rice: "چاول کی پرالی کم معیار کا خشک چارہ ہے", wheat: "گندم کا بھوسہ پنجاب میں مویشیوں کا بنیادی خشک چارہ ہے", maize: "سبز چارہ اور سائیلج؛ دانے کے بعد ٹانڈے", mungbean: "چنائی کے بعد پتے اور تنے مویشیوں کو کھلائے جاتے ہیں", cotton: "کھیت پر چارہ کم؛ کھل خریدی جاتی ہے" } as Record<string, string>)[f.crop] ?? ""}`,
  },
  role_nfix: {
    en: (f, L) => `Nitrogen fixing: ${crops(L, f.crops)} adds nitrogen from the air through root bacteria, so the next crop needs less urea.`,
    ur: (f, L) => `نائٹروجن بنانا: ${crops(L, f.crops)} جڑوں کے بیکٹیریا سے ہوا کی نائٹروجن زمین میں ڈالتی ہے، اس لیے اگلی فصل کو کم یوریا چاہیے۔`,
  },
  role_cover: {
    en: (f, L) => `Cover crop: ${crops(L, f.crops)} covers the soil in the hot April–June fallow, protecting it from sun, wind and the first heavy rains.`,
    ur: (f, L) => `زمین ڈھانپنے والی فصل: ${crops(L, f.crops)} اپریل تا جون کی گرم خالی مدت میں مٹی کو دھوپ، ہوا اور پہلی تیز بارشوں سے بچاتی ہے۔`,
  },
  role_deep: {
    en: (f, L) => `Deep-rooting: ${crops(L, f.crops)} roots reach about ${n(L, f.depth, 1)} m, using subsoil water and loosening compacted layers such as the plough pan left by puddled rice.`,
    ur: (f, L) => `گہری جڑیں: ${crops(L, f.crops)} کی جڑیں تقریباً ${n(L, f.depth, 1)} میٹر تک جاتی ہیں، نیچے کا پانی استعمال کرتی ہیں اور کدو والے چاول سے بنی سخت تہہ نرم کرتی ہیں۔`,
  },
  role_puddled: {
    en: () => "Puddled rice breaks soil structure and forms a plough pan; burning its straw removes organic matter.",
    ur: () => "کدو والا چاول زمین کی ساخت توڑتا اور سخت تہہ بناتا ہے؛ اس کی پرالی جلانے سے نامیاتی مادہ ختم ہوتا ہے۔",
  },
  role_none: { en: () => "No nitrogen-fixing, cover or deep-rooting crop in this rotation.", ur: () => "اس چکر میں نائٹروجن بنانے والی، زمین ڈھانپنے والی یا گہری جڑوں والی کوئی فصل نہیں۔" },
  // ---------------------------------------------------------------- climate insights
  ins_hottest: {
    en: (f, L) => `${month(L, f.month)} is the hottest month: average daily maximum ${n(L, f.tmax, 1)} °C, with about ${n(L, f.hotDays)} days ≥ ${n(L, f.threshold)} °C.`,
    ur: (f, L) => `${month(L, f.month)} سب سے گرم مہینہ ہے: روزانہ زیادہ سے زیادہ کا اوسط ${n(L, f.tmax, 1)} ڈگری، اور تقریباً ${n(L, f.hotDays)} دن ${n(L, f.threshold)} ڈگری یا زیادہ۔`,
  },
  ins_wettest: {
    en: (f, L) => `${month(L, f.month)} brings the most rain (${n(L, f.rain)} mm on average); annual rainfall averages ${n(L, f.annual)} mm.`,
    ur: (f, L) => `${month(L, f.month)} میں سب سے زیادہ بارش ہوتی ہے (اوسطاً ${n(L, f.rain)} ملی میٹر)؛ سالانہ اوسط بارش ${n(L, f.annual)} ملی میٹر ہے۔`,
  },
  ins_deficit: {
    en: (f, L) => `Crop water demand exceeds rainfall by more than 60 mm in ${listJoin(L, f.months.map((m: number) => month(L, m)))} — crops then depend on irrigation.`,
    ur: (f, L) => `${listJoin(L, f.months.map((m: number) => month(L, m)))} میں فصل کی پانی کی طلب بارش سے ۶۰ ملی میٹر سے زیادہ ہوتی ہے — تب فصلیں آبپاشی پر منحصر ہوتی ہیں۔`,
  },
  ins_tmax_trend: {
    en: (f, L) => `Average daily maximum in ${f.late} was ${n(L, f.diff, 1)} °C ${f.warmer ? "warmer" : "cooler"} than in ${f.early} (trend ${f.perDecade > 0 ? "+" : ""}${n(L, f.perDecade, 2)} °C per decade).`,
    ur: (f, L) => `${L === "ur" ? f.late.replace(/[0-9]/g, (d: string) => "۰۱۲۳۴۵۶۷۸۹"[+d]) : f.late} میں روزانہ زیادہ سے زیادہ کا اوسط ${f.early.replace(/[0-9]/g, (d: string) => "۰۱۲۳۴۵۶۷۸۹"[+d])} کے مقابلے میں ${n(L, f.diff, 1)} ڈگری ${f.warmer ? "زیادہ گرم" : "زیادہ ٹھنڈا"} تھا (رجحان ہر دہائی ${n(L, f.perDecade, 2)} ڈگری)۔`,
  },
  ins_wheat_heat: {
    en: (f, L) => `Days ≥ 32 °C in March–April (wheat grain filling): ${n(L, f.early)} per year in ${f.earlyYears} vs ${n(L, f.late)} in ${f.lateYears}.`,
    ur: (f, L) => `مارچ اپریل (گندم کا دانہ بننا) میں ۳۲ ڈگری یا زیادہ کے دن: ${f.earlyYears.replace(/[0-9]/g, (d: string) => "۰۱۲۳۴۵۶۷۸۹"[+d])} میں سالانہ ${n(L, f.early)} بمقابلہ ${f.lateYears.replace(/[0-9]/g, (d: string) => "۰۱۲۳۴۵۶۷۸۹"[+d])} میں ${n(L, f.late)}۔`,
  },
};

export function factText(f: Fact, L: Lang): string {
  const r = FACTS[f.k];
  if (!r) return f.k;
  try {
    return r[L](f as F, L);
  } catch {
    return r.en(f as F, "en");
  }
}
