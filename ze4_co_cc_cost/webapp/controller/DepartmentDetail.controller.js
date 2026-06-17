sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox",
    "sap/viz/ui5/controls/common/feeds/FeedItem"
], function (BaseController, MessageBox, FeedItem) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.DepartmentDetail", {
        getModelName: function () {
            return "department";
        },

        onInit: function () {
            this._routeOrgId = "";
            this.getView().setModel(this.createViewModel({
                activeMenu: "department",
                pageTitle: "비용 상세 분석",
                header: {},
                kpis: [],
                monthlyTrend: [],
                accountComposition: [],
                accountCompositionList: [],
                selectedMonthSummary: {},
                selectedAccountSummary: {},
                hasSelectedMonthSummary: false,
                hasSelectedAccountSummary: false,
                childCostCenterRows: [],
                accountRows: []
            }), "department");

            this.getRouter().getRoute("departmentDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oModel = this.getView().getModel("department");
            var sOrgId = decodeURIComponent(oEvent.getParameter("arguments").orgId || "");

            this._routeOrgId = sOrgId === "ALL" ? "" : sOrgId;
            oModel.setProperty("/busy", true);

            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("department");
                }.bind(this))
                .then(function (oFilters) {
                    oFilters.orgNodeId = this._routeOrgId;
                    oModel.setProperty("/filters", oFilters);
                    return this._loadDepartment(oFilters);
                }.bind(this))
                .catch(function () {
                    MessageBox.error("상세 분석 데이터를 조회하지 못했습니다.");
                })
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        onSearch: function () {
            var oFilters = this.validateFilters("department");

            if (!oFilters) {
                return;
            }

            this._routeOrgId = oFilters.orgNodeId;
            this._loadDepartment(oFilters);
        },

        _loadDepartment: function (oFilters) {
            var oModel = this.getView().getModel("department");

            oModel.setProperty("/busy", true);
            this.setWarning("department", "");

            return Promise.all([
                this.service.readHierarchyRows().catch(function () {
                    this.setWarning("department", "조직/코스트센터 정보를 조회하지 못했습니다. 선택 기준만 적용합니다.");
                    return [];
                }.bind(this)),
                this.service.readActualRows(oFilters),
                this.service.readBudgetRows(oFilters).catch(function () {
                    this.setWarning("department", "예산 데이터가 없습니다. 실적 기준으로 표시합니다.");
                    return [];
                }.bind(this)),
                this.service.readPreviousYearRows(oFilters).catch(function () {
                    return [];
                }),
                this.service.readDocumentRows(oFilters, false).catch(function () {
                    return [];
                })
            ]).then(function (aResults) {
                this._applyDepartmentData(oFilters, aResults[0], aResults[1], aResults[2], aResults[3], aResults[4]);
            }.bind(this)).catch(function () {
                MessageBox.error("실제 비용 데이터를 조회하지 못했습니다.");
            }).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyDepartmentData: function (oFilters, aHierarchyRows, aActualRows, aBudgetRows, aPreviousYearRows, aDocumentRows) {
            var oModel = this.getView().getModel("department");
            var oSelectedOrg = this.setHierarchyOptions("department", aHierarchyRows, oFilters.orgNodeId || this._routeOrgId);
            var aOrgActualRows = this.service.filterByOrg(aActualRows, "kostl", oSelectedOrg);
            var aOrgBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oSelectedOrg);
            var aOrgDocumentRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            var aCumulativeActualRows = this.service.cumulativeActualRows(aOrgActualRows, oFilters.period);
            var aCumulativeBudgetRows = this.service.cumulativeBudgetRows(aOrgBudgetRows, oFilters.period);
            var aCurrentActualRows = this.service.currentActualRows(aOrgActualRows, oFilters.period);
            var aPreviousActualRows = this.service.previousActualRows(aOrgActualRows, aPreviousYearRows, oFilters, oSelectedOrg);
            var fTotalActual = this.service.sum(aCumulativeActualRows, "amount");
            var fTotalBudget = this.service.sum(aCumulativeBudgetRows, "BudgetAmt");
            var fBudgetVariance = fTotalBudget ? fTotalActual - fTotalBudget : null;
            var fBudgetRate = fTotalBudget ? fBudgetVariance / fTotalBudget * 100 : null;
            var aTrendRows = this.decorateMonthlyTrendRows(
                this.service.buildMonthlyTrend(aOrgActualRows, aOrgBudgetRows),
                aOrgDocumentRows,
                oFilters
            );
            var aChildRows = this.service.aggregateCostCenters(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aHierarchyRows,
                aOrgDocumentRows
            );
            var aAccountRows = this.service.aggregateAccounts(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aOrgDocumentRows
            );
            var aCompositionRows = this.decorateAccountCompositionRows(
                this.service.buildAccountComposition(aCumulativeActualRows),
                aOrgDocumentRows
            );
            var iDocumentCount = this.service.distinctDocumentCount(aOrgDocumentRows);
            var iChildCount = oSelectedOrg.descendantIds && oSelectedOrg.descendantIds.length ? aChildRows.length : 0;
            var bHasTrendData;
            var bHasCompositionData = aCompositionRows.length > 0;

            if (!aOrgBudgetRows.length) {
                this.setWarning("department", "예산 데이터가 없습니다. 실적 기준으로 표시합니다.");
                aTrendRows = aTrendRows.map(function (oRow) {
                    return Object.assign({}, oRow, {
                        budgetAmount: null
                    });
                });
            }

            bHasTrendData = aTrendRows.some(function (oRow) {
                return !!(oRow.actualAmount || oRow.budgetAmount);
            });

            oModel.setProperty("/pageTitle", (oSelectedOrg.nodeText || "전체") + " 비용 상세 분석");
            oModel.setProperty("/header", {
                title: oSelectedOrg.nodeText || "전체 조직",
                code: oSelectedOrg.childId || "ALL",
                manager: oSelectedOrg.manager || "-",
                company: "0001",
                period: oFilters.gjahr + "년 " + oFilters.period + "월 누적",
                scopeText: iChildCount > 1 ? "하위 코스트센터 " + iChildCount + "개 포함" : "단일 코스트센터",
                currency: "KRW"
            });
            oModel.setProperty("/kpis", [
                this.createKpi("누적 비용", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "선택 기간 누적", "None", "sap-icon://wallet"),
                this.createKpi("예산", fTotalBudget ? this.formatter.amountWithCurrency(fTotalBudget, "KRW") : "-", fTotalBudget ? "BUD 기준 누적" : "예산 데이터 없음", "None", "sap-icon://business-objects-experience"),
                this.createKpi("예산대비 차이", fBudgetVariance === null ? "-" : this.formatter.amountWithCurrency(fBudgetVariance, "KRW"), fBudgetRate === null ? "예산 데이터 없음" : this.formatter.rate(fBudgetRate), this.formatter.valueStateByVariance(fBudgetVariance, !!fTotalBudget), "sap-icon://compare"),
                this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", iDocumentCount ? "선택 기간 기준" : "전표 데이터 없음", "None", "sap-icon://documents"),
                this.createKpi("하위 코스트센터 수", this.formatter.amount(iChildCount) + "개", oSelectedOrg.childId ? "선택 조직 범위" : "전체 기준", "None", "sap-icon://org-chart")
            ]);
            oModel.setProperty("/monthlyTrend", aTrendRows);
            oModel.setProperty("/accountComposition", aCompositionRows);
            oModel.setProperty("/accountCompositionList", aCompositionRows);
            oModel.setProperty("/hasTrendData", bHasTrendData);
            oModel.setProperty("/hasCompositionData", bHasCompositionData);
            oModel.setProperty("/selectedMonthSummary", {});
            oModel.setProperty("/selectedAccountSummary", {});
            oModel.setProperty("/hasSelectedMonthSummary", false);
            oModel.setProperty("/hasSelectedAccountSummary", false);
            oModel.setProperty("/childCostCenterRows", aChildRows);
            oModel.setProperty("/accountRows", aAccountRows);

            this._configureCharts(!!aOrgBudgetRows.length);
        },

        _configureCharts: function (bHasBudget) {
            var oTrendChart = this.byId("departmentTrendChart");
            var oCompositionChart = this.byId("departmentCompositionChart");

            if (oTrendChart) {
                oTrendChart.removeAllFeeds();
                oTrendChart.addFeed(new FeedItem({
                    uid: "valueAxis",
                    type: "Measure",
                    values: bHasBudget ? ["실적", "예산"] : ["실적"]
                }));
                oTrendChart.addFeed(new FeedItem({
                    uid: "categoryAxis",
                    type: "Dimension",
                    values: ["월"]
                }));
                oTrendChart.setVizProperties({
                    title: { visible: false },
                    tooltip: { visible: true },
                    interaction: { selectability: { mode: "single" } },
                    legend: {
                        visible: true,
                        label: { style: { color: "#24384f", fontWeight: "700" } }
                    },
                    valueAxis: { title: { visible: false }, label: { style: { color: "#24384f", fontWeight: "700" } } },
                    categoryAxis: { title: { visible: false }, label: { style: { color: "#24384f", fontWeight: "700" } } },
                    plotArea: {
                        drawingEffect: "glossy",
                        dataLabel: { visible: true },
                        line: { width: 3 },
                        colorPalette: ["#256fdb", "#8392a5"]
                    }
                });
            }

            if (oCompositionChart) {
                oCompositionChart.removeAllFeeds();
                oCompositionChart.addFeed(new FeedItem({
                    uid: "size",
                    type: "Measure",
                    values: ["금액"]
                }));
                oCompositionChart.addFeed(new FeedItem({
                    uid: "color",
                    type: "Dimension",
                    values: ["계정"]
                }));
                oCompositionChart.setVizProperties({
                    title: { visible: false },
                    tooltip: { visible: true },
                    interaction: { selectability: { mode: "single" } },
                    legend: {
                        visible: true,
                        position: "right",
                        label: { style: { color: "#24384f", fontWeight: "700" } }
                    },
                    plotArea: {
                        drawingEffect: "glossy",
                        dataLabel: { visible: true, type: "percentage" },
                        colorPalette: ["#256fdb", "#37a2a2", "#6abf4b", "#e39b2f", "#9b72d0", "#d86b8f", "#7c8ea3", "#a56b46"]
                    }
                });
            }
        },

        onTrendChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("department");
            var sMonthText = this.extractVizDataValue(oEvent, "월");
            var aTrendRows = oModel.getProperty("/monthlyTrend") || [];
            var oSummary = this.buildSelectedMonthSummary(sMonthText, aTrendRows);

            oModel.setProperty("/monthlyTrend", this.markSelectedByProperty(aTrendRows, "monthText", sMonthText));
            oModel.setProperty("/selectedMonthSummary", oSummary || {});
            oModel.setProperty("/hasSelectedMonthSummary", !!oSummary);
        },

        onCompositionChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("department");
            var sAccountText = this.extractVizDataValue(oEvent, "계정");
            var aCompositionRows = oModel.getProperty("/accountComposition") || [];
            var oSummary = this.buildSelectedAccountSummary(sAccountText, aCompositionRows);

            oModel.setProperty("/accountComposition", this.markSelectedByProperty(aCompositionRows, "accountLabel", sAccountText));
            oModel.setProperty("/selectedAccountSummary", oSummary || {});
            oModel.setProperty("/hasSelectedAccountSummary", !!oSummary);
        },

        onGoSelectedAccountDocuments: function () {
            var oModel = this.getView().getModel("department");
            var oSelectedOrg = oModel.getProperty("/selectedOrg") || {};
            var oAccount = oModel.getProperty("/selectedAccountSummary") || {};

            if (oAccount.saknr && oAccount.saknr !== "ETC") {
                this.navToDocuments(oSelectedOrg.childId || this._routeOrgId || "ALL", oAccount.saknr);
            }
        },

        onChildRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();

            if (oRow && oRow.kostl) {
                this.navToDepartment(oRow.kostl);
            }
        },

        onAccountRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();
            var oSelectedOrg = this.getView().getModel("department").getProperty("/selectedOrg") || {};

            if (oRow && oRow.saknr) {
                this.navToDocuments(oSelectedOrg.childId || this._routeOrgId || "ALL", oRow.saknr);
            }
        },

        onGoDashboard: function () {
            this.navToDashboard();
        },

        onGoDepartment: function () {
            var oSelectedOrg = this.getView().getModel("department").getProperty("/selectedOrg") || {};

            this.navToDepartment(oSelectedOrg.childId || "ALL");
        },

        onGoDocuments: function () {
            var oSelectedOrg = this.getView().getModel("department").getProperty("/selectedOrg") || {};

            this.navToDocuments(oSelectedOrg.childId || "ALL");
        }
    });
});
