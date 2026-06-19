sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "ZE4_CC_COST/util/AllocationFlow",
    "sap/m/MessageBox"
], function (BaseController, Flow, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.AllocationFlowDetail", {
        getModelName: function () {
            return "flow2";
        },

        onInit: function () {
            var oModel = this.createViewModel({
                pageTitle: "[EverNiture-CO] 배부 상세 내역",
                context: {},
                contextChips: [],
                filters: this._createFilters(this.createDefaultFilters()),
                cycleOptions: [],
                senderCcgOptions: [],
                receiverCcgOptions: [],
                senderCostCenterOptions: [],
                receiverCostCenterOptions: [],
                segmentOptions: [],
                skfOptions: [],
                kpis: [],
                detailRows: [],
                detailVisibleRowCount: 16,
                selectedDetail: this._emptyDetail(),
                skfSummaryRows: [],
                hasRows: false
            });

            oModel.setSizeLimit(30000);
            this.getView().setModel(oModel, "flow2");
            this.getRouter().getRoute("allocationFlowDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        onAfterRendering: function () {
            if (!this._fnDetailResize) {
                this._fnDetailResize = this._scheduleDetailTableResize.bind(this);
                window.addEventListener("resize", this._fnDetailResize);
            }
            this._scheduleDetailTableResize();
        },

        onExit: function () {
            if (this._fnDetailResize) {
                window.removeEventListener("resize", this._fnDetailResize);
                this._fnDetailResize = null;
            }
            if (this._iDetailResizeTimer) {
                clearTimeout(this._iDetailResizeTimer);
                this._iDetailResizeTimer = null;
            }
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments") || {};
            var oContext = Flow.decodeContext(oArgs.context);

            this.getView().getModel("flow2").setProperty("/context", oContext);
            this._loadWithContext(oContext);
        },

        onSearch: function () {
            var oFilters = this._validateFilters();

            if (oFilters) {
                this._loadData(oFilters);
            }
        },

        onResetFilters: function () {
            var oContext = this.getView().getModel("flow2").getProperty("/context") || {};
            this._loadWithContext(oContext);
        },

        onGoAllocationFlowOverview: function () {
            this.getRouter().navTo("allocationFlowOverview");
        },

        onDetailRowSelection: function (oEvent) {
            var oTable = oEvent.getSource();
            var iIndex = oTable.getSelectedIndex();
            var oContext = iIndex > -1 && oTable.getContextByIndex(iIndex);
            var oRow = oContext && oContext.getObject();
            var oModel = this.getView().getModel("flow2");

            if (oRow) {
                oModel.setProperty("/selectedDetail", oRow);
                oModel.setProperty("/skfSummaryRows", this._buildSkfSummary(oRow._groupRows || [oRow.raw]));
                oModel.setProperty("/contextChips", this._contextChips(this._effectiveContext(oModel.getProperty("/context") || {}, oModel.getProperty("/filters") || {}, oRow)));
                oModel.setProperty("/pageTitle", this._pageTitle(oModel.getProperty("/context") || {}, oRow, oModel.getProperty("/filters") || {}));
            }
        },

        _loadWithContext: function (oContext) {
            var oModel = this.getView().getModel("flow2");

            oModel.setProperty("/busy", true);
            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("flow2");
                }.bind(this))
                .then(function (oDefaults) {
                    var oFilters = this._createFilters(Object.assign({}, oDefaults, oContext || {}));

                    oModel.setProperty("/filters", oFilters);
                    oModel.setProperty("/contextChips", this._contextChips(oContext));
                    return this._loadData(oFilters);
                }.bind(this))
                .catch(function () {
                    this.setWarning("flow2", "조회 조건에 해당하는 배부 데이터가 없습니다.");
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        _createFilters: function (oFilters) {
            var oBase = this.normalizeFilters(oFilters || {});

            return Object.assign({}, oBase, {
                cycle: Flow.clean(oFilters && oFilters.cycle),
                senderCcgId: Flow.clean(oFilters && oFilters.senderCcgId),
                senderCcgIds: Flow.normalizeIdList(oFilters && oFilters.senderCcgIds),
                receiverCcgId: Flow.clean(oFilters && oFilters.receiverCcgId),
                receiverCcgIds: Flow.normalizeIdList(oFilters && oFilters.receiverCcgIds),
                senderKostl: Flow.normalize(oFilters && oFilters.senderKostl),
                receiverKostl: Flow.normalize(oFilters && oFilters.receiverKostl),
                segmNo: Flow.clean(oFilters && oFilters.segmNo),
                skfId: Flow.clean(oFilters && oFilters.skfId),
                belnr: Flow.clean(oFilters && oFilters.belnr),
                groupBasis: Flow.clean(oFilters && oFilters.groupBasis) || "DIRECT"
            });
        },

        _validateFilters: function () {
            var oModel = this.getView().getModel("flow2");
            var oFilters = this._createFilters(oModel.getProperty("/filters") || {});
            var oStates = {
                gjahrState: "None",
                gjahrStateText: "",
                periodState: "None",
                periodStateText: ""
            };
            var bValid = true;

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

            return oFilters;
        },

        _loadData: function (oRawFilters) {
            var oModel = this.getView().getModel("flow2");
            var oFilters = this._createFilters(oRawFilters);
            var oReadFilters = Object.assign({}, oFilters, {
                cycle: "",
                senderKostl: "",
                receiverKostl: "",
                skfId: ""
            });

            oModel.setProperty("/busy", true);
            this.setWarning("flow2", "");

            return Promise.all([
                this.service.readAllocationResultRows(oReadFilters, true).catch(function () {
                    return [];
                }),
                this.service.readHierarchyRows().catch(function () {
                    return [];
                })
            ]).then(function (aResults) {
                var aRows = aResults[0] || [];
                var oHierarchyIndex = Flow.buildHierarchyIndex(aResults[1] || []);
                var aEnriched = Flow.enrichRows(aRows, oHierarchyIndex, oFilters.groupBasis);
                var aFiltered = this._applyFilters(aEnriched, oFilters);
                var oEffectiveFilters = oFilters;
                var aDetailRows = this._buildDetailRows(aFiltered);
                var oSelected = aDetailRows[0] || this._emptyDetail();
                var oContext = oModel.getProperty("/context") || {};

                if (!aDetailRows.length && oFilters.senderCcgId && oFilters.receiverKostl) {
                    oEffectiveFilters = Object.assign({}, oFilters, {
                        senderCcgId: ""
                    });
                    aFiltered = this._applyFilters(aEnriched, oEffectiveFilters);
                    aDetailRows = this._buildDetailRows(aFiltered);
                    oSelected = aDetailRows[0] || this._emptyDetail();
                }

                oModel.setProperty("/filters", oEffectiveFilters);
                oModel.setProperty("/cycleOptions", Flow.createOptions(aRows, "Cycle", "CycleText", "전체"));
                oModel.setProperty("/senderCcgOptions", Flow.createCcgOptions(aEnriched, "_senderCcgId", "_senderCcgText"));
                oModel.setProperty("/receiverCcgOptions", Flow.createCcgOptions(aEnriched, "_receiverCcgId", "_receiverCcgText"));
                oModel.setProperty("/senderCostCenterOptions", this._costCenterOptions(aEnriched, "_senderKostl", "_senderKostlText"));
                oModel.setProperty("/receiverCostCenterOptions", this._costCenterOptions(aEnriched, "_receiverKostl", "_receiverKostlText"));
                oModel.setProperty("/segmentOptions", Flow.createOptions(aRows, "SegmNo", "SegmName", "전체"));
                oModel.setProperty("/skfOptions", Flow.createOptions(aRows, "SkfId", "SkfTxt", "전체"));
                oModel.setProperty("/detailRows", aDetailRows);
                oModel.setProperty("/selectedDetail", oSelected);
                oModel.setProperty("/skfSummaryRows", this._buildSkfSummary(aFiltered));
                oModel.setProperty("/kpis", this._buildKpis(aFiltered));
                oModel.setProperty("/contextChips", this._contextChips(this._effectiveContext(oContext, oEffectiveFilters, oSelected)));
                oModel.setProperty("/pageTitle", this._pageTitle(oContext, oSelected, oEffectiveFilters));
                oModel.setProperty("/hasRows", aDetailRows.length > 0);
                this._scheduleDetailTableResize();

                if (!aDetailRows.length) {
                    this.setWarning("flow2", "조회 조건에 해당하는 배부 데이터가 없습니다.");
                }
            }.bind(this)).catch(function () {
                this.setWarning("flow2", "조회 조건에 해당하는 배부 데이터가 없습니다.");
            }.bind(this)).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _scheduleDetailTableResize: function () {
            if (this._iDetailResizeTimer) {
                clearTimeout(this._iDetailResizeTimer);
            }
            this._iDetailResizeTimer = setTimeout(function () {
                this._iDetailResizeTimer = null;
                this._syncDetailTableRowCount();
            }.bind(this), 0);
        },

        _syncDetailTableRowCount: function () {
            var oTable = this.byId("allocationFlowDetailTable");
            var oModel = this.getView().getModel("flow2");
            var aRows = oModel && oModel.getProperty("/detailRows") || [];
            var oTableDom = oTable && oTable.getDomRef();
            var iViewportHeight;
            var iTableTop;
            var iAvailableHeight;
            var iCapacity;
            var iRowCount;

            if (!oModel || !oTableDom) {
                return;
            }

            iViewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
            iTableTop = oTableDom.getBoundingClientRect().top;
            iAvailableHeight = Math.max(0, iViewportHeight - iTableTop - 24);
            iCapacity = Math.floor((iAvailableHeight - 42) / 32);
            iCapacity = Math.max(8, Math.min(32, iCapacity));
            iRowCount = aRows.length ? Math.min(aRows.length, iCapacity) : 8;

            if (oModel.getProperty("/detailVisibleRowCount") !== iRowCount) {
                oModel.setProperty("/detailVisibleRowCount", iRowCount);
            }
        },

        _applyFilters: function (aRows, oFilters) {
            var aSenderCcgIds = Flow.normalizeIdList(oFilters.senderCcgIds);
            var aReceiverCcgIds = Flow.normalizeIdList(oFilters.receiverCcgIds);

            return (aRows || []).filter(function (oRow) {
                if (oFilters.cycle && oRow._cycle !== oFilters.cycle) {
                    return false;
                }
                if (aSenderCcgIds.length && aSenderCcgIds.indexOf(oRow._senderCcgId) === -1) {
                    return false;
                }
                if (!aSenderCcgIds.length && oFilters.senderCcgId && oRow._senderCcgId !== oFilters.senderCcgId) {
                    return false;
                }
                if (aReceiverCcgIds.length && aReceiverCcgIds.indexOf(oRow._receiverCcgId) === -1) {
                    return false;
                }
                if (!aReceiverCcgIds.length && oFilters.receiverCcgId && oRow._receiverCcgId !== oFilters.receiverCcgId) {
                    return false;
                }
                if (oFilters.senderKostl && oRow._senderKostl !== oFilters.senderKostl) {
                    return false;
                }
                if (oFilters.receiverKostl && oRow._receiverKostl !== oFilters.receiverKostl) {
                    return false;
                }
                if (oFilters.segmNo && oRow._segmNo !== oFilters.segmNo) {
                    return false;
                }
                if (oFilters.skfId && oRow._skfId !== oFilters.skfId) {
                    return false;
                }
                if (oFilters.belnr && Flow.clean(Flow.getField(oRow, "Belnr")).indexOf(oFilters.belnr) === -1) {
                    return false;
                }
                return true;
            });
        },

        _buildDetailRows: function (aRows) {
            return (aRows || []).map(function (oRow) {
                var sBelnr = Flow.clean(Flow.getField(oRow, "Belnr"));
                var sDocln = Flow.clean(Flow.getField(oRow, "Docln"));
                var sSaknr = Flow.clean(Flow.getField(oRow, "Saknr"));

                return {
                    raw: oRow,
                    rowKey: [sBelnr, sDocln, oRow._rowKey].join("|"),
                    senderCcgText: oRow._senderCcgText,
                    senderKostl: oRow._senderKostl,
                    senderText: oRow._senderKostlText,
                    receiverCcgText: oRow._receiverCcgText,
                    receiverKostl: oRow._receiverKostl,
                    receiverText: oRow._receiverKostlText,
                    receiverPrctrText: Flow.textOrCode(Flow.getField(oRow, "ReceiverPrctrTxt"), Flow.getField(oRow, "ReceiverPrctr")),
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    segmentText: oRow._segmText,
                    segmNo: oRow._segmNo,
                    skfId: oRow._skfId,
                    skfText: oRow._skfText,
                    basisValueText: Flow.basisValueText(oRow),
                    basisRatioText: Flow.basisRatioText(oRow),
                    amount: oRow._amount,
                    amountText: Flow.amountText(oRow._amount, oRow._waers),
                    belnr: sBelnr || "-",
                    docln: sDocln || "-",
                    budat: oRow._budat,
                    budatText: Flow.formatDate(oRow._budat),
                    saknr: sSaknr,
                    saknrText: Flow.textOrCode(Flow.getField(oRow, "SaknrTxt"), sSaknr),
                    waers: oRow._waers,
                    ruleStatusText: Flow.isBasisMatched(oRow) ? "규칙 매칭 완료" : "배부기준값을 찾을 수 없습니다.",
                    ruleState: Flow.isBasisMatched(oRow) ? "Success" : "Warning",
                    cyclePeriodText: [Flow.formatDate(Flow.getField(oRow, "CycleStartDate")), Flow.formatDate(Flow.getField(oRow, "CycleEndDate"))].join(" ~ "),
                    createdBy: Flow.textOrCode(Flow.getField(oRow, "CreatedBy"), ""),
                    createdAt: Flow.textOrCode(Flow.getField(oRow, "CreatedAt"), ""),
                    documentStatusText: Flow.textOrCode(Flow.getField(oRow, "BstatTxt"), Flow.getField(oRow, "Bstat")),
                    _sortBudat: oRow._budat,
                    _sortDocln: Number(sDocln || 0)
                };
            }).sort(function (oFirst, oSecond) {
                return Flow.clean(oSecond._sortBudat).localeCompare(Flow.clean(oFirst._sortBudat)) ||
                    Flow.clean(oSecond.belnr).localeCompare(Flow.clean(oFirst.belnr)) ||
                    oFirst._sortDocln - oSecond._sortDocln ||
                    Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0);
            });
        },

        _buildKpis: function (aRows) {
            var fTotal = (aRows || []).reduce(function (fSum, oRow) {
                return fSum + oRow._amount;
            }, 0);
            var mDocHeaders = {};
            var mDocLines = {};
            var aBasisGroups = this._buildBasisGroups(aRows);

            (aRows || []).forEach(function (oRow) {
                var sDocKey = oRow._documentKey;
                var sDocln = Flow.clean(Flow.getField(oRow, "Docln"));
                var sLineKey = sDocKey && sDocKey !== "||" ?
                    [sDocKey, sDocln || oRow._rowKey].join("|") :
                    oRow._rowKey;

                if (sDocKey && sDocKey !== "||") {
                    mDocHeaders[sDocKey] = true;
                }
                if (sLineKey) {
                    mDocLines[sLineKey] = true;
                }
            });

            return [
                this._createDetailKpi("배부금액", Flow.amountText(fTotal, "KRW"), "", "None", "sap-icon://money-bills"),
                this._createDetailKpi("배부기준", this._basisNameText(aBasisGroups), "", "None", "sap-icon://group", this._basisNameLines(aBasisGroups)),
                this._createDetailKpi("배부기준값", this._basisTotalText(aBasisGroups), "", "None", "sap-icon://lead", this._basisValueLines(aBasisGroups)),
                this._createDetailKpi("비율", this._basisRatioText(aBasisGroups), "", "None", "sap-icon://percentage", this._basisRatioLines(aBasisGroups)),
                this._createDetailKpi("전표 건수", Object.keys(mDocHeaders).length + "건 / " + Object.keys(mDocLines).length + "라인", "", "None", "sap-icon://documents")
            ];
        },

        _createDetailKpi: function (sTitle, sValue, sSubText, sState, sIcon, aDetailLines) {
            return Object.assign(this.createKpi(sTitle, sValue, sSubText, sState, sIcon), {
                detailLines: aDetailLines || []
            });
        },

        _buildBasisGroups: function (aRows) {
            var mGroups = {};

            (aRows || []).forEach(function (oRow) {
                var fBasis = Flow.numberOrNull(Flow.getField(oRow, "BasisValue"));
                var fRatio = Flow.numberOrNull(Flow.getField(oRow, "BasisRatio"));
                var sSkfText = Flow.clean(oRow._skfText) || Flow.textOrCode(Flow.getField(oRow, "SkfTxt"), Flow.getField(oRow, "SkfId"));
                var sUnit = Flow.skfUnitText(Flow.getField(oRow, "SkfUnitTxt"));
                var sKey = [sSkfText, sUnit].join("|");

                if (!Flow.isBasisMatched(oRow) || fBasis === null || !sSkfText || sSkfText === "-") {
                    return;
                }

                if (!mGroups[sKey]) {
                    mGroups[sKey] = {
                        skfText: sSkfText,
                        unit: sUnit,
                        basisValue: 0,
                        ratios: {}
                    };
                }

                mGroups[sKey].basisValue += fBasis;
                if (fRatio !== null) {
                    mGroups[sKey].ratios[fRatio.toFixed(1)] = fRatio;
                }
            });

            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                oGroup.ratioValues = Object.keys(oGroup.ratios).map(function (sRatioKey) {
                    return oGroup.ratios[sRatioKey];
                }).sort(function (fFirst, fSecond) {
                    return fFirst - fSecond;
                });
                return oGroup;
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.basisValue || 0) - Math.abs(oFirst.basisValue || 0) ||
                    oFirst.skfText.localeCompare(oSecond.skfText, "ko");
            });
        },

        _basisNameText: function (aGroups) {
            if (!aGroups.length) {
                return "-";
            }
            return aGroups.length === 1 ? aGroups[0].skfText : aGroups.length + "개 기준";
        },

        _basisTotalText: function (aGroups) {
            var fTotal;
            var sUnit;

            if (!aGroups.length) {
                return "-";
            }

            fTotal = aGroups.reduce(function (fSum, oGroup) {
                return fSum + Flow.toNumber(oGroup.basisValue);
            }, 0);
            sUnit = aGroups.every(function (oGroup) {
                return oGroup.unit === aGroups[0].unit;
            }) ? aGroups[0].unit : "";

            return sUnit ? Flow.amountText(fTotal, sUnit) : aGroups.length + "개 기준값";
        },

        _basisRatioText: function (aGroups) {
            var aRatios = [];

            aGroups.forEach(function (oGroup) {
                aRatios = aRatios.concat(oGroup.ratioValues || []);
            });

            return this._ratioRangeText(aRatios);
        },

        _basisNameLines: function (aGroups) {
            return aGroups.map(function (oGroup) {
                return {
                    label: oGroup.skfText,
                    value: oGroup.unit || "기준"
                };
            });
        },

        _basisValueLines: function (aGroups) {
            return aGroups.map(function (oGroup) {
                return {
                    label: oGroup.skfText,
                    value: Flow.amountText(oGroup.basisValue, oGroup.unit)
                };
            });
        },

        _basisRatioLines: function (aGroups) {
            return aGroups.map(function (oGroup) {
                return {
                    label: oGroup.skfText,
                    value: this._ratioRangeText(oGroup.ratioValues || [])
                };
            }.bind(this));
        },

        _ratioRangeText: function (aRatios) {
            var aValues = (aRatios || []).filter(function (fValue, iIndex, aSource) {
                return fValue !== null && fValue !== undefined && aSource.indexOf(fValue) === iIndex;
            }).sort(function (fFirst, fSecond) {
                return fFirst - fSecond;
            });

            if (!aValues.length) {
                return "-";
            }
            if (aValues.length === 1) {
                return Flow.rateText(aValues[0]);
            }
            return Flow.rateText(aValues[0]) + " ~ " + Flow.rateText(aValues[aValues.length - 1]);
        },

        _buildSkfSummary: function (aRows) {
            var mRows = {};
            var fTotalBasis = 0;

            (aRows || []).forEach(function (oRow) {
                var fBasis = Flow.numberOrNull(Flow.getField(oRow, "BasisValue"));
                var sKey = oRow._receiverKostl || Flow.normalize(Flow.getField(oRow, "ReceiverKostl"));

                if (!Flow.isBasisMatched(oRow) || fBasis === null || !sKey) {
                    return;
                }

                if (!mRows[sKey]) {
                    mRows[sKey] = {
                        receiverText: oRow._receiverKostlText || Flow.textOrCode(Flow.getField(oRow, "ReceiverKostlTxt"), sKey),
                        basisValue: 0
                    };
                }
                mRows[sKey].basisValue += fBasis;
                fTotalBasis += fBasis;
            });

            return Object.keys(mRows).map(function (sKey) {
                var oRow = mRows[sKey];
                oRow.ratioText = fTotalBasis ? Flow.rateText(oRow.basisValue / fTotalBasis * 100) : "-";
                return oRow;
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.basisValue || 0) - Math.abs(oFirst.basisValue || 0);
            });
        },

        _costCenterOptions: function (aRows, sCodeField, sTextField) {
            var mSeen = {};
            var aOptions = [{
                key: "",
                text: "전체"
            }];

            (aRows || []).forEach(function (oRow) {
                var sKey = Flow.clean(oRow[sCodeField]);
                var sText = Flow.clean(oRow[sTextField]) || sKey;

                if (sKey && !mSeen[sKey]) {
                    mSeen[sKey] = true;
                    aOptions.push({
                        key: sKey,
                        text: sText
                    });
                }
            });

            return aOptions.sort(function (oFirst, oSecond) {
                if (!oFirst.key) {
                    return -1;
                }
                if (!oSecond.key) {
                    return 1;
                }
                return oFirst.text.localeCompare(oSecond.text, "ko");
            });
        },

        _contextChips: function (oContext) {
            return [
                { label: "선택 CCG", text: oContext && oContext.receiverCcgText || "-" },
                { label: "선택 코스트센터", text: oContext && oContext.receiverKostlText || "-" },
                { label: "선택 흐름", text: [oContext && oContext.senderCcgText, oContext && oContext.cycleText, oContext && oContext.receiverCcgText, oContext && oContext.receiverKostlText].filter(Boolean).join(" → ") || "-" }
            ];
        },

        _effectiveContext: function (oContext, oFilters, oSelected) {
            var fnValue = this._contextValue;

            oContext = oContext || {};
            oFilters = oFilters || {};
            oSelected = oSelected || {};

            return Object.assign({}, oContext, {
                senderCcgText: fnValue(oContext.senderCcgText) || fnValue(oSelected.senderCcgText) || fnValue(oFilters.senderCcgId),
                receiverCcgText: fnValue(oContext.receiverCcgText) || fnValue(oSelected.receiverCcgText) || fnValue(oFilters.receiverCcgId),
                receiverKostlText: fnValue(oContext.receiverKostlText) || fnValue(oSelected.receiverText) || fnValue(oFilters.receiverKostl),
                cycleText: fnValue(oContext.cycleText) || fnValue(oSelected.cycleText) || fnValue(oFilters.cycle)
            });
        },

        _pageTitle: function (oContext, oSelected, oFilters) {
            var oEffective = this._effectiveContext(oContext || {}, oFilters || {}, oSelected || {});
            var sTarget = this._contextValue(oEffective.receiverKostlText) ||
                this._contextValue(oEffective.receiverCcgText) ||
                this._contextValue(oEffective.senderCcgText);

            return sTarget ? "[EverNiture-CO] " + sTarget + " 배부 상세 내역" : "[EverNiture-CO] 배부 상세 내역";
        },

        _contextValue: function (vValue) {
            var sValue = Flow.clean(vValue);
            return sValue === "-" ? "" : sValue;
        },

        _emptyDetail: function () {
            return {
                senderCcgText: "-",
                senderText: "-",
                receiverCcgText: "-",
                receiverText: "-",
                receiverPrctrText: "-",
                cycleText: "-",
                segmentText: "-",
                skfText: "-",
                basisValueText: "-",
                basisRatioText: "-",
                amountText: "-",
                belnr: "-",
                docln: "-",
                budatText: "-",
                saknrText: "-",
                waers: "-",
                ruleStatusText: "-",
                ruleState: "None",
                cyclePeriodText: "-"
            };
        }
    });
});
