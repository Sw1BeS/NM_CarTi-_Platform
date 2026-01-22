# CarTie Platform Design System

> **Version 4.2** | Last Updated: January 2026

## Overview

This document defines the visual language and interaction patterns for the CarTie B2B & Telegram Hub platform. Our design system prioritizes **clarity**, **efficiency**, and **premium aesthetics** for automotive industry professionals.

---

## Color System

### Primary Colors

```css
/* Gold Accent - Primary Brand Color */
--color-gold-500: #D4AF37;
--color-gold-600: #BF9B2F;
--color-gold-400: #E5C855;

/* Semantic Colors */
--color-green-500: #10B981;
--color-red-500: #EF4444;
--color-blue-500: #3B82F6;
```

### Background Layers

```css
/* Dark Mode (Default) */
--bg-app: #0F172A;        /* Main app background */
--bg-panel: #1E293B;      /* Cards, panels, elevated surfaces */
--bg-input: #334155;      /* Form inputs, selects, textareas */

/* Light Mode (Future) */
--bg-app-light: #F8FAFC;
--bg-panel-light: #FFFFFF;
--bg-input-light: #F1F5F9;
```

### Text Colors

```css
--text-primary: #F1F5F9;       /* Main text, headings */
--text-secondary: #94A3B8;     /* Supporting text, labels */
--text-muted: #64748B;         /* Placeholders, disabled text */
```

### Borders

```css
--border-color: #334155;       /* Default border color */
--border-color-light: #475569; /* Hover/focus borders */
```

### Usage Guidelines

- **Primary Action**: Use `bg-gold-500` with `text-black` for CTA buttons
- **Destructive Action**: Use `text-red-500` or `bg-red-500/20` for delete/warning
- **Success**: Use `text-green-500` or `bg-green-500/20` for confirmations
- **Premium Feel**: Layer backgrounds (app → panel → input) for depth

---

## Typography

### Font Family

```css
/* System Font Stack */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             'Helvetica Neue', Arial, sans-serif;

/* Monospace (for code, IDs) */
font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
```

### Type Scale

| Level | Size | Weight | Use Case |
|-------|------|--------|----------|
| **Hero** | `2.5rem (40px)` | 700 | Landing pages, empty states |
| **H1** | `2rem (32px)` | 700 | Page titles |
| **H2** | `1.5rem (24px)` | 700 | Section headers |
| **H3** | `1.25rem (20px)` | 600 | Subsection headers |
| **Body** | `1rem (16px)` | 400 | Default text |
| **Small** | `0.875rem (14px)` | 400 | Labels, secondary info |
| **Tiny** | `0.75rem (12px)` | 400 | Metadata, timestamps |

### Line Height

- **Headings**: `1.2` (tight)
- **Body**: `1.5` (comfortable)
- **Small text**: `1.4` (compact)

---

## Spacing Scale

Based on **8px** grid system:

```css
--space-xs: 0.25rem;  /* 4px  - Tight spacing within components */
--space-sm: 0.5rem;   /* 8px  - Default gap between related items */
--space-md: 1rem;     /* 16px - Section padding, card spacing */
--space-lg: 1.5rem;   /* 24px - Page sections */
--space-xl: 2rem;     /* 32px - Major layout sections */
--space-2xl: 3rem;    /* 48px - Page-level spacing */
```

### Application

- **Component padding**: `md` (16px)
- **Card gap**: `sm` (8px) to `md` (16px)
- **Section margin**: `lg` (24px) to `xl` (32px)
- **Page container**: `xl` (32px) padding on large screens

---

## Components

### Buttons

#### `.btn-primary`
```css
background: var(--color-gold-500);
color: #000000;
padding: 0.75rem 1.5rem;
border-radius: 0.5rem;
font-weight: 600;
transition: background 0.2s;

&:hover {
  background: var(--color-gold-600);
}
```

#### `.btn-secondary`
```css
background: var(--bg-input);
color: var(--text-primary);
border: 1px solid var(--border-color);
/* Same padding/radius as primary */
```

#### `.btn-ghost`
```css
background: transparent;
color: var(--text-secondary);
&:hover { background: var(--bg-input); }
```

### Panels

#### `.panel`
```css
background: var(--bg-panel);
border: 1px solid var(--border-color);
border-radius: 0.75rem; /* 12px */
padding: 1.5rem;        /* 24px */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
```

### Form Elements

#### `.input`, `.textarea`, `.select`
```css
background: var(--bg-input);
color: var(--text-primary);
border: 1px solid var(--border-color);
border-radius: 0.5rem;
padding: 0.75rem 1rem;

&:focus {
  outline: none;
  border-color: var(--color-gold-500);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
}

&::placeholder {
  color: var(--text-muted);
}
```

### Icons

- **Size**: `16px` (small), `20px` (default), `24px` (large)
- **Stroke width**: `2px` (Lucide React default)
- **Color**: Match text color (`text-primary`, `text-secondary`)

---

## Layout Patterns

### Container

```css
max-width: 1400px;
margin: 0 auto;
padding: 0 1.5rem;

@media (min-width: 1024px) {
  padding: 0 2rem;
}
```

### Responsive Breakpoints

```css
/* Mobile first approach */
sm: 640px   /* Tablet portrait */
md: 768px   /* Tablet landscape */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
```

### Grid System

```css
.grid {
  display: grid;
  gap: 1rem;
}

.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }

/* Responsive */
.grid-cols-1 md:grid-cols-2 lg:grid-cols-3
```

---

## Animations

### Transitions

```css
/* Default */
transition: all 0.2s ease-in-out;

/* Opacity fade */
transition: opacity 0.15s ease-in;

/* Transform (hover effects) */
transition: transform 0.2s ease-out;
```

### Keyframes

#### Slide Up (Modal entry)
```css
@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

---

## Accessibility

### Focus States

```css
/* Visible focus ring for keyboard navigation */
&:focus-visible {
  outline: 2px solid var(--color-gold-500);
  outline-offset: 2px;
}
```

### Color Contrast

- **Text on dark backgrounds**: Minimum 4.5:1 contrast ratio
- **Interactive elements**: Minimum 3:1 contrast
- **All text meets WCAG AA standards**

---

## Implementation Notes

### CSS Variables

All design tokens are defined in `/src/index.css` as CSS custom properties prefixed with `--`.

### Tailwind Utilities

Common patterns are available as Tailwind classes:
- Colors: `text-gold-500`, `bg-[var(--bg-panel)]`
- Spacing: `p-4`, `gap-6`, `mt-8`
- Typography: `font-bold`, `text-xl`

### Component Classes

Prefer semantic component classes (`.panel`, `.btn-primary`) over inline utilities for reusable patterns.

---

## Examples

### Premium Card Pattern

```tsx
<div className="panel hover:border-gold-500/30 transition-colors">
  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
    Title
  </h3>
  <p className="text-sm text-[var(--text-secondary)]">
    Description text
  </p>
</div>
```

### Gold Accent Pattern

```tsx
<button className="btn-primary flex items-center gap-2">
  <Icon size={20} />
  <span>Primary Action</span>
</button>
```

---

## Future Considerations

- **Light Mode**: Complete light theme implementation
- **Design Tokens**: Export to Figma for designer handoff
- **Component Library**: Extract reusable components to `/components/ui/`
- **Animation Library**: Framer Motion integration for complex interactions

---

**Maintainer**: Development Team  
**Questions?** See `/docs/` or contact the design lead
