sap.ui.define([
    "sap/ui/core/format/NumberFormat"
], function (NumberFormat) {
    "use strict";

    var oAmountFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 0,
        maxFractionDigits: 2
    });

    var oRateFormat = NumberFormat.getFloatInstance({
        groupingEnabled: true,
        minFractionDigits: 1,
        maxFractionDigits: 1
    });

    function toNumber(vValue) {
        if (vValue === null || vValue === undefined || vValue === "") {
            return null;
        }

        var fValue = Number(vValue);

        return isNaN(fValue) ? null : fValue;
    }

    function cleanText(vValue) {
        return vValue === null || vValue === undefined ? "" : String(vValue).trim();
    }

    function isAllocationFlow(sType, sText, sDocumentTypeText) {
        var sNormalizedType = cleanText(sType).toUpperCase();
        var sNormalizedText = cleanText(sText);
        var sNormalizedDocumentTypeText = cleanText(sDocumentTypeText);

        return sNormalizedType === "ALLOC" ||
            sNormalizedText.indexOf("배부") > -1 ||
            sNormalizedDocumentTypeText.indexOf("배부") > -1;
    }

    return {
        amount: function (vValue) {
            var fValue = toNumber(vValue);

            if (fValue === null) {
                return "-";
            }

            return oAmountFormat.format(fValue);
        },

        amountWithCurrency: function (vValue, sCurrency) {
            var fValue = toNumber(vValue);

            if (fValue === null) {
                return "-";
            }

            return oAmountFormat.format(fValue) + " " + (sCurrency || "KRW");
        },

        rate: function (vValue) {
            var fValue = toNumber(vValue);

            if (fValue === null) {
                return "-";
            }

            return oRateFormat.format(fValue) + "%";
        },

        month: function (sMonth) {
            if (!sMonth) {
                return "-";
            }

            return String(sMonth).padStart(2, "0") + "월";
        },

        valueStateByVariance: function (vValue, bHasBudget) {
            var fValue = toNumber(vValue);

            if (!bHasBudget || fValue === null || fValue === 0) {
                return "None";
            }

            return fValue > 0 ? "Error" : "Success";
        },

        valueStateByDelta: function (vValue) {
            var fValue = toNumber(vValue);

            if (fValue === null || fValue === 0) {
                return "None";
            }

            return fValue > 0 ? "Error" : "Success";
        },

        amountState: function (vValue) {
            var fValue = toNumber(vValue);

            if (fValue === null || fValue === 0) {
                return "None";
            }

            return fValue < 0 ? "Error" : "Information";
        },

        countState: function (vValue) {
            var fValue = toNumber(vValue);

            return fValue > 0 ? "Information" : "None";
        },

        empty: function (vValue) {
            if (vValue === null || vValue === undefined || String(vValue).trim() === "") {
                return "-";
            }

            return String(vValue);
        },

        skfUnitText: function (vValue) {
            var sValue = vValue === null || vValue === undefined ? "" : String(vValue).trim();
            var sCompact = sValue.replace(/\s/g, "");

            if (sCompact === "세대구성원수" || sCompact === "구성원수") {
                return "명";
            }

            return sValue;
        },

        compactAmount: function (vValue) {
            var fValue = toNumber(vValue);

            if (fValue === null) {
                return "-";
            }

            if (Math.abs(fValue) >= 100000000) {
                return oRateFormat.format(fValue / 100000000) + "억";
            }

            if (Math.abs(fValue) >= 1000000) {
                return oRateFormat.format(fValue / 1000000) + "M";
            }

            return oAmountFormat.format(fValue);
        },

        date: function (vValue) {
            var sValue;
            var oDate;
            var aMatch;

            if (!vValue) {
                return "-";
            }

            if (vValue instanceof Date) {
                oDate = vValue;
            } else {
                sValue = String(vValue).trim();
            }

            if (!oDate && !sValue) {
                return "-";
            }

            if (!oDate && /^\d{8}$/.test(sValue)) {
                return sValue.slice(0, 4) + "." + sValue.slice(4, 6) + "." + sValue.slice(6, 8);
            }

            if (!oDate) {
                aMatch = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(sValue);

                if (aMatch) {
                    oDate = new Date(Number(aMatch[1]));
                } else {
                    oDate = new Date(sValue);
                }
            }

            if (!oDate || isNaN(oDate.getTime())) {
                return "-";
            }

            return oDate.getFullYear() + "." +
                String(oDate.getMonth() + 1).padStart(2, "0") + "." +
                String(oDate.getDate()).padStart(2, "0");
        },

        documentStatus: function (vValue) {
            var sValue = vValue === null || vValue === undefined ? "" : String(vValue).trim();

            if (!sValue) {
                return "None";
            }

            return sValue.indexOf("취소") > -1 || sValue.indexOf("오류") > -1 ? "Error" : "None";
        },

        documentFlowText: function (sType, sText, sDrcrk, sDocumentTypeText) {
            if (isAllocationFlow(sType, sText, sDocumentTypeText)) {
                if (sDrcrk === "H") {
                    return "비용 배부(송신)";
                }

                if (sDrcrk === "S") {
                    return "비용 배부(수신)";
                }

                return "비용 배부";
            }

            return "비용 발생";
        },

        documentFlowState: function (sType, sText, sDrcrk, sDocumentTypeText) {
            if (isAllocationFlow(sType, sText, sDocumentTypeText)) {
                return sDrcrk === "H" ? "Warning" : "Information";
            }

            return "Success";
        },

        costFlowTypeState: function (vValue) {
            var sValue = cleanText(vValue);

            if (sValue.indexOf("배부") > -1) {
                return "Information";
            }

            if (sValue.indexOf("발생") > -1) {
                return "Success";
            }

            return "None";
        },

        drcrkText: function (vValue, sText) {
            if (sText) {
                return sText;
            }

            if (vValue === "S") {
                return "차변";
            }

            if (vValue === "H") {
                return "대변";
            }

            return "-";
        }
    };
});
