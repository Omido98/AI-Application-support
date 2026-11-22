import { describe, expect, it } from "vitest";
import type { WorkExperience } from "@/types";
import type { CvExperience } from "@/types/cv";
import {
  companyKey,
  experienceRange,
  experienceRangeLabel,
  groupWorkExperience,
  mergeAdjacentExperienceGroups,
  parseCvDateKey,
  roleDateRange,
  sortCvRoles,
} from "@/utils/cvExperience";

function work(
  id: string,
  company: string,
  role: string,
  startYear: string,
  startMonth: string,
  endYear?: string,
  endMonth?: string,
  isCurrent = false,
): WorkExperience {
  return {
    id,
    company,
    role,
    startMonth,
    startYear,
    isCurrent,
    ...(isCurrent ? {} : { endMonth: endMonth ?? "", endYear: endYear ?? "" }),
    jobDescription: "",
    achievements: [],
    projects: [],
  };
}

function group(id: string, company: string, roles: CvExperience["roles"]) {
  return {
    id,
    company,
    location: "",
    roles,
    bullets: [],
    included: true,
  } satisfies CvExperience;
}

function role(id: string, title: string, startDate: string, endDate: string) {
  return {
    id,
    title,
    startDate,
    endDate,
    current: endDate === "Present",
  };
}

describe("parseCvDateKey", () => {
  it("parses English and Swedish labels and ignores free text", () => {
    expect(parseCvDateKey("Jan 2020")).toBe(2020 * 12);
    expect(parseCvDateKey("jan 2020")).toBe(2020 * 12);
    expect(parseCvDateKey("December 2021")).toBe(2021 * 12 + 11);
    expect(parseCvDateKey("okt 2022")).toBe(2022 * 12 + 9);
    expect(parseCvDateKey("2022")).toBe(2022 * 12);
    expect(parseCvDateKey("Present")).toBeNull();
    expect(parseCvDateKey("Spring 2020")).toBeNull();
  });
});

describe("groupWorkExperience", () => {
  it("merges consecutive roles at the same employer, newest first", () => {
    const groups = groupWorkExperience([
      work(
        "w1",
        "EY",
        "Management Consultant",
        "2019",
        "January",
        "2020",
        "December",
      ),
      work(
        "w2",
        "EY",
        "Senior Management Consultant",
        "2021",
        "January",
        "2023",
        "March",
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].map((item) => item.id)).toEqual(["w2", "w1"]);
  });

  it("keeps a different employer in between as a separate group", () => {
    const groups = groupWorkExperience([
      work("w1", "EY", "Consultant", "2019", "January", "2020", "December"),
      work("w2", "Acme", "Analyst", "2021", "January", "2022", "December"),
      work(
        "w3",
        "EY",
        "Senior Consultant",
        "2023",
        "January",
        "2024",
        "December",
      ),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((items) => items[0].company)).toEqual([
      "EY",
      "Acme",
      "EY",
    ]);
  });

  it("still groups when the same employer has a gap with no job in between", () => {
    const groups = groupWorkExperience([
      work("w1", "EY", "Consultant", "2019", "January", "2020", "December"),
      work(
        "w2",
        "EY",
        "Senior Consultant",
        "2022",
        "January",
        "2023",
        "December",
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("normalizes case, spacing and trailing punctuation for employer matching", () => {
    expect(companyKey("  EY  ")).toBe("ey");
    expect(companyKey("EY.")).toBe("ey");
    expect(companyKey("Acme   Corp")).toBe("acme corp");

    const groups = groupWorkExperience([
      work("w1", "EY", "Consultant", "2019", "January", "2020", "December"),
      work(
        "w2",
        "ey.",
        "Senior Consultant",
        "2021",
        "January",
        "2022",
        "December",
      ),
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe("sortCvRoles and experienceRange", () => {
  it("sorts roles newest first and derives the employer range", () => {
    const item = group("g1", "EY", [
      role("r1", "Consultant", "Jan 2019", "Dec 2020"),
      role("r2", "Senior Consultant", "Jan 2021", "Present"),
    ]);
    const sorted = sortCvRoles(item.roles);
    expect(sorted.map((entry) => entry.title)).toEqual([
      "Senior Consultant",
      "Consultant",
    ]);
    expect(experienceRange(item, "en")).toEqual({
      start: "Jan 2019",
      end: "Present",
    });
    expect(experienceRangeLabel(item, "en")).toBe("Jan 2019 – Present");
  });

  it("uses the localized present label when a current role has no end date", () => {
    const item = group("g1", "EY", [
      {
        id: "r1",
        title: "Consultant",
        startDate: "Jan 2019",
        endDate: "",
        current: true,
      },
    ]);
    expect(experienceRangeLabel(item, "sv")).toBe("Jan 2019 – Idag");
  });

  it("handles an employer group with no roles", () => {
    const item = group("g1", "EY", []);
    expect(experienceRange(item, "en")).toEqual({ start: "", end: "" });
    expect(experienceRangeLabel(item, "en")).toBe("");
  });

  it("parses Swedish October dates and keeps the earliest start", () => {
    const item = group("g1", "EY", [
      role("r1", "Consultant", "okt 2018", "dec 2019"),
      role("r2", "Senior Consultant", "jan 2020", "dec 2021"),
    ]);

    expect(sortCvRoles(item.roles).map((entry) => entry.title)).toEqual([
      "Senior Consultant",
      "Consultant",
    ]);
    expect(experienceRange(item, "sv")).toEqual({
      start: "okt 2018",
      end: "dec 2021",
    });
  });

  it("shows the localized present label on a current role with no end date", () => {
    const item = group("g1", "EY", [
      {
        id: "r1",
        title: "Consultant",
        startDate: "Jan 2019",
        endDate: "",
        current: true,
      },
    ]);

    expect(roleDateRange(item.roles[0], "sv")).toBe("Jan 2019 – Idag");
  });
});

describe("mergeAdjacentExperienceGroups", () => {
  it("merges adjacent same-employer legacy entries", () => {
    const merged = mergeAdjacentExperienceGroups([
      group("g1", "EY", [
        role("r1", "Senior Consultant", "Jan 2021", "Present"),
      ]),
      group("g2", "EY", [role("r2", "Consultant", "Jan 2019", "Dec 2020")]),
      group("g3", "Acme", [role("r3", "Analyst", "Jan 2017", "Dec 2018")]),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0].roles.map((entry) => entry.title)).toEqual([
      "Senior Consultant",
      "Consultant",
    ]);
  });

  it("does not merge entries with a different included state", () => {
    const merged = mergeAdjacentExperienceGroups([
      group("g1", "EY", [
        role("r1", "Senior Consultant", "Jan 2021", "Present"),
      ]),
      {
        ...group("g2", "EY", [
          role("r2", "Consultant", "Jan 2019", "Dec 2020"),
        ]),
        included: false,
      },
    ]);

    expect(merged).toHaveLength(2);
  });

  it("does not merge same-employer entries from different locations", () => {
    const merged = mergeAdjacentExperienceGroups([
      {
        ...group("g1", "EY", [role("r1", "Senior", "Jan 2021", "Present")]),
        location: "Stockholm",
      },
      {
        ...group("g2", "EY", [
          role("r2", "Consultant", "Jan 2019", "Dec 2020"),
        ]),
        location: "London",
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.location)).toEqual([
      "Stockholm",
      "London",
    ]);
  });

  it("keeps same-employer stints separate when another employer is between them", () => {
    const merged = mergeAdjacentExperienceGroups([
      group("g1", "EY", [role("r1", "Senior", "Jan 2021", "Present")]),
      group("g2", "Acme", [role("r2", "Analyst", "Jan 2019", "Dec 2020")]),
      group("g3", "EY", [role("r3", "Consultant", "Jan 2017", "Dec 2018")]),
    ]);

    expect(merged).toHaveLength(3);
  });

  it("recomputes the group source id from the newest role", () => {
    const merged = mergeAdjacentExperienceGroups([
      {
        ...group("g1", "EY", [
          {
            ...role("r1", "Senior", "Jan 2021", "Present"),
            sourceId: "work-2",
          },
        ]),
        sourceId: "work-stale",
      },
      {
        ...group("g2", "EY", [
          {
            ...role("r2", "Consultant", "Jan 2019", "Dec 2020"),
            sourceId: "work-1",
          },
        ]),
        sourceId: "work-1",
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceId).toBe("work-2");
    expect(merged[0].roles).toHaveLength(2);
  });
});
