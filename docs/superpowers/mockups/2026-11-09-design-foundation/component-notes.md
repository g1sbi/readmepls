# Component notes — gate 2 (plan 2)

State coverage per primitive as rendered on `/dev/components`, and how each
compares to Notion (the owner's named reference for look and navigation).
✓ = designed and shown, — = not applicable.

| Primitive              | default | hover (pointer)            | focus-visible  | pressed     | disabled | loading     | selected | empty / error  | touch equivalent                      | light / dark            |
| ---------------------- | ------- | -------------------------- | -------------- | ----------- | -------- | ----------- | -------- | -------------- | ------------------------------------- | ----------------------- |
| Button                 | ✓       | ✓                          | ✓ ring         | ✓ scale .97 | ✓        | ✓ (spinner) | —        | —              | ≥44px (hit area on sm / icon-sm)      | ✓                       |
| Input                  | ✓       | —                          | ✓ ring         | —           | ✓        | —           | —        | ✓ invalid ring | 44px pill                             | ✓                       |
| Textarea / InputGroup  | ✓       | —                          | ✓ (group ring) | —           | ✓        | —           | —        | ✓              | 44px                                  | ✓                       |
| Badge: tag             | ✓       | —                          | —              | —           | —        | —           | —        | —              | display only                          | ✓                       |
| Badge: chip            | ✓       | ✓ tint                     | ✓ (wrapper)    | ✓ (wrapper) | —        | —           | ✓ ink    | —              | 44px wrapper, aria-pressed            | ✓                       |
| Skeleton / Spinner     | ✓       | —                          | —              | —           | —        | ✓           | —        | —              | static under reduced motion           | ✓                       |
| DropdownMenu           | ✓       | ✓                          | ✓              | —           | —        | —           | —        | —              | 44px items; "⋯" visible on touch      | ✓                       |
| Dialog / ConfirmAction | ✓       | —                          | ✓              | —           | —        | —           | —        | —              | visible Close; Esc/overlay = cancel   | ✓ scrim dims both modes |
| Sheet / BottomSheet    | ✓       | —                          | ✓              | —           | —        | —           | —        | —              | visible Close, grab handle, safe area | ✓                       |
| Command palette        | ✓       | ✓                          | ✓              | —           | —        | —           | —        | ✓ empty        | 44px input and rows                   | ✓                       |
| Popover (highlights)   | ✓       | —                          | ✓              | —           | —        | —           | —        | —              | named swatches                        | ✓                       |
| Card                   | ✓       | ✓ lift (fine pointer only) | ✓ (card link)  | —           | —        | —           | —        | —              | menu trigger always visible           | ✓                       |

## vs Notion

- **Buttons:** Notion keeps buttons quiet and small, with the colour on one
  primary action. Adopted: one ink primary, quiet secondary, outline, and
  ghost variants. Deliberately different: pill shapes, and 44px minimum
  targets. Notion's 28–32px buttons are too small for a phone-first reader.
- **Menus:** Notion menus are compact lists with icon, label, and a hover
  wash, plus destructive items in red. Adopted all of it: hairline-ring
  popover, `accent` hover wash, red destructive items. Deliberately
  different: taller items (44px) for touch.
- **Dialogs:** Notion confirms deletes in a small centred card, with a red
  primary and a neutral cancel. Adopted. The backdrop dims in both modes.
- **Sheets:** Notion mobile uses bottom sheets with a grab handle for
  secondary actions. Adopted for the bottom drawer, with safe-area padding.
- **Chips and tags:** Notion's multi-select tags are small rounded labels.
  Ours are quieter (`tag`); filter chips are pills that turn ink when
  selected, which reads more clearly at a glance than Notion's tint.
- **Search (command palette):** Notion's ⌘K search is the model. Same shape:
  a search field on top and grouped results.

## Open questions for the owner

1. Destructive buttons are red text at rest, with a tinted pill on hover. Keep that, or always show a soft red pill?
2. Link buttons look the same as ghost buttons. Give them a marker-yellow underline, like links in articles?
