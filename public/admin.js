'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const qa = (selector) => [...document.querySelectorAll(selector)];
  const CATEGORY = { bags: '가방', wallets: '지갑·파우치', desk: '데스크', living: '리빙', travel: '트래블' };
  const STATUS = { published: '판매 중', draft: '임시 저장', soldout: '품절', archived: '숨김' };
  const INQUIRY_STATUS = { new: '새 문의', contacted: '연락 완료', closed: '처리 완료' };
  const MAX_IMAGE = 8 * 1024 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const config = window.ENGEDI_SELECT_CONFIG || { mode: 'local' };
  const cloudMode = config.mode === 'cloud';
  let cloud = null, cloudSetupError = '';
  if (cloudMode) {
    try { if (!window.EngediCloud) throw new Error('온라인 연결 파일이 없습니다.'); cloud = window.EngediCloud.create(config.cloud || config); }
    catch (error) { cloudSetupError = error.message; }
  }
  let csrf = '', catalog = { products: [], hero: {} }, inquiries = [], images = [], heroImage = '', busy = false, unsaved = false, activePanel = 'products', statusTimer;

  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const safeImage = (value) => cloud?.safeImage(value) || (typeof value === 'string' && /^\/(?:assets\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp|svg)|uploads\/[a-f0-9]{32}\.jpg)$/.test(value) ? value : '');
  const productImage = (product) => safeImage(Array.isArray(product.images) ? product.images[0] : '');

  function notify(message, error = false) {
    clearTimeout(statusTimer);
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
    $('status').hidden = false;
    statusTimer = setTimeout(() => { $('status').hidden = true; }, error ? 14000 : 6500);
  }

  async function api(path, options = {}) {
    if (cloudMode) {
      if (!cloud) throw new Error(cloudSetupError || '온라인 저장소가 연결되지 않았습니다.');
      try { return await cloud.request(path, options); }
      catch (error) { if (error.status === 401 && path !== '/api/admin/login') showLogin(); throw error; }
    }
    const method = options.method || 'GET';
    const headers = new Headers(options.headers || {});
    if (method !== 'GET' && csrf) headers.set('X-CSRF-Token', csrf);
    let body = options.body;
    if (body && !(body instanceof File) && typeof body !== 'string') { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
    const response = await fetch(path, { ...options, method, headers, body, credentials: 'same-origin', cache: 'no-store' });
    let data;
    try { data = await response.json(); } catch (_) { throw new Error('서버 응답을 확인할 수 없습니다. 서버 실행 상태를 확인해 주세요.'); }
    if (!response.ok) {
      if (response.status === 401 && path !== '/api/admin/login') { showLogin(); csrf = ''; }
      throw new Error(data.error || data.message || `요청을 처리하지 못했습니다. (${response.status})`);
    }
    return data;
  }

  function setBusy(value) {
    busy = value;
    qa('#dashboard button, #dashboard select, #dashboard input, #dashboard textarea').forEach((el) => { el.disabled = value; });
    $('product-fields').disabled = value;
    $('hero-fields').disabled = value;
    $('login-button').disabled = value;
    $('password').disabled = value;
    $('admin-email').disabled = value;
    $('toggle-password').disabled = value;
    if (!value) updateImageLimit();
  }

  async function perform(task, message) {
    if (busy) return;
    setBusy(true);
    try { await task(); if (message) notify(message); } catch (error) { notify(error.message || '처리 중 문제가 발생했습니다.', true); } finally { setBusy(false); }
  }

  function showLogin() { $('login-screen').hidden = false; $('dashboard').hidden = true; }
  function showDashboard() { $('login-screen').hidden = true; $('dashboard').hidden = false; $('connection-notice').hidden = true; }

  function renderStats() {
    const products = catalog.products.filter((p) => p.status !== 'archived');
    $('stat-total').textContent = products.length;
    $('stat-published').textContent = products.filter((p) => ['published', 'soldout'].includes(p.status)).length;
    $('stat-draft').textContent = products.filter((p) => p.status === 'draft').length;
    $('stat-inquiries').textContent = inquiries.filter((q) => q.status === 'new').length;
  }

  function renderProducts() {
    const search = $('product-search').value.trim().toLocaleLowerCase('ko-KR');
    const status = $('status-filter').value, category = $('category-filter').value;
    const filtered = catalog.products.filter((p) => (status === 'archived' ? p.status === 'archived' : p.status !== 'archived'))
      .filter((p) => !search || String(p.name).toLocaleLowerCase('ko-KR').includes(search))
      .filter((p) => status === 'all' || status === 'archived' || (status === 'demo' ? p.demo : p.status === status))
      .filter((p) => category === 'all' || p.category === category);
    $('product-count').textContent = catalog.products.filter((p) => p.status !== 'archived').length;
    $('result-count').textContent = `${filtered.length}개의 상품`;
    $('product-list').innerHTML = filtered.length ? filtered.map((p) => `<article class="product-row">${productImage(p) ? `<img class="product-thumb" src="${escape(productImage(p))}" alt="${escape(p.name)}" loading="lazy">` : '<div class="product-thumb photo-empty">사진 준비 중</div>'}<div class="product-info"><div class="badges"><span class="badge ${escape(p.status)}">${escape(STATUS[p.status] || p.status)}</span>${p.demo ? '<span class="badge demo">예시 상품</span>' : ''}${p.featured ? '<span class="badge">메인 추천</span>' : ''}</div><strong>${escape(p.name)}</strong><div class="product-meta">${escape(CATEGORY[p.category] || p.category)} · 수량 ${Number(p.stock || 0).toLocaleString('ko-KR')}개</div><div class="product-price">${money(p.price)}</div></div><div class="row-actions"><button type="button" class="secondary" data-edit="${escape(p.id)}">${p.status === 'archived' ? '수정·복원' : '수정'}</button><button type="button" class="text-button" data-copy="${escape(p.id)}">복사</button>${p.status !== 'archived' ? `<button type="button" class="text-button archive" data-archive="${escape(p.id)}">숨기기</button>` : ''}</div></article>`).join('') : `<div class="empty-state"><span aria-hidden="true">◇</span><strong>${search || status !== 'all' || category !== 'all' ? '조건에 맞는 상품이 없습니다.' : '첫 번째 셀렉션을 준비해 볼까요?'}</strong><p>${search || status !== 'all' || category !== 'all' ? '검색어나 필터를 변경해 주세요.' : '상품 사진과 소개를 등록하면 컬렉션이 시작됩니다.'}</p>${!catalog.products.length ? '<button type="button" class="secondary" data-first-product>＋ 첫 상품 등록</button>' : ''}</div>`;
    qa('#product-list img').forEach((image) => { image.addEventListener('error', () => { const fallback = document.createElement('div'); fallback.className = 'product-thumb photo-empty'; fallback.textContent = '사진 확인 필요'; image.replaceWith(fallback); }); });
    qa('#product-list button').forEach((button) => { button.disabled = busy; });
  }

  function renderImages() {
    $('photo-count').textContent = `${images.length} / 6`;
    $('image-list').innerHTML = images.map((url, index) => `<div class="image-card"><img src="${escape(url)}" alt="상품 사진 ${index + 1}">${index === 0 ? '<span class="cover-tag">대표 사진</span>' : ''}<div class="image-tools"><span>${String(index + 1).padStart(2, '0')}</span><button type="button" class="text-button" data-image-left="${index}" aria-label="사진 ${index + 1}을 앞으로 이동" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" class="text-button" data-image-right="${index}" aria-label="사진 ${index + 1}을 뒤로 이동" ${index === images.length - 1 ? 'disabled' : ''}>→</button><button type="button" class="text-button" data-image-remove="${index}" aria-label="사진 ${index + 1} 제거">×</button></div></div>`).join('');
    updateImageLimit();
  }

  function updateImageLimit() {
    $('product-images').disabled = busy || images.length >= 6;
    $('image-upload-zone').hidden = images.length >= 6;
    qa('[data-image-left]').forEach((el) => { el.disabled = busy || Number(el.dataset.imageLeft) === 0; });
    qa('[data-image-right]').forEach((el) => { el.disabled = busy || Number(el.dataset.imageRight) === images.length - 1; });
  }

  function discardChanges() { return !unsaved || window.confirm('아직 저장하지 않은 변경 내용이 있습니다. 저장하지 않고 이동할까요?'); }

  function editProduct(product, copy = false) {
    if (busy || !discardChanges()) return;
    $('product-form').reset();
    const p = product || {};
    $('product-id').value = copy ? '' : p.id || '';
    $('editor-title').textContent = product ? (copy ? '상품 복사 · 새 상품' : '상품 수정') : '새 상품 등록';
    $('product-name').value = p.name ? (copy ? `${p.name} (복사)` : p.name) : '';
    $('product-category').value = CATEGORY[p.category] ? p.category : 'bags';
    $('product-price').value = p.price ?? '';
    $('product-stock').value = p.stock ?? 1;
    $('product-status').value = copy || p.status === 'archived' ? 'draft' : p.status || 'draft';
    $('product-material').value = p.material || '';
    $('product-dimensions').value = p.dimensions || '';
    $('product-colors').value = Array.isArray(p.colors) ? p.colors.join(', ') : '';
    $('product-description').value = p.description || '';
    $('product-featured').checked = Boolean(p.featured);
    $('product-demo').checked = Boolean(p.demo);
    images = (Array.isArray(p.images) ? p.images : []).filter(safeImage).slice(0, 6);
    renderImages();
    $('product-form').hidden = false;
    unsaved = copy;
    $('product-form').scrollIntoView({ behavior: 'auto', block: 'start' });
    $('product-name').focus({ preventScroll: true });
  }

  function closeEditor() {
    if (busy || !discardChanges()) return;
    $('product-form').hidden = true;
    unsaved = false;
    $('new-product').focus({ preventScroll: true });
  }

  function setPanel(panel) {
    if (busy || !['products', 'hero', 'inquiries', 'publish'].includes(panel)) return;
    if (panel !== activePanel && !discardChanges()) return;
    if (panel !== activePanel) { unsaved = false; $('product-form').hidden = true; loadHeroFields(); }
    activePanel = panel;
    qa('.workspace-nav button').forEach((button) => { const selected = button.dataset.panel === panel; button.classList.toggle('active', selected); if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    qa('.workspace-content>.panel').forEach((section) => { section.hidden = section.id !== `panel-${panel}`; });
    if (panel === 'inquiries') renderInquiries();
  }

  function loadHeroFields() {
    const hero = catalog.hero || {};
    heroImage = safeImage(hero.image);
    $('hero-title').value = hero.title || '';
    $('hero-subtitle').value = hero.subtitle || '';
    updateHeroPreview();
  }

  function updateHeroPreview() {
    $('hero-preview').hidden = !heroImage;
    $('hero-placeholder').hidden = Boolean(heroImage);
    if (heroImage) $('hero-preview').src = heroImage; else $('hero-preview').removeAttribute('src');
  }

  function renderInquiries() {
    const filter = $('inquiry-filter').value;
    const list = inquiries.filter((q) => filter === 'all' || q.status === filter);
    $('inquiry-list').innerHTML = list.length ? list.map((q) => {
      const date = q.createdAt || q.created_at || q.created;
      const parsed = date ? new Date(typeof date === 'number' && date < 1e12 ? date * 1000 : date) : null;
      const formatted = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const product = catalog.products.find((p) => String(p.id) === String(q.productId || q.product_id));
      const name = q.productName || q.product_name || product?.name;
      const items = Array.isArray(q.items) ? q.items : [];
      const itemLines = items.map((item) => `<li><span>${escape(item.name || '문의 상품')}</span><b>${Number(item.quantity || 0).toLocaleString('ko-KR')}개 · ${money(Number(item.price || 0) * Number(item.quantity || 0))}</b></li>`).join('');
      return `<article class="inquiry-card"><div class="inquiry-top"><div><strong>${escape(q.name || q.customerName || '고객 문의')}</strong>${formatted ? `<time datetime="${escape(parsed.toISOString())}">${escape(formatted)}</time>` : ''}</div><span class="badge ${q.status === 'new' ? 'published' : 'draft'}">${escape(INQUIRY_STATUS[q.status] || q.status)}</span></div><p class="inquiry-contact">${escape(q.contact || q.email || q.phone || '')}</p>${items.length ? `<div class="inquiry-items"><span>문의한 상품 · 접수 당시 정보</span><ul>${itemLines}</ul></div>` : name ? `<p class="inquiry-product">문의 상품 · ${escape(name)}</p>` : ''}<p class="inquiry-message">${escape(q.message || q.content || '')}</p><div class="inquiry-actions">${q.status !== 'new' ? `<button type="button" class="text-button" data-inquiry="${escape(q.id)}" data-state="new">새 문의로 변경</button>` : ''}${q.status !== 'contacted' ? `<button type="button" class="secondary" data-inquiry="${escape(q.id)}" data-state="contacted">연락 완료</button>` : ''}${q.status !== 'closed' ? `<button type="button" class="primary" data-inquiry="${escape(q.id)}" data-state="closed">처리 완료</button>` : ''}</div></article>`;
    }).join('') : '<div class="empty-state"><span aria-hidden="true">↗</span><strong>접수된 문의가 없습니다.</strong><p>고객이 문의를 남기면 이곳에서 확인할 수 있습니다.</p></div>';
    qa('#inquiry-list button').forEach((button) => { button.disabled = busy; });
  }

  async function refreshCatalog() {
    const response = await api('/api/admin/catalog');
    catalog = { products: Array.isArray(response.products) ? response.products : [], hero: response.hero || {} };
    renderProducts(); renderStats();
  }

  async function refreshInquiries() {
    const response = await api('/api/admin/inquiries');
    inquiries = Array.isArray(response) ? response : Array.isArray(response.inquiries) ? response.inquiries : [];
    renderInquiries(); renderStats();
  }

  function validateImage(file) {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error('JPG, PNG, WebP 사진만 등록할 수 있습니다.');
    if (!file.size || file.size > MAX_IMAGE) throw new Error('사진 한 장의 크기는 8MB 이하이어야 합니다.');
  }

  async function uploadImage(file) {
    validateImage(file);
    const result = await api('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    const url = safeImage(result.url);
    if (!url) throw new Error('사진 저장 경로를 확인할 수 없습니다.');
    return url;
  }

  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    perform(async () => {
      const result = await api('/api/admin/login', { method: 'POST', body: { email: $('admin-email').value.trim(), password: $('password').value } });
      csrf = result.csrf || (await api('/api/admin/session')).csrf || '';
      $('password').value = '';
      await Promise.all([refreshCatalog(), refreshInquiries()]);
      loadHeroFields(); showDashboard();
    });
  });
  $('toggle-password').addEventListener('click', () => { const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password'; $('toggle-password').textContent = show ? '숨기기' : '보기'; $('toggle-password').setAttribute('aria-pressed', String(show)); $('toggle-password').setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 표시'); });
  $('logout').addEventListener('click', () => { if (busy || !discardChanges()) return; perform(async () => { await api('/api/admin/logout', { method: 'POST', body: {} }); csrf = ''; unsaved = false; showLogin(); notify('로그아웃했습니다.'); }); });
  qa('.workspace-nav button').forEach((button) => button.addEventListener('click', () => setPanel(button.dataset.panel)));
  $('new-product').addEventListener('click', () => editProduct());
  $('cancel-product').addEventListener('click', closeEditor);
  $('close-editor').addEventListener('click', closeEditor);
  ['product-search', 'status-filter', 'category-filter'].forEach((id) => $(id).addEventListener(id === 'product-search' ? 'input' : 'change', () => { if (!busy) renderProducts(); }));
  $('product-form').addEventListener('input', () => { unsaved = true; });
  $('hero-form').addEventListener('input', () => { unsaved = true; });
  $('product-list').addEventListener('click', async (event) => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.hasAttribute('data-first-product')) return editProduct();
    const id = button.dataset.edit || button.dataset.copy || button.dataset.archive;
    const product = catalog.products.find((p) => String(p.id) === id); if (!product) return;
    if (button.dataset.edit) return editProduct(product);
    if (button.dataset.copy) return editProduct(product, true);
    if (!discardChanges()) return;
    const dialog = $('confirm-dialog'); dialog.returnValue = 'cancel'; dialog.showModal();
    dialog.addEventListener('close', () => { if (dialog.returnValue !== 'confirm') return; perform(async () => { await api(`/api/admin/product/${encodeURIComponent(product.id)}`, { method: 'DELETE' }); if ($('product-id').value === String(product.id)) { $('product-form').hidden = true; unsaved = false; } await refreshCatalog(); }, '상품을 숨겼습니다. 기존 정보는 보관됩니다.'); }, { once: true });
  });
  $('image-list').addEventListener('click', (event) => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.hasAttribute('data-image-remove')) images.splice(Number(button.dataset.imageRemove), 1);
    else if (button.hasAttribute('data-image-left')) { const i = Number(button.dataset.imageLeft); if (i > 0) [images[i - 1], images[i]] = [images[i], images[i - 1]]; }
    else if (button.hasAttribute('data-image-right')) { const i = Number(button.dataset.imageRight); if (i < images.length - 1) [images[i + 1], images[i]] = [images[i], images[i + 1]]; }
    unsaved = true; renderImages();
  });
  $('product-images').addEventListener('change', () => {
    const files = [...$('product-images').files];
    if (!files.length) return;
    if (images.length + files.length > 6) { notify('사진은 최대 6장까지 등록할 수 있습니다.', true); $('product-images').value = ''; return; }
    try { files.forEach(validateImage); } catch (error) { notify(error.message, true); $('product-images').value = ''; return; }
    perform(async () => { for (const file of files) { images.push(await uploadImage(file)); unsaved = true; renderImages(); } }, '사진을 저장했습니다. 상품 저장을 눌러 등록을 마무리하세요.').finally(() => { $('product-images').value = ''; renderImages(); });
  });
  $('product-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const status = $('product-status').value;
    if (status === 'published' && !images.length) return notify('공개할 상품의 사진을 1장 이상 등록해 주세요.', true);
    const price = Number($('product-price').value), stock = Number($('product-stock').value);
    if (!Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(stock) || stock < 0) return notify('가격과 수량은 0 이상의 정수로 입력해 주세요.', true);
    if (status === 'published' && stock < 1) return notify('판매 중인 상품은 수량을 1개 이상 입력해 주세요.', true);
    if (status === 'soldout' && stock !== 0) return notify('품절로 처리하려면 판매 수량을 0으로 입력해 주세요.', true);
    const payload = { name: $('product-name').value.trim(), category: $('product-category').value, price, stock, status, images: [...images], material: $('product-material').value.trim(), dimensions: $('product-dimensions').value.trim(), colors: $('product-colors').value.split(',').map((v) => v.trim()).filter(Boolean), description: $('product-description').value.trim(), featured: $('product-featured').checked, demo: $('product-demo').checked };
    if ($('product-id').value) payload.id = Number($('product-id').value);
    perform(async () => { const result = await api('/api/admin/product', { method: 'POST', body: payload }); unsaved = false; $('product-id').value = result.product?.id || payload.id || ''; await refreshCatalog(); $('product-form').hidden = true; $('new-product').focus({ preventScroll: true }); }, '상품을 저장했습니다. 스토어 미리보기에서 확인하세요.');
  });
  $('hero-image-file').addEventListener('change', () => { const file = $('hero-image-file').files[0]; if (!file) return; perform(async () => { heroImage = await uploadImage(file); updateHeroPreview(); unsaved = true; }, '사진을 저장했습니다. 메인 화보 저장을 눌러 반영하세요.').finally(() => { $('hero-image-file').value = ''; }); });
  $('hero-form').addEventListener('submit', (event) => { event.preventDefault(); if (!heroImage) return notify('메인 화보 사진을 등록해 주세요.', true); perform(async () => { const hero = { image: heroImage, title: $('hero-title').value.trim(), subtitle: $('hero-subtitle').value.trim() }; await api('/api/admin/hero', { method: 'POST', body: hero }); catalog.hero = hero; unsaved = false; }, '메인 화보를 저장했습니다.'); });
  $('inquiry-filter').addEventListener('change', () => { if (!busy) renderInquiries(); });
  $('refresh-inquiries').addEventListener('click', () => perform(refreshInquiries, '고객 문의를 새로 확인했습니다.'));
  $('inquiry-list').addEventListener('click', (event) => { const button = event.target.closest('button[data-inquiry]'); if (!button || busy) return; perform(async () => { await api('/api/admin/inquiry', { method: 'POST', body: { id: Number(button.dataset.inquiry), status: button.dataset.state } }); await refreshInquiries(); }, '문의 상태를 변경했습니다.'); });
  window.addEventListener('beforeunload', (event) => { if (unsaved || busy) { event.preventDefault(); event.returnValue = ''; } });

  async function init() {
    if (cloudMode) {
      $('email-field').hidden = false;
      $('admin-email').required = true;
      $('login-description').textContent = '등록된 관리자 이메일과 비밀번호로 로그인하세요.';
      $('first-login-help').textContent = '온라인 저장소에 등록한 관리자 계정만 사용할 수 있습니다. 일반 회원 가입으로 관리자 권한이 생기지 않습니다.';
      $('mode-note').textContent = '온라인 관리자 · 저장한 상품은 공개 사이트에 반영됩니다.';
      $('workspace-mode-note').textContent = '상품과 사진은 온라인 저장소에 저장됩니다.';
      $('product-save-note').textContent = '저장하면 공개 상태에 따라 온라인 스토어에 반영됩니다.';
      $('publish-heading').textContent = '저장하면 온라인 스토어에 반영됩니다.';
      $('publish-intro').textContent = 'PC를 켜 두지 않아도 휴대폰에서 상품과 메인 화보를 관리합니다. 판매 중·품절 상품만 고객에게 보입니다.';
      $('publish-steps').innerHTML = '<article><span>01</span><div><h3>상품과 화보 저장</h3><p>사진과 가격을 입력하고 저장합니다. 임시 저장한 상품은 고객에게 공개되지 않습니다.</p></div></article><article><span>02</span><div><h3>스토어에서 확인</h3><p>새로 연 화면은 최신 내용을 표시합니다. 이미 열린 화면은 다시 돌아오거나 최대 1분 뒤 갱신됩니다.</p></div></article><article><span>03</span><div><h3>어디서든 관리</h3><p>이 관리자 주소를 휴대폰에 보관하세요. 인터넷 연결이 필요하며 공용 기기에서는 사용 후 로그아웃하세요.</p></div></article>';
      $('customer-features').textContent = '상품 소개·검색·관심상품·장바구니를 제공합니다. 결제와 자동 주문, 온라인 문의 접수는 아직 제공하지 않습니다.';
    }
    if (!['http:', 'https:'].includes(location.protocol)) { $('connection-notice').textContent = '관리자는 파일을 직접 열어 사용할 수 없습니다. START_SELECT.cmd로 서버를 실행한 뒤 HTTP 주소로 접속해 주세요.'; $('connection-notice').hidden = false; $('login-button').disabled = true; return; }
    setBusy(true);
    try {
      if (cloudMode) { const health = await api('/api/health'); if (!health?.ok || health.schemaVersion !== 1) throw new Error('온라인 데이터베이스 설치 상태를 확인해 주세요.'); }
      const session = await api('/api/admin/session');
      if (session.authenticated) { csrf = session.csrf || ''; await Promise.all([refreshCatalog(), refreshInquiries()]); loadHeroFields(); showDashboard(); }
      else showLogin();
    } catch (error) { $('connection-notice').textContent = cloudMode ? `온라인 저장소 연결을 확인하세요. ${error.message}` : `관리 서버에 연결하지 못했습니다. START_SELECT.cmd 실행 상태를 확인해 주세요. ${error.message}`; $('connection-notice').hidden = false; showLogin(); }
    finally { setBusy(false); }
  }
  init();
})();
