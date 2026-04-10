/**
 * 會議積分系統 - UI 與計分邏輯 (V2 Cache-Bust)
 */
import { saveMeetingData, saveRedemptionData, deleteRedemptionData, deleteMeeting, updateMeetingRecordsData } from './api_v2.js?v=5.19';

class UI {
    constructor() {
        this.currentMeeting = null;
        this.currentRecords = {};
        this.POINTS = { ASK_FIRST: 30, ASK: 10, REPLY: 3 };
        this.PRIZES = [
            { id: 'p1', name: '星巴克VIP候機室', enName: 'Starbucks VIP Lounge', desc: '(飲料券 $170 Beverae Voucher $170)', points: 120, icon: '☕' },
            { id: 'p2', name: '任意門轉機時光', enName: 'Express Transit Time', desc: '(提早下班一小時公假  Leave 1-Hour early)', points: 300, icon: '🏃' },
            { id: 'p3', name: '威秀機上娛樂系統', enName: 'Vieshow In-Flight Ent.', desc: '(電影票+餐飲兌換券 Movie+F&B)', points: 370, icon: '🎬' },
            { id: 'p4', name: '陶板屋米其林機上餐', enName: 'Tokiya Premium Meal', desc: '(套餐券 Set Meal Voucher)', points: 650, icon: '🍱' },
            { id: 'p5', name: '澤也東方頭等艙尊榮SPA', enName: 'Zeyan First-Class SPA', desc: '(50min SPA)', points: 750, icon: '💆' }
        ];
    }

    get data() {
        return window.app?.data || window.appData || { users:[], meetings:[], records:[], redemptions:[] };
    }

    init(globalData) {
        this.bindEvents();
        this.updateAdminUI();
    }

    bindEvents() {
        const form = document.getElementById('form-create-meeting');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', (e) => { e.preventDefault(); this.startMeeting(); });
            form.dataset.bound = "true";
        }
        const saveBtn = document.getElementById('btn-save-meeting');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.addEventListener('click', () => this.finishMeeting());
            saveBtn.dataset.bound = "true";
        }
        const refreshBtn = document.getElementById('btn-refresh-history');
        if (refreshBtn && !refreshBtn.dataset.bound) {
            refreshBtn.addEventListener('click', () => this.handleRefreshHistory());
            refreshBtn.dataset.bound = "true";
        }
        const selectAllBtn = document.getElementById('btn-select-all');
        if (selectAllBtn && !selectAllBtn.dataset.bound) {
            selectAllBtn.addEventListener('click', () => this.handleSelectAll());
            selectAllBtn.dataset.bound = "true";
        }
        // 部門全選按鈕綁定
        const deptBtns = document.querySelectorAll('.btn-dept');
        deptBtns.forEach(btn => {
            if (!btn.dataset.bound) {
                btn.addEventListener('click', () => this.handleSelectDepartment(btn.dataset.dept));
                btn.dataset.bound = "true";
            }
        });

        // 兌換頁面：選擇人員變動時更新分數
        const exUserSelect = document.getElementById('exchange-user-select');
        if (exUserSelect && !exUserSelect.dataset.bound) {
            exUserSelect.addEventListener('change', () => this.updateExchangeBalance());
            exUserSelect.dataset.bound = "true";
        }

        // API URL 設定儲存
        const saveCfgBtn = document.getElementById('btn-save-config');
        if (saveCfgBtn && !saveCfgBtn.dataset.bound) {
            saveCfgBtn.addEventListener('click', () => {
                const url = document.getElementById('config-api-url').value.trim();
                if (url) {
                    localStorage.setItem('gas_api_url', url);
                    alert("API URL 已更新！請重新載入頁面。");
                    location.reload();
                }
            });
            saveCfgBtn.dataset.bound = "true";
        }

        // 搜尋功能
        const searchInput = document.getElementById('search-redemption');
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.addEventListener('input', () => this.renderRedemptionTable());
            searchInput.dataset.bound = "true";
        }
    }

    handleSelectDepartment(dept) {
        if (!this.data || !this.data.users) return;
        const deptUsers = this.data.users
            .filter(u => (u.department || '其他').toUpperCase() === dept.toUpperCase())
            .map(u => u.id);
        
        const checkboxes = document.querySelectorAll('#participant-list .p-checkbox');
        let anyUnchecked = false;
        checkboxes.forEach(cb => {
            if (deptUsers.includes(cb.value) && !cb.checked) anyUnchecked = true;
        });

        checkboxes.forEach(cb => {
            if (deptUsers.includes(cb.value)) cb.checked = anyUnchecked;
        });
    }

    // V5.3：連線輔助功能
    showConnectionHelp() {
        const modal = document.getElementById('modal-connection-help');
        const diagUrl = document.getElementById('diag-current-url');
        if (modal && diagUrl) {
            diagUrl.textContent = window.GAS_API_URL || "未設定";
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    }

    hideConnectionHelp() {
        const modal = document.getElementById('modal-connection-help');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    }

    manuallyChangeUrl() {
        const current = window.GAS_API_URL || "";
        const nextUrl = prompt("請貼上新的 Google Apps Script 網頁應用程式網址 (需包含 /exec)：", current);
        if (nextUrl && nextUrl.startsWith('http')) {
            localStorage.setItem('gas_api_url', nextUrl.trim());
            alert("網址已更新，系統將重新整理...");
            location.reload();
        } else if (nextUrl !== null) {
            alert("網址格式不正確，請確認包含 http 與 /exec");
        }
    }

    showDebugInfo(title, msg) {
        const modal = document.getElementById('modal-debug');
        const content = document.getElementById('debug-content');
        if (modal && content) {
            modal.classList.add('active');
            content.innerHTML = `<h4>${title}</h4><hr>${msg}`;
        }
    }

    updateAdminUI() {
        const isAdmin = window.app?.isAdmin;
        const loginBtn = document.getElementById('btn-admin-login');
        if (loginBtn) {
            loginBtn.innerHTML = isAdmin ? '<i class="fa-solid fa-unlock"></i> 管理員登出' : '<i class="fa-solid fa-lock"></i> 管理員登入';
            loginBtn.classList.toggle('online', isAdmin);
        }

        // V5.4：切換「限管理者使用」標籤
        document.querySelectorAll('.admin-only-tag').forEach(tag => {
            tag.style.display = isAdmin ? 'none' : 'block';
        });

        // V5.4：切換所有標記為 admin-only 的管理功能元素
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
    }

    handleSelectAll() {
        const checkboxes = document.querySelectorAll('#participant-list .p-checkbox');
        const btn = document.getElementById('btn-select-all');
        const isAllSelected = Array.from(checkboxes).every(c => c.checked);
        checkboxes.forEach(c => c.checked = !isAllSelected);
        btn.textContent = isAllSelected ? '全選' : '取消全選';
    }

    renderCreateForm() {
        if (!this.data) this.data = window.appData || window.app?.data;
        
        // 取得人員清單 (同時相容多種鍵名)
        const users = (this.data?.users || []).map(u => ({
            id: u.id || u.userId || u.ID || '',
            name: u.name || u.userName || u.Name || '',
            department: u.department || u.dept || '其他'
        })).filter(u => u.id && u.name);

        console.log("[UI] renderCreateForm Rendering...", { 
            totalLoaded: this.data?.users?.length, 
            validUsers: users.length,
            sample: users[0]
        });
        
        // 渲染填表人
        const selectRecorder = document.getElementById('select-recorder');
        if (selectRecorder) {
            selectRecorder.innerHTML = '<option value="" disabled selected>請選擇填表人</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.name;
                opt.textContent = `${u.name} (${u.department})`;
                selectRecorder.appendChild(opt);
            });
        }

        // 渲染參與人員
        const partList = document.getElementById('participant-list');
        if (partList) {
            partList.innerHTML = '';
            if (users.length === 0) {
                partList.innerHTML = `
                    <div class="loading-padding" style="padding: 20px; text-align: center;">
                        <div class="loading-icon-pulse"><i class="fa-solid fa-cloud-bolt"></i></div>
                        <h4 style="color: var(--accent-warning); margin: 10px 0;">⚠️ 尚未讀取到人員資料</h4>
                        <p style="font-size:0.85rem; color: var(--text-secondary); line-height: 1.5;">
                            這通常是因為 <b>Google Sheet 分頁名稱不對</b> 或 <b>無權限</b> 導到。<br>
                            請核對您的試算表分頁名稱是否為：<br>
                            <span style="color:var(--accent-1)">「Users」、「Meetings」、「Records」</span>
                        </p>
                        <div style="margin-top:20px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                            <button type="button" class="btn-sm btn-primary" onclick="app.init()">
                                <i class="fa-solid fa-rotate"></i> 強制重新連線
                            </button>
                            <button type="button" class="btn-sm btn-secondary" onclick="window.open(window.GAS_API_URL + '?action=ping', '_blank')">
                                <i class="fa-solid fa-satellite-dish"></i> 測試連線
                            </button>
                            <button type="button" class="btn-sm btn-text-link" onclick="document.getElementById('modal-settings').classList.add('active')" style="color:var(--text-secondary); margin-top:10px; width:100%;">
                                <i class="fa-solid fa-wrench"></i> 網址不對？手動修改 API 網址
                            </button>
                        </div>
                        <div style="margin-top:15px; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; font-size:0.7rem; color:var(--text-secondary); word-break:break-all;">
                            目前連線對象：<br>${window.GAS_API_URL || '未設定'}
                        </div>
                    </div>`;
                
                // 自動重試邏輯 (防止先開啟 view 才抓到 data)
                if (!this._retryTimer) {
                    this._retryTimer = setTimeout(() => {
                        this._retryTimer = null;
                        this.renderCreateForm();
                    }, 1500);
                }
            } else {
                users.forEach(u => {
                    const row = document.createElement('div');
                    row.innerHTML = `<input type="checkbox" id="chk-p-${u.id}" value="${u.id}" class="p-checkbox" data-name="${u.name}"><label for="chk-p-${u.id}" class="p-label">${u.name}</label>`;
                    partList.appendChild(row.firstChild);
                    partList.appendChild(row.lastChild);
                });
            }
        }
        document.getElementById('btn-select-all').textContent = '全選';
        const dateInput = document.getElementById('input-meeting-date');
        if (dateInput) dateInput.valueAsDate = new Date();
    }

    renderExchangePage() {
        const users = this.data?.users || [];
        const select = document.getElementById('exchange-user-select');
        select.innerHTML = '<option value="">請先選擇您的姓名</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.department || '無部門'})`;
            select.appendChild(opt);
        });
        const prizeList = document.getElementById('prize-list');
        prizeList.innerHTML = '';
        this.PRIZES.forEach(p => {
            const card = document.createElement('div');
            card.className = 'prize-card glass-panel fade-in';
            card.innerHTML = `
                <span class="prize-icon">${p.icon}</span>
                <h4>${p.name}</h4>
                <div class="prize-en-name">${p.enName}</div>
                <div class="prize-desc">${p.desc}</div>
                <span class="prize-points">${p.points} 分</span>
                <button class="btn-primary btn-sm w-100" onclick="ui.handleExchange('${p.id}')">立即兌換</button>
            `;
            prizeList.appendChild(card);
        });
        this.renderRedemptionTable();
        this.updateExchangeBalance();
    }

    renderRedemptionTable() {
        const body = document.getElementById('redemption-history-body');
        const searchTerm = document.getElementById('search-redemption')?.value?.toLowerCase() || '';
        if (!body) return;

        let list = this.data?.redemptions || [];
        
        // 搜尋過濾
        if (searchTerm) {
            list = list.filter(r => 
                (r.userName || '').toLowerCase().includes(searchTerm) || 
                (r.prize || '').toLowerCase().includes(searchTerm)
            );
        }

        // 依照時間排序 (最近優先)
        list.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (list.length === 0) {
            body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">尚無紀錄</td></tr>';
            return;
        }

        body.innerHTML = list.map(r => `
            <tr>
                <td>${new Date(r.timestamp).toLocaleString('zh-TW', {hour12:false})}</td>
                <td>${r.userName || '未知'}</td>
                <td>${r.prize}</td>
                <td><span style="color:var(--accent-warning)">-${r.points}</span></td>
                <td>
                    <button class="btn-icon-sm" onclick="ui.deleteRedemptionUI('${r.id}')" title="刪除">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async deleteRedemptionUI(id) {
        if (!confirm("確定要刪除這筆兌換紀錄嗎？此動作將會恢復該同仁的可用積分。")) return;
        try {
            const res = await deleteRedemptionData(id);
            if (res.status === 'success') {
                alert("刪除成功！");
                await window.app.loadData();
                this.renderRedemptionTable();
                this.updateExchangeBalance();
            } else throw new Error(res.message);
        } catch (e) { alert("刪除失敗: " + e.message); }
    }

    updateExchangeBalance() {
        const uid = String(document.getElementById('exchange-user-select').value);
        const display = document.getElementById('display-user-points');
        if (!uid) { display.textContent = '-- 分'; return; }
        let score = 0;
        // 總積分累加
        this.data.records.forEach(r => { 
            const recordUid = String(r.userId || r.id || '');
            if (recordUid === uid) {
                score += (parseInt(r.score) || parseInt(r.積分) || parseInt(r.分數) || parseInt(r.得分) || 0); 
            }
        });
        // 兌換扣除
        this.data.redemptions?.forEach(r => { 
            const redemptionUid = String(r.userId || r.id || '');
            if (redemptionUid === uid) {
                score -= (parseInt(r.points) || parseInt(r.點數) || parseInt(r.分數) || 0); 
            }
        });
        display.textContent = `${score} 分`;
    }

    async handleExchange(prizeId) {
        const uid = String(document.getElementById('exchange-user-select').value);
        if (!uid) return alert("請先選擇人員姓名！");
        const prize = this.PRIZES.find(p => p.id === prizeId);
        let currentScore = 0;
        
        // 算分 (跟 updateExchangeBalance 一致)
        this.data.records.forEach(r => { 
            const recordUid = String(r.userId || r.id || '');
            if (recordUid === uid) {
                currentScore += (parseInt(r.score) || parseInt(r.積分) || parseInt(r.分數) || parseInt(r.得分) || 0); 
            }
        });
        this.data.redemptions?.forEach(r => { 
            const redemptionUid = String(r.userId || r.id || '');
            if (redemptionUid === uid) {
                currentScore -= (parseInt(r.points) || parseInt(r.點數) || parseInt(r.分數) || 0); 
            }
        });
        if (currentScore < prize.points) return alert(`積分不足！您還差 ${prize.points - currentScore} 分。`);
        if (!confirm(`確定扣除 ${prize.points} 積分兌換「${prize.name}」嗎？`)) return;
        const userName = this.data.users.find(u => u.id === uid)?.name || '未知';
        const redemption = { userId: uid, userName, prize: prize.name, points: prize.points };
        try {
            const res = await saveRedemptionData(redemption);
            if (res.status === 'success') {
                alert("兌換成功！");
                // V5.1：存檔成功後強制從後端重新載入所有資料 (確保跨裝置同步)
                await window.app.loadData();
                this.renderRedemptionTable();
                this.updateExchangeBalance();
            }
        } catch (e) { alert("兌換失敗: " + e.message); }
    }

    startMeeting() {
        const title = document.getElementById('input-meeting-title').value.trim();
        const date = document.getElementById('input-meeting-date').value;
        const topic = document.getElementById('input-meeting-topic').value.trim();
        const recorderSelect = document.getElementById('select-recorder');
        const recorder = recorderSelect.value;
        const checkboxes = document.querySelectorAll('#participant-list .p-checkbox:checked');
        
        if (!recorder) {
            alert("⚠️ 請選擇填表人 (記錄者)！");
            recorderSelect.focus();
            return;
        }
        if (checkboxes.length === 0) return alert("請至少選擇一位參與人員");
        const meetId = 'M' + Date.now();
        this.currentMeeting = { id: meetId, title, date, topic, recorder, timestamp: new Date().toISOString() };
        this.currentRecords = {};
        const participants = [];
        checkboxes.forEach(chk => {
            participants.push({ id: chk.value, name: chk.dataset.name });
            this.currentRecords[chk.value] = { 
                meetingId: meetId, userId: chk.value, userName: chk.dataset.name, 
                role: 'participant', askCount: 0, answerCount: 0, score: 0, firstAskCount: 0 
            };
        });
        this.renderRecordingView(participants);
        window.app.navigate('recording');
    }

    renderRecordingView(participants) {
        document.getElementById('live-meeting-title').textContent = this.currentMeeting.title;
        document.getElementById('live-meeting-date').textContent = this.currentMeeting.date;
        document.getElementById('live-meeting-recorder').textContent = this.currentMeeting.recorder;
        const grid = document.getElementById('live-participants-grid');
        const tpl = document.getElementById('tpl-participant-card').innerHTML;
        grid.innerHTML = '';
        grid.classList.remove('first-ask-done');
        
        // V5.18：重設摘要顯示
        const summary = document.getElementById('recording-summary');
        if (summary) summary.style.display = 'block';
        this.updateRecordingSummary();

        participants.forEach(p => {
            let html = tpl.replace(/{name}/g, p.name).replace(/{score}/g, '0');
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            const card = wrapper.firstElementChild;
            card.dataset.uid = p.id;

            // 綁定記分按鈕
            card.querySelectorAll('.btn-action').forEach(btn => {
                btn.addEventListener('click', () => this.handleScoreAction(p.id, btn.dataset.action));
            });

            // V5.19：綁定清除/重置按鈕
            const btnReset = card.querySelector('.btn-reset');
            if (btnReset) {
                btnReset.addEventListener('click', () => {
                    if (confirm(`確定要清除 ${p.name} 的本次記分嗎？`)) {
                        this.resetParticipant(p.id);
                    }
                });
            }

            grid.appendChild(card);
        });
    }

    // V5.19：重置特定成員得分
    resetParticipant(uid) {
        if (!this.currentRecords[uid]) return;
        this.currentRecords[uid].score = 0;
        this.currentRecords[uid].askCount = 0;
        this.currentRecords[uid].answerCount = 0;
        this.currentRecords[uid].firstAskCount = 0;
        
        const card = document.querySelector(`.participant-card[data-uid="${uid}"]`);
        if (card) {
            this.updateCardUI(card, this.currentRecords[uid]);
            const grid = document.getElementById('live-participants-grid');
            // 如果此人剛才是第一個發問的，檢查是否需要移除全局鎖定
            // (註：目前邏輯是一個會議只有第一個生效，重置只是讓該人歸零)
        }
        this.updateRecordingSummary();
    }

    // V5.18 -> V5.19：更新會議即時統計與明細表
    updateRecordingSummary() {
        if (!this.currentRecords) return;
        let totalAsk = 0;
        let totalReply = 0;
        let totalScore = 0;
        
        const tbody = document.querySelector('#recording-detail-table tbody');
        const wrapper = document.getElementById('recording-detail-wrapper');
        if (tbody) tbody.innerHTML = '';
        if (wrapper) wrapper.style.display = 'block';

        Object.values(this.currentRecords).forEach(r => {
            totalAsk += (r.askCount || 0);
            totalReply += (r.answerCount || 0);
            totalScore += (r.score || 0);
            
            // V5.19：填寫明細表
            if (tbody) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${r.userName}</td>
                    <td style="font-weight:bold; color:var(--accent-warning);">${r.score}</td>
                    <td>${r.firstAskCount || 0}</td>
                    <td>${r.askCount - (r.firstAskCount || 0)}</td>
                    <td>${r.answerCount}</td>
                `;
                tbody.appendChild(tr);
            }
        });

        const elAsk = document.getElementById('summary-total-ask');
        const elReply = document.getElementById('summary-total-reply');
        const elScore = document.getElementById('summary-total-score');
        if (elAsk) elAsk.textContent = totalAsk;
        if (elReply) elReply.textContent = totalReply;
        if (elScore) elScore.textContent = totalScore;
    }

    handleScoreAction(uid, action) {
        const record = this.currentRecords[uid];
        const cardTarget = document.querySelector(`.participant-card[data-uid="${uid}"]`);
        if (action === 'ask_first') {
            record.askCount++; record.score += this.POINTS.ASK_FIRST;
            record.firstAskCount = (record.firstAskCount || 0) + 1; 
            document.getElementById('live-participants-grid').classList.add('first-ask-done');
        } else if (action === 'ask') {
            record.askCount++; record.score += this.POINTS.ASK;
        } else if (action === 'reply') {
            record.answerCount++; record.score += this.POINTS.REPLY;
        }
        this.updateCardUI(cardTarget, record);
        this.updateRecordingSummary(); // V5.18
    }

    updateCardUI(card, record) {
        card.querySelector('.p-score').innerHTML = `${record.score} <span class="unit">分</span>`;
        if (card.querySelector('.stat-fac')) card.querySelector('.stat-fac').textContent = record.firstAskCount || 0;
        if (card.querySelector('.stat-ac')) card.querySelector('.stat-ac').textContent = (record.askCount || 0) - (record.firstAskCount || 0);
        if (card.querySelector('.stat-reply')) card.querySelector('.stat-reply').textContent = record.answerCount || 0;
    }

    async finishMeeting() {
        if(!confirm("確定要儲存本次會議紀錄嗎？")) return;
        try {
            const recordsArray = Object.values(this.currentRecords);
            const result = await saveMeetingData(this.currentMeeting, recordsArray);
            if(result.status === 'success') {
                alert("儲存成功！");
                // V5.1：存檔成功後強制從後端重新載入所有資料 (確保跨裝置同步)
                await window.app.loadData();
                document.getElementById('form-create-meeting').reset();
                window.app.navigate('home');
            } else throw new Error(result.message);
        } catch (error) { alert("儲存失敗: " + error.message); }
    }

    async handleRefreshHistory() {
        const btn = document.getElementById('btn-refresh-history');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 載入中...';
        
        try {
            await window.app.loadData();
            // 從 App 匯入的 renderStatistics 已在全域可用
            if (typeof renderStatistics === 'function') {
                renderStatistics(window.app.data);
            }
            alert("✅ 資料已同步更新！");
        } catch (e) {
            alert("❌ 同步失敗：" + e.message);
        } finally {
            if (btn) btn.innerHTML = oldHtml;
        }
    }
    // V5.19：個人統計查詢頁面初始化
    showPersonalStats() {
        const select = document.getElementById('personal-user-select');
        if (select) {
            select.innerHTML = '<option value="">-- 請選擇同仁 --</option>';
            const sortedUsers = [...window.app.data.users].sort((a,b) => (a.name || "").localeCompare(b.name || "", 'zh-TW'));
            sortedUsers.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id || u.userId;
                opt.textContent = `${u.name} (${u.department || "無部門"})`;
                select.appendChild(opt);
            });
        }
        document.getElementById('personal-stats-result').style.display = 'none';
        window.app.navigate('personal-stats');
    }

    // V5.19：渲染個人詳細統計
    renderPersonalDetailStats() {
        const uid = document.getElementById('personal-user-select').value;
        const resultDiv = document.getElementById('personal-stats-result');
        if (!uid) {
            resultDiv.style.display = 'none';
            return;
        }

        const user = window.app.data.users.find(u => (u.id || u.userId || "").toString() === uid.toString());
        const records = window.app.data.records.filter(r => (r.userId || r.id || "").toString() === uid.toString());
        const redemptions = (window.app.data.redemptions || []).filter(r => (r.userId || r.id || "").toString() === uid.toString());

        let totalAsk = 0, totalFirstAsk = 0, totalReply = 0, totalScore = 0;
        records.forEach(r => {
            // 統一統計公式 (Rev.E)：與統計分頁邏輯保持 100% 一致
            const fac = parseInt(r.firstAskCount) || 0;
            const tAsk = parseInt(r.askCount) || 0;
            const tAnc = parseInt(r.answerCount) || 0;
            const s = parseInt(r.score || r.積分 || r.分數 || 0) || 0;

            totalFirstAsk += fac;
            totalAsk += tAsk;
            totalReply += tAnc;
            totalScore += s;
        });
        
        const spent = redemptions.reduce((sum, r) => sum + (parseInt(r.points || r.score || 0) || 0), 0);
        const balance = totalScore - spent;

        resultDiv.innerHTML = `
            <div class="personal-stats-card fade-in" style="margin-top:20px;">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:15px;">
                    <div class="glass-panel" style="text-align:center; padding:15px; border-bottom: 3px solid var(--accent-1);">
                        <div style="font-size:0.8rem; color:var(--text-secondary);">總積分 (累計)</div>
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--accent-1);">${totalScore} 分</div>
                    </div>
                    <div class="glass-panel" style="text-align:center; padding:15px; border-bottom: 3px solid var(--accent-warning);">
                        <div style="font-size:0.8rem; color:var(--text-secondary);">可用餘額</div>
                        <div style="font-size:1.5rem; font-weight:bold; color:var(--accent-warning);">${balance} 分</div>
                    </div>
                    <div class="glass-panel" style="text-align:center; padding:15px; border-bottom: 3px solid #f85149;">
                        <div style="font-size:0.8rem; color:var(--text-secondary);">快問</div>
                        <div style="font-size:1.5rem; font-weight:bold; color:#f85149;">${totalFirstAsk} 次</div>
                    </div>
                    <div class="glass-panel" style="text-align:center; padding:15px; border-bottom: 3px solid #58a6ff;">
                        <div style="font-size:0.8rem; color:var(--text-secondary);">一般發問</div>
                        <div style="font-size:1.5rem; font-weight:bold; color:#58a6ff;">${totalAsk - totalFirstAsk} 次</div>
                    </div>
                </div>
                <div class="glass-panel mt-4" style="padding:20px;">
                    <h4 style="margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                        <i class="fa-solid fa-chart-line"></i> 詳細行為分析
                    </h4>
                    <ul style="list-style:none; padding:0; line-height:2;">
                        <li>🎙️ 一般發問次數：<span style="float:right; font-weight:bold;">${totalAsk - totalFirstAsk} 次</span></li>
                        <li>🗨️ 會議回答次數：<span style="float:right; font-weight:bold;">${totalReply} 次</span></li>
                        <li>📅 參與會議場數：<span style="float:right; font-weight:bold;">${records.length} 場</span></li>
                        <li>🎁 已兌換積分：<span style="float:right; font-weight:bold; color:#f85149;">-${spent} 分</span></li>
                    </ul>
                </div>
            </div>
        `;
        resultDiv.style.display = 'block';
    }

    // V5.19：歷史會議明細
    async showMeetingDetail(meetingId) {
        this.editingMeetingId = meetingId;
        const meeting = window.app.data.meetings.find(m => m.id.toString() === meetingId.toString());
        if (!meeting) return alert("找不到會議資料");

        document.getElementById('detail-meeting-title').textContent = meeting.title || "未命名會議";
        document.getElementById('detail-meeting-date').textContent = meeting.date || "";
        document.getElementById('detail-meeting-recorder').textContent = meeting.recorder || "";
        
        const records = window.app.data.records.filter(r => r.meetingId.toString() === meetingId.toString());
        this.renderDetailTable(records);
        
        this.toggleDetailEditMode(false);
        window.app.navigate('meeting-detail');
    }

    renderDetailTable(records) {
        const tbody = document.querySelector('#meeting-detail-table tbody');
        tbody.innerHTML = '';
        records.forEach(r => {
            const tr = document.createElement('tr');
            const uid = (r.userId || r.id || '').toString().trim();
            tr.dataset.uid = uid;
            
            // V5.19：從使用者總表查找正確姓名
            const uinfo = window.app.data.users.find(u => (u.id || u.userId || '').toString().trim() === uid);
            const name = uinfo ? uinfo.name : (r.userName || '未知同仁');

            tr.innerHTML = `
                <td>${name}</td>
                <td class="col-score" data-val="${r.score}">${r.score}</td>
                <td class="col-fac" data-val="${r.firstAskCount || 0}">${r.firstAskCount || 0}</td>
                <td class="col-ac" data-val="${(r.askCount || 0) - (r.firstAskCount || 0)}">${(r.askCount || 0) - (r.firstAskCount || 0)}</td>
                <td class="col-anc" data-val="${r.answerCount || 0}">${r.answerCount || 0}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    toggleDetailEditMode(isEdit) {
        const btnEdit = document.getElementById('btn-edit-meeting');
        const btnSave = document.getElementById('btn-save-meeting-changes');
        const tbody = document.querySelector('#meeting-detail-table tbody');
        
        if (isEdit) {
            btnEdit.style.display = 'none';
            btnSave.style.display = 'inline-block';
            
            tbody.querySelectorAll('tr').forEach(tr => {
                // 1. 姓名變更為下拉選單
                const tdName = tr.querySelector('td:first-child');
                const currentUid = tr.dataset.uid;
                const selectUsers = document.createElement('select');
                selectUsers.className = 'form-input edit-name-select';
                selectUsers.style.width = '120px';
                selectUsers.style.padding = '2px';

                const sortedUsers = [...window.app.data.users].sort((a,b) => (a.name||"").localeCompare(b.name||"", 'zh-TW'));
                sortedUsers.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id || u.userId;
                    opt.textContent = u.name;
                    if (opt.value.toString() === currentUid.toString()) opt.selected = true;
                    selectUsers.appendChild(opt);
                });
                tdName.innerHTML = '';
                tdName.appendChild(selectUsers);

                // 2. 數值欄位轉為 input
                ['col-score', 'col-fac', 'col-ac', 'col-anc'].forEach(cls => {
                    const td = tr.querySelector(`.${cls}`);
                    const val = td.dataset.val;
                    td.innerHTML = `<input type="number" class="form-input edit-input" value="${val}" style="width:70px; padding:2px 5px;">`;
                });
            });
        } else {
            btnEdit.style.display = 'inline-block';
            btnSave.style.display = 'none';
        }
    }

    async saveMeetingChanges() {
        if (!confirm("確定要儲存修改後的積分嗎？這將會同步更新後端試算表。")) return;
        
        const tbody = document.querySelector('#meeting-detail-table tbody');
        const updatedRecords = [];
        
        tbody.querySelectorAll('tr').forEach(tr => {
            const uid = tr.querySelector('.edit-name-select').value;
            const score = parseInt(tr.querySelector('.col-score input').value) || 0;
            const fac = parseInt(tr.querySelector('.col-fac input').value) || 0;
            const ac_raw = parseInt(tr.querySelector('.col-ac input').value) || 0;
            const anc = parseInt(tr.querySelector('.col-anc input').value) || 0;
            
            updatedRecords.push({
                userId: uid,
                score: score,
                firstAskCount: fac,
                askCount: fac + ac_raw,
                answerCount: anc
            });
        });

        const btnSave = document.getElementById('btn-save-meeting-changes');
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 儲存中...';

        try {
            const result = await updateMeetingRecordsData(this.editingMeetingId, updatedRecords);
            if (result.status === 'success') {
                alert("✅ 修改成功！資料已同步回 Google 試算表。");
                await window.app.loadData();
                this.showMeetingDetail(this.editingMeetingId); 
            } else throw new Error(result.message);
        } catch (e) {
            alert("❌ 儲存失敗：" + e.message);
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 儲存更改';
        }
    }
}

export const ui = new UI();
window.ui = ui;
