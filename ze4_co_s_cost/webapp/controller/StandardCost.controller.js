sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/routing/History",
    "sap/ui/export/Spreadsheet",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, History, Spreadsheet, MessageBox, SelectDialog, StandardListItem) => {
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
                    mtart: "",
                    matkl: ""
                },
                costData: [],
                materialTypes: [],
                materialTypesLoaded: false,
                materialGroups: [],
                materialGroupsLoaded: false
            });
            this.getView().setModel(oModel, "view");
            
            // Load initial data
            this._loadCostData();
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

        onResetFilters() {
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/filters", {
                gjahr: new Date().getFullYear(),
                monat: String(new Date().getMonth() + 1).padStart(2, '0'),
                matnr: "",
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

        onExportToExcel() {
            const aData = this.getView().getModel("view").getProperty("/costData");
            
            if (!aData || aData.length === 0) {
                MessageBox.warning("내보낼 데이터가 없습니다.");
                return;
            }

            const aExportData = aData.map((oItem) => Object.assign({}, oItem, this._getStockExportValues(oItem)));
            const aCols = [
                { label: "자재번호", property: "matnr" },
                { label: "자재명", property: "maktx" },
                { label: "옵션명", property: "mtopt_t" },
                { label: "총 표준원가", property: "total_cost" },
                { label: "통화", property: "waers" },
                { label: "실시간 재고 현황", property: "stock_status" },
                { label: "단위", property: "display_meins" }
            ];

            const oSettings = {
                workbook: {
                    columns: aCols
                },
                dataSource: aExportData,
                fileName: "StandardCostReport_" + new Date().toISOString().slice(0, 10) + ".xlsx"
            };

            const oSheet = new Spreadsheet(oSettings);
            oSheet.build().then(() => {
                MessageBox.success("Excel 파일이 다운로드되었습니다.");
            }).catch((oError) => {
                MessageBox.error("Excel 내보내기 실패");
            });
        },

        onExportToPdf() {
            const aPrintMarkup = [];
            const aData = this.getView().getModel("view").getProperty("/costData") || [];

            if (aData.length === 0) {
                MessageBox.warning("출력할 데이터가 없습니다.");
                return;
            }
            
            aPrintMarkup.push("<!DOCTYPE html>");
            aPrintMarkup.push("<html>");
            aPrintMarkup.push("<head>");
            aPrintMarkup.push("<meta charset='UTF-8'/>");
            aPrintMarkup.push("<title>표준원가 리포트</title>");
            aPrintMarkup.push("<style>");
            aPrintMarkup.push("@page { size: A4 landscape; margin: 10mm; }");
            aPrintMarkup.push("* { box-sizing: border-box; }");
            aPrintMarkup.push("html, body { margin: 0; padding: 0; }");
            aPrintMarkup.push("body { font-family: Arial, 'Malgun Gothic', sans-serif; color: #1d2b3a; font-size: 10px; }");
            aPrintMarkup.push(".report { width: 100%; }");
            aPrintMarkup.push(".reportHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; border-bottom: 2px solid #d9e1e8; padding-bottom: 8px; }");
            aPrintMarkup.push("h1 { margin: 0; font-size: 18px; line-height: 1.25; color: #0b1f3a; }");
            aPrintMarkup.push(".meta { margin: 2px 0 0; color: #526376; font-size: 9px; white-space: nowrap; }");
            aPrintMarkup.push("table { border-collapse: collapse; table-layout: fixed; width: 100%; }");
            aPrintMarkup.push("th, td { border: 1px solid #dfe5eb; padding: 5px 4px; vertical-align: middle; white-space: normal; word-break: keep-all; overflow-wrap: normal; line-height: 1.25; }");
            aPrintMarkup.push("th { background: #f4f7fa; font-weight: 700; text-align: center; }");
            aPrintMarkup.push("td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }");
            aPrintMarkup.push("td.center { text-align: center; white-space: nowrap; }");
            aPrintMarkup.push(".matnr { width: 11%; } .maktx { width: 22%; } .optionText { width: 13%; } .cost { width: 11%; } .waers { width: 6%; } .stockStatus { width: 31%; } .unit { width: 7%; }");
            aPrintMarkup.push("@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }");
            aPrintMarkup.push("</style>");
            aPrintMarkup.push("</head>");
            aPrintMarkup.push("<body>");
            aPrintMarkup.push("<section class='report'>");
            aPrintMarkup.push("<div class='reportHeader'>");
            aPrintMarkup.push("<h1>[EverNiture-CO] 표준원가 정보</h1>");
            aPrintMarkup.push("<p class='meta'>생성일시: " + this._escapeHtml(new Date().toLocaleString('ko-KR')) + "</p>");
            aPrintMarkup.push("</div>");

            aPrintMarkup.push("<table>");
            aPrintMarkup.push("<colgroup>");
            aPrintMarkup.push("<col class='matnr'/><col class='maktx'/><col class='optionText'/><col class='cost'/><col class='waers'/><col class='stockStatus'/><col class='unit'/>");
            aPrintMarkup.push("</colgroup>");
            aPrintMarkup.push("<thead><tr>");
            aPrintMarkup.push("<th>자재번호</th><th>자재명</th><th>옵션명</th><th>총 표준원가</th><th>통화</th><th>실시간 재고 현황</th><th>단위</th>");
            aPrintMarkup.push("</tr></thead>");
            aPrintMarkup.push("<tbody>");

            aData.forEach((oItem) => {
                const oStockValues = this._getStockExportValues(oItem);
                aPrintMarkup.push("<tr>");
                aPrintMarkup.push("<td class='center'>" + this._escapeHtml(oItem.matnr) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.maktx) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oItem.mtopt_t) + "</td>");
                aPrintMarkup.push("<td class='num'>" + this._escapeHtml(this.formatAmount(oItem.total_cost, oItem.waers)) + "</td>");
                aPrintMarkup.push("<td class='center'>" + this._escapeHtml(oItem.waers) + "</td>");
                aPrintMarkup.push("<td>" + this._escapeHtml(oStockValues.stock_status) + "</td>");
                aPrintMarkup.push("<td class='center'>" + this._escapeHtml(oStockValues.display_meins) + "</td>");
                aPrintMarkup.push("</tr>");
            });

            aPrintMarkup.push("</tbody></table>");
            aPrintMarkup.push("</section>");
            aPrintMarkup.push("</body></html>");

            const sHtml = aPrintMarkup.join("");
            const oWindow = window.open("", "", "width=800,height=600");
            if (!oWindow) {
                MessageBox.warning("팝업 차단을 해제한 뒤 다시 시도해주세요.");
                return;
            }
            oWindow.document.write(sHtml);
            oWindow.document.close();
            oWindow.focus();
            setTimeout(() => {
                oWindow.print();
            }, 250);
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
        }
    });
});
