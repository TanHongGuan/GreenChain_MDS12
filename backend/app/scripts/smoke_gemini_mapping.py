"""One real Gemini request against synthetic unfamiliar headers; no database writes."""

import asyncio

from backend.app.core.config import get_settings
from backend.app.etl.ai_mapping import inspect_sheets, process_confirmed_mapping, suggest_mapping

SYNTHETIC = (
    b"Billing Month,TNB Usage (MWh),Water Bill (L),GHG Emissions (kgCO2e)\n"
    b"Jan 2026,30,850000,14200\nFeb 2026,32,910000,15100\n"
)


async def main() -> None:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise SystemExit("GEMINI_API_KEY is not configured in the backend environment.")
    suggestion = await suggest_mapping(inspect_sheets(SYNTHETIC, ".csv", sample_only=True),
                                       settings.gemini_api_key, settings.gemini_model)
    rows = process_confirmed_mapping(SYNTHETIC, ".csv", suggestion)
    expected = [("2026-01", "30000", "850", "14.2"), ("2026-02", "32000", "910", "15.1")]
    actual = [(row.reporting_period, str(row.electricity_kwh), str(row.water_m3), str(row.co2_tco2e)) for row in rows]
    if actual != expected:
        raise SystemExit("Gemini mapping returned a result that did not yield the expected synthetic measurements.")
    print(f"Real Gemini mapping succeeded with {settings.gemini_model}; {len(rows)} canonical monthly rows validated.")


if __name__ == "__main__":
    asyncio.run(main())
