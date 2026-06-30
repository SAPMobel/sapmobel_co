sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    var COST_CENTER_TABLE_TITLE = "코스트센터 기준 비용 현황";

    return BaseController.extend("ZE4_CC_COST.controller.Dashboard", {
        getModelName: function () {
            return "dashboard";
        },

        buildExportReport: function () {
            var oModel = this.getView().getModel("dashboard");

            return {
                title: "[EverNiture-CO] 부서별 비용분석 대시보드",
                fileName: "CostCenterDashboard",
                variant: "costcenter",
                description: "부서별 비용 KPI, 월별 추이, 기능영역/계정 구성 차트 및 코스트센터 rows 리포트",
                filters: this.exportFilterRows("dashboard"),
                summary: this.exportKpiRows("dashboard"),
                charts: [
                    { title: "월별 비용 추이", controlId: "trendChart", sourceSectionTitle: "월별 비용 추이", width: 720, height: 360 },
                    { title: "기능영역별 비용 비중", controlId: "functionalAreaShareChart", sourceSectionTitle: "기능영역별 비용 비중", width: 620, height: 360 },
                    { title: "계정별 비용 구성", controlId: "compositionChart", sourceSectionTitle: "계정별 비용 구성", width: 620, height: 360 }
                ],
                sections: [
                    this.exportSection("월별 비용 추이", oModel.getProperty("/monthlyTrend"), [
                        { label: "기간", property: "periodText" },
                        { label: "실적", value: function (oRow) { return this.exportAmount(oRow.actualAmount); }.bind(this) },
                        { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) },
                        { label: "전월대비", value: function (oRow) { return this.exportAmount(oRow.momAmount); }.bind(this) },
                        { label: "전표 건수", property: "documentCount" }
                    ]),
                    this.exportSection("기능영역별 비용 비중", oModel.getProperty("/functionalAreaShareRows"), [
                        { label: "기능영역", property: "displayText" },
                        { label: "금액", value: function (oRow) { return this.exportAmount(oRow.amount); }.bind(this) },
                        { label: "비중", value: function (oRow) { return this.exportRate(oRow.ratio); }.bind(this), type: "text", summary: false },
                        { label: "전표 건수", property: "documentCount" }
                    ]),
                    this.exportSection("계정별 비용 구성", oModel.getProperty("/accountComposition"), [
                        { label: "계정", property: "accountLabel" },
                        { label: "구성", property: "compositionLabel" },
                        { label: "금액", value: function (oRow) { return this.exportAmount(oRow.amount); }.bind(this) },
                        { label: "비중", value: function (oRow) { return this.exportRate(oRow.ratio); }.bind(this), type: "text", summary: false },
                        { label: "전표 건수", property: "documentCount" }
                    ]),
                    this.exportSection("조직 구조 요약", this.flattenExportTreeRows(oModel.getProperty("/orgTreeRows")), [
                        { label: "레벨", property: "exportDepth" },
                        { label: "조직/코스트센터", property: "exportIndentText" },
                        { label: "코드", property: "childId" },
                        { label: "책임자", property: "manager" },
                        { label: "금액", value: function (oRow) { return this.exportAmount(oRow.amount); }.bind(this) },
                        { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) }
                    ]),
                    this.exportSection("코스트센터 기준 비용 현황", oModel.getProperty("/costCenterRows"), this._costCenterExportColumns())
                ]
            };
        },

        _costCenterExportColumns: function () {
            return [
                { label: "코스트센터", property: "kostl" },
                { label: "코스트센터명", property: "kostlTxt" },
                { label: "책임자", property: "manager" },
                { label: "실적", value: function (oRow) { return this.exportAmount(oRow.actualAmount); }.bind(this) },
                { label: "예산", value: function (oRow) { return this.exportAmount(oRow.budgetAmount); }.bind(this) },
                { label: "차이", value: function (oRow) { return this.exportAmount(oRow.varianceAmount); }.bind(this) },
                { label: "전월대비", value: function (oRow) { return this.exportAmount(oRow.momAmount); }.bind(this) },
                { label: "전표 건수", property: "documentCount" }
            ];
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
                functionalAreaShareRows: [],
                selectedFkberSummary: {},
                hasFunctionalAreaShareData: false,
                hasSelectedFunctionalAreaSummary: false,
                hierarchyTitle: "조직 구조 요약",
                hierarchyNameLabel: "조직/코스트센터",
                hierarchyOwnerLabel: "책임자",
                tableKeyLabel: "코스트센터",
                tableNameLabel: "코스트센터명",
                tableOwnerLabel: "책임자",
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
                this.service.readHierarchyRows("CCSH1000").catch(function () {
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

        _previousRowsByOrg: function (aActualRows, aPreviousYearRows, oFilters, oSelectedOrg) {
            var sPreviousPeriod = this.service.normalizeMonth(String(Number(oFilters.period) - 1));
            var aBaseRows = this.service.normalizeMonth(oFilters.period) === "01" ? (aPreviousYearRows || []) : (aActualRows || []);
            var aScopedRows = this.service.filterByOrg(aBaseRows, "kostl", oSelectedOrg);

            if (this.service.normalizeMonth(oFilters.period) === "01") {
                return aScopedRows;
            }

            return this.service.currentActualRows(aScopedRows, sPreviousPeriod);
        },

        _documentKey: function (oRow) {
            return [
                this.service.getField(oRow, "Bukrs"),
                this.service.getField(oRow, "Gjahr"),
                this.service.getField(oRow, "Monat"),
                this.service.getField(oRow, "Kostl"),
                this.service.getField(oRow, "Belnr")
            ].map(this.service.clean).join("|");
        },

        _buildFunctionalAreaShareChartData: function (aRows, aCurrentRows, aDocumentRows) {
            var mRows = {};
            var mKostlArea = {};
            var fTotalAbs = 0;

            function ensureGroup(oController, oRow) {
                var sFkber = oController.service.getFunctionalAreaKey(oRow);
                var sFkberTxt = oController.service.getFunctionalAreaText(oRow);

                if (!sFkber) {
                    return null;
                }

                if (!mRows[sFkber]) {
                    mRows[sFkber] = {
                        fkber: sFkber,
                        fkberTxt: sFkberTxt,
                        displayText: oController.service.textOrCode(sFkberTxt, sFkber),
                        amount: 0,
                        currentAmount: 0,
                        costCenters: {},
                        documentRows: []
                    };
                } else if (!mRows[sFkber].fkberTxt && sFkberTxt) {
                    mRows[sFkber].fkberTxt = sFkberTxt;
                    mRows[sFkber].displayText = oController.service.textOrCode(sFkberTxt, sFkber);
                }

                return mRows[sFkber];
            }

            (aRows || []).forEach(function (oRow) {
                var oGroup = ensureGroup(this, oRow);
                var sKostl = this.service.normalizeNodeId(this.service.getField(oRow, "kostl"));

                if (!oGroup) {
                    return;
                }

                oGroup.amount += Number(this.service.getField(oRow, "amount") || 0);

                if (sKostl) {
                    oGroup.costCenters[sKostl] = true;
                    mKostlArea[sKostl] = oGroup.fkber;
                }
            }.bind(this));

            (aCurrentRows || []).forEach(function (oRow) {
                var oGroup = ensureGroup(this, oRow);

                if (!oGroup) {
                    return;
                }

                oGroup.currentAmount += Number(this.service.getField(oRow, "amount") || 0);
            }.bind(this));

            (aDocumentRows || []).forEach(function (oRow) {
                var sKostl = this.service.normalizeNodeId(this.service.getField(oRow, "Kostl"));
                var sFkber = mKostlArea[sKostl];

                if (!sFkber || !mRows[sFkber]) {
                    return;
                }

                mRows[sFkber].documentRows.push(oRow);
            }.bind(this));

            Object.keys(mRows).forEach(function (sFkber) {
                fTotalAbs += Math.abs(mRows[sFkber].amount || 0);
            });

            return Object.keys(mRows).map(function (sFkber) {
                var oGroup = mRows[sFkber];
                var fRatio = fTotalAbs ? Math.abs(oGroup.amount || 0) / fTotalAbs * 100 : 0;

                return Object.assign(oGroup, {
                    chartAmount: Math.abs(oGroup.amount || 0),
                    ratio: fRatio,
                    ratioText: Math.round(fRatio * 10) / 10 + "%",
                    costCenterCount: Object.keys(oGroup.costCenters).length,
                    documentCount: this.service.distinctCostDocumentCount(oGroup.documentRows)
                });
            }.bind(this)).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                    this.service.clean(oFirst.fkber).localeCompare(this.service.clean(oSecond.fkber));
            }.bind(this));
        },

        _buildFunctionalAreaSummary: function (aRows, sFkber) {
            var sSelectedFkber = this.service.normalizeNodeId(sFkber);

            return (aRows || []).find(function (oRow) {
                return oRow.fkber === sSelectedFkber;
            }) || null;
        },

        _markCostCentersByFunctionalArea: function (aRows, sFkber) {
            var sSelectedFkber = this.service.normalizeNodeId(sFkber);

            return (aRows || []).map(function (oRow) {
                var bHighlighted = !!sSelectedFkber && this.service.normalizeNodeId(oRow.fkber) === sSelectedFkber;

                return Object.assign({}, oRow, {
                    functionalAreaHighlighted: bHighlighted,
                    functionalAreaHighlightState: bHighlighted ? "Information" : "None"
                });
            }.bind(this));
        },

        _applyDashboardData: function (oFilters, aHierarchyRows, aActualRows, aBudgetRows, aPreviousYearRows, aDocumentRows) {
            var oModel = this.getView().getModel("dashboard");
            var oSelectedOrg = this.setHierarchyOptions("dashboard", aHierarchyRows, oFilters.orgNodeId);
            var oTextMaps = this.service.buildCostCenterTextMaps(aHierarchyRows, aActualRows, aDocumentRows);
            oSelectedOrg = this.applyResolvedOrgSelection("dashboard", oSelectedOrg, oTextMaps);
            var aOrgActualRows = this.service.filterByOrg(aActualRows, "kostl", oSelectedOrg);
            var aOrgBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oSelectedOrg);
            var aOrgDocumentRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            var aCurrentDocumentRows = this.service.currentDocumentRows(aOrgDocumentRows, oFilters.period);
            var aCumulativeActualRows = this.service.cumulativeActualRows(aOrgActualRows, oFilters.period);
            var aCumulativeBudgetRows = this.service.cumulativeBudgetRows(aOrgBudgetRows, oFilters.period);
            var aCurrentActualRows = this.service.currentActualRows(aOrgActualRows, oFilters.period);
            var aPreviousActualRows = this._previousRowsByOrg(aActualRows, aPreviousYearRows, oFilters, oSelectedOrg);
            var bProductionScope = this.service.isProductionOrgSelection(oSelectedOrg);
            var aCostOrgActualRows = this.service.filterCostPerspectiveRows(aOrgActualRows, "saknr");
            var aCostOrgBudgetRows = this.service.filterCostPerspectiveRows(aOrgBudgetRows, "Saknr");
            var aCostOrgDocumentRows = this.service.filterCostPerspectiveRows(aOrgDocumentRows, "Saknr");
            var aCostCurrentDocumentRows = this.service.currentDocumentRows(aCostOrgDocumentRows, oFilters.period);
            var aCostCumulativeActualRows = this.service.cumulativeActualRows(aCostOrgActualRows, oFilters.period);
            var aCostCumulativeBudgetRows = this.service.cumulativeBudgetRows(aCostOrgBudgetRows, oFilters.period);
            var aCostCurrentActualRows = this.service.currentActualRows(aCostOrgActualRows, oFilters.period);
            var aCostPreviousActualRows = this.service.filterCostPerspectiveRows(aPreviousActualRows, "saknr");
            var aEffectiveOrgActualRows = bProductionScope ? aOrgActualRows : aCostOrgActualRows;
            var aEffectiveOrgBudgetRows = bProductionScope ? aOrgBudgetRows : aCostOrgBudgetRows;
            var aEffectiveOrgDocumentRows = bProductionScope ? aOrgDocumentRows : aCostOrgDocumentRows;
            var aEffectiveCurrentDocumentRows = bProductionScope ? aCurrentDocumentRows : aCostCurrentDocumentRows;
            var aEffectiveCumulativeActualRows = bProductionScope ? aCumulativeActualRows : aCostCumulativeActualRows;
            var aEffectiveCumulativeBudgetRows = bProductionScope ? aCumulativeBudgetRows : aCostCumulativeBudgetRows;
            var aEffectiveCurrentActualRows = bProductionScope ? aCurrentActualRows : aCostCurrentActualRows;
            var aEffectivePreviousActualRows = bProductionScope ? aPreviousActualRows : aCostPreviousActualRows;
            var fTotalActual = this.service.sum(aEffectiveCumulativeActualRows, "amount");
            var fTotalBudget = this.service.sum(aEffectiveCumulativeBudgetRows, "BudgetAmt");
            var fCurrentActual = this.service.sum(aEffectiveCurrentActualRows, "amount");
            var fPreviousActual = this.service.sum(aEffectivePreviousActualRows, "amount");
            var aAccountRows = this.service.aggregateAccounts(
                aCumulativeActualRows,
                aCumulativeBudgetRows,
                aCurrentActualRows,
                aPreviousActualRows,
                aCurrentDocumentRows
            );
            var aClearingValidationRows = this.service.buildClearingValidationRows(aAccountRows);
            var aSourcePoolRows = this.service.buildSourcePoolRows(aAccountRows);
            var oManufacturingFlowSummary = this.service.buildManufacturingFlowSummary(aAccountRows);
            var oClearingValidationSummary = this.service.buildClearingValidationSummary(aClearingValidationRows);
            var oSourcePoolSummary = this.service.summarizeRows(aSourcePoolRows);
            var bHasPreviousActual = aEffectivePreviousActualRows.length > 0;
            var fBudgetVariance = fTotalBudget ? fTotalActual - fTotalBudget : null;
            var fBudgetRate = fTotalBudget ? fBudgetVariance / fTotalBudget * 100 : null;
            var fMom = bHasPreviousActual ? fCurrentActual - fPreviousActual : null;
            var sMomSubText = bHasPreviousActual ? "조회월 비용과 전월 비용의 차이" : "비교할 전월 데이터 없음";
            var aTrendRows = this.decorateMonthlyTrendRows(
                this.service.buildMonthlyTrend(aEffectiveOrgActualRows, aEffectiveOrgBudgetRows),
                aEffectiveOrgDocumentRows,
                oFilters
            );
            var aOrgTreeRows = this.service.buildOrgRollupTree(aHierarchyRows, aEffectiveCumulativeActualRows, oSelectedOrg);
            var aCostCenterRows = this.service.aggregateCostCenters(
                aEffectiveCumulativeActualRows,
                aEffectiveCumulativeBudgetRows,
                aEffectiveCurrentActualRows,
                aEffectivePreviousActualRows,
                aHierarchyRows,
                aEffectiveCurrentDocumentRows
            );
            var aCompositionActualRows = bProductionScope ? aCumulativeActualRows.filter(function (oRow) {
                return this.service.isManufacturingFlowAccount(this.service.getField(oRow, "saknr"));
            }.bind(this)) : aEffectiveCumulativeActualRows;
            var aCompositionRows = this.decorateAccountCompositionRows(
                this.service.buildAccountComposition(aCompositionActualRows),
                aEffectiveCurrentDocumentRows
            );
            var iDocumentCount = this.service.distinctCostDocumentCount(aEffectiveCurrentDocumentRows);
            var iCostCenterCount = this.service.uniqueNormalizedValues(aEffectiveCumulativeActualRows.length ? aEffectiveCumulativeActualRows : aOrgActualRows, "kostl").length;
            var aFunctionalAreaShareRows = this._buildFunctionalAreaShareChartData(
                aEffectiveCumulativeActualRows,
                aEffectiveCurrentActualRows,
                aEffectiveCurrentDocumentRows
            );
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

            oModel.setProperty("/kpis", bProductionScope ? [
                this.createKpi("장부 순잔액", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "해당 연도의 누적 장부 순비용", "None", "sap-icon://wallet"),
                this.createKpi("이번달 장부 순잔액", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), "조회월에 발생한 장부 순비용", "None", "sap-icon://calendar"),
                this.createKpi("제조원가 흐름 순액", this.formatter.amountWithCurrency(oManufacturingFlowSummary.netAmount, "KRW"), "투입과 입고 차감을 반영한 제조원가 순액", "None", "sap-icon://workflow-tasks"),
                this.createKpi("제조입고 차감액", this.formatter.amountWithCurrency(oManufacturingFlowSummary.receiptAmount, "KRW"), "제품/재고로 이동되어 차감된 금액", "None", "sap-icon://factory"),
                this.createKpi("생산실적 상쇄잔액", this.formatter.amountWithCurrency(oClearingValidationSummary.netAmount, "KRW"), "차감 기록과 배부 귀속액의 차이", oClearingValidationSummary.netAmount ? "Warning" : "Success", "sap-icon://compare"),
                this.createKpi("배부대상 제조비", this.formatter.amountWithCurrency(oSourcePoolSummary.actualAmount, "KRW"), "활동단가 산출과 배부의 기준 금액", "None", "sap-icon://database")
            ] : [
                this.createKpi("장부 순잔액", this.formatter.amountWithCurrency(fTotalActual, "KRW"), "해당 연도의 누적 장부 순비용", "None", "sap-icon://wallet"),
                this.createKpi("이번달 장부 순잔액", this.formatter.amountWithCurrency(fCurrentActual, "KRW"), "조회월에 발생한 장부 순비용", "None", "sap-icon://calendar"),
                this.createKpi("하위 코스트센터 수", this.formatter.amount(iCostCenterCount) + "개", "선택 범위에 포함된 코스트센터 수", "None", "sap-icon://org-chart"),
                this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", iDocumentCount ? "조회월에 집계된 비용 전표 건수" : "조회월 전표 데이터 없음", "None", "sap-icon://documents"),
                this.createKpi("전월대비", fMom === null ? "-" : this.formatter.amountWithCurrency(fMom, "KRW"), sMomSubText, this.formatter.valueStateByDelta(fMom), "sap-icon://trend-up")
            ]);
            oModel.setProperty("/monthlyTrend", aTrendRows);
            oModel.setProperty("/accountComposition", aCompositionRows);
            oModel.setProperty("/accountCompositionList", aCompositionRows);
            oModel.setProperty("/hasTrendData", bHasTrendData);
            oModel.setProperty("/hasCompositionData", bHasCompositionData);
            oModel.setProperty("/functionalAreaShareRows", aFunctionalAreaShareRows);
            oModel.setProperty("/hasFunctionalAreaShareData", aFunctionalAreaShareRows.length > 0);
            oModel.setProperty("/selectedFkberSummary", {});
            oModel.setProperty("/hasSelectedFunctionalAreaSummary", false);
            oModel.setProperty("/selectedMonthSummary", {});
            oModel.setProperty("/selectedAccountSummary", {});
            oModel.setProperty("/selectedAccountKey", "");
            oModel.setProperty("/hasSelectedMonthSummary", false);
            oModel.setProperty("/hasSelectedAccountSummary", false);
            oModel.setProperty("/orgTreeRows", aOrgTreeRows);
            oModel.setProperty("/costCenterRows", this._markCostCentersByFunctionalArea(aCostCenterRows, ""));
            oModel.setProperty("/hasRows", !!aCostCenterRows.length);
            oModel.setProperty("/chartTitle", "월별 비용 추이 (" + oFilters.gjahr + "년)");
            oModel.setProperty("/compositionTitle", (bProductionScope ? "제조원가 흐름 구성 (" : "계정별 비용 구성 (") + oFilters.period + "월 누적)");
            oModel.setProperty("/tableTitle", COST_CENTER_TABLE_TITLE + " (" + oFilters.period + "월 누적)");

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
            this.configureVizFrame(this.byId("functionalAreaShareChart"), this.byId("functionalAreaShareChartPopover"), {
                type: "donut",
                legendPosition: "right"
            });

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

        onFunctionalAreaChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("dashboard");
            var sFunctionalAreaText = this.extractVizDataValue(oEvent, "기능영역");
            var aRows = oModel.getProperty("/functionalAreaShareRows") || [];
            var aCostCenterRows = oModel.getProperty("/costCenterRows") || [];
            var oSummary = aRows.find(function (oRow) {
                return oRow.displayText === sFunctionalAreaText || oRow.fkber === sFunctionalAreaText;
            }) || null;
            oSummary = oSummary && this._buildFunctionalAreaSummary(aRows, oSummary.fkber);

            oModel.setProperty("/selectedFkberSummary", oSummary || {});
            oModel.setProperty("/hasSelectedFunctionalAreaSummary", !!oSummary);
            oModel.setProperty("/costCenterRows", this._markCostCentersByFunctionalArea(aCostCenterRows, oSummary && oSummary.fkber));
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

            if (!oRow || !oRow.childId) {
                return;
            }

            this.navToDepartment(oRow.childId);
        },

        onCostCenterRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();
            if (!oRow || !oRow.kostl) {
                return;
            }

            this.navToDepartment(oRow.kostl);
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
