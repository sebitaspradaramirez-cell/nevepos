import { debounce } from '../lib/utils.js';

export class SearchBar {
    constructor(options) {
        this.placeholder = options.placeholder || 'Buscar...';
        this.onSearch = options.onSearch || (() => {});
        this.onClear = options.onClear || (() => {});
        this.debounceMs = options.debounceMs || 300;
        this.elementId = 'search-bar-' + Math.random().toString(36).substr(2, 9);
    }

    render() {
        const html = `
            <div class="search-bar-container" style="position: relative; display: inline-block; width: 100%;">
                <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #888;">🔍</span>
                <input type="text" id="${this.elementId}" placeholder="${this.placeholder}" 
                    style="width: 100%; padding: 10px 30px 10px 35px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 16px;">
                <button id="${this.elementId}-clear" 
                    style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #888; cursor: pointer; display: none;">✕</button>
            </div>
        `;

        setTimeout(() => this.attachEvents(), 0);
        return html;
    }

    attachEvents() {
        this.input = document.getElementById(this.elementId);
        this.clearBtn = document.getElementById(`${this.elementId}-clear`);

        if (!this.input || !this.clearBtn) return;

        const debouncedSearch = debounce((val) => {
            this.onSearch(val);
        }, this.debounceMs);

        this.input.addEventListener('input', (e) => {
            const val = e.target.value;
            this.clearBtn.style.display = val ? 'block' : 'none';
            debouncedSearch(val);
        });

        this.clearBtn.addEventListener('click', () => {
            this.clear();
        });
        
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value;
                this.onSearch(val, true); // true indicates it was an Enter press (useful for barcode scanner)
            }
        });
    }

    setValue(val) {
        if (this.input) {
            this.input.value = val;
            this.clearBtn.style.display = val ? 'block' : 'none';
        }
    }

    getValue() {
        return this.input ? this.input.value : '';
    }

    clear() {
        if (this.input) {
            this.input.value = '';
            this.clearBtn.style.display = 'none';
            this.onClear();
            this.onSearch('');
        }
    }

    focus() {
        if (this.input) {
            this.input.focus();
        }
    }
}
