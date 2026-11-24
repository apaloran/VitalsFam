/**
 * VitalsFam — Family Blood Sugar & Blood Pressure Tracker
 * Pure client-side ES6 app with localStorage persistence, Chart.js trends,
 * AHA/ADA reference categorization, CSV/JSON export, and mobile-first UI.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'vitalsfam_tracker_data_v1';
  const MGDL_TO_MMOL = 18.0182;

  const MEMBER_COLORS = [
    { id: 'teal', bg: '#0f766e', light: '#ccfbf1', text: '#115e59', label: 'Teal' },
    { id: 'indigo', bg: '#4f46e5', light: '#e0e7ff', text: '#3730a3', label: 'Indigo' },
    { id: 'rose', bg: '#e11d48', light: '#ffe4e6', text: '#9f1239', label: 'Rose' },
    { id: 'amber', bg: '#d97706', light: '#fef3c7', text: '#92400e', label: 'Amber' },
    { id: 'emerald', bg: '#059669', light: '#d1fae5', text: '#065f46', label: 'Emerald' },
    { id: 'sky', bg: '#0284c7', light: '#e0f2fe', text: '#075985', label: 'Sky' }
  ];

  const SUGAR_CONTEXT_LABELS = {
    fasting: 'Fasting',
    before_meal: 'Before Meal',
    after_meal: 'After Meal (2h)',
    bedtime: 'Bedtime',
    random: 'Random'
  };

  // --- State ---
  let state = {
    members: [],
    readings: [],
    selectedMemberId: 'all',
    activeTab: 'dashboard', // 'dashboard' | 'members' | 'history' | 'guide'
    sugarUnit: 'mg/dL',     // 'mg/dL' | 'mmol/L'
    filters: {
      range: '30d',         // '7d' | '30d' | '90d' | 'all' | 'custom'
      fromDate: '',
      toDate: '',
      type: 'all',          // 'all' | 'bp' | 'sugar'
      search: ''
    },
    editingMemberId: null,
    editingReadingId: null,
    readingFormMode: 'both', // 'both' | 'bp' | 'sugar'
    pendingConfirmAction: null
  };

  let bpChartInstance = null;
  let sugarChartInstance = null;

  // --- Safe Storage Helpers ---
  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.members)) state.members = parsed.members;
        if (Array.isArray(parsed.readings)) state.readings = parsed.readings;
        if (parsed.sugarUnit === 'mmol/L' || parsed.sugarUnit === 'mg/dL') {
          state.sugarUnit = parsed.sugarUnit;
        }
      }
    } catch (err) {
      // Fallback to in-memory state if localStorage is restricted
    }
  }

  function saveState() {
    try {
      const payload = {
        members: state.members,
        readings: state.readings,
        sugarUnit: state.sugarUnit
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      // Ignore storage quota or sandbox restriction errors
    }
  }

  // --- Utility Helpers ---
  function generateId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getTodayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getNowTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function shiftDateISO(daysDelta) {
    const d = new Date();
    d.setDate(d.getDate() + daysDelta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDisplayDate(isoDate) {
    if (!isoDate) return '—';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatShortDate(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatTime12h(timeStr) {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    const h = Number(hStr);
    if (Number.isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mStr || '00'} ${ampm}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0].slice(0, 2) || '?').toUpperCase();
  }

  function getColorObj(colorId) {
    return MEMBER_COLORS.find((c) => c.id === colorId) || MEMBER_COLORS[0];
  }

  function getMemberById(id) {
    return state.members.find((m) => m.id === id) || null;
  }

  function formatSugarValue(mgDlValue) {
    const val = Number(mgDlValue);
    if (!Number.isFinite(val)) return '—';
    if (state.sugarUnit === 'mmol/L') {
      return (val / MGDL_TO_MMOL).toFixed(1);
    }
    return Math.round(val).toString();
  }

  // --- Clinical Categorization (AHA & ADA Grounded) ---
  function classifyBP(systolic, diastolic) {
    const sys = Number(systolic);
    const dia = Number(diastolic);
    if (!Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0) {
      return { label: '—', badgeClass: 'bg-slate-100 text-slate-600' };
    }
    if (sys > 180 || dia > 120) {
      return { label: 'Severe High', badgeClass: 'bg-red-100 text-red-800 border border-red-200' };
    }
    if (sys >= 140 || dia >= 90) {
      return { label: 'High (Stage 2)', badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200' };
    }
    if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
      return { label: 'High (Stage 1)', badgeClass: 'bg-orange-100 text-orange-800 border border-orange-200' };
    }
    if (sys >= 120 && sys <= 129 && dia < 80) {
      return { label: 'Elevated', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' };
    }
    if (sys < 90 || dia < 60) {
      return { label: 'Low', badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200' };
    }
    return { label: 'Normal', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
  }

  function classifySugar(mgDlValue, context) {
    const val = Number(mgDlValue);
    if (!Number.isFinite(val) || val <= 0) {
      return { label: '—', badgeClass: 'bg-slate-100 text-slate-600' };
    }
    if (val < 70) {
      return { label: 'Low', badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200' };
    }
    if (context === 'fasting') {
      if (val < 100) return { label: 'Normal', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
      if (val <= 125) return { label: 'Elevated', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' };
      return { label: 'High', badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200' };
    }
    // Post-meal, before meal, bedtime, random (ADA general reference)
    if (val < 140) return { label: 'Normal', badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    if (val <= 199) return { label: 'Elevated', badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200' };
    return { label: 'High', badgeClass: 'bg-rose-100 text-rose-800 border border-rose-200' };
  }

  // --- Filtering & Sorting ---
  function getFilteredReadings(options = {}) {
    const ignoreType = Boolean(options.ignoreType);
    const memberId = options.memberId !== undefined ? options.memberId : state.selectedMemberId;

    let minDate = '';
    let maxDate = '';

    if (state.filters.range === '7d') {
      minDate = shiftDateISO(-6);
    } else if (state.filters.range === '30d') {
      minDate = shiftDateISO(-29);
    } else if (state.filters.range === '90d') {
      minDate = shiftDateISO(-89);
    } else if (state.filters.range === 'custom') {
      minDate = state.filters.fromDate || '';
      maxDate = state.filters.toDate || '';
    }

    const query = (state.filters.search || '').trim().toLowerCase();

    return state.readings
      .filter((r) => {
        if (memberId !== 'all' && r.memberId !== memberId) return false;
        if (!ignoreType && state.filters.type !== 'all' && r.type !== state.filters.type) return false;
        if (minDate && r.date < minDate) return false;
        if (maxDate && r.date > maxDate) return false;
        if (query) {
          const member = getMemberById(r.memberId);
          const haystack = [
            member ? member.name : '',
            r.notes || '',
            r.date,
            r.type === 'bp' ? `${r.systolic}/${r.diastolic} bp blood pressure` : `${r.sugarValue} sugar glucose ${SUGAR_CONTEXT_LABELS[r.sugarContext] || ''}`
          ].join(' ').toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dtA = `${a.date}T${a.time || '00:00'}`;
        const dtB = `${b.date}T${b.time || '00:00'}`;
        if (dtB !== dtA) return dtB.localeCompare(dtA);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  // --- Toast Notifications ---
  function showToast(message, variant = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bgClass = variant === 'error'
      ? 'bg-rose-700 text-white'
      : variant === 'info'
        ? 'bg-slate-800 text-white'
        : 'bg-teal-700 text-white';
    toast.className = `toast-enter px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${bgClass}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  // --- Sample Family Data Loader ---
  function loadSampleData() {
    const m1 = { id: generateId('mem'), name: 'Ramesh Kumar', relation: 'Father', age: 62, color: 'teal', notes: 'Morning BP check before breakfast', createdAt: Date.now() - 100000 };
    const m2 = { id: generateId('mem'), name: 'Lakshmi Devi', relation: 'Mother', age: 58, color: 'rose', notes: 'Fasting & 2h post-lunch glucose tracking', createdAt: Date.now() - 90000 };
    const m3 = { id: generateId('mem'), name: 'Arjun', relation: 'Self', age: 34, color: 'indigo', notes: 'Routine weekly wellness checks', createdAt: Date.now() - 80000 };

    const sampleReadings = [];
    const bpProfiles = [
      { member: m1, baseSys: 128, baseDia: 82, basePulse: 72 },
      { member: m2, baseSys: 118, baseDia: 76, basePulse: 76 },
      { member: m3, baseSys: 114, baseDia: 74, basePulse: 68 }
    ];
    const sugarProfiles = [
      { member: m1, fasting: 106, afterMeal: 142 },
      { member: m2, fasting: 118, afterMeal: 164 },
      { member: m3, fasting: 90, afterMeal: 118 }
    ];

    const offsets = [-12, -10, -8, -6, -4, -2, -1, 0];
    offsets.forEach((offset, idx) => {
      const date = shiftDateISO(offset);
      bpProfiles.forEach((p, pIdx) => {
        if (pIdx === 2 && idx % 2 !== 0) return;
        const jitterSys = ((idx * 3 + pIdx * 5) % 9) - 4;
        const jitterDia = ((idx * 2 + pIdx * 3) % 7) - 3;
        sampleReadings.push({
          id: generateId('rd'),
          memberId: p.member.id,
          type: 'bp',
          date,
          time: '07:30',
          systolic: p.baseSys + jitterSys,
          diastolic: p.baseDia + jitterDia,
          pulse: p.basePulse + ((idx + pIdx) % 5) - 2,
          notes: idx === offsets.length - 1 ? 'Seated 5 min rest before reading' : '',
          createdAt: Date.now() - (offsets.length - idx) * 10000 + pIdx
        });
      });

      sugarProfiles.forEach((p, pIdx) => {
        if (pIdx === 2 && idx % 3 !== 0) return;
        const jitterF = ((idx * 5 + pIdx * 3) % 11) - 5;
        sampleReadings.push({
          id: generateId('rd'),
          memberId: p.member.id,
          type: 'sugar',
          date,
          time: '07:15',
          sugarValue: p.fasting + jitterF,
          sugarContext: 'fasting',
          notes: '',
          createdAt: Date.now() - (offsets.length - idx) * 9000 + pIdx
        });

        if (idx % 2 === 0 || idx === offsets.length - 1) {
          const jitterP = ((idx * 7 + pIdx * 4) % 15) - 7;
          sampleReadings.push({
            id: generateId('rd'),
            memberId: p.member.id,
            type: 'sugar',
            date,
            time: '14:30',
            sugarValue: p.afterMeal + jitterP,
            sugarContext: 'after_meal',
            notes: idx === offsets.length - 1 ? '2 hours after lunch' : '',
            createdAt: Date.now() - (offsets.length - idx) * 8000 + pIdx
          });
        }
      });
    });

    state.members = [m1, m2, m3];
    state.readings = sampleReadings;
    state.selectedMemberId = 'all';
    state.filters.range = '30d';
    saveState();
    renderAll();
    showToast('Sample family profiles & 14-day readings loaded');
  }

  // --- Member CRUD ---
  function openMemberModal(memberId = null) {
    state.editingMemberId = memberId;
    const modal = document.getElementById('member-modal');
    const titleEl = document.getElementById('member-modal-title');
    const nameInput = document.getElementById('member-name');
    const relationInput = document.getElementById('member-relation');
    const ageInput = document.getElementById('member-age');
    const notesInput = document.getElementById('member-notes');
    const submitBtn = document.getElementById('member-submit-btn');

    let selectedColor = MEMBER_COLORS[state.members.length % MEMBER_COLORS.length].id;

    if (memberId) {
      const m = getMemberById(memberId);
      if (!m) return;
      titleEl.textContent = 'Edit Family Member';
      submitBtn.textContent = 'Save Changes';
      nameInput.value = m.name || '';
      relationInput.value = m.relation || 'Other';
      ageInput.value = m.age || '';
      notesInput.value = m.notes || '';
      selectedColor = m.color || 'teal';
    } else {
      titleEl.textContent = 'Add Family Member';
      submitBtn.textContent = 'Add Member';
      nameInput.value = '';
      relationInput.value = 'Self';
      ageInput.value = '';
      notesInput.value = '';
    }

    renderColorPicker(selectedColor);
    modal.classList.remove('hidden');
    nameInput.focus();
  }

  function closeMemberModal() {
    document.getElementById('member-modal').classList.add('hidden');
    state.editingMemberId = null;
  }

  function renderColorPicker(activeColorId) {
    const container = document.getElementById('member-color-picker');
    if (!container) return;
    container.innerHTML = MEMBER_COLORS.map((c) => {
      const isSelected = c.id === activeColorId;
      return `
        <button type="button" data-color-id="${c.id}" aria-label="${c.label}"
          class="w-9 h-9 rounded-full flex items-center justify-center transition-transform ${isSelected ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : 'hover:scale-105'}"
          style="background-color: ${c.bg}">
          ${isSelected ? '<span class="w-2.5 h-2.5 rounded-full bg-white"></span>' : ''}
        </button>
      `;
    }).join('');
    container.dataset.selectedColor = activeColorId;
  }

  function handleMemberFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('member-name').value.trim();
    const relation = document.getElementById('member-relation').value;
    const ageRaw = document.getElementById('member-age').value.trim();
    const age = ageRaw ? Number(ageRaw) : null;
    const notes = document.getElementById('member-notes').value.trim();
    const color = document.getElementById('member-color-picker').dataset.selectedColor || 'teal';

    if (!name) {
      showToast('Please enter a name for the family member', 'error');
      return;
    }

    if (state.editingMemberId) {
      const idx = state.members.findIndex((m) => m.id === state.editingMemberId);
      if (idx !== -1) {
        state.members[idx] = { ...state.members[idx], name, relation, age, color, notes };
        showToast(`Updated ${name}`);
      }
    } else {
      const newMember = {
        id: generateId('mem'),
        name,
        relation,
        age,
        color,
        notes,
        createdAt: Date.now()
      };
      state.members.push(newMember);
      if (state.members.length === 1) {
        state.selectedMemberId = newMember.id;
      }
      showToast(`Added ${name} to family`);
    }

    saveState();
    closeMemberModal();
    renderAll();
  }

  function requestDeleteMember(memberId) {
    const member = getMemberById(memberId);
    if (!member) return;
    const count = state.readings.filter((r) => r.memberId === memberId).length;
    openConfirmModal(
      `Remove ${member.name}?`,
      `This will permanently delete ${member.name}'s profile and ${count} associated reading${count === 1 ? '' : 's'}.`,
      'Delete Member',
      () => {
        state.members = state.members.filter((m) => m.id !== memberId);
        state.readings = state.readings.filter((r) => r.memberId !== memberId);
        if (state.selectedMemberId === memberId) {
          state.selectedMemberId = 'all';
        }
        saveState();
        renderAll();
        showToast(`Removed ${member.name}`);
      }
    );
  }

  // --- Reading CRUD ---
  function openReadingModal(options = {}) {
    if (state.members.length === 0) {
      showToast('Add a family member first before logging a reading', 'info');
      openMemberModal();
      return;
    }

    const { readingId = null, presetMemberId = null, presetMode = null } = options;
    state.editingReadingId = readingId;

    const modal = document.getElementById('reading-modal');
    const titleEl = document.getElementById('reading-modal-title');
    const submitBtn = document.getElementById('reading-submit-btn');
    const memberSelect = document.getElementById('reading-member');
    const dateInput = document.getElementById('reading-date');
    const timeInput = document.getElementById('reading-time');
    const sysInput = document.getElementById('reading-sys');
    const diaInput = document.getElementById('reading-dia');
    const pulseInput = document.getElementById('reading-pulse');
    const sugarInput = document.getElementById('reading-sugar');
    const sugarCtxSelect = document.getElementById('reading-sugar-context');
    const notesInput = document.getElementById('reading-notes');
    const modeToggleWrap = document.getElementById('reading-mode-toggle');
    const sugarUnitLabel = document.getElementById('reading-sugar-unit-label');

    sugarUnitLabel.textContent = state.sugarUnit;

    memberSelect.innerHTML = state.members
      .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.relation)})</option>`)
      .join('');

    if (readingId) {
      const r = state.readings.find((item) => item.id === readingId);
      if (!r) return;
      titleEl.textContent = r.type === 'bp' ? 'Edit Blood Pressure Reading' : 'Edit Blood Sugar Reading';
      submitBtn.textContent = 'Save Reading';
      memberSelect.value = r.memberId;
      dateInput.value = r.date || getTodayISO();
      timeInput.value = r.time || getNowTime();
      notesInput.value = r.notes || '';
      modeToggleWrap.classList.add('hidden');
      setReadingFormMode(r.type);

      if (r.type === 'bp') {
        sysInput.value = r.systolic || '';
        diaInput.value = r.diastolic || '';
        pulseInput.value = r.pulse || '';
        sugarInput.value = '';
      } else {
        sysInput.value = '';
        diaInput.value = '';
        pulseInput.value = '';
        sugarInput.value = state.sugarUnit === 'mmol/L'
          ? (Number(r.sugarValue) / MGDL_TO_MMOL).toFixed(1)
          : r.sugarValue;
        sugarCtxSelect.value = r.sugarContext || 'fasting';
      }
    } else {
      titleEl.textContent = 'Log Health Reading';
      submitBtn.textContent = 'Save Reading';
      modeToggleWrap.classList.remove('hidden');

      const defaultMember = presetMemberId || (state.selectedMemberId !== 'all' ? state.selectedMemberId : state.members[0].id);
      memberSelect.value = defaultMember;
      dateInput.value = getTodayISO();
      timeInput.value = getNowTime();
      sysInput.value = '';
      diaInput.value = '';
      pulseInput.value = '';
      sugarInput.value = '';
      sugarCtxSelect.value = 'fasting';
      notesInput.value = '';
      setReadingFormMode(presetMode || 'both');
    }

    updateLiveReadingPreview();
    modal.classList.remove('hidden');
  }

  function closeReadingModal() {
    document.getElementById('reading-modal').classList.add('hidden');
    state.editingReadingId = null;
  }

  function setReadingFormMode(mode) {
    state.readingFormMode = mode;
    const bpSection = document.getElementById('bp-fields-section');
    const sugarSection = document.getElementById('sugar-fields-section');

    bpSection.classList.toggle('hidden', mode === 'sugar');
    sugarSection.classList.toggle('hidden', mode === 'bp');

    document.querySelectorAll('[data-reading-mode]').forEach((btn) => {
      const active = btn.dataset.readingMode === mode;
      btn.className = active
        ? 'flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold bg-white text-teal-800 shadow-sm transition'
        : 'flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition';
    });

    updateLiveReadingPreview();
  }

  function updateLiveReadingPreview() {
    const bpBadge = document.getElementById('bp-live-badge');
    const sugarBadge = document.getElementById('sugar-live-badge');

    const sys = Number(document.getElementById('reading-sys').value);
    const dia = Number(document.getElementById('reading-dia').value);
    if (sys > 0 && dia > 0) {
      const cat = classifyBP(sys, dia);
      bpBadge.textContent = cat.label;
      bpBadge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${cat.badgeClass}`;
    } else {
      bpBadge.textContent = 'Enter systolic & diastolic';
      bpBadge.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500';
    }

    const rawSugar = Number(document.getElementById('reading-sugar').value);
    const ctx = document.getElementById('reading-sugar-context').value;
    if (rawSugar > 0) {
      const mgDl = state.sugarUnit === 'mmol/L' ? rawSugar * MGDL_TO_MMOL : rawSugar;
      const cat = classifySugar(mgDl, ctx);
      sugarBadge.textContent = cat.label;
      sugarBadge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${cat.badgeClass}`;
    } else {
      sugarBadge.textContent = 'Enter glucose value';
      sugarBadge.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500';
    }
  }

  function handleReadingFormSubmit(e) {
    e.preventDefault();
    const memberId = document.getElementById('reading-member').value;
    const date = document.getElementById('reading-date').value || getTodayISO();
    const time = document.getElementById('reading-time').value || getNowTime();
    const notes = document.getElementById('reading-notes').value.trim();

    const sysVal = Number(document.getElementById('reading-sys').value);
    const diaVal = Number(document.getElementById('reading-dia').value);
    const pulseRaw = document.getElementById('reading-pulse').value.trim();
    const pulseVal = pulseRaw ? Number(pulseRaw) : null;

    const sugarRaw = Number(document.getElementById('reading-sugar').value);
    const sugarCtx = document.getElementById('reading-sugar-context').value;

    const wantBP = state.readingFormMode === 'bp' || (state.readingFormMode === 'both' && (sysVal > 0 || diaVal > 0));
    const wantSugar = state.readingFormMode === 'sugar' || (state.readingFormMode === 'both' && sugarRaw > 0);

    if (!wantBP && !wantSugar) {
      showToast('Please enter at least a BP or Blood Sugar value', 'error');
      return;
    }

    if (wantBP) {
      if (!Number.isFinite(sysVal) || sysVal < 50 || sysVal > 300 || !Number.isFinite(diaVal) || diaVal < 30 || diaVal > 200) {
        showToast('Enter valid BP values (Systolic 50–300, Diastolic 30–200)', 'error');
        return;
      }
    }

    let sugarMgDl = null;
    if (wantSugar) {
      sugarMgDl = state.sugarUnit === 'mmol/L' ? Math.round(sugarRaw * MGDL_TO_MMOL) : Math.round(sugarRaw);
      if (!Number.isFinite(sugarMgDl) || sugarMgDl < 20 || sugarMgDl > 700) {
        showToast('Enter a valid Blood Sugar reading', 'error');
        return;
      }
    }

    if (state.editingReadingId) {
      const idx = state.readings.findIndex((r) => r.id === state.editingReadingId);
      if (idx !== -1) {
        const existing = state.readings[idx];
        if (existing.type === 'bp') {
          state.readings[idx] = { ...existing, memberId, date, time, systolic: sysVal, diastolic: diaVal, pulse: pulseVal, notes };
        } else {
          state.readings[idx] = { ...existing, memberId, date, time, sugarValue: sugarMgDl, sugarContext: sugarCtx, notes };
        }
        showToast('Reading updated');
      }
    } else {
      const now = Date.now();
      let savedCount = 0;
      if (wantBP) {
        state.readings.push({
          id: generateId('rd'),
          memberId,
          type: 'bp',
          date,
          time,
          systolic: sysVal,
          diastolic: diaVal,
          pulse: pulseVal,
          notes,
          createdAt: now
        });
        savedCount++;
      }
      if (wantSugar) {
        state.readings.push({
          id: generateId('rd'),
          memberId,
          type: 'sugar',
          date,
          time,
          sugarValue: sugarMgDl,
          sugarContext: sugarCtx,
          notes,
          createdAt: now + 1
        });
        savedCount++;
      }
      showToast(savedCount === 2 ? 'Saved BP & Blood Sugar readings' : 'Saved health reading');
    }

    saveState();
    closeReadingModal();
    renderAll();
  }

  function requestDeleteReading(readingId) {
    openConfirmModal(
      'Delete Reading?',
      'Are you sure you want to permanently delete this logged reading?',
      'Delete',
      () => {
        state.readings = state.readings.filter((r) => r.id !== readingId);
        saveState();
        renderAll();
        showToast('Reading deleted');
      }
    );
  }

  // --- Confirmation Modal (Sandbox-safe replacement for confirm()) ---
  function openConfirmModal(title, message, confirmLabel, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-ok-btn').textContent = confirmLabel || 'Confirm';
    state.pendingConfirmAction = onConfirm;
    document.getElementById('confirm-modal').classList.remove('hidden');
  }

  function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
    state.pendingConfirmAction = null;
  }

  // --- Export / Import ---
  function exportCSV() {
    const rows = getFilteredReadings();
    if (rows.length === 0) {
      showToast('No readings in the current filter to export', 'info');
      return;
    }
    const headers = ['Date', 'Time', 'Member', 'Relation', 'Type', 'Systolic (mmHg)', 'Diastolic (mmHg)', 'Pulse (bpm)', 'Blood Sugar (mg/dL)', 'Blood Sugar (mmol/L)', 'Sugar Context', 'Status', 'Notes'];
    const csvLines = [headers.join(',')];

    rows.forEach((r) => {
      const m = getMemberById(r.memberId);
      const status = r.type === 'bp'
        ? classifyBP(r.systolic, r.diastolic).label
        : classifySugar(r.sugarValue, r.sugarContext).label;
      const line = [
        r.date,
        r.time || '',
        m ? m.name : 'Unknown',
        m ? m.relation : '',
        r.type === 'bp' ? 'Blood Pressure' : 'Blood Sugar',
        r.type === 'bp' ? r.systolic : '',
        r.type === 'bp' ? r.diastolic : '',
        r.type === 'bp' && r.pulse ? r.pulse : '',
        r.type === 'sugar' ? r.sugarValue : '',
        r.type === 'sugar' ? (Number(r.sugarValue) / MGDL_TO_MMOL).toFixed(1) : '',
        r.type === 'sugar' ? (SUGAR_CONTEXT_LABELS[r.sugarContext] || '') : '',
        status,
        r.notes || ''
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
      csvLines.push(line.join(','));
    });

    downloadFile(csvLines.join('\n'), `family-vitals-${getTodayISO()}.csv`, 'text/csv;charset=utf-8;');
    showToast(`Exported ${rows.length} readings to CSV`);
  }

  function exportJSON() {
    const payload = {
      app: 'VitalsFam',
      version: 1,
      exportedAt: new Date().toISOString(),
      sugarUnit: state.sugarUnit,
      members: state.members,
      readings: state.readings
    };
    downloadFile(JSON.stringify(payload, null, 2), `vitalsfam-backup-${getTodayISO()}.json`, 'application/json');
    showToast('Downloaded JSON backup');
  }

  function handleJSONImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data.members) || !Array.isArray(data.readings)) {
          showToast('Invalid backup file format', 'error');
          return;
        }
        state.members = data.members;
        state.readings = data.readings;
        if (data.sugarUnit === 'mmol/L' || data.sugarUnit === 'mg/dL') {
          state.sugarUnit = data.sugarUnit;
        }
        state.selectedMemberId = 'all';
        saveState();
        renderAll();
        showToast(`Imported ${data.members.length} members & ${data.readings.length} readings`);
      } catch (err) {
        showToast('Could not read JSON backup file', 'error');
      }
    };
    reader.readAsText(file);
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Rendering ---
  function renderAll() {
    renderNavigation();
    renderMemberStrip();
    renderSidebarMembers();
    renderUnitToggle();
    renderFilterControls();

    const views = ['dashboard', 'members', 'history', 'guide'];
    views.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', state.activeTab !== v);
    });

    if (state.activeTab === 'dashboard') {
      renderDashboard();
    } else if (state.activeTab === 'members') {
      renderMembersView();
    } else if (state.activeTab === 'history') {
      renderHistoryView();
    }

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderNavigation() {
    const titles = {
      dashboard: 'Family Health Dashboard',
      members: 'Family Members',
      history: 'Date Tracker & History',
      guide: 'Reference Ranges (AHA & ADA)'
    };
    const headerTitle = document.getElementById('page-title');
    if (headerTitle) headerTitle.textContent = titles[state.activeTab] || 'VitalsFam';

    document.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      const isActive = btn.dataset.navTab === state.activeTab;
      if (btn.classList.contains('sidebar-nav-btn')) {
        btn.className = isActive
          ? 'sidebar-nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-teal-50 text-teal-800 transition'
          : 'sidebar-nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition';
      } else {
        btn.className = isActive
          ? 'flex-1 flex flex-col items-center justify-center py-2 text-teal-700 font-semibold text-xs gap-1'
          : 'flex-1 flex flex-col items-center justify-center py-2 text-slate-500 hover:text-slate-800 font-medium text-xs gap-1';
      }
    });
  }

  function renderUnitToggle() {
    document.querySelectorAll('[data-unit-btn]').forEach((btn) => {
      const active = btn.dataset.unitBtn === state.sugarUnit;
      btn.className = active
        ? 'px-2.5 py-1 rounded-md text-xs font-semibold bg-white text-teal-800 shadow-sm'
        : 'px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900';
    });
  }

  function renderMemberStrip() {
    const strip = document.getElementById('member-filter-strip');
    if (!strip) return;

    const allActive = state.selectedMemberId === 'all';
    let html = `
      <button type="button" data-select-member="all"
        class="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition border ${
          allActive
            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
        }">
        <span>All Family</span>
        <span class="px-1.5 py-0.5 rounded-full text-[11px] ${allActive ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'}">${state.members.length}</span>
      </button>
    `;

    state.members.forEach((m) => {
      const isActive = state.selectedMemberId === m.id;
      const col = getColorObj(m.color);
      html += `
        <button type="button" data-select-member="${escapeHtml(m.id)}"
          class="shrink-0 inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition border ${
            isActive
              ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
          }">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style="background-color: ${col.bg}">
            ${escapeHtml(getInitials(m.name))}
          </span>
          <span>${escapeHtml(m.name)}</span>
        </button>
      `;
    });

    html += `
      <button type="button" data-action="add-member"
        class="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200/80 transition">
        <span>+ Add Member</span>
      </button>
    `;

    strip.innerHTML = html;
  }

  function renderSidebarMembers() {
    const list = document.getElementById('sidebar-members-list');
    if (!list) return;
    if (state.members.length === 0) {
      list.innerHTML = `<p class="text-xs text-slate-400 px-3 py-2">No family members yet</p>`;
      return;
    }
    list.innerHTML = state.members.map((m) => {
      const isActive = state.selectedMemberId === m.id;
      const col = getColorObj(m.color);
      return `
        <button type="button" data-select-member="${escapeHtml(m.id)}"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition ${
            isActive ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'
          }">
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background-color: ${col.bg}">
            ${escapeHtml(getInitials(m.name))}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-semibold truncate">${escapeHtml(m.name)}</div>
            <div class="text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-400'} truncate">${escapeHtml(m.relation)}</div>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderFilterControls() {
    document.querySelectorAll('[data-range-btn]').forEach((btn) => {
      const active = btn.dataset.rangeBtn === state.filters.range;
      btn.className = active
        ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-700 text-white shadow-sm transition'
        : 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition';
    });

    const customWrap = document.getElementById('custom-date-inputs');
    if (customWrap) {
      customWrap.classList.toggle('hidden', state.filters.range !== 'custom');
    }
    const fromInput = document.getElementById('filter-from-date');
    const toInput = document.getElementById('filter-to-date');
    if (fromInput && fromInput.value !== state.filters.fromDate) fromInput.value = state.filters.fromDate;
    if (toInput && toInput.value !== state.filters.toDate) toInput.value = state.filters.toDate;

    document.querySelectorAll('[data-type-filter]').forEach((btn) => {
      const active = btn.dataset.typeFilter === state.filters.type;
      btn.className = active
        ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white transition'
        : 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition';
    });
  }

  function renderDashboard() {
    const onboardingBanner = document.getElementById('onboarding-banner');
    if (onboardingBanner) {
      onboardingBanner.classList.toggle('hidden', state.members.length > 0 && state.readings.length > 0);
    }

    const filteredAll = getFilteredReadings({ ignoreType: true });
    const bpReadings = filteredAll.filter((r) => r.type === 'bp');
    const sugarReadings = filteredAll.filter((r) => r.type === 'sugar');

    // KPI 1: Latest BP
    const latestBP = bpReadings[0] || null;
    const kpiBpVal = document.getElementById('kpi-bp-value');
    const kpiBpBadge = document.getElementById('kpi-bp-badge');
    const kpiBpMeta = document.getElementById('kpi-bp-meta');
    if (latestBP) {
      const cat = classifyBP(latestBP.systolic, latestBP.diastolic);
      const mem = getMemberById(latestBP.memberId);
      kpiBpVal.textContent = `${latestBP.systolic}/${latestBP.diastolic}`;
      kpiBpBadge.textContent = cat.label;
      kpiBpBadge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${cat.badgeClass}`;
      kpiBpMeta.textContent = `${mem ? mem.name + ' · ' : ''}${formatShortDate(latestBP.date)} ${formatTime12h(latestBP.time)}${latestBP.pulse ? ' · ' + latestBP.pulse + ' bpm' : ''}`;
    } else {
      kpiBpVal.textContent = '—/—';
      kpiBpBadge.textContent = 'No readings';
      kpiBpBadge.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500';
      kpiBpMeta.textContent = 'Log a blood pressure reading';
    }

    // KPI 2: Latest Sugar
    const latestSugar = sugarReadings[0] || null;
    const kpiSugarVal = document.getElementById('kpi-sugar-value');
    const kpiSugarUnit = document.getElementById('kpi-sugar-unit');
    const kpiSugarBadge = document.getElementById('kpi-sugar-badge');
    const kpiSugarMeta = document.getElementById('kpi-sugar-meta');
    kpiSugarUnit.textContent = state.sugarUnit;
    if (latestSugar) {
      const cat = classifySugar(latestSugar.sugarValue, latestSugar.sugarContext);
      const mem = getMemberById(latestSugar.memberId);
      kpiSugarVal.textContent = formatSugarValue(latestSugar.sugarValue);
      kpiSugarBadge.textContent = cat.label;
      kpiSugarBadge.className = `text-xs font-semibold px-2.5 py-0.5 rounded-full ${cat.badgeClass}`;
      kpiSugarMeta.textContent = `${mem ? mem.name + ' · ' : ''}${SUGAR_CONTEXT_LABELS[latestSugar.sugarContext] || ''} · ${formatShortDate(latestSugar.date)}`;
    } else {
      kpiSugarVal.textContent = '—';
      kpiSugarBadge.textContent = 'No readings';
      kpiSugarBadge.className = 'text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500';
      kpiSugarMeta.textContent = 'Log a blood sugar reading';
    }

    // KPI 3: Average BP (filtered)
    const kpiAvgBp = document.getElementById('kpi-avg-bp');
    const kpiAvgBpSub = document.getElementById('kpi-avg-bp-sub');
    if (bpReadings.length > 0) {
      const avgSys = Math.round(bpReadings.reduce((acc, r) => acc + Number(r.systolic), 0) / bpReadings.length);
      const avgDia = Math.round(bpReadings.reduce((acc, r) => acc + Number(r.diastolic), 0) / bpReadings.length);
      kpiAvgBp.textContent = `${avgSys}/${avgDia}`;
      kpiAvgBpSub.textContent = `Avg across ${bpReadings.length} BP log${bpReadings.length === 1 ? '' : 's'}`;
    } else {
      kpiAvgBp.textContent = '—/—';
      kpiAvgBpSub.textContent = 'No BP logs in date range';
    }

    // KPI 4: Average Sugar (filtered)
    const kpiAvgSugar = document.getElementById('kpi-avg-sugar');
    const kpiAvgSugarSub = document.getElementById('kpi-avg-sugar-sub');
    if (sugarReadings.length > 0) {
      const avgMg = sugarReadings.reduce((acc, r) => acc + Number(r.sugarValue), 0) / sugarReadings.length;
      kpiAvgSugar.textContent = `${formatSugarValue(avgMg)} ${state.sugarUnit}`;
      kpiAvgSugarSub.textContent = `Avg across ${sugarReadings.length} glucose log${sugarReadings.length === 1 ? '' : 's'}`;
    } else {
      kpiAvgSugar.textContent = `— ${state.sugarUnit}`;
      kpiAvgSugarSub.textContent = 'No glucose logs in date range';
    }

    renderCharts(bpReadings, sugarReadings);
    renderRecentReadings(filteredAll.slice(0, 8));
  }

  function renderCharts(bpReadingsDesc, sugarReadingsDesc) {
    const bpEmpty = document.getElementById('bp-chart-empty');
    const sugarEmpty = document.getElementById('sugar-chart-empty');

    const bpChrono = [...bpReadingsDesc].reverse();
    const sugarChrono = [...sugarReadingsDesc].reverse();

    if (bpChartInstance) {
      bpChartInstance.destroy();
      bpChartInstance = null;
    }
    if (sugarChartInstance) {
      sugarChartInstance.destroy();
      sugarChartInstance = null;
    }

    if (typeof window.Chart === 'undefined') return;

    // Blood Pressure Chart
    const bpCanvas = document.getElementById('bp-trend-chart');
    if (bpChrono.length === 0) {
      bpEmpty.classList.remove('hidden');
    } else {
      bpEmpty.classList.add('hidden');
      const labels = bpChrono.map((r) => {
        const mem = getMemberById(r.memberId);
        return state.selectedMemberId === 'all' && mem
          ? `${formatShortDate(r.date)} (${mem.name.split(' ')[0]})`
          : formatShortDate(r.date);
      });
      bpChartInstance = new window.Chart(bpCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Systolic (mm Hg)',
              data: bpChrono.map((r) => Number(r.systolic)),
              borderColor: '#e11d48',
              backgroundColor: 'rgba(225, 29, 72, 0.1)',
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 4,
              pointHoverRadius: 6,
              fill: false
            },
            {
              label: 'Diastolic (mm Hg)',
              data: bpChrono.map((r) => Number(r.diastolic)),
              borderColor: '#0284c7',
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 4,
              pointHoverRadius: 6,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
            tooltip: {
              callbacks: {
                afterTitle: (items) => {
                  const r = bpChrono[items[0].dataIndex];
                  const mem = getMemberById(r.memberId);
                  return mem ? `${mem.name} · ${formatTime12h(r.time)}` : '';
                }
              }
            }
          },
          scales: {
            y: {
              suggestedMin: 60,
              suggestedMax: 160,
              grid: { color: '#f1f5f9' },
              ticks: { font: { size: 11 } }
            },
            x: {
              grid: { display: false },
              ticks: { maxRotation: 35, font: { size: 11 } }
            }
          }
        }
      });
    }

    // Blood Sugar Chart
    const sugarCanvas = document.getElementById('sugar-trend-chart');
    if (sugarChrono.length === 0) {
      sugarEmpty.classList.remove('hidden');
    } else {
      sugarEmpty.classList.add('hidden');
      const labels = sugarChrono.map((r) => {
        const mem = getMemberById(r.memberId);
        return state.selectedMemberId === 'all' && mem
          ? `${formatShortDate(r.date)} (${mem.name.split(' ')[0]})`
          : formatShortDate(r.date);
      });
      const values = sugarChrono.map((r) =>
        state.sugarUnit === 'mmol/L'
          ? Number((Number(r.sugarValue) / MGDL_TO_MMOL).toFixed(1))
          : Number(r.sugarValue)
      );
      const pointColors = sugarChrono.map((r) =>
        r.sugarContext === 'fasting' ? '#0f766e' : '#4f46e5'
      );

      sugarChartInstance = new window.Chart(sugarCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: `Blood Sugar (${state.sugarUnit})`,
              data: values,
              borderColor: '#0f766e',
              backgroundColor: 'rgba(15, 118, 110, 0.12)',
              pointBackgroundColor: pointColors,
              pointBorderColor: '#ffffff',
              pointBorderWidth: 1.5,
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 5,
              pointHoverRadius: 7,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 } } },
            tooltip: {
              callbacks: {
                afterTitle: (items) => {
                  const r = sugarChrono[items[0].dataIndex];
                  const mem = getMemberById(r.memberId);
                  const ctx = SUGAR_CONTEXT_LABELS[r.sugarContext] || '';
                  return `${mem ? mem.name + ' · ' : ''}${ctx} · ${formatTime12h(r.time)}`;
                }
              }
            }
          },
          scales: {
            y: {
              suggestedMin: state.sugarUnit === 'mmol/L' ? 3.5 : 65,
              suggestedMax: state.sugarUnit === 'mmol/L' ? 11 : 200,
              grid: { color: '#f1f5f9' },
              ticks: { font: { size: 11 } }
            },
            x: {
              grid: { display: false },
              ticks: { maxRotation: 35, font: { size: 11 } }
            }
          }
        }
      });
    }
  }

  function renderReadingRow(r) {
    const member = getMemberById(r.memberId);
    const col = getColorObj(member ? member.color : 'teal');
    const isBP = r.type === 'bp';
    const cat = isBP
      ? classifyBP(r.systolic, r.diastolic)
      : classifySugar(r.sugarValue, r.sugarContext);

    const valueHtml = isBP
      ? `<span class="text-base font-bold text-slate-900">${r.systolic}/${r.diastolic}</span> <span class="text-xs text-slate-500">mm Hg</span>${r.pulse ? ` <span class="text-xs text-slate-400">· ${r.pulse} bpm</span>` : ''}`
      : `<span class="text-base font-bold text-slate-900">${formatSugarValue(r.sugarValue)}</span> <span class="text-xs text-slate-500">${state.sugarUnit}</span> <span class="text-xs text-slate-400">· ${escapeHtml(SUGAR_CONTEXT_LABELS[r.sugarContext] || 'Glucose')}</span>`;

    return `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition print-break-inside-avoid">
        <div class="flex items-start sm:items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style="background-color: ${col.bg}">
            ${escapeHtml(getInitials(member ? member.name : '?'))}
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${isBP ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}">
                ${isBP ? 'BP' : 'Sugar'}
              </span>
              <span class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(member ? member.name : 'Unknown')}</span>
              <span class="text-xs text-slate-400">${formatShortDate(r.date)} · ${formatTime12h(r.time)}</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <div>${valueHtml}</div>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full ${cat.badgeClass}">${cat.label}</span>
            </div>
            ${r.notes ? `<p class="mt-1 text-xs text-slate-500 break-words">${escapeHtml(r.notes)}</p>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 self-end sm:self-center shrink-0 no-print">
          <button type="button" data-edit-reading="${escapeHtml(r.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition">Edit</button>
          <button type="button" data-delete-reading="${escapeHtml(r.id)}" class="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition">Delete</button>
        </div>
      </div>
    `;
  }

  function renderRecentReadings(list) {
    const container = document.getElementById('recent-readings-list');
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
          <p class="text-sm font-medium text-slate-600">No readings logged in this date range yet.</p>
          <p class="text-xs text-slate-400 mt-1">Tap "+ Log Reading" to record blood pressure or blood sugar.</p>
        </div>
      `;
      return;
    }
    container.innerHTML = list.map(renderReadingRow).join('');
  }

  function renderMembersView() {
    const grid = document.getElementById('members-grid');
    if (!grid) return;

    if (state.members.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12 px-6 rounded-2xl border border-dashed border-slate-300 bg-white">
          <h3 class="text-base font-semibold text-slate-800">No family members added yet</h3>
          <p class="text-sm text-slate-500 mt-1 max-w-md mx-auto">Add profiles for parents, spouse, children, or yourself to track blood pressure and blood sugar individually.</p>
          <div class="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" data-action="add-member" class="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold shadow-sm transition">+ Add Family Member</button>
            <button type="button" data-action="load-sample" class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold transition">Load Sample Family</button>
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = state.members.map((m) => {
      const col = getColorObj(m.color);
      const memberReadings = state.readings
        .filter((r) => r.memberId === m.id)
        .sort((a, b) => `${b.date}T${b.time || '00:00'}`.localeCompare(`${a.date}T${a.time || '00:00'}`));
      const lastBP = memberReadings.find((r) => r.type === 'bp');
      const lastSugar = memberReadings.find((r) => r.type === 'sugar');
      const bpCat = lastBP ? classifyBP(lastBP.systolic, lastBP.diastolic) : null;
      const sugarCat = lastSugar ? classifySugar(lastSugar.sugarValue, lastSugar.sugarContext) : null;

      return `
        <div class="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm flex flex-col justify-between gap-4">
          <div>
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold text-white shrink-0 shadow-sm" style="background-color: ${col.bg}">
                  ${escapeHtml(getInitials(m.name))}
                </div>
                <div class="min-w-0">
                  <h3 class="text-base font-bold text-slate-900 truncate">${escapeHtml(m.name)}</h3>
                  <p class="text-xs text-slate-500">${escapeHtml(m.relation)}${m.age ? ` · ${m.age} yrs` : ''} · ${memberReadings.length} log${memberReadings.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" data-edit-member="${escapeHtml(m.id)}" class="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition">Edit</button>
                <button type="button" data-delete-member="${escapeHtml(m.id)}" class="px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 transition">Delete</button>
              </div>
            </div>

            ${m.notes ? `<p class="mt-3 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">${escapeHtml(m.notes)}</p>` : ''}

            <div class="mt-4 grid grid-cols-2 gap-2.5">
              <div class="p-3 rounded-xl bg-rose-50/60 border border-rose-100">
                <div class="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">Latest BP</div>
                ${lastBP
                  ? `<div class="mt-1 text-lg font-bold text-slate-900">${lastBP.systolic}/${lastBP.diastolic}</div>
                     <div class="mt-1 flex items-center gap-1.5 flex-wrap">
                       <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${bpCat.badgeClass}">${bpCat.label}</span>
                       <span class="text-[11px] text-slate-500">${formatShortDate(lastBP.date)}</span>
                     </div>`
                  : `<div class="mt-1 text-sm font-medium text-slate-400">No logs yet</div>`
                }
              </div>
              <div class="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <div class="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Latest Sugar</div>
                ${lastSugar
                  ? `<div class="mt-1 text-lg font-bold text-slate-900">${formatSugarValue(lastSugar.sugarValue)} <span class="text-xs font-normal text-slate-500">${state.sugarUnit}</span></div>
                     <div class="mt-1 flex items-center gap-1.5 flex-wrap">
                       <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${sugarCat.badgeClass}">${sugarCat.label}</span>
                       <span class="text-[11px] text-slate-500">${formatShortDate(lastSugar.date)}</span>
                     </div>`
                  : `<div class="mt-1 text-sm font-medium text-slate-400">No logs yet</div>`
                }
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button type="button" data-log-for-member="${escapeHtml(m.id)}" class="flex-1 py-2 px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition">+ Log Reading</button>
            <button type="button" data-view-member-trends="${escapeHtml(m.id)}" class="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition">View Trends</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderHistoryView() {
    const container = document.getElementById('history-grouped-list');
    const countBadge = document.getElementById('history-count-badge');
    if (!container) return;

    const filtered = getFilteredReadings();
    if (countBadge) {
      countBadge.textContent = `${filtered.length} reading${filtered.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 px-6 rounded-2xl border border-dashed border-slate-300 bg-white">
          <h3 class="text-sm font-semibold text-slate-700">No matching readings found</h3>
          <p class="text-xs text-slate-500 mt-1">Try adjusting the date range, member filter, or search term.</p>
        </div>
      `;
      return;
    }

    // Group by calendar date (YYYY-MM-DD)
    const groups = new Map();
    filtered.forEach((r) => {
      if (!groups.has(r.date)) groups.set(r.date, []);
      groups.get(r.date).push(r);
    });

    let html = '';
    groups.forEach((dayReadings, isoDate) => {
      html += `
        <section class="space-y-2.5">
          <div class="flex items-center justify-between px-1">
            <h3 class="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-teal-600"></span>
              <span>${escapeHtml(formatDisplayDate(isoDate))}</span>
            </h3>
            <span class="text-xs font-medium text-slate-500">${dayReadings.length} entr${dayReadings.length === 1 ? 'y' : 'ies'}</span>
          </div>
          <div class="space-y-2">
            ${dayReadings.map(renderReadingRow).join('')}
          </div>
        </section>
      `;
    });

    container.innerHTML = html;
  }

  // --- Global Event Wiring ---
  function bindEvents() {
    // Delegated clicks
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, [data-action], [data-nav-tab], [data-select-member], [data-range-btn], [data-type-filter], [data-unit-btn], [data-reading-mode], [data-color-id], [data-edit-member], [data-delete-member], [data-log-for-member], [data-view-member-trends], [data-edit-reading], [data-delete-reading]');
      if (!target) return;

      if (target.dataset.navTab) {
        state.activeTab = target.dataset.navTab;
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (target.dataset.selectMember) {
        state.selectedMemberId = target.dataset.selectMember;
        renderAll();
        return;
      }

      if (target.dataset.rangeBtn) {
        state.filters.range = target.dataset.rangeBtn;
        if (state.filters.range === 'custom' && !state.filters.fromDate) {
          state.filters.fromDate = shiftDateISO(-29);
          state.filters.toDate = getTodayISO();
        }
        renderAll();
        return;
      }

      if (target.dataset.typeFilter) {
        state.filters.type = target.dataset.typeFilter;
        renderAll();
        return;
      }

      if (target.dataset.unitBtn) {
        state.sugarUnit = target.dataset.unitBtn;
        saveState();
        renderAll();
        showToast(`Switched blood sugar unit to ${state.sugarUnit}`, 'info');
        return;
      }

      if (target.dataset.readingMode) {
        setReadingFormMode(target.dataset.readingMode);
        return;
      }

      if (target.dataset.colorId) {
        renderColorPicker(target.dataset.colorId);
        return;
      }

      if (target.dataset.editMember) {
        openMemberModal(target.dataset.editMember);
        return;
      }

      if (target.dataset.deleteMember) {
        requestDeleteMember(target.dataset.deleteMember);
        return;
      }

      if (target.dataset.logForMember) {
        openReadingModal({ presetMemberId: target.dataset.logForMember });
        return;
      }

      if (target.dataset.viewMemberTrends) {
        state.selectedMemberId = target.dataset.viewMemberTrends;
        state.activeTab = 'dashboard';
        renderAll();
        return;
      }

      if (target.dataset.editReading) {
        openReadingModal({ readingId: target.dataset.editReading });
        return;
      }

      if (target.dataset.deleteReading) {
        requestDeleteReading(target.dataset.deleteReading);
        return;
      }

      const action = target.dataset.action;
      if (action === 'add-member') openMemberModal();
      else if (action === 'close-member-modal') closeMemberModal();
      else if (action === 'open-log-modal') openReadingModal();
      else if (action === 'close-reading-modal') closeReadingModal();
      else if (action === 'load-sample') loadSampleData();
      else if (action === 'export-csv') exportCSV();
      else if (action === 'export-json') exportJSON();
      else if (action === 'trigger-import') {
        const input = document.getElementById('import-json-input');
        if (input) input.click();
      }
      else if (action === 'print-report') {
        window.print();
      }
      else if (action === 'clear-all-data') {
        openConfirmModal(
          'Clear All Family Data?',
          'This removes all family members and logged readings from this browser. Export a JSON backup first if you want to keep a copy.',
          'Clear Everything',
          () => {
            state.members = [];
            state.readings = [];
            state.selectedMemberId = 'all';
            saveState();
            renderAll();
            showToast('All data cleared', 'info');
          }
        );
      }
      else if (action === 'close-confirm') closeConfirmModal();
      else if (action === 'confirm-ok') {
        const fn = state.pendingConfirmAction;
        closeConfirmModal();
        if (typeof fn === 'function') fn();
      }
    });

    // Forms
    document.getElementById('member-form').addEventListener('submit', handleMemberFormSubmit);
    document.getElementById('reading-form').addEventListener('submit', handleReadingFormSubmit);

    // Live reading preview listeners
    ['reading-sys', 'reading-dia', 'reading-sugar', 'reading-sugar-context'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateLiveReadingPreview);
      if (el) el.addEventListener('change', updateLiveReadingPreview);
    });

    // Custom date & search filters
    const fromInput = document.getElementById('filter-from-date');
    const toInput = document.getElementById('filter-to-date');
    if (fromInput) {
      fromInput.addEventListener('change', (e) => {
        state.filters.fromDate = e.target.value;
        renderAll();
      });
    }
    if (toInput) {
      toInput.addEventListener('change', (e) => {
        state.filters.toDate = e.target.value;
        renderAll();
      });
    }

    const searchInput = document.getElementById('history-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        renderHistoryView();
      });
    }

    // JSON import file input
    const importInput = document.getElementById('import-json-input');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleJSONImport(file);
        e.target.value = '';
      });
    }

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMemberModal();
        closeReadingModal();
        closeConfirmModal();
      }
    });
  }

  // --- Bootstrap ---
  document.addEventListener('DOMContentLoaded', () => {
    loadState();
    bindEvents();
    renderAll();
  });
})();
