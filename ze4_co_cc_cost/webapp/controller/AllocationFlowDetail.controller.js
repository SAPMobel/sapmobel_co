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

        buildExportReport: function () {
            var oModel = this.getView().getModel("flow2");
            var oSelected = oModel.getProperty("/selectedDetail") || {};

            return {
                title: "[EverNiture-CO] 배부 상세 내역",
                fileName: "AllocationFlowDetail",
                variant: "allocation",
                description: "선택 배부 흐름의 상세 전표 라인과 SKF 기준 요약 리포트",
                filters: this.exportFilterRows("flow2", [
                    { label: "송신 코스트센터", property: "senderKostl" },
                    { label: "수신 코스트센터", property: "receiverKostl" },
                    { label: "세그먼트", property: "segmNo" },
                    { label: "배부기준", property: "skfId" }
                ]),
                summary: this.exportKpiRows("flow2").concat([
                    { label: "선택 전표번호", value: oSelected.belnr },
                    { label: "선택 전기일자", value: oSelected.budatText },
                    { label: "선택 계정", value: oSelected.saknrText },
                    { label: "선택 배부사이클", value: oSelected.cycleText },
                    { label: "선택 배부기준", value: oSelected.skfText },
                    { label: "선택 금액", value: this.exportAmount(oSelected.allocAmount || oSelected.amount, oSelected.waers) }
                ]),
                sections: [
                    this.exportSection("배부 상세 라인", oModel.getProperty("/detailRows"), this._flowDetailExportColumns()),
                    this.exportSection("SKF 기준 요약", oModel.getProperty("/skfSummaryRows"), [
                        { label: "SKF ID", property: "skfId" },
                        { label: "배부기준", property: "skfText" },
                        { label: "기준값", property: "basisValueText" },
                        { label: "수신 비율", property: "basisRatioText", type: "text", summary: false },
                        { label: "금액", value: function (oRow) { return this.exportAmount(oRow.amount); }.bind(this) }
                    ])
                ]
            };
        },

        _flowDetailExportColumns: function () {
            return [
                { label: "전표번호", property: "belnr" },
                { label: "전기일자", property: "budatText" },
                { label: "라인", property: "docln" },
                { label: "송신 코스트센터", property: "senderText" },
                { label: "수신 코스트센터", property: "receiverText" },
                { label: "흐름 방향", property: "directionText" },
                { label: "계정", property: "saknrText" },
                { label: "계정 성격", property: "accountRoleText" },
                { label: "배부사이클", property: "cycleText" },
                { label: "세그먼트", property: "segmentText" },
                { label: "배부기준", property: "skfText" },
                { label: "기준값", property: "basisValueText" },
                { label: "수신 비율", property: "basisRatioText", type: "text", summary: false },
                { label: "금액", value: function (oRow) { return this.exportAmount(oRow.allocAmount || oRow.amount, oRow.waers); }.bind(this) },
                { label: "통화", property: "waers" }
            ];
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
                oModel.setProperty("/skfSummaryRows", this._skfSummaryForDetail(oRow));
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
                var oEffectiveFilters = this._normalizeFiltersWithAvailableOptions(aEnriched, oFilters);
                var aFiltered = this._applyFilters(aEnriched, oEffectiveFilters);
                var oBasisPoolIndex = this._buildBasisPoolIndex(this._basisScopeRows(aEnriched, oEffectiveFilters));
                var aDetailRows = this._buildDetailRows(aFiltered, oBasisPoolIndex, oEffectiveFilters);
                var oSelected = aDetailRows[0] || this._emptyDetail();
                var oContext = oModel.getProperty("/context") || {};
                var oFilterOptions;

                if (!aDetailRows.length && oEffectiveFilters.senderCcgId && oEffectiveFilters.receiverKostl) {
                    oEffectiveFilters = Object.assign({}, oEffectiveFilters, {
                        senderCcgId: ""
                    });
                    oEffectiveFilters = this._normalizeFiltersWithAvailableOptions(aEnriched, oEffectiveFilters);
                    aFiltered = this._applyFilters(aEnriched, oEffectiveFilters);
                    oBasisPoolIndex = this._buildBasisPoolIndex(this._basisScopeRows(aEnriched, oEffectiveFilters));
                    aDetailRows = this._buildDetailRows(aFiltered, oBasisPoolIndex, oEffectiveFilters);
                    oSelected = aDetailRows[0] || this._emptyDetail();
                }

                oFilterOptions = this._buildFilterOptions(aEnriched, oEffectiveFilters);
                oModel.setProperty("/filters", oEffectiveFilters);
                oModel.setProperty("/cycleOptions", oFilterOptions.cycleOptions);
                oModel.setProperty("/senderCcgOptions", oFilterOptions.senderCcgOptions);
                oModel.setProperty("/receiverCcgOptions", oFilterOptions.receiverCcgOptions);
                oModel.setProperty("/senderCostCenterOptions", oFilterOptions.senderCostCenterOptions);
                oModel.setProperty("/receiverCostCenterOptions", oFilterOptions.receiverCostCenterOptions);
                oModel.setProperty("/segmentOptions", oFilterOptions.segmentOptions);
                oModel.setProperty("/skfOptions", oFilterOptions.skfOptions);
                oModel.setProperty("/detailRows", aDetailRows);
                oModel.setProperty("/selectedDetail", oSelected);
                oModel.setProperty("/skfSummaryRows", this._skfSummaryForDetail(oSelected));
                oModel.setProperty("/kpis", this._buildKpis(aFiltered, aDetailRows));
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

        _applyFilters: function (aRows, oFilters, mExclude) {
            var aSenderCcgIds = Flow.normalizeIdList(oFilters.senderCcgIds);
            var aReceiverCcgIds = Flow.normalizeIdList(oFilters.receiverCcgIds);

            mExclude = mExclude || {};
            return (aRows || []).filter(function (oRow) {
                if (!mExclude.cycle && oFilters.cycle && oRow._cycle !== oFilters.cycle) {
                    return false;
                }
                if (!mExclude.senderCcg && aSenderCcgIds.length && aSenderCcgIds.indexOf(oRow._senderCcgId) === -1) {
                    return false;
                }
                if (!mExclude.senderCcg && !aSenderCcgIds.length && oFilters.senderCcgId && oRow._senderCcgId !== oFilters.senderCcgId) {
                    return false;
                }
                if (!mExclude.receiverCcg && aReceiverCcgIds.length && aReceiverCcgIds.indexOf(oRow._receiverCcgId) === -1) {
                    return false;
                }
                if (!mExclude.receiverCcg && !aReceiverCcgIds.length && oFilters.receiverCcgId && oRow._receiverCcgId !== oFilters.receiverCcgId) {
                    return false;
                }
                if (!mExclude.senderKostl && oFilters.senderKostl && oRow._senderKostl !== oFilters.senderKostl) {
                    return false;
                }
                if (!mExclude.receiverKostl && oFilters.receiverKostl && oRow._receiverKostl !== oFilters.receiverKostl) {
                    return false;
                }
                if (!mExclude.segmNo && oFilters.segmNo && oRow._segmNo !== oFilters.segmNo) {
                    return false;
                }
                if (!mExclude.skfId && oFilters.skfId && oRow._skfId !== oFilters.skfId) {
                    return false;
                }
                if (!mExclude.belnr && oFilters.belnr && Flow.clean(Flow.getField(oRow, "Belnr")).indexOf(oFilters.belnr) === -1) {
                    return false;
                }
                return true;
            });
        },

        _normalizeFiltersWithAvailableOptions: function (aRows, oFilters) {
            var oEffectiveFilters = Object.assign({}, oFilters || {});
            var bChanged = true;
            var iPass = 0;
            var oOptions;
            var aFields;

            while (bChanged && iPass < 3) {
                bChanged = false;
                iPass += 1;
                oOptions = this._buildFilterOptions(aRows, oEffectiveFilters);
                aFields = [
                    { path: "cycle", options: oOptions.cycleOptions },
                    { path: "senderCcgId", options: oOptions.senderCcgOptions },
                    { path: "receiverCcgId", options: oOptions.receiverCcgOptions },
                    { path: "senderKostl", options: oOptions.senderCostCenterOptions },
                    { path: "receiverKostl", options: oOptions.receiverCostCenterOptions },
                    { path: "segmNo", options: oOptions.segmentOptions },
                    { path: "skfId", options: oOptions.skfOptions }
                ];

                aFields.some(function (oField) {
                    if (oEffectiveFilters[oField.path] && !this._hasOptionKey(oField.options, oEffectiveFilters[oField.path])) {
                        oEffectiveFilters[oField.path] = "";
                        bChanged = true;
                        return true;
                    }
                    return false;
                }.bind(this));
            }

            return oEffectiveFilters;
        },

        _buildFilterOptions: function (aRows, oFilters) {
            return {
                cycleOptions: this._fieldOptions(this._optionRows(aRows, oFilters, "cycle"), "_cycle", "_cycleText", "전체"),
                senderCcgOptions: Flow.createCcgOptions(this._optionRows(aRows, oFilters, "senderCcg"), "_senderCcgId", "_senderCcgText"),
                receiverCcgOptions: Flow.createCcgOptions(this._optionRows(aRows, oFilters, "receiverCcg"), "_receiverCcgId", "_receiverCcgText"),
                senderCostCenterOptions: this._costCenterOptions(this._optionRows(aRows, oFilters, "senderKostl"), "_senderKostl", "_senderKostlText"),
                receiverCostCenterOptions: this._costCenterOptions(this._optionRows(aRows, oFilters, "receiverKostl"), "_receiverKostl", "_receiverKostlText"),
                segmentOptions: this._fieldOptions(this._optionRows(aRows, oFilters, "segmNo"), "_segmNo", "_segmText", "전체"),
                skfOptions: this._fieldOptions(this._optionRows(aRows, oFilters, "skfId"), "_skfId", "_skfText", "전체")
            };
        },

        _optionRows: function (aRows, oFilters, sExcludedField) {
            var mExclude = {};

            mExclude[sExcludedField] = true;
            return this._applyFilters(aRows, oFilters, mExclude);
        },

        _hasOptionKey: function (aOptions, sKey) {
            return (aOptions || []).some(function (oOption) {
                return oOption.key === sKey;
            });
        },

        _fieldOptions: function (aRows, sKeyField, sTextField, sAllText) {
            var mSeen = {};
            var aOptions = [{
                key: "",
                text: sAllText || "전체"
            }];

            (aRows || []).forEach(function (oRow) {
                var sKey = Flow.clean(oRow[sKeyField]);
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

        _basisScopeRows: function (aRows, oFilters) {
            return this._applyFilters(aRows, oFilters, {
                receiverCcg: true,
                receiverKostl: true,
                segmNo: true,
                belnr: true
            });
        },

        _buildBasisPoolIndex: function (aRows) {
            var mPools = {};

            (aRows || []).forEach(function (oRow) {
                var fBasis = Flow.numberOrNull(Flow.getField(oRow, "BasisValue"));
                var sPoolKey = this._basisPoolKey(oRow);
                var sReceiverKey = this._basisReceiverKey(oRow);
                var sUnit = Flow.skfUnitText(Flow.getField(oRow, "SkfUnitTxt"));
                var oReceiver;

                if (!Flow.isBasisMatched(oRow) || fBasis === null || !sPoolKey || !sReceiverKey) {
                    return;
                }

                if (!mPools[sPoolKey]) {
                    mPools[sPoolKey] = {
                        key: sPoolKey,
                        skfId: oRow._skfId || Flow.clean(Flow.getField(oRow, "SkfId")),
                        skfText: oRow._skfText || Flow.textOrCode(Flow.getField(oRow, "SkfTxt"), Flow.getField(oRow, "SkfId")),
                        unit: sUnit,
                        receivers: {}
                    };
                }

                oReceiver = mPools[sPoolKey].receivers[sReceiverKey];
                if (!oReceiver) {
                    mPools[sPoolKey].receivers[sReceiverKey] = {
                        receiverKostl: sReceiverKey,
                        receiverText: this._basisReceiverText(oRow, sReceiverKey),
                        basisValue: fBasis
                    };
                } else if (Math.abs(fBasis) > Math.abs(oReceiver.basisValue || 0)) {
                    oReceiver.basisValue = fBasis;
                }
            }.bind(this));

            Object.keys(mPools).forEach(function (sPoolKey) {
                var oPool = mPools[sPoolKey];
                var aReceivers = Object.keys(oPool.receivers).map(function (sReceiverKey) {
                    return oPool.receivers[sReceiverKey];
                });

                oPool.totalBasis = aReceivers.reduce(function (fSum, oReceiver) {
                    return fSum + Flow.toNumber(oReceiver.basisValue);
                }, 0);
                oPool.summaryRows = this._balanceRatioTexts(aReceivers.map(function (oReceiver) {
                    var fRatio = oPool.totalBasis ? Flow.toNumber(oReceiver.basisValue) / oPool.totalBasis * 100 : null;
                    var sBasisValueText = Flow.amountText(oReceiver.basisValue, oPool.unit);

                    return Object.assign({}, oReceiver, {
                        skfId: oPool.skfId,
                        skfText: oPool.skfText,
                        unit: oPool.unit,
                        basisValueText: sBasisValueText,
                        basisRatio: fRatio,
                        basisRatioText: fRatio === null ? "-" : Flow.rateText(fRatio),
                        ratioText: fRatio === null ? "-" : Flow.rateText(fRatio)
                    });
                })).sort(function (oFirst, oSecond) {
                    return Math.abs(oSecond.basisValue || 0) - Math.abs(oFirst.basisValue || 0) ||
                        Flow.clean(oFirst.receiverText).localeCompare(Flow.clean(oSecond.receiverText), "ko");
                });
            }.bind(this));

            return mPools;
        },

        _balanceRatioTexts: function (aRows) {
            var aValidRows = (aRows || []).filter(function (oRow) {
                return oRow.basisRatio !== null && oRow.basisRatio !== undefined;
            });
            var aRounded;
            var iDiff;
            var iDirection;
            var aOrder;
            var iIndex = 0;

            if (!aValidRows.length) {
                return aRows || [];
            }

            aRounded = aValidRows.map(function (oRow, iRowIndex) {
                var fTenths = Flow.toNumber(oRow.basisRatio) * 10;
                var iRounded = Math.round(fTenths);

                return {
                    row: oRow,
                    index: iRowIndex,
                    tenths: fTenths,
                    rounded: iRounded,
                    remainder: fTenths - Math.floor(fTenths)
                };
            });

            iDiff = 1000 - aRounded.reduce(function (iSum, oItem) {
                return iSum + oItem.rounded;
            }, 0);
            iDirection = iDiff >= 0 ? 1 : -1;
            aOrder = aRounded.slice().sort(function (oFirst, oSecond) {
                return iDirection > 0 ?
                    oSecond.remainder - oFirst.remainder || oFirst.index - oSecond.index :
                    oFirst.remainder - oSecond.remainder || oFirst.index - oSecond.index;
            });

            while (iDiff !== 0 && aOrder.length) {
                aOrder[iIndex % aOrder.length].rounded += iDirection;
                iDiff -= iDirection;
                iIndex += 1;
            }

            aRounded.forEach(function (oItem) {
                var sRatioText = Flow.rateText(oItem.rounded / 10);

                oItem.row.basisRatioText = sRatioText;
                oItem.row.ratioText = sRatioText;
            });

            return aRows || [];
        },

        _basisPoolKey: function (oRow) {
            return [
                oRow._cycle || Flow.clean(Flow.getField(oRow, "Cycle")),
                oRow._skfId || Flow.clean(Flow.getField(oRow, "SkfId")),
                oRow._senderKostl || Flow.normalize(Flow.getField(oRow, "SenderKostl"))
            ].map(Flow.clean).join("|");
        },

        _basisReceiverKey: function (oRow) {
            return oRow._receiverKostl || Flow.normalize(Flow.getField(oRow, "ReceiverKostl"));
        },

        _basisReceiverText: function (oRow, sReceiverKey) {
            return oRow._receiverKostlText || Flow.textOrCode(Flow.getField(oRow, "ReceiverKostlTxt"), sReceiverKey);
        },

        _basisPoolRowsForRow: function (oRow, oBasisPoolIndex) {
            var oPool = oBasisPoolIndex && oBasisPoolIndex[this._basisPoolKey(oRow)];

            return oPool && oPool.summaryRows || [];
        },

        _basisRatioForRow: function (oRow, oBasisPoolIndex) {
            var oPool = oBasisPoolIndex && oBasisPoolIndex[this._basisPoolKey(oRow)];
            var sReceiverKey = this._basisReceiverKey(oRow);
            var oReceiver = oPool && oPool.summaryRows && oPool.summaryRows.find(function (oCandidate) {
                return oCandidate.receiverKostl === sReceiverKey;
            });

            if (oReceiver && oReceiver.basisRatio !== null && oReceiver.basisRatio !== undefined) {
                return oReceiver.basisRatio;
            }

            return Flow.numberOrNull(Flow.getField(oRow, "BasisRatio"));
        },

        _basisRatioTextForRow: function (oRow, oBasisPoolIndex) {
            var fRatio;
            var oPool = oBasisPoolIndex && oBasisPoolIndex[this._basisPoolKey(oRow)];
            var sReceiverKey = this._basisReceiverKey(oRow);
            var oReceiver = oPool && oPool.summaryRows && oPool.summaryRows.find(function (oCandidate) {
                return oCandidate.receiverKostl === sReceiverKey;
            });

            if (!Flow.isBasisMatched(oRow)) {
                return "-";
            }

            if (oReceiver && oReceiver.basisRatioText) {
                return oReceiver.basisRatioText;
            }

            fRatio = this._basisRatioForRow(oRow, oBasisPoolIndex);
            return fRatio === null || fRatio === undefined ? "-" : Flow.rateText(fRatio);
        },

        _flowDirectionInfo: function (oRow, oFilters) {
            var sSenderFilter = Flow.normalize(oFilters && oFilters.senderKostl);
            var sReceiverFilter = Flow.normalize(oFilters && oFilters.receiverKostl);
            var sSender = oRow._senderKostl || Flow.normalize(Flow.getField(oRow, "SenderKostl"));
            var sReceiver = oRow._receiverKostl || Flow.normalize(Flow.getField(oRow, "ReceiverKostl"));
            var bSenderMatch = !!sSenderFilter && sSender === sSenderFilter;
            var bReceiverMatch = !!sReceiverFilter && sReceiver === sReceiverFilter;

            if (bReceiverMatch && bSenderMatch && sSender === sReceiver) {
                return {
                    text: "내부",
                    state: "Warning"
                };
            }
            if (bReceiverMatch) {
                return {
                    text: "수신",
                    state: "Information"
                };
            }
            if (bSenderMatch) {
                return {
                    text: "송신",
                    state: "Error"
                };
            }

            return {
                text: "-",
                state: "None"
            };
        },

        _buildDetailRows: function (aRows, oBasisPoolIndex, oFilters) {
            return (aRows || []).map(function (oRow) {
                var sBelnr = Flow.clean(Flow.getField(oRow, "Belnr"));
                var sDocln = Flow.clean(Flow.getField(oRow, "Docln"));
                var sSaknr = Flow.clean(Flow.getField(oRow, "Saknr"));
                var oDocumentStatus = this._documentStatusInfo(oRow);
                var fBasisValue = Flow.numberOrNull(Flow.getField(oRow, "BasisValue"));
                var fBasisRatio = this._basisRatioForRow(oRow, oBasisPoolIndex);
                var aBasisPoolRows = this._basisPoolRowsForRow(oRow, oBasisPoolIndex);
                var oDirection = this._flowDirectionInfo(oRow, oFilters);

                return {
                    raw: oRow,
                    rowKey: [sBelnr, sDocln, oRow._rowKey].join("|"),
                    senderCcgText: oRow._senderCcgText,
                    senderKostl: oRow._senderKostl,
                    senderText: oRow._senderKostlText,
                    receiverCcgText: oRow._receiverCcgText,
                    receiverKostl: oRow._receiverKostl,
                    receiverText: oRow._receiverKostlText,
                    directionText: oDirection.text,
                    directionState: oDirection.state,
                    receiverPrctrText: Flow.textOrCode(Flow.getField(oRow, "ReceiverPrctrTxt"), Flow.getField(oRow, "ReceiverPrctr")),
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    segmentText: oRow._segmText,
                    segmNo: oRow._segmNo,
                    skfId: oRow._skfId,
                    skfText: oRow._skfText,
                    skfUnit: Flow.skfUnitText(Flow.getField(oRow, "SkfUnitTxt")),
                    basisValue: fBasisValue,
                    basisRatio: fBasisRatio,
                    basisValueText: Flow.basisValueText(oRow),
                    basisRatioText: this._basisRatioTextForRow(oRow, oBasisPoolIndex),
                    amount: oRow._amount,
                    amountText: Flow.amountText(oRow._amount, oRow._waers),
                    belnr: sBelnr || "-",
                    docln: sDocln || "-",
                    budat: oRow._budat,
                    budatText: Flow.formatDate(oRow._budat),
                    saknr: sSaknr,
                    saknrText: Flow.textOrCode(Flow.getField(oRow, "SaknrTxt"), sSaknr),
                    accountRoleText: oRow._accountRoleText,
                    accountRoleDetail: oRow._accountRoleDetail,
                    waers: oRow._waers,
                    ruleStatusText: Flow.isBasisMatched(oRow) ? "규칙 매칭 완료" : "배부기준값을 찾을 수 없습니다.",
                    ruleState: Flow.isBasisMatched(oRow) ? "Success" : "Warning",
                    cyclePeriodText: [Flow.formatDate(Flow.getField(oRow, "CycleStartDate")), Flow.formatDate(Flow.getField(oRow, "CycleEndDate"))].join(" ~ "),
                    createdBy: Flow.textOrCode(Flow.getField(oRow, "CreatedBy"), ""),
                    createdAt: Flow.textOrCode(Flow.getField(oRow, "CreatedAt"), ""),
                    documentStatusText: oDocumentStatus.title,
                    documentStatusTitle: oDocumentStatus.title,
                    documentStatusDetailText: oDocumentStatus.detailText,
                    documentStatusCodeText: oDocumentStatus.codeText,
                    documentStatusRawText: oDocumentStatus.rawText,
                    documentStatusState: oDocumentStatus.state,
                    documentStatusIcon: oDocumentStatus.icon,
                    documentStatusTooltip: oDocumentStatus.tooltip,
                    _basisPoolRows: aBasisPoolRows,
                    _basisPoolKey: this._basisPoolKey(oRow),
                    _sortBudat: oRow._budat,
                    _sortDocln: Number(sDocln || 0)
                };
            }.bind(this)).sort(function (oFirst, oSecond) {
                return Flow.clean(oSecond._sortBudat).localeCompare(Flow.clean(oFirst._sortBudat)) ||
                    Flow.clean(oSecond.belnr).localeCompare(Flow.clean(oFirst.belnr)) ||
                    oFirst._sortDocln - oSecond._sortDocln ||
                    Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0);
            });
        },

        _documentStatusInfo: function (oRow) {
            var sCode = Flow.clean(Flow.getField(oRow, "Bstat")).toUpperCase();
            var sRawText = Flow.clean(Flow.getField(oRow, "BstatTxt"));
            var sNormalizedText = sRawText.replace(/\s/g, "");
            var mCodeInfo = {
                N: { title: "정상", state: "Success", icon: "sap-icon://message-success", detailText: "BSTAT N: 정상 전표입니다." },
                P: { title: "임시저장", state: "Warning", icon: "sap-icon://message-warning", detailText: "BSTAT P: 임시저장 상태의 전표입니다." },
                C: { title: "반제", state: "Information", icon: "sap-icon://message-information", detailText: "BSTAT C: 반제 처리된 전표입니다." },
                R: { title: "역분개", state: "Error", icon: "sap-icon://message-error", detailText: "BSTAT R: 역분개 전표입니다." }
            };
            var oInfo;

            if (mCodeInfo[sCode]) {
                oInfo = mCodeInfo[sCode];
            } else if (sNormalizedText.indexOf("상태확인") > -1) {
                oInfo = {
                    title: "상태 확인 필요",
                    state: "Warning",
                    icon: "sap-icon://message-warning",
                    detailText: "원천 상태 문구가 '상태확인'으로 내려왔습니다. 전표 헤더의 최종 전기/취소 상태를 추가 확인해야 합니다."
                };
            } else if (sNormalizedText.indexOf("취소") > -1 || sNormalizedText.indexOf("오류") > -1 || sNormalizedText.indexOf("삭제") > -1) {
                oInfo = {
                    title: sRawText,
                    state: "Error",
                    icon: "sap-icon://message-error",
                    detailText: "원천 상태 문구상 취소/오류/삭제 성격의 전표로 표시됩니다."
                };
            } else if (sNormalizedText.indexOf("정상") > -1 || sNormalizedText.indexOf("전기완료") > -1 || sNormalizedText.indexOf("완료") > -1) {
                oInfo = {
                    title: sRawText,
                    state: "Success",
                    icon: "sap-icon://message-success",
                    detailText: "원천 상태 문구상 정상 처리 또는 전기 완료된 전표로 표시됩니다."
                };
            } else if (sRawText) {
                oInfo = {
                    title: sRawText,
                    state: "None",
                    icon: "sap-icon://status-inactive",
                    detailText: "원천 상태 문구를 그대로 표시합니다. BSTAT 코드가 있으면 상태 코드도 함께 확인하세요."
                };
            } else {
                oInfo = {
                    title: "상태 정보 없음",
                    state: "Warning",
                    icon: "sap-icon://message-warning",
                    detailText: "원천 데이터에 전표 상태 코드 또는 상태 문구가 없어 상세 상태를 판단할 수 없습니다."
                };
            }

            return Object.assign({}, oInfo, {
                codeText: sCode || "코드 없음",
                rawText: sRawText || "-",
                tooltip: [
                    oInfo.title,
                    "BSTAT: " + (sCode || "코드 없음"),
                    "원천 상태: " + (sRawText || "-"),
                    oInfo.detailText
                ].join("\n")
            });
        },

        _buildKpis: function (aRows, aDetailRows) {
            var fTotal = (aRows || []).reduce(function (fSum, oRow) {
                return fSum + oRow._amount;
            }, 0);
            var mDocHeaders = {};
            var mDocLines = {};
            var aBasisGroups = this._buildBasisGroups(aDetailRows && aDetailRows.length ? aDetailRows : aRows);

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
                this._createDetailKpi("수신 비율", this._basisRatioText(aBasisGroups), "", "None", "sap-icon://pie-chart", this._basisRatioLines(aBasisGroups)),
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
                var fBasis = Flow.numberOrNull(oRow.basisValue !== undefined ? oRow.basisValue : Flow.getField(oRow, "BasisValue"));
                var fRatio = Flow.numberOrNull(oRow.basisRatio !== undefined ? oRow.basisRatio : Flow.getField(oRow, "BasisRatio"));
                var sSkfText = Flow.clean(oRow.skfText || oRow._skfText) || Flow.textOrCode(Flow.getField(oRow, "SkfTxt"), Flow.getField(oRow, "SkfId"));
                var sUnit = Flow.clean(oRow.skfUnit) || Flow.skfUnitText(Flow.getField(oRow, "SkfUnitTxt"));
                var sKey = [sSkfText, sUnit].join("|");
                var sReceiverKey = oRow.receiverKostl || oRow._receiverKostl || Flow.normalize(Flow.getField(oRow, "ReceiverKostl")) || "UNKNOWN";
                var oMember;

                if ((oRow.basisValue === undefined && !Flow.isBasisMatched(oRow)) || fBasis === null || !sSkfText || sSkfText === "-") {
                    return;
                }

                if (!mGroups[sKey]) {
                    mGroups[sKey] = {
                        skfText: sSkfText,
                        unit: sUnit,
                        basisValue: 0,
                        basisMembers: {},
                        ratios: {}
                    };
                }

                oMember = mGroups[sKey].basisMembers[sReceiverKey];
                if (!oMember || Math.abs(fBasis) > Math.abs(oMember)) {
                    mGroups[sKey].basisMembers[sReceiverKey] = fBasis;
                }
                if (fRatio !== null) {
                    mGroups[sKey].ratios[fRatio.toFixed(1)] = fRatio;
                }
            });

            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                oGroup.basisValue = Object.keys(oGroup.basisMembers).reduce(function (fSum, sMemberKey) {
                    return fSum + Flow.toNumber(oGroup.basisMembers[sMemberKey]);
                }, 0);
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

        _skfSummaryForDetail: function (oDetail) {
            if (oDetail && oDetail._basisPoolRows && oDetail._basisPoolRows.length) {
                return oDetail._basisPoolRows;
            }
            if (oDetail && oDetail.raw) {
                return this._buildSkfSummary([oDetail.raw]);
            }
            return [];
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
                cyclePeriodText: "-",
                documentStatusText: "상태 정보 없음",
                documentStatusTitle: "상태 정보 없음",
                documentStatusDetailText: "선택된 전표가 없습니다.",
                documentStatusCodeText: "-",
                documentStatusRawText: "-",
                documentStatusState: "None",
                documentStatusIcon: "sap-icon://status-inactive",
                documentStatusTooltip: "선택된 전표가 없습니다."
            };
        }
    });
});
