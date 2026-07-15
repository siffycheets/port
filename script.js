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
  const scrollProgress = document.querySelector(".scroll-progress");
  const menuToggle = document.querySelector(".menu-toggle");
  const siteNav = document.querySelector(".site-nav");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const hasGsap = !prefersReducedMotion && Boolean(window.gsap && window.ScrollTrigger);

  if (hasGsap) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    root.classList.add("gsap-ready");
  }

  /* ---------- Global audio coordinator ---------- */
  const pageLoader = document.querySelector(".page-loader");
  const backgroundMusic = document.querySelector("[data-background-music]");
  const musicToggle = document.querySelector("[data-music-toggle]");
  const musicLabel = musicToggle?.querySelector("[data-music-label]");
  const MUSIC_VOLUME = 0.07;
  // The deployed audio asset is trimmed so its first frame is the detected drop.
  const MUSIC_DROP_TIME = 0;
  const activePortfolioMedia = new Set();
  const youtubePlayers = new Map();
  const youtubeActivationTimers = new Map();
  let loaderComplete = false;
  let musicCueApplied = false;
  let musicPlayPending = false;
  let musicPlayAttempt = 0;
  let musicGestureRecoveryUsed = false;
  let musicAutoplayBlocked = false;
  let pageHasAudioConsent = false;
  let backgroundMusicEnabled = true;
  let musicPrimedBeforeLoader = false;
  let musicFadeFrame = 0;
  let musicFadeToken = 0;
  let syncAmbientParticles = () => {};

  try {
    const storedEnabled = window.localStorage.getItem("siffy-background-music-enabled");
    const legacyMuted = window.localStorage.getItem("siffy-background-music-muted");
    backgroundMusicEnabled = storedEnabled === null ? legacyMuted !== "true" : storedEnabled === "true";
  } catch (_) {
    // Storage can be unavailable in strict privacy modes; audio still works for this visit.
  }
  if (backgroundMusic) {
    backgroundMusic.volume = MUSIC_VOLUME;
    backgroundMusic.muted = !backgroundMusicEnabled;
    backgroundMusic.loop = true;
  }

  const logMusicFailure = (context, error) => {
    const details = {
      source: backgroundMusic?.currentSrc || backgroundMusic?.querySelector("source")?.src || "unknown",
      name: error?.name || "MediaError",
      message: error?.message || "Unknown audio failure",
      code: backgroundMusic?.error?.code || null
    };
    if (error?.name === "NotAllowedError") console.warn(`[Siffy audio] ${context}: browser interaction required.`, details);
    else console.error(`[Siffy audio] ${context}.`, details);
  };

  backgroundMusic?.addEventListener("error", () => logMusicFailure("Background music failed to load", backgroundMusic.error));
  backgroundMusic?.querySelector("source")?.addEventListener("error", event => logMusicFailure("Background music source failed to load", event));

  const saveMusicPreference = () => {
    try {
      window.localStorage.setItem("siffy-background-music-enabled", String(backgroundMusicEnabled));
      window.localStorage.removeItem("siffy-background-music-muted");
    } catch (_) {
      // Preference persistence is optional when storage is blocked.
    }
  };

  const updateMusicControl = () => {
    if (!musicToggle) return;
    const pausedForMedia = backgroundMusicEnabled && activePortfolioMedia.size > 0;
    const waitingForGesture = backgroundMusicEnabled && musicAutoplayBlocked && !pausedForMedia;
    const label = !backgroundMusicEnabled ? "Music off" : pausedForMedia ? "Music paused" : waitingForGesture ? "Play music" : "Music on";
    musicToggle.classList.toggle("is-audible", backgroundMusicEnabled);
    musicToggle.classList.toggle("is-paused", pausedForMedia);
    musicToggle.classList.toggle("needs-gesture", waitingForGesture);
    musicToggle.setAttribute("aria-pressed", String(backgroundMusicEnabled));
    musicToggle.setAttribute("aria-label", !backgroundMusicEnabled ? "Enable background music" : waitingForGesture ? "Play background music" : "Mute background music");
    if (musicLabel) musicLabel.textContent = label;
  };

  const cueMusicToDrop = () => {
    if (!backgroundMusic) return false;
    if (musicCueApplied) return true;
    if (backgroundMusic.readyState < 1) return false;
    try {
      backgroundMusic.currentTime = MUSIC_DROP_TIME;
      musicCueApplied = true;
      return true;
    } catch (_) {
      return false;
    }
  };

  const cancelMusicFade = () => {
    musicFadeToken += 1;
    if (musicFadeFrame) window.cancelAnimationFrame(musicFadeFrame);
    musicFadeFrame = 0;
  };

  const fadeMusicTo = (targetVolume, duration, onComplete) => {
    if (!backgroundMusic) return;
    cancelMusicFade();
    const token = musicFadeToken;
    const startVolume = backgroundMusic.volume;
    const startedAt = window.performance.now();
    const fadeDuration = prefersReducedMotion ? 0 : duration;

    if (fadeDuration === 0 || Math.abs(startVolume - targetVolume) < 0.001) {
      backgroundMusic.volume = targetVolume;
      onComplete?.();
      return;
    }

    const step = now => {
      if (token !== musicFadeToken) return;
      const progress = Math.min((now - startedAt) / fadeDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      backgroundMusic.volume = startVolume + (targetVolume - startVolume) * eased;
      if (progress < 1) musicFadeFrame = window.requestAnimationFrame(step);
      else {
        musicFadeFrame = 0;
        onComplete?.();
      }
    };
    musicFadeFrame = window.requestAnimationFrame(step);
  };

  const pauseBackgroundMusicSmoothly = () => {
    updateMusicControl();
    if (!backgroundMusic || backgroundMusic.paused) {
      if (backgroundMusic) backgroundMusic.volume = 0;
      updateMusicControl();
      return;
    }

    fadeMusicTo(0, 320, () => {
      if (!shouldPlayBackgroundMusic()) {
        backgroundMusic.pause();
        backgroundMusic.muted = !backgroundMusicEnabled;
      }
      updateMusicControl();
    });
  };

  const shouldPlayBackgroundMusic = () => Boolean(
    backgroundMusic &&
    loaderComplete &&
    backgroundMusicEnabled &&
    activePortfolioMedia.size === 0 &&
    !document.hidden
  );

  const reconcileBackgroundMusic = (forcePlay = false) => {
    if (!backgroundMusic) return;

    if (!shouldPlayBackgroundMusic()) {
      pauseBackgroundMusicSmoothly();
      return;
    }

    if (!cueMusicToDrop() || (musicPlayPending && !forcePlay)) {
      updateMusicControl();
      return;
    }

    if (!backgroundMusic.paused) {
      musicAutoplayBlocked = false;
      backgroundMusic.muted = false;
      fadeMusicTo(MUSIC_VOLUME, 500);
      updateMusicControl();
      return;
    }

    cancelMusicFade();
    const attempt = ++musicPlayAttempt;
    backgroundMusic.muted = false;
    backgroundMusic.volume = 0;
    const playback = backgroundMusic.play();
    if (!playback) {
      window.setTimeout(() => {
        musicAutoplayBlocked = backgroundMusic.paused;
        if (!backgroundMusic.paused) fadeMusicTo(MUSIC_VOLUME, 500);
        updateMusicControl();
      }, 0);
      return;
    }

    musicPlayPending = true;
    musicAutoplayBlocked = true;
    updateMusicControl();
    playback.then(() => {
      if (attempt !== musicPlayAttempt) return;
      musicAutoplayBlocked = false;
      fadeMusicTo(MUSIC_VOLUME, 500);
    }).catch(error => {
      if (attempt !== musicPlayAttempt) return;
      musicAutoplayBlocked = true;
      backgroundMusic.pause();
      logMusicFailure("Background music could not play", error);
    }).finally(() => {
      if (attempt !== musicPlayAttempt) return;
      musicPlayPending = false;
      updateMusicControl();
    });
  };

  const primeBackgroundMusicFromGesture = () => {
    if (!backgroundMusic || !backgroundMusicEnabled || activePortfolioMedia.size > 0 || document.hidden) return;
    if (loaderComplete) {
      reconcileBackgroundMusic(true);
      return;
    }

    cueMusicToDrop();
    backgroundMusic.muted = false;
    backgroundMusic.volume = 0;
    const attempt = ++musicPlayAttempt;
    const playback = backgroundMusic.play();
    if (!playback) {
      musicPrimedBeforeLoader = !backgroundMusic.paused;
      return;
    }

    musicPlayPending = true;
    playback.then(() => {
      if (attempt !== musicPlayAttempt) return;
      musicPrimedBeforeLoader = true;
      musicAutoplayBlocked = false;
    }).catch(error => {
      if (attempt !== musicPlayAttempt) return;
      musicAutoplayBlocked = true;
      logMusicFailure("Background music could not be primed", error);
    }).finally(() => {
      if (attempt !== musicPlayAttempt) return;
      musicPlayPending = false;
      updateMusicControl();
    });
  };

  const setPortfolioMediaActive = (media, active) => {
    if (active) activePortfolioMedia.add(media);
    else activePortfolioMedia.delete(media);
    reconcileBackgroundMusic();
    syncAmbientParticles();
  };

  const registerNativePortfolioVideo = video => {
    video.addEventListener("play", () => setPortfolioMediaActive(video, true));
    video.addEventListener("playing", () => setPortfolioMediaActive(video, true));
    ["pause", "ended", "emptied", "error"].forEach(eventName => {
      video.addEventListener(eventName, () => setPortfolioMediaActive(video, false));
    });
  };

  const subscribeToYoutubePlayer = frame => {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: frame.dataset.youtubePlayerId }), "*");
    frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"] }), "*");
  };

  window.addEventListener("message", event => {
    if (!/https:\/\/(www\.)?youtube(?:-nocookie)?\.com$/.test(event.origin)) return;
    const frame = [...youtubePlayers.keys()].find(playerFrame => playerFrame.contentWindow === event.source);
    if (!frame) return;

    let message = event.data;
    if (typeof message === "string") {
      try { message = JSON.parse(message); } catch (_) { return; }
    }

    const state = message?.event === "onStateChange" ? Number(message.info) : Number(message?.info?.playerState);
    if (!Number.isFinite(state)) return;
    const activationTimer = youtubeActivationTimers.get(frame);
    if (activationTimer) window.clearTimeout(activationTimer);
    youtubeActivationTimers.delete(frame);
    youtubePlayers.set(frame, state);
    setPortfolioMediaActive(frame, state === 1 || state === 3);
  });

  const signalAudioGesture = event => {
    pageHasAudioConsent = true;
    if (event?.target?.closest?.("[data-music-toggle], [data-horror-audio]")) return;
    document.dispatchEvent(new CustomEvent("siffy:audio-gesture"));
    if (backgroundMusic?.paused || musicAutoplayBlocked) primeBackgroundMusicFromGesture();
  };
  document.addEventListener("pointerdown", signalAudioGesture, { passive: true });
  document.addEventListener("keydown", signalAudioGesture);

  backgroundMusic?.addEventListener("loadedmetadata", () => {
    cueMusicToDrop();
    reconcileBackgroundMusic();
  }, { once: true });

  musicToggle?.addEventListener("click", () => {
    pageHasAudioConsent = true;

    // When autoplay was blocked, the first click starts music instead of
    // misleadingly toggling an already-silent "on" state off.
    if (backgroundMusicEnabled && (musicAutoplayBlocked || backgroundMusic?.paused) && activePortfolioMedia.size === 0 && !musicGestureRecoveryUsed) {
      musicGestureRecoveryUsed = true;
      musicAutoplayBlocked = false;
      musicPlayPending = false;
      primeBackgroundMusicFromGesture();
      return;
    }

    backgroundMusicEnabled = !backgroundMusicEnabled;
    musicGestureRecoveryUsed = false;
    musicAutoplayBlocked = false;
    if (backgroundMusicEnabled && backgroundMusic) backgroundMusic.muted = false;
    saveMusicPreference();
    if (backgroundMusicEnabled) primeBackgroundMusicFromGesture();
    else reconcileBackgroundMusic();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelMusicFade();
      backgroundMusic?.pause();
      if (backgroundMusic) backgroundMusic.volume = 0;
    }
    else window.setTimeout(reconcileBackgroundMusic, 0);
  });

  updateMusicControl();

  /* ---------- Basic page setup ---------- */
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      pageLoader?.classList.add("loaded");

      let loaderSignalSent = false;
      const finishLoader = () => {
        if (loaderSignalSent) return;
        loaderSignalSent = true;
        loaderComplete = true;
        if (musicPrimedBeforeLoader && backgroundMusic && !backgroundMusic.paused) {
          backgroundMusic.currentTime = MUSIC_DROP_TIME;
          musicPrimedBeforeLoader = false;
        }
        cueMusicToDrop();
        reconcileBackgroundMusic();
      };

      pageLoader?.addEventListener("transitionend", event => {
        if (event.target === pageLoader && event.propertyName === "transform") finishLoader();
      }, { once: true });
      window.setTimeout(finishLoader, 1200);
    }, 250);
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

  // Decorative chapter UI begins after the hero and is hidden below desktop/tablet widths.
  const chapterDefinitions = [
    { selector: "#about", index: "01", label: "About" },
    { selector: "#systems", index: "02", label: "Systems" },
    { selector: "#work", index: "03", label: "Projects" },
    { selector: "#journey", index: "04", label: "Journey" },
    { selector: "#expertise", index: "05", label: "Expertise" },
    { selector: ".testimonials", index: "06", label: "Testimonials" },
    { selector: ".process", index: "07", label: "Process" },
    { selector: "#contact", index: "08", label: "Contact" }
  ];
  const chapterSections = chapterDefinitions.map(chapter => ({ ...chapter, element: document.querySelector(chapter.selector) })).filter(chapter => chapter.element);

  chapterSections.forEach(chapter => {
    chapter.element.classList.add("post-hero-enhanced");
    if (chapter.element.querySelector(":scope > .section-atmosphere")) return;
    const atmosphere = document.createElement("div");
    atmosphere.className = "section-atmosphere";
    atmosphere.setAttribute("aria-hidden", "true");
    atmosphere.innerHTML = `
      <span class="section-grid-field"></span>
      <span class="section-beam"></span>
      <span class="section-fragment section-fragment-a"><i></i><i></i><i></i></span>
      <span class="section-fragment section-fragment-b"><i></i><i></i></span>
      <span class="section-coordinate">${chapter.index} / ${chapter.label}</span>`;
    chapter.element.prepend(atmosphere);
  });

  // Pause decorative loops when they cannot be seen; this preserves the same
  // motion language without spending CPU/GPU time several screens away.
  const ambientMotionTargets = document.querySelectorAll(".marquee, .journey, .testimonials, .contact");
  if ("IntersectionObserver" in window) {
    const ambientMotionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle("is-motion-active", entry.isIntersecting));
    }, { rootMargin: "180px 0px", threshold: 0 });
    ambientMotionTargets.forEach(target => ambientMotionObserver.observe(target));
  } else {
    ambientMotionTargets.forEach(target => target.classList.add("is-motion-active"));
  }

  const chapterRail = document.createElement("div");
  chapterRail.className = "chapter-rail";
  chapterRail.setAttribute("aria-hidden", "true");
  chapterRail.innerHTML = `<span class="chapter-rail-number">01</span><div class="chapter-rail-dots">${chapterSections.map((_, index) => `<i${index === 0 ? ' class="active"' : ""}></i>`).join("")}</div><small class="chapter-rail-label">About</small>`;
  body.appendChild(chapterRail);

  /* ---------- Reusable project media ---------- */
  const projectMediaShells = [...document.querySelectorAll("[data-project-media]")];
  const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

  const pauseYoutubeFrame = frame => {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
    youtubePlayers.set(frame, 2);
    setPortfolioMediaActive(frame, false);
  };

  const youtubeVisibilityObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.08) return;
        const frame = entry.target.querySelector("iframe.project-media-video");
        if (frame && [1, 3].includes(youtubePlayers.get(frame))) pauseYoutubeFrame(frame);
      });
    }, { threshold: [0, 0.08] })
    : null;

  const mountYoutubePlayer = (shell, stage, youtubeId, title) => {
    const frame = document.createElement("iframe");
    frame.className = "project-media-asset project-media-video";
    frame.dataset.youtubePlayerId = `siffy-youtube-${youtubePlayers.size + 1}`;
    frame.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;
    frame.title = `${title} video preview`;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    youtubePlayers.set(frame, -1);
    setPortfolioMediaActive(frame, true);
    youtubeActivationTimers.set(frame, window.setTimeout(() => {
      if (youtubePlayers.get(frame) === -1) setPortfolioMediaActive(frame, false);
      youtubeActivationTimers.delete(frame);
    }, 8000));
    frame.addEventListener("load", () => {
      shell.classList.add("media-loaded");
      subscribeToYoutubePlayer(frame);
    }, { once: true });
    stage.replaceChildren(frame);
    youtubeVisibilityObserver?.observe(shell);
  };

  projectMediaShells.forEach(shell => {
    const stage = shell.querySelector("[data-media-stage]");
    const mediaType = (shell.dataset.mediaType || "image").toLowerCase();
    const imageUrl = (shell.dataset.imageUrl || "").trim();
    const youtubeId = (shell.dataset.youtubeId || "").trim();
    const title = shell.dataset.projectTitle || "Project";

    if (!stage) return;

    if (mediaType === "youtube" && youtubeIdPattern.test(youtubeId)) {
      const facade = document.createElement("button");
      const thumbnail = new Image();
      const play = document.createElement("span");
      facade.className = "project-video-facade";
      facade.type = "button";
      facade.setAttribute("aria-label", `Play ${title} video preview`);
      thumbnail.loading = "lazy";
      thumbnail.decoding = "async";
      thumbnail.alt = `${title} video thumbnail`;
      thumbnail.src = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;
      thumbnail.addEventListener("error", () => {
        if (thumbnail.dataset.fallback === "true") {
          thumbnail.remove();
          return;
        }
        thumbnail.dataset.fallback = "true";
        thumbnail.src = `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
      });
      play.className = "project-video-play";
      play.setAttribute("aria-hidden", "true");
      play.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 6 9 6-9 6Z"/></svg>';
      facade.append(thumbnail, play);
      facade.addEventListener("click", () => mountYoutubePlayer(shell, stage, youtubeId, title), { once: true });
      stage.appendChild(facade);
      shell.classList.add("media-loaded");
      return;
    }

    if (mediaType === "image" && imageUrl) {
      const image = new Image();
      image.className = "project-media-asset project-media-image";
      image.alt = `${title} project preview`;
      image.loading = "lazy";
      image.decoding = "async";
      image.src = imageUrl;
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

  /* ---------- Lazy system showcase videos ---------- */
  const systemShowcase = document.querySelector("[data-system-showcase]");
  const showcaseVideos = [...document.querySelectorAll("[data-showcase-video]")];
  showcaseVideos.forEach(registerNativePortfolioVideo);
  const horrorVideo = document.querySelector("[data-horror-video]");
  const horrorAudioButton = document.querySelector("[data-horror-audio]");
  const horrorShowcase = document.querySelector("[data-horror-showcase]");
  const HORROR_MAX_VOLUME = 0.55;
  const showcaseRatios = new Map(showcaseVideos.map(video => [video, 0]));
  let horrorAudioEnabled = true;
  let horrorAudioNeedsUnlock = true;

  const clamp01 = value => Math.min(1, Math.max(0, value));

  // A direction-independent envelope: quiet while entering/leaving, full level
  // through the center of the pinned scene. The same math works scrolling upward.
  const getHorrorScrollVolume = () => {
    if (!horrorShowcase) return 0;
    const rect = horrorShowcase.getBoundingClientRect();
    const viewportHeight = Math.max(window.innerHeight, 1);
    const fadeDistance = viewportHeight * 0.72;
    const fadeIn = clamp01((viewportHeight - rect.top) / fadeDistance);
    const fadeOut = clamp01(rect.bottom / fadeDistance);
    return Math.min(fadeIn, fadeOut) * HORROR_MAX_VOLUME;
  };

  const syncHorrorAudioVolume = () => {
    if (!horrorVideo) return;
    const isVisible = horrorVideo.dataset.visible === "true";
    const volume = horrorAudioEnabled && isVisible ? getHorrorScrollVolume() : 0;
    horrorVideo.volume = volume;
    horrorAudioButton?.style.setProperty("--audio-level", volume / HORROR_MAX_VOLUME);
  };

  const updateHorrorAudioButton = () => {
    horrorAudioButton?.classList.toggle("is-audible", horrorAudioEnabled);
    horrorAudioButton?.setAttribute("aria-pressed", String(horrorAudioEnabled));
    horrorAudioButton?.setAttribute("aria-label", horrorAudioEnabled ? "Mute horror UI demo audio" : "Enable horror UI demo audio");
    const label = horrorAudioButton?.querySelector("span");
    if (label) label.textContent = horrorAudioEnabled ? "Audio on" : "Audio off";
  };

  const loadShowcaseVideo = video => {
    if (video.dataset.loaded === "true") return;
    video.querySelectorAll("source[data-src]").forEach(source => {
      source.src = source.dataset.src;
      source.removeAttribute("data-src");
      source.addEventListener("error", () => video.closest(".system-proof-media, .horror-frame")?.classList.add("video-failed"), { once: true });
    });
    video.dataset.loaded = "true";
    video.load();
  };

  showcaseVideos.forEach(video => {
    video.addEventListener("error", () => video.closest(".system-proof-media, .horror-frame")?.classList.add("video-failed"), { once: true });
    const control = video.closest(".system-proof-media")?.querySelector("[data-video-toggle]");
    const progress = video.closest(".system-proof-media")?.querySelector(".system-video-progress");
    const videoLabel = video.dataset.videoLabel || "system preview";
    const updateControl = () => {
      if (!control) return;
      const playing = !video.paused && !video.ended;
      control.classList.toggle("is-playing", playing);
      control.classList.toggle("is-paused", !playing);
      control.setAttribute("aria-pressed", String(playing));
      control.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${videoLabel}`);
      const label = control.querySelector("span");
      if (label) label.textContent = playing ? "Playing" : "Play";
    };
    const updateProgress = () => {
      if (!progress) return;
      const ratio = Number.isFinite(video.duration) && video.duration > 0 ? video.currentTime / video.duration : 0;
      progress.style.setProperty("--video-progress", String(Math.min(1, Math.max(0, ratio))));
    };
    video.addEventListener("play", updateControl);
    video.addEventListener("pause", updateControl);
    video.addEventListener("ended", updateControl);
    video.addEventListener("timeupdate", updateProgress, { passive: true });
    video.addEventListener("loadedmetadata", updateProgress, { once: true });
    control?.addEventListener("click", () => {
      loadShowcaseVideo(video);
      if (!video.paused) {
        video.dataset.userPaused = "true";
        video.pause();
      } else {
        video.dataset.userPaused = "false";
        showcaseVideos.forEach(other => { if (other !== video) other.pause(); });
        playShowcaseVideo(video);
      }
      updateControl();
    });
    updateControl();
  });

  if (horrorVideo) {
    // Muted playback is reliable before browser audio consent. The requested
    // audio state remains on and is restored on the first click/tap/key press.
    horrorVideo.muted = true;
    horrorVideo.volume = 0;
    updateHorrorAudioButton();
  }

  const playShowcaseVideo = video => {
    if (video.dataset.userPaused === "true") return;
    if (video === horrorVideo) {
      const canPlayAudio = horrorAudioEnabled && pageHasAudioConsent;
      video.muted = !canPlayAudio;
      horrorAudioNeedsUnlock = horrorAudioEnabled && !canPlayAudio;
    }

    if (!video.paused && !video.ended) {
      setPortfolioMediaActive(video, true);
      return;
    }

    const playback = video.play();
    setPortfolioMediaActive(video, true);
    if (video !== horrorVideo || !playback) {
      playback?.catch(() => setPortfolioMediaActive(video, false));
      return;
    }

    playback.catch(() => {
      // Browsers can reject unmuted autoplay until the first click/key press.
      // Keep motion playing muted, then restore the requested audio on interaction.
      if (!horrorAudioEnabled) return;
      horrorAudioNeedsUnlock = true;
      video.muted = true;
      video.play().catch(() => setPortfolioMediaActive(video, false));
    });
  };

  const syncShowcasePlayback = () => {
    if (document.hidden) {
      showcaseVideos.forEach(video => video.pause());
      return;
    }

    const candidates = showcaseVideos
      .filter(video => (showcaseRatios.get(video) || 0) >= (video === horrorVideo ? 0.01 : 0.18))
      .sort((a, b) => {
        const ratioDifference = (showcaseRatios.get(b) || 0) - (showcaseRatios.get(a) || 0);
        if (Math.abs(ratioDifference) > 0.02) return ratioDifference;
        const viewportCenter = window.innerHeight / 2;
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return Math.abs((aRect.top + aRect.bottom) / 2 - viewportCenter) - Math.abs((bRect.top + bRect.bottom) / 2 - viewportCenter);
      });
    const activeVideo = candidates[0] || null;

    showcaseVideos.forEach(video => {
      const isActive = video === activeVideo;
      video.dataset.visible = String(isActive);
      if (!isActive) {
        if (video === horrorVideo) {
          video.volume = 0;
          horrorAudioButton?.style.setProperty("--audio-level", 0);
        }
        video.pause();
        return;
      }

      loadShowcaseVideo(video);
      if (video === horrorVideo) {
        const canPlayAudio = horrorAudioEnabled && pageHasAudioConsent;
        video.muted = !canPlayAudio;
        horrorAudioNeedsUnlock = horrorAudioEnabled && !canPlayAudio;
        syncHorrorAudioVolume();
      }
      if (!prefersReducedMotion && video.dataset.userPaused !== "true") playShowcaseVideo(video);
    });
  };

  if ("IntersectionObserver" in window) {
    const videoLoadObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadShowcaseVideo(entry.target);
        videoLoadObserver.unobserve(entry.target);
      });
    }, { rootMargin: "600px 0px", threshold: 0.01 });
    const videoPlaybackObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => showcaseRatios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
      syncShowcasePlayback();
    }, { threshold: [0, 0.01, 0.18, 0.3, 0.5, 0.7, 0.9] });
    showcaseVideos.forEach(video => {
      videoLoadObserver.observe(video);
      videoPlaybackObserver.observe(video);
    });
  } else {
    showcaseVideos.forEach(video => {
      video.dataset.visible = "true";
      loadShowcaseVideo(video);
      if (!prefersReducedMotion) playShowcaseVideo(video);
    });
  }

  document.addEventListener("visibilitychange", () => {
    syncShowcasePlayback();
  });

  horrorAudioButton?.addEventListener("click", () => {
    if (!horrorVideo) return;
    loadShowcaseVideo(horrorVideo);

    // If the browser was waiting for a gesture, this click enables sound
    // directly. It no longer forces an off-then-on double toggle.
    if (horrorAudioEnabled && (horrorAudioNeedsUnlock || horrorVideo.muted)) {
      pageHasAudioConsent = true;
      horrorAudioNeedsUnlock = false;
      horrorVideo.muted = false;
      syncHorrorAudioVolume();
      updateHorrorAudioButton();
      playShowcaseVideo(horrorVideo);
      return;
    }

    horrorAudioEnabled = !horrorAudioEnabled;
    horrorAudioNeedsUnlock = false;
    horrorVideo.muted = !horrorAudioEnabled;
    syncHorrorAudioVolume();
    updateHorrorAudioButton();
    if (horrorAudioEnabled) playShowcaseVideo(horrorVideo);
  });

  const unlockHorrorAudio = () => {
    if (!horrorVideo || !horrorAudioEnabled || horrorVideo.dataset.visible !== "true") return;
    horrorAudioNeedsUnlock = false;
    horrorVideo.muted = false;
    syncHorrorAudioVolume();
    playShowcaseVideo(horrorVideo);
  };
  document.addEventListener("siffy:audio-gesture", unlockHorrorAudio);
  window.addEventListener("resize", syncHorrorAudioVolume, { passive: true });

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
    if (scrollProgress) scrollProgress.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / maxScroll))})`;
    header?.classList.toggle("scrolled", scrollY > 40);

    if (!hasGsap && !prefersReducedMotion) {
      parallaxItems.forEach(item => {
        const speed = Number(item.dataset.parallax || 0);
        const rect = item.parentElement.getBoundingClientRect();
        item.style.translate = `0 ${(window.innerHeight / 2 - rect.top) * speed}px`;
      });
    }
    syncHorrorAudioVolume();
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
  const cursorGlow = document.querySelector(".cursor-glow");
  const cursorRing = document.querySelector(".cursor-ring");
  const cursorDot = document.querySelector(".cursor-dot");
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };

  if (hasFinePointer && !prefersReducedMotion) {
    if (hasGsap) window.gsap.set([cursorGlow, cursorRing, cursorDot], { xPercent: -50, yPercent: -50 });
    const moveRingX = hasGsap ? window.gsap.quickTo(cursorRing, "x", { duration: 0.42, ease: "power3.out" }) : null;
    const moveRingY = hasGsap ? window.gsap.quickTo(cursorRing, "y", { duration: 0.42, ease: "power3.out" }) : null;
    const moveGlowX = hasGsap ? window.gsap.quickTo(cursorGlow, "x", { duration: 0.68, ease: "power3.out" }) : null;
    const moveGlowY = hasGsap ? window.gsap.quickTo(cursorGlow, "y", { duration: 0.68, ease: "power3.out" }) : null;
    let pointerFrame = 0;

    window.addEventListener("pointermove", event => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        cursorRing?.classList.add("is-visible");
        cursorDot?.classList.add("is-visible");
        if (hasGsap) {
          moveRingX(pointer.x);
          moveRingY(pointer.y);
          moveGlowX(pointer.x);
          moveGlowY(pointer.y);
          window.gsap.set(cursorDot, { x: pointer.x, y: pointer.y });
        } else {
          cursorRing.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
          cursorDot.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
          if (cursorGlow) cursorGlow.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0) translate(-50%,-50%)`;
        }
      });
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
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
      let rect;
      card.addEventListener("pointerenter", () => { rect = card.getBoundingClientRect(); });
      card.addEventListener("pointermove", event => {
        rect ||= card.getBoundingClientRect();
        card.style.setProperty("--card-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--card-y", `${event.clientY - rect.top}px`);
      });
      card.addEventListener("pointerleave", () => { rect = null; });
    });

    document.querySelectorAll(".system-proof-media").forEach(media => {
      let rect;
      media.addEventListener("pointerenter", () => { rect = media.getBoundingClientRect(); });
      media.addEventListener("pointermove", event => {
        rect ||= media.getBoundingClientRect();
        media.style.setProperty("--media-x", `${event.clientX - rect.left}px`);
        media.style.setProperty("--media-y", `${event.clientY - rect.top}px`);
      });
      media.addEventListener("pointerleave", () => { rect = null; });
    });

    document.querySelectorAll(".project-media.tilt-card").forEach(card => {
      let rect;
      const rotateXTo = hasGsap ? window.gsap.quickTo(card, "rotateX", { duration: 0.4, ease: "power2.out" }) : null;
      const rotateYTo = hasGsap ? window.gsap.quickTo(card, "rotateY", { duration: 0.4, ease: "power2.out" }) : null;
      if (hasGsap) window.gsap.set(card, { transformPerspective: 1000 });
      card.addEventListener("pointerenter", () => { rect = card.getBoundingClientRect(); });
      card.addEventListener("pointermove", event => {
        rect ||= card.getBoundingClientRect();
        const rotateY = ((event.clientX - rect.left) / rect.width - 0.5) * 5;
        const rotateX = -((event.clientY - rect.top) / rect.height - 0.5) * 5;
        if (hasGsap) {
          rotateXTo(rotateX);
          rotateYTo(rotateY);
        }
        else card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      });
      card.addEventListener("pointerleave", () => {
        rect = null;
        if (hasGsap) {
          rotateXTo(0);
          rotateYTo(0);
        }
        else card.style.transform = "";
      });
    });

    document.querySelectorAll(".magnetic").forEach(control => {
      let rect;
      const moveX = hasGsap ? window.gsap.quickTo(control, "x", { duration: 0.35, ease: "power2.out" }) : null;
      const moveY = hasGsap ? window.gsap.quickTo(control, "y", { duration: 0.35, ease: "power2.out" }) : null;
      control.addEventListener("pointerenter", () => { rect = control.getBoundingClientRect(); });
      control.addEventListener("pointermove", event => {
        rect ||= control.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.22;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.22;
        if (hasGsap) {
          moveX(x);
          moveY(y);
        }
      });
      control.addEventListener("pointerleave", () => {
        rect = null;
        if (hasGsap) {
          moveX(0);
          moveY(0);
        }
      });
      control.addEventListener("pointerdown", () => { if (hasGsap) window.gsap.to(control, { scale: 0.96, duration: 0.12 }); });
      control.addEventListener("pointerup", () => { if (hasGsap) window.gsap.to(control, { scale: 1, duration: 0.3, ease: "back.out(2)" }); });
    });
  }

  /* ---------- Ambient particle field ---------- */
  const canvas = document.querySelector("[data-ambient-canvas]");
  if (canvas) {
    const context = canvas.getContext("2d");
    const saveData = Boolean(navigator.connection?.saveData);
    const drawConnections = hasFinePointer && !saveData;
    const particleInterval = 1000 / (saveData ? 20 : 30);
    let particles = [];
    let width = 0;
    let height = 0;
    let density = window.innerWidth < 760 ? 12 : 24;
    let particleFrame = 0;
    let resizeFrame = 0;
    let lastParticlePaint = 0;

    const resizeCanvas = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      density = width < 760 ? 12 : 24;
      particles = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.09,
        vy: (Math.random() - 0.5) * 0.09,
        radius: Math.random() * 1.2 + 0.35,
        alpha: Math.random() * 0.28 + 0.08
      }));
    };

    const paintParticles = () => {
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

        if (!drawConnections) return;
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
    };

    const shouldAnimateParticles = () => !prefersReducedMotion && !document.hidden && activePortfolioMedia.size === 0;
    const renderParticles = now => {
      particleFrame = 0;
      if (!shouldAnimateParticles()) return;
      if (now - lastParticlePaint < particleInterval) {
        particleFrame = window.requestAnimationFrame(renderParticles);
        return;
      }
      lastParticlePaint = now;
      paintParticles();
      particleFrame = window.requestAnimationFrame(renderParticles);
    };

    syncAmbientParticles = () => {
      if (!shouldAnimateParticles()) {
        if (particleFrame) window.cancelAnimationFrame(particleFrame);
        particleFrame = 0;
        return;
      }
      if (!particleFrame) particleFrame = window.requestAnimationFrame(renderParticles);
    };

    resizeCanvas();
    paintParticles();
    syncAmbientParticles();
    window.addEventListener("resize", () => {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        resizeCanvas();
        paintParticles();
      });
    }, { passive: true });
    document.addEventListener("visibilitychange", syncAmbientParticles);
  }

  /* ---------- GSAP motion direction ---------- */
  if (hasGsap) {
    const { gsap, ScrollTrigger } = window;
    gsap.config({ nullTargetWarn: false });
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

    // One shared observer handles one-time entrances. This preserves the same
    // cinematic reveal while avoiding a dedicated ScrollTrigger per element.
    const revealWithGsap = item => {
      gsap.to(item, {
        autoAlpha: 1,
        y: 0,
        duration: 1.05,
        ease: "power3.out",
        overwrite: "auto",
        onComplete: () => item.classList.add("is-visible")
      });
    };
    const gsapRevealItems = gsap.utils.toArray(".reveal, .reveal-card");
    if ("IntersectionObserver" in window) {
      const gsapRevealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          gsapRevealObserver.unobserve(entry.target);
          revealWithGsap(entry.target);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -14%" });
      gsapRevealItems.forEach(item => gsapRevealObserver.observe(item));
    } else {
      gsapRevealItems.forEach(revealWithGsap);
    }

    if (textReveal) {
      gsap.to(wordNodes, {
        opacity: 1,
        stagger: 0.08,
        ease: "none",
        scrollTrigger: { trigger: textReveal, start: "top 82%", end: "bottom 43%", scrub: 0.8 }
      });
    }

    // The counters share one observer as well, so they cost no scroll listeners.
    const animateCounter = counter => {
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
        }
      });
    };
    const counters = [...document.querySelectorAll("[data-counter]")];
    if ("IntersectionObserver" in window) {
      const counterObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          counterObserver.unobserve(entry.target);
          animateCounter(entry.target);
        });
      }, { threshold: 0.2 });
      counters.forEach(counter => counterObserver.observe(counter));
    } else {
      counters.forEach(animateCounter);
    }

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
      const coreFloat = gsap.to(".node-core", { y: -6, duration: 2.4, repeat: -1, yoyo: true, ease: "sine.inOut", paused: true });
      ScrollTrigger.create({
        trigger: skillMap,
        start: "top bottom",
        end: "bottom top",
        onToggle: self => self.isActive ? coreFloat.play() : coreFloat.pause()
      });
    }

    // Each project behaves as a large cinematic chapter.
    const projects = gsap.utils.toArray(".project");
    const progress = document.querySelector(".project-progress");
    const progressDots = progress ? [...progress.querySelectorAll("i")] : [];
    const progressNumber = progress?.querySelector("strong");
    const setActiveProject = index => {
      progressDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
      projects.forEach((project, projectIndex) => project.classList.toggle("is-project-active", projectIndex === index));
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
      gsap.fromTo(media, { autoAlpha: 0, y: 70, scale: 0.94 }, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        ease: "none",
        scrollTrigger: { trigger: project, start: "top 86%", end: "center 55%", scrub: 0.8 }
      });
      gsap.fromTo(info, { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: project, start: "top 68%", once: true } });
      gsap.fromTo(mediaVisual, { scale: 1.08, yPercent: -3 }, { scale: 1.03, yPercent: 3, ease: "none", scrollTrigger: { trigger: project, start: "top bottom", end: "bottom top", scrub: 1.1 } });
      ScrollTrigger.create({ trigger: project, start: "top 55%", end: "bottom 45%", onEnter: () => setActiveProject(index), onEnterBack: () => setActiveProject(index) });
    });

    /* ---------- Desktop/tablet motion after the hero ---------- */
    const postHeroMotion = gsap.matchMedia();
    postHeroMotion.add("(min-width: 761px)", () => {
      const railDots = [...chapterRail.querySelectorAll(".chapter-rail-dots i")];
      const railNumber = chapterRail.querySelector(".chapter-rail-number");
      const railLabel = chapterRail.querySelector(".chapter-rail-label");
      const setActiveChapter = index => {
        railDots.forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
        if (railNumber) railNumber.textContent = chapterSections[index].index;
        if (railLabel) railLabel.textContent = chapterSections[index].label;
      };

      if (chapterSections.length) {
        ScrollTrigger.create({
          trigger: chapterSections[0].element,
          endTrigger: chapterSections[chapterSections.length - 1].element,
          start: "top 62%",
          end: "bottom 38%",
          onToggle: self => chapterRail.classList.toggle("is-visible", self.isActive)
        });
      }

      chapterSections.forEach((chapter, index) => {
        const section = chapter.element;
        const atmosphere = section.querySelector(".section-atmosphere");
        const grid = atmosphere?.querySelector(".section-grid-field");
        const beam = atmosphere?.querySelector(".section-beam");
        const fragmentA = atmosphere?.querySelector(".section-fragment-a");
        const fragmentB = atmosphere?.querySelector(".section-fragment-b");
        const wipe = section.querySelector(":scope > .section-wipe");

        const atmosphereTimeline = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 1.25 }
        });
        atmosphereTimeline
          .fromTo(grid, { yPercent: -8 }, { yPercent: 10 }, 0)
          .fromTo(beam, { yPercent: -65, opacity: 0.04 }, { yPercent: 250, opacity: 0.32 }, 0)
          .to(fragmentA, { y: -105, x: index % 2 ? -20 : 16, rotate: index % 2 ? -8 : 8 }, 0)
          .to(fragmentB, { y: 85, x: index % 2 ? 18 : -14, rotate: index % 2 ? 7 : -7 }, 0);
        gsap.fromTo(wipe, { "--wipe-progress": 0 }, { "--wipe-progress": 1, ease: "none", scrollTrigger: { trigger: section, start: "top 94%", end: "top 28%", scrub: 0.8 } });

        ScrollTrigger.create({
          trigger: section,
          start: "top 58%",
          end: "bottom 42%",
          onEnter: () => setActiveChapter(index),
          onEnterBack: () => setActiveChapter(index),
          onToggle: self => section.classList.toggle("is-section-active", self.isActive)
        });
      });

      // About: progressive focus moves through the three principles.
      gsap.utils.toArray(".about .story-block").forEach(block => {
        const content = block.querySelectorAll("h3, p");
        gsap.fromTo(content, { x: 28, opacity: 0.3 }, {
          x: 0,
          opacity: 1,
          stagger: 0.08,
          ease: "none",
          scrollTrigger: { trigger: block, start: "top 82%", end: "top 48%", scrub: 0.75 }
        });
        ScrollTrigger.create({ trigger: block, start: "top 62%", end: "bottom 40%", toggleClass: { targets: block, className: "is-story-active" } });
      });

      // Focused system cards travel on separate depth planes from their captions and code panels.
      gsap.utils.toArray("[data-system-proof]").forEach((proof, index) => {
        const media = proof.querySelector(".system-proof-media");
        const caption = proof.querySelector(".system-proof-caption");
        const codePanel = proof.querySelector(".system-proof-code");
        gsap.fromTo(media, { xPercent: index % 2 ? -7 : 7, rotateY: index % 2 ? 3.5 : -3.5, scale: 0.94 }, {
          xPercent: index % 2 ? 3 : -3,
          rotateY: 0,
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: proof, start: "top 92%", end: "bottom 18%", scrub: 1.1 }
        });
        gsap.fromTo(caption, { y: 30, opacity: 0.35 }, { y: -8, opacity: 1, ease: "none", scrollTrigger: { trigger: proof, start: "top 82%", end: "center 48%", scrub: 0.75 } });
        if (codePanel) gsap.to(codePanel, { y: index % 2 ? -95 : 95, rotate: index % 2 ? -1 : 1, ease: "none", scrollTrigger: { trigger: proof, start: "top bottom", end: "bottom top", scrub: 1.35 } });
      });

      const horrorShowcase = document.querySelector("[data-horror-showcase]");
      const horrorFrame = horrorShowcase?.querySelector(".horror-frame");
      if (horrorShowcase && horrorFrame) {
        gsap.fromTo(horrorFrame, { clipPath: "inset(9% 6% 9% 6% round 28px)", scale: 0.94 }, {
          clipPath: "inset(0% 0% 0% 0% round 0px)",
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: horrorShowcase, start: "top 88%", end: "top 18%", scrub: 1 }
        });
        gsap.fromTo(horrorFrame.querySelector("video"), { scale: 1.075 }, { scale: 1, ease: "none", scrollTrigger: { trigger: horrorShowcase, start: "top bottom", end: "bottom top", scrub: 1.3 } });
        gsap.fromTo(horrorFrame.querySelector(".horror-copy"), { y: 45, opacity: 0.2 }, { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: horrorShowcase, start: "top 58%", end: "top 18%", scrub: 0.8 } });
      }

      // Journey: milestones slide into focus while the existing orbit remains sticky.
      gsap.utils.toArray(".journey .timeline-item").forEach(item => {
        const content = item.querySelectorAll(".timeline-year, h3, p, .timeline-tags");
        gsap.fromTo(content, { x: 38, opacity: 0.28 }, {
          x: 0,
          opacity: 1,
          stagger: 0.055,
          ease: "none",
          scrollTrigger: { trigger: item, start: "top 84%", end: "top 48%", scrub: 0.8 }
        });
      });

      // Expertise: cards receive a traveling edge light instead of another heavy entrance.
      gsap.utils.toArray(".expertise .skill-card").forEach(card => {
        ScrollTrigger.create({ trigger: card, start: "top 72%", end: "bottom 36%", toggleClass: { targets: card, className: "is-skill-active" } });
        const icon = card.querySelector(".skill-icon");
        gsap.fromTo(icon, { rotate: -10, scale: 0.86 }, { rotate: 0, scale: 1, duration: 0.75, ease: "back.out(1.8)", scrollTrigger: { trigger: card, start: "top 76%", once: true } });
      });

      // Projects: content resolves in layers while each media chapter remains dominant.
      projects.forEach((project, index) => {
        const infoBits = project.querySelectorAll(".project-info > div:first-child, .project-info h3, .project-info > p, .project-tags, .text-link");
        gsap.fromTo(infoBits, { x: index % 2 ? -34 : 34, opacity: 0.3 }, {
          x: 0,
          opacity: 1,
          stagger: 0.045,
          ease: "none",
          scrollTrigger: { trigger: project, start: "top 82%", end: "center 58%", scrub: 0.85 }
        });
      });

      // Testimonials: a connecting light line and staggered depth maintain visual rhythm.
      const testimonialGrid = document.querySelector(".testimonial-grid");
      if (testimonialGrid) {
        gsap.fromTo(testimonialGrid, { "--testimonial-line": 0 }, { "--testimonial-line": 1, ease: "none", scrollTrigger: { trigger: testimonialGrid, start: "top 82%", end: "center 48%", scrub: 0.8 } });
      }
      gsap.utils.toArray(".testimonial-card").forEach((card, index) => {
        gsap.fromTo(card, { xPercent: (index - 1) * 7, rotateY: index === 0 ? -3 : index === 2 ? 3 : 0, scale: 0.95 }, { xPercent: 0, rotateY: 0, scale: 1, ease: "none", scrollTrigger: { trigger: card, start: "top 90%", end: "top 55%", scrub: 0.9 } });
        ScrollTrigger.create({ trigger: card, start: "top 67%", end: "bottom 34%", toggleClass: { targets: card, className: "is-testimonial-active" } });
      });
    });

    // The skill system map becomes a single intentional pinned moment on wide screens.
    postHeroMotion.add("(min-width: 1024px)", () => {
      if (!skillMap) return;
      const pinTimeline = gsap.timeline({
        scrollTrigger: {
          trigger: skillMap,
          start: "top 110px",
          end: "+=560",
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 1,
          invalidateOnRefresh: true,
          onToggle: self => skillMap.classList.toggle("is-map-pinned", self.isActive)
        }
      });
      pinTimeline
        .to(".system-visual", { scale: 1.055, ease: "none" }, 0)
        .to(".system-lines", { rotate: 7, transformOrigin: "50% 50%", ease: "none" }, 0)
        .to(".node-ui", { x: -16, y: -10, ease: "none" }, 0)
        .to(".node-economy", { x: 14, y: -12, ease: "none" }, 0)
        .to(".node-combat", { x: 17, y: 11, ease: "none" }, 0)
        .to(".node-optimize", { x: -15, y: 12, ease: "none" }, 0)
        .to(".skill-map-copy", { y: -14, ease: "none" }, 0);

      // The pin adds scroll space after the chapter triggers are built.
      // Refresh after layout settles so downstream chapters stay aligned.
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
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
