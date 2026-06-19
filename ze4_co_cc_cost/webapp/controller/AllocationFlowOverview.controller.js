sap.ui.define([
    "ZE4_CC_COST/controller/BaseController",
    "ZE4_CC_COST/util/AllocationFlow",
    "sap/m/MessageBox"
], function (BaseController, Flow, MessageBox) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.AllocationFlowOverview", {
        getModelName: function () {
            return "flow0";
        },

        onInit: function () {
            var oModel = this.createViewModel({
                pageTitle: "[EverNiture-CO] 부서간 배부/정산 분석",
                activeMenu: "allocationFlowOverview",
                filters: this._createFilters(this.createDefaultFilters()),
                cycleOptions: [],
                senderCcgOptions: [],
                receiverCcgOptions: [],
                skfOptions: [],
                groupBasisOptions: [
                    { key: "DIRECT", text: "직접 상위 그룹" },
                    { key: "HQ", text: "본부 그룹" },
                    { key: "DIVISION", text: "부문 그룹" }
                ],
                kpis: [],
                selectedFlow: this._emptySelectedFlow(),
                groupSummaryRows: [],
                groupSummaryVisibleRowCount: 7,
                sankeySelections: {},
                cycleLegend: [],
                sankeyHtml: "",
                hasFlowData: false
            });

            oModel.setSizeLimit(30000);
            this.getView().setModel(oModel, "flow0");
            this.getRouter().getRoute("allocationFlowOverview").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadWithDefaults();
        },

        onSearch: function () {
            var oFilters = this._validateFilters();

            if (oFilters) {
                this._loadData(oFilters);
            }
        },

        onResetFilters: function () {
            var oModel = this.getView().getModel("flow0");
            var oDefaults = this.getAppStateModel().getProperty("/defaults") || this.createDefaultFilters();
            var oFilters = this._createFilters(oDefaults);

            oModel.setProperty("/filters", oFilters);
            this._loadData(oFilters);
        },

        onGoAllocationFlowOverview: function () {
            this.getRouter().navTo("allocationFlowOverview");
        },

        onOpenLevel1: function () {
            var oSelection = this.getView().getModel("flow0").getProperty("/selectedFlow/context");
            var aReceiverCcgIds = Flow.normalizeIdList(oSelection && oSelection.receiverCcgIds);

            if (!oSelection || (!oSelection.receiverCcgId && !aReceiverCcgIds.length)) {
                MessageBox.information("조회 조건에 해당하는 배부 데이터가 없습니다.");
                return;
            }

            this.getRouter().navTo("allocationFlowLanding", {
                context: Flow.encodeContext(oSelection)
            });
        },

        _loadWithDefaults: function () {
            var oModel = this.getView().getModel("flow0");

            oModel.setProperty("/busy", true);
            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("flow0");
                }.bind(this))
                .then(function (oFilters) {
                    return this._loadData(this._createFilters(oFilters));
                }.bind(this))
                .catch(function () {
                    this.setWarning("flow0", "조회 조건에 해당하는 배부 데이터가 없습니다.");
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        _createFilters: function (oFilters) {
            var oBase = this.normalizeFilters(oFilters || {});
            var sGroupBasis = Flow.clean(oFilters && oFilters.groupBasis);

            if (sGroupBasis === "UPPER") {
                sGroupBasis = "DIRECT";
            }

            return Object.assign({}, oBase, {
                cycle: Flow.clean(oFilters && oFilters.cycle),
                senderCcgId: Flow.clean(oFilters && oFilters.senderCcgId),
                receiverCcgId: Flow.clean(oFilters && oFilters.receiverCcgId),
                skfId: Flow.clean(oFilters && oFilters.skfId),
                groupBasis: sGroupBasis || "DIRECT"
            });
        },

        _validateFilters: function () {
            var oModel = this.getView().getModel("flow0");
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
            var oModel = this.getView().getModel("flow0");
            var oFilters = this._createFilters(oRawFilters);
            var oReadFilters = Object.assign({}, oFilters, {
                cycle: "",
                senderKostl: "",
                receiverKostl: "",
                skfId: ""
            });

            oModel.setProperty("/busy", true);
            this.setWarning("flow0", "");

            return Promise.all([
                this.service.readAllocationRuleRows().catch(function () {
                    return [];
                }),
                this.service.readAllocationResultRows(oReadFilters, true).catch(function () {
                    return [];
                }),
                this.service.readHierarchyRows().catch(function () {
                    return [];
                })
            ]).then(function (aResults) {
                var aRules = aResults[0] || [];
                var aRows = aResults[1] || [];
                var oHierarchyIndex = Flow.buildHierarchyIndex(aResults[2] || []);
                var aEnriched = Flow.enrichRows(aRows, oHierarchyIndex, oFilters.groupBasis);
                var aCycleOptions = this._buildCycleOptions(aRules, aRows);

                oModel.setProperty("/cycleOptions", aCycleOptions);
                oModel.setProperty("/skfOptions", Flow.createOptions(aRows, "SkfId", "SkfTxt", "전체"));
                oModel.setProperty("/senderCcgOptions", Flow.createCcgOptions(aEnriched, "_senderCcgId", "_senderCcgText"));
                oModel.setProperty("/receiverCcgOptions", Flow.createCcgOptions(aEnriched, "_receiverCcgId", "_receiverCcgText"));

                this._buildPageModel(aEnriched, oFilters);
            }.bind(this)).catch(function () {
                this.setWarning("flow0", "조회 조건에 해당하는 배부 데이터가 없습니다.");
            }.bind(this)).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _buildCycleOptions: function (aRules, aRows) {
            var mOptions = {};

            function add(oRow) {
                var sKey = Flow.clean(Flow.getField(oRow, "Cycle"));
                var sText = Flow.textOrCode(Flow.getField(oRow, "CycleText"), sKey);

                if (sKey) {
                    mOptions[sKey] = {
                        key: sKey,
                        text: sText
                    };
                }
            }

            (aRules || []).forEach(add);
            (aRows || []).forEach(add);

            return [{
                key: "",
                text: "전체"
            }].concat(Object.keys(mOptions).map(function (sKey) {
                return mOptions[sKey];
            }).sort(function (oFirst, oSecond) {
                return oFirst.text.localeCompare(oSecond.text, "ko");
            }));
        },

        _applyFilters: function (aRows, oFilters) {
            return (aRows || []).filter(function (oRow) {
                if (oFilters.cycle && oRow._cycle !== oFilters.cycle) {
                    return false;
                }
                if (oFilters.skfId && oRow._skfId !== oFilters.skfId) {
                    return false;
                }
                if (oFilters.senderCcgId && oRow._senderCcgId !== oFilters.senderCcgId) {
                    return false;
                }
                if (oFilters.receiverCcgId && oRow._receiverCcgId !== oFilters.receiverCcgId) {
                    return false;
                }
                return true;
            });
        },

        _buildPageModel: function (aEnrichedRows, oFilters) {
            var oModel = this.getView().getModel("flow0");
            var aRows = this._applyFilters(aEnrichedRows, oFilters);
            var oSankey = this._buildSankey(aRows, oFilters);
            var oSummary = this._buildGroupSummary(aRows);
            var oSelectedFlow = oSankey.selectedFlow || this._emptySelectedFlow();
            var sTotalDocumentCountText = Flow.distinctDocumentCount(aRows) + " 건";

            if (!aRows.length) {
                this.setWarning("flow0", "조회 조건에 해당하는 배부 데이터가 없습니다.");
            }

            oSelectedFlow.totalDocumentCountText = sTotalDocumentCountText;
            oModel.setProperty("/filters", oFilters);
            oModel.setProperty("/kpis", this._buildKpis(aRows, oSummary));
            oModel.setProperty("/selectedFlow", oSelectedFlow);
            oModel.setProperty("/groupSummaryRows", oSummary.rows);
            oModel.setProperty("/groupSummaryVisibleRowCount", this._groupSummaryVisibleRowCount(oSummary.rows));
            oModel.setProperty("/sankeySelections", oSankey.selections || {});
            oModel.setProperty("/cycleLegend", oSankey.cycleLegend);
            oModel.setProperty("/sankeyHtml", oSankey.html);
            oModel.setProperty("/hasFlowData", aRows.length > 0);
            this._attachSankeyNavigation();
        },

        _groupSummaryVisibleRowCount: function (aRows) {
            var iCount = (aRows || []).length;

            return Math.max(7, Math.min(14, iCount || 7));
        },

        _buildKpis: function (aRows, oSummary) {
            var fTotal = this._sum(aRows);
            var mSender = {};
            var mReceiver = {};
            var oMaxIn = oSummary.rows[0] || {};

            (aRows || []).forEach(function (oRow) {
                mSender[oRow._senderCcgId] = true;
                mReceiver[oRow._receiverCcgId] = true;
            });

            oMaxIn = (oSummary.rows || []).slice().sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.receivedAmount || 0) - Math.abs(oFirst.receivedAmount || 0);
            })[0] || {};

            return [
                this.createKpi("총 배부금액", Flow.amountText(fTotal, "KRW"), "", "None", "sap-icon://money-bills"),
                this.createKpi("배부 전표 건수", Flow.amountText(Flow.distinctDocumentCount(aRows)).replace(" KRW", "") + " 건", "", "None", "sap-icon://documents"),
                this.createKpi("송신 CCG 수", Object.keys(mSender).length + " 개", "", "None", "sap-icon://paper-plane"),
                this.createKpi("수신 CCG 수", Object.keys(mReceiver).length + " 개", "", "None", "sap-icon://download-from-cloud"),
                this.createKpi("최대 순유입 CCG", oMaxIn.ccgText || "-", "순 유입 금액 " + Flow.amountText(oMaxIn.netAmount, "KRW"), "None", "sap-icon://competitor")
            ];
        },

        _buildSankey: function (aRows, oFilters) {
            var mSenders = {};
            var mReceivers = {};
            var mCycles = {};
            var mSenderCycleLinks = {};
            var mCycleReceiverLinks = {};
            var mPairGroups = {};
            var mTopSenderIds = this._topIds(aRows, "_senderCcgId", 8);
            var mTopReceiverIds = this._topIds(aRows, "_receiverCcgId", 8);
            var aPairGroups;
            var oSelectedPair;
            var aColumns;
            var aLinks;
            var mSelections;

            (aRows || []).forEach(function (oRow) {
                var bTopSender = !!mTopSenderIds[oRow._senderCcgId];
                var bTopReceiver = !!mTopReceiverIds[oRow._receiverCcgId];
                var sSenderCcgId = bTopSender ? oRow._senderCcgId : Flow.GROUP_ETC;
                var sReceiverCcgId = bTopReceiver ? oRow._receiverCcgId : Flow.GROUP_ETC;
                var sSenderText = bTopSender ? oRow._senderCcgText : "기타 CCG";
                var sReceiverText = bTopReceiver ? oRow._receiverCcgText : "기타 CCG";
                var sSenderId = "S:" + sSenderCcgId;
                var sReceiverId = "R:" + sReceiverCcgId;
                var sCycleId = "C:" + (oRow._cycle || "NO_CYCLE");
                var sSenderCycleKey = sSenderId + "|" + sCycleId;
                var sCycleReceiverKey = sCycleId + "|" + sReceiverId;
                var sPairKey = oRow._senderCcgId + "|" + oRow._receiverCcgId + "|" + oRow._cycle;
                var sSenderHash = bTopSender ? this._hash("allocation-flow/detail", {
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    cycle: oFilters.cycle || "",
                    senderCcgId: oRow._senderCcgId,
                    senderCcgText: oRow._senderCcgText,
                    receiverCcgId: oFilters.receiverCcgId || "",
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis
                }) : "";
                var sCycleHash = this._hash("allocation-flow/detail", {
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    senderCcgId: oFilters.senderCcgId || "",
                    receiverCcgId: oFilters.receiverCcgId || "",
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis
                });
                var sSenderCycleHash = bTopSender ? this._hash("allocation-flow/detail", {
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    senderCcgId: oRow._senderCcgId,
                    senderCcgText: oRow._senderCcgText,
                    receiverCcgId: oFilters.receiverCcgId || "",
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis
                }) : "";

                this._addAmountGroup(mSenders, sSenderId, {
                    id: sSenderId,
                    text: sSenderText,
                    color: Flow.colorForKey(oRow._cycle || sSenderCcgId),
                    href: sSenderHash,
                    selectKey: sSenderId,
                    memberCcgId: oRow._senderCcgId
                }, oRow);
                this._addAmountGroup(mReceivers, sReceiverId, {
                    id: sReceiverId,
                    text: sReceiverText,
                    color: Flow.colorForKey(oRow._cycle || sReceiverCcgId),
                    href: bTopReceiver ? this._hash("allocation-flow/landing", {
                        gjahr: oFilters.gjahr,
                        period: oFilters.period,
                        cycle: oFilters.cycle ? oRow._cycle : "",
                        cycleText: oFilters.cycle ? oRow._cycleText : "",
                        senderCcgId: "",
                        senderCcgText: "",
                        receiverCcgId: oRow._receiverCcgId,
                        receiverCcgText: oRow._receiverCcgText,
                        skfId: oFilters.skfId,
                        groupBasis: oFilters.groupBasis
                    }) : "",
                    selectKey: sReceiverId,
                    memberCcgId: oRow._receiverCcgId
                }, oRow);
                this._addAmountGroup(mCycles, sCycleId, {
                    id: sCycleId,
                    text: oRow._cycleText,
                    color: Flow.colorForKey(oRow._cycle),
                    href: sCycleHash,
                    selectKey: sCycleId
                }, oRow);
                this._addLinkGroup(mSenderCycleLinks, sSenderCycleKey, sSenderId, sCycleId, oRow, sSenderCycleHash);
                this._addLinkGroup(mCycleReceiverLinks, sCycleReceiverKey, sCycleId, sReceiverId, oRow);
                this._addPairGroup(mPairGroups, sPairKey, oRow, oFilters);
            }.bind(this));

            aPairGroups = Object.keys(mPairGroups).map(function (sKey) {
                return mPairGroups[sKey];
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount) - Math.abs(oFirst.amount);
            });
            oSelectedPair = aPairGroups[0] || null;
            this._applyEtcGroupHrefs(mSenders, mReceivers, oFilters);

            aColumns = [
                {
                    title: "송신 CCG 그룹",
                    nodes: this._mapNodeGroups(mSenders)
                },
                {
                    title: "배부단계",
                    nodes: this._mapCycleNodeGroups(mCycles),
                    centerCompact: true,
                    nodeGap: 24
                },
                {
                    title: "수신 CCG 그룹",
                    nodes: this._mapNodeGroups(mReceivers)
                }
            ];
            aLinks = this._mapLinkGroups(mSenderCycleLinks).concat(this._mapLinkGroups(mCycleReceiverLinks).map(function (oLink) {
                var oReceiverNode = mReceivers[oLink.to];
                var oCycleNode = mCycles[oLink.from];
                var bEtc = oReceiverNode && oReceiverNode.ccgId === Flow.GROUP_ETC;
                var aReceiverCcgIds = bEtc ? this._groupMemberIds(oReceiverNode) : [];
                var bCanDrillDown = oReceiverNode && oReceiverNode.ccgId &&
                    (oReceiverNode.ccgId !== Flow.GROUP_ETC || aReceiverCcgIds.length);

                return Object.assign({}, oLink, {
                    href: bCanDrillDown ? this._hash("allocation-flow/landing", {
                        gjahr: oFilters.gjahr,
                        period: oFilters.period,
                        cycle: oCycleNode && oCycleNode.cycle,
                        cycleText: oCycleNode && oCycleNode.text,
                        receiverCcgId: bEtc ? "" : oReceiverNode && oReceiverNode.ccgId,
                        receiverCcgIds: bEtc ? aReceiverCcgIds : [],
                        receiverCcgText: oReceiverNode && oReceiverNode.text,
                        skfId: oFilters.skfId,
                        groupBasis: oFilters.groupBasis
                    }) : ""
                });
            }.bind(this)));
            mSelections = {};
            this._registerGroupSelections(mSelections, mSenders, oFilters);
            this._registerGroupSelections(mSelections, mCycles, oFilters);
            this._registerGroupSelections(mSelections, mReceivers, oFilters);
            this._registerLinkSelections(mSelections, mSenderCycleLinks, mSenders, mCycles, mReceivers, oFilters);
            this._registerLinkSelections(mSelections, mCycleReceiverLinks, mSenders, mCycles, mReceivers, oFilters);

            return {
                html: aRows.length ? Flow.renderFlowSvg({
                    columns: aColumns,
                    links: aLinks,
                    minWidth: 2060,
                    minHeight: 680,
                    nodeWidth: 340,
                    nodeHeight: 46,
                    maxLinkWidth: 26,
                    titleLength: 22,
                    amountLength: 14
                }) : "",
                cycleLegend: this._buildCycleLegend(aRows),
                selectedFlow: oSelectedPair ? this._mapSelectedFlow(oSelectedPair) : this._emptySelectedFlow(),
                selections: mSelections
            };
        },

        _addAmountGroup: function (mGroups, sKey, oBase, oRow) {
            if (!mGroups[sKey]) {
                mGroups[sKey] = Object.assign({
                    amount: 0,
                    docs: {},
                    rows: [],
                    memberIds: {},
                    cycle: oRow._cycle,
                    ccgId: sKey.replace(/^[SRC]:/, "")
                }, oBase);
            }
            if (!mGroups[sKey].selectKey && oBase.selectKey) {
                mGroups[sKey].selectKey = oBase.selectKey;
            }
            mGroups[sKey].amount += oRow._amount;
            mGroups[sKey].rows.push(oRow);
            if (oRow._documentKey && oRow._documentKey !== "||") {
                mGroups[sKey].docs[oRow._documentKey] = true;
            }
            if (oBase.memberCcgId) {
                mGroups[sKey].memberIds[oBase.memberCcgId] = true;
            }
        },

        _applyEtcGroupHrefs: function (mSenders, mReceivers, oFilters) {
            var oSenderEtc = mSenders["S:" + Flow.GROUP_ETC];
            var oReceiverEtc = mReceivers["R:" + Flow.GROUP_ETC];
            var aSenderIds = this._groupMemberIds(oSenderEtc);
            var aReceiverIds = this._groupMemberIds(oReceiverEtc);

            if (oSenderEtc && aSenderIds.length) {
                oSenderEtc.href = this._hash("allocation-flow/detail", {
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    cycle: oFilters.cycle || "",
                    senderCcgId: "",
                    senderCcgIds: aSenderIds,
                    senderCcgText: oSenderEtc.text,
                    receiverCcgId: oFilters.receiverCcgId || "",
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis
                });
            }

            if (oReceiverEtc && aReceiverIds.length) {
                oReceiverEtc.href = this._hash("allocation-flow/landing", {
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    cycle: oFilters.cycle || "",
                    senderCcgId: oFilters.senderCcgId || "",
                    receiverCcgId: "",
                    receiverCcgIds: aReceiverIds,
                    receiverCcgText: oReceiverEtc.text,
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis
                });
            }
        },

        _groupMemberIds: function (oGroup) {
            return Object.keys(oGroup && oGroup.memberIds || {}).sort(function (sFirst, sSecond) {
                return sFirst.localeCompare(sSecond);
            });
        },

        _addLinkGroup: function (mLinks, sKey, sFrom, sTo, oRow, sHref) {
            if (!mLinks[sKey]) {
                mLinks[sKey] = {
                    key: sKey,
                    from: sFrom,
                    to: sTo,
                    colorKey: oRow._cycle,
                    color: Flow.colorForKey(oRow._cycle),
                    currency: oRow._waers,
                    amount: 0,
                    docs: {},
                    rows: [],
                    selectKey: "L:" + sKey,
                    href: sHref || ""
                };
            }
            if (!mLinks[sKey].href && sHref) {
                mLinks[sKey].href = sHref;
            }
            mLinks[sKey].amount += oRow._amount;
            mLinks[sKey].rows.push(oRow);
            if (oRow._documentKey && oRow._documentKey !== "||") {
                mLinks[sKey].docs[oRow._documentKey] = true;
            }
        },

        _addPairGroup: function (mGroups, sKey, oRow, oFilters) {
            if (!mGroups[sKey]) {
                mGroups[sKey] = {
                    senderCcgId: oRow._senderCcgId,
                    senderCcgText: oRow._senderCcgText,
                    receiverCcgId: oRow._receiverCcgId,
                    receiverCcgText: oRow._receiverCcgText,
                    cycle: oRow._cycle,
                    cycleText: oRow._cycleText,
                    skfId: oFilters.skfId,
                    groupBasis: oFilters.groupBasis,
                    gjahr: oFilters.gjahr,
                    period: oFilters.period,
                    amount: 0,
                    docs: {}
                };
            }
            mGroups[sKey].amount += oRow._amount;
            if (oRow._documentKey && oRow._documentKey !== "||") {
                mGroups[sKey].docs[oRow._documentKey] = true;
            }
        },

        _mapNodeGroups: function (mGroups) {
            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                return {
                    id: oGroup.id,
                    text: oGroup.text,
                    subText: Flow.compactAmountText(oGroup.amount) + " KRW",
                    amount: oGroup.amount,
                    color: oGroup.color,
                    href: oGroup.href,
                    selectKey: oGroup.selectKey
                };
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                    Flow.clean(oFirst.text).localeCompare(Flow.clean(oSecond.text), "ko");
            }).slice(0, 12);
        },

        _mapCycleNodeGroups: function (mGroups) {
            return Object.keys(mGroups).map(function (sKey) {
                var oGroup = mGroups[sKey];
                return {
                    id: oGroup.id,
                    text: oGroup.text,
                    subText: Flow.compactAmountText(oGroup.amount) + " KRW",
                    amount: oGroup.amount,
                    color: oGroup.color,
                    href: oGroup.href,
                    selectKey: oGroup.selectKey,
                    stepNo: this._parseStepNo(oGroup.text || oGroup.cycle)
                };
            }.bind(this)).sort(function (oFirst, oSecond) {
                return oFirst.stepNo - oSecond.stepNo ||
                    Flow.clean(oFirst.text).localeCompare(Flow.clean(oSecond.text), "ko");
            });
        },

        _parseStepNo: function (sText) {
            var aMatch = /(\d+)\s*단계/.exec(Flow.clean(sText));

            return aMatch ? Number(aMatch[1]) : 999;
        },

        _mapLinkGroups: function (mLinks) {
            return Object.keys(mLinks).map(function (sKey) {
                var oLink = mLinks[sKey];
                return Object.assign({}, oLink, {
                    title: Flow.amountText(oLink.amount, oLink.currency || "KRW")
                });
            });
        },

        _buildCycleLegend: function (aRows) {
            var mCycles = {};

            (aRows || []).forEach(function (oRow) {
                if (oRow._cycle && !mCycles[oRow._cycle]) {
                    mCycles[oRow._cycle] = {
                        cycle: oRow._cycle,
                        text: oRow._cycleText,
                        color: Flow.colorForKey(oRow._cycle)
                    };
                }
            });

            return Object.keys(mCycles).map(function (sKey) {
                return mCycles[sKey];
            }).sort(function (oFirst, oSecond) {
                return this._parseStepNo(oFirst.text) - this._parseStepNo(oSecond.text) ||
                    Flow.clean(oFirst.text).localeCompare(Flow.clean(oSecond.text), "ko");
            }.bind(this));
        },

        _registerGroupSelections: function (mSelections, mGroups, oFilters) {
            Object.keys(mGroups || {}).forEach(function (sKey) {
                var oGroup = mGroups[sKey];
                var oSummary;

                if (!oGroup.selectKey) {
                    return;
                }

                oSummary = this._buildGroupSummary(oGroup.rows || []);
                mSelections[oGroup.selectKey] = {
                    selectedFlow: this._mapSelectedGroup(oGroup, oFilters),
                    groupSummaryRows: oSummary.rows,
                    groupSummaryVisibleRowCount: this._groupSummaryVisibleRowCount(oSummary.rows)
                };
            }.bind(this));
        },

        _registerLinkSelections: function (mSelections, mLinks, mSenders, mCycles, mReceivers, oFilters) {
            Object.keys(mLinks || {}).forEach(function (sKey) {
                var oLink = mLinks[sKey];
                var oSummary;

                if (!oLink.selectKey) {
                    return;
                }

                oSummary = this._buildGroupSummary(oLink.rows || []);
                mSelections[oLink.selectKey] = {
                    selectedFlow: this._mapSelectedLink(oLink, mSenders, mCycles, mReceivers, oFilters),
                    groupSummaryRows: oSummary.rows,
                    groupSummaryVisibleRowCount: this._groupSummaryVisibleRowCount(oSummary.rows)
                };
            }.bind(this));
        },

        _mapSelectedGroup: function (oGroup, oFilters) {
            var sId = Flow.clean(oGroup.id);
            var sType = sId.charAt(0);
            var bEtc = oGroup.ccgId === Flow.GROUP_ETC;
            var sText = oGroup.text || "-";
            var oFlow = this._emptySelectedFlow();

            oFlow.amountText = Flow.amountText(oGroup.amount, "KRW");
            oFlow.documentCountText = Object.keys(oGroup.docs || {}).length + " 건";
            oFlow.totalDocumentCountText = oFlow.documentCountText;
            oFlow.scopeText = (oFilters.gjahr || "-") + "년 " + (oFilters.period || "-") + "월";
            oFlow.groupBasisText = this._groupBasisText(oFilters.groupBasis);
            oFlow.context = {
                gjahr: oFilters.gjahr,
                period: oFilters.period,
                cycle: sType === "C" ? oGroup.cycle : oFilters.cycle || "",
                cycleText: sType === "C" ? oGroup.text : "",
                senderCcgId: "",
                receiverCcgId: "",
                skfId: oFilters.skfId,
                groupBasis: oFilters.groupBasis
            };

            if (sType === "S") {
                oFlow.senderText = sText;
                oFlow.cycleText = "전체";
                oFlow.receiverText = "전체";
                oFlow.directionText = bEtc ? "기타 송신 CCG 집계" : "송신 CCG 집계";
                if (bEtc) {
                    oFlow.context.senderCcgIds = this._groupMemberIds(oGroup);
                    oFlow.context.senderCcgText = sText;
                } else {
                    oFlow.context.senderCcgId = oGroup.ccgId;
                    oFlow.context.senderCcgText = sText;
                }
            } else if (sType === "C") {
                oFlow.senderText = "전체";
                oFlow.cycleText = sText;
                oFlow.receiverText = "전체";
                oFlow.directionText = "배부사이클 집계";
            } else {
                oFlow.senderText = "전체";
                oFlow.cycleText = "전체";
                oFlow.receiverText = sText;
                oFlow.directionText = bEtc ? "기타 수신 CCG 집계" : "수신 CCG 집계";
                if (bEtc) {
                    oFlow.context.receiverCcgIds = this._groupMemberIds(oGroup);
                    oFlow.context.receiverCcgText = sText;
                } else {
                    oFlow.context.receiverCcgId = oGroup.ccgId;
                    oFlow.context.receiverCcgText = sText;
                }
            }

            return oFlow;
        },

        _mapSelectedLink: function (oLink, mSenders, mCycles, mReceivers, oFilters) {
            var oFrom = mSenders[oLink.from] || mCycles[oLink.from] || mReceivers[oLink.from] || {};
            var oTo = mSenders[oLink.to] || mCycles[oLink.to] || mReceivers[oLink.to] || {};
            var sFromType = Flow.clean(oLink.from).charAt(0);
            var sToType = Flow.clean(oLink.to).charAt(0);
            var oFlow = this._emptySelectedFlow();

            oFlow.amountText = Flow.amountText(oLink.amount, oLink.currency || "KRW");
            oFlow.documentCountText = Object.keys(oLink.docs || {}).length + " 건";
            oFlow.totalDocumentCountText = oFlow.documentCountText;
            oFlow.scopeText = (oFilters.gjahr || "-") + "년 " + (oFilters.period || "-") + "월";
            oFlow.groupBasisText = this._groupBasisText(oFilters.groupBasis);
            oFlow.directionText = "연결선 집계";
            oFlow.context = {};

            if (sFromType === "S" && sToType === "C") {
                oFlow.senderText = oFrom.text || "-";
                oFlow.cycleText = oTo.text || "-";
                oFlow.receiverText = "전체";
            } else if (sFromType === "C" && sToType === "R") {
                oFlow.senderText = "전체";
                oFlow.cycleText = oFrom.text || "-";
                oFlow.receiverText = oTo.text || "-";
            } else {
                oFlow.senderText = oFrom.text || "-";
                oFlow.cycleText = "전체";
                oFlow.receiverText = oTo.text || "-";
            }

            return oFlow;
        },

        _mapSelectedFlow: function (oPair) {
            var iDocCount = Object.keys(oPair.docs || {}).length;
            var sDirectionText = this._flowDirectionText(oPair);
            var oContext = {
                gjahr: oPair.gjahr,
                period: oPair.period,
                cycle: oPair.cycle,
                cycleText: oPair.cycleText,
                senderCcgId: oPair.senderCcgId,
                senderCcgText: oPair.senderCcgText,
                receiverCcgId: oPair.receiverCcgId,
                receiverCcgText: oPair.receiverCcgText,
                skfId: oPair.skfId,
                groupBasis: oPair.groupBasis
            };

            return {
                senderText: oPair.senderCcgText || "-",
                cycleText: oPair.cycleText || "-",
                receiverText: oPair.receiverCcgText || "-",
                amountText: Flow.amountText(oPair.amount, "KRW"),
                documentCountText: iDocCount + " 건",
                totalDocumentCountText: iDocCount + " 건",
                directionText: sDirectionText,
                scopeText: (oPair.gjahr || "-") + "년 " + (oPair.period || "-") + "월",
                groupBasisText: this._groupBasisText(oPair.groupBasis),
                context: oContext
            };
        },

        _flowDirectionText: function (oPair) {
            var sSender = Flow.clean(oPair && oPair.senderCcgId);
            var sReceiver = Flow.clean(oPair && oPair.receiverCcgId);

            if (!sSender || !sReceiver || sSender === "-" || sReceiver === "-") {
                return "-";
            }

            return sSender === sReceiver ? "내부 재배부" : "CCG 간 배부";
        },

        _groupBasisText: function (sGroupBasis) {
            var sKey = Flow.clean(sGroupBasis) || "DIRECT";
            var oOption = (this.getView().getModel("flow0").getProperty("/groupBasisOptions") || []).find(function (oItem) {
                return oItem.key === sKey;
            });

            return oOption ? oOption.text : sKey;
        },

        _emptySelectedFlow: function () {
            return {
                senderText: "-",
                cycleText: "-",
                receiverText: "-",
                amountText: "-",
                documentCountText: "-",
                totalDocumentCountText: "-",
                directionText: "-",
                scopeText: "-",
                groupBasisText: "-",
                context: {}
            };
        },

        _buildGroupSummary: function (aRows) {
            var mRows = {};

            function ensure(sId, sText) {
                if (!mRows[sId]) {
                    mRows[sId] = {
                        ccgId: sId,
                        ccgText: sText || "그룹 미지정",
                        sentAmount: 0,
                        receivedAmount: 0,
                        netAmount: 0,
                        docs: {}
                    };
                }
                return mRows[sId];
            }

            (aRows || []).forEach(function (oRow) {
                var oSender = ensure(oRow._senderCcgId, oRow._senderCcgText);
                var oReceiver = ensure(oRow._receiverCcgId, oRow._receiverCcgText);

                oSender.sentAmount += oRow._amount;
                oReceiver.receivedAmount += oRow._amount;
                if (oRow._documentKey && oRow._documentKey !== "||") {
                    oSender.docs[oRow._documentKey] = true;
                    oReceiver.docs[oRow._documentKey] = true;
                }
            });

            return {
                rows: Object.keys(mRows).map(function (sKey) {
                    var oRow = mRows[sKey];
                    oRow.netAmount = oRow.receivedAmount - oRow.sentAmount;
                    oRow.documentCountText = Object.keys(oRow.docs).length + " 건";
                    return oRow;
                }).sort(function (oFirst, oSecond) {
                    return Math.abs(oSecond.netAmount || 0) - Math.abs(oFirst.netAmount || 0) ||
                        Flow.clean(oFirst.ccgText).localeCompare(Flow.clean(oSecond.ccgText), "ko");
                })
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
            var oSelectTarget;
            var sSelectKey;

            if (sHref) {
                if (oEvent.preventDefault) {
                    oEvent.preventDefault();
                }
                if (oEvent.stopPropagation) {
                    oEvent.stopPropagation();
                }

                this._navigateFromSankeyHref(sHref);
                return;
            }

            oSelectTarget = oEvent.target && oEvent.target.closest &&
                oEvent.target.closest(".ze4SankeySelectable[data-flow-select]");
            sSelectKey = oSelectTarget && oSelectTarget.getAttribute("data-flow-select");

            if (!sSelectKey) {
                return;
            }
            if (oEvent.preventDefault) {
                oEvent.preventDefault();
            }
            if (oEvent.stopPropagation) {
                oEvent.stopPropagation();
            }

            this._selectSankeyItem(sSelectKey);
        },

        _selectSankeyItem: function (sSelectKey) {
            var oModel = this.getView().getModel("flow0");
            var oSelection = (oModel.getProperty("/sankeySelections") || {})[sSelectKey];

            if (!oSelection) {
                return;
            }

            oModel.setProperty("/selectedFlow", oSelection.selectedFlow || this._emptySelectedFlow());
            oModel.setProperty("/groupSummaryRows", oSelection.groupSummaryRows || []);
            oModel.setProperty("/groupSummaryVisibleRowCount", oSelection.groupSummaryVisibleRowCount || 7);
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
