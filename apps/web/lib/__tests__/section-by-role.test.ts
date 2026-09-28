import { describe, expect, it } from "vitest";
import { sectionByRole } from "../section-by-role";

describe("sectionByRole", () => {
  it("sections members by role in the order those roles first appear", () => {
    const sections = sectionByRole([
      { id: "scenario", role: "Scenario", position: 2 },
      { id: "dm", role: "Dungeon Master's Guide", position: 0 },
      { id: "player", role: "Player Guide", position: 1 },
      { id: "sequel", role: "Scenario", position: 3 },
      { id: "loose", role: null, position: 4 },
    ]);

    expect(sections).toEqual([
      {
        role: "Dungeon Master's Guide",
        members: [{ id: "dm", role: "Dungeon Master's Guide", position: 0 }],
      },
      {
        role: "Player Guide",
        members: [{ id: "player", role: "Player Guide", position: 1 }],
      },
      {
        role: "Scenario",
        members: [
          { id: "scenario", role: "Scenario", position: 2 },
          { id: "sequel", role: "Scenario", position: 3 },
        ],
      },
      {
        role: null,
        members: [{ id: "loose", role: null, position: 4 }],
      },
    ]);
  });

  it("treats a blank role as unlabeled", () => {
    expect(sectionByRole([{ id: "a", role: "   ", position: 0 }])).toEqual([
      { role: null, members: [{ id: "a", role: "   ", position: 0 }] },
    ]);
  });
});
