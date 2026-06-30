sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "ze4/co/s/cost/ze4coscost/util/ReportExport"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, History, MessageBox, SelectDialog, StandardListItem, ReportExport) => {
    "use strict";

    return Controller.extend("ze4.co.s.cost.ze4coscost.controller.StandardCost", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("RouteStandardCost").attachPatternMatched(this._onRouteMatched, this);
            
            // Initialize local model with default filter values
            const oModel = new JSONModel({
                filters: {
                    gjahr: new Date().getFullYear(),
                    monat: String(new Date().getMonth() + 1).padStart(2, '0'),
                    matnr: "",
                    maktx: "",
                    mtart: "",
                    matkl: ""
                },
                costData: [],
                tableVisibleRowCount: 8,
                materialValueHelpRows: [],
                materialTypes: [],
                materialTypesLoaded: false,
                materialGroups: [],
                materialGroupsLoaded: false
            });
            this.getView().setModel(oModel, "view");
            this._fnResizeTable = this._updateTableVisibleRowCount.bind(this);
            window.addEventListener("resize", this._fnResizeTable);
            
            // Load initial data
            this._loadCostData();
        },

        onAfterRendering() {
            this._updateTableVisibleRowCount();
        },

        onExit() {
            if (this._fnResizeTable) {
                window.removeEventListener("resize", this._fnResizeTable);
            }
        },

        _onRouteMatched() {
            this._loadCostData();
        },

        _loadCostData() {
            const oModel = this.getOwnerComponent().getModel();
            const oViewModel = this.getView().getModel("view");
            const filters = oViewModel.getProperty("/filters");

            const sYear = String(filters.gjahr || "").trim();
            const sMonth = String(filters.monat || "").trim().padStart(2, "0");

            if (!/^\d{4}$/.test(sYear)) {
                MessageBox.warning("연도는 4자리 숫자로 입력해주세요.");
                return;
            }

            if (!/^(0[1-9]|1[0-2])$/.test(sMonth)) {
                MessageBox.warning("월은 01부터 12까지 입력해주세요.");
                return;
            }

            oViewModel.setProperty("/filters/gjahr", sYear);
            oViewModel.setProperty("/filters/monat", sMonth);

            const aFilters = [
                new Filter("gjahr", FilterOperator.EQ, sYear),
                new Filter("monat", FilterOperator.EQ, sMonth)
            ];

            if (filters.matnr && String(filters.matnr).trim()) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, String(filters.matnr).trim().toUpperCase()));
            }
            if (filters.maktx && String(filters.maktx).trim()) {
                aFilters.push(new Filter("maktx", FilterOperator.Contains, String(filters.maktx).trim()));
            }
            if (filters.mtart && String(filters.mtart).trim()) {
                aFilters.push(new Filter("mtart", FilterOperator.Contains, String(filters.mtart).trim().toUpperCase()));
            }
            if (filters.matkl && String(filters.matkl).trim()) {
                aFilters.push(new Filter("matkl", FilterOperator.Contains, String(filters.matkl).trim().toUpperCase()));
            }

            oModel.read("/zcds_e4_co_0010", {
                filters: aFilters,
                urlParameters: {
                    $orderby: "mtart asc,matnr asc,mtopt asc"
                },
                success: (oData) => {
                    oViewModel.setProperty("/costData", oData.results || []);
                    setTimeout(() => this._updateTableVisibleRowCount(), 0);
                },
                error: (oError) => {
                    MessageBox.error("데이터 조회 실패");
                    console.error("Data load error:", oError);
                }
            });
        },

        onSearch() {
            this._loadCostData();
        },

        _updateTableVisibleRowCount() {
            const oTable = this.byId("costSummaryTable");
            const oViewModel = this.getView().getModel("view");

            if (!oTable || !oViewModel) {
                return;
            }

            const oTableDom = oTable.getDomRef();
            if (!oTableDom) {
                return;
            }

            const oFooterDom = this.getView().getDomRef() && this.getView().getDomRef().querySelector(".tableFooter");
            const iFooterHeight = oFooterDom ? oFooterDom.getBoundingClientRect().height : 48;
            const iViewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const iTableTop = oTableDom.getBoundingClientRect().top;
            const iBottomPadding = 24;
            const iHeaderHeight = 78;
            const iRowHeight = 40;
            const iAvailableRowHeight = iViewportHeight - iTableTop - iFooterHeight - iBottomPadding - iHeaderHeight;
            const iRowCount = Math.max(8, Math.floor(iAvailableRowHeight / iRowHeight));

            if (oViewModel.getProperty("/tableVisibleRowCount") !== iRowCount) {
                oViewModel.setProperty("/tableVisibleRowCount", iRowCount);
            }
        },

        onResetFilters() {
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/filters", {
                gjahr: new Date().getFullYear(),
                monat: String(new Date().getMonth() + 1).padStart(2, '0'),
                matnr: "",
                maktx: "",
                mtart: "",
                matkl: ""
            });
            this._loadCostData();
        },

        onRowSelectionChange(oEvent) {
            if (oEvent.getParameter("userInteraction") === false) {
                return;
            }

            const oTable = this.byId("costSummaryTable");
            const iIndex = oEvent.getParameter("rowIndex");
            
            if (iIndex >= 0) {
                const oContext = oTable.getContextByIndex(iIndex);
                this._navToDetail(oContext);
            }
        },

        onOpenDetail(oEvent) {
            this._navToDetail(oEvent.getSource().getBindingContext("view"));
        },

        onOpenVarianceOverview() {
            this._navToVarianceOverview();
        },

        onOpenVarianceAnalysis(oEvent) {
            this._navToVarianceDetail(oEvent.getSource().getBindingContext("view"));
        },

        onMaterialValueHelp() {
            const oDialog = this._getMaterialValueHelpDialog();

            this._loadMaterialValueHelpRows().then(() => {
                oDialog.open();
            }).catch(() => {});
        },

        onMtartValueHelp() {
            this._getMtartValueHelpDialog();
            this._loadMaterialTypes().then(() => {
                this._oMtartValueHelpDialog.open();
            }).catch(() => {});
        },

        onMatklValueHelp() {
            this._getMatklValueHelpDialog();
            this._loadMaterialGroups().then(() => {
                this._oMatklValueHelpDialog.open();
            }).catch(() => {});
        },

        onExportExcel() {
            this.onExportToExcel();
        },

        onExportPdf() {
            this.onExportToPdf();
        },

        onExportToExcel() {
            ReportExport.exportExcel(this._buildExportReport(), this.getView());
        },

        onExportToPdf() {
            ReportExport.printPdf(this._buildExportReport(), this.getView());
        },

        _buildExportReport() {
            const oViewModel = this.getView().getModel("view");
            const oFilters = oViewModel.getProperty("/filters") || {};
            const aData = (oViewModel.getProperty("/costData") || []).map((oItem) => Object.assign({}, oItem, this._getStockExportValues(oItem)));

            return {
                title: "[EverNiture-CO] 표준원가 정보",
                fileName: "StandardCostReport",
                variant: "standard",
                description: "현재 조회조건으로 로드된 표준원가 목록 리포트",
                filters: ReportExport.labelRows(oFilters, [
                    { label: "회사코드", property: "bukrs" },
                    { label: "회계연도", property: "gjahr" },
                    { label: "월", property: "monat" },
                    { label: "제품번호", property: "matnr" },
                    { label: "제품명", property: "maktx" },
                    { label: "제품유형", property: "mtart" },
                    { label: "제품그룹", property: "matkl" }
                ]),
                summary: [
                    { label: "조회 건수", value: aData.length + "건" }
                ],
                sections: [
                    ReportExport.section("표준원가 목록", aData, [
                        { label: "제품번호", property: "matnr" },
                        { label: "제품명", property: "maktx" },
                        { label: "옵션", property: "mtopt" },
                        { label: "옵션명", property: "mtopt_t" },
                        { label: "제품유형", property: "mtart" },
                        { label: "제품그룹", property: "matkl" },
                        { label: "총 표준원가", rawProperty: "total_cost", value: (oRow) => this.formatAmount(oRow.total_cost), type: "amount", total: true, width: 16 },
                        { label: "통화", property: "waers" },
                        { label: "실시간 재고 현황", property: "stock_status" },
                        { label: "단위", property: "display_meins" }
                    ])
                ]
            };
        },

        formatAmount(vValue) {
            return this._formatNumber(vValue, 0);
        },

        formatQuantity(vValue) {
            return this._formatNumber(vValue, 3);
        },

        isDefaultOption(sMtopt) {
            return String(sMtopt || "").trim().toUpperCase() === "OP00";
        },

        isCustomOption(sMtopt) {
            return !this.isDefaultOption(sMtopt);
        },

        formatStockStatus(sMtopt, vClabs, vVerme, vCspem, vResme) {
            if (!this.isDefaultOption(sMtopt)) {
                return this._getText("customOrderStockMessage");
            }

            return [
                `${this._getText("colAvailStock")} ${this.formatQuantity(vClabs)}`,
                `${this._getText("colInspection")} ${this.formatQuantity(vVerme)}`,
                `${this._getText("colHoldStock")} ${this.formatQuantity(vCspem)}`,
                `${this._getText("colReservation")} ${this.formatQuantity(vResme)}`
            ].join(" / ");
        },

        formatResultCount(aRows) {
            const iCount = Array.isArray(aRows) ? aRows.length : 0;
            return `${iCount}건`;
        },

        formatResultCountNumber(aRows) {
            const iCount = Array.isArray(aRows) ? aRows.length : 0;
            return this._formatNumber(iCount, 0);
        },

        formatTotalActualStock(aRows) {
            return this._formatStockTotal(aRows, "total_clabs");
        },

        formatTotalAvailableStock(aRows) {
            return this._formatStockTotal(aRows, "total_verme");
        },

        formatTotalInspectionStock(aRows) {
            return this._formatStockTotal(aRows, "total_cspem");
        },

        formatTotalReservedStock(aRows) {
            return this._formatStockTotal(aRows, "total_resme");
        },

        _getStockExportValues(oItem) {
            return {
                stock_status: this.formatStockStatus(
                    oItem.mtopt,
                    oItem.total_clabs,
                    oItem.total_verme,
                    oItem.total_cspem,
                    oItem.total_resme
                ),
                display_meins: this.isDefaultOption(oItem.mtopt) ? oItem.meins : ""
            };
        },

        _formatStockTotal(aRows, sProperty) {
            const fTotal = (Array.isArray(aRows) ? aRows : []).reduce((fSum, oItem) => {
                if (!this.isDefaultOption(oItem.mtopt)) {
                    return fSum;
                }

                const fValue = Number(oItem[sProperty]);
                return Number.isNaN(fValue) ? fSum : fSum + fValue;
            }, 0);

            return this.formatQuantity(fTotal);
        },

        _formatNumber(vValue, iMaximumFractionDigits) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return "0";
            }

            const fValue = Number(vValue);
            if (Number.isNaN(fValue)) {
                return String(vValue);
            }

            return new Intl.NumberFormat("ko-KR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: iMaximumFractionDigits
            }).format(fValue);
        },

        _escapeHtml(vValue) {
            return String(vValue ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        },

        _getMaterialValueHelpDialog() {
            if (this._oMaterialValueHelpDialog) {
                return this._oMaterialValueHelpDialog;
            }

            this._oMaterialValueHelpDialog = new SelectDialog({
                title: this._getText("materialHelpTitle"),
                noDataText: this._getText("materialHelpNoData"),
                search: this._onMaterialValueHelpSearch.bind(this),
                liveChange: this._onMaterialValueHelpSearch.bind(this),
                confirm: this._onMaterialValueHelpConfirm.bind(this),
                cancel: this._clearMaterialValueHelpSearch.bind(this),
                items: {
                    path: "view>/materialValueHelpRows",
                    template: new StandardListItem({
                        title: "{view>matnr}",
                        description: "{view>maktx}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMaterialValueHelpDialog);
            return this._oMaterialValueHelpDialog;
        },

        _getMtartValueHelpDialog() {
            if (this._oMtartValueHelpDialog) {
                return this._oMtartValueHelpDialog;
            }

            this._oMtartValueHelpDialog = new SelectDialog({
                title: this._getText("mtartHelpTitle"),
                noDataText: this._getText("mtartHelpNoData"),
                search: this._onMtartValueHelpSearch.bind(this),
                liveChange: this._onMtartValueHelpSearch.bind(this),
                confirm: this._onMtartValueHelpConfirm.bind(this),
                cancel: this._clearMtartValueHelpSearch.bind(this),
                items: {
                    path: "view>/materialTypes",
                    template: new StandardListItem({
                        title: "{view>mtart}",
                        description: "{view>mtbez}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMtartValueHelpDialog);
            return this._oMtartValueHelpDialog;
        },

        _getMatklValueHelpDialog() {
            if (this._oMatklValueHelpDialog) {
                return this._oMatklValueHelpDialog;
            }

            this._oMatklValueHelpDialog = new SelectDialog({
                title: this._getText("matklHelpTitle"),
                noDataText: this._getText("matklHelpNoData"),
                search: this._onMatklValueHelpSearch.bind(this),
                liveChange: this._onMatklValueHelpSearch.bind(this),
                confirm: this._onMatklValueHelpConfirm.bind(this),
                cancel: this._clearMatklValueHelpSearch.bind(this),
                items: {
                    path: "view>/materialGroups",
                    template: new StandardListItem({
                        title: "{view>matkl}",
                        description: "{view>wgbez}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMatklValueHelpDialog);
            return this._oMatklValueHelpDialog;
        },

        _loadMaterialValueHelpRows() {
            const oViewModel = this.getView().getModel("view");
            const oFilters = oViewModel.getProperty("/filters") || {};
            const sYear = String(oFilters.gjahr || "").trim();
            const sMonth = String(oFilters.monat || "").trim().padStart(2, "0");

            if (!/^\d{4}$/.test(sYear)) {
                MessageBox.warning("연도는 4자리 숫자로 입력해주세요.");
                return Promise.reject(new Error("Invalid year"));
            }

            if (!/^(0[1-9]|1[0-2])$/.test(sMonth)) {
                MessageBox.warning("월은 01부터 12까지 입력해주세요.");
                return Promise.reject(new Error("Invalid month"));
            }

            const aFilters = [
                new Filter("gjahr", FilterOperator.EQ, sYear),
                new Filter("monat", FilterOperator.EQ, sMonth)
            ];

            if (oFilters.maktx && String(oFilters.maktx).trim()) {
                aFilters.push(new Filter("maktx", FilterOperator.Contains, String(oFilters.maktx).trim()));
            }

            if (oFilters.mtart && String(oFilters.mtart).trim()) {
                aFilters.push(new Filter("mtart", FilterOperator.Contains, String(oFilters.mtart).trim().toUpperCase()));
            }

            if (oFilters.matkl && String(oFilters.matkl).trim()) {
                aFilters.push(new Filter("matkl", FilterOperator.Contains, String(oFilters.matkl).trim().toUpperCase()));
            }

            oViewModel.setProperty("/filters/gjahr", sYear);
            oViewModel.setProperty("/filters/monat", sMonth);

            return new Promise((resolve, reject) => {
                this.getOwnerComponent().getModel().read("/zcds_e4_co_0010", {
                    filters: aFilters,
                    urlParameters: {
                        $select: "matnr,maktx",
                        $orderby: "matnr",
                        $top: "5000"
                    },
                    success: (oData) => {
                        const aMaterials = this._dedupeByKey(oData.results || [], "matnr", (oItem, sKey) => ({
                            matnr: sKey,
                            maktx: String(oItem.maktx || "").trim()
                        }));

                        oViewModel.setProperty("/materialValueHelpRows", aMaterials);
                        resolve();
                    },
                    error: (oError) => {
                        MessageBox.error(this._getText("materialHelpLoadError"));
                        console.error("Material value help load error:", oError);
                        reject(oError);
                    }
                });
            });
        },

        _loadMaterialTypes() {
            const oViewModel = this.getView().getModel("view");
            if (oViewModel.getProperty("/materialTypesLoaded")) {
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                this._getMaterialTypeService().read("/zcds_e4_mm_0007", {
                    urlParameters: {
                        $select: "mtart,mtbez",
                        $orderby: "mtart",
                        $top: "5000"
                    },
                    success: (oData) => {
                        oViewModel.setProperty("/materialTypes", oData.results || []);
                        oViewModel.setProperty("/materialTypesLoaded", true);
                        resolve();
                    },
                    error: (oError) => {
                        console.warn("Material type master service unavailable. Falling back to cost service data.", oError);
                        this._loadMaterialTypesFromCostData().then(resolve).catch((oFallbackError) => {
                            MessageBox.error(this._getText("mtartHelpLoadError"));
                            console.error("Material type value help fallback load error:", oFallbackError);
                            reject(oFallbackError);
                        });
                    }
                });
            });
        },

        _loadMaterialGroups() {
            const oViewModel = this.getView().getModel("view");
            if (oViewModel.getProperty("/materialGroupsLoaded")) {
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                this._getMaterialGroupService().read("/zcds_e4_mm_0008", {
                    urlParameters: {
                        $select: "matkl,wgbez,bezei",
                        $orderby: "matkl",
                        $top: "5000"
                    },
                    success: (oData) => {
                        oViewModel.setProperty("/materialGroups", oData.results || []);
                        oViewModel.setProperty("/materialGroupsLoaded", true);
                        resolve();
                    },
                    error: (oError) => {
                        console.warn("Material group master service unavailable. Falling back to cost service data.", oError);
                        this._loadMaterialGroupsFromCostData().then(resolve).catch((oFallbackError) => {
                            MessageBox.error(this._getText("matklHelpLoadError"));
                            console.error("Material group value help fallback load error:", oFallbackError);
                            reject(oFallbackError);
                        });
                    }
                });
            });
        },

        _getMaterialTypeService() {
            if (!this._oMaterialTypeService) {
                this._oMaterialTypeService = new ODataModel("/sap/opu/odata/sap/ZCDS_E4_MM_0007_CDS/", {
                    defaultBindingMode: "None",
                    useBatch: false
                });
            }

            return this._oMaterialTypeService;
        },

        _getMaterialGroupService() {
            if (!this._oMaterialGroupService) {
                this._oMaterialGroupService = new ODataModel("/sap/opu/odata/sap/ZCDS_E4_MM_0008_CDS/", {
                    defaultBindingMode: "None",
                    useBatch: false
                });
            }

            return this._oMaterialGroupService;
        },

        _loadMaterialTypesFromCostData() {
            const oViewModel = this.getView().getModel("view");

            return new Promise((resolve, reject) => {
                this.getOwnerComponent().getModel().read("/zcds_e4_co_0010", {
                    urlParameters: {
                        $select: "mtart,mtbez",
                        $orderby: "mtart",
                        $top: "5000"
                    },
                    success: (oData) => {
                        const aTypes = this._dedupeByKey(oData.results || [], "mtart", (oItem, sKey) => ({
                            mtart: sKey,
                            mtbez: String(oItem.mtbez || "").trim()
                        }));

                        oViewModel.setProperty("/materialTypes", aTypes);
                        oViewModel.setProperty("/materialTypesLoaded", true);
                        resolve();
                    },
                    error: reject
                });
            });
        },

        _loadMaterialGroupsFromCostData() {
            const oViewModel = this.getView().getModel("view");

            return new Promise((resolve, reject) => {
                this.getOwnerComponent().getModel().read("/zcds_e4_co_0010", {
                    urlParameters: {
                        $select: "matkl,wgbez",
                        $orderby: "matkl",
                        $top: "5000"
                    },
                    success: (oData) => {
                        const aGroups = this._dedupeByKey(oData.results || [], "matkl", (oItem, sKey) => ({
                            matkl: sKey,
                            wgbez: String(oItem.wgbez || "").trim(),
                            bezei: ""
                        }));

                        oViewModel.setProperty("/materialGroups", aGroups);
                        oViewModel.setProperty("/materialGroupsLoaded", true);
                        resolve();
                    },
                    error: reject
                });
            });
        },

        _dedupeByKey(aRows, sKeyProperty, fnMap) {
            const mSeen = {};

            return aRows.reduce((aResult, oItem) => {
                const sKey = String(oItem[sKeyProperty] || "").trim();
                if (!sKey || mSeen[sKey]) {
                    return aResult;
                }

                mSeen[sKey] = true;
                aResult.push(fnMap(oItem, sKey));
                return aResult;
            }, []);
        },

        _onMaterialValueHelpSearch(oEvent) {
            const sValue = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");
            const aFilters = sValue ? [
                new Filter({
                    filters: [
                        new Filter("matnr", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("maktx", FilterOperator.Contains, sValue)
                    ],
                    and: false
                })
            ] : [];

            oBinding.filter(aFilters);
        },

        _onMtartValueHelpSearch(oEvent) {
            const sValue = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");
            const aFilters = sValue ? [
                new Filter({
                    filters: [
                        new Filter("mtart", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("mtbez", FilterOperator.Contains, sValue)
                    ],
                    and: false
                })
            ] : [];

            oBinding.filter(aFilters);
        },

        _onMatklValueHelpSearch(oEvent) {
            const sValue = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");
            const aFilters = sValue ? [
                new Filter({
                    filters: [
                        new Filter("matkl", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("wgbez", FilterOperator.Contains, sValue),
                        new Filter("bezei", FilterOperator.Contains, sValue)
                    ],
                    and: false
                })
            ] : [];

            oBinding.filter(aFilters);
        },

        _onMaterialValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                return;
            }

            this.getView().getModel("view").setProperty("/filters/matnr", oSelectedItem.getTitle());
            this._clearMaterialValueHelpSearch();
            this._loadCostData();
        },

        _onMtartValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                return;
            }

            this.getView().getModel("view").setProperty("/filters/mtart", oSelectedItem.getTitle());
            this._clearMtartValueHelpSearch();
            this._loadCostData();
        },

        _onMatklValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            if (!oSelectedItem) {
                return;
            }

            this.getView().getModel("view").setProperty("/filters/matkl", oSelectedItem.getTitle());
            this._clearMatklValueHelpSearch();
            this._loadCostData();
        },

        _clearMaterialValueHelpSearch() {
            if (!this._oMaterialValueHelpDialog) {
                return;
            }

            const oBinding = this._oMaterialValueHelpDialog.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _clearMtartValueHelpSearch() {
            if (!this._oMtartValueHelpDialog) {
                return;
            }

            const oBinding = this._oMtartValueHelpDialog.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _clearMatklValueHelpSearch() {
            if (!this._oMatklValueHelpDialog) {
                return;
            }

            const oBinding = this._oMatklValueHelpDialog.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _getText(sKey) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey);
        },

        _navToDetail(oContext) {
            if (!oContext) {
                return;
            }

            const oData = oContext.getObject();
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteStandardCostDetail", {
                matnr: encodeURIComponent(oData.matnr),
                gjahr: encodeURIComponent(oData.gjahr),
                monat: encodeURIComponent(oData.monat),
                mtopt: encodeURIComponent(oData.mtopt || "")
            });
        },

        _navToVarianceOverview() {
            const oRouter = this.getOwnerComponent().getRouter();
            this.getOwnerComponent().setModel(new JSONModel({
                reset: true
            }), "varianceNav");
            oRouter.navTo("RouteCostVarianceAnalysis");
        },

        _navToVarianceDetail(oContext) {
            if (!oContext) {
                return;
            }

            const oData = oContext.getObject();
            const oRouter = this.getOwnerComponent().getRouter();
            this.getOwnerComponent().setModel(new JSONModel({
                maktx: oData.maktx || "",
                mtopt_t: oData.mtopt_t || ""
            }), "varianceNav");
            oRouter.navTo("RouteCostVarianceAnalysisDetail", {
                matnr: encodeURIComponent(oData.matnr),
                gjahr: encodeURIComponent(oData.gjahr),
                monat: encodeURIComponent(oData.monat),
                mtopt: encodeURIComponent(oData.mtopt || "")
            });
        }
    });
});
