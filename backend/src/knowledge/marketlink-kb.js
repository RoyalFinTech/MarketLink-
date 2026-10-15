'use strict';
// ═══════════════════════════════════════════════════════════════════════
// MarketLink Knowledge Base
// ═══════════════════════════════════════════════════════════════════════
// Structured FAQ/knowledge entries for the MarketLink Assistant.
// This is NOT machine learning — it's a searchable, hand-authored knowledge
// source. Every fact below reflects the ACTUAL implemented backend behavior
// as of this build (order state machine, payment methods, wallet/withdrawal
// rules, roles) — nothing here is invented or aspirational.
//
// Entry shape:
//   id       — unique, stable identifier
//   category — groups entries for browsing/expansion
//   roles    — which authenticated roles this entry is most relevant to.
//              'all' means every role (including unauthenticated guests).
//   keywords — phrases/words a question is matched against (see
//              knowledgeService.js for the scoring algorithm)
//   question — a canonical phrasing, shown in "related questions" UI
//   answer   — the actual response text
//
// To add knowledge: append a new entry object to KNOWLEDGE_BASE below.
// No code changes are needed elsewhere — the search service picks up
// every entry in this array automatically.
// ═══════════════════════════════════════════════════════════════════════

const KNOWLEDGE_BASE = [
  // ── MarketLink — general ──────────────────────────────────────────
  {
    id: 'ml-what-is',
    category: 'marketlink',
    roles: ['all'],
    keywords: ['what is marketlink', 'about marketlink', 'what does marketlink do', 'marketlink app'],
    question: 'What is MarketLink?',
    answer: "MarketLink is The Gambia's local marketplace app. It connects customers with nearby vendors (restaurants and shops) and independent delivery riders — customers browse and order, vendors prepare and fulfil orders from their own storefronts, and riders pick up and deliver them.",
  },
  {
    id: 'ml-how-works',
    category: 'marketlink',
    roles: ['all'],
    keywords: ['how does marketlink work', 'how does the marketplace work', 'how it works'],
    question: 'How does the marketplace work?',
    answer: 'A customer places an order with a vendor. The vendor accepts or rejects it, then prepares it. Once ready, a rider is assigned to pick it up and deliver it to the customer. Each step updates the order status in real time so everyone involved knows where things stand.',
  },
  {
    id: 'ml-roles',
    category: 'marketlink',
    roles: ['all'],
    keywords: ['user types', 'roles', 'account types', 'customer vendor rider admin'],
    question: 'What kinds of accounts does MarketLink have?',
    answer: 'MarketLink supports four account types: Customer (browses and orders), Vendor (runs a store and fulfils orders), Rider (delivers orders), and Admin (manages the platform). A single phone-number account can hold a customer profile plus a vendor and/or rider profile.',
  },

  // ── Customers — account ───────────────────────────────────────────
  {
    id: 'cust-register',
    category: 'customers',
    roles: ['all'],
    keywords: ['register', 'sign up', 'create account', 'how do i register'],
    question: 'How do I register?',
    answer: "Registration is two steps: first you submit your name and phone number and we send a 6-digit OTP by SMS; then you confirm that OTP and set a 4-digit PIN to finish creating your account.",
  },
  {
    id: 'cust-login',
    category: 'customers',
    roles: ['all'],
    keywords: ['login', 'log in', 'sign in', 'how do i log in'],
    question: 'How do I log in?',
    answer: 'Log in with your registered phone number and your 4-digit PIN.',
  },
  {
    id: 'cust-otp',
    category: 'customers',
    roles: ['all'],
    keywords: ['otp', 'verification code', 'sms code', "didn't get otp", 'otp not received'],
    question: 'How does OTP verification work?',
    answer: "We send a 6-digit code by SMS that expires after a few minutes. It's checked against a securely hashed copy on our server — we never store or show the raw code once sent. You get a limited number of attempts before you need to request a new one.",
  },
  {
    id: 'cust-pin-reset',
    category: 'customers',
    roles: ['all'],
    keywords: ['forgot pin', 'reset pin', 'change pin', 'pin reset'],
    question: 'I forgot my PIN — how do I reset it?',
    answer: "Request a PIN reset with your phone number, confirm the OTP we send you, then set a new 4-digit PIN.",
  },
  {
    id: 'cust-profile',
    category: 'customers',
    roles: ['customer'],
    keywords: ['edit profile', 'update profile', 'my profile', 'addresses'],
    question: 'Can I update my profile and addresses?',
    answer: 'Yes — you can update your profile details and manage saved delivery addresses (add, edit, or remove) from your account.',
  },

  // ── Customers — shopping ──────────────────────────────────────────
  {
    id: 'cust-browse',
    category: 'customers',
    roles: ['customer'],
    keywords: ['browse products', 'find products', 'search products', 'categories'],
    question: 'How do I browse products and categories?',
    answer: 'Products are organized by vendor and by category. You can browse a vendor\'s full catalog or filter by category to find what you need across all vendors.',
  },
  {
    id: 'cust-order-place',
    category: 'orders',
    roles: ['customer'],
    keywords: ['place an order', 'how do i order', 'checkout', 'buy something'],
    question: 'How do I place an order?',
    answer: "Add items from a single vendor to your order, choose a delivery address and payment method, and submit. The system checks stock and pricing (including any coupon) at checkout, then creates the order and notifies the vendor.",
  },
  {
    id: 'cust-order-track',
    category: 'orders',
    roles: ['customer'],
    keywords: ['track my order', 'order tracking', 'where is my order', 'order status'],
    question: 'How do I track my order?',
    answer: "Open the order from your order history to see its current status and delivery progress. An order moves through: pending → accepted → preparing → awaiting rider → rider assigned → picked up → on the way → delivered.",
  },
  {
    id: 'cust-order-history',
    category: 'orders',
    roles: ['customer'],
    keywords: ['order history', 'past orders', 'my orders'],
    question: 'Where can I see my past orders?',
    answer: 'Your order history lists every order you\'ve placed, with its current or final status, so you can reorder or check details anytime.',
  },
  {
    id: 'cust-order-cancel',
    category: 'orders',
    roles: ['customer'],
    keywords: ['cancel order', 'cancel my order', 'can i cancel'],
    question: 'Can I cancel my order?',
    answer: "You can cancel an order yourself only while it's still 'pending' or 'accepted' — before the vendor has started preparing it. Once preparation begins, cancellation is no longer available to the customer. Any cancelled order has its items automatically restocked.",
  },

  // ── Payments & wallet ──────────────────────────────────────────────
  {
    id: 'pay-methods',
    category: 'payments',
    roles: ['all'],
    keywords: ['payment methods', 'how do i pay', 'payment options', 'can i pay cash'],
    question: 'What payment methods are supported?',
    answer: "Cash on Delivery (COD) is available and fully working. Card and mobile-money payments (via Stripe, Paystack, or Flutterwave) are built into the platform but only become available once the operator configures the relevant provider credentials — until then those options return a 'not configured' response rather than pretending to succeed.",
  },
  {
    id: 'pay-confirm',
    category: 'payments',
    roles: ['all'],
    keywords: ['payment confirmed', 'how are payments confirmed', 'payment verification'],
    question: 'How is a payment confirmed?',
    answer: 'For COD, an admin confirms payment on delivery. For card/mobile-money providers, confirmation comes from the payment provider itself — the app never marks a payment as successful based on what the customer\'s device reports.',
  },
  {
    id: 'wallet-general',
    category: 'wallet',
    roles: ['all'],
    keywords: ['wallet', 'what can i do with my wallet', 'wallet balance'],
    question: 'What can I do with my wallet?',
    answer: "Every account has a wallet. Refunds are credited to it automatically, and vendors/riders also earn into theirs. You can view your balance and full transaction history, and — for vendors and riders — request a withdrawal of available funds.",
  },
  {
    id: 'wallet-transactions',
    category: 'wallet',
    roles: ['all'],
    keywords: ['wallet transactions', 'transaction history'],
    question: 'Can I see my wallet transaction history?',
    answer: 'Yes — every credit and debit to your wallet (earnings, refunds, withdrawals) is recorded and viewable in your wallet transaction history.',
  },

  // ── Vendors ──────────────────────────────────────────────────────
  {
    id: 'vendor-register',
    category: 'vendors',
    roles: ['all', 'customer'],
    keywords: ['become a vendor', 'vendor registration', 'sign up as a vendor', 'open a store'],
    question: 'How do I become a vendor?',
    answer: 'You need a customer account first. From there, register as a vendor with your business details — an admin reviews and approves the application before your store goes live.',
  },
  {
    id: 'vendor-dashboard',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['vendor dashboard', 'vendor analytics', 'store performance'],
    question: 'What can I see on my vendor dashboard?',
    answer: 'Your vendor dashboard shows analytics for your store — orders, revenue, items sold, and ratings — over 7, 30, or 90-day periods.',
  },
  {
    id: 'vendor-orders-accept',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['accept an order', 'how do i accept an order', 'vendor accept order'],
    question: 'How does a vendor accept an order?',
    answer: "When a new order comes in with status 'pending', open it from your vendor order queue and accept it. This moves it to 'accepted', and you can then move it through 'preparing' and 'awaiting rider' as you get it ready. Only the vendor the order belongs to can do this.",
  },
  {
    id: 'vendor-orders-reject',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['reject an order', 'decline an order', 'vendor reject order'],
    question: 'How does a vendor reject an order?',
    answer: "You can reject a 'pending' order and must give a reason. Rejecting cancels the order, and its items are automatically returned to your inventory.",
  },
  {
    id: 'vendor-orders-prepare',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['preparing an order', 'mark order preparing', 'ready for pickup'],
    question: 'How do I mark an order as being prepared?',
    answer: "After accepting an order, move it to 'preparing', then to 'awaiting rider' once it's ready for pickup so a rider can be assigned.",
  },
  {
    id: 'vendor-earnings',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['vendor earnings', 'how much do i earn', 'vendor payout', 'commission'],
    question: 'How do vendor earnings work?',
    answer: 'MarketLink currently uses a 5% platform commission by default on the discounted merchandise subtotal. The vendor keeps the remaining merchandise value, while the customer-facing delivery fee is reserved for the rider. Your final payout and the commission amount are recorded on the order and in the wallet ledger.',
  },
  {
    id: 'vendor-withdrawals',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['vendor withdrawal', 'withdraw my earnings', 'vendor payout request'],
    question: 'How do vendor withdrawals work?',
    answer: "Request a withdrawal from your wallet balance with a payout method — the amount is checked against your available balance (minus anything already pending) so you can't request more than you actually have or double-request the same funds. An admin then approves or rejects the request; on approval, the amount is debited from your wallet and recorded as a transaction.",
  },

  // ── Riders ───────────────────────────────────────────────────────
  {
    id: 'rider-register',
    category: 'riders',
    roles: ['all', 'customer'],
    keywords: ['become a driver', 'become a rider', 'rider registration', 'sign up as a rider'],
    question: 'How do I become a rider?',
    answer: 'Register as a rider with your vehicle and identification details from your account. An admin reviews and approves your application before you can start accepting deliveries.',
  },
  {
    id: 'rider-login',
    category: 'riders',
    roles: ['rider'],
    keywords: ['rider login', 'how do riders log in'],
    question: 'How do riders log in?',
    answer: 'Riders log in the same way as any account — phone number and PIN — and their rider dashboard becomes available once their application is approved.',
  },
  {
    id: 'rider-availability',
    category: 'riders',
    roles: ['rider'],
    keywords: ['go online', 'available deliveries', 'set availability', 'rider online status'],
    question: 'How do I see available deliveries?',
    answer: "Toggle your availability to 'online' so you can be assigned deliveries. Deliveries awaiting a rider appear once an order reaches the 'awaiting rider' status.",
  },
  {
    id: 'rider-pickup-delivery',
    category: 'riders',
    roles: ['rider'],
    keywords: ['pickup order', 'update delivery status', 'mark as delivered', 'rider delivery status'],
    question: 'How does a rider update delivery status?',
    answer: "Once assigned, move the delivery through: rider assigned → picked up → on the way → delivered. Only the rider assigned to that specific delivery can update its status.",
  },
  {
    id: 'rider-gps',
    category: 'riders',
    roles: ['rider', 'customer'],
    keywords: ['gps tracking', 'rider location', 'live tracking', 'track the rider'],
    question: 'How does GPS tracking work?',
    answer: 'While on an active delivery, the rider\'s app periodically sends location updates. Only the customer and vendor tied to that specific order can see the rider\'s live location — it\'s never exposed to anyone unrelated to the delivery.',
  },
  {
    id: 'rider-earnings',
    category: 'riders',
    roles: ['rider'],
    keywords: ['rider earnings', 'how much do riders make', 'delivery pay'],
    question: 'How do rider earnings work?',
    answer: 'Each completed delivery logs an earning to your rider earnings record, which feeds your wallet balance. You can view your earnings by period (7/30/90 days).',
  },
  {
    id: 'rider-withdrawals',
    category: 'riders',
    roles: ['rider'],
    keywords: ['rider withdrawal', 'withdraw rider earnings', 'rider payout request'],
    question: 'How do rider withdrawals work?',
    answer: "Same as vendor withdrawals: request a payout from your wallet balance with a payout method. The amount is checked against what's actually available (accounting for any pending requests), an admin approves or rejects it, and approved withdrawals debit your wallet with a full transaction record.",
  },

  // ── Orders — state machine (documented precisely) ──────────────────
  {
    id: 'orders-state-machine',
    category: 'orders',
    roles: ['all'],
    keywords: ['order states', 'order status flow', 'order lifecycle', 'what does preparing mean'],
    question: 'What are all the order statuses and what do they mean?',
    answer: "pending (just placed, awaiting the vendor) → accepted (vendor confirmed it) → preparing (vendor is making/packing it) → awaiting_rider (ready, needs a rider) → rider_assigned (a rider has been assigned) → picked_up (rider collected it from the vendor) → on_the_way (rider is en route) → delivered (completed). An order can also become 'cancelled' — by the customer while pending/accepted, by the vendor rejecting a pending order, or by an admin.",
  },
  {
    id: 'orders-cancel-rules',
    category: 'orders',
    roles: ['all'],
    keywords: ['what happens when an order is cancelled', 'cancellation rules', 'order cancelled'],
    question: 'What happens when an order is cancelled?',
    answer: "Its status is set to 'cancelled', the change is logged in the order's status history, and every item on the order is automatically returned to inventory. If a delivery had already been created for it, that delivery is also marked cancelled (unless it was already delivered).",
  },

  // ── Support ──────────────────────────────────────────────────────
  {
    id: 'support-contact',
    category: 'support',
    roles: ['all'],
    keywords: ['contact support', 'help', 'customer service', 'talk to a human'],
    question: 'How do I contact support?',
    answer: "You can reach MarketLink support through the WhatsApp button in the app, or by using the contact details listed in the app's support section.",
  },
  {
    id: 'support-notifications',
    category: 'support',
    roles: ['all'],
    keywords: ['notifications', 'why am i not getting notifications'],
    question: 'How do notifications work?',
    answer: 'You get notifications for key events — order status changes, payment confirmations, refunds — inside the app. You can view them, mark them read, and see an unread count.',
  },

  {
    id: 'support-contact-details',
    category: 'support',
    roles: ['all'],
    keywords: ['call marketlink', 'support phone number', 'whatsapp number', 'whatsapp contact', 'call support', 'contact marketlink directly'],
    question: 'What are MarketLink support contact details?',
    answer: 'For a direct phone call, use +220 87 407 1510. To message MarketLink on WhatsApp, use +220 407 1510. For an order question, include your order number. Never share your MarketLink PIN, wallet PIN, OTP or payment password with anyone.',
  },
  {
    id: 'profile-photo-size',
    category: 'customers',
    roles: ['all'],
    keywords: ['profile photo upload size', 'minimum image size', 'photo rejected', 'jpg png avatar size', 'change profile picture'],
    question: 'What are the profile photo requirements?',
    answer: 'Choose a valid JPG/JPEG or PNG image. It must be at least 512 × 512 pixels in both dimensions and no larger than 5 MB. MarketLink checks the file before saving it. If it is too small, unreadable or a different format, choose another image.',
  },
  {
    id: 'profile-edit-details',
    category: 'customers',
    roles: ['customer'],
    keywords: ['date of birth profile', 'edit date of birth', 'display name bio gender', 'save profile failed', 'profile information'],
    question: 'What details can I add to my profile?',
    answer: 'From Profile, select Edit profile to update your full name, display name, short introduction, date of birth and gender. You can manage saved delivery addresses separately. Only enter personal details you are comfortable sharing with MarketLink.',
  },
  {
    id: 'orders-live-tracking',
    category: 'orders',
    roles: ['all'],
    keywords: ['live order tracking', 'real time tracking', 'track delivery status', 'order timeline', 'when will rider arrive'],
    question: 'How does order tracking work?',
    answer: 'Open Orders and select View details on the order. MarketLink shows the latest recorded status, including vendor acceptance, preparation, rider assignment, pickup, journey and delivery when those updates are available. The tracking page refreshes about every 10 seconds while open. An exact arrival time or live map is shown only when the delivery system has supplied the required estimate or location data.',
  },
  {
    id: 'payment-pending-guidance',
    category: 'payments',
    roles: ['all'],
    keywords: ['payment pending', 'paid but order not updated', 'avoid double payment', 'check transaction status'],
    question: 'What should I do if my payment is pending?',
    answer: 'A pending status means MarketLink has not yet received a final confirmation. Open the order and check payment status before trying again; do not start a second payment while the first one is unresolved. If the provider confirms payment but MarketLink does not update, contact support with your order reference and payment reference. Never send your PIN or OTP in a support message.',
  },
  {
    id: 'affiliate-two-percent',
    category: 'affiliate',
    roles: ['customer'],
    keywords: ['affiliate link commission', '2 percent affiliate', 'referral reward', 'how affiliate earnings work'],
    question: 'How do MarketLink affiliate rewards work?',
    answer: 'Share your own MarketLink affiliate link. A qualifying referred order can earn a 2% reward on the eligible discounted merchandise subtotal after successful delivery. Delivery fees and other non-merchandise charges are excluded. Cancelled, failed, undelivered, refunded or fraudulent orders do not qualify; only verified referral records count.',
  },
  {
    id: 'vendor-get-started',
    category: 'vendors',
    roles: ['all', 'vendor'],
    keywords: ['become vendor', 'start selling', 'open shop', 'vendor application', 'sell on marketlink'],
    question: 'How do I become a MarketLink vendor?',
    answer: 'Open Profile and choose Become a vendor, then complete the requested business information and application details accurately. MarketLink reviews vendor applications; submitting an application does not itself mean the shop is approved. Once approved, use the vendor dashboard to manage products and orders.',
  },
  {
    id: 'rider-get-started',
    category: 'riders',
    roles: ['all', 'rider'],
    keywords: ['become rider', 'delivery agent', 'rider application', 'deliver orders', 'join as rider'],
    question: 'How do I become a MarketLink rider?',
    answer: 'Open Profile and choose Become a rider, then submit the requested contact and delivery details. MarketLink reviews rider applications and may request supporting documents. You can begin using rider features when the account has the required approval.',
  },
  {
    id: 'language-preference',
    category: 'account',
    roles: ['all'],
    keywords: ['change app language', 'language preference', 'wolof language', 'translate marketlink', 'preferred language'],
    question: 'Can I choose the language used in MarketLink?',
    answer: 'MarketLink is adding a language preference so users can choose a preferred language. Language coverage is being introduced in phases. If a specific phrase has not yet been reviewed for a language, it may remain in English until an accurate translation is available. Personal names, product names and messages written by users are not automatically rewritten.',
  },
  {
    id: 'vendor-update-order',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['vendor accept order', 'update order status', 'preparing order', 'vendor fulfillment'],
    question: 'How does a vendor update an order?',
    answer: 'Use the vendor dashboard to review incoming orders and move an order through the statuses the system permits. Typical steps are accepted, preparing and awaiting a rider. MarketLink records order-status changes so the customer and assigned delivery team can see the latest recorded progress.',
  },
  {
    id: 'rider-update-order',
    category: 'riders',
    roles: ['rider'],
    keywords: ['rider update delivery', 'mark picked up', 'on the way delivered', 'delivery task'],
    question: 'How does a rider update a delivery?',
    answer: 'Open the assigned delivery in the rider dashboard and update its status using the available actions. The normal delivery stages include rider assigned, picked up, on the way and delivered. Only update a stage when it reflects what actually happened; the customer-facing tracking page uses these recorded changes.',
  },
  {
    id: 'whatsapp-versus-call',
    category: 'support',
    roles: ['all'],
    keywords: ['whatsapp versus call', 'different support number', 'call number different from whatsapp', 'phone contact'],
    question: 'Are the call and WhatsApp numbers different?',
    answer: 'Yes. For a direct phone call, use +220 87 407 1510. For WhatsApp messages, use +220 407 1510. Make sure you choose the number for the contact method you want to use.',
  },

  {
    id: 'gm-network-phone-format',
    category: 'account',
    roles: ['all'],
    keywords: ['Africell phone number', 'QCell number', 'Comium number', 'Gamcel number', 'network dropdown', 'seven digit phone', 'Gambia phone format'],
    question: 'How do I enter my Gambian phone number?',
    answer: 'Choose the mobile network shown on your SIM card, then enter the seven digits printed as your subscriber number. Africell adds 87, QCell adds 83, and Comium adds 86 automatically. The Gamcel option uses the legacy seven-digit format without an added prefix and currently accepts numbers beginning with 9. Check the selected network before continuing. Never share your PIN or one-time verification code with anyone.',
  },
  {
    id: 'vendor-product-upload-simple',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['upload product', 'add item', 'product price', 'stock quantity', 'product photo', 'vendor product listing'],
    question: 'How do I add a product and set its price?',
    answer: 'In the vendor dashboard, open Products and choose Add product. Use a clear photo, a short name customers understand, the correct category, a plain-language description, the selling price in Gambian dalasi (D), and the quantity available. Check the price and stock before saving. Update or pause a listing when the price changes or the item is out of stock. Do not list an item you cannot supply.',
  },
  {
    id: 'vendor-promotions-apply',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['promote product', 'featured listing', 'promotion banner', 'advertising request', 'sponsored product', 'promotion duration'],
    question: 'How can I request a promotion for my shop?',
    answer: 'Use the Promotions or Contact Admin option if it is available in your dashboard. Prepare the promotion title, products or shop to feature, banner image, requested start and end dates, and your contact details. Admin must review and approve the creative and confirm the price and payment terms before anything is published. Do not assume a banner is live just because you submitted it, and do not pay an unofficial personal account.',
  },
  {
    id: 'vendor-orders-checklist',
    category: 'vendors',
    roles: ['vendor'],
    keywords: ['vendor order checklist', 'confirm stock', 'pack order', 'rider pickup', 'delivery handover'],
    question: 'What should I do when a new order arrives?',
    answer: 'First check the items, quantities, prices and stock. Accept the order only if you can fulfil it; contact the customer or support if something is unclear. Pack the items securely, mark preparation status using the dashboard actions, and hand the correct order to the assigned rider. Confirm the handover in the app and keep the order reference until delivery is complete.',
  },
  {
    id: 'rider-gps-location',
    category: 'riders',
    roles: ['rider'],
    keywords: ['GPS', 'location permission', 'rider coordinates', 'navigation', 'wrong location', 'share location'],
    question: 'How do I use GPS and navigation for a delivery?',
    answer: 'Allow location access while using MarketLink and keep your phone location service turned on during an active delivery. Check that the pickup and delivery addresses are correct before starting navigation. If the map pin is wrong, contact the customer or vendor to confirm a nearby landmark and update the address through the available app flow. GPS can drift indoors or between buildings, so confirm the real pickup point. Only share live location for an active delivery when the app requests it.',
  },
  {
    id: 'rider-find-assignment',
    category: 'riders',
    roles: ['rider'],
    keywords: ['find delivery jobs', 'no rider requests', 'online availability', 'rider assignment', 'vendor looking for rider'],
    question: 'How do I receive delivery requests?',
    answer: 'Complete your rider profile and required approval first. Set yourself online and keep your phone connected. Check the pickup area, delivery area and any distance or earnings information shown before accepting a task. If no jobs appear, check your online status, location permission, connection and pending profile requirements. A vendor may need to request or assign a rider through the order flow; do not accept a delivery that is not shown as assigned to you.',
  },
  {
    id: 'delivery-handover-simple',
    category: 'orders',
    roles: ['customer', 'vendor', 'rider'],
    keywords: ['how delivery works', 'pickup handover', 'delivery fee', 'cash on delivery', 'proof of delivery'],
    question: 'How does delivery work from start to finish?',
    answer: 'The customer places an order. The vendor confirms stock and prepares the package. A rider is assigned, collects the correct package, and travels to the customer’s confirmed address. The rider hands over the order and records delivery in MarketLink. Payment and order status depend on the payment method selected and the confirmations received by the system. If something goes wrong, use the order reference when contacting support; never mark an order delivered before it has been handed over.',
  },
  {
    id: 'affiliate-commission-clarification',
    category: 'affiliate',
    roles: ['customer'],
    keywords: ['affiliate 22 percent', 'affiliate rate', 'commission percentage', 'affiliate earnings percentage'],
    question: 'What is the MarketLink affiliate commission rate?',
    answer: 'The current customer affiliate reward configured in the app is 2% on qualifying purchases, not 22%. A promotional banner or message must not be read as a guaranteed rate unless the dashboard and the applicable campaign terms confirm it. Rewards depend on valid referral tracking and the order meeting the programme rules.',
  },

];

module.exports = { KNOWLEDGE_BASE };
