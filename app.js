const initialState = {
  ownerName: "Eunatia Ngobeni",
  shopName: "The Digital Mark Spaza Shop",
  cashIn: 2840,
  cashOut: 1120,
  settledBalanceZar: 0,
  budget: 100,
  initialBudget: 100,
  dailySpent: 0,
  limitsVersion: "budget-100-supplier-50-v1",
  xrpInvestmentXrp: 0,
  xrpInvestmentZar: 0,
  walletContacts: [],
  storeBalance: 6450,
  settledBalanceZar: 1200,
  simulatedWalletXrp: 250,
  readNotifications: [],
  inventory: [
    { id: 1, name: "Albany white bread", category: "Bakery", icon: "🍞", qty: 5, unit: "loaves", expiry: "2026-11-09", supplier: "BreadCo", cost: 18, price: 22 },
    { id: 2, name: "Full cream milk 1L", category: "Dairy", icon: "🥛", qty: 8, unit: "cartons", expiry: "2026-11-16", supplier: "FreshDirect", cost: 16, price: 20 },
    { id: 3, name: "Strawberry yoghurt", category: "Dairy", icon: "🥣", qty: 6, unit: "cups", expiry: "2026-11-06", supplier: "FreshDirect", cost: 11, price: 15 },
    { id: 4, name: "Sunflower oil 750ml", category: "Pantry", icon: "🫙", qty: 14, unit: "bottles", expiry: "2027-03-18", supplier: "FreshDirect", cost: 29, price: 36 },
    { id: 5, name: "NikNaks cheese", category: "Snacks", icon: "🍿", qty: 3, unit: "packets", expiry: "2027-01-12", supplier: "BreadCo", cost: 5, price: 8 },
    { id: 6, name: "Free range eggs 6s", category: "Fresh", icon: "🥚", qty: 9, unit: "packs", expiry: "2026-11-12", supplier: "FreshDirect", cost: 24, price: 31 },
  ],
  suppliers: [
    { name: "BreadCo", type: "Bakery & bread", initials: "BC", cap: 50, orders: 18 },
    { name: "FreshDirect", type: "Fresh produce & dairy", initials: "FD", cap: 50, orders: 24 },
    { name: "WasteClear", type: "Food waste collection", initials: "WC", cap: 50, orders: 3 },
  ],
  transactions: [
    { title: "Till sale", detail: "2 × Albany white bread", type: "Sale", amount: 44, time: "10:42 AM", icon: "↗", status: "Complete" },
    { title: "FreshDirect", detail: "Supplier payment · demo sample", type: "Supplier payment", amount: -320, time: "10:16 AM", icon: "↙", status: "Demo record" },
    { title: "Till sale", detail: "Milk, eggs & cooking oil", type: "Sale", amount: 186, time: "9:54 AM", icon: "↗", status: "Complete" },
    { title: "Stock adjusted", detail: "NikNaks cheese · 3 added", type: "Inventory", amount: 0, time: "9:31 AM", icon: "＋", status: "Complete" },
    { title: "BreadCo", detail: "Supplier payment · demo sample", type: "Supplier payment", amount: -180, time: "Yesterday", icon: "↙", status: "Demo record" },
  ],
};
const saved = (() => { try { return JSON.parse(localStorage.getItem("spaza-demo-state")); } catch { return null; } })();
let state = saved ? { ...initialState, ...saved } : structuredClone(initialState);
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
function upgradeSpendingState(target) {
  if (target.limitsVersion !== "budget-100-supplier-50-v1") {
    const priorInitial = Number(target.initialBudget ?? 25); const priorRemaining = Number(target.budget ?? priorInitial);
    const alreadySpent = Math.max(0, priorInitial - priorRemaining);
    target.initialBudget = 100; target.budget = Math.max(0, 100 - alreadySpent);
    target.suppliers = (target.suppliers || []).map((supplier) => ({ ...supplier, cap: 50 }));
    target.limitsVersion = "budget-100-supplier-50-v1";
  } else {
    target.initialBudget = 100; target.budget = Math.min(100, Math.max(0, Number(target.budget ?? 100)));
    target.suppliers = (target.suppliers || []).map((supplier) => ({ ...supplier, cap: Math.min(50, Math.max(0.01, Number(supplier.cap ?? 50))) }));
  }
  target.xrpInvestmentXrp = Number(target.xrpInvestmentXrp || 0); target.xrpInvestmentZar = Number(target.xrpInvestmentZar || 0);
}
upgradeSpendingState(state);
if (state.dailySpentDate !== localToday()) { state.dailySpent = 0; state.dailySpentDate = localToday(); }
state.transactions = state.transactions.map((tx) => tx.status === "Validated" ? { ...tx, status: "Demo record", detail: tx.detail.replace(/INV-\d+/g, "demo sample") } : tx);
state.transactions = state.transactions.map((tx) => ({ ...tx, createdAt: tx.createdAt || new Date(`${localToday()}T12:00:00`).toISOString() }));
function addDemoAnalyticsHistory(target) {
  if (target.transactions.some((tx) => tx.status === "Demo history")) return;
  const history = [[12, 1780, 920], [27, 2140, 1160], [43, 1960, 980], [58, 2350, 1270], [74, 1870, 1010], [89, 1620, 840]];
  for (const [daysAgo, sales, supplierSpend] of history) {
    const day = new Date(); day.setHours(12, 0, 0, 0); day.setDate(day.getDate() - daysAgo);
    const createdAt = day.toISOString(); const dateLabel = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(day);
    target.transactions.push({ title: "Sample till sales", detail: "Imported demo history", type: "Sale", amount: sales, time: dateLabel, createdAt, icon: "↗", status: "Demo history" });
    target.transactions.push({ title: "Supplier restock", detail: "Imported demo history", type: "Supplier payment", amount: -supplierSpend, time: dateLabel, createdAt, icon: "↙", status: "Demo history" });
  }
}
addDemoAnalyticsHistory(state);
const savedPolicy = (() => { try { return JSON.parse(localStorage.getItem("spaza-demo-policy")); } catch { return null; } })();
let policy = { killSwitch: savedPolicy?.killSwitch ?? false, dailyCap: 100, policyVersion: savedPolicy?.policyVersion || "20260530" };
let activePage = "dashboard";
const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000/api" : `${window.location.origin}/api`;
let apiOnline = false;
let apiSyncTimer = null;
let loadingBackend = false;
let demoMode = true; // Card checkout and store settlement remain demo-only.
let walletInfo = { configured: false, connected: false, network: "testnet", simulated: false, balance_xrp: null, address: null };
let walletContactsReturnToSupplier = null;
let exchangeRates = null;
let selectedFxCurrency = localStorage.getItem("spaza-fx-currency") || "zar";
const API_KEY = window.SPAZA_API_KEY || "";
const languageLocales = { en: "en-ZA", zu: "zu-ZA", xh: "xh-ZA", af: "af-ZA", st: "st-ZA", sw: "sw-KE", ha: "ha-NG", yo: "yo-NG", fr: "fr-FR", pt: "pt-PT" };
let currentLanguage = (() => { try { const savedLanguage = localStorage.getItem("spaza-language"); return languageLocales[savedLanguage] ? savedLanguage : "en"; } catch { return "en"; } })();
const localizedText = Object.fromEntries([
  ["Overview", "Uhlolojikelele", "Isishwankathelo", "Oorsig", "Kakaretso"],
  ["Good morning, Eunatia", "Sawubona, Eunatia", "Molo, Eunatia", "Goeiemôre, Eunatia", "Lumela, Eunatia"],
  ["Your inventory", "Impahla yakho", "Uluhlu lweempahla zakho", "Jou voorraad", "Thepa ea hao"],
  ["Your transactions", "Imisebenzi yakho", "Iintengiselwano zakho", "Jou transaksies", "Ditšebelisano tsa hao"],
  ["Your suppliers", "Abahlinzeki bakho", "Ababoneleli bakho", "Jou verskaffers", "Bafani ba hao"],
  ["Inventory", "Impahla", "Uluhlu lweempahla", "Voorraad", "Thepa"],
  ["Transactions", "Imisebenzi", "Iintengiselwano", "Transaksies", "Ditšebelisano"],
  ["Suppliers", "Abahlinzeki", "Ababoneleli", "Verskaffers", "Bafani"],
  ["Spending policy", "Inqubomgomo yokusebenzisa imali", "Umgaqo-nkqubo wenkcitho", "Bestedingsbeleid", "Leano la tšebeliso ea chelete"],
  ["Ring up a sale", "Faka ukuthengisa", "Bhalisa intengiso", "Teken ’n verkoop aan", "Ngolisa thekiso"],
  ["STORE ACCOUNT BALANCE", "Ibhalansi ye-akhawunti yesitolo", "Ibhalansi ye-akhawunti yevenkile", "WINKELREKENING-SALDO", "TEKANYO LA AKHAONTE EA LEBENKELE"],
  ["Deposit", "Faka imali", "Faka imali", "Deponeer", "Kenya chelete"],
  ["Withdraw", "Khipha imali", "Khupha imali", "Trek geld", "Ntša chelete"],
  ["CASH IN", "IMALI ENGENAYO", "IMALI ENGENAYO", "KONTANT IN", "CHELETE E KENANG"],
  ["CASH OUT", "IMALI EPHUMAYO", "IMALI EPHUMAYO", "KONTANT UIT", "CHELETE E TSOANG"],
  ["NET PROFIT", "INZUZO YONKE", "INZUZO EPHELELEYO", "NETTO WINS", "PHAKISO E SALANG"],
  ["AGENT SPENDING BUDGET", "ISABELOMALI SOKUSEBENZISA", "UHLAHLO-LWABIWO LOKUCHITHA", "AGENT SE BESTEDINGSBEGROTING", "TEKANYETSO EA TŠEBELISO EA MOEMELI"],
  ["Your shop is protected", "Isitolo sakho sivikelekile", "Ivenkile yakho ikhuselekile", "Jou winkel is beskerm", "Lebenkele la hao le sirelelitsoe"],
  ["Payments are checked by shop policy and recorded as simulations. No XRP is sent to XRPL.", "Izinkokhelo zihlolwa yimithetho yesitolo futhi zirekhodwa njengezilingiso. Ayikho i-XRP ethunyelwa ku-XRPL.", "Iintlawulo zijongwa yimigaqo yevenkile kwaye zirekhodwa njengezilingiso. Akukho XRP ithunyelwa kwi-XRPL.", "Betalings word volgens winkelbeleid nagegaan en as simulasies aangeteken. Geen XRP word na XRPL gestuur nie.", "Litefo li hlahlojoa ho latela leano la lebenkele ’me li ngoloa e le lipapiso. Ha ho XRP e romelloang ho XRPL."],
  ["View policy", "Buka inqubomgomo", "Jonga umgaqo-nkqubo", "Bekyk beleid", "Sheba leano"],
  ["Sales overview", "Uhlolojikelele lokuthengisa", "Isishwankathelo seentengiso", "Verkoopoorsig", "Kakaretso ea thekiso"],
  ["Your takings at a glance", "Imali oyitholayo ngokushesha", "Imali oyifumanayo ngokujonga nje", "Jou inkomste in ’n oogopslag", "Chelete eo u e fumanang ha bobebe"],
  ["Stock to watch", "Impahla okufanele uyibheke", "Impahla ekufuneka uyijongile", "Voorraad om dop te hou", "Thepa e lokelang ho shejoa"],
  ["Stay ahead of low and expiring items", "Bheka kusenesikhathi impahla encipha noma ephelelwa isikhathi", "Qaphela kwangethuba impahla encipha okanye ephelelwa lixesha", "Bly voor met lae en items wat verval", "Ela hloko thepa e ntseng e fokotseha kapa e felang ke nako"],
  ["View all inventory", "Buka yonke impahla", "Jonga yonke impahla", "Bekyk alle voorraad", "Sheba thepa eohle"],
  ["Recent activity", "Okwenzeke kamuva", "Izinto ezenzeke kutshanje", "Onlangse aktiwiteit", "Liketsahalo tsa morao tjena"],
  ["Your shop’s latest moves", "Imisebenzi yakamuva yesitolo sakho", "Imisebenzi yakutshanje yevenkile yakho", "Jou winkel se jongste aktiwiteit", "Liketso tsa morao-rao tsa lebenkele la hao"],
  ["All transactions", "Yonke imisebenzi", "Zonke iintengiselwano", "Alle transaksies", "Ditšebelisano tsohle"],
  ["Less waste, more profit.", "Ukumosha okuncane, inzuzo ethe xaxa.", "Inkunkuma encinci, inzuzo eninzi.", "Minder vermorsing, meer wins.", "Tšenyo e nyenyane, phaello e ngata."],
  ["Put your protection to the test", "Hlola ukuvikeleka kwakho", "Vavanya ukhuseleko lwakho", "Toets jou beskerming", "Leka tšireletso ea hao"],
  ["Simulate rogue AI attempt", "Lingisa umzamo we-AI ongagunyaziwe", "Linganisa umzamo we-AI ongagunyaziswanga", "Simuleer ’n ongemagtigde KI-poging", "Leka ketso ea AI e sa lumelloang"],
  ["Shop owner", "Umnikazi wesitolo", "Umnini wevenkile", "Winkeleienaar", "Mong’a lebenkele"],
  ["Notifications", "Izaziso", "Izaziso", "Kennisgewings", "Litsebiso"],
  ["Mark all read", "Maka konke njengokufundiwe", "Phawula zonke njengezifundiweyo", "Merk alles as gelees", "Tšoaea tsohle li baliloe"],
  ["WORKSPACE", "INDAWO YOKUSEBENZELA", "INDAWO YOKUSEBENZA", "WERKRUIMTE", "SEBAKA SA MOSEBETSI"],
  ["MANAGEMENT", "UKUPHATHA", "ULAWULO", "BESTUUR", "TSAMAISO"],
  ["Visit help centre", "Vakashela isikhungo sosizo", "Ndwendwela iziko loncedo", "Besoek hulpsentrum", "Etela setsi sa thuso"],
  ["Here for your hustle.", "Sikhona ukusiza ibhizinisi lakho.", "Silapha ukuxhasa ishishini lakho.", "Hier om jou besigheid te help.", "Re teng ho thusa khoebo ea hao."],
  ["Need a hand with your shop?", "Udinga usizo ngesitolo sakho?", "Ufuna uncedo ngevenkile yakho?", "Het jy hulp met jou winkel nodig?", "Na u hloka thuso ka lebenkele la hao?"],
  ["Here’s what’s happening at your shop today.", "Nakhu okwenzeka esitolo sakho namuhla.", "Nantsi into eyenzekayo evenkileni yakho namhlanje.", "Hier is wat vandag by jou winkel gebeur.", "Mona ke se etsahalang lebenkeleng la hao kajeno."],
  ["Know what’s on your shelves, what’s running low and what needs to go.", "Yazi okusemashalofini, okuphelayo nokufanele kususwe.", "Yazi okusezishelufini, okuphelayo nokufanele kususwe.", "Weet wat op jou rakke is, min raak en verwyder moet word.", "Tseba se lilulong, se fokolang le se lokelang ho tlosoa."],
  ["Every sale and supplier payment, all in one place.", "Konke ukuthengisa nezinkokhelo zabahlinzeki endaweni eyodwa.", "Zonke iintengiso neentlawulo zababoneleli kwindawo enye.", "Elke verkoop en verskafferbetaling op een plek.", "Thekiso le tefo tsa bafani sebakeng se le seng."],
  ["The people who keep your shelves stocked.", "Abantu abagcwalisa amashalofu akho.", "Abantu abagcwalisa iishelufu zakho.", "Die mense wat jou rakke vol hou.", "Batho ba tlatsang lishelefo tsa hao."],
  ["You set the rules. Spaza checks every payment against them.", "Wena ubeka imithetho. I-Spaza ihlola inkokhelo ngayinye.", "Wena ubeka imigaqo. I-Spaza ijonga intlawulo nganye.", "Jy stel die reëls. Spaza kontroleer elke betaling.", "U beha melao. Spaza e hlahloba tefo e ’ngoe le e ’ngoe."],
  ["A LITTLE SHOP SMARTS", "AMACEBO ESITOLO", "AMACEBO EVENKILE", "WINKELWENKE", "MALEBELA A LEBENKELE"],
  ["POLICY DEMO", "UKUZAMA IMITHETHO", "UVAVANYO LOMGAQO", "BELEID-DEMO", "TEKO EA LEANO"],
  ["Payment guardrails", "Imithetho yokuvikela izinkokhelo", "Imigaqo yokukhusela iintlawulo", "Betalingsreëls", "Melao ea tšireletso ea litefo"],
  ["Policy gate", "Ukuhlolwa kwemithetho", "Isango lomgaqo-nkqubo", "Beleidkontrole", "Tlhahlobo ea leano"],
  ["Kill switch", "Iswishi yokumisa", "Iswitshi yokumisa", "Noodskakelaar", "Konopo ea ho emisa"],
  ["Agent spending budget", "Isabelomali sokusebenzisa se-ejenti", "Uhlahlo-lwabiwo lwearhente", "Agent se bestedingsbegroting", "Tekanyetso ea tšebeliso ea moemeli"],
  ["Daily spend limit", "Umkhawulo wokusebenzisa wansuku zonke", "Umda wenkcitho wemihla ngemihla", "Daaglikse bestedingslimiet", "Moeli oa tšebeliso oa letsatsi le letsatsi"],
  ["Approved suppliers", "Abahlinzeki abagunyaziwe", "Ababoneleli abavunyiweyo", "Goedgekeurde verskaffers", "Bafani ba lumelletsoeng"],
  ["YOUR APPROVED SUPPLIERS", "Abahlinzeki bakho abagunyaziwe", "ABABONELELI BAKHO ABAVUNYIWEYO", "JOU GOEDGEKEURDE VERSKAFFERS", "BAFANI BA HAO BA LUMELLETSOENG"],
  ["Add supplier", "Faka umhlinzeki", "Yongeza umboneleli", "Voeg verskaffer by", "Kenya mofani"],
  ["Payments today", "Izinkokhelo zanamuhla", "Iintlawulo zanamhlanje", "Betalings vandag", "Litefo tsa kajeno"],
  ["Per payment limit", "Umkhawulo wenkokhelo ngayinye", "Umda wentlawulo nganye", "Limiet per betaling", "Moeli oa tefo ka ’ngoe"],
  ["Testnet address", "Ikheli le-Testnet", "Idilesi ye-Testnet", "Testnet-adres", "Aterese ea Testnet"],
  ["Edit details", "Hlela imininingwane", "Hlela iinkcukacha", "Wysig besonderhede", "Fetola lintlha"],
  ["Search activity…", "Sesha imisebenzi…", "Khangela iintengiselwano…", "Soek aktiwiteit…", "Batla liketsahalo…"],
  ["All activity", "Yonke imisebenzi", "Yonke imisebenzi", "Alle aktiwiteit", "Liketsahalo tsohle"],
  ["All products", "Yonke impahla", "Zonke iimveliso", "Alle produkte", "Lihlahisoa tsohle"],
  ["Search products…", "Sesha imikhiqizo…", "Khangela iimveliso…", "Soek produkte…", "Batla lihlahisoa…"],
  ["TOTAL PRODUCTS", "IMIKHIQIZO YONKE", "IIMVELISO ZONKE", "TOTAAL PRODUKTE", "LIHLAHISO TSOHLE"],
  ["LOW STOCK", "IMPAHLA ESEYINCANE", "IMPAHLA ESEZANTSI", "LAE VOORRAAD", "THEPA E NYENYANE"],
  ["EXPIRING SOON", "IZOPHELA MADUZE", "IZOPHELA KUNGEKUDALA", "VERVAL BINNEKORT", "E TLA FELLA KE NAKO"],
  ["EXPIRED", "EPHELELWE ISIKHATHI", "EPHELELWE LIXESHA", "VERVAL", "E FELLETSOENG KE NAKO"],
  ["Across your shop", "Kuso sonke isitolo", "Kuyo yonke ivenkile yakho", "Regdeur jou winkel", "Ho pholletsa le lebenkele la hao"],
  ["Reorder soon", "Oda futhi maduze", "Oda kwakhona kungekudala", "Bestel binnekort weer", "Odara hape haufinyane"],
  ["Not available for sale", "Akuthengiswa", "Ayithengiswa", "Nie beskikbaar vir verkoop nie", "Ha e rekisoe"],
  ["Low stock", "Impahla encane", "Impahla ephantsi", "Lae voorraad", "Thepa e nyenyane"],
  ["In stock", "Kukhona esitokweni", "Ikhona esitokhweni", "In voorraad", "E teng"],
  ["All caught up", "Konke sekuvuselelwe", "Konke kulungile ngoku", "Alles is op datum", "Tsohle li lokile"],
  ["New shop updates will show here.", "Izibuyekezo zesitolo zizovela lapha.", "Uhlaziyo lwevenkile luza kuvela apha.", "Nuwe winkelopdaterings sal hier verskyn.", "Lintlafatso tsa lebenkele li tla hlaha mona."],
  ["Test wallet", "Isikhwama se-Testnet", "I-wallet ye-Testnet", "Test-beursie", "Wallet ea Testnet"],
  ["Set up a test wallet", "Setha isikhwama se-Testnet", "Lungisa i-wallet ye-Testnet", "Stel ’n Test-beursie op", "Hlophisa wallet ea Testnet"],
  ["Top up with Test XRP", "Faka i-XRP yokuhlola", "Yongeza i-XRP yovavanyo", "Vul met Test-XRP aan", "Eketsa Test XRP"],
  ["Wallet top-up", "Ukufaka i-XRP esikhwameni", "Ukongeza i-XRP kwi-wallet", "Beursie-aanvulling", "Ho eketsa XRP wallet"],
  ["XRP top-ups", "Ukufakwa kwe-XRP", "Ukongezwa kwe-XRP", "XRP-aanvullings", "Keketso ea XRP"],
  ["Wallet withdrawals", "Ukukhishwa esikhwameni", "Ukukhutshwa kwi-wallet", "Beursie-onttrekkings", "Ho ntšoa ho wallet"],
  ["Create & fund test wallet", "Dala futhi ufake imali esikhwameni sokuhlola", "Yenza uze ufake imali kwi-wallet yovavanyo", "Skep en vul die toetsbeursie", "Etsa le ho kenya chelete wallet ea teko"],
  ["Withdraw XRP", "Khipha i-XRP", "Khupha i-XRP", "Trek XRP", "Ntša XRP"],
  ["Withdraw XRP to another wallet", "Thumela i-XRP kwenye i-wallet", "Thumela i-XRP kwenye i-wallet", "Trek XRP na ’n ander beursie", "Romela XRP ho wallet e ’ngoe"],
  ["Recipient Testnet address", "Ikheli lomamukeli le-Testnet", "Idilesi ye-Testnet yomamkeli", "Testnet-adres van ontvanger", "Aterese ea Testnet ea moamoheli"],
  ["Amount (XRP)", "Inani (XRP)", "Isixa (XRP)", "Bedrag (XRP)", "Chelete (XRP)"],
  ["Check withdrawal", "Hlola ukukhishwa", "Jonga ukukhutshwa", "Gaan onttrekking na", "Hlahloba ho ntša"],
  ["Approve & withdraw XRP", "Vuma bese ukhipha i-XRP", "Vuma uze ukhuphe i-XRP", "Keur goed en trek XRP", "Amohela ’me u ntše XRP"],
  ["Pay supplier", "Khokhela umhlinzeki", "Hlawula umboneleli", "Betaal verskaffer", "Lefa mofani"],
  ["Pay a supplier", "Khokhela umhlinzeki", "Hlawula umboneleli", "Betaal ’n verskaffer", "Lefa mofani"],
  ["Payment method", "Indlela yokukhokha", "Indlela yokuhlawula", "Betaalmetode", "Mokhoa oa tefo"],
  ["XRPL Testnet wallet address", "Ikheli lesikhwama se-XRPL Testnet", "Idilesi ye-wallet ye-XRPL Testnet", "XRPL Testnet-beursieadres", "Aterese ea wallet ea XRPL Testnet"],
  ["Supplier x402 HTTPS URL", "Ikheli le-HTTPS le-x402 lomhlinzeki", "I-URL ye-HTTPS ye-x402 yomboneleli", "Verskaffer se x402-HTTPS-URL", "URL ea HTTPS ea x402 ea mofani"],
  ["x402 service · Oracle check first", "Isevisi ye-x402 · hlola kuqala", "Inkonzo ye-x402 · jonga kuqala", "x402-diens · kontroleer eers", "Tšebeletso ea x402 · hlahloba pele"],
  ["Confirm & pay supplier", "Qinisekisa bese ukhokhela umhlinzeki", "Qinisekisa uze uhlawule umboneleli", "Bevestig en betaal verskaffer", "Netefatsa ’me u lefe mofani"],
  ["Confirm demo payment", "Qinisekisa inkokhelo yokuzama", "Qinisekisa intlawulo yovavanyo", "Bevestig demo-betaling", "Netefatsa tefo ea teko"],
  ["Check payment", "Hlola inkokhelo", "Jonga intlawulo", "Kontroleer betaling", "Hlahloba tefo"],
  ["Wallet address", "Ikheli lesikhwama", "Idilesi ye-wallet", "Beursieadres", "Aterese ea wallet"],
  ["Optional · not added", "Ongakukhetha · akufakiwe", "Ungayikhetha · ayongezwanga", "Opsioneel · nie bygevoeg nie", "Ha ho hlokahale · ha ea kenngoa"],
  ["Add wallet address", "Faka ikheli lesikhwama", "Yongeza idilesi ye-wallet", "Voeg beursieadres by", "Kenya aterese ea wallet"],
  ["XRPL Testnet preflight passed", "Ukuhlola kwangaphambi kokuthumela kwe-XRPL Testnet kuphumelele", "Ukuhlolwa kwe-XRPL Testnet kuphumelele", "XRPL Testnet-voorafkontrole geslaag", "Tlhahlobo ea pele ea XRPL Testnet e atlehile"],
  ["I checked the supplier, method and amount, and approve this Testnet payment.", "Ngihlole umhlinzeki, indlela nenani, futhi ngiyavuma le nkokhelo ye-Testnet.", "Ndijonge umboneleli, indlela nesixa, kwaye ndiyavuma le ntlawulo ye-Testnet.", "Ek het die verskaffer, metode en bedrag nagegaan en keur hierdie Testnet-betaling goed.", "Ke hlahlobile mofani, mokhoa le chelete, ’me ke amohela tefo ena ea Testnet."],
  ["I checked the supplier and amount, and approve this demo payment.", "Ngihlole umhlinzeki nenani, futhi ngiyavuma le nkokhelo yokuzama.", "Ndijonge umboneleli nesixa, kwaye ndiyavuma le ntlawulo yovavanyo.", "Ek het die verskaffer en bedrag nagegaan en keur hierdie demo-betaling goed.", "Ke hlahlobile mofani le chelete, ’me ke amohela tefo ena ea teko."],
].map(([en, zu, xh, af, st]) => [en, { zu, xh, af, st }]));
const extendedTranslations = {
  "Overview": { sw: "Muhtasari", ha: "Bayani", yo: "Akopọ", fr: "Aperçu", pt: "Visão geral" },
  "Inventory": { sw: "Hesabu ya bidhaa", ha: "Kayan kaya", yo: "Ọjà inú ilé", fr: "Inventaire", pt: "Inventário" },
  "Transactions": { sw: "Miamala", ha: "Mu'amaloli", yo: "Àwọn ìṣòwò", fr: "Transactions", pt: "Transações" },
  "Suppliers": { sw: "Wasambazaji", ha: "Masu kaya", yo: "Àwọn olùpèsè", fr: "Fournisseurs", pt: "Fornecedores" },
  "Your inventory": { sw: "Hesabu ya bidhaa zako", ha: "Kayan kantin ku", yo: "Ọjà inú ilé rẹ", fr: "Votre inventaire", pt: "O seu inventário" },
  "Your transactions": { sw: "Miamala yako", ha: "Mu'amalolin ku", yo: "Àwọn ìṣòwò rẹ", fr: "Vos transactions", pt: "As suas transações" },
  "Your suppliers": { sw: "Wasambazaji wako", ha: "Masu kawo kaya", yo: "Àwọn olùpèsè rẹ", fr: "Vos fournisseurs", pt: "Os seus fornecedores" },
  "Search products…": { sw: "Tafuta bidhaa…", ha: "Nemi kaya…", yo: "Wá ọjà…", fr: "Rechercher des produits…", pt: "Pesquisar produtos…" },
  "All products": { sw: "Bidhaa zote", ha: "Duk kaya", yo: "Gbogbo ọjà", fr: "Tous les produits", pt: "Todos os produtos" },
  "IN STOCK": { sw: "ZIPO STOKI", ha: "AKWAI A STOCI", yo: "Ó WÀ NÍLẸ̀ ỌJÀ", fr: "EN STOCK", pt: "EM STOCK" },
  "OUT OF STOCK": { sw: "ZIMEKWISHA", ha: "BA A DA SU BA", yo: "Ó TI TAN", fr: "EN RUPTURE", pt: "ESGOTADO" },
  "EXPIRING SOON": { sw: "ZINAISHA KARIBUNI", ha: "KAYAN DA ZA SU KARE BA DA DAƊE BA", yo: "Ó ṢE KÙ DÉ ÀKÓKÒ RẸ̀", fr: "BIENTÔT PÉRIMÉS", pt: "A EXPIRAR EM BREVE" },
  "EXPIRED": { sw: "ZIMEISHA MUDA", ha: "SUN KARE", yo: "Ó TI KÓJÁ ÀKÓKÒ", fr: "PÉRIMÉS", pt: "EXPIRADOS" },
  "Add item": { sw: "Ongeza bidhaa", ha: "Ƙara kaya", yo: "Fi ọjà kún un", fr: "Ajouter un article", pt: "Adicionar produto" },
  "Add supplier": { sw: "Ongeza msambazaji", ha: "Ƙara mai kaya", yo: "Fi olùpèsè kún un", fr: "Ajouter un fournisseur", pt: "Adicionar fornecedor" },
  "Deposit": { sw: "Weka pesa", ha: "Ajiye kuɗi", yo: "Fi owó sínú", fr: "Déposer", pt: "Depositar" },
  "Withdraw": { sw: "Toa pesa", ha: "Cire kuɗi", yo: "Yọ owó jáde", fr: "Retirer", pt: "Levantar" },
  "Shop owner": { sw: "Mmiliki wa duka", ha: "Mai kantin", yo: "Olówó ilé ìtajà", fr: "Propriétaire", pt: "Proprietário da loja" },
  "Edit details": { sw: "Hariri maelezo", ha: "Gyara bayanai", yo: "Ṣàtúnṣe àlàyé", fr: "Modifier les détails", pt: "Editar detalhes" },
  "Search activity…": { sw: "Tafuta shughuli…", ha: "Nemi ayyuka…", yo: "Wá ìṣe…", fr: "Rechercher une activité…", pt: "Pesquisar atividade…" },
  "LOW STOCK": { sw: "STOKI NDOGO", ha: "KAYAN SUN RAGU", yo: "ỌJÀ KÉRÉ KU" , fr: "STOCK BAS", pt: "STOCK BAIXO" },
  "Know what’s on your shelves, what’s running low and what needs to go.": { sw: "Jua bidhaa zilizo dukani, zinazopungua na zinazohitaji kuondolewa.", ha: "Ku san kayan da ke kantinku, masu raguwa na waɗanda ya kamata a cire.", yo: "Mọ ohun tó wà nílé ìtajà rẹ, èyí tó ń dín kù àti èyí tó yẹ kí a yọ kúrò.", fr: "Suivez vos stocks, les produits bientôt épuisés et ceux à retirer.", pt: "Acompanhe os produtos disponíveis, os que estão a acabar e os que devem ser retirados." },
  "Available items": { sw: "Bidhaa zinazopatikana", ha: "Kayan da ake da su", yo: "Ọjà tó wà nílẹ̀", fr: "Articles disponibles", pt: "Produtos disponíveis" },
  "Restock to sell": { sw: "Ongeza bidhaa ili uuze", ha: "Sake kawo kaya don sayarwa", yo: "Tun ọjà kún un kí o lè tà á", fr: "Réapprovisionner pour vendre", pt: "Repor para vender" },
  "Within 5 days": { sw: "Ndani ya siku 5", ha: "Cikin kwanaki 5", yo: "Láàárín ọjọ́ márùn-ún", fr: "Dans les 5 jours", pt: "Nos próximos 5 dias" },
  "Remove from sale": { sw: "Ondoa kwenye mauzo", ha: "Cire daga sayarwa", yo: "Yọ kúrò nínú títà", fr: "Retirer de la vente", pt: "Retirar da venda" },
  "In stock": { sw: "Ipo stoki", ha: "Akwai a sito", yo: "Ó wà nílẹ̀ ọjà", fr: "En stock", pt: "Em stock" },
  "Out of stock": { sw: "Imeisha stoki", ha: "Ya ƙare a sito", yo: "Ó ti tán nílẹ̀ ọjà", fr: "En rupture de stock", pt: "Sem stock" },
  "Low stock": { sw: "Stoki ndogo", ha: "Kayan sun yi kaɗan", yo: "Ọjà ti ń dín kù", fr: "Stock bas", pt: "Stock baixo" },
  "Expiring soon": { sw: "Zinaisha karibuni", ha: "Za su ƙare ba da daɗewa ba", yo: "Ó fẹ́ kọjá àkókò rẹ̀ láìpẹ́", fr: "Bientôt périmés", pt: "A expirar em breve" },
  "Product": { sw: "Bidhaa", ha: "Kaya", yo: "Ọjà", fr: "Produit", pt: "Produto" },
  "On hand": { sw: "Iliyopo", ha: "Adadin da ake da shi", yo: "Iye tó wà", fr: "En stock", pt: "Disponível" },
  "Best before": { sw: "Tumia kabla ya", ha: "Mafi kyau kafin", yo: "Ó dára jù kí ó tó", fr: "À consommer avant", pt: "Consumir de preferência antes de" },
  "Selling price": { sw: "Bei ya kuuza", ha: "Farashin sayarwa", yo: "Iye títà", fr: "Prix de vente", pt: "Preço de venda" },
  "Status": { sw: "Hali", ha: "Matsayi", yo: "Ipò", fr: "Statut", pt: "Estado" },
  "Actions": { sw: "Vitendo", ha: "Ayyuka", yo: "Àwọn ìṣe", fr: "Actions", pt: "Ações" },
  "Showing 5 of 5 products": { sw: "Inaonyesha bidhaa 5 kati ya 5", ha: "Ana nuna kaya 5 cikin 5", yo: "Ó ń fi ọjà márùn-ún nínú márùn-ún hàn", fr: "5 produits affichés sur 5", pt: "A mostrar 5 de 5 produtos" },
};
Object.assign(extendedTranslations, {
  "Pay supplier": { sw: "Lipa msambazaji", ha: "Biya wa mai kaya", yo: "Sanwó fún olùpèsè", fr: "Payer le fournisseur", pt: "Pagar ao fornecedor" },
  "Pay a supplier": { sw: "Lipa msambazaji", ha: "Biya wa mai kaya", yo: "Sanwó fún olùpèsè", fr: "Payer un fournisseur", pt: "Pagar a um fornecedor" },
  "Payment method": { sw: "Njia ya malipo", ha: "Hanyar biyan kuɗi", yo: "Ọ̀nà ìsanwó", fr: "Mode de paiement", pt: "Método de pagamento" },
  "XRPL Testnet wallet address": { sw: "Anwani ya pochi ya XRPL Testnet", ha: "Adireshin walat na XRPL Testnet", yo: "Àdírẹ́sì àpamọ́ XRPL Testnet", fr: "Adresse du portefeuille XRPL Testnet", pt: "Endereço da carteira XRPL Testnet" },
  "Supplier x402 HTTPS URL": { sw: "URL ya HTTPS ya x402 ya msambazaji", ha: "URL na HTTPS na x402 na mai kaya", yo: "URL HTTPS x402 ti olùpèsè", fr: "URL HTTPS x402 du fournisseur", pt: "URL HTTPS x402 do fornecedor" },
  "x402 service · Oracle check first": { sw: "Huduma ya x402 · kagua kwanza", ha: "Sabis na x402 · fara da dubawa", yo: "Iṣẹ́ x402 · kọ́kọ́ ṣàyẹ̀wò", fr: "Service x402 · vérification préalable", pt: "Serviço x402 · verificar primeiro" },
  "Confirm & pay supplier": { sw: "Thibitisha na umlipe msambazaji", ha: "Tabbatar sannan ka biya mai kaya", yo: "Jẹ́rìí kí o sì sanwó fún olùpèsè", fr: "Confirmer et payer le fournisseur", pt: "Confirmar e pagar ao fornecedor" },
  "Confirm demo payment": { sw: "Thibitisha malipo ya majaribio", ha: "Tabbatar da biyan gwaji", yo: "Jẹ́rìí sí ìsanwó àdánwò", fr: "Confirmer le paiement de démonstration", pt: "Confirmar pagamento de demonstração" },
  "Check payment": { sw: "Kagua malipo", ha: "Duba biyan kuɗi", yo: "Ṣàyẹ̀wò ìsanwó", fr: "Vérifier le paiement", pt: "Verificar pagamento" },
  "Wallet address": { sw: "Anwani ya pochi", ha: "Adireshin walat", yo: "Àdírẹ́sì àpamọ́", fr: "Adresse du portefeuille", pt: "Endereço da carteira" },
  "Optional · not added": { sw: "Si lazima · haijaongezwa", ha: "Na zaɓi · ba a ƙara ba", yo: "Kò pọn dandan · a kò fi kún un", fr: "Facultatif · non renseigné", pt: "Opcional · não adicionado" },
  "Add wallet address": { sw: "Ongeza anwani ya pochi", ha: "Ƙara adireshin walat", yo: "Fi àdírẹ́sì àpamọ́ kún un", fr: "Ajouter une adresse de portefeuille", pt: "Adicionar endereço da carteira" },
  "XRPL Testnet preflight passed": { sw: "Ukaguzi wa awali wa XRPL Testnet umefaulu", ha: "Binciken farko na XRPL Testnet ya yi nasara", yo: "Àyẹ̀wò ìbẹ̀rẹ̀ XRPL Testnet ṣe àṣeyọrí", fr: "Vérifications préalables XRPL Testnet réussies", pt: "Verificações prévias do XRPL Testnet aprovadas" },
  "x402 Oracle check passed · XRPL preflight passed": { sw: "Ukaguzi wa x402 na XRPL Testnet umefaulu", ha: "Dubawar x402 da XRPL Testnet ta yi nasara", yo: "Àyẹ̀wò x402 àti XRPL ṣàṣeyọrí", fr: "Vérification x402 et contrôles XRPL réussis", pt: "Verificação x402 e controlos XRPL aprovados" },
  "I checked the supplier, method and amount, and approve this Testnet payment.": { sw: "Nimehakiki msambazaji, njia na kiasi, na ninaidhinisha malipo haya ya Testnet.", ha: "Na duba mai kaya, hanya da adadin kuɗi, kuma na amince da wannan biyan Testnet.", yo: "Mo ti ṣàyẹ̀wò olùpèsè, ọ̀nà àti iye owó; mo sì fọwọ́ sí ìsanwó Testnet yìí.", fr: "J’ai vérifié le fournisseur, le mode et le montant, et j’approuve ce paiement Testnet.", pt: "Verifiquei o fornecedor, o método e o montante e aprovo este pagamento Testnet." },
  "I checked the supplier and amount, and approve this demo payment.": { sw: "Nimehakiki msambazaji na kiasi, na ninaidhinisha malipo haya ya majaribio.", ha: "Na duba mai kaya da adadin kuɗi, kuma na amince da wannan biyan gwaji.", yo: "Mo ti ṣàyẹ̀wò olùpèsè àti iye owó, mo sì fọwọ́ sí ìsanwó àdánwò yìí.", fr: "J’ai vérifié le fournisseur et le montant, et j’approuve ce paiement de démonstration.", pt: "Verifiquei o fornecedor e o montante e aprovo este pagamento de demonstração." },
});
const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
const localeFor = () => languageLocales[currentLanguage] || "en-ZA";
function translatePage(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const original = originalTextNodes.get(node) ?? node.nodeValue;
    originalTextNodes.set(node, original);
    const leading = original.match(/^\s*/)?.[0] || ""; const trailing = original.match(/\s*$/)?.[0] || "";
    const phrase = original.trim(); if (!phrase) continue;
    const translated = localizedText[phrase]?.[currentLanguage] || extendedTranslations[phrase]?.[currentLanguage] || phrase;
    const value = `${leading}${translated}${trailing}`;
    if (node.nodeValue !== value) node.nodeValue = value;
  }
  for (const element of root.querySelectorAll?.("[aria-label], [placeholder], [title]") || []) {
    let originals = originalAttributes.get(element); if (!originals) { originals = {}; originalAttributes.set(element, originals); }
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      if (!element.hasAttribute(attribute)) continue;
      const original = originals[attribute] ?? element.getAttribute(attribute); originals[attribute] = original;
      element.setAttribute(attribute, localizedText[original]?.[currentLanguage] || extendedTranslations[original]?.[currentLanguage] || original);
    }
  }
}
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const zar = (amount) => `R ${Number(amount).toLocaleString(localeFor(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const zarStat = (amount) => {
  const parts = new Intl.NumberFormat(localeFor(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(Number(amount));
  const whole = parts.filter((part) => part.type === "integer" || part.type === "group").map((part) => part.value).join("");
  const cents = parts.find((part) => part.type === "fraction")?.value || "00";
  const sign = parts.find((part) => part.type === "minusSign")?.value || "";
  return `R ${sign}${whole}<span class="stat-cents">,${cents}</span>`;
};
function save() {
  localStorage.setItem("spaza-demo-state", JSON.stringify(state));
  localStorage.setItem("spaza-demo-policy", JSON.stringify(policy));
  if (apiOnline && !loadingBackend) {
    clearTimeout(apiSyncTimer);
    apiSyncTimer = setTimeout(() => syncStateRemote().catch(() => {}), 180);
  }
}
async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : result.detail?.message || JSON.stringify(result.detail) || result.message || `Local service returned ${response.status}.`);
  return result;
}
async function syncStateRemote() {
  if (!apiOnline || loadingBackend) return;
  clearTimeout(apiSyncTimer);
  return apiRequest("/state", { method: "PUT", body: JSON.stringify({ state, policy }) });
}
async function connectLocalService() {
  loadingBackend = true;
  try {
    if (!API_KEY) {
      demoMode = true; apiOnline = false;
      walletInfo = { configured: false, connected: false, network: "testnet", simulated: false, balance_xrp: null, address: null, error: "Start the local service to connect to XRPL Testnet." };
      updateWalletStatusUI(); updateStats(); renderDashboard(); renderNotifications(); updateLinkedAccountSummary();
      await refreshExchangeRates();
      return;
    }
    const health = await apiRequest("/health");
    const remote = await apiRequest("/state");
    apiOnline = true;
    demoMode = true;
    walletInfo = health.wallet || walletInfo;
    if (remote.state) {
      const savedState = { ...remote.state }; upgradeSpendingState(savedState);
      state = { ...initialState, ...savedState };
      if (remote.policy) policy = { ...policy, ...remote.policy, dailyCap: 100 };
      addDemoAnalyticsHistory(state);
      await apiRequest("/state", { method: "PUT", body: JSON.stringify({ state, policy }) });
    } else {
      addDemoAnalyticsHistory(state);
      await apiRequest("/state", { method: "PUT", body: JSON.stringify({ state, policy }) });
    }
    if (!state.ownerName || state.ownerName === "Thandi Ndlovu") state.ownerName = "Eunatia Ngobeni";
    if (!state.shopName) state.shopName = "The Digital Mark Spaza Shop";
    updateIdentity();
    updateWalletStatusUI();
    localStorage.setItem("spaza-demo-state", JSON.stringify(state));
    localStorage.setItem("spaza-demo-policy", JSON.stringify(policy));
    updateStats(); renderDashboard(); renderNotifications();
    await refreshExchangeRates();
    updateLinkedAccountSummary();
    await handlePaystackReturn();
    if (activePage !== "dashboard") goTo(activePage);
  } catch {
    apiOnline = false;
    demoMode = true;
    walletInfo = { configured: false, connected: false, network: "testnet", simulated: false, balance_xrp: null, address: null, error: "Local XRPL service could not be reached. Start it and refresh." };
    updateWalletStatusUI(); updateStats(); renderDashboard(); renderNotifications(); updateLinkedAccountSummary();
    await refreshExchangeRates();
  } finally {
    loadingBackend = false;
  }
}
function updateWalletStatusUI() {
  const label = $("#network-label"); const tag = $("#demo-tag");
  if (!label || !tag) return;
  if (walletInfo.simulated) { label.textContent = "Demo wallet"; tag.textContent = `${Number(walletInfo.balance_xrp || 0).toFixed(2)} XRP · DEMO`; label.title = "Simulated XRP wallet · no XRPL transaction will be sent"; }
  else { label.textContent = walletInfo.connected ? "XRPL Testnet" : "Testnet setup"; tag.textContent = walletInfo.connected ? `${Number(walletInfo.balance_xrp || 0).toFixed(2)} XRP` : walletInfo.configured ? "OFFLINE" : "WALLET NEEDED"; label.title = walletInfo.connected ? `Testnet wallet ${walletInfo.address}` : walletInfo.error || "Click to set up a Testnet-only wallet"; }
}
function updateIdentity() {
  $("#shop-name").innerHTML = `${escapeHTML(state.shopName || "The Digital Mark Spaza Shop")}<small>Johannesburg, GP</small>`;
  $("#profile-name").innerHTML = `${escapeHTML(state.ownerName || "Eunatia Ngobeni")}<small>Shop owner</small>`;
  const initials = (state.ownerName || "Eunatia Ngobeni").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  $(".profile-avatar").textContent = initials; $(".topbar-avatar").textContent = initials;
  $("#page-title").innerHTML = `Good morning, ${escapeHTML((state.ownerName || "Eunatia Ngobeni").split(/\s+/)[0])} <span class="wave">✳</span>`;
}
function renderExchangeRate() {
  const selector = $("#fx-currency"); if (!selector) return;
  if (exchangeRates) for (const option of [...selector.options]) option.hidden = !(option.value in exchangeRates.rates);
  if (![...selector.options].some(option => option.value === selectedFxCurrency && !option.hidden)) selectedFxCurrency = "zar";
  selector.value = selectedFxCurrency;
  const rate = exchangeRates?.rates?.[selectedFxCurrency];
  const amount = Math.max(0, Number($("#fx-amount")?.value || 1));
  $("#fx-rate-value").textContent = rate ? `${amount.toLocaleString(localeFor(), { maximumFractionDigits: 6 })} XRP ≈ ${new Intl.NumberFormat(localeFor(), { style: "currency", currency: selectedFxCurrency.toUpperCase(), maximumFractionDigits: 2 }).format(amount * rate)}` : "Live quote unavailable";
  if (exchangeRates?.updated_at) {
    const date = new Date(exchangeRates.updated_at * 1000);
    const fiatDate = exchangeRates.fx_updated_at ? new Intl.DateTimeFormat(localeFor(), { dateStyle: "medium" }).format(new Date(exchangeRates.fx_updated_at * 1000)) : "date unavailable";
    const updated = new Intl.DateTimeFormat(localeFor(), { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(date);
    const source = exchangeRates.source ? ` · ${exchangeRates.source}` : "";
    const directSpot = String(exchangeRates.source || "").includes("CoinGecko live");
    $("#fx-rate-status").textContent = exchangeRates.stale ? `Last live quote${source} · XRP updated ${updated} · refresh unavailable` : directSpot ? `Live XRP market quote${source} · updated ${updated}` : `Live market estimate${source} · XRP updated ${updated} · local currency reference ${fiatDate}`;
  } else $("#fx-rate-status").textContent = "Live rate unavailable · check your internet connection and refresh.";
  updateModalFxQuote("pay-amount", "pay-amount-fx"); updateModalFxQuote("withdraw-amount", "withdraw-amount-fx");
  const invested = Number(state.xrpInvestmentXrp || 0); const investZar = Number(state.xrpInvestmentZar || 0);
  $("#investment-summary").textContent = invested > 0 ? `Recorded demo allocations: ${invested.toFixed(6)} XRP · ${zar(investZar)} at the rates used when approved.` : "No profit allocated to XRP yet.";
}
function fxQuoteText(amount) {
  const rate = exchangeRates?.rates?.[selectedFxCurrency];
  if (!rate || !Number.isFinite(amount) || amount <= 0) return "Local-currency estimate unavailable";
  return `Estimated value: ${new Intl.NumberFormat(localeFor(), { style: "currency", currency: selectedFxCurrency.toUpperCase(), maximumFractionDigits: 2 }).format(amount * rate)} · indicative market rate`;
}
function updateModalFxQuote(inputId, outputId) {
  const input = $(`#${inputId}`); const output = $(`#${outputId}`);
  if (input && output) output.textContent = fxQuoteText(Number(input.value));
}
async function refreshExchangeRates(force = false) {
  const previousRates = exchangeRates;
  try {
    exchangeRates = await apiRequest(`/rates${force ? "?refresh=true" : ""}`);
    if (exchangeRates.stale) {
      try { exchangeRates = await fetchDirectLiveRates(); }
      catch { /* Retain the last dated market quote, if one exists. */ }
    }
  } catch {
    try { exchangeRates = await fetchDirectLiveRates(); }
    catch { exchangeRates = previousRates || { rates: {}, stale: true }; }
  }
  const hasDatedLiveQuote = (quote) => Number(quote?.rates?.zar) > 0 && Number.isFinite(Number(quote?.updated_at));
  if (hasDatedLiveQuote(exchangeRates) && !exchangeRates.stale) {
    try { localStorage.setItem("spaza-last-live-rates", JSON.stringify(exchangeRates)); } catch {}
  } else {
    let cached = hasDatedLiveQuote(previousRates) ? previousRates : null;
    try {
      const savedQuote = JSON.parse(localStorage.getItem("spaza-last-live-rates") || "null");
      if (!cached && hasDatedLiveQuote(savedQuote)) cached = savedQuote;
    } catch {}
    exchangeRates = cached
      ? { ...cached, stale: true, source: `${cached.source || "market source"} · saved quote` }
      : { rates: {}, stale: true };
  }
  renderExchangeRate();
  updateLinkedAccountSummary();
}
async function fetchDirectLiveRates() {
  const codes = ["zar", "ngn", "kes", "ghs", "egp", "ugx", "tzs", "zmw", "bwp", "nad", "lsl", "szl", "xof", "xaf"];
  const fetchNoCache = async (url) => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try { return await fetch(url, { cache: "no-store", signal: controller.signal }); }
    finally { clearTimeout(timer); }
  };
  try {
    const response = await fetchNoCache(`https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=${codes.join(",")}&include_last_updated_at=true`);
    if (!response.ok) throw new Error("CoinGecko unavailable");
    const payload = (await response.json()).ripple; const rates = {};
    for (const code of codes) { const value = Number(payload?.[code]); if (Number.isFinite(value) && value > 0) rates[code] = value; }
    if (!rates.zar) throw new Error("Live XRP/ZAR quote unavailable");
    const updatedAt = Number(payload?.last_updated_at) || Math.floor(Date.now() / 1000);
    return { rates, rate_zar_per_xrp: rates.zar, updated_at: updatedAt, fx_updated_at: null, currencies: Object.keys(rates), source: "CoinGecko live XRP/local-currency market quote", stale: Date.now() / 1000 - updatedAt > 180 };
  } catch {
    let usd; let updatedAt;
    const response = await fetchNoCache("https://api.coinpaprika.com/v1/tickers/xrp-xrp");
    if (!response.ok) throw new Error("Live crypto quote unavailable");
    const payload = await response.json(); usd = Number(payload?.quotes?.USD?.price);
    updatedAt = payload?.last_updated ? Math.floor(new Date(payload.last_updated).getTime() / 1000) : Math.floor(Date.now() / 1000);
    if (!Number.isFinite(usd) || usd <= 0) throw new Error("Live XRP/USD quote unavailable");
    const fiatResponse = await fetchNoCache("https://open.er-api.com/v6/latest/USD");
    if (!fiatResponse.ok) throw new Error("Live currency quote unavailable");
    const fiatData = await fiatResponse.json(); const rates = {};
    for (const code of codes) {
      const value = Number(fiatData.rates?.[code.toUpperCase()]);
      if (Number.isFinite(value) && value > 0) rates[code] = usd * value;
    }
    if (!rates.zar) throw new Error("Live XRP/ZAR quote unavailable");
    return { rates, rate_zar_per_xrp: rates.zar, updated_at: updatedAt, fx_updated_at: fiatData.time_last_update_unix, currencies: Object.keys(rates), source: "CoinPaprika XRP/USD + ExchangeRate-API local-currency reference", stale: false };
  }
}
function updateLinkedAccountSummary() {
  const balance = Number(walletInfo.balance_xrp || 0);
  const pendingOut = Math.max(0, Number(walletInfo.pending_outgoing_xrp || 0));
  const balanceNode = $("#linked-wallet-balance"); const valueNode = $("#linked-wallet-value");
  if (!balanceNode || !valueNode) return;
  if (!walletInfo.configured) { balanceNode.textContent = "Connect a Testnet wallet"; valueNode.textContent = "XRP deposits are Testnet only"; return; }
  if (!walletInfo.connected) { balanceNode.textContent = "Wallet offline"; valueNode.textContent = "Reconnect to refresh the Testnet balance"; return; }
  balanceNode.textContent = pendingOut > 0 ? `${Math.max(0, balance - pendingOut).toFixed(6)} XRP available` : `${balance.toFixed(6)} XRP`;
  const rate = exchangeRates?.rates?.zar;
  valueNode.textContent = pendingOut > 0 ? `${balance.toFixed(6)} XRP confirmed · ${pendingOut.toFixed(6)} pending send` : rate ? `Demo estimate ${zar(balance * rate)} · no cash value` : "Demo XRP · live quote unavailable";
}
async function handlePaystackReturn() {
  const url = new URL(window.location.href); const reference = url.searchParams.get("paystack_reference");
  if (!reference || !apiOnline) return;
  showToast("Checking card payment", "Confirming the checkout with Paystack before updating your store account.");
  try {
    const result = await apiRequest(`/paystack/deposit/verify?reference=${encodeURIComponent(reference)}`);
    url.searchParams.delete("paystack_reference"); history.replaceState({}, "", url.pathname + url.search + url.hash);
    if (result.status === "credited") {
      const remote = await apiRequest("/state"); if (remote.state) state = { ...initialState, ...remote.state };
      persistRender(); showToast("Card payment verified", `${zar(result.amount_zar)} was added to the store account.`);
    } else showToast("Payment not confirmed", "Paystack has not confirmed a successful payment. The store balance was not changed.", true);
  } catch (error) { showToast("Could not confirm payment", error.message, true); }
}
function openXrpInvestmentModal() {
  const rate = exchangeRates?.rates?.zar;
  if (!rate) { showToast("Rate unavailable", "Refresh XRP/ZAR before planning an allocation.", true); return; }
  const availableProfit = Math.max(0, Math.min(Number(state.cashIn || 0) - Number(state.cashOut || 0), Number(state.storeBalance || 0)));
  openModal({ kicker: "OWNER APPROVAL · XRP ALLOCATION", title: "Allocate shop profit to XRP", copy: `Available profit: ${zar(availableProfit)}. Enter a ZAR amount to see its estimated XRP value. This records a demo allocation only; XRPL Testnet XRP has no cash value and this does not buy real XRP.`, submit: "Approve demo allocation", fields: `<div class="form-field"><label for="invest-zar-amount">Profit to allocate (ZAR)</label><input id="invest-zar-amount" type="number" min="0.01" step="0.01" max="${availableProfit.toFixed(2)}" value="${Math.min(availableProfit, 100).toFixed(2)}"/><span class="form-hint">Available from net profit and store balance: ${zar(availableProfit)}</span><span class="form-hint" id="invest-xrp-estimate">Estimated XRP: —</span></div><p class="form-hint">Rate: 1 XRP ≈ ${zar(rate)} · indicative only</p>`, onSubmit: (root) => {
    const amountZar = Number($("#invest-zar-amount", root).value); const currentProfit = Math.max(0, Math.min(Number(state.cashIn || 0) - Number(state.cashOut || 0), Number(state.storeBalance || 0)));
    if (!Number.isFinite(amountZar) || amountZar <= 0 || amountZar > currentProfit) { $("#modal-error").textContent = `Enter an amount up to the available profit of ${zar(currentProfit)}.`; return; }
    const xrpAmount = amountZar / rate;
    state.storeBalance -= amountZar; state.cashOut += amountZar; state.xrpInvestmentZar = Number(state.xrpInvestmentZar || 0) + amountZar; state.xrpInvestmentXrp = Number(state.xrpInvestmentXrp || 0) + xrpAmount;
    state.transactions.unshift({ title: "Profit allocated to XRP", detail: `${zar(amountZar)} · estimated ${xrpAmount.toFixed(6)} XRP`, type: "XRP investment", amount: -amountZar, xrpAmount, time: "Just now", icon: "◇", status: "Demo estimate · not purchased" });
    persistRender(); renderExchangeRate(); closeModal(); showToast("Demo allocation recorded", `${zar(amountZar)} · estimated ${xrpAmount.toFixed(6)} XRP. No real XRP was purchased.`);
  }});
  const amountInput = $("#invest-zar-amount");
  amountInput.addEventListener("input", () => { const value = Number(amountInput.value); $("#invest-xrp-estimate").textContent = Number.isFinite(value) && value > 0 ? `Estimated allocation: ${(value / rate).toFixed(6)} XRP` : "Estimated XRP: —"; });
  amountInput.dispatchEvent(new Event("input"));
}
const daysUntil = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  const expiryDay = new Date(year, month - 1, day);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((expiryDay.getTime() - today.getTime()) / 86400000);
};
function itemTone(item) { if (Number(item.qty) <= 0) return "empty"; const days = daysUntil(item.expiry); if (days <= 0) return "expired"; if (days <= 5) return "expiring"; return item.qty <= 4 ? "low" : "safe"; }
function toneText(item) { const tone = itemTone(item); return tone === "empty" ? "Disposed · out of stock" : tone === "expired" ? "Expired · dispose" : tone === "expiring" ? `Markdown · ${daysUntil(item.expiry)} days` : tone === "low" ? "Low stock" : "In stock"; }
function persistRender() { save(); updateStats(); renderDashboard(); renderNotifications(); if (activePage === "inventory") renderInventory(); if (activePage === "transactions") renderTransactions(); }
function activeAnalyticsDays() { return Number($("#chart-period")?.value || 7); }
function periodAnalytics(days = activeAnalyticsDays()) {
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1);
  const events = state.transactions.filter((tx) => ["Sale", "Supplier payment"].includes(tx.type) && Number.isFinite(Number(tx.amount)) && new Date(tx.createdAt || now).getTime() >= start.getTime() && new Date(tx.createdAt || now).getTime() <= now.getTime() + 86400000);
  const bucketsCount = days === 7 ? 7 : 6; const bucketSize = days / bucketsCount;
  const buckets = Array.from({ length: bucketsCount }, () => ({ sales: 0, spend: 0 }));
  for (const tx of events) {
    const txDate = new Date(tx.createdAt || now); txDate.setHours(0, 0, 0, 0);
    const index = Math.min(bucketsCount - 1, Math.max(0, Math.floor((txDate - start) / 86400000 / bucketSize)));
    if (tx.type === "Sale") buckets[index].sales += Number(tx.amount);
    if (tx.type === "Supplier payment") buckets[index].spend += Math.abs(Number(tx.amount));
  }
  const sales = buckets.reduce((sum, bucket) => sum + bucket.sales, 0); const spend = buckets.reduce((sum, bucket) => sum + bucket.spend, 0);
  return { buckets, sales, spend, profit: sales - spend };
}
function shortZar(value) { const amount = Math.max(0, Number(value) || 0); return amount >= 1000 ? `R ${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k` : `R ${Math.round(amount)}`; }
function renderAnalytics() {
  const selector = $("#chart-period"); if (!selector) return;
  const days = activeAnalyticsDays(); const { buckets, sales, spend, profit } = periodAnalytics(days);
  $("#cash-in").innerHTML = zarStat(sales); $("#cash-out").innerHTML = zarStat(spend); $("#net-profit").innerHTML = zarStat(profit);
  const periodLabel = days === 7 ? "PAST WEEK" : days === 30 ? "PAST MONTH" : "PAST 3 MONTHS";
  $("#cash-in-label").innerHTML = `SALES · ${periodLabel} <span class="info-dot" title="Recorded sales in the selected period">i</span>`;
  $("#cash-out-label").innerHTML = `SUPPLIER SPEND · ${periodLabel} <span class="info-dot" title="Recorded supplier payments in the selected period">i</span>`;
  $("#profit-label").innerHTML = `NET PROFIT · ${periodLabel} <span class="info-dot" title="Sales minus supplier payments recorded in the selected period">i</span>`;
  $("#chart-total").textContent = zar(sales);
  const ceiling = Math.max(100, ...buckets.flatMap((bucket) => [bucket.sales, bucket.sales - bucket.spend])) * 1.12;
  const y = (value) => 174 - Math.max(0, value) / ceiling * 154;
  const line = (key) => buckets.map((bucket, index) => `${index ? "L" : "M"}${(index * 680 / Math.max(1, buckets.length - 1)).toFixed(1)} ${y(key === "profit" ? bucket.sales - bucket.spend : bucket.sales).toFixed(1)}`).join(" ");
  const salesPath = line("sales"); const profitPath = line("profit");
  $("#sales-line-path").setAttribute("d", salesPath); $("#profit-line-path").setAttribute("d", profitPath); $("#sales-fill-path").setAttribute("d", `${salesPath} L680 190 L0 190Z`);
  $("#chart-y-labels").innerHTML = Array.from({ length: 5 }, (_, index) => `<span>${shortZar(ceiling * (4 - index) / 4)}</span>`).join("");
  const labels = days === 7 ? Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 6 + index); return new Intl.DateTimeFormat("en-ZA", { weekday: "short" }).format(date); }) : buckets.map((_, index) => { const date = new Date(); date.setDate(date.getDate() - days + 1 + Math.round((index + .5) * days / buckets.length)); return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(date); });
  $("#chart-x-labels").innerHTML = labels.map((label) => `<span>${escapeHTML(label)}</span>`).join("");
}
function updateStats() {
  renderAnalytics();
  const spent = state.initialBudget - state.budget;
  $("#budget-value").textContent = state.budget.toFixed(2);
  $("#budget-total").textContent = Number(state.initialBudget || 100).toFixed(0);
  $("#budget-used").textContent = `${spent.toFixed(2)} XRP used`;
  $("#budget-meter-fill").style.width = `${Math.min(100, spent / state.initialBudget * 100)}%`;
  $("#store-balance").textContent = zar(state.storeBalance);
  $("#store-settlement-balance").textContent = demoMode ? `Simulated available: ${zar(state.settledBalanceZar || 0)} · demo only` : `Paystack verified and withdrawable: ${zar(state.settledBalanceZar || 0)} · demo funds excluded`;
  updateLinkedAccountSummary();
  $("#inventory-badge").textContent = state.inventory.filter((item) => ["empty", "expired", "low", "expiring"].includes(itemTone(item))).length;
  renderNotifications();
}
function renderTodayLabel() { $("#today-label").textContent = new Intl.DateTimeFormat(localeFor(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()).toUpperCase(); }
renderTodayLabel();
function getNotifications() {
  return state.inventory.flatMap((item) => {
    if (Number(item.qty) <= 0) return [{ id: `stock-${item.id}-empty`, title: `${item.name} is out of stock`, body: `No ${item.unit} remain. Add stock before taking another sale.`, tone: "urgent", icon: "0" }];
    const tone = itemTone(item);
    if (tone === "expired") return [{ id: `stock-${item.id}-expired`, title: `${item.name} has expired`, body: `${item.qty} ${item.unit} should be removed from sale and disposed.`, tone: "urgent", icon: "!" }];
    if (tone === "low") return [{ id: `stock-${item.id}-low`, title: `${item.name} is running low`, body: `Only ${item.qty} ${item.unit} left on the shelf.`, tone: "warning", icon: "↓" }];
    if (tone === "expiring") return [{ id: `stock-${item.id}-expiring`, title: `${item.name} is nearing expiry`, body: `Best before ${formatDate(item.expiry)}. A 50% markdown is suggested.`, tone: "warning", icon: "◷" }];
    return [];
  }).concat([{ id: "policy-active", title: "Spending policy is active", body: "Supplier payments are checked before they are approved.", tone: "normal", icon: "✓" }]);
}
function renderNotifications() {
  const notifications = getNotifications(); const unread = notifications.filter((note) => !state.readNotifications.includes(note.id));
  const count = $("#notification-count"); if (!count) return;
  count.textContent = unread.length > 9 ? "9+" : String(unread.length); count.classList.toggle("has-unread", unread.length > 0);
  $("#notification-summary").textContent = `${unread.length} unread · ${notifications.length} total`;
  $("#notification-list").innerHTML = notifications.length ? notifications.map((note) => `<button class="notification-item ${note.tone} ${state.readNotifications.includes(note.id) ? "read" : "unread"}" data-notification-id="${escapeHTML(note.id)}"><span class="notification-item-icon">${escapeHTML(note.icon)}</span><span class="notification-item-copy"><strong>${escapeHTML(note.title)}</strong><small>${escapeHTML(note.body)}</small></span>${state.readNotifications.includes(note.id) ? "" : "<i class=\"unread-indicator\"></i>"}</button>`).join("") : `<div class="notifications-empty"><span>✓</span><strong>All caught up</strong><p>New shop updates will show here.</p></div>`;
  $("#mark-notifications-read").disabled = unread.length === 0;
}
function renderWatchList() {
  const watch = state.inventory.filter((item) => ["empty", "expired", "low", "expiring"].includes(itemTone(item))).sort((a, b) => { const rank = { empty: 0, expired: 1, low: 2, expiring: 3 }; return rank[itemTone(a)] - rank[itemTone(b)]; });
  $("#watch-list").innerHTML = (watch.length ? watch : state.inventory.filter((item) => Number(item.qty) > 0).slice(0, 3)).slice(0, 3).map((item) => {
    const tone = itemTone(item);
    return `<div class="watch-item"><span class="product-thumb ${tone === "expired" || tone === "empty" ? "expired" : item.category === "Dairy" ? "drink" : "fresh"}">${item.icon}</span><div><div class="product-name">${escapeHTML(item.name)}</div><div class="product-meta">${tone === "empty" ? "Restock before taking another sale" : tone === "expired" ? `Best before ${formatDate(item.expiry)}` : `${daysUntil(item.expiry)} days to expiry · ${item.qty} ${escapeHTML(item.unit)}`}</div></div><div class="watch-right"><div class="stock-value">${item.qty} ${escapeHTML(item.unit)}</div><span class="stock-pill ${tone === "empty" ? "pill-empty" : tone === "expired" ? "pill-expired" : tone === "low" ? "pill-low" : tone === "expiring" ? "pill-expiring" : "pill-safe"}">${tone === "empty" ? "OUT OF STOCK" : tone === "expiring" ? "50% OFF" : tone === "expired" ? "EXPIRED" : tone === "low" ? "LOW STOCK" : "IN STOCK"}</span></div></div>`;
  }).join("") || `<div class="watch-empty">No active stock alerts. Your stock list is up to date.</div>`;
}
function renderActivity() {
  $("#activity-body").innerHTML = state.transactions.slice(0, 5).map((tx) => {
    const pay = tx.amount < 0;
    const cls = ["Supplier payment", "Wallet withdrawal"].includes(tx.type) ? "pay" : tx.type === "Inventory" ? "stock" : tx.type === "Disposal" ? "waste" : ["Deposit", "Withdrawal", "Wallet top-up"].includes(tx.type) ? "money" : "";
    const amount = tx.xrpAmount ? `<span class="activity-amount ${tx.xrpAmount < 0 ? "amount-out" : "amount-in"}">${tx.xrpAmount < 0 ? "−" : "+"}${Math.abs(tx.xrpAmount).toFixed(6)} XRP</span>` : tx.amount ? `<span class="activity-amount ${pay ? "amount-out" : ""}">${pay ? "−" : "+"}${zar(Math.abs(tx.amount))}</span>` : `<span class="activity-amount">—</span>`;
    return `<tr><td><div class="activity-cell"><span class="activity-icon ${cls}">${escapeHTML(tx.icon)}</span><span>${escapeHTML(tx.title)}<small class="product-meta">${escapeHTML(tx.detail)}</small></span></div></td><td class="activity-type">${escapeHTML(tx.type)}</td><td>${escapeHTML(tx.time)}</td><td>${amount}</td><td><span class="status-chip">${escapeHTML(tx.status)}</span>${tx.memo ? ` <button class="row-action memo-action" data-view-memo="${escapeHTML(tx.intentId)}">Memo</button>` : ""}</td></tr>`;
  }).join("");
}
function renderDashboard() { renderWatchList(); renderActivity(); }
function formatDate(date) { return new Intl.DateTimeFormat(localeFor(), { day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00`)); }
function goTo(page) {
  activePage = page;
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  const names = { dashboard: "Overview", inventory: "Inventory", transactions: "Transactions", suppliers: "Suppliers", policy: "Spending policy" };
  $("#breadcrumb-current").textContent = names[page] || "Overview";
  const title = { dashboard: "Good morning, Eunatia ✳", inventory: "Your inventory", transactions: "Your transactions", suppliers: "Your suppliers", policy: "Spending policy" }[page];
  $("#page-title").textContent = page === "dashboard" ? `Good morning, ${(state.ownerName || "Eunatia Ngobeni").split(/\s+/)[0]} ✳` : title;
  $("#page-subtitle").textContent = { dashboard: "Here’s what’s happening at your shop today.", inventory: "Know what’s on your shelves, what’s running low and what needs to go.", transactions: "Every sale and supplier payment, all in one place.", suppliers: "The people who keep your shelves stocked.", policy: "You set the rules. Spaza checks every payment against them." }[page];
  const action = $("#open-sale"); action.style.display = ["dashboard", "transactions"].includes(page) ? "inline-flex" : "none";
  $(".account-toolbar").style.display = page === "dashboard" ? "flex" : "none";
  $(".fx-card").style.display = page === "dashboard" ? "block" : "none";
  $(".content-grid").style.display = page === "dashboard" ? "grid" : "none";
  $(".stats-grid").style.display = ["dashboard", "transactions"].includes(page) ? "grid" : "none";
  $(".notice-bar").style.display = ["dashboard", "policy"].includes(page) ? "flex" : "none";
  $(".activity-panel").style.display = ["dashboard", "transactions"].includes(page) ? "block" : "none";
  $(".bottom-grid").style.display = page === "dashboard" ? "grid" : "none";
  $$(".page-view").forEach((view) => view.remove());
  if (page === "inventory") { $(".page-wrap").insertAdjacentHTML("beforeend", inventoryView()); renderInventory(); }
  if (page === "transactions") $(".page-wrap").insertAdjacentHTML("beforeend", transactionView());
  if (page === "suppliers") $(".page-wrap").insertAdjacentHTML("beforeend", supplierView());
  if (page === "policy") $(".page-wrap").insertAdjacentHTML("beforeend", policyView());
  updateStats();
  translatePage($(".page-wrap"));
  $("#sidebar").classList.remove("open"); window.scrollTo({ top: 0, behavior: "smooth" });
}
function inventoryView() {
  return `<section class="page-view"><div class="stats-grid"><article class="stat-card"><span class="stat-label">TOTAL PRODUCTS</span><div class="stat-value" id="inventory-total">${state.inventory.length}</div><div class="stat-foot">Across your shop</div></article><article class="stat-card"><span class="stat-label">IN STOCK</span><div class="stat-value" id="inventory-in-stock">${state.inventory.filter((x) => Number(x.qty) > 0).length}</div><div class="stat-foot">Available items</div></article><article class="stat-card"><span class="stat-label">OUT OF STOCK</span><div class="stat-value" id="inventory-out-stock">${state.inventory.filter((x) => Number(x.qty) <= 0).length}</div><div class="stat-foot">Restock to sell</div></article><article class="stat-card"><span class="stat-label">EXPIRING SOON</span><div class="stat-value" id="inventory-expiring">${state.inventory.filter((x) => itemTone(x) === "expiring").length}</div><div class="stat-foot">Within 5 days</div></article><article class="stat-card"><span class="stat-label">EXPIRED</span><div class="stat-value" id="inventory-expired">${state.inventory.filter((x) => itemTone(x) === "expired").length}</div><div class="stat-foot">Remove from sale</div></article></div><div class="inventory-toolbar"><input class="search-field" id="inventory-search" placeholder="Search products…" /><select class="filter-select" id="inventory-filter"><option value="all">All products</option><option value="safe">In stock</option><option value="empty">Out of stock</option><option value="low">Low stock</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option></select><button class="button button-primary" id="add-stock">＋ Add item</button><span class="inventory-results" id="inventory-results" aria-live="polite"></span></div><article class="panel inventory-full"><div class="table-scroll"><table class="activity-table"><thead><tr><th>PRODUCT</th><th>ON HAND</th><th>BEST BEFORE</th><th>SUPPLIER</th><th>SELLING PRICE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody id="inventory-body"></tbody></table></div></article></section>`;
}
function renderInventory() {
  const query = ($("#inventory-search")?.value || "").toLowerCase(); const filter = $("#inventory-filter")?.value || "all";
  const filtered = state.inventory.filter((item) => item.name.toLowerCase().includes(query) && (filter === "all" || itemTone(item) === filter));
  const body = $("#inventory-body"); if (!body) return;
  $("#inventory-total").textContent = state.inventory.length;
  $("#inventory-in-stock").textContent = state.inventory.filter((item) => Number(item.qty) > 0).length;
  $("#inventory-out-stock").textContent = state.inventory.filter((item) => Number(item.qty) <= 0).length;
  if ($("#inventory-low")) $("#inventory-low").textContent = state.inventory.filter((item) => itemTone(item) === "low").length;
  $("#inventory-expiring").textContent = state.inventory.filter((item) => itemTone(item) === "expiring").length;
  $("#inventory-expired").textContent = state.inventory.filter((item) => itemTone(item) === "expired").length;
  $("#inventory-results").textContent = `Showing ${filtered.length} of ${state.inventory.length} products`;
  body.innerHTML = filtered.map((item) => `<tr><td data-label="Product"><div class="activity-cell"><span class="activity-icon">${item.icon}</span><span>${escapeHTML(item.name)}<small class="product-meta">${escapeHTML(item.category)}</small></span></div></td><td data-label="On hand"><div class="stock-inline"><i class="stock-dot ${itemTone(item) === "empty" ? "empty" : itemTone(item) === "expired" ? "expired" : itemTone(item) === "low" ? "low" : ""}"></i>${item.qty} ${escapeHTML(item.unit)}</div></td><td data-label="Best before">${formatDate(item.expiry)}</td><td data-label="Supplier">${escapeHTML(item.supplier)}</td><td data-label="Selling price">${zar(item.price)}${itemTone(item) === "expiring" ? " <span class=\"product-meta\">· 50% off</span>" : ""}</td><td data-label="Status"><span class="stock-pill ${itemTone(item) === "empty" ? "pill-empty" : itemTone(item) === "expired" ? "pill-expired" : itemTone(item) === "low" ? "pill-low" : itemTone(item) === "expiring" ? "pill-expiring" : "pill-safe"}">${escapeHTML(toneText(item))}</span></td><td data-label="Actions"><div class="row-actions">${itemTone(item) === "expired" ? `<button class="row-action" data-dispose="${item.id}">Dispose</button>` : `<button class="row-action" data-adjust="${item.id}">Adjust</button>`}<button class="row-action row-action-delete" data-delete-item="${item.id}">Delete</button></div></td></tr>`).join("") || `<tr><td colspan="7">No products match that search.</td></tr>`;
}
function transactionView() { return `<section class="page-view"><div class="inventory-toolbar"><input class="search-field" id="transaction-search" placeholder="Search activity…" /><select class="filter-select" id="transaction-filter"><option value="all">All activity</option><option value="Sale">Sales</option><option value="Supplier payment">Supplier payments</option><option value="Wallet withdrawal">Wallet withdrawals</option><option value="Wallet top-up">XRP top-ups</option><option value="Deposit">Deposits</option><option value="Withdrawal">Withdrawals</option><option value="Inventory">Inventory</option><option value="Supplier">Suppliers</option></select></div><article class="panel inventory-full"><div class="table-scroll"><table class="activity-table"><thead><tr><th>ACTIVITY</th><th>TYPE</th><th>TIME</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody id="transactions-body"></tbody></table></div></article></section>`; }
function renderTransactions() {
  const query = ($("#transaction-search")?.value || "").toLowerCase(); const filter = $("#transaction-filter")?.value || "all";
  const filtered = state.transactions.filter((x) => (x.title + x.detail).toLowerCase().includes(query) && (filter === "all" || x.type === filter));
  $("#transactions-body").innerHTML = filtered.map((tx) => { const pay = tx.amount < 0; const tone = ["Supplier payment", "Wallet withdrawal"].includes(tx.type) ? "pay" : ["Deposit", "Withdrawal", "Wallet top-up"].includes(tx.type) ? "money" : tx.type === "Inventory" ? "stock" : ""; const amount = tx.xrpAmount ? `<span class="activity-amount ${tx.xrpAmount < 0 ? "amount-out" : "amount-in"}">${tx.xrpAmount < 0 ? "−" : "+"}${Math.abs(tx.xrpAmount).toFixed(6)} XRP</span>` : tx.amount ? `<span class="activity-amount ${pay ? "amount-out" : ""}">${pay ? "−" : "+"}${zar(Math.abs(tx.amount))}</span>` : "—"; return `<tr><td><div class="activity-cell"><span class="activity-icon ${tone}">${escapeHTML(tx.icon)}</span><span>${escapeHTML(tx.title)}<small class="product-meta">${escapeHTML(tx.detail)}</small></span></div></td><td>${escapeHTML(tx.type)}</td><td>${escapeHTML(tx.time)}</td><td>${amount}</td><td><span class="status-chip">${escapeHTML(tx.status)}</span>${tx.memo ? ` <button class="row-action memo-action" data-view-memo="${escapeHTML(tx.intentId)}">Memo</button>` : ""}${tx.operationId ? ` <button class="row-action" data-check-paystack="${escapeHTML(tx.operationId)}">Check status</button>` : ""}</td></tr>`; }).join("");
}
function supplierView() { return `<section class="page-view"><div class="supplier-toolbar"><div><span class="muted-label">YOUR APPROVED SUPPLIERS</span><p>${walletInfo.simulated ? "Payments run as simulations; no wallet address is needed." : "Add a Testnet wallet address and/or x402 service URL. Choose the route each time you pay."}</p></div><button class="button button-primary" id="add-supplier">＋ Add supplier</button></div><div class="supplier-grid">${state.suppliers.map((s) => `<article class="supplier-card"><button class="supplier-delete" data-delete-supplier="${escapeHTML(s.name)}" aria-label="Delete ${escapeHTML(s.name)}">×</button><div class="supplier-head"><span class="supplier-avatar">${escapeHTML(s.initials)}</span><div><h3>${escapeHTML(s.name)}</h3><p>${escapeHTML(s.type)}</p></div></div><div class="supplier-detail"><span>Payments today</span><strong>${s.orders} orders</strong></div><div class="supplier-detail"><span>Per payment limit</span><strong>${Number(s.cap).toFixed(2)} XRP</strong></div><div class="supplier-detail"><span>Wallet address</span><strong class="supplier-address">${s.xrplAddress ? escapeHTML(`${s.xrplAddress.slice(0, 9)}…${s.xrplAddress.slice(-5)}`) : walletInfo.simulated ? "Not required for demo" : "Not added"}</strong></div><div class="supplier-detail"><span>x402 service</span><strong class="supplier-address">${s.x402Endpoint ? "Added" : "Optional · not added"}</strong></div><div class="supplier-actions"><button class="button button-secondary" data-edit-supplier="${escapeHTML(s.name)}">Edit details</button><button class="button button-secondary pay-supplier" data-supplier="${escapeHTML(s.name)}">Pay supplier <span>→</span></button></div></article>`).join("") || `<article class="supplier-card supplier-empty"><strong>No suppliers yet</strong><p>Add an approved supplier and their wallet address or x402 service URL.</p></article>`}</div></section>`; }
function policyView() {
  return `<section class="page-view"><div class="policy-layout"><article class="policy-box"><h2>Payment guardrails</h2><p>The local service checks each payment before signing. Ledger submission is limited to XRPL Testnet.</p><div class="policy-row"><span>Policy gate</span><strong>Active</strong></div><div class="policy-row"><span>Kill switch</span><button class="toggle ${policy.killSwitch ? "on" : ""}" id="kill-switch" aria-label="Toggle kill switch"><span></span></button></div><div class="policy-row"><span>Agent spending budget</span><strong>${state.budget.toFixed(2)} XRP remaining</strong></div><div class="policy-row"><span>Daily spend limit</span><strong>${policy.dailyCap.toFixed(2)} XRP</strong></div><div class="policy-row"><span>Policy version</span><strong>${escapeHTML(policy.policyVersion)}</strong></div></article><article class="policy-box"><h2>Approved suppliers</h2><p>Only suppliers on this list can receive a payment.</p>${state.suppliers.map((s) => `<div class="allowlist-item"><span>${escapeHTML(s.name)}</span><span>${s.cap.toFixed(2)} XRP / payment</span></div>`).join("") || `<div class="allowlist-item"><span>No suppliers approved</span><span>—</span></div>`}<div id="policy-evidence"></div></article></div><article class="panel xrpl-info-panel"><div class="panel-heading"><div><h2>XRPL Testnet payment safeguards</h2><p>The local service checks these conditions before it signs a payment.</p></div><span class="demo-tag">TESTNET</span></div><div class="preflight-grid"><div class="preflight-item"><span>01</span><div><strong>Validate destination</strong><small>Check the address and verify it is not the sending account.</small></div></div><div class="preflight-item"><span>02</span><div><strong>Check balance and reserve</strong><small>Include the XRP amount and network fee before signing.</small></div></div><div class="preflight-item"><span>03</span><div><strong>Check destination account</strong><small>Confirm the destination exists and is funded on the selected network.</small></div></div><div class="preflight-item"><span>04</span><div><strong>Bound memo size</strong><small>Keep the serialized Memos field at or below 1 KB.</small></div></div><div class="preflight-item"><span>05</span><div><strong>Use current sequence and fee</strong><small>Read current ledger state and block fees above the configured ceiling.</small></div></div><div class="preflight-item"><span>06</span><div><strong>Set LastLedgerSequence</strong><small>Set LastLedgerSequence; XRPL guidance recommends four ledgers past the last validated ledger.</small></div></div><div class="preflight-item"><span>07</span><div><strong>Prevent duplicate intent</strong><small>Persist an intent before submit and reconcile its final result by transaction hash.</small></div></div><div class="preflight-item"><span>08</span><div><strong>Trust validated outcomes</strong><small>Keep pending separate from validated success, validated failure and expired.</small></div></div></div><div class="testnet-note"><div><strong>Testnet funds are for testing only</strong><p>Testnet balances and history can reset, are separate from Mainnet, and have no real-world value. Never reuse a Mainnet key pair on a test network.</p></div><a class="button button-secondary" href="https://xrpl.org/resources/dev-tools/xrp-faucets" target="_blank" rel="noopener noreferrer">Open XRPL faucet <span>↗</span></a><a class="xrpl-guide-link" href="https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission" target="_blank" rel="noopener noreferrer">Reliable transaction guidance ↗</a></div></article><article class="panel" style="padding:16px;margin-top:13px"><div class="panel-heading"><div><h2>Recent activity</h2><p>Demo ledger entries are clearly marked and are not XRPL confirmations.</p></div></div><div class="table-scroll"><table class="activity-table"><thead><tr><th>ACTIVITY</th><th>TYPE</th><th>TIME</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>${state.transactions.slice(0, 5).map((tx) => `<tr><td><div class="activity-cell"><span class="activity-icon pay">${escapeHTML(tx.icon)}</span><span>${escapeHTML(tx.title)}<small class="product-meta">${escapeHTML(tx.detail)}</small></span></div></td><td>${escapeHTML(tx.type)}</td><td>${escapeHTML(tx.time)}</td><td>${tx.amount ? `${tx.amount < 0 ? "−" : "+"}${zar(Math.abs(tx.amount))}` : "—"}</td><td><span class="status-chip">${escapeHTML(tx.status)}</span></td></tr>`).join("")}</tbody></table></div></article></section>`;
}
function openModal({ kicker = "QUICK ACTION", title, copy, fields, submit, onSubmit }) {
  $("#modal-kicker").textContent = kicker; $("#modal-title").textContent = title; $("#modal-copy").textContent = copy; $("#modal-fields").innerHTML = fields; $("#modal-submit").textContent = submit; $("#modal-error").textContent = "";
  $("#modal-backdrop").classList.add("open"); $("#modal-backdrop").setAttribute("aria-hidden", "false"); setTimeout(() => $("#modal-fields input, #modal-fields select")?.focus(), 50);
  $("#modal-submit").onclick = () => onSubmit($("#modal-fields"));
}
function closeModal() {
  $("#modal-backdrop").classList.remove("open"); $("#modal-backdrop").setAttribute("aria-hidden", "true");
  const supplierToResume = walletContactsReturnToSupplier; walletContactsReturnToSupplier = null;
  if (supplierToResume) openSupplierModal(supplierToResume === "__new__" ? null : supplierToResume);
}
function showToast(title, message, error = false) {
  const toast = document.createElement("div"); toast.className = `toast ${error ? "is-error" : ""}`; toast.innerHTML = `<span class="toast-icon">${error ? "!" : "✓"}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div><button class="toast-close" aria-label="Dismiss">×</button>`;
  $("#toast-stack").append(toast); $(".toast-close", toast).onclick = () => toast.remove(); setTimeout(() => toast.remove(), 4800);
}
function runPolicyCheck(supplier, amount) {
  let reason = ""; const approved = state.suppliers.find((entry) => entry.name === supplier);
  if (policy.killSwitch) reason = "The kill switch is on. All payments are paused.";
  else if (!approved) reason = `${supplier} is not on your approved supplier list.`;
  else if (amount <= 0 || !Number.isFinite(amount)) reason = "Enter a valid payment amount.";
  else if (amount > approved.cap) reason = `${supplier} per-payment limit is ${approved.cap.toFixed(2)} XRP; requested ${amount.toFixed(2)} XRP.`;
  else if (amount > state.budget) reason = `Agent spending budget is ${state.budget.toFixed(2)} XRP; requested ${amount.toFixed(2)} XRP.`;
  else if (amount + state.dailySpent > policy.dailyCap) reason = `Daily spending limit is ${policy.dailyCap.toFixed(2)} XRP; ${state.dailySpent.toFixed(2)} XRP has already been used today.`;
  return { allowed: !reason, reason };
}
function openSaleModal() {
  const sellable = state.inventory.filter((item) => daysUntil(item.expiry) > 0 && item.qty > 0);
  openModal({ kicker: "POINT OF SALE", title: "Ring up a sale", copy: "Expired stock is kept off the till. Items near expiry include a 50% markdown.", submit: "Complete sale", fields: `<div class="form-field"><label for="sale-item">Product</label><select id="sale-item">${sellable.map((item) => `<option value="${item.id}">${escapeHTML(item.name)} · ${zar(itemTone(item) === "expiring" ? item.price / 2 : item.price)}${itemTone(item) === "expiring" ? " (50% off)" : ""}</option>`).join("")}</select></div><div class="form-field"><label for="sale-qty">Quantity</label><input id="sale-qty" type="number" min="1" value="1" max="${sellable[0]?.qty || 1}" /><span class="form-hint" id="sale-hint">In stock: ${sellable[0]?.qty || 0}</span></div>`, onSubmit: (root) => {
    const item = state.inventory.find((x) => x.id === Number($("#sale-item", root).value)); const qty = Number($("#sale-qty", root).value); const err = $("#modal-error");
    if (!item || daysUntil(item.expiry) <= 0) { err.textContent = "Expired items cannot be sold. Please dispose of this stock."; return; }
    if (!Number.isInteger(qty) || qty < 1 || qty > item.qty) { err.textContent = `Please enter a quantity between 1 and ${item.qty}.`; return; }
    const price = itemTone(item) === "expiring" ? item.price / 2 : item.price; const total = price * qty; item.qty -= qty; state.cashIn += total; state.transactions.unshift({ title: "Till sale", detail: `${qty} × ${item.name}`, type: "Sale", amount: total, time: new Intl.DateTimeFormat("en-ZA", { hour: "numeric", minute: "2-digit" }).format(new Date()), createdAt: new Date().toISOString(), icon: "↗", status: "Complete" });
    persistRender(); closeModal(); showToast("Sale recorded", `${qty} × ${item.name} · ${zar(total)} added to cash in.`);
  }});
  const itemSelect = $("#sale-item"); itemSelect?.addEventListener("change", () => { const item = state.inventory.find((x) => x.id === Number(itemSelect.value)); $("#sale-qty").max = item.qty; $("#sale-hint").textContent = `In stock: ${item.qty}`; });
}
function openPaymentModal(supplierName) {
  const intentId = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const supplierOptions = state.suppliers.map((s) => `<option value="${escapeHTML(s.name)}" ${s.name === supplierName ? "selected" : ""}>${escapeHTML(s.name)} · limit ${s.cap} XRP</option>`).join("");
  const selected = state.suppliers.find((s) => s.name === supplierName) || state.suppliers[0];
  const endpoint = selected?.x402Endpoint || "";
  openModal({ kicker: walletInfo.simulated ? "DEMO · SIMULATED PAYMENT" : "SUPPLIER PAYMENT · OWNER APPROVAL", title: "Pay a supplier", copy: "Choose a wallet transfer or x402 service. Review the exact amount and recipient, then approve before any payment is signed.", submit: "Check payment", fields: `<div class="form-field"><label for="pay-supplier">Approved supplier</label><select id="pay-supplier">${supplierOptions}</select></div><div class="form-field"><label for="pay-amount">Amount in XRP</label><input id="pay-amount" type="number" min="0.01" step="0.01" value="1.00"/><span class="form-hint">Available agent budget: ${state.budget.toFixed(2)} XRP · daily limit ${policy.dailyCap} XRP</span><span id="pay-amount-fx" class="form-hint">${escapeHTML(fxQuoteText(1))}</span></div><div class="form-field"><label for="pay-route">Payment method</label><select id="pay-route"><option value="wallet">XRPL Testnet wallet address</option><option value="x402" ${endpoint ? "" : "disabled"}>x402 service · Oracle check first${endpoint ? "" : " (add URL in supplier details)"}</option></select><span class="form-hint">Wallet transfer sends to the saved supplier address. x402 requests a service quote, then completes payment through its facilitator after you approve.</span></div><div class="form-field" id="pay-x402-field" hidden><label for="pay-x402-endpoint">Supplier x402 HTTPS URL</label><input id="pay-x402-endpoint" type="url" value="${escapeHTML(endpoint)}" placeholder="https://supplier.example/resource"/><span class="form-hint">The service must offer an exact XRP payment on XRPL Testnet. Review its destination and quote before approving.</span></div><div id="payment-review"></div>`, onSubmit: async (root) => {
    const supplier = $("#pay-supplier", root).value; const amount = Number($("#pay-amount", root).value); const verdict = runPolicyCheck(supplier, amount);
    if (!verdict.allowed) { $("#modal-error").innerHTML = `<div class="policy-result"><strong>Payment blocked by policy gate</strong><p>${escapeHTML(verdict.reason)} No transaction was constructed, signed or submitted.</p></div>`; showToast("Payment blocked", verdict.reason, true); return; }
    const route = $("#pay-route", root).value; const x402Endpoint = route === "x402" ? $("#pay-x402-endpoint", root).value.trim() : "";
    const supplierRecord = state.suppliers.find((s) => s.name === supplier);
    if (!walletInfo.simulated && !supplierRecord?.xrplAddress) { $("#modal-error").innerHTML = `Add the supplier’s public XRPL Testnet address before paying. <button type="button" class="text-link" id="payment-edit-supplier">Add wallet address</button>`; return; }
    if (route === "x402" && !/^https:\/\//i.test(x402Endpoint)) { $("#modal-error").textContent = "Add the supplier’s public HTTPS x402 URL in Edit details, or choose wallet transfer."; return; }
    if (route === "x402" && !apiOnline) { $("#modal-error").textContent = "The x402 Oracle check needs the local app service. Start the service, reconnect, and try again; no payment was made."; return; }
    if (apiOnline && walletInfo.connected && !walletInfo.simulated) {
      const review = $("#payment-review", root); const button = $("#modal-submit"); button.disabled = true; button.textContent = "Checking Testnet…";
      try {
        if (!review.dataset.ready) {
          await syncStateRemote();
          if (route === "x402") {
            const oracle = await apiRequest("/x402/oracle-check", { method: "POST", body: JSON.stringify({ url: x402Endpoint }) });
            const quote = oracle.payment || {};
            if (!oracle.ok || quote.pay_to !== supplierRecord.xrplAddress || quote.amount_drops !== String(Math.round(amount * 1_000_000))) throw new Error("The x402 quote must pass and match this supplier’s saved wallet address and the exact amount entered.");
            review.dataset.oracle = JSON.stringify(quote);
          }
          const preview = await apiRequest("/payments/preview", { method: "POST", body: JSON.stringify({ supplier, amount, intent_id: intentId, x402_endpoint: x402Endpoint || null }) });
          const detail = preview.preflight?.details || {};
          const oracleQuote = route === "x402" ? JSON.parse(review.dataset.oracle || "{}") : null;
          review.innerHTML = `<div class="policy-result allowed"><strong>${route === "x402" ? "x402 Oracle check passed · XRPL preflight passed" : "XRPL Testnet preflight passed"}</strong><p>${route === "x402" ? "The x402 quote matches the supplier wallet and requested amount; XRPL checks also passed. After approval, the facilitator settles the payment and the service request is retried with its receipt." : "Destination, balance reserve, fee, sequence, daily limit and duplicate intent checks passed."}</p>${oracleQuote ? `<p>x402 quote: ${escapeHTML(oracleQuote.amount_drops)} drops · ${escapeHTML(oracleQuote.pay_to)} · ${escapeHTML(oracleQuote.network)}. The facilitator will settle it only after owner approval.</p>` : ""}<div class="preflight-review"><span>From <b>${escapeHTML(walletInfo.address || "Shop wallet")}</b></span><span>To <b>${escapeHTML(supplierRecord.xrplAddress)}</b></span><span>Amount <b>${amount.toFixed(6)} XRP</b></span><span>Estimated fee <b>${escapeHTML(String(detail.fee_xrp ?? "See ledger"))} XRP</b></span><span>Last ledger <b>${escapeHTML(String(preview.last_ledger_sequence ?? "Set by preflight"))}</b></span></div><label class="form-hint"><input id="payment-owner-confirm" type="checkbox" /> I checked the supplier, method and amount, and approve this Testnet payment.</label></div>`;
          review.dataset.ready = "true"; review.dataset.amount = String(amount); review.dataset.supplier = supplier; review.dataset.route = route; review.dataset.endpoint = x402Endpoint;
          button.textContent = "Confirm & pay supplier";
        } else {
          if (review.dataset.amount !== String(amount) || review.dataset.supplier !== supplier || review.dataset.route !== route || review.dataset.endpoint !== x402Endpoint) { delete review.dataset.ready; throw new Error("The supplier, method, URL or amount changed. Check the payment again before approving."); }
          if (!$("#payment-owner-confirm", root)?.checked) { button.disabled = false; button.textContent = "Confirm & pay supplier"; $("#modal-error").textContent = "Tick the owner approval box after checking the recipient and amount."; return; }
          button.textContent = "Submitting…";
          const result = await apiRequest("/payments", { method: "POST", body: JSON.stringify({ supplier, amount, intent_id: intentId, approved: true, x402_endpoint: x402Endpoint || null }) });
          if (result.state) state = { ...initialState, ...result.state };
          persistRender(); closeModal(); await refreshWalletActivity();
          showToast(result.status === "validated" ? "Testnet payment validated" : "Payment submitted · pending", result.message || "The saved transaction will be reconciled. Do not retry it.");
        }
      } catch (error) {
        $("#modal-error").textContent = error.message;
        if (error.message.includes("changed")) review.innerHTML = "";
        button.textContent = review.dataset.ready ? "Confirm & pay supplier" : "Check payment";
      } finally { button.disabled = false; }
      return;
    }
    if (!walletInfo.simulated) { $("#modal-error").textContent = "Supplier payments require a connected XRPL Testnet wallet. Open the Testnet wallet control, create or reconnect it, then try again."; return; }
    const review = $("#payment-review", root); const button = $("#modal-submit");
    if (!review.dataset.ready) {
      let oracleQuote = null;
      if (route === "x402") {
        const oracle = await apiRequest("/x402/oracle-check", { method: "POST", body: JSON.stringify({ url: x402Endpoint }) });
        oracleQuote = oracle.payment || {};
        if (!oracle.ok || oracleQuote.pay_to !== supplierRecord?.xrplAddress || oracleQuote.amount_drops !== String(Math.round(amount * 1_000_000))) { $("#modal-error").textContent = "The x402 check did not pass or its recipient and amount do not match. No payment was made."; return; }
      }
      review.innerHTML = `<div class="policy-result ${route === "x402" ? "allowed" : ""}"><strong>${route === "x402" ? "x402 Oracle check passed · demo only" : "Demo wallet transfer"}</strong><p>${route === "x402" ? "The unpaid challenge matches this supplier and amount. This is still a demo payment; no XRPL transfer or x402 facilitator settlement will occur." : "This is a simulated payment only. No XRPL transfer will be sent."}</p><p>Recipient: ${escapeHTML(supplierRecord?.xrplAddress || supplier)} · Amount: ${amount.toFixed(6)} XRP</p>${oracleQuote ? `<p>x402 quote: ${escapeHTML(oracleQuote.amount_drops)} drops · ${escapeHTML(oracleQuote.network)}</p>` : ""}<label class="form-hint"><input id="payment-owner-confirm" type="checkbox" /> I checked the supplier and amount, and approve this demo payment.</label></div>`; review.dataset.ready = "true"; review.dataset.amount = String(amount); review.dataset.supplier = supplier; review.dataset.route = route; review.dataset.endpoint = x402Endpoint; button.textContent = "Confirm demo payment"; return;
    }
    if (review.dataset.amount !== String(amount) || review.dataset.supplier !== supplier || review.dataset.route !== route || review.dataset.endpoint !== x402Endpoint) { delete review.dataset.ready; $("#modal-error").textContent = "The payment details changed. Check them again before approving."; button.textContent = "Check payment"; return; }
    if (!$("#payment-owner-confirm", root)?.checked) { $("#modal-error").textContent = "Tick the owner approval box after checking the recipient and amount."; return; }
    const timestamp = new Date().toISOString();
    const memo = { intent_id: intentId, workflow: "supplier_invoice", supplier, item: null, quantity: null, policy_version: policy.policyVersion, source_tag: 20260530, owner_approved: true, network: "testnet", timestamp };
    const estimatedZar = amount * (exchangeRates?.rates?.zar || 18.5);
    if (walletInfo.simulated && amount > Number(walletInfo.balance_xrp || 0)) { $("#modal-error").textContent = `The demo wallet has ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP available.`; return; }
    if (walletInfo.simulated) { walletInfo.balance_xrp -= amount; state.simulatedWalletXrp = walletInfo.balance_xrp; }
    state.budget -= amount; state.dailySpent += amount; state.dailySpentDate = localToday(); state.cashOut += estimatedZar; state.transactions.unshift({ title: supplier, detail: `Demo transfer · ${amount.toFixed(2)} XRP · approx. ${zar(estimatedZar)}`, type: "Supplier payment", amount: -estimatedZar, xrpAmount: walletInfo.simulated ? -amount : undefined, time: new Intl.DateTimeFormat("en-ZA", { hour: "numeric", minute: "2-digit" }).format(new Date()), icon: "↙", status: "Demo · simulated", intentId, memo }); persistRender(); closeModal(); showToast("Demo payment complete", `${amount.toFixed(2)} simulated XRP to ${supplier}. No XRPL transaction was sent.`);
  }});
  const routeSelect = $("#pay-route");
  const syncPayRoute = () => {
    const supplier = state.suppliers.find((s) => s.name === $("#pay-supplier")?.value);
    const x402Option = routeSelect?.querySelector('option[value="x402"]');
    if (x402Option) x402Option.disabled = !supplier?.x402Endpoint;
    if (routeSelect?.value === "x402" && !supplier?.x402Endpoint) routeSelect.value = "wallet";
    const endpointField = $("#pay-x402-field");
    if (endpointField) endpointField.hidden = routeSelect?.value !== "x402";
    const endpointInput = $("#pay-x402-endpoint");
    if (endpointInput && document.activeElement !== endpointInput) endpointInput.value = supplier?.x402Endpoint || "";
  };
  routeSelect?.addEventListener("change", syncPayRoute);
  $("#pay-supplier")?.addEventListener("change", syncPayRoute);
  syncPayRoute();
}
function openWalletSetupModal() {
  const configured = walletInfo.configured;
  if (walletInfo.simulated) {
    openModal({ kicker: "DEMO WALLET", title: "Your demo wallet is ready", copy: "Use simulated XRP to walk through the shop payment flows. No wallet address, secret key or XRPL connection is used.", submit: "Add 50 demo XRP", fields: `<div class="policy-result allowed"><strong>DEMO ONLY · ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP</strong><p>Simulated balance for this presentation. It has no cash value and cannot be sent on XRPL.</p></div><div class="wallet-action-row"><button type="button" class="button button-secondary" id="wallet-receive-open">Simulate an incoming deposit</button><button type="button" class="button button-secondary" id="wallet-withdraw-open">Try a demo withdrawal</button></div>`, onSubmit: () => { walletInfo.balance_xrp = Number(walletInfo.balance_xrp || 0) + 50; state.simulatedWalletXrp = walletInfo.balance_xrp; state.transactions.unshift({ title: "Demo wallet top-up", detail: "Simulated · 50 XRP", type: "Wallet top-up", amount: 0, xrpAmount: 50, time: "Just now", icon: "↓", status: "Demo · simulated" }); persistRender(); closeModal(); showToast("Demo balance topped up", "50 simulated XRP added. No faucet or XRPL transaction was used."); } });
    return;
  }
  if (!apiOnline || !API_KEY) { showToast("Start the local service", "Open the app with ./start_app.sh to manage the XRPL Testnet wallet.", true); return; }
  openModal({ kicker: "XRPL TESTNET ONLY", title: configured ? "Test wallet" : "Set up a test wallet", copy: configured ? `A Testnet-only wallet${walletInfo.connected ? " is connected" : " is saved on this computer but not currently reachable"}.${walletInfo.error ? ` Connection detail: ${walletInfo.error}` : ""} Its secret is never shown in the browser.` : "Create a fresh Testnet-only wallet on this computer, then request test XRP from XRPL’s official faucet. Test funds have no real-world value.", submit: configured ? "Top up with Test XRP" : "Create & fund test wallet", fields: configured ? `<div class="form-field"><label>Public address</label><input id="wallet-public-address" value="${escapeHTML(walletInfo.address || "")}" readonly /></div><p class="form-hint">Balance: ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP · network: XRPL Testnet${walletInfo.connected ? " · Connected" : " · Offline"}</p><div class="wallet-action-row"><button type="button" class="button button-secondary" id="wallet-receive-open">Receive XRP</button><button type="button" class="button button-secondary" id="wallet-refresh">Refresh balance</button></div><p class="form-hint">Faucet requests are limited to one per address every 24 hours.</p><button type="button" class="button button-secondary" id="wallet-withdraw-open">Withdraw XRP to another wallet</button><button type="button" class="button button-secondary" id="x402-oracle-open">Check an x402 endpoint</button>` : `<div class="policy-result"><strong>Only for testing</strong><p>A new key is generated locally, stored in a private .env file, and funded through the official Testnet faucet.</p></div><button type="button" class="button button-secondary" id="x402-oracle-open">Check an x402 endpoint</button>`, onSubmit: async () => {
    const button = $("#modal-submit"); button.disabled = true; button.textContent = "Requesting Test XRP…";
    try {
      const result = await apiRequest(configured ? "/faucet/fund" : "/wallet/bootstrap", { method: "POST", body: "{}" });
      const health = await apiRequest("/health"); walletInfo = health.wallet || { configured: true, connected: false, address: result.address, network: "testnet" };
      walletInfo.balance_xrp = Number(walletInfo.balance_xrp || result.balance_xrp || 0);
      $("#network-label").textContent = walletInfo.connected ? "XRPL Testnet" : "Testnet setup"; $("#demo-tag").textContent = `${walletInfo.balance_xrp.toFixed(2)} XRP`;
      const remote = await apiRequest("/state"); if (remote.state) state = { ...initialState, ...remote.state };
      persistRender();
      $("#network-label").title = `Testnet wallet ${result.address}`; closeModal(); showToast(walletInfo.connected ? (configured ? "Test wallet topped up" : "Test wallet ready") : "Faucet request accepted", `${result.address} · Testnet only. ${walletInfo.connected ? "Balance is available." : "The balance is not visible yet; check again shortly."}`);
    } catch (error) { $("#modal-error").textContent = error.message; button.textContent = configured ? "Top up with Test XRP" : "Create & fund test wallet"; }
    finally { button.disabled = false; }
  }});
}
function openReceiveXrpModal() {
  if (walletInfo.simulated) {
    openModal({ kicker: "DEMO · INCOMING XRP", title: "Simulate an XRP deposit", copy: "A live-style demo flow with no XRPL address or real transfer. Confirm a sample incoming amount to update the demo wallet.", submit: "Simulate 25 XRP deposit", fields: `<div class="policy-result allowed"><strong>Simulation only</strong><p>Incoming funds are added only to the sample wallet balance.</p></div>`, onSubmit: () => { walletInfo.balance_xrp = Number(walletInfo.balance_xrp || 0) + 25; state.simulatedWalletXrp = walletInfo.balance_xrp; state.transactions.unshift({ title: "Demo XRP deposit", detail: "Simulated incoming payment", type: "Wallet top-up", amount: 0, xrpAmount: 25, time: "Just now", icon: "↓", status: "Demo · simulated" }); persistRender(); closeModal(); showToast("Demo deposit received", "25 simulated XRP added to the sample wallet."); } });
    return;
  }
  if (!walletInfo.address) { showToast("No wallet address yet", "Create a Testnet wallet first.", true); return; }
  openModal({ kicker: "XRPL TESTNET · RECEIVE", title: "Receive XRP", copy: "Send Test XRP from another XRPL Testnet wallet to this public address. Deposits are not available on Mainnet through this app.", submit: "Done", fields: `<div class="form-field"><label>Shop wallet address</label><input id="receive-address" value="${escapeHTML(walletInfo.address)}" readonly /></div><div class="wallet-action-row"><button type="button" class="button button-secondary" id="copy-receive-address">Copy address</button><button type="button" class="button button-secondary" id="wallet-refresh">Refresh balance</button></div><p class="form-hint">Validated transfers and wallet balance refresh about every 5 seconds while this dashboard is open. A request only tracks an incoming transfer; it does not create XRP.</p>`, onSubmit: closeModal });
}
function openX402OracleModal() {
  openModal({ kicker: "X402 · XRPL TESTNET ORACLE CHECK", title: "Check a payment endpoint", copy: "We make one unpaid HTTPS request and inspect its HTTP 402 challenge. This checks whether the endpoint advertises a valid exact XRP payment on XRPL Testnet. No payment is signed or sent.", submit: "Run unpaid check", fields: `<div class="form-field"><label for="x402-endpoint-url">Public HTTPS endpoint</label><input id="x402-endpoint-url" type="url" placeholder="https://service.example/api/resource" autocomplete="url" required /></div><div id="x402-oracle-result" aria-live="polite"></div><p class="form-hint">The check will not follow redirects, submit payment, or accept private/local endpoints. A passing result is only a challenge-format check; it does not prove an endpoint is trustworthy.</p>`, onSubmit: async (root) => {
    const url = $("#x402-endpoint-url", root).value.trim(); const button = $("#modal-submit");
    if (!/^https:\/\//i.test(url)) { $("#modal-error").textContent = "Enter a public HTTPS address."; return; }
    button.disabled = true; button.textContent = "Checking without payment…";
    try {
      const result = await apiRequest("/x402/oracle-check", { method: "POST", body: JSON.stringify({ url }) });
      $("#x402-oracle-result", root).innerHTML = `<div class="policy-result ${result.ok ? "allowed" : ""}"><strong>${escapeHTML(result.verdict)}</strong><p>${escapeHTML(result.message || "")}</p>${(result.checks || []).map((check) => `<p>• ${escapeHTML(check)}</p>`).join("")}${result.payment ? `<p>Destination: ${escapeHTML(result.payment.pay_to || "—")} · ${escapeHTML(String(result.payment.amount_drops || "—"))} drops of XRP (xrpl:1).</p>` : ""}</div>`;
      button.textContent = "Check another endpoint";
    } catch (error) { $("#modal-error").textContent = error.message; button.textContent = "Run unpaid check"; }
    finally { button.disabled = false; }
  }});
}
async function refreshWalletStatus() {
  if (walletInfo.simulated) { updateWalletStatusUI(); updateLinkedAccountSummary(); showToast("Demo wallet is ready", `Simulated balance: ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP.`); return; }
  try {
    walletInfo = (await apiRequest("/health")).wallet || walletInfo;
    updateLinkedAccountSummary();
    $("#network-label").textContent = walletInfo.connected ? "XRPL Testnet" : "Testnet setup";
    $("#demo-tag").textContent = walletInfo.connected ? `${Number(walletInfo.balance_xrp || 0).toFixed(2)} XRP` : walletInfo.configured ? "OFFLINE" : "WALLET NEEDED";
    $("#network-label").title = walletInfo.connected ? `Testnet wallet ${walletInfo.address}` : walletInfo.error || "XRPL Testnet is currently unreachable";
    if (walletInfo.connected) showToast("Testnet wallet connected", `Balance: ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP.`);
    else { $("#modal-copy").textContent = `The wallet is saved on this computer. Testnet is not responding: ${walletInfo.error || "connection unavailable"}`; showToast("Still offline", walletInfo.error || "XRPL Testnet did not respond. Try again shortly.", true); }
  } catch (error) { showToast("Could not refresh wallet", error.message, true); }
}
async function refreshWalletActivity() {
  if (!apiOnline || walletInfo.simulated || !walletInfo.connected) return;
  try {
    const [feed, health] = await Promise.all([apiRequest("/wallet/activity"), apiRequest("/health")]);
    if (health.wallet) { walletInfo = health.wallet; updateWalletStatusUI(); updateLinkedAccountSummary(); }
    const known = new Map((state.transactions || []).filter((tx) => tx.txHash).map((tx) => [tx.txHash, tx]));
    let changed = false; const fresh = [];
    for (const entry of feed.activity || []) {
      const existing = known.get(entry.txHash);
      if (existing) { if (existing.status !== entry.status) changed = true; Object.assign(existing, entry); continue; }
      known.set(entry.txHash, entry); fresh.push(entry); changed = true;
    }
    // Reconcile requests against the full validated activity feed, even if the
    // matching transfer was already present before the request was created.
    for (const entry of feed.activity || []) {
      if (Number(entry.xrpAmount) <= 0) continue;
      const request = (state.transactions || []).find((tx) => tx.type === "Payment request" && tx.status === "Awaiting Testnet confirmation" && Number(tx.requestedXrp) > 0 && Math.abs(Number(tx.requestedXrp) - Number(entry.xrpAmount)) < 0.000001 && tx.destinationAddress === entry.destination && (!tx.expectedSourceAddress || tx.expectedSourceAddress === entry.source));
      if (request) { request.status = "Validated · Testnet"; request.txHash = entry.txHash; request.detail = `${request.detail} · received and validated`; changed = true; }
    }
    if (fresh.length) state.transactions = [...fresh, ...(state.transactions || [])].slice(0, 2000);
    if (changed) {
      persistRender();
      if (fresh.length) { const latest = fresh[0]; showToast(latest.xrpAmount > 0 ? "XRP received on Testnet" : "XRP sent on Testnet", `${latest.xrpAmount > 0 ? "+" : ""}${latest.xrpAmount.toFixed(6)} XRP · validated ledger activity.`); }
    }
  } catch (error) { console.debug("Wallet activity refresh is waiting for XRPL Testnet", error.message); }
}
function findWalletContact(email) { return (state.walletContacts || []).find((contact) => contact.email.toLowerCase() === email.trim().toLowerCase()); }
function openWalletContactsModal(returnToSupplier = null) {
  walletContactsReturnToSupplier = returnToSupplier;
  const contacts = state.walletContacts || [];
  openModal({ kicker: "EMAIL WALLET LINKS · TESTNET", title: "Linked wallet contacts", copy: "XRPL sends to wallet addresses, not email inboxes. Link a recipient email to their public Testnet address once, then send using the email alone.", submit: "Save email link", fields: `<div class="wallet-contact-list">${contacts.map((contact, index) => `<div class="wallet-contact"><span><strong>${escapeHTML(contact.name || contact.email)}</strong><small>${escapeHTML(contact.email)} · ${escapeHTML(contact.address.slice(0, 10))}…${escapeHTML(contact.address.slice(-5))}</small></span><button class="row-action row-action-delete" type="button" data-delete-wallet-contact="${index}">Remove</button></div>`).join("") || `<p class="form-hint">No linked email contacts yet.</p>`}</div><div class="form-field"><label for="wallet-contact-name">Recipient name (optional)</label><input id="wallet-contact-name" maxlength="80" placeholder="e.g. Amina" /></div><div class="form-field"><label for="wallet-contact-email">Email address</label><input id="wallet-contact-email" type="email" placeholder="name@example.com" autocomplete="email" /></div><div class="form-field"><label for="wallet-contact-address">Recipient XRPL Testnet address</label><input id="wallet-contact-address" placeholder="r…" autocomplete="off" /></div><p class="form-hint">Only the public wallet address is stored. Never enter a wallet seed or secret.</p>`, onSubmit: (root) => {
    const name = $("#wallet-contact-name", root).value.trim(); const email = $("#wallet-contact-email", root).value.trim().toLowerCase(); const address = $("#wallet-contact-address", root).value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("#modal-error").textContent = "Enter a valid email address."; return; }
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) { $("#modal-error").textContent = "Enter a valid-looking XRPL Testnet wallet address."; return; }
    state.walletContacts = (state.walletContacts || []).filter((contact) => contact.email.toLowerCase() !== email);
    state.walletContacts.push({ name, email, address }); persistRender(); openWalletContactsModal(returnToSupplier); showToast("Email wallet link saved", "You can now select this recipient by email.");
  }});
}
function openWalletWithdrawalModal() {
  if (!apiOnline && !walletInfo.simulated) { showToast("Local wallet service unavailable", "Open the dashboard through its local service before withdrawing Testnet XRP.", true); return; }
  const intentId = `withdraw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  openModal({ kicker: "XRPL TESTNET · WALLET WITHDRAWAL", title: "Send XRP", copy: walletInfo.connected ? "Send Test XRP worldwide to any XRPL Testnet wallet. Choose a wallet address or an email linked once to its public Testnet address." : `Create or reconnect your Testnet wallet first. Current status: ${walletInfo.error || "offline"}.`, submit: "Review withdrawal", fields: `<div class="form-field"><label for="withdraw-recipient-type">Recipient method</label><select id="withdraw-recipient-type"><option value="wallet">Wallet address</option><option value="email">Email linked to a wallet</option></select></div><div class="form-field" id="withdraw-email-field" hidden><label for="withdraw-recipient-email">Wallet-linked email</label><input id="withdraw-recipient-email" type="email" placeholder="name@example.com" autocomplete="email" /><button class="text-link" type="button" id="manage-wallet-contacts">Manage linked emails</button></div><div class="form-field" id="withdraw-address-field"><label for="withdraw-destination" id="withdraw-recipient-label">Recipient Testnet wallet address</label><input id="withdraw-destination" placeholder="r…" autocomplete="off" /></div><div class="form-field"><label for="withdraw-amount">Amount (XRP)</label><input id="withdraw-amount" type="number" min="0.000001" step="0.000001" placeholder="0.000000"/><span class="form-hint">Testnet balance: ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP · daily limit: 100 XRP.</span><span id="withdraw-amount-fx" class="form-hint">${escapeHTML(fxQuoteText(0))}</span></div><div id="withdraw-review"></div>`, onSubmit: async (root) => {
    const recipientType = $("#withdraw-recipient-type", root).value; const recipientEmail = recipientType === "email" ? $("#withdraw-recipient-email", root).value.trim() : ""; const destination = recipientType === "email" ? (findWalletContact(recipientEmail)?.address || "") : $("#withdraw-destination", root).value.trim(); const amount = Number($("#withdraw-amount", root).value);
    const review = $("#withdraw-review", root); const button = $("#modal-submit");
    if (!walletInfo.connected) {
      await refreshWalletStatus();
      if (!walletInfo.connected) { $("#modal-error").textContent = `The wallet is still offline, so this withdrawal cannot be sent yet. ${walletInfo.error || "Refresh again when XRPL Testnet is reachable."}`; button.textContent = "Check Testnet connection"; return; }
      $("#modal-copy").textContent = "Testnet is connected. Review the destination and amount before checking the withdrawal."; button.textContent = "Check withdrawal";
    }
    if (recipientType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) { $("#modal-error").textContent = "Enter a valid recipient email."; return; }
    if (recipientType === "email" && !findWalletContact(recipientEmail)) { $("#modal-error").textContent = "This email is not linked yet. Choose Manage linked emails to add its public Testnet address once."; return; }
    if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(destination)) { $("#modal-error").textContent = "Enter a valid-looking XRPL Testnet wallet address."; return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100) { $("#modal-error").textContent = "Enter an amount greater than zero and no more than 100 XRP."; return; }
    if (walletInfo.simulated) {
      if (amount > Number(walletInfo.balance_xrp || 0)) { $("#modal-error").textContent = `The demo wallet has ${Number(walletInfo.balance_xrp || 0).toFixed(6)} XRP available.`; return; }
      if (!review.dataset.demoReady) {
        review.innerHTML = `<div class="policy-result allowed"><strong>Confirm simulated withdrawal · ${amount.toFixed(6)} XRP</strong><p>To ${escapeHTML(destination)}${recipientEmail ? ` · ${escapeHTML(recipientEmail)}` : ""} · no XRPL transaction will be sent.</p></div>`;
        review.dataset.demoReady = "true"; review.dataset.destination = destination; review.dataset.recipientType = recipientType; review.dataset.recipientEmail = recipientEmail; review.dataset.amount = String(amount); button.textContent = "Approve demo withdrawal"; return;
      }
      if (review.dataset.destination !== destination || review.dataset.recipientType !== recipientType || review.dataset.recipientEmail !== recipientEmail || review.dataset.amount !== String(amount)) { delete review.dataset.demoReady; throw new Error("The recipient or amount changed. Review the demo withdrawal again."); }
      walletInfo.balance_xrp -= amount; state.simulatedWalletXrp = walletInfo.balance_xrp;
      state.transactions.unshift({ title: "Demo wallet withdrawal", detail: `To ${destination}${recipientEmail ? ` · ${recipientEmail}` : ""} · simulated`, type: "Wallet withdrawal", amount: 0, xrpAmount: -amount, time: "Just now", createdAt: new Date().toISOString(), icon: "↗", status: "Demo · simulated" });
      persistRender(); closeModal(); showToast("Demo withdrawal complete", `${amount.toFixed(6)} simulated XRP recorded. Nothing was sent to XRPL.`); return;
    }
    button.disabled = true; button.textContent = review.dataset.ready ? "Submitting Testnet withdrawal…" : "Checking wallet and ledger…";
    try {
      if (!review.dataset.ready) {
        const preview = await apiRequest("/wallet/withdraw/preview", { method: "POST", body: JSON.stringify({ destination, amount, intent_id: intentId }) });
        const detail = preview.preflight?.details || {};
        review.innerHTML = `<div class="policy-result allowed"><strong>Withdrawal checks passed · Testnet</strong><p>Destination, account balance, reserve, fee ceiling, daily limit, memo, and duplicate-intent checks passed.</p><div class="preflight-review">${recipientEmail ? `<span>Wallet-linked email <b>${escapeHTML(recipientEmail)}</b></span>` : ""}<span>To <b>${escapeHTML(destination)}</b></span><span>Send <b>${amount.toFixed(6)} XRP</b></span><span>Network fee <b>${escapeHTML(String(detail.fee_xrp ?? "See ledger"))} XRP</b></span><span>Keep reserved <b>${escapeHTML(String(detail.reserve_xrp ?? "See ledger"))} XRP</b></span><span>Last ledger <b>${escapeHTML(String(preview.last_ledger_sequence ?? "Set by preflight"))}</b></span></div><p>Confirming signs and submits this Testnet transaction. It cannot be cancelled after validation.</p></div>`;
        review.dataset.ready = "true"; review.dataset.destination = destination; review.dataset.recipientEmail = recipientEmail; review.dataset.amount = String(amount); button.textContent = "Approve & withdraw XRP";
      } else {
        if (review.dataset.destination !== destination || review.dataset.recipientEmail !== recipientEmail || review.dataset.amount !== String(amount)) { delete review.dataset.ready; throw new Error("The recipient, linked email or amount changed. Check the withdrawal again before approving."); }
        const result = await apiRequest("/wallet/withdraw", { method: "POST", body: JSON.stringify({ destination, amount, intent_id: intentId, approved: true }) });
        if (result.state) state = { ...initialState, ...result.state };
        if (recipientEmail) { const tx = state.transactions.find((entry) => entry.intentId === intentId); if (tx) tx.detail = `${tx.detail} · wallet-linked email ${recipientEmail}`; }
        try { walletInfo = (await apiRequest("/health")).wallet || walletInfo; } catch {}
        $("#demo-tag").textContent = `${Number(walletInfo.balance_xrp || 0).toFixed(2)} XRP`;
        persistRender(); closeModal(); await refreshWalletActivity();
        showToast(result.status === "validated" ? "Withdrawal validated" : "Withdrawal pending", result.message || "Check the transaction status before trying again.");
      }
    } catch (error) { $("#modal-error").textContent = error.message; if (error.message.includes("changed")) review.innerHTML = ""; button.textContent = review.dataset.ready ? "Approve & withdraw XRP" : "Check withdrawal"; }
    finally { button.disabled = false; }
  }});
}
function openStockModal(itemId = null) {
  const item = state.inventory.find((x) => x.id === itemId);
  const supplierOptions = `<option value="">Unassigned</option>${state.suppliers.map((supplier) => `<option value="${escapeHTML(supplier.name)}">${escapeHTML(supplier.name)}</option>`).join("")}`;
  openModal({ kicker: "INVENTORY", title: item ? "Adjust stock" : "Add an item", copy: item ? `Update the on-hand quantity for ${item.name}.` : "Add a product with a quantity, expiry date and price.", submit: item ? "Save adjustment" : "Add item", fields: item ? `<div class="form-field"><label>Product</label><input value="${escapeHTML(item.name)}" disabled /></div><div class="form-field"><label for="stock-qty">New quantity (${escapeHTML(item.unit)})</label><input id="stock-qty" type="number" min="0" value="${item.qty}" /></div>` : `<div class="form-field"><label for="stock-name">Product name</label><input id="stock-name" placeholder="e.g. Maize meal 2kg" /></div><div class="form-field"><label for="stock-category">Category</label><input id="stock-category" placeholder="e.g. Pantry" value="Pantry" /></div><div class="form-field"><label for="stock-qty">Quantity</label><input id="stock-qty" type="number" min="1" value="1" /></div><div class="form-field"><label for="stock-expiry">Best before</label><input id="stock-expiry" type="date" value="2027-02-01" /></div><div class="form-field"><label for="stock-price">Selling price (ZAR)</label><input id="stock-price" type="number" min="0.01" step="0.01" value="20" /></div><div class="form-field"><label for="stock-supplier">Supplier</label><select id="stock-supplier">${supplierOptions}</select></div>`, onSubmit: (root) => {
    const qty = Number($("#stock-qty", root).value); if (!Number.isInteger(qty) || qty < 0 || (!item && qty < 1)) { $("#modal-error").textContent = "Enter a valid stock quantity."; return; }
    if (item) { item.qty = qty; state.transactions.unshift({ title: "Stock adjusted", detail: `${item.name} · ${qty} on hand`, type: "Inventory", amount: 0, time: "Just now", icon: "＋", status: "Complete" }); }
    else { const name = $("#stock-name", root).value.trim(); const category = $("#stock-category", root).value.trim() || "General"; const expiry = $("#stock-expiry", root).value; const price = Number($("#stock-price", root).value); if (!name || !expiry || !Number.isFinite(price) || price <= 0) { $("#modal-error").textContent = "Enter a name, best-before date and price greater than zero."; return; } if (state.inventory.some((existing) => existing.name.toLowerCase() === name.toLowerCase())) { $("#modal-error").textContent = "An item with that name is already in your inventory."; return; } state.inventory.push({ id: Date.now(), name, category, icon: "📦", qty, unit: "units", expiry, supplier: $("#stock-supplier", root).value || "Unassigned", cost: price * .75, price }); state.transactions.unshift({ title: "Product added", detail: `${name} · ${qty} units`, type: "Inventory", amount: 0, time: "Just now", icon: "＋", status: "Complete" }); }
    persistRender(); closeModal(); showToast(item ? "Stock updated" : "Product added", item ? `${item.name} now has ${qty} ${item.unit}.` : "Your new product is in your inventory.");
  }});
}
function deleteItem(id) {
  const item = state.inventory.find((entry) => entry.id === id); if (!item) return;
  openModal({ kicker: "REMOVE FROM INVENTORY", title: "Delete this item?", copy: `${item.name} and its current stock of ${item.qty} ${item.unit} will be removed from the shop.`, submit: "Delete item", fields: "", onSubmit: () => {
    state.inventory = state.inventory.filter((entry) => entry.id !== id); state.transactions.unshift({ title: "Item deleted", detail: `${item.name} · ${item.qty} ${item.unit} removed`, type: "Inventory", amount: 0, time: "Just now", icon: "−", status: "Removed" });
    persistRender(); closeModal(); showToast("Item deleted", `${item.name} was removed from your inventory.`);
  }});
}
function openSupplierModal(supplierName = null) {
  const existing = state.suppliers.find((supplier) => supplier.name === supplierName);
  const title = existing ? "Edit supplier" : "Add a supplier";
  const name = existing?.name || ""; const type = existing?.type || ""; const cap = existing?.cap || 50;
  const linkedEmail = existing?.paymentEmail || "";
  const emailOptions = `<option value="">Choose linked email (optional)</option>${(state.walletContacts || []).map((contact) => `<option value="${escapeHTML(contact.email)}" ${contact.email === linkedEmail ? "selected" : ""}>${escapeHTML(contact.name || contact.email)} · ${escapeHTML(contact.email)}</option>`).join("")}`;
  openModal({ kicker: "SUPPLIER ALLOWLIST", title, copy: "Supplier limits are checked before any Testnet payment. Save a public wallet address, an x402 service URL, or both. Never enter a secret key.", submit: existing ? "Save supplier" : "Add supplier", fields: `<div class="form-field"><label for="supplier-name">Supplier name</label><input id="supplier-name" value="${escapeHTML(name)}" placeholder="e.g. City Fresh Produce" ${existing ? "disabled" : ""}/></div><div class="form-field"><label for="supplier-type">What they supply</label><input id="supplier-type" value="${escapeHTML(type)}" placeholder="e.g. Fresh produce" /></div><div class="form-field"><label for="supplier-cap">Payment limit (XRP · maximum 50)</label><input id="supplier-cap" type="number" min="0.01" max="50" step="0.01" value="${cap}" /></div><div class="form-field"><label for="supplier-address">Supplier XRPL Testnet wallet address</label><input id="supplier-address" value="${escapeHTML(existing?.xrplAddress || "")}" placeholder="r…" autocomplete="off" /><span class="form-hint">The public address that receives XRP. Never enter a seed or secret.</span></div><div class="form-field"><label for="supplier-email">Or choose a linked email</label><select id="supplier-email">${emailOptions}</select><button class="text-link" type="button" id="manage-wallet-contacts" data-return-to-supplier="${escapeHTML(existing?.name || "__new__")}">Manage linked emails</button></div><div class="form-field"><label for="supplier-x402-endpoint">x402 service URL (optional)</label><input id="supplier-x402-endpoint" type="url" value="${escapeHTML(existing?.x402Endpoint || "")}" placeholder="https://supplier.example/resource"/><span class="form-hint">For x402 route, the service must provide a matching XRP payment request on XRPL Testnet. A URL alone does not receive payment.</span></div>`, onSubmit: (root) => {
    const supplierNameValue = existing?.name || $("#supplier-name", root).value.trim(); const supplierType = $("#supplier-type", root).value.trim(); const supplierCap = Number($("#supplier-cap", root).value); const addressInput = $("#supplier-address", root).value.trim(); const paymentEmail = $("#supplier-email", root).value.trim(); const x402Endpoint = $("#supplier-x402-endpoint", root).value.trim(); const linkedContact = paymentEmail ? findWalletContact(paymentEmail) : null; const xrplAddress = addressInput || linkedContact?.address || "";
    if (!supplierNameValue || !supplierType || !Number.isFinite(supplierCap) || supplierCap <= 0 || supplierCap > 50) { $("#modal-error").textContent = "Enter a name, supplier type and a payment limit from 0.01 to 50 XRP."; return; }
    if (!existing && state.suppliers.some((supplier) => supplier.name.toLowerCase() === supplierNameValue.toLowerCase())) { $("#modal-error").textContent = "That supplier is already on your approved list."; return; }
    if (paymentEmail && !linkedContact) { $("#modal-error").textContent = "Link this email to the supplier’s public Testnet address first."; return; }
    if (addressInput && linkedContact && addressInput !== linkedContact.address) { $("#modal-error").textContent = "The entered address does not match the selected linked email. Choose one destination."; return; }
    if (xrplAddress && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(xrplAddress)) { $("#modal-error").textContent = "Enter a valid-looking XRPL classic address, or leave it blank for now."; return; }
    if (x402Endpoint && !/^https:\/\//i.test(x402Endpoint)) { $("#modal-error").textContent = "Enter a public HTTPS x402 service URL, or leave it blank."; return; }
    if (existing) { existing.type = supplierType; existing.cap = supplierCap; existing.xrplAddress = xrplAddress; existing.paymentEmail = paymentEmail; existing.x402Endpoint = x402Endpoint; }
    else { const initials = supplierNameValue.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); state.suppliers.push({ name: supplierNameValue, type: supplierType, initials, cap: supplierCap, orders: 0, xrplAddress, paymentEmail, x402Endpoint }); state.transactions.unshift({ title: "Supplier added", detail: `${supplierNameValue} · ${supplierCap.toFixed(2)} XRP payment limit`, type: "Supplier", amount: 0, time: "Just now", icon: "＋", status: "Approved" }); }
    persistRender(); closeModal(); goTo("suppliers"); showToast(existing ? "Supplier updated" : "Supplier added", existing ? `${supplierNameValue} details were saved.` : `${supplierNameValue} is now on your approved supplier list.`);
  }});
}
function deleteSupplier(name) {
  if (!state.suppliers.some((supplier) => supplier.name === name)) return;
  openModal({ kicker: "SUPPLIER ALLOWLIST", title: "Remove this supplier?", copy: `${name} will be removed from your approved list and can no longer receive demo payments. Existing inventory records will be kept.`, submit: "Remove supplier", fields: "", onSubmit: () => {
    state.suppliers = state.suppliers.filter((supplier) => supplier.name !== name); state.transactions.unshift({ title: "Supplier removed", detail: `${name} · removed from approved list`, type: "Supplier", amount: 0, time: "Just now", icon: "−", status: "Removed" });
    persistRender(); closeModal(); goTo("suppliers"); showToast("Supplier removed", `${name} can no longer receive payments from this shop.`);
  }});
}
function viewMemo(intentId) {
  const tx = state.transactions.find((entry) => entry.intentId === intentId); if (!tx?.memo) return;
  const json = JSON.stringify(tx.memo, null, 2); const bytes = new TextEncoder().encode(json).length;
  const submitted = Boolean(tx.txHash);
  openModal({ kicker: submitted ? `XRPL TESTNET · ${escapeHTML(tx.status)}` : "LOCAL DEMO RECORD · NOT SUBMITTED", title: "Payment intent memo", copy: submitted ? `Transaction hash: ${tx.txHash}. The status shown in the activity list distinguishes pending from validated results.` : "This is a local audit preview only. It is not an XRPL transaction or confirmation.", submit: "Close", fields: `<pre class="memo-preview">${escapeHTML(json)}</pre><p class="memo-footnote">${bytes} UTF-8 bytes in this JSON preview. XRPL limits the serialized Memos field to 1 KB; the service checks the encoded memo before signing.</p>`, onSubmit: closeModal });
}
function openOwnerProfileModal() {
  openModal({ kicker: "SHOP PROFILE", title: "Edit shop details", copy: "Update the name shown on your shop dashboard and owner profile.", submit: "Save details", fields: `<div class="form-field"><label for="owner-name">Shop owner</label><input id="owner-name" maxlength="80" value="${escapeHTML(state.ownerName || "Eunatia Ngobeni")}" /></div><div class="form-field"><label for="shop-title">Shop name</label><input id="shop-title" maxlength="100" value="${escapeHTML(state.shopName || "The Digital Mark Spaza Shop")}" /></div>`, onSubmit: (root) => {
    const ownerName = $("#owner-name", root).value.trim(); const shopName = $("#shop-title", root).value.trim();
    if (!ownerName || !shopName) { $("#modal-error").textContent = "Enter both an owner name and a shop name."; return; }
    state.ownerName = ownerName; state.shopName = shopName; updateIdentity(); save(); closeModal(); showToast("Shop profile saved", `${ownerName} · ${shopName}`);
  }});
}
function openMoneyModal(kind) {
  const deposit = kind === "deposit";
  openModal({
    kicker: deposit ? "ADD TO STORE ACCOUNT" : "WITHDRAW FROM STORE ACCOUNT",
    title: deposit ? "Choose how to deposit" : "Choose how to withdraw",
    copy: deposit ? "Choose demo card checkout, a Testnet wallet address, or an email linked to a wallet." : `Available ZAR balance: ${zar(state.storeBalance)}. Choose a route for this withdrawal.`,
    submit: deposit ? "Continue" : "Continue",
    fields: deposit
      ? `<div class="form-field"><label for="money-method">Payment method</label><select id="money-method"><option value="card">Card · demo checkout</option><option value="wallet">XRPL Testnet wallet address</option><option value="email">Email linked to a wallet</option></select></div><div class="form-field"><label for="money-amount" id="money-amount-label">Amount (ZAR)</label><input id="money-amount" type="number" min="1" step="0.01" value="250.00" /></div><div id="card-deposit-fields"><div class="demo-card-note">SAMPLE CARD DETAILS · NO CHARGE WILL BE MADE</div><div class="form-field"><label for="demo-card-name">Name on card</label><input id="demo-card-name" value="Eunatia Ngobeni" autocomplete="off" /></div><div class="form-field"><label for="demo-card-number">Card number</label><input id="demo-card-number" inputmode="numeric" value="4242 4242 4242 4242" autocomplete="off" /></div><div class="form-row"><div class="form-field"><label for="demo-card-expiry">Expiry</label><input id="demo-card-expiry" value="12/30" placeholder="MM/YY" autocomplete="off" /></div><div class="form-field"><label for="demo-card-cvv">Security code</label><input id="demo-card-cvv" inputmode="numeric" value="123" autocomplete="off" /></div></div><div class="form-field"><label for="demo-card-email">Receipt email</label><input id="demo-card-email" type="email" value="eunatia@example.com" autocomplete="off" /></div></div><div id="wallet-deposit-fields" hidden><p class="form-hint">Enter the public address of the wallet you will send from, then send XRP from that wallet to the shop address below. An address identifies the sender; it cannot move funds by itself.</p><div class="form-field"><label for="deposit-sender-wallet">Sending wallet address · Testnet</label><input id="deposit-sender-wallet" placeholder="r…" autocomplete="off" /></div><div class="form-field"><label>Shop receiving address · Testnet</label><input value="${escapeHTML(walletInfo.address || "Create a Testnet wallet first")}" readonly /></div><button type="button" class="button button-secondary" id="copy-receive-address">Copy shop address</button></div><div id="email-deposit-fields" hidden><div class="form-field"><label for="deposit-wallet-email">Email for this deposit</label><input id="deposit-wallet-email" type="email" placeholder="you@example.com" autocomplete="email" /></div><div class="form-field"><label for="email-deposit-sender-wallet">Sending wallet address · Testnet</label><input id="email-deposit-sender-wallet" placeholder="r…" autocomplete="off" /></div><p class="form-hint">Email is a contact reference. Enter the public address you will send from, then send XRP to the shop address below. An address alone cannot move funds.</p><div class="form-field"><label>Shop receiving address · Testnet</label><input value="${escapeHTML(walletInfo.address || "Create a Testnet wallet first")}" readonly /></div><button type="button" class="button button-secondary" id="copy-receive-address">Copy shop address</button></div>`
      : `<div class="form-field"><label for="money-method">Withdrawal method</label><select id="money-method"><option value="bank">Pay out to bank account</option><option value="refund">Refund an original card payment</option><option value="xrp">Withdraw XRP · XRPL Testnet</option></select></div><div id="withdrawal-route-fields"><p class="form-hint">Bank payout and card refund require a connected Paystack account. Refunds can only go back to the original card payment.</p></div>`,
    onSubmit: async (root) => {
      const method = $("#money-method", root).value;
      if (method === "xrp") { closeModal(); deposit ? openReceiveXrpModal() : openWalletWithdrawalModal(); return; }
      if (!deposit) { openPaystackWithdrawalModal(method); return; }
      const amount = Number($("#money-amount", root).value); const isCard = method === "card";
      if (!Number.isFinite(amount) || amount < (isCard ? 1 : 0.000001)) { $("#modal-error").textContent = isCard ? "Enter an amount of at least R1.00." : "Enter at least 0.000001 XRP."; return; }
      let detail = ""; let title = "Demo card deposit";
      if (method === "card") {
        const number = $("#demo-card-number", root).value.replace(/\D/g, ""); const expiry = $("#demo-card-expiry", root).value.trim(); const cvv = $("#demo-card-cvv", root).value.trim(); const email = $("#demo-card-email", root).value.trim();
        if (!$("#demo-card-name", root).value.trim() || !/^\d{13,19}$/.test(number) || !/^\d{2}\/\d{2}$/.test(expiry) || !/^\d{3,4}$/.test(cvv) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#modal-error").textContent = "Complete the sample card name, number, expiry, security code and receipt email."; return; }
        detail = `Demo card checkout · ${email}`;
      } else if (method === "wallet") {
        if (!walletInfo.address) { $("#modal-error").textContent = "Set up the shop Testnet wallet first."; return; }
        const senderAddress = $("#deposit-sender-wallet", root).value.trim();
        if (senderAddress && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(senderAddress)) { $("#modal-error").textContent = "Enter a valid-looking XRPL Testnet sender wallet address, or leave it blank."; return; }
        if (senderAddress === walletInfo.address) { $("#modal-error").textContent = "The sending wallet must be different from the shop receiving wallet."; return; }
        root.dataset.depositSenderAddress = senderAddress;
        title = "Testnet XRP deposit request"; detail = `Send ${amount.toFixed(6)} XRP to the shop wallet${senderAddress ? ` from ${senderAddress.slice(0, 9)}…` : ""} · awaiting validation`;
      } else {
        const email = $("#deposit-wallet-email", root).value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $("#modal-error").textContent = "Enter a valid email address."; return; }
        if (!walletInfo.address) { $("#modal-error").textContent = "Set up the shop Testnet wallet first."; return; }
        const senderAddress = $("#email-deposit-sender-wallet", root).value.trim();
        if (senderAddress && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(senderAddress)) { $("#modal-error").textContent = "Enter a valid-looking XRPL Testnet sender wallet address, or leave it blank."; return; }
        if (senderAddress === walletInfo.address) { $("#modal-error").textContent = "The sending wallet must be different from the shop receiving wallet."; return; }
        root.dataset.depositSenderAddress = senderAddress;
        title = "Email-linked XRP deposit request"; detail = `${email} · send ${amount.toFixed(6)} XRP to the shop wallet${senderAddress ? ` from ${senderAddress.slice(0, 9)}…` : ""} · awaiting validation`;
      }
      if (method === "card") {
        state.storeBalance = Number(state.storeBalance || 0) + amount; state.settledBalanceZar = Number(state.settledBalanceZar || 0) + amount; state.cashIn += amount;
        state.transactions.unshift({ title, detail, type: "Deposit", amount, time: "Just now", createdAt: new Date().toISOString(), icon: "↓", status: "Demo · no charge", providerReference: `DEMO-CARD-${Date.now()}`, paymentMethod: method });
        persistRender(); closeModal(); showToast("Demo card checkout complete", `${zar(amount)} added to the sample shop ledger. No card was charged.`); return;
      }
      state.transactions.unshift({ title, detail, type: "Payment request", amount: 0, requestedXrp: amount, destinationAddress: walletInfo.address, expectedSourceAddress: root.dataset.depositSenderAddress || "", time: "Just now", createdAt: new Date().toISOString(), icon: "↗", status: "Awaiting Testnet confirmation", paymentMethod: method });
      persistRender(); closeModal(); showToast("Testnet deposit request saved", `Request for ${amount.toFixed(6)} XRP saved. Wallet activity updates when the payment validates.`);
    },
  });
  if (deposit) {
    const methodSelect = $("#money-method");
    methodSelect.addEventListener("change", () => {
      const method = methodSelect.value;
      $("#card-deposit-fields").hidden = method !== "card";
      $("#wallet-deposit-fields").hidden = method !== "wallet";
      $("#email-deposit-fields").hidden = method !== "email";
      $("#money-amount-label").textContent = method === "card" ? "Amount (ZAR)" : "Amount (XRP)";
      $("#money-amount").min = method === "card" ? "1" : "0.000001";
      $("#money-amount").step = method === "card" ? "0.01" : "0.000001";
      $("#money-amount").value = method === "card" ? "250.00" : "1.000000";
      $("#modal-submit").textContent = method === "card" ? "Complete demo checkout" : "Create Testnet payment request";
    });
    $("#modal-submit").textContent = "Complete demo checkout";
  }
}
function openPaystackWithdrawalModal(method) {
  const refund = method === "refund";
  const cardPayments = state.transactions.filter((tx) => tx.providerReference && (tx.status === "Verified · Paystack" || (demoMode && tx.status === "Demo · simulated")) && Number(tx.amount) > 0);
  if (refund && !cardPayments.length) {
    showToast("No card payments to refund", "Refunds can only be sent to the original card used for a verified Paystack payment.", true);
    return;
  }
  const opId = `spaza_withdraw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const refundOptions = cardPayments.map((tx) => `<option value="${escapeHTML(tx.providerReference)}" data-max="${Number(tx.amount)}">${zar(tx.amount)} · ${escapeHTML(tx.providerReference.slice(0, 18))}…</option>`).join("");
  openModal({
    kicker: demoMode ? "DEMO · SIMULATED WITHDRAWAL" : refund ? "PAYSTACK · CARD REFUND" : "PAYSTACK · BANK PAYOUT",
    title: refund ? "Refund a card payment" : "Pay out to a bank account",
    copy: demoMode ? "Practice the withdrawal journey. The sample account updates, but no refund, card charge or bank transfer occurs." : refund ? "Refunds go back to the original card. The store ledger updates only after Paystack confirms the refund." : "Send a payout from your Paystack balance to your bank. The store ledger updates only after Paystack confirms the payout.",
    submit: refund ? "Review refund" : "Review bank payout",
    fields: refund
      ? `<div class="form-field"><label for="refund-reference">Original verified card payment</label><select id="refund-reference">${refundOptions}</select></div><div class="form-field"><label for="money-amount">Refund amount (ZAR)</label><input id="money-amount" type="number" min="1" step="0.01" max="${Number(cardPayments[0]?.amount || 0)}" value="${Number(cardPayments[0]?.amount || 0).toFixed(2)}" /></div><p class="form-hint">Available for verified card or bank withdrawal: ${zar(state.settledBalanceZar || 0)}.</p>`
      : `<div class="form-field"><label for="money-amount">Payout amount (ZAR)</label><input id="money-amount" type="number" min="1" step="0.01" max="${Number(state.settledBalanceZar || 0)}" placeholder="0.00" /></div><div class="form-field"><label for="bank-account-name">Account holder name</label><input id="bank-account-name" maxlength="120" autocomplete="off" /></div><div class="form-field"><label for="bank-account-number">Bank account number</label><input id="bank-account-number" inputmode="numeric" maxlength="30" autocomplete="off" /></div><div class="form-field"><label for="bank-code">Paystack bank code</label><input id="bank-code" maxlength="20" placeholder="Use the code provided by your bank or Paystack" /></div><p class="form-hint">Available from verified Paystack deposits: ${zar(state.settledBalanceZar || 0)}. Paystack must also have enough funds to process the payout.</p>`,
    onSubmit: async (root) => {
      const amount = Number($("#money-amount", root).value);
      if (!Number.isFinite(amount) || amount < 1 || amount > Number(state.settledBalanceZar || 0)) { $("#modal-error").textContent = `Enter an amount from R1.00 up to the verified available balance of ${zar(state.settledBalanceZar || 0)}.`; return; }
      if (refund && amount > Number($("#refund-reference", root).selectedOptions[0].dataset.max)) { $("#modal-error").textContent = "A refund cannot exceed the original card payment."; return; }
      const request = { method: refund ? "refund" : "bank", amount_zar: amount, operation_id: opId, approved: true };
      if (refund) request.card_reference = $("#refund-reference", root).value;
      else {
        request.account_name = $("#bank-account-name", root).value.trim(); request.account_number = $("#bank-account-number", root).value.trim(); request.bank_code = $("#bank-code", root).value.trim();
        if (!request.account_name || !/^\d{6,30}$/.test(request.account_number) || !request.bank_code) { $("#modal-error").textContent = "Enter the account holder, a valid account number and the Paystack bank code."; return; }
      }
      const button = $("#modal-submit");
      if (button.dataset.reviewId !== opId) {
        const target = refund ? `Back to original card · reference ${request.card_reference}` : `To ${request.account_name} · account ending ${request.account_number.slice(-4)} · bank code ${request.bank_code}`;
        $("#modal-error").innerHTML = `<div class="policy-result"><strong>Confirm ${demoMode ? "simulated " : ""}${refund ? "card refund" : "bank payout"} · ${zar(amount)}</strong><p>${escapeHTML(target)}. ${demoMode ? "This changes demo data only." : "Only verified Paystack funds can be withdrawn."}</p></div>`;
        button.dataset.reviewId = opId; button.textContent = refund ? "Approve & refund card" : "Approve & pay bank"; return;
      }
      if (demoMode) {
        state.storeBalance -= amount; state.settledBalanceZar -= amount; state.cashOut += amount;
        state.transactions.unshift({ title: refund ? "Demo card refund" : "Demo bank payout", detail: `${zar(amount)} · simulated`, type: "Withdrawal", amount: -amount, time: "Just now", icon: "↑", status: "Demo · simulated" });
        persistRender(); closeModal(); showToast("Demo withdrawal complete", `${zar(amount)} recorded. No card refund or bank transfer was made.`); return;
      }
      button.disabled = true; button.textContent = "Sending to Paystack…";
      try {
        const result = await apiRequest("/paystack/withdraw", { method: "POST", body: JSON.stringify(request) });
        if (result.status === "success") { const remote = await apiRequest("/state"); if (remote.state) state = { ...initialState, ...remote.state }; persistRender(); closeModal(); showToast("Withdrawal processed", `${zar(amount)} · Paystack confirmed the request.`); }
        else {
          state.transactions.unshift({ title: refund ? "Card refund" : "Bank payout", detail: `Paystack request · ${zar(amount)}`, type: "Withdrawal", amount: 0, time: "Just now", icon: "↑", status: "Pending · Paystack", operationId: opId });
          persistRender(); closeModal(); showToast("Withdrawal pending", `${result.message} Use Check status in Transactions. Reference: ${opId}`);
        }
      } catch (error) { $("#modal-error").textContent = error.message; }
      finally { button.disabled = false; if ($("#modal-backdrop").classList.contains("open")) button.textContent = refund ? "Review refund" : "Review bank payout"; }
    },
  });
}
function disposeItem(id) {
  const item = state.inventory.find((x) => x.id === id); if (!item || daysUntil(item.expiry) > 0) return;
  const qty = item.qty; state.inventory = state.inventory.filter((entry) => entry.id !== id); state.transactions.unshift({ title: "WasteClear", detail: `Expired ${item.name} · ${qty} disposed`, type: "Disposal", amount: 0, time: "Just now", icon: "♻", status: "Disposed" }); persistRender(); showToast("Expired stock disposed", `${item.name} was removed from inventory and routed to disposal.`);
}
function rogueScenario() {
  const verdict = runPolicyCheck("BreadCo", 500); const evidence = { blocked: true, blocked_by: "policy_engine", reason: verdict.reason || "Requested 500 XRP exceeds the approved supplier cap.", transaction_constructed: false, transaction_signed: false, transaction_submitted: false, xrpl_result: null };
  if (activePage !== "policy") goTo("policy");
  $("#policy-evidence").innerHTML = `<div class="scenario-evidence"><div class="evidence-row"><span>blocked</span><b>true</b></div><div class="evidence-row"><span>blocked_by</span><b>policy_engine</b></div><div class="evidence-reason">${escapeHTML(evidence.reason)}</div><div class="evidence-row"><span>transaction_constructed</span><b class="evidence-false">false</b></div><div class="evidence-row"><span>transaction_signed</span><b class="evidence-false">false</b></div><div class="evidence-row"><span>transaction_submitted</span><b class="evidence-false">false</b></div><div class="evidence-row"><span>xrpl_result</span><b>null</b></div></div>`;
  showToast("Rogue payment blocked", "Policy gate stopped the request before a transaction was built.", true);
}
document.addEventListener("click", (event) => {
  if (!event.target.closest(".topbar-actions") && !$("#notification-panel").hidden) { $("#notification-panel").hidden = true; $("#notifications-button").setAttribute("aria-expanded", "false"); }
  if (event.target.closest("#notifications-button")) { const panel = $("#notification-panel"); panel.hidden = !panel.hidden; $("#notifications-button").setAttribute("aria-expanded", String(!panel.hidden)); renderNotifications(); return; }
  if (event.target.closest("#mark-notifications-read")) { state.readNotifications = getNotifications().map((note) => note.id); save(); renderNotifications(); return; }
  const notification = event.target.closest("[data-notification-id]"); if (notification) { const id = notification.dataset.notificationId; if (!state.readNotifications.includes(id)) state.readNotifications.push(id); save(); renderNotifications(); return; }
  const money = event.target.closest("[data-money]"); if (money) { openMoneyModal(money.dataset.money); return; }
  const checkPaystack = event.target.closest("[data-check-paystack]"); if (checkPaystack) {
    const operationId = checkPaystack.dataset.checkPaystack; checkPaystack.disabled = true; checkPaystack.textContent = "Checking…";
    apiRequest(`/paystack/withdraw/status?operation_id=${encodeURIComponent(operationId)}`).then(async (result) => {
      const tx = state.transactions.find((item) => item.operationId === operationId);
      if (result.status === "success") { const remote = await apiRequest("/state"); if (remote.state) state = { ...initialState, ...remote.state }; if (tx) tx.status = "Processed · Paystack"; persistRender(); showToast("Withdrawal processed", "Paystack confirmed the withdrawal and the store ledger was updated."); }
      else if (result.status === "failed") { if (tx) tx.status = "Failed · Paystack"; persistRender(); showToast("Withdrawal failed", "Paystack did not complete the request. No store balance was deducted.", true); }
      else { showToast("Still pending", "Paystack has not completed this request yet. Check again later."); }
    }).catch((error) => showToast("Could not check status", error.message, true)).finally(() => { if (checkPaystack.isConnected) { checkPaystack.disabled = false; checkPaystack.textContent = "Check status"; } });
    return;
  }
  if (event.target.closest("#owner-profile")) { openOwnerProfileModal(); return; }
  if (event.target.closest("#wallet-setup")) { openWalletSetupModal(); return; }
  if (event.target.closest("#x402-oracle-open")) { openX402OracleModal(); return; }
  if (event.target.closest("#payment-edit-supplier")) { openSupplierModal($("#pay-supplier")?.value || null); return; }
  if (event.target.closest("#wallet-withdraw-open")) { openWalletWithdrawalModal(); return; }
  if (event.target.closest("#wallet-receive-open")) { openReceiveXrpModal(); return; }
  if (event.target.closest("#wallet-refresh")) { refreshWalletStatus(); return; }
  const manageContacts = event.target.closest("#manage-wallet-contacts"); if (manageContacts) { openWalletContactsModal(manageContacts.dataset.returnToSupplier || null); return; }
  const deleteContact = event.target.closest("[data-delete-wallet-contact]"); if (deleteContact) { state.walletContacts.splice(Number(deleteContact.dataset.deleteWalletContact), 1); persistRender(); openWalletContactsModal(walletContactsReturnToSupplier); return; }
  if (event.target.closest("#refresh-rates")) { refreshExchangeRates(true); return; }
  if (event.target.closest("#invest-profit")) { openXrpInvestmentModal(); return; }
  if (event.target.closest("#copy-receive-address")) { if (navigator.clipboard?.writeText) navigator.clipboard.writeText(walletInfo.address).then(() => showToast("Address copied", "Share the public address to receive XRPL Testnet XRP.")).catch(() => showToast("Copy unavailable", "Select and copy the address from the field.")); else showToast("Copy unavailable", "Select and copy the address from the field."); return; }
  if (event.target.closest("#add-supplier")) { openSupplierModal(); return; }
  const editSupplier = event.target.closest("[data-edit-supplier]"); if (editSupplier) { openSupplierModal(editSupplier.dataset.editSupplier); return; }
  const deleteItemButton = event.target.closest("[data-delete-item]"); if (deleteItemButton) { deleteItem(Number(deleteItemButton.dataset.deleteItem)); return; }
  const deleteSupplierButton = event.target.closest("[data-delete-supplier]"); if (deleteSupplierButton) { deleteSupplier(deleteSupplierButton.dataset.deleteSupplier); return; }
  if (event.target.closest("#add-stock")) { openStockModal(); return; }
  const memoButton = event.target.closest("[data-view-memo]"); if (memoButton) { viewMemo(memoButton.dataset.viewMemo); return; }
  if (event.target.closest("#kill-switch")) { policy.killSwitch = !policy.killSwitch; save(); goTo("policy"); showToast("Kill switch updated", policy.killSwitch ? "All supplier payments are paused." : "Supplier payments can be checked against your policy."); return; }
  const nav = event.target.closest("[data-page]"); if (nav) { goTo(nav.dataset.page); return; }
  const goto = event.target.closest("[data-go]"); if (goto) { goTo(goto.dataset.go); return; }
  const pay = event.target.closest(".pay-supplier"); if (pay) { openPaymentModal(pay.dataset.supplier); return; }
  const adjust = event.target.closest("[data-adjust]"); if (adjust) { openStockModal(Number(adjust.dataset.adjust)); return; }
  const dispose = event.target.closest("[data-dispose]"); if (dispose) { disposeItem(Number(dispose.dataset.dispose)); return; }
});
$("#open-sale").addEventListener("click", openSaleModal);
$("#run-rogue").addEventListener("click", rogueScenario);
$("#modal-close").addEventListener("click", closeModal); $("#modal-cancel").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#reset-demo").addEventListener("click", () => { state = structuredClone(initialState); addDemoAnalyticsHistory(state); policy = { killSwitch: false, dailyCap: 100, policyVersion: "20260530" }; save(); if (apiOnline) apiRequest("/state", { method: "PUT", body: JSON.stringify({ state, policy, reset: true }) }).catch(() => {}); goTo("dashboard"); updateStats(); showToast("Demo reset", "Your sample shop data is back to the start."); });
$("#help-button").addEventListener("click", () => showToast("Help centre", "Your shop support team is here to help."));
document.addEventListener("input", (e) => { if (e.target.id === "inventory-search") renderInventory(); if (e.target.id === "transaction-search") renderTransactions(); });
document.addEventListener("input", (e) => { if (e.target.id === "fx-amount") renderExchangeRate(); if (e.target.id === "pay-amount") updateModalFxQuote("pay-amount", "pay-amount-fx"); if (e.target.id === "withdraw-amount") updateModalFxQuote("withdraw-amount", "withdraw-amount-fx"); });
document.addEventListener("change", (e) => { if (["inventory-filter"].includes(e.target.id)) renderInventory(); if (e.target.id === "transaction-filter") renderTransactions(); if (e.target.id === "fx-currency") { selectedFxCurrency = e.target.value; localStorage.setItem("spaza-fx-currency", selectedFxCurrency); renderExchangeRate(); } if (e.target.id === "withdraw-recipient-type") { const email = e.target.value === "email"; $("#withdraw-email-field").hidden = !email; $("#withdraw-address-field").hidden = email; $("#withdraw-recipient-label").textContent = "Recipient Testnet wallet address"; } if (e.target.id === "money-method" && $("#money-amount-label")) { const method = e.target.value; const card = method === "card"; $("#card-deposit-fields").hidden = !card; $("#wallet-deposit-fields").hidden = method !== "wallet"; $("#email-deposit-fields").hidden = method !== "email"; $("#money-amount-label").textContent = card ? "Amount (ZAR)" : "Amount (XRP)"; $("#money-amount").min = card ? "1" : "0.000001"; $("#money-amount").step = card ? "0.01" : "0.000001"; $("#money-amount").value = card ? "250.00" : "1.000000"; } });
$("#chart-period").addEventListener("change", () => { renderAnalytics(); showToast("Shop analytics updated", `Showing recorded sales, supplier spend and estimated net profit for the past ${activeAnalyticsDays() === 7 ? "week" : activeAnalyticsDays() === 30 ? "month" : "3 months"}.`); });
const languageSelect = $("#language-select");
languageSelect.value = currentLanguage;
languageSelect.addEventListener("change", () => {
  currentLanguage = languageLocales[languageSelect.value] ? languageSelect.value : "en";
  localStorage.setItem("spaza-language", currentLanguage);
  renderTodayLabel(); translatePage();
  updateStats(); renderDashboard();
  if (activePage !== "dashboard") goTo(activePage);
});
translatePage();
new MutationObserver(() => translatePage()).observe(document.body, { childList: true, characterData: true, subtree: true });
updateStats(); renderDashboard();
connectLocalService();
setInterval(() => refreshExchangeRates(false), 90000);
setInterval(() => refreshWalletActivity(), 5000);
