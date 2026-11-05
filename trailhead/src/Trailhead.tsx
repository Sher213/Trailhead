import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen,
  Target,
  Check,
  Lock,
  Compass,
  Mountain,
  Flag,
  X,
  Loader2,
  ArrowLeft,
  Trash2,
  Sparkles,
} from "lucide-react";
import { askClaude } from "./lib/claude";
import { storageGet, storageSet, storageDelete } from "./lib/storage";
import type {
  Journey,
  JourneyIndexEntry,
  ModalState,
  RoadmapResponse,
  ReflectionResponse,
  RoadmapStep,
} from "./types";

// ---------- helpers ----------

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "journey";

const ROADMAP_SYSTEM = `You are a curriculum designer who builds trusted, curated learning paths from real, well-known books and a couple of hands-on actions. Return ONLY valid JSON, no markdown fences, no preamble, no trailing commentary.

Schema:
{"steps":[{"title": string, "author": string|null, "type":"book"|"action", "rationale": string (max 12 words, why this step, this order)}]}

Rules:
- 6 to 8 steps total, ordered from foundational to advanced.
- Mostly type "book" using real, specific, well-regarded titles and real authors for the stated goal.
- The final 1-2 steps should be type "action": a concrete, specific hands-on task applying everything (author: null).
- Keep titles exactly as commonly known (no subtitles unless essential).`;

const REFLECTION_SYSTEM = `You generate short post-reading reflection prompts. Return ONLY valid JSON, no markdown fences, no preamble.

Schema:
{"questions":[{"label": string, "prompt": string}]}

Rules:
- If given a book: exactly 3 questions labeled exactly "Reflection", "Application", "Challenge" in that order.
  - Reflection: asks for the author's core argument, tailored to the actual book.
  - Application: asks how it changes the reader's current behavior, specific to the book's ideas.
  - Challenge: a small, concrete task the reader can do this week using the book's principles.
- If given an action step (not a book): exactly 1 question labeled "Check-in" asking what they did and what they learned, tailored to the specific action.
- Keep each prompt to one sentence.`;

const EXAMPLES = [
  "Become financially literate",
  "Become a better communicator",
  "Understand philosophy",
  "Learn entrepreneurship",
];

// ---------- layout math for the trail ----------

const DESIGN_W = 400;
const ROW_H = 148;
const TOP_PAD = 90;
const BOTTOM_PAD = 100;

interface Point {
  x: number;
  y: number;
}

function trailPoints(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = 200 + 128 * Math.sin(i * 1.15);
    const y = TOP_PAD + i * ROW_H;
    pts.push({ x, y });
  }
  return pts;
}

function smoothPath(pts: Point[]): string {
  if (pts.length === 0) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const midY = (prev.y + cur.y) / 2;
    d += ` C ${prev.x} ${midY}, ${cur.x} ${midY}, ${cur.x} ${cur.y}`;
  }
  return d;
}

// ---------- contour background ----------

function ContourBackground() {
  const lines = [40, 90, 150, 210, 270];
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.06 }}
      preserveAspectRatio="none"
      viewBox="0 0 400 400"
    >
      {lines.map((y, i) => (
        <path
          key={i}
          d={`M -20 ${y} Q 80 ${y - 30}, 180 ${y} T 420 ${y}`}
          fill="none"
          stroke="#EDEAE0"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

type View = "onboard" | "loading" | "map";

// ---------- main component ----------

export default function Trailhead() {
  const [view, setView] = useState<View>("onboard");
  const [goalInput, setGoalInput] = useState("");
  const [journeys, setJourneys] = useState<JourneyIndexEntry[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState("");
  const [loadingLabel] = useState("Charting your route\u2026");
  const [modal, setModal] = useState<ModalState | null>(null);

  // load index of saved journeys
  useEffect(() => {
    (async () => {
      try {
        const res = await storageGet("journeys:index");
        if (res?.value) setJourneys(JSON.parse(res.value));
      } catch {
        setJourneys([]);
      }
    })();
  }, []);

  const saveJourney = useCallback(async (slug: string, data: Journey) => {
    try {
      await storageSet(`journey:${slug}`, JSON.stringify(data));
    } catch (e) {
      console.error("storage set failed", e);
    }
  }, []);

  const saveIndex = useCallback(async (list: JourneyIndexEntry[]) => {
    try {
      await storageSet("journeys:index", JSON.stringify(list));
    } catch (e) {
      console.error("storage index failed", e);
    }
  }, []);

  const startJourney = async (goalRaw: string) => {
    const goal = goalRaw.trim();
    if (!goal) return;
    setError("");
    setView("loading");
    try {
      const parsed = await askClaude<RoadmapResponse>(
        ROADMAP_SYSTEM,
        `Goal: ${goal}`
      );
      const steps: RoadmapStep[] = (parsed.steps || []).map((s, i) => ({
        ...s,
        status: i === 0 ? "current" : "locked",
        reflection: null,
      }));
      if (steps.length === 0) throw new Error("empty roadmap");
      const slug = slugify(goal) + "-" + Date.now().toString(36).slice(-4);
      const data: Journey = { goal, steps, currentIndex: 0, createdAt: Date.now() };
      setJourney(data);
      setActiveSlug(slug);
      await saveJourney(slug, data);
      const newIndex = [{ slug, goal, createdAt: data.createdAt }, ...journeys];
      setJourneys(newIndex);
      await saveIndex(newIndex);
      setView("map");
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error && e.message.includes("VITE_ANTHROPIC_API_KEY")
          ? e.message
          : "Couldn't chart that route. Try rephrasing your goal, or try again.";
      setError(message);
      setView("onboard");
    }
  };

  const resumeJourney = async (slug: string) => {
    try {
      const res = await storageGet(`journey:${slug}`);
      if (res?.value) {
        setJourney(JSON.parse(res.value));
        setActiveSlug(slug);
        setView("map");
      }
    } catch {
      setError("Couldn't load that trail.");
    }
  };

  const deleteJourney = async (
    slug: string,
    ev: React.MouseEvent
  ) => {
    ev.stopPropagation();
    const newIndex = journeys.filter((j) => j.slug !== slug);
    setJourneys(newIndex);
    await saveIndex(newIndex);
    try {
      await storageDelete(`journey:${slug}`);
    } catch {
      /* ignore */
    }
  };

  const openReflection = async (stepIndex: number) => {
    if (!journey) return;
    const step = journey.steps[stepIndex];
    setModal({ stepIndex, questions: null, answers: {}, loadingQ: true });
    try {
      const userMsg =
        step.type === "book"
          ? `Book: "${step.title}" by ${step.author || "unknown author"}`
          : `Action step: "${step.title}" \u2014 ${step.rationale || ""}`;
      const parsed = await askClaude<ReflectionResponse>(
        REFLECTION_SYSTEM,
        userMsg
      );
      setModal({
        stepIndex,
        questions: parsed.questions || [],
        answers: {},
        loadingQ: false,
      });
    } catch {
      setModal({
        stepIndex,
        questions: [
          {
            label: step.type === "book" ? "Reflection" : "Check-in",
            prompt:
              step.type === "book"
                ? "What was the author's main argument?"
                : "What did you do, and what did you learn?",
          },
        ],
        answers: {},
        loadingQ: false,
      });
    }
  };

  const completeStep = async () => {
    if (!modal || !journey) return;
    const { stepIndex, answers } = modal;
    const steps: RoadmapStep[] = journey.steps.map((s, i) => {
      if (i === stepIndex) return { ...s, status: "completed", reflection: answers };
      if (i === stepIndex + 1) return { ...s, status: "current" };
      return s;
    });
    const newCurrent = Math.min(stepIndex + 1, steps.length - 1);
    const updated: Journey = { ...journey, steps, currentIndex: newCurrent };
    setJourney(updated);
    setModal(null);
    if (activeSlug) await saveJourney(activeSlug, updated);
  };

  const completedCount = journey
    ? journey.steps.filter((s) => s.status === "completed").length
    : 0;
  const totalCount = journey ? journey.steps.length : 0;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const pts = useMemo(
    () => (journey ? trailPoints(journey.steps.length) : []),
    [journey]
  );
  const path = useMemo(() => smoothPath(pts), [pts]);
  const canvasH =
    (journey ? TOP_PAD + (journey.steps.length - 1) * ROW_H : 0) + BOTTOM_PAD;

  const fonts = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
      .th-display { font-family: 'Fraunces', serif; }
      .th-body { font-family: 'Inter', sans-serif; }
      .th-mono { font-family: 'JetBrains Mono', monospace; }
      @keyframes th-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,163,61,0.45);} 50% { box-shadow: 0 0 0 8px rgba(232,163,61,0);} }
      .th-pulse { animation: th-pulse 2.2s ease-in-out infinite; }
      @keyframes th-spin-slow { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      .th-spin-slow { animation: th-spin-slow 12s linear infinite; }
    `}</style>
  );

  // ---------- ONBOARD ----------
  if (view === "onboard") {
    return (
      <div
        className="th-body min-h-screen w-full flex items-center justify-center relative overflow-hidden"
        style={{ background: "#14191C", color: "#EDEAE0" }}
      >
        {fonts}
        <ContourBackground />
        <div className="relative z-10 w-full max-w-xl px-6 py-16">
          <div className="flex items-center justify-center gap-2 mb-8 opacity-80">
            <Compass className="th-spin-slow" size={22} color="#E8A33D" />
            <span
              className="th-mono text-xs tracking-[0.25em] uppercase"
              style={{ color: "#8B9497" }}
            >
              Trailhead
            </span>
          </div>

          <h1
            className="th-display text-center leading-tight mb-3"
            style={{ fontSize: "clamp(28px, 6vw, 44px)", fontStyle: "italic", fontWeight: 500 }}
          >
            What do you want to become?
          </h1>
          <p className="text-center mb-8" style={{ color: "#8B9497" }}>
            Every summit starts at a trailhead. Name yours, and we'll chart the route —
            real books, in the right order, plus the work to make it stick.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              startJourney(goalInput);
            }}
            className="flex flex-col gap-3"
          >
            <input
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="e.g. Become financially literate"
              className="th-body w-full rounded-lg px-4 py-3 outline-none text-base"
              style={{
                background: "#1B2226",
                border: "1px solid #2A3236",
                color: "#EDEAE0",
              }}
            />
            <button
              type="submit"
              disabled={!goalInput.trim()}
              className="th-body rounded-lg px-4 py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: "#E8A33D", color: "#14191C" }}
            >
              <Sparkles size={16} /> Chart my route
            </button>
          </form>

          {error && (
            <p className="text-center mt-3 text-sm" style={{ color: "#E2765C" }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setGoalInput(ex)}
                className="th-body text-sm px-3 py-1.5 rounded-full transition-colors"
                style={{
                  background: "#1B2226",
                  border: "1px solid #2A3236",
                  color: "#8B9497",
                }}
              >
                {ex}
              </button>
            ))}
          </div>

          {journeys.length > 0 && (
            <div className="mt-12">
              <div
                className="th-mono text-xs uppercase tracking-[0.2em] mb-3 text-center"
                style={{ color: "#8B9497" }}
              >
                Basecamps — continue a trail
              </div>
              <div className="flex flex-col gap-2">
                {journeys.map((j) => (
                  <button
                    key={j.slug}
                    onClick={() => resumeJourney(j.slug)}
                    className="th-body flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-left"
                    style={{ background: "#1B2226", border: "1px solid #2A3236" }}
                  >
                    <span className="flex items-center gap-2">
                      <Mountain size={16} color="#6B9080" />
                      <span>{j.goal}</span>
                    </span>
                    <span
                      onClick={(e) => deleteJourney(j.slug, e)}
                      className="p-1 rounded hover:opacity-100 opacity-50"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- LOADING ----------
  if (view === "loading") {
    return (
      <div
        className="th-body min-h-screen w-full flex flex-col items-center justify-center gap-4 relative overflow-hidden"
        style={{ background: "#14191C", color: "#EDEAE0" }}
      >
        {fonts}
        <ContourBackground />
        <Loader2 className="animate-spin relative z-10" size={28} color="#E8A33D" />
        <p className="th-display italic relative z-10" style={{ fontSize: 20 }}>
          {loadingLabel}
        </p>
        <p className="th-mono text-xs relative z-10" style={{ color: "#8B9497" }}>
          curating real books, real order, real work
        </p>
      </div>
    );
  }

  // ---------- MAP ----------
  if (!journey) return null;

  return (
    <div className="th-body min-h-screen w-full relative" style={{ background: "#14191C", color: "#EDEAE0" }}>
      {fonts}
      <ContourBackground />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setView("onboard")}
            className="flex items-center gap-1 th-mono text-xs uppercase tracking-wider"
            style={{ color: "#8B9497" }}
          >
            <ArrowLeft size={14} /> Basecamp
          </button>
          <Compass className="th-spin-slow" size={18} color="#E8A33D" />
        </div>

        <h1 className="th-display italic mb-1" style={{ fontSize: "clamp(24px,5vw,32px)" }}>
          {journey.goal}
        </h1>
        <div className="th-mono text-xs mb-4" style={{ color: "#8B9497" }}>
          {completedCount} of {totalCount} waypoints reached · {pct}%
        </div>

        <div className="w-full h-2 rounded-full mb-10 overflow-hidden" style={{ background: "#1B2226" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: "#E8A33D" }}
          />
        </div>

        <div className="relative w-full" style={{ aspectRatio: `${DESIGN_W} / ${canvasH}` }}>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${DESIGN_W} ${canvasH}`}
            preserveAspectRatio="xMidYMin meet"
          >
            <path d={path} fill="none" stroke="#2A3236" strokeWidth="4" strokeLinecap="round" />
            <path
              d={smoothPath(pts.slice(0, completedCount + 1))}
              fill="none"
              stroke="#E8A33D"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {pts.map((p, i) => {
              const step = journey.steps[i];
              const color =
                step.status === "completed" ? "#E8A33D" : step.status === "current" ? "#14191C" : "#1B2226";
              const stroke = step.status === "locked" ? "#2A3236" : "#E8A33D";
              return (
                <circle key={i} cx={p.x} cy={p.y} r={14} fill={color} stroke={stroke} strokeWidth={2} />
              );
            })}
          </svg>

          {pts.map((p, i) => {
            const step = journey.steps[i];
            const left = (p.x / DESIGN_W) * 100;
            const top = (p.y / canvasH) * 100;
            const alignRight = p.x > 200;
            return (
              <div
                key={i}
                className="absolute"
                style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-50%,-50%)` }}
              >
                <div
                  className={
                    "absolute flex items-center justify-center rounded-full " +
                    (step.status === "current" ? "th-pulse" : "")
                  }
                  style={{
                    width: 28,
                    height: 28,
                    left: -14,
                    top: -14,
                    color: step.status === "locked" ? "#8B9497" : "#14191C",
                  }}
                >
                  {step.status === "completed" && <Check size={15} />}
                  {step.status === "current" &&
                    (step.type === "book" ? (
                      <BookOpen size={14} color="#E8A33D" />
                    ) : (
                      <Target size={14} color="#E8A33D" />
                    ))}
                  {step.status === "locked" && <Lock size={12} />}
                </div>

                <div
                  className="absolute rounded-lg px-3 py-2 th-body"
                  style={{
                    width: 168,
                    top: -12,
                    left: alignRight ? -190 : 22,
                    background: step.status === "locked" ? "transparent" : "#1B2226",
                    border: step.status === "locked" ? "1px dashed #2A3236" : "1px solid #2A3236",
                    opacity: step.status === "locked" ? 0.6 : 1,
                  }}
                >
                  <div
                    className="th-mono text-[10px] uppercase tracking-wider mb-0.5"
                    style={{ color: step.status === "current" ? "#E8A33D" : "#6B9080" }}
                  >
                    {step.type === "book" ? "Read" : "Do"} ·{" "}
                    {i === journey.steps.length - 1 ? "Summit" : `Waypoint ${i + 1}`}
                  </div>
                  <div className="text-sm font-medium leading-snug">{step.title}</div>
                  {step.author && (
                    <div className="text-xs mt-0.5" style={{ color: "#8B9497" }}>
                      {step.author}
                    </div>
                  )}

                  {step.status === "current" && (
                    <button
                      onClick={() => openReflection(i)}
                      className="th-body mt-2 text-xs px-2.5 py-1.5 rounded-md font-medium"
                      style={{ background: "#E8A33D", color: "#14191C" }}
                    >
                      Mark reached
                    </button>
                  )}
                  {step.status === "completed" && (
                    <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "#6B9080" }}>
                      <Flag size={11} /> Reached
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={() => setView("onboard")}
            className="th-mono text-xs uppercase tracking-wider px-4 py-2 rounded-full"
            style={{ border: "1px solid #2A3236", color: "#8B9497" }}
          >
            Blaze a new trail
          </button>
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,13,15,0.7)" }}
        >
          <div
            className="th-body w-full max-w-md rounded-xl p-6 relative max-h-[85vh] overflow-y-auto"
            style={{ background: "#1B2226", border: "1px solid #2A3236" }}
          >
            <button onClick={() => setModal(null)} className="absolute top-4 right-4" style={{ color: "#8B9497" }}>
              <X size={18} />
            </button>
            <div className="th-mono text-xs uppercase tracking-wider mb-1" style={{ color: "#E8A33D" }}>
              Trail Journal
            </div>
            <h2 className="th-display italic mb-4" style={{ fontSize: 22 }}>
              {journey.steps[modal.stepIndex].title}
            </h2>

            {modal.loadingQ ? (
              <div className="flex items-center gap-2 py-6 justify-center" style={{ color: "#8B9497" }}>
                <Loader2 className="animate-spin" size={18} /> preparing prompts…
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {modal.questions!.map((q, qi) => (
                  <div key={qi}>
                    <div className="text-sm font-medium mb-1" style={{ color: "#E8A33D" }}>
                      {q.label}
                    </div>
                    <div className="text-sm mb-2" style={{ color: "#EDEAE0" }}>
                      {q.prompt}
                    </div>
                    <textarea
                      rows={2}
                      value={modal.answers[q.label] || ""}
                      onChange={(e) =>
                        setModal((m) =>
                          m ? { ...m, answers: { ...m.answers, [q.label]: e.target.value } } : m
                        )
                      }
                      className="th-body w-full rounded-md px-3 py-2 text-sm outline-none"
                      style={{ background: "#14191C", border: "1px solid #2A3236", color: "#EDEAE0" }}
                      placeholder="Your answer\u2026"
                    />
                  </div>
                ))}
                <button
                  onClick={completeStep}
                  className="th-body mt-2 rounded-lg px-4 py-2.5 font-medium"
                  style={{ background: "#E8A33D", color: "#14191C" }}
                >
                  Save & continue the trail
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
