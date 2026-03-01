# Scripts

## scrape-shadcn-themes.js

Scrapes themes from [shadcnthemer.com](https://shadcnthemer.com/) and identifies new high-quality themes not yet in our codebase.

### What it does

1. Visits shadcnthemer.com and scrolls through all available themes
2. Filters for quality: must have a real name (no "Untitled", "Fork of...", "Copy of...") and at least 4 votes
3. Normalizes names (strips "(tweakcn)" suffixes) and deduplicates against existing themes in `src/lib/theme-config.ts`
4. Visits each new theme's page, clicks the "Code" tab, and extracts the full CSS variables (light + dark mode)
5. Outputs JSON with the new theme data to stdout

### Prerequisites

Playwright must be installed somewhere Node can find it:

```bash
cd /tmp && mkdir -p pw && cd pw && npm init -y && npm install playwright
```

### Usage

```bash
# From project root
node scripts/scrape-shadcn-themes.js

# Save output to a file
node scripts/scrape-shadcn-themes.js > new-themes.json 2>scrape.log
```

Progress logs go to stderr. The JSON output on stdout contains the new theme data, which can then be used to add entries to `src/lib/theme-config.ts` (both the `ThemeName` type union and the `completeThemes` array).

### Output format

```json
{
  "scraped_at": "2026-02-28T...",
  "total_on_site": 336,
  "quality_filtered": 15,
  "new_themes": [
    {
      "name": "Theme Name",
      "value": "theme-name",
      "votes": 5,
      "lightColors": { "--background": "oklch(...)", ... },
      "darkColors": { "--background": "oklch(...)", ... },
      "borderRadius": "0.625rem"
    }
  ]
}
```
