import { describe, it, expect } from "vitest";
import {
  playerReducer,
  findCurrentChapter,
  initialState,
  initialSleepTimerState,
  type PlayerState,
  type PlayerAction,
} from "../player-reducer";
import type { AudiobookDetail, AudiobookChapter } from "../../use-audiobooks";

// Helper to create a minimal audiobook for testing
function makeAudiobook(overrides: Partial<AudiobookDetail> = {}): AudiobookDetail {
  return {
    id: "ab-1",
    title: "Test Book",
    duration: 3600,
    coverUrl: null,
    description: null,
    language: "en",
    publishedYear: null,
    publisher: null,
    isbn: null,
    asin: null,
    addedAt: "2024-01-01",
    authors: [],
    narrators: [],
    series: [],
    genres: [],
    tags: [],
    chapters: [],
    files: [],
    ...overrides,
  } as AudiobookDetail;
}

function makeChapter(overrides: Partial<AudiobookChapter> = {}): AudiobookChapter {
  return {
    id: "ch-1",
    title: "Chapter 1",
    startTime: 0,
    endTime: 600,
    order: 0,
    ...overrides,
  } as AudiobookChapter;
}

describe("playerReducer", () => {
  describe("SET_AUDIOBOOK", () => {
    it("sets audiobook and duration", () => {
      const audiobook = makeAudiobook({ duration: 7200 });
      const state = playerReducer(initialState, {
        type: "SET_AUDIOBOOK",
        payload: audiobook,
      });
      expect(state.audiobook).toBe(audiobook);
      expect(state.duration).toBe(7200);
    });

    it("clears error when setting audiobook", () => {
      const stateWithError: PlayerState = {
        ...initialState,
        error: "previous error",
      };
      const state = playerReducer(stateWithError, {
        type: "SET_AUDIOBOOK",
        payload: makeAudiobook(),
      });
      expect(state.error).toBeNull();
    });

    it("uses 0 for duration when audiobook has no duration", () => {
      const audiobook = makeAudiobook({ duration: 0 });
      const state = playerReducer(initialState, {
        type: "SET_AUDIOBOOK",
        payload: audiobook,
      });
      expect(state.duration).toBe(0);
    });
  });

  describe("SET_PLAYING", () => {
    it("sets isPlaying to true", () => {
      const state = playerReducer(initialState, {
        type: "SET_PLAYING",
        payload: true,
      });
      expect(state.isPlaying).toBe(true);
    });

    it("sets isPlaying to false", () => {
      const playing: PlayerState = { ...initialState, isPlaying: true };
      const state = playerReducer(playing, {
        type: "SET_PLAYING",
        payload: false,
      });
      expect(state.isPlaying).toBe(false);
    });
  });

  describe("SET_LOADING", () => {
    it("sets isLoading", () => {
      const state = playerReducer(initialState, {
        type: "SET_LOADING",
        payload: true,
      });
      expect(state.isLoading).toBe(true);
    });
  });

  describe("SET_POSITION", () => {
    it("sets currentPosition", () => {
      const state = playerReducer(initialState, {
        type: "SET_POSITION",
        payload: 42.5,
      });
      expect(state.currentPosition).toBe(42.5);
    });
  });

  describe("SET_DURATION", () => {
    it("sets duration", () => {
      const state = playerReducer(initialState, {
        type: "SET_DURATION",
        payload: 9000,
      });
      expect(state.duration).toBe(9000);
    });
  });

  describe("SET_CHAPTER", () => {
    it("sets currentChapter", () => {
      const chapter = makeChapter({ id: "ch-5" });
      const state = playerReducer(initialState, {
        type: "SET_CHAPTER",
        payload: chapter,
      });
      expect(state.currentChapter).toBe(chapter);
    });

    it("sets currentChapter to null", () => {
      const withChapter: PlayerState = {
        ...initialState,
        currentChapter: makeChapter(),
      };
      const state = playerReducer(withChapter, {
        type: "SET_CHAPTER",
        payload: null,
      });
      expect(state.currentChapter).toBeNull();
    });
  });

  describe("SET_PLAYBACK_RATE", () => {
    it("sets playbackRate", () => {
      const state = playerReducer(initialState, {
        type: "SET_PLAYBACK_RATE",
        payload: 1.5,
      });
      expect(state.playbackRate).toBe(1.5);
    });
  });

  describe("SET_VOLUME", () => {
    it("sets volume", () => {
      const state = playerReducer(initialState, {
        type: "SET_VOLUME",
        payload: 0.5,
      });
      expect(state.volume).toBe(0.5);
    });
  });

  describe("SET_ERROR", () => {
    it("sets error and clears loading", () => {
      const loading: PlayerState = { ...initialState, isLoading: true };
      const state = playerReducer(loading, {
        type: "SET_ERROR",
        payload: "Something went wrong",
      });
      expect(state.error).toBe("Something went wrong");
      expect(state.isLoading).toBe(false);
    });

    it("clears error when set to null", () => {
      const withError: PlayerState = {
        ...initialState,
        error: "old error",
      };
      const state = playerReducer(withError, {
        type: "SET_ERROR",
        payload: null,
      });
      expect(state.error).toBeNull();
    });
  });

  describe("STOP", () => {
    it("resets to initial state but preserves volume and playbackRate", () => {
      const playing: PlayerState = {
        ...initialState,
        audiobook: makeAudiobook(),
        isPlaying: true,
        currentPosition: 500,
        duration: 3600,
        volume: 0.7,
        playbackRate: 1.5,
        error: "some error",
      };
      const state = playerReducer(playing, { type: "STOP" });

      expect(state.audiobook).toBeNull();
      expect(state.isPlaying).toBe(false);
      expect(state.currentPosition).toBe(0);
      expect(state.error).toBeNull();
      // Preserved:
      expect(state.volume).toBe(0.7);
      expect(state.playbackRate).toBe(1.5);
    });
  });

  describe("Sleep timer actions", () => {
    it("START_SLEEP_TIMER with duration type", () => {
      const state = playerReducer(initialState, {
        type: "START_SLEEP_TIMER",
        payload: { type: "duration", seconds: 1800, originalVolume: 0.8 },
      });
      expect(state.sleepTimer.active).toBe(true);
      expect(state.sleepTimer.type).toBe("duration");
      expect(state.sleepTimer.remainingSeconds).toBe(1800);
      expect(state.sleepTimer.originalVolume).toBe(0.8);
      expect(state.sleepTimer.isFading).toBe(false);
    });

    it("START_SLEEP_TIMER with endOfChapter type", () => {
      const state = playerReducer(initialState, {
        type: "START_SLEEP_TIMER",
        payload: { type: "endOfChapter", seconds: null, originalVolume: 1 },
      });
      expect(state.sleepTimer.active).toBe(true);
      expect(state.sleepTimer.type).toBe("endOfChapter");
      expect(state.sleepTimer.remainingSeconds).toBeNull();
    });

    it("TICK_SLEEP_TIMER decrements by 1", () => {
      const withTimer: PlayerState = {
        ...initialState,
        sleepTimer: {
          active: true,
          type: "duration",
          remainingSeconds: 30,
          originalVolume: 1,
          isFading: false,
        },
      };
      const state = playerReducer(withTimer, { type: "TICK_SLEEP_TIMER" });
      expect(state.sleepTimer.remainingSeconds).toBe(29);
    });

    it("TICK_SLEEP_TIMER does not go below 0", () => {
      const withTimer: PlayerState = {
        ...initialState,
        sleepTimer: {
          active: true,
          type: "duration",
          remainingSeconds: 0,
          originalVolume: 1,
          isFading: false,
        },
      };
      const state = playerReducer(withTimer, { type: "TICK_SLEEP_TIMER" });
      expect(state.sleepTimer.remainingSeconds).toBe(0);
    });

    it("TICK_SLEEP_TIMER is no-op when timer is inactive", () => {
      const state = playerReducer(initialState, { type: "TICK_SLEEP_TIMER" });
      expect(state).toBe(initialState);
    });

    it("TICK_SLEEP_TIMER is no-op when remainingSeconds is null (endOfChapter)", () => {
      const withEndOfChapter: PlayerState = {
        ...initialState,
        sleepTimer: {
          active: true,
          type: "endOfChapter",
          remainingSeconds: null,
          originalVolume: 1,
          isFading: false,
        },
      };
      const state = playerReducer(withEndOfChapter, {
        type: "TICK_SLEEP_TIMER",
      });
      expect(state).toBe(withEndOfChapter);
    });

    it("START_SLEEP_FADE sets isFading to true", () => {
      const withTimer: PlayerState = {
        ...initialState,
        sleepTimer: {
          active: true,
          type: "duration",
          remainingSeconds: 25,
          originalVolume: 1,
          isFading: false,
        },
      };
      const state = playerReducer(withTimer, { type: "START_SLEEP_FADE" });
      expect(state.sleepTimer.isFading).toBe(true);
    });

    it("CANCEL_SLEEP_TIMER resets to initial sleep timer state", () => {
      const withTimer: PlayerState = {
        ...initialState,
        sleepTimer: {
          active: true,
          type: "duration",
          remainingSeconds: 100,
          originalVolume: 0.8,
          isFading: true,
        },
      };
      const state = playerReducer(withTimer, { type: "CANCEL_SLEEP_TIMER" });
      expect(state.sleepTimer).toEqual(initialSleepTimerState);
    });
  });

  describe("unknown action", () => {
    it("returns state unchanged", () => {
      const state = playerReducer(initialState, {
        type: "UNKNOWN_ACTION" as PlayerAction["type"],
      } as PlayerAction);
      expect(state).toBe(initialState);
    });
  });
});

describe("findCurrentChapter", () => {
  const chapters: AudiobookChapter[] = [
    makeChapter({ id: "ch-1", title: "Chapter 1", startTime: 0, endTime: 600 }),
    makeChapter({ id: "ch-2", title: "Chapter 2", startTime: 600, endTime: 1200 }),
    makeChapter({ id: "ch-3", title: "Chapter 3", startTime: 1200, endTime: 1800 }),
  ];

  it("returns null for empty chapters array", () => {
    expect(findCurrentChapter(100, [])).toBeNull();
  });

  it("finds the first chapter", () => {
    const result = findCurrentChapter(0, chapters);
    expect(result?.id).toBe("ch-1");
  });

  it("finds a middle chapter", () => {
    const result = findCurrentChapter(700, chapters);
    expect(result?.id).toBe("ch-2");
  });

  it("finds the last chapter", () => {
    const result = findCurrentChapter(1300, chapters);
    expect(result?.id).toBe("ch-3");
  });

  it("returns last chapter for position past all chapters", () => {
    const result = findCurrentChapter(5000, chapters);
    expect(result?.id).toBe("ch-3");
  });

  it("handles chapter boundary (start of next chapter)", () => {
    const result = findCurrentChapter(600, chapters);
    expect(result?.id).toBe("ch-2");
  });

  it("handles unsorted chapters (sorts internally)", () => {
    const unsorted = [chapters[2]!, chapters[0]!, chapters[1]!];
    const result = findCurrentChapter(700, unsorted);
    expect(result?.id).toBe("ch-2");
  });

  it("handles chapters without endTime", () => {
    const noEndTime: AudiobookChapter[] = [
      makeChapter({ id: "ch-1", startTime: 0, endTime: undefined as unknown as number }),
      makeChapter({ id: "ch-2", startTime: 600, endTime: undefined as unknown as number }),
    ];
    const result = findCurrentChapter(300, noEndTime);
    expect(result?.id).toBe("ch-1");
  });

  it("returns the single chapter when only one exists", () => {
    const single = [makeChapter({ id: "ch-1", startTime: 0, endTime: 3600 })];
    const result = findCurrentChapter(1000, single);
    expect(result?.id).toBe("ch-1");
  });
});
