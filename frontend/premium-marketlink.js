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
  function livePaymentOptions(capabilities){
    var options=[['Cash on Delivery','cod'],['DAHA Wallet','wallet']];
    if(capabilities&&capabilities.directMobileMoney)options.push(['Wave','wave'],['AfriMoney','afrimoney'],['QMoney','qmoney']);
    else if(capabilities&&capabilities.hostedCheckout)options.push(['Secure mobile-money checkout','modempay']);
    return options;
  }
  function normalizePaymentChoice(label){
    if(label==='Cash on Delivery'||label==='Pay on Delivery')return 'cod';
    if(label==='DAHA Wallet')return 'wallet';
    if(label==='Secure mobile-money checkout')return 'modempay';
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
    {kind:'affiliate',eyebrow:'OFFICIAL MARKETLINK PARTNER PROGRAMME',title:'Become an',accent:'Affiliate Marketer.',body:'Apply with your identity documents. Once approved by MarketLink Admin, access your professional marketer workspace and eligible commission tools.',pill:'ADMIN-APPROVED MARKETER PROGRAMME',image:'./assets/promo-shopping.webp',cta:'Apply as a marketer'},
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
      '<div class="ml-promo-art-stamp"><span>'+(p.kind==='shop'?'🛍️':p.kind==='sell'||p.kind==='promote'?'🏪':'🔗')+'</span><b>'+(p.kind==='affiliate'?'✓':p.kind==='promote'?'🎫':gambiaFlagMarkup())+'</b><small>'+(p.kind==='affiliate'?'MARKETER KYC':p.kind==='sell'?'LOCAL BUSINESS':p.kind==='promote'?'PROMOTION DESK':'MADE FOR THE GAMBIA')+'</small></div>'+
      '<div class="ml-promo-bottom-note">'+(p.kind==='affiliate'?'A separate professional programme. Submit KYC and wait for Admin approval before earning commissions.':p.kind==='sell'?'Real products. Real customers. One connected marketplace.':p.kind==='promote'?'Admin approval and confirmed payment are required before publishing.':'Discover products from local vendors, all in one place.')+'</div></article>';
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
      S.profilePage='affiliate-marketer';if(typeof switchTab==='function')switchTab('profile');else renderPremiumProfile();return;
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
    var needsProviderInstruction=!isComplete&&!isFailed&&!link&&!confirmMode&&!pinMode;
    var providerRecoveryNotice=needsProviderInstruction?'<div class="ml-payment-next-step"><b>Payment instructions are not available yet</b><p>Your order and payment attempt are saved. Do not place another order or pay again. Check payment status; if no secure payment page or phone prompt appears, contact MarketLink support with this order reference.</p></div>':'';
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
       providerRecoveryNotice+
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
    S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';
    S.cart={};CART_ITEMS={};
    updateCartBadge();saveCartToStorage();
    clearPendingPaymentSession();
    switchTab('orders');
    startOrderTracking();
  }
  async function recoverPendingCheckoutPayment(order,payMethod,accountNumber){
    if(!order||!order.id)return false;
    var orderResponse=await ML_API.orders.getById(order.id);
    var latestOrder=orderResponse&&orderResponse.data?orderResponse.data:orderResponse;
    latestOrder=latestOrder&&latestOrder.order?latestOrder.order:latestOrder;
    if(!latestOrder||String(latestOrder.id)!==String(order.id))return false;
    var attempt=latestOrder.payment_attempt;
    if(!attempt||!attempt.id||String(attempt.method||'').toLowerCase()!==String(payMethod||'').toLowerCase())return false;
    var status=String(attempt.status||'').toLowerCase(),nextStep=null,redirectUrl=null,payment=attempt;
    if(status==='failed'||status==='refunded'||status==='partially_refunded')return false;
    if(status==='pending'&&payMethod!=='cod'){
      try{
        var statusResponse=await ML_API.payments.status(attempt.id),statusData=statusResponse&&statusResponse.data?statusResponse.data:statusResponse;
        if(statusData){
          if(statusData.payment)payment=statusData.payment;
          status=String(statusData.status||statusData.payment&&statusData.payment.status||status).toLowerCase();
          nextStep=statusData.nextStep||null;
          redirectUrl=statusData.redirectUrl||null;
        }
      }catch(statusError){}
    }
    S.order=latestOrder;S.orderSI=0;
    if(status==='confirmed'||status==='completed'){
      toast(payMethod==='cod'?'Order placed — Pay on Delivery selected ✓':'Payment confirmed. Your order is updated.','success');
      finishLivePaidOrder();
      return true;
    }
    if(payMethod==='cod'&&status==='pending'){
      toast('Order placed — Pay on Delivery selected ✓','success');
      S.appliedCoupon=null;S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';S.cart={};CART_ITEMS={};updateCartBadge();saveCartToStorage();
      switchTab('orders');startOrderTracking();
      return true;
    }
    if(status!=='pending'&&status!=='processing')return false;
    S.pendingPayment={
      order:latestOrder,payment:payment,method:payMethod,accountNumber:accountNumber||'',
      nextStep:nextStep,redirectUrl:redirectUrl,status:status,
      amount:Number(latestOrder.total||order.total||0),
      cartSnapshot:Object.assign({},S.cart||{}),
      cartItemsSnapshot:Object.assign({},CART_ITEMS||{})
    };
    persistPendingPayment(S.pendingPayment);
    renderLivePaymentStep();
    checkLivePaymentStatus(true);
    return true;
  }

  function checkoutCartPricingFingerprint(productIds){
    var rows=(productIds||[]).map(function(id){
      var product=CART_ITEMS[liveProductId(id)]||CART_ITEMS[id]||{};
      var price=Number(product.price);
      return {
        id:String(liveProductId(id)),
        quantity:Number(S.cart[liveProductId(id)]==null?S.cart[id]||0:S.cart[liveProductId(id)]),
        unitPrice:Number.isFinite(price)?price.toFixed(2):'invalid'
      };
    }).sort(function(a,b){return a.id.localeCompare(b.id);});
    return rows.map(function(row){return row.id+':'+row.quantity+':'+row.unitPrice;}).join(',');
  }

  async function placeLiveOrder(){
    if(!apiOk()){toast('Please sign in before placing an order.','error');return;}
    var ids=Object.keys(S.cart||{});
    if(!ids.length){toast('Your cart is empty.','error');return;}
    var liveItems=await refreshCartMetadata();
    // Product metadata refresh can migrate stale cart keys after an ID change.
    // Rebuild the product list from the refreshed cart before quoting or placing.
    ids=Object.keys(S.cart||{});
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
    var checkoutQuoteFingerprint=checkoutCartPricingFingerprint(ids)+'|coupon:'+String(S.appliedCoupon&&S.appliedCoupon.code||'')+'|affiliate:'+String(S.referredAffiliateCode||'');
    var expectedQuoteKey=vendors[0]+'|'+addressId+'|'+checkoutQuoteFingerprint;
    var quoteCache=S.deliveryQuoteCache||null;
    var chosenQuote=quoteCache&&quoteCache.key===expectedQuoteKey&&Array.isArray(quoteCache.options)
      ?quoteCache.options.find(function(q){return String(q.quoteId)===String(S.selectedDeliveryQuoteId||'');}):null;
    if(!chosenQuote||!chosenQuote.expiresAt||new Date(chosenQuote.expiresAt).getTime()<=Date.now()){
      S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';
      toast('Select a current rider delivery price. MarketLink is refreshing the available prices.','warning');
      renderLiveCart();return;
    }
    var payLabel=S.selPay||'Cash on Delivery',payMethod=normalizePaymentChoice(payLabel);
    var activePaymentCaps=S.paymentCapabilities||{configured:false,directMobileMoney:false,hostedCheckout:false};
    var allowedPayment=livePaymentOptions(activePaymentCaps).some(function(option){return option[1]===payMethod;});
    if(!allowedPayment){toast('Choose an enabled payment method. Refresh the cart if payment options have changed.','warning');return;}
    var accountNumber='';
    if(activePaymentCaps.directMobileMoney&&['wave','afrimoney','qmoney'].indexOf(payMethod)>=0){
      var checkoutPrefix=String(G('ml-checkout-mobile-prefix')&&G('ml-checkout-mobile-prefix').value||'');
      var checkoutSubscriber=String(G('ml-checkout-mobile-number')&&G('ml-checkout-mobile-number').value||'').replace(/\D/g,'');
      if(!['87','83','86'].includes(checkoutPrefix)||checkoutSubscriber.length!==7){toast('Choose your mobile network and enter the 7 digits after its prefix (9 digits total).','error');if(G('ml-checkout-mobile-number'))G('ml-checkout-mobile-number').focus();return;}
      accountNumber=checkoutPrefix+checkoutSubscriber;
    }
    var estimatedSubtotal=ids.reduce(function(total,id){
      var product=CART_ITEMS[id];
      return total+Number(product&&product.price||0)*Number(S.cart[id]||0);
    },0);
    // Wallet preflight is a convenience only; the payment API rechecks the
    // real available balance atomically. Skip it when a coupon may reduce total.
    if(payMethod==='wallet'&&!(S.appliedCoupon&&S.appliedCoupon.code)){
      try{
        var walletResponse=await ML_API.wallet.getBalance();
        var walletData=walletResponse&&walletResponse.data||walletResponse||{};
        var availableWallet=Number(walletData.available_balance==null?walletData.balance||0:walletData.available_balance);
        var expectedDebit=Number(chosenQuote.estimatedCustomerTotal||0);
        if(availableWallet+0.001<expectedDebit){
          toast('Your DAHA Wallet needs a top-up. Your cart and selected rider price are saved.','info');
          setTimeout(function(){openProfilePage('wallet');},200);
          return;
        }
      }catch(walletCheckError){
        toast(walletCheckError.error||'MarketLink could not verify your DAHA balance. Refresh your wallet or choose another payment method.','error');
        return;
      }
    }
    var cartSnapshot=Object.assign({},S.cart||{}),cartItemsSnapshot=Object.assign({},CART_ITEMS||{});
    var payload={vendorId:vendors[0],items:items.map(function(x){return {productId:x.productId,quantity:x.quantity};}),deliveryAddressId:addressId,deliveryFeeQuoteId:chosenQuote.quoteId,paymentMethod:payMethod,couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined};
    var placeBtn=document.querySelector('#cart-body button[data-ml-place-order]');
    var walletPaymentCompleted=false;
    if(placeBtn){placeBtn.disabled=true;placeBtn.textContent='Securing rider price and order…';}
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
      var pendingForThisOrder=Boolean(S.pendingPayment&&S.pendingPayment.order&&String(S.pendingPayment.order.id)===String(order&&order.id));
      if(order&&!walletPaymentCompleted&&!pendingForThisOrder){
        try{
          if(await recoverPendingCheckoutPayment(order,payMethod,accountNumber))return;
        }catch(recoveryError){}
      }
      var cancellationError=null;
      if(order&&!walletPaymentCompleted&&!pendingForThisOrder){
        try{await ML_API.orders.cancel(order.id,'Payment could not be completed; order cancelled and stock released.');}
        catch(cancelError){cancellationError=cancelError;}
      }
      if(cancellationError&&cancellationError.code==='PAYMENT_ATTEMPT_PENDING'){
        try{
          if(await recoverPendingCheckoutPayment(order,payMethod,accountNumber))return;
        }catch(recoveryError){}
        if(placeBtn){placeBtn.disabled=false;placeBtn.textContent='Place Order';}
        S.order=order;switchTab('orders');startOrderTracking();
        toast('A payment attempt is still processing for this order. Do not place another order; check its status in My Orders.','warning');
        return;
      }
      if(placeBtn){placeBtn.disabled=false;placeBtn.textContent='Place Order';}
      if(e&&['CHECKOUT_QUOTE_REFRESH_REQUIRED','CHECKOUT_PRICING_SETTINGS_CHANGED','CHECKOUT_TOTAL_CHANGED'].indexOf(e.code)>=0){
        S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';
        toast('Checkout prices changed. MarketLink is refreshing the rider prices and all-in total; review it before continuing.','warning');
        renderLiveCart();return;
      }
      toast(e.error||'Could not place your order.','error');
      if(payMethod==='wallet'&&e&&e.code==='INSUFFICIENT_WALLET_BALANCE'){
        S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';
        toast('Your wallet balance changed before payment. Your cart is saved; top up DAHA Wallet and refresh rider prices when you return.','warning');
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
    if(operatorEl&&nationalEl){
      var national=String(nationalEl.value||'').replace(/\D/g,'');
      var networkRules={
        AFRICELL:{prefix:'87',legacy:/^(2|7|40|41)/},
        QCELL:{prefix:'83',legacy:/^(3|5)/},
        COMIUM:{prefix:'86',legacy:/^(6|8)/},
        GAMCEL:{prefix:'',legacy:/^(?:9\d{6}|9\d{8})$/},
        OTHER:{prefix:'',legacy:/^\d{9}$/}
      };
      var networkRule=networkRules[operatorEl.value];
      var expectedLength=operatorEl.value==='GAMCEL'?(national.length===7?7:9):(operatorEl.value==='OTHER'?9:7);
      if(national.length!==expectedLength){adminAuthErr((operatorEl.value==='GAMCEL'||operatorEl.value==='OTHER')?'Enter the full 9-digit Gambian number.':'Enter the 7 subscriber digits after the selected network prefix.');nationalEl.focus();return;}
      if(!networkRule||!networkRule.legacy.test(national)){adminAuthErr('The number does not match the selected network. Check the number and network, then try again.');nationalEl.focus();return;}
      phone=networkRule.prefix+national;
      if(idEl)idEl.value=phone;
    }
    if(!phone||!pin){adminAuthErr('Enter your admin phone number and 4-digit PIN');return;}
    var gamcelLegacy=Boolean(operatorEl&&operatorEl.value==='GAMCEL');
    if(gamcelLegacy?!/^(?:9\d{6}|9\d{8})$/.test(phone):!/^\d{9}$/.test(phone)){adminAuthErr('Check your Gambian mobile number and selected network.');return;}
    if(!/^\d{4}$/.test(pin)){adminAuthErr('Enter your 4-digit security PIN.');return;}
    window.__ML_ADMIN_LOGIN_IN_FLIGHT=true;
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Signing in…';}
    try{
      adminAuthErr('');
      // Wake and verify the production API before sending credentials.
      // This separates a sleeping/unreachable backend from an auth failure.
      var apiBase=String(window.ML_API_URL||'https://marketlink-gambia.onrender.com'); while(apiBase.endsWith('/'))apiBase=apiBase.slice(0,-1);
      var healthController=typeof AbortController==='function'?new AbortController():null;
      var healthTimer=null,healthDeadlineTimer=null;
      try{
        adminAuthErr('Waking the MarketLink server and checking the secure connection…');
        var healthDeadline=new Promise(function(_,reject){
          healthDeadlineTimer=window.setTimeout(function(){
            if(healthController)healthController.abort();
            reject(new Error('The MarketLink server did not become ready within 120 seconds. Please retry.'));
          },120000);
        });
        if(healthController)healthTimer=window.setTimeout(function(){healthController.abort();},120000);
        var healthResponse=await Promise.race([
          fetch(apiBase+'/health',{method:'GET',cache:'no-store',signal:healthController?healthController.signal:undefined}),
          healthDeadline
        ]);
        if(!healthResponse.ok)throw new Error('The MarketLink server health check failed (HTTP '+healthResponse.status+'). Please retry.');
      }catch(healthError){
        throw {error:healthError&&healthError.message||'Could not connect to the MarketLink server. Check your connection and retry.'};
      }finally{
        if(healthTimer!==null)window.clearTimeout(healthTimer);
        if(healthDeadlineTimer!==null)window.clearTimeout(healthDeadlineTimer);
      }
      adminAuthErr('Server connected. Verifying your administrator account…');
      var loginResponse=await ML_API.auth.login(phone,pin);
      if(loginResponse&&loginResponse.requiresTwoFactor){
        var challengeCode=window.prompt('MarketLink Admin two-factor is enabled. Enter the current 6-digit code from your authenticator app:');
        if(challengeCode===null)throw {error:'Authenticator verification cancelled. No Admin session was created.'};
        challengeCode=String(challengeCode||'').replace(/\\s/g,'');
        if(!/^\\d{6}$/.test(challengeCode))throw {error:'Enter the 6-digit authenticator code to finish Admin sign-in.'};
        loginResponse=await ML_API.auth.verifyAdminTwoFactor(loginResponse.challengeToken,challengeCode);
      }

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
      // Hydrate the shared application session before routing. The legacy
      // Admin login did this; the premium login previously omitted it, leaving
      // S.user/S.roles empty even though the backend had issued valid tokens.
      // Admin workspace guards and dashboard APIs rely on this in-memory state.
      if (typeof S !== 'undefined') {
        S.user = user;
        S.roles = roles;
        S.profileName = user.fullName || user.full_name || user.name || '';
        S.profilePhone = user.phone || phone;
      }
      adminAuthErr('Administrator verified. Opening the premium Admin dashboard…');
      // Keep the transition independent from the shared customer showScreen
      // helper: that helper can contain customer-only routing/scroll locks.
      if(window.AdminSession&&typeof window.AdminSession.start==='function')window.AdminSession.start(user.id||phone);
      var appScreen=G('scr-app'),appRoot=G('app'),adminLoginScreen=G('scr-admin-login');
      if(appRoot){
        appRoot.style.setProperty('height','auto','important');
        appRoot.style.setProperty('min-height','100dvh','important');
        appRoot.style.setProperty('max-height','none','important');
        appRoot.style.setProperty('overflow','visible','important');
      }
      if(appScreen){
        appScreen.classList.add('active');
        appScreen.style.setProperty('display','block','important');
        appScreen.style.setProperty('visibility','visible','important');
        appScreen.style.setProperty('pointer-events','auto','important');
        appScreen.style.setProperty('position','relative','important');
        appScreen.style.setProperty('inset','auto','important');
        appScreen.style.setProperty('height','auto','important');
        appScreen.style.setProperty('min-height','100dvh','important');
        appScreen.style.setProperty('max-height','none','important');
        appScreen.style.setProperty('overflow','visible','important');
        appScreen.removeAttribute('aria-hidden');
      }
      if(adminLoginScreen){
        adminLoginScreen.classList.remove('active');
        adminLoginScreen.style.setProperty('display','none','important');
        adminLoginScreen.style.setProperty('visibility','hidden','important');
        adminLoginScreen.style.setProperty('pointer-events','none','important');
        adminLoginScreen.setAttribute('aria-hidden','true');
      }
      if(document.documentElement){
        document.documentElement.style.setProperty('height','auto','important');
        document.documentElement.style.setProperty('overflow-y','auto','important');
        document.documentElement.style.setProperty('touch-action','pan-y','important');
      }
      if(document.body){
        document.body.style.setProperty('height','auto','important');
        document.body.style.setProperty('overflow-y','auto','important');
        document.body.style.setProperty('touch-action','pan-y','important');
      }
      var bottomNav=G('bnav'),floatingAction=G('fab');
      if(bottomNav)bottomNav.style.display='none';
      if(floatingAction)floatingAction.classList.remove('fab-visible');
      // This tab renderer is the premium MarketLink Admin control center.
      try{switchTab('admindash');}
      catch(routeError){
        console.error('[MarketLink Admin] Premium dashboard route failed:',routeError);
        var dashboardTab=G('tab-admindash');
        if(dashboardTab)dashboardTab.style.display='block';
        loadAdminDashboard();
      }
      if(typeof toast==='function')toast('Welcome to the Admin Portal ✓');
    }catch(e){
      adminAuthErr(e&&(e.error||e.message)||'Admin sign-in failed. Please try again.');
    }finally{
      window.__ML_ADMIN_LOGIN_IN_FLIGHT=false;
      if(button){
        button.disabled=false;
        button.removeAttribute('aria-busy');
        button.textContent=originalButtonText||'Sign in securely';
      }
    }
  }
  async function loadAdminDashboard(){
    var root=G('adash-body');
    if(!root)return;
    if(!apiOk()){
      root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>Admin session required</b><span>Sign in again to load the live control center.</span></div></div>';
      toast('Admin session requires backend sign-in.','error');
      return;
    }
    var loadToken=String(Date.now())+'-'+String(Math.random()).slice(2);
    root.setAttribute('data-admin-load-token',loadToken);
    root.innerHTML='<div class="ml-premium-home"><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Opening Admin control center…</div><div class="ml-hero-sub">Your account is authenticated. Loading live platform information.</div><div class="ml-loading" role="status" aria-live="polite">Connecting to production records…</div></div>';
    try{
      // The core dashboard is the critical path. Render it as soon as its
      // authenticated metrics arrive; optional COD/remittance queues must not
      // hold the entire Admin portal behind secondary requests.
      var r=await ML_API.admin.dashboard(),d=r.data||{},s=d.stats||{},p=d.pendingApprovals||{};
      var orders=Array.isArray(d.recentOrders)?d.recentOrders:[],vendors=Array.isArray(d.topVendors)?d.topVendors:[];
      root.innerHTML='<div class="ml-premium-home ml-admin-overview" style="padding-top:18px"><div class="ml-home-top ml-admin-hero-panel"><div class="ml-admin-hero-copy"><div class="ml-eyebrow">MarketLink Operations</div><div class="ml-hero-title">Admin control center</div><div class="ml-hero-sub">Your live marketplace at a glance. Manage people, orders and money from one secure workspace.</div><div class="ml-admin-hero-status"><span class="ml-live-dot">Backend connected</span><span class="ml-admin-secure-label">🔒 Secure production data</span></div><button class="ml-btn ml-btn-secondary ml-admin-promo-button" onclick="window.ML_Premium.reviewPromotions()">🎫 Promotion requests</button></div><div class="ml-admin-hero-art" aria-hidden="true"><svg viewBox="0 0 260 190"><defs><linearGradient id="mlAdminScreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8fbff"/><stop offset="1" stop-color="#9bdedb"/></linearGradient><linearGradient id="mlAdminGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd77d"/><stop offset="1" stop-color="#d89a2e"/></linearGradient></defs><circle cx="135" cy="88" r="76" fill="#fff" opacity=".07"/><circle cx="215" cy="35" r="18" fill="#f6c65e" opacity=".22"/><rect x="45" y="22" width="150" height="105" rx="12" fill="#092638" stroke="#b7e7e4" stroke-width="3"/><rect x="54" y="31" width="132" height="87" rx="7" fill="url(#mlAdminScreen)"/><rect x="64" y="42" width="42" height="8" rx="4" fill="#176c72"/><rect x="64" y="58" width="52" height="44" rx="5" fill="#fff"/><path d="M70 92V82l9-8 8 5 12-15 11 10" fill="none" stroke="#15958b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="122" y="58" width="54" height="8" rx="4" fill="#b8d5d9"/><rect x="122" y="73" width="43" height="7" rx="3.5" fill="#d0e3e5"/><rect x="122" y="87" width="49" height="7" rx="3.5" fill="#d0e3e5"/><path d="M31 130h178l18 15q3 5-6 5H18q-8 0-5-5z" fill="url(#mlAdminGold)"/><rect x="99" y="132" width="43" height="4" rx="2" fill="#9b681d"/><circle cx="209" cy="120" r="24" fill="#0c4955" stroke="#7ce1d5" stroke-width="2"/><path d="M198 120l8 8 15-18" fill="none" stroke="#8df0d9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="17" y="16" width="32" height="32" rx="10" fill="#f7c75e"/><path d="M26 32l5 5 10-12" fill="none" stroke="#18394a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="ml-admin-art-caption">MARKETPLACE OPERATIONS</div></div></div>'+'<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Active customers</div><div class="ml-stat-value">'+Number(s.activeCustomers||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Approved vendors</div><div class="ml-stat-value">'+Number(s.approvedVendors||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Online riders</div><div class="ml-stat-value">'+Number(s.onlineRiders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">30d GMV</div><div class="ml-stat-value">'+money(s.revenue30d||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Net commission before costs (30d)</div><div class="ml-stat-value">'+money(s.platformNetRevenue30d||0)+'</div></div></div>'+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>Vendor approvals</strong><span>'+Number(p.pending_vendors||0)+' pending applications require review.</span><button class="ml-btn ml-btn-secondary" style="margin-top:9px" onclick="window.ML_Premium.adminApprovals(\'vendor\')">Review vendors</button></div><div class="ml-promo"><strong>Rider approvals</strong><span>'+Number(p.pending_riders||0)+' pending applications require review.</span><button class="ml-btn ml-btn-secondary" style="margin-top:9px" onclick="window.ML_Premium.adminApprovals(\'rider\')">Review riders</button></div><div class="ml-promo"><strong>Support</strong><span>'+Number(p.open_tickets||0)+' open support tickets in the production database.</span></div></div>'+
      '<div class="ml-section-head"><h3>Financial reconciliation</h3><button onclick="window.ML_Premium.refreshFinancialReconciliation()">Open live audit</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 14px;padding:12px;border-radius:12px">Read-only checks for settlement gaps, missing wallet credits, duplicate references, payout exceptions and wallet/ledger differences.</div>'+
      '<div class="ml-section-head"><h3>Recent orders</h3><button onclick="window.ML_Premium.adminRefresh()">Refresh</button></div>'+
      (orders.length?'<div class="ml-profile-card">'+orders.map(function(o){return '<div class="ml-profile-row"><div class="ico">🛒</div><div class="copy"><b>'+esc(o.order_number||o.id)+'</b><span>'+esc(o.customer_name||'Customer')+' · '+esc(o.vendor_name||'Vendor')+' · '+money(o.total||0)+'</span></div><span style="font-size:10px;color:#42D2C9">'+esc(o.status||'')+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No orders yet</b><span>The production database currently has no recent orders.</span></div>')+
      '<div id="ml-admin-cod-queue"><div class="ml-section-head"><h3>Pay on Delivery reconciliation</h3></div><div class="ml-loading">Loading COD reconciliation separately…</div></div>'+
      '<div id="ml-admin-remittance-queue"><div class="ml-section-head"><h3>Rider cash deposit verification</h3></div><div class="ml-loading">Loading rider deposits separately…</div></div>'+
      '<div class="ml-section-head"><h3>Top vendors</h3></div>'+
      (vendors.length?'<div class="ml-profile-card">'+vendors.map(function(v){return '<div class="ml-profile-row"><div class="ico">🏪</div><div class="copy"><b>'+esc(v.business_name||'Vendor')+'</b><span>'+Number(v.total_sales||0)+' sales · '+money(v.total_revenue||0)+'</span></div><span style="color:#FFD778">★ '+Number(v.rating_avg||0).toFixed(1)+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No approved vendors yet</b><span>Vendor performance will appear here after real vendors are approved.</span></div>')+
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="ml-btn ml-btn-secondary" style="flex:1" onclick="window.ML_Premium.adminUsers()">Users</button><button class="ml-btn ml-btn-secondary" style="flex:1" onclick="adminLogout()">Sign out</button></div></div>';
      // Fire-and-render: this work is deliberately not awaited by sign-in or
      // the main dashboard. A slow optional endpoint cannot block navigation.
      loadAdminFinancialQueues(root,loadToken);
    }catch(e){
      var message=e&&(e.error||e.message)||'Could not load the Admin dashboard.';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>Admin dashboard could not finish loading</b><span>'+esc(message)+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.adminRefresh()">Retry dashboard</button></div></div>';
      toast(message,'error');
    }
  }
  async function loadAdminFinancialQueues(root,loadToken){
    var codSlot=G('ml-admin-cod-queue'),remitSlot=G('ml-admin-remittance-queue');
    if(!codSlot||!remitSlot)return;
    var results=await Promise.all([
      ML_API.payments.pendingCod({page:1,limit:30}).then(function(response){return {kind:'cod',data:response&&response.data};}).catch(function(error){return {kind:'cod-error',error:error};}),
      ML_API.payments.codRemittances({page:1,limit:50,status:'submitted'}).then(function(response){return {kind:'remittance',data:response&&response.data};}).catch(function(error){return {kind:'remittance-error',error:error};})
    ]);
    if(!root||root.getAttribute('data-admin-load-token')!==loadToken)return;
    var cod=results[0],remit=results[1];
    var codPayments=cod.kind==='cod'?normalizeProducts(cod.data):[];
    var codRemittances=remit.kind==='remittance'?normalizeProducts(remit.data):[];
    var codError=cod.kind==='cod-error'?(cod.error&&(cod.error.error||cod.error.message)||'The COD payment queue could not be loaded.'):'';
    var remitError=remit.kind==='remittance-error'?(remit.error&&(remit.error.error||remit.error.message)||'The rider cash deposit queue could not be loaded.'):'';
    codSlot=G('ml-admin-cod-queue');remitSlot=G('ml-admin-remittance-queue');
    if(codSlot)codSlot.innerHTML='<div class="ml-section-head"><h3>Pay on Delivery reconciliation</h3><button onclick="window.ML_Premium.adminRefresh()">Refresh</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 12px;padding:12px;border-radius:12px">Only confirm cash after an Admin has verified that the rider/vendor handed over the collected amount. This queue includes delivered orders only; wallet settlement remains blocked until payment is confirmed.</div>'+
      (codError?'<div class="ml-empty"><b>COD payment queue unavailable</b><span>'+esc(codError)+'</span></div>':(codPayments.length?'<div class="ml-profile-card">'+codPayments.map(function(c){
        var paymentId=esc(c.payment_id||''),paymentState=String(c.payment_record_status||'pending').toLowerCase(),alreadyConfirmed=paymentState==='confirmed';
        var remittanceStatus=String(c.remittance_status||'').toLowerCase(),remittanceVerified=remittanceStatus==='verified';
        var riderLabel=c.rider_name||'Rider not assigned';
        var actionLabel=remittanceVerified?(alreadyConfirmed?'Retry wallet settlement':'Complete payment confirmation'):remittanceStatus==='submitted'?'Deposit submitted · Review above':remittanceStatus==='rejected'?'Deposit rejected · Rider must resubmit':'Awaiting rider deposit';
        var stateLabel=alreadyConfirmed?'Cash confirmed · settlement needs retry':remittanceVerified?'Deposit verified · payment confirmation pending':remittanceStatus==='submitted'?'Rider deposit submitted · Admin verification pending':remittanceStatus==='rejected'?'Previous deposit reference rejected':'Delivered · waiting for rider deposit';
        var action=alreadyConfirmed?'window.ML_Premium.confirmCodPayment(&quot;'+paymentId+'&quot;,&quot;'+paymentState+'&quot;)':'window.ML_Premium.reviewCodRemittance(&quot;'+esc(c.remittance_id||'')+'&quot;,\'verified\')';
        return '<div class="ml-profile-row"><div class="ico">💵</div><div class="copy"><b>'+esc(c.order_number||c.order_id||'COD order')+' · '+money(c.amount||c.total||0)+'</b><span>'+esc(c.customer_name||'Customer')+' → '+esc(c.vendor_name||'Vendor')+' · '+esc(riderLabel)+'</span><small>'+stateLabel+'</small></div>'+(remittanceVerified?'<button type="button" class="ml-btn ml-btn-primary" style="font-size:10px;padding:8px 10px" onclick="'+action+'">'+actionLabel+'</button>':'<span style="font-size:10px;color:#B8C8D2">'+actionLabel+'</span>')+'</div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No delivered COD payments awaiting confirmation</b><span>New cash-on-delivery orders will appear here after delivery is marked complete.</span></div>'));
    if(remitSlot)remitSlot.innerHTML='<div class="ml-section-head"><h3>Rider cash deposit verification</h3><button onclick="window.ML_Premium.adminRefresh()">Refresh</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 12px;padding:12px;border-radius:12px">Compare each submitted receipt reference against the official MarketLink Wave or AfriMoney collection account statement before verifying. Verification confirms the payment and starts the existing order settlement.</div>'+
      (remitError?'<div class="ml-empty"><b>Cash deposit queue unavailable</b><span>'+esc(remitError)+'</span></div>':(codRemittances.length?'<div class="ml-profile-card">'+codRemittances.map(function(r){
        var proof=r.proof_url?'<button type="button" class="ml-btn ml-btn-secondary" style="font-size:10px;padding:5px 8px;margin-top:4px" onclick="window.ML_Premium.viewApplicationDocument(&quot;'+esc(r.proof_url)+'&quot;,&quot;COD deposit receipt&quot;)">View receipt ↗</button>':'<span>Receipt not attached</span>';
        return '<div class="ml-profile-row"><div class="ico">🏦</div><div class="copy"><b>'+esc(r.order_number||r.order_id)+' · '+money(r.amount||0)+'</b><span>'+esc(r.rider_name||'Rider')+' · '+esc(String(r.deposit_method||'wave').toUpperCase())+' · Ref: '+esc(r.provider_reference||'—')+'</span><small>'+esc(r.vendor_name||'Vendor')+' · '+esc(r.status||'submitted')+' · '+proof+'</small></div><div style="display:flex;flex-direction:column;gap:6px"><button type="button" class="ml-btn ml-btn-primary" style="font-size:10px;padding:7px" onclick="window.ML_Premium.reviewCodRemittance(\''+esc(r.id)+'\',\'verified\')">Verify deposit</button><button type="button" class="ml-btn ml-btn-secondary" style="font-size:10px;padding:7px" onclick="window.ML_Premium.reviewCodRemittance(\''+esc(r.id)+'\',\'rejected\')">Reject</button></div></div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No rider cash deposits awaiting verification</b><span>Submitted Wave or AfriMoney references will appear here after riders complete cash-on-delivery jobs.</span></div>'));
  }
  async function confirmCodPayment(paymentId,paymentState){
    if(!apiOk()){toast('Admin session required.','error');return;}
    if(!paymentId){toast('The COD payment reference is missing.','error');return;}
    var retry=String(paymentState||'pending').toLowerCase()==='confirmed';
    if(!retry){toast('This payment cannot be confirmed directly. Ask the assigned rider to submit the Wave or AfriMoney deposit reference, then verify it in the cash deposit desk.','warning');return;}
    var question=retry
      ?'This COD payment is already marked as cash received. Retry the outstanding wallet settlement for this delivered order?'
      :'Confirm that the collected cash for this delivered order has been received and reconciled? This will mark the COD payment as paid and may release the vendor/rider/affiliate settlement.';
    if(!window.confirm(question))return;
    try{
      var response=await ML_API.payments.confirm(paymentId);
      var data=response&&response.data||response||{};
      var settlement=data.settlement||null;
      if(settlement&&settlement.settled===false){
        toast('Cash confirmation is saved, but wallet settlement is still pending: '+String(settlement.reason||'Review required')+'.','warning');
      }else{
        toast(retry?'COD wallet settlement retry completed.':'COD cash recorded and eligible wallet settlement completed.','success');
      }
      await loadAdminDashboard();
    }catch(e){
      toast(e.error||'Could not confirm or settle this COD payment. Review the settlement record before retrying.','error');
      await loadAdminDashboard();
    }
  }


  async function reviewCodRemittance(remittanceId,decision){
    if(!apiOk()){toast('Admin sign-in required.','error');return;}
    if(!remittanceId||!['verified','rejected'].includes(decision)){toast('Invalid cash remittance action.','error');return;}
    var note='';
    if(decision==='verified'){
      if(!window.confirm('Have you matched this exact receipt reference and amount against the official MarketLink Wave or AfriMoney account statement? Only verify after the deposit is visible in the company account.'))return;
    }else{
      note=window.prompt('Enter the reason for rejecting this deposit reference:','Reference not found in collection account statement');
      if(note===null)return;
      if(!String(note).trim()){toast('A rejection reason is required.','error');return;}
    }
    var pin=window.prompt('Enter your 4-digit MarketLink Admin PIN to '+(decision==='verified'?'approve':'reject')+' this remittance:');
    if(pin===null)return;
    pin=String(pin||'').trim();
    if(!/^\d{4}$/.test(pin)){toast('A valid 4-digit Admin PIN is required. No decision was submitted.','error');return;}
    try{
      var response=await ML_API.payments.reviewCodRemittance(remittanceId,decision,note,pin),data=response&&response.data||response||{};
      var settlement=data.settlement;
      if(decision==='verified'&&settlement&&settlement.settled===false){
        toast('Deposit verified, but order settlement needs Admin review: '+String(settlement.reason||'Settlement pending')+'.','warning');
      }else if(decision==='verified'){
        toast('Deposit verified. Vendor, rider, affiliate and platform settlement processed through DAHA.','success');
      }else{
        toast('Cash remittance rejected. The rider can review the note and submit a corrected reference.','success');
      }
      await loadAdminDashboard();
    }catch(e){
      toast(e.error||e.message||'Could not review this cash deposit.','error');
      await loadAdminDashboard();
    }
  }

  async function viewApplicationDocument(url,label){
    if(!apiOk()){toast('Please sign in as an administrator to view application documents.','error');return;}
    if(!url){toast('No document was uploaded for this application.','warning');return;}
    var token=ML_API.getAccessToken&&ML_API.getAccessToken();
    if(!token){toast('Your session has expired. Sign in again to view this document.','error');return;}
    try{
      var response=await fetch(url,{headers:{Authorization:'Bearer '+token}});
      if(!response.ok){var data={};try{data=await response.json();}catch(e){}throw new Error(data.error||('Document request failed ('+response.status+').'));}
      var blob=await response.blob(),objectUrl=URL.createObjectURL(blob);
      var tab=window.open(objectUrl,'_blank','noopener,noreferrer');
      if(!tab){var link=document.createElement('a');link.href=objectUrl;link.download=(label||'MarketLink-application-document');document.body.appendChild(link);link.click();link.remove();}
      setTimeout(function(){try{URL.revokeObjectURL(objectUrl);}catch(e){}},120000);
    }catch(e){toast(e.message||'Could not open the application document.','error');}
  }

  async function adminApprovals(kind){
    var root=G('adash-body');
    if(!root)return;
    if(kind!=='vendor'&&kind!=='rider'){toast('Unknown application type.','error');return;}
    var label=kind==='vendor'?'vendor':'rider';
    root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Pending '+label+' applications</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div><div class="ml-loading">Refreshing applications from the production database…</div></div>';
    try{
      var r=kind==='vendor'
        ?await ML_API.vendors.adminApplications({page:1,limit:50,kycStatus:'pending'})
        :await ML_API.riders.adminApplications({page:1,limit:50,kycStatus:'pending'});
      var rows=normalizeProducts(r.data);
      function field(label,value){
        return value!==null&&value!==undefined&&String(value).trim()!==''?'<div style="display:flex;gap:9px;padding:5px 0;border-bottom:1px solid rgba(148,163,184,.12);"><b style="flex:0 0 106px;color:#8da2b0;font-size:10px;">'+esc(label)+'</b><span style="min-width:0;overflow-wrap:anywhere;color:#e8f0f4;font-size:11px;">'+esc(value)+'</span></div>':'';
      }
      function doc(label,url){
        return url?'<button type="button" class="ml-btn ml-btn-secondary" style="font-size:10px;padding:8px 10px;margin:4px 5px 0 0;" onclick="window.ML_Premium.viewApplicationDocument(&quot;'+esc(url)+'&quot;,&quot;'+esc(label)+'&quot;)">View '+esc(label)+'</button>':'';
      }
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><h3>Pending '+label+' applications</h3><span style="display:block;color:#91a4b4;font-size:11px;margin-top:4px">'+rows.length+' pending · refreshed '+esc(new Date().toLocaleTimeString())+'</span></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.adminApprovals(\''+kind+'\')">↻ Refresh applications</button><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div></div>'+
      (rows.length?'<div style="display:grid;gap:12px;">'+rows.map(function(a){
        var id=a.user_id||a.id,name=a.owner_name||a.full_name||'Applicant';
        var title=kind==='vendor'?(a.business_name||'Vendor application'):name;
        var logo=kind==='vendor'?(a.logo_url||a.shop_photo_url||''):(a.profile_photo_url||a.vehicle_photo_url||'');
        var image=logo?'<img src="'+esc(logo)+'" alt="" style="width:62px;height:62px;object-fit:cover;border-radius:12px;border:1px solid rgba(148,163,184,.2);background:#fff;">':'<div class="ico">'+(kind==='vendor'?'🏪':'🛵')+'</div>';
        var details=kind==='vendor'
          ?field('Owner',name)+field('Account phone',a.owner_phone||'')+field('Account email',a.owner_email||'')+field('Business name',a.business_name)+field('Shop phone',a.business_phone||'')+field('Business email',a.business_email||'')+field('Category',a.business_category)+field('Marketplace group',a.business_category_group)+field('WhatsApp',a.whatsapp_number)+field('Address',a.business_address)+field('GPS',a.latitude!=null&&a.longitude!=null?a.latitude+', '+a.longitude:'')+field('Description',a.description)
          :field('Full name',name)+field('Phone',a.phone||a.mobile_number||'')+field('Email',a.email)+field('Residential address',a.address)+field('Emergency contact',a.emergency_contact)+field('WhatsApp',a.whatsapp_number)+field('GPS',a.current_lat!=null&&a.current_lng!=null?a.current_lat+', '+a.current_lng:'')+field('Vehicle type',a.vehicle_type)+field('Plate number',a.plate_number)+field('Licence number',a.license_number)+field('Delivery zone',a.delivery_zone);
        var docs=kind==='vendor'
          ?doc('National ID / Passport',a.id_document_url)+doc('Shop photo',a.shop_photo_url)
          :doc('National ID / Passport',a.id_document_url)+doc('Driver licence',a.license_document_url)+doc('Rider profile photo',a.profile_photo_url)+doc('Vehicle photo',a.vehicle_photo_url);
        return '<article class="ml-profile-card" style="padding:14px;"><div style="display:flex;align-items:center;gap:11px;margin-bottom:10px;">'+image+'<div style="min-width:0;flex:1;"><b style="color:#f6fafb;font-size:14px;">'+esc(title)+'</b><div style="color:#91a4b4;font-size:10px;margin-top:4px;">KYC: '+esc(a.kyc_status||'pending')+' · Submitted '+esc(a.created_at?new Date(a.created_at).toLocaleString():'date unavailable')+' · ID '+esc(id)+'</div></div></div>'+details+'<div style="margin-top:8px;">'+docs+'</div><div style="display:flex;gap:9px;margin-top:12px;"><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.approve(&quot;'+esc(id)+'&quot;,&quot;'+esc(kind)+'&quot;)">Approve</button><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.rejectApplication(&quot;'+esc(id)+'&quot;,&quot;'+esc(kind)+'&quot;)">Reject</button></div></article>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No pending applications</b><span>The live database currently returned no pending '+label+' applications. Use Refresh applications to check again.</span></div>')+'</div>';
    }catch(e){
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Pending '+label+' applications</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div><div class="ml-empty"><b>Could not load applications</b><span>'+esc(e.error||e.message||'The application service is temporarily unavailable.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.adminApprovals(\''+kind+'\')">Retry applications</button></div></div>';
      toast(e.error||e.message||'Could not load applications.','error');
    }
  }

  async function rejectApplication(id,kind){
    var reason=prompt('Enter the reason for rejecting this application:');
    if(!reason||!reason.trim())return;
    try{
      if(kind==='vendor')await ML_API.vendors.reject(id,{reason:reason.trim()});
      else await ML_API.riders.reject(id,{reason:reason.trim()});
      toast('Application rejected.','success');await adminApprovals(kind);
    }catch(e){toast(e.error||e.message||'Could not reject this application.','error');}
  }
  async function approveAdmin(id,kind){
    try{
      if(kind==='vendor')await ML_API.vendors.approve(id,{notes:'Approved from MarketLink Admin Control Center'});
      else await ML_API.riders.approve(id,{notes:'Approved from MarketLink Admin Control Center'});
      toast('Application approved ✓');
      await adminApprovals(kind);
    }catch(e){toast(e.error||'Approval failed.','error');}
  }
  async function adminUsers(){
    try{
      var r=await ML_API.admin.users({page:1,limit:50}),d=r.data||{},rows=d.items||[],root=G('adash-body');
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Users</h3><button onclick="window.ML_Premium.adminRefresh()">← Dashboard</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(u){return '<div class="ml-profile-row"><div class="ico">👤</div><div class="copy"><b>'+esc(u.full_name||'User')+'</b><span>'+esc(u.phone||'')+' · '+esc((u.roles||[]).join(', '))+'</span></div><span style="font-size:10px;color:'+(u.status==='active'?'#42D2C9':'#FF8C75')+'">'+esc(u.status||'')+'</span></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No users found</b><span>The production database has no matching users.</span></div>')+'</div>';
    }catch(e){toast(e.error||'Could not load users.','error');}
  }
  async function loadLiveHome(){
    // Paint the real premium marketplace immediately. Never make the entire
    // customer homepage wait for six independent API requests to finish.
    if(!apiOk()){
      liveProducts=[];liveCategories=[];liveProfile=null;liveWallet=null;
      renderPremiumHome();
      return;
    }
    renderPremiumHome();
    var dataRequest=Promise.all([
      ML_API.products.list({page:1,limit:16,sort:'newest'}),
      ML_API.categories.getTree(),
      ML_API.customers.getProfile(),
      ML_API.customers.getOrderHistory?ML_API.customers.getOrderHistory({page:1,limit:5}):ML_API.customers.getOrders({page:1,limit:5}),
      ML_API.customers.getWallet().catch(function(){return {data:null};}),
      ML_API.customers.getNotifications({page:1,limit:6,unreadOnly:false}).catch(function(){return {data:[]};})
    ].map(function(p){return Promise.resolve(p).catch(function(error){console.warn('[MarketLink] A homepage data request failed:',error);return {data:null};});})).then(function(results){
      liveProducts=normalizeProducts(results[0].data);
      liveCategories=Array.isArray(results[1].data)?results[1].data:[];
      liveProfile=results[2].data||null;
      liveOrders=results[3].data||null;
      liveWallet=results[4].data||null;
      liveNotifications=normalizeProducts(results[5].data);
      if(liveProfile){
        S.profileName=liveProfile.full_name||S.profileName||'';
        S.profilePhone=liveProfile.phone||S.profilePhone||'';
        S.profilePhoto=liveProfile.profile_photo_url||null;
        try{
          if(S.profilePhoto){
            localStorage.setItem('ml_profile_photo_url',S.profilePhoto);
            var previewUrl=localStorage.getItem('ml_profile_photo_preview_url');
            if(previewUrl&&previewUrl!==S.profilePhoto){
              localStorage.removeItem('ml_profile_photo_preview');
              localStorage.removeItem('ml_profile_photo_preview_url');
            }
          }else{
            localStorage.removeItem('ml_profile_photo_url');
            localStorage.removeItem('ml_profile_photo_preview');
            localStorage.removeItem('ml_profile_photo_preview_url');
          }
        }catch(photoStorageError){}
        if(S.user){S.user.profilePhotoUrl=S.profilePhoto;S.user.avatarUrl=S.profilePhoto;}
        S.walletBalance=Number(liveProfile.wallet_balance||0);
        S.rewardPoints=Number(liveProfile.reward_points||0);
      }
      renderPremiumHome();
    }).catch(function(error){
      console.error('[MarketLink] Premium homepage data refresh failed:',error);
    });
    // Bound startup wait even if the API or network never settles. The first
    // premium paint remains usable; late responses update it when available.
    await Promise.race([dataRequest,new Promise(function(resolve){setTimeout(resolve,7000);})]);
  }
  function isMarketLinkRole(role){return (S.roles||[]).some(function(r){return String(r).toLowerCase()===String(role).toLowerCase();});}
  function roleCtaSectionMarkup(){
    return '<section class="ml-role-cta-section"><div class="ml-role-cta-heading"><div><h3>Grow with MarketLink</h3><p>Sell, deliver, or apply to become an approved Affiliate Marketer.</p></div></div><div class="ml-role-cta-buttons">'+
      (isMarketLinkRole('vendor')?'<button type="button" class="ml-role-cta-button" onclick="window.ML_Premium.openRoleDashboard(\'vendor\')"><span class="ml-role-cta-icon">🏪</span><span class="ml-role-cta-copy"><b>Vendor Dashboard</b><small>Manage your store and incoming orders.</small></span><span>↗</span></button>':'<button type="button" class="ml-role-cta-button" onclick="openVendorApp()"><span class="ml-role-cta-icon">🏪</span><span class="ml-role-cta-copy"><b>Become a Vendor</b><small>Register your business and reach more customers.</small></span><span>↗</span></button>')+
      (isMarketLinkRole('rider')?'<button type="button" class="ml-role-cta-button" onclick="window.ML_Premium.openRoleDashboard(\'rider\')"><span class="ml-role-cta-icon">🛵</span><span class="ml-role-cta-copy"><b>Rider Dashboard</b><small>View deliveries and manage availability.</small></span><span>↗</span></button>':'<button type="button" class="ml-role-cta-button" onclick="openRiderApp()"><span class="ml-role-cta-icon">🛵</span><span class="ml-role-cta-copy"><b>Become a Rider</b><small>Apply to join the delivery network.</small></span><span>↗</span></button>')+
      '<button type="button" class="ml-role-cta-button" onclick="window.ML_Premium.openProfilePage(\'affiliate-marketer\')"><span class="ml-role-cta-icon">🔗</span><span class="ml-role-cta-copy"><b>Become an Affiliate Marketer</b><small>Submit KYC and apply for the professional marketer programme.</small></span><span>↗</span></button>'+
    '</div></section>';
  }
  async function openRoleDashboard(role){
    var r=String(role||'').toLowerCase();
    if(r==='profile'){switchTab('profile');return;}
    if(r!=='vendor'&&r!=='rider'){toast('Choose a valid MarketLink dashboard.','error');return;}
    if(!isMarketLinkRole(r)){toast('Your '+r+' application must be approved before dashboard access.','error');return;}
    // A role is assigned when an application is submitted, not when Admin
    // approves it. Always verify the persisted KYC status before opening a
    // privileged dashboard; the role claim alone is not approval.
    try{
      if(!S.user||!S.user.id)throw new Error('Please sign in again to verify your application status.');
      var response=r==='vendor'?await ML_API.vendors.getById(S.user.id):await ML_API.riders.getById(S.user.id);
      var profile=response&&response.data;
      var status=String(profile&&profile.kyc_status||'').toLowerCase();
      if(status!=='approved'){
        var message=status==='pending'?'Your '+r+' application is still pending Admin review.':
          status==='rejected'?'Your '+r+' application was rejected. Please contact MarketLink support.':
          status==='suspended'?'Your '+r+' account is suspended. Please contact MarketLink support.':
          'MarketLink could not verify approval for your '+r+' account.';
        toast(message,'warning');
        return;
      }
      switchTab(r==='vendor'?'vendordash':'riderdash');
    }catch(e){
      toast(e&&e.error||e&&e.message||'Could not verify your application status. Please retry.','error');
    }
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
  function flattenMarketLinkCategoryTree(nodes,parentName,out){
    out=out||[];
    (Array.isArray(nodes)?nodes:[]).forEach(function(node){
      if(!node||node.id==null)return;
      out.push({id:node.id,name:node.name||'Category',parentName:parentName||''});
      if(Array.isArray(node.children)&&node.children.length)flattenMarketLinkCategoryTree(node.children,node.name||parentName,out);
    });
    return out;
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
      var allCategories=flattenMarketLinkCategoryTree(liveCategories);
      var cards=allCategories.map(function(cat){
        var label=cat.parentName?cat.parentName+' · '+cat.name:cat.name;
        return '<button type="button" class="ml-category-card" data-ml-category-id="'+esc(liveProductId(cat.id))+'" data-ml-category-name="'+esc(cat.name||'Category')+'">'+mlCategoryPhotoMarkup(cat.name,'ml-category-photo')+'<span class="ml-category-card-name">'+esc(label||'Category')+'</span></button>';
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
          var vendorPhoneDigits=String(o.vendor_phone||'').replace(/\D/g,'');
          var vendorWaDigits=String(o.vendor_whatsapp_number||o.vendor_phone||'').replace(/\D/g,'');
          if(vendorPhoneDigits.length===9)vendorPhoneDigits='220'+vendorPhoneDigits;
          if(vendorWaDigits.length===9)vendorWaDigits='220'+vendorWaDigits;
          var vendorContactHtml=(vendorPhoneDigits.length>=9||vendorWaDigits.length>=9)
            ?'<div class="ml-live-order-contact" style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">'+
              (vendorPhoneDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="tel:'+vendorPhoneDigits+'" style="text-decoration:none">📞 Call shop</a>':'')+
              (vendorWaDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="https://wa.me/'+vendorWaDigits+'?text='+encodeURIComponent('Hello, I am contacting you about my MarketLink order '+String(o.order_number||'')+'.')+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">WhatsApp shop ↗</a>':'')+
             '</div>':'';
          return '<article class="ml-live-order-card"><div class="ml-live-order-top"><div><span class="ml-live-order-id">'+esc(o.order_number||o.id||'MarketLink order')+'</span><div class="ml-live-order-date">'+mlOrderDate(o.placed_at||o.created_at)+'</div></div><span class="ml-live-order-status '+tone+'">'+esc(mlOrderStatusLabel(status))+'</span></div>'+
            '<div class="ml-live-order-vendor">🏪 '+esc(o.vendor_name||'MarketLink vendor')+'</div>'+vendorContactHtml+'<div class="ml-live-order-items">'+summary+(items.length>3?' · +'+(items.length-3)+' more':'')+'</div>'+
            '<div class="ml-live-order-bottom"><div><span>Total</span><strong>'+money(o.total||0)+'</strong><small>'+esc(paymentMethodLabel(o.payment_method)||'Payment method not listed')+'</small></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewOrder(\''+esc(String(o.id||''))+'\')">View details →</button></div></article>';
        }).join('')+'</div></div>';
    }catch(e){
      root.innerHTML='<div class="ml-empty"><div style="font-size:32px">📦</div><b>Order history unavailable</b><span>'+esc(e.error||e.message||'MarketLink could not load your order history.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openOrders()">Retry</button></div>';
    }
  }
  var mlSeenCustomerArrivalAlerts=Object.create(null);
  function checkCustomerArrivalNotification(deliveryId){
    if(!deliveryId||typeof syncServerNotifications!=='function')return;
    syncServerNotifications().then(function(items){
      if(!Array.isArray(items))return;
      var alert=items.find(function(item){
        return String(item.type||'').toLowerCase()==='rider_arriving'&&
          String(item.reference_type||'').toLowerCase()==='delivery'&&
          String(item.reference_id||'')===String(deliveryId);
      });
      if(!alert||alert.read_at)return;
      var created=alert.created_at?new Date(alert.created_at):null;
      if(!created||Number.isNaN(created.getTime())||Date.now()-created.getTime()>60*60*1000)return;
      var alertId=String(alert.id);
      if(mlSeenCustomerArrivalAlerts[alertId])return;
      mlSeenCustomerArrivalAlerts[alertId]=true;
      if(!document.hidden)toast('Your rider is nearby. Please get ready to receive your order.','success');
    }).catch(function(){});
  }
  var mlCustomerTrackingMapState={deliveryId:null,map:null,marker:null,destination:null,trail:null,lastPosition:null,animation:null};
  var mlLeafletLoader=null;
  function destroyCustomerTrackingMap(){
    var state=mlCustomerTrackingMapState;
    if(state.animation!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(state.animation);
    if(state.map){try{state.map.remove();}catch(e){}}
    mlCustomerTrackingMapState={deliveryId:null,map:null,marker:null,destination:null,trail:null,lastPosition:null,animation:null};
  }
  function loadMarketLinkLeaflet(){
    if(window.L&&window.L.map)return Promise.resolve(window.L);
    if(mlLeafletLoader)return mlLeafletLoader;
    mlLeafletLoader=new Promise(function(resolve,reject){
      if(!document.querySelector('link[data-ml-leaflet-css]')){
        var link=document.createElement('link');link.rel='stylesheet';link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';link.dataset.mlLeafletCss='1';document.head.appendChild(link);
      }
      var script=document.querySelector('script[data-ml-leaflet-js]');
      if(script&&window.L){resolve(window.L);return;}
      if(script){script.addEventListener('load',function(){window.L?resolve(window.L):reject(new Error('Map library unavailable'));},{once:true});script.addEventListener('error',reject,{once:true});return;}
      script=document.createElement('script');script.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';script.async=true;script.dataset.mlLeafletJs='1';script.crossOrigin='anonymous';
      script.onload=function(){window.L?resolve(window.L):reject(new Error('Map library unavailable'));};script.onerror=function(){reject(new Error('Map library could not be loaded.'));};document.head.appendChild(script);
    }).catch(function(error){var failed=document.querySelector('script[data-ml-leaflet-js]');if(failed&&!window.L)failed.remove();mlLeafletLoader=null;throw error;});
    return mlLeafletLoader;
  }
  function animateCustomerRiderMarker(marker,from,to){
    var state=mlCustomerTrackingMapState;
    if(state.animation!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(state.animation);
    if(!from||typeof requestAnimationFrame!=='function'){marker.setLatLng(to);state.animation=null;return;}
    var start=typeof performance!=='undefined'&&performance.now?performance.now():Date.now(),duration=1100;
    function step(now){
      var progress=Math.max(0,Math.min(1,(now-start)/duration));
      var eased=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
      marker.setLatLng([from[0]+(to[0]-from[0])*eased,from[1]+(to[1]-from[1])*eased]);
      if(progress<1)state.animation=requestAnimationFrame(step);else state.animation=null;
    }
    state.animation=requestAnimationFrame(step);
  }
  function updateCustomerTrackingMap(locationTrail,dropoffLat,dropoffLng,deliveryId){
    var host=G('ml-customer-tracking-map-host'),pings=Array.isArray(locationTrail)?locationTrail:[],latest=pings[0];
    var lat=latest&&Number(latest.lat),lng=latest&&Number(latest.lng);
    if(!host||!latest||!Number.isFinite(lat)||!Number.isFinite(lng))return;
    var destinationValid=dropoffLat!==null&&dropoffLng!==null&&Number.isFinite(Number(dropoffLat))&&Number.isFinite(Number(dropoffLng));
    loadMarketLinkLeaflet().then(function(L){
      if(!document.documentElement.contains(host))return;
      var state=mlCustomerTrackingMapState;
      if(state.deliveryId!==deliveryId){destroyCustomerTrackingMap();state=mlCustomerTrackingMapState;state.deliveryId=deliveryId;}
      if(!state.map){
        state.map=L.map(host,{zoomControl:true,scrollWheelZoom:false,attributionControl:true});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(state.map);
        var icon=L.divIcon({className:'ml-rider-map-div-icon',html:'<span class="ml-rider-map-scooter">🛵</span>',iconSize:[42,42],iconAnchor:[21,21]});
        state.marker=L.marker([lat,lng],{icon:icon,zIndexOffset:1000}).addTo(state.map);state.lastPosition=[lat,lng];
      }else{animateCustomerRiderMarker(state.marker,state.lastPosition,[lat,lng]);state.lastPosition=[lat,lng];}
      var route=pings.slice().reverse().map(function(p){return [Number(p.lat),Number(p.lng)];}).filter(function(p){return Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=-90&&p[0]<=90&&p[1]>=-180&&p[1]<=180;});
      if(state.trail)state.trail.setLatLngs(route);else state.trail=L.polyline(route,{color:'#0d9488',weight:4,opacity:.82,dashArray:'7 7'}).addTo(state.map);
      if(destinationValid){var dest=[Number(dropoffLat),Number(dropoffLng)];if(!state.destination)state.destination=L.marker(dest).addTo(state.map).bindTooltip('Delivery address');else state.destination.setLatLng(dest);}
      else if(state.destination){state.map.removeLayer(state.destination);state.destination=null;}
      if(!state.map.__marketLinkBoundsSet){var bounds=destinationValid?L.latLngBounds([[lat,lng],[Number(dropoffLat),Number(dropoffLng)]]):L.latLngBounds(route.length?route:[[lat,lng]]);if(bounds.isValid())state.map.fitBounds(bounds.pad(.18),{maxZoom:16});else state.map.setView([lat,lng],16);state.map.__marketLinkBoundsSet=true;}
      setTimeout(function(){if(state.map)state.map.invalidateSize();},80);
    }).catch(function(){if(document.documentElement.contains(host))host.innerHTML='<div class="ml-tracking-map-unavailable">The street map could not load on this connection. The latest GPS point is still available through Open directions.</div>';});
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
      var vendorPhoneDigits=String(o.vendor_phone||'').replace(/\D/g,'');
      var vendorWaDigits=String(o.vendor_whatsapp_number||o.vendor_phone||'').replace(/\D/g,'');
      if(vendorPhoneDigits.length===9)vendorPhoneDigits='220'+vendorPhoneDigits;
      if(vendorWaDigits.length===9)vendorWaDigits='220'+vendorWaDigits;
      var vendorContactHtml=(vendorPhoneDigits.length>=9||vendorWaDigits.length>=9)
        ?'<div class="ml-tracking-meta-row"><span>Contact vendor</span><div style="display:flex;gap:7px;flex-wrap:wrap">'+
          (vendorPhoneDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="tel:'+vendorPhoneDigits+'" style="text-decoration:none">📞 Call shop</a>':'')+
          (vendorWaDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="https://wa.me/'+vendorWaDigits+'?text='+encodeURIComponent('Hello, I am contacting you about my MarketLink order '+String(o.order_number||'')+'.')+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">WhatsApp shop ↗</a>':'')+
         '</div></div>':'';
      var deliveryDetails=vendorContactHtml+(o.rider_name?'<div class="ml-tracking-meta-row"><span>Delivery rider</span><b>'+esc(o.rider_name)+'</b></div>':'');
      var riderPhoneDigits=String(liveTracking&&(liveTracking.rider_mobile_number||liveTracking.rider_phone)||o.rider_phone||'').replace(/\D/g,'');
      var riderWaDigits=String(liveTracking&&liveTracking.rider_whatsapp_number||o.rider_whatsapp_number||riderPhoneDigits).replace(/\D/g,'');
      if(!terminal&&o.rider_name&&(riderPhoneDigits.length>=9||riderWaDigits.length>=9)){
        deliveryDetails+='<div class="ml-tracking-meta-row"><span>Contact rider</span><div style="display:flex;gap:7px;flex-wrap:wrap">'+
          (riderPhoneDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="tel:'+riderPhoneDigits+'" style="text-decoration:none">📞 Call rider</a>':'')+
          (riderWaDigits.length>=9?'<a class="ml-btn ml-btn-secondary" href="https://wa.me/'+riderWaDigits+'?text='+encodeURIComponent('Hello, I am contacting you about my MarketLink order '+String(o.order_number||'')+'.')+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">WhatsApp rider ↗</a>':'')+
          '</div></div>';
      }
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
      var dropoffLat=liveTracking&&liveTracking.dropoff_lat!==null&&liveTracking.dropoff_lat!==undefined?Number(liveTracking.dropoff_lat):null;
      var dropoffLng=liveTracking&&liveTracking.dropoff_lng!==null&&liveTracking.dropoff_lng!==undefined?Number(liveTracking.dropoff_lng):null;
      var validDropoff=dropoffLat!==null&&dropoffLng!==null&&Number.isFinite(dropoffLat)&&Number.isFinite(dropoffLng)&&dropoffLat>=-90&&dropoffLat<=90&&dropoffLng>=-180&&dropoffLng<=180;
      if(freshGps){
        var mapUrl='https://www.google.com/maps?q='+encodeURIComponent(liveLat.toFixed(6)+','+liveLng.toFixed(6));
        gpsHtml='<div class="ml-tracking-location"><div class="ml-tracking-location-symbol">🛵</div><div class="ml-tracking-location-copy"><b>Live rider location</b><span>Last shared '+esc(mlTrackingTime(latestPing.recorded_at))+'</span><small>Rider movement updates as new GPS points arrive. Shared for this delivery only.</small></div><a class="ml-btn ml-btn-secondary ml-tracking-map-link" href="'+mapUrl+'" target="_blank" rel="noopener noreferrer">Open directions ↗</a></div><div class="ml-tracking-map-frame"><div id="ml-customer-tracking-map-host"><div id="ml-customer-tracking-map" role="img" aria-label="Map showing your rider and delivery destination"></div></div>'+(validDropoff?'':'<p class="ml-tracking-map-caption">The saved delivery address has no map pin yet. The map will still show your rider’s live position.</p>')+'</div>';
      }else if(validLiveCoordinates&&latestPing&&latestPing.recorded_at&&!terminal){
        gpsHtml='<div class="ml-tracking-location is-stale"><div class="ml-tracking-location-symbol">📍</div><div class="ml-tracking-location-copy"><b>Last rider location</b><span>Last update '+esc(mlTrackingTime(latestPing.recorded_at))+'</span><small>This location is older than 15 minutes, so it is not shown as live.</small></div></div>';
      }else if(!terminal&&o.rider_name){
        gpsHtml='<div class="ml-tracking-location is-pending"><div class="ml-tracking-location-symbol">📍</div><div class="ml-tracking-location-copy"><b>Rider location</b><span>Waiting for a location update for this delivery.</span><small>The order timeline will continue to refresh even when GPS is unavailable.</small></div></div>';
      }
      var hasPendingMobilePayment=Boolean(o.payment_attempt_pending);
      var canCustomerCancel=['pending','accepted'].indexOf(current)>-1&&String(o.payment_status||'pending').toLowerCase()!=='confirmed'&&!hasPendingMobilePayment;
      var cancelAction=canCustomerCancel?'<button type="button" class="ml-btn ml-btn-secondary" id="ml-cancel-order">Cancel order</button>':'';
      var pendingPaymentNotice=hasPendingMobilePayment?'<div class="ml-wallet-note" style="margin:12px 0"><b>Mobile-money payment still processing</b><span>Check the payment status before cancelling. MarketLink will not release the order while the provider may still confirm payment.</span></div>':'';
      var statusClass=current==='delivered'?'delivered':closed?'closed':'active';
      var closedNotice=closed?'<div class="ml-tracking-issue '+(current==='cancelled'?'cancelled':'failed')+'"><b>'+esc(mlOrderStatusLabel(current))+'</b><span>'+(current==='cancelled'?'This order was cancelled. Contact support if you need help with a payment or refund.':current==='refunded'?'The order is marked as refunded. Check payment history for the confirmed refund record.':'The order could not be completed. Contact MarketLink support for assistance.')+'</span></div>':'';
      var timeline=history.length?'<div class="ml-tracking-history"><h4>Latest order updates</h4>'+history.slice().reverse().slice(0,8).map(function(ev){return '<div class="ml-tracking-history-row"><span class="ml-tracking-history-dot"></span><div><b>'+esc(mlOrderStatusLabel(ev.status))+'</b><small>'+esc(mlTrackingTime(ev.changed_at))+'</small>'+(ev.note?'<p>'+esc(ev.note)+'</p>':'')+'</div></div>';}).join('')+'</div>':'';
      var preservedTrackingMap=freshGps?G('ml-customer-tracking-map'):null;
      if(preservedTrackingMap&&preservedTrackingMap.parentNode)preservedTrackingMap.parentNode.removeChild(preservedTrackingMap);
      if(!freshGps)destroyCustomerTrackingMap();
      root.innerHTML='<div class="ml-premium-home ml-order-tracking-page"><div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK ORDER TRACKING</div><h2>'+esc(o.order_number||'Your order')+'</h2><p class="ml-hero-sub">Placed '+esc(mlOrderDate(o.placed_at||o.created_at))+'</p></div><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openOrders()">← Order history</button></div>'+
        '<section class="ml-tracking-hero"><div class="ml-tracking-hero-top"><div><span class="ml-tracking-label">CURRENT ORDER STATUS</span><h3>'+esc(mlOrderStatusLabel(current))+'</h3><p>'+(closed?'The order needs attention.':current==='delivered'?'Your delivery has been completed.': 'Your order progress refreshes automatically every 10 seconds while this page is open.')+'</p></div><span class="ml-live-order-status '+statusClass+'">'+esc(mlOrderStatusLabel(current))+'</span></div>'+
        (!closed?'<div class="ml-tracking-progress"><span style="width:'+(current==='delivered'?100:ratio)+'%"></span></div>':'')+
        (closedNotice||'<div class="ml-tracking-steps">'+progressHtml+'</div>')+
        '</section>'+
        '<section class="ml-tracking-info-grid"><div class="ml-live-order-card"><div class="ml-section-head"><h3>Delivery details</h3></div>'+(deliveryDetails||'<p class="ml-tracking-empty">Rider and delivery estimate will appear here when they are assigned by the live delivery system.</p>')+gpsHtml+'</div>'+
        '<div class="ml-live-order-card"><div class="ml-section-head"><h3>Order summary</h3></div><div class="ml-tracking-meta-row"><span>Vendor</span><b>'+esc(o.vendor_name||(o.vendor&&o.vendor.business_name)||'MarketLink vendor')+'</b></div><div class="ml-tracking-meta-row"><span>Payment</span><b>'+esc(paymentMethodLabel(o.payment_method)||'Not listed')+' · '+esc(String(o.payment_status||'Not listed').replace(/_/g,' '))+'</b></div><div class="ml-tracking-meta-row"><span>Total</span><b>'+money(o.total||0)+'</b></div><div class="ml-tracking-items">'+(items.length?items.map(function(it){return '<div><span>'+esc(it.name||it.product_name_snapshot||it.product_name||'Item')+' × '+Number(it.qty||it.quantity||1)+'</span><b>'+money(it.total||it.line_total||Number(it.price||it.unit_price||0)*Number(it.qty||it.quantity||1))+'</b></div>';}).join(''):'<span>Item details unavailable</span>')+'</div></div></section>'+
        timeline+pendingPaymentNotice+
        '<div class="ml-tracking-footer"><span class="ml-tracking-live-dot"></span><span>Order statuses refresh every 10 seconds. Rider location appears only when a recent GPS ping is recorded for this delivery.</span>'+cancelAction+'<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewOrder(\''+esc(String(o.id||id))+'\')">Refresh now ↻</button></div></div>';
      var trackingMapHost=G('ml-customer-tracking-map-host');
      if(trackingMapHost){
        var mapPlaceholder=G('ml-customer-tracking-map');
        if(preservedTrackingMap&&mapPlaceholder)mapPlaceholder.replaceWith(preservedTrackingMap);
        updateCustomerTrackingMap(locationTrail,dropoffLat,dropoffLng,String(o.delivery_id||id));
      }
      if(!terminal&&o.delivery_id)checkCustomerArrivalNotification(o.delivery_id);
      var cancelButton=G('ml-cancel-order');
      if(cancelButton)cancelButton.addEventListener('click',function(){cancelCustomerOrder(id);});
      if(terminal)stopCustomerOrderDetailPolling();else startCustomerOrderDetailPolling(id);
    }catch(e){
      if(!silent)root.innerHTML='<div class="ml-empty"><b>Could not open this order</b><span>'+esc(e.error||e.message||'The order may no longer be available.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.openOrders()">Back to order history</button></div>';
    }
  }
  async function cancelCustomerOrder(id){
    if(!window.confirm('Cancel this order? You can cancel only while it is pending or accepted and before preparation starts.'))return;
    try{
      await ML_API.orders.cancel(id,'Cancelled by customer.');
      toast('Your order has been cancelled.','success');
      await openOrderDetail(id,false);
    }catch(e){
      toast(e.error||e.message||'Could not cancel this order. Please contact MarketLink support.','error');
      await openOrderDetail(id,true);
    }
  }
  function renderPremiumHome(){
    var root=G('tab-home');if(!root)return;
    var catHtml=flattenMarketLinkCategoryTree(liveCategories).slice(0,12).map(function(c){
      return '<button type="button" class="ml-cat" data-ml-category-id="'+esc(liveProductId(c.id))+'" data-ml-category-name="'+esc(c.name||'Category')+'">'+mlCategoryPhotoMarkup(c.name,'ml-cat-photo')+'<span class="ml-cat-name">'+esc(c.name)+'</span></button>';
    }).join('');
    if(!catHtml) catHtml='<div class="ml-empty" style="width:100%;box-sizing:border-box;"><b>Categories are being prepared</b><span>Live categories will appear here as soon as they are published.</span></div>';
    var prodHtml=liveProducts.map(function(p){return productCard(p);}).join('');
    var orderCount=liveProfile?Number(liveProfile.total_orders||0):0;
    var spent=liveProfile?Number(liveProfile.total_spent||0):0;
    var wallet=liveWallet?Number(liveWallet.balance||0):Number(S.walletBalance||0);
    // Prefer the freshly loaded server profile over any stale session/local URL.
    var profilePhoto=liveProfile ? (liveProfile.profile_photo_url||null) : ((S.user&&(S.user.profilePhotoUrl||S.user.avatarUrl))||S.profilePhoto||null);
    if(!liveProfile){try{profilePhoto=profilePhoto||localStorage.getItem('ml_profile_photo_url')||null;}catch(photoReadError){}}
    var profileInitial=esc(String(firstName()||'U').trim().charAt(0).toUpperCase()||'U');
    var profileAvatar=profilePhoto
      ?'<img src="'+esc(String(profilePhoto)+(String(profilePhoto).indexOf('?')>=0?'&':'?')+'mlavatar='+Date.now())+'" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><span class="ml-dashboard-avatar-fallback" style="display:none;">'+profileInitial+'</span>'
      :'<span class="ml-dashboard-avatar-fallback">'+profileInitial+'</span>';
    root.innerHTML=
      '<div class="ml-premium-home">'+
      '<div class="ml-home-top"><div class="ml-home-welcome">'+mlOfficialBrandMarkup()+'<div class="ml-hero-title">Welcome back, '+esc(firstName())+'.</div><div class="ml-hero-sub">Discover products from local vendors, order securely and track each step.</div></div><div class="ml-home-top-actions"><div class="ml-live-dot">Live marketplace</div><button type="button" class="ml-home-refresh" onclick="window.ML_Premium.refreshCurrentView()" aria-label="Refresh MarketLink" title="Refresh current MarketLink view">↻</button><button type="button" class="ml-dashboard-avatar" onclick="switchTab(\'profile\')" aria-label="Open your profile" title="Open your profile">'+profileAvatar+'</button></div></div>'+
      '<div class="ml-home-discovery"><button type="button" class="ml-btn ml-btn-primary" onclick="var s=document.getElementById(\'hsearch\');if(s)s.focus()">🔎 Search marketplace</button><button type="button" class="ml-btn ml-btn-secondary" onclick="switchTab(\'orders\')">📦 Track my orders</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.renderCategories()">🛍️ Browse categories</button></div>'+
      '<div class="ml-home-search"><span aria-hidden="true">🔎</span><input id="hsearch" type="search" autocomplete="off" placeholder="Search products, vendors or categories…" aria-label="Search products, vendors or categories" oninput="window.doSearch(this.value)"><button type="button" onclick="var q=document.getElementById(\'hsearch\');if(q)window.doSearch(q.value)">Search</button></div>'+
      promoCarouselMarkup()+
      '<div class="ml-promo-strip"><div class="ml-promo"><strong>⚡ Verified marketplace</strong><span>Shop products published by approved vendors.</span></div><div class="ml-promo"><strong>🛵 Delivery network</strong><span>Follow your order through the real delivery workflow.</span></div><div class="ml-promo"><strong>💳 Secure checkout</strong><span>Use supported MarketLink payment methods at checkout.</span></div></div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Orders</div><div class="ml-stat-value">'+orderCount+'</div></div><div class="ml-stat"><div class="ml-stat-label">Wallet</div><div class="ml-stat-value">'+money(wallet)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Total spent</div><div class="ml-stat-value">'+money(spent)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Reward points</div><div class="ml-stat-value">'+Number(S.rewardPoints||0).toLocaleString()+'</div></div></div>'+
      '<div class="ml-section-head"><h3>Browse categories</h3><button onclick="window.ML_Premium.refresh()">Refresh</button></div><div class="ml-cat-row">'+catHtml+'</div>'+
      '<div class="ml-section-head"><h3>Latest from MarketLink</h3><button onclick="window.ML_Premium.refresh()">View latest</button></div>'+
      (prodHtml?'<div class="ml-product-grid">'+prodHtml+'</div>':'<div class="ml-empty"><div style="font-size:30px">🛍️</div><b>No live products yet</b><span>When an approved vendor publishes an active product, it will appear here automatically. No demo products are being shown.</span></div>')+
      roleCtaSectionMarkup()+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span><div class="ml-footer-nav"><button type="button" onclick="switchTab(\'home\')">Home</button><button type="button" onclick="switchTab(\'catpage\')">Categories</button><button type="button" onclick="switchTab(\'orders\')">Orders</button><button type="button" onclick="switchTab(\'cart\')">Cart</button><button type="button" onclick="switchTab(\'profile\')">Profile</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'wallet\')"><img class="ml-daha-inline-eagle" src="./assets/daha-wallet-eagle.webp" alt=""> DAHA Wallet</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'terms\')">Terms of Service</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'privPolicy\')">Privacy Policy</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'deliveryPolicy\')">Delivery & Returns</button></div></footer>'+
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
    var vendorId=String(p.vendor_id||p.vendorId||''),wa=String(p.vendor_whatsapp||'').replace(/\D/g,'');if(wa.length===7)wa='220'+wa;
    var contact=vendorId?'<div class="ml-product-contact" onclick="event.stopPropagation()"><button type="button" onclick="window.ML_Premium.openVendorChat(\''+esc(vendorId)+'\',\''+esc(p.vendor_name||'MarketLink vendor')+'\')">Message seller</button>'+(wa.length>=10?'<a href="https://wa.me/'+wa+'" target="_blank" rel="noopener noreferrer">WhatsApp seller</a>':'')+'</div>':'';
    return '<article class="ml-product" onclick="window.ML_Premium.openProduct(\''+esc(pid)+'\')"><div class="ml-product-img">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div class="ml-product-body"><div class="ml-product-vendor">'+esc(p.vendor_name||p.vendorName||'MarketLink vendor')+'</div><div class="ml-product-name">'+esc(p.name)+'</div><div class="ml-product-meta"><div><div class="ml-price">'+money(p.price)+'</div><div class="ml-stock">'+(stock==null?'Available':stock>0?stock+' in stock':'Out of stock')+'</div></div><button class="ml-add" '+(stock===0?'disabled':'')+' onclick="event.stopPropagation();window.ML_Premium.add(\''+esc(pid)+'\')">+</button></div>'+contact+'</div></article>';
  }
  var mlChatPollTimer=null,mlChatConversationId=null,mlChatVendorId=null;
  function closeVendorChat(){if(mlChatPollTimer){clearInterval(mlChatPollTimer);mlChatPollTimer=null;}var modal=G('ml-vendor-chat-modal');if(modal)modal.remove();mlChatConversationId=null;mlChatVendorId=null;}
  async function renderVendorChatMessages(){
    if(!mlChatConversationId)return;var box=G('ml-vendor-chat-messages');if(!box)return;
    try{var res=await ML_API.messaging.messages(mlChatConversationId,{limit:100}),rows=Array.isArray(res.data)?res.data:[];
      box.innerHTML=rows.map(function(m){var mine=String(m.sender_id)===String(S.user&&S.user.id);return '<div style="display:flex;justify-content:'+(mine?'flex-end':'flex-start')+';margin:7px 0"><div style="max-width:84%;padding:9px 11px;border-radius:12px;background:'+(mine?'#164E63':'#172A38')+';color:#F3F7FA;font-size:13px;line-height:1.45;overflow-wrap:anywhere">'+esc(m.body||'')+'<small style="display:block;color:#C4D4DE;font-size:9px;margin-top:4px;text-align:right">'+esc(m.created_at?new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'')+'</small></div></div>';}).join('')||'<div style="text-align:center;color:#B8C8D3;padding:22px 8px;font-size:12px">Start the conversation with this vendor.</div>';
      box.scrollTop=box.scrollHeight;await ML_API.messaging.markRead(mlChatConversationId);
    }catch(e){box.innerHTML='<div style="color:#FCA5A5;padding:12px;font-size:12px">'+esc(e.error||'Could not load messages.')+'</div>';}
  }
  async function openVendorChat(vendorId,vendorName,orderId){
    if(!apiOk()){toast('Sign in to message this vendor.','info');if(typeof goAuth==='function')goAuth();return;}
    if(!vendorId){toast('This vendor does not have an available chat profile yet.','warning');return;}
    closeVendorChat();mlChatVendorId=String(vendorId);
    var modal=document.createElement('div');modal.id='ml-vendor-chat-modal';modal.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(2,8,14,.76);display:flex;align-items:flex-end;justify-content:center;padding:12px;box-sizing:border-box';
    modal.innerHTML='<section style="width:100%;max-width:520px;height:min(78vh,680px);background:#0B1A27;border:1px solid rgba(245,184,61,.35);border-radius:18px;display:flex;flex-direction:column;overflow:hidden"><header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)"><div><b style="display:block;color:#F8FAFC;font-size:14px">'+esc(vendorName||'MarketLink vendor')+'</b><small style="color:#B8C8D3;font-size:11px">Private MarketLink chat</small></div><button type="button" id="ml-vendor-chat-close" style="border:0;background:#172A38;color:#fff;border-radius:10px;padding:8px 12px;font-size:18px">×</button></header><div id="ml-vendor-chat-messages" style="flex:1;overflow:auto;padding:12px 14px;min-height:0"></div><form id="ml-vendor-chat-form" style="display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.1)"><textarea id="ml-vendor-chat-input" rows="1" maxlength="4000" placeholder="Write a message…" style="flex:1;min-width:0;resize:vertical;max-height:100px;background:#132634;color:#F8FAFC;border:1px solid #496170;border-radius:11px;padding:11px;font:inherit;font-size:14px"></textarea><button type="submit" style="background:#F5B83D;color:#071521;border:0;border-radius:11px;padding:0 16px;font-weight:800">Send</button></form></section>';
    document.body.appendChild(modal);G('ml-vendor-chat-close').onclick=closeVendorChat;modal.addEventListener('click',function(e){if(e.target===modal)closeVendorChat();});
    G('ml-vendor-chat-form').addEventListener('submit',async function(e){e.preventDefault();var input=G('ml-vendor-chat-input'),body=input&&input.value.trim();if(!body)return;if(!mlChatConversationId){toast('Chat is still connecting. Please wait a moment and try again.','info');return;}var send=this.querySelector('button[type="submit"]');if(send)send.disabled=true;try{await ML_API.messaging.send(mlChatConversationId,body);input.value='';await renderVendorChatMessages();}catch(err){toast(err.error||'Message could not be sent. Please retry.','error');}finally{if(send)send.disabled=false;}});
    try{var started=await ML_API.messaging.start({vendorId:String(vendorId),orderId:orderId||undefined});mlChatConversationId=String(started.data&&started.data.id||'');if(!mlChatConversationId)throw new Error('Conversation could not be opened.');await renderVendorChatMessages();mlChatPollTimer=setInterval(renderVendorChatMessages,5000);}
    catch(e){var box=G('ml-vendor-chat-messages');if(box)box.innerHTML='<div style="color:#FCA5A5;padding:12px;font-size:12px">'+esc(e.error||e.message||'Could not open this chat.')+'</div>';}
  }
  var mlInboxPollTimer=null,mlInboxConversationId=null;
  async function openMessages(){
    if(!apiOk()){toast('Sign in to view messages.','info');if(typeof goAuth==='function')goAuth();return;}
    if(mlInboxPollTimer){clearInterval(mlInboxPollTimer);mlInboxPollTimer=null;}
    var modal=document.createElement('div');modal.id='ml-messages-inbox';modal.style.cssText='position:fixed;inset:0;z-index:10040;background:rgba(2,8,14,.78);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
    modal.innerHTML='<section style="width:100%;max-width:760px;height:min(82vh,720px);background:#0B1A27;border:1px solid rgba(245,184,61,.35);border-radius:18px;display:flex;flex-direction:column;overflow:hidden"><header style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)"><div><b style="color:#F8FAFC">MarketLink Messages</b><div style="color:#B8C8D3;font-size:11px;margin-top:3px">Customer and vendor conversations</div></div><button id="ml-inbox-close" style="background:#172A38;color:#fff;border:0;border-radius:9px;padding:8px 12px">Close</button></header><div style="display:grid;grid-template-columns:minmax(130px,.8fr) minmax(0,1.5fr);flex:1;min-height:0"><aside id="ml-inbox-list" style="overflow:auto;border-right:1px solid rgba(255,255,255,.1);padding:8px"></aside><div style="display:flex;flex-direction:column;min-width:0"><div id="ml-inbox-current-name" style="color:#F8FAFC;padding:12px;border-bottom:1px solid rgba(255,255,255,.08);font-size:12px">Choose a conversation</div><div id="ml-inbox-messages" style="flex:1;overflow:auto;padding:10px;min-height:0"><div style="color:#B8C8D3;font-size:12px;text-align:center;padding:20px">Select a conversation to read and reply.</div></div><form id="ml-inbox-form" style="display:flex;gap:7px;padding:10px;border-top:1px solid rgba(255,255,255,.1)"><textarea id="ml-inbox-input" rows="1" maxlength="4000" placeholder="Write a reply…" style="flex:1;min-width:0;background:#132634;color:#F8FAFC;border:1px solid #496170;border-radius:10px;padding:10px;font:inherit;font-size:14px"></textarea><button type="submit" style="background:#F5B83D;color:#071521;border:0;border-radius:10px;padding:0 12px;font-weight:800">Send</button></form></div></div></section>';
    document.body.appendChild(modal);G('ml-inbox-close').onclick=function(){if(mlInboxPollTimer)clearInterval(mlInboxPollTimer);mlInboxPollTimer=null;mlInboxConversationId=null;modal.remove();};
    modal.addEventListener('click',function(e){if(e.target===modal)G('ml-inbox-close').click();});
    async function loadInboxMessages(){
      if(!mlInboxConversationId)return;var box=G('ml-inbox-messages');if(!box)return;
      try{var res=await ML_API.messaging.messages(mlInboxConversationId,{limit:100}),rows=Array.isArray(res.data)?res.data:[];
        box.innerHTML=rows.map(function(m){var mine=String(m.sender_id)===String(S.user&&S.user.id);return '<div style="display:flex;justify-content:'+(mine?'flex-end':'flex-start')+';margin:6px 0"><div style="max-width:86%;background:'+(mine?'#164E63':'#172A38')+';color:#F3F7FA;border-radius:11px;padding:9px 11px;font-size:12px;line-height:1.45;overflow-wrap:anywhere">'+esc(m.body||'')+'<small style="display:block;color:#C4D4DE;font-size:9px;text-align:right;margin-top:4px">'+esc(m.created_at?new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'')+'</small></div></div>';}).join('')||'<div style="color:#B8C8D3;font-size:12px;text-align:center;padding:20px">No messages yet.</div>';box.scrollTop=box.scrollHeight;await ML_API.messaging.markRead(mlInboxConversationId);
      }catch(e){box.innerHTML='<div style="color:#FCA5A5;font-size:12px;padding:10px">'+esc(e.error||'Could not load messages.')+'</div>';}
    }
    try{
      var result=await ML_API.messaging.list(),items=Array.isArray(result.data)?result.data:[],list=G('ml-inbox-list');
      list.innerHTML=items.map(function(item){var title=item.vendor_name||item.other_user_name||'MarketLink contact';return '<button type="button" data-chat-id="'+esc(item.id)+'" data-chat-title="'+esc(title)+'" style="display:block;width:100%;text-align:left;padding:10px 8px;margin-bottom:5px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#132634;color:#F8FAFC;font-size:11px;overflow-wrap:anywhere"><b>'+esc(title)+'</b><span style="display:block;color:#B8C8D3;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(item.last_message||'Start messaging')+'</span>'+(Number(item.unread_count)>0?'<small style="color:#FFD778">'+Number(item.unread_count)+' unread</small>':'')+'</button>';}).join('')||'<div style="color:#B8C8D3;font-size:11px;padding:10px">No conversations yet. Open a product and choose “Message vendor”.</div>';
      list.querySelectorAll('[data-chat-id]').forEach(function(btn){btn.addEventListener('click',function(){mlInboxConversationId=btn.getAttribute('data-chat-id');var title=G('ml-inbox-current-name');if(title)title.textContent=btn.getAttribute('data-chat-title')||'Conversation';loadInboxMessages();});});
      G('ml-inbox-form').addEventListener('submit',async function(e){e.preventDefault();if(!mlInboxConversationId){toast('Choose a conversation first.','info');return;}var input=G('ml-inbox-input'),body=input&&input.value.trim();if(!body)return;var send=this.querySelector('button[type="submit"]');if(send)send.disabled=true;try{await ML_API.messaging.send(mlInboxConversationId,body);input.value='';await loadInboxMessages();}catch(err){toast(err.error||'Reply could not be sent.','error');}finally{if(send)send.disabled=false;}});
      mlInboxPollTimer=setInterval(function(){loadInboxMessages();},5000);
    }catch(e){var list=G('ml-inbox-list');if(list)list.innerHTML='<div style="color:#FCA5A5;font-size:12px;padding:10px">'+esc(e.error||'Could not load conversations.')+'</div>';}
  }
  async function openProduct(id){
    try{
      var res=await ML_API.products.getById(id),p=res.data;if(!p)throw new Error('Product not found');
      var vendorProfile=null;if(p.vendor_id||p.vendorId){try{vendorProfile=(await ML_API.vendors.getById(p.vendor_id||p.vendorId)).data;}catch(vendorLookupError){}}
      var waDigits=String(vendorProfile&&vendorProfile.whatsapp_number||'').replace(/\D/g,'');
      var contactActions=(p.vendor_id||p.vendorId)?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="ml-btn ml-btn-secondary" style="flex:1;min-width:140px" data-ml-chat-vendor="'+esc(p.vendor_id||p.vendorId)+'" data-ml-chat-name="'+esc(p.vendor_name||vendorProfile&&vendorProfile.business_name||'Vendor')+'">💬 Message vendor</button>'+(waDigits?'<a class="ml-btn ml-btn-secondary" style="flex:1;min-width:140px;text-align:center;text-decoration:none" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+waDigits+'?text='+encodeURIComponent('Hello, I found your product on MarketLink Gambia.')+'">WhatsApp vendor ↗</a>':'')+'</div>':'';
      var vendorDays=vendorProfile&&Array.isArray(vendorProfile.working_days)?vendorProfile.working_days:[];
      var vendorHours=vendorProfile&&(vendorProfile.opening_time||vendorProfile.closing_time)?String(vendorProfile.opening_time||'').slice(0,5)+' – '+String(vendorProfile.closing_time||'').slice(0,5):'';
      var vendorInfoRows=[];
      if(vendorProfile&&vendorProfile.business_address)vendorInfoRows.push('<div style="display:flex;gap:9px;align-items:flex-start"><span aria-hidden="true">📍</span><span><b style="color:#F8FAFC">Store location</b><br>'+esc(vendorProfile.business_address)+'</span></div>');
      if(vendorProfile&&vendorProfile.services_offered)vendorInfoRows.push('<div style="display:flex;gap:9px;align-items:flex-start"><span aria-hidden="true">🛍️</span><span><b style="color:#F8FAFC">Products / services</b><br>'+esc(vendorProfile.services_offered)+'</span></div>');
      if(vendorDays.length||vendorHours)vendorInfoRows.push('<div style="display:flex;gap:9px;align-items:flex-start"><span aria-hidden="true">🕒</span><span><b style="color:#F8FAFC">Opening hours</b><br>'+esc(vendorDays.join(', ')||'Days not listed')+(vendorHours?'<br>'+esc(vendorHours):'')+'</span></div>');
      var vendorInfoHtml=vendorInfoRows.length?'<section aria-label="Vendor information" style="display:grid;gap:10px;margin-top:14px;padding:13px;border:1px solid rgba(148,163,184,.22);border-radius:13px;background:rgba(255,255,255,.035);color:#CBD5E1;font-size:12px;line-height:1.6">'+vendorInfoRows.join('')+'</section>':'';
      var root=S.curTab==='catpage'?G('catpage-content'):G('tab-home');if(!root)return;root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Product</h3><button onclick="S.curTab===\'catpage\'?window.ML_Premium.openCategory(S.activeCategoryId,S.activeCategoryName):window.ML_Premium.refresh()">← Back</button></div>'+
        '<div class="ml-profile-card" style="padding:18px"><div class="ml-product-img" style="height:300px;border-radius:15px">'+imageOrFallback(p)+'<div class="ml-product-emoji" style="'+(p.primary_image?'display:none':'')+'">🛍️</div></div><div style="padding-top:16px"><div class="ml-product-vendor">'+esc(p.vendor_name||'MarketLink vendor')+'</div><h2 style="color:#fff;margin:6px 0;font-size:23px">'+esc(p.name)+'</h2><div class="ml-price" style="font-size:22px">'+money(p.price)+'</div><p style="color:#91A4B4;font-size:12px;line-height:1.6">'+esc(p.description||'Product details will appear here when provided by the vendor.')+'</p>'+vendorInfoHtml+'<button class="ml-btn ml-btn-primary" style="width:100%" onclick="window.ML_Premium.add(\''+esc(liveProductId(p.id))+'\')">Add to cart</button>'+contactActions+'</div></div></div>';
      root.querySelectorAll('[data-ml-chat-vendor]').forEach(function(btn){btn.addEventListener('click',function(){openVendorChat(btn.getAttribute('data-ml-chat-vendor'),btn.getAttribute('data-ml-chat-name'));});});
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
  async function refreshCurrentView(){
    var tab=String(S.curTab||'home');
    if(tab==='home')return refresh();
    if(tab==='cart')return renderLiveCart();
    if(tab==='orders')return renderLiveOrders();
    if(tab==='profile')return renderPremiumProfile();
    if(tab==='vendordash'){
      if(typeof loadVendorLiveData==='function')return loadVendorLiveData();
      if(typeof window.renderVDash==='function')return window.renderVDash();
    }
    if(tab==='riderdash'){
      if(typeof loadRiderLiveData==='function')return loadRiderLiveData();
      if(typeof window.renderRDash==='function')return window.renderRDash();
    }
    if(tab==='admindash')return loadAdminDashboard();
    return refresh();
  }
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
    var selectedDeliveryAddressId=String(S.delivAddressId||S.deliveryAddressId||'');
    var deliveryQuoteError='',deliveryQuoteCache=S.deliveryQuoteCache||null;
    var cartPricingFingerprint=checkoutCartPricingFingerprint(ids)+'|coupon:'+String(S.appliedCoupon&&S.appliedCoupon.code||'')+'|affiliate:'+String(S.referredAffiliateCode||'');
    var deliveryQuoteKey=vendorIds.length===1&&selectedDeliveryAddressId?vendorIds[0]+'|'+selectedDeliveryAddressId+'|'+cartPricingFingerprint:'';
    var deliveryQuoteCacheValid=Boolean(deliveryQuoteCache&&deliveryQuoteCache.key===deliveryQuoteKey&&Number(deliveryQuoteCache.cacheUntil||0)>Date.now());
    if(deliveryQuoteKey&&!deliveryQuoteCacheValid){
      try{
        var quoteResponse=await ML_API.orders.deliveryQuotes({vendorId:vendorIds[0],deliveryAddressId:selectedDeliveryAddressId,items:ids.map(function(id){return {productId:id,quantity:Number(S.cart[id]||0)};}),couponCode:S.appliedCoupon&&S.appliedCoupon.code||undefined,affiliateCode:S.referredAffiliateCode||undefined});
        var quoteData=quoteResponse&&quoteResponse.data?quoteResponse.data:quoteResponse;
        var quoteOptions=quoteData&&Array.isArray(quoteData.quotes)?quoteData.quotes:[];
        var quoteExpiry=quoteOptions.reduce(function(earliest,q){
          var time=q.expiresAt?new Date(q.expiresAt).getTime():0;
          return time>0&&(earliest===0||time<earliest)?time:earliest;
        },0);
        S.deliveryQuoteCache={
          key:deliveryQuoteKey,options:quoteOptions,origin:quoteData&&quoteData.origin||'Vendor pickup',
          destination:quoteData&&quoteData.destination||'Saved address',
          straightLineDistanceKm:Number(quoteData&&quoteData.straightLineDistanceKm||0),
          estimatedRouteDistanceKm:Number(quoteData&&quoteData.estimatedRouteDistanceKm||0),
          cacheUntil:quoteExpiry?Math.max(Date.now()+1000,quoteExpiry-5000):Date.now()+30000
        };
        deliveryQuoteCache=S.deliveryQuoteCache;
        deliveryQuoteCacheValid=true;
        if(!quoteOptions.some(function(q){return String(q.quoteId)===String(S.selectedDeliveryQuoteId||'');})){
          S.selectedDeliveryQuoteId=quoteOptions.length?String(quoteOptions[0].quoteId):'';
        }
      }catch(quoteError){
        deliveryQuoteError=quoteError&&quoteError.error||'Could not calculate delivery prices. Check your vendor and saved address GPS, then retry.';
        S.deliveryQuoteCache={key:deliveryQuoteKey,options:[],origin:'',destination:'',cacheUntil:Date.now()+15000,error:deliveryQuoteError};
        deliveryQuoteCache=S.deliveryQuoteCache;
      }
    }else if(deliveryQuoteCacheValid&&deliveryQuoteCache.error){
      deliveryQuoteError=deliveryQuoteCache.error;
    }
    if(deliveryQuoteKey&&deliveryQuoteCacheValid&&deliveryQuoteCache&&Array.isArray(deliveryQuoteCache.options)&&
       !deliveryQuoteCache.options.some(function(q){return String(q.quoteId)===String(S.selectedDeliveryQuoteId||'');})){
      S.selectedDeliveryQuoteId=deliveryQuoteCache.options.length?String(deliveryQuoteCache.options[0].quoteId):'';
    }
    var availableDeliveryQuotes=deliveryQuoteCacheValid&&deliveryQuoteCache&&Array.isArray(deliveryQuoteCache.options)?deliveryQuoteCache.options:[];
    var selectedDeliveryQuote=availableDeliveryQuotes.find(function(q){return String(q.quoteId)===String(S.selectedDeliveryQuoteId||'');})||null;
    var selectedCheckoutTotal=selectedDeliveryQuote&&selectedDeliveryQuote.estimatedCustomerTotal!=null?Number(selectedDeliveryQuote.estimatedCustomerTotal):NaN;
    var selectedCheckoutTotalReady=Boolean(selectedDeliveryQuote&&Number.isFinite(selectedCheckoutTotal)&&selectedCheckoutTotal>0);
    var deliveryQuoteMarkup='';
    if(vendorIds.length>1){
      deliveryQuoteMarkup='<div class="ml-delivery-quote-empty"><b>One vendor per checkout</b><span>Split products from different vendors into separate orders so MarketLink can quote the correct pickup location.</span></div>';
    }else if(!selectedDeliveryAddressId){
      deliveryQuoteMarkup='<div class="ml-delivery-quote-empty"><b>Select a saved delivery address</b><span>MarketLink needs the delivery address GPS to calculate available rider prices.</span></div>';
    }else if(deliveryQuoteError||deliveryQuoteCache&&deliveryQuoteCache.error){
      deliveryQuoteMarkup='<div class="ml-delivery-quote-empty"><b>Delivery price unavailable</b><span>'+esc(deliveryQuoteError||deliveryQuoteCache.error)+'</span><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.refreshCart()">Try again</button></div>';
    }else if(!availableDeliveryQuotes.length){
      deliveryQuoteMarkup='<div class="ml-delivery-quote-empty"><b>No rider prices available yet</b><span>No online, approved rider has saved a delivery tariff for this area. Try again when a rider is online with pricing configured.</span><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.refreshCart()">Refresh rider prices</button></div>';
    }else{
      deliveryQuoteMarkup='<div class="ml-delivery-route-meta"><span>📍 '+esc(deliveryQuoteCache.origin)+' → '+esc(deliveryQuoteCache.destination)+'</span><b>Estimated route '+Number(deliveryQuoteCache.estimatedRouteDistanceKm||0).toFixed(1)+' km</b></div>'+
        '<div class="ml-delivery-quote-list">'+availableDeliveryQuotes.map(function(q){
          var selected=String(q.quoteId)===String(S.selectedDeliveryQuoteId||'');
          var rating=Number(q.rating||0)>0?Number(q.rating).toFixed(1)+' ★'+(Number(q.ratingCount||0)>0?' ('+Number(q.ratingCount)+')':''):'New rider';
          var expiry=q.expiresAt?new Date(q.expiresAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
          return '<button type="button" class="ml-delivery-quote-card '+(selected?'selected':'')+'" onclick="window.ML_Premium.selectDeliveryQuote(\''+esc(String(q.quoteId))+'\')">'+
            '<span class="ml-delivery-quote-icon">🛵</span><span class="ml-delivery-quote-copy"><b>'+esc(q.riderName||'MarketLink Rider')+'</b><small>'+esc(q.vehicleType||'Delivery rider')+' · '+esc(rating)+'</small><small>'+Number(q.estimatedRouteDistanceKm||deliveryQuoteCache.estimatedRouteDistanceKm||0).toFixed(1)+' km · price locked for this order'+(expiry?' · valid until '+esc(expiry):'')+'</small></span>'+
            '<strong>'+money(q.deliveryFee)+'</strong><span class="ml-delivery-quote-check">'+(selected?'✓ Selected':'Select')+'</span></button>';
        }).join('')+'</div><p class="ml-delivery-estimate-note">Distance is estimated from the vendor pickup GPS and your saved address GPS. The rider fare is locked to this order when you place it. You will see one final payable total before payment.</p>';
    }
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
    var paymentOptions=livePaymentOptions(S.paymentCapabilities);
    if(!paymentOptions.some(function(opt){return opt[0]===S.selPay;}))S.selPay='Cash on Delivery';
    var chosenPaymentLabel=S.selPay||'Cash on Delivery';
    var paymentHtml=paymentOptions.map(function(opt){
      var selected=chosenPaymentLabel===opt[0],isCod=opt[1]==='cod',isWallet=opt[1]==='wallet';
      var subText=isCod?'Pay the rider in cash when your order arrives. After delivery, the rider submits the deposit reference for MarketLink verification.':isWallet?'Pay securely using your DAHA Wallet balance. If you need a top-up, MarketLink can open your wallet without clearing this cart.':opt[1]==='modempay'?'Continue to the secure hosted payment page and choose an enabled method.':'Pay securely with '+opt[0]+'. Enter your full nine-digit Gambian mobile number below.';
      return '<button type="button" class="ml-profile-row ml-payment-option" style="width:100%;text-align:left;cursor:pointer;border:1px solid '+(selected?'rgba(66,210,201,.55)':'rgba(255,255,255,.07)')+';background:'+(selected?'rgba(13,115,119,.10)':'transparent')+';" onclick="window.ML_Premium.selectPayment(\''+esc(opt[0])+'\')"><div class="ico">'+(isCod?'💵':isWallet?'<img class="ml-payment-daha-eagle" src="./assets/daha-wallet-eagle.webp" alt="DAHA Wallet" loading="lazy">':'📱')+'</div><div class="copy"><b>'+esc(opt[0])+'</b><span>'+esc(subText)+'</span></div>'+(selected?'<span style="color:#42D2C9;font-size:10px;font-weight:700">Selected</span>':'')+'</button>';
    }).join('');
    var selectedMethod=normalizePaymentChoice(chosenPaymentLabel);
    var mobileMoneyInputHtml=S.paymentCapabilities&&S.paymentCapabilities.directMobileMoney&&['wave','afrimoney','qmoney'].indexOf(selectedMethod)>=0
      ?'<div style="margin-top:12px"><label class="ml-field-label" for="ml-checkout-mobile-prefix">Your '+esc(chosenPaymentLabel)+' number</label><div style="display:grid;grid-template-columns:minmax(112px, .85fr) minmax(0,1.15fr);gap:8px"><select id="ml-checkout-mobile-prefix" class="ml-daha-input" aria-label="Mobile network prefix"><option value="87">Africell (87)</option><option value="83">QCell (83)</option><option value="86">Comium (86)</option></select><input id="ml-checkout-mobile-number" class="ml-daha-input" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="7" placeholder="7 subscriber digits"></div><small class="ml-daha-copy">Choose your network and enter the 7 digits after the prefix. MarketLink combines them into your 9-digit Gambian number.</small></div>':'';
    var itemsHtml=ids.map(function(id){var p=CART_ITEMS[id],qty=Number(S.cart[id]||0);return '<div class="ml-profile-row"><div class="ico">🛍️</div><div class="copy"><b>'+esc(p.name)+'</b><span>'+money(p.price)+' × '+qty+' · '+esc(p.vendorName||'Vendor')+'</span></div><strong style="color:#FFD778">'+money(Number(p.price||0)*qty)+'</strong></div>';}).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Your cart</h3><button onclick="window.ML_Premium.refreshCart()">Refresh</button></div><div class="ml-profile-card"><div class="ml-section-head"><h3>Items</h3><span style="color:#91A4B4;font-size:10px">'+vendorIds.length+' vendor'+(vendorIds.length===1?'':'s')+'</span></div>'+itemsHtml+'</div>'+
      (vendorIds.length>1?'<div class="ml-empty" style="margin-top:10px"><b>Multiple vendors in cart</b><span>MarketLink currently requires one vendor per checkout. Remove items from other vendors.</span></div>':'')+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Delivery address</h3><button onclick="window.ML_Premium.manageAddresses()">Manage</button></div>'+addressHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Payment method</h3><span style="color:#91A4B4;font-size:10px">Choose how to pay</span></div>'+paymentHtml+mobileMoneyInputHtml+'</div>'+
      '<div class="ml-profile-card" style="margin-top:10px"><div class="ml-section-head"><h3>Coupon</h3><span style="color:#91A4B4;font-size:10px">Validated by backend</span></div><div style="display:flex;gap:8px"><input id="ml-cart-coupon" class="inp" placeholder="Optional coupon code" value="'+esc((S.appliedCoupon&&S.appliedCoupon.code)||'')+'" style="margin:0;flex:1"><button class="ml-btn ml-btn-secondary" type="button" onclick="window.ML_Premium.setCoupon()">Apply</button></div></div>'+
      '<section class="ml-profile-card ml-checkout-delivery-panel" style="margin-top:10px"><div class="ml-section-head"><h3>Choose your rider</h3><span>GPS-based price</span></div>'+deliveryQuoteMarkup+'</section>'+
      '<div class="ml-profile-card ml-checkout-total-card" style="margin-top:10px"><div class="ml-profile-row"><div class="copy"><b>Product subtotal</b><span>Vendor-listed prices, before any verified coupon.</span></div><strong>'+money(sub)+'</strong></div>'+
      (selectedDeliveryQuote?'<div class="ml-profile-row"><div class="copy"><b>Rider delivery fee</b><span>'+esc(selectedDeliveryQuote.riderName||'Selected rider')+' · locked at order placement.</span></div><strong>'+money(selectedDeliveryQuote.deliveryFee)+'</strong></div>':'<div class="ml-profile-row"><div class="copy"><b>Rider delivery fee</b><span>Select an available rider to see the price.</span></div><strong>—</strong></div>')+
      (selectedDeliveryQuote?'<div class="ml-checkout-payable"><span>'+(S.appliedCoupon&&S.appliedCoupon.code?'Estimated total after coupon':'Total to pay')+'</span><strong>'+(selectedCheckoutTotalReady?money(selectedCheckoutTotal):'Refreshing…')+'</strong></div>':'<div class="ml-checkout-payable"><span>Total to pay</span><strong>Awaiting rider price</strong></div>')+
      (S.appliedCoupon&&S.appliedCoupon.code?'<small class="ml-checkout-coupon-note">Your coupon will be validated again when the order is placed. The total above uses the current server-validated coupon amount.</small>':'')+
      '<small class="ml-checkout-no-hidden-fees">Your checkout shows one all-in payable total. The displayed rider fare is fixed for this order; the payment step will use the same order total.</small></div>'+
      (addresses.length&&selectedDeliveryQuote&&selectedCheckoutTotalReady?'<button class="ml-btn ml-btn-primary" data-ml-place-order style="width:100%;margin-top:12px" onclick="window.ML_Premium.placeOrder()">'+(selectedMethod==='wallet'?'Pay '+money(selectedCheckoutTotal)+' with DAHA Wallet →':selectedMethod==='cod'?'Place order · Pay on Delivery':'Continue to pay '+money(selectedCheckoutTotal)+' →')+'</button>':'<button class="ml-btn ml-btn-primary" style="width:100%;margin-top:12px" disabled>'+(addresses.length?(selectedDeliveryQuote?'Refreshing your total…':'Choose an available rider first'):'Select a delivery address first')+'</button>')+
      '</div>';
  }
  function selectDeliveryQuote(id){
    var cache=S.deliveryQuoteCache;
    var option=cache&&Array.isArray(cache.options)?cache.options.find(function(q){return String(q.quoteId)===String(id);}):null;
    if(!option||new Date(option.expiresAt).getTime()<=Date.now()){S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';toast('That delivery price has expired. Refresh the rider prices.','warning');renderLiveCart();return;}
    S.selectedDeliveryQuoteId=String(option.quoteId);
    renderLiveCart();
  }
  function selectAddress(id){S.delivAddressId=String(id);S.deliveryAddressId=String(id);S.deliveryQuoteCache=null;S.selectedDeliveryQuoteId='';renderLiveCart();}
  function selectPayment(label){
    var method=normalizePaymentChoice(label),allowed=livePaymentOptions(S.paymentCapabilities).some(function(option){return option[1]===method;});
    if(!allowed){toast('That payment method is not currently enabled.','warning');return;}
    S.selPay=method==='cod'?'Cash on Delivery':method==='wallet'?'DAHA Wallet':method==='modempay'?'Secure mobile-money checkout':method==='afrimoney'?'AfriMoney':method==='qmoney'?'QMoney':'Wave';
    renderLiveCart();
  }
  function choosePaymentFromSettings(label){
    var method=normalizePaymentChoice(label),allowed=livePaymentOptions(S.paymentCapabilities).some(function(option){return option[1]===method;});
    if(!allowed){toast('That payment method is not currently enabled. Refresh checkout to check availability.','warning');return;}
    S.selPay=method==='cod'?'Cash on Delivery':method==='wallet'?'DAHA Wallet':method==='modempay'?'Secure mobile-money checkout':method==='afrimoney'?'AfriMoney':method==='qmoney'?'QMoney':'Wave';
    toast('Payment method selected. Review it in checkout before placing your order.','success');
    switchTab('cart');
  }
  function setCoupon(){var el=G('ml-cart-coupon'),code=el&&el.value.trim().toUpperCase();S.appliedCoupon=code?{code:code}:null;toast(code?'Coupon will be validated securely at order placement.':'Coupon removed.','info');renderLiveCart();}
  function manageAddresses(){switchTab('profile');renderAddresses();}
  async function loadProfile(){
    if(!apiOk())return;
    try{
      var r=await ML_API.customers.getProfile();liveProfile=r.data||liveProfile;
      if(liveProfile){S.profileName=liveProfile.full_name||S.profileName||'';S.profilePhone=liveProfile.phone||S.profilePhone||'';S.profilePhoto=liveProfile.profile_photo_url||null;
      // The server profile is the source of truth. Clear stale browser photos
      // when the account no longer has a saved image instead of keeping an old URL.
      try{
        if(S.profilePhoto){
          localStorage.setItem('ml_profile_photo_url',S.profilePhoto);
          var previewUrl=localStorage.getItem('ml_profile_photo_preview_url');
          if(previewUrl&&previewUrl!==S.profilePhoto){
            localStorage.removeItem('ml_profile_photo_preview');
            localStorage.removeItem('ml_profile_photo_preview_url');
          }
        }else{
          localStorage.removeItem('ml_profile_photo_url');
          localStorage.removeItem('ml_profile_photo_preview');
          localStorage.removeItem('ml_profile_photo_preview_url');
        }
      }catch(photoStorageError){}
      if(S.user){S.user.profilePhotoUrl=S.profilePhoto;S.user.avatarUrl=S.profilePhoto;}}
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
  async function makeProfilePhotoPreview(file){
    if(typeof createImageBitmap==='function'){
      var bitmap=await createImageBitmap(file);
      var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
      canvas.width=512;canvas.height=512;
      var scale=Math.max(512/bitmap.width,512/bitmap.height),sw=512/scale,sh=512/scale,sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;
      if(ctx)ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,512,512);
      if(bitmap.close)bitmap.close();
      if(ctx)return canvas.toDataURL('image/jpeg',0.78);
    }
    return await new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onerror=function(){reject(new Error('Could not prepare a local preview for this photo.'));};
      reader.onload=function(){
        var image=new Image();
        image.onerror=function(){reject(new Error('Could not prepare a local preview for this photo.'));};
        image.onload=function(){
          var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
          canvas.width=512;canvas.height=512;
          if(!ctx){resolve('');return;}
          var scale=Math.max(512/image.naturalWidth,512/image.naturalHeight),sw=512/scale,sh=512/scale;
          ctx.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,0,0,512,512);
          resolve(canvas.toDataURL('image/jpeg',0.78));
        };
        image.src=String(reader.result||'');
      };
      reader.readAsDataURL(file);
    });
  }
  function verifyProfilePhotoImage(url){
    return new Promise(function(resolve,reject){
      var image=new Image(),settled=false;
      var timeout=setTimeout(function(){finish(new Error('The uploaded photo could not be loaded from MarketLink storage. Please try again.'));},15000);
      function finish(error){
        if(settled)return;settled=true;clearTimeout(timeout);
        image.onload=null;image.onerror=null;
        if(error)reject(error);else resolve(true);
      }
      image.onload=function(){if(image.naturalWidth>0&&image.naturalHeight>0)finish();else finish(new Error('MarketLink returned an image that could not be displayed.'));};
      image.onerror=function(){finish(new Error('The photo was uploaded but could not be displayed from MarketLink storage. Please try again.'));};
      image.src=String(url)+(String(url).indexOf('?')>=0?'&':'?')+'mlphotocheck='+Date.now();
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
    var oldPhoto=liveProfile&&liveProfile.profile_photo_url||null;
    var uploadedUrl=null,previewUrl='';
    try{previewUrl=await makeProfilePhotoPreview(file);}catch(previewError){}
    try{
      toast('Uploading your profile photo…','info');
      // The upload endpoint now stores the image and links it to this customer
      // in one backend operation. This avoids a second profile update request
      // racing the upload or failing after the file has already been stored.
      var uploaded=await ML_API.uploads.upload(file,'profile-photo');
      uploadedUrl=uploaded&&uploaded.url;
      if(!uploadedUrl||!/^https?:\/\//i.test(uploadedUrl))throw {error:'MarketLink did not receive a valid saved image URL. Please retry or contact support.'};
      try{
        if(previewUrl){
          localStorage.setItem('ml_profile_photo_preview',previewUrl);
          localStorage.setItem('ml_profile_photo_preview_url',uploadedUrl);
        }
      }catch(previewStorageError){}
      // Verify the persisted customer record, but keep the server-linked image
      // if a later read is interrupted: the upload endpoint has already saved it.
      var verifiedResponse=await ML_API.customers.getProfile();
      var verifiedProfile=verifiedResponse&&verifiedResponse.data;
      if(!verifiedProfile||String(verifiedProfile.profile_photo_url||'')!==String(uploadedUrl)){
        throw {error:'The image reached MarketLink storage, but the profile refresh did not confirm the saved link. Refresh your profile before retrying.'};
      }
      // A local preview remains available if a mobile browser temporarily cannot
      // decode the server image URL. It never replaces the backend URL in CRM.
      await verifyProfilePhotoImage(uploadedUrl).catch(function(){return false;});
      liveProfile=verifiedProfile;
      S.profilePhoto=uploadedUrl;
      if(S.user){S.user.profilePhotoUrl=uploadedUrl;S.user.avatarUrl=uploadedUrl;}
      if(typeof window.mlRefreshDashboardAvatar==='function')window.mlRefreshDashboardAvatar(uploadedUrl,S.profileName||S.user&&S.user.name||'');
      try{
        localStorage.setItem('ml_profile_photo_url',uploadedUrl);
        if(previewUrl){
          localStorage.setItem('ml_profile_photo_preview',previewUrl);
          localStorage.setItem('ml_profile_photo_preview_url',uploadedUrl);
        }
      }catch(storageError){}
      renderPremiumProfile();
      if(typeof renderPremiumHome==='function')renderPremiumHome();
      toast('Your profile photo has been saved and verified.','success');
      if(oldPhoto&&oldPhoto!==uploadedUrl){
        try{await ML_API.uploads.deleteByUrl(oldPhoto);}catch(cleanupError){}
      }
      return true;
    }catch(e){
      // Never delete a profile image after the backend has returned its URL:
      // it may already be linked to the customer and visible in Admin CRM.
      // The backend upload endpoint cleans up only if it cannot save the link.
      toast(e.error||e.message||'Could not save your profile photo. Please try again.','error');
      return false;
    }
  }
  function closeProfilePhotoViewer(){
    var modal=document.getElementById('ml-profile-photo-viewer');
    if(modal)modal.remove();
    document.body.classList.remove('ml-photo-viewer-open');
  }
  function openProfilePhotoViewer(){
    closeProfilePhotoViewer();
    var p=liveProfile||{},photo=p.profile_photo_url||S.profilePhoto||S.user&&(S.user.profilePhotoUrl||S.user.avatarUrl)||null;
    try{photo=photo||localStorage.getItem('ml_profile_photo_url')||null;}catch(e){}
    var preview=null;try{preview=localStorage.getItem('ml_profile_photo_preview');}catch(e){}
    var image=photo?'<img class="ml-photo-viewer-image" src="'+esc(photo)+'" alt="Your profile photo" onerror="this.onerror=null;'+(preview?'this.src=\''+esc(preview)+'\';':'this.style.display=\'none\';')+'">':defaultAvatarMarkup();
    var modal=document.createElement('div');modal.id='ml-profile-photo-viewer';modal.className='ml-photo-viewer';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Profile photo options');
    modal.innerHTML='<div class="ml-photo-viewer-panel" onclick="event.stopPropagation()"><button type="button" class="ml-photo-viewer-close" onclick="window.ML_Premium.closePhotoViewer()" aria-label="Close photo preview">×</button><div class="ml-photo-viewer-heading">Your profile photo</div><div class="ml-photo-viewer-image-wrap">'+image+'</div><div class="ml-photo-viewer-actions"><button type="button" class="ml-photo-viewer-action ml-photo-viewer-primary" onclick="window.ML_Premium.pickPhoto()">✏️ Edit / Replace</button><button type="button" class="ml-photo-viewer-action" onclick="window.ML_Premium.takePhoto()">📷 Take photo</button>'+(photo?'<button type="button" class="ml-photo-viewer-action ml-photo-viewer-danger" onclick="window.ML_Premium.removeProfilePhoto()">Remove photo</button>':'')+'<button type="button" class="ml-photo-viewer-action ml-photo-viewer-secondary" onclick="window.ML_Premium.closePhotoViewer()">Close</button></div><p class="ml-photo-viewer-hint">Tap outside or Close to return to your profile.</p></div>';
    modal.addEventListener('click',function(e){if(e.target===modal)closeProfilePhotoViewer();});
    document.body.appendChild(modal);document.body.classList.add('ml-photo-viewer-open');
    var close=modal.querySelector('.ml-photo-viewer-close');if(close)close.focus();
  }
  function stopProfileCamera(){
    var modal=document.getElementById('ml-profile-camera-modal');
    if(modal){
      var video=modal.querySelector('video');
      if(video&&video.srcObject){video.srcObject.getTracks().forEach(function(track){track.stop();});video.srcObject=null;}
      modal.remove();
    }
    document.body.classList.remove('ml-photo-viewer-open');
  }
  async function takeProfilePhoto(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      toast('Camera access is not available in this browser. Use Edit / Replace to choose a photo.','error');
      return;
    }
    stopProfileCamera();
    var modal=document.createElement('div');
    modal.id='ml-profile-camera-modal';modal.className='ml-photo-viewer ml-profile-camera-modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Take a profile photo');
    modal.innerHTML='<div class="ml-photo-viewer-panel ml-camera-panel"><button type="button" class="ml-photo-viewer-close" aria-label="Close camera">×</button><div class="ml-photo-viewer-heading">Take your MarketLink photo</div><div class="ml-camera-preview"><video autoplay playsinline muted></video></div><p class="ml-photo-viewer-hint">Allow camera access, position your face, then take your photo.</p><div class="ml-photo-viewer-actions"><button type="button" class="ml-photo-viewer-action ml-photo-viewer-primary" data-ml-camera-capture>Take photo</button><button type="button" class="ml-photo-viewer-action ml-photo-viewer-secondary" data-ml-camera-cancel>Cancel</button></div></div>';
    document.body.appendChild(modal);document.body.classList.add('ml-photo-viewer-open');
    modal.addEventListener('click',function(e){if(e.target===modal)stopProfileCamera();});
    modal.querySelector('.ml-photo-viewer-close').addEventListener('click',stopProfileCamera);
    modal.querySelector('[data-ml-camera-cancel]').addEventListener('click',stopProfileCamera);
    var capture=modal.querySelector('[data-ml-camera-capture]');capture.disabled=true;
    try{
      var stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'user'},width:{ideal:1280},height:{ideal:1280}}});
      var video=modal.querySelector('video');video.srcObject=stream;
      await video.play();
      capture.disabled=false;
      capture.addEventListener('click',async function(){
        if(!video.videoWidth||!video.videoHeight){toast('The camera is still starting. Please wait a moment.','info');return;}
        var side=Math.min(video.videoWidth,video.videoHeight),sx=(video.videoWidth-side)/2,sy=(video.videoHeight-side)/2;
        var canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
        canvas.getContext('2d').drawImage(video,sx,sy,side,side,0,0,1024,1024);
        var file=await new Promise(function(resolve){canvas.toBlob(function(blob){resolve(blob?new File([blob],'marketlink-profile.jpg',{type:'image/jpeg',lastModified:Date.now()}):null);},'image/jpeg',0.9);});
        if(!file){toast('Could not capture the photo. Please try again.','error');return;}
        stopProfileCamera();
        await saveProfilePhoto(file);
      });
    }catch(cameraError){
      stopProfileCamera();
      var message=cameraError&&cameraError.name==='NotAllowedError'?'Please allow camera access in your browser settings, then try again.':cameraError&&cameraError.name==='NotFoundError'?'No camera was found on this device. Use Edit / Replace to choose a photo.':'The camera could not be opened. Check camera permission and try again.';
      toast(message,'error');
    }
  }
  function pickProfilePhoto(){
    var el=document.getElementById('ml-profile-photo-input');
    if(el)el.click();
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
      closeProfilePhotoViewer();
      if(S.user){S.user.profilePhotoUrl=null;S.user.avatarUrl=null;}
      if(typeof window.mlRefreshDashboardAvatar==='function')window.mlRefreshDashboardAvatar(null,S.profileName||S.user&&S.user.name||'');
      try{localStorage.removeItem('ml_profile_photo_preview');localStorage.removeItem('ml_profile_photo_preview_url');localStorage.removeItem('ml_profile_photo_url');}catch(storageError){}
      renderPremiumProfile();
      if(typeof renderPremiumHome==='function')renderPremiumHome();
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
    var link=(typeof buildAffiliateShareLink==='function'&&buildAffiliateShareLink())||'Your MarketLink sharing link will appear when your profile is ready.';
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK AFFILIATE PROGRAMME</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Share MarketLink with your community.</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div>'+
      '<section class="ml-affiliate-hero"><div class="ml-affiliate-hero-copy"><span class="ml-affiliate-label">CUSTOMER SHARING LINK</span><h4>Help friends discover local businesses on MarketLink.</h4><p>Share your MarketLink link with friends and family. Your sharing link helps more people discover trusted vendors and delivery services across The Gambia.</p><small>The customer sharing link is for discovery and tracking only. It does not earn commissions or cash rewards.</small></div><div class="ml-affiliate-hero-art ml-affiliate-hero-photo"><img class="ml-affiliate-hero-image" src="./assets/promo-shopping.webp" alt="Customers discovering products at a local supermarket" loading="lazy" decoding="async" onerror="this.onerror=null;this.style.display=&quot;none&quot;;this.parentElement.classList.add(&quot;ml-affiliate-hero-photo-failed&quot;)"><div class="ml-affiliate-art-label"><b>Share</b><span>MARKETLINK WITH FRIENDS</span></div></div></section>'+
      '<div class="ml-stat-grid ml-affiliate-stats"><div class="ml-stat"><div class="ml-stat-label">Link visits</div><div class="ml-stat-value">'+Number(S.affiliateClicks||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Invited customer orders</div><div class="ml-stat-value">'+Number(S.affiliateOrders||0)+'</div></div></div>'+
      '<div class="ml-profile-card ml-affiliate-link-card"><div class="ml-affiliate-link-head"><div><b>Your MarketLink sharing link</b><span>Share it on WhatsApp or with friends and family.</span></div><span>🔗</span></div><div class="ml-affiliate-link-field"><input readonly aria-label="MarketLink sharing link" value="'+esc(link)+'"><button class="ml-btn ml-btn-primary" onclick="copyAffiliateLink()">Copy link</button></div><div class="ml-affiliate-footnote">Sharing through this customer link is not paid. To earn eligible commissions, apply to become an approved MarketLink Affiliate Marketer.</div></div>'+
      '<div class="ml-profile-card ml-affiliate-link-card"><div class="ml-affiliate-link-head"><div><b>Want to earn as an official marketer?</b><span>Apply separately to become a MarketLink Affiliate Marketer. Approved marketers receive access to a dedicated workspace and eligible commission tools.</span></div><span>↗</span></div><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.openProfilePage(&quot;affiliate-marketer&quot;)">Become an Affiliate Marketer</button></div></div>';
  }

  async function renderPremiumAffiliateMarketerPage(root){
    if(!apiOk()){root.innerHTML='<div class="ml-profile-shell"><p>Please sign in to access the Affiliate Marketer programme.</p></div>';return;}
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">MARKETLINK PARTNER PROGRAMME</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Affiliate Marketer workspace</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div><div class="ml-loading">Checking your application status…</div></div>';
    try{
      var statusResponse=await ML_API.affiliates.marketerStatus();
      var statusData=statusResponse&&statusResponse.data||statusResponse||{};
      var state=String(statusData.marketerStatus||'not_applied');
      if(state==='approved'){
        var dashResponse=await ML_API.affiliates.marketerDashboard();
        var d=dashResponse&&dashResponse.data||dashResponse||{};
        var link=(typeof buildAffiliateShareLink==='function'&&buildAffiliateShareLink())||'';
        root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">APPROVED AFFILIATE MARKETER</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Your partner dashboard</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div>'+
          '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Marketer link visits</div><div class="ml-stat-value">'+Number(d.referralClicks||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Qualifying orders</div><div class="ml-stat-value">'+Number(d.qualifyingOrders||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Lifetime earned</div><div class="ml-stat-value">'+money(d.lifetimeEarned||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">DAHA Wallet</div><div class="ml-stat-value">'+money(d.walletBalance||0)+'</div></div></div>'+
          '<div class="ml-profile-card ml-affiliate-link-card"><div class="ml-affiliate-link-head"><div><b>Your official marketer link</b><span>Share this tracked link on WhatsApp, social media and your community channels.</span></div><span>↗</span></div><div class="ml-affiliate-link-field"><input readonly aria-label="Official affiliate marketer link" value="'+esc(link)+'"><button class="ml-btn ml-btn-primary" onclick="copyAffiliateLink()">Copy link</button></div><p class="ml-affiliate-footnote">Only eligible delivered orders with confirmed payment count. Commissions are funded from MarketLink’s platform commission and credited to DAHA Wallet after settlement. Delivery fees are excluded.</p><button class="ml-btn ml-btn-primary ml-daha-branded-button" type="button" onclick="window.ML_Premium.openProfilePage(\'wallet\')"><img src="./assets/daha-wallet-eagle.webp" alt="" loading="lazy"> Open DAHA Wallet</button></div>'+
          '<div class="ml-wallet-note">Keep your promotional content accurate and respectful. Fake accounts, self-referrals, spam, misleading claims and manipulated orders are prohibited.</div></div>';
        return;
      }
      if(state==='pending'){
        root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">APPLICATION RECEIVED</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Your documents are with our Admin team.</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div><div class="ml-wallet-note">Your Affiliate Marketer application is pending verification. You can continue using your normal customer account and sharing link while we review it. Paid commissions are not enabled until approval.</div></div>';
        return;
      }
      if(state==='suspended'){
        root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Affiliate Marketer access suspended</h3><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div><div class="ml-wallet-note">Your paid marketer tools are temporarily unavailable. Contact MarketLink Support if you need help. Any existing wallet balance remains visible in DAHA Wallet.</div></div>';
        return;
      }
      var rejection=statusData.application&&statusData.application.rejectionReason||'';
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">BECOME AN OFFICIAL PARTNER</div><h3 style="color:#fff;margin:7px 0 0;font-size:22px">Apply as an Affiliate Marketer</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.showProfileOverview()">← Profile</button></div>'+
        (state==='rejected'?'<div class="ml-wallet-note" style="margin-bottom:12px"><b>Previous application not approved.</b><p>'+esc(rejection||'Please review your documents and application details before resubmitting.')+'</p></div>':'')+
        '<p class="ml-affiliate-footnote">This is a separate professional programme. You must submit identity verification and a short marketing plan. Your application is reviewed by MarketLink Admin. You will not earn commissions before approval.</p>'+
        '<form id="ml-affiliate-marketer-form" class="ml-profile-card" style="padding:16px;display:grid;gap:12px">'+
        '<label>Full legal name<input name="legalName" required maxlength="150" autocomplete="name" placeholder="Name as shown on your ID"></label>'+
        '<label>Residential address<textarea name="residentialAddress" required maxlength="500" rows="2" placeholder="Your current address in The Gambia"></textarea></label>'+
        '<section class="ml-affiliate-channel-section"><div class="ml-affiliate-form-heading"><span class="ml-affiliate-step">01</span><div><b>Where do you reach your audience?</b><small>Select every platform you actively use.</small></div></div><div class="ml-affiliate-channel-grid">'+
        [['whatsapp','WhatsApp','whatsapp.svg'],['facebook','Facebook','brand-facebook.svg'],['instagram','Instagram','brand-instagram.svg'],['tiktok','TikTok','brand-tiktok.svg'],['youtube','YouTube','brand-youtube.svg'],['website','Website',''],['community','Community groups',''],['other','Other','']].map(function(x){var icon=x[2]?'<img class="ml-affiliate-social-icon" src="./assets/'+x[2]+'" alt="" loading="lazy">':'<span class="ml-affiliate-social-emoji">'+(x[0]==='website'?'🌐':x[0]==='community'?'👥':'✨')+'</span>';return '<label class="ml-affiliate-channel"><input type="checkbox" name="marketingChannels" value="'+x[0]+'"><span class="ml-affiliate-channel-icon">'+icon+'</span><span class="ml-affiliate-channel-name">'+x[1]+'</span><span class="ml-affiliate-channel-check">✓</span></label>';}).join('')+
        '</div></section>'+
        '<section class="ml-affiliate-social-section"><div class="ml-affiliate-form-heading"><span class="ml-affiliate-step">02</span><div><b>Add your social profiles</b><small>Enter the profile or channel address for platforms you selected. These fields are optional unless needed for review.</small></div></div><div class="ml-affiliate-social-fields">'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><img src="./assets/brand-facebook.svg" alt="" class="ml-affiliate-social-icon"><span>Facebook</span><small>Profile or page</small></span><input name="facebook" type="url" placeholder="https://facebook.com/your-page" autocomplete="url"></label>'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><img src="./assets/brand-instagram.svg" alt="" class="ml-affiliate-social-icon"><span>Instagram</span><small>Profile</small></span><input name="instagram" type="url" placeholder="https://instagram.com/username" autocomplete="url"></label>'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><img src="./assets/brand-tiktok.svg" alt="" class="ml-affiliate-social-icon"><span>TikTok</span><small>Creator profile</small></span><input name="tiktok" type="url" placeholder="https://tiktok.com/@username" autocomplete="url"></label>'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><img src="./assets/brand-youtube.svg" alt="" class="ml-affiliate-social-icon"><span>YouTube</span><small>Channel</small></span><input name="youtube" type="url" placeholder="https://youtube.com/@channel" autocomplete="url"></label>'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><img src="./assets/whatsapp.svg" alt="" class="ml-affiliate-social-icon"><span>WhatsApp</span><small>Business or contact</small></span><input name="whatsapp" type="url" placeholder="https://wa.me/220XXXXXXXXX" autocomplete="url"></label>'+
        '<label class="ml-affiliate-social-card"><span class="ml-affiliate-social-card-head"><span class="ml-affiliate-social-emoji">🌐</span><span>Website</span><small>Optional</small></span><input name="website" type="url" placeholder="https://yourwebsite.com" autocomplete="url"></label></div></section>'+
        '<label>How will you promote MarketLink?<textarea name="marketingPlan" required minlength="30" maxlength="3000" rows="4" placeholder="Describe your audience, promotion channels and how you plan to introduce MarketLink to them."></textarea></label>'+
        '<label>Identity document (PDF, JPG or PNG)<input name="identityDocument" type="file" accept="application/pdf,image/jpeg,image/png" required></label><label>Recent selfie (JPG or PNG)<input name="selfie" type="file" accept="image/jpeg,image/png" required></label><label>Proof of address (optional)<input name="addressProof" type="file" accept="application/pdf,image/jpeg,image/png"></label>'+
        '<button class="ml-btn ml-btn-primary" type="submit">Submit for Admin verification</button><small class="ml-affiliate-footnote">Your identity documents are private and visible only to authorised MarketLink reviewers. Maximum file size: 10 MB per document.</small></form></div>';
      var form=root.querySelector('#ml-affiliate-marketer-form');
      if(form)form.addEventListener('submit',async function(event){
        event.preventDefault();
        var button=form.querySelector('button[type="submit"]');
        var getFile=function(name){var el=form.querySelector('[name="'+name+'"]');return el&&el.files&&el.files[0]||null;};
        var identity=getFile('identityDocument'),selfie=getFile('selfie'),proof=getFile('addressProof');
        if(!identity||!selfie){toast('Please upload your identity document and selfie.','warning');return;}
        if([identity,selfie,proof].filter(Boolean).some(function(file){return file.size>10*1024*1024;})){toast('Each KYC document must be 10 MB or smaller.','warning');return;}
        var channels=Array.from(form.querySelectorAll('input[name="marketingChannels"]:checked')).map(function(el){return el.value;});
        if(!channels.length){toast('Choose at least one marketing channel.','warning');return;}
        button.disabled=true;button.textContent='Uploading private KYC documents…';
        try{
          var identityUpload=await ML_API.uploads.upload(identity,'affiliate-document');
          var selfieUpload=await ML_API.uploads.upload(selfie,'affiliate-selfie');
          var proofUpload=proof?await ML_API.uploads.upload(proof,'affiliate-document'):null;
          button.textContent='Submitting application…';
          var payload={
            legalName:form.elements.legalName.value,
            residentialAddress:form.elements.residentialAddress.value,
            marketingChannels:channels,
            marketingPlan:form.elements.marketingPlan.value,
            socialLinks:{facebook:form.elements.facebook.value,instagram:form.elements.instagram.value,tiktok:form.elements.tiktok.value,youtube:form.elements.youtube.value,whatsapp:form.elements.whatsapp.value,website:form.elements.website.value},
            identityDocumentUrl:identityUpload.url,
            selfieUrl:selfieUpload.url,
            addressProofUrl:proofUpload&&proofUpload.url||null
          };
          await ML_API.affiliates.applyMarketer(payload);
          toast('Application submitted. MarketLink Admin will review your documents.','success');
          await renderPremiumAffiliateMarketerPage(root);
        }catch(error){toast(error.error||error.message||'Could not submit your Affiliate Marketer application.','error');button.disabled=false;button.textContent='Submit for Admin verification';}
      });
    }catch(error){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-empty"><b>Could not load Affiliate Marketer status</b><span>'+esc(error.error||error.message||'Please try again.')+'</span><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.openProfilePage(\'affiliate-marketer\')">Retry</button></div></div>';
    }
  }

  function renderPremiumPolicyPage(root,key){
    var policies={
      terms:{title:'Terms of Service',sections:[
        ['Your account and PIN','Please use accurate registration details and keep your 4-digit PIN private. If you think someone else has accessed your account, contact MarketLink support so we can help you secure it.'],
        ['Marketplace listings','Vendors should keep product details, prices and availability accurate and offer goods they are allowed to sell. Stock and prices can change, so please review your basket before confirming an order.'],
        ['Orders and payments','Please check the order total and delivery fees before confirming. Use a payment option shown in checkout. When secure mobile-money payments are enabled, follow the instructions shown on screen. MarketLink marks an order as paid only after verification. If a payment is pending, check its status before trying again.'],
        ['Delivery responsibilities','Provide a complete address and reachable contact number. Riders must follow applicable road-safety rules and handle orders responsibly. Delivery estimates can vary with availability, traffic and other conditions.'],
        ['Getting help and using MarketLink fairly','Please use MarketLink respectfully and lawfully. If an order goes wrong, contact support with your order number so we can review the details and explain the available next steps. We may limit access when there is a clear safety or misuse concern.'],
        ['Applicable law','These terms are intended to operate in accordance with applicable laws of The Gambia. MarketLink may update in-app terms as the service develops.']
      ]},
      privPolicy:{title:'Privacy Policy',sections:[
        ['Information used by the service','Depending on the features you use, MarketLink may process your name, phone number, account details, saved addresses, orders, wallet and transaction records, support messages and application information. If you choose mobile-money payment, the mobile number you enter and transaction details may be shared with the selected payment partner to process and verify the transaction.'],
        ['Why we use it','Information supports sign-in, account management, order processing, delivery coordination, service security and help requests. Access to account-specific information requires an authenticated session.'],
        ['Payments and providers','Our payment partners process the information needed to complete and verify payments. Some networks may request a temporary PIN/OTP on the payment screen; this is sent to the provider for that transaction and is not saved in your MarketLink account. Please do not share payment codes in support chats or with vendors and riders. Providers have their own privacy notices and terms.'],
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
  var dahaDepositContext=null;
  var dahaDepositMethod='wave';
  var dahaPayoutProfile=null;
  var dahaWithdrawalDraft=null;

  var dahaWithdrawalNetworks={
    wave:{label:'Wave',src:'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/3e/d1/71/3ed171e6-f436-8498-530d-ab849ee8b55e/AppIcon-0-0-1x_U007emarketing-0-1-0-85-220.png/640x640bb.webp',fallback:'W'},
    afrimoney:{label:'AfriMoney',src:'https://images.ctfassets.net/apw2ksjbsqsd/2DR2fcBgaslZ8tFTQPD8wo/b723acb9a0098dd7b00958647cc25a11/afrimoney.png',fallback:'A'},
    qmoney:{label:'QMoney',src:'https://qmoney.gm/wp-content/uploads/2022/12/QMoney-logo-landscape-1.svg',fallback:'Q'},
    aps:{label:'APS',src:'https://fastly.mwm-storage.mwmcdn.com/raw_files/b5bcb3f6-40aa-44bf-ac5b-4b7d48e06dcf?format=webp&height=640',fallback:'APS'}
  };
  function dahaPayoutLogoMarkup(method){
    var meta=dahaWithdrawalNetworks[method]||dahaWithdrawalNetworks.wave;
    return '<span class="ml-payout-brand-logo"><img src="'+esc(meta.src)+'" alt="'+esc(meta.label)+'" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>'+esc(meta.fallback)+'</span></span>';
  }
  function dahaPayoutMethodDropdownMarkup(id,selected){
    selected=['wave','afrimoney'].indexOf(String(selected||'').toLowerCase())>=0?String(selected).toLowerCase():'wave';
    var active=['wave','afrimoney'];
    var options=['wave','afrimoney','qmoney','aps'].map(function(method){
      var meta=dahaWithdrawalNetworks[method],enabled=active.indexOf(method)>=0,isSelected=selected===method;
      var handler=enabled?' onclick="window.ML_Premium.selectWithdrawalNetwork(\''+esc(id)+'\',\''+method+'\')"':' disabled';
      return '<button type="button" class="ml-payout-brand-option'+(isSelected?' selected':'')+'"'+handler+'>'+dahaPayoutLogoMarkup(method)+
        '<span class="ml-payout-brand-copy"><b>'+esc(meta.label)+'</b><small>'+(enabled?'Available for withdrawals':'Not enabled for withdrawals yet')+'</small></span>'+
        '<span class="ml-payout-brand-status">'+(enabled?(isSelected?'✓':''):'Soon')+'</span></button>';
    }).join('');
    return '<div class="ml-payout-brand-picker" id="'+esc(id)+'-picker"><input type="hidden" id="'+esc(id)+'" value="'+esc(selected)+'">'+
      '<button type="button" class="ml-daha-input ml-payout-brand-trigger" id="'+esc(id)+'-trigger" aria-haspopup="listbox" aria-expanded="false" onclick="window.ML_Premium.toggleWithdrawalNetwork(\''+esc(id)+'\')">'+
      dahaPayoutLogoMarkup(selected)+'<span>'+esc(dahaWithdrawalNetworks[selected].label)+'</span><span class="ml-payout-brand-chevron">▾</span></button>'+
      '<div class="ml-payout-brand-menu" id="'+esc(id)+'-menu" role="listbox" hidden>'+options+'</div></div>';
  }
  function toggleDahaPayoutNetwork(id){
    var menu=G(id+'-menu'),trigger=G(id+'-trigger');
    if(!menu)return;
    menu.hidden=!menu.hidden;
    if(trigger)trigger.setAttribute('aria-expanded',menu.hidden?'false':'true');
  }
  function selectDahaPayoutNetwork(id,method){
    method=String(method||'').toLowerCase();
    if(['wave','afrimoney'].indexOf(method)<0){toast('This payout network is not active for DAHA withdrawals yet.','warning');return;}
    var hidden=G(id),trigger=G(id+'-trigger'),menu=G(id+'-menu');
    if(!hidden||!trigger)return;
    hidden.value=method;
    trigger.innerHTML=dahaPayoutLogoMarkup(method)+'<span>'+esc(dahaWithdrawalNetworks[method].label)+'</span><span class="ml-payout-brand-chevron">▾</span>';
    trigger.setAttribute('aria-expanded','false');
    if(menu)menu.hidden=true;
    if(id==='ml-daha-withdraw-method')cancelDahaWithdrawalReview();
  }

  var dahaWithdrawalServiceFeePct=2;
  async function renderPremiumWalletPage(root){
    if(!root)return;
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-loading">Loading DAHA Wallet…</div></div>';
    try{
      var isVendor=(S.roles||[]).indexOf('vendor')>=0;
      var isRider=(S.roles||[]).indexOf('rider')>=0;
      var requests=[
        ML_API.wallet.getBalance(),
        ML_API.wallet.transactions({page:1,limit:30}),
        ML_API.wallet.deposits({page:1,limit:10}),
        ML_API.wallet.withdrawals({page:1,limit:10}),
        ML_API.payments.methods()
      ];
      if(isVendor)requests.push(ML_API.wallet.getVendorPayoutProfile());
      else if(isRider)requests.push(ML_API.wallet.getRiderPayoutProfile());
      var results=await Promise.all(requests);
      var wallet=results[0]&&results[0].data||{};
      dahaWithdrawalServiceFeePct=Number(wallet.withdrawal_service_fee_pct==null?2:wallet.withdrawal_service_fee_pct);
      if(!Number.isFinite(dahaWithdrawalServiceFeePct)||dahaWithdrawalServiceFeePct<0||dahaWithdrawalServiceFeePct>10)dahaWithdrawalServiceFeePct=2;
      var txns=normalizeProducts(results[1]&&results[1].data);
      var deposits=normalizeProducts(results[2]&&results[2].data);
      var withdrawals=normalizeProducts(results[3]&&results[3].data);
      var capabilities=results[4]&&results[4].data||{};
      var configured=Boolean(capabilities.configured);
      var direct=Boolean(capabilities.directMobileMoney);
      S.paymentCapabilities=capabilities;
      var balance=Number(wallet.balance||0),available=Number(wallet.available_balance==null?balance:wallet.available_balance);
      var rails=(capabilities.methods||[]).filter(function(m){return ['wave','afrimoney','qmoney'].indexOf(String(m).toLowerCase())>=0;});
      var payoutProfile=(isVendor||isRider)?(results[5]&&results[5].data||{}):{};
      dahaPayoutProfile=payoutProfile;
      var payoutRoleLabel=isVendor?'vendor':'rider';
      var savedPayoutMethod=String(payoutProfile.payout_method||'wave').toLowerCase();
      var savedPayoutNumber=String(payoutProfile.account_number||'').replace(/\D/g,'');
      var savedPayoutPrefix=/^(87|86|83)\d{7}$/.test(savedPayoutNumber)?savedPayoutNumber.slice(0,2):'87';
      var savedPayoutSubscriber=/^(87|86|83)\d{7}$/.test(savedPayoutNumber)?savedPayoutNumber.slice(2):'';
       var payoutProfileMarkup=(isVendor||isRider)?'<section class="ml-profile-card ml-daha-panel" id="ml-daha-saved-payout"><div class="ml-daha-panel-head"><div><span>'+payoutRoleLabel.toUpperCase()+' PAYOUT SETTINGS</span><h4>Saved payout destination</h4></div><b>Wave / AfriMoney</b></div><p class="ml-daha-copy">Save the mobile-money destination where your DAHA '+payoutRoleLabel+' withdrawals should be sent. You can change it whenever your payout details change.</p><label class="ml-field-label" for="ml-daha-payout-method">Preferred payout service</label>'+dahaPayoutMethodDropdownMarkup('ml-daha-payout-method',savedPayoutMethod)+'<label class="ml-field-label" for="ml-daha-payout-prefix">Mobile network prefix</label><select id="ml-daha-payout-prefix" class="ml-daha-input"><option value="87"'+(savedPayoutPrefix==='87'?' selected':'')+'>Africell (87)</option><option value="83"'+(savedPayoutPrefix==='83'?' selected':'')+'>QCell (83)</option><option value="86"'+(savedPayoutPrefix==='86'?' selected':'')+'>Comium (86)</option></select><label class="ml-field-label" for="ml-daha-payout-number">Seven-digit subscriber number</label><input id="ml-daha-payout-number" class="ml-daha-input" type="tel" inputmode="numeric" autocomplete="off" maxlength="7" value="'+esc(savedPayoutSubscriber)+'" placeholder="Enter 7 digits"><small class="ml-daha-copy">Choose the SIM network and enter its seven subscriber digits. MarketLink combines the prefix and digits into the complete nine-digit payout number. This may differ from your sign-in number.</small><label class="ml-field-label" for="ml-daha-payout-name">Account holder name</label><input id="ml-daha-payout-name" class="ml-daha-input" type="text" maxlength="150" value="'+esc(payoutProfile.beneficiary_name||'')+'" placeholder="Name registered to the wallet"><button type="button" class="ml-btn ml-btn-primary ml-daha-submit" onclick="window.ML_Premium.saveDahaPayoutProfile()">Save payout destination</button><small class="ml-daha-copy">Payouts are subject to authorized review and verified transfer confirmation.</small></section>':'';

      // Keep the selector usable while external payment credentials are pending.
      // Unconfigured rails are clearly marked and the deposit action remains disabled.
      var depositChoices=rails.length?rails:['wave','afrimoney','qmoney'];
      if(depositChoices.indexOf(dahaDepositMethod)<0)dahaDepositMethod=depositChoices[0]||'wave';
      var railOptions=depositChoices.map(function(m){
        var k=String(m).toLowerCase(),label=k==='wave'?'Wave':k==='afrimoney'?'AfriMoney':'QMoney';
        return '<option value="'+esc(k)+'"'+(dahaDepositMethod===k?' selected':'')+'>'+label+(configured?'':' · Setup pending')+'</option>';
      }).join('');
      var depositMethodStatus=configured
        ?'Selected: '+(dahaDepositMethod==='wave'?'Wave':dahaDepositMethod==='afrimoney'?'AfriMoney':'QMoney')+'. Secure payment setup is available.'
        :'Selected: '+(dahaDepositMethod==='wave'?'Wave':dahaDepositMethod==='afrimoney'?'AfriMoney':'QMoney')+'. Provider credentials and webhook setup are still required. No money can be moved yet.';
      var pendingContext=dahaDepositContext&&dahaDepositContext.deposit?dahaDepositContext:null;
      var nextStep=pendingContext&&pendingContext.nextStep||{};
      var pinMode=String(nextStep.auth_mode||'').toLowerCase()==='pin'||String(nextStep.auth_mode||'').toLowerCase()==='otp';
      var confirmMode=Boolean(nextStep.confirmation_steps)||String(nextStep.auth_mode||'').toLowerCase()==='confirm';
      var depositContextMarkup='';
      if(pendingContext){
        var depositRef=pendingContext.deposit.id||'';
        var pendingMethodLabel=String(pendingContext.deposit.payment_method||dahaDepositMethod||'modempay').toUpperCase();
        depositContextMarkup='<div class="ml-daha-provider-step"><b>Secure deposit initiated</b><p>Deposit '+money(pendingContext.deposit.amount)+' via '+esc(pendingMethodLabel)+' is pending. DAHA only adds funds after the signed provider webhook confirms the matching transaction.</p>'+
          (pendingContext.redirectUrl?'<a class="ml-btn ml-btn-primary" target="_blank" rel="noopener noreferrer" href="'+esc(pendingContext.redirectUrl)+'">Continue to secure payment ↗</a>':'')+
          (confirmMode?'<p>'+esc(nextStep.confirmation_steps||'Approve the payment request on your phone, then confirm below.')+'</p><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueDahaDeposit(\'confirm\')">I approved the payment</button>':'')+
          (pinMode?'<label class="ml-field-label" for="ml-daha-provider-pin">Provider authorization code</label><input id="ml-daha-provider-pin" class="ml-daha-input" type="password" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="Enter provider code"><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.continueDahaDeposit(\'pin\')">Submit provider code</button>':'')+
          '<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.refreshWallet()">Refresh deposit status</button></div>';
      }
      root.innerHTML='<div class="ml-profile-shell ml-daha-shell">'+
        '<div class="ml-daha-topbar"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><div class="ml-daha-brand"><div><span>SECURE DIGITAL WALLET</span><h3>DAHA Wallet</h3><small>Powered by Royal FinTech</small></div><img src="./assets/daha-wallet-eagle.webp" alt="DAHA Wallet eagle logo" loading="eager"></div></div>'+
        '<section class="ml-wallet-hero ml-daha-balance"><span>Available to spend</span><strong>'+money(available)+'</strong><small>Your available DAHA Wallet balance</small><span class="ml-daha-ledger-note">Live balance from the secure MarketLink wallet ledger · GMD</span></section>'+
        '<section class="ml-daha-summary-grid" aria-label="DAHA Wallet overview">'+
          '<div><span>Total wallet balance</span><b>'+money(balance)+'</b><small>Before pending reserves</small></div>'+
          '<div><span>Reserved balance</span><b>'+money(Number(wallet.reserved_balance||0))+'</b><small>Pending payout requests</small></div>'+
          '<div><span>Cash-out service fee</span><b>'+dahaWithdrawalServiceFeePct.toFixed(2)+'%</b><small>'+(dahaWithdrawalServiceFeePct>0?'Customer cash-outs only · no checkout fee':'No second fee on marketplace payee withdrawals')+'</small></div>'+
        '</section>'+
        '<div class="ml-daha-actions"><button type="button" class="ml-btn ml-btn-primary" onclick="document.getElementById(\'ml-daha-deposit\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">＋ Add funds</button><button type="button" class="ml-btn ml-btn-secondary" onclick="document.getElementById(\'ml-daha-withdraw\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">↗ Cash out</button><button type="button" class="ml-btn ml-btn-secondary" onclick="document.getElementById(\'ml-daha-activity\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">↔ Activity</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.refreshWallet()">↻ Refresh</button></div>'+
        depositContextMarkup+
        '<section class="ml-profile-card ml-daha-panel" id="ml-daha-deposit"><div class="ml-daha-panel-head"><div><span>ADD MONEY</span><h4>Deposit into DAHA</h4></div><b>Secure payment</b></div>'+
        '<p class="ml-daha-copy">Choose an amount and payment rail. Wave, AfriMoney and QMoney are offered only when enabled by the active merchant payment configuration.</p>'+
        '<label class="ml-field-label" for="ml-daha-deposit-amount">Amount (GMD)</label><input id="ml-daha-deposit-amount" class="ml-daha-input" type="number" min="'+(direct?'1':'10')+'" step="0.01" inputmode="decimal" placeholder="e.g. 250.00">'+
        '<label class="ml-field-label" for="ml-daha-deposit-method">Payment method</label><select id="ml-daha-deposit-method" class="ml-daha-input" onchange="window.ML_Premium.selectDahaDepositMethod(this.value)">'+railOptions+'</select><small id="ml-daha-deposit-method-status" class="ml-daha-copy">'+esc(depositMethodStatus)+'</small>'+
         (direct?'<label class="ml-field-label" for="ml-daha-deposit-prefix">Mobile network</label><select id="ml-daha-deposit-prefix" class="ml-daha-input"><option value="87">Africell (87)</option><option value="83">QCell (83)</option><option value="86">Comium (86)</option></select><label class="ml-field-label" for="ml-daha-deposit-number">Seven-digit subscriber number</label><input id="ml-daha-deposit-number" class="ml-daha-input" type="tel" inputmode="numeric" maxlength="7" placeholder="Enter 7 digits">':'')+
        '<button type="button" class="ml-btn ml-btn-primary ml-daha-submit" '+(!configured?'disabled':'')+' onclick="window.ML_Premium.submitDahaDeposit()">Continue to secure deposit →</button>'+
        (!configured?'<div class="ml-wallet-note">Mobile-money deposits are not available yet. Deposits are disabled; your DAHA balance and wallet-funded checkout remain available.</div>':'<div class="ml-wallet-note">Funds are credited only after the backend verifies the signed payment confirmation, transaction reference, amount and GMD currency.</div>')+
        '</section>'+
        payoutProfileMarkup+
        '<section class="ml-profile-card ml-daha-panel" id="ml-daha-withdraw"><div class="ml-daha-panel-head"><div><span>MOVE MONEY OUT</span><h4>Request a withdrawal</h4></div><b>Minimum D 50</b></div>'+
        '<p class="ml-daha-copy">Enter the Wave or AfriMoney account that should receive your requested payout. It may be different from your MarketLink sign-in number. '+(dahaWithdrawalServiceFeePct>0?'A '+dahaWithdrawalServiceFeePct.toFixed(2)+'% DAHA Wallet service fee applies to customer cash-outs and is shown in the final review before your PIN.':'No second DAHA service fee is charged on vendor, rider or affiliate marketplace payouts. Their transfer costs are funded by the small provision already included in customer order totals.')+'</p>'+
        '<label class="ml-field-label" for="ml-daha-withdraw-amount">Amount to receive (GMD)</label><input id="ml-daha-withdraw-amount" class="ml-daha-input" type="number" min="50" step="0.01" inputmode="decimal" placeholder="Minimum 50.00"><small class="ml-daha-copy">'+(dahaWithdrawalServiceFeePct>0?'The amount entered is the amount requested for your payout. Your wallet will be debited by this amount plus the '+dahaWithdrawalServiceFeePct.toFixed(2)+'% customer cash-out service fee.':'The amount entered is the amount you receive. Your wallet is debited by that same amount; your marketplace payout transfer costs are funded by the order recovery already included in customer totals.')+'</small>'+
        '<label class="ml-field-label" for="ml-daha-withdraw-method">Payout network</label>'+dahaPayoutMethodDropdownMarkup('ml-daha-withdraw-method',savedPayoutMethod)+''+
         '<label class="ml-field-label" for="ml-daha-withdraw-prefix">Recipient mobile network</label><select id="ml-daha-withdraw-prefix" class="ml-daha-input"><option value="87"'+(savedPayoutPrefix==='87'?' selected':'')+'>Africell (87)</option><option value="83"'+(savedPayoutPrefix==='83'?' selected':'')+'>QCell (83)</option><option value="86"'+(savedPayoutPrefix==='86'?' selected':'')+'>Comium (86)</option></select><label class="ml-field-label" for="ml-daha-withdraw-number">Seven-digit subscriber number</label><input id="ml-daha-withdraw-number" class="ml-daha-input" type="tel" inputmode="numeric" autocomplete="off" maxlength="7" value="'+esc(savedPayoutSubscriber)+'" placeholder="Enter 7 digits"><small class="ml-daha-copy">Select the recipient mobile network and enter seven digits. MarketLink combines them into the full nine-digit number. The payout account can differ from your MarketLink login number.</small>'+
        '<small class="ml-daha-copy">Supported prefixes: 87, 86 or 83 (9 digits total, without +220). The receiver number can be different from your MarketLink login number.</small>'+
        '<label class="ml-field-label" for="ml-daha-withdraw-name">Account holder name</label><input id="ml-daha-withdraw-name" class="ml-daha-input" type="text" maxlength="150" value="'+esc(payoutProfile.beneficiary_name||'')+'" placeholder="Name registered to the wallet">'+
        '<button type="button" class="ml-btn ml-btn-primary ml-daha-submit" onclick="window.ML_Premium.reviewDahaWithdrawal()">Review withdrawal details →</button>'+
        '</section>'+
        '<div id="ml-daha-withdraw-review" class="ml-daha-withdraw-review" hidden></div>'+
        '<div class="ml-section-head" id="ml-daha-activity"><h3>Recent wallet activity</h3><button type="button" onclick="window.ML_Premium.refreshWallet()">Refresh</button></div>'+
        (txns.length?'<div class="ml-profile-card">'+txns.map(function(t){var credit=String(t.type||'').toLowerCase()==='credit',amount=Math.abs(Number(t.amount||0)),desc=t.description||t.category||t.type||'Wallet transaction';var date=t.created_at?new Date(t.created_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';return '<div class="ml-wallet-transaction"><span class="ml-wallet-tx-icon '+(credit?'credit':'debit')+'">'+(credit?'↓':'↑')+'</span><div class="copy"><b>'+esc(desc)+'</b><span>'+esc(date)+'</span></div><strong class="'+(credit?'credit':'debit')+'">'+(credit?'+':'−')+money(amount)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No wallet transactions yet</b><span>Confirmed deposits, purchases and payouts will appear here.</span></div>')+
        '<div class="ml-section-head" id="ml-daha-deposit-history"><h3>Deposit history</h3></div>'+
        (deposits.length?'<div class="ml-profile-card">'+deposits.map(function(d){var methodLabel=String(d.payment_method||'mobile money').toUpperCase();return '<div class="ml-wallet-transaction"><span class="ml-wallet-tx-icon credit">＋</span><div class="copy"><b>Wallet deposit · '+esc(methodLabel)+' · '+esc(String(d.status||'pending').replace(/_/g,' '))+'</b><span>'+esc(d.created_at?new Date(d.created_at).toLocaleString():'Date unavailable')+'</span></div><strong>'+money(d.amount)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><span>No deposits have been started.</span></div>')+
        '<div class="ml-section-head" id="ml-daha-withdraw-history"><h3>Withdrawal requests</h3></div>'+
        (withdrawals.length?'<div class="ml-profile-card">'+withdrawals.map(function(w){return '<div class="ml-wallet-transaction"><span class="ml-wallet-tx-icon debit">↗</span><div class="copy"><b>'+esc(String(w.payout_method||'').toUpperCase())+' · '+esc(String(w.status||'processing').replace(/_/g,' '))+'</b><span>'+esc(w.created_at?new Date(w.created_at).toLocaleString():'Date unavailable')+'</span></div><strong>'+money(w.amount)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><span>No withdrawal requests yet.</span></div>')+
        '<footer class="ml-app-footer"><span>DAHA Wallet · Powered by MarketLink Gambia</span></footer></div>';
    }catch(e){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>DAHA Wallet</h3></div><div class="ml-empty"><b>Wallet data unavailable</b><span>'+esc(e.error||'The live DAHA Wallet service could not be reached.')+'</span><button type="button" class="ml-btn ml-btn-primary" style="margin-top:14px" onclick="window.ML_Premium.refreshWallet()">Retry</button></div></div>';
    }
  }
  function selectDahaDepositMethod(method){
    var allowed=(S.paymentCapabilities&&Array.isArray(S.paymentCapabilities.methods)&&S.paymentCapabilities.methods.length)
      ?S.paymentCapabilities.methods.map(function(item){return String(item).toLowerCase();})
      :['wave','afrimoney','qmoney'];
    method=String(method||'').toLowerCase();
    if(allowed.indexOf(method)<0){toast('That deposit method is not available.','warning');return;}
    dahaDepositMethod=method;
    var label=method==='wave'?'Wave':method==='afrimoney'?'AfriMoney':'QMoney';
    var configured=Boolean(S.paymentCapabilities&&S.paymentCapabilities.configured);
    var status=G('ml-daha-deposit-method-status');
    if(status)status.textContent=configured
      ?'Selected: '+label+'. Secure payment setup is available.'
      :'Selected: '+label+'. Provider credentials and webhook setup are still required. No money can be moved yet.';
  }
  async function submitDahaDeposit(){
    var amount=Number(G('ml-daha-deposit-amount')&&G('ml-daha-deposit-amount').value||0);
    var method=String(G('ml-daha-deposit-method')&&G('ml-daha-deposit-method').value||'modempay');
     var depositDigits=String(G('ml-daha-deposit-number')&&G('ml-daha-deposit-number').value||'').replace(/\D/g,'');
     var depositPrefix=String(G('ml-daha-deposit-prefix')&&G('ml-daha-deposit-prefix').value||'87');
     var accountNumber=/^(87|83|86)$/.test(depositPrefix)&&/^\d{7}$/.test(depositDigits)?depositPrefix+depositDigits:'';
    if(!(amount>0)){toast('Enter a valid deposit amount.','error');return;}
     if(S.paymentCapabilities&&S.paymentCapabilities.directMobileMoney&&!/^(87|86|83)\d{7}$/.test(accountNumber)){toast('Select your mobile network and enter the 7 digits after its prefix.','error');if(G('ml-daha-deposit-number'))G('ml-daha-deposit-number').focus();return;}
    try{
      var response=await ML_API.wallet.createDeposit({amount:amount,method:method,accountNumber:accountNumber||undefined});
      var data=response&&response.data||response;
      dahaDepositContext={deposit:data.deposit,redirectUrl:data.redirectUrl||null,nextStep:data.nextStep||null,action:data.action||'pending'};
      toast('DAHA deposit initiated. Your balance will update after the payment is confirmed.','success');
      await renderPremiumWalletPage(G('profile-body'));
    }catch(e){toast(e.error||'Could not start the DAHA Wallet deposit.','error');}
  }
  async function continueDahaDeposit(action){
    if(!dahaDepositContext||!dahaDepositContext.deposit){toast('There is no active DAHA deposit step.','error');return;}
    var pin=String(G('ml-daha-provider-pin')&&G('ml-daha-provider-pin').value||'');
    try{
      await ML_API.wallet.continueDeposit(dahaDepositContext.deposit.id,action,pin);
      toast('Provider step submitted. Waiting for secure payment confirmation.','info');
      await renderPremiumWalletPage(G('profile-body'));
    }catch(e){toast(e.error||'Could not submit the provider confirmation.','error');}
  }
  async function saveDahaPayoutProfile(){
    var roles=S.roles||[];
    var isVendor=roles.indexOf('vendor')>=0;
    var isRider=roles.indexOf('rider')>=0;
    if(!isVendor&&!isRider){toast('Only vendor and rider accounts can save a payout destination.','error');return;}
    var payoutMethod=String(G('ml-daha-payout-method')&&G('ml-daha-payout-method').value||'wave');
     var payoutDigits=String(G('ml-daha-payout-number')&&G('ml-daha-payout-number').value||'').replace(/\D/g,'');
     var payoutPrefix=String(G('ml-daha-payout-prefix')&&G('ml-daha-payout-prefix').value||'87');
     var accountNumber=/^(87|83|86)$/.test(payoutPrefix)&&/^\d{7}$/.test(payoutDigits)?payoutPrefix+payoutDigits:'';
    var beneficiaryName=String(G('ml-daha-payout-name')&&G('ml-daha-payout-name').value||'').trim();
     if(!/^(87|86|83)\d{7}$/.test(accountNumber)){toast('Choose a mobile network and enter the 7 digits after its prefix.','error');return;}
    if(!beneficiaryName){toast('Enter the payout account holder name.','error');return;}
    try{
      var payload={payoutMethod:payoutMethod,accountNumber:accountNumber,beneficiaryName:beneficiaryName};
      var response=isVendor
        ?await ML_API.wallet.saveVendorPayoutProfile(payload)
        :await ML_API.wallet.saveRiderPayoutProfile(payload);
      dahaPayoutProfile=response&&response.data||response||null;
      toast('DAHA payout destination saved securely.','success');
      await renderPremiumWalletPage(G('profile-body'));
    }catch(e){toast(e.error||'Could not save the payout destination.','error');}
  }
  function reviewDahaWithdrawal(){
    var amount=Number(G('ml-daha-withdraw-amount')&&G('ml-daha-withdraw-amount').value||0);
    var payoutMethod=String(G('ml-daha-withdraw-method')&&G('ml-daha-withdraw-method').value||'').toLowerCase();
     var subscriber=String(G('ml-daha-withdraw-number')&&G('ml-daha-withdraw-number').value||'').replace(/\D/g,'');
     var prefix=String(G('ml-daha-withdraw-prefix')&&G('ml-daha-withdraw-prefix').value||'87');
     var account=/^(87|83|86)$/.test(prefix)&&/^\d{7}$/.test(subscriber)?prefix+subscriber:'';
    var name=String(G('ml-daha-withdraw-name')&&G('ml-daha-withdraw-name').value||'').trim();
    if(!(amount>=50)){toast('The minimum withdrawal is D 50.00.','error');return;}
    if(['wave','afrimoney'].indexOf(payoutMethod)<0){toast('Choose Wave or AfriMoney.','error');return;}
     if(!/^(87|86|83)\d{7}$/.test(account)){toast('Select the receiver network and enter the 7 digits after its prefix.','error');if(G('ml-daha-withdraw-number'))G('ml-daha-withdraw-number').focus();return;}
    if(!name){toast('Enter the recipient account holder name.','error');return;}
    var payoutAmount=Math.round(amount*100)/100;
    var serviceFeePct=Number(dahaWithdrawalServiceFeePct);
    var serviceFeeAmount=Math.round((payoutAmount*serviceFeePct/100+Number.EPSILON)*100)/100;
    var walletDebitAmount=Number((payoutAmount+serviceFeeAmount).toFixed(2));
    dahaWithdrawalDraft={amount:payoutAmount,payoutMethod:payoutMethod,accountNumber:account,beneficiaryName:name,serviceFeePct:serviceFeePct,serviceFeeAmount:serviceFeeAmount,walletDebitAmount:walletDebitAmount};
    var review=G('ml-daha-withdraw-review');
    if(!review){toast('The withdrawal review panel could not be opened. Refresh the wallet and try again.','error');return;}
    var label=payoutMethod==='wave'?'Wave':'AfriMoney';
    var masked=account.slice(0,2)+'*******';
    review.hidden=false;
    review.innerHTML='<div class="ml-daha-review-head"><span>FINAL SECURITY CHECK</span><b>Review withdrawal details</b><p>Confirm the receiving account and full DAHA Wallet charge before you authorize the request.</p></div>'+
      '<div class="ml-daha-review-row"><span>Amount sent to your account</span><strong>'+money(dahaWithdrawalDraft.amount)+'</strong></div>'+
      '<div class="ml-daha-review-row"><span>DAHA Wallet withdrawal service fee ('+dahaWithdrawalDraft.serviceFeePct.toFixed(2)+'%)</span><strong>'+money(dahaWithdrawalDraft.serviceFeeAmount)+'</strong></div>'+
      '<div class="ml-daha-review-row ml-daha-review-total"><span>Total to be debited from your wallet</span><strong>'+money(dahaWithdrawalDraft.walletDebitAmount)+'</strong></div>'+
      '<div class="ml-daha-review-row"><span>Destination network</span><strong>'+label+'</strong></div>'+
      '<div class="ml-daha-review-row"><span>Receiver number</span><strong>'+esc(masked)+'</strong></div>'+
      '<div class="ml-daha-review-row"><span>Account holder</span><strong>'+esc(name)+'</strong></div>'+
      '<label class="ml-field-label" for="ml-daha-withdraw-pin">Your 4-digit MarketLink PIN</label>'+
      '<input id="ml-daha-withdraw-pin" class="ml-daha-input ml-daha-pin-input" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="••••">'+
      '<small class="ml-daha-copy">The '+dahaWithdrawalDraft.serviceFeePct.toFixed(2)+'% DAHA Wallet withdrawal service fee applies to wallet cash-outs, including money deposited without a marketplace purchase. It is separate from the 5% marketplace commission and does not change product prices or the customer checkout total. The actual provider transfer fee is reconciled by MarketLink; any cost above this fee is absorbed by the platform.</small>'+
      '<small class="ml-daha-copy">This is the same PIN you use to sign in to MarketLink. It is verified securely and is never saved with your withdrawal.</small>'+
      '<div class="ml-daha-review-actions"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.cancelDahaWithdrawalReview()">Edit details</button><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.confirmDahaWithdrawal()">Confirm with PIN →</button></div>';
    review.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function cancelDahaWithdrawalReview(){
    dahaWithdrawalDraft=null;
    var review=G('ml-daha-withdraw-review');
    if(review){review.hidden=true;review.innerHTML='';}
  }
  async function confirmDahaWithdrawal(){
    if(!dahaWithdrawalDraft){toast('Review your withdrawal details first.','error');return;}
    var pin=String(G('ml-daha-withdraw-pin')&&G('ml-daha-withdraw-pin').value||'');
    if(!/^\d{4}$/.test(pin)){toast('Enter your 4-digit MarketLink PIN to continue.','error');return;}
    var draft=dahaWithdrawalDraft;
    var button=G('ml-daha-withdraw-review')&&G('ml-daha-withdraw-review').querySelector('.ml-btn-primary');
    if(button){button.disabled=true;button.textContent='Verifying PIN…';}
    try{
      await ML_API.wallet.requestWithdrawal({
        amount:draft.amount,
        payoutMethod:draft.payoutMethod,
        payoutDetails:{account_number:draft.accountNumber,beneficiary_name:draft.beneficiaryName},
        pin:pin
      });
      dahaWithdrawalDraft=null;
      dahaDepositContext=null;
      toast('Withdrawal request submitted. '+money(draft.amount)+' will be sent to your account; '+money(draft.serviceFeeAmount)+' DAHA service fee; '+money(draft.walletDebitAmount)+' reserved from your wallet.','success');
      await renderPremiumWalletPage(G('profile-body'));
      if((S.roles||[]).indexOf('rider')>=0 && typeof loadRiderLiveData==='function'){
        S._riderLiveLoaded=false;
        await loadRiderLiveData();
      }
    }catch(e){
      var pinField=G('ml-daha-withdraw-pin');
      if(pinField){pinField.value='';pinField.focus();}
      if(button){button.disabled=false;button.textContent='Confirm with PIN →';}
      toast(e.error||'Could not submit the withdrawal request.','error');
    }
  }
  async function beginDahaWithdrawal(amount){
    amount=Number(amount||0);
    S.profilePage='wallet';
    if(S.curTab!=='profile')switchTab('profile');
    await renderPremiumWalletPage(G('profile-body'));
    var amountField=G('ml-daha-withdraw-amount');
    if(amountField&&amount>0)amountField.value=amount.toFixed(2);
    var section=G('ml-daha-withdraw');
    if(section)section.scrollIntoView({behavior:'smooth',block:'center'});
    toast('Review the payout details, then authorize with your 4-digit MarketLink PIN.','info');
  }
  async function renderPremiumPaymentsPage(root){
    if(!root)return;
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Payment Methods</h3></div><div class="ml-loading">Checking available payment options…</div></div>';
    var caps={configured:false,mode:'merchant',directMobileMoney:false,hostedCheckout:false,setupReason:''};
    try{
      var response=await ML_API.payments.methods();
      var data=response&&response.data?response.data:response;
      caps={configured:Boolean(data&&data.configured),mode:String(data&&data.mode||'merchant'),directMobileMoney:Boolean(data&&data.directMobileMoney),hostedCheckout:Boolean(data&&data.hostedCheckout),setupReason:String(data&&data.setupReason||'')};
      S.paymentCapabilities=caps;
    }catch(e){S.paymentCapabilities=caps;}
    var options=livePaymentOptions(caps);
    var current=normalizePaymentChoice(S.selPay||'Cash on Delivery');
    if(!options.some(function(option){return option[1]===current;})){S.selPay='Cash on Delivery';current='cod';}
    var descriptions={
      cod:'Pay on Delivery (Cash on Delivery). Give the rider the cash when your order arrives. MarketLink records the order as unpaid until the cash is reconciled.',
      wallet:'Pay from your DAHA Wallet balance. The backend checks your available balance and records the debit and order payment together.',
      wave:'Use Wave from checkout. Enter your full nine-digit Gambian mobile-money number and follow the payment step shown by the provider.',
      afrimoney:'Use AfriMoney from checkout. Enter your full nine-digit Gambian mobile-money number and follow the provider confirmation step.',
      qmoney:'Use QMoney from checkout. Enter your full nine-digit Gambian mobile-money number and follow the provider instructions.',
      modempay:'Use secure mobile-money checkout to choose a method enabled for MarketLink and complete provider confirmation.'
    };
    var icons={cod:'💵',wallet:'<img class="ml-daha-inline-eagle" src="./assets/daha-wallet-eagle.webp" alt="">',wave:'📱',afrimoney:'📲',qmoney:'💳',modempay:'🔐'};
    var cards=options.map(function(option){
      var label=option[0],method=option[1],selected=method===current;
      var title=method==='cod'?'Pay on Delivery · Cash on Delivery':method==='wallet'?'DAHA Wallet':label;
      return '<button type="button" class="ml-profile-row ml-payment-option ml-payment-setting-choice" aria-pressed="'+(selected?'true':'false')+'" onclick="window.ML_Premium.choosePaymentFromSettings(\''+esc(label)+'\')"><span class="ico">'+(icons[method]||'💳')+'</span><span class="copy"><b>'+esc(title)+'</b><span>'+esc(descriptions[method]||'Choose this method at checkout.')+'</span></span><span class="ml-payment-setting-action">'+(selected?'Selected':'Choose')+'</span></button>';
    }).join('');
    var providerNote=!caps.configured
      ?'<div class="ml-wallet-note"><b>Other mobile-money methods are not activated yet.</b><p>'+esc(caps.setupReason||'Wave, AfriMoney, QMoney and hosted secure mobile-money checkout options will appear when the merchant payment configuration is enabled.')+'</p></div>'
      :'<div class="ml-wallet-note"><b>Mobile-money payment is available.</b><p>'+esc(caps.directMobileMoney?'Choose an enabled mobile-money option above; the nine-digit account details are collected securely at checkout.':'Continue through the secure hosted payment option shown above.')+'</p></div>';
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.openProfilePage(null)">← Profile</button><h3>Payment Methods</h3></div>'+
      '<div class="ml-profile-card"><div class="ml-section-head"><h3>Choose how to pay</h3><span style="font-size:10px;color:#91A4B4">GMD · Gambian Dalasi</span></div>'+cards+'</div>'+
      providerNote+
      '<div class="ml-wallet-note">'+paymentBrandMarkup()+'<p>Selecting a method here prepares your next checkout. MarketLink sends the selected method to the backend when you place the order; no payment is taken just by choosing an option. Cash on Delivery remains pending until delivered cash is verified. DAHA Wallet is debited only after the backend confirms the order and available balance.</p></div>'+
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
    try{await ML_API.customers.markNotifRead([id]);if(typeof syncServerNotifications==='function')await syncServerNotifications();toast('Notification marked as read.','success');await renderPremiumNotificationsPage(G('profile-body'));}
    catch(e){toast(e.error||'Could not update the notification.','error');}
  }
  async function markAllPremiumNotificationsRead(){
    try{await ML_API.customers.markNotifRead([]);if(typeof syncServerNotifications==='function')await syncServerNotifications();toast('Notifications marked as read.','success');await renderPremiumNotificationsPage(G('profile-body'));}
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
      {q:'Do customer referrals earn commissions?',a:'No. The customer sharing feature lets you share a MarketLink link and track invited customers, but it does not pay commissions or wallet credits. To earn eligible commissions, apply separately to the Affiliate Program as a MarketLink Affiliate Marketer and wait for Admin approval.'},
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
    return '<svg class="ml-default-avatar" viewBox="0 0 160 160" role="img" aria-label="MarketLink member avatar" xmlns="http://www.w3.org/2000/svg">'+
      '<defs><linearGradient id="mlBrandAvatarBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#102B46"/><stop offset=".58" stop-color="#087E83"/><stop offset="1" stop-color="#DDAA45"/></linearGradient><linearGradient id="mlBrandAvatarSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3C9A5"/><stop offset="1" stop-color="#B97855"/></linearGradient><linearGradient id="mlBrandAvatarCoat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173C5B"/><stop offset="1" stop-color="#071B30"/></linearGradient><radialGradient id="mlBrandAvatarLight" cx=".25" cy=".12" r=".9"><stop offset="0" stop-color="#FFF" stop-opacity=".42"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient></defs>'+
      '<rect width="160" height="160" rx="38" fill="url(#mlBrandAvatarBg)"/><rect width="160" height="160" rx="38" fill="url(#mlBrandAvatarLight)"/>'+
      '<circle cx="80" cy="80" r="66" fill="none" stroke="#F5C66B" stroke-opacity=".55" stroke-width="2"/><path d="M18 160c4-30 23-46 48-51l14 13 14-13c25 5 44 21 48 51Z" fill="url(#mlBrandAvatarCoat)"/>'+
      '<path d="M63 104h34l8 17-25 20-25-20Z" fill="url(#mlBrandAvatarSkin)"/><ellipse cx="80" cy="70" rx="34" ry="39" fill="url(#mlBrandAvatarSkin)"/>'+
      '<path d="M45 68c-2-30 14-48 37-48 24 0 38 17 35 47-7-5-13-13-17-23-11 11-30 16-55 16Z" fill="#182334"/>'+
      '<path d="M59 71c5-4 11-4 16 0m10 0c5-4 11-4 16 0" fill="none" stroke="#553A30" stroke-width="3" stroke-linecap="round"/><path d="M72 91c5 5 12 5 17 0" fill="none" stroke="#7D4438" stroke-width="3" stroke-linecap="round"/>'+
      '<path d="M59 127h42" stroke="#E5B85E" stroke-width="3" stroke-linecap="round"/><circle cx="80" cy="143" r="11" fill="#E5B85E"/><path d="M73 143h14M80 136v14" stroke="#12334B" stroke-width="2.5" stroke-linecap="round"/>'+
      '<path d="M122 31h18M131 22v18" stroke="#FFE3A3" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/></svg>';
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
    if(S.profilePage==='affiliate-marketer'){await renderPremiumAffiliateMarketerPage(root);return;}
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
      // ML_API wraps successful responses as {success, data}; unwrap before
      // reading KYC fields so submitted application status appears in Profile.
      var vendorRecord=apps[0]&&(apps[0].data||apps[0]);
      var riderRecord=apps[1]&&(apps[1].data||apps[1]);
      vendorApplication=vendorRecord&&vendorRecord.kyc_status?vendorRecord:null;
      riderApplication=riderRecord&&riderRecord.kyc_status?riderRecord:null;
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
    // Profile page must render the persisted server URL, not an older cached avatar.
    var photo=p.profile_photo_url||null;
    var photoSrc=photo?String(photo)+(String(photo).indexOf('?')>=0?'&':'?')+'mlphoto='+encodeURIComponent(String(photo).length+'-'+(liveProfile&&liveProfile.updated_at||Date.now())):'';
    var avatar=defaultAvatarMarkup()+(photo?'<img class="ml-avatar-photo" src="'+esc(photoSrc)+'" alt="Profile photo" loading="eager" decoding="async" onerror="this.onerror=null;var preview=null;try{preview=localStorage.getItem(\'ml_profile_photo_preview\');}catch(e){}if(preview){this.src=preview;this.style.display=\'block\';}else{this.style.display=\'none\';var fallback=this.parentNode&&this.parentNode.querySelector(\'.ml-default-avatar\');if(fallback)fallback.style.display=\'block\';}">':'');
    var roles=(S.roles||[]).map(function(r){return '<span class="ml-role-pill">'+esc(r)+'</span>';}).join('');
    var upgradeHtml='',userRoles=(S.roles||[]).map(function(r){return String(r).toLowerCase();});
    if(userRoles.indexOf('vendor')>-1)upgradeHtml+='<button type="button" onclick="window.ML_Premium.openRoleDashboard(\'vendor\')"><span class="ml-upgrade-icon">🏪</span><span><b>Open Vendor Dashboard</b><span>Manage products, orders and store activity</span></span><span class="arrow">›</span></button>';
    else if(vendorApplication)upgradeHtml+='<button type="button" class="ml-role-application-state" onclick="window.ML_Premium.openProfilePage(\'help\')"><span class="ml-upgrade-icon">🏪</span><span><b>Vendor application: '+esc(String(vendorApplication.kyc_status))+'</b><span>Check status or contact support. You do not need to submit another application.</span></span><span class="arrow">›</span></button>';
    else upgradeHtml+='<button type="button" onclick="openVendorApp()"><span class="ml-upgrade-icon">🏪</span><span><b>Become a vendor</b><span>List products and grow your shop</span></span><span class="arrow">›</span></button>';
    if(userRoles.indexOf('rider')>-1)upgradeHtml+='<button type="button" onclick="window.ML_Premium.openRoleDashboard(\'rider\')"><span class="ml-upgrade-icon">🛵</span><span><b>Open Rider Dashboard</b><span>View assigned deliveries and earnings</span></span><span class="arrow">›</span></button>';
    else if(riderApplication)upgradeHtml+='<button type="button" class="ml-role-application-state" onclick="window.ML_Premium.openProfilePage(\'help\')"><span class="ml-upgrade-icon">🛵</span><span><b>Rider application: '+esc(String(riderApplication.kyc_status))+'</b><span>Check status or contact support. You do not need to submit another application.</span></span><span class="arrow">›</span></button>';
    else upgradeHtml+='<button type="button" onclick="openRiderApp()"><span class="ml-upgrade-icon">🛵</span><span><b>Become a rider</b><span>Apply to deliver local orders</span></span><span class="arrow">›</span></button>';
    var profileItems=[
      {icon:'💬',title:'Messages',desc:'Chat privately with MarketLink vendors and customers',page:'messages'},
      {icon:'❤️',title:'Wishlist',desc:'Products you have saved',page:'wishlist'},
      {icon:'📣',title:'Affiliate Program',desc:'Share MarketLink or apply to become an approved Affiliate Marketer.',page:'affiliate'},
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
      return '<button type="button" class="ml-profile-link" onclick="'+(item.page==='messages'?'window.ML_Premium.openMessages()':'window.ML_Premium.openProfilePage(\''+item.page+'\')')+'"><span class="ico">'+item.icon+'</span><span class="copy"><b>'+esc(item.title)+'</b><span>'+esc(item.desc)+'</span></span><span class="arrow" aria-hidden="true">›</span></button>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell">'+
      '<div class="ml-profile-hero"><div class="ml-profile-avatar-wrap"><button type="button" class="ml-avatar ml-avatar-button" onclick="window.ML_Premium.openPhotoViewer()" aria-label="View profile photo">'+avatar+'<span class="ml-avatar-camera" aria-hidden="true">📷</span></button><div class="ml-avatar-actions"><button type="button" class="ml-photo-action" onclick="window.ML_Premium.pickPhoto()">Change photo</button>'+(photo?'<button type="button" class="ml-photo-action ml-photo-remove" onclick="window.ML_Premium.removeProfilePhoto()">Remove</button>':'')+'</div><div class="ml-photo-guidance">JPG or PNG · at least 512 × 512 px · maximum 5 MB</div><input type="file" id="ml-profile-photo-input" accept="image/jpeg,image/png,.jpg,.jpeg,.png" style="display:none" onchange="window.ML_Premium.handleProfilePhoto(this)"></div><div class="ml-profile-identity"><div class="ml-eyebrow">Your MarketLink account</div><div class="ml-profile-name">'+esc(name)+'</div><div class="ml-profile-phone">'+gambiaFlagMarkup()+' '+esc(phone)+'</div><div class="ml-role-pills">'+roles+'<span class="ml-role-pill ml-role-active">Account active</span></div></div><button type="button" class="ml-edit" onclick="window.ML_Premium.editProfile()">Edit profile</button></div>'+
      '<div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">👤</div><div class="copy"><b>Full name</b><span>'+esc(fullName)+'</span></div></div><div class="ml-profile-row"><div class="ico">✨</div><div class="copy"><b>Display name</b><span>'+esc(name)+'</span></div></div><div class="ml-profile-row"><div class="ico">🎂</div><div class="copy"><b>Date of birth</b><span>'+esc(p.date_of_birth?String(p.date_of_birth).slice(0,10):'Not added yet')+'</span></div></div><div class="ml-profile-row"><div class="ico">🧾</div><div class="copy"><b>Gender</b><span>'+esc(p.gender?({'male':'Male','female':'Female','other':'Other','prefer_not_to_say':'Prefer not to say'}[p.gender]||String(p.gender)):'Not added yet')+'</span></div></div>'+(p.bio?'<div class="ml-profile-row ml-profile-about-row"><div class="ico">💬</div><div class="copy"><b>About you</b><span>'+esc(p.bio)+'</span></div></div>':'')+
      '<button type="button" class="ml-profile-row ml-profile-row-button ml-appearance-row" onclick="window.ML_Premium.toggleAppearance()"><div class="ico">'+(S.dark?'🌙':'☀️')+'</div><div class="copy"><b>Appearance · '+(S.dark?'Night mode':'Daylight mode')+'</b><span>'+(S.dark?'Night mode is active. Tap here to switch to Daylight.':'Daylight mode is active. Tap here to switch to Night.')+'</span></div><b class="ml-profile-arrow">›</b></button>'+applicationHtml+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openProfilePage(\'wallet\')"><div class="ico ml-daha-eagle-icon"><img src="./assets/daha-wallet-eagle.webp" alt="DAHA Wallet" loading="lazy"></div><div class="copy"><b>DAHA Wallet</b><span>Available balance · '+money(p.wallet_balance||S.walletBalance||0)+'</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.openOrders()"><div class="ico">📦</div><div class="copy"><b>Order history</b><span>'+Number(p.total_orders||0)+' completed orders · '+money(p.total_spent||0)+' spent</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="window.ML_Premium.renderAddresses()"><div class="ico">📍</div><div class="copy"><b>Saved addresses</b><span>Manage delivery locations</span></div><b class="ml-profile-arrow">›</b></button>'+
      '<button type="button" class="ml-profile-row ml-profile-row-button" onclick="doLogout()"><div class="ico">↪</div><div class="copy"><b>Sign out</b><span>End this session securely</span></div><b class="ml-profile-arrow">›</b></button></div>'+
      (upgradeHtml?'<div class="ml-profile-upgrade">'+upgradeHtml+'</div>':'')+
      '<div class="ml-section-head"><h3>Account & support</h3></div><div class="ml-profile-links">'+profileLinks+'</div>'+
      '<footer class="ml-app-footer"><span>MarketLink Gambia · Powered by <strong>Royal FinTech Company</strong></span><div><button type="button" onclick="window.ML_Premium.openProfilePage(\'terms\')">Terms of Service</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'privPolicy\')">Privacy Policy</button><button type="button" onclick="window.ML_Premium.openProfilePage(\'deliveryPolicy\')">Delivery & Returns</button></div></footer></div>';
  }
  var liveAddresses=[];
  var liveAddressEditId=null;
  var liveAddressPinDraft=null;
  var gambiaAddressIndex=null;
  var gambiaAddressIndexPromise=null;
  var addressSuggestionResults=[];
  var GAMBIA_ADDRESS_FALLBACK_LANDMARKS=[
    {name:'Westfield Junction Traffic Lights',aliases:['Traffic Lights','Westfield Traffic Lights','West Field Junction','Westfield Junction'],zone:'KMC',region:'Kanifing Municipality',kind:'junction',lat:13.445044,lng:-16.675303},
    {name:'Sukuta Traffic Light',aliases:['Sukuta Traffic Lights','Traffic Lights Sukuta'],zone:'WCR',region:'West Coast Region',kind:'junction',lat:13.39713,lng:-16.70628},
    {name:'Tipa Garage, Bakoteh (Serrekunda)',aliases:['Tipa Garage','Tippa Garage','Tipa Garage Brikama Road'],zone:'KMC',region:'Kanifing Municipality',kind:'transport landmark',lat:13.43313,lng:-16.69101},
    {name:'Brikama Market',aliases:['Market Brikama','Brikama Town Market'],zone:'WCR',region:'West Coast Region',kind:'market',lat:13.27272,lng:-16.64828}
  ];
  async function loadGambiaAddressIndex(){
    if(gambiaAddressIndex)return gambiaAddressIndex;
    if(!gambiaAddressIndexPromise){
      gambiaAddressIndexPromise=fetch('./data/gambia-address-index.json',{cache:'force-cache'})
        .then(function(response){if(!response.ok)throw new Error('Gambia place index is unavailable.');return response.json();})
        .then(function(data){
          if(!data||!Array.isArray(data.places))throw new Error('Gambia place index has an invalid format.');
          gambiaAddressIndex=data;
          return data;
        })
        .catch(function(error){
          console.warn('[MarketLink] Using the local fallback landmark list:',error&&error.message||error);
          gambiaAddressIndex={places:[],landmarks:GAMBIA_ADDRESS_FALLBACK_LANDMARKS};
          return gambiaAddressIndex;
        });
    }
    return gambiaAddressIndexPromise;
  }
  function normalizeGambiaAddressSearch(value){
    var text=String(value||'').toLowerCase();
    try{text=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}catch(e){}
    return text.replace(/[^a-z0-9]+/g,'');
  }
  function searchGambiaAddressSuggestions(value){
    var host=G('ml-addr-suggestions'),raw=String(value||'').trim();
    if(!host)return;
    if(liveAddressPinDraft&&liveAddressPinDraft.addressTextAnchor){
      var anchorKey=normalizeGambiaAddressSearch(liveAddressPinDraft.addressTextAnchor);
      var currentKey=normalizeGambiaAddressSearch(raw);
      if(anchorKey&&currentKey.indexOf(anchorKey)!==0){
        liveAddressPinDraft=null;
        var changedPinStatus=G('ml-addr-pin-status');
        if(changedPinStatus)changedPinStatus.textContent='Address text changed. The previous map pin was cleared; select the new mapped place or use GPS again.';
      }
    }
    var q=normalizeGambiaAddressSearch(raw);
    if(q.length<2){host.innerHTML='';host.style.display='none';addressSuggestionResults=[];return;}
    if(!gambiaAddressIndex){
      host.innerHTML='<div class="ml-address-suggestion-empty">Loading mapped Gambian places…</div>';
      host.style.display='block';
      loadGambiaAddressIndex().then(function(){searchGambiaAddressSuggestions(raw);});
      return;
    }
    var entries=(gambiaAddressIndex.places||[]).concat(gambiaAddressIndex.landmarks||[]);
    var zonePriority={WCR:0,KMC:1,BJL:2,NBR:3,CRR:4,LRR:5,URR:6};
    var matches=[];
    entries.forEach(function(item){
      if(!item||!Number.isFinite(Number(item.lat))||!Number.isFinite(Number(item.lng)))return;
      var names=[item.name].concat(Array.isArray(item.aliases)?item.aliases:[]);
      var score=0;
      names.forEach(function(name){
        var key=normalizeGambiaAddressSearch(name);
        if(!key)return;
        if(key===q)score=Math.max(score,120);
        else if(key.indexOf(q)===0)score=Math.max(score,100-Math.min(20,key.length-q.length));
        else if(key.indexOf(q)>=0)score=Math.max(score,55);
      });
      if(score)matches.push({item:item,score:score,zonePriority:zonePriority[item.zone]===undefined?9:zonePriority[item.zone]});
    });
    matches.sort(function(a,b){return b.score-a.score||a.zonePriority-b.zonePriority||String(a.item.name).localeCompare(String(b.item.name));});
    addressSuggestionResults=matches.slice(0,10).map(function(match){return match.item;});
    if(!addressSuggestionResults.length){
      host.innerHTML='<div class="ml-address-suggestion-empty">No mapped match yet. Keep the full address and use GPS to add the exact delivery pin.</div>';
      host.style.display='block';return;
    }
    host.innerHTML=addressSuggestionResults.map(function(item,index){
      var kind=String(item.kind||'place').replace(/_/g,' ');
      return '<button type="button" class="ml-address-suggestion" data-ml-address-choice="'+index+'"><span class="ml-address-suggestion-pin">📍</span><span class="ml-address-suggestion-copy"><b>'+esc(item.name||'Gambian place')+'</b><small>'+esc(item.region||'The Gambia')+' · '+esc(kind)+'</small></span><span class="ml-address-suggestion-arrow">↗</span></button>';
    }).join('');
    host.style.display='block';
    host.querySelectorAll('[data-ml-address-choice]').forEach(function(button){
      button.addEventListener('click',function(){selectGambiaAddressSuggestion(Number(button.getAttribute('data-ml-address-choice')));});
    });
  }
  function selectGambiaAddressSuggestion(index){
    var item=addressSuggestionResults[Number(index)];
    if(!item)return;
    var full=G('ml-addr-full'),area=G('ml-addr-area');
    if(full)full.value=String(item.name||'')+', '+String(item.region||'The Gambia')+', The Gambia';
    if(area)area.value=String(item.region||'');
    liveAddressPinDraft={latitude:Number(item.lat),longitude:Number(item.lng),source:'mapped-place-centre',name:item.name||'',addressTextAnchor:String(item.name||'')+', '+String(item.region||'The Gambia')+', The Gambia'};
    var host=G('ml-addr-suggestions');if(host){host.innerHTML='';host.style.display='none';}
    var status=G('ml-addr-pin-status');
    if(status)status.textContent='Approximate pin saved for '+String(item.name||'this place')+'. Use “Use my GPS location” for the exact house or gate.';
  }
  function useCurrentAddressLocation(){
    if(!navigator.geolocation){toast('This browser does not support GPS location. Enter your address and select a mapped place instead.','error');return;}
    var status=G('ml-addr-pin-status');
    if(status)status.textContent='Requesting permission to read your current location…';
    navigator.geolocation.getCurrentPosition(function(position){
      var full=G('ml-addr-full');
      if(full&&!full.value.trim())full.value='My current location (GPS pin)';
      liveAddressPinDraft={latitude:Number(position.coords.latitude),longitude:Number(position.coords.longitude),source:'device-gps',name:'Current device location',addressTextAnchor:full?String(full.value||'').trim():''};
      var exact=Number(position.coords.accuracy);
      if(status)status.textContent='Exact device GPS pin saved'+(Number.isFinite(exact)?' · reported accuracy about '+Math.round(exact)+' m':'')+'. The pin will be stored with this address.';
      toast('Your current GPS location has been added to this address.','success');
    },function(error){
      var message=error&&error.code===1?'Location permission was denied. Allow location access in your browser settings and try again.':'MarketLink could not read your GPS location. Check device location services or select a mapped place.';
      if(status)status.textContent=message;
      toast(message,'error');
    },{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  }
  async function renderAddresses(){
    var root=G('profile-body');if(!root)return;
    try{var r=await ML_API.customers.getAddresses();liveAddresses=Array.isArray(r.data)?r.data:[];}
    catch(e){toast(e.error||'Could not load saved addresses.','error');return;}
    var editingAddress=liveAddressEditId?liveAddresses.find(function(a){return String(a.id)===String(liveAddressEditId);}):null;
    if(!editingAddress){liveAddressEditId=null;liveAddressPinDraft=null;}
    else if(!liveAddressPinDraft&&editingAddress.latitude!==null&&editingAddress.latitude!==undefined&&editingAddress.longitude!==null&&editingAddress.longitude!==undefined){
      liveAddressPinDraft={latitude:Number(editingAddress.latitude),longitude:Number(editingAddress.longitude),source:'saved-pin',name:editingAddress.full_address||'',addressTextAnchor:editingAddress.full_address||''};
    }
    var cards=liveAddresses.map(function(a){
      var id=String(a.id),hasPin=a.latitude!==null&&a.latitude!==undefined&&a.longitude!==null&&a.longitude!==undefined;
      return '<div class="ml-profile-card" style="padding:15px;margin-top:10px"><div style="display:flex;align-items:flex-start;gap:10px"><div class="ico" style="width:38px;height:38px">📍</div><div style="flex:1"><b style="color:#EAF2F5;font-size:12px">'+esc(a.label||'Address')+'</b><div style="color:#91A4B4;font-size:11px;line-height:1.5;margin-top:4px">'+esc(a.full_address||'')+'</div>'+(a.area?'<div style="color:#718897;font-size:10px;margin-top:3px">'+esc(a.area)+'</div>':'')+'<small class="ml-address-saved-pin">'+(hasPin?'GPS pin saved · '+Number(a.latitude).toFixed(5)+', '+Number(a.longitude).toFixed(5):'No GPS pin · add one for more accurate rider navigation')+'</small></div>'+(a.is_default?'<span style="font-size:9px;padding:4px 7px;border-radius:99px;background:rgba(13,115,119,.15);color:#42D2C9">Default</span>':'')+'</div><div style="display:flex;gap:7px;margin-top:12px;flex-wrap:wrap"><button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.editAddress(\''+esc(id)+'\')">Edit</button>'+(!a.is_default?'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.setDefaultAddress(\''+esc(id)+'\')">Set default</button>':'')+'<button class="ml-btn ml-btn-secondary" style="flex:1;padding:9px" onclick="window.ML_Premium.deleteAddress(\''+esc(id)+'\')">Delete</button></div></div>';
    }).join('');
    root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><h3>Saved addresses</h3><button onclick="S.profilePage=null;window.ML_Premium.openProfilePage(null)">← Profile</button></div><div class="ml-empty" style="text-align:left;margin-bottom:12px"><b>Delivery locations across The Gambia</b><span>Start typing a village, town, suburb or landmark. Select a mapped match, then add your compound or nearby landmark. For the most accurate delivery point, save your current GPS location.</span></div><div class="ml-profile-card" style="padding:15px"><label class="ml-field-label" for="ml-addr-label">Label</label><input id="ml-addr-label" placeholder="Home, Work, Shop" autocomplete="off" value="'+esc(editingAddress&&editingAddress.label||'')+'"><label class="ml-field-label" for="ml-addr-full" style="margin-top:12px">Full delivery address</label><div class="ml-address-autocomplete"><input id="ml-addr-full" placeholder="Type e.g. Maria Makunda, Traffic Lights, Brikama…" autocomplete="street-address" value="'+esc(editingAddress&&editingAddress.full_address||'')+'" oninput="window.ML_Premium.searchAddressSuggestions(this.value)" onfocus="window.ML_Premium.searchAddressSuggestions(this.value)"><div id="ml-addr-suggestions" class="ml-address-suggestions" role="listbox" aria-label="Gambian place suggestions"></div></div><div class="ml-address-attribution">Place index: N-Ways Addressing for The Gambia · OpenStreetMap and GeoNames. <a href="https://github.com/n-ways/open-addresses-gambia" target="_blank" rel="noopener noreferrer">Data source & attribution</a>.</div><label class="ml-field-label" for="ml-addr-area" style="margin-top:12px">Area / region (optional)</label><input id="ml-addr-area" placeholder="e.g. Serrekunda, Brikama, Banjul" autocomplete="address-level2" value="'+esc(editingAddress&&editingAddress.area||'')+'"><div class="ml-address-pin-actions"><button class="ml-btn ml-btn-secondary" type="button" onclick="window.ML_Premium.useCurrentAddressLocation()">📍 Use my GPS location</button><span id="ml-addr-pin-status">'+(liveAddressPinDraft?'GPS pin ready · '+Number(liveAddressPinDraft.latitude).toFixed(5)+', '+Number(liveAddressPinDraft.longitude).toFixed(5):'Mapped places provide approximate area pins. Use GPS for your exact house or gate.')+'</span></div><button class="ml-btn ml-btn-primary" style="width:100%;margin-top:14px" onclick="window.ML_Premium.addAddress()">'+(editingAddress?'Update address':'Save address')+'</button>'+(editingAddress?'<button class="ml-btn ml-btn-secondary" type="button" style="width:100%;margin-top:8px" onclick="window.ML_Premium.cancelEditAddress()">Cancel edit</button>':'')+'</div>'+cards+'</div>';
    loadGambiaAddressIndex().then(function(){var input=G('ml-addr-full');if(input&&input.value)searchGambiaAddressSuggestions(input.value);});
  }
  async function addAddress(){
    var label=G('ml-addr-label')&&G('ml-addr-label').value.trim(),full=G('ml-addr-full')&&G('ml-addr-full').value.trim(),area=G('ml-addr-area')&&G('ml-addr-area').value.trim();
    if(!label||!full){toast('Enter an address label and full delivery address.','error');return;}
    var latitude=liveAddressPinDraft?Number(liveAddressPinDraft.latitude):null;
    var longitude=liveAddressPinDraft?Number(liveAddressPinDraft.longitude):null;
    if(liveAddressPinDraft&&(!Number.isFinite(latitude)||!Number.isFinite(longitude))){toast('The selected GPS pin is invalid. Select a place or read your GPS location again.','error');return;}
    try{
      if(liveAddressEditId){
        await ML_API.customers.updateAddress(liveAddressEditId,{label:label,fullAddress:full,area:area||null,latitude:latitude,longitude:longitude});
        liveAddressEditId=null;
        liveAddressPinDraft=null;
        toast('Saved address updated'+(latitude!==null?' with its GPS pin.':'.'),'success');
      }else{
        await ML_API.customers.addAddress({label:label,fullAddress:full,area:area||undefined,latitude:latitude,longitude:longitude,isDefault:liveAddresses.length===0});
        liveAddressPinDraft=null;
        toast('Address saved to your MarketLink account'+(latitude!==null?' with its GPS pin.':'.'),'success');
      }
      await renderAddresses();
    }catch(e){toast(e.error||'Could not save this address. Please check the connection and try again.','error');}
  }
  async function editAddress(id){
    var a=liveAddresses.find(function(x){return String(x.id)===String(id);});
    if(!a){toast('Address not found.','error');return;}
    liveAddressEditId=String(id);
    liveAddressPinDraft=a.latitude!==null&&a.latitude!==undefined&&a.longitude!==null&&a.longitude!==undefined
      ?{latitude:Number(a.latitude),longitude:Number(a.longitude),source:'saved-pin',name:a.full_address||''}
      :null;
    await renderAddresses();
    var full=G('ml-addr-full');if(full)full.focus();
  }
  async function cancelEditAddress(){
    liveAddressEditId=null;liveAddressPinDraft=null;
    await renderAddresses();
  }
  async function setDefaultAddress(id){
    try{await ML_API.customers.updateAddress(id,{isDefault:true});toast('Default address updated ✓');await renderAddresses();}catch(e){toast(e.error||'Could not update address.','error');}
  }
  async function deleteAddress(id){
    try{
      await ML_API.customers.deleteAddress(id);
      if(String(liveAddressEditId||'')===String(id)){liveAddressEditId=null;liveAddressPinDraft=null;}
      toast('Address deleted');await renderAddresses();
    }catch(e){toast(e.error||'Could not delete address.','error');}
  }
  async function submitVendor(){
    if(!apiOk()){toast('Please sign in first.','error');return;}
    var f=S.vForm||{};
    if(!f.bname||!f.sname||!f.saddr||!f.cat||!f.whatsappNumber){
      toast('Complete the business name, shop name, address, category and customer WhatsApp number first.','error');S.vStep=0;if(typeof renderVApp==='function')renderVApp();return;
    }
    if(!/^\+220\d{9}$/.test(String(f.whatsappNumber).replace(/[\s()-]/g,''))){
      toast('Enter the complete 9-digit Gambian contact number after +220.','error');S.vStep=0;if(typeof renderVApp==='function')renderVApp();return;
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
      var vendorWhatsapp=String(f.whatsappNumber||'').replace(/[\s()-]/g,'');
      var businessDescription=[
        f.sname?'Shop/display name: '+String(f.sname).trim():'',
        f.registrationNo?'Business registration / permit: '+String(f.registrationNo).trim():'',
        f.services?'Products / services offered: '+String(f.services).trim():'',
        f.hours?'Opening hours / working days: '+String(f.hours).trim():'',
        f.description?'About / service area: '+String(f.description).trim():''
      ].filter(Boolean).join('\n\n');
      await ML_API.vendors.register({
        businessName:String(f.bname).trim(),
        businessCategory:f.cat,
        businessCategoryGroup:typeof marketlinkVendorCategoryGroup==='function'?marketlinkVendorCategoryGroup(f.cat):undefined,
        businessAddress:String(f.saddr).trim(),
        latitude:f.latitude==null?undefined:f.latitude,
        longitude:f.longitude==null?undefined:f.longitude,
        phone:vendorWhatsapp,
        whatsappNumber:vendorWhatsapp,
        email:f.email||undefined,
        servicesOffered:f.services||undefined,
        workingDays:Array.isArray(f.workingDays)?f.workingDays:[],
        openingTime:f.openTime||undefined,
        closingTime:f.closeTime||undefined,
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
      // Keep uploaded files when the request outcome is uncertain (expired
      // session, timeout or network loss). The server may have committed the
      // application even if the browser did not receive its response.
      var uncertain=!!(e&&(e.code==='SESSION_EXPIRED'||e.code==='REQUEST_TIMEOUT'||e.code==='UPLOAD_TIMEOUT'||e.code==='UPLOAD_NETWORK_ERROR'||e.code==='NETWORK_ERROR'));
      if(!uncertain){for(var i=0;i<uploaded.length;i++){try{await ML_API.uploads.deleteByUrl(uploaded[i]);}catch(cleanupError){}}}
      if(btn){btn.disabled=false;btn.textContent='Submit Application 🎉';}
      toast(e.error||e.message||'Vendor application could not be submitted. Please check your connection and try again.','error');
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
    if(!f.profilePhotoFile){toast('Upload a clear rider profile photo before submitting.','error');S.rStep=1;if(typeof renderRApp==='function')renderRApp();return;}
    var btn=document.querySelector('#rapp-body .btn-pu'),uploaded=[];
    if(btn){btn.disabled=true;btn.textContent='Uploading documents…';}
    try{
      var idUpload=await ML_API.uploads.upload(f.idDocFile,'rider-document');
      if(idUpload&&idUpload.url)uploaded.push(idUpload.url);
      var licenseUpload=await ML_API.uploads.upload(f.licenseDocFile,'license-document');
      if(licenseUpload&&licenseUpload.url)uploaded.push(licenseUpload.url);
      var riderPhoto=await ML_API.uploads.upload(f.profilePhotoFile,'profile-photo');
      if(riderPhoto&&riderPhoto.url)uploaded.push(riderPhoto.url);
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
        mobileNumber:(f.phone&&window.PhoneUtil?window.PhoneUtil.normalize(f.phone,'GM').e164:String(f.phone||'').trim())||undefined,
        whatsappNumber:(f.whatsappNumber&&window.PhoneUtil?window.PhoneUtil.normalize(f.whatsappNumber,'GM').e164:String(f.whatsappNumber||'').trim())||undefined,
        emergencyContact:emergencyPhone||undefined,
        address:String(f.addr).trim(),
        deliveryZone:f.deliveryZone||undefined,
        latitude:f.latitude==null?undefined:f.latitude,
        longitude:f.longitude==null?undefined:f.longitude,
        profilePhotoUrl:riderPhoto&&riderPhoto.url,
        idDocumentUrl:idUpload&&idUpload.url,
        licenseDocumentUrl:licenseUpload&&licenseUpload.url,
        vehiclePhotoUrl:vehiclePhotoUrl
      });
      closeSheet('sh-rapp');
      toast('Rider application submitted. Your documents are saved securely for Admin review.','success');
      S._riderLiveLoaded=false;
      if(typeof renderPremiumProfile==='function')await renderPremiumProfile();
    }catch(e){
      // Do not delete documents after an ambiguous network/session failure:
      // the application may already have been committed by the backend.
      var uncertain=!!(e&&(e.code==='SESSION_EXPIRED'||e.code==='REQUEST_TIMEOUT'||e.code==='UPLOAD_TIMEOUT'||e.code==='UPLOAD_NETWORK_ERROR'||e.code==='NETWORK_ERROR'));
      if(!uncertain){for(var i=0;i<uploaded.length;i++){try{await ML_API.uploads.deleteByUrl(uploaded[i]);}catch(cleanupError){}}}
      if(btn){btn.disabled=false;btn.textContent='Submit Application 🚀';}
      toast(e.error||e.message||'Rider application could not be submitted. Please check your connection and try again.','error');
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
    var btn=G('vp-add-btn');
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
      var response=await ML_API.delivery.updateLocation(lat,lng,deliveryId,Number(position.coords.accuracy));
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
      if(next==='delivered'){if(typeof stopRiderLocationWatch==='function')stopRiderLocationWatch();S.activeDel=null;S._riderLiveLoaded=false;}
      renderRDash();toast(next==='delivered'?'Delivery completed ✓':'Delivery status updated ✓');
    }catch(e){toast(e.error||'Could not update delivery status.','error');}
  }
  var mlRiderAvailabilityWatchId=null,mlRiderAvailabilityLastSentAt=0;
  function stopRiderAvailabilityLocationSharing(){
    try{if(mlRiderAvailabilityWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(mlRiderAvailabilityWatchId);}catch(e){}
    mlRiderAvailabilityWatchId=null;
  }
  function hasActiveRiderDelivery(){
    var activeStates=['assigned','picked_up','in_transit'];
    if(S.activeDel&&activeStates.indexOf(String(S.activeDel.status||'').toLowerCase())>=0)return true;
    return (S.rDeliveries||[]).some(function(delivery){
      return activeStates.indexOf(String(delivery.status||'').toLowerCase())>=0;
    });
  }
  function startRiderAvailabilityLocationSharing(allowPermissionPrompt){
    // The active-delivery GPS watcher owns location updates during a delivery.
    // Do not start a second availability watcher or write duplicate location pings.
    if(hasActiveRiderDelivery()){
      stopRiderAvailabilityLocationSharing();
      return;
    }
    if(!navigator.geolocation){
      if(allowPermissionPrompt)toast('Location is not available in this browser. You can stay online, but shops will not see your approximate distance.','warning');
      return;
    }
    if(mlRiderAvailabilityWatchId!==null)return;
    var begin=function(){
      if(!S.rOnline||mlRiderAvailabilityWatchId!==null)return;
      try{
        mlRiderAvailabilityWatchId=navigator.geolocation.watchPosition(function(position){
          if(!S.rOnline||!position||!position.coords)return;
          if(hasActiveRiderDelivery()){
            stopRiderAvailabilityLocationSharing();
            return;
          }
          // Idle availability pings are limited to one per 45 seconds.
          var now=Date.now();
          if(now-mlRiderAvailabilityLastSentAt<45000)return;
          mlRiderAvailabilityLastSentAt=now;
          ML_API.delivery.updateLocation(Number(position.coords.latitude),Number(position.coords.longitude)).catch(function(){mlRiderAvailabilityLastSentAt=0;});
        },function(error){
          if(error&&error.code===1&&allowPermissionPrompt)toast('Location permission is off. You can stay online, but shops will not see your approximate distance until location is enabled.','warning');
          else if(error&&error.code===2&&allowPermissionPrompt)toast('Your device could not get a GPS location. Check location services and try again.','warning');
          stopRiderAvailabilityLocationSharing();
        },{enableHighAccuracy:true,maximumAge:45000,timeout:15000});
      }catch(e){mlRiderAvailabilityWatchId=null;if(allowPermissionPrompt)toast('Could not start location sharing. You can still stay online.','warning');}
    };
    if(!allowPermissionPrompt&&navigator.permissions&&typeof navigator.permissions.query==='function'){
      navigator.permissions.query({name:'geolocation'}).then(function(permission){if(permission&&permission.state==='granted')begin();}).catch(function(){});
      return;
    }
    begin();
  }
  async function toggleRiderOnline(){
    if(!apiOk()){toast('Sign in required.','error');return;}
    try{
      var next=!S.rOnline;
      await ML_API.delivery.setAvailability(next);
      S.rOnline=next;
      if(next)startRiderAvailabilityLocationSharing(true);else stopRiderAvailabilityLocationSharing();
      renderRDash();
      toast(next?'You are online. Nearby shops can see your approximate distance when location is allowed.':'You are offline.');
    }catch(e){toast(e.error||'Could not change rider availability.','error');}
  }
  async function liveVendorRequestPayout(amount){
    amount=Number(amount||0);
    if(!(amount>0)){toast('No balance available to pay out.','error');return;}
    return beginDahaWithdrawal(amount);
  }
  async function liveRiderRequestWithdrawal(amount){
    amount=Number(amount||0);
    if(!(amount>0)){toast('No balance available.','error');return;}
    return beginDahaWithdrawal(amount);
  }
  async function liveRiderDecline(id){
    if(!apiOk()){toast('Rider sign-in required.','error');return;}
    if(!id){toast('The delivery reference is missing. Refresh your rider dashboard.','error');return;}
    try{
      await ML_API.delivery.decline(String(id));
      S.rDeliveries=(S.rDeliveries||[]).filter(function(delivery){return String(delivery.id)!==String(id);});
      if(S.activeDel&&String(S.activeDel.id)===String(id)){
        S.activeDel=null;
        S.delStepIdx=0;
        stopRiderLocationWatch();
      }
      S._riderLiveLoaded=false;
      renderRDash();
      toast('Delivery declined. The vendor can now assign another rider.','success');
      refreshNotifBadges();
    }catch(e){
      toast(e.error||'Could not decline this delivery. Refresh your rider requests and try again.','error');
    }
  }

  async function submitCodRemittance(paymentId,deliveryId){
    if(!apiOk()){toast('Rider sign-in required.','error');return;}
    if(!paymentId||!deliveryId){toast('The COD payment reference is missing. Refresh your delivery history.','error');return;}
    var refEl=G('ml-cod-ref-'+deliveryId),methodEl=G('ml-cod-method-'+deliveryId),proofEl=G('ml-cod-proof-file-'+deliveryId);
    var providerReference=String(refEl&&refEl.value||'').trim();
    var receiptFile=proofEl&&proofEl.files&&proofEl.files[0];
    if(providerReference.length<4){toast('Enter the deposit receipt reference from Wave or AfriMoney.','error');if(refEl)refEl.focus();return;}
    if(!receiptFile){toast('Upload the Wave or AfriMoney receipt image or PDF before submitting.','error');if(proofEl)proofEl.focus();return;}
    if(!['image/jpeg','image/png','application/pdf'].includes(receiptFile.type)){toast('Receipt must be a JPG, PNG or PDF file.','error');return;}
    if(receiptFile.size>10*1024*1024){toast('Receipt file must be 10 MB or smaller.','error');return;}
    var button=refEl&&refEl.parentNode&&refEl.parentNode.querySelector('button');
    if(button){button.disabled=true;button.textContent='Uploading receipt…';}
    try{
      var uploaded=await ML_API.uploads.upload(receiptFile,'cod-remittance-document');
      var proofFileId=uploaded&&uploaded.record&&uploaded.record.id;
      if(!proofFileId)throw {error:'The receipt upload did not return a secure file reference. Please try again.'};
      if(button)button.textContent='Submitting deposit…';
      await ML_API.payments.submitCodRemittance(paymentId,{providerReference:providerReference,depositMethod:methodEl&&methodEl.value||'wave',proofFileId:proofFileId});
      toast('Cash deposit reference submitted. MarketLink will verify it before releasing the order settlement.','success');
      S._riderLiveLoaded=false;
      await loadRiderLiveData();
    }catch(e){
      toast(e.error||e.message||'Could not submit the cash remittance.','error');
      if(button){button.disabled=false;button.textContent='Submit cash deposit for verification';}
    }
  }

  function sanitizeRiderMap(){
    var map=G('rider-amap');
    if(!map)return;
    var tr=S.activeDel&&S.activeDel.tracking;
    var hasGps=tr&&tr.current_lat!=null&&tr.current_lng!=null;
    map.innerHTML='<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;box-sizing:border-box;background:linear-gradient(160deg,#07151F,#102A35);">'+
      '<div><div style="font-size:28px;margin-bottom:8px">📍</div><b style="color:#EAF2F5;font-size:13px">'+(hasGps?'Live location connected':'Live location unavailable')+'</b><div style="color:#91A4B4;font-size:11px;line-height:1.5;margin-top:5px">'+(hasGps?'Showing the latest backend-provided rider location.':'No current GPS point is available from the backend for this delivery.')+'</div></div></div>';
  }
  var baseRenderVDash=window.renderVDash;
  window.renderVDash=function(){
    // Route the old role-dashboard wallet shortcut to the shared DAHA ledger.
    if(apiOk()&&S.vSubTab==='wallet'){
      S.vSubTab='orders';
      openProfilePage('wallet');
      return;
    }
    if(typeof baseRenderVDash==='function')return baseRenderVDash.apply(this,arguments);
  };
  var baseRenderRDash=window.renderRDash;
  window.renderRDash=function(){
    // Keep rider earnings and withdrawals on the single DAHA wallet flow.
    if(apiOk()&&S.rSubTab==='wallet'){
      S.rSubTab='requests';
      openProfilePage('wallet');
      return;
    }
    if(typeof baseRenderRDash==='function')baseRenderRDash.apply(this,arguments);
    if(S.activeDel&&S.activeDel.id)startRiderLocationWatch(S.activeDel.id);
    else stopRiderLocationWatch();
    sanitizeRiderMap();
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
    var selectedPeriod=period||'30d';
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Live analytics</div><div class="ml-hero-sub">Loading production analytics…</div></div>';
    try{
      var r=await ML_API.admin.analytics({period:selectedPeriod}),d=r.data||{};
      var daily=Array.isArray(d.dailyRevenue)?d.dailyRevenue:[],statusRows=Array.isArray(d.ordersByStatus)?d.ordersByStatus:[],signups=Array.isArray(d.signups)?d.signups:[],categories=Array.isArray(d.topCategories)?d.topCategories:[];
      var trend=d.trend||{},insights=d.insights||{},insightRows=Array.isArray(insights.items)?insights.items:[];
      var totalOrders=Number(d.totals&&d.totals.orders||statusRows.reduce(function(a,x){return a+Number(x.count||0);},0));
      var totalRevenue=daily.reduce(function(a,x){return a+Number(x.revenue||0);},0);
      var totalNet=daily.reduce(function(a,x){return a+Number(x.platform_net_revenue||0);},0);
      var totalGrossCommission=daily.reduce(function(a,x){return a+Number(x.platform_gross_commission||0);},0);
      var totalAffiliate=daily.reduce(function(a,x){return a+Number(x.affiliate_commission||0);},0);
      var maxRev=Math.max.apply(null,daily.map(function(x){return Number(x.revenue||0);}).concat([1]));
      var revBars=daily.some(function(x){return Number(x.revenue||0)>0;})?daily.slice(-14).map(function(x){var v=Number(x.revenue||0),h=Math.max(2,Math.round(v/maxRev*112));return '<div title="'+esc(String(x.day||''))+': '+money(v)+' GMV" style="flex:1;min-width:5px;height:'+h+'px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#42D2C9,#0D7377);"></div>';}).join(''):'';
      var chartColors=['#D9A441','#21A69A','#6686D8','#D97878','#8C6AC7','#56A6CE','#A5A84B','#C58A54'];
      function pie(items,labelKey,valueKey){
        var valid=items.filter(function(x){return Number(x[valueKey]||0)>0;});
        var total=valid.reduce(function(sum,x){return sum+Number(x[valueKey]||0);},0);
        if(!total)return '<div class="ml-empty"><b>No distribution data yet</b><span>Pie chart will populate when production records are available.</span></div>';
        var angle=0,stops=[],legend='';
        valid.forEach(function(x,i){
          var next=angle+Number(x[valueKey]||0)/total*100;
          stops.push(chartColors[i%chartColors.length]+' '+angle.toFixed(2)+'% '+next.toFixed(2)+'%');
          legend+='<div style="display:flex;align-items:center;gap:7px;font-size:12px;margin:5px 0"><i style="width:9px;height:9px;border-radius:50%;background:'+chartColors[i%chartColors.length]+';flex:none"></i><span style="flex:1;min-width:0;overflow-wrap:anywhere">'+esc(x[labelKey]||'Other')+'</span><b>'+Number(x[valueKey]||0)+'</b></div>';
          angle=next;
        });
        return '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:12px 4px"><div role="img" aria-label="Distribution pie chart" style="width:150px;height:150px;max-width:42vw;border-radius:50%;background:conic-gradient('+stops.join(',')+');position:relative;flex:none"><div style="position:absolute;inset:28%;border-radius:50%;background:var(--sf,#111827);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">'+total+'</div></div><div style="flex:1;min-width:135px">'+legend+'</div></div>';
      }
      var statusHtml=statusRows.length?statusRows.map(function(x){return '<div class="ml-profile-row"><div class="ico">📦</div><div class="copy"><b>'+esc(x.status||'Unknown')+'</b><span>Orders in selected period</span></div><strong>'+Number(x.count||0)+'</strong></div>';}).join(''):'<div class="ml-empty"><b>No order activity yet</b><span>The selected period contains no production orders.</span></div>';
      var signupHtml=signups.length?signups.slice(-10).map(function(x){return '<div class="ml-profile-row"><div class="ico">👥</div><div class="copy"><b>'+esc(String(x.day||'').slice(0,10))+'</b><span>New user registrations</span></div><strong>'+Number(x.users||0)+'</strong></div>';}).join(''):'<div class="ml-empty"><b>No customer growth data yet</b><span>No registrations were recorded in the selected period.</span></div>';
      var maxLine=Math.max.apply(null,daily.map(function(x){return Math.max(Number(x.revenue||0),Number(x.platform_net_revenue||0));}).concat([1]));
      var pointsGmv=daily.map(function(x,i){var px=daily.length<2?50:i/(daily.length-1)*680+30,py=170-(Number(x.revenue||0)/maxLine*145);return px.toFixed(1)+','+py.toFixed(1);}).join(' ');
      var pointsNet=daily.map(function(x,i){var px=daily.length<2?50:i/(daily.length-1)*680+30,py=170-(Number(x.platform_net_revenue||0)/maxLine*145);return px.toFixed(1)+','+py.toFixed(1);}).join(' ');
      var lineChart=daily.length?'<svg viewBox="0 0 740 190" role="img" aria-label="Daily confirmed GMV and MarketLink net commission line chart" style="width:100%;height:auto;min-height:150px;overflow:visible"><line x1="25" y1="170" x2="715" y2="170" stroke="rgba(148,163,184,.35)"/><line x1="25" y1="95" x2="715" y2="95" stroke="rgba(148,163,184,.18)"/><line x1="25" y1="20" x2="715" y2="20" stroke="rgba(148,163,184,.18)"/><polyline points="'+pointsGmv+'" fill="none" stroke="#21A69A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="'+pointsNet+'" fill="none" stroke="#D9A441" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--mu,#94a3b8);padding:0 8px 8px"><span>🟢 Confirmed GMV</span><span>🟡 MarketLink net commission</span></div>':'<div class="ml-empty"><b>No revenue trend data</b><span>Confirmed sales will appear here after delivered orders have confirmed payments.</span></div>';
      function trendText(value,current,previous){
        if(value===null||value===undefined)return previous>0?'No comparable change available':'New baseline';
        return (Number(value)>0?'↑ ':Number(value)<0?'↓ ':'→ ')+Math.abs(Number(value))+'% vs previous '+selectedPeriod;
      }
      function trendColor(value){return value===null||value===undefined?'#94a3b8':Number(value)>0?'#20B486':Number(value)<0?'#E07878':'#D9A441';}
      var gmvTrend=trendText(trend.gmvChangePct,trend.currentGmv,trend.previousGmv),netTrend=trendText(trend.platformNetChangePct,trend.currentPlatformNet,trend.previousPlatformNet);
      var insightsHtml=insightRows.length?insightRows.map(function(x){var c=x.type==='positive'?'#20B486':x.type==='attention'?'#D9A441':'#6686D8';return '<div style="border-left:3px solid '+c+';padding:9px 12px;margin:9px 0;background:rgba(148,163,184,.06);border-radius:0 10px 10px 0"><b>'+esc(x.title||'Business insight')+'</b><div style="font-size:12px;line-height:1.55;margin-top:4px">'+esc(x.detail||'')+'</div><div style="font-size:12px;line-height:1.55;margin-top:5px;color:var(--mu,#94a3b8)"><b>Recommended:</b> '+esc(x.recommendation||'Review the underlying report.')+'</div></div>';}).join(''):'<div class="ml-empty">Not enough production data to generate insights yet.</div>';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">MarketLink Operations</div><h3 style="margin:4px 0">Live analytics & business insights</h3></div><button onclick="window.ML_Premium.refreshAdminAnalytics()">Refresh</button></div>'+
        '<div style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 14px">'+['7d','30d','90d'].map(function(p){return '<button class="ml-btn '+(p===selectedPeriod?'ml-btn-primary':'ml-btn-secondary')+'" onclick="window.ML_Premium.refreshAdminAnalytics(\''+p+'\')">'+p+'</button>';}).join('')+'</div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Orders</div><div class="ml-stat-value">'+totalOrders+'</div></div><div class="ml-stat"><div class="ml-stat-label">Confirmed GMV</div><div class="ml-stat-value">'+money(totalRevenue)+'</div><small style="color:'+trendColor(trend.gmvChangePct)+'">'+esc(gmvTrend)+'</small></div><div class="ml-stat"><div class="ml-stat-label">MarketLink net commission</div><div class="ml-stat-value">'+money(totalNet)+'</div><small style="color:'+trendColor(trend.platformNetChangePct)+'">'+esc(netTrend)+'</small></div><div class="ml-stat"><div class="ml-stat-label">New registrations</div><div class="ml-stat-value">'+Number(d.totals&&d.totals.signups||0)+'</div></div></div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Revenue & income trend</h3><span style="color:#91A4B4;font-size:10px">Last '+Number(d.days||30)+' complete days · confirmed payments</span></div>'+lineChart+'</div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Order mix · pie chart</h3></div>'+pie(statusRows,'status','count')+'</div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Sales by category · pie chart</h3></div>'+pie(categories,'name','orders')+'</div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Daily confirmed GMV</h3><span style="color:#91A4B4;font-size:10px">Daily values · complete days</span></div><div style="height:135px;display:flex;align-items:flex-end;gap:5px;padding:12px 4px 4px">'+(revBars||'<div class="ml-empty"><b>No revenue data</b></div>')+'</div></div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Business insights & recommendations</h3><span style="font-size:10px;color:#91A4B4">Data-backed</span></div><p style="font-size:12px;line-height:1.6;color:var(--mu,#94a3b8)">'+esc(insights.summary||'')+'</p>'+insightsHtml+'<small style="display:block;margin-top:10px;color:var(--mu,#94a3b8)">'+esc(insights.method||'Insights are generated from production records.')+'</small></div>'+
        '<div class="ml-profile-card" style="margin-top:12px"><div class="ml-section-head"><h3>Customer growth</h3></div>'+signupHtml+'</div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty" style="margin:20px"><b>Live analytics unavailable</b><span>'+esc(e.error||'The backend did not return analytics.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshAdminAnalytics()">Retry</button></div>';}
  }
  async function renderLiveAdminRevenue(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>MarketLink revenue & marketplace settlements</h3><p>Loading confirmed delivered-order financials…</p></div>';
    try{
      var r=await ML_API.admin.reports({type:'revenue'}),rows=normalizeProducts(r.data);
      var totals=rows.reduce(function(a,x){
        ['gross_order_value','net_merchandise','platform_gross_commission','affiliate_commission','platform_net_revenue','vendor_payouts','rider_payouts'].forEach(function(k){a[k]+=Number(x[k]||0);});
        a.orders+=Number(x.orders||0);return a;
      },{orders:0,gross_order_value:0,net_merchandise:0,platform_gross_commission:0,affiliate_commission:0,platform_net_revenue:0,vendor_payouts:0,rider_payouts:0});
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">FINANCE · CONFIRMED SETTLEMENTS</div><h3>MarketLink revenue & marketplace settlements</h3></div><button onclick="window.ML_Premium.refreshAdminRevenue()">↻ Refresh</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 14px;padding:12px;border-radius:12px"><b>How to read these figures:</b> GMV is customer order value, not MarketLink income. MarketLink gross commission is calculated separately. Affiliate rewards are funded from that commission; platform net revenue is what remains before provider charges, taxes and operating costs. Only delivered orders with confirmed payment are included.</div>'+
      '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Gross order value (GMV)</div><div class="ml-stat-value">'+money(totals.gross_order_value)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Platform gross commission</div><div class="ml-stat-value">'+money(totals.platform_gross_commission)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Affiliate rewards</div><div class="ml-stat-value">'+money(totals.affiliate_commission)+'</div></div><div class="ml-stat"><div class="ml-stat-label">MarketLink net commission</div><div class="ml-stat-value">'+money(totals.platform_net_revenue)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Vendor wallet allocations</div><div class="ml-stat-value">'+money(totals.vendor_payouts)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Rider wallet allocations</div><div class="ml-stat-value">'+money(totals.rider_payouts)+'</div></div></div>'+
      '<div class="ml-section-head"><h3>Daily confirmed settlements</h3><span>'+totals.orders+' qualifying orders</span></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">📊</div><div class="copy"><b>'+esc(String(x.day||'').slice(0,10))+' · '+Number(x.orders||0)+' delivered orders</b><span>GMV '+money(x.gross_order_value||0)+' · Gross commission '+money(x.platform_gross_commission||0)+' · Affiliate '+money(x.affiliate_commission||0)+'</span><small>Vendor '+money(x.vendor_payouts||0)+' · Rider '+money(x.rider_payouts||0)+'</small></div><strong>'+money(x.platform_net_revenue||0)+'</strong></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No confirmed delivered orders in this report period</b><span>Figures will appear after real orders are delivered and payment is confirmed. This is not a zero-fee configuration.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Revenue report unavailable</b><span>'+esc(e.error||e.message||'Could not load the live finance report.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:10px" onclick="window.ML_Premium.refreshAdminRevenue()">Retry</button></div>';}
  }

  // Admin DAHA withdrawal actions. These deliberately call the protected backend;
  // payout initiation remains blocked server-side until configured payout-provider credentials and
  // webhook verification are configured.
  async function approveDahaWithdrawal(withdrawalId,retrySameRequest){
    var id=String(withdrawalId||'').trim();
    if(!id){toast('A valid withdrawal record is required.','error');return;}
    if(!ML_API.admin||typeof ML_API.admin.approveWithdrawal!=='function'){
      toast('The secure Admin payout endpoint is unavailable. No payout was sent.','error');return;
    }
    if(!window.confirm(retrySameRequest?'The provider response for this payout is unknown. Retry the same withdrawal using its original idempotency key so the provider can return the original transfer instead of creating a second payout? Check the recipient and amount first.':'Approve this DAHA withdrawal? This requests a real mobile-money transfer through the payout provider. Do not continue until the recipient details and amount have been checked.'))return;
    try{
      var result=await ML_API.admin.approveWithdrawal(id);
      var data=result&&result.data||{};
      var status=String(data.status||'').toLowerCase();
      if(status==='payout_pending'){
        toast('Transfer request recorded. The wallet remains reserved until the payout provider confirms the payout.','success');
      }else{
        toast(result&&result.message||'The payout request was processed. Verify its provider status before considering it settled.','success');
      }
      await renderLiveAdminPayouts();
    }catch(e){
      toast(e&& (e.error||e.message)||'Payout approval was not completed. Check the provider status before retrying.','error');
      await renderLiveAdminPayouts();
    }
  }

  async function rejectDahaWithdrawal(withdrawalId){
    var id=String(withdrawalId||'').trim();
    if(!id){toast('A valid withdrawal record is required.','error');return;}
    if(!ML_API.admin||typeof ML_API.admin.rejectWithdrawal!=='function'){
      toast('The secure Admin rejection endpoint is unavailable. No record was changed.','error');return;
    }
    if(!window.confirm('Reject this withdrawal request? This is only allowed before a payout has entered provider processing.'))return;
    try{
      var result=await ML_API.admin.rejectWithdrawal(id);
      toast(result&&result.message||'Withdrawal request rejected. No money was sent.','success');
      await renderLiveAdminPayouts();
    }catch(e){
      toast(e&&(e.error||e.message)||'The withdrawal could not be rejected. Refresh and check its current status.','error');
      await renderLiveAdminPayouts();
    }
  }

  async function reconcileDahaWithdrawal(withdrawalId){
    var id=String(withdrawalId||'').trim();
    if(!id){toast('A valid withdrawal record is required.','error');return;}
    if(!ML_API.admin||typeof ML_API.admin.reconcileWithdrawal!=='function'){
      toast('The secure provider reconciliation endpoint is unavailable. No payout was initiated.','error');return;
    }
    if(!window.confirm('Check the existing payment-provider transfer status for this withdrawal? This is a read-only lookup. It will not send another transfer or release reserved funds unless the provider confirms a terminal result.'))return;
    try{
      var result=await ML_API.admin.reconcileWithdrawal(id);
      var data=result&&result.data||{};
      var providerStatus=String(data.provider_status||'unknown').replace(/_/g,' ');
      if(String(data.status||'').toLowerCase()==='completed'){
        toast('The payment provider confirmed the payout. The DAHA wallet ledger has been reconciled.','success');
      }else if(String(data.status||'').toLowerCase()==='rejected'){
        toast('The payment provider reports this transfer failed. The withdrawal reservation has been released.','success');
      }else{
        toast('Provider status: '+providerStatus+'. Funds remain reserved; no new transfer was sent.','info');
      }
      await renderLiveAdminPayouts();
    }catch(e){
      toast(e&&(e.error||e.message)||'Provider status could not be reconciled. Funds remain reserved; do not create another payout.','error');
      await renderLiveAdminPayouts();
    }
  }

  async function renderLiveAdminPayouts(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Live payouts</div><div class="ml-hero-sub">Loading pending withdrawals from the production database…</div></div>';
    try{
      var r=await ML_API.admin.withdrawals({page:1,limit:100}),rows=normalizeProducts(r.data);
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">DAHA WALLET · PAYOUT CONTROL</div><h3>Pending payouts</h3></div><button onclick="window.ML_Premium.refreshAdminPayouts()">↻ Refresh</button></div>'+
      '<div class="ml-wallet-note" style="margin:8px 0 14px;padding:12px;border-radius:12px"><b>Review guide:</b> This queue includes vendor, rider and affiliate withdrawals. Check the account holder and 9-digit Wave/AfriMoney destination before approval. The minimum request is D50. Approval starts a provider transfer; the wallet is debited only after a verified provider confirmation webhook. If the provider is not configured, no money is sent.</div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){
        var status=String(x.status||'processing').toLowerCase();
        var providerStatus=String(x.provider_status||'').replace(/_/g,' ');
        var payoutDetails=x.payout_details||{};
        if(typeof payoutDetails==='string'){try{payoutDetails=JSON.parse(payoutDetails);}catch(e){payoutDetails={};}}
        var recipientName=String(payoutDetails.beneficiary_name||payoutDetails.beneficiaryName||'').trim();
        var recipientNumber=String(payoutDetails.account_number||payoutDetails.accountNumber||'').trim();
        var recipientHtml=(recipientName||recipientNumber)
          ?'<small style="display:block;margin-top:5px;color:#b8c7d3">Recipient: '+esc(recipientName||'Name not provided')+' · Account: '+esc(recipientNumber||'Number not provided')+'</small>'
          :'<small style="display:block;margin-top:5px;color:#FFCF86">Recipient details are missing. Verify the saved payout profile before approval.</small>';
        var retryableUnknown=status==='payout_pending'&&['unknown','unknown_reference','initiation_unknown'].includes(String(x.provider_status||'').toLowerCase())&&!x.provider_ref;
        var providerRefHtml=x.provider_ref?'<small style="display:block;margin-top:4px;color:#8fa5b1">Provider reference: '+esc(x.provider_ref)+'</small>':'';
        var actions=status==='processing'
          ?'<div style="display:flex;gap:8px;margin-top:9px"><button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.approveDahaWithdrawal(\''+esc(x.id)+'\')">Approve payout</button><button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.rejectDahaWithdrawal(\''+esc(x.id)+'\')">Reject</button></div>'
          :retryableUnknown?'<small style="display:block;margin-top:6px;color:#FFCF86">Provider outcome is unknown. Funds remain reserved. Retry is restricted to the original idempotency key; do not create a new payout.</small><button type="button" class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.approveDahaWithdrawal(\''+esc(x.id)+'\',true)">Retry same provider request</button>'
          :status==='payout_pending'&&x.provider_ref?'<small style="display:block;margin-top:6px;color:#8fa5b1">Provider status: '+esc(providerStatus||'awaiting confirmation')+'. Funds remain reserved until confirmation.</small><button type="button" class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.reconcileDahaWithdrawal(\''+esc(x.id)+'\')">Check provider status</button>'
          :'<small style="display:block;margin-top:6px;color:#8fa5b1">Provider status: '+esc(providerStatus||'awaiting confirmation')+'. Funds remain reserved until confirmation.</small>';
        return '<div class="ml-profile-row" style="align-items:flex-start"><div class="ico">💸</div><div class="copy"><b>'+esc(x.full_name||'Account')+'</b><span>'+esc(x.user_type||'account')+' · '+esc(x.payout_method||'Payout')+' · '+esc(status.replace(/_/g,' '))+'</span>'+recipientHtml+providerRefHtml+actions+'</div><strong>'+money(x.amount||0)+'</strong></div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No pending payouts</b><span>The production database has no withdrawal requests awaiting admin action.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Live payouts unavailable</b><span>'+esc(e.error||'The backend did not return withdrawal data.')+'</span></div>';}
  }

  async function retryAdminSettlement(orderId,orderReference){
    if(!window.confirm('Retry the settlement for '+String(orderReference||'this order')+'? This runs the existing locked, idempotent settlement routine. It will not override ledger mismatches or missing payout recipients.'))return;
    var reason=window.prompt('Enter the reason for this Admin settlement retry (for example, verified cash receipt):','');
    if(!reason||!reason.trim())return;
    try{
      var result=await ML_API.admin.retryFinancialSettlement(orderId,{confirmation:'RETRY_SETTLEMENT',reason:reason.trim()});
      toast(result&&result.message||'Settlement retry completed.','success');
    }catch(e){
      toast(e.error||e.message||'Settlement retry was not completed. No unsafe repair was attempted.','error');
    }
    await renderFinancialReconciliation();
  }

  async function renderFinancialReconciliation(){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Financial reconciliation</div><div class="ml-hero-sub">Checking live financial records…</div></div>';
    try{
      var response=await ML_API.admin.financialReconciliation({limit:50});
      var data=response&&response.data||{},sections=data.sections||{},counts=data.counts||{};
      var labels=[
        ['deliveredWithoutCommission','Delivered orders missing commission records'],
        ['pendingSettlement','Delivered orders awaiting settlement'],
        ['codRemittancesNeedingAttention','Rider cash deposits awaiting verification or settlement'],
        ['amountMismatches','Order / commission amount mismatches'],
        ['missingRecipients','Missing payout recipients'],
        ['missingWalletCredits','Paid commissions with missing wallet credits'],
        ['settlementCreditMismatches','Settlement credits with wrong recipient or amount'],
        ['withdrawalsNeedingAttention','Withdrawals needing attention'],
        ['walletLedgerMismatches','Wallet / transaction ledger differences'],
        ['duplicateReferences','Duplicate transaction or provider references']
      ];
      var cards=labels.map(function(item){
        return '<div class="ml-stat"><div class="ml-stat-label">'+esc(item[1])+'</div><div class="ml-stat-value">'+Number(counts[item[0]]||0)+'</div></div>';
      }).join('');
      var blocks=labels.map(function(item){
        var rows=Array.isArray(sections[item[0]])?sections[item[0]]:[];
        var html=rows.length?'<div class="ml-profile-card">'+rows.map(function(x){
          var ref=x.order_number||x.reference||x.id||x.wallet_id||x.commission_id||'Record';
          var status=x.status||x.remittance_status||x.provider_status||x.kind||'Review required';
          var amount=x.amount!=null?money(x.amount):x.total!=null?money(x.total):x.order_total!=null?money(x.order_total):'';
          var detail=[];
          if(x.payment_status)detail.push('Payment: '+x.payment_status);
          if(x.payment_record_status)detail.push('Payment record: '+x.payment_record_status);
          if(x.rider_name)detail.push('Rider: '+x.rider_name);
          if(x.deposit_method)detail.push('Deposit: '+String(x.deposit_method).toUpperCase());
          if(x.provider_reference)detail.push('Reference: '+x.provider_reference);
          if(x.commission_status)detail.push('Commission: '+x.commission_status);
          if(x.provider_status)detail.push('Provider: '+x.provider_status);
          if(x.difference!=null)detail.push('Difference: '+money(x.difference));
          if(x.has_no_ledger_entries)detail.push('No ledger transactions recorded');
          if(x.duplicate_count)detail.push('Duplicates: '+x.duplicate_count);
          if(x.vendor_credit_count!=null)detail.push('Vendor credit: '+x.vendor_credit_count+' · credited '+money(x.vendor_credit_amount||0)+' / expected '+money(x.vendor_payout||0));
          if(x.vendor_wrong_recipient_count)detail.push('Vendor credit is in the wrong wallet');
          if(x.rider_credit_count!=null)detail.push('Rider credit: '+x.rider_credit_count+' · credited '+money(x.rider_credit_amount||0)+' / expected '+money(x.rider_payout||0));
          if(x.rider_wrong_recipient_count)detail.push('Rider credit is in the wrong wallet');
          if(x.affiliate_credit_count!=null)detail.push('Affiliate credit: '+x.affiliate_credit_count+' · credited '+money(x.affiliate_credit_amount||0)+' / expected '+money(x.affiliate_commission_amount||0));
          if(x.affiliate_wrong_recipient_count)detail.push('Affiliate credit is in the wrong wallet');
          if(x.platform_earning_count!=null)detail.push('Platform earning rows: '+x.platform_earning_count+' · net '+money(x.platform_earning_amount||0)+' / expected '+money(x.platform_net_fee||0));
          if(x.platform_earning_count!=null)detail.push('Payout-fee recovery: '+money(x.platform_recovery_amount||0)+' / expected '+money(x.payout_fee_recovery_amount||0));
          ['vendor_credit_missing','rider_credit_missing','rider_earning_record_missing','affiliate_credit_missing','platform_earning_missing','platform_earning_mismatch'].forEach(function(k){if(x[k])detail.push(k.replace(/_/g,' '));});
          var retryAction=item[0]==='pendingSettlement'&&x.id
            ?'<button type="button" class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.retryFinancialSettlement(&quot;'+esc(x.id)+'&quot;,&quot;'+esc(ref)+'&quot;)">Retry settlement</button>'
            :'';
          var codActions='';
          if(item[0]==='codRemittancesNeedingAttention'&&x.remittance_id){
            var receiptAction=x.proof_url
              ?'<button type="button" class="ml-btn ml-btn-secondary" style="margin:8px 6px 0 0" onclick="window.ML_Premium.viewApplicationDocument(&quot;'+esc(x.proof_url)+'&quot;,&quot;COD deposit receipt&quot;)">View rider receipt</button>'
              :'<span style="display:block;margin-top:8px;color:#b45309">Receipt attachment missing</span>';
            var remittanceStatus=String(x.remittance_status||'').toLowerCase();
            var reviewActions=remittanceStatus==='submitted'
              ?'<button type="button" class="ml-btn ml-btn-primary" style="margin:8px 6px 0 0" onclick="window.ML_Premium.reviewCodRemittance(&quot;'+esc(x.remittance_id)+'&quot;,\'verified\')">Verify deposit</button><button type="button" class="ml-btn ml-btn-secondary" style="margin-top:8px" onclick="window.ML_Premium.reviewCodRemittance(&quot;'+esc(x.remittance_id)+'&quot;,\'rejected\')">Reject with reason</button>'
              :remittanceStatus==='verified'&&x.payment_id
                ?'<button type="button" class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.ML_Premium.confirmCodPayment(&quot;'+esc(x.payment_id)+'&quot;,&quot;'+esc(x.payment_record_status||'pending')+'&quot;)">Complete verified payment settlement</button>'
                :'';
            codActions=receiptAction+reviewActions;
          }
          return '<div class="ml-profile-row"><div class="ico">⚠️</div><div class="copy"><b>'+esc(ref)+'</b><span>'+esc(String(status).replace(/_/g,' '))+(detail.length?' · '+esc(detail.join(' · ')):'')+'</span>'+retryAction+codActions+'</div><strong>'+esc(amount)+'</strong></div>';
        }).join('')+'</div>':'<div class="ml-empty"><b>No matching records</b><span>This check found no records requiring attention.</span></div>';
        return '<div class="ml-section-head" style="margin-top:18px"><h3>'+esc(item[1])+'</h3><strong>'+rows.length+'</strong></div>'+html;
      }).join('');
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">MarketLink · Admin</div><h3 style="margin:4px 0">Financial reconciliation</h3></div><button onclick="window.ML_Premium.refreshFinancialReconciliation()">Refresh</button></div>'+
        '<div class="ml-wallet-note" style="margin:8px 0 14px;padding:12px;border-radius:12px">The audit is read-only. Only eligible pending settlements expose a separate, confirmed retry action; that action uses the existing locked settlement routine and will stop on ledger or recipient mismatches. Lists are capped at '+Number(data.limit||50)+' records per check.</div>'+
        '<div class="ml-stat-grid">'+cards+'</div>'+
        '<div class="ml-section-head" style="margin-top:16px"><h3>Total findings returned</h3><strong>'+Number(data.totalFindings||0)+'</strong></div>'+blocks+
        '<div class="ml-empty" style="margin-top:16px"><b>Audit generated</b><span>'+esc(data.generatedAt||'')+'. '+esc(data.note||'Review each finding before taking action.')+'</span></div></div>';
    }catch(e){
      root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>Financial reconciliation unavailable</b><span>'+esc(e.error||'The protected reconciliation endpoint did not return data.')+'</span><button class="ml-btn ml-btn-primary" style="margin-top:12px" onclick="window.ML_Premium.refreshFinancialReconciliation()">Retry</button></div></div>';
    }
  }


  async function renderLiveAdminTransactions(page){
    var root=G('adash-body');if(!root)return;
    var current=Math.max(1,Number(page)||1);
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Wallet transactions</div><div class="ml-hero-sub">Loading ledger entries from the production database…</div></div>';
    try{
      var response=await ML_API.admin.transactions({page:current,limit:50}),data=response&&response.data||{},rows=Array.isArray(data.items)?data.items:[];
      var html=rows.length?'<div class="ml-profile-card">'+rows.map(function(x){
        var credit=String(x.type||'').toLowerCase()==='credit';
        var date=x.created_at?new Date(x.created_at).toLocaleString():'Date unavailable';
        return '<div class="ml-profile-row"><div class="ico">'+(credit?'↙️':'↗️')+'</div><div class="copy"><b>'+esc(x.account_name||'Wallet account')+' · '+esc(x.category||'Transaction')+'</b><span>'+esc(x.description||x.reference_type||'Wallet activity')+' · '+esc(date)+'</span><small style="display:block;color:#C5D3DA;margin-top:4px">Reference: '+esc(x.reference_id||'—')+' · Balance after: '+money(x.balance_after||0)+'</small></div><strong style="color:'+(credit?'#55D6A0':'#FFB0A8')+'">'+(credit?'+':'−')+money(x.amount||0)+'</strong></div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No wallet transactions recorded</b><span>There are no transaction rows in the production ledger. No sample entries are displayed.</span></div>';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">DAHA WALLET LEDGER</div><h3 style="margin:4px 0">Wallet transactions</h3></div><button onclick="window.ML_Premium.refreshAdminTransactions(1)">Refresh</button></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Ledger entries</div><div class="ml-stat-value">'+Number(data.total||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Page</div><div class="ml-stat-value">'+Number(data.page||1)+' / '+Number(data.totalPages||0)+'</div></div></div>'+html+
        '<div class="ml-section-head" style="margin-top:14px"><span style="font-size:11px;color:#B8C8D2">Page '+Number(data.page||1)+' of '+Number(data.totalPages||0)+'</span><div style="display:flex;gap:8px"><button class="ml-btn ml-btn-secondary" '+(current<=1?'disabled':'')+' onclick="window.ML_Premium.refreshAdminTransactions('+(current-1)+')">Previous</button><button class="ml-btn ml-btn-secondary" '+(current>=Number(data.totalPages||0)?'disabled':'')+' onclick="window.ML_Premium.refreshAdminTransactions('+(current+1)+')">Next</button></div></div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Wallet transactions unavailable</b><span>'+esc(e.error||e.message||'The Admin ledger feed could not be loaded.')+'</span><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.refreshAdminTransactions(1)">Retry</button></div>';}
  }

  async function renderLiveAdminFailedPayments(page){
    var root=G('adash-body');if(!root)return;
    var current=Math.max(1,Number(page)||1);
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Failed payments</div><div class="ml-hero-sub">Loading failed and stale pending payments…</div></div>';
    try{
      var response=await ML_API.admin.failedPayments({page:current,limit:50}),data=response&&response.data||{},rows=Array.isArray(data.items)?data.items:[];
      var html=rows.length?'<div class="ml-profile-card">'+rows.map(function(x){
        var date=x.created_at?new Date(x.created_at).toLocaleString():'Date unavailable';
        return '<div class="ml-profile-row"><div class="ico">⚠️</div><div class="copy"><b>'+esc(x.order_number||x.order_id||'Order payment')+' · '+esc(paymentMethodLabel(x.method)||'Payment method')+'</b><span>'+esc(x.status||'unknown')+' · Order '+esc(x.order_status||'unknown')+' · Payment '+esc(x.payment_status||'unknown')+'</span><small style="display:block;color:#C5D3DA;margin-top:4px">Created: '+esc(date)+' · Refund: '+esc(x.refund_status||'none')+(Number(x.refund_amount||0)>0?' · '+money(x.refund_amount):'')+'</small></div><strong>'+money(x.amount||0)+'</strong></div>';
      }).join('')+'</div>':'<div class="ml-empty"><b>No failed or stale pending payments</b><span>The production payment table has no failed payments or pending attempts older than 15 minutes.</span></div>';
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><div><div class="ml-eyebrow">PAYMENT EXCEPTIONS</div><h3 style="margin:4px 0">Failed payments</h3></div><button onclick="window.ML_Premium.refreshAdminFailedPayments(1)">Refresh</button></div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Exceptions</div><div class="ml-stat-value">'+Number(data.total||0)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Page</div><div class="ml-stat-value">'+Number(data.page||1)+' / '+Number(data.totalPages||0)+'</div></div></div>'+html+
        '<div class="ml-section-head" style="margin-top:14px"><span style="font-size:11px;color:#B8C8D2">Page '+Number(data.page||1)+' of '+Number(data.totalPages||0)+'</span><div style="display:flex;gap:8px"><button class="ml-btn ml-btn-secondary" '+(current<=1?'disabled':'')+' onclick="window.ML_Premium.refreshAdminFailedPayments('+(current-1)+')">Previous</button><button class="ml-btn ml-btn-secondary" '+(current>=Number(data.totalPages||0)?'disabled':'')+' onclick="window.ML_Premium.refreshAdminFailedPayments('+(current+1)+')">Next</button></div></div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Failed payment feed unavailable</b><span>'+esc(e.error||e.message||'The Admin payment exception feed could not be loaded.')+'</span><button class="ml-btn ml-btn-primary" onclick="window.ML_Premium.refreshAdminFailedPayments(1)">Retry</button></div>';}
  }

  function renderAdminUnavailable(title,detail){
    var root=G('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>'+esc(title)+'</b><span>'+esc(detail)+'</span></div></div>';
  }
  var ADMIN_AFFILIATE_KYC_PAGE=1;
  var ADMIN_AFFILIATE_KYC_STATUS='pending';

  async function renderAdminAffiliateMarketers(page,status){
    var root=G('adash-body');if(!root)return;
    ADMIN_AFFILIATE_KYC_PAGE=Math.max(1,Number(page)||1);
    ADMIN_AFFILIATE_KYC_STATUS=String(status||ADMIN_AFFILIATE_KYC_STATUS||'pending');
    root.innerHTML='<div class="ml-premium-home"><div class="ml-hero-title">Affiliate Marketer KYC</div><div class="ml-hero-sub">Loading applications from the production database…</div></div>';
    try{
      var response=await ML_API.admin.affiliateMarketerApplications({page:ADMIN_AFFILIATE_KYC_PAGE,limit:25,status:ADMIN_AFFILIATE_KYC_STATUS});
      var data=response&&response.data||{},items=Array.isArray(data.items)?data.items:[];
      var filters=[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['suspended','Suspended'],['all','All']];
      var filterHtml=filters.map(function(x){return '<button type="button" class="ml-btn '+(ADMIN_AFFILIATE_KYC_STATUS===x[0]?'ml-btn-primary':'ml-btn-secondary')+'" onclick="window.ML_Premium.refreshAffiliateKyc(1,\''+x[0]+'\')">'+x[1]+'</button>';}).join('');
      var cards=items.map(function(a){
        var id=String(a.id||'').replace(/[^a-f0-9-]/gi,'');
        var statusText=String(a.status||'pending').toLowerCase();
        var accountStatus=String(a.account_status||'unknown').toLowerCase();
        var accountIsActive=accountStatus==='active';
        var channels=Array.isArray(a.marketing_channels)?a.marketing_channels.join(', '):'Not provided';
        var socials=a.social_links&&typeof a.social_links==='object'?Object.keys(a.social_links).map(function(k){return k+': '+a.social_links[k];}).join(' · '):'';
        var docs='';
        if(a.identity_document_file_id)docs+='<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewAffiliateKycFile(\''+a.identity_document_file_id+'\')">View identity document</button>';
        if(a.selfie_file_id)docs+='<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewAffiliateKycFile(\''+a.selfie_file_id+'\')">View selfie</button>';
        if(a.address_proof_file_id)docs+='<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.viewAffiliateKycFile(\''+a.address_proof_file_id+'\')">View address proof</button>';
        var actions='';
        if(statusText==='pending'){
          actions=(accountIsActive
            ?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.reviewAffiliateMarketer(\''+id+'\',\'approved\')">Approve marketer</button>'
            :'<span class="ml-status-pill" style="color:#FCA5A5">Approval blocked · account '+esc(accountStatus)+'</span>')+
            '<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.reviewAffiliateMarketer(\''+id+'\',\'rejected\')">Reject application</button>';
        }else if(statusText==='approved'){
          actions='<button type="button" class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.reviewAffiliateMarketer(\''+id+'\',\'suspended\')">Suspend access</button>';
        }else if(statusText==='suspended'){
          actions=(accountIsActive
            ?'<button type="button" class="ml-btn ml-btn-primary" onclick="window.ML_Premium.reviewAffiliateMarketer(\''+id+'\',\'reinstated\')">Reinstate marketer</button>'
            :'<span class="ml-status-pill" style="color:#FCA5A5">Reinstatement blocked · account '+esc(accountStatus)+'</span>');
        }
        return '<article class="ml-profile-card" style="margin-bottom:12px;padding:15px"><div class="ml-section-head"><div><b style="color:#fff">'+esc(a.legal_name||a.full_name||'Applicant')+'</b><div style="font-size:10px;color:#91A5B5;margin-top:4px">'+esc(a.full_name||'')+' · '+esc(a.phone||'No phone')+' · '+esc(a.email||'No email')+'</div></div><span class="ml-status-pill">'+esc(statusText)+'</span></div>'+
          '<div style="font-size:11px;color:#DCE8ED;line-height:1.6;margin-top:9px"><b>MarketLink account:</b> '+esc(accountStatus)+'<br><b>Residential address:</b> '+esc(a.residential_address||'Not provided')+'<br><b>Promotion channels:</b> '+esc(channels)+'<br><b>Marketing plan:</b><br>'+esc(a.marketing_plan||'Not provided')+
          (socials?'<br><b>Social links:</b> '+esc(socials):'')+
          (a.rejection_reason?'<br><b>Review feedback:</b> '+esc(a.rejection_reason):'')+'</div>'+
          '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:12px">'+docs+'</div>'+
          (actions?'<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">'+actions+'</div>':'')+'</article>';
      }).join('');
      var total=Number(data.total||0),pages=Math.max(1,Number(data.totalPages||1));
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-section-head"><div><div class="ml-eyebrow">ADMIN · IDENTITY & ELIGIBILITY</div><h3 style="color:#fff;margin:6px 0 0;font-size:22px">Affiliate Marketer applications</h3></div><button class="ml-btn ml-btn-secondary" onclick="window.ML_Premium.refreshAffiliateKyc()">↻ Refresh</button></div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:7px;margin:12px 0">'+filterHtml+'</div>'+
        '<div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Applications in this view</div><div class="ml-stat-value">'+items.length+'</div></div><div class="ml-stat"><div class="ml-stat-label">Matching applications</div><div class="ml-stat-value">'+total+'</div></div></div>'+
        (cards||'<div class="ml-empty"><b>No '+esc(ADMIN_AFFILIATE_KYC_STATUS==='all'?'':ADMIN_AFFILIATE_KYC_STATUS+' ')+'Affiliate Marketer applications</b><span>There are no matching applications in the production database.</span></div>')+
        (pages>1?'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:14px 0"><button class="ml-btn ml-btn-secondary" '+(ADMIN_AFFILIATE_KYC_PAGE<=1?'disabled':'')+' onclick="window.ML_Premium.refreshAffiliateKyc('+(ADMIN_AFFILIATE_KYC_PAGE-1)+')">Previous</button><span style="color:#9FB0BD;font-size:11px">Page '+ADMIN_AFFILIATE_KYC_PAGE+' of '+pages+'</span><button class="ml-btn ml-btn-secondary" '+(ADMIN_AFFILIATE_KYC_PAGE>=pages?'disabled':'')+' onclick="window.ML_Premium.refreshAffiliateKyc('+(ADMIN_AFFILIATE_KYC_PAGE+1)+')">Next</button></div>':'')+
        '</div>';
    }catch(error){
      root.innerHTML='<div class="ml-profile-shell"><div class="ml-empty"><b>Affiliate Marketer review queue unavailable</b><span>'+esc(error.error||error.message||'The backend did not return the application queue.')+'</span><button class="ml-btn ml-btn-primary" onclick="adminGoTo(\'affiliate-marketers\')">Retry</button></div></div>';
    }
  }

  async function viewAffiliateKycFile(fileId){
    var id=String(fileId||'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){toast('Invalid KYC document reference.','error');return;}
    var token=ML_API.getAccessToken&&ML_API.getAccessToken();
    var popup=window.open('about:blank','_blank');
    if(!token){if(popup)popup.close();toast('Please sign in again to view private KYC documents.','warning');return;}
    if(popup){popup.opener=null;popup.document.write('<title>Secure KYC document</title><p style="font:14px sans-serif;padding:24px">Loading secure document…</p>');}
    try{
      var base=String(window.ML_API_URL||'https://marketlink-gambia.onrender.com').replace(/\/+$/,'');
      var response=await fetch(base+'/api/v1/uploads/'+id+'/content',{headers:{Authorization:'Bearer '+token}});
      if(!response.ok)throw new Error(response.status===403?'Your account is not authorized to view this document.':'The secure document could not be loaded.');
      var blob=await response.blob(),url=URL.createObjectURL(blob);
      if(popup)popup.location.href=url;
      else{
        var link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.click();
      }
      setTimeout(function(){URL.revokeObjectURL(url);},60000);
    }catch(error){if(popup)popup.close();toast(error.message||'Could not open the private document.','error');}
  }

  async function reviewAffiliateMarketerApplication(id,decision){
    var reason='';
    if(decision==='rejected'||decision==='suspended'){
      reason=window.prompt(decision==='rejected'?'Reason for rejecting this application:':'Reason for suspending this marketer:','');
      if(!reason||!reason.trim())return;
    }
    if(decision==='approved'&&!window.confirm('Approve this Affiliate Marketer? This grants the marketer role and enables the configured affiliate commission for qualifying completed orders.'))return;
    if(decision==='reinstated'&&!window.confirm('Reinstate this Affiliate Marketer account?'))return;
    try{
      await ML_API.admin.reviewAffiliateMarketerApplication(id,{decision:decision,reason:reason.trim()});
      toast('Affiliate Marketer review saved.','success');
      await renderAdminAffiliateMarketers(ADMIN_AFFILIATE_KYC_PAGE,ADMIN_AFFILIATE_KYC_STATUS);
    }catch(error){toast(error.error||error.message||'The review could not be saved.','error');}
  }

  function adminGoToLive(tab){
    if(tab==='affiliate-marketers'){renderAdminAffiliateMarketers(1,'pending');return;}
    if(tab==='overview'){refreshAdmin();return;}
    if(tab==='analytics'){renderLiveAdminAnalytics('30d');return;}
    if(tab==='f-revenue'){renderLiveAdminRevenue();return;}
    if(tab==='f-payouts'){renderLiveAdminPayouts();return;}
    if(tab==='f-reconciliation'){renderFinancialReconciliation();return;}
    if(tab==='f-transactions'){renderLiveAdminTransactions(1);return;}
    if(tab==='f-failed'){renderLiveAdminFailedPayments(1);return;}
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
    {eyebrow:'OFFICIAL AFFILIATE MARKETER PROGRAMME',title:'Build your',accent:'marketing business.',body:'Apply with your identity documents. After Admin approval, access a dedicated marketer workspace and eligible commission tools. Customer referrals alone do not earn commissions.',chips:['Submit KYC','Admin verification','Dedicated marketer workspace'],image:'https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=1600&q=85',visualTitle:'Become an approved marketer',visualNote:'Professional marketer access begins only after Admin approval.',symbol:'🔗'}
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
      (S.obSlide===2?'<div class="ml-ob-reward"><strong>✓</strong><span>Admin approval<small>required before paid marketer access</small></span></div>':'<div class="ml-ob-visual-pills"><span>SHOP</span><span>SELL</span><span>DELIVER</span></div>')+
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
  window.openAffiliateMarketerApply=function(){
    if(!ML_API.auth.isAuthenticated()){goAuth();return;}
    if(window.ML_Premium&&typeof window.ML_Premium.openProfilePage==='function'){
      window.ML_Premium.openProfilePage('affiliate-marketer');
    }else{
      toast('Please open your Profile to continue with the Affiliate Marketer application.','info');
    }
  };
  window.goOnboard=goOnboardPremium;
  window.renderOnboard=function(){renderPremiumOnboarding(true);};
  window.obNext=obNextLive;
  window.continueFromOtpReveal=continueOtpLive;
  var existingAdminGoTo=window.adminGoTo;
  window.__ML_ORIGINAL_ADMIN_GOTO=existingAdminGoTo;
  window.adminGoTo=adminGoToLive;
    window.ML_Premium={openMessages:openMessages,openVendorChat:openVendorChat,toggleAppearance:togglePremiumAppearance,handleProfilePhoto:handleProfilePhotoInput,removeProfilePhoto:removeProfilePhoto,renderCategories:function(){S.activeCategoryId=null;S.activeCategoryName=null;switchTab('catpage');},openOrders:function(){switchTab('orders');},viewOrder:openOrderDetail,showProfileOverview:function(){S.profilePage=null;renderPremiumProfile();},openProfilePage:openProfilePage,searchAddressSuggestions:searchGambiaAddressSuggestions,selectAddressSuggestion:selectGambiaAddressSuggestion,useCurrentAddressLocation:useCurrentAddressLocation,cancelEditAddress:cancelEditAddress,choosePaymentFromSettings:choosePaymentFromSettings,openMarketLinkAI:openMarketLinkAI,askMarketLinkAI:openMarketLinkAIWithQuestion,askMarketLinkAIFromButton:openMarketLinkAIFromButton,applyLanguagePreference:function(){var v=G('ml-language-profile');if(v&&window.MarketLinkI18n)window.MarketLinkI18n.setLanguage(v.value);toast('Language preference saved.','success');},openRoleDashboard:openRoleDashboard,refreshWallet:function(){return renderPremiumWalletPage(G('profile-body'));},toggleWithdrawalNetwork:toggleDahaPayoutNetwork,selectWithdrawalNetwork:selectDahaPayoutNetwork,submitDahaDeposit:submitDahaDeposit,selectDahaDepositMethod:selectDahaDepositMethod,continueDahaDeposit:continueDahaDeposit,saveDahaPayoutProfile:saveDahaPayoutProfile,reviewDahaWithdrawal:reviewDahaWithdrawal,submitDahaWithdrawal:reviewDahaWithdrawal,confirmDahaWithdrawal:confirmDahaWithdrawal,cancelDahaWithdrawalReview:cancelDahaWithdrawalReview,beginDahaWithdrawal:beginDahaWithdrawal,markNotificationRead:markPremiumNotificationRead,markAllNotificationsRead:markAllPremiumNotificationsRead,removeWishlist:removePremiumWishlistItem,removeCompareItem:removePremiumCompareItem,goOnboardTo:goOnboardTo,promoAction:promoAction,goPromoTo:function(i){paintPromoCarousel(i);},promoNext:function(){paintPromoCarousel(mlPromoIndex+1);},promoPrev:function(){paintPromoCarousel(mlPromoIndex-1);},refresh:refresh,refreshCart:function(){S.deliveryQuoteCache=null;return renderLiveCart();},refreshAdmin:refreshAdmin,refreshAdminAnalytics:function(period){return renderLiveAdminAnalytics(period||'30d');},refreshAdminRevenue:renderLiveAdminRevenue,refreshAdminPayouts:renderLiveAdminPayouts,refreshFinancialReconciliation:renderFinancialReconciliation,retryFinancialSettlement:retryAdminSettlement,refreshAdminTransactions:renderLiveAdminTransactions,refreshAdminFailedPayments:renderLiveAdminFailedPayments,approveDahaWithdrawal:approveDahaWithdrawal,rejectDahaWithdrawal:rejectDahaWithdrawal,reconcileDahaWithdrawal:reconcileDahaWithdrawal,selectAddress:selectAddress,selectDeliveryQuote:selectDeliveryQuote,selectPayment:selectPayment,setCoupon:setCoupon,manageAddresses:manageAddresses,editAddress:editAddress,addAddress:addAddress,setDefaultAddress:setDefaultAddress,deleteAddress:deleteAddress,renderAddresses:renderAddresses,approveApplicant:approveApplicant,rejectApplicant:rejectApplicant,openCategory:openCategory,openProduct:openProduct,add:add,placeOrder:placeLiveOrder,checkPaymentStatus:function(){return checkLivePaymentStatus(false);},continueModemPay:continueLiveModemPayment,restoreCartAndRetry:restoreLiveCartAfterPaymentFailure,finishPaidOrder:finishLivePaidOrder,editProfile:editProfileModal,saveProfile:saveProfile,saveProfilePhoto:saveProfilePhoto,pickPhoto:pickProfilePhoto,takePhoto:takeProfilePhoto,openPhotoViewer:openProfilePhotoViewer,closePhotoViewer:closeProfilePhotoViewer,renderProfile:renderPremiumProfile,submitVendor:submitVendor,submitRider:submitRider,toggleRiderOnline:toggleRiderOnline,load:loadLiveHome,adminRefresh:loadAdminDashboard,confirmCodPayment:confirmCodPayment,submitCodRemittance:submitCodRemittance,reviewCodRemittance:reviewCodRemittance,adminApprovals:adminApprovals,approve:approveAdmin,adminUsers:adminUsers,viewApplicationDocument:viewApplicationDocument,rejectApplication:rejectApplication,refreshAffiliateKyc:renderAdminAffiliateMarketers,viewAffiliateKycFile:viewAffiliateKycFile,reviewAffiliateMarketer:reviewAffiliateMarketerApplication};
  function switchTab(tab){
    if(tab!=='orders')stopCustomerOrderDetailPolling();
    S.curTab=tab;
    ['home','catpage','store','cart','orders','profile','vendordash','riderdash','admindash'].forEach(function(x){var el=G('tab-'+x);if(el)el.style.display='none';});
    var target=G('tab-'+tab);if(target)target.style.display='block';
    var nav=G('bnav');if(nav)nav.style.display=tab==='admindash'?'none':'flex';
    if(tab==='home'){if(window.ML_Premium&&typeof window.ML_Premium.load==='function')window.ML_Premium.load().catch(function(e){console.error('[MarketLink] Premium home refresh failed:',e);});else renderHome();}
    else if(tab==='cart')renderCart();
    else if(tab==='orders'){renderLiveOrders();if(typeof startOrderTracking==='function'&&S.order)startOrderTracking();}
    else if(tab==='profile'){if(typeof window.renderProfile==='function')window.renderProfile();else renderPremiumProfile();}
    else if(tab==='vendordash')renderVDash();
    else if(tab==='riderdash')renderRDash();
    else if(tab==='admindash')loadAdminDashboard();
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
  window.ML_Premium.resumeRiderAvailabilityLocationSharing=function(){if(S.rOnline)startRiderAvailabilityLocationSharing(false);else stopRiderAvailabilityLocationSharing();};
  window.rToggleOnline=toggleRiderOnline;
  window.editName=editProfileModal;
  window.reorderPastOrder=reorderLive;
  window.renderAddrPage=renderAddresses;
  window.addAddr=function(){renderAddresses();};
  window.saveNewAddr=addAddress;
  window.setDefAddr=setDefaultAddress;
  window.delAddr=deleteAddress;
  window.doAdminLogin=liveAdminLogin;
  window.renderPremiumAdminLogin=function(){var i=G('admin-staffid'),p=G('admin-password');if(i){i.placeholder='e.g. 871234567';i.type='tel';i.inputMode='tel';i.autocomplete='username';}if(p){p.placeholder='4-digit PIN';p.maxLength=4;}};
  window.handlePhoto=function(inp){if(inp&&inp.files&&inp.files[0])saveProfilePhoto(inp.files[0]);};
  window.uploadPhoto=function(){var el=document.getElementById('ml-profile-photo-input');if(el)el.click();};
  // Remove the persistent fake/offline demo banner when backend is available.
  window.ML_Premium.removeDemoBanner=function(){var b=G('demo-mode-banner');if(b)b.remove();};
  document.addEventListener('DOMContentLoaded',function(){
    if(window.ML_Premium.renderPremiumAdminLogin)window.ML_Premium.renderPremiumAdminLogin();
    setTimeout(function(){if(apiOk())window.ML_Premium.removeDemoBanner();},1200);
  });

  function installPremiumPullToRefresh(){
    if(window.__marketLinkPullRefreshInstalled)return;
    window.__marketLinkPullRefreshInstalled=true;
    var startY=0,scrollNode=null,eligible=false;
    function isControl(node){
      return !!(node&&node.closest&&node.closest('input,textarea,select,button,[contenteditable="true"],.sheet-ov.open,[role="dialog"]'));
    }
    function findScrollNode(node){
      var current=node;
      while(current&&current!==document.body&&current!==document.documentElement){
        if(current.scrollHeight>current.clientHeight+2){
          var style=window.getComputedStyle?getComputedStyle(current):null;
          var overflow=style?(style.overflowY||style.overflow):'auto';
          if(/auto|scroll|overlay/.test(overflow))return current;
        }
        current=current.parentElement;
      }
      return document.scrollingElement||document.documentElement;
    }
    document.addEventListener('touchstart',function(event){
      if(!event.touches||event.touches.length!==1||isControl(event.target)){eligible=false;return;}
      var app=document.getElementById('scr-app');
      if(app&&!app.classList.contains('active')){eligible=false;return;}
      scrollNode=findScrollNode(event.target);
      eligible=!!scrollNode&&scrollNode.scrollTop<=1;
      startY=event.touches[0].clientY;
    },{passive:true});
    document.addEventListener('touchend',function(event){
      if(!eligible||!event.changedTouches||!event.changedTouches.length){eligible=false;return;}
      var delta=event.changedTouches[0].clientY-startY;
      var atTop=!scrollNode||scrollNode.scrollTop<=1;
      eligible=false;scrollNode=null;
      if(delta<105||!atTop)return;
      refreshCurrentView();
    },{passive:true});
    document.addEventListener('touchcancel',function(){eligible=false;scrollNode=null;},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installPremiumPullToRefresh,{once:true});
  else installPremiumPullToRefresh();

  window.ML_Premium.refreshCurrentView=refreshCurrentView;
  function installDesktopRefresh(){
    if(window.__marketLinkDesktopRefreshInstalled||!document.body)return;
    window.__marketLinkDesktopRefreshInstalled=true;
    var app=G('scr-app');
    var button=G('ml-global-refresh');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.id='ml-global-refresh';
      button.className='ml-global-refresh';
      button.setAttribute('aria-label','Refresh current MarketLink view');
      button.title='Refresh current MarketLink view';
      button.innerHTML='<span aria-hidden="true">↻</span><span class="ml-global-refresh-label">Refresh</span>';
      document.body.appendChild(button);
    }
    button.addEventListener('click',async function(){
      if(button.disabled)return;
      var label=button.querySelector('.ml-global-refresh-label');
      button.disabled=true;
      button.classList.add('is-refreshing');
      if(label)label.textContent='Refreshing…';
      try{await refreshCurrentView();}
      catch(error){toast(error&&error.error||'Could not refresh this MarketLink view.','error');}
      finally{
        button.disabled=false;
        button.classList.remove('is-refreshing');
        if(label)label.textContent='Refresh';
      }
    });
    function syncVisibility(){
      var active=!!app&&app.classList.contains('active');
      var tab=String(S.curTab||'home');
      var homeHasOwnRefresh=tab==='home'&&!!document.querySelector('.ml-home-refresh');
      button.hidden=!(active&&window.innerWidth>820&&!homeHasOwnRefresh);
    }
    if(app&&typeof MutationObserver==='function'){
      var observer=new MutationObserver(syncVisibility);
      observer.observe(app,{attributes:true,attributeFilter:['class'],subtree:true});
      window.__marketLinkDesktopRefreshObserver=observer;
    }
    window.addEventListener('resize',syncVisibility,{passive:true});
    syncVisibility();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDesktopRefresh,{once:true});
  else installDesktopRefresh();

  // Session restoration may call goApp() before this deferred premium bundle runs.
  // Reconcile that boot order so returning users cannot remain on legacy markup.
  function reconcilePremiumHomeAfterBundleLoad(){
    window.__ML_PREMIUM_BOOT_STATE='ready';
    // Do not call or depend on the retired legacy homepage. Session restoration
    // and premium module readiness converge on one explicit entry point.
    if(window.__ML_PENDING_PREMIUM_HOME&&typeof window.__ML_START_PREMIUM_HOME==='function'){
      window.__ML_START_PREMIUM_HOME();
    }
    document.dispatchEvent(new Event('marketlink:premium-ready'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reconcilePremiumHomeAfterBundleLoad,{once:true});
  else reconcilePremiumHomeAfterBundleLoad();
  } catch (bootError) {
    window.__ML_PREMIUM_BOOT_STATE='error';
    window.__ML_PREMIUM_BOOT_ERROR=String(bootError&&bootError.stack||bootError&&bootError.message||bootError);
    console.error('[MarketLink premium] Module initialization failed before API registration:',bootError);
    var root=document.getElementById('tab-home');
    if(root){
      var safe=String(bootError&&bootError.message||bootError||'Unknown initialization error').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});
      root.innerHTML='<div class="ml-premium-home"><div class="ml-empty"><b>MarketLink premium startup error</b><span style="display:block;overflow-wrap:anywhere;margin:10px 0">'+safe+'</span><small style="display:block;opacity:.75">The premium module failed during initialization. Your account and records have not been changed.</small><button type="button" class="ml-btn ml-btn-primary" onclick="location.reload()">Retry MarketLink</button></div></div>';
    }
    document.dispatchEvent(new CustomEvent('marketlink:premium-error',{detail:{message:String(bootError&&bootError.message||bootError||'Unknown error')}}));
  }
})();