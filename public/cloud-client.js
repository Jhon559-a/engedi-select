'use strict';
/* Browser adapter for the optional durable online CMS. Never configure a secret/service-role key here. */
((scope) => {
  const MAX_FILE = 8 * 1024 * 1024;
  const MAX_PIXELS = 25_000_000;
  const MEDIA_REF = /^storage:(select\/[a-f0-9]{32}\.jpg)$/;
  const LOCAL_IMAGE = /^\/assets\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:jpg|jpeg|png|webp|svg)$/;
  const UUID = /^[a-f0-9-]{36}$/i;

  class CloudError extends Error {
    constructor(message, status = 0) { super(message); this.name = 'CloudError'; this.status = status; }
  }

  function keyIsPublic(value) {
    if (typeof value !== 'string' || value.length > 4096) return false;
    if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)) return true;
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
    try {
      const middle = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(scope.atob(middle + '='.repeat((4 - middle.length % 4) % 4)));
      return data.role === 'anon';
    } catch (_) { return false; }
  }

  function create(input = {}) {
    const config = input.cloud || input;
    let project;
    try { project = new URL(config.projectUrl); } catch (_) { throw new CloudError('온라인 관리 서버 주소가 설정되지 않았습니다.'); }
    if (project.protocol !== 'https:' || !/^[a-z0-9]{10,40}\.supabase\.co$/.test(project.hostname) || project.username || project.password || project.port || project.pathname !== '/' || project.search || project.hash) throw new CloudError('Supabase 프로젝트의 HTTPS 주소를 확인해 주세요.');
    if (!keyIsPublic(config.publishableKey)) throw new CloudError('브라우저에는 공개용 publishable 또는 anon 키만 연결할 수 있습니다. 비밀키는 사용할 수 없습니다.');
    if (config.bucket && config.bucket !== 'select-media') throw new CloudError('사진 저장소 설정을 확인해 주세요.');
    const base = project.origin;
    const bucket = 'select-media';
    const storageKey = `engedi-select-cloud-session:${project.hostname}`;
    const photoCache = new Map();
    let session = null, refreshPromise = null, authGeneration = 0;
    let storage;
    try { storage = scope.sessionStorage; } catch (_) { storage = null; }

    function saveSession(value) {
      session = value;
      try { if (value) storage?.setItem(storageKey, JSON.stringify(value)); else storage?.removeItem(storageKey); } catch (_) { /* Private browsing can still use the in-memory session. */ }
    }

    function normalizeSession(value) {
      if (!value || typeof value.access_token !== 'string' || value.access_token.length > 16384 || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token || value.refresh_token.length > 4096 || !UUID.test(value.user?.id || '')) throw new CloudError('로그인 응답을 확인할 수 없습니다. 다시 로그인해 주세요.', 401);
      const expiresAt = Number(value.expires_at || (Date.now() / 1000 + Number(value.expires_in || 3600)));
      if (!Number.isFinite(expiresAt) || expiresAt < 0) throw new CloudError('로그인 유효기간을 확인할 수 없습니다.', 401);
      return { access_token: value.access_token, refresh_token: value.refresh_token, expires_at: expiresAt, user: { id: value.user.id, email: typeof value.user.email === 'string' ? value.user.email : '' } };
    }

    try { const saved = storage?.getItem(storageKey); if (saved) session = normalizeSession(JSON.parse(saved)); } catch (_) { saveSession(null); }

    function messageFor(status, path, payload) {
      if (status === 429) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.';
      if (path.startsWith('/auth/v1/token?grant_type=password')) return '이메일과 비밀번호를 확인해 주세요. 관리자 계정만 로그인할 수 있습니다.';
      if (status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
      if (status === 403 || payload?.code === '42501') return '이 작업을 수행할 관리자 권한이 없습니다.';
      if (status === 413) return '사진 한 장은 8MB 이하로 등록해 주세요.';
      if (status >= 500) return '온라인 관리 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.';
      // SQL validation messages are Korean, authored by this project's migration. Never echo vendor internals or tokens.
      const detail = typeof payload?.message === 'string' ? payload.message : '';
      if (path.startsWith('/rest/v1/rpc/select_') && ['P0001', 'P0002', '22023', '55000'].includes(payload?.code) && /^[가-힣]/.test(detail) && detail.length <= 220 && !/https?:|token|password|secret|key|eyJ/i.test(detail)) return detail;
      return '요청을 처리하지 못했습니다. 입력 내용과 온라인 연결 상태를 확인해 주세요.';
    }

    async function transport(path, { method = 'POST', body, token = '', raw = false } = {}) {
      if (!path.startsWith('/') || path.startsWith('//')) throw new CloudError('허용되지 않은 서버 요청입니다.');
      const headers = new Headers({ apikey: config.publishableKey });
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (body !== undefined) headers.set('Content-Type', raw ? 'image/jpeg' : 'application/json');
      if (raw) { headers.set('x-upsert', 'false'); headers.set('cache-control', '3600'); }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      let response;
      try { response = await scope.fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
      catch (error) { throw new CloudError(error?.name === 'AbortError' ? '온라인 서버 연결 시간이 초과되었습니다. 다시 시도해 주세요.' : '온라인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
      finally { clearTimeout(timer); }
      let payload = null;
      if (response.status !== 204) { try { payload = await response.json(); } catch (_) { if (response.ok) throw new CloudError('온라인 서버 응답 형식을 확인할 수 없습니다.'); } }
      if (!response.ok) throw new CloudError(messageFor(response.status, path, payload), response.status);
      return payload;
    }

    async function ensureSession(force = false) {
      if (refreshPromise) return refreshPromise;
      if (!session) throw new CloudError('관리자 로그인이 필요합니다.', 401);
      if (!force && session.expires_at > Date.now() / 1000 + 60) return session;
      const generation = authGeneration;
      const refreshToken = session.refresh_token;
      refreshPromise = (async () => {
        try {
          const value = await transport('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
          if (generation !== authGeneration) throw new CloudError('로그인이 변경되었습니다. 다시 로그인해 주세요.', 401);
          saveSession(normalizeSession(value));
          return session;
        } catch (error) {
          if (generation === authGeneration && [400, 401, 403, 422].includes(error.status)) { saveSession(null); throw new CloudError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401); }
          throw error;
        } finally { refreshPromise = null; }
      })();
      return refreshPromise;
    }

    async function authorized(path, options = {}, retry = true) {
      const current = await ensureSession();
      try { return await transport(path, { ...options, token: current.access_token }); }
      catch (error) {
        if (error.status === 401 && retry) { await ensureSession(true); return authorized(path, options, false); }
        if (error.status === 401) saveSession(null);
        throw error;
      }
    }

    async function rpc(name, body = {}, admin = false) {
      const path = `/rest/v1/rpc/select_${name}`;
      return admin ? authorized(path, { body }) : transport(path, { body });
    }

    function mediaPath(value) {
      if (typeof value !== 'string') return '';
      const stored = value.match(MEDIA_REF);
      if (stored) return stored[1];
      let url;
      try { url = new URL(value); } catch (_) { return ''; }
      if (url.origin !== base || url.username || url.password || url.hash) return '';
      const prefix = `/storage/v1/object/sign/${bucket}/`;
      if (!url.pathname.startsWith(prefix) || !/^select\/[a-f0-9]{32}\.jpg$/.test(url.pathname.slice(prefix.length))) return '';
      if ([...url.searchParams.keys()].some((key) => key !== 'token') || !/^[A-Za-z0-9_.-]+$/.test(url.searchParams.get('token') || '')) return '';
      return url.pathname.slice(prefix.length);
    }

    function safeImage(value) {
      if (typeof value !== 'string') return '';
      if (LOCAL_IMAGE.test(value)) return value;
      return !value.startsWith('storage:') && mediaPath(value) ? value : '';
    }

    function storedImage(value) {
      if (LOCAL_IMAGE.test(value || '')) return value;
      const path = mediaPath(value);
      if (!path) throw new CloudError('사진 경로를 확인해 주세요. 이 사이트에서 올린 사진만 사용할 수 있습니다.');
      return `storage:${path}`;
    }

    async function signedImages(values, admin) {
      const paths = [...new Set(values.filter((value) => !LOCAL_IMAGE.test(value || '')).map((value) => {
        const path = mediaPath(value);
        if (!path) throw new CloudError('등록된 상품 사진 경로를 확인할 수 없습니다.');
        return path;
      }))];
      const now = Date.now();
      const missing = paths.filter((path) => !photoCache.has(`${admin}:${path}`) || photoCache.get(`${admin}:${path}`).expires < now);
      for (let offset = 0; offset < missing.length; offset += 100) {
        const chunk = missing.slice(offset, offset + 100);
        const endpoint = `/storage/v1/object/sign/${bucket}`;
        const options = { body: { expiresIn: 3600, paths: chunk } };
        const rows = admin ? await authorized(endpoint, options) : await transport(endpoint, options);
        if (!Array.isArray(rows)) throw new CloudError('사진 저장소의 응답을 확인할 수 없습니다.');
        for (const path of chunk) {
          const row = rows.find((item) => item.path === path);
          if (!row || row.error || typeof row.signedURL !== 'string') throw new CloudError('상품 사진을 불러오지 못했습니다. 사진 저장소 권한과 원본 파일을 확인해 주세요.');
          const url = row.signedURL.startsWith('/object/sign/') ? `${base}/storage/v1${row.signedURL}` : row.signedURL.startsWith('/storage/v1/object/sign/') ? `${base}${row.signedURL}` : row.signedURL;
          if (!safeImage(url) || mediaPath(url) !== path) throw new CloudError('사진 저장소가 허용되지 않은 주소를 반환했습니다.');
          photoCache.set(`${admin}:${path}`, { url, expires: now + 50 * 60 * 1000 });
        }
      }
      return values.map((value) => LOCAL_IMAGE.test(value || '') ? value : photoCache.get(`${admin}:${mediaPath(value)}`).url);
    }

    async function hydrateProduct(product, admin) {
      if (!product || typeof product !== 'object' || !Array.isArray(product.images)) throw new CloudError('상품 데이터 형식을 확인할 수 없습니다.');
      return { ...product, images: await signedImages(product.images, admin) };
    }

    async function hydrateCatalog(value, admin) {
      if (!value || !Array.isArray(value.products) || !value.hero || typeof value.hero !== 'object') throw new CloudError('상품 목록 응답을 확인할 수 없습니다.');
      const references = value.products.flatMap((product) => Array.isArray(product.images) ? product.images : []);
      if (value.hero.image) references.push(value.hero.image);
      await signedImages(references, admin);
      const products = await Promise.all(value.products.map((product) => hydrateProduct(product, admin)));
      const hero = { ...value.hero, image: value.hero.image ? (await signedImages([value.hero.image], admin))[0] : '' };
      return { ...value, products, hero };
    }

    async function checkSession() {
      if (!session) return { authenticated: false };
      try {
        const current = await ensureSession();
        const admin = await rpc('is_admin', {}, true);
        if (admin !== true) { await logout(); return { authenticated: false }; }
        return { authenticated: true, csrf: '', email: current.user.email };
      } catch (error) {
        if ([400, 401, 403, 422].includes(error.status)) { saveSession(null); return { authenticated: false }; }
        throw error;
      }
    }

    async function login(body) {
      const email = typeof body?.email === 'string' ? body.email.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof body?.password !== 'string' || !body.password || body.password.length > 200) throw new CloudError('관리자 이메일과 비밀번호를 입력해 주세요.', 400);
      authGeneration += 1;
      saveSession(null);
      photoCache.clear();
      const generation = authGeneration;
      const value = await transport('/auth/v1/token?grant_type=password', { body: { email, password: body.password } });
      if (generation !== authGeneration) throw new CloudError('로그인 요청이 변경되었습니다. 다시 시도해 주세요.', 401);
      saveSession(normalizeSession(value));
      try {
        if (await rpc('is_admin', {}, true) !== true) { await logout(); throw new CloudError('이 계정에는 관리자 권한이 없습니다.', 403); }
      } catch (error) { saveSession(null); throw error; }
      return { authenticated: true, csrf: '', email: session.user.email };
    }

    async function logout() {
      const token = session?.access_token;
      authGeneration += 1;
      saveSession(null);
      photoCache.clear();
      if (token) { try { await transport('/auth/v1/logout?scope=local', { token }); } catch (_) { /* Clearing the local session must always succeed. */ } }
      return { authenticated: false };
    }

    async function jpeg(file) {
      if (!(file instanceof scope.Blob) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new CloudError('JPG, PNG, WebP 사진만 등록할 수 있습니다.', 415);
      if (!file.size || file.size > MAX_FILE) throw new CloudError('사진 한 장은 8MB 이하로 등록해 주세요.', 413);
      let bitmap, objectURL;
      try {
        if (typeof scope.createImageBitmap === 'function') bitmap = await scope.createImageBitmap(file, { imageOrientation: 'from-image' });
        else {
          objectURL = scope.URL.createObjectURL(file);
          bitmap = await new Promise((resolve, reject) => { const image = new scope.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = objectURL; });
        }
        const width = bitmap.width || bitmap.naturalWidth, height = bitmap.height || bitmap.naturalHeight;
        if (!width || !height || width * height > MAX_PIXELS) throw new CloudError('사진은 2,500만 화소 이하로 등록해 주세요.', 413);
        const ratio = Math.min(1, 2800 / Math.max(width, height));
        const canvas = scope.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new CloudError('이 브라우저에서 사진을 처리할 수 없습니다. 최신 Safari 또는 Chrome으로 다시 시도해 주세요.');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
        if (!blob || blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_FILE) throw new CloudError('사진을 저장 가능한 JPG로 변환하지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
        return blob;
      } catch (error) { if (error instanceof CloudError) throw error; throw new CloudError('사진 파일을 읽을 수 없습니다. 손상되지 않은 JPG, PNG, WebP 사진을 선택해 주세요.', 415); }
      finally { bitmap?.close?.(); if (objectURL) scope.URL.revokeObjectURL(objectURL); }
    }

    async function upload(file) {
      await ensureSession();
      const body = await jpeg(file);
      if (!scope.crypto?.getRandomValues) throw new CloudError('안전한 사진 업로드를 지원하는 HTTPS 브라우저로 접속해 주세요.');
      const bytes = scope.crypto.getRandomValues(new Uint8Array(16));
      const path = `select/${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}.jpg`;
      await authorized(`/storage/v1/object/${bucket}/${path}`, { body, raw: true });
      return { url: (await signedImages([`storage:${path}`], true))[0] };
    }

    async function request(path, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      let body = options.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { throw new CloudError('입력 데이터 형식을 확인해 주세요.', 400); } }
      if (method === 'GET' && path === '/api/health') return rpc('health');
      if (method === 'GET' && path === '/api/catalog') return hydrateCatalog(await rpc('catalog'), false);
      if (method === 'GET' && path === '/api/admin/session') return checkSession();
      if (method === 'POST' && path === '/api/admin/login') return login(body);
      if (method === 'POST' && path === '/api/admin/logout') return logout();
      if (method === 'GET' && path === '/api/admin/catalog') return hydrateCatalog(await rpc('admin_catalog', {}, true), true);
      if (method === 'GET' && path === '/api/admin/inquiries') return rpc('admin_inquiries', {}, true);
      if (method === 'POST' && path === '/api/admin/upload') return upload(body);
      if (method === 'POST' && path === '/api/admin/product') {
        if (!body || typeof body !== 'object' || !Array.isArray(body.images)) throw new CloudError('상품 정보를 확인해 주세요.', 400);
        const payload = { ...body, images: body.images.map(storedImage) };
        const result = await rpc('save_product', { p_product: payload }, true);
        return { ...result, product: await hydrateProduct(result.product, true) };
      }
      const archive = path.match(/^\/api\/admin\/product\/([1-9]\d*)$/);
      if (method === 'DELETE' && archive) {
        const id = Number(archive[1]);
        if (!Number.isSafeInteger(id)) throw new CloudError('상품 번호를 확인해 주세요.', 400);
        const result = await rpc('archive_product', { p_id: id }, true); photoCache.clear(); return result;
      }
      if (method === 'POST' && path === '/api/admin/hero') {
        if (!body || typeof body !== 'object') throw new CloudError('메인 화면 정보를 확인해 주세요.', 400);
        return rpc('save_hero', { p_hero: { ...body, image: body.image ? storedImage(body.image) : '' } }, true);
      }
      if (method === 'POST' && path === '/api/admin/inquiry') return rpc('set_inquiry_status', { p_id: body?.id, p_status: body?.status }, true);
      if (method === 'POST' && path === '/api/inquiries') return rpc('create_inquiry', { p_inquiry: body });
      throw new CloudError('지원하지 않는 온라인 관리 요청입니다.', 404);
    }

    return Object.freeze({ request, safeImage, enabled: true });
  }

  scope.EngediCloud = Object.freeze({ create, CloudError });
})(typeof window !== 'undefined' ? window : globalThis);
