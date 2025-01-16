
// 監聽分頁按鈕點擊事件
function listenToPageChanges() {
    const paginationContainer = document.querySelector('.dataTables_paginate');
    if (paginationContainer) {
        // console.log('找到分頁控制區域');
        
        // 使用 MutationObserver 監控表格內容變化
        const tableObserver = new MutationObserver((mutations) => {
            console.log('檢測到表格內容變化，重新處理資料');
            const tables = inspectAllTables();
            if (tables.length > 0) {
                tables.forEach((table, index) => {
                    extractMedicineNames(table);
                });
            }
        });

        // 監控表格內容
        const tableBody = document.querySelector('table tbody');
        if (tableBody) {
            tableObserver.observe(tableBody, {
                childList: true,
                subtree: true
            });
        }

        // 監聽所有分頁按鈕的點擊事件
        paginationContainer.addEventListener('click', (event) => {
            // 延遲處理以等待表格更新
            setTimeout(() => {
                console.log('分頁按鈕被點擊，重新處理資料');
                const tables = inspectAllTables();
                if (tables.length > 0) {
                    tables.forEach((table, index) => {
                        extractMedicineNames(table);
                    });
                }
            }, 500); // 給予足夠的時間讓表格更新
        });
    }
}

// 計算每次服用量的函數
function calculatePerDosage(dosage, frequency, days) {
    // console.log('開始計算每次服用量:', { dosage, frequency, days });
    
    if (!dosage || !frequency || !days) return '';
    
    const frequencyMap = {
        'QD': 1,
        'BID': 2,
        'TID': 3,
        'QID': 4,
        'Q2H': 12,
        'Q4H': 6,
        'Q6H': 4,
        'Q8H': 3,
        'Q12H': 2,
        'HS': 1,
        'PRN': 1,
        'DAILY': 1
    };

    // 從用法用量字串中提取頻次
    const freqMatch = frequency.toUpperCase().match(/QD|BID|TID|QID|Q2H|Q4H|Q6H|Q8H|Q12H|HS|PRN|DAILY/);
    if (!freqMatch && !frequency.includes('需要時')) {
        console.log('無法識別的頻次:', frequency);
        return 'SPECIAL';
    }

    // 計算總次數
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

    // 計算單次劑量
    const totalDosage = parseFloat(dosage);
    const singleDose = totalDosage / totalDoses;

    // console.log('計算結果:', {
    //     totalDosage,
    //     totalDoses,
    //     singleDose
    // });

    // 設定閾值和有效單位
    const threshold = 0.24;
    const validUnits = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
    
    // 如果單次劑量小於閾值，返回特殊標記
    if (singleDose < threshold) {
        return 'SPECIAL';
    }

    // 四捨五入到最接近的 0.25
    const roundedDose = Math.round(singleDose * 4) / 4;

    // 檢查是否符合有效單位
    if (!validUnits.includes(roundedDose)) {
        return 'SPECIAL';
    }

    return roundedDose.toString();
}

// 簡化藥品名稱的函數
function simplifyMedicineName(name) {
    let simplifiedName = name;

    // 處理 TAB. 相關的變體，包括 "Film Coated Tablets" 和其他變體
    const tabletRegex = /\b(tablets?|f\.?c\.?\s*tablets?|film[\s-]?coated\s*tablets?|prolonged release tablets?)\b/gi;
    simplifiedName = simplifiedName.replace(tabletRegex, '');

    // 移除特定的描述性詞語
    simplifiedName = simplifiedName.replace(/\b(ENTERIC-MICROENCAPSULATED|CAPSULES)\b/gi, '');

    // 處理 CAP. 相關的變體
    const capsuleRegex = /\b(capsules?|cap\.?)\b/gi;
    simplifiedName = simplifiedName.replace(capsuleRegex, 'CAP.');

    // 特殊處理 x/y/zmg, x/ymg 和 xmg 格式的劑量，但不處理 mg/xxx 的情況
    const specialDoseRegex = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?){0,2})\s*mg\b(?!\s*\/)/gi;
    simplifiedName = simplifiedName.replace(specialDoseRegex, (match, p1) => {
        // 移除劑量中的所有空格
        const dose = p1.replace(/\s+/g, '');
        return `(${dose})`;
    });

    // 將劑量信息移到藥品名稱之後，並處理複合劑量
    const complexDoseRegex = /\((\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?){0,2})\)\s*(?:MG|MCG|G|ML)(?!\s*\/)/i;
    const doseMatch = simplifiedName.match(complexDoseRegex);
    if (doseMatch) {
        let dose = doseMatch[1];
        // 確保 "/" 之間沒有空格
        dose = dose.replace(/\s*\/\s*/g, '/');
        simplifiedName = simplifiedName.replace(complexDoseRegex, '').trim() + ' (' + dose + ')';
    }

    // 保留括號內的成分信息
    const ingredientRegex = /\(([^)]+)\)/g;
    const ingredients = [];
    let match;
    while ((match = ingredientRegex.exec(simplifiedName)) !== null) {
        ingredients.push(match[0]);
    }
    simplifiedName = simplifiedName.replace(ingredientRegex, '').trim();
    if (ingredients.length > 0) {
        simplifiedName += ' ' + ingredients.join(' ');
    }

    // 移除多餘的空格和引號
    simplifiedName = simplifiedName.replace(/\s+/g, ' ').replace(/"/g, '').trim();

    // 移除 (鋁箔/膠箔) 這樣的包裝信息
    simplifiedName = simplifiedName.replace(/\([^)]*箔[^)]*\)/g, '');

    // 移除藥品名稱中可能殘留的 TAB. 或 CAP.
    simplifiedName = simplifiedName.replace(/\s+(TAB\.|CAP\.)\s+/, ' ');

    return simplifiedName.trim();
}

function formatDiagnosis(date, source, diagnosis, diagnosisCode) {
    const formattedDate = date;
    const formattedSource = source.split('門診')[0];
    const formattedDiagnosis = diagnosis && diagnosisCode ? 
        `(${diagnosis}${diagnosisCode})` : 
        '';

    return `${formattedDate} ${formattedSource} ${formattedDiagnosis}`;
}

function formatMedicineList(medicines, format) {
    // 根據不同格式處理藥品清單
    const getMedicineText = (med) => {
        const perDosage = calculatePerDosage(med.dosage, med.usage, med.days);
        let dosageText = '';
        
        if (perDosage === 'SPECIAL') {
            dosageText = `總量${med.dosage}`;
        } else {
            dosageText = `${perDosage}#`;
        }

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

    // 根據格式決定是否使用橫式排列
    if (format === 'nameHorizontal' || format === 'nameWithDosageHorizontal') {
        return medicineTexts.join(', ');
    } else {
        return medicineTexts.join('\n');
    }
}


function processMedicineDisplay(medicine, showGenericName = true, simplifyName = true) {
    const perDosage = calculatePerDosage(medicine.dosage, medicine.usage, medicine.days);
    let displayText;

    if (perDosage === 'SPECIAL') {
        displayText = `總量${medicine.dosage}`;
    } else {
        displayText = `${perDosage}#`;
    }
    
    const daysText = medicine.days && medicine.days !== '0' ? ` ${medicine.days}d` : '';
    const medicineName = simplifyName ? simplifyMedicineName(medicine.name) : medicine.name;
    
    return `
        <div style="margin-bottom: 8px;">
            <div>${medicineName} ${displayText} ${medicine.usage}${daysText}</div>
            ${showGenericName ? 
                `<div style="color: #666; margin-top: 2px;">
                    ${medicine.ingredient || ''}
                </div>` : ''}
        </div>
    `;
}

window.medicineProcessor = {
    calculatePerDosage,
    formatDiagnosis,
    processMedicineDisplay,
    formatMedicineList,
    simplifyMedicineName
};