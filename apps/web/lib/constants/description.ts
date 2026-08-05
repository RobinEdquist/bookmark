/**
 * Height, in px, that a collapsed detail-page description is clipped to.
 *
 * The audiobook, ebook, and comic-series detail pages all render the same
 * expand/collapse description block, and the value is both the CSS max-height
 * and the threshold that decides whether the "show more" affordances appear —
 * so the two must not drift apart.
 */
export const COLLAPSED_DESCRIPTION_HEIGHT = 200;
