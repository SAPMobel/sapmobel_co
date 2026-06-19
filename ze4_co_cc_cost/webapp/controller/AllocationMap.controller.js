sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "sap/m/MessageBox"
], function (BaseController, MessageBox) {
    "use strict";

    var STEP_COLORS = {
        "1": "#0A6ED1",
        "2": "#2EB67D",
        "3": "#F5A623",
        "4": "#8B5CF6",
        "5": "#E91E63",
        "UNSPECIFIED": "#64748B"
    };
    var CYCLE_PALETTE = ["#0A6ED1", "#14B8A6", "#22C55E", "#F5A623", "#E9730C", "#8B5CF6", "#EC4899", "#64748B"];
    var NODE_WIDTH = 190;
    var NODE_HEIGHT = 64;
    var COLUMN_GAP = 170;
    var ROW_GAP = 18;
    var TOP_PADDING = 82;
    var LEFT_PADDING = 40;

    return BaseController.extend("ZE4_CC_COST.controller.AllocationMap", {
        getModelName: function () {
            return "allocationMap";
        },

        onInit: function () {
            var oMapModel = this.createViewModel({
                activeMenu: "allocationMap",
                pageTitle: "[EverNiture-CO] 다단계 배부 흐름 맵",
                filters: this._createMapFilters(this.createDefaultFilters()),
                filterStates: {
                    gjahrState: "None",
                    gjahrStateText: "",
                    periodState: "None",
                    periodStateText: "",
                    cycleState: "None",
                    cycleStateText: ""
                },
                cycleOptions: [],
                skfOptions: [],
                stepOptions: this._stepOptions(),
                topLimitOptions: this._topLimitOptions(),
                stepLegend: this._stepLegendRows(),
                cycleLegend: [],
                selectedCycleText: "-",
                visibleFlowCountText: "0건",
                hiddenFlowCountText: "0건",
                summaryItems: this._summaryItems(),
                sankeyHtml: this._emptySankeyHtml("배부사이클을 선택하세요."),
                hasSelection: false,
                selectedDetail: {},
                selectedKey: "",
                selectedType: "",
                highlightedCycleKey: "",
                tableExpanded: false,
                tableRows: [],
                allDetailRows: [],
                currentSankey: {
                    nodes: [],
                    links: [],
                    width: 1800,
                    height: 760
                },
                zoom: 1
            });

            oMapModel.setSizeLimit(30000);
            this.getView().setModel(oMapModel, "allocationMap");
            this.getRouter().getRoute("allocationMap").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments") || {};
            var oSavedFilters = this.getAppStateModel().getProperty("/allocationMapFilters") ||
                this.getAppStateModel().getProperty("/filters") ||
                this.createDefaultFilters();
            var oFilters = this._createMapFilters(Object.assign({}, oSavedFilters, {
                gjahr: decodeURIComponent(oArgs.gjahr || oSavedFilters.gjahr || ""),
                period: decodeURIComponent(oArgs.period || oSavedFilters.period || "")
            }));
            var oModel = this.getView().getModel("allocationMap");

            oModel.setProperty("/filters", oFilters);
            this._loadMap(oFilters);
        },

        onSearch: function () {
            var oFilters = this._validateMapFilters();

            if (!oFilters) {
                return;
            }

            this.getAppStateModel().setProperty("/allocationMapFilters", oFilters);
            this._loadMap(oFilters);
        },

        onFitMap: function () {
            this.getView().getModel("allocationMap").setProperty("/zoom", 0.72);
            this._refreshSankeyRender();
        },

        onZoomIn: function () {
            var oModel = this.getView().getModel("allocationMap");
            var fZoom = Math.min(1.8, Number(oModel.getProperty("/zoom") || 1) + 0.12);

            oModel.setProperty("/zoom", fZoom);
            this._refreshSankeyRender();
        },

        onZoomOut: function () {
            var oModel = this.getView().getModel("allocationMap");
            var fZoom = Math.max(0.5, Number(oModel.getProperty("/zoom") || 1) - 0.12);

            oModel.setProperty("/zoom", fZoom);
            this._refreshSankeyRender();
        },

        onResetMapView: function () {
            var oModel = this.getView().getModel("allocationMap");

            oModel.setProperty("/zoom", 1);
            oModel.setProperty("/selectedKey", "");
            oModel.setProperty("/selectedType", "");
            oModel.setProperty("/highlightedCycleKey", "");
            oModel.setProperty("/selectedCycleText", "-");
            oModel.setProperty("/hasSelection", false);
            oModel.setProperty("/selectedDetail", {});
            oModel.setProperty("/tableRows", oModel.getProperty("/allDetailRows") || []);
            oModel.setProperty("/tableExpanded", false);
            this._refreshSummary();
            this._refreshSankeyRender();
        },

        onClearSelection: function () {
            var oModel = this.getView().getModel("allocationMap");

            oModel.setProperty("/selectedKey", "");
            oModel.setProperty("/selectedType", "");
            oModel.setProperty("/hasSelection", false);
            oModel.setProperty("/selectedDetail", {});
            oModel.setProperty("/tableRows", oModel.getProperty("/allDetailRows") || []);
            oModel.setProperty("/tableExpanded", false);
            this._refreshSummary();
            this._refreshSankeyRender();
        },

        onCycleLegendPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem");
            var oContext = oItem && oItem.getBindingContext("allocationMap");
            var oCycle = oContext && oContext.getObject();
            var oModel = this.getView().getModel("allocationMap");
            var sCurrentKey = oModel.getProperty("/highlightedCycleKey");

            if (!oCycle) {
                return;
            }

            if (sCurrentKey === oCycle.key) {
                oModel.setProperty("/highlightedCycleKey", "");
                oModel.setProperty("/selectedCycleText", "-");
            } else {
                oModel.setProperty("/highlightedCycleKey", oCycle.key);
                oModel.setProperty("/selectedCycleText", oCycle.title);
            }

            this._refreshSankeyRender();
        },

        onOpenAllocationDetail: function () {
            var oDetail = this.getView().getModel("allocationMap").getProperty("/selectedDetail") || {};

            this.getRouter().navTo("allocationDetail", {
                selection: encodeURIComponent(JSON.stringify({
                    cycle: oDetail.cycle || "",
                    senderKostl: oDetail.senderKostl || "",
                    receiverKostl: oDetail.receiverKostl || "",
                    skfId: oDetail.skfId || ""
                }))
            });
        },

        onOpenDocumentDetail: function () {
            var oDetail = this.getView().getModel("allocationMap").getProperty("/selectedDetail") || {};

            this.navToDocuments(oDetail.receiverKostl || oDetail.senderKostl || "ALL");
        },

        _createMapFilters: function (oFilters) {
            var oBaseFilters = this.normalizeFilters(oFilters || {});

            return Object.assign({}, oBaseFilters, {
                cycle: this.service.clean(oFilters && oFilters.cycle),
                senderKostl: this.service.normalizeNodeId(oFilters && oFilters.senderKostl),
                receiverKostl: this.service.normalizeNodeId(oFilters && oFilters.receiverKostl),
                skfId: this.service.clean(oFilters && oFilters.skfId),
                stepKey: this.service.clean(oFilters && oFilters.stepKey),
                topLimit: this.service.clean(oFilters && oFilters.topLimit) || "20"
            });
        },

        _validateMapFilters: function () {
            var oModel = this.getView().getModel("allocationMap");
            var oFilters = this._createMapFilters(oModel.getProperty("/filters") || {});
            var bValid = true;
            var oStates = {
                gjahrState: "None",
                gjahrStateText: "",
                periodState: "None",
                periodStateText: "",
                cycleState: "None",
                cycleStateText: ""
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

            if (!oFilters.cycle) {
                bValid = false;
                oStates.cycleState = "Error";
                oStates.cycleStateText = "배부사이클을 선택하세요.";
            }

            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/filterStates", oStates);

            if (!bValid) {
                MessageBox.error(!oFilters.cycle ? "배부사이클을 선택하세요." : "회계연도와 기간은 필수입니다.");
                return null;
            }

            return oFilters;
        },

        _loadMap: function (oFilters) {
            var oModel = this.getView().getModel("allocationMap");
            var bHasCycle = !!this.service.clean(oFilters && oFilters.cycle);

            oModel.setProperty("/busy", true);
            this.setWarning("allocationMap", "");

            return this.service.init()
                .then(function () {
                    return Promise.all([
                        this.service.readAllocationRuleRows().catch(function () {
                            return [];
                        }),
                        bHasCycle ? this.service.readAllocationResultRows(oFilters, false).catch(function () {
                            this.setWarning("allocationMap", "배부 전표 데이터가 없습니다.");
                            return [];
                        }.bind(this)) : Promise.resolve([]),
                        bHasCycle ? this.service.readHierarchyRows().catch(function () {
                            return [];
                        }) : Promise.resolve([])
                    ]);
                }.bind(this))
                .then(function (aResults) {
                    this._applyMapData(oFilters, aResults[0], aResults[1], aResults[2]);
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        _applyMapData: function (oFilters, aRuleRows, aYearRows, aHierarchyRows) {
            var oModel = this.getView().getModel("allocationMap");
            var aCurrentRows = this._filterRowsByMonth(aYearRows, oFilters.period);
            var aDetailRows;
            var oSankey;

            oModel.setProperty("/cycleOptions", this._buildFilterOptions(aRuleRows.concat(aYearRows || []), "Cycle", "CycleText"));
            oModel.setProperty("/skfOptions", this._buildFilterOptions(aRuleRows.concat(aYearRows || []), "SkfId", "SkfTxt"));

            if (!this.service.clean(oFilters.cycle)) {
                oSankey = this._emptySankeyModel();
                this.setWarning("allocationMap", "배부사이클을 선택하세요.");
                oModel.setProperty("/currentSankey", oSankey);
                oModel.setProperty("/cycleLegend", []);
                oModel.setProperty("/visibleFlowCountText", "0건");
                oModel.setProperty("/hiddenFlowCountText", "0건");
                oModel.setProperty("/allDetailRows", []);
                oModel.setProperty("/tableRows", []);
                oModel.setProperty("/hasSelection", false);
                oModel.setProperty("/selectedDetail", {});
                oModel.setProperty("/selectedKey", "");
                oModel.setProperty("/selectedType", "");
                oModel.setProperty("/highlightedCycleKey", "");
                oModel.setProperty("/selectedCycleText", "-");
                oModel.setProperty("/tableExpanded", false);
                oModel.setProperty("/summaryItems", this._summaryItems([], null));
                oModel.setProperty("/sankeyHtml", this._emptySankeyHtml("배부사이클을 선택하세요."));
                return;
            }

            this._buildHierarchyPathMap(aHierarchyRows);
            aDetailRows = this._mapDetailRows(aCurrentRows).filter(function (oRow) {
                return !oFilters.stepKey || oRow.stepKey === oFilters.stepKey;
            });
            oSankey = this._buildMultiStepSankeyModel(aDetailRows, oFilters);

            if (!aDetailRows.length) {
                this.setWarning("allocationMap", "배부 전표 데이터가 없습니다.");
            } else if (oFilters.topLimit === "ALL" && oSankey.originalFlowCount > 80) {
                this.setWarning("allocationMap", "표시 항목이 많아 화면이 복잡할 수 있습니다.");
            }

            oModel.setProperty("/currentSankey", oSankey);
            oModel.setProperty("/cycleLegend", oSankey.cycleLegend);
            oModel.setProperty("/visibleFlowCountText", this.formatter.amount(oSankey.visibleFlowCount) + "건");
            oModel.setProperty("/hiddenFlowCountText", this.formatter.amount(oSankey.hiddenFlowCount) + "건");
            oModel.setProperty("/allDetailRows", aDetailRows);
            oModel.setProperty("/tableRows", aDetailRows);
            oModel.setProperty("/hasSelection", false);
            oModel.setProperty("/selectedDetail", {});
            oModel.setProperty("/selectedKey", "");
            oModel.setProperty("/selectedType", "");
            oModel.setProperty("/highlightedCycleKey", "");
            oModel.setProperty("/selectedCycleText", "-");
            oModel.setProperty("/tableExpanded", false);
            oModel.setProperty("/summaryItems", this._summaryItems(aDetailRows, null));
            oModel.setProperty("/sankeyHtml", this._renderSankeySvg(oSankey));
            this.scheduleViewportTableResize([{
                id: "allocationMapDetailTable",
                minRows: 6,
                maxRows: 24,
                bottomOffset: 28
            }]);

            setTimeout(function () {
                this._bindSankeyEvents();
            }.bind(this), 0);
        },

        _filterRowsByMonth: function (aRows, vMonth) {
            var sMonth = this.service.normalizeMonth(vMonth);

            return (aRows || []).filter(function (oRow) {
                return this.service.normalizeMonth(this.service.getField(oRow, "Monat")) === sMonth;
            }.bind(this));
        },

        _emptySankeyModel: function () {
            return {
                nodes: [],
                links: [],
                cycleLegend: [],
                width: 1800,
                height: 760,
                visibleFlowCount: 0,
                hiddenFlowCount: 0,
                originalFlowCount: 0,
                stepKeys: ["1", "2", "3", "4"]
            };
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

        _stepOptions: function () {
            return [
                { key: "", text: "전체" },
                { key: "1", text: "1단계" },
                { key: "2", text: "2단계" },
                { key: "3", text: "3단계" },
                { key: "4", text: "4단계" },
                { key: "UNSPECIFIED", text: "단계 미지정" }
            ];
        },

        _topLimitOptions: function () {
            return [
                { key: "20", text: "상위 20개" },
                { key: "40", text: "상위 40개" },
                { key: "80", text: "상위 80개" },
                { key: "ALL", text: "전체 보기" }
            ];
        },

        _stepLegendRows: function () {
            return [
                { key: "1", text: "1단계", color: STEP_COLORS["1"] },
                { key: "2", text: "2단계", color: STEP_COLORS["2"] },
                { key: "3", text: "3단계", color: STEP_COLORS["3"] },
                { key: "4", text: "4단계", color: STEP_COLORS["4"] },
                { key: "UNSPECIFIED", text: "단계 미지정", color: STEP_COLORS.UNSPECIFIED }
            ];
        },

        _summaryItems: function (aRows, oSelection) {
            var fTotal = this.service.sum(aRows || [], "allocAmount");
            var iDocumentCount = this._distinctDocumentCount(aRows || []);

            return [
                { label: "총 배부금액", value: aRows ? this.formatter.amountWithCurrency(fTotal, "KRW") : "-" },
                { label: "배부건수", value: aRows ? this.formatter.amount(iDocumentCount) + "건" : "-" },
                { label: "선택 단계", value: oSelection && oSelection.stepText || "-" },
                { label: "선택 사이클", value: oSelection && oSelection.cycleText || "-" },
                { label: "선택 흐름 금액", value: oSelection && oSelection.amountText || "-" }
            ];
        },

        _mapDetailRows: function (aRows) {
            return (aRows || []).map(function (oRow, iIndex) {
                var iStepNo = this._parseAllocationStep(oRow);
                var sStepKey = iStepNo ? String(iStepNo) : "UNSPECIFIED";
                var sSenderKostl = this.service.normalizeNodeId(this.service.getField(oRow, "SenderKostl"));
                var sReceiverKostl = this.service.normalizeNodeId(this.service.getField(oRow, "ReceiverKostl"));
                var oSenderName = this._resolveCostCenterDisplayName(sSenderKostl, this.service.getField(oRow, "SenderKostlTxt"));
                var oReceiverName = this._resolveCostCenterDisplayName(sReceiverKostl, this.service.getField(oRow, "ReceiverKostlTxt"));
                var sRowKey = "R" + iIndex + "_" + this._safeKey(this._documentKey(oRow));

                return {
                    rowKey: sRowKey,
                    raw: oRow,
                    stepNo: iStepNo,
                    stepKey: sStepKey,
                    stepText: this._stepText(sStepKey),
                    stepSort: iStepNo || 999,
                    cycle: this.service.clean(this.service.getField(oRow, "Cycle")),
                    cycleText: this._textOrCode(this.service.getField(oRow, "CycleText"), this.service.getField(oRow, "Cycle")),
                    cycleStartDate: this.service.clean(this.service.getField(oRow, "CycleStartDate")),
                    cycleEndDate: this.service.clean(this.service.getField(oRow, "CycleEndDate")),
                    segmNo: this.service.clean(this.service.getField(oRow, "SegmNo")),
                    segmentText: this._textOrCode(this.service.getField(oRow, "SegmName"), this.service.getField(oRow, "SegmNo")),
                    skfId: this.service.clean(this.service.getField(oRow, "SkfId")),
                    skfText: this._textOrCode(this.service.getField(oRow, "SkfTxt"), this.service.getField(oRow, "SkfId")),
                    skfUnitTxt: this.formatter.skfUnitText(this.service.getField(oRow, "SkfUnitTxt")),
                    basisValue: this._numberOrNull(this.service.getField(oRow, "BasisValue")),
                    basisRatio: this._numberOrNull(this.service.getField(oRow, "BasisRatio")),
                    basisMatched: this.service.clean(this.service.getField(oRow, "BasisMatched")),
                    basisValueText: this._formatBasisValue(this.service.getField(oRow, "BasisValue"), this.service.getField(oRow, "SkfUnitTxt"), this.service.getField(oRow, "BasisMatched")),
                    basisRatioText: this._formatBasisRatio(this.service.getField(oRow, "BasisRatio"), this.service.getField(oRow, "BasisMatched")),
                    senderKostl: sSenderKostl,
                    senderText: oSenderName.text,
                    senderTooltip: oSenderName.tooltip,
                    senderManager: this.service.clean(this.service.getField(oRow, "SenderManager")) || "-",
                    receiverKostl: sReceiverKostl,
                    receiverText: oReceiverName.text,
                    receiverTooltip: oReceiverName.tooltip,
                    receiverManager: this.service.clean(this.service.getField(oRow, "ReceiverManager")) || "-",
                    receiverPrctr: this.service.clean(this.service.getField(oRow, "ReceiverPrctr")),
                    receiverPrctrText: this._textOrCode(this.service.getField(oRow, "ReceiverPrctrTxt"), this.service.getField(oRow, "ReceiverPrctr")),
                    allocAmount: Number(this.service.getField(oRow, "AllocAmount") || 0),
                    signedAmount: Number(this.service.getField(oRow, "SignedAmount") || this.service.getField(oRow, "AllocAmount") || 0),
                    waers: this.service.clean(this.service.getField(oRow, "Waers")) || "KRW",
                    bukrs: this.service.clean(this.service.getField(oRow, "Bukrs")),
                    gjahr: this.service.clean(this.service.getField(oRow, "Gjahr")),
                    monat: this.service.normalizeMonth(this.service.getField(oRow, "Monat")),
                    belnr: this.service.clean(this.service.getField(oRow, "Belnr")) || "-",
                    docln: this.service.clean(this.service.getField(oRow, "Docln")) || "-",
                    budat: this.service.clean(this.service.getField(oRow, "Budat")),
                    saknr: this.service.clean(this.service.getField(oRow, "Saknr")) || "-",
                    saknrTxt: this.service.clean(this.service.getField(oRow, "SaknrTxt")) || "-"
                };
            }.bind(this)).sort(function (oFirst, oSecond) {
                return oFirst.stepSort - oSecond.stepSort ||
                    oFirst.cycleText.localeCompare(oSecond.cycleText, "ko") ||
                    oFirst.segmNo.localeCompare(oSecond.segmNo) ||
                    Math.abs(oSecond.allocAmount || 0) - Math.abs(oFirst.allocAmount || 0) ||
                    String(oSecond.budat || "").localeCompare(String(oFirst.budat || "")) ||
                    String(oSecond.belnr || "").localeCompare(String(oFirst.belnr || "")) ||
                    String(oFirst.docln || "").localeCompare(String(oSecond.docln || ""));
            });
        },

        _parseAllocationStep: function (oRow) {
            var sText = [
                this.service.getField(oRow, "CycleText"),
                this.service.getField(oRow, "SegmName"),
                this.service.getField(oRow, "Cycle")
            ].filter(Boolean).join(" ");
            var aPatterns = [
                /\[(\d+)단계\]/,
                /(\d+)단계/,
                /(\d+)차\s*배부/,
                /(\d+)차/
            ];
            var iIndex;
            var aMatch;

            for (iIndex = 0; iIndex < aPatterns.length; iIndex += 1) {
                aMatch = aPatterns[iIndex].exec(sText);
                if (aMatch && aMatch[1]) {
                    return parseInt(aMatch[1], 10);
                }
            }

            return null;
        },

        _buildMultiStepSankeyModel: function (aRows, oFilters) {
            var aGroupedRows = this._groupSankeyRows(aRows);
            var oLimited = this._limitGroupedRows(aGroupedRows, oFilters.topLimit);
            var mNodes = {};
            var mLinks = {};
            var mCycleLegend = {};
            var aLinks;
            var aNodes;
            var aStepKeys;
            var fMaxAmount;
            var oLayout;

            oLimited.rows.forEach(function (oGroup) {
                var sCycleKey = this._cycleKey(oGroup);
                var sColor = this._cycleColor(sCycleKey);
                var sStepKey = oGroup.stepKey;
                var sSenderNodeId = "S_" + sStepKey + "_" + this._safeKey(oGroup.senderKostl);
                var sCycleNodeId = "C_" + sStepKey + "_" + this._safeKey(oGroup.cycle) + "_" + this._safeKey(oGroup.segmNo) + "_" + this._safeKey(oGroup.skfId);
                var sReceiverNodeId = "R_" + sStepKey + "_" + this._safeKey(oGroup.receiverKostl);

                if (!mCycleLegend[sCycleKey]) {
                    mCycleLegend[sCycleKey] = {
                        key: sCycleKey,
                        title: oGroup.cycleText,
                        subText: this._stepText(sStepKey),
                        stepKey: sStepKey,
                        color: sColor
                    };
                }

                this._ensureSankeyNode(mNodes, sSenderNodeId, {
                    id: sSenderNodeId,
                    type: "sender",
                    stepKey: sStepKey,
                    stepNo: oGroup.stepNo,
                    title: oGroup.senderText,
                    subtitle: oGroup.senderKostl,
                    tooltip: oGroup.senderTooltip,
                    kostl: oGroup.senderKostl,
                    cycleKey: sCycleKey,
                    color: sColor,
                    badgeColor: this._stepColor(sStepKey)
                }, oGroup);

                this._ensureSankeyNode(mNodes, sCycleNodeId, {
                    id: sCycleNodeId,
                    type: "cycle",
                    stepKey: sStepKey,
                    stepNo: oGroup.stepNo,
                    title: oGroup.cycleText,
                    subtitle: oGroup.skfText + " / " + oGroup.segmentText,
                    tooltip: oGroup.cycleText + "\n" + oGroup.segmentText + "\n" + oGroup.skfText,
                    cycle: oGroup.cycle,
                    segmNo: oGroup.segmNo,
                    skfId: oGroup.skfId,
                    cycleKey: sCycleKey,
                    color: sColor,
                    badgeColor: this._stepColor(sStepKey)
                }, oGroup);

                this._ensureSankeyNode(mNodes, sReceiverNodeId, {
                    id: sReceiverNodeId,
                    type: "receiver",
                    stepKey: sStepKey,
                    stepNo: oGroup.stepNo,
                    title: oGroup.receiverText,
                    subtitle: oGroup.receiverKostl,
                    tooltip: oGroup.receiverTooltip,
                    kostl: oGroup.receiverKostl,
                    cycleKey: sCycleKey,
                    color: sColor,
                    badgeColor: this._stepColor(sStepKey)
                }, oGroup);

                this._addSankeyLink(mLinks, sSenderNodeId, sCycleNodeId, oGroup, sCycleKey, sColor, "senderToCycle");
                this._addSankeyLink(mLinks, sCycleNodeId, sReceiverNodeId, oGroup, sCycleKey, sColor, "cycleToReceiver");
            }.bind(this));

            aNodes = Object.keys(mNodes).map(function (sNodeId) {
                var oNode = mNodes[sNodeId];
                oNode.documentCount = Object.keys(oNode.documentKeys || {}).length;
                return oNode;
            });
            aStepKeys = this._orderedStepKeys(aNodes);
            this._addBridgeLinks(mLinks, aNodes, aStepKeys);
            aLinks = Object.keys(mLinks).map(function (sLinkId) {
                var oLink = mLinks[sLinkId];
                oLink.documentCount = Object.keys(oLink.documentKeys || {}).length;
                return oLink;
            });
            fMaxAmount = aLinks.reduce(function (fMax, oLink) {
                return oLink.bridge ? fMax : Math.max(fMax, Math.abs(oLink.amount || 0));
            }, 0);
            aLinks.forEach(function (oLink) {
                oLink.width = oLink.bridge ? 2 : this._getLinkWidth(oLink.amount, fMaxAmount);
            }.bind(this));
            oLayout = this._layoutSankeyColumns(aNodes, aLinks, aStepKeys);

            return {
                nodes: oLayout.nodes,
                links: aLinks,
                cycleLegend: Object.keys(mCycleLegend).map(function (sKey) {
                    return mCycleLegend[sKey];
                }).sort(function (oFirst, oSecond) {
                    return this._stepSortValue(oFirst.stepKey) - this._stepSortValue(oSecond.stepKey) ||
                        oFirst.title.localeCompare(oSecond.title, "ko");
                }.bind(this)),
                width: oLayout.width,
                height: oLayout.height,
                visibleFlowCount: oLimited.visibleFlowCount,
                hiddenFlowCount: oLimited.hiddenFlowCount,
                originalFlowCount: aGroupedRows.length,
                stepKeys: aStepKeys
            };
        },

        _groupSankeyRows: function (aRows) {
            var mGroups = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = [
                    oRow.stepKey,
                    oRow.cycle,
                    oRow.cycleText,
                    oRow.segmNo,
                    oRow.segmentText,
                    oRow.skfId,
                    oRow.senderKostl,
                    oRow.receiverKostl,
                    oRow.receiverPrctr
                ].join("|");
                var sDocKey = this._documentKey(oRow);

                if (!oRow.senderKostl || !oRow.receiverKostl) {
                    return;
                }

                if (!mGroups[sKey]) {
                    mGroups[sKey] = Object.assign({}, oRow, {
                        groupKey: sKey,
                        amount: 0,
                        lineCount: 0,
                        rowKeys: [],
                        documentKeys: {},
                        basisValues: [],
                        basisRatios: [],
                        budatValues: []
                    });
                }

                mGroups[sKey].amount += Number(oRow.allocAmount || 0);
                mGroups[sKey].lineCount += 1;
                mGroups[sKey].rowKeys.push(oRow.rowKey);
                if (sDocKey !== "||") {
                    mGroups[sKey].documentKeys[sDocKey] = true;
                }
                if (oRow.basisMatched === "X" && oRow.basisValue !== null) {
                    mGroups[sKey].basisValues.push(Number(oRow.basisValue || 0));
                }
                if (oRow.basisMatched === "X" && oRow.basisRatio !== null) {
                    mGroups[sKey].basisRatios.push(Number(oRow.basisRatio || 0));
                }
                if (oRow.budat) {
                    mGroups[sKey].budatValues.push(oRow.budat);
                }
            }.bind(this));

            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                var aRatios = this._uniqueNumberValues(oGroup.basisRatios);
                var fBasisValue = oGroup.basisValues.length ? oGroup.basisValues.reduce(function (fSum, fValue) {
                    return fSum + fValue;
                }, 0) : null;

                oGroup.documentCount = Object.keys(oGroup.documentKeys || {}).length;
                oGroup.basisValueText = fBasisValue === null ? "-" : this._formatBasisValue(fBasisValue, oGroup.skfUnitTxt, "X");
                oGroup.basisRatioText = aRatios.length === 1 ? this._formatBasisRatio(aRatios[0], "X") : (aRatios.length > 1 ? "혼합" : "-");
                oGroup.budatRangeText = this._dateRangeText(oGroup.budatValues);
                return oGroup;
            }.bind(this)).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0);
            });
        },

        _limitGroupedRows: function (aGroupedRows, sTopLimit) {
            var iLimit = sTopLimit === "ALL" ? aGroupedRows.length : Number(sTopLimit || 40);
            var aVisible = aGroupedRows.slice(0, iLimit);
            var aHidden = aGroupedRows.slice(iLimit);
            var mEtcGroups = {};

            aHidden.forEach(function (oGroup) {
                var sKey = [oGroup.stepKey, this._cycleKey(oGroup)].join("|");

                if (!mEtcGroups[sKey]) {
                    mEtcGroups[sKey] = Object.assign({}, oGroup, {
                        groupKey: "__ETC__" + sKey,
                        senderKostl: "__ETC_SENDER__" + oGroup.stepKey,
                        senderText: "기타 송신부서 (0개)",
                        senderTooltip: "기타 송신부서",
                        receiverKostl: "__ETC_RECEIVER__" + oGroup.stepKey,
                        receiverText: "기타 수신부서 (0개)",
                        receiverTooltip: "기타 수신부서",
                        cycleText: oGroup.cycleText || "기타 배부사이클",
                        segmentText: "기타 배부사이클",
                        amount: 0,
                        lineCount: 0,
                        rowKeys: [],
                        documentKeys: {},
                        basisValueText: "-",
                        basisRatioText: "-",
                        budatValues: [],
                        hiddenSenderCodes: {},
                        hiddenReceiverCodes: {}
                    });
                }

                mEtcGroups[sKey].amount += Number(oGroup.amount || 0);
                mEtcGroups[sKey].lineCount += Number(oGroup.lineCount || 0);
                mEtcGroups[sKey].rowKeys = mEtcGroups[sKey].rowKeys.concat(oGroup.rowKeys || []);
                mEtcGroups[sKey].hiddenSenderCodes[oGroup.senderKostl] = true;
                mEtcGroups[sKey].hiddenReceiverCodes[oGroup.receiverKostl] = true;
                Object.keys(oGroup.documentKeys || {}).forEach(function (sDocKey) {
                    mEtcGroups[sKey].documentKeys[sDocKey] = true;
                });
                mEtcGroups[sKey].budatValues = mEtcGroups[sKey].budatValues.concat(oGroup.budatValues || []);
            }.bind(this));

            Object.keys(mEtcGroups).forEach(function (sKey) {
                var oGroup = mEtcGroups[sKey];
                var iSenderCount = Object.keys(oGroup.hiddenSenderCodes || {}).length;
                var iReceiverCount = Object.keys(oGroup.hiddenReceiverCodes || {}).length;

                oGroup.senderText = "기타 송신부서 (" + iSenderCount + "개)";
                oGroup.receiverText = "기타 수신부서 (" + iReceiverCount + "개)";
                oGroup.documentCount = Object.keys(oGroup.documentKeys || {}).length;
                oGroup.budatRangeText = this._dateRangeText(oGroup.budatValues);
                aVisible.push(oGroup);
            }.bind(this));

            return {
                rows: aVisible,
                visibleFlowCount: aVisible.length,
                hiddenFlowCount: aHidden.length
            };
        },

        _ensureSankeyNode: function (mNodes, sNodeId, oBaseNode, oGroup) {
            if (!mNodes[sNodeId]) {
                mNodes[sNodeId] = Object.assign({
                    amount: 0,
                    rowKeys: [],
                    documentKeys: {},
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT
                }, oBaseNode);
            }

            mNodes[sNodeId].amount += Number(oGroup.amount || 0);
            mNodes[sNodeId].rowKeys = mNodes[sNodeId].rowKeys.concat(oGroup.rowKeys || []);
            Object.keys(oGroup.documentKeys || {}).forEach(function (sDocKey) {
                mNodes[sNodeId].documentKeys[sDocKey] = true;
            });
        },

        _addSankeyLink: function (mLinks, sSource, sTarget, oGroup, sCycleKey, sColor, sType) {
            var sKey = "L_" + sType + "_" + sSource + "_" + sTarget;

            if (!mLinks[sKey]) {
                mLinks[sKey] = {
                    id: sKey,
                    source: sSource,
                    target: sTarget,
                    type: sType,
                    stepKey: oGroup.stepKey,
                    stepNo: oGroup.stepNo,
                    cycle: oGroup.cycle,
                    cycleText: oGroup.cycleText,
                    cycleKey: sCycleKey,
                    segmNo: oGroup.segmNo,
                    segmentText: oGroup.segmentText,
                    skfId: oGroup.skfId,
                    skfText: oGroup.skfText,
                    senderKostl: oGroup.senderKostl,
                    senderText: oGroup.senderText,
                    senderTooltip: oGroup.senderTooltip,
                    receiverKostl: oGroup.receiverKostl,
                    receiverText: oGroup.receiverText,
                    receiverTooltip: oGroup.receiverTooltip,
                    receiverPrctr: oGroup.receiverPrctr,
                    receiverPrctrText: oGroup.receiverPrctrText,
                    basisValueText: oGroup.basisValueText,
                    basisRatioText: oGroup.basisRatioText,
                    budatRangeText: oGroup.budatRangeText,
                    amount: 0,
                    color: sColor,
                    rowKeys: [],
                    documentKeys: {}
                };
            }

            mLinks[sKey].amount += Number(oGroup.amount || 0);
            mLinks[sKey].rowKeys = mLinks[sKey].rowKeys.concat(oGroup.rowKeys || []);
            Object.keys(oGroup.documentKeys || {}).forEach(function (sDocKey) {
                mLinks[sKey].documentKeys[sDocKey] = true;
            });
        },

        _addBridgeLinks: function (mLinks, aNodes, aStepKeys) {
            var mReceivers = {};
            var mSenders = {};

            aNodes.forEach(function (oNode) {
                if (oNode.type === "receiver" && oNode.kostl) {
                    mReceivers[oNode.stepKey + "|" + oNode.kostl] = oNode;
                }
                if (oNode.type === "sender" && oNode.kostl) {
                    mSenders[oNode.stepKey + "|" + oNode.kostl] = oNode;
                }
            });

            aStepKeys.forEach(function (sStepKey, iIndex) {
                var sNextStepKey = aStepKeys[iIndex + 1];

                if (!sNextStepKey) {
                    return;
                }

                aNodes.forEach(function (oNode) {
                    var oNextSender;
                    var sLinkKey;

                    if (oNode.type !== "receiver" || oNode.stepKey !== sStepKey || !oNode.kostl) {
                        return;
                    }

                    oNextSender = mSenders[sNextStepKey + "|" + oNode.kostl];
                    if (!oNextSender) {
                        return;
                    }

                    sLinkKey = "B_" + oNode.id + "_" + oNextSender.id;
                    mLinks[sLinkKey] = {
                        id: sLinkKey,
                        source: oNode.id,
                        target: oNextSender.id,
                        bridge: true,
                        type: "bridge",
                        stepKey: sStepKey,
                        cycleKey: "",
                        amount: 0,
                        color: "#9aa8b8",
                        rowKeys: [],
                        documentKeys: {},
                        title: "다음 단계 재배부 송신부서로 연결"
                    };
                });
            });
        },

        _orderedStepKeys: function (aNodes) {
            var mKeys = {};
            var aKeys;

            (aNodes || []).forEach(function (oNode) {
                mKeys[oNode.stepKey] = true;
            });

            aKeys = Object.keys(mKeys).sort(function (sFirst, sSecond) {
                return this._stepSortValue(sFirst) - this._stepSortValue(sSecond);
            }.bind(this));

            return aKeys.length ? aKeys : ["1", "2", "3", "4"];
        },

        _layoutSankeyColumns: function (aNodes, aLinks, aStepKeys) {
            var mStepIndex = {};
            var mColumns = {};
            var iColumnCount;
            var iMaxColumnNodeCount = 0;

            aStepKeys.forEach(function (sStepKey, iIndex) {
                mStepIndex[sStepKey] = iIndex;
            });

            aNodes.forEach(function (oNode) {
                var iRoleOffset = oNode.type === "sender" ? 0 : oNode.type === "cycle" ? 1 : 2;
                var iColumn = (mStepIndex[oNode.stepKey] || 0) * 3 + iRoleOffset;

                oNode.columnIndex = iColumn;
                if (!mColumns[iColumn]) {
                    mColumns[iColumn] = [];
                }
                mColumns[iColumn].push(oNode);
            });

            Object.keys(mColumns).forEach(function (sColumn) {
                var aColumnNodes = mColumns[sColumn].sort(function (oFirst, oSecond) {
                    return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                        String(oFirst.title || "").localeCompare(String(oSecond.title || ""), "ko");
                });

                iMaxColumnNodeCount = Math.max(iMaxColumnNodeCount, aColumnNodes.length);
                aColumnNodes.forEach(function (oNode, iIndex) {
                    oNode.x = LEFT_PADDING + Number(sColumn) * (NODE_WIDTH + COLUMN_GAP);
                    oNode.y = TOP_PADDING + iIndex * (NODE_HEIGHT + ROW_GAP);
                });
            });

            iColumnCount = Math.max(12, aStepKeys.length * 3);

            return {
                nodes: aNodes,
                links: aLinks,
                width: Math.max(1800, iColumnCount * (NODE_WIDTH + COLUMN_GAP) + 300),
                height: Math.max(760, iMaxColumnNodeCount * (NODE_HEIGHT + ROW_GAP) + 170)
            };
        },

        _renderSankeySvg: function (oSankey) {
            var oModel = this.getView().getModel("allocationMap");
            var sSelectedKey = oModel.getProperty("/selectedKey") || "";
            var sSelectedType = oModel.getProperty("/selectedType") || "";
            var sHighlightedCycleKey = oModel.getProperty("/highlightedCycleKey") || "";
            var fZoom = Number(oModel.getProperty("/zoom") || 1);
            var aNodes = oSankey.nodes || [];
            var aLinks = oSankey.links || [];
            var mNodes = {};
            var sGuides = "";
            var sLinks = "";
            var sNodes = "";
            var iColumn;
            var iScaledWidth = Math.max(1800, Math.round((oSankey.width || 1800) * fZoom));
            var iScaledHeight = Math.max(760, Math.round((oSankey.height || 760) * fZoom));

            if (!aNodes.length) {
                return this._emptySankeyHtml("배부 전표 데이터가 없습니다.");
            }

            aNodes.forEach(function (oNode) {
                mNodes[oNode.id] = oNode;
            });

            for (iColumn = 0; iColumn < Math.ceil((oSankey.width || 1800) / (NODE_WIDTH + COLUMN_GAP)); iColumn += 1) {
                sGuides += "<line class=\"ze4SankeyColumnGuide\" x1=\"" + (LEFT_PADDING + iColumn * (NODE_WIDTH + COLUMN_GAP) - 18) + "\" y1=\"44\" x2=\"" +
                    (LEFT_PADDING + iColumn * (NODE_WIDTH + COLUMN_GAP) - 18) + "\" y2=\"" + ((oSankey.height || 760) - 40) + "\" />";
            }

            sLinks = aLinks.map(function (oLink) {
                var oSource = mNodes[oLink.source];
                var oTarget = mNodes[oLink.target];
                var sClass = "ze4SankeyLink";
                var bRelated = this._isRelatedLink(oLink, sSelectedKey, sSelectedType);
                var bDimmed = (sHighlightedCycleKey && oLink.cycleKey !== sHighlightedCycleKey && !oLink.bridge) ||
                    (sSelectedKey && !bRelated);

                if (!oSource || !oTarget) {
                    return "";
                }

                if (oLink.bridge) {
                    sClass += " ze4SankeyBridgeLink";
                }
                if (oLink.id === sSelectedKey) {
                    sClass += " ze4SankeyLinkSelected";
                } else if (bDimmed) {
                    sClass += " ze4SankeyLinkDimmed";
                }

                return "<path class=\"" + sClass + "\" data-sankey-link=\"" + this._escapeHtml(oLink.id) + "\" d=\"" +
                    this._createLinkPath(oSource, oTarget) + "\" stroke=\"" + this._escapeHtml(oLink.color || "#0A6ED1") +
                    "\" stroke-width=\"" + this._escapeHtml(oLink.width || 2) + "\"><title>" +
                    this._escapeHtml(this._linkTooltip(oLink)) + "</title></path>";
            }.bind(this)).join("");

            sNodes = aNodes.map(function (oNode) {
                var sClass = "ze4SankeyNode";
                var bRelated = this._isRelatedNode(oNode, sSelectedKey, sSelectedType, aLinks);
                var bDimmed = (sHighlightedCycleKey && oNode.cycleKey !== sHighlightedCycleKey) ||
                    (sSelectedKey && !bRelated);

                if (oNode.id === sSelectedKey) {
                    sClass += " ze4SankeyNodeSelected";
                } else if (bDimmed) {
                    sClass += " ze4SankeyNodeDimmed";
                }

                return this._renderSankeyNode(oNode, sClass);
            }.bind(this)).join("");

            return "<div class=\"ze4SankeyHost\" style=\"width:" + iScaledWidth + "px;height:" + iScaledHeight + "px;\">" +
                "<svg class=\"ze4SankeySvg\" width=\"" + iScaledWidth + "\" height=\"" + iScaledHeight + "\" viewBox=\"0 0 " +
                (oSankey.width || 1800) + " " + (oSankey.height || 760) + "\" role=\"img\">" +
                sGuides + this._renderColumnLabels(oSankey) + sLinks + sNodes + "</svg></div>";
        },

        _renderColumnLabels: function (oSankey) {
            var aLabels = [];
            var aStepKeys = oSankey.stepKeys || ["1", "2", "3", "4"];
            var iStep;
            var aRoleLabels = ["송신부서", "배부사이클/세그먼트", "수신부서"];

            for (iStep = 0; iStep < aStepKeys.length; iStep += 1) {
                aRoleLabels.forEach(function (sRoleLabel, iOffset) {
                    var iColumn = iStep * 3 + iOffset;
                    aLabels.push("<text class=\"ze4SankeyStageLabel\" x=\"" +
                        (LEFT_PADDING + iColumn * (NODE_WIDTH + COLUMN_GAP)) + "\" y=\"30\">" +
                        this._escapeHtml(this._stepText(aStepKeys[iStep]) + " " + sRoleLabel) + "</text>");
                }.bind(this));
            }

            return aLabels.join("");
        },

        _renderSankeyNode: function (oNode, sClass) {
            var sBadge = this._stepText(oNode.stepKey) + " " + (oNode.type === "sender" ? "송신" : oNode.type === "receiver" ? "수신" : "배부");
            var sTitle = this._truncateText(oNode.title, 17);
            var sSub = this._truncateText(oNode.subtitle, 21);
            var sAmount = this._truncateText(this.formatter.compactAmount(oNode.amount) + " KRW", 21);
            var sDoc = this.formatter.amount(oNode.documentCount || 0) + "건";

            return "<g class=\"" + sClass + "\" data-sankey-node=\"" + this._escapeHtml(oNode.id) + "\" transform=\"translate(" + oNode.x + "," + oNode.y + ")\">" +
                "<title>" + this._escapeHtml(this._nodeTooltip(oNode)) + "</title>" +
                "<rect class=\"ze4SankeyNodeRect\" width=\"" + NODE_WIDTH + "\" height=\"" + NODE_HEIGHT + "\" rx=\"10\" style=\"stroke:" + this._escapeHtml(oNode.color || "#0A6ED1") + "\" />" +
                "<rect class=\"ze4SankeyNodeBadge\" x=\"10\" y=\"8\" width=\"72\" height=\"18\" rx=\"9\" style=\"fill:" + this._escapeHtml(oNode.badgeColor || "#0A6ED1") + "\" />" +
                "<text class=\"ze4SankeyNodeBadgeText\" x=\"46\" y=\"21\" text-anchor=\"middle\">" + this._escapeHtml(sBadge) + "</text>" +
                "<text class=\"ze4SankeyNodeTitle\" x=\"10\" y=\"41\">" + this._escapeHtml(sTitle) + "</text>" +
                "<text class=\"ze4SankeyNodeSub\" x=\"10\" y=\"57\">" + this._escapeHtml(sSub) + "</text>" +
                "<text class=\"ze4SankeyNodeAmount\" x=\"" + (NODE_WIDTH - 10) + "\" y=\"57\" text-anchor=\"end\">" + this._escapeHtml(sAmount + " / " + sDoc) + "</text>" +
                "</g>";
        },

        _createLinkPath: function (oSource, oTarget) {
            var x1 = oSource.x + NODE_WIDTH;
            var y1 = oSource.y + NODE_HEIGHT / 2;
            var x2 = oTarget.x;
            var y2 = oTarget.y + NODE_HEIGHT / 2;
            var mx = (x1 + x2) / 2;

            return ["M", x1, y1, "C", mx, y1, mx, y2, x2, y2].join(" ");
        },

        _bindSankeyEvents: function () {
            var oHtml = this.byId("allocationSankeyHost");
            var oDomRef = oHtml && oHtml.getDomRef();
            var oSvg;

            if (!oDomRef) {
                return;
            }

            Array.prototype.forEach.call(oDomRef.querySelectorAll("[data-sankey-node]"), function (oElement) {
                oElement.onclick = function (oEvent) {
                    oEvent.stopPropagation();
                    this._onSankeyNodeClick(oElement.getAttribute("data-sankey-node"));
                }.bind(this);
            }.bind(this));

            Array.prototype.forEach.call(oDomRef.querySelectorAll("[data-sankey-link]"), function (oElement) {
                oElement.onclick = function (oEvent) {
                    oEvent.stopPropagation();
                    this._onSankeyLinkClick(oElement.getAttribute("data-sankey-link"));
                }.bind(this);
            }.bind(this));

            oSvg = oDomRef.querySelector("svg");
            if (oSvg) {
                oSvg.onclick = function () {
                    this.onClearSelection();
                }.bind(this);
            }
        },

        _onSankeyNodeClick: function (sNodeId) {
            var oModel = this.getView().getModel("allocationMap");
            var oSankey = oModel.getProperty("/currentSankey") || {};
            var oNode = (oSankey.nodes || []).find(function (oCandidate) {
                return oCandidate.id === sNodeId;
            });
            var aRows = this._rowsByKeys(oNode && oNode.rowKeys || []);
            var oDetail;

            if (!oNode) {
                return;
            }

            oDetail = this._detailFromRows(aRows, {
                type: "node",
                stepKey: oNode.stepKey,
                cycleText: oNode.type === "cycle" ? oNode.title : "-",
                senderText: oNode.type === "sender" ? oNode.title : "-",
                receiverText: oNode.type === "receiver" ? oNode.title : "-"
            });
            oModel.setProperty("/selectedKey", sNodeId);
            oModel.setProperty("/selectedType", "node");
            oModel.setProperty("/hasSelection", true);
            oModel.setProperty("/selectedDetail", oDetail);
            oModel.setProperty("/tableRows", aRows);
            oModel.setProperty("/tableExpanded", true);
            this._refreshSummary(oDetail);
            this._refreshSankeyRender();
        },

        _onSankeyLinkClick: function (sLinkId) {
            var oModel = this.getView().getModel("allocationMap");
            var oSankey = oModel.getProperty("/currentSankey") || {};
            var oLink = (oSankey.links || []).find(function (oCandidate) {
                return oCandidate.id === sLinkId;
            });
            var aRows = this._rowsByKeys(oLink && oLink.rowKeys || []);
            var oDetail;

            if (!oLink) {
                return;
            }

            oDetail = oLink.bridge ? {
                stepText: "다음 단계 재배부 송신부서로 연결",
                cycleText: "-",
                segmentText: "-",
                senderText: "-",
                receiverText: "-",
                receiverPrctrText: "-",
                skfText: "-",
                basisValueText: "-",
                basisRatioText: "-",
                amountText: "-",
                documentCountText: "-",
                budatRangeText: "-"
            } : this._detailFromRows(aRows, oLink);
            oModel.setProperty("/selectedKey", sLinkId);
            oModel.setProperty("/selectedType", "link");
            oModel.setProperty("/hasSelection", true);
            oModel.setProperty("/selectedDetail", oDetail);
            oModel.setProperty("/tableRows", aRows);
            oModel.setProperty("/tableExpanded", true);
            this._refreshSummary(oDetail);
            this._refreshSankeyRender();
        },

        _detailFromRows: function (aRows, oFallback) {
            var fAmount = this.service.sum(aRows || [], "allocAmount");
            var iDocumentCount = this._distinctDocumentCount(aRows || []);
            var oFirst = (aRows || [])[0] || {};
            var aRatios = this._uniqueNumberValues((aRows || []).map(function (oRow) {
                return oRow.basisMatched === "X" ? oRow.basisRatio : null;
            }).filter(function (vValue) {
                return vValue !== null && vValue !== undefined;
            }));
            var fBasisValue = (aRows || []).reduce(function (fSum, oRow) {
                return oRow.basisMatched === "X" && oRow.basisValue !== null ? fSum + Number(oRow.basisValue || 0) : fSum;
            }, 0);
            var bHasBasis = (aRows || []).some(function (oRow) {
                return oRow.basisMatched === "X" && oRow.basisValue !== null;
            });

            return {
                stepText: (oFallback && oFallback.stepText) || this._stepText((oFallback && oFallback.stepKey) || oFirst.stepKey),
                cycle: (oFallback && oFallback.cycle) || oFirst.cycle || "",
                cycleText: (oFallback && oFallback.cycleText) || oFirst.cycleText || "-",
                segmNo: (oFallback && oFallback.segmNo) || oFirst.segmNo || "",
                segmentText: (oFallback && oFallback.segmentText) || oFirst.segmentText || "-",
                senderKostl: (oFallback && oFallback.senderKostl) || oFirst.senderKostl || "",
                senderText: (oFallback && oFallback.senderText) || oFirst.senderText || "-",
                receiverKostl: (oFallback && oFallback.receiverKostl) || oFirst.receiverKostl || "",
                receiverText: (oFallback && oFallback.receiverText) || oFirst.receiverText || "-",
                receiverPrctrText: (oFallback && oFallback.receiverPrctrText) || oFirst.receiverPrctrText || "-",
                skfId: (oFallback && oFallback.skfId) || oFirst.skfId || "",
                skfText: (oFallback && oFallback.skfText) || oFirst.skfText || "-",
                basisValueText: bHasBasis ? this._formatBasisValue(fBasisValue, oFirst.skfUnitTxt, "X") : "-",
                basisRatioText: aRatios.length === 1 ? this._formatBasisRatio(aRatios[0], "X") : (aRatios.length > 1 ? "혼합" : "-"),
                amountText: this.formatter.amountWithCurrency(fAmount, "KRW"),
                documentCountText: this.formatter.amount(iDocumentCount) + "건",
                budatRangeText: this._dateRangeText((aRows || []).map(function (oRow) {
                    return oRow.budat;
                }))
            };
        },

        _rowsByKeys: function (aRowKeys) {
            var mKeys = {};
            var aRows = this.getView().getModel("allocationMap").getProperty("/allDetailRows") || [];

            (aRowKeys || []).forEach(function (sKey) {
                mKeys[sKey] = true;
            });

            return aRows.filter(function (oRow) {
                return mKeys[oRow.rowKey];
            });
        },

        _refreshSummary: function (oDetail) {
            var oModel = this.getView().getModel("allocationMap");

            oModel.setProperty("/summaryItems", this._summaryItems(oModel.getProperty("/allDetailRows") || [], oDetail || null));
        },

        _refreshSankeyRender: function () {
            var oModel = this.getView().getModel("allocationMap");

            oModel.setProperty("/sankeyHtml", this._renderSankeySvg(oModel.getProperty("/currentSankey") || {}));
            setTimeout(function () {
                this._bindSankeyEvents();
            }.bind(this), 0);
        },

        _isRelatedLink: function (oLink, sSelectedKey, sSelectedType) {
            if (!sSelectedKey) {
                return true;
            }

            if (sSelectedType === "link") {
                return oLink.id === sSelectedKey ||
                    (!oLink.bridge && this._sameCycleSegment(oLink, this._selectedLink()));
            }

            return oLink.source === sSelectedKey || oLink.target === sSelectedKey;
        },

        _isRelatedNode: function (oNode, sSelectedKey, sSelectedType, aLinks) {
            if (!sSelectedKey) {
                return true;
            }

            if (oNode.id === sSelectedKey) {
                return true;
            }

            return (aLinks || []).some(function (oLink) {
                return this._isRelatedLink(oLink, sSelectedKey, sSelectedType) &&
                    (oLink.source === oNode.id || oLink.target === oNode.id);
            }.bind(this));
        },

        _selectedLink: function () {
            var oModel = this.getView().getModel("allocationMap");
            var oSankey = oModel.getProperty("/currentSankey") || {};
            var sSelectedKey = oModel.getProperty("/selectedKey");

            return (oSankey.links || []).find(function (oLink) {
                return oLink.id === sSelectedKey;
            }) || {};
        },

        _sameCycleSegment: function (oFirst, oSecond) {
            return oFirst && oSecond &&
                oFirst.cycleKey && oFirst.cycleKey === oSecond.cycleKey &&
                this.service.clean(oFirst.segmNo) === this.service.clean(oSecond.segmNo);
        },

        _nodeTooltip: function (oNode) {
            return [
                oNode.tooltip || oNode.title,
                oNode.subtitle,
                this._stepText(oNode.stepKey),
                oNode.type === "sender" ? "송신부서" : oNode.type === "receiver" ? "수신부서" : "배부사이클/세그먼트",
                this.formatter.amountWithCurrency(oNode.amount, "KRW"),
                this.formatter.amount(oNode.documentCount || 0) + "건"
            ].filter(Boolean).join("\n");
        },

        _linkTooltip: function (oLink) {
            if (oLink.bridge) {
                return "다음 단계 재배부 송신부서로 연결";
            }

            return [
                oLink.senderText + " → " + oLink.receiverText,
                oLink.cycleText,
                oLink.segmentText,
                oLink.skfText,
                oLink.basisValueText,
                oLink.basisRatioText,
                this.formatter.amountWithCurrency(oLink.amount, "KRW"),
                this.formatter.amount(oLink.documentCount || 0) + "건"
            ].join("\n");
        },

        _getLinkWidth: function (fAmount, fMaxAmount) {
            var fRatio;

            if (!fAmount || !fMaxAmount) {
                return 1;
            }

            fRatio = Math.abs(fAmount) / Math.abs(fMaxAmount);
            return Math.max(2, Math.min(34, 2 + Math.sqrt(fRatio) * 32));
        },

        _buildHierarchyPathMap: function (aHierarchyRows) {
            var mParentById = {};
            var mTextById = {};
            var mPathById = {};
            var that = this;

            (aHierarchyRows || []).forEach(function (oRow) {
                var sChildId = that.service.normalizeNodeId(that.service.getField(oRow, "child_id"));
                var sParentId = that.service.normalizeNodeId(that.service.getField(oRow, "parent_id"));
                var sText = that.service.clean(that.service.getField(oRow, "node_text"));

                if (sChildId) {
                    mParentById[sChildId] = sParentId;
                    if (that._isUsableText(sText, sChildId)) {
                        mTextById[sChildId] = sText;
                    }
                }
            });

            function buildPath(sId, mVisited) {
                var sNormalizedId = that.service.normalizeNodeId(sId);
                var sParentId;
                var aParentPath;

                if (!sNormalizedId || mVisited[sNormalizedId]) {
                    return [];
                }

                if (mPathById[sNormalizedId]) {
                    return mPathById[sNormalizedId];
                }

                mVisited[sNormalizedId] = true;
                sParentId = mParentById[sNormalizedId];
                aParentPath = sParentId ? buildPath(sParentId, mVisited) : [];
                mPathById[sNormalizedId] = aParentPath.concat([mTextById[sNormalizedId] || sNormalizedId]);
                return mPathById[sNormalizedId];
            }

            Object.keys(mParentById).forEach(function (sId) {
                buildPath(sId, {});
            });

            this._mOrgTextById = mTextById;
            this._mOrgPathById = mPathById;
        },

        _resolveCostCenterDisplayName: function (sKostl, vDirectText) {
            var sCode = this.service.normalizeNodeId(sKostl);
            var aPath = this._mOrgPathById && this._mOrgPathById[sCode];
            var sHierarchyText = this._mOrgTextById && this._mOrgTextById[sCode];
            var sDirectText = this.service.clean(vDirectText);
            var sText;

            if (aPath && aPath.length && sHierarchyText) {
                return {
                    text: this._makeShortOrgPathLabel(aPath),
                    tooltip: aPath.join(" > ")
                };
            }

            if (this._isUsableText(sDirectText, sCode)) {
                sText = this._cleanDepartmentText(sDirectText);
                return {
                    text: sText,
                    tooltip: sText
                };
            }

            return {
                text: "-",
                tooltip: "-"
            };
        },

        _makeShortOrgPathLabel: function (aPath) {
            var aCleanPath = (aPath || []).filter(Boolean);
            var sCurrent = aCleanPath[aCleanPath.length - 1] || "-";
            var sParent = aCleanPath[aCleanPath.length - 2] || "";

            return sParent ? sParent + " / " + sCurrent : sCurrent;
        },

        _cleanDepartmentText: function (sText) {
            return this.service.clean(sText).replace(/\s+/g, " ");
        },

        _isUsableText: function (sText, sCode) {
            var sCleanText = this.service.clean(sText);
            var sCleanCode = this.service.normalizeNodeId(sCode);

            return !!sCleanText && (!sCleanCode || this.service.normalizeNodeId(sCleanText) !== sCleanCode);
        },

        _formatBasisValue: function (vValue, sUnitText, sMatched) {
            var sMatchedValue = this.service.clean(sMatched);
            var sUnit = this.formatter.skfUnitText(sUnitText);

            if (sMatchedValue !== "X") {
                return "-";
            }

            if (vValue === null || vValue === undefined || vValue === "") {
                return "-";
            }

            return this.formatter.amount(vValue) + (sUnit ? " " + sUnit : "");
        },

        _formatBasisRatio: function (vValue, sMatched) {
            var sMatchedValue = this.service.clean(sMatched);
            var fValue;

            if (sMatchedValue !== "X") {
                return "-";
            }

            if (vValue === null || vValue === undefined || vValue === "") {
                return "-";
            }

            fValue = Number(vValue);
            return isNaN(fValue) ? "-" : fValue.toFixed(1) + "%";
        },

        _cycleKey: function (oGroup) {
            return [oGroup.stepKey, oGroup.cycle, oGroup.segmNo, oGroup.skfId].map(this.service.clean).join("|");
        },

        _cycleColor: function (sCycleKey) {
            return CYCLE_PALETTE[Math.abs(this._hashCode(sCycleKey)) % CYCLE_PALETTE.length];
        },

        _stepColor: function (sStepKey) {
            return STEP_COLORS[sStepKey] || STEP_COLORS["5"];
        },

        _stepText: function (sStepKey) {
            return sStepKey === "UNSPECIFIED" ? "단계 미지정" : (sStepKey ? sStepKey + "단계" : "-");
        },

        _stepSortValue: function (sStepKey) {
            return sStepKey === "UNSPECIFIED" ? 999 : Number(sStepKey || 999);
        },

        _dateRangeText: function (aValues) {
            var aDates = (aValues || []).map(this.service.clean).filter(Boolean).sort();

            if (!aDates.length) {
                return "-";
            }

            return this.formatter.date(aDates[0]) + " ~ " + this.formatter.date(aDates[aDates.length - 1]);
        },

        _distinctDocumentCount: function (aRows) {
            var mKeys = {};

            (aRows || []).forEach(function (oRow) {
                var sKey = this._documentKey(oRow);
                if (sKey !== "||") {
                    mKeys[sKey] = true;
                }
            }.bind(this));

            return Object.keys(mKeys).length;
        },

        _documentKey: function (oRow) {
            return [
                oRow.bukrs || this.service.getField(oRow, "Bukrs"),
                oRow.gjahr || this.service.getField(oRow, "Gjahr"),
                oRow.belnr || this.service.getField(oRow, "Belnr")
            ].map(this.service.clean).join("|");
        },

        _uniqueNumberValues: function (aValues) {
            var mSeen = {};

            return (aValues || []).filter(function (vValue) {
                var fValue = Number(vValue);
                var sKey;

                if (isNaN(fValue)) {
                    return false;
                }

                sKey = String(fValue);
                if (mSeen[sKey]) {
                    return false;
                }

                mSeen[sKey] = true;
                return true;
            });
        },

        _numberOrNull: function (vValue) {
            var fValue;

            if (vValue === null || vValue === undefined || vValue === "") {
                return null;
            }

            fValue = Number(vValue);
            return isNaN(fValue) ? null : fValue;
        },

        _textOrCode: function (vText, vCode) {
            var sText = this.service.clean(vText);
            var sCode = this.service.clean(vCode);

            return sText || sCode || "-";
        },

        _hashCode: function (sValue) {
            var sText = String(sValue || "");
            var iHash = 0;
            var iIndex;

            for (iIndex = 0; iIndex < sText.length; iIndex += 1) {
                iHash = ((iHash << 5) - iHash) + sText.charCodeAt(iIndex);
                iHash |= 0;
            }

            return iHash;
        },

        _safeKey: function (vValue) {
            return this.service.clean(vValue).replace(/[^A-Za-z0-9_]/g, "_") || "EMPTY";
        },

        _truncateText: function (sText, iMaxLength) {
            var sValue = this.service.clean(sText);

            if (sValue.length <= iMaxLength) {
                return sValue;
            }

            return sValue.slice(0, Math.max(0, iMaxLength - 1)) + "...";
        },

        _emptySankeyHtml: function (sText) {
            return "<div class=\"ze4SankeyHost\"><div class=\"ze4SvgEmptyState\">" + this._escapeHtml(sText) + "</div></div>";
        },

        _escapeHtml: function (vValue) {
            return String(vValue === null || vValue === undefined ? "" : vValue)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
    });
});
