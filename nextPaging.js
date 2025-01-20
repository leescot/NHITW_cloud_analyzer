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

    // 處理頁面跳轉
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
            
            // 在點擊前先移除所有現有的處理器
            if (window.medicineProcessor && window.medicineProcessor.cleanup) {
                window.medicineProcessor.cleanup();
            }
            if (window.labProcessor && window.labProcessor.cleanup) {
                window.labProcessor.cleanup();
            }
            if (window.imageProcessor && window.imageProcessor.cleanup) {
                window.imageProcessor.cleanup();
            }
            
            button.click();
            
            // 等待頁面載入
            await this.waitForPageLoad();
            
            // 重新初始化相應的處理器
            try {
                if (window.location.href.includes('IMUE0008')) {
                    await window.medicineProcessor.initialize();
                } else if (window.location.href.includes('IMUE0060')) {
                    await window.labProcessor.initialize();
                } else if (window.location.href.includes('IMUE0130')) {
                    await window.imageProcessor.handleButtonClick();
                }
            } catch (error) {
                console.error('處理器初始化失敗:', error);
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
        prevButton.textContent = '上一頁';
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
        nextButton.textContent = '下一頁';
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
        pageInfo.textContent = `(第${this.state.currentPage}頁/最大${this.state.maxPage}頁)`;

        // 組合控制元件
        controlsDiv.appendChild(prevButton);
        controlsDiv.appendChild(nextButton);
        controlsDiv.appendChild(pageInfo);

        return controlsDiv;
    }
};

// 將處理器掛載到 window 上
window.nextPagingHandler = nextPagingHandler;

// 觸發準備就緒事件
document.dispatchEvent(new Event('nextPagingReady'));