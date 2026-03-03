import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

// ═══ CONSTANTS & UTILITIES ═══
// ═══════════════════════════════════════════════
// CONSTANTS & UTILITY FUNCTIONS
// ═══════════════════════════════════════════════

// ── Bonus & Payment ──
const DEFAULT_BONUS_PERCENT = 3;
const REVIEW_BONUS = 200;
const DEFAULT_ADMIN_PIN = "1234";

// Brute force protection
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300000; // 5 minutes

// Shift bonus rates (₽ per hour)
const SHIFT_BONUS_RATES = [
  { minHours: 0, rate: 100, label: "Стандарт" },
  { minHours: 6, rate: 130, label: "Полная смена" },
  { minHours: 10, rate: 170, label: "Двойная смена" },
];

// LocalStorage key
const STORAGE_KEY = "hookah-sales-data";

// ── Ranks ──
const RANKS = [
  { min: 0, title: "Салага", icon: "🫧", color: "#64d4aa" },
  { min: 100840, title: "Торгаш года", icon: "✨", color: "#e879f9" },
  { min: 102100, title: "Хастлер", icon: "🔥", color: "#f97316" },
  { min: 104200, title: "Мейн", icon: "💎", color: "#38bdf8" },
  { min: 108400, title: "Легенда", icon: "👑", color: "#c471f5" },
];

// ── Achievements ──
const ACHIEVEMENTS = [
  { id: "first_sale", title: "Первая кровь", desc: "Первая продажа за смену", icon: "⚔️", check: (sales) => sales.length >= 1 },
  { id: "triple", title: "Тройной удар", desc: "3 продажи за 10 минут", icon: "⚡", check: (sales) => {
    if (sales.length < 3) return false;
    const last3 = sales.slice(-3);
    return new Date(last3[2].timestamp) - new Date(last3[0].timestamp) < 600000;
  }},
  { id: "five_streak", title: "Серия x5", desc: "5 продаж за смену", icon: "🔥", check: (sales) => sales.length >= 5 },
  { id: "ten_streak", title: "Не остановить!", desc: "10 продаж за смену", icon: "💥", check: (sales) => sales.length >= 10 },
  { id: "revenue_5k", title: "Золотой час", desc: "5000₽ выручки за смену", icon: "💰", check: (sales) => sales.reduce((s, x) => s + x.price, 0) >= 5000 },
  { id: "revenue_10k", title: "Легенда дня", desc: "10000₽ выручки за смену", icon: "👑", check: (sales) => sales.reduce((s, x) => s + x.price, 0) >= 10000 },
  { id: "revenue_20k", title: "Машина продаж", desc: "20000₽ выручки за смену", icon: "🏆", check: (sales) => sales.reduce((s, x) => s + x.price, 0) >= 20000 },
];

// ── Default Menu (iiko data) ──
const DEFAULT_MENU = {
  hookah: {
    name: "🌬️ Кальяны",
    emoji: "🌬️",
    items: [
      { id: "h1", name: "Классический кальян", price: 1500 },
      { id: "h2", name: "Кальян на фрукте", price: 1800 },
    ],
  },
  cocktails: {
    name: "🍹 Коктейли",
    emoji: "🍹",
    items: [
      { id: "c1", name: "Мохито", price: 450 },
      { id: "c2", name: "Маргарита", price: 500 },
      { id: "c3", name: "Пина Колада", price: 550 },
      { id: "c4", name: "Лонг Айленд", price: 600 },
      { id: "c5", name: "Апероль Шприц", price: 550 },
      { id: "c6", name: "Авторский коктейль", price: 700 },
    ],
  },
  desserts: {
    name: "🍰 Десерты",
    emoji: "🍰",
    items: [
      { id: "d1", name: "Блины с бананом и нутелой", price: 270 },
      { id: "d2", name: "Брауни", price: 360 },
      { id: "d3", name: "Крем брюле", price: 350 },
      { id: "d4", name: "Лимонный тарт", price: 370 },
      { id: "d5", name: "Наполеон", price: 260 },
      { id: "d6", name: "Панакота", price: 350 },
      { id: "d7", name: "Сникерс", price: 290 },
      { id: "d8", name: "Три шоколада", price: 290 },
      { id: "d9", name: "Фондан", price: 490 },
      { id: "d10", name: "Чизкейк печеный", price: 390 },
    ],
  },
  breakfast: {
    name: "🍳 Завтраки",
    emoji: "🍳",
    items: [
      { id: "br1", name: "Английский завтрак", price: 610 },
      { id: "br2", name: "Блины жульен", price: 530 },
      { id: "br3", name: "Блины шоколад-банан", price: 490 },
      { id: "br4", name: "Боул с гречкой и авокадо", price: 505 },
      { id: "br5", name: "Завтрак + кальян", price: 1100 },
      { id: "br6", name: "Овсяная каша", price: 410 },
      { id: "br7", name: "Рисовая каша", price: 390 },
      { id: "br8", name: "Сырники", price: 330 },
      { id: "br9", name: "Сырники с йогуртом и ягодами", price: 480 },
      { id: "br10", name: "Сытный завтрак", price: 590 },
      { id: "br11", name: "Тост с креветкой", price: 580 },
      { id: "br12", name: "Шакшука", price: 460 },
    ],
  },
  appetizers: {
    name: "🥗 Закуски",
    emoji: "🥗",
    items: [
      { id: "a1", name: "Батат фри", price: 390 },
      { id: "a2", name: "Брускетта с креветкой", price: 820 },
      { id: "a3", name: "Брускетта с лососем", price: 870 },
      { id: "a4", name: "Жареный рис с яйцом", price: 280 },
      { id: "a5", name: "Картофель по-деревенски", price: 320 },
      { id: "a6", name: "Картофель фри", price: 280 },
      { id: "a7", name: "Колбаски вурст с фри", price: 705 },
      { id: "a8", name: "Костный мозг", price: 620 },
      { id: "a9", name: "Креветки в панировке 3шт", price: 340 },
      { id: "a10", name: "Креветки в панировке 9шт", price: 830 },
      { id: "a11", name: "Кростини с говядиной", price: 980 },
      { id: "a12", name: "Куриные крылышки", price: 540 },
      { id: "a13", name: "Мидии по-тайски", price: 560 },
      { id: "a14", name: "Овощи гриль с Цезарем", price: 640 },
      { id: "a15", name: "Паштет", price: 570 },
      { id: "a16", name: "Пивной сет", price: 910 },
      { id: "a17", name: "Сырная нарезка", price: 830 },
      { id: "a18", name: "Сырные палочки 3шт", price: 310 },
      { id: "a19", name: "Тар тар лосось", price: 890 },
      { id: "a20", name: "Тар тар по нашему", price: 790 },
      { id: "a21", name: "Фруктовая тарелка", price: 730 },
      { id: "a22", name: "Хоровац", price: 390 },
      { id: "a23", name: "Хумус", price: 430 },
    ],
  },
  mains: {
    name: "🥩 Основные блюда",
    emoji: "🥩",
    items: [
      { id: "m1", name: "Брискет с карамелиз. луком", price: 1390 },
      { id: "m2", name: "Вареники с вишней", price: 520 },
      { id: "m3", name: "Вареники с картошкой", price: 520 },
      { id: "m4", name: "Жареный рис с курицей", price: 560 },
      { id: "m5", name: "Картофель с лисичками", price: 560 },
      { id: "m6", name: "Колбаска говяжья", price: 680 },
      { id: "m7", name: "Колбаска куриная", price: 620 },
      { id: "m8", name: "Колбаска свино-говяжья", price: 660 },
      { id: "m9", name: "Колбасный сет", price: 1990 },
      { id: "m10", name: "Куриное филе в орех. соусе", price: 460 },
      { id: "m11", name: "Куриное филе со спаржей", price: 640 },
      { id: "m12", name: "Лосось с авокадо", price: 1790 },
      { id: "m13", name: "Люкс бутерброд со свининой", price: 630 },
      { id: "m14", name: "Мидии", price: 790 },
      { id: "m15", name: "Палтус с вешенками", price: 1390 },
      { id: "m16", name: "Пельмени", price: 520 },
      { id: "m17", name: "Пельмени Том Ям", price: 590 },
      { id: "m18", name: "Рибай с томатами и бататом", price: 1390 },
      { id: "m19", name: "Свиная корейка с картофелем", price: 860 },
      { id: "m20", name: "Свиные ребра с картофелем", price: 910 },
      { id: "m21", name: "Сковородка мясная", price: 860 },
      { id: "m22", name: "Стейк говяж. вырезки с салатом", price: 1610 },
      { id: "m23", name: "Стриплойн с салатом бигмак", price: 1260 },
    ],
  },
  pasta: {
    name: "🍝 Паста",
    emoji: "🍝",
    items: [
      { id: "p1", name: "Паста Болоньезе", price: 500 },
      { id: "p2", name: "Паста Карбонара", price: 570 },
      { id: "p3", name: "Паста Мак энд чиз", price: 460 },
      { id: "p4", name: "Паста с буратой", price: 760 },
      { id: "p5", name: "Паста с горгонзола", price: 500 },
      { id: "p6", name: "Паста с курицей и грибами", price: 520 },
      { id: "p7", name: "Паста с морепродуктами", price: 720 },
    ],
  },
  salads: {
    name: "🥬 Салаты",
    emoji: "🥬",
    items: [
      { id: "sl1", name: "Салат Биг Мак", price: 440 },
      { id: "sl2", name: "Салат Греческий", price: 480 },
      { id: "sl3", name: "Салат с баклажанами", price: 610 },
      { id: "sl4", name: "Салат с копченой курицей", price: 470 },
      { id: "sl5", name: "Салат с креветкой и авокадо", price: 790 },
      { id: "sl6", name: "Салат с морепродуктами", price: 810 },
      { id: "sl7", name: "Салат с телятиной", price: 890 },
      { id: "sl8", name: "Цезарь с креветками", price: 810 },
      { id: "sl9", name: "Цезарь с курицей", price: 590 },
    ],
  },
  steaks: {
    name: "🥩 Стейки",
    emoji: "🔥",
    items: [
      { id: "st1", name: "Ребра 1 кг", price: 1480 },
      { id: "st2", name: "Рибай", price: 1440 },
      { id: "st3", name: "Свиная корейка", price: 650 },
      { id: "st4", name: "Стейк говяжьей вырезки", price: 1230 },
      { id: "st5", name: "Стейк с лососем", price: 1400 },
      { id: "st6", name: "Стейк шато бриан", price: 1400 },
    ],
  },
  street: {
    name: "🌮 Стрит-food",
    emoji: "🌮",
    items: [
      { id: "sf1", name: "Бургер с говяж. котлетой", price: 690 },
      { id: "sf2", name: "Бургер с курицей", price: 690 },
      { id: "sf3", name: "Кесадилья с ветчиной", price: 680 },
      { id: "sf4", name: "Кесадилья с курицей", price: 540 },
      { id: "sf5", name: "Кесадилья шоколад банан", price: 640 },
    ],
  },
  soups: {
    name: "🍲 Супы",
    emoji: "🍲",
    items: [
      { id: "sp1", name: "Борщ", price: 580 },
      { id: "sp2", name: "Бульон", price: 370 },
      { id: "sp3", name: "Рамэн с говядиной", price: 560 },
      { id: "sp4", name: "Сливочный суп", price: 470 },
      { id: "sp5", name: "Сырный суп", price: 380 },
      { id: "sp6", name: "Том Ям классика", price: 570 },
      { id: "sp7", name: "Том Ям креветка", price: 790 },
      { id: "sp8", name: "Том Ям курица", price: 520 },
      { id: "sp9", name: "Том Ям морепродукты", price: 740 },
    ],
  },
};

// ═══════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════

// Simple hash for passwords
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "h_" + Math.abs(hash).toString(36);
}

// Simple image hash for duplicate receipt detection
function imageHash(dataUrl) {
  let hash = 0;
  for (let i = 0; i < dataUrl.length; i += 100) {
    const char = dataUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "img_" + Math.abs(hash).toString(36);
}

// Sanitize user input to prevent XSS
function sanitize(str) {
  return str.replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' }[c]));
}

// Shift bonus calculations
function getShiftBonusRate(hours) {
  let rate = SHIFT_BONUS_RATES[0];
  for (const r of SHIFT_BONUS_RATES) {
    if (hours >= r.minHours) rate = r;
  }
  return rate;
}

function calcShiftBonus(hours) {
  return Math.round(hours * getShiftBonusRate(hours).rate);
}

function formatHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}ч ${mins}м` : `${hrs}ч`;
}

// Rank helpers
function getRank(bonus) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (bonus >= r.min) rank = r;
  }
  return rank;
}

function getNextRank(bonus) {
  for (const r of RANKS) {
    if (bonus < r.min) return r;
  }
  return null;
}

// Format money
function formatMoney(n) {
  return n.toLocaleString("ru-RU") + " ₽";
}

// Quest templates — generated dynamically from menu
function getQuestTemplates(menu) {
  const templates = [];
  Object.entries(menu).forEach(([key, cat]) => {
    templates.push({ id: "qt_" + key, text: `Продай {n} из "${cat.name}"`, category: key, icon: cat.emoji || "📦", color: "#c471f5" });
  });
  templates.push({ id: "qt_reviews", text: "Собери {n} отзывов", category: "reviews", icon: "⭐", color: "#facc15" });
  templates.push({ id: "qt_any", text: "Сделай {n} продаж (любых)", category: "any", icon: "🔥", color: "#22d3ee" });
  templates.push({ id: "qt_revenue", text: "Заработай {n}₽ выручки", category: "revenue", icon: "💰", color: "#64d4aa" });
  return templates;
}

// ── LocalStorage helpers (for caching photos locally) ──
function loadLocalPhotos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveLocalPhotos(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// Merge cloud data with local photos
function mergeWithLocalPhotos(cloudEmployees) {
  const local = loadLocalPhotos();
  if (!local?.employees) return cloudEmployees;
  return cloudEmployees.map(emp => {
    const localEmp = local.employees.find(e => e.id === emp.id);
    if (!localEmp) return emp;
    return {
      ...emp,
      sales: (emp.sales || []).map(s => {
        if (s.receiptPhoto === "local") {
          const localSale = (localEmp.sales || []).find(ls => ls.saleId === s.saleId);
          return { ...s, receiptPhoto: localSale?.receiptPhoto || null };
        }
        return s;
      }),
      reviews: (emp.reviews || []).map(r => {
        if (r.photo === "local") {
          const localRev = (localEmp.reviews || []).find(lr => lr.reviewId === r.reviewId);
          return { ...r, photo: localRev?.photo || null };
        }
        return r;
      }),
    };
  });
}

// Sound effect: sale "ding"
function playSaleSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  } catch(e) {}
}

// Sound effect: achievement fanfare
function playAchievementSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = "sine"; osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

// ═══ FIREBASE ═══

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDHL_7bDDh7PHoKMHYOp5yx2LlcPsM3HOw",
  authDomain: "nargilya-sales.firebaseapp.com",
  projectId: "nargilya-sales",
  storageBucket: "nargilya-sales.firebasestorage.app",
  messagingSenderId: "27892862981",
  appId: "1:27892862981:web:931f25844577a794d40c6c"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// Admin email — this user gets admin panel access
const ADMIN_EMAIL = "79780187666@mail.ru";

// Firestore document reference
const DATA_DOC = doc(db, "app", "main");

// Save guard flags
let _saving = false;
let _dataLoaded = false;
function setDataLoaded(val) { _dataLoaded = val; }
function isDataLoaded() { return _dataLoaded; }
async function saveToCloud(data) {
  if (_saving) return;
  // CRITICAL: Never overwrite cloud data with empty employees
  if (!data.employees || data.employees.length === 0) {
    console.warn("Blocked save: empty employees array — protecting cloud data");
    return;
  }
  _saving = true;
  try {
    const clean = {
      ...data,
      salesPlans: data.salesPlans || [],
      dailyQuests: data.dailyQuests || [],
      menuCategories: data.menuCategories || DEFAULT_MENU,
      bonusPercent: data.bonusPercent ?? DEFAULT_BONUS_PERCENT,
      adminPinHash: data.adminPinHash || simpleHash(DEFAULT_ADMIN_PIN),
      employees: (data.employees || []).map(e => ({
        ...e,
        sales: (e.sales || []).map(s => ({ ...s, receiptPhoto: s.receiptPhoto ? "local" : null })),
        reviews: (e.reviews || []).map(r => ({ ...r, photo: r.photo ? "local" : null })),
      })),
      lastSavedAt: new Date().toISOString(),
    };
    await setDoc(DATA_DOC, clean);
  } catch (err) {
    console.error("Firebase save error:", err);
  }
  _saving = false;
}

// ═══ LOGIN SCREENS ═══

// ═══ Logo SVG (reusable) ═══
function NargiliyaLogo({ gradientId = "lgLogo", size = 64, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={style}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c471f5" />
          <stop offset="50%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect x="20" y="40" width="60" height="52" rx="16" stroke={`url(#${gradientId})`} strokeWidth="2" fill="rgba(196,113,245,0.1)" />
      <text x="50" y="77" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontSize="36" fontWeight="900" fill={`url(#${gradientId})`}>Н</text>
    </svg>
  );
}

// ═══ Loading Screen ═══
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d0b1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(196,113,245,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <NargiliyaLogo gradientId="lgLoad" style={{ marginBottom: 16, animation: "gentleFloat 2s ease-in-out infinite", filter: "drop-shadow(0 0 24px rgba(196,113,245,0.35))" }} />
      <div style={{ fontFamily: "'Outfit', sans-serif", color: "#c471f5", fontSize: "1.2rem", fontWeight: 800, letterSpacing: 6, marginBottom: 8 }}>НАРГИЛИЯ</div>
      <div style={{ color: "#6b7094", fontSize: "0.75rem", marginTop: 4, letterSpacing: 2 }}>подключение...</div>
      <style>{`@keyframes gentleFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
    </div>
  );
}

// ═══ Login Screen ═══
function LoginScreen() {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleLogin = async () => {
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginEmail("");
      setLoginPassword("");
    } catch (err) {
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setLoginError("Неверный email или пароль");
      } else if (err.code === "auth/too-many-requests") {
        setLoginError("Слишком много попыток. Подождите 5 минут.");
      } else {
        setLoginError("Ошибка входа: " + err.message);
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d0b1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
      <NargiliyaLogo gradientId="lgLogin" style={{ marginBottom: 16, filter: "drop-shadow(0 0 24px rgba(196,113,245,0.35))" }} />
      <div style={{ fontFamily: "'Outfit', sans-serif", color: "#c471f5", fontSize: "1.2rem", fontWeight: 800, letterSpacing: 6, marginBottom: 24 }}>НАРГИЛИЯ</div>

      <div style={{ width: "100%", maxWidth: 340 }}>
        <input
          value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          type="email" placeholder="Email" autoComplete="email"
          style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "0.95rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
        />
        <input
          value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          type="password" placeholder="Пароль" autoComplete="current-password"
          style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "0.95rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
        />
        {loginError && (
          <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 10, padding: "8px 12px", background: "rgba(255,80,80,0.08)", borderRadius: 10 }}>{loginError}</div>
        )}
        <button onClick={handleLogin} style={{ width: "100%", padding: 16, background: (loginEmail && loginPassword) ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 14, color: (loginEmail && loginPassword) ? "#0d0b1a" : "#4a4e6e", fontWeight: 800, cursor: (loginEmail && loginPassword) ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", fontSize: "1rem" }}>
          Войти
        </button>
      </div>
      <div style={{ color: "#4a4e6e", fontSize: "0.65rem", marginTop: 24 }}>© 2025 Наргилия</div>
    </div>
  );
}

// ═══ Unlinked Account Screen ═══
function UnlinkedAccountScreen({ email, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0d0b1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔗</div>
      <div style={{ color: "#eef0ff", fontSize: "1rem", fontWeight: 700, marginBottom: 8 }}>Аккаунт не привязан</div>
      <div style={{ color: "#6b7094", fontSize: "0.85rem", marginBottom: 8 }}>{email}</div>
      <div style={{ color: "#8b8fa3", fontSize: "0.8rem", maxWidth: 300, lineHeight: 1.5 }}>Попросите администратора привязать ваш email к вашему профилю сотрудника.</div>
      <button onClick={onLogout} style={{ marginTop: 24, padding: "12px 32px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Выйти</button>
    </div>
  );
}

// ═══ ADMIN PANEL ═══

function AdminPanel({ employees, setEmployees, onExit, salesPlans, setSalesPlans, dailyQuests, setDailyQuests, adminPinHash, setAdminPinHash, menuCategories, setMenuCategories, bonusPercent, setBonusPercent }) {
  const QUEST_TEMPLATES = getQuestTemplates(menuCategories);
  const [adminView, setAdminView] = useState("dashboard");
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [editName, setEditName] = useState("");
  const [showEditModal, setShowEditModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [showPasswordModal, setShowPasswordModal] = useState(null);
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(null);
  const [shiftHours, setShiftHours] = useState("");
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showBonusMultiplierModal, setShowBonusMultiplierModal] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planCategory, setPlanCategory] = useState("hookah");
  const [planTarget, setPlanTarget] = useState("");
  const [planPeriod, setPlanPeriod] = useState("month");
  const [showQuestModal, setShowQuestModal] = useState(false);
  const [questTemplate, setQuestTemplate] = useState("qt5");
  const [questTarget, setQuestTarget] = useState("");
  const [questBonusReward, setQuestBonusReward] = useState("100");
  const [questAssignee, setQuestAssignee] = useState("all");
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState("");
  const [confirmPinValue, setConfirmPinValue] = useState("");
  const [planReward, setPlanReward] = useState("");

  const periodLabels = { all: "Всё время", today: "Сегодня", week: "Неделя", month: "Месяц" };

  const filterByPeriod = (arr, tsKey) => {
    if (filterPeriod === "all") return arr || [];
    const now = new Date();
    return (arr || []).filter((x) => {
      const d = new Date(x[tsKey]);
      if (filterPeriod === "today") return d.toDateString() === now.toDateString();
      if (filterPeriod === "week") return now - d < 7 * 86400000;
      if (filterPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });
  };

  const enriched = employees
    .map((e) => {
      const fs = filterByPeriod(e.sales, "timestamp");
      const fr = filterByPeriod(e.reviews, "timestamp");
      const fsh = filterByPeriod(e.shifts, "date");
      const shiftBonusTotal = (e.shifts || []).reduce((s, x) => s + (x.bonus || 0), 0);
      const fShiftBonus = fsh.reduce((s, x) => s + (x.bonus || 0), 0);
      const fShiftHours = fsh.reduce((s, x) => s + (x.hours || 0), 0);
      const totalShiftHours = (e.shifts || []).reduce((s, x) => s + (x.hours || 0), 0);
      return { ...e, fs, fr, fsh, fBonus: fs.reduce((s, x) => s + x.bonus, 0) + fr.length * REVIEW_BONUS + fShiftBonus, fRevenue: fs.reduce((s, x) => s + x.price, 0), fSaleCount: fs.length, fReviewCount: fr.length, fShiftBonus, fShiftHours, fShiftCount: fsh.length, totalBonus: e.sales.reduce((s, x) => s + x.bonus, 0) + (e.reviews || []).length * REVIEW_BONUS + shiftBonusTotal, totalRevenue: e.sales.reduce((s, x) => s + x.price, 0), totalShiftHours };
    })
    .sort((a, b) => b.fBonus - a.fBonus);

  const totals = { revenue: enriched.reduce((s, e) => s + e.fRevenue, 0), bonus: enriched.reduce((s, e) => s + e.fBonus, 0), sales: enriched.reduce((s, e) => s + e.fSaleCount, 0), reviews: enriched.reduce((s, e) => s + e.fReviewCount, 0), hours: enriched.reduce((s, e) => s + e.fShiftHours, 0), shiftBonus: enriched.reduce((s, e) => s + e.fShiftBonus, 0) };
  const sel = selectedEmpId ? enriched.find((e) => e.id === selectedEmpId) : null;

  const deleteEmployee = (id) => { setEmployees((p) => p.filter((e) => e.id !== id)); setConfirmDelete(null); if (selectedEmpId === id) setSelectedEmpId(null); };
  const renameEmployee = (id) => { if (!editName.trim()) return; setEmployees((p) => p.map((e) => (e.id === id ? { ...e, name: sanitize(editName.trim()) } : e))); setShowEditModal(null); setEditName(""); };
  const resetEmployee = (id) => { setEmployees((p) => p.map((e) => (e.id === id ? { ...e, sales: [], reviews: [] } : e))); setConfirmDelete(null); };
  const deleteSale = (empId, saleId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, sales: e.sales.filter((s) => s.saleId !== saleId) } : e))); };
  const deleteReview = (empId, reviewId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, reviews: (e.reviews || []).filter((r) => r.reviewId !== reviewId) } : e))); };
  const changePassword = (id) => { if (!newEmpPassword.trim()) return; setEmployees((p) => p.map((e) => (e.id === id ? { ...e, passwordHash: simpleHash(newEmpPassword.trim()), password: undefined } : e))); setShowPasswordModal(null); setNewEmpPassword(""); };
  const addShift = (empId) => {
    const h = parseFloat(shiftHours);
    if (!h || h <= 0 || h > 24) return;
    const bonus = calcShiftBonus(h);
    const shift = { shiftId: Date.now().toString() + Math.random().toString(36).slice(2, 6), hours: h, bonus, date: shiftDate, rate: getShiftBonusRate(h) };
    setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, shifts: [...(e.shifts || []), shift] } : e)));
    setShowShiftModal(null); setShiftHours(""); setShiftDate(new Date().toISOString().slice(0, 10));
  };
  const deleteShift = (empId, shiftId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, shifts: (e.shifts || []).filter((s) => s.shiftId !== shiftId) } : e))); };

  const setBonusMultiplier = (empId, mult) => {
    setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, bonusMultiplier: mult } : e)));
    setShowBonusMultiplierModal(null);
  };

  const addSalesPlan = () => {
    const target = parseInt(planTarget);
    const reward = parseInt(planReward);
    if (!target || target <= 0) return;
    const plan = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      category: planCategory,
      target,
      period: planPeriod,
      reward: reward || 0,
      createdAt: new Date().toISOString(),
      rewardPaid: {},
    };
    setSalesPlans((prev) => [...prev, plan]);
    setShowPlanModal(false);
    setPlanTarget("");
    setPlanReward("");
  };

  const deleteSalesPlan = (planId) => {
    setSalesPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  const addDailyQuest = () => {
    const target = parseInt(questTarget);
    const reward = parseInt(questBonusReward);
    if (!target || target <= 0) return;
    const tpl = QUEST_TEMPLATES.find(t => t.id === questTemplate);
    const quest = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      templateId: questTemplate,
      text: tpl.text.replace("{n}", target),
      category: tpl.category,
      target,
      icon: tpl.icon,
      color: tpl.color,
      reward: reward || 0,
      assignee: questAssignee,
      createdAt: new Date().toISOString(),
      date: new Date().toDateString(),
      rewardPaid: {},
    };
    setDailyQuests((prev) => [...prev, quest]);
    setShowQuestModal(false);
    setQuestTarget("");
    setQuestBonusReward("100");
    setQuestAssignee("all");
  };

  const deleteDailyQuest = (questId) => {
    setDailyQuests((prev) => prev.filter((q) => q.id !== questId));
  };

  const getQuestProgress = (quest, emp) => {
    const now = new Date();
    const todaySales = (emp?.sales || []).filter(s => new Date(s.timestamp).toDateString() === now.toDateString());
    const todayReviews = (emp?.reviews || []).filter(r => new Date(r.timestamp).toDateString() === now.toDateString());
    
    if (quest.category === "reviews") return todayReviews.length;
    if (quest.category === "any") return todaySales.length;
    if (quest.category === "revenue") return todaySales.reduce((s, x) => s + x.price, 0);
    const catItems = menuCategories[quest.category]?.items || [];
    const catItemIds = catItems.map(i => i.id);
    return todaySales.filter(s => catItemIds.includes(s.id)).length;
  };

  const getPlanProgress = (plan) => {
    const now = new Date();
    const salesInPeriod = employees.flatMap(e => (e.sales || []).filter(s => {
      const d = new Date(s.timestamp);
      const catItems = menuCategories[plan.category]?.items || [];
      const inCategory = catItems.some(item => item.id === s.id);
      if (!inCategory) return false;
      if (plan.period === "today") return d.toDateString() === now.toDateString();
      if (plan.period === "week") return now - d < 7 * 86400000;
      if (plan.period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    }));
    return salesInPeriod.length;
  };

  const cardStyle = { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16 };
  const smallBtn = (bg, bc, color) => ({ padding: "10px 14px", background: bg, border: `1px solid ${bc}`, borderRadius: 10, color, cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" });

  return (
    <div style={{ minHeight: "100vh", background: "#0d0b1a", fontFamily: "'DM Sans', sans-serif", color: "#eef0ff", maxWidth: 520, margin: "0 auto", padding: "20px 20px 40px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Photo viewer */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "pointer" }}>
          <img src={viewingPhoto} alt="" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, border: "1px solid rgba(196,113,245,0.3)" }} />
        </div>
      )}

      {/* Rename modal */}
      {showEditModal && (
        <div onClick={() => setShowEditModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.2rem", fontWeight: 900, color: "#c471f5", marginBottom: 16, textAlign: "center" }}>✏️ Переименовать</div>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameEmployee(showEditModal)} placeholder="Новое имя..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 14, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowEditModal(null)} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => renameEmployee(showEditModal)} style={{ flex: 1, padding: 14, background: editName.trim() ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.09)", border: "none", borderRadius: 12, color: editName.trim() ? "#0d0b1a" : "#4a4e6e", cursor: "pointer", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Password change modal */}
      {showPasswordModal && (
        <div onClick={() => { setShowPasswordModal(null); setNewEmpPassword(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.2rem", fontWeight: 900, color: "#c471f5", marginBottom: 6, textAlign: "center" }}>🔐 Изменить пароль</div>
            <div style={{ color: "#4a4e6e", fontSize: "0.8rem", textAlign: "center", marginBottom: 16 }}>{employees.find((e) => e.id === showPasswordModal)?.name}</div>
            <input value={newEmpPassword} onChange={(e) => setNewEmpPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword(showPasswordModal)} type="password" placeholder="Новый пароль..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
            <div style={{ color: "#4a4e6e", fontSize: "0.7rem", marginBottom: 14 }}>Оставьте пустым, чтобы убрать пароль</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowPasswordModal(null); setNewEmpPassword(""); }} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => changePassword(showPasswordModal)} style={{ flex: 1, padding: 14, background: "linear-gradient(135deg, #c471f5, #a855f7)", border: "none", borderRadius: 12, color: "#0d0b1a", cursor: "pointer", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift modal */}
      {showShiftModal && (
        <div onClick={() => setShowShiftModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.2rem", fontWeight: 900, color: "#c471f5", marginBottom: 6, textAlign: "center" }}>🕐 Добавить смену</div>
            <div style={{ color: "#4a4e6e", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>{employees.find((e) => e.id === showShiftModal)?.name}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#8b8fa3", fontSize: "0.75rem", marginBottom: 6 }}>Дата смены</div>
              <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", colorScheme: "dark", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#8b8fa3", fontSize: "0.75rem", marginBottom: 6 }}>Количество часов</div>
              <input type="number" step="0.5" min="0.5" max="24" value={shiftHours} onChange={(e) => setShiftHours(e.target.value)} placeholder="Например: 8" style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "1.1rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
            </div>
            {shiftHours > 0 && (
              <div style={{ background: "rgba(196,113,245,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#8b8fa3", fontSize: "0.8rem" }}>Тариф:</span>
                  <span style={{ color: "#c471f5", fontWeight: 700, fontSize: "0.85rem" }}>{getShiftBonusRate(parseFloat(shiftHours)).label} — {getShiftBonusRate(parseFloat(shiftHours)).rate}₽/час</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8b8fa3", fontSize: "0.8rem" }}>Бонус за смену:</span>
                  <span style={{ color: "#c471f5", fontWeight: 800, fontSize: "1.1rem" }}>+{formatMoney(calcShiftBonus(parseFloat(shiftHours)))}</span>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  {SHIFT_BONUS_RATES.map((r, i) => (
                    <div key={i} style={{ flex: 1, background: parseFloat(shiftHours) >= r.minHours && (i === SHIFT_BONUS_RATES.length - 1 || parseFloat(shiftHours) < SHIFT_BONUS_RATES[i + 1].minHours) ? "rgba(196,113,245,0.3)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.6rem", color: "#6b7094" }}>{r.minHours}+ ч</div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#eef0ff" }}>{r.rate}₽</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowShiftModal(null)} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => addShift(showShiftModal)} style={{ flex: 1, padding: 14, background: shiftHours > 0 ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.09)", border: "none", borderRadius: 12, color: shiftHours > 0 ? "#0d0b1a" : "#4a4e6e", cursor: shiftHours > 0 ? "pointer" : "default", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Добавить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.2rem", fontWeight: 900, color: "#ff5050", marginBottom: 8, textAlign: "center" }}>⚠️ Удалить сотрудника?</div>
            <div style={{ color: "#8b8fa3", fontSize: "0.85rem", textAlign: "center", marginBottom: 20 }}>Все данные будут потеряны навсегда</div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button onClick={() => deleteEmployee(confirmDelete)} style={{ padding: 14, border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: "linear-gradient(135deg, #ff5050, #cc3333)", color: "#fff", fontSize: "0.9rem" }}>Удалить навсегда</button>
              <button onClick={() => resetEmployee(confirmDelete)} style={{ padding: 14, border: "1px solid rgba(255,165,0,0.3)", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,165,0,0.1)", color: "#ffa500", fontSize: "0.85rem" }}>Только сбросить продажи</button>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: "rgba(255,255,255,0.09)", color: "#8b8fa3", fontSize: "0.85rem" }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={onExit} style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", color: "#8b8fa3", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" }}>← Выйти</button>
        <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.1rem", fontWeight: 900, color: "#c471f5" }}>👑 Руководитель</div>
        <button onClick={() => setShowChangePinModal(true)} style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", color: "#8b8fa3", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" }}>🔐 PIN</button>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[{ k: "dashboard", l: "📊 Обзор" }, { k: "employees", l: "👥 Сотрудники" }, { k: "quests", l: "⚔️ Задания" }, { k: "plans", l: "🎯 Планы" }, { k: "menu", l: "📋 Меню" }, { k: "history", l: "📜 История" }].map((t) => (
          <button key={t.k} onClick={() => { setAdminView(t.k); setSelectedEmpId(null); }} style={{ flex: 1, padding: "10px 6px", borderRadius: 12, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: adminView === t.k ? "linear-gradient(135deg, rgba(196,113,245,0.2), rgba(196,113,245,0.08))" : "rgba(255,255,255,0.1)", border: adminView === t.k ? "1px solid rgba(196,113,245,0.3)" : "1px solid rgba(255,255,255,0.1)", color: adminView === t.k ? "#c471f5" : "#6b7094" }}>{t.l}</button>
        ))}
      </div>

      {/* Period filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {Object.entries(periodLabels).map(([k, v]) => (
          <button key={k} onClick={() => setFilterPeriod(k)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, cursor: "pointer", fontSize: "0.7rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: filterPeriod === k ? "rgba(196,113,245,0.3)" : "rgba(255,255,255,0.08)", border: filterPeriod === k ? "1px solid rgba(196,113,245,0.3)" : "1px solid rgba(255,255,255,0.08)", color: filterPeriod === k ? "#c471f5" : "#4a4e6e" }}>{v}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {adminView === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[{ l: "Выручка", v: formatMoney(totals.revenue), i: "💰", c: "#eef0ff" }, { l: "Бонусы", v: formatMoney(totals.bonus), i: "🎁", c: "#c471f5" }, { l: "Продажи", v: totals.sales + " шт.", i: "🧾", c: "#38bdf8" }, { l: "Отзывы", v: totals.reviews + " шт.", i: "⭐", c: "#f97316" }, { l: "Часы", v: formatHours(totals.hours), i: "🕐", c: "#22d3ee" }, { l: "Бонус смен", v: formatMoney(totals.shiftBonus), i: "⏰", c: "#22d3ee" }].map((x, i) => (
              <div key={i} style={{ ...cardStyle, borderRadius: 18, padding: "16px 14px" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 4 }}>{x.i}</div>
                <div style={{ fontSize: "0.7rem", color: "#6b7094", textTransform: "uppercase", letterSpacing: 1 }}>{x.l}</div>
                <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.2rem", fontWeight: 900, color: x.c, marginTop: 2 }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Рейтинг · {periodLabels[filterPeriod]}</div>
          {enriched.map((emp, i) => { const r = getRank(emp.totalBonus); const medals = ["🥇", "🥈", "🥉"]; return (
            <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 8, ...cardStyle }}>
              <div style={{ fontSize: i < 3 ? "1.4rem" : "0.9rem", width: 32, textAlign: "center", fontWeight: 800, color: i >= 3 ? "#4a4e6e" : undefined }}>{i < 3 ? medals[i] : `${i + 1}`}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{emp.name}</div><div style={{ fontSize: "0.7rem", color: r.color }}>{r.icon} {r.title} · {emp.fSaleCount} продаж · {emp.fReviewCount} отзывов · {formatHours(emp.fShiftHours)}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, color: "#c471f5", fontSize: "0.95rem" }}>{formatMoney(emp.fBonus)}</div><div style={{ fontSize: "0.65rem", color: "#4a4e6e" }}>{formatMoney(emp.fRevenue)}</div></div>
            </div>
          ); })}
          {enriched.length === 0 && <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40 }}>Нет сотрудников</div>}
        </div>
      )}

      {/* EMPLOYEES LIST */}
      {adminView === "employees" && !selectedEmpId && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Управление ({employees.length})</div>
          {enriched.map((emp) => { const r = getRank(emp.totalBonus); return (
            <div key={emp.id} style={{ ...cardStyle, borderRadius: 18, padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: "1.4rem" }}>{r.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{emp.name}</div><div style={{ fontSize: "0.75rem", color: r.color }}>{r.title} · {formatMoney(emp.totalBonus)}</div></div>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: "0.7rem", color: "#6b7094", marginBottom: 12, flexWrap: "wrap" }}>
                <span>📊 {emp.sales.length} продаж</span><span>·</span><span>⭐ {(emp.reviews || []).length} отзывов</span><span>·</span><span>🕐 {formatHours(emp.totalShiftHours)}</span><span>·</span><span>💰 {formatMoney(emp.totalRevenue)}</span>
                {emp.bonusMultiplier > 0 && <span style={{ color: "#22d3ee", fontWeight: 700 }}>· 🚀 +{emp.bonusMultiplier}%</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setSelectedEmpId(emp.id)} style={{ flex: 1, ...smallBtn("rgba(196,113,245,0.2)", "rgba(196,113,245,0.2)", "#c471f5"), fontWeight: 700 }}>📋 Подробнее</button>
                <button onClick={() => { setEditName(emp.name); setShowEditModal(emp.id); }} style={smallBtn("rgba(100,150,255,0.1)", "rgba(100,150,255,0.2)", "#38bdf8")}>✏️</button>
                <button onClick={() => setShowPasswordModal(emp.id)} style={smallBtn("rgba(180,130,255,0.1)", "rgba(180,130,255,0.2)", "#b482ff")}>🔐</button>
                <button onClick={() => setShowShiftModal(emp.id)} style={smallBtn("rgba(100,200,150,0.1)", "rgba(100,200,150,0.2)", "#22d3ee")}>🕐</button>
                <button onClick={() => setShowBonusMultiplierModal(emp.id)} style={smallBtn("rgba(34,211,238,0.1)", "rgba(34,211,238,0.2)", "#22d3ee")}>🚀</button>
                <button onClick={() => setConfirmDelete(emp.id)} style={smallBtn("rgba(255,80,80,0.1)", "rgba(255,80,80,0.2)", "#ff5050")}>🗑️</button>
              </div>
            </div>
          ); })}
        </div>
      )}

      {/* EMPLOYEE DETAIL */}
      {adminView === "employees" && sel && (
        <div>
          <button onClick={() => setSelectedEmpId(null)} style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 14px", color: "#8b8fa3", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>← Назад</button>
          <div style={{ background: "rgba(196,113,245,0.2)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 24, marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 6 }}>{getRank(sel.totalBonus).icon}</div>
            <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.3rem", fontWeight: 900 }}>{sel.name}</div>
            <div style={{ fontSize: "0.8rem", color: getRank(sel.totalBonus).color, marginBottom: 8 }}>{getRank(sel.totalBonus).title}</div>
            {/* Auth email link */}
            <div style={{ fontSize: "0.7rem", color: sel.authEmail ? "#22d3ee" : "#6b7094", marginBottom: 12 }}>
              {sel.authEmail ? `✉️ ${sel.authEmail}` : "⚠️ Email не привязан"}
              <button onClick={() => {
                const email = prompt("Email аккаунта сотрудника (из Firebase Auth):", sel.authEmail || "");
                if (email === null) return;
                setEmployees(prev => prev.map(e => e.id === sel.id ? { ...e, authEmail: email.trim().toLowerCase() } : e));
              }} style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(34,211,238,0.3)", background: "rgba(34,211,238,0.08)", color: "#22d3ee", cursor: "pointer", fontSize: "0.65rem", fontFamily: "'DM Sans', sans-serif" }}>{sel.authEmail ? "✏️" : "Привязать"}</button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[{ l: "Бонусы", v: formatMoney(sel.fBonus), c: "#c471f5" }, { l: "Выручка", v: formatMoney(sel.fRevenue) }, { l: "Продаж", v: "" + sel.fSaleCount }].map((x, i) => (
                <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: "0.65rem", color: "#6b7094" }}>{x.l}</div><div style={{ fontWeight: 800, color: x.c || "#eef0ff" }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Продажи ({sel.fSaleCount})</div>
          {[...sel.fs].reverse().slice(0, 50).map((s) => (
            <div key={s.saleId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {s.name}
                  {s.receiptPhoto && <span onClick={() => setViewingPhoto(s.receiptPhoto)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📎</span>}
                  {!s.receiptPhoto && <span style={{ fontSize: "0.6rem", color: "#fb923c", opacity: 0.7 }}>без чека</span>}
                </div>
                <div style={{ fontSize: "0.65rem", color: "#4a4e6e" }}>{new Date(s.timestamp).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {formatMoney(s.price)} · +{s.bonus}₽</div>
              </div>
              <button onClick={() => deleteSale(sel.id, s.saleId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif" }}>✕</button>
            </div>
          ))}

          <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, marginTop: 20 }}>Отзывы ({sel.fReviewCount})</div>
          {[...sel.fr].reverse().slice(0, 50).map((r) => (
            <div key={r.reviewId} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: r.photo ? 10 : 0 }}>
                <div><div style={{ fontWeight: 700, fontSize: "0.85rem" }}>⭐ {r.guestName}</div><div style={{ fontSize: "0.65rem", color: "#4a4e6e" }}>{new Date(r.timestamp).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · +{REVIEW_BONUS}₽</div></div>
                <button onClick={() => deleteReview(sel.id, r.reviewId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif" }}>✕</button>
              </div>
              {r.photo && <img src={r.photo} alt="" onClick={() => setViewingPhoto(r.photo)} style={{ width: "100%", borderRadius: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)" }} />}
            </div>
          ))}

          {/* Shifts section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2 }}>Смены ({sel.fShiftCount}) · {formatHours(sel.fShiftHours)}</div>
            <button onClick={() => setShowShiftModal(sel.id)} style={{ background: "rgba(100,200,150,0.1)", border: "1px solid rgba(100,200,150,0.2)", borderRadius: 10, padding: "6px 12px", color: "#22d3ee", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>+ Смена</button>
          </div>
          <div style={{ background: "rgba(100,200,150,0.05)", border: "1px solid rgba(100,200,150,0.1)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#8b8fa3", fontSize: "0.8rem" }}>Часов за период:</span>
              <span style={{ fontWeight: 800, color: "#22d3ee" }}>{formatHours(sel.fShiftHours)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#8b8fa3", fontSize: "0.8rem" }}>Бонус за смены:</span>
              <span style={{ fontWeight: 800, color: "#c471f5" }}>{formatMoney(sel.fShiftBonus)}</span>
            </div>
          </div>
          {[...sel.fsh].reverse().slice(0, 50).map((sh) => (
            <div key={sh.shiftId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
              <div style={{ fontSize: "1rem" }}>🕐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{formatHours(sh.hours)} · {sh.rate?.label || "Стандарт"}</div>
                <div style={{ fontSize: "0.65rem", color: "#4a4e6e" }}>{new Date(sh.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} · +{formatMoney(sh.bonus)}</div>
              </div>
              <button onClick={() => deleteShift(sel.id, sh.shiftId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'DM Sans', sans-serif" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* GLOBAL HISTORY */}
      {adminView === "history" && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Все операции · {periodLabels[filterPeriod]}</div>
          {(() => {
            const ops = [];
            enriched.forEach((emp) => {
              emp.fs.forEach((s) => ops.push({ t: "sale", emp: emp.name, ...s, ts: s.timestamp }));
              emp.fr.forEach((r) => ops.push({ t: "review", emp: emp.name, ...r, ts: r.timestamp }));
            });
            ops.sort((a, b) => new Date(b.ts) - new Date(a.ts));
            if (!ops.length) return <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40 }}>Нет операций за этот период</div>;
            return ops.slice(0, 100).map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}>
                <div style={{ fontSize: "1.1rem" }}>{o.t === "sale" ? "🧾" : "⭐"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {o.t === "sale" ? o.name : `Отзыв: ${o.guestName}`}
                    {o.t === "sale" && o.receiptPhoto && <span onClick={() => setViewingPhoto(o.receiptPhoto)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📎</span>}
                    {o.t === "review" && o.photo && <span onClick={() => setViewingPhoto(o.photo)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📷</span>}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#4a4e6e" }}>{o.emp} · {new Date(o.ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · +{o.t === "sale" ? o.bonus : REVIEW_BONUS}₽</div>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* DAILY QUESTS TAB */}
      {adminView === "quests" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2 }}>Ежедневные задания</div>
            <button onClick={() => setShowQuestModal(true)} style={{ ...smallBtn("rgba(196,113,245,0.15)", "rgba(196,113,245,0.3)", "#c471f5"), fontWeight: 700 }}>+ Новое задание</button>
          </div>

          {dailyQuests.length === 0 && (
            <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40 }}>
              <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>⚔️</div>
              <div style={{ marginBottom: 4 }}>Нет активных заданий</div>
              <div style={{ fontSize: "0.75rem" }}>Создайте задания — сотрудники увидят их как игровые квесты!</div>
            </div>
          )}

          {dailyQuests.map((quest) => {
            const isToday = quest.date === new Date().toDateString();
            return (
              <div key={quest.id} style={{ ...cardStyle, borderRadius: 18, padding: 18, marginBottom: 12, opacity: isToday ? 1 : 0.5, border: isToday ? `1px solid ${quest.color}30` : cardStyle.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: `${quest.color}20`, border: `1px solid ${quest.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>{quest.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{quest.text}</div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7094", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {quest.reward > 0 && <span style={{ color: "#22d3ee" }}>+{quest.reward}₽ премия</span>}
                        <span>{isToday ? "Сегодня" : "Архив"}</span>
                        <span style={{ color: quest.assignee === "all" ? "#8b8fa3" : "#f0abfc" }}>
                          {quest.assignee === "all" ? "👥 Всем" : `👤 ${employees.find(e => e.id === quest.assignee)?.name || "?"}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteDailyQuest(quest.id)} style={{ background: "none", border: "none", color: "#ff5050", cursor: "pointer", fontSize: "0.9rem", padding: 4 }}>✕</button>
                </div>

                {/* Per-employee quest progress */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {employees.filter(emp => quest.assignee === "all" || quest.assignee === emp.id).map(emp => {
                    const prog = getQuestProgress(quest, emp);
                    const pct = Math.min((prog / quest.target) * 100, 100);
                    const done = prog >= quest.target;
                    return (
                      <div key={emp.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
                          <span style={{ color: done ? "#22d3ee" : "#8b8fa3", fontWeight: done ? 700 : 400 }}>{done ? "✅ " : ""}{emp.name}</span>
                          <span style={{ color: done ? "#22d3ee" : "#eef0ff", fontWeight: 700 }}>{quest.category === "revenue" ? formatMoney(prog) : prog} / {quest.category === "revenue" ? formatMoney(quest.target) : quest.target}</span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: done ? "linear-gradient(90deg, #22d3ee, #38bdf8)" : `linear-gradient(90deg, ${quest.color}, ${quest.color}88)`,
                            borderRadius: 3, transition: "width 0.5s ease",
                            boxShadow: done ? "0 0 8px rgba(34,211,238,0.3)" : "none",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SALES PLANS TAB */}
      {adminView === "plans" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2 }}>Планы продаж</div>
            <button onClick={() => setShowPlanModal(true)} style={{ ...smallBtn("rgba(34,211,238,0.15)", "rgba(34,211,238,0.3)", "#22d3ee"), fontWeight: 700 }}>+ Новый план</button>
          </div>

          {salesPlans.length === 0 && (
            <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40 }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>🎯</div>
              Нет активных планов. Создайте план продаж для мотивации команды!
            </div>
          )}

          {salesPlans.map((plan) => {
            const progress = getPlanProgress(plan);
            const pct = Math.min((progress / plan.target) * 100, 100);
            const done = progress >= plan.target;
            const periodLabel = { today: "Сегодня", week: "Неделя", month: "Месяц" }[plan.period] || plan.period;
            const catInfo = menuCategories[plan.category];
            return (
              <div key={plan.id} style={{ ...cardStyle, borderRadius: 18, padding: 18, marginBottom: 12, border: done ? "1px solid rgba(34,211,238,0.4)" : cardStyle.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "1.4rem" }}>{catInfo?.emoji || "📦"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{catInfo?.name || plan.category}</div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7094" }}>{periodLabel}{plan.reward > 0 ? ` · 💰 ${plan.reward}₽` : ""}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {done && <span style={{ fontSize: "1.2rem" }}>✅</span>}
                    <button onClick={() => deleteSalesPlan(plan.id)} style={{ background: "none", border: "none", color: "#ff5050", cursor: "pointer", fontSize: "0.9rem", padding: 4 }}>✕</button>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.8rem", fontWeight: 900, color: done ? "#22d3ee" : "#eef0ff" }}>
                    {progress} <span style={{ fontSize: "1rem", fontWeight: 600, color: "#6b7094" }}>/ {plan.target}</span>
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: done ? "#22d3ee" : "#c471f5" }}>{Math.round(pct)}%</div>
                </div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%",
                    background: done ? "linear-gradient(90deg, #22d3ee, #38bdf8)" : "linear-gradient(90deg, #c471f5, #e879f9)",
                    borderRadius: 5, transition: "width 0.8s ease",
                    boxShadow: done ? "0 0 12px rgba(34,211,238,0.3)" : "0 0 12px rgba(196,113,245,0.2)",
                  }} />
                </div>
                {/* Per-employee breakdown */}
                <div style={{ marginTop: 12 }}>
                  {employees.map(emp => {
                    const empSales = (emp.sales || []).filter(s => {
                      const d = new Date(s.timestamp);
                      const now = new Date();
                      const catItems = menuCategories[plan.category]?.items || [];
                      const inCat = catItems.some(item => item.id === s.id);
                      if (!inCat) return false;
                      if (plan.period === "today") return d.toDateString() === now.toDateString();
                      if (plan.period === "week") return now - d < 7 * 86400000;
                      if (plan.period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                      return true;
                    }).length;
                    if (empSales === 0) return null;
                    return (
                      <div key={emp.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#8b8fa3", padding: "3px 0" }}>
                        <span>{emp.name}</span>
                        <span style={{ fontWeight: 700, color: "#eef0ff" }}>{empSales} продаж</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bonus Multiplier Modal */}
      {showBonusMultiplierModal && (() => {
        const emp = employees.find(e => e.id === showBonusMultiplierModal);
        if (!emp) return null;
        const currentMult = emp.bonusMultiplier || 0;
        return (
          <div onClick={() => setShowBonusMultiplierModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,18,40,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360 }}>
              <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Бонусный множитель</div>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 20, color: "#eef0ff" }}>{emp.name}</div>
              
              <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 12 }}>Текущий: <span style={{ color: currentMult > 0 ? "#22d3ee" : "#4a4e6e", fontWeight: 700 }}>{currentMult > 0 ? `+${currentMult}%` : "нет"}</span></div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {[0, 2, 5, 10].map(mult => (
                  <button key={mult} onClick={() => setBonusMultiplier(showBonusMultiplierModal, mult)} style={{
                    padding: "14px 16px", borderRadius: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: "0.9rem",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: currentMult === mult ? "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(56,189,248,0.1))" : "rgba(255,255,255,0.06)",
                    border: currentMult === mult ? "1px solid rgba(34,211,238,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    color: currentMult === mult ? "#22d3ee" : "#eef0ff",
                  }}>
                    <span>{mult === 0 ? "Без множителя" : `+${mult}% к бонусам`}</span>
                    <span style={{ fontSize: "1.1rem" }}>{mult === 0 ? "—" : mult === 2 ? "🔹" : mult === 5 ? "🔷" : "🚀"}</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: "0.7rem", color: "#4a4e6e", textAlign: "center" }}>
                Множитель добавляется сверх стандартного бонуса за каждую продажу
              </div>

              <button onClick={() => setShowBonusMultiplierModal(null)} style={{ width: "100%", padding: 14, marginTop: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Закрыть</button>
            </div>
          </div>
        );
      })()}

      {/* Add Sales Plan Modal */}
      {showPlanModal && (
        <div onClick={() => setShowPlanModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,18,40,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Новый план продаж</div>

            <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Категория</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {Object.entries(menuCategories).map(([key, cat]) => (
                <button key={key} onClick={() => setPlanCategory(key)} style={{
                  flex: 1, padding: "12px 6px", borderRadius: 12, cursor: "pointer", textAlign: "center",
                  fontSize: "0.75rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  background: planCategory === key ? "linear-gradient(135deg, rgba(196,113,245,0.2), rgba(196,113,245,0.08))" : "rgba(255,255,255,0.06)",
                  border: planCategory === key ? "1px solid rgba(196,113,245,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  color: planCategory === key ? "#f0abfc" : "#6b7094",
                }}>
                  <div style={{ fontSize: "1.2rem", marginBottom: 2 }}>{cat.emoji}</div>
                  {cat.name.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}
                </button>
              ))}
            </div>

            <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Цель (количество продаж)</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={planTarget}
                  onChange={(e) => setPlanTarget(e.target.value)}
                  placeholder="Кол-во: 50"
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={planReward}
                  onChange={(e) => setPlanReward(e.target.value)}
                  placeholder="Премия ₽"
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Период</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {[{ k: "today", l: "Сегодня" }, { k: "week", l: "Неделя" }, { k: "month", l: "Месяц" }].map(p => (
                <button key={p.k} onClick={() => setPlanPeriod(p.k)} style={{
                  flex: 1, padding: "10px 6px", borderRadius: 10, cursor: "pointer",
                  fontSize: "0.8rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                  background: planPeriod === p.k ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.06)",
                  border: planPeriod === p.k ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color: planPeriod === p.k ? "#22d3ee" : "#6b7094",
                }}>{p.l}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPlanModal(false)} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Отмена</button>
              <button onClick={addSalesPlan} style={{ flex: 1, padding: 14, background: planTarget > 0 ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: planTarget > 0 ? "#0d0b1a" : "#4a4e6e", cursor: planTarget > 0 ? "pointer" : "default", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Daily Quest Modal */}
      {showQuestModal && (
        <div onClick={() => setShowQuestModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,18,40,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>⚔️ Новое ежедневное задание</div>

            <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Кому</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              <button onClick={() => setQuestAssignee("all")} style={{
                padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.8rem", fontWeight: 700,
                background: questAssignee === "all" ? "rgba(196,113,245,0.2)" : "rgba(255,255,255,0.06)",
                border: questAssignee === "all" ? "1px solid rgba(196,113,245,0.4)" : "1px solid rgba(255,255,255,0.08)",
                color: questAssignee === "all" ? "#c471f5" : "#6b7094",
              }}>👥 Всем</button>
              {employees.map(emp => (
                <button key={emp.id} onClick={() => setQuestAssignee(emp.id)} style={{
                  padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.8rem", fontWeight: 600,
                  background: questAssignee === emp.id ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.06)",
                  border: questAssignee === emp.id ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color: questAssignee === emp.id ? "#22d3ee" : "#8b8fa3",
                }}>{emp.name}</button>
              ))}
            </div>

            <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Тип задания</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {QUEST_TEMPLATES.map(tpl => (
                <button key={tpl.id} onClick={() => setQuestTemplate(tpl.id)} style={{
                  padding: "12px 14px", borderRadius: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                  display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", fontWeight: 600, textAlign: "left",
                  background: questTemplate === tpl.id ? `${tpl.color}20` : "rgba(255,255,255,0.06)",
                  border: questTemplate === tpl.id ? `1px solid ${tpl.color}50` : "1px solid rgba(255,255,255,0.08)",
                  color: questTemplate === tpl.id ? tpl.color : "#8b8fa3",
                }}>
                  <span style={{ fontSize: "1.2rem" }}>{tpl.icon}</span>
                  {tpl.text.replace("{n}", "N")}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Цель</div>
                <input type="number" value={questTarget} onChange={(e) => setQuestTarget(e.target.value)} placeholder={QUEST_TEMPLATES.find(t => t.id === questTemplate)?.category === "revenue" ? "5000" : "5"}
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Премия ₽</div>
                <input type="number" value={questBonusReward} onChange={(e) => setQuestBonusReward(e.target.value)} placeholder="100"
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowQuestModal(false); setQuestAssignee("all"); }} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Отмена</button>
              <button onClick={addDailyQuest} style={{ flex: 1, padding: 14, background: questTarget > 0 ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: questTarget > 0 ? "#0d0b1a" : "#4a4e6e", cursor: questTarget > 0 ? "pointer" : "default", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MENU MANAGEMENT TAB ═══ */}
      {adminView === "menu" && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Управление меню</div>

          {/* Bonus percent setting */}
          <div style={{ background: "rgba(196,113,245,0.08)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#eef0ff", fontSize: "0.9rem" }}>💰 Бонус сотрудникам</div>
                <div style={{ fontSize: "0.7rem", color: "#6b7094", marginTop: 4 }}>Процент от цены каждой продажи</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {[1, 2, 3, 5, 7, 10].map(p => (
                  <button key={p} onClick={() => setBonusPercent(p)} style={{
                    padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                    fontSize: "0.85rem", fontWeight: 800, fontFamily: "'DM Sans', sans-serif",
                    background: bonusPercent === p ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)",
                    border: bonusPercent === p ? "none" : "1px solid rgba(255,255,255,0.08)",
                    color: bonusPercent === p ? "#0d0b1a" : "#6b7094",
                  }}>{p}%</button>
                ))}
              </div>
            </div>
          </div>

          {/* Categories list */}
          {Object.entries(menuCategories).map(([catKey, cat]) => (
            <div key={catKey} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: "#eef0ff", fontSize: "0.9rem" }}>{cat.emoji || "📂"} {cat.name} <span style={{ color: "#6b7094", fontWeight: 500, fontSize: "0.75rem" }}>({cat.items?.length || 0})</span></div>
                <button onClick={() => {
                  const name = prompt("Название позиции:");
                  if (!name) return;
                  const price = parseInt(prompt("Цена (₽):") || "0");
                  if (!price) return;
                  const id = catKey.slice(0,2) + "_" + Date.now().toString(36);
                  setMenuCategories(prev => ({
                    ...prev,
                    [catKey]: { ...prev[catKey], items: [...(prev[catKey].items || []), { id, name: sanitize(name), price }] }
                  }));
                }} style={{ padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: "0.7rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }}>+ Добавить</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(cat.items || []).map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                    <div style={{ color: "#eef0ff", fontSize: "0.8rem", fontWeight: 600, flex: 1 }}>{item.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ color: "#c471f5", fontSize: "0.8rem", fontWeight: 700 }}>{item.price}₽</div>
                      <div style={{ color: "#6b7094", fontSize: "0.65rem" }}>+{Math.round(item.price * bonusPercent / 100)}₽</div>
                      <button onClick={() => {
                        if (!confirm(`Удалить "${item.name}"?`)) return;
                        setMenuCategories(prev => ({
                          ...prev,
                          [catKey]: { ...prev[catKey], items: prev[catKey].items.filter(i => i.id !== item.id) }
                        }));
                      }} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(255,80,80,0.2)", background: "rgba(255,80,80,0.08)", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add new category */}
          <button onClick={() => {
            const name = prompt("Название новой категории:");
            if (!name) return;
            const emoji = prompt("Эмодзи (например 🍕):") || "📂";
            const key = "cat_" + Date.now().toString(36);
            setMenuCategories(prev => ({
              ...prev,
              [key]: { name: emoji + " " + sanitize(name), emoji, items: [] }
            }));
          }} style={{ width: "100%", padding: 14, borderRadius: 14, cursor: "pointer", fontSize: "0.85rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", background: "rgba(196,113,245,0.1)", border: "1px solid rgba(196,113,245,0.2)", color: "#c471f5", marginTop: 8 }}>+ Добавить категорию</button>
        </div>
      )}

      {/* Change Admin PIN Modal */}
      {showChangePinModal && (
        <div onClick={() => { setShowChangePinModal(false); setNewPinValue(""); setConfirmPinValue(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,18,40,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>🔐 Изменить PIN-код</div>
            <input value={newPinValue} onChange={(e) => setNewPinValue(e.target.value)} type="password" placeholder="Новый PIN..." maxLength={10}
              style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1.2rem", fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "center", letterSpacing: 6, boxSizing: "border-box" }} />
            <input value={confirmPinValue} onChange={(e) => setConfirmPinValue(e.target.value)} type="password" placeholder="Повторите PIN..." maxLength={10}
              style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1.2rem", fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "center", letterSpacing: 6, boxSizing: "border-box" }} />
            {newPinValue && confirmPinValue && newPinValue !== confirmPinValue && (
              <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>PIN-коды не совпадают</div>
            )}
            {newPinValue.length > 0 && newPinValue.length < 4 && (
              <div style={{ color: "#f97316", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>Минимум 4 символа</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowChangePinModal(false); setNewPinValue(""); setConfirmPinValue(""); }} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Отмена</button>
              <button onClick={() => {
                if (newPinValue.length >= 4 && newPinValue === confirmPinValue) {
                  setAdminPinHash(simpleHash(newPinValue));
                  setShowChangePinModal(false);
                  setNewPinValue("");
                  setConfirmPinValue("");
                }
              }} style={{ flex: 1, padding: 14, background: (newPinValue.length >= 4 && newPinValue === confirmPinValue) ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: (newPinValue.length >= 4 && newPinValue === confirmPinValue) ? "#0d0b1a" : "#4a4e6e", cursor: (newPinValue.length >= 4 && newPinValue === confirmPinValue) ? "pointer" : "default", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ EMPLOYEE DASHBOARD ═══

// Confetti component
function Confetti({ active }) {
  if (!active) return null;
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 1.5,
    color: ["#c471f5", "#f97316", "#38bdf8", "#e879f9", "#ff6b6b"][i % 5],
    size: 4 + Math.random() * 6,
  }));

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-10px",
            width: p.size,
            height: p.size,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            backgroundColor: p.color,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function EmployeeDashboard({
  employee, employees, currentEmployee, setEmployees,
  menuCategories, bonusPercent, dailyQuests, setDailyQuests,
  salesPlans, setSalesPlans, onLogout,
}) {
  const [view, setView] = useState("main");
  const [selectedCategory, setSelectedCategory] = useState("hookah");
  const [showConfetti, setShowConfetti] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [reviewPhoto, setReviewPhoto] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewGuestName, setReviewGuestName] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [pendingSaleItem, setPendingSaleItem] = useState(null);
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [saleQuantity, setSaleQuantity] = useState(1);
  const [usedReceiptHashes, setUsedReceiptHashes] = useState([]);
  const [receiptDuplicateError, setReceiptDuplicateError] = useState(false);
  const [achievementPopup, setAchievementPopup] = useState(null);

  // employee comes from props

  const empShiftBonus = (emp) => (emp.shifts || []).reduce((s, sh) => s + (sh.bonus || 0), 0);
  const empTotalHours = (emp) => (emp.shifts || []).reduce((s, sh) => s + (sh.hours || 0), 0);

  const totalBonus = employee
    ? employee.sales.reduce((sum, s) => sum + s.bonus, 0) + (employee.reviews || []).length * REVIEW_BONUS + empShiftBonus(employee)
    : 0;
  const totalRevenue = employee
    ? employee.sales.reduce((sum, s) => sum + s.price, 0)
    : 0;
  const totalReviews = employee ? (employee.reviews || []).length : 0;
  const totalHours = employee ? empTotalHours(employee) : 0;

  const rank = getRank(totalBonus);
  const nextRank = getNextRank(totalBonus);

  const addSale = (item, photo) => {
    const mult = employee?.bonusMultiplier || 0;
    const baseBonus = Math.round(item.price * bonusPercent / 100);
    const extraBonus = mult > 0 ? Math.round(baseBonus * mult / 100) : 0;
    const finalBonus = baseBonus + extraBonus;

    const sale = {
      ...item,
      bonus: finalBonus,
      baseBonus: baseBonus,
      multiplier: mult,
      timestamp: new Date().toISOString(),
      saleId: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      receiptPhoto: photo || null,
      receiptHash: photo ? usedReceiptHashes[usedReceiptHashes.length - 1] || null : null,
    };

    const prevBonus = totalBonus;
    const newBonus = prevBonus + finalBonus;
    const prevRank = getRank(prevBonus);
    const newRank = getRank(newBonus);

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === currentEmployee ? { ...e, sales: [...e.sales, sale] } : e
      )
    );

    setLastSale(item);
    setTimeout(() => setLastSale(null), 2000);

    // ═══ GAMIFICATION: Sound & vibration on sale ═══
    try { navigator.vibrate?.(50); } catch(e) {}
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}

    // Check achievements after sale is added
    const updatedEmp = employees.find(e => e.id === currentEmployee);
    if (updatedEmp) {
      const allTodaySales = [...todaySales, sale];
      for (const ach of ACHIEVEMENTS) {
        const wasEarned = (updatedEmp.earnedAchievements || []).includes(ach.id + "_" + new Date().toDateString());
        if (!wasEarned && ach.check(allTodaySales)) {
          setAchievementPopup(ach);
          // Sound & vibration for achievement
          try { navigator.vibrate?.([100, 50, 100, 50, 200]); } catch(e) {}
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.type = "sine"; osc.frequency.setValueAtTime(523, ctx.currentTime);
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
          } catch(e) {}
          setTimeout(() => setAchievementPopup(null), 3500);
          // Mark as earned today
          setEmployees(prev => prev.map(e =>
            e.id === currentEmployee
              ? { ...e, earnedAchievements: [...(e.earnedAchievements || []), ach.id + "_" + new Date().toDateString()] }
              : e
          ));
          break; // Show one at a time
        }
      }
    }

    // ═══ AUTO-PAY: Quest rewards ═══
    const allSalesAfter = [...todaySales, sale];
    const todayRevAfter = allSalesAfter.reduce((s, x) => s + x.price, 0);
    const todayRevsAfter = todayReviews.length;

    setDailyQuests(prev => prev.map(quest => {
      if (quest.date !== new Date().toDateString()) return quest;
      if (quest.reward <= 0) return quest;
      if (quest.assignee !== "all" && quest.assignee !== currentEmployee) return quest;
      if (quest.rewardPaid?.[currentEmployee]) return quest;

      // Calculate progress
      let prog = 0;
      if (quest.category === "reviews") prog = todayRevsAfter;
      else if (quest.category === "any") prog = allSalesAfter.length;
      else if (quest.category === "revenue") prog = todayRevAfter;
      else {
        const catItems = menuCategories[quest.category]?.items || [];
        const catItemIds = catItems.map(i => i.id);
        prog = allSalesAfter.filter(s => catItemIds.includes(s.id)).length;
      }

      if (prog >= quest.target) {
        // Pay reward — add bonus sale
        const rewardSale = {
          id: "reward", name: `🎁 Премия: ${quest.text}`, price: 0,
          bonus: quest.reward, baseBonus: quest.reward, multiplier: 0,
          timestamp: new Date().toISOString(), saleId: "qr_" + quest.id + "_" + Date.now(),
        };
        setEmployees(p => p.map(e => e.id === currentEmployee ? { ...e, sales: [...e.sales, rewardSale] } : e));
        return { ...quest, rewardPaid: { ...quest.rewardPaid, [currentEmployee]: true } };
      }
      return quest;
    }));

    // ═══ AUTO-PAY: Plan rewards ═══
    setSalesPlans(prev => prev.map(plan => {
      if (plan.reward <= 0) return plan;
      if (plan.rewardPaid?.[currentEmployee]) return plan;

      // Check if this employee's sale contributes to the plan
      const catItems = menuCategories[plan.category]?.items || [];
      const inCat = catItems.some(ci => ci.id === sale.id);
      if (!inCat) return plan;

      // Check overall plan progress
      const now = new Date();
      const allPlanSales = employees.flatMap(e => (e.sales || []).filter(s => {
        const d = new Date(s.timestamp);
        const inCategory = catItems.some(ci => ci.id === s.id);
        if (!inCategory) return false;
        if (plan.period === "today") return d.toDateString() === now.toDateString();
        if (plan.period === "week") return now - d < 7 * 86400000;
        if (plan.period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
      }));
      // +1 for current sale that's being added
      if (allPlanSales.length + 1 >= plan.target) {
        const rewardSale = {
          id: "reward", name: `🏆 План выполнен: ${menuCategories[plan.category]?.name || plan.category}`, price: 0,
          bonus: plan.reward, baseBonus: plan.reward, multiplier: 0,
          timestamp: new Date().toISOString(), saleId: "pr_" + plan.id + "_" + Date.now(),
        };
        setEmployees(p => p.map(e => e.id === currentEmployee ? { ...e, sales: [...e.sales, rewardSale] } : e));
        return { ...plan, rewardPaid: { ...plan.rewardPaid, [currentEmployee]: true } };
      }
      return plan;
    }));

    if (newRank.title !== prevRank.title) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  const openReceiptModal = (item) => {
    setPendingSaleItem(item);
    setReceiptPhoto(null);
    setSaleQuantity(1);
    setReceiptDuplicateError(false);
  };

  const confirmSale = () => {
    if (!pendingSaleItem) return;
    for (let i = 0; i < saleQuantity; i++) {
      addSale(pendingSaleItem, i === 0 ? receiptPhoto : null);
    }
    setPendingSaleItem(null);
    setReceiptPhoto(null);
    setSaleQuantity(1);
    setReceiptDuplicateError(false);
  };

  const cancelSale = () => {
    setPendingSaleItem(null);
    setReceiptPhoto(null);
    setSaleQuantity(1);
    setReceiptDuplicateError(false);
  };

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setReceiptDuplicateError(false);

    // Block gallery: check if file was recently created (within 60 seconds = live camera shot)
    const now = Date.now();
    const fileAge = now - file.lastModified;
    if (fileAge > 60000) {
      // File is older than 60 seconds — likely from gallery
      setReceiptDuplicateError("gallery");
      setReceiptPhoto(null);
      // Reset input
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Create canvas fingerprint for robust duplicate detection
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 32, 32);
        const pixels = ctx.getImageData(0, 0, 32, 32).data;
        let hash = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          hash = ((hash << 5) - hash) + pixels[i] + pixels[i+1] + pixels[i+2];
          hash = hash & hash;
        }
        const fingerprint = "fp_" + Math.abs(hash).toString(36);

        // Check against all existing receipt fingerprints
        const allHashes = employees.flatMap(emp =>
          (emp.sales || []).filter(s => s.receiptHash).map(s => s.receiptHash)
        );
        if (allHashes.includes(fingerprint) || usedReceiptHashes.includes(fingerprint)) {
          setReceiptDuplicateError("duplicate");
          setReceiptPhoto(null);
          return;
        }
        setReceiptPhoto(dataUrl);
        setUsedReceiptHashes(prev => [...prev, fingerprint]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const removeSale = (saleId) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === currentEmployee
          ? { ...e, sales: e.sales.filter((s) => s.saleId !== saleId) }
          : e
      )
    );
  };

  const addReview = () => {
    if (!reviewPhoto) return;
    const review = {
      reviewId: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      guestName: sanitize(reviewGuestName.trim()) || "Гость",
      photo: reviewPhoto,
      timestamp: new Date().toISOString(),
      bonus: REVIEW_BONUS,
    };

    const prevBonus = totalBonus;
    const newBonus = prevBonus + REVIEW_BONUS;
    const prevRank = getRank(prevBonus);
    const newRankVal = getRank(newBonus);

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === currentEmployee
          ? { ...e, reviews: [...(e.reviews || []), review] }
          : e
      )
    );

    setLastSale({ bonus: REVIEW_BONUS, name: "Отзыв на Яндекс" });
    setTimeout(() => setLastSale(null), 2000);

    if (newRankVal.title !== prevRank.title) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }

    setReviewPhoto(null);
    setReviewGuestName("");
    setShowReviewModal(false);
  };

  const removeReview = (reviewId) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === currentEmployee
          ? { ...e, reviews: (e.reviews || []).filter((r) => r.reviewId !== reviewId) }
          : e
      )
    );
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setReviewPhoto(ev.target.result);
    reader.readAsDataURL(file);
  };

  const todaySales = employee
    ? employee.sales.filter(
        (s) =>
          new Date(s.timestamp).toDateString() === new Date().toDateString()
      )
    : [];

  const todayReviews = employee
    ? (employee.reviews || []).filter(
        (r) => new Date(r.timestamp).toDateString() === new Date().toDateString()
      )
    : [];

  const todayBonus = todaySales.reduce((sum, s) => sum + s.bonus, 0) + todayReviews.length * REVIEW_BONUS;
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.price, 0);

  const leaderboard = [...employees]
    .map((e) => ({
      ...e,
      totalBonus: e.sales.reduce((s, sale) => s + sale.bonus, 0) + (e.reviews || []).length * REVIEW_BONUS + (e.shifts || []).reduce((s, sh) => s + (sh.bonus || 0), 0),
      totalRevenue: e.sales.reduce((s, sale) => s + sale.price, 0),
    }))
    .sort((a, b) => b.totalBonus - a.totalBonus);

  const progress = nextRank
    ? ((totalBonus - rank.min) / (nextRank.min - rank.min)) * 100
    : 100;

  // Category sales count for today
  const getCategorySalesToday = (catKey) =>
    todaySales.filter((s) =>
      menuCategories[catKey].items.some((item) => item.id === s.id)
    ).length;

  // Combo system removed — simplified

  // Today's active quests (for current employee or all)
  const todayQuests = dailyQuests.filter(q => q.date === new Date().toDateString() && (q.assignee === "all" || q.assignee === currentEmployee));

  // Quest progress for current employee
  const getMyQuestProgress = (quest) => {
    if (quest.category === "reviews") return todayReviews.length;
    if (quest.category === "any") return todaySales.length;
    if (quest.category === "revenue") return todayRevenue;
    const catItems = menuCategories[quest.category]?.items || [];
    const catItemIds = catItems.map(i => i.id);
    return todaySales.filter(s => catItemIds.includes(s.id)).length;
  };

  // Today's earned achievements
  const todayAchievements = ACHIEVEMENTS.filter(ach =>
    (employee?.earnedAchievements || []).includes(ach.id + "_" + new Date().toDateString())
  );
  const handleLogout = onLogout;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #0d0b1a !important; }

        /* Glassmorphism */
        .glass { backdrop-filter: blur(20px) saturate(200%); -webkit-backdrop-filter: blur(20px) saturate(200%); }

        /* Button micro-interactions */
        button { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        button:active { transform: scale(0.94) !important; }

        html { scroll-behavior: smooth; }

        /* Neon scrollbar */
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: rgba(196,113,245,0.05); }
        ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #c471f5, #38bdf8); border-radius: 4px; }

        /* Neon input focus */
        input:focus { 
          border-color: rgba(196,113,245,0.7) !important; 
          box-shadow: 0 0 20px rgba(196,113,245,0.25), 0 0 60px rgba(196,113,245,0.1), inset 0 0 20px rgba(196,113,245,0.05) !important; 
        }

        /* Neon card hover */
        .neon-card:hover {
          border-color: rgba(196,113,245,0.5) !important;
          box-shadow: 0 8px 32px rgba(196,113,245,0.15), 0 0 60px rgba(196,113,245,0.05) !important;
        }

        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }

        @keyframes slideUp {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes saleFlash {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes bonusPop {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-50px) scale(1.4); opacity: 0; }
        }

        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(196,113,245,0.08), inset 0 0 20px rgba(196,113,245,0.02); }
          50% { box-shadow: 0 0 40px rgba(196,113,245,0.18), inset 0 0 30px rgba(196,113,245,0.2); }
        }

        @keyframes borderShine {
          0% { border-color: rgba(196,113,245,0.3); }
          50% { border-color: rgba(56,189,248,0.4); }
          100% { border-color: rgba(196,113,245,0.3); }
        }

        @keyframes neonPulse {
          0%, 100% { text-shadow: 0 0 7px rgba(196,113,245,0.5), 0 0 20px rgba(196,113,245,0.2); }
          50% { text-shadow: 0 0 12px rgba(196,113,245,0.7), 0 0 30px rgba(196,113,245,0.35); }
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <Confetti active={showConfetti} />

      {/* ═══ ACHIEVEMENT POPUP ═══ */}
      {achievementPopup && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          zIndex: 9800, animation: "slideUp 0.4s ease, fadeIn 0.3s ease",
          background: "linear-gradient(135deg, rgba(20,18,40,0.95), rgba(30,25,55,0.95))",
          backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.4)",
          borderRadius: 20, padding: "16px 24px", display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 8px 40px rgba(196,113,245,0.25), 0 0 80px rgba(196,113,245,0.08)",
          maxWidth: 340, width: "90%",
        }}>
          <div style={{ fontSize: "2.2rem", animation: "pulse 0.5s ease" }}>{achievementPopup.icon}</div>
          <div>
            <div style={{ fontSize: "0.6rem", color: "#c471f5", textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 2 }}>🏆 Достижение!</div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "#eef0ff" }}>{achievementPopup.title}</div>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3" }}>{achievementPopup.desc}</div>
          </div>
        </div>
      )}

      {/* Global Photo Viewer Modal */}
      {viewingPhoto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.92)",
            zIndex: 9500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            cursor: "pointer",
          }}
          onClick={() => setViewingPhoto(null)}
        >
          <img
            src={viewingPhoto}
            alt="Фото"
            style={{
              maxWidth: "100%",
              maxHeight: "85vh",
              borderRadius: 16,
              border: "1px solid rgba(196,113,245,0.3)",
            }}
          />
        </div>
      )}

      {lastSale && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 9998,
            animation: "bonusPop 1.8s ease-out forwards",
            fontSize: "2.5rem",
            fontFamily: "'Outfit', serif",
            fontWeight: 900,
            color: "#c471f5",
            textShadow: "0 0 30px rgba(196,113,245,0.6)",
            pointerEvents: "none",
          }}
        >
          +{lastSale.bonus} ₽
        </div>
      )}

      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(180deg, #130f25 0%, #0d0b1a 15%, #0d0b1a 85%, #0f0d20 100%)",
          fontFamily: "'DM Sans', sans-serif",
          color: "#eef0ff",
          position: "relative",
          overflow: "hidden",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {/* Ambient neon glow orbs */}
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "radial-gradient(600px circle at 15% 10%, rgba(196,113,245,0.07) 0%, transparent 50%), radial-gradient(500px circle at 85% 75%, rgba(56,189,248,0.05) 0%, transparent 50%), radial-gradient(400px circle at 50% 40%, rgba(232,121,249,0.04) 0%, transparent 50%)",
            pointerEvents: "none",
          }}
        />

        {/* LOGIN / SELECT EMPLOYEE */}
        {/* EMPLOYEE VIEW — always shown since auth check above */}
            {/* HEADER */}
            <div
              style={{
                padding: "20px 20px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                position: "relative",
              }}
            >
              {/* Top neon gradient strip */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #c471f5, #38bdf8, #e879f9, #c471f5)", backgroundSize: "300% 100%", animation: "gradientShift 4s ease infinite" }} />
              <button
                onClick={handleLogout}
                style={{
                  background: "rgba(196,113,245,0.25)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(196,113,245,0.3)",
                  borderRadius: 12,
                  padding: "8px 16px",
                  color: "#8b8fa3",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                }}
              >
                ← Выйти
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "0.01em" }}>{employee?.name}</div>
                <div style={{ fontSize: "0.75rem", color: rank.color, fontWeight: 600 }}>
                  {rank.icon} {rank.title}
                </div>
              </div>
            </div>

            {/* NAV TABS */}
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "16px 20px",
                background: "rgba(196,113,245,0.03)",
                marginLeft: 20,
                marginRight: 20,
                borderRadius: 18,
                marginTop: 16,
              }}
            >
              {[
                { key: "main", label: "Продажи" },
                { key: "reviews", label: "Отзывы" },
                { key: "stats", label: "Статистика" },
                { key: "board", label: "Рейтинг" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setView(tab.key)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    background: view === tab.key
                      ? "linear-gradient(135deg, rgba(196,113,245,0.18), rgba(56,189,248,0.08))"
                      : "transparent",
                    backdropFilter: view === tab.key ? "blur(16px)" : "none",
                    WebkitBackdropFilter: view === tab.key ? "blur(16px)" : "none",
                    border: view === tab.key
                      ? "1px solid rgba(196,113,245,0.35)"
                      : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 14,
                    color: view === tab.key ? "#f0abfc" : "#6b7094",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: view === tab.key ? 800 : 600,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: view === tab.key ? "0 4px 20px rgba(196,113,245,0.25), 0 0 40px rgba(196,113,245,0.2)" : "none",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* MAIN SALES VIEW */}
            {view === "main" && (
              <div style={{ padding: "0 20px 100px", animation: "slideUp 0.3s ease" }}>
                {/* Bonus Card */}
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(196,113,245,0.25) 0%, rgba(56,189,248,0.08) 50%, rgba(232,121,249,0.1) 100%)",
                    backdropFilter: "blur(24px) saturate(200%)",
                    WebkitBackdropFilter: "blur(24px) saturate(200%)",
                    border: "1px solid rgba(196,113,245,0.25)",
                    borderRadius: 24,
                    padding: "26px 24px",
                    marginBottom: 20,
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 60px rgba(196,113,245,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
                    animation: "glowPulse 4s ease-in-out infinite",
                  }}
                >
                  {/* Ambient glow orbs inside card */}
                  <div style={{ position: "absolute", top: -40, left: -40, width: 120, height: 120, background: "radial-gradient(circle, rgba(196,113,245,0.3) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", bottom: -30, right: -30, width: 100, height: 100, background: "radial-gradient(circle, rgba(56,189,248,0.12) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
                  
                  <div
                    style={{
                      position: "absolute",
                      top: -30,
                      right: -20,
                      fontSize: "6rem",
                      opacity: 0.08,
                      animation: "gentleFloat 4s ease-in-out infinite",
                      filter: "blur(1px)",
                    }}
                  >
                    {rank.icon}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, position: "relative" }}>
                    <div>
                      <div style={{ color: "rgba(196,113,245,0.7)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                        Бонусы за сегодня
                        {employee?.bonusMultiplier > 0 && (
                          <span style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(56,189,248,0.1))", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 6, padding: "2px 8px", fontSize: "0.65rem", color: "#22d3ee", fontWeight: 700, letterSpacing: 0 }}>
                            🚀 +{employee.bonusMultiplier}%
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          fontSize: "2.8rem",
                          fontWeight: 900,
                          background: "linear-gradient(135deg, #c471f5, #f0abfc, #38bdf8)",
                          backgroundSize: "200% 200%",
                          animation: "gradientShift 4s ease infinite",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          letterSpacing: "-0.02em",
                          filter: "drop-shadow(0 0 20px rgba(196,113,245,0.4))",
                        }}
                      >
                        {formatMoney(todayBonus)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "rgba(56,189,248,0.7)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 3, marginBottom: 6, fontWeight: 600 }}>
                        Продажи
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "#eef0ff" }}>
                        {formatMoney(todayRevenue)}
                      </div>
                    </div>
                  </div>

                  {/* Progress to next rank */}
                  {nextRank && (
                    <div style={{ position: "relative" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: "0.75rem", color: rank.color, fontWeight: 600 }}>
                          {rank.icon} {rank.title}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: nextRank.color, fontWeight: 600 }}>
                          {nextRank.icon} {nextRank.title}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 8,
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: 4,
                          overflow: "hidden",
                          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3)",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(progress, 100)}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${rank.color}, ${nextRank.color})`,
                            borderRadius: 4,
                            transition: "width 0.8s ease",
                            boxShadow: `0 0 12px ${rank.color}40`,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7094", marginTop: 6, textAlign: "center" }}>
                        Ещё {formatMoney(nextRank.min - totalBonus)} до следующего ранга
                      </div>
                    </div>
                  )}
                  {!nextRank && (
                    <div style={{ textAlign: "center", fontSize: "0.85rem", color: "#f0abfc", position: "relative" }}>
                      👑 Максимальный ранг достигнут!
                    </div>
                  )}
                </div>

                {/* ═══ STREAK & COMBO BAR ═══ */}
                {/* ═══ DAILY QUESTS TRACKER (Game-style quest bar) ═══ */}
                {todayQuests.length > 0 && (
                  <div style={{
                    background: "linear-gradient(135deg, rgba(20,18,40,0.7), rgba(30,25,55,0.5))",
                    border: "1px solid rgba(196,113,245,0.15)",
                    borderRadius: 20, padding: "16px 18px", marginBottom: 16,
                    position: "relative", overflow: "hidden",
                  }}>
                    {/* Animated background shimmer */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(196,113,245,0.3), rgba(56,189,248,0.3), transparent)", backgroundSize: "200% 100%", animation: "shimmer 3s linear infinite" }} />

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: "1.1rem" }}>⚔️</span>
                      <span style={{ fontSize: "0.75rem", color: "#c471f5", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Ежедневные квесты</span>
                      <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#22d3ee", fontWeight: 700 }}>
                        {todayQuests.filter(q => getMyQuestProgress(q) >= q.target).length}/{todayQuests.length}
                      </span>
                    </div>

                    {todayQuests.map((quest, qi) => {
                      const prog = getMyQuestProgress(quest);
                      const pct = Math.min((prog / quest.target) * 100, 100);
                      const done = prog >= quest.target;
                      return (
                        <div key={quest.id} style={{ marginBottom: qi < todayQuests.length - 1 ? 10 : 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 8,
                              background: done ? "rgba(34,211,238,0.2)" : `${quest.color}15`,
                              border: done ? "1px solid rgba(34,211,238,0.4)" : `1px solid ${quest.color}30`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.85rem",
                            }}>{done ? "✅" : quest.icon}</div>
                            <span style={{ flex: 1, fontSize: "0.8rem", fontWeight: 600, color: done ? "#22d3ee" : "#eef0ff", textDecoration: done ? "line-through" : "none", opacity: done ? 0.7 : 1 }}>
                              {quest.text}
                            </span>
                            <span style={{ fontSize: "0.75rem", fontWeight: 800, fontFamily: "'Outfit', sans-serif", color: done ? "#22d3ee" : quest.color }}>
                              {quest.category === "revenue" ? formatMoney(prog) : prog}/{quest.category === "revenue" ? formatMoney(quest.target) : quest.target}
                            </span>
                          </div>
                          {/* Game-style XP bar */}
                          <div style={{ height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                            <div style={{
                              width: `${pct}%`, height: "100%",
                              background: done
                                ? "linear-gradient(90deg, #22d3ee, #38bdf8)"
                                : `linear-gradient(90deg, ${quest.color}, ${quest.color}88)`,
                              borderRadius: 4,
                              transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                              boxShadow: done ? "0 0 10px rgba(34,211,238,0.4)" : `0 0 8px ${quest.color}30`,
                              position: "relative",
                            }}>
                              {/* Animated shimmer on progress bar */}
                              {!done && pct > 0 && (
                                <div style={{ position: "absolute", top: 0, right: 0, width: 20, height: "100%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)", animation: "shimmer 2s linear infinite" }} />
                              )}
                            </div>
                          </div>
                          {quest.reward > 0 && done && (
                            <div style={{ fontSize: "0.65rem", color: quest.rewardPaid?.[currentEmployee] ? "#22d3ee" : "#f97316", marginTop: 3, textAlign: "right" }}>
                              {quest.rewardPaid?.[currentEmployee] ? "✅ +" + quest.reward + "₽ начислено" : "🎁 +" + quest.reward + "₽ премия"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ═══ TODAY'S ACHIEVEMENTS ═══ */}
                {todayAchievements.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                    {todayAchievements.map(ach => (
                      <div key={ach.id} style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                        background: "rgba(196,113,245,0.1)", border: "1px solid rgba(196,113,245,0.2)",
                        borderRadius: 12, padding: "6px 12px",
                      }}>
                        <span style={{ fontSize: "1rem" }}>{ach.icon}</span>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#f0abfc", whiteSpace: "nowrap" }}>{ach.title}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick stats pills */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  {Object.entries(menuCategories).map(([key, cat]) => (
                    <div
                      key={key}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "12px 6px",
                        background: "rgba(196,113,245,0.2)",
                        border: "1px solid rgba(196,113,245,0.25)",
                        borderRadius: 16,
                        transition: "all 0.3s ease",
                      }}
                    >
                      <div style={{ fontSize: "1.2rem", marginBottom: 2 }}>{cat.emoji}</div>
                      <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#eef0ff" }}>
                        {getCategorySalesToday(key)}
                      </div>
                      <div style={{ fontSize: "0.6rem", color: "#6b7094", textTransform: "uppercase", letterSpacing: 1 }}>сегодня</div>
                    </div>
                  ))}
                  <div
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "12px 6px",
                      background: "rgba(196,113,245,0.2)",
                      border: "1px solid rgba(196,113,245,0.25)",
                      borderRadius: 16,
                    }}
                  >
                    <div style={{ fontSize: "1.2rem", marginBottom: 2 }}>⭐</div>
                    <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#eef0ff" }}>
                      {todayReviews.length}
                    </div>
                    <div style={{ fontSize: "0.6rem", color: "#6b7094", textTransform: "uppercase", letterSpacing: 1 }}>отзывы</div>
                  </div>
                </div>

                {/* Category Selector */}
                <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 4, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  {Object.entries(menuCategories).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      style={{
                        minWidth: 70,
                        padding: "10px 8px",
                        background: selectedCategory === key
                          ? "linear-gradient(135deg, rgba(196,113,245,0.2), rgba(56,189,248,0.1))"
                          : "transparent",
                        border: selectedCategory === key
                          ? "1px solid rgba(196,113,245,0.35)"
                          : "1px solid transparent",
                        borderRadius: 14,
                        color: selectedCategory === key ? "#f0abfc" : "#6b7094",
                        cursor: "pointer",
                        fontSize: "0.65rem",
                        fontWeight: selectedCategory === key ? 800 : 600,
                        fontFamily: "'DM Sans', sans-serif",
                        transition: "all 0.2s",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ fontSize: "1.1rem", marginBottom: 2 }}>{cat.emoji}</div>
                      {cat.name.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}
                    </button>
                  ))}
                </div>

                {/* Items Grid */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(menuCategories[selectedCategory]?.items || []).map((item) => {
                    const count = todaySales.filter((s) => s.id === item.id).length;
                    return (
                      <button
                        key={item.id}
                        onClick={() => openReceiptModal(item)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          width: "100%",
                          padding: "18px 20px",
                          background: "linear-gradient(135deg, rgba(20,18,40,0.8), rgba(30,25,50,0.6))",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          border: "1px solid rgba(196,113,245,0.2)",
                          borderRadius: 18,
                          color: "#eef0ff",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "'DM Sans', sans-serif",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          position: "relative",
                          overflow: "hidden",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.2)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)"; }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 3, letterSpacing: "0.01em" }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#8b8fa3" }}>
                            {formatMoney(item.price)}
                          </div>
                        </div>
                        <div
                          style={{
                            background: "linear-gradient(135deg, rgba(196,113,245,0.3), rgba(56,189,248,0.08))",
                            border: "1px solid rgba(196,113,245,0.25)",
                            borderRadius: 12,
                            padding: "6px 14px",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: "0.6rem", color: "#c471f5", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>бонус</div>
                          <div style={{ fontWeight: 800, color: "#f0abfc", fontSize: "1rem", textShadow: "0 0 10px rgba(196,113,245,0.4)" }}>
                            +{Math.round(item.price * bonusPercent / 100) + (employee?.bonusMultiplier ? Math.round(Math.round(item.price * bonusPercent / 100) * employee.bonusMultiplier / 100) : 0)}₽
                          </div>
                          {employee?.bonusMultiplier > 0 && (
                            <div style={{ fontSize: "0.55rem", color: "#22d3ee", fontWeight: 600 }}>+{employee.bonusMultiplier}%</div>
                          )}
                        </div>
                        {count > 0 && (
                          <div
                            style={{
                              minWidth: 30,
                              height: 30,
                              background: "linear-gradient(135deg, rgba(196,113,245,0.25), rgba(232,121,249,0.15))",
                              border: "1px solid rgba(196,113,245,0.4)",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: "#f0abfc",
                              boxShadow: "0 0 12px rgba(196,113,245,0.2)",
                            }}
                          >
                            {count}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Receipt Confirmation Modal */}
                {pendingSaleItem && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.85)",
                      zIndex: 9000,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 20,
                    }}
                    onClick={cancelSale}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                        border: "1px solid rgba(196,113,245,0.2)",
                        borderRadius: 24,
                        padding: 28,
                        width: "100%",
                        maxWidth: 400,
                        animation: "slideUp 0.3s ease",
                      }}
                    >
                      <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.3rem", fontWeight: 900, color: "#c471f5", marginBottom: 6, textAlign: "center" }}>
                        🧾 Подтверждение продажи
                      </div>

                      <div style={{ textAlign: "center", marginBottom: 20 }}>
                        <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#eef0ff" }}>
                          {pendingSaleItem.name}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#8b8fa3", marginTop: 2 }}>
                          {formatMoney(pendingSaleItem.price)} · бонус +{Math.round(pendingSaleItem.price * bonusPercent / 100)}₽
                        </div>
                      </div>

                      {/* Quantity selector */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
                        <button onClick={() => setSaleQuantity(q => Math.max(1, q - 1))} style={{
                          width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(196,113,245,0.3)",
                          background: "rgba(196,113,245,0.1)", color: "#c471f5", fontSize: "1.3rem", fontWeight: 800,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'DM Sans', sans-serif", opacity: saleQuantity <= 1 ? 0.3 : 1,
                        }}>−</button>
                        <div style={{ textAlign: "center", minWidth: 60 }}>
                          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "2rem", fontWeight: 900, color: "#eef0ff", lineHeight: 1 }}>{saleQuantity}</div>
                          <div style={{ fontSize: "0.65rem", color: "#6b7094", marginTop: 2 }}>шт.</div>
                        </div>
                        <button onClick={() => setSaleQuantity(q => Math.min(20, q + 1))} style={{
                          width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(196,113,245,0.3)",
                          background: "rgba(196,113,245,0.1)", color: "#c471f5", fontSize: "1.3rem", fontWeight: 800,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "'DM Sans', sans-serif",
                        }}>+</button>
                      </div>

                      {saleQuantity > 1 && (
                        <div style={{ textAlign: "center", marginBottom: 16, padding: "10px 14px", background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.15)", borderRadius: 12 }}>
                          <div style={{ fontSize: "0.75rem", color: "#6b7094" }}>Итого</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#22d3ee" }}>
                            {formatMoney(pendingSaleItem.price * saleQuantity)} · бонус +{Math.round(pendingSaleItem.price * bonusPercent / 100) * saleQuantity}₽
                          </div>
                        </div>
                      )}

                      {/* Receipt Photo Upload */}
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          minHeight: receiptPhoto ? "auto" : 140,
                          background: receiptPhoto ? "transparent" : "rgba(255,255,255,0.1)",
                          border: receiptPhoto ? "none" : "2px dashed rgba(196,113,245,0.2)",
                          borderRadius: 16,
                          cursor: "pointer",
                          marginBottom: 16,
                          overflow: "hidden",
                          transition: "all 0.2s",
                        }}
                      >
                        {receiptPhoto ? (
                          <img
                            src={receiptPhoto}
                            alt="Фото чека"
                            style={{
                              width: "100%",
                              borderRadius: 16,
                              border: "1px solid rgba(196,113,245,0.2)",
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: "2.2rem", marginBottom: 6, opacity: 0.5 }}>📸</div>
                            <div style={{ color: "#8b8fa3", fontSize: "0.85rem", fontWeight: 600 }}>
                              Сфотографировать чек
                            </div>
                            <div style={{ color: "#4a4e6e", fontSize: "0.7rem", marginTop: 4 }}>
                              Только камера · из галереи нельзя
                            </div>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleReceiptUpload}
                          style={{ display: "none" }}
                        />
                      </label>

                      {receiptDuplicateError && (
                        <div style={{
                          padding: "12px 16px", marginBottom: 14, borderRadius: 12,
                          background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
                          color: "#ff5050", fontSize: "0.8rem", fontWeight: 600, textAlign: "center",
                        }}>
                          {receiptDuplicateError === "gallery"
                            ? "📵 Нельзя загружать фото из галереи! Сделайте новое фото камерой."
                            : "⚠️ Этот чек уже был загружен ранее! Сделайте новое фото."
                          }
                        </div>
                      )}

                      {receiptPhoto && (
                        <button
                          onClick={() => setReceiptPhoto(null)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            background: "rgba(255,80,80,0.1)",
                            border: "1px solid rgba(255,80,80,0.2)",
                            borderRadius: 10,
                            color: "#ff5050",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontFamily: "'DM Sans', sans-serif",
                            marginBottom: 14,
                          }}
                        >
                          Удалить фото
                        </button>
                      )}

                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={cancelSale}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "rgba(255,255,255,0.09)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 12,
                            color: "#8b8fa3",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={confirmSale}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "linear-gradient(135deg, #c471f5, #a855f7)",
                            border: "none",
                            borderRadius: 12,
                            color: "#0d0b1a",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 800,
                            fontFamily: "'DM Sans', sans-serif",
                            letterSpacing: 0.5,
                          }}
                        >
                          {receiptPhoto ? "✓ Подтвердить" : "Без чека"}
                        </button>
                      </div>

                      {!receiptPhoto && (
                        <div style={{ textAlign: "center", fontSize: "0.7rem", color: "#4a4e6e", marginTop: 10 }}>
                          Рекомендуем приложить фото чека для подтверждения
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Today's History Toggle */}
                {todaySales.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 14,
                        color: "#8b8fa3",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      {showHistory ? "Скрыть" : "Показать"} историю за сегодня ({todaySales.length})
                    </button>

                    {showHistory && (
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        {[...todaySales].reverse().map((sale) => (
                          <div
                            key={sale.saleId}
                            style={{
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 12,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                  {sale.name}
                                  {sale.receiptPhoto && (
                                    <span
                                      onClick={() => setViewingPhoto(sale.receiptPhoto)}
                                      style={{ cursor: "pointer", fontSize: "0.75rem", opacity: 0.7 }}
                                      title="Есть фото чека"
                                    >📎</span>
                                  )}
                                  {!sale.receiptPhoto && (
                                    <span style={{ fontSize: "0.6rem", color: "#fb923c", opacity: 0.7 }}>без чека</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "#4a4e6e" }}>
                                  {new Date(sale.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                  {" · "}+{sale.bonus}₽ бонус
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {sale.receiptPhoto && (
                                  <button
                                    onClick={() => setViewingPhoto(sale.receiptPhoto)}
                                    style={{
                                      background: "rgba(196,113,245,0.2)",
                                      border: "1px solid rgba(196,113,245,0.2)",
                                      borderRadius: 8,
                                      padding: "4px 8px",
                                      color: "#c471f5",
                                      cursor: "pointer",
                                      fontSize: "0.7rem",
                                      fontFamily: "'DM Sans', sans-serif",
                                    }}
                                  >
                                    🧾
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeSale(sale.saleId); }}
                                  style={{
                                    background: "rgba(255,80,80,0.1)",
                                    border: "1px solid rgba(255,80,80,0.2)",
                                    borderRadius: 8,
                                    padding: "4px 10px",
                                    color: "#ff5050",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    fontFamily: "'DM Sans', sans-serif",
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* REVIEWS VIEW */}
            {view === "reviews" && (
              <div style={{ padding: "0 20px 40px", animation: "slideUp 0.3s ease" }}>
                {/* Add Review Button */}
                <button
                  onClick={() => setShowReviewModal(true)}
                  style={{
                    width: "100%",
                    padding: "20px",
                    background: "linear-gradient(135deg, rgba(196,113,245,0.3), rgba(196,113,245,0.2))",
                    border: "2px dashed rgba(196,113,245,0.3)",
                    borderRadius: 20,
                    color: "#c471f5",
                    cursor: "pointer",
                    fontSize: "1rem",
                    fontWeight: 800,
                    fontFamily: "'DM Sans', sans-serif",
                    marginBottom: 24,
                    transition: "all 0.2s",
                  }}
                >
                  📸 Добавить отзыв с Яндекса
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#8b8fa3", marginTop: 4 }}>
                    Бонус: +{REVIEW_BONUS}₽ за каждый отзыв
                  </div>
                </button>

                {/* Review Modal */}
                {showReviewModal && (
                  <div
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.85)",
                      zIndex: 9000,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 20,
                    }}
                    onClick={() => { setShowReviewModal(false); setReviewPhoto(null); setReviewGuestName(""); }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                        border: "1px solid rgba(196,113,245,0.2)",
                        borderRadius: 24,
                        padding: 28,
                        width: "100%",
                        maxWidth: 400,
                        animation: "slideUp 0.3s ease",
                      }}
                    >
                      <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.3rem", fontWeight: 900, color: "#c471f5", marginBottom: 20, textAlign: "center" }}>
                        📸 Новый отзыв
                      </div>

                      <input
                        value={reviewGuestName}
                        onChange={(e) => setReviewGuestName(e.target.value)}
                        placeholder="Имя гостя (необязательно)"
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(196,113,245,0.3)",
                          borderRadius: 12,
                          color: "#eef0ff",
                          fontSize: "0.9rem",
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                          marginBottom: 14,
                        }}
                      />

                      {/* Photo Upload */}
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          minHeight: reviewPhoto ? "auto" : 160,
                          background: reviewPhoto ? "transparent" : "rgba(255,255,255,0.1)",
                          border: reviewPhoto ? "none" : "2px dashed rgba(196,113,245,0.2)",
                          borderRadius: 16,
                          cursor: "pointer",
                          marginBottom: 18,
                          overflow: "hidden",
                          transition: "all 0.2s",
                        }}
                      >
                        {reviewPhoto ? (
                          <img
                            src={reviewPhoto}
                            alt="Скриншот отзыва"
                            style={{
                              width: "100%",
                              borderRadius: 16,
                              border: "1px solid rgba(196,113,245,0.2)",
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.5 }}>📷</div>
                            <div style={{ color: "#8b8fa3", fontSize: "0.85rem", fontWeight: 600 }}>
                              Загрузить скриншот отзыва
                            </div>
                            <div style={{ color: "#4a4e6e", fontSize: "0.75rem", marginTop: 4 }}>
                              Нажмите или перетащите фото
                            </div>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          style={{ display: "none" }}
                        />
                      </label>

                      {reviewPhoto && (
                        <button
                          onClick={() => setReviewPhoto(null)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            background: "rgba(255,80,80,0.1)",
                            border: "1px solid rgba(255,80,80,0.2)",
                            borderRadius: 10,
                            color: "#ff5050",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontFamily: "'DM Sans', sans-serif",
                            marginBottom: 14,
                          }}
                        >
                          Удалить фото
                        </button>
                      )}

                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => { setShowReviewModal(false); setReviewPhoto(null); setReviewGuestName(""); }}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "rgba(255,255,255,0.09)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 12,
                            color: "#8b8fa3",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={addReview}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: reviewPhoto
                              ? "linear-gradient(135deg, #c471f5, #a855f7)"
                              : "rgba(255,255,255,0.09)",
                            border: "none",
                            borderRadius: 12,
                            color: reviewPhoto ? "#0d0b1a" : "#4a4e6e",
                            cursor: reviewPhoto ? "pointer" : "default",
                            fontSize: "0.9rem",
                            fontWeight: 800,
                            fontFamily: "'DM Sans', sans-serif",
                            letterSpacing: 0.5,
                          }}
                        >
                          +{REVIEW_BONUS}₽ ✓
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reviews List */}
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#8b8fa3", marginBottom: 14, textTransform: "uppercase", letterSpacing: 2 }}>
                  Все отзывы ({(employee?.reviews || []).length})
                </div>

                {(employee?.reviews || []).length === 0 && (
                  <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40, fontSize: "0.9rem" }}>
                    Пока нет отзывов. Добавьте первый!
                  </div>
                )}

                {[...(employee?.reviews || [])].reverse().map((review) => (
                  <div
                    key={review.reviewId}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          ⭐ {review.guestName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#4a4e6e" }}>
                          {new Date(review.timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          {new Date(review.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          background: "rgba(196,113,245,0.25)",
                          border: "1px solid rgba(196,113,245,0.2)",
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontWeight: 800,
                          color: "#c471f5",
                          fontSize: "0.8rem",
                        }}>
                          +{REVIEW_BONUS}₽
                        </div>
                        <button
                          onClick={() => removeReview(review.reviewId)}
                          style={{
                            background: "rgba(255,80,80,0.1)",
                            border: "1px solid rgba(255,80,80,0.2)",
                            borderRadius: 8,
                            padding: "4px 10px",
                            color: "#ff5050",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {review.photo && (
                      <img
                        src={review.photo}
                        alt="Скриншот отзыва"
                        onClick={() => setViewingPhoto(review.photo)}
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.1)",
                          cursor: "pointer",
                          transition: "opacity 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* STATS VIEW */}
            {view === "stats" && (
              <div style={{ padding: "0 20px 40px", animation: "slideUp 0.3s ease" }}>
                <div
                  style={{
                    background: "rgba(196,113,245,0.2)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
                    border: "1px solid rgba(196,113,245,0.3)",
                    borderRadius: 24,
                    padding: 24,
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "3rem", marginBottom: 8 }}>{rank.icon}</div>
                  <div
                    style={{
                      fontFamily: "'Outfit', serif",
                      fontSize: "1.5rem",
                      fontWeight: 900,
                      color: rank.color,
                      marginBottom: 4,
                    }}
                  >
                    {rank.title}
                  </div>
                  <div style={{ color: "#8b8fa3", fontSize: "0.85rem" }}>
                    Всего заработано бонусов
                  </div>
                  <div
                    style={{
                      fontFamily: "'Outfit', serif",
                      fontSize: "2.5rem",
                      fontWeight: 900,
                      color: "#c471f5",
                      marginTop: 8,
                    }}
                  >
                    {formatMoney(totalBonus)}
                  </div>
                  <div style={{ color: "#6b7094", fontSize: "0.8rem", marginTop: 4 }}>
                    Общая выручка: {formatMoney(totalRevenue)}
                  </div>
                  <div style={{ color: "#6b7094", fontSize: "0.8rem", marginTop: 2 }}>
                    Отзывов собрано: {totalReviews} · Бонус: {formatMoney(totalReviews * REVIEW_BONUS)}
                  </div>
                  <div style={{ color: "#22d3ee", fontSize: "0.8rem", marginTop: 2 }}>
                    🕐 Часов отработано: {formatHours(totalHours)} · Бонус: {formatMoney(empShiftBonus(employee))}
                  </div>
                </div>

                {/* Stats by category */}
                {Object.entries(menuCategories).map(([key, cat]) => {
                  const catSales = employee.sales.filter((s) =>
                    cat.items.some((item) => item.id === s.id)
                  );
                  const catBonus = catSales.reduce((sum, s) => sum + s.bonus, 0);
                  const catRev = catSales.reduce((sum, s) => sum + s.price, 0);

                  return (
                    <div
                      key={key}
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 18,
                        padding: 20,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: "1.4rem" }}>{cat.emoji}</span>
                        <span style={{ fontWeight: 700, fontSize: "1rem" }}>{cat.name.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}</span>
                        <span style={{ marginLeft: "auto", color: "#c471f5", fontWeight: 800 }}>
                          {catSales.length} шт.
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ fontSize: "0.7rem", color: "#6b7094", marginBottom: 2 }}>Выручка</div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{formatMoney(catRev)}</div>
                        </div>
                        <div style={{ flex: 1, background: "rgba(196,113,245,0.25)", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ fontSize: "0.7rem", color: "#8b8fa3", marginBottom: 2 }}>Бонусы</div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#c471f5" }}>{formatMoney(catBonus)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* All-time top items */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 18,
                    padding: 20,
                    marginTop: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 14, color: "#8b8fa3" }}>
                    🏆 Топ продаваемых позиций
                  </div>
                  {(() => {
                    const counts = {};
                    employee.sales.forEach((s) => {
                      counts[s.id] = (counts[s.id] || 0) + 1;
                    });
                    const sorted = Object.entries(counts)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5);
                    return sorted.map(([id, count], i) => {
                      const s = employee.sales.find((x) => x.id === id);
                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ color: "#4a4e6e", fontWeight: 700, fontSize: "0.8rem", width: 20 }}>
                              {i + 1}.
                            </span>
                            <span style={{ fontSize: "0.9rem" }}>{s?.name}</span>
                          </div>
                          <span style={{ fontWeight: 800, color: "#c471f5" }}>{count}×</span>
                        </div>
                      );
                    });
                  })()}
                  {employee.sales.length === 0 && (
                    <div style={{ textAlign: "center", color: "#4a4e6e", padding: 20, fontSize: "0.85rem" }}>
                      Пока нет продаж
                    </div>
                  )}
                </div>

                {/* Active Sales Plans */}
                {salesPlans.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 14, color: "#8b8fa3" }}>
                      🎯 Планы продаж
                    </div>
                    {salesPlans.map((plan) => {
                      const now = new Date();
                      // My contribution to this plan
                      const mySales = (employee.sales || []).filter(s => {
                        const d = new Date(s.timestamp);
                        const catItems = menuCategories[plan.category]?.items || [];
                        const inCat = catItems.some(item => item.id === s.id);
                        if (!inCat) return false;
                        if (plan.period === "today") return d.toDateString() === now.toDateString();
                        if (plan.period === "week") return now - d < 7 * 86400000;
                        if (plan.period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                        return true;
                      }).length;
                      // Total team progress
                      const teamTotal = employees.flatMap(e => (e.sales || []).filter(s => {
                        const d = new Date(s.timestamp);
                        const catItems = menuCategories[plan.category]?.items || [];
                        const inCat = catItems.some(item => item.id === s.id);
                        if (!inCat) return false;
                        if (plan.period === "today") return d.toDateString() === now.toDateString();
                        if (plan.period === "week") return now - d < 7 * 86400000;
                        if (plan.period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                        return true;
                      })).length;
                      const pct = Math.min((teamTotal / plan.target) * 100, 100);
                      const done = teamTotal >= plan.target;
                      const periodLabel = { today: "Сегодня", week: "Неделя", month: "Месяц" }[plan.period];
                      const catInfo = menuCategories[plan.category];

                      return (
                        <div key={plan.id} style={{
                          background: done ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.06)",
                          border: done ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 16, padding: 16, marginBottom: 10,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: "1.1rem" }}>{catInfo?.emoji}</span>
                              <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{catInfo?.name?.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}</span>
                              <span style={{ fontSize: "0.65rem", color: "#6b7094", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 6 }}>{periodLabel}</span>
                            </div>
                            {done && <span>✅</span>}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                            <div>
                              <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.3rem", fontWeight: 900, color: done ? "#22d3ee" : "#eef0ff" }}>{teamTotal}</span>
                              <span style={{ fontSize: "0.85rem", color: "#6b7094" }}> / {plan.target}</span>
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "#22d3ee", fontWeight: 700 }}>Мой вклад: {mySales}</div>
                          </div>
                          <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{
                              width: `${pct}%`, height: "100%",
                              background: done ? "linear-gradient(90deg, #22d3ee, #38bdf8)" : "linear-gradient(90deg, #c471f5, #e879f9)",
                              borderRadius: 4, transition: "width 0.8s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* LEADERBOARD VIEW */}
            {view === "board" && (
              <div style={{ padding: "0 20px 40px", animation: "slideUp 0.3s ease" }}>
                <div
                  style={{
                    fontFamily: "'Outfit', serif",
                    fontSize: "1.3rem",
                    fontWeight: 900,
                    color: "#c471f5",
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  🏆 Таблица лидеров
                </div>

                {leaderboard.map((emp, i) => {
                  const empRank = getRank(emp.totalBonus);
                  const isMe = emp.id === currentEmployee;
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div
                      key={emp.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "16px 18px",
                        marginBottom: 10,
                        background: isMe
                          ? "linear-gradient(135deg, rgba(196,113,245,0.25), rgba(196,113,245,0.08))"
                          : "rgba(255,255,255,0.1)",
                        border: isMe
                          ? "1px solid rgba(196,113,245,0.25)"
                          : "1px solid rgba(255,255,255,0.09)",
                        borderRadius: 18,
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        style={{
                          fontSize: i < 3 ? "1.5rem" : "1rem",
                          width: 36,
                          textAlign: "center",
                          fontWeight: 800,
                          color: i >= 3 ? "#4a4e6e" : undefined,
                        }}
                      >
                        {i < 3 ? medals[i] : `${i + 1}`}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {emp.name} {isMe && <span style={{ color: "#c471f5", fontSize: "0.75rem" }}>(вы)</span>}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: empRank.color }}>
                          {empRank.icon} {empRank.title} · {emp.sales.length} продаж
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, color: "#c471f5", fontSize: "1rem" }}>
                          {formatMoney(emp.totalBonus)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#4a4e6e" }}>
                          {formatMoney(emp.totalRevenue)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {leaderboard.length === 0 && (
                  <div style={{ textAlign: "center", color: "#4a4e6e", padding: 40, fontSize: "0.9rem" }}>
                    Пока нет участников
                  </div>
                )}
              </div>
            )}
        {/* Copyright footer */}
        <div style={{ textAlign: "center", padding: "20px 0 100px", color: "#2e3254", fontSize: "0.6rem", letterSpacing: 1 }}>
          © 2025 Наргилия
        </div>
      </div>
    </>
  );
}

// ═══ MAIN APP ═══
// ═══════════════════════════════════════════════
// MAIN APP — Orchestrator
// ═══════════════════════════════════════════════
export default function HookahSalesApp() {
  // ── Shared state (persisted in Firestore) ──
  const [employees, setEmployees] = useState([]);
  const [salesPlans, setSalesPlans] = useState([]);
  const [dailyQuests, setDailyQuests] = useState([]);
  const [menuCategories, setMenuCategories] = useState(DEFAULT_MENU);
  const [bonusPercent, setBonusPercent] = useState(DEFAULT_BONUS_PERCENT);
  const [adminPinHash, setAdminPinHash] = useState(simpleHash(DEFAULT_ADMIN_PIN));

  // ── Auth state ──
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── App state ──
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Derived ──
  const isAdmin = authUser?.email === ADMIN_EMAIL;
  const employee = employees.find((e) => e.id === currentEmployee);

  // ═══ Firebase Auth listener ═══
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ═══ Firebase real-time data listener ═══
  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let emps = data.employees || [];
        const merged = mergeWithLocalPhotos(emps);
        setEmployees(merged);
        if (data.salesPlans) setSalesPlans(data.salesPlans);
        if (data.dailyQuests) setDailyQuests(data.dailyQuests);
        if (data.menuCategories) setMenuCategories(data.menuCategories);
        if (data.bonusPercent !== undefined) setBonusPercent(data.bonusPercent);
        if (data.adminPinHash) setAdminPinHash(data.adminPinHash);
        setDataLoaded(true);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firebase listen error:", err);
      // Fallback to localStorage
      const local = loadLocalPhotos();
      if (local?.employees) setEmployees(local.employees);
      if (local?.salesPlans) setSalesPlans(local.salesPlans);
      if (local?.dailyQuests) setDailyQuests(local.dailyQuests);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ═══ Auto-match employee when auth + data loads ═══
  useEffect(() => {
    if (!authUser || employees.length === 0) return;
    if (isAdmin) return;
    const emp = employees.find(e => e.authEmail === authUser.email);
    if (emp) {
      setCurrentEmployee(emp.id);
    }
  }, [authUser, employees, isAdmin]);

  // ═══ Auto-save to cloud when data changes ═══
  useEffect(() => {
    if (loading || !_dataLoaded) return;
    saveToCloud({ employees, salesPlans, dailyQuests, menuCategories, bonusPercent, adminPinHash });
    saveLocalPhotos({ employees, salesPlans, dailyQuests });
  }, [employees, salesPlans, dailyQuests, menuCategories, bonusPercent, adminPinHash]);

  // ═══ Logout handler ═══
  const handleLogout = async () => {
    await signOut(auth);
    setCurrentEmployee(null);
  };

  // ═══════════════════════════════════════════════
  // ROUTING
  // ═══════════════════════════════════════════════

  // 1. Loading
  if (loading || authLoading) {
    return <LoadingScreen />;
  }

  // 2. Not logged in
  if (!authUser) {
    return <LoginScreen />;
  }

  // 3. Admin
  if (isAdmin) {
    return (
      <AdminPanel
        employees={employees}
        setEmployees={setEmployees}
        onExit={handleLogout}
        salesPlans={salesPlans}
        setSalesPlans={setSalesPlans}
        dailyQuests={dailyQuests}
        setDailyQuests={setDailyQuests}
        adminPinHash={adminPinHash}
        setAdminPinHash={setAdminPinHash}
        menuCategories={menuCategories}
        setMenuCategories={setMenuCategories}
        bonusPercent={bonusPercent}
        setBonusPercent={setBonusPercent}
      />
    );
  }

  // 4. Employee not linked
  if (!employee) {
    return <UnlinkedAccountScreen email={authUser.email} onLogout={handleLogout} />;
  }

  // 5. Employee dashboard
  return (
    <EmployeeDashboard
      employee={employee}
      employees={employees}
      currentEmployee={currentEmployee}
      setEmployees={setEmployees}
      menuCategories={menuCategories}
      bonusPercent={bonusPercent}
      dailyQuests={dailyQuests}
      setDailyQuests={setDailyQuests}
      salesPlans={salesPlans}
      setSalesPlans={setSalesPlans}
      onLogout={handleLogout}
    />
  );
}
