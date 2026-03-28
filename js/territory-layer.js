(function () {
  const state = {
    territoriesByKey: new Map(),
    timelineByKey: new Map(),
    timelineByYear: new Map(),
    geojsonCache: new Map(),
    catalogsLoaded: false,
    loadingPromise: null,
    currentTerritoryKey: null,
    pendingRequest: null,
    visible: true,
  };

  const SOURCE_ID = 'pastpath-territory-source';
  const FILL_LAYER_ID = 'pastpath-territory-fill';
  const LINE_LAYER_ID = 'pastpath-territory-line';

  async function ensureCatalogsLoaded() {
    if (state.catalogsLoaded) return true;
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = Promise.all([
      apiGet('/api/territories'),
      apiGet('/api/timeline')
    ]).then(([territoryPayload, timelinePayload]) => {
      state.territoriesByKey = new Map();
      (territoryPayload.items || []).forEach((item) => {
        state.territoriesByKey.set(item.territoryKey, item);
      });

      state.timelineByKey = new Map();
      state.timelineByYear = new Map();
      (timelinePayload.items || []).forEach((item) => {
        state.timelineByKey.set(item.timelineKey, item);
        if (Number.isFinite(Number(item.year)) && !state.timelineByYear.has(Number(item.year))) {
          state.timelineByYear.set(Number(item.year), item);
        }
      });
      state.catalogsLoaded = true;
      return true;
    }).catch((error) => {
      console.error('Failed to load territory catalogs', error);
      return false;
    }).finally(() => {
      state.loadingPromise = null;
    });

    return state.loadingPromise;
  }

  function getTimelineItemByYear(year) {
    const safeYear = Number(year);
    if (!Number.isFinite(safeYear)) return null;
    if (state.timelineByYear.has(safeYear)) return state.timelineByYear.get(safeYear);

    const items = Array.from(state.timelineByYear.values()).sort((a, b) => Number(a.year) - Number(b.year));
    let fallback = items[0] || null;
    items.forEach((item) => {
      if (Number(item.year) <= safeYear) fallback = item;
    });
    return fallback;
  }

  function resolveTerritoryKey({ territoryKey = null, timelineKey = null, year = null } = {}) {
    if (territoryKey && state.territoriesByKey.has(territoryKey)) return territoryKey;
    if (timelineKey && state.timelineByKey.has(timelineKey)) {
      return state.timelineByKey.get(timelineKey).territoryKey || null;
    }
    const timelineItem = getTimelineItemByYear(year);
    return timelineItem?.territoryKey || null;
  }

  async function fetchGeojson(territory) {
    if (!territory?.geojsonFile) return null;
    if (state.geojsonCache.has(territory.geojsonFile)) {
      return state.geojsonCache.get(territory.geojsonFile);
    }
    const response = await fetch(territory.geojsonFile);
    if (!response.ok) {
      throw new Error(`Failed to load territory GeoJSON: ${response.status} ${response.statusText}`);
    }
    const geojson = await response.json();
    state.geojsonCache.set(territory.geojsonFile, geojson);
    return geojson;
  }

  function getBeforeLayerId(map) {
    const preferred = 'story-route-past-line';
    try {
      return map.getLayer(preferred) ? preferred : undefined;
    } catch (error) {
      return undefined;
    }
  }

  function ensureLayers(map, territory, geojson) {
    const beforeLayerId = getBeforeLayerId(map);
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });
    }

    if (!map.getLayer(FILL_LAYER_ID)) {
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': territory.styleFill || '#8B7D6B',
          'fill-opacity': Number.isFinite(Number(territory.styleOpacity)) ? Number(territory.styleOpacity) : 0.22,
        },
      }, beforeLayerId);
    }

    if (!map.getLayer(LINE_LAYER_ID)) {
      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': territory.lineColor || '#5F5648',
          'line-width': Number.isFinite(Number(territory.lineWidth)) ? Number(territory.lineWidth) : 1,
          'line-opacity': 0.85,
        },
      }, beforeLayerId);
    }
  }

  async function renderTerritory(territoryKey) {
    if (!storyMap) {
      state.pendingRequest = { territoryKey };
      return false;
    }

    const territory = state.territoriesByKey.get(territoryKey);
    if (!territory) return false;

    const doRender = async () => {
      try {
        const geojson = await fetchGeojson(territory);
        if (!geojson || !storyMap) return false;
        ensureLayers(storyMap, territory, geojson);
        const source = storyMap.getSource(SOURCE_ID);
        if (source) source.setData(geojson);
        if (storyMap.getLayer(FILL_LAYER_ID)) {
          storyMap.setPaintProperty(FILL_LAYER_ID, 'fill-color', territory.styleFill || '#8B7D6B');
          storyMap.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', Number.isFinite(Number(territory.styleOpacity)) ? Number(territory.styleOpacity) : 0.22);
          storyMap.setLayoutProperty(FILL_LAYER_ID, 'visibility', state.visible ? 'visible' : 'none');
        }
        if (storyMap.getLayer(LINE_LAYER_ID)) {
          storyMap.setPaintProperty(LINE_LAYER_ID, 'line-color', territory.lineColor || '#5F5648');
          storyMap.setPaintProperty(LINE_LAYER_ID, 'line-width', Number.isFinite(Number(territory.lineWidth)) ? Number(territory.lineWidth) : 1);
          storyMap.setLayoutProperty(LINE_LAYER_ID, 'visibility', state.visible ? 'visible' : 'none');
        }
        state.currentTerritoryKey = territoryKey;
        state.pendingRequest = null;
        return true;
      } catch (error) {
        console.error('Failed to render territory', error);
        return false;
      }
    };

    if (storyMap.isStyleLoaded && storyMap.isStyleLoaded()) {
      return doRender();
    }
    storyMap.once('load', doRender);
    state.pendingRequest = { territoryKey };
    return true;
  }


  function applyVisibility() {
    if (!storyMap) return false;
    const visibility = state.visible ? 'visible' : 'none';
    if (storyMap.getLayer(FILL_LAYER_ID)) {
      storyMap.setLayoutProperty(FILL_LAYER_ID, 'visibility', visibility);
    }
    if (storyMap.getLayer(LINE_LAYER_ID)) {
      storyMap.setLayoutProperty(LINE_LAYER_ID, 'visibility', visibility);
    }
    return true;
  }

  function syncTerritoryToggleButton() {
    const btn = document.getElementById('territoryLayerToggle');
    if (!btn) return;
    btn.textContent = state.visible ? 'Hide map layer' : 'Show map layer';
    btn.setAttribute('aria-pressed', String(state.visible));
    btn.classList.toggle('active', state.visible);
  }

  window.showTerritoryByKey = async function showTerritoryByKey(territoryKey) {
    const ok = await ensureCatalogsLoaded();
    if (!ok || !territoryKey) return false;
    if (state.currentTerritoryKey === territoryKey && storyMap?.getLayer(FILL_LAYER_ID)) return true;
    return renderTerritory(territoryKey);
  };

  window.showTerritoryForTime = async function showTerritoryForTime({ territoryKey = null, timelineKey = null, year = null } = {}) {
    const ok = await ensureCatalogsLoaded();
    if (!ok) return false;
    const resolvedKey = resolveTerritoryKey({ territoryKey, timelineKey, year });
    if (!resolvedKey) return false;
    return renderTerritory(resolvedKey);
  };

  window.hideTerritoryLayer = function hideTerritoryLayer() {
    state.visible = false;
    syncTerritoryToggleButton();
    return applyVisibility();
  };

  window.setTerritoryLayerVisible = function setTerritoryLayerVisible(visible) {
    state.visible = !!visible;
    syncTerritoryToggleButton();
    applyVisibility();
    if (state.visible) {
      if (state.currentTerritoryKey) return renderTerritory(state.currentTerritoryKey);
      return window.refreshTerritoryForCurrentContext();
    }
    return true;
  };

  window.toggleTerritoryLayer = function toggleTerritoryLayer() {
    return window.setTerritoryLayerVisible(!state.visible);
  };

  window.refreshTerritoryForCurrentContext = async function refreshTerritoryForCurrentContext() {
    const activeChapter = window.config?.chapters?.[window.currentStepIndex] || null;
    const timelineYear = window.timelineState?.selectedYear ?? window.timelineState?.currentYear ?? 1930;
    if (activeChapter) {
      return window.showTerritoryForTime({
        territoryKey: activeChapter.territoryKey || null,
        timelineKey: activeChapter.timelineKey || null,
        year: activeChapter.year || timelineYear,
      });
    }
    return window.showTerritoryForTime({ year: timelineYear || 1930 });
  };

  function isPointInsideElement(element, clientX, clientY) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function bindGlobalTerritoryFallback() {
    if (document.documentElement.dataset.territoryFallbackBound === '1') return;
    document.documentElement.dataset.territoryFallbackBound = '1';

    const fallbackToggle = (event) => {
      const btn = document.getElementById('territoryLayerToggle');
      if (!btn || !document.body || document.body.classList.contains('landing-mode')) return;
      const directHit = event.target && (event.target === btn || event.target.closest?.('#territoryLayerToggle'));
      const hitByBounds = isPointInsideElement(btn, event.clientX, event.clientY);
      if (!directHit && !hitByBounds) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      window.toggleTerritoryLayer();
    };

    document.addEventListener('click', fallbackToggle, true);
    document.addEventListener('pointerup', fallbackToggle, true);
  }

  window.initTerritoryLayer = function initTerritoryLayer() {
    ensureCatalogsLoaded();
    syncTerritoryToggleButton();
    const dock = document.getElementById('territoryLayerDock');
    if (dock) {
      dock.style.pointerEvents = 'auto';
      dock.style.zIndex = '980';
      dock.style.visibility = 'visible';
      dock.style.opacity = '1';
      dock.style.position = dock.style.position || 'fixed';
    }
    const btn = document.getElementById('territoryLayerToggle');
    if (btn) {
      btn.style.pointerEvents = 'auto';
      btn.style.zIndex = '981';
      btn.style.position = 'relative';
      if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        const handler = (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          window.toggleTerritoryLayer();
        };
        btn.addEventListener('click', handler, true);
        btn.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          event.stopImmediatePropagation?.();
        }, true);
      }
    }
    bindGlobalTerritoryFallback();
  };
})();
