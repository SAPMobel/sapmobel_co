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
    "sap/viz/ui5/data/FlattenedDataset",
    "sap/viz/ui5/controls/common/feeds/FeedItem",
    "ze4/co/s/cost/ze4coscost/util/ReportExport"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, History, MessageBox, SelectDialog, StandardListItem, FlattenedDataset, FeedItem, ReportExport) => {
    "use strict";

    return Controller.extend("ze4.co.s.cost.ze4coscost.controller.CostVarianceAnalysis", {
        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();

            this.getView().setModel(new JSONModel({
                busy: false,
                message: "",
                filters: this._getDefaultFilters(),
                rows: [],
                overviewRows: [],
                detailRows: [],
                selectedRow: {},
                materialValueHelpRows: [],
                optionValueHelpRows: [],
                analysis: this._getEmptyAnalysis(),
                detailAnalysis: this._getEmptyAnalysis(),
                isDetailMode: false,
                analysisTitleText: "",
                analysisScopeText: "",
                analysisBadgeText: "",
                overviewScopeText: "",
                detailScopeText: "",
                resultTitle: "",
                resultSubtitle: "",
                tableExpanded: false,
                tableVisibleRowCount: 10
            }), "variance");

            oRouter.getRoute("RouteCostVarianceAnalysis").attachPatternMatched(this._onRouteMatched, this);
            oRouter.getRoute("RouteCostVarianceAnalysisDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched(oEvent) {
            const oArgs = oEvent.getParameter("arguments") || {};
            const oModel = this.getView().getModel("variance");
            const oFilters = Object.assign({}, oModel.getProperty("/filters"));
            const oNavModel = this.getOwnerComponent().getModel("varianceNav");
            const oNavFilters = oNavModel && oNavModel.getData && oNavModel.getData();

            if (oArgs.matnr) {
                oFilters.matnr = decodeURIComponent(oArgs.matnr || "");
                oFilters.gjahr = decodeURIComponent(oArgs.gjahr || oFilters.gjahr);
                oFilters.monat = this._toCalendarMonth(decodeURIComponent(oArgs.monat || oFilters.monat));
                oFilters.mtopt = decodeURIComponent(oArgs.mtopt || "");
                oFilters.maktx = oNavFilters && oNavFilters.maktx || oFilters.maktx || "";
                oFilters.mtopt_t = oNavFilters && oNavFilters.mtopt_t || oFilters.mtopt_t || "";
                oModel.setProperty("/filters", oFilters);
                if (oNavModel) {
                    oNavModel.setData({});
                }
            } else {
                if (oNavFilters && oNavFilters.reset) {
                    oModel.setProperty("/filters", this._getDefaultFilters());
                    oNavModel.setData({});
                } else if (oNavFilters && (oNavFilters.gjahr || oNavFilters.monat)) {
                    Object.assign(oFilters, {
                        bukrs: oNavFilters.bukrs || oFilters.bukrs,
                        gjahr: oNavFilters.gjahr || oFilters.gjahr,
                        monat: this._toCalendarMonth(oNavFilters.monat || oFilters.monat),
                        matnr: "",
                        maktx: "",
                        mtopt: "",
                        mtopt_t: ""
                    });
                    oModel.setProperty("/filters", oFilters);
                    oNavModel.setData({});
                }
            }

            this._loadVarianceData();
        },

        onSearch() {
            this._loadVarianceData();
        },

        onReset() {
            this.getView().getModel("variance").setProperty("/filters", this._getDefaultFilters());
            this._loadVarianceData();
        },

        onExportExcel() {
            ReportExport.exportExcel(this._buildExportReport(), this.getView());
        },

        onExportPdf() {
            ReportExport.printPdf(this._buildExportReport(), this.getView());
        },

        _buildExportReport() {
            const oModel = this.getView().getModel("variance");
            const oFilters = oModel.getProperty("/filters") || {};
            const oAnalysis = oModel.getProperty("/analysis") || {};
            const aRows = oModel.getProperty("/rows") || [];
            const fnAmount = (vValue) => this.formatAmount(vValue);
            const fnPercent = (vValue) => this.formatPercent(vValue);
            const bDetailMode = !!oModel.getProperty("/isDetailMode");
            const aSections = [];

            if (bDetailMode) {
                aSections.push(
                    ReportExport.section("원가 변화 의미", oAnalysis.detailMeaningRows, [
                        { label: "구분", property: "label" },
                        { label: "해석", property: "text" },
                        { label: "근거", property: "evidence" },
                        { label: "상태", property: "state" }
                    ])
                );
            } else {
                aSections.push(
                    ReportExport.section("가격 방향 분석", oAnalysis.priceDirectionRows, [
                        { label: "구분", property: "label" },
                        { label: "금액", rawProperty: "amount", value: (oRow) => fnAmount(oRow.amount), type: "amount", total: true },
                        { label: "건수", property: "count", type: "integer", total: true },
                        { label: "비중", property: "shareText", type: "text", summary: false },
                        { label: "해석", property: "interpretation" }
                    ]),
                    ReportExport.section("활동단가 분석", oAnalysis.activityRateRows, [
                        { label: "활동유형", property: "label" },
                        { label: "표준단가", rawProperty: "standardRate", value: (oRow) => fnAmount(oRow.standardRate), type: "amount" },
                        { label: "실제단가", rawProperty: "actualRate", value: (oRow) => fnAmount(oRow.actualRate), type: "amount" },
                        { label: "차이", rawProperty: "rateDiff", value: (oRow) => fnAmount(oRow.rateDiff), type: "amount", total: true },
                        { label: "차이율", rawProperty: "rateDiffPercent", value: (oRow) => fnPercent(oRow.rateDiffPercent) + "%", type: "percent", percentScale: "point", summary: false },
                        { label: "단위", property: "rateUnit" }
                    ]),
                    ReportExport.section("관리 신호", oAnalysis.managementSignalRows, [
                        { label: "신호", property: "title" },
                        { label: "설명", property: "text" },
                        { label: "값", rawProperty: "value", value: (oRow) => fnAmount(oRow.value), type: "amount" },
                        { label: "단위", property: "unit" },
                        { label: "상태", property: "state" }
                    ]),
                    ReportExport.section("포트폴리오", oAnalysis.portfolioRows, [
                        { label: "구분", property: "label" },
                        { label: "건수", property: "count", type: "integer", total: true },
                        { label: "표준원가", rawProperty: "stdAmount", value: (oRow) => fnAmount(oRow.stdAmount), type: "amount", total: true },
                        { label: "차이", rawProperty: "diffAmount", value: (oRow) => fnAmount(oRow.diffAmount), type: "amount", total: true },
                        { label: "차이율", rawProperty: "diffRate", value: (oRow) => fnPercent(oRow.diffRate) + "%", type: "percent", percentScale: "point", summary: false }
                    ])
                );
            }

            aSections.push(
                ReportExport.section("요인별 차이", oAnalysis.factorRows, [
                    { label: "요인", property: "label" },
                    { label: "금액", rawProperty: "amount", value: (oRow) => fnAmount(oRow.amount), type: "amount", total: true },
                    { label: "비중", property: "shareText", type: "text", summary: false },
                    { label: "상태", property: "state" }
                ]),
                ReportExport.section("권장 액션", oAnalysis.actionRows, [
                    { label: "우선순위", property: "priority" },
                    { label: "관리 영역", property: "area" },
                    { label: "근거", property: "signal" },
                    { label: "권장 조치", property: "recommendation" },
                    { label: "금액", rawProperty: "amount", value: (oRow) => fnAmount(oRow.amount), type: "amount", total: true },
                    { label: "상태", property: "state" }
                ]),
                ReportExport.section("실제원가 산출 내역", aRows, [
                    { label: "제품번호", property: "matnr" },
                    { label: "제품명", property: "maktx" },
                    { label: "옵션", property: "mtopt" },
                    { label: "옵션명", property: "mtopt_t" },
                    { label: "표준원가", rawProperty: "std_total_cost", value: (oRow) => fnAmount(oRow.std_total_cost), type: "amount", total: true },
                    { label: "실제원가", rawProperty: "actual_total_cost", value: (oRow) => fnAmount(oRow.actual_total_cost), type: "amount", total: true },
                    { label: "가격차이", rawProperty: "price_diff_amt", value: (oRow) => fnAmount(oRow.price_diff_amt), type: "amount", total: true },
                    { label: "가공차이", rawProperty: "processing_diff_amt", value: (oRow) => fnAmount(oRow.processing_diff_amt), type: "amount", total: true },
                    { label: "통화", property: "waers" },
                    { label: "상태", property: "actual_status_text" }
                ])
            );

            return {
                title: "[EverNiture-CO] 원가차이 분석",
                fileName: "CostVarianceAnalysis",
                variant: "standard",
                description: "표준원가 대비 실제원가 차이의 요인별 분석 리포트",
                filters: ReportExport.labelRows(oFilters, [
                    { label: "회사코드", property: "bukrs" },
                    { label: "회계연도", property: "gjahr" },
                    { label: "월", property: "monat" },
                    { label: "제품번호", property: "matnr" },
                    { label: "옵션", property: "mtopt" }
                ]),
                summary: [
                    { label: "조회 건수", value: (oAnalysis.rowCount || 0) + "건" },
                    { label: "실제 완료/대상/참조", value: oAnalysis.completedStatusText },
                    { label: "표준원가 합계", value: fnAmount(oAnalysis.stdTotalCost) + " " + (oAnalysis.currency || "") },
                    { label: "실제원가 합계", value: fnAmount(oAnalysis.actualTotalCost) + " " + (oAnalysis.currency || "") },
                    { label: "총 차이", value: fnAmount(oAnalysis.totalDiff) + " " + (oAnalysis.currency || "") },
                    { label: "총 차이율", value: fnPercent(oAnalysis.totalDiffRate) + "%" },
                    { label: "주요 요인", value: oAnalysis.dominantFactorText }
                ],
                sections: aSections
            };
        },

        onMaterialValueHelp() {
            const oDialog = this._getMaterialValueHelpDialog();

            this._loadMaterialValueHelpRows().then(() => {
                oDialog.open();
            }).catch(() => {});
        },

        onOptionValueHelp() {
            const oDialog = this._getOptionValueHelpDialog();

            this._loadOptionValueHelpRows().then(() => {
                oDialog.open();
            }).catch(() => {});
        },

        onRowSelectionChange(oEvent) {
            const oTable = this.byId("varianceTable");
            const iIndex = oEvent.getParameter("rowIndex");
            const oContext = iIndex >= 0 && oTable && oTable.getContextByIndex(iIndex);

            this.getView().getModel("variance").setProperty("/selectedRow", oContext ? oContext.getObject() : {});
        },

        onShowAllRows() {
            const oModel = this.getView().getModel("variance");
            const aRows = oModel.getProperty("/rows") || [];
            const bExpanded = !oModel.getProperty("/tableExpanded");

            oModel.setProperty("/tableExpanded", bExpanded);
            oModel.setProperty("/tableVisibleRowCount", this._getTableVisibleRowCount(aRows, bExpanded));
        },

        onNavBack() {
            const sPreviousHash = History.getInstance().getPreviousHash();

            if (sPreviousHash !== undefined) {
                window.history.go(-1);
            } else {
                this.getOwnerComponent().getRouter().navTo("RouteStandardCost", {}, true);
            }
        },

        _loadVarianceData() {
            const oViewModel = this.getView().getModel("variance");
            const oFilters = this._collectFilters();
            const oOverviewFilters = this._getOverviewFilters(oFilters);
            const bDetailMode = this._hasDetailFilters(oFilters);
            const oODataModel = this.getOwnerComponent().getModel("varianceModel");

            if (!this._validateFilters(oFilters)) {
                return;
            }

            if (!oODataModel) {
                MessageBox.error("원가차이 조회 서비스가 정의되어 있지 않습니다.");
                return;
            }

            oViewModel.setProperty("/busy", true);
            oViewModel.setProperty("/message", "");
            oViewModel.setProperty("/rows", []);
            oViewModel.setProperty("/overviewRows", []);
            oViewModel.setProperty("/detailRows", []);
            oViewModel.setProperty("/selectedRow", {});
            oViewModel.setProperty("/analysis", this._getEmptyAnalysis());
            oViewModel.setProperty("/detailAnalysis", this._getEmptyAnalysis());
            oViewModel.setProperty("/isDetailMode", bDetailMode);
            oViewModel.setProperty("/overviewScopeText", this._buildOverviewScopeText(oOverviewFilters));
            oViewModel.setProperty("/detailScopeText", this._buildDetailScopeText(oFilters, bDetailMode));
            oViewModel.setProperty("/analysisTitleText", this._getText(bDetailMode ? "varianceDetailResultTitle" : "varianceAnalysisSummaryTitle"));
            oViewModel.setProperty("/analysisScopeText", bDetailMode ? this._buildDetailScopeText(oFilters, bDetailMode) : this._buildOverviewScopeText(oOverviewFilters));
            oViewModel.setProperty("/analysisBadgeText", this._getText(bDetailMode ? "varianceDetailResultTitle" : "varianceOverviewBadge"));
            oViewModel.setProperty("/resultTitle", this._getText(bDetailMode ? "varianceDetailResultTitle" : "varianceAllResultTitle"));
            oViewModel.setProperty("/resultSubtitle", this._getText(bDetailMode ? "varianceDetailResultSubtitle" : "varianceAllResultSubtitle"));
            oViewModel.setProperty("/tableExpanded", false);

            const pOverviewRows = this._loadVarianceRows(oODataModel, oOverviewFilters);
            const pDetailRows = bDetailMode ? this._loadVarianceRows(oODataModel, oFilters) : pOverviewRows;
            const pActivityRows = bDetailMode ? Promise.resolve([]) : this._loadActivityRateRows(oOverviewFilters);

            Promise.all([
                pOverviewRows,
                pDetailRows,
                pActivityRows
            ]).then(([aOverviewRows, aDetailRows, aActivityRateRows]) => {
                const aPreparedOverviewRows = (aOverviewRows || []).map(this._prepareRow, this);
                const aPreparedDetailRows = bDetailMode ? (aDetailRows || []).map(this._prepareRow, this) : aPreparedOverviewRows;
                const oOverviewAnalysis = this._buildAnalysis(aPreparedOverviewRows, bDetailMode ? [] : aActivityRateRows, false);
                const oDetailAnalysis = bDetailMode ? this._buildAnalysis(aPreparedDetailRows, [], true) : oOverviewAnalysis;
                const oDisplayAnalysis = bDetailMode ? oDetailAnalysis : oOverviewAnalysis;
                const oSelectedRow = aPreparedDetailRows[0] || {};
                const oDisplayFilters = Object.assign({}, oFilters, {
                    maktx: oSelectedRow.maktx || oFilters.maktx,
                    mtopt_t: oSelectedRow.mtopt_t || oFilters.mtopt_t
                });
                const sDetailScopeText = this._buildDetailScopeText(oDisplayFilters, bDetailMode, aPreparedDetailRows);

                oViewModel.setProperty("/overviewRows", aPreparedOverviewRows);
                oViewModel.setProperty("/detailRows", aPreparedDetailRows);
                oViewModel.setProperty("/rows", aPreparedDetailRows);
                oViewModel.setProperty("/selectedRow", oSelectedRow);
                oViewModel.setProperty("/analysis", oDisplayAnalysis);
                oViewModel.setProperty("/detailAnalysis", oDetailAnalysis);
                oViewModel.setProperty("/detailScopeText", sDetailScopeText);
                oViewModel.setProperty("/analysisScopeText", bDetailMode ? sDetailScopeText : this._buildOverviewScopeText(oOverviewFilters));
                oViewModel.setProperty("/tableVisibleRowCount", this._getTableVisibleRowCount(aPreparedDetailRows, false));
                this._syncFilterTextsFromSelectedRow(oDisplayFilters, oSelectedRow);
                oViewModel.setProperty("/message", "");
                this._updateFactorChart();
            }).catch((oError) => {
                console.error("Cost variance load error:", oError);
                oViewModel.setProperty("/message", this._getText("varianceLoadFailed"));
                MessageBox.error(this._getText("varianceLoadFailed"));
            }).finally(() => {
                oViewModel.setProperty("/busy", false);
            });
        },

        _collectFilters() {
            const oModel = this.getView().getModel("variance");
            const oFilters = Object.assign({}, oModel.getProperty("/filters"));

            oFilters.bukrs = String(oFilters.bukrs || "0001").trim().toUpperCase();
            oFilters.gjahr = String(oFilters.gjahr || "").trim();
            oFilters.monat = this._toCalendarMonth(oFilters.monat);
            oFilters.matnr = String(oFilters.matnr || "").trim().toUpperCase();
            oFilters.maktx = oFilters.matnr ? String(oFilters.maktx || "").trim() : "";
            oFilters.mtopt = String(oFilters.mtopt || "").trim().toUpperCase();
            oFilters.mtopt_t = oFilters.mtopt ? String(oFilters.mtopt_t || "").trim() : "";
            oModel.setProperty("/filters", oFilters);
            return oFilters;
        },

        _validateFilters(oFilters) {
            if (!/^\d{4}$/.test(oFilters.gjahr) || !/^(0[1-9]|1[0-2])$/.test(oFilters.monat)) {
                MessageBox.warning("연도는 4자리, 월은 01부터 12까지 입력하십시오.");
                return false;
            }

            return true;
        },

        _buildFilters(oFilters) {
            const aFilters = [
                new Filter("gjahr", FilterOperator.EQ, oFilters.gjahr),
                new Filter("monat", FilterOperator.EQ, oFilters.monat)
            ];

            if (oFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.EQ, oFilters.matnr));
            }

            if (oFilters.mtopt) {
                aFilters.push(new Filter("mtopt", FilterOperator.EQ, oFilters.mtopt));
            }

            return aFilters;
        },

        _loadVarianceRows(oModel, oFilters) {
            return this._getVarianceSetPath(oModel, {
                p_bukrs: oFilters.bukrs,
                p_gjahr: oFilters.gjahr,
                p_monat: this._toPoper(oFilters.monat),
                p_werks: ""
            }).then((sPath) => this._readODataList(oModel, sPath, {
                filters: this._buildFilters(oFilters),
                urlParameters: {
                    $orderby: "matnr asc,mtopt asc"
                }
            }));
        },

        _getOverviewFilters(oFilters) {
            return Object.assign({}, oFilters, {
                matnr: "",
                mtopt: ""
            });
        },

        _hasDetailFilters(oFilters) {
            return !!(oFilters && (oFilters.matnr || oFilters.mtopt));
        },

        _buildOverviewScopeText(oFilters) {
            return this._getText("varianceOverviewScope", [oFilters.bukrs, oFilters.gjahr, oFilters.monat]);
        },

        _buildDetailScopeText(oFilters, bDetailMode, aRows) {
            if (!bDetailMode) {
                return this._getText("varianceAllScope", [oFilters.bukrs, oFilters.gjahr, oFilters.monat]);
            }

            return this._getText("varianceDetailScope", [
                oFilters.maktx || oFilters.matnr || this._getText("varianceAllProducts"),
                oFilters.mtopt_t || oFilters.mtopt || this._getText("varianceAllOptions"),
                Array.isArray(aRows) ? aRows.length : 0
            ]);
        },

        _syncFilterTextsFromSelectedRow(oFilters, oSelectedRow) {
            const oModel = this.getView().getModel("variance");

            if (!oModel || !this._hasDetailFilters(oFilters)) {
                return;
            }

            if (oFilters.matnr && oSelectedRow && oSelectedRow.maktx) {
                oModel.setProperty("/filters/maktx", String(oSelectedRow.maktx || "").trim());
            }

            if (oFilters.mtopt && oSelectedRow && oSelectedRow.mtopt_t) {
                oModel.setProperty("/filters/mtopt_t", String(oSelectedRow.mtopt_t || "").trim());
            }
        },

        _getTableVisibleRowCount(aRows, bExpanded) {
            const iRowCount = Array.isArray(aRows) ? aRows.length : 0;

            if (!iRowCount) {
                return 3;
            }

            return Math.min(bExpanded ? 16 : 6, iRowCount);
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
                    path: "variance>/materialValueHelpRows",
                    template: new StandardListItem({
                        title: "{variance>matnr}",
                        description: "{variance>maktx}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMaterialValueHelpDialog);
            return this._oMaterialValueHelpDialog;
        },

        _getOptionValueHelpDialog() {
            if (this._oOptionValueHelpDialog) {
                return this._oOptionValueHelpDialog;
            }

            this._oOptionValueHelpDialog = new SelectDialog({
                title: this._getText("optionHelpTitle"),
                noDataText: this._getText("optionHelpNoData"),
                search: this._onOptionValueHelpSearch.bind(this),
                liveChange: this._onOptionValueHelpSearch.bind(this),
                confirm: this._onOptionValueHelpConfirm.bind(this),
                cancel: this._clearOptionValueHelpSearch.bind(this),
                items: {
                    path: "variance>/optionValueHelpRows",
                    template: new StandardListItem({
                        title: "{variance>mtopt}",
                        description: "{variance>mtopt_t}",
                        info: "{variance>matnr}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oOptionValueHelpDialog);
            return this._oOptionValueHelpDialog;
        },

        _loadMaterialValueHelpRows() {
            const oFilters = this._collectFilters();

            if (!this._validateFilters(oFilters)) {
                return Promise.reject(new Error("Invalid value help filters"));
            }

            return this._readODataList(this.getOwnerComponent().getModel(), "/zcds_e4_co_0010", {
                filters: this._buildValueHelpPeriodFilters(oFilters),
                urlParameters: {
                    $select: "matnr,maktx",
                    $orderby: "matnr asc",
                    $top: "5000"
                }
            }).then((aRows) => {
                const aMaterials = this._dedupeRows(aRows, ["matnr"], (oItem) => ({
                    matnr: String(oItem.matnr || "").trim(),
                    maktx: String(oItem.maktx || "").trim()
                }));

                this.getView().getModel("variance").setProperty("/materialValueHelpRows", aMaterials);
            }).catch((oError) => {
                MessageBox.error(this._getText("materialHelpLoadError"));
                console.error("Material value help load error:", oError);
                throw oError;
            });
        },

        _loadOptionValueHelpRows() {
            const oFilters = this._collectFilters();
            const aFilters = this._buildValueHelpPeriodFilters(oFilters);

            if (!this._validateFilters(oFilters)) {
                return Promise.reject(new Error("Invalid value help filters"));
            }

            if (oFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, oFilters.matnr));
            }

            return this._readODataList(this.getOwnerComponent().getModel(), "/zcds_e4_co_0010", {
                filters: aFilters,
                urlParameters: {
                    $select: "matnr,maktx,mtopt,mtopt_t",
                    $orderby: "mtopt asc,matnr asc",
                    $top: "5000"
                }
            }).then((aRows) => {
                const aOptions = this._dedupeRows(aRows, ["mtopt"], (oItem) => ({
                    mtopt: String(oItem.mtopt || "").trim(),
                    mtopt_t: String(oItem.mtopt_t || "").trim(),
                    matnr: String(oItem.matnr || "").trim(),
                    maktx: String(oItem.maktx || "").trim()
                }));

                this.getView().getModel("variance").setProperty("/optionValueHelpRows", aOptions);
            }).catch((oError) => {
                MessageBox.error(this._getText("optionHelpLoadError"));
                console.error("Option value help load error:", oError);
                throw oError;
            });
        },

        _buildValueHelpPeriodFilters(oFilters) {
            return [
                new Filter("gjahr", FilterOperator.EQ, oFilters.gjahr),
                new Filter("monat", FilterOperator.EQ, oFilters.monat)
            ];
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

        _onOptionValueHelpSearch(oEvent) {
            const sValue = oEvent.getParameter("value") || "";
            const oBinding = oEvent.getSource().getBinding("items");
            const aFilters = sValue ? [
                new Filter({
                    filters: [
                        new Filter("mtopt", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("mtopt_t", FilterOperator.Contains, sValue),
                        new Filter("matnr", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("maktx", FilterOperator.Contains, sValue)
                    ],
                    and: false
                })
            ] : [];

            oBinding.filter(aFilters);
        },

        _onMaterialValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oModel = this.getView().getModel("variance");

            if (!oSelectedItem) {
                return;
            }

            oModel.setProperty("/filters/matnr", oSelectedItem.getTitle());
            oModel.setProperty("/filters/maktx", oSelectedItem.getDescription());
            oModel.setProperty("/filters/mtopt", "");
            oModel.setProperty("/filters/mtopt_t", "");
            this._clearMaterialValueHelpSearch();
            this._loadVarianceData();
        },

        _onOptionValueHelpConfirm(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oModel = this.getView().getModel("variance");

            if (!oSelectedItem) {
                return;
            }

            oModel.setProperty("/filters/mtopt", oSelectedItem.getTitle());
            oModel.setProperty("/filters/mtopt_t", oSelectedItem.getDescription());
            this._clearOptionValueHelpSearch();
            this._loadVarianceData();
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

        _clearOptionValueHelpSearch() {
            if (!this._oOptionValueHelpDialog) {
                return;
            }

            const oBinding = this._oOptionValueHelpDialog.getBinding("items");
            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _dedupeRows(aRows, aKeyProperties, fnMap) {
            const mSeen = {};

            return (aRows || []).reduce((aResult, oItem) => {
                const sKey = (aKeyProperties || []).map((sProperty) => String(oItem[sProperty] || "").trim()).join("|");

                if (!sKey.replace(/\|/g, "") || mSeen[sKey]) {
                    return aResult;
                }

                mSeen[sKey] = true;
                aResult.push(fnMap(oItem));
                return aResult;
            }, []);
        },

        _getDefaultFilters() {
            const oNow = new Date();

            return {
                bukrs: "0001",
                gjahr: String(oNow.getFullYear()),
                monat: String(oNow.getMonth() + 1).padStart(2, "0"),
                matnr: "",
                maktx: "",
                mtopt: "",
                mtopt_t: ""
            };
        },

        _getVarianceSetPath(oModel, mParameters) {
            return oModel.metadataLoaded().then(() => "/" + oModel.createKey("zcds_e4_co_0028", mParameters) + "/Set");
        },

        _readODataList(oModel, sPath, mParameters) {
            return new Promise((resolve, reject) => {
                oModel.read(sPath, Object.assign({}, mParameters, {
                    success: (oData) => resolve(oData && oData.results || []),
                    error: reject
                }));
            });
        },

        _updateFactorChart() {
            const oChart = this.byId("varianceFactorChart");

            if (!oChart) {
                return;
            }

            oChart.destroyDataset();
            oChart.removeAllFeeds();
            oChart.setDataset(new FlattenedDataset({
                dimensions: [{
                    name: this._getText("varianceMetric"),
                    value: "{variance>label}"
                }],
                measures: [{
                    name: this._getText("varianceImpactAmount"),
                    value: "{variance>amount}"
                }],
                data: {
                    path: "variance>/analysis/factorChartRows"
                }
            }));
            oChart.addFeed(new FeedItem({
                uid: "valueAxis",
                type: "Measure",
                values: [this._getText("varianceImpactAmount")]
            }));
            oChart.addFeed(new FeedItem({
                uid: "categoryAxis",
                type: "Dimension",
                values: [this._getText("varianceMetric")]
            }));
            oChart.setVizProperties({
                title: {
                    visible: false
                },
                legend: {
                    visible: true,
                    label: {
                        style: {
                            color: "#1f3147",
                            fontSize: "12px"
                        }
                    }
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "#,##0",
                        style: {
                            color: "#ffffff",
                            fontSize: "12px",
                            fontWeight: "bold"
                        }
                    },
                    colorPalette: ["#0a6ed1", "#e9730c", "#6a6d70"]
                },
                valueAxis: {
                    label: {
                        formatString: "#,##0",
                        style: {
                            color: "#34495e",
                            fontSize: "12px"
                        }
                    }
                },
                categoryAxis: {
                    label: {
                        style: {
                            color: "#1f3147",
                            fontSize: "12px"
                        }
                    }
                }
            });
        },

        _getEmptyAnalysis() {
            return {
                rowCount: 0,
                completedCount: 0,
                targetCount: 0,
                displayOnlyCount: 0,
                completedStatusText: "",
                statusText: "",
                statusState: "None",
                priorityIssueCount: 0,
                currency: "",
                stdTotalCost: 0,
                actualTotalCost: 0,
                totalDiff: 0,
                totalDiffState: "None",
                totalDiffRate: 0,
                totalDiffRateState: "None",
                dominantFactorText: "",
                dominantFactorAmount: 0,
                dominantFactorState: "None",
                priceNetAmount: 0,
                priceNetState: "None",
                processingNetAmount: 0,
                processingNetState: "None",
                mainIssueText: "",
                mainIssueDescription: "",
                mainIssueAmount: null,
                mainIssueUnit: "",
                mainIssueState: "None",
                detailMeaningTitle: "",
                detailMeaningText: "",
                detailMeaningState: "None",
                detailMeaningRows: [],
                detailActivityRows: [],
                hasDetailActivityRows: false,
                hasActivityRateDiffPercent: false,
                checkPriorityRows: [],
                hasCheckPriorityRows: false,
                checkPrioritySummary: "",
                priceDirectionRows: [],
                priceDetailRows: [],
                managementSignalRows: [],
                portfolioRows: [],
                actionRows: [],
                activityRateRows: [],
                processingDetailRows: [],
                factorRows: [],
                factorChartRows: [],
                validationRows: []
            };
        },

        _buildAnalysis(aRows, aActivityRateRows, bDetailMode) {
            const aResultRows = Array.isArray(aRows) ? aRows : [];
            const aRateRows = Array.isArray(aActivityRateRows) ? aActivityRateRows : [];

            if (aResultRows.length === 0) {
                return Object.assign(this._getEmptyAnalysis(), {
                    completedStatusText: this._getText("varianceCompletedStatus", [0, 0, 0]),
                    dominantFactorText: this._getText("varianceNoFactor"),
                    activityRateRows: aRateRows
                });
            }

            const fnNumber = (vValue) => {
                const fValue = Number(vValue);
                return Number.isFinite(fValue) ? fValue : 0;
            };
            const fnSum = (sProperty) => aResultRows.reduce((fSum, oRow) => fSum + fnNumber(oRow[sProperty]), 0);
            const aComparableRows = aResultRows.filter(this._isActualCompletedRow, this);
            const fnComparableSum = (sProperty) => aComparableRows.reduce((fSum, oRow) => fSum + fnNumber(oRow[sProperty]), 0);
            const fStdTotalCost = fnSum("std_total_cost");
            const fComparableStdTotalCost = fnComparableSum("std_total_cost");
            const fActualTotalCost = fnComparableSum("actual_total_cost");
            const iCompletedCount = aResultRows.filter((oRow) => oRow.actual_exists === "X").length;
            const iTargetCount = aResultRows.filter((oRow) => oRow.actual_exists !== "X" && oRow.actual_calc_target === "X").length;
            const iDisplayOnlyCount = Math.max(0, aResultRows.length - iCompletedCount - iTargetCount);
            const fPriceNetAmount = fnSum("price_diff_amt");
            const fProcessingNetAmount = fnSum("processing_diff_amt");
            const aFactorRows = [
                this._buildFactorRow(this._getText("varianceMaterialPriceDiff"), fPriceNetAmount),
                this._buildFactorRow(this._getText("varianceProcessingDiff"), fProcessingNetAmount)
            ];
            const fSettlementDiffAmount = fnSum("settlement_variance_amt");
            const fTotalDiff = fSettlementDiffAmount;
            const fTotalDiffRate = fStdTotalCost ? (fTotalDiff / Math.abs(fStdTotalCost)) * 100 : 0;
            const oSettlementTotalRow = this._buildFactorRow(this._getText("varianceSettlementDiff"), fSettlementDiffAmount, true);
            const fFactorAbsTotal = aFactorRows.reduce((fSum, oRow) => fSum + oRow.absAmount, 0);
            const fPriceFavorableAmount = Math.abs(aResultRows.reduce((fSum, oRow) => {
                const fValue = fnNumber(oRow.price_diff_amt);
                return fValue < 0 ? fSum + fValue : fSum;
            }, 0));
            const fPriceUnfavorableAmount = aResultRows.reduce((fSum, oRow) => {
                const fValue = fnNumber(oRow.price_diff_amt);
                return fValue > 0 ? fSum + fValue : fSum;
            }, 0);
            const fTotalAbsPrice = fPriceFavorableAmount + fPriceUnfavorableAmount;
            const iPriceFavorableCount = aResultRows.filter((oRow) => fnNumber(oRow.price_diff_amt) < 0).length;
            const iPriceUnfavorableCount = aResultRows.filter((oRow) => fnNumber(oRow.price_diff_amt) > 0).length;

            aFactorRows.forEach((oRow) => {
                oRow.sharePercent = fFactorAbsTotal ? (oRow.absAmount / fFactorAbsTotal) * 100 : 0;
                oRow.shareText = this._formatNumber(oRow.sharePercent, 1) + "%";
            });
            oSettlementTotalRow.sharePercent = fFactorAbsTotal ? 100 : 0;
            oSettlementTotalRow.shareText = fFactorAbsTotal ? "100%" : "0%";

            const oDominantFactor = aFactorRows.reduce((oCurrent, oRow) => {
                return oRow.absAmount > oCurrent.absAmount ? oRow : oCurrent;
            }, { label: "", amount: 0, absAmount: 0, state: "None" });
            const aPreparedComparableRows = aComparableRows.map((oRow) => {
                const fRowStd = fnNumber(oRow.std_total_cost);
                const fRowActual = fnNumber(oRow.actual_total_cost);
                const fRowDiff = fRowActual - fRowStd;

                return Object.assign({}, oRow, {
                    totalDiffAmt: fRowDiff,
                    rowDiffRate: fRowStd ? (fRowDiff / fRowStd) * 100 : 0
                });
            });
            const fPriceSensitivity = fStdTotalCost ? (fTotalAbsPrice / Math.abs(fStdTotalCost)) * 100 : 0;
            const fPriceConcentration = this._getTopAbsShare(aResultRows, "price_diff_amt", 3, fnNumber);
            const iStandardReviewCount = aPreparedComparableRows.filter((oRow) => Math.abs(oRow.rowDiffRate) >= 5).length;
            const fStandardReviewAmount = aPreparedComparableRows.reduce((fSum, oRow) => {
                return Math.abs(oRow.rowDiffRate) >= 5 ? fSum + Math.abs(oRow.totalDiffAmt) : fSum;
            }, 0);
            const fOperationShare = fFactorAbsTotal ? (Math.abs(fnSum("processing_diff_amt")) / fFactorAbsTotal) * 100 : 0;
            const aPriceDirectionRows = [
                this._buildDirectionRow(this._getText("variancePriceUnfavorable"), fPriceUnfavorableAmount, iPriceUnfavorableCount, fTotalAbsPrice, "Warning", this._getText("variancePriceUnfavorableText")),
                this._buildDirectionRow(this._getText("variancePriceFavorable"), fPriceFavorableAmount, iPriceFavorableCount, fTotalAbsPrice, "Success", this._getText("variancePriceFavorableText")),
                this._buildDirectionRow(this._getText("variancePriceNet"), fPriceNetAmount, aComparableRows.length, fTotalAbsPrice, this._amountState(fPriceNetAmount), this._getText("variancePriceNetText"))
            ];
            const aManagementSignalRows = [
                this._buildSignalRow(this._getText("varianceSignalPriceSensitivity"), this._getText("varianceSignalPriceSensitivityText", [this._formatNumber(fPriceSensitivity, 1)]), fPriceSensitivity, "%", this._thresholdState(fPriceSensitivity, 5, 10)),
                this._buildSignalRow(this._getText("varianceSignalConcentration"), this._getText("varianceSignalConcentrationText", [this._formatNumber(fPriceConcentration, 1)]), fPriceConcentration, "%", this._thresholdState(fPriceConcentration, 50, 70)),
                this._buildSignalRow(this._getText("varianceSignalStandardReview"), this._getText("varianceSignalStandardReviewText", [iStandardReviewCount]), fStandardReviewAmount, aResultRows[0] && aResultRows[0].waers || "", iStandardReviewCount > 0 ? "Warning" : "Success"),
                this._buildSignalRow(this._getText("varianceSignalOperation"), this._getText("varianceSignalOperationText", [this._formatNumber(fOperationShare, 1)]), fOperationShare, "%", this._thresholdState(fOperationShare, 35, 60))
            ];
            const aPortfolioRows = this._buildPortfolioRows(aPreparedComparableRows, fComparableStdTotalCost, fnNumber);
            const aActionRows = this._buildActionRows({
                currency: aResultRows[0] && aResultRows[0].waers || "",
                priceFavorableAmount: fPriceFavorableAmount,
                priceUnfavorableAmount: fPriceUnfavorableAmount,
                priceNetAmount: fPriceNetAmount,
                priceConcentration: fPriceConcentration,
                standardReviewCount: iStandardReviewCount,
                standardReviewAmount: fStandardReviewAmount,
                operationShare: fOperationShare,
                operationAmount: Math.abs(fProcessingNetAmount),
                detailMode: bDetailMode
            });
            const oVarianceStatus = this._buildVarianceStatus({
                rowCount: aResultRows.length,
                targetCount: iTargetCount,
                displayOnlyCount: iDisplayOnlyCount,
                totalDiff: fTotalDiff,
                priceNetAmount: fPriceNetAmount,
                processingNetAmount: fProcessingNetAmount,
                actionRows: aActionRows
            });
            const oMainIssue = this._buildMainIssue(aActionRows);
            const aValidationRows = this._buildValidationRows({
                completedCount: iCompletedCount,
                targetCount: iTargetCount,
                displayOnlyCount: iDisplayOnlyCount,
                actualTotalCost: fActualTotalCost,
                standardReviewCount: iStandardReviewCount,
                standardReviewAmount: fStandardReviewAmount,
                detailMode: bDetailMode
            });
            const aDetailActivityRows = bDetailMode ? this._buildDetailActivityMeaningRows(
                this._buildActivityRateRowsFromProcessingRows(aResultRows),
                aResultRows[0] && aResultRows[0].waers || ""
            ) : [];
            const oDetailMeaning = bDetailMode ? this._buildDetailMeaning({
                totalDiff: fTotalDiff,
                totalDiffRate: fTotalDiffRate,
                priceNetAmount: fPriceNetAmount,
                processingNetAmount: fProcessingNetAmount,
                currency: aResultRows[0] && aResultRows[0].waers || "",
                completedCount: iCompletedCount,
                targetCount: iTargetCount,
                displayOnlyCount: iDisplayOnlyCount
            }) : {
                title: "",
                text: "",
                state: "None",
                rows: []
            };
            const oCheckPriority = bDetailMode ? this._buildCheckPriorityRows({
                totalDiff: fTotalDiff,
                priceNetAmount: fPriceNetAmount,
                processingNetAmount: fProcessingNetAmount,
                currency: aResultRows[0] && aResultRows[0].waers || ""
            }) : {
                rows: [],
                summary: ""
            };
            const iPriorityIssueCount = aActionRows.filter((oRow) => oRow.state === "Error" || oRow.state === "Warning").length + iTargetCount + iDisplayOnlyCount;

            return {
                rowCount: aResultRows.length,
                completedCount: iCompletedCount,
                targetCount: iTargetCount,
                displayOnlyCount: iDisplayOnlyCount,
                completedStatusText: this._getText("varianceCompletedStatus", [iCompletedCount, iTargetCount, iDisplayOnlyCount]),
                statusText: oVarianceStatus.text,
                statusState: oVarianceStatus.state,
                priorityIssueCount: iPriorityIssueCount,
                currency: aResultRows[0] && aResultRows[0].waers || "",
                stdTotalCost: fStdTotalCost,
                actualTotalCost: fActualTotalCost,
                totalDiff: fTotalDiff,
                totalDiffState: this._amountState(fTotalDiff),
                totalDiffRate: fTotalDiffRate,
                totalDiffRateState: this._amountState(fTotalDiffRate),
                dominantFactorText: oDominantFactor.label || this._getText("varianceNoFactor"),
                dominantFactorAmount: oDominantFactor.amount,
                dominantFactorState: oDominantFactor.state,
                priceNetAmount: fPriceNetAmount,
                priceNetState: this._amountState(fPriceNetAmount),
                processingNetAmount: fProcessingNetAmount,
                processingNetState: this._amountState(fProcessingNetAmount),
                mainIssueText: oMainIssue.text,
                mainIssueDescription: oMainIssue.description,
                mainIssueAmount: oMainIssue.amount,
                mainIssueUnit: oMainIssue.unit,
                mainIssueState: oMainIssue.state,
                detailMeaningTitle: oDetailMeaning.title,
                detailMeaningText: oDetailMeaning.text,
                detailMeaningState: oDetailMeaning.state,
                detailMeaningRows: oDetailMeaning.rows,
                detailActivityRows: aDetailActivityRows,
                hasDetailActivityRows: aDetailActivityRows.length > 0,
                hasActivityRateDiffPercent: aDetailActivityRows.some((oRow) => oRow.hasRateDiffPercent),
                checkPriorityRows: oCheckPriority.rows,
                hasCheckPriorityRows: oCheckPriority.rows.length > 0,
                checkPrioritySummary: oCheckPriority.summary,
                priceDirectionRows: bDetailMode ? [] : aPriceDirectionRows,
                priceDetailRows: bDetailMode ? this._buildDetailFactorRows(this._getText("varianceMaterialPriceDiff"), fPriceNetAmount, aResultRows[0] && aResultRows[0].waers || "") : [],
                managementSignalRows: bDetailMode ? [] : aManagementSignalRows,
                portfolioRows: bDetailMode ? [] : aPortfolioRows,
                actionRows: aActionRows,
                activityRateRows: bDetailMode ? [] : aRateRows,
                processingDetailRows: bDetailMode ? this._buildDetailFactorRows(this._getText("varianceProcessingDiff"), fProcessingNetAmount, aResultRows[0] && aResultRows[0].waers || "") : [],
                factorRows: aFactorRows.concat(oSettlementTotalRow),
                factorChartRows: aFactorRows,
                validationRows: aValidationRows
            };
        },

        _buildDetailFactorRows(sLabel, fAmount, sUnit) {
            return [{
                label: sLabel,
                amount: fAmount,
                unit: sUnit || "",
                state: this._amountState(fAmount)
            }];
        },

        _buildCheckPriorityRows(mContext) {
            const sCurrency = mContext.currency || "";
            const aRows = [
                {
                    key: "processing",
                    label: this._getText("varianceProcessingDiff"),
                    amount: Number(mContext.processingNetAmount) || 0
                },
                {
                    key: "price",
                    label: this._getText("varianceMaterialPriceDiff"),
                    amount: Number(mContext.priceNetAmount) || 0
                }
            ].map((oRow) => Object.assign({}, oRow, {
                absAmount: Math.abs(oRow.amount)
            })).filter((oRow) => oRow.absAmount > 0).sort((oLeft, oRight) => oRight.absAmount - oLeft.absAmount).slice(0, 2).map((oRow, iIndex) => {
                return {
                    key: oRow.key,
                    rankText: this._getText(iIndex === 0 ? "varianceCheckPriorityFirst" : "varianceCheckPrioritySecond"),
                    label: oRow.label,
                    amount: oRow.amount,
                    unit: sCurrency,
                    state: this._amountState(oRow.amount),
                    reason: this._getCheckPriorityReason(oRow.key, oRow.amount, iIndex)
                };
            });

            return {
                rows: aRows,
                summary: this._getCheckPrioritySummary(aRows[0])
            };
        },

        _getCheckPriorityReason(sKey, fAmount, iIndex) {
            const sPrefix = sKey === "processing" ? "Processing" : "Price";

            if (fAmount > 0) {
                return this._getText(iIndex === 0 ? "varianceCheckPriority" + sPrefix + "PrimaryUp" : "varianceCheckPriority" + sPrefix + "SecondaryUp");
            }

            if (fAmount < 0) {
                return this._getText("varianceCheckPriority" + sPrefix + "Down");
            }

            return this._getText("varianceCheckPriority" + sPrefix + "Review");
        },

        _getCheckPrioritySummary(oTopRow) {
            if (!oTopRow) {
                return this._getText("varianceCheckPrioritySummaryStable");
            }

            if (oTopRow.key === "processing") {
                return oTopRow.amount > 0 ?
                    this._getText("varianceCheckPrioritySummaryProcessingUp") :
                    this._getText("varianceCheckPrioritySummaryProcessingDown");
            }

            return oTopRow.amount > 0 ?
                this._getText("varianceCheckPrioritySummaryPriceUp") :
                this._getText("varianceCheckPrioritySummaryPriceDown");
        },

        _buildDetailMeaning(mContext) {
            const fTotalDiff = Number(mContext.totalDiff) || 0;
            const fPrice = Number(mContext.priceNetAmount) || 0;
            const fProcessing = Number(mContext.processingNetAmount) || 0;
            const fPriceAbs = Math.abs(fPrice);
            const fProcessingAbs = Math.abs(fProcessing);
            const sCurrency = mContext.currency || "";
            const sRateText = this._formatNumber(Math.abs(Number(mContext.totalDiffRate) || 0), 2);
            const sTitle = fTotalDiff > 0 ? this._getText("varianceMeaningTitleUp") :
                (fTotalDiff < 0 ? this._getText("varianceMeaningTitleDown") : this._getText("varianceMeaningTitleFlat"));
            let sLead = fTotalDiff > 0 ? this._getText("varianceMeaningLeadUp", [sRateText]) :
                (fTotalDiff < 0 ? this._getText("varianceMeaningLeadDown", [sRateText]) : this._getText("varianceMeaningLeadFlat"));
            const sTotalText = fTotalDiff > 0 ? this._getText("varianceMeaningTotalUp") :
                (fTotalDiff < 0 ? this._getText("varianceMeaningTotalDown") : this._getText("varianceMeaningTotalFlat"));
            let sDriverType = "";
            let fDriverAmount = 0;
            let sDriverText = this._getText("varianceMeaningDriverNone");
            let sDriverLabel = this._getText("varianceNoFactor");

            if (fProcessingAbs >= fPriceAbs && fProcessingAbs > 0) {
                sDriverType = "processing";
                fDriverAmount = fProcessing;
                sDriverLabel = this._getText("varianceProcessingDiff");
                sDriverText = fProcessing > 0 ? this._getText("varianceMeaningDriverProcessingUp") : this._getText("varianceMeaningDriverProcessingDown");
            } else if (fPriceAbs > 0) {
                sDriverType = "price";
                fDriverAmount = fPrice;
                sDriverLabel = this._getText("varianceMaterialPriceDiff");
                sDriverText = fPrice > 0 ? this._getText("varianceMeaningDriverPriceUp") : this._getText("varianceMeaningDriverPriceDown");
            }

            const bHasPrice = fPriceAbs > 0;
            const bHasProcessing = fProcessingAbs > 0;
            let sOffsetText = this._getText("varianceMeaningOffsetSingle");
            let sOffsetState = this._amountState(fTotalDiff);

            if (bHasPrice && bHasProcessing && fPrice * fProcessing < 0) {
                sOffsetText = this._getText("varianceMeaningOffsetMixed");
                sOffsetState = "Information";
            } else if (fPrice > 0 && fProcessing > 0) {
                sOffsetText = this._getText("varianceMeaningOffsetBothUp");
                sOffsetState = "Warning";
            } else if (fPrice < 0 && fProcessing < 0) {
                sOffsetText = this._getText("varianceMeaningOffsetBothDown");
                sOffsetState = "Success";
            }

            if (fTotalDiff > 0 && fProcessing > 0 && fPrice < 0) {
                sLead = this._getText("varianceMeaningLeadProcessingOverSaving", [sRateText]);
            } else if (fTotalDiff > 0 && fPrice > 0 && fProcessing < 0) {
                sLead = this._getText("varianceMeaningLeadPriceOverSaving", [sRateText]);
            } else if (fTotalDiff < 0 && fPrice < 0 && fProcessing > 0) {
                sLead = this._getText("varianceMeaningLeadPriceSavingOffset", [sRateText]);
            } else if (fTotalDiff < 0 && fProcessing < 0 && fPrice > 0) {
                sLead = this._getText("varianceMeaningLeadProcessingSavingOffset", [sRateText]);
            } else if (fTotalDiff > 0 && fPrice > 0 && fProcessing > 0) {
                sLead = this._getText("varianceMeaningLeadBothUp", [sRateText]);
            } else if (fTotalDiff < 0 && fPrice < 0 && fProcessing < 0) {
                sLead = this._getText("varianceMeaningLeadBothDown", [sRateText]);
            }

            let sNextText = this._getText("varianceMeaningNextStable");
            let sNextState = "Success";

            if ((Number(mContext.targetCount) || 0) > 0 || (Number(mContext.displayOnlyCount) || 0) > 0) {
                sNextText = this._getText("varianceMeaningNextData");
                sNextState = "Warning";
            } else if (sDriverType === "processing") {
                sNextText = this._getText("varianceMeaningNextProcessing");
                sNextState = fDriverAmount > 0 ? "Warning" : "Success";
            } else if (sDriverType === "price") {
                sNextText = this._getText("varianceMeaningNextPrice");
                sNextState = fDriverAmount > 0 ? "Warning" : "Success";
            }

            return {
                title: sTitle,
                text: sLead,
                state: this._amountState(fTotalDiff),
                rows: [
                    this._buildDetailMeaningRow(
                        this._getText("varianceMeaningRowTotal"),
                        sTotalText,
                        this._getText("varianceMeaningEvidenceTotal", [this._formatSignedAmount(fTotalDiff, sCurrency), sRateText]),
                        "sap-icon://compare",
                        this._amountState(fTotalDiff)
                    ),
                    this._buildDetailMeaningRow(
                        this._getText("varianceMeaningRowDriver"),
                        sDriverText,
                        sDriverType ? this._getText("varianceMeaningEvidenceFactor", [sDriverLabel, this._formatSignedAmount(fDriverAmount, sCurrency)]) : "",
                        sDriverType === "price" ? "sap-icon://cart" : (sDriverType === "processing" ? "sap-icon://factory" : "sap-icon://hint"),
                        this._amountState(fDriverAmount)
                    ),
                    this._buildDetailMeaningRow(
                        this._getText("varianceMeaningRowOffset"),
                        sOffsetText,
                        this._getText("varianceMeaningEvidenceOffset", [this._formatSignedAmount(fPrice, sCurrency), this._formatSignedAmount(fProcessing, sCurrency)]),
                        "sap-icon://horizontal-bar-chart",
                        sOffsetState
                    ),
                    this._buildDetailMeaningRow(
                        this._getText("varianceMeaningRowNext"),
                        sNextText,
                        this._getText("varianceMeaningEvidenceData", [mContext.completedCount || 0, mContext.targetCount || 0, mContext.displayOnlyCount || 0]),
                        "sap-icon://flag",
                        sNextState
                    )
                ]
            };
        },

        _buildDetailMeaningRow(sLabel, sText, sEvidence, sIcon, sState) {
            return {
                label: sLabel,
                text: sText,
                evidence: sEvidence,
                icon: sIcon,
                state: sState || "None"
            };
        },

        _buildDetailActivityMeaningRows(aActivityRows, sCurrency) {
            const aRows = (aActivityRows || []).filter((oRow) => {
                return oRow.rateDiff !== null && oRow.rateDiff !== undefined && Number.isFinite(Number(oRow.rateDiff));
            }).map((oRow) => {
                const fAmount = Number(oRow.rateDiff) || 0;
                const sDirection = fAmount > 0 ? "up" : (fAmount < 0 ? "down" : "flat");

                return {
                    key: oRow.key,
                    category: oRow.category,
                    label: oRow.label,
                    amount: fAmount,
                    absAmount: Math.abs(fAmount),
                    rateDiffPercent: oRow.rateDiffPercent,
                    hasRateDiffPercent: Number.isFinite(Number(oRow.rateDiffPercent)),
                    unit: oRow.rateUnit || sCurrency || "",
                    state: this._amountState(fAmount),
                    direction: sDirection
                };
            });

            const aPositiveKeys = aRows.filter((oRow) => oRow.amount > 0)
                .sort((oLeft, oRight) => oRight.absAmount - oLeft.absAmount)
                .map((oRow) => oRow.key);
            const fMaxAbsAmount = aRows.reduce((fMax, oRow) => Math.max(fMax, oRow.absAmount), 0);
            const fMaxAbsPercent = aRows.reduce((fMax, oRow) => {
                const fPercent = Number(oRow.rateDiffPercent);

                return Number.isFinite(fPercent) ? Math.max(fMax, Math.abs(fPercent)) : fMax;
            }, 0);

            return aRows.map((oRow) => {
                const iPositiveRank = aPositiveKeys.indexOf(oRow.key) + 1;
                const oPriority = this._getActivityPriority(oRow.direction, iPositiveRank);
                const sJudgement = this._getActivityJudgementText(oRow.direction, iPositiveRank);
                const sCheckText = this._getActivityCheckText(oRow.category, oRow.direction);
                const fPercent = Number(oRow.rateDiffPercent);
                const bHasPercent = Number.isFinite(fPercent);

                return Object.assign({}, oRow, {
                    priorityOrder: oPriority.order,
                    priorityText: oPriority.text,
                    priorityState: oPriority.state,
                    amountChartPercent: fMaxAbsAmount ? oRow.absAmount / fMaxAbsAmount * 100 : 0,
                    amountDisplayText: this._formatSignedAmount(oRow.amount, oRow.unit),
                    rateChartPercent: bHasPercent && fMaxAbsPercent ? Math.abs(fPercent) / fMaxAbsPercent * 100 : 0,
                    rateDisplayText: bHasPercent ? this._formatSignedPercent(fPercent) : "",
                    judgement: sJudgement,
                    checkText: sCheckText,
                    meaning: sJudgement,
                    action: sCheckText
                });
            }).sort((oLeft, oRight) => {
                if (oLeft.priorityOrder !== oRight.priorityOrder) {
                    return oLeft.priorityOrder - oRight.priorityOrder;
                }

                return oRight.absAmount - oLeft.absAmount;
            });
        },

        _getActivityPriority(sDirection, iPositiveRank) {
            if (sDirection === "up" && iPositiveRank === 1) {
                return {
                    order: 1,
                    text: this._getText("varianceCheckPriorityFirst"),
                    state: "Warning"
                };
            }

            if (sDirection === "up" && iPositiveRank === 2) {
                return {
                    order: 2,
                    text: this._getText("varianceCheckPrioritySecond"),
                    state: "Warning"
                };
            }

            return {
                order: sDirection === "up" ? 3 : 9,
                text: this._getText("varianceCheckPriorityReference"),
                state: sDirection === "down" ? "Success" : "None"
            };
        },

        _getActivityJudgementText(sDirection, iPositiveRank) {
            if (sDirection === "up" && iPositiveRank === 1) {
                return this._getText("varianceActivityJudgementPrimaryUp");
            }

            if (sDirection === "up") {
                return this._getText("varianceActivityJudgementSecondaryUp");
            }

            if (sDirection === "down") {
                return this._getText("varianceActivityJudgementDown");
            }

            return this._getText("varianceActivityJudgementFlat");
        },

        _getActivityCheckText(sCategory, sDirection) {
            const sKey = "varianceActivityCheck" + this._activityCategorySuffix(sCategory) + this._directionSuffix(sDirection);

            return this._getText(sKey);
        },

        _getActivityMeaningText(sCategory, sDirection) {
            const sKey = "varianceActivityMeaning" + this._activityCategorySuffix(sCategory) + this._directionSuffix(sDirection);

            return this._getText(sKey);
        },

        _getActivityActionText(sCategory, sDirection) {
            const sKey = "varianceActivityAction" + this._activityCategorySuffix(sCategory) + this._directionSuffix(sDirection);

            return this._getText(sKey);
        },

        _activityCategorySuffix(sCategory) {
            const mSuffix = {
                labor: "Labor",
                machine: "Machine",
                overhead: "Overhead"
            };

            return mSuffix[sCategory] || "Other";
        },

        _directionSuffix(sDirection) {
            const mSuffix = {
                up: "Up",
                down: "Down",
                flat: "Flat"
            };

            return mSuffix[sDirection] || "Flat";
        },

        _buildFactorRow(sLabel, fAmount, bTotal) {
            return {
                label: sLabel,
                amount: fAmount,
                absAmount: Math.abs(fAmount),
                state: this._amountState(fAmount),
                total: !!bTotal,
                sharePercent: 0,
                shareText: "0%"
            };
        },

        _buildVarianceStatus(mContext) {
            const iRowCount = Number(mContext.rowCount) || 0;

            if (!iRowCount) {
                return {
                    text: "",
                    state: "None"
                };
            }

            const bHasOpenItems = (Number(mContext.targetCount) || 0) > 0 || (Number(mContext.displayOnlyCount) || 0) > 0;
            const bHasPriorityIssue = (mContext.actionRows || []).some((oRow) => oRow.state === "Error" || oRow.state === "Warning");

            if (bHasOpenItems || bHasPriorityIssue) {
                return {
                    text: this._getText("varianceStatusNeedsCheck"),
                    state: "Warning"
                };
            }

            if (Math.abs(Number(mContext.totalDiff) || 0) > 0 ||
                    Math.abs(Number(mContext.priceNetAmount) || 0) > 0 ||
                    Math.abs(Number(mContext.processingNetAmount) || 0) > 0) {
                return {
                    text: this._getText("varianceStatusReviewable"),
                    state: "Information"
                };
            }

            return {
                text: this._getText("varianceStatusPostable"),
                state: "Success"
            };
        },

        _buildMainIssue(aActionRows) {
            const oIssue = (aActionRows || []).find((oRow) => oRow.state === "Error" || oRow.state === "Warning") || (aActionRows || [])[0];

            if (!oIssue) {
                return {
                    text: "",
                    description: "",
                    amount: null,
                    unit: "",
                    state: "None"
                };
            }

            return {
                text: oIssue.area || "",
                description: oIssue.signal || "",
                amount: oIssue.amount,
                unit: oIssue.unit || "",
                state: oIssue.state || "None"
            };
        },

        _buildValidationRows(mContext) {
            const aRows = [
                this._buildValidationRow(this._getText("varianceActualDone"), mContext.completedCount, mContext.actualTotalCost, "Success"),
                this._buildValidationRow(this._getText("varianceActualTarget"), mContext.targetCount, null, mContext.targetCount > 0 ? "Warning" : "Success"),
                this._buildValidationRow(this._getText("varianceActualDisplayOnly"), mContext.displayOnlyCount, null, mContext.displayOnlyCount > 0 ? "Warning" : "Success")
            ];

            if (!mContext.detailMode) {
                aRows.push(this._buildValidationRow(this._getText("varianceSignalStandardReview"), mContext.standardReviewCount, mContext.standardReviewAmount, mContext.standardReviewCount > 0 ? "Warning" : "Success"));
            }

            return aRows;
        },

        _buildValidationRow(sLabel, iCount, fAmount, sState) {
            return {
                label: sLabel,
                statusText: sState === "Success" ? this._getText("varianceStatusPostable") : this._getText("varianceStatusNeedsCheck"),
                count: iCount || 0,
                amount: fAmount,
                state: sState
            };
        },

        _loadActivityRateRows(oFilters) {
            const oStandardModel = this._getActivityRateModel();

            return this._readActivityRateSourceRows(oStandardModel, oFilters, "standard")
                .then((aExpectedRows) => this._buildActivityRateRowsFromProcessingRows(aExpectedRows))
                .catch((oError) => {
                    console.warn("Expected processing amount load skipped:", oError);
                    return [];
                });
        },

        _getActivityRateModel() {
            const sModelName = "standardActivityRateModel";
            const sServiceUri = "/sap/opu/odata/sap/ZCDS_E4_CO_0016_CDS/";
            let oModel = this.getOwnerComponent().getModel(sModelName);

            if (!oModel) {
                oModel = new ODataModel(sServiceUri, {
                    defaultBindingMode: "OneWay",
                    json: true,
                    loadMetadataAsync: true,
                    useBatch: false
                });
                this.getOwnerComponent().setModel(oModel, sModelName);
            }

            return oModel;
        },

        _readActivityRateSourceRows(oModel, oFilters, sKind) {
            return this._getActivityRateReadInfo(oModel, oFilters, sKind).then((oReadInfo) => {
                if (!oReadInfo.path) {
                    return [];
                }

                return this._readODataList(oModel, oReadInfo.path, {
                    filters: this._buildActivityRateFilters(oFilters, oReadInfo.propertyNames)
                });
            });
        },

        _readActivityRateRows(oModel, oFilters, sKind) {
            return this._readActivityRateSourceRows(oModel, oFilters, sKind).then((aRows) => {
                return (aRows || []).map((oRow) => {
                    return this._normalizeActivityRateRow(oRow, sKind);
                }).filter(Boolean);
            });
        },

        _getActivityRateReadInfo(oModel, oFilters, sKind) {
            return oModel.metadataLoaded().then(() => {
                const oMetadata = oModel.getServiceMetadata() || {};
                const aEntitySets = this._getEntitySets(oMetadata);
                const oParameterSet = aEntitySets.find((oEntitySet) => {
                    const oEntityType = this._getEntityType(oMetadata, oEntitySet.entityType);
                    return oEntityType && (oEntityType["sap:semantics"] === "parameters" || /Parameters$/.test(oEntityType.name || ""));
                });
                const aDataEntitySets = aEntitySets.filter((oEntitySet) => oEntitySet !== oParameterSet);
                const oDataEntitySet = this._findActivityRateEntitySet(oMetadata, aDataEntitySets, sKind) || aDataEntitySets[0];
                const oDataEntityType = oDataEntitySet && this._getEntityType(oMetadata, oDataEntitySet.entityType);
                const aPropertyNames = this._getPropertyNames(oDataEntityType);

                if (!oDataEntitySet) {
                    return {
                        path: "",
                        propertyNames: []
                    };
                }

                if (oParameterSet) {
                    const oParameterType = this._getEntityType(oMetadata, oParameterSet.entityType);
                    const mParameters = this._buildActivityRateParameters(this._getKeyPropertyNames(oParameterType), oFilters);

                    return {
                        path: "/" + oModel.createKey(oParameterSet.name, mParameters) + "/Set",
                        propertyNames: aPropertyNames
                    };
                }

                return {
                    path: "/" + oDataEntitySet.name,
                    propertyNames: aPropertyNames
                };
            });
        },

        _buildActivityRateRowsFromProcessingRows(aRows) {
            const aSourceRows = Array.isArray(aRows) ? aRows : [];
            const aDefinitions = [
                {
                    category: "labor",
                    standardFields: ["labor_std_processing_amt", "labor_standard_processing_amt", "labor_std_amt", "labor_std_cost", "labor_plan_amt", "labor_plan_cost", "labor_standard_cost", "std_labor_processing_amt", "std_labor_amt"],
                    actualFields: ["labor_actual_processing_amt", "labor_actual_amt", "labor_actual_cost", "labor_real_amt", "labor_real_cost", "actual_labor_processing_amt", "actual_labor_amt"],
                    diffFields: ["labor_processing_diff_amt", "labor_diff_amt", "labor_variance_amt", "labor_cost_diff_amt", "labor_cost_variance_amt", "labor_var_amt"]
                },
                {
                    category: "machine",
                    standardFields: ["mach_std_processing_amt", "machine_std_processing_amt", "mach_std_amt", "machine_std_amt", "mach_std_cost", "machine_std_cost", "mach_plan_amt", "machine_plan_amt", "std_machine_processing_amt", "std_machine_amt"],
                    actualFields: ["mach_actual_processing_amt", "machine_actual_processing_amt", "mach_actual_amt", "machine_actual_amt", "mach_actual_cost", "machine_actual_cost", "mach_real_amt", "machine_real_amt", "actual_machine_processing_amt", "actual_machine_amt"],
                    diffFields: ["mach_processing_diff_amt", "machine_processing_diff_amt", "mach_diff_amt", "machine_diff_amt", "mach_variance_amt", "machine_variance_amt", "machine_cost_diff_amt", "mach_var_amt"]
                },
                {
                    category: "overhead",
                    standardFields: ["overhead_std_processing_amt", "indirect_std_processing_amt", "oh_std_processing_amt", "overhead_std_amt", "indirect_std_amt", "oh_std_amt", "overhead_std_cost", "indirect_std_cost", "std_overhead_processing_amt", "std_overhead_amt"],
                    actualFields: ["overhead_actual_processing_amt", "indirect_actual_processing_amt", "oh_actual_processing_amt", "overhead_actual_amt", "indirect_actual_amt", "oh_actual_amt", "overhead_actual_cost", "indirect_actual_cost", "actual_overhead_processing_amt", "actual_overhead_amt"],
                    diffFields: ["overhead_processing_diff_amt", "indirect_processing_diff_amt", "oh_processing_diff_amt", "overhead_diff_amt", "indirect_diff_amt", "oh_diff_amt", "overhead_variance_amt", "indirect_variance_amt", "overhead_cost_diff_amt"]
                }
            ];

            return this._finalizeActivityRateRows(aDefinitions.map((oDefinition) => {
                return this._buildActivityAmountRow(aSourceRows, oDefinition);
            }).filter(Boolean));
        },

        _buildActivityAmountRow(aRows, oDefinition) {
            const fnHasValue = (aFields) => (aFields || []).length > 0 && aRows.some((oRow) => {
                return this._toNumber(this._readFirstField(oRow, aFields)) !== null;
            });
            const fnSum = (aFields) => aRows.reduce((fSum, oRow) => {
                const fValue = this._toNumber(this._readFirstField(oRow, aFields));
                return fValue === null ? fSum : fSum + fValue;
            }, 0);
            const bHasStandard = fnHasValue(oDefinition.standardFields);
            const bHasActual = fnHasValue(oDefinition.actualFields);
            const bHasDiff = fnHasValue(oDefinition.diffFields);
            const fStandardAmount = bHasStandard ? fnSum(oDefinition.standardFields) : null;
            const fActualAmount = bHasActual ? fnSum(oDefinition.actualFields) : null;
            const bCanCompare = fStandardAmount !== null && fActualAmount !== null;

            if (!bHasStandard && !bHasActual && !bHasDiff) {
                return null;
            }

            const fDiffAmount = bCanCompare ? (bHasDiff ? fnSum(oDefinition.diffFields) : fActualAmount - fStandardAmount) : null;
            const fDiffPercent = bCanCompare && fStandardAmount ? fDiffAmount / fStandardAmount * 100 : null;
            const sState = fDiffAmount === null ? "None" : this._amountState(fDiffAmount);
            const sDirection = fDiffAmount > 0 ? "Improve" : (fDiffAmount < 0 ? "Saved" : "NoDiff");

            return {
                key: oDefinition.category,
                category: oDefinition.category,
                label: this._getActivityRateCategoryLabel(oDefinition.category),
                standardRate: fStandardAmount,
                actualRate: fActualAmount,
                rateDiff: fDiffAmount,
                rateDiffPercent: fDiffPercent,
                rateUnit: this._getActivityAmountUnit(aRows),
                state: sState,
                interpretation: this._getActivityRateInterpretation(oDefinition.category, sDirection, bCanCompare),
                sharePercent: 0,
                shareText: "0%"
            };
        },

        _getActivityAmountUnit(aRows) {
            const aSourceRows = Array.isArray(aRows) ? aRows : [];

            for (let i = 0; i < aSourceRows.length; i += 1) {
                const sCurrency = String(this._readFirstField(aSourceRows[i], ["waers", "currency", "curr", "twaer"]) || "").trim();

                if (sCurrency) {
                    return sCurrency;
                }
            }

            for (let i = 0; i < aSourceRows.length; i += 1) {
                const sUnit = this._buildActivityRateUnit(aSourceRows[i]);

                if (sUnit) {
                    return sUnit;
                }
            }

            return "";
        },

        _finalizeActivityRateRows(aRows) {
            const fAbsTotal = (aRows || []).reduce((fSum, oRow) => fSum + (oRow.rateDiff === null ? 0 : Math.abs(oRow.rateDiff)), 0);
            const mOrder = {
                labor: 1,
                machine: 2,
                overhead: 3,
                other: 4
            };

            (aRows || []).forEach((oRow) => {
                oRow.sharePercent = fAbsTotal && oRow.rateDiff !== null ? Math.abs(oRow.rateDiff) / fAbsTotal * 100 : 0;
                oRow.shareText = this._formatNumber(oRow.sharePercent, 1) + "%";
            });

            return (aRows || []).sort((oLeft, oRight) => {
                const iLeftOrder = mOrder[oLeft.category] || 9;
                const iRightOrder = mOrder[oRight.category] || 9;

                if (iLeftOrder !== iRightOrder) {
                    return iLeftOrder - iRightOrder;
                }

                return Math.abs(oRight.rateDiff || 0) - Math.abs(oLeft.rateDiff || 0);
            });
        },

        _buildActivityRateRows(aStandardRows, aActualRows) {
            const mGroups = {};
            const fnEnsureGroup = (oRateRow) => {
                const sKey = oRateRow.key;

                if (!mGroups[sKey]) {
                    mGroups[sKey] = {
                        key: sKey,
                        category: oRateRow.category,
                        label: oRateRow.label,
                        rateUnit: oRateRow.rateUnit,
                        standardWeightedRate: 0,
                        standardWeight: 0,
                        actualWeightedRate: 0,
                        actualWeight: 0
                    };
                }

                if (!mGroups[sKey].rateUnit && oRateRow.rateUnit) {
                    mGroups[sKey].rateUnit = oRateRow.rateUnit;
                }

                return mGroups[sKey];
            };

            (aStandardRows || []).forEach((oRateRow) => this._mergeActivityRateValue(fnEnsureGroup(oRateRow), oRateRow, "standard"));
            (aActualRows || []).forEach((oRateRow) => this._mergeActivityRateValue(fnEnsureGroup(oRateRow), oRateRow, "actual"));

            const aRows = Object.keys(mGroups).map((sKey) => this._buildActivityRateRow(mGroups[sKey])).filter(Boolean);
            const fAbsTotal = aRows.reduce((fSum, oRow) => fSum + (oRow.rateDiff === null ? 0 : Math.abs(oRow.rateDiff)), 0);

            aRows.forEach((oRow) => {
                oRow.sharePercent = fAbsTotal && oRow.rateDiff !== null ? Math.abs(oRow.rateDiff) / fAbsTotal * 100 : 0;
                oRow.shareText = this._formatNumber(oRow.sharePercent, 1) + "%";
            });

            return aRows.sort((oLeft, oRight) => {
                const mOrder = {
                    labor: 1,
                    machine: 2,
                    overhead: 3,
                    other: 4
                };
                const iLeftOrder = mOrder[oLeft.category] || 9;
                const iRightOrder = mOrder[oRight.category] || 9;

                if (iLeftOrder !== iRightOrder) {
                    return iLeftOrder - iRightOrder;
                }

                return Math.abs(oRight.rateDiff || 0) - Math.abs(oLeft.rateDiff || 0);
            });
        },

        _mergeActivityRateValue(oGroup, oRateRow, sKind) {
            const fWeight = oRateRow.quantity && oRateRow.quantity > 0 ? Math.abs(oRateRow.quantity) : 1;
            const sRateKey = sKind + "WeightedRate";
            const sWeightKey = sKind + "Weight";

            oGroup[sRateKey] += oRateRow.rate * fWeight;
            oGroup[sWeightKey] += fWeight;
        },

        _buildActivityRateRow(oGroup) {
            const fStandardRate = oGroup.standardWeight ? oGroup.standardWeightedRate / oGroup.standardWeight : null;
            const fActualRate = oGroup.actualWeight ? oGroup.actualWeightedRate / oGroup.actualWeight : null;
            const bCanCompare = fStandardRate !== null && fActualRate !== null;
            const fRateDiff = bCanCompare ? fActualRate - fStandardRate : null;
            const fRateDiffPercent = bCanCompare && fStandardRate ? fRateDiff / fStandardRate * 100 : null;
            const sState = fRateDiff === null ? "None" : this._amountState(fRateDiff);
            const sDirection = fRateDiff > 0 ? "Improve" : (fRateDiff < 0 ? "Saved" : "NoDiff");

            return {
                key: oGroup.key,
                category: oGroup.category,
                label: oGroup.label,
                standardRate: fStandardRate,
                actualRate: fActualRate,
                rateDiff: fRateDiff,
                rateDiffPercent: fRateDiffPercent,
                rateUnit: oGroup.rateUnit,
                state: sState,
                interpretation: this._getActivityRateInterpretation(oGroup.category, sDirection, bCanCompare),
                sharePercent: 0,
                shareText: "0%"
            };
        },

        _normalizeActivityRateRow(oRow, sKind) {
            const oFields = this._getActivityRateCandidateFields(sKind);
            let fRate = this._toNumber(this._readFirstField(oRow, oFields.rate));
            const fQuantity = this._toNumber(this._readFirstField(oRow, oFields.quantity));
            const fAmount = this._toNumber(this._readFirstField(oRow, oFields.amount));

            if (fRate === null && fAmount !== null && fQuantity) {
                fRate = fAmount / fQuantity;
            }

            if (fRate === null) {
                return null;
            }

            const sCode = String(this._readFirstField(oRow, oFields.activityCode) || "").trim();
            const sText = String(this._readFirstField(oRow, oFields.activityText) || "").trim();
            const sCategorySource = [
                sCode,
                sText,
                String(this._readFirstField(oRow, oFields.category) || ""),
                String(this._readFirstField(oRow, oFields.account) || "")
            ].join(" ");
            const sCategory = this._getActivityRateCategory(sCategorySource);
            const sLabel = sCategory === "other" ? (sText || sCode || this._getText("varianceActivityRateOther")) : this._getActivityRateCategoryLabel(sCategory);

            return {
                key: sCategory === "other" ? sCategory + "|" + (sCode || sText || sKind) : sCategory,
                category: sCategory,
                label: sLabel,
                rate: fRate,
                quantity: fQuantity,
                rateUnit: this._buildActivityRateUnit(oRow)
            };
        },

        _getActivityRateCandidateFields(sKind) {
            const aCommonRateFields = ["activity_rate", "rate", "tarif", "price", "unit_price", "activity_unit_price"];

            return {
                rate: (sKind === "standard" ? [
                    "std_activity_rate",
                    "standard_activity_rate",
                    "plan_activity_rate",
                    "planned_activity_rate",
                    "std_rate",
                    "standard_rate",
                    "plan_rate",
                    "planned_rate",
                    "std_price",
                    "standard_price",
                    "plan_price",
                    "planned_price"
                ] : [
                    "actual_activity_rate",
                    "real_activity_rate",
                    "split_activity_rate",
                    "actual_rate",
                    "act_rate",
                    "real_rate",
                    "actual_price",
                    "act_price"
                ]).concat(aCommonRateFields),
                activityCode: ["activity_type", "activitytype", "activity_type_code", "acttype", "act_type", "lstar", "kostl_activity_type"],
                activityText: ["activity_type_text", "activity_text", "activity_name", "lstar_text", "ktext", "ltext", "txt50", "txt", "name"],
                category: ["activity_category", "activity_group", "processing_type", "cost_component", "component", "account_role", "split_group"],
                account: ["saknr", "kstar", "gl_account", "account_code", "cost_element", "costelement", "account"],
                amount: (sKind === "standard" ? [
                    "std_activity_cost",
                    "standard_activity_cost",
                    "plan_activity_cost",
                    "planned_activity_cost",
                    "std_amount",
                    "standard_amount",
                    "plan_amount",
                    "std_cost",
                    "standard_cost"
                ] : [
                    "actual_split_cost",
                    "actual_split_amt",
                    "split_cost",
                    "split_amt",
                    "actual_activity_cost",
                    "actual_activity_amt",
                    "actual_amount",
                    "actual_cost",
                    "raw_actual_cost"
                ]).concat(["amount", "amt", "cost"]),
                quantity: (sKind === "standard" ? [
                    "std_activity_qty",
                    "standard_activity_qty",
                    "plan_activity_qty",
                    "planned_activity_qty",
                    "std_qty",
                    "standard_qty",
                    "plan_qty",
                    "planned_qty"
                ] : [
                    "actual_activity_qty",
                    "activity_qty",
                    "actual_qty",
                    "actual_hours",
                    "lmnga",
                    "ismng",
                    "msl"
                ]).concat(["quantity", "qty", "hours", "menge"])
            };
        },

        _getActivityRateCategory(sValue) {
            const sText = String(sValue || "").toLowerCase();

            if (/800020|800001|800003|labor|lab|man|노무|공수|인건|임금|급여|근로/.test(sText)) {
                return "labor";
            }

            if (/800021|mach|machine|equip|기계|설비|가동|장비/.test(sText)) {
                return "machine";
            }

            if (/800022|overhead|ovrh|oh|indirect|간접|공통|경비|제조간접/.test(sText)) {
                return "overhead";
            }

            return "other";
        },

        _getActivityRateCategoryLabel(sCategory) {
            const mLabels = {
                labor: "varianceActivityRateLabor",
                machine: "varianceActivityRateMachine",
                overhead: "varianceActivityRateOverhead",
                other: "varianceActivityRateOther"
            };

            return this._getText(mLabels[sCategory] || mLabels.other);
        },

        _getActivityRateInterpretation(sCategory, sDirection, bCanCompare) {
            if (!bCanCompare) {
                return this._getText("varianceActivityRateIncomplete");
            }

            const sCategoryKey = {
                labor: "Labor",
                machine: "Machine",
                overhead: "Overhead",
                other: "Other"
            }[sCategory] || "Other";

            return this._getText("varianceActivityRate" + sCategoryKey + sDirection);
        },

        _buildActivityRateUnit(oRow) {
            const sCurrency = String(this._readFirstField(oRow, ["waers", "currency", "curr", "twaer"]) || "").trim();
            const sActivityUnit = String(this._readFirstField(oRow, ["activity_unit", "unit_of_measure", "uom", "meinh", "meins"]) || "").trim();

            if (sCurrency && sActivityUnit && sCurrency !== sActivityUnit) {
                return sCurrency + "/" + sActivityUnit;
            }

            return sCurrency || sActivityUnit || "";
        },

        _buildActivityRateParameters(aPropertyNames, oFilters) {
            return (aPropertyNames || []).reduce((mParameters, sProperty) => {
                const sLower = String(sProperty).toLowerCase();
                let vValue = "";

                if (sLower.indexOf("bukrs") !== -1 || sLower.indexOf("company") !== -1) {
                    vValue = oFilters.bukrs;
                } else if (sLower.indexOf("gjahr") !== -1 || sLower.indexOf("year") !== -1) {
                    vValue = oFilters.gjahr;
                } else if (sLower.indexOf("monat") !== -1 || sLower.indexOf("poper") !== -1 || sLower.indexOf("period") !== -1 || sLower.indexOf("perio") !== -1) {
                    vValue = sLower.indexOf("p_") === 0 || sLower.indexOf("poper") !== -1 || sLower.indexOf("period") !== -1 || sLower.indexOf("perio") !== -1 ? this._toPoper(oFilters.monat) : oFilters.monat;
                } else if (sLower.indexOf("werks") !== -1 || sLower.indexOf("plant") !== -1) {
                    vValue = "";
                } else if (sLower.indexOf("matnr") !== -1 || sLower.indexOf("material") !== -1) {
                    vValue = oFilters.matnr;
                } else if (sLower.indexOf("mtopt") !== -1) {
                    vValue = oFilters.mtopt;
                }

                mParameters[sProperty] = vValue;
                return mParameters;
            }, {});
        },

        _buildActivityRateFilters(oFilters, aPropertyNames) {
            const aFilters = [];
            const mUsedFields = {};
            const fnAddFilter = (aCandidates, vValue) => {
                const sField = this._resolvePropertyName(aPropertyNames, aCandidates);

                if (!sField || !vValue || mUsedFields[sField]) {
                    return;
                }

                mUsedFields[sField] = true;
                aFilters.push(new Filter(sField, FilterOperator.EQ, vValue));
            };

            fnAddFilter(["bukrs", "company_code", "companycode", "rbukrs"], oFilters.bukrs);
            fnAddFilter(["gjahr", "fiscal_year", "fiscalyear"], oFilters.gjahr);
            fnAddFilter(["monat", "month"], oFilters.monat);
            fnAddFilter(["poper", "period", "fiscal_period", "fiscalperiod", "perio"], this._toPoper(oFilters.monat));
            fnAddFilter(["matnr", "material", "material_number"], oFilters.matnr);
            fnAddFilter(["mtopt", "product_type", "material_option"], oFilters.mtopt);

            return aFilters;
        },

        _findActivityRateEntitySet(oMetadata, aEntitySets, sKind) {
            const oBestMatch = (aEntitySets || []).reduce((oBest, oEntitySet) => {
                const oEntityType = this._getEntityType(oMetadata, oEntitySet.entityType);
                const iScore = this._scoreActivityRateEntitySet(oEntitySet, this._getPropertyNames(oEntityType), sKind);

                if (!oBest || iScore > oBest.score) {
                    return {
                        entitySet: oEntitySet,
                        score: iScore
                    };
                }

                return oBest;
            }, null);

            return oBestMatch && oBestMatch.entitySet || null;
        },

        _scoreActivityRateEntitySet(oEntitySet, aPropertyNames, sKind) {
            const sName = String(oEntitySet && oEntitySet.name || "").toLowerCase();
            const oFields = this._getActivityRateCandidateFields(sKind);
            let iScore = 0;

            if (this._resolvePropertyName(aPropertyNames, oFields.rate)) {
                iScore += 10;
            }

            if (this._resolvePropertyName(aPropertyNames, oFields.amount) && this._resolvePropertyName(aPropertyNames, oFields.quantity)) {
                iScore += 8;
            }

            if (this._resolvePropertyName(aPropertyNames, oFields.activityCode.concat(oFields.activityText))) {
                iScore += 5;
            }

            if (this._resolvePropertyName(aPropertyNames, ["gjahr", "monat", "poper", "period"])) {
                iScore += 2;
            }

            if (sName.indexOf("0016") !== -1 || sName.indexOf("0034") !== -1) {
                iScore += 2;
            }

            return iScore;
        },

        _getEntitySets(oMetadata) {
            const aSchemas = oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema || [];

            return aSchemas.reduce((aResult, oSchema) => {
                (oSchema.entityContainer || []).forEach((oContainer) => {
                    aResult.push.apply(aResult, oContainer.entitySet || []);
                });
                return aResult;
            }, []);
        },

        _getEntityType(oMetadata, sQualifiedName) {
            const aSchemas = oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema || [];
            const sEntityTypeName = String(sQualifiedName || "").split(".").pop();

            for (let i = 0; i < aSchemas.length; i += 1) {
                const aEntityTypes = aSchemas[i].entityType || [];
                const oEntityType = aEntityTypes.find((oType) => oType.name === sEntityTypeName);

                if (oEntityType) {
                    return oEntityType;
                }
            }

            return null;
        },

        _getPropertyNames(oEntityType) {
            return (oEntityType && oEntityType.property || []).map((oProperty) => oProperty.name);
        },

        _getKeyPropertyNames(oEntityType) {
            const aPropertyRefs = oEntityType && oEntityType.key && oEntityType.key.propertyRef || [];
            const aKeyNames = aPropertyRefs.map((oPropertyRef) => oPropertyRef.name);

            return aKeyNames.length ? aKeyNames : this._getPropertyNames(oEntityType);
        },

        _resolvePropertyName(aPropertyNames, aCandidates) {
            const aNames = aPropertyNames || [];

            for (let i = 0; i < (aCandidates || []).length; i += 1) {
                const sCandidate = String(aCandidates[i]).toLowerCase();
                const sName = aNames.find((sPropertyName) => String(sPropertyName).toLowerCase() === sCandidate);

                if (sName) {
                    return sName;
                }
            }

            return "";
        },

        _readFirstField(oRow, aFields) {
            const aKeys = Object.keys(oRow || {});

            for (let i = 0; i < (aFields || []).length; i += 1) {
                const sCandidate = String(aFields[i]).toLowerCase();
                const sKey = aKeys.find((sPropertyName) => String(sPropertyName).toLowerCase() === sCandidate);

                if (sKey && oRow[sKey] !== null && oRow[sKey] !== undefined && oRow[sKey] !== "") {
                    return oRow[sKey];
                }
            }

            return null;
        },

        _toNumber(vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            const fValue = Number(vValue);
            return Number.isFinite(fValue) ? fValue : null;
        },

        _buildDirectionRow(sLabel, fAmount, iCount, fTotalAbsAmount, sState, sInterpretation) {
            const fShare = fTotalAbsAmount ? Math.min(100, Math.abs(fAmount) / fTotalAbsAmount * 100) : 0;

            return {
                label: sLabel,
                amount: fAmount,
                count: iCount,
                sharePercent: fShare,
                shareText: this._formatNumber(fShare, 1) + "%",
                state: sState,
                interpretation: sInterpretation
            };
        },

        _buildSignalRow(sTitle, sText, fValue, sUnit, sState) {
            return {
                title: sTitle,
                text: sText,
                value: fValue,
                unit: sUnit,
                state: sState
            };
        },

        _buildPortfolioRows(aRows, fStdTotalCost, fnNumber) {
            const aGroups = [
                {
                    key: "marginPressure",
                    label: this._getText("variancePortfolioMarginPressure"),
                    text: this._getText("variancePortfolioMarginPressureText"),
                    state: "Warning",
                    test: (oRow) => fnNumber(oRow.price_diff_amt) > 0 && fnNumber(oRow.totalDiffAmt) > 0
                },
                {
                    key: "costImprovement",
                    label: this._getText("variancePortfolioCostImprovement"),
                    text: this._getText("variancePortfolioCostImprovementText"),
                    state: "Success",
                    test: (oRow) => fnNumber(oRow.price_diff_amt) < 0 && fnNumber(oRow.totalDiffAmt) < 0
                },
                {
                    key: "offset",
                    label: this._getText("variancePortfolioOffset"),
                    text: this._getText("variancePortfolioOffsetText"),
                    state: "Information",
                    test: (oRow) => fnNumber(oRow.price_diff_amt) > 0 && fnNumber(oRow.totalDiffAmt) <= 0
                },
                {
                    key: "otherDriver",
                    label: this._getText("variancePortfolioOtherDriver"),
                    text: this._getText("variancePortfolioOtherDriverText"),
                    state: "Error",
                    test: (oRow) => fnNumber(oRow.price_diff_amt) < 0 && fnNumber(oRow.totalDiffAmt) >= 0
                }
            ];
            const fTotalAbsDiff = aRows.reduce((fSum, oRow) => fSum + Math.abs(fnNumber(oRow.totalDiffAmt)), 0);

            return aGroups.map((oGroup) => {
                const aMatchedRows = aRows.filter(oGroup.test);
                const fAmount = aMatchedRows.reduce((fSum, oRow) => fSum + Math.abs(fnNumber(oRow.totalDiffAmt)), 0);
                const fShare = fTotalAbsDiff ? fAmount / fTotalAbsDiff * 100 : 0;
                const fRate = fStdTotalCost ? fAmount / Math.abs(fStdTotalCost) * 100 : 0;

                return {
                    key: oGroup.key,
                    label: oGroup.label,
                    text: oGroup.text,
                    count: aMatchedRows.length,
                    amount: fAmount,
                    rate: fRate,
                    sharePercent: fShare,
                    shareText: this._formatNumber(fShare, 1) + "%",
                    state: oGroup.state
                };
            });
        },

        _buildActionRows(mContext) {
            const aRows = [];

            if (mContext.priceUnfavorableAmount >= mContext.priceFavorableAmount && mContext.priceUnfavorableAmount > 0) {
                aRows.push(this._buildActionRow(this._getText("varianceActionPurchaseArea"), this._getText("varianceActionPurchaseSignal"), this._getText("varianceActionPurchaseRecommendation"), mContext.priceUnfavorableAmount, mContext.currency, "Warning"));
            } else if (mContext.priceFavorableAmount > 0) {
                aRows.push(this._buildActionRow(this._getText("varianceActionSavingArea"), this._getText("varianceActionSavingSignal"), this._getText("varianceActionSavingRecommendation"), mContext.priceFavorableAmount, mContext.currency, "Success"));
            }

            if (!mContext.detailMode && mContext.priceConcentration >= 50) {
                aRows.push(this._buildActionRow(this._getText("varianceActionConcentrationArea"), this._getText("varianceActionConcentrationSignal", [this._formatNumber(mContext.priceConcentration, 1)]), this._getText("varianceActionConcentrationRecommendation"), mContext.priceConcentration, "%", "Warning"));
            }

            if (!mContext.detailMode && mContext.standardReviewCount > 0) {
                aRows.push(this._buildActionRow(this._getText("varianceActionStandardArea"), this._getText("varianceActionStandardSignal", [mContext.standardReviewCount]), this._getText("varianceActionStandardRecommendation"), mContext.standardReviewAmount, mContext.currency, "Warning"));
            }

            if (!mContext.detailMode && mContext.operationShare >= 35) {
                aRows.push(this._buildActionRow(this._getText("varianceActionOperationArea"), this._getText("varianceActionOperationSignal", [this._formatNumber(mContext.operationShare, 1)]), this._getText("varianceActionOperationRecommendation"), mContext.operationAmount, mContext.currency, "Information"));
            } else if (mContext.detailMode && mContext.operationAmount > 0) {
                aRows.push(this._buildActionRow(this._getText("varianceActionOperationArea"), this._getText("varianceProcessingDiff"), this._getText("varianceActionOperationRecommendation"), mContext.operationAmount, mContext.currency, "Warning"));
            }

            if (aRows.length === 0) {
                aRows.push(this._buildActionRow(this._getText("varianceActionStableArea"), this._getText("varianceActionStableSignal"), this._getText("varianceActionStableRecommendation"), Math.abs(mContext.priceNetAmount), mContext.currency, "Success"));
            }

            const mPriority = {
                Error: 0,
                Warning: 1,
                Information: 2,
                Success: 3,
                None: 4
            };

            return aRows.sort((oLeft, oRight) => {
                return (mPriority[oLeft.state] || 9) - (mPriority[oRight.state] || 9);
            }).slice(0, 4).map((oRow, iIndex) => Object.assign({ priority: iIndex + 1 }, oRow));
        },

        _buildActionRow(sArea, sSignal, sRecommendation, fAmount, sUnit, sState) {
            return {
                area: sArea,
                signal: sSignal,
                recommendation: sRecommendation,
                amount: fAmount,
                unit: sUnit,
                state: sState
            };
        },

        _getTopAbsShare(aRows, sProperty, iCount, fnNumber) {
            const aAmounts = (aRows || []).map((oRow) => Math.abs(fnNumber(oRow[sProperty]))).filter((fValue) => fValue > 0).sort((fLeft, fRight) => fRight - fLeft);
            const fTotal = aAmounts.reduce((fSum, fValue) => fSum + fValue, 0);
            const fTop = aAmounts.slice(0, iCount).reduce((fSum, fValue) => fSum + fValue, 0);

            return fTotal ? fTop / fTotal * 100 : 0;
        },

        _prepareRow(oRow) {
            const fSettlementVarianceAmount = this._calculateSettlementVarianceAmount(oRow);

            return Object.assign({}, oRow, {
                settlement_variance_amt: fSettlementVarianceAmount,
                actualStatusText: this._formatActualStatus(oRow),
                actualStatusState: this._formatActualState(oRow),
                processingDiffState: this._amountState(oRow.processing_diff_amt),
                priceDiffState: this._amountState(oRow.price_diff_amt),
                settlementVarianceState: this._amountState(fSettlementVarianceAmount),
                diffRateState: this._amountState(oRow.diff_rate_pct)
            });
        },

        _isActualCompletedRow(oRow) {
            if (Object.prototype.hasOwnProperty.call(oRow || {}, "actual_exists")) {
                return String(oRow.actual_exists || "").trim().toUpperCase() === "X";
            }

            return this._hasFiniteNumber(oRow && oRow.actual_total_cost);
        },

        _calculateSettlementVarianceAmount(oRow) {
            const bHasPriceDiff = this._hasFiniteNumber(oRow.price_diff_amt);
            const bHasProcessingDiff = this._hasFiniteNumber(oRow.processing_diff_amt);

            if (bHasPriceDiff || bHasProcessingDiff) {
                return this._toAmountNumber(oRow.price_diff_amt) + this._toAmountNumber(oRow.processing_diff_amt);
            }

            return this._toAmountNumber(oRow.settlement_variance_amt);
        },

        _hasFiniteNumber(vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return false;
            }

            return Number.isFinite(Number(vValue));
        },

        _toAmountNumber(vValue) {
            const fValue = Number(vValue);
            return Number.isFinite(fValue) ? fValue : 0;
        },

        formatAmount(vValue) {
            return this._formatNumber(vValue, 0);
        },

        formatRate(vValue) {
            return this._formatNumber(vValue, 2);
        },

        formatPercent(vValue) {
            const sValue = this._formatNumber(vValue, 2);
            return sValue === "" ? "" : sValue + "%";
        },

        formatCount(aRows) {
            return Array.isArray(aRows) ? aRows.length + "건" : "0건";
        },

        _formatNumber(vValue, iMaximumFractionDigits) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return "";
            }

            const fValue = Number(vValue);
            if (!Number.isFinite(fValue)) {
                return String(vValue);
            }

            return new Intl.NumberFormat("ko-KR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: iMaximumFractionDigits
            }).format(fValue);
        },

        _formatSignedAmount(vValue, sUnit) {
            const fValue = Number(vValue) || 0;
            const sSign = fValue > 0 ? "+" : "";
            const sAmount = sSign + this._formatNumber(fValue, 0);

            return [sAmount, sUnit].filter(Boolean).join(" ");
        },

        _formatSignedPercent(vValue) {
            const fValue = Number(vValue);

            if (!Number.isFinite(fValue)) {
                return "";
            }

            return (fValue > 0 ? "+" : "") + this._formatNumber(fValue, 2) + "%";
        },

        _amountState(vValue) {
            const fValue = Number(vValue);

            if (!Number.isFinite(fValue) || fValue === 0) {
                return "None";
            }

            return fValue > 0 ? "Warning" : "Success";
        },

        _thresholdState(fValue, fWarning, fError) {
            if (fValue >= fError) {
                return "Error";
            }

            if (fValue >= fWarning) {
                return "Warning";
            }

            return "Success";
        },

        _formatActualStatus(oRow) {
            if (oRow.actual_exists === "X") {
                return this._getText("varianceActualDone");
            }

            if (oRow.actual_calc_target === "X") {
                return this._getText("varianceActualTarget");
            }

            return oRow.actual_status || this._getText("varianceActualDisplayOnly");
        },

        _formatActualState(oRow) {
            if (oRow.actual_exists === "X") {
                return "Success";
            }

            if (oRow.actual_calc_target === "X") {
                return "Warning";
            }

            return "None";
        },

        _toPoper(sMonth) {
            return String(sMonth || "").replace(/\D/g, "").padStart(3, "0");
        },

        _toCalendarMonth(sValue) {
            const sDigits = String(sValue || "").replace(/\D/g, "");
            return sDigits ? sDigits.slice(-2).padStart(2, "0") : "";
        },

        _getText(sKey, aArgs) {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        }
    });
});
