sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.Dashboard", {
        getModelName: function () {
            return "dashboard";
        },

        onInit: function () {
            this.getView().setModel(this.createViewModel({
                pageTitle: "부서별 비용분석 대시보드",
                activeMenu: "dashboard",
                kpis: [],
                monthlyTrend: [],
                accountComposition: [],
                selectedAccountKey: "",
                selectedMonthSummary: {},
                selectedAccountSummary: {},
                hasSelectedMonthSummary: false,
                hasSelectedAccountSummary: false,
                orgTreeRows: [],
                costCenterRows: [],
                hasRows: false
            }), "dashboard");

            this.getRouter().getRoute("dashboard").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oModel = this.getView().getModel("dashboard");
            var oAppModel = this.getAppStateModel();

            if (oAppModel.getProperty("/resetDashboardOrgFilterOnRoute")) {
                this.clearGlobalOrgSelection();
                oAppModel.setProperty("/resetDashboardOrgFilterOnRoute", false);
            }

            oModel.setProperty("/busy", true);
            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("dashboard");
                }.bind(this))
                .then(function (oFilters) {
                    this.getAppStateModel().setProperty("/defaults", Object.assign({}, oFilters));
                    return this._loadDashboard(oFilters);
                }.bind(this))
                .catch(function () {
                    MessageBox.error("실제 비용 데이터를 조회하지 못했습니다.");
                })
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        onSearch: function () {
            var oFilters = this.validateFilters("dashboard");

            if (!oFilters) {
                return;
            }

            this._loadDashboard(oFilters);
        },

        _loadDashboard: function (oFilters) {
            var oModel = this.getView().getModel("dashboard");

            oModel.setProperty("/busy", true);
            this.setWarning("dashboard", "");

            return Promise.all([
                this.service.readHierarchyRows().catch(function () {
                    this.setWarning("dashboard", "조직/코스트센터 정보를 조회하지 못했습니다. 전체 기준으로 표시합니다.");
                    return [];
                }.bind(this)),
                this.service.readActualRows(oFilters),
                this.service.readBudgetRows(oFilters).catch(function () {
                    this.setWarning("dashboard", "예산 데이터가 없습니다. 실적 기준으로 표시합니다.");
                    return [];
                }.bind(this)),
                this.service.readPreviousYearRows(oFilters).catch(function () {
                    return [];
                }),
                this.service.readDocumentRows(oFilters, false).catch(function () {
                    return [];
                })
            ]).then(function (aResults) {
                this._applyDashboardData(oFilters, aResults[0], aResults[1], aResults[2], aResults[3], aResults[4]);
            }.bind(this)).catch(function () {
                MessageBox.error("실제 비용 데이터를 조회하지 못했습니다.");
            }).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyDashboardData: function (oFilters, aHierarchyRows, aActualRows, aBudgetRows, aPreviousYearRows, aDocumentRows) {
            var oModel = this.getView().getModel("dashboard");
            var oSelectedOrg = this.setHierarchyOptions("dashboard", aHierarchyRows, oFilters.orgNodeId);
            var aOrgActualRows = this.service.filterByOrg(aActualRows, "kostl", oSelectedOrg);
            var aOrgBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oSelectedOrg);
            var aOrgDocumentRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            var aCurrentDocumentRows = this.service.currentDocumentRows(aOrgDocumentRows, oFilters.period);
            var aCumulativeActualRows = this.service.cumulativeActualRows(aOrgActualRows, oFilters.period);
            var aCumulativeBudgetRows = this.service.cumulativeBudgetRows(aOrgBudgetRows, oFilters.period);
            var aCurrentActualRows = this.service.currentActualRows(aOrgActualRows, oFilters.period);
            var aPreviousActualRows = this.service.previousActualRows(aOrgActualRows, aPreviousYearRows, oFilters, oSelectedOrg);
            var fTotalActual = this.service.sum(aCumulativeActualRows, "amount");
            var fTotalBudget = this.service.sum(aCumulativeBudgetRows, "BudgetAmt");
            var fCurrentActual = this.service.sum(aCurrentActualRows, "amount");
            var fPreviousActual = this.service.sum(aPreviousActualRows, "amount");
            var bHasPreviousActual = aPreviousActualRows.length > 0;
            var fBudgetVariance = fTotalBudget ? fTotalActual - fTotalBudget : null;
            var fBudgetRate = fTotalBudget ? fBudgetVariance / fTotalBudget * 100 : null;
            var fMom = bHasPreviousActual ? fCurrentActual - fPreviousActual : null;
            var fMomRate = bHasPreviousActual && fPreviousActual ? fMom / fPreviousActual * 100 : null;
            var sMomSubText = bHasPreviousActual ? (fMomRate === null ? "전월 0원 기준" : this.formatter.rate(fMomRate)) : "전월 데이터 없음";
            var aTrendRows = this.decorateMonthlyTrendRows(
                this.service.buildMonthlyTrend(aOrgActualRows, aOrgBudgetRows),
                aOrgDocumentRows,
                oFilters
            );
            var aOrgTreeRows = this.service.buildOrgRollupTree(aHierarchyRows, aCumulativeActualRows, oSelectedOrg);
            var aCostCenterRows = this.service.aggregateCostCenters(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aHierarchyRows,
                aCurrentDocumentRows
            );
            var aCompositionRows = this.decorateAccountCompositionRows(
                this.service.buildAccountComposition(aCumulativeActualRows),
                aCurrentDocumentRows
            );
            var iDocumentCount = this.service.distinctDocumentCount(aCurrentDocumentRows);
            var bHasTrendData;
            var bHasCompositionData = aCompositionRows.length > 0;

            if (!aOrgBudgetRows.length) {
                this.setWarning("dashboard", "예산 데이터가 없습니다. 실적 기준으로 표시합니다.");
                aTrendRows = aTrendRows.map(function (oRow) {
                    return Object.assign({}, oRow, {
                        budgetAmount: null
                    });
                });
            }

            bHasTrendData = aTrendRows.some(function (oRow) {
                return !!(oRow.actualAmount || oRow.budgetAmount);
            });

            oModel.setProperty("/kpis", [
                this.createKpi("총 비용", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "선택 기간 누적", "None", "sap-icon://wallet"),
                this.createKpi("이번달 비용", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), oFilters.period + "월 기준", "None", "sap-icon://calendar"),
                this.createKpi("예산", fTotalBudget ? this.formatter.amountWithCurrency(fTotalBudget, "KRW") : "-", fTotalBudget ? "BUD 기준 누적" : "예산 데이터 없음", "None", "sap-icon://business-objects-experience"),
                this.createKpi("예산대비 차이", fBudgetVariance === null ? "-" : this.formatter.amountWithCurrency(fBudgetVariance, "KRW"), fBudgetRate === null ? "예산 데이터 없음" : this.formatter.rate(fBudgetRate), this.formatter.valueStateByVariance(fBudgetVariance, !!fTotalBudget), "sap-icon://compare"),
                this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", iDocumentCount ? oFilters.period + "월 전표 기준" : "전표 데이터 없음", "None", "sap-icon://documents"),
                this.createKpi("전월대비 증감", fMom === null ? "-" : this.formatter.amountWithCurrency(fMom, "KRW"), sMomSubText, this.formatter.valueStateByDelta(fMom), "sap-icon://trend-up")
            ]);
            oModel.setProperty("/monthlyTrend", aTrendRows);
            oModel.setProperty("/accountComposition", aCompositionRows);
            oModel.setProperty("/accountCompositionList", aCompositionRows);
            oModel.setProperty("/hasTrendData", bHasTrendData);
            oModel.setProperty("/hasCompositionData", bHasCompositionData);
            oModel.setProperty("/selectedMonthSummary", {});
            oModel.setProperty("/selectedAccountSummary", {});
            oModel.setProperty("/selectedAccountKey", "");
            oModel.setProperty("/hasSelectedMonthSummary", false);
            oModel.setProperty("/hasSelectedAccountSummary", false);
            oModel.setProperty("/orgTreeRows", aOrgTreeRows);
            oModel.setProperty("/costCenterRows", aCostCenterRows);
            oModel.setProperty("/hasRows", !!aCostCenterRows.length);
            oModel.setProperty("/chartTitle", "월별 비용 추이 (" + oFilters.gjahr + "년)");
            oModel.setProperty("/compositionTitle", "계정별 비용 구성 (" + oFilters.period + "월 누적)");
            oModel.setProperty("/tableTitle", "코스트센터별 비용 현황 (" + oFilters.period + "월 누적)");

            this.configureVizFrame(this.byId("trendChart"), this.byId("trendChartPopover"), {
                type: "trend",
                categoryAxisTitle: "조회 월",
                valueAxisTitle: "누적금액(KRW)",
                legendPosition: "top"
            });
            this.configureVizFrame(this.byId("compositionChart"), this.byId("compositionChartPopover"), {
                type: "donut",
                legendPosition: "right"
            });
            this.scheduleViewportTableResize([{
                id: "costCenterTable",
                minRows: 6,
                maxRows: 18,
                bottomOffset: 28
            }]);

            setTimeout(function () {
                var oOrgTree = this.byId("orgRollupTree");

                if (oOrgTree && oOrgTree.expandToLevel) {
                    oOrgTree.expandToLevel(3);
                }
            }.bind(this), 0);
        },

        onTrendChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("dashboard");
            var sMonthText = this.extractVizDataValue(oEvent, "조회 월");
            var aTrendRows = oModel.getProperty("/monthlyTrend") || [];
            var oSummary = this.buildSelectedMonthSummary(sMonthText, aTrendRows);

            oModel.setProperty("/monthlyTrend", this.markSelectedByProperty(aTrendRows, "monthText", sMonthText));
            oModel.setProperty("/selectedMonthSummary", oSummary || {});
            oModel.setProperty("/hasSelectedMonthSummary", !!oSummary);
        },

        onCompositionChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("dashboard");
            var sAccountText = this.extractVizDataValue(oEvent, "계정명");
            var aCompositionRows = oModel.getProperty("/accountComposition") || [];
            var oSummary = this.buildSelectedAccountSummary(sAccountText, aCompositionRows);

            oModel.setProperty("/selectedAccountKey", sAccountText);
            oModel.setProperty("/selectedAccountSummary", oSummary || {});
            oModel.setProperty("/hasSelectedAccountSummary", !!oSummary);
        },

        onGoSelectedAccountDocuments: function () {
            var oModel = this.getView().getModel("dashboard");
            var oSelectedOrg = oModel.getProperty("/selectedOrg") || {};
            var oAccount = oModel.getProperty("/selectedAccountSummary") || {};

            if (oAccount.saknr && oAccount.saknr !== "ETC") {
                this.navToDocuments(oSelectedOrg.childId || "ALL", oAccount.saknr);
            }
        },

        onOrgTreeRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();

            if (oRow && oRow.childId) {
                this.navToDepartment(oRow.childId);
            }
        },

        onCostCenterRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();

            if (oRow && oRow.kostl) {
                this.navToDepartment(oRow.kostl);
            }
        },

        onGoDashboard: function () {
            this.navToDashboard();
        },

        onGoDepartment: function () {
            var oSelectedOrg = this.getView().getModel("dashboard").getProperty("/selectedOrg") || {};

            this.navToDepartment(oSelectedOrg.childId || "ALL");
        },

        onGoDocuments: function () {
            var oSelectedOrg = this.getView().getModel("dashboard").getProperty("/selectedOrg") || {};

            this.navToDocuments(oSelectedOrg.childId || "ALL");
        }
    });
});
