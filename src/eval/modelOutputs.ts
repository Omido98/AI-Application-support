/**
 * Replay fixtures: representative model outputs saved as plain strings.
 *
 * They are replayed against the real response parsers (parseReviewVerdict)
 * and, for suggestion JSON, against the harness's extraction contract. No
 * model is called at eval time.
 */

/** A realistic review report that should force another revision round. */
export const REVIEW_REVISE_OUTPUT = `Missed keywords / requirements:
- "offline-first data sync" → add the IndexedDB cache you built for field reports and name what it stores.
- "WCAG 2.2 AA" → state which audit you ran and the two highest-impact fixes.

Company / role-specific angles:
- Northstar's August 2026 Energinet partnership → connect it to the field engineers who need reports without connectivity.
- The engineering blog's move to local-first sync with ElectricSQL → explain how your IndexedDB cache is adjacent to that direction without claiming CRDT experience.

Action-oriented reframing:
- "I led the design system v2 work" → name what the system contains (component count, product teams) and one outcome the profile supports.

Tone and style:
- "passionate about renewable energy" → replace with the specific reason you moved into energy software.
- The em dash in the second paragraph → use a comma or a full stop.

Grounding issues:
- "ship 40% faster" is not supported by the Candidate Profile; remove it or replace it with an outcome the profile supports.

Honest-gap framing:
- No production CRDT experience → frame the IndexedDB work as adjacent experience, not as equivalent.

VERDICT: REVISE`;

/** The structured suggestion payload a refine pass could return. */
export const SUGGESTION_PAYLOAD = {
  suggestion: `Dear Maja Lind,

I build design systems that field teams can use when the network drops. At Fjordline Energy I led the v2 system, ran accessibility reviews with each product team, and rebuilt the field reporting flow around an IndexedDB cache.

Northstar's move to local-first sync is the next version of that problem. I would bring the same component ownership and accessibility discipline to your platform team.

Best regards,
Astrid Nyholm`,
  rationale:
    "Replaced the generic opener with the strongest concrete match and tied the design system work to Northstar's local-first sync direction.",
  changes: [
    "Rewrote the opening to name the design system and offline work.",
    "Removed 'passionate' and the em dash.",
    "Kept the closing forward-looking.",
  ],
} as const;

/** Fenced JSON, the shape models usually produce for structured output. */
export const SUGGESTION_JSON_OUTPUT = `\`\`\`json\n${JSON.stringify(
  SUGGESTION_PAYLOAD,
  null,
  2,
)}\n\`\`\``;

/** Raw profile JSON as the CV extractor asks the model to return it. */
export const CV_PROFILE_PAYLOAD = {
  fullName: "Astrid Nyholm",
  email: "astrid.nyholm@example.dk",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "https://www.linkedin.com/in/astridnyholm",
  education: [
    {
      school: "DTU",
      degree: "BSc",
      programName: "Software Technology",
      major: "Computer Science",
      startMonth: "September",
      startYear: "2019",
      endMonth: "June",
      endYear: "2022",
      finalGrade: "10.0",
      thesisTitle: "Accessible data visualisation for field workers",
      courses: ["Algorithms", "Human-Computer Interaction"],
    },
  ],
  workExperience: [
    {
      company: "Fjordline Energy",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      endMonth: "",
      endYear: "",
      isCurrent: true,
      jobDescription: "Own the field reporting UI used by 1,800 technicians.",
      projects: [
        {
          name: "Design system v2",
          startMonth: "March",
          startYear: "2025",
          endMonth: "",
          endYear: "",
          isCurrent: true,
        },
      ],
    },
  ],
  otherEngagements: [],
  certifications: [],
  skills: [{ name: "TypeScript" }, { name: "React" }],
  languages: [
    { name: "Danish", fluency: "Native" },
    { name: "English", fluency: "Fluent" },
  ],
  interests: [{ name: "Trail running" }],
} as const;

/** Fenced CV profile JSON. */
export const CV_PROFILE_JSON_OUTPUT = `\`\`\`json\n${JSON.stringify(
  CV_PROFILE_PAYLOAD,
  null,
  2,
)}\n\`\`\``;

/** Plain CV profile JSON without a code fence. */
export const CV_PROFILE_JSON_PLAIN = JSON.stringify(
  CV_PROFILE_PAYLOAD,
  null,
  2,
);

/** CV profile JSON surrounded by the model's conversational prose. */
export const CV_PROFILE_JSON_WITH_PROSE = `Here is the extracted profile:

${CV_PROFILE_JSON_OUTPUT}

Let me know if you want any field corrected.`;

/** Truncated output: prose then an unterminated JSON object, no verdict line. */
export const MALFORMED_OUTPUT = `Missed keywords / requirements:
- "offline sync" → add the concrete cache work.

Action-oriented reframing:
- "I led the design system v2 work" → name the scope.

{"suggestion": "Dear Maja Lind,

I build design systems that field teams can use when the network drops.`;
