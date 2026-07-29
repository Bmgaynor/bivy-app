export interface ForecastPeriod {
  label: string;
  tempF: number;
  windMph: number;
  windDirDeg: number;
  precipChancePct: number;
  shortForecast: string;
}

export interface ForecastSummary {
  fetchedAt: string;
  location: { lat: number; lon: number };
  periods: ForecastPeriod[];
}

export interface WeatherProvider {
  getForecast(lat: number, lon: number): Promise<ForecastSummary>;
}

const OPEN_METEO_TIMEOUT_MS = 5000;

// Offsets (hours from the start of the returned series) sampled into periods.
const PERIOD_OFFSETS = [0, 6, 12, 18];

// WMO weather codes (https://open-meteo.com/en/docs), collapsed to short labels.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy rain showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail",
};

export function describeWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "Unknown conditions";
}

function hourLabel(isoTime: string): string {
  const hour = Number(isoTime.slice(11, 13));
  if (Number.isNaN(hour)) return isoTime;
  if (hour < 6) return "Overnight";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

interface OpenMeteoHourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  weather_code: number[];
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  hourly: OpenMeteoHourly;
}

export class WeatherParseError extends Error {}

function isOpenMeteoResponse(raw: unknown): raw is OpenMeteoResponse {
  if (typeof raw !== "object" || raw === null) return false;
  const candidate = raw as Record<string, unknown>;
  if (
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number"
  ) {
    return false;
  }
  const hourly = candidate.hourly as Record<string, unknown> | undefined;
  if (typeof hourly !== "object" || hourly === null) return false;
  return (
    Array.isArray(hourly.time) &&
    Array.isArray(hourly.temperature_2m) &&
    Array.isArray(hourly.precipitation_probability) &&
    Array.isArray(hourly.wind_speed_10m) &&
    Array.isArray(hourly.wind_direction_10m) &&
    Array.isArray(hourly.weather_code)
  );
}

/**
 * Pure: converts a raw Open-Meteo JSON response into a compact ForecastSummary.
 * `fetchedAt` is injectable so this stays deterministic under test.
 */
export function parseOpenMeteoResponse(
  raw: unknown,
  fetchedAt: string = new Date().toISOString(),
): ForecastSummary {
  if (!isOpenMeteoResponse(raw)) {
    throw new WeatherParseError("Unexpected Open-Meteo response shape");
  }

  const { hourly } = raw;
  const periods: ForecastPeriod[] = PERIOD_OFFSETS.filter(
    (i) => i < hourly.time.length,
  ).map((i) => ({
    label: hourLabel(hourly.time[i]),
    tempF: hourly.temperature_2m[i],
    windMph: hourly.wind_speed_10m[i],
    windDirDeg: hourly.wind_direction_10m[i],
    precipChancePct: hourly.precipitation_probability[i],
    shortForecast: describeWeatherCode(hourly.weather_code[i]),
  }));

  if (periods.length === 0) {
    throw new WeatherParseError("Open-Meteo response contained no hourly data");
  }

  return {
    fetchedAt,
    location: { lat: raw.latitude, lon: raw.longitude },
    periods,
  };
}

function buildOpenMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly:
      "temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: "2",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export function createOpenMeteoProvider(
  fetchImpl: typeof fetch = fetch,
): WeatherProvider {
  return {
    async getForecast(lat, lon) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        OPEN_METEO_TIMEOUT_MS,
      );
      try {
        const response = await fetchImpl(buildOpenMeteoUrl(lat, lon), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new WeatherParseError(
            `Open-Meteo request failed: ${response.status}`,
          );
        }
        const raw = await response.json();
        return parseOpenMeteoResponse(raw);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getWeatherProvider(name: string): WeatherProvider {
  switch (name) {
    case "open-meteo":
      return createOpenMeteoProvider();
    case "nws":
      throw new Error("NWS weather provider is not implemented in Phase 1");
    default:
      throw new Error(`Unknown weather provider: ${name}`);
  }
}
