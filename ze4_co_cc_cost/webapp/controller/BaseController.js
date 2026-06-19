sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "ZE4_CC_COST/model/formatter",
    "ZE4_CC_COST/model/CostDataService"
], function (Controller, JSONModel, MessageBox, formatter, CostDataService) {
    "use strict";

    return Controller.extend("ZE4_CC_COST.controller.BaseController", {
        formatter: formatter,
        service: CostDataService,

        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },

        getAppStateModel: function () {
            return this.getOwnerComponent().getModel("appState");
        },

        createViewModel: function (oInitialState) {
            return new JSONModel(Object.assign({
                busy: false,
                warningVisible: false,
                warningText: "",
                filterVisible: true,
                filterToggleText: "필터 숨기기",
                filterStates: {
                    gjahrState: "None",
                    gjahrStateText: "",
                    periodState: "None",
                    periodStateText: ""
                },
                filters: this.createDefaultFilters(),
                periodOptions: this.service.MONTHS.map(function (sMonth) {
                    return {
                        key: sMonth,
                        text: sMonth + "월"
                    };
                }),
                orgOptions: [],
                selectedOrg: {
                    childId: "",
                    nodeText: "",
                    descendantIds: []
                },
                headerInfo: this.createHeaderInfo(this.createDefaultFilters())
            }, oInitialState || {}));
        },

        createDefaultFilters: function () {
            var oToday = new Date();

            return {
                bukrs: "0001",
                gjahr: String(oToday.getFullYear()),
                period: this.service.normalizeMonth(String(oToday.getMonth() + 1)),
                orgNodeId: "",
                orgNodeText: "",
                waers: this.service.CURRENCY,
                budgetVersion: this.service.BUDGET_VERSION
            };
        },

        syncDefaultFilters: function (sModelName) {
            return this.service.init().then(function () {
                return this.service.defaultFilters();
            }.bind(this)).then(function (oFilters) {
                var oModel = this.getView().getModel(sModelName);
                var oAppModel = this.getAppStateModel();
                var oCurrentFilters = oAppModel.getProperty("/filters") || {};
                var oMergedFilters = Object.assign({}, oFilters, {
                    orgNodeId: oCurrentFilters.orgNodeId || "",
                    orgNodeText: oCurrentFilters.orgNodeText || ""
                });

                oAppModel.setProperty("/filters", oMergedFilters);
                oModel.setProperty("/filters", oMergedFilters);
                oModel.setProperty("/headerInfo", this.createHeaderInfo(oMergedFilters));

                return oMergedFilters;
            }.bind(this));
        },

        createHeaderInfo: function (oFilters) {
            return {
                companyCodeText: "0001",
                currencyText: this.service.CURRENCY,
                asOfDateText: this.formatToday(),
                periodText: (oFilters && oFilters.gjahr || "") + "." + (oFilters && oFilters.period || "")
            };
        },

        formatToday: function () {
            var oToday = new Date();

            return oToday.getFullYear() + "." + String(oToday.getMonth() + 1).padStart(2, "0") + "." + String(oToday.getDate()).padStart(2, "0");
        },

        normalizeFilters: function (oFilters) {
            return {
                bukrs: "0001",
                gjahr: this.service.clean(oFilters && oFilters.gjahr),
                period: this.service.normalizeMonth(oFilters && oFilters.period),
                orgNodeId: this.service.normalizeNodeId(oFilters && oFilters.orgNodeId),
                orgNodeText: this.service.clean(oFilters && oFilters.orgNodeText),
                waers: this.service.CURRENCY,
                budgetVersion: this.service.BUDGET_VERSION
            };
        },

        validateFilters: function (sModelName) {
            var oModel = this.getView().getModel(sModelName);
            var oFilters = this.normalizeFilters(oModel.getProperty("/filters") || {});
            var bValid = true;
            var oStates = {
                gjahrState: "None",
                gjahrStateText: "",
                periodState: "None",
                periodStateText: ""
            };

            if (!oFilters.gjahr) {
                bValid = false;
                oStates.gjahrState = "Error";
                oStates.gjahrStateText = "회계연도는 필수입니다.";
            }

            if (!oFilters.period) {
                bValid = false;
                oStates.periodState = "Error";
                oStates.periodStateText = "기간은 필수입니다.";
            }

            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/filterStates", oStates);

            if (!bValid) {
                MessageBox.error("회계연도와 기간은 필수입니다.");
                return null;
            }

            this.getAppStateModel().setProperty("/filters", oFilters);
            oModel.setProperty("/headerInfo", this.createHeaderInfo(oFilters));

            return oFilters;
        },

        setHierarchyOptions: function (sModelName, aHierarchyRows, sSelectedOrgId) {
            var oModel = this.getView().getModel(sModelName);
            var aOptions = this.service.buildHierarchyOptions(aHierarchyRows);
            var aTreeOptions = this.service.buildHierarchyOptionTree(aHierarchyRows);
            var oSelectedOrg = this.service.getOrgSelection(sSelectedOrgId || oModel.getProperty("/filters/orgNodeId"), aHierarchyRows);

            oModel.setProperty("/orgOptions", aOptions);
            oModel.setProperty("/orgOptionTreeAllRows", aTreeOptions);
            oModel.setProperty("/orgOptionTreeRows", aTreeOptions);
            oModel.setProperty("/selectedOrg", oSelectedOrg);
            oModel.setProperty("/filters/orgNodeId", oSelectedOrg.childId || "");
            oModel.setProperty("/filters/orgNodeText", oSelectedOrg.nodeText || "");
            this.getAppStateModel().setProperty("/selectedOrg", oSelectedOrg);

            return oSelectedOrg;
        },

        onToggleFilter: function (oEvent) {
            var sModelName = this.getModelName();
            var oModel = this.getView().getModel(sModelName);
            var bVisible = !!oModel.getProperty("/filterVisible");

            oModel.setProperty("/filterVisible", !bVisible);
            oModel.setProperty("/filterToggleText", bVisible ? "필터 보이기" : "필터 숨기기");
        },

        onOpenOrgValueHelp: function () {
            var oDialog = this.byId("orgValueHelpDialog");
            var oTreeTable = this.byId("orgValueHelpTree");
            var oModel = this.getView().getModel(this.getModelName());

            if (oDialog) {
                oModel.setProperty("/orgOptionTreeRows", oModel.getProperty("/orgOptionTreeAllRows") || []);
                oDialog.open();

                if (oTreeTable && oTreeTable.expandToLevel) {
                    oTreeTable.clearSelection();
                    oTreeTable.expandToLevel(3);
                }
            }
        },

        onOrgValueHelpSearch: function (oEvent) {
            var sValue = oEvent.getParameter("newValue") || oEvent.getParameter("query") || oEvent.getParameter("value") || "";
            var oModel = this.getView().getModel(this.getModelName());
            var aTreeRows = oModel.getProperty("/orgOptionTreeAllRows") || [];
            var aFilteredRows = this.service.filterHierarchyTree(aTreeRows, sValue);
            var oTreeTable = this.byId("orgValueHelpTree");

            oModel.setProperty("/orgOptionTreeRows", aFilteredRows);

            if (oTreeTable && oTreeTable.expandToLevel) {
                oTreeTable.clearSelection();
                oTreeTable.expandToLevel(sValue ? 9 : 3);
            }
        },

        onOrgValueHelpConfirm: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oTreeTable = this.byId("orgValueHelpTree");
            var iSelectedIndex = oTreeTable && oTreeTable.getSelectedIndex && oTreeTable.getSelectedIndex();
            var oContext = oSelectedItem && oSelectedItem.getBindingContext(this.getModelName());
            var oOption = oContext && oContext.getObject();
            var oModel = this.getView().getModel(this.getModelName());
            var oDialog = this.byId("orgValueHelpDialog");

            if (!oOption && oTreeTable && iSelectedIndex > -1) {
                oContext = oTreeTable.getContextByIndex(iSelectedIndex);
                oOption = oContext && oContext.getObject();
            }

            if (!oOption) {
                return;
            }

            oModel.setProperty("/selectedOrg", oOption);
            oModel.setProperty("/filters/orgNodeId", oOption.childId);
            oModel.setProperty("/filters/orgNodeText", oOption.nodeText);
            this.getAppStateModel().setProperty("/selectedOrg", oOption);
            this.getAppStateModel().setProperty("/filters/orgNodeId", oOption.childId);
            this.getAppStateModel().setProperty("/filters/orgNodeText", oOption.nodeText);
            if (oDialog) {
                oDialog.close();
            }
            this.onSearch();
        },

        onOrgValueHelpCancel: function () {
            var oDialog = this.byId("orgValueHelpDialog");

            if (oDialog) {
                oDialog.close();
            }
        },

        onClearOrgSelection: function () {
            var oModel = this.getView().getModel(this.getModelName());

            oModel.setProperty("/selectedOrg", {
                childId: "",
                nodeText: "",
                descendantIds: []
            });
            oModel.setProperty("/filters/orgNodeId", "");
            oModel.setProperty("/filters/orgNodeText", "");
            this.getAppStateModel().setProperty("/selectedOrg", {
                childId: "",
                nodeText: "",
                descendantIds: []
            });
            this.getAppStateModel().setProperty("/filters/orgNodeId", "");
            this.getAppStateModel().setProperty("/filters/orgNodeText", "");
            this.onSearch();
        },

        onResetFilters: function () {
            var sModelName = this.getModelName();
            var oModel = this.getView().getModel(sModelName);
            var oDefaults = this.getAppStateModel().getProperty("/defaults") || this.createDefaultFilters();
            var oFilters = Object.assign({}, oDefaults, {
                orgNodeId: "",
                orgNodeText: "",
                waers: this.service.CURRENCY,
                budgetVersion: this.service.BUDGET_VERSION
            });

            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/selectedOrg", {
                childId: "",
                nodeText: "",
                descendantIds: []
            });
            this.getAppStateModel().setProperty("/filters", oFilters);
            this.getAppStateModel().setProperty("/selectedOrg", {
                childId: "",
                nodeText: "",
                descendantIds: []
            });
            this.onSearch();
        },

        setWarning: function (sModelName, sText) {
            var oModel = this.getView().getModel(sModelName);

            oModel.setProperty("/warningVisible", !!sText);
            oModel.setProperty("/warningText", sText || "");
        },

        createKpi: function (sTitle, sValue, sSubText, sState, sIcon) {
            var sResolvedIcon = sIcon || "sap-icon://business-card";
            var sTone = this.kpiIconTone(sResolvedIcon);

            return {
                title: sTitle,
                valueText: sValue,
                subText: sSubText,
                state: sState || "None",
                icon: sResolvedIcon,
                iconColor: this.kpiIconColor(sTone),
                iconBackground: this.kpiIconBackground(sTone),
                valueState: this.kpiValueState(sState, sTone)
            };
        },

        kpiIconTone: function (sIcon) {
            var sIconName = (sIcon || "").replace("sap-icon://", "");
            var mIconTones = {
                "wallet": "blue",
                "money-bills": "blue",
                "sum": "blue",
                "calendar": "purple",
                "documents": "purple",
                "list": "purple",
                "business-objects-experience": "orange",
                "compare": "orange",
                "org-chart": "orange",
                "group": "orange",
                "building": "orange",
                "customer-and-supplier": "teal",
                "competitor": "teal",
                "paper-plane": "teal",
                "download-from-cloud": "teal",
                "trend-up": "green",
                "pie-chart": "green",
                "percentage": "green",
                "lead": "green",
                "arrow-left": "green",
                "arrow-right": "orange"
            };

            return mIconTones[sIconName] || "blue";
        },

        kpiIconColor: function (sTone) {
            return {
                blue: "#0a6ed1",
                purple: "#6f42c1",
                green: "#107e3e",
                orange: "#e9730c",
                teal: "#008080"
            }[sTone] || "#0a6ed1";
        },

        kpiIconBackground: function (sTone) {
            return {
                blue: "#eaf3ff",
                purple: "#f2ecff",
                green: "#edf7ed",
                orange: "#fff3e5",
                teal: "#e8f6f6"
            }[sTone] || "#eaf3ff";
        },

        kpiValueState: function (sState, sTone) {
            if (sState && sState !== "None") {
                return sState;
            }

            return {
                blue: "Information",
                purple: "Information",
                green: "Success",
                orange: "Warning",
                teal: "Information"
            }[sTone] || "Information";
        },

        scheduleViewportTableResize: function (aConfigs) {
            this._viewportTableConfigs = aConfigs || [];

            if (!this._viewportTableResizeHandler && typeof window !== "undefined") {
                this._viewportTableResizeHandler = function () {
                    this._queueViewportTableResize();
                }.bind(this);
                window.addEventListener("resize", this._viewportTableResizeHandler);
            }

            this._queueViewportTableResize();
        },

        _queueViewportTableResize: function () {
            if (this._viewportTableResizeTimer) {
                clearTimeout(this._viewportTableResizeTimer);
            }

            this._viewportTableResizeTimer = setTimeout(function () {
                this._resizeViewportTables();
            }.bind(this), 0);

            setTimeout(function () {
                this._resizeViewportTables();
            }.bind(this), 180);
        },

        _resizeViewportTables: function () {
            var aConfigs = this._viewportTableConfigs || [];

            aConfigs.forEach(function (oConfig) {
                var oTable = oConfig && oConfig.table || this.byId(oConfig && oConfig.id);
                var oDomRef = oTable && oTable.getDomRef && oTable.getDomRef();
                var oBinding = oTable && oTable.getBinding && oTable.getBinding("rows");
                var iDataRows = oBinding && oBinding.getLength ? oBinding.getLength() : 0;
                var iMinRows = oConfig && oConfig.minRows || 5;
                var iMaxRows = oConfig && oConfig.maxRows || 30;
                var iRowHeight = oConfig && oConfig.rowHeight || 34;
                var iHeaderHeight = oConfig && oConfig.headerHeight || 58;
                var iBottomOffset = oConfig && oConfig.bottomOffset || 24;
                var iAvailableHeight;
                var iViewportRows;
                var iTargetRows;
                var iMinimumRows;

                if (!oTable || !oDomRef || !oTable.setVisibleRowCount || typeof window === "undefined") {
                    return;
                }

                iAvailableHeight = window.innerHeight - oDomRef.getBoundingClientRect().top - iBottomOffset;
                iViewportRows = Math.floor((iAvailableHeight - iHeaderHeight) / iRowHeight);
                iViewportRows = Math.max(1, iViewportRows);

                if (iDataRows > 0) {
                    iMinimumRows = Math.min(iMinRows, iDataRows);
                    iTargetRows = Math.max(iMinimumRows, Math.min(iDataRows, iViewportRows, iMaxRows));
                } else {
                    iTargetRows = Math.min(iMinRows, iViewportRows, iMaxRows);
                }

                if (oTable.getVisibleRowCount && oTable.getVisibleRowCount() !== iTargetRows) {
                    oTable.setVisibleRowCount(iTargetRows);
                }
            }.bind(this));
        },

        extractVizDataValue: function (oEvent, sDimensionName) {
            var aSelectedData = oEvent && oEvent.getParameter("data") || [];
            var vData = aSelectedData[0] && aSelectedData[0].data;
            var oMatchedData;

            if (!vData) {
                return "";
            }

            if (Array.isArray(vData)) {
                oMatchedData = vData.find(function (oData) {
                    return oData && (oData.name === sDimensionName || oData.Name === sDimensionName);
                });

                return this.service.clean(oMatchedData && (oMatchedData.value || oMatchedData.Value));
            }

            return this.service.clean(vData[sDimensionName]);
        },

        decorateMonthlyTrendRows: function (aTrendRows, aDocumentRows, oFilters) {
            var mDocumentCounts = this.service.documentCountsByMonth(aDocumentRows);

            return (aTrendRows || []).map(function (oRow, iIndex, aRows) {
                var fPreviousAmount = iIndex > 0 ? Number(aRows[iIndex - 1].actualAmount || 0) : null;
                var fMomAmount = fPreviousAmount === null ? null : Number(oRow.actualAmount || 0) - fPreviousAmount;

                return Object.assign({}, oRow, {
                    periodText: (oFilters && oFilters.gjahr || "") + "." + oRow.month,
                    momAmount: fMomAmount,
                    documentCount: mDocumentCounts[oRow.month] || 0,
                    selected: false
                });
            });
        },

        decorateAccountCompositionRows: function (aCompositionRows, aDocumentRows) {
            var mDocumentCounts = this.service.documentCountsByField(aDocumentRows, "Saknr");

            return (aCompositionRows || []).map(function (oRow) {
                var aSaknrs = oRow.includedSaknrs || [oRow.saknr];
                var iDocumentCount = aSaknrs.reduce(function (iTotal, sSaknr) {
                    return iTotal + (mDocumentCounts[sSaknr] || 0);
                }, 0);

                return Object.assign({}, oRow, {
                    documentCount: iDocumentCount,
                    selected: false
                });
            });
        },

        buildSelectedMonthSummary: function (sMonthText, aTrendRows) {
            var oRow = (aTrendRows || []).find(function (oCandidate) {
                return oCandidate.monthText === sMonthText || oCandidate.month === this.service.normalizeMonth(sMonthText);
            }.bind(this));

            if (!oRow) {
                return null;
            }

            return {
                month: oRow.month,
                monthText: oRow.periodText || oRow.monthText,
                actualAmount: oRow.actualAmount,
                budgetAmount: oRow.budgetAmount,
                momAmount: oRow.momAmount,
                documentCount: oRow.documentCount || 0
            };
        },

        buildSelectedAccountSummary: function (sAccountText, aCompositionRows) {
            var oRow = (aCompositionRows || []).find(function (oCandidate) {
                return oCandidate.accountLabel === sAccountText || oCandidate.accountName === sAccountText;
            });

            if (!oRow) {
                return null;
            }

            return {
                saknr: oRow.saknr,
                saknrTxt: oRow.accountName,
                accountLabel: oRow.accountLabel || oRow.accountName,
                amount: oRow.amount,
                ratio: oRow.ratio,
                ratioText: oRow.ratioText,
                documentCount: oRow.documentCount || 0
            };
        },

        markSelectedByProperty: function (aRows, sPropertyName, sSelectedValue) {
            return (aRows || []).map(function (oRow) {
                return Object.assign({}, oRow, {
                    selected: oRow[sPropertyName] === sSelectedValue
                });
            });
        },

        configureVizFrame: function (oVizFrame, oPopover, mOptions) {
            var sType = mOptions && mOptions.type;
            var oVizProperties;

            if (!oVizFrame || !oVizFrame.setVizProperties) {
                return;
            }

            oVizProperties = {
                title: {
                    visible: false
                },
                tooltip: {
                    visible: true
                },
                legend: {
                    visible: true,
                    position: mOptions && mOptions.legendPosition || "bottom"
                },
                plotArea: {
                    drawingEffect: "glossy"
                }
            };

            if (sType === "trend") {
                oVizProperties.categoryAxis = {
                    title: {
                        visible: true,
                        text: mOptions.categoryAxisTitle || "조회 월"
                    }
                };
                oVizProperties.valueAxis = {
                    title: {
                        visible: true,
                        text: mOptions.valueAxisTitle || "금액(KRW)"
                    }
                };
            }

            if (sType === "allocationTrend") {
                oVizProperties.categoryAxis = {
                    title: {
                        visible: true,
                        text: mOptions.categoryAxisTitle || "조회 월"
                    }
                };
                oVizProperties.valueAxis = {
                    title: {
                        visible: true,
                        text: mOptions.valueAxisTitle || "배부금액(KRW)"
                    }
                };
                oVizProperties.valueAxis2 = {
                    title: {
                        visible: true,
                        text: mOptions.valueAxis2Title || "배부건수"
                    }
                };
            }

            if (sType === "donut") {
                oVizProperties.legend.position = mOptions && mOptions.legendPosition || "right";
                oVizProperties.plotArea.dataLabel = {
                    visible: true,
                    type: "percentage"
                };
            }

            oVizFrame.setVizProperties(oVizProperties);

            if (oPopover && oPopover.connect && oVizFrame.getVizUid) {
                oPopover.connect(oVizFrame.getVizUid());
            }
        },

        clearGlobalOrgSelection: function () {
            var oAppModel = this.getAppStateModel();
            var oFilters = Object.assign({}, oAppModel.getProperty("/filters") || {}, {
                orgNodeId: "",
                orgNodeText: ""
            });

            oAppModel.setProperty("/filters", oFilters);
            oAppModel.setProperty("/selectedOrg", {
                childId: "",
                nodeText: "",
                descendantIds: []
            });
        },

        navToDashboard: function () {
            this.clearGlobalOrgSelection();
            this.getRouter().navTo("dashboard");
        },

        navToAllocationAnalysis: function () {
            this.getRouter().navTo("allocationFlowOverview");
        },

        navToAllocationFlowOverview: function () {
            this.getRouter().navTo("allocationFlowOverview");
        },

        navToOrgExplorer: function () {
            this.getRouter().navTo("orgExplorer");
        },

        onGoDashboard: function () {
            this.navToDashboard();
        },

        onGoAllocationAnalysis: function () {
            this.navToAllocationAnalysis();
        },

        onGoOrgExplorer: function () {
            this.navToOrgExplorer();
        },

        navToDepartment: function (sOrgId) {
            this.getRouter().navTo("departmentDetail", {
                orgId: encodeURIComponent(sOrgId || "ALL")
            });
        },

        navToDocuments: function (sOrgId, sSaknr) {
            if (sSaknr) {
                this.getRouter().navTo("documentDetailWithAccount", {
                    kostl: encodeURIComponent(sOrgId || "ALL"),
                    saknr: encodeURIComponent(sSaknr)
                });
                return;
            }

            this.getRouter().navTo("documentDetail", {
                kostl: encodeURIComponent(sOrgId || "ALL")
            });
        },

        getModelName: function () {
            return "";
        }
    });
});
