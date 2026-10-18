// Representative source-indexed preparation prompts, not an assessment rules engine.
const gbiSource = "GBI NREB Assessment Criteria Tool, V1.1 (January 2011)";
const greenreSource = "GreenRE ENRB Design Reference Guide, V4.0 (February 2026)";

const criterion = (id, title, summary, guidance, page, metric = null) => ({
  id, title, summary, guidance, source_page: page, relevant_metric: metric,
});

export const CERTIFICATION_SCHEMES = [
  {
    id: "GBI_NREB", name: "Green Building Index - Non-Residential Existing Building", abbreviation: "GBI NREB",
    version: "V1.1 (January 2011)", source: gbiSource,
    categories: [
      { id: "EE", name: "Energy Efficiency", source_points: 38, criteria: [
        criterion("EE5", "Advanced or Improved EE Performance - BEI", "Prepare building energy intensity or historical improvement evidence.", "Electricity submissions can support consumption history; floor area, BEI calculations and source records require separate evidence.", "printed p.9", "Electricity"),
        criterion("EE6", "Enhanced or Re-commissioning of Building Energy Systems", "Record commissioning work for major energy-using systems.", "Keep commissioning plans, specialist records and operational updates; consumption data alone is insufficient.", "printed p.9"),
        criterion("EE8", "EE Monitoring & Improvement", "Track building-system performance and energy use over time.", "Link consumption history where relevant and retain energy-management logs, sub-meter records and bills separately.", "printed p.10", "Electricity"),
      ] },
      { id: "EQ", name: "Indoor Environmental Quality", source_points: 21, criteria: [criterion("EQ1", "Minimum IAQ Performance", "Prepare ventilation and indoor-air-quality information.", "Keep ventilation design or measured performance records; sustainability CSVs alone do not establish IAQ performance.", "printed p.10")] },
      { id: "SM", name: "Sustainable Site Planning & Management", source_points: 10, criteria: [criterion("SM2", "Building Exterior Management", "Document exterior management practices.", "Keep the exterior cleaning and maintenance plan and relevant product records.", "printed p.13")] },
      { id: "MR", name: "Materials & Resources", source_points: 9, criteria: [criterion("MR5", "Storage, Collection & Disposal of Recyclables", "Document facilities and practices for recyclable materials.", "Keep recycling infrastructure, collection and monitoring records.", "printed p.15")] },
      { id: "WE", name: "Water Efficiency", source_points: 12, criteria: [criterion("WE5", "Metering & Leak Detection System", "Prepare water sub-metering and leak-detection information.", "Water submissions support consumption history only; retain sub-meter and energy-management-system records separately.", "printed p.16", "Water")] },
      { id: "IN", name: "Innovation", source_points: 10, criteria: [criterion("IN1", "Innovation & Environmental Initiatives", "Record environmental initiatives for later review.", "Keep initiative descriptions and supporting documentation; this checklist does not award innovation points.", "printed p.17")] },
    ],
  },
  {
    id: "GREENRE_ENRB", name: "GreenRE - Existing Non-Residential Building", abbreviation: "GreenRE ENRB",
    version: "V4.0 (February 2026)", source: greenreSource,
    categories: [
      { id: "GR1", name: "Energy Efficiency", criteria: [criterion("ENRB 1-9", "Energy Policy & Management", "Prepare information about energy policy and management.", "Keep policy and energy-management records; electricity data can supplement, not replace, them.", "printed p.8", "Electricity")] },
      { id: "GR2", name: "Water Efficiency", criteria: [criterion("ENRB 2-1", "Water Usage and Leak Detection System", "Prepare water-use and leak-detection evidence.", "Keep water-use history and separate leak-detection system documentation.", "printed p.8", "Water")] },
      { id: "GR3", name: "Sustainable Operation & Management", criteria: [criterion("ENRB 3-3", "Waste Management", "Document building waste-management practices.", "Keep waste collection, separation and operational records.", "printed p.8")] },
      { id: "GR4", name: "Indoor Environmental Quality", criteria: [criterion("ENRB 4-1", "Indoor Air Quality Performance", "Prepare indoor-air-quality performance records.", "Keep IAQ measurements and ventilation records; uploaded resource metrics do not establish IAQ.", "printed p.8")] },
      { id: "GR5", name: "Other Green Features", alternate_name: "Sustainable Practices and Green Innovation", criteria: [criterion("ENRB 5-1", "Green Features & Innovations", "Document other green features or innovations.", "Keep feature descriptions and supporting evidence for later review.", "printed p.8")] },
      { id: "GR6", name: "Carbon Emission of Development", criteria: [criterion("ENRB 6-1", "Carbon Emission of Development", "Prepare the development carbon-emission information requested by the guide.", "Keep development-specific calculation and source records; operational CO2e submissions alone do not establish this item.", "printed p.8")] },
    ],
  },
].map((scheme) => ({
  ...scheme,
  categories: scheme.categories.map((category) => ({
    ...category,
    criteria: category.criteria.map((item) => ({
      ...item, scheme_id: scheme.id, scheme_version: scheme.version,
      category_id: category.id, category_name: category.name, source_document: scheme.source,
    })),
  })),
}));

export const getCertificationScheme = (id) => CERTIFICATION_SCHEMES.find((scheme) => scheme.id === id) || null;
export const getSchemeCriterion = (scheme, id) => scheme?.categories.flatMap((category) => category.criteria).find((item) => item.id === id) || null;
