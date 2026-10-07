/* MarketLink Premium live frontend layer
   Keeps the official embedded MarketLink logo and existing routing.
   Replaces customer-facing mock dashboard/profile surfaces with backend data.
*/
(function(){
  'use strict';
  var liveProducts=[], liveCategories=[], liveProfile=null, liveOrders=null, liveWallet=null, liveNotifications=[];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(v){return 'D '+Number(v||0).toLocaleString('en-GM',{maximumFractionDigits:2});}
  function firstName(){var n=(liveProfile&&liveProfile.full_name)||(S.user&&S.user.name)||S.profileName||'there';return String(n).trim().split(/\s+/)[0]||'there';}
  function apiOk(){return ML_API&&ML_API.auth&&ML_API.auth.isAuthenticated();}
  function imageOrFallback(p){
    if(p.primary_image) return '<img src="'+esc(p.primary_image)+'" alt="'+esc(p.name||'Product')+'" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.ml-product-emoji\').style.display=\'block\';">';
    return '';
  }
  function normalizeProducts(d){return Array.isArray(d)?d:(d&&Array.isArray(d.items)?d.items:[]);}
  function liveProductId(id){return id==null?'':String(id);}
  function livePaymentOptions(){return [['Pay on Delivery','cod'],['Wave','wave'],['AfriMoney','afrimoney'],['QMoney','qmoney']];}
  function liveCategoryName(id){
    var hit=liveCategories.find(function(c){return liveProductId(c.id)===liveProductId(id);});
    return hit&&hit.name?hit.name:'Category';
  }
  async function refreshCartMetadata(){
    var ids=Object.keys(S.cart||{}),out=[];
    for(var i=0;i<ids.length;i++){
      var oldKey=liveProductId(ids[i]);
      try{
        var r=await ML_API.products.getById(oldKey),p=r&&r.data;
        if(!p||!p.id)throw new Error('Product not found');
        var key=liveProductId(p.id);
        if(key!==oldKey){
          var qty=Number(S.cart[oldKey]||0);
          delete S.cart[oldKey];if(qty>0)S.cart[key]=(Number(S.cart[key]||0)+qty);
          delete CART_ITEMS[oldKey];
        }
        CART_ITEMS[key]={id:key,name:p.name,price:Number(p.price||0),vendorId:p.vendor_id||p.vendorId||null,vendorName:p.vendor_name||p.vendorName||'',image:p.primary_image||p.image||null,stock:p.stock==null?null:Number(p.stock),status:p.status||null};
        out.push(CART_ITEMS[key]);
      }catch(e){out.push(null);}
    }
    saveCartToStorage();updateCartBadge();return out;
  }
  async function placeLiveOrder(){
    if(!apiOk()){toast('Please sign in before placing an order.','error');return;}
    var ids=Object.keys(S.cart||{});
    if(!ids.length){toast('Your cart is empty.','error');return;}
    var liveItems=await refreshCartMetadata();
    if(liveItems.some(function(p){return !p||!p.id||String(p.status||'').toLowerCase()!=='active';})){
      toast('One or more cart items is no longer available. Refresh the cart.','error');
      renderLiveCart();return;
    }
    var items=ids.map(function(id){var key=liveProductId(id),p=CART_ITEMS[key];return {productId:key,quantity:Number(S.cart[key]||1),vendorId:p&&p.vendorId};});
    var vendors=items.map(function(x){return x.vendorId;}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;});
    if(vendors.length!==1){toast(vendors.length===0?'Cart items are missing live vendor information. Refresh the cart.':'Please place separate orders for products from different vendors.','error');return;}
    var addressId=String(S.delivAddressId||S.deliveryAddressId||'').trim()||null;
    if(!addressId){
      try{var ar=await ML_API.customers.getAddresses(),addresses=normalizeProducts(ar.data),def=addresses.find(function(x){return x.is_default;});if(def){addressId=String(def.id);S.delivAddressId=addressId;S.deliveryAddressId=addressId;S.delivAddr=def.full_address||S.delivAddr||'';}}catch(e){}
    }
    if(!addressId){toast('Select a saved delivery address before checkout.','error');switchTab('cart');return;}
    var payLabel=S.selPay||'Pay on Delivery',payMethod=payLabel==='Pay on Delivery'?'cod':String(payLabel).toLowerCase().replace(/\s+/g,'-');
    var payload={vendorId:vendors[0],items:items.map(function(x){return {productId:x.productId,quantity:x.quantity};}),deliveryAddressId:addressId,paymentMethod:payMethod,couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined};
    var placeBtn=document.querySelector('#cart-body button[data-ml-place-order]');
    if(placeBtn){placeBtn.disabled=true;placeBtn.textContent='Creating secure order…';}
    try{
      var orderRes=await ML_API.orders.place(payload),order=orderRes&&orderRes.data&&orderRes.data.order?orderRes.data.order:orderRes.data;
      if(!order||!order.id)throw {error:'The backend did not return a valid order.'};
      S.order=order;S.orderSI=0;
      var paymentRes=await ML_API.payments.initiate(order.id,payMethod,Number(order.total)),paymentData=paymentRes&&paymentRes.data?paymentRes.data:paymentRes;
      S.order=Object.assign({},S.order,{payment:paymentData});
      if(payMethod!=='cod'){
        var redirect=paymentData&&paymentData.redirectUrl;
        if(!redirect)throw {error:'Payment was initiated without a payment page. Please try again.'};
        try{sessionStorage.setItem('ml_pending_order_id',String(order.id));}catch(e){}
        var popup=window.open(redirect,'_blank','noopener,noreferrer');
        toast(popup?'Payment page opened. Complete payment to confirm your order.':'Payment page blocked. Allow pop-ups to complete payment.','info');
      }else toast('Order placed — Pay on Delivery selected ✓','success');
      S.appliedCoupon=null;S.cart={};CART_ITEMS={};updateCartBadge();saveCartToStorage();switchTab('orders');startOrderTracking();
    }catch(e){
      if(placeBtn){placeBtn.disabled=false;placeBtn.textContent='Place Order';}
      toast(e.error||'Could not place your order.','error');
    }
  }

  async function liveSearch(q){
    var term=String(q||'').trim();
    if(!term){return loadLiveHome();}
    if(!apiOk()){toast('Please sign in to search the live marketplace.','error');return;}
    try{
      var r=await ML_API.products.list({page:1,limit:30,search:term,sort:'top_rated'});
      var products=normalizeProducts(r.data),root=G('tab-home');if(!root)return;
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Search results</h3><button onclick="window.ML_Premium.refresh()">← Marketplace</button></div>'+
        (products.length?'<div class="ml-product-grid">'+products.map(productCard).join('')+'</div>':'<div class="ml-empty"><div style="font-size:30px">🔎</div><b>No live results</b><span>No approved active product matched “'+esc(term)+'”.</span></div>')+'</div>';
    }catch(e){toast(e.error||'Search failed.','error');}
  }
  async function liveAdminLogin(){
    var idEl=G('admin-staffid'),pinEl=G('admin-password');
    var phone=(idEl&&idEl.value||'').trim(),pin=(pinEl&&pinEl.value||'').trim();
    if(!phone||!pin){adminAuthErr('Enter your admin phone number and 4-digit PIN');return;}
    try{
      var user=await ML_API.auth.login(phone,pin),roles=user.roles||[];
      if(!roles.some(function(r){return r==='admin'||r==='super_admin';})){await ML_API.auth.logout();throw {error:'This account is not authorized for the Admin Portal.'};}
      AdminSession.start(phone);showScreen('scr-app');G('bnav').style.display='none';G('fab').classList.remove('fab-visible');switchTab('admindash');toast('Welcome to the Admin Portal ✓');
    }catch(e){adminAuthErr(e.error||'Admin sign-in failed.');}
  }
  async function loadAdminDashboard(){
    if(!apiOk()){toast('Admin session requires backend sign-in.','error');return;}
    try{
      var r=await ML_API.admin.dashboard(),d=r.data||{},s=d.stats||{},p=d.pendingApprovals||{};
      var orders=Array.isArray(d.recentOrders)?d.recentOrders:[],vendors=Array.isArray(d.topVendors)?d.topVendors:[];
      var root=G('adash-body');if(!root)return;
      root.innerHTML='<div class="ml-premium-home" style="padding-top:18px"><div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Admin control center</div><div class="ml-hero-sub">Live platform metrics from the production database. No preview records are shown.</div></div><div class="ml-live-dot">Backend connected</div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Active customers</div><div class="ml-stat-value">'+Number(s.activeCustomers||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Approved vendors</div><div class="ml-stat-value">'+Number(s.approvedVendors||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Online riders</div><div class="ml-stat-value">'+Number(s.onlineRiders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">30d revenue</div><div class="ml-stat-value">'+money(s.revenue30d||0)+'</div></div></div>'+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>Vendor approvals</strong><span>'+Number(p.pending_vendors||0)+' pending applications require review.</span><button class="ml-btn ml-btn-secondary" style="margin-top:9px" onclick="window.ML_Premium.adminApprovals(\'vendor\')">Review vendors</button></div><div class="ml-promo"><strong>Rider approvals</strong><span>'+Number(p.pending_riders||0)+' pending rider applications require review.</span><button class="ml-btn ml-btn-secondary" style="margin-top:9px" onclick="window.ML_Premium.adminApprovals(\'rider\')">Review riders</button></div><div class="ml-promo"><strong>Support</strong><span>'+Number(p.open_tickets||0)+' open support tickets in the production database.</span></div></div>'+
      '<div class="ml-section-head"><h3>Recent orders</h3><button onclick="window.ML_Premium.adminRefresh()">Refresh</button></div>'+
      (orders.length?'<div class="ml-profile-card">'+orders.map(function(o){return '<div class="ml-profile-row"><div class="ico">🛒</div><div class="copy"><b>'+esc(o.order_number||o.id)+'</b><span>'+esc(o.customer_name||'Customer')+' · '+esc(o.vendor_name||'Vendor')+' · '+money(o.total||0)+'</span></div><span style="font-size:10px;color:#42D2C9">'+esc(o.status||'')+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No orders yet</b><span>The production database currently has no recent orders.</span></div>')+
      '<div class="ml-section-head"><h3>Top vendors</h3></div>'+
      (vendors.length?'<div class="ml-profile-card">'+vendors.map(function(v){return '<div class="ml-profile-row"><div class="ico">🏪</div><div class="copy"><b>'+esc(v.business_name||'Vendor')+'</b><span>'+Number(v.total_sales||0)+' sales · '+money(v.total_revenue||0)+'</span></div><span style="color:#FFD778">★ '+Number(v.rating_avg||0).toFixed(1)+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No approved vendors yet</b><span>Vendor performance will appear here after real vendors are approved.</span></div>')+
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="ml-btn ml-btn-secondary" style="flex:1" onclick="window.ML_Premium.adminUsers()">Users</button><button class="ml-btn ml-btn-secondary" style="flex:1" onclick="adminLogout()">Sign out</button></div></div>';
    }catch(e){toast(e.error||'Could not load the admin dashboard.','error');}
  }
  async function adminApprovals(kind){
    try{
      var r=kind==='vendor'?await ML_API.vendors.list({page:1,limit:50,kycStatus:'pending'}):await ML_API.riders.list({page:1,limit:50,kycStatus:'pending'});
      var rows=normalizeProducts(r.data),root=G('adash-body');if(!root)return;
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Pending '+(kind==='vendor'?'vendor':'rider')+' applications</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(a){var id=a.user_id||a.id;return '<div class="ml-profile-row"><div class="ico">'+(kind==='vendor'?'🏪':'🛵')+'</div><div class="copy"><b>'+esc(a.business_name||a.full_name||'Applicant')+'</b><span>'+esc(a.business_category||a.vehicle_type||'')+' · KYC: '+esc(a.kyc_status||'pending')+'</span></div><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.approve(\''+esc(id)+'\',\''+kind+'\')">Approve</button></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No pending applications</b><span>The live database has no pending '+(kind==='vendor'?'vendor':'rider')+' applications.</span></div>')+'</div>';
    }catch(e){toast(e.error||'Could not load approvals.','error');}
  }
  async function approveAdmin(id,kind){
    try{if(kind==='vendor')await ML_API.vendors.approve(id,{notes:'Approved from MarketLink Admin Control Center'});else await ML_API.riders.approve(id,{notes:'Approved from MarketLink Admin Control Center'});toast('Application approved ✓');loadAdminDashboard();}
    catch(e){toast(e.error||'Approval failed.','error');}
  }
  async function adminUsers(){
    try{
      var r=await ML_API.admin.users({page:1,limit:50}),d=r.data||{},rows=d.items||[],root=G('adash-body');
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Users</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(u){return '<div class="ml-profile-row"><div class="ico">👤</div><div class="copy"><b>'+esc(u.full_name||'User')+'</b><span>'+esc(u.phone||'')+' · '+esc((u.roles||[]).join(', '))+'</span></div><span style="font-size:10px;color:'+(u.status==='active'?'#42D2C9':'#FF8C75')+'">'+esc(u.status||'')+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No users found</b><span>The production database has no matching users.</span></div>')+'</div>';
    }catch(e){toast(e.error||'Could not load users.','error');}
  }
  async function loadLiveHome(){
    if(!apiOk()){liveProducts=[];liveCategories=[];renderPremiumHome();return;}
    var results=await Promise.all([
      ML_API.products.list({page:1,limit:16,sort:'newest'}),
      ML_API.categories.getTree(),
      ML_API.customers.getProfile(),
      ML_API.customers.getOrderHistory?ML_API.customers.getOrderHistory({page:1,limit:5}):ML_API.customers.getOrders({page:1,limit:5}),
      ML_API.customers.getWallet().catch(function(){return {data:null};}),
      ML_API.customers.getNotifications({page:1,limit:6,unreadOnly:false}).catch(function(){return {data:[]};})
    ].map(function(p){return Promise.resolve(p).catch(function(){return {data:null};});}));
    liveProducts=normalizeProducts(results[0].data);
    liveCategories=Array.isArray(results[1].data)?results[1].data:[];
    liveProfile=results[2].data||null;
    liveOrders=results[3].data||null;
    liveWallet=results[4].data||null;
    liveNotifications=normalizeProducts(results[5].data);
    if(liveProfile){
      S.profileName=liveProfile.full_name||S.profileName||'';
      S.profilePhone=liveProfile.phone||S.profilePhone||'';
      S.profilePhoto=liveProfile.profile_photo_url||S.profilePhoto||null;
      S.walletBalance=Number(liveProfile.wallet_balance||0);
      S.rewardPoints=Number(liveProfile.reward_points||0);
    }
    renderPremiumHome();
  }
  function renderPremiumHome(){
    var root=G('tab-home');if(!root)return;
    var catHtml=liveCategories.slice(0,12).map(function(c){
      var icon=c.icon||'🛍️';
      return '<div class="ml-cat" onclick="window.ML_Premium.openCategory(\''+esc(liveProductId(c.id))+'\')"><div class="ml-cat-icon">'+esc(icon)+'</div><div class="ml-cat-name">'+esc(c.name)+'</div></div>';
    }).join('');
    if(!catHtml) catHtml='<div class="ml-empty" style="width:100%;box-sizing:border-box;"><b>Categories are being prepared</b><span>Live categories will appear here as soon as they are published.</span></div>';
    var prodHtml=liveProducts.map(function(p){return productCard(p);}).join('');
    var orderCount=liveProfile?Number(liveProfile.total_orders||0):0;
    var spent=liveProfile?Number(liveProfile.total_spent||0):0;
    var wallet=liveWallet?Number(liveWallet.balance||0):Number(S.walletBalance||0);
    root.innerHTML=
      '<div class="ml-premium-home">'+
      '<div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink • The Gambia</div><div class="ml-hero-title">Welcome back, '+esc(firstName())+'.</div><div class="ml-hero-sub">Discover verified local products, order securely and track every step from one premium marketplace.</div></div><div class="ml-live-dot">Live marketplace</div></div>'+
      '<section class="ml-hero"><div class="ml-hero-copy"><div class="ml-hero-kicker">🇬🇲 BUILT FOR THE GAMBIAN MARKET</div><h2 style="margin:0;color:#fff;font-size:clamp(25px,4vw,38px);line-height:1.08;">Shop local. Sell smarter. Deliver with confidence.</h2><p style="color:#A9BBC6;max-width:560px;line-height:1.6;font-size:12px;margin:12px 0 0;">Your marketplace dashboard is connected to live MarketLink services. Product availability, wallet data, orders and account information come from your account.</p><div class="ml-hero-actions"><button class="ml-btn ml-btn-primary" onclick="document.getElementById(\'hsearch\')&&document.getElementById(\'hsearch\').focus()">Search marketplace</button><button class="ml-btn ml-btn-secondary" onclick="switchTab(\'orders\')">Track my orders</button></div></div></section>'+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>⚡ Verified marketplace</strong><span>Shop products published by approved vendors.</span></div><div class="ml-promo"><strong>🛵 Delivery network</strong><span>Follow your order through the real delivery workflow.</span></div><div class="ml-promo"><strong>💳 Secure checkout</strong><span>Use supported MarketLink payment methods at checkout.</span></div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Orders</div><div class="ml-stat-value">'+orderCount+'</div></div><div class="ml-stat"><div class="ml-stat-label">Wallet</div><div class="ml-stat-value">'+money(wallet)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Total spent</div><div class="ml-stat-value">'+money(spent)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Reward points</div><div class="ml-stat-value">'+Number(S.rewardPoints||0).toLocaleString()+'</div></div></div>'+
      '<div class="ml-section-head"><h3>Browse categories</h3><button onclick="window.ML_Premium.refresh()">Refresh</button></div><div class="ml-cat-row">'+catHtml+'</div>'+
      '<div class="ml-section-head"><h3>Latest from MarketLink</h3><button onclick="window.ML_Premium.refresh()">View latest</button></div>'+
      (prodHtml?'<div class="ml-product-grid">'+prodHtml+'</div>':'<div class="ml-empty"><div style="font-size:30px">🛍️</div><b>No live products yet</b><span>When an approved vendor publishes an active product, it will appear here automatically. No demo products are being shown.</span></div>')+
      '</div>';
  }
  async function openCategory(id,name){
    try{
      var res=await ML_API.products.list({page:1,limit:40,categoryId:id,sort:'newest'});
      var products=normalizeProducts(res.data);
      var root=G('tab-home');if(!root)return;
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>'+esc(name)+'</h3><button onclick="window.ML_Premium.refresh()">← Marketplace</button></div>'+
        (products.length?'<div class="ml-product-grid">'+products.map(productCard).join('')+'</div>':'<div class="ml-empty"><div style="font-size:30px">📦</div><b>No active products in this category</b><span>This category is live but currently has no approved products.</span></div>')+'</div>';
    }catch(e){toast(e.error||'Could not load this category.','error');}
  }
  function productCard(p){
    var pid=liveProductId(p.id),stock=p.stock==null?null:Number(p.stock);
    return '<article class="ml-product" onclick="window.ML_Premium.openProduct(\''+esc(pid)+'\')"><div class="ml-product-img">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div class="ml-product-body"><div class="ml-product-vendor">'+esc(p.vendor_name||p.vendorName||'MarketLink vendor')+'</div><div class="ml-product-name">'+esc(p.name)+'</div><div class="ml-product-meta"><div><div class="ml-price">'+money(p.price)+'</div><div class="ml-stock">'+(stock==null?'Available':stock>0?stock+' in stock':'Out of stock')+'</div></div><button class="ml-add" '+(stock===0?'disabled':'')+' onclick="event.stopPropagation();window.ML_Premium.add(\''+esc(pid)+'\')">+</button></div></div></article>';
  }
  async function openProduct(id){
    try{
      var res=await ML_API.products.getById(id),p=res.data;if(!p)throw new Error('Product not found');
      var root=G('tab-home');root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Product</h3><button onclick="window.ML_Premium.refresh()">← Marketplace</button></div>'+
        '<div class="ml-profile-card" style="padding:18px"><div class="ml-product-img" style="height:300px;border-radius:15px">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div style="padding-top:16px"><div class="ml-product-vendor">'+esc(p.vendor_name||'MarketLink vendor')+'</div><h2 style="color:#fff;margin:6px 0;font-size:23px">'+esc(p.name)+'</h2><div class="ml-price" style="font-size:22px">'+money(p.price)+'</div><p style="color:#91A4B4;font-size:12px;line-height:1.6">'+esc(p.description||'Product details will appear here when provided by the vendor.')+'</p><button class="ml-btn ml-btn-primary" style="width:100%" onclick="window.ML_Premium.add(\''+esc(liveProductId(p.id))+'\')">Add to cart</button></div></div></div>';
    }catch(e){toast(e.error||'Could not load product.','error');}
  }
  async function add(id){
    try{
      var p=(await ML_API.products.getById(id)).data;
      if(!p)return;
      var key=liveProductId(p.id);
      addCart(key,1,p.name,Number(p.price||0));
      CART_ITEMS[key]=Object.assign({},CART_ITEMS[key]||{}, {id:key,name:p.name,price:Number(p.price||0),vendorId:p.vendor_id||p.vendorId||null,vendorName:p.vendor_name||p.vendorName||'',image:p.primary_image||p.image||null,stock:p.stock==null?null:Number(p.stock),status:p.status||null});
      saveCartToStorage();
      toast(p.name+' added to cart ✓');
    }catch(e){toast(e.error||'Could not add product.','error');}
  }
  var _searchTimer=null;
  async function searchMarketplace(q){
    q=String(q||'').trim();
    clearTimeout(_searchTimer);
    if(!q){return loadLiveHome();}
    _searchTimer=setTimeout(async function(){
      try{
        var res=await ML_API.products.list({search:q,page:1,limit:30,sort:'newest'});
        var products=normalizeProducts(res.data),root=G('tab-home');
        if(!root)return;
        root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Search results</h3><button onclick="window.ML_Premium.refresh()">← Marketplace</button></div><div style="color:#91A4B4;font-size:11px;margin:-4px 0 14px">Live results for “'+esc(q)+'”</div>'+
          (products.length?'<div class="ml-product-grid">'+products.map(productCard).join('')+'</div>':'<div class="ml-empty"><div style="font-size:30px">🔎</div><b>No live products found</b><span>Try another product name or browse the published categories.</span></div>')+'</div>';
      }catch(e){toast(e.error||'Search failed.','error');}
    },280);
  }
  async function refresh(){await loadLiveHome();}
  async function loadLiveAddresses(){
    var r=await ML_API.customers.getAddresses(),rows=normalizeProducts(r.data);
    var selected=rows.find(function(a){return String(a.id)===String(S.delivAddressId||S.deliveryAddressId);})||rows.find(function(a){return a.is_default;});
    if(selected){S.delivAddressId=String(selected.id);S.deliveryAddressId=String(selected.id);S.delivAddr=selected.full_address||S.delivAddr||'';}
    return rows;
  }
  async function renderLiveCart(){
    var root=G('cart-body');if(!root)return;
    if(!apiOk()){root.innerHTML='<div class="ml-empty"><b>Sign in to use your cart</b><span>Checkout uses your authenticated MarketLink account and saved addresses.</span></div>';return;}
    if(!Object.keys(S.cart||{}).length){root.innerHTML='<div class="ml-empty"><div style="font-size:30px">🛒</div><b>Your cart is empty</b><span>Add an active product from the live marketplace to begin checkout.</span></div>';return;}
    root.innerHTML='<div class="ml-loading">Loading live cart…</div>';
    var metadata=await refreshCartMetadata();
    if(metadata.some(function(p){return !p;})){root.innerHTML='<div class="ml-empty"><b>Some cart items are unavailable</b><span>Remove unavailable items and add them again from the live marketplace.</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshCart()">Retry</button></div>';return;}
    var ids=Object.keys(S.cart||{}),vendorIds=metadata.map(function(p){return p&&p.vendorId;}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;});
    var sub=ids.reduce(function(t,id){var p=CART_ITEMS[id];return t+Number(p&&p.price||0)*Number(S.cart[id]||0);},0);
    var addresses;try{addresses=await loadLiveAddresses();}catch(e){root.innerHTML='<div class="ml-empty"><b>Saved addresses unavailable</b><span>'+esc(e.error||'Could not load your saved addresses.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshCart()">Retry</button></div>';return;}
    var addressHtml=addresses.length?addresses.map(function(a){var selected=String(a.id)===String(S.delivAddressId||S.deliveryAddressId);return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;cursor:pointer;border:1px solid '+(selected?'rgba(66,210,201,.55)':'rgba(255,255,255,.07)')+';background:'+(selected?'rgba(13,115,119,.10)':'transparent')+';" onclick="window.ML_Premium.selectAddress(\''+esc(String(a.id))+'\')"><div class="ico">📍</div><div class="copy"><b>'+esc(a.label||'Address')+'</b><span>'+esc(a.full_address||'')+(a.area?' · '+esc(a.area):'')+'</span></div>'+(selected?'<span style="color:#42D2C9;font-size:10px;font-weight:700">Selected</span>':'')+'</button>';}).join(''):'<div class="ml-empty"><b>No saved delivery addresses</b><span>Add your first address in Profile → Saved addresses.</span></div>';
    var paymentHtml=livePaymentOptions().map(function(opt){var selected=(S.selPay||'Pay on Delivery')===opt[0];return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;cursor:pointer;border:1px solid '+(selected?'rgba(66,210,201,.55)':'rgba(255,255,255,.07)')+';background:'+(selected?'rgba(13,115,119,.10)':'transparent')+';" onclick="window.ML_Premium.selectPayment(\''+esc(opt[0])+'\')"><div class="ico">💳</div><div class="copy"><b>'+esc(opt[0])+'</b><span>'+(opt[1]==='cod'?'Pay when your order arrives.':'Payment is initiated through the configured MarketLink provider.')+'</span></div>'+(selected?'<span style="color:#42D2C9;font-size:10px;font-weight:700">Selected</span>':'')+'</button>';}).join('');
    var itemsHtml=ids.map(function(id){var p=CART_ITEMS[id],qty=Number(S.cart[id]||0);return '<div class="ml-profile-row"><div class="ico">🛍️</div><div class="copy"><b>'+esc(p.name)+'</b><span>'+money(p.price)+' × '+qty+' · '+esc(p.vendorName||'Vendor')+'</span></div><strong style="color:#FFD778">'+money(Number(p.price||0)*qty)+'</strong></div>';}).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Your cart</h3><button onclick="window.ML_Premium.refreshCart()">Refresh</button></div><div class="ml-profile-card"><div class="ml-section-head"><h3>Items</h3><span style="color:#91A4B4;font-size:10px">'+vendorIds.length+' vendor'+(vendorIds.length===1?'':'s')+'</span></div>'+itemsHtml+'</div>'+
      (vendorIds.length>1?'<div class="ml-empty" style="margin-top:10px"><b>Multiple vendors in cart</b><span>MarketLink currently requires one vendor per checkout. Remove items from other vendors.</span></div>':'')+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Delivery address</h3><button onclick="window.ML_Premium.manageAddresses()">Manage</button></div>'+addressHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Payment</h3><span style="color:#91A4B4;font-size:10px">Live provider options</span></div>'+paymentHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Coupon</h3><span style="color:#91A4B4;font-size:10px">Validated by backend</span></div><div style="display:flex;gap:8px"><input id="ml-cart-coupon" class="inp" placeholder="Optional coupon code" value="'+esc((S.appliedCoupon&&S.appliedCoupon.code)||'')+'" style="margin:0;flex:1"><button class="ml-btn ml-btn-secondary" type="button" onclick="window.ML_Premium.setCoupon()">Apply</button></div></div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-profile-row"><div class="copy"><b>Subtotal</b><span>Current live product prices; final totals are validated by the backend.</span></div><strong>'+money(sub)+'</strong></div><div class="ml-profile-row"><div class="copy"><b>Delivery</b><span>Calculated by MarketLink server.</span></div><strong>At checkout</strong></div><div class="ml-profile-row"><div class="copy"><b>Total</b><span>The backend confirms the final payable amount.</span></div><strong style="color:#42D2C9">Server-calculated</strong></div></div>'+
      (addresses.length&&String(S.delivAddressId||S.deliveryAddressId)?'<button class="ml-btn ml-btn-primary" data-ml-place-order style="width:100%;margin-top:12px" onclick="window.ML_Premium.placeOrder()">Place Order</button>':'<button class="ml-btn ml-btn-primary" style="width:100%;margin-top:12px" disabled>Select a delivery address first</button>')+
      '</div>';
  }
  function selectAddress(id){S.delivAddressId=String(id);S.deliveryAddressId=String(id);renderLiveCart();}
  function selectPayment(label){S.selPay=label;renderLiveCart();}
  function setCoupon(){var el=G('ml-cart-coupon'),code=el&&el.value.trim().toUpperCase();S.appliedCoupon=code?{code:code}:null;toast(code?'Coupon will be validated securely at order placement.':'Coupon removed.','info');renderLiveCart();}
  function manageAddresses(){switchTab('profile');renderAddresses();}
  async function loadProfile(){
    if(!apiOk())return;
    try{
      var r=await ML_API.customers.getProfile();liveProfile=r.data||liveProfile;
      if(liveProfile){S.profileName=liveProfile.full_name||'';S.profilePhone=liveProfile.phone||'';S.profilePhoto=liveProfile.profile_photo_url||null;}
    }catch(e){}
  }
  async function saveProfilePhoto(file){
    if(!file||!apiOk())return;
    try{
      var uploaded=await ML_API.uploads.upload(file,'profile-photo');
      var url=uploaded&&(uploaded.url||uploaded.file_url||uploaded.location||uploaded.path);
      if(!url)throw new Error('Upload succeeded but no file URL was returned.');
      var r=await ML_API.customers.updateProfile({profilePhotoUrl:url});
      liveProfile=r.data||liveProfile;S.profilePhoto=url;renderPremiumProfile();toast('Profile photo updated ✓');
    }catch(e){toast(e.error||e.message||'Could not update profile photo.','error');}
  }
  function editProfileModal(){
    var n=liveProfile&&liveProfile.full_name||S.profileName||S.user&&S.user.name||'';
    var dob=liveProfile&&liveProfile.date_of_birth||'',gender=liveProfile&&liveProfile.gender||'';
    var html='<div class="ml-modal-form"><label>Display name</label><input id="ml-edit-name" value="'+esc(n)+'" maxlength="80"><label>Date of birth</label><input id="ml-edit-dob" type="date" value="'+esc(String(dob).slice(0,10))+'"><label>Gender</label><select id="ml-edit-gender"><option value="">Prefer not to say</option><option '+(gender==='male'?'selected':'')+' value="male">Male</option><option '+(gender==='female'?'selected':'')+' value="female">Female</option></select><div class="ml-modal-actions"><button class="ml-btn ml-btn-secondary" onclick="closeSheet(\'sh-profile-edit\')">Cancel</button><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.saveProfile()">Save changes</button></div></div>';
    var sh=G('sh-profile-edit');
    if(!sh){sh=document.createElement('div');sh.id='sh-profile-edit';sh.className='sheet';document.body.appendChild(sh);}
    sh.innerHTML='<div class="sheet-in"><div class="sheet-hdr"><span>Edit profile</span><button class="sheet-cls" onclick="closeSheet(\'sh-profile-edit\')">×</button></div>'+html+'</div>';
    openSheet('sh-profile-edit');
  }
  async function saveProfile(){
    var name=G('ml-edit-name')&&G('ml-edit-name').value.trim();
    if(!name){toast('Display name is required.','error');return;}
    try{
      var r=await ML_API.customers.updateProfile({fullName:name,dateOfBirth:G('ml-edit-dob')&&G('ml-edit-dob').value||undefined,gender:G('ml-edit-gender')&&G('ml-edit-gender').value||undefined});
      liveProfile=r.data||liveProfile;S.profileName=name;if(S.user)S.user.name=name;
      closeSheet('sh-profile-edit');renderPremiumProfile();toast('Profile updated ✓');
    }catch(e){toast(e.error||'Could not update profile.','error');}
  }
  async function renderPremiumProfile(){
    await loadProfile();
    var root=G('profile-body');if(!root)return;
    var p=liveProfile||{},name=p.full_name||S.user&&S.user.name||'MarketLink user',phone=p.phone||S.user&&S.user.phone||'';
    var applicationHtml='';
    if(S.user&&S.user.id){
      var apps=await Promise.all([
        ML_API.vendors.getById(S.user.id).catch(function(){return null;}),
        ML_API.riders.getById(S.user.id).catch(function(){return null;})
      ]);
      var appNames=[['Vendor application',apps[0]],['Rider application',apps[1]]];
      appNames.forEach(function(a){
        if(a[1]&&a[1].kyc_status){
          var st=String(a[1].kyc_status).toLowerCase(), label=st==='approved'?'Approved':st==='rejected'?'Rejected':st==='suspended'?'Suspended':'Pending review';
          var icon=st==='approved'?'✓':st==='rejected'?'!':st==='suspended'?'!':'⏳';
          var cls=st==='approved'?'color:#42D2C9':st==='rejected'||st==='suspended'?'color:#FF8A7A':'color:#FFD778';
          applicationHtml+='<div class="ml-profile-row"><div class="ico">'+icon+'</div><div class="copy"><b>'+a[0]+'</b><span>'+label+' · operational access is controlled by admin approval</span></div><b style="'+cls+'">'+label+'</b></div>';
        }
      });
    }
    var photo=p.profile_photo_url||S.profilePhoto;
    var avatar=photo?'<img src="'+esc(photo)+'" alt="Profile">':esc(name.trim().charAt(0).toUpperCase()||'M');
    var roles=(S.roles||[]).map(function(r){return '<span style="font-size:9px;padding:4px 8px;border-radius:99px;background:rgba(13,115,119,.14);color:#42D2C9">'+esc(r)+'</span>';}).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-profile-hero"><div class="ml-avatar">'+avatar+'</div><div><div class="ml-eyebrow">Your MarketLink account</div><div class="ml-profile-name">'+esc(name)+'</div><div class="ml-profile-phone">🇬🇲 '+esc(phone)+'</div><div style="display:flex;gap:5px;margin-top:9px;flex-wrap:wrap">'+roles+'<span style="font-size:9px;padding:4px 8px;border-radius:99px;background:rgba(245,184,61,.1);color:#FFD778">Active account</span></div></div><button class="ml-edit" onclick="window.ML_Premium.editProfile()">Edit profile</button></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">🪪</div><div class="copy"><b>Display name</b><span>'+esc(name)+'</span></div></div>'+applicationHtml+'<div class="ml-profile-row"><div class="ico">📱</div><div class="copy"><b>Phone number</b><span>'+esc(phone)+'</span></div></div><div class="ml-profile-row"><div class="ico">💰</div><div class="copy"><b>Wallet balance</b><span>'+money(p.wallet_balance||0)+'</span></div></div><div class="ml-profile-row"><div class="ico">🛍️</div><div class="copy"><b>Orders completed</b><span>'+Number(p.total_orders||0)+' orders · '+money(p.total_spent||0)+' spent</span></div></div><div class="ml-profile-row" onclick="window.ML_Premium.openOrders()" style="cursor:pointer"><div class="ico">📦</div><div class="copy"><b>Order history</b><span>View your real orders and delivery status</span></div><b style="color:#42D2C9">›</b></div><div class="ml-profile-row" onclick="window.ML_Premium.renderAddresses()" style="cursor:pointer"><div class="ico">📍</div><div class="copy"><b>Saved addresses</b><span>Manage your delivery locations</span></div><b style="color:#42D2C9">›</b></div><div class="ml-profile-row" onclick="doLogout()" style="cursor:pointer"><div class="ico">↪</div><div class="copy"><b>Sign out</b><span>End this session securely</span></div></div></div></div>';
  }
  var liveAddresses=[];
  async function renderAddresses(){
    var root=G('profile-body');if(!root)return;
    try{var r=await ML_API.customers.getAddresses();liveAddresses=Array.isArray(r.data)?r.data:[];}catch(e){toast(e.error||'Could not load saved addresses.','error');return;}
    var cards=liveAddresses.map(function(a){
      return '<div class="ml-profile-card" style="padding:15px;margin-top:10px"><div style="display:flex;align-items:flex-start;gap:10px"><div class="ico" style="width:38px;height:38px">📍</div><div style="flex:1"><b style="color:#EAF2F5;font-size:12px">'+esc(a.label||'Address')+'</b><div style="color:#91A4B4;font-size:11px;line-height:1.5;margin-top:4px">'+esc(a.full_address||'')+'</div>'+(a.area?'<div style="color:#718897;font-size:10px;margin-top:3px">'+esc(a.area)+'</div>':'')+'</div>'+(a.is_default?'<span style="font-size:9px;padding:4px 7px;border-radius:99px;background:rgba(13,115,119,.15);color:#42D2C9">Default</span>':'')+'</div><div style="display:flex;gap:7px;margin-top:12px">'+(!a.is_default?'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.setDefaultAddress('+JSON.stringify(a.id)+')">Set default</button>':'')+'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.deleteAddress('+JSON.stringify(a.id)+')">Delete</button></div></div>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Saved addresses</h3><button onclick="window.ML_Premium.renderProfile()">← Profile</button></div><div class="ml-empty" style="text-align:left;margin-bottom:12px"><b>Delivery locations</b><span>These addresses are stored securely in your MarketLink account and are used for checkout.</span></div><div class="ml-profile-card" style="padding:15px"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin-bottom:6px">Label</label><input id="ml-addr-label" placeholder="Home, Work, Shop" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin:12px 0 6px">Full address</label><input id="ml-addr-full" placeholder="Street, area, city" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin:12px 0 6px">Area (optional)</label><input id="ml-addr-area" placeholder="e.g. Serrekunda" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><button class="ml-btn ml-btn-primary" style="width:100%;margin-top:14px" onclick="window.ML_Premium.addAddress()">Save address</button></div>'+cards+'</div>';
  }
  async function addAddress(){
    var label=G('ml-addr-label')&&G('ml-addr-label').value.trim(),full=G('ml-addr-full')&&G('ml-addr-full').value.trim(),area=G('ml-addr-area')&&G('ml-addr-area').value.trim();
    if(!label||!full){toast('Enter a label and full address.','error');return;}
    try{await ML_API.customers.addAddress({label:label,fullAddress:full,area:area||undefined,isDefault:liveAddresses.length===0});toast('Address saved ✓');await renderAddresses();}catch(e){toast(e.error||'Could not save address.','error');}
  }
  async function setDefaultAddress(id){
    try{await ML_API.customers.updateAddress(id,{isDefault:true});toast('Default address updated ✓');await renderAddresses();}catch(e){toast(e.error||'Could not update address.','error');}
  }
  async function deleteAddress(id){
    try{await ML_API.customers.deleteAddress(id);toast('Address deleted');await renderAddresses();}catch(e){toast(e.error||'Could not delete address.','error');}
  }
  async function submitVendor(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.vForm;
    if(!f.bname||!f.sname||!f.saddr||!f.cat||!f.phone){toast('Complete the business details first.','error');return;}
    try{
      var r=await ML_API.vendors.register({businessName:f.bname,businessCategory:f.cat,businessAddress:f.saddr,phone:'+220'+f.phone,nationalId:f.idDoc||undefined,description:f.sname});
      closeSheet('sh-vapp');toast('Vendor application submitted. Awaiting admin approval ✓');
      S._vendorLiveLoaded=false;renderPremiumProfile();
    }catch(e){toast(e.error||'Vendor application could not be submitted.','error');}
  }
  async function submitRider(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.rForm;
    if(!f.fname||!f.phone||!f.addr||!f.plate||!f.licence){toast('Complete your rider details first.','error');return;}
    try{
      var r=await ML_API.riders.register({vehicleType:'motorbike',plateNumber:f.plate,licenseNumber:f.licence,emergencyContact:f.emergency,address:f.addr});
      closeSheet('sh-rapp');toast('Rider application submitted. Awaiting admin approval ✓');
      S._riderLiveLoaded=false;renderPremiumProfile();
    }catch(e){toast(e.error||'Rider application could not be submitted.','error');}
  }
  async function liveVendorAddProduct(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    var n=G('vp-name'),p=G('vp-price'),s=G('vp-stock');
    var name=n&&n.value.trim(),price=Number(p&&p.value),stock=Number(s&&s.value);
    if(!name||!Number.isFinite(price)||price<0){toast('Enter a valid product name and price.','error');return;}
    try{
      var cats=liveCategories;
      if(!cats.length){var cr=await ML_API.categories.list({page:1,limit:50});cats=normalizeProducts(cr.data);}
      var categoryId=cats[0]&&cats[0].id;
      if(!categoryId){toast('No live product category is available yet.','error');return;}
      var r=await ML_API.products.create({name:name,price:price,categoryId:Number(categoryId),description:'',sku:undefined});
      if(r.data&&r.data.id&&Number.isFinite(stock))await ML_API.products.updateInventory(r.data.id,{quantity:Math.max(0,Math.floor(stock))});
      S._vendorLiveLoaded=false;renderVDash();toast('Product submitted to MarketLink ✓');
    }catch(e){toast(e.error||'Could not create product.','error');}
  }
  async function liveVendorSaveProduct(id){
    var n=G('vpe-name'),p=G('vpe-price'),s=G('vpe-stock');
    var name=n&&n.value.trim(),price=Number(p&&p.value),stock=s&&s.value.trim()===''?null:Number(s.value);
    if(!name||!Number.isFinite(price)){toast('Enter a valid product name and price.','error');return;}
    try{
      await ML_API.products.update(id,{name:name,price:price});
      if(stock!==null&&Number.isFinite(stock))await ML_API.products.updateInventory(id,{quantity:Math.max(0,Math.floor(stock))});
      S._vendorLiveLoaded=false;renderVDash();toast('Product updated ✓');
    }catch(e){toast(e.error||'Could not update product.','error');}
  }
  async function liveVendorRemoveProduct(id){
    if(!confirm('Archive this product?'))return;
    try{await ML_API.products.remove(id);S._vendorLiveLoaded=false;renderVDash();toast('Product archived ✓');}
    catch(e){toast(e.error||'Could not archive product.','error');}
  }
  async function liveVendorToggleOnline(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    try{var next=!S.vOnline;var r=await ML_API.vendors.updateProfile({isOpen:next});S.vOnline=!!(r.data&&r.data.is_open!==undefined?r.data.is_open:next);renderVDash();toast(S.vOnline?'Store is open 🟢':'Store is closed');}
    catch(e){toast(e.error||'Could not update store status.','error');}
  }
  async function liveRiderNextStep(){
    if(!S.activeDel||!S.activeDel.id){toast('No active delivery.','error');return;}
    var current=S.activeDel.status, next={assigned:'picked_up',picked_up:'in_transit',in_transit:'delivered'}[current];
    if(!next){toast('This delivery is not ready for the next step.','error');return;}
    try{
      var r=await ML_API.delivery.updateStatus(S.activeDel.id,next);
      S.activeDel=Object.assign({},S.activeDel,r.data||{},{status:next});
      if(next==='delivered'){S.activeDel=null;S._riderLiveLoaded=false;}
      renderRDash();toast(next==='delivered'?'Delivery completed ✓':'Delivery status updated ✓');
    }catch(e){toast(e.error||'Could not update delivery status.','error');}
  }
  async function toggleRiderOnline(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    try{var next=!S.rOnline;await ML_API.delivery.setAvailability(next);S.rOnline=next;renderRDash();toast(next?'You are online and eligible for deliveries.':'You are offline.');}
    catch(e){toast(e.error||'Could not change rider availability.','error');}
  }
  async function reorderLive(orderId,itemsDesc,total,rawItems){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var lines=Array.isArray(rawItems)?rawItems:[];
    if(!lines.length){toast('This order has no reorderable live items.','error');return;}
    var added=0,missing=0;
    for(var i=0;i<lines.length;i++){
      var line=lines[i],pid=line.product_id||line.productId;
      if(!pid)continue;
      try{
        var r=await ML_API.products.getById(pid),p=r.data;
        if(!p||p.status!=='active'){missing++;continue;}
        var key=liveProductId(p.id);
        S.cart[key]=Number(S.cart[key]||0)+Number(line.qty||line.quantity||1);
        CART_ITEMS[key]={id:key,name:p.name,price:Number(p.price||0),vendorId:p.vendor_id||p.vendorId||null,vendorName:p.vendor_name||p.vendorName||'',image:p.primary_image||p.image||null,stock:p.stock==null?null:Number(p.stock),status:p.status||null};added++;
      }catch(e){missing++;}
    }
    if(added){toast(added+' live item'+(added===1?'':'s')+' added to cart 🛒');switchTab('cart');}
    else toast('None of the original products are currently available.','error');
    if(missing)toast(missing+' item'+(missing===1?' is':'s are')+' no longer available; those were not added.','info');
  }
  async function liveAdminData(){
    if(!ML_API.getAccessToken || !ML_API.getAccessToken()) return null;
    var r=await ML_API.admin.dashboard(); return r.data||null;
  }
  function liveAdminCard(label,value,icon,sub){
    return '<div class="ml-stat"><div style="font-size:18px;margin-bottom:6px">'+icon+'</div><div class="ml-stat-label">'+esc(label)+'</div><div class="ml-stat-value">'+esc(value)+'</div><div style="font-size:9px;color:#718795;margin-top:4px">'+esc(sub||'Live backend data')+'</div></div>';
  }
  function liveAdminOverview(d){
    var s=d.stats||{}, p=d.pendingApprovals||{};
    return '<div class="ml-premium-home"><div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink • Admin Control Center</div><div class="ml-hero-title">Live platform overview.</div><div class="ml-hero-sub">Operational metrics below are read directly from the production backend. No seeded dashboard totals are shown.</div></div><div class="ml-live-dot">Production API</div></div>'+
      '<div class="ml-hero"><div class="ml-hero-copy"><div class="ml-hero-kicker">LIVE OPERATIONS</div><h2 style="margin:0;color:#fff;font-size:30px">Run MarketLink with confidence.</h2><p style="color:#A9BBC6;font-size:12px;line-height:1.6">Monitor customers, approved vendors, online riders, orders, revenue and onboarding approvals from one responsive workspace.</p></div></div>'+
      '<div class="ml-stat-grid">'+
      liveAdminCard('Active customers',Number(s.activeCustomers||0).toLocaleString(),'👥','Live users')+
      liveAdminCard('Approved vendors',Number(s.approvedVendors||0).toLocaleString(),'🏪','Approved stores')+
      liveAdminCard('Online riders',Number(s.onlineRiders||0).toLocaleString(),'🛵','Currently online')+
      liveAdminCard('Orders · 30 days',Number(s.orders30d||0).toLocaleString(),'📦','Rolling 30 days')+
      '</div><div class="ml-stat-grid">'+
      liveAdminCard('Revenue · 30 days',money(s.revenue30d),'💰','Delivered orders')+
      liveAdminCard('Revenue · 7 days',money(s.revenue7d),'📈','Delivered orders')+
      liveAdminCard('Active orders',Number(s.activeOrders||0).toLocaleString(),'⚡','Current workflow')+
      liveAdminCard('Open tickets',Number(p.open_tickets||0).toLocaleString(),'🎫','Support queue')+
      '</div>'+
      '<div class="ml-section-head"><h3>Approvals requiring attention</h3></div>'+
      '<div class="ml-promo-strip"><div class="ml-promo" style="cursor:pointer" onclick="adminGoTo(\'appr-pv\')"><strong>🏪 '+Number(p.pending_vendors||0)+' vendor applications</strong><span>Review real vendor onboarding records.</span></div><div class="ml-promo" style="cursor:pointer" onclick="adminGoTo(\'appr-pr\')"><strong>🛵 '+Number(p.pending_riders||0)+' rider applications</strong><span>Review real rider onboarding records.</span></div><div class="ml-promo"><strong>🧠 AI operations</strong><span>Knowledge and support tools remain protected by admin authentication.</span></div></div>'+
      '<div class="ml-section-head"><h3>Recent orders</h3><button onclick="window.ML_Premium.refreshAdmin()">Refresh</button></div>'+
      (d.recentOrders&&d.recentOrders.length?'<div class="ml-profile-card">'+d.recentOrders.slice(0,8).map(function(o){return '<div class="ml-profile-row"><div class="ico">📦</div><div class="copy"><b>'+esc(o.order_number||o.id)+'</b><span>'+esc(o.customer_name||'Customer')+' · '+esc(o.vendor_name||'Vendor')+' · '+money(o.total)+'</span></div><span style="font-size:9px;color:#42D2C9">'+esc(o.status)+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No recent production orders</b><span>New real orders will appear here.</span></div>')+
      '</div>';
  }
  async function refreshAdmin(){
    try{var d=await liveAdminData();if(!d){toast('Admin session required.','error');return;}var root=G('adm-content');if(root)root.innerHTML=liveAdminOverview(d);}catch(e){toast(e.error||'Could not load live admin data.','error');}
  }
  function adminGoToLive(tab){
    if(tab==='overview'){refreshAdmin();return;}
    if(tab==='appr-pv'||tab==='appr-pr'){
      var kind=tab==='appr-pv'?'vendor':'rider';
      var call=kind==='vendor'?ML_API.vendors.list({page:1,limit:100,kycStatus:'pending'}):ML_API.riders.list({page:1,limit:100,kycStatus:'pending'});
      Promise.resolve(call).then(function(r){
        var items=(r.data&&r.data.items)||r.data||[];
        var root=G('adm-content');if(!root)return;
        root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Live '+(kind==='vendor'?'Vendor':'Rider')+' Approvals</h3><button onclick="window.ML_Premium.refreshAdmin()">← Overview</button></div>'+
          (items.length?items.map(function(a){var id=a.id||a.user_id;return '<div class="ml-profile-card" style="margin-bottom:10px;padding:14px"><div style="display:flex;gap:12px;align-items:center"><div class="ml-avatar" style="width:48px;height:48px;border-radius:14px">'+(kind==='vendor'?'🏪':'🛵')+'</div><div style="flex:1"><b style="color:#fff">'+esc(a.business_name||a.full_name||'Application')+'</b><div style="font-size:10px;color:#8195A4;margin-top:3px">'+esc(a.phone||a.business_address||a.address||'')+'</div><div style="font-size:9px;color:#F5B83D;margin-top:4px">KYC: '+esc(a.kyc_status||'pending')+'</div></div></div><div style="display:flex;gap:8px;margin-top:12px"><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.approveApplicant(\''+esc(id)+'\',\''+kind+'\')">Approve</button><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.rejectApplicant(\''+esc(id)+'\',\''+kind+'\')">Reject</button></div></div>';}).join(''):'<div class="ml-empty"><b>No pending '+kind+' applications</b><span>The production database has no records awaiting approval.</span></div>')+'</div>';
      }).catch(function(e){toast(e.error||'Could not load approvals.','error');});
      return;
    }
    if(typeof window.__ML_ORIGINAL_ADMIN_GOTO==='function') return window.__ML_ORIGINAL_ADMIN_GOTO(tab);
  }
  async function approveApplicant(id,kind){
    try{await (kind==='vendor'?ML_API.vendors.approve(id,{notes:'Approved from MarketLink admin dashboard'}):ML_API.riders.approve(id,{notes:'Approved from MarketLink admin dashboard'}));toast((kind==='vendor'?'Vendor':'Rider')+' approved ✓');adminGoToLive(kind==='vendor'?'appr-pv':'appr-pr');}
    catch(e){toast(e.error||'Approval failed.','error');}
  }
  async function rejectApplicant(id,kind){
    try{var reason=window.prompt('Reason for rejection:','Please review your submitted information and documents.');if(!reason)return;await (kind==='vendor'?ML_API.vendors.reject(id,{reason:reason}):ML_API.riders.reject(id,{reason:reason}));toast((kind==='vendor'?'Vendor':'Rider')+' rejected.','error');adminGoToLive(kind==='vendor'?'appr-pv':'appr-pr');}
    catch(e){toast(e.error||'Rejection failed.','error');}
  }
  function obNextLive(){
    var slide=G('ob-slide'), dots=G('ob-dots'), btn=G('ob-btn');
    var slides=[
      ['🛍️','Shop trusted local products','Discover products from MarketLink vendors across The Gambia.'],
      ['🛵','Track every delivery','Follow real order and rider updates from checkout to delivery.'],
      ['🇬🇲','Built for The Gambia','A connected marketplace for customers, vendors and riders.']
    ];
    var i=Number(S.obSlide||0); if(i>=slides.length-1){goAuth();return;} i++;S.obSlide=i;
    if(slide)slide.innerHTML='<div style="font-size:64px;margin:30px 0 16px">'+slides[i][0]+'</div><h2 style="color:#fff;margin:0 0 8px">'+slides[i][1]+'</h2><p style="color:#91A4B4;line-height:1.6;font-size:12px">'+slides[i][2]+'</p>';
    if(dots)dots.innerHTML=slides.map(function(_,n){return '<span style="width:7px;height:7px;border-radius:50%;background:'+(n===i?'#11A8A1':'#40515E')+'"></span>';}).join('');
    if(btn)btn.textContent=i===slides.length-1?'Get started →':'Next →';
  }
  function continueOtpLive(){closeSheet('sh-otp-reveal');}
  function adminGoToLiveSafe(tab){adminGoToLive(tab);}
  window.obNext=obNextLive;
  window.continueFromOtpReveal=continueOtpLive;
  window.adminGoTo=adminGoToLiveSafe;
  window.__ML_ORIGINAL_ADMIN_GOTO=window.adminGoTo;
  window.adminGoTo=adminGoToLive;
    window.ML_Premium={refresh:refresh,refreshCart:renderLiveCart,refreshAdmin:refreshAdmin,selectAddress:selectAddress,selectPayment:selectPayment,setCoupon:setCoupon,manageAddresses:manageAddresses,approveApplicant:approveApplicant,rejectApplicant:rejectApplicant,openCategory:openCategory,openProduct:openProduct,add:add,placeOrder:placeLiveOrder,editProfile:editProfileModal,saveProfile:saveProfile,saveProfilePhoto:saveProfilePhoto,pickPhoto:function(){var el=document.getElementById('ml-profile-photo-input');if(el)el.click();},renderProfile:renderPremiumProfile,submitVendor:submitVendor,submitRider:submitRider,toggleRiderOnline:toggleRiderOnline,load:loadLiveHome,adminRefresh:loadAdminDashboard,adminApprovals:adminApprovals,approve:approveAdmin,adminUsers:adminUsers};
  function switchTab(tab){
    S.curTab=tab;
    ['home','catpage','store','cart','orders','profile','vendordash','riderdash','admindash'].forEach(function(x){var el=G('tab-'+x);if(el)el.style.display='none';});
    var target=G('tab-'+tab);if(target)target.style.display='block';
    var nav=G('bnav');if(nav)nav.style.display=tab==='admindash'?'none':'flex';
    if(tab==='home')renderHome(); else if(tab==='cart')renderCart(); else if(tab==='orders'){renderOrders();if(typeof startOrderTracking==='function'&&S.order)startOrderTracking();}
    else if(tab==='profile')renderProfile(); else if(tab==='vendordash')renderVDash(); else if(tab==='riderdash')renderRDash(); else if(tab==='admindash')renderAdminDash();
    else if(tab==='catpage'&&typeof renderCatProdCtrl==='function')renderCatProdCtrl(); else if(tab==='store'&&typeof renderStoreProdCtrl==='function')renderStoreProdCtrl();
    document.querySelectorAll('.ntab').forEach(function(n){n.classList.toggle('sel',n.dataset.tab===tab);});
  }
  window.switchTab=switchTab;
  async function renderAdminDash(){
    var el=G('adash-body');if(!el)return;
    el.innerHTML='<div class="ml-premium-home"><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Live Control Center</div><div class="ml-hero-sub">Loading production metrics…</div></div>';
    try{
      var r=await ML_API.admin.dashboard(),d=r.data||{},st=d.stats||{},pa=d.pendingApprovals||{},recent=Array.isArray(d.recentOrders)?d.recentOrders:[],vendors=Array.isArray(d.topVendors)?d.topVendors:[];
      el.innerHTML='<div class="ml-premium-home"><div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Live Control Center</div><div class="ml-hero-sub">Production metrics from the authenticated MarketLink backend.</div></div><div class="ml-live-dot">Backend connected</div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Active customers</div><div class="ml-stat-value">'+Number(st.activeCustomers||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Approved vendors</div><div class="ml-stat-value">'+Number(st.approvedVendors||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Online riders</div><div class="ml-stat-value">'+Number(st.onlineRiders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Orders · 30 days</div><div class="ml-stat-value">'+Number(st.orders30d||0)+'</div></div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Delivered</div><div class="ml-stat-value">'+Number(st.completedOrders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Active orders</div><div class="ml-stat-value">'+Number(st.activeOrders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Revenue · 30 days</div><div class="ml-stat-value">'+money(st.revenue30d||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Pending approvals</div><div class="ml-stat-value">'+(Number(pa.pending_vendors||0)+Number(pa.pending_riders||0))+'</div></div></div>'+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>🏪 Vendor approvals</strong><span>'+Number(pa.pending_vendors||0)+' vendor application(s) pending.</span></div><div class="ml-promo"><strong>🛵 Rider approvals</strong><span>'+Number(pa.pending_riders||0)+' rider application(s) pending.</span></div><div class="ml-promo"><strong>🎫 Support tickets</strong><span>'+Number(pa.open_tickets||0)+' open support ticket(s).</span></div></div>'+
      '<div class="ml-section-head"><h3>Recent production orders</h3><button onclick="window.ML_Premium.adminRefresh()">Refresh</button></div>'+
      (recent.length?'<div class="ml-profile-card">'+recent.map(function(o){return '<div class="ml-profile-row"><div class="ico">📦</div><div class="copy"><b>'+esc(o.order_number||o.id)+'</b><span>'+esc(o.customer_name||'Customer')+' · '+esc(o.vendor_name||'Vendor')+' · '+esc(o.status||'')+'</span></div><strong style="color:#42D2C9;font-size:11px">'+money(o.total)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No production orders yet</b><span>No demo orders are shown.</span></div>')+
      '<div class="ml-section-head"><h3>Top approved vendors</h3></div>'+
      (vendors.length?'<div class="ml-profile-card">'+vendors.map(function(v){return '<div class="ml-profile-row"><div class="ico">🏪</div><div class="copy"><b>'+esc(v.business_name||'Vendor')+'</b><span>'+Number(v.total_sales||0)+' sales · '+money(v.total_revenue||0)+' revenue</span></div><span style="color:#FFD778">★ '+Number(v.rating_avg||0).toFixed(1)+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No approved vendors yet</b><span>Real vendor performance will appear here after transactions.</span></div>')+
      '</div>';
    }catch(e){el.innerHTML='<div class="ml-empty" style="margin:20px"><b>Live admin data unavailable</b><span>'+esc(e.error||e.message||'Backend did not return production metrics.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.adminRefresh()">Retry</button></div>';}
  }
  window.renderAdminDash=renderAdminDash;
  var oldRenderHome=window.renderHome,oldRenderProfile=window.renderProfile;
  window.renderHome=function(){loadLiveHome().catch(function(e){toast(e.error||'Could not load the marketplace.','error');});};
  window.openCategory=function(cat){if(cat&&cat.id){return openCategory(cat.id,cat.name||'Category');}return loadLiveHome();};
  window.openProductDetail=function(id){return openProduct(id);};
  window.doSearch=function(q){return searchMarketplace(q);};
  window.renderProfile=function(){renderPremiumProfile().catch(function(e){toast(e.error||'Could not load your profile.','error');});};
  window.renderAdminDash=function(){loadAdminDashboard().catch(function(e){toast(e.error||'Could not load the admin dashboard.','error');});};
  window.placeOrder=placeLiveOrder;
  window.renderCart=renderLiveCart;
  window.applyCoupon=setCoupon;
  window.removeCoupon=function(){S.appliedCoupon=null;renderLiveCart();};
  window.vAddProd=liveVendorAddProduct;
  window.vSaveProdEdit=liveVendorSaveProduct;
  window.vRemoveProd=liveVendorRemoveProduct;
  window.vToggleOnline=liveVendorToggleOnline;
  window.rNextStep=liveRiderNextStep;
  window.doSearch=liveSearch;
  window.submitVApp=submitVendor;
  window.submitRApp=submitRider;
  window.rToggleOnline=toggleRiderOnline;
  window.editName=editProfileModal;
  window.reorderPastOrder=reorderLive;
  window.renderAddrPage=renderAddresses;
  window.addAddr=function(){renderAddresses();};
  window.saveNewAddr=addAddress;
  window.setDefAddr=setDefaultAddress;
  window.delAddr=deleteAddress;
  window.doAdminLogin=liveAdminLogin;
  window.renderPremiumAdminLogin=function(){var i=G('admin-staffid'),p=G('admin-password');if(i){i.placeholder='Admin phone number';i.type='tel';i.inputMode='tel';}if(p){p.placeholder='4-digit PIN';p.maxLength=4;}};
  window.handlePhoto=function(inp){if(inp&&inp.files&&inp.files[0])saveProfilePhoto(inp.files[0]);};
  window.uploadPhoto=function(){var el=document.getElementById('ml-profile-photo-input');if(el)el.click();};
  // Remove the persistent fake/offline demo banner when backend is available.
  window.ML_Premium.removeDemoBanner=function(){var b=G('demo-mode-banner');if(b)b.remove();};
  document.addEventListener('DOMContentLoaded',function(){
    if(window.ML_Premium.renderPremiumAdminLogin)window.ML_Premium.renderPremiumAdminLogin();
    setTimeout(function(){if(apiOk())window.ML_Premium.removeDemoBanner();},1200);
  });
})();