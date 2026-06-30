sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "ZE4_CC_COST/util/AllocationFlow",
    "sap/m/MessageBox"
], function (BaseController, Flow, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.AllocationFlowLanding", {
        getModelName: function () {
            return "flow1";
        },

        buildExportReport: function () {
            var oModel = this.getView().getModel("flow1");
            var oSelected = oModel.getProperty("/selectedReceiver") || {};

            return {
                title: "[EverNiture-CO] CCG 수신처 분해",
                fileName: "AllocationFlowLanding",
                variant: "allocation",
                description: "선택 CCG로 유입되는 외부/내부 배부 흐름 Sankey와 수령처 요약 리포트",
                filters: this.exportFilterRows("flow1", [
                    { label: "선택 CCG", property: "selectedCcgId" },
                    { label: "송신 CCG", property: "senderCcgId" },
                    { label: "배부사이클", property: "cycle" },
                    { label: "배부기준", property: "skfId" }
                ]),
                summary: this.exportKpiRows("flow1").concat([
                    { label: "화면 설명", value: oModel.getProperty("/explanationText") },
                    { label: "선택 코스트센터", value: oSelected.receiverText },
                    { label: "외부 유입금액", value: this.exportAmount(oSelected.externalAmount) },
                    { label: "내부 재배부금액", value: this.exportAmount(oSelected.internalAmount) },
                    { label: "비중", value: oSelected.ratioText },
                    { label: "전표 건수", value: oSelected.documentCountText }
                ]),
                charts: [
                    {
                        title: "CCG 수신처 분해 Sankey",
                        sourceSectionTitle: "선택 CCG 내부 수령처 요약",
                        html: oModel.getProperty("/sankeyHtml"),
                        width: 1200,
                        height: 460,
                        wide: true
                    }
                ],
                sections: [
                    this.exportSection("선택 CCG 내부 수령처 요약", oModel.getProperty("/receiverRows"), [
                        { label: "최종 수령 코스트센터", property: "receiverText" },
                        { label: "외부 유입금액", value: function (oRow) { return this.exportAmount(oRow.externalAmount); }.bind(this) },
                        { label: "내부 재배부금액", value: function (oRow) { return this.exportAmount(oRow.internalAmount); }.bind(this) },
                        { label: "비중", property: "ratioText", type: "text", summary: false },
                        { label: "주요 세그먼트", property: "segmentText" },
                        { label: "전표 건수", property: "documentCountText" }
                    ])
                ]
            };
        },

        onInit: function () {
            var oModel = this.createViewModel({
                pageTitle: "[EverNiture-CO] CCG 수신처 분해",
                subtitle: "",
                context: {},
                filters: this._createFilters(this.createDefaultFilters()),
                cycleOptions: [],
                selectedCcgOptions: [],
                senderCcgOptions: [],
                skfOptions: [],
                kpis: [],
                receiverRows: [],
                sankeyHtml: "",
                hasFlowData: false,
                selectedReceiver: this._emptyReceiver(),
                explanationText: "좌측은 외부 CCG 그룹에서 선택 CCG로 유입된 금액 흐름입니다."
            });

            oModel.setSizeLimit(30000);
            this.getView().setModel(oModel, "flow1");
            this.getRouter().getRoute("allocationFlowLanding").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var oArgs = oEvent.getParameter("arguments") || {};
            var oContext = Flow.decodeContext(oArgs.context);

            this.getView().getModel("flow1").setProperty("/context", oContext);
            this._loadWithContext(oContext);
        },

        onSearch: function () {
            var oFilters = this._validateFilters();

            if (oFilters) {
                this._loadData(oFilters, this.getView().getModel("flow1").getProperty("/context") || {});
            }
        },

        onResetFilters: function () {
            var oContext = this.getView().getModel("flow1").getProperty("/context") || {};
            this._loadWithContext(oContext);
        },

        onGoAllocationFlowOverview: function () {
            this.getRouter().navTo("allocationFlowOverview");
        },

        onReceiverRowSelection: function (oEvent) {
            var oTable = oEvent.getSource();
            var iIndex = oTable.getSelectedIndex();
            var oContext = iIndex > -1 && oTable.getContextByIndex(iIndex);
            var oRow = oContext && oContext.getObject();

            if (!oRow) {
                return;
            }

            this.getView().getModel("flow1").setProperty("/selectedReceiver", oRow);
            this._navToDetail(oRow);
        },

        onOpenLevel2: function () {
            var oRow = this.getView().getModel("flow1").getProperty("/selectedReceiver");

            if (!oRow || !oRow.receiverKostl) {
                MessageBox.information("조회 조건에 해당하는 배부 데이터가 없습니다.");
                return;
            }

            this._navToDetail(oRow);
        },

        _loadWithContext: function (oContext) {
            var oModel = this.getView().getModel("flow1");

            oModel.setProperty("/busy", true);
            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("flow1");
                }.bind(this))
                .then(function (oDefaults) {
                    var oFilters = this._createFilters(Object.assign({}, oDefaults, oContext || {}, {
                        selectedCcgId: oContext.receiverCcgId || oContext.selectedCcgId || "",
                        selectedCcgIds: oContext.receiverCcgIds || oContext.selectedCcgIds || [],
                        selectedCcgText: oContext.receiverCcgText || "",
                        senderCcgId: oContext.senderCcgId || "",
                        senderCcgIds: oContext.senderCcgIds || [],
                        includeInternal: false
                    }));

                    oModel.setProperty("/filters", oFilters);
                    oModel.setProperty("/subtitle", this._subtitle(oContext));
                    return this._loadData(oFilters, oContext || {});
                }.bind(this))
                .catch(function () {
                    this.setWarning("flow1", "조회 조건에 해당하는 배부 데이터가 없습니다.");
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        _createFilters: function (oFilters) {
            var oBase = this.normalizeFilters(oFilters || {});

            return Object.assign({}, oBase, {
                cycle: Flow.clean(oFilters && oFilters.cycle),
                selectedCcgId: Flow.clean(oFilters && oFilters.selectedCcgId),
                selectedCcgIds: Flow.normalizeIdList(oFilters && oFilters.selectedCcgIds),
                selectedCcgText: Flow.clean(oFilters && oFilters.selectedCcgText),
                senderCcgId: Flow.clean(oFilters && oFilters.senderCcgId),
                senderCcgIds: Flow.normalizeIdList(oFilters && oFilters.senderCcgIds),
                skfId: Flow.clean(oFilters && oFilters.skfId),
                groupBasis: Flow.clean(oFilters && oFilters.groupBasis) || "DIRECT",
                viewMode: Flow.clean(oFilters && oFilters.viewMode) || "RECEIVER",
                includeInternal: !!(oFilters && oFilters.includeInternal)
            });
        },

        _validateFilters: function () {
            var oModel = this.getView().getModel("flow1");
            var oFilters = this._createFilters(oModel.getProperty("/filters") || {});
            var oStates = {
                gjahrState: "None",
                gjahrStateText: "",
                periodState: "None",
                periodStateText: "",
                selectedCcgState: "None",
                selectedCcgStateText: ""
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

            if (!oFilters.selectedCcgId && !oFilters.selectedCcgIds.length) {
                bValid = false;
                oStates.selectedCcgState = "Error";
                oStates.selectedCcgStateText = "선택 CCG는 필수입니다.";
            }

            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/filterStates", oStates);

            if (!bValid) {
                MessageBox.error("회계연도, 기간, 선택 CCG는 필수입니다.");
                return null;
            }

            return oFilters;
        },

        _loadData: function (oRawFilters, oContext) {
            var oModel = this.getView().getModel("flow1");
            var oFilters = this._createFilters(oRawFilters);
            var oReadFilters = Object.assign({}, oFilters, {
                cycle: "",
                senderKostl: "",
                receiverKostl: "",
                skfId: ""
            });

            oModel.setProperty("/busy", true);
            this.setWarning("flow1", "");

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
                var aCycleOptions = Flow.createOptions(aRows, "Cycle", "CycleText", "전체");
                var aSelectedOptions = Flow.createCcgOptions(aEnriched, "_receiverCcgId", "_receiverCcgText");

                if (!oFilters.selectedCcgId && oContext && oContext.receiverCcgId) {
                    oFilters.selectedCcgId = oContext.receiverCcgId;
                }

                if (!oFilters.selectedCcgId && !oFilters.selectedCcgIds.length && aSelectedOptions.length > 1) {
                    oFilters.selectedCcgId = aSelectedOptions[1].key;
                }

                oModel.setProperty("/filters", oFilters);
                oModel.setProperty("/cycleOptions", aCycleOptions);
                oModel.setProperty("/selectedCcgOptions", aSelectedOptions);
                oModel.setProperty("/senderCcgOptions", Flow.createCcgOptions(aEnriched, "_senderCcgId", "_senderCcgText"));
                oModel.setProperty("/skfOptions", Flow.createOptions(aRows, "SkfId", "SkfTxt", "전체"));

                this._buildPageModel(aEnriched, oFilters);
            }.bind(this)).catch(function () {
                this.setWarning("flow1", "조회 조건에 해당하는 배부 데이터가 없습니다.");
            }.bind(this)).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyFilters: function (aRows, oFilters, bIncludeInternalOverride) {
            var bIncludeInternal = bIncludeInternalOverride === true || oFilters.includeInternal;
            var aSelectedCcgIds = Flow.normalizeIdList(oFilters.selectedCcgIds);
            var aSenderCcgIds = Flow.normalizeIdList(oFilters.senderCcgIds);

            return (aRows || []).filter(function (oRow) {
                if (aSelectedCcgIds.length && aSelectedCcgIds.indexOf(oRow._receiverCcgId) === -1) {
                    return false;
                }
                if (!aSelectedCcgIds.length && oFilters.selectedCcgId && oRow._receiverCcgId !== oFilters.selectedCcgId) {
                    return false;
                }
                if (aSenderCcgIds.length && aSenderCcgIds.indexOf(oRow._senderCcgId) === -1) {
                    return false;
                }
                if (!aSenderCcgIds.length && oFilters.senderCcgId && oRow._senderCcgId !== oFilters.senderCcgId) {
                    return false;
                }
                if (oFilters.cycle && oRow._cycle !== oFilters.cycle) {
                    return false;
                }
                if (oFilters.skfId && oRow._skfId !== oFilters.skfId) {
                    return false;
                }
                if (!bIncludeInternal && oRow._senderCcgId === oRow._receiverCcgId) {
                    return false;
                }
                return true;
            });
        },

        _buildPageModel: function (aRows, oFilters) {
            var oModel = this.getView().getModel("flow1");
            var aExternalRows = this._applyFilters(aRows, oFilters, false);
            var aAllSelectedRows = this._applyFilters(aRows, oFilters, true);
            var oSankey = this._buildSankey(aAllSelectedRows, aExternalRows, oFilters);
            var aReceiverRows = this._buildReceiverRows(aAllSelectedRows, aExternalRows, oFilters);
            var oSelectedReceiver = aReceiverRows[0] || this._emptyReceiver();

            if (!aAllSelectedRows.length) {
                this.setWarning("flow1", "조회 조건에 해당하는 배부 데이터가 없습니다.");
            } else {
                this.setWarning("flow1", "");
            }

            oModel.setProperty("/kpis", this._buildKpis(aAllSelectedRows, aExternalRows, aReceiverRows));
            oModel.setProperty("/receiverRows", aReceiverRows);
            oModel.setProperty("/selectedReceiver", oSelectedReceiver);
            oModel.setProperty("/sankeyHtml", oSankey.html);
            oModel.setProperty("/hasFlowData", aAllSelectedRows.length > 0);
            oModel.setProperty("/pageTitle", this._pageTitle(aRows, oFilters));
            oModel.setProperty("/explanationText", aExternalRows.length ?
                "좌측은 외부 CCG 그룹에서 선택 CCG로 유입된 금액이며, 우측은 선택 CCG 내부 코스트센터로 재배부된 흐름입니다." :
                "외부 유입금액이 없는 조건입니다. 선택 CCG 내부 코스트센터 간 재배부 흐름을 표시합니다.");
            this._attachSankeyNavigation();
        },

        _buildKpis: function (aAllRows, aExternalRows, aReceiverRows) {
            var fExternalAmount = this._sum(aExternalRows);
            var fAllAmount = this._sum(aAllRows);
            var fInternalAmount = fAllAmount - fExternalAmount;
            var sInternalRatioDescription = "해당 코스트센터로 배부된 총 금액 중 내부에서 발생해 다시 배부된 금액의 비율입니다.";
            var sInternalRatioFormula = "계산식: 내부 재배부금액 / (외부 유입금액 + 내부 재배부금액)";
            var mSenders = {};
            var mReceivers = {};
            var oMaxReceiver = aReceiverRows[0] || {};

            (aExternalRows || []).forEach(function (oRow) {
                mSenders[oRow._senderCcgId] = true;
            });

            (aAllRows || []).forEach(function (oRow) {
                mReceivers[oRow._receiverKostl] = true;
            });

            return [
                this.createKpi("선택 CCG 총 수신금액", Flow.amountText(fAllAmount, "KRW"), "", "None", "sap-icon://wallet"),
                this.createKpi("외부 유입 CCG 수", Object.keys(mSenders).length + " 개", "", "None", "sap-icon://group"),
                this.createKpi("내부 수령 코스트센터 수", Object.keys(mReceivers).length + " 개", "", "None", "sap-icon://building"),
                Object.assign(this.createKpi("내부 재배부율", fAllAmount ? Flow.rateText(fInternalAmount / fAllAmount * 100) : "-", sInternalRatioDescription, "None", "sap-icon://pie-chart"), {
                    formulaText: sInternalRatioFormula
                }),
                this.createKpi("최대 최종 수령처", oMaxReceiver.receiverText || "-", Flow.amountText((oMaxReceiver.externalAmount || 0) + (oMaxReceiver.internalAmount || 0), "KRW"), "None", "sap-icon://competitor")
            ];
        },

        _buildSankey: function (aRows, aExternalRows, oFilters) {
            var mExternal = {};
            var mCenter = {};
            var mInternalSenders = {};
            var mInternalSenderCostCenters = {};
            var mRight = {};
            var mExternalLinks = {};
            var mExternalReceiverLinks = {};
            var mInternalSenderLinks = {};
            var mRightLinks = {};
            var sCenterId = "C:" + oFilters.selectedCcgId;
            var sSelectedText = this._selectedCcgText(aRows, oFilters.selectedCcgId, oFilters);
            var aExternalNodes;
            var aCenterNodes;
            var aInternalSenderNodes;
            var aRightNodes;
            var aColumns;
            var aLinks;

            mCenter[sCenterId] = {
                id: sCenterId,
                text: sSelectedText,
                amount: this._sum(aRows),
                color: "#0A6ED1",
                href: this._detailHash(oFilters, {
                    receiverCcgId: oFilters.selectedCcgId,
                    receiverCcgText: sSelectedText
                })
            };

            (aRows || []).forEach(function (oRow) {
                var sSenderKostl = Flow.clean(oRow._senderKostl);

                if (oRow._senderCcgId === oRow._receiverCcgId && sSenderKostl) {
                    mInternalSenderCostCenters[sSenderKostl] = true;
                }
            });

            (aRows || []).forEach(function (oRow) {
                var bInternal = oRow._senderCcgId === oRow._receiverCcgId;
                var sExternalCcgId = oRow._senderCcgId || Flow.GROUP_UNASSIGNED;
                var sInternalSenderId = Flow.clean(oRow._senderKostl) || Flow.GROUP_UNASSIGNED;
                var sReceiverKostl = Flow.clean(oRow._receiverKostl) || Flow.GROUP_UNASSIGNED;
                var sExternalText = oRow._senderCcgText || "그룹 미지정";
                var sInternalSenderText = oRow._senderKostlText || "코스트센터 미지정";
                var sRightText = oRow._receiverKostlText || "코스트센터 미지정";
                var sExternalId = "E:" + sExternalCcgId;
                var sInternalSenderNodeId = "K:" + sInternalSenderId;
                var sRightId = "R:" + sReceiverKostl;
                var sCollapsedReceiverId = "K:" + sReceiverKostl;
                var bCollapseExternalReceiver = !bInternal && !!mInternalSenderCostCenters[sReceiverKostl];
                var sExternalKey = sExternalId + "|" + sCenterId + "|" + oRow._cycle;
                var sExternalReceiverKey = sCenterId + "|" + (bCollapseExternalReceiver ? sCollapsedReceiverId : sRightId) + "|" + oRow._cycle;
                var sInternalSenderKey = sCenterId + "|" + sInternalSenderNodeId + "|" + oRow._cycle;
                var sRightKey = sInternalSenderNodeId + "|" + sRightId + "|" + oRow._cycle;
                var sExternalHash = "";
                var sReceiverHash = this._detailHash(oFilters, {
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    receiverCcgId: oRow._receiverCcgId,
                    receiverCcgText: oRow._receiverCcgText,
                    receiverKostl: oRow._receiverKostl,
                    receiverKostlText: oRow._receiverKostlText
                });
                var sSenderHash = this._detailHash(oFilters, {
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    receiverCcgId: oRow._receiverCcgId,
                    receiverCcgText: oRow._receiverCcgText,
                    senderKostl: oRow._senderKostl,
                    senderKostlText: oRow._senderKostlText
                });

                if (bInternal) {
                    this._addNode(mRight, sRightId, sRightText, oRow._cycle, oRow._amount, sReceiverHash, oRow._cycleText);
                    this._addNode(mInternalSenders, sInternalSenderNodeId, sInternalSenderText, oRow._cycle, oRow._amount, sSenderHash, oRow._cycleText);
                    this._addLink(mInternalSenderLinks, sInternalSenderKey, sCenterId, sInternalSenderNodeId, oRow, sSenderHash);
                    this._addLink(mRightLinks, sRightKey, sInternalSenderNodeId, sRightId, oRow, sReceiverHash);
                    return;
                }

                sExternalHash = this._detailHash(oFilters, {
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    senderCcgId: oRow._senderCcgId,
                    senderCcgText: oRow._senderCcgText,
                    receiverCcgId: oRow._receiverCcgId,
                    receiverCcgText: oRow._receiverCcgText
                });
                this._addNode(mExternal, sExternalId, sExternalText, oRow._cycle, oRow._amount, sExternalHash, oRow._cycleText);
                this._addLink(mExternalLinks, sExternalKey, sExternalId, sCenterId, oRow, sExternalHash);
                if (bCollapseExternalReceiver) {
                    this._addNode(mInternalSenders, sCollapsedReceiverId, sRightText, oRow._cycle, oRow._amount, "", oRow._cycleText);
                    this._addLink(mExternalReceiverLinks, sExternalReceiverKey, sCenterId, sCollapsedReceiverId, oRow, sReceiverHash);
                } else {
                    this._addNode(mRight, sRightId, sRightText, oRow._cycle, oRow._amount, sReceiverHash, oRow._cycleText);
                    this._addLink(mExternalReceiverLinks, sExternalReceiverKey, sCenterId, sRightId, oRow, sReceiverHash);
                }
            }.bind(this));

            aExternalNodes = this._nodes(mExternal);
            aCenterNodes = this._nodes(mCenter);
            aInternalSenderNodes = this._nodes(mInternalSenders);
            aRightNodes = this._nodes(mRight);

            if (aExternalNodes.length && aInternalSenderNodes.length) {
                aColumns = [
                    { title: "외부 송신 CCG 그룹", nodes: aExternalNodes },
                    { title: "선택 CCG", nodes: aCenterNodes, centerCompact: true },
                    { title: "내부 송신 코스트센터", nodes: aInternalSenderNodes },
                    { title: "내부 수신 코스트센터", nodes: aRightNodes }
                ];
            } else if (aExternalNodes.length) {
                aColumns = [
                    { title: "외부 송신 CCG 그룹", nodes: aExternalNodes },
                    { title: "선택 CCG", nodes: aCenterNodes, centerCompact: true },
                    { title: "내부 수신 코스트센터", nodes: aRightNodes }
                ];
            } else {
                aColumns = [
                    { title: "선택 CCG", nodes: aCenterNodes, centerCompact: true },
                    { title: "내부 송신 코스트센터", nodes: aInternalSenderNodes },
                    { title: "내부 수신 코스트센터", nodes: aRightNodes }
                ];
            }
            aLinks = this._links(mExternalLinks)
                .concat(this._links(mExternalReceiverLinks))
                .concat(this._links(mInternalSenderLinks))
                .concat(this._links(mRightLinks));

            return {
                html: aRows.length ? Flow.renderFlowSvg({
                    columns: aColumns,
                    links: aLinks,
                    minWidth: aColumns.length === 4 ? 1980 : 1620,
                    minHeight: 560,
                    nodeWidth: 330,
                    nodeHeight: 46,
                    maxLinkWidth: 26,
                    titleLength: 22,
                    amountLength: 14
                }) : ""
            };
        },

        _buildReceiverRows: function (aAllRows, aExternalRows, oFilters) {
            var mRows = {};
            var fTotal = this._sum(aAllRows);

            function ensure(oRow) {
                var sKey = oRow._receiverKostl;

                if (!mRows[sKey]) {
                    mRows[sKey] = {
                        receiverKostl: sKey,
                        receiverText: oRow._receiverKostlText,
                        receiverCcgId: oRow._receiverCcgId,
                        receiverCcgText: oRow._receiverCcgText,
                        senderCcgId: oFilters.senderCcgId,
                        cycle: oFilters.cycle,
                        skfId: oFilters.skfId,
                        groupBasis: oFilters.groupBasis,
                        gjahr: oFilters.gjahr,
                        period: oFilters.period,
                        externalAmount: 0,
                        internalAmount: 0,
                        docs: {},
                        segments: {}
                    };
                }
                return mRows[sKey];
            }

            (aAllRows || []).forEach(function (oRow) {
                var oTarget = ensure(oRow);

                if (oRow._senderCcgId === oRow._receiverCcgId) {
                    oTarget.internalAmount += oRow._amount;
                } else {
                    oTarget.externalAmount += oRow._amount;
                }
                if (oRow._documentKey && oRow._documentKey !== "||") {
                    oTarget.docs[oRow._documentKey] = true;
                }
                if (oRow._segmText) {
                    oTarget.segments[oRow._segmText] = (oTarget.segments[oRow._segmText] || 0) + Math.abs(oRow._amount);
                }
            });

            return Object.keys(mRows).map(function (sKey) {
                var oRow = mRows[sKey];
                var aSegments = Object.keys(oRow.segments).sort(function (sFirst, sSecond) {
                    return oRow.segments[sSecond] - oRow.segments[sFirst];
                });
                oRow.ratio = fTotal ? (oRow.externalAmount + oRow.internalAmount) / fTotal * 100 : null;
                oRow.ratioText = oRow.ratio === null ? "-" : Flow.rateText(oRow.ratio);
                oRow.segmentText = aSegments[0] || "-";
                oRow.documentCountText = Object.keys(oRow.docs).length + " 건";
                return oRow;
            }).sort(function (oFirst, oSecond) {
                return Math.abs((oSecond.externalAmount || 0) + (oSecond.internalAmount || 0)) -
                    Math.abs((oFirst.externalAmount || 0) + (oFirst.internalAmount || 0)) ||
                    Flow.clean(oFirst.receiverText).localeCompare(Flow.clean(oSecond.receiverText), "ko");
            });
        },

        _addNode: function (mNodes, sId, sText, sColorKey, fAmount, sHref, sColorText) {
            if (!mNodes[sId]) {
                mNodes[sId] = {
                    id: sId,
                    text: sText,
                    color: Flow.colorForStepText(sColorText, sColorKey || sId),
                    amount: 0,
                    href: sHref
                };
            }
            if (mNodes[sId] && !mNodes[sId].href && sHref) {
                mNodes[sId].href = sHref;
            }
            mNodes[sId].amount += fAmount;
        },

        _addLink: function (mLinks, sKey, sFrom, sTo, oRow, sHref) {
            if (!mLinks[sKey]) {
                mLinks[sKey] = {
                    key: sKey,
                    from: sFrom,
                    to: sTo,
                    color: Flow.colorForStepText(oRow._cycleText, oRow._cycle),
                    colorKey: oRow._cycle,
                    amount: 0,
                    currency: oRow._waers,
                    href: sHref
                };
            }
            mLinks[sKey].amount += oRow._amount;
        },

        _nodes: function (mNodes) {
            return Object.keys(mNodes).map(function (sKey) {
                var oNode = mNodes[sKey];
                return Object.assign({}, oNode, {
                    subText: Flow.compactAmountText(oNode.amount) + " KRW"
                });
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0);
            });
        },

        _links: function (mLinks) {
            return Object.keys(mLinks).map(function (sKey) {
                var oLink = mLinks[sKey];
                return Object.assign({}, oLink, {
                    title: Flow.amountText(oLink.amount, oLink.currency || "KRW")
                });
            });
        },

        _selectedCcgText: function (aRows, sCcgId, oFilters) {
            var sSelectedText = Flow.clean(oFilters && oFilters.selectedCcgText);
            var oRow = (aRows || []).find(function (oCandidate) {
                return oCandidate._receiverCcgId === sCcgId;
            });

            if (sSelectedText) {
                return sSelectedText;
            }

            return oRow && oRow._receiverCcgText || "그룹 미지정";
        },

        _pageTitle: function (aRows, oFilters) {
            var sCcgText = Flow.clean(oFilters && oFilters.selectedCcgText) ||
                this._selectedCcgText(aRows, oFilters && oFilters.selectedCcgId, oFilters);

            if (!sCcgText || sCcgText === "그룹 미지정") {
                return "[EverNiture-CO] CCG 수신처 분해";
            }

            return "[EverNiture-CO] " + sCcgText + " 수신처 분해";
        },

        _detailHash: function (oFilters, oContext) {
            return this._hash("allocation-flow/detail", Object.assign({
                gjahr: oFilters.gjahr,
                period: oFilters.period,
                cycle: oFilters.cycle || "",
                cycleText: "",
                senderCcgId: oFilters.senderCcgId || "",
                senderCcgIds: oFilters.senderCcgIds || [],
                senderCcgText: "",
                receiverCcgId: oFilters.selectedCcgId || "",
                receiverCcgIds: oFilters.selectedCcgIds || [],
                receiverCcgText: "",
                receiverKostl: "",
                receiverKostlText: "",
                senderKostl: "",
                senderKostlText: "",
                skfId: oFilters.skfId,
                groupBasis: oFilters.groupBasis
            }, oContext || {}));
        },

        _navToDetail: function (oRow) {
            this.getRouter().navTo("allocationFlowDetail", {
                context: Flow.encodeContext({
                    gjahr: oRow.gjahr,
                    period: oRow.period,
                    cycle: oRow.cycle,
                    senderCcgId: oRow.senderCcgId,
                    receiverCcgId: oRow.receiverCcgId,
                    receiverCcgText: oRow.receiverCcgText,
                    receiverKostl: oRow.receiverKostl,
                    receiverKostlText: oRow.receiverText,
                    skfId: oRow.skfId,
                    groupBasis: oRow.groupBasis
                })
            });
        },

        _subtitle: function (oContext) {
            if (oContext && oContext.receiverCcgText) {
                return "CCG 그룹 단위로 집계된 수신 금액이 실제 내부 코스트센터 어디로 흘렀는지 확인합니다.";
            }

            return "";
        },

        _emptyReceiver: function () {
            return {
                receiverKostl: "",
                receiverText: "-",
                externalAmount: 0,
                internalAmount: 0,
                ratioText: "-",
                segmentText: "-",
                documentCountText: "-"
            };
        },

        _sum: function (aRows) {
            return (aRows || []).reduce(function (fTotal, oRow) {
                return fTotal + Flow.toNumber(oRow._amount);
            }, 0);
        },

        _attachSankeyNavigation: function () {
            var fnAttach = function () {
                var oDomRef = this.getView().getDomRef();

                if (!oDomRef) {
                    return;
                }

                Array.prototype.slice.call(oDomRef.querySelectorAll(".ze4SankeySvg")).forEach(function (oSvg) {
                    if (oSvg.getAttribute("data-flow-bound") === "true") {
                        return;
                    }

                    oSvg.setAttribute("data-flow-bound", "true");
                    oSvg.addEventListener("click", this._onSankeyNavigate.bind(this));
                }.bind(this));
            }.bind(this);

            setTimeout(fnAttach, 0);
            setTimeout(fnAttach, 150);
        },

        _onSankeyNavigate: function (oEvent) {
            var oTarget = oEvent.target && oEvent.target.closest && oEvent.target.closest(".ze4SankeyNav[data-flow-href]");
            var sHref = oTarget && oTarget.getAttribute("data-flow-href");

            if (!sHref) {
                return;
            }

            if (oEvent.preventDefault) {
                oEvent.preventDefault();
            }
            if (oEvent.stopPropagation) {
                oEvent.stopPropagation();
            }

            this._navigateFromSankeyHref(sHref);
        },

        _navigateFromSankeyHref: function (sHref) {
            var sValue = Flow.clean(sHref);
            var iLastSlash;
            var sPattern;
            var sContext;
            var mRoutes = {
                "allocation-flow/landing": "allocationFlowLanding",
                "allocation-flow/detail": "allocationFlowDetail"
            };

            if (sValue.indexOf("#/") === 0) {
                sValue = sValue.slice(2);
            }

            iLastSlash = sValue.lastIndexOf("/");
            if (iLastSlash < 0) {
                return;
            }

            sPattern = sValue.slice(0, iLastSlash);
            sContext = sValue.slice(iLastSlash + 1);

            if (mRoutes[sPattern]) {
                this.getRouter().navTo(mRoutes[sPattern], {
                    context: sContext
                });
            }
        },

        _topIds: function (aRows, sFieldName, iLimit) {
            var mAmounts = {};
            var mResult = {};

            (aRows || []).forEach(function (oRow) {
                var sId = Flow.clean(oRow[sFieldName]);
                if (sId) {
                    mAmounts[sId] = (mAmounts[sId] || 0) + Math.abs(oRow._amount || 0);
                }
            });

            Object.keys(mAmounts).sort(function (sFirst, sSecond) {
                return mAmounts[sSecond] - mAmounts[sFirst] || sFirst.localeCompare(sSecond);
            }).slice(0, iLimit || 8).forEach(function (sId) {
                mResult[sId] = true;
            });

            return mResult;
        },

        _hash: function (sRoute, oContext) {
            return "#/" + sRoute + "/" + Flow.encodeContext(oContext);
        }
    });
});
