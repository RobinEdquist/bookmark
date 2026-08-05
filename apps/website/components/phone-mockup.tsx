import type { CSSProperties } from "react";
import { BOOKS, Cover } from "./covers";
import {
  Airplay,
  BooksVertical,
  Headphones,
  List,
  Magnifier,
  PersonCircle,
  Play,
  SkipBack,
  SkipForward,
  SortArrows,
  Star,
} from "./icons";

/*
 * Both screens are rebuilt 1:1 from the iOS app's SwiftUI sources
 * (Features/Player/NowPlayingView.swift, Features/Library/Books/
 * BooksGridCell.swift, DesignSystem/Tokens). Sizes are pt × 0.06em.
 */

function StatusBar() {
  return (
    <div className="pm-statusbar" aria-hidden>
      <span>21:47</span>
      <span className="pm-island" />
      <svg
        viewBox="0 0 24 12"
        width="2.2em"
        height="1.1em"
        fill="currentColor"
        aria-hidden
      >
        <rect
          x="0"
          y="1"
          width="19"
          height="10"
          rx="3"
          fill="none"
          stroke="currentColor"
          opacity="0.5"
        />
        <rect x="2" y="3" width="13" height="6" rx="1.5" />
        <rect x="20.5" y="4" width="2" height="4" rx="1" opacity="0.5" />
      </svg>
    </div>
  );
}

/** NowPlayingView: Done pill, hero cover, title block, chapter scope, slider, transport, badges. */
export function PhonePlayer({ className }: { className?: string }) {
  const book = BOOKS[1]!; // Salt & Starlight
  return (
    <div
      className={`phone-mockup ${className ?? ""}`}
      aria-label="The native app's now-playing screen with cover-tinted cinematic background"
    >
      <div
        className="pm-screen"
        style={
          {
            "--pc1": "oklch(42% 0.13 300 / 0.6)",
            "--pc2": "oklch(40% 0.1 250 / 0.45)",
            "--pc3": "oklch(35% 0.12 340 / 0.3)",
          } as CSSProperties
        }
        aria-hidden
      >
        <StatusBar />
        <div className="pp-top">
          <span className="pp-done">Done</span>
        </div>
        <div className="pp-cover">
          <Cover book={book} />
        </div>
        <div className="pp-titles">
          <div className="pp-title">{book.title}</div>
          <div className="pp-author">{book.author}</div>
        </div>
        <div className="pp-scope">
          <div className="pp-chapter">Ch 9 · The Sound of Snow</div>
          <div className="pp-scope-toggle">
            <b>Chapter</b>
            <i>/</i>
            <span>Book</span>
          </div>
        </div>
        <div className="pp-slider">
          <span className="pp-slider-fill" />
          <span className="pp-knob" />
        </div>
        <div className="pp-meta">
          <span>12:04 played</span>
          <span>21:38 left in chapter</span>
        </div>
        <div className="pp-transport">
          <span className="pp-skip">
            <SkipBack />
            <span>15</span>
          </span>
          <span className="pp-play">
            <Play />
          </span>
          <span className="pp-skip">
            <SkipForward />
            <span>30</span>
          </span>
        </div>
        <div className="pp-badges">
          <span className="pp-badge">
            <b>1.25×</b>
            <small>Speed</small>
          </span>
          <span className="pp-badge">
            <b>End</b>
            <small>Sleep</small>
          </span>
          <span className="pp-badge">
            <b>24</b>
            <small>Chapters</small>
          </span>
          <span className="pp-badge">
            <b>
              <Airplay width="1.5em" height="1.5em" strokeWidth={1.9} />
            </b>
            <small>Output</small>
          </span>
        </div>
        <div className="pm-home" />
      </div>
    </div>
  );
}

const SHELF: { book: (typeof BOOKS)[number]; rating: string }[] = [
  { book: BOOKS[2]!, rating: "4.3" },
  { book: BOOKS[3]!, rating: "3.9" },
  { book: BOOKS[7]!, rating: "4.1" },
  { book: BOOKS[8]!, rating: "4.6" },
];

/* TabShell.swift: three tabs, selected tint is Ink.primary (near-white). */
const TABS: { label: string; icon: typeof Headphones; active?: boolean }[] = [
  { label: "Library", icon: BooksVertical, active: true },
  { label: "Listen", icon: Headphones },
  { label: "Profile", icon: PersonCircle },
];

/** LibraryView: compact header with sort/layout, facet chips + search pill, 2-col grid, 3-tab bar. */
export function PhoneLibrary({ className }: { className?: string }) {
  return (
    <div
      className={`phone-mockup ${className ?? ""}`}
      aria-label="The native app's library screen: downloaded books with community ratings"
    >
      <div
        className="pm-screen"
        style={
          {
            "--pc1": "oklch(35% 0.1 340 / 0.45)",
            "--pc2": "oklch(33% 0.09 250 / 0.35)",
            "--pc3": "oklch(30% 0.08 300 / 0.3)",
          } as CSSProperties
        }
        aria-hidden
      >
        <StatusBar />
        <div className="pl-header">
          <span className="pl-title">Library</span>
          <span className="pl-header-icons">
            <SortArrows />
            <List />
          </span>
        </div>
        <div className="pl-facets">
          <span className="pl-chip active">Books</span>
          <span className="pl-chip">Genres</span>
          <span className="pl-chip">Lists</span>
          <span className="pl-chip pl-chip-search">
            <Magnifier />
          </span>
        </div>
        <div className="pl-grid">
          {SHELF.map(({ book, rating }) => (
            <figure key={book.title}>
              <Cover book={book} />
              <figcaption>
                <div className="pl-book-title">{book.title}</div>
                <div className="pl-book-meta">
                  <span className="pl-author">{book.author}</span>
                  <span className="pl-rating">
                    <Star width="0.9em" height="0.9em" />
                    {rating}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="pl-tabbar">
          {TABS.map(({ label, icon: Icon, active }) => (
            <span key={label} className={`pl-tab ${active ? "active" : ""}`}>
              <Icon />
              {label}
            </span>
          ))}
        </div>
        <div className="pm-home" />
      </div>
    </div>
  );
}
