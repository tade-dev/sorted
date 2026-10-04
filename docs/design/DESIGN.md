# Sorted: Design Spec

This folder holds the high-fidelity design concept for **Sorted**, a Flutter app for UK DM sellers. Use it as the visual source of truth when building the UI.

- `screens/` contains one HTML file per screen (390×844, iPhone size). Read them for exact layout, spacing, copy and colours. They are design references, not code to port: rebuild each screen as Flutter widgets.
- Ignore the `<script src="./support.js">` line and the `<x-dc>`, `<helmet>` and `data-dc-script` wrappers. They belong to the design tool. Everything inside the root `<div>` is the screen.
- Content values (Ola's Bakehouse, Jess, £56, dates) are demo data. Keep them as seed/demo data, not hardcoded strings.

---

## Design tokens

### Colours

| Token | Hex | Use |
|---|---|---|
| `background` | `#F5F7FA` | App background |
| `surface` | `#FFFFFF` | Cards, inputs, tab bar |
| `ink` | `#001C64` | Primary text, dark cards, selected chips |
| `muted` | `#515A6B` | Secondary text |
| `line` | `#DCE2EA` | Borders, dividers |
| `primary` | `#0070E0` | Primary buttons, links, Sorted stamp, live indicator |
| `primaryTint` | `#E6F0FC` | Info cards, fresh order highlight, product tiles |
| `success` | `#147A47` | Paid status text |
| `successTint` | `#E3F4EA` | Paid status chip background |
| `highlight` | `#FFC439` | Accents on dark screens (camera corners, Done button) |
| `warningTint` | `#FFF4D6` | Waiting / needs-attention cards and chips |
| `warningText` | `#7A5200` | Text and icons on `warningTint` |
| `warningBorder` | `#F1D27A` | Borders inside warning cards |
| `neutralTint` | `#EBEEF3` | Draft chips, segmented control track |
| `darkBg` | `#00123F` | Camera (Snap) screen background |
| `darkSurface` | `#0B2A78` | Camera viewfinder |
| `darkTrack` | `#0F3488` | Progress track on dark cards |
| `darkLink` | `#123C96` | Link chip inside dark message bubbles |
| `onDarkMuted` | `#B9C8EE` | Secondary text on `ink` / dark backgrounds |
| `accentCyan` | `#60CDFF` | Tagline and highlights on dark backgrounds |
| `paidBar` | `#5BD08F` | Paid segment of progress bar on dark card |

Status colours must stay distinguishable by lightness, not hue alone.

### Typography

Both fonts are on Google Fonts (use the `google_fonts` package or bundle them).

| Role | Font | Weight | Size |
|---|---|---|---|
| Wordmark | Bricolage Grotesque | 700 | 68 |
| Hero numbers (£80, £56.00) | Bricolage Grotesque | 700 | 32–48 |
| Screen headings | Bricolage Grotesque | 700 | 28–32, letter-spacing −0.6 to −0.8 |
| Section headings | Bricolage Grotesque | 700 | 19 |
| Body | Plus Jakarta Sans | 400–500 | 15–16, line-height 1.45–1.5 |
| Labels, buttons | Plus Jakarta Sans | 600 | 14–17 |
| Captions, meta | Plus Jakarta Sans | 400–600 | 12–13 |

### Shape and spacing

- Screen side padding: 20–24
- Top padding where a status bar would be: 56 (use `SafeArea` instead)
- Primary button: height 54, radius 16, full width
- Secondary text button: height 44–48
- Cards: radius 16–22, 1px `line` border on light cards
- Chips / pills: fully rounded (radius 999), height 26 for status chips, 38–40 for selectable chips
- Product tiles: radius 12–14
- Minimum touch target: 44×44
- Icons: outline style, 1.8 stroke, 20–24 px (e.g. Lucide or Phosphor outline)

---

## Components

- **PrimaryButton**: `primary` fill, white label, optional leading icon.
- **StatusChip**: Paid (`successTint` / `success`), Waiting (`warningTint` / `warningText`), Draft (`neutralTint` / `muted`).
- **SelectableChip**: unselected = `surface` + `line` border; selected = `ink` fill + white text.
- **SegmentedControl**: `neutralTint` track, white raised selected segment.
- **WarningCard**: `warningTint` background, alert icon, used whenever the AI needs the seller to decide something.
- **OrderSlip**: white card with a dashed divider, item rows and total. Used on Welcome and Paid order.
- **SortedStamp**: rotated (−10 to −12°) rounded box with a 3px `primary` border, check icon and the word "Sorted" in Bricolage Grotesque. This is the app's signature moment: it appears when an order is paid. Consider animating it in (scale + rotate, slight overshoot).
- **MessageBubble (outgoing)**: `ink` fill, white text, radius 22 with a 6 px bottom-right corner, plus a link chip in `darkLink`.
- **TabBar**: Home, Orders, centre "+" button (round, `primary`, raised), Catalogue, Settings.

---

## Screens and flows

Each file in `screens/` is one screen. Buttons in the HTML are linked to show navigation.

### 1. Onboarding
1. `Main.dc.html`: Welcome. Dark `ink` background, wordmark, tagline, order slip with Sorted stamp. "Set up my shop" → Setup.
2. `Setup.dc.html`: Step 1 of 2. Shop name, what you sell (chips), where buyers message you (multi-select chips), collection/delivery segmented control.
3. `Connect.dc.html`: Step 2 of 2. Buyer protection info card, "How Sorted works" three steps, "Connect PayPal".
4. `Home.dc.html`: Greeting, "Paid today" dark card with progress bar, needs-attention nudge card, upcoming collections, tab bar.

### 2. Catalogue from photos
5. `Snap.dc.html`: Camera with viewfinder corners, live "Found" label, shutter, photo count, Done.
6. `Review.dc.html`: AI-extracted products to confirm. One card flagged in warning style for a missing price.
7. `Catalogue.dc.html`: Product list with search and "Snap more".

### 3. Share a DM, get an order (core flow)
8. `ShareSheet.dc.html`: A buyer chat with the OS share sheet open and Sorted as the target. In the real app this is the native share sheet plus the iOS Share Extension / Android intent.
9. `Reading.dc.html`: Processing state. Screenshot thumbnail with scan line and a step-by-step checklist that ticks off as the AI works.
10. `Draft.dc.html`: Order draft. Warning card asks which cake size the buyer meant. Total, "Create PayPal link".
11. `Reply.dc.html`: Ready-to-send reply bubble with the checkout link, tone chips, waiting status, "Copy reply".

### 4. Orders track themselves
12. `Orders.dc.html`: Filter pills, "Live from PayPal" indicator, order cards with status chips and an inline Nudge button.
13. `Paid.dc.html`: Order slip with the Sorted stamp, payment timeline, protection note, "Copy thank-you message".
14. `Nudge.dc.html`: AI-drafted reminder with tone chips and "Copy nudge".

---

## Notes for the Flutter build

- Put all tokens in a single `ThemeData` plus a `ThemeExtension` for the custom colours (status, dark surfaces).
- Build the components above as reusable widgets first, then assemble screens.
- Order status changes (Link sent → Paid) should update live from the realtime database and animate: chip colour change plus the Sorted stamp on the order detail.
- The web build has no share sheet. Show a "Paste or upload a screenshot" entry point instead (also useful as a backup on mobile).
- Do not use the PayPal logo or imitate PayPal's own buttons in custom UI. Use PayPal's official brand assets anywhere the PayPal checkout itself is shown.
