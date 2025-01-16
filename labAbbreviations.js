

// 預設的檢驗縮寫對映表
const DEFAULT_LAB_ABBREVIATIONS = {
    'Cholesterol': 'Chol',
    'Triglyceride': 'TG',
    'estimated Ccr(MDRD)': 'eCCr',
    'Creatinine': 'Cr',
    'Uric acid': 'U.A.'
};

class LabAbbreviationManager {
    constructor() {
        console.log('初始化 LabAbbreviationManager');
        console.log('預設縮寫:', DEFAULT_LAB_ABBREVIATIONS);
        this.abbreviations = {...DEFAULT_LAB_ABBREVIATIONS};
        console.log('初始化後的縮寫:', this.abbreviations);
    }

    // 修改 loadAbbreviations 方法
    async loadAbbreviations() {
        console.log('開始載入縮寫設定');
        try {
            const result = await new Promise(resolve => {
                chrome.storage.sync.get({
                    userLabAbbreviations: {},
                    enableLabAbbrev: true
                }, resolve);
            });
            
            console.log('從 storage 載入的設定:', result);
            
            this.abbreviations = {
                ...DEFAULT_LAB_ABBREVIATIONS,
                ...result.userLabAbbreviations
            };
            
            console.log('合併後的縮寫:', this.abbreviations);
            
            return {
                abbreviations: this.abbreviations,
                enabled: result.enableLabAbbrev
            };
        } catch (error) {
            console.error('載入檢驗縮寫失敗:', error);
            return {
                abbreviations: DEFAULT_LAB_ABBREVIATIONS,
                enabled: true
            };
        }
    }

    // 取得縮寫
    getAbbreviation(fullName) {
        // 先進行完全匹配
        if (this.abbreviations[fullName]) {
            return this.abbreviations[fullName];
        }
        
        // 如果沒找到，嘗試忽略空格和大小寫的匹配
        const normalizedFullName = fullName.toLowerCase().replace(/\s+/g, '');
        const match = Object.entries(this.abbreviations).find(([key]) => 
            key.toLowerCase().replace(/\s+/g, '') === normalizedFullName
        );
        
        return match ? match[1] : fullName;
    }

    // 儲存使用者自定義縮寫
    async saveUserAbbreviation(fullName, abbrev) {
        try {
            const { userLabAbbreviations = {} } = await new Promise(resolve => {
                chrome.storage.sync.get({ userLabAbbreviations: {} }, resolve);
            });
            
            userLabAbbreviations[fullName] = abbrev;
            
            await new Promise(resolve => {
                chrome.storage.sync.set({ userLabAbbreviations }, resolve);
            });
            
            this.abbreviations[fullName] = abbrev;
            return true;
        } catch (error) {
            console.error('儲存檢驗縮寫失敗:', error);
            return false;
        }
    }

    // 移除使用者自定義縮寫
    async removeUserAbbreviation(fullName) {
        try {
            const { userLabAbbreviations = {} } = await new Promise(resolve => {
                chrome.storage.sync.get({ userLabAbbreviations: {} }, resolve);
            });
            
            delete userLabAbbreviations[fullName];
            
            await new Promise(resolve => {
                chrome.storage.sync.set({ userLabAbbreviations }, resolve);
            });
            
            // 回復到預設值（如果有的話）
            this.abbreviations[fullName] = DEFAULT_LAB_ABBREVIATIONS[fullName] || fullName;
            return true;
        } catch (error) {
            console.error('移除檢驗縮寫失敗:', error);
            return false;
        }
    }
}

// 建立管理對話框
function createAbbreviationDialog() {
    const dialog = document.createElement('div');
    dialog.id = 'lab-abbrev-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 10001;
        min-width: 400px;
        max-height: 80vh;
        overflow-y: auto;
    `;

    dialog.innerHTML = `
        <h2 style="margin-top:0">管理檢驗項目縮寫</h2>
        <div id="abbrev-list" style="margin-bottom:15px"></div>
        <div style="display:flex;gap:10px">
            <input type="text" id="new-full-name" placeholder="完整名稱" style="flex:1">
            <input type="text" id="new-abbrev" placeholder="縮寫" style="width:100px">
            <button id="add-abbrev" style="padding:5px 10px">新增</button>
        </div>
        <div style="margin-top:15px;text-align:right">
            <button id="close-dialog">關閉</button>
        </div>
    `;

    return dialog;
}

// 匯出所需的功能
window.labAbbreviationManager = new LabAbbreviationManager();
window.createAbbreviationDialog = createAbbreviationDialog;

console.log('開始創建 labAbbreviationManager');
window.labAbbreviationManager = new LabAbbreviationManager();
console.log('labAbbreviationManager 創建完成:', window.labAbbreviationManager);

// 立即執行初始化
if (window.labAbbreviationManager) {
    window.labAbbreviationManager.loadAbbreviations().then(result => {
        console.log('初始縮寫載入完成:', result);
    });
}