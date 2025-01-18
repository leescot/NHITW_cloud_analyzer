// 等待 medicineProcessor 加載
function waitForMedicineProcessor(callback, maxAttempts = 20) {
    let attempts = 0;
    const check = () => {
        if (window.medicineProcessor) {
            callback(window.medicineProcessor);
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(check, 100);
        } else {
            console.error('無法載入 medicineProcessor');
        }
    };
    check();
}

// 定義要自動處理的URL
const AUTO_PROCESS_URLS = {
    MEDICINE: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0008',
    LAB: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0060',
    IMAGE: 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0130'
};

// 初始化設定
chrome.storage.sync.get({
    enableAutoPaging: true,
    maxPageCount: '5'
}, (settings) => {
    console.log('自動翻頁設定:', settings);
});

// 按鈕相關
let testButton;

function createMainButton() {
    waitForMedicineProcessor((medicineProcessor) => {
        if (testButton) {
            testButton.remove();
        }

        testButton = document.createElement('button');
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

        const icon = document.createElement('img');
        icon.src = chrome.runtime.getURL('icon128.png');
        icon.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;

        testButton.onmouseover = () => {
            testButton.style.transform = 'scale(1.1)';
        };
        testButton.onmouseout = () => {
            testButton.style.transform = 'scale(1)';
        };

        testButton.appendChild(icon);
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
            } else if (currentUrl.includes('IMUE0130')) {
                console.log('當前為影像及病理頁面');
                if (window.imageProcessor) {
                    window.imageProcessor.handleButtonClick();
                } else {
                    console.error('影像及病理處理器尚未載入');
                }
            } else {
                console.log('當前為藥品頁面');
                medicineProcessor.initialize();
            }
        };

        document.body.appendChild(testButton);
        console.log('主按鈕已創建並添加到頁面');
    });
}

// 立即初始化按鈕（如果文檔已經準備就緒）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createMainButton);
} else {
    createMainButton();
}

// 檢查當前URL是否需要自動處理
function shouldAutoProcess() {
    const currentUrl = window.location.href;
    return Object.values(AUTO_PROCESS_URLS).includes(currentUrl);
}

// 等待表格載入
function waitForTables(callback, maxAttempts = 10) {
    waitForMedicineProcessor((medicineProcessor) => {
        let attempts = 0;
        
        const checkTables = () => {
            const tables = document.getElementsByTagName('table');
            const currentUrl = window.location.href;
            
            let hasDataTable = false;

            if (currentUrl === AUTO_PROCESS_URLS.MEDICINE) {
                hasDataTable = Array.from(tables).some(table => {
                    const headerText = table.innerText.toLowerCase();
                    return (headerText.includes('藥品') || 
                            headerText.includes('用藥') || 
                            headerText.includes('medicine')) &&
                            table.querySelector('tbody tr td') !== null;
                });

                // 檢查是否有 ATC5 代碼欄位
                chrome.storage.sync.get({ enableATC5Coloring: false }, (settings) => {
                    if (settings.enableATC5Coloring) {
                        const hasATC5Column = Array.from(tables).some(table => 
                            medicineProcessor.checkATC5Column(table)
                        );
                        if (hasDataTable && !hasATC5Column) {
                            medicineProcessor.showATC5Warning();
                        }
                    }
                });
            } else if (currentUrl === AUTO_PROCESS_URLS.IMAGE) {
                // 為影像頁面添加特殊處理
                hasDataTable = Array.from(tables).some(table => {
                    // 檢查表頭是否包含必要欄位
                    const headers = Array.from(table.querySelectorAll('th'))
                        .map(th => th.textContent.trim());
                    const requiredHeaders = ['項次', '檢驗日期', '醫令名稱'];
                    const hasRequiredHeaders = requiredHeaders.every(header => 
                        headers.includes(header)
                    );
                    // 確認有數據行
                    return hasRequiredHeaders && table.querySelector('tbody tr td') !== null;
                });
            }

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
    });
}

// 修改自動處理頁面函數
function autoProcessPage() {
    console.log('開始自動處理頁面');
    const currentUrl = window.location.href;
    
    if (currentUrl === AUTO_PROCESS_URLS.LAB) {
        console.log('檢測到檢驗報告頁面，等待表格載入');
        if (window.labProcessor) {
            window.labProcessor.initialize();
        }
    } else if (currentUrl === AUTO_PROCESS_URLS.IMAGE) {
        console.log('檢測到影像報告頁面，等待表格載入');
        if (window.imageProcessor) {
            // 等待表格載入後再處理
            waitForTables(() => {
                console.log('影像報告表格已載入，開始處理');
                window.imageProcessor.handleButtonClick();
            });
        } else {
            console.error('影像處理器未載入');
        }
    } else if (currentUrl === AUTO_PROCESS_URLS.MEDICINE) {
        console.log('檢測到藥品頁面，等待表格載入');
        waitForTables(() => {
            medicineProcessor.initialize();
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
            const currentUrl = window.location.href;
            
            if (currentUrl === AUTO_PROCESS_URLS.LAB) {
                if (window.labProcessor && window.labAbbreviationManager) {
                    try {
                        const abbrevResult = await window.labAbbreviationManager.loadAbbreviations();
                        console.log('縮寫初始化結果:', abbrevResult);
                        callback();
                    } catch (error) {
                        console.error('縮寫初始化失敗:', error);
                        setTimeout(check, 500);
                    }
                } else {
                    setTimeout(check, 500);
                }
            } else if (currentUrl === AUTO_PROCESS_URLS.IMAGE) {
                if (window.imageProcessor) {
                    callback();
                } else {
                    setTimeout(check, 500);
                }
            } else {
                if (window.medicineProcessor) {
                    callback();
                } else {
                    setTimeout(check, 500);
                }
            }
        } else {
            console.log('等待頁面準備就緒超時');
        }
    };

    check();
}

// 初始化自動處理
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

// 初始化按鈕
function initButtons() {
    console.log('初始化所有按鈕...');
    
    // 確保主按鈕存在
    createMainButton();
    
    const currentUrl = window.location.href;
    console.log('當前URL:', currentUrl);
    
    if (currentUrl.includes('IMUE0008') || currentUrl.includes('IMUE0060')) {
        chrome.storage.sync.get({ enableAutoPaging: true }, (settings) => {
            if (settings.enableAutoPaging) {
                const waitForTableAndInit = () => {
                    const tables = document.getElementsByTagName('table');
                    const hasDataTable = Array.from(tables).some(table => 
                        table.querySelector('tbody tr td') !== null
                    );
                    
                    if (hasDataTable) {
                        console.log('表格已載入，初始化自動翻頁按鈕');
                        if (window.autoPagingHandler) {
                            window.autoPagingHandler.initialize();
                        }
                    } else {
                        console.log('等待表格載入...');
                        setTimeout(waitForTableAndInit, 500);
                    }
                };
                
                waitForTableAndInit();
            }
        });
    }
    
    // 初始化自動處理
    initAutoProcess();
}

// URL 變化監聽
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('IMUE0008') || 
            url.includes('IMUE0060') || 
            url.includes('IMUE0130')) {
            console.log('URL 變更，重新初始化按鈕');
            setTimeout(() => {
                initButtons();
            }, 1000);
        }
    }
}).observe(document, { subtree: true, childList: true });

// DOM 載入完成事件
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 載入完成，初始化按鈕');
    createMainButton();
    const currentUrl = window.location.href;
    
    if (currentUrl.includes('IMUE0008') || 
        currentUrl.includes('IMUE0060') || 
        currentUrl.includes('IMUE0130')) {
        initButtons();
    }
    
    if (currentUrl.includes('IMUE0060')) {
        window.labAbbreviationManager.loadAbbreviations().then(result => {
            console.log('縮寫管理器初始化完成:', result);
        });
    }
});

// 頁面完全載入事件
window.addEventListener('load', () => {
    if (window.location.href.includes('IMUE0008') || 
        window.location.href.includes('IMUE0060')) {
        initButtons();
    }
});