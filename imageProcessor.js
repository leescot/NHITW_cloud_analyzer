console.log('載入影像及病理處理模組');

const imageProcessor = {
    // 檢查表格並找到主要的檢查項目表格
    inspectImageTables() {
        console.log('開始檢查影像及病理表格');
        const allTables = document.getElementsByTagName('table');
        console.log(`找到 ${allTables.length} 個表格`);

        // 尋找主要的檢查項目表格（含特定欄位的表格）
        const targetTable = Array.from(allTables).find(table => {
            const headers = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent.trim());
            
            // 檢查是否包含必要的欄位
            const requiredHeaders = ['項次', '檢驗日期', '醫令名稱'];
            const hasRequiredHeaders = requiredHeaders.every(header => 
                headers.includes(header)
            );

            if (hasRequiredHeaders) {
                console.log('找到符合的表格，表頭：', headers);
                // 檢查是否有資料列
                const rows = table.querySelectorAll('tbody tr');
                console.log('表格資料列數：', rows.length);
                return rows.length > 0;
            }
            return false;
        });

        return targetTable;
    },

    // 處理表格數據
    // 在 processImageData 方法中修改資料收集邏輯
    processImageData(table) {
        if (!table) {
            console.error('無法處理：未提供表格');
            return null;
        }
    
        // 取得表頭和映射
        const headers = Array.from(table.querySelectorAll('th'))
            .map(th => th.textContent.trim());
        console.log('表頭欄位:', headers);
    
        const columnMap = {
            項次: headers.indexOf('項次'),
            檢查日期: headers.indexOf('檢驗日期'),
            檢查名稱: headers.indexOf('醫令名稱'),
            診療部位: headers.indexOf('診療部位'),
            影像查詢: headers.indexOf('影像查詢'),
            報告日期: headers.indexOf('報告日期'),
            報告結果: headers.indexOf('報告結果'),
            檢查類別: headers.indexOf('檢驗類別'),
            來源: headers.indexOf('來源'),
            費用年月: headers.indexOf('費用年月'),
            品質通報: headers.indexOf('品質通報'),
            註記: headers.indexOf('註記')
        };
    
        // 解析報告內容的函數
        const parseReportData = (dataId) => {
            if (!dataId) return null;
            
            try {
                // URL 解碼
                const decoded = decodeURIComponent(dataId);
                // 分割資料
                const parts = decoded.split('@');
                if (parts.length >= 3) {
                    return {
                        reportDate: parts[1],
                        reportContent: parts[2].split('|')[0]
                    };
                }
            } catch (e) {
                console.error('解析報告資料失敗:', e);
            }
            return null;
        };
    
        // 取得資料列
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        console.log('找到資料列數：', rows.length);
    
        // 修改最後的過濾條件，只保留有報告內容的項目
        const imageData = rows
            .map(row => {
                const cells = Array.from(row.cells);
                if (cells.length === 0) return null;

                const rowData = {};
                Object.entries(columnMap).forEach(([key, index]) => {
                    if (index !== -1 && cells[index]) {
                        rowData[key] = cells[index].textContent.trim();
                        
                        if (key === '報告結果') {
                            const reportLink = cells[index].querySelector('a.bluebtn');
                            if (reportLink) {
                                const reportData = parseReportData(reportLink.getAttribute('data-id'));
                                if (reportData) {
                                    rowData.報告日期 = reportData.reportDate;
                                    rowData.報告內容 = reportData.reportContent;
                                }
                            }
                        }
                    }
                });

                            // 只返回有報告內容的項目
                if (rowData.檢查名稱 && rowData.報告內容) {
                    console.log('處理到有報告的資料：', rowData);
                    return rowData;
                }
                return null;
            })
            .filter(Boolean);

        console.log('總共處理有報告的資料筆數：', imageData.length);
        return imageData;   
    },

    // 格式化來源顯示
    formatSource(source) {
        // 比如輸入 "門諾醫院門診1145010038" 輸出 "門諾醫院門診"
        return source.replace(/[0-9]/g, '');
    },

    // 格式化報告資料用於複製
    formatReportForCopy(item) {
        let text = `${item.檢查日期} ${this.formatSource(item.來源)}\n`;
        text += `${item.檢查名稱}\n`;
        if (item.診療部位) {
            text += `部位: ${item.診療部位}\n`;
        }
        if (item.報告日期) {
            text += `報告日期: ${item.報告日期}\n`;
        }
        if (item.報告內容) {
            text += `報告結果: ${item.報告內容}\n`;
        }
        return text;
    },

    // 處理複製功能
    handleCopy(date, items, button) {
        const text = items.map(item => this.formatReportForCopy(item)).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            if (button) {
                button.textContent = '已複製！';
                setTimeout(() => {
                    button.textContent = '複製';
                }, 2000);
            }
        });
    },

    // 顯示結果在視窗中
    displayResults(data) {
        console.log('準備顯示資料，資料筆數：', data.length);
        chrome.storage.sync.get({
            titleFontSize: '16',
            contentFontSize: '14',
            noteFontSize: '12',
            windowWidth: '500',
            windowHeight: '80'
        }, (settings) => {
            // 視窗容器
            const displayDiv = document.createElement('div');
            displayDiv.id = 'image-results-list';
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

            // 標題區域
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
            titleH3.textContent = '影像及病理報告';
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

            // 內容區域
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = `
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 5px;
            `;

            // 按照檢查日期分組資料
            const groupedData = data.reduce((acc, item) => {
                const date = item.檢查日期;
                if (!acc[date]) {
                    acc[date] = [];
                }
                acc[date].push(item);
                return acc;
            }, {});

            // 顯示資料
            // 顯示資料時的修改
            Object.entries(groupedData)
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .forEach(([date, items]) => {
                    const dateBlock = document.createElement('div');
                    dateBlock.style.cssText = 'margin-bottom: 20px;';

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
                    dateText.textContent = `${date} ${this.formatSource(items[0].來源)}`;

                    // 添加複製按鈕
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
                    copyButton.onclick = () => this.handleCopy(date, items, copyButton);

                    dateHeader.appendChild(dateText);
                    dateHeader.appendChild(copyButton);

                    const itemsList = document.createElement('div');
                    itemsList.style.cssText = `
                        padding-left: 10px;
                        font-size: ${settings.contentFontSize}px;
                    `;

                    items.forEach(item => {
                        const itemDiv = document.createElement('div');
                        itemDiv.style.marginBottom = '8px';
                        itemDiv.innerHTML = `
                            <div style="margin-bottom: 4px;">${item.檢查名稱}</div>
                            ${item.診療部位 ? `<div style="margin-bottom: 4px;color: #666;">部位: ${item.診療部位}</div>` : ''}
                            <div style="color: #666; font-size: ${settings.contentFontSize}px;">
                                ${item.報告日期 ? `報告日期: ${item.報告日期}<br>` : ''}
                                ${item.報告內容 ? `報告結果: ${item.報告內容}` : ''}
                            </div>
                        `;
                        itemsList.appendChild(itemDiv);
                    });

                    dateBlock.appendChild(dateHeader);
                    dateBlock.appendChild(itemsList);
                    contentDiv.appendChild(dateBlock);
                });

            // 刪除現有視窗
            const existingDiv = document.getElementById('image-results-list');
            if (existingDiv) {
                existingDiv.remove();
            }

            // 組裝視窗
            displayDiv.appendChild(headerDiv);
            displayDiv.appendChild(contentDiv);
            document.body.appendChild(displayDiv);
        });
    },

    // 按鈕點擊事件處理
    handleButtonClick() {
        console.log('影像及病理按鈕被點擊');
        const table = this.inspectImageTables();
        if (table) {
            console.log('找到目標表格，開始處理數據');
            const data = this.processImageData(table);
            if (data && data.length > 0) {
                console.log('成功處理數據，準備顯示');
                this.displayResults(data);
            } else {
                console.log('沒有找到有效數據');
            }
        } else {
            console.log('未找到目標表格');
        }
    },

    // 檢查當前頁面是否為影像及病理頁面
    isImagePage() {
        return window.location.href.includes('IMUE0130');
    }
};

// 將處理器掛載到 window 上
window.imageProcessor = imageProcessor;

// 觸發準備就緒事件
document.dispatchEvent(new Event('imageProcessorReady'));