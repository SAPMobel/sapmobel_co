sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
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
                selectedAccountKey: "",
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
            this.getAppStateModel().setProperty("/resetDashboardOrgFilterOnRoute", true);
            oModel.setProperty("/busy", true);

            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("department");
                }.bind(this))
                .then(function (oFilters) {
                    var oRouteFilters = Object.assign({}, oFilters, {
                        orgNodeId: this._routeOrgId,
                        orgNodeText: ""
                    });

                    oModel.setProperty("/filters", oRouteFilters);
                    return this._loadDepartment(oRouteFilters);
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
            var aCurrentDocumentRows = this.service.currentDocumentRows(aOrgDocumentRows, oFilters.period);
            var aCumulativeActualRows = this.service.cumulativeActualRows(aOrgActualRows, oFilters.period);
            var aCumulativeBudgetRows = this.service.cumulativeBudgetRows(aOrgBudgetRows, oFilters.period);
            var aCurrentActualRows = this.service.currentActualRows(aOrgActualRows, oFilters.period);
            var aPreviousActualRows = this.service.previousActualRows(aOrgActualRows, aPreviousYearRows, oFilters, oSelectedOrg);
            var fTotalActual = this.service.sum(aCumulativeActualRows, "amount");
            var fCurrentActual = this.service.sum(aCurrentActualRows, "amount");
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
                aCurrentDocumentRows
            );
            var aAccountRows = this.service.aggregateAccounts(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aCurrentDocumentRows
            );
            var oAccountSummary = {
                actualAmount: this.service.sum(aAccountRows, "actualAmount"),
                currentAmount: this.service.sum(aAccountRows, "currentAmount"),
                previousAmount: this.service.sum(aAccountRows, "previousAmount")
            };
            var aCompositionRows = this.decorateAccountCompositionRows(
                this.service.buildAccountComposition(aCumulativeActualRows),
                aCurrentDocumentRows
            );
            var iDocumentCount = this.service.distinctDocumentCount(aCurrentDocumentRows);
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
                this.createKpi("이번달 비용", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), oFilters.period + "월 기준", "None", "sap-icon://calendar"),
                this.createKpi("예산", fTotalBudget ? this.formatter.amountWithCurrency(fTotalBudget, "KRW") : "-", fTotalBudget ? "BUD 기준 누적" : "예산 데이터 없음", "None", "sap-icon://business-objects-experience"),
                this.createKpi("예산대비 차이", fBudgetVariance === null ? "-" : this.formatter.amountWithCurrency(fBudgetVariance, "KRW"), fBudgetRate === null ? "예산 데이터 없음" : this.formatter.rate(fBudgetRate), this.formatter.valueStateByVariance(fBudgetVariance, !!fTotalBudget), "sap-icon://compare"),
                this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", iDocumentCount ? oFilters.period + "월 전표 기준" : "전표 데이터 없음", "None", "sap-icon://documents"),
                this.createKpi("하위 코스트센터 수", this.formatter.amount(iChildCount) + "개", oSelectedOrg.childId ? "선택 조직 범위" : "전체 기준", "None", "sap-icon://org-chart")
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
            oModel.setProperty("/childCostCenterRows", aChildRows);
            oModel.setProperty("/accountRows", aAccountRows);
            oModel.setProperty("/accountSummary", oAccountSummary);

            this.configureVizFrame(this.byId("departmentTrendChart"), this.byId("departmentTrendChartPopover"), {
                type: "trend",
                categoryAxisTitle: "조회 월",
                valueAxisTitle: "누적금액(KRW)",
                legendPosition: "top"
            });
            this.configureVizFrame(this.byId("departmentCompositionChart"), this.byId("departmentCompositionChartPopover"), {
                type: "donut",
                legendPosition: "right"
            });
        },

        onTrendChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("department");
            var sMonthText = this.extractVizDataValue(oEvent, "조회 월");
            var aTrendRows = oModel.getProperty("/monthlyTrend") || [];
            var oSummary = this.buildSelectedMonthSummary(sMonthText, aTrendRows);

            oModel.setProperty("/monthlyTrend", this.markSelectedByProperty(aTrendRows, "monthText", sMonthText));
            oModel.setProperty("/selectedMonthSummary", oSummary || {});
            oModel.setProperty("/hasSelectedMonthSummary", !!oSummary);
        },

        onCompositionChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("department");
            var sAccountText = this.extractVizDataValue(oEvent, "계정명");
            var aCompositionRows = oModel.getProperty("/accountComposition") || [];
            var oSummary = this.buildSelectedAccountSummary(sAccountText, aCompositionRows);

            oModel.setProperty("/selectedAccountKey", sAccountText);
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
