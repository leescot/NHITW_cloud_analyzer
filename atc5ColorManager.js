// 預設的 ATC5 顏色對應表
const DEFAULT_ATC5_COLORS = {
    red: ['M01AA', 'M01AB', 'M01AC', 'M01AE', 'M01AG', 'M01AH'],
    blue: [],
    green: []
};

class ATC5ColorManager {
    constructor() {
        console.log('初始化 ATC5ColorManager');
        this.colors = {...DEFAULT_ATC5_COLORS};
    }

    // 載入設定
    async loadColors() {
        console.log('開始載入 ATC5 顏色設定');
        try {
            const result = await new Promise(resolve => {
                chrome.storage.sync.get({
                    atc5Colors: DEFAULT_ATC5_COLORS,
                    enableATC5Coloring: false
                }, resolve);
            });
            
            console.log('載入的 ATC5 設定:', result);
            this.colors = result.atc5Colors;
            
            return {
                colors: this.colors,
                enabled: result.enableATC5Coloring
            };
        } catch (error) {
            console.error('載入 ATC5 顏色設定失敗:', error);
            return {
                colors: DEFAULT_ATC5_COLORS,
                enabled: false
            };
        }
    }

    // 新增 ATC5 代碼
    async addCode(color, code) {
        if (!this.colors[color]) return false;
        
        const normalizedCode = code.trim().toUpperCase();
        if (!normalizedCode || this.colors[color].includes(normalizedCode)) {
            return false;
        }

        this.colors[color].push(normalizedCode);
        await this.saveColors();
        return true;
    }

    // 移除 ATC5 代碼
    async removeCode(color, code) {
        if (!this.colors[color]) return false;

        this.colors[color] = this.colors[color].filter(c => c !== code);
        await this.saveColors();
        return true;
    }

    // 儲存當前設定
    async saveColors() {
        try {
            await new Promise(resolve => {
                chrome.storage.sync.set({ atc5Colors: this.colors }, resolve);
            });
            return true;
        } catch (error) {
            console.error('儲存 ATC5 顏色設定失敗:', error);
            return false;
        }
    }
}

// 管理對話框相關的功能
function createATC5ColorDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'atc5-color-dialog';
    
    dialog.innerHTML = `
        <h2>管理 ATC5碼 顏色對照</h2>
        <h3>ATC查詢: <a href="https://atcddd.fhi.no/atc_ddd_index/" target="_blank">https://atcddd.fhi.no/atc_ddd_index/</a></h3>
            
        
        <div class="atc5-color-section">
            <h3 style="color: red;">紅色 (NSAID)</h3>
            <div class="atc5-code-list" id="red-codes"></div>
        </div>
        
        <div class="atc5-color-section">
            <h3 style="color: blue;">藍色</h3>
            <div class="atc5-code-list" id="blue-codes"></div>
            <div class="atc5-input-group">
                <input type="text" id="blue-atc5-input" placeholder="輸入 ATC5 代碼">
                <button id="add-blue-atc5">新增</button>
            </div>
        </div>
        
        <div class="atc5-color-section">
            <h3 style="color: green;">綠色</h3>
            <div class="atc5-code-list" id="green-codes"></div>
            <div class="atc5-input-group">
                <input type="text" id="green-atc5-input" placeholder="輸入 ATC5 代碼">
                <button id="add-green-atc5">新增</button>
            </div>
        </div>
        
        <div style="text-align: right; margin-top: 20px;">
            <button id="close-atc5-dialog">關閉</button>
        </div>
    `;

    // 更新代碼列表
    async function updateCodeList(color) {
        const result = await window.atc5ColorManager.loadColors();
        const container = dialog.querySelector(`#${color}-codes`);
        container.innerHTML = '';
        
        result.colors[color].forEach(code => {
            const item = document.createElement('div');
            item.className = 'atc5-code-item';
            
            const codeSpan = document.createElement('span');
            codeSpan.textContent = code;
            item.appendChild(codeSpan);

            if (color !== 'red') {
                const removeButton = document.createElement('button');
                removeButton.textContent = '×';
                removeButton.addEventListener('click', async () => {
                    await window.atc5ColorManager.removeCode(color, code);
                    updateCodeList(color);
                });
                item.appendChild(removeButton);
            }

            container.appendChild(item);
        });
    }

    // 添加事件監聽器
    dialog.addEventListener('click', (event) => {
        if (event.target.id === 'close-atc5-dialog') {
            dialog.remove();
        }
    });

    // 為藍色和綠色添加代碼的事件監聽器
    ['blue', 'green'].forEach(color => {
        const addButton = dialog.querySelector(`#add-${color}-atc5`);
        if (addButton) {
            addButton.addEventListener('click', async () => {
                const input = dialog.querySelector(`#${color}-atc5-input`);
                const code = input.value.trim();
                
                if (await window.atc5ColorManager.addCode(color, code)) {
                    updateCodeList(color);
                    input.value = '';
                }
            });
        }
    });

    // 初始化所有顏色的代碼列表
    ['red', 'blue', 'green'].forEach(color => updateCodeList(color));

    return dialog;
}

// 導出模組
window.atc5ColorManager = new ATC5ColorManager();
window.createATC5ColorDialog = createATC5ColorDialog;

// 觸發準備就緒事件
console.log('ATC5ColorManager 初始化完成');
document.dispatchEvent(new Event('atc5ColorManagerReady'));