import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenMeteoProvider,
  describeWeatherCode,
  getWeatherProvider,
  parseOpenMeteoResponse,
  WeatherParseError,
} from "./weather";

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/open-meteo-response.json"),
    "utf-8",
  ),
);

describe("parseOpenMeteoResponse", () => {
  it("extracts periods at the expected offsets", () => {
    const summary = parseOpenMeteoResponse(fixture, "2026-07-28T00:00:00.000Z");

    expect(summary.fetchedAt).toBe("2026-07-28T00:00:00.000Z");
    expect(summary.location).toEqual({ lat: 47.5, lon: -121.8 });
    expect(summary.periods).toHaveLength(4);
    expect(summary.periods.map((p) => p.label)).toEqual([
      "Overnight",
      "Morning",
      "Afternoon",
      "Evening",
    ]);
  });

  it("maps weather codes to short forecasts", () => {
    const summary = parseOpenMeteoResponse(fixture);
    expect(summary.periods[2]).toMatchObject({
      tempF: 70,
      windMph: 15,
      windDirDeg: 245,
      precipChancePct: 15,
      shortForecast: "Mostly clear",
    });
  });

  it("throws WeatherParseError on malformed input", () => {
    expect(() => parseOpenMeteoResponse({ latitude: 1 })).toThrow(
      WeatherParseError,
    );
    expect(() => parseOpenMeteoResponse(null)).toThrow(WeatherParseError);
    expect(() => parseOpenMeteoResponse("nope")).toThrow(WeatherParseError);
  });

  it("throws when hourly arrays are empty", () => {
    const empty = {
      ...fixture,
      hourly: { ...fixture.hourly, time: [] },
    };
    expect(() => parseOpenMeteoResponse(empty)).toThrow(WeatherParseError);
  });
});

describe("describeWeatherCode", () => {
  it("returns a known label", () => {
    expect(describeWeatherCode(0)).toBe("Clear");
    expect(describeWeatherCode(95)).toBe("Thunderstorm");
  });

  it("falls back for unknown codes", () => {
    expect(describeWeatherCode(9999)).toBe("Unknown conditions");
  });
});

describe("createOpenMeteoProvider", () => {
  it("fetches, parses, and returns a ForecastSummary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    });
    const provider = createOpenMeteoProvider(
      fetchMock as unknown as typeof fetch,
    );

    const summary = await provider.getForecast(47.5, -121.8);

    expect(summary.periods).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("latitude=47.5");
    expect(url).toContain("longitude=-121.8");
  });

  it("throws when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const provider = createOpenMeteoProvider(
      fetchMock as unknown as typeof fetch,
    );

    await expect(provider.getForecast(47.5, -121.8)).rejects.toThrow(
      WeatherParseError,
    );
  });
});

describe("getWeatherProvider", () => {
  it("returns the open-meteo provider by name", () => {
    expect(getWeatherProvider("open-meteo")).toBeDefined();
  });

  it("throws for nws (not implemented in Phase 1)", () => {
    expect(() => getWeatherProvider("nws")).toThrow(/not implemented/);
  });

  it("throws for an unknown provider name", () => {
    expect(() => getWeatherProvider("bogus")).toThrow(
      /Unknown weather provider/,
    );
  });
});
