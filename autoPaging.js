console.log('載入自動翻頁處理模組');

const autoPagingHandler = {
    // 儲存累積的資料
    accumulatedData: {},
    
    // 儲存處理狀態
    state: {
        isProcessing: false,
        currentPage: 1,
        targetPage: 1
    },

    initialize() {
        console.log('初始化自動翻頁功能');
        
        const waitForWindow = async () => {
            const titleElement = document.querySelector('#medicine-names-list h3');
            if (titleElement) {
                await this.checkAndAddButton(titleElement);
            } else {
                setTimeout(waitForWindow, 500);
            }
        };
        
        waitForWindow();
    },
    
    // 新增檢查功能
    // 在 autoPagingHandler 物件中
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
    
        console.log('頁碼詳細資訊:', {
            currentPage,
            maxPage,
            compareResult: currentPage === 1,
            pageButtons: document.querySelectorAll('.paginate_button').length,
            activeButton: document.querySelector('.paginate_button.current')?.textContent || 'none'
        });
        
        // 只在第1頁且有多頁時顯示按鈕
        const shouldShow = currentPage === 1 && maxPage > 1;
        console.log('是否應該顯示按鈕:', shouldShow, '(當前頁面:', currentPage, ', 總頁數:', maxPage, ')');
        
        return shouldShow;
    },
    
    // 新增檢查並添加按鈕的功能
    async checkAndAddButton(titleElement) {
        const shouldShow = await this.shouldShowButton();
        
        // 移除舊按鈕（如果存在）
        const existingButton = titleElement.parentElement.querySelector('.auto-paging-button');
        if (existingButton) {
            existingButton.remove();
        }

        // 如果應該顯示按鈕，則創建新按鈕
        if (shouldShow) {
            const button = this.createAutoPagingButton();
            // 添加特定的 class 以便之後識別
            button.classList.add('auto-paging-button');
            titleElement.parentElement.appendChild(button);
        }
    },
    
    // 建立連續讀取按鈕
    createAutoPagingButton() {
        const button = document.createElement('button');
        button.textContent = '連續讀取';
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

    // 合併資料
    mergeData(newData) {
        if (!newData) return;
        
        // 根據不同頁面類型處理資料合併
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('IMUE0008')) {
            // 藥品資料合併
            Object.entries(newData).forEach(([date, data]) => {
                if (!this.accumulatedData[date]) {
                    this.accumulatedData[date] = data;
                } else {
                    // 合併相同日期的藥品清單
                    this.accumulatedData[date].medicines = [
                        ...this.accumulatedData[date].medicines,
                        ...data.medicines
                    ];
                }
            });
        } else if (currentUrl.includes('IMUE0060')) {
            // TO-DO: 檢驗資料合併邏輯
        } else if (currentUrl.includes('IMUE0130')) {
            // TO-DO: 影像資料合併邏輯
        }
    },

    // 開始自動翻頁處理
    async startAutoPaging() {
        if (this.state.isProcessing) return;
        
        try {
            this.state.isProcessing = true;
            this.accumulatedData = {};
            
            // 取得設定的最大頁數
            const { maxPageCount } = await new Promise(resolve => {
                chrome.storage.sync.get({ maxPageCount: '5' }, resolve);
            });
            
            // 初始化起始頁資料
            if (window.location.href.includes('IMUE0008')) {
                const initialData = window.medicineProcessor.currentData;
                this.mergeData(initialData);
            }
            
            // 計算目標頁數
            this.state.currentPage = window.nextPagingHandler.getCurrentPageNumber();
            this.state.targetPage = Math.min(
                this.state.currentPage + parseInt(maxPageCount) - 1,
                window.nextPagingHandler.state.maxPage
            );
            
            // 顯示處理中狀態
            this.showProcessingStatus();
            
            // 開始連續讀取
            while (this.state.currentPage < this.state.targetPage) {
                await this.processNextPage();
            }
            
            // 完成後顯示累積的資料
            this.displayAccumulatedData();
            
        } catch (error) {
            console.error('自動翻頁過程發生錯誤:', error);
        } finally {
            this.state.isProcessing = false;
            this.hideProcessingStatus();
        }
    },

    // 處理下一頁
    async processNextPage() {
        await window.nextPagingHandler.handlePageChange(true);
        
        // 等待新資料載入
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 根據頁面類型獲取並合併資料
        if (window.location.href.includes('IMUE0008')) {
            const newData = window.medicineProcessor.currentData;
            this.mergeData(newData);
        }
        
        this.state.currentPage++;
        this.updateProcessingStatus();
    },

    // 顯示處理中狀態
    showProcessingStatus() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'auto-paging-status';
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
        const statusDiv = document.getElementById('auto-paging-status');
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
        const statusDiv = document.getElementById('auto-paging-status');
        if (statusDiv) {
            statusDiv.remove();
        }
    },

    // 顯示累積的資料
    displayAccumulatedData() {
        if (window.location.href.includes('IMUE0008')) {
            chrome.storage.sync.get({
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
                copyFormat: 'nameWithDosageVertical'
            }, settings => {
                window.medicineProcessor.displayResults(this.accumulatedData, settings);
            });
        }
    }
};

// 掛載到 window 對象
window.autoPagingHandler = autoPagingHandler;

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.href.includes('IMUE0008')) {
        window.autoPagingHandler.initialize();
    }
});