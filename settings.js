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
    enableAutoPaging: true,
    maxPageCount: '5',
    enableLabAbbrev: true,
    enableATC5Coloring: true,
    showDiagnosis: false,
    enableMedicineGrouping: true,
    enableLabGrouping: true
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
        document.getElementById('enableMedicineGrouping').checked = settings.enableMedicineGrouping;
        
        // 檢驗設定
        document.getElementById('autoProcess').checked = settings.autoProcess;
        document.getElementById('showLabUnit').checked = settings.showLabUnit;
        document.getElementById('highlightAbnormalLab').checked = settings.highlightAbnormalLab;
        document.getElementById('showLabReference').checked = settings.showLabReference;
        document.getElementById('labDisplayFormat').value = settings.labDisplayFormat;
        document.getElementById('enableLabAbbrev').checked = settings.enableLabAbbrev;
        document.getElementById('enableLabGrouping').checked = settings.enableLabGrouping;
        
        // 翻頁設定
        document.getElementById('enableAutoPaging').checked = settings.enableAutoPaging;
        document.getElementById('maxPageCount').value = settings.maxPageCount;

        // 控制 ATC5 管理按鈕的顯示
        const manageATC5Button = document.getElementById('manageATC5Colors');
        manageATC5Button.style.display = settings.enableATC5Coloring ? 'block' : 'none';

        // 控制檢驗表格設定按鈕的顯示
        const configureLabTableBtn = document.getElementById('configureLabTable');
        configureLabTableBtn.style.display = settings.enableLabGrouping ? 'block' : 'none';
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

    // 檢驗表格設定相關
    const enableLabGroupingCheck = document.getElementById('enableLabGrouping');
    const configureLabTableBtn = document.getElementById('configureLabTable');
    const configDialog = document.getElementById('lab-table-config-dialog');
    const closeConfigBtn = document.getElementById('close-lab-config');
    const saveConfigBtn = document.getElementById('save-lab-config');

    // 控制設定按鈕顯示
    enableLabGroupingCheck.addEventListener('change', (e) => {
        configureLabTableBtn.style.display = e.target.checked ? 'block' : 'none';
    });

    // 打開設定對話框
    configureLabTableBtn.addEventListener('click', async () => {
        if (!window.labTableConfigManager) {
            console.error('labTableConfigManager 未載入');
            return;
        }
    
        const { config } = await window.labTableConfigManager.loadConfig();
        
        // 初始化優先順序列表
        const priorityList = document.getElementById('priority-codes-list');
        if (priorityList) {
            priorityList.innerHTML = '';
            config.priorityCodes.forEach((code, index) => {
                addPriorityCodeToList(code, index);
            });
        }
    
        // 初始化特殊項目設定
        ['06012C', '08011C', '08013C'].forEach(code => {  // 加入 08013C
            const codeId = `code${code}`;
            const item = config.specialItems[code];
            if (!item) return;
            
            const displayMode = item.displayMode;
            const radioButton = document.querySelector(`input[name="${codeId}-display"][value="${displayMode}"]`);
            const partialItemsDiv = document.getElementById(`${codeId}-items`);
            const itemsList = partialItemsDiv?.querySelector('.items-list');
            
            // 設置單選按鈕狀態
            if (radioButton) {
                radioButton.checked = true;
            }
            
            // 更新部分項目列表
            if (itemsList) {
                itemsList.innerHTML = '';
                if (displayMode === 'partial' && partialItemsDiv) {
                    partialItemsDiv.style.display = 'block';
                    item.partialItems.forEach(partialItem => {
                        addPartialItemToList(code, partialItem);
                    });
                } else if (partialItemsDiv) {
                    partialItemsDiv.style.display = 'none';
                }
            }
        });
    
        configDialog.style.display = 'block';
    });

    // 處理優先順序代碼
    document.getElementById('add-priority-code').addEventListener('click', async () => {
        const input = document.getElementById('new-priority-code');
        const code = input.value.trim();
        
        if (code && await window.labTableConfigManager.addPriorityCode(code)) {
            addPriorityCodeToList(code);
            input.value = '';
        }
    });

    // 處理特殊項目
    ['06012C', '08011C', '08013C'].forEach(code => {
        const codeId = `code${code}`;
        
        // 處理單選按鈕
        const radioButtons = document.querySelectorAll(`input[name="${codeId}-display"]`);
        const partialItemsDiv = document.getElementById(`${codeId}-items`);
        
        radioButtons.forEach(radio => {
            radio.addEventListener('change', async (e) => {
                if (partialItemsDiv) {
                    partialItemsDiv.style.display = e.target.value === 'partial' ? 'block' : 'none';
                }
                
                // 更新配置
                await window.labTableConfigManager.updateSpecialItemConfig(
                    code,
                    e.target.value,
                    e.target.value === 'partial' ? [] : undefined
                );
            });
        });

        // 處理部分項目輸入
        if (partialItemsDiv) {
            const itemInput = partialItemsDiv.querySelector('input');
            const addButton = partialItemsDiv.querySelector('.add-item');
            
            if (addButton && itemInput) {
                addButton.addEventListener('click', async () => {
                    const item = itemInput.value.trim();
                    if (item && await window.labTableConfigManager.addPartialItem(code, item)) {
                        addPartialItemToList(code, item);
                        itemInput.value = '';
                    }
                });

                // Enter 鍵處理
                itemInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        const item = itemInput.value.trim();
                        if (item && await window.labTableConfigManager.addPartialItem(code, item)) {
                            addPartialItemToList(code, item);
                            itemInput.value = '';
                        }
                    }
                });
            }
        }
    });

    // 關閉對話框
    closeConfigBtn.addEventListener('click', () => {
        configDialog.style.display = 'none';
    });

    // 儲存設定
    saveConfigBtn.addEventListener('click', async () => {
        const newConfig = {
            priorityCodes: Array.from(document.querySelectorAll('.priority-code span'))
                .map(span => span.textContent),
            specialItems: {}
        };
    
        ['06012C', '08011C', '08013C'].forEach(code => {  // 加入 08013C
            const codeId = `code${code}`;
            const displayMode = document.querySelector(`input[name="${codeId}-display"]:checked`)?.value || 'all';
            const partialItems = Array.from(
                document.querySelectorAll(`#${codeId}-items .item-tag`)
            ).map(tag => tag.textContent.trim().replace('×', '').trim());
    
            newConfig.specialItems[code] = {
                displayMode,
                partialItems: displayMode === 'partial' ? partialItems : []
            };
        });
    
        await window.labTableConfigManager.saveConfig(newConfig);
        configDialog.style.display = 'none';
    });

    // 點擊外部關閉對話框
    configDialog.addEventListener('click', (e) => {
        if (e.target === configDialog) {
            configDialog.style.display = 'none';
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
            showDiagnosis: document.getElementById('showDiagnosis').checked,
            enableMedicineGrouping: document.getElementById('enableMedicineGrouping').checked,
            enableLabGrouping: document.getElementById('enableLabGrouping').checked
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

// 輔助函數
function addPriorityCodeToList(code, index) {
    const priorityList = document.getElementById('priority-codes-list');
    if (!priorityList) return;

    const item = document.createElement('div');
    item.className = 'priority-code';
    item.innerHTML = `
        <div class="priority-code-number">${index + 1}</div>
        <span>${code}</span>
        <div class="move-buttons">
            <button class="move-up" title="上移">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
            </button>
            <button class="move-down" title="下移">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
            </button>
            <button class="remove-code" title="移除">×</button>
        </div>
    `;

    // 移動按鈕功能
    const moveUpBtn = item.querySelector('.move-up');
    const moveDownBtn = item.querySelector('.move-down');
    const removeBtn = item.querySelector('.remove-code');

    if (moveUpBtn) {
        moveUpBtn.onclick = async () => {
            const currentItem = item;
            const previousItem = currentItem.previousElementSibling;
            if (previousItem) {
                priorityList.insertBefore(currentItem, previousItem);
                await updatePriorityOrder(priorityList);
                updatePriorityNumbers();
            }
        };
    }

    if (moveDownBtn) {
        moveDownBtn.onclick = async () => {
            const currentItem = item;
            const nextItem = currentItem.nextElementSibling;
            if (nextItem) {
                priorityList.insertBefore(nextItem, currentItem);
                await updatePriorityOrder(priorityList);
                updatePriorityNumbers();
            }
        };
    }

    if (removeBtn) {
        removeBtn.onclick = async () => {
            if (window.labTableConfigManager) {
                await window.labTableConfigManager.removePriorityCode(code);
                item.remove();
                updatePriorityNumbers();
            }
        };
    }

    priorityList.appendChild(item);
}

// 更新序號的輔助函數
function updatePriorityNumbers() {
    const priorityList = document.getElementById('priority-codes-list');
    if (!priorityList) return;

    const items = priorityList.querySelectorAll('.priority-code');
    items.forEach((item, index) => {
        const numberDiv = item.querySelector('.priority-code-number');
        if (numberDiv) {
            numberDiv.textContent = index + 1;
        }
    });
}

async function updatePriorityOrder(priorityList) {
    if (window.labTableConfigManager) {
        const newOrder = Array.from(priorityList.querySelectorAll('.priority-code span'))
            .map(span => span.textContent);
        const config = {
            priorityCodes: newOrder,
            specialItems: window.labTableConfigManager.config.specialItems
        };
        await window.labTableConfigManager.saveConfig(config);
    }
}

function addPartialItemToList(code, item) {
    const codeId = `code${code}`;
    const itemsList = document.querySelector(`#${codeId}-items .items-list`);
    const itemTag = document.createElement('span');
    itemTag.className = 'item-tag';
    itemTag.innerHTML = `
        ${item}
        <span class="remove-item">×</span>
    `;

    itemTag.querySelector('.remove-item').onclick = async () => {
        await window.labTableConfigManager.removePartialItem(code, item);
        itemTag.remove();
    };

    itemsList.appendChild(itemTag);
}

function createAbbreviationDialog() {
    const dialog = document.createElement('div');
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
        width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    `;

    dialog.innerHTML = `
        <h2 style="margin-top: 0;">管理檢驗項目縮寫</h2>
        <div style="margin-bottom: 20px;">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <input id="new-full-name" placeholder="完整名稱" style="flex: 1;">
                <input id="new-abbrev" placeholder="縮寫" style="width: 100px;">
                <button id="add-abbrev">新增</button>
            </div>
            <div id="abbrev-list" style="max-height: 400px; overflow-y: auto;"></div>
        </div>
        <div style="text-align: right;">
            <button id="close-dialog">關閉</button>
        </div>
    `;

    return dialog;
}