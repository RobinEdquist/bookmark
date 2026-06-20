export interface TrackerLanguage {
  id: number;
  name: string;
}

export const TRACKER_LANGUAGES: TrackerLanguage[] = [
  { id: 1, name: "English" },
  { id: 17, name: "Afrikaans" },
  { id: 32, name: "Arabic" },
  { id: 35, name: "Bengali" },
  { id: 51, name: "Bosnian" },
  { id: 52, name: "Brazilian Portuguese" },
  { id: 18, name: "Bulgarian" },
  { id: 6, name: "Burmese" },
  { id: 44, name: "Cantonese" },
  { id: 55, name: "Castilian Spanish" },
  { id: 19, name: "Catalan" },
  { id: 2, name: "Chinese" },
  { id: 49, name: "Croatian" },
  { id: 20, name: "Czech" },
  { id: 21, name: "Danish" },
  { id: 22, name: "Dutch" },
  { id: 61, name: "Estonian" },
  { id: 39, name: "Farsi" },
  { id: 23, name: "Finnish" },
  { id: 36, name: "French" },
  { id: 37, name: "German" },
  { id: 26, name: "Greek" },
  { id: 59, name: "Greek, Ancient" },
  { id: 3, name: "Gujarati" },
  { id: 27, name: "Hebrew" },
  { id: 8, name: "Hindi" },
  { id: 28, name: "Hungarian" },
  { id: 63, name: "Icelandic" },
  { id: 53, name: "Indonesian" },
  { id: 56, name: "Irish" },
  { id: 43, name: "Italian" },
  { id: 38, name: "Japanese" },
  { id: 12, name: "Javanese" },
  { id: 5, name: "Kannada" },
  { id: 41, name: "Korean" },
  { id: 46, name: "Latin" },
  { id: 62, name: "Latvian" },
  { id: 50, name: "Lithuanian" },
  { id: 33, name: "Malay" },
  { id: 58, name: "Malayalam" },
  { id: 57, name: "Manx" },
  { id: 9, name: "Marathi" },
  { id: 48, name: "Norwegian" },
  { id: 47, name: "Other" },
  { id: 45, name: "Polish" },
  { id: 34, name: "Portuguese" },
  { id: 14, name: "Punjabi" },
  { id: 30, name: "Romanian" },
  { id: 16, name: "Russian" },
  { id: 60, name: "Sanskrit" },
  { id: 24, name: "Scottish Gaelic" },
  { id: 31, name: "Serbian" },
  { id: 54, name: "Slovenian" },
  { id: 4, name: "Spanish" },
  { id: 40, name: "Swedish" },
  { id: 29, name: "Tagalog" },
  { id: 11, name: "Tamil" },
  { id: 10, name: "Telugu" },
  { id: 7, name: "Thai" },
  { id: 42, name: "Turkish" },
  { id: 25, name: "Ukrainian" },
  { id: 15, name: "Urdu" },
  { id: 13, name: "Vietnamese" },
];

// Primary languages shown by default in the UI
export const PRIMARY_LANGUAGE_IDS = [
  1,  // English
  40, // Swedish
  37, // German
  36, // French
  4,  // Spanish
  22, // Dutch
  43, // Italian
  48, // Norwegian
  21, // Danish
  23, // Finnish
  45, // Polish
  16, // Russian
  34, // Portuguese
];

export const PRIMARY_LANGUAGES = TRACKER_LANGUAGES.filter((lang) =>
  PRIMARY_LANGUAGE_IDS.includes(lang.id)
).sort((a, b) => {
  // Sort by the order in PRIMARY_LANGUAGE_IDS
  return PRIMARY_LANGUAGE_IDS.indexOf(a.id) - PRIMARY_LANGUAGE_IDS.indexOf(b.id);
});

export const OTHER_LANGUAGES = TRACKER_LANGUAGES.filter(
  (lang) => !PRIMARY_LANGUAGE_IDS.includes(lang.id)
).sort((a, b) => a.name.localeCompare(b.name));

export const SEARCH_IN_FIELDS = [
  { id: "title", labelKey: "title" },
  { id: "author", labelKey: "author" },
  { id: "narrator", labelKey: "narrator" },
  { id: "series", labelKey: "series" },
  { id: "tags", labelKey: "tags" },
  { id: "description", labelKey: "description" },
] as const;

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
