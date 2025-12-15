// Category color mapping - colors that match the "vibe" of each category
export const categoryColors: Record<string, { bg: string; text: string }> = {
  // Action & Adventure
  "Action/Adventure": { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400" },
  "Travel/Adventure": { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400" },

  // Arts & Creative
  "Art": { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400" },
  "Crafts": { bg: "bg-pink-500/15", text: "text-pink-600 dark:text-pink-400" },

  // Biography & History
  "Biographical": { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  "History": { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  "Historical Fiction": { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },

  // Business & Tech
  "Business": { bg: "bg-slate-500/15", text: "text-slate-600 dark:text-slate-400" },
  "Computer/Internet": { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400" },
  "Math/Science/Tech": { bg: "bg-cyan-500/15", text: "text-cyan-600 dark:text-cyan-400" },

  // Crime & Thriller
  "Crime/Thriller": { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400" },
  "True Crime": { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400" },
  "Mystery": { bg: "bg-red-500/15", text: "text-red-600 dark:text-red-400" },

  // Fantasy & Sci-Fi
  "Fantasy": { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400" },
  "Urban Fantasy": { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400" },
  "Science Fiction": { bg: "bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400" },

  // Fiction
  "General Fiction": { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },
  "Literary Classics": { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },

  // Food & Home
  "Food": { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400" },
  "Home/Garden": { bg: "bg-lime-500/15", text: "text-lime-600 dark:text-lime-400" },

  // Horror
  "Horror": { bg: "bg-zinc-500/15", text: "text-zinc-600 dark:text-zinc-400" },

  // Humor
  "Humor": { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400" },

  // Educational
  "Instructional": { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400" },
  "Language": { bg: "bg-teal-500/15", text: "text-teal-600 dark:text-teal-400" },

  // Kids & Young Adult
  "Juvenile": { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400" },
  "Young Adult": { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400" },

  // Medical & Health
  "Medical": { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" },
  "Self-Help": { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" },

  // Nature & Science
  "Nature": { bg: "bg-green-500/15", text: "text-green-600 dark:text-green-400" },

  // Non-Fiction
  "General Non-Fic": { bg: "bg-stone-500/15", text: "text-stone-600 dark:text-stone-400" },
  "General Non-Fiction": { bg: "bg-stone-500/15", text: "text-stone-600 dark:text-stone-400" },

  // Philosophy & Religion
  "Philosophy": { bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-400" },
  "Pol/Soc/Relig": { bg: "bg-violet-500/15", text: "text-violet-600 dark:text-violet-400" },

  // Recreation
  "Recreation": { bg: "bg-sky-500/15", text: "text-sky-600 dark:text-sky-400" },

  // Romance
  "Romance": { bg: "bg-rose-500/15", text: "text-rose-600 dark:text-rose-400" },

  // Western
  "Western": { bg: "bg-amber-600/15", text: "text-amber-700 dark:text-amber-500" },

  // Comics & Graphic Novels
  "Comics/Graphic novels": { bg: "bg-fuchsia-500/15", text: "text-fuchsia-600 dark:text-fuchsia-400" },

  // Magazines
  "Magazines/Newspapers": { bg: "bg-neutral-500/15", text: "text-neutral-600 dark:text-neutral-400" },

  // Mixed & Collections
  "Mixed Collections": { bg: "bg-neutral-500/15", text: "text-neutral-600 dark:text-neutral-400" },

  // Magic
  "Illusion/Magic": { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400" },
};

const defaultCategoryColor = { bg: "bg-gray-500/15", text: "text-gray-600 dark:text-gray-400" };

export function getCategoryColor(category: string): { bg: string; text: string } {
  return categoryColors[category] ?? defaultCategoryColor;
}

export function formatCategoryName(fullCategory: string): string {
  // Split by " - " and take the last part (the actual category name)
  const parts = fullCategory.split(" - ");
  return parts.length > 1 ? (parts[1] ?? fullCategory).trim() : fullCategory.trim();
}
