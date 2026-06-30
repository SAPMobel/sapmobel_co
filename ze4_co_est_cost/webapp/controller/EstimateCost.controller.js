sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/viz/ui5/controls/common/feeds/FeedItem",
    "ze4/co/est/cost/ze4coestcost/model/formatter",
    "ze4/co/est/cost/ze4coestcost/util/ReportExport"
], (Controller, JSONModel, ODataModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, SelectDialog, StandardListItem, FeedItem, formatter, ReportExport) => {
    "use strict";

    return Controller.extend("ze4.co.est.cost.ze4coestcost.controller.EstimateCost", {
        formatter: formatter,

        onInit() {
            this._mLazyModels = {};
            formatter.setResourceBundle(this._getResourceBundle());
            this.getView().setModel(new JSONModel(this._getInitialFilters()), "filters");
            this.getView().setModel(new JSONModel({
                busy: false,
                message: "",
                messageType: "Information",
                messageVisible: false,
                mainTableVisibleRowCount: 5,
                executeEnabled: false,
                postRunVisible: false,
                postRunMessage: ""
            }), "ui");
            this.getView().setModel(new JSONModel({ items: [] }), "main");
            this.getView().setModel(new JSONModel({ data: {} }), "kpi");
            this.getView().setModel(new JSONModel({
                varianceParts: [],
                hasVarianceParts: false
            }), "chart");
            this.getView().setModel(new JSONModel(this._getEmptyCostCompare()), "costCompare");
            this.getView().setModel(new JSONModel({
                items: [],
                hasItems: false
            }), "topVariance");
            this.getView().setModel(new JSONModel(this._getEmptyAnalysis()), "analysis");
            this.getView().setModel(new JSONModel(this._getEmptyBomImpact()), "bomImpact");
            this.getView().setModel(new JSONModel({ items: [], entitySet: "" }), "materialTypes");
            this.getView().setModel(new JSONModel({ items: [], loadKey: "" }), "materials");
            this.getView().setModel(new JSONModel({ items: [], loadKey: "" }), "materialGroups");

            this._loadMaterialTypes();
            this._runInitialSearch();
        },

        onAfterRendering() {
            this._configureVizFrames();
            this._scheduleMainTableHeightSync();
            if (!this._fnMainTableResizeHandler && typeof window !== "undefined" && window.addEventListener) {
                this._fnMainTableResizeHandler = this._scheduleMainTableHeightSync.bind(this);
                window.addEventListener("resize", this._fnMainTableResizeHandler);
            }
        },

        onExit() {
            if (this._fnMainTableResizeHandler && typeof window !== "undefined" && window.removeEventListener) {
                window.removeEventListener("resize", this._fnMainTableResizeHandler);
            }
            if (this._iMainTableHeightSyncTimer && typeof window !== "undefined" && window.clearTimeout) {
                window.clearTimeout(this._iMainTableHeightSyncTimer);
            }
        },

        onExportExcel() {
            ReportExport.exportExcel(this._buildExportReport(), this.getView());
        },

        onExportPdf() {
            ReportExport.printPdf(this._buildExportReport(), this.getView());
        },

        _buildExportReport() {
            var oFilters = this.getView().getModel("filters").getData() || {};
            var oKpi = this.getView().getModel("kpi").getProperty("/data") || {};
            var aMainRows = this.getView().getModel("main").getProperty("/items") || [];
            var oCostCompare = this.getView().getModel("costCompare").getData() || {};
            var aTopVarianceRows = this.getView().getModel("topVariance").getProperty("/items") || [];
            var oAnalysis = this.getView().getModel("analysis").getData() || {};

            return {
                title: "[EverNiture-CO] 예상원가 분석",
                fileName: "EstimateCostReport",
                variant: "estimate",
                description: "예상실제원가와 표준원가의 차이, 차트 원천 데이터 및 선택 제품 분석 리포트",
                filters: ReportExport.labelRows(oFilters, [
                    { label: "회사코드", property: "bukrs" },
                    { label: "회계연도", property: "gjahr" },
                    { label: "기간", property: "monat" },
                    { label: "제품번호", property: "matnr" },
                    { label: "제품유형", property: "mtart" },
                    { label: "제품그룹", property: "matkl" }
                ]),
                summary: this._estimateKpiRows(oKpi).concat([
                    { label: "조회 건수", value: aMainRows.length + "건" },
                    { label: "선택 분석 제품", value: oAnalysis.selectedProductName || "-" },
                    { label: "선택 건수", value: (oAnalysis.selectedCount || 0) + "건" }
                ]),
                charts: [
                    ReportExport.chart("제품그룹별 차이율", "groupCostChart", "제품그룹별 차이", { width: 520, height: 280 }),
                    ReportExport.chart("제품유형별 차이율", "typeCostChart", "제품유형별 차이", { width: 520, height: 280 }),
                    ReportExport.chart("기준별 차이 구성", "criteriaVarianceChart", "기준별 차이", { width: 760, height: 300, wide: true })
                ],
                sections: [
                    ReportExport.section("상위 차이", aTopVarianceRows, this._topVarianceColumns()),
                    ReportExport.section("제품그룹별 차이", oCostCompare.groupCostRows, this._costCompareColumns()),
                    ReportExport.section("제품유형별 차이", oCostCompare.typeCostRows, this._costCompareColumns()),
                    ReportExport.section("기준별 차이", oCostCompare.criteriaVarianceRows, this._costCompareColumns()),
                    ReportExport.section("예상원가 목록", aMainRows, this._mainExportColumns()),
                    ReportExport.section("선택 원가 흐름", oAnalysis.costFlow, [
                        { label: "구분", property: "label" },
                        { label: "금액", rawProperty: "amount", value: function (oRow) { return formatter.currencyInteger(oRow.amount, oAnalysis.currency); }, type: "amount", total: true },
                        { label: "비고", property: "description" }
                    ]),
                    ReportExport.section("선택 가공비 비교", oAnalysis.processingComparisonRows, [
                        { label: "구분", property: "label" },
                        { label: "표준", rawProperty: "standard", value: function (oRow) { return formatter.currency(oRow.standard, oAnalysis.currency); }, type: "amount", total: true },
                        { label: "실제", rawProperty: "actual", value: function (oRow) { return formatter.currency(oRow.actual, oAnalysis.currency); }, type: "amount", total: true },
                        { label: "차이", rawProperty: "diff", value: function (oRow) { return formatter.currency(oRow.diff, oAnalysis.currency); }, type: "amount", total: true }
                    ]),
                    ReportExport.section("선택 영향 분석", oAnalysis.impactRows, [
                        { label: "구분", property: "label" },
                        { label: "단가 영향", rawProperty: "unitAmount", value: function (oRow) { return formatter.currency(oRow.unitAmount, oAnalysis.currency); }, type: "amount", total: true },
                        { label: "총 영향", rawProperty: "totalAmount", value: function (oRow) { return formatter.currency(oRow.totalAmount, oAnalysis.currency); }, type: "amount", total: true },
                        { label: "설명", property: "description" }
                    ])
                ]
            };
        },

        _estimateKpiRows(oKpi) {
            var sCurrency = oKpi.waers || oKpi.currency || "KRW";

            return [
                { label: "표준원가 합계", value: formatter.currencyInteger(oKpi.standardCostTotal || oKpi.stdCostTotal, sCurrency) },
                { label: "예상실제원가 합계", value: formatter.currencyInteger(oKpi.expectedActualCostTotal || oKpi.actualCostTotal, sCurrency) },
                { label: "차이 합계", value: formatter.currencyInteger(oKpi.varianceTotal || oKpi.totalDiff, sCurrency) },
                { label: "마감 상태", value: oKpi.closing_status_text || oKpi.closingStatusText || "-" }
            ];
        },

        _mainExportColumns() {
            return [
                { label: "제품번호", property: "matnr" },
                { label: "제품명", property: "maktx" },
                { label: "옵션", property: "mtopt" },
                { label: "옵션명", property: "mtopt_t" },
                { label: "제품유형", property: "mtart" },
                { label: "제품그룹", property: "matkl" },
                { label: "표준원가", rawValue: function (oRow) { return oRow.std_total_cost || oRow.standardCost; }, value: function (oRow) { return formatter.currencyInteger(oRow.std_total_cost || oRow.standardCost, oRow.waers); }, type: "amount", total: true },
                { label: "예상실제원가", rawValue: function (oRow) { return oRow.expected_actual_cost || oRow.expectedActualCost; }, value: function (oRow) { return formatter.currencyInteger(oRow.expected_actual_cost || oRow.expectedActualCost, oRow.waers); }, type: "amount", total: true },
                { label: "가격차이", rawValue: function (oRow) { return oRow.price_diff_amt || oRow.priceDiffAmount; }, value: function (oRow) { return formatter.currencyInteger(oRow.price_diff_amt || oRow.priceDiffAmount, oRow.waers); }, type: "amount", total: true },
                { label: "가공차이", rawValue: function (oRow) { return oRow.processing_diff_amt || oRow.processingDiffAmount; }, value: function (oRow) { return formatter.currencyInteger(oRow.processing_diff_amt || oRow.processingDiffAmount, oRow.waers); }, type: "amount", total: true },
                { label: "상태", property: "actual_status_text" }
            ];
        },

        _topVarianceColumns() {
            return [
                { label: "순위", property: "rank" },
                { label: "제품", property: "productText" },
                { label: "표준원가", rawValue: function (oRow) { return oRow.standardCostTotal || oRow.std_total_cost; }, value: function (oRow) { return formatter.currencyInteger(oRow.standardCostTotal || oRow.std_total_cost, oRow.waers); }, type: "amount", total: true },
                { label: "예상실제원가", rawValue: function (oRow) { return oRow.expectedActualCostTotal || oRow.expected_actual_cost; }, value: function (oRow) { return formatter.currencyInteger(oRow.expectedActualCostTotal || oRow.expected_actual_cost, oRow.waers); }, type: "amount", total: true },
                { label: "차이", rawValue: function (oRow) { return oRow.varianceAmount || oRow.totalDiff; }, value: function (oRow) { return formatter.currencyInteger(oRow.varianceAmount || oRow.totalDiff, oRow.waers); }, type: "amount", total: true },
                { label: "차이율", rawProperty: "varianceRate", value: function (oRow) { return formatter.percent(oRow.varianceRate); }, type: "percent", percentScale: "point", summary: false }
            ];
        },

        _costCompareColumns() {
            return [
                { label: "구분", property: "dimensionText" },
                { label: "표준원가", rawProperty: "standardCostTotal", value: function (oRow) { return formatter.currencyInteger(oRow.standardCostTotal, oRow.waers); }, type: "amount", total: true },
                { label: "예상실제원가", rawProperty: "expectedActualCostTotal", value: function (oRow) { return formatter.currencyInteger(oRow.expectedActualCostTotal, oRow.waers); }, type: "amount", total: true },
                { label: "가격차이율", rawProperty: "priceDiffRatio", value: function (oRow) { return formatter.percent(oRow.priceDiffRatio); }, type: "percent", percentScale: "point", summary: false },
                { label: "가공차이율", rawProperty: "processingDiffRatio", value: function (oRow) { return formatter.percent(oRow.processingDiffRatio); }, type: "percent", percentScale: "point", summary: false },
                { label: "총 차이율", rawValue: function (oRow) { return oRow.totalDiffRatio || oRow.varianceRate; }, value: function (oRow) { return formatter.percent(oRow.totalDiffRatio || oRow.varianceRate); }, type: "percent", percentScale: "point", summary: false }
            ];
        },

        _configureVizFrames() {
            var mVizProperties = {
                title: {
                    visible: false
                },
                legend: {
                    visible: false
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "0.0%"
                    },
                    drawingEffect: "normal"
                },
                valueAxis: {
                    title: {
                        visible: false
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        style: {
                            color: "#22304a",
                            fontSize: "12px",
                            fontWeight: "700"
                        }
                    }
                },
                interaction: {
                    selectability: {
                        mode: "SINGLE"
                    }
                }
            };
            var mGroupRateVizProperties = this._getCostRateVizProperties(["#0a6ed1"], false);
            var mTypeRateVizProperties = this._getCostRateVizProperties(["#6f42c1"], false);
            var mVarianceSplitVizProperties = this._getCostRateVizProperties(["#e9730c", "#008c95", "#107e3e"], true);
            var mBomImpactDonutVizProperties = this._getBomImpactDonutVizProperties();
            var oBundle = this._getResourceBundle();

            mVarianceSplitVizProperties.plotArea.dataShape = {
                primaryAxis: ["bar", "bar", "line"]
            };

            ["unitImpactChart", "totalImpactChart"].forEach(function (sId) {
                var oChart = this.byId(sId);
                if (oChart && !oChart._zecConfigured) {
                    oChart.setVizProperties(mVizProperties);
                    this._configureChartSelection(oChart);
                    oChart._zecConfigured = true;
                }
            }.bind(this));

            this._configureVizFrameFeeds("groupCostChart", mGroupRateVizProperties, [
                {
                    uid: "valueAxis",
                    type: "Measure",
                    values: [oBundle.getText("chartVarianceRateMeasure")]
                },
                {
                    uid: "categoryAxis",
                    type: "Dimension",
                    values: [oBundle.getText("chartDimension")]
                }
            ]);
            this._configureVizFrameFeeds("typeCostChart", mTypeRateVizProperties, [
                {
                    uid: "valueAxis",
                    type: "Measure",
                    values: [oBundle.getText("chartVarianceRateMeasure")]
                },
                {
                    uid: "categoryAxis",
                    type: "Dimension",
                    values: [oBundle.getText("chartDimension")]
                }
            ]);
            this._configureVizFrameFeeds("criteriaVarianceChart", mVarianceSplitVizProperties, [
                {
                    uid: "valueAxis",
                    type: "Measure",
                    values: [
                        oBundle.getText("chartPriceDiffRateMeasure"),
                        oBundle.getText("chartProcessingDiffRateMeasure"),
                        oBundle.getText("chartTotalDiffRateMeasure")
                    ]
                },
                {
                    uid: "categoryAxis",
                    type: "Dimension",
                    values: [oBundle.getText("chartDimension")]
                }
            ]);
            this._configureVizFrameFeeds("bomImpactDonutChart", mBomImpactDonutVizProperties, [
                {
                    uid: "size",
                    type: "Measure",
                    values: [oBundle.getText("bomImpactDonutMeasure")]
                },
                {
                    uid: "color",
                    type: "Dimension",
                    values: [oBundle.getText("bomImpactDonutDimension")]
                }
            ]);
        },

        _getBomImpactDonutVizProperties() {
            return {
                title: {
                    visible: false
                },
                legend: {
                    visible: true,
                    position: "bottom"
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        type: "percentage",
                        hideWhenOverlap: true
                    },
                    drawingEffect: "glossy",
                    colorPalette: ["#0a6ed1", "#e9730c", "#008c95", "#107e3e", "#6f42c1", "#d04343", "#5b738b", "#f0ab00"]
                },
                interaction: {
                    selectability: {
                        mode: "SINGLE"
                    }
                }
            };
        },

        _getCostRateVizProperties(aColorPalette, bLegendVisible) {
            return {
                title: {
                    visible: false
                },
                legend: {
                    visible: !!bLegendVisible,
                    position: "bottom"
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        formatString: "0.0%",
                        hideWhenOverlap: true
                    },
                    drawingEffect: "glossy",
                    colorPalette: aColorPalette
                },
                valueAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        formatString: "0.0%"
                    }
                },
                categoryAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        angle: 35,
                        style: {
                            color: "#22304a",
                            fontSize: "12px",
                            fontWeight: "700"
                        }
                    }
                },
                interaction: {
                    selectability: {
                        mode: "SINGLE"
                    }
                }
            };
        },

        _configureVizFrameFeeds(sId, mVizProperties, aFeeds) {
            var oChart = this.byId(sId);

            if (!oChart || oChart._zecConfigured) {
                return;
            }

            oChart.setVizProperties(mVizProperties);
            oChart.removeAllFeeds();
            aFeeds.forEach(function (oFeed) {
                oChart.addFeed(new FeedItem(oFeed));
            });
            this._configureChartSelection(oChart);
            oChart._zecConfigured = true;
        },

        _configureChartSelection(oChart) {
            if (!oChart || oChart._zecSelectionConfigured) {
                return;
            }

            oChart.attachSelectData(this._onChartSelectData, this);
            oChart.attachDeselectData(this._onChartDeselectData, this);
            oChart._zecSelectionConfigured = true;
        },

        _onChartSelectData(oEvent) {
            var oChart = oEvent.getSource();

            this._clearChartHighlights(oChart);
            this._setChartHighlight(oChart, true);
        },

        _onChartDeselectData(oEvent) {
            this._setChartHighlight(oEvent.getSource(), false);
        },

        _clearChartHighlights(oExceptChart) {
            [
                "unitImpactChart",
                "totalImpactChart",
                "groupCostChart",
                "typeCostChart",
                "criteriaVarianceChart",
                "bomImpactDonutChart"
            ].forEach(function (sId) {
                var oChart = this.byId(sId);

                if (oChart && oChart !== oExceptChart) {
                    this._setChartHighlight(oChart, false);
                }
            }.bind(this));
        },

        _setChartHighlight(oChart, bSelected) {
            var oParent = oChart && oChart.getParent && oChart.getParent();
            var aTargets = [oChart];

            if (oParent) {
                aTargets.push(oParent);
            }

            aTargets.forEach(function (oTarget) {
                if (!oTarget || !oTarget.addStyleClass || !oTarget.removeStyleClass) {
                    return;
                }

                if (bSelected) {
                    oTarget.addStyleClass("zecChartSelected");
                } else {
                    oTarget.removeStyleClass("zecChartSelected");
                }
            });
        },

        _runInitialSearch() {
            Promise.resolve().then(function () {
                var oModel = this._getDefaultODataModel();

                if (!oModel || typeof oModel.metadataLoaded !== "function") {
                    throw new Error(this._text("mainServiceMissing"));
                }

                return oModel.metadataLoaded();
            }.bind(this)).then(function () {
                return this.onSearch();
            }.bind(this)).catch(function (oError) {
                var sMessage = this._getErrorMessage(oError);
                this._setMessage(sMessage, "Error");
                MessageBox.error(sMessage);
            }.bind(this));
        },

        onCloseMessage() {
            this._setMessage("", "Information");
        },

        onReset() {
            this.getView().getModel("filters").setData(this._getInitialFilters());
            this.getView().getModel("main").setData({ items: [] });
            this._updateMainTableRowCount(0);
            this.getView().getModel("kpi").setData({ data: {} });
            this.getView().getModel("chart").setData({
                varianceParts: [],
                hasVarianceParts: false
            });
            this.getView().getModel("costCompare").setData(this._getEmptyCostCompare());
            this.getView().getModel("topVariance").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("analysis").setData(this._getEmptyAnalysis());
            this.getView().getModel("bomImpact").setData(this._getEmptyBomImpact());
            this.getView().getModel("ui").setProperty("/postRunVisible", false);
            this.getView().getModel("ui").setProperty("/postRunMessage", "");
            this.getView().getModel("ui").setProperty("/executeEnabled", false);
            this._clearInputStates();
            this._setMessage("", "Information");
            this._clearMainSelection();
        },

        async onSearch() {
            var mFilters = this._collectFilters();
            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            this._setBusy(true);
            this._setMessage("", "Information");
            this.getView().getModel("ui").setProperty("/postRunVisible", false);
            this._clearMainSelection();
            this._clearResultModels();

            var aResults = await Promise.all([
                this._readMainData(mFilters).then(function () {
                    return null;
                }).catch(function (oError) {
                    return oError;
                }),
                this._readKpiData(mFilters).then(function () {
                    return null;
                }).catch(function (oError) {
                    return oError;
                })
            ]);

            this._setBusy(false);

            var aErrors = aResults.filter(Boolean).map(this._getErrorMessage.bind(this));
            if (aErrors.length) {
                var sMessage = aErrors.join("\n");
                this.getView().getModel("ui").setProperty("/executeEnabled", false);
                this._setMessage(sMessage, "Error");
                MessageBox.error(sMessage);
                return;
            }

            if (!this.getView().getModel("main").getProperty("/items").length) {
                this._setMessage(this._text("noDataAfterSearch"), "Information");
            }
        },

        onMainSelectionChange() {
            var oTable = this.byId("mainTable");
            var aSelectedItems = this._getSelectedMainItems(oTable);

            this._updateAnalysis(aSelectedItems);
            this._loadBomPriceImpactForSelection(aSelectedItems.length === 1 ? aSelectedItems[0] : null);
        },

        onMaterialValueHelp() {
            var mFilters = this._collectFilters();

            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            this._getMaterialValueHelpDialog();
            this._loadMaterialHelpItems(mFilters).then(function () {
                this._clearMaterialValueHelpSearch();
                this._oMaterialValueHelpDialog.open();
            }.bind(this)).catch(function (oError) {
                this._setMessage(this._text("materialHelpLoadFailed", [this._getErrorMessage(oError)]), "Warning");
            }.bind(this));
        },

        _getMaterialValueHelpDialog() {
            if (this._oMaterialValueHelpDialog) {
                return this._oMaterialValueHelpDialog;
            }

            this._oMaterialValueHelpDialog = new SelectDialog({
                title: this._text("materialHelpTitle"),
                noDataText: this._text("materialHelpNoData"),
                search: this._onMaterialValueHelpSearch.bind(this),
                liveChange: this._onMaterialValueHelpSearch.bind(this),
                confirm: this._onMaterialValueHelpConfirm.bind(this),
                cancel: this._clearMaterialValueHelpSearch.bind(this),
                items: {
                    path: "materials>/items",
                    template: new StandardListItem({
                        title: "{materials>matnr}",
                        description: "{materials>description}",
                        info: "{materials>typeText}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMaterialValueHelpDialog);
            return this._oMaterialValueHelpDialog;
        },

        onMaterialGroupValueHelp() {
            var mFilters = this._collectFilters();

            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            this._getMaterialGroupValueHelpDialog();
            this._loadMaterialGroupHelpItems(mFilters).then(function () {
                this._clearMaterialGroupValueHelpSearch();
                this._oMaterialGroupValueHelpDialog.open();
            }.bind(this)).catch(function (oError) {
                this._setMessage(this._text("materialGroupHelpLoadFailed", [this._getErrorMessage(oError)]), "Warning");
            }.bind(this));
        },

        _getMaterialGroupValueHelpDialog() {
            if (this._oMaterialGroupValueHelpDialog) {
                return this._oMaterialGroupValueHelpDialog;
            }

            this._oMaterialGroupValueHelpDialog = new SelectDialog({
                title: this._text("materialGroupHelpTitle"),
                noDataText: this._text("materialGroupHelpNoData"),
                search: this._onMaterialGroupValueHelpSearch.bind(this),
                liveChange: this._onMaterialGroupValueHelpSearch.bind(this),
                confirm: this._onMaterialGroupValueHelpConfirm.bind(this),
                cancel: this._clearMaterialGroupValueHelpSearch.bind(this),
                items: {
                    path: "materialGroups>/items",
                    template: new StandardListItem({
                        title: "{materialGroups>matkl}",
                        description: "{materialGroups>wgbez}",
                        info: "{materialGroups>itemCountText}",
                        type: "Active"
                    })
                }
            });

            this.getView().addDependent(this._oMaterialGroupValueHelpDialog);
            return this._oMaterialGroupValueHelpDialog;
        },

        _loadMaterialHelpItems(mFilters) {
            var oModel = this._getDefaultODataModel();
            var oMaterialModel = this.getView().getModel("materials");
            var sLoadKey = [
                mFilters.bukrs,
                mFilters.gjahr,
                mFilters.monat,
                mFilters.mtart,
                mFilters.matkl
            ].join("|");

            if (oMaterialModel.getProperty("/loadKey") === sLoadKey &&
                (oMaterialModel.getProperty("/items") || []).length) {
                return Promise.resolve();
            }

            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                var aFilters = [];
                if (mFilters.mtart) {
                    aFilters.push(new Filter("mtart", FilterOperator.EQ, mFilters.mtart));
                }
                if (mFilters.matkl) {
                    aFilters.push(new Filter("matkl", FilterOperator.EQ, mFilters.matkl));
                }
                return this._readOData(oModel, sPath, aFilters, this._buildMainSorters());
            }.bind(this)).then(function (aItems) {
                oMaterialModel.setData({
                    items: this._prepareMaterialHelpItems(aItems),
                    loadKey: sLoadKey
                });
            }.bind(this));
        },

        _prepareMaterialHelpItems(aItems) {
            var mSeen = {};
            var aMaterials = [];

            (aItems || []).forEach(function (oItem) {
                var sMaterial = this._trimUpper(oItem.matnr);
                if (!sMaterial || mSeen[sMaterial]) {
                    return;
                }

                mSeen[sMaterial] = true;
                aMaterials.push({
                    matnr: sMaterial,
                    maktx: oItem.maktx || "",
                    mtopt_t: oItem.mtopt_t || "",
                    mtbez: oItem.mtbez || "",
                    wgbez: oItem.wgbez || "",
                    description: [oItem.maktx, oItem.mtopt_t].filter(Boolean).join(" / "),
                    typeText: [oItem.mtbez, oItem.wgbez].filter(Boolean).join(" / ")
                });
            }.bind(this));

            return aMaterials;
        },

        _loadMaterialGroupHelpItems(mFilters) {
            var oModel = this._getDefaultODataModel();
            var oMaterialGroupModel = this.getView().getModel("materialGroups");
            var sLoadKey = [
                mFilters.bukrs,
                mFilters.gjahr,
                mFilters.monat,
                mFilters.mtart
            ].join("|");

            if (oMaterialGroupModel.getProperty("/loadKey") === sLoadKey &&
                (oMaterialGroupModel.getProperty("/items") || []).length) {
                return Promise.resolve();
            }

            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                var aFilters = [];
                if (mFilters.mtart) {
                    aFilters.push(new Filter("mtart", FilterOperator.EQ, mFilters.mtart));
                }
                return this._readOData(oModel, sPath, aFilters, [new Sorter("matkl", false)]);
            }.bind(this)).then(function (aItems) {
                oMaterialGroupModel.setData({
                    items: this._prepareMaterialGroupHelpItems(aItems),
                    loadKey: sLoadKey
                });
            }.bind(this));
        },

        _prepareMaterialGroupHelpItems(aItems) {
            var mGroups = {};

            (aItems || []).forEach(function (oItem) {
                var sMaterialGroup = this._trimUpper(oItem.matkl);
                if (!sMaterialGroup) {
                    return;
                }

                if (!mGroups[sMaterialGroup]) {
                    mGroups[sMaterialGroup] = {
                        matkl: sMaterialGroup,
                        wgbez: oItem.wgbez || "",
                        description: [sMaterialGroup, oItem.wgbez].filter(Boolean).join(" - "),
                        itemCount: 0
                    };
                }

                mGroups[sMaterialGroup].itemCount += 1;
            }.bind(this));

            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                oGroup.itemCountText = this._text("countValue", [oGroup.itemCount]);
                return oGroup;
            }.bind(this)).sort(function (oLeft, oRight) {
                return oLeft.matkl.localeCompare(oRight.matkl);
            });
        },

        _onMaterialValueHelpSearch(oEvent) {
            var sValue = String(oEvent.getParameter("value") || "").trim();
            var oBinding = oEvent.getSource().getBinding("items");
            var aFilters = [];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("matnr", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("maktx", FilterOperator.Contains, sValue),
                        new Filter("description", FilterOperator.Contains, sValue),
                        new Filter("typeText", FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }

            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        _onMaterialValueHelpConfirm(oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oContext = oSelectedItem && oSelectedItem.getBindingContext("materials");
            var sMaterial = oContext ? oContext.getProperty("matnr") : "";

            if (sMaterial) {
                this.getView().getModel("filters").setProperty("/matnr", sMaterial);
                this.byId("materialInput").setValueState("None");
            }

            this._clearMaterialValueHelpSearch();
        },

        _onMaterialGroupValueHelpSearch(oEvent) {
            var sValue = String(oEvent.getParameter("value") || "").trim();
            var oBinding = oEvent.getSource().getBinding("items");
            var aFilters = [];

            if (sValue) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("matkl", FilterOperator.Contains, sValue.toUpperCase()),
                        new Filter("wgbez", FilterOperator.Contains, sValue),
                        new Filter("description", FilterOperator.Contains, sValue)
                    ],
                    and: false
                }));
            }

            if (oBinding) {
                oBinding.filter(aFilters);
            }
        },

        _onMaterialGroupValueHelpConfirm(oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oContext = oSelectedItem && oSelectedItem.getBindingContext("materialGroups");
            var sMaterialGroup = oContext ? oContext.getProperty("matkl") : "";

            if (sMaterialGroup) {
                this.getView().getModel("filters").setProperty("/matkl", sMaterialGroup);
                this.byId("materialGroupInput").setValueState("None");
            }

            this._clearMaterialGroupValueHelpSearch();
        },

        _clearMaterialValueHelpSearch() {
            var oDialog = this._oMaterialValueHelpDialog;
            var oBinding = oDialog && oDialog.getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _clearMaterialGroupValueHelpSearch() {
            var oDialog = this._oMaterialGroupValueHelpDialog;
            var oBinding = oDialog && oDialog.getBinding("items");

            if (oBinding) {
                oBinding.filter([]);
            }
        },

        _clearResultModels() {
            this.getView().getModel("main").setData({ items: [] });
            this._updateMainTableRowCount(0);
            this.getView().getModel("kpi").setData({ data: {} });
            this.getView().getModel("chart").setData({
                varianceParts: [],
                hasVarianceParts: false
            });
            this.getView().getModel("costCompare").setData(this._getEmptyCostCompare());
            this.getView().getModel("topVariance").setData({
                items: [],
                hasItems: false
            });
            this.getView().getModel("analysis").setData(this._getEmptyAnalysis());
            this.getView().getModel("bomImpact").setData(this._getEmptyBomImpact());
            this.getView().getModel("ui").setProperty("/executeEnabled", false);
        },

        async onExecuteSettlement() {
            var mFilters = this._collectFilters();
            if (!this._validateRequiredFilters(mFilters)) {
                this._setMessage(this._text("requiredFilterMessage"), "Error");
                return;
            }

            var aItems = this.getView().getModel("main").getProperty("/items") || [];
            var aExecutableItems = this._getExecutableSettlementItems(aItems);
            if (!aItems.length) {
                MessageBox.information(this._text("executeNoLoadedData"));
                return;
            }
            if (!aExecutableItems.length) {
                MessageBox.information(this._text("executeNoExecutableTarget"));
                return;
            }

            var oModel;
            var oFunctionImport;

            try {
                oModel = this._getLazyODataModel("settlementService");
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
                return;
            }

            if (!oModel || typeof oModel.metadataLoaded !== "function") {
                MessageBox.error(this._text("settlementServiceMissing"));
                return;
            }

            try {
                await oModel.metadataLoaded();
                oFunctionImport = this._findFunctionImport(oModel.getServiceMetadata(), "ExecutePriceSettlement");
            } catch (oError) {
                MessageBox.error(this._getErrorMessage(oError));
                return;
            }

            if (!oFunctionImport) {
                MessageBox.information(this._text("executeActionNeedsConfirmation"));
                return;
            }

            if (!(await this._confirmExecuteSettlement())) {
                return;
            }

            this._setBusy(true);
            this._callFunction(oModel, "ExecutePriceSettlement", {
                IvBukrs: mFilters.bukrs,
                IvGjahr: mFilters.gjahr,
                IvPoper: mFilters.monat,
                IvWerks: ""
            }).then(function () {
                MessageToast.show(this._text("executeActionSuccess"));
                return this.onSearch().then(function () {
                    var oUiModel = this.getView().getModel("ui");
                    oUiModel.setProperty("/postRunVisible", true);
                    oUiModel.setProperty("/postRunMessage", this._text("postRunAnalysisReady"));
                    window.setTimeout(this.onGoVarianceAnalysis.bind(this), 0);
                }.bind(this));
            }.bind(this)).catch(function (oError) {
                var sMessage = this._getErrorMessage(oError);
                this._setMessage(sMessage, "Error");
                MessageBox.error(sMessage);
            }.bind(this)).finally(function () {
                this._setBusy(false);
            }.bind(this));
        },

        _confirmExecuteSettlement() {
            var sExecuteAction = this._text("executeSettlementConfirmAction");
            var sCancelAction = this._text("executeSettlementCancelAction");

            return new Promise(function (resolve) {
                MessageBox.warning(this._text("executeSettlementConfirmMessage"), {
                    title: this._text("executeSettlementConfirmTitle"),
                    actions: [sExecuteAction, sCancelAction],
                    emphasizedAction: sExecuteAction,
                    initialFocus: sCancelAction,
                    onClose: function (sAction) {
                        resolve(sAction === sExecuteAction);
                    }
                });
            }.bind(this));
        },

        onGoVarianceAnalysis() {
            var oTarget = this.byId("varianceAnalysisSection") || this.byId("priceVariancePanel");
            var oDomRef = oTarget && oTarget.getDomRef();

            if (oDomRef && typeof oDomRef.scrollIntoView === "function") {
                oDomRef.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        },

        _readMainData(mFilters) {
            var oModel = this._getDefaultODataModel();
            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                return this._readOData(oModel, sPath, this._buildMainFilters(mFilters), this._buildMainSorters());
            }.bind(this)).then(function (aItems) {
                var aPreparedItems = this._prepareMainItems(this._aggregateMainItems(aItems));
                this.getView().getModel("main").setData({ items: aPreparedItems });
                this._updateMainTableRowCount(aPreparedItems.length);
                this._updateExecuteState(aPreparedItems);
                this._updateChartFromMain(aPreparedItems);
                this._updateCostCompareFromMain(aPreparedItems);
                this._updateTopVariance(aPreparedItems);
                this._updateAnalysis([]);
                this.getView().getModel("bomImpact").setData(this._getEmptyBomImpact());
            }.bind(this));
        },

        _readKpiData(mFilters) {
            var oModel;
            try {
                oModel = this._getLazyODataModel("summaryService");
            } catch (oError) {
                return Promise.reject(oError);
            }

            return this._getParameterizedSetPath(oModel, {
                p_bukrs: mFilters.bukrs,
                p_gjahr: mFilters.gjahr,
                p_monat: mFilters.monat,
                p_werks: ""
            }).then(function (sPath) {
                return this._readOData(oModel, sPath, []);
            }.bind(this)).then(function (aItems) {
                var oKpi = this._prepareKpiData(aItems[0] || {});
                this.getView().getModel("kpi").setData({ data: oKpi });
            }.bind(this));
        },

        _loadBomPriceImpactForSelection(oSelectedItem) {
            var oBomModel = this.getView().getModel("bomImpact");
            var iRequestId = (this._iBomImpactRequestId || 0) + 1;
            var mSelection;
            var oModel;

            this._iBomImpactRequestId = iRequestId;

            if (!oSelectedItem) {
                oBomModel.setData(this._getEmptyBomImpact());
                this._scheduleMainTableHeightSync();
                return;
            }

            mSelection = this._getBomImpactSelection(oSelectedItem);
            if (!mSelection.matnr || !mSelection.mtopt || !mSelection.gjahr || !mSelection.poper) {
                oBomModel.setData(Object.assign(this._getEmptyBomImpact(), {
                    selected: mSelection,
                    errorText: this._text("bomImpactSelectionMissing"),
                    hasError: true
                }));
                this._scheduleMainTableHeightSync();
                return;
            }

            try {
                oModel = this._getLazyODataModel("bomPriceImpactService");
            } catch (oError) {
                oBomModel.setData(Object.assign(this._getEmptyBomImpact(), {
                    selected: mSelection,
                    errorText: this._getErrorMessage(oError),
                    hasError: true
                }));
                this._scheduleMainTableHeightSync();
                return;
            }

            oBomModel.setData(Object.assign(this._getEmptyBomImpact(), {
                selected: mSelection,
                busy: true
            }));
            this._scheduleMainTableHeightSync();

            this._getParameterizedSetPath(oModel, {
                p_bukrs: mSelection.bukrs,
                p_gjahr: mSelection.gjahr,
                p_poper: mSelection.poper,
                p_werks: mSelection.werks
            }).then(function (sPath) {
                return this._readOData(
                    oModel,
                    sPath,
                    this._buildBomImpactFilters(oModel, mSelection),
                    [
                        new Sorter("idnrk_txt", false),
                        new Sorter("idnrk", false),
                        new Sorter("idnrk_mtart", false)
                    ]
                );
            }.bind(this)).then(function (aRows) {
                if (this._iBomImpactRequestId !== iRequestId) {
                    return;
                }

                oBomModel.setData(this._buildBomImpactModel(aRows, oSelectedItem, mSelection));
                this._scheduleMainTableHeightSync();
            }.bind(this)).catch(function (oError) {
                if (this._iBomImpactRequestId !== iRequestId) {
                    return;
                }

                oBomModel.setData(Object.assign(this._getEmptyBomImpact(), {
                    selected: mSelection,
                    errorText: this._text("bomImpactLoadFailed", [this._getErrorMessage(oError)]),
                    hasError: true
                }));
                this._scheduleMainTableHeightSync();
            }.bind(this));
        },

        _getBomImpactSelection(oSelectedItem) {
            var oFilterData = this.getView().getModel("filters").getData() || {};

            return {
                bukrs: this._trimUpper(oFilterData.bukrs),
                gjahr: String(oSelectedItem.gjahr || oFilterData.gjahr || "").trim(),
                poper: this._normalizePoper(oFilterData.monat || oSelectedItem.monat),
                werks: "1000",
                matnr: this._trimUpper(oSelectedItem.matnr),
                mtopt: String(oSelectedItem.mtopt || "").trim()
            };
        },

        _buildBomImpactFilters(oModel, mSelection) {
            return [
                new Filter("matnr", FilterOperator.EQ, mSelection.matnr),
                new Filter("mtopt", FilterOperator.EQ, mSelection.mtopt),
                new Filter("gjahr", FilterOperator.EQ, mSelection.gjahr),
                new Filter("monat", FilterOperator.EQ, this._getBomImpactMonthFilterValue(oModel, mSelection.poper))
            ];
        },

        _getBomImpactMonthFilterValue(oModel, sPoper) {
            var oProperty = this._findServiceProperty(oModel && oModel.getServiceMetadata && oModel.getServiceMetadata(), "monat");
            var sValue = this._normalizePoper(sPoper);
            var sType = oProperty && oProperty.type;
            var sMaxLength = oProperty && (oProperty.maxLength || oProperty["sap:maxLength"]);

            if (sType && sType !== "Edm.String") {
                return Number(sValue.slice(-2));
            }

            if (String(sMaxLength) === "2") {
                return sValue.slice(-2);
            }

            return sValue;
        },

        _findServiceProperty(oMetadata, sPropertyName) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            var oProperty;

            aSchemas.some(function (oSchema) {
                return this._array(oSchema.entityType).some(function (oEntityType) {
                    if (this._isParameterEntityType(oEntityType)) {
                        return false;
                    }

                    oProperty = this._array(oEntityType.property).find(function (oCandidate) {
                        return oCandidate.name === sPropertyName;
                    });
                    return !!oProperty;
                }.bind(this));
            }.bind(this));

            return oProperty || null;
        },

        _buildBomImpactModel(aRows, oSelectedItem, mSelection) {
            var oTotal = {
                value: 0,
                hasValue: false
            };
            var aItems = (aRows || []).map(function (oRow) {
                return this._prepareBomImpactItem(oRow);
            }.bind(this));
            var aImpactSortedItems = aItems.slice().sort(this._compareBomImpactItems.bind(this));
            var bHasNonZeroImpact;
            var aTopItems;
            var aDonutItems;
            var fSelectedPriceDiff = this._toAmount(oSelectedItem.price_diff_amt);

            aItems.forEach(function (oItem) {
                this._accumulateAmount(oTotal, oItem.rolledPriceDiff);
            }.bind(this));

            bHasNonZeroImpact = aItems.some(function (oItem) {
                return oItem.rolledPriceDiff !== null && oItem.rolledPriceDiff !== 0;
            });
            aTopItems = bHasNonZeroImpact ? aImpactSortedItems.slice(0, 5) : [];
            aDonutItems = this._buildBomImpactDonutItems(aImpactSortedItems);

            if (oTotal.hasValue && fSelectedPriceDiff !== null) {
                this._warnIfBomImpactTotalDiffers(oTotal.value, fSelectedPriceDiff, mSelection);
            }

            return {
                selected: mSelection,
                busy: false,
                hasError: false,
                errorText: "",
                items: aItems,
                topItems: aTopItems,
                donutItems: aDonutItems,
                count: aItems.length,
                hasData: aItems.length > 0,
                hasTopItems: aTopItems.length > 0,
                hasDonutChart: aDonutItems.length > 0,
                hasMore: aItems.length > aTopItems.length,
                hasNonZeroImpact: bHasNonZeroImpact,
                totalRolledPriceDiffAmt: oTotal.hasValue ? oTotal.value : null,
                currency: (aItems[0] && aItems[0].waers) || oSelectedItem.waers || ""
            };
        },

        _compareBomImpactItems(oLeft, oRight) {
            if (oLeft.absRolledPriceDiff !== oRight.absRolledPriceDiff) {
                return oRight.absRolledPriceDiff - oLeft.absRolledPriceDiff;
            }

            return [
                "title",
                "idnrk",
                "idnrkType"
            ].reduce(function (iResult, sFieldName) {
                if (iResult !== 0) {
                    return iResult;
                }

                return String(oLeft[sFieldName] || "").localeCompare(String(oRight[sFieldName] || ""));
            }, 0);
        },

        _buildBomImpactDonutItems(aItems) {
            var fThreshold = 0.05;
            var fTotalAbs = (aItems || []).reduce(function (fSum, oItem) {
                return fSum + (oItem.rolledPriceDiff === null ? 0 : Math.abs(oItem.rolledPriceDiff));
            }, 0);
            var oOther = {
                count: 0,
                impactAbsAmount: 0,
                signedImpactAmount: 0
            };
            var aDonutItems;

            if (!fTotalAbs) {
                return [];
            }

            aDonutItems = (aItems || []).filter(function (oItem) {
                return oItem.rolledPriceDiff !== null && oItem.rolledPriceDiff !== 0;
            }).reduce(function (aResult, oItem) {
                var fAbsAmount = Math.abs(oItem.rolledPriceDiff);
                var fShare = fAbsAmount / fTotalAbs;

                if (fShare < fThreshold) {
                    oOther.count += 1;
                    oOther.impactAbsAmount += fAbsAmount;
                    oOther.signedImpactAmount += oItem.rolledPriceDiff;
                    return aResult;
                }

                aResult.push({
                    dimensionText: oItem.title || oItem.idnrk,
                    impactAbsAmount: fAbsAmount,
                    signedImpactAmount: oItem.rolledPriceDiff,
                    sharePercent: fShare * 100,
                    displayImpact: oItem.displayRolledPriceDiff
                });
                return aResult;
            }, []);

            if (oOther.count > 0) {
                aDonutItems.push({
                    dimensionText: this._text("bomImpactOtherCount", [oOther.count]),
                    impactAbsAmount: oOther.impactAbsAmount,
                    signedImpactAmount: oOther.signedImpactAmount,
                    sharePercent: (oOther.impactAbsAmount / fTotalAbs) * 100,
                    displayImpact: formatter.currency(oOther.signedImpactAmount, (aItems[0] && aItems[0].waers) || "")
                });
            }

            return aDonutItems.sort(function (oLeft, oRight) {
                if (oLeft.dimensionText.indexOf(this._text("bomImpactOther")) === 0) {
                    return 1;
                }
                if (oRight.dimensionText.indexOf(this._text("bomImpactOther")) === 0) {
                    return -1;
                }
                return oRight.impactAbsAmount - oLeft.impactAbsAmount;
            }.bind(this));
        },

        _getMaterialTypeText(sTypeCode) {
            var sCode = this._trimUpper(sTypeCode);
            var aMaterialTypes;
            var oMatchedType;
            var sTypeText;
            var mFallbackTextKeys = {
                FERT: "materialTypeFert",
                HALB: "materialTypeHalb",
                ROH: "materialTypeRoh",
                HAWA: "materialTypeHawa",
                VERP: "materialTypeVerp",
                HIBE: "materialTypeHibe",
                NLAG: "materialTypeNlag",
                DIEN: "materialTypeDien",
                ERSA: "materialTypeErsa"
            };

            if (!sCode) {
                return "";
            }

            aMaterialTypes = this.getView().getModel("materialTypes").getProperty("/items") || [];
            oMatchedType = aMaterialTypes.find(function (oType) {
                return this._trimUpper(oType && oType.mtart) === sCode;
            }.bind(this));
            sTypeText = oMatchedType && (oMatchedType.mtbez || oMatchedType.mtart_t || oMatchedType.text || oMatchedType.name);

            if (sTypeText) {
                return sTypeText;
            }

            return mFallbackTextKeys[sCode] ? this._text(mFallbackTextKeys[sCode]) : sCode;
        },

        _prepareBomImpactItem(oRow) {
            var sCurrency = oRow.waers || "";
            var fRolledPriceDiff = this._toAmount(oRow.rolled_price_diff_amt);
            var fComponentUnitPriceDiff = this._toAmount(oRow.component_unit_price_diff_amt);
            var sComponentTypeText = this._getMaterialTypeText(oRow.idnrk_mtart);

            return {
                matnr: oRow.matnr || "",
                mtopt: oRow.mtopt || "",
                gjahr: oRow.gjahr || "",
                monat: oRow.monat || "",
                idnrk: oRow.idnrk || "",
                posnr: oRow.posnr || "",
                idnrkText: oRow.idnrk_txt || "",
                idnrkType: oRow.idnrk_mtart || "",
                menge: this._toAmount(oRow.menge),
                meins: oRow.meins || "",
                bmeng: this._toAmount(oRow.bmeng),
                bmein: oRow.bmein || "",
                bomLineCount: this._toAmount(oRow.bom_line_cnt),
                componentRawPriceDiff: this._toAmount(oRow.component_raw_price_diff_amt),
                componentPriceDiffQty: this._toAmount(oRow.component_price_diff_qty),
                componentUnitPriceDiff: fComponentUnitPriceDiff,
                bomUsageRatio: this._toAmount(oRow.bom_usage_ratio),
                rolledPriceDiff: fRolledPriceDiff,
                absRolledPriceDiff: Math.abs(fRolledPriceDiff || 0),
                waers: sCurrency,
                title: oRow.idnrk_txt || oRow.idnrk || "",
                componentIdDisplay: oRow.idnrk || "",
                componentTypeText: sComponentTypeText,
                subtitle: [oRow.idnrk, sComponentTypeText].filter(Boolean).join(" - "),
                displayInputQty: this._formatQuantityWithUnit(oRow.menge, oRow.meins),
                displayBaseQty: this._formatQuantityWithUnit(oRow.bmeng, oRow.bmein),
                displayBomLineCount: formatter.integer(oRow.bom_line_cnt),
                displayPriceDiffQty: formatter.quantity(oRow.component_price_diff_qty),
                displayUsageRatio: formatter.quantity(oRow.bom_usage_ratio),
                displayComponentUnitPriceDiff: formatter.currency(fComponentUnitPriceDiff, sCurrency),
                displayRolledPriceDiff: formatter.currency(fRolledPriceDiff, sCurrency),
                state: formatter.amountState(fRolledPriceDiff)
            };
        },

        _formatQuantityWithUnit(vQuantity, sUnit) {
            return [formatter.quantity(vQuantity), sUnit].filter(Boolean).join(" ");
        },

        _warnIfBomImpactTotalDiffers(fBomTotal, fSelectedPriceDiff, mSelection) {
            var fDiff = Math.abs(fBomTotal - fSelectedPriceDiff);
            var fTolerance = Math.max(1, Math.abs(fSelectedPriceDiff) * 0.01);

            if (fDiff > fTolerance && typeof console !== "undefined" && console.warn) {
                console.warn("BOM price impact total differs from selected price diff", {
                    selection: mSelection,
                    bomTotal: fBomTotal,
                    selectedPriceDiff: fSelectedPriceDiff
                });
            }
        },

        onOpenBomImpactDialog() {
            var oDialog = this.byId("bomImpactDialog");

            if (oDialog) {
                oDialog.open();
            }
        },

        onCloseBomImpactDialog() {
            var oDialog = this.byId("bomImpactDialog");

            if (oDialog) {
                oDialog.close();
            }
        },

        _readOData(oModel, sPath, aFilters, aSorters) {
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    filters: aFilters || [],
                    sorters: aSorters || [],
                    success: function (oData) {
                        resolve(oData && Array.isArray(oData.results) ? oData.results : (oData ? [oData] : []));
                    },
                    error: reject
                });
            });
        },

        _getSelectedMainItems(oTable) {
            if (!oTable) {
                return [];
            }

            if (typeof oTable.getSelectedContexts === "function") {
                return oTable.getSelectedContexts("main").map(function (oContext) {
                    return oContext.getObject();
                });
            }

            if (typeof oTable.getSelectedIndices === "function") {
                return oTable.getSelectedIndices().map(function (iIndex) {
                    var oContext = oTable.getContextByIndex(iIndex);
                    return oContext && oContext.getObject();
                }).filter(Boolean);
            }

            return [];
        },

        _aggregateMainItems(aItems) {
            var aSummedAmountFields = [
                "raw_price_diff_amt",
                "raw_processing_diff_amt",
                "raw_settlement_variance_amt",
                "labor_clear_amt",
                "mach_clear_amt",
                "overhead_clear_amt",
                "labor_std_processing_amt",
                "labor_actual_processing_amt",
                "labor_processing_diff_amt",
                "mach_std_processing_amt",
                "mach_actual_processing_amt",
                "mach_processing_diff_amt",
                "overhead_std_processing_amt",
                "overhead_actual_processing_amt",
                "overhead_processing_diff_amt",
                "alloc_diff_amt",
                "price_diff_qty",
                "processing_diff_qty",
                "clear_line_count"
            ];
            var aSingleAmountFields = [
                "std_total_cost",
                "std_item_total_cost",
                "std_material_cost",
                "std_labor_cost",
                "std_overhead_cost",
                "std_processing_cost",
                "price_diff_amt",
                "processing_diff_amt",
                "settlement_variance_amt",
                "target_variance_amt",
                "expected_actual_cost",
                "diff_rate_pct",
                "actual_total_cost"
            ];
            var aFlagFields = [
                "std_component_exists",
                "actual_exists",
                "actual_calc_target"
            ];
            var mGroups = {};
            var aGroups = [];

            (aItems || []).forEach(function (oItem) {
                var sKey = [
                    oItem.matnr,
                    oItem.mtopt,
                    oItem.gjahr,
                    oItem.monat,
                    oItem.werks,
                    oItem.waers
                ].join("\u001f");
                var oGroup = mGroups[sKey];

                if (!oGroup) {
                    oGroup = Object.assign({}, oItem, {
                        _amountTotals: {}
                    });
                    aSummedAmountFields.forEach(function (sFieldName) {
                        oGroup._amountTotals[sFieldName] = {
                            value: 0,
                            hasValue: false
                        };
                        oGroup[sFieldName] = null;
                    });
                    aSingleAmountFields.forEach(function (sFieldName) {
                        oGroup[sFieldName] = null;
                    });
                    mGroups[sKey] = oGroup;
                    aGroups.push(oGroup);
                }

                aSummedAmountFields.forEach(function (sFieldName) {
                    this._accumulateAmount(oGroup._amountTotals[sFieldName], oItem[sFieldName]);
                }.bind(this));

                aSingleAmountFields.forEach(function (sFieldName) {
                    if (this._toAmount(oGroup[sFieldName]) === null &&
                        this._toAmount(oItem[sFieldName]) !== null) {
                        oGroup[sFieldName] = this._toAmount(oItem[sFieldName]);
                    }
                }.bind(this));

                aFlagFields.forEach(function (sFieldName) {
                    if (oItem[sFieldName] === "X") {
                        oGroup[sFieldName] = "X";
                    }
                });
            }.bind(this));

            aGroups.forEach(function (oGroup) {
                aSummedAmountFields.forEach(function (sFieldName) {
                    var oTotal = oGroup._amountTotals[sFieldName];
                    oGroup[sFieldName] = oTotal.hasValue ? oTotal.value : null;
                });
                delete oGroup._amountTotals;
            });

            return aGroups;
        },

        _prepareMainItems(aItems) {
            return (aItems || []).map(function (oItem) {
                var oPrepared = Object.assign({}, oItem);
                var fPriceDiff = this._toAmount(oPrepared.price_diff_amt);
                var fProcessingDiff = this._toAmount(oPrepared.processing_diff_amt);
                var fSettlementVariance = this._toAmount(oPrepared.settlement_variance_amt);
                var fExpectedActualCost = this._toAmount(oPrepared.expected_actual_cost);
                var fProcessingQty = this._toAmount(oPrepared.processing_diff_qty);

                oPrepared.display_variance_amt = fSettlementVariance;
                oPrepared.display_expected_actual_cost = fExpectedActualCost;
                oPrepared.display_diff_rate_pct = this._toAmount(oPrepared.diff_rate_pct);
                oPrepared.display_total_price_diff_amt = this._toAmount(oPrepared.raw_price_diff_amt);
                oPrepared.display_total_processing_diff_amt = this._toAmount(oPrepared.raw_processing_diff_amt);
                oPrepared.display_total_settlement_amt = this._toAmount(oPrepared.raw_settlement_variance_amt);
                oPrepared.display_labor_clear_amt = this._toAmount(oPrepared.labor_clear_amt);
                oPrepared.display_mach_clear_amt = this._toAmount(oPrepared.mach_clear_amt);
                oPrepared.display_overhead_clear_amt = this._toAmount(oPrepared.overhead_clear_amt);
                oPrepared.display_labor_std_processing_amt = this._toAmount(oPrepared.labor_std_processing_amt);
                oPrepared.display_labor_actual_processing_amt = this._toAmount(oPrepared.labor_actual_processing_amt);
                oPrepared.display_labor_processing_diff_amt = this._toAmount(oPrepared.labor_processing_diff_amt);
                oPrepared.display_mach_std_processing_amt = this._toAmount(oPrepared.mach_std_processing_amt);
                oPrepared.display_mach_actual_processing_amt = this._toAmount(oPrepared.mach_actual_processing_amt);
                oPrepared.display_mach_processing_diff_amt = this._toAmount(oPrepared.mach_processing_diff_amt);
                oPrepared.display_overhead_std_processing_amt = this._toAmount(oPrepared.overhead_std_processing_amt);
                oPrepared.display_overhead_actual_processing_amt = this._toAmount(oPrepared.overhead_actual_processing_amt);
                oPrepared.display_overhead_processing_diff_amt = this._toAmount(oPrepared.overhead_processing_diff_amt);
                oPrepared.display_alloc_diff_amt = this._toAmount(oPrepared.alloc_diff_amt);
                oPrepared.display_price_diff_qty = this._toAmount(oPrepared.price_diff_qty);
                oPrepared.display_unit_labor_std_processing_amt = this._toRequiredUnitAmount(oPrepared.display_labor_std_processing_amt, fProcessingQty);
                oPrepared.display_unit_labor_actual_processing_amt = this._toRequiredUnitAmount(oPrepared.display_labor_actual_processing_amt, fProcessingQty);
                oPrepared.display_unit_labor_processing_diff_amt = this._toRequiredUnitAmount(oPrepared.display_labor_processing_diff_amt, fProcessingQty);
                oPrepared.display_unit_mach_std_processing_amt = this._toRequiredUnitAmount(oPrepared.display_mach_std_processing_amt, fProcessingQty);
                oPrepared.display_unit_mach_actual_processing_amt = this._toRequiredUnitAmount(oPrepared.display_mach_actual_processing_amt, fProcessingQty);
                oPrepared.display_unit_mach_processing_diff_amt = this._toRequiredUnitAmount(oPrepared.display_mach_processing_diff_amt, fProcessingQty);
                oPrepared.display_unit_overhead_std_processing_amt = this._toRequiredUnitAmount(oPrepared.display_overhead_std_processing_amt, fProcessingQty);
                oPrepared.display_unit_overhead_actual_processing_amt = this._toRequiredUnitAmount(oPrepared.display_overhead_actual_processing_amt, fProcessingQty);
                oPrepared.display_unit_overhead_processing_diff_amt = this._toRequiredUnitAmount(oPrepared.display_overhead_processing_diff_amt, fProcessingQty);
                oPrepared.display_processing_diff_qty = this._toAmount(oPrepared.processing_diff_qty);
                oPrepared.variance_reason_text = this._getVarianceReasonText(fPriceDiff, fProcessingDiff);
                oPrepared.variance_reason_state = this._getVarianceReasonState(fPriceDiff, fProcessingDiff);
                oPrepared.display_actual_status_text = this._getActualStatusText(oPrepared);
                oPrepared.display_actual_status_state = this._getActualStatusState(oPrepared);

                return oPrepared;
            }.bind(this));
        },

        _getVarianceReasonText(fPriceDiff, fProcessingDiff) {
            var bHasPriceDiff = fPriceDiff !== null && fPriceDiff !== 0;
            var bHasProcessingDiff = fProcessingDiff !== null && fProcessingDiff !== 0;

            if (bHasPriceDiff && bHasProcessingDiff) {
                return this._text("varianceReasonMixed");
            }

            if (bHasPriceDiff) {
                return this._text("varianceReasonPrice");
            }

            if (bHasProcessingDiff) {
                return this._text("varianceReasonProcessing");
            }

            return this._text("varianceReasonNone");
        },

        _getVarianceReasonState(fPriceDiff, fProcessingDiff) {
            var bHasPriceDiff = fPriceDiff !== null && fPriceDiff !== 0;
            var bHasProcessingDiff = fProcessingDiff !== null && fProcessingDiff !== 0;

            if (bHasPriceDiff && bHasProcessingDiff) {
                return "Warning";
            }

            if (bHasPriceDiff || bHasProcessingDiff) {
                return "Information";
            }

            return "None";
        },

        _prepareKpiData(oKpi) {
            var oPrepared = Object.assign({}, oKpi);
            var fTargetCount = this._toAmount(oPrepared.actual_calc_target_cnt);
            var fDoneCount = this._toAmount(oPrepared.actual_calc_done_cnt);
            oPrepared.display_total_price_diff_amt = this._toAmount(oPrepared.raw_price_diff_amt);
            oPrepared.display_total_processing_diff_amt = this._toAmount(oPrepared.raw_processing_diff_amt);
            oPrepared.display_total_settlement_amt = this._toAmount(oPrepared.raw_settlement_variance_amt);
            oPrepared.display_price_diff_qty = this._toAmount(oPrepared.price_diff_qty);
            oPrepared.display_processing_diff_qty = this._toAmount(oPrepared.processing_diff_qty);
            oPrepared.display_total_variance_amt = oPrepared.display_total_settlement_amt;

            if (fDoneCount > 0 && (!fTargetCount || fDoneCount >= fTargetCount)) {
                oPrepared.closing_status_text = this._text("kpiClosingDone");
                oPrepared.closing_status_state = "Success";
                oPrepared.closing_status_subtitle = this._text("kpiClosingDoneSubtitle");
            } else if (fDoneCount > 0) {
                oPrepared.closing_status_text = this._text("kpiClosingPartial");
                oPrepared.closing_status_state = "Warning";
                oPrepared.closing_status_subtitle = this._text("kpiClosingPartialSubtitle");
            } else {
                oPrepared.closing_status_text = this._text("kpiClosingOpen");
                oPrepared.closing_status_state = "Warning";
                oPrepared.closing_status_subtitle = this._text("kpiClosingOpenSubtitle");
            }

            return oPrepared;
        },

        _loadMaterialTypes() {
            var oModel;
            try {
                oModel = this._getLazyODataModel("materialTypeService");
            } catch (oError) {
                this._setMessage(this._getErrorMessage(oError), "Warning");
                return;
            }

            this._getEntitySetPathByProperties(oModel, ["mtart", "mtbez"]).then(function (sPath) {
                this.getView().getModel("materialTypes").setProperty("/entitySet", sPath.replace(/^\//, ""));
                return this._readOData(oModel, sPath, []);
            }.bind(this)).then(function (aItems) {
                this.getView().getModel("materialTypes").setProperty("/items", aItems);
            }.bind(this)).catch(function (oError) {
                this._setMessage(this._text("materialTypeLoadFailed", [this._getErrorMessage(oError)]), "Warning");
            }.bind(this));
        },

        _getDefaultODataModel() {
            return this.getView().getModel() || this.getOwnerComponent().getModel();
        },

        _callFunction(oModel, sFunctionName, mParameters) {
            return new Promise(function (resolve, reject) {
                oModel.callFunction("/" + sFunctionName, {
                    method: "POST",
                    urlParameters: mParameters,
                    success: resolve,
                    error: reject
                });
            });
        },

        _getLazyODataModel(sDataSourceName) {
            if (this._mLazyModels[sDataSourceName]) {
                return this._mLazyModels[sDataSourceName];
            }

            var oDataSources = this.getOwnerComponent().getManifestEntry("/sap.app/dataSources") || {};
            var sUri = oDataSources[sDataSourceName] && oDataSources[sDataSourceName].uri;
            if (!sUri) {
                var mMissingTextKeys = {
                    summaryService: "summaryServiceMissing",
                    settlementService: "settlementServiceMissing",
                    materialTypeService: "materialTypeServiceMissing",
                    bomPriceImpactService: "bomPriceImpactServiceMissing"
                };
                throw new Error(this._text(mMissingTextKeys[sDataSourceName] || "unknownError"));
            }

            this._mLazyModels[sDataSourceName] = new ODataModel(sUri, {
                defaultCountMode: "Inline"
            });
            return this._mLazyModels[sDataSourceName];
        },

        _getParameterizedSetPath(oModel, mParameters) {
            if (!oModel || typeof oModel.metadataLoaded !== "function") {
                return Promise.reject(new Error(this._text("mainServiceMissing")));
            }

            return oModel.metadataLoaded().then(function () {
                var oResolved = this._resolveParameterizedEntity(oModel.getServiceMetadata(), Object.keys(mParameters));
                if (!oResolved) {
                    throw new Error(this._text("parameterizedMetadataMissing"));
                }

                var mKeyParameters = {};
                oResolved.parameterNames.forEach(function (sParameterName) {
                    var bEmptyValue = mParameters[sParameterName] === undefined ||
                        mParameters[sParameterName] === null ||
                        (mParameters[sParameterName] === "" && sParameterName !== "p_werks");
                    if (bEmptyValue) {
                        throw new Error(this._text("parameterizedMetadataMissing"));
                    }
                    mKeyParameters[sParameterName] = mParameters[sParameterName];
                }.bind(this));

                var sKeyPath = oModel.createKey(oResolved.entitySetName, mKeyParameters);
                return "/" + sKeyPath + "/" + oResolved.navigationName;
            }.bind(this));
        },

        _getEntitySetPathByProperties(oModel, aProperties) {
            return oModel.metadataLoaded().then(function () {
                var sEntitySet = this._resolveEntitySetByProperties(oModel.getServiceMetadata(), aProperties);
                if (!sEntitySet) {
                    throw new Error(this._text("entitySetMetadataMissing"));
                }

                return "/" + sEntitySet;
            }.bind(this));
        },

        _resolveParameterizedEntity(oMetadata, aParameterNames) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var oSchema = aSchemas[i];
                var aEntityTypes = this._array(oSchema.entityType);
                var oParameterType = aEntityTypes.find(function (oEntityType) {
                    var aEntityParameterNames = this._array(oEntityType.property).map(function (oProperty) {
                        return oProperty.name;
                    });

                    return this._isParameterEntityType(oEntityType) &&
                        aEntityParameterNames.every(function (sParameterName) {
                            return aParameterNames.indexOf(sParameterName) !== -1;
                        });
                }.bind(this));

                if (!oParameterType) {
                    continue;
                }

                var oEntitySet = this._findEntitySetForType(oSchema, oParameterType.name);
                var aNavigation = this._array(oParameterType.navigationProperty);
                var oNavigation = aNavigation.find(function (oNav) {
                    return oNav.name === "Set";
                }) || aNavigation[0];

                if (oEntitySet && oNavigation) {
                    return {
                        entitySetName: oEntitySet.name,
                        navigationName: oNavigation.name,
                        parameterNames: this._array(oParameterType.property).map(function (oProperty) {
                            return oProperty.name;
                        })
                    };
                }
            }

            return null;
        },

        _resolveEntitySetByProperties(oMetadata, aProperties) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var oSchema = aSchemas[i];
                var aEntityTypes = this._array(oSchema.entityType);
                var oEntityType = aEntityTypes.find(function (oCandidate) {
                    return !this._isParameterEntityType(oCandidate) &&
                        this._hasProperties(oCandidate, aProperties);
                }.bind(this));

                if (!oEntityType) {
                    continue;
                }

                var oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                if (oEntitySet) {
                    return oEntitySet.name;
                }
            }

            return "";
        },

        _findEntitySetForType(oSchema, sTypeName) {
            var sFullName = oSchema.namespace + "." + sTypeName;
            var aContainers = this._array(oSchema.entityContainer);

            for (var i = 0; i < aContainers.length; i += 1) {
                var aEntitySets = this._array(aContainers[i].entitySet);
                var oEntitySet = aEntitySets.find(function (oSet) {
                    return oSet.entityType === sFullName || oSet.entityType === sTypeName;
                });

                if (oEntitySet) {
                    return oEntitySet;
                }
            }

            return null;
        },

        _findFunctionImport(oMetadata, sFunctionName) {
            var aSchemas = this._array(this._path(oMetadata, "dataServices.schema"));
            for (var i = 0; i < aSchemas.length; i += 1) {
                var aContainers = this._array(aSchemas[i].entityContainer);
                for (var j = 0; j < aContainers.length; j += 1) {
                    var aFunctions = this._array(aContainers[j].functionImport);
                    var oFunction = aFunctions.find(function (oCandidate) {
                        return oCandidate.name === sFunctionName;
                    });
                    if (oFunction) {
                        return oFunction;
                    }
                }
            }

            return null;
        },

        _functionImportRequiresParameter(oFunctionImport, sParameterName) {
            return this._array(oFunctionImport && oFunctionImport.parameter).some(function (oParameter) {
                return oParameter.name === sParameterName;
            });
        },

        _buildMainFilters(mFilters) {
            var aFilters = [];

            if (mFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.Contains, mFilters.matnr));
            }

            if (mFilters.mtart) {
                aFilters.push(new Filter("mtart", FilterOperator.EQ, mFilters.mtart));
            }

            if (mFilters.matkl) {
                aFilters.push(new Filter("matkl", FilterOperator.EQ, mFilters.matkl));
            }

            return aFilters;
        },

        _buildMainSorters() {
            return [
                new Sorter("matnr", false),
                new Sorter("mtopt", false)
            ];
        },

        _updateChartFromMain(aItems) {
            var oBundle = this._getResourceBundle();
            var mTotals = {
                totalPriceNet: {
                    value: 0,
                    hasValue: false
                },
                totalPriceAbs: {
                    value: 0,
                    hasValue: false
                },
                totalProcessingNet: {
                    value: 0,
                    hasValue: false
                },
                totalProcessingAbs: {
                    value: 0,
                    hasValue: false
                },
                totalSettlementNet: {
                    value: 0,
                    hasValue: false
                },
                totalSettlementAbs: {
                    value: 0,
                    hasValue: false
                }
            };

            (aItems || []).forEach(function (oItem) {
                var fPriceDiff = this._toAmount(oItem.display_total_price_diff_amt);
                var fProcessingDiff = this._toAmount(oItem.display_total_processing_diff_amt);
                var fVariance = this._toAmount(oItem.display_total_settlement_amt);

                this._accumulateAmount(mTotals.totalPriceNet, fPriceDiff);
                this._accumulateAmount(mTotals.totalProcessingNet, fProcessingDiff);
                this._accumulateAmount(mTotals.totalSettlementNet, fVariance);

                if (fPriceDiff !== null && fPriceDiff !== 0) {
                    this._accumulateAmount(mTotals.totalPriceAbs, Math.abs(fPriceDiff));
                    this._accumulateAmount(mTotals.totalSettlementAbs, Math.abs(fPriceDiff));
                }

                if (fProcessingDiff !== null && fProcessingDiff !== 0) {
                    this._accumulateAmount(mTotals.totalProcessingAbs, Math.abs(fProcessingDiff));
                    this._accumulateAmount(mTotals.totalSettlementAbs, Math.abs(fProcessingDiff));
                }
            }.bind(this));

            var fTotalAbs = mTotals.totalSettlementAbs.hasValue ? mTotals.totalSettlementAbs.value : 0;
            var fPriceAbs = mTotals.totalPriceAbs.hasValue ? mTotals.totalPriceAbs.value : 0;
            var fProcessingAbs = mTotals.totalProcessingAbs.hasValue ? mTotals.totalProcessingAbs.value : 0;
            var sDominantKey = fPriceAbs >= fProcessingAbs ? "price" : "processing";
            var fDominantAbs = sDominantKey === "price" ? fPriceAbs : fProcessingAbs;
            var aReasonCards = [
                {
                    key: "price",
                    title: oBundle.getText("totalPriceDiff"),
                    detail: oBundle.getText("totalPriceDiffDetail"),
                    amount: mTotals.totalPriceNet.hasValue ? mTotals.totalPriceNet.value : null,
                    share: fTotalAbs ? (fPriceAbs / fTotalAbs) * 100 : 0,
                    state: mTotals.totalPriceNet.hasValue ? formatter.amountState(mTotals.totalPriceNet.value) : "None"
                },
                {
                    key: "processing",
                    title: oBundle.getText("totalProcessingDiff"),
                    detail: oBundle.getText("totalProcessingDiffDetail"),
                    amount: mTotals.totalProcessingNet.hasValue ? mTotals.totalProcessingNet.value : null,
                    share: fTotalAbs ? (fProcessingAbs / fTotalAbs) * 100 : 0,
                    state: mTotals.totalProcessingNet.hasValue ? formatter.amountState(mTotals.totalProcessingNet.value) : "None"
                }
            ];
            var aParts = [
                {
                    category: oBundle.getText("totalPriceDiff"),
                    amount: fPriceAbs || null
                },
                {
                    category: oBundle.getText("totalProcessingDiff"),
                    amount: fProcessingAbs || null
                }
            ].filter(function (oPart) {
                return oPart.amount !== null && oPart.amount !== 0;
            });

            this.getView().getModel("chart").setData({
                varianceParts: aParts,
                hasVarianceParts: aParts.length > 0,
                reasonCards: aReasonCards,
                hasReasonCards: aReasonCards.some(function (oCard) {
                    return oCard.amount !== null && oCard.amount !== 0;
                }),
                dominantReason: sDominantKey === "price" ?
                    oBundle.getText("totalPriceDiff") :
                    oBundle.getText("totalProcessingDiff"),
                dominantShare: fTotalAbs ? (fDominantAbs / fTotalAbs) * 100 : 0,
                totalNetAmount: mTotals.totalSettlementNet.hasValue ? mTotals.totalSettlementNet.value : null,
                totalAbsAmount: fTotalAbs || null
            });
        },

        _updateTopVariance(aItems) {
            var aTopItems = (aItems || []).filter(function (oItem) {
                return this._toAmount(oItem.display_total_settlement_amt) !== null;
            }.bind(this)).slice().sort(function (oLeft, oRight) {
                return Math.abs(this._toAmount(oRight.display_total_settlement_amt)) -
                    Math.abs(this._toAmount(oLeft.display_total_settlement_amt));
            }.bind(this)).slice(0, 3);

            this.getView().getModel("topVariance").setData({
                items: aTopItems,
                hasItems: aTopItems.length > 0
            });
        },

        _updateCostCompareFromMain(aItems) {
            var aNonFinishedItems = (aItems || []).filter(function (oItem) {
                return !this._isFinishedProductItem(oItem);
            }.bind(this));
            var aGroupRows = this._buildCostCompareRows(aNonFinishedItems, "matkl", "wgbez", "unassignedGroup", 0);
            var aTypeRows = this._sortProductTypeCostRows(
                this._buildCostCompareRows(aItems, "mtart", "mtbez", "unassignedType")
            );
            var aFinishedGroupRows = this._buildCostCompareRows(
                (aItems || []).filter(this._isFinishedProductItem.bind(this)),
                "matkl",
                "wgbez",
                "unassignedGroup",
                0
            ).filter(function (oRow) {
                return oRow.priceDiffRatio !== null && oRow.processingDiffRatio !== null;
            });

            this.getView().getModel("costCompare").setData({
                groupCostRows: aGroupRows,
                hasGroupCostRows: aGroupRows.length > 0,
                typeCostRows: aTypeRows,
                hasTypeCostRows: aTypeRows.length > 0,
                criteriaVarianceRows: aFinishedGroupRows,
                hasCriteriaVarianceRows: aFinishedGroupRows.length > 0
            });
        },

        _sortProductTypeCostRows(aRows) {
            return (aRows || []).slice().map(function (oRow, iIndex) {
                return {
                    row: oRow,
                    index: iIndex,
                    order: this._getProductTypeChartOrder(oRow.dimensionText)
                };
            }.bind(this)).sort(function (oLeft, oRight) {
                if (oLeft.order !== oRight.order) {
                    return oLeft.order - oRight.order;
                }

                return oLeft.index - oRight.index;
            }).map(function (oWrappedRow) {
                return oWrappedRow.row;
            });
        },

        _getProductTypeChartOrder(sText) {
            var sValue = String(sText || "").trim();

            if (sValue.indexOf("원자재") > -1) {
                return 0;
            }

            if (sValue.indexOf("반제품") > -1) {
                return 1;
            }

            if (sValue.indexOf("완제품") > -1) {
                return 2;
            }

            return 99;
        },

        _isFinishedProductItem(oItem) {
            var sMaterialType = this._trimUpper(oItem && oItem.mtart);
            var sMaterialTypeText = String((oItem && oItem.mtbez) || "").trim();

            return sMaterialType === "FERT" || sMaterialTypeText === "완제품";
        },

        _buildCostCompareRows(aItems, sKeyField, sTextField, sEmptyTextKey, iLimit) {
            var mRows = {};
            var iRowLimit = typeof iLimit === "number" ? iLimit : 6;

            (aItems || []).forEach(function (oItem) {
                var sText = String(oItem[sTextField] || "").trim();
                var sKey = sText || "__EMPTY__";
                var oRow = mRows[sKey];

                if (!oRow) {
                    oRow = {
                        key: sKey,
                        dimensionText: sKey === "__EMPTY__" ? this._text(sEmptyTextKey) : sText,
                        priceDiffRatioTotal: 0,
                        processingDiffRatioTotal: 0,
                        varianceRateTotal: 0,
                        itemCount: 0,
                        priceDiffRatioCount: 0,
                        processingDiffRatioCount: 0,
                        varianceRateCount: 0
                    };
                    mRows[sKey] = oRow;
                }

                this._accumulateCostCompareRatios(oRow, oItem);
                oRow.itemCount += 1;
            }.bind(this));

            var aRows = Object.keys(mRows).map(function (sKey) {
                var oRow = mRows[sKey];
                var fPriceDiffRatio = oRow.priceDiffRatioCount ? oRow.priceDiffRatioTotal / oRow.priceDiffRatioCount : null;
                var fProcessingDiffRatio = oRow.processingDiffRatioCount ? oRow.processingDiffRatioTotal / oRow.processingDiffRatioCount : null;

                return {
                    key: oRow.key,
                    dimensionText: oRow.dimensionText,
                    priceDiffRatio: fPriceDiffRatio,
                    processingDiffRatio: fProcessingDiffRatio,
                    totalDiffRatio: fPriceDiffRatio !== null && fProcessingDiffRatio !== null ? fPriceDiffRatio + fProcessingDiffRatio : null,
                    varianceRate: oRow.varianceRateCount ? oRow.varianceRateTotal / oRow.varianceRateCount : null,
                    itemCount: oRow.itemCount
                };
            }).filter(function (oRow) {
                return oRow.varianceRate !== null ||
                    oRow.priceDiffRatio !== null ||
                    oRow.processingDiffRatio !== null;
            }).sort(function (oLeft, oRight) {
                return Math.abs(oRight.varianceRate || 0) - Math.abs(oLeft.varianceRate || 0);
            });

            return iRowLimit > 0 ? aRows.slice(0, iRowLimit) : aRows;
        },

        _accumulateCostCompareRatios(oRow, oItem) {
            var fStandardCost = this._toAmount(oItem.std_total_cost);
            var fPriceDiff = this._toAmount(oItem.price_diff_amt);
            var fProcessingDiff = this._toAmount(oItem.processing_diff_amt);
            var bHasPriceDiff = fPriceDiff !== null;
            var bHasProcessingDiff = fProcessingDiff !== null;

            if (!fStandardCost) {
                return;
            }

            if (bHasPriceDiff) {
                oRow.priceDiffRatioTotal += fPriceDiff / fStandardCost;
                oRow.priceDiffRatioCount += 1;
            }

            if (bHasProcessingDiff) {
                oRow.processingDiffRatioTotal += fProcessingDiff / fStandardCost;
                oRow.processingDiffRatioCount += 1;
            }

            if (bHasPriceDiff || bHasProcessingDiff) {
                var fVarianceRate = ((bHasPriceDiff ? fPriceDiff : 0) + (bHasProcessingDiff ? fProcessingDiff : 0)) / fStandardCost;
                oRow.varianceRateTotal += fVarianceRate;
                oRow.varianceRateCount += 1;
            }
        },

        _updateMainTableRowCount(iItemCount) {
            var oUiModel = this.getView().getModel("ui");
            var aItems = this.getView().getModel("main").getProperty("/items") || [];
            var iCount = typeof iItemCount === "number" ? iItemCount : aItems.length;
            var iTargetRows = this._getMainTableTargetRows();
            var iVisibleRows = iCount > 0 ? Math.min(iCount, iTargetRows) : 5;
            var iCurrentRows = oUiModel.getProperty("/mainTableVisibleRowCount");

            iVisibleRows = Math.max(1, iVisibleRows);
            if (iCurrentRows !== iVisibleRows) {
                oUiModel.setProperty("/mainTableVisibleRowCount", iVisibleRows);
            }
            this._scheduleMainTableHeightSync();
        },

        _scheduleMainTableHeightSync() {
            if (typeof window === "undefined" || !window.setTimeout) {
                return;
            }

            if (this._iMainTableHeightSyncTimer && window.clearTimeout) {
                window.clearTimeout(this._iMainTableHeightSyncTimer);
            }

            this._iMainTableHeightSyncTimer = window.setTimeout(function () {
                this._syncMainTableToSidePanelHeight();
            }.bind(this), 120);
        },

        _syncMainTableToSidePanelHeight() {
            var oTable = this.byId("mainTable");
            var oSidePanel = this.byId("sidePreviewPanel");
            var oUiModel = this.getView().getModel("ui");
            var aItems = this.getView().getModel("main").getProperty("/items") || [];
            var oTableDom = oTable && oTable.getDomRef && oTable.getDomRef();
            var oSideDom = oSidePanel && oSidePanel.getDomRef && oSidePanel.getDomRef();
            var iItemCount = aItems.length;
            var iFallbackRows = iItemCount > 0 ? Math.min(iItemCount, this._getMainTableTargetRows()) : 5;
            var iVisibleRows = iFallbackRows;
            var oTableRect;
            var oSideRect;
            var oHeaderDom;
            var oRowDom;
            var iHeaderHeight;
            var iRowHeight;
            var iAvailableHeight;
            var iMeasuredRows;

            if (!oTableDom || !oSideDom || iItemCount <= 0) {
                if (oUiModel.getProperty("/mainTableVisibleRowCount") !== iVisibleRows) {
                    oUiModel.setProperty("/mainTableVisibleRowCount", iVisibleRows);
                }
                return;
            }

            oTableRect = oTableDom.getBoundingClientRect();
            oSideRect = oSideDom.getBoundingClientRect();
            oHeaderDom = oTableDom.querySelector(".sapUiTableColHdrCnt");
            oRowDom = oTableDom.querySelector(".sapUiTableCtrl tr.sapUiTableRow") || oTableDom.querySelector(".sapUiTableCtrl tr");
            iHeaderHeight = oHeaderDom ? oHeaderDom.getBoundingClientRect().height : 58;
            iRowHeight = oRowDom ? Math.max(24, oRowDom.getBoundingClientRect().height) : 31;
            iAvailableHeight = oSideRect.bottom - oTableRect.top - iHeaderHeight - 10;
            iMeasuredRows = Math.floor(iAvailableHeight / iRowHeight);

            if (Number.isFinite(iMeasuredRows) && iMeasuredRows > 0) {
                iVisibleRows = Math.min(iItemCount, Math.max(iFallbackRows, iMeasuredRows));
            }

            iVisibleRows = Math.max(1, Math.min(iVisibleRows, 80));
            if (oUiModel.getProperty("/mainTableVisibleRowCount") !== iVisibleRows) {
                oUiModel.setProperty("/mainTableVisibleRowCount", iVisibleRows);
            }
        },

        _updateExecuteState(aItems) {
            this.getView().getModel("ui").setProperty(
                "/executeEnabled",
                this._getExecutableSettlementItems(aItems).length > 0
            );
        },

        _getExecutableSettlementItems(aItems) {
            return (aItems || []).filter(this._isExecutableSettlementItem.bind(this));
        },

        _isExecutableSettlementItem(oItem) {
            return !!oItem &&
                oItem.actual_calc_target === "X" &&
                oItem.actual_exists !== "X";
        },

        _getActualStatusText(oItem) {
            if (!oItem) {
                return "";
            }

            if (oItem.actual_exists === "X") {
                return this._text("statusDone");
            }

            if (oItem.actual_calc_target === "X") {
                return this._text("statusTarget");
            }

            return oItem.actual_status || this._text("statusDisplayOnly");
        },

        _getActualStatusState(oItem) {
            if (!oItem) {
                return "None";
            }

            if (oItem.actual_exists === "X") {
                return "Success";
            }

            if (oItem.actual_calc_target === "X") {
                return "Warning";
            }

            return "None";
        },

        _getMainTableTargetRows() {
            var iViewportHeight = 900;
            var iRows;

            if (typeof window !== "undefined" && window.innerHeight) {
                iViewportHeight = window.innerHeight;
            } else if (typeof document !== "undefined" &&
                document.documentElement &&
                document.documentElement.clientHeight) {
                iViewportHeight = document.documentElement.clientHeight;
            }

            iRows = Math.floor((iViewportHeight - 210) / 29);
            return Math.max(14, Math.min(iRows, 42));
        },

        _updateAnalysis(aSelectedItems) {
            aSelectedItems = aSelectedItems || [];
            var mAnalysis = this._getEmptyAnalysis();
            var mTotals = {
                unitPriceDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                unitProcessingDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                unitSettlementVarianceTotal: {
                    value: 0,
                    hasValue: false
                },
                standardCostTotal: {
                    value: 0,
                    hasValue: false
                },
                expectedActualCostTotal: {
                    value: 0,
                    hasValue: false
                },
                totalPriceDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                totalProcessingDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                totalSettlementVarianceTotal: {
                    value: 0,
                    hasValue: false
                },
                processingLaborStdTotal: {
                    value: 0,
                    hasValue: false
                },
                processingLaborActualTotal: {
                    value: 0,
                    hasValue: false
                },
                processingLaborDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                processingMachineStdTotal: {
                    value: 0,
                    hasValue: false
                },
                processingMachineActualTotal: {
                    value: 0,
                    hasValue: false
                },
                processingMachineDiffTotal: {
                    value: 0,
                    hasValue: false
                },
                processingOverheadStdTotal: {
                    value: 0,
                    hasValue: false
                },
                processingOverheadActualTotal: {
                    value: 0,
                    hasValue: false
                },
                processingOverheadDiffTotal: {
                    value: 0,
                    hasValue: false
                }
            };

            mAnalysis.items = aSelectedItems;
            mAnalysis.selectedCount = aSelectedItems.length;
            mAnalysis.selectedProductName = this._getSelectionProductText(aSelectedItems);
            mAnalysis.selectedOptionText = this._getSelectionOptionText(aSelectedItems);
            mAnalysis.actualStatusText = this._getSelectionActualStatusText(aSelectedItems);
            mAnalysis.actualStatusState = this._getSelectionActualStatusState(aSelectedItems);

            aSelectedItems.forEach(function (oItem) {
                this._accumulateAmount(mTotals.standardCostTotal, oItem.std_total_cost);
                this._accumulateAmount(mTotals.unitPriceDiffTotal, oItem.price_diff_amt);
                this._accumulateAmount(mTotals.unitProcessingDiffTotal, oItem.processing_diff_amt);
                this._accumulateAmount(mTotals.unitSettlementVarianceTotal, oItem.display_variance_amt);
                this._accumulateAmount(mTotals.expectedActualCostTotal, oItem.display_expected_actual_cost);
                this._accumulateAmount(mTotals.totalPriceDiffTotal, oItem.display_total_price_diff_amt);
                this._accumulateAmount(mTotals.totalProcessingDiffTotal, oItem.display_total_processing_diff_amt);
                this._accumulateAmount(mTotals.totalSettlementVarianceTotal, oItem.display_total_settlement_amt);
                this._accumulateAmount(mTotals.processingLaborStdTotal, oItem.display_unit_labor_std_processing_amt);
                this._accumulateAmount(mTotals.processingLaborActualTotal, oItem.display_unit_labor_actual_processing_amt);
                this._accumulateAmount(mTotals.processingLaborDiffTotal, oItem.display_unit_labor_processing_diff_amt);
                this._accumulateAmount(mTotals.processingMachineStdTotal, oItem.display_unit_mach_std_processing_amt);
                this._accumulateAmount(mTotals.processingMachineActualTotal, oItem.display_unit_mach_actual_processing_amt);
                this._accumulateAmount(mTotals.processingMachineDiffTotal, oItem.display_unit_mach_processing_diff_amt);
                this._accumulateAmount(mTotals.processingOverheadStdTotal, oItem.display_unit_overhead_std_processing_amt);
                this._accumulateAmount(mTotals.processingOverheadActualTotal, oItem.display_unit_overhead_actual_processing_amt);
                this._accumulateAmount(mTotals.processingOverheadDiffTotal, oItem.display_unit_overhead_processing_diff_amt);
                if (!mAnalysis.currency && oItem.waers) {
                    mAnalysis.currency = oItem.waers;
                }
            }.bind(this));

            mAnalysis.standardCostTotal = mTotals.standardCostTotal.hasValue ? mTotals.standardCostTotal.value : null;
            mAnalysis.unitPriceDiffTotal = mTotals.unitPriceDiffTotal.hasValue ? mTotals.unitPriceDiffTotal.value : null;
            mAnalysis.unitProcessingDiffTotal = mTotals.unitProcessingDiffTotal.hasValue ? mTotals.unitProcessingDiffTotal.value : null;
            mAnalysis.unitSettlementVarianceTotal = mTotals.unitSettlementVarianceTotal.hasValue ? mTotals.unitSettlementVarianceTotal.value : null;
            mAnalysis.expectedActualCostTotal = mTotals.expectedActualCostTotal.hasValue ? mTotals.expectedActualCostTotal.value : null;
            mAnalysis.totalPriceDiffTotal = mTotals.totalPriceDiffTotal.hasValue ? mTotals.totalPriceDiffTotal.value : null;
            mAnalysis.totalProcessingDiffTotal = mTotals.totalProcessingDiffTotal.hasValue ? mTotals.totalProcessingDiffTotal.value : null;
            mAnalysis.totalSettlementVarianceTotal = mTotals.totalSettlementVarianceTotal.hasValue ? mTotals.totalSettlementVarianceTotal.value : null;
            mAnalysis.costFlowTotal = this._getUnitSettlementFlowAmount(mAnalysis);
            mAnalysis.costFlow = this._buildCostFlow(mAnalysis);
            mAnalysis.hasCostFlow = mAnalysis.costFlow.length > 0;
            mAnalysis.processingComparisonRows = this._buildProcessingComparisonRows([
                {
                    labelKey: "processingLabor",
                    standardTotal: mTotals.processingLaborStdTotal,
                    actualTotal: mTotals.processingLaborActualTotal,
                    diffTotal: mTotals.processingLaborDiffTotal
                },
                {
                    labelKey: "processingMachine",
                    standardTotal: mTotals.processingMachineStdTotal,
                    actualTotal: mTotals.processingMachineActualTotal,
                    diffTotal: mTotals.processingMachineDiffTotal
                },
                {
                    labelKey: "processingOverhead",
                    standardTotal: mTotals.processingOverheadStdTotal,
                    actualTotal: mTotals.processingOverheadActualTotal,
                    diffTotal: mTotals.processingOverheadDiffTotal
                }
            ], mAnalysis.currency);
            mAnalysis.hasProcessingComparisonRows = mAnalysis.processingComparisonRows.length > 0;
            mAnalysis.unitBridgeChart = this._buildUnitBridgeChart(mAnalysis);
            mAnalysis.totalImpactChart = this._buildTotalImpactChart(mAnalysis);
            mAnalysis.unitImpactRows = this._buildUnitImpactRows(mAnalysis);
            mAnalysis.totalImpactRows = this._buildTotalImpactRows(mAnalysis);
            mAnalysis.impactBars = this._buildImpactBars(mAnalysis);
            mAnalysis.impactRows = this._buildImpactRows(mAnalysis);

            this.getView().getModel("analysis").setData(mAnalysis);
            this._scheduleMainTableHeightSync();
        },

        _buildUnitBridgeChart(mAnalysis) {
            return [
                {
                    label: this._text("standardCost"),
                    amount: this._toAmount(mAnalysis.standardCostTotal) || 0
                },
                {
                    label: this._text("unitPriceDiff"),
                    amount: this._toAmount(mAnalysis.unitPriceDiffTotal) || 0
                },
                {
                    label: this._text("unitProcessingDiff"),
                    amount: this._toAmount(mAnalysis.unitProcessingDiffTotal) || 0
                },
                {
                    label: this._text("expectedActualCost"),
                    amount: this._toAmount(mAnalysis.expectedActualCostTotal) || 0
                }
            ];
        },

        _buildTotalImpactChart(mAnalysis) {
            return [
                {
                    label: this._text("totalPriceDiff"),
                    amount: this._toAmount(mAnalysis.totalPriceDiffTotal) || 0
                },
                {
                    label: this._text("totalProcessingDiff"),
                    amount: this._toAmount(mAnalysis.totalProcessingDiffTotal) || 0
                },
                {
                    label: this._text("totalSettlementDiff"),
                    amount: this._toAmount(mAnalysis.totalSettlementVarianceTotal) || 0
                }
            ];
        },

        _buildImpactRows(mAnalysis) {
            var sCurrency = mAnalysis.currency || "";
            var aRows = [
                this._createImpactAmountRow("unitImpactTitle", "standardCost", mAnalysis.standardCostTotal, sCurrency, "impactNoteStandard"),
                this._createImpactAmountRow("unitImpactTitle", "unitPriceDiff", mAnalysis.unitPriceDiffTotal, sCurrency, "impactNoteUnitPrice"),
                this._createImpactAmountRow("unitImpactTitle", "unitProcessingDiff", mAnalysis.unitProcessingDiffTotal, sCurrency, "impactNoteUnitProcessing"),
                this._createImpactAmountRow("unitImpactTitle", "unitSettlementDiff", mAnalysis.unitSettlementVarianceTotal, sCurrency, "impactNoteUnitSettlement"),
                this._createImpactAmountRow("unitImpactTitle", "expectedActualCost", mAnalysis.expectedActualCostTotal, sCurrency, "impactNoteExpectedActual"),
                this._createImpactAmountRow("totalImpactTitle", "totalPriceDiff", mAnalysis.totalPriceDiffTotal, sCurrency, "impactNoteTotalPrice"),
                this._createImpactAmountRow("totalImpactTitle", "totalProcessingDiff", mAnalysis.totalProcessingDiffTotal, sCurrency, "impactNoteTotalProcessing"),
                this._createImpactAmountRow("totalImpactTitle", "totalSettlementDiff", mAnalysis.totalSettlementVarianceTotal, sCurrency, "impactNoteTotalSettlement")
            ];

            return aRows.filter(function (oRow) {
                return oRow.displayValue;
            });
        },

        _buildUnitImpactRows(mAnalysis) {
            var sCurrency = mAnalysis.currency || "";
            return [
                this._createPreviewAmountRow("standardCost", mAnalysis.standardCostTotal, sCurrency),
                this._createPreviewAmountRow("unitSettlementDiff", mAnalysis.unitSettlementVarianceTotal, sCurrency),
                this._createPreviewAmountRow("expectedActualCost", mAnalysis.expectedActualCostTotal, sCurrency)
            ].filter(function (oRow) {
                return oRow.displayValue;
            });
        },

        _buildTotalImpactRows(mAnalysis) {
            var sCurrency = mAnalysis.currency || "";
            return [
                this._createPreviewAmountRow("totalSettlementDiff", mAnalysis.totalSettlementVarianceTotal, sCurrency)
            ].filter(function (oRow) {
                return oRow.displayValue;
            });
        },

        _buildImpactBars(mAnalysis) {
            var sCurrency = mAnalysis.currency || "";
            var fPriceAmount = this._toAmount(mAnalysis.unitPriceDiffTotal) || 0;
            var fProcessingAmount = this._toAmount(mAnalysis.unitProcessingDiffTotal) || 0;
            var fTotalAbsAmount = Math.abs(fPriceAmount) + Math.abs(fProcessingAmount);

            return [
                this._createImpactBar("unitPriceDiff", "impactNoteUnitPrice", fPriceAmount, fTotalAbsAmount, sCurrency),
                this._createImpactBar("unitProcessingDiff", "impactNoteUnitProcessing", fProcessingAmount, fTotalAbsAmount, sCurrency)
            ];
        },

        _buildCostFlow(mAnalysis) {
            var sCurrency = mAnalysis.currency || "";
            var fPriceAmount = this._toAmount(mAnalysis.unitPriceDiffTotal);
            var fProcessingAmount = this._toAmount(mAnalysis.unitProcessingDiffTotal);
            var fTotalAmount = this._getUnitSettlementFlowAmount(mAnalysis);

            if (fPriceAmount === null || fProcessingAmount === null || fTotalAmount === null) {
                return [];
            }

            return [
                this._createCostFlowStep(1, "unitPriceDiff", "impactNoteUnitPrice", fPriceAmount, sCurrency, false),
                this._createCostFlowStep(2, "unitProcessingDiff", "impactNoteUnitProcessing", fProcessingAmount, sCurrency, false),
                this._createCostFlowStep(3, "unitSettlementDiff", "impactNoteUnitSettlement", fTotalAmount, sCurrency, true)
            ];
        },

        _getUnitSettlementFlowAmount(mAnalysis) {
            var fTotalAmount = this._toAmount(mAnalysis.unitSettlementVarianceTotal);
            var fPriceAmount;
            var fProcessingAmount;

            if (fTotalAmount !== null) {
                return fTotalAmount;
            }

            fPriceAmount = this._toAmount(mAnalysis.unitPriceDiffTotal);
            fProcessingAmount = this._toAmount(mAnalysis.unitProcessingDiffTotal);

            if (fPriceAmount !== null && fProcessingAmount !== null) {
                return fPriceAmount + fProcessingAmount;
            }

            return null;
        },

        _createCostFlowStep(iStep, sMetricKey, sNoteKey, fAmount, sCurrency, bTotal) {
            return {
                stepText: String(iStep),
                label: this._text(sMetricKey),
                note: this._text(sNoteKey),
                description: this._text(sNoteKey),
                amount: fAmount,
                displayValue: formatter.currency(fAmount, sCurrency),
                state: formatter.amountState(fAmount),
                isTotal: !!bTotal
            };
        },

        _buildProcessingComparisonRows(aParts, sCurrency) {
            return (aParts || []).map(function (oPart) {
                return this._createProcessingComparisonRow(
                    oPart.labelKey,
                    oPart.standardTotal.hasValue ? oPart.standardTotal.value : null,
                    oPart.actualTotal.hasValue ? oPart.actualTotal.value : null,
                    oPart.diffTotal.hasValue ? oPart.diffTotal.value : null,
                    sCurrency
                );
            }.bind(this)).filter(Boolean);
        },

        _createProcessingComparisonRow(sLabelKey, fStandardAmount, fActualAmount, fDiffAmount, sCurrency) {
            var fScale;

            if (fStandardAmount === null || fActualAmount === null || fDiffAmount === null) {
                return null;
            }

            fScale = Math.max(Math.abs(fStandardAmount), Math.abs(fActualAmount));

            return {
                label: this._text(sLabelKey),
                standard: fStandardAmount,
                actual: fActualAmount,
                diff: fDiffAmount,
                displayUnitStd: formatter.currencyInteger(fStandardAmount, sCurrency),
                displayUnitActual: formatter.currencyInteger(fActualAmount, sCurrency),
                displayUnitDiff: formatter.currencyInteger(fDiffAmount, sCurrency),
                standardBarWidth: this._toCompareBarWidth(fStandardAmount, fScale),
                actualBarWidth: this._toCompareBarWidth(fActualAmount, fScale),
                diffState: formatter.amountState(fDiffAmount)
            };
        },

        _toCompareBarWidth(fAmount, fScale) {
            if (!fScale) {
                return "0%";
            }

            return Math.round((Math.abs(fAmount) / fScale) * 1000) / 10 + "%";
        },

        _createImpactBar(sMetricKey, sNoteKey, fAmount, fTotalAbsAmount, sCurrency) {
            var fPercent = fTotalAbsAmount ? Math.round((Math.abs(fAmount) / fTotalAbsAmount) * 1000) / 10 : 0;

            return {
                label: this._text(sMetricKey),
                subtitle: this._text(sNoteKey),
                displayValue: formatter.currency(fAmount, sCurrency),
                percentValue: fPercent,
                displayPercent: formatter.percent(fPercent),
                barWidth: fPercent + "%",
                state: formatter.amountState(fAmount)
            };
        },

        _createPreviewAmountRow(sMetricKey, vAmount, sCurrency) {
            return {
                metric: this._text(sMetricKey),
                displayValue: formatter.currency(vAmount, sCurrency),
                state: formatter.amountState(vAmount)
            };
        },

        _createImpactAmountRow(sBasisKey, sMetricKey, vAmount, sCurrency, sNoteKey) {
            return {
                basis: this._text(sBasisKey),
                metric: this._text(sMetricKey),
                displayValue: formatter.currency(vAmount, sCurrency),
                state: formatter.amountState(vAmount),
                note: this._text(sNoteKey)
            };
        },

        _getSelectionProductText(aItems) {
            if (!aItems.length) {
                return "";
            }

            if (aItems.length === 1) {
                return aItems[0].maktx || "";
            }

            return this._text("selectedMultipleProducts", [aItems.length]);
        },

        _getSelectionOptionText(aItems) {
            if (!aItems.length) {
                return "";
            }

            if (aItems.length === 1) {
                return aItems[0].mtopt_t || "";
            }

            return this._text("selectedMultipleOptions");
        },

        _getSelectionActualStatusText(aItems) {
            if (!aItems.length) {
                return "";
            }

            if (aItems.length === 1) {
                return this._getActualStatusText(aItems[0]);
            }

            var iDoneCount = aItems.filter(function (oItem) {
                return oItem.actual_exists === "X";
            }).length;
            var iExecutableCount = this._getExecutableSettlementItems(aItems).length;

            if (iDoneCount === aItems.length) {
                return this._text("statusDone");
            }

            if (iExecutableCount === aItems.length) {
                return this._text("statusTarget");
            }

            if (iDoneCount || iExecutableCount) {
                return this._text("statusMixed");
            }

            return this._text("statusDisplayOnly");
        },

        _getSelectionActualStatusState(aItems) {
            if (!aItems.length) {
                return "None";
            }

            var iDoneCount = aItems.filter(function (oItem) {
                return oItem.actual_exists === "X";
            }).length;
            var iExecutableCount = this._getExecutableSettlementItems(aItems).length;

            if (iDoneCount === aItems.length) {
                return "Success";
            }

            if (iExecutableCount || iDoneCount) {
                return "Warning";
            }

            return "None";
        },

        _collectFilters() {
            var oData = Object.assign({}, this.getView().getModel("filters").getData());
            oData.bukrs = this._trimUpper(oData.bukrs);
            oData.gjahr = String(oData.gjahr || "").trim();
            oData.monat = this._normalizePoper(oData.monat);
            oData.matnr = this._trimUpper(oData.matnr);
            oData.mtart = this._trimUpper(oData.mtart);
            oData.matkl = this._trimUpper(oData.matkl);
            this.getView().getModel("filters").setData(oData);
            return oData;
        },

        _validateRequiredFilters(mFilters) {
            this._clearInputStates();

            var bValid = true;
            bValid = this._validateInput("companyCodeInput", !!mFilters.bukrs) && bValid;
            bValid = this._validateInput("fiscalYearInput", /^\d{4}$/.test(mFilters.gjahr)) && bValid;
            bValid = this._validateInput("periodInput", /^(00[1-9]|01[0-2])$/.test(mFilters.monat)) && bValid;
            return bValid;
        },

        _validateInput(sId, bValid) {
            var oControl = this.byId(sId);
            oControl.setValueState(bValid ? "None" : "Error");
            oControl.setValueStateText(this._text("requiredField"));
            return bValid;
        },

        _clearInputStates() {
            ["companyCodeInput", "fiscalYearInput", "periodInput"].forEach(function (sId) {
                var oControl = this.byId(sId);
                if (oControl) {
                    oControl.setValueState("None");
                }
            }.bind(this));
        },

        _clearMainSelection() {
            var oTable = this.byId("mainTable");
            if (oTable) {
                if (typeof oTable.removeSelections === "function") {
                    oTable.removeSelections(true);
                } else if (typeof oTable.clearSelection === "function") {
                    oTable.clearSelection();
                }
            }
            this._updateAnalysis([]);
        },

        _setBusy(bBusy) {
            this.getView().getModel("ui").setProperty("/busy", bBusy);
        },

        _setMessage(sMessage, sType) {
            var oModel = this.getView().getModel("ui");
            oModel.setProperty("/message", sMessage);
            oModel.setProperty("/messageType", sType || "Information");
            oModel.setProperty("/messageVisible", !!sMessage);
        },

        _getInitialFilters() {
            var oToday = new Date();
            var sMonth = String(oToday.getMonth() + 1).padStart(3, "0");

            return {
                bukrs: "0001",
                gjahr: String(oToday.getFullYear()),
                monat: sMonth,
                matnr: "",
                mtart: "",
                matkl: ""
            };
        },

        _getEmptyCostCompare() {
            return {
                groupCostRows: [],
                hasGroupCostRows: false,
                typeCostRows: [],
                hasTypeCostRows: false,
                criteriaVarianceRows: [],
                hasCriteriaVarianceRows: false
            };
        },

        _getEmptyAnalysis() {
            return {
                items: [],
                selectedCount: 0,
                selectedProductName: "",
                selectedOptionText: "",
                standardCostTotal: null,
                unitPriceDiffTotal: null,
                unitProcessingDiffTotal: null,
                unitSettlementVarianceTotal: null,
                expectedActualCostTotal: null,
                totalPriceDiffTotal: null,
                totalProcessingDiffTotal: null,
                totalSettlementVarianceTotal: null,
                actualStatusText: "",
                actualStatusState: "None",
                costFlowTotal: null,
                costFlow: [],
                hasCostFlow: false,
                processingComparisonRows: [],
                hasProcessingComparisonRows: false,
                unitBridgeChart: [],
                totalImpactChart: [],
                unitImpactRows: [],
                totalImpactRows: [],
                impactBars: [],
                impactRows: [],
                currency: ""
            };
        },

        _getEmptyBomImpact() {
            return {
                selected: {},
                busy: false,
                hasError: false,
                errorText: "",
                items: [],
                topItems: [],
                donutItems: [],
                count: 0,
                hasData: false,
                hasTopItems: false,
                hasDonutChart: false,
                hasMore: false,
                hasNonZeroImpact: false,
                totalRolledPriceDiffAmt: null,
                currency: ""
            };
        },

        _trimUpper(sValue) {
            return String(sValue || "").trim().toUpperCase();
        },

        _normalizePoper(sValue) {
            var sDigits = String(sValue || "").replace(/\D/g, "");
            if (!sDigits) {
                return "";
            }

            return sDigits.padStart(3, "0");
        },

        _toCalendarMonth(sPoper) {
            return String(sPoper || "").slice(-2);
        },

        _toAmount(vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            var fValue = Number(vValue);
            return Number.isFinite(fValue) ? fValue : null;
        },

        _toRequiredUnitAmount(vAmount, vQuantity) {
            var fAmount = this._toAmount(vAmount);
            var fQuantity = this._toAmount(vQuantity);

            if (fAmount === null || fQuantity === null || fQuantity === 0) {
                return null;
            }

            return fAmount / fQuantity;
        },

        _accumulateAmount(oTotal, vValue) {
            var fAmount = this._toAmount(vValue);
            if (fAmount === null) {
                return;
            }

            oTotal.value += fAmount;
            oTotal.hasValue = true;
        },

        _hasProperties(oEntityType, aProperties) {
            var aNames = this._array(oEntityType.property).map(function (oProperty) {
                return oProperty.name;
            });

            return aProperties.every(function (sProperty) {
                return aNames.indexOf(sProperty) !== -1;
            });
        },

        _isParameterEntityType(oEntityType) {
            return oEntityType &&
                (
                    oEntityType["sap:semantics"] === "parameters" ||
                    oEntityType.semantics === "parameters" ||
                    this._getSapExtensionValue(oEntityType, "semantics") === "parameters" ||
                    /Parameters$/.test(oEntityType.name || "")
                );
        },

        _getSapExtensionValue(oObject, sName) {
            var oExtension = this._array(oObject && oObject.extensions).find(function (oCandidate) {
                return oCandidate.name === sName;
            });

            return oExtension && oExtension.value;
        },

        _array(vValue) {
            if (!vValue) {
                return [];
            }

            return Array.isArray(vValue) ? vValue : [vValue];
        },

        _path(oObject, sPath) {
            return sPath.split(".").reduce(function (oCurrent, sPart) {
                return oCurrent && oCurrent[sPart];
            }, oObject);
        },

        _getErrorMessage(oError) {
            if (!oError) {
                return this._text("unknownError");
            }

            if (oError instanceof Error && oError.message) {
                return oError.message;
            }

            if (oError.responseText) {
                try {
                    var oResponse = JSON.parse(oError.responseText);
                    var sMessage = this._path(oResponse, "error.message.value") ||
                        this._path(oResponse, "error.message");
                    if (sMessage) {
                        return sMessage;
                    }
                } catch (oParseError) {
                    return oError.responseText;
                }
            }

            return oError.message || oError.statusText || this._text("unknownError");
        },

        _getResourceBundle() {
            var oI18nModel = this.getOwnerComponent().getModel("i18n") || this.getView().getModel("i18n");
            return oI18nModel.getResourceBundle();
        },

        _text(sKey, aArgs) {
            return this._getResourceBundle().getText(sKey, aArgs);
        }
    });
});
