// Category color mapping — colors that match the "vibe" of a category.
// Matching is keyword-based so it works with whatever category names the
// content request module returns; the first matching rule wins and unmatched
// categories fall back to gray. Rule order matters where keywords overlap
// (e.g. "science fiction" before "science", "non-fic" before "fiction").
interface CategoryColor {
  bg: string;
  text: string;
}

const categoryColorRules: Array<{ pattern: RegExp; color: CategoryColor }> = [
  // Sci-Fi (before the generic science/tech rule)
  {
    pattern: /sci-?fi|science fiction/,
    color: {
      bg: "bg-indigo-500/15",
      text: "text-indigo-600 dark:text-indigo-400",
    },
  },
  // Fantasy & Magic
  {
    pattern: /fantasy|magic|illusion/,
    color: {
      bg: "bg-purple-500/15",
      text: "text-purple-600 dark:text-purple-400",
    },
  },
  // Crime & Thriller
  {
    pattern: /crime|thriller|myster/,
    color: { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400" },
  },
  // Biography & History (before the generic fiction rule so "Historical
  // Fiction" lands here)
  {
    pattern: /biograph|histor/,
    color: {
      bg: "bg-amber-500/15",
      text: "text-amber-600 dark:text-amber-400",
    },
  },
  // Western
  {
    pattern: /western/,
    color: {
      bg: "bg-amber-600/15",
      text: "text-amber-700 dark:text-amber-500",
    },
  },
  // Non-Fiction (before the generic fiction rule)
  {
    pattern: /non-?fic/,
    color: {
      bg: "bg-stone-500/15",
      text: "text-stone-600 dark:text-stone-400",
    },
  },
  // Horror
  {
    pattern: /horror/,
    color: { bg: "bg-zinc-500/15", text: "text-zinc-600 dark:text-zinc-400" },
  },
  // Romance
  {
    pattern: /romance/,
    color: { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400" },
  },
  // Comics & Graphic Novels
  {
    pattern: /comic|graphic novel|manga/,
    color: {
      bg: "bg-fuchsia-500/15",
      text: "text-fuchsia-600 dark:text-fuchsia-400",
    },
  },
  // Kids, Young Adult & Nature
  {
    pattern: /juvenile|young adult|children|kids|nature/,
    color: {
      bg: "bg-green-500/15",
      text: "text-green-600 dark:text-green-400",
    },
  },
  // Medical & Health
  {
    pattern: /medical|health|self-help/,
    color: {
      bg: "bg-emerald-500/15",
      text: "text-emerald-600 dark:text-emerald-400",
    },
  },
  // Humor & Food
  {
    pattern: /humou?r|comedy|food|cook/,
    color: {
      bg: "bg-yellow-500/15",
      text: "text-yellow-600 dark:text-yellow-400",
    },
  },
  // Home & Garden
  {
    pattern: /home|garden/,
    color: { bg: "bg-lime-500/15", text: "text-lime-600 dark:text-lime-400" },
  },
  // Educational
  {
    pattern: /instruction|education|language|learning/,
    color: { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400" },
  },
  // Science & Tech
  {
    pattern: /computer|internet|math|science|tech/,
    color: { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400" },
  },
  // Business & Economics
  {
    pattern: /business|econom|finance/,
    color: {
      bg: "bg-slate-500/15",
      text: "text-slate-600 dark:text-slate-400",
    },
  },
  // Action & Adventure
  {
    pattern: /action|adventur|travel/,
    color: {
      bg: "bg-orange-500/15",
      text: "text-orange-600 dark:text-orange-400",
    },
  },
  // Arts & Creative
  {
    pattern: /\barts?\b|craft/,
    color: { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400" },
  },
  // Philosophy, Politics & Religion
  {
    pattern: /philosoph|politic|relig|society|\bpol\b|\bsoc\b/,
    color: {
      bg: "bg-violet-500/15",
      text: "text-violet-600 dark:text-violet-400",
    },
  },
  // Magazines, Mixed & Collections
  {
    pattern: /magazine|newspaper|mixed|collection/,
    color: {
      bg: "bg-neutral-500/15",
      text: "text-neutral-600 dark:text-neutral-400",
    },
  },
  // Recreation & Sports
  {
    pattern: /recreation|sport|hobby/,
    color: { bg: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-400" },
  },
  // General fiction & classics (last — many category names contain "fiction")
  {
    pattern: /fiction|classic|literary/,
    color: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },
  },
];

const defaultCategoryColor: CategoryColor = {
  bg: "bg-gray-500/15",
  text: "text-gray-600 dark:text-gray-400",
};

export function getCategoryColor(category: string): CategoryColor {
  const name = category.toLowerCase();
  for (const rule of categoryColorRules) {
    if (rule.pattern.test(name)) {
      return rule.color;
    }
  }
  return defaultCategoryColor;
}

export function formatCategoryName(fullCategory: string): string {
  // Modules commonly return "Main - Sub" style names; show just the sub part.
  // Plain names without a separator pass through unchanged.
  const parts = fullCategory.split(" - ");
  return parts.length > 1
    ? (parts[1] ?? fullCategory).trim()
    : fullCategory.trim();
}
