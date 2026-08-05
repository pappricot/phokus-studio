(function () {
  const body = document.body;
  const toggle = document.querySelector("[data-menu-toggle]");

  if (toggle) {
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("menu-open");
      toggle.setAttribute("aria-expanded", String(open));
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

  const hero = document.querySelector(".hero");
  const muse = document.querySelector(".hero-art img");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (hero && muse && !reducedMotion.matches) {
    let frame = null;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const updateMuseMotion = () => {
      frame = null;
      const start = hero.offsetTop;
      const travel = Math.max(1, hero.offsetHeight);
      const progress = clamp((window.scrollY - start) / travel, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const scale = 1.012 + eased * 0.078;
      const shiftX = -1.35 * eased;
      const shiftY = -0.85 * eased;

      muse.style.setProperty("--muse-scroll-scale", scale.toFixed(4));
      muse.style.setProperty("--muse-scroll-x", `${shiftX.toFixed(3)}%`);
      muse.style.setProperty("--muse-scroll-y", `${shiftY.toFixed(3)}%`);
    };

    const requestMuseMotion = () => {
      if (frame === null) {
        frame = window.requestAnimationFrame(updateMuseMotion);
      }
    };

    updateMuseMotion();
    window.addEventListener("scroll", requestMuseMotion, { passive: true });
    window.addEventListener("resize", requestMuseMotion);
  }

  const intro = document.querySelector("[data-aperture-intro]");
  const introFrame = document.querySelector("[data-aperture-frame]");
  const introImage = document.querySelector("[data-aperture-image]");
  const introHint = document.querySelector("[data-aperture-hint]");
  const heroTitle = document.querySelector(".hero-title");
  const heroArt = document.querySelector(".hero-art");

  if (intro && introFrame && introImage && heroTitle && heroArt) {
    const apertureFocus = { x: 0.395, y: 0.322 };
    let introDone = false;

    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    window.scrollTo(0, 0);

    const parsePosition = (part, fallback) => {
      const value = part.toLowerCase();
      if (value.includes("%")) {
        return Number.parseFloat(value) / 100;
      }
      if (value === "left" || value === "top") {
        return 0;
      }
      if (value === "right" || value === "bottom") {
        return 1;
      }
      if (value === "center") {
        return 0.5;
      }
      return fallback;
    };

    const getCoverMetrics = (rect, positionX, positionY) => {
      const naturalWidth = introImage.naturalWidth || 1673;
      const naturalHeight = introImage.naturalHeight || 940;
      const imageRatio = naturalWidth / naturalHeight;
      const boxRatio = rect.width / rect.height;
      let renderedWidth = rect.width;
      let renderedHeight = rect.height;

      if (imageRatio > boxRatio) {
        renderedHeight = rect.height;
        renderedWidth = renderedHeight * imageRatio;
      } else {
        renderedWidth = rect.width;
        renderedHeight = renderedWidth / imageRatio;
      }

      const offsetX = (rect.width - renderedWidth) * positionX;
      const offsetY = (rect.height - renderedHeight) * positionY;

      return { offsetX, offsetY, renderedHeight, renderedWidth };
    };

    const getApertureTarget = () => {
      const rect = heroTitle.getBoundingClientRect();
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const radius = coarse
        ? Math.max(72, Math.min(rect.width * 0.24, 118))
        : Math.max(58, Math.min(rect.width * 0.18, 104));

      return {
        x: rect.left + rect.width * 0.68,
        y: rect.top + rect.height * 0.48,
        radius,
      };
    };

    const setFrameVar = (name, value) => {
      intro.style.setProperty(name, `${value.toFixed(2)}px`);
    };

    const updateHomeFrame = () => {
      const rect = heroArt.getBoundingClientRect();
      const homeStyle = window.getComputedStyle(muse || heroArt);
      setFrameVar("--home-image-left", rect.left);
      setFrameVar("--home-image-top", rect.top);
      setFrameVar("--home-image-width", rect.width);
      setFrameVar("--home-image-height", rect.height);
      intro.style.setProperty(
        "--home-image-position",
        homeStyle.objectPosition || "right bottom"
      );
    };

    const syncIntroGeometry = () => {
      const target = getApertureTarget();
      const homeRect = heroArt.getBoundingClientRect();
      const positionParts = window
        .getComputedStyle(muse || heroArt)
        .objectPosition.split(" ");
      const positionX = parsePosition(positionParts[0] || "50%", 0.5);
      const positionY = parsePosition(positionParts[1] || "50%", 0.5);
      const cover = getCoverMetrics(homeRect, positionX, positionY);
      const focusX = cover.offsetX + cover.renderedWidth * apertureFocus.x;
      const focusY = cover.offsetY + cover.renderedHeight * apertureFocus.y;
      const shiftX = target.x - (homeRect.left + focusX);
      const shiftY = target.y - (homeRect.top + focusY);

      setFrameVar("--intro-image-left", homeRect.left);
      setFrameVar("--intro-image-top", homeRect.top);
      setFrameVar("--intro-image-width", homeRect.width);
      setFrameVar("--intro-image-height", homeRect.height);
      setFrameVar("--intro-image-shift-x", shiftX);
      setFrameVar("--intro-image-shift-y", shiftY);
      updateHomeFrame();
    };

    const revealIntro = () => {
      if (introDone) {
        return;
      }
      introDone = true;
      const target = getApertureTarget();
      const frameRect = introFrame.getBoundingClientRect();
      intro.style.setProperty("--spot-x", `${target.x}px`);
      intro.style.setProperty("--spot-y", `${target.y}px`);
      intro.style.setProperty("--mask-x", `${target.x - frameRect.left}px`);
      intro.style.setProperty("--mask-y", `${target.y - frameRect.top}px`);
      intro.classList.add("is-found");
      window.setTimeout(() => {
        intro.classList.add("is-opening");
      }, 1000);
      window.setTimeout(() => {
        updateHomeFrame();
        body.classList.add("intro-unlocking");
        intro.classList.add("is-aligning");
      }, 4000);
      window.setTimeout(() => {
        intro.classList.add("is-revealing");
      }, 7000);
      window.setTimeout(() => {
        intro.hidden = true;
        body.classList.remove("intro-active", "intro-unlocking");
        window.removeEventListener("resize", syncIntroGeometry);
        window.dispatchEvent(new Event("scroll"));
      }, 7800);
    };

    const moveIntroLight = (clientX, clientY) => {
      if (introDone) {
        return;
      }
      intro.style.setProperty("--spot-x", `${clientX}px`);
      intro.style.setProperty("--spot-y", `${clientY}px`);
      const frameRect = introFrame.getBoundingClientRect();
      intro.style.setProperty("--mask-x", `${clientX - frameRect.left}px`);
      intro.style.setProperty("--mask-y", `${clientY - frameRect.top}px`);
      if (introHint) {
        const hintX = Math.min(clientX, window.innerWidth - 112);
        const hintY = Math.min(Math.max(clientY, 28), window.innerHeight - 28);
        intro.style.setProperty("--hint-x", `${hintX}px`);
        intro.style.setProperty("--hint-y", `${hintY}px`);
      }

      const target = getApertureTarget();
      const distance = Math.hypot(clientX - target.x, clientY - target.y);
      intro.classList.toggle("is-near", distance < target.radius * 2.15);

      if (distance < target.radius) {
        revealIntro();
      }
    };

    intro.addEventListener(
      "pointermove",
      (event) => moveIntroLight(event.clientX, event.clientY),
      { passive: true }
    );
    intro.addEventListener(
      "pointerdown",
      (event) => moveIntroLight(event.clientX, event.clientY),
      { passive: true }
    );
    intro.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        revealIntro();
      }
    });
    syncIntroGeometry();
    if (!introImage.complete) {
      introImage.addEventListener("load", syncIntroGeometry, { once: true });
    }
    window.addEventListener("resize", syncIntroGeometry);
    intro.tabIndex = 0;
    intro.focus({ preventScroll: true });
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
