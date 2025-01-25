// labTableConfig.js
class LabTableConfigManager {
    constructor() {
        this.defaultConfig = {
            priorityCodes: [],
            specialItems: {
                '06012C': {
                    displayMode: 'all',
                    partialItems: []
                },
                '08011C': {
                    displayMode: 'all',
                    partialItems: []
                },
                '08013C': {
                    displayMode: 'all',
                    partialItems: []
                }
            },
            // 新增醫令代碼名稱對照設定
            nameMappings: {}  // 格式: { "09025C": "GOT" }
        };
        this.config = { ...this.defaultConfig };
    }

    // 新增名稱對照相關方法
    async addNameMapping(code, name) {
        if (!code || !name) return false;
        
        const normalizedCode = code.trim().toUpperCase();
        const normalizedName = name.trim();
        
        // 檢查是否為多項目的醫令代碼
        if (['08011C', '08013C', '06012C'].includes(normalizedCode)) {
            console.warn('不可設定多項目醫令代碼的名稱對照');
            return false;
        }
        
        this.config.nameMappings[normalizedCode] = normalizedName;
        await this.saveConfig(this.config);
        return true;
    }

    async removeNameMapping(code) {
        const normalizedCode = code.trim().toUpperCase();
        if (this.config.nameMappings[normalizedCode]) {
            delete this.config.nameMappings[normalizedCode];
            await this.saveConfig(this.config);
            return true;
        }
        return false;
    }

    // 取得名稱對照
    getDisplayName(code, originalName) {
        const normalizedCode = code.trim().toUpperCase();
        return this.config.nameMappings[normalizedCode] || originalName;
    }

    async loadConfig() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.sync.get({
                    labTableConfig: this.defaultConfig,
                    enableLabGrouping: false
                }, resolve);
            });
            
            this.config = result.labTableConfig;
            return {
                config: this.config,
                enabled: result.enableLabGrouping
            };
        } catch (error) {
            console.error('載入檢驗表格設定失敗:', error);
            return {
                config: this.defaultConfig,
                enabled: false
            };
        }
    }

    async saveConfig(newConfig) {
        try {
            await new Promise(resolve => {
                chrome.storage.sync.set({ labTableConfig: newConfig }, resolve);
            });
            this.config = newConfig;
            return true;
        } catch (error) {
            console.error('儲存檢驗表格設定失敗:', error);
            return false;
        }
    }

    // Priority codes management
    async addPriorityCode(code) {
        if (this.config.priorityCodes.length >= 20) {
            return false;
        }
        
        const normalizedCode = code.trim().toUpperCase();
        if (!normalizedCode || this.config.priorityCodes.includes(normalizedCode)) {
            return false;
        }

        this.config.priorityCodes.push(normalizedCode);
        await this.saveConfig(this.config);
        return true;
    }

    async removePriorityCode(code) {
        this.config.priorityCodes = this.config.priorityCodes.filter(c => c !== code);
        await this.saveConfig(this.config);
        return true;
    }

    async movePriorityCode(code, direction) {
        const index = this.config.priorityCodes.indexOf(code);
        if (index === -1) return false;

        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= this.config.priorityCodes.length) return false;

        const codes = [...this.config.priorityCodes];
        [codes[index], codes[newIndex]] = [codes[newIndex], codes[index]];
        this.config.priorityCodes = codes;
        await this.saveConfig(this.config);
        return true;
    }

    // Special items management
    async updateSpecialItemConfig(itemCode, displayMode, partialItems = []) {
        if (!this.config.specialItems[itemCode]) return false;

        this.config.specialItems[itemCode] = {
            displayMode,
            partialItems: displayMode === 'partial' ? partialItems : []
        };

        await this.saveConfig(this.config);
        return true;
    }

    async addPartialItem(itemCode, item) {
        if (!this.config.specialItems[itemCode]) return false;

        const normalizedItem = item.trim();
        if (!normalizedItem) return false;

        if (!this.config.specialItems[itemCode].partialItems.includes(normalizedItem)) {
            this.config.specialItems[itemCode].partialItems.push(normalizedItem);
            await this.saveConfig(this.config);
        }
        return true;
    }

    async removePartialItem(itemCode, item) {
        if (!this.config.specialItems[itemCode]) return false;

        this.config.specialItems[itemCode].partialItems = 
            this.config.specialItems[itemCode].partialItems.filter(i => i !== item);
        await this.saveConfig(this.config);
        return true;
    }
}

// Initialize the manager
window.labTableConfigManager = new LabTableConfigManager();

// Trigger ready event
document.dispatchEvent(new Event('labTableConfigManagerReady'));

window.labTableConfigManager.updatePriorityOrder = async function(newOrder) {
    const config = await this.loadConfig();
    config.priorityCodes = newOrder;
    await this.saveConfig(config);
};