# Theme Configuration

This document explains the pleb.school theme system design philosophy and how to configure themes using the `config/theme.json` file.

## Design Philosophy: CSS Variables Over Hardcoded Styles

The pleb.school platform embraces a **CSS variable-driven design system** that prioritizes flexibility and consistency. Our approach is built on these core principles:

### 1. **Use Out-of-the-Box shadcn/ui Components**
We leverage shadcn/ui components as-is, without modifying their core implementations. This ensures:
- Consistency with the shadcn ecosystem
- Easy updates when shadcn releases new versions
- Predictable behavior across the application
- Reduced maintenance burden

### 2. **CSS Variables for All Styling**
Instead of hardcoding colors, spacing, or other design tokens, we use CSS variables that are dynamically set by our theme system:

```css
/* ❌ Avoid hardcoded values */
.component {
  background-color: #3b82f6;
  color: white;
}

/* ✅ Use CSS variables (values are already OKLCh) */
.component {
  background-color: var(--primary);
  color: var(--primary-foreground);
}
```

### 3. **Complete Theme Packages**
Each theme in our system is a **complete design package** that includes:
- **Color Palette**: Primary, secondary, accent, background, foreground, sidebar, and semantic colors (32 CSS variables)
- **Typography**: Font family, weights, and Google Fonts URL
- **Border Radius**: Consistent corner rounding via `borderRadius` property
- **Style Variant**: Default or New York shadcn style
- **Dark Mode Support**: Separate color sets for light and dark modes

### 4. **Minimal Custom Styling**
When creating new components:
- Use shadcn/ui's utility classes (`bg-primary`, `text-foreground`, etc.)
- Leverage the `cn()` utility for conditional classes
- Avoid inline styles or component-specific CSS
- Let the theme system handle all visual styling

### Example: How Components Use the Theme System

```tsx
// ✅ Good: Using theme-aware classes
<Button variant="default" size="lg">
  Click me
</Button>

// ✅ Good: Using cn() with theme classes
<div className={cn(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
  className
)}>
  Content
</div>

// ❌ Bad: Hardcoded styles
<button style={{ backgroundColor: '#3b82f6', color: 'white' }}>
  Click me
</button>
```

## How the Theme System Works

### 1. **Theme Configuration** (`src/lib/theme-config.ts`)
Contains 64 complete theme definitions, each with:
- Light and dark color schemes (32 OKLCh color variables each)
- Associated font configuration with Google Fonts URL
- Border radius preference
- Style variant (default or new-york)

### 2. **Theme UI Configuration** (`src/lib/theme-ui-config.ts`)
Reads `config/theme.json` and provides helper functions:
- `shouldShowThemeSelector()` - Whether to show theme dropdown
- `shouldShowFontToggle()` - Whether to show font selector
- `shouldShowThemeToggle()` - Whether to show dark/light toggle
- `getDefaultTheme()`, `getDefaultFont()`, `getDefaultDarkMode()` - Default values
- Validation helpers for configured values

### 3. **Theme Context** (`src/contexts/theme-context.tsx`)
Manages theme state and applies CSS variables:
- Reads user preferences from localStorage
- Applies theme configuration from `config/theme.json`
- Updates CSS variables on the `:root` element via `applyCompleteTheme()`
- Handles font overrides and dark mode toggling

### 4. **CSS Variable Application** (`src/app/globals.css`)
Defines the CSS variable structure with OKLCh color space:
```css
:root {
  --font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  /* ... 32 color variables total */
}
```

### 5. **Component Integration**
All shadcn/ui components automatically use these CSS variables:
- Buttons use `bg-primary` and `text-primary-foreground`
- Cards use `bg-card` and `border-border`
- Inputs use `bg-background` and `border-input`
- Sidebars use `bg-sidebar` and `text-sidebar-foreground`
- No component knows about specific color values

## Theme Application Flow

The `applyCompleteTheme()` function in `src/lib/theme-config.ts` handles theme application:

```typescript
export function applyCompleteTheme(theme: CompleteTheme, isDark: boolean, fontOverride?: string | null) {
  const root = document.documentElement
  const colors = isDark ? theme.darkColors : theme.lightColors

  // 1. Apply all 32 color CSS variables
  Object.entries(colors).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })

  // 2. Apply border radius from theme's borderRadius property
  root.style.setProperty('--radius', theme.borderRadius)

  // 3. Look up font family from config (not raw value)
  const fontConfig = fontOverride ? availableFonts.find(f => f.value === fontOverride) : null
  const fontToUse = fontConfig?.fontFamily || theme.fontFamily
  const fontWeight = fontConfig?.fontWeight || theme.fontWeight
  const googleFontUrl = fontConfig?.googleFontUrl || theme.googleFontUrl

  // 4. Apply font family as CSS variable AND to body
  root.style.setProperty('--font-family', fontToUse)
  document.body.style.fontFamily = fontToUse
  document.body.style.fontWeight = fontWeight

  // 5. Load Google Font if needed via dynamic <link> injection
  if (googleFontUrl) {
    loadGoogleFont(googleFontUrl)
  }
}
```

## CSS Variables Reference

### Color Variables (32 total, set for both light and dark modes)

**Core Colors:**
- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`

**Chart Colors:**
- `--chart-1`, `--chart-2`, `--chart-3`, `--chart-4`, `--chart-5`

**Sidebar Colors:**
- `--sidebar`, `--sidebar-foreground`
- `--sidebar-primary`, `--sidebar-primary-foreground`
- `--sidebar-accent`, `--sidebar-accent-foreground`
- `--sidebar-border`, `--sidebar-ring`

**Layout Variables:**
- `--radius` (set from theme's `borderRadius` property)
- `--font-family` (set at runtime from theme or font override)

## Benefits of This Approach

1. **Consistency**: All components share the same design tokens
2. **Flexibility**: Switch between 64 themes instantly
3. **Maintainability**: Update colors in one place, affect entire app
4. **Performance**: CSS variables are highly optimized by browsers
5. **Accessibility**: Centralized tokens make contrast auditing possible (not automatically enforced)
6. **User Preference**: Respects system dark mode and user choices
7. **No Build-Time Overhead**: Themes switch at runtime without rebuilds

## Best Practices for Theme-Aware Development

### 1. **Component Creation Guidelines**

When creating new components, follow these patterns:

```tsx
// ✅ GOOD: Theme-aware component
export function FeatureCard({ title, description, className }: Props) {
  return (
    <Card className={cn("p-6", className)}>
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

// ❌ BAD: Hardcoded styles
export function FeatureCard({ title, description }: Props) {
  return (
    <div style={{
      backgroundColor: '#f3f4f6',
      padding: '24px',
      borderRadius: '8px'
    }}>
      <h3 style={{ color: '#1f2937', fontSize: '24px' }}>{title}</h3>
      <p style={{ color: '#6b7280' }}>{description}</p>
    </div>
  )
}
```

### 2. **Dark Mode Considerations**

Themes automatically handle dark mode, but keep these in mind:

```tsx
// ✅ GOOD: Let the theme system handle dark mode
<Card className="bg-card text-card-foreground">
  Content automatically adapts
</Card>

// ❌ BAD: Manual dark mode classes
<Card className="bg-white dark:bg-gray-800 text-black dark:text-white">
  Manually handling dark mode
</Card>
```

## Theme System Architecture

### File Structure
```
config/
  └── theme.json              # User configuration (UI visibility + defaults)
src/
  ├── lib/
  │   ├── theme-config.ts     # 64 theme definitions + applyCompleteTheme()
  │   ├── theme-ui-config.ts  # Config reader + validation helpers
  │   └── utils.ts            # cn() utility
  ├── contexts/
  │   └── theme-context.tsx   # Theme state management + ThemeColorProvider
  └── app/
      └── globals.css         # CSS variable definitions + Tailwind mappings
```

### Complete Theme Structure

Each theme in `src/lib/theme-config.ts` has this structure:

```typescript
interface CompleteTheme {
  name: string                              // Display name (e.g., "Amber Minimal")
  value: ThemeName                          // Unique identifier (e.g., "amber-minimal")
  description: string                       // Short description
  fontFamily: string                        // CSS font family stack
  fontWeight: string                        // Default font weight (usually "400")
  googleFontUrl?: string                    // Optional Google Fonts URL
  borderRadius: string                      // Border radius (e.g., "0.375rem")
  style: "default" | "new-york"             // Visual style preset
  lightColors: Record<string, string>       // 32 CSS color variables for light mode
  darkColors: Record<string, string>        // 32 CSS color variables for dark mode
}
```

## Configuration File Location

The theme configuration is located at: `config/theme.json`

## Configuration Options

### UI Controls (`ui`)

Control which theme/font controls are visible in the header:

```json
{
  "ui": {
    "showThemeSelector": true,    // Show theme selector dropdown
    "showFontToggle": true,       // Show font override toggle
    "showThemeToggle": true       // Show dark/light mode toggle
  }
}
```

### Default Values (`defaults`)

Set default theme, font, or dark mode settings:

```json
{
  "defaults": {
    "theme": null,      // Default theme (or null for user choice)
    "font": null,       // Default font (or null for theme default)
    "darkMode": null    // Default dark/light mode (or null for system preference)
  }
}
```

## Available Themes (66 total)

You can set `defaults.theme` to any of these values (from `completeThemes` in `src/lib/theme-config.ts`):

`amber-minimal`, `amethyst`, `amethyst-haze`, `astral`, `blaze`, `blue`, `bold-tech`, `bubblegum`, `caffeine`, `calypso`, `candyland`, `canvas`, `catppuccin`, `citrus`, `claude`, `claymorphism`, `clean-slate`, `cosmic-night`, `cyberpunk`, `default`, `doom64`, `elegant-luxury`, `emerald`, `forest`, `graphite`, `gray`, `green`, `miami`, `midnight-bloom`, `mocha-mousse`, `modern-minimal`, `mono`, `nature`, `neo-brutalism`, `neutral`, `northern-lights`, `notebook`, `ocean-breeze`, `orange`, `perpetuity`, `quick-pink`, `razzmatazz`, `red`, `retro-arcade`, `rose`, `santa-fe`, `sky`, `slate`, `soft-pop`, `solar`, `solar-dusk`, `spooky`, `spring-bouquet`, `starry-night`, `stone`, `sunset-horizon`, `supabase`, `twitter`, `typewriter`, `underground`, `vercel`, `violet`, `violet-bloom`, `xanadu`, `yellow`, `zinc`.

Descriptions live inline in `src/lib/theme-config.ts`.

## Available Fonts (24 total)

You can set `defaults.font` to any of these font values:

### Sans-Serif Fonts
- `"system"` - System default fonts (no Google Fonts loading)
- `"inter"` - Inter (clean, modern)
- `"roboto"` - Google Roboto
- `"poppins"` - Poppins (friendly, rounded)
- `"source-sans"` - Source Sans Pro
- `"ibm-plex"` - IBM Plex Sans
- `"nunito"` - Nunito (soft, friendly)
- `"comfortaa"` - Comfortaa (rounded)
- `"orbitron"` - Orbitron (futuristic)
- `"space-grotesk"` - Space Grotesk (modern geometric)
- `"open-sans"` - Open Sans (readable)
- `"quicksand"` - Quicksand (friendly, light)
- `"raleway"` - Raleway (elegant)

### Serif Fonts
- `"playfair"` - Playfair Display (elegant)
- `"georgia"` - Georgia (classic, no Google Fonts loading)
- `"crimson"` - Crimson Text (readable)
- `"lora"` - Lora (friendly serif)
- `"merriweather"` - Merriweather (readable)
- `"libre-baskerville"` - Libre Baskerville (classic)

### Monospace Fonts
- `"jetbrains"` - JetBrains Mono (coding)
- `"fira"` - Fira Code (coding with ligatures)
- `"system-mono"` - System monospace (no Google Fonts loading)
- `"space-mono"` - Space Mono (retro coding)
- `"press-start"` - Press Start 2P (retro gaming)

## Dark Mode Options

You can set `defaults.darkMode` to:

- `true` - Force dark mode
- `false` - Force light mode
- `null` - Use system preference or user choice (default)

## Configuration Examples

### Hide All Theme Controls
```json
{
  "ui": {
    "showThemeSelector": false,
    "showFontToggle": false,
    "showThemeToggle": false
  }
}
```

### Force Dark Cosmic Theme
```json
{
  "defaults": {
    "theme": "cosmic-night",
    "darkMode": true
  }
}
```

### Force Inter Font Only
```json
{
  "ui": {
    "showFontToggle": false
  },
  "defaults": {
    "font": "inter"
  }
}
```

### Complete Corporate Setup
```json
{
  "ui": {
    "showThemeSelector": false,
    "showFontToggle": false,
    "showThemeToggle": true
  },
  "defaults": {
    "theme": "modern-minimal",
    "font": "inter"
  }
}
```

## Precedence Order

1. **User localStorage** (if saved from previous selection) - highest priority
2. **Config defaults** (from `config/theme.json`)
3. **Theme defaults** (each theme's built-in font)
4. **System/library defaults** - lowest priority

This allows users to customize their experience while still respecting config defaults for first-time visitors.

## How It Works

1. **UI Controls**: The header component reads `config/theme.json` via `theme-ui-config.ts` to determine which toggles to show
2. **Default Values**: The theme context uses `defaults` from config to set initial values on first load
3. **User Preferences**: User selections are saved to localStorage (`complete-theme`, `font-override`) and will override defaults on subsequent visits
4. **Theme Packages**: Each theme includes its own default font, but `defaults.font` can override this
5. **Dark Mode**: Uses `next-themes` with `defaults.darkMode` to set initial preference
6. **Font Loading**: Google Fonts are loaded dynamically via `<link>` tag injection when a theme or font override requires them

## Summary: The pleb.school Theme Philosophy

The pleb.school theme system represents a modern approach to application theming that prioritizes:

### **Developer Experience**
- Write components once, support 64 themes automatically
- No need to think about colors when building features
- Consistent patterns across the entire codebase
- Easy onboarding for developers familiar with shadcn/ui

### **User Experience**
- Instant theme switching without page reloads
- Respect for system preferences and accessibility needs
- Consistent visual language across all components
- Beautiful, professional themes curated from the shadcn community

### **Maintainability**
- Single source of truth for design tokens
- No scattered color values throughout the codebase
- Easy to add new themes without touching components
- Updates to shadcn/ui components work seamlessly

### **The Golden Rule**
**"Components should describe *what* they are, not *how* they look."**

By following this principle and leveraging CSS variables through our theme system, we ensure that the pleb.school platform remains flexible, maintainable, and beautiful across all themes.

## Quick Reference

### Do's
- Use shadcn/ui components directly
- Apply theme utilities: `bg-primary`, `text-foreground`, `bg-sidebar`, etc.
- Leverage the `cn()` utility for conditional classes
- Let CSS variables handle all colors
- Use semantic color names for meaning
- Trust the theme system for dark mode

### Don'ts
- Never hardcode hex/rgb/oklch color values
- Avoid inline styles
- Don't create component-specific color classes
- Never manually handle dark mode with `dark:` prefixes
- Don't override shadcn component internals
- Don't put `--radius` in theme color objects (use `borderRadius` property instead)

Remember: The theme system is your friend. Trust it, and it will ensure your components look great in every theme!

## Related Documentation

- [config-system.md](./config-system.md) - Config system overview
- [config/README.md](./config/) - Deep-dive config documentation index
