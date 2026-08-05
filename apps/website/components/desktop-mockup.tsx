import { BOOKS, Cover } from "./covers";
import {
  Airplay,
  BookImage,
  BookOpen,
  Goodreads,
  Headphones,
  Home,
  LayoutGrid,
  List,
  ListMusic,
  Moon,
  Play,
  Shelf,
  SkipBack,
  SkipForward,
  Smartphone,
  TabletSmartphone,
  Trophy,
  Volume,
} from "./icons";

interface NavItem {
  label: string;
  icon: typeof Home;
  active?: boolean;
}

/* Mirrors the real sidebar (apps/web/components/layout/sidebar.tsx):
   Home, then the Library / Discover / Devices & Apps sections. */
const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  {
    items: [{ label: "Home", icon: Home, active: true }],
  },
  {
    title: "Library",
    items: [
      { label: "Audiobooks", icon: Headphones },
      { label: "Ebooks", icon: BookOpen },
      { label: "Comics", icon: BookImage },
      { label: "Series", icon: Shelf },
      { label: "Genres", icon: LayoutGrid },
    ],
  },
  {
    title: "Discover",
    items: [
      { label: "Lists", icon: ListMusic },
      { label: "Top List", icon: Trophy },
    ],
  },
  {
    title: "Devices & Apps",
    items: [
      { label: "Audiobook App", icon: Smartphone },
      { label: "E-Reader", icon: TabletSmartphone },
    ],
  },
];

/* Continue Listening: cover cards with a progress bar on the cover,
   like ContinueListeningCard. Partial row reads as a scroll row. */
const CONTINUE = [
  { book: BOOKS[4]!, left: "9h 41m left", p: "42%" },
  { book: BOOKS[0]!, left: "2h 08m left", p: "78%" },
  { book: BOOKS[6]!, left: "12h 30m left", p: "11%" },
  { book: BOOKS[2]!, left: "5h 55m left", p: "63%" },
];

/* Recently Added: the real AudiobookCard shows a Goodreads rating line
   above the title when a book is linked. */
const RECENT: {
  book: (typeof BOOKS)[number];
  rating: string;
  count: string;
}[] = [
  { book: BOOKS[0]!, rating: "4.32", count: "12,410" },
  { book: BOOKS[1]!, rating: "3.98", count: "8,102" },
  { book: BOOKS[2]!, rating: "4.11", count: "23,867" },
  { book: BOOKS[3]!, rating: "4.56", count: "5,340" },
  { book: BOOKS[4]!, rating: "4.02", count: "31,559" },
  { book: BOOKS[5]!, rating: "4.27", count: "2,981" },
];

export function DesktopMockup() {
  return (
    <div
      className="desktop-mockup"
      aria-label="The Bookmark web app: library home with the player bar at the bottom"
    >
      <div className="dm-chrome" aria-hidden>
        <span className="dm-dot" />
        <span className="dm-dot" />
        <span className="dm-dot" />
        <span className="dm-url">bookmark.yourhome.net</span>
      </div>
      <div className="dm-body" aria-hidden>
        <aside className="dm-sidebar">
          <span className="dm-logo">Bookmark</span>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title ?? gi} className="dm-nav-group">
              {group.title && (
                <span className="dm-nav-label">{group.title}</span>
              )}
              {group.items.map(({ label, icon: Icon, active }) => (
                <span
                  key={label}
                  className={`dm-nav-item ${active ? "active" : ""}`}
                >
                  <Icon />
                  {label}
                </span>
              ))}
            </div>
          ))}
        </aside>

        <div className="dm-main">
          <div className="dm-h2">Continue Listening</div>
          <div className="dm-grid">
            {CONTINUE.map(({ book, left, p }) => (
              <figure key={book.title}>
                <span className="dm-cc-cover">
                  <Cover book={book} />
                  <span className="dm-cc-bar">
                    <i style={{ width: p }} />
                  </span>
                </span>
                <figcaption>
                  <div className="dm-book-title">{book.title}</div>
                  <div className="dm-book-meta">{left}</div>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="dm-h2">Recently Added</div>
          <div className="dm-grid">
            {RECENT.map(({ book, rating, count }) => (
              <figure key={book.title}>
                <Cover book={book} />
                <figcaption>
                  <div className="dm-rating">
                    <Goodreads />
                    {rating} ({count})
                  </div>
                  <div className="dm-book-title">{book.title}</div>
                  <div className="dm-book-meta">{book.author}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="dm-player">
          <div className="dm-now">
            <Cover book={BOOKS[4]!} />
            <div style={{ minWidth: 0 }}>
              <div className="dm-book-title">A Theory of Rain</div>
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
            <Moon width="1.5em" height="1.5em" strokeWidth={1.7} />
            <List width="1.5em" height="1.5em" strokeWidth={1.7} />
            <Airplay width="1.5em" height="1.5em" strokeWidth={1.7} />
            <Volume width="1.5em" height="1.5em" strokeWidth={1.7} />
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
    </div>
  );
}
