'use strict';

// MarketLink conversational language layer.
// Deterministic normalization for common English, Gambian English and
// Gambian Pidgin-style phrasing. This is a phrase/intent layer over the
// approved knowledge base, not statistical model fine-tuning.
const PHRASE_ALIASES = [
  [/\b(wetin|wetin be|wetin happen)\b/g, 'what'],
  [/\b(na|e be|e dey)\b/g, 'is'],
  [/\b(abi|or what)\b/g, 'or'],
  [/\b(abeg|abeg pls|pls|please)\b/g, 'please'],
  [/\b(i wan go)\b/g, 'take me to'],
  [/\btake me go\b/g, 'take me to'],
  [/\b(i wan make|i want make|i wan)\b/g, 'i want to'],
  [/\b(make i|how i go|how i fit)\b/g, 'how can i'],
  [/\b(una|u|ur)\b/g, 'you'],
  [/\b(me sef|my sef)\b/g, 'me'],
  [/\b(e|am)\b/g, 'it'],
  [/\b(no dey|no dae|no gree)\b/g, 'not working'],
  [/\b(dey|dae)\b/g, 'is'],
  [/\b(e no work|e nor work|e no dey work)\b/g, 'not working'],
  [/\b(chop|chow)\b/g, 'food'],
  [/\b(oga|madam)\b/g, 'sir'],
  [/\b(buy am|buy something)\b/g, 'buy'],
  [/\b(bring am come|bring it come)\b/g, 'deliver it'],
  [/\b(bring am)\b/g, 'deliver it'],
  [/\b(send am|send it)\b/g, 'deliver'],
  [/\b(my tin|my thing)\b/g, 'my item'],
  [/\b(collect my money|bring my money)\b/g, 'withdraw money'],
  [/\b(put money inside)\b/g, 'add money to wallet'],
  [/\b(see my money)\b/g, 'check my wallet balance'],
  [/\b(where e dey|where it dey)\b/g, 'where is it'],
  [/\b(na where|where una dey)\b/g, 'where are you'],
  [/\b(i don pay|i pay already)\b/g, 'i have paid'],
  [/\b(e never reach|e no reach)\b/g, 'not received'],
  [/\b(hold am|keep am)\b/g, 'save it'],
  [/\b(shift am|change am)\b/g, 'change it'],
];

const INTENTS = [
  { id:'track_order', pattern:/\b(track|trace|follow|where is|where my)\b.*\b(order|delivery|package)\b|\b(order|delivery)\b.*\b(where|status)\b/i, topic:'orders', answer:"To follow your order, open **Orders** in MarketLink and choose the order you want to check. Open its details to see the latest status. If you mean your own latest order status, sign in and ask me again so I can check your account." },
  { id:'open_orders', pattern:/\b(open|show|go to|take me to|where can i find)\b.*\b(my )?orders?\b|\borders page\b/i, topic:'orders', answer:"You can find your orders in the **Orders** area of the app. Open an order to see its details and delivery progress." },
  { id:'open_wallet', pattern:/\b(open|show|go to|take me to|where can i find)\b.*\b(wallet|balance|earnings)\b/i, topic:'wallet', answer:"Open **Wallet** from your account area to review your available balance and wallet activity. For a live balance, sign in and ask me to check your wallet." },
  { id:'open_profile', pattern:/\b(open|show|go to|take me to)\b.*\b(profile|account|my details)\b/i, topic:'account', answer:"Tap **Profile** in the app to view or update your account details, photo, saved addresses and available account options." },
  { id:'open_shop', pattern:/\b(open|show|go to|take me to)\b.*\b(shop|home|products|market)\b/i, topic:'products', answer:"Open **Home** to browse products, categories and local vendors. You can also use search to find a particular item or shop." },
  { id:'open_vendor_orders', pattern:/\b(vendor|seller|shop owner)\b.*\b(orders|order page)\b|\b(open|show|go to)\b.*\b(vendor orders)\b/i, topic:'vendor', answer:"If you are signed in as a vendor, open your **Vendor** workspace and choose **Orders** to review incoming orders and update their allowed statuses." },
  { id:'open_rider_deliveries', pattern:/\b(rider|driver|courier)\b.*\b(deliveries|jobs|assignments)\b|\b(open|show|go to)\b.*\b(deliveries)\b/i, topic:'rider', answer:"If you are signed in as a rider, open your **Rider** workspace and choose **Deliveries** to review assigned jobs and update delivery progress." },
  { id:'open_support', pattern:/\b(open|show|go to|contact)\b.*\b(help|support|help centre|help center)\b/i, topic:'support', answer:"Open **Help Centre** from your profile, or use the call and WhatsApp support options in the app. Never share your PIN or one-time verification code." },
];

const UNSAFE_PATTERNS = [
  /\b(hack|steal|phish|bypass security|break into|exploit an account|stolen password)\b/i,
  /\b(make a bomb|build an explosive|poison someone|hurt someone|kill someone)\b/i,
  /\b(child sexual|sexual abuse of a minor|exploit a child)\b/i,
  /\b(doxx|publish.*(home address|private phone)|expose.*private)\b/i,
];

function normalizeQuestion(input) {
  let text = String(input || '').normalize('NFKC').toLowerCase();
  text = text.replace(/https?:\/\/\S+/g, ' link ');
  text = text.replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of PHRASE_ALIASES) text = text.replace(pattern, replacement);
  text = text.replace(/\b(dont|can't|cant|wont|won't)\b/g, m => ({dont:'do not', "can't":'cannot',cant:'cannot',wont:'will not',"won't":'will not'}[m] || m));
  return text.replace(/\s+/g, ' ').trim();
}

function detectIntent(input) {
  const text = normalizeQuestion(input);
  return INTENTS.find(item => item.pattern.test(text)) || null;
}

function isUnsafe(input) {
  const text = normalizeQuestion(input);
  return UNSAFE_PATTERNS.some(pattern => pattern.test(text));
}

function safeBoundaryReply() {
  return "I can help with MarketLink, everyday questions and app navigation, but I can't assist with harming people, breaking into accounts, stealing information or exposing someone's private details. If your question is about a legitimate account or safety issue, tell me what happened and I'll point you to a safe next step.";
}

module.exports = { normalizeQuestion, detectIntent, isUnsafe, safeBoundaryReply };
