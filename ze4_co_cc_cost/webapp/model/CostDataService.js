sap.ui.define([
    "sap/ui/thirdparty/jquery"
], function (jQuery) {
    "use strict";

    var SAP_CLIENT = "100";
    var SAP_LANGUAGE = "KO";
    var BUDGET_VERSION = "BUD";
    var CURRENCY = "KRW";
    var MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    var SERVICE_URLS = {
        actual: "/sap/opu/odata/sap/ZCDS_E4_CO_0023_CDS/",
        hierarchy: "/sap/opu/odata/sap/ZCDS_E4_CO_0024_CDS/",
        budget: "/sap/opu/odata/sap/ZCDS_E4_CO_0025_CDS/",
        document: "/sap/opu/odata/sap/ZCDS_E4_CO_0026_CDS/",
        allocationRule: "/sap/opu/odata/sap/ZCDS_E4_CO_0031_CDS/",
        allocationResult: "/sap/opu/odata/sap/ZCDS_E4_CO_0032_CDS/"
    };
    var FALLBACK_ENTITY_SETS = {
        actual: "zcds_e4_co_0023",
        hierarchy: "zcds_e4_co_0024",
        budget: "zcds_e4_co_0025",
        document: "zcds_e4_co_0026",
        allocationRule: "",
        allocationResult: ""
    };

    var mEntitySets = Object.assign({}, FALLBACK_ENTITY_SETS);
    var oInitPromise;

    function clean(vValue) {
        if (vValue === null || vValue === undefined) {
            return "";
        }

        return String(vValue).trim();
    }

    function normalizeMonth(vMonth) {
        var sMonth = clean(vMonth);

        return sMonth ? sMonth.padStart(2, "0") : "";
    }

    function normalizeNodeId(vValue) {
        return clean(vValue).toUpperCase();
    }

    function toNumber(vValue) {
        var fValue = Number(vValue);

        return isNaN(fValue) ? 0 : fValue;
    }

    function isUsableTextForCode(sText, sCode) {
        var sCleanText = clean(sText);
        var sCleanCode = normalizeNodeId(sCode);

        return !!sCleanText && (!sCleanCode || normalizeNodeId(sCleanText) !== sCleanCode);
    }

    function getField(oRow, sFieldName) {
        var sTargetFieldName = String(sFieldName || "").toLowerCase();
        var sMatchedKey;

        if (!oRow) {
            return undefined;
        }

        if (Object.prototype.hasOwnProperty.call(oRow, sFieldName)) {
            return oRow[sFieldName];
        }

        sMatchedKey = Object.keys(oRow).find(function (sKey) {
            return sKey.toLowerCase() === sTargetFieldName;
        });

        return sMatchedKey ? oRow[sMatchedKey] : undefined;
    }

    function sum(aRows, sFieldName) {
        return (aRows || []).reduce(function (fTotal, oRow) {
            return fTotal + toNumber(getField(oRow, sFieldName));
        }, 0);
    }

    function buildCostCenterTextMaps(aHierarchyRows, aActualRows, aDocumentRows) {
        var mHierarchyTexts = {};
        var mHierarchyManagers = {};
        var mActualTexts = {};
        var mDocumentTexts = {};

        (aHierarchyRows || []).forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));
            var sText = clean(getField(oRow, "node_text"));
            var sManager = clean(getField(oRow, "verak"));

            if (sChildId && isUsableTextForCode(sText, sChildId)) {
                mHierarchyTexts[sChildId] = sText;
            }

            if (sChildId && sManager) {
                mHierarchyManagers[sChildId] = sManager;
            }
        });

        (aActualRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));
            var sText = clean(getField(oRow, "kostl_txt"));

            if (sKostl && isUsableTextForCode(sText, sKostl)) {
                mActualTexts[sKostl] = sText;
            }
        });

        (aDocumentRows || []).forEach(function (oRow) {
            var aPairs = [
                [getField(oRow, "Kostl"), getField(oRow, "KostlTxt")],
                [getField(oRow, "SenderKostl"), getField(oRow, "SenderKostlTxt")],
                [getField(oRow, "ReceiverKostl"), getField(oRow, "ReceiverKostlTxt")]
            ];

            aPairs.forEach(function (aPair) {
                var sKostl = normalizeNodeId(aPair[0]);
                var sText = clean(aPair[1]);

                if (sKostl && isUsableTextForCode(sText, sKostl)) {
                    mDocumentTexts[sKostl] = sText;
                }
            });
        });

        return {
            hierarchyTexts: mHierarchyTexts,
            hierarchyManagers: mHierarchyManagers,
            actualTexts: mActualTexts,
            documentTexts: mDocumentTexts
        };
    }

    function resolveCostCenterText(sKostl, sDirectText, oTextMaps) {
        var sCode = normalizeNodeId(sKostl);
        var oMaps = oTextMaps || {};

        if (isUsableTextForCode(sDirectText, sCode)) {
            return clean(sDirectText);
        }

        return (oMaps.hierarchyTexts && oMaps.hierarchyTexts[sCode]) ||
            (oMaps.documentTexts && oMaps.documentTexts[sCode]) ||
            (oMaps.actualTexts && oMaps.actualTexts[sCode]) ||
            "-";
    }

    function escapeODataString(sValue) {
        return String(sValue).replace(/'/g, "''");
    }

    function addEqFilterPart(aFilterParts, sFieldName, sValue) {
        var sCleanValue = clean(sValue);

        if (sCleanValue) {
            aFilterParts.push(sFieldName + " eq '" + escapeODataString(sCleanValue) + "'");
        }
    }

    function addLeFilterPart(aFilterParts, sFieldName, sValue) {
        var sCleanValue = clean(sValue);

        if (sCleanValue) {
            aFilterParts.push(sFieldName + " le '" + escapeODataString(sCleanValue) + "'");
        }
    }

    function createBaseRequestData() {
        return {
            "$format": "json",
            "sap-client": SAP_CLIENT,
            "sap-language": SAP_LANGUAGE
        };
    }

    function createMetadataRequestData() {
        return {
            "sap-client": SAP_CLIENT,
            "sap-language": SAP_LANGUAGE
        };
    }

    function createRequestDataWithFilter(aFilterParts) {
        var oRequestData = createBaseRequestData();

        if (aFilterParts && aFilterParts.length) {
            oRequestData.$filter = aFilterParts.join(" and ");
        }

        return oRequestData;
    }

    function normalizeEntityName(sValue) {
        return String(sValue || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function readODataJson(sUrl, oData) {
        return jQuery.ajax({
            url: sUrl,
            method: "GET",
            dataType: "json",
            data: oData,
            headers: {
                "Accept": "application/json"
            }
        }).then(function (oResponse) {
            if (oResponse && oResponse.d && Array.isArray(oResponse.d.results)) {
                return oResponse.d.results;
            }

            if (oResponse && Array.isArray(oResponse.results)) {
                return oResponse.results;
            }

            return [];
        });
    }

    function resolveEntitySet(sServiceUrl, sToken, sFallback) {
        return jQuery.ajax({
            url: sServiceUrl + "$metadata",
            method: "GET",
            dataType: "xml",
            data: createMetadataRequestData(),
            headers: {
                "Cache-Control": "no-cache",
                "Pragma": "no-cache"
            }
        }).then(function (oMetadata) {
            var aEntitySets = Array.prototype.slice.call(oMetadata.getElementsByTagNameNS("*", "EntitySet"));
            var sNormalizedToken = normalizeEntityName(sToken);
            var oMatchedEntitySet = aEntitySets.find(function (oEntitySet) {
                var sName = normalizeEntityName(oEntitySet.getAttribute("Name") || "");
                var sType = normalizeEntityName(oEntitySet.getAttribute("EntityType") || "");

                return sName.indexOf(sNormalizedToken) > -1 || sType.indexOf(sNormalizedToken) > -1;
            });

            return oMatchedEntitySet ? oMatchedEntitySet.getAttribute("Name") : sFallback;
        }, function () {
            return sFallback;
        });
    }

    function init(bForceRefresh) {
        if (bForceRefresh) {
            oInitPromise = null;
            mEntitySets = Object.assign({}, FALLBACK_ENTITY_SETS);
        }

        if (!oInitPromise) {
            oInitPromise = Promise.all([
                resolveEntitySet(SERVICE_URLS.actual, "zcdse4co0023", FALLBACK_ENTITY_SETS.actual),
                resolveEntitySet(SERVICE_URLS.hierarchy, "zcdse4co0024", FALLBACK_ENTITY_SETS.hierarchy),
                resolveEntitySet(SERVICE_URLS.budget, "zcdse4co0025", FALLBACK_ENTITY_SETS.budget),
                resolveEntitySet(SERVICE_URLS.document, "zcdse4co0026", FALLBACK_ENTITY_SETS.document),
                resolveEntitySet(SERVICE_URLS.allocationRule, "zcdse4co0031", FALLBACK_ENTITY_SETS.allocationRule),
                resolveEntitySet(SERVICE_URLS.allocationResult, "zcdse4co0032", FALLBACK_ENTITY_SETS.allocationResult)
            ]).then(function (aEntitySets) {
                mEntitySets.actual = aEntitySets[0] || FALLBACK_ENTITY_SETS.actual;
                mEntitySets.hierarchy = aEntitySets[1] || FALLBACK_ENTITY_SETS.hierarchy;
                mEntitySets.budget = aEntitySets[2] || FALLBACK_ENTITY_SETS.budget;
                mEntitySets.document = aEntitySets[3] || FALLBACK_ENTITY_SETS.document;
                mEntitySets.allocationRule = aEntitySets[4] || FALLBACK_ENTITY_SETS.allocationRule;
                mEntitySets.allocationResult = aEntitySets[5] || FALLBACK_ENTITY_SETS.allocationResult;
                return mEntitySets;
            });
        }

        return oInitPromise;
    }

    function refreshMetadata() {
        return init(true);
    }

    function defaultFilters() {
        var oToday = new Date();
        var oRequestData = createBaseRequestData();

        oRequestData.$top = 1;
        oRequestData.$filter = "bukrs eq '0001'";
        oRequestData.$orderby = "gjahr desc,monat desc";

        return readODataJson(SERVICE_URLS.actual + mEntitySets.actual, oRequestData).then(function (aRows) {
            var oFirstRow = aRows && aRows[0];

            return {
                bukrs: "0001",
                gjahr: clean(oFirstRow && oFirstRow.gjahr) || String(oToday.getFullYear()),
                period: normalizeMonth(clean(oFirstRow && oFirstRow.monat) || String(oToday.getMonth() + 1)),
                orgNodeId: "",
                orgNodeText: "",
                waers: CURRENCY,
                budgetVersion: BUDGET_VERSION
            };
        }, function () {
            return {
                bukrs: "0001",
                gjahr: String(oToday.getFullYear()),
                period: normalizeMonth(String(oToday.getMonth() + 1)),
                orgNodeId: "",
                orgNodeText: "",
                waers: CURRENCY,
                budgetVersion: BUDGET_VERSION
            };
        });
    }

    function readActualRows(oFilters) {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "bukrs", "0001");
        addEqFilterPart(aFilterParts, "gjahr", oFilters.gjahr);

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.actual + mEntitySets.actual, oRequestData);
    }

    function readPreviousYearRows(oFilters) {
        var aFilterParts = [];
        var oRequestData;

        if (oFilters.period !== "01") {
            return Promise.resolve([]);
        }

        addEqFilterPart(aFilterParts, "bukrs", "0001");
        addEqFilterPart(aFilterParts, "gjahr", String(Number(oFilters.gjahr) - 1));
        addEqFilterPart(aFilterParts, "monat", "12");

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.actual + mEntitySets.actual, oRequestData);
    }

    function readBudgetRows(oFilters) {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "Bukrs", "0001");
        addEqFilterPart(aFilterParts, "Gjahr", oFilters.gjahr);
        addEqFilterPart(aFilterParts, "Versn", BUDGET_VERSION);

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.budget + mEntitySets.budget, oRequestData);
    }

    function readHierarchyRows() {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "setnam", "CCSH1000");
        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.hierarchy + mEntitySets.hierarchy, oRequestData);
    }

    function readDocumentRows(oFilters, bDetailMode) {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "Bukrs", "0001");
        addEqFilterPart(aFilterParts, "Gjahr", oFilters.gjahr);
        if (bDetailMode) {
            addEqFilterPart(aFilterParts, "Monat", normalizeMonth(oFilters.period));
        } else {
            addLeFilterPart(aFilterParts, "Monat", normalizeMonth(oFilters.period));
        }

        if (oFilters.saknr) {
            addEqFilterPart(aFilterParts, "Saknr", oFilters.saknr);
        }

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = bDetailMode ? 20000 : 10000;

        if (!bDetailMode) {
            oRequestData.$select = "Bukrs,Gjahr,Belnr,Monat,Kostl,Saknr,Amount";
        }

        return readODataJson(SERVICE_URLS.document + mEntitySets.document, oRequestData);
    }

    function readAllocationRuleRows() {
        var oRequestData = createBaseRequestData();

        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.allocationRule + mEntitySets.allocationRule, oRequestData);
    }

    function readAllocationResultRows(oFilters, bExactPeriod) {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "Bukrs", "0001");
        addEqFilterPart(aFilterParts, "Gjahr", oFilters.gjahr);

        if (bExactPeriod) {
            addEqFilterPart(aFilterParts, "Monat", normalizeMonth(oFilters.period));
        }

        addEqFilterPart(aFilterParts, "Cycle", oFilters.cycle);
        addEqFilterPart(aFilterParts, "SenderKostl", oFilters.senderKostl);
        addEqFilterPart(aFilterParts, "ReceiverKostl", oFilters.receiverKostl);
        addEqFilterPart(aFilterParts, "SkfId", oFilters.skfId);

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = bExactPeriod ? 10000 : 20000;
        oRequestData.$orderby = "Budat desc,Belnr desc";

        return readODataJson(SERVICE_URLS.allocationResult + mEntitySets.allocationResult, oRequestData);
    }

    function readAllocationRows(oFilters) {
        return readAllocationResultRows(oFilters || {}, false);
    }

    function buildChildrenMap(aHierarchyRows) {
        var mChildrenByParent = {};

        (aHierarchyRows || []).forEach(function (oRow) {
            var sParentId = normalizeNodeId(getField(oRow, "parent_id"));

            if (!mChildrenByParent[sParentId]) {
                mChildrenByParent[sParentId] = [];
            }

            mChildrenByParent[sParentId].push(oRow);
        });

        return mChildrenByParent;
    }

    function getDescendantIds(sSelectedChildId, mChildrenByParent) {
        var aResult = [];
        var mVisited = {};

        function walk(sCurrentId) {
            var sNormalizedId = normalizeNodeId(sCurrentId);
            var aChildren;

            if (!sNormalizedId || mVisited[sNormalizedId]) {
                return;
            }

            mVisited[sNormalizedId] = true;
            aResult.push(sNormalizedId);
            aChildren = mChildrenByParent[sNormalizedId] || [];
            aChildren.forEach(function (oChildRow) {
                walk(getField(oChildRow, "child_id"));
            });
        }

        walk(sSelectedChildId);

        return aResult;
    }

    function orderHierarchyRows(aHierarchyRows, mChildrenByParent) {
        var aRows = aHierarchyRows || [];
        var mChildIds = {};
        var mVisited = {};
        var aOrderedRows = [];

        function sortRows(aRowsToSort) {
            return (aRowsToSort || []).sort(function (oFirst, oSecond) {
                var sFirstType = clean(getField(oFirst, "node_type"));
                var sSecondType = clean(getField(oSecond, "node_type"));
                var iFirstTypeOrder = sFirstType === "L" ? 1 : 0;
                var iSecondTypeOrder = sSecondType === "L" ? 1 : 0;

                return Number(getField(oFirst, "hlevel") || 0) - Number(getField(oSecond, "hlevel") || 0) ||
                    iFirstTypeOrder - iSecondTypeOrder ||
                    clean(getField(oFirst, "node_text")).localeCompare(clean(getField(oSecond, "node_text")), "ko") ||
                    normalizeNodeId(getField(oFirst, "child_id")).localeCompare(normalizeNodeId(getField(oSecond, "child_id")));
            });
        }

        function pushRow(oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));

            if (!sChildId || mVisited[sChildId]) {
                return;
            }

            mVisited[sChildId] = true;
            aOrderedRows.push(oRow);
            sortRows(mChildrenByParent[sChildId]).forEach(pushRow);
        }

        aRows.forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));

            if (sChildId) {
                mChildIds[sChildId] = true;
            }
        });

        sortRows(mChildrenByParent[""] || aRows.filter(function (oRow) {
            var sParentId = normalizeNodeId(getField(oRow, "parent_id"));

            return !sParentId || !mChildIds[sParentId];
        })).forEach(pushRow);
        aRows.forEach(pushRow);

        return aOrderedRows;
    }

    function mapHierarchyRowToOption(oRow, mChildrenByParent) {
        var sChildId = normalizeNodeId(getField(oRow, "child_id"));
        var iLevel = Math.max(0, Number(getField(oRow, "hlevel") || 1) - 1);
        var sNodeText = clean(getField(oRow, "node_text")) || sChildId;
        var sNodeType = clean(getField(oRow, "node_type"));
        var aChildren = mChildrenByParent && mChildrenByParent[sChildId] || [];

        return {
            childId: sChildId,
            nodeText: sNodeText,
            hlevel: iLevel,
            levelText: "L" + (iLevel + 1),
            nodeType: sNodeType,
            icon: sNodeType === "L" ? "sap-icon://org-chart" : "sap-icon://folder-blank",
            iconClass: sNodeType === "L" ? "ze4TreeIconLeaf" : "ze4TreeIconGroup",
            manager: clean(getField(oRow, "verak")) || "-",
            descendantIds: getDescendantIds(sChildId, mChildrenByParent),
            hasChildren: aChildren.length > 0,
            children: []
        };
    }

    function buildHierarchyOptions(aHierarchyRows) {
        var mChildrenByParent = buildChildrenMap(aHierarchyRows);
        var aOrderedRows = orderHierarchyRows(aHierarchyRows, mChildrenByParent);

        return aOrderedRows.map(function (oRow) {
            return mapHierarchyRowToOption(oRow, mChildrenByParent);
        });
    }

    function buildHierarchyOptionTree(aHierarchyRows) {
        var mChildrenByParent = buildChildrenMap(aHierarchyRows);
        var aOrderedRows = orderHierarchyRows(aHierarchyRows, mChildrenByParent);
        var mNodes = {};
        var aRoots = [];
        var mHasParent = {};

        aOrderedRows.forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));

            if (sChildId) {
                mNodes[sChildId] = mapHierarchyRowToOption(oRow, mChildrenByParent);
            }
        });

        aOrderedRows.forEach(function (oRow) {
            var sParentId = normalizeNodeId(getField(oRow, "parent_id"));
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));
            var oNode = mNodes[sChildId];

            if (!oNode) {
                return;
            }

            if (sParentId && mNodes[sParentId]) {
                mNodes[sParentId].children.push(oNode);
                mHasParent[sChildId] = true;
            }
        });

        aOrderedRows.forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));
            var sParentId = normalizeNodeId(getField(oRow, "parent_id"));

            if (mNodes[sChildId] && !mHasParent[sChildId]) {
                aRoots.push(mNodes[sChildId]);
            }
        });

        return aRoots.length ? aRoots : Object.keys(mNodes).map(function (sNodeId) {
            return mNodes[sNodeId];
        });
    }

    function filterHierarchyTree(aTreeRows, sQuery) {
        var sNormalizedQuery = clean(sQuery).toLowerCase();

        function matches(oNode) {
            return clean(oNode.nodeText).toLowerCase().indexOf(sNormalizedQuery) > -1 ||
                clean(oNode.childId).toLowerCase().indexOf(sNormalizedQuery) > -1 ||
                clean(oNode.manager).toLowerCase().indexOf(sNormalizedQuery) > -1;
        }

        function cloneMatched(oNode) {
            var aChildren = (oNode.children || []).map(cloneMatched).filter(Boolean);

            if (!sNormalizedQuery || matches(oNode) || aChildren.length) {
                return Object.assign({}, oNode, {
                    children: aChildren
                });
            }

            return null;
        }

        return (aTreeRows || []).map(cloneMatched).filter(Boolean);
    }

    function getOrgSelection(sOrgId, aHierarchyRows) {
        var aOptions = buildHierarchyOptions(aHierarchyRows);
        var sNormalizedOrgId = normalizeNodeId(sOrgId);
        var oOption = aOptions.find(function (oCandidate) {
            return oCandidate.childId === sNormalizedOrgId;
        });

        if (oOption) {
            return oOption;
        }

        if (sNormalizedOrgId) {
            return {
                childId: sNormalizedOrgId,
                nodeText: sNormalizedOrgId,
                manager: "",
                hlevel: 0,
                descendantIds: [sNormalizedOrgId],
                nodeType: "L"
            };
        }

        return {
            childId: "",
            nodeText: "",
            manager: "",
            hlevel: 0,
            descendantIds: [],
            nodeType: ""
        };
    }

    function buildIdSet(aIds) {
        var mIds = {};

        (aIds || []).forEach(function (sId) {
            mIds[normalizeNodeId(sId)] = true;
        });

        return mIds;
    }

    function filterByOrg(aRows, sFieldName, oSelectedOrg) {
        var aIds = oSelectedOrg && oSelectedOrg.descendantIds || [];
        var mIds = buildIdSet(aIds);

        if (!aIds.length) {
            return aRows || [];
        }

        return (aRows || []).filter(function (oRow) {
            return !!mIds[normalizeNodeId(getField(oRow, sFieldName))];
        });
    }

    function filterByAccount(aRows, sFieldName, sSaknr) {
        var sNormalizedSaknr = normalizeNodeId(sSaknr);

        if (!sNormalizedSaknr) {
            return aRows || [];
        }

        return (aRows || []).filter(function (oRow) {
            return normalizeNodeId(getField(oRow, sFieldName)) === sNormalizedSaknr;
        });
    }

    function distinctDocumentCount(aRows) {
        var mDocuments = {};

        (aRows || []).forEach(function (oRow) {
            var sKey = [getField(oRow, "Bukrs"), getField(oRow, "Gjahr"), getField(oRow, "Belnr")].map(clean).join("|");

            if (sKey !== "||") {
                mDocuments[sKey] = true;
            }
        });

        return Object.keys(mDocuments).length;
    }

    function documentCountsByField(aRows, sFieldName) {
        var mCounts = {};
        var mDocsByGroup = {};

        (aRows || []).forEach(function (oRow) {
            var sGroupKey = normalizeNodeId(getField(oRow, sFieldName));
            var sDocKey = [getField(oRow, "Bukrs"), getField(oRow, "Gjahr"), getField(oRow, "Belnr")].map(clean).join("|");

            if (!sGroupKey || sDocKey === "||") {
                return;
            }

            if (!mDocsByGroup[sGroupKey]) {
                mDocsByGroup[sGroupKey] = {};
            }

            mDocsByGroup[sGroupKey][sDocKey] = true;
        });

        Object.keys(mDocsByGroup).forEach(function (sGroupKey) {
            mCounts[sGroupKey] = Object.keys(mDocsByGroup[sGroupKey]).length;
        });

        return mCounts;
    }

    function documentCountsByMonth(aRows) {
        return documentCountsByField(aRows, "Monat");
    }

    function currentDocumentRows(aRows, sPeriod) {
        var sNormalizedPeriod = normalizeMonth(sPeriod);

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "Monat")) === sNormalizedPeriod;
        });
    }

    function buildAccountValueHelpRows(aDocumentRows) {
        var mAccounts = {};

        (aDocumentRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "Saknr"));
            var sSaknrTxt = clean(getField(oRow, "SaknrTxt")) || "-";
            var sKtoks = clean(getField(oRow, "Ktoks"));
            var sKtoksTxt = clean(getField(oRow, "KtoksTxt")) || "-";

            if (!sSaknr || mAccounts[sSaknr]) {
                return;
            }

            mAccounts[sSaknr] = {
                saknr: sSaknr,
                saknrTxt: sSaknrTxt,
                ktoks: sKtoks,
                ktoksTxt: sKtoksTxt,
                displayText: sSaknr + " " + sSaknrTxt,
                searchText: [sSaknr, sSaknrTxt, sKtoksTxt].join(" ").toLowerCase()
            };
        });

        return Object.keys(mAccounts).map(function (sSaknr) {
            return mAccounts[sSaknr];
        }).sort(function (oFirst, oSecond) {
            return clean(oFirst.saknr).localeCompare(clean(oSecond.saknr));
        });
    }

    function cumulativeActualRows(aRows, sPeriod) {
        var sNormalizedPeriod = normalizeMonth(sPeriod);

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "monat")) <= sNormalizedPeriod;
        });
    }

    function cumulativeBudgetRows(aRows, sPeriod) {
        var sNormalizedPeriod = normalizeMonth(sPeriod);

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "Poper")) <= sNormalizedPeriod;
        });
    }

    function currentActualRows(aRows, sPeriod) {
        var sNormalizedPeriod = normalizeMonth(sPeriod);

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "monat")) === sNormalizedPeriod;
        });
    }

    function previousActualRows(aRows, aPreviousYearRows, oFilters, oSelectedOrg) {
        if (normalizeMonth(oFilters.period) === "01") {
            return filterByOrg(aPreviousYearRows || [], "kostl", oSelectedOrg);
        }

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "monat")) === normalizeMonth(String(Number(oFilters.period) - 1));
        });
    }

    function buildMonthlyTrend(aActualRows, aBudgetRows) {
        return MONTHS.map(function (sMonth) {
            return {
                month: sMonth,
                monthText: Number(sMonth) + "월",
                actualAmount: sum((aActualRows || []).filter(function (oRow) {
                    return normalizeMonth(getField(oRow, "monat")) === sMonth;
                }), "amount"),
                budgetAmount: sum((aBudgetRows || []).filter(function (oRow) {
                    return normalizeMonth(getField(oRow, "Poper")) === sMonth;
                }), "BudgetAmt")
            };
        });
    }

    function buildOrgRollupTree(aHierarchyRows, aActualRows, oSelectedOrg) {
        var mChildrenByParent = buildChildrenMap(aHierarchyRows);
        var mTextMaps = buildCostCenterTextMaps(aHierarchyRows, aActualRows, []);
        var aTreeRows = buildHierarchyOptionTree(aHierarchyRows);
        var mActualByKostl = {};
        var sSelectedId = normalizeNodeId(oSelectedOrg && oSelectedOrg.childId);

        (aActualRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));

            if (sKostl) {
                mActualByKostl[sKostl] = (mActualByKostl[sKostl] || 0) + toNumber(getField(oRow, "amount"));
            }
        });

        function hydrate(oNode) {
            var aChildren = (oNode.children || []).map(hydrate);
            var fOwnAmount = mActualByKostl[oNode.childId] || 0;
            var fChildrenAmount = aChildren.reduce(function (fTotal, oChild) {
                return fTotal + toNumber(oChild.amount);
            }, 0);
            var fAmount = fOwnAmount + fChildrenAmount;
            var sNodeText = oNode.nodeType === "L" ? resolveCostCenterText(oNode.childId, oNode.nodeText, mTextMaps) : (oNode.nodeText || oNode.childId);

            return Object.assign({}, oNode, {
                nodeText: sNodeText,
                manager: oNode.manager || mTextMaps.hierarchyManagers[oNode.childId] || "-",
                amount: fAmount,
                amountText: fAmount ? "" : "-",
                selected: !!sSelectedId && oNode.childId === sSelectedId,
                children: aChildren
            });
        }

        function findNode(aNodes, sNodeId) {
            var oFound;

            (aNodes || []).some(function (oNode) {
                if (oNode.childId === sNodeId) {
                    oFound = oNode;
                    return true;
                }

                oFound = findNode(oNode.children, sNodeId);
                return !!oFound;
            });

            return oFound;
        }

        aTreeRows = aTreeRows.map(hydrate);

        if (sSelectedId) {
            var oSelectedNode = findNode(aTreeRows, sSelectedId);

            return oSelectedNode ? [oSelectedNode] : aTreeRows;
        }

        return aTreeRows;
    }

    function buildAccountComposition(aActualRows) {
        var fTotal = (aActualRows || []).reduce(function (fAmount, oRow) {
            return fAmount + Math.abs(toNumber(getField(oRow, "amount")));
        }, 0);
        var mGroups = {};
        var aSortedGroups;
        var aTopGroups;
        var aEtcGroups;
        var fEtcAmount;

        (aActualRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "saknr")) || "미지정";
            var sSaknrTxt = clean(getField(oRow, "saknr_txt")) || "-";
            var sKey = sSaknr + "|" + sSaknrTxt;

            if (!mGroups[sKey]) {
                mGroups[sKey] = {
                    saknr: sSaknr,
                    accountName: sSaknrTxt,
                    accountLabel: sSaknrTxt,
                    includedSaknrs: [sSaknr],
                    amount: 0
                };
            }

            mGroups[sKey].amount += toNumber(getField(oRow, "amount"));
        });

        aSortedGroups = Object.keys(mGroups).map(function (sKey) {
            return mGroups[sKey];
        }).sort(function (oFirst, oSecond) {
            return Math.abs(oSecond.amount || 0) - Math.abs(oFirst.amount || 0) ||
                clean(oFirst.saknr).localeCompare(clean(oSecond.saknr));
        });

        aTopGroups = aSortedGroups.slice(0, 7);
        aEtcGroups = aSortedGroups.slice(7);
        fEtcAmount = aEtcGroups.reduce(function (fAmount, oGroup) {
            return fAmount + oGroup.amount;
        }, 0);

        if (fEtcAmount) {
            aTopGroups.push({
                saknr: "ETC",
                accountName: "기타",
                accountLabel: "기타",
                includedSaknrs: aEtcGroups.map(function (oGroup) {
                    return oGroup.saknr;
                }),
                amount: fEtcAmount
            });
        }

        return aTopGroups.map(function (oGroup) {
            var fRatio = fTotal ? Math.abs(oGroup.amount) / fTotal * 100 : 0;

            return Object.assign(oGroup, {
                ratio: fRatio,
                ratioText: Math.round(fRatio * 10) / 10 + "%"
            });
        });
    }

    function buildManagerMap(aHierarchyRows) {
        var mManagers = {};

        (aHierarchyRows || []).forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));
            var sManager = clean(getField(oRow, "verak"));

            if (sChildId && sManager) {
                mManagers[sChildId] = sManager;
            }
        });

        return mManagers;
    }

    function aggregateCostCenters(aActualRows, aBudgetRows, aCurrentRows, aPreviousRows, aHierarchyRows, aDocumentRows) {
        var mTextMaps = buildCostCenterTextMaps(aHierarchyRows, aActualRows, aDocumentRows);
        var mBudget = {};
        var mCurrent = {};
        var mPrevious = {};
        var bHasPreviousRows = (aPreviousRows || []).length > 0;
        var mDocuments = documentCountsByField(aDocumentRows, "Kostl");
        var mRows = {};

        (aBudgetRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "Kostl"));

            if (sKostl) {
                mBudget[sKostl] = (mBudget[sKostl] || 0) + toNumber(getField(oRow, "BudgetAmt"));
            }
        });

        (aCurrentRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));

            if (sKostl) {
                mCurrent[sKostl] = (mCurrent[sKostl] || 0) + toNumber(getField(oRow, "amount"));
            }
        });

        (aPreviousRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));

            if (sKostl) {
                mPrevious[sKostl] = (mPrevious[sKostl] || 0) + toNumber(getField(oRow, "amount"));
            }
        });

        (aActualRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));

            if (!sKostl) {
                return;
            }

            if (!mRows[sKostl]) {
                mRows[sKostl] = {
                    kostl: sKostl,
                    kostlTxt: resolveCostCenterText(sKostl, getField(oRow, "kostl_txt"), mTextMaps),
                    manager: mTextMaps.hierarchyManagers[sKostl] || "-",
                    actualAmount: 0
                };
            }

            mRows[sKostl].actualAmount += toNumber(getField(oRow, "amount"));
        });

        return Object.keys(mRows).map(function (sKostl) {
            var oRow = mRows[sKostl];
            var fBudget = mBudget[sKostl] || 0;
            var bHasBudget = fBudget > 0;
            var fVariance = bHasBudget ? oRow.actualAmount - fBudget : null;
            var fVarianceRate = bHasBudget ? fVariance / fBudget * 100 : null;
            var fPrevious = mPrevious[sKostl] || 0;
            var fMom = bHasPreviousRows ? (mCurrent[sKostl] || 0) - fPrevious : null;
            var sStatus = !bHasBudget ? "예산없음" : (fVarianceRate > 10 ? "주의" : "정상");

            return Object.assign(oRow, {
                currentAmount: mCurrent[sKostl] || 0,
                previousAmount: bHasPreviousRows ? fPrevious : null,
                budgetAmount: bHasBudget ? fBudget : null,
                varianceAmount: fVariance,
                varianceRate: fVarianceRate,
                momAmount: fMom,
                documentCount: mDocuments[sKostl] || 0,
                statusText: sStatus,
                statusState: sStatus === "주의" ? "Warning" : (sStatus === "정상" ? "Success" : "None"),
                varianceState: !bHasBudget || fVariance === 0 || fVariance === null ? "None" : (fVariance > 0 ? "Error" : "Success"),
                momState: fMom === null || fMom === 0 ? "None" : (fMom > 0 ? "Error" : "Success")
            });
        }).sort(function (oFirst, oSecond) {
            return Math.abs(oSecond.actualAmount || 0) - Math.abs(oFirst.actualAmount || 0) ||
                clean(oFirst.kostl).localeCompare(clean(oSecond.kostl));
        }).map(function (oRow, iIndex) {
            oRow.rank = iIndex + 1;
            return oRow;
        });
    }

    function aggregateAccounts(aActualRows, aBudgetRows, aCurrentRows, aPreviousRows, aDocumentRows) {
        var fTotal = sum(aActualRows, "amount");
        var mBudget = {};
        var mCurrent = {};
        var mPrevious = {};
        var bHasPreviousRows = (aPreviousRows || []).length > 0;
        var mDocuments = documentCountsByField(aDocumentRows, "Saknr");
        var mRows = {};

        (aBudgetRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "Saknr"));

            if (sSaknr) {
                mBudget[sSaknr] = (mBudget[sSaknr] || 0) + toNumber(getField(oRow, "BudgetAmt"));
            }
        });

        (aCurrentRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "saknr"));

            if (sSaknr) {
                mCurrent[sSaknr] = (mCurrent[sSaknr] || 0) + toNumber(getField(oRow, "amount"));
            }
        });

        (aPreviousRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "saknr"));

            if (sSaknr) {
                mPrevious[sSaknr] = (mPrevious[sSaknr] || 0) + toNumber(getField(oRow, "amount"));
            }
        });

        (aActualRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "saknr"));

            if (!sSaknr) {
                return;
            }

            if (!mRows[sSaknr]) {
                mRows[sSaknr] = {
                    saknr: sSaknr,
                    saknrTxt: clean(getField(oRow, "saknr_txt")) || sSaknr,
                    ktoksTxt: clean(getField(oRow, "ktoks_txt")) || "-",
                    actualAmount: 0
                };
            }

            mRows[sSaknr].actualAmount += toNumber(getField(oRow, "amount"));
        });

        return Object.keys(mRows).map(function (sSaknr) {
            var oRow = mRows[sSaknr];
            var fBudget = mBudget[sSaknr] || 0;
            var bHasBudget = fBudget > 0;
            var fVariance = bHasBudget ? oRow.actualAmount - fBudget : null;
            var fVarianceRate = bHasBudget ? fVariance / fBudget * 100 : null;
            var fPrevious = mPrevious[sSaknr] || 0;
            var fMom = bHasPreviousRows ? (mCurrent[sSaknr] || 0) - fPrevious : null;

            return Object.assign(oRow, {
                currentAmount: mCurrent[sSaknr] || 0,
                previousAmount: bHasPreviousRows ? fPrevious : null,
                budgetAmount: bHasBudget ? fBudget : null,
                varianceAmount: fVariance,
                varianceRate: fVarianceRate,
                momAmount: fMom,
                documentCount: mDocuments[sSaknr] || 0,
                ratio: fTotal ? oRow.actualAmount / fTotal * 100 : null,
                varianceState: !bHasBudget || fVariance === 0 || fVariance === null ? "None" : (fVariance > 0 ? "Error" : "Success"),
                momState: fMom === null || fMom === 0 ? "None" : (fMom > 0 ? "Error" : "Success")
            });
        }).sort(function (oFirst, oSecond) {
            return Math.abs(oSecond.actualAmount || 0) - Math.abs(oFirst.actualAmount || 0) ||
                clean(oFirst.saknr).localeCompare(clean(oSecond.saknr));
        }).map(function (oRow, iIndex) {
            oRow.rank = iIndex + 1;
            return oRow;
        });
    }

    function compareDateDesc(sFirstDate, sSecondDate) {
        return clean(sSecondDate).localeCompare(clean(sFirstDate));
    }

    function mapDocumentRows(aRows, oTextMaps) {
        return (aRows || []).map(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "Kostl"));
            var sSenderKostl = normalizeNodeId(getField(oRow, "SenderKostl"));
            var sReceiverKostl = normalizeNodeId(getField(oRow, "ReceiverKostl"));

            return {
                rowNo: 0,
                Bukrs: clean(getField(oRow, "Bukrs")),
                Butxt: clean(getField(oRow, "Butxt")),
                Gjahr: clean(getField(oRow, "Gjahr")),
                Belnr: clean(getField(oRow, "Belnr")),
                Docln: clean(getField(oRow, "Docln")),
                Blart: clean(getField(oRow, "Blart")),
                BlartTxt: clean(getField(oRow, "BlartTxt")),
                Bldat: clean(getField(oRow, "Bldat")),
                Budat: clean(getField(oRow, "Budat")),
                Wwert: clean(getField(oRow, "Wwert")),
                Augdt: clean(getField(oRow, "Augdt")),
                Netdt: clean(getField(oRow, "Netdt")),
                Bzdat: clean(getField(oRow, "Bzdat")),
                Monat: normalizeMonth(getField(oRow, "Monat")),
                Bktxt: clean(getField(oRow, "Bktxt")),
                BstatTxt: clean(getField(oRow, "BstatTxt")),
                Xblnr: clean(getField(oRow, "Xblnr")),
                Saknr: normalizeNodeId(getField(oRow, "Saknr")),
                SaknrTxt: clean(getField(oRow, "SaknrTxt")),
                KtoksTxt: clean(getField(oRow, "KtoksTxt")),
                Drcrk: clean(getField(oRow, "Drcrk")),
                DrcrkTxt: clean(getField(oRow, "DrcrkTxt")),
                CostFlowType: clean(getField(oRow, "CostFlowType")),
                CostFlowTypeTxt: clean(getField(oRow, "CostFlowTypeTxt")),
                Kostl: sKostl,
                KostlTxt: resolveCostCenterText(sKostl, getField(oRow, "KostlTxt"), oTextMaps),
                Manager: clean(getField(oRow, "Manager")) || (oTextMaps && oTextMaps.hierarchyManagers && oTextMaps.hierarchyManagers[sKostl]) || "-",
                Partner: clean(getField(oRow, "Partner")),
                PartnerName: clean(getField(oRow, "PartnerName")),
                Sgtxt: clean(getField(oRow, "Sgtxt")),
                Amount: toNumber(getField(oRow, "Amount")),
                RawAmount: toNumber(getField(oRow, "RawAmount")),
                Waers: clean(getField(oRow, "Waers")) || CURRENCY,
                SenderKostl: sSenderKostl,
                SenderKostlTxt: resolveCostCenterText(sSenderKostl, getField(oRow, "SenderKostlTxt"), oTextMaps),
                SenderManager: clean(getField(oRow, "SenderManager")) || (oTextMaps && oTextMaps.hierarchyManagers && oTextMaps.hierarchyManagers[sSenderKostl]) || "-",
                ReceiverKostl: sReceiverKostl,
                ReceiverKostlTxt: resolveCostCenterText(sReceiverKostl, getField(oRow, "ReceiverKostlTxt"), oTextMaps),
                ReceiverManager: clean(getField(oRow, "ReceiverManager")) || (oTextMaps && oTextMaps.hierarchyManagers && oTextMaps.hierarchyManagers[sReceiverKostl]) || "-",
                ReceiverPrctr: clean(getField(oRow, "ReceiverPrctr")),
                ReceiverPrctrTxt: clean(getField(oRow, "ReceiverPrctrTxt")),
                Ebeln: clean(getField(oRow, "Ebeln")),
                InBelnr: clean(getField(oRow, "InBelnr")),
                Mblnr: clean(getField(oRow, "Mblnr")),
                Vbeln: clean(getField(oRow, "Vbeln")),
                VbelnDel: clean(getField(oRow, "VbelnDel")),
                VbelnBil: clean(getField(oRow, "VbelnBil")),
                Aufnr: clean(getField(oRow, "Aufnr")),
                Matnr: clean(getField(oRow, "Matnr")),
                RMatnr: clean(getField(oRow, "RMatnr")),
                Werks: clean(getField(oRow, "Werks")),
                Segment: clean(getField(oRow, "Segment"))
            };
        }).sort(function (oFirst, oSecond) {
            return compareDateDesc(oFirst.Budat, oSecond.Budat) ||
                clean(oSecond.Belnr).localeCompare(clean(oFirst.Belnr)) ||
                clean(oFirst.Docln).localeCompare(clean(oSecond.Docln));
        }).map(function (oRow, iIndex) {
            oRow.rowNo = iIndex + 1;
            return oRow;
        });
    }

    return {
        MONTHS: MONTHS,
        CURRENCY: CURRENCY,
        BUDGET_VERSION: BUDGET_VERSION,
        init: init,
        refreshMetadata: refreshMetadata,
        defaultFilters: defaultFilters,
        readActualRows: readActualRows,
        readPreviousYearRows: readPreviousYearRows,
        readBudgetRows: readBudgetRows,
        readHierarchyRows: readHierarchyRows,
        readDocumentRows: readDocumentRows,
        readAllocationRuleRows: readAllocationRuleRows,
        readAllocationRows: readAllocationRows,
        readAllocationResultRows: readAllocationResultRows,
        buildHierarchyOptions: buildHierarchyOptions,
        buildHierarchyOptionTree: buildHierarchyOptionTree,
        filterHierarchyTree: filterHierarchyTree,
        buildOrgRollupTree: buildOrgRollupTree,
        buildCostCenterTextMaps: buildCostCenterTextMaps,
        resolveCostCenterText: resolveCostCenterText,
        getOrgSelection: getOrgSelection,
        filterByOrg: filterByOrg,
        filterByAccount: filterByAccount,
        cumulativeActualRows: cumulativeActualRows,
        cumulativeBudgetRows: cumulativeBudgetRows,
        currentActualRows: currentActualRows,
        previousActualRows: previousActualRows,
        buildMonthlyTrend: buildMonthlyTrend,
        buildAccountComposition: buildAccountComposition,
        buildAccountValueHelpRows: buildAccountValueHelpRows,
        aggregateCostCenters: aggregateCostCenters,
        aggregateAccounts: aggregateAccounts,
        distinctDocumentCount: distinctDocumentCount,
        documentCountsByField: documentCountsByField,
        documentCountsByMonth: documentCountsByMonth,
        currentDocumentRows: currentDocumentRows,
        mapDocumentRows: mapDocumentRows,
        sum: sum,
        clean: clean,
        normalizeMonth: normalizeMonth,
        normalizeNodeId: normalizeNodeId,
        getField: getField
    };
});
