console.log('載入檢驗報告處理模組');

// 觸發準備就緒事件
document.dispatchEvent(new Event('labProcessorReady'));

const labProcessor = {
    // 存儲當前的 observer 和資料
    currentObserver: null,
    currentData: null,
    
    // 添加累積資料的屬性
    accumulatedData: {},

    // 添加處理狀態
    state: {
        isProcessing: false,
        currentPage: 1,
        targetPage: 1
    },

    // 合併資料方法
    mergeData(newData) {
        if (!newData) return;
        
        // 合併檢驗資料
        Object.entries(newData).forEach(([date, items]) => {
            if (!this.accumulatedData[date]) {
                this.accumulatedData[date] = [];  // 直接使用陣列儲存
            }
            
            // 合併相同日期的檢驗清單
            this.accumulatedData[date] = [
                ...this.accumulatedData[date],
                ...items  // 直接合併陣列
            ];
        });
    },

     // New function to validate required columns
     validateRequiredColumns() {
        const table = document.querySelector('table');
        if (!table) {
            return {
                isValid: false,
                message: '找不到資料表格'
            };
        }

        const headers = Array.from(table.querySelectorAll('th'))
            .map(th => th.textContent.trim());

        if (!headers.includes('醫令代碼')) {
            return {
                isValid: false,
                message: '請先開啟「醫令代碼」欄位(右上角點選"更多"->"表格欄位設定")後再執行連續讀取功能'
            };
        }

        return {
            isValid: true,
            message: ''
        };
    },

    // 創建表格顯示按鈕
    async createGroupingButton() {
        if (!window.labGroupingHandler) {
            console.error('labGroupingHandler 未載入');
            return null;
        }

        const shouldShow = await window.labGroupingHandler.shouldShowGroupingButton();
        if (!shouldShow) {
            return null;
        }

        const button = document.createElement('button');
        button.textContent = '表格';
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
        
        button.onclick = () => {
            if (this.currentData) {
                window.labGroupingHandler.handleGroupingDisplay(this.currentData);
            }
        };

        return button;
    },

    // 開始自動翻頁處理
    async startAutoPaging() {
        if (this.state.isProcessing) return;
        
        // Add validation check before starting
        const validation = this.validateRequiredColumns();
        if (!validation.isValid) {
            // Create and show alert message
            const alertDiv = document.createElement('div');
            alertDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: #fff3cd;
                color: #856404;
                border: 1px solid #ffeeba;
                padding: 15px 40px;
                border-radius: 4px;
                z-index: 10001;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            `;
            alertDiv.textContent = validation.message;
            
            document.body.appendChild(alertDiv);
            
            // Remove alert after 3 seconds
            setTimeout(() => {
                alertDiv.remove();
            }, 3000);
            
            return;
        }
        
        try {
            this.state.isProcessing = true;
            this.accumulatedData = {};
            
            // 取得設定的最大頁數
            const { maxPageCount } = await new Promise(resolve => {
                chrome.storage.sync.get({ maxPageCount: '5' }, resolve);
            });
            
            // 初始化起始頁數據
            const table = this.inspectLabTables();
            if (table) {
                const initialData = this.analyzeLabData(table);
                this.mergeData(initialData);
            }
            
            // 計算目標頁數
            const maxPage = window.nextPagingHandler.state.maxPage;
            this.state.currentPage = window.nextPagingHandler.getCurrentPageNumber();
            this.state.targetPage = Math.min(parseInt(maxPageCount), maxPage);
            
            console.log('自動翻頁初始狀態:', {
                currentPage: this.state.currentPage,
                targetPage: this.state.targetPage,
                maxPage: maxPage
            });
            
            // 顯示處理中狀態
            this.showProcessingStatus();
            
            // 開始連續讀取
            while (this.state.currentPage < this.state.targetPage) {
                await this.processNextPage();
            }
            
            // 完成後設置處理完成狀態
            this.state.isProcessing = false;
            this.hideProcessingStatus();
            
            console.log('自動翻頁完成狀態:', {
                currentPage: this.state.currentPage,
                targetPage: this.state.targetPage,
                hasAccumulatedData: Object.keys(this.accumulatedData).length > 0
            });
    
            // 只在完成所有頁面後顯示累積資料
            await this.displayLabResults(this.accumulatedData);
            
        } catch (error) {
            console.error('自動翻頁過程發生錯誤:', error);
            this.state.isProcessing = false;
            this.hideProcessingStatus();
        }
    },

    // 處理下一頁
    async processNextPage() {
        try {
            console.log('處理下一頁...');
            await window.nextPagingHandler.handlePageChange(true);
            
            // 等待新数据加载
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 获取并合并数据
            const table = this.inspectLabTables();
            if (table) {
                const newData = this.analyzeLabData(table);
                if (newData) {
                    this.mergeData(newData);
                    // 只記錄處理狀態，不顯示視窗
                    console.log('頁面處理狀態:', {
                        currentPage: this.state.currentPage + 1,
                        targetPage: this.state.targetPage,
                        totalProcessed: Object.keys(this.accumulatedData).length
                    });
                } else {
                    console.error('無法分析新頁面的數據');
                }
            } else {
                console.error('無法找到數據表格');
            }
            
            this.state.currentPage++;
            this.updateProcessingStatus();
        } catch (error) {
            console.error('處理下一頁時發生錯誤:', error);
            throw error;
        }
    },

    // 顯示處理中狀態
    showProcessingStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'lab-auto-paging-status';
        statusDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #fff3cd;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            z-index: 10001;
            font-size: 14px;
        `;
        this.updateStatusText(statusDiv);
        document.body.appendChild(statusDiv);
    },

    // 更新處理狀態
    updateProcessingStatus() {
        const statusDiv = document.getElementById('lab-auto-paging-status');
        if (statusDiv) {
            this.updateStatusText(statusDiv);
        }
    },

    // 更新狀態文字
    updateStatusText(statusDiv) {
        statusDiv.textContent = `正在處理中... (${this.state.currentPage}/${this.state.targetPage})`;
    },

    // 隱藏處理中狀態
    hideProcessingStatus() {
        const statusDiv = document.getElementById('lab-auto-paging-status');
        if (statusDiv) {
            statusDiv.remove();
        }
    },

    // 添加檢查功能
    async shouldShowButton() {
        // 檢查設定
        const { enableAutoPaging } = await new Promise(resolve => {
            chrome.storage.sync.get({ enableAutoPaging: false }, resolve);
        });
        
        console.log('自動翻頁設定狀態:', enableAutoPaging);
    
        if (!enableAutoPaging) {
            console.log('自動翻頁功能未啟用，不顯示按鈕');
            return false;
        }
    
        // 確保 nextPagingHandler 存在且有更新頁面資訊
        if (!window.nextPagingHandler) {
            console.log('nextPagingHandler 未載入');
            return false;
        }
    
        const updateResult = window.nextPagingHandler.updatePaginationInfo();
        console.log('更新分頁資訊結果:', updateResult);
        
        if (!updateResult) {
            console.log('無法取得分頁資訊');
            return false;
        }
    
        const currentPage = window.nextPagingHandler.getCurrentPageNumber();
        const maxPage = window.nextPagingHandler.state.maxPage;
    
        // 只在第1頁且有多頁時顯示按鈕
        const shouldShow = currentPage === 1 && maxPage > 1;
        console.log('是否應該顯示按鈕:', shouldShow, '(當前頁面:', currentPage, ', 總頁數:', maxPage, ')');
        
        return shouldShow;
    },

    // 創建自動讀取按鈕
    async createAutoPagingButton() {
        // 從 storage 中獲取 maxPageCount 設定
        const { maxPageCount } = await new Promise(resolve => {
            chrome.storage.sync.get({ maxPageCount: '5' }, resolve);
        });
        
        // 獲取實際的最大頁數
        const maxPage = window.nextPagingHandler?.state?.maxPage || 1;
        
        // 使用較小的數字
        const displayPages = Math.min(parseInt(maxPageCount), maxPage);
        
        const button = document.createElement('button');
        button.textContent = `連續讀${displayPages}頁`;
        button.classList.add('lab-auto-paging-button');
        button.style.cssText = `
            background-color: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
        `;
        
        button.onclick = () => this.startAutoPaging();
        return button;
    },

    // 檢查並添加按鈕
    async checkAndAddButton(titleElement) {
        console.log('開始檢查是否應顯示自動讀取按鈕');
        const shouldShow = await this.shouldShowButton();
        console.log('shouldShowButton 結果:', shouldShow);
        
        // 確保 titleElement 和其父元素存在
        if (!titleElement || !titleElement.parentElement) {
            console.error('標題元素或其父元素不存在');
            return;
        }
        
        // 移除舊按鈕（如果存在）
        const existingButton = titleElement.parentElement.querySelector('.lab-auto-paging-button');
        if (existingButton) {
            console.log('移除已存在的按鈕');
            existingButton.remove();
        }

        // 如果應該顯示按鈕，則創建新按鈕
        if (shouldShow) {
            console.log('創建新的自動讀取按鈕');
            try {
                const button = await this.createAutoPagingButton();
                if (button) {
                    titleElement.parentElement.appendChild(button);
                    console.log('成功添加自動讀取按鈕');
                }
            } catch (error) {
                console.error('創建或添加按鈕時發生錯誤:', error);
            }
        }
    },

    // 添加節流函數
    throttle(func, limit) {
        let waiting = false;
        return function() {
            if (!waiting) {
                func.apply(this);
                waiting = true;
                setTimeout(function() {
                    waiting = false;
                }, limit);
            }
        }
    },

    // 修改後的清理函數
    cleanup() {
        console.log('執行檢驗報告清理作業');
        
        // 移除現有的觀察器
        if (this.currentObserver) {
            this.currentObserver.disconnect();
            this.currentObserver = null;
            console.log('已清理觀察器');
        }

        // 移除現有的顯示視窗
        const existingDiv = document.getElementById('lab-results-list');
        if (existingDiv) {
            existingDiv.remove();
            console.log('已移除現有顯示視窗');
        }
        const existingTable = document.getElementById('lab-grouping-window');
        if (existingTable) {
            existingTable.remove();
            console.log('已移除現有表格視窗');
        }
        // 清理暫存的資料
        this.currentData = null;

        // 清理累積的資料
        this.accumulatedData = {};
        console.log('已清理累積的檢驗資料');

        // 重置處理狀態
        this.state = {
            isProcessing: false,
            currentPage: 1,
            targetPage: 1
        };
        console.log('已重置檢驗處理狀態');
    },
    
    // 檢查所有表格
    inspectLabTables() {
        console.log('開始檢查檢驗報告表格');
        const allTables = document.getElementsByTagName('table');
        console.log(`找到 ${allTables.length} 個表格`);

        // 尋找包含完整內容的表格
        const targetTable = Array.from(allTables).find(table => {
            // 先檢查是否有資料列
            const hasRows = table.querySelector('tbody tr td') !== null;
            if (!hasRows) return false;

            // 檢查表頭
            const headers = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent.trim().toLowerCase());
            
            // 放寬檢查條件
            return headers.some(header => 
                header.includes('檢驗') || 
                header.includes('醫令') || 
                header.includes('結果')
            );
        });

        if (targetTable) {
            // console.log('找到包含資料的檢驗報告表格');
            return targetTable;
        }
        
        // console.log('未找到完整的目標表格');
        return null;
    },

    // 修改分析檢驗數據的函數
    analyzeLabData(table) {
        console.log('開始分析檢驗報告數據');

        if (!table) {
            console.error('無法分析：未提供表格');
            return null;
        }

        // 取得表頭
        const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
        // console.log('表頭:', headers);

        // 動態建立欄位映射，新增醫令代碼欄位
        const columnMap = {
            檢驗日期: headers.indexOf('檢驗日期'),
            醫令名稱: headers.indexOf('醫令名稱'),
            醫令代碼: headers.indexOf('醫令代碼'), // 新增醫令代碼欄位
            檢驗項目: headers.indexOf('檢驗項目'),
            檢驗結果: headers.indexOf('檢驗結果'),
            單位: headers.indexOf('單位'),
            參考值: headers.indexOf('參考值'),
            來源: headers.indexOf('來源')
        };

        // 取得所有資料列
        const rows = table.querySelectorAll('tbody tr');
        // console.log('資料列數:', rows.length);

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
            
            // 處理特殊值
            if (testName) {
                result = labValueProcessor.processLabValue(testName, result, referenceRange);
            }

            return {
                date: cells[columnMap.檢驗日期]?.textContent.trim(),
                testName: testName,
                orderId: cells[columnMap.醫令代碼]?.textContent.trim() || '',
                result: result,
                reference: reference,
                source: cells[columnMap.來源]?.textContent.trim()
            };
        }).filter(Boolean);

        // console.log('已收集的檢驗資料:', labData);

        // 依照日期分組
        const groupedByDate = this.groupLabDataByDate(labData);
        console.log('分析後的資料結構:', groupedByDate);
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
            }, 300);
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

        // 新增處理 [0][0] 或 [0.000][0.000] 的情況
        if (cleanStr.match(/\[0*\.?0*\]\[0*\.?0*\]/)) {
            return null;  // 返回 null 表示不需要進行異常值判斷
        }

        return null;  // 無法解析的格式
    },

    // 修改 isValueNormal 函數為 checkValueStatus
    isValueNormal(value, referenceRange, testName) {
        if (!value) return { status: 'normal' };

        // 優先處理特殊檢驗項目
        const specialResult = labValueProcessor.checkSpecialNormal(testName, value);
        if (specialResult !== null) {
            return { 
                status: specialResult ? 'normal' : 'high'  // 特殊項目只區分正常和偏高
            };
        }

        // 處理定性檢驗結果
        if (typeof value === 'string' && 
            (value.toLowerCase().includes('negative') || 
            value.toLowerCase().includes('normal') || 
            value.toLowerCase().includes('not found'))) {
            return { status: 'normal' };
        }

        if (!referenceRange) return { status: 'normal' };

        const numValue = parseFloat(value);
        if (isNaN(numValue)) return { status: 'normal' };

        // 判斷值的狀態
        if (referenceRange.max === null) {
            // 只有下限值的情況
            return {
                status: numValue < referenceRange.min ? 'low' : 'normal'
            };
        } else {
            // 有上下限的情況
            if (numValue < referenceRange.min) {
                return { status: 'low' };
            } else if (numValue > referenceRange.max) {
                return { status: 'high' };
            } else {
                return { status: 'normal' };
            }
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
        if (!groupedData) {
            console.error('沒有資料可以顯示');
            return;
        }
    
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
            // 1. 創建主容器
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
    
            // 2. 創建標題區塊
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
    
            // 3. 創建左側區域
            const leftSection = document.createElement('div');
            leftSection.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
            `;
    
            // 4. 創建標題
            const titleH3 = document.createElement('h3');
            titleH3.textContent = '檢驗結果';
            titleH3.style.cssText = `
                margin: 0;
                font-size: ${settings.titleFontSize}px;
                padding: 0;
                font-weight: bold;
            `;
            leftSection.appendChild(titleH3);
    
            // 5. 創建中間控制區
            const middleControls = document.createElement('div');
            middleControls.style.cssText = `
                display: flex;
                align-items: center;
                margin-left: 15px;
            `;
            
            // 在 middleControls 創建後立即檢查是否需要添加自動翻頁按鈕
            const isAutoPaging = window.autoPagingHandler && 
                    window.autoPagingHandler.state.isProcessing;

            if (!isAutoPaging) {
                // 檢查是否應該顯示自動翻頁按鈕
                const shouldShowAutoPaging = await this.shouldShowButton();
                if (shouldShowAutoPaging) {
                    const autoPagingButton = await this.createAutoPagingButton();
                    if (autoPagingButton) {
                        if (middleControls.firstChild) {
                            middleControls.insertBefore(autoPagingButton, middleControls.firstChild);
                        } else {
                            middleControls.appendChild(autoPagingButton);
                        }
                    }
                }
            }

            // 6. 添加表格顯示按鈕
            const groupingButton = await this.createGroupingButton();
            if (groupingButton) {
                middleControls.appendChild(groupingButton);
            }
    
            // 7. 處理自動翻頁相關
            const isAccumulatedData = window.autoPagingHandler && 
                                   window.autoPagingHandler.accumulatedData &&
                                   Object.keys(window.autoPagingHandler.accumulatedData).length > 0;
    
            // if (isAccumulatedData) {
            //     const newGroupingButton = await this.createGroupingButton();
            //     if (newGroupingButton && !middleControls.querySelector('button')) {
            //         middleControls.appendChild(newGroupingButton);
            //     }
            // }
    
            leftSection.appendChild(middleControls);
    
            // 8. 創建右側控制區
            const rightControls = document.createElement('div');
            rightControls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 15px;
            `;
    
            // 9. 添加翻頁控制
            if (window.nextPagingHandler) {
                const pagingControls = window.nextPagingHandler.createPagingControls();
                rightControls.appendChild(pagingControls);
            }
    
            // 10. 添加關閉按鈕
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
            rightControls.appendChild(closeButton);
    
            // 11. 組裝標題區域
            headerDiv.appendChild(leftSection);
            headerDiv.appendChild(rightControls);
    
            // 12. 創建內容區域
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = `
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 5px;
            `;
    
            // 13. 載入縮寫設定
            let abbreviations = {};
            let enabled = false;
    
            if (settings.enableLabAbbrev && window.labAbbreviationManager) {
                try {
                    const abbrevResult = await window.labAbbreviationManager.loadAbbreviations();
                    abbreviations = abbrevResult.abbreviations;
                    enabled = abbrevResult.enabled;
                } catch (error) {
                    console.error('載入檢驗縮寫失敗:', error);
                }
            }
    
            // 14. 最終組裝
            displayDiv.appendChild(headerDiv);
            displayDiv.appendChild(contentDiv);
    
            // 15. 移除現有視窗
            // const existingDiv = document.getElementById('lab-results-list');
            // if (existingDiv) {
            //     existingDiv.remove();
            // }
    
            // 16. 添加到頁面
            document.body.appendChild(displayDiv);

            // 處理並顯示檢驗數據
            Object.entries(groupedData)
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .forEach(([date, items]) => {
                    if (!Array.isArray(items)) {
                        console.error('日期', date, '的資料不是陣列:', items);
                        return;
                    }
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
                            const valueStatus = this.isValueNormal(value, referenceRange, item.testName);
                        
                            // 根據狀態設置顏色
                            if (settings.highlightAbnormalLab) {
                                switch (valueStatus.status) {
                                    case 'low':
                                        itemSpan.style.color = '#008000'; // 綠色
                                        break;
                                    case 'high':
                                        itemSpan.style.color = '#FF0000'; // 紅色
                                        break;
                                    default:
                                        itemSpan.style.color = '#000000'; // 正常值為黑色
                                }
                            }

                            // console.log('檢驗項目名稱:', item.testName);
                            let displayName = item.testName;
                            if (settings.enableLabAbbrev && enabled) {
                                // console.log('開始處理縮寫:', {
                                //     itemTestName: item.testName,
                                //     abbreviations: Object.keys(abbreviations),
                                //     enabled: enabled,
                                //     settingEnabled: settings.enableLabAbbrev
                                // });
                                const abbrev = abbreviations[item.testName];
                                // console.log('縮寫處理結果:', {
                                //     original: item.testName,
                                //     foundAbbrev: abbrev,
                                //     final: abbrev || item.testName
                                // });
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
                            if (settings.highlightAbnormalLab) {
                                switch (isNormal.status) {
                                    case 'low':
                                        textElement.style.color = '#008000';  // 綠色
                                        textElement.style.fontWeight = 'bold';
                                        break;
                                    case 'high':
                                        textElement.style.color = '#FF0000';  // 紅色
                                        textElement.style.fontWeight = 'bold';
                                        break;
                                    default:
                                        textElement.style.color = '#000000';  // 正常值為黑色
                                        textElement.style.fontWeight = 'normal';
                                }
                            }
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
        
        // 先清理現有的觀察器
        if (this.currentObserver) {
            this.currentObserver.disconnect();
            this.currentObserver = null;
        }
    
        const tableBody = document.querySelector('table tbody');
        if (tableBody) {
            // 使用節流的初始化函數
            const throttledInit = this.throttle(() => {
                // 如果正在執行自動翻頁，不觸發顯示更新
                if (this.state.isProcessing) {
                    console.log('自動翻頁中，跳過表格內容更新');
                    return;
                }
    
                // 只在資料表格內容變化時更新顯示視窗
                const table = this.inspectLabTables();
                if (table) {
                    const newData = this.analyzeLabData(table);
                    if (newData && JSON.stringify(newData) !== JSON.stringify(this.currentData)) {
                        console.log('表格內容有變化，更新顯示');
                        this.currentData = newData;
                        this.displayLabResults(newData);
                    }
                }
            }, 300);
    
            // 建立新的觀察器
            this.currentObserver = new MutationObserver(() => {
                throttledInit();
            });
    
            // 開始觀察
            this.currentObserver.observe(tableBody, {
                childList: true,
                subtree: true
            });
        }
    },
    
    // 修改 initialize 方法
    async initialize() {
        console.log('開始初始化檢驗報告處理功能');
        
        const isAutoPaging = this.state.isProcessing;
        console.log('檢查是否為自動翻頁處理:', {
            isProcessing: this.state.isProcessing,
            currentPage: this.state.currentPage,
            targetPage: this.state.targetPage
        });
        
        if (!isAutoPaging) {
            console.log('非自動翻頁處理，執行清理');
            this.cleanup();
        } else {
            console.log('自動翻頁處理中，保留資料');
        }
        
        try {
            const table = this.inspectLabTables();
            if (table) {
                const data = this.analyzeLabData(table);
                if (data && Object.keys(data).length > 0) {
                    if (isAutoPaging) {
                        console.log('自動翻頁中，合併新資料');
                        this.mergeData(data);
                    } else {
                        console.log('非自動翻頁，設置新資料');
                        this.currentData = data;
                        await this.displayLabResults(data);
                    }
                    
                    // 只在非自動翻頁時設置頁面監聽
                    if (!isAutoPaging) {
                        this.listenToPageChanges();
                    }
                    
                    if (!isAutoPaging) {
                        console.log('正在檢查是否需要添加自動讀取按鈕');
                        const titleElement = document.querySelector('#lab-results-list h3');
                        if (titleElement) {
                            await this.checkAndAddButton(titleElement);
                        } else {
                            console.log('找不到標題元素，無法添加自動讀取按鈕');
                        }
                    } else {
                        console.log('自動翻頁處理中，跳過按鈕添加');
                    }
                    
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('初始化過程發生錯誤:', error);
            return false;
        }
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

// 觸發準備就緒事件
setTimeout(() => {
    console.log('檢驗報告處理器初始化完成');
    document.dispatchEvent(new Event('labProcessorReady'));
}, 0);

// 將處理器掛載到 window 上
window.labProcessor = labProcessor;

// 觸發準備就緒事件
document.dispatchEvent(new Event('labProcessorReady'));
