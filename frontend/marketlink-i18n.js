(function(){
  'use strict';
  var STORAGE_KEY='ml_language';
  var languages=[
    {code:'en',label:'English'},{code:'wo',label:'Wolof'},{code:'mnk',label:'Mandinka'},{code:'ff',label:'Fula / Pulaar'},
    {code:'dyo',label:'Jola'},{code:'srr',label:'Serer'},{code:'snk',label:'Soninke'},{code:'fr',label:'Français (French)'},
    {code:'es',label:'Español (Spanish)'},{code:'pt',label:'Português (Portuguese)'},{code:'de',label:'Deutsch (German)'},
    {code:'it',label:'Italiano (Italian)'},{code:'ar',label:'العربية (Arabic)'},{code:'zh-Hans',label:'简体中文 (Simplified Chinese)'},
    {code:'ja',label:'日本語 (Japanese)'},{code:'ko',label:'한국어 (Korean)'},{code:'tl',label:'Filipino / Tagalog'},
    {code:'hi',label:'हिन्दी (Hindi)'},{code:'ur',label:'اردو (Urdu)'},{code:'ha',label:'Hausa'},
    {code:'yo',label:'Yorùbá (Yoruba)'},{code:'ig',label:'Igbo'},{code:'ru',label:'Русский (Russian)'},
    {code:'tr',label:'Türkçe (Turkish)'},{code:'nl',label:'Nederlands (Dutch)'},{code:'sv',label:'Svenska (Swedish)'}
  ];
  var dictionaries={
    fr:{
      'Home':'Accueil','Categories':'Catégories','Orders':'Commandes','Cart':'Panier','Alerts':'Alertes','Profile':'Profil','Search':'Rechercher',
      'Search marketplace':'Rechercher sur le marché','Your MarketLink account':'Votre compte MarketLink','Full name':'Nom complet','Display name':'Nom affiché',
      'Date of birth':'Date de naissance','Gender':'Genre','About you':'À propos de vous','Not added yet':'Pas encore renseigné',
      'Edit profile':'Modifier le profil','Save changes':'Enregistrer les modifications','Cancel':'Annuler','Change photo':'Changer la photo','Remove':'Supprimer',
      'Order history':'Historique des commandes','Saved addresses':'Adresses enregistrées','Sign out':'Se déconnecter','Help Centre':'Centre d’aide',
      'Call MarketLink support':'Appeler l’assistance MarketLink','WhatsApp support':'Assistance WhatsApp','Email support':'Assistance par e-mail',
      'Frequently asked questions':'Questions fréquentes','Language preference':'Préférence linguistique','Use MarketLink in your preferred language':'Utilisez MarketLink dans votre langue préférée',
      'App language':'Langue de l’application','MarketLink AI':'MarketLink AI','Open MarketLink AI chat →':'Ouvrir la discussion MarketLink AI →',
      'Order tracking':'Suivi de commande','CURRENT ORDER STATUS':'STATUT ACTUEL DE LA COMMANDE','Delivery details':'Détails de livraison','Order summary':'Récapitulatif de la commande',
      'Order received':'Commande reçue','Vendor confirmed':'Commande confirmée par le vendeur','Preparing your order':'Préparation de votre commande',
      'Rider assigned':'Livreur attribué','Picked up':'Récupérée','On the way':'En route','Delivered':'Livrée','Cancelled':'Annulée','Failed':'Échec',
      'Payment confirmed':'Paiement confirmé','Payment not completed':'Paiement non effectué','Complete your payment':'Finalisez votre paiement',
      'Pay on Delivery':'Paiement à la livraison','Mobile-money number':'Numéro de mobile money','Email support':'Assistance par e-mail',
      'JPG or PNG · at least 512 × 512 px · maximum 5 MB':'JPG ou PNG · au moins 512 × 512 px · maximum 5 Mo'
    },
    es:{
      'Home':'Inicio','Categories':'Categorías','Orders':'Pedidos','Cart':'Carrito','Alerts':'Avisos','Profile':'Perfil','Search':'Buscar',
      'Search marketplace':'Buscar en el mercado','Your MarketLink account':'Tu cuenta de MarketLink','Full name':'Nombre completo','Display name':'Nombre para mostrar',
      'Date of birth':'Fecha de nacimiento','Gender':'Género','About you':'Sobre ti','Not added yet':'Aún no se ha añadido',
      'Edit profile':'Editar perfil','Save changes':'Guardar cambios','Cancel':'Cancelar','Change photo':'Cambiar foto','Remove':'Quitar',
      'Order history':'Historial de pedidos','Saved addresses':'Direcciones guardadas','Sign out':'Cerrar sesión','Help Centre':'Centro de ayuda',
      'Call MarketLink support':'Llamar al soporte de MarketLink','WhatsApp support':'Soporte por WhatsApp','Email support':'Soporte por correo electrónico',
      'Frequently asked questions':'Preguntas frecuentes','Language preference':'Preferencia de idioma','Use MarketLink in your preferred language':'Usa MarketLink en tu idioma preferido',
      'App language':'Idioma de la aplicación','Open MarketLink AI chat →':'Abrir chat de MarketLink AI →','Order tracking':'Seguimiento del pedido',
      'CURRENT ORDER STATUS':'ESTADO ACTUAL DEL PEDIDO','Delivery details':'Detalles de entrega','Order summary':'Resumen del pedido',
      'Order received':'Pedido recibido','Vendor confirmed':'Vendedor confirmó el pedido','Preparing your order':'Preparando tu pedido',
      'Rider assigned':'Repartidor asignado','Picked up':'Recogido','On the way':'En camino','Delivered':'Entregado','Cancelled':'Cancelado','Failed':'Fallido',
      'Payment confirmed':'Pago confirmado','Payment not completed':'Pago no completado','Complete your payment':'Completa tu pago',
      'Pay on Delivery':'Pagar al recibir','Mobile-money number':'Número de dinero móvil',
      'JPG or PNG · at least 512 × 512 px · maximum 5 MB':'JPG o PNG · mínimo 512 × 512 px · máximo 5 MB'
    },
    de:{
      'Home':'Startseite','Categories':'Kategorien','Orders':'Bestellungen','Cart':'Warenkorb','Alerts':'Mitteilungen','Profile':'Profil','Search':'Suchen',
      'Search marketplace':'Marktplatz durchsuchen','Your MarketLink account':'Dein MarketLink-Konto','Full name':'Vollständiger Name','Display name':'Anzeigename',
      'Date of birth':'Geburtsdatum','Gender':'Geschlecht','About you':'Über dich','Not added yet':'Noch nicht hinzugefügt',
      'Edit profile':'Profil bearbeiten','Save changes':'Änderungen speichern','Cancel':'Abbrechen','Change photo':'Foto ändern','Remove':'Entfernen',
      'Order history':'Bestellverlauf','Saved addresses':'Gespeicherte Adressen','Sign out':'Abmelden','Help Centre':'Hilfezentrum',
      'Call MarketLink support':'MarketLink-Support anrufen','WhatsApp support':'WhatsApp-Support','Email support':'E-Mail-Support',
      'Frequently asked questions':'Häufig gestellte Fragen','Language preference':'Spracheinstellung','Use MarketLink in your preferred language':'MarketLink in deiner bevorzugten Sprache verwenden',
      'App language':'App-Sprache','Open MarketLink AI chat →':'MarketLink-AI-Chat öffnen →','Order tracking':'Bestellverfolgung',
      'CURRENT ORDER STATUS':'AKTUELLER BESTELLSTATUS','Delivery details':'Lieferdetails','Order summary':'Bestellübersicht',
      'Order received':'Bestellung eingegangen','Vendor confirmed':'Vom Anbieter bestätigt','Preparing your order':'Bestellung wird vorbereitet',
      'Rider assigned':'Fahrer zugewiesen','Picked up':'Abgeholt','On the way':'Unterwegs','Delivered':'Zugestellt','Cancelled':'Storniert','Failed':'Fehlgeschlagen',
      'Payment confirmed':'Zahlung bestätigt','Payment not completed':'Zahlung nicht abgeschlossen','Complete your payment':'Zahlung abschließen',
      'Pay on Delivery':'Zahlung bei Lieferung','Mobile-money number':'Mobile-Money-Nummer',
      'JPG or PNG · at least 512 × 512 px · maximum 5 MB':'JPG oder PNG · mindestens 512 × 512 px · maximal 5 MB'
    },
    pt:{
      'Home':'Início','Categories':'Categorias','Orders':'Pedidos','Cart':'Carrinho','Alerts':'Alertas','Profile':'Perfil','Search':'Pesquisar',
      'Search marketplace':'Pesquisar no mercado','Your MarketLink account':'A sua conta MarketLink','Full name':'Nome completo','Display name':'Nome de exibição',
      'Date of birth':'Data de nascimento','Gender':'Género','About you':'Sobre si','Not added yet':'Ainda não adicionado',
      'Edit profile':'Editar perfil','Save changes':'Guardar alterações','Cancel':'Cancelar','Change photo':'Alterar fotografia','Remove':'Remover',
      'Order history':'Histórico de pedidos','Saved addresses':'Moradas guardadas','Sign out':'Terminar sessão','Help Centre':'Centro de ajuda',
      'Call MarketLink support':'Ligar para o apoio MarketLink','WhatsApp support':'Apoio por WhatsApp','Email support':'Apoio por e-mail',
      'Frequently asked questions':'Perguntas frequentes','Language preference':'Preferência de idioma','Use MarketLink in your preferred language':'Utilize o MarketLink no seu idioma preferido',
      'App language':'Idioma da aplicação','Open MarketLink AI chat →':'Abrir conversa do MarketLink AI →','Order tracking':'Acompanhamento do pedido',
      'CURRENT ORDER STATUS':'ESTADO ATUAL DO PEDIDO','Delivery details':'Detalhes da entrega','Order summary':'Resumo do pedido',
      'Order received':'Pedido recebido','Vendor confirmed':'Confirmado pelo vendedor','Preparing your order':'A preparar o pedido',
      'Rider assigned':'Estafeta atribuído','Picked up':'Recolhido','On the way':'A caminho','Delivered':'Entregue','Cancelled':'Cancelado','Failed':'Falhou',
      'Payment confirmed':'Pagamento confirmado','Payment not completed':'Pagamento não concluído','Complete your payment':'Conclua o pagamento',
      'Pay on Delivery':'Pagar na entrega','Mobile-money number':'Número de mobile money'
    },
    wo:{
      'Home':'Kër','Categories':'Xeet yi','Orders':'Commandes','Cart':'Panier','Alerts':'Yëgle yi','Profile':'Sama profil','Search':'Seet',
      'Your MarketLink account':'Sa koont MarketLink','Full name':'Tur gu mat','Display name':'Tur bu ñuy la wooye','Date of birth':'Bésu juddu',
      'Gender':'Jëmmalin','About you':'Ci yaw','Not added yet':'Dencagul','Edit profile':'Soppi sama profil','Save changes':'Denc soppi yi',
      'Cancel':'Neenal','Change photo':'Soppi nataal','Remove':'Màbb','Order history':'Jaar-jaaru commandes','Saved addresses':'Adrees yi ñu denc',
      'Sign out':'Génn','Help Centre':'Ndimbal','Call MarketLink support':'Woote ndimbal MarketLink','WhatsApp support':'Ndimbal WhatsApp',
      'Email support':'Email ndimbal','Frequently asked questions':'Laaj yi ñuy faral di laaj','Language preference':'Tànn làkk',
      'App language':'Làkku aplikasiyoŋ','Order tracking':'Toppatoo commande','Delivery details':'Leeral ci yóbbu','Order summary':'Mbirum commande',
      'Delivered':'Yóbbu nañu ko','Cancelled':'Neenal nañu ko'
    },
    'zh-Hans':{
      'Home':'首页','Categories':'分类','Orders':'订单','Cart':'购物车','Alerts':'提醒','Profile':'个人资料','Search':'搜索',
      'Search marketplace':'搜索本地市场','Your MarketLink account':'你的 MarketLink 账户','Full name':'姓名','Display name':'显示名称',
      'Date of birth':'出生日期','Gender':'性别','About you':'个人简介','Not added yet':'尚未添加','Edit profile':'编辑个人资料',
      'Save changes':'保存更改','Cancel':'取消','Change photo':'更换照片','Remove':'移除','Order history':'订单历史','Saved addresses':'已保存地址',
      'Sign out':'退出登录','Help Centre':'帮助中心','Call MarketLink support':'致电 MarketLink 客服','WhatsApp support':'WhatsApp 客服',
      'Email support':'电子邮件客服','Frequently asked questions':'常见问题','Language preference':'语言偏好','App language':'应用语言',
      'Use MarketLink in your preferred language':'使用你偏好的语言浏览 MarketLink','Open MarketLink AI chat →':'打开 MarketLink AI 聊天 →',
      'Order tracking':'订单跟踪','CURRENT ORDER STATUS':'当前订单状态','Delivery details':'配送详情','Order summary':'订单摘要',
      'Order received':'已收到订单','Vendor confirmed':'商家已确认','Preparing your order':'正在准备订单','Rider assigned':'已分配配送员',
      'Picked up':'已取货','On the way':'配送途中','Delivered':'已送达','Cancelled':'已取消','Failed':'失败',
      'Payment confirmed':'付款已确认','Payment not completed':'付款未完成','Complete your payment':'完成付款',
      'Pay on Delivery':'货到付款','Mobile-money number':'移动支付号码'
    },
    ar:{
      'Home':'الرئيسية','Categories':'الفئات','Orders':'الطلبات','Cart':'السلة','Alerts':'التنبيهات','Profile':'الملف الشخصي','Search':'بحث',
      'Your MarketLink account':'حساب MarketLink الخاص بك','Full name':'الاسم الكامل','Display name':'اسم العرض','Date of birth':'تاريخ الميلاد',
      'Gender':'الجنس','About you':'نبذة عنك','Not added yet':'لم تتم الإضافة بعد','Edit profile':'تعديل الملف الشخصي','Save changes':'حفظ التغييرات',
      'Cancel':'إلغاء','Change photo':'تغيير الصورة','Remove':'إزالة','Order history':'سجل الطلبات','Saved addresses':'العناوين المحفوظة',
      'Sign out':'تسجيل الخروج','Help Centre':'مركز المساعدة','Call MarketLink support':'اتصل بدعم MarketLink','WhatsApp support':'دعم واتساب',
      'Email support':'الدعم عبر البريد الإلكتروني','Frequently asked questions':'الأسئلة الشائعة','Language preference':'تفضيل اللغة',
      'App language':'لغة التطبيق','Open MarketLink AI chat →':'افتح محادثة MarketLink AI →','Order tracking':'تتبع الطلب',
      'Delivery details':'تفاصيل التوصيل','Order summary':'ملخص الطلب','Order received':'تم استلام الطلب','Vendor confirmed':'أكد البائع الطلب',
      'Preparing your order':'جارٍ تجهيز الطلب','Rider assigned':'تم تعيين المندوب','Picked up':'تم الاستلام','On the way':'في الطريق',
      'Delivered':'تم التوصيل','Cancelled':'أُلغي','Failed':'فشل','Payment confirmed':'تم تأكيد الدفع','Payment not completed':'لم يكتمل الدفع',
      'Complete your payment':'أكمل الدفع','Pay on Delivery':'الدفع عند الاستلام','Mobile-money number':'رقم الأموال عبر الهاتف'
    },
    tl:{
      'Home':'Home','Categories':'Mga Kategorya','Orders':'Mga Order','Cart':'Cart','Alerts':'Mga Alerto','Profile':'Profile','Search':'Maghanap',
      'Your MarketLink account':'Iyong MarketLink account','Full name':'Buong pangalan','Display name':'Pangalan na ipapakita','Date of birth':'Petsa ng kapanganakan',
      'Gender':'Kasarian','About you':'Tungkol sa iyo','Not added yet':'Hindi pa naidaragdag','Edit profile':'I-edit ang profile','Save changes':'I-save ang mga pagbabago',
      'Cancel':'Kanselahin','Change photo':'Palitan ang larawan','Remove':'Alisin','Order history':'Kasaysayan ng order','Saved addresses':'Mga naka-save na address',
      'Sign out':'Mag-sign out','Help Centre':'Help Centre','Call MarketLink support':'Tawagan ang suporta ng MarketLink','WhatsApp support':'Suporta sa WhatsApp',
      'Email support':'Suporta sa email','Frequently asked questions':'Mga madalas itanong','Language preference':'Kagustuhan sa wika','App language':'Wika ng app',
      'Open MarketLink AI chat →':'Buksan ang MarketLink AI chat →','Order tracking':'Pagsubaybay ng order','Delivery details':'Mga detalye ng delivery',
      'Order summary':'Buod ng order','Order received':'Natanggap ang order','Vendor confirmed':'Kinumpirma ng vendor','Preparing your order':'Inihahanda ang order',
      'Rider assigned':'May nakatalagang rider','Picked up':'Nakuha na','On the way':'Nasa biyahe','Delivered':'Naihatid','Cancelled':'Kinansela',
      'Payment confirmed':'Nakumpirma ang bayad','Payment not completed':'Hindi natapos ang bayad','Complete your payment':'Kumpletuhin ang bayad',
      'Pay on Delivery':'Bayad sa delivery','Mobile-money number':'Numero ng mobile money'
    },
    ha:{
      'Home':'Gida','Categories':'Rukuni','Orders':'Oda','Cart':'Kwando','Alerts':'Sanarwa','Profile':'Bayanan martaba','Search':'Nema',
      'Full name':'Cikakken suna','Display name':'Sunan nunawa','Date of birth':'Ranar haihuwa','Gender':'Jinsi','About you':'Game da kai',
      'Edit profile':'Gyara bayanan martaba','Save changes':'Ajiye canje-canje','Cancel':'Soke','Change photo':'Canza hoto','Remove':'Cire',
      'Order history':'Tarihin oda','Saved addresses':'Adireshin da aka adana','Sign out':'Fita','Help Centre':'Cibiyar taimako',
      'Call MarketLink support':'Kira tallafin MarketLink','WhatsApp support':'Tallafin WhatsApp','Email support':'Tallafin imel',
      'Frequently asked questions':'Tambayoyin da ake yawan yi','Language preference':'Zaɓin harshe','App language':'Harshen manhaja',
      'Order tracking':'Bibiyar oda','Delivery details':'Bayanan isarwa','Order summary':'Taƙaitaccen oda','Delivered':'An kai','Cancelled':'An soke',
      'Payment confirmed':'An tabbatar da biya','Complete your payment':'Kammala biyan kuɗi'
    },
    yo:{
      'Home':'Ilé','Categories':'Àwọn ẹ̀ka','Orders':'Àwọn àṣẹ','Cart':'Kẹ̀kẹ́ rira','Alerts':'Àwọn ìkìlọ̀','Profile':'Profaili','Search':'Wá kiri',
      'Full name':'Orúkọ kíkún','Display name':'Orúkọ ìfihàn','Date of birth':'Ọjọ́ ìbí','Gender':'Ìbálòpọ̀','About you':'Nípa rẹ',
      'Edit profile':'Ṣàtúnṣe profaili','Save changes':'Fi àwọn àyípadà pamọ́','Cancel':'Fagilé','Change photo':'Yí fọ́tò padà','Remove':'Yọ kúrò',
      'Order history':'Ìtàn àwọn àṣẹ','Saved addresses':'Àwọn àdírẹ́sì tí a pamọ́','Sign out':'Jáde','Help Centre':'Ibi ìrànlọ́wọ́',
      'Call MarketLink support':'Pe ìrànlọ́wọ́ MarketLink','WhatsApp support':'Ìrànlọ́wọ́ WhatsApp','Email support':'Ìrànlọ́wọ́ ímeèlì',
      'Frequently asked questions':'Àwọn ìbéèrè tí a sábà máa ń béèrè','Language preference':'Yíyan èdè','App language':'Èdè ohun èlò',
      'Order tracking':'Títọ́pinpin àṣẹ','Delivery details':'Àlàyé ìfijiṣẹ́','Order summary':'Àkótán àṣẹ','Delivered':'Ti fi ránṣẹ́','Cancelled':'Ti fagilé'
    },
    ig:{
      'Home':'Ụlọ','Categories':'Ụdị','Orders':'Iwu','Cart':'Ụgbọ ahịa','Alerts':'Ịdọ aka ná ntị','Profile':'Profaịlụ','Search':'Chọọ',
      'Full name':'Aha zuru ezu','Display name':'Aha ngosi','Date of birth':'Ụbọchị ọmụmụ','Gender':'Eshịne','About you':'Maka gị',
      'Edit profile':'Dezie profaịlụ','Save changes':'Chekwa mgbanwe','Cancel':'Kagbuo','Change photo':'Gbanwee foto','Remove':'Wepụ',
      'Order history':'Akụkọ iwu','Saved addresses':'Adreesị echekwara','Sign out':'Pụọ','Help Centre':'Ebe enyemaka',
      'Call MarketLink support':'Kpọọ nkwado MarketLink','WhatsApp support':'Nkwado WhatsApp','Email support':'Nkwado email',
      'Frequently asked questions':'Ajụjụ a na-ajụkarị','Language preference':'Nhọrọ asụsụ','App language':'Asụsụ ngwa',
      'Order tracking':'Nsochi iwu','Delivery details':'Nkọwa nnyefe','Order summary':'Nchịkọta iwu','Delivered':'Ebufela','Cancelled':'Akagbuola'
    },
    ff:{
      'Home':'Galle','Profile':'Profil','Search':'Yiylo','Edit profile':'Waylu profil','Save changes':'Danndu waylude','Cancel':'Haaytu',
      'Change photo':'Waylu natal','Remove':'Momtu','Order history':'Taariki odaaji','Saved addresses':'Adressiji denciraaɗi',
      'Help Centre':'Ballal','Call MarketLink support':'Noddu ballal MarketLink','WhatsApp support':'Ballal WhatsApp','Email support':'Ballal email',
      'Language preference':'Suɓaade ɗemngal','App language':'Ɗemngal aplikasiyoŋ'
    }
  };
  Object.assign(dictionaries.fr,{
    'Continue':'Continuer','Next':'Suivant','Back':'Retour','Create account':'Créer un compte','Register':'S’inscrire','Log in':'Se connecter','Login':'Connexion',
    'Phone number':'Numéro de téléphone','Enter phone number':'Saisissez votre numéro de téléphone','Enter your 4-digit PIN':'Saisissez votre code PIN à 4 chiffres',
    'Verify':'Vérifier','Submit':'Envoyer','Add to cart':'Ajouter au panier','Place order':'Passer la commande','Checkout':'Paiement','View details':'Voir les détails',
    'View order details':'Voir les détails de la commande','Latest order updates':'Dernières mises à jour de la commande','No active orders':'Aucune commande active',
    'Notifications':'Notifications','Terms of Service':'Conditions d’utilisation','Privacy Policy':'Politique de confidentialité','Retry':'Réessayer','Save':'Enregistrer','Loading…':'Chargement…'
  });
  Object.assign(dictionaries.es,{
    'Continue':'Continuar','Next':'Siguiente','Back':'Volver','Create account':'Crear cuenta','Register':'Registrarse','Log in':'Iniciar sesión','Login':'Iniciar sesión',
    'Phone number':'Número de teléfono','Enter phone number':'Introduce tu número de teléfono','Enter your 4-digit PIN':'Introduce tu PIN de 4 dígitos',
    'Verify':'Verificar','Submit':'Enviar','Add to cart':'Añadir al carrito','Place order':'Realizar pedido','Checkout':'Finalizar compra','View details':'Ver detalles',
    'View order details':'Ver detalles del pedido','Latest order updates':'Últimas actualizaciones del pedido','No active orders':'No hay pedidos activos',
    'Notifications':'Notificaciones','Terms of Service':'Términos del servicio','Privacy Policy':'Política de privacidad','Retry':'Reintentar','Save':'Guardar','Loading…':'Cargando…'
  });
  Object.assign(dictionaries.de,{
    'Continue':'Weiter','Next':'Weiter','Back':'Zurück','Create account':'Konto erstellen','Register':'Registrieren','Log in':'Anmelden','Login':'Anmelden',
    'Phone number':'Telefonnummer','Enter phone number':'Telefonnummer eingeben','Enter your 4-digit PIN':'4-stellige PIN eingeben','Verify':'Verifizieren','Submit':'Absenden',
    'Add to cart':'In den Warenkorb','Place order':'Bestellung aufgeben','Checkout':'Zur Kasse','View details':'Details ansehen','View order details':'Bestelldetails ansehen',
    'Latest order updates':'Neueste Bestellupdates','No active orders':'Keine aktiven Bestellungen','Notifications':'Mitteilungen','Terms of Service':'Nutzungsbedingungen',
    'Privacy Policy':'Datenschutzerklärung','Retry':'Erneut versuchen','Save':'Speichern','Loading…':'Wird geladen…'
  });
  Object.assign(dictionaries.pt,{
    'Continue':'Continuar','Next':'Seguinte','Back':'Voltar','Create account':'Criar conta','Register':'Registar','Log in':'Iniciar sessão','Login':'Iniciar sessão',
    'Phone number':'Número de telefone','Enter phone number':'Introduza o seu número de telefone','Enter your 4-digit PIN':'Introduza o PIN de 4 dígitos',
    'Verify':'Verificar','Submit':'Enviar','Add to cart':'Adicionar ao carrinho','Place order':'Fazer pedido','Checkout':'Finalizar compra','View details':'Ver detalhes',
    'View order details':'Ver detalhes do pedido','Latest order updates':'Atualizações recentes do pedido','No active orders':'Não há pedidos ativos',
    'Notifications':'Notificações','Terms of Service':'Termos de serviço','Privacy Policy':'Política de privacidade','Retry':'Tentar novamente','Save':'Guardar','Loading…':'A carregar…'
  });
  Object.assign(dictionaries['zh-Hans'],{
    'Continue':'继续','Next':'下一步','Back':'返回','Create account':'创建账户','Register':'注册','Log in':'登录','Login':'登录',
    'Phone number':'电话号码','Enter phone number':'请输入电话号码','Enter your 4-digit PIN':'请输入 4 位 PIN','Verify':'验证','Submit':'提交',
    'Add to cart':'加入购物车','Place order':'提交订单','Checkout':'结账','View details':'查看详情','View order details':'查看订单详情',
    'Latest order updates':'最新订单更新','No active orders':'没有进行中的订单','Notifications':'通知','Terms of Service':'服务条款',
    'Privacy Policy':'隐私政策','Retry':'重试','Save':'保存','Loading…':'正在加载…'
  });
  Object.assign(dictionaries.ar,{
    'Continue':'متابعة','Next':'التالي','Back':'رجوع','Create account':'إنشاء حساب','Register':'تسجيل','Log in':'تسجيل الدخول','Login':'تسجيل الدخول',
    'Phone number':'رقم الهاتف','Enter phone number':'أدخل رقم الهاتف','Enter your 4-digit PIN':'أدخل رمز PIN المكوّن من 4 أرقام',
    'Verify':'تحقق','Submit':'إرسال','Add to cart':'أضف إلى السلة','Place order':'تأكيد الطلب','Checkout':'إتمام الدفع','View details':'عرض التفاصيل',
    'View order details':'عرض تفاصيل الطلب','Latest order updates':'أحدث تحديثات الطلب','No active orders':'لا توجد طلبات نشطة','Notifications':'الإشعارات',
    'Terms of Service':'شروط الخدمة','Privacy Policy':'سياسة الخصوصية','Retry':'إعادة المحاولة','Save':'حفظ','Loading…':'جارٍ التحميل…'
  });
  Object.assign(dictionaries.tl,{
    'Continue':'Magpatuloy','Next':'Susunod','Back':'Bumalik','Create account':'Gumawa ng account','Register':'Magrehistro','Log in':'Mag-log in','Login':'Mag-log in',
    'Phone number':'Numero ng telepono','Enter phone number':'Ilagay ang numero ng telepono','Enter your 4-digit PIN':'Ilagay ang 4-digit PIN','Verify':'I-verify','Submit':'Isumite',
    'Add to cart':'Idagdag sa cart','Place order':'Ilagay ang order','Checkout':'Checkout','View details':'Tingnan ang mga detalye','View order details':'Tingnan ang detalye ng order',
    'Latest order updates':'Pinakabagong update ng order','No active orders':'Walang aktibong order','Notifications':'Mga notification','Terms of Service':'Mga tuntunin ng serbisyo',
    'Privacy Policy':'Patakaran sa privacy','Retry':'Subukan muli','Save':'I-save','Loading…':'Naglo-load…'
  });
  Object.assign(dictionaries.wo,{
    'Home':'Xëtu dalal','Continue':'Wéyal','Next':'Li ci topp','Back':'Delluwaat','Create account':'Sos koont','Log in':'Dugg','Phone number':'Nimero telefon',
    'Add to cart':'Yokk ci panier','Place order':'Def commande','View details':'Xool leeral','Save':'Denc','Notifications':'Yëgle yi'
  });
  Object.assign(dictionaries.ha,{
    'Continue':'Ci gaba','Next':'Na gaba','Back':'Koma baya','Create account':'Ƙirƙiri asusu','Register':'Yi rajista','Log in':'Shiga','Login':'Shiga',
    'Phone number':'Lambar waya','Verify':'Tabbatar','Submit':'Aika','Add to cart':'Ƙara cikin kwando','Place order':'Sanya oda','View details':'Duba cikakkun bayanai',
    'Latest order updates':'Sabbin bayanan oda','No active orders':'Babu odar da ke aiki','Save':'Ajiye','Retry':'Sake gwadawa','Loading…':'Ana lodawa…'
  });
  Object.assign(dictionaries.yo,{
    'Continue':'Tẹ̀síwájú','Next':'Tó kàn','Back':'Padà','Create account':'Ṣẹ̀dá àkọọ́lẹ̀','Register':'Forúkọ sílẹ̀','Log in':'Wọlé','Login':'Wọlé',
    'Phone number':'Nọ́mbà fóònù','Verify':'Jẹ́rìí','Submit':'Fìránṣẹ́','Add to cart':'Fi kún àpò','Place order':'Fi àṣẹ sílẹ̀','View details':'Wo àlàyé',
    'Latest order updates':'Àwọn ìmúdójúìwọ̀n àṣẹ tuntun','No active orders':'Kò sí àṣẹ tó ń lọ','Save':'Pamọ́','Retry':'Tún gbìyànjú','Loading…':'Ó ń ṣí…'
  });
  Object.assign(dictionaries.ig,{
    'Continue':'Gaa n’ihu','Next':'Ọzọ','Back':'Laghachi','Create account':'Mepụta akaụntụ','Register':'Debanye aha','Log in':'Banye','Login':'Banye',
    'Phone number':'Nọmba ekwentị','Verify':'Nyochaa','Submit':'Zipụ','Add to cart':'Tinye na nkata','Place order':'Debe iwu','View details':'Lee nkọwa',
    'Latest order updates':'Mmelite iwu kacha ọhụrụ','No active orders':'Enweghị iwu na-arụ ọrụ','Save':'Chekwa','Retry':'Nwaa ọzọ','Loading…':'Na-ebunye…'
  });
  dictionaries.mnk={
    'Home':'Sotoo','Categories':'Fankoo','Orders':'Sariyaŋo','Cart':'Sakoo','Alerts':'Kibaroo','Profile':'Profil','Search':'Wuli',
    'Continue':'Taa a la','Next':'Nata','Back':'Kombori','Create account':'Kontoo daɲaa','Register':'Seyitandi','Log in':'Donkoto',
    'Login':'Donkoto','Phone Number':'Telefoni nimero','Phone number':'Telefoni nimero','Full Name':'Tumaŋo tiŋo',
    '4-digit PIN':'PIN nimero 4','Sign In':'Donkoto','Sign in to your account':'I kontoo la donkoto',
    'Signing in…':'A be donkoto la…','Enter your phone number':'I telefɔni nimero dɔɔ la','Enter your 4-digit PIN':'I PIN nimero 4 dɔɔ la',
    'Login failed. Please try again.':'Donkoto ma se. A ye a laati kɔfɛ.','Phone number is required.':'Telefɔni nimero be ka kan.','Please check your Gambian mobile number.':'I ye Gambiya telefɔni nimero laati kɔfɛ.',
    'Mobile network':'Telefɔni network','Choose your network':'I ye network ta','Local number':'Telefɔni nimero','Use your 7-digit local number':'I ye i la telefɔni nimero 7-digit la',
    'Africell':'Africell','Comium':'Comium','QCell':'QCell','Gamcel':'Gamcel','Your Local Marketplace':'I la lokal marse',
    'Welcome back 👋':'I be kɛlɛŋ, a ni ce!','New here? ':'Jankaroo be? ','Create account':'Kontoo daɲaa',
    'Join MarketLink today':'Bi MarketLink la jɛŋ','Admin Portal':'Admin la soodoo','Language':'Kanŋo',
    'Save changes':'Jaatɛŋolu mara','Cancel':'Dafa','Edit profile':'Profil bɛnbɛn','Order history':'Sariyaŋolu tariku',
    'Frequently asked questions':'Saa koŋolu la jaabi','Help Centre':'Dɛmɛ soodoo','App language':'Aplikasioŋ kanŋo',
    'Add to cart':'Sakoo la don','Place order':'Sariyaŋo kɛ','Delivered':'Sankata','Cancelled':'Dafata'
  };
  var coverage={
    en:'English is the default. All untranslated text remains in its original wording.',
    mnk:'Mandinka beta: selected login and common interface labels translated; some text remains in English. Please have a fluent Mandinka speaker review the wording.',
    fr:'French beta: core labels translated; some text remains in English. Please report unclear wording.',
    wo:'Wolof draft: selected labels translated. Native-speaker review is still needed before this can be called complete.',
    'zh-Hans':'Chinese beta: selected interface labels translated; some text remains in English.',
    ar:'Arabic beta: selected interface labels translated; some text remains in English.',
    tl:'Filipino beta: selected interface labels translated; some text remains in English.',
    ha:'Hausa draft: selected labels translated; native-speaker review is recommended.',
    yo:'Yoruba draft: selected labels translated; native-speaker review is recommended.',
    ig:'Igbo draft: selected labels translated; native-speaker review is recommended.',
    ff:'Fula/Pulaar draft: selected labels translated; native-speaker review is recommended.'
  };
  languages.forEach(function(item){
    if(item.code==='en')return;
    if(!coverage[item.code]){
      var n=Object.keys(dictionaries[item.code]||{}).length;
      coverage[item.code]=n
        ? item.label.split(' (')[0]+' beta: '+n+' common phrases translated; other text remains in English until reviewed.'
        : item.label.split(' (')[0]+' translation is not enabled yet. MarketLink stays in English for now while accurate wording is prepared and reviewed.';
    }
  });
  var originalNodes=new WeakMap();
  var originalAttributes=new WeakMap();
  var OBSERVED_ATTRIBUTES=['placeholder','title','aria-label'];
  var observer=null;
  var translating=false;
  function getLanguage(){
    try{
      var saved=localStorage.getItem(STORAGE_KEY);
      return languages.some(function(item){return item.code===saved;})?saved:'en';
    }catch(e){return 'en';}
  }
  function getLanguages(){return languages.slice();}
  function getCoverageLabel(code){return coverage[code||getLanguage()]||coverage.en;}
  function normalize(text){return String(text||'').replace(/\s+/g,' ').trim();}
  function protectedElement(el){
    if(!el||!el.closest)return false;
    return !!el.closest('script,style,noscript,textarea,input,select,option,[contenteditable="true"],[data-no-translate],.ml-profile-name,.ml-product-name,.ml-product-vendor,.ml-live-order-id,.ml-tracking-note,.ml-avatar,.ml-avatar-photo,.ml-category-photo,.ml-cat-photo,.ml-product-img,.ml-role-pill,.ml-profile-phone');
  }
  function preserveBrand(text){
    var v=normalize(text);
    return !v||v==='MarketLink'||v==='MarketLink Gambia'||v==='MarketLink AI'||v==='Royal FinTech Company'||v==='WhatsApp';
  }
  function translated(source,code){
    if(code==='en'||preserveBrand(source))return source;
    var dict=dictionaries[code]||{};
    return Object.prototype.hasOwnProperty.call(dict,source)?dict[source]:source;
  }
  function translateTextNode(node,code){
    if(!node||node.nodeType!==3||!node.parentElement||protectedElement(node.parentElement))return;
    var current=node.nodeValue||'';
    var record=originalNodes.get(node);
    var currentTrim=current.trim();
    var source=record&&record.translated===currentTrim?record.source:currentTrim;
    if(!source)return;
    var result=translated(source,code);
    originalNodes.set(node,{source:source,translated:result});
    if(result!==currentTrim){
      var lead=(current.match(/^\s*/)||[''])[0],trail=(current.match(/\s*$/)||[''])[0];
      node.nodeValue=lead+result+trail;
    }
  }
  function translateAttribute(el,name,code){
    if(!el||protectedElement(el))return;
    var current=el.getAttribute(name);
    if(current===null)return;
    var store=originalAttributes.get(el);
    if(!store){store={};originalAttributes.set(el,store);}
    var record=store[name];
    var currentNorm=normalize(current);
    var source=record&&record.translated===currentNorm?record.source:currentNorm;
    if(!source)return;
    var result=translated(source,code);
    store[name]={source:source,translated:result};
    if(result!==currentNorm)el.setAttribute(name,result);
  }
  function translateElement(el,code){
    if(!el||el.nodeType!==1)return;
    if(protectedElement(el))return;
    OBSERVED_ATTRIBUTES.forEach(function(name){translateAttribute(el,name,code);});
    var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    var node;
    while((node=walker.nextNode()))translateTextNode(node,code);
  }
  function translateAll(){
    if(translating||!document.body)return;
    translating=true;
    var code=getLanguage();
    try{
      document.documentElement.lang=code==='zh-Hans'?'zh-Hans':code;
      document.documentElement.dir=code==='ar'||code==='ur'?'rtl':'ltr';
      var skip=document.querySelectorAll('script,style,textarea,input,select,option,[contenteditable="true"],[data-no-translate],.ml-profile-name,.ml-product-name,.ml-product-vendor,.ml-live-order-id,.ml-tracking-note,.ml-avatar,.ml-avatar-photo,.ml-category-photo,.ml-cat-photo,.ml-product-img,.ml-role-pill,.ml-profile-phone');
      var skipped=new Set(Array.prototype.slice.call(skip));
      var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      var node;
      while((node=walker.nextNode())){
        var parent=node.parentElement;
        if(!parent||parent.closest('script,style,noscript,textarea,input,select,option,[contenteditable="true"],[data-no-translate],.ml-profile-name,.ml-product-name,.ml-product-vendor,.ml-live-order-id,.ml-tracking-note,.ml-avatar,.ml-avatar-photo,.ml-category-photo,.ml-cat-photo,.ml-product-img,.ml-role-pill,.ml-profile-phone'))continue;
        translateTextNode(node,code);
      }
      Array.prototype.forEach.call(document.querySelectorAll('[placeholder],[title],[aria-label]'),function(el){
        if(!protectedElement(el)){OBSERVED_ATTRIBUTES.forEach(function(name){translateAttribute(el,name,code);});}
      });
      Array.prototype.forEach.call(document.querySelectorAll('#ml-language-login,#ml-language-profile'),function(select){
        if(select.value!==code)select.value=code;
      });
      var status=document.getElementById('ml-language-coverage');
      if(status)status.textContent=getCoverageLabel(code);
    }finally{translating=false;}
  }
  function populateLoginLanguages(){
    var select=document.getElementById('ml-language-login');
    if(!select)return;
    var current=getLanguage();
    select.innerHTML=languages.map(function(item){return '<option value="'+item.code.replace(/"/g,'')+'">'+item.label.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</option>';}).join('');
    select.value=current;
  }
  function setLanguage(code){
    code=String(code||'en');
    if(!languages.some(function(item){return item.code===code;}))code='en';
    try{localStorage.setItem(STORAGE_KEY,code);}catch(e){}
    populateLoginLanguages();
    var profileSelect=document.getElementById('ml-language-profile');
    if(profileSelect)profileSelect.value=code;
    translateAll();
    return {language:code,coverage:getCoverageLabel(code)};
  }
  function observeDom(){
    if(observer||!document.body||typeof MutationObserver!=='function')return;
    observer=new MutationObserver(function(mutations){
      if(translating)return;
      var code=getLanguage();
      mutations.forEach(function(mutation){
        if(mutation.type==='characterData')translateTextNode(mutation.target,code);
        else if(mutation.type==='attributes'&&mutation.target&&mutation.target.nodeType===1){
          var name=mutation.attributeName;
          if(OBSERVED_ATTRIBUTES.indexOf(name)>-1)translateAttribute(mutation.target,name,code);
        }else if(mutation.type==='childList'){
          mutation.addedNodes.forEach(function(node){
            if(node.nodeType===3)translateTextNode(node,code);
            else if(node.nodeType===1)translateElement(node,code);
          });
        }
      });
    });
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:OBSERVED_ATTRIBUTES});
  }
  function init(){
    populateLoginLanguages();
    translateAll();
    observeDom();
  }
  window.MarketLinkI18n={
    getLanguages:getLanguages,
    getLanguage:getLanguage,
    getCoverageLabel:getCoverageLabel,
    setLanguage:setLanguage,
    translateAll:translateAll
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
