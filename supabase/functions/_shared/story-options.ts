// Product choices adapted from the owner's narrative brief; no interview content here.
export const storyChoices = {
  mode: [
    [
      "life",
      "My life story",
      "Follow the experiences and relationships that shaped your life.",
    ],
    [
      "character",
      "Character study",
      "Capture someone's character through revealing everyday moments.",
    ],
    [
      "turning-point",
      "Turning point",
      "Explore one event or season that changed a life.",
    ],
    [
      "heritage",
      "Heritage thread",
      "Follow a tradition, belief or pattern across generations.",
    ],
    [
      "tribute",
      "Tribute",
      "Honor a person through defining stories and their impact.",
    ],
    [
      "milestone",
      "Milestone",
      "Remember a threshold between one stage of life and the next.",
    ],
  ],
  length: [
    [
      "micro",
      "Snapshot",
      "2–3 minutes of audio · 250–500 words · 1–2 minute read",
    ],
    [
      "short",
      "Short arc",
      "6–10 minutes of audio · 800–1,500 words · 4–6 minute read",
    ],
    [
      "medium",
      "Medium arc",
      "15–25 minutes of audio · 2,500–4,000 words · 10–15 minute read",
    ],
    [
      "full",
      "Full life arc",
      "45–90+ minutes across sessions · 6,000–12,000+ words · 25–45+ minute read",
    ],
  ],
  perspective: [
    ["self", "My own story", "First-person autobiography: I remember…"],
    ["witness", "Someone I know", "First-person witness: My dad always…"],
    [
      "chronicler",
      "Biographical account",
      "Third-person biography, using only facts you supply.",
    ],
  ],
  framing: [
    ["chronological", "Through time", "Follow the events in order."],
    [
      "object",
      "An object",
      "Build around an heirloom, photograph or familiar possession.",
    ],
    [
      "wisdom",
      "A lesson or saying",
      "Explore the stories behind a rule or piece of wisdom.",
    ],
    [
      "before-after",
      "Before and after",
      "Focus on a change and its lasting consequences.",
    ],
  ],
  tone: [
    ["candid", "Tough-minded & candid", "Direct, honest and unsentimental."],
    ["warm", "Warm & conversational", "A relaxed kitchen-table conversation."],
    [
      "reflective",
      "Reflective & literary",
      "Explore sensory details, meaning and change.",
    ],
    [
      "documentary",
      "Documentary & preservational",
      "Clear details for a family history record.",
    ],
  ],
  audience: [
    [
      "family",
      "Family keepsake",
      "For children, grandchildren and future generations.",
    ],
    [
      "public",
      "Broad readership",
      "Supply context for someone unfamiliar with the family.",
    ],
    [
      "event",
      "Commemorative event",
      "Stories for a toast, anniversary or tribute.",
    ],
  ],
} as const;
export type StoryOptions = { [K in keyof typeof storyChoices]: string };
export const defaultStoryOptions: StoryOptions = {
  mode: "life",
  length: "full",
  perspective: "self",
  framing: "chronological",
  tone: "warm",
  audience: "family",
};
export function normalizeStoryOptions(value: unknown): StoryOptions {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    Object.entries(storyChoices).map(([key, choices]) => [
      key,
      choices.some((c) => c[0] === input[key])
        ? input[key]
        : defaultStoryOptions[key as keyof StoryOptions],
    ]),
  ) as StoryOptions;
}
export const shortArc = [
  {
    title: "The Baseline",
    subtitle: "The world before",
    question: "What was ordinary life like before things changed?",
  },
  {
    title: "The Crucible",
    subtitle: "The turn",
    question: "What happened, and what choice or change mattered?",
  },
  {
    title: "The Aftermath",
    subtitle: "The imprint",
    question: "What stayed with you, and what does it mean now?",
  },
];
export const fullArc = [
  {
    title: "Roots and foundations",
    subtitle: "The world that made you",
    question: "What shaped your earliest world?",
  },
  {
    title: "Formative years and awakening",
    subtitle: "Becoming yourself",
    question: "When did you begin choosing your own path?",
  },
  {
    title: "Rise and trial",
    subtitle: "Being tested",
    question: "What happened when your hopes met everyday reality?",
  },
  {
    title: "Achievement and its price",
    subtitle: "What mattered, and what it cost",
    question: "What mattered most to achieve, and what did it ask of you?",
  },
  {
    title: "Reckoning and reinvention",
    subtitle: "When life changed again",
    question: "How did you adapt when an old way of life changed?",
  },
  {
    title: "Legacy and resolution",
    subtitle: "What remains",
    question: "What would you like the next generation to carry forward?",
  },
];
export const storyArc = (options: StoryOptions) =>
  options.length === "full" ? fullArc : shortArc;
export function storyGuidance(value: unknown) {
  const options = normalizeStoryOptions(value);
  return (
    Object.entries(storyChoices)
      .map(([key, choices]) => {
        const choice = choices.find(
          (c) => c[0] === options[key as keyof StoryOptions],
        )!;
        return `${key}: ${choice[1]} — ${choice[2]}`;
      })
      .join("\n") +
    "\nArc: " +
    storyArc(options)
      .map((s) => s.title)
      .join(" → ") +
    "\nFollow the narrator's lead; these stages are flexible, not assumptions about their life. Do not force crisis, achievement, trauma or a tidy ending. Never pad an answer to meet a word target. Ask about the selected subject and perspective; do not assume all stories are autobiographical."
  );
}
