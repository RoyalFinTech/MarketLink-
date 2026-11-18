/* MarketLink Admin-only entry point.
   Injected only by the separate Render Admin site's build.
   Keep all presentation and routing changes isolated from the customer app. */
(function () {
  'use strict';

  window.__ML_ADMIN_PORTAL_MODE = true;

  // The shared Admin dashboard references AdminSession, but the production
  // bundle does not define it. Keep this lightweight identity marker local to
  // the dedicated Admin deployment; authentication remains in ML_API/backend.
  if (!window.AdminSession) {
    window.AdminSession = {
      staffId: null,
      active: false,
      startedAt: null,
      start: function (staffId) {
        this.staffId = String(staffId || 'Admin');
        this.active = true;
        this.startedAt = Date.now();
      },
      end: function () {
        this.staffId = null;
        this.active = false;
        this.startedAt = null;
      }
    };
  }

  var style = document.createElement('style');
  style.id = 'ml-admin-isolation-style';
  style.textContent = [
    '#scr-splash,#scr-onboard,#scr-auth,#scr-returning{display:none!important;visibility:hidden!important;pointer-events:none!important}',
    '#scr-admin-login,#scr-app{visibility:visible}',
    '#scr-admin-login.active~#ml-live-promo-ticker,#ml-live-promo-ticker,#ml-install-prompt{display:none!important}',
    /* Admin portal: light by default, and follows the device appearance in dark mode. */
    '#scr-admin-login{background:#f4f7fb!important;color:#152536!important;overflow-y:auto!important;height:auto!important;min-height:100%!important;padding-bottom:28px!important;color-scheme:light}',
    '#scr-admin-login .ml-admin-hero{position:relative;overflow:hidden;padding:34px 22px 28px;text-align:center;background:linear-gradient(145deg,#ffffff 0%,#eaf2f8 62%,#fff7e6 100%);border-bottom:1px solid rgba(16,48,68,.12)}',
    '#scr-admin-login .ml-admin-brandmark{position:relative;width:112px;height:90px;margin:0 auto 13px;display:flex;align-items:center;justify-content:center}',
    '#scr-admin-login .ml-admin-brandmark img{display:block;width:104px;height:84px;object-fit:contain;filter:drop-shadow(0 7px 12px rgba(16,48,68,.13))}',
    '#scr-admin-login .ml-admin-shield{position:absolute;right:-3px;bottom:0;width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:#fff;border:1px solid rgba(18,111,116,.28);box-shadow:0 3px 12px rgba(16,48,68,.13);font-size:18px}',
    '#scr-admin-login .ml-admin-title{margin:0;color:#102d40;font-size:23px;line-height:1.2;font-weight:850;letter-spacing:-.035em}',
    '#scr-admin-login .ml-admin-subtitle{margin:8px auto 0;max-width:320px;color:#526779;font-size:13px;line-height:1.55}',
    '#scr-admin-login .ml-admin-card{width:min(100% - 32px,460px);margin:24px auto 0;padding:22px 19px 20px;background:#fff;border:1px solid #dce5ec;border-radius:20px;box-shadow:0 12px 35px rgba(20,47,68,.08)}',
    '#scr-admin-login .ml-admin-kicker{margin:0 0 17px;color:#176b70;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}',
    '#scr-admin-login .ml-admin-label{display:block;margin:0 0 7px;color:#344b5d;font-size:12px;font-weight:750}',
    '#scr-admin-login #ml-admin-phone-slot{min-height:54px;margin-bottom:17px;border:1px solid #cbd8e2;border-radius:13px;overflow:hidden;background:#fff}',
    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone{margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#fff!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone>span{background:#eef4f8!important;color:#18384d!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-gm-phone select,#scr-admin-login #ml-admin-phone-slot .ml-gm-phone input{background:#fff!important;color:#18384d!important;-webkit-text-fill-color:#18384d!important;color-scheme:light!important}',
    '#scr-admin-login #ml-admin-phone-slot .ml-phone-guidance{display:none!important}',
    '#scr-admin-login #admin-password{display:block;width:100%;box-sizing:border-box;min-height:54px;margin:0 0 18px;padding:13px 15px;border:1px solid #cbd8e2;border-radius:13px;background:#fff;color:#142b3d;-webkit-text-fill-color:#142b3d;font-size:20px;font-weight:750;letter-spacing:.32em;text-align:left;outline:none;color-scheme:light}',
    '#scr-admin-login #admin-password:focus,#scr-admin-login #ml-admin-phone-slot:focus-within{border-color:#d39b2b;box-shadow:0 0 0 3px rgba(211,155,43,.15)}',
    '#scr-admin-login #admin-lbtn{width:100%;min-height:52px;border:0!important;border-radius:13px!important;background:linear-gradient(100deg,#126f74,#0b505a)!important;color:#fff!important;font-size:15px!important;font-weight:800!important;box-shadow:0 8px 18px rgba(18,111,116,.2)}',
    '#scr-admin-login #admin-lbtn:disabled{opacity:.65}',
    '#scr-admin-login .ml-admin-security{display:flex;gap:10px;align-items:flex-start;margin:17px 2px 0;padding:12px 13px;border:1px solid #e7dfc9;border-radius:12px;background:#fffaf0;color:#5b5545;font-size:11px;line-height:1.55}',
    '#scr-admin-login .ml-admin-security strong{display:block;color:#755719;font-size:11px;margin-bottom:2px}',
    '#scr-admin-login #admin-auth-err{margin:0 0 14px!important;border-radius:11px!important;font-size:12px!important}',
    '#scr-admin-login .ml-admin-footer{margin:17px auto 0;text-align:center;color:#718393;font-size:10px;line-height:1.5}',
    '@media(prefers-color-scheme:dark){#scr-admin-login{background:#09131e!important;color:#eaf2f8!important;color-scheme:dark}#scr-admin-login .ml-admin-hero{background:linear-gradient(145deg,#101e2b 0%,#142b3b 65%,#302817 100%);border-color:rgba(245,184,61,.2)}#scr-admin-login .ml-admin-title{color:#f5f8fb}#scr-admin-login .ml-admin-subtitle{color:#a9bbc8}#scr-admin-login .ml-admin-card{background:#101e2b;border-color:#294052;box-shadow:0 14px 38px rgba(0,0,0,.24)}#scr-admin-login .ml-admin-kicker{color:#70d6c4}#scr-admin-login .ml-admin-label{color:#d0dce5}#scr-admin-login #ml-admin-phone-slot{background:#0b1925;border-color:#395064}#scr-admin-login #ml-admin-phone-slot .ml-gm-phone>span{background:#18384d!important;color:#f4f8fb!important}#scr-admin-login #ml-admin-phone-slot .ml-gm-phone select,#scr-admin-login #ml-admin-phone-slot .ml-gm-phone input{background:#0b1925!important;color:#f4f8fb!important;-webkit-text-fill-color:#f4f8fb!important;color-scheme:dark!important}#scr-admin-login #admin-password{background:#0b1925;color:#f4f8fb;-webkit-text-fill-color:#f4f8fb;border-color:#395064;color-scheme:dark}#scr-admin-login .ml-admin-security{background:#172a32;border-color:#43513d;color:#c4d3d9}#scr-admin-login .ml-admin-security strong{color:#f4cf78}#scr-admin-login .ml-admin-footer{color:#8297a7}}',
    '@media(max-width:480px){#scr-admin-login .ml-admin-hero{padding:26px 18px 23px}#scr-admin-login .ml-admin-title{font-size:21px}#scr-admin-login .ml-admin-card{margin-top:18px;padding:19px 15px}}'
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  // The API login response is { user: { id, fullName, phone, roles }, accessToken, refreshToken }.
  // The legacy Admin handler expects those user fields at the top level. Normalize
  // only inside this Admin-only deployment; the customer frontend remains untouched.
  function normalizeAdminAuthResponse() {
    var auth = window.ML_API && window.ML_API.auth;
    if (!auth || typeof auth.login !== 'function' || auth.login.__mlAdminResponseNormalized) return;
    var originalLogin = auth.login;
    var normalizedLogin = async function () {
      var response = await originalLogin.apply(this, arguments);
      if (response && response.user && typeof response.user === 'object') {
        return Object.assign({}, response.user, {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken
        });
      }
      return response;
    };
    normalizedLogin.__mlAdminResponseNormalized = true;
    auth.login = normalizedLogin;
  }

  function buildAdminLogin() {
    var screen = document.getElementById('scr-admin-login');
    if (!screen || screen.getAttribute('data-ml-admin-redesigned') === '1') return;
    screen.innerHTML =
      '<section class="ml-admin-hero">' +
        '<div class="ml-admin-brandmark"><img src="./assets/marketlink-logo.png" alt="MarketLink Gambia logo"><span class="ml-admin-shield" aria-hidden="true">🛡️</span></div>' +
        '<h1 class="ml-admin-title">MarketLink Admin Portal</h1>' +
        '<p class="ml-admin-subtitle">Secure access for authorised MarketLink administrators and staff.</p>' +
      '</section>' +
      '<section class="ml-admin-card" aria-label="Administrator sign in">' +
        '<p class="ml-admin-kicker">Administrator sign in</p>' +
        '<div id="admin-auth-err" role="alert" aria-live="polite" style="display:none"></div>' +
        '<label class="ml-admin-label" for="admin-national">Gambian mobile number</label>' +
        '<div id="ml-admin-phone-slot"><input class="inp" type="tel" inputmode="numeric" autocomplete="tel-national" id="admin-staffid" placeholder="7-digit mobile number"></div>' +
        '<label class="ml-admin-label" for="admin-password">4-digit security PIN</label>' +
        '<input class="inp" type="password" id="admin-password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="Enter your PIN" aria-label="Four digit administrator PIN" onkeydown="if(event.key===\'Enter\')doAdminLogin()">' +
        '<button class="btn" type="button" id="admin-lbtn" onclick="doAdminLogin()">Sign in securely</button>' +
        '<div class="ml-admin-security"><span aria-hidden="true">🔒</span><div><strong>Restricted administrator area</strong>Only approved MarketLink admin accounts can enter. Access is verified securely by the MarketLink server.</div></div>' +
        '<p class="ml-admin-footer">MarketLink Gambia · Royal FinTech Company</p>' +
      '</section>';
    screen.setAttribute('data-ml-admin-redesigned', '1');
  }

  function openAdmin() {
    buildAdminLogin();
    if (typeof window.openAdminLogin === 'function') {
      window.openAdminLogin();
      return true;
    }
    var login = document.getElementById('scr-admin-login');
    if (login) {
      document.querySelectorAll('.screen.active').forEach(function (screen) {
        screen.classList.remove('active');
      });
      login.classList.add('active');
      return true;
    }
    return false;
  }


  // Premium responsive Admin workspace. This runs only on the dedicated Admin site.

  function adminSafe(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  async function adminAuditView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Admin audit trail</h3><p>Loading recent activity…</p></div>';
    try{
      var r=await ML_API.admin.auditLogs({page:1,limit:50}),rows=Array.isArray(r.data)?r.data:(r.data&&r.data.items)||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Admin audit trail</h3><button onclick="window.__ML_ADMIN_AUDIT()">Refresh</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">🛡️</div><div class="copy"><b>'+adminSafe(x.action||'Admin action')+'</b><span>'+adminSafe(x.actor_name||x.actor_id||'Administrator')+' · '+adminSafe(x.entity_type||'system')+'</span><small>'+adminSafe(x.created_at?new Date(x.created_at).toLocaleString():'')+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No audit entries</b><span>No administrative activity was returned.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Audit trail unavailable</b><span>'+adminSafe(e.error||e.message||'Could not load audit records.')+'</span></div>';}
  }
  async function adminSettingsView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>System settings</h3><p>Loading protected settings…</p></div>';
    try{
      var r=await ML_API.admin.settings(),rows=Array.isArray(r.data)?r.data:[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>System settings</h3><span>Read-only inspection</span></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){var k=String(x.key||''),secret=/secret|token|password|api.?key|private/i.test(k),v=secret?'•••••••• (protected)':(typeof x.value==='string'?x.value:JSON.stringify(x.value));return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(k)+'</b><span>'+adminSafe(x.category||'general')+' · '+adminSafe(v||'Not set')+'</span></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No settings returned</b><span>The production settings table returned no rows.</span></div>')+
      '<div class="ml-wallet-note" style="margin-top:12px;padding:12px;border-radius:12px">Sensitive values are masked. Provider secrets must remain in backend environment variables.</div></div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Settings unavailable</b><span>'+adminSafe(e.error||e.message||'Your account may require super-admin permission.')+'</span></div>';}
  }
  window.__ML_ADMIN_AUDIT=adminAuditView;
  window.__ML_ADMIN_SETTINGS=adminSettingsView;

  async function adminPromotionsView(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Promotion requests</h3><p>Loading vendor requests…</p></div>';
    try{
      var r=await ML_API.promotions.adminList({page:1,limit:50}),d=r.data,rows=Array.isArray(d)?d:(d&&(d.items||d.requests))||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Promotion requests</h3><button onclick="window.__ML_ADMIN_PROMOTIONS()">Refresh</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">🎫</div><div class="copy"><b>'+adminSafe(x.title||x.business_name||x.vendor_name||'Promotion request')+'</b><span>'+adminSafe(x.status||'pending')+' · '+adminSafe(x.vendor_name||x.business_name||'Vendor')+'</span><small>'+adminSafe(x.placement||'featured_banner')+' · '+adminSafe(x.payment_status||'unpaid')+' · '+adminSafe(x.created_at?new Date(x.created_at).toLocaleString():'')+'</small><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+(x.status==='pending'?'<button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'reviewing\')">Mark reviewing</button>':'')+(x.status==='rejected'||x.status==='cancelled'?'':'<button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'approved\')">Approve</button>')+'<button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_PROMO_REVIEW(\''+adminSafe(x.id)+'\',\'rejected\')">Reject</button></div></div></div>';}).join('')+'</div>':'<div class="ml-empty"><b>No promotion requests</b><span>The live API returned no promotion requests for review.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Promotion requests unavailable</b><span>'+adminSafe(e.error||e.message||'Could not load promotion requests.')+'</span></div>';}
  }
  window.__ML_ADMIN_PROMOTIONS=adminPromotionsView;
  window.__ML_ADMIN_PROMO_REVIEW=async function(id,status){
    var note=window.prompt('Optional admin note for this promotion:','');
    if(note===null)return;
    try{
      await ML_API.promotions.adminReview(id,{status:status,adminNotes:note});
      if(typeof window.toast==='function')window.toast('Promotion request updated.','success');
      await adminPromotionsView();
    }catch(e){if(typeof window.toast==='function')window.toast(e.error||e.message||'Could not update promotion request.','error');}
  };


  async function adminRequest(path,method,body){
    var token=window.ML_API&&typeof ML_API.getAccessToken==='function'?ML_API.getAccessToken():null;
    if(!token)throw new Error('Your Admin session has expired. Sign in again.');
    var base=String(window.ML_API_URL||'https://marketlink-gambia.onrender.com/api/v1').replace(/\/+$/,'');
    if(!/\/api\/v1$/.test(base))base+='/api/v1';
    var response=await fetch(base+path,{method:method||'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    var data={};try{data=await response.json();}catch(_){}
    if(!response.ok||data.success===false)throw new Error(data.error||data.message||('Request failed ('+response.status+').'));
    return data.data;
  }
  function adminFormatDate(value){return value?new Date(value).toLocaleString():'—';}
  async function adminSupportQueue(){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Customer support desk</h3><p>Loading the live support queue…</p></div>';
    try{
      var data=await adminRequest('/admin/support-tickets?page=1&limit=50','GET'),rows=data.items||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>Support desk</h3><button onclick="window.__ML_ADMIN_SUPPORT()">Refresh</button></div><div class="ml-stat-grid"><div class="ml-stat"><div class="ml-stat-label">Open tickets</div><div class="ml-stat-value">'+adminSafe(rows.filter(function(x){return x.status==='open';}).length)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Escalated</div><div class="ml-stat-value">'+adminSafe(rows.filter(function(x){return x.status==='escalated';}).length)+'</div></div><div class="ml-stat"><div class="ml-stat-label">Total matches</div><div class="ml-stat-value">'+adminSafe(data.total||0)+'</div></div></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer" onclick="window.__ML_ADMIN_TICKET(\\''+adminSafe(x.id)+'\\')"><div class="ico">🎧</div><div class="copy"><b>'+adminSafe(x.ticket_number)+' · '+adminSafe(x.subject||x.category)+'</b><span>'+adminSafe(x.requester_name||'Customer')+' · '+adminSafe(x.requester_phone||'')+'</span><small>'+adminSafe(x.status)+' · '+adminSafe(x.priority)+' priority · '+adminSafe(x.reply_count)+' replies · '+adminFormatDate(x.created_at)+'</small></div></button>';}).join('')+'</div>':'<div class="ml-empty"><b>No support tickets found</b><span>New customer, vendor and rider requests will appear here.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Support desk unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminTicketDetail(id){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><p>Loading ticket conversation…</p></div>';
    try{
      var data=await adminRequest('/admin/support-tickets/'+encodeURIComponent(id),'GET'),t=data.ticket,rows=data.replies||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>'+adminSafe(t.ticket_number)+' · Support case</h3><button onclick="window.__ML_ADMIN_SUPPORT()">← Back</button></div><div class="ml-profile-card"><div class="ml-profile-row"><div class="copy"><b>'+adminSafe(t.subject||t.category)+'</b><span>'+adminSafe(t.requester_name)+' · '+adminSafe(t.requester_phone)+' · '+adminSafe(t.requester_email||'')+'</span><small>'+adminSafe(t.status)+' · '+adminSafe(t.priority)+' priority · '+adminFormatDate(t.created_at)+'</small><p>'+adminSafe(t.description)+'</p></div></div></div><div class="ml-section-head"><h3>Conversation</h3></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<div class="ml-profile-row"><div class="ico">💬</div><div class="copy"><b>'+adminSafe(x.sender_name||'User')+'</b><span>'+adminSafe(x.body)+'</span><small>'+adminFormatDate(x.created_at)+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty">No replies yet.</div>')+
      '<div class="ml-profile-card" style="padding:14px;margin-top:12px"><label class="ml-admin-label" for="ml-admin-ticket-reply">Reply to requester</label><textarea id="ml-admin-ticket-reply" class="inp" rows="4" maxlength="4000" placeholder="Write a helpful response…"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><select id="ml-admin-ticket-status" class="inp"><option value="open">Open</option><option value="pending">Pending</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><select id="ml-admin-ticket-priority" class="inp"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_TICKET_SAVE(\\''+adminSafe(t.id)+'\\')">Save case</button><button class="ml-btn ml-btn-secondary" onclick="window.__ML_ADMIN_TICKET_REPLY(\\''+adminSafe(t.id)+'\\')">Send reply</button></div></div></div>';
      var st=document.getElementById('ml-admin-ticket-status'),pr=document.getElementById('ml-admin-ticket-priority');if(st)st.value=t.status;if(pr)pr.value=t.priority;
    }catch(e){root.innerHTML='<div class="ml-empty"><b>Ticket unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminTicketSave(id){
    try{await adminRequest('/admin/support-tickets/'+encodeURIComponent(id),'PATCH',{status:document.getElementById('ml-admin-ticket-status').value,priority:document.getElementById('ml-admin-ticket-priority').value});if(window.toast)window.toast('Support case updated.','success');await adminTicketDetail(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  async function adminTicketReply(id){
    var field=document.getElementById('ml-admin-ticket-reply'),body=String(field&&field.value||'').trim();if(!body){if(window.toast)window.toast('Write a reply first.','error');return;}
    try{await adminRequest('/admin/support-tickets/'+encodeURIComponent(id)+'/replies','POST',{body:body});if(window.toast)window.toast('Reply sent and recorded.','success');await adminTicketDetail(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  async function adminCrmView(search){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><h3>Customer relationship management</h3><p>Loading customer, vendor and rider records…</p></div>';
    try{
      var data=await adminRequest('/admin/users?page=1&limit=50'+(search?'&search='+encodeURIComponent(search):''),'GET'),rows=data.items||[];
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>CRM · People directory</h3><button onclick="window.__ML_ADMIN_CRM()">Refresh</button></div><div style="display:flex;gap:8px;margin:12px 0"><input id="ml-admin-crm-search" class="inp" placeholder="Search name, phone or email" value="'+adminSafe(search||'')+'"><button class="ml-btn ml-btn-primary" onclick="window.__ML_ADMIN_CRM(document.getElementById(\\'ml-admin-crm-search\\').value)">Search</button></div>'+
      (rows.length?'<div class="ml-profile-card">'+rows.map(function(x){return '<button type="button" class="ml-profile-row" style="width:100%;text-align:left;border:0;background:transparent;cursor:pointer" onclick="window.__ML_ADMIN_CRM_PROFILE(\\''+adminSafe(x.id)+'\\')"><div class="ico">♙</div><div class="copy"><b>'+adminSafe(x.full_name||'MarketLink user')+'</b><span>'+adminSafe(x.phone)+' · '+adminSafe((x.roles||[]).join(', '))+'</span><small>'+adminSafe(x.status)+' · Joined '+adminFormatDate(x.created_at)+'</small></div></button>';}).join('')+'</div>':'<div class="ml-empty"><b>No matching profiles</b><span>Try another name, phone number or email.</span></div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>CRM unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminCrmProfile(id){
    var root=document.getElementById('adash-body');if(!root)return;
    root.innerHTML='<div class="ml-premium-home"><p>Loading CRM profile…</p></div>';
    try{
      var d=await adminRequest('/admin/users/'+encodeURIComponent(id)+'/profile','GET'),u=d.user;
      root.innerHTML='<div class="ml-premium-home"><div class="ml-section-head"><h3>CRM profile</h3><button onclick="window.__ML_ADMIN_CRM()">← Directory</button></div><div class="ml-profile-card"><div class="ml-profile-row"><div class="ico">♙</div><div class="copy"><b>'+adminSafe(u.full_name)+'</b><span>'+adminSafe(u.phone)+' · '+adminSafe(u.email||'No email')+'</span><small>'+adminSafe((u.roles||[]).join(', '))+' · '+adminSafe(u.status)+'</small><small>Orders: '+adminSafe(u.orders_count)+' · Support tickets: '+adminSafe(u.support_tickets)+'</small></div></div></div><div class="ml-section-head"><h3>Internal CRM notes</h3></div><div class="ml-profile-card" style="padding:14px"><textarea id="ml-admin-crm-note" class="inp" rows="3" maxlength="4000" placeholder="Add a private note for authorised MarketLink staff…"></textarea><button class="ml-btn ml-btn-primary" style="margin-top:8px" onclick="window.__ML_ADMIN_CRM_NOTE(\\''+adminSafe(u.id)+'\\')">Save private note</button></div>'+
      ((d.notes||[]).length?'<div class="ml-profile-card">'+d.notes.map(function(n){return '<div class="ml-profile-row"><div class="copy"><b>'+adminSafe(n.author_name||'Admin')+'</b><span>'+adminSafe(n.note)+'</span><small>'+adminFormatDate(n.created_at)+'</small></div></div>';}).join('')+'</div>':'<div class="ml-empty">No internal notes recorded.</div>')+'</div>';
    }catch(e){root.innerHTML='<div class="ml-empty"><b>CRM profile unavailable</b><span>'+adminSafe(e.message)+'</span></div>';}
  }
  async function adminCrmAddNote(id){
    var field=document.getElementById('ml-admin-crm-note'),note=String(field&&field.value||'').trim();if(!note){if(window.toast)window.toast('Enter a note first.','error');return;}
    try{await adminRequest('/admin/users/'+encodeURIComponent(id)+'/notes','POST',{note:note});if(window.toast)window.toast('Private CRM note saved.','success');await adminCrmProfile(id);}
    catch(e){if(window.toast)window.toast(e.message,'error');}
  }
  window.__ML_ADMIN_SUPPORT=adminSupportQueue;
  window.__ML_ADMIN_TICKET=adminTicketDetail;
  window.__ML_ADMIN_TICKET_SAVE=adminTicketSave;
  window.__ML_ADMIN_TICKET_REPLY=adminTicketReply;
  window.__ML_ADMIN_CRM=adminCrmView;
  window.__ML_ADMIN_CRM_PROFILE=adminCrmProfile;
  window.__ML_ADMIN_CRM_NOTE=adminCrmAddNote;

  function adminNavigate(key) {
    var api = window.ML_Premium || {};
    var routes = {
      overview: function () { if (api.adminRefresh) api.adminRefresh(); },
      audit: adminAuditView,
      support: adminSupportQueue,
      crm: adminCrmView,
      settings: adminSettingsView,
      vendors: function () { if (api.adminApprovals) api.adminApprovals('vendor'); },
      riders: function () { if (api.adminApprovals) api.adminApprovals('rider'); },
      promotions: adminPromotionsView,
      analytics: function () { if (api.refreshAdminAnalytics) api.refreshAdminAnalytics(); },
      revenue: function () { if (api.refreshAdminRevenue) api.refreshAdminRevenue(); },
      payouts: function () { if (api.refreshAdminPayouts) api.refreshAdminPayouts(); },
      reconciliation: function () { if (api.refreshFinancialReconciliation) api.refreshFinancialReconciliation(); },
      ledger: function () { if (api.refreshAdminTransactions) api.refreshAdminTransactions(1); },
      exceptions: function () { if (api.refreshAdminFailedPayments) api.refreshAdminFailedPayments(1); },
      users: function () { if (api.adminUsers) api.adminUsers(); },
      ai: function () { if (typeof window.adminGoTo === 'function') window.adminGoTo('ai'); }
    };
    if (routes[key]) routes[key]();
    document.querySelectorAll('[data-ml-admin-route]').forEach(function (el) {
      var active = el.getAttribute('data-ml-admin-route') === key;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-current', active ? 'page' : 'false');
    });
    var drawer = document.getElementById('ml-admin-drawer');
    if (drawer) drawer.classList.remove('is-open');
  }

  function ensureAdminWorkspace() {
    var tab = document.getElementById('tab-admindash');
    var body = document.getElementById('adash-body');
    if (!tab || !body || tab.getAttribute('data-ml-admin-workspace') === '1') return;
    tab.setAttribute('data-ml-admin-workspace', '1');
    tab.style.cssText = 'height:auto;min-height:100vh;overflow:visible;background:#f3f6fa;';
    var shell = document.createElement('div');
    shell.id = 'ml-admin-workspace';
    shell.innerHTML =
      '<aside class="ml-admin-sidebar"><div class="ml-admin-side-brand"><img src="./assets/marketlink-logo.png" alt="MarketLink"><div><b>MARKETLINK</b><span>ADMINISTRATION</span></div></div>' +
      '<div class="ml-admin-side-label">WORKSPACE</div>' +
      '<nav class="ml-admin-nav" aria-label="Admin navigation">' +
      '<button data-ml-admin-route="overview" class="is-active"><span>⌂</span>Overview</button>' +
      '<button data-ml-admin-route="vendors"><span>▣</span>Vendor approvals</button>' +
      '<button data-ml-admin-route="riders"><span>♧</span>Rider approvals</button>' +
      '<button data-ml-admin-route="promotions"><span>✦</span>Promotions</button>' +
      '<div class="ml-admin-side-label">INSIGHTS & FINANCE</div>' +
      '<button data-ml-admin-route="analytics"><span>▥</span>Analytics</button>' +
      '<button data-ml-admin-route="revenue"><span>↗</span>Revenue reports</button>' +
      '<button data-ml-admin-route="payouts"><span>⇄</span>Withdrawals</button>' +
      '<button data-ml-admin-route="reconciliation"><span>◎</span>Reconciliation</button>' +
      '<button data-ml-admin-route="ledger"><span>≡</span>DAHA ledger</button>' +
      '<button data-ml-admin-route="exceptions"><span>⚠</span>Payment exceptions</button>' +
      '<div class="ml-admin-side-label">MANAGEMENT</div>' +
      '<button data-ml-admin-route="audit"><span>◷</span>Audit trail</button>' +
      '<button data-ml-admin-route="support"><span>🎧</span>Support desk</button>' +
      '<button data-ml-admin-route="crm"><span>♙</span>CRM directory</button>' +
      '<button data-ml-admin-route="settings"><span>⚙</span>System settings</button>' +
      '<button data-ml-admin-route="promotions"><span>✦</span>Promotion requests</button>' +
      '<button data-ml-admin-route="users"><span>♙</span>Users & CRM</button>' +
      '<button data-ml-admin-route="ai"><span>✧</span>AI operations</button>' +
      '</nav><div class="ml-admin-side-foot"><span class="ml-admin-secure-dot"></span> Protected operations<br><small>Powered by Royal FinTech</small></div></aside>' +
      '<div class="ml-admin-main"><header class="ml-admin-topbar"><button id="ml-admin-menu" class="ml-admin-menu" aria-label="Open navigation">☰</button><div class="ml-admin-crumb"><span>MarketLink</span><b>/ Admin workspace</b></div><div class="ml-admin-top-actions"><span class="ml-admin-live"><i></i> Production</span><button class="ml-admin-refresh" id="ml-admin-refresh">↻ <span>Refresh</span></button><button class="ml-admin-signout" id="ml-admin-signout">Sign out</button></div></header>' +
      '<div class="ml-admin-pagehead"><div><div class="ml-admin-overline">ROYAL FINTECH · OPERATIONS</div><h1>Administration</h1><p>Monitor and manage the MarketLink marketplace.</p></div><div class="ml-admin-date" id="ml-admin-date"></div></div>' +
      '<main class="ml-admin-content" id="ml-admin-content"></main></div>' +
      '<div class="ml-admin-mobilebar"><button data-ml-admin-route="overview" class="is-active"><b>⌂</b><span>Home</span></button><button data-ml-admin-route="vendors"><b>▣</b><span>Vendors</span></button><button data-ml-admin-route="analytics"><b>▥</b><span>Insights</span></button><button data-ml-admin-route="payouts"><b>⇄</b><span>Finance</span></button><button id="ml-admin-more"><b>☰</b><span>More</span></button></div>' +
      '<div id="ml-admin-drawer" class="ml-admin-drawer"><div class="ml-admin-drawer-head"><b>Admin navigation</b><button id="ml-admin-drawer-close" aria-label="Close navigation">×</button></div><div class="ml-admin-drawer-links"></div></div>';
    tab.insertBefore(shell, body);
    document.getElementById('ml-admin-content').appendChild(body);
    body.style.cssText = 'height:auto;min-height:55vh;overflow:visible;';
    var nav = shell.querySelector('.ml-admin-nav');
    var drawerLinks = shell.querySelector('.ml-admin-drawer-links');
    drawerLinks.innerHTML = nav.innerHTML;
    shell.addEventListener('click', function (event) {
      var route = event.target.closest('[data-ml-admin-route]');
      if (route) { adminNavigate(route.getAttribute('data-ml-admin-route')); return; }
      if (event.target.closest('#ml-admin-menu') || event.target.closest('#ml-admin-more')) {
        document.getElementById('ml-admin-drawer').classList.add('is-open');
      }
      if (event.target.closest('#ml-admin-drawer-close')) {
        document.getElementById('ml-admin-drawer').classList.remove('is-open');
      }
      if (event.target.closest('#ml-admin-refresh')) {
        var refreshButton = document.getElementById('ml-admin-refresh');
        if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = 'Refreshing…'; }
        adminNavigate('overview');
        window.setTimeout(function () {
          var current = document.getElementById('ml-admin-refresh');
          if (current) { current.disabled = false; current.innerHTML = '↻ <span>Refresh</span>'; }
        }, 900);
      }
      if (event.target.closest('#ml-admin-signout') && typeof window.adminLogout === 'function') window.adminLogout();
    });
    var date = document.getElementById('ml-admin-date');
    if (date) date.textContent = new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date());
    adminNavigate('overview');
  }

  function installAdminWorkspaceStyles() {
    if (document.getElementById('ml-admin-workspace-style')) return;
    var css = document.createElement('style');
    css.id = 'ml-admin-workspace-style';
    css.textContent = [
      '#scr-app:has(#ml-admin-workspace){background:#f3f6fa!important;color:#14283a!important;min-height:100vh}',
      '#ml-admin-workspace{--ink:#14283a;--muted:#718397;--line:#e2e9f0;--gold:#d6a43b;--teal:#147b78;display:grid;grid-template-columns:252px minmax(0,1fr);min-height:100vh;background:#f3f6fa;color:var(--ink);font-family:Inter,system-ui,-apple-system,sans-serif}',
      '.ml-admin-sidebar{position:sticky;top:0;height:100vh;overflow:auto;background:#102638;color:#eaf1f5;padding:24px 16px;box-sizing:border-box;display:flex;flex-direction:column;z-index:20}',
      '.ml-admin-side-brand{display:flex;align-items:center;gap:11px;padding:4px 8px 26px;border-bottom:1px solid rgba(255,255,255,.1)}.ml-admin-side-brand img{width:45px;height:45px;object-fit:contain}.ml-admin-side-brand b{display:block;font-size:14px;letter-spacing:.12em}.ml-admin-side-brand span{display:block;color:#8fa8b8;font-size:9px;letter-spacing:.16em;margin-top:4px}',
      '.ml-admin-side-label{padding:22px 10px 8px;color:#7793a5;font-size:9px;font-weight:800;letter-spacing:.16em}.ml-admin-nav{display:grid;gap:4px}.ml-admin-nav button,.ml-admin-drawer-links button{border:0;background:transparent;color:#c0cfda;border-radius:10px;padding:11px 12px;text-align:left;font-size:12px;font-weight:650;display:flex;align-items:center;gap:12px;cursor:pointer}.ml-admin-nav button span,.ml-admin-drawer-links button span{width:20px;color:#e1b75b;font-size:17px;text-align:center}.ml-admin-nav button:hover,.ml-admin-nav button.is-active,.ml-admin-drawer-links button.is-active{background:rgba(255,255,255,.1);color:#fff}.ml-admin-side-foot{margin-top:auto;padding:18px 10px 4px;border-top:1px solid rgba(255,255,255,.1);font-size:10px;color:#a9bfcd;line-height:1.8}.ml-admin-side-foot small{color:#7995a7}.ml-admin-secure-dot{display:inline-block;width:7px;height:7px;background:#2ac58c;border-radius:50%;margin-right:6px}',
      '.ml-admin-main{min-width:0}.ml-admin-topbar{height:70px;display:flex;align-items:center;gap:18px;padding:0 34px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}.ml-admin-crumb{font-size:12px;color:#91a0af;flex:1}.ml-admin-crumb b{color:#344c60;margin-left:7px}.ml-admin-top-actions{display:flex;align-items:center;gap:14px}.ml-admin-live{font-size:10px;color:#16836e;font-weight:800}.ml-admin-live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#21b77b;margin-right:6px}.ml-admin-refresh,.ml-admin-signout{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 13px;color:#284255;font-size:11px;font-weight:750}.ml-admin-signout{background:#fff8ec;border-color:#f1dfbd;color:#88601b}.ml-admin-menu{display:none}',
      '.ml-admin-pagehead{display:flex;align-items:flex-end;justify-content:space-between;padding:30px 36px 20px}.ml-admin-overline{font-size:9px;letter-spacing:.18em;color:#16817b;font-weight:850}.ml-admin-pagehead h1{font-size:27px;letter-spacing:-.04em;margin:7px 0;color:#14283a}.ml-admin-pagehead p{margin:0;color:#788b9b;font-size:12px}.ml-admin-date{font-size:11px;color:#718397}.ml-admin-content{padding:0 36px 42px;min-width:0}.ml-admin-content .ml-premium-home{max-width:none!important;padding:0!important}.ml-admin-content .ml-home-top{background:linear-gradient(120deg,#102d42,#145c62)!important;border-radius:18px!important;padding:26px!important;margin-bottom:18px!important}.ml-admin-content .ml-hero-title{font-size:25px!important}.ml-admin-content .ml-hero-sub{max-width:620px}.ml-admin-content .ml-live-dot{color:#a7f0d3}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important}.ml-admin-content .ml-stat,.ml-admin-content .ml-promo,.ml-admin-content .ml-profile-card{border:1px solid #e0e8ef!important;border-radius:16px!important;box-shadow:0 5px 20px rgba(28,57,78,.045)!important}.ml-admin-content .ml-stat{background:#fff!important;padding:19px!important}.ml-admin-content .ml-stat-label{color:#718397!important}.ml-admin-content .ml-stat-value{color:#14283a!important;font-size:25px!important}.ml-admin-content .ml-promo{background:#fff!important;color:#14283a!important;padding:18px!important}.ml-admin-content .ml-promo strong{color:#14283a!important}.ml-admin-content .ml-promo span{color:#718397!important}.ml-admin-content .ml-section-head{margin-top:22px!important}.ml-admin-content .ml-section-head h3{color:#193449!important}.ml-admin-content .ml-profile-row{border-bottom-color:#edf1f5!important}.ml-admin-content .ml-profile-row .copy b{color:#203b50!important}.ml-admin-content .ml-profile-row .copy span,.ml-admin-content .ml-profile-row .copy small{color:#718397!important}.ml-admin-content .ml-wallet-note{background:#fff!important;border:1px solid #e5ebf1!important;color:#607488!important}.ml-admin-content .ml-empty{background:#fff!important;border:1px dashed #dce5ec!important;color:#617487!important}.ml-admin-content .ml-empty b{color:#243e52!important}',
      '.ml-admin-mobilebar,.ml-admin-drawer{display:none}',
      '@media(max-width:1050px){#ml-admin-workspace{grid-template-columns:218px minmax(0,1fr)}.ml-admin-content{padding:0 22px 36px}.ml-admin-pagehead{padding:25px 22px 18px}.ml-admin-topbar{padding:0 22px}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}',
      '@media(max-width:720px){#ml-admin-workspace{display:block;padding-bottom:76px}.ml-admin-sidebar{display:none}.ml-admin-topbar{height:58px;padding:0 14px;gap:10px}.ml-admin-menu{display:inline-flex;border:1px solid #e2e9f0;background:#fff;border-radius:9px;width:38px;height:36px;align-items:center;justify-content:center;color:#17364b;font-size:17px}.ml-admin-crumb{font-size:10px}.ml-admin-top-actions{gap:7px}.ml-admin-live{font-size:9px}.ml-admin-refresh,.ml-admin-signout{padding:8px 9px;font-size:10px}.ml-admin-refresh span{display:none}.ml-admin-pagehead{padding:20px 16px 15px;align-items:flex-start}.ml-admin-pagehead h1{font-size:23px}.ml-admin-date{font-size:9px}.ml-admin-content{padding:0 14px 28px}.ml-admin-content .ml-home-top{padding:20px!important;display:block!important}.ml-admin-content .ml-hero-title{font-size:23px!important;max-width:260px}.ml-admin-content .ml-hero-sub{font-size:12px!important;line-height:1.55}.ml-admin-content .ml-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}.ml-admin-content .ml-stat{padding:15px!important;min-width:0}.ml-admin-content .ml-stat-value{font-size:22px!important}.ml-admin-content .ml-promo-strip{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}.ml-admin-content .ml-section-head{gap:10px;align-items:center}.ml-admin-content .ml-section-head h3{font-size:14px}.ml-admin-mobilebar{position:fixed;display:grid;grid-template-columns:repeat(5,1fr);left:0;right:0;bottom:0;z-index:30;background:rgba(255,255,255,.97);border-top:1px solid #dfe7ed;padding:7px 5px calc(7px + env(safe-area-inset-bottom));box-shadow:0 -5px 20px rgba(22,46,64,.08)}.ml-admin-mobilebar button{border:0;background:transparent;color:#738597;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:9px;font-weight:700}.ml-admin-mobilebar button b{font-size:18px;font-weight:500}.ml-admin-mobilebar button.is-active{color:#147b78}.ml-admin-drawer{display:block;position:fixed;inset:0;z-index:60;background:rgba(7,20,31,.45);pointer-events:none;opacity:0;transition:opacity .2s}.ml-admin-drawer.is-open{opacity:1;pointer-events:auto}.ml-admin-drawer-links{position:absolute;left:0;top:0;bottom:0;width:min(82vw,330px);overflow:auto;background:#102638;padding:18px 14px 30px;transform:translateX(-102%);transition:transform .22s}.ml-admin-drawer.is-open .ml-admin-drawer-links{transform:translateX(0)}.ml-admin-drawer-head{position:absolute;left:0;top:0;width:min(82vw,330px);height:58px;box-sizing:border-box;background:#102638;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:0 17px;z-index:1}.ml-admin-drawer-head button{border:0;background:transparent;color:#fff;font-size:26px}.ml-admin-drawer-links{padding-top:68px}.ml-admin-drawer-links .ml-admin-side-label{display:none}}',
      '@media(prefers-color-scheme:dark){#ml-admin-workspace{background:#0b1722;color:#eaf2f7}#ml-admin-workspace .ml-admin-main{background:#0b1722}#ml-admin-workspace .ml-admin-topbar{background:#102232;border-color:#263d4d}#ml-admin-workspace .ml-admin-crumb,#ml-admin-workspace .ml-admin-date{color:#9aafbd}#ml-admin-workspace .ml-admin-crumb b,#ml-admin-workspace .ml-admin-pagehead h1{color:#f0f5f8}#ml-admin-workspace .ml-admin-pagehead p{color:#a1b4c1}#ml-admin-workspace .ml-admin-refresh,#ml-admin-workspace .ml-admin-menu{background:#172b3a;border-color:#30495b;color:#edf4f7}#ml-admin-workspace .ml-admin-signout{background:#342d20;border-color:#65512c;color:#f3d28b}#ml-admin-workspace .ml-admin-content .ml-stat,#ml-admin-workspace .ml-admin-content .ml-promo,#ml-admin-workspace .ml-admin-content .ml-profile-card,#ml-admin-workspace .ml-admin-content .ml-wallet-note,#ml-admin-workspace .ml-admin-content .ml-empty{background:#122433!important;border-color:#2b4354!important;color:#c4d2dc!important}#ml-admin-workspace .ml-admin-content .ml-stat-label,#ml-admin-workspace .ml-admin-content .ml-promo span,#ml-admin-workspace .ml-admin-content .ml-profile-row .copy span,#ml-admin-workspace .ml-admin-content .ml-profile-row .copy small{color:#a0b2bf!important}#ml-admin-workspace .ml-admin-content .ml-stat-value,#ml-admin-workspace .ml-admin-content .ml-promo strong,#ml-admin-workspace .ml-admin-content .ml-section-head h3,#ml-admin-workspace .ml-admin-content .ml-profile-row .copy b{color:#edf4f8!important}#ml-admin-workspace .ml-admin-mobilebar{background:rgba(15,32,46,.98);border-color:#2b4354}#ml-admin-workspace .ml-admin-mobilebar button{color:#9db0bd}#ml-admin-workspace .ml-admin-mobilebar button.is-active{color:#63d0c2}}',
      '@media(prefers-reduced-motion:reduce){#ml-admin-workspace *{transition:none!important;scroll-behavior:auto!important}}'
    ].join('');
    document.head.appendChild(css);
  }

  function installAdminGuards() {
    installAdminWorkspaceStyles();
    if (document.getElementById('scr-app') && document.getElementById('scr-app').classList.contains('active')) ensureAdminWorkspace();
    buildAdminLogin();
    normalizeAdminAuthResponse();
    window.goOnboard = openAdmin;
    window.goAuth = openAdmin;
    window.__mlRouteAfterSplash = openAdmin;
    window.mlForgetRememberedDevice = openAdmin;

    if (typeof window.showScreen === 'function' && !window.__ML_ADMIN_SHOWSCREEN_GUARD) {
      var originalShowScreen = window.showScreen;
      window.showScreen = function (id) {
        if (id === 'scr-onboard' || id === 'scr-auth' ||
            id === 'scr-splash' || id === 'scr-returning') return openAdmin();
        var result = originalShowScreen.apply(this, arguments);
        if (id === 'scr-app') {
          window.setTimeout(function () { installAdminWorkspaceStyles(); ensureAdminWorkspace(); }, 0);
        }
        return result;
      };
      window.__ML_ADMIN_SHOWSCREEN_GUARD = true;
    }

    if (!window.__ML_ADMIN_SCREEN_OBSERVER && window.MutationObserver) {
      var observer = new MutationObserver(function () {
        var appScreen = document.getElementById('scr-app');
        if (appScreen && appScreen.classList.contains('active')) {
          installAdminWorkspaceStyles();
          ensureAdminWorkspace();
        }
        var customerScreen = document.querySelector(
          '#scr-splash.active,#scr-onboard.active,#scr-auth.active,#scr-returning.active'
        );
        if (!customerScreen) return;
        customerScreen.classList.remove('active');
        openAdmin();
      });
      observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
      window.__ML_ADMIN_SCREEN_OBSERVER = observer;
    }

    var app = document.getElementById('scr-app');
    var login = document.getElementById('scr-admin-login');
    if (app && app.classList.contains('active')) return;
    if (login && !login.classList.contains('active')) openAdmin();
  }

  function enablePinAutofillAndSubmit() {
    var pin = document.getElementById('admin-password');
    if (!pin || pin.dataset.mlAutoSubmit === '1') return;
    pin.dataset.mlAutoSubmit = '1';
    var busy = false;
    function maybeSubmit() {
      var value = String(pin.value || '');
      if (busy || !/^\d{4}$/.test(value)) return;
      busy = true;
      Promise.resolve().then(function () {
        if (typeof window.doAdminLogin === 'function') window.doAdminLogin();
        window.setTimeout(function () {
          var button = document.getElementById('admin-lbtn');
          if (button && !button.disabled) busy = false;
          else window.setTimeout(function () { busy = false; }, 12000);
        }, 1200);
      });
    }
    pin.addEventListener('input', maybeSubmit);
    pin.addEventListener('change', maybeSubmit);
    window.setTimeout(maybeSubmit, 500);
  }

  installAdminGuards();
  normalizeAdminAuthResponse();
  enablePinAutofillAndSubmit();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 50);
      window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 250);
    }, { once: true });
  } else {
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 50);
    window.setTimeout(function () { installAdminGuards(); enablePinAutofillAndSubmit(); }, 250);
  }
})();
