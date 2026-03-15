import { describe, it, expect } from "vitest";
import { queryKeys } from "../query-keys";

describe("queryKeys", () => {
  describe("structure", () => {
    it("each namespace has an 'all' key", () => {
      const namespaces = Object.keys(queryKeys);
      for (const ns of namespaces) {
        const namespace = queryKeys[ns as keyof typeof queryKeys];
        expect(namespace).toHaveProperty("all");
        expect(Array.isArray(namespace.all)).toBe(true);
      }
    });
  });

  describe("audiobooks", () => {
    it("all key is [audiobooks]", () => {
      expect(queryKeys.audiobooks.all).toEqual(["audiobooks"]);
    });

    it("list key includes filters", () => {
      const filters = { search: "dune", genreId: "sci-fi" };
      const key = queryKeys.audiobooks.list(filters);
      expect(key).toEqual(["audiobooks", "list", filters]);
    });

    it("detail key includes id", () => {
      expect(queryKeys.audiobooks.detail("abc-123")).toEqual([
        "audiobooks",
        "detail",
        "abc-123",
      ]);
    });

    it("list without filters", () => {
      const key = queryKeys.audiobooks.list();
      expect(key).toEqual(["audiobooks", "list", undefined]);
    });
  });

  describe("progress", () => {
    it("all key is [progress]", () => {
      expect(queryKeys.progress.all).toEqual(["progress"]);
    });

    it("detail key includes audiobookId", () => {
      expect(queryKeys.progress.detail("ab-1")).toEqual([
        "progress",
        "detail",
        "ab-1",
      ]);
    });

    it("stats key", () => {
      expect(queryKeys.progress.stats()).toEqual(["progress", "stats"]);
    });
  });

  describe("lists", () => {
    it("forItem includes type and id", () => {
      expect(queryKeys.lists.forItem("audiobook", "ab-1")).toEqual([
        "lists",
        "for-item",
        "audiobook",
        "ab-1",
      ]);
    });

    it("top includes limit", () => {
      expect(queryKeys.lists.top(10)).toEqual(["lists", "top", 10]);
    });
  });

  describe("hardcover", () => {
    it("search includes all params", () => {
      const key = queryKeys.hardcover.search("audiobook", "ab-1", 2, "dune");
      expect(key).toEqual(["hardcover", "search", "audiobook", "ab-1", 2, "dune"]);
    });

    it("link includes mediaType and mediaId", () => {
      expect(queryKeys.hardcover.link("ebook", "eb-1")).toEqual([
        "hardcover",
        "link",
        "ebook",
        "eb-1",
      ]);
    });
  });

  describe("key uniqueness", () => {
    it("different namespaces produce different all keys", () => {
      const allKeys = Object.values(queryKeys).map((ns) => ns.all[0]);
      const unique = new Set(allKeys);
      expect(unique.size).toBe(allKeys.length);
    });
  });
});
