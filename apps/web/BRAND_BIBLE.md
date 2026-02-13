# SoundHaus Brand Bible

**Version 1.2** - Updated January 2026
**Design Philosophy**: "Balanced Luminosity" - Zinc foundation with strategic electric blue accents

---

## Visual Identity

### Brand Concept
SoundHaus blends **professional neutrality** with **electric energy**. Our visual language uses a zinc gray foundation for structure and readability, with strategic electric blue accents that draw attention to interactive moments and brand touchpoints. The result is sophisticated, approachable, and memorable.

### Design Tone
- **Balanced**: Zinc grays provide calm foundation, electric blue creates moments of energy
- **Strategic**: Brand colors appear on CTAs, hover states, active states, and key stats
- **Approachable**: Not overwhelming - the design breathes and guides the eye naturally
- **Professional**: Maintains readability and usability while expressing brand personality

---

## Color Palette

### Primary Colors (Foundation)

#### Zinc Neutrals - Primary Palette
```
Zinc-900: #18181B
- Primary background
- Foundation for all main pages

Zinc-800: #27272A
- Secondary backgrounds
- Used for: Cards, inactive buttons, hover backgrounds, placeholder blocks

Zinc-700: #3F3F46
- Tertiary backgrounds
- Used for: Input borders, tertiary elements

Zinc-400: #A1A1AA
- Secondary text
- Used for: Descriptions, metadata, helper text

Zinc-300: #D4D4D8
- Tertiary text
- Used for: Subtle nav links

Zinc-100: #F4F4F5
- Primary text
- High contrast headings and body text
```

### Accent Colors (Electric Blue Family)

#### Electric Blue - Brand Accents
```
Primary Electric Blue: #A7C7E7 (glass-blue-400)
- **Strategic use only**
- Used for: Primary button, text hover states on headings/links, "Asynchronously" hero text
- Glow effect: 0 0 20px rgba(167, 199, 231, 0.4)

Cyan Accent: #9BBFE6 (glass-cyan-500)
- **Strategic use only**
- Used for: Stats and metadata (⭐, 🎵, 👥 numbers)
- Creates visual hierarchy for numbers/data

Electric Blue 500: rgba(167, 199, 231, 0.4)
- **Hover state accent**
- Used for: Card border hovers, input focus states
- Creates subtle glow on hover

Highlight Blue: #CFE6FF
- **Rare use**
- Reserved for: Focus rings, shimmer effects in primary button
```

---

## Typography

### Hierarchy
- **Display/Headers**: Bold weight, subtle blue-tinted glow on key headings
  - H1: `text-shadow: 0 0 30px rgba(207, 230, 255, 0.2)`
  - Logo: `text-shadow: 0 0 20px rgba(167, 199, 231, 0.3)`

- **Body Text**: Regular weight, soft-white color for readability
- **Accents**: glass-blue-400 for links and interactive text

### Best Practices
- Use text shadows sparingly on key brand moments (hero headlines, logo)
- Maintain WCAG AA contrast ratios for body text
- Blue-tinted text should be reserved for interactive elements and emphasis

---

## Component Patterns

### Buttons

#### Primary Button (.btn.btn-primary)
- **Background**: Chromatic gradient (135deg, #A7C7E7 → #9BBFE6 → #A7C7E7)
- **Glow**: Multi-layer chromatic glow creating depth and energy
- **Hover**: Darker gradient with intensified glow
- **Shimmer**: Iridescent overlay on hover
- **Use Case**: PRIMARY ACTIONS ONLY - Sign up, Create Repository, Explore Projects, active filter buttons
- **Philosophy**: This is the ONLY place we use full electric blue background - makes CTAs unmissable

#### Secondary Button
- **Background**: Zinc-800
- **Text**: Zinc-100
- **Hover**: Zinc-700
- **Use Case**: Inactive filter buttons, secondary actions in button groups
- **Philosophy**: Neutral, blends with zinc foundation

#### Tertiary Button
- **Background**: Transparent
- **Border**: border-zinc-700
- **Text**: Zinc-100
- **Hover**: bg-zinc-800
- **Use Case**: Settings, cancel, low-priority actions in list view

### Cards

#### Standard Card Pattern
- **Background**: Transparent (inherits zinc-900)
- **Border**: border-zinc-800 (default state)
- **Padding**: p-6
- **Hover State**:
  - Border: `border-glass-blue-500/40` (electric blue emerges)
  - Background: `bg-zinc-800/50`
  - Glow: `box-shadow: 0 0 20px rgba(167, 199, 231, 0.12)` (subtle blue halo)
- **Use Case**: Repository cards, feature cards, quick link cards
- **Philosophy**: Zinc structure, blue energy on interaction

### Inputs

#### Search/Text Input
- **Background**: bg-zinc-800
- **Border**: border-zinc-700
- **Text**: text-zinc-100
- **Placeholder**: text-zinc-400
- **Focus State**:
  - Border: `border-glass-blue-500`
  - Ring: `ring-1 ring-glass-blue-500`
- **Use Case**: Search bars, form inputs
- **Philosophy**: Electric blue appears only on focus - guides user attention

### Navigation

#### Nav Bar
- **Background**: Transparent (inherits zinc-900)
- **Border**: border-zinc-800 (bottom)
- **Logo**:
  - Color: zinc-100 (default)
  - Hover: glass-blue-400
  - Glow: `text-shadow: 0 0 20px rgba(167, 199, 231, 0.3)` (always present - brand moment)
- **Nav Links**:
  - Default: text-zinc-300 or text-zinc-400
  - Hover: hover:bg-zinc-800 hover:text-glass-blue-400
- **Philosophy**: Subtle zinc foundation with blue accents on interaction

---

## Interactive States

### Hover Effects - The Magic Moment
- **Cards**:
  - Border: zinc-800 → glass-blue-500/40
  - Background: transparent → zinc-800/50
  - Glow: None → `0 0 20px rgba(167, 199, 231, 0.12)`
  - Heading: zinc-100 → glass-blue-400
- **Nav Links**:
  - Text: zinc-300 → glass-blue-400
  - Background: transparent → zinc-800
- **Duration**: 300ms for all transitions

### Active States
- **Buttons**: Active buttons use `.btn.btn-primary` (electric blue gradient)
- **Inactive Buttons**: Use zinc-800 background
- **Philosophy**: Electric blue = active/selected, Zinc = inactive/default

### Focus States
- **Input Focus**:
  - Border: glass-blue-500
  - Ring: 1px ring-glass-blue-500
- **Button Focus**:
  - Ring: 2px ring-glass-blue-500
  - Ring offset: 2px with zinc-900 offset color
- **Philosophy**: Electric blue guides keyboard navigation

---

## Atmospheric Effects - Use Sparingly

### Glows & Shadows (Reserved Moments)
```css
/* Card hover glow - ONLY on hover */
box-shadow: 0 0 20px rgba(167, 199, 231, 0.12)

/* Large card hover glow (quick links) */
box-shadow: 0 0 25px rgba(167, 199, 231, 0.15)

/* Logo text glow - ALWAYS present (brand identifier) */
text-shadow: 0 0 20px rgba(167, 199, 231, 0.3)

/* Hero accent text glow - "Asynchronously" only */
text-shadow: 0 0 20px rgba(167, 199, 231, 0.4)
```

### When NOT to Use Glows
- ❌ Body text (readability issues)
- ❌ Regular headings (reserve for hero moments)
- ❌ Default card state (only on hover)
- ❌ Nav bar background (keep it clean)

### Gradients (Primary Button Only)
- **Button Background**: 135deg angle, #A7C7E7 → #9BBFE6 → #A7C7E7
- **Shimmer Overlay**: Iridescent sweep on hover
- **Philosophy**: Gradient = call to action

---

## Page-Specific Guidelines

### Home Page
- **Background**: bg-zinc-900
- **Nav**: Zinc borders, logo has blue glow
- **Hero**:
  - "Asynchronously" in glass-blue-400 with glow (brand moment)
  - Body text in zinc-400
  - CTA uses `.btn.btn-primary`
- **Feature Cards**:
  - Default: border-zinc-800
  - Hover: border-glass-blue-500/30 + subtle blue glow
- **Quick Links**:
  - Larger hover effect: border-glass-blue-500/40 + bigger glow
  - Heading shifts to glass-blue-400 on hover

### Explore Page
- **Background**: bg-zinc-900
- **Filter Buttons**:
  - Active: `.btn.btn-primary` (electric blue)
  - Inactive: bg-zinc-800 hover:bg-zinc-700
- **Search Input**:
  - Default: zinc-800 bg, zinc-700 border
  - Focus: glass-blue-500 border + ring
- **Repository Cards**:
  - Default: border-zinc-800
  - Hover: border-glass-blue-500/40 + blue glow + heading shifts to glass-blue-400
  - Stats (⭐, 🎵, 👥): text-glass-cyan-500

### Repositories Page
- **Background**: bg-zinc-900
- **Header Button**: "+ New Repository" uses `.btn.btn-primary`
- **Stats**: text-glass-cyan-500 (numbers only)
- **View Toggle**:
  - Active: `.btn.btn-primary`
  - Inactive: bg-zinc-800 hover:bg-zinc-700
- **Repository Cards**:
  - Same pattern as Explore
  - Private badge: zinc-800 bg with zinc-700 border (not electric blue)
  - List view buttons: Primary + zinc tertiary button

### Auth Pages (Login/Signup)
- **Different pattern** - uses navy backgrounds and more prominent brand colors
- Split-screen layout with electric blue more prominent
- Logo, inputs, and CTAs all use brand colors heavily
- This is intentional - auth is a brand moment, main app is more functional

---

## The Golden Rule: Zinc Foundation, Electric Accents

### ✅ Do - Strategic Blue Usage
- **Primary buttons ONLY**: Electric blue gradient reserved for main CTAs
- **Hover states**: Cards and links get blue borders/glows on hover
- **Active states**: Selected filters/tabs use electric blue
- **Stats/metadata**: Use glass-cyan-500 for numbers and data
- **Logo glow**: Always present - it's a brand identifier
- **Hero moments**: "Asynchronously" text gets blue accent + glow
- **Focus states**: Electric blue rings for keyboard navigation

### ✅ Do - Zinc Usage
- **Backgrounds**: zinc-900 (main), zinc-800 (cards/buttons/hover)
- **Borders**: zinc-800 (default), zinc-700 (inputs)
- **Text**: zinc-100 (primary), zinc-400 (secondary), zinc-300 (tertiary)
- **Inactive buttons**: zinc-800 background
- **Structure**: Zinc provides the framework

### ❌ Don't - Common Mistakes
- **Don't** use electric blue backgrounds except for primary buttons
- **Don't** use navy/midnight backgrounds on main pages (that's for auth)
- **Don't** put glows on every card - only on hover
- **Don't** use electric blue text everywhere - reserve for hover/active/accents
- **Don't** forget: The balance is 80% zinc, 20% electric blue
- **Don't** make everything blue - you'll lose the impact of the brand color

### 🎯 The Balance
```
Zinc (80%):
- Backgrounds, borders, text, structure
- The foundation that makes blue pop
- Professional, readable, calm

Electric Blue (20%):
- CTAs, hovers, active states, brand moments
- Strategic energy and personality
- Memorable and distinctive
```

---

## Technical Implementation

### CSS Class Reference - Zinc Foundation
```
Backgrounds:
- bg-zinc-900 (primary background - all main pages)
- bg-zinc-800 (cards, inactive buttons, hover states)
- bg-zinc-800/50 (card hover overlay)
- bg-zinc-700 (rare - tertiary)

Text:
- text-zinc-100 (primary text - headings, body)
- text-zinc-400 (secondary text - descriptions, helper text)
- text-zinc-300 (tertiary - subtle nav links)

Borders:
- border-zinc-800 (default cards, nav)
- border-zinc-700 (inputs, tertiary buttons)
```

### CSS Class Reference - Electric Blue Accents
```
Text:
- text-glass-blue-400 (hover on headings/links, hero accent)
- text-glass-cyan-500 (stats and metadata ONLY)

Borders (Hover/Active):
- border-glass-blue-500/40 (card hover)
- border-glass-blue-500/30 (feature card hover)
- border-glass-blue-500 (input focus)

Glows:
- hover:shadow-[0_0_20px_rgba(167,199,231,0.12)] (card hover)
- hover:shadow-[0_0_25px_rgba(167,199,231,0.15)] (large card hover)
- style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.3)'}} (logo)
- style={{textShadow: '0 0 20px rgba(167, 199, 231, 0.4)'}} (hero accent)

Components:
- .btn.btn-primary (electric blue gradient - PRIMARY CTAs ONLY)
- bg-zinc-800 hover:bg-zinc-700 (inactive buttons)
- border-zinc-700 hover:bg-zinc-800 (tertiary buttons)
```

### Animation Durations
- All transitions: 300ms (consistency is key)
- Button shimmer: 600ms (primary button only)

---

## Brand Evolution Notes

**January 2026 Update - Version 1.2**:
- Established "Balanced Luminosity" approach: Zinc foundation (80%) + Electric Blue accents (20%)
- Main pages use zinc-900 backgrounds with zinc-800/700 for structure
- Electric blue reserved for:
  - Primary CTAs (buttons with gradient)
  - Hover states (borders, glows, text color shifts)
  - Active states (selected filters/tabs)
  - Stats/metadata (glass-cyan-500)
  - Brand moments (logo glow, hero accent text)
- Auth pages remain more heavily branded (navy backgrounds, prominent blue)
- This creates a clear separation: Auth = brand immersion, Main app = functional with strategic accents

**Design Rationale**:
The balanced approach prevents electric blue fatigue while making brand moments unmissable. Zinc provides professional structure and readability - it's the canvas. Electric blue provides personality and guides attention - it's the paint. The 80/20 ratio ensures the brand is distinctive without being overwhelming, and makes CTAs pop against the neutral foundation.

**Why This Works**:
1. **Readability**: Zinc text colors maintain WCAG contrast ratios
2. **Hierarchy**: Electric blue naturally draws eye to important actions
3. **Professionalism**: Neutral foundation feels polished and serious
4. **Memorability**: Strategic blue creates "aha" moments on interaction
5. **Scalability**: Easy to add new pages/components following the pattern

---

*This brand bible is a living document. As SoundHaus evolves, update this guide to reflect new patterns, components, and design decisions.*
