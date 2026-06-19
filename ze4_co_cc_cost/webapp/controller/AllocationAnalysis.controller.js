sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.AllocationAnalysis", {
        getModelName: function () {
            return "allocation";
        },

        onInit: function () {
            var oAllocationModel = this.createViewModel({
                activeMenu: "allocationAnalysis",
                pageTitle: "[EverNiture-CO] 부서별 배부/정산 분석",
                filters: this._createAllocationFilters(this.createDefaultFilters()),
                cycleOptions: [],
                skfOptions: [],
                kpis: [],
                monthlyTrend: [],
                topSenders: [],
                topReceivers: [],
                detailRows: [],
                hasTrendData: false
            });

            oAllocationModel.setSizeLimit(20000);
            this.getView().setModel(oAllocationModel, "allocation");

            this.getRouter().getRoute("allocationAnalysis").attachPatternMatched(this._onRouteMatched, this);
            this.getRouter().getRoute("allocationDetail").attachPatternMatched(this._onDetailRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadWithDefaults({});
        },

        _onDetailRouteMatched: function (oEvent) {
            var oArguments = oEvent.getParameter("arguments") || {};
            var oSelection = this._decodeSelection(oArguments.selection);

            this._loadWithDefaults({
                cycle: oSelection.cycle || "",
                senderKostl: oSelection.senderKostl || "",
                receiverKostl: oSelection.receiverKostl || "",
                skfId: oSelection.skfId || ""
            });
        },

        _loadWithDefaults: function (oOverrideFilters) {
            var oModel = this.getView().getModel("allocation");

            oModel.setProperty("/busy", true);
            oModel.setProperty("/pageTitle", "[EverNiture-CO] 부서별 배부/정산 분석");

            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("allocation");
                }.bind(this))
                .then(function (oFilters) {
                    var oAllocationFilters = this._createAllocationFilters(Object.assign({}, oFilters, oOverrideFilters || {}));

                    oModel.setProperty("/filters", oAllocationFilters);
                    return this._loadAllocation(oAllocationFilters);
                }.bind(this))
                .catch(function () {
                    this.setWarning("allocation", "배부 전표 데이터가 없습니다.");
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        onSearch: function () {
            var oFilters = this._validateAllocationFilters();

            if (!oFilters) {
                return;
            }

            this._loadAllocation(oFilters);
        },

        onResetFilters: function () {
            var oModel = this.getView().getModel("allocation");
            var oDefaults = this.getAppStateModel().getProperty("/defaults") || this.createDefaultFilters();
            var oFilters = this._createAllocationFilters(oDefaults);

            oModel.setProperty("/filters", oFilters);
            this.getAppStateModel().setProperty("/filters", oFilters);
            this.onSearch();
        },

        onOpenAllocationMap: function () {
            var oFilters = this._validateAllocationFilters();

            if (!oFilters) {
                return;
            }

            this.getAppStateModel().setProperty("/allocationMapFilters", oFilters);
            this.getRouter().navTo("allocationFlowOverview");
        },

        _createAllocationFilters: function (oFilters) {
            var oBaseFilters = this.normalizeFilters(oFilters || {});

            return Object.assign({}, oBaseFilters, {
                cycle: this.service.clean(oFilters && oFilters.cycle),
                senderKostl: this.service.normalizeNodeId(oFilters && oFilters.senderKostl),
                receiverKostl: this.service.normalizeNodeId(oFilters && oFilters.receiverKostl),
                skfId: this.service.clean(oFilters && oFilters.skfId)
            });
        },

        _validateAllocationFilters: function () {
            var oModel = this.getView().getModel("allocation");
            var oFilters = this._createAllocationFilters(oModel.getProperty("/filters") || {});
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

        _loadAllocation: function (oFilters) {
            var oModel = this.getView().getModel("allocation");
            var oPreviousYearFilters = Object.assign({}, oFilters, {
                gjahr: String(Number(oFilters.gjahr) - 1),
                period: "12"
            });
            var pPreviousRows = oFilters.period === "01" ?
                this.service.readAllocationResultRows(oPreviousYearFilters, true).catch(function () {
                    return [];
                }) :
                Promise.resolve([]);

            oModel.setProperty("/busy", true);
            this.setWarning("allocation", "");

            return Promise.all([
                this.service.readAllocationRuleRows().catch(function () {
                    return [];
                }),
                this.service.readAllocationResultRows(oFilters, false).catch(function () {
                    this.setWarning("allocation", "배부 전표 데이터가 없습니다.");
                    return [];
                }.bind(this)),
                pPreviousRows
            ]).then(function (aResults) {
                this._applyAllocationData(oFilters, aResults[0], aResults[1], aResults[2]);
            }.bind(this)).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyAllocationData: function (oFilters, aRuleRows, aYearRows, aPreviousYearRows) {
            var oModel = this.getView().getModel("allocation");
            var aCurrentRows = this._filterRowsByMonth(aYearRows, oFilters.period);
            var aPreviousRows = oFilters.period === "01" ?
                (aPreviousYearRows || []) :
                this._filterRowsByMonth(aYearRows, String(Number(oFilters.period) - 1));
            var aDetailRows = this._mapAllocationDetailRows(aCurrentRows);
            var aTrendRows = this._buildMonthlyTrendRows(aYearRows);

            if (!aCurrentRows.length) {
                this.setWarning("allocation", "배부 전표 데이터가 없습니다.");
            }

            oModel.setProperty("/cycleOptions", this._buildFilterOptions(aRuleRows.concat(aYearRows || []), "Cycle", "CycleText"));
            oModel.setProperty("/skfOptions", this._buildFilterOptions(aRuleRows.concat(aYearRows || []), "SkfId", "SkfTxt"));
            oModel.setProperty("/kpis", this._buildKpis(aCurrentRows, aPreviousRows));
            oModel.setProperty("/monthlyTrend", aTrendRows);
            oModel.setProperty("/topSenders", this._buildTopDepartmentRows(aCurrentRows, "SenderKostl", "SenderKostlTxt", "Sender"));
            oModel.setProperty("/topReceivers", this._buildTopDepartmentRows(aCurrentRows, "ReceiverKostl", "ReceiverKostlTxt", "Receiver"));
            oModel.setProperty("/detailRows", aDetailRows);
            oModel.setProperty("/hasTrendData", aTrendRows.length > 0);

            this.configureVizFrame(this.byId("allocationTrendChart"), this.byId("allocationTrendChartPopover"), {
                type: "allocationTrend",
                categoryAxisTitle: "배부 월",
                valueAxisTitle: "배부금액(KRW)",
                valueAxis2Title: "배부건수",
                legendPosition: "top"
            });
            this.scheduleViewportTableResize([{
                id: "allocationDetailTable",
                minRows: 8,
                maxRows: 24,
                bottomOffset: 28
            }]);
        },

        _filterRowsByMonth: function (aRows, vMonth) {
            var sMonth = this.service.normalizeMonth(vMonth);

            return (aRows || []).filter(function (oRow) {
                return this.service.normalizeMonth(this.service.getField(oRow, "Monat")) === sMonth;
            }.bind(this));
        },

        _buildFilterOptions: function (aRows, sKeyField, sTextField) {
            var mOptions = {};
            var aOptions;

            (aRows || []).forEach(function (oRow) {
                var sKey = this.service.clean(this.service.getField(oRow, sKeyField));
                var sText = this.service.clean(this.service.getField(oRow, sTextField));

                if (!sKey || mOptions[sKey]) {
                    return;
                }

                mOptions[sKey] = {
                    key: sKey,
                    text: sText ? sText + " (" + sKey + ")" : sKey
                };
            }.bind(this));

            aOptions = Object.keys(mOptions).map(function (sKey) {
                return mOptions[sKey];
            }).sort(function (oFirst, oSecond) {
                return oFirst.text.localeCompare(oSecond.text, "ko") ||
                    oFirst.key.localeCompare(oSecond.key);
            });

            return [{
                key: "",
                text: "전체"
            }].concat(aOptions);
        },

        _buildKpis: function (aCurrentRows, aPreviousRows) {
            var fTotalAmount;
            var fPreviousAmount;
            var oMaxSender;
            var oMaxReceiver;
            var iDocumentCount;
            var fMomAmount;

            if (!aCurrentRows.length) {
                return [
                    this.createKpi("총 배부금액", "-", "-", "None", "sap-icon://wallet"),
                    this.createKpi("배부건수", "-", "-", "None", "sap-icon://documents"),
                    this.createKpi("최대 송신부서", "-", "-", "None", "sap-icon://org-chart"),
                    this.createKpi("최대 수신부서", "-", "-", "None", "sap-icon://customer-and-supplier"),
                    this.createKpi("전월대비", "-", "-", "None", "sap-icon://trend-up")
                ];
            }

            fTotalAmount = this.service.sum(aCurrentRows, "AllocAmount");
            fPreviousAmount = this.service.sum(aPreviousRows, "AllocAmount");
            oMaxSender = this._maxAmountGroup(aCurrentRows, "SenderKostl", "SenderKostlTxt", "Sender");
            oMaxReceiver = this._maxAmountGroup(aCurrentRows, "ReceiverKostl", "ReceiverKostlTxt", "Receiver");
            iDocumentCount = this.service.distinctDocumentCount(aCurrentRows);
            fMomAmount = fTotalAmount - fPreviousAmount;

            return [
                this.createKpi("총 배부금액", this.formatter.amountWithCurrency(fTotalAmount, "KRW"), "-", "None", "sap-icon://wallet"),
                this.createKpi("배부건수", iDocumentCount ? this.formatter.amount(iDocumentCount) + "건" : "-", "-", "None", "sap-icon://documents"),
                this.createKpi("최대 송신부서", oMaxSender.text, this.formatter.amountWithCurrency(oMaxSender.amount, "KRW"), "None", "sap-icon://org-chart"),
                this.createKpi("최대 수신부서", oMaxReceiver.text, this.formatter.amountWithCurrency(oMaxReceiver.amount, "KRW"), "None", "sap-icon://customer-and-supplier"),
                this.createKpi("전월대비", aPreviousRows.length ? this.formatter.amountWithCurrency(fMomAmount, "KRW") : "-", "-", aPreviousRows.length ? this.formatter.valueStateByDelta(fMomAmount) : "None", "sap-icon://trend-up")
            ];
        },

        _maxAmountGroup: function (aRows, sCodeField, sTextField, sRole) {
            var aGroups = this._buildTopDepartmentRows(aRows, sCodeField, sTextField, sRole);

            return aGroups[0] || {
                text: "-",
                amount: null
            };
        },

        _buildTopDepartmentRows: function (aRows, sCodeField, sTextField, sRole) {
            var mGroups = {};

            (aRows || []).forEach(function (oRow) {
                var sCode = this.service.normalizeNodeId(this.service.getField(oRow, sCodeField));
                var sDocKey = this._documentKey(oRow);

                if (!sCode) {
                    return;
                }

                if (!mGroups[sCode]) {
                    mGroups[sCode] = {
                        code: sCode,
                        text: this._costCenterDisplayText(oRow, sRole, sCode, this.service.getField(oRow, sTextField)),
                        tooltip: this._costCenterDisplayText(oRow, sRole, sCode, this.service.getField(oRow, sTextField)),
                        amount: 0,
                        documentKeys: {}
                    };
                }

                mGroups[sCode].amount += Number(this.service.getField(oRow, "AllocAmount") || 0);
                if (sDocKey !== "||") {
                    mGroups[sCode].documentKeys[sDocKey] = true;
                }
            }.bind(this));

            return Object.keys(mGroups).map(function (sCode) {
                var oGroup = mGroups[sCode];

                return Object.assign(oGroup, {
                    documentCount: Object.keys(oGroup.documentKeys || {}).length,
                    documentCountText: Object.keys(oGroup.documentKeys || {}).length + "건"
                });
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                    oFirst.code.localeCompare(oSecond.code);
            }).slice(0, 5);
        },

        _buildMonthlyTrendRows: function (aRows) {
            var mMonths = {};

            (aRows || []).forEach(function (oRow) {
                var sMonth = this.service.normalizeMonth(this.service.getField(oRow, "Monat"));
                var sDocKey;

                if (!sMonth) {
                    return;
                }

                if (!mMonths[sMonth]) {
                    mMonths[sMonth] = {
                        month: sMonth,
                        monthText: Number(sMonth) + "월",
                        amount: 0,
                        documentKeys: {}
                    };
                }

                mMonths[sMonth].amount += Number(this.service.getField(oRow, "AllocAmount") || 0);
                sDocKey = this._documentKey(oRow);

                if (sDocKey !== "||") {
                    mMonths[sMonth].documentKeys[sDocKey] = true;
                }
            }.bind(this));

            return Object.keys(mMonths).sort().map(function (sMonth) {
                var oMonth = mMonths[sMonth];

                return {
                    month: oMonth.month,
                    monthText: oMonth.monthText,
                    amount: oMonth.amount,
                    documentCount: Object.keys(oMonth.documentKeys).length
                };
            });
        },

        _mapAllocationDetailRows: function (aRows) {
            return (aRows || []).map(function (oRow) {
                var sSenderCode = this.service.normalizeNodeId(this.service.getField(oRow, "SenderKostl"));
                var sReceiverCode = this.service.normalizeNodeId(this.service.getField(oRow, "ReceiverKostl"));

                return {
                    senderText: this._costCenterDisplayText(oRow, "Sender", sSenderCode, this.service.getField(oRow, "SenderKostlTxt")),
                    senderTooltip: this._costCenterDisplayText(oRow, "Sender", sSenderCode, this.service.getField(oRow, "SenderKostlTxt")),
                    receiverText: this._costCenterDisplayText(oRow, "Receiver", sReceiverCode, this.service.getField(oRow, "ReceiverKostlTxt")),
                    receiverTooltip: this._costCenterDisplayText(oRow, "Receiver", sReceiverCode, this.service.getField(oRow, "ReceiverKostlTxt")),
                    receiverPrctrText: this._textOrCode(this.service.getField(oRow, "ReceiverPrctrTxt"), this.service.getField(oRow, "ReceiverPrctr")),
                    cycleText: this._textOrCode(this.service.getField(oRow, "CycleText"), this.service.getField(oRow, "Cycle")),
                    segmentText: this._textOrCode(this.service.getField(oRow, "SegmName"), this.service.getField(oRow, "SegmNo")),
                    skfText: this._textOrCode(this.service.getField(oRow, "SkfTxt"), this.service.getField(oRow, "SkfId")),
                    basisValueText: this._basisValueText(oRow),
                    basisRatioText: this._basisRatioText(oRow),
                    allocAmount: Number(this.service.getField(oRow, "AllocAmount") || 0),
                    belnr: this.service.clean(this.service.getField(oRow, "Belnr")) || "-",
                    budat: this.service.clean(this.service.getField(oRow, "Budat"))
                };
            }.bind(this)).sort(function (oFirst, oSecond) {
                return String(oSecond.budat || "").localeCompare(String(oFirst.budat || "")) ||
                    String(oSecond.belnr || "").localeCompare(String(oFirst.belnr || ""));
            });
        },

        _basisValueText: function (oRow) {
            var sMatched = this.service.clean(this.service.getField(oRow, "BasisMatched"));
            var vBasisValue = this.service.getField(oRow, "BasisValue");
            var sUnit = this.formatter.skfUnitText(this.service.getField(oRow, "SkfUnitTxt"));
            var sAmount;

            if (sMatched !== "X") {
                return "-";
            }

            if (vBasisValue === null || vBasisValue === undefined || vBasisValue === "") {
                return "-";
            }

            sAmount = this.formatter.amount(vBasisValue);
            return sUnit ? sAmount + " " + sUnit : sAmount;
        },

        _basisRatioText: function (oRow) {
            var sMatched = this.service.clean(this.service.getField(oRow, "BasisMatched"));
            var vRatio = this.service.getField(oRow, "BasisRatio");
            var fRatio;

            if (sMatched !== "X") {
                return "-";
            }

            if (vRatio === null || vRatio === undefined || vRatio === "") {
                return "-";
            }

            fRatio = Number(vRatio);
            return isNaN(fRatio) ? "-" : fRatio.toFixed(1) + "%";
        },

        _costCenterDisplayText: function (oRow, sRole, sCode, vDirectText) {
            var sBaseText = this._textOrCode(vDirectText, sCode);
            var aParts = [];
            var aCompanyFields = [sRole + "Butxt", sRole + "BukrsTxt", "Butxt"];
            var aLocationFields = [
                sRole + "StoreName",
                sRole + "StoreTxt",
                sRole + "WerksTxt",
                sRole + "PlantTxt",
                sRole + "Ktext",
                "StoreName",
                "StoreTxt",
                "WerksTxt",
                "PlantTxt"
            ];

            if (!sRole) {
                return sBaseText;
            }

            this._firstAvailableText(oRow, aCompanyFields, aParts);
            this._firstAvailableText(oRow, aLocationFields, aParts);
            aParts.push(sBaseText);

            return this._uniqueTextParts(aParts, sCode).join("_") || sBaseText;
        },

        _firstAvailableText: function (oRow, aFieldNames, aParts) {
            (aFieldNames || []).some(function (sFieldName) {
                var sValue = this.service.clean(this.service.getField(oRow, sFieldName));

                if (sValue) {
                    aParts.push(sValue);
                    return true;
                }

                return false;
            }.bind(this));
        },

        _uniqueTextParts: function (aParts, sCode) {
            var mSeen = {};
            var sNormalizedCode = this.service.normalizeNodeId(sCode);

            return (aParts || []).filter(function (sPart) {
                var sValue = this.service.clean(sPart);
                var sKey = this.service.normalizeNodeId(sValue);

                if (!sValue || sKey === sNormalizedCode || mSeen[sKey]) {
                    return false;
                }

                mSeen[sKey] = true;
                return true;
            }.bind(this));
        },

        _textOrCode: function (vText, vCode) {
            var sText = this.service.clean(vText);
            var sCode = this.service.clean(vCode);

            return sText || sCode || "-";
        },

        _documentKey: function (oRow) {
            return [
                this.service.getField(oRow, "Bukrs"),
                this.service.getField(oRow, "Gjahr"),
                this.service.getField(oRow, "Belnr")
            ].map(this.service.clean).join("|");
        },

        _decodeSelection: function (sSelection) {
            try {
                return JSON.parse(decodeURIComponent(sSelection || "")) || {};
            } catch (oError) {
                return {};
            }
        }
    });
});
