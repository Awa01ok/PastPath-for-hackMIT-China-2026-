/**
 * sidebar.js
 * People search, sidebar rendering, and person-loading flows.
 *
 * This file only handles sidebar/search UI and person selection.
 * It does not own Route rendering or wheel-snap behavior.
 */

const PERSON_HISTORY_KEY = 'hackmitViewedPeople';
const PERSON_HISTORY_LIMIT = 8;
const SIDEBAR_PAGE_SIZE = 4;

function comparePeopleByFullName(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
}

// Shared helpers for the People panel.
function getSteps() {
  return Array.from(document.querySelectorAll('.step'));
}

function getPersonById(personId) {
  return peopleIndex.find(person => person.id === personId) || null;
}

function flattenPersonTags(person) {
  const tags = person?.tags || {};
  return Object.values(tags)
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(Boolean);
}

function getPersonSearchText(person) {
  return [
    person.name,
    person.id,
    person.years,
    person.summary,
    ...flattenPersonTags(person)
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

function getBriefSummary(person) {
  const summary = (person?.summary || '').trim();
  if (!summary) return '';
  const sentence = summary.split(/(?<=[.!?])\s+/)[0] || summary;
  return sentence.length > 110 ? sentence.slice(0, 107) + '...' : sentence;
}

function getFilteredPeople() {
  const query = personSearchTerm.trim().toLowerCase();
  if (!query) return [];

  return peopleIndex
    .filter(person => {
      const haystack = getPersonSearchText(person);
      return haystack.includes(query.replace(/^#/, ''));
    })
    .sort(comparePeopleByFullName);
}

function getViewedPeopleHistory() {
  try {
    const raw = localStorage.getItem(PERSON_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read viewed people history:', error);
    return [];
  }
}

function saveViewedPeopleHistory(historyIds) {
  try {
    localStorage.setItem(PERSON_HISTORY_KEY, JSON.stringify(historyIds.slice(0, PERSON_HISTORY_LIMIT)));
  } catch (error) {
    console.warn('Failed to save viewed people history:', error);
  }
}

function pushViewedPerson(personId) {
  const nextHistory = [personId, ...getViewedPeopleHistory().filter(id => id !== personId)]
    .slice(0, PERSON_HISTORY_LIMIT);
  saveViewedPeopleHistory(nextHistory);
}

function escapeAttr(value) {
  return String(value || '').replace(/"/g, '&quot;');
}

function createTagPills(tags = [], clickable = false) {
  if (clickable) {
    return tags.map(tag => `<button type="button" class="person-tag clickable" data-tag="${escapeAttr(tag)}">${tag}</button>`).join('');
  }
  return tags.map(tag => `<span class="person-tag">${tag}</span>`).join('');
}

function scoreRecommendedPeople(basePerson) {
  const baseTags = new Set(flattenPersonTags(basePerson).map(tag => String(tag).toLowerCase()));
  return peopleIndex
    .filter(person => person.id !== basePerson.id)
    .map(person => {
      const tags = flattenPersonTags(person);
      let score = 0;
      for (const tag of tags) {
        if (baseTags.has(String(tag).toLowerCase())) score += 1;
      }
      return { person, score };
    })
    .sort((a, b) => b.score - a.score || comparePeopleByFullName(a.person, b.person))
    .map(item => item.person);
}

function getPagedItems(items, tab) {
  const totalPages = Math.max(1, Math.ceil(items.length / SIDEBAR_PAGE_SIZE));
  sidebarTabPage[tab] = Math.min(sidebarTabPage[tab] || 0, totalPages - 1);
  const start = (sidebarTabPage[tab] || 0) * SIDEBAR_PAGE_SIZE;
  return {
    totalPages,
    page: sidebarTabPage[tab] || 0,
    items: items.slice(start, start + SIDEBAR_PAGE_SIZE)
  };
}

function renderTopShelf() {
  const listEl = document.getElementById('sidebarShelfList');
  const metaEl = document.getElementById('sidebarShelfMeta');
  const prevBtn = document.getElementById('sidebarShelfPrev');
  const nextBtn = document.getElementById('sidebarShelfNext');
  if (!listEl || !metaEl || !prevBtn || !nextBtn) return;

  const currentPerson = getPersonById(currentPersonId);
  const historyPeople = getViewedPeopleHistory().map(getPersonById).filter(Boolean);
  const allPeople = [...peopleIndex].sort((a, b) =>
    comparePeopleByFullName(a, b)
  );
  const sourceItems = activeSidebarTab === 'history' ? historyPeople : allPeople;
  const emptyMessage = activeSidebarTab === 'history'
    ? 'Viewed people will appear here.'
    : 'All people will appear here.';

  const paged = getPagedItems(sourceItems, activeSidebarTab);
  metaEl.textContent = sourceItems.length ? `Page ${paged.page + 1}/${paged.totalPages}` : 'No entries';
  prevBtn.disabled = paged.page <= 0;
  nextBtn.disabled = paged.page >= paged.totalPages - 1 || !sourceItems.length;

  if (!sourceItems.length) {
    listEl.innerHTML = `<div class="history-empty">${emptyMessage}</div>`;
    return;
  }

  listEl.innerHTML = paged.items.map(person => {
    const pills = createTagPills(flattenPersonTags(person).slice(0, 3), false);
    return `
      <button type="button" class="mini-person-row ${person.id === currentPersonId ? 'active' : ''}" data-person-id="${person.id}">
        <img src="${person.portrait}" alt="${person.name}" />
        <span class="mini-person-main">
          <span class="mini-person-head">
            <span class="mini-person-name">${person.name}</span>
            <span class="mini-person-pills">${pills}</span>
          </span>
        </span>
      </button>
    `;
  }).join('');
}

function renderPeopleList() {
  const listEl = document.getElementById('personList');
  const countEl = document.getElementById('personResultCount');
  const shellEl = document.getElementById('personSearchResultsShell');
  if (!listEl || !shellEl) return;

  const query = personSearchTerm.trim();
  if (!query) {
    shellEl.classList.add('is-empty');
    if (countEl) countEl.textContent = '';
    listEl.innerHTML = '';
    return;
  }

  const filteredPeople = getFilteredPeople().slice(0, 4);
  shellEl.classList.remove('is-empty');
  if (countEl) countEl.textContent = `${filteredPeople.length} result${filteredPeople.length === 1 ? '' : 's'}`;

  if (!filteredPeople.length) {
    listEl.innerHTML = `<div class="person-empty">No matching person.</div>`;
    return;
  }

  listEl.innerHTML = filteredPeople.map(person => {
    const tags = flattenPersonTags(person).slice(0, 3);
    return `
      <button type="button" class="person-card ${person.id === currentPersonId ? 'active' : ''}" data-person-id="${person.id}">
        <img class="person-card-avatar" src="${person.portrait}" alt="${person.name}" />
        <span class="person-card-main">
          <span class="person-card-head">
            <span class="person-card-name">${person.name}</span>
            <span class="person-card-tags">${createTagPills(tags, false)}</span>
          </span>
        </span>
      </button>
    `;
  }).join('');
}

function renderSidebarCurrentPerson() {
  const mount = document.getElementById('sidebarCurrentPerson');
  if (!mount) return;

  const currentPerson = getPersonById(currentPersonId);
  if (!currentPerson) {
    mount.innerHTML = '';
    mount.classList.add('is-empty');
    return;
  }

  mount.classList.remove('is-empty');
  const pills = createTagPills(flattenPersonTags(currentPerson).slice(0, 3), false);
  mount.innerHTML = `
    <button type="button" class="mini-person-row featured-person-row active" data-person-id="${currentPerson.id}">
      <img src="${currentPerson.portrait}" alt="${currentPerson.name}" />
      <span class="mini-person-main">
        <span class="mini-person-head">
          <span class="mini-person-name">${currentPerson.name}</span>
          <span class="mini-person-pills">${pills}</span>
        </span>
      </span>
    </button>
  `;
}

// Refresh the People shelf and related controls after selection or mode changes.
function rerenderSidebar() {
  renderPeopleList();
  renderSidebarCurrentPerson();
  renderTopShelf();
  const storyDock = document.getElementById('storyVisibilityDock');
  if (storyDock) storyDock.style.display = currentPersonId ? '' : 'none';
}
window.rerenderSidebar = rerenderSidebar;

// Collapse the People panel into a slim reopen tab pinned to the left edge.
function setSidebarCollapsed(collapsed) {
  const sidebar = document.getElementById('person-sidebar');
  if (!sidebar) return;

  sidebar.classList.toggle('collapsed', collapsed);
  const toggle = document.getElementById('personSidebarToggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.innerHTML = collapsed ? '<span class="sidebar-toggle-label">People</span>' : '<span class="sidebar-toggle-label">Hide</span>';
    toggle.setAttribute('aria-label', collapsed ? 'Show People panel' : 'Hide People panel');
    toggle.title = collapsed ? 'Show People panel' : 'Hide People panel';
  }

  let collapsedDock = document.getElementById('personSidebarCollapsedDock');
  if (!collapsedDock) {
    collapsedDock = document.createElement('button');
    collapsedDock.id = 'personSidebarCollapsedDock';
    collapsedDock.type = 'button';
    collapsedDock.setAttribute('aria-label', 'Show People panel');
    collapsedDock.innerHTML = '<span class="sidebar-toggle-label">People</span>';
    collapsedDock.addEventListener('click', () => setSidebarCollapsed(false));
    document.body.appendChild(collapsedDock);
  }
  collapsedDock.classList.toggle('active', !!collapsed);
}



function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}


let personHoverPreviewState = {
  previewEl: null,
  activeAnchor: null,
  activePerson: null,
  showTimer: null,
  hideTimer: null,
  hoverDelayMs: 260,
  hideDelayMs: 140
};

function clearPersonHoverPreviewTimers() {
  if (personHoverPreviewState.showTimer) {
    clearTimeout(personHoverPreviewState.showTimer);
    personHoverPreviewState.showTimer = null;
  }
  if (personHoverPreviewState.hideTimer) {
    clearTimeout(personHoverPreviewState.hideTimer);
    personHoverPreviewState.hideTimer = null;
  }
}

function ensurePersonHoverPreview() {
  let preview = document.getElementById('personHoverPreview');
  if (preview) {
    personHoverPreviewState.previewEl = preview;
    return preview;
  }

  preview = document.createElement('div');
  preview.id = 'personHoverPreview';
  preview.className = 'person-hover-preview';
  preview.setAttribute('aria-hidden', 'true');

  preview.addEventListener('mouseenter', () => {
    if (personHoverPreviewState.hideTimer) {
      clearTimeout(personHoverPreviewState.hideTimer);
      personHoverPreviewState.hideTimer = null;
    }
    preview.classList.add('is-hovered');
  });

  preview.addEventListener('mouseleave', () => {
    preview.classList.remove('is-hovered');
    scheduleHidePersonHoverPreview();
  });

  document.body.appendChild(preview);
  personHoverPreviewState.previewEl = preview;
  return preview;
}

function getHoverSummary(person) {
  const summary = stripHtml(person?.summary || '');
  if (!summary) return 'No summary available.';
  return summary.length > 280 ? summary.slice(0, 277) + '...' : summary;
}

function positionPersonHoverPreview(preview, anchorEl) {
  if (!preview || !anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const gap = 14;
  const viewportPadding = 16;

  let left = rect.left - previewRect.width - gap;
  if (left < viewportPadding) {
    left = rect.right + gap;
  }
  if (left + previewRect.width > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - previewRect.width - viewportPadding);
  }

  let top = rect.top + (rect.height / 2) - (previewRect.height / 2);
  top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewRect.height - viewportPadding));

  preview.style.left = `${Math.round(left)}px`;
  preview.style.top = `${Math.round(top)}px`;
}

function hidePersonHoverPreview(immediate = false) {
  const preview = document.getElementById('personHoverPreview');
  clearPersonHoverPreviewTimers();
  if (!preview) return;

  const doHide = () => {
    preview.classList.remove('is-visible', 'is-hovered');
    preview.setAttribute('aria-hidden', 'true');
    personHoverPreviewState.activeAnchor = null;
    personHoverPreviewState.activePerson = null;
  };

  if (immediate) {
    doHide();
    return;
  }

  doHide();
}
window.hidePersonHoverPreview = hidePersonHoverPreview;

function scheduleHidePersonHoverPreview() {
  const preview = ensurePersonHoverPreview();
  if (preview.classList.contains('is-hovered')) return;
  if (personHoverPreviewState.hideTimer) {
    clearTimeout(personHoverPreviewState.hideTimer);
  }
  personHoverPreviewState.hideTimer = setTimeout(() => {
    if (!preview.matches(':hover') && !personHoverPreviewState.activeAnchor?.matches?.(':hover')) {
      hidePersonHoverPreview(true);
    }
  }, personHoverPreviewState.hideDelayMs);
}
window.scheduleHidePersonHoverPreview = scheduleHidePersonHoverPreview;


function buildPersonWikipediaUrl(person) {
  const explicitUrl = String(
    person?.wikipedia_url || person?.wikipediaUrl || person?.wikiUrl || person?.url || ''
  ).trim();
  if (explicitUrl) return explicitUrl;

  const titleSource = String(person?.wikipedia_title || person?.wikipediaTitle || person?.name || '').trim();
  if (!titleSource) return '';

  const normalizedTitle = titleSource.replace(/\s+/g, '_');
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(normalizedTitle)}`;
}

function renderPersonHoverPreview(person, anchorEl) {
  if (!person || !anchorEl || window.matchMedia('(hover: none)').matches) {
    hidePersonHoverPreview(true);
    return;
  }

  const preview = ensurePersonHoverPreview();
  const wikiUrl = buildPersonWikipediaUrl(person);
  const portrait = person.portrait || '';
  const years = person.years ? `<div class="person-hover-preview-years">${person.years}</div>` : '';
  const imageMarkup = portrait
    ? (wikiUrl
      ? `<a class="person-hover-preview-image-link" href="${escapeAttr(wikiUrl)}" target="_blank" rel="noopener noreferrer" title="Open Wikipedia page"><img class="person-hover-preview-image" src="${escapeAttr(portrait)}" alt="${escapeAttr(person.name)}" /></a>`
      : `<div class="person-hover-preview-image-link is-static"><img class="person-hover-preview-image" src="${escapeAttr(portrait)}" alt="${escapeAttr(person.name)}" /></div>`)
    : '<div class="person-hover-preview-image-fallback">No image</div>';

  preview.innerHTML = `
    <div class="person-hover-preview-card">
      <div class="person-hover-preview-media">${imageMarkup}</div>
      <div class="person-hover-preview-content">
        <div class="person-hover-preview-name">${person.name || ''}</div>
        ${years}
        <div class="person-hover-preview-summary">${getHoverSummary(person)}</div>
      </div>
    </div>
  `;

  const imageLinkEl = preview.querySelector('.person-hover-preview-image-link[href]');
  if (imageLinkEl && wikiUrl) {
    imageLinkEl.addEventListener('click', event => {
      event.stopPropagation();
      window.open(wikiUrl, '_blank', 'noopener,noreferrer');
    });
  }

  personHoverPreviewState.activeAnchor = anchorEl;
  personHoverPreviewState.activePerson = person;
  preview.classList.add('is-visible');
  preview.setAttribute('aria-hidden', 'false');
  positionPersonHoverPreview(preview, anchorEl);
}

function showPersonHoverPreview(person, anchorEl) {
  if (!person || !anchorEl || window.matchMedia('(hover: none)').matches) {
    hidePersonHoverPreview(true);
    return;
  }

  const preview = ensurePersonHoverPreview();
  const wasVisible = preview.classList.contains('is-visible');
  const samePerson = personHoverPreviewState.activePerson?.id === person.id;
  const sameAnchor = personHoverPreviewState.activeAnchor === anchorEl;

  clearPersonHoverPreviewTimers();

  if (wasVisible && samePerson && sameAnchor) {
    positionPersonHoverPreview(preview, anchorEl);
    return;
  }

  if (wasVisible && (!samePerson || !sameAnchor)) {
    renderPersonHoverPreview(person, anchorEl);
    return;
  }

  personHoverPreviewState.activeAnchor = anchorEl;
  personHoverPreviewState.activePerson = person;
  personHoverPreviewState.showTimer = setTimeout(() => {
    renderPersonHoverPreview(person, anchorEl);
    personHoverPreviewState.showTimer = null;
  }, personHoverPreviewState.hoverDelayMs);
}
window.showPersonHoverPreview = showPersonHoverPreview;

