"use client";

import Image from "next/image";
import franklinPublication from "../data/morrowward-franklin-welcome.publication.json";
import marcusPublication from "../data/morrowward-marcus-welcome.publication.json";
import {
  ArrowRight,
  ExternalLink,
  Play,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

export type HistoricalGreeting = {
  id: string;
  identity: string;
  title: string;
  description: string;
  publicationSrc: string;
  videoSrc: string;
  captionsSrc: string;
  posterSrc: string;
  posterAlt: string;
  transcript: string;
  quotation: string;
  quotationSource: string;
  sourcePublisher: string;
  sourceHref: string;
  voiceDisclosure: string;
};

export const GREETING_ROSTER_VERSION = "2026-07-16";
export const GREETING_WELCOME_STORAGE_KEY =
  "morrowward.historical-greeting.v1";
export const GREETING_VIDEO_PRELOAD = "none" as const;

type GreetingPublication = {
  assetId: string;
  assets: ReadonlyArray<{ role: string; publicPath: string }>;
};

function publishedAssetPath(
  publication: GreetingPublication,
  role: "video" | "captions" | "poster",
): string {
  const asset = publication.assets.find((entry) => entry.role === role);
  if (!asset?.publicPath.startsWith("/")) {
    throw new Error(
      `The approved ${role} asset is missing from ${publication.assetId}.`,
    );
  }
  return asset.publicPath;
}

/**
 * Only reviewed, approved greetings belong here. Persisting the selected id
 * keeps a future multi-person roster stable for each browser.
 */
export const GREETING_ROSTER: readonly HistoricalGreeting[] = [
  {
    id: "marcus-aurelius-v1",
    identity:
      "Marcus Aurelius — Roman emperor and Stoic writer, 161–180 CE. A really cool historical dude.",
    title: "A small welcome for the road ahead",
    description: marcusPublication.disclosures.interpretation,
    publicationSrc: "/morrowward-marcus-welcome.publication.json",
    videoSrc: publishedAssetPath(marcusPublication, "video"),
    captionsSrc: publishedAssetPath(marcusPublication, "captions"),
    posterSrc: publishedAssetPath(marcusPublication, "poster"),
    posterAlt:
      "AI-generated historical interpretation of Marcus Aurelius in a Roman courtyard at dawn",
    transcript: marcusPublication.content.transcript,
    quotation: marcusPublication.content.directQuote,
    quotationSource: marcusPublication.content.attribution,
    sourcePublisher: marcusPublication.content.source.publisher,
    sourceHref: marcusPublication.content.source.url,
    voiceDisclosure: marcusPublication.disclosures.voice,
  },
  {
    id: "benjamin-franklin-v1",
    identity:
      "Benjamin Franklin — printer, writer, inventor, and civic builder. A really cool historical dude.",
    title: "A small welcome for the road ahead",
    description: franklinPublication.disclosures.interpretation,
    publicationSrc: "/morrowward-franklin-welcome.publication.json",
    videoSrc: publishedAssetPath(franklinPublication, "video"),
    captionsSrc: publishedAssetPath(franklinPublication, "captions"),
    posterSrc: publishedAssetPath(franklinPublication, "poster"),
    posterAlt:
      "AI-generated historical interpretation of Benjamin Franklin beside a printing press at dawn",
    transcript: franklinPublication.content.transcript,
    quotation: franklinPublication.content.directQuote,
    quotationSource: franklinPublication.content.attribution,
    sourcePublisher: franklinPublication.content.source.publisher,
    sourceHref: franklinPublication.content.source.url,
    voiceDisclosure: franklinPublication.disclosures.voice,
  },
] as const;

export type GreetingWelcomeState = {
  schemaVersion: 1;
  rosterVersion: string;
  greetingId: string;
  seen: boolean;
};

type GreetingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isApprovedGreetingId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    GREETING_ROSTER.some((greeting) => greeting.id === value)
  );
}

export function chooseGreetingIdFromRoster<T extends { id: string }>(
  roster: readonly T[],
  randomValue: number,
): string {
  if (roster.length === 0) {
    throw new Error("The approved historical greeting roster cannot be empty.");
  }
  const safeValue = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 0.999999)
    : 0;
  const index = Math.floor(safeValue * roster.length);
  return roster[index].id;
}

export function getOrCreateGreetingWelcomeState(
  storage: GreetingStorage,
  randomValue = 0,
): GreetingWelcomeState {
  const stored = storage.getItem(GREETING_WELCOME_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<GreetingWelcomeState>;
      if (
        parsed.schemaVersion === 1 &&
        typeof parsed.rosterVersion === "string" &&
        isApprovedGreetingId(parsed.greetingId) &&
        typeof parsed.seen === "boolean"
      ) {
        return parsed as GreetingWelcomeState;
      }
    } catch {
      // Replace malformed local UI state with a fresh bounded record.
    }
  }

  const created: GreetingWelcomeState = {
    schemaVersion: 1,
    rosterVersion: GREETING_ROSTER_VERSION,
    greetingId: chooseGreetingIdFromRoster(GREETING_ROSTER, randomValue),
    seen: false,
  };
  storage.setItem(GREETING_WELCOME_STORAGE_KEY, JSON.stringify(created));
  return created;
}

export function markGreetingWelcomeSeen(
  storage: GreetingStorage,
  greetingId: string,
): GreetingWelcomeState {
  const current = getOrCreateGreetingWelcomeState(storage);
  const next: GreetingWelcomeState = {
    ...current,
    greetingId: isApprovedGreetingId(greetingId)
      ? greetingId
      : current.greetingId,
    seen: true,
  };
  storage.setItem(GREETING_WELCOME_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearGreetingWelcomeState(storage: GreetingStorage): void {
  storage.removeItem(GREETING_WELCOME_STORAGE_KEY);
}

function firstGreeting(): HistoricalGreeting {
  return GREETING_ROSTER[0];
}

export function greetingById(id: string | null): HistoricalGreeting {
  return GREETING_ROSTER.find((greeting) => greeting.id === id) ?? firstGreeting();
}

type HistoricalGreetingDialogProps = {
  open: boolean;
  greeting: HistoricalGreeting;
  celebratory?: boolean;
  onDismiss: () => void;
  onComplete?: () => void;
  onPractice: () => void;
  onExplore: () => void;
};

export function HistoricalGreetingDialog(
  props: HistoricalGreetingDialogProps,
) {
  const { open, ...dialogProps } = props;
  return open ? <HistoricalGreetingDialogContent {...dialogProps} /> : null;
}

function HistoricalGreetingDialogContent({
  greeting,
  celebratory = true,
  onDismiss,
  onComplete,
  onPractice,
  onExplore,
}: Omit<HistoricalGreetingDialogProps, "open">) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const actionsRef = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playError, setPlayError] = useState("");

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], video[controls], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onDismiss]);

  useEffect(() => {
    if (!ended) return;
    const frame = window.requestAnimationFrame(() => {
      actionsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ended]);

  const play = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPlayError("");
    video.muted = false;
    video.volume = 1;
    if (video.textTracks[0]) video.textTracks[0].mode = "showing";
    try {
      await video.play();
      setStarted(true);
    } catch {
      setPlayError(
        "The welcome could not start in this browser. You can still read the complete transcript below.",
      );
    }
  };

  return (
    <div
      className="historical-greeting-backdrop"
      data-testid="historical-greeting-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        className="historical-greeting-dialog"
        data-testid="historical-greeting-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="historical-greeting-title"
        aria-describedby="historical-greeting-intro"
      >
        <button
          className="historical-greeting-close"
          type="button"
          onClick={onDismiss}
          aria-label="Close the historical welcome"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <header className="historical-greeting-heading">
          <span className="historical-greeting-celebration">
            <Sparkles size={15} aria-hidden="true" />
            {celebratory ? "Your first horizon is visible" : "From the Morrowward mission"}
          </span>
          <h2 id="historical-greeting-title" ref={titleRef} tabIndex={-1}>
            {celebratory
              ? "Congratulations—you started your journey."
              : greeting.title}
          </h2>
          <p id="historical-greeting-intro">
            {celebratory
              ? "Every future begins with one small step. Here’s a 15-second welcome for the road ahead."
              : "Return to this short reminder whenever the next small step feels far away."}
          </p>
        </header>

        <div className="historical-greeting-media">
          <video
            ref={videoRef}
            controls={started}
            playsInline
            preload={GREETING_VIDEO_PRELOAD}
            poster={greeting.posterSrc}
            aria-label="15-second AI-generated historical welcome"
            onEnded={() => {
              setEnded(true);
              onComplete?.();
            }}
          >
            <source src={greeting.videoSrc} type="video/mp4" />
            <track
              default
              kind="captions"
              src={greeting.captionsSrc}
              srcLang="en"
              label="English"
            />
            Your browser does not support the video. The complete transcript is available below.
          </video>
          <span className="historical-greeting-badge">
            AI-generated historical interpretation
          </span>
          {!started && (
            <button
              className="historical-greeting-play"
              data-testid="historical-greeting-play"
              type="button"
              onClick={() => void play()}
            >
              <span><Play size={22} fill="currentColor" aria-hidden="true" /></span>
              Play 15-second welcome
            </button>
          )}
        </div>

        <div className="historical-greeting-provenance">
          <p><strong>{greeting.identity}</strong></p>
          <p><Volume2 size={14} aria-hidden="true" /> {greeting.voiceDisclosure}</p>
          <p>{greeting.description}</p>
          <p className="historical-greeting-transcript"><strong>Transcript:</strong> {greeting.transcript}</p>
          <a href={greeting.sourceHref} target="_blank" rel="noreferrer">
            Source: {greeting.quotationSource}
            <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>

        <p className="historical-greeting-status" role="status" aria-live="polite">
          {playError || (ended ? "Welcome complete. Your next small step is ready." : "")}
        </p>

        <footer ref={actionsRef} className="historical-greeting-actions">
          {ended ? (
            <>
              <button
                className="button primary"
                data-testid="historical-greeting-practice"
                type="button"
                onClick={onPractice}
              >
                Practice this week’s step <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button className="button secondary" type="button" onClick={onExplore}>
                Explore my dashboard
              </button>
            </>
          ) : (
            <button className="text-button historical-greeting-skip" type="button" onClick={onDismiss}>
              Skip welcome
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function HistoricalGreetingReplayCard({
  greetingId,
  onPractice,
  onExplore,
}: {
  greetingId: string;
  onPractice: () => void;
  onExplore: () => void;
}) {
  const greeting = greetingById(greetingId);
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="historical-greeting-replay" aria-labelledby="historical-replay-title">
        <div className="historical-greeting-replay-art">
          <Image
            src={greeting.posterSrc}
            alt={greeting.posterAlt}
            width={1280}
            height={720}
            unoptimized
          />
          <span className="historical-greeting-badge">AI-generated historical interpretation</span>
        </div>
        <div className="historical-greeting-replay-copy">
          <span className="section-kicker">A welcome for the road</span>
          <h2 id="historical-replay-title">A 15-second reminder to begin.</h2>
          <p>{greeting.identity}</p>
          <p>{greeting.voiceDisclosure}</p>
          <button
            className="button primary"
            data-testid="historical-greeting-replay"
            type="button"
            onClick={() => setOpen(true)}
          >
            <Play size={17} aria-hidden="true" /> Replay the welcome
          </button>
          <a href={greeting.sourceHref} target="_blank" rel="noreferrer">
            Read the quoted passage at {greeting.sourcePublisher}
            <ExternalLink size={13} aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </section>
      <HistoricalGreetingDialog
        open={open}
        greeting={greeting}
        celebratory={false}
        onDismiss={() => setOpen(false)}
        onPractice={() => {
          setOpen(false);
          onPractice();
        }}
        onExplore={() => {
          setOpen(false);
          onExplore();
        }}
      />
    </>
  );
}
