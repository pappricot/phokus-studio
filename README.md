# Phokus

A standalone static website concept with a regal editorial direction inspired by the provided reference screenshot.

## Pages

- `index.html`
- `work.html`
- `archive.html`
- `about.html`
- `contact.html`
- `project-<slug>.html` — one per campaign, built with PHOKUS (below)

## PHOKUS — adding a campaign

Campaign source material lives in a published Notion workspace that the Notion
API integration cannot see, so `tools/phokus.py` reads the **public** page API
of the published site instead. Six stages, one per letter.

| Stage | Command | What it does |
| --- | --- | --- |
| **P** — Pull | `phokus.py pull <slug> <notion-id>` | Caches the Notion page to `tools/campaigns/_raw/` and prints its outline |
| **H** — Harvest | folded into `outline` | Downloads attachments, converts to JPG, caps the long edge at 1600px |
| **O** — Outline | `phokus.py outline <slug>` | Writes `tools/campaigns/<slug>.json`: assets, links, and empty copy slots |
| **K** — Key in the copy | *by hand* | Fill the brief. This is the only stage that needs judgement |
| **U** — Unify | `phokus.py scaffold <slug>` | Renders `project-<slug>.html`, then wire the homepage by hand |
| **S** — Ship check | `phokus.py check` | Verifies the whole site |

The Notion page id is the 32-character hex string in its URL, with or without
dashes. `PHOKUS_NOTION_HOST` overrides the published host.

### Why scaffold rather than build

`scaffold` generates a page **once** and then refuses to touch it again unless
`--force` is passed, because the generated HTML is meant to be owned by hand
afterwards — the same way `project-shes-back.html` was written. There is no
build step, no dependency, and nothing to run before deploying. The tool
removes the boring 80%; it does not own the result.

Re-running `outline` is always safe: it merges into an existing brief and never
overwrites copy that has already been written.

### What the Notion pages do and do not give you

They are link hubs, not case studies: a Figma board, a workflow link, video
links, and a handful of stills. **There is no prose in Notion.** Every deck,
act, and pipeline line has to be written, which is why generated pages carry
`<!-- DRAFT -->` above any copy that was inferred from artifacts rather than
taken from a brief. The marker is invisible to visitors; `check` reports the
remaining count as a warning so nothing quietly ships unreviewed.

Private URLs (a Runway team `/edit` link, for example) are withheld from the
markup and recorded under `links_withheld` in the brief with the reason, so the
decision stays visible.

### Wiring the homepage

`scaffold` deliberately does not edit `index.html`. After generating a page,
make the three edits described in **Adding or changing a project** below, then
run `phokus.py check`, which will fail if the stage plate and the strip cell
have fallen out of step.

Reel cells are a fixed 9:16 box using `object-fit: cover`, so a landscape or
panoramic still gets centre-cropped to the wrong slice. `phokus.py thumb <slug>
<still> --focus=X,Y --zoom=F` cuts a proper 9:16 thumbnail: `X,Y` are
percentages naming the centre of the crop, and `F` takes a fraction of the
frame rather than all of it, which is how an unwanted edge gets excluded.

Percentages are of the file's real pixel dimensions, not of a preview.

### Optional blocks

A campaign page is six blocks, in order: hero, proof, links, acts, pipeline,
pager. The links sit third so a visitor who came to see the campaign itself does
not have to read the whole case study to find the way out to it. A website case
study needs two more blocks, so the renderer emits them only when the brief
carries them, between the acts and the pipeline.

Bands are not fixed per section. They alternate paper and blue in order of
appearance, because which sections exist varies by brief, so anything styled per
band needs a rule for both — `.act-number`, `.stack-item span`, `.type-role`, and
`.plate-item img` each carry a paper value and a `.blue` override.

| Key | Block | Use |
| --- | --- | --- |
| `plates` | `.project-plates` | An image set with per-item captions. Each plate keeps its true aspect ratio and the row sits on a common bottom edge, so the captions share a baseline |
| `type` | `.project-type` | Type specimens. Each row is set in the family it names via `is-display`, `is-utility`, or `is-body` |

The specimen modifiers are deliberately **not** the global `.display` and
`.utility` class names, which carry a weight and an uppercase transform that a
specimen must not inherit.

Anything shown in `plates` needs a web-weight derivative first. The muse masters
are 1.4–3.3MB PNGs; three of them straight onto a page would cost ~7MB, so they
are resized to a 720px long edge as JPEGs.

### A campaign with no Notion page

`scaffold` reads the brief and nothing else, so a case that did not come from
Notion — `project-phokus.html`, whose stills are screenshots of this build —
just needs `tools/campaigns/<slug>.json` written by hand. Stages P, H, and O
are skipped. Record why in a `source_note` field so the gap is explained rather
than looking like an oversight.

### Adding a future project, end to end

```sh
python3 tools/phokus.py pull   my-campaign 356b4c8a0b0a80088246f31f49e9543c
python3 tools/phokus.py outline my-campaign
# write the copy in tools/campaigns/my-campaign.json
python3 tools/phokus.py thumb  my-campaign assets/Projects/my-campaign/my-campaign-02.jpg --focus=50,40
python3 tools/phokus.py scaffold my-campaign
# wire index.html: one .reel-plate, one .reel-cell, and the work.html link
python3 tools/phokus.py check
```

### Unfinished work

A campaign that is still being made goes on the site the same way a finished one
does; there is no separate WIP state to maintain. It is marked in copy only:
`eyebrow` reads `Image / in progress`, the deck opens by saying so, and the
`pipeline` section is titled "How it is being built" rather than "How it was
built". Dark Mediterranean, Airport Checkpoint, and You're Late, Rabbit are the
three currently carrying that marking, and they sit at the tail of the reel after
the finished work.

## Editing by Hand

One rule governs everything else: for the eight projects that have a brief, the
`project-<slug>.html` file is **generated output**. Edit the brief, not the page.
`project-shes-back.html` is the single exception — it was hand-written as the
original template and has no brief, so it is edited directly and forever.

| To change | Edit | Then run |
| --- | --- | --- |
| Any copy on a project page: deck, headings, notes, captions, act and pipeline items, link labels | `tools/campaigns/<slug>.json` | `phokus.py scaffold <slug> --force` |
| Copy on the She's page | `project-shes-back.html` | nothing |
| A project's reel name, kind, year, frame, thumbnail, or position | `index.html` | nothing |
| Homepage copy, the intro briefing cards, or the Work / About / Archive / Contact pages | those files, or `introSteps` in `script.js` | nothing |
| Anything visual | `styles.css` | nothing |
| The template or section order for **every** project page | `render()` in `tools/phokus.py` | re-scaffold every slug with `--force` |

Finish with `python3 tools/phokus.py check`. It is the safety net for exactly the
mistakes that are invisible in a browser: a missing image file, an `<img>` with no
alt text, a `data-kind` that is not exactly `Image` or `Product`, a reel counter
whose total is wrong, a thumbnail out of step with its background plate, and a
brief whose page was never scaffolded or never linked from the homepage.

### When an edit looks like it did nothing

- **A brief edit needs a re-scaffold.** Nothing on the site reads the JSON at
  runtime; it is only consulted when the page is generated.
- **`scaffold` refuses to overwrite without `--force`**, and `--force` discards
  hand edits to that page. This is the reason for the rule above: a page with a
  brief should never be edited directly, because the next regeneration is silent
  about what it destroyed.
- **A project name appears three times in its own reel cell.** See [Adding or
  changing a project](#adding-or-changing-a-project) — changing the visible label
  alone leaves the readout showing the old name.
- **Each project is two DOM entries**, a `.reel-plate` and a `.reel-cell`, matched
  by position. `check` catches them drifting apart.
- **Bands alternate** paper, blue, paper, blue down a project page. Moving a
  section means re-banding everything after it, and any accent styled per band
  needs a value for both.
- **`.page-deck` is uppercased in CSS**, so writing a word in caps in the brief
  changes nothing on screen. Emphasis in a deck has to come from punctuation or
  word order.

### Conventions

Write entities rather than raw characters — `&rsquo;`, `&mdash;`, `&ldquo;` — to
match the rest of the markup; the difference is visible in the display serif.

`"draft": true` in a brief is what emits the `<!-- DRAFT -->` comments and the
checker's warnings. Flip it to `false` once the language is signed off, as
`real-metal.json` is.

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

A project's name is written three times inside its own cell, and renaming one is
not renaming the project:

| Where | Shows up as |
| --- | --- |
| `data-name` on `.reel-link` | the large name in the readout under the strip |
| `.reel-cell-name` | the small label printed on the thumbnail |
| `alt` on the `<img>` | screen readers only |

The label is deliberately a short form of a longer `data-name` in several cells —
`Muck` for `Muck Everyday Wash`, `Real Metal` for `Real Metal / Diesel-Land` — so
the two disagreeing is normal and cannot be checked automatically. A real rename
also reaches the project page's `<title>`, `<h1>`, meta description, and footer,
plus the link in `work.html`.

`data-kind` must read exactly `Image` or `Product`, because the filter matches on
it. There is no combined view, so a cell with any other kind is unreachable.

**PLACEHOLDER IMAGES:** the eight Image projects and Phokus itself carry real
stills. The four remaining Product projects (Go It, Cove, Cipher, Client
Systems) still point at a muse master chosen to match their declared frame.
Replace each with the real project still; no other change is needed.

The filter is a switch between the two doors rather than a way to narrow a
combined list, so one kind is always held. `DEFAULT_KIND` in `script.js` decides
which, and it is `Image`, so the reel opens on **Real Metal** and the strip is
filtered on load rather than starting wide open. **Phokus** stands as the first
case under **Product**, where the studio site introduces the visual system
before any client work is shown.

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
