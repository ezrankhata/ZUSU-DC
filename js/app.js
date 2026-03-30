(async () => {
  let manifest = null;
  let currentAlbum = null;
  let lightboxIndex = 0;
  let lightboxImages = [];

  // ── Load manifest ──────────────────────────────────────────────
  try {
    const res = await fetch('data/manifest.json');
    manifest = await res.json();
  } catch (e) {
    console.error('Failed to load manifest', e);
    return;
  }

  const isPlaceholder = manifest.baseUrl.includes('PLACEHOLDER');
  if (isPlaceholder) {
    document.querySelector('.config-notice').classList.add('show');
  }

  // ── Build stats ────────────────────────────────────────────────
  const totalImages = manifest.albums.reduce((s, a) => s + a.images.length, 0);
  document.getElementById('stat-total').textContent = totalImages;
  document.getElementById('stat-albums').textContent = manifest.albums.length;

  // ── Build tabs + panels ────────────────────────────────────────
  const tabsEl = document.getElementById('album-tabs');
  const panelsEl = document.getElementById('album-panels');

  manifest.albums.forEach((album, i) => {
    // Tab
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.dataset.id = album.id;
    btn.innerHTML = `${album.title} <span class="count-badge">${album.images.length}</span>`;
    btn.addEventListener('click', () => switchTab(album.id));
    tabsEl.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'album-panel' + (i === 0 ? ' active' : '');
    panel.id = 'panel-' + album.id;
    panel.innerHTML = `
      <div class="album-header">
        <h2 class="album-title">${album.title} <span>(${album.images.length} photos)</span></h2>
        <div class="album-actions">
          <button class="btn btn-outline" onclick="downloadAll('${album.id}')">
            ⬇ Download All
          </button>
        </div>
      </div>
      <div class="gallery-grid" id="grid-${album.id}"></div>
    `;
    panelsEl.appendChild(panel);
  });

  // Render first album immediately
  renderAlbum(manifest.albums[0]);

  // ── Switch tab ─────────────────────────────────────────────────
  function switchTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.id === id));
    document.querySelectorAll('.album-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
    const album = manifest.albums.find(a => a.id === id);
    if (!document.getElementById('grid-' + id).hasChildNodes()) renderAlbum(album);
    currentAlbum = album;
  }

  // ── Render album grid ──────────────────────────────────────────
  function renderAlbum(album) {
    const grid = document.getElementById('grid-' + album.id);
    if (grid.hasChildNodes()) return;
    currentAlbum = album;

    album.images.forEach((name, idx) => {
      const url = `${manifest.baseUrl}/${album.folder}/${name}`;
      const card = document.createElement('div');
      card.className = 'img-card';
      card.innerHTML = `
        <div class="img-thumb-wrap">
          <div class="img-skeleton"></div>
          <img class="img-thumb" loading="lazy" alt="${name}">
          <div class="img-overlay">
            <div class="overlay-actions">
              <button class="overlay-btn overlay-btn-view" onclick="openLightbox('${album.id}',${idx})">
                🔍 View
              </button>
              <a class="overlay-btn overlay-btn-dl" href="${url}" download="${name}" onclick="event.stopPropagation()">
                ⬇ Save
              </a>
            </div>
          </div>
        </div>
        <div class="img-info">
          <div class="img-name">${name}</div>
        </div>
      `;

      // Lazy-load image; remove skeleton when loaded
      const img = card.querySelector('.img-thumb');
      const skeleton = card.querySelector('.img-skeleton');
      img.onload = () => skeleton.remove();
      img.onerror = () => {
        skeleton.style.background = '#ece8f5';
        skeleton.style.animation = 'none';
        skeleton.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.75rem;">Not loaded</div>';
      };
      img.src = url;

      card.querySelector('.img-thumb-wrap').addEventListener('click', () => openLightbox(album.id, idx));
      grid.appendChild(card);
    });
  }

  // ── Lightbox ───────────────────────────────────────────────────
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbName = document.getElementById('lb-name');
  const lbCounter = document.getElementById('lb-counter');

  window.openLightbox = (albumId, idx) => {
    const album = manifest.albums.find(a => a.id === albumId);
    lightboxImages = album.images.map(n => ({
      url: `${manifest.baseUrl}/${album.folder}/${n}`,
      name: n
    }));
    lightboxIndex = idx;
    showLbImage();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  function showLbImage() {
    const item = lightboxImages[lightboxIndex];
    lbImg.src = item.url;
    lbName.textContent = item.name;
    lbCounter.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    document.getElementById('lb-dl').href = item.url;
    document.getElementById('lb-dl').download = item.name;
  }

  window.lbPrev = () => {
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    showLbImage();
  };

  window.lbNext = () => {
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    showLbImage();
  };

  window.closeLightbox = () => {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  };

  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') lbPrev();
    if (e.key === 'ArrowRight') lbNext();
    if (e.key === 'Escape') closeLightbox();
  });

  // Touch swipe support
  let touchStartX = 0;
  lb.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) dx < 0 ? lbNext() : lbPrev();
  });

  // ── Download All ───────────────────────────────────────────────
  const toast = document.getElementById('dl-toast');

  window.downloadAll = async (albumId) => {
    const album = manifest.albums.find(a => a.id === albumId);
    if (!album) return;

    toast.querySelector('.dl-text').textContent = `Starting download of ${album.images.length} images...`;
    toast.classList.add('show');

    // Sequential download with small delay to avoid browser throttling
    for (let i = 0; i < album.images.length; i++) {
      const name = album.images[i];
      const url = `${manifest.baseUrl}/${album.folder}/${name}`;
      toast.querySelector('.dl-text').textContent = `Downloading ${i + 1} / ${album.images.length}...`;

      await new Promise(resolve => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(resolve, 300);
      });
    }

    toast.querySelector('.dl-text').textContent = `Done! ${album.images.length} images downloaded.`;
    toast.querySelector('.dl-spinner').style.display = 'none';
    setTimeout(() => {
      toast.classList.remove('show');
      toast.querySelector('.dl-spinner').style.display = '';
    }, 3000);
  };

})();
