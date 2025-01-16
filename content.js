chrome.storage.sync.get({
    enableAutoPaging: true,
    maxPageCount: '5'
}, (settings) => {
    console.log('自動翻頁設定:', settings);
});

console.log('藥歷 Extension 已載入');

// 從 medicineProcessor 中獲取需要的函數
const medicineProcessor = window.medicineProcessor;

// 定義要自動處理的URL
const AUTO_PROCESS_URLS = {
    MEDICINE: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008',
    LAB: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0060'
};

// 檢查當前URL是否需要自動處理
function shouldAutoProcess() {
    const currentUrl = window.location.href;
    return Object.values(AUTO_PROCESS_URLS).includes(currentUrl);
}

// 等待表格載入的函數
// 修改 waitForTables 函數
function waitForTables(callback, maxAttempts = 20) {
    let attempts = 0;
    
    const checkTables = () => {
        const tables = document.getElementsByTagName('table');
        const currentUrl = window.location.href;
        
        // 確保只在藥品頁面檢查相關表格
        if (currentUrl !== AUTO_PROCESS_URLS.MEDICINE) {
            console.log('不在藥品頁面，停止檢查表格');
            return;
        }

        const hasDataTable = Array.from(tables).some(table => {
            const headerText = table.innerText.toLowerCase();
            return (headerText.includes('藥品') || 
                    headerText.includes('用藥') || 
                    headerText.includes('medicine')) &&
                    table.querySelector('tbody tr td') !== null;
        });

        if (tables.length > 0 && hasDataTable) {
            console.log('找到已載入資料的表格，開始處理');
            setTimeout(callback, 500);
        } else if (attempts < maxAttempts) {
            attempts++;
            console.log(`等待表格載入... 嘗試次數: ${attempts}`);
            setTimeout(checkTables, 1000);
        } else {
            console.log('等待表格載入超時');
        }
    };

    checkTables();
}

// 修改檢查按鈕為圖示按鈕
const testButton = document.createElement('button');
testButton.style.cssText = `
    position: fixed;
    top: 40px;
    right: 20px;
    z-index: 10000;
    width: 48px;
    height: 48px;
    padding: 0;
    background-color: transparent;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
`;

// 創建圖示
const icon = document.createElement('img');
icon.src = chrome.runtime.getURL('icon128.png');
icon.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
`;

// 檢查所有表格
function inspectAllTables() {
    console.log('開始檢查所有表格');
    
    // 找出所有表格
    const allTables = document.getElementsByTagName('table');
    console.log(`找到 ${allTables.length} 個表格`);

    // 檢查每個表格
    Array.from(allTables).forEach((table, index) => {
        console.log(`表格 #${index}:`, {
            id: table.id,
            className: table.className,
            rowCount: table.rows.length,
            preview: table.outerHTML.substring(0, 100)
        });
    });

    // 尋找可能包含藥品資訊的表格
    const potentialTables = Array.from(allTables).filter(table => {
        const headerText = table.innerText.toLowerCase();
        return headerText.includes('藥品') || 
               headerText.includes('用藥') ||
               headerText.includes('medicine');
    });

    console.log('可能包含藥品資訊的表格數量:', potentialTables.length);
    return potentialTables;
}

function extractMedicineNames(table) {
    console.log('開始分析表格資料:', table);
    
    // 取得表頭並建立欄位映射
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    console.log('表頭:', headers);

    // 動態建立欄位映射
    const columnMap = {
        序號: headers.indexOf('項次'),
        來源: headers.indexOf('來源'),
        主診斷: headers.indexOf('主診斷'),
        藥品名稱: headers.indexOf('藥品名稱'),
        就醫日期: headers.indexOf('就醫日期'),
        成分名稱: headers.indexOf('成分名稱'),
        藥品用量: headers.indexOf('藥品用量'),
        用法用量: headers.indexOf('用法用量'),
        給藥日數: headers.indexOf('給藥日數'),
        藥品規格量: headers.indexOf('藥品規格量')
    };

    // 檢查是否有找到所有需要的欄位
    console.log('欄位映射:', columnMap);
    if (Object.values(columnMap).includes(-1)) {
        console.error('無法找到部分必要欄位');
        return;
    }

    const rows = table.querySelectorAll('tbody tr');
    console.log('表格行數:', rows.length);
    
    // 收集藥品資料
    const medicineData = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return null;

        // 獲取每個欄位的原始資料
        const rawData = {
            date: cells[columnMap.就醫日期]?.textContent.trim(),
            source: cells[columnMap.來源]?.textContent.trim(),
            diagnosis: cells[columnMap.主診斷]?.textContent.trim(),
            medicineName: cells[columnMap.藥品名稱]?.textContent.trim(),
            ingredient: cells[columnMap.成分名稱]?.textContent.trim(),
            dosage: cells[columnMap.藥品用量]?.textContent.trim(),
            usage: cells[columnMap.用法用量]?.textContent.trim(),
            days: cells[columnMap.給藥日數]?.textContent.trim(),
            spec: cells[columnMap.藥品規格量]?.textContent.trim()
        };

        // console.log('藥品原始資料:', rawData);
        // console.log('開始處理藥品規格量:', rawData.spec);

        const specText = cells[columnMap.藥品規格量]?.textContent.trim() || '';
        const specMatch = specText.match(/(\d+)/);
        const specNumber = specMatch ? specMatch[1] + '#' : '';

        // console.log('規格量處理結果:', {
        //     specText,
        //     specMatch,
        //     specNumber
        // });

        const medicineInfo = {
            date: rawData.date,
            source: rawData.source.split('\n')[0],
            diagnosis: rawData.diagnosis.split('\n'),
            medicineName: rawData.medicineName,
            ingredient: rawData.ingredient,
            dosage: rawData.dosage,
            usage: rawData.usage,
            days: rawData.days,
            spec: specNumber
        };

        // console.log('處理後的藥品資料:', {
        //     ...medicineInfo,
        //     calculatedPerDosage: window.medicineProcessor.calculatePerDosage(medicineInfo.dosage, medicineInfo.usage)
        // });
        
        return medicineInfo;
    }).filter(Boolean);

    // 依照日期分組
    const groupedByDate = medicineData.reduce((groups, med) => {
        if (!groups[med.date]) {
            groups[med.date] = {
                date: med.date,
                source: med.source,
                diagnosis: med.diagnosis[0] || '',
                diagnosisCode: med.diagnosis[1] || '',
                medicines: []
            };
        }
        groups[med.date].medicines.push({
            name: med.medicineName,
            spec: med.spec,
            dosage: med.dosage,
            usage: med.usage,
            days: med.days,
            ingredient: med.ingredient
        });
        return groups;
    }, {});

    displayGroupedMedicineData(groupedByDate);
}

function displayGroupedMedicineData(groupedData) {
    chrome.storage.sync.get({
        titleFontSize: '16',
        contentFontSize: '14',
        noteFontSize: '12',
        windowWidth: '400',
        windowHeight: '80',
        showGenericName: false,
        simplifyMedicineName: true,  // 新增預設值
        copyFormat: 'nameWithDosageVertical'
    }, (settings) => {
        const displayDiv = document.createElement('div');
        displayDiv.id = 'medicine-names-list';
        displayDiv.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background-color: #ffffff;
            border: 3px solid #d3efff;
            padding: 20px;
            border-radius: 10px;
            height: ${settings.windowHeight}vh;
            width: ${settings.windowWidth}px;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
        `;

        // 創建標題區域
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
            background-color: #d3efff;
            color: #2196F3;
            padding: 12px 15px;
            margin: -20px -20px 15px -20px;
            border-radius: 7px 7px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;

        const titleH3 = document.createElement('h3');
        titleH3.textContent = '西醫用藥 用藥記錄';
        titleH3.style.cssText = `
            margin: 0;
            font-size: ${settings.titleFontSize}px;
            padding: 0;
            font-weight: bold;
        `;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            color: #2196F3;
            cursor: pointer;
            font-size: 20px;
            padding: 0 0 3px 0;
            line-height: 1;
        `;
        closeButton.onclick = () => displayDiv.remove();

        headerDiv.appendChild(titleH3);
        headerDiv.appendChild(closeButton);

        // 創建內容區域
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = `
            flex-grow: 1;
            overflow-y: auto;
            padding-right: 5px;
        `;

        // 為每個日期區塊創建複製事件處理函數
        const handleCopy = (date, source, medicines) => {
            // 只取來源的醫院名稱，移除門診編號
            const hospitalName = source.split('門診')[0];
            // 根據 simplifyMedicineName 設定處理藥品名稱
            const processedMedicines = medicines.map(med => ({
                ...med,
                name: settings.simplifyMedicineName ? 
                    medicineProcessor.simplifyMedicineName(med.name) : 
                    med.name
            }));
            const text = `${date} ${hospitalName}\n${medicineProcessor.formatMedicineList(processedMedicines, settings.copyFormat)}`;
            
            navigator.clipboard.writeText(text).then(() => {
                const button = contentDiv.querySelector(`[data-date="${date}"]`);
                if (button) {
                    button.textContent = '已複製！';
                    setTimeout(() => {
                        button.textContent = '複製';
                    }, 2000);
                }
            });
        };

        Object.values(groupedData)
            .sort((a, b) => b.date.localeCompare(a.date))
            .forEach(group => {
                const dateBlock = document.createElement('div');
                dateBlock.style.cssText = 'margin-bottom: 20px;';

                const headerBlock = document.createElement('div');
                headerBlock.style.cssText = `
                    font-weight: bold;
                    color: #2196F3;
                    font-size: ${settings.titleFontSize}px;
                    padding-bottom: 5px;
                    margin-bottom: 10px;
                    border-bottom: 2px solid #d3efff;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;

                const dateText = document.createElement('span');
                dateText.textContent = medicineProcessor.formatDiagnosis(
                    group.date, 
                    group.source, 
                    group.diagnosis, 
                    group.diagnosisCode
                );

                const copyButton = document.createElement('button');
                copyButton.textContent = '複製';
                copyButton.dataset.date = group.date;
                copyButton.style.cssText = `
                    background-color: #2196F3;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 2px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 10px;
                    display: ${settings.copyFormat === 'none' ? 'none' : 'block'};
                `;
                copyButton.onclick = () => handleCopy(group.date, group.source, group.medicines);

                headerBlock.appendChild(dateText);
                headerBlock.appendChild(copyButton);

                const medicinesList = document.createElement('div');
                medicinesList.style.cssText = `
                    padding-left: 10px;
                    font-size: ${settings.contentFontSize}px;
                `;

                group.medicines.forEach(med => {
                    const medHtml = medicineProcessor.processMedicineDisplay(
                        med, 
                        settings.showGenericName,
                        settings.simplifyMedicineName  // 傳入是否簡化藥名的設定
                    );
                    const medDiv = document.createElement('div');
                    medDiv.innerHTML = medHtml;
                    const noteDiv = medDiv.querySelector('[style*="color: #666"]');
                    if (noteDiv) {
                        noteDiv.style.fontSize = `${settings.noteFontSize}px`;
                    }
                    medicinesList.appendChild(medDiv);
                });

                dateBlock.appendChild(headerBlock);
                dateBlock.appendChild(medicinesList);
                contentDiv.appendChild(dateBlock);
            });

        // 清除可能存在的舊視窗
        const existingDiv = document.getElementById('medicine-names-list');
        if (existingDiv) {
            existingDiv.remove();
        }

        // 組裝視窗
        displayDiv.appendChild(headerDiv);
        displayDiv.appendChild(contentDiv);
        document.body.appendChild(displayDiv);
        
        console.log('已創建顯示視窗，使用設定的字型大小和視窗大小');
    });
}

testButton.onmouseover = () => {
    testButton.style.transform = 'scale(1.1)';
};
testButton.onmouseout = () => {
    testButton.style.transform = 'scale(1)';
};

// 將圖示加入按鈕
testButton.appendChild(icon);

// 按鈕點擊處理
// 修改按鈕點擊處理部分
testButton.onclick = () => {
    console.log('按鈕被點擊，檢查頁面類型');
    const currentUrl = window.location.href;
    
    if (currentUrl.includes('IMUE0060')) {
        console.log('當前為檢驗報告頁面');
        if (window.labProcessor) {
            window.labProcessor.handleButtonClick();
        } else {
            console.error('檢驗報告處理器尚未載入');
        }
    } else {
        console.log('當前為藥品頁面');
        const tables = inspectAllTables();
        if (tables.length > 0) {
            tables.forEach((table, index) => {
                console.log(`處理表格 ${index + 1}:`);
                extractMedicineNames(table);
            });
        } else {
            console.log('沒有找到合適的表格');
        }
    }
};

document.body.appendChild(testButton);

// 修改自動處理頁面函數
function autoProcessPage() {
    console.log('開始自動處理頁面');
    const currentUrl = window.location.href;
    
    if (currentUrl === AUTO_PROCESS_URLS.LAB) {
        console.log('檢測到檢驗報告頁面，等待表格載入');
        if (window.labProcessor) {
            window.labProcessor.initialize();
        }
    } else if (currentUrl === AUTO_PROCESS_URLS.MEDICINE) {
        console.log('檢測到藥品頁面，等待表格載入');
        waitForTables(() => {
            const tables = inspectAllTables();
            if (tables.length > 0) {
                tables.forEach((table, index) => {
                    extractMedicineNames(table);
                });
                listenToPageChanges();
            }
        });
    }
}


// 修改檢查頁面就緒函數
function checkPageReady(callback, maxAttempts = 20) {
    let attempts = 0;
    
    const check = async () => {
        if (!shouldAutoProcess()) {
            console.log('非目標頁面，不需要自動處理');
            return;
        }

        if (attempts < maxAttempts) {
            attempts++;
            const isLabPage = window.location.href === AUTO_PROCESS_URLS.LAB;
            
            if (isLabPage) {
                console.log('檢查檢驗報告頁面元件載入狀態');
                if (window.labProcessor && window.labAbbreviationManager) {
                    console.log('檢驗報告處理器和縮寫管理器都已載入');
                    try {
                        // 確保縮寫管理器已初始化
                        const abbrevResult = await window.labAbbreviationManager.loadAbbreviations();
                        console.log('縮寫初始化結果:', abbrevResult);
                        callback();
                    } catch (error) {
                        console.error('縮寫初始化失敗:', error);
                        setTimeout(check, 500);
                    }
                } else {
                    console.log(`等待元件載入... 嘗試次數: ${attempts}`);
                    console.log('labProcessor 存在:', !!window.labProcessor);
                    console.log('labAbbreviationManager 存在:', !!window.labAbbreviationManager);
                    setTimeout(check, 500);
                }
            } else {
                if (window.medicineProcessor) {
                    console.log('藥品處理器已載入，執行回調');
                    callback();
                } else {
                    console.log(`等待藥品處理器載入... 嘗試次數: ${attempts}`);
                    setTimeout(check, 500);
                }
            }
        } else {
            console.log('等待頁面準備就緒超時');
        }
    };

    check();
};

// 修改初始化自動處理函數
function initAutoProcess() {
    console.log('開始初始化自動處理...');
    
    checkPageReady(() => {
        chrome.storage.sync.get({ autoProcess: false }, (settings) => {
            if (settings.autoProcess) {
                console.log('自動處理功能已啟用，開始監控表格載入');
                autoProcessPage();
            } else {
                console.log('自動處理功能未啟用，等待使用者點擊按鈕');
            }
        });
    });
}

// 新增 initButtons 函數
function initButtons() {
    console.log('初始化所有按鈕...');
    
    const currentUrl = window.location.href;
    console.log('當前URL:', currentUrl);
    
    // 檢查是否為目標頁面
    if (currentUrl.includes('IMUE0008') || currentUrl.includes('IMUE0060')) {
        console.log('在目標頁面上，檢查自動翻頁設定');
        
        chrome.storage.sync.get({ enableAutoPaging: true }, (settings) => {
            if (settings.enableAutoPaging) {
                console.log('自動翻頁功能已啟用，準備初始化按鈕');
                // 等待表格載入後再初始化按鈕
                const waitForTableAndInit = () => {
                    const tables = document.getElementsByTagName('table');
                    const hasDataTable = Array.from(tables).some(table => 
                        table.querySelector('tbody tr td') !== null
                    );
                    
                    if (hasDataTable) {
                        console.log('表格已載入，初始化自動翻頁按鈕');
                        if (window.autoPagingHandler) {
                            window.autoPagingHandler.initialize();
                        } else {
                            console.error('自動翻頁處理器未載入');
                        }
                    } else {
                        console.log('等待表格載入...');
                        setTimeout(waitForTableAndInit, 500);
                    }
                };
                
                waitForTableAndInit();
            } else {
                console.log('自動翻頁功能未啟用，不初始化按鈕');
            }
        });
    }
    
    // 初始化原有的處理邏輯
    initAutoProcess();
}

// 為了處理可能的動態網頁導航，也監聽 URL 變化
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        console.log('檢測到 URL 變化，新 URL:', url);
        if (url.includes('IMUE0008') || url.includes('IMUE0060')) {
            console.log('進入目標頁面，初始化按鈕');
            setTimeout(() => {
                initButtons();
            }, 1000);
        }
    }
}).observe(document, { subtree: true, childList: true });

console.log('初始化完成，等待使用者操作...');

setTimeout(() => {
    console.log('檢查組件載入狀態:');
    console.log('autoPagingHandler 存在:', !!window.autoPagingHandler);
    console.log('medicineProcessor 存在:', !!window.medicineProcessor);
    console.log('labProcessor 存在:', !!window.labProcessor);
    console.log('當前URL:', window.location.href);
    console.log('auto-pagination-btn 存在:', !!document.getElementById('auto-pagination-btn'));
}, 2000);

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 載入完成，檢查當前頁面');
    if (window.location.href.includes('IMUE0008') || 
        window.location.href.includes('IMUE0060')) {
        console.log('當前在目標頁面，初始化按鈕');
        initButtons();
    }
    if (window.location.href.includes('IMUE0060')) {
        console.log('檢驗報告頁面，初始化縮寫管理器');
        window.labAbbreviationManager.loadAbbreviations().then(result => {
            console.log('縮寫管理器初始化完成:', result);
        });
    }
});

// 也監聽完整的頁面載入事件
window.addEventListener('load', () => {
    console.log('頁面完全載入，重新檢查初始化');
    if (window.location.href.includes('IMUE0008') || 
        window.location.href.includes('IMUE0060')) {
        console.log('當前在目標頁面，初始化按鈕');
        initButtons();
    }
});