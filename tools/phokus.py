#!/usr/bin/env python3
"""PHOKUS — turn a published Notion campaign page into a Phokus project page.

    pull     <slug> <notion-id>   cache the Notion page JSON
    harvest  <slug>               download attachments into assets/Projects/<slug>/
    thumb    <slug> <still> [--focus=X,Y] [--zoom=F]   cut a 9:16 reel thumbnail
    outline  <slug>               write tools/campaigns/<slug>.json with empty copy slots
    scaffold <slug>               render project-<slug>.html from the brief
    webp     <still>...           re-encode as WebP and repoint every reference
    check                         verify the built site

Stage K (writing the copy) happens by hand in the brief between outline and
scaffold. scaffold refuses to overwrite an existing page unless --force is
passed, because the generated HTML is meant to be owned by hand afterwards.

The CAMPAIGNS workspace is not reachable through the Notion API integration,
so this reads the public page API of the published site instead.
"""

import glob
import itertools
import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.parse
import urllib.request

NOTION_HOST = os.environ.get("PHOKUS_NOTION_HOST", "general-loaf-b3f.notion.site")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIEFS = os.path.join(ROOT, "tools", "campaigns")
RAW = os.path.join(BRIEFS, "_raw")

# Long edge for harvested stills. The reel thumbnails and proof shots never
# render larger than this, and the muse masters at 2-3MB are already too heavy.
MAX_EDGE = 1600

# WebP quality. 82 is where the size curve flattens: 90 costs roughly half again
# as many bytes for a difference that does not survive being looked at, and 75
# starts to soften edges on the muse artwork. -m 6 is the densest, slowest
# search, which is the right trade when a file is encoded once and served
# forever.
WEBP_QUALITY = 82

# Everything that can name an image: markup, the stylesheet, the loader's
# preload list, and the briefs. A rewrite that skipped any one of these would
# leave a dead reference behind.
REFERRERS = ("*.html", "styles.css", "script.js", os.path.join("tools", "campaigns", "*.json"))


# --------------------------------------------------------------------------
# shared


def die(msg):
    print(f"phokus: {msg}", file=sys.stderr)
    sys.exit(1)


def dashed(page_id):
    raw = page_id.replace("-", "")
    if len(raw) != 32:
        die(f"not a notion id: {page_id}")
    return f"{raw[0:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"


def raw_path(slug):
    return os.path.join(RAW, f"{slug}.json")


def brief_path(slug):
    return os.path.join(BRIEFS, f"{slug}.json")


def load_blocks(slug):
    path = raw_path(slug)
    if not os.path.exists(path):
        die(f"no cached page for {slug!r} — run: phokus.py pull {slug} <notion-id>")
    with open(path) as fh:
        data = json.load(fh)
    return data["recordMap"]["block"]


def block(blocks, block_id):
    value = blocks.get(block_id, {}).get("value", {})
    return value.get("value", value)


def rich(prop):
    """Flatten a Notion rich-text property, keeping any URL it carries."""
    out = []
    for span in prop or []:
        text = span[0] if span else ""
        for fmt in (span[1] if len(span) > 1 else []) or []:
            if fmt[0] in ("a", "p"):
                text = f"{text} <{fmt[1]}>"
            elif fmt[0] == "lm" and isinstance(fmt[1], dict):
                text = f"{fmt[1].get('title') or text} <{fmt[1].get('href', '')}>"
        out.append(text)
    return "".join(out)


def walk(blocks, block_id, depth=0):
    value = block(blocks, block_id)
    if not value:
        return
    yield depth, value
    for child in value.get("content", []) or []:
        yield from walk(blocks, child, depth + 1)


# --------------------------------------------------------------------------
# P — pull


def cmd_pull(slug, page_id):
    page_id = dashed(page_id)
    os.makedirs(RAW, exist_ok=True)
    body = json.dumps(
        {
            "page": {"id": page_id},
            "limit": 300,
            "cursor": {"stack": []},
            "chunkNumber": 0,
            "verticalColumns": False,
        }
    ).encode()
    req = urllib.request.Request(
        f"https://{NOTION_HOST}/api/v3/loadCachedPageChunkV2",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": UA},
    )
    with urllib.request.urlopen(req) as resp:
        payload = json.load(resp)
    if not payload.get("recordMap", {}).get("block"):
        die(f"empty response for {page_id} — is the page published to web?")
    with open(raw_path(slug), "w") as fh:
        json.dump(payload, fh)

    blocks = payload["recordMap"]["block"]
    root = block(blocks, page_id)
    title = rich(root.get("properties", {}).get("title"))
    print(f"pulled {slug}: {title}")
    for depth, value in walk(blocks, page_id):
        props = value.get("properties") or {}
        label = rich(props.get("title")) or rich(props.get("source"))
        print(f"  {'  ' * depth}[{value.get('type')}] {label}".rstrip())


# --------------------------------------------------------------------------
# H — harvest


def sips(*args):
    return subprocess.run(["sips", *args], capture_output=True, text=True)


def cwebp(*args):
    """sips cannot write WebP on any macOS version, so this shells out to the
    reference encoder instead. Install it with `brew install webp`."""
    try:
        return subprocess.run(["cwebp", *args], capture_output=True, text=True)
    except FileNotFoundError:
        die("cwebp not found — install it with: brew install webp")


def dimensions(path):
    out = sips("-g", "pixelWidth", "-g", "pixelHeight", path).stdout
    width = re.search(r"pixelWidth:\s*(\d+)", out)
    height = re.search(r"pixelHeight:\s*(\d+)", out)
    if not (width and height):
        die(f"could not read dimensions of {path}")
    return int(width.group(1)), int(height.group(1))


def cmd_harvest(slug):
    blocks = load_blocks(slug)
    page_id = next(iter(blocks))
    out_dir = os.path.join(ROOT, "assets", "Projects", slug)
    os.makedirs(out_dir, exist_ok=True)

    found = []
    for _, value in walk(blocks, dashed_root(blocks)):
        if value.get("type") != "image":
            continue
        source = (value.get("properties") or {}).get("source")
        if source:
            found.append((value["id"], rich(source)))
    if not found:
        die(f"no images on the {slug} page")

    harvested = []
    for index, (block_id, source) in enumerate(found, start=1):
        url = (
            f"https://{NOTION_HOST}/image/{urllib.parse.quote(source, safe='')}"
            f"?table=block&id={block_id}&cache=v2"
        )
        stem = f"{slug}-{index:02d}"
        tmp = os.path.join(out_dir, f".{stem}.download")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req) as resp, open(tmp, "wb") as fh:
            fh.write(resp.read())

        final = os.path.join(out_dir, f"{stem}.jpg")
        result = sips("-s", "format", "jpeg", "-s", "formatOptions", "82", tmp, "--out", final)
        os.remove(tmp)
        if result.returncode != 0:
            die(f"sips could not convert {source}: {result.stderr.strip()}")

        width, height = dimensions(final)
        if max(width, height) > MAX_EDGE:
            sips("-Z", str(MAX_EDGE), final)
            width, height = dimensions(final)

        rel = os.path.relpath(final, ROOT)
        harvested.append({"src": rel, "width": width, "height": height})
        size = os.path.getsize(final) // 1024
        print(f"  {rel}  {width}x{height}  {size}KB  (from {source.split(':')[-1]})")

    _ = page_id
    return harvested


def cmd_thumb(slug, source, focus="50,50", zoom=1.0):
    """Cut a 9:16 reel thumbnail out of a harvested still.

    Reel cells are a fixed 9:16 box with object-fit: cover, so a landscape or
    panoramic still gets centre-cropped to a slice that is often the wrong part
    of the frame. --focus picks the centre of the crop as percentages, and
    --zoom takes a fraction of the frame instead of all of it, which is how you
    exclude an unwanted edge such as the start of the next section.
    """
    src = os.path.join(ROOT, source) if not os.path.isabs(source) else source
    if not os.path.exists(src):
        die(f"no such still: {source}")
    width, height = dimensions(src)
    focus_x, focus_y = (float(part) / 100 for part in focus.split(","))

    crop_h = round(height * zoom)
    crop_w = round(crop_h * 9 / 16)
    if crop_w > width:
        crop_w = width
        crop_h = round(width * 16 / 9)

    # --cropOffset takes the absolute top-left of the crop, not a shift from
    # the centre, so the focus point is converted straight to an origin.
    left = min(max(round(width * focus_x - crop_w / 2), 0), width - crop_w)
    top = min(max(round(height * focus_y - crop_h / 2), 0), height - crop_h)

    out = os.path.join(ROOT, "assets", "Projects", slug, f"{slug}-thumb.jpg")
    result = sips(
        "-c", str(crop_h), str(crop_w),
        "--cropOffset", str(top), str(left),
        src, "--out", out,
    )
    if result.returncode != 0:
        die(f"sips could not crop: {result.stderr.strip()}")
    final_w, final_h = dimensions(out)
    rel = os.path.relpath(out, ROOT)
    print(f"  {rel}  {final_w}x{final_h}  (9:16 from {source} @ {focus}, zoom {zoom})")
    return {"src": rel, "width": final_w, "height": final_h}


def cmd_webp(*sources):
    """Re-encode stills as WebP and repoint every reference at the new file.

    The muse masters are PNGs carrying photographic artwork, which is the worst
    case a lossless format can be handed: at q82 they land near a tenth of their
    original size with nothing visible lost. Alpha survives the conversion, so
    the cutouts keep their transparency and do not need a JPG's flat matte.

    Dimensions are untouched, so the width and height already recorded in a
    brief stay correct and the pages do not need re-scaffolding.

    The original is left on disk rather than deleted, so the swap can be read as
    an ordinary diff and reverted before anything is actually removed.
    """
    converted = []
    for source in sources:
        src = os.path.join(ROOT, source) if not os.path.isabs(source) else source
        if not os.path.exists(src):
            die(f"no such still: {source}")
        out = f"{os.path.splitext(src)[0]}.webp"
        result = cwebp("-q", str(WEBP_QUALITY), "-m", "6", "-quiet", src, "-o", out)
        if result.returncode != 0:
            die(f"cwebp could not convert {source}: {result.stderr.strip()}")
        before, after = os.path.getsize(src), os.path.getsize(out)
        print(
            f"  {os.path.relpath(out, ROOT)}  "
            f"{before / 1048576:.2f}MB -> {after / 1024:.0f}KB"
            f"  ({after / before * 100:.0f}% of original)"
        )
        converted.append((os.path.basename(src), os.path.basename(out)))

    for pattern in REFERRERS:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            with open(path) as fh:
                original = fh.read()
            text = original
            for old, new in converted:
                text = text.replace(old, new)
            if text != original:
                with open(path, "w") as fh:
                    fh.write(text)
                print(f"  repointed {os.path.relpath(path, ROOT)}")


def dashed_root(blocks):
    """The page block is the only one whose parent is not another block here."""
    for block_id in blocks:
        value = block(blocks, block_id)
        if value.get("type") == "page":
            return block_id
    return next(iter(blocks))


# --------------------------------------------------------------------------
# O — outline


def spans(prop):
    for span in prop or []:
        for fmt in (span[1] if len(span) > 1 else []) or []:
            yield span[0] if span else "", fmt


def collect_links(blocks, root):
    """Every outbound URL on the page, in reading order, with its Notion title.

    Notion hides most of these. A `‣` is either an `lm` link mention carrying
    the href inline, or an `eoi` pointing at a separate embed block that holds
    the real URL in its format. Bookmarks keep theirs in a `link` property.
    """
    seen, links = set(), []

    def add(url, title=""):
        if not url or not url.startswith("http"):
            return
        url = url.strip()
        if url in seen:
            return
        seen.add(url)
        links.append({"url": url, "notion_title": title})

    for _, value in walk(blocks, root):
        props = value.get("properties") or {}
        fmt = value.get("format") or {}

        if value.get("type") == "bookmark":
            plain = lambda key: "".join(s[0] for s in (props.get(key) or []))
            add(plain("link"), plain("title"))

        add(fmt.get("original_url") or fmt.get("display_source"))

        for key in ("title", "source", "caption"):
            for text, mark in spans(props.get(key)):
                if mark[0] in ("a", "p"):
                    add(mark[1], text)
                elif mark[0] == "lm" and isinstance(mark[1], dict):
                    add(mark[1].get("href"), mark[1].get("title", ""))
                elif mark[0] == "eoi":
                    embed = block(blocks, mark[1])
                    embed_fmt = embed.get("format") or {}
                    embed_props = embed.get("properties") or {}
                    add(
                        embed_fmt.get("original_url")
                        or embed_fmt.get("display_source")
                        or "".join(s[0] for s in (embed_props.get("source") or [])),
                        text,
                    )
    return links


def link_meta(url):
    host = urllib.parse.urlparse(url).netloc.replace("www.", "")
    known = {
        "figma.com": ("Case study board", "Figma / mood and storyboard"),
        "instagram.com": ("Published reel", "Instagram / 9:16"),
        "youtube.com": ("Published film", "YouTube"),
        "youtu.be": ("Published film", "YouTube"),
        "behance.net": ("Case study", "Behance"),
        "runwayml.com": ("Workflow", "Runway"),
    }
    return known.get(host, ("Primary source", host))


def is_private(url):
    """Team editor URLs 404 for a visitor, so they never belong in the markup.

    Kept in the brief with a note rather than dropped, so the decision is
    visible and a screenshot can be swapped in later.
    """
    return "runwayml.com" in url and "/edit" in url


def cmd_outline(slug):
    blocks = load_blocks(slug)
    root = dashed_root(blocks)
    title = rich(block(blocks, root).get("properties", {}).get("title"))

    shots = cmd_harvest(slug)

    links, withheld = [], []
    for found in collect_links(blocks, root):
        url = found["url"]
        label, meta = link_meta(url)
        entry = {"href": url, "label": label, "meta": meta}
        if is_private(url):
            withheld.append(dict(entry, why="private team editor URL, will not open for a visitor"))
        else:
            links.append(entry)
        print(f"  link {'(withheld) ' if is_private(url) else ''}{url}")

    brief = {
        "slug": slug,
        "notion_title": title,
        "title": "",
        "eyebrow": "",
        "meta_description": "",
        "year": "",
        "kind": "Image",
        "frame": "",
        "role": "",
        "deck": "",
        "draft": True,
        "proof": {
            "kicker": "",
            "title": "",
            "note": "",
            "caption": "",
            "shots": [dict(shot, alt="", caption="") for shot in shots],
        },
        "acts": {"kicker": "", "title": "", "note": "", "items": []},
        "pipeline": {"kicker": "", "title": "", "note": "", "items": []},
        "links": {"kicker": "Open the work", "title": "Primary sources.", "items": links},
        "links_withheld": withheld,
        "reel": {"name": "", "label": "", "thumb": shots[0]["src"] if shots else ""},
    }

    os.makedirs(BRIEFS, exist_ok=True)
    existing = brief_path(slug)
    if os.path.exists(existing):
        with open(existing) as fh:
            previous = json.load(fh)
        brief = merge_brief(previous, brief)
        print(f"  merged into existing brief, keeping written copy")
    with open(existing, "w") as fh:
        json.dump(brief, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {os.path.relpath(existing, ROOT)}")


def merge_brief(previous, fresh):
    """Re-running outline must never destroy copy that was already written."""
    merged = dict(fresh)
    for key, value in previous.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_brief(value, merged[key])
        elif value not in ("", [], None):
            merged[key] = value
    return merged


# --------------------------------------------------------------------------
# U — scaffold

ENTITIES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\u2019": "&rsquo;",
    "\u2018": "&lsquo;",
    "\u201c": "&ldquo;",
    "\u201d": "&rdquo;",
    "\u2014": "&mdash;",
    "\u00d7": "&times;",
}


def esc(text):
    for char, entity in ENTITIES.items():
        text = text.replace(char, entity)
    return text


def attr(text):
    return esc(text).replace('"', "&quot;")


def cmd_scaffold(slug, force=False):
    path = brief_path(slug)
    if not os.path.exists(path):
        die(f"no brief for {slug!r} — run: phokus.py outline {slug}")
    with open(path) as fh:
        brief = json.load(fh)

    missing = [field for field in ("title", "eyebrow", "deck", "year", "frame") if not brief.get(field)]
    if missing:
        die(f"{slug}: brief is missing {', '.join(missing)} — that is stage K")

    out = os.path.join(ROOT, f"project-{slug}.html")
    if os.path.exists(out) and not force:
        die(f"{out} already exists — it is hand-owned now; pass --force to regenerate")

    with open(out, "w") as fh:
        fh.write(render(brief))
    print(f"wrote project-{slug}.html")


def wrap(text, indent):
    """Match the hand-written pages, which wrap prose rather than run it long.

    break_on_hyphens must stay off: a source break inside "re-framed" becomes a
    literal space once the browser collapses the newline.
    """
    lines = textwrap.wrap(
        esc(text), width=90 - len(indent), break_on_hyphens=False, break_long_words=False
    ) or [""]
    return f"\n{indent}".join(lines)


def render(brief):
    title = esc(brief["title"])
    draft = brief.get("draft")

    def mark(indent="          "):
        return f"{indent}<!-- DRAFT -->\n" if draft else ""

    # Sections alternate paper and blue down the page, and which ones are present
    # varies by brief, so the band is handed out in order of appearance rather
    # than fixed per section. Anything styled per band needs a rule for both.
    bands = itertools.cycle(("paper", "blue"))

    parts = [
        f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} | Phokus</title>
    <meta
      name="description"
      content="{attr(brief['meta_description'])}"
    >
    <link rel="stylesheet" href="styles.css">
  </head>
  <body data-page="project">
    <div class="site-shell">
      <!-- MENU PARKED. The key and the overlay are held here rather than deleted,
           because they come back as one piece. The script guards on the toggle
           being present, so nothing needs changing there to restore them; put the
           markup back and remove the index link below.

      <button
        class="menu-toggle utility"
        type="button"
        data-menu-toggle
        aria-expanded="false"
        aria-controls="site-menu"
      >
        <span data-menu-label>Menu</span>
        <span class="menu-toggle-rule" aria-hidden="true"></span>
      </button>

      <nav class="site-menu" id="site-menu" aria-label="Primary" data-site-menu>
        <div class="site-menu-inner">
          <a class="nav-link" href="index.html" data-nav="home">Home</a>
          <a class="nav-link" href="work.html" data-nav="work">Work</a>
          <a class="nav-link" href="archive.html" data-nav="archive">Archive</a>
          <a class="nav-link" href="about.html" data-nav="about">About</a>
          <a class="nav-link" href="contact.html" data-nav="contact">Contact</a>
        </div>
      </nav>
      -->

      <!-- The one piece of chrome while the menu is parked: without it a project
           page is a dead end, since every route out used to live in the overlay.
           It takes the slot and the type the menu key had, so the page gains a
           way back without gaining a new visual element. -->
      <a class="back-link utility" href="index.html">
        <span class="back-link-rule" aria-hidden="true"></span>
        <span>Index</span>
      </a>

      <main>
        <section class="project-hero" aria-labelledby="project-title">
          <p class="eyebrow">{esc(brief['eyebrow'])}</p>
          <h1 class="page-title" id="project-title">{title}</h1>
{mark()}          <p class="page-deck">
            {wrap(brief['deck'], ' ' * 12)}
          </p>
          <dl class="project-spec">
            <div>
              <dt>Year</dt>
              <dd>{esc(brief['year'])}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{esc(brief['kind'])}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{esc(brief['role'])}</dd>
            </div>
            <div>
              <dt>Frames</dt>
              <dd>{esc(brief['frame'])}</dd>
            </div>
          </dl>
        </section>
"""
    ]

    proof = brief["proof"]
    shots = "".join(
        f"""              <div class="proof-shot">
                <img
                  src="{attr(shot['src'])}"
                  alt="{attr(shot['alt'])}"
                  width="{shot['width']}"
                  height="{shot['height']}"
                  loading="lazy"
                  decoding="async"
                >
                <figcaption class="utility">{esc(shot['caption'])}</figcaption>
              </div>
"""
        for shot in proof["shots"]
    )
    parts.append(
        f"""
        <section class="section-band {next(bands)}" aria-labelledby="proof-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(proof['kicker'])}</p>
              <h2 class="section-title" id="proof-title">{esc(proof['title'])}</h2>
            </div>
{mark('            ')}            <p class="section-note">
              {wrap(proof['note'], ' ' * 14)}
            </p>
          </div>

          <figure class="project-proof">
            <div class="proof-pair">
{shots}            </div>
{mark('            ')}            <figcaption class="proof-note">
              {wrap(proof['caption'], ' ' * 14)}
            </figcaption>
          </figure>
        </section>
"""
    )

    # The sources sit directly under the proof, because a visitor who wants to
    # see the campaign itself should not have to read the whole case study to
    # find the way out to it.
    links = brief["links"]
    if links["items"]:
        items = "".join(
            f"""            <a
              class="project-link"
              href="{attr(item['href'])}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="link-label">{esc(item['label'])}</span>
              <span class="link-meta">{esc(item['meta'])}</span>
            </a>
"""
            for item in links["items"]
        )
        parts.append(
            f"""
        <section class="section-band {next(bands)}" aria-labelledby="links-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(links['kicker'])}</p>
              <h2 class="section-title" id="links-title">{esc(links['title'])}</h2>
            </div>
          </div>
          <div class="project-links">
{items}          </div>
        </section>
"""
        )

    acts = brief["acts"]
    if acts["items"]:
        items = "".join(
            f"""            <li>
              <span class="act-number">{esc(item['number'])}</span>
              <h3>{esc(item['title'])}</h3>
              <p>{wrap(item['copy'], ' ' * 14)}</p>
            </li>
"""
            for item in acts["items"]
        )
        parts.append(
            f"""
        <section class="section-band {next(bands)}" aria-labelledby="acts-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(acts['kicker'])}</p>
              <h2 class="section-title" id="acts-title">{esc(acts['title'])}</h2>
            </div>
{mark('            ')}            <p class="section-note">
              {wrap(acts['note'], ' ' * 14)}
            </p>
          </div>
          <ol class="project-acts">
{items}          </ol>
        </section>
"""
        )

    # Optional blocks. A website case study has to show its identity and its
    # type stack, which a campaign never needs. Both sit between the acts and
    # the pipeline, and take whichever band falls to them.
    plates = brief.get("plates") or {}
    if plates.get("items"):
        items = "".join(
            f"""            <figure class="plate-item">
              <img
                src="{attr(item['src'])}"
                alt="{attr(item['alt'])}"
                width="{item['width']}"
                height="{item['height']}"
                loading="lazy"
                decoding="async"
              >
              <figcaption>{esc(item['caption'])}</figcaption>
            </figure>
"""
            for item in plates["items"]
        )
        parts.append(
            f"""
        <section class="section-band {next(bands)}" aria-labelledby="plates-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(plates['kicker'])}</p>
              <h2 class="section-title" id="plates-title">{esc(plates['title'])}</h2>
            </div>
{mark('            ')}            <p class="section-note">
              {wrap(plates['note'], ' ' * 14)}
            </p>
          </div>
          <div class="project-plates">
{items}          </div>
        </section>
"""
        )

    type_block = brief.get("type") or {}
    if type_block.get("items"):
        items = "".join(
            f"""            <div class="type-row">
              <p class="type-specimen {item['class']}">{esc(item['specimen'])}</p>
              <div class="type-note">
                <span class="type-role">{esc(item['role'])}</span>
                <p class="type-stack">{esc(item['stack'])}</p>
              </div>
            </div>
"""
            for item in type_block["items"]
        )
        parts.append(
            f"""
        <section class="section-band {next(bands)}" aria-labelledby="type-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(type_block['kicker'])}</p>
              <h2 class="section-title" id="type-title">{esc(type_block['title'])}</h2>
            </div>
{mark('            ')}            <p class="section-note">
              {wrap(type_block['note'], ' ' * 14)}
            </p>
          </div>
          <div class="project-type">
{items}          </div>
        </section>
"""
        )

    pipeline = brief["pipeline"]
    if pipeline["items"]:
        items = "".join(
            f"""            <div class="stack-item">
              <span class="utility">{esc(item['label'])}</span>
              <p>{wrap(item['copy'], ' ' * 14)}</p>
            </div>
"""
            for item in pipeline["items"]
        )
        parts.append(
            f"""
        <section class="section-band {next(bands)}" aria-labelledby="pipeline-title">
          <div class="section-header">
            <div>
              <p class="section-kicker">{esc(pipeline['kicker'])}</p>
              <h2 class="section-title" id="pipeline-title">{esc(pipeline['title'])}</h2>
            </div>
{mark('            ')}            <p class="section-note">
              {wrap(pipeline['note'], ' ' * 14)}
            </p>
          </div>
          <div class="project-stack">
{items}          </div>
        </section>
"""
        )

    parts.append(
        f"""
        <nav class="project-next" aria-label="Project pager">
          <a href="work.html#{'product-systems' if brief['kind'] == 'Product' else 'campaign-worlds'}">
            <span class="utility">Back to</span>
            <span class="next-title">Work index</span>
          </a>
        </nav>
      </main>

      <footer class="footer">
        <p>Phokus / {title}</p>
        <p class="footer-ratio utility" data-viewport-ratio aria-hidden="true"></p>
        <a href="contact.html">Get in touch</a>
      </footer>
    </div>
    <script src="script.js"></script>
  </body>
</html>
"""
    )
    return "".join(parts)


# --------------------------------------------------------------------------
# S — check


def cmd_check():
    problems, warnings = [], []
    index = open(os.path.join(ROOT, "index.html")).read()

    plates = re.findall(r'class="reel-plate"\s*\n\s*style="background-image: url\(\'([^\']+)\'\)', index)
    cells = re.findall(r'<li class="reel-cell">(.*?)</li>', index, re.S)
    if len(plates) != len(cells):
        problems.append(f"reel: {len(plates)} stage plates but {len(cells)} strip cells")

    # The filter is a switch with no combined view, so the reel is filtered on
    # load and the counter's total counts only the kind the page opens on.
    opening = re.search(
        r'class="filter-option"[^>]*data-kind="([^"]+)"[^>]*aria-pressed="true"',
        index,
    )
    opening = opening.group(1) if opening else None
    if not opening:
        problems.append("filter: no option carries aria-pressed=\"true\", so the reel has no opening kind")

    shown = [cell for cell in cells if f'data-kind="{opening}"' in cell]
    counter = re.search(r'data-reel-counter[^>]*>(\d+) / (\d+)<', index)
    if counter and opening and int(counter.group(2)) != len(shown):
        problems.append(
            f"reel counter says /{counter.group(2)} but there are {len(shown)} "
            f"{opening} cells, which is what the reel opens on"
        )

    for position, cell in enumerate(cells):
        name = re.search(r'data-name="([^"]*)"', cell)
        name = name.group(1) if name else f"cell {position}"
        kind = re.search(r'data-kind="([^"]*)"', cell)
        if not kind or kind.group(1) not in ("Image", "Product"):
            problems.append(f"{name}: data-kind must be exactly Image or Product")
        src = re.search(r'<img src="([^"]+)"', cell)
        if src and position < len(plates) and src.group(1) != plates[position]:
            problems.append(
                f"{name}: thumbnail is {src.group(1)} but stage plate {position} "
                f"is {plates[position]} — the two layers are out of step"
            )
        alt = re.search(r'alt="([^"]*)"', cell)
        if not alt or not alt.group(1).strip():
            problems.append(f"{name}: thumbnail has empty alt text")

    for page in sorted(f for f in os.listdir(ROOT) if f.endswith(".html")):
        html = open(os.path.join(ROOT, page)).read()
        for src in re.findall(r'(?:<img[^>]+src="|url\(\')([^"\')]+)', html):
            if src.startswith(("http", "data:", "#")):
                continue
            if not os.path.exists(os.path.join(ROOT, src)):
                problems.append(f"{page}: missing asset {src}")
        for alt in re.findall(r'<img(?![^>]*\salt=)[^>]*>', html):
            problems.append(f"{page}: <img> without alt attribute — {alt[:60]}")
        drafts = html.count("<!-- DRAFT -->")
        if drafts:
            warnings.append(f"{page}: {drafts} DRAFT copy marker(s) awaiting sign-off")

    for brief_file in sorted(os.listdir(BRIEFS)) if os.path.isdir(BRIEFS) else []:
        if not brief_file.endswith(".json"):
            continue
        slug = brief_file[:-5]
        page = f"project-{slug}.html"
        if not os.path.exists(os.path.join(ROOT, page)):
            problems.append(f"{slug}: brief exists but {page} was never scaffolded")
        elif f'href="{page}"' not in index:
            problems.append(f"{slug}: {page} exists but nothing on the homepage links to it")

    for warning in warnings:
        print(f"  ~ {warning}")
    for problem in problems:
        print(f"  ! {problem}")
    if problems:
        print(f"\n{len(problems)} problem(s), {len(warnings)} warning(s)")
        sys.exit(1)
    print(f"\ncheck: structurally clean, {len(warnings)} warning(s)")


# --------------------------------------------------------------------------


def main():
    args = sys.argv[1:]
    if not args:
        die(__doc__)
    command, rest = args[0], [a for a in args[1:] if not a.startswith("--")]
    force = "--force" in args
    focus = next((a.split("=", 1)[1] for a in args if a.startswith("--focus=")), "50,50")
    zoom = float(next((a.split("=", 1)[1] for a in args if a.startswith("--zoom=")), 1.0))
    if command == "pull" and len(rest) == 2:
        cmd_pull(*rest)
    elif command == "harvest" and len(rest) == 1:
        cmd_harvest(*rest)
    elif command == "thumb" and len(rest) == 2:
        cmd_thumb(rest[0], rest[1], focus, zoom)
    elif command == "outline" and len(rest) == 1:
        cmd_outline(*rest)
    elif command == "scaffold" and len(rest) == 1:
        cmd_scaffold(rest[0], force=force)
    elif command == "webp" and rest:
        cmd_webp(*rest)
    elif command == "check" and not rest:
        cmd_check()
    else:
        die(__doc__)


if __name__ == "__main__":
    main()
