(async () => {
  const manifest = await fetch('data/manifest.json').then(r => r.json());
  const baseUrl = manifest.baseUrl;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Flatten all photos
  const allPhotos = [];
  manifest.albums.forEach(album => {
    album.images.forEach(name => {
      allPhotos.push({ name, url: baseUrl + '/' + album.folder + '/' + name });
    });
  });

  // Split into 3 equal batches
  const batchSize = Math.ceil(allPhotos.length / 3);
  const batches = [
    allPhotos.slice(0, batchSize),
    allPhotos.slice(batchSize, batchSize * 2),
    allPhotos.slice(batchSize * 2)
  ];

  let activeBatch = 0;
  let visible = batches[0].slice();

  // Update batch button labels with counts
  document.querySelectorAll('.batch-btn').forEach(function(btn) {
    const i = parseInt(btn.dataset.batch);
    btn.textContent = 'Batch ' + (i + 1) + ' (' + batches[i].length + ' photos)';
    btn.addEventListener('click', function() {
      document.querySelectorAll('.batch-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeBatch = i;
      visible = batches[i].slice();
      buildGrid(visible);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.getElementById('photo-count').textContent = allPhotos.length + ' photos';

  // Grid
  const grid = document.getElementById('photo-grid');

  function buildGrid(photos) {
    grid.innerHTML = '';
    document.getElementById('no-results').style.display = photos.length ? 'none' : 'block';
    photos.forEach(function(photo, idx) {
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
      dlBtn.textContent = isIOS ? 'Save to Photos' : 'Download';
      dlBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        triggerDownload(photo.url, photo.name);
      });
      overlay.appendChild(dlBtn);

      item.appendChild(img);
      item.appendChild(overlay);
      item.addEventListener('click', function() { openLightbox(idx); });
      grid.appendChild(item);
      observer.observe(item);
    });
  }

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      const item = entry.target;
      const photo = visible[parseInt(item.dataset.idx)];
      const img = item.querySelector('img');
      if (img.src) return;
      img.onload = function() { item.classList.add('loaded'); };
      img.onerror = function() { item.classList.add('loaded'); img.style.display = 'none'; };
      img.src = photo.url;
      observer.unobserve(item);
    });
  }, { rootMargin: '300px' });

  buildGrid(visible);


  // Download — iOS saves to Photos via Web Share API
  async function triggerDownload(url, name) {
    showToast('Saving...');
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();

      if (isIOS && navigator.canShare) {
        const file = new File([blob], name, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          showToast('Saved to Photos!');
          return;
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 2000);
      showToast('Photo saved!');
    } catch (e) {
      if (isIOS) {
        window.open(url, '_blank');
        showToast('Long press image and tap Save to Photos');
      } else {
        showToast('Right-click the photo and choose Save image as');
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
    toastTimer = setTimeout(function() { t.classList.remove('show'); }, 3000);
  }

  // Lightbox
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbName = document.getElementById('lb-name');
  const lbCounter = document.getElementById('lb-counter');
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
    const tmp = new Image();
    tmp.onload = tmp.onerror = function() {
      lbImg.src = photo.url;
      lbImg.style.opacity = '1';
      lbSpinner.classList.remove('show');
    };
    tmp.src = photo.url;
    document.getElementById('lb-download').onclick = function(e) {
      e.preventDefault();
      triggerDownload(photo.url, photo.name);
    };
  }

  document.getElementById('lb-close').addEventListener('click', closeLb);
  document.getElementById('lb-backdrop').addEventListener('click', closeLb);
  document.getElementById('lb-prev').addEventListener('click', function() { currentIdx = (currentIdx - 1 + visible.length) % visible.length; showLbPhoto(); });
  document.getElementById('lb-next').addEventListener('click', function() { currentIdx = (currentIdx + 1) % visible.length; showLbPhoto(); });

  function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; }

  document.addEventListener('keydown', function(e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') { currentIdx = (currentIdx - 1 + visible.length) % visible.length; showLbPhoto(); }
    if (e.key === 'ArrowRight') { currentIdx = (currentIdx + 1) % visible.length; showLbPhoto(); }
    if (e.key === 'Escape') closeLb();
  });

  let tx = 0;
  lb.addEventListener('touchstart', function(e) { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) {
      currentIdx = dx < 0 ? (currentIdx + 1) % visible.length : (currentIdx - 1 + visible.length) % visible.length;
      showLbPhoto();
    }
  });

})();
