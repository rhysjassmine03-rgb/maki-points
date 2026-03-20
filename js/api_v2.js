/**
 * 會議積分系統 - API 呼叫層 (Cache-Bust V2)
 */
// 預設 API URL
// 預設 API URL (V5.12 校正版)
let GAS_API_URL = "https://script.google.com/macros/s/AKfycbyBHEjAM2z4RBjphmg--4vRwAsDfniVXhYazvZp0nTizFOcwa_4wAoCrvGfNkO3B1ufDg/exec";

// 允許手動覆蓋 (儲存在 localStorage)
const customUrl = localStorage.getItem('gas_api_url');
if (customUrl && customUrl.startsWith('http')) {
    console.warn("[API] 使用手動設定的 GAS URL:", customUrl);
    GAS_API_URL = customUrl;
}

window.GAS_API_URL = GAS_API_URL;

export async function fetchAllData() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10秒強制中斷
    
    try {
        const url = `${GAS_API_URL}?action=getalldata&_t=${Date.now()}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (!response.ok) throw new Error("網路連線錯誤 (Status: " + response.status + ")");
        return await response.json();
    } catch (error) {
        clearTimeout(timeout);
        console.error("[API] Fetch error:", error);
        if (error.name === 'AbortError') throw new Error("連線逾時 (10秒)，請檢查 GAS 網址與網路狀態。");
        throw error;
    }
}

async function callGAS(payload) {
    try {
        const url = `${GAS_API_URL}?_t=${Date.now()}`;
        const response = await fetch(url, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("GAS 伺服器回應錯誤");
        return await response.json();
    } catch (error) {
        console.error("[API] GAS API Error:", error);
        throw error;
    }
}

export async function saveMeetingData(meeting, records) {
    return await callGAS({ action: 'savemeetingandrecords', meeting, records });
}

export async function deleteMeeting(meetingId) {
    return await callGAS({ action: 'deletemeeting', meetingId });
}

export async function editMeetingData(meeting) {
    return await callGAS({ action: 'editmeeting', meeting });
}

export async function saveRedemptionData(redemption) {
    return await callGAS({ action: 'saveredemption', redemption });
}

export async function deleteRedemptionData(redemptionId) {
    return await callGAS({ action: 'deleteredemption', redemptionId });
}

export async function editRedemptionData(redemption) {
    return await callGAS({ action: 'editredemption', redemption });
}
export async function updateMeetingRecordsData(meetingId, records) {
    return await callGAS({ action: 'updatemeetingrecords', meetingId, records });
}
