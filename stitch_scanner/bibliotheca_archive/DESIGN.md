# Design System: The Scholarly Curator

This design system is a high-end framework crafted for a digital library experience that feels less like a database and more like a private, sun-drenched study. It balances the intellectual weight of a traditional archive with the effortless fluidity of modern digital craft.

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Curator"**
The objective is to move beyond the "grid-of-cards" template. We are building a digital sanctum. The experience must feel intentional, quiet, and premium. We achieve this through **Editorial Asymmetry**—using generous whitespace (the "Paper") to frame content, and high-contrast typography scales that guide the eye like a well-laid-out broadsheet.

Every interaction should feel like a physical transition; surfaces don't just "appear," they slide into place like heavy vellum. We reject the "boxed-in" web. We embrace breathing room, tonal depth, and the authoritative elegance of serif type.

---

## 2. Colors & Surface Philosophy
Our palette is rooted in **Primary (#03192e)**—a deep, ink-like blue—and **Surface (#fbf9f4)**—a warm paper white that reduces eye strain and evokes a sense of history.

### The "No-Line" Rule
Standard UI relies on 1px borders to separate ideas. This design system forbids them. Boundaries must be defined through **Background Color Shifts** or **Tonal Transitions**. 
- To separate a sidebar from a main feed, transition from `surface` to `surface-container-low`.
- For a header, use `surface-bright` against a `surface-container` body.
- *Lines are for underlines in text, not for structural containment.*

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked materials. Use the `surface-container` tiers to create "nested" depth:
1.  **Base Layer:** `surface` (#fbf9f4)
2.  **Sectioning Layer:** `surface-container-low` (#f5f3ee) for secondary utility areas.
3.  **Content Focus:** `surface-container-lowest` (#ffffff) for the "active" paper where the user reads.
4.  **Elevated Detail:** `surface-container-high` (#eae8e3) for inactive or backgrounded elements.

### The "Glass & Gradient" Rule
To prevent the UI from feeling static, use **Glassmorphism** for floating menus or navigation bars. Apply `surface` at 80% opacity with a `20px` backdrop blur. 
For primary Call-to-Actions (CTAs), do not use flat fills. Use a subtle linear gradient from `primary` (#03192e) to `primary-container` (#1a2e44) at a 135-degree angle. This adds "soul" and a tactile, satin-like finish.

---

## 3. Typography: The Editorial Voice
Typography is the cornerstone of this system. We use a high-contrast pairing to distinguish between "Content" and "Interface."

*   **The Voice (Newsreader):** A sophisticated serif used for `display` and `headline` scales. This provides the scholarly, "Old World" authority.
*   **The Engine (Manrope):** A high-legibility sans-serif used for `title`, `body`, and `label`. This provides the modern, functional clarity required for navigation.

**Editorial Scaling:**
- **Display-LG (3.5rem):** Reserved for book titles or major collection headers. Use `primary` color.
- **Headline-MD (1.75rem):** For section starts. Ensure these have significant top-margin (Spacing Scale 16) to create an "opening chapter" feel.
- **Label-SM (0.6875rem):** Use `on-surface-variant` with a `0.05rem` letter-spacing for metadata like "ISBN" or "Publication Date."

---

## 4. Elevation & Depth
We eschew the heavy shadows of the early 2010s in favor of **Tonal Layering**.

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. The subtle shift from #f5f3ee to #ffffff creates a "soft lift" that feels architectural rather than digital.
*   **Ambient Shadows:** For floating modals, use an extra-diffused shadow: `0px 20px 40px rgba(27, 28, 25, 0.06)`. The tint is derived from `on-surface` (#1b1c19), making it look like a natural occlusion of light.
*   **The "Ghost Border" Fallback:** If a container lacks enough contrast, use a "Ghost Border": `outline-variant` (#c4c6cd) at 15% opacity. It should be felt, not seen.

---

## 5. Components

### Cards & Book Covers
- **Rule:** No borders. No dividers.
- **Implementation:** Use a `surface-container-lowest` background with a `xl` (0.75rem) roundedness. Use `Spacing 4` for internal padding.
- **The "Library Spine" Effect:** For book lists, use vertical white space (`Spacing 8`) rather than horizontal lines to separate items.

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), white text, `lg` corner radius.
- **Secondary:** `secondary-container` background with `on-secondary-container` text. No border.
- **Tertiary (The "Scholar" Link):** `Manrope` Title-SM with a `primary` 1px underline that only spans the width of the text.

### Inputs & Search
- Use `surface-container-highest` for the input track. 
- On focus, do not use a heavy glow. Transition the background to `surface-container-lowest` and apply a `Ghost Border` at 40% opacity.

### Global Navigation (The "Curator Bar")
- Positioned as a floating dock at the bottom or a slim sidebar.
- Use the **Glassmorphism** rule.
- Active states should be indicated by a `tertiary-fixed` (#ffddb6) dot below the icon, never a "box" around it.

---

## 6. Do’s and Don’ts

### Do:
- **Use Asymmetric Margins:** Let a heading sit further to the left than the body text to create an editorial feel.
- **Embrace "Dead Space":** Use `Spacing 20` or `24` to separate major functional blocks.
- **Tone-on-Tone:** Use `on-surface-variant` for secondary text to keep the visual hierarchy soft.

### Don’t:
- **Don't use 100% Black:** Always use `on-surface` (#1b1c19) or `primary` (#03192e) for text. Pure black is too harsh for this "paper" aesthetic.
- **Don't use Dividers:** If you feel the need for a line, try using an 8px background color shift instead.
- **Don't use Default Corners:** Avoid the `DEFAULT` (0.25rem) radius. It looks like a standard bootstrap template. Use `lg` (0.5rem) or `xl` (0.75rem) to soften the scholarly "heaviness."

### Accessibility Note:
While we use soft tones, ensure all text in `body-md` and `label-md` meets a 4.5:1 contrast ratio against its respective `surface-container`. Use `on-surface` for all critical reading paths.