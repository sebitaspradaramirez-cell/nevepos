export class DataTable {
    constructor(options) {
        this.containerSelector = options.container;
        this.columns = options.columns || [];
        this.allData = options.data || [];
        this.filteredData = [...this.allData];
        this.pagination = options.pagination !== false;
        this.pageSize = options.pageSize || 20;
        this.currentPage = 1;
        this.searchable = options.searchable !== false;
        this.searchKeys = options.searchKeys || [];
        this.emptyMessage = options.emptyMessage || 'No se encontraron registros';
        this.onRowClick = options.onRowClick;
        
        this.sortCol = null;
        this.sortAsc = true;
        this.searchTerm = '';

        this.init();
    }

    init() {
        const container = document.querySelector(this.containerSelector);
        if (!container) return;

        let searchHtml = '';
        if (this.searchable) {
            searchHtml = `
                <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    <input type="text" id="dt-search-${this.containerSelector.replace('#','')}" placeholder="Buscar..." style="padding: 8px; width: 300px; border: 1px solid #ccc; border-radius: 4px;">
                </div>
            `;
        }

        container.innerHTML = `
            ${searchHtml}
            <div class="table-responsive" style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;" id="dt-table-${this.containerSelector.replace('#','')}">
                    <thead style="background-color: #f5f5f5; border-bottom: 2px solid #ddd;">
                        <tr>
                            ${this.columns.map((col, idx) => `
                                <th style="padding: 12px 15px; ${col.sortable ? 'cursor: pointer;' : ''}" data-idx="${idx}">
                                    ${col.label} <span class="sort-icon"></span>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody id="dt-tbody-${this.containerSelector.replace('#','')}"></tbody>
                </table>
            </div>
            ${this.pagination ? `<div id="dt-pagination-${this.containerSelector.replace('#','')}" style="margin-top: 15px; display: flex; justify-content: flex-end; align-items: center; gap: 10px;"></div>` : ''}
        `;

        this.bindEvents();
        this.refresh();
    }

    bindEvents() {
        const container = document.querySelector(this.containerSelector);
        if (!container) return;

        if (this.searchable) {
            const searchInput = container.querySelector(`#dt-search-${this.containerSelector.replace('#','')}`);
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.applyFiltersAndSort();
                this.refresh();
            });
        }

        const headers = container.querySelectorAll('th');
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const idx = th.getAttribute('data-idx');
                const col = this.columns[idx];
                if (col.sortable) {
                    if (this.sortCol === col.key) {
                        this.sortAsc = !this.sortAsc;
                    } else {
                        this.sortCol = col.key;
                        this.sortAsc = true;
                    }
                    this.applyFiltersAndSort();
                    this.refresh();
                }
            });
        });
    }

    setData(newData) {
        this.allData = newData;
        this.applyFiltersAndSort();
        this.refresh();
    }

    applyFiltersAndSort() {
        let data = [...this.allData];

        if (this.searchTerm && this.searchKeys.length > 0) {
            data = data.filter(row => {
                return this.searchKeys.some(key => {
                    const val = row[key];
                    return val != null && String(val).toLowerCase().includes(this.searchTerm);
                });
            });
        }

        if (this.sortCol) {
            data.sort((a, b) => {
                const valA = a[this.sortCol];
                const valB = b[this.sortCol];
                if (valA < valB) return this.sortAsc ? -1 : 1;
                if (valA > valB) return this.sortAsc ? 1 : -1;
                return 0;
            });
        }

        this.filteredData = data;
    }

    refresh() {
        const container = document.querySelector(this.containerSelector);
        if (!container) return;

        const tbody = container.querySelector('tbody');
        const pagination = container.querySelector(`#dt-pagination-${this.containerSelector.replace('#','')}`);
        
        let displayData = this.filteredData;
        const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        
        if (this.pagination) {
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            displayData = this.filteredData.slice(start, end);
        }

        if (displayData.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${this.columns.length}" style="text-align: center; padding: 20px; color: #777;">${this.emptyMessage}</td></tr>`;
        } else {
            tbody.innerHTML = displayData.map((row, rowIndex) => {
                return `<tr style="border-bottom: 1px solid #ddd; ${this.onRowClick ? 'cursor:pointer; hover:background:#f9f9f9;' : ''}" data-rowidx="${rowIndex}">
                    ${this.columns.map(col => {
                        let val = row[col.key];
                        if (col.format) val = col.format(val, row);
                        if (col.render) val = col.render(row);
                        return `<td style="padding: 12px 15px;">${val == null ? '' : val}</td>`;
                    }).join('')}
                </tr>`;
            }).join('');

            if (this.onRowClick) {
                tbody.querySelectorAll('tr').forEach(tr => {
                    tr.addEventListener('click', (e) => {
                        if (e.target.tagName.toLowerCase() !== 'button') {
                            const idx = tr.getAttribute('data-rowidx');
                            this.onRowClick(displayData[idx]);
                        }
                    });
                });
            }
        }

        const headers = container.querySelectorAll('th');
        headers.forEach(th => {
            const idx = th.getAttribute('data-idx');
            const col = this.columns[idx];
            const icon = th.querySelector('.sort-icon');
            if (icon) icon.innerHTML = '';
            if (col.sortable && this.sortCol === col.key) {
                icon.innerHTML = this.sortAsc ? '▲' : '▼';
            }
        });

        if (this.pagination && pagination) {
            pagination.innerHTML = `
                <span>Página ${this.currentPage} de ${totalPages || 1}</span>
                <button class="btn btn-secondary" style="padding: 4px 8px;" id="dt-prev-${this.containerSelector.replace('#','')}" ${this.currentPage === 1 ? 'disabled' : ''}>Anterior</button>
                <button class="btn btn-secondary" style="padding: 4px 8px;" id="dt-next-${this.containerSelector.replace('#','')}" ${this.currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
            `;

            const prevBtn = pagination.querySelector(`#dt-prev-${this.containerSelector.replace('#','')}`);
            const nextBtn = pagination.querySelector(`#dt-next-${this.containerSelector.replace('#','')}`);

            if (prevBtn) prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.refresh();
                }
            });

            if (nextBtn) nextBtn.addEventListener('click', () => {
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.refresh();
                }
            });
        }
    }
}
