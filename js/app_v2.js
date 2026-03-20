/**
 * 會議積分系統 - 前端主程式 (V2.1.9 進階版)
 */
import { fetchAllData } from './api_v2.js?v=5.19';
import { ui } from './ui_v2.js?v=5.19';
import { renderStatistics } from './statistics_v2.js?v=5.19';

// 捕獲全域錯誤並告知用戶
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error("[App Error]", { msg, url, lineNo, columnNo, error });
    const badge = document.getElementById('connection-status');
    if (badge) {
        badge.className = 'status-badge offline';
        badge.innerHTML = '🔴 程式執行出錯：' + msg.slice(0, 30);
    }
    return false;
};

class App {
    constructor() {
        this.data = { users: [], meetings: [], records: [], redemptions: [] };
        this._isAdmin = sessionStorage.getItem('is_admin') === 'true';
        this.currentView = 'home';
        // 不要在 constructor 內執行非同步的 init，避免 window.app 尚未賦值
    }

    get isAdmin() { return this._isAdmin; }
    set isAdmin(val) {
        this._isAdmin = val;
        sessionStorage.setItem('is_admin', val);
        ui.updateAdminUI();
        if (this.currentView === 'stats') renderStatistics(this.data);
        else if (this.currentView === 'exchange') ui.renderExchangePage();
    }

    async init() {
        console.log("[App] 初始化開始...");
        this.bindEvents(); // 綁定基礎事件 (返回、登入)
        ui.init(this.data);
        window.appData = this.data;

        // 診斷計時器 (12秒內沒抓到資料就跳框)
        this.diagTimer = setTimeout(() => {
            if (this.data.users && this.data.users.length === 0) {
                console.warn("[App] 連線較慢，顯示診斷視窗...");
                ui.showConnectionHelp();
            }
        }, 12000);

        try {
            this.setConnectionStatus('connecting', '🟡 連線中...');
            
            // 直接執行 fetch 避免過度複雜的 Race
            const result = await fetchAllData();
            clearTimeout(this.diagTimer);
            ui.hideConnectionHelp();
            // V5.19 版本校驗
            if (result && result.version !== '5.18' && result.version !== '5.19') {
                console.warn(`[App] GAS 版本不符! 預期: 5.19, 實際: ${result.version || '過舊'}`);
                if (!sessionStorage.getItem('ver_warned')) {
                    alert(`⚠️ 注意：後端版本過舊！\n建議重新部署 GAS 並且選擇「新版本」。`);
                    sessionStorage.setItem('ver_warned', 'true');
                }
            }

            this.processData(result);
            this.navigate(this.currentView);
            
            if (this.data.users && this.data.users.length > 0) {
                this.setConnectionStatus('online', `✅ 已連線 (抓到 ${this.data.users.length} 人)`);
            } else {
                this.setConnectionStatus('warning', `⚠️ 已連線但抓不到同仁名單`);
            }
        } catch (error) {
            console.error("V2 初始化失敗:", error);
            clearTimeout(this.diagTimer);
            this.setConnectionStatus('offline', '🔴 連線失敗 (API 連不上)');
            this.navigate(this.currentView);
            ui.showConnectionHelp();
        }
    }

    processData(result) {
        if (!result || typeof result !== 'object') return;
        const usersArr = Array.isArray(result.users) ? result.users : [];
        this.data.users = usersArr.map(u => ({
            id: String(u.id || u.userId || u.ID || ''),
            name: String(u.name || u.userName || u.Name || ''),
            department: String(u.department || '其他').trim()
        })).filter(u => u.id && u.name);

        this.data.meetings = Array.isArray(result.meetings) ? result.meetings : [];
        this.data.records = Array.isArray(result.records) ? result.records : [];
        this.data.redemptions = Array.isArray(result.redemptions) ? result.redemptions : [];
        this.data.debugHeaders = result.debugHeaders || {};
        
        console.log("[App] 數據同步完成，同仁數:", this.data.users.length);
    }

    async loadData() {
        try {
            this.setConnectionStatus('connecting', '🟡 更新中...');
            const result = await fetchAllData();
            this.processData(result);
            this.setConnectionStatus('online', `✅ 已更新 (${this.data.users.length} 人)`);
            return result;
        } catch (err) {
            this.setConnectionStatus('offline', '🔴 更新失敗');
            throw err;
        }
    }

    bindEvents() {
        // 首頁 Logo 返回
        const navLogo = document.getElementById('nav-logo');
        if (navLogo) navLogo.addEventListener('click', () => {
            if (this.currentView === 'recording') {
                if (confirm("確定返回？目前會議資料將不會儲存。")) this.navigate('home');
            } else {
                this.navigate('home');
            }
        });

        // 管理員登入按鈕
        const loginBtn = document.getElementById('btn-admin-login');
        const modalAdmin = document.getElementById('modal-admin');
        const pswInput = document.getElementById('admin-password');
        if (loginBtn && modalAdmin && pswInput) {
            loginBtn.onclick = () => {
                if (this.isAdmin) {
                    if (confirm("確定登出？")) { this.isAdmin = false; this.navigate('home'); }
                } else { modalAdmin.classList.add('active'); pswInput.focus(); }
            };
            
            const btnDoLogin = document.getElementById('btn-do-login');
            if (btnDoLogin) btnDoLogin.onclick = () => {
                if (pswInput.value === '8888') {
                    this.isAdmin = true;
                    modalAdmin.classList.remove('active');
                    pswInput.value = '';
                } else { alert("密碼錯誤！"); }
            };

            const btnCancel = document.getElementById('btn-cancel-login');
            if (btnCancel) btnCancel.onclick = () => modalAdmin.classList.remove('active');
        }

        // 瀏覽器上一頁/下一頁
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.view) this.navigate(e.state.view);
        });
    }

    async navigateCheckAdmin(viewName) {
        if (!this.isAdmin && (viewName === 'stats' || viewName === 'exchange')) {
            alert("⚠️ 限管理者使用！請點擊右邊按鈕登入管理員身分。");
            return;
        }
        if (viewName === 'stats') await this.loadData();
        this.navigate(viewName);
    }

    navigate(viewName) {
        document.querySelectorAll('.view-section').forEach(el => { 
            el.style.display = 'none'; 
            el.classList.remove('active'); 
        });
        const target = document.getElementById(`view-${viewName}`);
        if (target) { 
            target.style.display = 'block'; 
            requestAnimationFrame(() => target.classList.add('active')); 
        }
        this.currentView = viewName;
        if (viewName === 'create') ui.renderCreateForm();
        else if (viewName === 'stats') renderStatistics(this.data);
        else if (viewName === 'exchange') ui.renderExchangePage();
    }

    setConnectionStatus(status, text) {
        const badge = document.getElementById('connection-status');
        if (badge) { badge.className = `status-badge ${status}`; badge.innerHTML = text; }
    }
}

// 初始化
window.app = new App();
window.app.init();
