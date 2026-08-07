(function () {
  const body = document.body;
  const toggle = document.querySelector("[data-menu-toggle]");
  const scriptSource = document.currentScript?.src || window.location.href;
  const loaderImagePath = new URL(
    "assets/metis-astrolabe-loader.png",
    scriptSource
  ).href;
  const introStorageKey = "phokus-intro-loaded";
  const initialIntroDuration = 3000;

  const wait = (duration) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, duration);
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

  const startIntroLoader = () => {
    const loader = mountIntroLoader();
    const minimumTime = hasCompletedInitialIntro()
      ? Promise.resolve()
      : wait(initialIntroDuration);

    Promise.all([minimumTime, waitForPageImages()]).then(() => {
      setInitialIntroComplete();
      loader.classList.add("is-hidden");
      body.classList.remove("intro-loading");
      window.setTimeout(() => {
        loader.remove();
      }, 520);
    });
  };

  startIntroLoader();

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
