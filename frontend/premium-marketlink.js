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
      var r=await ML_API.vendors.register({businessName:f.bname,shopName:f.sname,address:f.saddr,category:f.cat,phone:'+220'+f.phone,nationalIdUrl:f.idDoc||undefined,shopPhotoUrl:f.photo||undefined});
      closeSheet('sh-vapp');toast('Vendor application submitted. Awaiting approval ✓');if(r.data&&r.data.kyc_status)toast('KYC status: '+r.data.kyc_status);
      S._vendorLiveLoaded=false;renderPremiumProfile();
    }catch(e){toast(e.error||'Vendor application could not be submitted.','error');}
  }
  async function submitRider(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.rForm;
    if(!f.fname||!f.phone||!f.addr||!f.plate||!f.licence){toast('Complete your rider details first.','error');return;}
    try{
      var r=await ML_API.riders.register({fullName:f.fname,phone:'+220'+f.phone,address:f.addr,vehiclePlate:f.plate,licenseNumber:f.licence,emergencyContact:f.emergency,documentUrl:f.docs||undefined});
      closeSheet('sh-rapp');toast('Rider application submitted. Awaiting approval ✓');if(r.data&&r.data.kyc_status)toast('KYC status: '+r.data.kyc_status);
      S._riderLiveLoaded=false;renderPremiumProfile();
    }catch(e){toast(e.error||'Rider application could not be submitted.','error');}
  }
  async function toggleRiderOnline(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    try{var next=!S.rOnline;await ML_API.delivery.setAvailability(next);S.rOnline=next;renderRDash();toast(next?'You are online and eligible for deliveries.':'You are offline.');}
    catch(e){toast(e.error||'Could not change rider availability.','error');}
  }
  window.ML_Premium={refresh:refresh,openCategory:openCategory,openProduct:openProduct,add:add,editProfile:editProfileModal,saveProfile:saveProfile,renderProfile:renderPremiumProfile,submitVendor:submitVendor,submitRider:submitRider,toggleRiderOnline:toggleRiderOnline,load:loadLiveHome};
  var oldRenderHome=window.renderHome,oldRenderProfile=window.renderProfile;
  window.renderHome=function(){loadLiveHome().catch(function(e){toast(e.error||'Could not load the marketplace.','error');});};
  window.renderProfile=function(){renderPremiumProfile().catch(function(e){toast(e.error||'Could not load your profile.','error');});};
  window.submitVApp=submitVendor;
  window.submitRApp=submitRider;
  window.rToggleOnline=toggleRiderOnline;
  window.editName=editProfileModal;
  // Remove the persistent fake/offline demo banner when backend is available.
  window.ML_Premium.removeDemoBanner=function(){var b=G('demo-mode-banner');if(b)b.remove();};
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){if(apiOk())window.ML_Premium.removeDemoBanner();},300);
  });
})();