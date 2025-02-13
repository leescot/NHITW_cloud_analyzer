const medicineProcessor = {
    // 事件監聽相關
    // 修改 listenToPageChanges 方法
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
    
    listenToPageChanges() {
        // 先清理現有的觀察器
        if (this.currentObserver) {
            this.currentObserver.disconnect();
            this.currentObserver = null;
        }
    
        const tableBody = document.querySelector('table tbody');
        if (tableBody) {
            // 使用節流的初始化函數
            const throttledInit = this.throttle(() => {
                // 只在資料表格內容變化時更新顯示視窗
                const existingData = this.currentData;
                const newData = this.extractMedicineData(tableBody.closest('table'));
                
                if (newData && JSON.stringify(newData) !== JSON.stringify(existingData)) {
                    console.log('表格內容有變化，更新顯示');
                    this.currentData = newData;
                    chrome.storage.sync.get({
                        enableATC5Coloring: false,
                        titleFontSize: '16',
                        contentFontSize: '14',
                        noteFontSize: '12',
                        windowWidth: '500',
                        windowHeight: '80',
                        showGenericName: false,
                        simplifyMedicineName: true,
                        copyFormat: 'nameWithDosageVertical',
                        showDiagnosis: false
                    }, settings => {
                        this.displayResults(newData, settings);
                    });
                }
            }, 300); // 設定 1 秒的節流時間
    
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


    // 創建表格顯示按鈕
    async createGroupingButton() {
        if (!window.medicineGroupingHandler) {
            console.error('medicineGroupingHandler 未載入');
            return null;
        }

        const shouldShow = await window.medicineGroupingHandler.shouldShowGroupingButton();
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
                window.medicineGroupingHandler.handleGroupingDisplay(this.currentData);
            }
        };

        return button;
    },

    // ATC5 相關功能
    checkATC5Column(table) {
        const headers = Array.from(table.querySelectorAll('th'))
            .map(th => th.textContent.trim());
        return headers.includes('ATC5代碼');
    },

    showATC5Warning() {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed;
            top: 90px;
            right: 20px;
            background-color: #fff3cd;
            color: #856404;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #ffeeba;
            z-index: 10000;
            font-size: 14px;
        `;
        warningDiv.textContent = '請先新增「ATC5代碼」欄位到右方(右上角"更多"->"表格欄位設定")';
        document.body.appendChild(warningDiv);

        setTimeout(() => warningDiv.remove(), 5000);
    },

    getATC5Color(atc5Code, settings) {
        // 1. 首先檢查是否啟用 ATC5 顏色功能且有 ATC5 代碼
        if (!settings?.enableATC5Coloring || !atc5Code) {
            return null;
        }

        // 2. 檢查 atc5Colors 是否存在且具有必要的屬性
        const colors = settings.atc5Colors || {
            red: ['M01AA', 'M01AB', 'M01AC', 'M01AE', 'M01AG', 'M01AH'],
            blue: [],
            green: []
        };

        // 3. 使用前綴匹配來檢查 ATC5 代碼
        const checkPrefix = (codeList) => {
            if (!Array.isArray(codeList)) return false;
            return codeList.some(prefix => atc5Code.startsWith(prefix));
        };

        // 4. 依序檢查每種顏色
        if (colors.red && checkPrefix(colors.red)) return '#ffebee';
        if (colors.blue && checkPrefix(colors.blue)) return '#e3f2fd';
        if (colors.green && checkPrefix(colors.green)) return '#e8f5e9';
        
        return null;
    },

    // 劑量計算相關
    calculatePerDosage(dosage, frequency, days) {
        if (!dosage || !frequency || !days) return '';
        
        const frequencyMap = {
            'QD': 1,'QDP': 1,'QAM': 1,'QPM': 1, 'BID': 2,'BIDP': 2, 'TID': 3,'TIDP': 3, 'QID': 4,'QIDP': 4,
            'Q2H': 12, 'Q4H': 6, 'Q6H': 4, 'Q8H': 3,
            'Q12H': 2, 'HS': 1,'HSP': 1, 'DAILY': 1, 'QN': 1, 'STAT':1, 'ST':1 
        };

        const freqMatch = frequency.toUpperCase().match(/QD|QDP|BID|BIDP|TID|TIDP|QID|QIDP|Q2H|Q4H|Q6H|Q8H|Q12H|HS|HSP|PRN|QOD|TIW|BIW|QW|DAILY/);
        if (!freqMatch && !frequency.includes('需要時')) {
            console.log('無法識別的頻次:', frequency);
            return 'SPECIAL';
        }

        let totalDoses;
        const freq = freqMatch ? freqMatch[0] : 'PRN';
        
        if (frequency.includes('QOD') || frequency.includes('Q2D')) {
            totalDoses = Math.ceil(parseInt(days) / 2);
        } else if (frequency.includes('TIW')) {
            totalDoses = Math.ceil(parseInt(days) / 7) * 3;
        } else if (frequency.includes('BIW')) {
            totalDoses = Math.ceil(parseInt(days) / 7) * 2;
        } else if (frequency.includes('QW')) {
            totalDoses = Math.ceil(parseInt(days) / 7);
        } else if (frequency.includes('PRN') || frequency.includes('需要時')) {
            return 'SPECIAL';
        } else {
            totalDoses = parseInt(days) * (frequencyMap[freq] || 1);
        }

        const totalDosage = parseFloat(dosage);
        const singleDose = totalDosage / totalDoses;

        const threshold = 0.24;
        const validUnits = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        
        if (singleDose < threshold) {
            return 'SPECIAL';
        }

        const roundedDose = Math.round(singleDose * 4) / 4;

        if (!validUnits.includes(roundedDose)) {
            return 'SPECIAL';
        }

        return roundedDose.toString();
    },

    // 藥品名稱處理
    simplifyMedicineName(name) {
        let simplifiedName = name;

        // 處理 TAB. 相關變體
        const tabletRegex = /\b(tablets?|f\.?c\.?\s*tablets?|film[\s-]?coated\s*tablets?|prolonged release tablets?)\b/gi;
        simplifiedName = simplifiedName.replace(tabletRegex, '');

        // 處理其他變體和規格
        simplifiedName = simplifiedName
            .replace(/\b(ENTERIC-MICROENCAPSULATED|CAPSULES)\b/gi, '')
            .replace(/\b(capsules?|cap\.?)\b/gi, 'CAP.')
            .replace(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?){0,2})\s*mg\b(?!\s*\/)/gi, (match, p1) => 
                `(${p1.replace(/\s+/g, '')})`)
            .replace(/\s+(TAB\.|CAP\.)\s+/, ' ')
            .replace(/\([^)]*箔[^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .replace(/"/g, '')
            .trim();

        // 處理複合劑量
        const complexDoseRegex = /\((\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?){0,2})\)\s*(?:MG|MCG|G|ML)(?!\s*\/)/i;
        const doseMatch = simplifiedName.match(complexDoseRegex);
        if (doseMatch) {
            const dose = doseMatch[1].replace(/\s*\/\s*/g, '/');
            simplifiedName = simplifiedName.replace(complexDoseRegex, '').trim() + ' (' + dose + ')';
        }

        return simplifiedName;
    },

    // 格式化相關
    formatDiagnosis(date, source, diagnosis, diagnosisCode) {
        const formattedSource = source.split('門診')[0];
        const formattedDiagnosis = diagnosis && diagnosisCode ? 
            `(${diagnosisCode} ${diagnosis})` : '';
        return `${date} ${formattedSource} ${formattedDiagnosis}`;
    },

    formatMedicineList(medicines, format) {
        const getMedicineText = (med) => {
            const perDosage = this.calculatePerDosage(med.dosage, med.usage, med.days);
            let dosageText = perDosage === 'SPECIAL' ? `總量${med.dosage}` : `${perDosage}#`;
            const daysText = med.days && med.days !== '0' ? ` ${med.days}d` : '';
            
            switch (format) {
                case 'nameVertical':
                    return med.name;
                case 'nameWithDosageVertical':
                    return `${med.name} ${dosageText} ${med.usage}${daysText}`;
                case 'nameHorizontal':
                    return med.name;
                case 'nameWithDosageHorizontal':
                    return `${med.name} ${dosageText} ${med.usage}${daysText}`;
                default:
                    return med.name;
            }
        };

        const medicineTexts = medicines.map(med => getMedicineText(med));
        return format.includes('Horizontal') ? 
            medicineTexts.join(', ') : 
            medicineTexts.join('\n');
    },

    processMedicineDisplay(medicine, showGenericName = true, simplifyName = true) {
        const perDosage = this.calculatePerDosage(medicine.dosage, medicine.usage, medicine.days);
        let displayText;

        if (perDosage === 'SPECIAL') {
            displayText = `總量${medicine.dosage}`;
        } else {
            displayText = `${perDosage}#`;
        }
        
        const daysText = medicine.days && medicine.days !== '0' ? ` ${medicine.days}d` : '';
        const medicineName = simplifyName ? this.simplifyMedicineName(medicine.name) : medicine.name;
        
        return `
            <div style="margin-bottom: 2px;">
                <div>${medicineName} ${displayText} ${medicine.usage}${daysText}</div>
                ${showGenericName && medicine.ingredient ? 
                    `<div style="color: #666; margin-top: 0px;">
                        ${medicine.ingredient}
                    </div>` : ''}
            </div>
        `;
    },

    // 新增 handleCopy 方法（這個方法在之前的代碼中被引用但未定義）
    async handleCopy(date, source, medicines, settings) {
        const hospitalName = source.split('門診')[0];
        const processedMedicines = medicines.map(med => ({
            ...med,
            name: settings.simplifyMedicineName ? 
                this.simplifyMedicineName(med.name) : 
                med.name
        }));
        
        const text = `${date} ${hospitalName}\n${this.formatMedicineList(processedMedicines, settings.copyFormat)}`;
        await navigator.clipboard.writeText(text);
    },

    // 在 medicineProcessor 物件中新增
    async displayResults(groupedData, userSettings = {}) {
        // 使用傳入的 userSettings，不使用預設值
        const settings = userSettings;
        console.log('開始顯示資料，設定:', settings);

        // 檢查是否為累積資料顯示
        const isAccumulatedData = window.autoPagingHandler && 
        window.autoPagingHandler.state.isProcessing;

        // 創建或更新顯示容器
        let displayDiv = document.getElementById('medicine-names-list');
        if (!displayDiv) {
            displayDiv = document.createElement('div');
            displayDiv.id = 'medicine-names-list';
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
        } else {
            // 如果是累積資料顯示，清空現有內容
            if (isAccumulatedData) {
                const contentDiv = displayDiv.querySelector('.content-container');
                if (contentDiv) {
                    contentDiv.innerHTML = '';
                }
            } else {
                // 如果不是累積資料顯示，移除舊的視窗
                displayDiv.remove();
                return this.displayResults(groupedData, userSettings);
            }
        }

        // 標題區域
        if (!displayDiv.querySelector('.header-container')) {
            const headerDiv = document.createElement('div');
            headerDiv.className = 'header-container';
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

            // 左側區域：標題
            const titleH3 = document.createElement('h3');
            titleH3.textContent = '西醫用藥';
            titleH3.style.cssText = `
                margin: 0;
                font-size: ${settings.titleFontSize}px;
                padding: 0;
                font-weight: bold;
            `;

            // 中間區域：自動讀取按鈕
            // const middleControls = document.createElement('div');
            // middleControls.style.cssText = `
            //     display: flex;
            //     align-items: center;
            //     margin-left: 15px;
            // `;

            // 添加自動翻頁按鈕
            if (window.autoPagingHandler && !isAccumulatedData) {
                window.autoPagingHandler.checkAndAddButton(titleH3)
                    .then(() => {
                        console.log('自動翻頁按鈕添加完成');
                    })
                    .catch(error => {
                        console.error('添加自動翻頁按鈕時發生錯誤:', error);
                    });
            }

            // 右側區域：分頁控制和關閉按鈕
            const rightControls = document.createElement('div');
            rightControls.style.cssText = `
                display: flex;
                align-items: center;
                gap: 15px;
                margin-left: auto;
            `;

            // 添加分頁控制
            if (window.nextPagingHandler) {
                const pagingControls = window.nextPagingHandler.createPagingControls();
                rightControls.appendChild(pagingControls);
            }

            // 關閉按鈕
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

            // 組裝標題區域
            const leftSection = document.createElement('div');
            leftSection.style.cssText = `
                display: flex;
                align-items: center;
            `;
            leftSection.appendChild(titleH3);

            const middleControls = document.createElement('div');
            middleControls.style.cssText = `
                display: flex;
                align-items: center;
                margin-left: 15px;
            `;

            // 添加表格顯示按鈕
            const groupingButton = await this.createGroupingButton();
            if (groupingButton) {
                middleControls.appendChild(groupingButton);
            }
            
            // 如果是自動翻頁完成，再次檢查按鈕
            if (isAccumulatedData) {
                const newGroupingButton = await this.createGroupingButton();
                if (newGroupingButton && !middleControls.querySelector('button')) {
                    middleControls.appendChild(newGroupingButton);
                }
            }

            // 添加自動翻頁按鈕
            if (window.autoPagingHandler && !isAccumulatedData) {
                window.autoPagingHandler.checkAndAddButton(titleH3)
                    .then(() => {
                        console.log('自動翻頁按鈕添加完成');
                    })
                    .catch(error => {
                        console.error('添加自動翻頁按鈕時發生錯誤:', error);
                    });
            }

            leftSection.appendChild(middleControls);

            headerDiv.appendChild(leftSection);
            headerDiv.appendChild(rightControls);
            rightControls.appendChild(closeButton);
            displayDiv.appendChild(headerDiv);
        }

        // 內容區域
        let contentDiv = displayDiv.querySelector('.content-container');
        if (!contentDiv) {
            contentDiv = document.createElement('div');
            contentDiv.className = 'content-container';
            contentDiv.style.cssText = `
                flex-grow: 1;
                overflow-y: auto;
                padding-right: 5px;
            `;
            displayDiv.appendChild(contentDiv);
        }

        // 處理資料顯示
        // 修正 displayResults 方法中的日期標題部分
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

                // 修改 displayResults 方法中顯示日期和診斷的部分
                const dateText = document.createElement('div');
                dateText.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    flex: 1;
                `;

                const dateSourceRow = document.createElement('div');
                dateSourceRow.textContent = `${group.date} ${group.source}`;
                dateSourceRow.style.fontWeight = 'bold';

                const diagnosisRow = document.createElement('div');
                diagnosisRow.style.cssText = `
                    font-size: ${parseInt(settings.titleFontSize) * 0.8}px;
                    color: #2196F3;
                    font-weight: normal;
                `;

                if (settings.showDiagnosis && group.diagnosis) {
                    const diagnosisContent = group.diagnosisCode ? 
                        `${group.diagnosisCode} ${group.diagnosis}` : 
                        group.diagnosis;
                    diagnosisRow.textContent = diagnosisContent;
                }

                dateText.appendChild(dateSourceRow);
                if (settings.showDiagnosis && group.diagnosis) {
                    dateText.appendChild(diagnosisRow);
                }

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
                    display: ${settings.copyFormat === 'none' ? 'none' : 'block'};
                `;
                copyButton.onclick = () => {
                    this.handleCopy(group.date, group.source, group.medicines, settings)
                        .then(() => {
                            copyButton.textContent = '已複製！';
                            setTimeout(() => {
                                copyButton.textContent = '複製';
                            }, 2000);
                        });
                };

                headerBlock.appendChild(dateText);
                headerBlock.appendChild(copyButton);

                dateBlock.appendChild(headerBlock);

                // 藥品列表
                const medicinesList = document.createElement('div');
                medicinesList.style.cssText = `
                    padding-left: 10px;
                    font-size: ${settings.contentFontSize}px;
                `;

                group.medicines.forEach(med => {
                    const medDiv = document.createElement('div');
                    medDiv.style.cssText = 'margin-bottom: 0px;';
        
                    // 處理 ATC5 顏色
                    if (settings.enableATC5Coloring && med.atc5Code) {
                        const backgroundColor = this.getATC5Color(med.atc5Code, settings);
                        if (backgroundColor) {
                            medDiv.style.backgroundColor = backgroundColor;
                            medDiv.style.padding = '2px';
                            medDiv.style.borderRadius = '2px';
                            medDiv.style.marginBottom = '2px';
                        }
                    }
        
                    const medHtml = this.processMedicineDisplay(
                        med,
                        settings.showGenericName,
                        settings.simplifyMedicineName
                    );
                    medDiv.innerHTML = medHtml;
        
                    // 調整備註文字大小
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

        // 清除舊視窗
        // const existingDiv = document.getElementById('medicine-names-list');
        // if (existingDiv) {
        //     existingDiv.remove();
        // }

        // // 組裝並顯示視窗
        // displayDiv.appendChild(headerDiv);
        // displayDiv.appendChild(contentDiv);
        // document.body.appendChild(displayDiv);

        // 如果是新建的視窗，添加到頁面
        if (!document.getElementById('medicine-names-list')) {
            document.body.appendChild(displayDiv);
        }
    },

    // 檢查與分析表格
    inspectTables() {
        const allTables = document.getElementsByTagName('table');
        console.log(`找到 ${allTables.length} 個表格`);

        // 檢查每個表格基本資訊
        Array.from(allTables).forEach((table, index) => {
            console.log(`表格 #${index}:`, {
                id: table.id,
                className: table.className,
                rowCount: table.rows.length,
                preview: table.outerHTML.substring(0, 100)
            });
        });

        // 找出可能包含藥品資訊的表格
        const potentialTables = Array.from(allTables).filter(table => {
            const headerText = table.innerText.toLowerCase();
            return headerText.includes('藥品') || 
                   headerText.includes('用藥') ||
                   headerText.includes('medicine');
        });

        console.log('可能包含藥品資訊的表格數量:', potentialTables.length);
        return potentialTables;
    },

    // 提取藥品資料
    extractMedicineData(table) {
        console.log('開始分析表格資料');
        
        // 提取表頭並建立欄位映射
        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.trim());
        console.log('表頭:', headers);

        // 建立欄位映射
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
            藥品規格量: headers.indexOf('藥品規格量'),
            ATC5代碼: headers.indexOf('ATC5代碼')
        };

        // 驗證必要欄位
        const requiredColumns = ['藥品名稱', '就醫日期', '來源', '用法用量'];
        const missingColumns = requiredColumns.filter(col => columnMap[col] === -1);
        
        if (missingColumns.length > 0) {
            console.error('缺少必要欄位:', missingColumns);
            return null;
        }

        // 收集藥品資料
        const rows = table.querySelectorAll('tbody tr');
        console.log('表格行數:', rows.length);
        
        if (rows.length === 0) {
            console.log('未找到資料行，可能是表格正在載入中');
            return null;
        }

        const medicineData = Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 0) return null;

            // 獲取原始資料
            const rawData = {
                date: cells[columnMap.就醫日期]?.textContent.trim(),
                source: cells[columnMap.來源]?.textContent.trim(),
                diagnosis: cells[columnMap.主診斷]?.textContent.trim(),
                medicineName: cells[columnMap.藥品名稱]?.textContent.trim(),
                ingredient: cells[columnMap.成分名稱]?.textContent.trim(),
                dosage: cells[columnMap.藥品用量]?.textContent.trim(),
                usage: cells[columnMap.用法用量]?.textContent.trim(),
                days: cells[columnMap.給藥日數]?.textContent.trim(),
                spec: cells[columnMap.藥品規格量]?.textContent.trim(),
                atc5Code: cells[columnMap.ATC5代碼]?.textContent.trim()
            };

            // 處理藥品規格量
            const specText = rawData.spec;
            const specMatch = specText.match(/(\d+)/);
            const specNumber = specMatch ? specMatch[1] + '#' : '';

            // 處理診斷資料
            let diagnosisText = '';
            let diagnosisCode = '';
            if (rawData.diagnosis) {
                // 更新正則表達式以匹配 ICD-10 的各種格式
                const diagMatch = rawData.diagnosis.match(/([A-Z]\d+(?:\.\d+)?(?:[A-Z]|X[A-Z])?)\s*$/);
                if (diagMatch) {
                    diagnosisCode = diagMatch[1];
                    // 移除最後的診斷碼，取得診斷文字
                    diagnosisText = rawData.diagnosis.replace(diagMatch[0], '').trim();
                } else {
                    // 如果無法匹配，保留原始文字
                    diagnosisText = rawData.diagnosis;
                }
            }

            // 整理並返回資料
            return {
                date: rawData.date,
                source: rawData.source.split(/[\d\n]/)[0], // 移除數字和換行
                diagnosis: [diagnosisText, diagnosisCode], // 改為分開儲存診斷文字和代碼
                medicineName: rawData.medicineName,
                ingredient: rawData.ingredient,
                dosage: rawData.dosage,
                usage: rawData.usage,
                days: rawData.days,
                spec: specNumber,
                atc5Code: rawData.atc5Code
            };
        }).filter(Boolean); // 移除空值

        // 依照日期分組
        // 依照日期、來源和主診斷分組
        const groupedData = medicineData.reduce((groups, med) => {
            // 創建包含日期、來源和診斷的唯一鍵
            const groupKey = `${med.date}_${med.source}_${med.diagnosis[0]}_${med.diagnosis[1]}`;
            const medicineKey = `${med.date}_${med.medicineName}_${med.dosage}`; // 藥品唯一鍵
            
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    date: med.date,
                    source: med.source,
                    diagnosis: med.diagnosis[0] || '',
                    diagnosisCode: med.diagnosis[1] || '',
                    medicines: [],
                    processedKeys: new Set() // 用於追踪已處理的藥品
                };
            }
    
            // 檢查是否已經處理過相同的藥品
            if (!groups[groupKey].processedKeys.has(medicineKey)) {
                groups[groupKey].medicines.push({
                    name: med.medicineName,
                    spec: med.spec,
                    dosage: med.dosage,
                    usage: med.usage,
                    days: med.days,
                    ingredient: med.ingredient,
                    atc5Code: med.atc5Code
                });
                groups[groupKey].processedKeys.add(medicineKey);
            }
    
            return groups;
        }, {});
    
        // 清理臨時使用的 Set
        Object.values(groupedData).forEach(group => {
            delete group.processedKeys;
        });
    
        return groupedData;
    },

    async initialize() {
        console.log('開始初始化...');
    
        // 檢查是否正在進行自動翻頁
        const isAutoPaging = window.autoPagingHandler && 
                            window.autoPagingHandler.state.isProcessing;
    
        // 檢查是自動處理還是手動點擊
        const { autoProcess } = await new Promise(resolve => {
            chrome.storage.sync.get({ autoProcess: false }, resolve);
        });
        
        console.log('初始化模式:', { autoProcess, isAutoPaging });
    
        if (!isAutoPaging) {
            this.cleanup();
        }
        
        try {
            // 定義預設設定值
            const defaultSettings = {
                enableATC5Coloring: false,
                atc5Colors: {
                    red: ['M01AA', 'M01AB', 'M01AC', 'M01AE', 'M01AG', 'M01AH'],
                    blue: [],
                    green: []
                },
                titleFontSize: '16',
                contentFontSize: '14',
                noteFontSize: '12',
                windowWidth: '500',
                windowHeight: '80',
                showGenericName: false,
                simplifyMedicineName: true,
                copyFormat: 'nameWithDosageVertical',
                showDiagnosis: false
            };
    
            // 獲取使用者設定，並與預設值合併
            const settings = await new Promise(resolve => {
                chrome.storage.sync.get(defaultSettings, resolve);
            });
    
            // 確保 atc5Colors 的完整性
            settings.atc5Colors = {
                ...defaultSettings.atc5Colors,
                ...settings.atc5Colors
            };
    
            // 檢查並分析表格
            const tables = this.inspectTables();
            if (tables.length === 0) {
                console.log('未找到任何表格，可能頁面尚未完全載入');
                return false;
            }
    
            let hasProcessedTable = false;
            for (const table of tables) {
                // 檢查 ATC5 欄位
                if (settings.enableATC5Coloring && !this.checkATC5Column(table)) {
                    if (!isAutoPaging) {
                        this.showATC5Warning();
                    }
                    continue;
                }
    
                // 提取藥品資料
                const data = this.extractMedicineData(table);
                if (data && Object.keys(data).length > 0) {
                    this.currentData = data;
                    await this.displayResults(data, settings);
    
                    // 非自動翻頁模式下設置監聽和按鈕
                    if (!isAutoPaging) {
                        this.listenToPageChanges();
                        
                        // 初始化後觸發一次按鈕檢查
                        const titleElement = document.querySelector('#medicine-names-list h3');
                        if (titleElement && window.autoPagingHandler && window.nextPagingHandler) {
                            console.log('嘗試添加翻頁按鈕');
                            await window.autoPagingHandler.checkAndAddButton(titleElement);
                        }
                    }
                    hasProcessedTable = true;
                    break;
                }
            }
            
            return hasProcessedTable;
    
        } catch (error) {
            console.error('初始化過程發生錯誤:', error);
            return false;
        }
    },

    cleanup() {
        console.log('執行清理作業');
        
        // 移除現有的觀察器
        if (this.currentObserver) {
            this.currentObserver.disconnect();
            this.currentObserver = null;
            console.log('已清理觀察器');
        }
    
        // 移除現有的顯示視窗
        const existingDiv = document.getElementById('medicine-names-list');
        if (existingDiv) {
            existingDiv.remove();
            console.log('已移除現有顯示視窗');
        }
        const existingTable = document.getElementById('medicine-grouping-window');
        if (existingTable) {
            existingTable.remove();
            console.log('已移除現有表格視窗');
        }
        
        // 清理暫存的資料
        this.currentData = null;
    }
};

// 導出模組
window.medicineProcessor = medicineProcessor;