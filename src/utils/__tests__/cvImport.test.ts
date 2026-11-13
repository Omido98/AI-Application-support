import { describe, expect, it } from "vitest";
import { parseCvProfileJson } from "@/utils/cvImport";

describe("parseCvProfileJson", () => {
  it("parses fenced JSON and normalizes missing fields", () => {
    const profile = parseCvProfileJson(
      'Here is the profile:\n```json\n{"fullName":"Jane Doe","skills":[{"name":"TypeScript"}],"languages":[{"name":"Danish","fluency":"not-a-level"}]}\n```',
    );
    expect(profile?.fullName).toBe("Jane Doe");
    expect(profile?.skills[0].name).toBe("TypeScript");
    expect(profile?.skills[0].id).toBeTruthy();
    expect(profile?.languages[0].fluency).toBe("Intermediate");
    expect(profile?.education).toEqual([]);
  });

  it("parses plain JSON surrounded by prose", () => {
    const profile = parseCvProfileJson(
      'The result is {"fullName":"Ada","email":"ada@example.com"} done.',
    );
    expect(profile?.fullName).toBe("Ada");
    expect(profile?.email).toBe("ada@example.com");
  });

  it("returns null for malformed or missing JSON", () => {
    expect(parseCvProfileJson("not json at all")).toBeNull();
    expect(parseCvProfileJson('{"fullName": }')).toBeNull();
    expect(parseCvProfileJson("```json\n[]\n```")).toBeNull();
  });
});
