(async () => {
  const manifest = await fetch('data/manifest.json').then(r => r.json());
  const baseUrl = manifest.baseUrl;

  // Flatten all albums into one array
  const allPhotos = [];
  manifest.albums.forEach(album => {
    album.images.forEach(name => {
      allPhotos.push({ name, url: `${baseUrl}/${album.folder}/${name}` });
    });
  });

  let visible = [...allPhotos];

  // Stats
  document.getElementById('photo-count').textContent = allPhotos.length + ' photos';

  // Build grid
  const grid = document.getElementById('photo-grid');

  function buildGrid(photos) {
    grid.innerHTML = '';
    document.getElementById('no-results').style.display = photos.length ? 'none' : 'block';

    photos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'photo-item';
      item.dataset.idx = idx;

      const img = document.createElement('img');
      img.alt = photo.name;
      img.loading = 'lazy';

      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const dlBtn = document.createElement('button');
      dlBtn.className = 'overlay-dl';
      dlBtn.textContent = '\u2659 Download';
      dlBtn.addEventListener('click', e => {
        e.stopPropagation();
        triggerDownload(photo.url, photo.name);
      });
      overlay.appendChild(dlBtn);

      item.appendChild(img);
      item.appendChild(overlay);
      item.addEventListener('click', () => openLightbox(idx));
      grid.appendChild(item);

      // Use IntersectionObserver for lazy load
      observer.observe(item);
    });
  }

  // IntersectionObserver — loads image when tile enters viewport
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const item = entry.target;
      const idx = parseInt(item.dataset.idx);
      const photo = visible[idx];
      const img = item.querySelector('img');
      if (img.src) return;
      img.onload = () => item.classList.add('loaded');
      img.onerror = () => { item.classList.add('loaded'); img.style.display = 'none'; };
      img.src = photo.url;
      observer.unobserve(item);
    });
  }, { rootMargin: '200px' });

  buildGrid(allPhotos);

  // Search
  document.getElementById('search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    visible = q ? allPhotos.filter(p => p.name.toLowerCase().includes(q)) : [...allPhotos];
    buildGrid(visible);
  });

  // Download all
  document.getElementById('btn-download-all').addEventListener('click', async () => {
    showToast('Starting download of ' + allPhotos.length + ' photos...');
    for (let i = 0; i < allPhotos.length; i++) {
      showToast('Downloading ' + (i + 1) + ' / ' + allPhotos.length + '...');
      await triggerDownload(allPhotos[i].url, allPhotos[i].name);
      await new Promise(r => setTimeout(r, 250));
    }
    showToast('Done! All photos downloaded.');
  });

  async function triggerDownload(url, name) {
    showToast('Saving photo...');
    try {
      // Try fetch-as-blob first (works when CORS is enabled)
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast('Photo saved!');
    } catch (e) {
      // Fallback: load into canvas and download from there
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url + '?t=' + Date.now(); });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl; a.download = name;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          showToast('Photo saved!');
        }, 'image/jpeg', 0.95);
      } catch (e2) {
        showToast('Right-click the photo and choose "Save image as"');
      }
    }
  }

  // Toast
  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  // Lightbox
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbName = document.getElementById('lb-name');
  const lbCounter = document.getElementById('lb-counter');
  const lbDl = document.getElementById('lb-download');
  const lbSpinner = document.getElementById('lb-spinner');
  let currentIdx = 0;

  function openLightbox(idx) {
    currentIdx = idx;
    showLbPhoto();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function showLbPhoto() {
    const photo = visible[currentIdx];
    lbImg.style.opacity = '0';
    lbSpinner.classList.add('show');
    lbName.textContent = photo.name;
    lbCounter.textContent = (currentIdx + 1) + ' / ' + visible.length;
    lbDl.href = photo.url;
    lbDl.download = photo.name;
    const tmp = new Image();
    tmp.onload = tmp.onerror = () => {
      lbImg.src = photo.url;
      lbImg.style.opacity = '1';
      lbSpinner.classList.remove('show');
    };
    tmp.src = photo.url;
  }

  document.getElementById('lb-close').addEventListener('click', closeLb);
  document.getElementById('lb-backdrop').addEventListener('click', closeLb);
  document.getElementById('lb-prev').addEventListener('click', () => { currentIdx = (currentIdx - 1 + visible.length) % visible.length; showLbPhoto(); });
  document.getElementById('lb-next').addEventListener('click', () => { currentIdx = (currentIdx + 1) % visible.length; showLbPhoto(); });

  function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }

  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') { currentIdx = (currentIdx - 1 + visible.length) % visible.length; showLbPhoto(); }
    if (e.key === 'ArrowRight') { currentIdx = (currentIdx + 1) % visible.length; showLbPhoto(); }
    if (e.key === 'Escape') closeLb();
  });

  // Touch swipe
  let tx = 0;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) { dx < 0 ? (currentIdx = (currentIdx + 1) % visible.length) : (currentIdx = (currentIdx - 1 + visible.length) % visible.length); showLbPhoto(); }
  });

})();
