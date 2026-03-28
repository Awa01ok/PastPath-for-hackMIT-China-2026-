apiGet('/api/people')
  .then(indexData => {
    peopleIndex = indexData.people;

    console.log('People index loaded from API:', peopleIndex);

    saveViewedPeopleHistory([]);
    renderSearchDock();
    renderPersonSidebar();
    rerenderSidebar();
    if (typeof window.initTerritoryLayer === 'function') {
      window.initTerritoryLayer();
    }
    if (typeof window.initTimeline === 'function') {
      window.initTimeline();
      window.refreshTimeline();
    }

    const storyDock = document.getElementById('storyVisibilityDock');
    if (storyDock) storyDock.style.display = 'none';
    bindLandingModeDismiss();
    if (typeof window.showIdleMap === 'function') {
      window.showIdleMap();
      enterLandingMode();
    }
  })
  .catch(error => {
    console.error('Failed to load people index from API:', error);
  });

