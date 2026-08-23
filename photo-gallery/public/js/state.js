// Pic UI state shared by the classic renderer scripts.
// Keep the legacy bindings below while the application is split incrementally.
let selectedPhotos = new Set();
let currentPanel = 'gallery';
let browserMode = localStorage.getItem('browserMode') || 'xiaohongshu';
let currentViewMode = localStorage.getItem('photoViewMode') || 'masonry';
let isRecycleBinView = false;
let projects = [];
let currentProjectId = null;
let currentProjectName = '';
let activeSmartFilters = new Set();

const PicState = window.PicState = {};
Object.defineProperties(PicState, {
  currentProjectId: {
    enumerable: true,
    get: () => currentProjectId,
    set: value => { currentProjectId = value; }
  },
  currentProject: {
    enumerable: true,
    get: () => projects.find(project => project.id === currentProjectId) || null
  },
  workspace: {
    enumerable: true,
    get: () => currentPanel,
    set: value => { currentPanel = value; }
  },
  selectedPhotoIds: {
    enumerable: true,
    get: () => selectedPhotos
  },
  view: {
    enumerable: true,
    value: {
      get mode() { return currentViewMode; },
      get detailsOpen() { return document.getElementById('metadataPanel')?.classList.contains('open') || false; },
      get selectionTrayOpen() { return false; }
    }
  },
  filters: {
    enumerable: true,
    value: {
      get search() { return photoFilterState?.search || ''; },
      get rating() { return photoFilterState?.rating || null; },
      get tag() { return photoFilterState?.tag || null; },
      reviewState: 'all',
      orientation: null,
      favorite: false
    }
  }
});

const PicEvents = window.PicEvents = (() => {
  const listeners = new Map();

  function on(eventName, listener) {
    const eventListeners = listeners.get(eventName) || new Set();
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);
    return () => off(eventName, listener);
  }

  function off(eventName, listener) {
    listeners.get(eventName)?.delete(listener);
  }

  function emit(eventName, payload) {
    listeners.get(eventName)?.forEach(listener => listener(payload));
  }

  return { on, off, emit };
})();
