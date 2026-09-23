`reader.pdf` is an original four-page test document generated with pdf-lib.
Each portrait page contains the text "Left edge. Page N" near its left edge
and "Center text" in the middle, using the standard Helvetica font.
It contains no third-party book content.

The PDF reader tests serve these real bytes through a Playwright route while
using the application reader, authentication, and progress API. This isolates
browser rendering and interaction regressions; it does not test backend file
streaming or the Next.js range proxy.
