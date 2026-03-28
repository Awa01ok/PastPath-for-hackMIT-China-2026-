/**
 * story-core.js
 * Main story-map orchestration.
 *
 * Responsibilities kept here:
 * 1) map initialization and base layers
 * 2) route overview transitions
 * 3) story card rendering and chapter-driven map updates
 * 4) point popup / map-click handling
 *
 * Shared mutable values are stored in window.appState via the global proxies
 * defined in state.js.
 */

// Reset shared story state whenever this file is evaluated.
storyMap = null;
insetMapInstance = null;
storyMarker = null;
insetMarker = null;
storyScroller = null;
resizeHandlerAttached = false;
activeRouteAnimationFrame = null;
lastChapterIndex = 0;
manualOverviewActive = false;
storyHiddenManually = false;
storyHiddenByRoute = false;
lastRealChapterIndex = 0;
overviewReturnChapterIndex = null;
wasOverviewActive = false;
window.isSwitchingPerson = false;
window.pendingInitialChapterId = null;
window.storyScroller = null;

function applyStoryVisibility() {
        document.body.classList.toggle('story-hidden', !!(storyHiddenManually || storyHiddenByRoute));
        const toggle = document.getElementById('storyVisibilityToggle');
        if (toggle) {
            const hidden = !!(storyHiddenManually || storyHiddenByRoute);
            toggle.classList.toggle('active', hidden);
            toggle.setAttribute('aria-pressed', String(hidden));
            toggle.textContent = hidden ? 'Show events' : 'Hide events';
        }
    }

    window.toggleStoryVisibility = function(forceHidden = null) {
        storyHiddenManually = forceHidden === null ? !storyHiddenManually : !!forceHidden;
        applyStoryVisibility();
        return !!(storyHiddenManually || storyHiddenByRoute);
    };

    function setStoryHiddenByRoute(hidden) {
        storyHiddenByRoute = !!hidden;
        document.body.classList.toggle('route-overview-active', !!hidden);
        if (hidden) {
            storyHiddenManually = false;
        }
        applyStoryVisibility();
    }
    function setRouteToggleActive(active) {
        const routeToggleBtn = document.getElementById('sidebarRouteToggle');
        if (routeToggleBtn) {
            routeToggleBtn.classList.toggle('active', !!active);
            routeToggleBtn.setAttribute('aria-pressed', String(!!active));
        }
    }

    function clearInsetMap() {
        if (insetMapInstance) {
            insetMapInstance.remove();
            insetMapInstance = null;
        }
        insetMarker = null;
        const oldInset = document.getElementById('inset-map');
        if (oldInset) oldInset.remove();
    }

    window.showIdleMap = function () {
        manualOverviewActive = false;
        wasOverviewActive = false;
        overviewReturnChapterIndex = null;
        lastRealChapterIndex = 0;
        setRouteToggleActive(false);
        setStoryHiddenByRoute(false);
        document.body.classList.remove('route-overview-active');

        const storyEl = document.getElementById('story');
        if (storyEl) {
            storyEl.classList.remove('overview-mode');
            storyEl.innerHTML = '';
        }

        if (storyScroller && typeof storyScroller.destroy === 'function') {
            storyScroller.destroy();
            storyScroller = null;
            window.storyScroller = null;
        }

        clearInsetMap();
        storyMarker = null;

        if (storyMap) {
            storyMap.remove();
            storyMap = null;
        }

        storyMap = new maplibregl.Map({
            container: 'map',
            style: '/assets/map-styles/pastpath-archive-clean.json',
            center: [60, 40],
            zoom: 2.8,
            pitch: 0,
            bearing: 0,
            interactive: true
        });

        storyMap.on('load', function () {
            if (storyMap.scrollZoom) storyMap.scrollZoom.enable();
            if (storyMap.boxZoom) storyMap.boxZoom.disable();
            if (storyMap.keyboard) storyMap.keyboard.disable();
            if (storyMap.dragRotate) storyMap.dragRotate.disable();
            if (storyMap.touchZoomRotate) storyMap.touchZoomRotate.disableRotation();
            if (typeof window.refreshTerritoryForCurrentContext === 'function') {
                window.refreshTerritoryForCurrentContext();
            }
        });

        if (typeof window.refreshTimeline === 'function') {
            window.refreshTimeline();
        }

        return true;
    };

    window.jumpToStoryStep = jumpToStoryStep;

    function jumpToStoryStep(stepIndex) {
        const chapter = config?.chapters?.[stepIndex];
        const target = chapter?.id ? document.getElementById(chapter.id) : null;
        if (!target) return false;

        const featuresEl = document.getElementById('features');
        const previousSnap = featuresEl ? featuresEl.style.scrollSnapType : '';
        const previousSnapMode = typeof snapModeEnabled !== 'undefined' ? snapModeEnabled : true;
        const targetTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - (window.innerHeight * 0.22));

        if (featuresEl) {
            featuresEl.style.scrollSnapType = 'none';
        }
        if (typeof snapModeEnabled !== 'undefined') {
            snapModeEnabled = false;
        }

        const performJump = () => {
            window.scrollTo({ top: targetTop, behavior: 'auto' });
            target.scrollIntoView({ behavior: 'auto', block: 'center' });
        };

        performJump();
        requestAnimationFrame(() => {
            performJump();
            setTimeout(() => {
                performJump();
                if (featuresEl) {
                    featuresEl.style.scrollSnapType = previousSnap || '';
                }
                if (typeof snapModeEnabled !== 'undefined') {
                    snapModeEnabled = previousSnapMode;
                }
            }, 90);
        });
        return true;
    }

    window.isFullRouteOverviewActive = function () {
        return false;
    };

    // Leave Route overview and hand control back to the normal chapter timeline.
    // We write a one-shot resume anchor so the next wheel snap continues from the
    // chapter that Route exited to, instead of drifting to an overview card or stale index.
    

    function initStory() {
        var layerTypes = {
            'fill': ['fill-opacity'],
            'line': ['line-opacity'],
            'circle': ['circle-opacity', 'circle-stroke-opacity'],
            'symbol': ['icon-opacity', 'text-opacity'],
            'raster': ['raster-opacity'],
            'fill-extrusion': ['fill-extrusion-opacity'],
            'heatmap': ['heatmap-opacity'],
            'hillshade': ['hillshade-exaggeration']
        };

        var alignments = {
            'left': 'lefty',
            'center': 'centered',
            'right': 'righty',
            'full': 'fully'
        };

        function emptyFeatureCollection() {
            return {
                type: 'FeatureCollection',
                features: []
            };
        }

        function createUpwardArcPoints(start, end, steps = 60, bend = 0.16) {
            const [x1, y1] = start;
            const [x2, y2] = end;

            const midX = (x1 + x2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            // Force the curve to arch upward (northward on the map)
            const controlX = midX + dx * 0.12;
            const controlY = Math.max(y1, y2) + distance * bend;

            const points = [];

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;

                const x =
                    (1 - t) * (1 - t) * x1 +
                    2 * (1 - t) * t * controlX +
                    t * t * x2;

                const y =
                    (1 - t) * (1 - t) * y1 +
                    2 * (1 - t) * t * controlY +
                    t * t * y2;

                points.push([x, y]);
            }

                return points;
        }

        function buildPastRouteGeoJSON(chapters, currentIndex) {
            const features = [];

            // Blue = already completed segments
            for (let i = 0; i < currentIndex - 1; i++) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: createUpwardArcPoints(
                            chapters[i].location.center,
                            chapters[i + 1].location.center
                        )
                    },
                    properties: {
                        segmentIndex: i
                    }
                });
            }

            return {
                type: 'FeatureCollection',
                features
            };
        }

        function buildActiveRouteGeoJSON(chapters, currentIndex, visibleRatio = 1) {
            if (currentIndex <= 0 || currentIndex >= chapters.length) {
                return emptyFeatureCollection();
            }

            const fullCoords = createUpwardArcPoints(
                chapters[currentIndex - 1].location.center,
                chapters[currentIndex].location.center
            );

            const count = Math.max(2, Math.floor(fullCoords.length * visibleRatio));
            const partialCoords = fullCoords.slice(0, count);

            return {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: partialCoords
                        },
                        properties: {}
                    }
                ]
            };
        }

        function buildVisitedPointsGeoJSON(chapters, currentIndex) {
            const features = [];

            // Blue = already visited nodes
            for (let i = 0; i < currentIndex; i++) {
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: chapters[i].location.center
                    },
                    properties: {
                        pointIndex: i,
                        state: 'visited'
                    }
                });
            }

            return {
                type: 'FeatureCollection',
                features
            };
        }

        function buildCurrentPointGeoJSON(chapters, currentIndex) {
            if (currentIndex < 0 || currentIndex >= chapters.length) {
                return emptyFeatureCollection();
            }

            return {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                    coordinates: chapters[currentIndex].location.center
                        },
                        properties: {
                            pointIndex: currentIndex,
                            state: 'current'
                        }
                    }
                ]
            };
        }

        function animateActiveRoute(chapters, currentIndex) {
            const activeSource = storyMap.getSource('story-route-active');
            if (!activeSource) return;

            if (activeRouteAnimationFrame) {
                cancelAnimationFrame(activeRouteAnimationFrame);
                activeRouteAnimationFrame = null;
            }

            if (currentIndex <= 0) {
                activeSource.setData(emptyFeatureCollection());
                return;
            }

            const duration = Math.round(getTransitionDuration(chapters, currentIndex) * 0.55);
            const startTime = performance.now();

            function frame(now) {
                const t = Math.min((now - startTime) / duration, 1);
                activeSource.setData(
                    buildActiveRouteGeoJSON(chapters, currentIndex, t)
                );

                if (t < 1) {
                    activeRouteAnimationFrame = requestAnimationFrame(frame);
                } else {
                    activeRouteAnimationFrame = null;
                }
            }

            activeRouteAnimationFrame = requestAnimationFrame(frame);
        }

        function showActiveRouteImmediately(chapters, currentIndex) {
            const activeSource = storyMap.getSource('story-route-active');
            if (!activeSource) return;

            if (activeRouteAnimationFrame) {
                cancelAnimationFrame(activeRouteAnimationFrame);
                activeRouteAnimationFrame = null;
            }

            activeSource.setData(
                buildActiveRouteGeoJSON(chapters, currentIndex, 1)
            );
        }

        if (!window.config || !window.config.chapters || window.config.chapters.length === 0) {
            console.error('config is missing or has no chapters');
            return;
        }

        lastChapterIndex = 0;
        lastRealChapterIndex = 0;
        overviewReturnChapterIndex = null;
        wasOverviewActive = false;

        if (storyScroller && typeof storyScroller.destroy === 'function') {
            storyScroller.destroy();
        }

        if (storyMap) {
            storyMap.remove();
            storyMap = null;
        }

        if (insetMapInstance) {
            insetMapInstance.remove();
            insetMapInstance = null;
        }

        storyMarker = null;
        insetMarker = null;

        var oldInset = document.getElementById('inset-map');
        if (oldInset) {
            oldInset.remove();
        }

        var story = document.getElementById('story');
        story.innerHTML = '';

        function getLayerPaintType(layer) {
            var mapLayer = storyMap.getLayer(layer);
            if (!mapLayer) return null;
            var layerType = mapLayer.type;
            return layerTypes[layerType];
        }

        function setLayerOpacity(layer) {
            var paintProps = getLayerPaintType(layer.layer);
            if (!paintProps) return;

            paintProps.forEach(function (prop) {
                var options = {};
                if (layer.duration) {
                    var transitionProp = prop + "-transition";
                    options = { "duration": layer.duration };
                    storyMap.setPaintProperty(layer.layer, transitionProp, options);
                }
                storyMap.setPaintProperty(layer.layer, prop, layer.opacity, options);
            });
        }

        var features = document.createElement('div');
        features.setAttribute('id', 'features');

        var header = document.createElement('div');

        if (config.title) {
            var titleText = document.createElement('h1');
            titleText.innerText = config.title;
            header.appendChild(titleText);
        }

        if (config.subtitle) {
            var subtitleText = document.createElement('h2');
            subtitleText.innerText = config.subtitle;
            header.appendChild(subtitleText);
        }

        if (config.byline) {
            var bylineText = document.createElement('p');
            bylineText.innerText = config.byline;
            header.appendChild(bylineText);
        }

        if (header.innerText.length > 0) {
            header.classList.add(config.theme);
            header.setAttribute('id', 'header');
            story.appendChild(header);
        }

        config.chapters.forEach((record, idx) => {
            var container = document.createElement('div');
            var chapter = document.createElement('div');

            if (record.isOverview) {
                container.classList.add('overview-step');
                chapter.classList.add('overview-card');
            }

            if (record.title) {
                var title = document.createElement('h3');
                title.innerText = record.title;
                chapter.appendChild(title);
            }

            if (record.image) {
                var image = new Image();
                image.src = record.image;
                image.alt = record.title || '';
                image.classList.add('event-image-linkable');

                if (record.wikiUrl) {
                    var imageLink = document.createElement('a');
                    imageLink.href = record.wikiUrl;
                    imageLink.target = '_blank';
                    imageLink.rel = 'noopener noreferrer';
                    imageLink.title = 'Open Wikipedia page';
                    imageLink.appendChild(image);
                    chapter.appendChild(imageLink);
                } else {
                    chapter.appendChild(image);
                }
            }

            if (record.description) {
                var chapterStory = document.createElement('p');
                chapterStory.innerHTML = record.description;
                chapter.appendChild(chapterStory);
            }

            container.setAttribute('id', record.id);
            container.classList.add('step');

            if (idx === 0) {
                container.classList.add('active');
            }

            chapter.classList.add(config.theme);
            container.appendChild(chapter);
            container.classList.add(alignments[record.alignment] || 'centered');

            if (record.hidden) {
                container.classList.add('hidden');
            }

            features.appendChild(container);
        });

        story.appendChild(features);

        var footer = document.createElement('div');

        if (config.footer) {
            var footerText = document.createElement('p');
            footerText.innerHTML = config.footer;
            footer.appendChild(footerText);
        }

        if (footer.innerText.length > 0) {
            footer.classList.add(config.theme);
            footer.setAttribute('id', 'footer');
            story.appendChild(footer);
        }

        storyMap = new maplibregl.Map({
            container: 'map',
            style: config.style,
            center: config.chapters[0].location.center,
            zoom: config.chapters[0].location.zoom,
            bearing: config.chapters[0].location.bearing,
            pitch: config.chapters[0].location.pitch,
            interactive: true
        });

        if (storyMap.scrollZoom) storyMap.scrollZoom.disable();
        if (storyMap.boxZoom) storyMap.boxZoom.disable();
        if (storyMap.keyboard) storyMap.keyboard.disable();
        if (storyMap.dragRotate) storyMap.dragRotate.disable();
        if (storyMap.touchZoomRotate) storyMap.touchZoomRotate.disableRotation();

        if (config.inset) {
            var insetContainer = document.createElement('div');
            insetContainer.id = 'inset-map';
            insetContainer.classList.add(config.insetPosition || 'bottom-right');
            document.body.appendChild(insetContainer);

            insetMapInstance = new maplibregl.Map({
                container: 'inset-map',
                style: config.insetStyle || 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                center: config.chapters[0].location.center,
                zoom: config.insetZoom || 1,
                interactive: false,
                attributionControl: false
            });

            var markerEl = document.createElement('div');
            markerEl.className = 'inset-marker';

            if (config.insetOptions && config.insetOptions.markerColor) {
                markerEl.style.backgroundColor = config.insetOptions.markerColor;
            }

            insetMarker = new maplibregl.Marker({ element: markerEl })
                .setLngLat(config.chapters[0].location.center)
                .addTo(insetMapInstance);
        }

        if (config.showMarkers) {
            storyMarker = new maplibregl.Marker({ color: config.markerColor });
            storyMarker.setLngLat(config.chapters[0].location.center).addTo(storyMap);
        }

        storyScroller = scrollama();
        window.storyScroller = storyScroller;

        storyMap.on("load", function () {
            storyMap.addSource('story-route-past', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-past-line',
                type: 'line',
                source: 'story-route-past',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#4ea1ff',
                    'line-width': 3,
                    'line-opacity': 0.6
                }
            });

            storyMap.addSource('story-route-active', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-active-line',
                type: 'line',
                source: 'story-route-active',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ffd166',
                    'line-width': 4,
                    'line-opacity': 0.95
                }
            });

            storyMap.addSource('story-route-visited-points', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-visited-points-layer',
                type: 'circle',
                source: 'story-route-visited-points',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#4ea1ff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });

            storyMap.addSource('story-route-current-point', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-current-point-layer',
                type: 'circle',
                source: 'story-route-current-point',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#ffd166',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#5c4400'
                }
            });

            storyMap.addSource('story-route-jump-points', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-jump-points-layer',
                type: 'circle',
                source: 'story-route-jump-points',
                paint: {
                    'circle-radius': 14,
                    'circle-color': '#4ea1ff',
                    'circle-opacity': 0,
                    'circle-stroke-width': 0,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-opacity': 0
                }
            });

            storyMap.addSource('story-route-click-points', {
                type: 'geojson',
                data: buildAllPointsGeoJSON(config.chapters)
            });

            storyMap.addLayer({
                id: 'story-route-click-points-layer',
                type: 'circle',
                source: 'story-route-click-points',
                paint: {
                    'circle-radius': 20,
                    'circle-color': '#ffffff',
                    'circle-opacity': 0.01,
                    'circle-stroke-width': 0,
                    'circle-stroke-opacity': 0
                }
            });

            storyScroller
                .setup({
                    step: '.step',
                    offset: 0.6,
                    progress: false
                })
                .onStepEnter(response => {
                    var currentChapterIndex = config.chapters.findIndex(chap => chap.id === response.element.id);
                    var currentChapter = config.chapters[currentChapterIndex];
                    if (!currentChapter) return;

                    const pendingInitialChapterId = window.pendingInitialChapterId;
                    if (window.isSwitchingPerson && pendingInitialChapterId && currentChapter.id !== pendingInitialChapterId) {
                        return;
                    }

                    response.element.classList.add('active');
                    currentStepIndex = currentChapterIndex;
                    if (typeof window.setTimelineActiveChapter === 'function') {
                        window.setTimelineActiveChapter(currentChapterIndex, currentChapter);
                    }

                    const storyEl = document.getElementById('story');
                    const isInitialSwitchChapter = Boolean(window.isSwitchingPerson && pendingInitialChapterId && currentChapter.id === pendingInitialChapterId);
                    const isReturningFromOverview = wasOverviewActive && !currentChapter.isOverview;
                    const isBackward = currentChapterIndex < lastChapterIndex;
                    const transitionDuration = isInitialSwitchChapter ? 1100 : getTransitionDuration(config.chapters, currentChapterIndex);

                    if (currentChapter.isOverview) {
                        storyEl.classList.add('overview-mode');
                        wasOverviewActive = true;
                        overviewReturnChapterIndex = lastRealChapterIndex;

                        const overviewRouteSource = storyMap.getSource('story-route-overview');
                        if (overviewRouteSource) {
                            overviewRouteSource.setData(
                                buildAllRouteGeoJSON(config.chapters)
                            );
                        }

                        const overviewPointsSource = storyMap.getSource('story-route-overview-points');
                        if (overviewPointsSource) {
                            overviewPointsSource.setData(
                                buildAllPointsGeoJSON(config.chapters)
                            );
                        }

                        const pastRouteSource = storyMap.getSource('story-route-past');
                        if (pastRouteSource) {
                            pastRouteSource.setData(emptyFeatureCollection());
                        }

                        const activeRouteSource = storyMap.getSource('story-route-active');
                        if (activeRouteSource) {
                            activeRouteSource.setData(emptyFeatureCollection());
                        }

                        const visitedPointsSource = storyMap.getSource('story-route-visited-points');
                        if (visitedPointsSource) {
                            visitedPointsSource.setData(emptyFeatureCollection());
                        }

                        const currentPointSource = storyMap.getSource('story-route-current-point');
                        if (currentPointSource) {
                            currentPointSource.setData(emptyFeatureCollection());
                        }

                        manualOverviewActive = false;
                        setRouteToggleActive(false);
                        fitMapToAllChapters(config.chapters);
                        lastChapterIndex = currentChapterIndex;
                        return;
                    }

                    storyEl.classList.remove('overview-mode');

                    const overviewRouteSource = storyMap.getSource('story-route-overview');
                    if (overviewRouteSource) {
                        overviewRouteSource.setData(emptyFeatureCollection());
                    }

                    const overviewPointsSource = storyMap.getSource('story-route-overview-points');
                    if (overviewPointsSource) {
                        overviewPointsSource.setData(emptyFeatureCollection());
                    }

                    storyMap[currentChapter.mapAnimation || 'flyTo']({
                        ...currentChapter.location,
                        duration: transitionDuration
                    });

                    const shouldRestoreOverviewReturnSegment = isReturningFromOverview
                        && overviewReturnChapterIndex !== null
                        && currentChapterIndex === overviewReturnChapterIndex;

                    const pastRouteSource = storyMap.getSource('story-route-past');
                    if (pastRouteSource) {
                        pastRouteSource.setData(
                            buildPastRouteGeoJSON(config.chapters, currentChapterIndex)
                        );
                    }

                    const visitedPointsSource = storyMap.getSource('story-route-visited-points');
                    if (visitedPointsSource) {
                        visitedPointsSource.setData(
                            buildVisitedPointsGeoJSON(config.chapters, currentChapterIndex)
                        );
                    }

                    const currentPointSource = storyMap.getSource('story-route-current-point');
                    if (currentPointSource) {
                        currentPointSource.setData(
                            buildCurrentPointGeoJSON(config.chapters, currentChapterIndex)
                        );
                    }
                    const jumpPointsSource = storyMap.getSource('story-route-jump-points');
                    if (jumpPointsSource) {
                        jumpPointsSource.setData(emptyFeatureCollection());
                    }

                    if (isInitialSwitchChapter || shouldRestoreOverviewReturnSegment || isBackward) {
                        showActiveRouteImmediately(config.chapters, currentChapterIndex);
                    } else {
                        animateActiveRoute(config.chapters, currentChapterIndex);
                    }

                    wasOverviewActive = false;
                    overviewReturnChapterIndex = null;
                    lastChapterIndex = currentChapterIndex;
                    lastRealChapterIndex = currentChapterIndex;
                    if (isInitialSwitchChapter) {
                        window.pendingInitialChapterId = null;
                    }

                    if (config.showMarkers && storyMarker) {
                        storyMarker.setLngLat(currentChapter.location.center);
                    }

                    if (insetMapInstance && insetMarker) {
                        insetMapInstance.setCenter(currentChapter.location.center);
                        insetMarker.setLngLat(currentChapter.location.center);
                    }

                    if (currentChapter.onChapterEnter && currentChapter.onChapterEnter.length > 0) {
                        currentChapter.onChapterEnter.forEach(setLayerOpacity);
                    }

                    if (currentChapter.callback && typeof window[currentChapter.callback] === 'function') {
                        window[currentChapter.callback]();
                    }
                })
                .onStepExit(response => {
                    var exitingChapter = config.chapters.find(chap => chap.id === response.element.id);
                    if (!exitingChapter) return;

                    response.element.classList.remove('active');

                    if (exitingChapter.onChapterExit && exitingChapter.onChapterExit.length > 0) {
                        exitingChapter.onChapterExit.forEach(setLayerOpacity);
                    }
                });

            storyMap.addSource('story-route-overview', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-overview-line',
                type: 'line',
                source: 'story-route-overview',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#4ea1ff',
                    'line-width': 3,
                    'line-opacity': 0.75
                }
            });

            storyMap.addSource('story-route-overview-points', {
                type: 'geojson',
                data: emptyFeatureCollection()
            });

            storyMap.addLayer({
                id: 'story-route-overview-points-layer',
                type: 'circle',
                source: 'story-route-overview-points',
                paint: {
                    'circle-radius': 6,
                    'circle-color': '#4ea1ff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                }
            });

            if (typeof window.refreshTerritoryForCurrentContext === 'function') {
                window.refreshTerritoryForCurrentContext();
            }

            let pointChoicePopup = null;
            let mapPointerDownPoint = null;
            let mapPointerDragged = false;
            let suppressNextMapClick = false;

            function closePointChoicePopup() {
                if (pointChoicePopup) {
                    pointChoicePopup.remove();
                    pointChoicePopup = null;
                }
            }

            function getInteractivePointLayers() {
                return ['story-route-click-points-layer'];
            }

            function getCoordinateBucketKey(center) {
                if (!Array.isArray(center) || center.length < 2) return '';
                return `${Number(center[0]).toFixed(5)},${Number(center[1]).toFixed(5)}`;
            }

            function expandPointIndexesWithOverlaps(pointIndexes) {
                const seen = new Set();
                const expanded = [];
                (pointIndexes || []).forEach(pointIndex => {
                    const chapter = config?.chapters?.[pointIndex];
                    if (!chapter || chapter.isOverview || !chapter.location || !Array.isArray(chapter.location.center)) return;
                    const bucketKey = getCoordinateBucketKey(chapter.location.center);
                    config.chapters.forEach((candidate, candidateIndex) => {
                        if (!candidate || candidate.isOverview || !candidate.location || !Array.isArray(candidate.location.center)) return;
                        if (getCoordinateBucketKey(candidate.location.center) !== bucketKey || seen.has(candidateIndex)) return;
                        seen.add(candidateIndex);
                        expanded.push(candidateIndex);
                    });
                });
                return expanded.sort((a, b) => a - b);
            }

            function getUniquePointIndexesFromFeatures(features) {
                const seen = new Set();
                const pointIndexes = [];
                (features || []).forEach(feature => {
                    const pointIndex = Number(feature?.properties?.pointIndex);
                    if (!Number.isFinite(pointIndex) || seen.has(pointIndex)) return;
                    seen.add(pointIndex);
                    pointIndexes.push(pointIndex);
                });
                return expandPointIndexesWithOverlaps(pointIndexes);
            }

            function getPointIndexesAtPoint(point, padding = 14) {
                if (!storyMap || !point) return [];
                const interactiveLayers = getInteractivePointLayers();
                const hitbox = [
                    [point.x - padding, point.y - padding],
                    [point.x + padding, point.y + padding]
                ];
                const features = storyMap.queryRenderedFeatures(hitbox, { layers: interactiveLayers });
                return getUniquePointIndexesFromFeatures(features);
            }


            function syncActiveStoryStep(stepIndex) {
                const steps = Array.from(document.querySelectorAll('#features .step'));
                steps.forEach((stepEl, index) => {
                    stepEl.classList.toggle('active', index === stepIndex);
                });
            }

            function applyChapterStateFromMapJump(stepIndex, fromRoute = false) {
                const chapter = config?.chapters?.[stepIndex];
                if (!chapter || chapter.isOverview) return false;

                const storyEl = document.getElementById('story');
                if (storyEl) storyEl.classList.remove('overview-mode');

                restoreTimelineState(stepIndex);
                syncActiveStoryStep(stepIndex);
                lastChapterIndex = stepIndex;
                lastRealChapterIndex = stepIndex;
                currentStepIndex = stepIndex;
                if (typeof window.timelineForceSyncToEvent === 'function') {
                    window.timelineForceSyncToEvent(stepIndex, chapter);
                } else if (typeof window.setTimelineActiveChapter === 'function') {
                    window.setTimelineActiveChapter(stepIndex, chapter);
                }

                if (storyMap && chapter.location) {
                    storyMap.easeTo({
                        ...chapter.location,
                        duration: fromRoute ? 1100 : 800,
                        essential: true
                    });
                }

                if (config.showMarkers && storyMarker) {
                    storyMarker.setLngLat(chapter.location.center);
                }

                if (insetMapInstance && insetMarker) {
                    insetMapInstance.setCenter(chapter.location.center);
                    insetMarker.setLngLat(chapter.location.center);
                }

                if (chapter.onChapterEnter && chapter.onChapterEnter.length > 0) {
                    chapter.onChapterEnter.forEach(setLayerOpacity);
                }

                if (chapter.callback && typeof window[chapter.callback] === 'function') {
                    window[chapter.callback]();
                }

                if (typeof window.showTerritoryForTime === 'function') {
                    window.showTerritoryForTime({
                        territoryKey: chapter.territoryKey || null,
                        timelineKey: chapter.timelineKey || null,
                        year: chapter.year || null
                    });
                }

                return true;
            }

            function formatPointChoiceLabel(chapter) {
                if (!chapter) return '';
                const rawDate = chapter?.date || chapter?.year || chapter?.time || chapter?.id || '';
                const dateText = String(rawDate).trim();
                return dateText ? `${dateText} · ${chapter.title}` : chapter.title;
            }

            function openPointChoicePopup(pointIndexes, lngLat, fromRoute = false) {
                closePointChoicePopup();
                if (!Array.isArray(pointIndexes) || !pointIndexes.length) return false;

                const rows = pointIndexes.map(pointIndex => {
                    const chapter = config.chapters[pointIndex];
                    if (!chapter) return '';
                    return `<button type="button" class="point-choice-item" data-point-index="${pointIndex}" data-from-route="${fromRoute ? '1' : '0'}">${formatPointChoiceLabel(chapter)}</button>`;
                }).join('');

                const container = document.createElement('div');
                container.className = 'point-choice-popup';
                container.innerHTML = `<div class="point-choice-title">Select destination</div><div class="point-choice-list">${rows}</div>`;

                container.addEventListener('click', (popupEvent) => {
                    const button = popupEvent.target.closest('[data-point-index]');
                    if (!button) return;
                    popupEvent.preventDefault();
                    popupEvent.stopPropagation();
                    const pointIndex = Number(button.getAttribute('data-point-index'));
                    const routeMode = button.getAttribute('data-from-route') === '1';
                    closePointChoicePopup();
                    jumpToMapPointEvent(pointIndex, routeMode);
                });

                pointChoicePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 16, className: 'point-choice-map-popup' })
                    .setLngLat(lngLat)
                    .setDOMContent(container)
                    .addTo(storyMap);

                return true;
            }

            function jumpToMapPointEvent(pointIndex, fromRoute = false) {
                if (!Number.isFinite(pointIndex)) return false;
                const targetChapter = config?.chapters?.[pointIndex];
                if (!targetChapter || targetChapter.isOverview) return false;

                storyHiddenManually = false;
                closePointChoicePopup();

                const storyEl = document.getElementById('story');
                if (storyEl) storyEl.classList.remove('overview-mode');

                manualOverviewActive = false;
                wasOverviewActive = false;
                overviewReturnChapterIndex = null;
                setRouteToggleActive(false);
                setStoryHiddenByRoute(false);
                lastRealChapterIndex = pointIndex;
                currentStepIndex = pointIndex;
                window.__lastRouteJumpChapterIndex = pointIndex;
                window.__lastRouteJumpAt = Date.now();
                window.__routeResumeChapterIndex = pointIndex;
                window.__routeResumePending = true;
                // Route point clicks also need to return to the regular snap flow.
                wheelCooldown = true;
                isSnapScrolling = true;
                boundaryLockDirection = null;
                snapModeEnabled = true;

                const targetStepEl = targetChapter.id ? document.getElementById(targetChapter.id) : null;
                if (targetStepEl) {
                    document.querySelectorAll('#features .step').forEach((stepEl, index) => {
                        stepEl.classList.toggle('active', index === pointIndex);
                    });
                }

                applyChapterStateFromMapJump(pointIndex, fromRoute);

                if (storyScroller && typeof storyScroller.resize === 'function') {
                    storyScroller.resize();
                }

                jumpToStoryStep(pointIndex);

                requestAnimationFrame(() => {
                    applyChapterStateFromMapJump(pointIndex, fromRoute);
                    jumpToStoryStep(pointIndex);
                    setTimeout(() => {
                        applyChapterStateFromMapJump(pointIndex, fromRoute);
                        jumpToStoryStep(pointIndex);
                        setTimeout(() => {
                            applyChapterStateFromMapJump(pointIndex, fromRoute);
                            wheelCooldown = false;
                            isSnapScrolling = false;
                        }, 80);
                    }, 120);
                });

                return true;
            }

            function handleMapPointSelection(event) {
                if (!storyMap || !config || !Array.isArray(config.chapters)) return;
                if (suppressNextMapClick) { suppressNextMapClick = false; return; }
                if (mapPointerDragged) return;

                if (!manualOverviewActive) {
                    closePointChoicePopup();
                    return;
                }

                const pointIndexes = getPointIndexesAtPoint(event.point);
                if (!pointIndexes.length) {
                    closePointChoicePopup();
                    return;
                }

                if (pointIndexes.length === 1) {
                    jumpToMapPointEvent(pointIndexes[0], true);
                    return;
                }

                openPointChoicePopup(pointIndexes, event.lngLat, true);
            }

            function updateMapPointCursor(event) {
                const pointIndexes = getPointIndexesAtPoint(event.point, 10);
                storyMap.getCanvas().style.cursor = pointIndexes.length ? 'pointer' : '';
            }

            function trackPointerDown(event) {
                mapPointerDownPoint = event?.point ? { x: event.point.x, y: event.point.y } : null;
                mapPointerDragged = false;
            }

            function trackPointerMove(event) {
                if (!mapPointerDownPoint || !event?.point) return;
                const dx = event.point.x - mapPointerDownPoint.x;
                const dy = event.point.y - mapPointerDownPoint.y;
                if ((dx * dx + dy * dy) > 25) {
                    mapPointerDragged = true;
                    closePointChoicePopup();
                }
            }

            function resetPointerTracking() {
                mapPointerDownPoint = null;
                requestAnimationFrame(() => {
                    mapPointerDragged = false;
                });
            }

            storyMap.on('mousedown', trackPointerDown);
            storyMap.on('dragstart', () => { mapPointerDragged = true; closePointChoicePopup(); });
            storyMap.on('mousemove', (event) => {
                trackPointerMove(event);
                updateMapPointCursor(event);
            });
            storyMap.on('mouseup', resetPointerTracking);
            storyMap.on('dragend', resetPointerTracking);

            storyMap.on('click', 'story-route-click-points-layer', (event) => {
                suppressNextMapClick = true;
                if (mapPointerDragged) return;
                const pointIndexes = getUniquePointIndexesFromFeatures(event.features || []);
                if (!pointIndexes.length) return;
                const fromRoute = false;
                if (pointIndexes.length === 1) {
                    jumpToMapPointEvent(pointIndexes[0], fromRoute);
                    return;
                }
                openPointChoicePopup(pointIndexes, event.lngLat, fromRoute);
            });

            storyMap.on('click', handleMapPointSelection);
        });

        if (!resizeHandlerAttached) {
            window.addEventListener('resize', function () {
                if (storyScroller && typeof storyScroller.resize === 'function') {
                    storyScroller.resize();
                }
            });
            resizeHandlerAttached = true;
        }

        function getDistanceInKm(start, end) {
            const [lng1, lat1] = start;
            const [lng2, lat2] = end;

            const toRad = deg => deg * Math.PI / 180;
            const R = 6371;

            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);

            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function getTransitionDuration(chapters, currentIndex) {
            // 第一章没有“上一段到当前段”的迁移，给一个默认较短值
            if (currentIndex <= 0 || currentIndex >= chapters.length) {
                return 1200;
            }

            const start = chapters[currentIndex - 1].location.center;
            const end = chapters[currentIndex].location.center;
            const distanceKm = getDistanceInKm(start, end);

            // 线性映射：近距离不低于 1200ms，远距离不高于 3200ms
            const duration = 1200 + distanceKm * 0.35;

            return Math.max(1200, Math.min(3200, Math.round(duration)));
        }

        function buildAllRouteGeoJSON(chapters) {
            const features = [];

            for (let i = 0; i < chapters.length - 1; i++) {
                const current = chapters[i];
                const next = chapters[i + 1];

                if (current.isOverview || next.isOverview) continue;

                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: createUpwardArcPoints(
                            current.location.center,
                            next.location.center
                        )
                    },
                    properties: {
                        segmentIndex: i
                    }
                });
            }

            return {
                type: 'FeatureCollection',
                features
            };
        }

        function buildAllPointsGeoJSON(chapters) {
            const features = [];

            chapters.forEach((chapter, index) => {
                if (chapter.isOverview) return;

                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: chapter.location.center
                    },
                    properties: {
                        pointIndex: index
                    }
                });
            });

            return {
                type: 'FeatureCollection',
                features
            };
        }


        function restoreTimelineState(stepIndex) {
            const currentChapter = config.chapters[stepIndex];
            if (!currentChapter || currentChapter.isOverview) return false;

            const overviewRouteSource = storyMap.getSource('story-route-overview');
            if (overviewRouteSource) {
                overviewRouteSource.setData(emptyFeatureCollection());
            }
            const overviewPointsSource = storyMap.getSource('story-route-overview-points');
            if (overviewPointsSource) {
                overviewPointsSource.setData(emptyFeatureCollection());
            }

            const pastRouteSource = storyMap.getSource('story-route-past');
            if (pastRouteSource) {
                pastRouteSource.setData(buildPastRouteGeoJSON(config.chapters, stepIndex));
            }
            const visitedPointsSource = storyMap.getSource('story-route-visited-points');
            if (visitedPointsSource) {
                visitedPointsSource.setData(buildVisitedPointsGeoJSON(config.chapters, stepIndex));
            }
            const currentPointSource = storyMap.getSource('story-route-current-point');
            if (currentPointSource) {
                currentPointSource.setData(buildCurrentPointGeoJSON(config.chapters, stepIndex));
            }
            const jumpPointsSource = storyMap.getSource('story-route-jump-points');
            if (jumpPointsSource) {
                jumpPointsSource.setData(emptyFeatureCollection());
            }
            showActiveRouteImmediately(config.chapters, stepIndex);
            storyMap.flyTo({
                ...currentChapter.location,
                duration: 900
            });
            if (config.showMarkers && storyMarker) {
                storyMarker.setLngLat(currentChapter.location.center);
            }
            if (insetMapInstance && insetMarker) {
                insetMapInstance.setCenter(currentChapter.location.center);
                insetMarker.setLngLat(currentChapter.location.center);
            }
            return true;
        }

        

        function fitMapToAllChapters(chapters) {
            const points = chapters
                .filter(chapter => !chapter.isOverview && chapter.location && chapter.location.center)
                .map(chapter => chapter.location.center);

            if (!points.length) return;

            const weightedCenter = getWeightedOverviewCenter(points);
            const bounds = new maplibregl.LngLatBounds();
            points.forEach(point => bounds.extend(point));

            const camera = storyMap.cameraForBounds(bounds, {
                padding: { top: 90, right: 90, bottom: 90, left: 90 }
            });

            const baseCenter = camera && camera.center ? [camera.center.lng, camera.center.lat] : weightedCenter;
            const blendedCenter = [
                weightedCenter[0] * 0.68 + baseCenter[0] * 0.32,
                weightedCenter[1] * 0.68 + baseCenter[1] * 0.32
            ];
            const baseZoom = camera && Number.isFinite(camera.zoom) ? camera.zoom : 2;

            storyMap.easeTo({
                center: blendedCenter,
                zoom: Math.max(1.25, baseZoom - 0.55),
                pitch: 0,
                bearing: 0,
                duration: 1800
            });
        }

        function getWeightedOverviewCenter(points) {
            if (points.length === 1) return points[0];
            const threshold = 18;
            const weighted = points.map((point, index) => {
                let neighbors = 1;
                for (let i = 0; i < points.length; i++) {
                    if (i === index) continue;
                    const [lngA, latA] = point;
                    const [lngB, latB] = points[i];
                    const distance = Math.hypot((lngA - lngB) * Math.cos(((latA + latB) / 2) * Math.PI / 180), latA - latB);
                    if (distance <= threshold) neighbors += 1;
                }
                return { point, weight: neighbors };
            });
            const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
            const lng = weighted.reduce((sum, item) => sum + item.point[0] * item.weight, 0) / totalWeight;
            const lat = weighted.reduce((sum, item) => sum + item.point[1] * item.weight, 0) / totalWeight;
            return [lng, lat];
        }

        window.toggleRouteOverview = function(forceActive = null) {
            if (!storyMap || !config || !Array.isArray(config.chapters) || !config.chapters.length) return false;

            const nextActive = forceActive === null ? !manualOverviewActive : !!forceActive;

            if (nextActive) {
                storyHiddenManually = false;
                manualOverviewActive = true;
                wasOverviewActive = true;
                const storyEl = document.getElementById('story');
                if (storyEl) storyEl.classList.add('overview-mode');
                setStoryHiddenByRoute(true);
                setRouteToggleActive(true);

                const overviewRouteSource = storyMap.getSource('story-route-overview');
                if (overviewRouteSource) {
                    overviewRouteSource.setData(buildAllRouteGeoJSON(config.chapters));
                }
                const overviewPointsSource = storyMap.getSource('story-route-overview-points');
                if (overviewPointsSource) {
                    overviewPointsSource.setData(buildAllPointsGeoJSON(config.chapters));
                }
                const pastRouteSource = storyMap.getSource('story-route-past');
                if (pastRouteSource) pastRouteSource.setData(emptyFeatureCollection());
                const activeRouteSource = storyMap.getSource('story-route-active');
                if (activeRouteSource) activeRouteSource.setData(emptyFeatureCollection());
                const visitedPointsSource = storyMap.getSource('story-route-visited-points');
                if (visitedPointsSource) visitedPointsSource.setData(emptyFeatureCollection());
                const currentPointSource = storyMap.getSource('story-route-current-point');
                if (currentPointSource) currentPointSource.setData(emptyFeatureCollection());
                const jumpPointsSource = storyMap.getSource('story-route-jump-points');
                if (jumpPointsSource) jumpPointsSource.setData(buildAllPointsGeoJSON(config.chapters));

                fitMapToAllChapters(config.chapters);
                return true;
            }

            manualOverviewActive = false;
            wasOverviewActive = false;
            setRouteToggleActive(false);
            setStoryHiddenByRoute(false);
            const storyEl = document.getElementById('story');
            if (storyEl) storyEl.classList.remove('overview-mode');

            const restoreIndex = Number.isFinite(lastRealChapterIndex) ? lastRealChapterIndex : Math.max(0, currentStepIndex || 0);
            restoreTimelineState(restoreIndex);
            if (typeof window.jumpToStoryStep === 'function') {
                window.jumpToStoryStep(restoreIndex);
            }
            return true;
        };
    }

    