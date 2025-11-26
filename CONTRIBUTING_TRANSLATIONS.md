# Contributing Translations

Thank you for helping translate Simple Audiobook Vault! This guide explains how to add or improve translations.

## Adding a New Language

1. **Fork the repository** and create a new branch:
   ```bash
   git checkout -b translations/add-<language-code>
   ```

2. **Copy English files** as your starting point:
   ```bash
   cp -r apps/web/messages/en apps/web/messages/<language-code>
   ```

   Use ISO 639-1 language codes (e.g., `de` for German, `fr` for French, `ja` for Japanese).

3. **Translate all JSON files** in your new folder:
   - `common.json` - Buttons, navigation, generic labels
   - `auth.json` - Login and signup forms
   - `settings.json` - Settings page
   - `library.json` - Library browsing

4. **Register the language** in `apps/web/i18n/config.ts`:
   ```typescript
   export const locales = ['en', 'sv', '<your-code>'] as const;
   ```

5. **Add language name** in `apps/web/components/settings/appearance-settings.tsx`:
   ```typescript
   const languageNames: Record<string, string> = {
     en: "English",
     sv: "Svenska",
     '<your-code>': "<Native Name>",
   };
   ```

6. **Test your translations** locally:
   ```bash
   pnpm dev
   ```
   Change language in Settings > Appearance.

7. **Submit a pull request** with your changes.

## Translation Guidelines

### Do's
- Keep the JSON keys exactly as they are (only translate values)
- Preserve placeholders like `{name}`, `{count}` in the translated text
- Use the native name for your language (e.g., "Deutsch" not "German")
- Match the tone of the English text (friendly but professional)

### Don'ts
- Don't translate the app name "Simple Audiobook Vault"
- Don't change JSON structure or add/remove keys
- Don't use machine translation without review
- Don't include extra whitespace or formatting

### Placeholders

Some strings contain placeholders that get replaced with values:

```json
{
  "welcome": "Welcome back, {name}!"
}
```

Keep placeholders in your translation:
```json
{
  "welcome": "Välkommen tillbaka, {name}!"
}
```

## Improving Existing Translations

1. Find the file in `apps/web/messages/<language-code>/`
2. Make your improvements
3. Submit a PR with a clear description of what you changed and why

## Questions?

Open an issue if you have questions about translations or need help getting started.
