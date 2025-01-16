console.log('載入自動翻頁處理模組');

const autoPagingHandler = {
    // 儲存狀態
    state: {
        isAutoPaging: false,
        currentPage: 1,
        maxPage: 1,
        processingPage: false
    },

    // 初始化
    initialize() {
        console.log('開始初始化自動翻頁功能');
        
        // 先檢查設定再決定是否創建按鈕
        chrome.storage.sync.get({ enableAutoPaging: true }, (settings) => {
            if (settings.enableAutoPaging) {
                console.log('自動翻頁功能已啟用，創建按鈕');
                this.createPagingButton();
                this.observeUrlChanges();
            } else {
                console.log('自動翻頁功能未啟用，不創建按鈕');
                // 如果按鈕已存在，移除它
                const existingButton = document.getElementById('auto-pagination-btn');
                if (existingButton) {
                    existingButton.remove();
                }
            }
        });
    },

    // 新增監聽網址變化的函數
    observeUrlChanges() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('URL changed, checking auto paging settings...');
                
                // URL 改變時也要檢查設定
                chrome.storage.sync.get({ enableAutoPaging: true }, (settings) => {
                    if (settings.enableAutoPaging) {
                        console.log('自動翻頁功能已啟用，重新創建按鈕');
                        this.createPagingButton();
                        this.updatePaginationInfo();
                    } else {
                        console.log('自動翻頁功能未啟用，確保按鈕被移除');
                        const existingButton = document.getElementById('auto-pagination-btn');
                        if (existingButton) {
                            existingButton.remove();
                        }
                    }
                });
            }
        }).observe(document, { subtree: true, childList: true });
    },

    // 建立自動翻頁按鈕
    createPagingButton() {
        console.log('準備創建自動翻頁按鈕');
        
        try {
            // 確保在目標頁面上
            const currentUrl = window.location.href;
            if (!currentUrl.includes('IMUE0008') && !currentUrl.includes('IMUE0060')) {
                console.log('不在目標頁面上，不創建按鈕');
                return;
            }
    
            // 移除舊按鈕（如果存在）
            const existingButton = document.getElementById('auto-pagination-btn');
            if (existingButton) {
                existingButton.remove();
            }
    
            const button = document.createElement('button');
            button.id = 'auto-pagination-btn';
            button.textContent = '自動翻頁';
            
            Object.assign(button.style, {
                position: 'fixed',
                top: '25px',
                right: '200px',
                zIndex: '999999',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'block',
                fontFamily: 'Arial, "Microsoft JhengHei", sans-serif'
            });
            
            button.onclick = () => {
                console.log('自動翻頁按鈕被點擊');
                this.toggleAutoPaging();
            };
    
            // 確保 body 存在並添加按鈕
            if (document.body) {
                document.body.appendChild(button);
                console.log('自動翻頁按鈕已創建:', document.getElementById('auto-pagination-btn'));
            } else {
                console.error('無法找到 document.body');
            }
        } catch (error) {
            console.error('創建按鈕時發生錯誤:', error);
        }
    },

    // 更新分頁資訊
    updatePaginationInfo() {
        const pageButtons = Array.from(document.querySelectorAll('.paginate_button'));
        console.log('找到的分頁按鈕:', pageButtons);

        if (!pageButtons.length) {
            console.log('沒有找到分頁按鈕');
            return;
        }

        // 計算最大頁數
        const pageNumbers = pageButtons
            .map(button => parseInt(button.textContent))
            .filter(num => !isNaN(num));

        this.state.maxPage = Math.max(...pageNumbers, 1);
        this.state.currentPage = this.getCurrentPageNumber();
        
        // 從設定中取得最大頁數限制
        chrome.storage.sync.get({ maxPageCount: '5' }, (settings) => {
            const maxAllowedPage = Math.min(parseInt(settings.maxPageCount), 10);
            this.state.maxPage = Math.min(this.state.maxPage, maxAllowedPage);
            
            console.log('更新頁面資訊:', {
                current: this.state.currentPage,
                max: this.state.maxPage,
                maxAllowed: maxAllowedPage,
                allPages: pageNumbers
            });
        });
    },

    // 取得當前頁碼
    getCurrentPageNumber() {
        const activeButton = document.querySelector('.paginate_button.current');
        if (!activeButton) {
            console.log('未找到活動頁碼，返回預設值 1');
            return 1;
        }

        const pageNum = parseInt(activeButton.textContent);
        console.log('當前頁碼:', pageNum);
        return isNaN(pageNum) ? 1 : pageNum;
    },

    // 切換自動翻頁狀態
    toggleAutoPaging() {
        this.state.isAutoPaging = !this.state.isAutoPaging;
        this.state.processingPage = false;  // 重置處理狀態
        const button = document.getElementById('auto-pagination-btn');
        
        if (this.state.isAutoPaging) {
            console.log('開始自動翻頁');
            button.textContent = '停止翻頁';
            button.style.backgroundColor = '#F44336';
            this.processNextPage();
        } else {
            console.log('停止自動翻頁');
            button.textContent = '自動翻頁';
            button.style.backgroundColor = '#2196F3';
        }
    },

    // 處理下一頁
    async processNextPage() {
        // 先檢查狀態
        if (!this.state.isAutoPaging) {
            console.log('自動翻頁已停止');
            return;
        }
    
        if (this.state.processingPage) {
            console.log('正在處理頁面，跳過此次處理');
            return;
        }
    
        // 標記開始處理
        this.state.processingPage = true;
    
        try {
            // 獲取設定
            const settings = await new Promise(resolve => {
                chrome.storage.sync.get({ maxPageCount: '5' }, resolve);
            });
            
            const maxAllowedPage = Math.min(parseInt(settings.maxPageCount), 10);
            
            // 更新當前頁面資訊
            this.updatePaginationInfo();
            console.log('當前頁碼狀態:', {
                currentPage: this.state.currentPage,
                maxAllowedPage: maxAllowedPage,
                isProcessing: this.state.processingPage
            });
    
            // 檢查是否達到最大頁數
            if (this.state.currentPage >= maxAllowedPage) {
                console.log(`已到達設定的最大頁數 (${maxAllowedPage} 頁)`);
                this.toggleAutoPaging();
                this.state.processingPage = false;
                return;
            }
    
            const nextButton = this.findNextPageButton();
            if (nextButton) {
                console.log('找到下一頁按鈕，點擊中...');
                nextButton.click();
                
                // 等待頁面載入
                await this.waitForPageLoad();
                
                // 處理頁面內容
                if (window.medicineProcessor || window.labProcessor) {
                    console.log('處理頁面內容...');
                    if (window.location.href.includes('IMUE0060')) {
                        if (window.labProcessor) {
                            await window.labProcessor.initialize();
                        }
                    } else {
                        const tables = window.inspectAllTables();
                        if (tables && tables.length > 0) {
                            tables.forEach(table => {
                                window.extractMedicineNames(table);
                            });
                        }
                    }
                }
    
                // 重置狀態並安排下一次處理
                this.state.processingPage = false;
                
                // 使用 setTimeout 來確保狀態已經被重置
                setTimeout(() => {
                    if (this.state.isAutoPaging) {
                        this.processNextPage();
                    }
                }, 1000);
            } else {
                console.log('未找到下一頁按鈕');
                this.toggleAutoPaging();
                this.state.processingPage = false;
            }
        } catch (error) {
            console.error('自動翻頁處理錯誤:', error);
            this.state.processingPage = false;
            this.toggleAutoPaging();
        }
    },

    // 尋找下一頁按鈕
    findNextPageButton() {
        const nextButton = document.querySelector('.paginate_button.next');
        if (nextButton && !nextButton.classList.contains('disabled')) {
            console.log('找到下一頁按鈕（Next）');
            return nextButton;
        }

        const nextPageNum = this.state.currentPage + 1;
        const pageButtons = document.querySelectorAll('.paginate_button');
        
        for (const button of pageButtons) {
            const pageNum = parseInt(button.textContent);
            if (pageNum === nextPageNum && !button.classList.contains('disabled') && !button.classList.contains('current')) {
                console.log('找到下一頁數字按鈕:', nextPageNum);
                return button;
            }
        }

        console.log('沒有找到可用的下一頁按鈕');
        return null;
    },

    // 等待頁面載入
    waitForPageLoad() {
        console.log('等待頁面載入...');
        return new Promise((resolve) => {
            const checkContent = (retries = 0, maxRetries = 10) => {
                if (retries >= maxRetries) {
                    console.log('等待頁面載入超時');
                    resolve();
                    return;
                }

                const tables = document.getElementsByTagName('table');
                const hasNewContent = Array.from(tables).some(table => {
                    return table.querySelector('tbody tr td') !== null;
                });

                if (hasNewContent) {
                    console.log('頁面內容已載入');
                    setTimeout(resolve, 500);
                } else {
                    console.log(`等待頁面載入... 重試次數: ${retries + 1}`);
                    setTimeout(() => checkContent(retries + 1), 500);
                }
            };

            checkContent();
        });
    }
};

// 將處理器掛載到 window 上
window.autoPagingHandler = autoPagingHandler;

// 觸發準備就緒事件
document.dispatchEvent(new Event('autoPagingReady'));