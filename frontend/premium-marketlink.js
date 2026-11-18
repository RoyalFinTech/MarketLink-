/* MarketLink Premium live frontend layer
   Keeps the official embedded MarketLink logo and existing routing.
   Replaces customer-facing mock dashboard/profile surfaces with backend data.
*/
(function(){
  'use strict';
  try {
  var liveProducts=[], liveCategories=[], liveProfile=null, liveOrders=null, liveWallet=null, liveNotifications=[];
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function money(v){return 'D '+Number(v||0).toLocaleString('en-GM',{maximumFractionDigits:2});}
  function gambiaFlagMarkup(){
    return '<svg class="gmf-svg" role="img" aria-label="Flag of The Gambia" title="The Gambia" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg" focusable="false" style="width:26px;height:18px;display:inline-block;vertical-align:middle;flex-shrink:0;border-radius:2px;overflow:hidden;">'+
      '<rect width="18" height="12" fill="#FFFFFF"/>'+
      '<rect x="0" y="0" width="18" height="4" fill="#CE1126"/>'+
      '<rect x="0" y="4.6667" width="18" height="2.6666" fill="#0C1C8C"/>'+
      '<rect x="0" y="8" width="18" height="4" fill="#3A7728"/>'+
      '</svg>';
  }
  function firstName(){var n=(liveProfile&&liveProfile.full_name)||(S.user&&S.user.name)||S.profileName||'there';return String(n).trim().split(/\s+/)[0]||'there';}
  function apiOk(){return ML_API&&ML_API.auth&&ML_API.auth.isAuthenticated();}
  function imageOrFallback(p){
    if(p.primary_image) return '<img src="'+esc(p.primary_image)+'" alt="'+esc(p.name||'Product')+'" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.ml-product-emoji\').style.display=\'block\';">';
    return '';
  }
  function normalizeProducts(d){return Array.isArray(d)?d:(d&&Array.isArray(d.items)?d.items:[]);}
  function liveProductId(id){return id==null?'':String(id);}
  function livePaymentOptions(){
    return [['Cash on Delivery','cod'],['DAHA Wallet','wallet']];
  }
  function normalizePaymentChoice(label){
    if(label==='Cash on Delivery'||label==='Pay on Delivery')return 'cod';
    if(label==='DAHA Wallet')return 'wallet';
    return String(label||'').toLowerCase().replace(/\s+/g,'-');
  }
  function paymentMethodLabel(value){
    var method=String(value||'').toLowerCase();
    if(method==='cod'||method==='cash on delivery'||method==='pay on delivery')return 'Cash on Delivery';
    if(method==='wallet'||method==='daha wallet')return 'DAHA Wallet';
    return String(value||'');
  }
  var mlPromoIndex=0,mlPromoTimer=null,mlPromoTouchX=null,mlOnboardTimer=null,mlPaymentStatusTimer=null,mlPaymentStatusStarted=0,mlOrderDetailTimer=null,mlOpenOrderDetailId=null;
  var mlPromoSlides=[
    {kind:'shop',eyebrow:'THE GAMBIA • LOCAL MARKETPLACE',title:'Groceries delivered',accent:'with care.',body:'Fresh produce, pantry essentials and everyday finds from local sellers across The Gambia.',pill:'SHOP YOUR LOCAL MARKET',image:'./assets/hero-marketlink-bag.webp',cta:'Browse products'},
    {kind:'sell',eyebrow:'FOR LOCAL BUSINESSES',title:'Your shop. More customers.',accent:'Grow with MarketLink.',body:'Bring your business online, showcase your real products and manage incoming orders in one place.',pill:'SELL ON MARKETLINK',image:'./assets/promo-vendor.webp',cta:'Become a vendor'},
    {kind:'affiliate',eyebrow:'MARKETLINK AFFILIATE PROGRAM',title:'Share a link.',accent:'Earn 2%.',body:'Share your affiliate link. Earn 2% of eligible discounted merchandise when a referred order is successfully delivered.',pill:'EARN ON ELIGIBLE PURCHASES',image:'./assets/promo-shopping.webp',cta:'Explore affiliate'},
    {kind:'promote',eyebrow:'VENDOR PROMOTION DESK',title:'Put your products',accent:'in the spotlight.',body:'Request a featured banner, product search boost or shop spotlight. Admin confirms the price and schedule before anything goes live.',pill:'FOR MARKETLINK VENDORS',image:'./assets/promo-vendor.webp',cta:'Request promotion'}
  ];
  function promoSlideMarkup(index,cls){
    var p=mlPromoSlides[(Number(index)||0)%mlPromoSlides.length];
    var officialMark=(typeof logoSVG==='function'?logoSVG(25):'')+(typeof LOGO_WORDMARK_URI!=='undefined'?'<img class="ml-promo-wordmark" src="'+LOGO_WORDMARK_URI+'" alt="MarketLink">':'<b>MarketLink</b>');
    return '<article class="ml-promo-panel ml-promo-'+p.kind+(cls?' '+cls:'')+'" style="background-image:linear-gradient(135deg,#071521,#0B303A)">'+
      '<div class="ml-promo-image" role="img" aria-label="'+esc(p.kind==='shop'?'MarketLink local shopping and groceries':p.kind==='sell'?'MarketLink vendor marketplace':'MarketLink affiliate marketplace')+'" style="background-image:url(&quot;'+esc(p.image)+'&quot;)"></div>'+
      '<div class="ml-promo-official">'+officialMark+'</div>'+
      '<div class="ml-promo-copy"><span class="ml-promo-eyebrow"><i></i>'+esc(p.eyebrow)+'</span><span class="ml-promo-kicker">'+esc(p.pill)+'</span>'+
      '<h3>'+esc(p.title)+'<em>'+esc(p.accent)+'</em></h3><p>'+esc(p.body)+'</p>'+
      '<button class="ml-promo-cta" onclick="window.ML_Premium.promoAction(\''+p.kind+'\')">'+esc(p.cta)+' <b>↗</b></button></div>'+
      '<div class="ml-promo-art-stamp"><span>'+(p.kind==='shop'?'🛍️':p.kind==='sell'||p.kind==='promote'?'🏪':'🔗')+'</span><b>'+(p.kind==='affiliate'?'2%':p.kind==='promote'?'🎫':gambiaFlagMarkup())+'</b><small>'+(p.kind==='affiliate'?'AFFILIATE REWARD':p.kind==='sell'?'LOCAL BUSINESS':p.kind==='promote'?'PROMOTION DESK':'MADE FOR THE GAMBIA')+'</small></div>'+
      '<div class="ml-promo-bottom-note">'+(p.kind==='affiliate'?'Reward is calculated on eligible discounted merchandise subtotal after successful delivery.':p.kind==='sell'?'Real products. Real customers. One connected marketplace.':p.kind==='promote'?'Admin approval and confirmed payment are required before publishing.':'Discover products from local vendors, all in one place.')+'</div></article>';
  }
  function promoCarouselMarkup(){
    return '<section class="ml-promo-carousel" id="ml-promo-carousel" aria-label="MarketLink promotions">'+
      '<div class="ml-promo-carousel-head"><div><span class="ml-eyebrow">DISCOVER MARKETLINK</span><h3>Local shopping. More opportunity.</h3></div><span class="ml-promo-autoplay"><i></i> Updates every 5 seconds</span></div>'+
      '<div class="ml-promo-stage" id="ml-promo-stage">'+promoSlideMarkup(mlPromoIndex)+'</div>'+
      '<div class="ml-promo-carousel-foot"><div class="ml-promo-dots" id="ml-promo-dots">'+mlPromoSlides.map(function(_,i){return '<button type="button" aria-label="Show promotion '+(i+1)+'" class="'+(i===mlPromoIndex?'active':'')+'" onclick="window.ML_Premium.goPromoTo('+i+')"></button>';}).join('')+'</div>'+
      '<div class="ml-promo-arrows"><span id="ml-promo-counter">'+String(mlPromoIndex+1).padStart(2,'0')+' / '+String(mlPromoSlides.length).padStart(2,'0')+'</span><button type="button" aria-label="Previous promotion" onclick="window.ML_Premium.promoPrev()">‹</button><button type="button" aria-label="Next promotion" onclick="window.ML_Premium.promoNext()">›</button></div></div></section>';
  }
  function paintPromoCarousel(index){
    mlPromoIndex=(Number(index)+mlPromoSlides.length)%mlPromoSlides.length;
    var stage=G('ml-promo-stage'),dots=G('ml-promo-dots'),counter=G('ml-promo-counter');
    if(stage)stage.innerHTML=promoSlideMarkup(mlPromoIndex,'ml-promo-panel-enter');
    if(dots)dots.innerHTML=mlPromoSlides.map(function(_,i){return '<button type="button" aria-label="Show promotion '+(i+1)+'" class="'+(i===mlPromoIndex?'active':'')+'" onclick="window.ML_Premium.goPromoTo('+i+')"></button>';}).join('');
    if(counter)counter.textContent=String(mlPromoIndex+1).padStart(2,'0')+' / '+String(mlPromoSlides.length).padStart(2,'0');
  }
  function initPromoCarousel(){
    var root=G('ml-promo-carousel'),stage=G('ml-promo-stage');if(!root||!stage)return;
    if(mlPromoTimer){clearInterval(mlPromoTimer);mlPromoTimer=null;}
    if(!root.dataset.mlBound){
      root.dataset.mlBound='1';
      root.addEventListener('mouseenter',function(){if(mlPromoTimer){clearInterval(mlPromoTimer);mlPromoTimer=null;}});
      root.addEventListener('mouseleave',startPromoAutoplay);
      stage.addEventListener('touchstart',function(e){mlPromoTouchX=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientX:null;},{passive:true});
      stage.addEventListener('touchend',function(e){var x=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientX:null;if(x!=null&&mlPromoTouchX!=null&&Math.abs(x-mlPromoTouchX)>40)paintPromoCarousel(x<mlPromoTouchX?mlPromoIndex+1:mlPromoIndex-1);mlPromoTouchX=null;},{passive:true});
    }
    paintPromoCarousel(mlPromoIndex);startPromoAutoplay();
  }
  function startPromoAutoplay(){
    if(mlPromoTimer)clearInterval(mlPromoTimer);
    mlPromoTimer=setInterval(function(){
      var tab=G('tab-home');
      if(!document.hidden&&tab&&tab.offsetParent!==null&&G('ml-promo-carousel'))paintPromoCarousel(mlPromoIndex+1);
    },5000);
  }
  function promoAction(kind){
    if(kind==='promote'){if(!ML_API.auth.isAuthenticated()){goAuth();return;}if(!isMarketLinkRole('vendor')){toast('Apply to become a vendor before requesting a paid promotion.','info');if(typeof openVendorApp==='function')openVendorApp();return;}if(typeof window.vAddPromo==='function')window.vAddPromo();return;}
    if(kind==='shop'){if(typeof switchTab==='function')switchTab('home');var search=G('hsearch');if(search)setTimeout(function(){search.focus();},150);return;}
    if(kind==='sell'){if(!ML_API.auth.isAuthenticated()){goAuth();return;}if(typeof openVendorApp==='function')openVendorApp();else toast('Open Profile and choose Become a Vendor to apply.','info');return;}
    if(kind==='affiliate'){
      if(!ML_API.auth.isAuthenticated()){goAuth();return;}
      S.profilePage='affiliate';if(typeof switchTab==='function')switchTab('profile');else renderPremiumProfile();return;
    }
  }
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
  function stopPaymentStatusPolling(){
    if(mlPaymentStatusTimer){clearInterval(mlPaymentStatusTimer);mlPaymentStatusTimer=null;}
    mlPaymentStatusStarted=0;
  }
  function paymentBrandMarkup(){
    return '<div class="ml-payment-brand"><img src="./assets/marketlink-logo.png" alt="MarketLink logo"><div><b>MarketLink Gambia</b><span>Secure payment status</span></div></div>';
  }
  function persistPendingPayment(pending){
    try{
      if(!pending||!pending.payment||!pending.order){return;}
      sessionStorage.setItem('ml_pending_payment',JSON.stringify({
        orderId:String(pending.order.id||pending.order.order_id||''),
        orderNumber:String(pending.order.order_number||''),
        paymentId:String(pending.payment.id||''),
        method:String(pending.method||''),
        amount:Number(pending.amount||pending.order.total||0),
        redirectUrl:String(pending.redirectUrl||''),
        nextStep:pending.nextStep||null,
        status:String(pending.status||'pending'),
        savedAt:Date.now()
      }));
      sessionStorage.setItem('ml_pending_order_id',String(pending.order.id||pending.order.order_id||''));
      sessionStorage.setItem('ml_pending_payment_id',String(pending.payment.id||''));
    }catch(e){}
  }
  function clearPendingPaymentSession(){
    try{
      sessionStorage.removeItem('ml_pending_payment');
      sessionStorage.removeItem('ml_pending_order_id');
      sessionStorage.removeItem('ml_pending_payment_id');
    }catch(e){}
  }
  async function resumePendingPaymentFromSession(){
    var saved;
    try{saved=JSON.parse(sessionStorage.getItem('ml_pending_payment')||'null');}catch(e){saved=null;}
    if(!saved||!saved.paymentId||!saved.orderId)return false;
    S.pendingPayment={
      order:{id:saved.orderId,order_number:saved.orderNumber||'',total:Number(saved.amount||0)},
      payment:{id:saved.paymentId,status:saved.status||'pending'},
      method:saved.method||'wave',
      accountNumber:'',
      nextStep:saved.nextStep||null,
      redirectUrl:saved.redirectUrl||null,
      status:String(saved.status||'pending').toLowerCase(),
      amount:Number(saved.amount||0),
      cartSnapshot:Object.assign({},S.cart||{}),
      cartItemsSnapshot:Object.assign({},CART_ITEMS||{})
    };
    try{
      var orderResponse=await ML_API.orders.getById(saved.orderId),orderData=orderResponse&&orderResponse.data?orderResponse.data:orderResponse;
      var order=orderData&&orderData.order?orderData.order:orderData;
      if(order&&order.id)S.pendingPayment.order=order;
    }catch(e){}
    try{
      var statusResponse=await ML_API.payments.status(saved.paymentId),statusData=statusResponse&&statusResponse.data?statusResponse.data:statusResponse;
      if(statusData){
        if(statusData.payment)S.pendingPayment.payment=statusData.payment;
        S.pendingPayment.status=String(statusData.status||statusData.payment&&statusData.payment.status||S.pendingPayment.status).toLowerCase();
        if(statusData.nextStep)S.pendingPayment.nextStep=statusData.nextStep;
        if(statusData.redirectUrl)S.pendingPayment.redirectUrl=statusData.redirectUrl;
        persistPendingPayment(S.pendingPayment);
      }
    }catch(e){}
    return true;
  }
  function renderLivePaymentStep(){
    var root=G('cart-body'),pending=S.pendingPayment;
    if(!root||!pending)return;
    var step=pending.nextStep||{},status=String(pending.status||pending.payment&&pending.payment.status||'pending').toLowerCase();
    var isComplete=status==='completed'||status==='confirmed';
    var isFailed=status==='failed'||status==='cancelled'||status==='abandoned'||status==='expired';
    var link=String(step.launch_url||pending.redirectUrl||'');
    if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?\//i.test(link))link='';
    var methodLabel=pending.method==='wave'?'Wave':pending.method==='afrimoney'?'AfriMoney':pending.method==='qmoney'?'QMoney':'Mobile money (secure checkout)';
    var pinMode=String(step.auth_mode||'').toLowerCase()==='pin';
    var confirmMode=String(step.auth_mode||'').toLowerCase()==='confirm'&&!step.openExternal;
    var headline=isComplete?'Payment confirmed':isFailed?'Payment not completed':'Complete your payment';
    var message=isComplete?'Your payment is confirmed. Your MarketLink order status is now updated.':isFailed?'The payment was not completed. You can return to your cart and try again with a new payment attempt.':'Follow the instructions shown below. MarketLink will only mark your order as paid after a verified confirmation.';
    root.innerHTML='<div class="ml-profile-shell ml-payment-flow">'+
      '<div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK CHECKOUT</div><h3>Secure payment</h3></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.restoreCartAndRetry()">← Back to cart</button></div>'+
      '<div class="ml-payment-result '+(isComplete?'is-success':isFailed?'is-failed':'is-pending')+'">'+paymentBrandMarkup()+'<div class="ml-payment-result-title">'+(isComplete?'✓ ':isFailed?'! ':'')+esc(headline)+'</div><p>'+esc(message)+'</p>'+
      '<div class="ml-payment-summary"><div><span>Order reference</span><b>'+esc(pending.order&& (pending.order.order_number||pending.order.id)||'Created by MarketLink')+'</b></div><div><span>Payment method</span><b>'+esc(methodLabel)+'</b></div><div><span>Order total</span><b>'+money(pending.order&&pending.order.total||pending.amount||0)+'</b></div>'+(pending.accountNumber?'<div><span>Mobile-money number</span><b>••• '+esc(String(pending.accountNumber).slice(-4))+'</b></div>':'')+'</div>'+
      (isComplete?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.finishPaidOrder()">View order tracking →</button>':
       isFailed?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.restoreCartAndRetry()">Return to cart and try again</button>':
       (link?'<a class="ml-btn ml-btn-primary ml-payment-open-provider" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Continue to '+esc(methodLabel)+' ↗</a>':'')+
       (confirmMode?'<div class="ml-payment-next-step"><b>Approve the request on your phone</b><p>'+esc(step.confirmation_steps||'Approve the payment request on your mobile-money phone. Then select the button below.')+'</p><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueModemPay(\'confirm\')">I have approved the request</button></div>':'')+
       (pinMode?'<div class="ml-payment-next-step"><label for="ml-modem-payment-pin">Provider authorization code</label><p>Enter the temporary code requested for this payment. MarketLink will send it for this payment attempt only and will not save it.</p><input id="ml-modem-payment-pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="'+Math.min(8,Math.max(4,Number(step.auth_length)||6))+'" placeholder="Enter authorization code"><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueModemPay(\'pin\')">Submit code securely</button></div>':'')+
       '<div class="ml-payment-status-line" id="ml-payment-status-message">Waiting for payment confirmation. This can take a little time.</div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.checkPaymentStatus()">Check payment status</button>')+
      '</div><p class="ml-payment-footnote">Do not pay twice while a transaction is pending. If the provider has already requested approval on your phone, finish that request first.</p></div>';
    if(!isComplete&&!isFailed&&!mlPaymentStatusTimer){
      mlPaymentStatusStarted=Date.now();
      mlPaymentStatusTimer=setInterval(function(){
        if(!S.pendingPayment||Date.now()-mlPaymentStatusStarted>=300000){stopPaymentStatusPolling();return;}
        checkLivePaymentStatus(true);
      },5000);
    }
  }
  async function checkLivePaymentStatus(silent){
    var pending=S.pendingPayment;
    if(!pending||!pending.payment||!pending.payment.id)return;
    var line=G('ml-payment-status-message');
    if(line&&!silent)line.textContent='Checking payment status…';
    try{
      var response=await ML_API.payments.status(pending.payment.id),data=response&&response.data?response.data:response;
      pending.status=String(data.status||data.payment&&data.payment.status||'pending').toLowerCase();
      if(data.nextStep)pending.nextStep=data.nextStep;
      if(data.redirectUrl)pending.redirectUrl=data.redirectUrl;
      if(data.payment)pending.payment=data.payment;
      persistPendingPayment(pending);
      if(['completed','confirmed','failed','cancelled','abandoned','expired'].indexOf(pending.status)>-1){
        stopPaymentStatusPolling();
        renderLivePaymentStep();
        if(pending.status==='completed'||pending.status==='confirmed')toast('Payment confirmed. Your order is updated.','success');
        else toast('Payment was not completed. Review the status and try again if needed.','error');
      }else if(line){
        line.textContent='Payment status: '+(pending.status==='processing'?'The provider is processing it.':'Still waiting for provider confirmation.')+' Do not submit another payment.';
      }
    }catch(e){
      if(line)line.textContent='We could not check the latest status just now. Your payment is not marked as successful; try checking again shortly.';
      if(!silent)toast(e.error||'Could not check payment status. Please try again.','warning');
    }
  }
  async function continueLiveModemPayment(action){
    var pending=S.pendingPayment;
    if(!pending||!pending.payment||!pending.payment.id)return;
    var pinEl=G('ml-modem-payment-pin'),pin='';
    if(action==='pin'){
      pin=String(pinEl&&pinEl.value||'').trim();
      if(!/^\\d{4,8}$/.test(pin)){toast('Enter the provider authorization code requested for this payment.','error');return;}
    }
    try{
      var response=await ML_API.payments.continue(pending.payment.id,action,action==='pin'?pin:undefined);
      if(pinEl)pinEl.value='';
      var data=response&&response.data?response.data:response;
      if(data.payment)pending.payment=data.payment;
      pending.status=String(data.status||'pending').toLowerCase();
      if(data.nextStep)pending.nextStep=data.nextStep;
      // Do not treat confirm/finalize responses alone as success; refresh authoritative status.
      await checkLivePaymentStatus(false);
    }catch(e){
      if(pinEl)pinEl.value='';
      toast(e.error||'The payment request could not be confirmed. Check the status before retrying.','error');
    }
  }
  function restoreLiveCartAfterPaymentFailure(){
    var pending=S.pendingPayment;
    var state=String(pending&&pending.status||'').toLowerCase();
    if(pending&&['pending','processing'].indexOf(state)>-1){
      toast('This payment is still pending. Check its status before starting another payment, so you are not charged twice.','warning');
      return;
    }
    if(pending&&['failed','cancelled','abandoned','expired'].indexOf(state)===-1){
      toast('This payment may already be complete. Check the confirmed status and open order tracking instead of paying again.','info');
      return;
    }
    stopPaymentStatusPolling();
    if(pending&&pending.cartSnapshot){
      S.cart=Object.assign({},pending.cartSnapshot);
      CART_ITEMS=Object.assign({},pending.cartItemsSnapshot||{});
      saveCartToStorage();updateCartBadge();
    }
    S.pendingPayment=null;
    S.paymentAccountNumber='';
    clearPendingPaymentSession();
    switchTab('cart');
    renderLiveCart();
  }
  function finishLivePaidOrder(){
    stopPaymentStatusPolling();
    S.pendingPayment=null;
    S.paymentAccountNumber='';
    S.appliedCoupon=null;
    S.cart={};CART_ITEMS={};
    updateCartBadge();saveCartToStorage();
    clearPendingPaymentSession();
    switchTab('orders');
    startOrderTracking();
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
    var payLabel=S.selPay||'Cash on Delivery',payMethod=normalizePaymentChoice(payLabel);
    if(payMethod!=='cod'&&payMethod!=='wallet'){toast('Choose Cash on Delivery or DAHA Wallet.','warning');return;}
    var accountNumber='';
    var activePaymentCaps=S.paymentCapabilities||{configured:false,directMobileMoney:false};
    var cartSnapshot=Object.assign({},S.cart||{}),cartItemsSnapshot=Object.assign({},CART_ITEMS||{});
    var payload={vendorId:vendors[0],items:items.map(function(x){return {productId:x.productId,quantity:x.quantity};}),deliveryAddressId:addressId,paymentMethod:payMethod,couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined};
    var placeBtn=document.querySelector('#cart-body button[data-ml-place-order]');
    var walletPaymentCompleted=false;
    if(placeBtn){placeBtn.disabled=true;placeBtn.textContent='Creating secure order…';}
    try{
      var orderRes=await ML_API.orders.place(payload),order=orderRes&&orderRes.data&&orderRes.data.order?orderRes.data.order:orderRes.data;
      if(!order||!order.id)throw {error:'The backend did not return a valid order.'};
      S.order=order;S.orderSI=0;
      var paymentRes=await ML_API.payments.initiate(order.id,payMethod,Number(order.total),accountNumber),paymentData=paymentRes&&paymentRes.data?paymentRes.data:paymentRes;
      S.order=Object.assign({},S.order,{payment:paymentData&&paymentData.payment||paymentData});
      if(payMethod==='wallet'){
        if(!paymentData||paymentData.action!=='wallet_paid'||!paymentData.payment||String(paymentData.payment.status).toLowerCase()!=='confirmed'){
          throw {error:'DAHA Wallet did not confirm this payment. No order payment has been accepted.'};
        }
        walletPaymentCompleted=true;
        toast('Order paid successfully with DAHA Wallet ✓','success');
        finishLivePaidOrder();
      }else if(payMethod!=='cod'){
        var payment=paymentData&&paymentData.payment;
        if(!payment||!payment.id)throw {error:'The payment service did not return a valid payment record. Your cart has been kept; check order history before trying again.'};
        S.pendingPayment={order:order,payment:payment,method:payMethod,accountNumber:accountNumber,nextStep:paymentData.nextStep||null,redirectUrl:paymentData.redirectUrl||null,status:String(paymentData.status||payment.status||'pending').toLowerCase(),amount:Number(order.total),cartSnapshot:cartSnapshot,cartItemsSnapshot:cartItemsSnapshot};
        persistPendingPayment(S.pendingPayment);
        // Keep the cart saved while the provider is processing. The payment screen
        // replaces it visually, and the basket is cleared only after verified success.
        renderLivePaymentStep();
        if(S.pendingPayment.status!=='failed'&&S.pendingPayment.status!=='confirmed'&&S.pendingPayment.status!=='completed')checkLivePaymentStatus(true);
      }else{
        toast('Order placed — Pay on Delivery selected ✓','success');
        S.appliedCoupon=null;S.cart={};CART_ITEMS={};updateCartBadge();saveCartToStorage();switchTab('orders');startOrderTracking();
      }
    }catch(e){
      if(payMethod==='wallet'&&order&&!walletPaymentCompleted){
        try{await ML_API.orders.cancel(order.id,'DAHA Wallet checkout could not be completed.');}catch(cancelError){}
      }
      if(placeBtn){placeBtn.disabled=false;placeBtn.textContent='Place Order';}
      toast(e.error||'Could not place your order.','error');
      if(payMethod==='wallet'&&e&&e.code==='INSUFFICIENT_WALLET_BALANCE'){
        setTimeout(function(){openProfilePage('wallet');},250);
      }
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
    if(window.__ML_ADMIN_LOGIN_IN_FLIGHT)return;
    var idEl=G('admin-staffid'),pinEl=G('admin-password');
    var operatorEl=G('admin-operator'),nationalEl=G('admin-national');
    var button=G('admin-lbtn');
    var originalButtonText=button?button.textContent:'Sign in securely';
    var phone=(idEl&&idEl.value||'').trim(),pin=(pinEl&&pinEl.value||'').trim();
    // Derive the API identity from the visible controls at submit time.
    if(operatorEl&&nationalEl){
      var national=String(nationalEl.value||'').replace(/\D/g,'');
      var networkRules={
        AFRICELL:{prefix:'87',legacy:/^(2|7|40|41)/},
        QCELL:{prefix:'83',legacy:/^(3|5)/},
        COMIUM:{prefix:'86',legacy:/^(6|8)/},
        GAMCEL:{prefix:'',legacy:/^9/}
      };
      var networkRule=networkRules[operatorEl.value];
      if(national.length!==7){adminAuthErr('Enter all 7 digits of your Gambian mobile number.');nationalEl.focus();return;}
      if(!networkRule||!networkRule.legacy.test(national)){adminAuthErr('The number does not match the selected network. Check the number and network, then try again.');nationalEl.focus();return;}
      phone=networkRule.prefix+national;
      if(idEl)idEl.value=phone;
    }
    if(!phone||!pin){adminAuthErr('Enter your admin phone number and 4-digit PIN');return;}
    if(!/^\d{9}$/.test(phone)){adminAuthErr('Check your Gambian mobile number and selected network.');return;}
    if(!/^\d{4}$/.test(pin)){adminAuthErr('Enter your 4-digit security PIN.');return;}
    window.__ML_ADMIN_LOGIN_IN_FLIGHT=true;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Signing in…';}
    try{
      adminAuthErr('');
      var loginResponse=await Promise.race([
        ML_API.auth.login(phone,pin),
        new Promise(function(_,reject){window.setTimeout(function(){reject({error:'The sign-in request timed out. Please check your connection and try again.'});},25000);})
      ]);

      // Normalize the authenticated user across the direct API result and
      // older nested controller envelopes. Roles always come from the server.
      var authPayload=loginResponse;
      if(authPayload&&authPayload.data&&authPayload.data.data&&authPayload.data.data.user)authPayload=authPayload.data.data;
      else if(authPayload&&authPayload.data&&authPayload.data.user)authPayload=authPayload.data;
      var user=authPayload&&authPayload.user?authPayload.user:authPayload;
      var roles=Array.isArray(user&&user.roles)?user.roles.map(function(r){return String(r).toLowerCase();}):[];
      if(!roles.some(function(r){return r==='admin'||r==='super_admin';})){
        // Keep the authenticated session intact for diagnostics; do not silently
        // discard a valid customer session just because role data was nested.
        await ML_API.auth.logout();
        throw {error:'Your MarketLink account signed in, but its administrator role could not be confirmed. Please contact support with code ADMIN_ROLE_RESPONSE.'};
      }
      AdminSession.start(phone);
      // The dedicated Admin entry script initially forces its login screen
      // visible with inline styles. Explicitly retire that screen after auth
      // so its phone controls cannot remain as a floating overlay.
      var adminLoginScreen=G('scr-admin-login');
      if(adminLoginScreen){
        adminLoginScreen.classList.remove('active');
        adminLoginScreen.style.setProperty('display','none','important');
        adminLoginScreen.style.setProperty('visibility','hidden','important');
        adminLoginScreen.style.setProperty('pointer-events','none','important');
        adminLoginScreen.setAttribute('aria-hidden','true');
      }
      showScreen('scr-app');
      var appScreen=G('scr-app'),appRoot=G('app');
      if(appRoot){appRoot.style.setProperty('height','auto','important');appRoot.style.setProperty('min-height','100dvh','important');appRoot.style.setProperty('overflow','visible','important');}
      if(appScreen){appScreen.style.setProperty('position','relative','important');appScreen.style.setProperty('inset','auto','important');appScreen.style.setProperty('height','auto','important');appScreen.style.setProperty('min-height','100dvh','important');appScreen.style.setProperty('overflow','visible','important');}
      G('bnav').style.display='none';G('fab').classList.remove('fab-visible');
      switchTab('admindash');toast('Welcome to the Admin Portal ✓');
