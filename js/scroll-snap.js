/**
 * scroll-snap.js
 * Wheel-snap behavior for normal chapter browsing.
 *
 * This file only decides which event card should be treated as the next target.
 */

function getRealSteps() {
  return Array.from(document.querySelectorAll('#features .step:not(.overview-step)'));
}

function getChapterIndexFromStepElement(stepEl) {
  if (!stepEl || !window.config || !Array.isArray(window.config.chapters)) return -1;
  return window.config.chapters.findIndex(chapter => chapter.id === stepEl.id);
}

function getRealStepIndexFromChapterIndex(chapterIndex) {
  if (!Number.isFinite(chapterIndex)) return -1;
  const steps = getRealSteps();
  if (!steps.length) return -1;
  const chapter = window.config && Array.isArray(window.config.chapters)
    ? window.config.chapters[chapterIndex]
    : null;
  if (!chapter || !chapter.id) return -1;
  return steps.findIndex(step => step.id === chapter.id);
}

function getBestBaseRealStepIndex() {
  const currentIndex = getRealStepIndexFromChapterIndex(currentStepIndex);
  if (currentIndex >= 0) return currentIndex;
  return getClosestRealStepIndex();
}

function scrollToRealStepIndex(index) {
  const steps = getRealSteps();
  if (!steps.length) return;

  const safeIndex = Math.max(0, Math.min(index, steps.length - 1));
  const targetStep = steps[safeIndex];
  if (!targetStep) return;

  const chapterIndex = getChapterIndexFromStepElement(targetStep);
  if (chapterIndex >= 0) currentStepIndex = chapterIndex;
  targetStep.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}

function releaseBoundaryLockSoon() {
  if (boundaryLockTimer) clearTimeout(boundaryLockTimer);
  boundaryLockTimer = setTimeout(() => {
    boundaryLockDirection = null;
    boundaryLockTimer = null;
  }, 420);
}

function getClosestRealStepIndex() {
  const steps = getRealSteps();
  if (!steps.length) return 0;
  const viewportCenter = window.innerHeight * 0.5;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  steps.forEach((step, index) => {
    const rect = step.getBoundingClientRect();
    const center = rect.top + rect.height * 0.5;
    const distance = Math.abs(center - viewportCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

// Snap wheel navigation between real event cards.
function handleWheelSnap(event) {
  if (!snapModeEnabled || window.isSwitchingPerson || isSnapScrolling || wheelCooldown) return;

  const deltaY = event.deltaY || 0;
  if (Math.abs(deltaY) < 8) return;

  const target = event.target;
  if (target && (target.closest('input, textarea, select') || target.closest('.maplibregl-popup'))) {
    return;
  }

  const steps = getRealSteps();
  if (!steps.length) return;

  const direction = deltaY > 0 ? 1 : -1;
  const maxIndex = steps.length - 1;
  const baseIndex = Math.max(0, Math.min(getBestBaseRealStepIndex(), maxIndex));
  const baseChapterIndex = getChapterIndexFromStepElement(steps[baseIndex]);
  if (baseChapterIndex >= 0) currentStepIndex = baseChapterIndex;

  if (boundaryLockDirection === direction) {
    event.preventDefault();
    return;
  }

  const nextIndex = Math.max(0, Math.min(baseIndex + direction, maxIndex));
  if (nextIndex === baseIndex) {
    boundaryLockDirection = direction;
    releaseBoundaryLockSoon();
    event.preventDefault();
    return;
  }

  boundaryLockDirection = direction;
  releaseBoundaryLockSoon();
  event.preventDefault();
  isSnapScrolling = true;
  wheelCooldown = true;
  scrollToRealStepIndex(nextIndex);

  setTimeout(() => {
    const nextChapterIndex = getChapterIndexFromStepElement(steps[nextIndex]);
    if (nextChapterIndex >= 0) {
      currentStepIndex = nextChapterIndex;
    }
    isSnapScrolling = false;
    wheelCooldown = false;
  }, 420);
}

function attachWheelSnap() {
  window.removeEventListener('wheel', handleWheelSnap, { passive: false, capture: true });
  window.addEventListener('wheel', handleWheelSnap, { passive: false, capture: true });
}


