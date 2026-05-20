import { deleteMeeting } from './api_v2.js?v=5.15';

let myChart = null; 

export function renderStatistics(data, startDate = null, endDate = null) {
    const { users, meetings, records, redemptions = [], debugHeaders = {} } = data;
    
    console.log("[Stats] Diagnostic Headers:", debugHeaders);
    
    const lbList = document.getElementById('leaderboard-list');
    try {
        // 預設日期輸入框初始化
        const startInput = document.getElementById('stats-date-start');
        const endInput = document.getElementById('stats-date-end');
        if (startInput && !startInput.value && !startDate) startInput.value = "";
        if (endInput && !endInput.value && !endDate) endInput.value = "";

        // 篩選與加總邏輯
        const filteredMeetings = meetings.filter(m => {
            if (!m.date) return true;
            const targetDate = m.date.substring(0, 10);
            if (startDate && targetDate < startDate) return false;
            if (endDate && targetDate > endDate) return false;
            return true;
        });

        const filteredMeetingIds = new Set(filteredMeetings.map(m => (m.id || '').toString().trim()));
        const filteredRecords = records.filter(r => filteredMeetingIds.has((r.meetingId || '').toString().trim()));
        
        console.log(`[Stats] Filtered: ${filteredMeetings.length} meetings, ${filteredRecords.length} records`);

        const userStats = {};
        const nameToId = {}; 
        // V5.19 Rev.K：將原先充當「其他」的 MGR 更名為 OTHER，以避免與 MANAGER 混淆，並統一將 MGR 與 MANAGER 合併
        const deptStats = { 'PRO': 0, 'SAL': 0, 'OPE': 0, 'MAR': 0, 'ADM': 0, 'MANAGER': 0, 'OTHER': 0 };
        const deptHeadcount = { 'PRO': 0, 'SAL': 0, 'OPE': 0, 'MAR': 0, 'ADM': 0, 'MANAGER': 0, 'OTHER': 0 };
        
        // 個人亮點分析用資料 (V5.18)
        const analysisData = {
           askCounts: {},    
           answerCounts: {}, 
           firstAskCounts: {}, // V5.18
           totalScores: {}    
        };
        users.forEach(u => {
            const uid = (u.id || u.userId || '').toString().trim();
            const uname = u.name || u.userName || '';
            if (uid) {
                let d = (u.department || 'OTHER').toUpperCase().trim();
                // 統一將 MGR 縮寫直接指向 MANAGER
                if (d === 'MGR') d = 'MANAGER';

                userStats[uid] = { 
                    id: uid, 
                    name: uname, 
                    dept: d, 
                    score: 0 
                };
                if (deptHeadcount[d] !== undefined) deptHeadcount[d]++;
                else {
                    deptHeadcount['OTHER']++;
                    userStats[uid].dept = 'OTHER';
                }
                if (uname) nameToId[uname] = uid;
            }
        });

        const getUid = (r) => {
            let uid = (r.userId || r.id || '').toString().trim();
            if (!uid || !userStats[uid]) {
                const uname = r.userName || r.name;
                if (uname && nameToId[uname]) uid = nameToId[uname];
            }
            return uid;
        };

        filteredRecords.forEach(r => { 
            const uid = getUid(r);
            if (userStats[uid]) {
                const s = parseInt(r.score) || parseInt(r.積分) || parseInt(r.分數) || parseInt(r.得分) || 0;
                userStats[uid].score += s;
                
                // 統計亮點 (V5.18)
                // 統一統計公式 (Rev.E)：嚴格遵循唯一資料來源
                const fac = parseInt(r.firstAskCount) || 0;
                const totalAsk = parseInt(r.askCount) || 0;
                const anc = parseInt(r.answerCount) || 0;
                
                // V5.19 Rev.I：同時累計到 userStats 供排行榜顯示 (解決顯示為 0 的問題)
                userStats[uid].firstAskCount = (userStats[uid].firstAskCount || 0) + fac;
                userStats[uid].askCount = (userStats[uid].askCount || 0) + totalAsk;
                userStats[uid].answerCount = (userStats[uid].answerCount || 0) + anc;
                
                analysisData.askCounts[uid] = (analysisData.askCounts[uid] || 0) + totalAsk;
                analysisData.answerCounts[uid] = (analysisData.answerCounts[uid] || 0) + anc;
                analysisData.firstAskCounts[uid] = (analysisData.firstAskCounts[uid] || 0) + fac;
                analysisData.totalScores[uid] = (analysisData.totalScores[uid] || 0) + s;
            }
        });
        
        redemptions.forEach(r => { 
            const uid = getUid(r);
            if (userStats[uid]) userStats[uid].score -= parseInt(r.points || r.score || 0) || 0; 
        });

        Object.values(userStats).forEach(u => {
            const d = u.dept;
            if (deptStats[d] !== undefined) deptStats[d] += u.score;
            else deptStats['OTHER'] += u.score;
        });

        // 排除人數為 0 的部門，不顯示在圖表與表格上
        Object.keys(deptStats).forEach(d => {
            if (deptHeadcount[d] === 0) {
                delete deptStats[d];
                delete deptHeadcount[d];
            }
        });

        renderLeaderboard(Object.values(userStats));
        renderDeptChart(deptStats);
        renderDeptTable(deptStats, deptHeadcount); // V5.19 Rev.J
        renderPersonalAnalysis(userStats, analysisData); // V5.18
        renderHistoryTable(data, filteredMeetings, filteredRecords);
        setupFilterListeners(data);
    } catch (e) {
        console.error("[Stats] Render Error:", e);
        if (lbList) lbList.innerHTML = `<li class="leaderboard-item" style="color:red">⚠️ 統計失敗: ${e.message}</li>`;
        alert("📊 統計圖表渲染失敗，請確認資料格式或聯繫開發人員。");
    }
}

function renderLeaderboard(userList) {
    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = '';
    
    const sorted = userList.sort((a, b) => b.score - a.score);
    
    if (sorted.length === 0 || sorted.every(u => u.score === 0)) {
        lbList.innerHTML += '<div style="padding: 20px; text-align: center; color: var(--text-secondary); background: rgba(255,255,255,0.05); border-radius: 8px;">區間內無積分紀錄</div>';
        return;
    }

    sorted.forEach((u, index) => {
        const li = document.createElement('li');
        li.className = 'leaderboard-item fade-in';
        let rankClass = index < 3 ? `rank-${index + 1}` : ''; 
        li.innerHTML = `
            <div class="rank-badge ${rankClass}">${index + 1}</div>
            <div class="lb-info" style="flex:1; margin-left:10px;">
                <div class="lb-name" style="font-weight:bold;">${u.name} <span style="font-size:0.7rem; color:var(--text-secondary); opacity:0.8;">(${u.dept})</span></div>
                <div class="lb-detail" style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">
                    ⚡ 快問: ${u.firstAskCount || 0} | 🎙️ 一般發問: ${(u.askCount || 0) - (u.firstAskCount || 0)}
                </div>
            </div>
            <div class="lb-score" style="text-align:right;">
                <div style="font-size:1.1rem; font-weight:bold; color:var(--accent-warning);">${u.score}</div>
                <div style="font-size:0.6rem; opacity:0.6;">POINTS</div>
            </div>
        `;
        lbList.appendChild(li);
    });
}

function renderDeptChart(deptStats) {
    const canvas = document.getElementById('ratioChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (myChart) myChart.destroy();
    
    // V5.18：由大到小排序
    const sortedDepts = Object.entries(deptStats)
        .sort(([, a], [, b]) => b - a);

    const labels = sortedDepts.map(([name, score]) => `${name}\n(${score}分)`);
    const scores = sortedDepts.map(([, score]) => score);

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '部門總積分',
                data: scores,
                backgroundColor: [
                    'rgba(88, 166, 255, 0.8)',   // PRO (Blue)
                    'rgba(137, 87, 229, 0.8)',   // SAL (Purple)
                    'rgba(210, 153, 34, 0.8)',   // OPE (Gold/Orange)
                    'rgba(35, 134, 54, 0.8)',    // MAR (Green)
                    'rgba(248, 81, 73, 0.8)',    // ADM (Red)
                    'rgba(255, 167, 38, 0.8)',   // MANAGER (Orange)
                    'rgba(139, 148, 158, 0.8)'   // OTHER (Gray/備用)
                ],
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `總計: ${context.raw} 分`
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.5)' }
                },
                x: { 
                    grid: { display: false },
                    ticks: { color: '#fff', font: { weight: 'bold' } }
                }
            }
        }
    });
}

// V5.19 Rev.J：渲染部門摘要表格 (含人均積分)
function renderDeptTable(deptStats, deptHeadcount) {
    const wrapper = document.getElementById('dept-table-wrapper');
    if (!wrapper) return;

    const sorted = Object.entries(deptStats).sort(([, a], [, b]) => b - a);
    
    let html = `
        <div class="table-responsive">
            <table class="data-table" style="font-size: 0.85rem; background: rgba(255,255,255,0.03);">
                <thead>
                    <tr style="background: rgba(255,255,255,0.05);">
                        <th>部門名稱</th>
                        <th>部門人數</th>
                        <th>總積分</th>
                        <th style="color: var(--accent-warning);">平均每人積分</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sorted.forEach(([dept, totalScore]) => {
        const count = deptHeadcount[dept] || 0;
        const avg = count > 0 ? (totalScore / count).toFixed(1) : 0;
        html += `
            <tr>
                <td style="font-weight:bold;">${dept}</td>
                <td>${count} 人</td>
                <td>${totalScore} 分</td>
                <td style="color: var(--accent-warning); font-weight:bold;">平均每人 ${avg} 分</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    wrapper.innerHTML = html;
}

// V5.18：渲染個人深度分析
function renderPersonalAnalysis(userStatsMap, analysisData) {
    const container = document.getElementById('personal-insights-content');
    if (!container) return;
    container.innerHTML = '';

    const getTopUser = (dataMap) => {
        const sorted = Object.entries(dataMap).sort(([, a], [, b]) => b - a);
        if (sorted.length === 0 || sorted[0][1] === 0) return null;
        const uid = sorted[0][0];
        return { uid, user: userStatsMap[uid], value: sorted[0][1] };
    };

    const topFirstAsk = getTopUser(analysisData.firstAskCounts);
    const topAsk = getTopUser(analysisData.askCounts);
    const topAnswer = getTopUser(analysisData.answerCounts);
    const topScore = getTopUser(analysisData.totalScores);

    const cards = [
        { title: '🏆 積分累積王', data: topScore, unit: '分', icon: 'fa-trophy', color: '#ffca28' },
        { title: '⚡ 快問王', data: topFirstAsk, unit: '次', icon: 'fa-bolt-lightning', color: '#f85149' },
        { title: '🎙️ 一般發問王', data: topAsk, unit: '次', icon: 'fa-microphone-lines', color: '#58a6ff' },
        { title: '🗨️ 回答王', data: topAnswer, unit: '次', icon: 'fa-comments', color: '#39d353' }
    ];

    cards.forEach(c => {
        const div = document.createElement('div');
        div.className = 'insight-card glass-panel fade-in';
        div.style.borderLeft = `4px solid ${c.color}`;
        
        if (c.data) {
            let detailHtml = '';
            const uid = c.data.uid;
            const fa = analysisData.firstAskCounts[uid] || 0;
            const ask = analysisData.askCounts[uid] || 0;
            const ans = analysisData.answerCounts[uid] || 0;
            const totalS = analysisData.totalScores[uid] || 0;

            const title = c.title;
            if (title.indexOf('累積王') !== -1) {
                detailHtml = `總積分: ${totalS} | ⚡ 快問: ${fa} | 🎙️ 一般發問: ${ask - fa} | 🗨️ 回答: ${ans}`;
            } else if (title.indexOf('快問王') !== -1) {
                detailHtml = `快問成功: ${fa} 次`;
            } else if (title.indexOf('發問王') !== -1) {
                detailHtml = `一般發問: ${ask - fa} 次`;
            } else if (title.indexOf('回答王') !== -1) {
                detailHtml = `正確回答: ${ans} 次`;
            } else {
                detailHtml = `累計：${c.data.value} ${c.unit}`;
            }

            div.innerHTML = `
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">${c.title}</div>
                <div style="font-size: 1.2rem; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid ${c.icon}" style="color:${c.color}"></i>
                    ${c.data.user.name}
                </div>
                <div style="font-size: 0.85rem; margin-top: 5px; opacity: 0.9;">
                    ${detailHtml}
                </div>
            `;
        } else {
            div.innerHTML = `<div style="color:var(--text-secondary)">${c.title}<br>尚無資料</div>`;
        }
        container.appendChild(div);
    });
}

function renderHistoryTable(globalData, filteredMeetings, filteredRecords) {
    const tbody = document.querySelector('#history-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const sorted = [...filteredMeetings].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">此區間無會議紀錄</td></tr>';
        return;
    }

    sorted.forEach((m, index) => {
        const mid = (m.id || '').toString().trim();
        const meetRecords = filteredRecords.filter(r => (r.meetingId || '').toString().trim() === mid);
        const isAdmin = window.app && window.app.isAdmin;
        const adminStyle = isAdmin ? '' : 'display:none';
        
        let winner = '無';
        let topScore = 0;
        let winnerStats = { firstAskCount: 0, askCount: 0, answerCount: 0 };
        meetRecords.forEach(r => { 
            const s = parseInt(r.score) || 0;
            if (s > topScore) { 
                topScore = s; 
                const uinfo = globalData.users.find(u => (u.id || '').toString().trim() === (r.userId || '').toString().trim());
                winner = uinfo ? (uinfo.name || uinfo.userName) : (r.userName || '未知同仁');
                winnerStats = r;
            } 
        });

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer'; // V5.19
        tr.onclick = (e) => {
            // 如果點擊的是 Checkbox 或 操作按鈕，不要進入詳情
            if (e.target.type === 'checkbox' || e.target.closest('.admin-only')) return;
            window.ui.showMeetingDetail(mid);
        };
        const meetingTitle = m.title || m.topic || m.會議名稱 || m.主題 || '無主題';
        const meetingRecorder = m.recorder || m.填表人 || m.紀錄 || m.記錄者 || '未記載';
        
        tr.innerHTML = `
            <td class="admin-only" style="${adminStyle}"><input type="checkbox" class="meeting-check" data-id="${mid}"></td>
            <td>${(m.date && typeof m.date === 'string') ? m.date.substring(0, 10) : '未記載'}</td>
            <td><strong>${meetingTitle}</strong></td>
            <td>${meetingRecorder}</td>
            <td>${meetRecords.length} 人</td>
            <td>
                <div class="text-glow-gold" style="font-weight:bold;">${winner} (${topScore}分)</div>
                ${topScore > 0 ? `<div style="font-size:0.7rem; opacity:0.8;">⚡ ${winnerStats.firstAskCount || 0} | 🎙️ ${(winnerStats.askCount || 0) - (winnerStats.firstAskCount || 0)} | 🗨️ ${winnerStats.answerCount || 0}</div>` : ''}
            </td>
            <td class="admin-only" style="${adminStyle}">
                <div style="display:flex; gap:5px;">
                    <button class="btn-icon-sm btn-edit-item" data-id="${mid}">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-icon-sm btn-delete-item" data-id="${mid}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        
        // 單筆編輯
        const editBtn = tr.querySelector('.btn-edit-item');
        if (editBtn) {
            editBtn.onclick = async () => {
                const newTitle = prompt("請輸入新的會議名稱：", m.title || "");
                if (newTitle === null) return;
                const newRecorder = prompt("請輸入新的填表人：", m.recorder || "");
                if (newRecorder === null) return;
                
                // TODO: 這裡理想上要呼叫 editMeeting API，但目前 backend 未實作，先用 alert 提示
                // 實際上我可以在 Code.gs 快速加一個 editMeeting
                alert("正在更新...");
                const res = await window.api.editMeetingData({ id: m.id, title: newTitle, recorder: newRecorder });
                if (res.status === 'success') {
                   alert("更新成功");
                   await window.app.loadData();
                   renderStatistics(window.app.data);
                } else alert("更新失敗：" + res.message);
            };
        }
        
        // 單筆刪除
        const delBtn = tr.querySelector('.btn-delete-item');
        if (delBtn) {
            delBtn.onclick = async () => {
                if (!confirm("確定刪除此會議紀錄嗎？")) return;
                const result = await deleteMeeting(m.id);
                if (result.status === 'success') {
                    alert("刪除成功");
                    await window.app.loadData();
                    renderStatistics(window.app.data);
                }
            };
        }

        // 監聽勾選狀態以顯示/隱藏批次刪除按鈕
        const ck = tr.querySelector('.meeting-check');
        ck.addEventListener('change', () => updateBulkBtnState());

        tbody.appendChild(tr);
    });

    // 初始化/更新批次按鈕狀態
    updateBulkBtnState();
}

function updateBulkBtnState() {
    const checks = document.querySelectorAll('.meeting-check:checked');
    const bulkBtn = document.getElementById('btn-bulk-delete-meetings');
    if (bulkBtn && window.app?.isAdmin) {
        bulkBtn.style.display = checks.length > 0 ? 'inline-block' : 'none';
        bulkBtn.textContent = `批次刪除 (${checks.length})`;
    }
}

function setupFilterListeners(data) {
    const btn = document.getElementById('btn-filter-stats');
    if (btn && !btn.dataset.bound) {
        btn.onclick = () => {
            const start = document.getElementById('stats-date-start').value;
            const end = document.getElementById('stats-date-end').value;
            renderStatistics(data, start, end);
        };
        btn.dataset.bound = "true";
    }

    // V5.2：全選功能
    const chkAll = document.getElementById('chk-history-all');
    if (chkAll && !chkAll.dataset.bound) {
        chkAll.onchange = () => {
            document.querySelectorAll('.meeting-check').forEach(ck => ck.checked = chkAll.checked);
            updateBulkBtnState();
        };
        chkAll.dataset.bound = "true";
    }

    // V5.2：批次刪除
    const bulkBtn = document.getElementById('btn-bulk-delete-meetings');
    if (bulkBtn && !bulkBtn.dataset.bound) {
        bulkBtn.onclick = async () => {
            const selectedIds = Array.from(document.querySelectorAll('.meeting-check:checked')).map(ck => ck.dataset.id);
            if (selectedIds.length === 0) return;
            if (!confirm(`確定要批次刪除這 ${selectedIds.length} 筆紀錄嗎？此動作無法復原。`)) return;
            
            let successCount = 0;
            for (const id of selectedIds) {
                try {
                    const res = await deleteMeeting(id);
                    if (res.status === 'success') successCount++;
                } catch (e) { console.error("刪除失敗 ID:", id, e); }
            }
            
            alert(`已成功刪除 ${successCount} 筆紀錄！`);
            await window.app.loadData();
            renderStatistics(window.app.data);
        };
        bulkBtn.dataset.bound = "true";
    }
}
