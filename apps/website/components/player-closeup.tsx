import { BOOKS, Cover } from "./covers";
import { Check, List, Moon, Play, SkipBack, SkipForward } from "./icons";

const CHAPTERS = [
  { n: 11, title: "The Causeway", time: "38:12", done: true },
  { n: 12, title: "The Long Way Home", time: "24:13", now: true },
  { n: 13, title: "Salt in the Walls", time: "31:40" },
];

/** A blown-up web player bar with its chapter list open. */
export function PlayerCloseup() {
  const book = BOOKS[4]!; // A Theory of Rain
  return (
    <div
      className="player-closeup"
      role="img"
      aria-label="The web player with its chapter list open: chapter twelve is playing, the sleep timer and speed controls sit beside the scrubber"
    >
      <div className="pc-chapters" aria-hidden>
        {CHAPTERS.map((ch) => (
          <div key={ch.n} className={`pc-chapter ${ch.now ? "now" : ""}`}>
            <span className="pc-chapter-n">{ch.n}</span>
            <span className="pc-chapter-title">{ch.title}</span>
            <span className="pc-chapter-time">
              {ch.done ? <Check width="1.1em" height="1.1em" /> : ch.time}
            </span>
          </div>
        ))}
      </div>
      <div className="dm-player" aria-hidden>
        <div className="dm-now">
          <Cover book={book} />
          <div style={{ minWidth: 0 }}>
            <div className="dm-book-title">{book.title}</div>
            <div className="dm-book-meta">Chapter 12 · The Long Way Home</div>
          </div>
        </div>
        <div className="dm-controls">
          <span className="dm-skip">
            <SkipBack />
            <span>15</span>
          </span>
          <span className="dm-play">
            <Play />
          </span>
          <span className="dm-skip">
            <SkipForward />
            <span>30</span>
          </span>
        </div>
        <div className="dm-right">
          <span className="dm-chip">1.25×</span>
          <span className="dm-chip">
            <Moon width="1.1em" height="1.1em" strokeWidth={1.8} style={{ display: "inline", verticalAlign: "-0.15em" }} /> end of chapter
          </span>
          <List width="1.5em" height="1.5em" strokeWidth={1.7} />
        </div>
        <div className="dm-scrub">
          <span>14:32</span>
          <div className="dm-progress">
            <span className="dm-progress-fill" />
          </div>
          <span>-9:41</span>
        </div>
      </div>
    </div>
  );
}
