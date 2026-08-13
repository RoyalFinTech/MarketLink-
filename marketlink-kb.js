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
    answer: 'Each order records a commission split: the platform takes a percentage, and the rest is your payout for that order, credited to your wallet.',
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
];

module.exports = { KNOWLEDGE_BASE };
