sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.DepartmentDetail", {
        getModelName: function () {
            return "department";
        },

        buildExportReport: function () {
            var oModel = this.getView().getModel("department");

            return {
                title: "[EverNiture-CO] 비용 상세 분석",
                fileName: "DepartmentCostDetail",
                variant: "costcenter",
                description: "선택 부서/코스트센터의 비용 KPI, 월별 추이, 계정 구성 및 원장 상세 리포트",
                filters: this.exportFilterRows("department"),
                summary: this.exportHeaderRows(oModel.getProperty("/header")).concat(this.exportKpiRows("department")),
                charts: [
                    { title: "월별 비용 추이", controlId: "departmentTrendChart", sourceSectionTitle: "월별 비용 추이", width: 720, height: 360 },
                    { title: "계정/구성별 비용", controlId: "departmentCompositionChart", sourceSectionTitle: "계정/구성별 비용", width: 620, height: 360 }
                ],
                sections: [
                    this.exportSection("월별 비용 추이", oModel.getProperty("/monthlyTrend"), [
                        { label: "기간", property: "periodText" },
                        { label: "실적", value: function (oRow) { return this.exportAmount(oRow.actualAmount); }.bind(this) },
                        { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) },
                        { label: "전월대비", value: function (oRow) { return this.exportAmount(oRow.momAmount); }.bind(this) },
                        { label: "전표 건수", property: "documentCount" }
                    ]),
                    this.exportSection("계정/구성별 비용", oModel.getProperty("/accountComposition"), this._compositionExportColumns()),
                    this.exportSection("하위 코스트센터 현황", oModel.getProperty("/childCostCenterRows"), this._costCenterLikeExportColumns()),
                    this.exportSection("비용 계정", oModel.getProperty("/costRows"), this._accountExportColumns()),
                    this.exportSection("제조원가 흐름", oModel.getProperty("/manufacturingFlowRows"), this._accountExportColumns()),
                    this.exportSection("정산 검증", oModel.getProperty("/clearingValidationRows"), this._accountExportColumns()),
                    this.exportSection("원천 풀", oModel.getProperty("/sourcePoolRows"), this._accountExportColumns()),
                    this.exportSection("원장 계정", oModel.getProperty("/ledgerRows"), this._accountExportColumns())
                ]
            };
        },

        _compositionExportColumns: function () {
            return [
                { label: "구성", property: "compositionLabel" },
                { label: "계정", property: "accountLabel" },
                { label: "계정 성격", property: "accountRoleText" },
                { label: "금액", value: function (oRow) { return this.exportAmount(oRow.amount); }.bind(this) },
                { label: "비중", value: function (oRow) { return this.exportRate(oRow.ratio); }.bind(this), type: "text", summary: false },
                { label: "전표 건수", property: "documentCount" }
            ];
        },

        _costCenterLikeExportColumns: function () {
            return [
                { label: "코드", property: "kostl" },
                { label: "명칭", property: "kostlTxt" },
                { label: "책임자", property: "manager" },
                { label: "실적", value: function (oRow) { return this.exportAmount(oRow.actualAmount); }.bind(this) },
                { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) },
                { label: "차이", value: function (oRow) { return this.exportAmount(oRow.varianceAmount); }.bind(this) },
                { label: "전표 건수", property: "documentCount" }
            ];
        },

        _accountExportColumns: function () {
            return [
                { label: "계정", property: "saknr" },
                { label: "계정명", property: "accountName" },
                { label: "계정 성격", property: "accountRoleText" },
                { label: "실적", value: function (oRow) { return this.exportAmount(oRow.actualAmount || oRow.amount); }.bind(this) },
                { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) },
                { label: "차이", value: function (oRow) { return this.exportAmount(oRow.varianceAmount); }.bind(this) },
                { label: "비중", value: function (oRow) { return this.exportRate(oRow.ratio); }.bind(this), type: "text", summary: false },
                { label: "전표 건수", property: "documentCount" }
            ];
        },

        normalizeFilters: function (oFilters) {
            return BaseController.prototype.normalizeFilters.call(this, oFilters);
        },

        onInit: function () {
            this._routeOrgId = "";
            this.getView().setModel(this.createViewModel({
                activeMenu: "department",
                pageTitle: "비용 상세 분석",
                functionalAreaAvailable: false,
                detailTableTitle: "하위 코스트센터 현황",
                detailTableSubTitle: "코스트센터 기준 코스트센터별 비용",
                compositionDimensionName: "구성항목",
                selectedCompositionTitle: "선택 계정 요약",
                selectedCompositionKeyTitle: "선택 계정",
                selectedCompositionRoleVisible: true,
                selectedCompositionCanOpenDocuments: true,
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
                accountRows: [],
                accountTabKey: "ledger",
                isProductionScope: false,
                manufacturingFlowRows: [],
                clearingValidationRows: [],
                sourcePoolRows: [],
                ledgerRows: [],
                costRows: [],
                manufacturingFlowSummary: {},
                clearingValidationSummary: {},
                sourcePoolSummary: {},
                ledgerSummary: {},
                costSummary: {}
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

        _previousRowsByOrg: function (aActualRows, aPreviousYearRows, oFilters, oSelectedOrg) {
            var aPreviousBaseRows;

            if (this.service.normalizeMonth(oFilters.period) === "01") {
                aPreviousBaseRows = aPreviousYearRows || [];
            } else {
                aPreviousBaseRows = (aActualRows || []).filter(function (oRow) {
                    return this.service.normalizeMonth(this.service.getField(oRow, "monat")) === this.service.normalizeMonth(String(Number(oFilters.period) - 1));
                }.bind(this));
            }

            return this.service.filterByOrg(aPreviousBaseRows, "kostl", oSelectedOrg);
        },

        _countUniqueCostCenters: function (aRows) {
            return this.service.uniqueNormalizedValues(aRows, "kostl").length;
        },

        _decorateAccountCompositionRows: function (aRows, aDocumentRows) {
            return this.decorateAccountCompositionRows(aRows, aDocumentRows).map(function (oRow) {
                return Object.assign({}, oRow, {
                    compositionType: "ACCOUNT",
                    compositionKey: oRow.saknr,
                    compositionLabel: oRow.accountLabel || oRow.accountName
                });
            });
        },

        _documentRouteOrgId: function () {
            var oModel = this.getView().getModel("department");
            var oSelectedOrg = oModel.getProperty("/selectedOrg") || {};

            return oSelectedOrg.childId || this._routeOrgId || "ALL";
        },

        _applyDepartmentData: function (oFilters, aHierarchyRows, aActualRows, aBudgetRows, aPreviousYearRows, aDocumentRows) {
            var oModel = this.getView().getModel("department");
            var bFunctionalAreaAvailable = this.service.hasFunctionalAreaField(aActualRows);
            var oSelectedOrg = this.setHierarchyOptions("department", aHierarchyRows, oFilters.orgNodeId || this._routeOrgId);
            var oTextMaps = this.service.buildCostCenterTextMaps(aHierarchyRows, aActualRows, aDocumentRows);
            var aScopedActualRows;
            var aScopedBudgetRows;
            var aScopedDocumentRows;
            var aCurrentDocumentRows;
            var aCumulativeActualRows;
            var aCumulativeBudgetRows;
            var aCurrentActualRows;
            var aPreviousActualRows;
            var bProductionScope;
            var aCostActualRows;
            var aCostBudgetRows;
            var aCostDocumentRows;
            var aCostCurrentDocumentRows;
            var aCostCumulativeActualRows;
            var aCostCumulativeBudgetRows;
            var aCostCurrentActualRows;
            var aCostPreviousActualRows;
            var aEffectiveScopeRows;
            var aEffectiveBudgetRows;
            var aEffectiveDocumentRows;
            var aEffectiveCurrentDocumentRows;
            var aEffectiveCumulativeActualRows;
            var aEffectiveCumulativeBudgetRows;
            var aEffectiveCurrentActualRows;
            var aEffectivePreviousActualRows;
            var fTotalActual;
            var fCurrentActual;
            var fPreviousActual;
            var fTotalBudget;
            var fBudgetVariance;
            var fBudgetRate;
            var fMom;
            var sMomSubText;
            var aTrendRows;
            var aChildRows;
            var aAccountRows;
            var aLedgerAccountRows;
            var aManufacturingFlowRows;
            var aClearingValidationRows;
            var aSourcePoolRows;
            var aLedgerRows;
            var oManufacturingFlowSummary;
            var oClearingValidationSummary;
            var oSourcePoolSummary;
            var oLedgerSummary;
            var oCostSummary;
            var oAccountSummary;
            var aCompositionActualRows;
            var aCompositionRows;
            var iDocumentCount;
            var iCostCenterCount;
            var bHasTrendData;
            var bHasCompositionData;
            var sHeaderTitle;
            var sRoleText;
            var sPageTitle;
            var sScopeText;
            var sCompositionTitle;
            var aKpis;

            oFilters = Object.assign({}, oFilters || {});
            oSelectedOrg = this.applyResolvedOrgSelection("department", oSelectedOrg, oTextMaps);
            oFilters.orgNodeId = oSelectedOrg.childId || "";
            oFilters.orgNodeText = oSelectedOrg.nodeText || "";

            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/functionalAreaAvailable", bFunctionalAreaAvailable);

            aScopedActualRows = this.service.filterByOrg(aActualRows, "kostl", oSelectedOrg);
            aScopedBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oSelectedOrg);
            aScopedDocumentRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            aCurrentDocumentRows = this.service.currentDocumentRows(aScopedDocumentRows, oFilters.period);
            aCumulativeActualRows = this.service.cumulativeActualRows(aScopedActualRows, oFilters.period);
            aCumulativeBudgetRows = this.service.cumulativeBudgetRows(aScopedBudgetRows, oFilters.period);
            aCurrentActualRows = this.service.currentActualRows(aScopedActualRows, oFilters.period);
            aPreviousActualRows = this._previousRowsByOrg(aActualRows, aPreviousYearRows, oFilters, oSelectedOrg);
            bProductionScope = this.service.isProductionOrgSelection(oSelectedOrg);
            aCostActualRows = this.service.filterCostPerspectiveRows(aScopedActualRows, "saknr");
            aCostBudgetRows = this.service.filterCostPerspectiveRows(aScopedBudgetRows, "Saknr");
            aCostDocumentRows = this.service.filterCostPerspectiveRows(aScopedDocumentRows, "Saknr");
            aCostCurrentDocumentRows = this.service.currentDocumentRows(aCostDocumentRows, oFilters.period);
            aCostCumulativeActualRows = this.service.cumulativeActualRows(aCostActualRows, oFilters.period);
            aCostCumulativeBudgetRows = this.service.cumulativeBudgetRows(aCostBudgetRows, oFilters.period);
            aCostCurrentActualRows = this.service.currentActualRows(aCostActualRows, oFilters.period);
            aCostPreviousActualRows = this.service.filterCostPerspectiveRows(aPreviousActualRows, "saknr");
            aEffectiveScopeRows = bProductionScope ? aScopedActualRows : aCostActualRows;
            aEffectiveBudgetRows = bProductionScope ? aScopedBudgetRows : aCostBudgetRows;
            aEffectiveDocumentRows = bProductionScope ? aScopedDocumentRows : aCostDocumentRows;
            aEffectiveCurrentDocumentRows = bProductionScope ? aCurrentDocumentRows : aCostCurrentDocumentRows;
            aEffectiveCumulativeActualRows = bProductionScope ? aCumulativeActualRows : aCostCumulativeActualRows;
            aEffectiveCumulativeBudgetRows = bProductionScope ? aCumulativeBudgetRows : aCostCumulativeBudgetRows;
            aEffectiveCurrentActualRows = bProductionScope ? aCurrentActualRows : aCostCurrentActualRows;
            aEffectivePreviousActualRows = bProductionScope ? aPreviousActualRows : aCostPreviousActualRows;
            fTotalActual = this.service.sum(aEffectiveCumulativeActualRows, "amount");
            fCurrentActual = this.service.sum(aEffectiveCurrentActualRows, "amount");
            fPreviousActual = this.service.sum(aEffectivePreviousActualRows, "amount");
            fTotalBudget = this.service.sum(aEffectiveCumulativeBudgetRows, "BudgetAmt");
            fBudgetVariance = fTotalBudget ? fTotalActual - fTotalBudget : null;
            fBudgetRate = fTotalBudget ? fBudgetVariance / fTotalBudget * 100 : null;
            fMom = aEffectivePreviousActualRows.length ? fCurrentActual - fPreviousActual : null;
            sMomSubText = aEffectivePreviousActualRows.length ? "전월 기준" : "전월 데이터 없음";
            aTrendRows = this.decorateMonthlyTrendRows(
                this.service.buildMonthlyTrend(aEffectiveScopeRows, aEffectiveBudgetRows),
                aEffectiveDocumentRows,
                oFilters
            );
            aChildRows = this.service.aggregateCostCenters(
                aEffectiveCumulativeActualRows,
                aEffectiveCumulativeBudgetRows,
                aEffectiveCurrentActualRows,
                aEffectivePreviousActualRows,
                aHierarchyRows,
                aEffectiveCurrentDocumentRows
            );
            aAccountRows = this.service.aggregateAccounts(
                aEffectiveCumulativeActualRows,
                aEffectiveCumulativeBudgetRows,
                aEffectiveCurrentActualRows,
                aEffectivePreviousActualRows,
                aEffectiveCurrentDocumentRows
            );
            aLedgerAccountRows = this.service.aggregateAccounts(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aCurrentDocumentRows
            );
            aManufacturingFlowRows = this.service.buildManufacturingFlowRows(aLedgerAccountRows);
            aClearingValidationRows = this.service.buildClearingValidationRows(aLedgerAccountRows);
            aSourcePoolRows = this.service.buildSourcePoolRows(aLedgerAccountRows);
            aLedgerRows = this.service.buildLedgerRows(aLedgerAccountRows);
            oManufacturingFlowSummary = this.service.buildManufacturingFlowSummary(aLedgerAccountRows);
            oClearingValidationSummary = this.service.buildClearingValidationSummary(aClearingValidationRows);
            oSourcePoolSummary = this.service.summarizeRows(aSourcePoolRows);
            oLedgerSummary = this.service.summarizeRows(aLedgerRows);
            oCostSummary = {
                actualAmount: this.service.sum(aAccountRows, "actualAmount"),
                currentAmount: this.service.sum(aAccountRows, "currentAmount"),
                previousAmount: this.service.sum(aAccountRows, "previousAmount"),
                documentCount: this.service.sum(aAccountRows, "documentCount")
            };
            oAccountSummary = bProductionScope ? oLedgerSummary : oCostSummary;
            aCompositionActualRows = bProductionScope ? aCumulativeActualRows.filter(function (oRow) {
                return this.service.isManufacturingFlowAccount(this.service.getField(oRow, "saknr"));
            }.bind(this)) : aEffectiveCumulativeActualRows;

            aCompositionRows = this._decorateAccountCompositionRows(
                this.service.buildAccountComposition(aCompositionActualRows),
                aEffectiveCurrentDocumentRows
            );
            sCompositionTitle = bProductionScope ? "제조원가 흐름 구성" : "비용계정별 구성";

            iDocumentCount = this.service.distinctCostDocumentCount(aEffectiveCurrentDocumentRows);
            iCostCenterCount = this._countUniqueCostCenters(aCumulativeActualRows.length ? aCumulativeActualRows : aScopedActualRows);

            if (!aScopedBudgetRows.length) {
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
            bHasCompositionData = aCompositionRows.length > 0;
            sHeaderTitle = this.service.buildDepartmentHeaderTitle(oSelectedOrg);
            sRoleText = oSelectedOrg.nodeType === "L" &&
                oSelectedOrg.rawCostCenterText &&
                this.service.normalizeTextKey(oSelectedOrg.rawCostCenterText) !== this.service.normalizeTextKey(sHeaderTitle) ?
                oSelectedOrg.rawCostCenterText :
                "";

            sHeaderTitle = sHeaderTitle || "전체 조직";
            sPageTitle = this.service.buildDepartmentPageTitle(oSelectedOrg);
            sScopeText = iCostCenterCount > 1 ? "하위 코스트센터 " + this.formatter.amount(iCostCenterCount) + "개 포함" : "단일 코스트센터";
            oModel.setProperty("/detailTableTitle", "하위 코스트센터 현황");
            oModel.setProperty("/detailTableSubTitle", "코스트센터 기준 코스트센터별 비용");

            if (bProductionScope) {
                aKpis = [
                    this.createKpi("장부 순잔액", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "해당 연도의 누적 장부 순비용", "None", "sap-icon://wallet"),
                    this.createKpi("이번달 장부 순잔액", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), "조회월에 발생한 장부 순비용", "None", "sap-icon://calendar"),
                    this.createKpi("제조원가 흐름 순액", this.formatter.amountWithCurrency(oManufacturingFlowSummary.netAmount, "KRW"), "투입과 입고 차감을 반영한 제조원가 순액", "None", "sap-icon://workflow-tasks"),
                    this.createKpi("제조입고 차감액", this.formatter.amountWithCurrency(oManufacturingFlowSummary.receiptAmount, "KRW"), "제품/재고로 이동되어 차감된 금액", "None", "sap-icon://factory"),
                    this.createKpi("생산실적 상쇄잔액", this.formatter.amountWithCurrency(oClearingValidationSummary.netAmount, "KRW"), "차감 기록과 배부 귀속액의 차이", oClearingValidationSummary.netAmount ? "Warning" : "Success", "sap-icon://compare"),
                    this.createKpi("배부대상 제조비", this.formatter.amountWithCurrency(oSourcePoolSummary.actualAmount, "KRW"), "활동단가 산출과 배부의 기준 금액", "None", "sap-icon://database")
                ];
            } else {
                aKpis = [
                    this.createKpi("장부 순잔액", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "해당 연도의 누적 장부 순비용", "None", "sap-icon://wallet"),
                    this.createKpi("이번달 장부 순잔액", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), "조회월에 발생한 장부 순비용", "None", "sap-icon://calendar"),
                    this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", iDocumentCount ? "조회월에 집계된 비용 전표 건수" : "조회월 전표 데이터 없음", "None", "sap-icon://documents"),
                    this.createKpi("하위 코스트센터 수", this.formatter.amount(iCostCenterCount) + "개", "선택 범위에 포함된 코스트센터 수", "None", "sap-icon://org-chart"),
                    this.createKpi("전월대비", fMom === null ? "-" : this.formatter.amountWithCurrency(fMom, "KRW"), fMom === null ? "비교할 전월 데이터 없음" : "조회월 비용과 전월 비용의 차이", this.formatter.valueStateByDelta(fMom), "sap-icon://trend-up")
                ];
            }

            oModel.setProperty("/pageTitle", sPageTitle);
            oModel.setProperty("/header", {
                title: sHeaderTitle,
                statusText: "정상",
                statusState: "Success",
                basisText: "코스트센터 기준",
                roleText: sRoleText,
                roleVisible: !!sRoleText,
                displayCostCenterText: oSelectedOrg.displayCostCenterText || oSelectedOrg.nodeText || "",
                code: oSelectedOrg.childId || "ALL",
                manager: oSelectedOrg.manager || "-",
                company: "0001",
                period: oFilters.gjahr + "년 " + oFilters.period + "월 누적",
                scopeText: sScopeText,
                currency: "KRW",
                profitCenterVisible: !!(aChildRows[0] && aChildRows[0].prctr),
                profitCenterText: aChildRows[0] && aChildRows[0].prctrDisplayText || "-",
                segmentVisible: !!(aChildRows[0] && aChildRows[0].segment),
                segmentText: aChildRows[0] && aChildRows[0].segmentDisplayText || "-",
                functionalAreaVisible: bFunctionalAreaAvailable,
                functionalAreaText: aChildRows[0] && aChildRows[0].fkberDisplayText || "-"
            });
            oModel.setProperty("/kpis", aKpis);
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
            oModel.setProperty("/selectedCompositionTitle", "선택 계정 요약");
            oModel.setProperty("/selectedCompositionKeyTitle", "선택 계정");
            oModel.setProperty("/selectedCompositionRoleVisible", true);
            oModel.setProperty("/selectedCompositionCanOpenDocuments", true);
            oModel.setProperty("/childCostCenterRows", aChildRows);
            oModel.setProperty("/accountRows", aAccountRows);
            oModel.setProperty("/accountSummary", oAccountSummary);
            oModel.setProperty("/isProductionScope", bProductionScope);
            oModel.setProperty("/accountTabKey", bProductionScope ? "manufacturingFlow" : "costAccounts");
            oModel.setProperty("/manufacturingFlowRows", aManufacturingFlowRows);
            oModel.setProperty("/clearingValidationRows", aClearingValidationRows);
            oModel.setProperty("/sourcePoolRows", aSourcePoolRows);
            oModel.setProperty("/ledgerRows", aLedgerRows);
            oModel.setProperty("/costRows", aAccountRows);
            oModel.setProperty("/manufacturingFlowSummary", oManufacturingFlowSummary);
            oModel.setProperty("/clearingValidationSummary", oClearingValidationSummary);
            oModel.setProperty("/sourcePoolSummary", oSourcePoolSummary);
            oModel.setProperty("/ledgerSummary", oLedgerSummary);
            oModel.setProperty("/costSummary", oCostSummary);
            oModel.setProperty("/compositionTitle", sCompositionTitle);
            oModel.setProperty("/showPrctrColumns", true);
            oModel.setProperty("/showSegmentColumns", true);
            oModel.setProperty("/showFunctionalAreaColumns", bFunctionalAreaAvailable);

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
            var sAccountText = this.extractVizDataValue(oEvent, "구성항목");
            var aCompositionRows = oModel.getProperty("/accountComposition") || [];
            var oSummary = this.buildSelectedAccountSummary(sAccountText, aCompositionRows);
            var bAccountComposition = !!(oSummary && oSummary.compositionType === "ACCOUNT");

            oModel.setProperty("/selectedAccountKey", sAccountText);
            oModel.setProperty("/selectedAccountSummary", oSummary || {});
            oModel.setProperty("/hasSelectedAccountSummary", !!oSummary);
            oModel.setProperty("/selectedCompositionTitle", bAccountComposition ? "선택 계정 요약" : "선택 구성 요약");
            oModel.setProperty("/selectedCompositionKeyTitle", bAccountComposition ? "선택 계정" : "선택 항목");
            oModel.setProperty("/selectedCompositionRoleVisible", bAccountComposition);
            oModel.setProperty("/selectedCompositionCanOpenDocuments", bAccountComposition);
        },

        onGoSelectedAccountDocuments: function () {
            var oModel = this.getView().getModel("department");
            var oSelectedOrg = oModel.getProperty("/selectedOrg") || {};
            var oAccount = oModel.getProperty("/selectedAccountSummary") || {};

            if (oAccount.saknr && oAccount.saknr !== "ETC" && oAccount.compositionType === "ACCOUNT") {
                this.navToDocuments(this._documentRouteOrgId(), oAccount.saknr, "current");
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

            if (oRow && oRow.saknr) {
                this.navToDocuments(this._documentRouteOrgId(), oRow.saknr, "current");
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
            this.navToDocuments(this._documentRouteOrgId(), null, "current");
        }
    });
});
