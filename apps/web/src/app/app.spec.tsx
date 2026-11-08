import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./app";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("asks for Bivy's number on first run and remembers it", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "(800) 555-1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save number" }));

    expect(localStorage.getItem("bivy.number")).toBe("+18005551234");
    expect(screen.getByText("Texting +18005551234")).toBeTruthy();
  });

  it("builds the message from coordinates and a template", () => {
    localStorage.setItem("bivy.number", "+18005551234");
    render(<App />);

    fireEvent.change(screen.getByLabelText("Latitude, longitude"), {
      target: { value: "47.60012, -121.80049" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Wind" }));

    const preview = screen.getByLabelText(
      "Message to send",
    ) as HTMLTextAreaElement;
    expect(preview.value).toBe("47.6,-121.8 | wind next 12h?");
    expect(
      screen
        .getByRole("link", { name: "Open in Messages" })
        .getAttribute("href"),
    ).toBe("sms:+18005551234?&body=47.6%2C-121.8%20%7C%20wind%20next%2012h%3F");
  });

  it("turns smart punctuation into ASCII and keeps send disabled without coords", () => {
    localStorage.setItem("bivy.number", "+18005551234");
    render(<App />);

    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "what’s the freezing level — tomorrow?" },
    });
    const preview = screen.getByLabelText(
      "Message to send",
    ) as HTMLTextAreaElement;
    expect(preview.value).toBe("");
    // Without an href the anchor isn't a link at all, so there's nothing to tap
    expect(screen.queryByRole("link", { name: "Open in Messages" })).toBeNull();
    expect(
      screen.getByText("Open in Messages").getAttribute("aria-disabled"),
    ).toBe("true");

    fireEvent.change(screen.getByLabelText("Latitude, longitude"), {
      target: { value: "46.85, -121.76" },
    });
    expect(preview.value).toBe(
      "46.85,-121.76 | what's the freezing level - tomorrow?",
    );
  });

  it("saves a custom template that survives a reload", () => {
    localStorage.setItem("bivy.number", "+18005551234");
    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "ski 8k: wind loading on N?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    unmount();

    render(<App />);
    expect(
      screen.getByRole("button", { name: "ski 8k: wind loading on N?" }),
    ).toBeTruthy();
  });
});
