// Move these constants outside the if block to make them accessible
const CHINESE_MEDICINE_URL = 'https://medcloud2.nhi.gov.tw/imu/IMUE1000/IMUE0090';
// 
// / 確保在全域範圍聲明
if (typeof window.chineseMedicineProcessor === "undefined") {
  console.log("正在載入中藥處理器...");

  window.chineseMedicineProcessor = {
    // 現有的屬性
    currentData: null,
    currentObserver: null,
    paginationState: {
      currentPage: 1,
      maxPage: 1,
    },

    // 新增 isProcessing 狀態追蹤
    state: {
      isProcessing: false
    },

    // 新增自動處理方法
    async autoProcess() {
      console.log('開始自動處理中藥資料');
      
      try {
        const tables = this.inspectTables();
        if (tables && tables.length > 0) {
          const data = this.extractChineseMedicineData(tables[0]);
          if (data) {
            this.displayResults(data);
            this.listenToPageChanges();
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error('自動處理中藥資料時發生錯誤:', error);
        return false;
      }
    },

    // Modify waitForTables method to handle table loading
    waitForTables(callback, maxAttempts = 10) {
      let attempts = 0;
      const checkTables = () => {
        const tables = this.inspectTables();
        if (tables && tables.length > 0 && tables[0].querySelector("tbody tr td")) {
          console.log('找到已載入資料的中藥表格，開始處理');
          setTimeout(callback, 500);
        } else if (attempts < maxAttempts) {
          attempts++;
          console.log(`等待中藥表格載入... 嘗試次數: ${attempts}`);
          setTimeout(checkTables, 1000);
        } else {
          console.log('等待中藥表格載入超時');
        }
      };
      checkTables();
    },

    // 新增檢查頁面 URL 的方法
    isChineseMedicinePage() {
      const currentUrl = window.location.href;
      return currentUrl.includes(CHINESE_MEDICINE_URL) || 
             currentUrl.endsWith('IMUE0090');
    },

    // 檢查表格方法
    inspectTables() {
      try {
        const allTables = document.getElementsByTagName("table");
        console.log(`找到 ${allTables?.length || 0} 個表格`);

        if (!allTables || allTables.length === 0) {
          console.log("未找到任何表格");
          return [];
        }

        const potentialTables = Array.from(allTables).filter((table) => {
          if (!table) return false;

          const headers = Array.from(table.querySelectorAll("th") || []).map(
            (th) => th?.textContent?.trim() || ""
          );

          const hasData = table.querySelector("tbody tr td") !== null;

          console.log("檢查表格標題:", headers);

          return (
            headers.includes("方名") && headers.includes("就醫日期") && hasData
          );
        });

        console.log("可能包含中藥資訊的表格數量:", potentialTables.length);
        return potentialTables;
      } catch (error) {
        console.error("檢查表格時發生錯誤:", error);
        return [];
      }
    },

    // 提取資料方法
    extractChineseMedicineData(table) {
      try {
        if (!table) {
          console.log("表格不存在");
          return null;
        }

        console.log("開始提取中藥資料");

        const headers = Array.from(table.querySelectorAll("th") || []).map(
          (th) => th?.textContent?.trim() || ""
        );

        const columnMap = {
          序號: headers.indexOf("項次"),
          來源: headers.indexOf("來源"),
          就醫日期: headers.indexOf("就醫日期"),
          方名: headers.indexOf("方名"),
          給藥總量: headers.indexOf("給藥總量(每日)"),
          用法用量: headers.indexOf("用法用量"),
          給藥日數: headers.indexOf("給藥日數"),
          主診斷: headers.indexOf("主診斷"),
        };

        console.log("欄位映射:", columnMap);

        const rows = Array.from(table.querySelectorAll("tbody tr") || []);
        const medicineData = rows
          .map((row) => {
            if (!row) return null;

            const cells = row.querySelectorAll("td");
            if (!cells || cells.length === 0) return null;

            const days = cells[columnMap.給藥日數]?.textContent?.trim() || "";
            const totalAmount =
              cells[columnMap.給藥總量]?.textContent?.trim() || "";
            let dailyAmount = "";

            if (days && totalAmount) {
              const daysNum = parseFloat(days);
              const totalNum = parseFloat(totalAmount);
              if (!isNaN(daysNum) && !isNaN(totalNum) && daysNum > 0) {
                dailyAmount = (totalNum / daysNum).toFixed(1);
              }
            }

            const diagnosisText =
              cells[columnMap.主診斷]?.textContent?.trim() || "";
            const diagnosisMatch = diagnosisText.match(
              /([A-Z][0-9]+[A-Z0-9]*)/
            );
            let chineseDiagnosis = diagnosisText;
            let diagnosisCode = "";

            if (diagnosisMatch) {
              diagnosisCode = diagnosisMatch[0];
              chineseDiagnosis = diagnosisText
                .replace(diagnosisCode, "")
                .replace(/<br>|<BR>/g, "")
                .trim();
            }

            const formattedDiagnosis = diagnosisCode
              ? `${diagnosisCode} ${chineseDiagnosis}`
              : chineseDiagnosis;

            return {
              date: cells[columnMap.就醫日期]?.textContent?.trim() || "",
              source: (cells[columnMap.來源]?.textContent?.trim() || "").split(
                /[\d\n]/
              )[0],
              diagnosis: formattedDiagnosis,
              formulaName: cells[columnMap.方名]?.textContent?.trim() || "",
              dailyAmount: dailyAmount,
              days: days,
              usage: cells[columnMap.用法用量]?.textContent?.trim() || "",
            };
          })
          .filter((data) => data && data.formulaName && data.date);

        const groupedData = medicineData.reduce((groups, med) => {
          if (!med || !med.date) return groups;

          if (!groups[med.date]) {
            groups[med.date] = {
              date: med.date,
              source: med.source,
              diagnosis: med.diagnosis,
              medicines: [],
            };
          }

          const existingMedicine = groups[med.date].medicines.find(
            (m) =>
              m &&
              m.formulaName === med.formulaName &&
              m.dailyAmount === med.dailyAmount &&
              m.days === m.days
          );

          if (!existingMedicine) {
            groups[med.date].medicines.push({
              formulaName: med.formulaName,
              dailyAmount: med.dailyAmount,
              days: med.days,
              usage: med.usage,
            });
          }

          return groups;
        }, {});

        Object.values(groupedData).forEach((group) => {
          group.medicines.sort((a, b) => {
            const amountA = parseFloat(a.dailyAmount) || 0;
            const amountB = parseFloat(b.dailyAmount) || 0;
            return amountB - amountA;
          });
        });

        return groupedData;
      } catch (error) {
        console.error("提取資料時發生錯誤:", error);
        return null;
      }
    }, // 創建分頁控制按鈕
    createPagingControls() {
      const controlsDiv = document.createElement("div");
      controlsDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
      `;

      const prevButton = document.createElement("button");
      prevButton.textContent = "上頁";
      const canPrev = this.paginationState.currentPage > 1;
      prevButton.style.cssText = `
        background-color: ${canPrev ? "#2196F3" : "#ccc"};
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 12px;
        cursor: ${canPrev ? "pointer" : "not-allowed"};
        font-size: 14px;
      `;
      if (canPrev) {
        prevButton.onclick = () => this.handlePageChange(false);
      }

      const nextButton = document.createElement("button");
      nextButton.textContent = "下頁";
      const canNext =
        this.paginationState.currentPage < this.paginationState.maxPage;
      nextButton.style.cssText = `
        background-color: ${canNext ? "#2196F3" : "#ccc"};
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 12px;
        cursor: ${canNext ? "pointer" : "not-allowed"};
        font-size: 14px;
      `;
      if (canNext) {
        nextButton.onclick = () => this.handlePageChange(true);
      }

      const pageInfo = document.createElement("span");
      pageInfo.style.cssText = `
        color: #666;
        font-size: 14px;
      `;
      pageInfo.textContent = `(第${this.paginationState.currentPage}/${this.paginationState.maxPage}頁)`;

      controlsDiv.appendChild(prevButton);
      controlsDiv.appendChild(nextButton);
      controlsDiv.appendChild(pageInfo);

      return controlsDiv;
    },

    // 處理頁面切換
    async handlePageChange(isNext) {
      if (
        isNext &&
        this.paginationState.currentPage >= this.paginationState.maxPage
      ) {
        console.log("已經是最後一頁");
        return;
      }
      if (!isNext && this.paginationState.currentPage <= 1) {
        console.log("已經是第一頁");
        return;
      }

      const button = isNext
        ? document.querySelector(".paginate_button.next:not(.disabled)")
        : document.querySelector(".paginate_button.previous:not(.disabled)");

      if (button) {
        this.paginationState.currentPage = isNext
          ? this.paginationState.currentPage + 1
          : this.paginationState.currentPage - 1;

        this.cleanup();
        button.click();
        await this.waitForPageLoad();
        await this.initialize();
      }
    },

    // 等待頁面載入
    waitForPageLoad() {
      return new Promise((resolve) => {
        const checkContent = (retries = 0, maxRetries = 10) => {
          if (retries >= maxRetries) {
            console.log("等待頁面載入超時");
            resolve();
            return;
          }

          const tables = document.getElementsByTagName("table");
          const hasNewContent = Array.from(tables).some((table) => {
            return table.querySelector("tbody tr td") !== null;
          });

          if (hasNewContent) {
            setTimeout(resolve, 500);
          } else {
            setTimeout(() => checkContent(retries + 1), 500);
          }
        };

        checkContent();
      });
    },

    // 更新分頁信息
    updatePaginationInfo() {
      const pageButtons = Array.from(
        document.querySelectorAll(".paginate_button")
      );
      if (!pageButtons.length) {
        return false;
      }

      const pageNumbers = pageButtons
        .map((button) => parseInt(button.textContent))
        .filter((num) => !isNaN(num));

      this.paginationState.maxPage = Math.max(...pageNumbers, 1);

      const activeButton = document.querySelector(".paginate_button.current");
      if (activeButton) {
        const currentPage = parseInt(activeButton.textContent);
        if (!isNaN(currentPage)) {
          this.paginationState.currentPage = currentPage;
        }
      }

      return true;
    },

    // 顯示結果方法
    async displayResults(groupedData, userSettings = {}) {
      let displayDiv = document.getElementById("chinese-medicine-list");
      if (!displayDiv) {
        displayDiv = document.createElement("div");
        displayDiv.id = "chinese-medicine-list";
        displayDiv.style.cssText = `
          position: fixed;
          top: 90px;
          right: 20px;
          background-color: #ffffff;
          border: 3px solid #d3efff;
          padding: 20px;
          border-radius: 10px;
          height: ${userSettings.windowHeight || 80}vh;
          width: ${userSettings.windowWidth || 500}px;
          z-index: 10000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
        `;
      } else {
        displayDiv.innerHTML = "";
      }

      const headerDiv = document.createElement("div");
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

      const titleH3 = document.createElement("h3");
      titleH3.textContent = "中醫處方";
      titleH3.style.cssText = `
        margin: 0;
        font-size: ${userSettings.titleFontSize || 16}px;
        padding: 0;
        font-weight: bold;
      `;

      const rightControls = document.createElement("div");
      rightControls.style.cssText = `
        display: flex;
        align-items: center;
        gap: 15px;
      `;

      const pagingControls = this.createPagingControls();
      rightControls.appendChild(pagingControls);

      const closeButton = document.createElement("button");
      closeButton.textContent = "×";
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

      headerDiv.appendChild(titleH3);
      headerDiv.appendChild(rightControls);

      const contentDiv = document.createElement("div");
      contentDiv.style.cssText = `
        flex-grow: 1;
        overflow-y: auto;
        padding-right: 5px;
      `;

      Object.values(groupedData)
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach((group) => {
          const dateBlock = document.createElement("div");
          dateBlock.style.marginBottom = "20px";

          const dateHeader = document.createElement("div");
          dateHeader.style.cssText = `
            font-weight: bold;
            padding-bottom: 5px;
            margin-bottom: 10px;
            border-bottom: 2px solid #d3efff;
          `;

          const dateSource = document.createElement("div");
          dateSource.style.cssText = `
            color: #2196F3;
            font-size: ${userSettings.titleFontSize || 16}px;
            margin-bottom: 5px;
          `;
          dateSource.textContent = `${group.date} ${group.source}`;

          const diagnosisSpan = document.createElement("div");
          diagnosisSpan.style.cssText = `
            color: #000000;
            font-weight: bold;
            font-size: ${userSettings.titleFontSize || 16}px;
          `;
          diagnosisSpan.textContent = group.diagnosis || "";

          dateHeader.appendChild(dateSource);
          dateHeader.appendChild(diagnosisSpan);

          const medicinesList = document.createElement("div");
          medicinesList.style.cssText = `
            padding-left: 10px;
            font-size: ${userSettings.contentFontSize || 14}px;
          `;

          group.medicines.forEach((med) => {
            const medDiv = document.createElement("div");
            medDiv.style.marginBottom = "8px";

            const dailyAmountText = med.dailyAmount ? `${med.dailyAmount}` : "";
            const daysText = med.days ? `${med.days}d` : "";
            const usageText = med.usage || "";

            medDiv.innerHTML = `
              <div style="margin-bottom: 2px;">
                ${med.formulaName} ${dailyAmountText} ${daysText} ${usageText}
              </div>
            `;
            medicinesList.appendChild(medDiv);
          });

          dateBlock.appendChild(dateHeader);
          dateBlock.appendChild(medicinesList);
          contentDiv.appendChild(dateBlock);
        });

      displayDiv.appendChild(headerDiv);
      displayDiv.appendChild(contentDiv);

      if (!document.getElementById("chinese-medicine-list")) {
        document.body.appendChild(displayDiv);
      }
    },

    // 初始化方法
    async initialize() {
      console.log('開始初始化中藥處理器');
      
      if (!this.isChineseMedicinePage()) {
        console.log('非中藥頁面，不進行初始化');
        return false;
      }

      this.cleanup();
      this.state.isProcessing = true;

      return new Promise((resolve) => {
        this.waitForTables(async () => {
          try {
            const result = await this.autoProcess();
            if (result) {
              console.log('中藥處理器初始化成功');
              resolve(true);
            } else {
              console.log('中藥處理器初始化失敗：無資料');
              resolve(false);
            }
          } catch (error) {
            console.error('中藥處理器初始化失敗:', error);
            this.state.isProcessing = false;
            resolve(false);
          }
        });
      });
    },

    // 清理方法
    cleanup() {
      console.log('執行中藥處理器清理作業');
      
      if (this.currentObserver) {
        this.currentObserver.disconnect();
        this.currentObserver = null;
        console.log('已清理觀察器');
      }

      const existingDiv = document.getElementById('chinese-medicine-list');
      if (existingDiv) {
        existingDiv.remove();
        console.log('已移除現有顯示視窗');
      }

      this.currentData = null;
      this.state.isProcessing = false;
    },

    // 新增監聽頁面變化的方法
    listenToPageChanges() {
      if (this.currentObserver) {
        this.currentObserver.disconnect();
      }

      const tableBody = document.querySelector('table tbody');
      if (tableBody) {
        this.currentObserver = new MutationObserver((mutations) => {
          const table = this.inspectTables()[0];
          if (table) {
            const newData = this.extractChineseMedicineData(table);
            if (newData && JSON.stringify(newData) !== JSON.stringify(this.currentData)) {
              console.log('表格內容有變化，更新顯示');
              this.currentData = newData;
              this.displayResults(newData);
            }
          }
        });

        this.currentObserver.observe(tableBody, {
          childList: true,
          subtree: true
        });
      }
    },
  };
}


// 註冊頁面載入和離開的處理
document.addEventListener('DOMContentLoaded', () => {
  if (window.chineseMedicineProcessor.isChineseMedicinePage()) {
    // 檢查自動處理設定
    chrome.storage.sync.get({ autoProcess: true }, (settings) => {
      if (settings.autoProcess) {
        console.log('自動處理設定已啟用，開始初始化中藥處理器');
        window.chineseMedicineProcessor.initialize();
      } else {
        console.log('自動處理設定未啟用');
      }
    });
  }
});

// 處理頁面離開
window.addEventListener('beforeunload', () => {
  if (window.chineseMedicineProcessor.isChineseMedicinePage()) {
    window.chineseMedicineProcessor.cleanup();
  }
});

// 觸發準備就緒事件
document.dispatchEvent(new Event('chineseMedicineProcessorReady'));
