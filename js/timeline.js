(function () {
  const MIN_YEAR = 1930;
  const MAX_YEAR = 1950;
  const YEAR_SPAN = (MAX_YEAR - MIN_YEAR) + 1;
  const AUTOPLAY_STEP = 0.25;
  const AUTOPLAY_QUARTER_MS_FAST = 420;
  const AUTOPLAY_QUARTER_MS_NORMAL = 760;
  const AUTOPLAY_QUARTER_MS_SLOW = 1450;

  const TIMELINE_ICON_BASE = './assets/icons/timeline/';
  const TIMELINE_ICON_EXT = '.png';
  const TIMELINE_ICON_KEYS = new Set([
    'advance',
    'airstrike',
    'assasination',
    'changeofgovernment',
    'map',
    'naval',
    'negotiation',
    'retreat',
    'route',
    'surrender',
    'treaty',
    'war'
  ]);

  const TIMELINE_ICON_ALIAS_MAP = {
    'statecraft': 'negotiation',
    'diplomacy': 'treaty',
    'peace': 'treaty',
    'command': 'war',
    'war': 'war',
    'land warfare': 'war',
    'naval warfare': 'naval',
    'mobile warfare': 'advance',
    'expansion': 'advance',
    'liberation': 'advance',
    'exile': 'route',
    'collapse': 'retreat',
    'defense': 'retreat',
    'resistance': 'retreat',
    'collaboration': 'changeofgovernment',
    'authority': 'changeofgovernment',
    'leadership': 'changeofgovernment',
    'propaganda': 'changeofgovernment',
    'strategy': 'map',
    'science': 'map',
    'research': 'map',
    'industry': 'map',
    'empire': 'map',
    'identity': 'map',
    'legacy': 'map',
    'ethics': 'map'
  };

  const TITLE_HINTS = [
    [/treaty|agreement|conference|munich|yalt|potsdam|armistice/i, 'treaty'],
    [/midway|fleet|naval|carrier|pacific/i, 'naval'],
    [/retreat|collapse|defen|siege|stalingrad/i, 'retreat'],
    [/exile|escape|route|evacuation/i, 'route'],
    [/invasion|offensive|barbarossa|blitz|advance|expansion|liberation/i, 'advance'],
    [/bomb|air|blitz|london|hiroshima/i, 'airstrike'],
    [/surrender|capitulation/i, 'surrender'],
    [/coup|chancellor|election|government|regime|night of the long knives/i, 'changeofgovernment'],
    [/assassin|murder|killed|death/i, 'assasination']
  ];

  const timelineState = {
    minYear: MIN_YEAR,
    maxYear: MAX_YEAR,
    currentYear: MIN_YEAR,
    currentPosition: MIN_YEAR,
    selectedYear: MIN_YEAR,
    selectedPosition: MIN_YEAR,
    milestones: [],
    activeEventIndex: null,
    dragging: false,
    pendingDragPosition: null,
    bootstrapped: false,
    autoplay: false,
    autoplayTimer: null,
    autoplayRaf: null,
    autoplayLastQuarterPosition: null,
    suppressExternalSyncUntil: 0,
    pendingTargetEventIndex: null,
    pendingTargetPosition: null,
    pointerLockedToSelectedPosition: false
  };

  window.timelineState = timelineState;

  function clampYear(year) {
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR, Number(year) || MIN_YEAR));
  }

  function clampPosition(position) {
    const raw = Number(position);
    if (!Number.isFinite(raw)) return MIN_YEAR;
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR + 0.999, raw));
  }

  function positionToYear(position) {
    return Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.floor(clampPosition(position))));
  }

  function getPercentForPosition(position) {
    return ((clampPosition(position) - MIN_YEAR) / YEAR_SPAN) * 100;
  }

  function roundPositionToQuarter(position) {
    const clamped = clampPosition(position);
    const rounded = Math.round((clamped - MIN_YEAR) * 4) / 4 + MIN_YEAR;
    return clampPosition(Number(rounded.toFixed(2)));
  }

  function parseYearMonth(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    const match = value.match(/(19\d{2}|20\d{2})(?:[-/.](\d{1,2}))?/);
    if (!match) return null;
    const year = clampYear(Number(match[1]));
    let month = Number(match[2]);
    if (!Number.isFinite(month) || month < 1 || month > 12) month = 1;
    return { year, month };
  }

  function extractEventYear(event) {
    if (!event) return null;
    if (Number.isFinite(Number(event.year))) return clampYear(Number(event.year));
    const parsed = parseYearMonth(event.dateStart || event.date || '');
    return parsed ? parsed.year : null;
  }

  function quarterFromMonth(month) {
    if (!Number.isFinite(month)) return 0;
    if (month <= 3) return 0;
    if (month <= 6) return 0.25;
    if (month <= 9) return 0.5;
    return 0.75;
  }

  function extractEventPosition(event) {
    if (!event) return MIN_YEAR;
    const parsed = parseYearMonth(event.dateStart || event.date || '');
    if (parsed) {
      return clampPosition(parsed.year + quarterFromMonth(parsed.month));
    }
    const year = extractEventYear(event);
    return clampPosition((Number.isFinite(year) ? year : MIN_YEAR));
  }

  function normalizeTagKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9: -]/g, '');
  }

  function resolveTimelineIconKey(event) {
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    const normalizedTags = tags.map(normalizeTagKey).filter(Boolean);

    for (const rawTag of normalizedTags) {
      if (rawTag.startsWith('icon:') || rawTag.startsWith('photo:')) {
        const explicitKey = rawTag.split(':').slice(1).join(':').trim();
        if (TIMELINE_ICON_KEYS.has(explicitKey)) return explicitKey;
      }
    }

    for (const rawTag of normalizedTags) {
      if (TIMELINE_ICON_KEYS.has(rawTag)) return rawTag;
    }

    for (const rawTag of normalizedTags) {
      if (TIMELINE_ICON_ALIAS_MAP[rawTag]) return TIMELINE_ICON_ALIAS_MAP[rawTag];
    }

    const title = String(event?.title || '');
    for (const [pattern, iconKey] of TITLE_HINTS) {
      if (pattern.test(title)) return iconKey;
    }

    return 'map';
  }

  function getTimelineIconSrc(event) {
    return `${TIMELINE_ICON_BASE}${resolveTimelineIconKey(event)}${TIMELINE_ICON_EXT}`;
  }

  function getSelectedPersonEvents() {
    const person = window.currentPerson;
    if (!person || !Array.isArray(person.events)) return [];
    const base = person.events
      .map((event, index) => ({
        ...event,
        _eventIndex: index,
        _year: extractEventYear(event),
        _position: extractEventPosition(event)
      }))
      .filter(event => Number.isFinite(event._year));

    const grouped = new Map();
    base.forEach(event => {
      const key = event._position.toFixed(2);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    });

    grouped.forEach(items => {
      if (items.length <= 1) return;
      items.sort((a, b) => a._eventIndex - b._eventIndex);
      const center = (items.length - 1) / 2;
      items.forEach((event, idx) => {
        const offset = (idx - center) * 0.06;
        event._displayPosition = clampPosition(event._position + offset);
      });
    });

    base.forEach(event => {
      if (!Number.isFinite(event._displayPosition)) {
        event._displayPosition = event._position;
      }
    });

    return base;
  }

  function createTimelineShell() {
    let el = document.getElementById('timeline');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'timeline';
    el.innerHTML = `
      <div class="timeline-shell">
        <div class="timeline-topline">
          <div class="timeline-title">Timeline</div>
          <div class="timeline-controls">
            <button id="sidebarRouteToggle" class="timeline-route-toggle timeline-autoplay-toggle" type="button" aria-pressed="false">Route</button>
            <button id="timelineAutoplayToggle" class="timeline-autoplay-toggle" type="button" aria-pressed="false">Play</button>
          </div>
        </div>
        <div id="timelineTrackWrap" class="timeline-track-wrap">
          <div id="timelineTrack" class="timeline-track">
            <div id="timelineMinorTicks" class="timeline-minor-ticks"></div>
            <div id="timelineYearTicks" class="timeline-year-ticks"></div>
            <div id="timelineEventDots" class="timeline-event-dots"></div>
            <div id="timelinePointer" class="timeline-pointer" role="slider" aria-valuemin="1930" aria-valuemax="1950" aria-valuenow="1930"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    document.body.classList.add('timeline-mounted');
    bindTimelineEvents();
    return el;
  }

  function renderMinorTicks() {
    const ticksEl = document.getElementById('timelineMinorTicks');
    if (!ticksEl) return;
    ticksEl.innerHTML = '';
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      [0.25, 0.5, 0.75].forEach(part => {
        const tick = document.createElement('span');
        tick.className = 'timeline-minor-tick';
        tick.style.left = `${getPercentForPosition(year + part)}%`;
        ticksEl.appendChild(tick);
      });
    }
  }

  function renderYearTicks() {
    const ticksEl = document.getElementById('timelineYearTicks');
    if (!ticksEl) return;
    ticksEl.innerHTML = '';
    for (let year = MIN_YEAR; year <= MAX_YEAR; year += 1) {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'timeline-year-tick';
      tick.dataset.year = String(year);
      tick.style.left = `${getPercentForPosition(year)}%`;
      tick.innerHTML = `<span class="timeline-tick-mark"></span><span class="timeline-tick-label">${year}</span>`;
      tick.addEventListener('click', () => window.timelineJumpToYear(year));
      ticksEl.appendChild(tick);
    }
  }

  function renderEventDots() {
    const dotsEl = document.getElementById('timelineEventDots');
    if (!dotsEl) return;
    dotsEl.innerHTML = '';

    const events = getSelectedPersonEvents();
    events.forEach((event, stackIndex) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'timeline-event-dot timeline-event-dot--icon';
      dot.dataset.year = String(event._year);
      dot.dataset.eventIndex = String(event._eventIndex);
      dot.dataset.iconKey = resolveTimelineIconKey(event);
      dot.style.left = `${getPercentForPosition(event._displayPosition)}%`;
      dot.style.bottom = `${24 + (stackIndex % 2) * 12}px`;
      dot.title = `${event.dateStart || event._year} · ${event.title}`;
      dot.setAttribute('aria-label', `${event.dateStart || event._year} ${event.title}`);
      dot.innerHTML = `<img class="timeline-event-dot-icon" src="${getTimelineIconSrc(event)}" alt="" loading="lazy" decoding="async" />`;
      const dotImage = dot.querySelector('.timeline-event-dot-icon');
      if (dotImage) {
        dotImage.addEventListener('error', () => {
          dot.dataset.iconError = 'true';
        }, { once: true });
      }
      dot.addEventListener('click', (evt) => {
        evt.stopPropagation();
        stopAutoplay();
        window.timelineJumpToEvent(event._eventIndex);
      });
      dotsEl.appendChild(dot);
    });
  }

  function updatePointer(position) {
    const pointer = document.getElementById('timelinePointer');
    if (!pointer) return;
    const safePosition = normalizePositionForCurrentContext(position);
    const safeYear = positionToYear(safePosition);
    timelineState.currentPosition = safePosition;
    timelineState.currentYear = safeYear;
    timelineState.selectedPosition = safePosition;
    timelineState.selectedYear = safeYear;
    pointer.style.left = `${getPercentForPosition(safePosition)}%`;
    pointer.setAttribute('aria-valuenow', String(safeYear));

    document.querySelectorAll('.timeline-year-tick').forEach((tick) => {
      tick.classList.toggle('active', Number(tick.dataset.year) === safeYear);
    });
    document.querySelectorAll('.timeline-event-dot').forEach((dot) => {
      const isActiveEvent = timelineState.activeEventIndex !== null && Number(dot.dataset.eventIndex) === timelineState.activeEventIndex;
      dot.classList.toggle('active', isActiveEvent);
    });
  }

  function findEventByIndex(eventIndex) {
    return getSelectedPersonEvents().find(event => event._eventIndex === eventIndex) || null;
  }

  function resolveTargetEventIndexForPosition(position) {
    const events = getSelectedPersonEvents().sort((a, b) => {
      if (a._position !== b._position) return a._position - b._position;
      return a._eventIndex - b._eventIndex;
    });
    if (!events.length) return null;

    const safePosition = normalizePositionForCurrentContext(position);
    const exact = events.filter(event => Math.abs(event._position - safePosition) < 0.001);
    if (exact.length) return exact[0]._eventIndex;

    const previous = events.filter(event => event._position <= safePosition + 0.001);
    if (previous.length) return previous[previous.length - 1]._eventIndex;

    return events[0]._eventIndex;
  }

  function getFirstEventPosition() {
    const events = getSelectedPersonEvents().sort((a, b) => {
      if (a._position !== b._position) return a._position - b._position;
      return a._eventIndex - b._eventIndex;
    });
    return events.length ? events[0]._position : MIN_YEAR;
  }

  function getFirstEventIndex() {
    const events = getSelectedPersonEvents().sort((a, b) => {
      if (a._position !== b._position) return a._position - b._position;
      return a._eventIndex - b._eventIndex;
    });
    return events.length ? events[0]._eventIndex : null;
  }

  function getLastEventMeta() {
    const events = getSelectedPersonEvents().sort((a, b) => {
      if (a._position !== b._position) return a._position - b._position;
      return a._eventIndex - b._eventIndex;
    });
    return events.length ? events[events.length - 1] : null;
  }

  function getLastEventPosition() {
    const last = getLastEventMeta();
    return last ? last._position : MAX_YEAR;
  }

  function getLastEventIndex() {
    const last = getLastEventMeta();
    return last ? last._eventIndex : null;
  }

  function normalizePositionForCurrentContext(position) {
    const safe = clampPosition(position);
    if (!window.currentPerson) return safe;
    const first = getFirstEventPosition();
    return safe < first ? first : safe;
  }

  function movePointerFromClientX(clientX, shouldCommit = false) {
    const track = document.getElementById('timelineTrack');
    if (!track) return;
    const rect = track.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(rect.width, x));
    const ratio = rect.width ? x / rect.width : 0;
    const position = roundPositionToQuarter(MIN_YEAR + ratio * YEAR_SPAN);
    timelineState.pendingDragPosition = position;
    updatePointer(position);
    if (shouldCommit) {
      window.timelineJumpToPosition(position);
    }
  }

  function getAutoplayQuarterMsForPosition(position) {
    const events = getSelectedPersonEvents();
    if (!events.length) return AUTOPLAY_QUARTER_MS_NORMAL;
    const safePosition = normalizePositionForCurrentContext(position);
    const nearestDistance = events.reduce((minDistance, event) => {
      const distance = Math.abs((event._position ?? MIN_YEAR) - safePosition);
      return Math.min(minDistance, distance);
    }, Infinity);
    if (nearestDistance <= 0.10) return AUTOPLAY_QUARTER_MS_SLOW;
    if (nearestDistance <= 0.28) return AUTOPLAY_QUARTER_MS_NORMAL;
    return AUTOPLAY_QUARTER_MS_FAST;
  }

  function bindTimelineEvents() {
    const pointer = document.getElementById('timelinePointer');
    const track = document.getElementById('timelineTrack');
    if (!pointer || !track) return;

    pointer.addEventListener('mousedown', (evt) => {
      evt.preventDefault();
      stopAutoplay();
      timelineState.dragging = true;
      document.body.classList.add('timeline-dragging');
    });

    track.addEventListener('click', (evt) => {
      if (evt.target.closest('.timeline-event-dot') || evt.target.closest('.timeline-year-tick') || evt.target.closest('.timeline-autoplay-toggle') || evt.target.closest('.timeline-route-toggle')) return;
      stopAutoplay();
      movePointerFromClientX(evt.clientX, true);
    });

    document.addEventListener('mousemove', (evt) => {
      if (!timelineState.dragging) return;
      evt.preventDefault();
      movePointerFromClientX(evt.clientX, false);
    });

    document.addEventListener('mouseup', () => {
      if (!timelineState.dragging) return;
      timelineState.dragging = false;
      document.body.classList.remove('timeline-dragging');
      const targetPosition = roundPositionToQuarter(timelineState.pendingDragPosition ?? timelineState.currentPosition);
      timelineState.pendingDragPosition = null;
      window.timelineJumpToPosition(targetPosition);
    });

    const routeToggle = document.getElementById('sidebarRouteToggle');
    if (routeToggle) {
      routeToggle.addEventListener('click', (evt) => {
        evt.stopPropagation();
        stopAutoplay({ suppressReset: true });
        if (typeof window.toggleRouteOverview === 'function') {
          window.toggleRouteOverview();
        }
      });
    }

    const autoplayToggle = document.getElementById('timelineAutoplayToggle');
    if (autoplayToggle) {
      autoplayToggle.addEventListener('click', (evt) => {
        evt.stopPropagation();
        if (timelineState.autoplay) stopAutoplay();
        else startAutoplay();
      });
    }
  }

  function setAutoplayButtonState() {
    const btn = document.getElementById('timelineAutoplayToggle');
    if (!btn) return;
    btn.textContent = timelineState.autoplay ? 'Pause' : 'Play';
    btn.setAttribute('aria-pressed', String(!!timelineState.autoplay));
    btn.classList.toggle('active', !!timelineState.autoplay);
  }

  function resetPointerToFirstEvent(options = {}) {
    timelineState.pointerLockedToSelectedPosition = false;
    if (!window.currentPerson) {
      updatePointer(MIN_YEAR);
      if (typeof window.showTerritoryForTime === 'function') {
        window.showTerritoryForTime({ year: MIN_YEAR });
      }
      return;
    }
    const firstIndex = getFirstEventIndex();
    const firstPosition = getFirstEventPosition();
    updatePointer(firstPosition);
    timelineState.activeEventIndex = firstIndex;
    if (typeof window.showTerritoryForTime === 'function') {
      window.showTerritoryForTime({ year: positionToYear(firstPosition) });
    }
    if (!options.skipJump && Number.isFinite(firstIndex)) {
      window.timelineJumpToEvent(firstIndex, { preserveAutoplay: true, preservePointer: true, suppressAutoplayStop: true });
    }
  }

  function stopAutoplay(options = {}) {
    const wasAutoplaying = timelineState.autoplay || !!timelineState.autoplayTimer || !!timelineState.autoplayRaf;
    timelineState.autoplay = false;
    if (timelineState.autoplayTimer) {
      clearInterval(timelineState.autoplayTimer);
      timelineState.autoplayTimer = null;
    }
    if (timelineState.autoplayRaf) {
      cancelAnimationFrame(timelineState.autoplayRaf);
      timelineState.autoplayRaf = null;
    }
    timelineState.autoplayLastQuarterPosition = null;
    setAutoplayButtonState();
    if (!options.suppressReset && (wasAutoplaying || options.forceReset)) {
      resetPointerToFirstEvent(options);
    }
  }

  function startAutoplay() {
    stopAutoplay({ suppressReset: true });
    const firstPosition = getFirstEventPosition();
    const lastPosition = getLastEventPosition();
    let startPosition = normalizePositionForCurrentContext(timelineState.currentPosition);
    if (window.currentPerson && startPosition < firstPosition - 0.001) {
      startPosition = firstPosition;
      updatePointer(firstPosition);
    }
    timelineState.autoplay = true;
    timelineState.pointerLockedToSelectedPosition = true;
    timelineState.selectedPosition = startPosition;
    timelineState.selectedYear = positionToYear(startPosition);
    timelineState.autoplayLastQuarterPosition = roundPositionToQuarter(startPosition);
    setAutoplayButtonState();

    let lastTs = null;
    let position = startPosition;

    const tick = (ts) => {
      if (!timelineState.autoplay) return;
      if (lastTs === null) {
        lastTs = ts;
        timelineState.autoplayRaf = requestAnimationFrame(tick);
        return;
      }

      const delta = Math.min(64, Math.max(0, ts - lastTs));
      lastTs = ts;
      const quarterMs = getAutoplayQuarterMsForPosition(position);
      const speedPerMs = AUTOPLAY_STEP / quarterMs;
      let rawPosition = position + delta * speedPerMs;

      if (window.currentPerson && rawPosition >= lastPosition - 0.001) {
        updatePointer(lastPosition);
        window.timelineJumpToEvent(getLastEventIndex(), { preserveAutoplay: true, preservePointer: false, suppressAutoplayStop: true });
        stopAutoplay({ suppressReset: true });
        return;
      }

      const safeRawPosition = normalizePositionForCurrentContext(rawPosition);
      position = safeRawPosition;
      timelineState.pointerLockedToSelectedPosition = true;
      timelineState.selectedPosition = safeRawPosition;
      timelineState.selectedYear = positionToYear(safeRawPosition);
      updatePointer(safeRawPosition);

      const quarterPosition = roundPositionToQuarter(safeRawPosition);
      if (timelineState.autoplayLastQuarterPosition === null || quarterPosition > timelineState.autoplayLastQuarterPosition + 0.001) {
        timelineState.autoplayLastQuarterPosition = quarterPosition;
        window.timelineJumpToPosition(quarterPosition, { preserveAutoplay: true });
      }

      timelineState.autoplayRaf = requestAnimationFrame(tick);
    };

    timelineState.autoplayRaf = requestAnimationFrame(tick);
  }

  function holdExternalSync(targetEventIndex, targetPosition) {
    timelineState.suppressExternalSyncUntil = Date.now() + 900;
    timelineState.pendingTargetEventIndex = Number.isFinite(targetEventIndex) ? targetEventIndex : null;
    timelineState.pendingTargetPosition = Number.isFinite(targetPosition) ? targetPosition : null;
  }

  function releasePendingSyncIfExpired() {
    if (Date.now() <= timelineState.suppressExternalSyncUntil) return;
    timelineState.suppressExternalSyncUntil = 0;
    timelineState.pendingTargetEventIndex = null;
    timelineState.pendingTargetPosition = null;
    timelineState.pointerLockedToSelectedPosition = false;
  }

  function shouldIgnoreExternalSync(stepIndex, chapter) {
    if (timelineState.dragging) return true;
    if (Date.now() > timelineState.suppressExternalSyncUntil) {
      releasePendingSyncIfExpired();
      return false;
    }
    if (Number.isFinite(timelineState.pendingTargetEventIndex) && stepIndex === timelineState.pendingTargetEventIndex) {
      return false;
    }
    const chapterPosition = extractEventPosition(chapter);
    if (Number.isFinite(timelineState.pendingTargetPosition) && Math.abs(chapterPosition - timelineState.pendingTargetPosition) < 0.251) {
      return false;
    }
    return true;
  }

  function getActiveChapterIndex() {
    if (Number.isFinite(window.currentStepIndex) && window.currentStepIndex >= 0) return window.currentStepIndex;
    return 0;
  }

  window.initTimeline = function initTimeline() {
    createTimelineShell();
    renderMinorTicks();
    renderYearTicks();
    renderEventDots();
    updatePointer(MIN_YEAR);
    timelineState.bootstrapped = true;
  };

  window.refreshTimeline = function refreshTimeline() {
    createTimelineShell();
    renderMinorTicks();
    renderYearTicks();
    renderEventDots();
    setAutoplayButtonState();
    releasePendingSyncIfExpired();

    const events = getSelectedPersonEvents();
    if (!events.length) {
      timelineState.activeEventIndex = null;
      timelineState.pointerLockedToSelectedPosition = false;
      const fallbackYear = timelineState.selectedYear ?? timelineState.currentYear ?? MIN_YEAR;
      updatePointer(fallbackYear);
      if (typeof window.showTerritoryForTime === 'function') {
        window.showTerritoryForTime({ year: fallbackYear });
      }
      return;
    }

    const activeChapterIndex = getActiveChapterIndex();
    const activeEvent = events.find(event => event._eventIndex === activeChapterIndex) || events[0];
    timelineState.activeEventIndex = activeEvent._eventIndex;
    const pointerPosition = timelineState.autoplay && Number.isFinite(timelineState.selectedPosition)
      ? timelineState.selectedPosition
      : (timelineState.pointerLockedToSelectedPosition && Number.isFinite(timelineState.selectedPosition)
        ? timelineState.selectedPosition
        : activeEvent._position);
    updatePointer(pointerPosition);
    if (typeof window.showTerritoryForTime === 'function') {
      window.showTerritoryForTime({
        territoryKey: activeEvent?.territoryKey || null,
        timelineKey: activeEvent?.timelineKey || null,
        year: activeEvent?._year || timelineState.currentYear
      });
    }
  };

  window.setTimelineActiveChapter = function setTimelineActiveChapter(stepIndex, chapter) {
    if (shouldIgnoreExternalSync(stepIndex, chapter)) return;
    const chapterPosition = extractEventPosition(chapter);
    const hasLockedSelection = timelineState.pointerLockedToSelectedPosition && Number.isFinite(timelineState.selectedPosition);
    const withinPendingWindow = Date.now() <= timelineState.suppressExternalSyncUntil;
    const matchedPendingTarget = (
      Number.isFinite(timelineState.pendingTargetEventIndex) && stepIndex === timelineState.pendingTargetEventIndex
    ) || (
      Number.isFinite(timelineState.pendingTargetPosition) &&
      Math.abs(chapterPosition - timelineState.pendingTargetPosition) < 0.251
    );
    const keepSelectedPosition = timelineState.autoplay
      ? hasLockedSelection
      : (hasLockedSelection && (withinPendingWindow || matchedPendingTarget));
    const position = keepSelectedPosition ? timelineState.selectedPosition : chapterPosition;
    timelineState.activeEventIndex = Number.isFinite(stepIndex) ? stepIndex : null;
    updatePointer(position);

    if (keepSelectedPosition) {
      timelineState.suppressExternalSyncUntil = 0;
      timelineState.pendingTargetEventIndex = timelineState.activeEventIndex;
      timelineState.pendingTargetPosition = timelineState.selectedPosition;
      return;
    }

    timelineState.pendingTargetEventIndex = timelineState.activeEventIndex;
    timelineState.pendingTargetPosition = position;
    timelineState.pointerLockedToSelectedPosition = false;
    if (typeof window.showTerritoryForTime === 'function') {
      window.showTerritoryForTime({
        territoryKey: chapter?.territoryKey || null,
        timelineKey: chapter?.timelineKey || null,
        year: chapter?.year || timelineState.currentYear
      });
    }
  };

  window.timelineJumpToEvent = function timelineJumpToEvent(eventIndex, options = {}) {
    if (!Number.isFinite(eventIndex)) return false;
    const chapter = window.config?.chapters?.[eventIndex];
    const eventMeta = findEventByIndex(eventIndex);
    const chapterPosition = eventMeta?._position ?? extractEventPosition(chapter);
    timelineState.activeEventIndex = eventIndex;
    if (Number.isFinite(eventIndex)) window.currentStepIndex = eventIndex;
    holdExternalSync(eventIndex, chapterPosition);
    if (!options.preservePointer) {
      timelineState.pointerLockedToSelectedPosition = false;
      updatePointer(chapterPosition);
    }
    if (typeof window.jumpToStoryStep === 'function') {
      const ok = window.jumpToStoryStep(eventIndex);
      if (!options.preserveAutoplay && !options.suppressAutoplayStop) stopAutoplay();
      return ok;
    }
    const target = chapter?.id ? document.getElementById(chapter.id) : null;
    if (!target) {
      if (!options.preserveAutoplay && !options.suppressAutoplayStop) stopAutoplay();
      return false;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!options.preserveAutoplay && !options.suppressAutoplayStop) stopAutoplay();
    return true;
  };

  window.timelineJumpToPosition = function timelineJumpToPosition(position, options = {}) {
    const safePosition = normalizePositionForCurrentContext(roundPositionToQuarter(position));
    timelineState.selectedPosition = safePosition;
    timelineState.selectedYear = positionToYear(safePosition);
    timelineState.pointerLockedToSelectedPosition = true;
    const targetEventIndex = resolveTargetEventIndexForPosition(safePosition);
    holdExternalSync(targetEventIndex, safePosition);
    updatePointer(safePosition);
    if (typeof window.showTerritoryForTime === 'function') {
      window.showTerritoryForTime({ year: timelineState.selectedYear });
    }
    if (targetEventIndex === null) {
      if (!options.preserveAutoplay) stopAutoplay();
      return false;
    }
    return window.timelineJumpToEvent(targetEventIndex, { ...options, preservePointer: true });
  };

  window.timelineJumpToYear = function timelineJumpToYear(year, options = {}) {
    return window.timelineJumpToPosition(clampYear(year), options);
  };

  window.timelineForceSyncToEvent = function timelineForceSyncToEvent(stepIndex, chapter) {
    releasePendingSyncIfExpired();
    timelineState.suppressExternalSyncUntil = 0;
    timelineState.pendingTargetEventIndex = null;
    timelineState.pendingTargetPosition = null;
    timelineState.pointerLockedToSelectedPosition = false;
    timelineState.activeEventIndex = Number.isFinite(stepIndex) ? stepIndex : null;
    updatePointer(extractEventPosition(chapter));
    if (typeof window.showTerritoryForTime === 'function') {
      window.showTerritoryForTime({
        territoryKey: chapter?.territoryKey || null,
        timelineKey: chapter?.timelineKey || null,
        year: chapter?.year || timelineState.currentYear
      });
    }
  };

  window.setTimelineVisibility = function setTimelineVisibility(visible) {
    const el = document.getElementById('timeline');
    if (!el) return;
    el.classList.toggle('hidden', !visible);
  };

  window.stopTimelineAutoplay = function stopTimelineAutoplay(options = {}) {
    stopAutoplay(options);
  };

  window.resetTimelineToFirstEvent = function resetTimelineToFirstEvent(options = {}) {
    resetPointerToFirstEvent(options);
  };
})();
