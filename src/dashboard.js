import { ref, get, set, push } from "firebase/database";

export async function startDashboard(db) {
  const usersRef    = ref(db, 'users');
  const logsRef     = ref(db, 'logs');
  const statusesRef = ref(db, 'statuses');

  const statusesArr = ['Inactive','Tech issues','Recording','Setting up room','Break'];
  let currentUser='', isAdmin=false, statusSince=new Date(), timerInterval;

  const userSelect    = document.getElementById('userSelect');
  const pinInput      = document.getElementById('pinInput');
  const confirmBtn    = document.getElementById('confirmUser');
  const createBtn     = document.getElementById('createUser');
  const logoutBtn     = document.getElementById('logoutBtn');
  const selDiv        = document.getElementById('userSelection');
  const dashDiv       = document.getElementById('dashboardContainer');
  const userInfo      = document.getElementById('userInfo');
  const statusText    = document.getElementById('statusText');
  const statusTimer   = document.getElementById('statusTimer');
  const statusButtons = document.getElementById('statusButtons');
  const logBody       = document.getElementById('logBody');
  const errDiv        = document.getElementById('errorMessage');

  const showError = msg => { errDiv.textContent = msg; errDiv.style.display='block'; };
  const clearError = () => { errDiv.style.display='none'; };

  function persistLogin() {
    localStorage.setItem('currentUser', currentUser);
    localStorage.setItem('isAdmin', isAdmin);
  }
  function clearLogin() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAdmin');
  }
  function loadPersisted() {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      currentUser = saved;
      isAdmin = localStorage.getItem('isAdmin')==='true';
      showDashboard();
      return true;
    }
    return false;
  }

  function showDashboard() {
    selDiv.style.display='none';
    dashDiv.style.display='block';
    userInfo.textContent = `Logged in as: ${currentUser}`;
    loadStatus();
    loadLogs();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(()=>{
      const diff = Date.now() - statusSince.getTime();
      const totalSec = Math.floor(diff/1000);
      const hrs = Math.floor(totalSec/3600);
      const mins = Math.floor((totalSec%3600)/60);
      const secs = totalSec%60;
      statusTimer.textContent = ` (${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')})`;
    },1000);
  }

  async function loadUsers() {
    clearError();
    userSelect.innerHTML = '<option value="" disabled selected>— select your name —</option>';
    try {
      const snap = await get(usersRef);
      if (snap.exists()) snap.forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c.key;
        opt.textContent = c.key;
        userSelect.appendChild(opt);
      });
    } catch {
      showError('Users load failed');
    }
  }

  async function createAccount() {
    clearError();
    const name = prompt('Enter your name:');
    if (!name) return;
    const pin = prompt('Set a 4-digit PIN or admin code:');
    if (pin!=='robotsrcool' && !/^[0-9]{4}$/.test(pin)) return showError('PIN must be 4 digits or admin code');
    try {
      await set(ref(db, `users/${name}`), { pin });
      await set(ref(db, `statuses/${name}`), { currentStatus:'Inactive', updatedAt:new Date().toISOString() });
      loadUsers();
    } catch {
      showError('Account creation failed');
    }
  }

  async function login() {
    clearError();
    const name = userSelect.value, pin = pinInput.value;
    if(!name||!pin) return showError('Select name and enter PIN');
    isAdmin = (pin==='robotsrcool');
    if(!isAdmin) {
      const snap = await get(ref(db, `users/${name}`));
      if(!snap.exists()||snap.val().pin!==pin) return showError('Invalid credentials');
    }
    currentUser = name;
    persistLogin();
    showDashboard();
  }

  function logout() {
    clearLogin();
    dashDiv.style.display='none';
    selDiv.style.display='block';
    loadUsers();
  }

  async function loadStatus() {
    clearError();
    try {
      const snap = await get(ref(db, `statuses/${currentUser}`));
      const data = snap.exists() ? snap.val() : { currentStatus:'Inactive', updatedAt:new Date().toISOString() };
      statusSince = new Date(data.updatedAt);
      renderStatus(data.currentStatus);
      if(data.currentStatus!=='Inactive') startTimer();
      else { statusTimer.textContent=''; clearInterval(timerInterval); }
    } catch {
      showError('Status fetch failed');
    }
  }

  async function loadLogs() {
    clearError();
    logBody.innerHTML='';
    try {
      const snap = await get(ref(db, 'logs'));
      if(snap.exists()) snap.forEach(c=>{
        const d = c.val();
        if(isAdmin||d.name===currentUser) appendLog(d);
      });
    } catch {
      showError('Logs load failed');
    }
  }

  async function updateStatus(newS) {
    clearError();
    if(newS==='Inactive') {
      renderStatus('Inactive');
      statusTimer.textContent=''; clearInterval(timerInterval);
      return;
    }
    if(newS===statusText.textContent) return;
    const oldS = statusText.textContent, ts = new Date();
    try {
      const snap = await get(ref(db, 'logs'));
      let prevTime = '';
      if(snap.exists()) {
        const arr = Object.values(snap.val()).filter(d=>d.name===currentUser);
        if(arr.length) prevTime = ((ts - new Date(arr[arr.length-1].timestamp))/3600000).toFixed(2);
      }
      appendLog({ timestamp:ts.toISOString(), oldStatus:oldS, newStatus:newS, user:currentUser, timeSpent:prevTime, name:currentUser });
      await push(ref(db, 'logs'), { timestamp:ts.toISOString(), name:currentUser, oldStatus:oldS, newStatus:newS, user:currentUser, timeSpent:parseFloat(prevTime)||0 });
      await set(ref(db, `statuses/${currentUser}`), { currentStatus:newS, updatedAt:new Date().toISOString() });
      loadStatus();
    } catch {
      showError('Update failed');
    }
  }

  function renderStatus(current) {
    statusText.textContent = current;
    statusButtons.innerHTML = '';
    statusesArr.forEach(s=>{
      const btn = document.createElement('button');
      btn.className='status-btn';
      btn.dataset.status=s;
      btn.textContent=s;
      if(s===current) { btn.classList.add('active'); btn.disabled=true; }
      btn.addEventListener('click', ()=>updateStatus(s));
      statusButtons.appendChild(btn);
    });
  }

  function appendLog(d) {
    const tr = document.createElement('tr'); tr.className='log-row';
    tr.innerHTML = `
      <td data-label="Timestamp">${new Date(d.timestamp).toLocaleString()}</td>
      <td data-label="Old">${d.oldStatus||''}</td>
      <td data-label="New">${d.newStatus||''}</td>
      <td data-label="By">${d.user||''}</td>
      <td data-label="Hours">${d.timeSpent!=null?d.timeSpent:''}</td>
    `;
    logBody.appendChild(tr);
  }

  createBtn.addEventListener('click', createAccount);
  confirmBtn.addEventListener('click', login);
  logoutBtn.addEventListener('click', logout);

  loadUsers();
  loadPersisted();
}
