const labGroupingHandler = {
    // 檢查是否顯示分類按鈕
    async shouldShowGroupingButton() {
        const { enableLabGrouping } = await new Promise(resolve => {
            chrome.storage.sync.get({ enableLabGrouping: false }, resolve);
        });
    
        if (!enableLabGrouping) {
            console.log('檢驗分組顯示功能未啟用');
            return false;
        }

        // 檢查是否已經存在按鈕
        const existingButtons = document.querySelectorAll('button[data-role="lab-grouping"]');
        if (existingButtons.length > 0) {
            console.log('按鈕已存在，不需要再次創建');
            return false;
        }
    
        // 檢查是否有醫令代碼欄位
        const table = document.querySelector('table');
        if (!table) return false;
    
        const headers = Array.from(table.querySelectorAll('th'))
            .map(th => th.textContent.trim());
        if (!headers.includes('醫令代碼')) {
            console.log('未找到醫令代碼欄位');
            return false;
        }
    
        // 檢查頁數條件和自動翻頁狀態
        const currentPage = window.labProcessor?.state?.currentPage || 1;
        const targetPage = window.labProcessor?.state?.targetPage || 1;
        const maxPage = window.nextPagingHandler?.state?.maxPage || 1;
        const isProcessing = window.labProcessor?.state?.isProcessing || false;
        const hasAccumulatedData = window.labProcessor?.accumulatedData && 
                                 Object.keys(window.labProcessor.accumulatedData).length > 0;
        
        console.log('檢查分組按鈕顯示條件:', {
            currentPage,
            targetPage,
            maxPage,
            isProcessing,
            hasAccumulatedData,
            processorState: window.labProcessor?.state
        });

        // 以下情況顯示按鈕：
        // 1. 只有一頁資料時
        if (maxPage === 1) {
            console.log('單頁資料，顯示按鈕');
            return true;
        }

        // 2. 自動翻頁完成且有累積資料時
        if (!isProcessing && hasAccumulatedData && currentPage >= targetPage) {
            console.log('自動翻頁完成且有累積資料，顯示按鈕');
            return true;
        }

        console.log('不滿足顯示條件');
        return false;
    },

    async initializeConfig() {
        // 等待 labTableConfigManager 載入
        if (!window.labTableConfigManager) {
            console.log('等待 labTableConfigManager 初始化...');
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (window.labTableConfigManager) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                // 設置超時
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 5000);
            });
        }

        // 如果還是沒有 labTableConfigManager，使用默認配置
        if (!window.labTableConfigManager) {
            console.log('無法載入 labTableConfigManager，使用默認配置');
            window.labTableConfigManager = new LabTableConfigManager();
        }
    },

    // 整理檢驗資料
    async categorizeLabTests(labData) {
        // 確保配置已初始化
        await this.initializeConfig();
        
        try {
            const { config } = await window.labTableConfigManager.loadConfig();
            const groupedTests = new Map();
            
            // First, process all data and apply special items filtering
            for (const dateGroup of Object.values(labData)) {
                const filteredTests = await this.filterSpecialItems(dateGroup);
                
                for (const test of filteredTests) {
                    const key = `${test.testName}_${test.orderId}`;
                    
                    if (!groupedTests.has(key)) {
                        groupedTests.set(key, {
                            name: test.testName,
                            orderId: test.orderId,
                            dates: new Map()
                        });
                    }
        
                    const group = groupedTests.get(key);
                    if (!group.dates.has(test.date)) {
                        group.dates.set(test.date, {
                            result: test.result,
                            reference: test.reference
                        });
                    }
                }
            }
        
            // Convert to array for sorting
            let testsArray = Array.from(groupedTests.entries());
        
            // Sort based on priority codes
            if (config?.priorityCodes) {
                testsArray.sort((a, b) => {
                    const aIndex = config.priorityCodes.indexOf(a[1].orderId);
                    const bIndex = config.priorityCodes.indexOf(b[1].orderId);
                    
                    if (aIndex !== -1 && bIndex !== -1) {
                        return aIndex - bIndex;
                    } else if (aIndex !== -1) {
                        return -1;
                    } else if (bIndex !== -1) {
                        return 1;
                    }
                    
                    return 0;
                });
            }
        
            // Convert back to Map maintaining the new order
            return new Map(testsArray);
        } catch (error) {
            console.error('處理檢驗數據時發生錯誤:', error);
            // 發生錯誤時返回原始分組
            const groupedTests = new Map();
            for (const dateGroup of Object.values(labData)) {
                for (const test of dateGroup) {
                    const key = `${test.testName}_${test.orderId}`;
                    if (!groupedTests.has(key)) {
                        groupedTests.set(key, {
                            name: test.testName,
                            orderId: test.orderId,
                            dates: new Map()
                        });
                    }
                    const group = groupedTests.get(key);
                    if (!group.dates.has(test.date)) {
                        group.dates.set(test.date, {
                            result: test.result,
                            reference: test.reference
                        });
                    }
                }
            }
            return groupedTests;
        }
    },

    // 創建表格視窗
    async createGroupingWindow(labData) {
        // Get user settings
        const settings = await new Promise(resolve => {
            chrome.storage.sync.get({
                enableLabAbbrev: true,
                showLabUnit: false,
                highlightAbnormalLab: false,
                titleFontSize: '16',
                contentFontSize: '14'
            }, resolve);
        });

        // Load abbreviations if enabled
        let abbreviations = {};
        let abbrevEnabled = false;
        if (settings.enableLabAbbrev && window.labAbbreviationManager) {
            try {
                const abbrevResult = await window.labAbbreviationManager.loadAbbreviations();
                abbreviations = abbrevResult.abbreviations;
                abbrevEnabled = abbrevResult.enabled;
            } catch (error) {
                console.error('載入檢驗縮寫失敗:', error);
            }
        }

        const container = document.createElement('div');
        container.id = 'lab-grouping-window';
        container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 40%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.2);
            width: 100vh;
            height: 80vh;
            z-index: 10002;
            display: flex;
            flex-direction: column;
        `;

        // Header section remains the same...
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #d3efff;
            flex-shrink: 0;
        `;
        
        const title = document.createElement('h2');
        title.textContent = '檢驗結果表格整理';
        title.style.cssText = `
            margin: 0;
            color: #2196F3;
            font-size: ${settings.titleFontSize}px;
        `;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 22px;
            cursor: pointer;
            color: #666;
            padding: 0;
        `;
        closeButton.onclick = () => container.remove();

        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);

        // Content container
        const contentContainer = document.createElement('div');
        contentContainer.style.cssText = `
            flex-grow: 1;
            overflow: auto;
        `;

        // Process and group data
        const groupedTests = await this.categorizeLabTests(labData);
        if (groupedTests.size === 0) {
            const noDataMsg = document.createElement('div');
            noDataMsg.textContent = '沒有找到檢驗數據';
            noDataMsg.style.textAlign = 'center';
            noDataMsg.style.color = '#666';
            contentContainer.appendChild(noDataMsg);
            container.appendChild(contentContainer);
            return container;
        }

        // Create table
        const table = document.createElement('table');
        table.style.cssText = `
            border-collapse: collapse;
            width: max-content;
            min-width: 100%;
            background-color: white;
            table-layout: fixed;
        `;

        // Get all dates
        const allDates = new Set();
        groupedTests.forEach(test => {
            test.dates.forEach((_, date) => allDates.add(date));
        });
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(b) - new Date(a));

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // Test name column header
        const nameHeader = document.createElement('th');
        nameHeader.textContent = '檢驗項目';
        nameHeader.style.cssText = `
            position: sticky;
            left: 0;
            z-index: 2;
            background-color: #f5f5f5;
            padding: 12px;
            text-align: left;
            border: 1px solid #e0e0e0;
            width: 200px;
            top: 0;
        `;
        headerRow.appendChild(nameHeader);

        // Date column headers
        sortedDates.forEach(date => {
            const dateHeader = document.createElement('th');
            dateHeader.textContent = date;
            dateHeader.style.cssText = `
                padding: 12px;
                text-align: center;
                border: 1px solid #e0e0e0;
                min-width: 50px;
                background-color: #f5f5f5;
                position: sticky;
                top: 0;
            `;
            headerRow.appendChild(dateHeader);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table content with user settings applied
        const tbody = document.createElement('tbody');
        groupedTests.forEach((test) => {
            const row = document.createElement('tr');

            // Test name cell with abbreviation if enabled
            const nameCell = document.createElement('td');
            let displayName = test.name;
            if (settings.enableLabAbbrev && abbrevEnabled) {
                displayName = abbreviations[test.name] || test.name;
            }
            nameCell.textContent = displayName;
            nameCell.style.cssText = `
                position: sticky;
                left: 0;
                background-color: white;
                padding: 12px;
                border: 1px solid #e0e0e0;
                width: 100px;
                word-wrap: break-word;
                word-break: break-all;
                font-size: ${settings.contentFontSize}px;
            `;
            row.appendChild(nameCell);

            // Date cells with value formatting and highlighting
            sortedDates.forEach(date => {
                const cell = document.createElement('td');
                const testData = test.dates.get(date);
                
                if (testData) {
                    // Split value and unit if available
                    const { value, unit } = window.labProcessor.separateValueAndUnit(testData.result);
                    
                    // Get reference range and check if value is normal
                    const referenceRange = window.labProcessor.parseReferenceRange(testData.reference);
                    const valueStatus = window.labProcessor.isValueNormal(value, referenceRange, test.name);

                    // Apply cell formatting
                    let displayText = value;
                    if (settings.showLabUnit && unit) {
                        displayText += ` ${unit}`;
                    }
                    
                    cell.textContent = displayText;
                    cell.title = testData.reference ? `參考值: ${testData.reference}` : '';

                    // Apply color highlighting if enabled
                    if (settings.highlightAbnormalLab) {
                        switch (valueStatus.status) {
                            case 'low':
                                cell.style.cssText += `
                                    color: #008000;
                                    font-weight: bold;
                                `; // Green + Bold
                                break;
                            case 'high':
                                cell.style.cssText += `
                                    color: #FF0000;
                                    font-weight: bold;
                                `; // Red + Bold
                                break;
                            default:
                                cell.style.fontWeight = 'normal';
                        }
                    }
                }

                cell.style.cssText += `
                    padding: 12px;
                    border: 1px solid #e0e0e0;
                    text-align: center;
                    background-color: white;
                    font-size: ${settings.contentFontSize}px;
                `;
                row.appendChild(cell);
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);

        // Table wrapper
        const tableWrapper = document.createElement('div');
        tableWrapper.style.cssText = `
            overflow: auto;
            width: 100%;
            height: 100%;
        `;
        
        tableWrapper.appendChild(table);
        contentContainer.appendChild(tableWrapper);
        container.appendChild(contentContainer);

        return container;
    },

    async handleGroupingDisplay(labData) {
        try {
            // 確保使用累積的資料
            let processedData;
            if (window.labProcessor?.accumulatedData && 
                Object.keys(window.labProcessor.accumulatedData).length > 0) {
                console.log('使用累積的資料進行顯示');
                processedData = window.labProcessor.accumulatedData;
            } else {
                console.log('使用當前頁面資料進行顯示');
                processedData = labData;
            }
        
            // 等待視窗創建完成
            const groupingWindow = await this.createGroupingWindow(processedData);
            if (!groupingWindow) {
                console.error('創建分組視窗失敗');
                return;
            }
    
            // 移除現有的視窗（如果存在）
            const existingWindow = document.getElementById('lab-grouping-window');
            if (existingWindow) {
                existingWindow.remove();
            }
        
            // 添加新視窗
            document.body.appendChild(groupingWindow);
        } catch (error) {
            console.error('顯示分組視窗時發生錯誤:', error);
        }
    },

    createGroupingButton() {
        // 先檢查是否已存在按鈕
        const existingButton = document.querySelector('button[data-role="lab-grouping"]');
        if (existingButton) {
            console.log('按鈕已存在，返回 null');
            return null;
        }
    
        const button = document.createElement('button');
        button.textContent = '表格顯示';
        button.setAttribute('data-role', 'lab-grouping');
        button.style.cssText = `
            background-color: #f28500;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
        `;
        
        button.onclick = async () => {
            try {
                // 禁用按鈕防止重複點擊
                button.disabled = true;
                
                if (window.labProcessor?.accumulatedData && 
                    Object.keys(window.labProcessor.accumulatedData).length > 0) {
                    await this.handleGroupingDisplay(window.labProcessor.accumulatedData);
                } else if (window.labProcessor?.currentData) {
                    await this.handleGroupingDisplay(window.labProcessor.currentData);
                }
            } catch (error) {
                console.error('處理表格顯示時發生錯誤:', error);
            } finally {
                // 重新啟用按鈕
                button.disabled = false;
            }
        };
        
        return button;
    },

    async filterSpecialItems(tests) {
        try {
            const { config } = await window.labTableConfigManager.loadConfig();
            
            return tests.filter(test => {
                // 加入 08013C 到特殊項目清單
                if (test.orderId === '06012C' || test.orderId === '08011C' || test.orderId === '08013C') {
                    const itemConfig = config?.specialItems?.[test.orderId];
                    
                    if (!itemConfig) return true;
                    
                    switch (itemConfig.displayMode) {
                        case 'all':
                            return true;
                        case 'none':
                            return false;
                        case 'partial':
                            return itemConfig.partialItems.some(item => 
                                test.testName.toLowerCase().includes(item.toLowerCase())
                            );
                        default:
                            return true;
                    }
                }
                return true;
            });
        } catch (error) {
            console.error('過濾特殊項目時發生錯誤:', error);
            return tests;
        }
    }
};

// 初始化時就觸發初始化檢查
labGroupingHandler.initializeConfig().catch(error => {
    console.error('初始化配置時發生錯誤:', error);
});
// 將處理器掛載到 window 上
window.labGroupingHandler = labGroupingHandler;
