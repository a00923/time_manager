// ---------- 提示音（Web Audio API） ----------
let audioCtx = null;
function playAlertSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // 播放5声响亮提醒
    for (let i = 0; i < 5; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 1000;
      osc.type = 'sine';
      const t = now + i * 0.3;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.8, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  } catch (e) { console.warn('Audio error:', e); }
}
function triggerVibrate() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }
  } catch (e) { console.warn('Vibrate error:', e); }
}
// ==================== 惜时手账 PWA 主逻辑 ====================

// ---------- 原生通知（Capacitor Android） ----------
const NativeNotify = {
  CHANNEL_ID: 'timer_alerts',
  isAvailable() {
    return typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
  },
  async init() {
    if (!this.isAvailable()) return;
    try {
      await Capacitor.Plugins.LocalNotifications.createChannel({
        id: this.CHANNEL_ID, name: '计时提醒', description: '计时结束提醒',
        importance: 5, sound: 'default', vibration: true, visibility: 1
      });
    } catch (e) { console.warn('Channel error:', e); }
  },
  async requestPermission() {
    if (!this.isAvailable()) {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      return;
    }
    try {
      await Capacitor.Plugins.LocalNotifications.requestPermissions();
    } catch (e) { console.warn('Notify permission error:', e); }
  },
  async send(title, body, scheduleAt) {
    if (this.isAvailable()) {
      try {
        await Capacitor.Plugins.LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Date.now() % 2147483647),
            title: title,
            body: body,
            schedule: scheduleAt ? { at: scheduleAt } : undefined,
            sound: 'default',
            smallIcon: 'ic_launcher',
            iconColor: '#007AFF',
            channelId: this.CHANNEL_ID
          }]
        });
        return;
      } catch (e) { console.warn('Native notify error:', e); }
    }
    // 降级：Web Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icons/icon-192.svg' });
    }
  },
  // 定时闹铃：在指定时间提醒
  async scheduleAlarm(title, body, atDate) {
    return this.send(title, body, atDate);
  }
};

// ---------- 数据存储层 ----------
const Storage = {
  KEY_APPS: 'tm_apps',
  KEY_RECORDS: 'tm_records',
  KEY_TIMER: 'tm_active_timer',
  KEY_POMO_CONFIG: 'tm_pomo_config',
  KEY_CATEGORIES: 'tm_categories',
  KEY_TASKS: 'tm_tasks',
  KEY_GOALS: 'tm_goals',
  KEY_TODOS: 'tm_todos',

  getTodos() {
    const data = localStorage.getItem(this.KEY_TODOS);
    let list = [];
    try { list = data ? JSON.parse(data) : []; } catch (e) { list = []; }
    return list.map(t => ({
      id: t.id || 'todo_' + Math.random().toString(36).slice(2, 10),
      text: t.text || '',
      categoryId: t.categoryId || '',
      priority: t.priority || 'none',
      dueDate: t.dueDate || '',
      dueTime: t.dueTime || '',
      repeat: t.repeat || 'none',
      repeatDays: t.repeatDays || [],
      parentId: t.parentId || null,
      order: typeof t.order === 'number' ? t.order : 0,
      linkedTask: t.linkedTask || '',
      notes: t.notes || '',
      completed: !!t.completed,
      completedAt: t.completedAt || null,
      createdAt: t.createdAt || Date.now()
    }));
  },

  saveTodos(todos) {
    localStorage.setItem(this.KEY_TODOS, JSON.stringify(todos));
  },

  addTodo(todo) {
    const todos = this.getTodos();
    todos.push(todo);
    this.saveTodos(todos);
  },

  updateTodo(id, updates) {
    const todos = this.getTodos();
    const idx = todos.findIndex(t => t.id === id);
    if (idx >= 0) {
      todos[idx] = { ...todos[idx], ...updates };
      this.saveTodos(todos);
    }
  },

  deleteTodo(id) {
    let todos = this.getTodos();
    todos = todos.filter(t => t.id !== id);
    this.saveTodos(todos);
  },

  getTasks() {
    const data = localStorage.getItem(this.KEY_TASKS);
    let list = [];
    try { list = data ? JSON.parse(data) : []; } catch (e) { list = []; }
    return list.map(t => ({
      id: t.id || 'task_' + Math.random().toString(36).slice(2, 10),
      name: t.name || '',
      categoryId: t.categoryId || '',
      estimatedMin: t.estimatedMin || 0,
      parentId: t.parentId || null,
      completed: !!t.completed,
      createdAt: t.createdAt || Date.now()
    }));
  },

  saveTasks(tasks) {
    localStorage.setItem(this.KEY_TASKS, JSON.stringify(tasks));
  },

  addTask(task) {
    const tasks = this.getTasks();
    tasks.push(task);
    this.saveTasks(tasks);
  },

  updateTask(id, updates) {
    const tasks = this.getTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...updates };
      this.saveTasks(tasks);
    }
  },

  deleteTask(id) {
    let tasks = this.getTasks();
    tasks = tasks.filter(t => t.id !== id);
    this.saveTasks(tasks);
  },

  getTaskMinutes(taskId) {
    const records = this.getRecords();
    let minutes = records.filter(r => r.taskId === taskId).reduce((s, r) => s + r.duration, 0);
    // 加上子任务的时间
    const children = this.getTasks().filter(t => t.parentId === taskId);
    children.forEach(c => {
      minutes += records.filter(r => r.taskId === c.id).reduce((s, r) => s + r.duration, 0);
    });
    return minutes;
  },

  getGoals() {
    const data = localStorage.getItem(this.KEY_GOALS);
    if (data) return JSON.parse(data);
    // 默认目标
    return [
      { id: 'goal_work', categoryId: 'work', targetMin: 480, period: 'daily', enabled: true },
      { id: 'goal_study', categoryId: 'study', targetMin: 120, period: 'daily', enabled: true }
    ];
  },

  saveGoals(goals) {
    localStorage.setItem(this.KEY_GOALS, JSON.stringify(goals));
  },

  getCategories() {
    const data = localStorage.getItem(this.KEY_CATEGORIES);
    if (data) return JSON.parse(data);
    // 默认分类体系
    return [
      { id: 'work', name: '工作', color: '#007AFF', activities: ['实验开展', '论文撰写', '报告撰写', '参加会议', '教学开展'] },
      { id: 'study', name: '学习', color: '#30D158', activities: ['文献阅读', '写作', '研究', '课程'] },
      { id: 'exercise', name: '锻炼', color: '#FF3B30', activities: ['跑步', '健身', '球类', '瑜伽', '其他运动'] },
      { id: 'rest', name: '休息', color: '#FF9F0A', activities: ['休息', '吃饭', '睡觉', '通勤'] },
      { id: 'entertainment', name: '娱乐', color: '#BF5AF2', activities: ['游戏', '视频', '音乐', '社交'] },
      { id: 'other', name: '其他', color: '#8E8E93', activities: ['其他'] }
    ];
  },

  saveCategories(categories) {
    localStorage.setItem(this.KEY_CATEGORIES, JSON.stringify(categories));
  },

  getCategoryById(id) {
    return this.getCategories().find(c => c.id === id) || null;
  },

  // 兼容旧数据：从app名查找所属分类
  getCategoryForApp(appName) {
    const cats = this.getCategories();
    for (const cat of cats) {
      if (cat.activities.includes(appName)) return cat;
    }
    return cats.find(c => c.id === 'other') || cats[0];
  },

  getPomoConfig() {
    const data = localStorage.getItem(this.KEY_POMO_CONFIG);
    if (data) return JSON.parse(data);
    return { workMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakInterval: 4 };
  },

  savePomoConfig(config) {
    localStorage.setItem(this.KEY_POMO_CONFIG, JSON.stringify(config));
  },

  getApps() {
    const data = localStorage.getItem(this.KEY_APPS);
    if (data) return JSON.parse(data);
    // 默认软件清单
    return ['微信', '钉钉', 'Word', 'Excel', 'PPT', '浏览器', '邮件', '会议', '其他'];
  },

  saveApps(apps) {
    localStorage.setItem(this.KEY_APPS, JSON.stringify(apps));
  },

  addApp(name) {
    const apps = this.getApps();
    if (!apps.includes(name)) {
      apps.push(name);
      this.saveApps(apps);
    }
    return apps;
  },

  removeApp(name) {
    let apps = this.getApps();
    apps = apps.filter(a => a !== name);
    this.saveApps(apps);
    return apps;
  },

  getRecords() {
    const data = localStorage.getItem(this.KEY_RECORDS);
    if (!data) return [];
    const records = JSON.parse(data);
    // 兼容旧数据：自动补充分类ID
    let changed = false;
    records.forEach(r => {
      if (!r.categoryId) {
        r.categoryId = this.getCategoryForApp(r.app).id;
        changed = true;
      }
      if (r.note === undefined) r.note = '';
    });
    if (changed) this.saveRecords(records);
    return records;
  },

  saveRecords(records) {
    localStorage.setItem(this.KEY_RECORDS, JSON.stringify(records));
  },

  addRecord(record) {
    const records = this.getRecords();
    records.unshift(record);
    this.saveRecords(records);
  },

  deleteRecord(id) {
    let records = this.getRecords();
    records = records.filter(r => r.id !== id);
    this.saveRecords(records);
  },

  clearRecords() {
    localStorage.removeItem(this.KEY_RECORDS);
  },

  getActiveTimer() {
    const data = localStorage.getItem(this.KEY_TIMER);
    return data ? JSON.parse(data) : null;
  },

  saveActiveTimer(timer) {
    if (timer) {
      localStorage.setItem(this.KEY_TIMER, JSON.stringify(timer));
    } else {
      localStorage.removeItem(this.KEY_TIMER);
    }
  }
};

// ---------- 全局状态 ----------
const state = {
  selectedApp: null,
  selectedCategory: null,
  selectedTaskId: null,
  selectedDuration: 30,
  timerMode: 'normal', // normal | pomodoro
  pomodoroCount: 0,
  pomodoroPhase: 'work', // work | break
  timerInterval: null,
  timerEndTime: null,
  timerTotalSeconds: 0,
  currentPage: 'timer',
  statOffset: 0
};

// ---------- 工具函数 ----------
function pad(n) { return n < 10 ? '0' + n : n; }

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return pad(m) + ':' + pad(s);
}

function formatDate(date) {
  const d = new Date(date);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatDateTime(date) {
  const d = new Date(date);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // 周日=7
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function showToast(msg, duration = 2000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
}

// ---------- 页面切换 ----------
function switchPage(pageName) {
  state.currentPage = pageName;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageName).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-page="' + pageName + '"]').classList.add('active');

  if (pageName === 'records') renderRecords();
  if (pageName === 'todo') renderTodoList();
  if (pageName === 'stats') renderStats('day');
  if (pageName === 'settings') renderSettingsApps();
}

// ---------- 计时页渲染 ----------
function renderAppSelector() {
  const catCards = document.getElementById('category-cards');
  const actTags = document.getElementById('activity-tags');
  const actSection = document.getElementById('activity-section');
  const categories = Storage.getCategories();

  catCards.innerHTML = '';
  categories.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'cat-card' + (cat.id === state.selectedCategory ? ' active' : '');
    card.style.setProperty('--card-color', cat.color);
    card.innerHTML = '<div class="cat-card-dot">' + cat.name.charAt(0) + '</div><div class="cat-card-name">' + escapeHtml(cat.name) + '</div>';
    card.onclick = () => onCategoryChange(cat.id);
    catCards.appendChild(card);
  });

  if (state.selectedCategory) {
    const cat = categories.find(c => c.id === state.selectedCategory);
    if (cat && cat.activities.length > 0) {
      actSection.style.display = '';
      actTags.innerHTML = '';
      if (!state.selectedApp) state.selectedApp = cat.activities[0];
      cat.activities.forEach(act => {
        const tag = document.createElement('div');
        tag.className = 'act-tag' + (act === state.selectedApp ? ' active' : '');
        tag.textContent = act;
        tag.onclick = () => onActivityChange(act);
        actTags.appendChild(tag);
      });
    } else {
      actSection.style.display = 'none';
    }
  } else {
    actSection.style.display = 'none';
  }

  renderTaskSelect();
}

function onCategoryChange(catId) {
  state.selectedCategory = catId;
  state.selectedApp = null;
  renderAppSelector();
}

function onActivityChange(act) {
  state.selectedApp = act;
  renderAppSelector();
}

function renderTaskSelect() {
  const taskSelect = document.getElementById('task-select');
  const tasks = Storage.getTasks().filter(t => !t.completed);
  taskSelect.innerHTML = '<option value="">不关联任务</option>';

  // 按父子关系组织
  const topLevel = tasks.filter(t => !t.parentId);
  const childrenMap = {};
  tasks.filter(t => t.parentId).forEach(t => {
    if (!childrenMap[t.parentId]) childrenMap[t.parentId] = [];
    childrenMap[t.parentId].push(t);
  });

  topLevel.forEach(task => {
    const opt = document.createElement('option');
    opt.value = task.id;
    const cat = Storage.getCategoryById(task.categoryId);
    const usedMin = Storage.getTaskMinutes(task.id);
    const progress = task.estimatedMin ? Math.round(usedMin / task.estimatedMin * 100) : 0;
    opt.textContent = task.name + ' (' + (cat ? cat.name : '') + ', ' + progress + '%)';
    if (task.id === state.selectedTaskId) opt.selected = true;
    taskSelect.appendChild(opt);

    // 子任务缩进
    (childrenMap[task.id] || []).forEach(child => {
      const copt = document.createElement('option');
      copt.value = child.id;
      const ccat = Storage.getCategoryById(child.categoryId);
      const cused = Storage.getTaskMinutes(child.id);
      const cprog = child.estimatedMin ? Math.round(cused / child.estimatedMin * 100) : 0;
      copt.textContent = '　└ ' + child.name + ' (' + (ccat ? ccat.name : '') + ', ' + cprog + '%)';
      if (child.id === state.selectedTaskId) copt.selected = true;
      taskSelect.appendChild(copt);
    });
  });
}

function updateTodaySummary() {
  const today = formatDate(new Date());
  const records = Storage.getRecords().filter(r => r.date === today);
  const totalMin = records.reduce((sum, r) => sum + r.duration, 0);
  document.getElementById('today-count').textContent = records.length;
  document.getElementById('today-minutes').textContent = totalMin;
}

function updateDateDisplay() {
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  document.getElementById('today-date').textContent =
    now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + weekdays[now.getDay()];
}

// ---------- 计时器逻辑 ----------
function lockScreen() {
  try {
    if (window.AndroidLock) { window.AndroidLock.start(); }
  } catch(e) {}
  // 禁用底部导航
  document.querySelectorAll('.nav-item').forEach(item => item.classList.add('nav-disabled'));
  // 锁定提示只显示一次
  var lockNotice = document.querySelector('.timer-lock-notice');
  if (lockNotice) {
    if (localStorage.getItem('lock_notice_shown')) {
      lockNotice.style.display = 'none';
    } else {
      lockNotice.style.display = '';
      localStorage.setItem('lock_notice_shown', '1');
    }
  }
}

function unlockScreen() {
  try {
    if (window.AndroidLock) { window.AndroidLock.stop(); }
  } catch(e) {}
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('nav-disabled'));
}

function startTimer(app, durationMin, mode) {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch(e) {}
  mode = mode || state.timerMode;
  const isCountup = !durationMin || durationMin <= 0;
  const totalSeconds = isCountup ? 0 : durationMin * 60;
  const endTime = isCountup ? 0 : Date.now() + totalSeconds * 1000;
  const timerData = {
    app: app,
    duration: durationMin,
    duration: durationMin || 0,
    taskId: state.selectedTaskId,
    isCountup: isCountup,
    pomodoroCount: mode === 'pomodoro' ? 1 : 0,
    pomodoroPhase: 'work',
    startTime: new Date().toISOString(),
    endTimestamp: endTime
  };
  Storage.saveActiveTimer(timerData);

  // 锁定屏幕，防止跳转
  lockScreen();

  state.timerEndTime = endTime;
  state.timerTotalSeconds = totalSeconds;
  state.timerMode = mode;
  state.isCountup = isCountup;
  state.pomodoroCount = timerData.pomodoroCount;
  state.pomodoroPhase = 'work';

  document.getElementById('timer-setup').classList.add('hidden');
  document.getElementById('timer-running').classList.remove('hidden');
  document.getElementById('timer-app-name').textContent = app;
  const initM = Math.floor(totalSeconds / 60); const initS = totalSeconds % 60; document.getElementById('timer-time').textContent = (initM < 10 ? '0' + initM : initM) + ':' + (initS < 10 ? '0' + initS : initS);

  // 番茄状态显示
  const pomoStatus = document.getElementById('pomodoro-status');
  if (mode === 'pomodoro') {
    pomoStatus.classList.remove('hidden');
    document.getElementById('pomo-count').textContent = '1';
    document.getElementById('pomo-phase').textContent = '工作中';
    pomoStatus.classList.remove('break-mode');
  } else {
    pomoStatus.classList.add('hidden');
  }
  document.getElementById('btn-skip-break').classList.add('hidden');

  // 请求通知权限
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  tickTimer();
  state.timerInterval = setInterval(tickTimer, 1000);
}

function tickTimer() {
  let displaySeconds;
  if (state.isCountup) {
    const timerData = Storage.getActiveTimer();
    displaySeconds = timerData ? Math.max(0, Math.round((Date.now() - new Date(timerData.startTime).getTime()) / 1000)) : 0;
    // 正向计时默认25分钟自动停下并震动
    if (displaySeconds >= 25 * 60) {
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
      NativeNotify.send('25分钟到了', '已自动停止计时');
      finishTimer(false);
      return;
    }
  } else {
    displaySeconds = Math.max(0, Math.round((Number(state.timerEndTime) - Date.now()) / 1000));
  }
  const tm = Math.floor(displaySeconds / 60); const ts = displaySeconds % 60; document.getElementById('timer-time').textContent = (tm < 10 ? '0' + tm : tm) + ':' + (ts < 10 ? '0' + ts : ts);
  

  // 更新圆环（正向计时不显示进度）
  if (!state.isCountup) {
    const progress = displaySeconds / state.timerTotalSeconds;
    const circumference = 2 * Math.PI * 90;
    document.getElementById('timer-progress').style.strokeDashoffset = circumference * (1 - progress);
  } else {
    document.getElementById('timer-progress').style.strokeDashoffset = 0;
  }

  if (!state.isCountup && displaySeconds <= 0) {
    handleTimerComplete();
  }
}

function handleTimerComplete() {
  const timerData = Storage.getActiveTimer();
  if (!timerData) return;

  if (timerData.mode === 'pomodoro') {
    if (timerData.pomodoroPhase === 'work') {
      // 工作阶段结束：记录并进入休息
      recordPomodoroWork(timerData);
      startBreakPhase(timerData);
    } else {
      // 休息阶段结束：进入下一个工作
      startNextWorkPhase(timerData);
    }
  } else {
    finishTimer(true);
  }
}

function recordPomodoroWork(timerData) {
  const record = {
    id: Date.now().toString(),
    app: timerData.app,
    categoryId: Storage.getCategoryForApp(timerData.app).id,
    taskId: timerData.taskId || null,
    duration: timerData.duration,
    isPomodoro: true,
    pomodoroNumber: timerData.pomodoroCount,
    note: '',
    startTime: timerData.startTime,
    endTime: new Date().toISOString(),
    date: formatDate(new Date())
  };
  Storage.addRecord(record);
  updateTodaySummary();
}

function startBreakPhase(timerData) {
  const config = Storage.getPomoConfig();
  const isLongBreak = timerData.pomodoroCount % config.longBreakInterval === 0;
  const breakMin = isLongBreak ? config.longBreakMin : config.shortBreakMin;
  const totalSeconds = breakMin * 60;
  const endTime = Date.now() + totalSeconds * 1000;

  const newTimerData = {
    app: timerData.app,
    duration: breakMin,
    mode: 'pomodoro',
    pomodoroCount: timerData.pomodoroCount,
    pomodoroPhase: 'break',
    isLongBreak: isLongBreak,
    startTime: new Date().toISOString(),
    endTimestamp: endTime
  };
  Storage.saveActiveTimer(newTimerData);

  state.timerEndTime = endTime;
  state.timerTotalSeconds = totalSeconds;
  state.pomodoroPhase = 'break';

  // 更新UI
  document.getElementById('pomo-phase').textContent = isLongBreak ? '长休息中' : '休息中';
  document.getElementById('pomodoro-status').classList.add('break-mode');
  document.getElementById('timer-app-name').textContent = timerData.app + ' · 休息';
  document.getElementById('btn-skip-break').classList.remove('hidden');
  document.getElementById('btn-finish').textContent = '结束番茄钟';

  // 通知
  NativeNotify.send('工作结束，休息一下！', (isLongBreak ? '长休息' : '短休息') + ' ' + breakMin + ' 分钟');
  playAlertSound();
  triggerVibrate();
  showToast('工作完成，开始休息');
}

function startNextWorkPhase(timerData) {
  const config = Storage.getPomoConfig();
  const nextCount = timerData.pomodoroCount + 1;
  const totalSeconds = config.workMin * 60;
  const endTime = Date.now() + totalSeconds * 1000;

  const newTimerData = {
    app: timerData.app,
    duration: config.workMin,
    mode: 'pomodoro',
    pomodoroCount: nextCount,
    pomodoroPhase: 'work',
    startTime: new Date().toISOString(),
    endTimestamp: endTime
  };
  Storage.saveActiveTimer(newTimerData);

  state.timerEndTime = endTime;
  state.timerTotalSeconds = totalSeconds;
  state.pomodoroCount = nextCount;
  state.pomodoroPhase = 'work';

  // 更新UI
  document.getElementById('pomo-phase').textContent = '工作中';
  document.getElementById('pomo-count').textContent = nextCount;
  document.getElementById('pomodoro-status').classList.remove('break-mode');
  document.getElementById('timer-app-name').textContent = timerData.app;
  document.getElementById('btn-skip-break').classList.add('hidden');
  document.getElementById('btn-finish').textContent = '结束计时';

  NativeNotify.send('休息结束，开始第 ' + nextCount + ' 个番茄', timerData.app + ' · ' + config.workMin + ' 分钟');
  playAlertSound();
  triggerVibrate();
  showToast('开始第 ' + nextCount + ' 个番茄');
}

function skipBreak() {
  const timerData = Storage.getActiveTimer();
  if (!timerData || timerData.pomodoroPhase !== 'break') return;
  // 直接进入下一个工作阶段
  startNextWorkPhase(timerData);
}

function finishTimer(autoEnded) {
  unlockScreen();
  clearInterval(state.timerInterval);
  const timerData = Storage.getActiveTimer();
  if (!timerData) return;

  // 番茄钟休息阶段结束不记录
  if (timerData.mode === 'pomodoro' && timerData.pomodoroPhase === 'break') {
    Storage.saveActiveTimer(null);
    showToast('番茄钟已结束');
    resetTimerUI();
    return;
  }

  // 计算实际时长
  let actualDuration;
  if (autoEnded) {
    actualDuration = timerData.duration;
  } else {
    const elapsed = Math.round((Date.now() - new Date(timerData.startTime).getTime()) / 60000);
    actualDuration = Math.max(1, elapsed);
  }

  const record = {
    id: Date.now().toString(),
    app: timerData.app,
    categoryId: Storage.getCategoryForApp(timerData.app).id,
    taskId: timerData.taskId || null,
    duration: actualDuration,
    isPomodoro: timerData.mode === 'pomodoro',
    pomodoroNumber: timerData.pomodoroCount,
    note: '',
    startTime: timerData.startTime,
    endTime: new Date().toISOString(),
    date: formatDate(new Date())
  };
  Storage.addRecord(record);
  Storage.saveActiveTimer(null);

  NativeNotify.send('计时结束', timerData.app + ' 共 ' + actualDuration + ' 分钟');
  playAlertSound();
  triggerVibrate();
  showToast(autoEnded ? '时间到！已记录' : '已结束计时');

  resetTimerUI();
  updateTodaySummary();
}

function cancelTimer() {
  unlockScreen();
  clearInterval(state.timerInterval);
  Storage.saveActiveTimer(null);
  resetTimerUI();
  showToast('已取消');
}

function resetTimerUI() {
  document.getElementById('timer-running').classList.add('hidden');
  document.getElementById('timer-setup').classList.remove('hidden');
  document.getElementById('timer-time').textContent = '00:00';
  document.getElementById('timer-progress').style.strokeDashoffset = 0;
  document.getElementById('pomodoro-status').classList.add('hidden');
  document.getElementById('pomodoro-status').classList.remove('break-mode');
  document.getElementById('btn-skip-break').classList.add('hidden');
  document.getElementById('btn-finish').textContent = '结束计时';
  state.selectedApp = null;
  state.selectedCategory = null;
  state.selectedTaskId = null;
  state.selectedDuration = 30;
  state.timerMode = 'normal';
  state.pomodoroCount = 0;
  state.pomodoroPhase = 'work';
  document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('.dur-btn[data-min="30"]').classList.add('selected');
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.mode-btn[data-mode="normal"]').classList.add('active');
  document.getElementById('custom-min').value = '';
  state.selectedCategory = null;
  state.selectedApp = null;
  document.getElementById('task-select').value = '';
  renderAppSelector();
}

function restoreTimerIfRunning() {
  const timerData = Storage.getActiveTimer();
  if (!timerData) return;

  const isCountup = timerData.isCountup || !timerData.endTimestamp || timerData.endTimestamp <= 0;
  if (!isCountup) {
    const remaining = Math.max(0, Math.round((timerData.endTimestamp - Date.now()) / 1000));
    if (remaining <= 0) {
      handleTimerComplete();
      return;
    }
  }
  if (remaining <= 0) {
    handleTimerComplete();
    return;
  }

  state.timerEndTime = timerData.endTimestamp;
  state.timerEndTime = timerData.endTimestamp || 0;
  state.timerTotalSeconds = (timerData.duration || 0) * 60;
  state.timerMode = timerData.mode || 'normal';
  state.isCountup = isCountup;
  state.timerMode = timerData.mode || 'normal';
  state.pomodoroCount = timerData.pomodoroCount || 0;
  state.pomodoroPhase = timerData.pomodoroPhase || 'work';

  document.getElementById('timer-setup').classList.add('hidden');
  document.getElementById('timer-running').classList.remove('hidden');
  document.getElementById('timer-app-name').textContent = timerData.app;

  // 恢复番茄状态
  const pomoStatus = document.getElementById('pomodoro-status');
  if (timerData.mode === 'pomodoro') {
    pomoStatus.classList.remove('hidden');
    document.getElementById('pomo-count').textContent = timerData.pomodoroCount;
    if (timerData.pomodoroPhase === 'break') {
      document.getElementById('pomo-phase').textContent = timerData.isLongBreak ? '长休息中' : '休息中';
      pomoStatus.classList.add('break-mode');
      document.getElementById('btn-skip-break').classList.remove('hidden');
      document.getElementById('btn-finish').textContent = '结束番茄钟';
    } else {
      document.getElementById('pomo-phase').textContent = '工作中';
      pomoStatus.classList.remove('break-mode');
    }
  } else {
    pomoStatus.classList.add('hidden');
  }

  tickTimer();
  state.timerInterval = setInterval(tickTimer, 1000);
}

// ---------- 记录页（时间线） ----------
let editingRecordId = null;

function renderRecords() {
  const container = document.getElementById('records-list');
  const records = Storage.getRecords();
  const today = formatDate(new Date());

  if (records.length === 0) {
    container.innerHTML = '<p class="empty-tip">暂无记录，去计时页开始吧</p>';
    return;
  }

  const groups = {};
  records.forEach(r => {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });

  container.innerHTML = '';
  Object.keys(groups).sort().reverse().forEach(date => {
    const dayRecords = groups[date].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const dayTotal = dayRecords.reduce((s, r) => s + r.duration, 0);

    const groupDiv = document.createElement('div');
    groupDiv.className = 'timeline-day-group';

    const header = document.createElement('div');
    header.className = 'timeline-day-header';
    header.innerHTML = '<span>' + date + '</span><span class="timeline-day-total">' + dayTotal + ' 分钟</span>';
    groupDiv.appendChild(header);

    // 区间时间轴
    const track = document.createElement('div');
    track.className = 'timeline-track';

    let prevEnd = null;
    dayRecords.forEach((r, idx) => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);

      // 空白区间
      if (prevEnd) {
        const gapStart = new Date(prevEnd);
        const gapEnd = new Date(start);
        const gapMin = Math.round((gapEnd - gapStart) / 60000);
        if (gapMin >= 15) {
          const gapBar = document.createElement('div');
          gapBar.className = 'timeline-gap-bar';
          gapBar.innerHTML =
            '<div class="tgb-time">' + formatTime(gapStart) + ' - ' + formatTime(gapEnd) + '</div>' +
            '<div class="tgb-label">未记录 ' + gapMin + ' 分钟 · 点击补录</div>';
          gapBar.onclick = () => { openQuickRecordModal(gapStart, gapEnd); };
          track.appendChild(gapBar);
        }
      }
      prevEnd = end;

      // 记录区间条
      const cat = Storage.getCategoryById(r.categoryId) || { color: '#8E8E93', name: '其他' };
      const task = r.taskId ? Storage.getTasks().find(t => t.id === r.taskId) : null;
      const bar = document.createElement('div');
      bar.className = 'timeline-record-bar';
      bar.style.setProperty('--cat-color', cat.color);
      bar.style.borderLeftColor = cat.color;
      const barH = Math.max(50, Math.min(150, 48 + r.duration * 0.6));
      bar.style.minHeight = barH + 'px';
      bar.style.display = 'flex';
      bar.style.flexDirection = 'column';
      bar.style.justifyContent = 'center';
      bar.innerHTML =
        '<div class="trb-top">' +
          '<span class="trb-app">' + escapeHtml(r.app) + (r.isPomodoro ? ' [番茄]' : '') + '</span>' +
          '<span class="trb-dur">' + r.duration + '分</span>' +
        '</div>' +
        '<div class="trb-bottom">' +
          '<span class="trb-time">' + formatTime(start) + ' → ' + formatTime(end) + '</span>' +
          '<span class="trb-cat">' + cat.name + '</span>' +
        '</div>' +
        (task ? '<div class="trb-task">[任务] ' + escapeHtml(task.name) + '</div>' : '') +
        (r.note ? '<div class="trb-note">' + escapeHtml(r.note) + '</div>' : '');
      bar.onclick = () => openRecordModal(r);
      track.appendChild(bar);
    });

    
    // 鏈€鍚庝竴鏉¤褰曞埌褰撳墠鏃堕棿鐨勫尯闂达紙浠呬粖澶╋級
    if (date === today && prevEnd) {
      var now = new Date();
      var gapMin = Math.round((now - prevEnd) / 60000);
      if (gapMin >= 5) {
        var gapBar = document.createElement('div');
        gapBar.className = 'timeline-gap-bar timeline-now-gap';
        gapBar.innerHTML =
          '<div class="tgb-time">' + formatTime(prevEnd) + ' - 鐜板湪</div>' +
          '<div class="tgb-label">鏈褰?' + gapMin + ' 鍒嗛挓 路 鐐瑰嚮琛ュ綍</div>';
        gapBar.onclick = function() { openQuickRecordModal(prevEnd, new Date()); };
        track.appendChild(gapBar);
      }
    }
    groupDiv.appendChild(track);
    container.appendChild(groupDiv);
  });
}


// ---------- 快速补录（任务选择） ----------
let quickRecordStart = null;
let quickRecordEnd = null;

function openQuickRecordModal(start, end) {
  quickRecordStart = start;
  quickRecordEnd = end;
  document.getElementById('quick-record-time').textContent =
    formatDate(start) + ' ' + formatTime(start) + ' - ' + formatTime(end);
  const list = document.getElementById('quick-record-list');
  const tasks = Storage.getTasks().filter(t => !t.completed);
  const todos = Storage.getTodos().filter(t => !t.completed && !t.parentId);

  let html = '';
  // 分类活动（始终显示在最前面）
  var allCats = Storage.getCategories();
  html += '<div style="font-size:12px;color:var(--text-secondary);padding:4px 0;font-weight:600;">分类活动</div>';
  allCats.forEach(function(cat) {
    (cat.activities || []).forEach(function(act) {
      html += '<div class="quick-record-item" data-type="activity" data-catid="' + cat.id + '" data-actname="' + act.replace(/"/g, '&quot;') + '">' +
        '<div class="quick-record-bar" style="background:' + cat.color + '"></div>' +
        '<div class="quick-record-info">' +
          '<div class="quick-record-name">' + act + '</div>' +
          '<div class="quick-record-meta">' + cat.name + '</div>' +
        '</div>' +
      '</div>';
    });
  });
  if (tasks.length > 0) {
      html += '<div style="font-size:12px;color:var(--text-secondary);padding:4px 0;font-weight:600;">任务</div>';
      tasks.forEach(task => {
        const cat = Storage.getCategoryById(task.categoryId) || { color: '#8E8E93', name: '其他' };
        html += '<div class="quick-record-item" data-type="task" data-id="' + task.id + '">' +
          '<div class="quick-record-bar" style="background:' + cat.color + '"></div>' +
          '<div class="quick-record-info">' +
            '<div class="quick-record-name">' + escapeHtml(task.name) + '</div>' +
            '<div class="quick-record-meta">' + cat.name + (task.estimatedMin ? ' · 预计' + task.estimatedMin + '分' : '') + '</div>' +
          '</div>' +
        '</div>';
      });
    }
    if (todos.length > 0) {
      html += '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0 4px;font-weight:600;">待办</div>';
      todos.forEach(todo => {
        const cat = Storage.getCategoryById(todo.categoryId) || { color: '#8E8E93', name: '其他' };
        html += '<div class="quick-record-item" data-type="todo" data-id="' + todo.id + '">' +
          '<div class="quick-record-bar" style="background:' + cat.color + '"></div>' +
          '<div class="quick-record-info">' +
            '<div class="quick-record-name">' + escapeHtml(todo.title) + '</div>' +
            '<div class="quick-record-meta">' + cat.name + (todo.dueTime ? ' · ' + todo.dueTime : '') + '</div>' +
          '</div>' +
        '</div>';
      });
    }
  list.innerHTML = html;

  list.querySelectorAll('.quick-record-item').forEach(item => {
    item.onclick = () => {
      const type = item.dataset.type;
      if (type === 'activity') {
        saveQuickRecord('activity', item.dataset.catid, item.dataset.actname);
      } else {
        saveQuickRecord(type, item.dataset.id);
      }
    };
  });

  document.getElementById('quick-record-modal').classList.remove('hidden');
}

function saveQuickRecord(type, id, actName) {
  if (!quickRecordStart || !quickRecordEnd) return;
  let categoryId, app, taskId = null;

  if (type === 'activity') {
    categoryId = id;
    app = actName || '';
  } else if (type === 'task') {
    const task = Storage.getTasks().find(t => t.id === id);
    if (!task) return;
    categoryId = task.categoryId;
    taskId = task.id;
    const cat = Storage.getCategoryById(categoryId);
    app = cat && cat.activities.length > 0 ? cat.activities[0] : task.name;
  } else {
    const todo = Storage.getTodos().find(t => t.id === id);
    if (!todo) return;
    categoryId = todo.categoryId;
    const cat = Storage.getCategoryById(categoryId);
    app = cat && cat.activities.length > 0 ? cat.activities[0] : todo.title;
  }

  const duration = Math.round((quickRecordEnd - quickRecordStart) / 60000);
  if (duration < 1) { showToast('时间间隔太短'); return; }

  const record = {
    id: Date.now().toString(),
    app, categoryId, taskId,
    duration, note: '',
    isPomodoro: false, pomodoroNumber: 0,
    startTime: quickRecordStart.toISOString(),
    endTime: quickRecordEnd.toISOString(),
    date: formatDate(quickRecordStart)
  };
  Storage.addRecord(record);

  closeQuickRecordModal(); renderStats(currentStatPeriod); updateTodaySummary();
  showToast('已补录 ' + duration + ' 分钟');
}

function closeQuickRecordModal() {
  document.getElementById('quick-record-modal').classList.add('hidden');
  quickRecordStart = null;
  quickRecordEnd = null;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function openRecordModal(record, presetStart, presetEnd) {
  editingRecordId = record ? record.id : null;
  document.getElementById('modal-title').textContent = record ? '编辑记录' : '补录记录';

  // 填充分类下拉
  const catSelect = document.getElementById('modal-category');
  const categories = Storage.getCategories();
  catSelect.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSelect.appendChild(opt);
  });

  if (record) {
    catSelect.value = record.categoryId || Storage.getCategoryForApp(record.app).id;
    document.getElementById('modal-app').value = record.app;
    document.getElementById('modal-date').value = record.date;
    document.getElementById('modal-start').value = formatTime(record.startTime);
    document.getElementById('modal-end').value = formatTime(record.endTime);
    document.getElementById('modal-note').value = record.note || '';
  } else if (presetStart && presetEnd) {
    catSelect.value = 'work';
    document.getElementById('modal-app').value = '';
    document.getElementById('modal-date').value = formatDate(presetStart);
    document.getElementById('modal-start').value = formatTime(presetStart);
    document.getElementById('modal-end').value = formatTime(presetEnd);
    document.getElementById('modal-note').value = '';
  } else {
    const now = new Date();
    catSelect.value = 'work';
    document.getElementById('modal-app').value = '';
    document.getElementById('modal-date').value = formatDate(now);
    document.getElementById('modal-start').value = formatTime(now);
    const end = new Date(now.getTime() + 30 * 60000);
    document.getElementById('modal-end').value = formatTime(end);
    document.getElementById('modal-note').value = '';
  }

  document.getElementById('record-modal').classList.remove('hidden');
}

function closeRecordModal() {
  document.getElementById('record-modal').classList.add('hidden');
  editingRecordId = null;
}

function saveRecord() {
  const categoryId = document.getElementById('modal-category').value;
  const app = document.getElementById('modal-app').value.trim();
  const date = document.getElementById('modal-date').value;
  const startTime = document.getElementById('modal-start').value;
  const endTime = document.getElementById('modal-end').value;
  const note = document.getElementById('modal-note').value.trim();

  if (!app) { showToast('请输入活动名称'); return; }
  if (!startTime || !endTime) { showToast('请选择时间'); return; }

  const start = new Date(date + 'T' + startTime);
  const end = new Date(date + 'T' + endTime);
  if (end <= start) { showToast('结束时间必须晚于开始时间'); return; }

  const duration = Math.round((end - start) / 60000);

  if (editingRecordId) {
    // 编辑
    let records = Storage.getRecords();
    const idx = records.findIndex(r => r.id === editingRecordId);
    if (idx >= 0) {
      records[idx] = {
        ...records[idx],
        app, categoryId, duration, note,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        date
      };
      Storage.saveRecords(records);
    }
    showToast('已更新');
  } else {
    // 新增
    const record = {
      id: Date.now().toString(),
      app, categoryId, duration, note,
      isPomodoro: false,
      pomodoroNumber: 0,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      date
    };
    Storage.addRecord(record);
    showToast('已添加');
  }

  closeRecordModal();
  renderRecords();
  updateTodaySummary();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- 统计页 ----------
let currentStatPeriod = 'day';
const APP_VERSION = 'v6.5.5';

function renderStats(period) {
  currentStatPeriod = period;
  document.querySelectorAll('.stat-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.period === period);
  });

  const records = Storage.getRecords();
  const now = new Date();
  const today = formatDate(now);
  // 根据偏移量计算目标日期
  let targetDate = new Date(now);
  let dateLabel = '今天';
  if (typeof state.statOffset !== 'number' || isNaN(state.statOffset)) state.statOffset = 0;
  if (period === 'day') {
    targetDate.setDate(now.getDate() + state.statOffset);
    if (state.statOffset === 0) dateLabel = '今天';
    else if (state.statOffset === -1) dateLabel = '昨天';
    else if (state.statOffset === 1) dateLabel = '明天';
    else dateLabel = formatDate(targetDate);
  } else if (period === 'week') {
    targetDate.setDate(now.getDate() + state.statOffset * 7);
    const monday = new Date(targetDate);
    const dow = targetDate.getDay();
    monday.setDate(targetDate.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    dateLabel = (monday.getMonth()+1) + '/' + monday.getDate() + ' - ' + (sunday.getMonth()+1) + '/' + sunday.getDate();
  } else if (period === 'month') {
    targetDate.setMonth(now.getMonth() + state.statOffset);
    dateLabel = targetDate.getFullYear() + '年' + (targetDate.getMonth()+1) + '月';
  }
  const labelEl = document.getElementById('stat-date-label');
  if (labelEl) labelEl.textContent = dateLabel;
  const targetDateStr = formatDate(targetDate);

  // 通用：显示所有section
  ['cs-goal','cs-task','cs-trend','cs-pie','cs-event','cs-records'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  if (period === 'day') {
    const dayRecords = records.filter(r => r.date === targetDateStr).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    const totalMin = dayRecords.reduce((s, r) => s + (Number(r.duration) || 0), 0);
    const pomoCount = dayRecords.filter(r => r.isPomodoro).length;

    document.getElementById('stat-total').textContent = totalMin;
    document.getElementById('stat-count').textContent = dayRecords.length;
    document.getElementById('stat-pomo').textContent = pomoCount;
    document.getElementById('stat-avg').textContent = dayRecords.length > 0 ? Math.round((Number(totalMin) || 0) / dayRecords.length) : 0;

    // 隐藏趋势图，显示分类占比
    document.getElementById('cs-trend').style.display = 'none';

    // 分类占比
    renderPieChart(dayRecords);

    // 事件统计
    renderEventStats(dayRecords);

    // 目标进度
    renderGoalProgress(targetDateStr);
    renderTaskProgressStats(targetDateStr);

    // 详细记录（倒序：最新的在上面）
    renderStatsRecords(dayRecords.slice().reverse(), today, true);
    return;
  }

  if (period === 'week') {
    const weekBase = new Date(targetDate);
    const dayOfWeek = weekBase.getDay();
    const monday = new Date(weekBase);
    monday.setDate(weekBase.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekNames = ['周日','周一','周二','周三','周四','周五','周六'];

    let weekTotal = 0, weekCount = 0, weekPomo = 0;
    const dayData = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDate(d);
      const dr = records.filter(r => r.date === dateStr);
      const dt = dr.reduce((s, r) => s + (Number(r.duration) || 0), 0);
      weekTotal += dt;
      weekCount += dr.length;
      weekPomo += dr.filter(r => r.isPomodoro).length;
      dayData.push({ name: weekNames[d.getDay()], date: (d.getMonth()+1)+'/'+d.getDate(), records: dr, total: dt, isToday: dateStr === today });
    }

    document.getElementById('stat-total').textContent = weekTotal;
    document.getElementById('stat-count').textContent = weekCount;
    document.getElementById('stat-pomo').textContent = weekPomo;
    document.getElementById('stat-avg').textContent = weekCount > 0 ? Math.round((Number(weekTotal) || 0) / weekCount) : 0;

    // 隐藏目标和任务进度，显示趋势图
    document.getElementById('cs-goal').style.display = 'none';
    document.getElementById('cs-task').style.display = 'none';
    document.getElementById('cs-pie').style.display = 'none';
    document.getElementById('cs-event').style.display = 'none';

    // 周柱状图
    const trendEl = document.getElementById('cs-trend');
    trendEl.innerHTML = '<h3>本周每日时长</h3><canvas id="trend-chart" width="340" height="180"></canvas>';
    drawBarChart(dayData.map(d => ({label: d.name, value: d.total})));

    // 计划建议
    renderWeekAdvice(dayData, weekTotal);

    // 本周记录（倒序）
    const allWeekRecords = dayData.filter(d => d.records.length > 0).flatMap(d => d.records).sort((a,b) => new Date(b.startTime) - new Date(a.startTime));
    renderStatsRecords(allWeekRecords, null);
    return;
  }

  // 月视图
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const weeksInMonth = Math.ceil((startWeekday + daysInMonth) / 7);

  let monthTotal = 0, monthCount = 0, monthPomo = 0;
  const weekData = [];
  for (let w = 0; w < weeksInMonth; w++) {
    const weekStartDay = w * 7 - startWeekday + 1;
    const weekEndDay = Math.min(weekStartDay + 6, daysInMonth);
    if (weekStartDay > daysInMonth) break;
    const ws = Math.max(1, weekStartDay);
    let wt = 0, wc = 0, wp = 0;
    for (let day = ws; day <= weekEndDay; day++) {
      const dateStr = year + '-' + pad(month + 1) + '-' + pad(day);
      const dr = records.filter(r => r.date === dateStr);
      wt += dr.reduce((s, r) => s + r.duration, 0);
      wc += dr.length;
      wp += dr.filter(r => r.isPomodoro).length;
    }
    monthTotal += wt;
    monthCount += wc;
    monthPomo += wp;
    weekData.push({ label: '第' + (w + 1) + '周', value: wt, count: wc });
  }

  document.getElementById('stat-total').textContent = monthTotal;
  document.getElementById('stat-count').textContent = monthCount;
  document.getElementById('stat-pomo').textContent = monthPomo;
  document.getElementById('stat-avg').textContent = monthCount > 0 ? Math.round((Number(monthTotal) || 0) / monthCount) : 0;

  document.getElementById('cs-goal').style.display = 'none';
  document.getElementById('cs-task').style.display = 'none';
  document.getElementById('cs-pie').style.display = 'none';
  document.getElementById('cs-event').style.display = 'none';

  const trendEl = document.getElementById('cs-trend');
  trendEl.innerHTML = '<h3>本月各周时长</h3><canvas id="trend-chart" width="340" height="180"></canvas>';
  drawBarChart(weekData);

  // 月计划建议
  renderMonthAdvice(weekData, monthTotal);

  // 本月记录（倒序，最近的20条）
  const monthRecords = records.filter(r => {
    const d = new Date(r.startTime);
    return d.getFullYear() === year && d.getMonth() === month;
  }).sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 30);
  renderStatsRecords(monthRecords, null);
}

// 渲染统计页的记录列表（倒序）
function renderStatsRecords(records, dateFilter, showAdd) {
  const container = document.getElementById('stats-records-list');
  if (!container) return;
  let html = '';
  
  if (records.length === 0) {
    if (showAdd) {
      html += '<div class="record-gap" data-start="0" data-end="1440">+ 点击补录今日记录</div>';
    } else {
      html += '<p class="empty-tip">暂无记录</p>';
    }
    container.innerHTML = html;
    if (showAdd) {
      container.querySelector('.record-gap').onclick = () => {
        const now = new Date();
        const start = new Date(now.getTime() - 3600000);
        openQuickRecordModal(start, now);
      };
    }
    return;
  }
  
  // 补录按钮（始终显示在顶部）
  if (showAdd) {
    html += '<div class="stats-add-btn" id="stats-add-record-top">+ 补录记录</div>';
  }
  
  // 按开始时间排序（正序，最早的在前面）
  const sorted = records.slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const dayStart = new Date(sorted[0].startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 0, 0);
  const now = new Date();
  const isToday = formatDate(now) === formatDate(dayStart);
  
  let prevEnd = dayStart.getTime();
  
  sorted.forEach((r, idx) => {
    const rStart = new Date(r.startTime).getTime();
    const rEnd = new Date(r.endTime).getTime();
    
    // 显示空白区间
    const gapMin = Math.round((rStart - prevEnd) / 60000);
    if (gapMin >= 15) {
      const gapH = Math.min(120, Math.max(40, gapMin * 0.8));
      html += '<div class="record-gap" data-start="' + prevEnd + '" data-end="' + rStart + '" style="min-height:' + gapH + 'px">' +
        '+ 空白 ' + gapMin + '分钟，点击补录</div>';
    }
    
    // 显示记录
    const cat = Storage.getCategoryById(r.categoryId) || { color: '#8E8E93', name: '其他' };
    const start = new Date(r.startTime);
    const end = new Date(r.endTime);
    const dateStr = dateFilter ? '' : formatDate(start) + ' ';
    const dur = Number(r.duration) || 0;
    let itemH = 60;
    if (dur >= 60) itemH = 100;
    else if (dur >= 30) itemH = 80;
    
    html += '<div class="stats-record-item" data-id="' + r.id + '" style="min-height:' + itemH + 'px">' +
      '<div class="sri-bar" style="background:' + cat.color + '"></div>' +
      '<div class="sri-content">' +
        '<div class="sri-top">' +
          '<span class="sri-name">' + escapeHtml(r.app) + (r.isPomodoro ? ' [番茄]' : '') + '</span>' +
          '<span class="sri-dur">' + dur + '分</span>' +
        '</div>' +
        '<div class="sri-bottom">' +
          '<span class="sri-time">' + dateStr + formatTime(start) + '-' + formatTime(end) + '</span>' +
          '<span class="sri-cat">' + cat.name + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
    
    prevEnd = Math.max(prevEnd, rEnd);
  });
  
  // 最后一条记录到现在的区间（如果是今天）
  if (isToday && showAdd) {
    const nowTime = now.getTime();
    const gapMin = Math.round((nowTime - prevEnd) / 60000);
    if (gapMin >= 5) {
      const gapH = Math.min(120, Math.max(40, gapMin * 0.8));
      html += '<div class="record-gap record-gap-now" data-start="' + prevEnd + '" data-end="' + nowTime + '" style="min-height:' + gapH + 'px">' +
        '现在 · 已过去 ' + gapMin + '分钟，点击补录</div>';
    }
  }
  
  container.innerHTML = html;
  
  // 点击记录编辑
  container.querySelectorAll('.stats-record-item').forEach(item => {
    item.onclick = () => {
      const rec = Storage.getRecords().find(r => r.id === item.dataset.id);
      if (rec) openRecordModal(rec);
    };
  });
  
  // 顶部补录按钮
  const addBtnTop = document.getElementById('stats-add-record-top');
  if (addBtnTop) {
    addBtnTop.onclick = () => {
      const now = new Date();
      const start = new Date(now.getTime() - 3600000);
      openQuickRecordModal(start, now);
    };
  }
  
  // 点击空白区间补录
  container.querySelectorAll('.record-gap').forEach(gap => {
    gap.onclick = () => {
      const start = new Date(parseInt(gap.dataset.start));
      const end = new Date(parseInt(gap.dataset.end));
      // 如果空白区间太长，默认补录中间1小时
      if ((end - start) > 3600000 * 2) {
        const mid = new Date((start.getTime() + end.getTime()) / 2);
        openQuickRecordModal(new Date(mid.getTime() - 1800000), new Date(mid.getTime() + 1800000));
      } else {
        openQuickRecordModal(start, end);
      }
    };
  });
}

// 按事件统计（区分循环事件和单次任务）
function renderEventStats(dayRecords) {
  const container = document.getElementById('event-stats-list');
  if (!container) return;
  if (dayRecords.length === 0) {
    container.innerHTML = '<p class="empty-tip">暂无记录</p>';
    return;
  }
  const cats = Storage.getCategories();
  // 收集所有活动名称
  const eventMap = {};
  dayRecords.forEach(r => {
    const key = r.categoryId + '||' + r.app;
    if (!eventMap[key]) {
      eventMap[key] = { name: r.app, categoryId: r.categoryId, total: 0, count: 0, isLoop: false };
    }
    eventMap[key].total += (Number(r.duration) || 0);
    eventMap[key].count++;
  });
  // 标记循环事件（匹配分类与活动的）
  cats.forEach(cat => {
    (cat.activities || []).forEach(act => {
      const key = cat.id + '||' + act;
      if (eventMap[key]) eventMap[key].isLoop = true;
    });
  });
  // 按总时长排序
  const events = Object.values(eventMap).sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...events.map(e => e.total), 1);
  
  let html = '';
  events.forEach(e => {
    const cat = cats.find(c => c.id === e.categoryId) || { color: '#8E8E93' };
    const pct = Math.round(e.total / maxTotal * 100);
    html += '<div class="event-stat-item">' +
      '<span class="evi-dot" style="background:' + cat.color + '"></span>' +
      '<div class="evi-info">' +
        '<div class="evi-name">' + escapeHtml(e.name) + ' <span class="evi-tag ' + (e.isLoop ? 'loop' : 'once') + '">' + (e.isLoop ? '循环' : '单次') + '</span></div>' +
        '<div class="evi-bar"><div class="evi-fill" style="width:' + pct + '%;background:' + cat.color + '"></div></div>' +
      '</div>' +
      '<span class="evi-val">' + e.total + '分 / ' + e.count + '次</span>' +
    '</div>';
  });
  container.innerHTML = html;
}

// 周计划建议
function renderWeekAdvice(dayData, weekTotal) {
  const goals = Storage.getGoals().filter(g => g.enabled && g.targetMin > 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetMin * 7, 0);
  let advice = '';
  // 总时间较少
  if (totalTarget > 0 && weekTotal < totalTarget * 0.3) {
    advice += '<div class="advice-item">[提醒] 本周总计时仅' + weekTotal + '分钟，投入时间较少，建议增加使用频率</div>';
  }
  goals.forEach(g => {
    const cat = Storage.getCategoryById(g.categoryId);
    if (!cat) return;
    const weekUsed = dayData.reduce((s, d) => s + d.records.filter(r => r.categoryId === g.categoryId).reduce((s2, r) => s2 + (Number(r.duration) || 0), 0), 0);
    const weekTarget = g.targetMin * 7;
    if (weekTarget === 0) return;
    const pct = weekTarget > 0 ? Math.round((Number(weekUsed) || 0) / weekTarget * 100) : 0;
    const daysLeft = 7 - dayData.findIndex(d => d.isToday) - 1;
    // 少于计划较多（不足60%）
    if (pct < 60 && daysLeft > 0) {
      const diff = weekTarget - weekUsed;
      const perDay = daysLeft > 0 ? Math.ceil((Number(diff) || 0) / daysLeft) : 0;
      advice += '<div class="advice-item">[提示] ' + cat.name + '仅完成' + pct + '%（' + weekUsed + '/' + weekTarget + '分），剩余' + daysLeft + '天建议每天' + perDay + '分钟</div>';
    }
    // 超过计划（超过120%）
    else if (pct > 120) {
      advice += '<div class="advice-item advice-good">[超额] ' + cat.name + '已超额完成' + (pct - 100) + '%，注意劳逸结合</div>';
    }
    // 接近完成（80%-100%）
    else if (pct >= 80 && pct <= 100) {
      advice += '<div class="advice-item advice-good">[完成] ' + cat.name + '即将达成目标（' + pct + '%），继续保持</div>';
    }
  });
  if (!advice) advice = '<div class="advice-item advice-good">本周时间分配合理，继续保持</div>';
  const recEl = document.getElementById('cs-records');
  if (recEl) {
    recEl.innerHTML = '<h3>计划建议</h3><div class="advice-list">' + advice + '</div><h3 style="margin-top:16px;">本周记录</h3><div id="stats-records-list" class="stats-records-list"></div>';
  }
}

// 月计划建议
function renderMonthAdvice(weekData, monthTotal) {
  const goals = Storage.getGoals().filter(g => g.enabled && g.targetMin > 0);
  const totalTarget = goals.reduce((s, g) => s + g.targetMin * 30, 0);
  let advice = '';
  // 总时间较少
  if (totalTarget > 0 && monthTotal < totalTarget * 0.3) {
    advice += '<div class="advice-item">[提醒] 本月总计时仅' + monthTotal + '分钟，投入时间较少，建议增加使用频率</div>';
  }
  // 周环比
  if (weekData.length >= 2) {
    const lastWeek = weekData[weekData.length - 1].value;
    const prevWeek = weekData[weekData.length - 2].value;
    if (prevWeek > 0 && lastWeek > prevWeek * 1.2) {
      advice += '<div class="advice-item advice-good">[上升] 最近一周比前一周增加' + Math.round((lastWeek - prevWeek) / prevWeek * 100) + '%，保持势头</div>';
    } else if (prevWeek > 0 && lastWeek < prevWeek * 0.8) {
      advice += '<div class="advice-item">[下降] 最近一周比前一周减少' + Math.round((prevWeek - lastWeek) / prevWeek * 100) + '%，注意时间分配</div>';
    }
  }
  goals.forEach(g => {
    const cat = Storage.getCategoryById(g.categoryId);
    if (!cat) return;
    const monthTarget = (Number(g.targetMin) || 0) * 30;
    if (monthTarget === 0 || monthTotal === 0) return;
    const pct = monthTarget > 0 ? Math.round((Number(monthTotal) || 0) / monthTarget * 100) : 0;
    if (pct < 50) {
      advice += '<div class="advice-item">⚠️ ' + cat.name + '本月仅完成目标的' + pct + '%，建议增加投入</div>';
    } else if (pct > 120) {
      advice += '<div class="advice-item advice-good">[超额] ' + cat.name + '已超额完成' + (pct - 100) + '%，注意劳逸结合</div>';
    }
  });
  if (!advice) advice = '<div class="advice-item advice-good">本月时间分配均衡，继续保持</div>';
  const recEl = document.getElementById('cs-records');
  if (recEl) {
    recEl.innerHTML = '<h3>计划建议</h3><div class="advice-list">' + advice + '</div><h3 style="margin-top:16px;">本月记录</h3><div id="stats-records-list" class="stats-records-list"></div>';
  }
}

// 饼图
function renderPieChart(records) {
  const canvas = document.getElementById('pie-chart');
  const legend = document.getElementById('pie-legend');
  if (!canvas || !legend) return;
  const catMap = {};
  records.forEach(r => {
    const cat = Storage.getCategoryById(r.categoryId) || { color: '#8E8E93', name: '其他' };
    if (!catMap[cat.name]) catMap[cat.name] = { color: cat.color, min: 0 };
    catMap[cat.name].min += (Number(r.duration) || 0);
  });
  const entries = Object.entries(catMap);
  const total = entries.reduce((s, [,v]) => s + v.min, 0);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 200 * dpr;
  canvas.height = 200 * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 200, 200);
  if (total === 0) {
    ctx.fillStyle = '#E5E5EA';
    ctx.beginPath();
    ctx.arc(100, 100, 70, 0, Math.PI * 2);
    ctx.fill();
    legend.innerHTML = '<p style="color:#8E8E93;font-size:12px;">暂无数据</p>';
    return;
  }
  let startAngle = -Math.PI / 2;
  entries.forEach(([name, v]) => {
    const angle = (v.min / total) * Math.PI * 2;
    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.arc(100, 100, 70, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fill();
    startAngle += angle;
  });
  // 中心白圆
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(100, 100, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1C1C1E';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(total + '分', 100, 105);
  // 图例
  legend.innerHTML = entries.map(([name, v]) =>
    '<div class="pie-legend-item"><span class="pie-dot" style="background:' + v.color + '"></span>' +
    '<span>' + name + '</span><span>' + v.min + '分 ' + Math.round(v.min / total * 100) + '%</span></div>'
  ).join('');
}

// 柱状图
function drawBarChart(data) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 180 * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = 180;
  const padL = 36, padR = 12, padT = 16, padB = 28;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);
  const maxVal = Math.max(...data.map(d => Number(d.value) || 0), 10);
  const barW = chartW / data.length * 0.6;
  const gap = chartW / data.length;
  ctx.fillStyle = '#8E8E93';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(maxVal * i / 3);
    const y = padT + chartH - (chartH * i / 3);
    ctx.fillText(val, padL - 6, y + 4);
    ctx.strokeStyle = '#E5E5EA';
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }
  data.forEach((d, i) => {
    const x = padL + gap * i + (gap - barW) / 2;
    const h = ((Number(d.value) || 0) / maxVal) * chartH;
    const y = padT + chartH - h;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#007AFF');
    grad.addColorStop(1, '#5AC8FA');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]);
    ctx.fill();
    ctx.fillStyle = '#8E8E93';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW / 2, H - 8);
  });
}

function drawTrendChart(data) {
  const canvas = document.getElementById('trend-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = 200;
  const padL = 36, padR = 12, padT = 16, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...data.map(d => d.value), 10);
  const barW = chartW / data.length * 0.6;
  const gap = chartW / data.length;

  // Y轴刻度
  ctx.fillStyle = '#98989f';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const val = Math.round(maxVal * i / 3);
    const y = padT + chartH - (chartH * i / 3);
    ctx.fillText(val, padL - 6, y + 4);
    // 网格线
    ctx.strokeStyle = '#3a3a3c';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
  }

  // 柱子
  data.forEach((d, i) => {
    const x = padL + gap * i + (gap - barW) / 2;
    const h = (d.value / maxVal) * chartH;
    const y = padT + chartH - h;

    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#007AFF');
    grad.addColorStop(1, '#0051D5');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, h, [4, 4, 0, 0]);
    ctx.fill();

    // X轴标签
    ctx.fillStyle = '#98989f';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW / 2, H - 8);
  });
}

function drawPieChart(records) {
  const canvas = document.getElementById('pie-chart');
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById('pie-legend');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 200 * dpr;
  canvas.height = 200 * dpr;
  ctx.scale(dpr, dpr);

  // 按分类汇总
  const catMap = {};
  records.forEach(r => {
    const cat = Storage.getCategoryById(r.categoryId) || { name: '其他', color: '#8E8E93' };
    catMap[cat.name] = catMap[cat.name] || { color: cat.color, value: 0 };
    catMap[cat.name].value += r.duration;
  });

  const data = Object.entries(catMap).map(([name, v]) => ({ name, ...v }));
  const total = data.reduce((s, d) => s + d.value, 0);

  ctx.clearRect(0, 0, 200, 200);
  legend.innerHTML = '';

  if (total === 0) {
    ctx.fillStyle = '#3a3a3c';
    ctx.beginPath();
    ctx.arc(100, 100, 70, 0, Math.PI * 2);
    ctx.fill();
    legend.innerHTML = '<p class="empty-tip" style="padding:0;font-size:12px">暂无数据</p>';
    return;
  }

  let startAngle = -Math.PI / 2;
  data.forEach(d => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.arc(100, 100, 70, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fill();
    startAngle += angle;

    // 图例
    const pct = Math.round(d.value / total * 100);
    const item = document.createElement('div');
    item.className = 'pie-legend-item';
    item.innerHTML =
      '<span class="pie-legend-dot" style="background:' + d.color + '"></span>' +
      '<span class="pie-legend-name">' + escapeHtml(d.name) + '</span>' +
      '<span class="pie-legend-value">' + d.value + '分 ' + pct + '%</span>';
    legend.appendChild(item);
  });

  // 中心圆（甜甜圈效果）
  ctx.fillStyle = '#2c2c2e';
  ctx.beginPath();
  ctx.arc(100, 100, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total + '', 100, 95);
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillStyle = '#98989f';
  ctx.fillText('分钟', 100, 112);
}


function renderTaskProgressStats() {
  const container = document.getElementById('task-progress-list');
  const tasks = Storage.getTasks().filter(t => !t.completed);
  container.innerHTML = '';

  if (tasks.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:8px;">暂无进行中的任务</p>';
    return;
  }

  tasks.forEach(task => {
    const cat = Storage.getCategoryById(task.categoryId);
    const usedMin = Storage.getTaskMinutes(task.id);
    const estimatedMin = task.estimatedMin || 0;
    const progress = (estimatedMin && usedMin) ? Math.min(100, Math.round((Number(usedMin) || 0) / (Number(estimatedMin) || 1) * 100)) : 0;

    const item = document.createElement('div');
    item.className = 'task-progress-item';
    item.innerHTML =
      '<div class="task-progress-top">' +
        '<span class="task-progress-name">' + escapeHtml(task.name) + '</span>' +
        '<span class="task-progress-percent" style="color:' + (cat ? cat.color : 'var(--accent)') + '">' + progress + '%</span>' +
      '</div>' +
      '<div class="task-progress-bar"><div class="task-progress-fill" style="width:' + progress + '%;background:' + (cat ? cat.color : 'var(--accent)') + '"></div></div>' +
      '<div class="task-progress-meta">已投入 ' + (Number(usedMin) || 0) + ' 分钟' + (estimatedMin ? ' / 预计 ' + estimatedMin + ' 分钟' : '') + (cat ? ' · ' + cat.name : '') + '</div>';
    container.appendChild(item);
  });
}

// ---------- 设置页 ----------
let expandedCatId = null;
let todoFilter = 'day';
let todoShowFilter = 'pending';
let todoSortBy = 'time';
let editingTodoId = null;
let expandedTodoId = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedCalDate = null;

function renderGoalProgress() {
  const container = document.getElementById('stats-goal-progress-list');
  if (!container) return;
  const goals = Storage.getGoals().filter(g => g.enabled && g.targetMin > 0);
  const today = formatDate(new Date());
  const dayRecords = Storage.getRecords().filter(r => r.date === today);
  if (!state.expandedGoals) state.expandedGoals = {};

  if (goals.length === 0) {
    container.innerHTML = '<div class="goal-progress-empty">未设置目标，去设置页添加</div>';
    return;
  }

  let html = '';
  goals.forEach(goal => {
    const cat = Storage.getCategoryById(goal.categoryId);
    if (!cat) return;
    const usedMin = dayRecords.filter(r => r.categoryId === goal.categoryId).reduce((s, r) => s + (Number(r.duration) || 0), 0);
    const pct = goal.targetMin > 0 ? Math.min(100, Math.round((Number(usedMin) || 0) / goal.targetMin * 100)) : 0;
    const achieved = usedMin >= goal.targetMin;
    const isExpanded = !!state.expandedGoals[goal.categoryId];
    html += '<div class="goal-progress-item">' +
      '<div class="goal-progress-header">' +
        '<span class="goal-expand-icon" data-cat="' + goal.categoryId + '">' + (isExpanded ? '▼' : '▶') + '</span>' +
        '<span class="goal-progress-name"><span class="goal-progress-dot" style="background:' + cat.color + '"></span>' + cat.name + '</span>' +
        '<span class="goal-progress-text">' + usedMin + ' / ' + goal.targetMin + ' 分钟 (' + pct + '%)' + (achieved ? ' [完成]' : '') + '</span>' +
      '</div>' +
      '<div class="goal-progress-bar" data-cat="' + goal.categoryId + '"><div class="goal-progress-fill" style="width:' + pct + '%;background:' + cat.color + '"></div></div>' +
      (isExpanded ? '<div class="goal-sub-activities">' + cat.activities.map(act => {
        const actUsed = dayRecords.filter(r => r.categoryId === goal.categoryId && r.app === act).reduce((s, r) => s + (Number(r.duration) || 0), 0);
        return '<div class="goal-sub-activity" data-cat="' + goal.categoryId + '" data-act="' + act + '">' +
          '<span class="goal-sub-activity-name">' + act + '</span>' +
          '<span class="goal-sub-activity-time">' + actUsed + '分</span>' +
        '</div>';
      }).join('') + '</div>' : '') +
    '</div>';
  });
  container.innerHTML = html;

  // 三角展开/折叠
  container.querySelectorAll('.goal-expand-icon').forEach(icon => {
    icon.onclick = (e) => {
      e.stopPropagation();
      const catId = icon.dataset.cat;
      state.expandedGoals[catId] = !state.expandedGoals[catId];
      renderGoalProgress();
    };
  });

  // 点击进度条开始对应分类默认第一项计时
  container.querySelectorAll('.goal-progress-bar').forEach(bar => {
    bar.style.cursor = 'pointer';
    bar.onclick = () => {
      const catId = bar.dataset.cat;
      startCountupForCategory(catId, null);
    };
  });

  // 点击二级活动直接计时
  container.querySelectorAll('.goal-sub-activity').forEach(sub => {
    sub.style.cursor = 'pointer';
    sub.onclick = () => {
      const catId = sub.dataset.cat;
      const act = sub.dataset.act;
      startCountupForCategory(catId, act);
    };
  });
}

function startCountupForCategory(catId, act) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-page="timer"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-timer').classList.add('active');
  state.selectedCategory = catId;
  state.selectedApp = null;
  renderAppSelector();
  setTimeout(() => {
    const cat = Storage.getCategoryById(catId);
    const activity = act || (cat && cat.activities.length > 0 ? cat.activities[0] : '');
    state.selectedApp = activity;
    startTimer(activity, 0, 'normal');
  }, 100);
}


function renderCalendar() {
  const grid = document.getElementById('cal-grid');
  const title = document.getElementById('cal-title');
  if (!grid || !title) return;

  title.textContent = calYear + '年' + (calMonth + 1) + '月';
  const today = formatDate(new Date());
  const todos = Storage.getTodos().filter(t => !t.completed);

  const dayCounts = {};
  todos.forEach(t => {
    if (t.dueDate) {
      dayCounts[t.dueDate] = (dayCounts[t.dueDate] || 0) + 1;
    }
  });

  const weekDays = ['日','一','二','三','四','五','六'];
  let html = '';
  weekDays.forEach(d => { html += '<div class="calendar-day-header">' + d + '</div>'; });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    html += '<div class="calendar-day other-month"><span class="day-num">' + day + '</span></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const count = dayCounts[dateStr] || 0;
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedCalDate;
    const classes = ['calendar-day'];
    const dow = new Date(calYear, calMonth, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    if (isToday) classes.push('today');
    if (isSelected) classes.push('selected');
    if (count > 0) classes.push('has-tasks');
    if (isWeekend) classes.push('weekend');
    html += '<div class="' + classes.join(' ') + '" data-date="' + dateStr + '">' +
      '<span class="day-num">' + day + '</span>' +
      (count > 0 ? '<span class="day-count">' + count + '项</span>' : '') +
    '</div>';
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    html += '<div class="calendar-day other-month"><span class="day-num">' + day + '</span></div>';
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.calendar-day[data-date]').forEach(cell => {
    cell.onclick = () => {
      selectedCalDate = cell.dataset.date;
      renderCalendar();
      renderTodoList();
    };
  });
}


function renderTodoList() {
  const container = document.getElementById('todo-list');
  let todos = Storage.getTodos();
  const today = formatDate(new Date());
  const dayRecords = Storage.getRecords().filter(r => r.date === today);

  const calView = document.getElementById('calendar-view');
  if (calView) calView.style.display = (todoFilter === 'month') ? '' : 'none';
  if (todoFilter === 'month') renderCalendar();

  const goalSection = document.getElementById('goal-progress-section');
  if (goalSection) goalSection.style.display = 'none';

  if (!state.expandedGoalCat) state.expandedGoalCat = null;
  if (!state.expandedWeekDay) state.expandedWeekDay = null;

  if (todoFilter === 'day') {
    const goals = Storage.getGoals().filter(g => g.enabled && g.targetMin > 0);
    let totalTarget = 0, totalUsed = 0;
    goals.forEach(g => {
      totalTarget += g.targetMin;
      totalUsed += dayRecords.filter(r => r.categoryId === g.categoryId).reduce((s, r) => s + r.duration, 0);
    });
    const totalPct = totalTarget > 0 ? Math.min(100, Math.round(totalUsed / totalTarget * 100)) : 0;
    const ringColor = goals.length > 0 && Storage.getCategoryById(goals[0].categoryId) ? Storage.getCategoryById(goals[0].categoryId).color : '#007AFF';

    let html = '';
    html += '<div class="day-timeline-24h"><div class="dt24-labels"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div><div class="dt24-bar">';
    html += '<div class="dt24-segment sleep" style="left:0%;width:29.17%"></div>';
    html += '<div class="dt24-segment sleep" style="left:95.83%;width:4.17%"></div>';
    html += '<div class="dt24-segment nap" style="left:50%;width:4.17%"></div>';
    dayRecords.forEach(r => {
      const s = new Date(r.startTime), e = new Date(r.endTime);
      const sp = (s.getHours()*60+s.getMinutes())/1440*100, ep = (e.getHours()*60+e.getMinutes())/1440*100;
      const cat = Storage.getCategoryById(r.categoryId) || {color:'#8E8E93'};
      html += '<div class="dt24-record" style="left:'+sp+'%;width:'+Math.max(0.5,ep-sp)+'%;background:'+cat.color+'"></div>';
    });
    const nowD = new Date();
    html += '<div class="dt24-now" style="left:'+((nowD.getHours()*60+nowD.getMinutes())/1440*100)+'%"></div>';
    html += '</div></div>';

    if (goals.length > 0) {
      html += '<div class="goal-hero-large">' +
        '<div class="goal-ring-large" style="background: conic-gradient(' + ringColor + ' ' + totalPct + '%, var(--bg-tertiary) ' + totalPct + '%)">' +
          '<div class="goal-ring-large-inner">' +
            '<div class="goal-ring-large-pct">' + totalPct + '%</div>' +
            '<div class="goal-ring-large-label">今日目标</div>' +
          '</div>' +
        '</div>' +
        '<div class="goal-hero-large-info">' +
          '<div class="goal-hero-large-title">' + totalUsed + ' / ' + totalTarget + ' 分钟</div>' +
          '<div class="goal-hero-large-sub">' + (totalUsed >= totalTarget ? '目标已达成！' : '还差 ' + (totalTarget - totalUsed) + ' 分钟') + '</div>' +
        '</div>' +
        '<div class="goal-cat-list">';
      goals.forEach(g => {
        const cat = Storage.getCategoryById(g.categoryId);
        if (!cat) return;
        const used = dayRecords.filter(r => r.categoryId === g.categoryId).reduce((s, r) => s + r.duration, 0);
        const pct = Math.min(100, Math.round(used / g.targetMin * 100));
        const isExp = state.expandedGoalCat === g.categoryId;
        html += '<div class="goal-cat-row' + (isExp ? ' expanded' : '') + '" data-cat="' + g.categoryId + '">' +
          '<span class="goal-cat-dot" style="background:' + cat.color + '"></span>' +
          '<span class="goal-cat-name">' + cat.name + '</span>' +
          '<div class="goal-cat-bar"><div class="goal-cat-fill" style="width:' + pct + '%;background:' + cat.color + '"></div></div>' +
          '<span class="goal-cat-val">' + used + '/' + g.targetMin + '</span>' +
          '<span class="goal-cat-arrow">' + (isExp ? '▲' : '▼') + '</span>' +
        '</div>';
        if (isExp) {
          html += '<div class="goal-sub-list">';
          cat.activities.forEach(act => {
            const actUsed = dayRecords.filter(r => r.categoryId === g.categoryId && r.app === act).reduce((s, r) => s + r.duration, 0);
            html += '<div class="goal-sub-item" data-cat="' + g.categoryId + '" data-act="' + act + '">' +
              '<span class="goal-sub-name">' + act + '</span>' +
              '<span class="goal-sub-time">' + actUsed + '分</span>' +
            '</div>';
          });
          html += '</div>';
        }
      });
      html += '</div></div>';
    }

    // 自动生成的每日循环待办（来自设置的分类与活动）
    // 手动完成的自动待办（按日期存储）
    const manualDoneKey = 'manual_auto_done_' + today;
    let manualDone = [];
    try { manualDone = JSON.parse(localStorage.getItem(manualDoneKey) || '[]'); } catch(e) { manualDone = []; }
    const autoTodos = [];
    const cats = Storage.getCategories();
    cats.forEach(cat => {
      (cat.activities || []).forEach(act => {
        const hasRecord = dayRecords.some(r => r.categoryId === cat.id && r.app === act);
        const isManualDone = manualDone.indexOf(cat.id + '||' + act) >= 0;
        autoTodos.push({
          id: 'auto_' + cat.id + '_' + act,
          title: act,
          categoryId: cat.id,
          autoGenerated: true,
          completed: hasRecord || isManualDone,
          dueTime: '循环'
        });
      });
    });

    let dayTodos = todos.filter(t => {
    if (todoShowFilter === 'pending') return !t.completed && (!t.dueDate || t.dueDate <= today);
    if (todoShowFilter === 'done') return t.completed;
    return (!t.dueDate || t.dueDate <= today);
    });
    // 合并自动待办
    if (todoShowFilter === 'pending') {
      dayTodos = dayTodos.concat(autoTodos.filter(t => !t.completed));
    } else if (todoShowFilter === 'done') {
      dayTodos = dayTodos.concat(autoTodos.filter(t => t.completed));
    } else {
      dayTodos = dayTodos.concat(autoTodos);
    }
    if (todoSortBy === 'priority') {
      const pOrder = { high: 0, medium: 1, low: 2 };
      dayTodos.sort((a, b) => (pOrder[a.priority] || 1) - (pOrder[b.priority] || 1));
    } else {
      dayTodos.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
    }

    if (dayTodos.length > 0) {
      dayTodos.forEach(todo => {
        const cat = Storage.getCategoryById(todo.categoryId);
        html += '<div class="timeline-item' + (todo.autoGenerated ? ' auto-todo' : '') + (todo.completed ? ' completed' : '') + '" data-id="' + todo.id + '">' +
          '<div class="timeline-time">' + (todo.dueTime || '全天') + '</div>' +
          '<div class="timeline-bar" style="background:' + (cat ? cat.color : '#8E8E93') + '"></div>' +
          '<div class="timeline-content">' +
            '<div class="timeline-title">' + escapeHtml(todo.title) + '</div>' +
            (cat ? '<div class="timeline-cat" style="color:' + cat.color + '">' + cat.name + '</div>' : '') +
          '</div>' +
          '<div class="timeline-checkbox" data-id="' + todo.id + '"></div>' +
        '</div>';
      });
    } else {
      html += '<p class="empty-tip">今日暂无待办，点右上角新建</p>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.goal-cat-row').forEach(row => {
      row.onclick = (e) => {
        const catId = row.dataset.cat;
        if (e.target.closest('.goal-cat-arrow') || e.target.closest('.goal-cat-name')) {
          state.expandedGoalCat = state.expandedGoalCat === catId ? null : catId;
          renderTodoList();
        } else {
          startPomodoroForCategory(catId, null);
        }
      };
    });
    container.querySelectorAll('.goal-sub-item').forEach(item => {
      item.onclick = () => {
        startPomodoroForCategory(item.dataset.cat, item.dataset.act);
      };
    });
    syncWidgetData();
    container.querySelectorAll('.timeline-item').forEach(item => {
      const todo = todos.find(t => t.id === item.dataset.id) || (typeof autoTodos !== 'undefined' ? autoTodos.find(t => t.id === item.dataset.id) : null);
      if (!todo) return;
      if (todo.autoGenerated) {
        item.onclick = () => {
          switchPage('timer');
          state.selectedCategory = todo.categoryId;
          state.selectedApp = todo.title;
          setTimeout(function() { renderAppSelector(); showToast('已选择：' + todo.title); }, 100);
        };
        item.querySelector('.timeline-checkbox').onclick = function(e) {
          e.stopPropagation();
          var key = 'manual_auto_done_' + today;
          var list = [];
          try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch(err) { list = []; }
          var idx = list.indexOf(todo.categoryId + '||' + todo.title);
          if (idx >= 0) { list.splice(idx, 1); showToast('已取消完成'); }
          else { list.push(todo.categoryId + '||' + todo.title); showToast('已标记完成'); }
          localStorage.setItem(key, JSON.stringify(list));
          renderTodoList();
        };
      } else {
        item.onclick = () => { openTodoModal(todo); };
        item.querySelector('.timeline-checkbox').onclick = (e) => { e.stopPropagation(); toggleTodoComplete(todo); };
      }
    });
    return;
  }

  if (todoFilter === 'week') {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekNames = ['周日','周一','周二','周三','周四','周五','周六'];

    let html = '<div class="week-grid-expandable">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDate(d);
      // 自动循环待办（每天都有）
      const autoDayTodos = [];
      const catsW = Storage.getCategories();
      const manualDoneKeyW = 'manual_auto_done_' + dateStr;
      let manualDoneW = [];
      try { manualDoneW = JSON.parse(localStorage.getItem(manualDoneKeyW) || '[]'); } catch(e) {}
      const dayRecordsW = Storage.getRecords().filter(r => r.date === dateStr);
      catsW.forEach(cat => {
        (cat.activities || []).forEach(act => {
          const hasRecord = dayRecordsW.some(r => r.categoryId === cat.id && r.app === act);
          const isManualDone = manualDoneW.indexOf(cat.id + '||' + act) >= 0;
          if (!hasRecord && !isManualDone) {
            autoDayTodos.push({
              id: 'auto_' + cat.id + '_' + act,
              title: act,
              categoryId: cat.id,
              autoGenerated: true,
              dueTime: '循环'
            });
          }
        });
      });
      const dayTodos = todos.filter(t => !t.completed && t.dueDate === dateStr).concat(autoDayTodos);
      const isToday = dateStr === today;
      const isExp = state.expandedWeekDay === dateStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      html += '<div class="week-cell-small' + (isWeekend ? ' weekend' : '') + (isToday ? ' today' : '') + (isExp ? ' expanded' : '') + '" data-date="' + dateStr + '">' +
        '<div class="week-cell-small-head">' +
          '<span class="week-cell-small-day">' + weekNames[d.getDay()] + ' ' + (d.getMonth()+1) + '/' + d.getDate() + '</span>' +
          '<span class="week-cell-small-count">' + dayTodos.length + '项</span>' +
        '</div>';
      if (!isExp) {
        if (dayTodos.length > 0) {
          const preview = dayTodos.slice(0, 1).map(t => t.title).join('、');
          html += '<div class="week-cell-small-preview">' + escapeHtml(preview) + (dayTodos.length > 1 ? ' 等' : '') + '</div>';
        } else {
          html += '<div class="week-cell-small-preview" style="font-style:italic">无待办</div>';
        }
      } else {
        html += '<div class="week-cell-expanded-tasks">';
        if (dayTodos.length === 0) {
          html += '<div class="week-expanded-empty">这一天没有待办</div>';
        } else {
          dayTodos.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
          dayTodos.forEach(todo => {
            const cat = Storage.getCategoryById(todo.categoryId);
            html += '<div class="week-expanded-task" data-id="' + todo.id + '">' +
              '<div class="week-expanded-task-time">' + (todo.dueTime || '全天') + '</div>' +
              '<div class="week-expanded-task-bar" style="background:' + (cat ? cat.color : '#8E8E93') + '"></div>' +
              '<div class="week-expanded-task-name">' + escapeHtml(todo.title) + '</div>' +
              '<div class="week-expanded-task-check" data-id="' + todo.id + '"></div>' +
            '</div>';
          });
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.week-cell-small').forEach(cell => {
      cell.onclick = (e) => {
        if (e.target.closest('.week-expanded-task-check')) return;
        const dateStr = cell.dataset.date;
        state.expandedWeekDay = state.expandedWeekDay === dateStr ? null : dateStr;
        renderTodoList();
      };
    });
    container.querySelectorAll('.week-expanded-task').forEach(task => {
      const todo = todos.find(t => t.id === task.dataset.id);
      if (!todo) return;
      task.onclick = (e) => {
        if (e.target.closest('.week-expanded-task-check')) return;
        openTodoModal(todo);
      };
      task.querySelector('.week-expanded-task-check').onclick = (e) => {
        e.stopPropagation();
        toggleTodoComplete(todo);
      };
    });
    return;
  }

  if (selectedCalDate) {
    // 自动循环待办
    const autoMonthTodos = [];
    const catsM = Storage.getCategories();
    const manualDoneKeyM = 'manual_auto_done_' + selectedCalDate;
    let manualDoneM = [];
    try { manualDoneM = JSON.parse(localStorage.getItem(manualDoneKeyM) || '[]'); } catch(e) {}
    const dayRecordsM = Storage.getRecords().filter(r => r.date === selectedCalDate);
    catsM.forEach(cat => {
      (cat.activities || []).forEach(act => {
        const hasRecord = dayRecordsM.some(r => r.categoryId === cat.id && r.app === act);
        const isManualDone = manualDoneM.indexOf(cat.id + '||' + act) >= 0;
        if (!hasRecord && !isManualDone) {
          autoMonthTodos.push({
            id: 'auto_' + cat.id + '_' + act,
            title: act,
            categoryId: cat.id,
            autoGenerated: true,
            dueTime: '循环'
          });
        }
      });
    });
    todos = todos.filter(t => !t.completed && t.dueDate === selectedCalDate).concat(autoMonthTodos);
    let html = '<div class="month-day-tasks">';
    html += '<div class="month-day-title">' + selectedCalDate + ' 的待办（' + todos.length + '项）</div>';
    if (todos.length > 0) {
      html += '<div class="month-task-list">';
      todos.sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
      todos.forEach(todo => {
        const cat = Storage.getCategoryById(todo.categoryId);
        html += '<div class="month-task-row" data-id="' + todo.id + '">' +
          '<div class="month-task-row-time">' + (todo.dueTime || '全天') + '</div>' +
          '<div class="month-task-row-bar" style="background:' + (cat ? cat.color : '#8E8E93') + '"></div>' +
          '<div class="month-task-row-name">' + escapeHtml(todo.title) + '</div>' +
          '<div class="month-task-row-check" data-id="' + todo.id + '"></div>' +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="month-no-task">这一天没有待办</div>';
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.month-task-row').forEach(row => {
      const todo = todos.find(t => t.id === row.dataset.id);
      if (!todo) return;
      row.onclick = (e) => {
        if (e.target.closest('.month-task-row-check')) return;
        openTodoModal(todo);
      };
      row.querySelector('.month-task-row-check').onclick = (e) => {
        e.stopPropagation();
        toggleTodoComplete(todo);
      };
    });
  } else {
    container.innerHTML = '<p class="empty-tip">点击日历中的日期查看当天待办</p>';
  }
}

function startPomodoroForCategory(catId, act) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-page="timer"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-timer').classList.add('active');
  state.selectedCategory = catId;
  state.selectedApp = null;
  renderAppSelector();
  setTimeout(() => {
    const cat = Storage.getCategoryById(catId);
    const activity = act || (cat && cat.activities.length > 0 ? cat.activities[0] : '');
    state.selectedApp = activity;
    startTimer(activity, 25, 'pomodoro');
  }, 100);
}

function toggleTodoComplete(todo) {
  const newCompleted = !todo.completed;
  if (newCompleted && todo.repeat && todo.repeat !== 'none') {
    // 重复待办：生成下一期，当前标记完成
    const nextDate = getNextRepeatDate(todo.dueDate, todo.repeat, todo.repeatDays);
    Storage.updateTodo(todo.id, { completed: true, completedAt: new Date().toISOString() });
    // 创建下一期
    Storage.addTodo({
      id: 'todo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: todo.title,
      categoryId: todo.categoryId,
      priority: todo.priority,
      dueDate: nextDate,
      dueTime: todo.dueTime,
      repeat: todo.repeat,
      parentId: todo.parentId,
      taskId: todo.taskId,
      note: todo.note,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    });
    showToast('已完成，下一期：' + nextDate);
  } else {
    Storage.updateTodo(todo.id, {
      completed: newCompleted,
      completedAt: newCompleted ? new Date().toISOString() : null
    });
    if (newCompleted) showToast('已完成 [完成]');
  }
  renderTodoList();
}

// 计算下一个重复日期
function getNextRepeatDate(currentDate, repeat, repeatDays) {
  if (!currentDate) return formatDate(new Date());
  const d = new Date(currentDate + 'T00:00:00');
  if (repeat === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (repeat === 'weekly') {
    const days = repeatDays && repeatDays.length > 0 ? repeatDays : [d.getDay()];
    // 从明天开始找下一个匹配的周几
    for (let i = 1; i <= 7; i++) {
      d.setDate(d.getDate() + 1);
      if (days.includes(d.getDay())) break;
    }
  } else if (repeat === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  }
  return formatDate(d);
}

// 智能拆分：根据任务内容自动生成子任务
function smartSplitTodo(todo) {
  const title = todo.title.toLowerCase();
  let subtasks = [];

  // 根据关键词匹配生成子任务
  if (title.includes('报告') || title.includes('论文') || title.includes('文档') || title.includes('写作')) {
    subtasks = ['收集资料', '列提纲', '撰写初稿', '修改完善', '最终检查'];
  } else if (title.includes('开发') || title.includes('代码') || title.includes('编程') || title.includes('功能')) {
    subtasks = ['需求分析', '设计方案', '编写代码', '测试调试', '部署上线'];
  } else if (title.includes('学习') || title.includes('复习') || title.includes('考试') || title.includes('课程')) {
    subtasks = ['制定计划', '学习知识点', '做练习题', '总结笔记', '模拟测试'];
  } else if (title.includes('会议') || title.includes('汇报') || title.includes('演讲') || title.includes('分享')) {
    subtasks = ['准备材料', '制作PPT', '演练内容', '正式进行', '会后总结'];
  } else if (title.includes('旅行') || title.includes('出行') || title.includes('旅游')) {
    subtasks = ['确定目的地', '预订交通住宿', '规划行程', '收拾行李', '出发准备'];
  } else if (title.includes('项目') || title.includes('方案') || title.includes('策划')) {
    subtasks = ['明确目标', '调研分析', '制定方案', '执行落地', '复盘总结'];
  } else {
    // 通用拆分
    subtasks = ['明确目标', '制定计划', '执行实施', '检查进度', '完成收尾'];
  }

  if (confirm('将为 "' + todo.title + '" 生成 ' + subtasks.length + ' 个子任务：\n' + subtasks.map((s, i) => (i+1) + '. ' + s).join('\n') + '\n\n是否确认？')) {
    subtasks.forEach((st, i) => {
      Storage.addTodo({
        id: 'todo_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 4),
        title: st,
        categoryId: todo.categoryId,
        priority: todo.priority,
        dueDate: todo.dueDate,
        dueTime: null,
        repeat: 'none',
        parentId: todo.id,
        taskId: todo.taskId,
        note: '',
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
      });
    });
    renderTodoList();
    showToast('已生成 ' + subtasks.length + ' 个子任务');
  }
}

function getPriorityColor(p) {
  return { high: '#FF3B30', medium: '#FF9500', low: '#007AFF', none: '#8E8E93' }[p] || '#8E8E93';
}
function getPriorityLabel(p) {
  return { high: '高优先级', medium: '中优先级', low: '低优先级', none: '' }[p] || '';
}

function startTimerFromTodo(todo) {
  // 切换到计时页，预填分类和活动，关联任务
  switchPage('timer');
  state.selectedCategory = todo.categoryId;
  state.selectedApp = null;
  state.selectedTaskId = todo.taskId || null;
  setTimeout(() => {
    renderAppSelector();
    // 如果有关联任务，自动选中
    if (todo.taskId) {
      const taskSelect = document.getElementById('task-select');
      if (taskSelect) taskSelect.value = todo.taskId;
    }
    showToast('已填入待办：' + todo.title);
  }, 100);
}

function openTodoModal(todo, parentId) {
  editingTodoId = todo ? todo.id : null;
  document.getElementById('todo-modal-title').textContent = todo ? '编辑待办' : '新建待办';

  // 填充分类下拉
  const catSelect = document.getElementById('todo-category');
  const cats = Storage.getCategories();
  catSelect.innerHTML = '';
  cats.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSelect.appendChild(opt);
  });

  // 填充任务下拉
  const taskSelect = document.getElementById('todo-task');
  const tasks = Storage.getTasks().filter(t => !t.completed);
  taskSelect.innerHTML = '<option value="">不关联</option>';
  tasks.forEach(task => {
    const opt = document.createElement('option');
    opt.value = task.id;
    opt.textContent = task.name;
    taskSelect.appendChild(opt);
  });

  // 填充父任务下拉（只能选未完成的顶级任务，排除自己和子孙）
  const parentSelect = document.getElementById('todo-parent');
  const allTodos = Storage.getTodos().filter(t => !t.completed && !t.parentId);
  parentSelect.innerHTML = '<option value="">无（顶级任务）</option>';
  allTodos.forEach(t => {
    if (todo && t.id === todo.id) return;
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    parentSelect.appendChild(opt);
  });

  if (todo) {
    document.getElementById('todo-title').value = todo.title;
    catSelect.value = todo.categoryId;
    document.getElementById('todo-priority').value = todo.priority;
    document.getElementById('todo-duedate').value = todo.dueDate || '';
    document.getElementById('todo-duetime').value = todo.dueTime || '';
    document.getElementById('todo-repeat').value = todo.repeat || 'none';
    // 周几选择显示/隐藏
    const daysGroup = document.getElementById('todo-repeat-days-group');
    if (daysGroup) daysGroup.style.display = (todo.repeat === 'weekly') ? '' : 'none';
    // 填充周几选择
    document.querySelectorAll('#todo-repeat-days-group input[type=checkbox]').forEach(cb => {
      cb.checked = todo.repeatDays && todo.repeatDays.includes(parseInt(cb.value));
    });
    parentSelect.value = todo.parentId || '';
    taskSelect.value = todo.taskId || '';
    document.getElementById('todo-note').value = todo.note || '';
  } else {
    document.getElementById('todo-title').value = '';
    catSelect.value = cats[0] ? cats[0].id : '';
    document.getElementById('todo-priority').value = 'none';
    document.getElementById('todo-duedate').value = '';
    document.getElementById('todo-duetime').value = '';
    document.getElementById('todo-repeat').value = 'none';
    const daysGroup2 = document.getElementById('todo-repeat-days-group');
    if (daysGroup2) daysGroup2.style.display = 'none';
    document.querySelectorAll('#todo-repeat-days-group input[type=checkbox]').forEach(cb => { cb.checked = false; });
    parentSelect.value = parentId || '';
    taskSelect.value = '';
    document.getElementById('todo-note').value = '';
  }

  // 重复类型切换时显示/隐藏周几选择
  document.getElementById('todo-repeat').onchange = function() {
    const dg = document.getElementById('todo-repeat-days-group');
    if (dg) dg.style.display = (this.value === 'weekly') ? '' : 'none';
  };

  document.getElementById('todo-modal').classList.remove('hidden');
}

function closeTodoModal() {
  document.getElementById('todo-modal').classList.add('hidden');
  editingTodoId = null;
}

function saveTodo() {
  const title = document.getElementById('todo-title').value.trim();
  if (!title) { showToast('请输入待办内容'); return; }

  const data = {
    title: title,
    categoryId: document.getElementById('todo-category').value,
    priority: document.getElementById('todo-priority').value,
    dueDate: document.getElementById('todo-duedate').value || null,
    dueTime: document.getElementById('todo-duetime').value || null,
    repeat: document.getElementById('todo-repeat').value,
    repeatDays: Array.from(document.querySelectorAll('#todo-repeat-days-group input:checked')).map(cb => parseInt(cb.value)),
    parentId: document.getElementById('todo-parent').value || null,
    taskId: document.getElementById('todo-task').value || null,
    note: document.getElementById('todo-note').value.trim()
  };

  if (editingTodoId) {
    Storage.updateTodo(editingTodoId, data);
    showToast('已更新');
  } else {
    Storage.addTodo({
      id: 'todo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      ...data,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    });
    showToast('已添加');
  }

  closeTodoModal();
  renderTodoList();
}

function renderTaskSettings() {
  const container = document.getElementById('settings-task-list');
  let tasks = Storage.getTasks();
  container.innerHTML = '';

  // 填充新任务分类下拉
  const newCatSelect = document.getElementById('new-task-cat');
  if (newCatSelect) {
    const cats = Storage.getCategories();
    newCatSelect.innerHTML = '';
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      newCatSelect.appendChild(opt);
    });
  }

  if (tasks.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:8px;">暂无任务</p>';
    return;
  }

  // 按父子关系组织
  const topLevel = tasks.filter(t => !t.parentId && !t.completed)
    .concat(tasks.filter(t => !t.parentId && t.completed));
  const childrenMap = {};
  tasks.filter(t => t.parentId).forEach(t => {
    if (!childrenMap[t.parentId]) childrenMap[t.parentId] = [];
    childrenMap[t.parentId].push(t);
  });

  function renderTaskItem(task, isChild) {
    const cat = Storage.getCategoryById(task.categoryId);
    const usedMin = Storage.getTaskMinutes(task.id);
    const estimatedMin = task.estimatedMin || 0;
    const progress = estimatedMin ? Math.min(100, Math.round(usedMin / estimatedMin * 100)) : 0;
    const childCount = (childrenMap[task.id] || []).length;

    const item = document.createElement('div');
    item.className = 'task-item' + (isChild ? ' task-child' : '');
    item.innerHTML =
      '<div class="task-item-top">' +
        '<span class="task-name' + (task.completed ? ' completed' : '') + '">' +
          (cat ? '<span class="task-cat-tag" style="background:' + cat.color + '33;color:' + cat.color + '">' + cat.name + '</span>' : '') +
          escapeHtml(task.name) +
          (childCount > 0 ? ' <span class="task-sub-count">(' + childCount + '子任务)</span>' : '') +
        '</span>' +
        '<div class="task-actions">' +
          (!isChild && !task.completed ? '<button class="task-sub-btn" title="添加子任务">+子</button>' : '') +
          (!isChild && !task.completed && childCount === 0 ? '<button class="task-split-btn" title="智能拆分子任务">拆分</button>' : '') +
          '<button class="task-done-btn">' + (task.completed ? '↩' : '[完成]') + '</button>' +
          '<button class="task-del-btn">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="task-progress-bar"><div class="task-progress-fill" style="width:' + progress + '%;background:' + (cat ? cat.color : 'var(--accent)') + '"></div></div>' +
      '<div class="task-meta">' +
        '<span>已投入 ' + usedMin + ' 分钟' + (estimatedMin ? ' / 预计 ' + estimatedMin + ' 分钟' : '') + '</span>' +
        '<span>' + progress + '%</span>' +
      '</div>';

    // 完成/取消完成
    item.querySelector('.task-done-btn').onclick = () => {
      Storage.updateTask(task.id, { completed: !task.completed });
      renderTaskSettings();
      renderTaskSelect();
    };

    // 删除
    item.querySelector('.task-del-btn').onclick = () => {
      if (confirm('删除任务 "' + task.name + '"？' + (childCount > 0 ? '（含' + childCount + '个子任务）' : '') + ' 记录不会被删除')) {
        (childrenMap[task.id] || []).forEach(c => Storage.deleteTask(c.id));
        Storage.deleteTask(task.id);
        renderTaskSettings();
        renderTaskSelect();
      }
    };

    // 添加子任务
    const subBtn = item.querySelector('.task-sub-btn');
    if (subBtn) {
      subBtn.onclick = () => {
        const subName = prompt('子任务名称：');
        if (subName && subName.trim()) {
          Storage.addTask({
            id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: subName.trim(),
            categoryId: task.categoryId,
            estimatedMin: 0,
            parentId: task.id,
            completed: false,
            createdAt: formatDate(new Date())
          });
          renderTaskSettings();
          renderTaskSelect();
          showToast('子任务已添加');
        }
      };
    }

    // 智能拆分
    const splitBtn = item.querySelector('.task-split-btn');
    if (splitBtn) {
      splitBtn.onclick = () => smartSplitTask(task);
    }

    container.appendChild(item);

    // 渲染子任务
    (childrenMap[task.id] || []).forEach(child => renderTaskItem(child, true));
  }

  topLevel.forEach(task => renderTaskItem(task, false));
}

// 智能拆分任务为子任务
function smartSplitTask(task) {
  const title = task.name.toLowerCase();
  let subtasks = [];

  if (title.includes('报告') || title.includes('论文') || title.includes('文档') || title.includes('写作') || title.includes('撰写')) {
    subtasks = ['收集资料', '列提纲', '撰写初稿', '修改完善', '最终检查'];
  } else if (title.includes('开发') || title.includes('代码') || title.includes('编程') || title.includes('功能') || title.includes('系统')) {
    subtasks = ['需求分析', '设计方案', '编写代码', '测试调试', '部署上线'];
  } else if (title.includes('学习') || title.includes('复习') || title.includes('考试') || title.includes('课程') || title.includes('研究')) {
    subtasks = ['制定计划', '学习知识点', '做练习题', '总结笔记', '模拟测试'];
  } else if (title.includes('会议') || title.includes('汇报') || title.includes('演讲') || title.includes('分享') || title.includes('答辩')) {
    subtasks = ['准备材料', '制作PPT', '演练内容', '正式进行', '会后总结'];
  } else if (title.includes('项目') || title.includes('方案') || title.includes('策划') || title.includes('设计')) {
    subtasks = ['明确目标', '调研分析', '制定方案', '执行落地', '复盘总结'];
  } else {
    subtasks = ['明确目标', '制定计划', '执行实施', '检查进度', '完成收尾'];
  }

  if (confirm('将为 "' + task.name + '" 生成 ' + subtasks.length + ' 个子任务：\n' + subtasks.map((s, i) => (i+1) + '. ' + s).join('\n') + '\n\n是否确认？')) {
    subtasks.forEach((st, i) => {
      Storage.addTask({
        id: 'task_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 4),
        name: st,
        categoryId: task.categoryId,
        estimatedMin: 0,
        parentId: task.id,
        completed: false,
        createdAt: formatDate(new Date())
      });
    });
    renderTaskSettings();
    renderTaskSelect();
    showToast('已生成 ' + subtasks.length + ' 个子任务');
  }
}

function renderGoalSettings() {
  const container = document.getElementById('settings-goal-list');
  const goals = Storage.getGoals();
  const cats = Storage.getCategories();
  container.innerHTML = '';

  cats.forEach(cat => {
    let goal = goals.find(g => g.categoryId === cat.id);
    if (!goal) {
      goal = { id: 'goal_' + cat.id, categoryId: cat.id, targetMin: 0, period: 'daily', enabled: false };
    }

    const item = document.createElement('div');
    item.className = 'goal-item';
    item.innerHTML =
      '<span class="goal-color-dot" style="background:' + cat.color + '"></span>' +
      '<span class="goal-name">' + cat.name + '</span>' +
      '<input type="number" class="goal-input" id="goal-' + cat.id + '" value="' + (goal.targetMin || 0) + '" min="0" step="10">' +
      '<span class="goal-unit">分钟/天</span>' +
      '<button class="goal-toggle ' + (goal.enabled ? 'on' : '') + '" data-cat="' + cat.id + '"></button>';

    const input = item.querySelector('.goal-input');
    input.onchange = () => {
      const val = parseInt(input.value) || 0;
      let goals = Storage.getGoals();
      let g = goals.find(x => x.categoryId === cat.id);
      if (g) {
        g.targetMin = val;
        if (val > 0) g.enabled = true;
      } else {
        goals.push({ id: 'goal_' + cat.id, categoryId: cat.id, targetMin: val, period: 'daily', enabled: val > 0 });
      }
      Storage.saveGoals(goals);
      showToast('目标已更新');
    };

    const toggle = item.querySelector('.goal-toggle');
    toggle.onclick = () => {
      let goals = Storage.getGoals();
      let g = goals.find(x => x.categoryId === cat.id);
      if (g) {
        g.enabled = !g.enabled;
      } else {
        goals.push({ id: 'goal_' + cat.id, categoryId: cat.id, targetMin: 120, period: 'daily', enabled: true });
      }
      Storage.saveGoals(goals);
      renderGoalSettings();
    };

    container.appendChild(item);
  });
}

function renderSettingsApps() {
  const catContainer = document.getElementById('settings-cat-list');
  const categories = Storage.getCategories();
  catContainer.innerHTML = '';

  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'settings-cat-item' + (expandedCatId === cat.id ? ' expanded' : '');

    // 分类头部
    const header = document.createElement('div');
    header.className = 'settings-cat-header';
    const catGoal = Storage.getGoals().find(g => g.categoryId === cat.id);
    const catTarget = catGoal ? (catGoal.targetMin || 0) : 0;
    header.innerHTML =
      '<span class="cat-color-dot" style="background:' + cat.color + '"></span>' +
      '<span class="cat-name">' + escapeHtml(cat.name) + '</span>' +
      '<span class="cat-count">' + cat.activities.length + '项</span>' +
      '<input type="number" class="cat-header-goal" id="cat-header-goal-' + cat.id + '" value="' + catTarget + '" min="0" step="10">' +
      '<span class="cat-header-goal-unit">分</span>' +
      '<span class="cat-arrow">▶</span>' +
      '<button class="cat-del-btn">删除</button>';
    header.onclick = (e) => {
      if (e.target.classList.contains('cat-del-btn')) return;
      expandedCatId = expandedCatId === cat.id ? null : cat.id;
      renderSettingsApps();
    };
    const headerGoalInput = header.querySelector('.cat-header-goal');
    if (headerGoalInput) {
      headerGoalInput.onclick = (e) => e.stopPropagation();
      headerGoalInput.onchange = () => {
        const val = parseInt(headerGoalInput.value) || 0;
        let gs = Storage.getGoals();
        let g = gs.find(x => x.categoryId === cat.id);
        if (g) { g.targetMin = val; g.enabled = val > 0; }
        else { gs.push({ id: 'goal_' + cat.id, categoryId: cat.id, targetMin: val, period: 'daily', enabled: val > 0 }); }
        Storage.saveGoals(gs);
        showToast('目标已更新');
      };
    }

    header.querySelector('.cat-del-btn').onclick = (e) => {
      e.stopPropagation();
      if (categories.length <= 1) { showToast('至少保留一个分类'); return; }
      if (confirm('删除分类 "' + cat.name + '"？该分类下的活动将移至"其他"')) {
        let cats = Storage.getCategories();
        const otherCat = cats.find(c => c.id === 'other') || cats[0];
        otherCat.activities = [...otherCat.activities, ...cat.activities];
        cats = cats.filter(c => c.id !== cat.id);
        Storage.saveCategories(cats);
        if (expandedCatId === cat.id) expandedCatId = null;
        renderSettingsApps();
        renderAppSelector();
      }
    };
    item.appendChild(header);

    // 分类展开区域（活动列表）
    const body = document.createElement('div');
    body.className = 'settings-cat-body';

    const actList = document.createElement('div');
    actList.className = 'cat-activity-list';
    if (cat.activities.length === 0) {
      actList.innerHTML = '<p style="font-size:12px;color:var(--text-secondary);text-align:center;padding:8px;">暂无活动</p>';
    }
    cat.activities.forEach(act => {
      const actItem = document.createElement('div');
      actItem.className = 'cat-activity-item with-slider';
      const actGoal = catGoal && catGoal.activityGoals ? (catGoal.activityGoals[act] || 0) : 0;
      const actPct = catTarget > 0 ? Math.round(actGoal / catTarget * 100) : 0;
      actItem.innerHTML = '<div class="act-item-top"><span class="act-item-name">' + escapeHtml(act) + '</span><span class="act-item-val">' + actGoal + '分 (' + actPct + '%)</span><button class="act-del-btn">删除</button></div><input type="range" class="act-slider" min="0" max="' + Math.max(catTarget, 10) + '" step="5" value="' + actGoal + '">';
      actItem.querySelector('.act-del-btn').onclick = () => {
        if (confirm('删除 "' + act + '"？')) {
          let cats = Storage.getCategories();
          const c = cats.find(x => x.id === cat.id);
          if (c) c.activities = c.activities.filter(a => a !== act);
          Storage.saveCategories(cats);
          renderSettingsApps();
          renderAppSelector();
        }
      };
            const slider = actItem.querySelector('.act-slider');
      const valLabel = actItem.querySelector('.act-item-val');
      slider.oninput = function() {
        const val = parseInt(this.value);
        const pct = catTarget > 0 ? Math.round(val / catTarget * 100) : 0;
        valLabel.textContent = val + '分 (' + pct + '%)';
      };
      slider.onchange = function() {
        const val = parseInt(this.value);
        let gs = Storage.getGoals();
        let g = gs.find(x => x.categoryId === cat.id);
        if (!g) { g = { id: 'goal_' + cat.id, categoryId: cat.id, targetMin: catTarget, period: 'daily', enabled: catTarget > 0, activityGoals: {} }; gs.push(g); }
        if (!g.activityGoals) g.activityGoals = {};
        g.activityGoals[act] = val;
        Storage.saveGoals(gs);
      };
      actList.appendChild(actItem);
    });
    body.appendChild(actList);



    // 添加活动
    const addRow = document.createElement('div');
    addRow.className = 'add-activity-row';
    addRow.innerHTML =
      '<input type="text" placeholder="添加活动" id="add-act-' + cat.id + '">' +
      '<button class="btn btn-small">添加</button>';
    addRow.querySelector('button').onclick = () => {
      const input = document.getElementById('add-act-' + cat.id);
      const name = input.value.trim();
      if (!name) return;
      let cats = Storage.getCategories();
      const c = cats.find(x => x.id === cat.id);
      if (c.activities.includes(name)) { showToast('已存在'); return; }
      c.activities.push(name);
      Storage.saveCategories(cats);
      input.value = '';
      renderSettingsApps();
      renderAppSelector();
      showToast('已添加');
    };
    body.appendChild(addRow);

    item.appendChild(body);
    catContainer.appendChild(item);
  });

  // 任务列表
  renderTaskSettings();

  // 番茄配置
  const config = Storage.getPomoConfig();
  document.getElementById('pomo-work').value = config.workMin;
  document.getElementById('pomo-short').value = config.shortBreakMin;
  document.getElementById('pomo-long').value = config.longBreakMin;
  document.getElementById('pomo-interval').value = config.longBreakInterval;
}

function exportData() {
  const data = {
    apps: Storage.getApps(),
    records: Storage.getRecords(),
    exportTime: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'time-manager-' + formatDate(new Date()) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出');
}

// ---------- 快捷指令 URL Scheme 支持 ----------
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');

  if (action === 'start') {
    const app = params.get('app');
    const category = params.get('category');
    const mode = params.get('mode') || 'normal';
    const duration = parseInt(params.get('duration')) || 30;
    if (app) {
      // 确保活动在对应分类下
      const cats = Storage.getCategories();
      let cat = category ? cats.find(c => c.id === category) : Storage.getCategoryForApp(app);
      if (!cat) cat = cats[0];
      if (!cat.activities.includes(app)) {
        cat.activities.push(app);
        Storage.saveCategories(cats);
      }
      state.selectedApp = app;
      state.selectedCategory = cat.id;
      state.timerMode = mode;
      setTimeout(() => {
        if (mode === 'pomodoro') {
          const config = Storage.getPomoConfig();
          startTimer(app, config.workMin, 'pomodoro');
          showToast('番茄钟启动：' + cat.name + ' - ' + app);
        } else {
          state.selectedDuration = duration;
          startTimer(app, duration, 'normal');
          showToast('计时启动：' + cat.name + ' - ' + app + ' ' + duration + '分钟');
        }
      }, 500);
    }
  }
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 底部导航
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => switchPage(item.dataset.page);
  });

  // 补录按钮
  document.getElementById('btn-add-record').onclick = () => openRecordModal(null);

  // 弹窗
  document.getElementById('modal-cancel').onclick = closeRecordModal;
  document.getElementById('modal-save').onclick = saveRecord;
  document.getElementById('record-modal').onclick = (e) => {
    if (e.target.id === 'record-modal') closeRecordModal();
  };

  // 快速补录弹窗
  document.getElementById('quick-record-cancel').onclick = closeQuickRecordModal;
  document.getElementById('quick-record-custom').onclick = () => {
    const s = quickRecordStart, e = quickRecordEnd;
    closeQuickRecordModal();
    openRecordModal(null, s, e);
  };
  document.getElementById('quick-record-modal').onclick = (e) => {
    if (e.target.id === 'quick-record-modal') closeQuickRecordModal();
  };

  // 模式切换
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.timerMode = btn.dataset.mode;
      // 番茄模式下隐藏时长选择
      const durGroup = document.querySelector('.duration-picker').parentElement;
      if (state.timerMode === 'pomodoro') {
        durGroup.style.display = 'none';
      } else {
        durGroup.style.display = '';
      }
    };
  });


  document.getElementById('task-select').onchange = () => {
    state.selectedTaskId = document.getElementById('task-select').value || null;
  };

  // 待办筛选
  document.querySelectorAll('.todo-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.todo-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      todoFilter = tab.dataset.filter;
      selectedCalDate = null;
      renderTodoList();
    };
  });

  // 待办筛选栏
  document.querySelectorAll('.tfb-btn[data-show]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tfb-btn[data-show]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoShowFilter = btn.dataset.show;
      renderTodoList();
    };
  });
  document.querySelectorAll('.tfb-btn[data-sort]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tfb-btn[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      todoSortBy = btn.dataset.sort;
      renderTodoList();
    };
  });

  // 日历切换
  const calPrev = document.getElementById('cal-prev');
  const calNext = document.getElementById('cal-next');
  if (calPrev) calPrev.onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  if (calNext) calNext.onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };

  // 新建待办
  document.getElementById('btn-add-todo').onclick = () => openTodoModal(null);
  document.getElementById('todo-modal-cancel').onclick = closeTodoModal;
  document.getElementById('todo-modal-save').onclick = saveTodo;
  document.getElementById('todo-modal').onclick = (e) => {
    if (e.target.id === 'todo-modal') closeTodoModal();
  };

  // 时长选择
  document.querySelectorAll('.dur-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedDuration = parseInt(btn.dataset.min);
      document.getElementById('custom-min').value = '';
    };
  });

  // 自定义时长
  document.getElementById('custom-min').addEventListener('input', function() {
    if (this.value) {
      document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('selected'));
      state.selectedDuration = parseInt(this.value) || 30;
    }
  });

  // 开始计时
  document.getElementById('btn-start').onclick = () => {
    if (!state.selectedApp) {
      showToast('请先选择办公软件');
      return;
    }
    if (state.timerMode === 'pomodoro') {
      const config = Storage.getPomoConfig();
      startTimer(state.selectedApp, config.workMin, 'pomodoro');
    } else {
      if (state.selectedDuration < 1) {
        showToast('时长至少1分钟');
        return;
      }
      startTimer(state.selectedApp, state.selectedDuration, 'normal');
    }
  };

  // 跳过休息
  document.getElementById('btn-skip-break').onclick = skipBreak;

  // 结束计时
  document.getElementById('btn-finish').onclick = () => finishTimer(false);

  // 取消计时
  document.getElementById('btn-cancel').onclick = () => {
    if (confirm('确定取消？本次不会记录')) cancelTimer();
  };

  // 统计tab
  document.querySelectorAll('.stat-tab').forEach(tab => {
    tab.onclick = () => { state.statOffset = 0; renderStats(tab.dataset.period); };
  });
  // 统计日期切换
  const statPrev = document.getElementById('stat-prev');
  const statNext = document.getElementById('stat-next');
  if (statPrev) statPrev.onclick = () => { state.statOffset--; renderStats(currentStatPeriod); };
  if (statNext) statNext.onclick = () => { state.statOffset++; renderStats(currentStatPeriod); };

  // 设置 - 添加任务
  document.getElementById('btn-add-task').onclick = () => {
    const name = document.getElementById('new-task-name').value.trim();
    const catId = document.getElementById('new-task-cat').value;
    const hours = parseFloat(document.getElementById('new-task-hours').value) || 0;
    if (!name) { showToast('请输入任务名称'); return; }
    Storage.addTask({
      id: 'task_' + Date.now(),
      name: name,
      categoryId: catId,
      estimatedMin: Math.round(hours * 60),
      createdAt: formatDate(new Date()),
      completed: false
    });
    document.getElementById('new-task-name').value = '';
    document.getElementById('new-task-hours').value = '';
    renderTaskSettings();
    renderTaskSelect();
    showToast('任务已添加');
  };

  // 设置 - 添加分类
  document.getElementById('btn-add-cat').onclick = () => {
    const name = document.getElementById('new-cat-name').value.trim();
    const color = document.getElementById('new-cat-color').value;
    if (!name) { showToast('请输入分类名称'); return; }
    const cats = Storage.getCategories();
    cats.push({
      id: 'cat_' + Date.now(),
      name: name,
      color: color,
      activities: []
    });
    Storage.saveCategories(cats);
    document.getElementById('new-cat-name').value = '';
    renderSettingsApps();
    renderAppSelector();
    showToast('分类已添加');
  };

  // 设置 - 保存番茄配置
  document.getElementById('btn-save-pomo').onclick = () => {
    const config = {
      workMin: parseInt(document.getElementById('pomo-work').value) || 25,
      shortBreakMin: parseInt(document.getElementById('pomo-short').value) || 5,
      longBreakMin: parseInt(document.getElementById('pomo-long').value) || 15,
      longBreakInterval: parseInt(document.getElementById('pomo-interval').value) || 4
    };
    Storage.savePomoConfig(config);
    showToast('番茄设置已保存');
  };

  // 设置 - 导出
  document.getElementById('btn-export').onclick = exportData;

  // 设置 - 清空
  document.getElementById('btn-clear').onclick = () => {
    if (confirm('确定清空所有记录？此操作不可恢复！')) {
      Storage.clearRecords();
      renderRecords();
      updateTodaySummary();
      showToast('已清空');
    }
  };

  // 页面可见性变化时恢复计时
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.currentPage === 'timer') {
      if (!state.timerInterval && Storage.getActiveTimer()) {
        restoreTimerIfRunning();
      }
    }
  });
}

// ---------- 初始化 ----------
function init() {
  updateDateDisplay();
  renderAppSelector();
  updateTodaySummary();
  bindEvents();
  restoreTimerIfRunning();
  handleUrlParams();
  NativeNotify.init();
  NativeNotify.requestPermission();
  // 检查Widget点击跳转
  setTimeout(checkWidgetTimerData, 800);
  // 同步Widget数据
  setTimeout(syncWidgetData, 1000);
}


// 每分钟更新记录页实时区间
setInterval(() => {
  const liveBar = document.getElementById('timeline-live-bar');
  if (liveBar && !state.timerInterval) {
    const records = Storage.getRecords().filter(r => r.date === formatDate(new Date()));
    if (records.length > 0) {
      records.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));
      const lastEnd = new Date(records[records.length - 1].endTime);
      const now = new Date();
      const liveMin = Math.round((now - lastEnd) / 60000);
      if (liveMin >= 1) {
        const timeEl = liveBar.querySelector('.tlb-time');
        const rangeEl = liveBar.querySelector('.tlb-range');
        if (timeEl) timeEl.textContent = liveMin + ' 分钟';
        if (rangeEl) rangeEl.textContent = formatTime(lastEnd) + ' → 现在 ' + formatTime(now);
        liveBar.onclick = () => { openQuickRecordModal(lastEnd, now); };
      }
    }
  }
}, 60000);


// 拦截返回键，计时时不允许退出
document.addEventListener('backbutton', (e) => {
  if (state.timerInterval) {
    e.preventDefault();
    showToast('计时中，无法退出，请先结束计时');
  }
}, false);

// ---------- 桌面小组件 ----------
function syncWidgetData() {
  if (!window.AndroidWidget) return;
  try {
    const today = formatDate(new Date());
    const dayRecords = Storage.getRecords().filter(r => r.date === today);
    const cats = Storage.getCategories();
    const tasks = [];
    // 自动循环待办（未完成的）
    cats.forEach(cat => {
      (cat.activities || []).forEach(act => {
        const hasRecord = dayRecords.some(r => r.categoryId === cat.id && r.app === act);
        if (!hasRecord) {
          tasks.push({
            title: act,
            categoryId: cat.id,
            categoryName: cat.name,
            categoryColor: cat.color,
            activity: act
          });
        }
      });
    });
    // 用户创建的待办（未完成的）
    const manualDoneKey = 'manual_auto_done_' + today;
    let manualDone = [];
    try { manualDone = JSON.parse(localStorage.getItem(manualDoneKey) || '[]'); } catch(e) {}
    const todos = Storage.getTodos().filter(t => !t.completed && (!t.dueDate || t.dueDate <= today) && !t.parentId);
    todos.forEach(todo => {
      const cat = Storage.getCategoryById(todo.categoryId) || { color: '#8E8E93', name: '其他' };
      const act = cat.activities && cat.activities.length > 0 ? cat.activities[0] : todo.title;
      tasks.push({
        title: todo.title,
        categoryId: todo.categoryId,
        categoryName: cat.name,
        categoryColor: cat.color,
        activity: act
      });
    });
    window.AndroidWidget.updateTodayTasks(JSON.stringify(tasks.slice(0, 10)));
  } catch(e) { console.error('syncWidgetData error:', e); }
}

function checkWidgetTimerData() {
  if (window.__widgetTimerData) {
    const data = window.__widgetTimerData;
    window.__widgetTimerData = null;
    if (data.categoryId) {
      switchPage('timer');
      state.selectedCategory = data.categoryId;
      state.selectedApp = data.activity || null;
      setTimeout(() => {
        renderAppSelector();
        if (data.activity) showToast('从桌面小组件进入：' + data.activity);
      }, 200);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
