console.log('載入檢驗報告處理模組');

// 觸發準備就緒事件
document.dispatchEvent(new Event('labProcessorReady'));

const labProcessor = {
    // 存儲當前的 observer
    currentObserver: null,

    // 清理函數
    cleanup() {
        if (this.currentObserver) {
            this.currentObserver.disconnect();
            this.currentObserver = null;
        }
    },

    // 檢查所有表格
    inspectLabTables() {
        console.log('開始檢查檢驗報告表格');
        const allTables = document.getElementsByTagName('table');
        console.log(`找到 ${allTables.length} 個表格`);

        // 尋找包含完整內容的表格
        const targetTable = Array.from(allTables).find(table => {
            // 檢查表頭
            const headers = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent.trim().toLowerCase());
            
            // 檢查是否包含必要欄位
            const requiredHeaders = ['檢驗日期', '醫令名稱', '檢驗項目', '檢驗結果'];
            const hasHeaders = requiredHeaders.every(header => 
                headers.some(h => h.includes(header.toLowerCase()))
            );

            // 檢查是否有資料行
            const hasRows = table.querySelector('tbody tr td') !== null;

            if (hasHeaders && !hasRows) {
                console.log('找到表格但資料尚未載入完成');
                return false;
            }

            return hasHeaders && hasRows;
        });

        if (targetTable) {
            console.log('找到包含資料的檢驗報告表格:', targetTable);
            return targetTable;
        }
        
        console.log('未找到完整的目標表格');
        return null;
    },

    // 分析檢驗數據
    analyzeLabData(table) {
        console.log('開始分析檢驗報告數據');
        
        if (!table) {
            console.error('無法分析：未提供表格');
            return null;
        }

        // 取得表頭
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        console.log('表頭:', headers);

        // 動態建立欄位映射
        const columnMap = {
            檢驗日期: headers.indexOf('檢驗日期'),
            醫令名稱: headers.indexOf('醫令名稱'),
            檢驗項目: headers.indexOf('檢驗項目'),
            檢驗結果: headers.indexOf('檢驗結果'),
            單位: headers.indexOf('單位'),
            參考值: headers.indexOf('參考值'),
            來源: headers.indexOf('來源')
        };

        // 取得所有資料列
        const rows = table.querySelectorAll('tbody tr');
        console.log('資料列數:', rows.length);

        // 收集檢驗資料
        const labData = Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return null;

            const testName = cells[columnMap.檢驗項目]?.textContent.trim() || 
                           cells[columnMap.醫令名稱]?.textContent.trim();

            let result = cells[columnMap.檢驗結果]?.textContent.trim() || '';
            const reference = cells[columnMap.參考值]?.textContent.trim() || '';
            
            // 解析參考值範圍
            const referenceRange = this.parseReferenceRange(reference);
            
            // 在這裡就進行特殊值的處理
            if (testName) {
                result = labValueProcessor.processLabValue(testName, result, referenceRange);
            }

            return {
                date: cells[columnMap.檢驗日期]?.textContent.trim(),
                testName: testName,
                result: result,
                reference: reference,
                source: cells[columnMap.來源]?.textContent.trim()
            };
        }).filter(Boolean);

        console.log('已收集的檢驗資料:', labData);

        // 依照日期分組
        const groupedByDate = this.groupLabDataByDate(labData);
        return groupedByDate;
    },

    // 依日期分組資料
    groupLabDataByDate(labData) {
        return labData.reduce((groups, lab) => {
            if (!lab.date) return groups;
            
            if (!groups[lab.date]) {
                groups[lab.date] = [];
            }
            
            groups[lab.date].push(lab);
            return groups;
        }, {});
    },

    // 按鈕點擊事件處理
    handleButtonClick() {
        console.log('檢驗報告按鈕被點擊');
        this.initializeWithRetry();
    },

    // 初始化功能（帶重試機制）
    initializeWithRetry(attempts = 0, maxAttempts = 10) {
        console.log(`嘗試初始化檢驗報告 (第 ${attempts + 1} 次)`);
        
        const table = this.inspectLabTables();
        if (table) {
            const data = this.analyzeLabData(table);
            if (data && Object.keys(data).length > 0) {
                this.displayLabResults(data);
                return;
            }
        }

        if (attempts < maxAttempts) {
            console.log('等待表格資料載入...');
            setTimeout(() => {
                this.initializeWithRetry(attempts + 1, maxAttempts);
            }, 1000);
        } else {
            console.log('載入表格資料超時');
        }
    },

    
    parseReferenceRange(referenceStr) {
        if (!referenceStr) return null;
        
        // 清理字串
        const cleanStr = referenceStr.trim();
        
        // Case 1: 參考值寫在同一個中括號內，格式如 [7~25]
        const singleBracketMatch = cleanStr.match(/\[(\d*\.?\d+)~(\d*\.?\d+)\]/);
        if (singleBracketMatch) {
            const min = parseFloat(singleBracketMatch[1]);
            const max = parseFloat(singleBracketMatch[2]);
            if (!isNaN(min) && !isNaN(max)) {
                return { min, max };
            }
        }

        // Case 2: 參考值分別寫在兩個中括號內，格式如 [150][400]
        const doubleBracketMatch = cleanStr.match(/\[(\d*\.?\d+)\]\[(\d*\.?\d+)\]/);
        if (doubleBracketMatch) {
            const min = parseFloat(doubleBracketMatch[1]);
            const max = parseFloat(doubleBracketMatch[2]);
            if (!isNaN(min) && !isNaN(max)) {
                return { min, max };
            }
        }

        // Case 3: 特殊情況 - 只有下限，格式如 [60.0][]
        const lowerBoundMatch = cleanStr.match(/\[(\d*\.?\d+)\]\[.*?\]/);
        if (lowerBoundMatch) {
            const min = parseFloat(lowerBoundMatch[1]);
            if (!isNaN(min)) {
                return { min, max: null };
            }
        }

        // Case 4: 特殊情況 - 只有單一值，格式如 [60.0]
        const singleValueMatch = cleanStr.match(/\[(\d*\.?\d+)\]/);
        if (singleValueMatch) {
            const value = parseFloat(singleValueMatch[1]);
            if (!isNaN(value)) {
                return { min: value, max: null };
            }
        }

        // Case 5: 特殊情況 - 無參考值或特殊標記，格式如 [無][]
        if (cleanStr.includes('[無]') || cleanStr === '[0][]') {
            return null;
        }

        // Case 6: 特殊情況 - 定性檢驗，格式如 [0][9999]
        if (cleanStr.match(/\[0\]\[9999\]/)) {
            return null;  // 定性檢驗不需要判斷異常值
        }

        return null;  // 無法解析的格式
    },

    isValueNormal(value, referenceRange, testName) {  // 加入 testName 參數
        if (!value) return null;
    
        // 優先處理特殊檢驗項目
        const specialResult = labValueProcessor.checkSpecialNormal(testName, value);
        if (specialResult !== null) {
            return specialResult;
        }
    
        // 處理定性檢驗結果
        if (typeof value === 'string' && 
            (value.toLowerCase().includes('negative') || 
             value.toLowerCase().includes('normal') || 
             value.toLowerCase().includes('not found'))) {
            return true;
        }
    
        if (!referenceRange) return null;
    
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return null;
    
        if (referenceRange.max === null) {
            return numValue >= referenceRange.min;
        } else {
            return numValue >= referenceRange.min && numValue <= referenceRange.max;
        }
    },

    separateValueAndUnit(result) {
        if (!result) return { value: '', unit: '' };
        
        // 處理定性結果
        if (typeof result === 'string' && 
            (result.toLowerCase().includes('negative') || 
             result.toLowerCase().includes('normal') || 
             result.toLowerCase().includes('not found'))) {
            return {
                value: result.split(' ')[0],  // 只取第一個詞
                unit: result.split(' ').slice(1).join(' ')  // 剩餘部分作為單位
            };
        }
        
        // 處理數值結果
        const cleanResult = result.trim();
        const match = cleanResult.match(/^(-?\d*\.?\d+)\s*(.*)$/);
        
        if (match) {
            return {
                value: match[1],
                unit: match[2].trim()
            };
        }
        
        // 無法解析的情況，回傳原始值
        return {
            value: cleanResult,
            unit: ''
        };
    },

    // 新增複製功能的處理函數
    formatLabDataForCopy(items, settings) {
        // 分離並格式化數據
        const formattedItems = items.map(item => {
            const { value, unit } = this.separateValueAndUnit(item.result);
            let displayText = `${item.testName} ${value}`;
            if (settings.showLabUnit && unit) {
                displayText += ` ${unit}`;
            }
            if (settings.showLabReference && item.reference) {
                displayText += settings.labDisplayFormat === 'vertical' ? 
                    ` (參考值: ${item.reference})` : 
                    ` (${item.reference})`;
            }
            return displayText;
        });

        // 根據顯示格式返回不同的字串格式
        if (settings.labDisplayFormat === 'vertical') {
            return formattedItems.join('\n');
        } else {
            return formattedItems.join(' ');
        }
    },

    // 處理複製按鈕點擊事件
    handleCopy(date, source, items, settings, button) {  // 加入 button 參數
        // 處理來源資訊，只保留到門診/住診/急診
        const processedSource = source.match(/(.*?(?:門診|住診|急診))/)?.[0] || source;
        
        // 組合完整的複製文字
        const copyText = `${date} ${processedSource}\n${this.formatLabDataForCopy(items, settings)}`;
        
        // 複製到剪貼簿
        navigator.clipboard.writeText(copyText).then(() => {
            // 直接使用傳入的按鈕參數
            if (button) {
                button.textContent = '已複製！';
                setTimeout(() => {
                    button.textContent = '複製';
                }, 2000);
            }
        }).catch(err => {
            console.error('複製失敗:', err);
        });
    },

    // Updated display results function
    displayLabResults(groupedData) {
        chrome.storage.sync.get({
            titleFontSize: '16',
            contentFontSize: '14',
            noteFontSize: '12',
            windowWidth: '500',
            windowHeight: '80',
            showLabUnit: false,
            highlightAbnormalLab: false,
            showLabReference: false,
            labDisplayFormat: 'horizontal',
            enableLabAbbrev: true
        }, async (settings) => {
            // 生成視窗容器
            const displayDiv = document.createElement('div');
            displayDiv.id = 'lab-results-list';
            displayDiv.style.cssText = `
                position: fixed;
                top: 90px;
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
    
            // 建立標題區域
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
            `;
    
            const titleH3 = document.createElement('h3');
            titleH3.textContent = '檢驗報告記錄';
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
                padding: 0;
                line-height: 1;
            `;
            closeButton.onclick = () => displayDiv.remove();
    
            headerDiv.appendChild(titleH3);
            headerDiv.appendChild(closeButton);
    
            // 建立內容區域
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = `
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 5px;
            `;
    
            // 載入縮寫設定（如果啟用）
            let abbreviations = {};
            let enabled = false;
            console.log('檢查縮寫設定狀態:', {
                enableLabAbbrev: settings.enableLabAbbrev,
                managerExists: !!window.labAbbreviationManager
            });

            if (settings.enableLabAbbrev && window.labAbbreviationManager) {
                console.log('準備載入檢驗縮寫設定');
                try {
                    const abbrevResult = await window.labAbbreviationManager.loadAbbreviations();
                    console.log('載入到的縮寫設定:', abbrevResult);
                    abbreviations = abbrevResult.abbreviations;
                    enabled = abbrevResult.enabled;
                    console.log('合併後的縮寫列表:', Object.entries(abbreviations));
                } catch (error) {
                    console.error('載入檢驗縮寫失敗:', error);
                }
            } else {
                console.log('縮寫功能未啟用或管理器未載入');
            }

            // 處理並顯示檢驗數據
            Object.entries(groupedData)
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .forEach(([date, items]) => {
                    const dateBlock = document.createElement('div');
                    dateBlock.style.cssText = 'margin-bottom: 20px;';
    
                    const sourceInfo = items[0].source;
                    const processedSource = sourceInfo.match(/(.*?(?:門診|住診|急診))/)?.[0] || sourceInfo;
    
                    const dateHeader = document.createElement('div');
                    dateHeader.style.cssText = `
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
                    dateText.textContent = `${date} ${processedSource}`;
    
                    const copyButton = document.createElement('button');
                    copyButton.textContent = '複製';
                    copyButton.style.cssText = `
                        background-color: #2196F3;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        padding: 2px 8px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-left: 10px;
                    `;
                    copyButton.onclick = () => this.handleCopy(date, sourceInfo, items, settings, copyButton);
    
                    dateHeader.appendChild(dateText);
                    dateHeader.appendChild(copyButton);
    
                    const itemsList = document.createElement('div');
                    itemsList.style.cssText = `
                        padding-left: 10px;
                        font-size: ${settings.contentFontSize}px;
                    `;
    
                    if (settings.labDisplayFormat === 'horizontal') {
                        // 橫式顯示
                        const horizontalDiv = document.createElement('div');
                        horizontalDiv.style.cssText = `
                            display: flex;
                            flex-wrap: wrap;
                            gap: 10px;
                            margin-bottom: 15px;
                        `;
    
                        items.forEach(item => {
                            const itemSpan = document.createElement('span');
                            const { value, unit } = this.separateValueAndUnit(item.result);
                            const referenceRange = this.parseReferenceRange(item.reference);
                            const isNormal = this.isValueNormal(value, referenceRange, item.testName);
    
                            itemSpan.style.color = settings.highlightAbnormalLab && isNormal === false ? '#FF0000' : '#000000';
    
                            console.log('檢驗項目名稱:', item.testName);
                            let displayName = item.testName;
                            if (settings.enableLabAbbrev && enabled) {
                                console.log('開始處理縮寫:', {
                                    itemTestName: item.testName,
                                    abbreviations: Object.keys(abbreviations),
                                    enabled: enabled,
                                    settingEnabled: settings.enableLabAbbrev
                                });
                                const abbrev = abbreviations[item.testName];
                                console.log('縮寫處理結果:', {
                                    original: item.testName,
                                    foundAbbrev: abbrev,
                                    final: abbrev || item.testName
                                });
                                displayName = abbrev || item.testName;
                            }
    
                            let displayText = `${displayName} ${value}`;
                            if (settings.showLabUnit && unit) {
                                displayText += ` ${unit}`;
                            }
                            if (settings.showLabReference && item.reference) {
                                displayText += ` (${item.reference})`;
                            }
    
                            itemSpan.textContent = displayText;
                            horizontalDiv.appendChild(itemSpan);
                        });
    
                        itemsList.appendChild(horizontalDiv);
                    } else {
                        // 直式顯示
                        items.forEach(item => {
                            const itemDiv = document.createElement('div');
                            itemDiv.style.marginBottom = '8px';
    
                            const { value, unit } = this.separateValueAndUnit(item.result);
                            const referenceRange = this.parseReferenceRange(item.reference);
                            const isNormal = this.isValueNormal(value, referenceRange, item.testName);
    
                            let displayName = item.testName;
                            if (settings.enableLabAbbrev && enabled) {
                                displayName = abbreviations[item.testName] || item.testName;
                            }
    
                            let displayText = `${displayName}: ${value}`;
                            if (settings.showLabUnit && unit) {
                                displayText += ` ${unit}`;
                            }
                            if (settings.showLabReference && item.reference) {
                                displayText += ` (參考值: ${item.reference})`;
                            }
    
                            const textElement = document.createElement('div');
                            textElement.style.color = settings.highlightAbnormalLab && isNormal === false ? '#FF0000' : '#000000';
                            textElement.textContent = displayText;
    
                            itemDiv.appendChild(textElement);
                            itemsList.appendChild(itemDiv);
                        });
                    }
    
                    dateBlock.appendChild(dateHeader);
                    dateBlock.appendChild(itemsList);
                    contentDiv.appendChild(dateBlock);
                });
    
            // 刪除現有的顯示視窗（如果有的話）
            const existingDiv = document.getElementById('lab-results-list');
            if (existingDiv) {
                existingDiv.remove();
            }
    
            // 組裝並顯示視窗
            displayDiv.appendChild(headerDiv);
            displayDiv.appendChild(contentDiv);
            document.body.appendChild(displayDiv);
        });
    },

    // 檢查當前頁面是否為檢驗報告頁面
    isLabPage() {
        return window.location.href.includes('IMUE0060');
    },

    handleButtonClick() {
        console.log('檢驗報告按鈕被點擊');
        this.initialize().catch(error => {
            console.error('處理檢驗報告時發生錯誤:', error);
        });
    },
    checkInitialized() {
        return true;
    },

    // 修改 initialize 方法
    listenToPageChanges() {
        console.log('開始監聽檢驗報告頁面變化');
        
        // 清理舊的監聽器
        this.cleanup();
        
        // 監聽分頁按鈕
        const paginationContainer = document.querySelector('.dataTables_paginate');
        if (paginationContainer) {
            // 使用防抖動來減少重複初始化
            let debounceTimer;
            const handlePagination = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.initialize().catch(error => {
                        console.error('更新檢驗報告時發生錯誤:', error);
                    });
                }, 500);
            };
            
            paginationContainer.addEventListener('click', (event) => {
                if (event.target.closest('.paginate_button')) {
                    console.log('檢測到分頁按鈕點擊');
                    handlePagination();
                }
            });
        }

        // 監聽表格內容變化
        const tableBody = document.querySelector('table tbody');
        if (tableBody) {
            this.currentObserver = new MutationObserver((mutations) => {
                // 使用節流來減少日誌輸出
                console.debug('檢測到表格內容變化');
                this.initialize().catch(error => {
                    console.error('更新檢驗報告時發生錯誤:', error);
                });
            });

            this.currentObserver.observe(tableBody, {
                childList: true,
                subtree: true
            });
        }
    },
    
    // 修改 initialize 方法
    initialize() {
        console.debug('初始化檢驗報告處理功能'); // 改用 debug level
        return new Promise((resolve, reject) => {
            try {
                const table = this.inspectLabTables();
                if (table) {
                    const data = this.analyzeLabData(table);
                    if (data) {
                        this.displayLabResults(data);
                        this.listenToPageChanges();
                        resolve(true);
                    } else {
                        console.debug('無法分析資料，稍後重試');
                        setTimeout(() => this.initialize(), 1000);
                    }
                } else {
                    console.debug('無法找到表格，稍後重試');
                    setTimeout(() => this.initialize(), 1000);
                }
            } catch (error) {
                console.error('初始化時發生錯誤:', error);
                reject(error);
            }
        });
    }
};

const labValueProcessor = {
    specialTests: {
        'WBC': {
            transformValue: (value, referenceRange) => {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) return value;
                
                if (numValue < 100 && referenceRange && referenceRange.min >= 1000) {
                    return (numValue * 1000).toString();
                }
                return value;
            }
        },
        // 新增特殊檢驗項目的判斷
        'Cholesterol': {
            isNormal: (value) => {
                const numValue = parseFloat(value);
                return !isNaN(numValue) && numValue <= 200;
            }
        },
        'Triglyceride': {
            isNormal: (value) => {
                const numValue = parseFloat(value);
                return !isNaN(numValue) && numValue <= 150;
            }
        },
        'LDL-C': {
            isNormal: (value) => {
                const numValue = parseFloat(value);
                return !isNaN(numValue) && numValue <= 100;
            }
        }
    },

    processLabValue(testName, value, referenceRange) {
        const processor = this.specialTests[testName];
        if (processor && processor.transformValue) {
            return processor.transformValue(value, referenceRange);
        }
        return value;
    },

    isSpecialTest(testName) {
        return testName in this.specialTests;
    },

    // 新增特殊檢驗項目的正常值判斷
    checkSpecialNormal(testName, value) {
        const processor = this.specialTests[testName];
        if (processor && processor.isNormal) {
            return processor.isNormal(value);
        }
        return null;
    }
};
// 將完整的處理器掛載到 window 上
window.labProcessor = labProcessor;

// 觸發準備就緒事件
setTimeout(() => {
    console.log('檢驗報告處理器初始化完成');
    document.dispatchEvent(new Event('labProcessorReady'));
}, 0);
// 確保所有方法都被正確掛載後再觸發事件
document.dispatchEvent(new Event('labProcessorReady'));
