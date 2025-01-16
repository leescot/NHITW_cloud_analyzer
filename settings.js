// 預設值
const DEFAULT_SETTINGS = {
    titleFontSize: '16',
    contentFontSize: '14',
    noteFontSize: '12',
    windowWidth: '500',
    windowHeight: '80',
    showGenericName: false,
    simplifyMedicineName: true,
    copyFormat: 'nameWithDosageVertical',
    autoProcess: true,  // 預設自動讀取
    showLabUnit: false,  // 預設不顯示檢驗單位
    highlightAbnormalLab: true,  // 預設開啟異常值顯示
    showLabReference: false,  // 預設不顯示參考值
    labDisplayFormat: 'horizontal',  // 預設直式顯示
    enableAutoPaging: true,  // 預設關閉自動翻頁
    maxPageCount: '5',      // 預設最多翻 5 頁
    enableLabAbbrev: true
};

// 當頁面載入時，載入已儲存的設定
document.addEventListener('DOMContentLoaded', () => {
    // 載入儲存的設定
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        document.getElementById('titleFontSize').value = settings.titleFontSize;
        document.getElementById('contentFontSize').value = settings.contentFontSize;
        document.getElementById('noteFontSize').value = settings.noteFontSize;
        document.getElementById('windowWidth').value = settings.windowWidth;
        document.getElementById('windowHeight').value = settings.windowHeight;
        document.getElementById('showGenericName').checked = settings.showGenericName;
        document.getElementById('simplifyMedicineName').checked = settings.simplifyMedicineName;
        document.getElementById('copyFormat').value = settings.copyFormat;
        document.getElementById('autoProcess').checked = settings.autoProcess;
        document.getElementById('showLabUnit').checked = settings.showLabUnit;
        document.getElementById('highlightAbnormalLab').checked = settings.highlightAbnormalLab;
        document.getElementById('showLabReference').checked = settings.showLabReference;
        document.getElementById('labDisplayFormat').value = settings.labDisplayFormat;
        document.getElementById('enableAutoPaging').checked = settings.enableAutoPaging;
        document.getElementById('maxPageCount').value = settings.maxPageCount;
        document.getElementById('enableLabAbbrev').checked = settings.enableLabAbbrev; 
    });

    // 註冊管理按鈕點擊事件
    // 在 DOMContentLoaded 事件中的管理按鈕點擊事件處理部分
    document.getElementById('manageLabAbbrev').addEventListener('click', () => {
        const dialog = createAbbreviationDialog();
        document.body.appendChild(dialog);
        
        // 載入現有縮寫
        window.labAbbreviationManager.loadAbbreviations().then(({abbreviations}) => {
            const list = dialog.querySelector('#abbrev-list');
            list.innerHTML = ''; // 清空現有內容
            
            Object.entries(abbreviations).forEach(([full, abbrev]) => {
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;gap:10px;margin-bottom:5px;';
                item.innerHTML = `
                    <span style="flex:1">${full}</span>
                    <span style="width:100px">${abbrev}</span>
                    <button class="remove-abbrev" data-full="${full}">移除</button>
                `;
                list.appendChild(item);
            });
            
            // 綁定移除按鈕事件
            list.querySelectorAll('.remove-abbrev').forEach(button => {
                button.onclick = async () => {
                    const fullName = button.dataset.full;
                    await window.labAbbreviationManager.removeUserAbbreviation(fullName);
                    button.closest('div').remove();
                };
            });
        });

        // 綁定新增縮寫的事件
        const addButton = dialog.querySelector('#add-abbrev');
        addButton.onclick = async () => {
            const fullName = dialog.querySelector('#new-full-name').value.trim();
            const abbrev = dialog.querySelector('#new-abbrev').value.trim();
            
            if (fullName && abbrev) {
                await window.labAbbreviationManager.saveUserAbbreviation(fullName, abbrev);
                
                // 新增到列表中
                const list = dialog.querySelector('#abbrev-list');
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;gap:10px;margin-bottom:5px;';
                item.innerHTML = `
                    <span style="flex:1">${fullName}</span>
                    <span style="width:100px">${abbrev}</span>
                    <button class="remove-abbrev" data-full="${fullName}">移除</button>
                `;
                list.appendChild(item);
                
                // 清空輸入框
                dialog.querySelector('#new-full-name').value = '';
                dialog.querySelector('#new-abbrev').value = '';
            }
        };

        // 綁定關閉按鈕事件
        const closeButton = dialog.querySelector('#close-dialog');
        closeButton.onclick = () => dialog.remove();
    });

    // 儲存按鈕點擊事件
    document.getElementById('saveButton').addEventListener('click', () => {
        const newSettings = {
            titleFontSize: document.getElementById('titleFontSize').value,
            contentFontSize: document.getElementById('contentFontSize').value,
            noteFontSize: document.getElementById('noteFontSize').value,
            windowWidth: document.getElementById('windowWidth').value,
            windowHeight: document.getElementById('windowHeight').value,
            showGenericName: document.getElementById('showGenericName').checked,
            simplifyMedicineName: document.getElementById('simplifyMedicineName').checked,
            copyFormat: document.getElementById('copyFormat').value,
            autoProcess: document.getElementById('autoProcess').checked,
            showLabUnit: document.getElementById('showLabUnit').checked,
            highlightAbnormalLab: document.getElementById('highlightAbnormalLab').checked,
            showLabReference: document.getElementById('showLabReference').checked,
            labDisplayFormat: document.getElementById('labDisplayFormat').value,
            enableAutoPaging: document.getElementById('enableAutoPaging').checked,
            maxPageCount: document.getElementById('maxPageCount').value,
            enableLabAbbrev: document.getElementById('enableLabAbbrev').checked 
        };

        console.log('準備儲存的新設定:', newSettings);  // 添加日誌

        // 儲存設定
        chrome.storage.sync.set(newSettings, () => {
            const saveStatus = document.getElementById('saveStatus');
            saveStatus.style.display = 'block';
            setTimeout(() => {
                saveStatus.style.display = 'none';
            }, 2000);
        });
    });
});