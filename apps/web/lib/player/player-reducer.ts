import type { AudiobookDetail, AudiobookChapter } from "../use-audiobooks";

// Sleep timer state
export interface SleepTimerState {
  active: boolean;
  type: "duration" | "endOfChapter" | null;
  remainingSeconds: number | null; // null for end-of-chapter mode
  originalVolume: number;
  isFading: boolean;
}

// Player state
export interface PlayerState {
  audiobook: AudiobookDetail | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentPosition: number; // seconds into virtual audiobook
  duration: number; // total audiobook duration
  currentChapter: AudiobookChapter | null;
  playbackRate: number;
  volume: number;
  error: string | null;
  sleepTimer: SleepTimerState;
}

// Player actions
export interface PlayerActions {
  play: (audiobook: AudiobookDetail, startPosition?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (position: number) => void;
  seekPreview: (position: number) => void; // Updates audio position without syncing to server
  seekStart: () => void; // Called when user starts dragging the slider
  seekEnd: () => void; // Called when user stops dragging the slider
  seekRelative: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  nextChapter: () => void;
  prevChapter: () => void;
  startSleepTimer: (type: "duration" | "endOfChapter", minutes?: number) => void;
  cancelSleepTimer: () => void;
}

// Playback session for tracking listening time
export interface PlaybackSession {
  audiobookId: string;
  startedAt: Date;
  startPosition: number;
  accumulatedDuration: number;
  lastPlayTimestamp: number;
}

// Action types
export type PlayerAction =
  | { type: "SET_AUDIOBOOK"; payload: AudiobookDetail }
  | { type: "SET_PLAYING"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_POSITION"; payload: number }
  | { type: "SET_DURATION"; payload: number }
  | { type: "SET_CHAPTER"; payload: AudiobookChapter | null }
  | { type: "SET_PLAYBACK_RATE"; payload: number }
  | { type: "SET_VOLUME"; payload: number }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "STOP" }
  | { type: "START_SLEEP_TIMER"; payload: { type: "duration" | "endOfChapter"; seconds: number | null; originalVolume: number } }
  | { type: "TICK_SLEEP_TIMER" }
  | { type: "START_SLEEP_FADE" }
  | { type: "CANCEL_SLEEP_TIMER" };

export const initialSleepTimerState: SleepTimerState = {
  active: false,
  type: null,
  remainingSeconds: null,
  originalVolume: 1,
  isFading: false,
};

export const initialState: PlayerState = {
  audiobook: null,
  isPlaying: false,
  isLoading: false,
  currentPosition: 0,
  duration: 0,
  currentChapter: null,
  playbackRate: 1,
  volume: 1,
  error: null,
  sleepTimer: initialSleepTimerState,
};

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "SET_AUDIOBOOK":
      return {
        ...state,
        audiobook: action.payload,
        duration: action.payload.duration || 0,
        error: null,
      };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.payload };
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };
    case "SET_POSITION":
      return { ...state, currentPosition: action.payload };
    case "SET_DURATION":
      return { ...state, duration: action.payload };
    case "SET_CHAPTER":
      return { ...state, currentChapter: action.payload };
    case "SET_PLAYBACK_RATE":
      return { ...state, playbackRate: action.payload };
    case "SET_VOLUME":
      return { ...state, volume: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, isLoading: false };
    case "STOP":
      return {
        ...initialState,
        volume: state.volume,
        playbackRate: state.playbackRate,
      };
    case "START_SLEEP_TIMER":
      return {
        ...state,
        sleepTimer: {
          active: true,
          type: action.payload.type,
          remainingSeconds: action.payload.seconds,
          originalVolume: action.payload.originalVolume,
          isFading: false,
        },
      };
    case "TICK_SLEEP_TIMER":
      if (!state.sleepTimer.active || state.sleepTimer.remainingSeconds === null) {
        return state;
      }
      return {
        ...state,
        sleepTimer: {
          ...state.sleepTimer,
          remainingSeconds: Math.max(0, state.sleepTimer.remainingSeconds - 1),
        },
      };
    case "START_SLEEP_FADE":
      return {
        ...state,
        sleepTimer: {
          ...state.sleepTimer,
          isFading: true,
        },
      };
    case "CANCEL_SLEEP_TIMER":
      return {
        ...state,
        sleepTimer: initialSleepTimerState,
      };
    default:
      return state;
  }
}

// Find the current chapter based on position
export function findCurrentChapter(
  position: number,
  chapters: AudiobookChapter[]
): AudiobookChapter | null {
  if (!chapters.length) return null;

  // Sort chapters by startTime just in case
  const sorted = [...chapters].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length; i++) {
    const chapter = sorted[i];
    if (!chapter) continue;
    const nextChapter = sorted[i + 1];
    const endTime = chapter.endTime ?? nextChapter?.startTime ?? Infinity;

    if (position >= chapter.startTime && position < endTime) {
      return chapter;
    }
  }

  // If past all chapters, return the last one
  const lastChapter = sorted[sorted.length - 1];
  return lastChapter ?? null;
}
