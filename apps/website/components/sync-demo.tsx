import { BOOKS, Cover } from "./covers";

/**
 * Pause on the phone, pick up on the web: the position chip travels
 * between devices on a loop. Pure CSS; static (already in sync) under
 * prefers-reduced-motion.
 */
export function SyncDemo() {
  const book = BOOKS[4]!; // A Theory of Rain
  return (
    <div
      className="sync-demo"
      role="img"
      aria-label="Playback position syncing from the phone app to the web player: both show the same timestamp"
    >
      <div className="sync-device sync-phone" aria-hidden>
        <div className="sync-device-label">
          <span className="dot" />
          iPhone · in your pocket
        </div>
        <div className="sync-row">
          <Cover book={book} />
          <div>
            <div className="sync-title">{book.title}</div>
            <div className="sync-meta">Chapter 12 · The Long Way Home</div>
          </div>
        </div>
        <div className="sync-bar">
          <span className="sync-fill" />
        </div>
        <div className="sync-time">
          <span>paused at 14:32</span>
          <span>-9:41</span>
        </div>
      </div>

      <div className="sync-beam" aria-hidden>
        <span className="sync-chip">14:32</span>
      </div>

      <div className="sync-device sync-web" aria-hidden>
        <div className="sync-device-label">
          <span className="dot" />
          Web · at your desk
        </div>
        <div className="sync-row">
          <Cover book={book} />
          <div>
            <div className="sync-title">{book.title}</div>
            <div className="sync-meta">Chapter 12 · The Long Way Home</div>
          </div>
        </div>
        <div className="sync-bar">
          <span className="sync-fill" />
        </div>
        <div className="sync-time">
          <span>picks up at 14:32</span>
          <span>-9:41</span>
        </div>
      </div>
    </div>
  );
}
