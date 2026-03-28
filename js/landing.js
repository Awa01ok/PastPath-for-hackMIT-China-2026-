/**
 * landing.js
 * Landing hero and the transition from splash screen to browsing mode.
 */

function ensureLandingHero() {
  let hero = document.getElementById('landingHero');
  if (!hero) {
    hero = document.createElement('div');
    hero.id = 'landingHero';
    hero.className = 'landing-hero';
    hero.addEventListener('click', () => exitLandingMode());
    document.body.appendChild(hero);
  }
  hero.innerHTML = `
    <div class="landing-hero-inner landing-vault-mode">
      <div class="landing-vault-label">ARCHIVE VAULT</div>
      <div class="landing-vault-code">DOSSIER 1930–1950</div>
      <div class="landing-hero-title">PastPath</div>
      <div class="landing-hero-subtitle">World War II Biography Atlas</div>
      <div class="landing-hero-copy">Open a wartime archive of routes, decisions, and lives traced across a changing map.</div>
      <div class="landing-hero-actions no-cta">
        <div class="landing-hero-hint">Click or scroll to open dossier</div>
      </div>
    </div>
  `;
}

function syncLandingModeVisibility() {
  const isLanding = document.body.classList.contains('landing-mode');
  const ids = ['person-search-dock', 'person-sidebar', 'storyVisibilityDock', 'territoryLayerDock', 'story'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isLanding) {
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    } else {
      el.style.visibility = '';
      el.style.pointerEvents = '';
    }
  });
  const collapsedDock = document.getElementById('personSidebarCollapsedDock');
  if (collapsedDock) {
    if (isLanding) {
      collapsedDock.style.visibility = 'hidden';
      collapsedDock.style.pointerEvents = 'none';
    } else {
      collapsedDock.style.visibility = '';
      collapsedDock.style.pointerEvents = '';
    }
  }
}

function exitLandingMode() {
  document.body.classList.remove('landing-mode');
  syncLandingModeVisibility();
  if (typeof window.setTimelineVisibility === 'function') {
    window.setTimelineVisibility(true);
  }
  if (typeof window.setTerritoryLayerVisible === 'function') {
    window.setTerritoryLayerVisible(true);
  } else if (typeof window.refreshTerritoryForCurrentContext === 'function') {
    window.refreshTerritoryForCurrentContext();
  }
  if (typeof window.recoverInteractiveUI === 'function') {
    requestAnimationFrame(() => window.recoverInteractiveUI());
  }
}

function enterLandingMode() {
  ensureLandingHero();
  document.body.classList.add('landing-mode');
  syncLandingModeVisibility();
  if (typeof window.setTimelineVisibility === 'function') {
    window.setTimelineVisibility(false);
  }
  if (typeof window.setTerritoryLayerVisible === 'function') {
    window.setTerritoryLayerVisible(false);
  }
}

function bindLandingModeDismiss() {
  if (window.__landingDismissBound) return;
  window.__landingDismissBound = true;

  window.addEventListener('wheel', event => {
    if (!document.body.classList.contains('landing-mode')) return;
    if ((event.deltaY || 0) > 6) {
      event.preventDefault();
      exitLandingMode();
    }
  }, { passive: false });

  let touchStartY = null;
  window.addEventListener('touchstart', event => {
    if (!document.body.classList.contains('landing-mode')) return;
    touchStartY = event.touches && event.touches[0] ? event.touches[0].clientY : null;
  }, { passive: true });

  window.addEventListener('touchend', event => {
    if (!document.body.classList.contains('landing-mode')) return;
    const endY = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientY : null;
    if (touchStartY !== null && endY !== null && (touchStartY - endY) > 24) {
      exitLandingMode();
    }
    touchStartY = null;
  }, { passive: true });
}



function clearSelectionTransitionClasses() {
  document.body.classList.remove('selection-entering', 'selection-leaving', 'selection-transition');
  if (window.__selectionTransitionTimer) {
    clearTimeout(window.__selectionTransitionTimer);
    window.__selectionTransitionTimer = null;
  }
}

function beginSelectionTransition(mode, duration = 560) {
  clearSelectionTransitionClasses();
  document.body.classList.add('selection-transition');
  if (mode === 'enter') {
    document.body.classList.add('selection-entering');
  } else if (mode === 'leave') {
    document.body.classList.add('selection-leaving');
  }
  window.__selectionTransitionTimer = setTimeout(() => {
    clearSelectionTransitionClasses();
  }, duration);
}

function resetToUnselectedState() {
  if (typeof window.stopTimelineAutoplay === 'function') {
    window.stopTimelineAutoplay({ suppressReset: true });
  }
  exitLandingMode();
  beginSelectionTransition('leave', 720);

  if (window.storyMap && typeof window.storyMap.easeTo === 'function') {
    try {
      window.storyMap.easeTo({
        center: [60, 40],
        zoom: 2.8,
        pitch: 0,
        bearing: 0,
        duration: 700,
        essential: true
      });
    } catch (error) {
      console.warn('Failed to animate back to idle map:', error);
    }
  }

  currentPersonId = null;
  personSearchTerm = '';
  const searchInput = document.getElementById('personSearchInput');
  if (searchInput) searchInput.value = '';

  if (typeof window.showIdleMap === 'function') {
    window.showIdleMap();
  }

  const storyEl = document.getElementById('story');
  if (storyEl) {
    storyEl.classList.remove('overview-mode');
    storyEl.innerHTML = '';
  }

  window.currentPerson = null;
  window.config = null;
  window.pendingInitialChapterId = null;
  window.isSwitchingPerson = false;
  rerenderSidebar();
  if (typeof window.refreshTimeline === 'function') {
    window.refreshTimeline();
  }
}



function recoverInteractiveUI() {
  clearSelectionTransitionClasses();
  document.body.classList.remove('switching-person', 'route-overview-active');
  const layerConfig = {
    'person-search-dock': '320',
    'person-sidebar': '320',
    'timeline': '310',
    'storyVisibilityDock': '480',
    'territoryLayerDock': '480',
    'personSidebarCollapsedDock': '325'
  };
  Object.entries(layerConfig).forEach(([id, zIndex]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    el.style.zIndex = zIndex;
  });

  ['storyVisibilityToggle', 'territoryLayerToggle', 'sidebarRouteToggle', 'timelineAutoplayToggle'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.style.pointerEvents = 'auto';
    btn.style.position = 'relative';
    btn.style.zIndex = '341';
  });

  if (typeof window.initTerritoryLayer === 'function') {
    window.initTerritoryLayer();
  }
}
window.recoverInteractiveUI = recoverInteractiveUI;

let activePersonLoadToken = 0;

function loadPerson(personId) {
  if (!personId) return;
  const loadToken = ++activePersonLoadToken;

  if (typeof window.hidePersonHoverPreview === 'function') {
    window.hidePersonHoverPreview(true);
  }

  if (typeof window.stopTimelineAutoplay === 'function') {
    window.stopTimelineAutoplay({ suppressReset: true });
  }
  exitLandingMode();
  beginSelectionTransition('enter', 980);
  document.body.classList.add('switching-person');
  window.isSwitchingPerson = true;
  window.pendingInitialChapterId = null;

  const storyEl = document.getElementById('story');
  if (storyEl) {
    storyEl.classList.remove('overview-mode');
    storyEl.innerHTML = '';
  }

  currentStepIndex = 0;
  snapModeEnabled = true;
  boundaryLockDirection = null;
  isSnapScrolling = false;
  wheelCooldown = false;

  if (boundaryLockTimer) {
    clearTimeout(boundaryLockTimer);
    boundaryLockTimer = null;
  }

  if (window.storyScroller && typeof window.storyScroller.destroy === 'function') {
    window.storyScroller.destroy();
    window.storyScroller = null;
  }

  window.scrollTo({ top: 0, behavior: 'auto' });

  apiGet(`/api/people/${personId}`)
    .then(personData => {
      if (loadToken !== activePersonLoadToken) return;

      currentPersonId = personId;
      pushViewedPerson(personId);
      rerenderSidebar();

      window.currentPerson = personData;
      window.config = buildConfig(personData);
      const firstRealChapter = (window.config.chapters || []).find(chapter => !chapter.isOverview);
      window.pendingInitialChapterId = firstRealChapter ? firstRealChapter.id : null;

      initStory();

      requestAnimationFrame(() => {
        const firstRealStep = document.querySelector('.step:not(.overview-step)');

        if (firstRealStep) {
          document.querySelectorAll('.step.active').forEach(el => el.classList.remove('active'));
          firstRealStep.classList.add('active');
          firstRealStep.scrollIntoView({
            behavior: 'auto',
            block: 'center'
          });
        } else {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }

        requestAnimationFrame(() => {
          if (loadToken !== activePersonLoadToken) return;

          attachWheelSnap();
          window.isSwitchingPerson = false;
          document.body.classList.remove('switching-person');
          if (typeof window.refreshTimeline === 'function') {
            window.refreshTimeline();
          }
          if (typeof window.recoverInteractiveUI === 'function') {
            window.recoverInteractiveUI();
            [120, 420, 980, 1800].forEach(delay => {
              window.setTimeout(() => {
                if (loadToken !== activePersonLoadToken) return;
                window.recoverInteractiveUI();
              }, delay);
            });
          }
        });
      });
    })
    .catch(error => {
      if (loadToken !== activePersonLoadToken) return;
      console.error(`Failed to load person file for "${personId}" from API:`, error);
      window.pendingInitialChapterId = null;
      window.isSwitchingPerson = false;
      document.body.classList.remove('switching-person');
    });
}

function bindSidebarEvents() {
  const searchInput = document.getElementById('personSearchInput');
  const clearButton = document.getElementById('personSearchClear');
  const toggleButton = document.getElementById('personSidebarToggle');
  const sidebar = document.getElementById('person-sidebar');
  const searchDock = document.getElementById('person-search-dock');
  const hoverRoots = [sidebar, searchDock].filter(Boolean);
  const shelfTabs = document.querySelectorAll('.person-tab');
  const shelfPrev = document.getElementById('sidebarShelfPrev');
  const shelfNext = document.getElementById('sidebarShelfNext');
  const eventToggle = document.getElementById('storyVisibilityToggle');

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      personSearchTerm = event.target.value || '';
      renderPeopleList();
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      personSearchTerm = '';
      if (searchInput) searchInput.value = '';
      renderPeopleList();
      if (searchInput) searchInput.focus();
    });
  }

  if (toggleButton) {
    toggleButton.addEventListener('click', () => {
      const isCollapsed = sidebar?.classList.contains('collapsed');
      setSidebarCollapsed(!isCollapsed);
    });
  }

  shelfTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeSidebarTab = tab.dataset.tab || 'history';
      document.querySelectorAll('.person-tab').forEach(el => el.classList.toggle('active', el === tab));
      renderTopShelf();
    });
  });

  if (shelfPrev) {
    shelfPrev.addEventListener('click', () => {
      sidebarTabPage[activeSidebarTab] = Math.max(0, (sidebarTabPage[activeSidebarTab] || 0) - 1);
      renderTopShelf();
    });
  }

  if (shelfNext) {
    shelfNext.addEventListener('click', () => {
      sidebarTabPage[activeSidebarTab] = (sidebarTabPage[activeSidebarTab] || 0) + 1;
      renderTopShelf();
    });
  }


  if (eventToggle) {
    eventToggle.addEventListener('click', () => {
      if (typeof window.toggleStoryVisibility === 'function') {
        const hidden = window.toggleStoryVisibility();
        eventToggle.classList.toggle('active', !!hidden);
        eventToggle.setAttribute('aria-pressed', String(!!hidden));
        eventToggle.textContent = hidden ? 'Show events' : 'Hide events';
      }
    });
  }


  hoverRoots.forEach(root => {
    root.addEventListener('mouseover', event => {
      const personButton = event.target.closest('[data-person-id]');
      if (!personButton || !root.contains(personButton)) return;
      const related = event.relatedTarget?.closest?.('[data-person-id]');
      if (related === personButton) return;

      const personId = personButton.getAttribute('data-person-id');
      const person = personId ? getPersonById(personId) : null;
      if (typeof window.showPersonHoverPreview === 'function') {
        window.showPersonHoverPreview(person, personButton);
      }
    });

    root.addEventListener('mouseout', event => {
      const personButton = event.target.closest('[data-person-id]');
      if (!personButton || !root.contains(personButton)) return;
      const nextTarget = event.relatedTarget;
      if (nextTarget && (personButton.contains(nextTarget) || nextTarget.closest?.('#personHoverPreview'))) return;
      if (typeof window.scheduleHidePersonHoverPreview === 'function') {
        window.scheduleHidePersonHoverPreview();
      }
    });
  });

  window.addEventListener('scroll', () => {
    if (typeof window.hidePersonHoverPreview === 'function') {
      window.hidePersonHoverPreview(true);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (typeof window.hidePersonHoverPreview === 'function') {
      window.hidePersonHoverPreview(true);
    }
  });

  document.addEventListener('click', event => {
    const withinSidebar = event.target.closest('#person-sidebar, #person-search-dock');
    if (!withinSidebar) return;

    const tagButton = event.target.closest('[data-tag]');
    if (tagButton) {
      event.preventDefault();
      event.stopPropagation();

      const tag = tagButton.getAttribute('data-tag') || '';
      personSearchTerm = tag;
      if (searchInput) {
        searchInput.value = tag;
        searchInput.focus();
      }
      renderPeopleList();
      return;
    }

    const personButton = event.target.closest('[data-person-id]');
    if (personButton) {
      if (typeof window.scheduleHidePersonHoverPreview === 'function') {
        window.scheduleHidePersonHoverPreview();
      }
      event.preventDefault();
      const personId = personButton.getAttribute('data-person-id');
      if (!personId) return;

      if (searchInput) searchInput.blur();
      personSearchTerm = '';
      if (searchInput) searchInput.value = '';
      renderPeopleList();


      if (personId !== currentPersonId || !window.currentPerson) {
        loadPerson(personId);
      } else if (typeof window.refreshTimeline === 'function') {
        window.refreshTimeline();
      }

      if (window.innerWidth <= 900) {
        setSidebarCollapsed(true);
      }
    }
  });
}

function renderSearchDock() {
  const dock = document.getElementById('person-search-dock');
  if (!dock) return;

  dock.innerHTML = `
    <div class="person-search-shell slim-search-shell">
      <div class="person-search-row">
        <svg class="person-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0a7 7 0 0114 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <input id="personSearchInput" class="person-search-input slim-search-input" type="text" placeholder="Search by name or tag" value="${escapeAttr(personSearchTerm)}" />
      </div>
    </div>
    <div id="personSearchResultsShell" class="person-search-results-shell is-empty floating-search-results">
      <div id="personList" class="person-list person-search-results"></div>
    </div>
  `;
}


function renderPersonSidebar() {
  const sidebar = document.getElementById('person-sidebar');
  if (!sidebar) {
    console.error('person-sidebar not found in HTML');
    return;
  }

  sidebar.innerHTML = `
    <div class="person-sidebar-shell">
      <div class="person-sidebar-top">
        <div class="person-sidebar-title-wrap">
          <div class="person-sidebar-title">People</div>
        </div>
        <button id="personSidebarToggle" class="person-sidebar-toggle" type="button" aria-expanded="true" aria-label="Hide people panel">Hide</button>
      </div>

      <div id="sidebarCurrentPerson" class="sidebar-current-person is-empty"></div>

      <div class="person-shelf">
        <div class="person-tabs">
          <button class="person-tab ${activeSidebarTab === 'people' ? 'active' : ''}" data-tab="people" type="button">People</button>
          <button class="person-tab ${activeSidebarTab === 'history' ? 'active' : ''}" data-tab="history" type="button">Viewed</button>
        </div>
        <div class="person-shelf-meta" id="sidebarShelfMeta"></div>
        <div id="sidebarShelfList" class="person-shelf-list"></div>
      </div>

      <div class="person-shelf-controls bottom-controls">
        <button id="sidebarShelfPrev" class="shelf-nav compact" type="button" aria-label="Previous page">‹</button>
        <button id="sidebarShelfNext" class="shelf-nav compact" type="button" aria-label="Next page">›</button>
      </div>
    </div>
  `;

  bindSidebarEvents();
  rerenderSidebar();
  setSidebarCollapsed(window.innerWidth <= 900);
}


