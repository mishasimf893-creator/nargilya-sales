import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

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

// Firestore helpers — single document for all data
const DATA_DOC = doc(db, "app", "main");
let _saving = false;
let _dataLoaded = false;

async function saveToCloud(data) {
  if (_saving) return;
  // CRITICAL: Never overwrite cloud data with empty employees
  // This prevents data loss when Firebase is unreachable and state resets
  if (!data.employees || data.employees.length === 0) {
    console.warn("Blocked save: empty employees array — protecting cloud data");
    return;
  }
  _saving = true;
  try {
    // Strip base64 photos before saving (too large for Firestore)
    const clean = {
      ...data,
      salesPlans: data.salesPlans || [],
      dailyQuests: data.dailyQuests || [],
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

const CATEGORIES = {
  hookah: {
    name: "🌬️ Кальяны",
    emoji: "🌬️",
    items: [
      { id: "h1", name: "Классический кальян", price: 1500, bonus: 63 },
      { id: "h2", name: "Кальян на фрукте", price: 1800, bonus: 76 },
    ],
  },
  cocktails: {
    name: "🍹 Коктейли",
    emoji: "🍹",
    items: [
      { id: "c1", name: "Мохито", price: 450, bonus: 19 },
      { id: "c2", name: "Маргарита", price: 500, bonus: 21 },
      { id: "c3", name: "Пина Колада", price: 550, bonus: 23 },
      { id: "c4", name: "Лонг Айленд", price: 600, bonus: 28 },
      { id: "c5", name: "Апероль Шприц", price: 550, bonus: 23 },
      { id: "c6", name: "Авторский коктейль", price: 700, bonus: 34 },
    ],
  },
  kitchen: {
    name: "🍽️ Кухня",
    emoji: "🍽️",
    items: [
      { id: "k1", name: "Брускетта", price: 350, bonus: 13 },
      { id: "k2", name: "Цезарь", price: 450, bonus: 17 },
      { id: "k3", name: "Наггетсы", price: 400, bonus: 15 },
      { id: "k4", name: "Пицца", price: 600, bonus: 23 },
      { id: "k5", name: "Паста", price: 550, bonus: 21 },
      { id: "k6", name: "Десерт", price: 350, bonus: 13 },
    ],
  },
};

const REVIEW_BONUS = 200;

// Admin PIN stored in Firestore (not hardcoded). Default only used on first setup.
const DEFAULT_ADMIN_PIN = "1234";

// Simple hash for passwords (not crypto-grade but much better than plaintext)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return "h_" + Math.abs(hash).toString(36);
}

// Simple image hash for duplicate receipt detection
function imageHash(dataUrl) {
  let hash = 0;
  // Sample every 100th char for speed (base64 images are large)
  for (let i = 0; i < dataUrl.length; i += 100) {
    const char = dataUrl.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "img_" + Math.abs(hash).toString(36);
}

// Brute force protection
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300000; // 5 minutes

// Бонус за рабочее время (₽ за час)
const SHIFT_BONUS_RATES = [
  { minHours: 0, rate: 100, label: "Стандарт" },
  { minHours: 6, rate: 130, label: "Полная смена" },
  { minHours: 10, rate: 170, label: "Двойная смена" },
];

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

const RANKS = [
  { min: 0, title: "Салага", icon: "🫧", color: "#64d4aa" },
  { min: 100840, title: "Торгаш года", icon: "✨", color: "#e879f9" },
  { min: 102100, title: "Хастлер", icon: "🔥", color: "#f97316" },
  { min: 104200, title: "Мейн", icon: "💎", color: "#38bdf8" },
  { min: 108400, title: "Легенда", icon: "👑", color: "#c471f5" },
];

// ═══ GAMIFICATION SYSTEM ═══
// Quest templates for admin to create daily quests
const QUEST_TEMPLATES = [
  { id: "qt1", text: "Продай {n} кальянов", category: "hookah", icon: "🌬️", color: "#c471f5" },
  { id: "qt2", text: "Продай {n} коктейлей", category: "cocktails", icon: "🍹", color: "#e879f9" },
  { id: "qt3", text: "Продай {n} блюд с кухни", category: "kitchen", icon: "🍽️", color: "#f97316" },
  { id: "qt4", text: "Собери {n} отзывов", category: "reviews", icon: "⭐", color: "#facc15" },
  { id: "qt5", text: "Сделай {n} продаж (любых)", category: "any", icon: "🔥", color: "#22d3ee" },
  { id: "qt6", text: "Заработай {n}₽ выручки", category: "revenue", icon: "💰", color: "#64d4aa" },
];

// Achievement definitions
const ACHIEVEMENTS = [
  { id: "first_sale", title: "Первая кровь", desc: "Первая продажа за смену", icon: "⚔️", check: (sales) => sales.length >= 1 },
  { id: "triple", title: "Тройной удар", desc: "3 продажи подряд за 10 минут", icon: "⚡", check: (sales) => {
    if (sales.length < 3) return false;
    const last3 = sales.slice(-3);
    return new Date(last3[2].timestamp) - new Date(last3[0].timestamp) < 600000;
  }},
  { id: "five_streak", title: "Серия x5", desc: "5 продаж за смену", icon: "🔥", check: (sales) => sales.length >= 5 },
  { id: "ten_streak", title: "Не остановить!", desc: "10 продаж за смену", icon: "💥", check: (sales) => sales.length >= 10 },
  { id: "hookah_master", title: "Дымный мастер", desc: "Продай 3 кальяна за смену", icon: "🌬️", check: (sales) => sales.filter(s => s.id?.startsWith("h")).length >= 3 },
  { id: "cocktail_king", title: "Коктейльный король", desc: "Продай 5 коктейлей за смену", icon: "🍹", check: (sales) => sales.filter(s => s.id?.startsWith("c")).length >= 5 },
  { id: "revenue_5k", title: "Золотой час", desc: "5000₽ выручки за смену", icon: "💰", check: (sales) => sales.reduce((s, x) => s + x.price, 0) >= 5000 },
  { id: "revenue_10k", title: "Легенда дня", desc: "10000₽ выручки за смену", icon: "👑", check: (sales) => sales.reduce((s, x) => s + x.price, 0) >= 10000 },
  { id: "all_cats", title: "Универсал", desc: "Продай из каждой категории", icon: "🌟", check: (sales) => {
    const hasH = sales.some(s => s.id?.startsWith("h"));
    const hasC = sales.some(s => s.id?.startsWith("c"));
    const hasK = sales.some(s => s.id?.startsWith("k"));
    return hasH && hasC && hasK;
  }},
];

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

function formatMoney(n) {
  return n.toLocaleString("ru-RU") + " ₽";
}

const STORAGE_KEY = "hookah-sales-data";

// localStorage only used for caching photos locally
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

/* ════════════════════════════════════════════ */
/* ─── ADMIN PANEL ─── */
/* ════════════════════════════════════════════ */
function AdminPanel({ employees, setEmployees, onExit, salesPlans, setSalesPlans, dailyQuests, setDailyQuests, adminPinHash, setAdminPinHash }) {
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
  const renameEmployee = (id) => { if (!editName.trim()) return; setEmployees((p) => p.map((e) => (e.id === id ? { ...e, name: editName.trim() } : e))); setShowEditModal(null); setEditName(""); };
  const resetEmployee = (id) => { setEmployees((p) => p.map((e) => (e.id === id ? { ...e, sales: [], reviews: [] } : e))); setConfirmDelete(null); };
  const deleteSale = (empId, saleId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, sales: e.sales.filter((s) => s.saleId !== saleId) } : e))); };
  const deleteReview = (empId, reviewId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, reviews: (e.reviews || []).filter((r) => r.reviewId !== reviewId) } : e))); };
  const changePassword = (id) => { if (!newEmpPassword.trim()) return; setEmployees((p) => p.map((e) => (e.id === id ? { ...e, passwordHash: simpleHash(newEmpPassword.trim()), password: undefined } : e))); setShowPasswordModal(null); setNewEmpPassword(""); };
  const addShift = (empId) => {
    const h = parseFloat(shiftHours);
    if (!h || h <= 0 || h > 24) return;
    const bonus = calcShiftBonus(h);
    const shift = { shiftId: Date.now().toString(), hours: h, bonus, date: shiftDate, rate: getShiftBonusRate(h) };
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
      id: Date.now().toString(),
      category: planCategory,
      target,
      period: planPeriod,
      reward: reward || 0,
      createdAt: new Date().toISOString(),
      rewardPaid: {}, // track who got paid
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
      id: Date.now().toString(),
      templateId: questTemplate,
      text: tpl.text.replace("{n}", target),
      category: tpl.category,
      target,
      icon: tpl.icon,
      color: tpl.color,
      reward: reward || 0,
      assignee: questAssignee, // "all" or employee id
      createdAt: new Date().toISOString(),
      date: new Date().toDateString(),
      rewardPaid: {}, // track who got paid: { empId: true }
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

  // Get quest progress for a specific employee
  const getQuestProgress = (quest, emp) => {
    const now = new Date();
    const todaySales = (emp?.sales || []).filter(s => new Date(s.timestamp).toDateString() === now.toDateString());
    const todayReviews = (emp?.reviews || []).filter(r => new Date(r.timestamp).toDateString() === now.toDateString());
    
    if (quest.category === "hookah") return todaySales.filter(s => s.id?.startsWith("h")).length;
    if (quest.category === "cocktails") return todaySales.filter(s => s.id?.startsWith("c")).length;
    if (quest.category === "kitchen") return todaySales.filter(s => s.id?.startsWith("k")).length;
    if (quest.category === "reviews") return todayReviews.length;
    if (quest.category === "any") return todaySales.length;
    if (quest.category === "revenue") return todaySales.reduce((s, x) => s + x.price, 0);
    return 0;
  };

  // Calculate sales count for a plan
  const getPlanProgress = (plan) => {
    const now = new Date();
    const salesInPeriod = employees.flatMap(e => (e.sales || []).filter(s => {
      const d = new Date(s.timestamp);
      const catItems = CATEGORIES[plan.category]?.items || [];
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
            <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameEmployee(showEditModal)} placeholder="Новое имя..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 14 }} />
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
            <input value={newEmpPassword} onChange={(e) => setNewEmpPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword(showPasswordModal)} type="password" placeholder="Новый пароль..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", marginBottom: 8 }} />
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
              <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "0.9rem", fontFamily: "'DM Sans', sans-serif", outline: "none", colorScheme: "dark" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#8b8fa3", fontSize: "0.75rem", marginBottom: 6 }}>Количество часов</div>
              <input type="number" step="0.5" min="0.5" max="24" value={shiftHours} onChange={(e) => setShiftHours(e.target.value)} placeholder="Например: 8" style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 12, color: "#eef0ff", fontSize: "1.1rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
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
        {[{ k: "dashboard", l: "📊 Обзор" }, { k: "employees", l: "👥 Сотрудники" }, { k: "quests", l: "⚔️ Задания" }, { k: "plans", l: "🎯 Планы" }, { k: "history", l: "📋 История" }].map((t) => (
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
            <div style={{ fontSize: "0.8rem", color: getRank(sel.totalBonus).color, marginBottom: 12 }}>{getRank(sel.totalBonus).title}</div>
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
            const catInfo = CATEGORIES[plan.category];
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
                      const catItems = CATEGORIES[plan.category]?.items || [];
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
              {Object.entries(CATEGORIES).map(([key, cat]) => (
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
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={planReward}
                  onChange={(e) => setPlanReward(e.target.value)}
                  placeholder="Премия ₽"
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }}
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
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.8rem", color: "#6b7094", marginBottom: 8 }}>Премия ₽</div>
                <input type="number" value={questBonusReward} onChange={(e) => setQuestBonusReward(e.target.value)} placeholder="100"
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1rem", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowQuestModal(false); setQuestAssignee("all"); }} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8b8fa3", cursor: "pointer", fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>Отмена</button>
              <button onClick={addDailyQuest} style={{ flex: 1, padding: 14, background: questTarget > 0 ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 12, color: questTarget > 0 ? "#0d0b1a" : "#4a4e6e", cursor: questTarget > 0 ? "pointer" : "default", fontWeight: 800, fontFamily: "'DM Sans', sans-serif" }}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Admin PIN Modal */}
      {showChangePinModal && (
        <div onClick={() => { setShowChangePinModal(false); setNewPinValue(""); setConfirmPinValue(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,18,40,0.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(196,113,245,0.3)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 340 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8fa3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>🔐 Изменить PIN-код</div>
            <input value={newPinValue} onChange={(e) => setNewPinValue(e.target.value)} type="password" placeholder="Новый PIN..." maxLength={10}
              style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1.2rem", fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "center", letterSpacing: 6 }} />
            <input value={confirmPinValue} onChange={(e) => setConfirmPinValue(e.target.value)} type="password" placeholder="Повторите PIN..." maxLength={10}
              style={{ width: "100%", padding: "14px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 12, color: "#eef0ff", fontSize: "1.2rem", fontFamily: "'DM Sans', sans-serif", outline: "none", textAlign: "center", letterSpacing: 6 }} />
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

export default function HookahSalesApp() {
  const [employees, setEmployees] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("main");
  const [selectedCategory, setSelectedCategory] = useState("hookah");
  const [newName, setNewName] = useState("");
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPinError, setAdminPinError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loginEmpId, setLoginEmpId] = useState(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [salesPlans, setSalesPlans] = useState([]);
  const [dailyQuests, setDailyQuests] = useState([]);
  const [achievementPopup, setAchievementPopup] = useState(null);
  const [streakCount, setStreakCount] = useState(0);
  const [lastSaleTime, setLastSaleTime] = useState(null);
  const [comboTimer, setComboTimer] = useState(0);
  // Security
  const [adminPinHash, setAdminPinHash] = useState(simpleHash(DEFAULT_ADMIN_PIN));
  const [adminAttempts, setAdminAttempts] = useState(0);
  const [adminLockUntil, setAdminLockUntil] = useState(0);
  const [empAttempts, setEmpAttempts] = useState(0);
  const [empLockUntil, setEmpLockUntil] = useState(0);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [newPinValue, setNewPinValue] = useState("");
  const [confirmPinValue, setConfirmPinValue] = useState("");

  // Firebase real-time listener
  useEffect(() => {
    const unsub = onSnapshot(DATA_DOC, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const merged = mergeWithLocalPhotos(data.employees || []);
        setEmployees(merged);
        if (data.salesPlans) setSalesPlans(data.salesPlans);
        if (data.dailyQuests) setDailyQuests(data.dailyQuests);
        if (data.adminPinHash) setAdminPinHash(data.adminPinHash);
        // Restore currentEmployee from localStorage
        const localCur = localStorage.getItem("nargilya-current-emp");
        if (localCur && !currentEmployee) setCurrentEmployee(localCur);
        _dataLoaded = true;
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

  // Save to cloud when employees or salesPlans change
  useEffect(() => {
    if (loading || !_dataLoaded) return;
    saveToCloud({ employees, salesPlans, dailyQuests, adminPinHash });
    // Also save full data with photos locally
    saveLocalPhotos({ employees, salesPlans, dailyQuests });
  }, [employees, salesPlans, dailyQuests, adminPinHash]);

  // Save currentEmployee to localStorage (device-specific)
  useEffect(() => {
    if (currentEmployee) {
      localStorage.setItem("nargilya-current-emp", currentEmployee);
    } else {
      localStorage.removeItem("nargilya-current-emp");
    }
  }, [currentEmployee]);

  const employee = employees.find((e) => e.id === currentEmployee);

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

  const addEmployee = () => {
    if (!newName.trim() || !newPassword.trim()) return;
    const emp = {
      id: Date.now().toString(),
      name: newName.trim(),
      passwordHash: simpleHash(newPassword.trim()),
      sales: [],
      reviews: [],
      createdAt: new Date().toISOString(),
    };
    setEmployees((prev) => [...prev, emp]);
    setCurrentEmployee(emp.id);
    setNewName("");
    setNewPassword("");
    setView("main");
  };

  const addSale = (item, photo) => {
    const mult = employee?.bonusMultiplier || 0;
    const baseBonus = item.bonus;
    const extraBonus = mult > 0 ? Math.round(baseBonus * mult / 100) : 0;
    const finalBonus = baseBonus + extraBonus;

    const sale = {
      ...item,
      bonus: finalBonus,
      baseBonus: baseBonus,
      multiplier: mult,
      timestamp: new Date().toISOString(),
      saleId: Date.now().toString(),
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

    // ═══ GAMIFICATION: Streak & Combo (only cocktails & kitchen) ═══
    const isComboItem = item.id?.startsWith("c") || item.id?.startsWith("k");
    if (isComboItem) {
      const now = Date.now();
      if (lastSaleTime && now - lastSaleTime < 1800000) { // 30 min combo window
        setStreakCount(prev => prev + 1);
        setComboTimer(1800);
      } else {
        setStreakCount(1);
        setComboTimer(1800);
      }
      setLastSaleTime(now);
    }

    // Check achievements after sale is added
    const updatedEmp = employees.find(e => e.id === currentEmployee);
    if (updatedEmp) {
      const allTodaySales = [...todaySales, sale];
      for (const ach of ACHIEVEMENTS) {
        const wasEarned = (updatedEmp.earnedAchievements || []).includes(ach.id + "_" + new Date().toDateString());
        if (!wasEarned && ach.check(allTodaySales)) {
          setAchievementPopup(ach);
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
      if (quest.category === "hookah") prog = allSalesAfter.filter(s => s.id?.startsWith("h")).length;
      else if (quest.category === "cocktails") prog = allSalesAfter.filter(s => s.id?.startsWith("c")).length;
      else if (quest.category === "kitchen") prog = allSalesAfter.filter(s => s.id?.startsWith("k")).length;
      else if (quest.category === "reviews") prog = todayRevsAfter;
      else if (quest.category === "any") prog = allSalesAfter.length;
      else if (quest.category === "revenue") prog = todayRevAfter;

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
      const catItems = CATEGORIES[plan.category]?.items || [];
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
          id: "reward", name: `🏆 План выполнен: ${CATEGORIES[plan.category]?.name || plan.category}`, price: 0,
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
      reviewId: Date.now().toString(),
      guestName: reviewGuestName.trim() || "Гость",
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
      CATEGORIES[catKey].items.some((item) => item.id === s.id)
    ).length;

  // Combo timer countdown
  useEffect(() => {
    if (comboTimer <= 0) return;
    const interval = setInterval(() => {
      setComboTimer(prev => {
        if (prev <= 1) { setStreakCount(0); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [comboTimer]);

  // Today's active quests (for current employee or all)
  const todayQuests = dailyQuests.filter(q => q.date === new Date().toDateString() && (q.assignee === "all" || q.assignee === currentEmployee));

  // Quest progress for current employee
  const getMyQuestProgress = (quest) => {
    if (quest.category === "hookah") return todaySales.filter(s => s.id?.startsWith("h")).length;
    if (quest.category === "cocktails") return todaySales.filter(s => s.id?.startsWith("c")).length;
    if (quest.category === "kitchen") return todaySales.filter(s => s.id?.startsWith("k")).length;
    if (quest.category === "reviews") return todayReviews.length;
    if (quest.category === "any") return todaySales.length;
    if (quest.category === "revenue") return todayRevenue;
    return 0;
  };

  // Today's earned achievements
  const todayAchievements = ACHIEVEMENTS.filter(ach =>
    (employee?.earnedAchievements || []).includes(ach.id + "_" + new Date().toDateString())
  );

  const tryAdminLogin = () => {
    const now = Date.now();
    if (adminLockUntil > now) {
      setAdminPinError(true);
      return;
    }
    if (simpleHash(adminPin) === adminPinHash) {
      setIsAdmin(true); setShowAdminLogin(false); setAdminPin(""); setAdminPinError(false);
      setAdminAttempts(0);
    } else {
      const attempts = adminAttempts + 1;
      setAdminAttempts(attempts);
      setAdminPinError(true);
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        setAdminLockUntil(now + LOCKOUT_DURATION);
        setAdminAttempts(0);
      }
    }
  };

  const tryEmployeeLogin = () => {
    const now = Date.now();
    if (empLockUntil > now) {
      setLoginError(true);
      return;
    }
    const emp = employees.find((e) => e.id === loginEmpId);
    if (!emp) return;
    // If employee has no password (old accounts), let them in
    const passwordMatch = !emp.passwordHash
      ? (!emp.password || loginPassword === emp.password)
      : (simpleHash(loginPassword) === emp.passwordHash);
    if (passwordMatch) {
      setCurrentEmployee(emp.id);
      setLoginEmpId(null);
      setLoginPassword("");
      setLoginError(false);
      setEmpAttempts(0);
      setView("main");
      // Migrate plaintext password to hash
      if (emp.password && !emp.passwordHash) {
        setEmployees(prev => prev.map(e =>
          e.id === emp.id ? { ...e, passwordHash: simpleHash(emp.password), password: undefined } : e
        ));
      }
    } else {
      const attempts = empAttempts + 1;
      setEmpAttempts(attempts);
      setLoginError(true);
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        setEmpLockUntil(now + LOCKOUT_DURATION);
        setEmpAttempts(0);
      }
    }
  };

  /* ═══ LOADING ═══ */
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d0b1a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(196,113,245,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
        <svg width="64" height="64" viewBox="0 0 100 100" fill="none" style={{ marginBottom: 16, animation: "gentleFloat 2s ease-in-out infinite", filter: "drop-shadow(0 0 24px rgba(196,113,245,0.35))" }}>
          <defs>
            <linearGradient id="lgLoad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c471f5"/><stop offset="50%" stopColor="#f0abfc"/><stop offset="100%" stopColor="#38bdf8"/>
            </linearGradient>
          </defs>
          <rect x="20" y="40" width="60" height="52" rx="16" stroke="url(#lgLoad)" strokeWidth="2" fill="rgba(196,113,245,0.1)"/>
          <text x="50" y="77" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontSize="36" fontWeight="900" fill="url(#lgLoad)">Н</text>
        </svg>
        <div style={{ fontFamily: "'Outfit', sans-serif", color: "#c471f5", fontSize: "1.2rem", fontWeight: 800, letterSpacing: 6, marginBottom: 8 }}>НАРГИЛИЯ</div>
        <div style={{ color: "#6b7094", fontSize: "0.75rem", marginTop: 4, letterSpacing: 2 }}>подключение...</div>
        <style>{`@keyframes gentleFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
      </div>
    );
  }

  /* ═══ ADMIN MODE ═══ */
  if (isAdmin) {
    return <AdminPanel employees={employees} setEmployees={setEmployees} onExit={() => setIsAdmin(false)} salesPlans={salesPlans} setSalesPlans={setSalesPlans} dailyQuests={dailyQuests} setDailyQuests={setDailyQuests} adminPinHash={adminPinHash} setAdminPinHash={setAdminPinHash} />;
  }

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
        {!currentEmployee ? (
          <div style={{ padding: "40px 24px", animation: "slideUp 0.5s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              {/* SVG Logo */}
              <div style={{ display: "inline-block", marginBottom: 16, position: "relative" }}>
                <svg width="80" height="80" viewBox="0 0 100 100" fill="none" style={{ filter: "drop-shadow(0 0 24px rgba(196,113,245,0.35))" }}>
                  <defs>
                    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#c471f5"/>
                      <stop offset="50%" stopColor="#f0abfc"/>
                      <stop offset="100%" stopColor="#38bdf8"/>
                    </linearGradient>
                  </defs>
                  {/* Main shape — rounded square */}
                  <rect x="15" y="15" width="70" height="70" rx="20" fill="url(#logoGrad)" opacity="0.12"/>
                  <rect x="15" y="15" width="70" height="70" rx="20" stroke="url(#logoGrad)" strokeWidth="2" fill="none"/>
                  {/* Letter Н */}
                  <text x="50" y="62" textAnchor="middle" fontFamily="'Outfit', sans-serif" fontSize="40" fontWeight="900" fill="url(#logoGrad)">Н</text>
                </svg>
              </div>
              <h1
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: "1.8rem",
                  fontWeight: 900,
                  letterSpacing: 6,
                  background: "linear-gradient(135deg, #c471f5 0%, #f0abfc 40%, #38bdf8 70%, #c471f5 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer 4s linear infinite",
                  marginBottom: 4,
                  lineHeight: 1.2,
                }}
              >
                НАРГИЛИЯ
              </h1>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8,
              }}>
                <div style={{ width: 32, height: 1, background: "linear-gradient(90deg, transparent, rgba(196,113,245,0.4))" }}/>
                <p style={{ color: "#6b7094", fontSize: "0.7rem", letterSpacing: 4, textTransform: "uppercase", fontWeight: 600, margin: 0 }}>
                  система мотивации
                </p>
                <div style={{ width: 32, height: 1, background: "linear-gradient(90deg, rgba(196,113,245,0.4), transparent)" }}/>
              </div>
            </div>

            {/* Admin Login Button */}
            <button
              onClick={() => setShowAdminLogin(true)}
              style={{
                width: "100%", padding: "14px", marginBottom: 24,
                background: "linear-gradient(135deg, rgba(196,113,245,0.25), rgba(15,12,30,0.9))",
                border: "1px solid rgba(196,113,245,0.25)", borderRadius: 16, color: "#e879f9",
                cursor: "pointer", fontSize: "0.9rem", fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>👑</span> Войти как руководитель
            </button>

            {/* Admin PIN Modal */}
            {showAdminLogin && (
              <div
                onClick={() => { setShowAdminLogin(false); setAdminPin(""); setAdminPinError(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
              >
                <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, animation: "slideUp 0.3s ease" }}>
                  <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.3rem", fontWeight: 900, color: "#c471f5", marginBottom: 6, textAlign: "center" }}>👑 Вход для руководителя</div>
                  <div style={{ color: "#4a4e6e", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>Введите PIN-код</div>
                  <input
                    value={adminPin}
                    onChange={(e) => { setAdminPin(e.target.value); setAdminPinError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
                    type="password" placeholder="PIN-код..." maxLength={10}
                    style={{
                      width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.08)",
                      border: adminPinError ? "1px solid rgba(255,80,80,0.5)" : "1px solid rgba(196,113,245,0.3)",
                      borderRadius: 12, color: "#eef0ff", fontSize: "1.5rem", fontFamily: "'DM Sans', sans-serif",
                      outline: "none", marginBottom: 8, textAlign: "center", letterSpacing: 8,
                    }}
                  />
                  {adminPinError && adminLockUntil > Date.now() && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>🔒 Слишком много попыток. Подождите 5 минут.</div>}
                  {adminPinError && adminLockUntil <= Date.now() && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>Неверный PIN-код ({MAX_LOGIN_ATTEMPTS - adminAttempts} попыток осталось)</div>}
                  <button onClick={tryAdminLogin} style={{ width: "100%", padding: "14px", marginTop: 6, background: adminPin ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.09)", border: "none", borderRadius: 12, color: adminPin ? "#0d0b1a" : "#4a4e6e", fontWeight: 800, cursor: adminPin ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem" }}>Войти</button>
                </div>
              </div>
            )}

            {/* Employee Password Login Modal */}
            {loginEmpId && (
              <div
                onClick={() => { setLoginEmpId(null); setLoginPassword(""); setLoginError(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
              >
                <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(15,12,30,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", border: "1px solid rgba(196,113,245,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, animation: "slideUp 0.3s ease" }}>
                  <div style={{ fontFamily: "'Outfit', serif", fontSize: "1.3rem", fontWeight: 900, color: "#c471f5", marginBottom: 6, textAlign: "center" }}>
                    🔐 {employees.find((e) => e.id === loginEmpId)?.name}
                  </div>
                  <div style={{ color: "#4a4e6e", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>Введите пароль</div>
                  <input
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && tryEmployeeLogin()}
                    type="password" placeholder="Пароль..." autoFocus
                    style={{
                      width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.08)",
                      border: loginError ? "1px solid rgba(255,80,80,0.5)" : "1px solid rgba(196,113,245,0.3)",
                      borderRadius: 12, color: "#eef0ff", fontSize: "1.1rem", fontFamily: "'DM Sans', sans-serif",
                      outline: "none", marginBottom: 8, textAlign: "center", letterSpacing: 4,
                    }}
                  />
                  {loginError && empLockUntil > Date.now() && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>🔒 Слишком много попыток. Подождите 5 минут.</div>}
                  {loginError && empLockUntil <= Date.now() && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>Неверный пароль ({MAX_LOGIN_ATTEMPTS - empAttempts} попыток)</div>}
                  <button
                    onClick={tryEmployeeLogin}
                    style={{
                      width: "100%", padding: "14px", marginTop: 6,
                      background: loginPassword ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.09)",
                      border: "none", borderRadius: 12, color: loginPassword ? "#0d0b1a" : "#4a4e6e",
                      fontWeight: 800, cursor: loginPassword ? "pointer" : "default",
                      fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem",
                    }}
                  >Войти</button>
                </div>
              </div>
            )}

            {employees.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <p style={{ color: "#8b8fa3", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>
                  Выберите профиль
                </p>
                {employees.map((emp) => {
                  const empBonus = emp.sales.reduce((s, sale) => s + sale.bonus, 0) + (emp.reviews || []).length * REVIEW_BONUS;
                  const empRank = getRank(empBonus);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => {
                        if (!emp.password) {
                          setCurrentEmployee(emp.id); setView("main");
                        } else {
                          setLoginEmpId(emp.id); setLoginPassword(""); setLoginError(false);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        width: "100%",
                        padding: "16px 20px",
                        marginBottom: 10,
                        background: "linear-gradient(135deg, rgba(196,113,245,0.25), rgba(56,189,248,0.03))",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        border: "1px solid rgba(196,113,245,0.25)",
                        borderRadius: 18,
                        color: "#eef0ff",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        fontFamily: "'DM Sans', sans-serif",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(196,113,245,0.4)"; e.currentTarget.style.transform = "translateX(4px)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(196,113,245,0.25)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(196,113,245,0.25)"; e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)"; }}
                    >
                      <span style={{ fontSize: "1.6rem" }}>{empRank.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{emp.name}</div>
                        <div style={{ fontSize: "0.8rem", color: empRank.color }}>{empRank.title} · {formatMoney(empBonus)}</div>
                      </div>
                      {emp.password && <span style={{ fontSize: "0.9rem", opacity: 0.4 }}>🔐</span>}
                      <span style={{ color: "#4a4e6e", fontSize: "1.2rem" }}>→</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div
              style={{
                background: "linear-gradient(135deg, rgba(196,113,245,0.2), rgba(56,189,248,0.03))",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(196,113,245,0.25)",
                borderRadius: 24,
                padding: 24,
                boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 0 60px rgba(196,113,245,0.08)",
              }}
            >
              <p style={{ color: "rgba(196,113,245,0.6)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 3, marginBottom: 16, fontWeight: 600 }}>
                Новый сотрудник
              </p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Введите имя..."
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(196,113,245,0.3)",
                  borderRadius: 12,
                  color: "#eef0ff",
                  fontSize: "1rem",
                  fontFamily: "'DM Sans', sans-serif",
                  outline: "none",
                  marginBottom: 10,
                }}
              />
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmployee()}
                type="password"
                placeholder="Придумайте пароль..."
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(196,113,245,0.3)",
                  borderRadius: 12,
                  color: "#eef0ff",
                  fontSize: "1rem",
                  fontFamily: "'DM Sans', sans-serif",
                  outline: "none",
                  marginBottom: 14,
                }}
              />
              <button
                onClick={addEmployee}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: newName.trim() && newPassword.trim() ? "linear-gradient(135deg, #c471f5, #a855f7)" : "rgba(255,255,255,0.09)",
                  border: "none",
                  borderRadius: 12,
                  color: newName.trim() && newPassword.trim() ? "#0d0b1a" : "#4a4e6e",
                  fontSize: "1rem",
                  fontWeight: 800,
                  cursor: newName.trim() && newPassword.trim() ? "pointer" : "default",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.2s",
                  letterSpacing: 1,
                }}
              >
                НАЧАТЬ
              </button>
            </div>

            {/* Copyright */}
            <div style={{ textAlign: "center", padding: "32px 0 16px", color: "#2e3254", fontSize: "0.65rem", letterSpacing: 1 }}>
              © 2025 Наргилия. Все права защищены.
            </div>
          </div>
        ) : (
          <>
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
                onClick={() => setCurrentEmployee(null)}
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
                {streakCount > 1 && (
                  <div style={{
                    background: streakCount >= 5 ? "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,179,8,0.1))" : "linear-gradient(135deg, rgba(196,113,245,0.1), rgba(56,189,248,0.06))",
                    border: streakCount >= 5 ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(196,113,245,0.2)",
                    borderRadius: 16, padding: "12px 16px", marginBottom: 16,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    animation: "saleFlash 0.4s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontSize: "1.5rem", animation: "pulse 1s ease infinite" }}>
                        {streakCount >= 10 ? "💥" : streakCount >= 5 ? "🔥" : streakCount >= 3 ? "⚡" : "✨"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "0.95rem", color: streakCount >= 5 ? "#f97316" : "#c471f5" }}>
                          КОМБО x{streakCount}!
                        </div>
                        <div style={{ fontSize: "0.65rem", color: "#8b8fa3" }}>
                          {streakCount >= 10 ? "НЕВЕРОЯТНО!" : streakCount >= 5 ? "Огненная серия!" : "Коктейли + Кухня 🍹🍽️"}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.7rem", color: "#6b7094" }}>Таймер</div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1rem", color: comboTimer < 300 ? "#ff5050" : "#22d3ee" }}>
                        {Math.floor(comboTimer / 60)}:{String(comboTimer % 60).padStart(2, "0")}
                      </div>
                    </div>
                  </div>
                )}

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
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
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
                <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: 4 }}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      style={{
                        flex: 1,
                        padding: "12px 8px",
                        background: selectedCategory === key
                          ? "linear-gradient(135deg, rgba(196,113,245,0.2), rgba(56,189,248,0.1))"
                          : "transparent",
                        border: selectedCategory === key
                          ? "1px solid rgba(196,113,245,0.35)"
                          : "1px solid transparent",
                        borderRadius: 14,
                        color: selectedCategory === key ? "#f0abfc" : "#6b7094",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: selectedCategory === key ? 800 : 600,
                        fontFamily: "'DM Sans', sans-serif",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: selectedCategory === key ? "0 4px 20px rgba(196,113,245,0.25), inset 0 1px 0 rgba(255,255,255,0.09)" : "none",
                      }}
                    >
                      <div style={{ fontSize: "1.3rem", marginBottom: 2 }}>{cat.emoji}</div>
                      {cat.name.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}
                    </button>
                  ))}
                </div>

                {/* Items Grid */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {CATEGORIES[selectedCategory].items.map((item) => {
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
                            +{item.bonus + (employee?.bonusMultiplier ? Math.round(item.bonus * employee.bonusMultiplier / 100) : 0)}₽
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
                          {formatMoney(pendingSaleItem.price)} · бонус +{pendingSaleItem.bonus}₽
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
                            {formatMoney(pendingSaleItem.price * saleQuantity)} · бонус +{pendingSaleItem.bonus * saleQuantity}₽
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
                {Object.entries(CATEGORIES).map(([key, cat]) => {
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
                        const catItems = CATEGORIES[plan.category]?.items || [];
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
                        const catItems = CATEGORIES[plan.category]?.items || [];
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
                      const catInfo = CATEGORIES[plan.category];

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
          </>
        )}
        {/* Copyright footer */}
        {currentEmployee && (
          <div style={{ textAlign: "center", padding: "20px 0 100px", color: "#2e3254", fontSize: "0.6rem", letterSpacing: 1 }}>
            © 2025 Наргилия
          </div>
        )}
      </div>
    </>
  );
}
