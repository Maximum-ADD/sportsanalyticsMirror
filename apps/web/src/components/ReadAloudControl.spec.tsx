import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadAloudControl } from "./ReadAloudControl";

// jsdom implements no speech synthesis, so the control's engine is a fake:
// utterances are recorded on speak(), and tests drive the read forward by
// invoking the recorded utterance's onend (what a real engine fires when it
// finishes a chunk).
class FakeSpeechSynthesisUtterance {
  text: string;
  lang = "";
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const spokenUtterances: FakeSpeechSynthesisUtterance[] = [];
const speakMock = vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
  spokenUtterances.push(utterance);
});
const cancelMock = vi.fn();

function stubSpeech() {
  vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance);
  Object.defineProperty(window, "speechSynthesis", {
    value: {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => [],
      pause: vi.fn(),
      resume: vi.fn(),
    },
    configurable: true,
  });
}

function unstubSpeech() {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "speechSynthesis");
  spokenUtterances.length = 0;
}

function ExamplePage() {
  return (
    <main id="main-content">
      <h1>Player comparison</h1>
      <p>Compare up to 4 players side by side.</p>
    </main>
  );
}

beforeEach(() => {
  // Clearing before (rather than after) each test also wipes any cancel the
  // previous render's unmount cleanup fired after RTL's teardown ran.
  vi.clearAllMocks();
});

afterEach(() => {
  unstubSpeech();
});

describe("ReadAloudControl", () => {
  it("renders nothing where speech synthesis is unavailable", () => {
    render(
      <MemoryRouter>
        <ExamplePage />
        <ReadAloudControl />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /read the page aloud/i })).not.toBeInTheDocument();
  });

  it("reads the page's prose blocks in order, then returns to idle at the end", async () => {
    stubSpeech();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExamplePage />
        <ReadAloudControl />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Read the page aloud" }));

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(spokenUtterances[0].text).toBe("Player comparison");
    expect(screen.getByRole("button", { name: "Stop reading the page aloud" })).toHaveAttribute("aria-pressed", "true");

    act(() => spokenUtterances[0].onend?.());
    expect(speakMock).toHaveBeenCalledTimes(2);
    expect(spokenUtterances[1].text).toBe("Compare up to 4 players side by side.");

    // Finishing the final chunk flips the control back to its start state.
    act(() => spokenUtterances[1].onend?.());
    expect(screen.getByRole("button", { name: "Read the page aloud" })).toBeInTheDocument();
  });

  it("stops the engine when the stop button is pressed", async () => {
    stubSpeech();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExamplePage />
        <ReadAloudControl />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Read the page aloud" }));
    await user.click(screen.getByRole("button", { name: "Stop reading the page aloud" }));

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Read the page aloud" })).toBeInTheDocument();

    // A late onend from the cancelled utterance must not restart the queue.
    const spokenCount = speakMock.mock.calls.length;
    act(() => spokenUtterances[0].onend?.());
    expect(speakMock).toHaveBeenCalledTimes(spokenCount);
  });

  it("treats the cancel error event as the stop signal, not a skip-ahead", async () => {
    stubSpeech();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ExamplePage />
        <ReadAloudControl />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Read the page aloud" }));
    act(() => spokenUtterances[0].onerror?.({ error: "canceled" }));

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop reading the page aloud" })).toBeInTheDocument();
  });

  it("cancels the in-flight read when the route changes", async () => {
    stubSpeech();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Routes>
          <Route
            path="/a"
            element={
              <>
                <ExamplePage />
                <Link to="/b">Go to page B</Link>
                <ReadAloudControl />
              </>
            }
          />
          <Route
            path="/b"
            element={
              <>
                <ExamplePage />
                <ReadAloudControl />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Read the page aloud" }));
    expect(speakMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("link", { name: "Go to page B" }));

    expect(cancelMock).toHaveBeenCalled();
  });
});
