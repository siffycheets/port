/* =========================================================
   SIFFY PORTFOLIO — PREMIUM INTERACTIONS
   GSAP + ScrollTrigger enhance the experience. Every core
   reveal still has a vanilla fallback if the CDN is blocked.
   ========================================================= */

(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const header = document.querySelector("[data-header]");
  const menuToggle = document.querySelector(".menu-toggle");
  const siteNav = document.querySelector(".site-nav");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasGsap = !prefersReducedMotion && Boolean(window.gsap && window.ScrollTrigger);

  if (hasGsap) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    root.classList.add("gsap-ready");
  }

  /* ---------- Basic page setup ---------- */
  window.addEventListener("load", () => {
    window.setTimeout(() => document.querySelector(".page-loader")?.classList.add("loaded"), 250);
    if (hasGsap) window.ScrollTrigger.refresh();
  });

  // Keep this selector specific: timeline cards also use data-year for artwork.
  const year = document.querySelector("[data-current-year]");
  if (year) year.textContent = new Date().getFullYear();

  document.querySelectorAll(".section").forEach(section => {
    if (section.querySelector(":scope > .section-wipe")) return;
    const wipe = document.createElement("span");
    wipe.className = "section-wipe";
    wipe.setAttribute("aria-hidden", "true");
    section.prepend(wipe);
  });

  /* ---------- Reusable project media ---------- */
  const projectMediaShells = [...document.querySelectorAll("[data-project-media]")];
  const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

  projectMediaShells.forEach(shell => {
    const stage = shell.querySelector("[data-media-stage]");
    const mediaType = (shell.dataset.mediaType || "image").toLowerCase();
    const imageUrl = (shell.dataset.imageUrl || "").trim();
    const youtubeId = (shell.dataset.youtubeId || "").trim();
    const title = shell.dataset.projectTitle || "Project";

    if (!stage) return;

    if (mediaType === "youtube" && youtubeIdPattern.test(youtubeId)) {
      const frame = document.createElement("iframe");
      frame.className = "project-media-asset project-media-video";
      frame.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1&playsinline=1`;
      frame.title = `${title} video preview`;
      frame.loading = "lazy";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      frame.allowFullscreen = true;
      frame.addEventListener("load", () => shell.classList.add("media-loaded"), { once: true });
      stage.appendChild(frame);
      return;
    }

    if (mediaType === "image" && imageUrl) {
      const image = new Image();
      image.className = "project-media-asset project-media-image";
      image.src = imageUrl;
      image.alt = `${title} project preview`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("load", () => shell.classList.add("media-loaded"), { once: true });
      image.addEventListener("error", () => {
        image.remove();
        shell.classList.add("media-fallback-only");
      }, { once: true });
      stage.appendChild(image);
      if (image.complete && image.naturalWidth > 0) shell.classList.add("media-loaded");
      return;
    }

    // Missing or invalid configuration intentionally leaves the styled fallback visible.
    shell.classList.add("media-fallback-only");
  });

  /* ---------- Mobile navigation ---------- */
  const closeMenu = () => {
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open navigation");
    siteNav?.classList.remove("open");
    body.classList.remove("menu-open");
  };

  menuToggle?.addEventListener("click", () => {
    const willOpen = menuToggle.getAttribute("aria-expanded") !== "true";
    menuToggle.setAttribute("aria-expanded", String(willOpen));
    menuToggle.setAttribute("aria-label", willOpen ? "Close navigation" : "Open navigation");
    siteNav?.classList.toggle("open", willOpen);
    body.classList.toggle("menu-open", willOpen);
  });
  siteNav?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeMenu(); });

  /* ---------- Scroll progress + lightweight parallax ---------- */
  const parallaxItems = [...document.querySelectorAll("[data-parallax]")];
  let scrollY = window.scrollY;
  let ticking = false;

  const updateScrollEffects = () => {
    const maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1);
    root.style.setProperty("--scroll", `${(scrollY / maxScroll) * 100}%`);
    header?.classList.toggle("scrolled", scrollY > 40);

    if (!hasGsap && !prefersReducedMotion) {
      parallaxItems.forEach(item => {
        const speed = Number(item.dataset.parallax || 0);
        const rect = item.parentElement.getBoundingClientRect();
        item.style.translate = `0 ${(window.innerHeight / 2 - rect.top) * speed}px`;
      });
    }
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    scrollY = window.scrollY;
    if (!ticking) {
      window.requestAnimationFrame(updateScrollEffects);
      ticking = true;
    }
  }, { passive: true });
  updateScrollEffects();

  /* ---------- Progressive statement text ---------- */
  const textReveal = document.querySelector(".text-reveal");
  let wordNodes = [];
  if (textReveal) {
    const words = textReveal.textContent.trim().split(/\s+/);
    textReveal.innerHTML = words.map(word => `<span class="word">${word}&nbsp;</span>`).join("");
    wordNodes = [...textReveal.querySelectorAll(".word")];
  }

  /* ---------- Vanilla reveal fallback ---------- */
  const revealItems = document.querySelectorAll(".reveal, .reveal-card, .reveal-project");
  if (!hasGsap) {
    if ("IntersectionObserver" in window && !prefersReducedMotion) {
      const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -7%" });
      revealItems.forEach(item => revealObserver.observe(item));

      if (textReveal) {
        const textObserver = new IntersectionObserver(entries => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          wordNodes.forEach((word, index) => window.setTimeout(() => word.classList.add("visible"), index * 42));
          textObserver.disconnect();
        }, { threshold: 0.4 });
        textObserver.observe(textReveal);
      }
    } else {
      revealItems.forEach(item => item.classList.add("is-visible"));
      wordNodes.forEach(word => word.classList.add("visible"));
    }
  }

  /* ---------- Cursor, lighting, tilt, and magnetic controls ---------- */
  const cursorRing = document.querySelector(".cursor-ring");
  const cursorDot = document.querySelector(".cursor-dot");
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };

  if (hasFinePointer && !prefersReducedMotion) {
    const moveRingX = hasGsap ? window.gsap.quickTo(cursorRing, "x", { duration: 0.42, ease: "power3.out" }) : null;
    const moveRingY = hasGsap ? window.gsap.quickTo(cursorRing, "y", { duration: 0.42, ease: "power3.out" }) : null;

    window.addEventListener("pointermove", event => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      root.style.setProperty("--mouse-x", `${event.clientX}px`);
      root.style.setProperty("--mouse-y", `${event.clientY}px`);
      cursorRing?.classList.add("is-visible");
      cursorDot?.classList.add("is-visible");

      if (hasGsap) {
        moveRingX(event.clientX - cursorRing.offsetWidth / 2);
        moveRingY(event.clientY - cursorRing.offsetHeight / 2);
        window.gsap.set(cursorDot, { x: event.clientX - 2.5, y: event.clientY - 2.5 });
      } else {
        cursorRing.style.transform = `translate3d(${event.clientX - 19}px,${event.clientY - 19}px,0)`;
        cursorDot.style.transform = `translate3d(${event.clientX - 2.5}px,${event.clientY - 2.5}px,0)`;
      }
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      cursorRing?.classList.remove("is-visible");
      cursorDot?.classList.remove("is-visible");
      pointer.active = false;
    });

    const hoverTargets = document.querySelectorAll("a, button, .skill-card, .project-media, .system-node");
    hoverTargets.forEach(target => {
      target.addEventListener("mouseenter", () => {
        cursorRing?.classList.add("is-hovering");
        cursorDot?.classList.add("is-hovering");
      });
      target.addEventListener("mouseleave", () => {
        cursorRing?.classList.remove("is-hovering");
        cursorDot?.classList.remove("is-hovering");
      });
    });

    document.querySelectorAll(".skill-card, .testimonial-card").forEach(card => {
      card.addEventListener("pointermove", event => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
      });
    });

    document.querySelectorAll(".project-media.tilt-card").forEach(card => {
      card.addEventListener("pointermove", event => {
        const rect = card.getBoundingClientRect();
        const rotateY = ((event.clientX - rect.left) / rect.width - 0.5) * 5;
        const rotateX = -((event.clientY - rect.top) / rect.height - 0.5) * 5;
        if (hasGsap) window.gsap.to(card, { rotateX, rotateY, transformPerspective: 1000, duration: 0.45, ease: "power2.out", overwrite: "auto" });
        else card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });
      card.addEventListener("pointerleave", () => {
        if (hasGsap) window.gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.65, ease: "power3.out" });
        else card.style.transform = "";
      });
    });

    document.querySelectorAll(".magnetic").forEach(control => {
      control.addEventListener("pointermove", event => {
        const rect = control.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.22;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.22;
        if (hasGsap) window.gsap.to(control, { x, y, duration: 0.35, ease: "power2.out", overwrite: true });
      });
      control.addEventListener("pointerleave", () => {
        if (hasGsap) window.gsap.to(control, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1,.35)" });
      });
      control.addEventListener("pointerdown", () => { if (hasGsap) window.gsap.to(control, { scale: 0.96, duration: 0.12 }); });
      control.addEventListener("pointerup", () => { if (hasGsap) window.gsap.to(control, { scale: 1, duration: 0.3, ease: "back.out(2)" }); });
    });
  }

  /* ---------- Ambient particle field ---------- */
  const canvas = document.querySelector("[data-ambient-canvas]");
  if (canvas) {
    const context = canvas.getContext("2d");
    let particles = [];
    let width = 0;
    let height = 0;
    let density = window.innerWidth < 760 ? 18 : 34;
    let particleFrame = 0;

    const resizeCanvas = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      density = width < 760 ? 18 : 34;
      particles = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.09,
        vy: (Math.random() - 0.5) * 0.09,
        radius: Math.random() * 1.2 + 0.35,
        alpha: Math.random() * 0.28 + 0.08
      }));
    };

    const renderParticles = () => {
      particleFrame = 0;
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        if (!prefersReducedMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -10) particle.x = width + 10;
          if (particle.x > width + 10) particle.x = -10;
          if (particle.y < -10) particle.y = height + 10;
          if (particle.y > height + 10) particle.y = -10;
        }

        if (pointer.active) {
          const dx = pointer.x - particle.x;
          const dy = pointer.y - particle.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 145 && distance > 0) {
            particle.x -= (dx / distance) * 0.12;
            particle.y -= (dy / distance) * 0.12;
          }
        }

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(190,200,244,${particle.alpha})`;
        context.fill();

        for (let next = index + 1; next < particles.length; next += 1) {
          const other = particles[next];
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          if (distance > 120) continue;
          context.beginPath();
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.strokeStyle = `rgba(150,164,220,${(1 - distance / 120) * 0.045})`;
          context.stroke();
        }
      });
      if (!prefersReducedMotion && !document.hidden) particleFrame = window.requestAnimationFrame(renderParticles);
    };

    resizeCanvas();
    renderParticles();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && particleFrame) {
        window.cancelAnimationFrame(particleFrame);
        particleFrame = 0;
      } else if (!document.hidden && !particleFrame && !prefersReducedMotion) {
        particleFrame = window.requestAnimationFrame(renderParticles);
      }
    });
  }

  /* ---------- GSAP motion direction ---------- */
  if (hasGsap) {
    const { gsap, ScrollTrigger } = window;
    gsap.config({ force3D: true, nullTargetWarn: false });
    ScrollTrigger.config({ limitCallbacks: true, ignoreMobileResize: true });

    // Code arrives line by line like a concise typing pass.
    const codeLines = gsap.utils.toArray(".code-line");
    gsap.to(codeLines, {
      clipPath: "inset(0 0% 0 0)",
      duration: 0.34,
      stagger: {
        each: 0.1,
        onStart() {
          codeLines.forEach(line => line.classList.remove("is-typing"));
          this.targets()[0]?.classList.add("is-typing");
        }
      },
      delay: 1.35,
      ease: "power1.inOut",
      onComplete: () => codeLines.forEach(line => line.classList.remove("is-typing"))
    });

    // Existing reveal vocabulary, upgraded with consistent cinematic easing.
    gsap.utils.toArray(".reveal, .reveal-card").forEach(item => {
      gsap.to(item, {
        autoAlpha: 1,
        y: 0,
        duration: 1.05,
        ease: "power3.out",
        onComplete: () => item.classList.add("is-visible"),
        scrollTrigger: { trigger: item, start: "top 86%", once: true }
      });
    });

    if (textReveal) {
      gsap.to(wordNodes, {
        opacity: 1,
        stagger: 0.08,
        ease: "none",
        scrollTrigger: { trigger: textReveal, start: "top 82%", end: "bottom 43%", scrub: 0.8 }
      });
    }

    // Counters animate only when they become meaningful on-screen.
    document.querySelectorAll("[data-counter]").forEach(counter => {
      const target = Number(counter.dataset.counter);
      const suffix = counter.dataset.suffix || "";
      const pad = Number(counter.dataset.pad || 0);
      const state = { value: 0 };
      gsap.to(state, {
        value: target,
        duration: 1.5,
        ease: "power2.out",
        onUpdate: () => {
          const value = String(Math.round(state.value)).padStart(pad, "0");
          counter.textContent = `${value}${suffix}`;
        },
        scrollTrigger: { trigger: counter, start: "top 90%", once: true }
      });
    });

    // Ambient parallax and section transition light.
    parallaxItems.forEach(item => {
      const speed = Number(item.dataset.parallax || 0);
      gsap.to(item, { yPercent: speed * 300, ease: "none", scrollTrigger: { trigger: item.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 } });
    });

    gsap.utils.toArray(".section").forEach(section => {
      const wipe = section.querySelector(".section-wipe");
      gsap.fromTo(wipe, { "--wipe-opacity": 0 }, {
        "--wipe-opacity": 1,
        ease: "none",
        scrollTrigger: { trigger: section, start: "top 95%", end: "top 35%", scrub: true }
      });
    });

    gsap.utils.toArray(".section-heading:not(.sticky-heading)").forEach(heading => {
      gsap.fromTo(heading, { y: 20 }, { y: -12, ease: "none", scrollTrigger: { trigger: heading, start: "top bottom", end: "bottom top", scrub: 1.2 } });
    });

    // Timeline progress and active milestones.
    const timeline = document.querySelector("[data-timeline]");
    if (timeline) {
      gsap.to("[data-timeline-progress]", { scaleY: 1, ease: "none", scrollTrigger: { trigger: timeline, start: "top 68%", end: "bottom 55%", scrub: true } });
      gsap.utils.toArray(".timeline-item").forEach(item => {
        ScrollTrigger.create({
          trigger: item,
          start: "top 58%",
          end: "bottom 42%",
          toggleClass: { targets: item, className: "is-active" }
        });
      });
      gsap.to(".journey-orbit", { y: -25, rotate: 1.5, ease: "none", scrollTrigger: { trigger: ".journey-layout", start: "top bottom", end: "bottom top", scrub: 1.3 } });
    }

    // Skill constellation draws in as one connected system.
    const skillMap = document.querySelector("[data-skill-map]");
    if (skillMap) {
      gsap.from(".system-node:not(.node-core)", { autoAlpha: 0, scale: 0.75, stagger: 0.12, duration: 0.7, ease: "back.out(1.7)", scrollTrigger: { trigger: skillMap, start: "top 70%", once: true } });
      gsap.from(".system-lines", { autoAlpha: 0, scale: 0.85, transformOrigin: "50% 50%", duration: 1.2, ease: "power2.out", scrollTrigger: { trigger: skillMap, start: "top 72%", once: true } });
      gsap.to(".node-core", { y: -6, duration: 2.4, repeat: -1, yoyo: true, ease: "sine.inOut" });
    }

    // Each project behaves as a large cinematic chapter.
    const projects = gsap.utils.toArray(".project");
    const progress = document.querySelector(".project-progress");
    const progressDots = progress ? [...progress.querySelectorAll("i")] : [];
    const progressNumber = progress?.querySelector("strong");
    const setActiveProject = index => {
      progressDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
      if (progressNumber) progressNumber.textContent = String(index + 1).padStart(2, "0");
    };

    if (progress) {
      ScrollTrigger.create({
        trigger: ".work",
        start: "top 55%",
        end: "bottom 45%",
        onToggle: self => progress.classList.toggle("is-active", self.isActive)
      });
    }

    projects.forEach((project, index) => {
      const media = project.querySelector(".project-media");
      const mediaVisual = media.classList.contains("media-fallback-only")
        ? media.querySelector(".project-media-fallback")
        : media.querySelector(".project-media-stage");
      const info = project.querySelector(".project-info");
      gsap.fromTo(media, { autoAlpha: 0, y: 70, scale: 0.94, clipPath: "inset(6% 6% 6% 6% round 24px)" }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        clipPath: "inset(0% 0% 0% 0% round 24px)",
        ease: "none",
        scrollTrigger: { trigger: project, start: "top 86%", end: "center 55%", scrub: 0.8 }
      });
      gsap.fromTo(info, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: project, start: "top 68%", once: true } });
      gsap.fromTo(mediaVisual, { scale: 1.08, yPercent: -3 }, { scale: 1.03, yPercent: 3, ease: "none", scrollTrigger: { trigger: project, start: "top bottom", end: "bottom top", scrub: 1.1 } });
      ScrollTrigger.create({ trigger: project, start: "top 55%", end: "bottom 45%", onEnter: () => setActiveProject(index), onEnterBack: () => setActiveProject(index) });
    });

    // Subtle depth for testimonials and the final contact composition.
    gsap.utils.toArray(".testimonial-card").forEach((card, index) => {
      gsap.fromTo(card, { rotateY: index === 0 ? -3 : index === 2 ? 3 : 0 }, { rotateY: 0, ease: "none", scrollTrigger: { trigger: card, start: "top bottom", end: "top 55%", scrub: 0.8 } });
    });
    gsap.to(".contact-orb", { scale: 1.18, opacity: 0.7, ease: "none", scrollTrigger: { trigger: ".contact", start: "top bottom", end: "center center", scrub: 1 } });
  }

  /* ---------- Project placeholders + Discord copy ---------- */
  document.querySelectorAll("[data-placeholder-link]").forEach(link => {
    link.addEventListener("click", event => event.preventDefault());
  });

  const discordButton = document.querySelector("[data-copy-discord]");
  discordButton?.addEventListener("click", async () => {
    const handle = discordButton.dataset.copyDiscord;
    const label = discordButton.querySelector("[data-copy-label]");
    const fallbackCopy = value => {
      const field = document.createElement("textarea");
      field.value = value;
      field.setAttribute("readonly", "");
      field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      return copied;
    };

    label.textContent = "Copying username…";
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(handle);
      else if (!fallbackCopy(handle)) throw new Error("Clipboard unavailable");
      label.textContent = "Copied to clipboard";
    } catch {
      label.textContent = fallbackCopy(handle) ? "Copied to clipboard" : `Discord: ${handle}`;
    }
    window.setTimeout(() => { label.textContent = "Copy my Discord username"; }, 2200);
  });
})();
