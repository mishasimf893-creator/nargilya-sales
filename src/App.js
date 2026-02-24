import React, { useState, useEffect, useMemo } from "react";

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
const ADMIN_PIN = "1234";

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
  { min: 0, title: "Новичок", icon: "🌱", color: "#7c8a6e" },
  { min: 100840, title: "Продавец", icon: "⭐", color: "#c9a84c" },
  { min: 102100, title: "Мастер", icon: "🔥", color: "#e07a3a" },
  { min: 104200, title: "Легенда", icon: "💎", color: "#6fa8dc" },
  { min: 108400, title: "Босс кальянной", icon: "👑", color: "#d4af37" },
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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// Confetti component
function Confetti({ active }) {
  if (!active) return null;
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 1.5,
    color: ["#d4af37", "#e07a3a", "#6fa8dc", "#c9a84c", "#ff6b6b"][i % 5],
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
function AdminPanel({ employees, setEmployees, onExit }) {
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
  const changePassword = (id) => { setEmployees((p) => p.map((e) => (e.id === id ? { ...e, password: newEmpPassword.trim() || undefined } : e))); setShowPasswordModal(null); setNewEmpPassword(""); };
  const addShift = (empId) => {
    const h = parseFloat(shiftHours);
    if (!h || h <= 0 || h > 24) return;
    const bonus = calcShiftBonus(h);
    const shift = { shiftId: Date.now().toString(), hours: h, bonus, date: shiftDate, rate: getShiftBonusRate(h) };
    setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, shifts: [...(e.shifts || []), shift] } : e)));
    setShowShiftModal(null); setShiftHours(""); setShiftDate(new Date().toISOString().slice(0, 10));
  };
  const deleteShift = (empId, shiftId) => { setEmployees((p) => p.map((e) => (e.id === empId ? { ...e, shifts: (e.shifts || []).filter((s) => s.shiftId !== shiftId) } : e))); };

  const cardStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16 };
  const smallBtn = (bg, bc, color) => ({ padding: "10px 14px", background: bg, border: `1px solid ${bc}`, borderRadius: 10, color, cursor: "pointer", fontSize: "0.8rem", fontFamily: "'Nunito', sans-serif" });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", fontFamily: "'Nunito', sans-serif", color: "#e8e0d4", maxWidth: 520, margin: "0 auto", padding: "20px 20px 40px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;600;700;800&display=swap');`}</style>

      {/* Photo viewer */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "pointer" }}>
          <img src={viewingPhoto} alt="" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, border: "1px solid rgba(212,175,55,0.3)" }} />
        </div>
      )}

      {/* Rename modal */}
      {showEditModal && (
        <div onClick={() => setShowEditModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 900, color: "#d4af37", marginBottom: 16, textAlign: "center" }}>✏️ Переименовать</div>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameEmployee(showEditModal)} placeholder="Новое имя..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, color: "#e8e0d4", fontSize: "0.9rem", fontFamily: "'Nunito', sans-serif", outline: "none", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowEditModal(null)} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8a7e6d", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => renameEmployee(showEditModal)} style={{ flex: 1, padding: 14, background: editName.trim() ? "linear-gradient(135deg, #d4af37, #b8942d)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, color: editName.trim() ? "#0d0d0d" : "#5a5248", cursor: "pointer", fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Password change modal */}
      {showPasswordModal && (
        <div onClick={() => { setShowPasswordModal(null); setNewEmpPassword(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 900, color: "#d4af37", marginBottom: 6, textAlign: "center" }}>🔐 Изменить пароль</div>
            <div style={{ color: "#5a5248", fontSize: "0.8rem", textAlign: "center", marginBottom: 16 }}>{employees.find((e) => e.id === showPasswordModal)?.name}</div>
            <input value={newEmpPassword} onChange={(e) => setNewEmpPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword(showPasswordModal)} type="password" placeholder="Новый пароль..." style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, color: "#e8e0d4", fontSize: "0.9rem", fontFamily: "'Nunito', sans-serif", outline: "none", marginBottom: 8 }} />
            <div style={{ color: "#5a5248", fontSize: "0.7rem", marginBottom: 14 }}>Оставьте пустым, чтобы убрать пароль</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowPasswordModal(null); setNewEmpPassword(""); }} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8a7e6d", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => changePassword(showPasswordModal)} style={{ flex: 1, padding: 14, background: "linear-gradient(135deg, #d4af37, #b8942d)", border: "none", borderRadius: 12, color: "#0d0d0d", cursor: "pointer", fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift modal */}
      {showShiftModal && (
        <div onClick={() => setShowShiftModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 900, color: "#d4af37", marginBottom: 6, textAlign: "center" }}>🕐 Добавить смену</div>
            <div style={{ color: "#5a5248", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>{employees.find((e) => e.id === showShiftModal)?.name}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#8a7e6d", fontSize: "0.75rem", marginBottom: 6 }}>Дата смены</div>
              <input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, color: "#e8e0d4", fontSize: "0.9rem", fontFamily: "'Nunito', sans-serif", outline: "none", colorScheme: "dark" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: "#8a7e6d", fontSize: "0.75rem", marginBottom: 6 }}>Количество часов</div>
              <input type="number" step="0.5" min="0.5" max="24" value={shiftHours} onChange={(e) => setShiftHours(e.target.value)} placeholder="Например: 8" style={{ width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, color: "#e8e0d4", fontSize: "1.1rem", fontFamily: "'Nunito', sans-serif", outline: "none" }} />
            </div>
            {shiftHours > 0 && (
              <div style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#8a7e6d", fontSize: "0.8rem" }}>Тариф:</span>
                  <span style={{ color: "#d4af37", fontWeight: 700, fontSize: "0.85rem" }}>{getShiftBonusRate(parseFloat(shiftHours)).label} — {getShiftBonusRate(parseFloat(shiftHours)).rate}₽/час</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#8a7e6d", fontSize: "0.8rem" }}>Бонус за смену:</span>
                  <span style={{ color: "#d4af37", fontWeight: 800, fontSize: "1.1rem" }}>+{formatMoney(calcShiftBonus(parseFloat(shiftHours)))}</span>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  {SHIFT_BONUS_RATES.map((r, i) => (
                    <div key={i} style={{ flex: 1, background: parseFloat(shiftHours) >= r.minHours && (i === SHIFT_BONUS_RATES.length - 1 || parseFloat(shiftHours) < SHIFT_BONUS_RATES[i + 1].minHours) ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.6rem", color: "#6a6058" }}>{r.minHours}+ ч</div>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#e8e0d4" }}>{r.rate}₽</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowShiftModal(null)} style={{ flex: 1, padding: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#8a7e6d", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Отмена</button>
              <button onClick={() => addShift(showShiftModal)} style={{ flex: 1, padding: 14, background: shiftHours > 0 ? "linear-gradient(135deg, #d4af37, #b8942d)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, color: shiftHours > 0 ? "#0d0d0d" : "#5a5248", cursor: shiftHours > 0 ? "pointer" : "default", fontWeight: 800, fontFamily: "'Nunito', sans-serif" }}>Добавить</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div onClick={() => setConfirmDelete(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 900, color: "#ff5050", marginBottom: 8, textAlign: "center" }}>⚠️ Удалить сотрудника?</div>
            <div style={{ color: "#8a7e6d", fontSize: "0.85rem", textAlign: "center", marginBottom: 20 }}>Все данные будут потеряны навсегда</div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button onClick={() => deleteEmployee(confirmDelete)} style={{ padding: 14, border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'Nunito', sans-serif", background: "linear-gradient(135deg, #ff5050, #cc3333)", color: "#fff", fontSize: "0.9rem" }}>Удалить навсегда</button>
              <button onClick={() => resetEmployee(confirmDelete)} style={{ padding: 14, border: "1px solid rgba(255,165,0,0.3)", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito', sans-serif", background: "rgba(255,165,0,0.1)", color: "#ffa500", fontSize: "0.85rem" }}>Только сбросить продажи</button>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", background: "rgba(255,255,255,0.05)", color: "#8a7e6d", fontSize: "0.85rem" }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={onExit} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 12px", color: "#8a7e6d", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'Nunito', sans-serif" }}>← Выйти</button>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", fontWeight: 900, color: "#d4af37" }}>👑 Руководитель</div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[{ k: "dashboard", l: "📊 Обзор" }, { k: "employees", l: "👥 Сотрудники" }, { k: "history", l: "📋 История" }].map((t) => (
          <button key={t.k} onClick={() => { setAdminView(t.k); setSelectedEmpId(null); }} style={{ flex: 1, padding: "10px 6px", borderRadius: 12, cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, fontFamily: "'Nunito', sans-serif", background: adminView === t.k ? "linear-gradient(135deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))" : "rgba(255,255,255,0.03)", border: adminView === t.k ? "1px solid rgba(212,175,55,0.3)" : "1px solid rgba(255,255,255,0.06)", color: adminView === t.k ? "#d4af37" : "#6a6058" }}>{t.l}</button>
        ))}
      </div>

      {/* Period filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {Object.entries(periodLabels).map(([k, v]) => (
          <button key={k} onClick={() => setFilterPeriod(k)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, cursor: "pointer", fontSize: "0.7rem", fontWeight: 700, fontFamily: "'Nunito', sans-serif", background: filterPeriod === k ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.02)", border: filterPeriod === k ? "1px solid rgba(212,175,55,0.3)" : "1px solid rgba(255,255,255,0.04)", color: filterPeriod === k ? "#d4af37" : "#5a5248" }}>{v}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {adminView === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[{ l: "Выручка", v: formatMoney(totals.revenue), i: "💰", c: "#e8e0d4" }, { l: "Бонусы", v: formatMoney(totals.bonus), i: "🎁", c: "#d4af37" }, { l: "Продажи", v: totals.sales + " шт.", i: "🧾", c: "#6fa8dc" }, { l: "Отзывы", v: totals.reviews + " шт.", i: "⭐", c: "#e07a3a" }, { l: "Часы", v: formatHours(totals.hours), i: "🕐", c: "#64c896" }, { l: "Бонус смен", v: formatMoney(totals.shiftBonus), i: "⏰", c: "#64c896" }].map((x, i) => (
              <div key={i} style={{ ...cardStyle, borderRadius: 18, padding: "16px 14px" }}>
                <div style={{ fontSize: "1.3rem", marginBottom: 4 }}>{x.i}</div>
                <div style={{ fontSize: "0.7rem", color: "#6a6058", textTransform: "uppercase", letterSpacing: 1 }}>{x.l}</div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 900, color: x.c, marginTop: 2 }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Рейтинг · {periodLabels[filterPeriod]}</div>
          {enriched.map((emp, i) => { const r = getRank(emp.totalBonus); const medals = ["🥇", "🥈", "🥉"]; return (
            <div key={emp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 8, ...cardStyle }}>
              <div style={{ fontSize: i < 3 ? "1.4rem" : "0.9rem", width: 32, textAlign: "center", fontWeight: 800, color: i >= 3 ? "#5a5248" : undefined }}>{i < 3 ? medals[i] : `${i + 1}`}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{emp.name}</div><div style={{ fontSize: "0.7rem", color: r.color }}>{r.icon} {r.title} · {emp.fSaleCount} продаж · {emp.fReviewCount} отзывов · {formatHours(emp.fShiftHours)}</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontWeight: 800, color: "#d4af37", fontSize: "0.95rem" }}>{formatMoney(emp.fBonus)}</div><div style={{ fontSize: "0.65rem", color: "#5a5248" }}>{formatMoney(emp.fRevenue)}</div></div>
            </div>
          ); })}
          {enriched.length === 0 && <div style={{ textAlign: "center", color: "#5a5248", padding: 40 }}>Нет сотрудников</div>}
        </div>
      )}

      {/* EMPLOYEES LIST */}
      {adminView === "employees" && !selectedEmpId && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Управление ({employees.length})</div>
          {enriched.map((emp) => { const r = getRank(emp.totalBonus); return (
            <div key={emp.id} style={{ ...cardStyle, borderRadius: 18, padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ fontSize: "1.4rem" }}>{r.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{emp.name}</div><div style={{ fontSize: "0.75rem", color: r.color }}>{r.title} · {formatMoney(emp.totalBonus)}</div></div>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: "0.7rem", color: "#6a6058", marginBottom: 12 }}>
                <span>📊 {emp.sales.length} продаж</span><span>·</span><span>⭐ {(emp.reviews || []).length} отзывов</span><span>·</span><span>🕐 {formatHours(emp.totalShiftHours)}</span><span>·</span><span>💰 {formatMoney(emp.totalRevenue)}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setSelectedEmpId(emp.id)} style={{ flex: 1, ...smallBtn("rgba(212,175,55,0.1)", "rgba(212,175,55,0.2)", "#d4af37"), fontWeight: 700 }}>📋 Подробнее</button>
                <button onClick={() => { setEditName(emp.name); setShowEditModal(emp.id); }} style={smallBtn("rgba(100,150,255,0.1)", "rgba(100,150,255,0.2)", "#6fa8dc")}>✏️</button>
                <button onClick={() => setShowPasswordModal(emp.id)} style={smallBtn("rgba(180,130,255,0.1)", "rgba(180,130,255,0.2)", "#b482ff")}>🔐</button>
                <button onClick={() => setShowShiftModal(emp.id)} style={smallBtn("rgba(100,200,150,0.1)", "rgba(100,200,150,0.2)", "#64c896")}>🕐</button>
                <button onClick={() => setConfirmDelete(emp.id)} style={smallBtn("rgba(255,80,80,0.1)", "rgba(255,80,80,0.2)", "#ff5050")}>🗑️</button>
              </div>
            </div>
          ); })}
        </div>
      )}

      {/* EMPLOYEE DETAIL */}
      {adminView === "employees" && sel && (
        <div>
          <button onClick={() => setSelectedEmpId(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 14px", color: "#8a7e6d", cursor: "pointer", fontSize: "0.8rem", fontFamily: "'Nunito', sans-serif", marginBottom: 16 }}>← Назад</button>
          <div style={{ background: "rgba(212,175,55,0.05)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 24, padding: 24, marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 6 }}>{getRank(sel.totalBonus).icon}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 900 }}>{sel.name}</div>
            <div style={{ fontSize: "0.8rem", color: getRank(sel.totalBonus).color, marginBottom: 12 }}>{getRank(sel.totalBonus).title}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[{ l: "Бонусы", v: formatMoney(sel.fBonus), c: "#d4af37" }, { l: "Выручка", v: formatMoney(sel.fRevenue) }, { l: "Продаж", v: "" + sel.fSaleCount }].map((x, i) => (
                <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: "0.65rem", color: "#6a6058" }}>{x.l}</div><div style={{ fontWeight: 800, color: x.c || "#e8e0d4" }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: "0.75rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Продажи ({sel.fSaleCount})</div>
          {[...sel.fs].reverse().slice(0, 50).map((s) => (
            <div key={s.saleId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {s.name}
                  {s.receiptPhoto && <span onClick={() => setViewingPhoto(s.receiptPhoto)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📎</span>}
                  {!s.receiptPhoto && <span style={{ fontSize: "0.6rem", color: "#ff8c42", opacity: 0.7 }}>без чека</span>}
                </div>
                <div style={{ fontSize: "0.65rem", color: "#5a5248" }}>{new Date(s.timestamp).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {formatMoney(s.price)} · +{s.bonus}₽</div>
              </div>
              <button onClick={() => deleteSale(sel.id, s.saleId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'Nunito', sans-serif" }}>✕</button>
            </div>
          ))}

          <div style={{ fontSize: "0.75rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, marginTop: 20 }}>Отзывы ({sel.fReviewCount})</div>
          {[...sel.fr].reverse().slice(0, 50).map((r) => (
            <div key={r.reviewId} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: r.photo ? 10 : 0 }}>
                <div><div style={{ fontWeight: 700, fontSize: "0.85rem" }}>⭐ {r.guestName}</div><div style={{ fontSize: "0.65rem", color: "#5a5248" }}>{new Date(r.timestamp).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · +{REVIEW_BONUS}₽</div></div>
                <button onClick={() => deleteReview(sel.id, r.reviewId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'Nunito', sans-serif" }}>✕</button>
              </div>
              {r.photo && <img src={r.photo} alt="" onClick={() => setViewingPhoto(r.photo)} style={{ width: "100%", borderRadius: 10, cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)" }} />}
            </div>
          ))}

          {/* Shifts section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 }}>
            <div style={{ fontSize: "0.75rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2 }}>Смены ({sel.fShiftCount}) · {formatHours(sel.fShiftHours)}</div>
            <button onClick={() => setShowShiftModal(sel.id)} style={{ background: "rgba(100,200,150,0.1)", border: "1px solid rgba(100,200,150,0.2)", borderRadius: 10, padding: "6px 12px", color: "#64c896", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>+ Смена</button>
          </div>
          <div style={{ background: "rgba(100,200,150,0.05)", border: "1px solid rgba(100,200,150,0.1)", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#8a7e6d", fontSize: "0.8rem" }}>Часов за период:</span>
              <span style={{ fontWeight: 800, color: "#64c896" }}>{formatHours(sel.fShiftHours)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#8a7e6d", fontSize: "0.8rem" }}>Бонус за смены:</span>
              <span style={{ fontWeight: 800, color: "#d4af37" }}>{formatMoney(sel.fShiftBonus)}</span>
            </div>
          </div>
          {[...sel.fsh].reverse().slice(0, 50).map((sh) => (
            <div key={sh.shiftId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
              <div style={{ fontSize: "1rem" }}>🕐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{formatHours(sh.hours)} · {sh.rate?.label || "Стандарт"}</div>
                <div style={{ fontSize: "0.65rem", color: "#5a5248" }}>{new Date(sh.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })} · +{formatMoney(sh.bonus)}</div>
              </div>
              <button onClick={() => deleteShift(sel.id, sh.shiftId)} style={{ background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 8, padding: "4px 8px", color: "#ff5050", cursor: "pointer", fontSize: "0.7rem", fontFamily: "'Nunito', sans-serif" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* GLOBAL HISTORY */}
      {adminView === "history" && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "#8a7e6d", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>Все операции · {periodLabels[filterPeriod]}</div>
          {(() => {
            const ops = [];
            enriched.forEach((emp) => {
              emp.fs.forEach((s) => ops.push({ t: "sale", emp: emp.name, ...s, ts: s.timestamp }));
              emp.fr.forEach((r) => ops.push({ t: "review", emp: emp.name, ...r, ts: r.timestamp }));
            });
            ops.sort((a, b) => new Date(b.ts) - new Date(a.ts));
            if (!ops.length) return <div style={{ textAlign: "center", color: "#5a5248", padding: 40 }}>Нет операций за этот период</div>;
            return ops.slice(0, 100).map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
                <div style={{ fontSize: "1.1rem" }}>{o.t === "sale" ? "🧾" : "⭐"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {o.t === "sale" ? o.name : `Отзыв: ${o.guestName}`}
                    {o.t === "sale" && o.receiptPhoto && <span onClick={() => setViewingPhoto(o.receiptPhoto)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📎</span>}
                    {o.t === "review" && o.photo && <span onClick={() => setViewingPhoto(o.photo)} style={{ cursor: "pointer", fontSize: "0.7rem" }}>📷</span>}
                  </div>
                  <div style={{ fontSize: "0.65rem", color: "#5a5248" }}>{o.emp} · {new Date(o.ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · +{o.t === "sale" ? o.bonus : REVIEW_BONUS}₽</div>
                </div>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}

export default function HookahSalesApp() {
  const [employees, setEmployees] = useState(() => {
    const saved = loadData();
    return saved?.employees || [];
  });
  const [currentEmployee, setCurrentEmployee] = useState(() => {
    const saved = loadData();
    return saved?.currentEmployee || null;
  });
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPinError, setAdminPinError] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loginEmpId, setLoginEmpId] = useState(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(false);

  useEffect(() => {
    saveData({ employees, currentEmployee });
  }, [employees, currentEmployee]);

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
      password: newPassword.trim(),
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
    const sale = {
      ...item,
      timestamp: new Date().toISOString(),
      saleId: Date.now().toString(),
      receiptPhoto: photo || null,
    };

    const prevBonus = totalBonus;
    const newBonus = prevBonus + item.bonus;
    const prevRank = getRank(prevBonus);
    const newRank = getRank(newBonus);

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === currentEmployee ? { ...e, sales: [...e.sales, sale] } : e
      )
    );

    setLastSale(item);
    setTimeout(() => setLastSale(null), 2000);

    if (newRank.title !== prevRank.title) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  const openReceiptModal = (item) => {
    setPendingSaleItem(item);
    setReceiptPhoto(null);
  };

  const confirmSale = () => {
    if (!pendingSaleItem) return;
    addSale(pendingSaleItem, receiptPhoto);
    setPendingSaleItem(null);
    setReceiptPhoto(null);
  };

  const cancelSale = () => {
    setPendingSaleItem(null);
    setReceiptPhoto(null);
  };

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPhoto(ev.target.result);
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

  const tryAdminLogin = () => {
    if (adminPin === ADMIN_PIN) {
      setIsAdmin(true); setShowAdminLogin(false); setAdminPin(""); setAdminPinError(false);
    } else {
      setAdminPinError(true);
    }
  };

  const tryEmployeeLogin = () => {
    const emp = employees.find((e) => e.id === loginEmpId);
    if (!emp) return;
    // If employee has no password (old accounts), let them in
    if (!emp.password || loginPassword === emp.password) {
      setCurrentEmployee(emp.id);
      setLoginEmpId(null);
      setLoginPassword("");
      setLoginError(false);
      setView("main");
    } else {
      setLoginError(true);
    }
  };

  /* ═══ ADMIN MODE ═══ */
  if (isAdmin) {
    return <AdminPanel employees={employees} setEmployees={setEmployees} onExit={() => setIsAdmin(false)} />;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* Glassmorphism utility */
        .glass { backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); }

        /* Micro-interaction: button press */
        button { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; }
        button:active { transform: scale(0.96) !important; }

        /* Smooth scrolling */
        html { scroll-behavior: smooth; }

        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(212,175,55,0.2); border-radius: 4px; }

        /* Input focus glow */
        input:focus { border-color: rgba(212,175,55,0.4) !important; box-shadow: 0 0 20px rgba(212,175,55,0.08) !important; }

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
          0%, 100% { box-shadow: 0 0 20px rgba(212,175,55,0.05); }
          50% { box-shadow: 0 0 40px rgba(212,175,55,0.12); }
        }

        @keyframes borderShine {
          0% { border-color: rgba(212,175,55,0.1); }
          50% { border-color: rgba(212,175,55,0.3); }
          100% { border-color: rgba(212,175,55,0.1); }
        }
      `}</style>

      <Confetti active={showConfetti} />

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
              border: "1px solid rgba(212,175,55,0.3)",
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
            fontFamily: "'Playfair Display', serif",
            fontWeight: 900,
            color: "#d4af37",
            textShadow: "0 0 30px rgba(212,175,55,0.6)",
            pointerEvents: "none",
          }}
        >
          +{lastSale.bonus} ₽
        </div>
      )}

      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0f",
          fontFamily: "'Nunito', sans-serif",
          color: "#e8e0d4",
          position: "relative",
          overflow: "hidden",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        {/* Ambient glow orbs */}
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "radial-gradient(600px circle at 20% 15%, rgba(212,175,55,0.04) 0%, transparent 60%), radial-gradient(500px circle at 80% 70%, rgba(120,80,200,0.03) 0%, transparent 60%), radial-gradient(400px circle at 50% 50%, rgba(100,200,150,0.02) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />

        {/* LOGIN / SELECT EMPLOYEE */}
        {!currentEmployee ? (
          <div style={{ padding: "40px 24px", animation: "slideUp 0.5s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div style={{ fontSize: "3.5rem", marginBottom: 12 }}>🌬️</div>
              <h1
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: "2rem",
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #d4af37, #f0d68a, #d4af37)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer 3s linear infinite",
                  marginBottom: 8,
                }}
              >
                НАРГИЛИЯ ПРОДАЖИ
              </h1>
              <p style={{ color: "#8a7e6d", fontSize: "0.9rem", letterSpacing: 2 }}>
                СИСТЕМА МОТИВАЦИИ
              </p>
            </div>

            {/* Admin Login Button */}
            <button
              onClick={() => setShowAdminLogin(true)}
              style={{
                width: "100%", padding: "14px", marginBottom: 24,
                background: "linear-gradient(135deg, rgba(139,90,43,0.12), rgba(20,16,12,0.9))",
                border: "1px solid rgba(139,90,43,0.25)", borderRadius: 16, color: "#c9a84c",
                cursor: "pointer", fontSize: "0.9rem", fontWeight: 700, fontFamily: "'Nunito', sans-serif",
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
                <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, animation: "slideUp 0.3s ease" }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 900, color: "#d4af37", marginBottom: 6, textAlign: "center" }}>👑 Вход для руководителя</div>
                  <div style={{ color: "#5a5248", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>Введите PIN-код</div>
                  <input
                    value={adminPin}
                    onChange={(e) => { setAdminPin(e.target.value); setAdminPinError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && tryAdminLogin()}
                    type="password" placeholder="PIN-код..." maxLength={10}
                    style={{
                      width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.04)",
                      border: adminPinError ? "1px solid rgba(255,80,80,0.5)" : "1px solid rgba(212,175,55,0.15)",
                      borderRadius: 12, color: "#e8e0d4", fontSize: "1.5rem", fontFamily: "'Nunito', sans-serif",
                      outline: "none", marginBottom: 8, textAlign: "center", letterSpacing: 8,
                    }}
                  />
                  {adminPinError && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>Неверный PIN-код</div>}
                  <button onClick={tryAdminLogin} style={{ width: "100%", padding: "14px", marginTop: 6, background: adminPin ? "linear-gradient(135deg, #d4af37, #b8942d)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 12, color: adminPin ? "#0d0d0d" : "#5a5248", fontWeight: 800, cursor: adminPin ? "pointer" : "default", fontFamily: "'Nunito', sans-serif", fontSize: "0.9rem" }}>Войти</button>
                  <div style={{ color: "#3a3530", fontSize: "0.7rem", textAlign: "center", marginTop: 12 }}>PIN по умолчанию: 1234</div>
                </div>
              </div>
            )}

            {/* Employee Password Login Modal */}
            {loginEmpId && (
              <div
                onClick={() => { setLoginEmpId(null); setLoginPassword(""); setLoginError(false); }}
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
              >
                <div onClick={(e) => e.stopPropagation()} style={{ background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, animation: "slideUp 0.3s ease" }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 900, color: "#d4af37", marginBottom: 6, textAlign: "center" }}>
                    🔐 {employees.find((e) => e.id === loginEmpId)?.name}
                  </div>
                  <div style={{ color: "#5a5248", fontSize: "0.8rem", textAlign: "center", marginBottom: 20 }}>Введите пароль</div>
                  <input
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && tryEmployeeLogin()}
                    type="password" placeholder="Пароль..." autoFocus
                    style={{
                      width: "100%", padding: "14px 18px", background: "rgba(255,255,255,0.04)",
                      border: loginError ? "1px solid rgba(255,80,80,0.5)" : "1px solid rgba(212,175,55,0.15)",
                      borderRadius: 12, color: "#e8e0d4", fontSize: "1.1rem", fontFamily: "'Nunito', sans-serif",
                      outline: "none", marginBottom: 8, textAlign: "center", letterSpacing: 4,
                    }}
                  />
                  {loginError && <div style={{ color: "#ff5050", fontSize: "0.8rem", textAlign: "center", marginBottom: 8 }}>Неверный пароль</div>}
                  <button
                    onClick={tryEmployeeLogin}
                    style={{
                      width: "100%", padding: "14px", marginTop: 6,
                      background: loginPassword ? "linear-gradient(135deg, #d4af37, #b8942d)" : "rgba(255,255,255,0.05)",
                      border: "none", borderRadius: 12, color: loginPassword ? "#0d0d0d" : "#5a5248",
                      fontWeight: 800, cursor: loginPassword ? "pointer" : "default",
                      fontFamily: "'Nunito', sans-serif", fontSize: "0.9rem",
                    }}
                  >Войти</button>
                </div>
              </div>
            )}

            {employees.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <p style={{ color: "#8a7e6d", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>
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
                        background: "rgba(212,175,55,0.05)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        border: "1px solid rgba(212,175,55,0.1)",
                        borderRadius: 18,
                        color: "#e8e0d4",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s",
                        fontFamily: "'Nunito', sans-serif",
                      }}
                      onMouseEnter={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.4)"; e.target.style.transform = "translateX(4px)"; }}
                      onMouseLeave={(e) => { e.target.style.borderColor = "rgba(212,175,55,0.15)"; e.target.style.transform = "translateX(0)"; }}
                    >
                      <span style={{ fontSize: "1.6rem" }}>{empRank.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{emp.name}</div>
                        <div style={{ fontSize: "0.8rem", color: empRank.color }}>{empRank.title} · {formatMoney(empBonus)}</div>
                      </div>
                      {emp.password && <span style={{ fontSize: "0.9rem", opacity: 0.4 }}>🔐</span>}
                      <span style={{ color: "#5a5248", fontSize: "1.2rem" }}>→</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div
              style={{
                background: "rgba(20,16,12,0.6)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(212,175,55,0.1)",
                borderRadius: 24,
                padding: 24,
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
            >
              <p style={{ color: "#8a7e6d", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>
                Новый сотрудник
              </p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Введите имя..."
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(212,175,55,0.15)",
                  borderRadius: 12,
                  color: "#e8e0d4",
                  fontSize: "1rem",
                  fontFamily: "'Nunito', sans-serif",
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
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(212,175,55,0.15)",
                  borderRadius: 12,
                  color: "#e8e0d4",
                  fontSize: "1rem",
                  fontFamily: "'Nunito', sans-serif",
                  outline: "none",
                  marginBottom: 14,
                }}
              />
              <button
                onClick={addEmployee}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: newName.trim() && newPassword.trim() ? "linear-gradient(135deg, #d4af37, #b8942d)" : "rgba(255,255,255,0.05)",
                  border: "none",
                  borderRadius: 12,
                  color: newName.trim() && newPassword.trim() ? "#0d0d0d" : "#5a5248",
                  fontSize: "1rem",
                  fontWeight: 800,
                  cursor: newName.trim() && newPassword.trim() ? "pointer" : "default",
                  fontFamily: "'Nunito', sans-serif",
                  transition: "all 0.2s",
                  letterSpacing: 1,
                }}
              >
                НАЧАТЬ
              </button>
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
              }}
            >
              <button
                onClick={() => setCurrentEmployee(null)}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "8px 14px",
                  color: "#8a7e6d",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontFamily: "'Nunito', sans-serif",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              >
                ← Выйти
              </button>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800, fontSize: "1rem" }}>{employee?.name}</div>
                <div style={{ fontSize: "0.75rem", color: rank.color }}>
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
                      ? "rgba(212,175,55,0.12)"
                      : "rgba(255,255,255,0.03)",
                    backdropFilter: view === tab.key ? "blur(12px)" : "none",
                    WebkitBackdropFilter: view === tab.key ? "blur(12px)" : "none",
                    border: view === tab.key
                      ? "1px solid rgba(212,175,55,0.25)"
                      : "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    color: view === tab.key ? "#d4af37" : "#6a6058",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: view === tab.key ? 800 : 700,
                    fontFamily: "'Nunito', sans-serif",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    boxShadow: view === tab.key ? "0 4px 16px rgba(212,175,55,0.1)" : "none",
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
                    background: "rgba(212,175,55,0.06)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                    border: "1px solid rgba(212,175,55,0.15)",
                    borderRadius: 28,
                    padding: 28,
                    marginBottom: 24,
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                    animation: "glowPulse 4s ease-in-out infinite",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -30,
                      right: -20,
                      fontSize: "6rem",
                      opacity: 0.06,
                      animation: "gentleFloat 4s ease-in-out infinite",
                    }}
                  >
                    {rank.icon}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <div style={{ color: "#8a7e6d", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
                        Бонусы за сегодня
                      </div>
                      <div
                        style={{
                          fontFamily: "'Playfair Display', serif",
                          fontSize: "2.2rem",
                          fontWeight: 900,
                          color: "#d4af37",
                        }}
                      >
                        {formatMoney(todayBonus)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#8a7e6d", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>
                        Продажи
                      </div>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.4rem", fontWeight: 700, color: "#e8e0d4" }}>
                        {formatMoney(todayRevenue)}
                      </div>
                    </div>
                  </div>

                  {/* Progress to next rank */}
                  {nextRank && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: "0.75rem", color: "#8a7e6d" }}>
                          {rank.icon} {rank.title}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: nextRank.color }}>
                          {nextRank.icon} {nextRank.title}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(progress, 100)}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${rank.color}, ${nextRank.color})`,
                            borderRadius: 3,
                            transition: "width 0.8s ease",
                          }}
                        />
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#5a5248", marginTop: 4, textAlign: "center" }}>
                        Ещё {formatMoney(nextRank.min - totalBonus)} до следующего ранга
                      </div>
                    </div>
                  )}
                  {!nextRank && (
                    <div style={{ textAlign: "center", fontSize: "0.85rem", color: "#d4af37" }}>
                      👑 Максимальный ранг достигнут!
                    </div>
                  )}
                </div>

                {/* Quick stats pills */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <div
                      key={key}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "10px 6px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 14,
                      }}
                    >
                      <div style={{ fontSize: "1.2rem" }}>{cat.emoji}</div>
                      <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#e8e0d4" }}>
                        {getCategorySalesToday(key)}
                      </div>
                      <div style={{ fontSize: "0.65rem", color: "#6a6058" }}>сегодня</div>
                    </div>
                  ))}
                  <div
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "10px 6px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 14,
                    }}
                  >
                    <div style={{ fontSize: "1.2rem" }}>⭐</div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#e8e0d4" }}>
                      {todayReviews.length}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#6a6058" }}>отзывы</div>
                  </div>
                </div>

                {/* Category Selector */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      style={{
                        flex: 1,
                        padding: "12px 8px",
                        background: selectedCategory === key
                          ? "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))"
                          : "rgba(255,255,255,0.02)",
                        border: selectedCategory === key
                          ? "1px solid rgba(212,175,55,0.3)"
                          : "1px solid rgba(255,255,255,0.05)",
                        borderRadius: 14,
                        color: selectedCategory === key ? "#d4af37" : "#6a6058",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        fontFamily: "'Nunito', sans-serif",
                        transition: "all 0.2s",
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
                          background: "rgba(255,255,255,0.03)",
                          backdropFilter: "blur(8px)",
                          WebkitBackdropFilter: "blur(8px)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 18,
                          color: "#e8e0d4",
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "'Nunito', sans-serif",
                          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                          position: "relative",
                          overflow: "hidden",
                          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.2)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)"; }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 2 }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#6a6058" }}>
                            {formatMoney(item.price)}
                          </div>
                        </div>
                        <div
                          style={{
                            background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
                            border: "1px solid rgba(212,175,55,0.2)",
                            borderRadius: 10,
                            padding: "6px 12px",
                            textAlign: "center",
                          }}
                        >
                          <div style={{ fontSize: "0.7rem", color: "#8a7e6d" }}>бонус</div>
                          <div style={{ fontWeight: 800, color: "#d4af37", fontSize: "0.9rem" }}>
                            +{item.bonus}₽
                          </div>
                        </div>
                        {count > 0 && (
                          <div
                            style={{
                              minWidth: 28,
                              height: 28,
                              background: "rgba(212,175,55,0.2)",
                              border: "1px solid rgba(212,175,55,0.3)",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: "0.85rem",
                              color: "#d4af37",
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
                        background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                        border: "1px solid rgba(212,175,55,0.2)",
                        borderRadius: 24,
                        padding: 28,
                        width: "100%",
                        maxWidth: 400,
                        animation: "slideUp 0.3s ease",
                      }}
                    >
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 900, color: "#d4af37", marginBottom: 6, textAlign: "center" }}>
                        🧾 Подтверждение продажи
                      </div>

                      <div style={{ textAlign: "center", marginBottom: 20 }}>
                        <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#e8e0d4" }}>
                          {pendingSaleItem.name}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#8a7e6d", marginTop: 2 }}>
                          {formatMoney(pendingSaleItem.price)} · бонус +{pendingSaleItem.bonus}₽
                        </div>
                      </div>

                      {/* Receipt Photo Upload */}
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          minHeight: receiptPhoto ? "auto" : 140,
                          background: receiptPhoto ? "transparent" : "rgba(255,255,255,0.03)",
                          border: receiptPhoto ? "none" : "2px dashed rgba(212,175,55,0.2)",
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
                              border: "1px solid rgba(212,175,55,0.2)",
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: "2.2rem", marginBottom: 6, opacity: 0.5 }}>📷</div>
                            <div style={{ color: "#8a7e6d", fontSize: "0.85rem", fontWeight: 600 }}>
                              Загрузить фото чека
                            </div>
                            <div style={{ color: "#5a5248", fontSize: "0.7rem", marginTop: 4 }}>
                              Нажмите для загрузки
                            </div>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptUpload}
                          style={{ display: "none" }}
                        />
                      </label>

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
                            fontFamily: "'Nunito', sans-serif",
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
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 12,
                            color: "#8a7e6d",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            fontFamily: "'Nunito', sans-serif",
                          }}
                        >
                          Отмена
                        </button>
                        <button
                          onClick={confirmSale}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: "linear-gradient(135deg, #d4af37, #b8942d)",
                            border: "none",
                            borderRadius: 12,
                            color: "#0d0d0d",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 800,
                            fontFamily: "'Nunito', sans-serif",
                            letterSpacing: 0.5,
                          }}
                        >
                          {receiptPhoto ? "✓ Подтвердить" : "Без чека"}
                        </button>
                      </div>

                      {!receiptPhoto && (
                        <div style={{ textAlign: "center", fontSize: "0.7rem", color: "#5a5248", marginTop: 10 }}>
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
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 14,
                        color: "#8a7e6d",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        fontFamily: "'Nunito', sans-serif",
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
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.04)",
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
                                    <span style={{ fontSize: "0.6rem", color: "#ff8c42", opacity: 0.7 }}>без чека</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "#5a5248" }}>
                                  {new Date(sale.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                  {" · "}+{sale.bonus}₽ бонус
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {sale.receiptPhoto && (
                                  <button
                                    onClick={() => setViewingPhoto(sale.receiptPhoto)}
                                    style={{
                                      background: "rgba(212,175,55,0.1)",
                                      border: "1px solid rgba(212,175,55,0.2)",
                                      borderRadius: 8,
                                      padding: "4px 8px",
                                      color: "#d4af37",
                                      cursor: "pointer",
                                      fontSize: "0.7rem",
                                      fontFamily: "'Nunito', sans-serif",
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
                                    fontFamily: "'Nunito', sans-serif",
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
                    background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))",
                    border: "2px dashed rgba(212,175,55,0.3)",
                    borderRadius: 20,
                    color: "#d4af37",
                    cursor: "pointer",
                    fontSize: "1rem",
                    fontWeight: 800,
                    fontFamily: "'Nunito', sans-serif",
                    marginBottom: 24,
                    transition: "all 0.2s",
                  }}
                >
                  📸 Добавить отзыв с Яндекса
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#8a7e6d", marginTop: 4 }}>
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
                        background: "rgba(20,16,12,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
                        border: "1px solid rgba(212,175,55,0.2)",
                        borderRadius: 24,
                        padding: 28,
                        width: "100%",
                        maxWidth: 400,
                        animation: "slideUp 0.3s ease",
                      }}
                    >
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", fontWeight: 900, color: "#d4af37", marginBottom: 20, textAlign: "center" }}>
                        📸 Новый отзыв
                      </div>

                      <input
                        value={reviewGuestName}
                        onChange={(e) => setReviewGuestName(e.target.value)}
                        placeholder="Имя гостя (необязательно)"
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(212,175,55,0.15)",
                          borderRadius: 12,
                          color: "#e8e0d4",
                          fontSize: "0.9rem",
                          fontFamily: "'Nunito', sans-serif",
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
                          background: reviewPhoto ? "transparent" : "rgba(255,255,255,0.03)",
                          border: reviewPhoto ? "none" : "2px dashed rgba(212,175,55,0.2)",
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
                              border: "1px solid rgba(212,175,55,0.2)",
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.5 }}>📷</div>
                            <div style={{ color: "#8a7e6d", fontSize: "0.85rem", fontWeight: 600 }}>
                              Загрузить скриншот отзыва
                            </div>
                            <div style={{ color: "#5a5248", fontSize: "0.75rem", marginTop: 4 }}>
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
                            fontFamily: "'Nunito', sans-serif",
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
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 12,
                            color: "#8a7e6d",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 700,
                            fontFamily: "'Nunito', sans-serif",
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
                              ? "linear-gradient(135deg, #d4af37, #b8942d)"
                              : "rgba(255,255,255,0.05)",
                            border: "none",
                            borderRadius: 12,
                            color: reviewPhoto ? "#0d0d0d" : "#5a5248",
                            cursor: reviewPhoto ? "pointer" : "default",
                            fontSize: "0.9rem",
                            fontWeight: 800,
                            fontFamily: "'Nunito', sans-serif",
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
                <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#8a7e6d", marginBottom: 14, textTransform: "uppercase", letterSpacing: 2 }}>
                  Все отзывы ({(employee?.reviews || []).length})
                </div>

                {(employee?.reviews || []).length === 0 && (
                  <div style={{ textAlign: "center", color: "#5a5248", padding: 40, fontSize: "0.9rem" }}>
                    Пока нет отзывов. Добавьте первый!
                  </div>
                )}

                {[...(employee?.reviews || [])].reverse().map((review) => (
                  <div
                    key={review.reviewId}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
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
                        <div style={{ fontSize: "0.75rem", color: "#5a5248" }}>
                          {new Date(review.timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          {new Date(review.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          background: "rgba(212,175,55,0.12)",
                          border: "1px solid rgba(212,175,55,0.2)",
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontWeight: 800,
                          color: "#d4af37",
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
                            fontFamily: "'Nunito', sans-serif",
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
                          border: "1px solid rgba(255,255,255,0.06)",
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
                    background: "rgba(212,175,55,0.05)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
                    border: "1px solid rgba(212,175,55,0.15)",
                    borderRadius: 24,
                    padding: 24,
                    marginBottom: 20,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "3rem", marginBottom: 8 }}>{rank.icon}</div>
                  <div
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "1.5rem",
                      fontWeight: 900,
                      color: rank.color,
                      marginBottom: 4,
                    }}
                  >
                    {rank.title}
                  </div>
                  <div style={{ color: "#8a7e6d", fontSize: "0.85rem" }}>
                    Всего заработано бонусов
                  </div>
                  <div
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "2.5rem",
                      fontWeight: 900,
                      color: "#d4af37",
                      marginTop: 8,
                    }}
                  >
                    {formatMoney(totalBonus)}
                  </div>
                  <div style={{ color: "#6a6058", fontSize: "0.8rem", marginTop: 4 }}>
                    Общая выручка: {formatMoney(totalRevenue)}
                  </div>
                  <div style={{ color: "#6a6058", fontSize: "0.8rem", marginTop: 2 }}>
                    Отзывов собрано: {totalReviews} · Бонус: {formatMoney(totalReviews * REVIEW_BONUS)}
                  </div>
                  <div style={{ color: "#64c896", fontSize: "0.8rem", marginTop: 2 }}>
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
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 18,
                        padding: 20,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: "1.4rem" }}>{cat.emoji}</span>
                        <span style={{ fontWeight: 700, fontSize: "1rem" }}>{cat.name.replace(/[^\w\sа-яА-ЯёЁ]/g, "").trim()}</span>
                        <span style={{ marginLeft: "auto", color: "#d4af37", fontWeight: 800 }}>
                          {catSales.length} шт.
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ flex: 1, background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ fontSize: "0.7rem", color: "#6a6058", marginBottom: 2 }}>Выручка</div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{formatMoney(catRev)}</div>
                        </div>
                        <div style={{ flex: 1, background: "rgba(212,175,55,0.06)", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ fontSize: "0.7rem", color: "#8a7e6d", marginBottom: 2 }}>Бонусы</div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#d4af37" }}>{formatMoney(catBonus)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* All-time top items */}
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 18,
                    padding: 20,
                    marginTop: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 14, color: "#8a7e6d" }}>
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
                            borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ color: "#5a5248", fontWeight: 700, fontSize: "0.8rem", width: 20 }}>
                              {i + 1}.
                            </span>
                            <span style={{ fontSize: "0.9rem" }}>{s?.name}</span>
                          </div>
                          <span style={{ fontWeight: 800, color: "#d4af37" }}>{count}×</span>
                        </div>
                      );
                    });
                  })()}
                  {employee.sales.length === 0 && (
                    <div style={{ textAlign: "center", color: "#5a5248", padding: 20, fontSize: "0.85rem" }}>
                      Пока нет продаж
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LEADERBOARD VIEW */}
            {view === "board" && (
              <div style={{ padding: "0 20px 40px", animation: "slideUp 0.3s ease" }}>
                <div
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: "1.3rem",
                    fontWeight: 900,
                    color: "#d4af37",
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
                          ? "linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.03))"
                          : "rgba(255,255,255,0.03)",
                        border: isMe
                          ? "1px solid rgba(212,175,55,0.25)"
                          : "1px solid rgba(255,255,255,0.05)",
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
                          color: i >= 3 ? "#5a5248" : undefined,
                        }}
                      >
                        {i < 3 ? medals[i] : `${i + 1}`}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {emp.name} {isMe && <span style={{ color: "#d4af37", fontSize: "0.75rem" }}>(вы)</span>}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: empRank.color }}>
                          {empRank.icon} {empRank.title} · {emp.sales.length} продаж
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, color: "#d4af37", fontSize: "1rem" }}>
                          {formatMoney(emp.totalBonus)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#5a5248" }}>
                          {formatMoney(emp.totalRevenue)}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {leaderboard.length === 0 && (
                  <div style={{ textAlign: "center", color: "#5a5248", padding: 40, fontSize: "0.9rem" }}>
                    Пока нет участников
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
