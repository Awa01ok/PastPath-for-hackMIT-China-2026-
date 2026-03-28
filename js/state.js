/**
 * state.js
 * Centralized app state for the PastPath prototype.
 *
 * Older files historically relied on many globals. To keep the current demo stable
 * while making the codebase more maintainable, we expose the shared state through a
 * single appState object and proxy the legacy global names onto it.
 */
(function() {
  const appState = {
    // Sidebar / person selection state
    peopleIndex: [],
    currentPersonId: null,
    personSearchTerm: '',
    activeSidebarTab: 'people',
    sidebarTabPage: { history: 0, people: 0 },

    // Scroll-snap state
    isSnapScrolling: false,
    currentStepIndex: 0,
    wheelCooldown: false,
    snapModeEnabled: true,
    boundaryLockDirection: null,
    boundaryLockTimer: null,

    // Story map state
    storyMap: null,
    insetMapInstance: null,
    storyMarker: null,
    insetMarker: null,
    storyScroller: null,
    resizeHandlerAttached: false,
    lastChapterIndex: 0,
    storyHiddenManually: false,
    lastRealChapterIndex: 0,
    overviewReturnChapterIndex: null,
    wasOverviewActive: false
  };

  window.appState = appState;

  const legacyGlobals = [
    'peopleIndex', 'currentPersonId', 'personSearchTerm', 'activeSidebarTab', 'sidebarTabPage',
    'isSnapScrolling', 'currentStepIndex', 'wheelCooldown', 'snapModeEnabled',
    'boundaryLockDirection', 'boundaryLockTimer',
    'storyMap', 'insetMapInstance', 'storyMarker', 'insetMarker', 'storyScroller',
    'resizeHandlerAttached', 'lastChapterIndex',
    'storyHiddenManually',
    'lastRealChapterIndex', 'overviewReturnChapterIndex', 'wasOverviewActive'
  ];

  legacyGlobals.forEach((key) => {
    Object.defineProperty(window, key, {
      configurable: true,
      enumerable: false,
      get() {
        return appState[key];
      },
      set(value) {
        appState[key] = value;
      }
    });
  });
})();
