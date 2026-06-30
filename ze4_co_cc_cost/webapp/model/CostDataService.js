sap.ui.define([
    "sap/ui/thirdparty/jquery"
], function (jQuery) {
    "use strict";

    var SAP_CLIENT = "100";
    var SAP_LANGUAGE = "KO";
    var BUDGET_VERSION = "BUD";
    var CURRENCY = "KRW";
    var MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    var COST_DOCUMENT_KEY_FIELDS = ["Bukrs", "Gjahr", "Monat", "Kostl", "Belnr"];
    var MANUFACTURING_FLOW_ACCOUNT_MAP = {
        "800015": true,
        "800020": true,
        "800021": true,
        "800022": true,
        "800024": true,
        "800016": true
    };
    var PRODUCTION_CLEARING_ACCOUNT_MAP = {
        "800017": true,
        "800018": true,
        "800019": true
    };
    var APPLIED_PROCESSING_ACCOUNT_MAP = {
        "800020": true,
        "800021": true,
        "800022": true
    };
    var SOURCE_POOL_ACTIVITY_TYPE_MAP = {
        "800001": "LABOR",
        "800002": "OVRH",
        "800003": "LABOR",
        "800004": "OVRH",
        "800005": "OVRH",
        "800006": "OVRH",
        "800007": "MACH",
        "800009": "OVRH",
        "800010": "OVRH",
        "800011": "OVRH",
        "800012": "OVRH",
        "800013": "OVRH",
        "800014": "OVRH"
    };
    var MANUFACTURING_ACCOUNT_META = {
        "800015": {
            category: "MANUFACTURING_FLOW",
            nature: "원재료 투입",
            detail: "제조원가 흐름에 포함되는 원재료비 계정입니다.",
            finalManufacturing: true
        },
        "800016": {
            category: "MFG_RECEIPT",
            nature: "제조입고 차감",
            detail: "제조부서에서 제품/재고로 원가가 이동된 차감 계정입니다.",
            finalManufacturing: true
        },
        "800017": {
            category: "PRODUCTION_CLEARING_RECORD",
            nature: "생산실적 상쇄 기록",
            detail: "생산실적 표준가공비 차감/상쇄 기록 계정입니다.",
            finalManufacturing: false
        },
        "800018": {
            category: "PRODUCTION_CLEARING_RECORD",
            nature: "생산실적 상쇄 기록",
            detail: "생산실적 표준가공비 차감/상쇄 기록 계정입니다.",
            finalManufacturing: false
        },
        "800019": {
            category: "PRODUCTION_CLEARING_RECORD",
            nature: "생산실적 상쇄 기록",
            detail: "생산실적 표준가공비 차감/상쇄 기록 계정입니다.",
            finalManufacturing: false
        },
        "800020": {
            category: "APPLIED_PROCESSING",
            nature: "표준가공비 귀속 - 노무",
            detail: "생산실적 기준 표준가공비가 귀속된 계정입니다.",
            finalManufacturing: true
        },
        "800021": {
            category: "APPLIED_PROCESSING",
            nature: "표준가공비 귀속 - 기계",
            detail: "생산실적 기준 표준가공비가 귀속된 계정입니다.",
            finalManufacturing: true
        },
        "800022": {
            category: "APPLIED_PROCESSING",
            nature: "표준가공비 귀속 - 간접",
            detail: "생산실적 기준 표준가공비가 귀속된 계정입니다.",
            finalManufacturing: true
        },
        "800023": {
            category: "PRICE_DIFF",
            nature: "가격차이",
            detail: "제조원가 기본 합계에서 제외하고 원장/검증 영역에서 확인합니다.",
            finalManufacturing: false
        },
        "800024": {
            category: "MANUFACTURING_FLOW",
            nature: "배부차이",
            detail: "제조원가 흐름에 포함되는 배부차이 계정입니다.",
            finalManufacturing: true
        }
    };
    var CLEARING_VALIDATION_PAIRS = [{
        key: "LABOR",
        label: "노무비",
        clearingAccount: "800017",
        appliedAccount: "800020"
    }, {
        key: "MACH",
        label: "기계경비",
        clearingAccount: "800018",
        appliedAccount: "800021"
    }, {
        key: "OVRH",
        label: "간접비",
        clearingAccount: "800019",
        appliedAccount: "800022"
    }];
    var ACCOUNT_ROLE_MAP = {
        "800015": {
            key: "MATERIAL",
            text: "원재료 투입",
            detail: "제조원가 흐름 포함",
            finalManufacturing: true
        },
        "800016": {
            key: "MANUFACTURING_RECEIPT",
            text: "제조입고 차감",
            detail: "제조부서에서 제품/재고로 원가 이동",
            finalManufacturing: true
        },
        "800017": {
            key: "PRODUCTION_CLEARING_RECORD",
            text: "생산실적 상쇄 기록",
            detail: "800020 노무비배부와 상쇄 검증",
            finalManufacturing: false
        },
        "800018": {
            key: "PRODUCTION_CLEARING_RECORD",
            text: "생산실적 상쇄 기록",
            detail: "800021 기계경비배부와 상쇄 검증",
            finalManufacturing: false
        },
        "800019": {
            key: "PRODUCTION_CLEARING_RECORD",
            text: "생산실적 상쇄 기록",
            detail: "800022 간접비배부와 상쇄 검증",
            finalManufacturing: false
        },
        "800020": {
            key: "APPLIED_PROCESSING",
            text: "표준가공비 귀속 - 노무",
            detail: "생산실적 기준 표준가공비 귀속",
            finalManufacturing: true
        },
        "800021": {
            key: "APPLIED_PROCESSING",
            text: "표준가공비 귀속 - 기계",
            detail: "생산실적 기준 표준가공비 귀속",
            finalManufacturing: true
        },
        "800022": {
            key: "APPLIED_PROCESSING",
            text: "표준가공비 귀속 - 간접",
            detail: "생산실적 기준 표준가공비 귀속",
            finalManufacturing: true
        },
        "800023": {
            key: "PRICE_VARIANCE",
            text: "가격차이",
            detail: "제조원가 기본 합계 제외",
            finalManufacturing: false
        },
        "800024": {
            key: "ALLOCATION_VARIANCE",
            text: "배부차이",
            detail: "실제 분할원가와 표준/귀속 가공비 차이",
            finalManufacturing: true
        }
    };
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
        budget: "ZCDS_E4_CO_0025",
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

    function accountRoleInfo(vAccount) {
        var sAccount = normalizeNodeId(vAccount);
        var iAccount = Number(sAccount);
        var oMapped = ACCOUNT_ROLE_MAP[sAccount];

        if (oMapped) {
            return Object.assign({
                accountRoleKey: oMapped.key,
                accountRoleText: oMapped.text,
                accountRoleDetail: oMapped.detail,
                isFinalManufacturingAccount: !!oMapped.finalManufacturing,
                isSourceActualAccount: false,
                isSplitSourceAccount: false
            }, oMapped);
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
            return {
                accountRoleKey: sAccount === "800008" ? "SOURCE_ACTUAL_EXCLUDED" : "SOURCE_ACTUAL",
                accountRoleText: sAccount === "800008" ? "배부대상 제외 제조비" : "배부대상 제조비",
                accountRoleDetail: sAccount === "800008" ? "현재 기준 배부대상에서 제외" : "활동단가 산출과 배부의 기준 금액",
                isFinalManufacturingAccount: false,
                isSourceActualAccount: true,
                isSplitSourceAccount: sAccount !== "800008"
            };
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800019) {
            return {
                accountRoleKey: "PRODUCTION_ABSORPTION",
                accountRoleText: "생산실적 차감/흡수",
                accountRoleDetail: "일반 배부 원천/수신 제외",
                isFinalManufacturingAccount: false,
                isSourceActualAccount: false,
                isSplitSourceAccount: false
            };
        }

        if (/^7\d+$/.test(sAccount)) {
            return {
                accountRoleKey: "COST_EXPENSE",
                accountRoleText: "비용 계정",
                accountRoleDetail: "부서 비용 기본 합계 포함",
                isFinalManufacturingAccount: false,
                isSourceActualAccount: false,
                isSplitSourceAccount: false
            };
        }

        if (/^9\d+$/.test(sAccount)) {
            return {
                accountRoleKey: "NON_OPERATING_LOSS",
                accountRoleText: "비용 제외 손실",
                accountRoleDetail: "부서 비용 기본 합계에서 제외하고 전체 원장에서 확인",
                isFinalManufacturingAccount: false,
                isSourceActualAccount: false,
                isSplitSourceAccount: false
            };
        }

        return {
            accountRoleKey: "OTHER",
            accountRoleText: "기타",
            accountRoleDetail: "",
            isFinalManufacturingAccount: false,
            isSourceActualAccount: false,
            isSplitSourceAccount: false
        };
    }

    function getManufacturingAccountCategory(vAccount) {
        var sAccount = normalizeNodeId(vAccount);
        var iAccount = Number(sAccount);
        var oMeta = MANUFACTURING_ACCOUNT_META[sAccount];

        if (oMeta) {
            return Object.assign({
                account: sAccount,
                category: oMeta.category,
                accountNature: oMeta.nature,
                accountRoleText: oMeta.nature,
                accountRoleDetail: oMeta.detail,
                description: oMeta.detail,
                activityType: SOURCE_POOL_ACTIVITY_TYPE_MAP[sAccount] || "",
                isFinalManufacturingAccount: !!oMeta.finalManufacturing
            }, oMeta);
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
            return {
                account: sAccount,
                category: sAccount === "800008" ? "EXCLUDED_SOURCE_POOL" : "SOURCE_POOL",
                accountNature: sAccount === "800008" ? "배부대상 제외 제조비" : "배부대상 제조비",
                accountRoleText: sAccount === "800008" ? "배부대상 제외 제조비" : "배부대상 제조비",
                accountRoleDetail: sAccount === "800008" ? "현재 기준 배부대상 합계에서 제외합니다." : "활동단가 산출과 제조비 배부의 기준 금액입니다.",
                description: sAccount === "800008" ? "배부대상 합계에서 제외합니다." : "제조원가 흐름 합계에는 직접 포함하지 않고 배부 기준으로 사용합니다.",
                activityType: SOURCE_POOL_ACTIVITY_TYPE_MAP[sAccount] || "",
                isFinalManufacturingAccount: false
            };
        }

        if (/^7\d+$/.test(sAccount)) {
            return {
                account: sAccount,
                category: "COST_EXPENSE",
                accountNature: "비용 계정",
                accountRoleText: "비용 계정",
                accountRoleDetail: "부서 비용 기본 합계에 포함합니다.",
                description: "비용 분석 기본 화면에 포함되는 비용 계정입니다.",
                activityType: "",
                isFinalManufacturingAccount: false
            };
        }

        if (/^9\d+$/.test(sAccount)) {
            return {
                account: sAccount,
                category: "NON_OPERATING_LOSS",
                accountNature: "비용 제외 손실",
                accountRoleText: "비용 제외 손실",
                accountRoleDetail: "자산 처분 등 손실 계정으로 부서 비용 기본 합계에서 제외합니다.",
                description: "비용 분석 기본 화면에서는 제외하고 전체 계정 원장에서 확인합니다.",
                activityType: "",
                isFinalManufacturingAccount: false
            };
        }

        return {
            account: sAccount,
            category: "OTHER_LEDGER",
            accountNature: "기타 장부 계정",
            accountRoleText: "기타 장부 계정",
            accountRoleDetail: "전체 계정 원장에서 확인합니다.",
            description: "제조원가 흐름 기본 화면에서는 제외합니다.",
            activityType: "",
            isFinalManufacturingAccount: false
        };
    }

    function isManufacturingFlowAccount(vAccount) {
        return !!MANUFACTURING_FLOW_ACCOUNT_MAP[normalizeNodeId(vAccount)];
    }

    function isProductionClearingRecordAccount(vAccount) {
        return !!PRODUCTION_CLEARING_ACCOUNT_MAP[normalizeNodeId(vAccount)];
    }

    function isSourceManufacturingPoolAccount(vAccount) {
        return !!SOURCE_POOL_ACTIVITY_TYPE_MAP[normalizeNodeId(vAccount)];
    }

    function isManufacturingReceiptAccount(vAccount) {
        return normalizeNodeId(vAccount) === "800016";
    }

    function isCostPerspectiveAccount(vAccount) {
        var sAccount = normalizeNodeId(vAccount);

        return !/^9\d+$/.test(sAccount);
    }

    function filterCostPerspectiveRows(aRows, sFieldName) {
        return (aRows || []).filter(function (oRow) {
            return isCostPerspectiveAccount(getField(oRow, sFieldName || "saknr"));
        });
    }

    function isAppliedProcessingAccount(vAccount) {
        return !!APPLIED_PROCESSING_ACCOUNT_MAP[normalizeNodeId(vAccount)];
    }

    function decorateManufacturingAccountRow(oRow) {
        var sAccount = normalizeNodeId(getField(oRow, "saknr"));
        var oMeta = getManufacturingAccountCategory(sAccount);

        return Object.assign({}, oRow, {
            manufacturingCategory: oMeta.category,
            accountNature: oMeta.accountNature,
            accountRoleText: oMeta.accountRoleText,
            accountRoleDetail: oMeta.accountRoleDetail,
            description: oMeta.description,
            activityType: oMeta.activityType || "-",
            isFinalManufacturingAccount: !!oMeta.isFinalManufacturingAccount,
            isManufacturingFlowAccount: isManufacturingFlowAccount(sAccount),
            isProductionClearingRecordAccount: isProductionClearingRecordAccount(sAccount),
            isSourceManufacturingPoolAccount: isSourceManufacturingPoolAccount(sAccount),
            isManufacturingReceiptAccount: isManufacturingReceiptAccount(sAccount),
            isAppliedProcessingAccount: isAppliedProcessingAccount(sAccount)
        });
    }

    function rankAndRatioRows(aRows, sAmountFieldName) {
        var fTotalAbs = (aRows || []).reduce(function (fTotal, oRow) {
            return fTotal + Math.abs(toNumber(getField(oRow, sAmountFieldName || "actualAmount")));
        }, 0);

        return (aRows || []).map(function (oRow, iIndex) {
            var fAmount = toNumber(getField(oRow, sAmountFieldName || "actualAmount"));
            var fRatio = fTotalAbs ? Math.abs(fAmount) / fTotalAbs * 100 : null;

            return Object.assign({}, oRow, {
                rank: iIndex + 1,
                chartAmount: Math.abs(fAmount),
                ratio: fRatio,
                ratioText: fRatio === null ? "-" : Math.round(fRatio * 10) / 10 + "%"
            });
        });
    }

    function buildManufacturingFlowRows(aRows) {
        var aFlowRows = (aRows || []).filter(function (oRow) {
            return isManufacturingFlowAccount(getField(oRow, "saknr"));
        }).map(decorateManufacturingAccountRow).sort(function (oFirst, oSecond) {
            return Math.abs(toNumber(getField(oSecond, "actualAmount"))) - Math.abs(toNumber(getField(oFirst, "actualAmount"))) ||
                clean(getField(oFirst, "saknr")).localeCompare(clean(getField(oSecond, "saknr")));
        });

        return rankAndRatioRows(aFlowRows, "actualAmount");
    }

    function buildSourcePoolRows(aRows) {
        var aPoolRows = (aRows || []).filter(function (oRow) {
            return isSourceManufacturingPoolAccount(getField(oRow, "saknr"));
        }).map(decorateManufacturingAccountRow).sort(function (oFirst, oSecond) {
            return clean(getField(oFirst, "saknr")).localeCompare(clean(getField(oSecond, "saknr")));
        });

        return rankAndRatioRows(aPoolRows, "actualAmount");
    }

    function buildLedgerRows(aRows) {
        var aLedgerRows = (aRows || []).map(decorateManufacturingAccountRow).sort(function (oFirst, oSecond) {
            return Math.abs(toNumber(getField(oSecond, "actualAmount"))) - Math.abs(toNumber(getField(oFirst, "actualAmount"))) ||
                clean(getField(oFirst, "saknr")).localeCompare(clean(getField(oSecond, "saknr")));
        });

        return rankAndRatioRows(aLedgerRows, "actualAmount");
    }

    function buildClearingValidationRows(aRows) {
        var mRowsByAccount = {};

        (aRows || []).forEach(function (oRow) {
            var sAccount = normalizeNodeId(getField(oRow, "saknr"));

            if (sAccount) {
                mRowsByAccount[sAccount] = decorateManufacturingAccountRow(oRow);
            }
        });

        return CLEARING_VALIDATION_PAIRS.map(function (oPair, iIndex) {
            var oClearingRow = mRowsByAccount[oPair.clearingAccount];
            var oAppliedRow = mRowsByAccount[oPair.appliedAccount];
            var fClearingAmount = toNumber(oClearingRow && getField(oClearingRow, "actualAmount"));
            var fAppliedAmount = toNumber(oAppliedRow && getField(oAppliedRow, "actualAmount"));
            var fClearingCurrentAmount = toNumber(oClearingRow && getField(oClearingRow, "currentAmount"));
            var fAppliedCurrentAmount = toNumber(oAppliedRow && getField(oAppliedRow, "currentAmount"));
            var fNetAmount = fClearingAmount + fAppliedAmount;
            var sStatusText = fNetAmount === 0 ? "상쇄 완료" : (Math.abs(fNetAmount) <= 1 ? "반올림 차이" : "차이 있음");

            if (!oClearingRow && !oAppliedRow) {
                return null;
            }

            return {
                rank: iIndex + 1,
                groupKey: oPair.key,
                groupText: oPair.label,
                clearingAccount: oPair.clearingAccount,
                clearingAccountName: oClearingRow ? oClearingRow.saknrTxt : "-",
                clearingAmount: fClearingAmount,
                clearingCurrentAmount: fClearingCurrentAmount,
                appliedAccount: oPair.appliedAccount,
                appliedAccountName: oAppliedRow ? oAppliedRow.saknrTxt : "-",
                appliedAmount: fAppliedAmount,
                appliedCurrentAmount: fAppliedCurrentAmount,
                netAmount: fNetAmount,
                currentNetAmount: fClearingCurrentAmount + fAppliedCurrentAmount,
                statusText: sStatusText,
                statusState: sStatusText === "상쇄 완료" ? "Success" : (sStatusText === "반올림 차이" ? "Information" : "Warning"),
                documentCount: toNumber(oClearingRow && getField(oClearingRow, "documentCount")) + toNumber(oAppliedRow && getField(oAppliedRow, "documentCount"))
            };
        }).filter(Boolean);
    }

    function summarizeRows(aRows) {
        var fActual = sum(aRows, "actualAmount");
        var fCurrent = sum(aRows, "currentAmount");
        var fPrevious = sum(aRows, "previousAmount");
        var fPositive = 0;
        var fNegative = 0;

        (aRows || []).forEach(function (oRow) {
            var fAmount = toNumber(getField(oRow, "actualAmount"));

            if (fAmount > 0) {
                fPositive += fAmount;
            } else if (fAmount < 0) {
                fNegative += fAmount;
            }
        });

        return {
            actualAmount: fActual,
            currentAmount: fCurrent,
            previousAmount: fPrevious,
            momAmount: fCurrent - fPrevious,
            documentCount: sum(aRows, "documentCount"),
            positiveAmount: fPositive,
            negativeAmount: fNegative
        };
    }

    function buildManufacturingFlowSummary(aRows) {
        var aDecoratedRows = (aRows || []).map(decorateManufacturingAccountRow);
        var aInputRows = aDecoratedRows.filter(function (oRow) {
            var sAccount = normalizeNodeId(getField(oRow, "saknr"));

            return isManufacturingFlowAccount(sAccount) && !isManufacturingReceiptAccount(sAccount);
        });
        var aReceiptRows = aDecoratedRows.filter(function (oRow) {
            return isManufacturingReceiptAccount(getField(oRow, "saknr"));
        });
        var aVarianceRows = aDecoratedRows.filter(function (oRow) {
            return normalizeNodeId(getField(oRow, "saknr")) === "800024";
        });
        var fInputAmount = sum(aInputRows, "actualAmount");
        var fReceiptAmount = sum(aReceiptRows, "actualAmount");

        return Object.assign(summarizeRows(aDecoratedRows.filter(function (oRow) {
            return isManufacturingFlowAccount(getField(oRow, "saknr"));
        })), {
            inputAmount: fInputAmount,
            receiptAmount: fReceiptAmount,
            netAmount: fInputAmount + fReceiptAmount,
            allocationVarianceAmount: sum(aVarianceRows, "actualAmount")
        });
    }

    function buildClearingValidationSummary(aRows) {
        return {
            clearingAmount: sum(aRows, "clearingAmount"),
            appliedAmount: sum(aRows, "appliedAmount"),
            netAmount: sum(aRows, "netAmount"),
            currentNetAmount: sum(aRows, "currentNetAmount"),
            documentCount: sum(aRows, "documentCount")
        };
    }

    function isProductionOrgSelection(oSelectedOrg) {
        var sSelectedId = normalizeNodeId(oSelectedOrg && oSelectedOrg.childId);
        var aIds = oSelectedOrg && oSelectedOrg.descendantIds || [];

        if (!sSelectedId) {
            return false;
        }

        return [sSelectedId].concat(aIds).some(function (sId) {
            return normalizeNodeId(sId).indexOf("CC_PP") === 0;
        });
    }

    function isAllocationFlow(oRow) {
        var sType = clean(getField(oRow, "CostFlowType")).toUpperCase();
        var sText = [
            getField(oRow, "CostFlowTypeTxt"),
            getField(oRow, "BlartTxt"),
            getField(oRow, "Bktxt"),
            getField(oRow, "Sgtxt")
        ].map(clean).join(" ");

        return sType === "ALLOC" || sText.indexOf("배부") > -1;
    }

    function isSplitFlow(oRow) {
        var sType = clean(getField(oRow, "CostFlowType")).toUpperCase();
        var sBlart = clean(getField(oRow, "Blart")).toUpperCase();
        var sText = [
            getField(oRow, "CostFlowTypeTxt"),
            getField(oRow, "BlartTxt"),
            getField(oRow, "Bktxt"),
            getField(oRow, "Sgtxt")
        ].map(clean).join(" ");

        return sType === "SPLIT" || sText.indexOf("분할") > -1 || sBlart === "ZA";
    }

    function processStepInfo(vAccount, oRow, oRole) {
        var sAccount = normalizeNodeId(vAccount);
        var iAccount = Number(sAccount);
        var bAllocation = isAllocationFlow(oRow);
        var bSplit = isSplitFlow(oRow);
        var bFinalRelevant = !!(oRole && oRole.isFinalManufacturingAccount);

        if (/^\d+$/.test(sAccount) && iAccount >= 800001 && iAccount <= 800014) {
            if (bSplit && sAccount !== "800008") {
                return {
                    key: "ACTIVITY_SPLIT",
                    text: "활동유형 분할",
                    detail: "800001~800014 중 800008 제외 배부대상 금액 분할",
                    finalManufacturingRelevant: false
                };
            }

            if (bAllocation) {
                return {
                    key: "INTER_DEPT_ALLOCATION",
                    text: "부서 간 배부",
                    detail: "원천 비용 성격을 유지한 책임부서 이동",
                    finalManufacturingRelevant: false
                };
            }

            return {
                key: sAccount === "800008" ? "SOURCE_COST_EXCLUDED" : "SOURCE_COST",
                text: "원천 비용 발생",
                detail: sAccount === "800008" ? "배부대상에서 제외된 제조비" : "실제 발생한 배부대상 제조비",
                finalManufacturingRelevant: false
            };
        }

        if (/^\d+$/.test(sAccount) && iAccount >= 800017 && iAccount <= 800022) {
            return {
                key: "PRODUCTION_ATTRIBUTION",
                text: "생산실적 귀속",
                detail: iAccount >= 800020 ? "표준/생산실적 가공비 귀속" : "생산실적 차감/흡수",
                finalManufacturingRelevant: bFinalRelevant
            };
        }

        if (sAccount === "800023") {
            return {
                key: "PRICE_VARIANCE",
                text: "가격차이",
                detail: "제조원가 메인 합계와 분리 표시",
                finalManufacturingRelevant: false
            };
        }

        if (sAccount === "800024") {
            return {
                key: "ALLOCATION_VARIANCE",
                text: "배부차이",
                detail: "실제 분할원가와 표준/귀속 가공비 차이",
                finalManufacturingRelevant: true
            };
        }

        if (sAccount === "800015" || sAccount === "800016") {
            return {
                key: "FINAL_MFG_COST",
                text: "최종 제조원가 반영",
                detail: sAccount === "800016" ? "제조입고 차감" : "원재료비 반영",
                finalManufacturingRelevant: true
            };
        }

        if (bAllocation) {
            return {
                key: "INTER_DEPT_ALLOCATION",
                text: "부서 간 배부",
                detail: "비용 책임부서 이동",
                finalManufacturingRelevant: false
            };
        }

        return {
            key: "OTHER",
            text: "기타",
            detail: "",
            finalManufacturingRelevant: bFinalRelevant
        };
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

    function normalizeRoleText(sText) {
        var sCleanText = clean(sText).replace(/\s+/g, " ");

        if (sCleanText === "매장 창고") {
            return "매장창고";
        }

        return sCleanText;
    }

    function normalizeTextKey(sText) {
        return normalizeRoleText(sText).replace(/\s+/g, "").toLowerCase();
    }

    function hasTextPart(sText, sPart) {
        var sNormalizedText = normalizeTextKey(sText);
        var sNormalizedPart = normalizeTextKey(sPart);

        return !!sNormalizedText && !!sNormalizedPart && sNormalizedText.indexOf(sNormalizedPart) > -1;
    }

    function buildHierarchyContextMaps(aHierarchyRows) {
        var mNodeById = {};
        var mChildrenByParentId = buildChildrenMap(aHierarchyRows);
        var mLeafByCostCenterId = {};
        var mStoreTexts = {};
        var mRawRoleCounts = {};

        (aHierarchyRows || []).forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));
            var sNodeType = clean(getField(oRow, "node_type"));
            var sRawText = clean(getField(oRow, "node_text"));
            var sRawTextKey = normalizeTextKey(sRawText);

            if (!sChildId) {
                return;
            }

            mNodeById[sChildId] = oRow;

            if (sNodeType === "L") {
                mLeafByCostCenterId[sChildId] = oRow;

                if (sRawTextKey) {
                    mRawRoleCounts[sRawTextKey] = (mRawRoleCounts[sRawTextKey] || 0) + 1;
                }
            }
        });

        Object.keys(mLeafByCostCenterId).forEach(function (sCostCenterId) {
            var oLeafRow = mLeafByCostCenterId[sCostCenterId];
            var sParentId = normalizeNodeId(getField(oLeafRow, "parent_id"));
            var oParentRow = mNodeById[sParentId];
            var sParentText = clean(getField(oParentRow, "node_text"));

            if (sParentText && isUsableTextForCode(sParentText, sCostCenterId)) {
                mStoreTexts[sCostCenterId] = sParentText;
            }
        });

        return {
            nodeById: mNodeById,
            childrenByParentId: mChildrenByParentId,
            leafByCostCenterId: mLeafByCostCenterId,
            storeTexts: mStoreTexts,
            rawRoleCounts: mRawRoleCounts
        };
    }

    function buildCostCenterTextMaps(aHierarchyRows, aActualRows, aDocumentRows) {
        var oHierarchyContext = buildHierarchyContextMaps(aHierarchyRows);
        var mHierarchyTexts = {};
        var mHierarchyManagers = {};
        var mHierarchyStoreTexts = oHierarchyContext.storeTexts || {};
        var mActualTexts = {};
        var mActualStoreTexts = {};
        var mDocumentTexts = {};
        var mDocumentStoreTexts = {};

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
            var sStoreText = clean(getField(oRow, "prctr_txt")) || clean(getField(oRow, "PrctrTxt"));

            if (sKostl && isUsableTextForCode(sText, sKostl)) {
                mActualTexts[sKostl] = sText;
            }

            if (sKostl && isUsableTextForCode(sStoreText, sKostl)) {
                mActualStoreTexts[sKostl] = sStoreText;
            }
        });

        (aDocumentRows || []).forEach(function (oRow) {
            var aPairs = [
                [getField(oRow, "Kostl"), getField(oRow, "KostlTxt")],
                [getField(oRow, "SenderKostl"), getField(oRow, "SenderKostlTxt")],
                [getField(oRow, "ReceiverKostl"), getField(oRow, "ReceiverKostlTxt")]
            ];
            var sReceiverKostl = normalizeNodeId(getField(oRow, "ReceiverKostl"));
            var sReceiverStoreText = clean(getField(oRow, "ReceiverPrctrTxt"));

            aPairs.forEach(function (aPair) {
                var sKostl = normalizeNodeId(aPair[0]);
                var sText = clean(aPair[1]);

                if (sKostl && isUsableTextForCode(sText, sKostl)) {
                    mDocumentTexts[sKostl] = sText;
                }
            });

            if (sReceiverKostl && isUsableTextForCode(sReceiverStoreText, sReceiverKostl)) {
                mDocumentStoreTexts[sReceiverKostl] = sReceiverStoreText;
            }
        });

        return {
            hierarchyContext: oHierarchyContext,
            hierarchyTexts: mHierarchyTexts,
            hierarchyManagers: mHierarchyManagers,
            hierarchyStoreTexts: mHierarchyStoreTexts,
            actualTexts: mActualTexts,
            actualStoreTexts: mActualStoreTexts,
            documentTexts: mDocumentTexts,
            documentStoreTexts: mDocumentStoreTexts,
            rawRoleCounts: oHierarchyContext.rawRoleCounts || {}
        };
    }

    function resolveRawCostCenterText(sKostl, sDirectText, oTextMaps) {
        var sCode = normalizeNodeId(sKostl);
        var oMaps = oTextMaps || {};
        var sCleanDirectText = clean(sDirectText);

        if (isUsableTextForCode(sCleanDirectText, sCode)) {
            return sCleanDirectText;
        }

        return (oMaps.hierarchyTexts && oMaps.hierarchyTexts[sCode]) ||
            (oMaps.documentTexts && oMaps.documentTexts[sCode]) ||
            (oMaps.actualTexts && oMaps.actualTexts[sCode]) ||
            "";
    }

    function resolveExplicitStoreText(sKostl, oTextMaps, oRow) {
        var sCode = normalizeNodeId(sKostl);
        var oMaps = oTextMaps || {};
        var sStoreText = (oMaps.hierarchyStoreTexts && oMaps.hierarchyStoreTexts[sCode]) ||
            (oMaps.documentStoreTexts && oMaps.documentStoreTexts[sCode]) ||
            (oMaps.actualStoreTexts && oMaps.actualStoreTexts[sCode]) ||
            "";
        var sReceiverKostl = normalizeNodeId(getField(oRow, "ReceiverKostl"));
        var sDirectStoreText = clean(getField(oRow, "storeText")) ||
            clean(getField(oRow, "prctr_txt")) ||
            clean(getField(oRow, "PrctrTxt")) ||
            (sReceiverKostl === sCode ? clean(getField(oRow, "ReceiverPrctrTxt")) : "");

        if (!sCode) {
            return "";
        }

        if (sStoreText) {
            return sStoreText;
        }

        return isUsableTextForCode(sDirectStoreText, sCode) ? sDirectStoreText : "";
    }

    function resolveStoreText(sKostl, oTextMaps, sRawText, oRow) {
        var sCode = normalizeNodeId(sKostl);
        var sExplicitStoreText = resolveExplicitStoreText(sCode, oTextMaps, oRow);

        return sExplicitStoreText || clean(sRawText) || sCode || "-";
    }

    function shouldComposeCostCenterDisplay(sKostl, sRawText, sStoreText, oTextMaps, bHasExplicitStoreText) {
        var oMaps = oTextMaps || {};
        var sRawKey = normalizeTextKey(sRawText);
        var mRawRoleCounts = oMaps.rawRoleCounts || {};
        var bHasRoleCountData = Object.keys(mRawRoleCounts).length > 0;

        if (!bHasExplicitStoreText || !sRawText || !sStoreText) {
            return false;
        }

        if (normalizeTextKey(sRawText) === normalizeTextKey(sStoreText) ||
                hasTextPart(sRawText, sStoreText) ||
                hasTextPart(sStoreText, sRawText)) {
            return false;
        }

        return !bHasRoleCountData || (mRawRoleCounts[sRawKey] || 0) > 1;
    }

    function resolveCostCenterContext(sKostl, sDirectText, oTextMaps, oRow) {
        var sCode = normalizeNodeId(sKostl);
        var oMaps = oTextMaps || {};
        var sRawText = resolveRawCostCenterText(sCode, sDirectText, oMaps);
        var sExplicitStoreText = resolveExplicitStoreText(sCode, oMaps, oRow);
        var sStoreText = resolveStoreText(sCode, oMaps, sRawText, oRow);
        var sDisplayText = sRawText || sStoreText || sCode || "-";

        if (shouldComposeCostCenterDisplay(sCode, sRawText, sStoreText, oMaps, !!sExplicitStoreText)) {
            sDisplayText = sStoreText + " " + normalizeRoleText(sRawText);
        } else if (!sRawText && sStoreText) {
            sDisplayText = sStoreText;
        }

        return {
            code: sCode,
            rawCostCenterText: sRawText,
            storeText: sStoreText,
            displayCostCenterText: sDisplayText,
            usesStoreDisplay: !!(sRawText && sStoreText && sDisplayText !== sRawText),
            costCenterTooltip: buildCostCenterTooltip(sRawText, sStoreText, sDisplayText)
        };
    }

    function resolveCostCenterText(sKostl, sDirectText, oTextMaps) {
        return resolveCostCenterContext(sKostl, sDirectText, oTextMaps).displayCostCenterText;
    }

    function resolveOrgSelectionText(oSelectedOrg, oTextMaps) {
        var sCode = normalizeNodeId(oSelectedOrg && oSelectedOrg.childId);
        var oContext;

        if (!oSelectedOrg || !sCode || oSelectedOrg.nodeType !== "L") {
            return oSelectedOrg;
        }

        oContext = resolveCostCenterContext(sCode, oSelectedOrg.rawCostCenterText || oSelectedOrg.nodeText, oTextMaps, oSelectedOrg);

        return Object.assign({}, oSelectedOrg, oContext, {
            nodeText: oContext.displayCostCenterText
        });
    }

    function buildCostCenterTooltip(sRawText, sStoreText, sDisplayText) {
        if (sRawText && sStoreText && normalizeTextKey(sRawText) !== normalizeTextKey(sStoreText) && sDisplayText !== sRawText) {
            return "원 코스트센터명: " + sRawText + "\n상위 점포: " + sStoreText;
        }

        return sDisplayText || sRawText || sStoreText || "-";
    }

    function buildDepartmentHeaderTitle(oSelection) {
        if (!oSelection || !oSelection.childId) {
            return "전체";
        }

        if (oSelection.nodeType === "L" && oSelection.storeText && oSelection.usesStoreDisplay) {
            return oSelection.storeText;
        }

        return oSelection.displayCostCenterText || oSelection.nodeText || oSelection.childId || "-";
    }

    function buildDepartmentPageTitle(oSelection) {
        return buildDepartmentHeaderTitle(oSelection) + " 비용 상세 분석";
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

    function readODataJsonPaged(sUrl, oData, iPageSize) {
        var iSize = iPageSize || 10000;
        var aRows = [];

        function readPage(iSkip) {
            var oPageData = Object.assign({}, oData, {
                $top: iSize
            });

            if (iSkip > 0) {
                oPageData.$skip = iSkip;
            }

            return readODataJson(sUrl, oPageData).then(function (aPageRows) {
                aRows = aRows.concat(aPageRows);

                if (aPageRows.length === iSize) {
                    return readPage(iSkip + iSize);
                }

                return aRows;
            });
        }

        return readPage(0);
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
                saknr: "",
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
        addEqFilterPart(aFilterParts, "saknr", oFilters.saknr);

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
        addEqFilterPart(aFilterParts, "saknr", oFilters.saknr);

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
        addEqFilterPart(aFilterParts, "Saknr", oFilters.saknr);

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.budget + mEntitySets.budget, oRequestData);
    }

    function readHierarchyRows(sSetName) {
        var aFilterParts = [];
        var oRequestData;

        addEqFilterPart(aFilterParts, "setnam", sSetName || "CCSH1000");
        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$top = 10000;

        return readODataJson(SERVICE_URLS.hierarchy + mEntitySets.hierarchy, oRequestData);
    }

    function readDocumentRows(oFilters, bDetailMode, sPeriodScope) {
        var aFilterParts = [];
        var oRequestData;
        var bCumulativeScope = sPeriodScope === "cumulative";

        addEqFilterPart(aFilterParts, "Bukrs", "0001");
        addEqFilterPart(aFilterParts, "Gjahr", oFilters.gjahr);

        if (bDetailMode && !bCumulativeScope) {
            addEqFilterPart(aFilterParts, "Monat", normalizeMonth(oFilters.period));
        } else {
            addLeFilterPart(aFilterParts, "Monat", normalizeMonth(oFilters.period));
        }

        if (oFilters.saknr) {
            addEqFilterPart(aFilterParts, "Saknr", oFilters.saknr);
        }

        oRequestData = createRequestDataWithFilter(aFilterParts);
        oRequestData.$orderby = "Bukrs,Gjahr,Monat,Kostl,Belnr,Docln";

        if (!bDetailMode) {
            oRequestData.$select = "Bukrs,Gjahr,Belnr,Docln,Monat,Kostl,KostlTxt,SenderKostl,SenderKostlTxt,ReceiverKostl,ReceiverKostlTxt,ReceiverPrctr,ReceiverPrctrTxt,Saknr,Amount";
        }

        return readODataJsonPaged(SERVICE_URLS.document + mEntitySets.document, oRequestData, 10000);
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

    function mapHierarchyRowToOption(oRow, mChildrenByParent, oTextMaps) {
        var sChildId = normalizeNodeId(getField(oRow, "child_id"));
        var iLevel = Math.max(0, Number(getField(oRow, "hlevel") || 1) - 1);
        var sRawNodeText = clean(getField(oRow, "node_text")) || sChildId;
        var sNodeType = clean(getField(oRow, "node_type"));
        var aChildren = mChildrenByParent && mChildrenByParent[sChildId] || [];
        var oContext = sNodeType === "L" ? resolveCostCenterContext(sChildId, sRawNodeText, oTextMaps) : {};
        var sNodeText = sNodeType === "L" ? oContext.displayCostCenterText : sRawNodeText;

        return {
            childId: sChildId,
            nodeText: sNodeText,
            rawCostCenterText: oContext.rawCostCenterText || (sNodeType === "L" ? sRawNodeText : ""),
            storeText: oContext.storeText || "",
            displayCostCenterText: oContext.displayCostCenterText || sNodeText,
            usesStoreDisplay: !!oContext.usesStoreDisplay,
            costCenterTooltip: oContext.costCenterTooltip || sNodeText,
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
        var oTextMaps = buildCostCenterTextMaps(aHierarchyRows, [], []);

        return aOrderedRows.map(function (oRow) {
            return mapHierarchyRowToOption(oRow, mChildrenByParent, oTextMaps);
        });
    }

    function buildHierarchyOptionTree(aHierarchyRows) {
        var mChildrenByParent = buildChildrenMap(aHierarchyRows);
        var aOrderedRows = orderHierarchyRows(aHierarchyRows, mChildrenByParent);
        var oTextMaps = buildCostCenterTextMaps(aHierarchyRows, [], []);
        var mNodes = {};
        var aRoots = [];
        var mHasParent = {};

        aOrderedRows.forEach(function (oRow) {
            var sChildId = normalizeNodeId(getField(oRow, "child_id"));

            if (sChildId) {
                mNodes[sChildId] = mapHierarchyRowToOption(oRow, mChildrenByParent, oTextMaps);
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
                clean(oNode.rawCostCenterText).toLowerCase().indexOf(sNormalizedQuery) > -1 ||
                clean(oNode.storeText).toLowerCase().indexOf(sNormalizedQuery) > -1 ||
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
                rawCostCenterText: "",
                storeText: sNormalizedOrgId,
                displayCostCenterText: sNormalizedOrgId,
                usesStoreDisplay: false,
                costCenterTooltip: sNormalizedOrgId,
                manager: "",
                hlevel: 0,
                descendantIds: [sNormalizedOrgId],
                nodeType: "L"
            };
        }

        return {
            childId: "",
            nodeText: "",
            rawCostCenterText: "",
            storeText: "",
            displayCostCenterText: "",
            usesStoreDisplay: false,
            costCenterTooltip: "",
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

    function buildDocumentKey(oRow, aKeyFields) {
        return (aKeyFields || ["Bukrs", "Gjahr", "Belnr"]).map(function (sFieldName) {
            return clean(getField(oRow, sFieldName));
        }).join("|");
    }

    function distinctDocumentCount(aRows, aKeyFields) {
        var mDocuments = {};

        (aRows || []).forEach(function (oRow) {
            var sKey = buildDocumentKey(oRow, aKeyFields);

            if (sKey.replace(/\|/g, "")) {
                mDocuments[sKey] = true;
            }
        });

        return Object.keys(mDocuments).length;
    }

    function documentCountsByField(aRows, sFieldName, aKeyFields) {
        var mCounts = {};
        var mDocsByGroup = {};

        (aRows || []).forEach(function (oRow) {
            var sGroupKey = normalizeNodeId(getField(oRow, sFieldName));
            var sDocKey = buildDocumentKey(oRow, aKeyFields);

            if (!sGroupKey || !sDocKey.replace(/\|/g, "")) {
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
        return documentCountsByField(aRows, "Monat", COST_DOCUMENT_KEY_FIELDS);
    }

    function distinctCostDocumentCount(aRows) {
        return distinctDocumentCount(aRows, COST_DOCUMENT_KEY_FIELDS);
    }

    function costDocumentCountsByField(aRows, sFieldName) {
        return documentCountsByField(aRows, sFieldName, COST_DOCUMENT_KEY_FIELDS);
    }

    function currentDocumentRows(aRows, sPeriod) {
        var sNormalizedPeriod = normalizeMonth(sPeriod);

        return (aRows || []).filter(function (oRow) {
            return normalizeMonth(getField(oRow, "Monat")) === sNormalizedPeriod;
        });
    }

    function uniqueNormalizedValues(aRows, sFieldName) {
        var mValues = {};

        (aRows || []).forEach(function (oRow) {
            var sValue = normalizeNodeId(getField(oRow, sFieldName));

            if (sValue) {
                mValues[sValue] = true;
            }
        });

        return Object.keys(mValues);
    }

    function textOrCode(sText, sCode) {
        var sCleanText = clean(sText);
        var sCleanCode = clean(sCode);

        if (sCleanText && sCleanCode && sCleanText !== sCleanCode) {
            return sCleanCode + " " + sCleanText;
        }

        return sCleanText || sCleanCode || "-";
    }

    function getFunctionalAreaKey(oRow) {
        return normalizeNodeId(getField(oRow, "fkber") || getField(oRow, "FKBER"));
    }

    function getFunctionalAreaText(oRow) {
        return clean(getField(oRow, "fkber_txt")) ||
            clean(getField(oRow, "fkbtx")) ||
            clean(getField(oRow, "fkberTxt")) ||
            clean(getField(oRow, "FkberTxt")) ||
            clean(getField(oRow, "FKBER_TXT")) ||
            clean(getField(oRow, "FKBTX"));
    }

    function hasFunctionalAreaField(aRows) {
        return (aRows || []).some(function (oRow) {
            return !!getFunctionalAreaKey(oRow);
        });
    }

    function costCenterContextByKostl(aRows) {
        var mRows = {};

        (aRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl") || getField(oRow, "Kostl"));

            if (!sKostl || mRows[sKostl]) {
                return;
            }

            mRows[sKostl] = {
                prctr: normalizeNodeId(getField(oRow, "prctr")),
                prctrTxt: clean(getField(oRow, "prctr_txt")),
                segment: clean(getField(oRow, "segment")),
                segmentTxt: clean(getField(oRow, "segment_txt")),
                fkber: getFunctionalAreaKey(oRow),
                fkberTxt: getFunctionalAreaText(oRow)
            };
        });

        return mRows;
    }

    function filterDocumentsByCostCenters(aDocumentRows, aActualRows) {
        var mKostls = {};

        (aActualRows || []).forEach(function (oRow) {
            var sKostl = normalizeNodeId(getField(oRow, "kostl"));

            if (sKostl) {
                mKostls[sKostl] = true;
            }
        });

        if (!Object.keys(mKostls).length) {
            return [];
        }

        return (aDocumentRows || []).filter(function (oRow) {
            return !!mKostls[normalizeNodeId(getField(oRow, "Kostl"))];
        });
    }

    function buildAccountValueHelpRows(aDocumentRows) {
        var mAccounts = {};

        (aDocumentRows || []).forEach(function (oRow) {
            var sSaknr = normalizeNodeId(getField(oRow, "Saknr"));
            var sSaknrTxt = clean(getField(oRow, "SaknrTxt")) || "-";
            var sKtoks = clean(getField(oRow, "Ktoks"));
            var sKtoksTxt = clean(getField(oRow, "KtoksTxt")) || "-";
            var oRole = accountRoleInfo(sSaknr);

            if (!sSaknr || mAccounts[sSaknr]) {
                return;
            }

            mAccounts[sSaknr] = {
                saknr: sSaknr,
                saknrTxt: sSaknrTxt,
                ktoks: sKtoks,
                ktoksTxt: sKtoksTxt,
                accountRoleKey: oRole.accountRoleKey,
                accountRoleText: oRole.accountRoleText,
                accountRoleDetail: oRole.accountRoleDetail,
                displayText: sSaknr + " " + sSaknrTxt,
                searchText: [sSaknr, sSaknrTxt, sKtoksTxt, oRole.accountRoleText, oRole.accountRoleDetail].join(" ").toLowerCase()
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
            var oContext = oNode.nodeType === "L" ? resolveCostCenterContext(oNode.childId, oNode.rawCostCenterText || oNode.nodeText, mTextMaps, oNode) : {};
            var sNodeText = oNode.nodeType === "L" ? oContext.displayCostCenterText : (oNode.nodeText || oNode.childId);

            return Object.assign({}, oNode, oContext, {
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
            var oRole = accountRoleInfo(sSaknr);

            if (!mGroups[sKey]) {
                mGroups[sKey] = {
                    saknr: sSaknr,
                    accountName: sSaknrTxt,
                    accountLabel: sSaknrTxt,
                    includedSaknrs: [sSaknr],
                    accountRoleKey: oRole.accountRoleKey,
                    accountRoleText: oRole.accountRoleText,
                    accountRoleDetail: oRole.accountRoleDetail,
                    isFinalManufacturingAccount: oRole.isFinalManufacturingAccount,
                    isSourceActualAccount: oRole.isSourceActualAccount,
                    isSplitSourceAccount: oRole.isSplitSourceAccount,
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
                accountRoleKey: "MIXED",
                accountRoleText: "복합",
                accountRoleDetail: "여러 계정 성격 포함",
                isFinalManufacturingAccount: false,
                isSourceActualAccount: false,
                isSplitSourceAccount: false,
                amount: fEtcAmount
            });
        }

        return aTopGroups.map(function (oGroup) {
            var fRatio = fTotal ? Math.abs(oGroup.amount) / fTotal * 100 : 0;

            return Object.assign(oGroup, {
                chartAmount: Math.abs(oGroup.amount || 0),
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
        var mCostCenterContext = costCenterContextByKostl(aActualRows);
        var mBudget = {};
        var mCurrent = {};
        var mPrevious = {};
        var bHasPreviousRows = (aPreviousRows || []).length > 0;
        var mDocuments = costDocumentCountsByField(aDocumentRows, "Kostl");
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
            var oContext;

            if (!sKostl) {
                return;
            }

            if (!mRows[sKostl]) {
                oContext = resolveCostCenterContext(sKostl, getField(oRow, "kostl_txt"), mTextMaps, oRow);
                mRows[sKostl] = {
                    kostl: sKostl,
                    kostlTxt: oContext.displayCostCenterText,
                    rawCostCenterText: oContext.rawCostCenterText,
                    storeText: oContext.storeText,
                    displayCostCenterText: oContext.displayCostCenterText,
                    usesStoreDisplay: oContext.usesStoreDisplay,
                    costCenterTooltip: oContext.costCenterTooltip,
                    manager: mTextMaps.hierarchyManagers[sKostl] || "-",
                    prctr: "",
                    prctrTxt: "",
                    segment: "",
                    segmentTxt: "",
                    fkber: "",
                    fkberTxt: "",
                    actualAmount: 0
                };
            }

            if (!mRows[sKostl].prctr && normalizeNodeId(getField(oRow, "prctr"))) {
                mRows[sKostl].prctr = normalizeNodeId(getField(oRow, "prctr"));
                mRows[sKostl].prctrTxt = clean(getField(oRow, "prctr_txt"));
            }

            if (!mRows[sKostl].segment && clean(getField(oRow, "segment"))) {
                mRows[sKostl].segment = clean(getField(oRow, "segment"));
                mRows[sKostl].segmentTxt = clean(getField(oRow, "segment_txt"));
            }

            if (!mRows[sKostl].fkber && getFunctionalAreaKey(oRow)) {
                mRows[sKostl].fkber = getFunctionalAreaKey(oRow);
                mRows[sKostl].fkberTxt = getFunctionalAreaText(oRow);
            }

            mRows[sKostl].actualAmount += toNumber(getField(oRow, "amount"));
        });

        return Object.keys(mRows).map(function (sKostl) {
            var oRow = mRows[sKostl];
            var oCostCenterContext = mCostCenterContext[sKostl] || {};
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
                prctr: oRow.prctr || oCostCenterContext.prctr || "",
                prctrTxt: oRow.prctrTxt || oCostCenterContext.prctrTxt || "",
                prctrDisplayText: textOrCode(oRow.prctrTxt || oCostCenterContext.prctrTxt, oRow.prctr || oCostCenterContext.prctr),
                segment: oRow.segment || oCostCenterContext.segment || "",
                segmentTxt: oRow.segmentTxt || oCostCenterContext.segmentTxt || "",
                segmentDisplayText: textOrCode(oRow.segmentTxt || oCostCenterContext.segmentTxt, oRow.segment || oCostCenterContext.segment),
                fkber: oRow.fkber || oCostCenterContext.fkber || "",
                fkberTxt: oRow.fkberTxt || oCostCenterContext.fkberTxt || "",
                fkberDisplayText: textOrCode(oRow.fkberTxt || oCostCenterContext.fkberTxt, oRow.fkber || oCostCenterContext.fkber),
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
        var fTotalAbs = (aActualRows || []).reduce(function (fAmount, oRow) {
            return fAmount + Math.abs(toNumber(getField(oRow, "amount")));
        }, 0);
        var mBudget = {};
        var mCurrent = {};
        var mPrevious = {};
        var bHasPreviousRows = (aPreviousRows || []).length > 0;
        var mDocuments = costDocumentCountsByField(aDocumentRows, "Saknr");
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
                var oRole = accountRoleInfo(sSaknr);
                mRows[sSaknr] = {
                    saknr: sSaknr,
                    saknrTxt: clean(getField(oRow, "saknr_txt")) || sSaknr,
                    ktoksTxt: clean(getField(oRow, "ktoks_txt")) || "-",
                    accountRoleKey: oRole.accountRoleKey,
                    accountRoleText: oRole.accountRoleText,
                    accountRoleDetail: oRole.accountRoleDetail,
                    isFinalManufacturingAccount: oRole.isFinalManufacturingAccount,
                    isSourceActualAccount: oRole.isSourceActualAccount,
                    isSplitSourceAccount: oRole.isSplitSourceAccount,
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
                chartAmount: Math.abs(oRow.actualAmount || 0),
                ratio: fTotalAbs ? Math.abs(oRow.actualAmount || 0) / fTotalAbs * 100 : null,
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
            var sSaknr = normalizeNodeId(getField(oRow, "Saknr"));
            var oAccountRole = accountRoleInfo(sSaknr);
            var oProcessStep = processStepInfo(sSaknr, oRow, oAccountRole);
            var oKostlContext = resolveCostCenterContext(sKostl, getField(oRow, "KostlTxt"), oTextMaps, oRow);
            var oSenderContext = resolveCostCenterContext(sSenderKostl, getField(oRow, "SenderKostlTxt"), oTextMaps, oRow);
            var oReceiverContext = resolveCostCenterContext(sReceiverKostl, getField(oRow, "ReceiverKostlTxt"), oTextMaps, oRow);

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
                Saknr: sSaknr,
                SaknrTxt: clean(getField(oRow, "SaknrTxt")),
                KtoksTxt: clean(getField(oRow, "KtoksTxt")),
                AccountRoleKey: oAccountRole.accountRoleKey,
                AccountRoleText: oAccountRole.accountRoleText,
                AccountRoleDetail: oAccountRole.accountRoleDetail,
                IsFinalManufacturingAccount: oAccountRole.isFinalManufacturingAccount,
                IsSourceActualAccount: oAccountRole.isSourceActualAccount,
                IsSplitSourceAccount: oAccountRole.isSplitSourceAccount,
                ProcessStepKey: oProcessStep.key,
                ProcessStepText: oProcessStep.text,
                ProcessStepDetail: oProcessStep.detail,
                FinalManufacturingRelevantText: oProcessStep.finalManufacturingRelevant ? "반영" : "미반영",
                Drcrk: clean(getField(oRow, "Drcrk")),
                DrcrkTxt: clean(getField(oRow, "DrcrkTxt")),
                CostFlowType: clean(getField(oRow, "CostFlowType")),
                CostFlowTypeTxt: clean(getField(oRow, "CostFlowTypeTxt")),
                Kostl: sKostl,
                KostlTxt: oKostlContext.displayCostCenterText,
                RawCostCenterText: oKostlContext.rawCostCenterText,
                StoreText: oKostlContext.storeText,
                DisplayCostCenterText: oKostlContext.displayCostCenterText,
                UsesStoreDisplay: oKostlContext.usesStoreDisplay,
                KostlTooltip: oKostlContext.costCenterTooltip,
                Manager: clean(getField(oRow, "Manager")) || (oTextMaps && oTextMaps.hierarchyManagers && oTextMaps.hierarchyManagers[sKostl]) || "-",
                Partner: clean(getField(oRow, "Partner")),
                PartnerName: clean(getField(oRow, "PartnerName")),
                Sgtxt: clean(getField(oRow, "Sgtxt")),
                Amount: toNumber(getField(oRow, "Amount")),
                RawAmount: toNumber(getField(oRow, "RawAmount")),
                Waers: clean(getField(oRow, "Waers")) || CURRENCY,
                SenderKostl: sSenderKostl,
                SenderKostlTxt: oSenderContext.displayCostCenterText,
                SenderRawCostCenterText: oSenderContext.rawCostCenterText,
                SenderStoreText: oSenderContext.storeText,
                SenderDisplayCostCenterText: oSenderContext.displayCostCenterText,
                SenderUsesStoreDisplay: oSenderContext.usesStoreDisplay,
                SenderKostlTooltip: oSenderContext.costCenterTooltip,
                SenderManager: clean(getField(oRow, "SenderManager")) || (oTextMaps && oTextMaps.hierarchyManagers && oTextMaps.hierarchyManagers[sSenderKostl]) || "-",
                ReceiverKostl: sReceiverKostl,
                ReceiverKostlTxt: oReceiverContext.displayCostCenterText,
                ReceiverRawCostCenterText: oReceiverContext.rawCostCenterText,
                ReceiverStoreText: oReceiverContext.storeText,
                ReceiverDisplayCostCenterText: oReceiverContext.displayCostCenterText,
                ReceiverUsesStoreDisplay: oReceiverContext.usesStoreDisplay,
                ReceiverKostlTooltip: oReceiverContext.costCenterTooltip,
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
        resolveCostCenterContext: resolveCostCenterContext,
        resolveRawCostCenterText: resolveRawCostCenterText,
        resolveStoreText: resolveStoreText,
        resolveCostCenterText: resolveCostCenterText,
        resolveOrgSelectionText: resolveOrgSelectionText,
        buildDepartmentPageTitle: buildDepartmentPageTitle,
        buildDepartmentHeaderTitle: buildDepartmentHeaderTitle,
        normalizeTextKey: normalizeTextKey,
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
        hasFunctionalAreaField: hasFunctionalAreaField,
        getFunctionalAreaKey: getFunctionalAreaKey,
        getFunctionalAreaText: getFunctionalAreaText,
        filterDocumentsByCostCenters: filterDocumentsByCostCenters,
        uniqueNormalizedValues: uniqueNormalizedValues,
        textOrCode: textOrCode,
        costCenterContextByKostl: costCenterContextByKostl,
        aggregateCostCenters: aggregateCostCenters,
        aggregateAccounts: aggregateAccounts,
        getManufacturingAccountCategory: getManufacturingAccountCategory,
        isManufacturingFlowAccount: isManufacturingFlowAccount,
        isProductionClearingRecordAccount: isProductionClearingRecordAccount,
        isSourceManufacturingPoolAccount: isSourceManufacturingPoolAccount,
        isManufacturingReceiptAccount: isManufacturingReceiptAccount,
        isCostPerspectiveAccount: isCostPerspectiveAccount,
        filterCostPerspectiveRows: filterCostPerspectiveRows,
        buildManufacturingFlowRows: buildManufacturingFlowRows,
        buildClearingValidationRows: buildClearingValidationRows,
        buildSourcePoolRows: buildSourcePoolRows,
        buildLedgerRows: buildLedgerRows,
        buildManufacturingFlowSummary: buildManufacturingFlowSummary,
        buildClearingValidationSummary: buildClearingValidationSummary,
        summarizeRows: summarizeRows,
        isProductionOrgSelection: isProductionOrgSelection,
        distinctDocumentCount: distinctDocumentCount,
        distinctCostDocumentCount: distinctCostDocumentCount,
        documentCountsByField: documentCountsByField,
        costDocumentCountsByField: costDocumentCountsByField,
        documentCountsByMonth: documentCountsByMonth,
        currentDocumentRows: currentDocumentRows,
        mapDocumentRows: mapDocumentRows,
        sum: sum,
        clean: clean,
        accountRoleInfo: accountRoleInfo,
        processStepInfo: processStepInfo,
        normalizeMonth: normalizeMonth,
        normalizeNodeId: normalizeNodeId,
        getField: getField
    };
});
