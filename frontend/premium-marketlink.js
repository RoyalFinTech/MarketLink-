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
  async function placeLiveOrder(){
    if(!apiOk()){toast('Please sign in before placing an order.','error');return;}
    var ids=Object.keys(S.cart||{});
    if(!ids.length){toast('Your cart is empty.','error');return;}
    var items=ids.map(function(id){var p=CART_ITEMS[id];return {productId:id,quantity:Number(S.cart[id]||1),vendorId:p&&p.vendorId};});
    var vendors=items.map(function(x){return x.vendorId;}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;});
    if(vendors.length!==1){toast('Please place separate orders for products from different vendors.','error');return;}
    var addressId=null;
    var address=String(S.delivAddr||'').trim();
    if(address){
      try{
        var ar=await ML_API.customers.addAddress({label:'Checkout',fullAddress:address,area:'The Gambia',latitude:S.delivLat||null,longitude:S.delivLng||null,isDefault:false});
        addressId=ar.data&&ar.data.id||null;
      }catch(e){}
    }
    var payload={vendorId:vendors[0],items:items.map(function(x){return {productId:x.productId,quantity:x.quantity};}),deliveryAddressId:addressId||undefined,paymentMethod:(S.selPay||'Pay on Delivery')==='Pay on Delivery'?'cod':String(S.selPay||'cod').toLowerCase().replace(/\s+/g,'-'),couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined};
    try{
      var r=await ML_API.orders.place(payload),o=r.data&&r.data.order;
      S.order=o||r.data;S.orderSI=0;S.cart={};CART_ITEMS={};updateCartBadge();saveCartToStorage();switchTab('orders');toast('Order placed successfully ✓');
    }catch(e){toast(e.error||'Could not place your order.','error');}
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
      return '<div class="ml-cat" onclick="window.ML_Premium.openCategory('+Number(c.id)+','+JSON.stringify(c.name||'')+')"><div class="ml-cat-icon">'+esc(icon)+'</div><div class="ml-cat-name">'+esc(c.name)+'</div></div>';
    }).join('');
    if(!catHtml) catHtml='<div class="ml-empty" style="width:100%;box-sizing:border-box;"><b>Categories are being prepared</b><span>Live categories will appear here as soon as they are published.</span></div>';
    var prodHtml=liveProducts.map(function(p){
      var stock=p.stock==null?null:Number(p.stock);
      return '<article class="ml-product" onclick="window.ML_Premium.openProduct('+Number(p.id)+')">'+
        '<div class="ml-product-img">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div>'+
        '<div class="ml-product-body"><div class="ml-product-vendor">'+esc(p.vendor_name||'MarketLink vendor')+'</div>'+
        '<div class="ml-product-name">'+esc(p.name)+'</div><div class="ml-product-meta"><div><div class="ml-price">'+money(p.price)+'</div>'+
        '<div class="ml-stock">'+(stock==null?'Available':stock>0?(stock+' in stock'):'Out of stock')+'</div></div>'+
        '<button class="ml-add" '+(stock===0?'disabled':'')+' onclick="event.stopPropagation();window.ML_Premium.add('+Number(p.id)+')">+</button></div></div></article>';
    }).join('');
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
    return '<article class="ml-product" onclick="window.ML_Premium.openProduct('+Number(p.id)+')"><div class="ml-product-img">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div class="ml-product-body"><div class="ml-product-vendor">'+esc(p.vendor_name||'MarketLink vendor')+'</div><div class="ml-product-name">'+esc(p.name)+'</div><div class="ml-product-meta"><div class="ml-price">'+money(p.price)+'</div><button class="ml-add" onclick="event.stopPropagation();window.ML_Premium.add('+Number(p.id)+')">+</button></div></div></article>';
  }
  async function openProduct(id){
    try{
      var res=await ML_API.products.getById(id),p=res.data;if(!p)throw new Error('Product not found');
      var root=G('tab-home');root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Product</h3><button onclick="window.ML_Premium.refresh()">← Marketplace</button></div>'+
        '<div class="ml-profile-card" style="padding:18px"><div class="ml-product-img" style="height:300px;border-radius:15px">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div style="padding-top:16px"><div class="ml-product-vendor">'+esc(p.vendor_name||'MarketLink vendor')+'</div><h2 style="color:#fff;margin:6px 0;font-size:23px">'+esc(p.name)+'</h2><div class="ml-price" style="font-size:22px">'+money(p.price)+'</div><p style="color:#91A4B4;font-size:12px;line-height:1.6">'+esc(p.description||'Product details will appear here when provided by the vendor.')+'</p><button class="ml-btn ml-btn-primary" style="width:100%" onclick="window.ML_Premium.add('+Number(p.id)+')">Add to cart</button></div></div></div>';
    }catch(e){toast(e.error||'Could not load product.','error');}
  }
  async function add(id){
    try{
      var p=(await ML_API.products.getById(id)).data;
      if(!p)return;
      addCart(p.id,1,p.name,Number(p.price||0));
      CART_ITEMS[p.id]=Object.assign({},CART_ITEMS[p.id]||{}, {id:p.id,name:p.name,price:Number(p.price||0),vendorId:p.vendor_id||p.vendorId||null,image:p.primary_image||null});
      saveCartToStorage();
      toast(p.name+' added to cart ✓');
    }catch(e){toast(e.error||'Could not add product.','error');}
  }
  async function refresh(){await loadLiveHome();}
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
    var photo=p.profile_photo_url||S.profilePhoto;
    var avatar=photo?'<img src="'+esc(photo)+'" alt="Profile">':esc(name.trim().charAt(0).toUpperCase()||'M');
    var roles=(S.roles||[]).map(function(r){return '<span style="font-size:9px;padding:4px 8px;border-radius:99px;background:rgba(13,115,119,.14);color:#42D2C9">'+esc(r)+'</span>';}).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-profile-hero"><div class="ml-avatar">'+avatar+'</div><div><div class="ml-eyebrow">Your MarketLink account</div><div class="ml-profile-name">'+esc(name)+'</div><div class="ml-profile-phone">🇬🇲 '+esc(phone)+'</div><div style="display:flex;gap:5px;margin-top:9px;flex-wrap:wrap">'+roles+'<span style="font-size:9px;padding:4px 8px;border-radius:99px;background:rgba(245,184,61,.1);color:#FFD778">Verified account</span></div></div><button class="ml-edit" onclick="window.ML_Premium.editProfile()">Edit profile</button></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">🪪</div><div class="copy"><b>Display name</b><span>'+esc(name)+'</span></div></div><div class="ml-profile-row"><div class="ico">📱</div><div class="copy"><b>Phone number</b><span>'+esc(phone)+'</span></div></div><div class="ml-profile-row"><div class="ico">💰</div><div class="copy"><b>Wallet balance</b><span>'+money(p.wallet_balance||0)+'</span></div></div><div class="ml-profile-row"><div class="ico">🛍️</div><div class="copy"><b>Orders completed</b><span>'+Number(p.total_orders||0)+' orders · '+money(p.total_spent||0)+' spent</span></div></div><div class="ml-profile-row" onclick="S.profilePage=\'orders\';renderProfile();" style="cursor:pointer"><div class="ico">📦</div><div class="copy"><b>Order history</b><span>View your real orders and delivery status</span></div><b style="color:#42D2C9">›</b></div><div class="ml-profile-row" onclick="S.profilePage=\'addresses\';renderProfile();" style="cursor:pointer"><div class="ico">📍</div><div class="copy"><b>Saved addresses</b><span>Manage your delivery locations</span></div><b style="color:#42D2C9">›</b></div><div class="ml-profile-row" onclick="doLogout()" style="cursor:pointer"><div class="ico">↪</div><div class="copy"><b>Sign out</b><span>End this session securely</span></div></div></div></div>';
  }
  async function submitVendor(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.vForm;
    if(!f.bname||!f.sname||!f.saddr||!f.cat||!f.phone){toast('Complete the business details first.','error');return;}
    try{
      var r=await ML_API.vendors.register({businessName:f.bname,businessCategory:f.cat,businessAddress:f.saddr,phone:'+220'+f.phone,nationalId:f.idDoc||undefined,description:f.sname});
      closeSheet('sh-vapp');toast('Vendor application submitted. Awaiting approval ✓');if(r.data&&r.data.kyc_status)toast('KYC status: '+r.data.kyc_status);
      S._vendorLiveLoaded=false;renderPremiumProfile();
    }catch(e){toast(e.error||'Vendor application could not be submitted.','error');}
  }
  async function submitRider(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.rForm;
    if(!f.fname||!f.phone||!f.addr||!f.plate||!f.licence){toast('Complete your rider details first.','error');return;}
    try{
      var r=await ML_API.riders.register({vehicleType:'motorcycle',plateNumber:f.plate,licenseNumber:f.licence,emergencyContact:f.emergency,address:f.addr});
      closeSheet('sh-rapp');toast('Rider application submitted. Awaiting approval ✓');if(r.data&&r.data.kyc_status)toast('KYC status: '+r.data.kyc_status);
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
  window.ML_Premium={refresh:refresh,openCategory:openCategory,openProduct:openProduct,add:add,placeOrder:placeLiveOrder,editProfile:editProfileModal,saveProfile:saveProfile,saveProfilePhoto:saveProfilePhoto,pickPhoto:function(){var el=document.getElementById('ml-profile-photo-input');if(el)el.click();},renderProfile:renderPremiumProfile,submitVendor:submitVendor,submitRider:submitRider,toggleRiderOnline:toggleRiderOnline,load:loadLiveHome,adminRefresh:loadAdminDashboard,adminApprovals:adminApprovals,approve:approveAdmin,adminUsers:adminUsers};
  var oldRenderHome=window.renderHome,oldRenderProfile=window.renderProfile;
  window.renderHome=function(){loadLiveHome().catch(function(e){toast(e.error||'Could not load the marketplace.','error');});};
  window.renderProfile=function(){renderPremiumProfile().catch(function(e){toast(e.error||'Could not load your profile.','error');});};
  window.renderAdminDash=function(){loadAdminDashboard().catch(function(e){toast(e.error||'Could not load the admin dashboard.','error');}};
  window.placeOrder=placeLiveOrder;
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