'use strict';
/* This store is deliberately separate from the fashion shop. No payment is processed. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cats = {bags:'가방',wallets:'지갑·파우치',desk:'데스크',living:'홈·리빙',travel:'트래블'};
  const catEnglish = {bags:'BAGS',wallets:'SMALL ESSENTIALS',desk:'AT YOUR DESK',living:'FOR YOUR SPACE',travel:'ON THE GO'};
  const config = window.ENGEDI_SELECT_CONFIG || {mode:'local'};
  const staticMode = config.mode === 'static';
  const cloudMode = config.mode === 'cloud';
  const inquiryUnavailable = staticMode || cloudMode;
  let cloud = null, cloudSetupError = '';
  if (cloudMode) {
    try { if (!window.EngediCloud) throw new Error('온라인 연결 파일이 없습니다.'); cloud = window.EngediCloud.create(config.cloud || config); }
    catch (error) { cloudSetupError = error.message; }
  }
  const money = value => new Intl.NumberFormat('ko-KR').format(Number(value) || 0);
  const safeImage = value => cloud?.safeImage(value) || (/^\/(?:assets\/[a-zA-Z0-9_.-]+\.(?:jpg|jpeg|png|webp|svg)|uploads\/[a-f0-9]{32}\.jpg)$/.test(value || '') ? value : '/assets/placeholder.svg');
  const key = 'engedi-select-v1-';
  function readSaved(name, fallback) {try {return JSON.parse(localStorage.getItem(key+name)) ?? fallback;} catch {return fallback;}}
  function persist(name, value) {try {localStorage.setItem(key+name, JSON.stringify(value));} catch {toast('브라우저 보관 공간이 부족해 이번 변경을 저장하지 못했어요.');}}
  let products = [], category = 'all', query = '', price = 'all', sort = 'curated', showingExamples = false;
  const normalizeWishes = value => Array.isArray(value) ? [...new Set(value.filter(id=>Number.isInteger(id)&&id>0))] : [];
  const normalizeBag = value => Array.isArray(value) ? value.filter(i=>i&&Number.isInteger(i.id)&&i.id>0&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=100000).filter((i,index,all)=>all.findIndex(x=>x.id===i.id)===index).map(i=>({id:i.id,quantity:i.quantity})) : [];
  let wishes = normalizeWishes(readSaved('wishes', [])), bag = normalizeBag(readSaved('bag', [])), drawerType = '', toastTimer, ready = false;
  const product = id => products.find(p => p.id === Number(id));
  const sellable = p => p && p.status === 'published' && p.stock > 0;
  const clamp = (n, max) => Math.max(1, Math.min(Math.floor(Number(n)) || 1, Math.max(1, max)));
  function toast(message) {clearTimeout(toastTimer);const target=$('#drawer').open?$('#drawer'):$('#info-dialog').open?$('#info-dialog'):document.body;target.appendChild($('#toast'));$('#toast').textContent = message;$('#toast').hidden = false;toastTimer = setTimeout(() => {$('#toast').hidden = true;}, 3400);}
  function updateCounts() {$('#wish-count').textContent = wishes.length;const total=bag.reduce((n,i)=>n+i.quantity,0);$('#bag-count').textContent=total;$('#mobile-bag-count').textContent=total;}
  function wishButton(p, extra='') {return `<button class="wish-button ${extra}" data-wish="${p.id}" aria-label="${esc(p.name)} 관심상품 ${wishes.includes(p.id)?'해제':'저장'}" aria-pressed="${wishes.includes(p.id)}"><svg><use href="#i-heart"/></svg></button>`;}
  function card(p) {return `<article class="product-card" data-product-card="${p.id}"><a class="product-photo" href="#product/${p.id}" aria-label="${esc(p.name)} 상세 보기"><img src="${safeImage(p.images?.[0])}" width="700" height="875" alt="${esc(p.name)}${p.demo?' · 시안 이미지':''}" loading="lazy">${p.demo?'<span class="product-flag">예시 상품</span>':''}${!sellable(p)?'<span class="soldout-badge">품절</span>':''}</a>${wishButton(p)}<div class="product-below"><p class="product-category">${catEnglish[p.category] || 'SELECTED OBJECTS'}</p><h3 class="product-name"><a href="#product/${p.id}">${esc(p.name)}</a></h3><p class="product-price">${money(p.price)}<span>원${p.demo?' · 예시':''}</span></p><div class="product-bottomline"><span>${esc(p.colors?.join(' / ') || cats[p.category])}</span><button class="card-add" data-add="${p.id}" aria-label="${esc(p.name)} 장바구니에 담기" ${!sellable(p)?'disabled':''}>＋</button></div></div></article>`;}
  function filterProducts() {return products.filter(p => showingExamples ? p.demo : !p.demo).filter(p => category==='all' || p.category===category).filter(p => !query || `${p.name} ${p.material} ${p.description} ${(p.colors||[]).join(' ')}`.toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko'))).filter(p => price==='all' || p.price<=Number(price)).sort((a,b)=>sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='new'?b.id-a.id:(Number(b.featured)-Number(a.featured) || a.id-b.id));}
  function renderCatalog() {
    const results = filterProducts();
    $$('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
    $('#result-count').textContent=`${showingExamples?'예시 컬렉션 · ':''}${category==='all'?'전체':cats[category]} ${results.length}개`;
    $('#demo-note').hidden=!showingExamples;
    const examplesExist = products.some(p=>p.demo), actualExist = products.some(p=>!p.demo);
    $('#demo-toggle').hidden=!examplesExist || (!actualExist && showingExamples);
    $('#demo-toggle').textContent=showingExamples?'실제 상품 보기 ↗':'예시 컬렉션 보기 ↗';
    $('#products').innerHTML=results.length?results.map(card).join(''):`<div class="empty"><p class="eyebrow">${query || category!=='all' || price!=='all'?'FIND YOUR EVERYDAY':'OUR NEXT COLLECTION'}</p><h3>${query || category!=='all' || price!=='all'?'조건에 맞는 물건이 없어요.':'첫 컬렉션을 준비하고 있어요.'}</h3><p>${query || category!=='all' || price!=='all'?'검색어나 필터를 바꿔서 다시 찾아보세요.':'실제 상품을 등록하면 이곳에서 만나볼 수 있어요.'}</p><button class="button secondary" data-action="reset">${query || category!=='all' || price!=='all'?'전체 상품 보기 ↗':'예시 컬렉션 보기 ↗'}</button></div>`;
  }
  function setCategory(next) {category=cats[next]?next:'all';query='';$('#search').value='';$('#header-search').value='';renderCatalog();if(location.hash!=='#collection')location.hash='collection';else $('#collection').scrollIntoView({behavior:'smooth',block:'start'});}
  function resetFilters() {category='all';query='';price='all';sort='curated';$('#search').value='';$('#header-search').value='';$('#price-filter').value='all';$('#sort').value='curated';renderCatalog();}
  function toggleWish(id) {id=Number(id);if(!product(id))return;wishes=wishes.includes(id)?wishes.filter(x=>x!==id):[...wishes,id];persist('wishes',wishes);updateCounts();$$(`[data-wish="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(wishes.includes(id)));b.setAttribute('aria-label',`${product(id).name} 관심상품 ${wishes.includes(id)?'해제':'저장'}`);});if(drawerType==='wishes' && $('#drawer').open)renderDrawer();toast(wishes.includes(id)?'관심상품에 보관했어요.':'관심상품에서 지웠어요.');}
  function addToBag(id, quantity=1) {const p=product(id);if(!sellable(p)){toast('지금은 담을 수 없는 상품이에요.');return;}const old=bag.find(i=>i.id===p.id), amount=clamp(quantity,p.stock);if((old?.quantity||0)+amount>p.stock){toast(`현재 선택할 수 있는 수량은 ${p.stock}개예요.`);return;}if(old)old.quantity+=amount;else bag.push({id:p.id,quantity:amount});persist('bag',bag);updateCounts();toast(p.demo?'예시 상품을 장바구니에 담았어요.':'장바구니에 담았어요.');}
  function renderDetail(id) {
    const p=product(id);$('#home-view').hidden=true;$('#detail-view').hidden=false;
    if(!p){$('#detail-view').innerHTML='<div class="empty"><p class="eyebrow">THE NEXT OBJECT</p><h1>지금은 볼 수 없는 상품이에요.</h1><p>판매가 종료되었거나 비공개로 바뀐 상품입니다.</p><a class="button primary" href="#collection">컬렉션으로 돌아가기 ↗</a></div>';document.title='상품 안내 · ENGEDI SELECT';return;}
    document.title=`${p.name} · ENGEDI SELECT`;
    const related=products.filter(i=>i.id!==p.id && Boolean(i.demo)===Boolean(p.demo)).sort((a,b)=>Number(b.category===p.category)-Number(a.category===p.category)).slice(0,4);
    $('#detail-view').innerHTML=`<nav class="breadcrumb" aria-label="현재 위치"><a href="#home">홈</a><span>/</span><a href="#collection">컬렉션</a><span>/</span><button data-category="${p.category}">${cats[p.category]}</button></nav><div class="detail-grid"><div class="detail-gallery"><div class="detail-photo"><img id="detail-photo" src="${safeImage(p.images?.[0])}" alt="${esc(p.name)}${p.demo?' · 예시 사진':''}" width="1024" height="1024"></div>${p.images.length>1?`<div class="detail-thumbs" role="group" aria-label="상품 사진 선택">${p.images.map((url,i)=>`<button data-photo-index="${i}" aria-label="상품 사진 ${i+1} 보기" aria-pressed="${i===0}"><img src="${safeImage(url)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}</div><div class="detail-info"><p class="eyebrow">ENGEDI SELECT / ${catEnglish[p.category]}</p><h1>${esc(p.name)}</h1><p class="detail-price">${money(p.price)}<span>원${p.demo?' · 예시 가격':''}</span></p>${p.demo?'<p class="detail-demo">예시 상품입니다. 사진·가격·소재·규격은 시안이며 실제 판매 상품이 아닙니다.</p>':''}<p class="detail-description">${esc(p.description)}</p><dl class="product-facts"><div><dt>소재</dt><dd>${esc(p.material)}</dd></div><div><dt>규격</dt><dd>${esc(p.dimensions)}</dd></div><div><dt>색상</dt><dd>${esc(p.colors.join(' / '))}</dd></div><div><dt>${p.demo?'예시 수량':'판매 수량'}</dt><dd>${sellable(p)?`${money(p.stock)}개`:'품절'}</dd></div></dl><div class="detail-choice"><span>수량 선택</span><div class="qty-control"><button data-detail-qty="-1" aria-label="수량 줄이기" ${!sellable(p)?'disabled':''}>−</button><input id="detail-quantity" type="number" min="1" max="${Math.max(1,p.stock)}" value="1" inputmode="numeric" aria-label="담을 수량" ${!sellable(p)?'disabled':''}><button data-detail-qty="1" aria-label="수량 늘리기" ${!sellable(p)?'disabled':''}>＋</button></div></div><div class="detail-actions">${wishButton(p)}<button class="button primary" data-detail-add="${p.id}" ${!sellable(p)?'disabled':''}>${sellable(p)?'장바구니에 담기':'현재 품절입니다'} <span>↗</span></button></div><p class="detail-notice">${p.demo?'예시 상품은 담기와 비교만 체험할 수 있어요.':inquiryUnavailable?'이 공개판은 상품 소개용입니다. 온라인 문의 접수는 아직 연결되지 않았어요.':'장바구니에서 수량을 확인하고 구매 문의를 남길 수 있어요.'}<br>배송 조건과 최종 금액은 상담 시 확인합니다. 이곳에서 결제되지 않습니다.</p></div></div>${related.length?`<div class="detail-related"><p class="eyebrow">CONTINUE YOUR DISCOVERY</p><h2>함께 살펴볼 좋은 물건.</h2><div class="products">${related.map(card).join('')}</div></div>`:''}`;
  }
  function route() {if(!ready)return;const match=location.hash.match(/^#product\/(\d+)$/);if(match){renderDetail(Number(match[1]));window.scrollTo({top:0,behavior:'instant'});}else{$('#home-view').hidden=false;$('#detail-view').hidden=true;document.title='ENGEDI SELECT · 일상의 좋은 물건';if(location.hash==='#collection'||location.hash==='#journal')requestAnimationFrame(()=>$(location.hash).scrollIntoView({block:'start',behavior:'instant'}));else if(!location.hash||location.hash==='#home')window.scrollTo({top:0,behavior:'instant'});}$$('.mobile-nav>a').forEach(a=>{if(a.getAttribute('href')===location.hash || (!location.hash && a.getAttribute('href')==='#home'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
  function openDrawer(type) {drawerType=type;renderDrawer();if(!$('#drawer').open)$('#drawer').showModal();}
  function closeDrawer() {$('#drawer').close();drawerType='';}
  function emptyDrawer(wish=false) {return `<div class="empty"><p class="eyebrow">A LITTLE ROOM FOR YOUR TASTE</p><h3>${wish?'마음에 드는 물건을 모아보세요.':'아직 담긴 물건이 없어요.'}</h3><p>${wish?'상품의 하트를 누르면 이곳에 보관돼요.':'좋은 물건을 천천히 골라보세요.'}</p><button class="text-button" data-action="browse">컬렉션 둘러보기 ↗</button></div>`;}
  function renderDrawer() {
    const wish=drawerType==='wishes';$('#drawer-title').textContent=wish?'관심상품':'나의 장바구니';$('#drawer-eyebrow').textContent=wish?'SAVED FOR ANOTHER DAY':'YOUR EVERYDAY SELECTION';
    if(wish){const saved=wishes.map(product).filter(Boolean);$('#drawer-content').innerHTML=saved.length?saved.map(p=>`<article class="drawer-item"><a href="#product/${p.id}" data-close-link><img src="${safeImage(p.images[0])}" alt="${esc(p.name)}" width="100" height="125"></a><div class="drawer-item-info"><small>${p.demo?'예시 상품 · ':''}${cats[p.category]}</small><h3><a href="#product/${p.id}" data-close-link>${esc(p.name)}</a></h3><p>${money(p.price)}원</p><div class="item-controls"><button class="text-button" data-add="${p.id}" ${!sellable(p)?'disabled':''}>${sellable(p)?'장바구니 담기 ＋':'품절'}</button><button class="remove-item" data-wish="${p.id}" aria-label="${esc(p.name)} 관심상품 해제">보관 해제</button></div></div></article>`).join('')+`<p class="bag-alert">관심상품은 현재 브라우저에 보관됩니다.</p>`:emptyDrawer(true);return;}
    const active=bag.map(i=>({...i,p:product(i.id)})).filter(i=>i.p),total=active.reduce((n,i)=>n+i.p.price*i.quantity,0),hasDemo=active.some(i=>i.p.demo),bad=active.some(i=>!sellable(i.p)||i.quantity>i.p.stock);
    $('#drawer-content').innerHTML=active.length?active.map(i=>`<article class="drawer-item"><a href="#product/${i.id}" data-close-link><img src="${safeImage(i.p.images[0])}" alt="${esc(i.p.name)}" width="100" height="125"></a><div class="drawer-item-info"><small>${i.p.demo?'예시 상품 · ':''}${cats[i.p.category]}${!sellable(i.p)?' · 품절':i.quantity>i.p.stock?' · 수량 확인 필요':''}</small><h3><a href="#product/${i.id}" data-close-link>${esc(i.p.name)}</a></h3><p>${money(i.p.price)}원</p><div class="item-controls"><div class="qty-control"><button data-bag-qty="${i.id}" data-delta="-1" aria-label="${esc(i.p.name)} 수량 줄이기">−</button><input type="number" value="${i.quantity}" min="1" max="${Math.max(1,i.p.stock)}" data-bag-input="${i.id}" aria-label="${esc(i.p.name)} 수량"><button data-bag-qty="${i.id}" data-delta="1" aria-label="${esc(i.p.name)} 수량 늘리기">＋</button></div><button class="remove-item" data-remove="${i.id}" aria-label="${esc(i.p.name)} 장바구니에서 삭제">삭제</button></div></div></article>`).join('')+`<div class="bag-total"><div><span>${hasDemo?'예시 포함 상품 합계':'상품 합계'}</span><strong>${money(total)}<small> 원</small></strong></div><p>배송비는 포함되지 않았습니다. 구매 문의는 결제·주문 확정이 아니며 재고를 예약하지 않습니다.</p>${hasDemo?'<div class="bag-alert">예시 상품은 실제 구매 문의를 접수할 수 없습니다. 실제 상품만 담으면 문의할 수 있어요.</div>':bad?'<div class="bag-alert">판매 수량이 바뀐 상품이 있습니다. 수량을 조정하거나 품절 상품을 삭제해 주세요.</div>':inquiryUnavailable?'<div class="bag-alert">이 공개판은 상품 소개용입니다. 온라인 문의 접수는 아직 연결되지 않았습니다.</div>':''}<button class="button primary" data-action="inquiry" ${hasDemo||bad||inquiryUnavailable?'disabled':''}>구매 문의하기 <span>↗</span></button><button class="text-button" data-action="browse">계속 둘러보기 ↗</button></div>`:emptyDrawer();
  }
  function changeBag(id, quantity) {const p=product(id),i=bag.find(i=>i.id===Number(id));if(!p||!i)return;if(!sellable(p)){toast('품절 상품은 장바구니에서 삭제해 주세요.');return;}i.quantity=clamp(quantity,p.stock);persist('bag',bag);updateCounts();renderDrawer();}
  async function beginInquiry() {
    if(inquiryUnavailable)return;
    try {await loadCatalog(true);}catch{toast('상품 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');return;}
    const selected=bag.map(i=>({...i,p:product(i.id)}));
    if(!selected.length||selected.some(i=>!sellable(i.p)||i.p.demo||i.quantity>i.p.stock)){renderDrawer();toast('상품과 수량이 변경됐어요. 장바구니를 확인해 주세요.');return;}
    $('#drawer-title').textContent='구매 문의';$('#drawer-eyebrow').textContent='LET’S FIND YOUR GOOD THINGS';
    $('#drawer-content').innerHTML=`<h3 class="inquiry-heading">궁금한 물건을 연결해 드릴게요.</h3><p class="inquiry-help">${selected.length}종 · ${selected.reduce((n,i)=>n+i.quantity,0)}개 · 상품 합계 ${money(selected.reduce((n,i)=>n+i.p.price*i.quantity,0))}원<br>문의는 이 스토어 관리자에게 저장됩니다. 이메일이 자동 발송되지는 않습니다.</p><form id="inquiry-form" class="inquiry-form"><label>이름<input name="name" required maxlength="80" autocomplete="name" placeholder="문의하시는 분의 성함"></label><label>답변받을 이메일<input name="email" required type="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label><label>문의 내용<textarea name="message" required maxlength="3000" placeholder="상품, 배송 지역, 필요한 일정 등 궁금한 점을 남겨 주세요."></textarea></label><label class="consent"><input name="consent" type="checkbox" required><span>문의 답변을 위해 이름·이메일·문의 내용이 이 스토어에 저장되는 것에 동의합니다. 정보는 문의 처리 목적으로만 사용합니다.</span></label><p class="form-error" id="inquiry-error" role="alert" hidden></p><button class="button primary" type="submit">문의 접수하기 ↗</button><button class="text-button" type="button" data-action="back-bag">← 장바구니로 돌아가기</button></form>`;
  }
  document.addEventListener('submit', async e=>{
    if(e.target.id!=='inquiry-form')return;e.preventDefault();const form=e.target,button=$('button[type=submit]',form),error=$('#inquiry-error');button.disabled=true;error.hidden=true;
    const data=new FormData(form),items=bag.map(i=>({productId:i.id,quantity:i.quantity}));
    try {if(!data.get('consent'))throw Error('문의 저장 동의가 필요합니다.');const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,name:data.get('name'),email:data.get('email'),message:data.get('message')})});const result=await response.json();if(!response.ok)throw Error(result.error||'문의 접수에 실패했습니다.');$('#drawer-content').innerHTML=`<div class="inquiry-result"><span class="result-check">✓</span><p class="eyebrow">YOUR INQUIRY IS WITH US</p><h3>문의가 접수됐어요.</h3><p>접수 번호 ${esc(result.id||result.inquiry?.id||'확인 완료')}<br>관리자가 내용을 확인한 뒤 기재하신 이메일로 안내합니다.<br>이 접수는 주문이나 결제 완료를 의미하지 않습니다.</p><button class="button primary" data-action="browse">컬렉션 더 살펴보기 ↗</button></div>`;
    }catch(err){error.textContent=err.message;error.hidden=false;button.disabled=false;}
  });
  function info(title, html) {$('#info-title').textContent=title;$('#info-content').innerHTML=html;$('#info-dialog').showModal();}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button,a');if(!b)return;
    if(b.matches('[data-category]')){setCategory(b.dataset.category);return;}
    if(b.matches('[data-wish]')){toggleWish(b.dataset.wish);return;}
    if(b.matches('[data-add]')){addToBag(b.dataset.add);return;}
    if(b.matches('[data-detail-add]')){const p=product(b.dataset.detailAdd),input=$('#detail-quantity');input.value=clamp(input.value,p?.stock||1);addToBag(b.dataset.detailAdd,Number(input.value));return;}
    if(b.matches('[data-detail-qty]')){const input=$('#detail-quantity');input.value=clamp(Number(input.value)+Number(b.dataset.detailQty),Number(input.max));return;}
    if(b.matches('[data-photo-index]')){const p=product(location.hash.split('/')[1]);$('#detail-photo').src=safeImage(p.images[Number(b.dataset.photoIndex)]);$$('[data-photo-index]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));return;}
    if(b.matches('[data-bag-qty]')){const item=bag.find(i=>i.id===Number(b.dataset.bagQty));if(item)changeBag(item.id,item.quantity+Number(b.dataset.delta));return;}
    if(b.matches('[data-remove]')){bag=bag.filter(i=>i.id!==Number(b.dataset.remove));persist('bag',bag);updateCounts();renderDrawer();return;}
    if(b.hasAttribute('data-close-link')){closeDrawer();return;}
    switch(b.dataset.action){case'wishes':openDrawer('wishes');break;case'bag':openDrawer('bag');break;case'close-drawer':closeDrawer();break;case'browse':closeDrawer();if(location.hash==='#collection')$('#collection').scrollIntoView({behavior:'smooth'});else location.hash='collection';break;case'close-info':$('#info-dialog').close();break;case'storage':info('좋은 선택을 위한 안내.','<p>관심상품과 장바구니는 현재 브라우저에 저장됩니다. 다른 기기와 자동으로 연결되지 않으며 브라우저 자료를 삭제하면 사라질 수 있어요.</p><p>예시 상품의 이미지·가격·규격은 시안입니다. 실제 상품에는 판매자가 등록한 정보를 표시합니다.</p><p>온라인 결제는 제공하지 않습니다. 실제 상품의 구매 문의는 결제나 재고 예약이 아니며, 배송 조건과 최종 금액은 별도로 확인합니다.</p>');break;case'top':window.scrollTo({top:0,behavior:'smooth'});break;case'reset':resetFilters();if(!products.some(p=>!p.demo))showingExamples=true;renderCatalog();break;case'inquiry':beginInquiry();break;case'back-bag':renderDrawer();break;}
  });
  document.addEventListener('change',e=>{if(e.target.matches('[data-bag-input]'))changeBag(e.target.dataset.bagInput,e.target.value);if(e.target.id==='detail-quantity')e.target.value=clamp(e.target.value,Number(e.target.max));});
  $('#header-search-form').addEventListener('submit',e=>{e.preventDefault();query=$('#header-search').value.trim();$('#search').value=query;category='all';renderCatalog();if(location.hash==='#collection')$('#collection').scrollIntoView({behavior:'smooth'});else location.hash='collection';});
  $('#search').addEventListener('input',e=>{query=e.target.value.trim();$('#header-search').value=e.target.value;renderCatalog();});
  $('#price-filter').addEventListener('change',e=>{price=e.target.value;renderCatalog();});$('#sort').addEventListener('change',e=>{sort=e.target.value;renderCatalog();});$('#reset-filters').addEventListener('click',resetFilters);
  $('#demo-toggle').addEventListener('click',()=>{showingExamples=!showingExamples;resetFilters();});
  $('#drawer').addEventListener('click',e=>{if(e.target===$('#drawer')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDrawer();}});
  window.addEventListener('hashchange',route);
  ['drawer','info-dialog'].forEach(id=>$('#'+id).addEventListener('close',()=>document.body.appendChild($('#toast'))));
  window.addEventListener('storage',e=>{if(e.key===key+'wishes'||e.key===key+'bag'){wishes=normalizeWishes(readSaved('wishes',[]));bag=normalizeBag(readSaved('bag',[]));updateCounts();renderCatalog();if($('#drawer').open)renderDrawer();}});
  async function loadCatalog(quiet=false) {
    let data;
    if(cloudMode) { if(!cloud) throw Error(cloudSetupError || '온라인 저장소가 연결되지 않았습니다.'); data=await cloud.request('/api/catalog'); }
    else { const response=await fetch(staticMode?'/catalog.json':'/api/catalog',{cache:'no-store'});if(!response.ok)throw Error('상품 정보를 불러오지 못했어요.');data=await response.json(); }
    if(!Array.isArray(data.products))throw Error('상품 정보 형식을 확인할 수 없어요.');products=data.products.filter(p=>p && Number.isInteger(p.id) && ['published','soldout'].includes(p.status));
    if(!quiet){const actual=products.some(p=>!p.demo);showingExamples=!actual&&products.some(p=>p.demo);if(data.hero?.image){$('#hero-photo').src=safeImage(data.hero.image);if(!data.hero.image.startsWith('/assets/')){$('#hero-photo').alt='엔게디 셀렉트 메인 화보';$('.image-source').textContent='ENGEDI SELECT / THE EVERYDAY EDIT';}}if(data.hero?.title)$('#hero-title').textContent=data.hero.title;if(data.hero?.subtitle)$('#hero-subtitle').textContent=data.hero.subtitle;
      Object.keys(cats).forEach(cat=>{const item=products.find(p=>!p.demo&&p.category===cat&&p.images?.length);if(item)$(`[data-category-photo="${cat}"]`).src=safeImage(item.images[0]);});}
    const ids=new Set(products.map(p=>p.id));bag=bag.filter(i=>ids.has(i.id));wishes=wishes.filter(id=>ids.has(id));persist('bag',bag);persist('wishes',wishes);updateCounts();if(!quiet)renderCatalog();
  }
  async function init() {if(inquiryUnavailable){$('#admin-link').hidden=staticMode;$('.footer-bottom p').textContent='상품 소개용 공개판 · 온라인 결제와 문의 접수는 아직 연결되지 않았습니다.';$('.select-values div:nth-child(3) span').textContent='03 / COMPARE';$('.select-values div:nth-child(3) h3').textContent='필요한 물건을 비교해 보세요.';$('.select-values div:nth-child(3) p').textContent='지금은 상품 소개용입니다. 온라인 문의 접수는 준비 중이에요.';}try{await loadCatalog();$('#connection').hidden=true;}catch(err){$('#connection').textContent=inquiryUnavailable?'상품을 불러오지 못했습니다. 잠시 후 새로고침해 주세요. 계속 문제가 있으면 사이트 관리자에게 알려 주세요.':'상품을 불러오지 못했습니다. 새 잡화몰의 START_SELECT.cmd 실행 상태를 확인하고 새로고침해 주세요.';$('#connection').hidden=false;$('#products').innerHTML='<div class="empty"><h3>컬렉션에 연결하지 못했어요.</h3><p>상품을 불러올 수 있을 때 다시 확인해 주세요.</p></div>';}ready=true;route();updateCounts();}
  let refreshing = false, lastRefresh = 0;
  async function refreshOnlineCatalog() {
    if(!cloudMode || !ready || refreshing || document.hidden || Date.now()-lastRefresh<5000) return;
    refreshing = true; lastRefresh = Date.now();
    try {
      await loadCatalog(false);
      const detail=location.hash.match(/^#product\/(\d+)$/);
      if(detail) renderDetail(Number(detail[1]));
      if($('#drawer').open && !$('#inquiry-form')) renderDrawer();
      $('#connection').hidden = true;
    } catch (_) {
      $('#connection').textContent='최신 상품 정보를 확인하지 못했습니다. 현재 표시된 가격과 수량은 이전 정보일 수 있어요. 연결 후 다시 확인해 주세요.';
      $('#connection').hidden=false;
    } finally { refreshing=false; }
  }
  document.addEventListener('visibilitychange', refreshOnlineCatalog);
  window.addEventListener('focus', refreshOnlineCatalog);
  if(cloudMode) setInterval(refreshOnlineCatalog, 60000);
  init();
})();
