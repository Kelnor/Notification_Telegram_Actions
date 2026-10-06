/**
 * Telegram Notifier - GitHub Actions Web Dashboard JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {

  // Default Configuration Keys
  const STORAGE_KEYS = {
    GH_OWNER: 'tg_notifier_gh_owner',
    GH_REPO: 'tg_notifier_gh_repo',
    GH_TOKEN: 'tg_notifier_gh_token',
    TG_TOKEN: 'tg_notifier_tg_token',
    TG_CHAT_ID: 'tg_notifier_tg_chat_id',
    CURRENT_USER: 'tg_notifier_current_user',
    CONTACTS_PREFIX: 'tg_notifier_contacts_'
  };

  const DAILY_MAX_LIMIT = 30;
  const FILE_PATH = '.github/data/schedules.json';
  const CONTACTS_FILE_PATH = '.github/data/contacts.json';

  // App State
  let config = {
    ghOwner: localStorage.getItem(STORAGE_KEYS.GH_OWNER) || '',
    ghRepo: localStorage.getItem(STORAGE_KEYS.GH_REPO) || 'Notification_Telegram_Actions',
    ghToken: localStorage.getItem(STORAGE_KEYS.GH_TOKEN) || '',
    tgToken: localStorage.getItem(STORAGE_KEYS.TG_TOKEN) || '',
    tgChatId: localStorage.getItem(STORAGE_KEYS.TG_CHAT_ID) || ''
  };

  let currentUser = null;
  try {
    const savedUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (savedUser) currentUser = JSON.parse(savedUser);
  } catch (e) {
    currentUser = null;
  }

  let contactsData = { users: {} };
  let currentContactsSha = null;
  let myContacts = [];

  let schedulesData = {
    daily_limit: DAILY_MAX_LIMIT,
    schedules: []
  };

  let currentFileSha = null;
  let activeTab = 'pending';

  // DOM Elements - Navigation & Badges
  const elGhUserBadge = document.getElementById('ghUserBadge');
  const elGhUserAvatar = document.getElementById('ghUserAvatar');
  const elGhUserLogin = document.getElementById('ghUserLogin');

  // DOM Elements - Settings Modal
  const elBtnOpenSettings = document.getElementById('btnOpenSettings');
  const elBtnCloseSettings = document.getElementById('btnCloseSettings');
  const elBtnCancelSettings = document.getElementById('btnCancelSettings');
  const elBtnSaveSettings = document.getElementById('btnSaveSettings');
  const elSettingsModal = document.getElementById('settingsModal');
  const elBtnTestTelegram = document.getElementById('btnTestTelegram');
  const elBtnRefresh = document.getElementById('btnRefresh');
  const elBtnManualDispatch = document.getElementById('btnManualDispatch');

  // Input Elements - Config
  const elGhOwner = document.getElementById('ghOwner');
  const elGhRepo = document.getElementById('ghRepo');
  const elGhToken = document.getElementById('ghToken');
  const elTgToken = document.getElementById('tgToken');
  const elTgChatId = document.getElementById('tgChatId');

  // Profile Card Elements
  const elGhProfileBox = document.getElementById('ghProfileBox');
  const elGhAvatar = document.getElementById('ghAvatar');
  const elGhProfileName = document.getElementById('ghProfileName');
  const elGhProfileLogin = document.getElementById('ghProfileLogin');

  // Contacts Elements in Modal
  const elContactsUserBadge = document.getElementById('contactsUserBadge');
  const elContactsUserLogin = document.getElementById('contactsUserLogin');
  const elInputContactName = document.getElementById('inputContactName');
  const elInputContactChatId = document.getElementById('inputContactChatId');
  const elCheckContactDefault = document.getElementById('checkContactDefault');
  const elBtnAddContact = document.getElementById('btnAddContact');
  const elContactsCount = document.getElementById('contactsCount');
  const elContactsList = document.getElementById('contactsList');
  const elContactsEmpty = document.getElementById('contactsEmpty');

  // Schedule Form Elements
  const elForm = document.getElementById('addScheduleForm');
  const elInputTitle = document.getElementById('inputTitle');
  const elSelectRecipient = document.getElementById('selectRecipient');
  const elDirectChatWrapper = document.getElementById('directChatWrapper');
  const elInputDirectChatId = document.getElementById('inputDirectChatId');
  const elBtnManageRecipientsFromForm = document.getElementById('btnManageRecipientsFromForm');
  const elInputDatetime = document.getElementById('inputDatetime');
  const elInputMessage = document.getElementById('inputMessage');
  const elCheckImmediateTrigger = document.getElementById('checkImmediateTrigger');
  const elBtnSubmitSchedule = document.getElementById('btnSubmitSchedule');

  // Stats & Progress Elements
  const elSentTodayCount = document.getElementById('sentTodayCount');
  const elMaxDailyLimit = document.getElementById('maxDailyLimit');
  const elUsagePercentText = document.getElementById('usagePercentText');
  const elUsageProgressBar = document.getElementById('usageProgressBar');
  const elStatPendingCount = document.getElementById('statPendingCount');
  const elStatSentTodayCount = document.getElementById('statSentTodayCount');
  const elStatTotalCount = document.getElementById('statTotalCount');
  const elScheduleList = document.getElementById('scheduleList');
  const elEmptyState = document.getElementById('emptyState');
  const elTabCountPending = document.getElementById('tabCountPending');
  const elTabCountSent = document.getElementById('tabCountSent');

  // Init Form Inputs with saved configs
  function populateConfigInputs() {
    elGhOwner.value = config.ghOwner;
    elGhRepo.value = config.ghRepo;
    elGhToken.value = config.ghToken;
    elTgToken.value = config.tgToken;
    elTgChatId.value = config.tgChatId;
    updateUserProfileUI();
  }

  // Set default datetime picker to exact current time as min limit
  function setDefaultDatetimePicker() {
    const now = new Date();

    // Set min attribute to exact CURRENT time (so 1 minute later is completely valid!)
    const minYear = now.getFullYear();
    const minMonth = String(now.getMonth() + 1).padStart(2, '0');
    const minDay = String(now.getDate()).padStart(2, '0');
    const minHours = String(now.getHours()).padStart(2, '0');
    const minMinutes = String(now.getMinutes()).padStart(2, '0');
    elInputDatetime.min = `${minYear}-${minMonth}-${minDay}T${minHours}:${minMinutes}`;
    
    // Default display value: 2 minutes after now
    const defaultTime = new Date(now.getTime() + 2 * 60 * 1000);
    const year = defaultTime.getFullYear();
    const month = String(defaultTime.getMonth() + 1).padStart(2, '0');
    const day = String(defaultTime.getDate()).padStart(2, '0');
    const hours = String(defaultTime.getHours()).padStart(2, '0');
    const minutes = String(defaultTime.getMinutes()).padStart(2, '0');

    elInputDatetime.value = `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Toast Helper
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-circle';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Unicode safe Base64 decode/encode
  function b64DecodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  }

  function unicodeToB64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
  }

  // Get unique user key based on GitHub PAT user login
  function getUserKey() {
    if (currentUser && currentUser.login) return currentUser.login.toLowerCase();
    if (config.ghOwner) return config.ghOwner.toLowerCase();
    return 'default_user';
  }

  // Update profile information in UI
  function updateUserProfileUI() {
    if (currentUser && currentUser.login) {
      if (elGhUserBadge) {
        elGhUserBadge.style.display = 'flex';
        if (elGhUserAvatar) elGhUserAvatar.src = currentUser.avatar_url || '';
        if (elGhUserLogin) elGhUserLogin.textContent = `@${currentUser.login}`;
      }
      if (elGhProfileBox) {
        elGhProfileBox.style.display = 'flex';
        if (elGhAvatar) elGhAvatar.src = currentUser.avatar_url || '';
        if (elGhProfileName) elGhProfileName.textContent = currentUser.name || currentUser.login;
        if (elGhProfileLogin) elGhProfileLogin.textContent = `@${currentUser.login}`;
      }
      if (elContactsUserLogin) {
        elContactsUserLogin.textContent = `@${currentUser.login}`;
      }
    } else {
      if (elGhUserBadge) elGhUserBadge.style.display = 'none';
      if (elGhProfileBox) elGhProfileBox.style.display = 'none';
      if (elContactsUserLogin) {
        elContactsUserLogin.textContent = config.ghOwner ? `@${config.ghOwner}` : '미인증';
      }
    }
  }

  // GitHub REST API: Fetch User Profile from PAT
  async function fetchGitHubUser(token = config.ghToken) {
    if (!token) {
      currentUser = null;
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      updateUserProfileUI();
      return null;
    }

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        currentUser = {
          login: data.login,
          name: data.name || data.login,
          avatar_url: data.avatar_url
        };
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
        updateUserProfileUI();
        return currentUser;
      } else {
        console.warn('Failed to fetch GitHub user with current token:', res.status);
        return null;
      }
    } catch (err) {
      console.error('Error fetching GitHub user:', err);
      return null;
    }
  }

  // Load Contacts (LocalStorage first + Remote repo sync)
  async function loadContacts() {
    const userKey = getUserKey();

    // 1) Load from localStorage
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.CONTACTS_PREFIX + userKey);
      if (cached) {
        myContacts = JSON.parse(cached);
        renderContactsList();
        populateRecipientDropdown();
      }
    } catch (e) {
      console.error('Local contacts load error:', e);
    }

    // 2) Load from GitHub repo .github/data/contacts.json
    if (!config.ghOwner || !config.ghRepo) return;

    const url = `https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/contents/${CONTACTS_FILE_PATH}`;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (config.ghToken) {
      headers['Authorization'] = `Bearer ${config.ghToken}`;
    }

    try {
      const response = await fetch(url, { headers });
      if (response.status === 404) {
        contactsData = { users: {} };
        currentContactsSha = null;
        if (myContacts.length > 0 && config.ghToken) {
          contactsData.users[userKey] = myContacts;
          await saveContactsToGitHub('chore: initialize contacts.json');
        }
        return;
      }

      if (!response.ok) return;

      const json = await response.json();
      currentContactsSha = json.sha;
      const decoded = b64DecodeUnicode(json.content.replace(/\n/g, ''));
      contactsData = JSON.parse(decoded);
      if (!contactsData.users) contactsData.users = {};

      if (contactsData.users[userKey] && Array.isArray(contactsData.users[userKey])) {
        myContacts = contactsData.users[userKey];
        localStorage.setItem(STORAGE_KEYS.CONTACTS_PREFIX + userKey, JSON.stringify(myContacts));
        renderContactsList();
        populateRecipientDropdown();
      } else if (myContacts.length > 0) {
        contactsData.users[userKey] = myContacts;
        if (config.ghToken) {
          await saveContactsToGitHub(`chore: save contacts for @${userKey}`);
        }
      }
    } catch (err) {
      console.warn('Contacts sync error (local cache active):', err);
    }
  }

  // Save Contacts to LocalStorage & GitHub
  async function saveContactsToGitHub(commitMsg = 'chore: update telegram contacts') {
    const userKey = getUserKey();
    localStorage.setItem(STORAGE_KEYS.CONTACTS_PREFIX + userKey, JSON.stringify(myContacts));

    if (!contactsData.users) contactsData.users = {};
    contactsData.users[userKey] = myContacts;

    if (!config.ghOwner || !config.ghRepo || !config.ghToken) {
      return true; // Saved locally
    }

    const url = `https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/contents/${CONTACTS_FILE_PATH}`;
    const jsonStr = JSON.stringify(contactsData, null, 2);
    const contentEncoded = unicodeToB64(jsonStr);

    const body = {
      message: commitMsg,
      content: contentEncoded,
      branch: 'main'
    };
    if (currentContactsSha) {
      body.sha = currentContactsSha;
    }

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${config.ghToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const resJson = await response.json();
        currentContactsSha = resJson.content.sha;
        return true;
      } else {
        console.warn('Failed to save contacts to GitHub:', response.status);
        return false;
      }
    } catch (err) {
      console.error('Remote contacts save error:', err);
      return false;
    }
  }

  // Add Contact Handler
  async function addContact() {
    const name = elInputContactName.value.trim();
    const chatId = elInputContactChatId.value.trim();
    const isDefault = elCheckContactDefault.checked;

    if (!name || !chatId) {
      showToast('받는 사람 별칭과 Telegram Chat ID를 모두 입력해주세요.', 'warning');
      return;
    }

    // Basic Chat ID Validation (numbers or minus followed by numbers)
    if (!/^-?\d+$/.test(chatId)) {
      showToast('Telegram Chat ID는 숫자(또는 그룹 ID의 경우 -숫자) 형식이어야 합니다.', 'warning');
      return;
    }

    // If marked default, unset other defaults
    if (isDefault || myContacts.length === 0) {
      myContacts.forEach(c => c.isDefault = false);
    }

    const newContact = {
      id: 'c_' + Date.now(),
      name: name,
      chatId: chatId,
      isDefault: isDefault || myContacts.length === 0
    };

    myContacts.push(newContact);

    elInputContactName.value = '';
    elInputContactChatId.value = '';
    elCheckContactDefault.checked = false;

    renderContactsList();
    populateRecipientDropdown();

    elBtnAddContact.disabled = true;
    const ok = await saveContactsToGitHub(`feat: add telegram contact '${name}'`);
    elBtnAddContact.disabled = false;

    if (ok) {
      showToast(`'${name}' 수신자가 주소록에 추가되었습니다.`, 'success');
    } else {
      showToast(`'${name}' 수신자가 로컬에 저장되었습니다. (GitHub 동기화 확인 필요)`, 'info');
    }
  }

  // Delete Contact Handler
  async function deleteContact(contactId) {
    const target = myContacts.find(c => c.id === contactId);
    if (!target) return;

    if (!confirm(`'${target.name}' 수신자를 주소록에서 삭제하시겠습니까?`)) return;

    myContacts = myContacts.filter(c => c.id !== contactId);

    // If deleted contact was default and other contacts exist, make first one default
    if (target.isDefault && myContacts.length > 0) {
      myContacts[0].isDefault = true;
    }

    renderContactsList();
    populateRecipientDropdown();

    const ok = await saveContactsToGitHub(`chore: delete telegram contact '${target.name}'`);
    if (ok) {
      showToast(`'${target.name}' 수신자를 삭제했습니다.`, 'info');
    }
  }

  // Render Contacts in Settings Modal
  function renderContactsList() {
    if (!elContactsList) return;
    if (elContactsCount) elContactsCount.textContent = myContacts.length;

    // Clear existing
    const rows = elContactsList.querySelectorAll('.contact-item-row');
    rows.forEach(r => r.remove());

    if (myContacts.length === 0) {
      if (elContactsEmpty) elContactsEmpty.style.display = 'flex';
      return;
    }

    if (elContactsEmpty) elContactsEmpty.style.display = 'none';

    myContacts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'contact-item-row';

      const defaultBadge = c.isDefault ? `<span class="badge-default"><i class="fa-solid fa-star"></i> 기본</span>` : '';

      row.innerHTML = `
        <div class="contact-item-info">
          <span class="contact-item-name">${escapeHtml(c.name)}</span>
          <span class="contact-item-id">${escapeHtml(c.chatId)}</span>
          ${defaultBadge}
        </div>
        <div class="contact-item-actions">
          <button type="button" class="btn-contact-test" data-chat-id="${escapeHtml(c.chatId)}" data-name="${escapeHtml(c.name)}" title="테스트 발송">
            <i class="fa-paper-plane"></i> 테스트
          </button>
          <button type="button" class="btn-contact-delete" data-id="${c.id}" title="삭제">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `;

      elContactsList.appendChild(row);
    });

    // Attach listeners
    elContactsList.querySelectorAll('.btn-contact-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteContact(id);
      });
    });

    elContactsList.querySelectorAll('.btn-contact-test').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const chatId = e.currentTarget.getAttribute('data-chat-id');
        const name = e.currentTarget.getAttribute('data-name');
        testDirectContactMessage(chatId, name);
      });
    });
  }

  // Populate Recipient Dropdown in Add Schedule Form
  function populateRecipientDropdown() {
    if (!elSelectRecipient) return;

    const previousSelectedVal = elSelectRecipient.value;
    elSelectRecipient.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- 수신 대상 선택 (또는 직접 입력) --';
    elSelectRecipient.appendChild(defaultOpt);

    let defaultContactId = null;

    myContacts.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.chatId;
      opt.setAttribute('data-name', c.name);
      opt.textContent = `${c.isDefault ? '★ [기본] ' : ''}${c.name} (${c.chatId})`;
      if (c.isDefault) {
        defaultContactId = c.chatId;
      }
      elSelectRecipient.appendChild(opt);
    });

    // Add Direct Input Option
    const directOpt = document.createElement('option');
    directOpt.value = '__direct__';
    directOpt.textContent = '✏️ 직접 입력...';
    elSelectRecipient.appendChild(directOpt);

    // Restore or default selection
    if (previousSelectedVal && [...elSelectRecipient.options].some(o => o.value === previousSelectedVal)) {
      elSelectRecipient.value = previousSelectedVal;
    } else if (defaultContactId) {
      elSelectRecipient.value = defaultContactId;
    } else if (myContacts.length > 0) {
      elSelectRecipient.value = myContacts[0].chatId;
    } else if (config.tgChatId) {
      // If no contacts but fallback config exists
      elSelectRecipient.value = config.tgChatId;
    }

    handleRecipientChange();
  }

  function handleRecipientChange() {
    if (!elSelectRecipient || !elDirectChatWrapper) return;
    if (elSelectRecipient.value === '__direct__') {
      elDirectChatWrapper.style.display = 'flex';
      if (elInputDirectChatId) elInputDirectChatId.focus();
    } else {
      elDirectChatWrapper.style.display = 'none';
    }
  }

  // Test Direct Contact Message
  async function testDirectContactMessage(chatId, name) {
    const token = elTgToken.value.trim() || config.tgToken;
    if (!token) {
      showToast('Telegram Bot Token이 설정되어 있어야 테스트를 보낼 수 있습니다.', 'warning');
      return;
    }

    if (!chatId) {
      showToast('수신할 Chat ID가 지정되지 않았습니다.', 'warning');
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
      showToast(`'${name}'(${chatId}) 님께 테스트 메시지 전송 중...`, 'info');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ <b>[텔레그램 알림이]</b>\n<b>${name}</b> 님께 보내는 연결 테스트 메시지입니다!\n정상적으로 메시지를 수신했습니다 📱`,
          parse_mode: 'HTML'
        })
      });

      const json = await response.json();
      if (json.ok) {
        showToast(`'${name}' 님께 테스트 메시지를 성공적으로 발송했습니다!`, 'success');
      } else {
        showToast(`텔레그램 전송 실패: ${json.description}`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(`연결 오류: ${err.message}`, 'error');
    }
  }

  // GitHub REST API: Read Schedules
  async function fetchSchedulesFromGitHub() {
    if (!config.ghOwner || !config.ghRepo) {
      showToast('GitHub 저장소 설정이 필요합니다.', 'warning');
      openModal();
      return;
    }

    const url = `https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/contents/${FILE_PATH}`;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (config.ghToken) {
      headers['Authorization'] = `Bearer ${config.ghToken}`;
    }

    try {
      elBtnRefresh.classList.add('fa-spin');
      const response = await fetch(url, { headers });

      if (response.status === 404) {
        showToast('저장소에 schedules.json 파일이 없습니다. 기본 구조를 사용합니다.', 'info');
        schedulesData = { daily_limit: DAILY_MAX_LIMIT, schedules: [] };
        currentFileSha = null;
        renderDashboard();
        return;
      }

      if (!response.ok) {
        throw new Error(`GitHub API Error: ${response.statusText}`);
      }

      const json = await response.json();
      currentFileSha = json.sha;
      const contentDecoded = b64DecodeUnicode(json.content.replace(/\n/g, ''));
      schedulesData = JSON.parse(contentDecoded);
      
      showToast('GitHub 저장소 동기화 완료!', 'success');
      renderDashboard();

    } catch (err) {
      console.error(err);
      showToast(`동기화 실패: ${err.message}`, 'error');
    } finally {
      elBtnRefresh.classList.remove('fa-spin');
    }
  }

  // GitHub REST API: Save Schedules (Commit to repo)
  async function saveSchedulesToGitHub(commitMsg = 'chore: update notification schedules') {
    if (!config.ghOwner || !config.ghRepo || !config.ghToken) {
      showToast('GitHub 저장소 수정 권한(PAT Token)이 설정되어야 저장할 수 있습니다.', 'error');
      openModal();
      return false;
    }

    const url = `https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/contents/${FILE_PATH}`;
    const jsonStr = JSON.stringify(schedulesData, null, 2);
    const contentEncoded = unicodeToB64(jsonStr);

    const body = {
      message: commitMsg,
      content: contentEncoded,
      branch: 'main'
    };
    if (currentFileSha) {
      body.sha = currentFileSha;
    }

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${config.ghToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Commit failed');
      }

      const resJson = await response.json();
      currentFileSha = resJson.content.sha;
      return true;

    } catch (err) {
      console.error(err);
      showToast(`저장 실패: ${err.message}`, 'error');
      return false;
    }
  }

  // GitHub REST API: Workflow Dispatch (Trigger Action immediately)
  async function triggerWorkflowDispatch() {
    if (!config.ghOwner || !config.ghRepo || !config.ghToken) {
      showToast('GitHub 설정(Owner, Repo, Token)이 완료되어야 Actions를 실행할 수 있습니다.', 'warning');
      return;
    }

    const url = `https://api.github.com/repos/${config.ghOwner}/${config.ghRepo}/actions/workflows/notify.yml/dispatches`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${config.ghToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      });

      if (response.ok || response.status === 204) {
        showToast('🚀 GitHub Actions 즉시 동기화 실행이 개시되었습니다!', 'success');
      } else {
        console.warn('Dispatch failed:', response.status);
        if (response.status === 404 || response.status === 403) {
          showToast(`⚠️ Action 실행 실패 (${response.status}): GitHub 토큰(PAT)에 'workflow'(Classic) 또는 'Workflows: Read and Write'(Fine-grained) 권한이 활성화되어 있는지 확인해 주세요!`, 'error');
        } else {
          showToast(`⚠️ Action 실행 실패 (${response.status}): GitHub API 요청 중 오류가 발생했습니다.`, 'error');
        }
      }
    } catch (err) {
      console.error('Dispatch trigger error:', err);
      showToast(`❌ 네트워크 오류: Action 실행 요청을 전송하지 못했습니다.`, 'error');
    }
  }

  // Telegram Direct API Test
  async function testTelegramMessage() {
    const token = elTgToken.value.trim() || config.tgToken;
    const chatId = elTgChatId.value.trim() || config.tgChatId;

    if (!token || !chatId) {
      showToast('Telegram Bot Token과 Chat ID를 모두 입력해주세요.', 'warning');
      return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ <b>[텔레그램 알림이]</b>연결 테스트 메세지입니다!\n정상적으로 메시지를 수신했습니다 📱',
          parse_mode: 'HTML'
        })
      });

      const json = await response.json();
      if (json.ok) {
        showToast('텔레그램으로 테스트 메세지를 성공적으로 보냈습니다!', 'success');
      } else {
        showToast(`텔레그램 오류: ${json.description}`, 'error');
      }
    } catch (err) {
      showToast(`연결 오류: ${err.message}`, 'error');
    }
  }

  // Calculate Sent Today Count (KST)
  function getSentTodayCount() {
    const now = new Date();
    const todayKst = getKSTDateString(now);

    return schedulesData.schedules.filter(item => {
      if (item.status === 'sent' && item.sent_at) {
        const sentDt = new Date(item.sent_at);
        return getKSTDateString(sentDt) === todayKst;
      }
      return false;
    }).length;
  }

  function getKSTDateString(dt) {
    const kstMs = dt.getTime() + (9 * 60 * 60 * 1000) + (dt.getTimezoneOffset() * 60 * 1000);
    const kstDt = new Date(kstMs);
    const y = kstDt.getFullYear();
    const m = String(kstDt.getMonth() + 1).padStart(2, '0');
    const d = String(kstDt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Render Dashboard Elements & Lists
  function renderDashboard() {
    const sentToday = getSentTodayCount();
    const maxLimit = schedulesData.daily_limit || DAILY_MAX_LIMIT;
    const usagePercent = Math.min(100, Math.round((sentToday / maxLimit) * 100));

    // Update Badges & Stat Cards
    elSentTodayCount.textContent = sentToday;
    elMaxDailyLimit.textContent = maxLimit;
    elStatSentTodayCount.textContent = sentToday;
    elUsagePercentText.textContent = `${usagePercent}% 사용 중 (${sentToday}/${maxLimit}회)`;
    elUsageProgressBar.style.width = `${usagePercent}%`;

    const pendingList = schedulesData.schedules.filter(s => s.status === 'pending');
    const sentList = schedulesData.schedules.filter(s => s.status === 'sent');

    elStatPendingCount.textContent = pendingList.length;
    elStatTotalCount.textContent = schedulesData.schedules.length;

    elTabCountPending.textContent = pendingList.length;
    elTabCountSent.textContent = sentList.length;

    // Filter Items by active tab
    let displayItems = [];
    if (activeTab === 'pending') displayItems = pendingList;
    else if (activeTab === 'sent') displayItems = sentList;
    else displayItems = schedulesData.schedules;

    // Sort by datetime
    displayItems.sort((a, b) => a.datetime.localeCompare(b.datetime));

    renderScheduleItems(displayItems);
  }

  function renderScheduleItems(items) {
    // Clear list
    const existingCards = elScheduleList.querySelectorAll('.schedule-item');
    existingCards.forEach(c => c.remove());

    if (items.length === 0) {
      elEmptyState.style.display = 'flex';
      return;
    }

    elEmptyState.style.display = 'none';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'schedule-item';

      const isPending = item.status === 'pending';
      
      // Exact parsing without JS timezone shifts
      const dtStr = item.datetime; // e.g., "2026-08-02T23:59:00+09:00"
      let timeStr = dtStr;
      const match = dtStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (match) {
        timeStr = `${match[1]}. ${match[2]}. ${match[3]}. ${match[4]}:${match[5]}`;
      }

      const badgeHtml = isPending
        ? `<span class="badge-status badge-pending"><i class="fa-regular fa-clock"></i> 발송 대기</span>`
        : `<span class="badge-status badge-sent"><i class="fa-solid fa-check"></i> 발송 완료</span>`;

      // Recipient Display Badge
      let recipientBadge = '';
      if (item.recipient_name || item.chat_id) {
        const displayName = item.recipient_name || '지정 수신자';
        const displayChatId = item.chat_id ? ` (${item.chat_id})` : '';
        recipientBadge = `<span class="badge-recipient" title="Telegram Chat ID: ${escapeHtml(item.chat_id || '')}"><i class="fa-solid fa-paper-plane"></i> ${escapeHtml(displayName + displayChatId)}</span>`;
      }

      card.innerHTML = `
        <div class="item-main">
          <div class="item-header-line">
            <span class="item-title">${escapeHtml(item.title)}</span>
            <div class="item-badges" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              ${recipientBadge}
              ${badgeHtml}
            </div>
          </div>
          <div class="item-message">${escapeHtml(item.message)}</div>
          <div class="item-meta">
            <span><i class="fa-regular fa-calendar"></i> ${timeStr} (KST)</span>
            ${item.sent_at ? `<span><i class="fa-regular fa-circle-check"></i> 발송시각: ${new Date(item.sent_at).toLocaleTimeString('ko-KR')}</span>` : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn-delete" data-id="${item.id}" title="삭제">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `;

      elScheduleList.appendChild(card);
    });

    // Attach delete listeners
    elScheduleList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        deleteScheduleItem(id);
      });
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Delete Schedule Handler
  async function deleteScheduleItem(id) {
    if (!confirm('이 알림 예약을 삭제하시겠습니까?')) return;

    schedulesData.schedules = schedulesData.schedules.filter(s => s.id !== id);
    const success = await saveSchedulesToGitHub('chore: delete notification schedule');
    
    if (success) {
      showToast('알림 예약을 삭제했습니다.', 'info');
      renderDashboard();
    }
  }

  // Form Submit Handler (Add Schedule)
  elForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const sentToday = getSentTodayCount();
    if (sentToday >= (schedulesData.daily_limit || DAILY_MAX_LIMIT)) {
      showToast(`오늘 일일 최대 알림 한도(${DAILY_MAX_LIMIT}회)에 도달하여 추가 예약을 할 수 없습니다.`, 'error');
      return;
    }

    const title = elInputTitle.value.trim();
    const datetimeVal = elInputDatetime.value; // e.g. "2026-08-02T23:49"
    const message = elInputMessage.value.trim();
    const immediateTrigger = elCheckImmediateTrigger.checked;

    if (!title || !datetimeVal || !message) {
      showToast('모든 양식을 입력해주세요.', 'warning');
      return;
    }

    // Past Time Validation Check
    const selectedDt = new Date(datetimeVal);
    const now = new Date();
    if (selectedDt <= now) {
      showToast('⚠️ 예약 시간은 현재 시각 이후여야 합니다. (지나간 과거 시간은 예약할 수 없습니다)', 'warning');
      elInputDatetime.focus();
      return;
    }

    // Recipient Extraction
    const recipientVal = elSelectRecipient ? elSelectRecipient.value : '';
    let targetChatId = '';
    let targetRecipientName = '';

    if (recipientVal === '__direct__') {
      targetChatId = elInputDirectChatId ? elInputDirectChatId.value.trim() : '';
      targetRecipientName = '직접 입력';
      if (!targetChatId) {
        showToast('직접 입력할 Telegram Chat ID를 입력해주세요.', 'warning');
        if (elInputDirectChatId) elInputDirectChatId.focus();
        return;
      }
    } else if (recipientVal) {
      targetChatId = recipientVal;
      const selectedOpt = elSelectRecipient.options[elSelectRecipient.selectedIndex];
      targetRecipientName = selectedOpt ? selectedOpt.getAttribute('data-name') || '' : '';
    } else {
      // Fallback to default chat ID
      targetChatId = config.tgChatId;
      targetRecipientName = config.tgChatId ? '기본 수신자' : '';
    }

    if (!targetChatId) {
      showToast('⚠️ 수신 대상(Telegram Chat ID)이 지정되지 않았습니다. 주소록에서 선택하거나 설정에서 기본 Chat ID를 등록해주세요.', 'warning');
      if (elSelectRecipient) elSelectRecipient.focus();
      return;
    }

    // Absolutely exact string formatting for KST (+09:00)
    const formattedDatetime = datetimeVal.length === 16 ? `${datetimeVal}:00` : datetimeVal;
    const isoKstStr = `${formattedDatetime}+09:00`;

    const newItem = {
      id: 'item_' + Date.now(),
      title: title,
      message: message,
      datetime: isoKstStr,
      chat_id: targetChatId,
      recipient_name: targetRecipientName,
      created_by: currentUser ? currentUser.login : (config.ghOwner || 'user'),
      status: 'pending',
      created_at: new Date().toISOString(),
      sent_at: null
    };

    schedulesData.schedules.push(newItem);

    elBtnSubmitSchedule.disabled = true;
    elBtnSubmitSchedule.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

    const success = await saveSchedulesToGitHub(`feat: add schedule '${title}' to ${targetRecipientName || targetChatId}`);

    if (success) {
      showToast(`알림 '${title}'이 성공적으로 예약되었습니다! (수신: ${targetRecipientName || targetChatId})`, 'success');
      elForm.reset();
      setDefaultDatetimePicker();
      populateRecipientDropdown();
      renderDashboard();

      if (immediateTrigger) {
        // GitHub API 동기화 지연 대비 2초 대기 후 워크플로우 실행
        await new Promise(resolve => setTimeout(resolve, 2000));
        await triggerWorkflowDispatch();
      }
    }

    elBtnSubmitSchedule.disabled = false;
    elBtnSubmitSchedule.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>알림 예약 등록하기</span>';
  });

  // Modal Open / Close Logic
  function openModal() { elSettingsModal.classList.add('active'); }
  function closeModal() { elSettingsModal.classList.remove('active'); }

  elBtnOpenSettings.addEventListener('click', () => {
    populateConfigInputs();
    openModal();
  });
  elBtnCloseSettings.addEventListener('click', closeModal);
  elBtnCancelSettings.addEventListener('click', closeModal);

  elBtnSaveSettings.addEventListener('click', async () => {
    config.ghOwner = elGhOwner.value.trim();
    config.ghRepo = elGhRepo.value.trim();
    config.ghToken = elGhToken.value.trim();
    config.tgToken = elTgToken.value.trim();
    config.tgChatId = elTgChatId.value.trim();

    localStorage.setItem(STORAGE_KEYS.GH_OWNER, config.ghOwner);
    localStorage.setItem(STORAGE_KEYS.GH_REPO, config.ghRepo);
    localStorage.setItem(STORAGE_KEYS.GH_TOKEN, config.ghToken);
    localStorage.setItem(STORAGE_KEYS.TG_TOKEN, config.tgToken);
    localStorage.setItem(STORAGE_KEYS.TG_CHAT_ID, config.tgChatId);

    showToast('설정이 성공적으로 저장되었습니다.', 'success');
    closeModal();

    // Re-verify PAT user and reload contacts
    if (config.ghToken) {
      await fetchGitHubUser(config.ghToken);
    } else {
      currentUser = null;
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      updateUserProfileUI();
    }

    await loadContacts();

    if (config.ghOwner && config.ghRepo) {
      fetchSchedulesFromGitHub();
    }
  });

  elBtnTestTelegram.addEventListener('click', testTelegramMessage);
  elBtnRefresh.addEventListener('click', () => {
    fetchSchedulesFromGitHub();
    loadContacts();
  });
  elBtnManualDispatch.addEventListener('click', triggerWorkflowDispatch);

  // Recipient Dropdown Events
  if (elSelectRecipient) {
    elSelectRecipient.addEventListener('change', handleRecipientChange);
  }
  if (elBtnManageRecipientsFromForm) {
    elBtnManageRecipientsFromForm.addEventListener('click', () => {
      populateConfigInputs();
      openModal();
    });
  }
  if (elBtnAddContact) {
    elBtnAddContact.addEventListener('click', addContact);
  }

  // Realtime PAT validation on input change inside modal
  if (elGhToken) {
    elGhToken.addEventListener('blur', async () => {
      const token = elGhToken.value.trim();
      if (token) {
        showToast('GitHub PAT 토큰 검증 중...', 'info');
        const user = await fetchGitHubUser(token);
        if (user) {
          showToast(`@${user.login} 님으로 인증되었습니다!`, 'success');
          loadContacts();
        } else {
          showToast('토큰 검증 실패: 유효하지 않거나 만료된 PAT 토큰입니다.', 'warning');
        }
      }
    });
  }

  // Tab Handler
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeTab = e.target.getAttribute('data-tab');
      renderDashboard();
    });
  });

  // App Initialization
  (async function initApp() {
    populateConfigInputs();
    setDefaultDatetimePicker();

    // Verify token & fetch user if token exists
    if (config.ghToken) {
      await fetchGitHubUser(config.ghToken);
    } else {
      updateUserProfileUI();
    }

    await loadContacts();

    if (config.ghOwner && config.ghRepo) {
      fetchSchedulesFromGitHub();
    } else {
      renderDashboard();
    }
  })();

});
