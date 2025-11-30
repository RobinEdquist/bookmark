"use client";

import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { AudiobookDetail, AudiobookChapter } from "../../lib/use-audiobooks";

// Player state
interface PlayerState {
  audiobook: AudiobookDetail | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentPosition: number; // seconds into virtual audiobook
  duration: number; // total audiobook duration
  currentChapter: AudiobookChapter | null;
  playbackRate: number;
  volume: number;
  error: string | null;
}

// Player actions
interface PlayerActions {
  play: (audiobook: AudiobookDetail, startPosition?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (position: number) => void;
  seekRelative: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  nextChapter: () => void;
  prevChapter: () => void;
}

// Playback session for tracking listening time
interface PlaybackSession {
  audiobookId: string;
  startedAt: Date;
  startPosition: number;
  accumulatedDuration: number;
  lastPlayTimestamp: number;
}

type PlayerContextValue = PlayerState & PlayerActions;

const PlayerContext = createContext<PlayerContextValue | null>(null);

// Action types
type PlayerAction =
  | { type: "SET_AUDIOBOOK"; payload: AudiobookDetail }
  | { type: "SET_PLAYING"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_POSITION"; payload: number }
  | { type: "SET_DURATION"; payload: number }
  | { type: "SET_CHAPTER"; payload: AudiobookChapter | null }
  | { type: "SET_PLAYBACK_RATE"; payload: number }
  | { type: "SET_VOLUME"; payload: number }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "STOP" };

const initialState: PlayerState = {
  audiobook: null,
  isPlaying: false,
  isLoading: false,
  currentPosition: 0,
  duration: 0,
  currentChapter: null,
  playbackRate: 1,
  volume: 1,
  error: null,
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
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
    default:
      return state;
  }
}

// Find the current chapter based on position
function findCurrentChapter(
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

// Helper to get initial values from localStorage (runs synchronously)
function getInitialPlaybackRate(): number {
  if (typeof window === "undefined") return 1;
  const saved = localStorage.getItem("player-playback-rate");
  return saved ? parseFloat(saved) : 1;
}

function getInitialVolume(): number {
  if (typeof window === "undefined") return 1;
  const saved = localStorage.getItem("player-volume");
  return saved ? parseFloat(saved) : 1;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  // Initialize state with values from localStorage
  const [state, dispatch] = useReducer(playerReducer, undefined, () => ({
    ...initialState,
    playbackRate: getInitialPlaybackRate(),
    volume: getInitialVolume(),
  }));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileStartPositionRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(getInitialPlaybackRate());
  const volumeRef = useRef<number>(getInitialVolume());

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== "undefined" && !audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
  }, []);

  // Sync progress to server
  const syncProgress = useCallback(async (position: number) => {
    if (!state.audiobook) return;

    try {
      await fetch(`/api/progress/${state.audiobook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: Math.floor(position) }),
        credentials: "include",
      });
    } catch (error) {
      console.error("[Player] Failed to sync progress:", error);
    }
  }, [state.audiobook]);

  // Record listening session
  const recordSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !state.audiobook) return;

    const now = Date.now();
    const duration = session.accumulatedDuration +
      (state.isPlaying ? (now - session.lastPlayTimestamp) / 1000 : 0);

    if (duration < 5) return; // Don't record sessions shorter than 5 seconds

    try {
      await fetch(`/api/progress/${state.audiobook.id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: session.startedAt.toISOString(),
          endedAt: new Date().toISOString(),
          startPosition: Math.floor(session.startPosition),
          endPosition: Math.floor(state.currentPosition),
          durationSeconds: Math.floor(duration),
        }),
        credentials: "include",
      });
    } catch (error) {
      console.error("[Player] Failed to record session:", error);
    }

    sessionRef.current = null;
  }, [state.audiobook, state.currentPosition, state.isPlaying]);

  // Set up audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      // Calculate actual position: file start + current time in file
      const actualPosition = fileStartPositionRef.current + audio.currentTime;
      dispatch({ type: "SET_POSITION", payload: actualPosition });

      // Update current chapter
      if (state.audiobook?.chapters) {
        const chapter = findCurrentChapter(actualPosition, state.audiobook.chapters);
        if (chapter?.id !== state.currentChapter?.id) {
          dispatch({ type: "SET_CHAPTER", payload: chapter });
          // Sync on chapter change
          syncProgress(actualPosition);
        }
      }
    };

    const handleLoadStart = () => {
      dispatch({ type: "SET_LOADING", payload: true });
    };

    const handleCanPlay = () => {
      dispatch({ type: "SET_LOADING", payload: false });
    };

    const handlePlay = () => {
      dispatch({ type: "SET_PLAYING", payload: true });
      const actualPosition = fileStartPositionRef.current + audio.currentTime;

      // Start a new session if one doesn't exist
      if (!sessionRef.current && state.audiobook) {
        sessionRef.current = {
          audiobookId: state.audiobook.id,
          startedAt: new Date(),
          startPosition: actualPosition,
          accumulatedDuration: 0,
          lastPlayTimestamp: Date.now(),
        };
      } else if (sessionRef.current) {
        // Update timestamp for existing session
        sessionRef.current.lastPlayTimestamp = Date.now();
      }
    };

    const handlePause = () => {
      dispatch({ type: "SET_PLAYING", payload: false });
      const actualPosition = fileStartPositionRef.current + audio.currentTime;

      // Record the listening session on pause
      const session = sessionRef.current;
      if (session && state.audiobook) {
        const now = Date.now();
        const duration = session.accumulatedDuration +
          (now - session.lastPlayTimestamp) / 1000;

        // Only record sessions longer than 5 seconds
        if (duration >= 5) {
          fetch(`/api/progress/${state.audiobook.id}/session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startedAt: session.startedAt.toISOString(),
              endedAt: new Date().toISOString(),
              startPosition: Math.floor(session.startPosition),
              endPosition: Math.floor(actualPosition),
              durationSeconds: Math.floor(duration),
            }),
            credentials: "include",
          }).catch(error => {
            console.error("[Player] Failed to record session:", error);
          });
        }

        // Reset session for next play
        sessionRef.current = null;
      }

      // Sync progress on pause
      syncProgress(actualPosition);
    };

    const handleEnded = () => {
      // Audio file ended - might need to load next file for multi-file audiobooks
      // For now, just sync and stop
      dispatch({ type: "SET_PLAYING", payload: false });
      recordSession();
    };

    const handleError = (e: Event) => {
      console.error("[Player] Audio error:", e);
      dispatch({ type: "SET_ERROR", payload: "Failed to load audio" });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [state.audiobook, state.currentChapter, syncProgress, recordSession]);

  // Set up periodic sync (every 60s while playing)
  useEffect(() => {
    if (state.isPlaying && state.audiobook) {
      syncIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const actualPosition = fileStartPositionRef.current + audioRef.current.currentTime;
          syncProgress(actualPosition);
        }
      }, 60000);
    } else if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [state.isPlaying, state.audiobook, syncProgress]);

  // Sync on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state.audiobook && audioRef.current) {
        const actualPosition = fileStartPositionRef.current + audioRef.current.currentTime;
        // Use sendBeacon for reliable delivery
        navigator.sendBeacon(
          `/api/progress/${state.audiobook.id}`,
          JSON.stringify({ position: Math.floor(actualPosition) })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.audiobook]);

  // Player actions
  const play = useCallback(async (audiobook: AudiobookDetail, startPosition: number = 0) => {
    const audio = audioRef.current;
    if (!audio) return;

    dispatch({ type: "SET_AUDIOBOOK", payload: audiobook });
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_POSITION", payload: startPosition });

    // Start new session
    sessionRef.current = {
      audiobookId: audiobook.id,
      startedAt: new Date(),
      startPosition,
      accumulatedDuration: 0,
      lastPlayTimestamp: Date.now(),
    };

    try {
      // Get stream info to find which file contains the start position
      const response = await fetch(
        `/api/audiobooks/${audiobook.id}/stream?position=${Math.floor(startPosition)}`,
        { method: "HEAD", credentials: "include" }
      );
      const fileStartPosition = parseInt(response.headers.get("X-File-Start-Position") || "0", 10);
      fileStartPositionRef.current = fileStartPosition;

      // Calculate offset within the file
      const offsetInFile = startPosition - fileStartPosition;

      // Load the file from its beginning
      const streamUrl = `/api/audiobooks/${audiobook.id}/stream?position=${Math.floor(fileStartPosition)}`;
      audio.src = streamUrl;

      // Wait for audio to be ready, then seek and apply settings
      const handleCanPlay = () => {
        audio.removeEventListener("canplay", handleCanPlay);
        // Seek to position if needed
        if (offsetInFile > 0) {
          audio.currentTime = offsetInFile;
        }
        // Apply playback rate and volume AFTER source is loaded
        audio.playbackRate = playbackRateRef.current;
        audio.volume = volumeRef.current;
      };
      audio.addEventListener("canplay", handleCanPlay);

      await audio.play();
    } catch (error) {
      console.error("[Player] Failed to play:", error);
      dispatch({ type: "SET_ERROR", payload: "Failed to play audio" });
    }
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    try {
      const audio = audioRef.current;
      if (audio) {
        // Ensure playback rate and volume are applied before resuming
        audio.playbackRate = playbackRateRef.current;
        audio.volume = volumeRef.current;
        await audio.play();
      }
    } catch (error) {
      console.error("[Player] Failed to resume:", error);
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    recordSession();
    dispatch({ type: "STOP" });
  }, [recordSession]);

  const seek = useCallback(async (position: number) => {
    if (!state.audiobook || !audioRef.current) return;

    const clampedPosition = Math.max(0, Math.min(position, state.duration));
    const currentPos = fileStartPositionRef.current + audioRef.current.currentTime;

    // Check if seeking within the same file or to a different file
    // We need to reload if seeking to a position outside the current file
    const currentFileEnd = fileStartPositionRef.current + (audioRef.current.duration || 0);
    const needsNewFile = clampedPosition < fileStartPositionRef.current || clampedPosition >= currentFileEnd;

    if (needsNewFile) {
      // Need to load a different file (or position is outside current file bounds)
      dispatch({ type: "SET_LOADING", payload: true });
      const wasPlaying = state.isPlaying;

      // Fetch stream info to get the file start position
      try {
        const response = await fetch(
          `/api/audiobooks/${state.audiobook.id}/stream?position=${Math.floor(clampedPosition)}`,
          { method: "HEAD", credentials: "include" }
        );
        const fileStartPosition = parseInt(response.headers.get("X-File-Start-Position") || "0", 10);
        fileStartPositionRef.current = fileStartPosition;

        // Calculate the offset within the file where we want to start
        const offsetInFile = clampedPosition - fileStartPosition;

        // Load the file from the beginning (no byte offset - let browser handle seeking)
        const streamUrl = `/api/audiobooks/${state.audiobook.id}/stream?position=${Math.floor(fileStartPosition)}`;
        audioRef.current.src = streamUrl;

        // Wait for the audio to be ready, then seek within the file
        const handleCanPlay = () => {
          audioRef.current?.removeEventListener("canplay", handleCanPlay);
          if (audioRef.current && offsetInFile > 0) {
            audioRef.current.currentTime = offsetInFile;
          }
        };
        audioRef.current.addEventListener("canplay", handleCanPlay);

        if (wasPlaying) {
          try {
            await audioRef.current.play();
          } catch (error) {
            console.error("[Player] Failed to play after seek:", error);
          }
        }
      } catch (error) {
        console.error("[Player] Failed to seek:", error);
        dispatch({ type: "SET_LOADING", payload: false });
      }
    } else {
      // Seeking within current file - use native seeking
      const newTime = clampedPosition - fileStartPositionRef.current;
      if (newTime >= 0 && isFinite(newTime)) {
        audioRef.current.currentTime = newTime;
      }
    }

    dispatch({ type: "SET_POSITION", payload: clampedPosition });
    syncProgress(clampedPosition);
  }, [state.audiobook, state.duration, state.isPlaying, syncProgress]);

  const seekRelative = useCallback((delta: number) => {
    seek(state.currentPosition + delta);
  }, [state.currentPosition, seek]);

  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    dispatch({ type: "SET_PLAYBACK_RATE", payload: rate });
    // Persist to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("player-playback-rate", String(rate));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    volumeRef.current = clampedVolume;
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
    dispatch({ type: "SET_VOLUME", payload: clampedVolume });
    // Persist to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("player-volume", String(clampedVolume));
    }
  }, []);

  const nextChapter = useCallback(() => {
    if (!state.audiobook?.chapters || !state.currentChapter) return;

    const sorted = [...state.audiobook.chapters].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = sorted.findIndex((c) => c.id === state.currentChapter?.id);

    if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
      const nextChapterItem = sorted[currentIndex + 1];
      if (nextChapterItem) {
        seek(nextChapterItem.startTime);
      }
    }
  }, [state.audiobook, state.currentChapter, seek]);

  const prevChapter = useCallback(() => {
    if (!state.audiobook?.chapters || !state.currentChapter) return;

    const sorted = [...state.audiobook.chapters].sort((a, b) => a.startTime - b.startTime);
    const currentIndex = sorted.findIndex((c) => c.id === state.currentChapter?.id);

    if (currentIndex > 0) {
      const prevChapterItem = sorted[currentIndex - 1];
      if (prevChapterItem) {
        seek(prevChapterItem.startTime);
      }
    } else if (currentIndex === 0) {
      seek(0);
    }
  }, [state.audiobook, state.currentChapter, seek]);


  const value: PlayerContextValue = {
    ...state,
    play,
    pause,
    resume,
    stop,
    seek,
    seekRelative,
    setPlaybackRate,
    setVolume,
    nextChapter,
    prevChapter,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
