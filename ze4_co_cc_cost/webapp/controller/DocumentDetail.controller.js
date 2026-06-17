sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.DocumentDetail", {
        getModelName: function () {
            return "document";
        },

        onInit: function () {
            this._routeOrgId = "";
            this._routeSaknr = "";
            this.getView().setModel(this.createViewModel({
                activeMenu: "document",
                pageTitle: "전표 상세 조회",
                accountFilter: "",
                accountFilterText: "",
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

            this._routeOrgId = decodeURIComponent(oArgs.kostl || "");
            this._routeOrgId = this._routeOrgId === "ALL" ? "" : this._routeOrgId;
            this._routeSaknr = decodeURIComponent(oArgs.saknr || "");
            oModel.setProperty("/busy", true);

            this.service.refreshMetadata()
                .then(function () {
                    return this.syncDefaultFilters("document");
                }.bind(this))
                .then(function (oFilters) {
                    oFilters.orgNodeId = this._routeOrgId;
                    oFilters.saknr = this._routeSaknr;
                    oModel.setProperty("/filters", oFilters);
                    oModel.setProperty("/accountFilter", this._routeSaknr);
                    oModel.setProperty("/accountFilterText", this._routeSaknr);
                    return this._loadDocuments(oFilters);
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
            var pDocumentRows = this.service.readDocumentRows(oFilters, true);
            var pAccountHelpRows = oFilters.saknr ? this.service.readDocumentRows(oAccountHelpFilters, true) : pDocumentRows;

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
            var aFilteredRows = this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg);
            var aAccountHelpRows = aAccountHelpDocumentRows || aDocumentRows;
            var aFilteredAccountHelpRows = this.service.filterByOrg(aAccountHelpRows, "Kostl", oSelectedOrg);
            var oTextMaps = this.service.buildCostCenterTextMaps(aHierarchyRows, aActualRows, (aDocumentRows || []).concat(aAccountHelpRows || []));
            var aOrgMappedRows = this.service.mapDocumentRows(aFilteredRows, oTextMaps);
            var aOrgAccountHelpMappedRows = this.service.mapDocumentRows(aFilteredAccountHelpRows, oTextMaps);
            var aAccountValueHelpRows = this.service.buildAccountValueHelpRows(aOrgAccountHelpMappedRows);
            var sSelectedSaknr = this.service.normalizeNodeId(oFilters.saknr || this._routeSaknr);
            var oSelectedAccount = aAccountValueHelpRows.find(function (oRow) {
                return oRow.saknr === sSelectedSaknr;
            });
            var aMappedRows = this.service.filterByAccount(aOrgMappedRows, "Saknr", sSelectedSaknr);
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
            var iDocumentCount = this.service.distinctDocumentCount(aMappedRows);
            var oFirst = aMappedRows[0] || {};

            if (!aMappedRows.length) {
                this.setWarning("document", "전표 상세 데이터가 없습니다.");
            }

            oModel.setProperty("/pageTitle", (oSelectedOrg.nodeText || "전체") + " 전표 상세 조회");
            oModel.setProperty("/accountValueHelpRows", aAccountValueHelpRows);
            oModel.setProperty("/accountValueHelpFilteredRows", aAccountValueHelpRows);
            oModel.setProperty("/accountFilter", sSelectedSaknr);
            oModel.setProperty("/accountFilterText", oSelectedAccount ? oSelectedAccount.displayText : (sSelectedSaknr || ""));
            oModel.setProperty("/header", {
                orgText: oSelectedOrg.nodeText || "전체 조직",
                orgCode: oSelectedOrg.childId || "ALL",
                account: sSelectedSaknr || "전체",
                accountText: sSelectedSaknr ? (oSelectedAccount && oSelectedAccount.saknrTxt || oFirst.SaknrTxt || "-") : "전체",
                period: oFilters.gjahr + "년 " + oFilters.period + "월 누적",
                documentCount: iDocumentCount,
                lineCount: aMappedRows.length,
                lineCountText: this.formatter.amount(aMappedRows.length) + "건",
                totalAmount: fTotalAmount
            });
            oModel.setProperty("/kpis", [
                this.createKpi("총 전표금액", this.formatter.amountWithCurrency(fTotalAmount, "KRW"), "차대변 반영 금액 합계", "None", "sap-icon://sum"),
                this.createKpi("전표 건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", "전표번호 기준", "None", "sap-icon://documents"),
                this.createKpi("라인 건수", this.formatter.amount(aMappedRows.length) + "건", "전표라인 기준", "None", "sap-icon://list"),
                this.createKpi("차변 금액", this.formatter.amountWithCurrency(fDebitAmount, "KRW"), "원금액 기준", "Success", "sap-icon://arrow-left"),
                this.createKpi("대변 금액", this.formatter.amountWithCurrency(fCreditAmount, "KRW"), "원금액 기준", "Warning", "sap-icon://arrow-right")
            ]);
            oModel.setProperty("/documentRows", aMappedRows);
            oModel.setProperty("/selectedDocument", aMappedRows[0] || {});
            oModel.setProperty("/hasSelection", !!aMappedRows.length);
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
