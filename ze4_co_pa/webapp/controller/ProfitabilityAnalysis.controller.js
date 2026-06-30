sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/viz/ui5/controls/Popover",
    "sap/viz/ui5/format/ChartFormatter",
    "sap/viz/ui5/api/env/Format",
    "ze4/co/pa/ze4copa/model/formatter",
    "ze4/co/pa/ze4copa/util/ReportExport"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, VizPopover, ChartFormatter, Format, formatter, ReportExport) {
    "use strict";

    var bChartFormattersRegistered = false;

    return Controller.extend("ze4.co.pa.ze4copa.controller.ProfitabilityAnalysis", {
        formatter: formatter,

        onInit: function () {
            this._registerChartFormatters();

            this._mEndpointCache = {};
            this._oViewModel = new JSONModel(this._createInitialState());
            this._oViewModel.setSizeLimit(10000);

            var oView = this.getView && this.getView();
            if (!oView) {
                return;
            }

            this._sViewName = oView.getViewName();
            oView.setModel(this._oViewModel, "app");
            this.onSearch();
        },

        _registerChartFormatters: function () {
            var oChartFormatter = ChartFormatter.getInstance();

            if (oChartFormatter && oChartFormatter.registerCustomFormatter && !bChartFormattersRegistered) {
                try {
                    oChartFormatter.registerCustomFormatter("compactKoreanAmount", function (vValue) {
                        return formatter.amount(vValue);
                    });
                    oChartFormatter.registerCustomFormatter("percentPoint2", function (vValue) {
                        return formatter.percentPoint(vValue);
                    });
                    bChartFormattersRegistered = true;
                } catch (e) {
                    bChartFormattersRegistered = true;
                }
            }

            if (oChartFormatter) {
                Format.numericFormatter(oChartFormatter);
            }
        },

        onAfterRendering: function () {
            this._applyChartProperties();
            this._connectChartPopovers();
        },

        onExportExcel: function () {
            ReportExport.exportExcel(this._buildExportReport(), this.getView());
        },

        onExportPdf: function () {
            ReportExport.printPdf(this._buildExportReport(), this.getView());
        },

        _buildExportReport: function () {
            var sViewName = this._sViewName || "";

            if (sViewName.indexOf("ProductProfitability") > -1) {
                return this._buildProductExportReport();
            }

            if (sViewName.indexOf("ActualPlanProfitability") > -1) {
                return this._buildActualPlanExportReport();
            }

            return this._buildCockpitExportReport();
        },

        _baseExportFilters: function () {
            var oFilters = this._oViewModel.getProperty("/filters") || {};

            return ReportExport.labelRows(oFilters, [
                { label: "회사코드", property: "companyCode" },
                { label: "회계연도", property: "fiscalYear" },
                { label: "회계기간", property: "month" },
                { label: "사업부문", property: "segment" },
                { label: "손익센터", property: "prctr" },
                {
                    label: "기능영역",
                    value: function () {
                        return oFilters.fkber === "__SALES__" ? "판매" : oFilters.fkber;
                    }
                }
            ]);
        },

        _amountText: function (vValue, sCurrency) {
            return formatter.amount(vValue) + (sCurrency ? " " + sCurrency : "");
        },

        _productKpiRows: function () {
            var oKpi = this._oViewModel.getProperty("/kpi") || {};
            var sCurrency = oKpi.currency || "KRW";

            return [
                { label: "판매매출", value: this._amountText(oKpi.sales, sCurrency) },
                { label: "판매매출원가", value: this._amountText(oKpi.cogs, sCurrency) },
                { label: "판매총이익", value: this._amountText(oKpi.grossProfit, sCurrency) },
                { label: "판매총이익률", value: formatter.percent(oKpi.grossProfitRate) },
                { label: "판매기준 판관비", value: this._amountText(oKpi.allocatedSga, sCurrency) },
                { label: "판매기준 영업이익", value: this._amountText(oKpi.operatingProfit, sCurrency) },
                { label: "판매기준 영업이익률", value: formatter.percent(oKpi.operatingProfitRate) }
            ];
        },

        _rentalKpiRows: function () {
            var oKpi = this._oViewModel.getProperty("/rentalKpi") || {};
            var sCurrency = oKpi.currency || "KRW";

            return [
                { label: "렌탈수익", value: this._amountText(oKpi.rentalRevenue, sCurrency) },
                { label: "렌탈 총비용", value: this._amountText(oKpi.rentalTotalCost, sCurrency) },
                { label: "렌탈 영업이익", value: this._amountText(oKpi.rentalOperatingProfit, sCurrency) },
                { label: "렌탈 영업이익률", value: formatter.percent(oKpi.rentalOperatingProfitRate) }
            ];
        },

        _actualPlanKpiRows: function () {
            var oKpi = this._oViewModel.getProperty("/actualPlanKpi") || {};
            var sCurrency = oKpi.currency || "KRW";

            return [
                { label: "매출 실적", value: this._amountText(oKpi.salesActual, sCurrency) },
                { label: "매출 계획", value: this._amountText(oKpi.salesPlan, sCurrency) },
                { label: "매출 차이", value: this._amountText(oKpi.salesDiff, sCurrency) },
                { label: "영업이익 실적", value: this._amountText(oKpi.operatingProfitActual, sCurrency) },
                { label: "영업이익 계획", value: this._amountText(oKpi.operatingProfitPlan, sCurrency) },
                { label: "영업이익 차이", value: this._amountText(oKpi.operatingProfitDiff, sCurrency) }
            ];
        },

        _buildCockpitExportReport: function () {
            return {
                title: "[EverNiture-CO] 수익성 분석 종합 현황",
                fileName: "ProfitabilityCockpit",
                variant: "profitability",
                description: "수익성 Cockpit의 KPI, 사업부문/관리비/제품/렌탈 구조 차트 및 Top rows 리포트",
                filters: this._baseExportFilters(),
                summary: this._productKpiRows().concat(this._rentalKpiRows()),
                charts: [
                    ReportExport.chart("전체 사업부문 수익 비중", "cockpitShareChart", "전체 사업부문 수익 비중", { width: 620, height: 360 }),
                    ReportExport.chart("공통관리비 배부 구조", "cockpitAdminAllocationChart", "공통관리비 배부 구조", { width: 620, height: 360 }),
                    ReportExport.chart("제품/옵션 판매 수익성 구조", "cockpitStructureChart", "제품/옵션 판매 수익성 구조", { width: 620, height: 360 }),
                    ReportExport.chart("렌탈 비용 구조", "cockpitRentalSummaryChart", "렌탈 비용 구조", { width: 620, height: 360 }),
                    ReportExport.chart("전체 수익 구조", "cockpitOverallStructureChart", "전체 수익 구조", { width: 620, height: 360 }),
                    ReportExport.chart("제품그룹별 수익성 요약", "cockpitProductGroupChart", "제품그룹별 수익성 요약", { width: 620, height: 360 })
                ],
                sections: [
                    ReportExport.section("전체 사업부문 수익 비중", this._oViewModel.getProperty("/segmentShareChart"), this._genericChartColumns("사업부문")),
                    ReportExport.section("공통관리비 배부 구조", this._oViewModel.getProperty("/adminAllocationChart"), this._genericChartColumns("항목")),
                    ReportExport.section("제품/옵션 판매 수익성 구조", this._oViewModel.getProperty("/structureChart"), this._genericChartColumns("구분")),
                    ReportExport.section("렌탈 비용 구조", this._oViewModel.getProperty("/rentalCostChart"), this._genericChartColumns("항목")),
                    ReportExport.section("전체 수익 구조", this._oViewModel.getProperty("/overallStructureChart"), this._genericChartColumns("항목")),
                    ReportExport.section("제품그룹별 수익성 요약", this._oViewModel.getProperty("/marginChart"), this._marginColumns()),
                    ReportExport.section("제품/옵션 판매 수익성 Top", this._oViewModel.getProperty("/cockpitTopRows"), this._productColumns())
                ]
            };
        },

        _buildProductExportReport: function () {
            var oKpi = this._oViewModel.getProperty("/kpi") || {};
            var sCurrency = oKpi.currency || "KRW";

            return {
                title: "[EverNiture-CO] 제품/옵션 판매 수익성",
                fileName: "ProductProfitability",
                variant: "profitability",
                description: "제품/옵션별 판매기준 수익성과 판관비 배부 결과 리포트",
                filters: this._baseExportFilters(),
                summary: this._productKpiRows().concat([
                    { label: "판매 직접 판관비", value: this._amountText(oKpi.salesDirectSga, sCurrency) },
                    { label: "공통관리비", value: this._amountText(oKpi.commonAdminPool, sCurrency) },
                    { label: "판매 공통관리비 배부율", value: formatter.percent(oKpi.salesCommonAllocRate) },
                    { label: "공통관리비 판매 배부액", value: this._amountText(oKpi.commonAdminSalesAlloc, sCurrency) },
                    { label: "판매기준 판관비 합계", value: this._amountText(oKpi.sgaPool, sCurrency) }
                ]),
                charts: [
                    ReportExport.chart("제품/옵션별 판매기준 영업이익", "productProfitChart", "제품/옵션별 판매기준 영업이익", { width: 620, height: 340 }),
                    ReportExport.chart("제품그룹별 이익률", "productMarginChart", "제품그룹별 이익률", { width: 620, height: 340 })
                ],
                sections: [
                    ReportExport.section("제품/옵션별 판매기준 영업이익", this._oViewModel.getProperty("/topRows"), this._productColumns()),
                    ReportExport.section("제품그룹별 이익률", this._oViewModel.getProperty("/marginChart"), this._marginColumns()),
                    ReportExport.section("제품/옵션 판매 수익성 상세", this._oViewModel.getProperty("/productRows"), this._productColumns())
                ]
            };
        },

        _buildActualPlanExportReport: function () {
            return {
                title: "[EverNiture-CO] 실적/계획 비교",
                fileName: "ActualPlanProfitability",
                variant: "profitability",
                description: "Actual vs Plan KPI, 월별/프로핏센터/손익항목 차트 및 상세 rows 리포트",
                filters: this._baseExportFilters(),
                summary: this._actualPlanKpiRows(),
                charts: [
                    ReportExport.chart("월별 Actual vs Plan", "actualPlanMonthlyChart", "월별 Actual vs Plan", { width: 620, height: 340 }),
                    ReportExport.chart("조직그룹별 영업이익", "actualPlanProfitCenterChart", "조직그룹별 영업이익", { width: 620, height: 340 }),
                    ReportExport.chart("손익 항목별 실적-계획 차이", "actualPlanVarianceChart", "손익 항목별 실적-계획 차이", { width: 620, height: 340 })
                ],
                sections: [
                    ReportExport.section("월별 Actual vs Plan", this._oViewModel.getProperty("/actualPlanMonthlyChart"), [
                        { label: "월", property: "monthText" },
                        { label: "매출 실적", value: function (oRow) { return formatter.amount(oRow.salesActual); } },
                        { label: "매출 계획", value: function (oRow) { return formatter.amount(oRow.salesPlan); } },
                        { label: "영업이익 실적", value: function (oRow) { return formatter.amount(oRow.operatingProfitActual); } }
                    ]),
                    ReportExport.section("조직그룹별 영업이익", this._oViewModel.getProperty("/actualPlanProfitCenterChart"), [
                        { label: "조직그룹", property: "profitCenter" },
                        { label: "영업이익 실적", value: function (oRow) { return formatter.amount(oRow.actualOperatingProfit); } }
                    ]),
                    ReportExport.section("손익 항목별 실적-계획 차이", this._oViewModel.getProperty("/actualPlanVarianceChart"), [
                        { label: "손익 항목", property: "item" },
                        { label: "차이", value: function (oRow) { return formatter.amount(oRow.diff); } }
                    ]),
                    ReportExport.section("조직그룹 손익 상세", this._oViewModel.getProperty("/actualPlanRows"), this._actualPlanColumns())
                ]
            };
        },

        _genericChartColumns: function (sDimensionLabel) {
            return [
                { label: sDimensionLabel, value: function (oRow) { return oRow.segmentDisplay || oRow.item || oRow.productKey || oRow.label || "-"; } },
                { label: "금액", rawProperty: "amount", value: function (oRow) { return formatter.amount(oRow.amount); }, type: "amount", total: true },
                { label: "비율", rawProperty: "rate", value: function (oRow) { return oRow.rate !== undefined ? formatter.percent(oRow.rate) : ""; }, type: "percent", summary: false }
            ];
        },

        _marginColumns: function () {
            return [
                { label: "제품그룹", property: "productKey" },
                { label: "판매총이익률", rawProperty: "grossProfitRate", value: function (oRow) { return formatter.percentPoint(oRow.grossProfitRate); }, type: "percent", percentScale: "point", summary: false },
                { label: "영업이익률", rawProperty: "operatingProfitRate", value: function (oRow) { return formatter.percentPoint(oRow.operatingProfitRate); }, type: "percent", percentScale: "point", summary: false }
            ];
        },

        _productColumns: function () {
            return [
                { label: "제품", property: "productDisplay" },
                { label: "옵션", property: "optionDisplay" },
                { label: "제품유형", property: "materialTypeDisplay" },
                { label: "제품그룹", property: "materialGroupDisplay" },
                { label: "판매매출", rawProperty: "sales", value: function (oRow) { return formatter.amount(oRow.sales) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "판매매출원가", rawProperty: "cogs", value: function (oRow) { return formatter.amount(oRow.cogs) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "판매총이익", rawProperty: "grossProfit", value: function (oRow) { return formatter.amount(oRow.grossProfit) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                {
                    label: "판매총이익률",
                    rawProperty: "grossProfitRate",
                    value: function (oRow) { return formatter.percent(oRow.grossProfitRate); },
                    type: "percent",
                    summary: "ratio",
                    total: "ratio",
                    numeratorLabel: "판매총이익",
                    denominatorLabel: "판매매출"
                },
                { label: "제품별 배부 판관비", rawProperty: "allocatedSga", value: function (oRow) { return formatter.amount(oRow.allocatedSga) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "판매기준 영업이익", rawProperty: "operatingProfit", value: function (oRow) { return formatter.amount(oRow.operatingProfit) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                {
                    label: "판매기준 영업이익률",
                    rawProperty: "operatingProfitRate",
                    value: function (oRow) { return formatter.percent(oRow.operatingProfitRate); },
                    type: "percent",
                    summary: "ratio",
                    total: "ratio",
                    numeratorLabel: "판매기준 영업이익",
                    denominatorLabel: "판매매출"
                },
                { label: "상태", value: function (oRow) { return Number(oRow.operatingProfit || 0) >= 0 ? "흑자" : "적자"; } }
            ];
        },

        _actualPlanColumns: function () {
            return [
                { label: "회계기간", property: "monat" },
                { label: "사업부문", property: "segmentDisplay" },
                { label: "조직그룹", property: "orgGroupDisplay" },
                { label: "손익센터", property: "prctrDisplay" },
                { label: "기능영역", property: "fkberDisplay" },
                { label: "매출 실적", rawProperty: "actualSales", value: function (oRow) { return oRow.actualSalesText || formatter.amount(oRow.actualSales) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "매출 계획", rawProperty: "displayPlanSales", value: function (oRow) { return oRow.planSalesText || "-"; }, type: "amount", total: true },
                { label: "매출 차이", rawProperty: "displaySalesDiff", value: function (oRow) { return oRow.salesDiffText || "-"; }, type: "amount", total: true },
                {
                    label: "매출 달성률",
                    rawProperty: "displaySalesAchievementRate",
                    value: function (oRow) { return oRow.salesAchievementText || "-"; },
                    type: "percent",
                    summary: "ratio",
                    total: "ratio",
                    numeratorLabel: "매출 실적",
                    denominatorLabel: "매출 계획"
                },
                { label: "매출원가 실적", rawProperty: "actualCogs", value: function (oRow) { return oRow.actualCogsText || formatter.amount(oRow.actualCogs) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "매출원가 계획", rawProperty: "displayPlanCogs", value: function (oRow) { return oRow.planCogsText || "-"; }, type: "amount", total: true },
                { label: "매출원가 차이", rawProperty: "displayCogsDiff", value: function (oRow) { return oRow.cogsDiffText || "-"; }, type: "amount", total: true },
                { label: "판관비 실적", rawProperty: "actualSga", value: function (oRow) { return oRow.actualSgaText || formatter.amount(oRow.actualSga) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "판관비 계획", rawProperty: "displayPlanSga", value: function (oRow) { return oRow.planSgaText || "-"; }, type: "amount", total: true },
                { label: "판관비 차이", rawProperty: "displaySgaDiff", value: function (oRow) { return oRow.sgaDiffText || "-"; }, type: "amount", total: true },
                { label: "제조/차이 실적", rawProperty: "actualVariance", value: function (oRow) { return oRow.actualVarianceText || formatter.amount(oRow.actualVariance) + " " + (oRow.waers || ""); }, type: "amount", total: true, summary: false, bar: false },
                { label: "제조/차이 계획", rawProperty: "displayPlanVariance", value: function (oRow) { return oRow.planVarianceText || "-"; }, type: "amount", total: true, summary: false, bar: false },
                { label: "제조/차이 차이", rawProperty: "displayVarianceDiff", value: function (oRow) { return oRow.varianceDiffText || "-"; }, type: "amount", total: true, summary: false, bar: false },
                { label: "영업이익 실적", rawProperty: "actualOperatingProfit", value: function (oRow) { return oRow.actualOperatingProfitText || formatter.amount(oRow.actualOperatingProfit) + " " + (oRow.waers || ""); }, type: "amount", total: true },
                { label: "영업이익 계획", rawProperty: "displayPlanOperatingProfit", value: function (oRow) { return oRow.planOperatingProfitText || "-"; }, type: "amount", total: true },
                { label: "영업이익 차이", rawProperty: "displayOperatingProfitDiff", value: function (oRow) { return oRow.operatingProfitDiffText || "-"; }, type: "amount", total: true },
                {
                    label: "영업이익 달성률",
                    rawProperty: "displayOpProfitAchievementRate",
                    value: function (oRow) { return oRow.opProfitAchievementText || "-"; },
                    type: "percent",
                    summary: "ratio",
                    total: "ratio",
                    numeratorLabel: "영업이익 실적",
                    denominatorLabel: "영업이익 계획"
                },
                { label: "영업이익률 실적", rawProperty: "actualOperatingProfitRate", value: function (oRow) { return oRow.actualOperatingProfitRateText || formatter.percent(oRow.actualOperatingProfitRate); }, type: "percent", summary: false },
                { label: "영업이익률 계획", rawProperty: "planOperatingProfitRate", value: function (oRow) { return oRow.planOperatingProfitRateText || "-"; }, type: "percent", summary: false }
            ];
        },

        _createInitialState: function () {
            return {
                busy: false,
                productBusy: false,
                rentalBusy: false,
                actualPlanBusy: false,
                drilldownBusy: false,
                filters: this._getDefaultFilterValues(),
                yearOptions: this._buildYearOptions(),
                monthOptions: this._buildMonthOptions(),
                kpi: this._emptyProductKpi(),
                rentalKpi: this._emptyRentalKpi(),
                actualPlanKpi: this._emptyActualPlanKpi(),
                productRows: [],
                rentalRows: [],
                rentalProductRows: [],
                topRows: [],
                cockpitTopRows: [],
                monthlyChart: [],
                segmentShareChart: [],
                adminAllocationChart: [],
                rentalSummaryChart: [],
                rentalMonthlyChart: [],
                rentalCostChart: [],
                rentalOrgChart: [],
                rentalProductChart: [],
                rentalCostBreakdown: [],
                rentalProfitTreemap: [],
                overallStructureChart: [],
                salesSummaryChart: [],
                structureChart: [],
                marginChart: [],
                rentalValueHelp: {
                    segments: [],
                    profitCenters: [],
                    functionalAreas: []
                },
                actualPlanRows: [],
                actualPlanMonthlyChart: [],
                actualPlanMonthlySingle: {},
                actualPlanMonthlyMode: "single",
                actualPlanProfitCenterChart: [],
                actualPlanRevenueOrgChart: [],
                actualPlanSupportCostChart: [],
                actualPlanOrgDetailRows: [],
                actualPlanOrgComparisonRows: [],
                actualPlanManagementPoints: [],
                actualPlanVarianceChart: [],
                actualPlanFinancialFlow: [],
                actualPlanProfitLossStructure: [],
                actualPlanCompositionChart: [],
                actualPlanOrgSummary: {},
                actualPlanHasProfitLossStructure: false,
                actualPlanHasOrgData: false,
                actualPlanShowPlanComparison: false,
                actualPlanShowActualOnly: true,
                actualPlanTopRows: [],
                actualPlanBottomRows: [],
                actualPlanMatrixCells: [],
                actualPlanSelectedRow: null,
                actualPlanSelectedTitle: "",
                actualPlanSelectedPlRows: [],
                actualPlanSelectedCause: {},
                actualPlanFilterSummary: "",
                actualPlanPlanMessage: "",
                actualPlanValueHelp: {
                    segments: [],
                    profitCenters: [],
                    functionalAreas: []
                },
                drilldownRows: [],
                selectedProductTitle: "",
                selectedDrilldownTitle: "",
                productMessage: "",
                rentalMessage: "",
                actualPlanMessage: "",
                summaryMessage: "",
                segmentShareMessage: "",
                rentalSummaryInfoText: this._defaultRentalSummaryInfoText(),
                drilldownMessage: "",
                hasProductData: false,
                hasRentalData: false,
                hasRentalProductData: false,
                hasActualPlanData: false,
                hasPlanData: false
            };
        },

        onSearch: function () {
            if (!this._oViewModel) {
                return;
            }

            if (this._isActualPlanView()) {
                this._loadActualPlan();
                return;
            }

            if (this._isCockpitView()) {
                this._loadCockpitData();
                return;
            }

            this._loadProductData();
        },

        onResetFilters: function () {
            var oDefaults = this._getDefaultFilterValues();
            this._oViewModel.setProperty("/filters", oDefaults);
            this.onSearch();
        },

        onGoCockpit: function () {
            this._navTo("RouteProfitabilityCockpit");
        },

        onGoProduct: function () {
            this._navTo("RouteProductProfitability");
        },

        onGoActualPlan: function () {
            this._navTo("RouteActualPlanProfitability");
        },

        onCockpitAnalysisTabSelect: function () {
            setTimeout(function () {
                this._applyChartProperties();
                this._connectChartPopovers();
            }.bind(this), 0);
        },

        onOpenProductDrilldown: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("app");
            var sDetailType = oEvent.getSource().data("detailType") || "ALL";
            var sDetailTitle = this._journalDetailTypeText(sDetailType);
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject();
            var oDialog = this.byId("drilldownDialog");
            this._oViewModel.setProperty("/selectedProductTitle", [
                sDetailTitle,
                oRow.productOptionDisplay || this._formatProductKey(oRow)
            ].filter(Boolean).join(" - "));
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", "");

            if (oDialog) {
                this._oActiveDrilldownDialog = oDialog;
                oDialog.open();
            }

            this._loadJournalData(oRow, sDetailType);
        },

        onOpenProfitCenterDrilldown: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("app");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject();
            var oDialog = this.byId("profitCenterDrilldownDialog");

            this._oViewModel.setProperty("/selectedDrilldownTitle", [
                oRow.monat ? Number(oRow.monat) + "월" : "",
                oRow.prctrDisplay,
                oRow.segmentDisplay,
                oRow.fkberDisplay
            ].filter(function (sValue) {
                return sValue && sValue !== "-";
            }).join(" / ") || "-");
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", "");

            if (oDialog) {
                this._oActiveDrilldownDialog = oDialog;
                oDialog.open();
            }

            this._loadJournalData(oRow, "profitCenter");
        },

        onSelectActualPlanRow: function (oEvent) {
            var oListItem = oEvent.getParameter && oEvent.getParameter("listItem");
            var oContext = (oListItem || oEvent.getSource()).getBindingContext("app");

            if (oContext) {
                this._setActualPlanSelection(oContext.getObject());
            }
        },

        onSelectActualPlanListItem: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("app");

            if (oContext) {
                this._setActualPlanSelection(oContext.getObject());
            }
        },

        onCloseDrilldown: function (oEvent) {
            var oSource = oEvent && oEvent.getSource && oEvent.getSource();
            var oEventDialog = this._findParentDialog(oSource);
            var aDialogs = [
                oEventDialog,
                this._oActiveDrilldownDialog,
                this.byId("drilldownDialog"),
                this.byId("profitCenterDrilldownDialog")
            ];
            var mClosed = {};

            aDialogs.forEach(function (oDialog) {
                var sId = oDialog && oDialog.getId && oDialog.getId();
                if (oDialog && oDialog.close && !mClosed[sId]) {
                    oDialog.close();
                    if (sId) {
                        mClosed[sId] = true;
                    }
                }
            });
        },

        _findParentDialog: function (oControl) {
            var oCurrent = oControl;

            while (oCurrent) {
                if (oCurrent.isA && oCurrent.isA("sap.m.Dialog")) {
                    return oCurrent;
                }
                oCurrent = oCurrent.getParent && oCurrent.getParent();
            }

            return null;
        },

        _getDefaultFilterValues: function () {
            var oNow = new Date();
            var sYear = String(oNow.getFullYear());
            var sMonth = String(oNow.getMonth() + 1).padStart(2, "0");

            return {
                companyCode: "0001",
                fiscalYear: sYear,
                month: sMonth,
                planVersion: "000",
                matnr: "",
                mtopt: "",
                mtart: "",
                matkl: "",
                segment: "",
                prctr: "",
                fkber: ""
            };
        },

        _buildYearOptions: function () {
            var iCurrentYear = new Date().getFullYear();
            var aYears = [];
            var iYear;

            for (iYear = iCurrentYear - 3; iYear <= iCurrentYear + 1; iYear += 1) {
                aYears.push({
                    key: String(iYear),
                    text: String(iYear)
                });
            }

            return aYears;
        },

        _buildMonthOptions: function () {
            var aMonths = [];
            var iMonth;

            for (iMonth = 1; iMonth <= 12; iMonth += 1) {
                aMonths.push({
                    key: String(iMonth).padStart(2, "0"),
                    text: iMonth + "월"
                });
            }

            return aMonths;
        },

        _emptyProductKpi: function () {
            return {
                sales: null,
                cogs: null,
                grossProfit: null,
                salesDirectSga: null,
                commonAdminPool: null,
                commonAdminSalesAlloc: null,
                commonAdminRentalAlloc: null,
                salesCommonAllocRate: null,
                sgaPool: null,
                salesRevenue: null,
                salesCost: null,
                rentalRevenue: null,
                rentalDepreciation: null,
                totalRevenue: null,
                rentalRevenueRate: null,
                totalSalesBase: null,
                sgaAllocationRate: null,
                allocatedSga: null,
                operatingProfit: null,
                operatingProfitRate: null,
                totalOperatingProfitRate: null,
                grossProfitRate: null,
                allocationNote: "",
                currency: "",
                summaryFieldState: {}
            };
        },

        _emptyRentalKpi: function () {
            return {
                rentalRevenue: null,
                rentalDepr: null,
                rentalService: null,
                rentalContract: null,
                rentalCommon: null,
                rentalRepairCost: null,
                rentalOrgSga: null,
                rentalRecoveryLogi: null,
                commonAdminPool: null,
                commonAdminSalesAlloc: null,
                commonAdminRentalAlloc: null,
                rentalDirectCost: null,
                rentalCostRate: null,
                rentalAdminCostRate: null,
                rentalTotalCost: null,
                rentalOperatingProfit: null,
                rentalOperatingProfitRate: null,
                salesRevenue: null,
                totalRevenue: null,
                salesCommonAllocRate: null,
                currency: ""
            };
        },

        _defaultRentalSummaryInfoText: function () {
            return "";
        },

        _emptyActualPlanKpi: function () {
            return {
                salesActual: null,
                actualCogs: null,
                actualGrossProfit: null,
                actualSga: null,
                salesPlan: null,
                salesDiff: null,
                operatingProfitActual: null,
                operatingProfitPlan: null,
                operatingProfitDiff: null,
                operatingProfitRateDiff: null,
                salesAchievementRate: null,
                operatingProfitActualRate: null,
                operatingProfitPlanRate: null,
                planStatusText: "계획 비교 불가",
                planStatusDetail: "",
                planStatusState: "Information",
                salesActualText: "-",
                salesPlanText: "-",
                salesDiffText: "-",
                salesAchievementText: "-",
                salesAchievementState: "None",
                actualCogsText: "-",
                actualGrossProfitText: "-",
                actualSgaText: "-",
                actualGrossProfitRateText: "-",
                operatingProfitActualText: "-",
                operatingProfitPlanText: "-",
                operatingProfitDiffText: "-",
                operatingProfitActualRateText: "-",
                operatingProfitPlanRateText: "-",
                operatingProfitRateDiffText: "-",
                salesActualState: "None",
                actualCogsState: "Warning",
                actualGrossProfitState: "None",
                actualSgaState: "Warning",
                operatingProfitActualState: "None",
                majorCauseTitle: "-",
                majorCauseText: "",
                majorCauseAmountText: "-",
                majorCauseState: "None",
                currency: ""
            };
        },

        _isCockpitView: function () {
            return this._sViewName && this._sViewName.indexOf("ProfitabilityCockpit") > -1;
        },

        _isActualPlanView: function () {
            return this._sViewName && this._sViewName.indexOf("ActualPlanProfitability") > -1;
        },

        _navTo: function (sRouteName) {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo(sRouteName);
        },

        _getOwnerModel: function (sName) {
            var oComponent = this.getOwnerComponent && this.getOwnerComponent();
            return oComponent && oComponent.getModel(sName);
        },

        _periodParameters: function () {
            var oFilters = this._oViewModel.getProperty("/filters");

            return {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            };
        },

        _loadCockpitData: function () {
            var oProductModel = this._getOwnerModel();
            var oRentalModel = this._getOwnerModel("rental");
            var aParameterNames = ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"];
            var mParameters = this._periodParameters();
            var oProductPromise;
            var oRentalPromise;

            if (!oProductModel) {
                this._setProductError("제품/옵션 판매 수익성 OData 모델을 찾을 수 없습니다.");
                return;
            }

            this._oViewModel.setProperty("/busy", true);
            this._oViewModel.setProperty("/productBusy", true);
            this._oViewModel.setProperty("/rentalBusy", true);
            this._oViewModel.setProperty("/productMessage", "");
            this._oViewModel.setProperty("/rentalMessage", "");
            this._oViewModel.setProperty("/summaryMessage", "");

            oProductPromise = this._readParameterizedSet(oProductModel, aParameterNames, mParameters, this._buildProductFilters());
            oRentalPromise = oRentalModel ?
                this._readParameterizedSet(oRentalModel, aParameterNames, mParameters, []).then(function (aRows) {
                    return {
                        rows: aRows,
                        message: ""
                    };
                }).catch(function (oError) {
                    return {
                        rows: [],
                        message: this._formatODataError(oError, "렌탈 수익성 데이터를 조회하지 못했습니다.")
                    };
                }.bind(this)) :
                Promise.resolve({
                    rows: [],
                    message: "렌탈 수익성 OData 모델을 찾을 수 없습니다."
                });

            Promise.all([oProductPromise, oRentalPromise]).then(function (aResults) {
                var aRentalRows = aResults[1].rows || [];
                var sRentalMessage = aResults[1].message || "";

                this._applyProductData(aResults[0]);
                this._applyRentalData(aRentalRows, aRentalRows);
                this._applyCockpitRentalSummary(sRentalMessage);
            }.bind(this)).catch(function (oError) {
                this._setProductError(this._formatODataError(oError, "제품/옵션 판매 수익성 데이터를 조회하지 못했습니다."));
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/busy", false);
                this._oViewModel.setProperty("/productBusy", false);
                this._oViewModel.setProperty("/rentalBusy", false);
            }.bind(this));
        },

        _loadProductData: function (bLoadActualPlanSummary) {
            var oModel = this._getOwnerModel();
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = this._buildProductFilters();

            if (!oModel) {
                this._setProductError("제품/옵션 판매 수익성 OData 모델을 찾을 수 없습니다.");
                return;
            }

            this._oViewModel.setProperty("/busy", true);
            this._oViewModel.setProperty("/productBusy", true);
            this._oViewModel.setProperty("/productMessage", "");
            this._oViewModel.setProperty("/rentalSummaryInfoText", this._defaultRentalSummaryInfoText());

            var aParameterNames = ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"];
            var mParameters = {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            };
            var oRentalDepreciationPromise = bLoadActualPlanSummary ?
                this._readRentalDepreciationAmount().catch(function (oError) {
                    return {
                        amount: null,
                        message: this._formatODataError(oError, "렌탈 감가상각비는 AF 전표 기반 렌탈 비용 OData 연결 후 표시됩니다.")
                    };
                }.bind(this)) :
                Promise.resolve(null);

            this._readParameterizedSet(oModel, aParameterNames, mParameters, aODataFilters).then(function (aRows) {
                return oRentalDepreciationPromise.then(function (oRentalDepreciation) {
                    this._applyProductData(aRows, oRentalDepreciation);

                    if (bLoadActualPlanSummary) {
                        this._loadActualPlan(true);
                    }
                }.bind(this));
            }.bind(this)).catch(function (oError) {
                this._setProductError(this._formatODataError(oError, "제품/옵션 판매 수익성 데이터를 조회하지 못했습니다."));
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/busy", false);
                this._oViewModel.setProperty("/productBusy", false);
            }.bind(this));
        },

        _loadActualPlan: function (bSummaryOnly) {
            var oModel = this._getOwnerModel("actualPlan");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = this._buildActualPlanFilters();

            if (!oModel) {
                this._setActualPlanError("실적/계획 비교 OData 모델을 찾을 수 없습니다.");
                return;
            }

            this._oViewModel.setProperty("/actualPlanBusy", true);
            this._oViewModel.setProperty("/actualPlanMessage", "");

            var mParameters = {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month,
                p_versn: oFilters.planVersion
            };
            var oDataPromise = this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to", "p_versn"],
                mParameters, aODataFilters);
            var oValueHelpPromise = this._hasActualPlanOptionalFilters(oFilters) ?
                this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to", "p_versn"], mParameters, []) :
                oDataPromise;

            Promise.all([oDataPromise, oValueHelpPromise]).then(function (aResults) {
                this._applyActualPlanData(aResults[0], aResults[1], bSummaryOnly);
            }.bind(this)).catch(function (oError) {
                var sMessage = this._formatODataError(oError, "실적/계획 비교 데이터를 조회하지 못했습니다.");
                if (!bSummaryOnly) {
                    this._setActualPlanError(sMessage);
                } else {
                    this._oViewModel.setProperty("/actualPlanMessage", sMessage);
                }
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/actualPlanBusy", false);
            }.bind(this));
        },

        _loadJournalData: function (oSourceRow, sMode) {
            var oModel = this._getOwnerModel("journal");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aODataFilters = [];

            if (!oModel) {
                this._setDrilldownError("전표 상세 OData 모델을 찾을 수 없습니다.");
                return;
            }

            if (sMode === "profitCenter") {
                if (oSourceRow.prctr) {
                    aODataFilters.push(new Filter("prctr", FilterOperator.EQ, oSourceRow.prctr));
                }
                if (oSourceRow.segment) {
                    aODataFilters.push(new Filter("segment", FilterOperator.EQ, oSourceRow.segment));
                }
            } else {
                if (oSourceRow.matnr) {
                    aODataFilters.push(new Filter("matnr", FilterOperator.EQ, oSourceRow.matnr));
                }
                if (oSourceRow.mtopt) {
                    aODataFilters.push(new Filter("mtopt", FilterOperator.EQ, oSourceRow.mtopt));
                }
                this._addProductJournalDetailFilters(aODataFilters, sMode);
            }

            this._oViewModel.setProperty("/drilldownBusy", true);

            this._readParameterizedSet(oModel, ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"], {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            }, aODataFilters).then(function (aRows) {
                var aDrilldownRows = this._sortJournalRows((aRows || []).map(this._decorateJournalRow, this));
                this._oViewModel.setProperty("/drilldownRows", aDrilldownRows);
                this._oViewModel.setProperty("/drilldownMessage", aDrilldownRows.length ? "" : "선택한 조건에 해당하는 전표 라인이 없습니다.");
            }.bind(this)).catch(function (oError) {
                this._setDrilldownError(this._formatODataError(oError, "전표 상세 데이터를 조회하지 못했습니다."));
            }.bind(this)).finally(function () {
                this._oViewModel.setProperty("/drilldownBusy", false);
            }.bind(this));
        },

        _readRentalDepreciationAmount: function () {
            var oModel = this._getOwnerModel("journal");
            var oFilters = this._oViewModel.getProperty("/filters");
            var aParameterNames = ["p_bukrs", "p_gjahr", "p_monat_from", "p_monat_to"];
            var mParameters = {
                p_bukrs: oFilters.companyCode,
                p_gjahr: oFilters.fiscalYear,
                p_monat_from: oFilters.month,
                p_monat_to: oFilters.month
            };

            if (!oModel) {
                return Promise.resolve({
                    amount: null,
                    message: "렌탈 감가상각비는 전표 Drill-Down OData 모델이 없어 표시할 수 없습니다."
                });
            }

            return this._resolveParameterizedEndpoint(oModel, aParameterNames).then(function (oEndpoint) {
                var sRacctProperty = this._findEndpointProperty(oEndpoint, ["racct", "RACCT"]);
                var sBlartProperty = this._findEndpointProperty(oEndpoint, ["blart", "BLART"]);
                var sAmountProperty = this._findEndpointProperty(oEndpoint, ["pl_amount", "PL_AMOUNT"]);
                var sPrctrProperty = this._findEndpointProperty(oEndpoint, ["prctr", "PRCTR"]);
                var sFkberProperty = this._findEndpointProperty(oEndpoint, ["fkber", "FKBER"]);
                var sKostlProperty = this._findEndpointProperty(oEndpoint, ["kostl", "KOSTL"]);
                var aOrgFilters = [];
                var aOrgFilterTexts = [];
                var aODataFilters;

                if (!sRacctProperty || !sBlartProperty || !sAmountProperty) {
                    return {
                        amount: null,
                        source: "ZCDS_E4_CO_0044_CDS",
                        entitySet: oEndpoint.entitySet,
                        message: "렌탈 감가상각비는 전표 Drill-Down OData에 racct, blart, pl_amount 필드가 있어야 표시됩니다."
                    };
                }

                if (sPrctrProperty) {
                    aOrgFilters.push(new Filter(sPrctrProperty, FilterOperator.EQ, "PC_RT"));
                    aOrgFilterTexts.push(sPrctrProperty + "=PC_RT");
                }
                if (sFkberProperty) {
                    aOrgFilters.push(new Filter(sFkberProperty, FilterOperator.EQ, "5000"));
                    aOrgFilterTexts.push(sFkberProperty + "=5000");
                }
                if (sKostlProperty) {
                    aOrgFilters.push(new Filter(sKostlProperty, FilterOperator.EQ, "CC_RT02"));
                    aOrgFilterTexts.push(sKostlProperty + "=CC_RT02");
                }

                if (!aOrgFilters.length) {
                    return {
                        amount: null,
                        source: "ZCDS_E4_CO_0044_CDS",
                        entitySet: oEndpoint.entitySet,
                        message: "렌탈 감가상각비는 조직 기준 필드(prctr/fkber/kostl) 확인 후 표시됩니다."
                    };
                }

                aODataFilters = [
                    new Filter(sRacctProperty, FilterOperator.EQ, "700007"),
                    new Filter(sBlartProperty, FilterOperator.EQ, "AF"),
                    new Filter({
                        filters: aOrgFilters,
                        and: false
                    })
                ];

                return this._readParameterizedSet(oModel, aParameterNames, mParameters, aODataFilters).then(function (aRows) {
                    var fAmount = this._sum((aRows || []).map(function (oRow) {
                        return {
                            amount: this._toNumber(this._readField(oRow, sAmountProperty))
                        };
                    }.bind(this)), "amount");

                    return {
                        amount: this._isFiniteNumber(fAmount) ? fAmount : null,
                        source: "ZCDS_E4_CO_0044_CDS",
                        entitySet: oEndpoint.entitySet,
                        navigationProperty: oEndpoint.navigationProperty,
                        filterText: sRacctProperty + "=700007, " + sBlartProperty + "=AF, " + aOrgFilterTexts.join(" or "),
                        message: this._isFiniteNumber(fAmount) ? "" :
                            "조회 조건에 해당하는 렌탈 감가상각비 AF 전표가 없어 금액을 표시하지 않습니다."
                    };
                }.bind(this));
            }.bind(this));
        },

        _buildProductFilters: function () {
            var oFilters = this._oViewModel.getProperty("/filters");
            var aFilters = [];

            if (oFilters.matnr) {
                aFilters.push(new Filter("matnr", FilterOperator.EQ, oFilters.matnr));
            }
            if (oFilters.mtopt) {
                aFilters.push(new Filter("mtopt", FilterOperator.EQ, oFilters.mtopt));
            }
            if (oFilters.mtart) {
                aFilters.push(new Filter("mtart", FilterOperator.EQ, oFilters.mtart));
            }
            if (oFilters.matkl) {
                aFilters.push(new Filter("matkl", FilterOperator.EQ, oFilters.matkl));
            }

            return aFilters;
        },

        _hasActualPlanOptionalFilters: function (oFilters) {
            return !!(oFilters && (oFilters.segment || oFilters.prctr || oFilters.fkber));
        },

        _buildActualPlanFilters: function () {
            var oFilters = this._oViewModel.getProperty("/filters");
            var aFilters = [];

            if (oFilters.segment) {
                aFilters.push(new Filter("segment", FilterOperator.EQ, oFilters.segment));
            }
            if (oFilters.prctr) {
                aFilters.push(new Filter("prctr", FilterOperator.EQ, oFilters.prctr));
            }
            if (oFilters.fkber && oFilters.fkber !== "__SALES__") {
                aFilters.push(new Filter("fkber", FilterOperator.EQ, oFilters.fkber));
            }

            return aFilters;
        },

        _addProductJournalDetailFilters: function (aFilters, sDetailType) {
            if (sDetailType === "SALES") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("racct", FilterOperator.EQ, "400001"),
                        new Filter("racct", FilterOperator.EQ, "400002")
                    ],
                    and: false
                }));
            } else if (sDetailType === "COGS") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("racct", FilterOperator.EQ, "600001"),
                        new Filter("racct", FilterOperator.EQ, "600002")
                    ],
                    and: false
                }));
            } else if (sDetailType === "VAR") {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("acct_group", FilterOperator.EQ, "VAR"),
                        new Filter("racct", FilterOperator.StartsWith, "8")
                    ],
                    and: false
                }));
            }
        },

	        _readParameterizedSet: function (oModel, aParameterNames, mParameters, aFilters) {
	            return this._resolveParameterizedEndpoint(oModel, aParameterNames).then(function (oEndpoint) {
	                if (oEndpoint.direct) {
	                    return this._readDirectSet(oModel, oEndpoint, mParameters, aFilters);
	                }

	                return new Promise(function (resolve, reject) {
	                    var aEndpointParameterNames = oEndpoint.parameterNames || aParameterNames;
	                    var sKeyPredicate = aEndpointParameterNames.map(function (sName) {
	                        return sName + "=" + this._encodeODataString(mParameters[sName]);
	                    }.bind(this)).join(",");
	                    var sPath = "/" + oEndpoint.entitySet + "(" + sKeyPredicate + ")/" + oEndpoint.navigationProperty;

	                    oModel.read(sPath, {
	                        filters: aFilters || [],
	                        headers: this._noCacheHeaders(),
	                        success: function (oData) {
	                            resolve(oData && oData.results ? oData.results : []);
	                        },
	                        error: reject
	                    });
	                }.bind(this));
	            }.bind(this));
	        },

	        _readDirectSet: function (oModel, oEndpoint, mParameters, aFilters) {
	            return new Promise(function (resolve, reject) {
	                oModel.read("/" + oEndpoint.entitySet, {
	                    filters: this._buildDirectSetFilters(oEndpoint, mParameters, aFilters),
	                    headers: this._noCacheHeaders(),
	                    success: function (oData) {
	                        resolve(oData && oData.results ? oData.results : []);
	                    },
	                    error: reject
	                });
	            }.bind(this));
	        },

	        _buildDirectSetFilters: function (oEndpoint, mParameters, aFilters) {
	            var aDirectFilters = (aFilters || []).slice();
	            var sBukrsProperty = this._findEndpointProperty(oEndpoint, ["bukrs", "BUKRS"]);
	            var sGjahrProperty = this._findEndpointProperty(oEndpoint, ["gjahr", "GJAHR"]);
	            var sMonatProperty = this._findEndpointProperty(oEndpoint, ["monat", "MONAT"]);
	            var sVersionProperty = this._findEndpointProperty(oEndpoint, ["versn", "VERSN", "version", "VERSION"]);

		            if (sBukrsProperty && mParameters.p_bukrs) {
		                aDirectFilters.push(new Filter(sBukrsProperty, FilterOperator.EQ, mParameters.p_bukrs));
		            }
		            if (sGjahrProperty && mParameters.p_gjahr) {
		                aDirectFilters.push(new Filter(sGjahrProperty, FilterOperator.EQ, mParameters.p_gjahr));
		            }
		            if (sMonatProperty && mParameters.p_monat_from && mParameters.p_monat_to) {
		                if (mParameters.p_monat_from === mParameters.p_monat_to) {
		                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.EQ, mParameters.p_monat_from));
		                } else {
		                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.GE, mParameters.p_monat_from));
		                    aDirectFilters.push(new Filter(sMonatProperty, FilterOperator.LE, mParameters.p_monat_to));
		                }
		            }
	            if (sVersionProperty && mParameters.p_versn) {
	                aDirectFilters.push(new Filter(sVersionProperty, FilterOperator.EQ, mParameters.p_versn));
	            }

	            return aDirectFilters;
	        },

	        _noCacheHeaders: function () {
	            return {
	                "Cache-Control": "no-cache",
	                "Pragma": "no-cache"
	            };
	        },

	        _resolveParameterizedEndpoint: function (oModel, aParameterNames) {
            var sCacheKey = (oModel.sServiceUrl || "") + "::" + aParameterNames.join("|");

            if (this._mEndpointCache[sCacheKey]) {
                return Promise.resolve(this._mEndpointCache[sCacheKey]);
            }

            return this._waitForMetadata(oModel).then(function () {
                var oEndpoint = this._findParameterizedEndpoint(oModel.getServiceMetadata(), aParameterNames);

                if (!oEndpoint) {
                    throw new Error("Parameterized CDS metadata 구조를 찾을 수 없습니다.");
                }

                this._mEndpointCache[sCacheKey] = oEndpoint;
                return oEndpoint;
            }.bind(this));
        },

        _waitForMetadata: function (oModel) {
            if (oModel.getServiceMetadata && oModel.getServiceMetadata()) {
                return Promise.resolve();
            }

            if (oModel.isMetadataLoadingFailed && oModel.isMetadataLoadingFailed()) {
                return Promise.reject(this._createMetadataError(null, oModel.sServiceUrl));
            }

            return new Promise(function (resolve, reject) {
                var bSettled = false;
                var fnMetadataFailed;
                var fnCleanup = function () {
                    if (oModel.detachMetadataFailed && fnMetadataFailed) {
                        oModel.detachMetadataFailed(fnMetadataFailed);
                    }
                };
                var fnResolve = function () {
                    if (bSettled) {
                        return;
                    }
                    bSettled = true;
                    fnCleanup();
                    resolve();
                };

                fnMetadataFailed = function (oEvent) {
                    if (bSettled) {
                        return;
                    }
                    bSettled = true;
                    fnCleanup();
                    reject(this._createMetadataError(oEvent, oModel.sServiceUrl));
                }.bind(this);

                if (oModel.attachMetadataFailed) {
                    oModel.attachMetadataFailed(fnMetadataFailed);
                }

                oModel.metadataLoaded().then(fnResolve).catch(fnMetadataFailed);
            }.bind(this));
        },

        _createMetadataError: function (oEvent, sServiceUrl) {
            var oResponse = oEvent && oEvent.getParameter && oEvent.getParameter("response") || {};
            var sStatus = oResponse.statusCode || oResponse.status || "";
            var sStatusText = oResponse.statusText || oResponse.status || "";
            var sMessage = "OData metadata를 불러오지 못했습니다.";

            if (sServiceUrl) {
                sMessage += " 서비스: " + sServiceUrl;
            }
            if (sStatus || sStatusText) {
                sMessage += " (" + [sStatus, sStatusText].filter(Boolean).join(" ") + ")";
            }

            return {
                message: sMessage,
                statusCode: sStatus,
                statusText: sStatusText,
                responseText: oResponse.responseText || oResponse.body || ""
            };
        },

        _findParameterizedEndpoint: function (oMetadata, aParameterNames) {
            var aSchemas = this._asArray(oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema);
            var oSchema;
            var oEntityType;
            var oEntitySet;
            var i;

            for (i = 0; i < aSchemas.length; i += 1) {
                oSchema = aSchemas[i];
                oEntityType = this._findParameterEntityType(oSchema, aParameterNames);
                if (!oEntityType) {
                    continue;
                }

                oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                if (!oEntitySet) {
                    continue;
                }

                return {
                    entitySet: oEntitySet.name,
                    navigationProperty: this._findResultNavigation(oEntityType),
                    parameterNames: this._getExistingPropertyNames(oEntityType, aParameterNames),
                    properties: this._getEntityPropertyNames(this._findNavigationTargetEntityType(
                        oSchema,
                        oEntityType,
                        this._findResultNavigation(oEntityType)
                    ))
                };
            }

            return this._findDirectEndpoint(oMetadata);
        },

        _findParameterEntityType: function (oSchema, aParameterNames) {
            var aEntityTypes = this._asArray(oSchema.entityType);
            var aExactCandidates = aEntityTypes.filter(function (oEntityType) {
                return this._entityHasProperties(oEntityType, aParameterNames) &&
                    this._asArray(oEntityType.navigationProperty).length > 0;
            }.bind(this));
            var aPartialCandidates;

            if (aExactCandidates.length) {
                return aExactCandidates.filter(function (oEntityType) {
                    return /Parameters$/i.test(oEntityType.name || "");
                })[0] || aExactCandidates[0];
            }

            aPartialCandidates = aEntityTypes.filter(function (oEntityType) {
                return this._asArray(oEntityType.navigationProperty).length > 0 &&
                    this._getExistingPropertyNames(oEntityType, aParameterNames).length >= Math.max(1, aParameterNames.length - 1);
            }.bind(this));

            return aPartialCandidates.filter(function (oEntityType) {
                return /Parameters$/i.test(oEntityType.name || "");
            })[0] || aPartialCandidates[0];
        },

        _findDirectEndpoint: function (oMetadata) {
            var aSchemas = this._asArray(oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema);
            var aResultFieldGroups = [
                ["actual_sales_amt", "actual_operating_profit_amt"],
                ["rental_revenue_amt", "rental_operating_profit_amt"],
                ["sales_amt", "operating_profit_amt"],
                ["belnr", "docln"]
            ];
            var i;
            var oSchema;
            var aEntityTypes;
            var oEntityType;
            var oEntitySet;
            var j;

            for (i = 0; i < aSchemas.length; i += 1) {
                oSchema = aSchemas[i];
                aEntityTypes = this._asArray(oSchema.entityType);

                for (j = 0; j < aEntityTypes.length; j += 1) {
                    oEntityType = aEntityTypes[j];
                    if (this._asArray(oEntityType.navigationProperty).length > 0) {
                        continue;
                    }
                    if (!aResultFieldGroups.some(function (aFields) {
                            return this._entityHasProperties(oEntityType, aFields);
                        }.bind(this))) {
                        continue;
                    }

                    oEntitySet = this._findEntitySetForType(oSchema, oEntityType.name);
                    if (oEntitySet) {
                        return {
                            direct: true,
                            entitySet: oEntitySet.name,
                            properties: this._getEntityPropertyNames(oEntityType)
                        };
                    }
                }
            }

            return null;
        },

        _findEntitySetForType: function (oSchema, sEntityTypeName) {
            var aContainers = this._asArray(oSchema.entityContainer);
            var sQualifiedTypeName = oSchema.namespace + "." + sEntityTypeName;
            var i;
            var aEntitySets;
            var oEntitySet;

            for (i = 0; i < aContainers.length; i += 1) {
                aEntitySets = this._asArray(aContainers[i].entitySet);
                oEntitySet = aEntitySets.filter(function (oSet) {
                    return oSet.entityType === sQualifiedTypeName;
                })[0];

                if (oEntitySet) {
                    return oEntitySet;
                }
            }

            return null;
        },

        _findResultNavigation: function (oEntityType) {
            var aNavigationProperties = this._asArray(oEntityType.navigationProperty);
            var oSetNavigation = aNavigationProperties.filter(function (oNavigationProperty) {
                return oNavigationProperty.name === "Set";
            })[0];

            return (oSetNavigation || aNavigationProperties[0]).name;
        },

        _findNavigationTargetEntityType: function (oSchema, oEntityType, sNavigationName) {
            var oNavigation = this._asArray(oEntityType && oEntityType.navigationProperty).filter(function (oCandidate) {
                return oCandidate.name === sNavigationName;
            })[0];
            var sRelationship = oNavigation && oNavigation.relationship || "";
            var sRelationshipName = sRelationship.split(".").pop();
            var oAssociation = this._asArray(oSchema && oSchema.association).filter(function (oCandidate) {
                return oCandidate.name === sRelationshipName || oSchema.namespace + "." + oCandidate.name === sRelationship;
            })[0];
            var oTargetEnd = this._asArray(oAssociation && oAssociation.end).filter(function (oEnd) {
                return oEnd.role === oNavigation.toRole;
            })[0];
            var sEntityTypeName = (oTargetEnd && oTargetEnd.type || "").split(".").pop();

            return this._asArray(oSchema && oSchema.entityType).filter(function (oCandidate) {
                return oCandidate.name === sEntityTypeName;
            })[0] || null;
        },

        _entityHasProperties: function (oEntityType, aPropertyNames) {
            var aProperties = this._getEntityPropertyNames(oEntityType);

            return aPropertyNames.every(function (sName) {
                return aProperties.indexOf(sName) > -1;
            });
        },

        _getExistingPropertyNames: function (oEntityType, aPropertyNames) {
            var aProperties = this._getEntityPropertyNames(oEntityType);

            return aPropertyNames.filter(function (sName) {
                return aProperties.indexOf(sName) > -1;
            });
        },

        _getEntityPropertyNames: function (oEntityType) {
            return this._asArray(oEntityType && oEntityType.property).map(function (oProperty) {
                return oProperty.name;
            });
        },

        _findEndpointProperty: function (oEndpoint, aPropertyNames) {
            var aProperties = oEndpoint && oEndpoint.properties || [];
            var i;

            for (i = 0; i < aPropertyNames.length; i += 1) {
                if (aProperties.indexOf(aPropertyNames[i]) > -1) {
                    return aPropertyNames[i];
                }
            }

            return "";
        },

        _asArray: function (vValue) {
            if (!vValue) {
                return [];
            }
            return Array.isArray(vValue) ? vValue : [vValue];
        },

        _encodeODataString: function (vValue) {
            return "'" + String(vValue || "").replace(/'/g, "''") + "'";
        },

        _applyProductData: function (aRows, oRentalDepreciation) {
            var aMappedRows = (aRows || []).map(function (oRow) {
                var oMapped = this._decorateProductText(oRow);
                var sCurrency = this._readField(oRow, "waers");

                oMapped.sales = this._toNumber(oRow.sales_amt);
                oMapped.cogs = this._toNumber(oRow.cogs_amt);
                oMapped.grossProfit = this._toNumber(oRow.gross_profit_amt);
                oMapped.grossProfitRate = this._toNumber(oRow.gross_profit_rate);
                oMapped.variance = this._normalizeVarianceAmount(oRow.variance_amt, sCurrency);
                oMapped.salesDirectSga = this._toNumber(this._readField(oRow, "sales_direct_sga_amt"));
                oMapped.commonAdminPool = this._toNumber(this._readField(oRow, "common_admin_pool_amt"));
                oMapped.commonAdminSalesAlloc = this._toNumber(this._readField(oRow, "common_admin_sales_alloc_amt"));
                oMapped.salesCommonAllocRate = this._toNumber(this._readField(oRow, "sales_common_alloc_rate"));
                oMapped.sgaPool = this._toNumber(oRow.sga_pool_amt);
                oMapped.salesRevenue = this._toNumber(this._readField(oRow, "sales_revenue_amt"));
                oMapped.rentalRevenue = this._toNumber(this._readField(oRow, "rental_revenue_amt"));
                oMapped.totalRevenue = this._toNumber(this._readField(oRow, "total_revenue_amt"));
                oMapped.totalSalesBase = this._toNumber(oRow.total_sales_base_amt);
                oMapped.sgaAllocationRate = this._toNumber(oRow.sga_allocation_rate);
                oMapped.allocatedSga = this._toNumber(oRow.allocated_sga_amt);
                oMapped.operatingProfit = this._toNumber(oRow.operating_profit_amt);
                oMapped.operatingProfitRate = this._toNumber(oRow.operating_profit_rate);
                oMapped.allocationNote = this._readField(oRow, "allocation_note");
                oMapped.profitState = formatter.stateByAmount(oMapped.operatingProfit);
                oMapped.rateState = formatter.stateByRate(oMapped.operatingProfitRate);

                return oMapped;
            }.bind(this));
            var aProductRows = this._filterProductDetailRows(aMappedRows);
            var aProfitRows;

            aProductRows.sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.operatingProfit) - this._sortNumber(oLeft.operatingProfit) ||
                    this._sortNumber(oRight.sales) - this._sortNumber(oLeft.sales) ||
                    String(oLeft.productDisplay || "").localeCompare(String(oRight.productDisplay || ""));
            }.bind(this));
            aProfitRows = this._filterProductProfitRows(aProductRows);

            var oKpi = this._calculateProductKpi(aProductRows, aMappedRows);
            this._applyRentalDepreciationResult(oKpi, oRentalDepreciation);
            var aTopRows = aProfitRows.slice(0, 10);
            var aCockpitTopRows = aProfitRows.slice(0, 5);

            this._oViewModel.setProperty("/productRows", aProductRows);
            this._oViewModel.setProperty("/topRows", aTopRows);
            this._oViewModel.setProperty("/cockpitTopRows", aCockpitTopRows);
            this._oViewModel.setProperty("/kpi", oKpi);
            this._oViewModel.setProperty("/monthlyChart", this._buildMonthlyChart(oKpi));
            this._oViewModel.setProperty("/structureChart", this._buildStructureChart(oKpi));
            this._oViewModel.setProperty("/marginChart", this._buildMarginChart(aProfitRows));
            this._oViewModel.setProperty("/adminAllocationChart", this._buildAdminAllocationChart(oKpi));
            this._oViewModel.setProperty("/rentalSummaryChart", this._buildRentalSummaryChart(oKpi));
            this._oViewModel.setProperty("/salesSummaryChart", this._buildSalesSummaryChart(oKpi));
            this._applyRevenueShareData(oKpi);
            this._oViewModel.setProperty("/hasProductData", aProductRows.length > 0);
            this._oViewModel.setProperty("/productMessage", this._buildProductDataMessage(aProductRows, aProfitRows, aMappedRows));
            this._refreshProductProfitChartReferenceLines();
        },

        _filterProductDetailRows: function (aRows) {
            return (aRows || []).filter(function (oRow) {
                return this._rowsHaveAnyNumber([oRow], [
                    "sales",
                    "cogs",
                    "grossProfit",
                    "allocatedSga",
                    "operatingProfit"
                ]);
            }.bind(this));
        },

        _filterProductProfitRows: function (aRows) {
            return (aRows || []).filter(function (oRow) {
                return this._isFiniteNumber(oRow && oRow.sales) && Number(oRow.sales) !== 0;
            }.bind(this));
        },

        _buildProductDataMessage: function (aProductRows, aProfitRows, aSourceRows) {
            if (aProfitRows && aProfitRows.length) {
                return "";
            }

            if (aProductRows && aProductRows.length) {
                return "조회 조건에 매출원가 데이터는 있으나 판매매출이 없어 TOP/이익률 차트는 표시하지 않습니다. 원가 데이터는 상세와 KPI에 표시됩니다.";
            }

            if (aSourceRows && aSourceRows.length) {
                return "조회 조건에 표시할 제품/옵션 판매 수익성 금액 데이터가 없습니다.";
            }

            return "조회 조건에 해당하는 제품/옵션 판매 수익성 데이터가 없습니다.";
        },

        _buildProductProfitReferenceLine: function () {
            var aTopRows = this._oViewModel ? this._oViewModel.getProperty("/topRows") || [] : [];
            var aProductRows = this._oViewModel ? this._oViewModel.getProperty("/productRows") || [] : [];
            var fnOperatingProfitValues = function (aRows) {
                return (aRows || []).map(function (oRow) {
                    return this._isFiniteNumber(oRow.operatingProfit) ? Number(oRow.operatingProfit) : null;
                }.bind(this)).filter(function (vValue) {
                    return vValue !== null;
                });
            }.bind(this);
            var fnAverage = function (aValues) {
                return aValues.reduce(function (fTotal, fValue) {
                    return fTotal + fValue;
                }, 0) / aValues.length;
            };
            var aValues = fnOperatingProfitValues(aTopRows);
            var aAllValues = fnOperatingProfitValues(aProductRows);

            if (!aValues.length) {
                return {
                    line: {
                        valueAxis: []
                    }
                };
            }

            var fAverage = fnAverage(aValues);
            var aTopThree = aValues.slice(0, Math.min(3, aValues.length));
            var fTopAverage = fnAverage(aTopThree);
            var aLines = [];

            if (aAllValues.length) {
                aLines.push({
                    value: fnAverage(aAllValues),
                    visible: true,
                    color: "#64748B",
                    label: {
                        text: "전체 평균",
                        visible: true,
                        background: "#64748B"
                    }
                });
            }

            aLines.push({
                value: fAverage,
                visible: true,
                color: "#0A6ED1",
                label: {
                    text: "TOP10 평균",
                    visible: true,
                    background: "#0A6ED1"
                }
            });

            if (aValues.length > 2 && Math.abs(fTopAverage - fAverage) > 1) {
                aLines.push({
                    value: fTopAverage,
                    visible: true,
                    color: "#107E3E",
                    label: {
                        text: "상위 3 평균",
                        visible: true,
                        background: "#107E3E"
                    }
                });
            }

            return {
                line: {
                    valueAxis: aLines
                }
            };
        },

        onProductMarginChartSelect: function (oEvent) {
            var oChart = this.byId && this.byId("productMarginChart");
            var aSelectedData = oEvent && oEvent.getParameter("data");

            if (this._bApplyingProductMarginSelection || !oChart || !oChart.vizSelection || !aSelectedData || !aSelectedData.length) {
                return;
            }

            this._bApplyingProductMarginSelection = true;
            try {
                oChart.vizSelection(aSelectedData, {
                    clearSelection: true
                });
            } finally {
                this._bApplyingProductMarginSelection = false;
            }
        },

        onProductMarginChartDeselect: function () {
            var oChart = this.byId && this.byId("productMarginChart");

            if (this._bApplyingProductMarginSelection || !oChart || !oChart.vizSelection) {
                return;
            }

            this._bApplyingProductMarginSelection = true;
            try {
                oChart.vizSelection([], {
                    clearSelection: true
                });
            } finally {
                this._bApplyingProductMarginSelection = false;
            }
        },

        _refreshProductProfitChartReferenceLines: function () {
            var oChart = this.byId && this.byId("productProfitChart");

            if (!oChart || !oChart.setVizProperties) {
                return;
            }

            oChart.setVizProperties({
                plotArea: {
                    referenceLine: this._buildProductProfitReferenceLine()
                }
            });
        },

        _applyRentalData: function (aRows) {
            var aRentalRows = this._mapRentalRows(aRows);
            var oKpi = this._calculateRentalKpi(aRentalRows);
            var aRentalProductRows = this._buildRentalProductRows(aRentalRows);

            this._oViewModel.setProperty("/rentalRows", aRentalRows);
            this._oViewModel.setProperty("/rentalProductRows", aRentalProductRows);
            this._oViewModel.setProperty("/rentalKpi", oKpi);
            this._oViewModel.setProperty("/rentalMonthlyChart", this._buildRentalMonthlyChart(aRentalRows));
            this._oViewModel.setProperty("/rentalCostChart", this._buildRentalCostChart(oKpi));
            this._oViewModel.setProperty("/rentalSummaryChart", this._buildRentalSummaryChart(oKpi));
            this._oViewModel.setProperty("/rentalCostBreakdown", this._buildRentalCostBreakdown(oKpi));
            this._oViewModel.setProperty("/rentalProfitTreemap", this._buildRentalProfitTreemap(oKpi));
            this._oViewModel.setProperty("/rentalOrgChart", this._buildRentalOrgChart(aRentalRows));
            this._oViewModel.setProperty("/rentalProductChart", []);
            this._oViewModel.setProperty("/rentalValueHelp", {
                segments: [],
                profitCenters: [],
                functionalAreas: []
            });
            this._oViewModel.setProperty("/hasRentalData", aRentalRows.length > 0);
            this._oViewModel.setProperty("/hasRentalProductData", aRentalProductRows.length > 0);
            this._oViewModel.setProperty("/rentalMessage", aRentalRows.length ? "" : "조회 조건에 해당하는 렌탈 수익성 데이터가 없습니다.");
        },

        _mapRentalRows: function (aRows) {
            return (aRows || []).map(function (oRow) {
                var oMapped = this._decorateOrgText(this._decorateRentalProductText(oRow));

                oMapped.rentalRevenue = this._toNumber(this._readField(oRow, "rental_revenue_amt"));
                oMapped.rentalDepr = this._toNumber(this._readField(oRow, "rental_depr_amt"));
                oMapped.rentalService = this._toNumber(this._readField(oRow, "rental_service_amt"));
                oMapped.rentalContract = this._toNumber(this._readField(oRow, "rental_contract_amt"));
                oMapped.rentalCommon = this._toNumber(this._readField(oRow, "rental_common_amt"));
                oMapped.rentalRepairCost = this._toNumber(this._readField(oRow, "rental_repair_cost_amt"));
                oMapped.rentalOrgSga = this._toNumber(this._readField(oRow, "rental_org_sga_amt"));
                oMapped.rentalRecoveryLogi = this._toNumber(this._readField(oRow, "rental_recovery_logi_amt"));
                oMapped.commonAdminPool = this._toNumber(this._readField(oRow, "common_admin_pool_amt"));
                oMapped.commonAdminSalesAlloc = this._toNumber(this._readField(oRow, "common_admin_sales_alloc_amt"));
                oMapped.commonAdminRentalAlloc = this._toNumber(this._readField(oRow, "common_admin_rental_alloc_amt"));
                oMapped.rentalTotalCost = this._toNumber(this._readField(oRow, "rental_total_cost_amt"));
                oMapped.rentalOperatingProfit = this._toNumber(this._readField(oRow, "rental_operating_profit_amt"));
                oMapped.rentalOperatingProfitRate = this._toNumber(this._readField(oRow, "rental_operating_profit_rate"));
                oMapped.salesRevenue = this._toNumber(this._readField(oRow, "sales_revenue_amt"));
                oMapped.totalRevenue = this._toNumber(this._readField(oRow, "total_revenue_amt"));
                oMapped.salesCommonAllocRate = this._toNumber(this._readField(oRow, "sales_common_alloc_rate"));
                oMapped.waers = this._readField(oRow, "waers");
                oMapped.profitState = formatter.stateByAmount(oMapped.rentalOperatingProfit);
                oMapped.rateState = formatter.stateByRate(oMapped.rentalOperatingProfitRate);
                oMapped.monthText = oMapped.monat ? Number(oMapped.monat) + "월" : "";
                oMapped.rentalOrgDisplay = [oMapped.segmentDisplay, oMapped.prctrDisplay, oMapped.fkberDisplay]
                    .filter(function (sValue) {
                        return sValue && sValue !== "-";
                    })
                    .join(" / ") || "-";

                return oMapped;
            }.bind(this)).sort(function (oLeft, oRight) {
                return String(oLeft.monat || "").localeCompare(String(oRight.monat || "")) ||
                    String(oLeft.segmentDisplay || "").localeCompare(String(oRight.segmentDisplay || "")) ||
                    String(oLeft.prctrDisplay || "").localeCompare(String(oRight.prctrDisplay || "")) ||
                    String(oLeft.fkberDisplay || "").localeCompare(String(oRight.fkberDisplay || "")) ||
                    String(oLeft.productKey || "").localeCompare(String(oRight.productKey || ""));
            });
        },

        _calculateRentalKpi: function (aRows) {
            var oKpi = this._emptyRentalKpi();

            oKpi.rentalRevenue = this._sum(aRows, "rentalRevenue");
            oKpi.rentalDepr = this._sum(aRows, "rentalDepr");
            oKpi.rentalService = this._sum(aRows, "rentalService");
            oKpi.rentalContract = this._sum(aRows, "rentalContract");
            oKpi.rentalCommon = this._sum(aRows, "rentalCommon");
            oKpi.rentalRepairCost = this._sum(aRows, "rentalRepairCost");
            oKpi.rentalOrgSga = this._sum(aRows, "rentalOrgSga");
            oKpi.rentalRecoveryLogi = this._sum(aRows, "rentalRecoveryLogi");
            oKpi.commonAdminPool = this._sum(aRows, "commonAdminPool");
            oKpi.commonAdminSalesAlloc = this._sum(aRows, "commonAdminSalesAlloc");
            oKpi.commonAdminRentalAlloc = this._sum(aRows, "commonAdminRentalAlloc");
            oKpi.rentalTotalCost = this._sum(aRows, "rentalTotalCost");
            oKpi.rentalOperatingProfit = this._sum(aRows, "rentalOperatingProfit");
            oKpi.salesRevenue = this._sum(aRows, "salesRevenue");
            oKpi.totalRevenue = this._sum(aRows, "totalRevenue");
            oKpi.salesCommonAllocRate = this._firstNumber(aRows, "salesCommonAllocRate");
            oKpi.currency = this._firstText(aRows, "waers");

            if (!this._isFiniteNumber(oKpi.rentalTotalCost) && this._rowsHaveAnyNumber([oKpi], [
                    "rentalDepr",
                    "rentalService",
                    "rentalContract",
                    "rentalCommon",
                    "rentalRepairCost",
                    "rentalOrgSga",
                    "rentalRecoveryLogi",
                    "commonAdminRentalAlloc"
                ])) {
                oKpi.rentalTotalCost = this._sum([{
                    total: this._safeNumber(oKpi.rentalDepr) +
                        this._safeNumber(oKpi.rentalService) +
                        this._safeNumber(oKpi.rentalContract) +
                        this._safeNumber(oKpi.rentalCommon) +
                        this._safeNumber(oKpi.rentalRepairCost) +
                        this._safeNumber(oKpi.rentalOrgSga) +
                        this._safeNumber(oKpi.rentalRecoveryLogi) +
                        this._safeNumber(oKpi.commonAdminRentalAlloc)
                }], "total");
            }
            if (this._isFiniteNumber(oKpi.rentalTotalCost) && this._isFiniteNumber(oKpi.commonAdminRentalAlloc)) {
                oKpi.rentalDirectCost = Number(oKpi.rentalTotalCost) - Number(oKpi.commonAdminRentalAlloc);
            } else if (this._rowsHaveAnyNumber([oKpi], [
                    "rentalDepr",
                    "rentalService",
                    "rentalContract",
                    "rentalCommon",
                    "rentalRepairCost",
                    "rentalOrgSga",
                    "rentalRecoveryLogi"
                ])) {
                oKpi.rentalDirectCost = this._sum([{
                    total: this._safeNumber(oKpi.rentalDepr) +
                        this._safeNumber(oKpi.rentalService) +
                        this._safeNumber(oKpi.rentalContract) +
                        this._safeNumber(oKpi.rentalCommon) +
                        this._safeNumber(oKpi.rentalRepairCost) +
                        this._safeNumber(oKpi.rentalOrgSga) +
                        this._safeNumber(oKpi.rentalRecoveryLogi)
                }], "total");
            }
            if (!this._isFiniteNumber(oKpi.rentalOperatingProfit) &&
                this._isFiniteNumber(oKpi.rentalRevenue) &&
                this._isFiniteNumber(oKpi.rentalTotalCost)) {
                oKpi.rentalOperatingProfit = Number(oKpi.rentalRevenue) - Number(oKpi.rentalTotalCost);
            }
            if (this._isFiniteNumber(oKpi.rentalRevenue) && Number(oKpi.rentalRevenue) !== 0) {
                if (this._isFiniteNumber(oKpi.rentalOperatingProfit)) {
                    oKpi.rentalOperatingProfitRate = Number(oKpi.rentalOperatingProfit) / Number(oKpi.rentalRevenue);
                }
                if (this._isFiniteNumber(oKpi.rentalTotalCost)) {
                    oKpi.rentalCostRate = Number(oKpi.rentalTotalCost) / Number(oKpi.rentalRevenue);
                }
            }
            if (this._isFiniteNumber(oKpi.rentalTotalCost) && Number(oKpi.rentalTotalCost) !== 0 &&
                    this._isFiniteNumber(oKpi.commonAdminRentalAlloc)) {
                oKpi.rentalAdminCostRate = Number(oKpi.commonAdminRentalAlloc) / Number(oKpi.rentalTotalCost);
            }

            return oKpi;
        },

        _applyCockpitRentalSummary: function (sRentalMessage) {
            var oKpi = Object.assign({}, this._oViewModel.getProperty("/kpi") || {});
            var oRentalKpi = this._oViewModel.getProperty("/rentalKpi") || this._emptyRentalKpi();
            var fSalesRevenue = this._isFiniteNumber(oKpi.salesRevenue) ? Number(oKpi.salesRevenue) : oKpi.sales;

            oKpi.salesRevenue = this._isFiniteNumber(fSalesRevenue) ? Number(fSalesRevenue) : null;
            if (!this._isFiniteNumber(oKpi.salesRevenue) && this._isFiniteNumber(oRentalKpi.salesRevenue)) {
                oKpi.salesRevenue = Number(oRentalKpi.salesRevenue);
            }
            oKpi.rentalRevenue = oRentalKpi.rentalRevenue;
            oKpi.rentalDepr = oRentalKpi.rentalDepr;
            oKpi.rentalService = oRentalKpi.rentalService;
            oKpi.rentalContract = oRentalKpi.rentalContract;
            oKpi.rentalCommon = oRentalKpi.rentalCommon;
            oKpi.rentalRepairCost = oRentalKpi.rentalRepairCost;
            oKpi.rentalOrgSga = oRentalKpi.rentalOrgSga;
            oKpi.rentalRecoveryLogi = oRentalKpi.rentalRecoveryLogi;
            oKpi.commonAdminPool = this._isFiniteNumber(oKpi.commonAdminPool) ? oKpi.commonAdminPool : oRentalKpi.commonAdminPool;
            oKpi.commonAdminSalesAlloc = this._isFiniteNumber(oKpi.commonAdminSalesAlloc) ? oKpi.commonAdminSalesAlloc : oRentalKpi.commonAdminSalesAlloc;
            oKpi.commonAdminRentalAlloc = oRentalKpi.commonAdminRentalAlloc;
            oKpi.rentalTotalCost = oRentalKpi.rentalTotalCost;
            oKpi.rentalOperatingProfit = oRentalKpi.rentalOperatingProfit;
            oKpi.rentalOperatingProfitRate = oRentalKpi.rentalOperatingProfitRate;
            oKpi.totalRevenue = this._sum([{
                amount: oKpi.salesRevenue
            }, {
                amount: oKpi.rentalRevenue
            }], "amount");
            if (!this._isFiniteNumber(oKpi.totalRevenue) && this._isFiniteNumber(oRentalKpi.totalRevenue)) {
                oKpi.totalRevenue = Number(oRentalKpi.totalRevenue);
            }
            oKpi.totalOperatingProfit = this._sum([{
                amount: oKpi.operatingProfit
            }, {
                amount: oKpi.rentalOperatingProfit
            }], "amount");
            oKpi.currency = oKpi.currency || oRentalKpi.currency;

            if (this._isFiniteNumber(oKpi.totalRevenue) && Number(oKpi.totalRevenue) !== 0) {
                oKpi.salesCommonAllocRate = this._isFiniteNumber(oKpi.salesRevenue) ? Number(oKpi.salesRevenue) / Number(oKpi.totalRevenue) : null;
                oKpi.rentalRevenueRate = this._isFiniteNumber(oKpi.rentalRevenue) ? Number(oKpi.rentalRevenue) / Number(oKpi.totalRevenue) : null;
                oKpi.totalOperatingProfitRate = this._isFiniteNumber(oKpi.totalOperatingProfit) ? Number(oKpi.totalOperatingProfit) / Number(oKpi.totalRevenue) : null;
            }

            this._oViewModel.setProperty("/kpi", oKpi);
            this._oViewModel.setProperty("/segmentShareChart", this._buildRevenueShareChart(oKpi));
            this._oViewModel.setProperty("/segmentShareMessage", this._buildRevenueShareChart(oKpi).length ? "" : "전체 사업부문 수익 데이터가 없습니다.");
            this._oViewModel.setProperty("/rentalSummaryChart", this._buildRentalSummaryChart(oKpi));
            this._oViewModel.setProperty("/overallStructureChart", this._buildOverallStructureChart(oKpi));
            this._oViewModel.setProperty("/summaryMessage", sRentalMessage || "");
            if (sRentalMessage) {
                this._oViewModel.setProperty("/rentalMessage", sRentalMessage);
            }
        },

        _calculateProductKpi: function (aRows, aSummaryRows) {
            var oKpi = this._emptyProductKpi();
            var oSummary = (aRows || []).length ? this._findProductSummaryRow(aSummaryRows || aRows) : {};

            oKpi.sales = this._sum(aRows, "sales");
            oKpi.cogs = this._sum(aRows, "cogs");
            oKpi.grossProfit = this._sum(aRows, "grossProfit");
            oKpi.operatingProfit = this._sum(aRows, "operatingProfit");
            oKpi.variance = this._sum(aRows, "variance");
            oKpi.salesDirectSga = this._summaryNumber(oSummary, "salesDirectSga");
            oKpi.commonAdminPool = this._summaryNumber(oSummary, "commonAdminPool");
            oKpi.commonAdminSalesAlloc = this._summaryNumber(oSummary, "commonAdminSalesAlloc");
            oKpi.salesCommonAllocRate = this._summaryNumber(oSummary, "salesCommonAllocRate");
            oKpi.sgaPool = this._summaryNumber(oSummary, "sgaPool");
            oKpi.salesRevenue = this._summaryNumber(oSummary, "salesRevenue");
            oKpi.rentalRevenue = this._summaryNumber(oSummary, "rentalRevenue");
            oKpi.totalRevenue = this._summaryNumber(oSummary, "totalRevenue");
            oKpi.totalSalesBase = this._summaryNumber(oSummary, "totalSalesBase");
            oKpi.summaryFieldState = {
                salesRevenue: this._isFiniteNumber(oSummary && oSummary.salesRevenue),
                rentalRevenue: this._isFiniteNumber(oSummary && oSummary.rentalRevenue),
                totalRevenue: this._isFiniteNumber(oSummary && oSummary.totalRevenue),
                salesCommonAllocRate: this._isFiniteNumber(oSummary && oSummary.salesCommonAllocRate),
                commonAdminPool: this._isFiniteNumber(oSummary && oSummary.commonAdminPool),
                commonAdminSalesAlloc: this._isFiniteNumber(oSummary && oSummary.commonAdminSalesAlloc),
                sgaPool: this._isFiniteNumber(oSummary && oSummary.sgaPool)
            };
            if (!this._isFiniteNumber(oKpi.totalRevenue) &&
                this._isFiniteNumber(oKpi.salesRevenue) &&
                this._isFiniteNumber(oKpi.rentalRevenue)) {
                oKpi.totalRevenue = Number(oKpi.salesRevenue) + Number(oKpi.rentalRevenue);
            }
            if (this._isFiniteNumber(oKpi.commonAdminPool) && this._isFiniteNumber(oKpi.commonAdminSalesAlloc)) {
                oKpi.commonAdminRentalAlloc = Number(oKpi.commonAdminPool) - Number(oKpi.commonAdminSalesAlloc);
            }
            oKpi.allocatedSga = this._sum(aRows, "allocatedSga");
            oKpi.salesCost = this._sum([{
                amount: oKpi.cogs
            }, {
                amount: oKpi.allocatedSga
            }], "amount");
            oKpi.sgaAllocationRate = this._isFiniteNumber(oKpi.totalSalesBase) && oKpi.totalSalesBase !== 0 &&
                this._isFiniteNumber(oKpi.sales) ? oKpi.sales / oKpi.totalSalesBase : null;
            oKpi.allocationNote = this._firstText(aRows, "allocationNote");
            oKpi.currency = this._firstText(aRows, "waers");

            if (this._isFiniteNumber(oKpi.sales) && oKpi.sales !== 0) {
                oKpi.grossProfitRate = this._isFiniteNumber(oKpi.grossProfit) ? oKpi.grossProfit / oKpi.sales : null;
                oKpi.operatingProfitRate = this._isFiniteNumber(oKpi.operatingProfit) ? oKpi.operatingProfit / oKpi.sales : null;
            }
            if (!this._isFiniteNumber(oKpi.salesCommonAllocRate) &&
                this._isFiniteNumber(oKpi.salesRevenue) &&
                this._isFiniteNumber(oKpi.rentalRevenue) &&
                this._isFiniteNumber(oKpi.totalRevenue) &&
                Number(oKpi.totalRevenue) !== 0) {
                oKpi.salesCommonAllocRate = Number(oKpi.salesRevenue) / Number(oKpi.totalRevenue);
            }
            if (!oKpi.summaryFieldState.rentalRevenue) {
                oKpi.salesCommonAllocRate = null;
            }
            if (this._isFiniteNumber(oKpi.salesCommonAllocRate) && this._isFiniteNumber(oKpi.rentalRevenue)) {
                oKpi.rentalRevenueRate = 1 - oKpi.salesCommonAllocRate;
            }

            return oKpi;
        },

        _applyRentalDepreciationResult: function (oKpi, oRentalDepreciation) {
            var sInfoText = this._defaultRentalSummaryInfoText();

            if (oRentalDepreciation) {
                if (this._isFiniteNumber(oRentalDepreciation.amount)) {
                    oKpi.rentalDepreciation = Number(oRentalDepreciation.amount);
                }
                if (oRentalDepreciation.message) {
                    sInfoText = oRentalDepreciation.message;
                }
                oKpi.rentalDepreciationSource = oRentalDepreciation.source || "";
                oKpi.rentalDepreciationEntitySet = oRentalDepreciation.entitySet || "";
                oKpi.rentalDepreciationFilterText = oRentalDepreciation.filterText || "";
            }

            this._oViewModel.setProperty("/rentalSummaryInfoText", sInfoText);
        },

        _buildMonthlyChart: function (oKpi) {
            var oFilters = this._oViewModel.getProperty("/filters");

            if (!this._isFiniteNumber(oKpi.sales) && !this._isFiniteNumber(oKpi.operatingProfit)) {
                return [];
            }

            return [{
                monthText: Number(oFilters.month) + "월",
                structureText: "손익",
                sales: oKpi.sales,
                cogs: oKpi.cogs,
                grossProfit: oKpi.grossProfit,
                allocatedSga: this._isFiniteNumber(oKpi.allocatedSga) ? -Math.abs(oKpi.allocatedSga) : null,
                salesDirectSga: this._isFiniteNumber(oKpi.salesDirectSga) ? -Math.abs(oKpi.salesDirectSga) : null,
                commonAdminSalesAlloc: this._isFiniteNumber(oKpi.commonAdminSalesAlloc) ? -Math.abs(oKpi.commonAdminSalesAlloc) : null,
                operatingProfit: oKpi.operatingProfit
            }];
        },

        _buildStructureChart: function (oKpi) {
            if (!this._isFiniteNumber(oKpi.sales) && !this._isFiniteNumber(oKpi.operatingProfit)) {
                return [];
            }

            return [{
                item: "판매매출",
                amount: this._chartPositiveAmount(oKpi.sales)
            }, {
                item: "판매매출원가",
                amount: this._chartPositiveAmount(oKpi.cogs)
            }, {
                item: "판매총이익",
                amount: this._chartPositiveAmount(oKpi.grossProfit)
            }, {
                item: "제품별 배부 판관비",
                amount: this._chartPositiveAmount(oKpi.allocatedSga)
            }, {
                item: "판매기준 영업이익",
                amount: this._chartPositiveAmount(oKpi.operatingProfit)
            }];
        },

        _chartPositiveAmount: function (vValue) {
            return this._isFiniteNumber(vValue) ? Math.abs(Number(vValue)) : null;
        },

        _buildAdminAllocationChart: function (oKpi) {
            return [{
                item: "공통관리비",
                amount: oKpi.commonAdminPool
            }, {
                item: "판매 배부액",
                amount: oKpi.commonAdminSalesAlloc
            }, {
                item: "렌탈 배부액",
                amount: oKpi.commonAdminRentalAlloc
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildRentalSummaryChart: function (oKpi) {
            return [{
                item: "렌탈수익",
                amount: this._chartPositiveAmount(oKpi.rentalRevenue)
            }, {
                item: "직접 렌탈비용",
                amount: this._chartPositiveAmount(oKpi.rentalDirectCost)
            }, {
                item: "공통관리비 배부액",
                amount: this._chartPositiveAmount(oKpi.commonAdminRentalAlloc)
            }, {
                item: "렌탈 총비용",
                amount: this._chartPositiveAmount(oKpi.rentalTotalCost)
            }, {
                item: "렌탈 영업이익",
                amount: this._chartPositiveAmount(oKpi.rentalOperatingProfit)
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildRentalCostBreakdown: function (oKpi) {
            return [{
                item: "감가상각비",
                amount: oKpi.rentalDepr
            }, {
                item: "렌탈 서비스비",
                amount: oKpi.rentalService
            }, {
                item: "렌탈 계약/영업비",
                amount: oKpi.rentalContract
            }, {
                item: "렌탈 공통비",
                amount: oKpi.rentalCommon
            }, {
                item: "렌탈 수선비",
                amount: oKpi.rentalRepairCost
            }, {
                item: "렌탈 조직 판관비",
                amount: oKpi.rentalOrgSga
            }, {
                item: "회수물류 귀속 비용",
                amount: oKpi.rentalRecoveryLogi
            }, {
                item: "공통관리비 렌탈 배부액",
                amount: oKpi.commonAdminRentalAlloc
            }].map(function (oRow) {
                return {
                    item: oRow.item,
                    amount: oRow.amount,
                    share: this._isFiniteNumber(oRow.amount) &&
                        this._isFiniteNumber(oKpi.rentalTotalCost) &&
                        Number(oKpi.rentalTotalCost) !== 0 ?
                        Number(oRow.amount) / Number(oKpi.rentalTotalCost) : null
                };
            }.bind(this)).filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildRentalProfitTreemap: function (oKpi) {
            var fRevenue = this._chartPositiveAmount(oKpi.rentalRevenue);
            var aRows = [];
            var fnTruncatePercent = function (fValue) {
                if (!this._isFiniteNumber(fValue)) {
                    return null;
                }
                return Math.trunc(Number(fValue) * 100) / 100;
            }.bind(this);
            var fnAdd = function (sGroup, sItem, vAmount, sTone) {
                var fAmount = this._chartPositiveAmount(vAmount);
                var fSharePercent = this._isFiniteNumber(fRevenue) && Number(fRevenue) !== 0 ?
                    fAmount / Number(fRevenue) * 100 : null;

                if (!this._isFiniteNumber(fAmount) || Number(fAmount) <= 0) {
                    return;
                }

                aRows.push({
                    componentGroup: sGroup,
                    componentItem: sItem,
                    amount: fAmount,
                    share: this._isFiniteNumber(fRevenue) && Number(fRevenue) !== 0 ? fAmount / Number(fRevenue) : null,
                    sharePercent: fnTruncatePercent(fSharePercent),
                    tone: sTone
                });
            }.bind(this);
            var fDisplayed;
            var fResidual;

            if (!this._isFiniteNumber(fRevenue) || Number(fRevenue) <= 0) {
                return [];
            }

            fnAdd("렌탈 비용", "감가상각비", oKpi.rentalDepr, "cost");
            fnAdd("렌탈 비용", "렌탈 서비스비", oKpi.rentalService, "cost");
            fnAdd("렌탈 비용", "렌탈 계약/영업비", oKpi.rentalContract, "cost");
            fnAdd("렌탈 비용", "렌탈 공통비", oKpi.rentalCommon, "cost");
            fnAdd("렌탈 비용", "렌탈 수선비", oKpi.rentalRepairCost, "cost");
            fnAdd("렌탈 비용", "렌탈 조직 판관비", oKpi.rentalOrgSga, "cost");
            fnAdd("렌탈 비용", "회수물류 귀속 비용", oKpi.rentalRecoveryLogi, "cost");
            fnAdd("렌탈 비용", "공통관리비 렌탈 배부액", oKpi.commonAdminRentalAlloc, "cost");

            if (this._isFiniteNumber(oKpi.rentalOperatingProfit)) {
                if (Number(oKpi.rentalOperatingProfit) >= 0) {
                    fnAdd("렌탈 영업이익", "렌탈 영업이익", oKpi.rentalOperatingProfit, "profit");
                } else {
                    fnAdd("렌탈 초과비용", "렌탈 영업손실", Math.abs(Number(oKpi.rentalOperatingProfit)), "loss");
                }
            }

            fDisplayed = aRows.reduce(function (fTotal, oRow) {
                return fTotal + Number(oRow.amount || 0);
            }, 0);
            fResidual = Number(fRevenue) - fDisplayed;

            if (fResidual > 1) {
                fnAdd("렌탈 매출 잔여", "미분류 매출", fResidual, "residual");
            }

            return aRows;
        },

        _buildRentalMonthlyChart: function (aRows) {
            var mByMonth = {};

            (aRows || []).forEach(function (oRow) {
                var sMonth = oRow.monat || "";

                if (!mByMonth[sMonth]) {
                    mByMonth[sMonth] = {
                        monthText: sMonth ? Number(sMonth) + "월" : "",
                        rentalRevenue: null,
                        rentalTotalCost: null,
                        rentalOperatingProfit: null
                    };
                }

                mByMonth[sMonth].rentalRevenue = this._addNullable(mByMonth[sMonth].rentalRevenue, oRow.rentalRevenue);
                mByMonth[sMonth].rentalTotalCost = this._addNullable(mByMonth[sMonth].rentalTotalCost, oRow.rentalTotalCost);
                mByMonth[sMonth].rentalOperatingProfit = this._addNullable(mByMonth[sMonth].rentalOperatingProfit, oRow.rentalOperatingProfit);
            }.bind(this));

            return Object.keys(mByMonth).sort().map(function (sMonth) {
                return mByMonth[sMonth];
            });
        },

        _buildRentalCostChart: function (oKpi) {
            return [{
                item: "감가상각비",
                amount: this._chartPositiveAmount(oKpi.rentalDepr)
            }, {
                item: "렌탈 서비스비",
                amount: this._chartPositiveAmount(oKpi.rentalService)
            }, {
                item: "렌탈 계약/영업비",
                amount: this._chartPositiveAmount(oKpi.rentalContract)
            }, {
                item: "렌탈 공통비",
                amount: this._chartPositiveAmount(oKpi.rentalCommon)
            }, {
                item: "렌탈 수선비",
                amount: this._chartPositiveAmount(oKpi.rentalRepairCost)
            }, {
                item: "렌탈 조직 판관비",
                amount: this._chartPositiveAmount(oKpi.rentalOrgSga)
            }, {
                item: "회수물류 귀속 비용",
                amount: this._chartPositiveAmount(oKpi.rentalRecoveryLogi)
            }, {
                item: "공통관리비 렌탈 배부액",
                amount: this._chartPositiveAmount(oKpi.commonAdminRentalAlloc)
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildRentalOrgChart: function (aRows) {
            var mByOrg = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = oRow.rentalOrgDisplay || "-";

                if (!this._isFiniteNumber(oRow.rentalOperatingProfit)) {
                    return;
                }

                if (!mByOrg[sKey]) {
                    mByOrg[sKey] = {
                        org: sKey,
                        rentalOperatingProfit: null,
                        waers: oRow.waers || ""
                    };
                }

                mByOrg[sKey].rentalOperatingProfit = this._addNullable(
                    mByOrg[sKey].rentalOperatingProfit,
                    oRow.rentalOperatingProfit
                );
            }.bind(this));

            return Object.keys(mByOrg).map(function (sKey) {
                return mByOrg[sKey];
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.rentalOperatingProfit) - this._sortNumber(oLeft.rentalOperatingProfit) ||
                    String(oLeft.org || "").localeCompare(String(oRight.org || ""));
            }.bind(this)).slice(0, 10);
        },

        _buildRentalProductChart: function (aRows) {
            var mByProduct = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = oRow.productKey || "";

                if (!sKey || !this._isFiniteNumber(oRow.rentalOperatingProfit)) {
                    return;
                }

                if (!mByProduct[sKey]) {
                    mByProduct[sKey] = {
                        product: sKey,
                        rentalOperatingProfit: null,
                        waers: oRow.waers || ""
                    };
                }

                mByProduct[sKey].rentalOperatingProfit = this._addNullable(
                    mByProduct[sKey].rentalOperatingProfit,
                    oRow.rentalOperatingProfit
                );
            }.bind(this));

            return Object.keys(mByProduct).map(function (sKey) {
                return mByProduct[sKey];
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.rentalOperatingProfit) - this._sortNumber(oLeft.rentalOperatingProfit) ||
                    String(oLeft.product || "").localeCompare(String(oRight.product || ""));
            }.bind(this)).slice(0, 10);
        },

        _buildRentalProductRows: function (aRows) {
            var mByProduct = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = this._cleanText(oRow.productKey);

                if (!sKey) {
                    return;
                }

                if (!mByProduct[sKey]) {
                    mByProduct[sKey] = {
                        productDisplay: oRow.productDisplay || oRow.matnr || "-",
                        optionDisplay: oRow.optionDisplay || oRow.mtopt || "-",
                        rentalRevenue: null,
                        rentalTotalCost: null,
                        rentalOperatingProfit: null,
                        rentalOperatingProfitRate: null,
                        waers: oRow.waers || ""
                    };
                }

                mByProduct[sKey].rentalRevenue = this._addNullable(mByProduct[sKey].rentalRevenue, oRow.rentalRevenue);
                mByProduct[sKey].rentalTotalCost = this._addNullable(mByProduct[sKey].rentalTotalCost, oRow.rentalTotalCost);
                mByProduct[sKey].rentalOperatingProfit = this._addNullable(mByProduct[sKey].rentalOperatingProfit, oRow.rentalOperatingProfit);
                if (!mByProduct[sKey].waers && oRow.waers) {
                    mByProduct[sKey].waers = oRow.waers;
                }
            }.bind(this));

            return Object.keys(mByProduct).map(function (sKey) {
                var oProduct = mByProduct[sKey];

                if (this._isFiniteNumber(oProduct.rentalRevenue) && Number(oProduct.rentalRevenue) !== 0 &&
                        this._isFiniteNumber(oProduct.rentalOperatingProfit)) {
                    oProduct.rentalOperatingProfitRate = Number(oProduct.rentalOperatingProfit) / Number(oProduct.rentalRevenue);
                }

                return oProduct;
            }.bind(this)).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.rentalOperatingProfit) - this._sortNumber(oLeft.rentalOperatingProfit) ||
                    String(oLeft.productDisplay || "").localeCompare(String(oRight.productDisplay || ""));
            }.bind(this));
        },

        _buildOverallStructureChart: function (oKpi) {
            return [{
                item: "판매매출",
                amount: this._chartPositiveAmount(oKpi.salesRevenue)
            }, {
                item: "판매 총비용",
                amount: this._chartPositiveAmount(oKpi.salesCost)
            }, {
                item: "판매기준 영업이익",
                amount: this._chartPositiveAmount(oKpi.operatingProfit)
            }, {
                item: "렌탈수익",
                amount: this._chartPositiveAmount(oKpi.rentalRevenue)
            }, {
                item: "렌탈 총비용",
                amount: this._chartPositiveAmount(oKpi.rentalTotalCost)
            }, {
                item: "렌탈 기준 영업이익",
                amount: this._chartPositiveAmount(oKpi.rentalOperatingProfit)
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildSalesSummaryChart: function (oKpi) {
            return [{
                item: "판매매출",
                amount: oKpi.sales
            }, {
                item: "판매매출원가",
                amount: this._isFiniteNumber(oKpi.cogs) ? -Math.abs(oKpi.cogs) : null
            }, {
                item: "판매총이익",
                amount: oKpi.grossProfit
            }, {
                item: "판매기준 판관비 합계",
                amount: this._isFiniteNumber(oKpi.sgaPool) ? -Math.abs(oKpi.sgaPool) : null
            }, {
                item: "판매기준 영업이익",
                amount: oKpi.operatingProfit
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _buildMarginChart: function (aRows) {
            var mGroups = {};

            (aRows || []).forEach(function (oRow) {
                var sGroup = oRow.materialGroupDisplay || "-";

                if (!mGroups[sGroup]) {
                    mGroups[sGroup] = {
                        productKey: sGroup,
                        sales: 0,
                        grossProfit: 0,
                        operatingProfit: 0
                    };
                }

                mGroups[sGroup].sales += this._isFiniteNumber(oRow.sales) ? Number(oRow.sales) : 0;
                mGroups[sGroup].grossProfit += this._isFiniteNumber(oRow.grossProfit) ? Number(oRow.grossProfit) : 0;
                mGroups[sGroup].operatingProfit += this._isFiniteNumber(oRow.operatingProfit) ? Number(oRow.operatingProfit) : 0;
            }.bind(this));

            return Object.keys(mGroups).map(function (sGroup) {
                var oGroup = mGroups[sGroup];
                var bHasSales = this._isFiniteNumber(oGroup.sales) && oGroup.sales !== 0;

                return {
                    productKey: oGroup.productKey,
                    sales: oGroup.sales,
                    grossProfitRate: bHasSales ? oGroup.grossProfit / oGroup.sales * 100 : null,
                    operatingProfitRate: bHasSales ? oGroup.operatingProfit / oGroup.sales * 100 : null
                };
            }.bind(this)).filter(function (oGroup) {
                return this._isFiniteNumber(oGroup.grossProfitRate) || this._isFiniteNumber(oGroup.operatingProfitRate);
            }.bind(this)).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.sales) - this._sortNumber(oLeft.sales) ||
                    String(oLeft.productKey || "").localeCompare(String(oRight.productKey || ""));
            }.bind(this)).slice(0, 12);
        },

        _applyRevenueShareData: function (oKpi) {
            var aRevenueRows = this._buildRevenueShareChart(oKpi);

            this._oViewModel.setProperty("/segmentShareChart", aRevenueRows);
            this._oViewModel.setProperty("/segmentShareMessage", aRevenueRows.length ? "" :
                "전체 사업부문 수익 데이터가 없습니다.");
            this._oViewModel.setProperty("/summaryMessage", this._buildSummaryMessage(oKpi));
        },

        _buildRevenueShareChart: function (oKpi) {
            var fSales = this._isFiniteNumber(oKpi && oKpi.salesRevenue) ? Math.abs(Number(oKpi.salesRevenue)) : null;
            var fRental = this._isFiniteNumber(oKpi && oKpi.rentalRevenue) ? Math.abs(Number(oKpi.rentalRevenue)) : null;
            var fTotal = this._isFiniteNumber(oKpi && oKpi.totalRevenue) ? Math.abs(Number(oKpi.totalRevenue)) : null;

            if (!this._isFiniteNumber(fSales) || !this._isFiniteNumber(fRental)) {
                return [];
            }

            if (!this._isFiniteNumber(fTotal) || fTotal === 0) {
                fTotal = fSales + fRental;
            }

            if (!this._isFiniteNumber(fTotal) || fTotal === 0) {
                return [];
            }

            return [{
                segmentDisplay: "가구 제조 및 판매",
                amount: fSales,
                share: this._isFiniteNumber(oKpi.salesCommonAllocRate) ? Number(oKpi.salesCommonAllocRate) :
                    (this._isFiniteNumber(fSales) ? fSales / fTotal : null),
                waers: oKpi.currency || ""
            }, {
                segmentDisplay: "가구 렌탈/구독",
                amount: fRental,
                share: this._isFiniteNumber(oKpi.rentalRevenueRate) ? Number(oKpi.rentalRevenueRate) :
                    (this._isFiniteNumber(fRental) ? fRental / fTotal : null),
                waers: oKpi.currency || ""
            }].filter(function (oRow) {
                return this._isFiniteNumber(oRow.amount);
            }.bind(this));
        },

        _findProductSummaryRow: function (aRows) {
            return (aRows || []).filter(function (oRow) {
                return this._rowsHaveAnyNumber([oRow], [
                    "salesRevenue",
                    "rentalRevenue",
                    "totalRevenue",
                    "salesCommonAllocRate",
                    "commonAdminPool",
                    "commonAdminSalesAlloc",
                    "sgaPool",
                    "salesDirectSga"
                ]);
            }.bind(this))[0] || (aRows || [])[0] || {};
        },

        _summaryNumber: function (oSummary, sProperty) {
            return this._isFiniteNumber(oSummary && oSummary[sProperty]) ? Number(oSummary[sProperty]) : null;
        },

        _buildSummaryMessage: function (oKpi) {
            var aMissing = [];

            [{
                property: "salesRevenue",
                field: "sales_revenue_amt"
            }, {
                property: "salesCommonAllocRate",
                field: "sales_common_alloc_rate"
            }, {
                property: "commonAdminPool",
                field: "common_admin_pool_amt"
            }, {
                property: "commonAdminSalesAlloc",
                field: "common_admin_sales_alloc_amt"
            }, {
                property: "sgaPool",
                field: "sga_pool_amt"
            }].forEach(function (oField) {
                if (!(oKpi && oKpi.summaryFieldState && oKpi.summaryFieldState[oField.property])) {
                    aMissing.push(oField.field);
                }
            }.bind(this));

            if (!aMissing.length) {
                return "";
            }

            return "판매 수익성 기준 필드가 OData 응답에 없습니다: " + aMissing.join(", ") +
                ". Metadata 갱신 또는 CDS 0041 projection 확인이 필요합니다.";
        },

        _mapActualPlanRows: function (aRows, bSkipFunctionalAreaFilter) {
            var aMappedRows = (aRows || []).map(function (oRow) {
                var oMapped = this._decorateOrgText(oRow);
                var sCurrency = this._readField(oRow, "waers");

                oMapped.actualSales = this._toNumber(this._readField(oRow, "actual_sales_amt"));
                oMapped.actualCogs = this._toNumber(this._readField(oRow, "actual_cogs_amt"));
                oMapped.actualGrossProfit = this._toNumber(this._readField(oRow, "actual_gross_profit_amt"));
                oMapped.actualGrossProfitRate = this._toNumber(this._readField(oRow, "actual_gross_profit_rate"));
                oMapped.actualSga = this._toNumber(this._readField(oRow, "actual_sga_amt"));
                oMapped.actualOperatingProfit = this._toNumber(this._readField(oRow, "actual_operating_profit_amt"));
                oMapped.actualOperatingProfitRate = this._toNumber(this._readField(oRow, "actual_operating_profit_rate"));
                oMapped.actualVariance = this._normalizeVarianceAmount(this._readField(oRow, "actual_variance_amt"), sCurrency);
                oMapped.planSales = this._toNumber(this._readField(oRow, "plan_sales_amt"));
                oMapped.planCogs = this._toNumber(this._readField(oRow, "plan_cogs_amt"));
                oMapped.planGrossProfit = this._toNumber(this._readField(oRow, "plan_gross_profit_amt"));
                oMapped.planGrossProfitRate = this._toNumber(this._readField(oRow, "plan_gross_profit_rate"));
                oMapped.planSga = this._toNumber(this._readField(oRow, "plan_sga_amt"));
                oMapped.planOperatingProfit = this._toNumber(this._readField(oRow, "plan_operating_profit_amt"));
                oMapped.planOperatingProfitRate = this._toNumber(this._readField(oRow, "plan_operating_profit_rate"));
                oMapped.planVariance = this._normalizeVarianceAmount(this._readField(oRow, "plan_variance_amt"), sCurrency);
                oMapped.salesDiff = this._toNumber(this._readField(oRow, "sales_diff_amt"));
                oMapped.grossProfitDiff = this._toNumber(this._readField(oRow, "gross_profit_diff_amt"));
                oMapped.sgaDiff = this._toNumber(this._readField(oRow, "sga_diff_amt"));
                oMapped.operatingProfitDiff = this._toNumber(this._readField(oRow, "operating_profit_diff_amt"));
                oMapped.varianceDiff = this._normalizeVarianceAmount(this._readField(oRow, "variance_diff_amt"), sCurrency);
                oMapped.salesAchievementRate = this._toNumber(this._readField(oRow, "sales_achievement_rate"));
                oMapped.opProfitAchievementRate = this._toNumber(this._readField(oRow, "op_profit_achievement_rate"));
                oMapped.analysisNote = this._readField(oRow, "analysis_note");
                this._applyActualPlanFunctionalAreaGroup(oMapped);

                return this._refreshActualPlanDerivedFields(oMapped);
            }.bind(this));
            var aGroupedRows = this._groupActualPlanRows(aMappedRows);

            if (!bSkipFunctionalAreaFilter) {
                aGroupedRows = this._filterActualPlanRowsByFunctionalArea(aGroupedRows);
            }

            return aGroupedRows.sort(function (oLeft, oRight) {
                return String(oLeft.monat || "").localeCompare(String(oRight.monat || "")) ||
                    String(oLeft.segmentDisplay || "").localeCompare(String(oRight.segmentDisplay || "")) ||
                    String(oLeft.prctrDisplay || "").localeCompare(String(oRight.prctrDisplay || "")) ||
                    String(oLeft.fkberDisplay || "").localeCompare(String(oRight.fkberDisplay || ""));
            });
        },

        _applyActualPlanFunctionalAreaGroup: function (oRow) {
            var sFkber = this._cleanText(oRow.fkber);
            var sText = [
                oRow.fkberDisplay,
                oRow.fkberTextDisplay,
                oRow.fkbtx,
                oRow.fkber_txt
            ].map(this._cleanText, this).join(" ");
            var bSalesGroup = sText.indexOf("판매") > -1 ||
                /\bSALES?\b/.test(sText.toUpperCase()) ||
                /\bSALES?\b/.test(sFkber.toUpperCase());

            if (bSalesGroup) {
                oRow.fkberGroupKey = "__SALES__";
                oRow.fkberGroupDisplay = "판매";
                oRow.fkberDisplay = "판매";
                oRow.fkberTextDisplay = "판매";
                return oRow;
            }

            oRow.fkberGroupKey = sFkber || this._cleanText(oRow.fkberDisplay) || "-";
            oRow.fkberGroupDisplay = this._cleanText(oRow.fkberDisplay) || oRow.fkberGroupKey;

            return oRow;
        },

        _groupActualPlanRows: function (aRows) {
            var mGroups = {};
            var aAmountProperties = [
                "actualSales",
                "actualCogs",
                "actualGrossProfit",
                "actualSga",
                "actualOperatingProfit",
                "actualVariance",
                "planSales",
                "planCogs",
                "planGrossProfit",
                "planSga",
                "planOperatingProfit",
                "planVariance",
                "salesDiff",
                "cogsDiff",
                "grossProfitDiff",
                "sgaDiff",
                "operatingProfitDiff",
                "varianceDiff"
            ];

            (aRows || []).forEach(function (oRow) {
                var sKey = [
                    this._cleanText(oRow.monat),
                    this._cleanText(oRow.segment),
                    this._cleanText(oRow.prctr),
                    this._cleanText(oRow.fkberGroupKey || oRow.fkber),
                    this._cleanText(oRow.waers)
                ].join("|");
                var oGroup = mGroups[sKey];

                if (!oGroup) {
                    oGroup = Object.assign({}, oRow);
                    aAmountProperties.forEach(function (sProperty) {
                        oGroup[sProperty] = null;
                    });
                    mGroups[sKey] = oGroup;
                } else {
                    this._fillMissingText(oGroup, oRow, [
                        "segment",
                        "segment_txt",
                        "segmentDisplay",
                        "prctr",
                        "prctr_txt",
                        "prctrDisplay",
                        "pcg",
                        "pcgDisplay",
                        "orgGroupKey",
                        "orgGroupDisplay",
                        "fkber",
                        "fkbtx",
                        "fkber_txt",
                        "fkberTextDisplay",
                        "fkberDisplay",
                        "waers",
                        "analysisNote"
                    ]);
                    if (oGroup.fkberGroupKey === "__SALES__") {
                        oGroup.fkberDisplay = "판매";
                        oGroup.fkberTextDisplay = "판매";
                    }
                }

                aAmountProperties.forEach(function (sProperty) {
                    oGroup[sProperty] = this._addNullable(oGroup[sProperty], oRow[sProperty]);
                }.bind(this));
            }.bind(this));

            return Object.keys(mGroups).map(function (sKey) {
                return this._refreshActualPlanDerivedFields(mGroups[sKey]);
            }.bind(this));
        },

        _filterActualPlanRowsByFunctionalArea: function (aRows) {
            var oFilters = this._oViewModel.getProperty("/filters") || {};
            var sFkber = this._cleanText(oFilters.fkber);

            if (!sFkber) {
                return aRows;
            }

            return (aRows || []).filter(function (oRow) {
                return this._cleanText(oRow.fkberGroupKey) === sFkber ||
                    this._cleanText(oRow.fkber) === sFkber;
            }.bind(this));
        },

        _refreshActualPlanDerivedFields: function (oRow) {
            oRow.salesDiff = this._diffOrExisting(oRow.actualSales, oRow.planSales, oRow.salesDiff);
            oRow.cogsDiff = this._diffOrExisting(oRow.actualCogs, oRow.planCogs, oRow.cogsDiff);
            oRow.grossProfitDiff = this._diffOrExisting(oRow.actualGrossProfit, oRow.planGrossProfit, oRow.grossProfitDiff);
            oRow.sgaDiff = this._diffOrExisting(oRow.actualSga, oRow.planSga, oRow.sgaDiff);
            oRow.operatingProfitDiff = this._diffOrExisting(oRow.actualOperatingProfit, oRow.planOperatingProfit, oRow.operatingProfitDiff);
            oRow.varianceDiff = this._diffOrExisting(oRow.actualVariance, oRow.planVariance, oRow.varianceDiff);
            oRow.actualGrossProfitRate = this._ratioOrExisting(oRow.actualGrossProfit, oRow.actualSales, oRow.actualGrossProfitRate);
            oRow.actualOperatingProfitRate = this._ratioOrExisting(oRow.actualOperatingProfit, oRow.actualSales, oRow.actualOperatingProfitRate);
            oRow.planGrossProfitRate = this._ratioOrExisting(oRow.planGrossProfit, oRow.planSales, oRow.planGrossProfitRate);
            oRow.planOperatingProfitRate = this._ratioOrExisting(oRow.planOperatingProfit, oRow.planSales, oRow.planOperatingProfitRate);
            oRow.salesAchievementRate = this._ratioOrExisting(oRow.actualSales, oRow.planSales, oRow.salesAchievementRate);
            oRow.opProfitAchievementRate = this._ratioOrExisting(oRow.actualOperatingProfit, oRow.planOperatingProfit, oRow.opProfitAchievementRate);
            oRow.salesDiffState = formatter.stateByAmount(oRow.salesDiff);
            oRow.grossProfitDiffState = formatter.stateByAmount(oRow.grossProfitDiff);
            oRow.sgaDiffState = formatter.stateByAmount(oRow.sgaDiff);
            oRow.operatingProfitDiffState = formatter.stateByAmount(oRow.operatingProfitDiff);
            oRow.varianceDiffState = formatter.stateByAmount(oRow.varianceDiff);

            return oRow;
        },

        _applyActualPlanData: function (aRows, aValueHelpRows, bSummaryOnly) {
            var aActualPlanRows = this._mapActualPlanRows(aRows);
            var aActualPlanValueHelpRows = aValueHelpRows === aRows ? aActualPlanRows : this._mapActualPlanRows(aValueHelpRows, true);
            var oPlanState = this._buildActualPlanPlanState(aActualPlanRows);
            var aVarianceRows = this._buildActualPlanVarianceChart(aActualPlanRows, oPlanState);
            var aRankingRows = this._buildActualPlanRankingRows(aActualPlanRows, oPlanState);
            var aRevenueRows = aRankingRows.filter(function (oRow) {
                return oRow.isRevenueOrg &&
                    this._isFiniteNumber(oRow.actualOperatingProfit) &&
                    Number(oRow.actualOperatingProfit) !== 0;
            }.bind(this));
            var aRevenueChartRows = aRankingRows.filter(function (oRow) {
                return oRow.isRevenueOrg;
            });
            var aSupportRows = aRankingRows.filter(function (oRow) {
                return oRow.isCostSupportOrg;
            });
            var aTopRows = this._rankActualPlanRows(aRevenueRows.slice(0, 5));
            var aBottomRows = this._rankActualPlanRows(aRevenueRows.slice().reverse().slice(0, 5));
            var aOrgComparisonRows = this._buildActualPlanOrgComparisonRows(aRankingRows);
            var aProfitLossRows = this._buildActualPlanProfitLossStructure(aActualPlanRows, oPlanState);
            var oKpi = this._calculateActualPlanKpi(aActualPlanRows, oPlanState, aVarianceRows);

            this._applyActualPlanComparisonDisplay(aActualPlanRows, oPlanState);

            this._oViewModel.setProperty("/actualPlanRows", aActualPlanRows);
            this._oViewModel.setProperty("/actualPlanKpi", oKpi);
            this._oViewModel.setProperty("/actualPlanMonthlyChart", this._buildActualPlanMonthlyChart(aActualPlanRows, oPlanState));
            this._oViewModel.setProperty("/actualPlanMonthlySingle", this._buildActualPlanMonthlySingle(aActualPlanRows, oPlanState));
            this._oViewModel.setProperty("/actualPlanMonthlyMode", this._buildActualPlanMonthlyMode(aActualPlanRows));
            this._oViewModel.setProperty("/actualPlanProfitCenterChart", aRevenueChartRows);
            this._oViewModel.setProperty("/actualPlanRevenueOrgChart", aRevenueChartRows);
            this._oViewModel.setProperty("/actualPlanSupportCostChart", this._buildActualPlanSupportCostChart(aSupportRows));
            this._oViewModel.setProperty("/actualPlanOrgDetailRows", aRankingRows);
            this._oViewModel.setProperty("/actualPlanOrgComparisonRows", aOrgComparisonRows);
            this._oViewModel.setProperty("/actualPlanManagementPoints", this._buildActualPlanManagementPoints(aOrgComparisonRows));
            this._oViewModel.setProperty("/actualPlanVarianceChart", aVarianceRows);
            this._oViewModel.setProperty("/actualPlanFinancialFlow", aVarianceRows);
            this._oViewModel.setProperty("/actualPlanProfitLossStructure", aProfitLossRows);
            this._oViewModel.setProperty("/actualPlanCompositionChart", this._buildActualPlanCompositionChart(aProfitLossRows));
            this._oViewModel.setProperty("/actualPlanOrgSummary", this._buildActualPlanOrgSummary(aRankingRows, oKpi));
            this._oViewModel.setProperty("/actualPlanHasProfitLossStructure", aProfitLossRows.length > 0);
            this._oViewModel.setProperty("/actualPlanHasOrgData", aRankingRows.length > 0);
            this._oViewModel.setProperty("/actualPlanShowPlanComparison", oPlanState.hasPlanData);
            this._oViewModel.setProperty("/actualPlanShowActualOnly", !oPlanState.hasPlanData);
            this._oViewModel.setProperty("/actualPlanTopRows", aTopRows);
            this._oViewModel.setProperty("/actualPlanBottomRows", aBottomRows);
            this._oViewModel.setProperty("/actualPlanMatrixCells", this._buildActualPlanMatrixCells(aRankingRows));
            this._oViewModel.setProperty("/actualPlanValueHelp", this._buildActualPlanValueHelp(aActualPlanValueHelpRows));
            this._oViewModel.setProperty("/actualPlanFilterSummary", this._buildActualPlanFilterSummary());
            this._oViewModel.setProperty("/actualPlanPlanMessage", oPlanState.hasPlanData ? "" :
                "선택한 기간/버전에 계획 데이터가 없어 실적 중심으로 표시합니다.");
            if (!bSummaryOnly) {
                this._applySegmentShareData(aActualPlanRows);
            }
            this._oViewModel.setProperty("/hasActualPlanData", aActualPlanRows.length > 0);
            this._oViewModel.setProperty("/hasPlanData", oPlanState.hasPlanData);
            this._setActualPlanSelection(aActualPlanRows[0] || null, oPlanState);
            this._oViewModel.setProperty("/actualPlanMessage", aActualPlanRows.length ? "" : "조회 조건에 해당하는 실적/계획 데이터가 없습니다.");
        },

        _applySegmentShareData: function (aRows) {
            var aSegmentRows = this._buildSegmentShareChart(aRows);

            this._oViewModel.setProperty("/segmentShareChart", aSegmentRows);
            this._oViewModel.setProperty("/segmentShareMessage", aSegmentRows.length ? "" :
                "사업부문 기준 매출 데이터가 없습니다. 0046 서비스에 actual_sales_amt와 사업부문이 내려와야 표시됩니다.");
        },

        _buildActualPlanPlanState: function (aRows) {
            var aPlanProperties = [
                "planSales",
                "planCogs",
                "planGrossProfit",
                "planSga",
                "planOperatingProfit",
                "planVariance"
            ];
            var bHasPlanNumber = false;
            var bHasPlanAmount = false;

            (aRows || []).forEach(function (oRow) {
                aPlanProperties.forEach(function (sProperty) {
                    if (this._isFiniteNumber(oRow[sProperty])) {
                        bHasPlanNumber = true;
                        if (Number(oRow[sProperty]) !== 0) {
                            bHasPlanAmount = true;
                        }
                    }
                }.bind(this));
            }.bind(this));

            if (bHasPlanAmount) {
                return {
                    hasPlanData: true,
                    statusText: "계획 비교 가능",
                    statusDetail: "선택한 버전의 계획 금액이 확인되었습니다.",
                    statusState: "Success"
                };
            }

            if (bHasPlanNumber) {
                return {
                    hasPlanData: false,
                    statusText: "실적 기준 표시",
                    statusDetail: "실적 항목만 표시 중입니다.",
                    statusState: "Information"
                };
            }

            return {
                hasPlanData: false,
                statusText: "실적 기준 표시",
                statusDetail: "실적 항목만 표시 중입니다.",
                statusState: "Information"
            };
        },

        _applyActualPlanComparisonDisplay: function (aRows, oPlanState) {
            (aRows || []).forEach(function (oRow) {
                this._decorateActualPlanDisplayFields(oRow, oPlanState);
            }.bind(this));
        },

        _decorateActualPlanDisplayFields: function (oRow, oPlanState) {
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            oRow.actualSalesText = this._amountText(oRow.actualSales, oRow.waers);
            oRow.planSalesText = this._comparisonAmountText(oRow.planSales, oRow.waers, bHasPlanData);
            oRow.salesDiffText = this._comparisonAmountText(oRow.salesDiff, oRow.waers, bHasPlanData);
            oRow.salesAchievementText = this._comparisonPercentText(oRow.salesAchievementRate, bHasPlanData);
            oRow.actualCogsText = this._amountText(oRow.actualCogs, oRow.waers);
            oRow.planCogsText = this._comparisonAmountText(oRow.planCogs, oRow.waers, bHasPlanData);
            oRow.cogsDiffText = this._comparisonAmountText(oRow.cogsDiff, oRow.waers, bHasPlanData);
            oRow.actualGrossProfitText = this._amountText(oRow.actualGrossProfit, oRow.waers);
            oRow.planGrossProfitText = this._comparisonAmountText(oRow.planGrossProfit, oRow.waers, bHasPlanData);
            oRow.grossProfitDiffText = this._comparisonAmountText(oRow.grossProfitDiff, oRow.waers, bHasPlanData);
            oRow.actualSgaText = this._amountText(oRow.actualSga, oRow.waers);
            oRow.planSgaText = this._comparisonAmountText(oRow.planSga, oRow.waers, bHasPlanData);
            oRow.sgaDiffText = this._comparisonAmountText(oRow.sgaDiff, oRow.waers, bHasPlanData);
            oRow.actualOperatingProfitText = this._amountText(oRow.actualOperatingProfit, oRow.waers);
            oRow.planOperatingProfitText = this._comparisonAmountText(oRow.planOperatingProfit, oRow.waers, bHasPlanData);
            oRow.operatingProfitDiffText = this._comparisonAmountText(oRow.operatingProfitDiff, oRow.waers, bHasPlanData);
            oRow.opProfitAchievementText = this._comparisonPercentText(oRow.opProfitAchievementRate, bHasPlanData);
            oRow.actualOperatingProfitRateText = formatter.percent(oRow.actualOperatingProfitRate);
            oRow.planOperatingProfitRateText = this._comparisonPercentText(oRow.planOperatingProfitRate, bHasPlanData);
            oRow.actualVarianceText = this._amountText(oRow.actualVariance, oRow.waers);
            oRow.planVarianceText = this._comparisonAmountText(oRow.planVariance, oRow.waers, bHasPlanData);
            oRow.varianceDiffText = this._comparisonAmountText(oRow.varianceDiff, oRow.waers, bHasPlanData);
            oRow.displaySalesAchievementRate = bHasPlanData ? oRow.salesAchievementRate : null;
            oRow.displayOpProfitAchievementRate = bHasPlanData ? oRow.opProfitAchievementRate : null;
            oRow.displaySalesDiff = bHasPlanData ? oRow.salesDiff : null;
            oRow.displayCogsDiff = bHasPlanData ? oRow.cogsDiff : null;
            oRow.displayGrossProfitDiff = bHasPlanData ? oRow.grossProfitDiff : null;
            oRow.displaySgaDiff = bHasPlanData ? oRow.sgaDiff : null;
            oRow.displayOperatingProfitDiff = bHasPlanData ? oRow.operatingProfitDiff : null;
            oRow.displayVarianceDiff = bHasPlanData ? oRow.varianceDiff : null;
            oRow.displayPlanSales = bHasPlanData ? oRow.planSales : null;
            oRow.displayPlanCogs = bHasPlanData ? oRow.planCogs : null;
            oRow.displayPlanSga = bHasPlanData ? oRow.planSga : null;
            oRow.displayPlanOperatingProfit = bHasPlanData ? oRow.planOperatingProfit : null;
            oRow.sgaDiffState = this._costDifferenceState(oRow.sgaDiff, bHasPlanData);
            oRow.cogsDiffState = this._costDifferenceState(oRow.cogsDiff, bHasPlanData);
            oRow.varianceDiffState = this._costDifferenceState(oRow.varianceDiff, bHasPlanData);
            oRow.salesDiffState = this._profitDifferenceState(oRow.salesDiff, bHasPlanData);
            oRow.grossProfitDiffState = this._profitDifferenceState(oRow.grossProfitDiff, bHasPlanData);
            oRow.operatingProfitDiffState = this._profitDifferenceState(oRow.operatingProfitDiff, bHasPlanData);
            oRow.salesAchievementState = bHasPlanData && this._isFiniteNumber(oRow.salesAchievementRate) ?
                formatter.stateByRate(oRow.salesAchievementRate - 1) : "None";
            oRow.opProfitAchievementState = bHasPlanData && this._isFiniteNumber(oRow.opProfitAchievementRate) ?
                formatter.stateByRate(oRow.opProfitAchievementRate - 1) : "None";

            return oRow;
        },

        _comparisonAmountText: function (vValue, sCurrency, bEnabled) {
            return bEnabled ? this._amountText(vValue, sCurrency) : "-";
        },

        _comparisonPercentText: function (vValue, bEnabled) {
            return bEnabled ? formatter.percent(vValue) : "-";
        },

        _profitDifferenceState: function (vValue, bEnabled) {
            if (!bEnabled || !this._isFiniteNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Success" : "Error";
        },

        _costDifferenceState: function (vValue, bEnabled) {
            if (!bEnabled || !this._isFiniteNumber(vValue) || Number(vValue) === 0) {
                return "None";
            }
            return Number(vValue) > 0 ? "Error" : "Success";
        },

        _calculateActualPlanKpi: function (aRows, oPlanState, aVarianceRows) {
            var oKpi = this._emptyActualPlanKpi();
            var oCause = this._findActualPlanMajorCause(aVarianceRows || []);
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            oKpi.salesActual = this._sum(aRows, "actualSales");
            oKpi.actualCogs = this._sum(aRows, "actualCogs");
            oKpi.actualGrossProfit = this._sum(aRows, "actualGrossProfit");
            oKpi.actualSga = this._sum(aRows, "actualSga");
            oKpi.salesPlan = bHasPlanData ? this._sum(aRows, "planSales") : null;
            oKpi.salesDiff = bHasPlanData ? this._sum(aRows, "salesDiff") : null;
            oKpi.operatingProfitActual = this._sum(aRows, "actualOperatingProfit");
            oKpi.operatingProfitPlan = bHasPlanData ? this._sum(aRows, "planOperatingProfit") : null;
            oKpi.operatingProfitDiff = bHasPlanData ? this._sum(aRows, "operatingProfitDiff") : null;
            oKpi.currency = this._firstText(aRows, "waers");
            oKpi.planStatusText = oPlanState && oPlanState.statusText || "계획 비교 불가";
            oKpi.planStatusDetail = oPlanState && oPlanState.statusDetail || "";
            oKpi.planStatusState = oPlanState && oPlanState.statusState || "Information";
            oKpi.salesActualText = this._amountText(oKpi.salesActual, oKpi.currency);
            oKpi.actualCogsText = this._amountText(oKpi.actualCogs, oKpi.currency);
            oKpi.actualGrossProfitText = this._amountText(oKpi.actualGrossProfit, oKpi.currency);
            oKpi.actualSgaText = this._amountText(oKpi.actualSga, oKpi.currency);
            oKpi.actualGrossProfitRate = this._ratioOrExisting(oKpi.actualGrossProfit, oKpi.salesActual, null);
            oKpi.actualGrossProfitRateText = formatter.percent(oKpi.actualGrossProfitRate);
            oKpi.salesPlanText = this._comparisonAmountText(oKpi.salesPlan, oKpi.currency, bHasPlanData);
            oKpi.salesDiffText = this._comparisonAmountText(oKpi.salesDiff, oKpi.currency, bHasPlanData);
            oKpi.salesAchievementRate = this._ratioOrExisting(oKpi.salesActual, oKpi.salesPlan, null);
            oKpi.salesAchievementText = this._comparisonPercentText(oKpi.salesAchievementRate, bHasPlanData);
            oKpi.salesAchievementState = bHasPlanData && this._isFiniteNumber(oKpi.salesAchievementRate) ?
                formatter.stateByRate(oKpi.salesAchievementRate - 1) : "None";
            oKpi.salesDiffState = this._profitDifferenceState(oKpi.salesDiff, bHasPlanData);
            oKpi.operatingProfitActualText = this._amountText(oKpi.operatingProfitActual, oKpi.currency);
            oKpi.operatingProfitPlanText = this._comparisonAmountText(oKpi.operatingProfitPlan, oKpi.currency, bHasPlanData);
            oKpi.operatingProfitDiffText = this._comparisonAmountText(oKpi.operatingProfitDiff, oKpi.currency, bHasPlanData);
            oKpi.operatingProfitActualRate = this._ratioOrExisting(oKpi.operatingProfitActual, oKpi.salesActual, null);
            oKpi.operatingProfitPlanRate = this._ratioOrExisting(oKpi.operatingProfitPlan, oKpi.salesPlan, null);
            oKpi.operatingProfitActualRateText = formatter.percent(oKpi.operatingProfitActualRate);
            oKpi.operatingProfitPlanRateText = this._comparisonPercentText(oKpi.operatingProfitPlanRate, bHasPlanData);
            oKpi.operatingProfitDiffState = this._profitDifferenceState(oKpi.operatingProfitDiff, bHasPlanData);
            oKpi.salesActualState = "Information";
            oKpi.actualCogsState = "Warning";
            oKpi.actualGrossProfitState = formatter.stateByAmount(oKpi.actualGrossProfit);
            oKpi.actualSgaState = "Warning";
            oKpi.operatingProfitActualState = formatter.stateByAmount(oKpi.operatingProfitActual);
            oKpi.majorCauseTitle = oCause.title || "차이 원인 없음";
            oKpi.majorCauseText = oCause.text || (bHasPlanData ? "비교 가능한 차이 금액이 없습니다." : "계획 데이터가 없어 차이 원인을 계산하지 않았습니다.");
            oKpi.majorCauseAmountText = oCause.amountText || "-";
            oKpi.majorCauseState = oCause.state || "None";

            if (bHasPlanData && this._isFiniteNumber(oKpi.salesActual) && oKpi.salesActual !== 0 &&
                    this._isFiniteNumber(oKpi.salesPlan) && oKpi.salesPlan !== 0) {
                oKpi.operatingProfitRateDiff = (oKpi.operatingProfitActual / oKpi.salesActual) -
                    (oKpi.operatingProfitPlan / oKpi.salesPlan);
            }
            oKpi.operatingProfitRateDiffText = this._comparisonPercentText(oKpi.operatingProfitRateDiff, bHasPlanData);

            return oKpi;
        },

        _buildActualPlanMonthlyChart: function (aRows, oPlanState) {
            var mByMonth = {};
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            aRows.forEach(function (oRow) {
                var sMonth = oRow.monat || "";
                if (!mByMonth[sMonth]) {
                    mByMonth[sMonth] = {
                        monthText: sMonth ? Number(sMonth) + "월" : "-",
                        salesActual: null,
                        salesPlan: null,
                        operatingProfitActual: null,
                        operatingProfitDiff: null,
                        waers: oRow.waers || ""
                    };
                }

                mByMonth[sMonth].salesActual = this._addNullable(mByMonth[sMonth].salesActual, oRow.actualSales);
                mByMonth[sMonth].salesPlan = bHasPlanData ? this._addNullable(mByMonth[sMonth].salesPlan, oRow.planSales) : null;
                mByMonth[sMonth].operatingProfitActual = this._addNullable(mByMonth[sMonth].operatingProfitActual, oRow.actualOperatingProfit);
                mByMonth[sMonth].operatingProfitDiff = bHasPlanData ? this._addNullable(mByMonth[sMonth].operatingProfitDiff, oRow.operatingProfitDiff) : null;
            }.bind(this));

            return Object.keys(mByMonth).sort().map(function (sMonth) {
                return mByMonth[sMonth];
            });
        },

        _buildActualPlanProfitLossStructure: function (aRows, oPlanState) {
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);
            var sCurrency = this._firstText(aRows, "waers");
            var aItems = [{
                item: "매출",
                actual: this._sum(aRows, "actualSales"),
                plan: bHasPlanData ? this._sum(aRows, "planSales") : null,
                diff: bHasPlanData ? this._sum(aRows, "salesDiff") : null,
                state: "Information"
            }, {
                item: "매출원가",
                actual: this._sum(aRows, "actualCogs"),
                plan: bHasPlanData ? this._sum(aRows, "planCogs") : null,
                diff: bHasPlanData ? this._sum(aRows, "cogsDiff") : null,
                state: "Warning"
            }, {
                item: "매출총이익",
                actual: this._sum(aRows, "actualGrossProfit"),
                plan: bHasPlanData ? this._sum(aRows, "planGrossProfit") : null,
                diff: bHasPlanData ? this._sum(aRows, "grossProfitDiff") : null,
                state: formatter.stateByAmount(this._sum(aRows, "actualGrossProfit"))
            }, {
                item: "판관비",
                actual: this._sum(aRows, "actualSga"),
                plan: bHasPlanData ? this._sum(aRows, "planSga") : null,
                diff: bHasPlanData ? this._sum(aRows, "sgaDiff") : null,
                state: "Warning"
            }, {
                item: "영업이익",
                actual: this._sum(aRows, "actualOperatingProfit"),
                plan: bHasPlanData ? this._sum(aRows, "planOperatingProfit") : null,
                diff: bHasPlanData ? this._sum(aRows, "operatingProfitDiff") : null,
                state: formatter.stateByAmount(this._sum(aRows, "actualOperatingProfit")),
                emphasized: true
            }];

            return aItems.filter(function (oItem) {
                return this._isFiniteNumber(oItem.actual);
            }.bind(this)).map(function (oItem) {
                oItem.actualText = this._amountText(oItem.actual, sCurrency);
                oItem.planText = this._comparisonAmountText(oItem.plan, sCurrency, bHasPlanData);
                oItem.diffText = this._comparisonAmountText(oItem.diff, sCurrency, bHasPlanData);
                oItem.diffState = oItem.item === "매출원가" || oItem.item === "판관비" ?
                    this._costDifferenceState(oItem.diff, bHasPlanData) :
                    this._profitDifferenceState(oItem.diff, bHasPlanData);
                return oItem;
            }.bind(this));
        },

        _buildActualPlanCompositionChart: function (aProfitLossRows) {
            return (aProfitLossRows || []).filter(function (oItem) {
                return this._isFiniteNumber(oItem.actual);
            }.bind(this)).map(function (oItem) {
                return {
                    item: oItem.item,
                    amount: oItem.actual,
                    amountText: oItem.actualText,
                    state: oItem.state
                };
            });
        },

        _rankActualPlanRows: function (aRows) {
            return (aRows || []).map(function (oRow, iIndex) {
                var oRanked = Object.assign({}, oRow);
                oRanked.rank = iIndex + 1;
                oRanked.rankText = String(iIndex + 1);
                oRanked.rankState = formatter.stateByAmount(oRanked.actualOperatingProfit);
                oRanked.orgMetaText = [
                    oRanked.fkberDisplay,
                    oRanked.segmentDisplay,
                    oRanked.memberProfitCenterText
                ].filter(function (sValue) {
                    return sValue && sValue !== "-";
                }).join(" · ");
                return oRanked;
            });
        },

        _buildActualPlanOrgSummary: function (aRankingRows, oKpi) {
            var aRows = aRankingRows || [];
            var aRevenueRows = aRows.filter(function (oRow) {
                return oRow.isRevenueOrg;
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualOperatingProfit) - this._sortNumber(oLeft.actualOperatingProfit);
            }.bind(this));
            var aSupportRows = aRows.filter(function (oRow) {
                return oRow.isCostSupportOrg;
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualCostImpact) - this._sortNumber(oLeft.actualCostImpact);
            }.bind(this));
            var oBest = aRevenueRows[0] || {};
            var oMaxCost = aSupportRows[0] || {};
            var sCurrency = oKpi && oKpi.currency || this._firstText(aRows, "waers");

            return {
                orgCount: aRows.length,
                orgCountText: formatter.integer(aRows.length),
                revenueOrgCount: aRevenueRows.length,
                revenueOrgCountText: formatter.integer(aRevenueRows.length),
                supportOrgCount: aSupportRows.length,
                supportOrgCountText: formatter.integer(aSupportRows.length),
                bestOrgName: oBest.profitCenter || "-",
                bestOrgMetaText: [oBest.fkberDisplay, oBest.segmentDisplay, oBest.memberProfitCenterText].filter(Boolean).join(" · "),
                bestOrgAmountText: this._amountText(oBest.actualOperatingProfit, sCurrency),
                bestOrgState: formatter.stateByAmount(oBest.actualOperatingProfit),
                maxCostOrgName: oMaxCost.profitCenter || "-",
                maxCostOrgMetaText: [oMaxCost.responsibilityTypeText, oMaxCost.fkberDisplay, oMaxCost.segmentDisplay].filter(Boolean).join(" · "),
                maxCostOrgAmountText: this._amountText(oMaxCost.actualCostImpact, sCurrency),
                maxCostOrgState: "Warning",
                totalOperatingProfitText: oKpi && oKpi.operatingProfitActualText || this._amountText(null, sCurrency),
                totalOperatingProfitState: oKpi && oKpi.operatingProfitActualState || "None"
            };
        },

        _decorateActualPlanResponsibility: function (oRow) {
            var sOrgKey = this._cleanText(oRow.orgGroupKey).toUpperCase();
            var sFkber = this._cleanText(oRow.fkber);
            var sText = [
                oRow.orgGroupDisplay,
                oRow.profitCenter,
                oRow.prctrDisplay,
                oRow.fkberDisplay,
                oRow.segmentDisplay,
                oRow.memberProfitCenterText,
                oRow.memberFunctionalAreaText
            ].map(this._cleanText, this).join(" ");
            var bRevenueKey = sOrgKey.indexOf("SALES_") === 0 || sOrgKey === "RENTAL_SALES";
            var bSupportKey = sOrgKey.indexOf("LOGISTICS") > -1 || sOrgKey.indexOf("PRODUCTION") > -1;
            var bCostKey = sOrgKey.indexOf("COMMON_ADMIN") > -1;
            var bSupport = bSupportKey ||
                sOrgKey.indexOf("PRODUCTION") > -1 ||
                sFkber === "1000" ||
                sFkber === "3000" ||
                /생산|공장|제조|물류|창고|허브|회수/.test(sText);
            var bCost = bCostKey ||
                sFkber === "4000" ||
                /관리|회계|재무|인사|공통/.test(sText);
            var bRevenue = bRevenueKey ||
                sFkber === "2000" ||
                sFkber === "5000" ||
                /영업|렌탈영업|매장|판매|렌탈서비스/.test(sText) ||
                (this._isFiniteNumber(oRow.actualSales) && Number(oRow.actualSales) !== 0);
            var sType = "COST";
            var sTypeText = "비용 책임 조직";
            var sTypeState = "Warning";
            var fIncurredCost = this._sumFiniteValues([
                oRow.actualCogs,
                oRow.actualSga,
                oRow.actualVariance
            ]);
            var fCostImpact = fIncurredCost;

            if (bRevenueKey) {
                sType = "REVENUE";
                sTypeText = "수익 책임 조직";
                sTypeState = "Success";
            } else if (bSupport) {
                sType = "SUPPORT";
                sTypeText = "제조/물류 지원 조직";
                sTypeState = "Information";
            } else if (bRevenue && !bCost) {
                sType = "REVENUE";
                sTypeText = "수익 책임 조직";
                sTypeState = "Success";
            } else if (bCost) {
                sType = "COST";
                sTypeText = "비용 책임 조직";
                sTypeState = "Warning";
            }

            if (!this._isFiniteNumber(fCostImpact) && this._isFiniteNumber(oRow.actualOperatingProfit) && Number(oRow.actualOperatingProfit) < 0) {
                fCostImpact = Math.abs(Number(oRow.actualOperatingProfit));
            }
            if (!this._isFiniteNumber(fCostImpact) && (sType === "COST" || sType === "SUPPORT") && this._isFiniteNumber(oRow.actualOperatingProfit)) {
                fCostImpact = Math.abs(Number(oRow.actualOperatingProfit));
            }

            oRow.responsibilityType = sType;
            oRow.responsibilityTypeText = sTypeText;
            oRow.responsibilityTypeState = sTypeState;
            oRow.isRevenueOrg = sType === "REVENUE";
            oRow.isCostSupportOrg = sType === "COST" || sType === "SUPPORT";
            oRow.actualIncurredCost = fIncurredCost;
            oRow.actualCostImpact = fCostImpact;
            oRow.actualIncurredCostText = this._amountText(fIncurredCost, oRow.waers);
            oRow.actualCostImpactText = this._amountText(fCostImpact, oRow.waers);
            oRow.actualCostImpactState = this._isFiniteNumber(fCostImpact) && Number(fCostImpact) > 0 ? "Warning" : "None";
            oRow.displayOperatingProfitRateText = oRow.isRevenueOrg ? oRow.actualOperatingProfitRateText : "-";
            oRow.displayOperatingProfitRate = oRow.isRevenueOrg ? oRow.actualOperatingProfitRate : null;

            return oRow;
        },

        _buildActualPlanSupportCostChart: function (aSupportRows) {
            return (aSupportRows || []).filter(function (oRow) {
                return (this._isFiniteNumber(oRow.actualIncurredCost) && Number(oRow.actualIncurredCost) !== 0) ||
                    (this._isFiniteNumber(oRow.actualCostImpact) && Number(oRow.actualCostImpact) !== 0);
            }.bind(this)).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualCostImpact) - this._sortNumber(oLeft.actualCostImpact) ||
                    String(oLeft.profitCenter || "").localeCompare(String(oRight.profitCenter || ""));
            }.bind(this));
        },

        _buildActualPlanOrgComparisonRows: function (aRows) {
            var fTotalSales = this._sum(aRows || [], "actualSales");
            var fTotalOperatingProfit = this._sum(aRows || [], "actualOperatingProfit");

            return (aRows || []).map(function (oRow) {
                var oComparison = Object.assign({}, oRow);
                var bHasSales = this._isFiniteNumber(oComparison.actualSales) && Number(oComparison.actualSales) !== 0;
                var bHasTotalSales = this._isFiniteNumber(fTotalSales) && Number(fTotalSales) !== 0;
                var bHasTotalProfit = this._isFiniteNumber(fTotalOperatingProfit) && Number(fTotalOperatingProfit) !== 0;

                oComparison.orgComparisonMetaText = [
                    oComparison.responsibilityTypeText,
                    oComparison.fkberDisplay,
                    oComparison.memberProfitCenterText
                ].filter(function (sValue) {
                    return sValue && sValue !== "-";
                }).join(" · ");
                oComparison.actualSgaRate = bHasSales && this._isFiniteNumber(oComparison.actualSga) ?
                    Number(oComparison.actualSga) / Number(oComparison.actualSales) : null;
                oComparison.actualCogsRate = bHasSales && this._isFiniteNumber(oComparison.actualCogs) ?
                    Number(oComparison.actualCogs) / Number(oComparison.actualSales) : null;
                oComparison.operatingProfitContribution = bHasTotalProfit && this._isFiniteNumber(oComparison.actualOperatingProfit) ?
                    Number(oComparison.actualOperatingProfit) / Number(fTotalOperatingProfit) : null;
                oComparison.salesShare = bHasTotalSales && this._isFiniteNumber(oComparison.actualSales) ?
                    Number(oComparison.actualSales) / Number(fTotalSales) : null;
                oComparison.actualSgaRateText = this._isFiniteNumber(oComparison.actualSgaRate) ?
                    formatter.percent(oComparison.actualSgaRate) : "-";
                oComparison.actualCogsRateText = this._isFiniteNumber(oComparison.actualCogsRate) ?
                    formatter.percent(oComparison.actualCogsRate) : "-";
                oComparison.operatingProfitContributionText = this._isFiniteNumber(oComparison.operatingProfitContribution) ?
                    formatter.percent(oComparison.operatingProfitContribution) : "-";
                oComparison.salesShareText = this._isFiniteNumber(oComparison.salesShare) ?
                    formatter.percent(oComparison.salesShare) : "-";
                oComparison.salesProfitContributionGap = this._isFiniteNumber(oComparison.salesShare) &&
                    this._isFiniteNumber(oComparison.operatingProfitContribution) ?
                    Number(oComparison.salesShare) - Number(oComparison.operatingProfitContribution) : null;
                oComparison.operatingProfitContributionBarPercent = this._isFiniteNumber(oComparison.operatingProfitContribution) ?
                    Math.min(100, Math.abs(Number(oComparison.operatingProfitContribution) * 100)) : 0;
                oComparison.operatingProfitContributionState = formatter.stateByAmount(oComparison.actualOperatingProfit);

                return oComparison;
            }.bind(this));
        },

        _buildActualPlanManagementPoints: function (aRows) {
            var aComparableRows = (aRows || []).filter(function (oRow) {
                return this._isFiniteNumber(oRow.actualSales) && Number(oRow.actualSales) !== 0;
            }.bind(this));
            var fTotalSales = this._sum(aComparableRows, "actualSales");
            var fTotalSga = this._sum(aComparableRows, "actualSga");
            var fTotalCogs = this._sum(aComparableRows, "actualCogs");
            var fComparableOperatingProfit = this._sum(aComparableRows, "actualOperatingProfit");
            var fTotalOperatingProfit = this._sum(aRows || [], "actualOperatingProfit");
            var fAverageSgaRate = this._ratioOrExisting(fTotalSga, fTotalSales, null);
            var fAverageCogsRate = this._ratioOrExisting(fTotalCogs, fTotalSales, null);
            var fAverageOperatingProfitRate = this._ratioOrExisting(fComparableOperatingProfit, fTotalSales, null);
            var aPoints = [];
            var fnText = function (vValue) {
                return this._isFiniteNumber(vValue) ? formatter.percent(vValue) : "-";
            }.bind(this);
            var fnPick = function (sTitle, aCandidates, fnMetricText, fnBenchmarkText, sState) {
                var oCandidate = aCandidates[0];

                if (!oCandidate) {
                    return;
                }

                aPoints.push({
                    title: sTitle,
                    orgName: oCandidate.profitCenter || "-",
                    metaText: oCandidate.orgComparisonMetaText || "",
                    metricText: fnMetricText(oCandidate),
                    benchmarkText: fnBenchmarkText(oCandidate),
                    state: sState || "None"
                });
            };

            if (this._isFiniteNumber(fAverageSgaRate)) {
                fnPick("판관비 부담 점검", (aRows || []).filter(function (oRow) {
                    return this._isFiniteNumber(oRow.actualSgaRate) && Number(oRow.actualSgaRate) > Number(fAverageSgaRate);
                }.bind(this)).sort(function (oLeft, oRight) {
                    return (Number(oRight.actualSgaRate) - Number(fAverageSgaRate)) -
                        (Number(oLeft.actualSgaRate) - Number(fAverageSgaRate));
                }), function (oRow) {
                    return oRow.actualSgaRateText;
                }, function () {
                    return "전체 평균 " + fnText(fAverageSgaRate);
                }, "Warning");
            }

            if (this._isFiniteNumber(fAverageCogsRate)) {
                fnPick("원가율 점검", (aRows || []).filter(function (oRow) {
                    return this._isFiniteNumber(oRow.actualCogsRate) && Number(oRow.actualCogsRate) > Number(fAverageCogsRate);
                }.bind(this)).sort(function (oLeft, oRight) {
                    return (Number(oRight.actualCogsRate) - Number(fAverageCogsRate)) -
                        (Number(oLeft.actualCogsRate) - Number(fAverageCogsRate));
                }), function (oRow) {
                    return oRow.actualCogsRateText;
                }, function () {
                    return "전체 평균 " + fnText(fAverageCogsRate);
                }, "Warning");
            }

            if (this._isFiniteNumber(fAverageOperatingProfitRate)) {
                fnPick("수익성 우수 조직", (aRows || []).filter(function (oRow) {
                    return oRow.isRevenueOrg &&
                        this._isFiniteNumber(oRow.actualOperatingProfitRate) &&
                        Number(oRow.actualOperatingProfitRate) > Number(fAverageOperatingProfitRate);
                }.bind(this)).sort(function (oLeft, oRight) {
                    return (Number(oRight.actualOperatingProfitRate) - Number(fAverageOperatingProfitRate)) -
                        (Number(oLeft.actualOperatingProfitRate) - Number(fAverageOperatingProfitRate));
                }), function (oRow) {
                    return oRow.actualOperatingProfitRateText;
                }, function () {
                    return "전체 평균 " + fnText(fAverageOperatingProfitRate);
                }, "Success");
            }

            if (this._isFiniteNumber(fTotalSales) && Number(fTotalSales) !== 0 &&
                    this._isFiniteNumber(fTotalOperatingProfit) && Number(fTotalOperatingProfit) !== 0) {
                fnPick("이익 기여도 확인", (aRows || []).filter(function (oRow) {
                    return this._isFiniteNumber(oRow.salesProfitContributionGap) &&
                        this._isFiniteNumber(oRow.salesShare) &&
                        Number(oRow.salesShare) > 0 &&
                        Number(oRow.salesProfitContributionGap) > 0;
                }.bind(this)).sort(function (oLeft, oRight) {
                    return Number(oRight.salesProfitContributionGap) - Number(oLeft.salesProfitContributionGap);
                }), function (oRow) {
                    return oRow.operatingProfitContributionText;
                }, function (oRow) {
                    return "매출 비중 " + oRow.salesShareText;
                }, "None");
            }

            return aPoints;
        },

        _buildActualPlanMonthlySingle: function (aRows, oPlanState) {
            var aMonthlyRows = this._buildActualPlanMonthlyChart(aRows, oPlanState);
            var oMonth = aMonthlyRows[0] || {};
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            return {
                monthText: oMonth.monthText || "-",
                salesActualText: this._amountText(oMonth.salesActual, oMonth.waers),
                salesPlanText: this._comparisonAmountText(oMonth.salesPlan, oMonth.waers, bHasPlanData),
                operatingProfitActualText: this._amountText(oMonth.operatingProfitActual, oMonth.waers),
                operatingProfitDiffText: this._comparisonAmountText(oMonth.operatingProfitDiff, oMonth.waers, bHasPlanData),
                operatingProfitDiffState: this._profitDifferenceState(oMonth.operatingProfitDiff, bHasPlanData)
            };
        },

        _buildActualPlanMonthlyMode: function (aRows) {
            var mMonths = {};

            (aRows || []).forEach(function (oRow) {
                if (oRow.monat) {
                    mMonths[oRow.monat] = true;
                }
            });

            return Object.keys(mMonths).length > 1 ? "chart" : "single";
        },

        _buildActualPlanRankingRows: function (aRows, oPlanState) {
            var mByOrg = {};
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            (aRows || []).forEach(function (oRow) {
                var sOrgGroupKey = this._cleanText(oRow.orgGroupKey || oRow.prctr || oRow.prctrDisplay);
                var sOrgGroupDisplay = this._cleanText(oRow.orgGroupDisplay || oRow.prctrDisplay || oRow.prctr);
                var sKey = sOrgGroupKey;
                var oGroup = mByOrg[sKey];

                if (!this._isFiniteNumber(oRow.actualOperatingProfit)) {
                    return;
                }

                if (!oGroup) {
                    oGroup = {
                        monat: oRow.monat,
                        segment: oRow.segment,
                        segmentDisplay: oRow.segmentDisplay,
                        prctr: "",
                        prctrDisplay: "",
                        pcg: oRow.pcg,
                        pcgDisplay: oRow.pcgDisplay,
                        orgGroupKey: sOrgGroupKey,
                        orgGroupDisplay: sOrgGroupDisplay || "-",
                        fkber: oRow.fkber,
                        fkberGroupKey: oRow.fkberGroupKey,
                        fkberDisplay: oRow.fkberDisplay || "-",
                        profitCenter: sOrgGroupDisplay || "-",
                        memberProfitCenters: {},
                        memberFunctionalAreas: {},
                        memberProfitCenterCount: 0,
                        memberProfitCenterText: "",
                        memberFunctionalAreaCount: 0,
                        memberFunctionalAreaText: "",
                        canDrilldown: false,
                        isPcgGroup: true,
                        actualSales: null,
                        actualCogs: null,
                        actualGrossProfit: null,
                        actualSga: null,
                        actualOperatingProfit: null,
                        actualVariance: null,
                        planSales: null,
                        planCogs: null,
                        planGrossProfit: null,
                        planSga: null,
                        planOperatingProfit: null,
                        planVariance: null,
                        salesDiff: null,
                        cogsDiff: null,
                        grossProfitDiff: null,
                        sgaDiff: null,
                        operatingProfitDiff: null,
                        varianceDiff: null,
                        waers: oRow.waers || ""
                    };
                    mByOrg[sKey] = oGroup;
                }

                if (oRow.prctr || oRow.prctrDisplay) {
                    oGroup.memberProfitCenters[this._cleanText(oRow.prctr || oRow.prctrDisplay)] = oRow.prctrDisplay || oRow.prctr;
                }
                if (oRow.fkberGroupKey || oRow.fkberDisplay) {
                    oGroup.memberFunctionalAreas[this._cleanText(oRow.fkberGroupKey || oRow.fkberDisplay)] = oRow.fkberDisplay || oRow.fkberGroupKey;
                }
                oGroup.actualSales = this._addNullable(oGroup.actualSales, oRow.actualSales);
                oGroup.actualCogs = this._addNullable(oGroup.actualCogs, oRow.actualCogs);
                oGroup.actualGrossProfit = this._addNullable(oGroup.actualGrossProfit, oRow.actualGrossProfit);
                oGroup.actualSga = this._addNullable(oGroup.actualSga, oRow.actualSga);
                oGroup.actualOperatingProfit = this._addNullable(
                    oGroup.actualOperatingProfit,
                    oRow.actualOperatingProfit
                );
                oGroup.actualVariance = this._addNullable(oGroup.actualVariance, oRow.actualVariance);
                oGroup.planSales = bHasPlanData ? this._addNullable(oGroup.planSales, oRow.planSales) : null;
                oGroup.planCogs = bHasPlanData ? this._addNullable(oGroup.planCogs, oRow.planCogs) : null;
                oGroup.planGrossProfit = bHasPlanData ? this._addNullable(oGroup.planGrossProfit, oRow.planGrossProfit) : null;
                oGroup.planSga = bHasPlanData ? this._addNullable(oGroup.planSga, oRow.planSga) : null;
                oGroup.planOperatingProfit = bHasPlanData ? this._addNullable(oGroup.planOperatingProfit, oRow.planOperatingProfit) : null;
                oGroup.planVariance = bHasPlanData ? this._addNullable(oGroup.planVariance, oRow.planVariance) : null;
                oGroup.salesDiff = bHasPlanData ? this._addNullable(oGroup.salesDiff, oRow.salesDiff) : null;
                oGroup.cogsDiff = bHasPlanData ? this._addNullable(oGroup.cogsDiff, oRow.cogsDiff) : null;
                oGroup.grossProfitDiff = bHasPlanData ? this._addNullable(oGroup.grossProfitDiff, oRow.grossProfitDiff) : null;
                oGroup.sgaDiff = bHasPlanData ? this._addNullable(oGroup.sgaDiff, oRow.sgaDiff) : null;
                oGroup.operatingProfitDiff = bHasPlanData ? this._addNullable(oGroup.operatingProfitDiff, oRow.operatingProfitDiff) : null;
                oGroup.varianceDiff = bHasPlanData ? this._addNullable(oGroup.varianceDiff, oRow.varianceDiff) : null;
            }.bind(this));

            return Object.keys(mByOrg).map(function (sKey) {
                var oGroup = mByOrg[sKey];
                var aMemberProfitCenters = Object.keys(oGroup.memberProfitCenters || {}).map(function (sMemberKey) {
                    return oGroup.memberProfitCenters[sMemberKey];
                }).filter(Boolean);
                var aMemberFunctionalAreas = Object.keys(oGroup.memberFunctionalAreas || {}).map(function (sMemberKey) {
                    return oGroup.memberFunctionalAreas[sMemberKey];
                }).filter(Boolean);
                oGroup.memberProfitCenterCount = aMemberProfitCenters.length;
                oGroup.memberProfitCenterText = aMemberProfitCenters.length > 1 ?
                    formatter.integer(aMemberProfitCenters.length) + "개 손익센터" :
                    (aMemberProfitCenters[0] || "");
                oGroup.memberFunctionalAreaCount = aMemberFunctionalAreas.length;
                oGroup.memberFunctionalAreaText = aMemberFunctionalAreas.length > 1 ?
                    formatter.integer(aMemberFunctionalAreas.length) + "개 기능영역" :
                    (aMemberFunctionalAreas[0] || "");
                oGroup.fkberDisplay = oGroup.memberFunctionalAreaText || oGroup.fkberDisplay;
                oGroup.canDrilldown = aMemberProfitCenters.length === 1;
                oGroup.prctr = oGroup.canDrilldown ? Object.keys(oGroup.memberProfitCenters || {})[0] : "";
                oGroup.prctrDisplay = oGroup.memberProfitCenterText;
                this._refreshActualPlanDerivedFields(oGroup);
                this._decorateActualPlanDisplayFields(oGroup, {
                    hasPlanData: bHasPlanData
                });
                this._decorateActualPlanResponsibility(oGroup);
                return oGroup;
            }.bind(this)).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualOperatingProfit) - this._sortNumber(oLeft.actualOperatingProfit) ||
                    String(oLeft.profitCenter || "").localeCompare(String(oRight.profitCenter || "")) ||
                    String(oLeft.fkberDisplay || "").localeCompare(String(oRight.fkberDisplay || ""));
            }.bind(this));
        },

        _buildActualPlanMatrixCells: function (aRankingRows) {
            return (aRankingRows || []).slice(0, 18).map(function (oRow) {
                return {
                    prctr: oRow.prctr,
                    prctrDisplay: oRow.profitCenter || oRow.pcgDisplay || oRow.prctrDisplay,
                    pcg: oRow.pcg,
                    pcgDisplay: oRow.pcgDisplay,
                    fkberDisplay: oRow.fkberDisplay,
                    actualOperatingProfit: oRow.actualOperatingProfit,
                    operatingProfitDiff: oRow.operatingProfitDiff,
                    actualOperatingProfitText: oRow.actualOperatingProfitText,
                    operatingProfitDiffText: oRow.operatingProfitDiffText,
                    operatingProfitDiffState: oRow.operatingProfitDiffState,
                    waers: oRow.waers
                };
            });
        },

        _buildProfitCenterChart: function (aRows) {
            var aRankingRows = this._buildActualPlanRankingRows(aRows, {
                hasPlanData: this._rowsHaveAnyNonZeroNumber(aRows, [
                    "planSales",
                    "planCogs",
                    "planSga",
                    "planOperatingProfit"
                ])
            });
            var aTop = aRankingRows.slice(0, 5);
            var aBottom = aRankingRows.slice().reverse().slice(0, 5);
            var mSeen = {};

            return aTop.concat(aBottom).filter(function (oGroup) {
                var sKey = oGroup.orgGroupKey || oGroup.prctr;
                if (mSeen[sKey]) {
                    return false;
                }
                mSeen[sKey] = true;
                return true;
            }).sort(function (oLeft, oRight) {
                return this._sortNumber(oRight.actualOperatingProfit) - this._sortNumber(oLeft.actualOperatingProfit) ||
                    String(oLeft.profitCenter || "").localeCompare(String(oRight.profitCenter || ""));
            }.bind(this));
        },

        _buildActualPlanVarianceChart: function (aRows, oPlanState) {
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);
            var aItems;

            if (!bHasPlanData) {
                return [];
            }

            aItems = [{
                item: "매출 차이",
                category: "revenue",
                diff: this._sum(aRows, "salesDiff"),
                state: this._profitDifferenceState(this._sum(aRows, "salesDiff"), bHasPlanData)
            }, {
                item: "매출원가 차이",
                category: "cost",
                diff: this._sum(aRows, "cogsDiff"),
                state: this._costDifferenceState(this._sum(aRows, "cogsDiff"), bHasPlanData)
            }, {
                item: "판관비 차이",
                category: "cost",
                diff: this._sum(aRows, "sgaDiff"),
                state: this._costDifferenceState(this._sum(aRows, "sgaDiff"), bHasPlanData)
            }, {
                item: "제조/차이 계정 차이",
                category: "cost",
                diff: this._sum(aRows, "varianceDiff"),
                state: this._costDifferenceState(this._sum(aRows, "varianceDiff"), bHasPlanData)
            }, {
                item: "영업이익 차이",
                category: "profit",
                diff: this._sum(aRows, "operatingProfitDiff"),
                state: this._profitDifferenceState(this._sum(aRows, "operatingProfitDiff"), bHasPlanData),
                isTotal: true
            }].filter(function (oItem) {
                return this._isFiniteNumber(oItem.diff);
            }.bind(this));

            return aItems.map(function (oItem) {
                oItem.diffText = this._amountText(oItem.diff, this._firstText(aRows, "waers"));
                return oItem;
            }.bind(this));
        },

        _findActualPlanMajorCause: function (aVarianceRows) {
            var aCandidates = (aVarianceRows || []).filter(function (oItem) {
                return !oItem.isTotal && this._isFiniteNumber(oItem.diff);
            }.bind(this));
            var oCause = aCandidates.sort(function (oLeft, oRight) {
                return Math.abs(Number(oRight.diff)) - Math.abs(Number(oLeft.diff));
            })[0];

            if (!oCause) {
                return {};
            }

            return {
                title: oCause.item,
                text: oCause.item.replace(" 차이", "") + "가 전체 차이의 핵심 원인입니다.",
                amountText: oCause.diffText,
                state: oCause.state
            };
        },

        _setActualPlanSelection: function (oRow, oPlanState) {
            var oState = oPlanState || {
                hasPlanData: this._oViewModel.getProperty("/hasPlanData")
            };

            if (!oRow) {
                this._oViewModel.setProperty("/actualPlanSelectedRow", null);
                this._oViewModel.setProperty("/actualPlanSelectedTitle", "선택된 조직 없음");
                this._oViewModel.setProperty("/actualPlanSelectedPlRows", []);
                this._oViewModel.setProperty("/actualPlanSelectedCause", {});
                return;
            }

            this._decorateActualPlanDisplayFields(oRow, oState);
            this._oViewModel.setProperty("/actualPlanSelectedRow", oRow);
            this._oViewModel.setProperty("/actualPlanSelectedTitle", [
                oRow.profitCenter || oRow.pcgDisplay || oRow.prctrDisplay,
                oRow.fkberDisplay,
                oRow.monat ? Number(oRow.monat) + "월" : ""
            ].filter(function (sValue) {
                return sValue && sValue !== "-";
            }).join(" / ") || "-");
            this._oViewModel.setProperty("/actualPlanSelectedPlRows", this._buildActualPlanSelectedPlRows(oRow, oState));
            this._oViewModel.setProperty("/actualPlanSelectedCause", this._findActualPlanMajorCause(
                this._buildActualPlanVarianceChart([oRow], oState)
            ));
        },

        _buildActualPlanSelectedPlRows: function (oRow, oPlanState) {
            var bHasPlanData = !!(oPlanState && oPlanState.hasPlanData);

            return [{
                item: "매출",
                actualText: this._amountText(oRow.actualSales, oRow.waers),
                planText: this._comparisonAmountText(oRow.planSales, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.salesDiff, oRow.waers, bHasPlanData),
                state: this._profitDifferenceState(oRow.salesDiff, bHasPlanData)
            }, {
                item: "매출원가",
                actualText: this._amountText(oRow.actualCogs, oRow.waers),
                planText: this._comparisonAmountText(oRow.planCogs, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.cogsDiff, oRow.waers, bHasPlanData),
                state: this._costDifferenceState(oRow.cogsDiff, bHasPlanData)
            }, {
                item: "매출총이익",
                actualText: this._amountText(oRow.actualGrossProfit, oRow.waers),
                planText: this._comparisonAmountText(oRow.planGrossProfit, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.grossProfitDiff, oRow.waers, bHasPlanData),
                state: this._profitDifferenceState(oRow.grossProfitDiff, bHasPlanData)
            }, {
                item: "판관비",
                actualText: this._amountText(oRow.actualSga, oRow.waers),
                planText: this._comparisonAmountText(oRow.planSga, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.sgaDiff, oRow.waers, bHasPlanData),
                state: this._costDifferenceState(oRow.sgaDiff, bHasPlanData)
            }, {
                item: "제조/차이",
                actualText: this._amountText(oRow.actualVariance, oRow.waers),
                planText: this._comparisonAmountText(oRow.planVariance, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.varianceDiff, oRow.waers, bHasPlanData),
                state: this._costDifferenceState(oRow.varianceDiff, bHasPlanData)
            }, {
                item: "영업이익",
                actualText: this._amountText(oRow.actualOperatingProfit, oRow.waers),
                planText: this._comparisonAmountText(oRow.planOperatingProfit, oRow.waers, bHasPlanData),
                diffText: this._comparisonAmountText(oRow.operatingProfitDiff, oRow.waers, bHasPlanData),
                state: this._profitDifferenceState(oRow.operatingProfitDiff, bHasPlanData),
                emphasized: true
            }, {
                item: "영업이익률",
                actualText: formatter.percent(oRow.actualOperatingProfitRate),
                planText: this._comparisonPercentText(oRow.planOperatingProfitRate, bHasPlanData),
                diffText: "-",
                state: "None"
            }];
        },

        _buildActualPlanFilterSummary: function () {
            var oFilters = this._oViewModel.getProperty("/filters") || {};
            var sOrgText = [oFilters.segment, oFilters.prctr, oFilters.fkber === "__SALES__" ? "판매" : oFilters.fkber]
                .filter(Boolean)
                .join(" / ") || "전체 조직";

            return [
                (oFilters.fiscalYear || "-") + "년",
                (oFilters.month ? Number(oFilters.month) + "월" : "-"),
                "계획 " + (oFilters.planVersion || "-"),
                sOrgText
            ].join(" · ");
        },

        _buildActualPlanValueHelp: function (aRows) {
            return {
                segments: this._buildUniqueOptions(aRows, "segment", "segmentDisplay"),
                profitCenters: this._buildUniqueOptions(aRows, "prctr", "prctrDisplay"),
                functionalAreas: this._buildUniqueOptions(aRows, "fkberGroupKey", "fkberGroupDisplay")
            };
        },

        _buildUniqueOptions: function (aRows, sKeyProperty, sTextProperty) {
            var mOptions = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = this._cleanText(oRow[sKeyProperty]);
                var sText = this._cleanText(oRow[sTextProperty]);

                if (!sKey) {
                    return;
                }
                if (!mOptions[sKey]) {
                    mOptions[sKey] = {
                        key: sKey,
                        text: sText || sKey
                    };
                } else if ((!mOptions[sKey].text || mOptions[sKey].text === sKey) && sText) {
                    mOptions[sKey].text = sText;
                }
            }.bind(this));

            return Object.keys(mOptions).map(function (sKey) {
                return mOptions[sKey];
            }).sort(function (oLeft, oRight) {
                return String(oLeft.text || "").localeCompare(String(oRight.text || ""));
            });
        },

        _rowsHaveAnyNumber: function (aRows, aProperties) {
            return (aRows || []).some(function (oRow) {
                return aProperties.some(function (sProperty) {
                    return this._isFiniteNumber(oRow[sProperty]);
                }.bind(this));
            }.bind(this));
        },

        _rowsHaveAnyNonZeroNumber: function (aRows, aProperties) {
            return (aRows || []).some(function (oRow) {
                return aProperties.some(function (sProperty) {
                    return this._isFiniteNumber(oRow[sProperty]) && Number(oRow[sProperty]) !== 0;
                }.bind(this));
            }.bind(this));
        },

        _hasRentalProductRows: function (aRows) {
            return (aRows || []).some(function (oRow) {
                return !!(this._cleanText(oRow.matnr) ||
                    this._cleanText(oRow.mtopt) ||
                    this._cleanText(oRow.maktx) ||
                    this._cleanText(oRow.mtopt_t));
            }.bind(this));
        },

        _buildSegmentShareChart: function (aRows) {
            var mBySegment = {};
            var fTotal = 0;

            aRows.filter(function (oRow) {
                return oRow.segment &&
                    this._isFiniteNumber(oRow.actualSales) &&
                    oRow.actualSales !== 0;
            }.bind(this)).forEach(function (oRow) {
                var sSegment = String(oRow.segment).trim();
                var sSegmentText = this._cleanText(oRow.segment_txt);
                var fAmount = Math.abs(Number(oRow.actualSales));

                if (!mBySegment[sSegment]) {
                    mBySegment[sSegment] = {
                        segment: sSegment,
                        segment_txt: sSegmentText,
                        segmentDisplay: this._formatTextOnly(sSegmentText),
                        amount: 0,
                        share: null,
                        waers: oRow.waers || ""
                    };
                } else if (!mBySegment[sSegment].segment_txt && sSegmentText) {
                    mBySegment[sSegment].segment_txt = sSegmentText;
                    mBySegment[sSegment].segmentDisplay = this._formatTextOnly(sSegmentText);
                }

                mBySegment[sSegment].amount += fAmount;
                fTotal += fAmount;
            }.bind(this));

            if (!fTotal) {
                return [];
            }

            return Object.keys(mBySegment).map(function (sSegment) {
                var oSegment = mBySegment[sSegment];
                oSegment.share = oSegment.amount / fTotal;
                oSegment.sharePercent = oSegment.share * 100;
                return oSegment;
            }).sort(function (oLeft, oRight) {
                return oRight.amount - oLeft.amount;
            });
        },

        _setProductError: function (sMessage) {
            this._oViewModel.setProperty("/productRows", []);
            this._oViewModel.setProperty("/topRows", []);
            this._oViewModel.setProperty("/cockpitTopRows", []);
            this._oViewModel.setProperty("/monthlyChart", []);
            this._oViewModel.setProperty("/segmentShareChart", []);
            this._oViewModel.setProperty("/adminAllocationChart", []);
            this._oViewModel.setProperty("/rentalSummaryChart", []);
            this._oViewModel.setProperty("/salesSummaryChart", []);
            this._oViewModel.setProperty("/rentalSummaryInfoText", this._defaultRentalSummaryInfoText());
            this._oViewModel.setProperty("/segmentShareMessage", sMessage);
            this._oViewModel.setProperty("/summaryMessage", sMessage);
            this._oViewModel.setProperty("/structureChart", []);
            this._oViewModel.setProperty("/marginChart", []);
            this._oViewModel.setProperty("/kpi", this._emptyProductKpi());
            this._oViewModel.setProperty("/hasProductData", false);
            this._oViewModel.setProperty("/productMessage", sMessage);
            this._refreshProductProfitChartReferenceLines();
            MessageToast.show(sMessage);
        },

        _setActualPlanError: function (sMessage) {
            this._oViewModel.setProperty("/actualPlanRows", []);
            this._oViewModel.setProperty("/actualPlanMonthlyChart", []);
            this._oViewModel.setProperty("/actualPlanMonthlySingle", {});
            this._oViewModel.setProperty("/actualPlanMonthlyMode", "single");
            this._oViewModel.setProperty("/actualPlanProfitCenterChart", []);
            this._oViewModel.setProperty("/actualPlanRevenueOrgChart", []);
            this._oViewModel.setProperty("/actualPlanSupportCostChart", []);
            this._oViewModel.setProperty("/actualPlanOrgDetailRows", []);
            this._oViewModel.setProperty("/actualPlanOrgComparisonRows", []);
            this._oViewModel.setProperty("/actualPlanManagementPoints", []);
            this._oViewModel.setProperty("/actualPlanVarianceChart", []);
            this._oViewModel.setProperty("/actualPlanFinancialFlow", []);
            this._oViewModel.setProperty("/actualPlanProfitLossStructure", []);
            this._oViewModel.setProperty("/actualPlanCompositionChart", []);
            this._oViewModel.setProperty("/actualPlanOrgSummary", {});
            this._oViewModel.setProperty("/actualPlanHasProfitLossStructure", false);
            this._oViewModel.setProperty("/actualPlanHasOrgData", false);
            this._oViewModel.setProperty("/actualPlanShowPlanComparison", false);
            this._oViewModel.setProperty("/actualPlanShowActualOnly", true);
            this._oViewModel.setProperty("/actualPlanTopRows", []);
            this._oViewModel.setProperty("/actualPlanBottomRows", []);
            this._oViewModel.setProperty("/actualPlanMatrixCells", []);
            this._oViewModel.setProperty("/actualPlanSelectedRow", null);
            this._oViewModel.setProperty("/actualPlanSelectedTitle", "");
            this._oViewModel.setProperty("/actualPlanSelectedPlRows", []);
            this._oViewModel.setProperty("/actualPlanSelectedCause", {});
            this._oViewModel.setProperty("/actualPlanPlanMessage", "");
            this._oViewModel.setProperty("/actualPlanValueHelp", {
                segments: [],
                profitCenters: [],
                functionalAreas: []
            });
            this._oViewModel.setProperty("/segmentShareChart", []);
            this._oViewModel.setProperty("/summaryMessage", "");
            this._oViewModel.setProperty("/actualPlanKpi", this._emptyActualPlanKpi());
            this._oViewModel.setProperty("/hasActualPlanData", false);
            this._oViewModel.setProperty("/hasPlanData", false);
            this._oViewModel.setProperty("/actualPlanMessage", sMessage);
            this._oViewModel.setProperty("/segmentShareMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _setDrilldownError: function (sMessage) {
            this._oViewModel.setProperty("/drilldownRows", []);
            this._oViewModel.setProperty("/drilldownMessage", sMessage);
            MessageToast.show(sMessage);
        },

        _formatODataError: function (oError, sFallbackMessage) {
            var sMessage = oError && oError.message || sFallbackMessage;
            var oPayload;
            var sResponseText = oError && (oError.responseText || oError.body);
            var sStatus = oError && (oError.statusCode || oError.status || oError.statusText);

            try {
                oPayload = sResponseText ? JSON.parse(sResponseText) : null;
                sMessage = oPayload && oPayload.error && oPayload.error.message &&
                    (oPayload.error.message.value || oPayload.error.message) || sMessage;
            } catch (e) {
                if (sResponseText && sResponseText.indexOf("<html") !== 0) {
                    sMessage = sResponseText;
                }
            }

            if (sStatus && sMessage.indexOf(String(sStatus)) === -1) {
                sMessage += " (" + sStatus + ")";
            }

            return sMessage;
        },

        _decorateJournalRow: function (oRow) {
            var oMapped = this._decorateOrgText(this._decorateProductText(oRow));
            var oRole = this._accountRoleInfo(this._readField(oMapped, "racct"));

            oMapped.accountRoleKey = oRole.key;
            oMapped.accountRoleText = oRole.text;
            oMapped.accountRoleDetail = oRole.detail;
            oMapped.isFinalManufacturingAccount = oRole.finalManufacturing;
            oMapped.isSourceActualAccount = oRole.sourceActual;
            oMapped.processStepInfo = this._accountProcessStepInfo(this._readField(oMapped, "racct"), oMapped, oRole);
            oMapped.processStepText = oMapped.processStepInfo.text;
            oMapped.processStepDetail = oMapped.processStepInfo.detail;
            oMapped.finalManufacturingText = oMapped.processStepInfo.finalManufacturingRelevant ? "반영" : "미반영";

            return oMapped;
        },

        _sortJournalRows: function (aRows) {
            return (aRows || []).slice().sort(function (oLeft, oRight) {
                return this._journalRoleRank(oLeft.accountRoleKey) - this._journalRoleRank(oRight.accountRoleKey) ||
                    String(oLeft.budat || "").localeCompare(String(oRight.budat || "")) ||
                    String(oLeft.belnr || "").localeCompare(String(oRight.belnr || "")) ||
                    String(oLeft.docln || "").localeCompare(String(oRight.docln || ""));
            }.bind(this));
        },

        _journalRoleRank: function (sRoleKey) {
            var mRank = {
                REVENUE: 0,
                COGS: 1,
                SGA: 2,
                MATERIAL: 3,
                MANUFACTURING_RECEIPT: 4,
                STANDARD_PROCESSING: 5,
                PRODUCTION_ABSORPTION: 6,
                ALLOCATION_VARIANCE: 7,
                PRICE_VARIANCE: 8,
                SOURCE_ACTUAL: 9,
                SOURCE_ACTUAL_EXCLUDED: 10,
                OTHER: 99
            };

            return mRank[sRoleKey] !== undefined ? mRank[sRoleKey] : 99;
        },

        _decorateProductText: function (oRow) {
            var oMapped = Object.assign({}, oRow);
            var sMatnr = this._readField(oMapped, "matnr");
            var sMtopt = this._readField(oMapped, "mtopt");
            var sMaktx = this._readField(oMapped, "maktx");
            var sMtoptText = this._readField(oMapped, "mtopt_t");
            var sMtart = this._readField(oMapped, "mtart");
            var sMtbez = this._readField(oMapped, "mtbez");
            var sMatkl = this._readField(oMapped, "matkl");
            var sWgbez = this._readField(oMapped, "wgbez");
            var sMatMeins = this._readField(oMapped, "mat_meins");

            oMapped.maktx = sMaktx;
            oMapped.mtopt_t = sMtoptText;
            oMapped.mtart = sMtart;
            oMapped.mtbez = sMtbez;
            oMapped.matkl = sMatkl;
            oMapped.wgbez = sWgbez;
            oMapped.mat_meins = sMatMeins;
            oMapped.productDisplay = this._formatTextOnly(sMaktx);
            oMapped.optionDisplay = this._formatOptionText(sMtopt, sMtoptText);
            oMapped.materialTypeDisplay = this._formatTextOnly(sMtbez);
            oMapped.materialGroupDisplay = this._formatTextOnly(sWgbez);
            oMapped.productOptionDisplay = [oMapped.productDisplay, oMapped.optionDisplay]
                .filter(function (sValue) {
                    return sValue && sValue !== "-";
                })
                .join(" / ") || "-";
            oMapped.productKey = oMapped.productOptionDisplay;

            return oMapped;
        },

        _decorateRentalProductText: function (oRow) {
            var oMapped = Object.assign({}, oRow);
            var sMatnr = this._cleanText(this._readField(oMapped, "matnr"));
            var sMtopt = this._cleanText(this._readField(oMapped, "mtopt"));
            var sMaktx = this._cleanText(this._readField(oMapped, "maktx"));
            var sMtoptText = this._cleanText(this._readField(oMapped, "mtopt_t"));
            var sMtart = this._cleanText(this._readField(oMapped, "mtart"));
            var sMtbez = this._cleanText(this._readField(oMapped, "mtbez"));
            var sMatkl = this._cleanText(this._readField(oMapped, "matkl"));
            var sWgbez = this._cleanText(this._readField(oMapped, "wgbez"));
            var sMatMeins = this._cleanText(this._readField(oMapped, "mat_meins"));

            oMapped.matnr = sMatnr;
            oMapped.mtopt = sMtopt;
            oMapped.maktx = sMaktx;
            oMapped.mtopt_t = sMtoptText;
            oMapped.mtart = sMtart;
            oMapped.mtbez = sMtbez;
            oMapped.matkl = sMatkl;
            oMapped.wgbez = sWgbez;
            oMapped.mat_meins = sMatMeins;
            oMapped.productDisplay = sMaktx || sMatnr;
            oMapped.optionDisplay = sMtoptText || sMtopt;
            oMapped.materialTypeDisplay = sMtbez || sMtart;
            oMapped.materialGroupDisplay = sWgbez || sMatkl;
            oMapped.productOptionDisplay = [oMapped.productDisplay, oMapped.optionDisplay].filter(Boolean).join(" / ");
            oMapped.productKey = oMapped.productOptionDisplay;

            return oMapped;
        },

        _decorateOrgText: function (oRow) {
            var oMapped = Object.assign({}, oRow);
            var sSegment = this._readField(oMapped, "segment");
            var sSegmentText = this._readField(oMapped, "segment_txt");
            var sPrctr = this._readField(oMapped, "prctr");
            var sPrctrText = this._readField(oMapped, "prctr_txt");
            var sPcg = this._readField(oMapped, "pcg");
            var sFkber = this._readField(oMapped, "fkber");
            var sFkbtx = this._readField(oMapped, "fkbtx");
            var sFkberText = this._readField(oMapped, "fkber_txt");
            var sFkberDisplayText = sFkbtx || sFkberText;

            oMapped.segment = sSegment;
            oMapped.segment_txt = sSegmentText;
            oMapped.prctr = sPrctr;
            oMapped.prctr_txt = sPrctrText;
            oMapped.pcg = sPcg;
            oMapped.fkber = sFkber;
            oMapped.fkbtx = sFkbtx;
            oMapped.fkber_txt = sFkberText;
            oMapped.fkberTextDisplay = sFkberDisplayText;
            oMapped.segmentDisplay = this._formatTextOnly(sSegmentText);
            oMapped.prctrDisplay = this._formatTextOnly(sPrctrText);
            oMapped.pcgDisplay = sPcg || oMapped.prctrDisplay;
            oMapped.fkberDisplay = this._formatTextOnly(sFkberDisplayText);
            var oOrgGroup = this._deriveActualPlanOrgGroup(oMapped);
            oMapped.orgGroupKey = oOrgGroup.key;
            oMapped.orgGroupDisplay = oOrgGroup.display;

            return oMapped;
        },

        _deriveActualPlanOrgGroup: function (oRow) {
            var sPrctr = this._cleanText(oRow.prctr).toUpperCase();
            var sPrctrText = this._cleanText(oRow.prctrDisplay || oRow.prctr_txt);
            var sFkber = this._cleanText(oRow.fkber);
            var sFkberText = this._cleanText(oRow.fkberDisplay || oRow.fkberTextDisplay || oRow.fkbtx || oRow.fkber_txt);
            var sSegment = this._cleanText(oRow.segment);
            var aSalesMatch;
            var aProductionMatch;
            var sGroupNumber;

            if (sFkber === "3000" || sFkberText.indexOf("물류") > -1 || sPrctrText.indexOf("물류") > -1 || /^PC_MM/.test(sPrctr)) {
                return {
                    key: "LOGISTICS",
                    display: "물류팀"
                };
            }

            aSalesMatch = sPrctr.match(/^PC_SD(?:0([1-5])|1([1-5]))$/) || sPrctrText.match(/영업\s*([1-5])팀/);
            if (aSalesMatch) {
                sGroupNumber = aSalesMatch[1] || aSalesMatch[2];
                return {
                    key: "SALES_" + sGroupNumber,
                    display: "영업 " + sGroupNumber + "팀 그룹"
                };
            }

            aProductionMatch = sPrctr.match(/^PC_PP(?:0([1-5])|1([1-5]))$/) || sPrctrText.match(/생산\s*([1-5])팀/);
            if (aProductionMatch) {
                sGroupNumber = aProductionMatch[1] || aProductionMatch[2];
                return {
                    key: "PRODUCTION_" + sGroupNumber,
                    display: "생산 " + sGroupNumber + "팀 그룹"
                };
            }

            if (sPrctr === "PC_RT" || sPrctrText.indexOf("렌탈") > -1 || sFkberText.indexOf("렌탈") > -1 || sSegment === "2000") {
                return {
                    key: "RENTAL_SALES",
                    display: "렌탈영업팀"
                };
            }

            if (sFkber === "4000" || sFkberText.indexOf("관리") > -1) {
                return {
                    key: "COMMON_ADMIN",
                    display: "공통관리팀"
                };
            }

            return {
                key: this._cleanText(oRow.prctr || oRow.pcg || oRow.segment || "-"),
                display: sPrctrText || oRow.pcgDisplay || oRow.segmentDisplay || "-"
            };
        },

        _formatProductKey: function (oRow) {
            return [this._readField(oRow, "matnr"), this._readField(oRow, "mtopt")].filter(Boolean).join(" / ") || "-";
        },

        _journalDetailTypeText: function (sDetailType) {
            var mText = {
                SALES: "판매매출 전표 상세",
                COGS: "판매매출원가 전표 상세",
                VAR: "제조/차이 전표 상세",
                ALL: "제품/옵션 전체 전표 상세"
            };

            return mText[sDetailType] || mText.ALL;
        },

        _formatOptionText: function (sOptionCode, sOptionText) {
            var sCleanCode = this._cleanText(sOptionCode);
            var sCleanText = this._cleanText(sOptionText);

            if (sCleanText) {
                return sCleanText;
            }

            return sCleanCode || "기본 옵션";
        },

        _formatTextOnly: function (sText) {
            var sCleanText = this._cleanText(sText);

            return sCleanText || "-";
        },

        _fillMissingText: function (oTarget, oSource, aProperties) {
            aProperties.forEach(function (sProperty) {
                if (!oTarget[sProperty] && oSource[sProperty]) {
                    oTarget[sProperty] = oSource[sProperty];
                }
            });
        },

        _readField: function (oRow, sFieldName) {
            var sTargetFieldName;
            var sMatchedKey;

            if (!oRow) {
                return "";
            }
            if (oRow[sFieldName] !== undefined && oRow[sFieldName] !== null) {
                return oRow[sFieldName];
            }

            sTargetFieldName = String(sFieldName || "").toLowerCase();
            sMatchedKey = Object.keys(oRow).find(function (sKey) {
                return sKey.toLowerCase() === sTargetFieldName;
            });

            return sMatchedKey && oRow[sMatchedKey] !== null ? oRow[sMatchedKey] : "";
        },

        _accountRoleInfo: function (vAccount) {
            var sAccount = this._cleanText(vAccount).toUpperCase();
            var iAccount = Number(sAccount);
            var mRoles = {
                "800015": { key: "MATERIAL", text: "재료비", detail: "최종 제조원가 반영", finalManufacturing: true },
                "800016": { key: "MANUFACTURING_RECEIPT", text: "제조입고", detail: "최종 제조원가 차감", finalManufacturing: true },
                "800020": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "노무비배부", finalManufacturing: true },
                "800021": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "기계경비배부", finalManufacturing: true },
                "800022": { key: "STANDARD_PROCESSING", text: "표준/귀속 가공비", detail: "간접비배부", finalManufacturing: true },
                "800023": { key: "PRICE_VARIANCE", text: "가격차이", detail: "가격차이 영역 전용", finalManufacturing: false },
                "800024": { key: "ALLOCATION_VARIANCE", text: "배부차이", detail: "실제 분할원가와 표준/귀속 가공비 차이", finalManufacturing: true }
            };

            if (mRoles[sAccount]) {
                return Object.assign({
                    sourceActual: false
                }, mRoles[sAccount]);
            }

            if (/^4/.test(sAccount)) {
                return {
                    key: "REVENUE",
                    text: "매출",
                    detail: "수익/매출 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^6/.test(sAccount)) {
                return {
                    key: "COGS",
                    text: "매출원가",
                    detail: "매출원가 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^7/.test(sAccount)) {
                return {
                    key: "SGA",
                    text: "판관비",
                    detail: "판매관리비 전표",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
                return {
                    key: sAccount === "800008" ? "SOURCE_ACTUAL_EXCLUDED" : "SOURCE_ACTUAL",
                    text: sAccount === "800008" ? "원천 실제비용(분할 제외)" : "원천 실제비용",
                    detail: sAccount === "800008" ? "현재 데이터 기준 배부/분할 제외" : "활동단가/배부차이 산출 원천",
                    finalManufacturing: false,
                    sourceActual: true
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800019) {
                return {
                    key: "PRODUCTION_ABSORPTION",
                    text: "생산실적 차감/흡수",
                    detail: "일반 배부 원천/수신 제외",
                    finalManufacturing: false,
                    sourceActual: false
                };
            }

            return {
                key: "OTHER",
                text: "기타",
                detail: "",
                finalManufacturing: false,
                sourceActual: false
            };
        },

        _accountProcessStepInfo: function (vAccount, oRow, oRole) {
            var sAccount = this._cleanText(vAccount).toUpperCase();
            var iAccount = Number(sAccount);
            var bFinalRelevant = !!(oRole && oRole.finalManufacturing);
            var bAllocation = this._isAllocationJournalRow(oRow);
            var bSplit = this._isSplitJournalRow(oRow);

            if (/^4/.test(sAccount)) {
                return {
                    key: "REVENUE_POSTING",
                    text: "수익전표",
                    detail: "매출/수익 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^6/.test(sAccount)) {
                return {
                    key: "COGS_POSTING",
                    text: "매출원가",
                    detail: "매출원가 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^7/.test(sAccount)) {
                return {
                    key: "SGA_POSTING",
                    text: "판관비",
                    detail: "판매관리비 인식",
                    finalManufacturingRelevant: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
                if (bSplit && sAccount !== "800008") {
                    return {
                        key: "ACTIVITY_SPLIT",
                        text: "활동유형 분할",
                        detail: "800001~800014 중 800008 제외 원천비용 분할",
                        finalManufacturingRelevant: false
                    };
                }

                if (bAllocation) {
                    return {
                        key: "INTER_DEPT_ALLOCATION",
                        text: "부서 간 배부",
                        detail: "원천 비용 성격을 유지한 책임부서 이동",
                        finalManufacturingRelevant: false
                    };
                }

                return {
                    key: sAccount === "800008" ? "SOURCE_COST_EXCLUDED" : "SOURCE_COST",
                    text: "원천 비용 발생",
                    detail: sAccount === "800008" ? "분할/배부 대상 제외 원천비용" : "실제 제조비용 Pool",
                    finalManufacturingRelevant: false
                };
            }

            if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800022) {
                return {
                    key: "PRODUCTION_ATTRIBUTION",
                    text: "생산실적 귀속",
                    detail: iAccount >= 800020 ? "표준/생산실적 가공비 귀속" : "생산실적 차감/흡수",
                    finalManufacturingRelevant: bFinalRelevant
                };
            }

            if (sAccount === "800023") {
                return {
                    key: "PRICE_VARIANCE",
                    text: "가격차이",
                    detail: "가격차이 포함/별도 기준 확인 대상",
                    finalManufacturingRelevant: false
                };
            }

            if (sAccount === "800024") {
                return {
                    key: "ALLOCATION_VARIANCE",
                    text: "배부차이",
                    detail: "실제 분할원가와 표준/귀속 가공비 차이",
                    finalManufacturingRelevant: true
                };
            }

            if (sAccount === "800015" || sAccount === "800016") {
                return {
                    key: "FINAL_MFG_COST",
                    text: "최종 제조원가 반영",
                    detail: sAccount === "800016" ? "제조입고 차감" : "원재료비 반영",
                    finalManufacturingRelevant: true
                };
            }

            if (bAllocation) {
                return {
                    key: "INTER_DEPT_ALLOCATION",
                    text: "부서 간 배부",
                    detail: "비용 책임부서 이동",
                    finalManufacturingRelevant: false
                };
            }

            return {
                key: "OTHER",
                text: "기타",
                detail: "",
                finalManufacturingRelevant: bFinalRelevant
            };
        },

        _isAllocationJournalRow: function (oRow) {
            var sText = [
                this._readField(oRow, "cost_flow_type"),
                this._readField(oRow, "cost_flow_type_txt"),
                this._readField(oRow, "blart"),
                this._readField(oRow, "blart_txt"),
                this._readField(oRow, "sgtxt")
            ].map(this._cleanText, this).join(" ");

            return sText.toUpperCase().indexOf("ALLOC") > -1 || sText.indexOf("배부") > -1;
        },

        _isSplitJournalRow: function (oRow) {
            var sBlart = this._cleanText(this._readField(oRow, "blart")).toUpperCase();
            var sText = [
                this._readField(oRow, "cost_flow_type"),
                this._readField(oRow, "cost_flow_type_txt"),
                this._readField(oRow, "blart_txt"),
                this._readField(oRow, "sgtxt")
            ].map(this._cleanText, this).join(" ");

            return sText.toUpperCase().indexOf("SPLIT") > -1 || sText.indexOf("분할") > -1 || sBlart === "ZA";
        },

        _cleanText: function (vValue) {
            return vValue === null || vValue === undefined ? "" : String(vValue).trim();
        },

        _sum: function (aRows, sProperty) {
            var bHasNumber = false;
            var fSum = aRows.reduce(function (fTotal, oRow) {
                if (!this._isFiniteNumber(oRow[sProperty])) {
                    return fTotal;
                }
                bHasNumber = true;
                return fTotal + oRow[sProperty];
            }.bind(this), 0);

            return bHasNumber ? fSum : null;
        },

        _sumFiniteValues: function (aValues) {
            var bHasNumber = false;
            var fSum = (aValues || []).reduce(function (fTotal, vValue) {
                if (!this._isFiniteNumber(vValue)) {
                    return fTotal;
                }
                bHasNumber = true;
                return fTotal + Math.abs(Number(vValue));
            }.bind(this), 0);

            return bHasNumber ? fSum : null;
        },

        _firstNumber: function (aRows, sProperty) {
            var oRow = aRows.filter(function (oCandidate) {
                return this._isFiniteNumber(oCandidate[sProperty]);
            }.bind(this))[0];

            return oRow ? oRow[sProperty] : null;
        },

        _firstText: function (aRows, sProperty) {
            var oRow = aRows.filter(function (oCandidate) {
                return oCandidate[sProperty];
            })[0];

            return oRow ? oRow[sProperty] : "";
        },

        _addNullable: function (vCurrent, vAdd) {
            if (!this._isFiniteNumber(vAdd)) {
                return vCurrent;
            }
            return (this._isFiniteNumber(vCurrent) ? vCurrent : 0) + vAdd;
        },

        _diffOrExisting: function (vActual, vPlan, vExisting) {
            if (this._isFiniteNumber(vActual) && this._isFiniteNumber(vPlan)) {
                return Number(vActual) - Number(vPlan);
            }
            return this._isFiniteNumber(vExisting) ? vExisting : null;
        },

        _ratioOrExisting: function (vNumerator, vDenominator, vExisting) {
            if (this._isFiniteNumber(vNumerator) &&
                    this._isFiniteNumber(vDenominator) &&
                    Number(vDenominator) !== 0) {
                return Number(vNumerator) / Number(vDenominator);
            }
            return this._isFiniteNumber(vExisting) ? vExisting : null;
        },

        _safeNumber: function (vValue) {
            return this._isFiniteNumber(vValue) ? Number(vValue) : 0;
        },

        _toNumber: function (vValue) {
            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            var fValue = Number(vValue);
            return isFinite(fValue) ? fValue : null;
        },

        _normalizeVarianceAmount: function (vValue, sCurrency) {
            var fValue = this._toNumber(vValue);

            if (fValue === null) {
                return null;
            }

            return String(sCurrency || "").toUpperCase() === "KRW" ? fValue / 100 : fValue;
        },

        _isFiniteNumber: function (vValue) {
            return vValue !== null && vValue !== undefined && isFinite(Number(vValue));
        },

        _sortNumber: function (vValue) {
            return this._isFiniteNumber(vValue) ? Number(vValue) : Number.NEGATIVE_INFINITY;
        },

        _connectChartPopovers: function () {
            if (!this.byId) {
                return;
            }

            [
                "cockpitShareChart",
                "cockpitAdminAllocationChart",
                "cockpitRentalSummaryChart",
                "cockpitStructureChart",
                "cockpitOverallStructureChart",
                "cockpitProductGroupChart",
                "rentalProfitTreemapChart",
                "rentalMonthlyChart",
                "rentalCostChart",
                "rentalSummaryChart",
                "rentalOrgChart",
                "rentalProductChart",
                "productProfitChart",
                "productMarginChart",
                "actualPlanMonthlyChart",
                "actualPlanMonthlyActualChart",
                "actualPlanProfitCenterChart",
                "actualPlanSupportCostChart",
                "actualPlanVarianceChart",
                "actualPlanCompositionChart"
            ].forEach(function (sId) {
                var oChart = this.byId(sId);
                var sVizUid = oChart && oChart.getVizUid && oChart.getVizUid();

                if (!sVizUid) {
                    return;
                }

                this._mChartPopovers = this._mChartPopovers || {};
                if (!this._mChartPopovers[sId]) {
                    this._mChartPopovers[sId] = new VizPopover({});
                    this.getView().addDependent(this._mChartPopovers[sId]);
                }
                if (sId === "rentalProfitTreemapChart" && this._mChartPopovers[sId].setFormatString) {
                    this._mChartPopovers[sId].setFormatString({
                        "금액": "compactKoreanAmount",
                        "매출대비비율": "percentPoint2"
                    });
                }
                this._mChartPopovers[sId].connect(sVizUid);
            }.bind(this));
        },

        _applyChartProperties: function () {
            var aChartIds = [
                "cockpitShareChart",
                "cockpitAdminAllocationChart",
                "cockpitRentalSummaryChart",
                "cockpitStructureChart",
                "cockpitOverallStructureChart",
                "cockpitProductGroupChart",
                "rentalProfitTreemapChart",
                "rentalMonthlyChart",
                "rentalCostChart",
                "rentalSummaryChart",
                "rentalOrgChart",
                "rentalProductChart",
                "productProfitChart",
                "productMarginChart",
                "actualPlanMonthlyChart",
                "actualPlanMonthlyActualChart",
                "actualPlanProfitCenterChart",
                "actualPlanSupportCostChart",
                "actualPlanVarianceChart",
                "actualPlanCompositionChart"
            ];
            var mProperties = {
                title: {
                    visible: false
                },
                legend: {
                    visible: true
                },
                plotArea: {
                    dataLabel: {
                        visible: true,
                        hideWhenOverlap: true,
                        style: {
                            color: "#22304a",
                            fontWeight: "bold"
                        }
                    },
                    drawingEffect: "glossy",
                    colorPalette: ["#0A6ED1", "#6F42C1", "#107E3E", "#E9730C", "#BB0000", "#008080", "#925ACE", "#0F828F"]
                },
                categoryAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        style: {
                            color: "#4f6278"
                        }
                    }
                },
                valueAxis: {
                    title: {
                        visible: false
                    },
                    label: {
                        style: {
                            color: "#4f6278"
                        }
                    }
                }
            };

            aChartIds.forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mProperties);
                }
            }.bind(this));

            [
                "actualPlanMonthlyChart",
                "actualPlanMonthlyActualChart",
                "actualPlanVarianceChart",
                "actualPlanSupportCostChart",
                "actualPlanCompositionChart"
            ].forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties({
                        plotArea: {
                            dataLabel: {
                                formatString: "compactKoreanAmount"
                            }
                        },
                        valueAxis: {
                            label: {
                                formatString: "compactKoreanAmount"
                            }
                        },
                        valueAxis2: {
                            label: {
                                formatString: "compactKoreanAmount"
                            }
                        }
                    });
                }
            }.bind(this));

            this._applySpecificChartProperties();
            this._applyCompactChartFormats();
        },

        _applyCompactChartFormats: function () {
            var aAmountChartIds = [
                "cockpitAdminAllocationChart",
                "cockpitRentalSummaryChart",
                "cockpitStructureChart",
                "cockpitOverallStructureChart",
                "rentalProfitTreemapChart",
                "productProfitChart",
                "rentalMonthlyChart",
                "rentalCostChart",
                "rentalSummaryChart",
                "rentalOrgChart",
                "rentalProductChart",
                "actualPlanMonthlyChart",
                "actualPlanMonthlyActualChart",
                "actualPlanVarianceChart",
                "actualPlanSupportCostChart",
                "actualPlanCompositionChart"
            ];
            var aPercentChartIds = [
                "cockpitProductGroupChart",
                "productMarginChart"
            ];
            var mAmountProperties = {
                plotArea: {
                    dataLabel: {
                        formatString: "compactKoreanAmount"
                    }
                },
                valueAxis: {
                    label: {
                        formatString: "compactKoreanAmount"
                    }
                },
                valueAxis2: {
                    label: {
                        formatString: "compactKoreanAmount"
                    }
                }
            };
            var mPercentProperties = {
                plotArea: {
                    dataLabel: {
                        formatString: "percentPoint2"
                    }
                },
                valueAxis: {
                    label: {
                        formatString: "percentPoint2"
                    }
                }
            };

            aAmountChartIds.forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mAmountProperties);
                }
            }.bind(this));

            aPercentChartIds.forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mPercentProperties);
                }
            }.bind(this));
        },

        _applySpecificChartProperties: function () {
            var mByChart = {
                cockpitShareChart: {
                    plotArea: {
                        dataLabel: {
                            visible: true,
                            type: "percentage"
                        }
                    },
                    legend: {
                        position: "bottom"
                    }
                },
                cockpitAdminAllocationChart: {
                    plotArea: {
                        drawingEffect: "glossy",
                        colorPalette: ["#F4C7A1", "#BFD7F2", "#D7C7F2"],
                        dataPointStyle: {
                            rules: [{
                                dataContext: {
                                    "항목": "공통관리비"
                                },
                                properties: {
                                    color: "#F4C7A1"
                                },
                                displayName: "공통관리비"
                            }, {
                                dataContext: {
                                    "항목": "판매 배부액"
                                },
                                properties: {
                                    color: "#BFD7F2"
                                },
                                displayName: "판매 배부액"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 배부액"
                                },
                                properties: {
                                    color: "#D7C7F2"
                                },
                                displayName: "렌탈 배부액"
                            }]
                        },
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    legend: {
                        visible: false
                    }
                },
                rentalProfitTreemapChart: {
                    plotArea: {
                        drawingEffect: "glossy",
                        colorPalette: ["#D7E8F7", "#F6D6B8", "#D9EAD3", "#E6D9F2", "#F6CDD6", "#CDE7E3"],
                        dataPointStyle: {
                            rules: [{
                                dataContext: {
                                    "항목": "감가상각비"
                                },
                                properties: {
                                    color: "#F6D6B8"
                                },
                                displayName: "감가상각비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 서비스비"
                                },
                                properties: {
                                    color: "#D7E8F7"
                                },
                                displayName: "렌탈 서비스비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 계약/영업비"
                                },
                                properties: {
                                    color: "#F8E1B8"
                                },
                                displayName: "렌탈 계약/영업비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 공통비"
                                },
                                properties: {
                                    color: "#E6D9F2"
                                },
                                displayName: "렌탈 공통비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 수선비"
                                },
                                properties: {
                                    color: "#F6CDD6"
                                },
                                displayName: "렌탈 수선비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 조직 판관비"
                                },
                                properties: {
                                    color: "#CDE7E3"
                                },
                                displayName: "렌탈 조직 판관비"
                            }, {
                                dataContext: {
                                    "항목": "회수물류 귀속 비용"
                                },
                                properties: {
                                    color: "#F2D0C6"
                                },
                                displayName: "회수물류 귀속 비용"
                            }, {
                                dataContext: {
                                    "항목": "공통관리비 렌탈 배부액"
                                },
                                properties: {
                                    color: "#D7C7F2"
                                },
                                displayName: "공통관리비 렌탈 배부액"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 영업이익"
                                },
                                properties: {
                                    color: "#BFE3C6"
                                },
                                displayName: "렌탈 영업이익"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 영업손실"
                                },
                                properties: {
                                    color: "#F2BFC3"
                                },
                                displayName: "렌탈 영업손실"
                            }, {
                                dataContext: {
                                    "항목": "미분류 매출"
                                },
                                properties: {
                                    color: "#DDE3EA"
                                },
                                displayName: "미분류 매출"
                            }]
                        },
                        dataLabel: {
                            visible: true,
                            hideWhenOverlap: true,
                            formatString: "compactKoreanAmount",
                            style: {
                                color: "#22304a",
                                fontWeight: "bold"
                            }
                        }
                    },
                    legend: {
                        visible: false
                    }
                },
                cockpitRentalSummaryChart: {
                    plotArea: {
                        colorPalette: ["#C8792A", "#0A6ED1", "#E9730C", "#925ACE", "#D04488", "#008080", "#C45A4A", "#6F42C1"],
                        dataPointStyle: {
                            rules: [{
                                dataContext: {
                                    "항목": "감가상각비"
                                },
                                properties: {
                                    color: "#C8792A"
                                },
                                displayName: "감가상각비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 서비스비"
                                },
                                properties: {
                                    color: "#0A6ED1"
                                },
                                displayName: "렌탈 서비스비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 계약/영업비"
                                },
                                properties: {
                                    color: "#E9730C"
                                },
                                displayName: "렌탈 계약/영업비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 공통비"
                                },
                                properties: {
                                    color: "#925ACE"
                                },
                                displayName: "렌탈 공통비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 수선비"
                                },
                                properties: {
                                    color: "#D04488"
                                },
                                displayName: "렌탈 수선비"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 조직 판관비"
                                },
                                properties: {
                                    color: "#008080"
                                },
                                displayName: "렌탈 조직 판관비"
                            }, {
                                dataContext: {
                                    "항목": "회수물류 귀속 비용"
                                },
                                properties: {
                                    color: "#C45A4A"
                                },
                                displayName: "회수물류 귀속 비용"
                            }, {
                                dataContext: {
                                    "항목": "공통관리비 렌탈 배부액"
                                },
                                properties: {
                                    color: "#6F42C1"
                                },
                                displayName: "공통관리비 렌탈 배부액"
                            }]
                        },
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    legend: {
                        visible: false
                    }
                },
                cockpitStructureChart: {
                    interaction: {
                        zoom: {
                            enablement: "disabled"
                        }
                    },
                    legend: {
                        visible: false
                    },
                    plotArea: {
                        colorPalette: ["#2F80ED", "#C8792A", "#2E8B57", "#C45A4A", "#008A83"],
                        dataPointStyle: {
                            rules: [{
                                dataContext: {
                                    "구분": "판매매출"
                                },
                                properties: {
                                    color: "#2F80ED"
                                },
                                displayName: "판매매출"
                            }, {
                                dataContext: {
                                    "구분": "판매매출원가"
                                },
                                properties: {
                                    color: "#C8792A"
                                },
                                displayName: "판매매출원가"
                            }, {
                                dataContext: {
                                    "구분": "판매총이익"
                                },
                                properties: {
                                    color: "#2E8B57"
                                },
                                displayName: "판매총이익"
                            }, {
                                dataContext: {
                                    "구분": "제품별 배부 판관비"
                                },
                                properties: {
                                    color: "#C45A4A"
                                },
                                displayName: "제품별 배부 판관비"
                            }, {
                                dataContext: {
                                    "구분": "판매기준 영업이익"
                                },
                                properties: {
                                    color: "#008A83"
                                },
                                displayName: "판매기준 영업이익"
                            }]
                        },
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    categoryAxis: {
                        label: {
                            visible: true
                        },
                        title: {
                            visible: false
                        }
                    }
                },
                cockpitOverallStructureChart: {
                    legend: {
                        visible: false
                    },
                    plotArea: {
                        colorPalette: ["#2F80ED", "#C8792A", "#008A83", "#6F42C1", "#E9730C", "#2E8B57"],
                        dataPointStyle: {
                            rules: [{
                                dataContext: {
                                    "항목": "판매매출"
                                },
                                properties: {
                                    color: "#2F80ED"
                                },
                                displayName: "판매매출"
                            }, {
                                dataContext: {
                                    "항목": "판매 총비용"
                                },
                                properties: {
                                    color: "#C8792A"
                                },
                                displayName: "판매 총비용"
                            }, {
                                dataContext: {
                                    "항목": "판매기준 영업이익"
                                },
                                properties: {
                                    color: "#008A83"
                                },
                                displayName: "판매기준 영업이익"
                            }, {
                                dataContext: {
                                    "항목": "렌탈수익"
                                },
                                properties: {
                                    color: "#6F42C1"
                                },
                                displayName: "렌탈수익"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 총비용"
                                },
                                properties: {
                                    color: "#E9730C"
                                },
                                displayName: "렌탈 총비용"
                            }, {
                                dataContext: {
                                    "항목": "렌탈 기준 영업이익"
                                },
                                properties: {
                                    color: "#2E8B57"
                                },
                                displayName: "렌탈 기준 영업이익"
                            }]
                        },
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    }
                },
                cockpitProductGroupChart: {
                    plotArea: {
                        colorPalette: ["#2E8B57", "#0A6ED1"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    legend: {
                        visible: true,
                        position: "bottom"
                    }
                },
                productProfitChart: {
                    interaction: {
                        zoom: {
                            enablement: "disabled"
                        }
                    },
                    legend: {
                        visible: false
                    },
                    plotArea: {
                        drawingEffect: "normal",
                        colorPalette: ["#B7DCD8"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true,
                            formatString: "compactKoreanAmount",
                            style: {
                                color: "#1f2d3d",
                                fontWeight: "bold"
                            }
                        },
                        referenceLine: this._buildProductProfitReferenceLine()
                    },
                    categoryAxis: {
                        title: {
                            visible: false
                        },
                        label: {
                            style: {
                                color: "#334e68",
                                fontWeight: "bold"
                            }
                        }
                    },
                    valueAxis: {
                        title: {
                            visible: false
                        },
                        label: {
                            formatString: "compactKoreanAmount",
                            style: {
                                color: "#607489"
                            }
                        }
                    }
                },
                productMarginChart: {
                    interaction: {
                        selectability: {
                            mode: "single"
                        }
                    },
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#2E8B57", "#8054C7"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true,
                            formatString: "percentPoint2"
                        }
                    },
                    valueAxis: {
                        label: {
                            formatString: "percentPoint2"
                        },
                        title: {
                            visible: false
                        }
                    }
                },
                rentalMonthlyChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#6F42C1", "#C8792A", "#2E8B57"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    }
                },
                rentalCostChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#C8792A", "#0A6ED1", "#E9730C", "#925ACE", "#D04488", "#008080", "#C45A4A", "#6F42C1"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    }
                },
                rentalSummaryChart: {
                    legend: {
                        visible: false
                    },
                    plotArea: {
                        colorPalette: ["#6F42C1", "#C8792A", "#E9730C", "#925ACE", "#2E8B57"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    }
                },
                rentalOrgChart: {
                    plotArea: {
                        colorPalette: ["#008A83"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    legend: {
                        visible: false
                    }
                },
                rentalProductChart: {
                    plotArea: {
                        colorPalette: ["#6F42C1"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true
                        }
                    },
                    legend: {
                        visible: false
                    }
                },
                actualPlanMonthlyChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                actualPlanMonthlyActualChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#0A6ED1", "#107E3E"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                actualPlanProfitCenterChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#008A83", "#E9730C"],
                        dataShape: {
                            primaryAxis: ["bar", "bar"],
                            secondaryAxis: ["line"]
                        },
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true,
                            formatString: ["compactKoreanAmount", "percentPoint2"]
                        }
                    },
                    valueAxis: {
                        label: {
                            formatString: "compactKoreanAmount"
                        },
                        title: {
                            visible: false
                        }
                    },
                    valueAxis2: {
                        label: {
                            formatString: "percentPoint2"
                        },
                        title: {
                            visible: false
                        }
                    },
                    categoryAxis: {
                        title: {
                            visible: false
                        }
                    }
                },
                actualPlanSupportCostChart: {
                    legend: {
                        visible: true,
                        position: "bottom"
                    },
                    plotArea: {
                        colorPalette: ["#C8792A", "#C45A4A"],
                        dataLabel: {
                            visible: true,
                            position: "outside",
                            hideWhenOverlap: true,
                            formatString: "compactKoreanAmount"
                        }
                    },
                    valueAxis: {
                        label: {
                            formatString: "compactKoreanAmount"
                        },
                        title: {
                            visible: false
                        }
                    },
                    categoryAxis: {
                        title: {
                            visible: false
                        }
                    }
                },
                actualPlanVarianceChart: {
                    plotArea: {
                        colorPalette: ["#2F80ED", "#2E8B57", "#C45A4A", "#8054C7", "#C8792A"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                },
                actualPlanCompositionChart: {
                    legend: {
                        visible: false
                    },
                    plotArea: {
                        colorPalette: ["#0A6ED1", "#C8792A", "#107E3E", "#E9730C", "#008A83"],
                        dataLabel: {
                            visible: true,
                            position: "outside"
                        }
                    }
                }
            };

            Object.keys(mByChart).forEach(function (sId) {
                var oChart = this.byId && this.byId(sId);
                if (oChart && oChart.setVizProperties) {
                    oChart.setVizProperties(mByChart[sId]);
                }
            }.bind(this));
        }
    });
});
