console.log('載入分頁處理模組');

const nextPagingHandler = {
    // 儲存頁面狀態
    state: {
        currentPage: 1,
        maxPage: 1
    },

    // 更新分頁資訊
    updatePaginationInfo() {
        const pageButtons = Array.from(document.querySelectorAll('.paginate_button'));
        
        if (!pageButtons.length) {
            console.log('沒有找到分頁按鈕');
            return false;
        }

        // 計算最大頁數
        const pageNumbers = pageButtons
            .map(button => parseInt(button.textContent))
            .filter(num => !isNaN(num));

        const newCurrentPage = this.getCurrentPageNumber();
        const newMaxPage = Math.max(...pageNumbers, 1);

        // 只有當頁碼有變化時才更新並輸出日誌
        if (this.state.currentPage !== newCurrentPage || this.state.maxPage !== newMaxPage) {
            this.state.currentPage = newCurrentPage;
            this.state.maxPage = newMaxPage;
            
            console.log('更新頁面資訊:', {
                current: this.state.currentPage,
                max: this.state.maxPage
            });
        }

        return true;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // 取得當前頁碼
    getCurrentPageNumber() {
        const activeButton = document.querySelector('.paginate_button.current');
        if (!activeButton) return 1;
        const pageNum = parseInt(activeButton.textContent);
        return isNaN(pageNum) ? 1 : pageNum;
    },

    // 檢查是否有下一頁
    hasNextPage() {
        return this.state.currentPage < this.state.maxPage;
    },

    // 檢查是否有上一頁
    hasPrevPage() {
        return this.state.currentPage > 1;
    },

    setupPageChangeListener() {
        let lastProcessedState = '';
        
        const debouncedUpdate = this.debounce(() => {
            // 檢查分頁狀態是否真的改變
            const currentState = `${this.getCurrentPageNumber()}_${this.state.maxPage}`;
            if (lastProcessedState === currentState) {
                console.log('分頁狀態未改變，跳過更新');
                return;
            }
            
            if (this.updatePaginationInfo()) {
                const titleElement = document.querySelector('#medicine-names-list h3');
                if (titleElement && window.autoPagingHandler) {
                    window.autoPagingHandler.checkAndAddButton(titleElement);
                    lastProcessedState = currentState;
                }
            }
        }, 500);
    
        // 找到分頁控制區域
        const paginationContainer = document.querySelector('.dataTables_paginate');
        if (!paginationContainer) {
            console.log('未找到分頁控制區域');
            return null;
        }
    
        // 只觀察分頁控制區域
        const observer = new MutationObserver((mutations) => {
            // 檢查是否有相關變化
            const hasRelevantChanges = mutations.some(mutation => {
                return mutation.type === 'childList' || 
                       (mutation.type === 'attributes' && mutation.attributeName === 'class');
            });
    
            if (hasRelevantChanges) {
                debouncedUpdate();
            }
        });
    
        observer.observe(paginationContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
            characterData: false
        });
        
        return observer;
    },
    
    async handlePageChange(isNext) {
        if (isNext && !this.hasNextPage()) {
            console.log('已經是最後一頁');
            return;
        }
        if (!isNext && !this.hasPrevPage()) {
            console.log('已經是第一頁');
            return;
        }

        const button = isNext ? this.findNextPageButton() : this.findPrevPageButton();
        if (button) {
            console.log(isNext ? '點擊下一頁按鈕' : '點擊上一頁按鈕');
            
            // 檢查是否正在執行自動翻頁（同時檢查藥物和檢驗處理器）
            const isLabAutoPaging = window.labProcessor && window.labProcessor.state?.isProcessing;
            const isMedAutoPaging = window.autoPagingHandler && window.autoPagingHandler.state?.isProcessing;

            // 只有在非自動翻頁時才清理資料
            if (!isLabAutoPaging && !isMedAutoPaging) {
                if (window.labProcessor && window.labProcessor.cleanup) {
                    window.labProcessor.cleanup();
                }
                if (window.medicineProcessor && window.medicineProcessor.cleanup) {
                    window.medicineProcessor.cleanup();
                }
                if (window.imageProcessor && window.imageProcessor.cleanup) {
                    window.imageProcessor.cleanup();
                }
            }
            
            button.click();
            
            // 等待頁面載入
            await this.waitForPageLoad();
            
            // 更新頁面資訊
            this.updatePaginationInfo();
            
            // 只在非自動翻頁模式下重新初始化處理器
            if (!isLabAutoPaging && !isMedAutoPaging) {
                try {
                    const currentUrl = window.location.href;
                    if (currentUrl.includes('IMUE0060')) {
                        await window.labProcessor.initialize();
                    } else if (currentUrl.includes('IMUE0130')) {
                        await window.imageProcessor.handleButtonClick();
                    } else if (currentUrl.includes('IMUE0008')) {
                        await window.medicineProcessor.initialize();
                    }
                } catch (error) {
                    console.error('處理器初始化失敗:', error);
                }
            }
        }
    },

    // 尋找下一頁按鈕
    findNextPageButton() {
        const nextButton = document.querySelector('.paginate_button.next');
        if (nextButton && !nextButton.classList.contains('disabled')) {
            return nextButton;
        }

        const nextPageNum = this.state.currentPage + 1;
        const pageButtons = document.querySelectorAll('.paginate_button');
        
        for (const button of pageButtons) {
            const pageNum = parseInt(button.textContent);
            if (pageNum === nextPageNum && !button.classList.contains('disabled') && !button.classList.contains('current')) {
                return button;
            }
        }

        return null;
    },

    // 尋找上一頁按鈕
    findPrevPageButton() {
        const prevButton = document.querySelector('.paginate_button.previous');
        if (prevButton && !prevButton.classList.contains('disabled')) {
            return prevButton;
        }

        const prevPageNum = this.state.currentPage - 1;
        const pageButtons = document.querySelectorAll('.paginate_button');
        
        for (const button of pageButtons) {
            const pageNum = parseInt(button.textContent);
            if (pageNum === prevPageNum && !button.classList.contains('disabled') && !button.classList.contains('current')) {
                return button;
            }
        }

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
    },

    // 創建分頁控制區域
    createPagingControls() {
        // 先更新一次分頁資訊
        this.updatePaginationInfo();

        const controlsDiv = document.createElement('div');
        controlsDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        // 建立上一頁按鈕
        const prevButton = document.createElement('button');
        prevButton.textContent = '上頁';
        const canPrev = this.hasPrevPage();
        prevButton.style.cssText = `
            background-color: ${canPrev ? '#2196F3' : '#ccc'};
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            cursor: ${canPrev ? 'pointer' : 'not-allowed'};
            font-size: 14px;
        `;
        if (canPrev) {
            prevButton.onclick = () => this.handlePageChange(false);
        }

        // 建立下一頁按鈕
        const nextButton = document.createElement('button');
        nextButton.textContent = '下頁';
        const canNext = this.hasNextPage();
        nextButton.style.cssText = `
            background-color: ${canNext ? '#2196F3' : '#ccc'};
            color: white;
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            cursor: ${canNext ? 'pointer' : 'not-allowed'};
            font-size: 14px;
        `;
        if (canNext) {
            nextButton.onclick = () => this.handlePageChange(true);
        }

        // 建立頁碼顯示
        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = `
            color: #666;
            font-size: 14px;
        `;
        pageInfo.textContent = `(第${this.state.currentPage}/${this.state.maxPage}頁)`;

        // 組合控制元件
        controlsDiv.appendChild(prevButton);
        controlsDiv.appendChild(nextButton);
        controlsDiv.appendChild(pageInfo);

        return controlsDiv;
    },

    initialize() {
        const observer = this.setupPageChangeListener();
        if (observer) {
            console.log('分頁監聽器已設置');
        } else {
            console.log('分頁監聽器設置失敗，可能找不到分頁控制區域');
        }
    }
};

// 將處理器掛載到 window 上
window.nextPagingHandler = nextPagingHandler;

// 初始化
nextPagingHandler.initialize();

// 觸發準備就緒事件
document.dispatchEvent(new Event('nextPagingReady'));