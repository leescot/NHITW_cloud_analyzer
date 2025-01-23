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
            }
        };
        this.config = { ...this.defaultConfig };
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