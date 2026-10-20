/**
 * 永貞國小114跨領域美感教育成果展 - 前端核心交互控制器 3.0 (RWD & Touch Enhanced)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 初始化資料庫（雙重備援：支援 window.EXHIBIT_DATA 或 fetch 載入）
  let exhibitData = window.EXHIBIT_DATA || null;
  let allWorks = (exhibitData && exhibitData.gallery) ? exhibitData.gallery : [];

  if (allWorks.length === 0) {
    try {
      const res = await fetch('assets/gallery_catalog.json');
      if (res.ok) {
        allWorks = await res.json();
      }
    } catch (e) {
      console.warn('Fallback fetch failed, waiting for script load:', e);
    }
  }
  
  // 狀態管理
  let currentMasterHub = 'all';
  let currentFilter = 'all';
  let searchQuery = '';
  let filteredWorks = [...allWorks];
  let displayedCount = 0;
  const BATCH_SIZE = 24;
  let currentLightboxIndex = -1;
  let isZoomed = false;

  // 大分類聚合映射 (Master Hub Mapping)
  const masterHubMappings = {
    all: null, // 全部
    spotlight: ['poster', 'fb_showcase', 'fb_season_sharing', 'exhibit_day', 'exhibit_prep'],
    geometry: ['mondrian', 'tetrahedron', 'lamp3d', 'lampshade_build', 'light_shadow'],
    heritage: ['printmaking', 'printmaking_color', 'signing', 'classroom_sel'],
    explore: ['picasso', 'flowers', 'flowers_show', 'tfam', 'activity_log']
  };

  // DOM 元素快取
  const galleryGrid = document.getElementById('gallery-grid');
  const masterTabs = document.querySelectorAll('.master-tab-btn');
  const filterChipsContainer = document.getElementById('gallery-filter-chips');
  const searchInput = document.getElementById('gallery-search-input');
  const visibleCountEl = document.getElementById('visible-count');
  const totalCountEl = document.getElementById('total-count');
  const remainingCountEl = document.getElementById('remaining-count');
  const btnLoadMore = document.getElementById('btn-load-more');
  const loadMoreContainer = document.getElementById('load-more-container');
  const scrollProgressBar = document.getElementById('scroll-progress-bar');
  const backToTopBtn = document.getElementById('back-to-top-btn');

  // 手機版漢堡選單 DOM
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileDrawerClose = document.getElementById('mobile-drawer-close');
  const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
  const mobileNavBackdrop = document.getElementById('mobile-nav-backdrop');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  // Lightbox DOM
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxViewport = document.getElementById('lightbox-viewport');
  const lightboxMainImg = document.getElementById('lightbox-main-img');
  const lightboxTitle = document.getElementById('lightbox-art-title');
  const lightboxDesc = document.getElementById('lightbox-art-desc');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxDownloadLink = document.getElementById('lightbox-download-link');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxPrevBtn = document.getElementById('lightbox-prev');
  const lightboxNextBtn = document.getElementById('lightbox-next');
  const lightboxZoomToggle = document.getElementById('lightbox-zoom-toggle');

  // 影片播放器 DOM
  const mainVideoPlayer = document.getElementById('main-video-player');
  const playlistItems = document.querySelectorAll('.playlist-item');

  // 主題與音效
  const themeToggle = document.getElementById('theme-toggle');
  const soundToggle = document.getElementById('sound-toggle');
  let audioCtx = null;
  let isSoundEnabled = false;

  // 2. 手機版導覽抽屜 (Mobile Nav Drawer Control)
  function openMobileMenu() {
    mobileNavDrawer.classList.add('active');
    mobileNavBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    playChime(587.33, 0.1);
  }

  function closeMobileMenu() {
    mobileNavDrawer.classList.remove('active');
    mobileNavBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
  if (mobileDrawerClose) mobileDrawerClose.addEventListener('click', closeMobileMenu);
  if (mobileNavBackdrop) mobileNavBackdrop.addEventListener('click', closeMobileMenu);

  mobileNavLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeMobileMenu();
    });
  });

  // 3. 閱讀進度條與回到頂部監聽
  window.addEventListener('scroll', () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = (window.scrollY / docHeight) * 100;
    if (scrollProgressBar) {
      scrollProgressBar.style.width = `${Math.min(100, Math.max(0, scrolled))}%`;
    }

    if (backToTopBtn) {
      if (window.scrollY > 400) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }

    // 導航列高斯模糊強化
    const navbar = document.getElementById('navbar');
    if (navbar) {
      if (window.scrollY > 40) {
        navbar.style.background = 'var(--bg-glass-strong)';
        navbar.style.boxShadow = 'var(--shadow-sm)';
      } else {
        navbar.style.background = 'var(--bg-glass)';
        navbar.style.boxShadow = 'none';
      }
    }

    // 導航滾動監聽高亮 (Scrollspy)
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav-link-item, .mobile-nav-link');
    let currentId = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 140;
      if (window.scrollY >= top) {
        currentId = sec.getAttribute('id');
      }
    });
    navLinks.forEach(link => {
      if (link.getAttribute('href') === `#${currentId}`) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }, { passive: true });

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      playChime(659.25, 0.1);
    });
  }

  // 4. 生成與切換分類標籤
  const categoryMasterDefinitions = [
    { id: 'all', name: '全部展品' },
    { id: 'poster', name: '展覽主視覺', hub: 'spotlight' },
    { id: 'fb_showcase', name: '卓越領航小發表(FB)', hub: 'spotlight' },
    { id: 'fb_season_sharing', name: '美感教育季分享(FB)', hub: 'spotlight' },
    { id: 'exhibit_day', name: '成果展盛況', hub: 'spotlight' },
    { id: 'exhibit_prep', name: '籌備與布展', hub: 'spotlight' },
    { id: 'mondrian', name: '蒙德里安窗花', hub: 'geometry' },
    { id: 'tetrahedron', name: '謝爾賓斯基夜燈', hub: 'geometry' },
    { id: 'lamp3d', name: '卡典西德立體燈罩', hub: 'geometry' },
    { id: 'lampshade_build', name: '燈罩組裝歷程', hub: 'geometry' },
    { id: 'light_shadow', name: '窗櫺光影顯色', hub: 'geometry' },
    { id: 'printmaking', name: '蘆竹湳色紙版畫', hub: 'heritage' },
    { id: 'printmaking_color', name: '版畫拓印作品', hub: 'heritage' },
    { id: 'signing', name: '作家簽名落款', hub: 'heritage' },
    { id: 'classroom_sel', name: 'SEL情緒對話', hub: 'heritage' },
    { id: 'picasso', name: '畢卡索立體派', hub: 'explore' },
    { id: 'flowers', name: '畢業感恩花束', hub: 'explore' },
    { id: 'flowers_show', name: '花束作品合影', hub: 'explore' },
    { id: 'tfam', name: '北美館校外走讀', hub: 'explore' },
    { id: 'activity_log', name: '教學活動紀錄', hub: 'explore' }
  ];

  function renderSubCategoryChips() {
    const categoryCounts = {};
    allWorks.forEach(work => {
      categoryCounts[work.categoryId] = (categoryCounts[work.categoryId] || 0) + 1;
    });

    filterChipsContainer.innerHTML = '';

    const relevantCats = categoryMasterDefinitions.filter(cat => {
      if (cat.id === 'all') return true;
      if (currentMasterHub === 'all') return true;
      return cat.hub === currentMasterHub;
    });

    relevantCats.forEach(cat => {
      let count = (cat.id === 'all') ? allWorks.length : (categoryCounts[cat.id] || 0);
      if (count === 0 && cat.id !== 'all') return;

      const chip = document.createElement('button');
      chip.className = `filter-chip ${cat.id === currentFilter ? 'active' : ''}`;
      chip.dataset.category = cat.id;
      chip.innerHTML = `
        <span>${cat.name}</span>
        <span class="chip-count">${count}</span>
      `;

      chip.addEventListener('click', () => {
        currentFilter = cat.id;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        playChime(440, 0.1);
        applyFiltersAndRender(true);
      });

      filterChipsContainer.appendChild(chip);
    });
  }

  // 大分類切換事件
  masterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      masterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMasterHub = tab.dataset.hub;
      currentFilter = 'all';
      renderSubCategoryChips();
      playChime(523.25, 0.12);
      applyFiltersAndRender(true);
    });
  });

  // 5. 篩選與搜尋處理
  function applyFiltersAndRender(reset = false) {
    if (reset) {
      displayedCount = 0;
      galleryGrid.innerHTML = '';
    }

    const query = searchQuery.trim().toLowerCase();
    const validCategoriesInHub = masterHubMappings[currentMasterHub];

    filteredWorks = allWorks.filter(item => {
      if (validCategoriesInHub && !validCategoriesInHub.includes(item.categoryId)) {
        return false;
      }
      if (currentFilter !== 'all' && item.categoryId !== currentFilter) {
        return false;
      }
      if (query) {
        const match = item.title.toLowerCase().includes(query) ||
          item.categoryTag.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.categoryName.toLowerCase().includes(query) ||
          item.folder.toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    });

    totalCountEl.textContent = filteredWorks.length;
    renderNextBatch();
  }

  // 6. 分批渲染展品
  function renderNextBatch() {
    const start = displayedCount;
    const end = Math.min(displayedCount + BATCH_SIZE, filteredWorks.length);
    const batch = filteredWorks.slice(start, end);

    batch.forEach((work, idx) => {
      const globalIndex = start + idx;
      const card = document.createElement('div');
      card.className = 'art-card';
      card.dataset.index = globalIndex;

      card.innerHTML = `
        <div class="art-image-holder">
          <span class="art-tag-badge">${work.categoryTag}</span>
          <img src="${work.relPath}" alt="${work.title}" class="art-thumbnail" loading="lazy">
          ${work.videoRelPath ? '<div class="art-video-badge" style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.78); color:#fff; border-radius:20px; padding:3px 10px; font-size:0.75rem; display:flex; align-items:center; gap:5px; z-index:2; border:1px solid rgba(255,255,255,0.2);">▶ 精彩動態影音</div>' : ''}
          <div class="art-hover-overlay">
            <div class="art-zoom-btn" title="${work.videoRelPath ? '觀看精彩影音' : '鑑賞作品'}">
              ${work.videoRelPath ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>'}
            </div>
          </div>
        </div>
        <div class="art-info-footer">
          <h4 class="art-title" title="${work.title}">${work.title}</h4>
          <p class="art-desc">${work.description}</p>
        </div>
      `;

      card.addEventListener('click', () => {
        if (work.videoRelPath) {
          const cinema = document.getElementById('cinema');
          if (cinema) {
            cinema.scrollIntoView({ behavior: 'smooth' });
            mainVideoPlayer.src = work.videoRelPath;
            mainVideoPlayer.play().catch(() => {});
            playlistItems.forEach(i => {
              if (i.dataset.src === work.videoRelPath) i.classList.add('active');
              else i.classList.remove('active');
            });
            playChime(659.25, 0.15);
            return;
          }
        }
        openLightbox(globalIndex);
      });

      galleryGrid.appendChild(card);
    });

    displayedCount = end;
    visibleCountEl.textContent = displayedCount;
    const remaining = filteredWorks.length - displayedCount;
    remainingCountEl.textContent = remaining;

    if (remaining <= 0) {
      loadMoreContainer.style.display = 'none';
    } else {
      loadMoreContainer.style.display = 'block';
    }
  }

  // 7. 燈箱模態窗功能 (Lightbox with Touch Gestures)
  function openLightbox(index) {
    if (index < 0 || index >= filteredWorks.length) return;
    currentLightboxIndex = index;
    const work = filteredWorks[currentLightboxIndex];

    lightboxMainImg.src = work.relPath;
    lightboxMainImg.alt = work.title;
    lightboxTitle.textContent = work.title;
    lightboxDesc.textContent = `${work.categoryName} · ${work.description}`;
    lightboxCounter.textContent = `${currentLightboxIndex + 1} / ${filteredWorks.length}`;
    lightboxDownloadLink.href = work.relPath;
    lightboxDownloadLink.setAttribute('download', `${work.title}.png`);

    isZoomed = false;
    lightboxMainImg.style.transform = 'scale(1)';

    lightboxModal.classList.add('active');
    lightboxModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    playChime(523.25, 0.12);
  }

  function closeLightbox() {
    lightboxModal.classList.remove('active');
    lightboxModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function nextLightbox() {
    if (currentLightboxIndex < filteredWorks.length - 1) {
      openLightbox(currentLightboxIndex + 1);
    } else {
      openLightbox(0);
    }
  }

  function prevLightbox() {
    if (currentLightboxIndex > 0) {
      openLightbox(currentLightboxIndex - 1);
    } else {
      openLightbox(filteredWorks.length - 1);
    }
  }

  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxNextBtn.addEventListener('click', nextLightbox);
  lightboxPrevBtn.addEventListener('click', prevLightbox);

  lightboxZoomToggle.addEventListener('click', () => {
    isZoomed = !isZoomed;
    lightboxMainImg.style.transform = isZoomed ? 'scale(1.6)' : 'scale(1)';
    lightboxMainImg.style.cursor = isZoomed ? 'zoom-out' : 'zoom-in';
  });

  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal || e.target.id === 'lightbox-viewport') {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!lightboxModal.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextLightbox();
    if (e.key === 'ArrowLeft') prevLightbox();
  });

  // 手機與平板端觸控滑動支援 (Touch Swipe Support)
  let touchStartX = 0;
  let touchStartY = 0;

  if (lightboxViewport) {
    lightboxViewport.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    lightboxViewport.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].screenX;
      const touchEndY = e.changedTouches[0].screenY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
        if (diffX < 0) {
          nextLightbox();
        } else {
          prevLightbox();
        }
      }
    }, { passive: true });
  }

  // Hero 海報點擊直達燈箱
  const heroPosterTrigger = document.getElementById('hero-poster-trigger');
  if (heroPosterTrigger) {
    heroPosterTrigger.addEventListener('click', () => {
      const posterIdx = filteredWorks.findIndex(w => w.categoryId === 'poster');
      if (posterIdx !== -1) {
        openLightbox(posterIdx);
      } else {
        openLightbox(0);
      }
    });
  }

  // 8. 搜尋框即時過濾
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyFiltersAndRender(true);
  });

  // 載入更多按鈕
  btnLoadMore.addEventListener('click', () => {
    playChime(392, 0.08);
    renderNextBatch();
  });

  // 9. 影音播放器切換控制
  playlistItems.forEach(item => {
    item.addEventListener('click', () => {
      playlistItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const src = item.dataset.src;
      mainVideoPlayer.src = src;
      mainVideoPlayer.play().catch(() => {});
      playChime(659.25, 0.15);
    });
  });

  // 10. 亮暗主題切換
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme_preference', isLight ? 'light' : 'dark');
    playChime(isLight ? 783.99 : 329.63, 0.15);
  });

  if (localStorage.getItem('theme_preference') === 'light') {
    document.body.classList.add('light-theme');
  }

  // 11. 琉璃風鈴環境氛圍音 (Web Audio API)
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playChime(freq = 523.25, dur = 0.2) {
    if (!isSoundEnabled) return;
    try {
      initAudio();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.4, audioCtx.currentTime + dur);

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur * 3);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + dur * 3);
    } catch(e) {}
  }

  soundToggle.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    soundToggle.style.color = isSoundEnabled ? 'var(--color-mondrian-yellow)' : '';
    soundToggle.style.borderColor = isSoundEnabled ? 'var(--color-mondrian-yellow)' : '';
    if (isSoundEnabled) {
      initAudio();
      playChime(523.25, 0.2);
    }
  });

  // 啟動首屏藝廊
  renderSubCategoryChips();
  applyFiltersAndRender(true);
});
