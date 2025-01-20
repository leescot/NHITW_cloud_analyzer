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
    autoProcess: true,
    showLabUnit: false,
    highlightAbnormalLab: true,
    showLabReference: false,
    labDisplayFormat: 'horizontal',
    enableAutoPaging: false,
    maxPageCount: '1',
    enableLabAbbrev: true,
    enableATC5Coloring: false,
    showDiagnosis: false
};

// 當頁面載入時，載入已儲存的設定
document.addEventListener('DOMContentLoaded', () => {
    // 載入儲存的設定
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        // 基本設定
        document.getElementById('titleFontSize').value = settings.titleFontSize;
        document.getElementById('contentFontSize').value = settings.contentFontSize;
        document.getElementById('noteFontSize').value = settings.noteFontSize;
        document.getElementById('windowWidth').value = settings.windowWidth;
        document.getElementById('windowHeight').value = settings.windowHeight;
        
        // 藥歷設定
        document.getElementById('showGenericName').checked = settings.showGenericName;
        document.getElementById('simplifyMedicineName').checked = settings.simplifyMedicineName;
        document.getElementById('copyFormat').value = settings.copyFormat;
        document.getElementById('enableATC5Coloring').checked = settings.enableATC5Coloring;
        document.getElementById('showDiagnosis').checked = settings.showDiagnosis;
        
        // 檢驗設定
        document.getElementById('autoProcess').checked = settings.autoProcess;
        document.getElementById('showLabUnit').checked = settings.showLabUnit;
        document.getElementById('highlightAbnormalLab').checked = settings.highlightAbnormalLab;
        document.getElementById('showLabReference').checked = settings.showLabReference;
        document.getElementById('labDisplayFormat').value = settings.labDisplayFormat;
        document.getElementById('enableLabAbbrev').checked = settings.enableLabAbbrev;
        
        // 翻頁設定
        document.getElementById('enableAutoPaging').checked = settings.enableAutoPaging;
        document.getElementById('maxPageCount').value = settings.maxPageCount;

        // 控制 ATC5 管理按鈕的顯示
        const manageATC5Button = document.getElementById('manageATC5Colors');
        manageATC5Button.style.display = settings.enableATC5Coloring ? 'block' : 'none';
    });

    // ATC5 相關事件監聽
    const enableATC5Check = document.getElementById('enableATC5Coloring');
    const manageATC5Button = document.getElementById('manageATC5Colors');
    
    enableATC5Check.addEventListener('change', (e) => {
        manageATC5Button.style.display = e.target.checked ? 'block' : 'none';
    });

    // 使用 atc5ColorManager.js 提供的對話框
    manageATC5Button.addEventListener('click', () => {
        if (window.createATC5ColorDialog) {
            const dialog = window.createATC5ColorDialog();
            document.body.appendChild(dialog);
        } else {
            console.error('ATC5ColorManager 未正確載入');
        }
    });

    // 縮寫管理按鈕點擊事件
    document.getElementById('manageLabAbbrev').addEventListener('click', () => {
        const dialog = createAbbreviationDialog();
        document.body.appendChild(dialog);
        
        window.labAbbreviationManager.loadAbbreviations().then(({abbreviations}) => {
            const list = dialog.querySelector('#abbrev-list');
            list.innerHTML = '';
            
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
            
            list.querySelectorAll('.remove-abbrev').forEach(button => {
                button.onclick = async () => {
                    const fullName = button.dataset.full;
                    await window.labAbbreviationManager.removeUserAbbreviation(fullName);
                    button.closest('div').remove();
                };
            });
        });

        const addButton = dialog.querySelector('#add-abbrev');
        addButton.onclick = async () => {
            const fullName = dialog.querySelector('#new-full-name').value.trim();
            const abbrev = dialog.querySelector('#new-abbrev').value.trim();
            
            if (fullName && abbrev) {
                await window.labAbbreviationManager.saveUserAbbreviation(fullName, abbrev);
                const list = dialog.querySelector('#abbrev-list');
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;gap:10px;margin-bottom:5px;';
                item.innerHTML = `
                    <span style="flex:1">${fullName}</span>
                    <span style="width:100px">${abbrev}</span>
                    <button class="remove-abbrev" data-full="${fullName}">移除</button>
                `;
                list.appendChild(item);
                
                dialog.querySelector('#new-full-name').value = '';
                dialog.querySelector('#new-abbrev').value = '';
            }
        };

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
            enableLabAbbrev: document.getElementById('enableLabAbbrev').checked,
            enableATC5Coloring: document.getElementById('enableATC5Coloring').checked,
            showDiagnosis: document.getElementById('showDiagnosis').checked
        };

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