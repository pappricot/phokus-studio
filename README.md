# Phokus

A standalone static website concept with a regal editorial direction inspired by the provided reference screenshot.

## Pages

- `index.html`
- `work.html`
- `archive.html`
- `about.html`
- `contact.html`

## Visual System

- Display type: Didot / Bodoni / Baskerville style serif fallbacks
- Utility type: Courier-style monospace
- Palette: electric royal blue, porcelain paper, gold accent
- Imagery: original generated hero artwork saved in `assets/HeroImage/`

## Categorisation

Two doors, one substrate:

- **Image** — campaigns, film, stills, generative production.
- **Product** — mobile apps, websites, internal tools.
- **Pipelines** are not a third door. They run underneath both and appear as
  method on `about.html` and as the "system" section of each case study.

The rule for edge cases: if the deliverable has an audience it is Image or
Product; if it only has an operator it is a Pipeline. A campaign microsite is
Image, a product marketing site is Product.

## Intro Briefing

The loader teaches the categorisation before showing any work, so the index
reads as a rule rather than an arbitrary split. The work divides in two, so the
briefing is two cards:

| Rule | Term | Gloss |
| --- | --- | --- |
| If it has an audience | Image | Campaigns, film, stills, generative production |
| If it has a user | Product | Mobile apps, websites, internal tools |

The cards live in `introSteps` in `script.js`; editing that array is the only
change needed to alter the briefing, and the dots count themselves from it.

It is paced by the visitor, not by a timer. Each card holds until **Next** is
pressed, and a dot per card beneath the sentence shows how much is left. After
the last card the dots fade, the closing question takes the same slot the terms
occupied, and the control relabels itself to **Yes**.

The question is built from the same `.intro-rule` and `.intro-term` pair a card
uses — `Ready to` above, `Phokus?` below — so it reads as the last slide of the
briefing rather than a different kind of screen. Those two classes are shared, so
restyling a card restyles the question with it.

Constraints worth keeping:

- Nothing advances on its own. The slowness is the point: the studio thinks
  slow and acts fast, so the visitor sets the pace and nothing is snatched away
  mid-sentence.
- **One control** carries the whole briefing, relabelled from `Next` to `Yes`,
  so neither the pointer nor the keyboard focus has to move between steps.
- **Nothing flashes.** The key is bare type that fades in a beat after its card.
  The closing key takes a rule under the word as its only distinction, carried by
  `.is-final`.
- The key is **never focused programmatically**, because a focus ring would draw
  the very box the bare type is avoiding. `Enter` and `Space` are handled on
  `document` instead, so the briefing stays fully keyboard-driven, and anyone who
  tabs to the key gets a real focus ring and the button's own activation.
- It runs **once per session, on the homepage only**. Interior pages and later
  visits keep the fast loader, so the rule is taught without being repeated.
- The gate is a `dialog`, not a `progressbar`. The key's `aria-label` carries the
  position (`Next, step 2 of 2`) because the dots are decorative and
  `aria-hidden`.
- Under `prefers-reduced-motion` both cards are shown stacked at once, the dots
  are dropped, fades are cut, and one press enters the site.
- Reel autoplay is held on the `introDone` promise, so the visitor always meets
  the reel on its first project.

`introKeyDelay` is the beat between a card settling and its key appearing.

## The Top Line

There is no header bar. Instead every page shares one top line, controlled by
two variables on `:root`:

| Variable | Role |
| --- | --- |
| `--head-top` | Distance from the top of the page to the line |
| `--head-band` | Height of the line's band |

The menu key and the page's first line of copy are separate positioned elements,
so they cannot be baseline-matched reliably across two stacking contexts.
Instead each one is the height of `--head-band` and centres its contents inside
it, which is what puts them on the same line.

- Homepage: `.reel-copy-line` holds the prefix, the centred brand, and the menu
  key sits at the right of the same band.
- Every other page: `.eyebrow` inside `.page-hero` or `.project-hero` takes the
  band, so the line holds at one height sitewide.

The menu key is bare type with no border or plate. It carries a text shadow
because on interior pages it crosses the hero artwork.

At 560px and below the line staggers rather than sharing one row. The menu key
keeps the band, the prefix drops `0.45rem` below it, and the brand drops `1.7rem`
— far enough that it can stay centred on the axis without landing on the prefix.
`.reel-copy-line` also reserves a right gutter so the prefix never runs under the
key.

## Homepage Focus Reel

The hero is a viewfinder. One index drives two layers at once:

- `.reel-stage` — a full-bleed vertical stack of project stills, translated by
  `--reel-offset` (whole multiples of 100%).
- `.reel-strip` — the filmstrip of project links, translated by `--strip-shift`
  so the active cell's centre lands on `--focus-line`.

Whichever cell sits inside the gold brackets is the project about to be entered,
and `.reel-readout` prints its name, kind, year, and native frame.

### Geometry

The focus area is **9:16**, because most project stills are vertical. Set
`--cell-height` only; `--strip-width` is derived from it, and the brackets take
their box from both, so the ratio holds at every breakpoint. Raising or lowering
`--cell-height` is the single control for how large the focus area reads.

The focused cell fills the brackets exactly. Emphasis comes from tone, opacity,
and the hairline border, never from a change in size, so the strip's scroll
maths and the 9:16 ratio both stay intact.

The stage behind the strip is blurred (`.reel-plate`) and carries no blue tint,
so project stills keep their own colour. `.reel-veil` is a neutral scrim placed
only where type lands. It sits *behind* the strip, so `.reel-readout`,
`.reel-copy`, and `.reel-counter` carry their own text shadows for the cases
where copy crosses a cell.

### Adding or changing a project

Each project needs two things kept in the same order:

1. A `.reel-plate` in `.reel-stage-track` with its `background-image`.
2. A `.reel-cell` in `.reel-strip` containing the link, thumbnail, and the
   `data-name`, `data-kind`, `data-year`, `data-frame` attributes.

The reel reads cell positions from the DOM, so cell height and gap can change in
CSS without touching the script.

`data-kind` must read exactly `Image` or `Product`, because the filter matches on
it. A cell with any other kind is reachable under **All** and nowhere else.

**PLACEHOLDER IMAGES:** every stage plate and thumbnail currently points at a
muse master, chosen to match the project's declared frame. Replace each with the
real project still; no other change is needed.

### Behaviour

- Autoplay advances every 3.4s, and stops permanently on any deliberate input.
- Wheel, arrow keys, `Home`/`End`, touch swipe, and click all drive it.
- A cell must be focused before it becomes a door, so nothing navigates on a
  first click.
- At either end of the reel the page keeps its own scroll, so the visitor is
  never trapped.
- Disabled under `prefers-reduced-motion`.

### Filter

`Filter` sits directly under `Menu`, one `--head-band` lower, and reuses the
`.menu-toggle` class outright so the two read as one stack of controls. It offers
**All**, **Image**, and **Product**, and is homepage-only because it drives the
reel. The collapsed button carries the state (`Filter / Image`), since the options
are hidden when closed.

Filtering sets the `hidden` attribute on cells that do not match, which takes them
out of layout, out of the tab order, and out of the reel's reach. Two consequences
are worth knowing before changing this code:

- **Stepping is not arithmetic.** Every step goes through `seek`, which walks
  outward until it finds a cell the filter is showing. Anything that moves the
  reel by `index + 1` will land on hidden cells.
- **Two different indices are in play.** The strip counts the filtered set, but
  `--reel-offset` must stay the project's *original* position, because the stage
  plates are never filtered. Mixing these up puts the wrong image behind the
  brackets.

The active project is kept across a filter change whenever it survives one;
otherwise the reel snaps to the nearest survivor. Changing the filter counts as
deliberate input, so it stops autoplay for good, like every other input.

`.reel.is-refiltering` fades the strip out for 220ms while the set changes, so the
relayout is not seen as a jump. Under `prefers-reduced-motion` the swap is
immediate.

## Hero Masters

| Frame | Master |
| --- | --- |
| 16:9 | `phokus-muse-main-blue-horizontal.png` |
| 9:16 | `phokus-muse-main-blue-vertical.png` |
| 1:1 | `phokus-muse-main-blue-square.png` |
| Round | `phokus-muse-main-blue-round.png` |

The square and round masters are anchored crops of the vertical master and
should be replaced with true recomposed generations.
