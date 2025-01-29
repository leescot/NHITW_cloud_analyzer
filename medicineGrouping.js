const medicineGroupingHandler = {
    // 檢查是否應該顯示分類按鈕
    async shouldShowGroupingButton() {
        const { enableMedicineGrouping } = await new Promise(resolve => {
            chrome.storage.sync.get({ enableMedicineGrouping: false }, resolve);
        });

        if (!enableMedicineGrouping) {
            console.log('藥物分類顯示功能未啟用');
            return false;
        }

        const table = document.querySelector('table');
        if (!table) return false;

        // 檢查頁數條件
        const maxPage = window.nextPagingHandler.state.maxPage;
        // 只有在自動翻頁完成時才顯示按鈕
        const isAutoPageCompleted = window.autoPagingHandler && 
                                  window.autoPagingHandler.accumulatedData &&
                                  Object.keys(window.autoPagingHandler.accumulatedData).length > 0 &&
                                  !window.autoPagingHandler.state.isProcessing;

        // 如果只有一頁，直接顯示按鈕
        if (maxPage === 1) {
            return true;
        }
        
        // 如果有多頁，只在自動翻頁完成後顯示
        if (maxPage > 1) {
            return isAutoPageCompleted;
        }

        return false;
    },

    // 對藥品進行整理
    categorizeMedicines(medicines) {
        const medicineMap = new Map();
        
        medicines.forEach(medicine => {
            if (!medicine || !medicine.name) return;
    
            if (!medicineMap.has(medicine.name)) {
                medicineMap.set(medicine.name, []);
            }
            
            const record = {
                date: medicine.date || '',
                days: medicine.days || '0',
                dosage: medicine.dosage || '',
                usage: medicine.usage || '',
                atc5Code: medicine.atc5Code || '' // Add ATC5 code
            };
    
            if (record.days && record.dosage) {
                medicineMap.get(medicine.name).push(record);
            }
        });
    
        return medicineMap;
    },

    createFilterSelect() {
        const filterContainer = document.createElement('div');
        filterContainer.style.cssText = `
            display: flex;
            align-items: center;
            margin-right: 15px;
        `;

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid #d3efff;
            background-color: white;
            font-size: 14px;
            color: #2196F3;
            cursor: pointer;
        `;

        const options = [
            { value: '0', text: '顯示全部' },
            { value: '3', text: '顯示 >=3天' },
            { value: '7', text: '顯示 >=7天' },
            { value: '14', text: '顯示 >=14天' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (opt.value === '7') option.selected = true; // 預設選擇 >=7天
            select.appendChild(option);
        });

        filterContainer.appendChild(select);
        return { filterContainer, select };
    },

    createGroupingWindow(medicineMap) {
        return new Promise(async (resolve) => {
            // 先取得使用者設定的 windowWidth
            const { windowWidth } = await new Promise(resolve => {
                chrome.storage.sync.get({ windowWidth: '500' }, resolve);
            });
        
            // 計算表格視窗的位置和大小
            const mainWindowWidth = parseInt(windowWidth);
            const browserWidth = window.innerWidth;
            const availableWidth = browserWidth - mainWindowWidth;
            const tableWindowWidth = Math.floor(availableWidth * 0.95);
            const leftPosition = Math.floor((availableWidth - tableWindowWidth) / 2);
        
            // 創建主容器
            const container = document.createElement('div');
            container.id = 'medicine-grouping-window';
            container.style.cssText = `
                position: fixed;
                top: 50%;
                left: ${leftPosition}px;
                transform: translateY(-50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 15px rgba(0,0,0,0.2);
                width: ${tableWindowWidth}px;
                height: 80vh;
                z-index: 10002;
                display: flex;
                flex-direction: column;
            `;
        
            // 視窗大小調整事件監聽
            window.addEventListener('resize', () => {
                const newAvailableWidth = window.innerWidth - mainWindowWidth - 60;
                const newTableWindowWidth = Math.floor(newAvailableWidth * 0.85);
                const newLeftPosition = Math.floor((newAvailableWidth - newTableWindowWidth) / 2);
                container.style.width = `${newTableWindowWidth}px`;
                container.style.left = `${newLeftPosition}px`;
            });
        
            // 創建標題欄
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
            
            // 創建左側區域（標題和過濾器）
            const leftSection = document.createElement('div');
            leftSection.style.cssText = `
                display: flex;
                align-items: center;
                gap: 15px;
            `;
    
            // 創建標題
            const title = document.createElement('h2');
            title.textContent = '處方藥物表格整理';
            title.style.cssText = `
                margin: 0;
                color: #2196F3;
                font-size: 20px;
            `;
    
            // 創建過濾選擇器
            const filterContainer = document.createElement('div');
            filterContainer.style.cssText = `
                display: flex;
                align-items: center;
            `;
    
            const select = document.createElement('select');
            select.style.cssText = `
                padding: 4px 8px;
                border-radius: 4px;
                border: 1px solid #d3efff;
                background-color: white;
                font-size: 14px;
                color: #2196F3;
                cursor: pointer;
            `;
    
            const options = [
                { value: '0', text: '顯示全部' },
                { value: '3', text: '顯示 >=3天' },
                { value: '7', text: '顯示 >=7天' },
                { value: '14', text: '顯示 >=14天' }
            ];
    
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.text;
                if (opt.value === '7') option.selected = true;
                select.appendChild(option);
            });
    
            // 創建關閉按鈕
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
    
            // 組裝標題欄
            filterContainer.appendChild(select);
            leftSection.appendChild(title);
            leftSection.appendChild(filterContainer);
            header.appendChild(leftSection);
            header.appendChild(closeButton);
            container.appendChild(header);
    
            // 創建內容容器
            const contentContainer = document.createElement('div');
            contentContainer.style.cssText = `
                flex-grow: 1;
                overflow: auto;
            `;
            container.appendChild(contentContainer);
    
            // 更新表格的函數
            const updateTable = (minDays) => {
                const validMedicines = new Map();
                const allDates = new Set();
    
                medicineMap.forEach((records, medicineName) => {
                    const hasValidPrescription = records.some(record => parseInt(record.days) >= minDays);
                    if (minDays === 0 || hasValidPrescription) {
                        validMedicines.set(medicineName, records);
                        records.forEach(record => {
                            if (minDays === 0 || parseInt(record.days) >= minDays) {
                                allDates.add(record.date);
                            }
                        });
                    }
                });
    
                // 更新標題
                if (minDays > 0) {
                    title.textContent = `處方藥物(≧${minDays}天)表格整理`;
                } else {
                    title.textContent = '處方藥物表格整理';
                }
    
                // 清空內容容器
                contentContainer.innerHTML = '';
    
                // 處理沒有數據的情況
                if (validMedicines.size === 0) {
                    const noDataMsg = document.createElement('div');
                    noDataMsg.textContent = minDays > 0 ? 
                        `沒有發現處方天數≧${minDays}天的藥物` : 
                        '沒有處方藥物資料';
                    noDataMsg.style.cssText = `
                        text-align: center;
                        color: #666;
                        margin-top: 20px;
                    `;
                    contentContainer.appendChild(noDataMsg);
                    return;
                }
    
                // 準備簡化的藥品名稱
                const simplifiedMedicineMap = new Map();
                validMedicines.forEach((records, medicineName) => {
                    const simplifiedName = window.medicineProcessor.simplifyMedicineName(medicineName);
                    simplifiedMedicineMap.set(simplifiedName, records);
                });
    
                // 取得 ATC5 著色設定
                chrome.storage.sync.get({
                    enableATC5Coloring: false,
                    atc5Colors: {
                        red: ['M01AA', 'M01AB', 'M01AC', 'M01AE', 'M01AG', 'M01AH'],
                        blue: [],
                        green: []
                    }
                }, (settings) => {
                    // 創建表格
                    const table = document.createElement('table');
                    table.style.cssText = `
                        border-collapse: collapse;
                        width: max-content;
                        min-width: 100%;
                        background-color: white;
                        table-layout: fixed;
                        font-size: 14px;
                    `;
    
                    // 創建表頭
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
    
                    // 藥品名稱列標題
                    const nameHeader = document.createElement('th');
                    nameHeader.textContent = '藥品名稱';
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
    
                    // 日期標題
                    const sortedDates = Array.from(allDates).sort((a, b) => new Date(b) - new Date(a));
                    sortedDates.forEach(date => {
                        const dateHeader = document.createElement('th');
                        dateHeader.textContent = date;
                        dateHeader.style.cssText = `
                            padding: 12px;
                            text-align: center;
                            border: 1px solid #e0e0e0;
                            min-width: 90px;
                            background-color: #f5f5f5;
                            position: sticky;
                            top: 0;
                        `;
                        headerRow.appendChild(dateHeader);
                    });
    
                    thead.appendChild(headerRow);
                    table.appendChild(thead);
    
                    // 創建表格內容
                    const tbody = document.createElement('tbody');
                    simplifiedMedicineMap.forEach((records, simplifiedName) => {
                        const row = document.createElement('tr');
                        
                        // 藥品名稱單元格
                        const nameCell = document.createElement('td');
                        const formattedName = simplifiedName.replace(/(.{20})/g, '$1\u200B');
                        nameCell.textContent = formattedName;
    
                        // 套用 ATC5 顏色
                        if (settings.enableATC5Coloring && records[0]?.atc5Code) {
                            const atc5Code = records[0].atc5Code;
                            let backgroundColor = null;
    
                            if (settings.atc5Colors.red.some(prefix => atc5Code.startsWith(prefix))) {
                                backgroundColor = '#ffebee';
                            } else if (settings.atc5Colors.blue.some(prefix => atc5Code.startsWith(prefix))) {
                                backgroundColor = '#e3f2fd';
                            } else if (settings.atc5Colors.green.some(prefix => atc5Code.startsWith(prefix))) {
                                backgroundColor = '#e8f5e9';
                            }
    
                            if (backgroundColor) {
                                nameCell.style.backgroundColor = backgroundColor;
                            }
                        }
    
                        nameCell.style.cssText = `
                            position: sticky;
                            left: 0;
                            background-color: ${nameCell.style.backgroundColor || 'white'};
                            padding: 12px;
                            border: 1px solid #e0e0e0;
                            width: 200px;
                            word-wrap: break-word;
                            word-break: break-all;
                            white-space: pre-wrap;
                            line-height: 1.3;
                            z-index: 1;
                        `;
                        row.appendChild(nameCell);
    
                        // 日期單元格
                        sortedDates.forEach(date => {
                            const cell = document.createElement('td');
                            const record = records.find(r => r.date === date);
                            if (record && (minDays === 0 || parseInt(record.days) >= minDays)) {
                                const perDosage = window.medicineProcessor.calculatePerDosage(
                                    record.dosage,
                                    record.usage,
                                    record.days
                                );
                                const dosageText = perDosage === 'SPECIAL' ? 
                                    `總量${record.dosage}` : 
                                    `${perDosage}#`;
                                cell.textContent = `${dosageText} ${record.usage} ${record.days}d`;
                            }
                            cell.style.cssText = `
                                padding: 12px;
                                border: 1px solid #e0e0e0;
                                text-align: center;
                                background-color: white;
                                min-width: 120px;
                            `;
                            row.appendChild(cell);
                        });
    
                        tbody.appendChild(row);
                    });
    
                    table.appendChild(tbody);
    
                    // 創建表格容器
                    const tableWrapper = document.createElement('div');
                    tableWrapper.style.cssText = `
                        overflow: auto;
                        width: 100%;
                        height: 100%;
                    `;
                    
                    tableWrapper.appendChild(table);
                    contentContainer.appendChild(tableWrapper);
                });
            };
    
            // 添加選擇器變更事件監聽
            select.addEventListener('change', (e) => {
                updateTable(parseInt(e.target.value));
            });
    
            // 初始化表格顯示（使用預設值 7 天）
            updateTable(7);
    
            resolve(container);
        });
    },

    async handleGroupingDisplay(medicineData) {
        try {
            const flattenedMedicines = [];
            
            // 統一資料處理邏輯
            const processData = (data) => {
                Object.entries(data).forEach(([date, group]) => {
                    if (typeof group === 'object' && group !== null) {
                        const medicines = group.medicines || [];
                        medicines.forEach(medicine => {
                            if (medicine) {
                                flattenedMedicines.push({
                                    ...medicine,
                                    date: group.date || date
                                });
                            }
                        });
                    }
                });
            };
    
            // 檢查資料來源
            const isAutoPageCompleted = window.autoPagingHandler && 
                                       !window.autoPagingHandler.state.isProcessing;
            const hasAccumulatedData = window.autoPagingHandler?.accumulatedData && 
                                      Object.keys(window.autoPagingHandler.accumulatedData).length > 0;
            
            if (isAutoPageCompleted && hasAccumulatedData) {
                console.log('處理累積資料');
                processData(window.autoPagingHandler.accumulatedData);
            } else {
                console.log('處理當前頁面資料');
                processData(medicineData);
            }
    
            const categorizedMedicines = this.categorizeMedicines(flattenedMedicines);
            const groupingWindow = await this.createGroupingWindow(categorizedMedicines);
            
            if (groupingWindow) {
                document.body.appendChild(groupingWindow);
            } else {
                console.error('未能成功創建分組視窗');
            }
        } catch (error) {
            console.error('創建分組視窗時發生錯誤:', error);
        }
    }
};

// 將處理器掛載到 window 上
window.medicineGroupingHandler = medicineGroupingHandler;