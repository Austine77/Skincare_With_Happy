const API_BASE = 'http://localhost:4000/api';
const money = v => '₦' + Number(v || 0).toLocaleString('en-NG');
let products = [];
let currentFilter = 'All';
let cart = JSON.parse(localStorage.getItem('skincare-with-happy-cart') || '[]');

const getById = id => document.getElementById(id);
function saveCart(){ localStorage.setItem('skincare-with-happy-cart', JSON.stringify(cart)); }
function getByIdProduct(id){ return products.find(x=>Number(x.id)===Number(id)); }

function layout(active='home'){
 document.body.insertAdjacentHTML('afterbegin',`<div class="announcement">✨ <span>Skincare With Happy</span> — Quality skincare, trusted service, convenient online shopping.</div><div class="nav-wrap"><div class="container"><nav><a href="/" class="logo"><span class="logo-mark">SH</span><span>Skincare With<br/>Happy</span></a><div class="nav-links" id="navLinks"><a class="${active==='home'?'active':''}" href="/">Home</a><a class="${active==='shop'?'active':''}" href="/shop/">Shop</a><a class="${active==='collections'?'active':''}" href="/collections/">Collections</a><a class="${active==='about'?'active':''}" href="/about/">About</a><a class="${active==='reviews'?'active':''}" href="/reviews/">Reviews</a><a class="${active==='contact'?'active':''}" href="/contact/">Contact</a></div><div class="nav-actions"><button class="cart-btn" onclick="openCart()">🛒 Cart <span class="cart-count" id="cartCount">0</span></button><button class="menu-btn" onclick="toggleMenu()">☰</button><a class="btn" href="/shop/">Shop Now</a></div></nav></div></div>`);
 document.body.insertAdjacentHTML('beforeend',`<footer><div class="container"><div class="footer-grid"><div><h3>Skincare With Happy</h3><p>A modern Nigerian skincare e-commerce platform built for simple shopping, secure payments and dependable customer service.</p></div><div><h4>Quick Links</h4><a href="/">Home</a><a href="/shop/">Shop</a><a href="/collections/">Collections</a><a href="/about/">About</a></div><div><h4>Shop</h4><a href="/shop/">Cleansers</a><a href="/shop/">Serums</a><a href="/shop/">Moisturizers</a><a href="/shop/">Sunscreen</a></div><div><h4>Customer Service</h4><a href="/contact/">Contact</a><a href="/cart/">Cart & Checkout</a><a href="/reviews/">Reviews</a><a href="#">Instagram | Facebook</a></div></div><div class="copyright">© <span id="year"></span> Skincare With Happy. All rights reserved.</div></div></footer><div class="cart-overlay" id="cartOverlay" onclick="closeCart()"></div><aside class="cart-drawer" id="cartDrawer"><div class="cart-head"><h3>Your Shopping Cart</h3><button class="close-cart" onclick="closeCart()">×</button></div><div class="cart-items" id="cartItems"></div><div class="cart-bottom"><div class="total-row"><span>Total</span><span id="cartTotal">₦0</span></div><form class="checkout" onsubmit="payNow(event)"><input id="customerName" required placeholder="Customer full name"><input id="customerPhone" required placeholder="Phone number"><input id="customerEmail" type="email" required placeholder="Email address"><input id="deliveryAddress" required placeholder="Delivery address"><button class="btn" type="submit">Continue to Secure Payment</button><a class="btn secondary" href="/cart/">View Full Cart</a></form></div></aside><div class="toast" id="toast"></div>`);
 if(getById('year')) getById('year').textContent=new Date().getFullYear();
 updateCart();
}
function toggleMenu(){ getById('navLinks')?.classList.toggle('show'); }
function openCart(){ updateCart(); getById('cartDrawer')?.classList.add('show'); getById('cartOverlay')?.classList.add('show'); }
function closeCart(){ getById('cartDrawer')?.classList.remove('show'); getById('cartOverlay')?.classList.remove('show'); }
function showToast(msg){ const t=getById('toast'); if(!t)return; t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }

async function fetchProducts(){
 try{
   const r=await fetch(`${API_BASE}/products`); if(!r.ok) throw new Error('Could not load products');
   products=await r.json();
   renderFilters(); renderProducts(); renderCartPage();
 }catch(e){ showToast('Store is temporarily unable to load products.'); console.error(e); }
}
function addToCart(id,open=true){
 const p=getByIdProduct(id); if(!p)return;
 const e=cart.find(x=>Number(x.id)===Number(id)); e ? e.qty++ : cart.push({id:p.id,name:p.name,price:Number(p.price),image_url:p.image_url,qty:1});
 saveCart(); updateCart(); showToast(p.name+' added to cart'); if(open)openCart();
}
function changeQty(id,amount){ const i=cart.find(x=>Number(x.id)===Number(id)); if(!i)return; i.qty+=amount; if(i.qty<=0)cart=cart.filter(x=>Number(x.id)!==Number(id)); saveCart(); updateCart(); renderCartPage(); }
function removeItem(id){ cart=cart.filter(x=>Number(x.id)!==Number(id)); saveCart(); updateCart(); renderCartPage(); showToast('Item removed'); }
function updateCart(){
 const count=cart.reduce((s,i)=>s+i.qty,0); if(getById('cartCount'))getById('cartCount').textContent=count;
 if(getById('cartItems')) getById('cartItems').innerHTML=cart.length?cart.map(item=>`<div class="cart-item"><img src="${item.image_url||item.img}" alt="${item.name}"><div><h4>${item.name}</h4><div class="cart-price">${money(item.price)}</div><div class="qty"><button onclick="changeQty(${item.id},-1)">−</button><strong>${item.qty}</strong><button onclick="changeQty(${item.id},1)">+</button></div></div><button class="remove" onclick="removeItem(${item.id})">×</button></div>`).join(''):'<div class="empty">Your cart is empty. Start shopping.</div>';
 const total=cart.reduce((s,i)=>s+Number(i.price)*i.qty,0); if(getById('cartTotal'))getById('cartTotal').textContent=money(total); if(getById('cartPageTotal'))getById('cartPageTotal').textContent=money(total);
}
async function payNow(e){
 e.preventDefault();
 if(!cart.length){showToast('Please add a product first.');return;}
 const payload={customer:{name:getById('customerName').value,phone:getById('customerPhone').value,email:getById('customerEmail').value,address:getById('deliveryAddress').value},items:cart.map(i=>({product_id:i.id,quantity:i.qty}))};
 try{
   const r=await fetch(`${API_BASE}/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await r.json(); if(!r.ok)throw new Error(data.error||'Unable to create order');
   if(data.authorization_url){ window.location.href=data.authorization_url; return; }
   showToast('Order created successfully.'); cart=[]; saveCart(); updateCart(); closeCart();
 }catch(err){ showToast(err.message); }
}
function renderProducts(limit){
 const grid=getById('productGrid'); if(!grid)return;
 const q=(getById('searchInput')?.value||'').toLowerCase().trim();
 let list=products.filter(p=>(currentFilter==='All'||p.category===currentFilter)&&(!q||`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)));
 if(limit)list=list.slice(0,limit);
 grid.innerHTML=list.map(p=>`<article class="product"><div class="product-img"><img src="${p.image_url}" alt="${p.name}"><span class="badge">${p.category}</span></div><div class="product-body"><div class="product-top"><h3>${p.name}</h3><div class="stars">${'★'.repeat(Math.round(p.rating||5))}${'☆'.repeat(5-Math.round(p.rating||5))}</div></div><p>${p.description||''}</p><div class="price-row"><span class="price">${money(p.price)}</span>${p.old_price?`<span class="old-price">${money(p.old_price)}</span>`:''}</div><div class="product-actions"><button class="mini-btn light" onclick="addToCart(${p.id},false)">Add to Cart</button><button class="mini-btn" onclick="addToCart(${p.id},true)">Buy Now</button></div></div></article>`).join('')||'<div class="empty" style="grid-column:1/-1">No product found.</div>';
}
function renderFilters(){const el=getById('filters');if(!el)return;const cats=['All',...new Set(products.map(p=>p.category))];el.innerHTML=cats.map(f=>`<button class="filter-btn ${f===currentFilter?'active':''}" onclick="currentFilter='${f.replaceAll("'","\\'")}';renderFilters();renderProducts();">${f}</button>`).join('');}
function bindShop(){ getById('searchInput')?.addEventListener('input',()=>renderProducts()); fetchProducts(); }
function renderCartPage(){
 const el=getById('cartPageItems');if(!el)return;
 el.innerHTML=cart.length?cart.map(item=>`<div class="cart-item" style="grid-template-columns:96px 1fr auto"><img style="width:96px;height:96px" src="${item.image_url||item.img}" alt="${item.name}"><div><h4>${item.name}</h4><div class="cart-price">${money(item.price)} x ${item.qty}</div><div class="qty"><button onclick="changeQty(${item.id},-1)">−</button><strong>${item.qty}</strong><button onclick="changeQty(${item.id},1)">+</button></div></div><button class="remove" onclick="removeItem(${item.id})">×</button></div>`).join(''):'<div class="empty">Your cart is empty. Go to the shop page and add products.</div>';
 updateCart();
}
function submitSuccess(e,msg){e.preventDefault();showToast(msg);e.target.reset();}
window.addEventListener('DOMContentLoaded',()=>{if(getById('productGrid')) fetchProducts(); renderCartPage();});
