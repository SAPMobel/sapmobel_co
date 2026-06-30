sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.DocumentDetail", {
        getModelName: function () {
            return "document";
        },

        buildExportReport: function () {
            var oModel = this.getView().getModel("document");

            return {
                title: "[EverNiture-CO] 전표 상세 조회",
                fileName: "DocumentDetail",
                variant: "costcenter",
                description: "전표 헤더, 조회조건, KPI 및 전표 라인 상세 리포트",
                filters: this.exportFilterRows("document", [
                    { label: "계정 필터", property: "accountFilterText" },
                    { label: "기간 범위", property: "periodScope" }
                ]),
                summary: this.exportHeaderRows(oModel.getProperty("/header")).concat(this.exportKpiRows("document")),
                sections: [
                    this.exportSection("전표 라인", oModel.getProperty("/documentRows"), [
                        { label: "전표번호", property: "Belnr" },
                        { label: "전기일자", value: function (oRow) { return this.formatter.date(oRow.Budat); }.bind(this) },
                        { label: "라인", property: "Docln" },
                        { label: "코스트센터", property: "Kostl" },
                        { label: "코스트센터명", property: "KostlTxt" },
                        { label: "G/L 계정", property: "Saknr" },
                        { label: "계정명", property: "SaknrTxt" },
                        { label: "차/대", value: function (oRow) { return this.formatter.drcrkText(oRow.Drcrk, oRow.DrcrkText); }.bind(this) },
                        { label: "금액", value: function (oRow) { return this.exportAmount(oRow.Amount, oRow.Waers); }.bind(this) },
                        { label: "통화", property: "Waers" },
                        { label: "문서유형", property: "DocumentTypeText" },
                        { label: "흐름", value: function (oRow) { return this.formatter.documentFlowText(oRow.FlowType, oRow.FlowText, oRow.Drcrk, oRow.DocumentTypeText); }.bind(this) },
                        { label: "텍스트", property: "Sgtxt" }
                    ])
                ]
            };
        },

        onInit: function () {
            this._routeOrgId = "";
            this._routeSaknr = "";
            this.getView().setModel(this.createViewModel({
                activeMenu: "document",
                pageTitle: "전표 상세 조회",
                accountFilter: "",
                accountFilterText: "",
                periodScope: "current",
                accountValueHelpRows: [],
                accountValueHelpFilteredRows: [],
                header: {},
                kpis: [],
                documentRows: [],
                selectedDocument: {},
                hasSelection: false
            }), "document");

            this.getRouter().getRoute("documentDetail").attachPatternMatched(this._onRouteMatched, this);
            this.getRouter().getRoute("documentDetailWithAccount").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments") || {};
            var oModel = this.getView().getModel("document");
            var sPeriodScope = this.getAppStateModel().getProperty("/documentPeriodScope") || "current";

            this._routeOrgId = decodeURIComponent(oArgs.kostl || "");
            this._routeOrgId = this._routeOrgId === "ALL" ? "" : this._routeOrgId;
            this._routeSaknr = decodeURIComponent(oArgs.saknr || "");
            this.getAppStateModel().setProperty("/resetDashboardOrgFilterOnRoute", true);
            oModel.setProperty("/busy", true);

            this.service.refreshMetadata()
                .then(function () {
                    return this.syncDefaultFilters("document");
                }.bind(this))
                .then(function (oFilters) {
                    var oRouteFilters = Object.assign({}, oFilters, {
                        orgNodeId: this._routeOrgId,
                        orgNodeText: "",
                        saknr: this._routeSaknr,
                        periodScope: sPeriodScope
                    });

                    oModel.setProperty("/filters", oRouteFilters);
                    oModel.setProperty("/periodScope", sPeriodScope);
                    oModel.setProperty("/accountFilter", this._routeSaknr);
                    oModel.setProperty("/accountFilterText", this._routeSaknr);
                    return this._loadDocuments(oRouteFilters);
                }.bind(this))
                .catch(function () {
                    MessageBox.error("전표 상세 데이터를 조회하지 못했습니다.");
                })
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        onSearch: function () {
            var oFilters = this.validateFilters("document");

            if (!oFilters) {
                return;
            }

            oFilters.saknr = this.service.normalizeNodeId(this.getView().getModel("document").getProperty("/accountFilter"));
            oFilters.periodScope = this.getView().getModel("document").getProperty("/periodScope") || "current";
            this._routeOrgId = oFilters.orgNodeId;
            this._routeSaknr = oFilters.saknr;
            this._loadDocuments(oFilters);
        },

        onResetFilters: function () {
            var oModel = this.getView().getModel("document");

            oModel.setProperty("/accountFilter", "");
            oModel.setProperty("/accountFilterText", "");
            BaseController.prototype.onResetFilters.apply(this, arguments);
        },

        _loadDocuments: function (oFilters) {
            var oModel = this.getView().getModel("document");
            var oAccountHelpFilters = Object.assign({}, oFilters, {
                saknr: ""
            });
            var pDocumentRows = this.service.readDocumentRows(oFilters, true, oFilters.periodScope);
            var pAccountHelpRows = oFilters.saknr ? this.service.readDocumentRows(oAccountHelpFilters, true, oFilters.periodScope) : pDocumentRows;

            oModel.setProperty("/busy", true);
            this.setWarning("document", "");

            return Promise.all([
                this.service.readHierarchyRows().catch(function () {
                    this.setWarning("document", "조직/코스트센터 정보를 조회하지 못했습니다. 선택 기준만 적용합니다.");
                    return [];
                }.bind(this)),
                this.service.readActualRows(oFilters).catch(function () {
                    return [];
                }),
                pDocumentRows,
                pAccountHelpRows
            ]).then(function (aResults) {
                this._applyDocumentData(oFilters, aResults[0], aResults[1], aResults[2], aResults[3]);
            }.bind(this)).catch(function () {
                MessageBox.error("전표 상세 데이터를 조회하지 못했습니다.");
            }).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyDocumentData: function (oFilters, aHierarchyRows, aActualRows, aDocumentRows, aAccountHelpDocumentRows) {
            var oModel = this.getView().getModel("document");
            var oSelectedOrg = this.setHierarchyOptions("document", aHierarchyRows, oFilters.orgNodeId || this._routeOrgId);
            var aAccountHelpRows = aAccountHelpDocumentRows || aDocumentRows;
            var oTextMaps = this.service.buildCostCenterTextMaps(aHierarchyRows, aActualRows, (aDocumentRows || []).concat(aAccountHelpRows || []));
            oSelectedOrg = this.applyResolvedOrgSelection("document", oSelectedOrg, oTextMaps);
            var aFilteredRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            var aFilteredAccountHelpRows = this.service.filterByOrg(aAccountHelpRows, "Kostl", oSelectedOrg);
            var aOrgMappedRows = this.service.mapDocumentRows(aFilteredRows, oTextMaps);
            var aOrgAccountHelpMappedRows = this.service.mapDocumentRows(aFilteredAccountHelpRows, oTextMaps);
            var aAccountValueHelpRows = this.service.buildAccountValueHelpRows(aOrgAccountHelpMappedRows);
            var sSelectedSaknr = this.service.normalizeNodeId(oFilters.saknr || this._routeSaknr);
            var oSelectedAccount = aAccountValueHelpRows.find(function (oRow) {
                return oRow.saknr === sSelectedSaknr;
            });
            var aVisibleMappedRows = sSelectedSaknr ? aOrgMappedRows : this.service.filterCostBalanceRows(aOrgMappedRows, "Saknr");
            var aMappedRows = this.service.filterByAccount(aVisibleMappedRows, "Saknr", sSelectedSaknr);
            var fTotalAmount = this.service.sum(aMappedRows, "Amount");
            var fDebitAmount = aMappedRows.filter(function (oRow) {
                return oRow.Drcrk === "S";
            }).reduce(function (fTotal, oRow) {
                return fTotal + Math.abs(oRow.RawAmount || oRow.Amount || 0);
            }, 0);
            var fCreditAmount = aMappedRows.filter(function (oRow) {
                return oRow.Drcrk === "H";
            }).reduce(function (fTotal, oRow) {
                return fTotal + Math.abs(oRow.RawAmount || oRow.Amount || 0);
            }, 0);
            var iDocumentCount = this.service.distinctCostDocumentCount(aMappedRows);
            var oFirst = aMappedRows[0] || {};
            var sOrgTitle = this.service.buildDepartmentHeaderTitle(oSelectedOrg);

            if (!aMappedRows.length) {
                this.setWarning("document", "전표 상세 데이터가 없습니다.");
            }

            oModel.setProperty("/pageTitle", (sOrgTitle || "전체") + " 전표 상세 조회");
            oModel.setProperty("/accountValueHelpRows", aAccountValueHelpRows);
            oModel.setProperty("/accountValueHelpFilteredRows", aAccountValueHelpRows);
            oModel.setProperty("/accountFilter", sSelectedSaknr);
            oModel.setProperty("/accountFilterText", oSelectedAccount ? oSelectedAccount.displayText : (sSelectedSaknr || ""));
            oModel.setProperty("/header", {
                orgText: sOrgTitle || "전체 조직",
                orgCode: oSelectedOrg.childId || "ALL",
                account: sSelectedSaknr || "전체",
                accountText: sSelectedSaknr ? (oSelectedAccount && oSelectedAccount.saknrTxt || oFirst.SaknrTxt || "-") : "전체",
                period: oFilters.gjahr + "년 " + oFilters.period + "월" + (oFilters.periodScope === "cumulative" ? " 누적" : ""),
                documentCount: iDocumentCount,
                lineCount: aMappedRows.length,
                lineCountText: this.formatter.amount(aMappedRows.length) + "건",
                totalAmount: fTotalAmount
            });
            oModel.setProperty("/kpis", [
                Object.assign(this.createKpi("총 전표금액", this.formatter.amountWithCurrency(fTotalAmount, "KRW"), "차대변 반영 금액 합계", "None", "sap-icon://sum"), {
                    valueState: this.formatter.amountState(fTotalAmount)
                }),
                Object.assign(this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", "전표번호 기준", "None", "sap-icon://documents"), {
                    valueState: this.formatter.countState(iDocumentCount)
                }),
                Object.assign(this.createKpi("라인 건수", this.formatter.amount(aMappedRows.length) + "건", "전표라인 기준", "None", "sap-icon://list"), {
                    valueState: this.formatter.countState(aMappedRows.length)
                }),
                Object.assign(this.createKpi("차변 금액", this.formatter.amountWithCurrency(fDebitAmount, "KRW"), "원금액 기준", "Success", "sap-icon://arrow-left"), {
                    valueState: this.formatter.amountState(fDebitAmount)
                }),
                Object.assign(this.createKpi("대변 금액", this.formatter.amountWithCurrency(fCreditAmount, "KRW"), "원금액 기준", "Warning", "sap-icon://arrow-right"), {
                    valueState: fCreditAmount ? "Warning" : "None"
                })
            ]);
            oModel.setProperty("/documentRows", aMappedRows);
            oModel.setProperty("/selectedDocument", aMappedRows[0] || {});
            oModel.setProperty("/hasSelection", !!aMappedRows.length);
            this.scheduleViewportTableResize([{
                id: "documentTable",
                minRows: 8,
                maxRows: 34,
                bottomOffset: 14
            }]);
        },

        onDocumentRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();
            var oModel = this.getView().getModel("document");

            oModel.setProperty("/selectedDocument", oRow || {});
            oModel.setProperty("/hasSelection", !!oRow);
        },

        onOpenAccountValueHelp: function () {
            var oModel = this.getView().getModel("document");
            var oDialog = this.byId("accountValueHelpDialog");

            oModel.setProperty("/accountValueHelpFilteredRows", oModel.getProperty("/accountValueHelpRows") || []);

            if (oDialog) {
                oDialog.open();
            }
        },

        onAccountValueHelpSearch: function (oEvent) {
            var sQuery = this.service.clean(oEvent.getParameter("newValue") || oEvent.getParameter("query") || oEvent.getParameter("value")).toLowerCase();
            var oModel = this.getView().getModel("document");
            var aRows = oModel.getProperty("/accountValueHelpRows") || [];
            var aFilteredRows = !sQuery ? aRows : aRows.filter(function (oRow) {
                return oRow.searchText.indexOf(sQuery) > -1;
            });

            oModel.setProperty("/accountValueHelpFilteredRows", aFilteredRows);
        },

        onAccountValueHelpConfirm: function (oEvent) {
            var oItem = oEvent.getParameter("listItem") || oEvent.getParameter("selectedItem") || oEvent.getSource();
            var oContext = oItem && oItem.getBindingContext && oItem.getBindingContext("document");
            var oAccount = oContext && oContext.getObject();
            var oModel = this.getView().getModel("document");
            var oDialog = this.byId("accountValueHelpDialog");

            if (!oAccount || !oAccount.saknr) {
                return;
            }

            oModel.setProperty("/accountFilter", oAccount.saknr);
            oModel.setProperty("/accountFilterText", oAccount.displayText);

            if (oDialog) {
                oDialog.close();
            }

            this.onSearch();
        },

        onAccountValueHelpCancel: function () {
            var oDialog = this.byId("accountValueHelpDialog");

            if (oDialog) {
                oDialog.close();
            }
        },

        onClearAccountSelection: function () {
            var oModel = this.getView().getModel("document");

            oModel.setProperty("/accountFilter", "");
            oModel.setProperty("/accountFilterText", "");
            this.onSearch();
        },

        onGoDashboard: function () {
            this.navToDashboard();
        },

        onGoDepartment: function () {
            var oSelectedOrg = this.getView().getModel("document").getProperty("/selectedOrg") || {};

            this.navToDepartment(oSelectedOrg.childId || this._routeOrgId || "ALL");
        },

        onGoDocuments: function () {
            var oSelectedOrg = this.getView().getModel("document").getProperty("/selectedOrg") || {};

            this.navToDocuments(oSelectedOrg.childId || this._routeOrgId || "ALL");
        }
    });
});
