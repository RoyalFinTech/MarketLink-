/* MarketLink Premium live frontend layer
   Keeps the official embedded MarketLink logo and existing routing.
   Replaces customer-facing mock dashboard/profile surfaces with backend data.
*/
(function(){
  'use strict';
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
    var caps=S.paymentCapabilities||{configured:false,directMobileMoney:false,hostedCheckout:false};
    if(caps.directMobileMoney)return [['Pay on Delivery','cod'],['Wave','wave'],['AfriMoney','afrimoney'],['QMoney','qmoney']];
    if(caps.hostedCheckout)return [['Pay on Delivery','cod'],['Modem Pay secure checkout','modempay']];
    return [['Pay on Delivery','cod'],['Wave','wave'],['AfriMoney','afrimoney'],['QMoney','qmoney']];
  }
  function normalizePaymentChoice(label){
    if(label==='Pay on Delivery')return 'cod';
    if(label==='Modem Pay secure checkout')return 'modempay';
    return String(label||'').toLowerCase().replace(/\s+/g,'-');
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
    var methodLabel=pending.method==='wave'?'Wave':pending.method==='afrimoney'?'AfriMoney':pending.method==='qmoney'?'QMoney':'Modem Pay';
    var pinMode=String(step.auth_mode||'').toLowerCase()==='pin';
    var confirmMode=String(step.auth_mode||'').toLowerCase()==='confirm'&&!step.openExternal;
    var headline=isComplete?'Payment confirmed':isFailed?'Payment not completed':'Complete your payment';
    var message=isComplete?'Modem Pay has confirmed your payment. Your MarketLink order status is now updated.':isFailed?'Modem Pay did not complete this payment. You can return to your cart and try again with a new payment attempt.':'Follow the provider’s next step below. MarketLink will only mark your order as paid after a verified confirmation.';
    root.innerHTML='<div class="ml-profile-shell ml-payment-flow">'+
      '<div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK CHECKOUT</div><h3>Secure payment</h3></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.restoreCartAndRetry()">← Back to cart</button></div>'+
      '<div class="ml-payment-result '+(isComplete?'is-success':isFailed?'is-failed':'is-pending')+'">'+paymentBrandMarkup()+'<div class="ml-payment-result-title">'+(isComplete?'✓ ':isFailed?'! ':'')+esc(headline)+'</div><p>'+esc(message)+'</p>'+
      '<div class="ml-payment-summary"><div><span>Order reference</span><b>'+esc(pending.order&& (pending.order.order_number||pending.order.id)||'Created by MarketLink')+'</b></div><div><span>Payment method</span><b>'+esc(methodLabel)+'</b></div><div><span>Order total</span><b>'+money(pending.order&&pending.order.total||pending.amount||0)+'</b></div>'+(pending.accountNumber?'<div><span>Mobile-money number</span><b>••• '+esc(String(pending.accountNumber).slice(-4))+'</b></div>':'')+'</div>'+
      (isComplete?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.finishPaidOrder()">View order tracking →</button>':
       isFailed?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.restoreCartAndRetry()">Return to cart and try again</button>':
       (link?'<a class="ml-btn ml-btn-primary ml-payment-open-provider" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Continue to '+esc(methodLabel)+' ↗</a>':'')+
       (confirmMode?'<div class="ml-payment-next-step"><b>Approve the request on your phone</b><p>'+esc(step.confirmation_steps||'Approve the payment request on your mobile-money phone. Then select the button below.')+'</p><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueModemPay(\'confirm\')">I have approved the request</button></div>':'')+
       (pinMode?'<div class="ml-payment-next-step"><label for="ml-modem-payment-pin">Provider authorization code</label><p>Enter the code requested by your payment provider. MarketLink will send it for this payment attempt only and will not save it.</p><input id="ml-modem-payment-pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="'+Math.min(8,Math.max(4,Number(step.auth_length)||6))+'" placeholder="Enter authorization code"><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueModemPay(\'pin\')">Submit code securely</button></div>':'')+
       '<div class="ml-payment-status-line" id="ml-payment-status-message">Waiting for the payment provider to confirm. This can take a little time.</div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.checkPaymentStatus()">Check payment status</button>')+
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
    if(line&&!silent)line.textContent='Checking the payment provider…';
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
        if(pending.status==='completed'||pending.status==='confirmed')toast('Payment confirmed by Modem Pay. Your order is updated.','success');
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
    var payLabel=S.selPay||'Pay on Delivery',payMethod=normalizePaymentChoice(payLabel);
    var accountNumber='';
    var activePaymentCaps=S.paymentCapabilities||{configured:false,directMobileMoney:false};
    if(payMethod!=='cod'&&!activePaymentCaps.configured){
      toast('Mobile-money payment setup is not complete yet. Choose Pay on Delivery or try again later.','warning');
      renderLiveCart();return;
    }
    if(['wave','afrimoney','qmoney'].indexOf(payMethod)>-1&&activePaymentCaps.directMobileMoney){
      var mobileInput=G('ml-mobile-money-number');
      accountNumber=String(mobileInput&&mobileInput.value||S.paymentAccountNumber||'').replace(/\D/g,'');
      if(!/^\d{7}$/.test(accountNumber)){toast('Enter the 7-digit mobile-money number for the selected payment method.','error');if(mobileInput)mobileInput.focus();return;}
      S.paymentAccountNumber=accountNumber;
    }
    var cartSnapshot=Object.assign({},S.cart||{}),cartItemsSnapshot=Object.assign({},CART_ITEMS||{});
    var payload={vendorId:vendors[0],items:items.map(function(x){return {productId:x.productId,quantity:x.quantity};}),deliveryAddressId:addressId,paymentMethod:payMethod,couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined};
    var placeBtn=document.querySelector('#cart-body button[data-ml-place-order]');
    if(placeBtn){placeBtn.disabled=true;placeBtn.textContent='Creating secure order…';}
    try{
      var orderRes=await ML_API.orders.place(payload),order=orderRes&&orderRes.data&&orderRes.data.order?orderRes.data.order:orderRes.data;
      if(!order||!order.id)throw {error:'The backend did not return a valid order.'};
      S.order=order;S.orderSI=0;
      var paymentRes=await ML_API.payments.initiate(order.id,payMethod,Number(order.total),accountNumber),paymentData=paymentRes&&paymentRes.data?paymentRes.data:paymentRes;
      S.order=Object.assign({},S.order,{payment:paymentData&&paymentData.payment||paymentData});
      if(payMethod!=='cod'){
        var payment=paymentData&&paymentData.payment;
        if(!payment||!payment.id)throw {error:'The payment provider did not return a valid payment record. Your cart has been kept; check order history before trying again.'};
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
      root.innerHTML='<div class="ml-premium-home" style="padding-top:18px"><div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Admin control center</div><div class="ml-hero-sub">Live platform metrics from the production database. No preview records are shown.</div></div><div class="ml-live-dot">Backend connected</div><button class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.reviewPromotions()">🎫 Promotion requests</button></div>'+
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
  function isMarketLinkRole(role){return (S.roles||[]).some(function(r){return String(r).toLowerCase()===String(role).toLowerCase();});}
  function roleCtaSectionMarkup(){
    return '<section class="ml-role-cta-section"><div class="ml-role-cta-heading"><div><h3>Grow with MarketLink</h3><p>Sell through the marketplace or earn by delivering local orders.</p></div></div><div class="ml-role-cta-buttons">'+
      (isMarketLinkRole('vendor')?'<button type="button" class="ml-role-cta-button" onclick="window.ML_Premium.openRoleDashboard(\'vendor\')"><span class="ml-role-cta-icon">🏪</span><span class="ml-role-cta-copy"><b>Vendor Dashboard</b><small>Manage your store and incoming orders.</small></span><span>↗</span></button>':'<button type="button" class="ml-role-cta-button" onclick="openVendorApp()"><span class="ml-role-cta-icon">🏪</span><span class="ml-role-cta-copy"><b>Become a Vendor</b><small>Register your business and reach more customers.</small></span><span>↗</span></button>')+
      (isMarketLinkRole('rider')?'<button type="button" class="ml-role-cta-button" onclick="window.ML_Premium.openRoleDashboard(\'rider\')"><span class="ml-role-cta-icon">🛵</span><span class="ml-role-cta-copy"><b>Rider Dashboard</b><small>View deliveries and manage availability.</small></span><span>↗</span></button>':'<button type="button" class="ml-role-cta-button" onclick="openRiderApp()"><span class="ml-role-cta-icon">🛵</span><span class="ml-role-cta-copy"><b>Become a Rider</b><small>Apply to join the delivery network.</small></span><span>↗</span></button>')+
    '</div></section>';
  }
  function openRoleDashboard(role){
    var r=String(role||'').toLowerCase();
    if(r==='profile'){switchTab('profile');return;}
    if(r==='vendor'){if(!isMarketLinkRole('vendor')){toast('Your vendor application must be approved before dashboard access.','error');return;}switchTab('vendordash');return;}
    if(r==='rider'){if(!isMarketLinkRole('rider')){toast('Your rider application must be approved before dashboard access.','error');return;}switchTab('riderdash');return;}
    toast('Choose a valid MarketLink dashboard.','error');
  }
  function mlOfficialBrandMarkup(){
    var icon=typeof logoSVG==='function'?logoSVG(34):'';
    var word=(typeof LOGO_WORDMARK_URI!=='undefined')?'<img class="ml-brand-wordmark" src="'+LOGO_WORDMARK_URI+'" alt="MarketLink">':'<strong>MarketLink</strong>';
    return '<div class="ml-dashboard-brand">'+icon+word+'<span>The Gambia’s local marketplace</span></div>';
  }
  function mlCategoryStyle(name){
    var n=String(name||'').toLowerCase(),atlas='./assets/marketlink-category-atlas.webp';
    // The six-cell atlas is a 3x2 grid: tomato, onion, rice / oil, carrot, greens.
    // Keep URLs unquoted inside the inline custom-property style to avoid broken
    // nested quotes in generated category-card markup.
    if(/tomato/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:0% 0%;';
    if(/onion/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:50% 0%;';
    if(/rice|grain|cereal/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:100% 0%;';
    if(/oil|spice|pantry|seasoning|cooking essential/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:0% 100%;';
    if(/carrot|root vegetable/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:50% 100%;';
    if(/leaf|green|vegetable|fruit|fresh produce|produce|grocery|grocer/.test(n))return '--ml-category-image:url('+atlas+');--ml-category-size:300% 200%;--ml-category-position:100% 100%;';
    if(/fufu|benachin|benetin|domoda|gambian food|nigerian food|meal|prepared food|cooked|restaurant|fish|meat|chicken|seafood|bakery|snack|international/.test(n))return '--ml-category-image:url(./assets/promo-shopping.webp);--ml-category-size:cover;--ml-category-position:center;';
    if(/clothing|fashion|shoe|fabric|tailor|apparel|jewel|accessor|beauty|cosmetic|construction|building material|vehicle|car|motorbike|service|vendor|business/.test(n))return '--ml-category-image:url(./assets/promo-vendor.webp);--ml-category-size:cover;--ml-category-position:center;';
    if(/electronics|digital|phone|computer|pharmacy|medicine|health|household|kitchen|home/.test(n))return '--ml-category-image:url(./assets/hero-marketlink-bag.webp);--ml-category-size:cover;--ml-category-position:center;';
    var choices=['./assets/promo-shopping.webp','./assets/promo-vendor.webp','./assets/hero-marketlink-bag.webp'],hash=0;
    for(var i=0;i<n.length;i++)hash=(hash+n.charCodeAt(i))%choices.length;
    return '--ml-category-image:url('+choices[hash]+');--ml-category-size:cover;--ml-category-position:center;';
  }
  function mlCategoryEmoji(name){
    var n=String(name||'').toLowerCase();
    if(/tomato/.test(n))return '🍅';
    if(/onion/.test(n))return '🧅';
    if(/rice|grain|cereal/.test(n))return '🍚';
    if(/carrot|root vegetable/.test(n))return '🥕';
    if(/leaf|green|vegetable|fresh|produce|fruit|grocery|grocer/.test(n))return '🥬';
    if(/oil|spice|pantry|seasoning|kitchen/.test(n))return '🫙';
    if(/food|meal|restaurant|fish|meat|chicken|seafood|bakery|snack/.test(n))return '🍲';
    if(/clothing|fashion|shoe|fabric|tailor|apparel/.test(n))return '👕';
    if(/beauty|cosmetic|jewel|accessor|pharmacy|medicine|health/.test(n))return '✨';
    if(/electronics|digital|phone|computer/.test(n))return '📱';
    if(/construction|building/.test(n))return '🧱';
    if(/vehicle|car|motorbike|delivery/.test(n))return '🛵';
    if(/service/.test(n))return '🧰';
    if(/oil|household|home/.test(n))return '🛒';
    return '🛍️';
  }
  function mlCategoryPhotoMarkup(name,photoClass){
    var label=String(name||'Marketplace category');
    return '<span class="'+photoClass+'" role="img" aria-label="'+esc(label)+'" style="'+mlCategoryStyle(label)+'"><span class="ml-category-photo-fallback" aria-hidden="true">'+mlCategoryEmoji(label)+'</span></span>';
  }
  async function renderLiveCategoriesPage(){
    var root=G('catpage-content');if(!root)return;
    if(S.activeCategoryId){await renderLiveCategoryProducts(S.activeCategoryId,S.activeCategoryName||'Category');return;}
    root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">FIND YOUR ESSENTIALS</div><h3>Shop by category</h3></div><button type="button" onclick="switchTab(\'home\')">← Home</button></div><div class="ml-loading">Loading live categories…</div></div>';
    try{
      if(!Array.isArray(liveCategories)||!liveCategories.length){
        var response=await ML_API.categories.getTree();
        liveCategories=Array.isArray(response.data)?response.data:[];
      }
      var cards=liveCategories.map(function(cat){
        return '<button type="button" class="ml-category-card" data-ml-category-id="'+esc(liveProductId(cat.id))+'" data-ml-category-name="'+esc(cat.name||'Category')+'">'+mlCategoryPhotoMarkup(cat.name,'ml-category-photo')+'<span class="ml-category-card-name">'+esc(cat.name||'Category')+'</span></button>';
      }).join('');
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">FIND YOUR ESSENTIALS</div><h3>Shop by category</h3></div><button type="button" onclick="switchTab(\'home\')">← Home</button></div>'+
        (cards?'<div class="ml-category-grid">'+cards+'</div>':'<div class="ml-empty"><b>No live categories yet</b><span>Categories will appear when published by MarketLink.</span></div>')+'</div>';
      root.querySelectorAll('[data-ml-category-id]').forEach(function(card){card.addEventListener('click',function(){openCategory(card.getAttribute('data-ml-category-id'),card.getAttribute('data-ml-category-name'));});});
    }catch(e){
      root.innerHTML='<div class="ml-empty"><b>Categories unavailable</b><span>'+esc(e.error||e.message||'Could not load live categories.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.renderCategories()">Retry</button></div>';
    }
  }
  async function renderLiveCategoryProducts(id,name){
    var root=G('catpage-content');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">LIVE MARKETPLACE</div><h3>'+esc(name||'Category')+'</h3></div><button type="button" onclick="window.ML_Premium.renderCategories()">← Categories</button></div><div class="ml-loading">Loading active products…</div></div>';
    try{
      var res=await ML_API.products.list({page:1,limit:40,categoryId:id,sort:'newest'});
      var products=normalizeProducts(res.data);
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">LIVE MARKETPLACE</div><h3>'+esc(name||'Category')+'</h3></div><button type="button" onclick="window.ML_Premium.renderCategories()">← Categories</button></div>'+
        (products.length?'<div class="ml-product-grid">'+products.map(productCard).join('')+'</div>':'<div class="ml-empty"><div style="font-size:30px">📦</div><b>No active products in this category</b><span>This category is live but has no approved active products yet.</span></div>')+'</div>';
    }catch(e){
      root.innerHTML='<div class="ml-empty"><b>Category products unavailable</b><span>'+esc(e.error||e.message||'Could not load this category.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.renderCategories()">Back to categories</button></div>';
    }
  }
  function mlOrderStatusLabel(status){
    var map={pending:'Pending',accepted:'Accepted',preparing:'Preparing',awaiting_rider:'Waiting for rider',rider_assigned:'Rider assigned',picked_up:'Picked up',on_the_way:'On the way',delivered:'Delivered',cancelled:'Cancelled',failed:'Failed',refunded:'Refunded'};
    return map[String(status||'').toLowerCase()]||String(status||'Status unavailable').replace(/_/g,' ');
  }
  function mlOrderDate(value){
    if(!value)return 'Date unavailable';
    var date=new Date(value);
    return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  }
  async function renderLiveOrders(){
    stopCustomerOrderDetailPolling();
    var root=G('orders-body');if(!root)return;
    if(!apiOk()){
      root.innerHTML='<div class="ml-empty"><div style="font-size:32px">🔐</div><b>Sign in to view your orders</b><span>Your order history is securely linked to your MarketLink account.</span><button class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="goAuth()">Sign in</button></div>';
      return;
    }
    root.innerHTML='<div class="ml-premium-home"><div class="ml-eyebrow">YOUR MARKETLINK ACCOUNT</div><h2 class="ml-hero-title">Order history</h2><div class="ml-loading">Loading orders from your account…</div></div>';
    try{
      var response=await ML_API.customers.getOrders({page:1,limit:30});
      var rows=normalizeProducts(response&&response.data);
      if(!rows.length){
        root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">YOUR MARKETLINK ACCOUNT</div><h2>Order history</h2></div><button type="button" onclick="switchTab(\'home\')">Shop now</button></div><div class="ml-empty"><div style="font-size:36px">📦</div><b>No orders yet</b><span>Your confirmed MarketLink orders will appear here with their real status, vendor, items and total.</span></div></div>';
        return;
      }
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">YOUR MARKETLINK ACCOUNT</div><h2>Order history</h2><p class="ml-hero-sub">'+rows.length+' recent order'+(rows.length===1?'':'s')+' from your account</p></div><button type="button" onclick="window.ML_Premium.openOrders()">↻ Refresh</button></div>'+
        '<div class="ml-live-order-list">'+rows.map(function(o){
          var status=String(o.status||'pending').toLowerCase();
          var tone=status==='delivered'?'delivered':status==='cancelled'||status==='failed'||status==='refunded'?'closed':'active';
          var items=Array.isArray(o.items)?o.items:[];
          var summary=items.slice(0,3).map(function(it){return esc(it.name||it.product_name_snapshot||'Item')+' × '+Number(it.qty||it.quantity||1);}).join(' · ');
          if(!summary)summary='Order details available';
          return '<article class="ml-live-order-card"><div class="ml-live-order-top"><div><span class="ml-live-order-id">'+esc(o.order_number||o.id||'MarketLink order')+'</span><div class="ml-live-order-date">'+mlOrderDate(o.placed_at||o.created_at)+'</div></div><span class="ml-live-order-status '+tone+'">'+esc(mlOrderStatusLabel(status))+'</span></div>'+
            '<div class="ml-live-order-vendor">🏪 '+esc(o.vendor_name||'MarketLink vendor')+'</div><div class="ml-live-order-items">'+summary+(items.length>3?' · +'+(items.length-3)+' more':'')+'</div>'+
            '<div class="ml-live-order-bottom"><div><span>Total</span><strong>'+money(o.total||0)+'</strong><small>'+esc(String(o.payment_method||'').replace(/_/g,' ').toUpperCase()||'Payment method not listed')+'</small></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewOrder(\''+esc(String(o.id||''))+'\')">View details →</button></div></article>';
        }).join('')+'</div></div>';
    }catch(e){
      root.innerHTML='<div class="ml-empty"><div style="font-size:32px">📦</div><b>Order history unavailable</b><span>'+esc(e.error||e.message||'MarketLink could not load your order history.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openOrders()">Retry</button></div>';
    }
  }
  function stopCustomerOrderDetailPolling(){
    if(mlOrderDetailTimer){clearInterval(mlOrderDetailTimer);mlOrderDetailTimer=null;}
    mlOpenOrderDetailId=null;
  }
  function startCustomerOrderDetailPolling(id){
    if(mlOrderDetailTimer&&String(mlOpenOrderDetailId)===String(id))return;
    stopCustomerOrderDetailPolling();
    mlOpenOrderDetailId=String(id);
    mlOrderDetailTimer=setInterval(function(){
      if(S.curTab!=='orders'||String(mlOpenOrderDetailId)!==String(id)){
        stopCustomerOrderDetailPolling();return;
      }
      openOrderDetail(id,true);
    },10000);
  }
  function mlTrackingTime(value){
    if(!value)return 'Waiting for this update';
    var d=new Date(value);
    if(Number.isNaN(d.getTime()))return 'Update recorded';
    return d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  async function openOrderDetail(id,silent){
    var root=G('orders-body');if(!root)return;
    if(!id){stopCustomerOrderDetailPolling();renderLiveOrders();return;}
    if(!silent){stopCustomerOrderDetailPolling();mlOpenOrderDetailId=String(id);root.innerHTML='<div class="ml-loading">Loading live order details…</div>';}
    else if(String(mlOpenOrderDetailId)!==String(id)||S.curTab!=='orders')return;
    try{
      var response=await ML_API.orders.getById(id),o=response&&response.data&&response.data.order?response.data.order:response&&response.data;
      if(!o)throw new Error('Order details were not returned.');
      var liveTracking=null;
      if(o.delivery_id){
        try{
          var trackingResponse=await ML_API.delivery.getTracking(o.delivery_id);
          liveTracking=trackingResponse&&trackingResponse.data?trackingResponse.data:trackingResponse;
        }catch(trackingError){
          // Status timeline remains available even while GPS tracking is not.
          liveTracking=null;
        }
      }
      var items=Array.isArray(o.items)?o.items:Array.isArray(o.order_items)?o.order_items:[];
      var current=String(o.status||'pending').toLowerCase();
      var steps=[
        {keys:['pending'],title:'Order received',body:'MarketLink has received your order.'},
        {keys:['accepted'],title:'Vendor confirmed',body:'The vendor has accepted your order.'},
        {keys:['preparing','awaiting_rider'],title:'Preparing your order',body:'The vendor is preparing your items and arranging collection.'},
        {keys:['rider_assigned'],title:'Rider assigned',body:'A delivery rider has been assigned to your order.'},
        {keys:['picked_up'],title:'Picked up',body:'The rider has collected your order.'},
        {keys:['on_the_way'],title:'On the way',body:'Your order is on its way to the delivery address.'},
        {keys:['delivered'],title:'Delivered',body:'Your order has been marked as delivered.'}
      ];
      var progressIndex=steps.findIndex(function(st){return st.keys.indexOf(current)>-1;});
      if(current==='awaiting_rider')progressIndex=2;
      if(progressIndex<0)progressIndex=0;
      var history=Array.isArray(o.status_history)?o.status_history:[];
      var terminal=['delivered','cancelled','failed','refunded'].indexOf(current)>-1;
      var closed=['cancelled','failed','refunded'].indexOf(current)>-1;
      var progressHtml=steps.map(function(st,index){
        var found=history.filter(function(event){return st.keys.indexOf(String(event.status||'').toLowerCase())>-1;}).pop();
        var done=index<progressIndex||(current==='delivered'&&index<=progressIndex);
        var active=index===progressIndex&&!closed;
        var cls=done?'done':active?'current':'upcoming';
        var mark=done?'✓':active?'•':String(index+1);
        return '<div class="ml-tracking-step '+cls+'"><span class="ml-tracking-step-marker">'+mark+'</span><div class="ml-tracking-step-copy"><b>'+esc(st.title)+'</b><p>'+esc(st.body)+'</p><small>'+esc(found?mlTrackingTime(found.changed_at):active?'Current status · '+mlOrderStatusLabel(current):'')+'</small>'+(found&&found.note?'<span class="ml-tracking-note">'+esc(found.note)+'</span>':'')+'</div></div>';
      }).join('');
      var ratio=Math.max(0,Math.min(100,progressIndex/(steps.length-1)*100));
      var deliveryDetails=o.rider_name?'<div class="ml-tracking-meta-row"><span>Delivery rider</span><b>'+esc(o.rider_name)+'</b></div>':'';
      if(o.estimated_minutes!==null&&o.estimated_minutes!==undefined)deliveryDetails+='<div class="ml-tracking-meta-row"><span>Delivery estimate</span><b>'+Number(o.estimated_minutes)+' minutes (estimate)</b></div>';
      if(o.distance_km!==null&&o.distance_km!==undefined)deliveryDetails+='<div class="ml-tracking-meta-row"><span>Route distance</span><b>'+Number(o.distance_km).toFixed(1)+' km</b></div>';
      var latestPing=null,locationTrail=liveTracking&&Array.isArray(liveTracking.location_trail)?liveTracking.location_trail:[];
      if(locationTrail.length)latestPing=locationTrail[0];
      var liveLat=latestPing&&latestPing.lat!==null&&latestPing.lat!==undefined&&latestPing.lat!==''?Number(latestPing.lat):null;
      var liveLng=latestPing&&latestPing.lng!==null&&latestPing.lng!==undefined&&latestPing.lng!==''?Number(latestPing.lng):null;
      var validLiveCoordinates=liveLat!==null&&liveLng!==null&&Number.isFinite(liveLat)&&Number.isFinite(liveLng)&&liveLat>=-90&&liveLat<=90&&liveLng>=-180&&liveLng<=180;
      var pingDate=latestPing&&latestPing.recorded_at?new Date(latestPing.recorded_at):null;
      var pingAge=pingDate&&!Number.isNaN(pingDate.getTime())?Date.now()-pingDate.getTime():Infinity;
      var freshGps=validLiveCoordinates&&pingAge>=0&&pingAge<=15*60*1000&&!terminal;
      var gpsHtml='';
      if(freshGps){
        var mapUrl='https://www.google.com/maps?q='+encodeURIComponent(liveLat.toFixed(6)+','+liveLng.toFixed(6));
        gpsHtml='<div class="ml-tracking-location"><div class="ml-tracking-location-symbol">📍</div><div class="ml-tracking-location-copy"><b>Live rider location</b><span>Last shared '+esc(mlTrackingTime(latestPing.recorded_at))+'</span><small>Location shared for this delivery only.</small></div><a class="ml-btn ml-btn-secondary ml-tracking-map-link" href="'+mapUrl+'" target="_blank" rel="noopener noreferrer">Open map ↗</a></div>';
      }else if(validLiveCoordinates&&latestPing&&latestPing.recorded_at&&!terminal){
        gpsHtml='<div class="ml-tracking-location is-stale"><div class="ml-tracking-location-symbol">📍</div><div class="ml-tracking-location-copy"><b>Last rider location</b><span>Last update '+esc(mlTrackingTime(latestPing.recorded_at))+'</span><small>This location is older than 15 minutes, so it is not shown as live.</small></div></div>';
      }else if(!terminal&&o.rider_name){
        gpsHtml='<div class="ml-tracking-location is-pending"><div class="ml-tracking-location-symbol">📍</div><div class="ml-tracking-location-copy"><b>Rider location</b><span>Waiting for a location update for this delivery.</span><small>The order timeline will continue to refresh even when GPS is unavailable.</small></div></div>';
      }
      var statusClass=current==='delivered'?'delivered':closed?'closed':'active';
      var closedNotice=closed?'<div class="ml-tracking-issue '+(current==='cancelled'?'cancelled':'failed')+'"><b>'+esc(mlOrderStatusLabel(current))+'</b><span>'+(current==='cancelled'?'This order was cancelled. Contact support if you need help with a payment or refund.':current==='refunded'?'The order is marked as refunded. Check payment history for the confirmed refund record.':'The order could not be completed. Contact MarketLink support for assistance.')+'</span></div>':'';
      var timeline=history.length?'<div class="ml-tracking-history"><h4>Latest order updates</h4>'+history.slice().reverse().slice(0,8).map(function(ev){return '<div class="ml-tracking-history-row"><span class="ml-tracking-history-dot"></span><div><b>'+esc(mlOrderStatusLabel(ev.status))+'</b><small>'+esc(mlTrackingTime(ev.changed_at))+'</small>'+(ev.note?'<p>'+esc(ev.note)+'</p>':'')+'</div></div>';}).join('')+'</div>':'';
      root.innerHTML='<div class="ml-premium-home ml-order-tracking-page"><div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK ORDER TRACKING</div><h2>'+esc(o.order_number||'Your order')+'</h2><p class="ml-hero-sub">Placed '+esc(mlOrderDate(o.placed_at||o.created_at))+'</p></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openOrders()">← Order history</button></div>'+
        '<section class="ml-tracking-hero"><div class="ml-tracking-hero-top"><div><span class="ml-tracking-label">CURRENT ORDER STATUS</span><h3>'+esc(mlOrderStatusLabel(current))+'</h3><p>'+(closed?'The order needs attention.':current==='delivered'?'Your delivery has been completed.': 'Your order progress refreshes automatically every 10 seconds while this page is open.')+'</p></div><span class="ml-live-order-status '+statusClass+'">'+esc(mlOrderStatusLabel(current))+'</span></div>'+
        (!closed?'<div class="ml-tracking-progress"><span style="width:'+(current==='delivered'?100:ratio)+'%"></span></div>':'')+
        (closedNotice||'<div class="ml-tracking-steps">'+progressHtml+'</div>')+
        '</section>'+
        '<section class="ml-tracking-info-grid"><div class="ml-live-order-card"><div class="ml-section-head"><h3>Delivery details</h3></div>'+(deliveryDetails||'<p class="ml-tracking-empty">Rider and delivery estimate will appear here when they are assigned by the live delivery system.</p>')+gpsHtml+'</div>'+
        '<div class="ml-live-order-card"><div class="ml-section-head"><h3>Order summary</h3></div><div class="ml-tracking-meta-row"><span>Vendor</span><b>'+esc(o.vendor_name||(o.vendor&&o.vendor.business_name)||'MarketLink vendor')+'</b></div><div class="ml-tracking-meta-row"><span>Payment</span><b>'+esc(String(o.payment_method||'Not listed').replace(/_/g,' '))+' · '+esc(String(o.payment_status||'Not listed').replace(/_/g,' '))+'</b></div><div class="ml-tracking-meta-row"><span>Total</span><b>'+money(o.total||0)+'</b></div><div class="ml-tracking-items">'+(items.length?items.map(function(it){return '<div><span>'+esc(it.name||it.product_name_snapshot||it.product_name||'Item')+' × '+Number(it.qty||it.quantity||1)+'</span><b>'+money(it.total||it.line_total||Number(it.price||it.unit_price||0)*Number(it.qty||it.quantity||1))+'</b></div>';}).join(''):'<span>Item details unavailable</span>')+'</div></div></section>'+
        timeline+
        '<div class="ml-tracking-footer"><span class="ml-tracking-live-dot"></span><span>Order statuses refresh every 10 seconds. Rider location appears only when a recent GPS ping is recorded for this delivery.</span><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewOrder(\''+esc(String(o.id||id))+'\')">Refresh now ↻</button></div></div>';
      if(terminal)stopCustomerOrderDetailPolling();else startCustomerOrderDetailPolling(id);
    }catch(e){
      if(!silent)root.innerHTML='<div class="ml-empty"><b>Could not open this order</b><span>'+esc(e.error||e.message||'The order may no longer be available.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openOrders()">Back to order history</button></div>';
    }
  }
  function renderPremiumHome(){
    var root=G('tab-home');if(!root)return;
    var catHtml=liveCategories.slice(0,12).map(function(c){
      return '<button type="button" class="ml-cat" data-ml-category-id="'+esc(liveProductId(c.id))+'" data-ml-category-name="'+esc(c.name||'Category')+'">'+mlCategoryPhotoMarkup(c.name,'ml-cat-photo')+'<span class="ml-cat-name">'+esc(c.name)+'</span></button>';
    }).join('');
    if(!catHtml) catHtml='<div class="ml-empty" style="width:100%;box-sizing:border-box;"><b>Categories are being prepared</b><span>Live categories will appear here as soon as they are published.</span></div>';
    var prodHtml=liveProducts.map(function(p){return productCard(p);}).join('');
    var orderCount=liveProfile?Number(liveProfile.total_orders||0):0;
    var spent=liveProfile?Number(liveProfile.total_spent||0):0;
    var wallet=liveWallet?Number(liveWallet.balance||0):Number(S.walletBalance||0);
    root.innerHTML=
      '<div class="ml-premium-home">'+
      '<div class="ml-home-top"><div>'+mlOfficialBrandMarkup()+'<div class="ml-hero-title">Welcome back, '+esc(firstName())+'.</div><div class="ml-hero-sub">Discover products from local vendors, order securely and track each step.</div></div><div class="ml-live-dot">Live marketplace</div></div>'+
      '<div class="ml-home-discovery"><button type="button" class="ml-btn ml-btn-primary" onclick="var s=document.getElementById(\'hsearch\');if(s)s.focus()">🔎 Search marketplace</button><button type="button" class="ml-btn ml-btn-secondary" onclick="switchTab(\'orders\')">📦 Track my orders</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.renderCategories()">🛍️ Browse categories</button></div>'+
      '<div class="ml-home-search"><span aria-hidden="true">🔎</span><input id="hsearch" type="search" autocomplete="off" placeholder="Search products, vendors or categories…" aria-label="Search products, vendors or categories" oninput="window.doSearch(this.value)"><button type="button" onclick="var q=document.getElementById(\'hsearch\');if(q)window.doSearch(q.value)">Search</button></div>'+
      promoCarouselMarkup()+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>⚡ Verified marketplace</strong><span>Shop products published by approved vendors.</span></div><div class="ml-promo"><strong>🛵 Delivery network</strong><span>Follow your order through the real delivery workflow.</span></div><div class="ml-promo"><strong>💳 Secure checkout</strong><span>Use supported MarketLink payment methods at checkout.</span></div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Orders</div><div class="ml-stat-value">'+orderCount+'</div></div><div class="ml-stat"><div class="ml-stat-label">Wallet</div><div class="ml-stat-value">'+money(wallet)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Total spent</div><div class="ml-stat-value">'+money(spent)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Reward points</div><div class="ml-stat-value">'+Number(S.rewardPoints||0).toLocaleString()+'</div></div></div>'+
      '<div class="ml-section-head"><h3>Browse categories</h3><button onclick="window.ML_Premium.refresh()">Refresh</button></div><div class="ml-cat-row">'+catHtml+'</div>'+
      '<div class="ml-section-head"><h3>Latest from MarketLink</h3><button onclick="window.ML_Premium.refresh()">View latest</button></div>'+
      (prodHtml?'<div class="ml-product-grid">'+prodHtml+'</div>':'<div class="ml-empty"><div style="font-size:30px">🛍️</div><b>No live products yet</b><span>When an approved vendor publishes an active product, it will appear here automatically. No demo products are being shown.</span></div>')+
      roleCtaSectionMarkup()+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span><div class="ml-footer-nav"><button type="button" onclick="switchTab(\'home\')">Home</button><button type="button" onclick="switchTab(\'catpage\')">Categories</button><button type="button" onclick="switchTab(\'orders\')">Orders</button><button type="button" onclick="switchTab(\'cart\')">Cart</button><button type="button" onclick="switchTab(\'profile\')">Profile</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'wallet\')">Royal Wallet</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'terms\')">Terms of Service</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'privPolicy\')">Privacy Policy</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'deliveryPolicy\')">Delivery & Returns</button></div></footer>'+
      '</div>';
    setTimeout(initPromoCarousel,0);
    var homeRoot=G('tab-home');
    if(homeRoot)homeRoot.querySelectorAll('[data-ml-category-id]').forEach(function(card){
      card.addEventListener('click',function(){openCategory(card.getAttribute('data-ml-category-id'),card.getAttribute('data-ml-category-name'));});
    });
  }
  async function openCategory(id,name){
    S.activeCategoryId=String(id||'');
    S.activeCategoryName=String(name||'Category');
    switchTab('catpage');
  }
  function productCard(p){
    var pid=liveProductId(p.id),stock=p.stock==null?null:Number(p.stock);
    return '<article class="ml-product" onclick="window.ML_Premium.openProduct(\''+esc(pid)+'\')"><div class="ml-product-img">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div class="ml-product-body"><div class="ml-product-vendor">'+esc(p.vendor_name||p.vendorName||'MarketLink vendor')+'</div><div class="ml-product-name">'+esc(p.name)+'</div><div class="ml-product-meta"><div><div class="ml-price">'+money(p.price)+'</div><div class="ml-stock">'+(stock==null?'Available':stock>0?stock+' in stock':'Out of stock')+'</div></div><button class="ml-add" '+(stock===0?'disabled':'')+' onclick="event.stopPropagation();window.ML_Premium.add(\''+esc(pid)+'\')">+</button></div></div></article>';
  }
  async function openProduct(id){
    try{
      var res=await ML_API.products.getById(id),p=res.data;if(!p)throw new Error('Product not found');
      var root=S.curTab==='catpage'?G('catpage-content'):G('tab-home');if(!root)return;root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Product</h3><button onclick="S.curTab===\'catpage\'?window.ML_Premium.openCategory(S.activeCategoryId,S.activeCategoryName):window.ML_Premium.refresh()">← Back</button></div>'+
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
    if(!S.pendingPayment)await resumePendingPaymentFromSession();
    if(S.pendingPayment){renderLivePaymentStep();return;}
    if(!Object.keys(S.cart||{}).length){root.innerHTML='<div class="ml-empty"><div style="font-size:30px">🛒</div><b>Your cart is empty</b><span>Add an active product from the live marketplace to begin checkout.</span></div>';return;}
    root.innerHTML='<div class="ml-loading">Loading live cart…</div>';
    var metadata=await refreshCartMetadata();
    if(metadata.some(function(p){return !p;})){root.innerHTML='<div class="ml-empty"><b>Some cart items are unavailable</b><span>Remove unavailable items and add them again from the live marketplace.</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshCart()">Retry</button></div>';return;}
    var ids=Object.keys(S.cart||{}),vendorIds=metadata.map(function(p){return p&&p.vendorId;}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;});
    var sub=ids.reduce(function(t,id){var p=CART_ITEMS[id];return t+Number(p&&p.price||0)*Number(S.cart[id]||0);},0);
    var addresses;try{addresses=await loadLiveAddresses();}catch(e){root.innerHTML='<div class="ml-empty"><b>Saved addresses unavailable</b><span>'+esc(e.error||'Could not load your saved addresses.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshCart()">Retry</button></div>';return;}
    var addressHtml=addresses.length?addresses.map(function(a){var selected=String(a.id)===String(S.delivAddressId||S.deliveryAddressId);return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;cursor:pointer;border:1px solid '+(selected?'rgba(66,210,201,.55)':'rgba(255,255,255,.07)')+';background:'+(selected?'rgba(13,115,119,.10)':'transparent')+';" onclick="window.ML_Premium.selectAddress(\''+esc(String(a.id))+'\')"><div class="ico">📍</div><div class="copy"><b>'+esc(a.label||'Address')+'</b><span>'+esc(a.full_address||'')+(a.area?' · '+esc(a.area):'')+'</span></div>'+(selected?'<span style="color:#42D2C9;font-size:10px;font-weight:700">Selected</span>':'')+'</button>';}).join(''):'<div class="ml-empty"><b>No saved delivery addresses</b><span>Add your first address in Profile → Saved addresses.</span></div>';
    try{
      var capabilityResponse=await ML_API.payments.methods();
      var capabilityData=capabilityResponse&&capabilityResponse.data?capabilityResponse.data:capabilityResponse;
      S.paymentCapabilities={
        configured:Boolean(capabilityData&&capabilityData.configured),
        mode:String(capabilityData&&capabilityData.mode||'merchant'),
        directMobileMoney:Boolean(capabilityData&&capabilityData.directMobileMoney),
        hostedCheckout:Boolean(capabilityData&&capabilityData.hostedCheckout),
        setupReason:String(capabilityData&&capabilityData.setupReason||'')
      };
    }catch(capabilityError){
      // Fail closed: a capability check error must never leave a previously cached
      // provider state looking ready for a new payment attempt.
      S.paymentCapabilities={configured:false,mode:'merchant',directMobileMoney:false,hostedCheckout:false};
    }
    var mobileChoices=['Wave','AfriMoney','QMoney'];
    if(!S.paymentCapabilities.configured&&S.selPay!=='Pay on Delivery'){
      S.selPay='Pay on Delivery';
      S.paymentAccountNumber='';
    }else if(S.paymentCapabilities.configured&&!S.paymentCapabilities.directMobileMoney&&mobileChoices.indexOf(S.selPay)>-1){
      S.selPay='Modem Pay secure checkout';
      S.paymentAccountNumber='';
    }else if(S.paymentCapabilities.directMobileMoney&&S.selPay==='Modem Pay secure checkout'){
      S.selPay='Pay on Delivery';
    }
    var chosenPaymentLabel=S.selPay||'Pay on Delivery';
    var paymentCaps=S.paymentCapabilities||{configured:false,mode:'merchant',directMobileMoney:false,hostedCheckout:false};
    var paymentHtml=livePaymentOptions().map(function(opt){
      var selected=chosenPaymentLabel===opt[0],isCod=opt[1]==='cod',unavailable=!isCod&&!paymentCaps.configured;
      var subText=isCod?'Pay when your order arrives.':unavailable?'Temporarily unavailable while Modem Pay setup is completed.':paymentCaps.directMobileMoney?'Enter your mobile-money number. MarketLink will show the provider’s next step before you approve the payment.':'Continue to Modem Pay’s secure checkout to complete the payment.';
      return '<button type="button" class="ml-profile-row ml-payment-option'+(unavailable?' ml-payment-option-disabled':'')+'" '+(unavailable?'disabled aria-disabled="true"':'')+' style="width:100%;text-align:left;cursor:'+(unavailable?'not-allowed':'pointer')+';border:1px solid '+(selected?'rgba(66,210,201,.55)':'rgba(255,255,255,.07)')+';background:'+(selected?'rgba(13,115,119,.10)':'transparent')+';" onclick="window.ML_Premium.selectPayment(\''+esc(opt[0])+'\')"><div class="ico">'+(isCod?'💵':opt[1]==='wave'?'📱':opt[1]==='afrimoney'?'📲':'💳')+'</div><div class="copy"><b>'+esc(opt[0])+'</b><span>'+esc(subText)+'</span></div>'+(unavailable?'<span class="ml-payment-unavailable">Setup pending</span>':selected?'<span style="color:#42D2C9;font-size:10px;font-weight:700">Selected</span>':'')+'</button>';
    }).join('');
    var mobileMoneySelected=Boolean(paymentCaps.directMobileMoney)&&['Wave','AfriMoney','QMoney'].indexOf(chosenPaymentLabel)>-1;
    var mobileMoneyInputHtml=mobileMoneySelected?'<div class="ml-mobile-money-field"><label for="ml-mobile-money-number">Mobile-money number</label><input id="ml-mobile-money-number" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="7" pattern="[0-9]{7}" placeholder="Enter 7-digit number" value="'+esc(S.paymentAccountNumber||'')+'"><small>Use the local 7-digit number, without +220. Never enter your wallet PIN on this screen.</small></div>':'';
    var itemsHtml=ids.map(function(id){var p=CART_ITEMS[id],qty=Number(S.cart[id]||0);return '<div class="ml-profile-row"><div class="ico">🛍️</div><div class="copy"><b>'+esc(p.name)+'</b><span>'+money(p.price)+' × '+qty+' · '+esc(p.vendorName||'Vendor')+'</span></div><strong style="color:#FFD778">'+money(Number(p.price||0)*qty)+'</strong></div>';}).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Your cart</h3><button onclick="window.ML_Premium.refreshCart()">Refresh</button></div><div class="ml-profile-card"><div class="ml-section-head"><h3>Items</h3><span style="color:#91A4B4;font-size:10px">'+vendorIds.length+' vendor'+(vendorIds.length===1?'':'s')+'</span></div>'+itemsHtml+'</div>'+
      (vendorIds.length>1?'<div class="ml-empty" style="margin-top:10px"><b>Multiple vendors in cart</b><span>MarketLink currently requires one vendor per checkout. Remove items from other vendors.</span></div>':'')+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Delivery address</h3><button onclick="window.ML_Premium.manageAddresses()">Manage</button></div>'+addressHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Payment</h3><span style="color:#91A4B4;font-size:10px">Live provider options</span></div>'+paymentHtml+mobileMoneyInputHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Coupon</h3><span style="color:#91A4B4;font-size:10px">Validated by backend</span></div><div style="display:flex;gap:8px"><input id="ml-cart-coupon" class="inp" placeholder="Optional coupon code" value="'+esc((S.appliedCoupon&&S.appliedCoupon.code)||'')+'" style="margin:0;flex:1"><button class="ml-btn ml-btn-secondary" type="button" onclick="window.ML_Premium.setCoupon()">Apply</button></div></div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-profile-row"><div class="copy"><b>Subtotal</b><span>Current live product prices; final totals are validated by the backend.</span></div><strong>'+money(sub)+'</strong></div><div class="ml-profile-row"><div class="copy"><b>Delivery</b><span>Calculated by MarketLink server.</span></div><strong>At checkout</strong></div><div class="ml-profile-row"><div class="copy"><b>Total</b><span>The backend confirms the final payable amount.</span></div><strong style="color:#42D2C9">Server-calculated</strong></div></div>'+
      (addresses.length&&String(S.delivAddressId||S.deliveryAddressId)?'<button class="ml-btn ml-btn-primary" data-ml-place-order style="width:100%;margin-top:12px" onclick="window.ML_Premium.placeOrder()">Place Order</button>':'<button class="ml-btn ml-btn-primary" style="width:100%;margin-top:12px" disabled>Select a delivery address first</button>')+
      '</div>';
  }
  function selectAddress(id){S.delivAddressId=String(id);S.deliveryAddressId=String(id);renderLiveCart();}
  function selectPayment(label){
    var previous=G('ml-mobile-money-number');
    if(previous)S.paymentAccountNumber=String(previous.value||'').replace(/\D/g,'').slice(0,7);
    var method=normalizePaymentChoice(label);
    if(method!=='cod'&&!(S.paymentCapabilities&&S.paymentCapabilities.configured)){
      toast('Mobile-money payments are not available yet. MarketLink is waiting for Modem Pay configuration.','warning');
      return;
    }
    S.selPay=label;renderLiveCart();
  }
  function setCoupon(){var el=G('ml-cart-coupon'),code=el&&el.value.trim().toUpperCase();S.appliedCoupon=code?{code:code}:null;toast(code?'Coupon will be validated securely at order placement.':'Coupon removed.','info');renderLiveCart();}
  function manageAddresses(){switchTab('profile');renderAddresses();}
  async function loadProfile(){
    if(!apiOk())return;
    try{
      var r=await ML_API.customers.getProfile();liveProfile=r.data||liveProfile;
      if(liveProfile){S.profileName=liveProfile.full_name||'';S.profilePhone=liveProfile.phone||'';S.profilePhoto=liveProfile.profile_photo_url||null;}
    }catch(e){}
  }
  async function getProfileImageDimensions(file){
    if(typeof createImageBitmap==='function'){
      var bitmap=await createImageBitmap(file);
      var dimensions={width:bitmap.width,height:bitmap.height};
      if(bitmap.close)bitmap.close();
      return dimensions;
    }
    return await new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onerror=function(){reject(new Error('This image could not be read. Please choose a valid JPG or PNG.'));};
      reader.onload=function(){
        var image=new Image();
        image.onload=function(){resolve({width:image.naturalWidth,height:image.naturalHeight});};
        image.onerror=function(){reject(new Error('This image could not be read. Please choose a valid JPG or PNG.'));};
        image.src=String(reader.result||'');
      };
      reader.readAsDataURL(file);
    });
  }
  async function saveProfilePhoto(file){
    if(!file)return false;
    if(!apiOk()){toast('Please sign in again before changing your profile photo.','error');return false;}
    var allowed=['image/jpeg','image/png'];
    if(allowed.indexOf(file.type)<0){toast('Profile photos must be JPG/JPEG or PNG.','error');return false;}
    if(file.size>5*1024*1024){toast('Profile photos must be no larger than 5 MB. Please choose a smaller image.','error');return false;}
    if(file.size<=0){toast('The selected image is empty. Please choose another photo.','error');return false;}
    try{
      var dimensions=await getProfileImageDimensions(file);
      if(dimensions.width<512||dimensions.height<512){
        toast('Choose a photo that is at least 512 × 512 pixels. Your photo has not been uploaded.','error');
        return false;
      }
    }catch(imageReadError){toast(imageReadError.message||'Could not read this image. Please choose a valid JPG or PNG.','error');return false;}
    var oldPhoto=liveProfile&&liveProfile.profile_photo_url||S.profilePhoto||null;
    var uploadedUrl=null;
    try{
      toast('Uploading your profile photo…','info');
      var uploaded=await ML_API.uploads.upload(file,'profile-photo');
      uploadedUrl=uploaded&&uploaded.url;
      if(!uploadedUrl||!/^https?:\/\//i.test(uploadedUrl))throw {error:'MarketLink did not receive a valid saved image URL. Please retry or contact support.'};
      var response=await ML_API.customers.updateProfile({profilePhotoUrl:uploadedUrl});
      liveProfile=response&&response.data||liveProfile;
      if(!liveProfile)liveProfile={};
      liveProfile.profile_photo_url=uploadedUrl;
      S.profilePhoto=uploadedUrl;
      renderPremiumProfile();
      toast('Your profile photo has been updated.','success');
      if(oldPhoto&&oldPhoto!==uploadedUrl){
        try{await ML_API.uploads.deleteByUrl(oldPhoto);}catch(cleanupError){}
      }
      return true;
    }catch(e){
      if(uploadedUrl&&uploadedUrl!==oldPhoto){
        try{await ML_API.uploads.deleteByUrl(uploadedUrl);}catch(cleanupError){}
      }
      toast(e.error||e.message||'Could not save your profile photo. Please try again.','error');
      return false;
    }
  }
  async function handleProfilePhotoInput(input){
    var file=input&&input.files&&input.files[0];
    try{if(file)await saveProfilePhoto(file);}
    finally{if(input)input.value='';}
  }
  async function removeProfilePhoto(){
    var oldPhoto=liveProfile&&liveProfile.profile_photo_url||S.profilePhoto||null;
    if(!oldPhoto){toast('You are already using the default avatar.','info');return;}
    if(!confirm('Remove your profile photo and use the MarketLink default avatar?'))return;
    try{
      await ML_API.uploads.removeProfilePhoto();
      var refreshed=await ML_API.customers.getProfile();
      liveProfile=refreshed&&refreshed.data||liveProfile;
      S.profilePhoto=null;
      renderPremiumProfile();
      toast('Your profile photo has been removed.','success');
    }catch(e){toast(e.error||'Could not remove your profile photo. Please try again.','error');}
  }
  function editProfileModal(){
    var fullName=liveProfile&&liveProfile.full_name||S.profileName||S.user&&S.user.name||'';
    var displayName=liveProfile&&liveProfile.display_name||fullName;
    var bio=liveProfile&&liveProfile.bio||'';
    var dob=liveProfile&&liveProfile.date_of_birth||'',gender=liveProfile&&liveProfile.gender||'';
    var html='<div class="ml-modal-form ml-profile-editor">'+
      '<div class="ml-profile-editor-note"><span class="ml-profile-editor-note-icon">🔐</span><span>Your verified phone number stays linked to your account. Contact support if it needs to be changed.</span></div>'+
      '<label for="ml-edit-full-name">Full name</label><input id="ml-edit-full-name" autocomplete="name" value="'+esc(fullName)+'" maxlength="150" placeholder="Enter your full name" required>'+
      '<label for="ml-edit-display-name">Display name</label><input id="ml-edit-display-name" autocomplete="nickname" value="'+esc(displayName)+'" maxlength="80" placeholder="What should people call you?">'+
      '<label for="ml-edit-bio">About you <span class="ml-form-optional">Optional</span></label><textarea id="ml-edit-bio" rows="3" maxlength="280" placeholder="A short introduction about yourself">'+esc(bio)+'</textarea><small class="ml-profile-bio-count">'+String(bio).length+'/280 characters</small>'+
      '<label for="ml-edit-dob">Date of birth <span class="ml-form-optional">Optional</span></label><input id="ml-edit-dob" type="date" value="'+esc(String(dob).slice(0,10))+'">'+
      '<label for="ml-edit-gender">Gender <span class="ml-form-optional">Optional</span></label><select id="ml-edit-gender"><option value="" '+(!gender?'selected':'')+'>Prefer not to say</option><option '+(gender==='male'?'selected':'')+' value="male">Male</option><option '+(gender==='female'?'selected':'')+' value="female">Female</option><option '+(gender==='other'?'selected':'')+' value="other">Other</option></select>'+
      '<div class="ml-modal-actions"><button type="button" class="ml-btn ml-btn-secondary" onclick="closeSheet(\'sh-profile-edit\')">Cancel</button><button type="button" class="ml-btn ml-btn-primary" id="ml-save-profile-button" onclick="window.ML_Premium.saveProfile()">Save changes</button></div></div>';
    var sh=G('sh-profile-edit');
    if(!sh){
      sh=document.createElement('div');
      sh.id='sh-profile-edit';
      sh.className='sheet-ov';
      sh.setAttribute('role','dialog');
      sh.setAttribute('aria-modal','true');
      sh.setAttribute('aria-labelledby','ml-profile-edit-title');
      document.body.appendChild(sh);
    }
    sh.classList.add('ml-profile-edit-overlay');
    sh.innerHTML='<div class="sheet ml-profile-edit-sheet"><div class="sheet-hdr"><span id="ml-profile-edit-title">Edit your profile</span><button type="button" class="sheet-cls" onclick="closeSheet(\'sh-profile-edit\')" aria-label="Close edit profile">×</button></div><div class="sheet-in">'+html+'</div></div>';
    openSheet('sh-profile-edit');
    var bioInput=G('ml-edit-bio'),bioCount=sh.querySelector('.ml-profile-bio-count');
    if(bioInput&&bioCount)bioInput.addEventListener('input',function(){bioCount.textContent=String(bioInput.value.length)+'/280 characters';});
  }
  async function saveProfile(){
    var fullName=G('ml-edit-full-name')&&G('ml-edit-full-name').value.trim();
    var displayName=G('ml-edit-display-name')&&G('ml-edit-display-name').value.trim();
    var bio=G('ml-edit-bio')&&G('ml-edit-bio').value.trim();
    var dateOfBirth=G('ml-edit-dob')&&G('ml-edit-dob').value||null;
    var gender=G('ml-edit-gender')&&G('ml-edit-gender').value||null;
    if(!fullName){toast('Please enter your full name.','error');if(G('ml-edit-full-name'))G('ml-edit-full-name').focus();return;}
    if(fullName.length>150||displayName.length>80||bio.length>280){toast('Please shorten the profile details to fit the fields.','error');return;}
    var saveButton=G('ml-save-profile-button');
    if(saveButton){saveButton.disabled=true;saveButton.textContent='Saving…';}
    try{
      var response=await ML_API.customers.updateProfile({
        fullName:fullName,
        displayName:displayName||fullName,
        bio:bio||null,
        dateOfBirth:dateOfBirth,
        gender:gender
      });
      liveProfile=response&&response.data||liveProfile||{};
      liveProfile.full_name=fullName;
      liveProfile.display_name=displayName||fullName;
      liveProfile.bio=bio||null;
      S.profileName=displayName||fullName;
      S.profileFullName=fullName;
      if(S.user){S.user.name=fullName;S.user.displayName=displayName||fullName;}
      closeSheet('sh-profile-edit');
      await renderPremiumProfile();
      toast('Your profile has been updated.','success');
    }catch(e){
      toast(e.error||'Could not update your profile. Please try again.','error');
      if(saveButton){saveButton.disabled=false;saveButton.textContent='Save changes';}
    }
  }
  function renderPremiumAffiliatePage(root,affiliateData){
    var link=(typeof buildAffiliateShareLink==='function'&&buildAffiliateShareLink())||'Your personal link will appear after your affiliate profile is available.';
    var pct=Number(affiliateData&&affiliateData.commissionPct!=null?affiliateData.commissionPct:2);
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK AFFILIATE</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Share value. Earn rewards.</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div>'+
      '<section class="ml-affiliate-hero"><div class="ml-affiliate-hero-copy"><span class="ml-affiliate-label">YOUR REFERRAL REWARD</span><div class="ml-affiliate-big">'+pct+'<span>%</span></div><h4>Earn 2% of eligible merchandise.</h4><p>Share your unique MarketLink link. When someone places a qualifying order through your link, you can earn 2% of the eligible discounted merchandise subtotal after successful delivery.</p><small>Rewards are funded from MarketLink’s platform commission, not added to the customer’s price.</small></div><div class="ml-affiliate-hero-art ml-affiliate-hero-photo"><img class="ml-affiliate-hero-image" src="./assets/promo-shopping.webp" alt="Customers discovering products at a local supermarket" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display=&quot;none&quot;;this.parentElement.classList.add(&quot;ml-affiliate-hero-photo-failed&quot;)"><div class="ml-affiliate-art-label"><b>2%</b><span>ON ELIGIBLE ORDERS</span></div></div></section>'+
      '<div class="ml-stat-grid ml-affiliate-stats"><div class="ml-stat"><div class="ml-stat-label">Total rewards</div><div class="ml-stat-value">'+money(S.affiliateEarnings||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Referral clicks</div><div class="ml-stat-value">'+Number(S.affiliateClicks||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Referred orders</div><div class="ml-stat-value">'+Number(S.affiliateOrders||0)+'</div></div></div>'+
      '<div class="ml-profile-card ml-affiliate-link-card"><div class="ml-affiliate-link-head"><div><b>Your personal affiliate link</b><span>Share it on WhatsApp or with friends and family.</span></div><span>🔗</span></div><div class="ml-affiliate-link-field"><input readonly aria-label="Affiliate referral link" value="'+esc(link)+'"><button class="ml-btn ml-btn-primary" onclick="copyAffiliateLink()">Copy link</button></div><div class="ml-affiliate-footnote">The 2% reward applies to eligible discounted merchandise subtotal on qualifying purchases attributed to your link, after successful delivery. Delivery fees are excluded. Your live statistics above come from your MarketLink account.</div></div>'+
      '<section class="ml-affiliate-rules"><div class="ml-eyebrow">PROGRAM RULES</div><h4>How your 2% reward works</h4><ul>'+
      '<li><b>Reward rate:</b> Earn 2% of the eligible discounted merchandise subtotal for a qualifying order attributed to your unique affiliate link.</li>'+
      '<li><b>Funded by MarketLink:</b> The reward comes from MarketLink’s standard 5% platform commission; it is not added to the customer’s price. MarketLink retains 3% gross platform commission before payment-processing and operating costs.</li>'+
      '<li><b>When it qualifies:</b> The order must be successfully delivered. Cancelled, failed, undelivered, refunded or fraudulent orders do not qualify; adjustments may be made if an order is later refunded.</li>'+
      '<li><b>What is excluded:</b> Delivery fees and other non-merchandise charges are not included in the commission calculation.</li>'+
      '<li><b>Fair use:</b> Do not use fake accounts, self-referrals, misleading claims, spam or manipulated orders. MarketLink may withhold disputed rewards and suspend abusive accounts following review.</li>'+
      '<li><b>Tracking and payout:</b> Share your own unique link. Clicks and qualifying orders are recorded by MarketLink; only verified commission records count toward rewards. Payout availability and processing status are shown in your account when supported.</li>'+
      '</ul><p>These rules explain the current 2% affiliate model. MarketLink may update the program rules with notice where required.</p></section></div>';
  }
  function renderPremiumPolicyPage(root,key){
    var policies={
      terms:{title:'Terms of Service',sections:[
        ['Your account and PIN','Please use accurate registration details and keep your 4-digit PIN private. If you think someone else has accessed your account, contact MarketLink support so we can help you secure it.'],
        ['Marketplace listings','Vendors should keep product details, prices and availability accurate and offer goods they are allowed to sell. Stock and prices can change, so please review your basket before confirming an order.'],
        ['Orders and payments','Please check the order total and delivery fees before confirming. Use a payment option shown in checkout. If Modem Pay is enabled, follow the payment instructions shown on screen; MarketLink will mark an order as paid only after the provider confirms it. If a payment is pending, check its status before trying again.'],
        ['Delivery responsibilities','Provide a complete address and reachable contact number. Riders must follow applicable road-safety rules and handle orders responsibly. Delivery estimates can vary with availability, traffic and other conditions.'],
        ['Getting help and using MarketLink fairly','Please use MarketLink respectfully and lawfully. If an order goes wrong, contact support with your order number so we can review the details and explain the available next steps. We may limit access when there is a clear safety or misuse concern.'],
        ['Applicable law','These terms are intended to operate in accordance with applicable laws of The Gambia. MarketLink may update in-app terms as the service develops.']
      ]},
      privPolicy:{title:'Privacy Policy',sections:[
        ['Information used by the service','Depending on the features you use, MarketLink may process your name, phone number, account details, saved addresses, orders, wallet and transaction records, support messages and application information. If you choose mobile-money payment, the mobile number you enter and transaction details may be sent to Modem Pay or the selected provider to process and verify that payment.'],
        ['Why we use it','Information supports sign-in, account management, order processing, delivery coordination, service security and help requests. Access to account-specific information requires an authenticated session.'],
        ['Payments and providers','Payment providers, including Modem Pay when enabled, process the information needed to complete and verify payments. Some networks may request a temporary PIN/OTP on the payment screen; this is sent to the provider for that transaction and is not saved in your MarketLink account. Please do not share payment codes in support chats or with vendors and riders. Providers have their own privacy notices and terms.'],
        ['Protecting your account','Keep your PIN private, sign out of shared devices and contact support if you suspect that another person has accessed your account.'],
        ['Questions and requests','For privacy questions or help with account information, email marketlinkgambia@gmail.com or call +220 87 407 1510.']
      ]},
      deliveryPolicy:{title:'Delivery, Returns & Refunds',sections:[
        ['Before confirming an order','Check product details, quantity, delivery charges and your saved address before placing an order. Keep your phone available for delivery coordination.'],
        ['Delivery updates','Order status and rider details are shown when the relevant information is available from the live service. Estimated delivery times are not guarantees and may change with vendor, rider, traffic or network availability.'],
        ['Problems with an order','If an item is missing, damaged or different from what you ordered, keep the order reference and contact MarketLink support promptly so the order can be reviewed.'],
        ['Returns and refunds','If an item is missing, damaged or different from what you ordered, contact support with your order reference and a short explanation. We will review the order and explain the available next steps. Refund eligibility and timing can vary by order and payment provider, so we will confirm the outcome for your case rather than promise a fixed time for every transaction.'],
        ['Contact','Email marketlinkgambia@gmail.com or call +220 87 407 1510 with your order reference and a short description of the issue.']
      ]}
    };
    var policy=policies[key];if(!root||!policy)return;
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="S.profilePage=null;window.ML_Premium.openProfilePage(null)">← Profile</button><h3>'+esc(policy.title)+'</h3></div><div class="ml-policy-content">'+policy.sections.map(function(section){return '<section><h4>'+esc(section[0])+'</h4><p>'+esc(section[1])+'</p></section>';}).join('')+'</div><footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span><div><span>Questions?</span><a href="mailto:marketlinkgambia@gmail.com">Email support</a><a href="tel:+220874071510">Call +220 87 407 1510</a></div></footer></div>';
  }
  function openProfilePage(page){
    if(page==='terms'){S.profilePage=null;openSheet('sh-terms');return;}
    if(page==='privPolicy'){S.profilePage=null;openSheet('sh-privacy');return;}
    if(page==='deliveryPolicy'){S.profilePage=null;openSheet('sh-delivery-policy');return;}
    S.profilePage=page||null;
    if(page==='addresses'){renderAddresses();return;}
    if(typeof switchTab==='function'&&S.curTab!=='profile'){switchTab('profile');return;}
    if(typeof window.renderProfile==='function')window.renderProfile();
  }
  function renderPremiumWalletPage(root){
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Royal Wallet</h3></div><div class="ml-loading">Loading your live wallet…</div></div>';
    return Promise.all([ML_API.customers.getWallet(),ML_API.customers.getWalletTxns({page:1,limit:30})]).then(function(results){
      var wallet=results[0]&&results[0].data||{},txns=normalizeProducts(results[1]&&results[1].data),balance=Number(wallet.balance||0);
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Royal Wallet</h3></div>'+
        '<section class="ml-wallet-hero"><span>Available balance</span><strong>'+money(balance)+'</strong><small>Live balance from your MarketLink account</small></section>'+
        '<div class="ml-wallet-note">Wallet funding, transfers and bill payments are shown only when the corresponding production service is available. No sample transactions are added.</div>'+
        '<div class="ml-section-head"><h3>Transaction history</h3><button type="button" onclick="window.ML_Premium.refreshWallet()">Refresh</button></div>'+
        (txns.length?'<div class="ml-profile-card">'+txns.map(function(t){
          var credit=String(t.type||'').toLowerCase()==='credit',amount=Math.abs(Number(t.amount||0)),desc=t.description||t.category||t.type||'Wallet transaction';
          var date=t.created_at?new Date(t.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';
          return '<div class="ml-wallet-transaction"><span class="ml-wallet-tx-icon '+(credit?'credit':'debit')+'">'+(credit?'↓':'↑')+'</span><div class="copy"><b>'+esc(desc)+'</b><span>'+esc(date)+' · '+esc(t.status||'recorded')+'</span></div><strong class="'+(credit?'credit':'debit')+'">'+(credit?'+':'−')+money(amount)+'</strong></div>';
        }).join('')+'</div>':'<div class="ml-empty"><div style="font-size:28px">💳</div><b>No wallet transactions yet</b><span>Transactions will appear here when the live wallet service records them.</span></div>')+
        '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
    }).catch(function(e){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Royal Wallet</h3></div><div class="ml-empty"><b>Wallet data unavailable</b><span>'+esc(e.error||'The live wallet service could not be reached.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.refreshWallet()">Retry</button></div></div>';
    });
  }
  async function renderPremiumPaymentsPage(root){
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Payment Methods</h3></div><div class="ml-loading">Checking available payment options…</div></div>';
    var caps={configured:false,mode:'merchant',directMobileMoney:false,hostedCheckout:false};
    try{
      var response=await ML_API.payments.methods();
      var data=response&&response.data?response.data:response;
      caps={configured:Boolean(data&&data.configured),mode:String(data&&data.mode||'merchant'),directMobileMoney:Boolean(data&&data.directMobileMoney),hostedCheckout:Boolean(data&&data.hostedCheckout),setupReason:String(data&&data.setupReason||'')};
      S.paymentCapabilities=caps;
    }catch(e){}
    var providerStatus=!caps.configured?(caps.setupReason||'Mobile-money payments are still being set up. They will become selectable in checkout after Modem Pay configuration and any required H2H partner approval.'):caps.directMobileMoney?'Direct mobile-money checkout is configured. Select Wave, AfriMoney or QMoney in your cart, enter the local number, and follow the provider instructions shown on the next screen.':'Modem Pay hosted checkout is configured. Continue to the secure Modem Pay payment page and choose from the methods activated for your merchant account.';
    var methodCards=caps.directMobileMoney
      ? '<div class="ml-profile-row"><div class="ico">📱</div><div class="copy"><b>Wave</b><span>Enter your local Wave number in checkout and follow the next step from Modem Pay.</span></div></div><div class="ml-profile-row"><div class="ico">📲</div><div class="copy"><b>AfriMoney</b><span>Enter your local number, approve the phone prompt, then confirm you have approved it in MarketLink.</span></div></div><div class="ml-profile-row"><div class="ico">💳</div><div class="copy"><b>QMoney</b><span>Enter your local number and provide the temporary code only if Modem Pay requests it for this payment.</span></div></div>'
      : '<div class="ml-profile-row"><div class="ico">🔐</div><div class="copy"><b>Modem Pay secure checkout</b><span>'+(caps.configured?'Choose one of the payment options activated for the MarketLink merchant account on Modem Pay’s payment page.':'Available after provider setup is complete.')+'</span></div></div>';
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Payment Methods</h3></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">💵</div><div class="copy"><b>Pay on Delivery</b><span>Pay when your order arrives, where this option is available for the order and delivery area.</span></div></div>'+methodCards+'</div>'+
      '<div class="ml-wallet-note ml-payment-availability-note">'+paymentBrandMarkup()+'<b>'+ (caps.configured?'Modem Pay status: configured':'Modem Pay status: setup pending')+'</b><p>'+esc(providerStatus)+'</p></div>'+
      '<div class="ml-wallet-note">MarketLink confirms payment only after the provider reports a verified completed transaction. If the status is pending, check it before trying to pay again. Never share your MarketLink PIN with a vendor, rider or support agent.</div>'+
      '<button type="button" class="ml-btn ml-btn-primary" style="width:100%;margin-top:14px" onclick="switchTab(\'cart\')">Go to cart and checkout →</button>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
  }
  async function renderPremiumNotificationsPage(root){
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Notifications</h3></div><button type="button" class="ml-btn ml-btn-secondary ml-push-setup-button" onclick="window.ML_Push.enable()">🔔 Enable push on this device</button><div class="ml-loading">Loading account notifications…</div></div>';
    try{
      var response=await ML_API.customers.getNotifications({page:1,limit:50,unreadOnly:false}),items=normalizeProducts(response&&response.data);
      var unread=items.filter(function(n){return !n.read_at;}).length;
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Notifications</h3></div>'+
        (unread?'<button type="button" class="ml-btn ml-btn-secondary" style="margin:0 0 12px" onclick="window.ML_Premium.markAllNotificationsRead()">Mark all read ('+unread+')</button>':'')+
        (items.length?'<div class="ml-profile-card">'+items.map(function(n){
          var isRead=!!n.read_at,title=n.title||n.type||'MarketLink notification',message=n.message||n.body||'Update from MarketLink';
          var when=n.created_at?new Date(n.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Recent';
          return '<div class="ml-notification-row '+(isRead?'read':'unread')+'"><span class="ml-notification-icon">'+(isRead?'✓':'●')+'</span><div class="copy"><b>'+esc(title)+'</b><span>'+esc(message)+'</span><small>'+esc(when)+'</small></div>'+(isRead?'<span class="ml-read-label">Read</span>':'<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.markNotificationRead(\''+esc(String(n.id||''))+'\')">Mark read</button>')+'</div>';
        }).join('')+'</div>':'<div class="ml-empty"><div style="font-size:28px">🔔</div><b>You are all caught up</b><span>New account and order notifications will appear here.</span></div>')+
        '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
    }catch(e){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Notifications</h3></div><div class="ml-empty"><b>Notifications unavailable</b><span>'+esc(e.error||'The notification service could not be reached.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openProfilePage(\'notifSet\')">Retry</button></div></div>';
    }
  }
  async function markPremiumNotificationRead(id){
    try{await ML_API.customers.markNotifRead([id]);toast('Notification marked as read.','success');await renderPremiumNotificationsPage(G('profile-body'));}
    catch(e){toast(e.error||'Could not update the notification.','error');}
  }
  async function markAllPremiumNotificationsRead(){
    try{await ML_API.customers.markNotifRead([]);toast('Notifications marked as read.','success');await renderPremiumNotificationsPage(G('profile-body'));}
    catch(e){toast(e.error||'Could not update notifications.','error');}
  }
  function renderPremiumPrivacySettings(root){
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Privacy & Security</h3></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">🔑</div><div class="copy"><b>Reset your PIN</b><span>Request a verification code and set a new 4-digit PIN.</span></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.openResetPin()">Reset PIN</button></div>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openProfilePage(\'privPolicy\')"><div class="ico">🛡️</div><div class="copy"><b>Privacy Policy</b><span>Review information used by MarketLink.</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openProfilePage(\'terms\')"><div class="ico">📄</div><div class="copy"><b>Terms of Service</b><span>Review account and marketplace responsibilities.</span></div><b class="ml-profile-arrow">›</b></button></div>'+
      '<div class="ml-wallet-note">Keep your PIN private and avoid signing in on devices you do not trust. Contact support if you suspect unauthorized access.</div>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
  }
  async function renderPremiumWishlistPage(root){
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Wishlist</h3></div><div class="ml-loading">Loading saved products…</div></div>';
    try{
      var response=await ML_API.customers.getWishlist({page:1,limit:50}),items=normalizeProducts(response&&response.data);
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Wishlist</h3></div>'+
        (items.length?'<div class="ml-wishlist-list">'+items.map(function(item){
          var productId=String(item.product_id||item.id||''),image=item.image||item.primary_image||'',price=Number(item.price||0);
          return '<article class="ml-wishlist-row"><button type="button" class="ml-wishlist-image" onclick="window.openProductDetail(\''+esc(productId)+'\')" aria-label="Open '+esc(item.name||'saved product')+'">'+(image?'<img src="'+esc(image)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'🛍️')+'</button><div class="copy"><b>'+esc(item.name||'Saved product')+'</b><span>'+esc(item.vendor_name||'MarketLink vendor')+'</span><strong>'+money(price)+'</strong></div><div class="ml-wishlist-actions"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.openProductDetail(\''+esc(productId)+'\')">View</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.removeWishlist(\''+esc(productId)+'\')">Remove</button></div></article>';
        }).join('')+'</div>':'<div class="ml-empty"><div style="font-size:28px">🤍</div><b>Your wishlist is empty</b><span>Save products while browsing the marketplace and they will appear here.</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="switchTab(\'home\')">Browse products</button></div>')+
        '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
    }catch(e){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Wishlist</h3></div><div class="ml-empty"><b>Saved products unavailable</b><span>'+esc(e.error||'The wishlist service could not be reached.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openProfilePage(\'wishlist\')">Retry</button></div></div>';
    }
  }
  async function removePremiumWishlistItem(productId){
    try{await ML_API.customers.removeWishlist(productId);toast('Product removed from wishlist.');await renderPremiumWishlistPage(G('profile-body'));}
    catch(e){toast(e.error||'Could not remove the saved product.','error');}
  }
  function removePremiumCompareItem(id){
    var item=(S.compareList||[]).find(function(x){return String(x.id)===String(id);});
    if(!item){toast('Comparison item not found.','error');return;}
    toggleCompare(item.id,item.name,item.price,item.emoji,item.cat);
    renderPremiumComparePage(G('profile-body'));
  }
  function renderPremiumComparePage(root){
    var items=Array.isArray(S.compareList)?S.compareList:[];
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Compare Products</h3></div>'+
      (items.length?'<div class="ml-compare-grid">'+items.map(function(item){
        return '<article class="ml-compare-card"><div class="ml-compare-icon">⚖️</div><b>'+esc(item.name||'Product')+'</b><strong>'+money(item.price||0)+'</strong><span>'+esc(item.cat||'Marketplace product')+'</span><div><button type="button" class="ml-btn ml-btn-primary" onclick="window.openProductDetail(\''+esc(String(item.id))+'\')">View product</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.removeCompareItem(\''+esc(String(item.id))+'\')">Remove</button></div></article>';
      }).join('')+'</div>':'<div class="ml-empty"><div style="font-size:28px">⚖️</div><b>No products to compare</b><span>Use Compare on product cards while browsing to build your comparison list.</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="switchTab(\'home\')">Browse products</button></div>')+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
  }
  function openMarketLinkAI(){
    if(typeof window.openAI==='function')window.openAI();
    else toast('MarketLink AI is not ready yet. Please refresh and try again.','error');
  }
  function openMarketLinkAIFromButton(button){
    var question=button&&button.getAttribute('data-question')||'';
    openMarketLinkAIWithQuestion(question);
  }
  function openMarketLinkAIWithQuestion(question){
    openMarketLinkAI();
    var input=G('ai-inp');
    if(input){input.value=String(question||'');if(typeof window.sendAI==='function')window.sendAI();}
  }
  function renderPremiumAIProfilePage(root){
    var roles=(S.roles||[]).map(function(r){return String(r).toLowerCase();});
    var role=roles.indexOf('vendor')>-1?'vendor':roles.indexOf('rider')>-1?'rider':'customer';
    var prompts={
      customer:[
        ['📦','Track an order','How do I track my order?'],
        ['💳','Payment help','What should I do if my payment is pending?'],
        ['🛍️','Find products','How do I find products and place an order?'],
        ['👤','My profile','How can I update my profile and photo?']
      ],
      vendor:[
        ['🧾','Manage orders','How do I accept and update a vendor order?'],
        ['🛒','Manage products','How do I add or update my products?'],
        ['💰','Payouts','How do vendor wallet payouts work?'],
        ['📣','Promote my shop','How can I grow my shop on MarketLink?']
      ],
      rider:[
        ['🛵','Delivery steps','How do I update an assigned delivery?'],
        ['📍','Order updates','How does order tracking work for a rider?'],
        ['💰','My earnings','How do rider earnings and withdrawals work?'],
        ['🪪','My application','How do I check my rider application status?']
      ]
    };
    var list=prompts[role]||prompts.customer;
    root.innerHTML='<div class="ml-profile-shell ml-marketlink-ai-page">'+
      '<div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>MarketLink AI</h3></div>'+
      '<section class="ml-ai-profile-hero"><div class="ml-ai-profile-mark">✨</div><div><div class="ml-eyebrow">MARKETLINK KNOWLEDGE ASSISTANT</div><h3>Help with your next step.</h3><p>Ask about shopping, orders, payments, profiles or how to use MarketLink. Answers come from the MarketLink help knowledge base, not an external AI provider.</p><span class="ml-ai-role-tag">Personalized for '+esc(role==='rider'?'Riders':role==='vendor'?'Vendors':'Customers')+'</span></div><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.openMarketLinkAI()">Open MarketLink AI chat →</button></section>'+
      '<div class="ml-section-head"><h3>Suggested questions</h3><span>Choose a topic to start</span></div>'+
      '<div class="ml-ai-prompt-grid">'+list.map(function(item){return '<button type="button" class="ml-ai-prompt-card" data-question="'+esc(item[2])+'" onclick="window.ML_Premium.askMarketLinkAIFromButton(this)"><span>'+item[0]+'</span><b>'+esc(item[1])+'</b><small>'+esc(item[2])+'</small><i>Ask MarketLink AI →</i></button>';}).join('')+'</div>'+
      '<div class="ml-wallet-note">MarketLink AI can guide you through supported app features. It cannot approve an application, change an order, confirm a payment or guarantee a payout on its own. For account-specific help, open the relevant page or contact support.</div>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
  }
  function renderMarketLinkLanguagePage(root){
    var i18n=window.MarketLinkI18n;
    var languages=i18n&&typeof i18n.getLanguages==='function'?i18n.getLanguages():[{code:'en',label:'English'}];
    var selected=i18n&&typeof i18n.getLanguage==='function'?i18n.getLanguage():'en';
    var options=languages.map(function(item){return '<option value="'+esc(item.code)+'" '+(item.code===selected?'selected':'')+'>'+esc(item.label)+'</option>';}).join('');
    var coverage=i18n&&typeof i18n.getCoverageLabel==='function'?i18n.getCoverageLabel(selected):'English is the default language.';
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Language preference</h3></div>'+
      '<div class="ml-language-card"><div class="ml-language-globe">🌐</div><h3>Use MarketLink in your preferred language</h3><p>Choose a language for supported app labels, buttons and help content. Your name, product names and messages you type are kept as written.</p>'+
      '<label for="ml-language-profile">App language</label><select id="ml-language-profile" onchange="window.MarketLinkI18n&&window.MarketLinkI18n.setLanguage(this.value)">'+options+'</select>'+
      '<div class="ml-language-status" id="ml-language-coverage">'+esc(coverage)+'</div>'+
      '<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.applyLanguagePreference()">Apply language preference</button></div>'+
      '<div class="ml-wallet-note">Translation is being expanded in phases. If a sentence has not yet been reviewed in your selected language, MarketLink keeps that sentence in English rather than showing an unverified translation. Gambian-language wording will need native-speaker review before we call it complete.</div></div>';
  }
  function renderPremiumHelpPage(root){
    var faqs=[
      {q:'What is MarketLink?',a:'MarketLink Gambia connects customers with local vendors and delivery riders. You can shop, manage orders, sell products or apply to deliver.'},
      {q:'How do I place an order?',a:'Choose a category or search for a product, review the vendor and price, add the item to your cart, confirm your delivery address and select a payment option shown at checkout.'},
      {q:'How do I track my order?',a:'Open Orders, choose the order and select View details. MarketLink refreshes the order status while the tracking page is open. Rider location is shown only when the delivery service provides live location data.'},
      {q:'What if my payment is pending?',a:'A pending payment is not the same as a confirmed payment. Check the status in your order details before trying to pay again, so you do not risk paying twice.'},
      {q:'How do I change my profile or photo?',a:'Open Profile and choose Edit profile to update your name, display name, date of birth, gender and short introduction. Choose Change photo or Remove beside your profile picture. Profile photos must be JPG or PNG, at least 512 × 512 pixels and no larger than 5 MB.'},
      {q:'How do I become a vendor?',a:'Open Profile and choose Become a vendor. Complete the application with accurate business details. Vendor access starts after the required review and approval.'},
      {q:'How do I become a rider?',a:'Open Profile and choose Become a rider. Complete the application with accurate contact and delivery details. Rider access is subject to review and approval.'},
      {q:'How does the affiliate reward work?',a:'Share your unique affiliate link. Eligible referrals can earn a 2% reward on the qualifying merchandise subtotal after the order is successfully delivered. Delivery fees and other non-merchandise charges are excluded.'},
      {q:'How can I contact MarketLink?',a:'For a direct call, use +220 87 407 1510. To contact the team on WhatsApp, use +220 407 1510. Include your order number when asking about an order. Never share your PIN or payment password.'}
    ];
    var faqHtml=faqs.map(function(faq){
      return '<details class="ml-help-faq"><summary>'+esc(faq.q)+'</summary><p>'+esc(faq.a)+'</p></details>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Help Centre</h3></div>'+
      '<div class="ml-help-welcome"><div class="ml-help-welcome-eyebrow">WE’RE HERE TO HELP</div><h3>Let’s get things sorted.</h3><p>Find quick answers below, or contact the MarketLink team. For order questions, have your order number ready.</p><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.openMarketLinkAI()">Ask MarketLink AI ✨</button></div>'+
      '<div class="ml-profile-card ml-help-contact-card"><div class="ml-profile-row"><div class="ico">📞</div><div class="copy"><b>Call MarketLink support</b><span>+220 87 407 1510 · Direct phone call</span></div><a class="ml-btn ml-btn-secondary" href="tel:+220874071510">Call</a></div>'+
      '<div class="ml-profile-row"><div class="ico ml-help-whatsapp-ico"><img src="./assets/whatsapp.svg" alt="WhatsApp"></div><div class="copy"><b>WhatsApp support</b><span>+220 407 1510 · Message the support team</span></div><a class="ml-btn ml-btn-secondary ml-whatsapp-button" href="https://wa.me/2204071510?text=Hello%20MarketLink%20support" target="_blank" rel="noopener noreferrer"><img src="./assets/whatsapp.svg" alt=""> Message</a></div>'+
      '<div class="ml-profile-row"><div class="ico">✉️</div><div class="copy"><b>Email support</b><span>marketlinkgambia@gmail.com</span></div><a class="ml-btn ml-btn-secondary" href="mailto:marketlinkgambia@gmail.com">Email</a></div></div>'+
      '<div class="ml-wallet-note">For an order problem, include your order number and a short description. Never send your MarketLink PIN, wallet PIN, OTP or payment password to support.</div>'+
      '<div class="ml-section-head ml-help-faq-heading"><h3>Frequently asked questions</h3><span>Quick answers</span></div>'+
      '<div class="ml-help-faq-list">'+faqHtml+'</div>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span></footer></div>';
  }
  function defaultAvatarMarkup(){
    return '<svg class="ml-default-avatar" viewBox="0 0 160 160" role="img" aria-label="MarketLink default 3D avatar" xmlns="http://www.w3.org/2000/svg">'+
      '<defs><linearGradient id="mlAvatarBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F8F8A"/><stop offset=".52" stop-color="#276B75"/><stop offset="1" stop-color="#F5B83D"/></linearGradient>'+
      '<radialGradient id="mlAvatarGlow" cx=".28" cy=".18" r=".9"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".45"/><stop offset="1" stop-color="#071521" stop-opacity=".12"/></radialGradient>'+
      '<linearGradient id="mlAvatarSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DDA47C"/><stop offset=".5" stop-color="#B97650"/><stop offset="1" stop-color="#8E4D34"/></linearGradient>'+
      '<linearGradient id="mlAvatarShirt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#142F4A"/><stop offset=".55" stop-color="#0D7377"/><stop offset="1" stop-color="#073D4D"/></linearGradient>'+
      '<linearGradient id="mlAvatarHair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#293342"/><stop offset="1" stop-color="#0A1220"/></linearGradient></defs>'+
      '<rect width="160" height="160" rx="30" fill="url(#mlAvatarBg)"/><rect width="160" height="160" rx="30" fill="url(#mlAvatarGlow)"/>'+
      '<circle cx="128" cy="34" r="21" fill="#FFD778" fill-opacity=".23"/><circle cx="26" cy="122" r="31" fill="#082B3E" fill-opacity=".13"/>'+
      '<path d="M18 160c3-28 21-44 43-49 13-3 24-3 38 0 22 5 39 21 43 49Z" fill="url(#mlAvatarShirt)"/>'+
      '<path d="M62 103h36l8 17-27 23-26-23Z" fill="url(#mlAvatarSkin)"/>'+
      '<path d="M46 58c0-26 16-40 35-40 22 0 37 16 37 41v22c0 25-17 41-37 41-21 0-37-17-37-41Z" fill="url(#mlAvatarSkin)"/>'+
      '<ellipse cx="44" cy="76" rx="7" ry="12" fill="#A96143"/><ellipse cx="119" cy="76" rx="7" ry="12" fill="#965037"/>'+
      '<path d="M43 61c-3-25 11-43 36-45 23-2 39 12 43 35-9-6-14-15-18-22-6 12-22 19-39 21-7 1-14 5-22 11Z" fill="url(#mlAvatarHair)"/>'+
      '<path d="M54 69c4-4 11-5 17-2" fill="none" stroke="#613522" stroke-width="3" stroke-linecap="round"/><path d="M90 67c6-3 12-2 17 2" fill="none" stroke="#613522" stroke-width="3" stroke-linecap="round"/>'+
      '<ellipse cx="65" cy="77" rx="3.2" ry="4" fill="#172B36"/><ellipse cx="98" cy="77" rx="3.2" ry="4" fill="#172B36"/><circle cx="66" cy="75.5" r="1" fill="#FFFFFF"/><circle cx="99" cy="75.5" r="1" fill="#FFFFFF"/>'+
      '<path d="M81 77l-4 13c2 3 5 4 8 2" fill="none" stroke="#8D4D35" stroke-width="2.4" stroke-linecap="round"/>'+
      '<path d="M67 100c8 8 20 8 28 0" fill="none" stroke="#713B2D" stroke-width="3.4" stroke-linecap="round"/>'+
      '<path d="M61 103c11 6 23 6 34 0" fill="none" stroke="#F4D0B6" stroke-width="2" stroke-linecap="round"/>'+
      '<path d="M34 150c6-18 19-27 32-31l14 13 15-13c15 5 26 15 31 31" fill="url(#mlAvatarShirt)"/>'+
      '<path d="M67 119l13 13 14-13" fill="none" stroke="#F5B83D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<path d="M29 29c10-10 20-15 32-18" stroke="#FFFFFF" stroke-opacity=".32" stroke-width="3" fill="none" stroke-linecap="round"/>'+
      '</svg>';
  }
  function togglePremiumAppearance(){
    S.dark=!S.dark;
    var daylight=!S.dark;
    document.body.classList.toggle('lm',daylight);
    var appRoot=G('app');if(appRoot)appRoot.classList.toggle('lm',daylight);
    try{localStorage.setItem('ml_theme',daylight?'light':'dark');}catch(e){}
    renderPremiumProfile();
  }
  async function renderPremiumProfile(){
    var root=G('profile-body');if(!root)return;
    if(S.profilePage==='terms'||S.profilePage==='privPolicy'||S.profilePage==='deliveryPolicy'){openProfilePage(S.profilePage);return;}
    if(S.profilePage==='wallet'){await renderPremiumWalletPage(root);return;}
    if(S.profilePage==='payments'){renderPremiumPaymentsPage(root);return;}
    if(S.profilePage==='notifSet'){await renderPremiumNotificationsPage(root);return;}
    if(S.profilePage==='privacy'){renderPremiumPrivacySettings(root);return;}
    if(S.profilePage==='wishlist'){await renderPremiumWishlistPage(root);return;}
    if(S.profilePage==='compare'){renderPremiumComparePage(root);return;}
    if(S.profilePage==='help'){renderPremiumHelpPage(root);return;}
    if(S.profilePage==='assistant'){renderPremiumAIProfilePage(root);return;}
    if(S.profilePage==='language'){renderMarketLinkLanguagePage(root);return;}
    if(S.profilePage==='addresses'){await renderAddresses();return;}
    await loadProfile();
    root=G('profile-body');if(!root)return;
    if(S.profilePage==='affiliate'){var affiliateData=await syncAffiliateProfile();renderPremiumAffiliatePage(root,affiliateData);return;}
    var p=liveProfile||{},fullName=p.full_name||S.user&&S.user.name||'MarketLink user',name=p.display_name||fullName,phone=p.phone||S.user&&S.user.phone||'';
    var applicationHtml='',vendorApplication=null,riderApplication=null;
    if(S.user&&S.user.id){
      var apps=await Promise.all([
        ML_API.vendors.getById(S.user.id).catch(function(){return null;}),
        ML_API.riders.getById(S.user.id).catch(function(){return null;})
      ]);
      vendorApplication=apps[0]&&apps[0].kyc_status?apps[0]:null;
      riderApplication=apps[1]&&apps[1].kyc_status?apps[1]:null;
      var appNames=[['Vendor application',vendorApplication],['Rider application',riderApplication]];
      appNames.forEach(function(a){
        if(a[1]&&a[1].kyc_status){
          var st=String(a[1].kyc_status).toLowerCase(),label=st==='approved'?'Approved':st==='rejected'?'Rejected':st==='suspended'?'Suspended':'Pending review';
          var icon=st==='approved'?'✓':st==='rejected'||st==='suspended'?'!':'⏳';
          var cls=st==='approved'?'color:#42D2C9':st==='rejected'||st==='suspended'?'color:#FF8A7A':'color:#FFD778';
          applicationHtml+='<div class="ml-profile-row"><div class="ico">'+icon+'</div><div class="copy"><b>'+a[0]+'</b><span>'+label+' · operational access is controlled by admin approval</span></div><b style="'+cls+'">'+label+'</b></div>';
        }
      });
    }
    var photo=p.profile_photo_url||S.profilePhoto;
    var avatar=defaultAvatarMarkup()+(photo?'<img class="ml-avatar-photo" src="'+esc(photo)+'" alt="Profile photo" loading="lazy" decoding="async" onerror="this.onerror=null;this.remove();">':'');
    var roles=(S.roles||[]).map(function(r){return '<span class="ml-role-pill">'+esc(r)+'</span>';}).join('');
    var upgradeHtml='',userRoles=(S.roles||[]).map(function(r){return String(r).toLowerCase();});
    if(userRoles.indexOf('vendor')>-1)upgradeHtml+='<button type="button" onclick="window.ML_Premium.openRoleDashboard(\'vendor\')"><span class="ml-upgrade-icon">🏪</span><span><b>Open Vendor Dashboard</b><span>Manage products, orders and store activity</span></span><span class="arrow">›</span></button>';
    else if(vendorApplication)upgradeHtml+='<button type="button" class="ml-role-application-state" onclick="window.ML_Premium.openProfilePage(\'help\')"><span class="ml-upgrade-icon">🏪</span><span><b>Vendor application: '+esc(String(vendorApplication.kyc_status))+'</b><span>Check status or contact support. You do not need to submit another application.</span></span><span class="arrow">›</span></button>';
    else upgradeHtml+='<button type="button" onclick="openVendorApp()"><span class="ml-upgrade-icon">🏪</span><span><b>Become a vendor</b><span>List products and grow your shop</span></span><span class="arrow">›</span></button>';
    if(userRoles.indexOf('rider')>-1)upgradeHtml+='<button type="button" onclick="window.ML_Premium.openRoleDashboard(\'rider\')"><span class="ml-upgrade-icon">🛵</span><span><b>Open Rider Dashboard</b><span>View assigned deliveries and earnings</span></span><span class="arrow">›</span></button>';
    else if(riderApplication)upgradeHtml+='<button type="button" class="ml-role-application-state" onclick="window.ML_Premium.openProfilePage(\'help\')"><span class="ml-upgrade-icon">🛵</span><span><b>Rider application: '+esc(String(riderApplication.kyc_status))+'</b><span>Check status or contact support. You do not need to submit another application.</span></span><span class="arrow">›</span></button>';
    else upgradeHtml+='<button type="button" onclick="openRiderApp()"><span class="ml-upgrade-icon">🛵</span><span><b>Become a rider</b><span>Apply to deliver local orders</span></span><span class="arrow">›</span></button>';
    var profileItems=[
      {icon:'❤️',title:'Wishlist',desc:'Products you have saved',page:'wishlist'},
      {icon:'🔗',title:'Affiliate Program',desc:'Your link, referrals and eligible 2% rewards',page:'affiliate'},
      {icon:'⚖️',title:'Compare Products',desc:'Review products you selected to compare',page:'compare'},
      {icon:'💳',title:'Payment Methods',desc:'View supported checkout payment methods',page:'payments'},
      {icon:'🌐',title:'Language preference',desc:'Choose your preferred MarketLink language',page:'language'},
      {icon:'🔔',title:'Notifications',desc:'View account updates and mark them as read',page:'notifSet'},
      {icon:'🔒',title:'Privacy Settings',desc:'Account and privacy controls',page:'privacy'},
      {icon:'📄',title:'Terms of Service',desc:'Read the rules for using MarketLink',page:'terms'},
      {icon:'🛡️',title:'Privacy Policy',desc:'How account and order information is used',page:'privPolicy'},
      {icon:'🛵',title:'Delivery, Returns & Refunds',desc:'Guidance for delivery and order issues',page:'deliveryPolicy'},
      {icon:'✨',title:'MarketLink AI',desc:'Help with shopping, selling, delivery and payments',page:'assistant'},
      {icon:'❓',title:'Help Centre',desc:'Contact MarketLink support',page:'help'}
    ];
    var profileLinks=profileItems.map(function(item){
      return '<button type="button" class="ml-profile-link" onclick="window.ML_Premium.openProfilePage(\''+item.page+'\')"><span class="ico">'+item.icon+'</span><span class="copy"><b>'+esc(item.title)+'</b><span>'+esc(item.desc)+'</span></span><span class="arrow" aria-hidden="true">›</span></button>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell">'+
      '<div class="ml-profile-hero"><div class="ml-profile-avatar-wrap"><button type="button" class="ml-avatar ml-avatar-button" onclick="window.ML_Premium.pickPhoto()" aria-label="Change profile photo">'+avatar+'<span class="ml-avatar-camera" aria-hidden="true">📷</span></button><div class="ml-avatar-actions"><button type="button" class="ml-photo-action" onclick="window.ML_Premium.pickPhoto()">Change photo</button>'+(photo?'<button type="button" class="ml-photo-action ml-photo-remove" onclick="window.ML_Premium.removeProfilePhoto()">Remove</button>':'')+'</div><div class="ml-photo-guidance">JPG or PNG · at least 512 × 512 px · maximum 5 MB</div><input type="file" id="ml-profile-photo-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png" style="display:none" onchange="window.ML_Premium.handleProfilePhoto(this)"></div><div class="ml-profile-identity"><div class="ml-eyebrow">Your MarketLink account</div><div class="ml-profile-name">'+esc(name)+'</div><div class="ml-profile-phone">'+gambiaFlagMarkup()+' '+esc(phone)+'</div><div class="ml-role-pills">'+roles+'<span class="ml-role-pill ml-role-active">Account active</span></div></div><button type="button" class="ml-edit" onclick="window.ML_Premium.editProfile()">Edit profile</button></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">👤</div><div class="copy"><b>Full name</b><span>'+esc(fullName)+'</span></div></div><div class="ml-profile-row"><div class="ico">✨</div><div class="copy"><b>Display name</b><span>'+esc(name)+'</span></div></div><div class="ml-profile-row"><div class="ico">🎂</div><div class="copy"><b>Date of birth</b><span>'+esc(p.date_of_birth?String(p.date_of_birth).slice(0,10):'Not added yet')+'</span></div></div><div class="ml-profile-row"><div class="ico">🧾</div><div class="copy"><b>Gender</b><span>'+esc(p.gender?({'male':'Male','female':'Female','other':'Other','prefer_not_to_say':'Prefer not to say'}[p.gender]||String(p.gender)):'Not added yet')+'</span></div></div>'+(p.bio?'<div class="ml-profile-row ml-profile-about-row"><div class="ico">💬</div><div class="copy"><b>About you</b><span>'+esc(p.bio)+'</span></div></div>':'')+
      '<button type="button" class="ml-profile-row ml-profile-row-button ml-appearance-row" onclick="window.ML_Premium.toggleAppearance()"><div class="ico">'+(S.dark?'🌙':'☀️')+'</div><div class="copy"><b>Appearance · '+(S.dark?'Night mode':'Daylight mode')+'</b><span>'+(S.dark?'Night mode is active. Tap here to switch to Daylight.':'Daylight mode is active. Tap here to switch to Night.')+'</span></div><b class="ml-profile-arrow">›</b></button>'+applicationHtml+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openProfilePage(\'wallet\')"><div class="ico">💰</div><div class="copy"><b>Royal Wallet</b><span>Available balance · '+money(p.wallet_balance||S.walletBalance||0)+'</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openOrders()"><div class="ico">📦</div><div class="copy"><b>Order history</b><span>'+Number(p.total_orders||0)+' completed orders · '+money(p.total_spent||0)+' spent</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.renderAddresses()"><div class="ico">📍</div><div class="copy"><b>Saved addresses</b><span>Manage delivery locations</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="doLogout()"><div class="ico">↪</div><div class="copy"><b>Sign out</b><span>End this session securely</span></div><b class="ml-profile-arrow">›</b></button></div>'+
      (upgradeHtml?'<div class="ml-profile-upgrade">'+upgradeHtml+'</div>':'')+
      '<div class="ml-section-head"><h3>Account & support</h3></div><div class="ml-profile-links">'+profileLinks+'</div>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span><div><button type="button" onclick="window.ML_Premium.openProfilePage(\'terms\')">Terms of Service</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'privPolicy\')">Privacy Policy</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'deliveryPolicy\')">Delivery & Returns</button></div></footer></div>';
  }
  var liveAddresses=[];
  async function renderAddresses(){
    var root=G('profile-body');if(!root)return;
    try{var r=await ML_API.customers.getAddresses();liveAddresses=Array.isArray(r.data)?r.data:[];}catch(e){toast(e.error||'Could not load saved addresses.','error');return;}
    var cards=liveAddresses.map(function(a){
      var id=String(a.id);
      return '<div class="ml-profile-card" style="padding:15px;margin-top:10px"><div style="display:flex;align-items:flex-start;gap:10px"><div class="ico" style="width:38px;height:38px">📍</div><div style="flex:1"><b style="color:#EAF2F5;font-size:12px">'+esc(a.label||'Address')+'</b><div style="color:#91A4B4;font-size:11px;line-height:1.5;margin-top:4px">'+esc(a.full_address||'')+'</div>'+(a.area?'<div style="color:#718897;font-size:10px;margin-top:3px">'+esc(a.area)+'</div>':'')+'</div>'+(a.is_default?'<span style="font-size:9px;padding:4px 7px;border-radius:99px;background:rgba(13,115,119,.15);color:#42D2C9">Default</span>':'')+'</div><div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap"><button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.editAddress(\''+esc(id)+'\')">Edit</button>'+(!a.is_default?'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.setDefaultAddress(\''+esc(id)+'\')">Set default</button>':'')+'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.deleteAddress(\''+esc(id)+'\')">Delete</button></div></div>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Saved addresses</h3><button onclick="S.profilePage=null;window.ML_Premium.openProfilePage(null)">← Profile</button></div><div class="ml-empty" style="text-align:left;margin-bottom:12px"><b>Delivery locations</b><span>These addresses are stored securely in your MarketLink account and are used for checkout.</span></div><div class="ml-profile-card" style="padding:15px"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin-bottom:6px">Label</label><input id="ml-addr-label" placeholder="Home, Work, Shop" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin:12px 0 6px">Full address</label><input id="ml-addr-full" placeholder="Street, area, city" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><label style="display:block;color:#9DB0BC;font-size:10px;font-weight:700;margin:12px 0 6px">Area (optional)</label><input id="ml-addr-area" placeholder="e.g. Serrekunda" style="width:100%;box-sizing:border-box;background:#0B1A27;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:12px;color:#fff"><button class="ml-btn ml-btn-primary" style="width:100%;margin-top:14px" onclick="window.ML_Premium.addAddress()">Save address</button></div>'+cards+'</div>';
  }
  async function addAddress(){
    var label=G('ml-addr-label')&&G('ml-addr-label').value.trim(),full=G('ml-addr-full')&&G('ml-addr-full').value.trim(),area=G('ml-addr-area')&&G('ml-addr-area').value.trim();
    if(!label||!full){toast('Enter a label and full address.','error');return;}
    try{await ML_API.customers.addAddress({label:label,fullAddress:full,area:area||undefined,isDefault:liveAddresses.length===0});toast('Address saved ✓');await renderAddresses();}catch(e){toast(e.error||'Could not save address.','error');}
  }
  async function editAddress(id){
    var a=liveAddresses.find(function(x){return String(x.id)===String(id);});
    if(!a){toast('Address not found.','error');return;}
    var label=window.prompt('Address label:',a.label||'Home');if(label===null)return;
    var full=window.prompt('Full address:',a.full_address||'');if(full===null)return;
    var area=window.prompt('Area (optional):',a.area||'');if(area===null)return;
    label=label.trim();full=full.trim();area=area.trim();
    if(!label||!full){toast('Label and full address are required.','error');return;}
    try{await ML_API.customers.updateAddress(id,{label:label,fullAddress:full,area:area||null});toast('Address updated ✓');await renderAddresses();}catch(e){toast(e.error||'Could not update address.','error');}
  }
  async function setDefaultAddress(id){
    try{await ML_API.customers.updateAddress(id,{isDefault:true});toast('Default address updated ✓');await renderAddresses();}catch(e){toast(e.error||'Could not update address.','error');}
  }
  async function deleteAddress(id){
    try{await ML_API.customers.deleteAddress(id);toast('Address deleted');await renderAddresses();}catch(e){toast(e.error||'Could not delete address.','error');}
  }
  async function submitVendor(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.vForm||{};
    if(!f.bname||!f.sname||!f.saddr||!f.cat||!f.phone){
      toast('Complete the business name, shop name, address, category and WhatsApp number first.','error');return;
    }
    if(!f.idDocFile){toast('Please upload your National ID or Passport before submitting.','error');return;}
    var btn=document.querySelector('#vapp-body .btn-p'),uploaded=[];
    if(btn){btn.disabled=true;btn.textContent='Uploading documents…';}
    try{
      var idUpload=await ML_API.uploads.upload(f.idDocFile,'vendor-document');
      if(idUpload&&idUpload.url)uploaded.push(idUpload.url);
      var shopPhotoUrl=null;
      if(f.photoFile){
        var photoUpload=await ML_API.uploads.upload(f.photoFile,'vendor-logo');
        shopPhotoUrl=photoUpload&&photoUpload.url||null;
        if(shopPhotoUrl)uploaded.push(shopPhotoUrl);
      }
      if(btn)btn.textContent='Submitting application…';
      var vendorPhone=window.PhoneUtil?window.PhoneUtil.normalize(f.phone,'GM').e164:f.phone;
      var businessDescription=[
        f.sname?'Shop name: '+String(f.sname).trim():'',
        f.description?String(f.description).trim():''
      ].filter(Boolean).join('\n\n');
      await ML_API.vendors.register({
        businessName:String(f.bname).trim(),
        businessCategory:f.cat,
        businessAddress:String(f.saddr).trim(),
        phone:vendorPhone,
        email:f.email||undefined,
        idDocumentUrl:idUpload&&idUpload.url,
        shopPhotoUrl:shopPhotoUrl,
        logoUrl:shopPhotoUrl,
        description:businessDescription||undefined
      });
      closeSheet('sh-vapp');
      toast('Vendor application submitted. Your logo and documents have been saved for Admin review.','success');
      S._vendorLiveLoaded=false;
      if(typeof renderPremiumProfile==='function')await renderPremiumProfile();
    }catch(e){
      for(var i=0;i<uploaded.length;i++){try{await ML_API.uploads.deleteByUrl(uploaded[i]);}catch(cleanupError){}}
      if(btn){btn.disabled=false;btn.textContent='Submit Application 🎉';}
      toast(e.error||e.message||'Vendor application could not be submitted. Please try again.','error');
    }finally{
      if(btn&&btn.isConnected&&btn.disabled){btn.disabled=false;if(btn.textContent==='Uploading documents…'||btn.textContent==='Submitting application…')btn.textContent='Submit Application 🎉';}
    }
  }
  async function submitRider(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.rForm||{};
    if(!f.fname||!f.phone||!f.addr||!f.plate||!f.licence){
      toast('Complete your name, phone, residential address, plate number and licence number first.','error');return;
    }
    if(!f.idDocFile||!f.licenseDocFile){toast('Upload your National ID and driver’s licence / permit before submitting.','error');return;}
    var btn=document.querySelector('#rapp-body .btn-pu'),uploaded=[];
    if(btn){btn.disabled=true;btn.textContent='Uploading documents…';}
    try{
      var idUpload=await ML_API.uploads.upload(f.idDocFile,'rider-document');
      if(idUpload&&idUpload.url)uploaded.push(idUpload.url);
      var licenseUpload=await ML_API.uploads.upload(f.licenseDocFile,'license-document');
      if(licenseUpload&&licenseUpload.url)uploaded.push(licenseUpload.url);
      var vehiclePhotoUrl=null;
      if(f.vehiclePhotoFile){
        var vehicleUpload=await ML_API.uploads.upload(f.vehiclePhotoFile,'rider-photo');
        vehiclePhotoUrl=vehicleUpload&&vehicleUpload.url||null;
        if(vehiclePhotoUrl)uploaded.push(vehiclePhotoUrl);
      }
      if(btn)btn.textContent='Submitting application…';
      var emergencyPhone=f.emergency;
      if(emergencyPhone&&window.PhoneUtil)emergencyPhone=window.PhoneUtil.normalize(emergencyPhone,'GM').e164;
      await ML_API.riders.register({
        vehicleType:f.vehicleType||'motorbike',
        plateNumber:String(f.plate).trim(),
        licenseNumber:String(f.licence).trim(),
        emergencyContact:emergencyPhone||undefined,
        address:String(f.addr).trim(),
        deliveryZone:f.deliveryZone||undefined,
        idDocumentUrl:idUpload&&idUpload.url,
        licenseDocumentUrl:licenseUpload&&licenseUpload.url,
        vehiclePhotoUrl:vehiclePhotoUrl
      });
      closeSheet('sh-rapp');
      toast('Rider application submitted. Your documents are saved securely for Admin review.','success');
      S._riderLiveLoaded=false;
      if(typeof renderPremiumProfile==='function')await renderPremiumProfile();
    }catch(e){
      for(var i=0;i<uploaded.length;i++){try{await ML_API.uploads.deleteByUrl(uploaded[i]);}catch(cleanupError){}}
      if(btn){btn.disabled=false;btn.textContent='Submit Application 🚀';}
      toast(e.error||e.message||'Rider application could not be submitted. Please try again.','error');
    }finally{
      if(btn&&btn.isConnected&&btn.disabled){btn.disabled=false;if(btn.textContent==='Uploading documents…'||btn.textContent==='Submitting application…')btn.textContent='Submit Application 🚀';}
    }
  }
  window.marketlinkLoadProductCategories=async function(){
    var select=G('vp-category');
    if(!select||select.dataset.loaded==='1'||select.dataset.loading==='1')return;
    if(!apiOk()){select.innerHTML='<option value="">Sign in to load categories</option>';return;}
    select.dataset.loading='1';select.innerHTML='<option value="">Loading categories…</option>';
    try{
      var response=await ML_API.categories.list({page:1,limit:100}),categories=normalizeProducts(response.data);
      select.innerHTML='<option value="">Choose a category</option>'+categories.map(function(c){return '<option value="'+esc(c.id)+'">'+esc(c.name||c.category_name||'Category')+'</option>';}).join('');
      select.dataset.loaded='1';
      if(!categories.length)select.innerHTML='<option value="">No active categories available</option>';
    }catch(e){select.innerHTML='<option value="">Could not load categories — tap to retry</option>';select.dataset.loaded='';}
    finally{select.dataset.loading='';}
  };

  window.marketlinkProductImageSelected=async function(input){
    var preview=G('vp-photo-preview'),file=input&&input.files&&input.files[0];
    if(!preview)return;
    function fail(message){
      if(S._productImagePreviewUrl){try{URL.revokeObjectURL(S._productImagePreviewUrl);}catch(e){}}
      S._productImagePreviewUrl=null;S._productImageFile=null;S._productImageQuality=null;
      if(input)input.value='';preview.textContent=message;preview.style.color='#ef907c';toast(message,'error');
    }
    if(!file){S._productImageFile=null;preview.textContent='Choose a clear product photo to continue.';return;}
    if(['image/jpeg','image/png','image/webp'].indexOf(file.type)<0){fail('Please choose a JPG, PNG or WebP image.');return;}
    if(file.size<=0||file.size>5*1024*1024){fail('This image is empty or exceeds 5 MB. Choose a smaller, clear photo.');return;}
    var url=URL.createObjectURL(file),img=new Image();
    try{
      await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;img.src=url;});
      var width=img.naturalWidth,height=img.naturalHeight;
      if(width<600||height<600){URL.revokeObjectURL(url);fail('This photo is too small ('+width+' × '+height+'). Please retake or choose an image at least 600 × 600 pixels.');return;}
      var canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;
      var ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx){URL.revokeObjectURL(url);fail('MarketLink could not inspect this photo. Please choose another image.');return;}
      ctx.drawImage(img,0,0,80,80);
      var pixels=ctx.getImageData(0,0,80,80).data,gray=new Float32Array(80*80),sum=0,dark=0,bright=0;
      for(var i=0,j=0;i<pixels.length;i+=4,j++){
        var lum=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];gray[j]=lum;sum+=lum;
        if(lum<24)dark++;if(lum>246)bright++;
      }
      var mean=sum/gray.length,lapSum=0,lapSq=0,count=0;
      for(var y=1;y<79;y++)for(var x=1;x<79;x++){
        var k=y*80+x,lap=gray[k-1]+gray[k+1]+gray[k-80]+gray[k+80]-4*gray[k];
        lapSum+=lap;lapSq+=lap*lap;count++;
      }
      var lapMean=lapSum/count,sharpness=lapSq/count-lapMean*lapMean;
      if(mean<27||(dark/gray.length)>.72||mean>246||(bright/gray.length)>.78){
        URL.revokeObjectURL(url);fail('The photo looks too dark or overexposed. Retake it in bright, even light with the product clearly visible.');return;
      }
      if(sharpness<8&&!confirm('This photo may look soft or blurry. For a better listing, retake it with a steady camera and clear focus. Choose OK only if you have checked the photo and still want to use it.')){
        URL.revokeObjectURL(url);fail('Please choose a sharper product photo before submitting.');return;
      }
      if(S._productImagePreviewUrl){try{URL.revokeObjectURL(S._productImagePreviewUrl);}catch(e){}}
      S._productImagePreviewUrl=url;S._productImageFile=file;
      S._productImageQuality={width:width,height:height,brightness:Math.round(mean),sharpness:Math.round(sharpness)};
      preview.style.color='#6ddbb4';preview.innerHTML='';
      var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap';
      var thumbnail=document.createElement('img');thumbnail.src=url;thumbnail.alt='Selected product photo preview';thumbnail.style.cssText='width:76px;height:76px;object-fit:cover;border-radius:10px;border:1px solid rgba(109,219,180,.5)';
      var label=document.createElement('span');label.textContent='Photo checked · '+width+' × '+height+' px · '+(sharpness<8?'please visually confirm focus':'quality looks acceptable');
      row.appendChild(thumbnail);row.appendChild(label);preview.appendChild(row);
    }catch(e){URL.revokeObjectURL(url);fail('MarketLink could not read this image. Please choose a valid photo and try again.');}
  };

  async function liveVendorAddProduct(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    var n=G('vp-name'),p=G('vp-price'),s=G('vp-stock'),cat=G('vp-category'),desc=G('vp-description'),compare=G('vp-compare');
    var name=n&&n.value.trim(),price=Number(p&&p.value),stock=s&&s.value.trim()!==''?Number(s.value):null;
    var compareAt=compare&&compare.value.trim()!==''?Number(compare.value):null;
    if(!name||name.length>200||!Number.isFinite(price)||price<0){toast('Enter a valid product name and selling price in Dalasi.','error');return;}
    if(stock!==null&&(!Number.isInteger(stock)||stock<0)){toast('Stock quantity must be a whole number of zero or more.','error');return;}
    if(compareAt!==null&&(!Number.isFinite(compareAt)||compareAt<=price)){toast('Compare-at price must be higher than the selling price.','error');return;}
    if(!S._productImageFile){toast('Please choose a clear product photo before adding this listing.','error');return;}
    if(!cat||!cat.value){await window.marketlinkLoadProductCategories();if(!cat||!cat.value){toast('Choose a product category before submitting.','error');return;}}
    var categoryId=Number(cat.value);
    if(!Number.isInteger(categoryId)||categoryId<1){toast('Choose a valid product category.','error');return;}
    var btn=document.querySelector('#vp-name')&&document.querySelector('#vp-name').parentNode.parentNode.querySelector('.btn-p');
    if(btn){btn.disabled=true;btn.textContent='Checking and uploading…';}
    var imageUrl=null,created=false;
    try{
      var uploaded=await ML_API.uploads.upload(S._productImageFile,'product-image');
      imageUrl=uploaded&&uploaded.url;
      if(!imageUrl)throw new Error('The product image was not saved. Please try again.');
      if(btn)btn.textContent='Saving product…';
      var payload={name:name,price:price,categoryId:categoryId,description:(desc&&desc.value.trim())||'',imageUrl:imageUrl};
      if(compareAt!==null)payload.compareAtPrice=compareAt;
      var result=await ML_API.products.create(payload);
      created=Boolean(result&&result.data&&result.data.id);
      if(!created)throw new Error('MarketLink did not confirm that the product was saved.');
      if(stock!==null)await ML_API.products.updateInventory(result.data.id,{quantity:stock});
      if(S._productImagePreviewUrl){try{URL.revokeObjectURL(S._productImagePreviewUrl);}catch(e){}}
      S._productImageFile=null;S._productImagePreviewUrl=null;S._productImageQuality=null;
      S._vendorLiveLoaded=false;await renderVDash();
      toast(stock===null?'Product submitted with its image. Add stock quantity when ready.':'Product and primary image submitted to MarketLink.','success');
    }catch(e){
      if(imageUrl&&!created){try{await ML_API.uploads.deleteByUrl(imageUrl);}catch(cleanupError){}}
      if(created){
        S._vendorLiveLoaded=false;try{await renderVDash();}catch(renderError){}
        toast('Your product was created, but another step failed: '+(e.error||e.message||'please check stock quantity and try again.'),'warning');
      }else{toast(e.error||e.message||'Could not upload the image or save the product. Please try again.','error');}
    }finally{if(btn&&btn.isConnected){btn.disabled=false;btn.textContent='Upload and Add Product';}}
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
  var mlRiderGpsWatchId=null,mlRiderGpsTimer=null,mlRiderGpsDeliveryId=null,mlRiderGpsBusy=false,mlRiderGpsLastSent=0,mlRiderGpsError=null;
  function stopRiderLocationWatch(){
    if(mlRiderGpsTimer){clearInterval(mlRiderGpsTimer);mlRiderGpsTimer=null;}
    if(mlRiderGpsWatchId!==null&&navigator.geolocation&&navigator.geolocation.clearWatch){
      try{navigator.geolocation.clearWatch(mlRiderGpsWatchId);}catch(e){}
    }
    mlRiderGpsWatchId=null;
    mlRiderGpsDeliveryId=null;
    mlRiderGpsBusy=false;
    mlRiderGpsError=null;
  }
  async function submitRiderGpsPosition(position,deliveryId){
    if(!position||!position.coords||!S.activeDel||String(S.activeDel.id)!==String(deliveryId)||String(mlRiderGpsDeliveryId)!==String(deliveryId))return;
    var status=String(S.activeDel.status||'assigned').toLowerCase();
    if(['assigned','picked_up','in_transit'].indexOf(status)<0)return;
    if(mlRiderGpsBusy||Date.now()-mlRiderGpsLastSent<9000)return;
    var lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180)return;
    mlRiderGpsBusy=true;
    mlRiderGpsLastSent=Date.now();
    try{
      var response=await ML_API.delivery.updateLocation(lat,lng,deliveryId);
      var data=response&&response.data?response.data:response;
      if(!S.activeDel||String(S.activeDel.id)!==String(deliveryId))return;
      var now=(data&&data.updatedAt)||new Date().toISOString();
      S.activeDel.tracking=Object.assign({},S.activeDel.tracking||{},{
        current_lat:lat,current_lng:lng,last_location_at:now,
        location_trail:[{lat:lat,lng:lng,recorded_at:now}]
      });
      mlRiderGpsError=null;
      sanitizeRiderMap();
    }catch(e){
      mlRiderGpsError=e&&e.code==='FORBIDDEN'?'This delivery is not assigned to this rider.':'The last GPS update did not reach MarketLink. Check location permission and connection.';
      // Do not spam the rider with a toast every time a location ping fails.
    }finally{mlRiderGpsBusy=false;}
  }
  function requestRiderGpsOnce(deliveryId){
    if(!navigator.geolocation||!navigator.geolocation.getCurrentPosition){
      mlRiderGpsError='This browser does not support GPS location.';
      sanitizeRiderMap();return;
    }
    navigator.geolocation.getCurrentPosition(
      function(position){submitRiderGpsPosition(position,deliveryId);},
      function(err){
        mlRiderGpsError=err&&err.code===1?'Allow location access to share your position during this delivery.':'MarketLink could not read the current GPS position yet.';
        sanitizeRiderMap();
      },
      {enableHighAccuracy:true,maximumAge:5000,timeout:12000}
    );
  }
  function startRiderLocationWatch(deliveryId){
    if(!deliveryId||!S.activeDel||String(S.activeDel.id)!==String(deliveryId)||!apiOk())return;
    var status=String(S.activeDel.status||'assigned').toLowerCase();
    if(['assigned','picked_up','in_transit'].indexOf(status)<0){stopRiderLocationWatch();return;}
    if(mlRiderGpsTimer&&String(mlRiderGpsDeliveryId)===String(deliveryId))return;
    stopRiderLocationWatch();
    mlRiderGpsDeliveryId=String(deliveryId);
    requestRiderGpsOnce(deliveryId);
    if(navigator.geolocation&&navigator.geolocation.watchPosition){
      mlRiderGpsWatchId=navigator.geolocation.watchPosition(
        function(position){submitRiderGpsPosition(position,deliveryId);},
        function(err){
          mlRiderGpsError=err&&err.code===1?'Allow location access to share your position during this delivery.':'GPS updates are temporarily unavailable.';
          sanitizeRiderMap();
        },
        {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
      );
    }
    mlRiderGpsTimer=setInterval(function(){
      if(!S.activeDel||String(S.activeDel.id)!==String(deliveryId)||String(mlRiderGpsDeliveryId)!==String(deliveryId)){
        stopRiderLocationWatch();return;
      }
      requestRiderGpsOnce(deliveryId);
    },15000);
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
  async function liveVendorRequestPayout(amount){
    amount=Number(amount||0);
    if(!(amount>0)){toast('No balance available to pay out.','error');return;}
    var method=window.prompt('Payout method (wave or afrimoney):','wave');
    if(method===null)return;
    method=String(method).trim().toLowerCase();
    if(['wave','afrimoney'].indexOf(method)<0){toast('Use Wave or AfriMoney for the configured payout integration.','error');return;}
    var account=window.prompt('Payout phone/account number:','');
    if(account===null||!String(account).trim()){toast('A payout account is required.','error');return;}
    try{
      await ML_API.vendors.requestWithdrawal({amount:amount,payoutMethod:method,payoutDetails:{accountNumber:String(account).trim()}});
      toast('Withdrawal request submitted ✓');S._vendorLiveLoaded=false;renderVDash();
    }catch(e){toast(e.error||'Could not request the withdrawal.','error');}
  }
  async function liveRiderRequestWithdrawal(amount){
    amount=Number(amount||0);
    if(!(amount>0)){toast('No balance available.','error');return;}
    var method=window.prompt('Payout method (wave or afrimoney):','wave');
    if(method===null)return;
    method=String(method).trim().toLowerCase();
    if(['wave','afrimoney'].indexOf(method)<0){toast('Use Wave or AfriMoney for the configured payout integration.','error');return;}
    var account=window.prompt('Payout phone/account number:','');
    if(account===null||!String(account).trim()){toast('A payout account is required.','error');return;}
    try{
      await ML_API.riders.requestWithdrawal({amount:amount,payoutMethod:method,payoutDetails:{accountNumber:String(account).trim()}});
      toast('Withdrawal request submitted ✓');S._riderLiveLoaded=false;renderRDash();
    }catch(e){toast(e.error||'Could not request the withdrawal.','error');}
  }
  async function liveRiderDecline(id){
    toast('Delivery decline is not exposed as a separate backend action; the request remains available until accepted.','info');
  }
  function sanitizeRiderMap(){
    var map=G('rider-amap');
    if(!map)return;
    var tr=S.activeDel&&S.activeDel.tracking;
    var hasGps=tr&&tr.current_lat!=null&&tr.current_lng!=null;
    map.innerHTML='<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;box-sizing:border-box;background:linear-gradient(160deg,#07151F,#102A35);">'+
      '<div><div style="font-size:28px;margin-bottom:8px">📍</div><b style="color:#EAF2F5;font-size:13px">'+(hasGps?'Live location connected':'Live location unavailable')+'</b><div style="color:#91A4B4;font-size:11px;line-height:1.5;margin-top:5px">'+(hasGps?'Showing the latest backend-provided rider location.':'No current GPS point is available from the backend for this delivery.')+'</div></div></div>';
  }
  var baseRenderRDash=window.renderRDash;
  window.renderRDash=function(){
    if(typeof baseRenderRDash==='function')baseRenderRDash();
    if(S.activeDel&&S.activeDel.id)startRiderLocationWatch(S.activeDel.id);
    else stopRiderLocationWatch();
    sanitizeRiderMap();
    document.querySelectorAll('#rdash-body button').forEach(function(btn){
      if((btn.textContent||'').indexOf('Decline')>=0) btn.remove();
    });
  };
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
    try{var d=await liveAdminData();if(!d){toast('Admin session required.','error');return;}var root=G('adash-body');if(root)root.innerHTML=liveAdminOverview(d);}catch(e){toast(e.error||'Could not load live admin data.','error');}
  }
  async function renderLiveAdminAnalytics(period){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Live analytics</div><div class="ml-hero-sub">Loading production analytics…</div></div>';
    try{
      var r=await ML_API.admin.analytics({period:period||'30d'}),d=r.data||{};
      var daily=Array.isArray(d.dailyRevenue)?d.dailyRevenue:[],statusRows=Array.isArray(d.ordersByStatus)?d.ordersByStatus:[],signups=Array.isArray(d.signups)?d.signups:[];
      var totalOrders=statusRows.reduce(function(a,x){return a+Number(x.count||0);},0);
      var totalRevenue=daily.reduce(function(a,x){return a+Number(x.revenue||0);},0);
      var maxRev=Math.max.apply(null,daily.map(function(x){return Number(x.revenue||0);}).concat([1]));
      var revBars=daily.slice(-14).map(function(x){var v=Number(x.revenue||0),h=Math.max(4,Math.round(v/maxRev*120));return '<div title="'+esc(String(x.day||''))+': '+money(v)+'" style="flex:1;min-width:9px;height:'+h+'px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#42D2C9,#0D7377);"></div>';}).join('');
      var statusHtml=statusRows.length?statusRows.map(function(x){return '<div class="ml-profile-row"><div class="ico">📦</div><div class="copy"><b>'+esc(x.status||'Unknown')+'</b><span>Orders in selected period</span></div><strong>'+Number(x.count||0)+'</strong></div>';}).join(''):'<div class="ml-empty"><b>No order activity yet</b><span>The selected period contains no production orders.</span></div>';
      var signupHtml=signups.length?signups.slice(-10).map(function(x){return '<div class="ml-profile-row"><div class="ico">👥</div><div class="copy"><b>'+esc(String(x.day||'').slice(0,10))+'</b><span>New user registrations</span></div><strong>'+Number(x.users||0)+'</strong></div>';}).join(''):'<div class="ml-empty"><b>No customer growth data yet</b><span>No registrations were recorded in the selected period.</span></div>';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">MarketLink Operations</div><h3 style="margin:4px 0">Live analytics</h3></div><button onclick="window.ML_Premium.refreshAdminAnalytics()">Refresh</button></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Orders</div><div class="ml-stat-value">'+totalOrders+'</div></div><div class="ml-stat"><div class="ml-stat-label">Revenue</div><div class="ml-stat-value">'+money(totalRevenue)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Signup days</div><div class="ml-stat-value">'+signups.length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Period</div><div class="ml-stat-value">'+esc(period||'30d')+'</div></div></div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Revenue by day</h3><span style="color:#91A4B4;font-size:10px">Live backend data</span></div><div style="height:150px;display:flex;align-items:flex-end;gap:5px;padding:12px 4px 4px">'+(revBars||'<div class="ml-empty"><b>No revenue data</b></div>')+'</div></div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Order status</h3></div>'+statusHtml+'</div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Customer growth</h3></div>'+signupHtml+'</div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty" style="margin:20px"><b>Live analytics unavailable</b><span>'+esc(e.error||'The backend did not return analytics.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshAdminAnalytics()">Retry</button></div>';}
  }
  async function renderLiveAdminRevenue(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Live revenue</div><div class="ml-hero-sub">Loading delivered-order revenue from the production database…</div></div>';
    try{
      var r=await ML_API.admin.reports({type:'revenue'}),rows=normalizeProducts(r.data),sum=rows.reduce(function(a,x){return a+Number(x.revenue||0);},0);
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Live revenue</h3><button onclick="window.ML_Premium.refreshAdminRevenue()">Refresh</button></div><div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Delivered-order revenue</div><div class="ml-stat-value">'+money(sum)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Report days</div><div class="ml-stat-value">'+rows.length+'</div></div></div>'+
      (rows.length?'<div class="ml-profile-card" style="margin-top:12px">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">💰</div><div class="copy"><b>'+esc(String(x.day||'').slice(0,10))+'</b><span>'+Number(x.orders||0)+' delivered order(s) · platform fees '+money(x.platform_fees||0)+'</span></div><strong>'+money(x.revenue||0)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty" style="margin-top:12px"><b>No order activity yet</b><span>No delivered orders were returned for the current report.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Live revenue unavailable</b><span>'+esc(e.error||'The backend did not return a revenue report.')+'</span></div>';}
  }
  async function renderLiveAdminPayouts(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Live payouts</div><div class="ml-hero-sub">Loading pending withdrawals from the production database…</div></div>';
    try{
      var r=await ML_API.admin.withdrawals({page:1,limit:100}),rows=normalizeProducts(r.data);
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Pending payouts</h3><button onclick="window.ML_Premium.refreshAdminPayouts()">Refresh</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">💸</div><div class="copy"><b>'+esc(x.full_name||'Account')+'</b><span>'+esc(x.user_type||'account')+' · '+esc(x.payout_method||'Payout')+' · '+esc(x.status||'processing')+'</span></div><strong>'+money(x.amount||0)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No pending payouts</b><span>The production database has no withdrawal requests awaiting admin action.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Live payouts unavailable</b><span>'+esc(e.error||'The backend did not return withdrawal data.')+'</span></div>';}
  }
  function renderAdminUnavailable(title,detail){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>'+esc(title)+'</b><span>'+esc(detail)+'</span></div></div>';
  }
  function adminGoToLive(tab){
    if(tab==='overview'){refreshAdmin();return;}
    if(tab==='analytics'){renderLiveAdminAnalytics('30d');return;}
    if(tab==='f-revenue'){renderLiveAdminRevenue();return;}
    if(tab==='f-payouts'){renderLiveAdminPayouts();return;}
    if(tab==='f-transactions'){renderAdminUnavailable('Transactions not exposed by current admin API','The current backend does not expose a general admin transaction feed. No synthetic transactions are shown.');return;}
    if(tab==='f-failed'){renderAdminUnavailable('Failed payments not exposed by current admin API','The current backend has payment records and provider webhook processing, but no dedicated admin failed-payment feed. No fabricated records are shown.');return;}
    if(tab==='ai'){
      (async function(){
        var root=G('adash-body');if(!root)return;
        root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">MarketLink AI Operations</div><div class="ml-hero-sub">Summarizing live backend activity…</div></div>';
        try{
          var dr=await ML_API.admin.dashboard(),ar=await ML_API.admin.analytics({period:'30d'}),d=dr.data||{},a=ar.data||{},ss=d.stats||{};
          var prompt='Summarize these actual MarketLink production metrics without inventing facts. State zero-data clearly. Metrics: '+JSON.stringify({stats:ss,pendingApprovals:d.pendingApprovals||{},recentOrders:d.recentOrders||[],dailyRevenue:a.dailyRevenue||[],ordersByStatus:a.ordersByStatus||[],signups:a.signups||[]});
          var ai=await ML_API.assistant.ask(prompt),answer=ai&&ai.data&&(ai.data.answer||ai.data.message||ai.data.text)||ai.answer||ai.message||'No AI summary was returned.';
          root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>MarketLink AI Operations</h3><button onclick="adminGoTo(\'overview\')">← Overview</button></div><div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">🤖</div><div class="copy"><b>Live-data summary</b><span>Generated from current backend metrics. No fabricated figures are supplied.</span></div></div><div style="padding:14px;color:#DCE8ED;font-size:12px;line-height:1.7">'+esc(answer)+'</div></div></div>';
        }catch(e){root.innerHTML='<div class="ml-empty"><b>AI summary unavailable</b><span>'+esc(e.error||'The assistant could not summarize current backend data.')+'</span></div>';}
      })();
      return;
    }
    if(tab==='o-active'||tab==='deliveries'){renderAdminUnavailable('General live order/delivery list unavailable','The current backend exposes dashboard recent orders and authorized delivery lookup, but no general admin order feed. No fake records are shown.');return;}
    if(tab==='appr-pv'||tab==='appr-pr'){
      var kind=tab==='appr-pv'?'vendor':'rider';
      var call=kind==='vendor'?ML_API.vendors.list({page:1,limit:100,kycStatus:'pending'}):ML_API.riders.list({page:1,limit:100,kycStatus:'pending'});
      Promise.resolve(call).then(function(r){
        var items=(r.data&&r.data.items)||r.data||[],root=G('adash-body');if(!root)return;
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
  var mlOnboardSlides=[
    {eyebrow:'SHOP THE LOCAL MARKET',title:'Your market.',accent:'Your phone.',body:'Find fresh produce, groceries and everyday essentials from local sellers across The Gambia.',chips:['Local vendors','Everyday essentials','Easy ordering'],image:'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1600&q=85',visualTitle:'Fresh picks, closer to home',visualNote:'Discover what local sellers have today.',symbol:'🛍️'},
    {eyebrow:'BUILT FOR GAMBIAN BUSINESSES',title:'Bring your shop',accent:'to more customers.',body:'Showcase your products, manage real orders and grow your business with a connected local marketplace.',chips:['Your products','Your customers','One dashboard'],image:'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=1600&q=85',visualTitle:'Your business, online',visualNote:'Reach shoppers beyond your storefront.',symbol:'🏪'},
    {eyebrow:'MARKETLINK AFFILIATE PROGRAM',title:'Share a link.',accent:'Earn 2%.',body:'Share your personal affiliate link. Earn 2% of the eligible discounted merchandise subtotal when a referred order is successfully delivered.',chips:['Share on WhatsApp','Eligible purchases','Rewards after delivery'],image:'https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1600&q=85',visualTitle:'Your network has value',visualNote:'Earn on the eligible merchandise subtotal after delivery.',symbol:'🔗'}
  ];
  function goOnboardTo(index){
    S.obSlide=(Number(index)+mlOnboardSlides.length)%mlOnboardSlides.length;
    renderPremiumOnboarding(false);
  }
  function renderPremiumOnboarding(resetAutoplay){
    var screen=G('scr-onboard'),slide=G('ob-slide'),dots=G('ob-dots'),btn=G('ob-btn'),logo=G('ob-logo');
    if(!screen||!slide||!dots||!btn)return;
    screen.classList.add('ml-onboard-screen');
    slide.className='ml-ob-slide';
    if(logo)logo.className='ml-ob-logo';
    var head=screen.querySelector(':scope > header.ml-ob-topbar');
    if(head){head.className='ml-ob-topbar';}
    var footer=btn.parentElement;if(footer)footer.className='ml-ob-footer';
    var p=mlOnboardSlides[(Number(S.obSlide)||0)%mlOnboardSlides.length];
    slide.innerHTML='<div class="ml-ob-layout"><div class="ml-ob-copy"><span class="ml-ob-eyebrow"><i></i>'+esc(p.eyebrow)+'</span>'+
      '<h1>'+esc(p.title)+'<em>'+esc(p.accent)+'</em></h1><p class="ml-ob-description">'+esc(p.body)+'</p>'+
      '<div class="ml-ob-chips">'+p.chips.map(function(x){return '<span><b>✓</b>'+esc(x)+'</span>';}).join('')+'</div>'+
      '<div class="ml-ob-inline-meta"><span class="ml-ob-meta-logo">'+(p.symbol)+'</span><span><b>MarketLink Gambia</b><small>Your local market, connected.</small></span></div></div>'+
      '<div class="ml-ob-visual" style="background-image:linear-gradient(180deg,rgba(5,18,30,.04) 15%,rgba(5,18,30,.85) 100%),url(&quot;'+esc(p.image)+'&quot;)">'+
      '<div class="ml-ob-visual-top"><span>'+gambiaFlagMarkup()+' MADE FOR THE GAMBIA</span><span class="ml-ob-live"><i></i> LOCAL OPPORTUNITY</span></div>'+
      '<div class="ml-ob-visual-bottom"><span class="ml-ob-visual-symbol">'+p.symbol+'</span><h2>'+esc(p.visualTitle)+'</h2><p>'+esc(p.visualNote)+'</p>'+
      (S.obSlide===2?'<div class="ml-ob-reward"><strong>2%</strong><span>affiliate reward<small>on eligible referred purchases</small></span></div>':'<div class="ml-ob-visual-pills"><span>SHOP</span><span>SELL</span><span>DELIVER</span></div>')+
      '</div><div class="ml-ob-image-glow"></div></div></div>';
    dots.className='ml-ob-dots';
    dots.innerHTML=mlOnboardSlides.map(function(_,i){return '<button type="button" aria-label="Go to onboarding slide '+(i+1)+'" class="'+(i===S.obSlide?'active':'')+'" onclick="window.ML_Premium.goOnboardTo('+i+')"></button>';}).join('');
    btn.className='btn btn-gh ml-ob-next';
    btn.innerHTML=(S.obSlide===mlOnboardSlides.length-1?'Get started':'Continue')+' <span>→</span>';
    var skip=screen.querySelector('.ml-ob-topbar button');
    if(skip){skip.className='ml-ob-skip';skip.textContent='Skip';}
    if(mlOnboardTimer){clearInterval(mlOnboardTimer);mlOnboardTimer=null;}
    // Onboarding is user-controlled so new users have enough time to read each step.
  }
  function goOnboardPremium(){S.obSlide=0;showScreen('scr-onboard');renderPremiumOnboarding(true);}
  function obNextLive(){
    if(Number(S.obSlide)>=mlOnboardSlides.length-1){if(mlOnboardTimer)clearInterval(mlOnboardTimer);mlOnboardTimer=null;goAuth();return;}
    goOnboardTo((Number(S.obSlide)||0)+1);
  }
  function continueOtpLive(){closeSheet('sh-otp-reveal');}
  function adminGoToLiveSafe(tab){adminGoToLive(tab);}
  window.goOnboard=goOnboardPremium;
  window.renderOnboard=function(){renderPremiumOnboarding(true);};
  window.obNext=obNextLive;
  window.continueFromOtpReveal=continueOtpLive;
  var existingAdminGoTo=window.adminGoTo;
  window.__ML_ORIGINAL_ADMIN_GOTO=existingAdminGoTo;
  window.adminGoTo=adminGoToLive;
    window.ML_Premium={toggleAppearance:togglePremiumAppearance,handleProfilePhoto:handleProfilePhotoInput,removeProfilePhoto:removeProfilePhoto,renderCategories:function(){S.activeCategoryId=null;S.activeCategoryName=null;switchTab('catpage');},openOrders:function(){switchTab('orders');},viewOrder:openOrderDetail,showProfileOverview:function(){S.profilePage=null;renderPremiumProfile();},openProfilePage:openProfilePage,openMarketLinkAI:openMarketLinkAI,askMarketLinkAI:openMarketLinkAIWithQuestion,askMarketLinkAIFromButton:openMarketLinkAIFromButton,applyLanguagePreference:function(){var v=G('ml-language-profile');if(v&&window.MarketLinkI18n)window.MarketLinkI18n.setLanguage(v.value);toast('Language preference saved.','success');},openRoleDashboard:openRoleDashboard,refreshWallet:function(){return renderPremiumWalletPage(G('profile-body'));},markNotificationRead:markPremiumNotificationRead,markAllNotificationsRead:markAllPremiumNotificationsRead,removeWishlist:removePremiumWishlistItem,removeCompareItem:removePremiumCompareItem,goOnboardTo:goOnboardTo,promoAction:promoAction,goPromoTo:function(i){paintPromoCarousel(i);},promoNext:function(){paintPromoCarousel(mlPromoIndex+1);},promoPrev:function(){paintPromoCarousel(mlPromoIndex-1);},refresh:refresh,refreshCart:renderLiveCart,refreshAdmin:refreshAdmin,refreshAdminAnalytics:function(){return renderLiveAdminAnalytics('30d');},refreshAdminRevenue:renderLiveAdminRevenue,refreshAdminPayouts:renderLiveAdminPayouts,selectAddress:selectAddress,selectPayment:selectPayment,setCoupon:setCoupon,manageAddresses:manageAddresses,editAddress:editAddress,addAddress:addAddress,setDefaultAddress:setDefaultAddress,deleteAddress:deleteAddress,renderAddresses:renderAddresses,approveApplicant:approveApplicant,rejectApplicant:rejectApplicant,openCategory:openCategory,openProduct:openProduct,add:add,placeOrder:placeLiveOrder,checkPaymentStatus:function(){return checkLivePaymentStatus(false);},continueModemPay:continueLiveModemPayment,restoreCartAndRetry:restoreLiveCartAfterPaymentFailure,finishPaidOrder:finishLivePaidOrder,editProfile:editProfileModal,saveProfile:saveProfile,saveProfilePhoto:saveProfilePhoto,pickPhoto:function(){var el=document.getElementById('ml-profile-photo-input');if(el)el.click();},renderProfile:renderPremiumProfile,submitVendor:submitVendor,submitRider:submitRider,toggleRiderOnline:toggleRiderOnline,load:loadLiveHome,adminRefresh:loadAdminDashboard,adminApprovals:adminApprovals,approve:approveAdmin,adminUsers:adminUsers};
  function switchTab(tab){
    if(tab!=='orders')stopCustomerOrderDetailPolling();
    S.curTab=tab;
    ['home','catpage','store','cart','orders','profile','vendordash','riderdash','admindash'].forEach(function(x){var el=G('tab-'+x);if(el)el.style.display='none';});
    var target=G('tab-'+tab);if(target)target.style.display='block';
    var nav=G('bnav');if(nav)nav.style.display=tab==='admindash'?'none':'flex';
    if(tab==='home')renderHome();
    else if(tab==='cart')renderCart();
    else if(tab==='orders'){renderLiveOrders();if(typeof startOrderTracking==='function'&&S.order)startOrderTracking();}
    else if(tab==='profile'){if(typeof window.renderProfile==='function')window.renderProfile();else renderPremiumProfile();}
    else if(tab==='vendordash')renderVDash();
    else if(tab==='riderdash')renderRDash();
    else if(tab==='admindash')renderAdminDash();
    else if(tab==='catpage')renderLiveCategoriesPage();
    else if(tab==='store'&&typeof renderStoreProdCtrl==='function')renderStoreProdCtrl();
    document.querySelectorAll('.ntab').forEach(function(n){n.classList.toggle('act',n.dataset.tab===tab);n.classList.toggle('sel',n.dataset.tab===tab);n.setAttribute('aria-current',n.dataset.tab===tab?'page':'false');});
  }
  window.switchTab=switchTab;
  function bindMarketLinkBottomNav(){
    var nav=G('bnav');if(!nav||nav.dataset.mlNavBound==='1')return;
    nav.dataset.mlNavBound='1';
    nav.addEventListener('click',function(event){
      var item=event.target&&event.target.closest?event.target.closest('.ntab[data-tab]'):null;
      if(!item||!nav.contains(item))return;
      // Role tabs created by the legacy application keep their own route handler.
      if(typeof item.onclick==='function')return;
      event.preventDefault();
      var tab=item.dataset.tab;
      if(tab==='catpage'){S.activeCategoryId=null;S.activeCategoryName=null;}
      if(tab&&typeof window.switchTab==='function')window.switchTab(tab);
    });
    nav.querySelectorAll('.ntab[data-tab]').forEach(function(item){
      item.setAttribute('role','button');item.setAttribute('tabindex','0');
      item.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();item.click();}});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindMarketLinkBottomNav,{once:true});else bindMarketLinkBottomNav();
  async function renderAdminDash(){
    var el=G('adash-body');if(!el)return;
    el.innerHTML='<div class="ml-premium-home"><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Live Control Center</div><div class="ml-hero-sub">Loading production metrics…</div></div>';
    try{
      var r=await ML_API.admin.dashboard(),d=r.data||{},st=d.stats||{},pa=d.pendingApprovals||{},recent=Array.isArray(d.recentOrders)?d.recentOrders:[],vendors=Array.isArray(d.topVendors)?d.topVendors:[];
      el.innerHTML='<div class="ml-premium-home"><div class="ml-home-top"><div><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Live Control Center</div><div class="ml-hero-sub">Production metrics from the authenticated MarketLink backend.</div></div><div class="ml-live-dot">Backend connected</div><button class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.reviewPromotions()">🎫 Promotion requests</button></div>'+
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
  function showPremiumHomeLoading(){
    var root=G('tab-home');if(!root)return;
    root.innerHTML='<div class="ml-premium-home ml-home-loading"><div class="ml-dashboard-brand">'+mlOfficialBrandMarkup()+'</div><div class="ml-skeleton-line" style="width:54%"></div><div class="ml-skeleton-line" style="width:36%"></div><div class="ml-skeleton-card"></div><div class="ml-skeleton-line" style="width:44%"></div></div>';
  }
  async function loadFirebaseCompatScript(src){
    if(document.querySelector('script[data-marketlink-firebase="'+src+'"]'))return;
    await new Promise(function(resolve,reject){var script=document.createElement('script');script.src=src;script.async=true;script.dataset.marketlinkFirebase=src;script.onload=resolve;script.onerror=function(){reject(new Error('Firebase SDK could not be loaded. Check the content-security policy and network.'));};document.head.appendChild(script);});
  }
  async function enableMarketLinkPush(){
    var cfg=window.MARKETLINK_FIREBASE_CONFIG||window.MARKETLINK_CONFIG&&window.MARKETLINK_CONFIG.FIREBASE_WEB_CONFIG;
    if(!cfg||!cfg.apiKey||!cfg.projectId||!cfg.messagingSenderId||!cfg.appId||!cfg.vapidKey){toast('Push setup needs the real Firebase Web app config and VAPID public key. Contact the MarketLink administrator.','error');return {enabled:false,reason:'FIREBASE_WEB_CONFIG_MISSING'};}
    if(!window.isSecureContext||!navigator.serviceWorker||!window.Notification){toast('This browser does not support secure web push notifications.','error');return {enabled:false,reason:'BROWSER_PUSH_UNSUPPORTED'};}
    if(!ML_API.auth.isAuthenticated()){toast('Sign in before enabling account push notifications.','error');return {enabled:false,reason:'AUTH_REQUIRED'};}
    try{
      var permission=Notification.permission;if(permission==='default')permission=await Notification.requestPermission();
      if(permission!=='granted'){toast('Notification permission was not granted. You can enable it in browser settings.','error');return {enabled:false,reason:'PERMISSION_DENIED'};}
      await loadFirebaseCompatScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
      await loadFirebaseCompatScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
      if(!window.firebase)throw new Error('Firebase SDK is unavailable.');
      var app=window.firebase.apps&&window.firebase.apps.length?window.firebase.app():window.firebase.initializeApp({apiKey:cfg.apiKey,authDomain:cfg.authDomain,projectId:cfg.projectId,messagingSenderId:cfg.messagingSenderId,appId:cfg.appId});
      var sw=await navigator.serviceWorker.register('./firebase-messaging-sw.js'),messaging=app.messaging();
      var token=await messaging.getToken({vapidKey:cfg.vapidKey,serviceWorkerRegistration:sw});if(!token)throw new Error('Firebase did not return a device token.');
      await ML_API.notifications.registerPushToken(token,'web');
      if(!messaging.__marketLinkForegroundBound){messaging.__marketLinkForegroundBound=true;messaging.onMessage(function(payload){var n=payload&&payload.notification||{},title=n.title||'MarketLink update',body=n.body||'You have a new account update.';toast(title+(body?' — '+body:''),'info');if(!document.hidden&&Notification.permission==='granted'){try{new Notification(title,{body:body,tag:'marketlink-foreground'});}catch(e){}}});}
      toast('Push notifications are enabled for this device.','success');return {enabled:true};
    }catch(e){console.error('[MarketLink push setup]',e);toast(e&&e.message||'Could not enable push notifications. Check Firebase setup and browser permissions.','error');return {enabled:false,reason:'PUSH_SETUP_FAILED'};}
  }
  window.ML_Push={enable:enableMarketLinkPush};
  window.renderHome=function(){showPremiumHomeLoading();loadLiveHome().catch(function(e){var root=G('tab-home');if(root)root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>Marketplace could not load</b><span>'+esc(e.error||'Please check your connection and try again.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.renderHome()">Retry</button></div></div>';});};
  window.openCategory=function(cat){if(cat&&cat.id){return openCategory(cat.id,cat.name||'Category');}return loadLiveHome();};
  window.openProductDetail=function(id){return openProduct(id);};
  window.doSearch=function(q){return searchMarketplace(q);};
  window.renderProfile=function(){
    var root=G('profile-body');
    if(root&&!S.profilePage)root.innerHTML='<div class="ml-profile-shell"><div class="ml-loading">Loading your MarketLink account…</div></div>';
    renderPremiumProfile().catch(function(e){toast(e.error||'Could not load your profile.','error');});
  };
  window.renderOrders=function(){renderLiveOrders().catch(function(e){toast(e.error||'Could not load your orders.','error');});};
  window.renderAdminDash=function(){loadAdminDashboard().catch(function(e){toast(e.error||'Could not load the admin dashboard.','error');});};
  var mlOriginalGoAuth=window.goAuth;
  window.goAuth=function(){if(mlOnboardTimer){clearInterval(mlOnboardTimer);mlOnboardTimer=null;}if(typeof mlOriginalGoAuth==='function')return mlOriginalGoAuth.apply(this,arguments);};
  window.placeOrder=placeLiveOrder;
  window.renderCart=renderLiveCart;
  window.applyCoupon=setCoupon;
  window.removeCoupon=function(){S.appliedCoupon=null;renderLiveCart();};
  window.vAddProd=liveVendorAddProduct;
  window.vSaveProdEdit=liveVendorSaveProduct;
  window.vRemoveProd=liveVendorRemoveProduct;
  window.vToggleOnline=liveVendorToggleOnline;
  window.rNextStep=liveRiderNextStep;
  window.rRequestWithdrawal=liveRiderRequestWithdrawal;
  window.rDecline=liveRiderDecline;
  window.vRequestPayout=liveVendorRequestPayout;
  window.ML_Premium.reviewPromotions=async function(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>🎫 Vendor promotion requests</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div><div class="ml-empty"><b>Loading requests…</b></div></div>';
    try{
      var result=await ML_API.promotions.adminList({limit:100}),rows=Array.isArray(result.data)?result.data:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>🎫 Vendor promotion requests</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(p){
        var id=esc(p.id),title=esc(p.title||'Promotion'),vendor=esc(p.business_name||p.vendor_contact_name||'Vendor'),status=esc(p.status||'pending'),pay=esc(p.payment_status||'unpaid');
        return '<article style="padding:14px;border-bottom:1px solid rgba(148,163,184,.18)"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>'+title+'</b><div style="font-size:11px;color:var(--mu);margin-top:4px">'+vendor+' · '+Number(p.duration_hours||0)+' hours</div></div><span style="font-size:10px;color:#F5A623">'+status+'</span></div>'+
        '<p style="font-size:12px;line-height:1.5;color:var(--mu)">'+esc(p.description||'No extra description provided.')+'</p>'+
        (p.banner_url?'<a href="'+esc(p.banner_url)+'" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#F5A623">Open submitted banner ↗</a>':'<div style="font-size:11px;color:var(--mu)">No banner uploaded yet</div>')+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><label style="font-size:11px">Review status<select id="ml-promo-status-'+id+'" style="display:block;width:100%;margin-top:4px;padding:9px;border-radius:8px;background:#111827;color:#fff"><option value="pending" '+(status==='pending'?'selected':'')+'>Pending</option><option value="reviewing" '+(status==='reviewing'?'selected':'')+'>Reviewing</option><option value="approved" '+(status==='approved'?'selected':'')+'>Approved (await payment)</option><option value="rejected" '+(status==='rejected'?'selected':'')+'>Rejected</option><option value="published" '+(status==='published'?'selected':'')+'>Published</option><option value="cancelled" '+(status==='cancelled'?'selected':'')+'>Cancelled</option></select></label>'+
        '<label style="font-size:11px">Payment<select id="ml-promo-payment-'+id+'" style="display:block;width:100%;margin-top:4px;padding:9px;border-radius:8px;background:#111827;color:#fff"><option value="unpaid" '+(pay==='unpaid'?'selected':'')+'>Unpaid</option><option value="pending" '+(pay==='pending'?'selected':'')+'>Payment pending</option><option value="paid" '+(pay==='paid'?'selected':'')+'>Paid / confirmed</option><option value="refunded" '+(pay==='refunded'?'selected':'')+'>Refunded</option></select></label></div>'+
        '<label style="display:block;font-size:11px;margin-top:9px">Admin notes / final quote<textarea id="ml-promo-notes-'+id+'" rows="2" placeholder="Confirm price, payment instructions and schedule…" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;background:#111827;color:#fff;border:1px solid rgba(148,163,184,.25)">'+esc(p.admin_notes||'')+'</textarea></label>'+
        '<button class="ml-btn ml-btn-primary" style="margin-top:9px;width:100%" onclick="window.ML_Premium.savePromotionReview(\''+id+'\')">Save review</button></article>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No promotion requests yet</b><span>Vendor requests will appear here once submitted.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Could not load promotion requests</b><span>'+esc(e.error||e.message||'Check the backend and try again.')+'</span><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.reviewPromotions()">Retry</button></div>';}
  };
  window.ML_Premium.savePromotionReview=async function(id){
    var status=G('ml-promo-status-'+id),payment=G('ml-promo-payment-'+id),notes=G('ml-promo-notes-'+id);
    try{await ML_API.promotions.adminReview(id,{status:status&&status.value,paymentStatus:payment&&payment.value,adminNotes:notes&&notes.value});toast('Promotion review saved.','success');window.ML_Premium.reviewPromotions();}
    catch(e){toast(e.error||'Could not save the promotion review.','error');}
  };
  window.vAddPromo=function(){
    var old=document.getElementById('ml-promo-request-modal');if(old)old.remove();
    var overlay=document.createElement('div');overlay.id='ml-promo-request-modal';
    overlay.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(3,8,18,.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:14px;';
    overlay.innerHTML='<section style="width:min(100%,540px);max-height:92dvh;overflow:auto;background:var(--sf,#111827);color:var(--tx,#fff);border:1px solid rgba(245,166,35,.28);border-radius:22px;box-shadow:0 25px 90px rgba(0,0,0,.45);padding:20px;">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;"><div><div style="font-size:10px;letter-spacing:.14em;color:#F5A623;font-weight:800;">VENDOR GROWTH</div><h2 style="font-size:21px;margin:5px 0 5px;">Request a promotion ✨</h2><p style="font-size:12px;line-height:1.55;color:var(--mu,#9ca3af);margin:0 0 15px;">Ask MarketLink Admin to feature your shop or products. Your promotion will not go live until the creative, price, payment and dates are confirmed.</p></div><button id="ml-promo-close" type="button" style="width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:transparent;color:var(--tx,#fff);font-size:22px;">×</button></div>'+
      '<form id="ml-promo-form" style="display:grid;gap:11px;">'+
      '<label style="font-size:12px;font-weight:700;">Promotion title<input id="ml-promo-title" required maxlength="120" placeholder="e.g. Weekend rice and grocery offers" style="display:block;width:100%;margin-top:6px;box-sizing:border-box;padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:var(--tx,#fff);"></label>'+
      '<label style="font-size:12px;font-weight:700;">What would you like to promote?<textarea id="ml-promo-description" maxlength="2000" rows="3" placeholder="Tell Admin which products, offer and target customers." style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:var(--tx,#fff);resize:vertical;"></textarea></label>'+
      '<label style="font-size:12px;font-weight:700;">Promotion placement<select id="ml-promo-placement" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.35);background:var(--sf,#111827);color:var(--tx,#fff);"><option value="featured_banner">Featured banner</option><option value="vendor_spotlight">Vendor spotlight</option><option value="search_boost">Promote products in search</option><option value="category_banner">Category banner</option></select></label>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><label style="font-size:12px;font-weight:700;">Duration<select id="ml-promo-duration" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.35);background:var(--sf,#111827);color:var(--tx,#fff);"><option value="1">1 hour</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="336">14 days</option><option value="720">30 days</option></select></label><label style="font-size:12px;font-weight:700;">Suggested budget (D)<input id="ml-promo-budget" type="number" min="0" step="1" value="100" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:12px;border-radius:11px;border:1px solid rgba(148,163,184,.35);background:rgba(255,255,255,.04);color:var(--tx,#fff);"></label></div>'+
      '<label style="font-size:12px;font-weight:700;">Banner image (optional)<input id="ml-promo-banner" type="file" accept="image/jpeg,image/png,image/webp" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border-radius:11px;border:1px dashed rgba(245,166,35,.45);color:var(--tx,#fff);"></label>'+
      '<div style="padding:11px 12px;border-radius:12px;background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.2);font-size:11px;line-height:1.55;color:var(--mu,#cbd5e1);">⭐ Admin reviews your request and confirms the final price. Upload a banner you own or have permission to use. Payment must be confirmed before publication. Submitting this form is a request, not a purchase or a guarantee of placement.</div>'+
      '<button id="ml-promo-submit" type="submit" style="border:0;border-radius:12px;padding:13px;background:linear-gradient(135deg,#F5A623,#FFD778);color:#172033;font-weight:800;">Send request to Admin</button><button id="ml-promo-terms" type="button" style="border:1px solid rgba(148,163,184,.3);border-radius:12px;padding:11px;background:transparent;color:var(--tx,#fff);font-weight:700;">Download promotion terms</button><div id="ml-promo-feedback" role="status" style="font-size:12px;line-height:1.5;"></div></form></section>';
    document.body.appendChild(overlay);
    var close=function(){overlay.remove();};overlay.querySelector('#ml-promo-close').onclick=close;
    overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    overlay.querySelector('#ml-promo-terms').onclick=function(){
      var terms='MarketLink Vendor Promotion Request Terms\n\n1. Submitting a request does not publish or guarantee a promotion.\n2. MarketLink Admin reviews the title, description, creative, placement and requested duration.\n3. Admin confirms the final price, payment method and schedule before payment is due.\n4. A promotion is published only after approval and confirmed payment.\n5. Vendors must own or have permission to use uploaded images and advertising copy.\n6. Misleading claims, prohibited products and counterfeit listings may be rejected.\n7. Keep the request reference and payment receipt for support.\n';
      var a=document.createElement('a');a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(terms);a.download='MarketLink-Promotion-Terms.txt';document.body.appendChild(a);a.click();a.remove();
    };
    overlay.querySelector('#ml-promo-form').onsubmit=async function(e){
      e.preventDefault();var button=overlay.querySelector('#ml-promo-submit'),feedback=overlay.querySelector('#ml-promo-feedback');
      var title=overlay.querySelector('#ml-promo-title').value.trim(),file=overlay.querySelector('#ml-promo-banner').files[0],bannerUrl=null;
      if(!title){feedback.textContent='Please enter a promotion title.';return;}
      button.disabled=true;button.textContent='Sending request…';feedback.textContent='Saving your request securely…';
      try{
        if(file){var uploaded=await ML_API.uploads.upload(file,'banner');bannerUrl=uploaded&&uploaded.url;if(!bannerUrl)throw new Error('The banner upload did not return a saved image URL.');}
        var result=await ML_API.promotions.create({title:title,description:overlay.querySelector('#ml-promo-description').value.trim(),placement:overlay.querySelector('#ml-promo-placement').value,durationHours:Number(overlay.querySelector('#ml-promo-duration').value),requestedBudgetGmd:Number(overlay.querySelector('#ml-promo-budget').value||0),bannerUrl:bannerUrl});
        feedback.textContent='Request submitted. Reference: '+((result.data&&result.data.id)||'saved')+'. Admin will review it and confirm the final price and payment steps.';
        button.textContent='Request sent ✓';button.disabled=true;toast('Promotion request sent to Admin.','success');
      }catch(err){feedback.textContent=(err&&err.error)||err.message||'Could not submit your promotion request. Please try again.';button.disabled=false;button.textContent='Send request to Admin';toast(feedback.textContent,'error');}
    };
  };
  window.vRemovePromo=function(){window.vAddPromo();};
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