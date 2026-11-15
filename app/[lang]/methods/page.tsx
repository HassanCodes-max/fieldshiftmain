import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, PageHead, SectionTitle } from "@/components/ui/primitives";
import { cropName, fmtDate, fmtNum, getDict, isLang } from "@/lib/i18n";
import { getKnowledge, getNdviModel } from "@/lib/server/data";

export async function generateMetadata({ params }: PageProps<"/[lang]/methods">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? { title: getDict(lang).methods.title, description: getDict(lang).methods.lead } : {};
}

const REFS = [
  "NASA POWER Project, NASA Langley Research Center — power.larc.nasa.gov",
  "Didan, K. (2021). MOD13Q1 MODIS/Terra Vegetation Indices 16-Day L3 Global 250m SIN Grid V061. NASA LP DAAC.",
  "Friedl, M., Sulla-Menashe, D. (2022). MCD12Q1 MODIS/Terra+Aqua Land Cover Type Yearly L3 Global 500m V061. NASA LP DAAC.",
  "O'Neill, P. E., et al. SMAP Enhanced L3 Radiometer Global Daily 9 km EASE-Grid Soil Moisture, Version 6 (SPL3SMP_E). NASA NSIDC DAAC.",
  "Huffman, G. J., et al. GPM IMERG Final Precipitation L3 1 month 0.1° V07 (GPM_3IMERGM). NASA GES DISC.",
  "NASA Shuttle Radar Topography Mission (SRTM) 90 m, via OpenTopoData.",
  "Allen, R. G., Pereira, L. S., Raes, D., Smith, M. (1998). Crop evapotranspiration. FAO Irrigation and Drainage Paper 56.",
  "Ayers, R. S., Westcot, D. W. (1985). Water quality for agriculture. FAO Irrigation and Drainage Paper 29.",
  "Maas, E. V., Hoffman, G. J. (1977). Crop salt tolerance: current assessment. J. Irrigation and Drainage Division, ASCE.",
  "Punjab AMIS, Directorate of Agriculture (Economics & Marketing) Punjab — amis.pk",
  "Weather forecast: Open-Meteo.com (CC BY 4.0).",
];

export default async function MethodsPage({ params }: PageProps<"/[lang]/methods">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const d = getDict(lang);
  const M = d.methods;
  const K = await getKnowledge();
  const model = await getNdviModel();
  const order = ["water", "scores", "total", "ml", "soil", "engineering", "limits"];
  return (
    <>
      <PageHead eyebrow={d.brand} title={M.title} lead={M.lead} />
      <Container className="grid gap-12 py-10 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-8">
          {order.map((k) => {
            const [title, body] = M.sections[k];
            return (
              <section key={k} id={k} className="scroll-mt-24">
                <h2 className="font-display text-2xl text-forest-900">{title}</h2>
                <p className="mt-2 leading-relaxed text-ink-700">{body}</p>
              </section>
            );
          })}
        </div>
        <div className="space-y-10">
          <section>
            <SectionTitle>{M.datasetsTitle}</SectionTitle>
            <dl className="divide-y hairline border-y hairline">
              {d.home.data.map(([name, body]) => (
                <div key={name} className="py-3"><dt className="font-medium text-soil-800">{name}</dt><dd className="text-[0.92rem] text-ink-600">{body}</dd></div>
              ))}
            </dl>
          </section>
          <section>
            <SectionTitle>{M.skillTitle}</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead><tr className="border-b hairline text-ink-500">{M.skillCols.map((c) => <th key={c} className="py-2 pe-3 text-start font-medium">{c}</th>)}</tr></thead>
                <tbody>
                  {model.skill.map((s) => (
                    <tr key={s.lead} className="border-b hairline">
                      <td className="tnum py-2">{fmtNum(lang, s.days)} {d.common.days}</td>
                      <td className="tnum py-2">{fmtNum(lang, s.mae_model, 3)}</td>
                      <td className="tnum py-2">{fmtNum(lang, s.skill_vs_persist * 100)}%</td>
                      <td className="tnum py-2">{fmtNum(lang, s.skill_vs_normal * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <SectionTitle>{M.cropsTitle}</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[0.85rem]">
                <thead><tr className="border-b hairline text-ink-500">{M.cropCols.map((c) => <th key={c} className="py-2 pe-3 text-start font-medium">{c}</th>)}</tr></thead>
                <tbody>
                  {K.cropOrder.map((id) => {
                    const c = K.crops[id];
                    return (
                      <tr key={id} className="border-b hairline align-top">
                        <td className="py-2 pe-3 font-medium">{cropName(lang, id)}</td>
                        <td className="tnum py-2 pe-3">{fmtDate(lang, `2021-${c.sow_start}`, { year: false })} – {fmtDate(lang, `2021-${c.sow_end}`, { year: false })}</td>
                        <td className="tnum py-2 pe-3">{fmtNum(lang, c.duration_days)}</td>
                        <td className="tnum py-2 pe-3">{fmtNum(lang, c.heat_threshold_c)} °C</td>
                        <td className="py-2 pe-3">{(d.stages as Record<string, string>)[c.heat_stage] ?? c.heat_stage}</td>
                        <td className="py-2 text-ink-600">{(d.pests as Record<string, string>)[id]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <SectionTitle>{M.refsTitle}</SectionTitle>
            <ol className="list-decimal space-y-1.5 ps-5 text-[0.85rem] text-ink-600" dir="ltr">
              {REFS.map((r) => <li key={r}>{r}</li>)}
            </ol>
          </section>
        </div>
      </Container>
    </>
  );
}
