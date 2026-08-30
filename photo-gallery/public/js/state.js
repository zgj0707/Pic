// Pic UI state shared by the classic renderer scripts.
// Keep the legacy bindings below while the application is split incrementally.
let selectedPhotos = new Set();
let currentPanel = 'gallery';
// The embedded material browser is permanently Xiaohongshu. Keep these
// legacy bindings for compatibility with older renderer modules and data.
let browserMode = 'xiaohongshu';
let browserSource = 'xiaohongshu';
let browserSourceUrls = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem('browserSourceUrls') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
})();
let currentViewMode = localStorage.getItem('photoViewMode') || 'masonry';
let isRecycleBinView = false;
let projects = [];
let currentProjectId = null;
let currentProjectName = '';
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
      get detailsOpen() { return document.getElementById('metadataPanel')?.classList.contains('open') || false; }
    }
  },
  filters: {
    enumerable: true,
    value: {
      get search() { return photoFilterState?.search || ''; }
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
