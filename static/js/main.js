/* YOUR PEACE GUIDE – frontend logic.
   The recommender is called through `fetchRecommendations`, so swapping
   the Flask endpoint or the algorithm later only touches that function. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const BASE = location.protocol === 'file:' ? 'http://127.0.0.1:5000' : '';
  const API = { recommend: BASE + '/api/recommend', destinations: BASE + '/api/destinations' };

  /* ---------- Hero slideshow (crossfade + slow zoom) ---------- */
  const SLIDES = [
    ['Ooty & Munnar, green hills', 'ooty,tea'],
    ['Manali, snow mountains', 'manali,snow'],
    ['Goa, sunset beaches', 'goa,beach,sunset'],
    ['Kerala backwaters', 'kerala,backwaters'],
    ['Kashmir valleys', 'kashmir,valley'],
    ['Meghalaya waterfalls', 'meghalaya,waterfall'],
    ['Rajasthan desert', 'rajasthan,desert'],
    ['Coorg coffee plantations', 'coorg,coffee']
  ].map(([caption, tags], i) => ({ caption, url: `https://loremflickr.com/1600/900/${tags}?lock=${i + 20}` }));

  function initSlideshow() {
    const wrap = $('#slides'), cap = $('#slideCaption');
    const els = SLIDES.map(s => {
      const d = document.createElement('div');
      d.className = 'slide';
      // Only show an image once it loads; otherwise the green gradient fallback stays.
      const img = new Image();
      img.onload = () => { d.style.backgroundImage = `url("${s.url}")`; d.dataset.ok = '1'; };
      img.src = s.url;
      wrap.appendChild(d);
      return d;
    });
    let i = -1;
    const next = () => {
      const ready = els.filter(e => e.dataset.ok);
      if (!ready.length) return;
      els.forEach(e => e.classList.remove('active'));
      i = (i + 1) % els.length;
      while (!els[i].dataset.ok) i = (i + 1) % els.length;
      void els[i].offsetWidth;            // restart zoom animation
      els[i].classList.add('active');
      cap.textContent = SLIDES[i].caption;
    };
    setTimeout(next, 900);
    setInterval(next, 8000);
  }

  /* ---------- Questionnaire ---------- */
  const QUESTIONS = [
    { key: 'budget', title: 'What is your travel budget?', options: [
      ['b1', 'Below ₹5,000', '🪙'], ['b2', '₹5,000–₹10,000', '💵'], ['b3', '₹10,000–₹20,000', '💰'],
      ['b4', '₹20,000–₹50,000', '💎'], ['b5', 'Above ₹50,000', '👑']] },
    { key: 'season', title: 'Which season do you prefer?', options: [
      ['winter', 'Winter', '❄️'], ['summer', 'Summer', '☀️'], ['monsoon', 'Monsoon', '🌧️'],
      ['spring', 'Spring', '🌸'], ['any', 'Any season', '🗓️']] },
    { key: 'category', title: 'What kind of experience are you looking for?', options: [
      ['nature', 'Nature & Greenery', '🌿'], ['mountains', 'Mountains & Hill Stations', '🏔️'], ['beaches', 'Beaches', '🏖️'],
      ['adventure', 'Adventure & Trekking', '🥾'], ['historical', 'Historical Places', '🏛️'],
      ['spiritual', 'Spiritual & Peaceful Places', '🪷'], ['wildlife', 'Wildlife & Forests', '🐅'], ['city', 'City Exploration', '🏙️']] },
    { key: 'days', title: 'How many days are you planning to travel?', options: [
      ['d1', '1–2 days', '⚡'], ['d2', '3–5 days', '🧳'], ['d3', '6–7 days', '🗺️'], ['d4', 'More than 7 days', '✈️']] },
    { key: 'region', title: 'Which destination region do you prefer?', options: [
      ['Tamil Nadu', 'Tamil Nadu', '🛕'], ['Kerala', 'Kerala', '🌴'], ['South India', 'South India', '🧭'],
      ['North India', 'North India', '🏞️'], ['Northeast India', 'Northeast India', '☁️'], ['Any', 'Any location in India', '🇮🇳']] }
  ];
  const answers = {};
  let step = 0, dir = 1;

  function renderStep() {
    const q = QUESTIONS[step];
    $('#stepLabel').textContent = `Question ${step + 1} of ${QUESTIONS.length}`;
    $('#qTitle').textContent = q.title;
    $('#progressBar').style.width = `${(step / QUESTIONS.length) * 100}%`;
    $('#qError').hidden = true;
    // Stepper: completed steps are clickable, future steps are locked
    $('#stepper').innerHTML = QUESTIONS.map((_, i) =>
      `<li class="${i < step ? 'done' : i === step ? 'current' : ''}" data-i="${i}">${i < step ? '✓' : i + 1}</li>`).join('');
    $('#stepper').querySelectorAll('li.done').forEach(li => {
      li.onclick = () => { dir = -1; step = +li.dataset.i; renderStep(); };
    });
    // Re-trigger slide animation on title and options
    const title = $('#qTitle');
    title.classList.remove('slide-l', 'slide-r'); void title.offsetWidth;
    title.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
    const box = $('#options');
    box.className = 'options ' + (dir > 0 ? 'from-r' : 'from-l');
    box.innerHTML = '';
    q.options.forEach(([val, label, icon], idx) => {
      const b = document.createElement('button');
      b.style.setProperty('--i', idx);
      b.className = 'opt'; b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(answers[q.key] === val));
      b.innerHTML = `<span class="ico" aria-hidden="true">${icon}</span><span class="lbl">${label}</span>`;
      b.onclick = () => {
        answers[q.key] = val;
        box.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        $('#qError').hidden = true;
      };
      box.appendChild(b);
    });
    $('#prevBtn').style.visibility = step ? 'visible' : 'hidden';
    $('#nextBtn').textContent = step === QUESTIONS.length - 1 ? 'Show my destinations 🌿' : 'Next →';
  }

  function onNext() {
    if (!answers[QUESTIONS[step].key]) { $('#qError').hidden = false; return; }   // validation
    if (step < QUESTIONS.length - 1) { dir = 1; step++; renderStep(); }
    else { $('#progressBar').style.width = '100%'; showResults(); }
  }

  /* ---------- Recommendations ---------- */
  // Replace this function to plug in another recommender (e.g. collaborative filtering).
  async function fetchRecommendations(payload) {
    const res = await fetch(API.recommend, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The server could not create recommendations.');
    return data.results;
  }

  async function showResults() {
    const sec = $('#results'), grid = $('#resultsGrid'), msg = $('#resultsMsg');
    sec.hidden = false; grid.innerHTML = ''; msg.hidden = true; $('#loader').hidden = false;
    $('#resultsSub').textContent = '';
    sec.scrollIntoView({ behavior: 'smooth' });
    try {
      const [results] = await Promise.all([fetchRecommendations(answers), new Promise(r => setTimeout(r, 900))]);
      $('#loader').hidden = true;
      if (!results.length) {
        msg.hidden = false;
        msg.innerHTML = '<strong>No destinations matched all your answers.</strong><p>Try a higher budget, a different region, or "Any season" and start over.</p>';
        return;
      }
      $('#resultsSub').textContent = `${results.length} destination${results.length > 1 ? 's' : ''} ranked by how closely they fit your answers.`;
      results.forEach(r => grid.appendChild(card(r, true)));
      $('#resultsTitle').focus({ preventScroll: true });
    } catch (e) {
      $('#loader').hidden = true; msg.hidden = false;
      msg.innerHTML = `<strong>Something went wrong.</strong><p>${esc(e.message)} Check that the Flask server is running, then try again.</p>`;
    }
  }

  /* ---------- Cards ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const favs = new Set(JSON.parse(localStorage.getItem('pg-favs') || '[]'));

  function card(d, full) {
    const el = document.createElement('article');
    el.className = 'card';
    const maps = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`;
    el.innerHTML = `
      <div class="card-img">
        <img src="${esc(d.image)}" alt="${esc(d.name)}, ${esc(d.state)}" loading="lazy">
        ${full && d.match ? `<span class="badge" title="Preference match score, not a probability">${d.match}% match</span>` : ''}
        <button class="fav" aria-label="Save ${esc(d.name)} to favourites" aria-pressed="${favs.has(d.name)}">${favs.has(d.name) ? '♥' : '♡'}</button>
      </div>
      <div class="card-body">
        <h3>${esc(d.name)}</h3><p class="state">${esc(d.state)}</p>
        <p>${esc(d.description)}</p>
        <dl class="facts">
          <div><dt>Est. budget</dt><dd>₹${d.budget.toLocaleString('en-IN')}</dd></div>
          <div><dt>Best season</dt><dd>${esc(d.season)}</dd></div>
          <div><dt>Duration</dt><dd>${esc(d.duration)}</dd></div>
          <div><dt>Category</dt><dd>${esc(d.category)}</dd></div>
        </dl>
        ${full && d.why ? `<p class="why-match">${esc(d.why)}</p>` : ''}
        <p class="more"><strong>Things to do:</strong> ${esc(d.activities)}</p>
        <div class="card-actions">
          <button class="btn more-btn" aria-expanded="false">Explore More</button>
          <a class="maps" href="${maps}" target="_blank" rel="noopener">View on Google Maps</a>
        </div>
      </div>`;
    const img = $('img', el);
    img.onerror = () => img.remove();                       // gradient fallback shows through
    $('.more-btn', el).onclick = e => {
      const open = el.classList.toggle('open');
      e.target.setAttribute('aria-expanded', open); e.target.textContent = open ? 'Show less' : 'Explore More';
    };
    $('.fav', el).onclick = e => {
      favs.has(d.name) ? favs.delete(d.name) : favs.add(d.name);
      try { localStorage.setItem('pg-favs', JSON.stringify([...favs])); } catch (_) {}
      e.currentTarget.setAttribute('aria-pressed', favs.has(d.name));
      e.currentTarget.textContent = favs.has(d.name) ? '♥' : '♡';
    };
    return el;
  }

  async function loadExplore() {
    const grid = $('#exploreGrid');
    try {
      const res = await fetch(API.destinations);
      if (!res.ok) throw new Error();
      (await res.json()).slice(0, 9).forEach(d => grid.appendChild(card(d, false)));
    } catch (_) {
      grid.innerHTML = '<p class="notice" style="color:#234B36;background:#fff">Destinations will appear once the Flask server is running.</p>';
    }
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    initSlideshow(); renderStep(); loadExplore();
    $('#year').textContent = new Date().getFullYear();
    $('#nextBtn').onclick = onNext;
    $('#prevBtn').onclick = () => { if (step) { dir = -1; step--; renderStep(); } };
    $('#restartBtn').onclick = () => {
      Object.keys(answers).forEach(k => delete answers[k]); step = 0; renderStep();
      $('#results').hidden = true; $('#quiz').scrollIntoView({ behavior: 'smooth' });
    };
    const nav = $('#nav'), toggle = $('.nav-toggle'), links = $('.nav-links');
    addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 60), { passive: true });
    toggle.onclick = () => { const o = links.classList.toggle('open'); toggle.setAttribute('aria-expanded', o); };
    links.onclick = () => links.classList.remove('open');
  });
})();