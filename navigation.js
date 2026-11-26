const navigationStateKey = 'estratoScreen';
const screenMemory = new Map();
let navigationEntry;
let goingBack = false;

const screenHash = () => location.hash || '#inicio';
const screenId = () => globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random();
const currentNavigationEntry = () => {
  const entry = history.state?.[navigationStateKey];
  return entry?.hash === screenHash() ? entry : null;
};

function screenTitle() {
  const [name] = route();
  if (name === 'equipo') return equipmentTabs[tab] || 'Ficha de equipo';
  return Object.hasOwn(navNames, name) ? navNames[name] : navNames.inicio;
}

function equipmentScreen(equipment, point, view = 'monitoreo') {
  const root = link(equipment);
  if (!point && view === 'monitoreo') return root;
  const target = root + '/' + (point ? encodeURIComponent(point.id) : '~');
  return view === 'monitoreo' ? target : target + '/' + view;
}

function openEquipmentScreen(equipment, point, view, options) {
  const [page, tag] = route();
  const sameScreen = page === 'equipo' && tag === equipment.tag && tab === view &&
    equipment.points[pointIndex]?.id === point?.id;
  if (!sameScreen) navigate(equipmentScreen(equipment, point, view), options);
}

function fallbackScreen() {
  const [page,,point] = route();
  if (page === 'equipo') {
    const [equipment] = current();
    return equipment && tab !== 'monitoreo'
      ? equipmentScreen(equipment, equipment.points[pointIndex])
      : '#equipos';
  }
  if (page === 'agenda' && point) return '#agenda';
  return page === 'inicio' ? '' : '#inicio';
}

function updateBackButton() {
  const button = $('go-back');
  const fallback = fallbackScreen();
  button.disabled = goingBack || !(navigationEntry?.previous || fallback);
  const [fallbackPage] = fallback.slice(1).split('/');
  const target = navigationEntry?.previous || (fallbackPage === 'equipo' ? 'Monitoreo' : navNames[fallbackPage]);
  button.title = target ? 'Volver a ' + target : 'Volver';
}

function saveView(persist = false) {
  const view = {
    filters: {filter, familyFilter, statusFilter, scheduleDays, scheduleTag},
    scrollY: window.scrollY,
    chatScroll: $('chat-stream')?.scrollTop || 0
  };
  screenMemory.set(navigationEntry.id, view);
  if (persist) {
    navigationEntry = {...navigationEntry, view};
    history.replaceState({[navigationStateKey]: navigationEntry}, '');
  }
  return view;
}

function setFilters(fields = {}) {
  ({filter = '', familyFilter = '', statusFilter = '', scheduleDays = 0, scheduleTag = ''} = fields);
}

function showScreen({view, filters, keepY = 0, initial = false} = {}) {
  const [page] = route();
  if (page === 'agenda' || page === 'equipos') setFilters();
  activateDeepLink();
  if (view && !initial) pendingReading = null;
  if (view?.filters || filters) setFilters(filters || view.filters);

  render();
  const chat = $('chat-stream');
  if (chat) chat.scrollTop = view?.chatScroll ?? chat.scrollHeight;
  if (!initial) {
    const heading = $('app').querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({preventScroll: true});
    }
  }
  scrollTo(0, view?.scrollY ?? keepY);
}

function navigate(hash, {replace = false, keepScroll = false, filters} = {}) {
  if (hash === screenHash()) {
    if (filters) {
      setFilters(filters);
      render();
    }
    return;
  }
  const previousTitle = screenTitle();
  const from = saveView(true);
  navigationEntry = {
    id: screenId(),
    hash,
    previous: replace ? navigationEntry.previous : previousTitle
  };
  const state = {[navigationStateKey]: navigationEntry};
  if (replace) history.replaceState(state, '', hash);
  else history.pushState(state, '', hash);
  showScreen({filters, keepY: keepScroll ? from.scrollY : 0});
}

function startNavigation() {
  history.scrollRestoration = 'manual';
  navigationEntry = currentNavigationEntry() || {id: screenId(), hash: screenHash()};
  history.replaceState({[navigationStateKey]: navigationEntry}, '');
  showScreen({initial: true, view: navigationEntry.view});
}

function visitHistoryEntry() {
  if (!navigationEntry) return;
  const incoming = currentNavigationEntry();
  if (incoming?.id === navigationEntry.id) return;
  saveView();
  goingBack = false;
  navigationEntry = incoming || {id: screenId(), hash: screenHash()};
  if (!incoming) history.replaceState({[navigationStateKey]: navigationEntry}, '');
  showScreen({view: screenMemory.get(navigationEntry.id) || navigationEntry.view});
}

$('go-back').addEventListener('click', () => {
  if (!navigationEntry || goingBack) return;
  if (navigationEntry.previous) {
    goingBack = true;
    updateBackButton();
    history.back();
    return;
  }
  const fallback = fallbackScreen();
  if (fallback) navigate(fallback, {replace: true});
});

document.addEventListener('click', event => {
  if (!navigationEntry || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor?.hash || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
  event.preventDefault();
  navigate(anchor.hash);
});

window.addEventListener('popstate', visitHistoryEntry);
window.addEventListener('hashchange', visitHistoryEntry);

