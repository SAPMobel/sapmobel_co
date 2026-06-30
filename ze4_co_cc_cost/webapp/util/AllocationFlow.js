sap.ui.define([
    "sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
    "use strict";

    var GROUP_UNASSIGNED = "__UNASSIGNED__";
    var GROUP_ETC = "__ETC__";
    var COLORS = ["#0A6ED1", "#2EB67D", "#A65EEA", "#FF8B2B", "#36C5D8", "#6B7785", "#E31B6D", "#D89000", "#8A63D2", "#00A0A0"];
    var STEP_COLORS = {
        "1": "#7C3AED",
        "2": "#0891B2",
        "3": "#F97316",
        "4": "#16A34A",
        "5": "#DB2777",
        "UNSPECIFIED": "#64748B"
    };
    var ACCOUNT_ROLE_MAP = {
        "800015": ["MATERIAL", "재료비", "최종 제조원가 반영"],
        "800016": ["MANUFACTURING_RECEIPT", "제조입고", "최종 제조원가 차감"],
        "800020": ["STANDARD_PROCESSING", "표준/귀속 가공비", "노무비배부"],
        "800021": ["STANDARD_PROCESSING", "표준/귀속 가공비", "기계경비배부"],
        "800022": ["STANDARD_PROCESSING", "표준/귀속 가공비", "간접비배부"],
        "800023": ["PRICE_VARIANCE", "가격차이", "가격차이 영역 전용"],
        "800024": ["ALLOCATION_VARIANCE", "배부차이", "실제 분할원가와 표준/귀속 가공비 차이"]
    };
    var oAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 0
    });
    var oRateFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 1,
        maxFractionDigits: 1
    });
    var oCompactAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 1
    });

    function clean(vValue) {
        if (vValue === null || vValue === undefined) {
            return "";
        }
        return String(vValue).trim();
    }

    function normalize(vValue) {
        return clean(vValue).toUpperCase();
    }

    function normalizeMonth(vValue) {
        var sValue = clean(vValue);
        return sValue ? sValue.padStart(2, "0") : "";
    }

    function toNumber(vValue) {
        var fValue;

        if (vValue === null || vValue === undefined || vValue === "") {
            return 0;
        }

        fValue = Number(vValue);
        return isNaN(fValue) ? 0 : fValue;
    }

    function accountRoleInfo(vAccount) {
        var sAccount = normalize(vAccount);
        var iAccount = Number(sAccount);
        var aMapped = ACCOUNT_ROLE_MAP[sAccount];

        if (aMapped) {
            return {
                key: aMapped[0],
                text: aMapped[1],
                detail: aMapped[2]
            };
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
            return {
                key: sAccount === "800008" ? "SOURCE_ACTUAL_EXCLUDED" : "SOURCE_ACTUAL",
                text: sAccount === "800008" ? "배부대상 제외 제조비" : "배부대상 제조비",
                detail: sAccount === "800008" ? "현재 기준 배부대상에서 제외" : "활동단가 산출과 배부의 기준 금액"
            };
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800019) {
            return {
                key: "PRODUCTION_ABSORPTION",
                text: "생산실적 차감/흡수",
                detail: "일반 배부 원천/수신 제외"
            };
        }

        return {
            key: "OTHER",
            text: "기타",
            detail: ""
        };
    }

    function numberOrNull(vValue) {
        var fValue;

        if (vValue === null || vValue === undefined || vValue === "") {
            return null;
        }

        fValue = Number(vValue);
        return isNaN(fValue) ? null : fValue;
    }

    function getField(oRow, sFieldName) {
        var sTarget = String(sFieldName || "").toLowerCase();
        var sMatchedKey;

        if (!oRow) {
            return undefined;
        }

        if (Object.prototype.hasOwnProperty.call(oRow, sFieldName)) {
            return oRow[sFieldName];
        }

        sMatchedKey = Object.keys(oRow).find(function (sKey) {
            return sKey.toLowerCase() === sTarget;
        });

        return sMatchedKey ? oRow[sMatchedKey] : undefined;
    }

    function isUsableText(sText, sCode) {
        var sCleanText = clean(sText);
        var sCleanCode = normalize(sCode);

        return !!sCleanText && (!sCleanCode || normalize(sCleanText) !== sCleanCode);
    }

    function textOrCode(sText, sCode) {
        if (isUsableText(sText, sCode)) {
            return clean(sText);
        }
        return clean(sCode) || "-";
    }

    function escapeHtml(vValue) {
        return clean(vValue)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function truncate(vValue, iLength) {
        var sValue = clean(vValue);
        var iMax = iLength || 18;

        return sValue.length > iMax ? sValue.slice(0, iMax - 1) + "..." : sValue;
    }

    function amountText(vValue, sCurrency) {
        var fValue = numberOrNull(vValue);

        if (fValue === null) {
            return "-";
        }

        return oAmountFormat.format(fValue) + (sCurrency ? " " + sCurrency : "");
    }

    function skfUnitText(vValue) {
        var sValue = clean(vValue);
        var sCompact = sValue.replace(/\s/g, "");

        if (sCompact === "세대구성원수" || sCompact === "구성원수") {
            return "명";
        }

        return sValue;
    }

    function compactAmountText(vValue) {
        var fValue = numberOrNull(vValue);

        if (fValue === null) {
            return "-";
        }

        if (Math.abs(fValue) >= 100000000) {
            return oCompactAmountFormat.format(fValue / 100000000) + "억";
        }

        if (Math.abs(fValue) >= 10000) {
            return oCompactAmountFormat.format(fValue / 10000) + "만";
        }

        return oAmountFormat.format(fValue);
    }

    function rateText(vValue) {
        var fValue = numberOrNull(vValue);

        if (fValue === null) {
            return "-";
        }

        return oRateFormat.format(fValue) + "%";
    }

    function formatDate(vValue) {
        var sValue = clean(vValue);
        var oDate;
        var aMatch;

        if (!sValue) {
            return "-";
        }

        if (/^\d{8}$/.test(sValue)) {
            return sValue.slice(0, 4) + "." + sValue.slice(4, 6) + "." + sValue.slice(6, 8);
        }

        aMatch = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(sValue);
        oDate = aMatch ? new Date(Number(aMatch[1])) : new Date(sValue);

        if (!oDate || isNaN(oDate.getTime())) {
            return "-";
        }

        return oDate.getFullYear() + "." +
            String(oDate.getMonth() + 1).padStart(2, "0") + "." +
            String(oDate.getDate()).padStart(2, "0");
    }

    function documentKey(oRow) {
        return [getField(oRow, "Bukrs"), getField(oRow, "Gjahr"), getField(oRow, "Belnr")].map(clean).join("|");
    }

    function distinctDocumentCount(aRows) {
        var mKeys = {};

        (aRows || []).forEach(function (oRow) {
            var sKey = documentKey(oRow);
            if (sKey !== "||") {
                mKeys[sKey] = true;
            }
        });

        return Object.keys(mKeys).length;
    }

    function buildHierarchyIndex(aRows) {
        var oIndex = {
            nodeById: {},
            leafByCostCenter: {},
            parentByChild: {},
            textById: {},
            typeById: {},
            levelById: {},
            managerById: {},
            childrenByParent: {}
        };

        (aRows || []).forEach(function (oRow) {
            var sChild = normalize(getField(oRow, "child_id"));
            var sParent = normalize(getField(oRow, "parent_id"));
            var sText = clean(getField(oRow, "node_text"));
            var sType = clean(getField(oRow, "node_type")).toUpperCase();

            if (!sChild) {
                return;
            }

            oIndex.nodeById[sChild] = {
                id: sChild,
                parentId: sParent,
                text: isUsableText(sText, sChild) ? sText : sChild,
                type: sType,
                level: Number(getField(oRow, "hlevel") || 0),
                manager: clean(getField(oRow, "verak"))
            };
            oIndex.parentByChild[sChild] = sParent;
            oIndex.typeById[sChild] = sType;
            oIndex.levelById[sChild] = oIndex.nodeById[sChild].level;
            oIndex.managerById[sChild] = oIndex.nodeById[sChild].manager;

            if (isUsableText(sText, sChild)) {
                oIndex.textById[sChild] = sText;
            }

            if (sType === "L") {
                oIndex.leafByCostCenter[sChild] = oIndex.nodeById[sChild];
            }

            if (!oIndex.childrenByParent[sParent]) {
                oIndex.childrenByParent[sParent] = [];
            }
            oIndex.childrenByParent[sParent].push(sChild);
        });

        return oIndex;
    }

    function getPathToRoot(oIndex, sChildId) {
        var aPath = [];
        var mVisited = {};
        var sCurrent = normalize(sChildId);

        while (sCurrent && !mVisited[sCurrent]) {
            aPath.push(sCurrent);
            mVisited[sCurrent] = true;
            sCurrent = oIndex.parentByChild[sCurrent];
        }

        return aPath;
    }

    function isLeafNode(oIndex, sNodeId) {
        return clean(oIndex.typeById[normalize(sNodeId)]) === "L";
    }

    function nodeText(oIndex, sNodeId) {
        var sKey = normalize(sNodeId);
        return (oIndex.nodeById && oIndex.nodeById[sKey] && oIndex.nodeById[sKey].text) ||
            oIndex.textById[sKey] ||
            sKey;
    }

    function isGroupNode(oIndex, sNodeId) {
        var sKey = normalize(sNodeId);
        return !!sKey && !isLeafNode(oIndex, sKey) && !!(oIndex.nodeById && oIndex.nodeById[sKey]);
    }

    function firstGroupAncestor(oIndex, aPath) {
        return (aPath || []).slice(1).find(function (sNodeId) {
            return isGroupNode(oIndex, sNodeId);
        });
    }

    function cleanCostCenterName(sText) {
        var sValue = clean(sText);
        if (sValue === "매장 창고") {
            return "매장창고";
        }
        return sValue;
    }

    function shouldPrefixParentName(sText) {
        var sCompact = cleanCostCenterName(sText).replace(/\s+/g, "");

        return sCompact === "매장창고" ||
            sCompact === "영업매장" ||
            sCompact === "창고" ||
            /^생산[1-8]팀$/.test(sCompact);
    }

    function parentDisplayName(sText) {
        return clean(sText).replace(/\s*그룹$/, "");
    }

    function withParentName(oIndex, sKostl, sFallbackText) {
        var sKey = normalize(sKostl);
        var oLeaf = oIndex.leafByCostCenter && oIndex.leafByCostCenter[sKey];
        var sText = cleanCostCenterName(oLeaf && oLeaf.text || textOrCode(sFallbackText, sKey));
        var sParentText;

        if (!oLeaf || !oLeaf.parentId || !shouldPrefixParentName(sText)) {
            return sText;
        }

        sParentText = parentDisplayName(nodeText(oIndex, oLeaf.parentId));
        if (!sParentText || normalize(sText).indexOf(normalize(sParentText)) === 0) {
            return sText;
        }

        return sParentText + " " + sText;
    }

    function resolveCcg(oIndex, sKostl, sBasis) {
        var sCostCenter = normalize(sKostl);
        var aPath = getPathToRoot(oIndex, sKostl);
        var aGroupAncestors = aPath.slice(1).filter(function (sNodeId) {
            return isGroupNode(oIndex, sNodeId);
        });
        var aTopDown = aGroupAncestors.slice().reverse();
        var sKey;
        var iIndex;

        if (!sCostCenter || !oIndex.leafByCostCenter || !oIndex.leafByCostCenter[sCostCenter] || !aGroupAncestors.length) {
            return {
                id: GROUP_UNASSIGNED,
                text: "그룹 미지정"
            };
        }

        if (sBasis === "UPPER") {
            sKey = aGroupAncestors[1] || aGroupAncestors[0];
        } else if (sBasis === "HQ") {
            sKey = aGroupAncestors.find(function (sNodeId) {
                return nodeText(oIndex, sNodeId).indexOf("본부") > -1;
            }) || firstGroupAncestor(oIndex, aPath);
        } else if (sBasis === "DIVISION") {
            iIndex = aTopDown.length > 1 ? 1 : 0;
            sKey = aTopDown[Math.max(0, iIndex)];
        } else {
            sKey = aGroupAncestors[0];
        }

        if (!sKey || !oIndex.textById[sKey]) {
            return {
                id: sKey || GROUP_UNASSIGNED,
                text: "그룹 미지정"
            };
        }

        return {
            id: sKey,
            text: oIndex.textById[sKey]
        };
    }

    function enrichRows(aRows, oHierarchyIndex, sGroupBasis) {
        return (aRows || []).map(function (oRow, iIndex) {
            var sSender = normalize(getField(oRow, "SenderKostl"));
            var sReceiver = normalize(getField(oRow, "ReceiverKostl"));
            var oSenderCcg = resolveCcg(oHierarchyIndex, sSender, sGroupBasis);
            var oReceiverCcg = resolveCcg(oHierarchyIndex, sReceiver, sGroupBasis);
            var sCycle = clean(getField(oRow, "Cycle"));
            var sCycleText = textOrCode(getField(oRow, "CycleText"), sCycle);
            var sSegm = clean(getField(oRow, "SegmNo"));
            var sSkf = clean(getField(oRow, "SkfId"));
            var fAmount = toNumber(getField(oRow, "AllocAmount"));
            var oAccountRole = accountRoleInfo(getField(oRow, "Saknr"));

            return Object.assign({}, oRow, {
                _rowKey: "A" + iIndex,
                _senderKostl: sSender,
                _receiverKostl: sReceiver,
                _senderKostlText: withParentName(oHierarchyIndex, sSender, getField(oRow, "SenderKostlTxt")),
                _receiverKostlText: withParentName(oHierarchyIndex, sReceiver, getField(oRow, "ReceiverKostlTxt")),
                _senderCcgId: oSenderCcg.id,
                _senderCcgText: oSenderCcg.text,
                _receiverCcgId: oReceiverCcg.id,
                _receiverCcgText: oReceiverCcg.text,
                _cycle: sCycle,
                _cycleText: sCycleText,
                _segmNo: sSegm,
                _segmText: textOrCode(getField(oRow, "SegmName"), sSegm),
                _skfId: sSkf,
                _skfText: textOrCode(getField(oRow, "SkfTxt"), sSkf),
                _amount: fAmount,
                _waers: clean(getField(oRow, "Waers")) || "KRW",
                _accountRoleKey: oAccountRole.key,
                _accountRoleText: oAccountRole.text,
                _accountRoleDetail: oAccountRole.detail,
                _documentKey: documentKey(oRow),
                _budat: clean(getField(oRow, "Budat"))
            });
        });
    }

    function isBasisMatched(oRow) {
        return clean(getField(oRow, "BasisMatched")) === "X";
    }

    function basisValueText(oRow) {
        var vValue = getField(oRow, "BasisValue");
        var sUnit = skfUnitText(getField(oRow, "SkfUnitTxt"));

        if (!isBasisMatched(oRow) || vValue === null || vValue === undefined || vValue === "") {
            return "-";
        }

        return amountText(vValue) + (sUnit ? " " + sUnit : "");
    }

    function basisRatioText(oRow) {
        var vValue = getField(oRow, "BasisRatio");
        var fValue;

        if (!isBasisMatched(oRow) || vValue === null || vValue === undefined || vValue === "") {
            return "-";
        }

        fValue = Number(vValue);
        return isNaN(fValue) ? "-" : oRateFormat.format(fValue) + "%";
    }

    function encodeContext(oContext) {
        return encodeURIComponent(JSON.stringify(oContext || {}));
    }

    function decodeContext(sContext) {
        try {
            return JSON.parse(decodeURIComponent(sContext || "%7B%7D"));
        } catch (e) {
            return {};
        }
    }

    function normalizeIdList(vValue) {
        var aValues;
        var mSeen = {};

        if (Array.isArray(vValue)) {
            aValues = vValue;
        } else if (typeof vValue === "string") {
            aValues = vValue.split(",");
        } else {
            aValues = [];
        }

        return aValues.map(function (vItem) {
            return clean(vItem);
        }).filter(function (sItem) {
            if (!sItem || mSeen[sItem]) {
                return false;
            }
            mSeen[sItem] = true;
            return true;
        });
    }

    function colorForKey(sKey) {
        var sValue = clean(sKey);
        var iHash = 0;
        var i;

        for (i = 0; i < sValue.length; i += 1) {
            iHash = ((iHash << 5) - iHash) + sValue.charCodeAt(i);
            iHash |= 0;
        }

        return COLORS[Math.abs(iHash) % COLORS.length];
    }

    function stepNoFromText(vValue) {
        var sValue = clean(vValue);
        var aMatch = /(\d+)\s*단계/.exec(sValue);

        if (aMatch) {
            return aMatch[1];
        }
        return /^\d+$/.test(sValue) ? sValue : "";
    }

    function colorForStepText(sText, sFallbackKey) {
        var sStepNo = stepNoFromText(sText) || stepNoFromText(sFallbackKey);

        return STEP_COLORS[sStepNo] || colorForKey(sFallbackKey || sText);
    }

    function createOptions(aRows, sKeyField, sTextField, sAllText) {
        var mSeen = {};
        var aOptions = [{
            key: "",
            text: sAllText || "전체"
        }];

        (aRows || []).forEach(function (oRow) {
            var sKey = clean(getField(oRow, sKeyField));
            var sText = textOrCode(getField(oRow, sTextField), sKey);

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
    }

    function createCcgOptions(aRows, sIdField, sTextField) {
        var mSeen = {};
        var aOptions = [{
            key: "",
            text: "전체"
        }];

        (aRows || []).forEach(function (oRow) {
            var sKey = clean(oRow[sIdField]);
            var sText = clean(oRow[sTextField]) || "그룹 미지정";

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
    }

    function linkWidth(fAmount, fMaxAmount, fMinWidth, fMaxWidth) {
        var fMaxRoot = Math.sqrt(Math.max(1, Math.abs(fMaxAmount || 0)));
        var fRoot = Math.sqrt(Math.max(0, Math.abs(fAmount || 0)));
        var fMin = fMinWidth || 2;
        var fMax = fMaxWidth || 30;

        return Math.max(fMin, Math.min(fMax, fMin + (fRoot / fMaxRoot) * (fMax - fMin)));
    }

    function renderFlowSvg(oConfig) {
        var aColumns = oConfig.columns || [];
        var aLinks = oConfig.links || [];
        var iColumnCount = Math.max(1, aColumns.length);
        var iNodeWidth = oConfig.nodeWidth || 210;
        var iNodeHeight = oConfig.nodeHeight || 58;
        var iMinWidth = oConfig.minWidth || Math.max(980, iColumnCount * 360);
        var iMaxColumnRows = aColumns.reduce(function (iMax, oColumn) {
            return Math.max(iMax, (oColumn.nodes || []).length);
        }, 1);
        var iHeight = Math.max(oConfig.minHeight || 540, 120 + iMaxColumnRows * (iNodeHeight + 18));
        var iWidth = Math.max(iMinWidth, 120 + iColumnCount * (iNodeWidth + 150));
        var fMaxAmount = aLinks.reduce(function (fMax, oLink) {
            return Math.max(fMax, Math.abs(oLink.amount || 0));
        }, 0);
        var mPositions = {};
        var aHtml = [];
        var aLabelHtml = [];
        var aNodeHtml = [];
        var i;

        function columnX(iIndex) {
            if (iColumnCount === 1) {
                return Math.round((iWidth - iNodeWidth) / 2);
            }
            return Math.round(54 + iIndex * ((iWidth - iNodeWidth - 108) / (iColumnCount - 1)));
        }

        function nodeY(oColumn, iCount, iIndex) {
            var iAvailable = iHeight - 118;
            var iGap = Math.max(12, Math.min(28, (iAvailable - iCount * iNodeHeight) / Math.max(1, iCount + 1)));
            var iGroupHeight;
            var iStartY;

            if (oColumn && oColumn.centerCompact) {
                iGap = oColumn.nodeGap || 24;
            }

            iGroupHeight = iCount * iNodeHeight + Math.max(0, iCount - 1) * iGap;
            iStartY = Math.max(68, Math.round((iHeight - iGroupHeight) / 2));

            return iStartY + iIndex * (iNodeHeight + iGap);
        }

        function renderNode(oNode, oColumn, iColumnIndex, iNodeIndex, iCount) {
            var iX = columnX(iColumnIndex);
            var iY = nodeY(oColumn, iCount, iNodeIndex);
            var iTextY = Math.round(iY + iNodeHeight / 2 + 5);
            var iTitleMax = oConfig.titleLength || Math.max(16, Math.floor((iNodeWidth - 118) / 9));
            var iAmountMax = oConfig.amountLength || 14;
            var sColor = oNode.color || colorForKey(oNode.id || oNode.text);
            var sNavAttr = (oNode.href ? " data-flow-href=\"" + escapeHtml(oNode.href) + "\"" : "") +
                (oNode.selectKey ? " data-flow-select=\"" + escapeHtml(oNode.selectKey) + "\"" : "");
            var sClass = "ze4SankeyNode" +
                (oNode.selected ? " ze4SankeyNodeSelected" : "") +
                (oNode.href ? " ze4SankeyNav" : "") +
                (oNode.href || oNode.selectKey ? " ze4SankeySelectable" : "");

            mPositions[oNode.id] = {
                x: iX,
                y: iY,
                cxLeft: iX,
                cxRight: iX + iNodeWidth,
                cy: iY + iNodeHeight / 2
            };

            aNodeHtml.push("<g class=\"" + sClass + "\"" + sNavAttr + ">");
            aNodeHtml.push("<rect class=\"ze4SankeyNodeRect\" x=\"" + iX + "\" y=\"" + iY + "\" width=\"" + iNodeWidth + "\" height=\"" + iNodeHeight + "\" />");
            aNodeHtml.push("<rect x=\"" + iX + "\" y=\"" + iY + "\" width=\"7\" height=\"" + iNodeHeight + "\" rx=\"6\" fill=\"" + sColor + "\" />");
            aNodeHtml.push("<text class=\"ze4SankeyNodeTitle\" x=\"" + (iX + 20) + "\" y=\"" + iTextY + "\"><title>" + escapeHtml(oNode.text) + "</title>" + escapeHtml(truncate(oNode.text, iTitleMax)) + "</text>");
            aNodeHtml.push("<text class=\"ze4SankeyNodeAmount\" x=\"" + (iX + iNodeWidth - 14) + "\" y=\"" + iTextY + "\" text-anchor=\"end\"><title>" + escapeHtml(oNode.subText || "") + "</title>" + escapeHtml(truncate(oNode.subText || "", iAmountMax)) + "</text>");
            aNodeHtml.push("</g>");
        }

        function renderLink(oLink) {
            var oFrom = mPositions[oLink.from];
            var oTo = mPositions[oLink.to];
            var iX1;
            var iY1;
            var iX2;
            var iY2;
            var iCurve;
            var sPath;
            var sColor = oLink.color || colorForKey(oLink.colorKey || oLink.key || "");
            var sNavAttr = (oLink.href ? " data-flow-href=\"" + escapeHtml(oLink.href) + "\"" : "") +
                (oLink.selectKey ? " data-flow-select=\"" + escapeHtml(oLink.selectKey) + "\"" : "");
            var sClass = "ze4SankeyLink" +
                (oLink.selected ? " ze4SankeyLinkSelected" : "") +
                (oLink.href ? " ze4SankeyNav" : "") +
                (oLink.href || oLink.selectKey ? " ze4SankeySelectable" : "");

            if (!oFrom || !oTo) {
                return;
            }

            iX1 = oFrom.cxRight;
            iY1 = oFrom.cy;
            iX2 = oTo.cxLeft;
            iY2 = oTo.cy;
            iCurve = Math.max(42, Math.round(Math.abs(iX2 - iX1) * 0.18));
            sPath = "M " + iX1 + " " + iY1 + " C " + (iX1 + iCurve) + " " + iY1 + ", " + (iX2 - iCurve) + " " + iY2 + ", " + iX2 + " " + iY2;

            aHtml.push("<path class=\"" + sClass + "\" d=\"" + sPath + "\" stroke=\"" + sColor + "\" stroke-width=\"" + linkWidth(oLink.amount, fMaxAmount, 2, oConfig.maxLinkWidth || 28).toFixed(1) + "\"" + sNavAttr + ">");
            aHtml.push("<title>" + escapeHtml(oLink.title || amountText(oLink.amount, oLink.currency || "KRW")) + "</title>");
            aHtml.push("</path>");
        }

        aHtml.push("<div class=\"ze4SankeyHost\" style=\"width:100%;min-width:" + iWidth + "px;height:" + iHeight + "px\">");
        aHtml.push("<svg class=\"ze4SankeySvg\" viewBox=\"0 0 " + iWidth + " " + iHeight + "\" width=\"100%\" height=\"" + iHeight + "\" preserveAspectRatio=\"xMinYMin meet\" xmlns=\"http://www.w3.org/2000/svg\">");

        aColumns.forEach(function (oColumn, iColumnIndex) {
            var iX = columnX(iColumnIndex);
            aLabelHtml.push("<text class=\"ze4SankeyStageLabel\" x=\"" + iX + "\" y=\"36\">" + escapeHtml(oColumn.title || "") + "</text>");
            (oColumn.nodes || []).forEach(function (oNode, iNodeIndex) {
                renderNode(oNode, oColumn, iColumnIndex, iNodeIndex, (oColumn.nodes || []).length);
            });
        });

        Array.prototype.push.apply(aHtml, aLabelHtml);
        for (i = 0; i < aLinks.length; i += 1) {
            renderLink(aLinks[i]);
        }
        Array.prototype.push.apply(aHtml, aNodeHtml);

        aHtml.push("</svg></div>");
        return aHtml.join("");
    }

    return {
        GROUP_UNASSIGNED: GROUP_UNASSIGNED,
        GROUP_ETC: GROUP_ETC,
        COLORS: COLORS,
        STEP_COLORS: STEP_COLORS,
        clean: clean,
        normalize: normalize,
        normalizeMonth: normalizeMonth,
        toNumber: toNumber,
        numberOrNull: numberOrNull,
        accountRoleInfo: accountRoleInfo,
        getField: getField,
        isUsableText: isUsableText,
        textOrCode: textOrCode,
        amountText: amountText,
        skfUnitText: skfUnitText,
        compactAmountText: compactAmountText,
        rateText: rateText,
        formatDate: formatDate,
        documentKey: documentKey,
        distinctDocumentCount: distinctDocumentCount,
        buildHierarchyIndex: buildHierarchyIndex,
        enrichRows: enrichRows,
        basisValueText: basisValueText,
        basisRatioText: basisRatioText,
        isBasisMatched: isBasisMatched,
        encodeContext: encodeContext,
        decodeContext: decodeContext,
        normalizeIdList: normalizeIdList,
        colorForKey: colorForKey,
        stepNoFromText: stepNoFromText,
        colorForStepText: colorForStepText,
        createOptions: createOptions,
        createCcgOptions: createCcgOptions,
        renderFlowSvg: renderFlowSvg,
        linkWidth: linkWidth,
        escapeHtml: escapeHtml,
        truncate: truncate
    };
});
