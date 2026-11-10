(function () {
  'use strict';

  var API_BASE = 'https://www.fadlullah.org.lb/webservices/MawakitAlSalatWebService.ashx';

  var ICON_ORDER = ['imsak', 'fajr', 'shourouk', 'doher', '3asr', 'maghreb', 'homra', '3asha', 'midnight'];
  var PRAYER_KEYS = ['fajr', 'doher', '3asr', 'maghreb', '3asha']; // used for "next prayer" countdown

  var LABELS = {
    ar: {
      imsak: 'الإمساك', fajr: 'الفجر', shourouk: 'الشروق', doher: 'الظهر',
      '3asr': 'العصر', maghreb: 'المغرب', homra: 'غياب الحمرة', '3asha': 'العشاء', midnight: 'منتصف الليل',
      nextPrayer: 'الصلاة القادمة', today: 'اليوم', myLocation: 'موقعي الحالي',
      searchPlaceholder: 'ابحث عن مدينة...', source: 'المصدر: ',
      brandSub: 'مكتب سماحة السيد محمد حسين فضل الله'
    },
    en: {
      imsak: 'Imsak', fajr: 'Fajr', shourouk: 'Sunrise', doher: 'Dhuhr',
      '3asr': 'Asr', maghreb: 'Maghrib', homra: 'End of Twilight', '3asha': 'Isha', midnight: 'Midnight',
      nextPrayer: 'Next Prayer', today: 'Today', myLocation: 'My Location',
      searchPlaceholder: 'Search a city...', source: 'Source: ',
      brandSub: 'Office of Sayyid Mohammad Hussein Fadlallah'
    }
  };

  var ICON_EMOJI = {
    imsak: '🌙', fajr: '🌄', shourouk: '🌅', doher: '☀️',
    '3asr': '🌤️', maghreb: '🌇', homra: '🔴', '3asha': '🌃', midnight: '🌑'
  };

  var state = {
    lang: localStorage.getItem('pt_lang') || 'ar',
    city: null,
    date: new Date(),
    countries: null,
    items: [],
    dayLabel: '', gregLabel: '', hijriLabel: ''
  };

  try {
    var savedCity = localStorage.getItem('pt_city');
    if (savedCity) state.city = JSON.parse(savedCity);
  } catch (e) { /* ignore */ }
  if (!state.city) {
    state.city = { type: 'id', id: 597, label: 'LEBANON Beirut' };
  }

  var el = {};
  function cacheEls() {
    ['langToggle', 'locationBtn', 'cityChip', 'cityLabel', 'prevDay', 'nextDay',
      'gregDate', 'hijriDate', 'nextPrayerLabel', 'nextPrayerCountdown', 'nextPrayerTime',
      'timesGrid', 'sheetBackdrop', 'citySheet', 'citySearch', 'cityList', 'brandSub', 'sourceLabel'].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function formatDateForApi(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }

  function t(key) { return LABELS[state.lang][key] || key; }

  function applyLangDir() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    el.langToggle.textContent = state.lang === 'ar' ? 'EN' : 'AR';
    el.citySearch.placeholder = t('searchPlaceholder');
    el.brandSub.textContent = t('brandSub');
    el.sourceLabel.textContent = t('source');
  }

  function cityDisplayLabel() {
    if (state.city.type === 'geo') return t('myLocation');
    return state.city.label;
  }

  function buildFormBody() {
    var params = new URLSearchParams();
    params.set('toHijriDate', '');
    params.set('fromHijriDate', '');
    params.set('miladiDate', formatDateForApi(state.date));
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
    params.set('timeZoneString', '');
    params.set('LangString', state.lang);
    return params;
  }

  function parseResponseHtml(html) {
    var items = [];
    var itemRe = /<img src="\/images\/([a-zA-Z0-9]+)\.svg"[^>]*>\s*<div>([^<]*)<\/div>\s*<div class="[^"]*d-block">([^<]*)<\/div>/g;
    var m;
    while ((m = itemRe.exec(html))) {
      items.push({ key: m[1], rawLabel: m[2].trim(), time: m[3].trim() });
    }
    var dateRe = /<div class="text-title">([^<]*)<\/div>[\s\S]*?<div class="text-content">([^<]*)<\/div>\s*<div class="text-content" dir='rtl'>([^<]*)<\/div>/;
    var dm = dateRe.exec(html);
    var dayLabel = dm ? dm[1].trim() : '';
    var gregLabel = dm ? dm[2].trim() : '';
    var hijriLabel = dm ? dm[3].trim() : '';
    return { items: items, dayLabel: dayLabel, gregLabel: gregLabel, hijriLabel: hijriLabel };
  }

  function showLoader(show) {
    el.timesGrid.innerHTML = show ? '<div class="loader" id="loader">' + (state.lang === 'ar' ? 'جارِ التحميل...' : 'Loading...') + '</div>' : '';
  }

  function fetchPrayerTimes() {
    showLoader(true);
    var body = buildFormBody();
    return fetch(API_BASE + '?action=CallAllFunctionsAsync', {
      method: 'POST',
      body: body
    })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.error) throw new Error(json.message || 'error');
        var parsed = parseResponseHtml(json.data || '');
        state.items = parsed.items;
        state.dayLabel = parsed.dayLabel;
        state.gregLabel = parsed.gregLabel;
        state.hijriLabel = parsed.hijriLabel;
        renderTimes();
        renderDate();
      })
      .catch(function (err) {
        el.timesGrid.innerHTML = '<div class="loader">' + (state.lang === 'ar' ? 'تعذر تحميل المواقيت' : 'Failed to load times') + '</div>';
        console.error(err);
      });
  }

  function renderDate() {
    el.gregDate.textContent = state.gregLabel ? (state.dayLabel + ' — ' + state.gregLabel) : '—';
    el.hijriDate.textContent = state.hijriLabel || '—';
  }

  function timeStrToMinutes(str) {
    var parts = str.split(':');
    if (parts.length < 2) return null;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function renderTimes() {
    if (!state.items.length) {
      el.timesGrid.innerHTML = '<div class="loader">' + (state.lang === 'ar' ? 'لا توجد بيانات' : 'No data') + '</div>';
      return;
    }
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var order = {};
    ICON_ORDER.forEach(function (k, i) { order[k] = i; });
    var sorted = state.items.slice().sort(function (a, b) { return (order[a.key] || 99) - (order[b.key] || 99); });

    var html = '';
    sorted.forEach(function (item) {
      var isPrayer = PRAYER_KEYS.indexOf(item.key) !== -1;
      var mins = timeStrToMinutes(item.time);
      var active = false;
      if (isPrayer && mins !== null) {
        active = isCurrentPeriod(item.key, mins, nowMin);
      }
      html += '<div class="time-card' + (active ? ' active' : '') + '" data-key="' + item.key + '">' +
        '<div class="tc-icon">' + (ICON_EMOJI[item.key] || '') + '</div>' +
        '<div class="tc-label">' + (LABELS[state.lang][item.key] || item.rawLabel) + '</div>' +
        '<div class="tc-time">' + item.time + '</div>' +
        '</div>';
    });
    el.timesGrid.innerHTML = html;

    updateNextPrayer();
  }

  function isCurrentPeriod(key, startMin, nowMin) {
    var idx = PRAYER_KEYS.indexOf(key);
    var nextStart = null;
    for (var i = idx + 1; i < PRAYER_KEYS.length; i++) {
      var nextItem = findItem(PRAYER_KEYS[i]);
      if (nextItem) { nextStart = timeStrToMinutes(nextItem.time); break; }
    }
    if (nextStart === null) {
      return nowMin >= startMin;
    }
    return nowMin >= startMin && nowMin < nextStart;
  }

  function findItem(key) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].key === key) return state.items[i];
    return null;
  }

  function updateNextPrayer() {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes() * 1 + now.getSeconds() / 60;
    var best = null;
    PRAYER_KEYS.forEach(function (key) {
      var item = findItem(key);
      if (!item) return;
      var mins = timeStrToMinutes(item.time);
      if (mins === null) return;
      if (mins > nowMin && (best === null || mins < best.mins)) {
        best = { key: key, mins: mins, time: item.time };
      }
    });
    if (!best) {
      // all prayers passed today: next is tomorrow's Fajr; show as "after midnight"
      var fajrItem = findItem('fajr');
      el.nextPrayerLabel.textContent = t('nextPrayer') + ' — ' + t('fajr');
      el.nextPrayerTime.textContent = fajrItem ? fajrItem.time : '—';
      el.nextPrayerCountdown.textContent = '--:--:--';
      return;
    }
    el.nextPrayerLabel.textContent = t('nextPrayer') + ' — ' + t(best.key);
    el.nextPrayerTime.textContent = best.time;

    var diffSec = Math.round((best.mins - nowMin) * 60);
    var h = Math.floor(diffSec / 3600);
    var m = Math.floor((diffSec % 3600) / 60);
    var s = diffSec % 60;
    el.nextPrayerCountdown.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function tickCountdown() {
    if (state.items.length) {
      renderTimes();
    }
  }

  // ---- City picker ----
  function loadCountries() {
    if (state.countries) return Promise.resolve(state.countries);
    return fetch('data/countries.json')
      .then(function (r) { return r.json(); })
      .then(function (list) { state.countries = list; return list; });
  }

  function openSheet() {
    el.sheetBackdrop.classList.add('open');
    el.citySheet.classList.add('open');
    el.citySearch.value = '';
    loadCountries().then(renderCityList.bind(null, ''));
    setTimeout(function () { el.citySearch.focus(); }, 150);
  }
  function closeSheet() {
    el.sheetBackdrop.classList.remove('open');
    el.citySheet.classList.remove('open');
  }

  function renderCityList(query) {
    var list = state.countries || [];
    var q = (query || '').trim().toLowerCase();
    var filtered = q ? list.filter(function (c) { return c.label.toLowerCase().indexOf(q) !== -1; }) : list.slice(0, 80);
    if (filtered.length > 200) filtered = filtered.slice(0, 200);
    var html = '';
    filtered.forEach(function (c) {
      html += '<div class="city-item" data-id="' + c.id + '" data-label="' + c.label.replace(/"/g, '&quot;') + '">' +
        '<span>' + c.city + '</span><span class="ci-country">' + c.country + '</span></div>';
    });
    el.cityList.innerHTML = html || '<div class="loader">' + (state.lang === 'ar' ? 'لا نتائج' : 'No results') + '</div>';
  }

  function selectCityById(id, label) {
    state.city = { type: 'id', id: id, label: label };
    localStorage.setItem('pt_city', JSON.stringify(state.city));
    el.cityLabel.textContent = cityDisplayLabel();
    closeSheet();
    fetchPrayerTimes();
  }

  function useGeolocation() {
    if (!navigator.geolocation) return;
    el.cityLabel.textContent = state.lang === 'ar' ? 'جارِ تحديد الموقع...' : 'Locating...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.city = { type: 'geo', lat: pos.coords.latitude, lon: pos.coords.longitude };
      localStorage.setItem('pt_city', JSON.stringify(state.city));
      el.cityLabel.textContent = cityDisplayLabel();
      fetchPrayerTimes();
    }, function () {
      el.cityLabel.textContent = cityDisplayLabel();
    }, { timeout: 8000 });
  }

  // ---- Events ----
  function bindEvents() {
    el.langToggle.addEventListener('click', function () {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      localStorage.setItem('pt_lang', state.lang);
      applyLangDir();
      el.cityLabel.textContent = cityDisplayLabel();
      fetchPrayerTimes();
    });

    el.locationBtn.addEventListener('click', useGeolocation);
    el.cityChip.addEventListener('click', openSheet);
    el.sheetBackdrop.addEventListener('click', closeSheet);

    el.citySearch.addEventListener('input', function () {
      renderCityList(el.citySearch.value);
    });

    el.cityList.addEventListener('click', function (e) {
      var item = e.target.closest('.city-item');
      if (!item) return;
      selectCityById(parseInt(item.getAttribute('data-id'), 10), item.getAttribute('data-label'));
    });

    el.prevDay.addEventListener('click', function () {
      state.date = new Date(state.date.getTime() - 86400000);
      fetchPrayerTimes();
    });
    el.nextDay.addEventListener('click', function () {
      state.date = new Date(state.date.getTime() + 86400000);
      fetchPrayerTimes();
    });
  }

  function init() {
    cacheEls();
    applyLangDir();
    el.cityLabel.textContent = cityDisplayLabel();
    bindEvents();
    fetchPrayerTimes();
    setInterval(tickCountdown, 1000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
