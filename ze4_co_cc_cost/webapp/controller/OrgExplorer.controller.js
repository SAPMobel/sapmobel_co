sap.ui.define([
    "ZE4_CC_COST/controller/BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("ZE4_CC_COST.controller.OrgExplorer", {
        getModelName: function () {
            return "org";
        },

        onInit: function () {
            this._orgData = null;
            var oOrgModel = this.createViewModel({
                activeMenu: "orgExplorer",
                pageTitle: "조직도 기반 부서 선택",
                orgTreeRows: [],
                orgChartHtml: "",
                networkGraph: {
                    noData: true,
                    nodes: [],
                    lines: []
                },
                selectedInfo: {},
                childRows: [],
                accountComposition: [],
                selectedAccountKey: "",
                selectedAccountSummary: {},
                hasSelectedAccountSummary: false,
                hasCompositionData: false
            });

            oOrgModel.setSizeLimit(10000);
            this.getView().setModel(oOrgModel, "org");

            this.getRouter().getRoute("orgExplorer").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var oModel = this.getView().getModel("org");

            oModel.setProperty("/busy", true);
            this.service.init()
                .then(function () {
                    return this.syncDefaultFilters("org");
                }.bind(this))
                .then(function (oFilters) {
                    return this._loadOrg(oFilters);
                }.bind(this))
                .catch(function () {
                    this.setWarning("org", "표시할 데이터가 없습니다.");
                }.bind(this))
                .finally(function () {
                    oModel.setProperty("/busy", false);
                });
        },

        onSearch: function () {
            var oFilters = this.validateFilters("org");

            if (!oFilters) {
                return;
            }

            this._loadOrg(oFilters);
        },

        _loadOrg: function (oFilters) {
            var oModel = this.getView().getModel("org");

            oModel.setProperty("/busy", true);
            this.setWarning("org", "");

            return Promise.all([
                this.service.readHierarchyRows().catch(function () {
                    return [];
                }),
                this.service.readActualRows(oFilters).catch(function () {
                    return [];
                }),
                this.service.readBudgetRows(oFilters).catch(function () {
                    return [];
                }),
                this.service.readPreviousYearRows(oFilters).catch(function () {
                    return [];
                }),
                this.service.readDocumentRows(oFilters, false).catch(function () {
                    return [];
                })
            ]).then(function (aResults) {
                this._orgData = {
                    filters: oFilters,
                    hierarchyRows: aResults[0],
                    actualRows: aResults[1],
                    budgetRows: aResults[2],
                    previousYearRows: aResults[3],
                    documentRows: aResults[4]
                };
                this._applyOrgData();
            }.bind(this)).finally(function () {
                oModel.setProperty("/busy", false);
            });
        },

        _applyOrgData: function (sSelectedId) {
            var oModel = this.getView().getModel("org");
            var oData = this._orgData || {};
            var oFilters = oData.filters || this.createDefaultFilters();
            var aHierarchyRows = oData.hierarchyRows || [];
            var aActualRows = oData.actualRows || [];
            var aBudgetRows = oData.budgetRows || [];
            var aPreviousYearRows = oData.previousYearRows || [];
            var aDocumentRows = oData.documentRows || [];
            var aOptions = this.service.buildHierarchyOptions(aHierarchyRows);
            var sCurrentSelectedId = sSelectedId || oModel.getProperty("/selectedOrg/childId");
            var oSelectedOrg = this._findOption(aOptions, sCurrentSelectedId) || aOptions[0] || this._emptyOrg();
            var aCumulativeActualRows = this.service.cumulativeActualRows(aActualRows, oFilters.period);
            var aCurrentActualRows = this.service.currentActualRows(aActualRows, oFilters.period);
            var aCurrentBudgetRows = this._currentBudgetRows(aBudgetRows, oFilters.period);
            var aOrgTreeRows = this.service.buildOrgRollupTree(aHierarchyRows, aCurrentActualRows, this._emptyOrg());
            var aMarkedTreeRows = this._markTreeSelected(aOrgTreeRows, oSelectedOrg.childId);
            var aChartTreeRows = this._buildVisibleOrgChartTree(aMarkedTreeRows, oSelectedOrg.childId, 2);
            var oChildrenMap = this._buildChildrenMap(aHierarchyRows);
            var oOptionMap = this._buildOptionMap(aOptions);
            var oNetworkGraph = this._buildOrgNetworkGraphData(
                aChartTreeRows,
                oSelectedOrg.childId,
                oOptionMap,
                aCurrentBudgetRows
            );
            var oSelectedInfo = this._buildSelectedInfo(
                oSelectedOrg,
                oChildrenMap,
                oOptionMap,
                aCurrentActualRows,
                aCurrentBudgetRows,
                aCumulativeActualRows,
                aPreviousYearRows,
                aDocumentRows,
                oFilters
            );
            var aChildRows = this._buildChildRows(
                oSelectedOrg,
                oChildrenMap,
                oOptionMap,
                aCurrentActualRows,
                aCurrentBudgetRows,
                aCumulativeActualRows
            );
            var aOrgActualRows = this.service.filterByOrg(aCurrentActualRows, "kostl", oSelectedOrg);
            var aCompositionRows = this._buildAccountComposition(aOrgActualRows);

            if (!aHierarchyRows.length && !aActualRows.length) {
                this.setWarning("org", "표시할 데이터가 없습니다.");
            } else if (!aBudgetRows.length) {
                this.setWarning("org", "예산 데이터가 없습니다. 실적 기준으로 표시합니다.");
            }

            oModel.setProperty("/orgOptions", aOptions);
            oModel.setProperty("/selectedOrg", oSelectedOrg);
            oModel.setProperty("/filters/orgNodeId", oSelectedOrg.childId || "");
            oModel.setProperty("/filters/orgNodeText", oSelectedOrg.nodeText || "");
            oModel.setProperty("/orgTreeRows", aMarkedTreeRows);
            oModel.setProperty("/orgChartHtml", "");
            oModel.setProperty("/networkGraph", oNetworkGraph);
            oModel.setProperty("/selectedInfo", oSelectedInfo);
            oModel.setProperty("/childRows", aChildRows);
            oModel.setProperty("/accountComposition", aCompositionRows);
            oModel.setProperty("/selectedAccountKey", "");
            oModel.setProperty("/selectedAccountSummary", {});
            oModel.setProperty("/hasSelectedAccountSummary", false);
            oModel.setProperty("/hasCompositionData", aCompositionRows.length > 0);

            this.configureVizFrame(this.byId("orgCompositionChart"), this.byId("orgCompositionChartPopover"), {
                type: "donut",
                legendPosition: "right"
            });
            this.scheduleViewportTableResize([{
                id: "orgChildTable",
                minRows: 6,
                maxRows: 18,
                bottomOffset: 28
            }]);

            setTimeout(function () {
                this._scrollOrgGraphToNode(oSelectedOrg.childId);
            }.bind(this), 0);
        },

        _emptyOrg: function () {
            return {
                childId: "",
                nodeText: "",
                manager: "",
                descendantIds: [],
                nodeType: ""
            };
        },

        _findOption: function (aOptions, sSelectedId) {
            var sNodeId = this.service.normalizeNodeId(sSelectedId);

            if (!sNodeId) {
                return null;
            }

            return (aOptions || []).find(function (oOption) {
                return oOption.childId === sNodeId;
            }) || null;
        },

        _buildOptionMap: function (aOptions) {
            var mOptions = {};

            (aOptions || []).forEach(function (oOption) {
                if (oOption.childId) {
                    mOptions[oOption.childId] = oOption;
                }
            });

            return mOptions;
        },

        _buildChildrenMap: function (aHierarchyRows) {
            var mChildrenByParent = {};

            (aHierarchyRows || []).forEach(function (oRow) {
                var sParentId = this.service.normalizeNodeId(this.service.getField(oRow, "parent_id"));

                if (!mChildrenByParent[sParentId]) {
                    mChildrenByParent[sParentId] = [];
                }

                mChildrenByParent[sParentId].push(oRow);
            }.bind(this));

            return mChildrenByParent;
        },

        _markTreeSelected: function (aTreeRows, sSelectedId) {
            var sNodeId = this.service.normalizeNodeId(sSelectedId);

            return (aTreeRows || []).map(function (oNode) {
                return Object.assign({}, oNode, {
                    selectedState: oNode.childId === sNodeId ? "Information" : "None",
                    children: this._markTreeSelected(oNode.children, sNodeId)
                });
            }.bind(this));
        },

        _currentBudgetRows: function (aRows, sPeriod) {
            var sNormalizedPeriod = this.service.normalizeMonth(sPeriod);

            return (aRows || []).filter(function (oRow) {
                return this.service.normalizeMonth(this.service.getField(oRow, "Poper")) === sNormalizedPeriod;
            }.bind(this));
        },

        _buildSelectedInfo: function (oSelectedOrg, oChildrenMap, oOptionMap, aActualRows, aBudgetRows, aCumulativeActualRows, aPreviousYearRows, aDocumentRows, oFilters) {
            var aOrgActualRows = this.service.filterByOrg(aActualRows, "kostl", oSelectedOrg);
            var aOrgBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oSelectedOrg);
            var aOrgCumulativeRows = this.service.filterByOrg(aCumulativeActualRows, "kostl", oSelectedOrg);
            var aOrgPreviousRows = this.service.previousActualRows(
                this.service.filterByOrg(this._orgData.actualRows || [], "kostl", oSelectedOrg),
                aPreviousYearRows,
                oFilters,
                oSelectedOrg
            );
            var aOrgDocumentRows = this.service.currentDocumentRows(this.service.filterByOrg(aDocumentRows, "Kostl", oSelectedOrg), oFilters.period);
            var fActualAmount = this.service.sum(aOrgActualRows, "amount");
            var fBudgetAmount = this.service.sum(aOrgBudgetRows, "BudgetAmt");
            var fCumulativeAmount = this.service.sum(aOrgCumulativeRows, "amount");
            var fPreviousAmount = this.service.sum(aOrgPreviousRows, "amount");
            var bHasBudget = aOrgBudgetRows.length > 0;
            var bHasMomData = aOrgActualRows.length > 0 || aOrgPreviousRows.length > 0;
            var fVariance = bHasBudget ? fActualAmount - fBudgetAmount : null;
            var fVarianceRate = bHasBudget && fBudgetAmount ? fVariance / fBudgetAmount * 100 : null;
            var fMom = bHasMomData ? fActualAmount - fPreviousAmount : null;
            var sParentText = this._parentText(oSelectedOrg, oChildrenMap, oOptionMap);
            var iChildCount = Math.max(0, (oSelectedOrg.descendantIds || []).length - 1);
            var iDocumentCount = this.service.distinctDocumentCount(aOrgDocumentRows);

            return {
                name: oSelectedOrg.nodeText || "-",
                code: oSelectedOrg.childId || "-",
                parentText: sParentText,
                childCountText: this.formatter.amount(iChildCount),
                actualText: aOrgActualRows.length ? this.formatter.amountWithCurrency(fActualAmount, "KRW") : "-",
                currentText: aOrgActualRows.length ? this.formatter.amountWithCurrency(fActualAmount, "KRW") : "-",
                cumulativeText: aOrgCumulativeRows.length ? this.formatter.amountWithCurrency(fCumulativeAmount, "KRW") : "-",
                budgetText: bHasBudget ? this.formatter.amountWithCurrency(fBudgetAmount, "KRW") : "-",
                varianceText: this._varianceText(fVariance, fVarianceRate, bHasBudget),
                varianceState: this.formatter.valueStateByVariance(fVariance, bHasBudget),
                momText: fMom === null ? "-" : this.formatter.amountWithCurrency(fMom, "KRW"),
                momState: this.formatter.valueStateByDelta(fMom),
                manager: oSelectedOrg.manager || "-",
                asOfDate: this.formatToday(),
                documentCount: iDocumentCount,
                documentCountText: this.formatter.amount(iDocumentCount) + "건"
            };
        },

        _parentText: function (oSelectedOrg, oChildrenMap, oOptionMap) {
            var sSelectedId = oSelectedOrg.childId;
            var sParentId = "";

            Object.keys(oChildrenMap).some(function (sCandidateParentId) {
                var bMatched = (oChildrenMap[sCandidateParentId] || []).some(function (oChildRow) {
                    return this.service.normalizeNodeId(this.service.getField(oChildRow, "child_id")) === sSelectedId;
                }.bind(this));

                if (bMatched) {
                    sParentId = sCandidateParentId;
                    return true;
                }

                return false;
            }.bind(this));

            return sParentId && oOptionMap[sParentId] ? oOptionMap[sParentId].nodeText + " (" + sParentId + ")" : "-";
        },

        _varianceText: function (fVariance, fVarianceRate, bHasBudget) {
            if (!bHasBudget || fVariance === null) {
                return "-";
            }

            return fVarianceRate === null ?
                this.formatter.amountWithCurrency(fVariance, "KRW") :
                this.formatter.amountWithCurrency(fVariance, "KRW") + " (" + this.formatter.rate(fVarianceRate) + ")";
        },

        _buildChildRows: function (oSelectedOrg, oChildrenMap, oOptionMap, aActualRows, aBudgetRows, aCumulativeActualRows) {
            var aDirectChildren = oChildrenMap[oSelectedOrg.childId] || [];

            return aDirectChildren.map(function (oChildRow) {
                var sChildId = this.service.normalizeNodeId(this.service.getField(oChildRow, "child_id"));
                var oChildOrg = oOptionMap[sChildId] || this._emptyOrg();
                var aChildActualRows = this.service.filterByOrg(aActualRows, "kostl", oChildOrg);
                var aChildBudgetRows = this.service.filterByOrg(aBudgetRows, "Kostl", oChildOrg);
                var aChildCumulativeRows = this.service.filterByOrg(aCumulativeActualRows, "kostl", oChildOrg);
                var fActualAmount = this.service.sum(aChildActualRows, "amount");
                var fBudgetAmount = this.service.sum(aChildBudgetRows, "BudgetAmt");
                var fCumulativeAmount = this.service.sum(aChildCumulativeRows, "amount");
                var bHasBudget = aChildBudgetRows.length > 0;
                var fVariance = bHasBudget ? fActualAmount - fBudgetAmount : null;
                var fVarianceRate = bHasBudget && fBudgetAmount ? fVariance / fBudgetAmount * 100 : null;

                return {
                    code: sChildId || "-",
                    name: oChildOrg.nodeText || this.service.clean(this.service.getField(oChildRow, "node_text")) || "-",
                    actualAmount: aChildActualRows.length ? fActualAmount : null,
                    cumulativeAmount: aChildCumulativeRows.length ? fCumulativeAmount : null,
                    budgetAmount: bHasBudget ? fBudgetAmount : null,
                    varianceAmount: bHasBudget ? fVariance : null,
                    varianceRate: fVarianceRate,
                    statusText: "-"
                };
            }.bind(this)).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.actualAmount || 0) - Math.abs(oFirst.actualAmount || 0) ||
                    String(oFirst.code || "").localeCompare(String(oSecond.code || ""));
            });
        },

        _buildAccountComposition: function (aActualRows) {
            var fTotal = (aActualRows || []).reduce(function (fAmount, oRow) {
                return fAmount + Math.abs(Number(this.service.getField(oRow, "amount") || 0));
            }.bind(this), 0);
            var mAccounts = {};
            var aSortedAccounts;
            var aTopAccounts;
            var aEtcAccounts;
            var fEtcAmount;

            (aActualRows || []).forEach(function (oRow) {
                var sSaknr = this.service.normalizeNodeId(this.service.getField(oRow, "saknr"));
                var sSaknrTxt = this.service.clean(this.service.getField(oRow, "saknr_txt")) || "-";
                var sKey = sSaknr + "|" + sSaknrTxt;

                if (!sSaknr) {
                    return;
                }

                if (!mAccounts[sKey]) {
                    mAccounts[sKey] = {
                        saknr: sSaknr,
                        accountLabel: sSaknrTxt,
                        includedSaknrs: [sSaknr],
                        amount: 0
                    };
                }

                mAccounts[sKey].amount += Number(this.service.getField(oRow, "amount") || 0);
            }.bind(this));

            aSortedAccounts = Object.keys(mAccounts).map(function (sKey) {
                return mAccounts[sKey];
            }).sort(function (oFirst, oSecond) {
                return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                    oFirst.accountLabel.localeCompare(oSecond.accountLabel, "ko") ||
                    oFirst.saknr.localeCompare(oSecond.saknr);
            });

            aTopAccounts = aSortedAccounts.slice(0, 7);
            aEtcAccounts = aSortedAccounts.slice(7);
            fEtcAmount = aEtcAccounts.reduce(function (fAmount, oAccount) {
                return fAmount + Number(oAccount.amount || 0);
            }, 0);

            if (fEtcAmount) {
                aTopAccounts.push({
                    saknr: "ETC",
                    accountLabel: "기타",
                    includedSaknrs: aEtcAccounts.map(function (oAccount) {
                        return oAccount.saknr;
                    }),
                    amount: fEtcAmount
                });
            }

            return aTopAccounts.map(function (oAccount) {
                return Object.assign(oAccount, {
                    ratio: fTotal ? Math.abs(oAccount.amount) / fTotal * 100 : null
                });
            });
        },

        _buildVisibleOrgChartTree: function (aTreeRows, sSelectedId, iDefaultDepth) {
            var sNormalizedSelectedId = this.service.normalizeNodeId(sSelectedId);
            var iMaxChildrenPerNode = 16;
            var mContainsSelectedCache = {};

            function containsSelected(oNode) {
                var sNodeId = oNode && oNode.childId || "";

                if (!sNormalizedSelectedId) {
                    return false;
                }

                if (mContainsSelectedCache[sNodeId] !== undefined) {
                    return mContainsSelectedCache[sNodeId];
                }

                if (sNodeId === sNormalizedSelectedId) {
                    mContainsSelectedCache[sNodeId] = true;
                    return true;
                }

                mContainsSelectedCache[sNodeId] = (oNode.children || []).some(containsSelected);
                return mContainsSelectedCache[sNodeId];
            }

            function sortAndLimitChildren(aChildren) {
                var aSortedChildren = (aChildren || []).slice().sort(function (oFirst, oSecond) {
                    return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                        String(oFirst.childId || "").localeCompare(String(oSecond.childId || ""));
                });
                var aLimitedChildren = aSortedChildren.slice(0, iMaxChildrenPerNode);
                var oSelectedPathChild = aSortedChildren.find(containsSelected);

                if (oSelectedPathChild && aLimitedChildren.indexOf(oSelectedPathChild) === -1) {
                    aLimitedChildren.pop();
                    aLimitedChildren.push(oSelectedPathChild);
                    aLimitedChildren.sort(function (oFirst, oSecond) {
                        return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                            String(oFirst.childId || "").localeCompare(String(oSecond.childId || ""));
                    });
                }

                return aLimitedChildren;
            }

            function cloneNode(oNode, iDepth) {
                var bSelected = oNode.childId === sNormalizedSelectedId;
                var bOnPath = containsSelected(oNode);
                var bWithinDefaultDepth = iDepth <= iDefaultDepth;
                var aCandidateChildren = sortAndLimitChildren(oNode.children || []);
                var aChildren = aCandidateChildren.map(function (oChild) {
                    var bChildOnPath = containsSelected(oChild);

                    if (iDepth < iDefaultDepth || bSelected || bChildOnPath) {
                        return cloneNode(oChild, iDepth + 1);
                    }

                    return null;
                }).filter(Boolean);

                if (!bWithinDefaultDepth && !bOnPath && !bSelected && !aChildren.length) {
                    return null;
                }

                return Object.assign({}, oNode, {
                    selectedPath: bOnPath,
                    children: aChildren
                });
            }

            return (aTreeRows || []).map(function (oRootNode) {
                return cloneNode(oRootNode, 0);
            }).filter(Boolean);
        },

        _buildOrgNetworkGraphData: function (aTreeRows, sSelectedId, oOptionMap, aBudgetRows) {
            var aNodes = [];
            var aLines = [];
            var mNodeSeen = {};
            var mLineSeen = {};
            var sNormalizedSelectedId = this.service.normalizeNodeId(sSelectedId);

            function nodeDepthIcon(oNode, iDepth) {
                var sNodeId = this.service.normalizeNodeId(oNode && oNode.childId);
                var sNodeType = this.service.clean(oNode && oNode.nodeType).toUpperCase();

                if (iDepth === 0) {
                    return "sap-icon://business-objects-experience";
                }
                if (sNodeId.indexOf("CC_") === 0 || sNodeType.indexOf("COST") > -1) {
                    return "sap-icon://factory";
                }
                if (iDepth === 1) {
                    return "sap-icon://building";
                }
                if (iDepth === 2) {
                    return "sap-icon://org-chart";
                }
                return "sap-icon://group";
            }

            function nodeStatus(sNodeId, fActualAmount, bHasBudget, fBudgetAmount) {
                if (sNodeId === sNormalizedSelectedId) {
                    return "selected";
                }
                if (bHasBudget && fActualAmount > fBudgetAmount) {
                    return "overBudget";
                }
                if (Math.abs(fActualAmount || 0) > 0) {
                    return "actual";
                }
                return "empty";
            }

            function pushNode(oNode, iDepth) {
                var sNodeId = this.service.normalizeNodeId(oNode && oNode.childId);
                var oOption = oOptionMap[sNodeId] || oNode || {};
                var aNodeBudgetRows = this.service.filterByOrg(aBudgetRows || [], "Kostl", oOption);
                var bHasBudget = aNodeBudgetRows.length > 0;
                var fBudgetAmount = bHasBudget ? this.service.sum(aNodeBudgetRows, "BudgetAmt") : null;
                var fActualAmount = Number(oNode && oNode.amount || 0);
                var sStatus = nodeStatus.call(this, sNodeId, fActualAmount, bHasBudget, fBudgetAmount);
                var sAmountText = this.formatter.compactAmount(fActualAmount) + " KRW";
                var sBudgetText = bHasBudget ? this.formatter.compactAmount(fBudgetAmount) + " KRW" : "-";
                var sDescription = "이번달 " + sAmountText + " · 예산 " + sBudgetText;

                if (!sNodeId || mNodeSeen[sNodeId]) {
                    return;
                }

                mNodeSeen[sNodeId] = true;
                aNodes.push({
                    key: sNodeId,
                    title: oNode.nodeText || sNodeId || "-",
                    description: sDescription,
                    icon: nodeDepthIcon.call(this, oNode, iDepth),
                    status: sStatus,
                    selected: sNodeId === sNormalizedSelectedId,
                    depth: iDepth,
                    expandable: (oNode.children || []).length > 0,
                    attributes: []
                });
            }

            function walk(oNode, sParentId, iDepth) {
                var sNodeId = this.service.normalizeNodeId(oNode && oNode.childId);
                var sLineKey;

                if (!oNode || !sNodeId) {
                    return;
                }

                pushNode.call(this, oNode, iDepth);

                if (sParentId) {
                    sLineKey = sParentId + "->" + sNodeId;
                    if (!mLineSeen[sLineKey]) {
                        mLineSeen[sLineKey] = true;
                        aLines.push({
                            from: sParentId,
                            to: sNodeId,
                            title: (oOptionMap[sParentId] && oOptionMap[sParentId].nodeText || sParentId) + " → " + (oNode.nodeText || sNodeId),
                            description: this.formatter.compactAmount(Number(oNode.amount || 0)) + " KRW",
                            status: oNode.selectedPath ? "path" : "treeLine"
                        });
                    }
                }

                (oNode.children || []).forEach(function (oChildNode) {
                    walk.call(this, oChildNode, sNodeId, iDepth + 1);
                }.bind(this));
            }

            (aTreeRows || []).forEach(function (oRootNode) {
                walk.call(this, oRootNode, "", 0);
            }.bind(this));

            return {
                noData: !aNodes.length,
                nodes: aNodes,
                lines: aLines
            };
        },

        _buildOrgChartHtml: function (aTreeRows, sSelectedId, oOptionMap, aBudgetRows) {
            var oLayout = this._layoutOrgChart(aTreeRows);
            var sLinks = "";
            var sNodes = "";
            var sNormalizedSelectedId = this.service.normalizeNodeId(sSelectedId);

            if (!oLayout.nodes.length) {
                return "<div class=\"ze4SvgEmptyState\">표시할 데이터가 없습니다.</div>";
            }

            oLayout.links.forEach(function (oLink) {
                var iFromX = oLink.from.x + oLayout.nodeWidth / 2;
                var iFromY = oLink.from.y + oLayout.nodeHeight;
                var iToX = oLink.to.x + oLayout.nodeWidth / 2;
                var iToY = oLink.to.y;
                var iMidY = iFromY + (iToY - iFromY) / 2;
                var sPath = "M " + iFromX + " " + iFromY +
                    " V " + iMidY +
                    " H " + iToX +
                    " V " + iToY;
                var sLinkClass = "ze4OrgChartLink" + (oLink.to.node && oLink.to.node.selectedPath ? " ze4OrgChartLinkSelectedPath" : "");

                sLinks += "<path class=\"" + sLinkClass + "\" d=\"" + sPath + "\" />";
            });

            oLayout.nodes.forEach(function (oLayoutNode) {
                var oNode = oLayoutNode.node;
                var sNodeId = this.service.normalizeNodeId(oNode.childId);
                var oOption = oOptionMap[sNodeId] || oNode;
                var aNodeBudgetRows = this.service.filterByOrg(aBudgetRows || [], "Kostl", oOption);
                var bHasBudget = aNodeBudgetRows.length > 0;
                var fBudgetAmount = bHasBudget ? this.service.sum(aNodeBudgetRows, "BudgetAmt") : null;
                var fActualAmount = Number(oNode.amount || 0);
                var fVariance = bHasBudget ? fActualAmount - fBudgetAmount : null;
                var sClass = "ze4OrgChartNode" +
                    (oNode.selectedPath ? " ze4OrgChartNodePath" : "") +
                    (sNodeId === sNormalizedSelectedId ? " ze4OrgChartNodeSelected" : "");
                var sName = this._truncateText(oNode.nodeText || sNodeId || "-", 18);
                var sActual = this.formatter.compactAmount(fActualAmount) + " KRW";
                var sBudget = bHasBudget ?
                    "예산 " + this.formatter.compactAmount(fBudgetAmount) + " / 차이 " + this.formatter.compactAmount(fVariance) :
                    "예산 -";
                var iTextLeft = oLayoutNode.x + 18;
                var iTextRight = oLayoutNode.x + oLayout.nodeWidth - 16;
                var sAccentClass = "ze4OrgChartNodeAccent" + (sNodeId === sNormalizedSelectedId ? " ze4OrgChartNodeAccentSelected" : "");

                sNodes += "<g class=\"" + sClass + "\" data-org-id=\"" + this._escapeHtml(sNodeId) + "\" tabindex=\"0\">" +
                    "<rect class=\"ze4OrgChartNodeRect\" x=\"" + oLayoutNode.x + "\" y=\"" + oLayoutNode.y + "\" width=\"" + oLayout.nodeWidth + "\" height=\"" + oLayout.nodeHeight + "\" rx=\"10\" />" +
                    "<rect class=\"" + sAccentClass + "\" x=\"" + oLayoutNode.x + "\" y=\"" + oLayoutNode.y + "\" width=\"5\" height=\"" + oLayout.nodeHeight + "\" rx=\"3\" />" +
                    "<text class=\"ze4OrgChartNodeTitle\" x=\"" + iTextLeft + "\" y=\"" + (oLayoutNode.y + 28) + "\">" + this._escapeHtml(sName) + "</text>" +
                    "<text class=\"ze4OrgChartNodeAmount\" x=\"" + iTextRight + "\" y=\"" + (oLayoutNode.y + 28) + "\" text-anchor=\"end\">" + this._escapeHtml(sActual) + "</text>" +
                    "<text class=\"ze4OrgChartNodeMeta\" x=\"" + iTextLeft + "\" y=\"" + (oLayoutNode.y + 52) + "\">" + this._escapeHtml(sNodeId || "-") + "</text>" +
                    "<text class=\"ze4OrgChartNodeBudget\" x=\"" + iTextLeft + "\" y=\"" + (oLayoutNode.y + 75) + "\">" + this._escapeHtml(this._truncateText(sBudget, 30)) + "</text>" +
                    "<title>" + this._escapeHtml((oNode.nodeText || sNodeId || "-") + " / " + sActual + " / " + sBudget) + "</title>" +
                    "</g>";
            }.bind(this));

            return "<div class=\"ze4OrgChartWrap\"><svg class=\"ze4OrgChartSvg\" viewBox=\"0 0 " + oLayout.width + " " + oLayout.height +
                "\" width=\"" + oLayout.width + "\" height=\"" + oLayout.height + "\" role=\"img\">" + sLinks + sNodes + "</svg></div>";
        },

        _layoutOrgChart: function (aTreeRows) {
            var iLeafIndex = 0;
            var iMaxDepth = 0;
            var iLeft = 32;
            var iTop = 32;
            var iGapX = 270;
            var iGapY = 126;
            var iNodeWidth = 226;
            var iNodeHeight = 88;
            var aNodes = [];
            var aLinks = [];

            function layoutNode(oNode, iDepth) {
                var aChildLayouts = (oNode.children || []).map(function (oChildNode) {
                    return layoutNode(oChildNode, iDepth + 1);
                });
                var iX;
                var iY = iTop + iDepth * iGapY;
                var oLayoutNode;

                iMaxDepth = Math.max(iMaxDepth, iDepth);

                if (aChildLayouts.length) {
                    iX = aChildLayouts.reduce(function (iTotal, oChildLayout) {
                        return iTotal + oChildLayout.x;
                    }, 0) / aChildLayouts.length;
                } else {
                    iX = iLeft + iLeafIndex * iGapX;
                    iLeafIndex += 1;
                }

                oLayoutNode = {
                    node: oNode,
                    x: Math.round(iX),
                    y: iY
                };

                aNodes.push(oLayoutNode);
                aChildLayouts.forEach(function (oChildLayout) {
                    aLinks.push({
                        from: oLayoutNode,
                        to: oChildLayout
                    });
                });

                return oLayoutNode;
            }

            (aTreeRows || []).forEach(function (oRootNode) {
                layoutNode(oRootNode, 0);
            });

            return {
                nodes: aNodes,
                links: aLinks,
                nodeWidth: iNodeWidth,
                nodeHeight: iNodeHeight,
                width: Math.max(940, iLeft * 2 + Math.max(1, iLeafIndex - 1) * iGapX + iNodeWidth),
                height: Math.max(380, iTop * 2 + (iMaxDepth + 1) * iGapY + iNodeHeight)
            };
        },

        _bindOrgChartEvents: function () {
            var oHtml = this.byId("orgChartHtml");
            var oDomRef = oHtml && oHtml.getDomRef();

            if (!oDomRef) {
                return;
            }

            Array.prototype.forEach.call(oDomRef.querySelectorAll("[data-org-id]"), function (oElement) {
                oElement.onclick = function (oEvent) {
                    oEvent.preventDefault();
                    oEvent.stopPropagation();
                    this._captureOrgChartScroll();
                    this._applyOrgData(oElement.getAttribute("data-org-id"));
                }.bind(this);
                oElement.onkeydown = function (oEvent) {
                    if (oEvent.key === "Enter" || oEvent.key === " ") {
                        oEvent.preventDefault();
                        oEvent.stopPropagation();
                        this._captureOrgChartScroll();
                        this._applyOrgData(oElement.getAttribute("data-org-id"));
                    }
                }.bind(this);
            }.bind(this));
        },

        _captureOrgChartScroll: function () {
            var oHtml = this.byId("orgChartHtml");
            var oDomRef = oHtml && oHtml.getDomRef();
            var oWrap = oDomRef && oDomRef.querySelector(".ze4OrgChartWrap");

            this._orgChartScrollLeft = oWrap ? oWrap.scrollLeft : 0;
            this._orgChartScrollTop = oWrap ? oWrap.scrollTop : 0;
            this._orgChartPreserveScroll = true;
        },

        _restoreOrgChartScroll: function () {
            var oHtml = this.byId("orgChartHtml");
            var oDomRef = oHtml && oHtml.getDomRef();
            var oWrap = oDomRef && oDomRef.querySelector(".ze4OrgChartWrap");

            if (!oWrap || !this._orgChartPreserveScroll || this._orgChartScrollLeft === undefined) {
                return;
            }

            oWrap.scrollLeft = this._orgChartScrollLeft;
            oWrap.scrollTop = this._orgChartScrollTop || 0;
            this._orgChartPreserveScroll = false;
        },

        _truncateText: function (sText, iMaxLength) {
            var sValue = this.service.clean(sText);

            if (sValue.length <= iMaxLength) {
                return sValue;
            }

            return sValue.slice(0, Math.max(0, iMaxLength - 1)) + "…";
        },

        _escapeHtml: function (vValue) {
            return String(vValue === null || vValue === undefined ? "" : vValue)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        },

        onCompositionChartSelectData: function (oEvent) {
            var oModel = this.getView().getModel("org");
            var sAccountText = this.extractVizDataValue(oEvent, "계정명");
            var aCompositionRows = oModel.getProperty("/accountComposition") || [];
            var oSummary = this.buildSelectedAccountSummary(sAccountText, aCompositionRows);

            oModel.setProperty("/selectedAccountKey", sAccountText);
            oModel.setProperty("/selectedAccountSummary", oSummary || {});
            oModel.setProperty("/hasSelectedAccountSummary", !!oSummary);
        },

        onOrgGraphSelectionChange: function (oEvent) {
            var aItems = oEvent.getParameter("items") || [];
            var oItem = aItems[0];
            var sNodeId = "";

            if (!oItem) {
                return;
            }

            if (oItem.getTo) {
                sNodeId = oItem.getTo();
            } else if (oItem.getKey) {
                sNodeId = oItem.getKey();
            }

            this._selectOrgGraphNode(sNodeId);
        },

        onOrgGraphNodePress: function (oEvent) {
            var oSource = oEvent.getSource();
            var sNodeId = oSource && oSource.getKey ? oSource.getKey() : "";

            this._selectOrgGraphNode(sNodeId);
        },

        _selectOrgGraphNode: function (sNodeId) {
            var oModel = this.getView().getModel("org");
            var sCurrentSelectedId = oModel.getProperty("/selectedOrg/childId");
            var sNormalizedNodeId = this.service.normalizeNodeId(sNodeId);

            if (!sNormalizedNodeId) {
                return;
            }

            if (sNormalizedNodeId === sCurrentSelectedId) {
                this._scrollOrgGraphToNode(sNormalizedNodeId);
                return;
            }

            this._applyOrgData(sNormalizedNodeId);
        },

        onOrgGraphReady: function () {
            var oModel = this.getView().getModel("org");

            this._scrollOrgGraphToNode(oModel.getProperty("/selectedOrg/childId"));
        },

        _scrollOrgGraphToNode: function (sNodeId) {
            var oGraph = this.byId("orgNetworkGraph");
            var sNormalizedNodeId = this.service.normalizeNodeId(sNodeId);

            if (!oGraph || !sNormalizedNodeId || !oGraph.getNodeByKey) {
                return;
            }

            [80, 260].forEach(function (iDelay) {
                setTimeout(function () {
                    var oNode;
                    var oNodeDomRef;
                    var oGraphDomRef;
                    var oScroller;

                    try {
                        oNode = oGraph.getNodeByKey(sNormalizedNodeId);
                        oNodeDomRef = oNode && oNode.getDomRef && oNode.getDomRef();
                        oGraphDomRef = oGraph.getDomRef && oGraph.getDomRef();
                        oScroller = this._findGraphScrollContainer(oGraphDomRef);

                        if (!oScroller) {
                            return;
                        }

                        if (oNodeDomRef) {
                            this._centerGraphElement(oScroller, oNodeDomRef, sNormalizedNodeId, oGraphDomRef);
                        } else {
                            this._centerGraphCanvas(oScroller);
                        }
                    } catch (oError) {
                        // NetworkGraph may not be fully laid out during the first rendering pass.
                    }
                }.bind(this), iDelay);
            }.bind(this));
        },

        _findGraphScrollContainer: function (oGraphDomRef) {
            var aCandidates;
            var oBestCandidate = null;
            var iBestOverflow = 0;

            if (!oGraphDomRef) {
                return null;
            }

            aCandidates = [oGraphDomRef].concat(Array.prototype.slice.call(oGraphDomRef.querySelectorAll("*")));
            aCandidates.forEach(function (oElement) {
                var iHorizontalOverflow;
                var iVerticalOverflow;
                var iOverflow;

                if (!oElement || oElement.clientWidth < 160 || oElement.clientHeight < 120) {
                    return;
                }

                iHorizontalOverflow = Math.max(0, oElement.scrollWidth - oElement.clientWidth);
                iVerticalOverflow = Math.max(0, oElement.scrollHeight - oElement.clientHeight);
                iOverflow = iHorizontalOverflow + iVerticalOverflow;

                if (iOverflow > iBestOverflow) {
                    iBestOverflow = iOverflow;
                    oBestCandidate = oElement;
                }
            });

            return oBestCandidate || oGraphDomRef;
        },

        _centerGraphElement: function (oScroller, oElement, sNodeId, oGraphDomRef) {
            var oScrollerRect = oScroller.getBoundingClientRect();
            var oElementRect = oElement.getBoundingClientRect();
            var fLeft = this._getGraphNodeGroupCenterLeft(oScroller, oGraphDomRef);
            var fTop;

            if (fLeft === null) {
                fLeft = oScroller.scrollLeft + (oElementRect.left - oScrollerRect.left) + oElementRect.width / 2 - oScroller.clientWidth / 2;
            }

            if (this._isRootNetworkNode(sNodeId)) {
                fTop = 0;
            } else {
                fTop = oScroller.scrollTop + (oElementRect.top - oScrollerRect.top) + oElementRect.height / 2 - oScroller.clientHeight * 0.44;
            }

            this._setGraphScrollPosition(oScroller, fLeft, fTop);
        },

        _centerGraphCanvas: function (oScroller) {
            this._setGraphScrollPosition(oScroller, (oScroller.scrollWidth - oScroller.clientWidth) / 2, 0);
        },

        _getGraphNodeGroupCenterLeft: function (oScroller, oGraphDomRef) {
            var oScrollerRect;
            var aNodeRefs;
            var fMinLeft = Infinity;
            var fMaxRight = -Infinity;

            if (!oScroller || !oGraphDomRef || !oGraphDomRef.querySelectorAll) {
                return null;
            }

            oScrollerRect = oScroller.getBoundingClientRect();
            aNodeRefs = Array.prototype.slice.call(
                oGraphDomRef.querySelectorAll(".sapSuiteUiCommonsNetworkGraphDivNode")
            ).filter(function (oNodeRef) {
                return oNodeRef && oNodeRef.offsetWidth > 0 && oNodeRef.offsetHeight > 0;
            });

            if (!aNodeRefs.length) {
                return null;
            }

            aNodeRefs.forEach(function (oNodeRef) {
                var oRect = oNodeRef.getBoundingClientRect();

                fMinLeft = Math.min(fMinLeft, oRect.left);
                fMaxRight = Math.max(fMaxRight, oRect.right);
            });

            if (!isFinite(fMinLeft) || !isFinite(fMaxRight)) {
                return null;
            }

            return oScroller.scrollLeft + ((fMinLeft + fMaxRight) / 2 - oScrollerRect.left) - oScroller.clientWidth / 2;
        },

        _setGraphScrollPosition: function (oScroller, fLeft, fTop) {
            var iLeft = Math.max(0, Math.round(fLeft));
            var iTop = Math.max(0, Math.round(fTop));

            if (oScroller.scrollTo) {
                oScroller.scrollTo({
                    left: iLeft,
                    top: iTop,
                    behavior: "smooth"
                });
                return;
            }

            oScroller.scrollLeft = iLeft;
            oScroller.scrollTop = iTop;
        },

        _isRootNetworkNode: function (sNodeId) {
            var oModel = this.getView().getModel("org");
            var sNormalizedNodeId = this.service.normalizeNodeId(sNodeId);
            var aNodes = oModel.getProperty("/networkGraph/nodes") || [];
            var oNode = aNodes.find(function (oCandidate) {
                return oCandidate.key === sNormalizedNodeId;
            });

            return !oNode || Number(oNode.depth || 0) === 0;
        },

        onOrgTreeRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();

            if (oRow && oRow.childId) {
                this._applyOrgData(oRow.childId);
            }
        },

        onChildRowSelection: function (oEvent) {
            var oContext = oEvent.getParameter("rowContext");
            var oRow = oContext && oContext.getObject();

            if (oRow && oRow.code && oRow.code !== "-") {
                this.navToDepartment(oRow.code);
            }
        }
    });
});
