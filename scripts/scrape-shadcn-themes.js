#!/usr/bin/env node
/**
 * Scrapes themes from shadcnthemer.com and outputs new ones in CompleteTheme format.
 *
 * Usage:
 *   # Install playwright in a temp dir first:
 *   cd /tmp && mkdir -p pw && cd pw && npm init -y && npm install playwright
 *
 *   # Then run from the project root:
 *   node scripts/scrape-shadcn-themes.js
 *
 * Quality filters:
 * - Must have an actual name (not "Untitled", "Fork of...", "Copy of...")
 * - Must have at least MIN_VOTES votes (default 4)
 * - Must have valid light + dark mode CSS with all 31 required variables
 *
 * Output: JSON to stdout with new theme data; progress logs to stderr.
 * The output JSON can be used to generate TypeScript for theme-config.ts.
 */

// Try to load playwright from common locations
let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  try {
    chromium = require('/tmp/pw/node_modules/playwright').chromium;
  } catch {
    try {
      chromium = require('/tmp/theme-extract/node_modules/playwright').chromium;
    } catch {
      console.error('Error: playwright not found. Install it first:');
      console.error('  cd /tmp && mkdir -p pw && cd pw && npm init -y && npm install playwright');
      process.exit(1);
    }
  }
}

const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────

const MIN_VOTES = 4;

const REQUIRED_VARS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive',
  '--border', '--input', '--ring',
  '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5',
  '--sidebar', '--sidebar-foreground', '--sidebar-primary',
  '--sidebar-primary-foreground', '--sidebar-accent', '--sidebar-accent-foreground',
  '--sidebar-border', '--sidebar-ring'
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getExistingThemeValues() {
  // Read theme-config.ts and extract existing theme values
  const configPath = path.resolve(__dirname, '../src/lib/theme-config.ts');
  const content = fs.readFileSync(configPath, 'utf8');
  const matches = content.match(/value:\s*"([^"]+)"/g) || [];
  return new Set(matches.map(m => m.match(/"([^"]+)"/)[1]));
}

function cleanName(name) {
  return name
    .replace(/\s*\((?:by\s+)?tweakcn\)\s*$/i, '')
    .replace(/\s*\(tweakcn\)\s*$/i, '')
    .trim();
}

function nameToValue(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isQualityTheme(name, votes) {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes('untitled')) return false;
  if (lower.startsWith('fork of')) return false;
  if (lower.startsWith('copy of')) return false;
  if (lower.match(/^theme\s*\d*$/)) return false;
  if (lower === 'new theme') return false;
  if (lower === 'test') return false;
  if (votes < MIN_VOTES) return false;
  return true;
}

function parseCssBlock(cssText) {
  const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/);
  const darkMatch = cssText.match(/\.dark\s*\{([^}]+)\}/);
  if (!rootMatch || !darkMatch) return null;

  let borderRadius = '0.625rem';

  function parseVars(block) {
    const vars = {};
    const varPattern = /--([\w-]+)\s*:\s*(.+?)\s*;/g;
    let match;
    while ((match = varPattern.exec(block)) !== null) {
      const [, name, value] = match;
      if (name === 'radius') borderRadius = value;
      else if (!name.startsWith('font-')) vars[`--${name}`] = value;
    }
    return vars;
  }

  const light = parseVars(rootMatch[1]);
  const dark = parseVars(darkMatch[1]);

  // Normalize --sidebar-background -> --sidebar
  for (const colors of [light, dark]) {
    if (colors['--sidebar-background'] && !colors['--sidebar']) {
      colors['--sidebar'] = colors['--sidebar-background'];
      delete colors['--sidebar-background'];
    }
  }

  // Validate required vars
  const missingLight = REQUIRED_VARS.filter(v => !light[v]);
  const missingDark = REQUIRED_VARS.filter(v => !dark[v]);
  if (missingLight.length > 0 || missingDark.length > 0) return null;

  // Build clean output with only known vars
  const cleanLight = {};
  const cleanDark = {};
  for (const v of REQUIRED_VARS) {
    cleanLight[v] = light[v];
    cleanDark[v] = dark[v];
  }
  // Keep --destructive-foreground if present
  if (light['--destructive-foreground']) cleanLight['--destructive-foreground'] = light['--destructive-foreground'];
  if (dark['--destructive-foreground']) cleanDark['--destructive-foreground'] = dark['--destructive-foreground'];

  return { lightColors: cleanLight, darkColors: cleanDark, borderRadius };
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  const existingThemes = getExistingThemeValues();
  console.error(`Existing themes in codebase: ${existingThemes.size}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.error('Visiting shadcnthemer.com...');
    await page.goto('https://shadcnthemer.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Scroll to load all themes (infinite scroll)
    let prevCount = 0;
    for (let i = 0; i < 25; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      const count = await page.evaluate(() => document.querySelectorAll('a[href*="/themes/"]').length);
      console.error(`Scroll ${i + 1}: ${count} theme links`);
      if (count === prevCount) break;
      prevCount = count;
    }

    // Collect theme links with metadata
    const themeLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/themes/"]'));
      return links.map(l => {
        const text = l.textContent?.trim() || '';
        const nameMatch = text.match(/^(.+?)(?:by\s+\S+)?(\d+)$/);
        let name = '', votes = 0;
        if (nameMatch) {
          name = nameMatch[1].replace(/by\s*$/, '').trim();
          votes = parseInt(nameMatch[2], 10);
        } else {
          const parts = text.split(/by\s+/);
          name = parts[0]?.trim() || text;
          const numMatch = text.match(/(\d+)\s*$/);
          votes = numMatch ? parseInt(numMatch[1], 10) : 0;
        }
        return { href: l.href, rawText: text, name, votes };
      });
    });

    console.error(`\nTotal theme links: ${themeLinks.length}`);

    // Filter for quality and deduplicate
    const qualityThemes = themeLinks.filter(t => isQualityTheme(t.name, t.votes));
    console.error(`Quality themes (${MIN_VOTES}+ votes, named): ${qualityThemes.length}`);

    const seenValues = new Set();
    const newThemes = qualityThemes.filter(t => {
      const cleaned = cleanName(t.name);
      const value = nameToValue(cleaned);
      if (existingThemes.has(value) || seenValues.has(value)) return false;
      seenValues.add(value);
      return true;
    });
    console.error(`New themes to process: ${newThemes.length}`);

    // Extract CSS from each new theme
    const results = [];
    for (let i = 0; i < newThemes.length; i++) {
      const theme = newThemes[i];
      const cleanedName = cleanName(theme.name);
      const value = nameToValue(cleanedName);
      console.error(`\n[${i + 1}/${newThemes.length}] "${cleanedName}" (${theme.votes} votes)`);

      try {
        await page.goto(theme.href, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const codeButton = await page.locator(
          'button:has-text("Code"), [role="tab"]:has-text("Code"), a:has-text("Code")'
        ).first();

        if (await codeButton.isVisible({ timeout: 5000 })) {
          await codeButton.click();
          await page.waitForTimeout(1500);

          const cssBlock = await page.evaluate(() => {
            const codeEls = document.querySelectorAll('pre, code');
            for (const el of codeEls) {
              const text = el.textContent?.trim();
              if (text && text.includes(':root') && text.includes('.dark') && text.includes('--background')) {
                return text;
              }
            }
            return null;
          });

          if (cssBlock) {
            const parsed = parseCssBlock(cssBlock);
            if (parsed) {
              results.push({
                name: cleanedName,
                value,
                votes: theme.votes,
                ...parsed
              });
              console.error(`  OK`);
            } else {
              console.error(`  SKIP: missing CSS variables`);
            }
          } else {
            console.error(`  SKIP: no CSS block found`);
          }
        } else {
          console.error(`  SKIP: Code tab not found`);
        }
      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
      }
    }

    // Output results
    const output = {
      scraped_at: new Date().toISOString(),
      total_on_site: themeLinks.length,
      quality_filtered: qualityThemes.length,
      new_themes: results
    };

    console.log(JSON.stringify(output, null, 2));

    console.error(`\n=== DONE ===`);
    console.error(`New themes extracted: ${results.length}`);
    for (const r of results) {
      console.error(`  - "${r.name}" (${r.votes} votes) -> ${r.value}`);
    }

    // Also generate TypeScript snippet
    if (results.length > 0) {
      console.error(`\n=== TypeScript to add to ThemeName type ===`);
      for (const t of results.sort((a, b) => a.value.localeCompare(b.value))) {
        console.error(`  | "${t.value}"`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }
})();
