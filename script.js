(function () {
  const body = document.body;
  const toggle = document.querySelector("[data-menu-toggle]");
  const scriptSource = document.currentScript?.src || window.location.href;
  const loaderImagePath = new URL(
    "assets/metis-astrolabe-loader.webp",
    scriptSource
  ).href;
  const introStorageKey = "phokus-intro-loaded";
  const initialIntroDuration = 700;
  const maxIntroDuration = 1600;
  // The briefing is paced by the visitor, not by a timer. These are only the
  // beats between a card settling and its key appearing.
  const introKeyDelay = 700;
  const introStepFade = 360;
  const introQuestionDelay = 460;
  const introMergeDuration = 2000;

  // The categorisation is taught before the work is shown, so the index reads
  // as a rule rather than as an arbitrary split.
  const introSteps = [
    {
      rule: "If it has an audience",
      term: "Image",
      gloss: "Campaigns, film, stills, generative production",
    },
    {
      rule: "If it has a user",
      term: "Product",
      gloss: "Mobile apps, websites, internal tools",
    },
  ];

  const wait = (duration) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, duration);
    });

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let releaseIntro = () => {};
  const introDone = new Promise((resolve) => {
    releaseIntro = resolve;
  });

  const hasCompletedInitialIntro = () => {
    try {
      return window.sessionStorage.getItem(introStorageKey) === "true";
    } catch (error) {
      return false;
    }
  };

  const setInitialIntroComplete = () => {
    try {
      window.sessionStorage.setItem(introStorageKey, "true");
    } catch (error) {
      // Storage can be unavailable in private or local file contexts.
    }
  };

  const waitForImage = (image) => {
    if (image.complete) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const finish = () => resolve();
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    });
  };

  const waitForPageImages = () => {
    const images = Array.from(document.images);
    return Promise.all(images.map(waitForImage));
  };

  const mountIntroLoader = () => {
    const loader = document.createElement("div");
    const wheel = document.createElement("div");
    const image = document.createElement("img");

    loader.className = "intro-loader";
    loader.setAttribute("role", "progressbar");
    loader.setAttribute("aria-label", "Loading");
    wheel.className = "intro-loader-wheel";
    image.className = "intro-loader-image";
    image.src = loaderImagePath;
    image.alt = "";
    image.decoding = "async";

    wheel.appendChild(image);
    loader.appendChild(wheel);
    body.appendChild(loader);
    body.classList.add("intro-loading");

    return loader;
  };

  const removeIntroLoader = (loader) => {
    loader.classList.add("is-hidden");
    body.classList.remove("intro-loading");
    window.setTimeout(() => {
      loader.remove();
    }, 520);
  };

  const buildIntroBrief = (loader) => {
    const brief = document.createElement("div");
    const slot = document.createElement("div");
    const list = document.createElement("ol");

    brief.className = "intro-brief";
    slot.className = "intro-slot";
    list.className = "intro-steps";

    const items = introSteps.map((step) => {
      const item = document.createElement("li");
      const rule = document.createElement("span");
      const term = document.createElement("span");
      const gloss = document.createElement("span");

      item.className = "intro-step";
      rule.className = "intro-rule";
      term.className = "intro-term";
      gloss.className = "intro-gloss";
      rule.textContent = step.rule;
      term.textContent = step.term;
      gloss.textContent = step.gloss;

      item.append(rule, term, gloss);
      list.appendChild(item);
      return item;
    });

    const question = document.createElement("p");
    const dotsWrap = document.createElement("div");
    const key = document.createElement("button");

    // Built from the same rule/term pair as a card, so the closing frame is the
    // last slide of the briefing rather than a different kind of screen.
    const askRule = document.createElement("span");
    const askTerm = document.createElement("span");
    // The word and its question mark are separate so the word alone can travel
    // to the homepage lockup while the mark is dropped on the way.
    const askWord = document.createElement("span");
    const askMark = document.createElement("span");

    question.className = "intro-question";
    askRule.className = "intro-rule";
    askRule.textContent = "Ready to";
    askTerm.className = "intro-term";
    askWord.className = "intro-term-word";
    askWord.textContent = "Phokus";
    askMark.className = "intro-term-mark";
    askMark.textContent = "?";
    askTerm.append(askWord, askMark);
    question.append(askRule, askTerm);
    dotsWrap.className = "intro-dots";
    dotsWrap.setAttribute("aria-hidden", "true");
    key.className = "intro-key";
    key.type = "button";

    const dots = introSteps.map(() => {
      const dot = document.createElement("span");
      dot.className = "intro-dot";
      dotsWrap.appendChild(dot);
      return dot;
    });

    slot.append(list, question);
    brief.append(slot, dotsWrap, key);
    loader.appendChild(brief);
    loader.classList.add("has-brief");

    return { items, dots, dotsWrap, question, key, askTerm, askWord };
  };

  // Two frames is what a transition needs to see a starting value before it is
  // given an ending one. The timer is a floor, not a nicety: a document that is
  // not producing frames would otherwise never resolve this, and the intro gate
  // waits on it.
  const nextFrame = () =>
    Promise.race([
      new Promise((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      }),
      wait(120),
    ]);

  // The visible bounds of the leading word of a text node, which is not the
  // same as the element's box: the homepage lockup carries a full stop and the
  // briefing carries a question mark, and only the word itself should be lined
  // up between the two.
  const leadingWordRect = (element) => {
    const text = element.firstChild;

    if (!text || text.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const word = text.textContent.match(/^[A-Za-z]+/);

    if (!word) {
      return null;
    }

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, word[0].length);
    return range.getBoundingClientRect();
  };

  // The briefing does not dismiss, it hands over: the word the visitor just read
  // becomes the word already sitting on the homepage. A clone of it flies from
  // the closing card to the lockup while the veil behind clears, so the two are
  // never seen as two things.
  const mergeIntroBrand = async (loader, term, word) => {
    const brand = document.querySelector("[data-brand-target]");

    if (!brand) {
      return false;
    }

    // Both ends are measured the same way, over the letters only, so the two
    // words are lined up on the word and not on whatever box happens to hold it.
    const from = leadingWordRect(word);
    const to = leadingWordRect(brand);

    if (!from || !to || !from.width || !to.width) {
      return false;
    }

    const termStyle = window.getComputedStyle(term);
    const scale =
      parseFloat(window.getComputedStyle(brand).fontSize) /
      parseFloat(termStyle.fontSize) || 1;

    // The clone leaves the loader's stacking and perspective context entirely,
    // so its fixed coordinates are plain viewport coordinates.
    const flier = document.createElement("span");
    flier.className = "brand-flier";
    flier.setAttribute("aria-hidden", "true");
    flier.textContent = word.textContent;
    [
      "color",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "letterSpacing",
      "lineHeight",
      "textTransform",
    ].forEach((property) => {
      flier.style[property] = termStyle[property];
    });
    flier.style.left = `${from.left}px`;
    flier.style.top = `${from.top}px`;
    flier.style.transform = "translate(0px, 0px) scale(1)";
    body.appendChild(flier);

    // A fixed box positioned by its corner does not put its letters where an
    // inline span did, so the clone is nudged until its word sits exactly on the
    // word it replaces.
    const placed = leadingWordRect(flier);

    if (!placed) {
      flier.remove();
      return false;
    }

    const originX =
      from.left + (from.width - placed.width) / 2 + (from.left - placed.left);
    const originY =
      from.top + (from.height - placed.height) / 2 + (from.top - placed.top);

    flier.style.left = `${originX}px`;
    flier.style.top = `${originY}px`;

    // Scaling happens about the box corner, so the travel is whatever is left
    // over once the shrink has already moved the letters partway there.
    const centre = (rect, axis) =>
      axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const shiftX = centre(to, "x") - (originX + scale * (centre(from, "x") - originX));
    const shiftY = centre(to, "y") - (originY + scale * (centre(from, "y") - originY));

    brand.style.visibility = "hidden";
    loader.classList.add("is-merging");

    await nextFrame();

    flier.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(${scale})`;

    await wait(introMergeDuration);

    brand.style.visibility = "";
    flier.remove();
    loader.remove();
    body.classList.remove("intro-loading");

    return true;
  };

  // The briefing is a gate, not a progress bar, so it is announced as a dialog
  // and it waits on the visitor rather than on a timer.
  const runIntroBriefing = async (loader) => {
    const { items, dots, dotsWrap, question, key, askTerm, askWord } =
      buildIntroBrief(loader);

    loader.setAttribute("role", "dialog");
    loader.setAttribute("aria-modal", "true");
    loader.setAttribute("aria-label", "How Phokus organises work");

    const press = () =>
      new Promise((resolve) => {
        key.addEventListener("click", resolve, { once: true });
      });

    // The key is deliberately not focused, because a programmatic focus ring
    // would draw a box around bare type. Enter and Space are handled here
    // instead, so the briefing is still fully keyboard-driven; anyone who tabs
    // to the key gets a real focus ring and the button's own activation.
    const keyboard = new AbortController();
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        if (
          !key.classList.contains("is-current") ||
          document.activeElement === key
        ) {
          return;
        }
        event.preventDefault();
        key.click();
      },
      { signal: keyboard.signal }
    );

    // The key lands a beat after its card, so the sentence is read before the
    // way out of it is offered. Only the closing key is marked final, which is
    // what earns it the rule under the word.
    const offerKey = async (label, description, delay, final = false) => {
      key.classList.remove("is-current");
      await wait(delay);
      key.textContent = label;
      key.setAttribute("aria-label", description);
      key.classList.toggle("is-final", final);
      key.classList.add("is-current");
    };

    if (prefersReducedMotion()) {
      loader.classList.add("is-static");
      items.forEach((item) => item.classList.add("is-current"));
      dotsWrap.hidden = true;
    } else {
      for (let step = 0; step < items.length; step += 1) {
        items[step].classList.add("is-current");
        dots.forEach((dot, position) => {
          dot.classList.toggle("is-current", position === step);
          dot.classList.toggle("is-done", position < step);
        });

        await offerKey(
          "Next",
          `Next, step ${step + 1} of ${items.length}`,
          introKeyDelay
        );
        await press();

        items[step].classList.remove("is-current");
        key.classList.remove("is-current");
        await wait(introStepFade);
      }

      dotsWrap.classList.add("is-spent");
    }

    question.classList.add("is-current");
    await offerKey("Yes", "Yes, enter the site", introQuestionDelay, true);

    await press();
    keyboard.abort();

    // The gate covers the whole page, so it has to come down even if the
    // handover cannot be measured or drawn. Anything going wrong here costs the
    // flourish, never the way in.
    let merged = false;

    try {
      merged = !prefersReducedMotion() && (await mergeIntroBrand(loader, askTerm, askWord));
    } catch (error) {
      merged = false;
      // A handover abandoned part way through must not leave the clone on screen
      // or the real lockup hidden behind it.
      document.querySelector(".brand-flier")?.remove();
      const stranded = document.querySelector("[data-brand-target]");
      if (stranded) {
        stranded.style.visibility = "";
      }
    }

    if (!merged) {
      removeIntroLoader(loader);
    }
  };

  const startIntroLoader = () => {
    const loader = mountIntroLoader();
    const firstVisit = !hasCompletedInitialIntro();
    const finish = () => {
      setInitialIntroComplete();
      removeIntroLoader(loader);
      releaseIntro();
    };

    // The briefing runs once, on the homepage only. Every interior page and
    // every later visit in the session keeps the fast loader, so the rule is
    // taught without being repeated.
    if (firstVisit && body.dataset.page === "home") {
      // The briefing clears its own loader, because how it leaves is part of it.
      runIntroBriefing(loader).then(() => {
        setInitialIntroComplete();
        releaseIntro();
      });
      return;
    }

    const minimumTime = firstVisit
      ? wait(initialIntroDuration)
      : Promise.resolve();
    // Never let slow or numerous hero masters hold the first paint hostage.
    const artReady = Promise.race([waitForPageImages(), wait(maxIntroDuration)]);

    Promise.all([minimumTime, artReady]).then(finish);
  };

  startIntroLoader();

  const siteMenu = document.querySelector("[data-site-menu]");

  if (toggle) {
    const menuLabel = toggle.querySelector("[data-menu-label]");

    const setMenu = (open) => {
      body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));

      if (menuLabel) {
        menuLabel.textContent = open ? "Close" : "Menu";
      }

      if (open && siteMenu) {
        const firstLink = siteMenu.querySelector("a");
        if (firstLink) {
          firstLink.focus({ preventScroll: true });
        }
      }
    };

    toggle.addEventListener("click", () => {
      setMenu(!body.classList.contains("menu-open"));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && body.classList.contains("menu-open")) {
        setMenu(false);
        toggle.focus({ preventScroll: true });
      }
    });
  }

  const page = body.dataset.page;
  if (page) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.getAttribute("data-nav") === page) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  const reel = document.querySelector("[data-reel]");
  const strip = reel && reel.querySelector("[data-reel-strip]");

  if (reel && strip) {
    const stage = reel.querySelector("[data-reel-stage]");
    const cells = Array.from(strip.querySelectorAll(".reel-cell"));
    const links = cells.map((cell) => cell.querySelector(".reel-link"));
    const readoutName = reel.querySelector("[data-readout-name]");
    const readoutKind = reel.querySelector("[data-readout-kind]");
    const readoutYear = reel.querySelector("[data-readout-year]");
    const readoutFrame = reel.querySelector("[data-readout-frame]");
    const counter = reel.querySelector("[data-reel-counter]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let index = 0;
    let autoplayTimer = null;
    let engaged = false;

    const pad = (value) => String(value).padStart(2, "0");

    // The reel steps over whatever the filter is showing, so every bound below
    // is drawn from this rather than from the length of the strip.
    const shown = () => cells.filter((cell) => !cell.hidden);
    const shownAt = (position) => shown().indexOf(cells[position]);
    const isShown = (position) => cells[position] && !cells[position].hidden;

    // Walks outward from a position until it finds a cell the filter is showing,
    // so a step never lands on something hidden and never silently stalls.
    const seek = (from, direction, { wrap = false } = {}) => {
      const set = shown();

      if (!set.length) {
        return null;
      }

      for (let at = from; at >= 0 && at < cells.length; at += direction) {
        if (isShown(at)) {
          return at;
        }
      }

      if (!wrap) {
        return null;
      }

      const edge = direction > 0 ? set[0] : set[set.length - 1];
      return cells.indexOf(edge);
    };

    // Measured rather than assumed, so cell height or gap changes in CSS need
    // no matching change here.
    const shiftFor = (target) => {
      const cell = cells[target];
      const focusRatio =
        parseFloat(
          getComputedStyle(reel).getPropertyValue("--focus-line")
        ) / 100 || 0.5;
      const focusPoint = reel.clientHeight * focusRatio;
      return focusPoint - (cell.offsetTop + cell.offsetHeight / 2);
    };

    const render = () => {
      cells.forEach((cell, position) => {
        cell.classList.toggle("is-active", position === index);
      });

      strip.style.setProperty("--strip-shift", `${shiftFor(index)}px`);

      if (stage) {
        stage.style.setProperty("--reel-offset", String(index));
      }

      const link = links[index];
      if (link) {
        if (readoutName) {
          readoutName.textContent = link.dataset.name || "";
        }
        if (readoutKind) {
          readoutKind.textContent = link.dataset.kind || "";
        }
        if (readoutYear) {
          readoutYear.textContent = link.dataset.year || "";
        }
        if (readoutFrame) {
          readoutFrame.textContent = link.dataset.frame || "";
        }
      }

      if (counter) {
        // Counts the filtered set, so the readout matches what can be reached.
        counter.textContent = `${pad(Math.max(shownAt(index), 0) + 1)} / ${pad(
          shown().length
        )}`;
      }
    };

    const goTo = (target, { focus = false } = {}) => {
      const clamped = Math.min(Math.max(target, 0), cells.length - 1);
      // A hidden target is snapped to the nearest visible cell in either
      // direction, so the reel can never come to rest on something filtered out.
      const landing = isShown(clamped)
        ? clamped
        : seek(clamped, 1) ?? seek(clamped, -1);

      if (landing === null) {
        return;
      }

      index = landing;
      render();
      if (focus && links[index]) {
        links[index].focus({ preventScroll: true });
      }
    };

    const stopAutoplay = () => {
      if (autoplayTimer !== null) {
        window.clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    };

    const startAutoplay = () => {
      if (engaged || reducedMotion.matches || autoplayTimer !== null) {
        return;
      }
      autoplayTimer = window.setInterval(() => {
        const next = seek(index + 1, 1, { wrap: true });
        if (next !== null) {
          goTo(next);
        }
      }, 3400);
    };

    // Any deliberate input hands control over for good; the reel should never
    // move under someone who is reading it.
    const engage = () => {
      engaged = true;
      stopAutoplay();
    };

    let wheelLock = false;
    reel.addEventListener(
      "wheel",
      (event) => {
        const step = event.deltaY > 0 ? 1 : -1;
        const next = seek(index + step, step);

        // At either end the page keeps its own scroll, so the reel never traps
        // the visitor.
        if (next === null) {
          return;
        }

        event.preventDefault();
        engage();

        if (wheelLock) {
          return;
        }
        wheelLock = true;
        window.setTimeout(() => {
          wheelLock = false;
        }, 260);

        goTo(next);
      },
      { passive: false }
    );

    strip.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;

      if (step) {
        const next = seek(index + step, step);
        if (next === null) {
          return;
        }
        event.preventDefault();
        engage();
        goTo(next, { focus: true });
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        engage();
        goTo(seek(0, 1) ?? 0, { focus: true });
      } else if (event.key === "End") {
        event.preventDefault();
        engage();
        goTo(seek(cells.length - 1, -1) ?? cells.length - 1, { focus: true });
      }
    });

    links.forEach((link, position) => {
      // A cell has to be in focus before it becomes a door, so nobody is
      // navigated somewhere they were only looking at.
      link.addEventListener("click", (event) => {
        if (position !== index) {
          event.preventDefault();
          engage();
          goTo(position);
        }
      });

      link.addEventListener("focus", () => {
        if (position !== index) {
          engage();
          goTo(position);
        }
      });
    });

    let touchOrigin = null;
    reel.addEventListener(
      "touchstart",
      (event) => {
        touchOrigin = event.touches[0].clientY;
      },
      { passive: true }
    );

    reel.addEventListener(
      "touchmove",
      (event) => {
        if (touchOrigin === null) {
          return;
        }
        const delta = touchOrigin - event.touches[0].clientY;
        if (Math.abs(delta) < 42) {
          return;
        }
        const step = delta > 0 ? 1 : -1;
        const next = seek(index + step, step);
        touchOrigin = event.touches[0].clientY;
        if (next === null) {
          return;
        }
        engage();
        goTo(next);
      },
      { passive: true }
    );

    reel.addEventListener("mouseenter", stopAutoplay);
    reel.addEventListener("mouseleave", startAutoplay);

    window.addEventListener("resize", render);

    // ------------------------------------------------------------------
    // Filter. Switches the reel between the two kinds of work without leaving
    // the page, so a visitor is never made to scroll past the door they did not
    // come for. There is no combined state: one kind is always held, which is
    // why the reel is filtered on load rather than starting wide open.
    // ------------------------------------------------------------------
    const filter = document.querySelector("[data-filter]");
    const DEFAULT_KIND = "Image";

    if (filter) {
      const filterToggle = filter.querySelector("[data-filter-toggle]");
      const filterLabel = filter.querySelector("[data-filter-label]");
      const options = Array.from(filter.querySelectorAll(".filter-option"));

      const setFilterOpen = (open) => {
        filter.classList.toggle("is-open", open);
        if (filterToggle) {
          filterToggle.setAttribute("aria-expanded", String(open));
        }
      };

      const applyKind = (kind) => {
        cells.forEach((cell, position) => {
          const link = links[position];
          cell.hidden = link?.dataset.kind !== kind;
        });

        options.forEach((option) => {
          option.setAttribute(
            "aria-pressed",
            String(option.dataset.kind === kind)
          );
        });

        if (filterLabel) {
          filterLabel.textContent = `Filter / ${kind}`;
        }

        // Keep the visitor on the project they were looking at when it survives
        // the filter; goTo snaps to the nearest survivor when it does not.
        goTo(index);
      };

      options.forEach((option) => {
        option.addEventListener("click", () => {
          const kind = option.dataset.kind || DEFAULT_KIND;

          if (option.getAttribute("aria-pressed") === "true") {
            setFilterOpen(false);
            return;
          }

          engage();
          setFilterOpen(false);

          if (prefersReducedMotion()) {
            applyKind(kind);
            return;
          }

          // The strip is taken out before the set changes, so the relayout is
          // never seen as a jump.
          reel.classList.add("is-refiltering");
          window.setTimeout(() => {
            applyKind(kind);
            reel.classList.remove("is-refiltering");
          }, 220);
        });
      });

      if (filterToggle) {
        filterToggle.addEventListener("click", () => {
          setFilterOpen(!filter.classList.contains("is-open"));
        });
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && filter.classList.contains("is-open")) {
          setFilterOpen(false);
          filterToggle?.focus({ preventScroll: true });
        }
      });

      document.addEventListener("click", (event) => {
        if (
          filter.classList.contains("is-open") &&
          !filter.contains(event.target)
        ) {
          setFilterOpen(false);
        }
      });

      // The strip is authored with both kinds interleaved, so the opening state
      // has to be filtered here rather than left to the markup.
      applyKind(DEFAULT_KIND);
    }

    render();
    // Held until the intro clears, so the reel is on its first project when the
    // visitor first sees it rather than part way through the set.
    introDone.then(startAutoplay);
  }

  const viewportRatio = document.querySelector("[data-viewport-ratio]");

  if (viewportRatio) {
    let ratioFrame = null;

    const renderViewportRatio = () => {
      ratioFrame = null;
      const ratio = window.innerWidth / Math.max(1, window.innerHeight);
      const shape =
        ratio > 1.15 ? "horizontal" : ratio < 0.85 ? "vertical" : "square";
      viewportRatio.textContent = `${ratio.toFixed(2)}:1 / ${shape}`;
    };

    const requestViewportRatio = () => {
      if (ratioFrame === null) {
        ratioFrame = window.requestAnimationFrame(renderViewportRatio);
      }
    };

    renderViewportRatio();
    window.addEventListener("resize", requestViewportRatio);
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch (error) {
        button.textContent = value;
      }
      window.setTimeout(() => {
        button.textContent = "Copy email";
      }, 1600);
    });
  });

  const form = document.querySelector("[data-contact-form]");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const status = form.querySelector("[data-form-status]");
      if (status) {
        status.textContent = "Signal drafted. Use the email link to send it.";
      }
    });
  }
})();
