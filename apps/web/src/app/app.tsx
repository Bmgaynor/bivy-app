import { formatMessage, parseMessage } from "@bivy-app/sms-format";
import { type FormEvent, useMemo, useRef, useState } from "react";
import {
  BUILT_IN_TEMPLATES,
  buildSmsHref,
  loadState,
  normalizePhone,
  parseCoordInput,
  SEGMENT_CHARS,
  saveLastCoords,
  saveNumber,
  saveTemplates,
  type Template,
} from "../compose";

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type LocationStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "located"; accuracy: number }
  | { kind: "error"; message: string };

function geolocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location is off for this app. Allow it in Settings, or type coordinates.";
  }
  if (error.code === error.TIMEOUT) {
    return "No GPS fix yet. Try again with a view of the sky, or type coordinates.";
  }
  return "Couldn't get your location. Type coordinates instead.";
}

export function App() {
  const storage = useMemo(safeLocalStorage, []);
  const saved = useMemo(() => loadState(storage), [storage]);

  const [number, setNumber] = useState<string | null>(saved.number);
  const [editingNumber, setEditingNumber] = useState(saved.number === null);
  const [numberDraft, setNumberDraft] = useState(saved.number ?? "");
  const [numberError, setNumberError] = useState("");

  const [coordsText, setCoordsText] = useState(saved.lastCoords);
  const [location, setLocation] = useState<LocationStatus>({ kind: "idle" });
  const [question, setQuestion] = useState("");
  const [customTemplates, setCustomTemplates] = useState<Template[]>(
    saved.templates,
  );
  const [copyStatus, setCopyStatus] = useState("");
  const previewRef = useRef<HTMLTextAreaElement>(null);

  const coords = parseCoordInput(coordsText);
  const message =
    coords && question.trim()
      ? formatMessage(coords.lat, coords.lon, question)
      : "";
  const ready = message !== "" && parseMessage(message) !== null;
  const overSegment = message.length > SEGMENT_CHARS;

  function updateCoords(text: string) {
    setCoordsText(text);
    saveLastCoords(storage, text);
  }

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setLocation({
        kind: "error",
        message: "This browser can't share location. Type coordinates.",
      });
      return;
    }
    setLocation({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        updateCoords(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setLocation({ kind: "located", accuracy: Math.round(accuracy) });
      },
      (error) =>
        setLocation({ kind: "error", message: geolocationError(error) }),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );
  }

  function submitNumber(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizePhone(numberDraft);
    if (!normalized) {
      setNumberError("Enter the full number, like +1 800 555 1234.");
      return;
    }
    saveNumber(storage, normalized);
    setNumber(normalized);
    setNumberDraft(normalized);
    setNumberError("");
    setEditingNumber(false);
  }

  function saveAsTemplate() {
    const text = question.trim();
    if (!text || customTemplates.some((t) => t.text === text)) return;
    const label = text.length > 28 ? `${text.slice(0, 26)}...` : text;
    const next = [...customTemplates, { label, text }];
    setCustomTemplates(next);
    saveTemplates(storage, next);
  }

  function removeTemplate(text: string) {
    const next = customTemplates.filter((t) => t.text !== text);
    setCustomTemplates(next);
    saveTemplates(storage, next);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyStatus("Copied. Paste it into Messages.");
    } catch {
      previewRef.current?.select();
      setCopyStatus("Selected. Use your phone's Copy.");
    }
  }

  return (
    <main className="app">
      <header className="masthead">
        <h1>Bivy</h1>
        <p>Compose a weather question to text from the backcountry.</p>
      </header>

      {editingNumber ? (
        <form className="card" onSubmit={submitNumber}>
          <h2>Bivy's number</h2>
          <p className="hint">
            Enter the number you text for Bivy. It's saved on this phone only.
          </p>
          <label htmlFor="number">Phone number</label>
          <input
            id="number"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+1 800 555 1234"
            value={numberDraft}
            onChange={(e) => setNumberDraft(e.target.value)}
          />
          {numberError && <p className="error">{numberError}</p>}
          <div className="row">
            <button type="submit" className="primary">
              Save number
            </button>
            {number && (
              <button type="button" onClick={() => setEditingNumber(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <section className="card" aria-labelledby="where">
            <h2 id="where">Where</h2>
            <button
              type="button"
              className="primary"
              onClick={locateMe}
              disabled={location.kind === "locating"}
            >
              {location.kind === "locating"
                ? "Getting GPS fix..."
                : "Use my location"}
            </button>
            {location.kind === "located" && (
              <p className="hint">
                GPS fix, accurate to about {location.accuracy} m.
              </p>
            )}
            {location.kind === "error" && (
              <p className="error">{location.message}</p>
            )}
            <label htmlFor="coords">Latitude, longitude</label>
            <input
              id="coords"
              inputMode="text"
              autoComplete="off"
              placeholder="47.6, -121.8"
              value={coordsText}
              onChange={(e) => updateCoords(e.target.value)}
            />
            {coordsText && !coords && (
              <p className="error">
                Use decimal degrees, latitude first: 47.6, -121.8
              </p>
            )}
          </section>

          <section className="card" aria-labelledby="ask">
            <h2 id="ask">Question</h2>
            <div className="chips">
              {BUILT_IN_TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.text}
                  className="chip"
                  aria-pressed={question === t.text}
                  onClick={() => setQuestion(t.text)}
                >
                  {t.label}
                </button>
              ))}
              {customTemplates.map((t) => (
                <span className="chip-group" key={t.text}>
                  <button
                    type="button"
                    className="chip custom"
                    aria-pressed={question === t.text}
                    onClick={() => setQuestion(t.text)}
                  >
                    {t.label}
                  </button>
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove template ${t.label}`}
                    onClick={() => removeTemplate(t.text)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <label htmlFor="question">Your question</label>
            <textarea
              id="question"
              rows={3}
              placeholder="ski 8k: wind loading on N aspects?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              type="button"
              className="link"
              onClick={saveAsTemplate}
              disabled={!question.trim()}
            >
              Save as template
            </button>
          </section>

          <section className="card send" aria-labelledby="send">
            <h2 id="send">Message</h2>
            <textarea
              ref={previewRef}
              className="preview"
              aria-label="Message to send"
              readOnly
              rows={2}
              value={message}
              placeholder="Add a location and a question."
            />
            <p className={overSegment ? "count warn" : "count"}>
              {message.length} / {SEGMENT_CHARS} characters
              {overSegment && ": over one text, shorten the question"}
            </p>
            <div className="row">
              <a
                className={ready ? "button primary" : "button primary disabled"}
                href={
                  ready && number ? buildSmsHref(number, message) : undefined
                }
                aria-disabled={!ready}
              >
                Open in Messages
              </a>
              <button type="button" onClick={copyMessage} disabled={!ready}>
                Copy
              </button>
            </div>
            {copyStatus && <p className="hint">{copyStatus}</p>}
          </section>

          <footer className="foot">
            <span>Texting {number}</span>
            <button
              type="button"
              className="link"
              onClick={() => setEditingNumber(true)}
            >
              Change
            </button>
          </footer>
        </>
      )}
    </main>
  );
}

export default App;
