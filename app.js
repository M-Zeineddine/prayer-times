(function () {
  'use strict';

  var API_BASE = 'https://www.fadlullah.org.lb/webservices/MawakitAlSalatWebService.ashx';
  var DAY_MS = 86400000;

  // Order matches the office's own markers; `primary` = one of the 5 obligatory prayers.
  var ORDER = [
    { key: 'imsak', primary: false },
    { key: 'fajr', primary: true },
    { key: 'shourouk', primary: false },
    { key: 'doher', primary: true },
    { key: '3asr', primary: true },
    { key: 'maghreb', primary: true },
    { key: 'homra', primary: false },
    { key: '3asha', primary: true },
    { key: 'midnight', primary: false }
  ];

  var I18N = {
    ar: {
      names: { imsak: 'الإمساك', fajr: 'الفجر', shourouk: 'الشروق', doher: 'الظهر', '3asr': 'العصر', maghreb: 'المغرب', homra: 'غياب الشفق', '3asha': 'العشاء', midnight: 'منتصف الليل' },
      next: 'التالي', now: 'الآن', today: 'اليوم', prev: 'اليوم السابق', nextDay: 'اليوم التالي', goToday: 'العودة إلى اليوم',
      chooseCity: 'اختر المدينة', searchPlaceholder: 'ابحث عن مدينة...', myLocation: 'موقعي الحالي', locating: 'جارِ تحديد الموقع...',
      source: 'المواقيت بحسب مكتب سماحة السيد محمد حسين فضل الله', inWord: 'بعد', h: 'س', m: 'د',
      gregLocale: 'ar-LB-u-nu-latn'
    },
    en: {
      names: { imsak: 'Imsak', fajr: 'Fajr', shourouk: 'Sunrise', doher: 'Dhuhr', '3asr': 'Asr', maghreb: 'Maghrib', homra: 'End of twilight', '3asha': 'Isha', midnight: 'Midnight' },
      next: 'Next', now: 'Now', today: 'Today', prev: 'Previous day', nextDay: 'Next day', goToday: 'Back to today',
      chooseCity: 'Choose city', searchPlaceholder: 'Search a city...', myLocation: 'My location', locating: 'Locating...',
      source: 'Times per the office of Sayyid Mohammad Hussein Fadlallah', inWord: 'in', h: 'h', m: 'min',
      gregLocale: 'en-GB-u-nu-latn'
    }
  };

  var ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ICON_STAR_SMALL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F0D49C" stroke-width="2" aria-hidden="true"><rect x="5" y="5" width="14" height="14"/><rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)"/></svg>';

  var state = {
    lang: localStorage.getItem('pt_lang') || 'ar',
    city: null,
    viewDate: startOfDay(new Date()),
    countries: null,
    sheetOpen: false
  };
  try {
    var savedCity = localStorage.getItem('pt_city');
    if (savedCity) state.city = JSON.parse(savedCity);
  } catch (e) { /* ignore */ }
  if (!state.city) state.city = { type: 'id', id: 597, label: 'LEBANON Beirut' };

  var cache = {}; // key -> { promise, data, error }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function formatDateForApi(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }

  function cityKey() {
    return state.city.type === 'geo'
      ? 'geo:' + state.city.lat.toFixed(3) + ',' + state.city.lon.toFixed(3)
      : 'id:' + state.city.id;
  }

  function getBrowserTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  function buildFormBody(date) {
    var params = new URLSearchParams();
    params.set('toHijriDate', '');
    params.set('fromHijriDate', '');
    params.set('miladiDate', formatDateForApi(date));
    params.set('rangeType', 'day');
    params.set('calendarType', 'Gregorian');
    if (state.city.type === 'geo') {
      params.set('countryCode', '');
      params.set('latitude', String(state.city.lat));
      params.set('longitude', String(state.city.lon));
    } else {
      params.set('countryCode', String(state.city.id));
      params.set('latitude', '');
      params.set('longitude', '');
    }
    params.set('elevation', '');
    params.set('timeZoneString', getBrowserTimeZone());
    params.set('LangString', state.lang);
    return params;
  }

  function timeStrToMinutes(str) {
    var p = str.split(':');
    if (p.length < 2) return null;
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function parseResponseHtml(html) {
    var byKey = {};
    var itemRe = /<img src="\/images\/([a-zA-Z0-9]+)\.svg"[^>]*>\s*<div>([^<]*)<\/div>\s*<div class="[^"]*d-block">([^<]*)<\/div>/g;
    var m;
    while ((m = itemRe.exec(html))) {
      byKey[m[1]] = m[3].trim();
    }
    var dateRe = /<div class="text-content" dir='rtl'>([^<]*)<\/div>/;
    var dm = dateRe.exec(html);
    var hijriLabel = dm ? dm[1].trim() : '';
    var items = ORDER.map(function (o) {
      var time = byKey[o.key] || '';
      return { key: o.key, primary: o.primary, time: time, minutes: time ? timeStrToMinutes(time) : null };
    });
    return { items: items, hijriLabel: hijriLabel };
  }

  function fetchDay(date) {
    var body = buildFormBody(date);
    return fetch(API_BASE + '?action=CallAllFunctionsAsync', { method: 'POST', body: body })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.error) throw new Error(json.message || 'error');
        return parseResponseHtml(json.data || '');
      });
  }

  // Loads the viewed day plus its two neighbors (so pre-Imsak / post-Midnight
  // edge cases at the start/end of the day resolve without a visible delay).
  function loadAroundDate(centerDate) {
    var ck = cityKey();
    [-1, 0, 1].forEach(function (off) {
      var d = addDays(centerDate, off);
      var key = ck + '|' + dateKey(d) + '|' + state.lang;
      if (cache[key]) return;
      var entry = { promise: null, data: null, error: null };
      cache[key] = entry;
      entry.promise = fetchDay(d).then(function (data) {
        entry.data = data;
        renderMain();
      }).catch(function (err) {
        entry.error = err;
        renderMain();
      });
    });
    return cache[ck + '|' + dateKey(centerDate) + '|' + state.lang];
  }

  function getCached(date) {
    var key = cityKey() + '|' + dateKey(date) + '|' + state.lang;
    var entry = cache[key];
    return entry && entry.data ? entry.data : null;
  }

  function nowMinutes() {
    var n = new Date();
    return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
  }

  function fmtCountdown(remainMin) {
    var remainSec = Math.max(0, Math.round(remainMin * 60));
    var h = Math.floor(remainSec / 3600);
    var m = Math.floor((remainSec % 3600) / 60);
    var s = remainSec % 60;
    return h + ':' + pad(m) + ':' + pad(s);
  }

  function compute() {
    var T = I18N[state.lang];
    var today = getCached(state.viewDate);
    if (!today) return null;

    var isToday = sameDay(state.viewDate, new Date());
    var curIdx = -1, nextIdx = -1, curMin = null, nextMin = null, fromText = '', toText = '';

    if (isToday) {
      var now = nowMinutes();
      today.items.forEach(function (it, k) { if (it.minutes !== null && it.minutes <= now) curIdx = k; });

      if (curIdx === -1) {
        // Before Imsak: "current" is yesterday's Midnight (not a cell in today's grid).
        nextIdx = 0;
        nextMin = today.items[0].minutes;
        var prev = getCached(addDays(state.viewDate, -1));
        if (prev && prev.items[8].minutes !== null) {
          curMin = prev.items[8].minutes - 1440;
          fromText = T.names.midnight + ' ' + prev.items[8].time;
        }
        toText = T.names[ORDER[0].key] + ' ' + today.items[0].time;
      } else if (curIdx === 8) {
        // After Midnight: "next" is tomorrow's Imsak (not a cell in today's grid).
        curMin = today.items[8].minutes;
        fromText = T.names.midnight + ' ' + today.items[8].time;
        var next = getCached(addDays(state.viewDate, 1));
        if (next && next.items[0].minutes !== null) {
          nextMin = next.items[0].minutes + 1440;
          toText = T.names[ORDER[0].key] + ' ' + next.items[0].time;
        }
      } else {
        nextIdx = curIdx + 1;
        curMin = today.items[curIdx].minutes;
        nextMin = today.items[nextIdx].minutes;
        fromText = T.names[ORDER[curIdx].key] + ' ' + today.items[curIdx].time;
        toText = T.names[ORDER[nextIdx].key] + ' ' + today.items[nextIdx].time;
      }
    }

    var hasTarget = isToday && curMin !== null && nextMin !== null;
    var progress = hasTarget ? Math.min(1, Math.max(0, (nowMinutes() - curMin) / Math.max(1, nextMin - curMin))) : 0;
    var remain = hasTarget ? nextMin - nowMinutes() : null;

    var cells = today.items.map(function (it, k) {
      return {
        key: it.key,
        label: T.names[it.key],
        time: it.time || '—',
        primary: it.primary,
        current: isToday && k === curIdx,
        next: isToday && k === nextIdx
      };
    });

    var nextName = nextIdx !== -1 ? T.names[ORDER[nextIdx].key] : (curIdx === 8 ? T.names.imsak : '—');

    return {
      T: T, cells: cells, hijri: today.hijriLabel, isToday: isToday,
      hasTarget: hasTarget, countdown: hasTarget ? fmtCountdown(remain) : '--:--:--',
      progressPct: (progress * 100).toFixed(1) + '%',
      nextName: nextName, fromText: fromText, toText: toText
    };
  }

  // ---- DOM refs ----
  var el = {};
  function cacheEls() {
    ['cityChip', 'cityLabel', 'locateBtn', 'langEn', 'langAr',
      'prevDay', 'nextDay', 'todayBtn', 'gregDate', 'hijriDate', 'todayPill',
      'hero', 'nextLead', 'nextName', 'count', 'fill', 'fromText', 'toText',
      'grid', 'sourceLine',
      'sheet', 'sheetBackdrop', 'sheetTitle', 'citySearch', 'cityOptList'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function cityDisplayLabel() {
    var T = I18N[state.lang];
    return state.city.type === 'geo' ? T.myLocation : state.city.label;
  }

  function renderMain() {
    var T = I18N[state.lang];
    var ar = state.lang === 'ar';
    document.documentElement.lang = state.lang;
    document.documentElement.dir = ar ? 'rtl' : 'ltr';
    document.title = ar ? 'مواقيت الصلاة' : 'Prayer Times';

    el.cityLabel.textContent = cityDisplayLabel();
    el.langEn.setAttribute('aria-pressed', String(!ar));
    el.langAr.setAttribute('aria-pressed', String(ar));
    el.sheetTitle.textContent = T.chooseCity;
    el.citySearch.placeholder = T.searchPlaceholder;
    el.sourceLine.textContent = T.source;

    var greg = new Intl.DateTimeFormat(T.gregLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(state.viewDate);
    el.gregDate.textContent = greg;
    var isToday = sameDay(state.viewDate, new Date());
    el.todayPill.hidden = isToday;
    el.todayPill.textContent = T.today;
    el.todayBtn.setAttribute('aria-label', T.goToday);
    el.prevDay.setAttribute('aria-label', T.prev);
    el.nextDay.setAttribute('aria-label', T.nextDay);

    var v = compute();

    if (!v) {
      el.hijriDate.textContent = '—';
      el.hero.hidden = true;
      el.grid.innerHTML = '<li class="loading">' + (ar ? 'جارِ التحميل...' : 'Loading...') + '</li>';
      return;
    }

    el.hijriDate.textContent = v.hijri || '—';

    if (v.isToday) {
      el.hero.hidden = false;
      el.nextLead.textContent = T.next;
      el.nextName.textContent = v.nextName;
      el.count.textContent = v.countdown;
      el.fill.style.width = v.progressPct;
      el.fromText.textContent = v.fromText;
      el.toText.textContent = v.toText;
    } else {
      el.hero.hidden = true;
    }

    var html = '';
    v.cells.forEach(function (c) {
      var cls = 'cell ' + (c.primary ? 'primary' : 'secondary') + (c.current ? ' current' : '') + (c.next ? ' next' : '');
      html += '<li class="' + cls + '"' + (c.current ? ' aria-current="time"' : '') + '>' +
        '<span class="top"><span class="label">' + c.label + '</span>' + (c.current ? ICON_STAR_SMALL : '') + '</span>' +
        '<span style="display:flex;flex-direction:column;gap:4px">' +
        '<span class="time num" dir="ltr">' + c.time + '</span>' +
        '<span class="status">' + (c.current ? T.now : (c.next ? T.next : '')) + '</span>' +
        '</span></li>';
    });
    el.grid.innerHTML = html;
  }

  // ---- City sheet ----
  function loadCountries() {
    if (state.countries) return Promise.resolve(state.countries);
    return fetch('data/countries.json').then(function (r) { return r.json(); }).then(function (list) {
      state.countries = list;
      return list;
    });
  }

  function renderCityOptions(query) {
    var list = state.countries || [];
    var q = (query || '').trim().toLowerCase();
    var filtered = q ? list.filter(function (c) { return c.label.toLowerCase().indexOf(q) !== -1; }) : list.slice(0, 80);
    if (filtered.length > 200) filtered = filtered.slice(0, 200);
    var html = '';
    filtered.forEach(function (c) {
      var selected = state.city.type === 'id' && state.city.id === c.id;
      html += '<button class="opt" data-act="selectCity" data-id="' + c.id + '" data-label="' + c.label.replace(/"/g, '&quot;') + '" aria-pressed="' + selected + '">' +
        '<span>' + c.city + ' <span class="ci-country">' + c.country + '</span></span>' +
        (selected ? ICON_CHECK : '') + '</button>';
    });
    el.cityOptList.innerHTML = html || '<div class="loading">—</div>';
  }

  function openSheet() {
    state.sheetOpen = true;
    el.sheet.classList.add('open');
    el.citySearch.value = '';
    loadCountries().then(function () { renderCityOptions(''); });
    setTimeout(function () { el.citySearch.focus(); }, 150);
  }
  function closeSheet() {
    state.sheetOpen = false;
    el.sheet.classList.remove('open');
  }

  function selectCity(id, label) {
    state.city = { type: 'id', id: id, label: label };
    localStorage.setItem('pt_city', JSON.stringify(state.city));
    closeSheet();
    renderMain();
    loadAroundDate(state.viewDate).promise.then(renderMain);
  }

  function useGeolocation() {
    if (!navigator.geolocation) return;
    var T = I18N[state.lang];
    el.cityLabel.textContent = T.locating;
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.city = { type: 'geo', lat: pos.coords.latitude, lon: pos.coords.longitude };
      localStorage.setItem('pt_city', JSON.stringify(state.city));
      renderMain();
      loadAroundDate(state.viewDate).promise.then(renderMain);
    }, function () {
      renderMain();
    }, { timeout: 8000 });
  }

  // ---- Events ----
  function bindEvents() {
    el.cityChip.addEventListener('click', openSheet);
    el.locateBtn.addEventListener('click', useGeolocation);
    el.sheetBackdrop.addEventListener('click', closeSheet);
    el.citySearch.addEventListener('input', function () { renderCityOptions(el.citySearch.value); });
    el.cityOptList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act="selectCity"]');
      if (!b) return;
      selectCity(parseInt(b.getAttribute('data-id'), 10), b.getAttribute('data-label'));
    });

    el.langEn.addEventListener('click', function () { setLang('en'); });
    el.langAr.addEventListener('click', function () { setLang('ar'); });

    el.prevDay.addEventListener('click', function () { changeDate(-1); });
    el.nextDay.addEventListener('click', function () { changeDate(1); });
    el.todayBtn.addEventListener('click', function () {
      state.viewDate = startOfDay(new Date());
      loadAroundDate(state.viewDate);
      renderMain();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.sheetOpen) closeSheet();
    });
  }

  function setLang(lang) {
    state.lang = lang;
    localStorage.setItem('pt_lang', lang);
    loadAroundDate(state.viewDate);
    renderMain();
  }

  function changeDate(delta) {
    state.viewDate = addDays(state.viewDate, delta);
    loadAroundDate(state.viewDate);
    renderMain();
  }

  function init() {
    cacheEls();
    bindEvents();
    loadAroundDate(state.viewDate);
    renderMain();
    setInterval(renderMain, 1000);

    if ('serviceWorker' in navigator) {
      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      navigator.serviceWorker.register('sw.js').then(function (reg) { reg.update(); }).catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
