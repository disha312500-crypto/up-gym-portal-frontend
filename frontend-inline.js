
    var GYMNAST_ICON_DATA = "data:image/svg+xml;utf8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">' +
      '<defs><linearGradient id="g" x1="0%" y1="100%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#06b6d4"/><stop offset="35%" stop-color="#4f46e5"/>' +
      '<stop offset="70%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f59e0b"/>' +
      '</linearGradient></defs>' +
      '<circle cx="120" cy="120" r="112" fill="#ffffff" stroke="url(#g)" stroke-width="10"/>' +
      '<circle cx="75" cy="52" r="6" fill="#ec4899"/><circle cx="172" cy="58" r="5" fill="#f59e0b"/>' +
      '<circle cx="184" cy="115" r="6" fill="#06b6d4"/><circle cx="68" cy="160" r="5" fill="#8b5cf6"/>' +
      '<circle cx="122" cy="74" r="14" fill="url(#g)"/>' +
      '<path d="M88 30 Q95 58 112 82 L102 118 L48 195 L62 202 L118 134 L198 76 L190 65 L128 106 L124 84 Q152 64 176 72 L180 62 Q148 50 116 72 Q98 50 98 26 Z" fill="url(#g)"/>' +
      '</svg>'
    );

    function imgFallback(el) {
      if (el) {
        el.onerror = null;
        el.src = GYMNAST_ICON_DATA;
      }
    }

    var DISTRICTS = [
      "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich",
      "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr",
      "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad",
      "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi",
      "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kushinagar", "Lakhimpur Kheri", "Lalitpur", "Lucknow", "Maharajganj",
      "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh",
      "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar",
      "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"
    ];

    var DEFAULT_FAC = [
      { id: 'f1', name: 'Classroom 101 (Boys Wing)', gender: 'Male Wing', capacity: 30 },
      { id: 'f2', name: 'Classroom 102 (Boys Wing)', gender: 'Male Wing', capacity: 30 },
      { id: 'f3', name: 'Classroom 103 (Girls Pink Wing)', gender: 'Female Pink Wing', capacity: 30 },
      { id: 'f4', name: 'Classroom 104 (Girls Pink Wing)', gender: 'Female Pink Wing', capacity: 30 },
      { id: 'f5', name: 'Male Hostel Wing A', gender: 'Male Wing', capacity: 50 },
      { id: 'f6', name: 'Female Pink Hostel Wing B', gender: 'Female Pink Wing', capacity: 50 }
    ];

    // Portal API: account and shared championship data are stored in MongoDB.
    var API_BASE_URL = 'https://up-gym-portal-backend.onrender.com/api';
    function loadLocal(k, def) {
      try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
    }
    var facilities = loadLocal('upga_fac_v20', DEFAULT_FAC);
    var teams = loadLocal('upga_teams_v20', []);
    var officials = loadLocal('upga_off_v20', []);
    var deletedIds = loadLocal('upga_del_v20', []);
    var currentUser = null;
    var activeLoginRole = 'coach';
    var previousPage = 'viewHome';
    var curSlide = 0;
    var slidePaused = false;
    var isSyncing = false;
    var districtTeamCount = 0;
    var lastSavedTeamId = null;
    var lastSavedOfficialId = null;

    function saveLocalOnly() {
      try {
        (teams || []).forEach(function(x) { if (x) { delete x.ownerPin; delete x.pin; } });
        (officials || []).forEach(function(x) { if (x) { delete x.ownerPin; delete x.pin; } });
        localStorage.setItem('upga_fac_v20', JSON.stringify(facilities));
        localStorage.setItem('upga_teams_v20', JSON.stringify(teams));
        localStorage.setItem('upga_off_v20', JSON.stringify(officials));
        localStorage.setItem('upga_del_v20', JSON.stringify(deletedIds));
      } catch (e) {}
    }
    function mergeById(localArr, remoteArr) {
      var map = {};
      (Array.isArray(remoteArr) ? remoteArr : []).forEach(function(item) { if (item && item.id) map[item.id] = item; });
      (Array.isArray(localArr) ? localArr : []).forEach(function(item) {
        if (item && item.id && (!map[item.id] || Number(item.updatedAt || 0) >= Number(map[item.id].updatedAt || 0))) map[item.id] = item;
      });
      return Object.keys(map).map(function(k) { return map[k]; }).sort(function(a,b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
    }
    function getPortalToken() { return currentUser && currentUser.role === 'admin' ? sessionStorage.getItem('upga_admin_token') : (currentUser && currentUser.token); }
    async function apiRequest(path, options) {
      options = options || {};
      options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
      var token = getPortalToken();
      if (token) options.headers.Authorization = 'Bearer ' + token;
      var response = await fetch(API_BASE_URL + path, options);
      var data = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(data.message || ('Request failed (' + response.status + ')'));
      return data;
    }
    function saveStore() {
      saveLocalOnly();
      if (!currentUser) return;
      // Never replace the server snapshot with a browser snapshot from a coach/official.
      if (currentUser.role === 'admin') {
        apiRequest('/portal-data', { method: 'PUT', body: JSON.stringify({ facilities: facilities, teams: teams.map(function(x) { var y = Object.assign({}, x); delete y.ownerPin; delete y.pin; return y; }), officials: officials.map(function(x) { var y = Object.assign({}, x); delete y.ownerPin; delete y.pin; return y; }), deletedIds: deletedIds }) })
          .catch(function(err) { setLoginStatus('Could not save portal changes: ' + err.message, false); });
      } else if (currentUser.role === 'coach') {
        var latestTeam = teams.length ? teams[0] : null;
        if (latestTeam && latestTeam.id !== lastSavedTeamId) {
          lastSavedTeamId = latestTeam.id;
          var payload = Object.assign({}, latestTeam, { ownerUserId: currentUser.id }); delete payload.ownerPin;
          apiRequest('/portal-data/teams', { method: 'POST', body: JSON.stringify(payload) })
            .then(function() { return syncFromCloud(false); })
            .catch(function(err) { lastSavedTeamId = null; alert('Team request was not saved to the server: ' + err.message); });
        }
      } else if (currentUser.role === 'official') {
        var latestOfficial = officials.length ? officials[0] : null;
        if (latestOfficial && latestOfficial.id !== lastSavedOfficialId) {
          lastSavedOfficialId = latestOfficial.id;
          var officialPayload = Object.assign({}, latestOfficial, { ownerUserId: currentUser.id }); delete officialPayload.ownerPin;
          apiRequest('/portal-data/officials', { method: 'POST', body: JSON.stringify(officialPayload) })
            .then(function() { return syncFromCloud(false); })
            .catch(function(err) { lastSavedOfficialId = null; alert('Official request was not saved to the server: ' + err.message); });
        }
      }
    }
    async function syncFromCloud(showAlert) {
      if (isSyncing || !currentUser) return;
      isSyncing = true;
      try {
        var remote = await apiRequest('/portal-data', { method: 'GET' });
        if (currentUser.role === 'admin') {
          // Merge legacy local records with MongoDB records; do not auto-upload or delete anything here.
          teams = mergeById(teams, remote.teams || []);
          officials = mergeById(officials, remote.officials || []);
          if (Array.isArray(remote.facilities) && remote.facilities.length) facilities = mergeById(facilities, remote.facilities);
          deletedIds = Array.from(new Set((deletedIds || []).concat(remote.deletedIds || [])));
        } else if (currentUser.role === 'coach') {
          districtTeamCount = Number(remote.districtTeamCount || 0);
          teams = remote.teams || [];
          officials = [];
        } else if (currentUser.role === 'official') {
          officials = remote.officials || [];
          teams = [];
        }
        saveLocalOnly();
        refreshCurrentActiveView();
      } catch (err) {
        if (showAlert) alert('Could not load saved portal data: ' + err.message);
      } finally { isSyncing = false; }
    }
    function syncAndPushCloud() { saveStore(); }
    function refreshCurrentActiveView() {
      if (previousPage === 'viewCoachPortal') renderCoachView();
      if (previousPage === 'viewOfficialPortal') renderOfficialView();
      if (previousPage === 'viewAdminPortal') renderAdminView();
    }
    // Poll only while signed in. The API returns role-filtered data.
    setInterval(function() { if (currentUser) syncFromCloud(false); }, 15000);

    // Populate 75 UP Districts
    var distSelect = document.getElementById('inputLoginDistrict');
    if (distSelect) {
      var dHtml = '';
      for (var i = 0; i < DISTRICTS.length; i++) {
        dHtml += '<option value="' + DISTRICTS[i] + '">' + DISTRICTS[i] + '</option>';
      }
      distSelect.innerHTML = dHtml;
    }

    // Set default dates to today & +3 days
    function setDefaultDates() {
      var today = new Date().toISOString().split('T')[0];
      var next3 = new Date(new Date().getTime() + 3 * 86400000).toISOString().split('T')[0];
      if (document.getElementById('cCheckIn')) document.getElementById('cCheckIn').value = today;
      if (document.getElementById('cCheckOut')) document.getElementById('cCheckOut').value = next3;
      if (document.getElementById('oDateIn')) document.getElementById('oDateIn').value = today;
      if (document.getElementById('oDateOut')) document.getElementById('oDateOut').value = next3;
    }
    setDefaultDates();

    function showPage(pageId) {
      if (pageId === 'viewCoachPortal' && (!currentUser || currentUser.role !== 'coach')) { openLoginScreen('coach'); return; }
      if (pageId === 'viewOfficialPortal' && (!currentUser || currentUser.role !== 'official')) { openLoginScreen('official'); return; }
      if (pageId === 'viewAdminPortal' && (!currentUser || currentUser.role !== 'admin' || !sessionStorage.getItem('upga_admin_token'))) { openLoginScreen('admin'); return; }
      var pages = ['viewHome', 'viewLogin', 'viewCoachPortal', 'viewOfficialPortal', 'viewAdminPortal', 'viewCertificate'];
      for (var i = 0; i < pages.length; i++) {
        var el = document.getElementById(pages[i]);
        if (el) el.className = 'view-section' + (pages[i] === 'viewCertificate' ? '' : ' no-print');
      }
      var target = document.getElementById(pageId);
      if (target) target.className += ' active';

      if (pageId !== 'viewCertificate' && pageId !== 'viewLogin') {
        previousPage = pageId;
      }
      if (pageId === 'viewCoachPortal') renderCoachView();
      if (pageId === 'viewOfficialPortal') renderOfficialView();
      if (pageId === 'viewAdminPortal') renderAdminView();
      window.scrollTo(0, 0);
    }

    function openLoginScreen(role) {
      selectRoleTab(role);
      showPage('viewLogin');
    }

    function setLoginStatus(message, success) {
      var status = document.getElementById('loginStatus');
      if (!status) return;
      status.textContent = message;
      status.style.display = message ? 'block' : 'none';
      status.style.background = success ? '#dcfce7' : '#fee2e2';
      status.style.color = success ? '#166534' : '#991b1b';
    }

    function selectRoleTab(role) {
      activeLoginRole = role;
      setLoginStatus('', false);
      var bCoach = document.getElementById('tabBtnCoach');
      var bOff = document.getElementById('tabBtnOfficial');
      var bAdm = document.getElementById('tabBtnAdmin');

      bCoach.style.background = 'transparent'; bCoach.style.color = '#475569';
      bOff.style.background = 'transparent'; bOff.style.color = '#475569';
      bAdm.style.background = 'transparent'; bAdm.style.color = '#475569';

      document.getElementById('fieldCoachDistrict').style.display = 'none';
      document.getElementById('fieldOfficialInfo').style.display = 'none';
      document.getElementById('fieldAdminUser').style.display = 'none';

      var lblPass = document.getElementById('lblPasswordInput');
      var notePin = document.getElementById('pinPrivacyNote');

      if (role === 'coach') {
        bCoach.style.background = '#ffffff'; bCoach.style.color = '#1e1b4b';
        document.getElementById('fieldCoachDistrict').style.display = 'block';
        lblPass.innerText = 'Enter Your PIN (first login creates your account)';
        notePin.style.display = 'block';
      } else if (role === 'official') {
        bOff.style.background = '#db2777'; bOff.style.color = '#ffffff';
        document.getElementById('fieldOfficialInfo').style.display = 'block';
        lblPass.innerText = 'Enter Your PIN (first login creates your account)';
        notePin.style.display = 'block';
      } else {
        bAdm.style.background = '#1e1b4b'; bAdm.style.color = '#ffffff';
        document.getElementById('fieldAdminUser').style.display = 'block';
        lblPass.innerText = 'Master Administrator Password';
        notePin.style.display = 'none';
      }
    }

    async function submitLoginForm(e) {
      e.preventDefault();
      setLoginStatus('', false);
      var button = document.querySelector('#viewLogin form button[type="submit"]');
      if (button) { button.classList.remove('login-ripple'); void button.offsetWidth; button.classList.add('login-ripple'); button.disabled = true; button.addEventListener('animationend', function clearRipple() { button.classList.remove('login-ripple'); }, { once: true }); }
      var pass = document.getElementById('inputLoginPassword').value.trim();
      try {
        if (activeLoginRole === 'coach' || activeLoginRole === 'official') {
          var isCoach = activeLoginRole === 'coach';
          var name = document.getElementById(isCoach ? 'inputCoachLoginName' : 'inputOfficialName').value.trim();
          var mobile = document.getElementById(isCoach ? 'inputCoachLoginMobile' : 'inputOfficialMobile').value.replace(/\D/g, '');
          var district = isCoach ? document.getElementById('inputLoginDistrict').value : '';
          if (!name || mobile.length !== 10 || !/^\d{4,12}$/.test(pass)) {
            setLoginStatus('Enter your name, valid 10-digit mobile number, and a PIN of 4–12 digits.', false); return;
          }
          var result = await apiRequest('/auth/portal/login', { method: 'POST', headers: {}, body: JSON.stringify({ role: activeLoginRole, name: name, mobile: mobile, district: district, pin: pass }) });
          currentUser = { id: result.user.id, token: result.token, role: result.user.role, name: result.user.name, mobile: result.user.mobile, district: result.user.district || district, label: result.user.name + (isCoach ? ' (' + (result.user.district || district) + ')' : '') };
          if (isCoach) { document.getElementById('cCoachName').value = currentUser.name; document.getElementById('cCoachMobile').value = currentUser.mobile; }
          setLoginStatus(result.created ? 'Account created successfully. You are now signed in.' : 'Login successful.', true);
          refreshTopBar();
          await syncFromCloud(false);
          showPage(isCoach ? 'viewCoachPortal' : 'viewOfficialPortal');
        } else {
          var adminUsername = document.getElementById('inputAdminUsername').value.trim();
          if (!adminUsername || !pass) { setLoginStatus('Enter both your administrator username and password.', false); return; }
          var adminResponse = await fetch(API_BASE_URL + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: adminUsername, password: pass }) });
          var adminResult = await adminResponse.json().catch(function() { return {}; });
          var returnedRole = adminResult.role || (adminResult.user && adminResult.user.role);
          if (!adminResponse.ok || !adminResult.token || returnedRole !== 'admin') throw new Error(adminResult.message || 'Wrong username or password.');
          sessionStorage.setItem('upga_admin_token', adminResult.token);
          currentUser = { id: adminResult.user && adminResult.user.id, token: adminResult.token, role: 'admin', label: 'Rohit Kumar (Admin)' };
          setLoginStatus('Login successful. Welcome, Administrator.', true);
          refreshTopBar();
          await syncFromCloud(false);
          showPage('viewAdminPortal');
        }
      } catch (error) {
        setLoginStatus(error.message || 'Unable to contact the login server. Try again.', false);
      } finally {
        document.getElementById('inputLoginPassword').value = '';
        if (button) button.disabled = false;
      }
    }

    function refreshTopBar() {
      var box = document.getElementById('topAuthButtons');
      if (!currentUser) {
        box.innerHTML = '<button type="button" class="btn-indigo" onclick="openLoginScreen(\'coach\')">Portal Login</button>';
      } else {
        var targetPage = currentUser.role === 'coach' ? 'viewCoachPortal' : (currentUser.role === 'official' ? 'viewOfficialPortal' : 'viewAdminPortal');
        box.innerHTML =
          '<button type="button" class="btn-outline btn-sm" onclick="showPage(\'' + targetPage + '\')">' + currentUser.label + '</button>' +
          '<button type="button" class="btn-danger btn-sm" onclick="doLogout()">Logout</button>';
      }
    }

    function doLogout() {
      sessionStorage.removeItem('upga_admin_token');
      currentUser = null;
      refreshTopBar();
      showPage('viewHome');
    }

    function updateCoachTotals() {
      var mp = parseInt(document.getElementById('cMalePlayers').value, 10) || 0;
      var ms = parseInt(document.getElementById('cMaleStaff').value, 10) || 0;
      var fp = parseInt(document.getElementById('cFemalePlayers').value, 10) || 0;
      var fs = parseInt(document.getElementById('cFemaleStaff').value, 10) || 0;
      document.getElementById('lblCoachMaleTotal').innerText = (mp + ms);
      document.getElementById('lblCoachFemaleTotal').innerText = (fp + fs);
      document.getElementById('lblCoachGrandTotal').innerText = (mp + ms + fp + fs);
    }

    function handleCoachSubmit(e) {
      e.preventDefault();
      if (!currentUser || currentUser.role !== 'coach') return;

      var distTeams = teams.filter(function(t) { return t.district === currentUser.district; });
      if (distTeams.length >= 4) {
        alert('Maximum 4 teams already submitted for ' + currentUser.district + '!');
        return;
      }

      var tNo = document.getElementById('cTeamNo').value;
      for (var i = 0; i < distTeams.length; i++) {
        if (distTeams[i].teamNo === tNo) {
          alert(tNo + ' is already registered for ' + currentUser.district + '. Please choose another Team Number.');
          return;
        }
      }

      var checkIn = document.getElementById('cCheckIn').value;
      var checkOut = document.getElementById('cCheckOut').value;
      if (!checkIn || !checkOut) {
        alert('Please select both Stay From (Check-In) and Stay To (Check-Out) dates.');
        return;
      }

      var mp = parseInt(document.getElementById('cMalePlayers').value, 10) || 0;
      var ms = parseInt(document.getElementById('cMaleStaff').value, 10) || 0;
      var fp = parseInt(document.getElementById('cFemalePlayers').value, 10) || 0;
      var fs = parseInt(document.getElementById('cFemaleStaff').value, 10) || 0;

      if (mp + ms + fp + fs <= 0) {
        alert('Please enter at least 1 Male or Female member.');
        return;
      }

      var now = new Date().getTime();
      teams.unshift({
        id: 't_' + now + '_' + Math.floor(Math.random() * 1000),
        createdAt: now,
        updatedAt: now,
        district: currentUser.district,
        teamNo: tNo,
        coach: document.getElementById('cCoachName').value.trim(),
        mobile: document.getElementById('cCoachMobile').value.trim(),
        ownerMobile: currentUser.mobile,
        ownerUserId: currentUser.id,
        checkIn: checkIn,
        checkOut: checkOut,
        malePlayers: mp,
        maleStaff: ms,
        maleBeds: mp + ms,
        maleWing: 'Pending Admin Allotment',
        maleRef: '-',
        femalePlayers: fp,
        femaleStaff: fs,
        femaleBeds: fp + fs,
        femaleWing: 'Pending Admin Allotment',
        femaleRef: '-',
        status: 'Pending Approval'
      });

      saveStore();
      renderCoachView();
      alert(currentUser.district + ' (' + tNo + ') submitted successfully.');
    }

    // STRICT PRIVACY: Coach only sees entries matching their own Mobile & PIN
    function renderCoachView() {
      if (!currentUser || currentUser.role !== 'coach') return;
      document.getElementById('badgeCoachDistrict').innerText = 'Coach: ' + currentUser.name + ' (' + currentUser.district + ')';

      var allDistTeams = teams.filter(function(t) { return t.district === currentUser.district; });
      document.getElementById('badgeCoachQuota').innerText = 'District Quota Used: ' + Math.max(districtTeamCount, allDistTeams.length) + ' / 4 Teams';

      var myPrivateTeams = teams.filter(function(t) {
        return t.district === currentUser.district &&
               (t.ownerUserId === currentUser.id || (!t.ownerUserId && t.ownerMobile === currentUser.mobile));
      });

      var tbody = document.getElementById('tbodyCoachTeams');
      if (myPrivateTeams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">No team requests submitted under your private Mobile &amp; PIN yet.</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < myPrivateTeams.length; i++) {
        var t = myPrivateTeams[i];
        var pillClass = t.status === 'Checked-Out' ? 'pill-checkout' : (t.status === 'Approved' ? 'pill-approved' : 'pill-pending');
        var btns = '<span style="font-size:11px; color:#92400e; font-weight:700;">Waiting Admin Approval</span>';

        if (t.status === 'Approved') {
          btns = '<button type="button" class="btn-indigo btn-sm" onclick="viewCertificate(\'' + t.id + '\', \'TEAM\', \'PASS\')">Print Boarding Pass</button>' +
                 '<div style="font-size:10px; color:#64748b; margin-top:4px;">[Locked] NOC Unlocks After Admin Checkout</div>';
        } else if (t.status === 'Checked-Out') {
          btns = '<button type="button" class="btn-outline btn-sm" onclick="viewCertificate(\'' + t.id + '\', \'TEAM\', \'PASS\')">Boarding Pass</button> ' +
                 '<button type="button" class="btn-emerald btn-sm" onclick="viewCertificate(\'' + t.id + '\', \'TEAM\', \'NOC\')">Print Checkout NOC</button>';
        }

        html += '<tr>' +
          '<td><span class="pill pill-approved">' + t.teamNo + '</span><div style="font-weight:800; margin-top:4px;">' + t.coach + ' (' + t.mobile + ')</div>' +
          '<div class="date-badge">Stay: ' + (t.checkIn || '-') + ' to ' + (t.checkOut || '-') + '</div></td>' +
          '<td class="col-male"><strong>' + t.maleBeds + ' Male Beds</strong> (B:' + t.malePlayers + ', S:' + t.maleStaff + ')<div style="font-size:11px; margin-top:2px;">' + t.maleWing + ' (' + t.maleRef + ')</div></td>' +
          '<td class="col-pink"><strong>' + t.femaleBeds + ' Female Beds</strong> (G:' + t.femalePlayers + ', S:' + t.femaleStaff + ')<div style="font-size:11px; margin-top:2px;">' + t.femaleWing + ' (' + t.femaleRef + ')</div></td>' +
          '<td><span class="pill ' + pillClass + '">' + t.status + '</span></td>' +
          '<td style="text-align:right;">' + btns + '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    }

    function handleOfficialSubmit(e) {
      e.preventDefault();
      if (!currentUser || currentUser.role !== 'official') return;

      var mb = parseInt(document.getElementById('oMaleBeds').value, 10) || 0;
      var fb = parseInt(document.getElementById('oFemaleBeds').value, 10) || 0;
      if (mb + fb <= 0) { alert('Please enter at least 1 bed.'); return; }

      var dIn = document.getElementById('oDateIn').value;
      var dOut = document.getElementById('oDateOut').value;
      var now = new Date().getTime();

      officials.unshift({
        id: 'o_' + now + '_' + Math.floor(Math.random() * 1000),
        createdAt: now,
        updatedAt: now,
        name: currentUser.name,
        mobile: currentUser.mobile,
        ownerUserId: currentUser.id,
        role: document.getElementById('oRole').value,
        city: document.getElementById('oCity').value.trim(),
        checkIn: dIn,
        checkOut: dOut,
        maleBeds: mb,
        maleWing: 'Pending Admin Allotment',
        maleRef: '-',
        femaleBeds: fb,
        femaleWing: 'Pending Admin Allotment',
        femaleRef: '-',
        status: 'Pending Approval'
      });

      saveStore();
      renderOfficialView();
      alert('Official accommodation request submitted successfully.');
    }

    function renderOfficialView() {
      if (!currentUser || currentUser.role !== 'official') return;
      document.getElementById('badgeOfficialUser').innerText = currentUser.name + ' (' + currentUser.mobile + ')';
      var myOff = officials.filter(function(o) {
        return o.ownerUserId === currentUser.id || (!o.ownerUserId && o.mobile === currentUser.mobile);
      });
      var tbody = document.getElementById('tbodyOfficialSelf');

      if (myOff.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">No request submitted under your private Mobile &amp; PIN yet.</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < myOff.length; i++) {
        var o = myOff[i];
        var pillClass = o.status === 'Checked-Out' ? 'pill-checkout' : (o.status === 'Approved' ? 'pill-approved' : 'pill-pending');
        var btns = '<span style="font-size:11px; color:#92400e; font-weight:700;">Waiting Admin Approval</span>';

        if (o.status === 'Approved') {
          btns = '<button type="button" class="btn-indigo btn-sm" onclick="viewCertificate(\'' + o.id + '\', \'OFFICIAL\', \'PASS\')">Print Boarding Pass</button>' +
                 '<div style="font-size:10px; color:#64748b; margin-top:4px;">[Locked] NOC Unlocks After Admin Checkout</div>';
        } else if (o.status === 'Checked-Out') {
          btns = '<button type="button" class="btn-outline btn-sm" onclick="viewCertificate(\'' + o.id + '\', \'OFFICIAL\', \'PASS\')">Boarding Pass</button> ' +
                 '<button type="button" class="btn-emerald btn-sm" onclick="viewCertificate(\'' + o.id + '\', \'OFFICIAL\', \'NOC\')">Print Checkout NOC</button>';
        }

        html += '<tr>' +
          '<td><strong>' + o.name + '</strong><div style="font-size:11px; color:#64748b;">' + o.role + ' - ' + o.city + '</div>' +
          '<div class="date-badge">Stay: ' + (o.checkIn || '-') + ' to ' + (o.checkOut || '-') + '</div></td>' +
          '<td class="col-male"><strong>' + o.maleBeds + ' Male Bed(s)</strong><div style="font-size:11px;">' + o.maleWing + ' (' + o.maleRef + ')</div></td>' +
          '<td class="col-pink"><strong>' + o.femaleBeds + ' Female Bed(s)</strong><div style="font-size:11px;">' + o.femaleWing + ' (' + o.femaleRef + ')</div></td>' +
          '<td><span class="pill ' + pillClass + '">' + o.status + '</span></td>' +
          '<td style="text-align:right;">' + btns + '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    }

    function calcWingStats(wName, cap) {
      var occ = 0;
      var list = [];
      for (var i = 0; i < teams.length; i++) {
        var t = teams[i];
        if (t.status === 'Approved') {
          if (t.maleWing === wName) { occ += Number(t.maleBeds || 0); list.push(t.district + ' ' + t.teamNo + ' (M)'); }
          if (t.femaleWing === wName) { occ += Number(t.femaleBeds || 0); list.push(t.district + ' ' + t.teamNo + ' (F)'); }
        }
      }
      for (var j = 0; j < officials.length; j++) {
        var o = officials[j];
        if (o.status === 'Approved') {
          if (o.maleWing === wName) { occ += Number(o.maleBeds || 0); list.push(o.name + ' (M)'); }
          if (o.femaleWing === wName) { occ += Number(o.femaleBeds || 0); list.push(o.name + ' (F)'); }
        }
      }
      return { occupied: occ, vacant: Math.max(0, cap - occ), list: list };
    }

    function renderSlideshow() {
      var box = document.getElementById('slideshowContent');
      if (!box || facilities.length === 0) return;
      if (curSlide >= facilities.length) curSlide = 0;
      var f = facilities[curSlide];
      var st = calcWingStats(f.name, f.capacity);

      box.innerHTML =
        '<div class="grid-3" style="align-items:center;">' +
          '<div>' +
            '<span class="badge-gold" style="background:' + (f.gender === 'Female Pink Wing' ? '#ec4899' : '#6366f1') + '; color:#fff;">' + f.gender + '</span>' +
            '<h4 style="font-size:20px; font-weight:800; margin-top:6px;">' + f.name + '</h4>' +
            '<div style="font-size:11px; opacity:0.8;">Classroom Slide ' + (curSlide + 1) + ' of ' + facilities.length + '</div>' +
          '</div>' +
          '<div style="display:flex; gap:18px; background:rgba(255,255,255,0.1); padding:12px 18px; border-radius:14px; justify-content:space-around; text-align:center;">' +
            '<div><div style="font-size:10px; opacity:0.8;">CAPACITY</div><div style="font-size:18px; font-weight:800;">' + f.capacity + '</div></div>' +
            '<div><div style="font-size:10px; color:#fde68a;">OCCUPIED</div><div style="font-size:18px; font-weight:800; color:#fde68a;">' + st.occupied + '</div></div>' +
            '<div><div style="font-size:10px; color:#6ee7b7;">VACANT BEDS</div><div style="font-size:18px; font-weight:800; color:#6ee7b7;">' + st.vacant + '</div></div>' +
          '</div>' +
          '<div style="font-size:12px;">' +
            '<strong>Teams Staying (' + st.list.length + '):</strong>' +
            '<div style="opacity:0.9; margin-top:4px;">' + (st.list.length ? st.list.join(', ') : 'No active contingent allotted') + '</div>' +
          '</div>' +
        '</div>';
    }

    function changeSlide(dir) {
      if (facilities.length === 0) return;
      curSlide = (curSlide + dir + facilities.length) % facilities.length;
      renderSlideshow();
    }

    function toggleSlidePause() {
      slidePaused = !slidePaused;
      document.getElementById('btnPauseSlide').innerText = slidePaused ? 'Resume' : 'Pause';
    }

    setInterval(function() {
      if (!slidePaused && previousPage === 'viewAdminPortal') {
        changeSlide(1);
      }
    }, 3500);

    function renderAdminView() {
      renderSlideshow();

      var gHtml = '';
      for (var i = 0; i < facilities.length; i++) {
        var f = facilities[i];
        var st = calcWingStats(f.name, f.capacity);
        var isPink = f.gender === 'Female Pink Wing';
        gHtml +=
          '<div class="card" style="margin-bottom:0; padding:18px; background:' + (isPink ? '#fdf2f8' : '#ffffff') + '; border-color:' + (isPink ? '#f9a8d4' : '#e2e8f0') + ';">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              '<span class="pill" style="background:' + (isPink ? '#db2777' : '#312e81') + '; color:#fff;">' + f.gender + '</span>' +
              '<div style="display:flex; gap:4px;">' +
                '<button type="button" class="btn-outline btn-sm" onclick="editFacility(\'' + f.id + '\')">Edit</button>' +
                '<button type="button" class="btn-danger btn-sm" onclick="removeFacility(\'' + f.id + '\')">Delete</button>' +
              '</div>' +
            '</div>' +
            '<h4 style="font-size:16px; font-weight:800; margin:10px 0;">' + f.name + '</h4>' +
            '<div style="display:flex; justify-content:space-between; background:#fff; padding:10px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:8px; font-size:12px;">' +
              '<span>Staying: <strong>' + st.list.length + '</strong></span>' +
              '<span style="color:#059669; font-weight:800;">Vacant: ' + st.vacant + ' / ' + f.capacity + '</span>' +
            '</div>' +
            '<div style="font-size:11px; color:#475569;"><strong>Teams:</strong> ' + (st.list.length ? st.list.join(', ') : 'None') + '</div>' +
          '</div>';
      }
      document.getElementById('gridAdminFacilities').innerHTML = gHtml;

      var tHtml = '';
      if (teams.length === 0) {
        tHtml = '<tr><td colspan="5" style="text-align:center; padding:24px; color:#64748b;">No district team applications received yet.</td></tr>';
      } else {
        for (var k = 0; k < teams.length; k++) {
          var t = teams[k];
          var pCls = t.status === 'Checked-Out' ? 'pill-checkout' : (t.status === 'Approved' ? 'pill-approved' : 'pill-pending');
          var checkoutBtn = t.status === 'Approved'
            ? '<button type="button" class="btn-gold btn-sm" onclick="checkoutEntry(\'' + t.id + '\', \'TEAM\')">Checkout &amp; Unlock NOC</button> '
            : '';
          var nocBtn = t.status === 'Checked-Out'
            ? '<button type="button" class="btn-emerald btn-sm" onclick="viewCertificate(\'' + t.id + '\', \'TEAM\', \'NOC\')">NOC</button> '
            : '';

          tHtml += '<tr>' +
            '<td><strong>' + t.district + '</strong> <span class="pill pill-approved">' + t.teamNo + '</span>' +
            '<div style="font-size:11px; color:#64748b; margin-top:2px;">Coach: ' + t.coach + ' (' + t.mobile + ')</div>' +
            '<div class="date-badge">Stay: ' + (t.checkIn || '-') + ' to ' + (t.checkOut || '-') + '</div></td>' +
            '<td class="col-male"><strong>' + t.maleBeds + ' Beds</strong> (B:' + t.malePlayers + ', S:' + t.maleStaff + ')<div style="font-size:11px;">' + t.maleWing + ' (' + t.maleRef + ')</div></td>' +
            '<td class="col-pink"><strong>' + t.femaleBeds + ' Beds</strong> (G:' + t.femalePlayers + ', S:' + t.femaleStaff + ')<div style="font-size:11px;">' + t.femaleWing + ' (' + t.femaleRef + ')</div></td>' +
            '<td><span class="pill ' + pCls + '">' + t.status + '</span></td>' +
            '<td style="text-align:right; white-space:nowrap;">' +
              '<button type="button" class="btn-indigo btn-sm" onclick="openAllotPopup(\'' + t.id + '\', \'TEAM\')">' + (t.status === 'Pending Approval' ? 'Approve &amp; Allot' : 'Edit Wings') + '</button> ' +
              checkoutBtn +
              '<button type="button" class="btn-outline btn-sm" onclick="viewCertificate(\'' + t.id + '\', \'TEAM\', \'PASS\')">Pass</button> ' +
              nocBtn +
              '<button type="button" class="btn-danger btn-sm" onclick="deleteTeamEntry(\'' + t.id + '\')">Delete</button>' +
            '</td>' +
          '</tr>';
        }
      }
      document.getElementById('tbodyAdminTeams').innerHTML = tHtml;

      var oHtml = '';
      if (officials.length === 0) {
        oHtml = '<tr><td colspan="5" style="text-align:center; padding:24px; color:#64748b;">No official applications received yet.</td></tr>';
      } else {
        for (var m = 0; m < officials.length; m++) {
          var o = officials[m];
          var opCls = o.status === 'Checked-Out' ? 'pill-checkout' : (o.status === 'Approved' ? 'pill-approved' : 'pill-pending');
          var oCheckoutBtn = o.status === 'Approved'
            ? '<button type="button" class="btn-gold btn-sm" onclick="checkoutEntry(\'' + o.id + '\', \'OFFICIAL\')">Checkout &amp; Unlock NOC</button> '
            : '';
          var oNocBtn = o.status === 'Checked-Out'
            ? '<button type="button" class="btn-emerald btn-sm" onclick="viewCertificate(\'' + o.id + '\', \'OFFICIAL\', \'NOC\')">NOC</button> '
            : '';

          oHtml += '<tr>' +
            '<td><strong>' + o.name + '</strong> (' + o.role + ')<div style="font-size:11px; color:#64748b;">' + o.mobile + ' - ' + o.city + '</div>' +
            '<div class="date-badge">Stay: ' + (o.checkIn || '-') + ' to ' + (o.checkOut || '-') + '</div></td>' +
            '<td class="col-male"><strong>' + o.maleBeds + ' Male Bed(s)</strong><div style="font-size:11px;">' + o.maleWing + ' (' + o.maleRef + ')</div></td>' +
            '<td class="col-pink"><strong>' + o.femaleBeds + ' Female Bed(s)</strong><div style="font-size:11px;">' + o.femaleWing + ' (' + o.femaleRef + ')</div></td>' +
            '<td><span class="pill ' + opCls + '">' + o.status + '</span></td>' +
            '<td style="text-align:right; white-space:nowrap;">' +
              '<button type="button" class="btn-indigo btn-sm" onclick="openAllotPopup(\'' + o.id + '\', \'OFFICIAL\')">' + (o.status === 'Pending Approval' ? 'Approve &amp; Allot' : 'Edit Wings') + '</button> ' +
              oCheckoutBtn +
              '<button type="button" class="btn-outline btn-sm" onclick="viewCertificate(\'' + o.id + '\', \'OFFICIAL\', \'PASS\')">Pass</button> ' +
              oNocBtn +
              '<button type="button" class="btn-danger btn-sm" onclick="deleteOfficialEntry(\'' + o.id + '\')">Delete</button>' +
            '</td>' +
          '</tr>';
        }
      }
      document.getElementById('tbodyAdminOfficials').innerHTML = oHtml;
    }

    function deleteTeamEntry(id) {
      if (!confirm('Are you sure you want to permanently DELETE this District Team entry?')) return;
      if (deletedIds.indexOf(id) === -1) deletedIds.push(id);
      teams = teams.filter(function(t) { return t.id !== id; });
      saveStore();
      renderAdminView();
    }

    function deleteOfficialEntry(id) {
      if (!confirm('Are you sure you want to permanently DELETE this Judge/Official entry?')) return;
      if (deletedIds.indexOf(id) === -1) deletedIds.push(id);
      officials = officials.filter(function(o) { return o.id !== id; });
      saveStore();
      renderAdminView();
    }

    function openAllotPopup(id, cat) {
      document.getElementById('allotItemId').value = id;
      document.getElementById('allotItemCategory').value = cat;

      var mOpts = '<option value="Not Applicable">Not Applicable (0 Male Beds)</option>';
      var fOpts = '<option value="Not Applicable">Not Applicable (0 Female Beds)</option>';
      for (var i = 0; i < facilities.length; i++) {
        if (facilities[i].gender === 'Male Wing') {
          mOpts += '<option value="' + facilities[i].name + '">' + facilities[i].name + '</option>';
        } else {
          fOpts += '<option value="' + facilities[i].name + '">' + facilities[i].name + '</option>';
        }
      }
      document.getElementById('selAllotMaleWing').innerHTML = mOpts;
      document.getElementById('selAllotFemaleWing').innerHTML = fOpts;

      var item = findRecord(id, cat);
      if (item) {
        document.getElementById('modalAllotInfo').innerText =
          (cat === 'TEAM' ? item.district + ' (' + item.teamNo + ')' : item.name) +
          ' | Stay: ' + (item.checkIn || '-') + ' to ' + (item.checkOut || '-') +
          ' | Male Beds: ' + item.maleBeds + ' | Female Pink Beds: ' + item.femaleBeds;
      }
      document.getElementById('modalAllot').className = 'modal-backdrop open no-print';
    }

    function saveAdminAllotment(e) {
      e.preventDefault();
      var id = document.getElementById('allotItemId').value;
      var cat = document.getElementById('allotItemCategory').value;
      var item = findRecord(id, cat);
      if (!item) return;

      item.maleWing = document.getElementById('selAllotMaleWing').value;
      item.maleRef = document.getElementById('inpAllotMaleRef').value.trim() || 'Allotted';
      item.femaleWing = document.getElementById('selAllotFemaleWing').value;
      item.femaleRef = document.getElementById('inpAllotFemaleRef').value.trim() || 'Allotted';
      item.status = 'Approved';
      item.updatedAt = new Date().getTime();

      saveStore();
      closeModal('modalAllot');
      renderAdminView();
    }

    function checkoutEntry(id, cat) {
      var item = findRecord(id, cat);
      if (!item) return;
      if (!confirm('Confirm Checkout? This will release their beds and unlock the Official Checkout NOC on their ID.')) return;
      item.status = 'Checked-Out';
      item.updatedAt = new Date().getTime();
      saveStore();
      renderAdminView();
      alert('Checked-Out! Official NOC is now unlocked on their portal.');
    }

    function findRecord(id, cat) {
      var arr = cat === 'TEAM' ? teams : officials;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr[i];
      }
      return null;
    }

    function openFacilityModal() {
      document.getElementById('modalFacilityHeading').innerText = 'Add New Classroom / Wing';
      document.getElementById('facEditId').value = '';
      document.getElementById('facName').value = '';
      document.getElementById('facCap').value = 30;
      document.getElementById('modalFacility').className = 'modal-backdrop open no-print';
    }

    function editFacility(id) {
      for (var i = 0; i < facilities.length; i++) {
        if (facilities[i].id === id) {
          document.getElementById('modalFacilityHeading').innerText = 'Edit Classroom / Wing';
          document.getElementById('facEditId').value = facilities[i].id;
          document.getElementById('facName').value = facilities[i].name;
          document.getElementById('facGender').value = facilities[i].gender;
          document.getElementById('facCap').value = facilities[i].capacity;
          document.getElementById('modalFacility').className = 'modal-backdrop open no-print';
          break;
        }
      }
    }

    function saveFacilityItem(e) {
      e.preventDefault();
      var id = document.getElementById('facEditId').value;
      var nm = document.getElementById('facName').value.trim();
      var gn = document.getElementById('facGender').value;
      var cp = parseInt(document.getElementById('facCap').value, 10) || 25;

      if (id) {
        for (var i = 0; i < facilities.length; i++) {
          if (facilities[i].id === id) {
            facilities[i].name = nm;
            facilities[i].gender = gn;
            facilities[i].capacity = cp;
          }
        }
      } else {
        facilities.push({ id: 'f_' + new Date().getTime(), name: nm, gender: gn, capacity: cp });
      }
      saveStore();
      closeModal('modalFacility');
      renderAdminView();
    }

    function removeFacility(id) {
      if (!confirm('Delete this classroom/wing?')) return;
      facilities = facilities.filter(function(f) { return f.id !== id; });
      saveStore();
      renderAdminView();
    }

    function openPassModal() {
      if (!currentUser || currentUser.role !== 'admin') { alert('Administrator login required.'); return; }
      document.getElementById('modalPassword').className = 'modal-backdrop open no-print';
    }

    async function saveNewPassword(e) {
      e.preventDefault();
      var currentPassword = document.getElementById('inpCurrentPass').value;
      var newPassword = document.getElementById('inpNewPass').value;
      var confirmPassword = document.getElementById('inpConfirmPass').value;
      if (newPassword.length < 10) { alert('Use at least 10 characters for the new password.'); return; }
      if (newPassword !== confirmPassword) { alert('New password and confirmation do not match.'); return; }
      try {
        await apiRequest('/auth/portal/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: currentPassword, newPassword: newPassword }) });
        ['inpCurrentPass','inpNewPass','inpConfirmPass'].forEach(function(id) { document.getElementById(id).value = ''; });
        closeModal('modalPassword');
        sessionStorage.removeItem('upga_admin_token');
        currentUser = null; refreshTopBar(); openLoginScreen('admin');
        alert('Admin password changed. Please sign in again using the new password.');
      } catch (err) { alert('Password change failed: ' + err.message); }
    }

    function closeModal(id) {
      document.getElementById(id).className = 'modal-backdrop no-print';
    }

    function viewCertificate(id, cat, docType) {
      var item = findRecord(id, cat);
      if (!item) return;

      if (docType === 'NOC' && item.status !== 'Checked-Out') {
        alert('NOC is locked! It will unlock only after Admin marks this contingent as Checked-Out.');
        return;
      }

      document.getElementById('certDocTitle').innerText = docType === 'NOC'
        ? 'OFFICIAL CHECKOUT CLEARANCE NOC'
        : 'OFFICIAL ACCOMMODATION BOARDING PASS';
      document.getElementById('certDocSerial').innerText = 'SERIAL: #UPGA-' + id.slice(-5).toUpperCase();

      var body = document.getElementById('certBodyArea');
      if (cat === 'TEAM') {
        body.innerHTML =
          '<div class="grid-4" style="background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #cbd5e1; margin-bottom:16px;">' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">DISTRICT &amp; TEAM</div><div style="font-size:15px; font-weight:800;">' + item.district + ' - ' + item.teamNo + '</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">COACH / MANAGER</div><div style="font-size:15px; font-weight:800;">' + item.coach + ' (' + item.mobile + ')</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">STAY DURATION</div><div style="font-size:13px; font-weight:800; color:#312e81;">' + (item.checkIn || '-') + ' to ' + (item.checkOut || '-') + '</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">STATUS</div><div style="font-size:15px; font-weight:800; color:#059669;">' + item.status + '</div></div>' +
          '</div>' +
          '<div class="grid-2" style="margin-bottom:16px;">' +
            '<div class="box-male"><div style="font-size:11px; font-weight:800;">MALE CONTINGENT ALLOTMENT</div><div style="font-size:16px; font-weight:800; margin:4px 0;">' + item.maleBeds + ' Male Beds (Boys: ' + item.malePlayers + ', Staff: ' + item.maleStaff + ')</div><div style="font-size:12px; font-weight:700;">Wing: ' + item.maleWing + ' (' + item.maleRef + ')</div></div>' +
            '<div class="box-female-pink"><div style="font-size:11px; font-weight:800; color:#831843;">FEMALE CONTINGENT ALLOTMENT (PINK WING)</div><div style="font-size:16px; font-weight:800; color:#831843; margin:4px 0;">' + item.femaleBeds + ' Female Beds (Girls: ' + item.femalePlayers + ', Staff: ' + item.femaleStaff + ')</div><div style="font-size:12px; font-weight:700; color:#9d174d;">Wing: ' + item.femaleWing + ' (' + item.femaleRef + ')</div></div>' +
          '</div>' +
          '<div style="background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #cbd5e1; font-size:13px;">' +
            (docType === 'NOC'
              ? '<strong>OFFICIAL NO OBJECTION CERTIFICATE (NOC):</strong> Certified that <strong>' + item.district + ' (' + item.teamNo + ')</strong> led by Coach <strong>' + item.coach + '</strong> (Stay: ' + (item.checkIn || '-') + ' to ' + (item.checkOut || '-') + ') has officially checked out and handed over all allotted Male and Female beds in good condition with zero pending dues.'
              : '<strong>OFFICIAL BOARDING PASS:</strong> Please allow <strong>' + item.district + ' (' + item.teamNo + ')</strong> led by Coach <strong>' + item.coach + '</strong> to occupy the allotted Male Wing and Female Pink Wing beds from <strong>' + (item.checkIn || '-') + ' to ' + (item.checkOut || '-') + '</strong> during the UP State Gymnastics Championship 2026.') +
          '</div>';
      } else {
        body.innerHTML =
          '<div class="grid-4" style="background:#f8fafc; padding:14px; border-radius:12px; border:1px solid #cbd5e1; margin-bottom:16px;">' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">OFFICIAL NAME</div><div style="font-size:15px; font-weight:800;">' + item.name + '</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">ROLE &amp; CITY</div><div style="font-size:15px; font-weight:800;">' + item.role + ' (' + item.city + ')</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">STAY DURATION</div><div style="font-size:13px; font-weight:800; color:#312e81;">' + (item.checkIn || '-') + ' to ' + (item.checkOut || '-') + '</div></div>' +
            '<div><div style="font-size:10px; font-weight:800; color:#64748b;">STATUS</div><div style="font-size:15px; font-weight:800; color:#059669;">' + item.status + '</div></div>' +
          '</div>' +
          '<div class="grid-2">' +
            '<div class="box-male"><div style="font-size:11px; font-weight:800;">MALE OFFICIAL ALLOTMENT</div><div style="font-size:16px; font-weight:800; margin:4px 0;">' + item.maleBeds + ' Male Bed(s)</div><div style="font-size:12px; font-weight:700;">Wing: ' + item.maleWing + ' (' + item.maleRef + ')</div></div>' +
            '<div class="box-female-pink"><div style="font-size:11px; font-weight:800; color:#831843;">FEMALE OFFICIAL ALLOTMENT (PINK WING)</div><div style="font-size:16px; font-weight:800; color:#831843; margin:4px 0;">' + item.femaleBeds + ' Female Bed(s)</div><div style="font-size:12px; font-weight:700; color:#9d174d;">Wing: ' + item.femaleWing + ' (' + item.femaleRef + ')</div></div>' +
          '</div>';
      }

      showPage('viewCertificate');
    }

    function returnFromCertificate() {
      showPage(previousPage || 'viewHome');
    }

    // Pull latest cloud entries immediately on startup
    syncFromCloud(false);
  

  import { initializeApp, getApps, getApp }
    from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";

 
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";


  import { getAuth }
    from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDcNwomeXmtiNCvuXnzkweWFdPT3se-UU4",
    authDomain: "up-state-gym-accommodation.firebaseapp.com",
    projectId: "up-state-gym-accommodation",
    storageBucket: "up-state-gym-accommodation.firebasestorage.app",
    messagingSenderId: "340921662733",
    appId: "1:340921662733:web:cfb5e5dbd2e6d17e07c444"
  };

  const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  window.firebaseDb = getFirestore(app);
  window.firebaseAuth = getAuth(app);

  console.log("Firebase initialized successfully");
getDoc(doc(window.firebaseDb, "_connection_test", "ping"))
  .then(() => {
    console.log("Firestore request succeeded.");
  })
  .catch((error) => {
    console.log("Firestore test result:", error.code);
  });
